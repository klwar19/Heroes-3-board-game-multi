import { effectiveInitiative } from "./active-effects";
import type { CombatUnitState, EffectDefinition, GameState } from "./state";

/** Factory roster renames must not break specialties or older saved combats. */
export function canonicalSpecialtyUnitName(name: string): string {
  switch (name) {
    case "Halflings":
      return "Grenadiers";
    case "Mechanics":
      return "Engineers";
    case "Dreadnoughts":
      return "Juggernauts";
    default:
      return name;
  }
}

/** The multiplier is shared by combat resolution and the selected-card preview. */
export function specialtyCombatStatMultiplier(
  state: Pick<GameState, "combat" | "activeEffects">,
  effect: Extract<EffectDefinition, { type: "ADD_COMBAT_STAT" }>,
  attacker: CombatUnitState | undefined,
  defender: CombatUnitState | undefined,
): number {
  const affected = effect.stat === "attack" ? attacker : defender;
  if (
    unitMatchesSpecialtyName(affected?.name, effect.doubleForUnitName) ||
    (effect.doubleForUnitType && affected?.type === effect.doubleForUnitType) ||
    unitBelongsToFaction(affected, effect.doubleForUnitFaction)
  ) {
    return 2;
  }
  if (
    attacker && defender &&
    (effect.doubleIfAttackerInitiativeHigher || effect.doubleIfDefenderInitiativeHigher)
  ) {
    const attackInitiative = effectiveInitiative(attacker, state.activeEffects, state.combat);
    const defenseInitiative = effectiveInitiative(defender, state.activeEffects, state.combat);
    if (
      (effect.doubleIfAttackerInitiativeHigher && attackInitiative > defenseInitiative) ||
      (effect.doubleIfDefenderInitiativeHigher && defenseInitiative > attackInitiative)
    ) {
      return 2;
    }
  }
  // Signature names are bonus conditions, never eligibility restrictions.
  return 1;
}

/**
 * "The effect doubles for <Faction> units" (Dark Mullich's Overclock I): a unit
 * belongs to a faction when its unit definition id carries that faction's
 * `<faction>.` prefix (the same test isUndeadUnit uses for `necropolis.`), so a
 * Forge card fielded as Few, Pack or its Neutral face all count. A unit with no
 * definition id (commanders, summons without a card) never matches.
 */
export function unitBelongsToFaction(
  unit: Pick<CombatUnitState, "unitDefId"> | undefined,
  faction: string | undefined,
): boolean {
  return Boolean(faction && unit?.unitDefId?.startsWith(`${faction}.`));
}

export function unitMatchesSpecialtyName(
  unitName: string | undefined,
  target: string | undefined,
): boolean {
  if (!unitName || !target) {
    return false;
  }
  // Multi-unit descriptors ("Elves and Sharpshooters", "X or Y" — Gelu's
  // specialty doubles for two unit types): match when the unit is any of them.
  if (/\s+(?:and|or)\s+/i.test(target)) {
    return target
      .split(/\s+(?:and|or)\s+/i)
      .some((part) => unitMatchesSpecialtyName(unitName, part.trim()));
  }
  // Only the specialty's printed name is canonicalised. Old specialty text
  // ("Halflings", "Mechanics", "Dreadnoughts") keeps matching the renamed
  // Factory roster, while the NEUTRAL Halflings card never borrows Henrietta's
  // Grenadiers doubling.
  if (unitName === target || unitName === canonicalSpecialtyUnitName(target)) {
    return true;
  }
  // MGQ prints the companion's species-title while its army card keeps the
  // character's proper name. Keep those specialist labels honest and make the
  // corresponding real roster families live (plus the classic Dragons family).
  if (target.toLowerCase() === "slime girl") {
    return /slime|slimy/i.test(unitName) || unitName === "Ooma";
  }
  if (target.toLowerCase() === "dragon girl") {
    return unitName === "Giga" || unitName.toLowerCase().endsWith("dragons");
  }
  // Family descriptors like "a Dragons unit": strip the "a … unit" wrapper and
  // match any unit whose name ends with the remaining creature family word.
  const family = target
    .replace(/^an?\s+/i, "")
    .replace(/\s+units?$/i, "")
    .trim();
  return (
    family.length > 0 &&
    family !== target &&
    unitName.toLowerCase().endsWith(family.toLowerCase())
  );
}
