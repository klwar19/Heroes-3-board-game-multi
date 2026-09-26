import type { GameAction, GameState, LegalAction, PlayerId } from "@/engine";
import { unitAbilities } from "@/data/units/abilities";
import { unitAbilityCastsOnHex } from "./fx-sequence";
import { hexAreaAttackOf } from "@/engine/hex-area-attacks";

/**
 * Hex battlefield "Unit Skills" (the command bar's skills button, user request
 * 2026-09-26): the active creature's own special actions — a Faerie Dragon's
 * bolt, an Ogre Magi's Bloodlust, a Pit Lord's summon, a Magog / Lich shot
 * aimed at a hex — grouped one entry per skill from the engine's CURRENT offers,
 * so the bar shows a symbol per skill instead of one text button per target.
 * A skill with a single untargeted offer fires at once; otherwise it is armed
 * and the board's highlighted units / hexes dispatch the matching offer.
 * Presentation only: every dispatched action is an engine legal action.
 */

export type HexSkillCategory = "cast" | "area" | "heal" | "summon" | "buff" | "strike";

export const HEX_SKILL_ICONS: Readonly<Record<HexSkillCategory, string>> = {
  cast: "/assets/battle-hex/ui/skill-cast.webp",
  area: "/assets/battle-hex/ui/skill-area.webp",
  heal: "/assets/battle-hex/ui/skill-heal.webp",
  summon: "/assets/battle-hex/ui/skill-summon.webp",
  buff: "/assets/battle-hex/ui/skill-buff.webp",
  strike: "/assets/battle-hex/ui/skill-strike.webp"
};

export type HexUnitSkill = {
  /** Stable group key (unit + skill), what the board stores while armed. */
  key: string;
  unitId: string;
  name: string;
  /** The engine's label of one offer (tooltip / accessible description). */
  detail: string;
  category: HexSkillCategory;
  /** A lone untargeted offer: fired straight from the menu. */
  immediate?: GameAction;
  /** Board picks: target unit -> offer, target hex -> offer. */
  unitTargets: Map<string, GameAction>;
  cellTargets: Map<number, GameAction>;
};

function abilityCategory(abilityId: string, mode?: string): HexSkillCategory {
  const type = unitAbilities[abilityId]?.effect?.type ?? "";
  if (mode === "heal" || /HEAL/u.test(type)) return mode === "attack" ? "strike" : "heal";
  if (mode === "attack" || /DAMAGE|ARROW|ATTACK/u.test(type)) return "strike";
  if (/SUMMON/u.test(type)) return "summon";
  if (/BUFF|INVULNERAB|EMPOWER/u.test(type)) return "buff";
  return "cast";
}

/** The viewer's skill offers for the creature(s) they may act with right now. */
export function hexUnitSkills(state: GameState, legalActions: readonly LegalAction[], viewerPlayerId: PlayerId): HexUnitSkill[] {
  const combat = state.combat;
  if (!combat) return [];
  const groups = new Map<string, HexUnitSkill>();
  const group = (key: string, make: () => Omit<HexUnitSkill, "unitTargets" | "cellTargets" | "key">) => {
    let entry = groups.get(key);
    if (!entry) {
      entry = { key, ...make(), unitTargets: new Map(), cellTargets: new Map() };
      groups.set(key, entry);
    }
    return entry;
  };
  const untargeted = new Map<string, GameAction[]>();
  for (const legal of legalActions) {
    const action = legal.action;
    if (!("playerId" in action) || action.playerId !== viewerPlayerId) continue;
    if (action.type === "USE_UNIT_ABILITY") {
      const modeName = action.mode ? ` (${action.mode})` : "";
      const entry = group(`ability|${action.unitId}|${action.abilityId}|${action.mode ?? ""}`, () => ({
        unitId: action.unitId,
        name: `${unitAbilities[action.abilityId]?.name ?? action.abilityId}${modeName}`,
        detail: legal.label,
        category: abilityCategory(action.abilityId, action.mode)
      }));
      if (action.target.type === "unit") entry.unitTargets.set(action.target.unitId, action);
      else if (action.target.type === "space") entry.cellTargets.set(action.target.position, action);
      else untargeted.set(entry.key, [...(untargeted.get(entry.key) ?? []), action]);
    } else if (action.type === "ATTACK_HEX") {
      // A Magog / Lich shot aimed at an empty hex (PC area, hex-area-attacks.ts).
      const entry = group(`area|${action.attackerId}`, () => ({
        unitId: action.attackerId,
        name: `${hexAreaAttackOf(combat, combat.units[action.attackerId])?.abilityName ?? "Area shot"}: aim a hex`,
        detail: legal.label,
        category: "area"
      }));
      entry.cellTargets.set(action.position, action);
    } else if (action.type === "SUMMON_DEMONS") {
      const entry = group(`summon|${action.unitId}|${action.mode}`, () => ({
        unitId: action.unitId,
        name: action.mode === "summon" ? "Summon Demons" : action.mode === "reinforce" ? "Reinforce Demons" : "Stack Demons",
        detail: legal.label,
        category: "summon"
      }));
      if (action.position !== undefined) entry.cellTargets.set(action.position, action);
      else if (action.targetUnitId) entry.unitTargets.set(action.targetUnitId, action);
      else untargeted.set(entry.key, [...(untargeted.get(entry.key) ?? []), action]);
    }
  }
  for (const [key, actions] of untargeted) {
    const entry = groups.get(key);
    // One untargeted offer fires at once; several ambiguous ones stay in the dock.
    if (entry && actions.length === 1 && entry.unitTargets.size === 0 && entry.cellTargets.size === 0) {
      entry.immediate = actions[0];
    }
  }
  return [...groups.values()].filter(
    (entry) => entry.immediate || entry.unitTargets.size > 0 || entry.cellTargets.size > 0
  );
}

/** The badge a creature with a castable skill wears on its count plate / card. */
export const CASTER_BADGE_ICON = "/assets/battle-hex/ui/caster-badge.webp";

/**
 * Whether the creature has a skill it casts itself (an activation / "other
 * action" cast: a spell bolt, a heal, a summon, a buff — fx-sequence's
 * unitAbilityCastsOnHex): it wears the caster badge.
 */
export function unitHasCastSkill(unit: { abilities?: readonly string[] }): boolean {
  return (unit.abilities ?? []).some((abilityId) => unitAbilityCastsOnHex(abilityId));
}
