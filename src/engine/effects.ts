import type { CardDefinition, CardOptionDefinition, CardPlayMode, EffectDefinition, SpellSchool } from "./state";

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
  "SET_SPELL_POWER_MAX",
  "GAIN_MORALE",
  "CREATE_ACTIVE_EFFECT",
  "CREATE_ATTACK_BUFF",
  "CREATE_VARIANT_ATTACK_BUFF",
  "CREATE_DEFENSE_BUFF",
  "CREATE_ATTACK_DIE_REROLL",
  "RECALL_SPELL",
  "ENTER_PLAY",
  "GAIN_RESOURCES",
  "DRAW_NEUTRAL_RECRUIT_OFFER",
  "RESOURCE_FORTUNE_PLAY",
  "GAIN_RECRUIT_DISCOUNT",
  "GAIN_HERO_MOVEMENT",
  "GAIN_EXPERT_USE",
  "TAKE_FROM_DISCARD",
  "SCHOLAR_EMPOWER_SWAP",
  "CARD_DECK_SEARCH",
  "REMOVE_HAND_CARD_THEN_SEARCH",
  "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD",
  "RANDOM_ENEMY_DISCARD",
  "ENEMY_MORALE_STRIP",
  "ROLL_FOR_MORALE",
  "EAGLE_EYE_DIG",
  "TELEPORT_HERO_TO_TOWN",
  "DIMENSION_DOOR",
  "VIEW_EARTH",
  "DISCOVER_TILE_CARD",
  "CLEAR_RETALIATION",
  "IGNORE_ATTACK_DIE",
  "IGNORE_ATTACK_DIE_RESULT",
  "ACTIVATE_RANGED_UNIT",
  "CAST_FROM_SPELL_DISCARD",
  "CAST_FROM_SPELL_BOOK",
  "NEGATE_ATTACK",
  "CREATE_SPELL_IMMUNITY",
  "CREATE_FIRE_SHIELD",
  "CREATE_SPELL_WARD",
  "CREATE_INITIATIVE_BUFF",
  "ADD_UNIT_MAX_HEALTH",
  "AREA_DAMAGE_ADJACENT",
  "AREA_DAMAGE_ALL_ADJACENT",
  "AREA_DAMAGE_PICK_ADJACENT",
  "RESHUFFLE_DISCARD_THEN_DRAW",
  "GAIN_RUNES",
  "GAIN_STARTING_RUNES",
  "GAIN_WAR_MACHINE",
  "CHAIN_LIGHTNING",
  "PLACE_PARALYSIS",
  "PLACE_WEAKNESS_TOKEN",
  "BLOCK_ENEMY_SURRENDER",
  "SKIP_ACTIVATION",
  "SLAYER_ATTACK",
  "INFERNO",
  "FORGETFULNESS",
  "BERSERK",
  "TELEPORT_UNIT",
  "MOVE_UNIT_ADJACENT",
  "CLONE_UNIT",
  "DISPEL_EFFECTS",
  "IGNORE_DEFENSE",
  "BALLISTA_SPECIALTY",
  "DAMAGE_LOWEST_INITIATIVE_ENEMY",
  "DAMAGE_ENEMY_UNITS_BY_GRADE",
  "DAMAGE_CHOSEN_ENEMIES",
  "DISCARD_WAR_MACHINE_DAMAGE",
  "DAMAGE_BATTLEFIELD_LINE",
  "BORROW_NEUTRAL_UNIT",
  "TOGGLE_RETALIATION_MARKER",
  "GRANT_DEFENSE_TOKENS",
  "STONE_SKIN_AURA",
  "FORCE_ATTACK_ROLL",
  "REDUCE_RETALIATION_DAMAGE",
  "ARTILLERY_BALLISTA_VOLLEY",
  "FIRST_AID_TENT_VOLLEY",
  "DECK_DIG_KEEP_ONE",
  "DECK_DIG_KEEP_MATCHING",
  "DRAW_TOP_ARTIFACT",
  "SEARCH_DECK_THEN_RESHUFFLE",
  "CANCEL_LETHAL_ATTACK",
  "REDIRECT_SPELL",
  "CONTINUE_NEUTRAL_FREE",
  "EARTHQUAKE",
  "REMOVE_OBSTACLE",
  "SIEGE_DEMOLISH",
  "BALLISTICS_BOMBARD",
  "SUMMON_ELEMENTAL",
  "GRANT_ELEMENTAL_DAMAGE",
  "DOUBLE_FIRST_AID_TENT",
  "CONVERT_ARMY_UNIT",
  "TACTICS_SWAP",
  "DIPLOMACY_RECRUIT",
  "DIPLOMACY_SKIP_COMBAT",
  "ADVANCE_EXPERIENCE",
  "VISIONS_SCRY",
  "INTERFERE_SPELL",
  "DISRUPTING_RAY",
  "SACRIFICE_TRANSFER",
  "PLACE_FORCE_FIELD",
  "PLACE_FIRE_WALL",
  "PLACE_FIRE_WALL_FIXED",
  "PLACE_HIDDEN_TOKENS",
  "REMOVE_ACTIVE_EFFECT",
  "TARNUM_OVERLIMIT_SEARCH",
  "PANDORA_VISIT",
  "PANDORA_SCRY",
  "PANDORA_SILVER_REFRESH"
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
 * School/level gate shared by Resistance and Protection-from-X (both CANCEL_SPELL
 * reactions). Resistance sets neither `schools` nor `maxSpellLevel`, so it always
 * passes here — its only gate is power, checked separately at each call site.
 * Protection from Air/Earth/Fire/Water restricts the cancel to its School (a
 * school-agnostic spell like Magic Arrow counts as every School) and, in basic
 * play, to a Basic spell; its expert play (`expertIgnoresMaxSpellLevel`) lifts
 * the level cap but keeps the School gate. The power gate is NOT evaluated here.
 */
