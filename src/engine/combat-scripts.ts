/**
 * Forced Battle Events engine — runs the scripts a fought MAP FIELD attaches to
 * its combat. The mechanism is CORE; content packages register the scripts
 * (`src/data/map/combat-scripts.ts` registry, `src/data/anime/combat-scripts.ts`
 * content). See `docs/anime-mod-plan.md` §3.12.
 *
 * V1 is FULLY AUTOMATIC — no effect opens a player window or choice (the
 * deliberate anti-freeze design). Every event announces itself via a
 * `COMBAT_SCRIPT_TRIGGERED` feed line so players SEE something happen.
 *
 * Trigger wiring:
 *  - combat-start events fire from `finalizeCombatStart` (after the commander
 *    combat-start package, before the first war-machine round), idempotent
 *    across its Wayfarer/tactics re-entries via `combat.combatScripts.startApplied`.
 *  - round-start events fire from `advanceCombatRound` (the per-round chokepoint,
 *    after `combat.round` is incremented) — and, for the opening round, once from
 *    the combat-start pass — idempotent per round via `combat.combatScripts.roundsFired`.
 *
 * Scope: NEUTRAL combats only (guard fields AND Creature Banks). PvP and the
 * combat sandbox never carry a fought-field location, so they trigger nothing.
 */

// Side-effect: register the Anime package's combat scripts into the catalog.
import "@/data/anime/combat-scripts";
// Side-effect + tables: the optional PvE director's encounter-scoped scripts.
import { pveEncounterScriptsFor } from "@/data/anime/pve-combat-scripts";
import {
  combatScriptsForLocation,
  type CombatScriptDefinition,
  type CombatScriptEvent
} from "@/data/map/combat-scripts";
import { animeEnabled, animeModuleEnabled } from "./anime";
import { isPveEncounterCombat } from "./combat-board-art";
import { createSeededRandom } from "./random";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { appendEvent } from "./events";
import { noteUnitDamagedForTokens } from "./tokens";
import type {
  CombatScriptStatModifier,
  CombatState,
  CombatUnitState,
  GameState,
  PlayerId
} from "./state";

/** Full board size (0–19); obstacle cells outside this are ignored. */
const COMBAT_BOARD_CELLS = 20;

/** Whether a script's required Anime module is active (undefined = always on). */
function scriptModuleActive(state: Pick<GameState, "anime">, script: CombatScriptDefinition): boolean {
  const required = script.requiresModule;
  if (!required) {
    return true;
  }
  // Anime locations only exist under the master flag; `"enabled"` (and the
  // non-boolean `waveCadence`) both resolve to the master gate.
  if (
    required === "enabled" ||
    required === "waveCadence" ||
    required === "pveTheme" ||
    required === "wavePressure" ||
    required === "waveDefeatLimit" ||
    required === "raidBossSpawnRound" ||
    required === "dungeonDepth" ||
    required === "dungeonDescentCost"
  ) {
    return animeEnabled(state);
  }
  // Forced Battle Events content module — LEGACY SEMANTICS (absent === ON):
  // gate on `enabled && combatEvents !== false` so old anime snapshots without
  // the flag keep firing scripts, and an explicit `combatEvents: false` disables
  // them. (`animeModuleEnabled` reads `Boolean(...)`, which would wrongly disable
  // an absent flag — hence the dedicated `!== false` check.)
  if (required === "combatEvents") {
    return animeEnabled(state) && state.anime?.combatEvents !== false;
  }
  return animeModuleEnabled(state, required);
}

/** The location id of the field this combat is being fought on (neutral only). */
function foughtFieldLocation(state: GameState, combat: CombatState): string | null {
  if (combat.context.kind !== "neutral") {
    return null;
  }
  const fieldId = combat.context.fieldId;
  return fieldId ? state.adventure?.fields[fieldId]?.location ?? null : null;
}

/**
 * The active scripts for this combat: those attached to the fought field's
 * location whose required module is on. Empty for PvP/sandbox (no field) and
 * for every non-scripted field.
 */
export function combatScriptsActiveForCombat(state: GameState, combat: CombatState): CombatScriptDefinition[] {
  const location = foughtFieldLocation(state, combat);
  return [
    ...combatScriptsForLocation(location).filter((script) => scriptModuleActive(state, script)),
    ...pveEncounterScriptsForCombat(state, combat)
  ];
}

/**
 * The optional PvE director's scripts for this combat, chosen by ENCOUNTER
 * IDENTITY rather than by the fought field's location (every rift lair shares
 * the `rift_lair` location and every dungeon floor the `dungeon_gate` one).
 *
 * Returns `[]` — a single boolean check — unless the combat is a PvE encounter,
 * so with the PvE modules OFF this is byte-identical to the old behaviour.
 * WAVE assaults are deliberately excluded even though `isPveEncounterCombat` is
 * true for them: a wave already carries its own battle-event rotation.
 */
