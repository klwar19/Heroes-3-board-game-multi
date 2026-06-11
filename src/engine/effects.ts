import type { CardDefinition, CardOptionDefinition, CardPlayMode, EffectDefinition } from "./state";

export const implementedCardEffectTypes = [
  "DEAL_DAMAGE",
  "HEAL_DAMAGE",
  "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
  "CANCEL_SPELL",
  "DRAW_CARDS",
  "CHOOSE_ONE",
  "ADD_COMBAT_STAT",
  "TRIPLE_ATTACK_DIE",
  "TRANSFORM_UNIT",
  "ADD_SPELL_POWER",
  "GAIN_MORALE",
  "CREATE_ACTIVE_EFFECT",
  "CREATE_ATTACK_BUFF",
  "CREATE_DEFENSE_BUFF",
  "CREATE_ATTACK_DIE_REROLL",
  "RECALL_SPELL"
] satisfies EffectDefinition["type"][];

export function isImplementedCardEffect(effect: EffectDefinition): boolean {
  if (effect.type === "CHOOSE_ONE") {
    return effect.options.every((option) => implementedCardEffectTypes.includes(option.effect.type));
  }

  return implementedCardEffectTypes.includes(effect.type);
}

export function getCardOptions(card: CardDefinition): CardOptionDefinition[] {
  return card.effect.type === "CHOOSE_ONE" ? card.effect.options : [];
}

/**
 * Resolves the concrete effect a play applies: for "OR" cards this is the
 * chosen option's effect, otherwise the card's printed effect.
 */
export function getEffectiveCardEffect(
  card: CardDefinition,
  optionIndex?: number
): Exclude<EffectDefinition, { type: "CHOOSE_ONE" }> | null {
  if (card.effect.type !== "CHOOSE_ONE") {
    return card.effect;
  }

  if (optionIndex === undefined) {
    return null;
  }

  return card.effect.options[optionIndex]?.effect ?? null;
}

export function getSpellDamageAmount(card: CardDefinition, power: number): number {
  if (
    card.effect.type !== "DEAL_DAMAGE" &&
    card.effect.type !== "HEAL_DAMAGE" &&
    card.effect.type !== "HEAL_DAMAGE_AND_REMOVE_EFFECTS"
  ) {
    return 0;
  }

  if (card.effect.amountByPower) {
    const powerBreakpoints = Object.keys(card.effect.amountByPower)
      .map(Number)
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    const matchingPower = powerBreakpoints.filter((value) => value <= power).at(-1) ?? powerBreakpoints[0];

    return matchingPower === undefined ? 0 : (card.effect.amountByPower[matchingPower] ?? 0);
  }

  return card.effect.amount ?? 0;
}

export function getEffectAmount(effect: EffectDefinition, mode: CardPlayMode): number {
  if (
    effect.type !== "ADD_COMBAT_STAT" &&
    effect.type !== "ADD_SPELL_POWER" &&
    effect.type !== "DRAW_CARDS"
  ) {
    return 0;
  }

  if (mode === "expert") {
    return effect.expertAmount ?? effect.amount;
  }

  return effect.amount;
}

export function getCardEffectAmount(card: CardDefinition, mode: CardPlayMode, optionIndex?: number): number {
  const effect = getEffectiveCardEffect(card, optionIndex);
  return effect ? getEffectAmount(effect, mode) : 0;
}