export function cancelSpellAllowsSchoolAndLevel(
  effect: Extract<EffectDefinition, { type: "CANCEL_SPELL" }>,
  spell: { schools: readonly SpellSchool[]; level: "basic" | "expert" | undefined },
  mode: CardPlayMode
): boolean {
  // School gate: the cancelled spell must belong to one of the named Schools. A
  // school-agnostic spell ("any", e.g. Magic Arrow) counts as belonging to every
  // School, so any Protection can end it.
  if (effect.schools && effect.schools.length > 0) {
    const matchesSchool = spell.schools.some(
      (school) => school === "any" || effect.schools!.includes(school)
    );
    if (!matchesSchool) {
      return false;
    }
  }

  // Level gate: expert play (expertIgnoresMaxSpellLevel) ignores the cap; the
  // basic play caps at `maxSpellLevel` (an Expert spell outranks a Basic one).
  if (mode === "expert" && effect.expertIgnoresMaxSpellLevel) {
    return true;
  }
  if (effect.maxSpellLevel) {
    const rank = (level: "basic" | "expert" | undefined) => (level === "expert" ? 1 : 0);
    if (rank(spell.level) > rank(effect.maxSpellLevel)) {
      return false;
    }
  }
  return true;
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
 * If this card can be played to top up a hero's movement pool — a bare
 * GAIN_HERO_MOVEMENT card, or an "OR" card with a GAIN_HERO_MOVEMENT side (Boots
 * of Speed, the Logistics ability's expert side, Dessa's Logistics IV/VI, Shield
 * of Naval Glory's sea side, …) — the exact side that must be chosen to do so:
 * its `optionIndex` (undefined for a bare card), the `mode` it needs (expert for
 * an `expertOnly` side) and the option itself (so callers can honour its gates,
 * e.g. `requiresSeaTile`). Returns null when no side grants hero movement.
 *
 * Used to let these otherwise map-only cards be spent inside a neutral combat's
 * continue-or-retreat window to buy another combat round.
 */
export function heroMovementGrantOption(card: CardDefinition | undefined):
  | { optionIndex?: number; mode: CardPlayMode; option?: CardOptionDefinition }
  | null {
  if (!card) {
    return null;
  }
  if (card.effect.type === "GAIN_HERO_MOVEMENT") {
    return { mode: "basic" };
  }
  if (card.effect.type === "CHOOSE_ONE") {
    const index = card.effect.options.findIndex((option) => option.effect.type === "GAIN_HERO_MOVEMENT");
    if (index >= 0) {
      const option = card.effect.options[index];
      return { optionIndex: index, mode: option.expertOnly ? "expert" : "basic", option };
    }
  }
  return null;
}

/**
 * The card's ADD_SPELL_POWER effect (top-level or inside an "OR" option) used to
 * value it as a discarded power source. A cost-free power side is preferred over
 * one that demands its own extra discard (Titan's Cuirass: +2 plain, not the
 * +4 that costs another card), so a simple discard is never over-valued.
 */
function findAddSpellPowerEffect(
  card: CardDefinition
): Extract<EffectDefinition, { type: "ADD_SPELL_POWER" }> | undefined {
  if (card.effect.type === "ADD_SPELL_POWER") {
    return card.effect;
  }
  if (card.effect.type === "CHOOSE_ONE") {
    const powerOptions = card.effect.options.filter((option) => option.effect.type === "ADD_SPELL_POWER");
    const costFree = powerOptions.find((option) => !option.cost);
    const chosen = costFree ?? powerOptions[0];
    return chosen?.effect.type === "ADD_SPELL_POWER" ? chosen.effect : undefined;
  }
  return undefined;
}

/**
 * How much spell Power a card contributes when discarded as a power source for
 * a spell of `spellSchools` — the unit used by Power-value costs (Sorrow, map
 * View Air / Dimension Door tiers, …):
 *  - a Spell counts as 1 (the "+1 Power" on its bottom side),
 *  - a Power statistic/artifact/ability counts as its printed Power `amount`,
 *    or `expertAmount` when `mode === "expert"` (costs a crown at payment time),
 *    but a school-restricted source only when the empowered spell's school
 *    matches (otherwise it contributes nothing — a non-spell has no generic
 *    "+1 Power" side in this engine).
 * `perCostCard` scaling is ignored (it needs its own sub-cost); the flat
 * printed amount (or expert amount) is used.
 */
export function spellPowerValueOfCard(
  card: CardDefinition | undefined,
  spellSchools: readonly SpellSchool[],
  mode: CardPlayMode = "basic"
): number {
  if (!card) {
    return 0;
  }
  if (card.kind === "spell") {
    return 1;
  }
  const add = findAddSpellPowerEffect(card);
  if (!add) {
    return 0;
  }
  if (add.schoolOnly && !(spellSchools.includes(add.schoolOnly) || spellSchools.includes("any"))) {
    return 0;
  }
  if (mode === "expert" && add.expertAmount !== undefined) {
    return add.expertAmount;
  }
  return add.amount;
}

/**
 * How many cards a power source makes its owner draw when it is discarded to pay
 * a Power-value cost (Sorrow's silver/gold, Alamar's Resurrection) — the Sorcery
 * ability's "+1 Power, then draw 1 card", and the same bonus on Scales of the
 * Greater Basilisk / Tunic of the Cyclops King. Read off the SAME ADD_SPELL_POWER
 * effect `spellPowerValueOfCard` used to value the card, so the draw only fires
 * when (and the school check passes so) the card actually contributed Power.
 * Spells (the generic "+1 Power" discard) never draw.
 */
export function spellPowerSourceDrawCards(
  card: CardDefinition | undefined,
  spellSchools: readonly SpellSchool[]
): number {
  if (!card || card.kind === "spell") {
    return 0;
  }
  const add = findAddSpellPowerEffect(card);
  if (!add) {
    return 0;
  }
  if (add.schoolOnly && !(spellSchools.includes(add.schoolOnly) || spellSchools.includes("any"))) {
    return 0;
  }
  return add.drawCards ?? 0;
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

/**
 * Walk a card effect tree and collect every numeric key of a `*ByPower` table
 * (amountByPower, gradeByPower, durationByPower, damagesByPower, rollsByPower…).
 * Shared by the live cast-window UI and the Tome "max tier" helper.
 */
export function collectPowerBreakpoints(value: unknown, acc: number[]): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPowerBreakpoints(item, acc);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.endsWith("ByPower") && nested && typeof nested === "object" && !Array.isArray(nested)) {
      for (const breakpoint of Object.keys(nested as Record<string, unknown>)) {
        const numeric = Number(breakpoint);
        if (Number.isFinite(numeric)) {
          acc.push(numeric);
        }
      }
    } else {
      collectPowerBreakpoints(nested, acc);
    }
  }
}