export function pveEncounterScriptsForCombat(
  state: GameState,
  combat: CombatState
): CombatScriptDefinition[] {
  if (!isPveEncounterCombat(combat) || combat.context.kind !== "neutral") {
    return [];
  }
  const context = combat.context;
  if (context.waveAssault) {
    return [];
  }
  // Delegates to the PURE data-side query so the pre-fight menus (which have no
  // CombatState) list exactly the scripts this fight will run.
  const bossDefId = context.raidBossId
    ? state.adventure?.raidBosses?.[context.raidBossId]?.defId
    : undefined;
  return pveEncounterScriptsFor({
    theme: state.adventure?.pveTheme === "doom" ? "doom" : "classic",
    ...(bossDefId ? { bossDefId } : {}),
    ...(context.dungeonFloor !== undefined ? { dungeonFloor: context.dungeonFloor } : {})
  });
}

/** Map a unit to its side identity for a script predicate. */
function unitOnSide(combat: CombatState, unit: CombatUnitState, side: "attacker" | "defender" | "both"): boolean {
  if (side === "both") {
    return true;
  }
  if (side === "attacker") {
    return unit.controllerId === combat.attackerPlayerId;
  }
  return unit.controllerId === combat.defenderPlayerId;
}

/**
 * The signed environment-stat delta a unit's `stat` carries from every active
 * `environment-stat` script effect. Read live by the attack/defense resolution
 * in reducer.ts (0 when the combat has no script modifiers — the hot path).
 */
export function combatScriptStatDelta(
  combat: CombatState,
  unit: CombatUnitState,
  stat: "attack" | "defense"
): number {
  const modifiers = combat.combatScripts?.statModifiers;
  if (!modifiers || modifiers.length === 0) {
    return 0;
  }
  let delta = 0;
  for (const modifier of modifiers) {
    if (modifier.stat !== stat) {
      continue;
    }
    if (modifier.unitType && unit.type !== modifier.unitType) {
      continue;
    }
    if (!unitOnSide(combat, unit, modifier.side)) {
      continue;
    }
    delta += modifier.amount;
  }
  return delta;
}

/** Effect-damage every living unit of a side (the applyElementalScourge path). */
function applyScriptDamagePulse(
  state: GameState,
  combat: CombatState,
  side: "attacker" | "defender",
  amount: number
): void {
  if (amount <= 0) {
    return;
  }
  const targetPlayerId: PlayerId = side === "attacker" ? combat.attackerPlayerId : combat.defenderPlayerId;
  const targets = Object.values(combat.units).filter(
    (unit) => unit.controllerId === targetPlayerId && unit.damage < unit.maxHealth
  );
  for (const target of targets) {
    // A removal earlier in the loop only ever removes units, so re-check the
    // target is still standing before hitting it.
    if (target.damage >= target.maxHealth) {
      continue;
    }
    const dealt = Math.min(amount, target.maxHealth - target.damage);
    target.damage += dealt;
    noteUnitDamagedForTokens(state, target, dealt);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "system" },
      target: { type: "unit", unitId: target.id },
      amount: dealt,
      damageKind: "effect"
    });
    markUnitRemovedIfNeeded(state, target);
  }
  // A pulse that wipes the last unit of a side ends the fight before any turn.
  finishCombatIfNeeded(state);
}

/** Pre-place Combat Obstacles on the currently-EMPTY candidate cells. */
function applyScriptObstacles(combat: CombatState, cells: number[], count: number | undefined): void {
  const occupied = new Set<number>(combat.obstacles ?? []);
  for (const unit of Object.values(combat.units)) {
    if (unit.damage < unit.maxHealth) {
      occupied.add(unit.position);
    }
  }
  // Scripts are neutral-only (never a siege), so units + existing obstacles are
  // the whole occupancy set — no Walls/Gate to consider.
  const placed = new Set<number>(combat.obstacles ?? []);
  const limit = count ?? cells.length;
  let added = 0;
  for (const cell of cells) {
    if (added >= limit) {
      break;
    }
    if (cell < 0 || cell >= COMBAT_BOARD_CELLS) {
      continue;
    }
    if (occupied.has(cell) || placed.has(cell)) {
      continue;
    }
    placed.add(cell);
    added += 1;
  }
  combat.obstacles = [...placed].sort((left, right) => left - right);
}

/**
 * Heal each LIVING unit of a side (the §E2 `side-heal` kind). `armyStacks` is
 * deliberately untouched: a boss can mend the bar it stands on, never regain a
 * shed one. One feed line per PASS, not per unit.
 */
function applyScriptSideHeal(
  state: GameState,
  combat: CombatState,
  side: "attacker" | "defender",
  amount: number,
  bossOnly: boolean
): void {
  if (amount <= 0) {
    return;
  }
  const targetPlayerId: PlayerId = side === "attacker" ? combat.attackerPlayerId : combat.defenderPlayerId;
  const healed: string[] = [];
  let total = 0;
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== targetPlayerId || unit.damage >= unit.maxHealth) {
      continue;
    }
    if (bossOnly && !unit.bossUnit) {
      continue;
    }
    const restored = Math.min(amount, unit.damage);
    if (restored <= 0) {
      continue;
    }
    unit.damage -= restored;
    total += restored;
    healed.push(unit.cardName);
  }
  if (healed.length === 0) {
    return;
  }
  appendEvent(state, {
    type: "EVENT_NOTE",
    message: `The field mends ${healed.join(", ")} for ${total} damage.`
  });
}

