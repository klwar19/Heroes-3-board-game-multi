import type { CombatUnitState, GameState } from "@/engine";
import { effectiveInitiative, getActiveDefenseBonus, getUnitTokens, tokenDefenseDelta } from "@/engine";
import { displayedCombatAttack } from "./board";
import type { StatGlowKind } from "./fx";

/**
 * Stat-buff glows (user request 2026-09-26): "all things that buff Attack,
 * Defense or Speed make the unit glow a different colour temporarily" — on the
 * 4x5 board card and on the hex battlefield sprite alike. Presentation only:
 * read off what a state frame actually changed, never off card text, so every
 * source (Spells, commander casts, specialties, unit abilities, artifacts,
 * tokens, Defend) glows without a per-card table.
 *
 * A stat counts as RAISED for a unit when
 *  - the active effects created this frame raise it (the unit's shown stat
 *    with them vs. without them — an older effect expiring never glows), or
 *  - its Attack tokens grew, or its printed stat grew, while it kept the
 *    same card side (a Few->Pack flip has its own animation). A Weakness /
 *    Corrosion token expiring or being shaken off is a debuff ending, not a
 *    buff, and never glows (like an expiring effect).
 * Speed = the shown Initiative (the hex board's speed).
 */

type StatLine = Record<StatGlowKind, number>;

const STAT_KINDS: readonly StatGlowKind[] = ["attack", "defense", "speed"];

/** The Attack a unit's positive Attack tokens grant (Weakness tokens excluded). */
function attackTokenBonus(unit: CombatUnitState): number {
  return getUnitTokens(unit).reduce(
    (total, token) => (token.kind === "attack" && token.amount > 0 ? total + token.amount : total),
    0
  );
}

function shownStats(state: GameState, unit: CombatUnitState): StatLine {
  return {
    attack: displayedCombatAttack(state, unit),
    defense: unit.defense + getActiveDefenseBonus(state, unit) + tokenDefenseDelta(unit),
    speed: effectiveInitiative(unit, state.activeEffects, state.combat)
  };
}

/** Units whose Attack / Defense / Speed this frame raised, with the stats raised (in STAT_KINDS order). */
export function statBuffGlows(prior: GameState | null | undefined, next: GameState): Map<string, StatGlowKind[]> {
  const glows = new Map<string, StatGlowKind[]>();
  const combat = next.combat;
  // Only changes observed DURING this combat glow: its first snapshot (the view
  // appearing, or switching to another battle) shows the buffs already in play
  // as they are, with no glow.
  if (!combat || !prior?.combat || prior.combat.id !== combat.id) {
    return glows;
  }
  const priorEffectIds = new Set(prior.activeEffects.map((effect) => effect.id));
  const created = next.activeEffects.some((effect) => !priorEffectIds.has(effect.id));
  const withoutCreated: GameState | null = created
    ? { ...next, activeEffects: next.activeEffects.filter((effect) => priorEffectIds.has(effect.id)) }
    : null;
  const priorUnits = prior.combat.units;
  for (const unit of Object.values(combat.units)) {
    if (unit.position < 0 || unit.damage >= unit.maxHealth) {
      continue;
    }
    const raised = new Set<StatGlowKind>();
    if (withoutCreated) {
      const now = shownStats(next, unit);
      const before = shownStats(withoutCreated, unit);
      for (const stat of STAT_KINDS) {
        if (now[stat] > before[stat]) raised.add(stat);
      }
    }
    const was = priorUnits?.[unit.id];
    if (was && was.variant === unit.variant && was.unitDefId === unit.unitDefId) {
      if (attackTokenBonus(unit) > attackTokenBonus(was) || unit.attack > was.attack) raised.add("attack");
      if (unit.defense > was.defense) raised.add("defense");
      if (unit.initiative > was.initiative) raised.add("speed");
    }
    if (raised.size > 0) {
      glows.set(unit.id, STAT_KINDS.filter((stat) => raised.has(stat)));
    }
  }
  return glows;
}

/**
 * A played card's attack-window stat bonus (ADD_COMBAT_STAT — Bloodlust, Stone
 * Skin, Precision, Shield, Prayer's chosen side…) lives on the pending attack,
 * not in an active effect, so the frame diff above cannot see it: the stats
 * the played side raises, read from the card's own effect (the CHOOSE_ONE side
 * named by the play's `optionLabel`). Empty for anything else.
 */
export function playedCardStatGlows(
  card: { effect?: unknown } | undefined,
  optionLabel: string | undefined
): StatGlowKind[] {
  type Effect = {
    type?: string;
    stat?: string;
    amount?: number;
    amountByPower?: Record<number, number>;
    options?: Array<{ label?: string; effect?: Effect }>;
  };
  let effect = card?.effect as Effect | undefined;
  if (effect?.type === "CHOOSE_ONE") {
    effect = effect.options?.find((option) => option.label === optionLabel)?.effect;
  }
  if (effect?.type !== "ADD_COMBAT_STAT" || (effect.stat !== "attack" && effect.stat !== "defense")) {
    return [];
  }
  const raises = (effect.amount ?? 0) > 0 || Object.values(effect.amountByPower ?? {}).some((amount) => amount > 0);
  return raises ? [effect.stat as StatGlowKind] : [];
}
