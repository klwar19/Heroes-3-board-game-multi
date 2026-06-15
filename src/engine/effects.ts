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
  "NECROMANCY_REINFORCE",
  "ADD_SPELL_POWER",
  "GAIN_MORALE",
  "CREATE_ACTIVE_EFFECT",
  "CREATE_ATTACK_BUFF",
  "CREATE_DEFENSE_BUFF",
  "CREATE_ATTACK_DIE_REROLL",
  "RECALL_SPELL",
  "ENTER_PLAY",
  "GAIN_RESOURCES",
  "GAIN_HERO_MOVEMENT",
  "GAIN_EXPERT_USE",
  "TAKE_FROM_DISCARD",
  "SCHOLAR_EMPOWER_SWAP",
  "CARD_DECK_SEARCH",
  "RANDOM_ENEMY_DISCARD",
  "ENEMY_MORALE_STRIP",
  "ROLL_FOR_MORALE",
  "EAGLE_EYE_DIG",
  "TELEPORT_HERO_TO_TOWN",
  "DIMENSION_DOOR",
  "DISCOVER_TILE_CARD",
  "CLEAR_RETALIATION",
  "IGNORE_ATTACK_DIE",
  "IGNORE_ATTACK_DIE_RESULT",
  "CREATE_SPELL_IMMUNITY",
  "CREATE_FIRE_SHIELD",
  "CREATE_INITIATIVE_BUFF",
  "ADD_UNIT_MAX_HEALTH",
  "AREA_DAMAGE_ADJACENT",
  "AREA_DAMAGE_ALL_ADJACENT",
  "AREA_DAMAGE_PICK_ADJACENT",
  "RESHUFFLE_DISCARD_THEN_DRAW",
  "GAIN_WAR_MACHINE",
  "CHAIN_LIGHTNING",
  "PLACE_PARALYSIS",
  "BLOCK_ENEMY_SURRENDER",
  "SKIP_ACTIVATION",
  "SLAYER_ATTACK",
  "INFERNO",
  "FORGETFULNESS",
  "DISPEL_EFFECTS",
  "IGNORE_DEFENSE",
  "BALLISTA_SPECIALTY",
  "DAMAGE_LOWEST_INITIATIVE_ENEMY",
  "ARTILLERY_BALLISTA_VOLLEY",
  "FIRST_AID_TENT_VOLLEY",
  "DECK_DIG_KEEP_ONE",
  "CANCEL_LETHAL_ATTACK",
  "REDIRECT_SPELL",
  "CONTINUE_NEUTRAL_FREE",
  "EARTHQUAKE",
  "SIEGE_DEMOLISH",
  "SUMMON_ELEMENTAL",
  "GRANT_ELEMENTAL_DAMAGE",
  "DOUBLE_FIRST_AID_TENT",
  "CONVERT_ARMY_UNIT",
  "TACTICS_SWAP",
  "DIPLOMACY_RECRUIT",
  "DIPLOMACY_SKIP_COMBAT",
  "ADVANCE_EXPERIENCE",
  "VISIONS_SCRY"
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
 * Whether a card can contribute Power: any Spell (discardable for "+1 Power")
 * or any card carrying an ADD_SPELL_POWER effect (Power statistic, Sorcery,
 * power artifacts). Used by Magi's Power Drain and as the "power-source" card
 * cost filter for Alamar's Resurrection.
 */
export function cardCanBoostPower(card: CardDefinition | undefined): boolean {
  if (!card) {
    return false;
  }
  if (card.kind === "spell") {
    return true;
  }
  if (card.effect.type === "ADD_SPELL_POWER") {
    return true;
  }
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.some((option) => option.effect.type === "ADD_SPELL_POWER");
  }
  return false;
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

/**
 * Damage/heal amount of a concrete effect at the given power. Works on the
 * resolved effect (e.g. one option of an "OR" card) rather than the card's
 * printed top-level effect, so a HEAL_DAMAGE option of a CHOOSE_ONE card
 * (Vial of Lifeblood) reads its own amount instead of the parent's zero.
 */