export function describeCardEffect(card: CardDefinition): string {
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.map((option) => option.label).join(" OR ");
  }

  if (card.effect.type === "DRAW_CARDS") {
    const expert = card.effect.expertAmount ? `, expert draw ${card.effect.expertAmount}` : "";
    return `draw ${card.effect.amount} card${card.effect.amount === 1 ? "" : "s"}${expert}`;
  }

  if (card.effect.type === "DEAL_DAMAGE") {
    if (card.effect.amountByPower) {
      const breakpoints = Object.entries(card.effect.amountByPower)
        .map(([power, amount]) => `${power}:${amount}`)
        .join(", ");
      return `${card.effect.damageKind} damage by power (${breakpoints})`;
    }

    return `${card.effect.amount ?? 0} ${card.effect.damageKind} damage at ${card.power ?? 0} power`;
  }

  if (card.effect.type === "HEAL_DAMAGE") {
    if (card.effect.amountByPower) {
      const breakpoints = Object.entries(card.effect.amountByPower)
        .map(([power, amount]) => `${power}:${amount}`)
        .join(", ");
      return `heal damage by power (${breakpoints})`;
    }

    return `heal ${card.effect.amount ?? 0} damage`;
  }

  if (card.effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS") {
    if (card.effect.amountByPower) {
      const breakpoints = Object.entries(card.effect.amountByPower)
        .map(([power, amount]) => `${power}:${amount}`)
        .join(", ");
      return `heal by power (${breakpoints}) and remove effects`;
    }

    return `heal ${card.effect.amount ?? 0} damage and remove effects`;
  }

  if (card.effect.type === "CANCEL_SPELL") {
    const expert = card.effect.expertIgnoresMaxPower ? ", expert ends any spell" : "";
    return `End spell up to ${card.effect.maxPower ?? "any"} power${expert}`;
  }

  if (card.effect.type === "ADD_COMBAT_STAT") {
    const doubled = card.effect.doubleForUnitName ? ` (x2 for ${card.effect.doubleForUnitName})` : "";
    return `+${card.effect.amount} ${card.effect.stat}, expert +${card.effect.expertAmount ?? card.effect.amount}${doubled}`;
  }

  if (card.effect.type === "TRIPLE_ATTACK_DIE") {
    return "triple the Attack die's outcome";
  }

  if (card.effect.type === "TRANSFORM_UNIT") {
    return `place on ${card.effect.targetVariants.join("/")} ${card.effect.targetUnitName}: becomes ${card.effect.newName} (A${card.effect.attack} D${card.effect.defense} HP${card.effect.health} I${card.effect.initiative})`;
  }

  if (card.effect.type === "ADD_SPELL_POWER") {
    return `+${card.effect.amount} power, expert +${card.effect.expertAmount ?? card.effect.amount}`;
  }

  if (card.effect.type === "CREATE_ACTIVE_EFFECT") {
    const expertName = card.effect.expertEffect ? `, expert ${card.effect.expertEffect.name}` : "";
    return `${card.effect.effect.name}${expertName}`;
  }

  if (card.effect.type === "CREATE_ATTACK_BUFF") {
    if (card.effect.amountByPower) {
      const breakpoints = Object.entries(card.effect.amountByPower)
        .map(([power, amount]) => `${power}:+${amount}`)
        .join(", ");
      return `${card.effect.name} attack by power (${breakpoints})`;
    }

    return `${card.effect.name} +${card.effect.amount ?? 0} attack`;
  }

  if (card.effect.type === "CREATE_DEFENSE_BUFF") {
    if (card.effect.amountByPower) {
      const breakpoints = Object.entries(card.effect.amountByPower)
        .map(([power, amount]) => `${power}:+${amount}`)
        .join(", ");
      return `${card.effect.name} defense by power (${breakpoints})`;
    }

    return `${card.effect.name} +${card.effect.amount ?? 0} defense`;
  }

  if (card.effect.type === "CREATE_ATTACK_DIE_REROLL") {
    const expert = card.effect.expertRerolls ? `, expert ${card.effect.expertRerolls} attack reroll` : "";
    if (card.effect.rerollsByPower) {
      const breakpoints = Object.entries(card.effect.rerollsByPower)
        .map(([power, amount]) => `${power}:${amount}`)
        .join(", ");
      return `${card.effect.name} attack rerolls by power (${breakpoints})`;
    }

    return `${card.effect.name} ${card.effect.basicRerolls} attack reroll${expert}`;
  }

  if (card.effect.type === "RECALL_SPELL") {
    const expert = card.effect.expertSpellLimitBonus
      ? `, expert spell limit +${card.effect.expertSpellLimitBonus}`
      : "";
    return `return cast spell to hand${expert}`;
  }

  if (card.effect.type === "GAIN_MORALE") {
    const expert = card.effect.expertDrawCards ? `, expert also draws ${card.effect.expertDrawCards}` : "";
    return `gain ${card.effect.amount} morale${expert}`;
  }

  return card.kind;
}