/**
 * Place `count` obstacles on seeded-random EMPTY cells (the §E2
 * `random-obstacle` kind). Seeded per (combat dice seed, round) with
 * `salt: false`, so every client and every replay agrees.
 */
function applyScriptRandomObstacles(combat: CombatState, count: number): void {
  if (count <= 0) {
    return;
  }
  const occupied = new Set<number>(combat.obstacles ?? []);
  for (const unit of Object.values(combat.units)) {
    if (unit.damage < unit.maxHealth) {
      occupied.add(unit.position);
    }
  }
  const empty: number[] = [];
  for (let cell = 0; cell < COMBAT_BOARD_CELLS; cell += 1) {
    if (!occupied.has(cell)) {
      empty.push(cell);
    }
  }
  const random = createSeededRandom(`${combat.dice.seed}#pve-obstacle#${combat.round}`, {
    salt: false
  });
  // Fisher–Yates over the empty set, then take the first `count`.
  for (let index = empty.length - 1; index > 0; index -= 1) {
    const swap = random.nextInt(0, index);
    [empty[index], empty[swap]] = [empty[swap], empty[index]];
  }
  applyScriptObstacles(combat, empty.slice(0, count), count);
}

/** Fire one script event: announce it, then resolve every effect. */
function fireScriptEvent(
  state: GameState,
  combat: CombatState,
  script: CombatScriptDefinition,
  event: CombatScriptEvent
): void {
  // Announce FIRST so the "something happens" feed line precedes any lethal
  // pulse's removal lines.
  appendEvent(state, {
    type: "COMBAT_SCRIPT_TRIGGERED",
    playerId: combat.attackerPlayerId,
    scriptId: script.id,
    scriptName: script.name.en,
    at: event.at,
    ...(event.round != null ? { round: event.round } : {}),
    message: event.announce.en,
    messageVi: event.announce.vi
  });

  for (const effect of event.effects) {
    switch (effect.kind) {
      case "environment-stat": {
        combat.combatScripts ??= {};
        combat.combatScripts.statModifiers ??= [];
        const modifier: CombatScriptStatModifier = {
          side: effect.side,
          ...(effect.unitType ? { unitType: effect.unitType } : {}),
          stat: effect.stat,
          amount: effect.amount
        };
        combat.combatScripts.statModifiers.push(modifier);
        break;
      }
      case "damage-pulse":
        applyScriptDamagePulse(state, combat, effect.side, effect.amount);
        break;
      case "place-obstacles":
        applyScriptObstacles(combat, effect.cells, effect.count);
        break;
      case "side-heal":
        applyScriptSideHeal(state, combat, effect.side, effect.amount, Boolean(effect.bossOnly));
        break;
      case "random-obstacle":
        applyScriptRandomObstacles(combat, effect.count);
        break;
      case "announce":
        // The feed line above IS the announcement — no mechanical change.
        break;
    }
  }
}

/**
 * Fire the combat-start events for the current combat (idempotent). Also fires
 * any round-start events configured for the OPENING round, since round 1 does
 * not pass through `advanceCombatRound`.
 */
export function applyCombatScriptCombatStart(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  const scripts = combatScriptsActiveForCombat(state, combat);
  if (scripts.length === 0) {
    return;
  }
  combat.combatScripts ??= {};
  // Idempotence: finalizeCombatStart can be re-entered (Wayfarer decision,
  // tactics drain) — never apply the combat-start pass twice.
  if (combat.combatScripts.startApplied) {
    return;
  }
  combat.combatScripts.startApplied = true;

  for (const script of scripts) {
    for (const event of script.events) {
      if (event.at === "combat-start") {
        fireScriptEvent(state, combat, script, event);
      }
    }
  }
  // Opening-round "round-start" events fire here (combat.round === 1 at start).
  applyCombatScriptRoundStart(state);
}

/**
 * Fire the round-start events matching the combat's CURRENT round (idempotent
 * per round). Called from `advanceCombatRound` after the round is incremented,
 * and once from the combat-start pass for the opening round.
 */
export function applyCombatScriptRoundStart(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  const scripts = combatScriptsActiveForCombat(state, combat);
  if (scripts.length === 0) {
    return;
  }
  const round = combat.round;
  combat.combatScripts ??= {};
  combat.combatScripts.roundsFired ??= [];
  if (combat.combatScripts.roundsFired.includes(round)) {
    return;
  }
  // Mark the round handled up front so a re-entry (or a nested apply) never
  // re-scans it — even when nothing matched this round.
  combat.combatScripts.roundsFired.push(round);

  for (const script of scripts) {
    for (const event of script.events) {
      if (event.at === "round-start" && event.round === round) {
        fireScriptEvent(state, combat, script, event);
      }
    }
  }
}
