import type { CardDefinition, CardPlayMode, EffectDefinition } from "./state";

export const implementedCardEffectTypes = [
  "DEAL_DAMAGE",
  "HEAL_DAMAGE",
  "CANCEL_SPELL",
  "ADD_COMBAT_STAT",
  "ADD_SPELL_POWER",
  "CREATE_ACTIVE_EFFECT"
] satisfies EffectDefinition["type"][];

export function isImplementedCardEffect(effect: EffectDefinition): boolean {
  return implementedCardEffectTypes.includes(effect.type);
}

export function getSpellDamageAmount(card: CardDefinition, power: number): number {
  if (card.effect.type !== "DEAL_DAMAGE" && card.effect.type !== "HEAL_DAMAGE") {
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

export function getCardEffectAmount(card: CardDefinition, mode: CardPlayMode): number {
  if (card.effect.type !== "ADD_COMBAT_STAT" && card.effect.type !== "ADD_SPELL_POWER") {
    return 0;
  }

  if (mode === "expert") {
    return card.effect.expertAmount ?? card.effect.amount;
  }

  return card.effect.amount;
}

export function describeCardEffect(card: CardDefinition): string {
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

  if (card.effect.type === "CANCEL_SPELL") {
    return `Cancel spell up to ${card.effect.maxPower ?? "any"} power`;
  }

  if (card.effect.type === "ADD_COMBAT_STAT") {
    return `+${card.effect.amount} ${card.effect.stat}, expert +${card.effect.expertAmount ?? card.effect.amount}`;
  }

  if (card.effect.type === "ADD_SPELL_POWER") {
    return `+${card.effect.amount} power, expert +${card.effect.expertAmount ?? card.effect.amount}`;
  }

  if (card.effect.type === "CREATE_ACTIVE_EFFECT") {
    const expertName = card.effect.expertEffect ? `, expert ${card.effect.expertEffect.name}` : "";
    return `${card.effect.effect.name}${expertName}`;
  }

  return card.kind;
}