/** Sorted unique Power tiers a spell's effect scales across. Empty = no Power ladder. */
export function spellPowerBreakpoints(card: CardDefinition | undefined): number[] {
  if (!card) {
    return [];
  }
  const acc: number[] = [];
  collectPowerBreakpoints(card.effect, acc);
  return [...new Set(acc)].sort((left, right) => left - right);
}

/**
 * Highest Power tier that still changes the spell's effect. Null when the spell
 * has no `*ByPower` ladder (no "overboard" warning). Spells that scale to Power
 * 4/5 (Implosion, Animate Dead) return that top key, not a hard-coded 2.
 */
export function spellMaxUsefulPower(card: CardDefinition | undefined): number | null {
  const breakpoints = spellPowerBreakpoints(card);
  return breakpoints.length > 0 ? breakpoints[breakpoints.length - 1]! : null;
}

/**
 * Lowest Power needed for a damaging Power-ladder spell to deal any damage.
 * Walks DEAL_DAMAGE `amountByPower` and CHAIN_LIGHTNING `damagesByPower` tables:
 * the minimum key whose value is positive. Implosion `{0:0,1:2,3:4,5:6}` → 1;
 * Lightning Bolt `{0:2,1:3,2:4}` → 0. Non-damage / non-ladder spells → 0.
 *
 * Used by the cast-window UI and the engine pass-reaction guard so a player
 * cannot resolve Implosion (and kin) at Power 0 for a silent no-op.
 */
