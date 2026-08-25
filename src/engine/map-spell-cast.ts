/**
 * Map spells that scale with Power (View Air, View Earth, Fly, Dimension Door,
 * Water Walk, Town Portal): cast first, then add Power — like combat / Visions /
 * Fortune. The printed CHOOSE_ONE tiers stay as the effect table; the player no
 * longer picks a tier up front and pays its cost. They cast the spell, discard
 * power-source cards one at a time for their printed Power value, then resolve
 * at the best tier their final Power reaches.
 *
 * Pure helpers only (tier table + best-tier pick). The boost window open/resolve
 * lives in adventure-reducer.ts next to Visions/Fortune (needs door/earth hooks).
 */
import type { CardDefinition, EffectDefinition } from "./state";

/** A non-CHOOSE_ONE effect — same shape as the reducer's local ConcreteEffect. */
export type MapSpellTierEffect = Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;

export type MapSpellPowerTiers = {
  tiers: Array<{
    optionIndex: number;
    minPower: number;
    label: string;
    effect: MapSpellTierEffect;
  }>;
  maxPower: number;
};

/**
 * A map spell whose options are pure Power tiers: every option is map-only,
 * trigger-free, and free or paid only with a powerCost. Returns null when the
 * card is not that shape (leave it on the normal CHOOSE_ONE path).
 */
export function mapSpellPowerTiers(card: CardDefinition | undefined): MapSpellPowerTiers | null {
  // Fortune is a plain Instant rather than a CHOOSE_ONE map Spell, but its
  // rerollsByPower table is the same kind of Power ladder. Treat it as a
  // synthetic tier table so it uses the one shared map boost pipeline (printed
  // Power values, School expert, Basic Magic, Tome and Orb multiplier) instead
  // of the old private "+1 per discarded card" path.
  if (
    card?.kind === "spell" &&
    card.timing === "instant" &&
    card.effect.type === "CREATE_ATTACK_DIE_REROLL" &&
    card.effect.adventureDice &&
    card.effect.rerollsByPower
  ) {
    const tiers = Object.entries(card.effect.rerollsByPower)
      .map(([rawPower, rerolls], optionIndex) => ({
        optionIndex,
        minPower: Number(rawPower),
        label: `Reroll a Treasure, Resource, or Attack die ${rerolls}×`,
        effect: card.effect as MapSpellTierEffect
      }))
      .filter((tier) => Number.isFinite(tier.minPower))
      .sort((a, b) => a.minPower - b.minPower);
    if (tiers.length > 0) {
      return { tiers, maxPower: Math.max(...tiers.map((tier) => tier.minPower)) };
    }
  }
  if (!card || card.kind !== "spell" || card.timing !== "map" || card.effect.type !== "CHOOSE_ONE") {
    return null;
  }
  const options = card.effect.options;
  if (options.length < 2) {
    return null;
  }
  let hasPowerCost = false;
  const tiers: MapSpellPowerTiers["tiers"] = [];
  for (const [optionIndex, option] of options.entries()) {
    if (option.trigger || !option.mapOnly) {
      return null;
    }
    const cost = option.cost;
    if (cost) {
      // Only pure powerCost payments — no resource / discard-count side costs.
      if (
        cost.powerCost === undefined ||
        cost.discardCards !== undefined ||
        cost.discardCardsUpTo !== undefined ||
        cost.resources ||
        cost.removeSelf
      ) {
        return null;
      }
      if (cost.costCardFilter && cost.costCardFilter !== "power-source") {
        return null;
      }
      hasPowerCost = true;
      tiers.push({
        optionIndex,
        minPower: cost.powerCost,
        label: option.label,
        effect: option.effect as MapSpellTierEffect
      });
    } else {
      tiers.push({
        optionIndex,
        minPower: 0,
        label: option.label,
        effect: option.effect as MapSpellTierEffect
      });
    }
  }
  if (!hasPowerCost) {
    return null;
  }
  tiers.sort((a, b) => a.minPower - b.minPower || a.optionIndex - b.optionIndex);
  return {
    tiers,
    maxPower: Math.max(...tiers.map((tier) => tier.minPower))
  };
}

export function isMapPowerTierSpell(card: CardDefinition | undefined): boolean {
  return mapSpellPowerTiers(card) !== null;
}

/** Highest tier whose minPower is reachable at the given Power. */
export function bestMapSpellTier(
  tiers: MapSpellPowerTiers,
  power: number
): MapSpellPowerTiers["tiers"][number] {
  let best = tiers.tiers[0]!;
  for (const tier of tiers.tiers) {
    if (tier.minPower <= power) {
      best = tier;
    }
  }
  return best;
}

export function mapSpellTierSummary(tiers: MapSpellPowerTiers, power: number): string {
  return bestMapSpellTier(tiers, power).label;
}