export function getEffectDamageAmount(
  effect: Exclude<EffectDefinition, { type: "CHOOSE_ONE" }> | null,
  power: number
): number {
  if (
    !effect ||
    (effect.type !== "DEAL_DAMAGE" &&
      effect.type !== "HEAL_DAMAGE" &&
      effect.type !== "HEAL_DAMAGE_AND_REMOVE_EFFECTS")
  ) {
    return 0;
  }

  if (effect.amountByPower) {
    const powerBreakpoints = Object.keys(effect.amountByPower)
      .map(Number)
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    const matchingPower = powerBreakpoints.filter((value) => value <= power).at(-1) ?? powerBreakpoints[0];

    return matchingPower === undefined ? 0 : (effect.amountByPower[matchingPower] ?? 0);
  }

  return effect.amount ?? 0;
}

export function getSpellDamageAmount(card: CardDefinition, power: number): number {
  return card.effect.type === "CHOOSE_ONE" ? 0 : getEffectDamageAmount(card.effect, power);
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

/** Functional one-liner for what a permanent does while it is in play. */
export function describePermanentEffect(card: CardDefinition): string {
  const permanent = card.permanentEffect;
  if (!permanent) {
    return "permanent";
  }

  const parts: string[] = [];
  if (permanent.schoolBonus) {
    parts.push(
      `+${permanent.schoolBonus.basicPower} power for ${permanent.schoolBonus.school} spells; expert: discard for +${permanent.schoolBonus.expertPower} power on one cast`
    );
  }
  if (permanent.combatEffect) {
    for (const modifier of permanent.combatEffect.modifiers) {
      if (modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND") {
        // The expert "heal 3×" lives on the First Aid ability card, not here.
        parts.push(`heal ${modifier.amount} from one of your units once per combat round`);
      }
      if (modifier.type === "RANGED_IGNORE_ALL_PENALTIES") {
        parts.push("your ranged units ignore the ranged-attack penalties");
      }
    }
  }
  if (permanent.rangedInitiativeBonus) {
    parts.push(`your ranged units get +${permanent.rangedInitiativeBonus} initiative`);
  }
  if (permanent.roundStart?.kind === "damage-lowest-initiative") {
    parts.push(`each combat round: ${permanent.roundStart.amount} damage to the slowest enemy unit`);
  }
  if (permanent.roundStart?.kind === "pay-to-splash") {
    parts.push(
      `each combat round: may pay 1 building material to hit 2 adjacent targets for ${permanent.roundStart.amount} each`
    );
  }
  if (permanent.roundStart?.kind === "expert-shot") {
    parts.push(`each combat round: may spend 1 expert use for ${permanent.roundStart.amount} damage to an enemy unit`);
  }
  if (permanent.resourceRoundGain) {
    parts.push(
      `gain ${permanent.resourceRoundGain.amount} ${permanent.resourceRoundGain.resource} at the start of each Resources round`
    );
  }
  if (permanent.permanentLimitOverride) {
    parts.push(`you may keep up to ${permanent.permanentLimitOverride} permanent cards in play, including this one`);
  }
  if (permanent.handLimitBonus) {
    parts.push(`your hand limit is increased by ${permanent.handLimitBonus}`);
  }

  return parts.join("; ") || "permanent";
}

export function describeCardEffect(card: CardDefinition): string {
  // "OR" cards list both option labels — checked before the permanent case so a
  // hybrid permanent/instant artifact (income rings/carts) shows its enter-play
  // income side AND its remove-for-resources side, not just the permanent one.
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.map((option) => option.label).join(" OR ");
  }

  if (card.permanent) {
    return `Permanent — ${describePermanentEffect(card)}`;
  }

  if (card.effect.type === "DRAW_CARDS") {
    const expert = card.effect.expertAmount ? `, expert draw ${card.effect.expertAmount}` : "";
    const thenDiscard = card.effect.thenDiscard
      ? `, then discard ${card.effect.thenDiscard}${card.effect.thenDiscardDrawnOnly ? " of them" : ""}`
      : "";
    return `draw ${card.effect.amount} card${card.effect.amount === 1 ? "" : "s"}${expert}${thenDiscard}`;
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
    const draw = card.effect.drawCards ? `, then draw ${card.effect.drawCards}` : "";
    if (card.effect.amountByPower) {
      const breakpoints = Object.entries(card.effect.amountByPower)
        .map(([power, amount]) => `${power}:${amount}`)
        .join(", ");
      return `heal damage by power (${breakpoints})${draw}`;
    }

    return `heal ${card.effect.amount ?? 0} damage${draw}`;
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
    const draw = card.effect.drawCards ? `, then draw ${card.effect.drawCards}` : "";
    const penalty = card.effect.selfStatPenalty
      ? `, then -${card.effect.selfStatPenalty.amount} ${card.effect.selfStatPenalty.stat} until the end of the Combat`
      : "";
    const expert = card.effect.expertAmount ? `, expert +${card.effect.expertAmount}` : "";
    return `+${card.effect.amount} ${card.effect.stat}${expert}${doubled}${draw}${penalty}`;
  }

  if (card.effect.type === "TRIPLE_ATTACK_DIE") {
    return "triple the Attack die's outcome";
  }

  if (card.effect.type === "TRANSFORM_UNIT") {
    return `place on ${card.effect.targetVariants.join("/")} ${card.effect.targetUnitName}: becomes ${card.effect.newName} (A${card.effect.attack} D${card.effect.defense} HP${card.effect.health} I${card.effect.initiative})`;
  }

  if (card.effect.type === "NECROMANCY_REINFORCE") {
    return "after winning a Combat (not Quick Combat): reinforce a bronze/silver unit (expert: any) for half the gold cost, rounded down";
  }

  if (card.effect.type === "ADD_SPELL_POWER") {
    const draw = card.effect.drawCards ? `, then draw ${card.effect.drawCards}` : "";
    return `+${card.effect.amount} power, expert +${card.effect.expertAmount ?? card.effect.amount}${draw}`;
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

  if (card.effect.type === "GAIN_RESOURCES") {
    const list = (gain: Record<string, number | undefined>) =>
      Object.entries(gain)
        .filter(([, amount]) => amount)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ");
    const expert = card.effect.expertGain ? `, expert ${list(card.effect.expertGain)}` : "";
    return `gain ${list(card.effect.gain)}${expert}`;
  }

  if (card.effect.type === "GAIN_HERO_MOVEMENT") {
    const through = card.effect.moveThroughThisTurn ? " and walk through fields this turn" : "";
    return `hero +${card.effect.amount} movement${through}`;
  }

  if (card.effect.type === "GAIN_EXPERT_USE") {
    return `gain ${card.effect.amount} expert use this round`;
  }

  if (card.effect.type === "TAKE_FROM_DISCARD") {
    const filter = card.effect.filter === "spell" ? " Spell" : card.effect.filter === "non-artifact" ? " non-Artifact" : "";
    const top = card.effect.fromTop ? ` (top ${card.effect.fromTop})` : "";
    return `take ${card.effect.count}${filter} card${card.effect.count === 1 ? "" : "s"} from your discard pile${top}`;
  }

  if (card.effect.type === "CARD_DECK_SEARCH") {
    return `Search (${card.effect.count}) the ${card.effect.deck} deck`;
  }

  if (card.effect.type === "RANDOM_ENEMY_DISCARD") {
    return `discard ${card.effect.count} random card${card.effect.count === 1 ? "" : "s"} from the enemy hand`;
  }

  if (card.effect.type === "ENEMY_MORALE_STRIP") {
    return "an enemy with positive morale loses it";
  }

  if (card.effect.type === "ROLL_FOR_MORALE") {
    return `roll the Attack die: gain morale on ${card.effect.onRoll >= 0 ? "+" : ""}${card.effect.onRoll}`;
  }

  if (card.effect.type === "EAGLE_EYE_DIG") {
    return "dig the Spell deck for the first Basic (expert: Expert) spell";
  }

  if (card.effect.type === "TELEPORT_HERO_TO_TOWN") {
    return "move your hero to a town or settlement you control";
  }

  if (card.effect.type === "DISCOVER_TILE_CARD") {
    return "discover a face-down tile adjacent to your hero's tile";
  }

  if (card.effect.type === "CLEAR_RETALIATION") {
    return "clear a unit's used retaliation (higher tiers with power)";
  }

  if (card.effect.type === "IGNORE_ATTACK_DIE") {
    return "ignore the Attack die roll (power adds attack)";
  }

  if (card.effect.type === "IGNORE_ATTACK_DIE_RESULT") {
    return "after the Attack die roll: ignore the die and any effects it triggered";
  }

  if (card.effect.type === "CREATE_SPELL_IMMUNITY") {
    return "the unit cannot be targeted by spells (tier rises with power)";
  }

  if (card.effect.type === "CREATE_FIRE_SHIELD") {
    if (card.effect.amount !== undefined) {
      const doubled = card.effect.doubleForUnitName ? ` (x2 for ${card.effect.doubleForUnitName})` : "";
      return `a melee attacker takes ${card.effect.amount} damage after attacking the selected unit${doubled}`;
    }
    return "adjacent attackers take damage this combat round (scales with power)";
  }

  if (card.effect.type === "CREATE_INITIATIVE_BUFF") {
    if (card.effect.amountByPower) {
      const breakpoints = Object.entries(card.effect.amountByPower)
        .map(([power, amount]) => `${power}:${Number(amount) >= 0 ? "+" : ""}${amount}`)
        .join(", ");
      return `${card.effect.name} initiative by power (${breakpoints})`;
    }
    return `${card.effect.name} ${Number(card.effect.amount ?? 0) >= 0 ? "+" : ""}${card.effect.amount ?? 0} initiative`;
  }

  if (card.effect.type === "ADD_UNIT_MAX_HEALTH") {
    return `+${card.effect.amount} HP for this combat`;
  }

  if (card.effect.type === "AREA_DAMAGE_ADJACENT") {
    const breakpoints = Object.entries(card.effect.amountByPower)
      .map(([power, amount]) => `${power}:${amount}`)
      .join(", ");
    return `spell damage to the target and an adjacent unit (by power ${breakpoints})`;
  }

  if (card.effect.type === "AREA_DAMAGE_ALL_ADJACENT") {
    return `${card.effect.amount} damage to a space and every adjacent unit (friend or foe)`;
  }

  if (card.effect.type === "AREA_DAMAGE_PICK_ADJACENT") {
    const amount = card.effect.amountByPower
      ? `by power (${Object.entries(card.effect.amountByPower)
          .map(([power, value]) => `${power}:${value}`)
          .join(", ")})`
      : `${card.effect.amount ?? 0}`;
    const centre = card.effect.includeCenter ? "the centre unit and " : "";
    return `${amount} damage to ${centre}up to ${card.effect.adjacentPicks} unit(s) adjacent to the chosen ${card.effect.includeCenter ? "unit" : "space"} (friend or foe; the caster picks when more are adjacent)`;
  }

  if (card.effect.type === "RESHUFFLE_DISCARD_THEN_DRAW") {
    return `shuffle your discard pile into your deck, then draw ${card.effect.drawCards}`;
  }

  if (card.effect.type === "GAIN_WAR_MACHINE") {
    const machine = card.effect.warMachineCardId
      .split(".")
      .pop()
      ?.replace(/_/g, " ");
    const price = card.effect.goldCost ? `for ${card.effect.goldCost} gold` : "for free";
    const fallback = card.effect.fallbackDrawCards ? ` (or draw ${card.effect.fallbackDrawCards} if none left)` : "";
    return `take the ${machine} from the supply ${price}${fallback}`;
  }

  if (card.effect.type === "CHAIN_LIGHTNING") {
    const allocation = card.effect.damagesByPower
      ? Object.entries(card.effect.damagesByPower)
          .map(([power, damages]) => `${power}:${damages.join("/")}`)
          .join(", ")
      : (card.effect.damages ?? []).join("/");
    return `deal ${allocation} damage to the selected unit and the units closest to it`;
  }

  if (card.effect.type === "PLACE_PARALYSIS") {
    return "place a Paralysis token on the selected enemy unit (tier rises with power)";
  }

  if (card.effect.type === "BLOCK_ENEMY_SURRENDER") {
    return "the enemy hero cannot Surrender this combat (Retreat still allowed)";
  }

  if (card.effect.type === "SKIP_ACTIVATION") {
    return `when a ${card.effect.grade}-or-lower unit is about to activate, skip its activation`;
  }

  if (card.effect.type === "SLAYER_ATTACK") {
    const breakpoints = Object.entries(card.effect.rollsByPower)
      .map(([power, rolls]) => `${power}:${rolls}`)
      .join(", ");
    return `attacking a gold unit: roll the Attack die N times (by power ${breakpoints}), apply every result but a -1, then draw 1 card`;
  }

  if (card.effect.type === "INFERNO") {
    const breakpoints = Object.entries(card.effect.rollsByPower)
      .map(([power, rolls]) => `${power}:${rolls}`)
      .join(", ");
    return `roll the Attack die N times (by power ${breakpoints}); every unit on the chosen space and the adjacent ones takes 1 damage per +1`;
  }

  if (card.effect.type === "FORGETFULNESS") {
    return "the selected enemy ranged unit cannot attack during its next activation (tier rises with power)";
  }

  if (card.effect.type === "DISPEL_EFFECTS") {
    const breakpoints = Object.entries(card.effect.gradeByPower)
      .map(([power, grade]) => `${power}:${grade}`)
      .join(", ");
    return `remove every removable ongoing effect from the selected unit (reachable grade by power ${breakpoints})`;
  }

  if (card.effect.type === "IGNORE_DEFENSE") {
    return `this attack ignores the ${card.effect.grade} defender's Defense (it counts as 0)`;
  }

  if (card.effect.type === "BALLISTA_SPECIALTY") {
    const parts: string[] = [];
    if (card.effect.grant) {
      parts.push(
        card.effect.grant === "game-round"
          ? "gain an extra Ballista until the end of the round"
          : "gain an extra Ballista for this combat"
      );
    }
    if (card.effect.activate === "all") {
      parts.push("activate all your Ballistas");
    } else if (card.effect.activate === "one") {
      parts.push("activate your Ballista");
    }
    return parts.join("; ") || "Ballista";
  }

  if (card.effect.type === "DECK_DIG_KEEP_ONE") {
    return `discard up to ${card.effect.count} cards from your deck and return 1 of them to your hand`;
  }

  if (card.effect.type === "CANCEL_LETHAL_ATTACK") {
    return `cancel a killing blow on your ${card.effect.grade} unit`;
  }

  if (card.effect.type === "REDIRECT_SPELL") {
    return `redirect an enemy spell to a new ${card.effect.grade} target`;
  }

  if (card.effect.type === "SUMMON_ELEMENTAL") {
    return "on a chosen empty space: Power 2 summons a Few, Power 4 a Pack";
  }

  if (card.effect.type === "GRANT_ELEMENTAL_DAMAGE") {
    const named = card.effect.targetUnitName ? `your ${card.effect.targetUnitName}` : "the unit";
    return `${named} deals elemental damage this Combat`;
  }

  if (card.effect.type === "DOUBLE_FIRST_AID_TENT") {
    return "double your First Aid Tent's heal for this Combat";
  }

  if (card.effect.type === "CONVERT_ARMY_UNIT") {
    const from = card.effect.fromUnitDefId.split(".").pop()?.replace(/_/g, " ");
    const to = card.effect.toUnitDefId.split(".").pop()?.replace(/_/g, " ");
    return `discard a ${card.effect.fromSide} of ${from} to fetch the ${to} from the ${card.effect.toTier} Neutral deck`;
  }

  if (card.effect.type === "ADVANCE_EXPERIENCE") {
    return `when about to level up: advance ${card.effect.amount === 1 ? "a half level" : `${card.effect.amount} Experience`}, expert advance a full level then remove this card`;
  }

  if (card.effect.type === "VISIONS_SCRY") {
    const breakpoints = Object.entries(card.effect.cardsByPower)
      .map(([power, count]) => `${power}:${count}`)
      .join(", ");
    return `scry a Neutral Unit deck (cards by power ${breakpoints}); discard any and reorder the rest on top`;
  }

  return card.kind;
}