export function spellMinUsefulPower(card: CardDefinition | undefined): number {
  if (!card) {
    return 0;
  }
  let floor = 0;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.type === "DEAL_DAMAGE" && record.amountByPower && typeof record.amountByPower === "object") {
      const table = record.amountByPower as Record<string, number>;
      const positive = Object.entries(table)
        .map(([power, amount]) => [Number(power), Number(amount)] as const)
        .filter(([power, amount]) => Number.isFinite(power) && Number.isFinite(amount) && amount > 0)
        .map(([power]) => power);
      if (positive.length > 0) {
        floor = Math.max(floor, Math.min(...positive));
      }
    }
    if (record.type === "CHAIN_LIGHTNING" && record.damagesByPower && typeof record.damagesByPower === "object") {
      const table = record.damagesByPower as Record<string, number[]>;
      const positive = Object.entries(table)
        .filter(([, damages]) => Array.isArray(damages) && damages.some((amount) => Number(amount) > 0))
        .map(([power]) => Number(power))
        .filter((power) => Number.isFinite(power));
      if (positive.length > 0) {
        floor = Math.max(floor, Math.min(...positive));
      }
    }
    for (const nested of Object.values(record)) {
      visit(nested);
    }
  };
  visit(card.effect);
  return floor;
}

/**
 * Cast-window Power bounds for UI + engine guards.
 *  - minUseful: must reach before the caster may resolve (when they can still fuel)
 *  - maxUseful: past this, extra Power does not change the printed ladder (warn)
 */
export function spellCastPowerBounds(card: CardDefinition | undefined): {
  minUseful: number;
  maxUseful: number | null;
} {
  return { minUseful: spellMinUsefulPower(card), maxUseful: spellMaxUsefulPower(card) };
}

/**
 * How many Attack dice a power-scaled die-roll spell (Inferno, Slayer) throws
 * at the given Power. Shared by the cast-window Power meter (so Inferno shows
 * "N dice" the same way damage spells show "N damage") and the resolve path.
 * Returns null when the card does not roll dice by Power.
 */
