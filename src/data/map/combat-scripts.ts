/**
 * Forced Battle Events — GLOBAL scripted-combat registry (mechanism is CORE).
 *
 * A CombatScript attaches SCRIPTED EVENTS to the combat fought on a particular
 * MAP FIELD (keyed by the field's location id). At combat-start / a configured
 * round-start the engine hook (`src/engine/combat-scripts.ts`) runs the script's
 * effects: a combat-long environment stat modifier, an effect-damage pulse,
 * pre-placed Combat Obstacles, or a plain feed announcement.
 *
 * V1 is FULLY AUTOMATIC: no script effect opens a player window or choice (the
 * deliberate anti-freeze design — see docs/anime-mod-plan.md §3.12). Every event
 * ALSO announces itself in the event log so players SEE something happen.
 *
 * This file owns NO scripts. Content packages (Anime/Ninefold today; future
 * isekai lairs and campaign set-pieces as data) REGISTER definitions into this
 * catalog — the mechanism/content split mirrors Field Overrides
 * (`src/data/map/field-overrides.ts`).
 */

import type { AnimeModOptions, UnitType } from "@/engine/state";

/** Bilingual label / feed line (EN primary + Vietnamese flavor). */
export type CombatScriptText = { en: string; vi: string };

/**
 * Which side of the fight an effect targets. In a NEUTRAL combat the fought
 * hero is the "attacker" and the Neutral guards are the "defender".
 */
export type CombatScriptSide = "attacker" | "defender" | "both";

/**
 * The V1 ScriptEffect vocabulary. Only kinds with a proven engine seam ship:
 *  - environment-stat → combat-shell stat modifier (mirrors the Crag Hack
 *    `proclamationGroundAttackBonus` combat-long buff), read live at attack/
 *    defense resolution.
 *  - damage-pulse → effect damage through the normal removal path (mirrors the
 *    Astral Spirit `applyElementalScourge`).
 *  - place-obstacles → push empty cells into `combat.obstacles` (movement is
 *    already obstacle-aware).
 *  - announce → pure feed-line flavor (every event announces anyway).
 */
export type CombatScriptEffect =
  | {
      kind: "environment-stat";
      side: CombatScriptSide;
      /** Restrict to one unit type (e.g. only ranged units). Omit = every unit. */
      unitType?: UnitType;
      stat: "attack" | "defense";
      /** Signed combat-long delta folded into every matching unit's stat. */
      amount: number;
    }
  | {
      kind: "damage-pulse";
      /** Which side's living units take the pulse. */
      side: "attacker" | "defender";
      /** Effect damage dealt to each of that side's units (> 0). */
      amount: number;
    }
  | {
      kind: "place-obstacles";
      /** Candidate board cells (0–19). Only the currently EMPTY ones are used. */
      cells: number[];
      /** Cap on how many obstacles to place (default = every empty candidate). */
      count?: number;
    }
  | {
      /**
       * Heal N damage on each LIVING unit of a side. Never restores a shed boss
       * health BAR (`armyStacks` is untouched) — a boss can only ever mend the
       * bar it is standing on.
       */
      kind: "side-heal";
      side: "attacker" | "defender";
      amount: number;
      /** Only units carrying `bossUnit` (the layered monster), never the escort. */
      bossOnly?: boolean;
    }
  | {
      /**
       * Place `count` obstacles on seeded-random EMPTY cells (0–19). Unlike
       * `place-obstacles` the designer names no cells: the pass shuffles the
       * currently-empty set with a per-(combat, round) seed, so it is
       * deterministic for every client and unrerollable.
       */
      kind: "random-obstacle";
      count: number;
    }
  | {
      /**
       * Pure flavor. The event's `announce` line is the whole effect — no
       * mechanical change. Always available; listed as a kind for completeness.
       */
      kind: "announce";
    };

export type CombatScriptEvent = {
  at: "combat-start" | "round-start";
  /** 1-based combat round for a "round-start" event (ignored for combat-start). */
  round?: number;
  effects: CombatScriptEffect[];
  /** Bilingual feed line shown whenever this event fires. */
  announce: CombatScriptText;
};

export type CombatScriptDefinition = {
  id: string;
  name: CombatScriptText;
  /**
   * The fought field's location id that triggers this script (must exist in
   * locationDefinitions). OPTIONAL only when `scope` is set — a scoped script is
   * selected by encounter identity, never by the field it happens to stand on.
   */
  locationId?: string;
  /**
   * Selection scope. Omitted = the classic LOCATION-keyed script
   * (`combatScriptsForLocation`). `"pve-encounter"` = chosen by the optional PvE
   * director instead (`pveEncounterScriptsForCombat`, keyed on the raid boss's
   * def id or the dungeon floor band) — because every rift lair shares the
   * `rift_lair` location and every floor the `dungeon_gate` one, so a
   * location-keyed script would fire identically on every boss and every floor.
   * A scoped script is NEVER returned by `combatScriptsForLocation`.
   */
  scope?: "pve-encounter";
  /**
   * Anime module gate. Omit for a core (always-on) script. Anime combat scripts
   * use the `"combatEvents"` content flag (LEGACY SEMANTICS — absent === ON;
   * gated on `enabled && combatEvents !== false` in `scriptModuleActive`), so the
   * Forced Battle Events system can be turned off independently of the anime
   * locations it attaches to. See `docs/anime-mod-plan.md` §3.12.
   */
  requiresModule?: keyof AnimeModOptions;
  events: CombatScriptEvent[];
  summary: string;
};

/** Mutable registry — packages call {@link registerCombatScriptDefinitions}. */
const REGISTRY: Record<string, CombatScriptDefinition> = {};

export function registerCombatScriptDefinitions(
  defs: Record<string, CombatScriptDefinition> | CombatScriptDefinition[]
): void {
  const list = Array.isArray(defs) ? defs : Object.values(defs);
  for (const def of list) {
    REGISTRY[def.id] = def;
  }
}

export function getCombatScriptDefinition(id: string): CombatScriptDefinition | undefined {
  return REGISTRY[id];
}

export function listCombatScriptDefinitions(): CombatScriptDefinition[] {
  return Object.values(REGISTRY);
}

/**
 * Every script attached to a fought field's location id (usually 0 or 1; the
 * registry supports several on one location — Bí Cảnh ships two). Order is
 * registration order.
 */
export function combatScriptsForLocation(
  locationId: string | null | undefined
): CombatScriptDefinition[] {
  if (!locationId) {
    return [];
  }
  // `!def.scope` keeps every PvE-encounter script out of the location path even
  // if one ever also carries a locationId.
  return Object.values(REGISTRY).filter((def) => !def.scope && def.locationId === locationId);
}