export function getSpellDiceRollCount(card: CardDefinition, power: number): number | null {
  const effect = card.effect;
  if (effect.type !== "INFERNO" && effect.type !== "SLAYER_ATTACK") {
    return null;
  }
  const byPower = effect.rollsByPower;
  const powerBreakpoints = Object.keys(byPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matchingPower = powerBreakpoints.filter((value) => value <= power).at(-1) ?? powerBreakpoints[0];
  if (matchingPower === undefined) {
    return null;
  }
  return byPower[matchingPower] ?? null;
}

export function getEffectAmount(effect: EffectDefinition, mode: CardPlayMode): number {
  // Interference carries an explicit expert amount (the Defense / spell-damage
  // reduction it grants), so it reads it the same way the stat cards do. An
  // artifact without an expert side (Plate of the Dying Light) falls back to the
  // basic amount — its expert play is never offered, so this is only defensive.
  if (effect.type === "INTERFERE_SPELL") {
    return mode === "expert" ? (effect.expertAmount ?? effect.amount) : effect.amount;
  }

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
  if (permanent.incomeTierDieOnEnter) {
    parts.push(
      "entering play rolls 1 Resource die; while in play, gain that resource's full income tier (+5 gold / +2 materials / +1 valuables) each Resources round"
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
    // Shield / Air Shield only apply their Defense against a matching attacker.
    const vs =
      card.effect.vsAttackerType === "ground-or-flying"
        ? " vs ground/flying attackers"
        : card.effect.vsAttackerType === "ranged"
          ? " vs ranged attackers"
          : "";
    if (card.effect.amountByPower) {
      const breakpoints = Object.entries(card.effect.amountByPower)
        .map(([power, amount]) => `${power}:+${amount}`)
        .join(", ");
      return `${card.effect.name} defense by power (${breakpoints})${vs}`;
    }

    return `${card.effect.name} +${card.effect.amount ?? 0} defense${vs}`;
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
    const filter =
      card.effect.filter === "spell"
        ? " Spell"
        : card.effect.filter === "non-artifact"
          ? " non-Artifact"
          : card.effect.filter === "spell-or-specialty"
            ? " Spell or Specialty"
            : card.effect.filter === "magic-arrow"
              ? " Magic Arrow"
              : "";
    const top = card.effect.fromTop ? ` (top ${card.effect.fromTop})` : "";
    return `take ${card.effect.count}${filter} card${card.effect.count === 1 ? "" : "s"} from your discard pile${top}`;
  }

  if (card.effect.type === "DRAW_NEUTRAL_RECRUIT_OFFER") {
    return `draw ${card.effect.count} ${card.effect.tier} Neutral units; recruit one for half cost (rounded up)`;
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
    if (card.effect.school) {
      return `dig the Spell deck for the first ${card.effect.school} Magic spell`;
    }
    return "dig the Spell deck for the first Basic (expert: Expert) spell";
  }

  if (card.effect.type === "SET_SPELL_POWER_MAX") {
    return `cast a ${card.effect.schoolOnly} Magic spell at maximum Power for free`;
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

  if (card.effect.type === "ACTIVATE_RANGED_UNIT") {
    return "activate one of your ranged units that has not been activated this round";
  }

  if (card.effect.type === "CAST_FROM_SPELL_DISCARD") {
    if (card.effect.spellId) {
      const name = card.effect.spellId
        .replace(/^spell\./, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return `cast a ${name} from your discard pile for free (it does not count toward your Spell limit)`;
    }
    return "cast the top spell of the Spell-deck discard pile, then remove this card";
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

  if (card.effect.type === "REDUCE_RETALIATION_DAMAGE") {
    const doubled = card.effect.doubleForUnitName
      ? ` (doubled for the ${card.effect.doubleForUnitName} unit)`
      : "";
    return `react to an enemy Retaliation Attack: that retaliation deals ${card.effect.amount} less damage${doubled}`;
  }

  if (card.effect.type === "AREA_DAMAGE_ADJACENT") {
    const breakpoints = Object.entries(card.effect.amountByPower)
      .map(([power, amount]) => `${power}:${amount}`)
      .join(", ");
    return `spell damage to the target and an adjacent unit (by power ${breakpoints})`;
  }

  if (card.effect.type === "BALLISTICS_BOMBARD") {
    return `pay 1 building material to deal ${card.effect.amount} damage to an enemy unit and an enemy adjacent to it`;
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

  if (card.effect.type === "GAIN_RUNES") {
    const draw = card.effect.drawCards ? ` and draw ${card.effect.drawCards} card(s)` : "";
    return `gain ${card.effect.amount} Rune(s)${draw}`;
  }

  if (card.effect.type === "GAIN_STARTING_RUNES") {
    return `become Rune-Empowered: start each combat with ${card.effect.amount} extra Rune(s), until your next Resource round`;
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

  if (card.effect.type === "BERSERK") {
    const breakpoints = Object.entries(card.effect.gradeByPower)
      .map(([power, grade]) => `${power}:${grade}`)
      .join(", ");
    return `the selected unit must attack the nearest unit (friend or foe) on its next activation (reachable grade by power ${breakpoints})`;
  }

  if (card.effect.type === "TELEPORT_UNIT") {
    const breakpoints = Object.entries(card.effect.gradeByPower)
      .map(([power, grade]) => `${power}:${grade}`)
      .join(", ");
    return `move one of your units to any empty space, ignoring obstacles (reachable grade by power ${breakpoints})`;
  }

  if (card.effect.type === "DISPEL_EFFECTS") {
    const breakpoints = Object.entries(card.effect.gradeByPower)
      .map(([power, grade]) => `${power}:${grade}`)
      .join(", ");
    return `remove every removable ongoing effect from the selected unit (reachable grade by power ${breakpoints})`;
  }

  if (card.effect.type === "CLONE_UNIT") {
    const breakpoints = Object.entries(card.effect.gradeByPower)
      .map(([power, grade]) => `${power}:${grade}`)
      .join(", ");
    return `place a 1-Health copy of one of your units on an adjacent empty space — destroyed by any damage, by being attacked, or if its original leaves (reachable grade by power ${breakpoints})`;
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

  if (card.effect.type === "DECK_DIG_KEEP_MATCHING") {
    return `draw up to ${card.effect.count} cards from your deck, keep every Spell and Specialty among them, and discard the rest`;
  }

  if (card.effect.type === "DRAW_TOP_ARTIFACT") {
    return "draw the top card of the Artifact deck into your hand";
  }

  if (card.effect.type === "SEARCH_DECK_THEN_RESHUFFLE") {
    return `search the top ${card.effect.count} cards of your deck (keep 1), then shuffle your discard pile into your deck`;
  }

  if (card.effect.type === "CANCEL_LETHAL_ATTACK") {
    return `cancel a killing blow on your ${card.effect.grade} unit`;
  }

  if (card.effect.type === "REDIRECT_SPELL") {
    return `redirect an enemy spell to a new ${card.effect.grade} target`;
  }

  if (card.effect.type === "INTERFERE_SPELL") {
    return `react to an enemy damaging spell on your unit: +${card.effect.amount} defense (expert +${card.effect.expertAmount}) for the Combat, which also reduces that spell's damage`;
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
    const to = card.effect.toUnitDefId.split(".").pop()?.replace(/_/g, " ");
    const acquire = card.effect.fromUnitDefId
      ? `discard a ${card.effect.fromSide} of ${card.effect.fromUnitDefId.split(".").pop()?.replace(/_/g, " ")}`
      : `pay ${card.effect.goldCost ?? 0} gold`;
    return `${acquire} to fetch the ${to} from the ${card.effect.toTier} Neutral deck`;
  }

  if (card.effect.type === "TARNUM_OVERLIMIT_SEARCH") {
    return `Search(1) the Spell deck ${card.effect.count} times into hand; cast any of those spells for free over the per-round limit, returning each to the Spell deck top or discard`;
  }

  if (card.effect.type === "PANDORA_VISIT") {
    return "resolve this Pandora card's map effect";
  }

  if (card.effect.type === "PANDORA_SILVER_REFRESH") {
    return "with a Silver unit: reverse one to Handful, or discard one for free Bronze+Silver recruits; else redraw";
  }

  if (card.effect.type === "PANDORA_SCRY") {
    const bonus = card.effect.then && card.effect.then.length > 0 ? ", then resolve a bonus" : "";
    return `peek the top ${card.effect.count} cards of the ${card.effect.deck} deck, discard up to ${card.effect.maxDiscard}, reorder the rest on top${bonus}`;
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

  if (card.effect.type === "DISRUPTING_RAY") {
    const breakpoints = Object.entries(card.effect.gradeByPower)
      .map(([power, grade]) => `${power}:${grade}`)
      .join(", ");
    return `until the end of the Combat, the selected unit cannot use its special ability (reachable grade by power ${breakpoints})`;
  }

  if (card.effect.type === "SACRIFICE_TRANSFER") {
    const breakpoints = Object.entries(card.effect.gradeByPower)
      .map(([power, grade]) => `${power}:${grade}`)
      .join(", ");
    return `transfer one of your units' damage onto another of your units, which perishes (reachable grade by power ${breakpoints})`;
  }

  if (card.effect.type === "REMOVE_OBSTACLE") {
    const breakpoints = Object.entries(card.effect.countByPower)
      .map(([power, count]) => `${power}:${count}`)
      .join(", ");
    return `remove obstacles from the Combat board — markers, Force Field / Fire Wall / Quicksand / Land Mine tokens, Walls or the Gate (count by power ${breakpoints})`;
  }

  return card.kind;
}
