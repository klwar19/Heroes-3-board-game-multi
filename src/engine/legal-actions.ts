import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { sampleBuildings } from "@/data/towns/buildings";
import {
  armyHasMapEffect,
  getTownOfPlayer,
  getUnitSide,
  hasRecruitResources,
  hasResources as playerHasResources,
  townHasBuildingEffect,
  unlockedRecruitTiers
} from "./adventure";
import {
  ATTACKER_BACKLINE,
  ATTACKER_FRONTLINE,
  DEFENDER_BACKLINE,
  DEFENDER_FRONTLINE,
  getHeroMoveDestinations,
  hillFortCost,
  isTileAdjacentToSpace,
  isTileRotationConnected,
  observatoryDiscoverTargets,
  removableHandCards
} from "./adventure-reducer";
import { effectAppliesToUnit } from "./active-effects";
import { cardCanBoostPower } from "./effects";
import {
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldLabel,
  getOrthogonalNeighbors,
  getReachableDestinations,
  isAdjacent,
  isBattlefieldPosition
} from "./battlefield";
import { getPermanentCardIds, getPermanentSchoolBonus, warMachinesForSale } from "./permanents";
import { getDemolishAbility, isArrowTowerUnit, siegeBlockedPositions } from "./siege";
import { canPlaceTransformOn } from "./unit-transforms";
import { SHARED_DECK_IDS } from "./decks";
import { expertUsesAvailable, getRuleset, spellLimitFor, wisdomGoldDiscount, wisdomSearchCount } from "./ruleset";
import type {
  AttackRerollSource,
  AttackRollMode,
  ActiveEffectState,
  BuildingId,
  BuildingLibrary,
  CardDefinition,
  CardPlayCost,
  CardPlayMode,
  CardLibrary,
  CombatState,
  CombatUnitState,
  EffectDefinition,
  GameAction,
  GameEvent,
  GameState,
  LegalAction,
  PlayerId,
  ResourceCost,
  ResourceKind,
  TargetDefinition,
  TargetRef,
  TownId,
  TriggerDefinition,
  UnitId
} from "./state";
import { getUnitAbilityDefinitions, hasUnitAbilityEffect } from "./unit-abilities";

type ConcreteEffect = Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;

/**
 * One playable face of a card: regular cards expose a single variant, while
 * "OR" cards expose one variant per printed option.
 */
type CardPlayVariant = {
  trigger?: TriggerDefinition;
  effect: ConcreteEffect;
  optionIndex?: number;
  optionLabel?: string;
  /** Printed extra price (discard/remove cards) of this option. */
  cost?: CardPlayCost;
  /** Option only playable outside combat. */
  mapOnly?: boolean;
  /** Option only playable during combat. */
  combatOnly?: boolean;
  /** Option is the card's expert side (costs a crown). */
  expertOnly?: boolean;
};

export function getCardPlayVariants(card: CardDefinition): CardPlayVariant[] {
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.map((option, optionIndex) => ({
      trigger: option.trigger,
      effect: option.effect,
      optionIndex,
      optionLabel: option.label,
      cost: option.cost,
      mapOnly: option.mapOnly,
      combatOnly: option.combatOnly,
      expertOnly: option.expertOnly
    }));
  }

  return [
    {
      trigger: card.trigger,
      effect: card.effect
    }
  ];
}

/** Whether the player can pay an option's card cost from hand right now. */
function canAffordCardCost(state: GameState, playerId: PlayerId, cardId: string, cost?: CardPlayCost): boolean {
  if (!cost || (cost.discardCards === undefined && cost.discardCardsUpTo === undefined)) {
    return true;
  }

  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  // The played card itself cannot pay its own cost.
  const rest = [...player.hand];
  const selfIndex = rest.indexOf(cardId);
  if (selfIndex !== -1) {
    rest.splice(selfIndex, 1);
  }

  const eligible =
    cost.costCardFilter === "spell"
      ? rest.filter((id) => cardLibrary[id]?.kind === "spell")
      : cost.costCardFilter === "power-source"
        ? rest.filter((id) => cardCanBoostPower(cardLibrary[id]))
        : rest;
  const needed = cost.discardCards ?? 0;
  return eligible.length >= needed;
}

/** Whether a unit currently has spell immunity covering its grade. */
export function isUnitSpellImmune(state: GameState, unit: CombatUnitState): boolean {
  const rank = (grade: CombatUnitState["grade"]) =>
    grade === "bronze" ? 0 : grade === "silver" ? 1 : grade === "gold" ? 2 : 3;

  return state.activeEffects.some(
    (effect) =>
      effect.target?.type === "unit" &&
      effect.target.unitId === unit.id &&
      effect.modifiers.some(
        (modifier) => modifier.type === "UNIT_SPELL_IMMUNE" && rank(unit.grade) <= rank(modifier.maxGrade)
      )
  );
}

export function isUnitAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

// isAdjacent moved to battlefield.ts (dependency-free) so active-effects and
// the permanents module can share it without import cycles.
export { isAdjacent } from "./battlefield";

/**
 * Printed movement values: ground and flying units move up to 3 spaces,
 * ranged units up to 1 space (after shooting or instead of attacking).
 */
export function getUnitMoveRange(unit: CombatUnitState): number {
  if (unit.type === "ranged") {
    return 1;
  }

  return 3;
}

export function getCombatObstacles(combat: CombatState): number[] {
  return combat.obstacles ?? [];
}

/**
 * Every unit card and obstacle token on the board is a Combat Obstacle.
 * They block movement paths for non-flying units and nobody can stop on them.
 */
function getBlockedSpaces(combat: CombatState, movingUnit?: CombatUnitState): Set<number> {
  const blocked = new Set<number>(getCombatObstacles(combat));

  for (const unit of Object.values(combat.units)) {
    if (isUnitAlive(unit) && unit.id !== movingUnit?.id) {
      blocked.add(unit.position);
    }
  }

  // Siege fortifications are Combat Obstacles; the Gate is open to the
  // defender ("Defending units may move through the Gate and may stop on it").
  if (combat.siege && movingUnit) {
    for (const position of siegeBlockedPositions(combat.siege, movingUnit)) {
      blocked.add(position);
    }
  }

  return blocked;
}

function activeEffectAppliesToUnit(effect: ActiveEffectState, unit: CombatUnitState): boolean {
  if (effect.scope === "global") {
    return true;
  }

  if (effect.scope === "player") {
    return effect.controllerId === unit.controllerId;
  }

  return effect.target?.type === "unit" && effect.target.unitId === unit.id;
}

function hasCannotMoveEffect(state: GameState | undefined, unit: CombatUnitState): boolean {
  return Boolean(
    state?.activeEffects.some(
      (effect) =>
        activeEffectAppliesToUnit(effect, unit) &&
        effect.modifiers.some((modifier) => modifier.type === "UNIT_CANNOT_MOVE")
    )
  );
}

export function canUnitMoveTo(
  combat: CombatState,
  unit: CombatUnitState,
  destination: number,
  state?: GameState
): boolean {
  return getLegalMoveDestinations(combat, unit, state).includes(destination);
}

export function getLegalMoveDestinations(combat: CombatState, unit: CombatUnitState, state?: GameState): number[] {
  if (!isUnitAlive(unit) || unit.activatedThisRound || unit.movedThisActivation) {
    return [];
  }

  if (hasCannotMoveEffect(state, unit)) {
    return [];
  }

  const blocked = getBlockedSpaces(combat, unit);

  // Arch Devils teleport: a regular move may land on any empty space.
  if (hasUnitAbilityEffect(unit, "MOVE_ANYWHERE")) {
    return Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, position) => position).filter(
      (position) => position !== unit.position && !blocked.has(position)
    );
  }

  return getReachableDestinations(
    unit.position,
    getUnitMoveRange(unit),
    blocked,
    unit.type === "flying"
  ).filter(isBattlefieldPosition);
}

/** Initiative including Haste/Slow and other lasting bonuses on the unit. */
export function effectiveInitiative(unit: CombatUnitState, activeEffects: ActiveEffectState[] = []): number {
  const bonus = activeEffects.reduce((total, effect) => {
    if (!effectAppliesToUnit(effect, unit)) {
      return total;
    }
    return (
      total +
      effect.modifiers.reduce(
        (sum, modifier) => (modifier.type === "INITIATIVE_BONUS" ? sum + modifier.amount : sum),
        0
      )
    );
  }, 0);

  return unit.initiative + bonus;
}

export function sortUnitsForActivation(combat: CombatState, activeEffects: ActiveEffectState[] = []): CombatUnitState[] {
  return Object.values(combat.units)
    .filter(isUnitAlive)
    .sort((left, right) => {
      const leftInitiative = effectiveInitiative(left, activeEffects);
      const rightInitiative = effectiveInitiative(right, activeEffects);
      if (rightInitiative !== leftInitiative) {
        return rightInitiative - leftInitiative;
      }

      if (left.controllerId === combat.attackerPlayerId && right.controllerId !== combat.attackerPlayerId) {
        return -1;
      }

      if (right.controllerId === combat.attackerPlayerId && left.controllerId !== combat.attackerPlayerId) {
        return 1;
      }

      return left.id.localeCompare(right.id);
    });
}

export function getNextUnitToActivate(combat: CombatState, activeEffects: ActiveEffectState[] = []): CombatUnitState | null {
  return sortUnitsForActivation(combat, activeEffects).find((unit) => !unit.activatedThisRound) ?? null;
}

function hasAdjacentEnemy(combat: CombatState, unit: CombatUnitState): boolean {
  return Object.values(combat.units).some(
    (candidate) =>
      candidate.controllerId !== unit.controllerId &&
      isUnitAlive(candidate) &&
      isAdjacent(candidate.position, unit.position)
  );
}

export function getAttackKind(attacker: CombatUnitState, defender: CombatUnitState): "melee" | "ranged" {
  return attacker.type === "ranged" && !isAdjacent(attacker.position, defender.position) ? "ranged" : "melee";
}

function isBackRow(position: number): boolean {
  const row = Math.floor(position / BATTLEFIELD_COLUMNS);
  return row === 0 || row === BATTLEFIELD_ROWS - 1;
}

function isOppositeBackRow(leftPosition: number, rightPosition: number): boolean {
  const leftRow = Math.floor(leftPosition / BATTLEFIELD_COLUMNS);
  const rightRow = Math.floor(rightPosition / BATTLEFIELD_COLUMNS);

  return (
    (leftRow === 0 && rightRow === BATTLEFIELD_ROWS - 1) ||
    (leftRow === BATTLEFIELD_ROWS - 1 && rightRow === 0)
  );
}

/** Ammo Cart and friends: a player-scoped waiver of the ranged penalties. */
function hasRangedPenaltyWaiver(state: GameState | undefined, unit: CombatUnitState): boolean {
  return Boolean(
    state?.activeEffects.some(
      (effect) =>
        activeEffectAppliesToUnit(effect, unit) &&
        effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_ALL_PENALTIES")
    )
  );
}

export function getAttackRollMode(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  state?: GameState
): AttackRollMode {
  const ignoresPenalty =
    hasUnitAbilityEffect(attacker, "IGNORE_RANGED_BACK_ROW_PENALTY") || hasRangedPenaltyWaiver(state, attacker);

  if (attacker.type === "ranged" && getAttackKind(attacker, defender) === "melee" && !ignoresPenalty) {
    return "disadvantage";
  }

  if (
    getAttackKind(attacker, defender) === "ranged" &&
    !ignoresPenalty &&
    isBackRow(attacker.position) &&
    isBackRow(defender.position) &&
    isOppositeBackRow(attacker.position, defender.position)
  ) {
    return "disadvantage";
  }

  // Neutral Crusaders: "roll 2 Attack dice and resolve the higher outcome".
  // Unlike a reroll this is automatic — both dice roll at once and the better
  // one counts, no player decision involved.
  if (hasUnitAbilityEffect(attacker, "ATTACK_ROLL_ADVANTAGE")) {
    return "advantage";
  }

  return "normal";
}

/**
 * Whether a reroll source can fire against the current (latest) roll: it
 * needs uses left, and face-gated sources like the Crusaders' 'every "0"'
 * only while the die actually shows that face.
 */
export function rerollSourceAvailableFor(source: AttackRerollSource, currentRoll: number): boolean {
  if (source.remaining <= 0) {
    return false;
  }

  if (source.onlyOnRoll !== undefined && currentRoll !== source.onlyOnRoll) {
    return false;
  }

  return true;
}

export function canUnitAttack(combat: CombatState, attacker: CombatUnitState, defender: CombatUnitState): boolean {
  if (!isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  if (attacker.controllerId === defender.controllerId) {
    return false;
  }

  if (attacker.type === "ranged") {
    // Ranged units either shoot then step 1, or move 1 without attacking —
    // a ranged unit that has already moved gave up its attack.
    if (attacker.movedThisActivation) {
      return false;
    }

    if (hasAdjacentEnemy(combat, attacker)) {
      return isAdjacent(attacker.position, defender.position);
    }

    return true;
  }

  return isAdjacent(attacker.position, defender.position);
}

export function canUnitMoveAndAttack(
  combat: CombatState,
  attacker: CombatUnitState,
  destination: number,
  defender: CombatUnitState,
  state?: GameState
): boolean {
  if (attacker.type === "ranged" || !canUnitMoveTo(combat, attacker, destination, state)) {
    return false;
  }

  const movedAttacker = {
    ...attacker,
    position: destination
  };
  const virtualCombat = {
    ...combat,
    units: {
      ...combat.units,
      [attacker.id]: movedAttacker
    }
  };

  return canUnitAttack(virtualCombat, movedAttacker, defender);
}

function unitMatchesTarget(unit: CombatUnitState, target: Exclude<TargetDefinition, { type: "none" }>): boolean {
  if (target.unitTypes && !target.unitTypes.includes(unit.type)) {
    return false;
  }

  if (target.damagedOnly && unit.damage <= 0) {
    return false;
  }

  return true;
}

function getEnemyTargets(
  state: GameState,
  playerId: PlayerId,
  target: Exclude<TargetDefinition, { type: "none" }>
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  return Object.values(state.combat.units)
    .filter((unit) => unit.controllerId !== playerId)
    .filter(isUnitAlive)
    .filter((unit) => unitMatchesTarget(unit, target))
    .map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

function getFriendlyTargets(
  state: GameState,
  playerId: PlayerId,
  target: Exclude<TargetDefinition, { type: "none" }>
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  return Object.values(state.combat.units)
    .filter((unit) => unit.controllerId === playerId)
    .filter(isUnitAlive)
    .filter((unit) => unitMatchesTarget(unit, target))
    .map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

function getTargetsForCard(state: GameState, playerId: PlayerId, cardId: string, cards: CardLibrary): TargetRef[] {
  const card = cards[cardId];
  const targetType =
    card?.target?.type ??
    (card?.effect.type === "HEAL_DAMAGE"
      ? "friendly-unit"
      : card?.effect.type === "CREATE_ACTIVE_EFFECT"
        ? "none"
        : "enemy-unit");

  if (targetType === "none") {
    return [{ type: "none" }];
  }

  const target =
    card?.target && card.target.type !== "none"
      ? card.target
      : ({ type: targetType } as Exclude<TargetDefinition, { type: "none" }>);

  const targets =
    target.type === "friendly-unit"
      ? getFriendlyTargets(state, playerId, target)
      : target.type === "any-unit"
        ? [...getFriendlyTargets(state, playerId, target), ...getEnemyTargets(state, playerId, target)]
        : getEnemyTargets(state, playerId, target);

  // Anti-Magic: spell-immune units cannot be targeted by Spell cards.
  if (card?.kind === "spell") {
    return targets.filter((candidate) => {
      if (candidate.type !== "unit") {
        return true;
      }
      const unit = state.combat?.units[candidate.unitId];
      return !unit || !isUnitSpellImmune(state, unit);
    });
  }

  return targets;
}

function isPhaseAllowedForCard(state: GameState, card: CardDefinition): boolean {
  return !card.phaseLimit || card.phaseLimit.includes(state.phase);
}

function getAttackRerollsForMode(card: CardDefinition, mode: CardPlayMode): number {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
    return 0;
  }

  if (mode === "expert") {
    return card.effect.expertRerolls ?? card.effect.basicRerolls;
  }

  return card.effect.basicRerolls;
}

function getPlayableModesForCard(state: GameState, playerId: PlayerId, card: CardDefinition): CardPlayMode[] {
  if (card.effect.type === "CREATE_ATTACK_DIE_REROLL" && card.effect.basicRerolls <= 0) {
    return card.effect.expertRerolls && state.players[playerId].combatStats.expertUsesSpentThisRound < state.players[playerId].limits.expertUses
      ? ["expert"]
      : [];
  }

  const modes: CardPlayMode[] = ["basic"];

  if (
    (card.effect.type === "ADD_COMBAT_STAT" ||
      card.effect.type === "ADD_SPELL_POWER" ||
      card.effect.type === "CREATE_ACTIVE_EFFECT" ||
      card.effect.type === "CREATE_ATTACK_DIE_REROLL") &&
    ((card.effect.type === "CREATE_ACTIVE_EFFECT" && card.effect.expertEffect) ||
      (card.effect.type === "CREATE_ATTACK_DIE_REROLL" && card.effect.expertRerolls && card.effect.expertRerolls > 0) ||
      ("expertAmount" in card.effect && card.effect.expertAmount !== undefined)) &&
    state.players[playerId].combatStats.expertUsesSpentThisRound < state.players[playerId].limits.expertUses
  ) {
    modes.push("expert");
  }

  return modes.filter((mode) => {
    if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
      return true;
    }

    return getAttackRerollsForMode(card, mode) > 0;
  });
}

/** True while combat is running and no attack, reaction or choice is resolving. */
function isCombatCardWindowOpen(state: GameState): boolean {
  return Boolean(
    state.combat &&
      !state.combat.outcome &&
      !state.combat.setup &&
      !state.combat.awaitingContinue &&
      state.phase === "combat" &&
      state.stack.length === 0 &&
      !state.reactionWindow &&
      !state.pendingChoice
  );
}

function isCombatParticipant(state: GameState, playerId: PlayerId): boolean {
  return Boolean(
    state.combat && (state.combat.attackerPlayerId === playerId || state.combat.defenderPlayerId === playerId)
  );
}

/**
 * Garrison defense lock: the town owner defending without their hero "cannot
 * use your Deck during this Combat" — every card play is off for them.
 */
export function isHandLockedInCombat(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  return Boolean(
    combat &&
      combat.context.kind === "player" &&
      combat.context.defenderHeroId === null &&
      combat.defenderPlayerId === playerId
  );
}

/**
 * Spell casting by the printed timing symbols — limited to one Spell card per
 * player per combat round (Knowledge/Necklace raise it):
 *  - Activation spells (Magic Arrow, Fireball, Haste…) are cast while one of
 *    YOUR units is active, before it attacks.
 *  - Trigger-free instant spells (Cure, Counterstrike) may be cast at any
 *    open moment of the combat by either fighter.
 *  - Instant spells with an attack trigger (Bloodlust, Stone Skin, Curse…)
 *    are played inside the attack windows instead, never cast directly.
 */
function addSpellActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  if (!isCombatCardWindowOpen(state) || !isCombatParticipant(state, playerId) || isHandLockedInCombat(state, playerId)) {
    return;
  }

  const player = state.players[playerId];
  if (!player || player.combatStats.spellsCastThisRound >= spellLimitFor(state, player)) {
    return;
  }

  const combat = state.combat;
  const activeUnit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === playerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
      continue;
    }

    // Attack-window instants and "OR" spells route through the card plays.
    if (card.trigger || card.effect.type === "CHOOSE_ONE" || card.timing === "map") {
      continue;
    }

    if (!isPhaseAllowedForCard(state, card)) {
      continue;
    }

    // Activation spells need one of your own units active, pre-attack.
    const needsOwnActivation = card.timing === "combat" || card.timing === "action";
    if (needsOwnActivation && !ownActivationOpen) {
      continue;
    }

    // Earthquake works only against standing siege fortifications.
    if (card.effect.type === "EARTHQUAKE") {
      const siege = combat?.siege;
      if (!siege || (siege.walls.length === 0 && siege.gatePosition === null)) {
        continue;
      }
    }

    for (const target of getTargetsForCard(state, playerId, cardId, cards)) {
      actions.push({
        label: `Cast ${card.name}`,
        action: {
          type: "CAST_SPELL",
          playerId,
          cardId,
          target
        }
      });
    }
  }
}

function getTransformTargets(
  state: GameState,
  playerId: PlayerId,
  effect: Extract<ConcreteEffect, { type: "TRANSFORM_UNIT" }>
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  return Object.values(state.combat.units)
    .filter(
      (unit) =>
        unit.controllerId === playerId &&
        isUnitAlive(unit) &&
        canPlaceTransformOn(unit.name, unit.variant, unit.transforms, effect)
    )
    .map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

/**
 * Non-spell cards during combat, with the printed timing rules:
 *  - Instant cards may be played at any time (both players), except while an
 *    attack resolves — trigger cards wait for their reaction window instead.
 *  - Ongoing and activation cards may only be played while one of your own
 *    units is active and before it attacks.
 */
function addPlayableCardActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const player = state.players[playerId];
  const combat = state.combat;
  if (!player || !combat || !isCombatCardWindowOpen(state) || !isCombatParticipant(state, playerId)) {
    return;
  }

  // Garrison defense: the heroless defender cannot use their deck.
  if (isHandLockedInCombat(state, playerId)) {
    return;
  }

  const activeUnit = combat.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === playerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.kind === "spell" || card.implementationStatus !== "implemented") {
      continue;
    }

    // Permanents are played like activation cards: during one of your own
    // unit's activations, before it attacks. They enter play instead of
    // resolving (replacing the previous permanent).
    if (card.permanent) {
      if (ownActivationOpen) {
        actions.push({
          label: `Put ${card.name} into play`,
          action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
        });
      }
      continue;
    }

    if (card.trigger || !isPhaseAllowedForCard(state, card)) {
      continue;
    }

    if (card.timing !== "combat" && card.timing !== "instant" && card.timing !== "ongoing" && card.timing !== "action") {
      continue;
    }

    const needsOwnActivation = card.timing !== "instant";
    if (needsOwnActivation && !ownActivationOpen) {
      continue;
    }

    if (card.effect.type === "CHOOSE_ONE") {
      // Options with a trigger wait for their reaction window; the rest play
      // directly when their effect makes sense in combat.
      addOptionPlays(actions, state, playerId, card, cardId, "combat", cards);
      continue;
    }

    if (card.effect.type === "TRANSFORM_UNIT") {
      for (const target of getTransformTargets(state, playerId, card.effect)) {
        actions.push({
          label: `Play ${card.name}`,
          action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target }
        });
      }
      continue;
    }

    // Necromancy is a map ability played after a combat win, never during one.
    if (card.effect.type === "NECROMANCY_REINFORCE") {
      continue;
    }

    for (const mode of getPlayableModesForCard(state, playerId, card)) {
      for (const target of getTargetsForCard(state, playerId, cardId, cards)) {
        actions.push({
          label: `Play ${card.name}${mode === "expert" ? " expert" : ""}`,
          action: {
            type: "PLAY_CARD",
            playerId,
            cardId,
            mode,
            target
          }
        });
      }
    }
  }
}

/** Effects an "OR" option may resolve directly in the given context. */
function isOptionEffectPlayable(
  state: GameState,
  playerId: PlayerId,
  effect: ConcreteEffect,
  context: "combat" | "map"
): boolean {
  switch (effect.type) {
    case "DRAW_CARDS":
    case "GAIN_RESOURCES":
    case "GAIN_MORALE":
    case "ENEMY_MORALE_STRIP":
    case "ROLL_FOR_MORALE":
    case "RANDOM_ENEMY_DISCARD":
    case "GAIN_EXPERT_USE":
    case "CREATE_ACTIVE_EFFECT":
      return true;
    case "TAKE_FROM_DISCARD": {
      if (context !== "map" || !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      const pool = effect.fromTop ? (player?.discard.slice(-effect.fromTop) ?? []) : (player?.discard ?? []);
      return pool.some((cardId) => {
        const kind = cardLibrary[cardId]?.kind;
        if (effect.filter === "spell") {
          return kind === "spell";
        }
        if (effect.filter === "non-artifact") {
          return kind !== "artifact";
        }
        return true;
      });
    }
    case "CARD_DECK_SEARCH":
    case "EAGLE_EYE_DIG":
    case "TELEPORT_HERO_TO_TOWN":
    case "DISCOVER_TILE_CARD":
    case "GAIN_HERO_MOVEMENT":
      return context === "map" && Boolean(state.adventure);
    case "CREATE_INITIATIVE_BUFF":
    case "CREATE_ATTACK_BUFF":
    case "CREATE_DEFENSE_BUFF":
    case "ADD_UNIT_MAX_HEALTH":
    case "HEAL_DAMAGE":
    case "AREA_DAMAGE_ALL_ADJACENT":
      return context === "combat" && Boolean(state.combat);
    case "SIEGE_DEMOLISH": {
      const siege = state.combat?.siege;
      if (context !== "combat" || !siege) {
        return false;
      }
      return effect.target === "arrow-tower"
        ? Boolean(siege.arrowTowerUnitId)
        : siege.walls.length > 0 || siege.gatePosition !== null;
    }
    default:
      return false;
  }
}

/** Whether the option's effect needs a unit on the battlefield as target. */
function optionNeedsUnitTarget(effect: ConcreteEffect): boolean {
  return (
    effect.type === "CREATE_INITIATIVE_BUFF" ||
    effect.type === "CREATE_ATTACK_BUFF" ||
    effect.type === "CREATE_DEFENSE_BUFF" ||
    effect.type === "ADD_UNIT_MAX_HEALTH" ||
    effect.type === "HEAL_DAMAGE" ||
    effect.type === "AREA_DAMAGE_ALL_ADJACENT"
  );
}

/**
 * Direct plays of "OR" card options outside reaction windows — Estates'
 * gold, Logistics' ongoing step, an artifact's "Remove this card: gain 6
 * gold", Boots of Speed's initiative side, and so on.
 */
function addOptionPlays(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  cardId: string,
  context: "combat" | "map",
  cards: CardLibrary
): void {
  if (card.effect.type !== "CHOOSE_ONE") {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }

  // Spell "OR" cards (Prayer) still respect the combat spell limit.
  if (card.kind === "spell" && state.combat && player.combatStats.spellsCastThisRound >= spellLimitFor(state, player)) {
    return;
  }

  for (const [optionIndex, option] of card.effect.options.entries()) {
    if (option.trigger) {
      continue;
    }
    if (option.mapOnly && context !== "map") {
      continue;
    }
    if (option.combatOnly && context !== "combat") {
      continue;
    }
    if (!isOptionEffectPlayable(state, playerId, option.effect, context)) {
      continue;
    }
    if (!canAffordCardCost(state, playerId, cardId, option.cost)) {
      continue;
    }

    const modes: CardPlayMode[] = option.expertOnly
      ? expertUsesAvailable(player) > 0
        ? ["expert"]
        : []
      : effectSupportsExpertOption(option.effect) && expertUsesAvailable(player) > 0
        ? ["basic", "expert"]
        : ["basic"];

    const targets = optionNeedsUnitTarget(option.effect)
      ? getTargetsForCard(state, playerId, cardId, cards)
      : [{ type: "none" } as TargetRef];

    for (const mode of modes) {
      for (const target of targets) {
        actions.push({
          label: `${card.name}: ${option.label}${mode === "expert" && !option.expertOnly ? " (expert)" : ""}`,
          action: {
            type: "PLAY_CARD",
            playerId,
            cardId,
            mode,
            optionIndex,
            target
          }
        });
      }
    }
  }
}

/** Expert sides of option effects playable outside reaction windows. */
function effectSupportsExpertOption(effect: ConcreteEffect): boolean {
  if (effect.type === "DRAW_CARDS") {
    return effect.expertAmount !== undefined;
  }
  if (effect.type === "GAIN_RESOURCES") {
    return effect.expertGain !== undefined;
  }
  if (effect.type === "GAIN_HERO_MOVEMENT") {
    return effect.expertAmount !== undefined;
  }
  if (effect.type === "GAIN_MORALE") {
    return effect.expertDrawCards !== undefined;
  }
  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return Boolean(effect.expertEffect);
  }
  // Eagle Eye: the expert play digs for an Expert spell instead.
  if (effect.type === "EAGLE_EYE_DIG") {
    return true;
  }
  return false;
}

/** Effects that do something useful when played on the adventure map. */
function isMapPlayableEffect(state: GameState, playerId: PlayerId, card: CardDefinition, effect: ConcreteEffect): boolean {
  if (card.timing === "map") {
    return true;
  }

  if (effect.type === "DRAW_CARDS" || effect.type === "GAIN_MORALE") {
    return true;
  }

  // Offense/Armorer: "may be played outside Combat just for the draw."
  if (effect.type === "ADD_COMBAT_STAT" && effect.drawCards) {
    return true;
  }

  if (
    effect.type === "GAIN_RESOURCES" ||
    effect.type === "ENEMY_MORALE_STRIP" ||
    effect.type === "ROLL_FOR_MORALE" ||
    effect.type === "RANDOM_ENEMY_DISCARD" ||
    effect.type === "GAIN_EXPERT_USE" ||
    // Gem's First Aid: grab the Tent from the supply (or draw) on the map.
    effect.type === "GAIN_WAR_MACHINE"
  ) {
    return true;
  }

  if (isOptionEffectPlayable(state, playerId, effect, "map") && effect.type !== "CREATE_ACTIVE_EFFECT") {
    return true;
  }

  return (
    effect.type === "CREATE_ACTIVE_EFFECT" &&
    effect.effect.modifiers.some(
      (modifier) =>
        modifier.type === "ADVENTURE_DIE_REROLL" ||
        modifier.type === "SEARCH_COUNT_OVERRIDE" ||
        modifier.type === "SEARCH_REPEAT_ONCE" ||
        modifier.type === "SPELL_SCHOOL_FETCH" ||
        modifier.type === "RECRUIT_DISCOUNT" ||
        modifier.type === "END_TURN_ADJACENT_MOVE" ||
        modifier.type === "HERO_MOVE_THROUGH"
    )
  );
}

/**
 * Cards playable during your own map turn, outside combat: Instant and
 * Ongoing cards (Luck before dice, Estates' gold, Scouting before a search,
 * Eagle Eye, map spells like Town Portal…). Map-timed cards can never be
 * used during combat.
 */
function addTurnCardActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const player = state.players[playerId];
  if (!player || state.combat || state.activePlayerId !== playerId || state.pendingChoice || state.reactionWindow) {
    return;
  }

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.implementationStatus !== "implemented") {
      continue;
    }

    // Permanents may also enter play on the owner's map turn (they are
    // played the same way as map cards).
    if (card.permanent) {
      actions.push({
        label: `Put ${card.name} into play`,
        action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
      });
      continue;
    }

    // Trigger cards wait for their windows — except Offense/Armorer, which
    // the wiki allows playing outside Combat just for the card draw.
    const drawOnly = card.effect.type === "ADD_COMBAT_STAT" && Boolean(card.effect.drawCards);
    if (card.trigger && !drawOnly) {
      continue;
    }

    // Spells only reach the map when printed as Map effects (Town Portal).
    if (card.kind === "spell" && card.timing !== "map") {
      continue;
    }

    if (card.timing !== "instant" && card.timing !== "ongoing" && card.timing !== "map") {
      continue;
    }

    if (card.effect.type === "CHOOSE_ONE") {
      addOptionPlays(actions, state, playerId, card, cardId, "map", cards);
      continue;
    }

    // Necromancy: playable on the map only in the window after winning a
    // Combat other than a Quick Combat, and only by a Necropolis hero.
    if (card.effect.type === "NECROMANCY_REINFORCE") {
      if (player.necromancyWindow && player.factionId === "necropolis") {
        const modes: CardPlayMode[] = expertUsesAvailable(player) > 0 ? ["basic", "expert"] : ["basic"];
        for (const mode of modes) {
          actions.push({
            label: `Play ${card.name}${mode === "expert" ? " (expert)" : ""}`,
            action: { type: "PLAY_CARD", playerId, cardId, mode, target: { type: "none" } }
          });
        }
      }
      continue;
    }

    // Sandro's Cloak: place the specialty card on a matching unit card during
    // your turn (it rides into the next combat).
    if (card.effect.type === "TRANSFORM_UNIT") {
      const effectDef = card.effect;
      for (const armyUnit of player.army) {
        const def = coreUnitDefinitions[armyUnit.unitDefId];
        if (def && canPlaceTransformOn(def.name, armyUnit.side, armyUnit.transforms, effectDef)) {
          actions.push({
            label: `Place ${card.name} on ${def.name}`,
            action: {
              type: "PLAY_CARD",
              playerId,
              cardId,
              mode: "basic",
              target: { type: "none" },
              armyUnitId: armyUnit.id
            }
          });
        }
      }
      continue;
    }

    const effect = card.effect;
    if (!isMapPlayableEffect(state, playerId, card, effect)) {
      continue;
    }

    const modes: CardPlayMode[] =
      effectSupportsExpertOption(effect) && expertUsesAvailable(player) > 0 ? ["basic", "expert"] : ["basic"];
    for (const mode of modes) {
      actions.push({
        label: `Play ${card.name}${mode === "expert" ? " (expert)" : ""}`,
        action: { type: "PLAY_CARD", playerId, cardId, mode, target: { type: "none" } }
      });
    }
  }
}

function isSimultaneousTurnAvailable(state: GameState, playerId: PlayerId): boolean {
  return (
    state.turn.mode === "simultaneous" &&
    state.round <= state.turn.simultaneousRoundLimit &&
    state.phase !== "combat" &&
    state.phase !== "reaction" &&
    !state.turn.completedPlayerIds.includes(playerId)
  );
}

/**
 * Rulebook voluntary removal: the owner may put an in-play permanent into
 * the discard pile at any open moment (no reaction window or choice pending).
 */
function addPermanentDiscardActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }

  for (const cardId of getPermanentCardIds(state, playerId)) {
    actions.push({
      label: `Discard ${cardLibrary[cardId]?.name ?? cardId} from play`,
      action: { type: "DISCARD_PERMANENT", playerId, cardId }
    });
  }
}

function addActiveEffectActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || state.phase !== "combat" || state.stack.length > 0 || state.reactionWindow || state.pendingChoice) {
    return;
  }

  const player = state.players[playerId];
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }

    const healModifier = effect.modifiers.find((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND");
    if (!healModifier || healModifier.type !== "HEAL_ONCE_PER_COMBAT_ROUND") {
      continue;
    }

    // First Aid Tent: one basic heal per round, OR — if the card has an expert
    // and an expert use is free — spend it to heal several times this round.
    const usage = effect.healRound?.round === combat.round ? effect.healRound : undefined;
    const expertMax = healModifier.expertUsesPerRound ?? 0;
    const crowns = player ? expertUsesAvailable(player) : 0;
    const canBasic = !usage;
    const canExpertActivate = !usage && expertMax > 1 && crowns > 0;
    const canExpertContinue = Boolean(usage?.expert && usage.count < expertMax);
    if (!canBasic && !canExpertActivate && !canExpertContinue) {
      continue;
    }

    for (const unit of Object.values(combat.units)) {
      if (unit.controllerId !== playerId || !isUnitAlive(unit) || unit.damage <= 0) {
        continue;
      }
      const target = { type: "unit" as const, unitId: unit.id };

      // Basic heal and expert continuations omit the mode (it defaults to
      // basic), so plays submitted without a mode still match.
      if (canBasic) {
        actions.push({
          label: `${effect.name} heal ${unit.name}`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target }
        });
      }
      if (canExpertActivate) {
        actions.push({
          label: `${effect.name} expert: heal ${unit.name} (1/${expertMax}, spend 1 crown)`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target, mode: "expert" }
        });
      }
      if (canExpertContinue) {
        actions.push({
          label: `${effect.name} heal ${unit.name} (${(usage?.count ?? 0) + 1}/${expertMax})`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target }
        });
      }
    }
  }
}

function addUnitAbilityActions(actions: LegalAction[], state: GameState, playerId: PlayerId, activeUnit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || activeUnit.movedThisActivation) {
    return;
  }

  for (const ability of getUnitAbilityDefinitions(activeUnit)) {
    if (ability.implementationStatus !== "implemented") {
      continue;
    }

    if (ability.effect?.type === "ACTIVATION_ATTACK_BUFF") {
      for (const target of Object.values(combat.units)) {
        if (
          target.controllerId !== playerId ||
          !isUnitAlive(target) ||
          !ability.effect.targetTypes.includes(target.type)
        ) {
          continue;
        }

        actions.push({
          label: `${activeUnit.name} use ${ability.name} on ${target.name}`,
          action: {
            type: "USE_UNIT_ABILITY",
            playerId,
            unitId: activeUnit.id,
            abilityId: ability.id,
            target: { type: "unit", unitId: target.id }
          }
        });
      }
    }

    // Pit Lords' "Summon Demons" other action: only after a friendly unit has
    // been removed this combat, and once per combat per Pit Lords unit. Used
    // instead of moving or attacking (the caller already gated on those).
    if (
      ability.effect?.type === "SUMMON_OR_REINFORCE_DEMONS" &&
      combat.unitRemovedControllerIds?.includes(playerId) &&
      !activeUnit.summonedThisCombat
    ) {
      const demonDefId = ability.effect.demonUnitDefId;
      const demonName = coreUnitDefinitions[demonDefId]?.name ?? "Demons";

      // Summon: place a Few of Demons on an empty adjacent space.
      if (getUnitSide(demonDefId, "few")) {
        const occupied = new Set<number>(
          Object.values(combat.units)
            .filter(isUnitAlive)
            .map((candidate) => candidate.position)
        );
        for (const position of combat.obstacles ?? []) {
          occupied.add(position);
        }
        for (const position of getOrthogonalNeighbors(activeUnit.position)) {
          if (!isBattlefieldPosition(position) || occupied.has(position)) {
            continue;
          }
          actions.push({
            label: `${activeUnit.name}: Summon a Few of ${demonName} at ${getBattlefieldLabel(position)}`,
            action: { type: "SUMMON_DEMONS", playerId, unitId: activeUnit.id, mode: "summon", position }
          });
        }
      }

      // Reinforce: flip a friendly Few of Demons up to a Pack at no cost.
      if (getUnitSide(demonDefId, "pack")) {
        for (const candidate of Object.values(combat.units)) {
          if (
            candidate.controllerId === playerId &&
            isUnitAlive(candidate) &&
            candidate.unitDefId === demonDefId &&
            candidate.variant === "few"
          ) {
            actions.push({
              label: `${activeUnit.name}: Reinforce ${candidate.cardName} to a Pack`,
              action: {
                type: "SUMMON_DEMONS",
                playerId,
                unitId: activeUnit.id,
                mode: "reinforce",
                targetUnitId: candidate.id
              }
            });
          }
        }
      }
    }

    // Token "other actions": Ogres' Attack token, Few Sorceresses' Weakness.
    if (ability.effect?.type === "PLACE_TOKEN_ACTION") {
      const effect = ability.effect;
      for (const target of Object.values(combat.units)) {
        const sideOk =
          effect.targets === "any" ||
          (effect.targets === "friendly" && target.controllerId === activeUnit.controllerId) ||
          (effect.targets === "enemy" && target.controllerId !== activeUnit.controllerId);
        if (!sideOk || !isUnitAlive(target) || isArrowTowerUnit(target)) {
          continue;
        }
        if (effect.targetTypes && !effect.targetTypes.includes(target.type)) {
          continue;
        }

        actions.push({
          label: `${activeUnit.name}: ${ability.name} (${effect.amount >= 0 ? "+" : ""}${effect.amount}) on ${target.cardName}`,
          action: {
            type: "USE_UNIT_ABILITY",
            playerId,
            unitId: activeUnit.id,
            abilityId: ability.id,
            target: { type: "unit", unitId: target.id }
          }
        });
      }
    }
  }
}

/**
 * Siege demolition: the active unit may bring down a Wall or the Gate as its
 * attack — adjacent ground/flying units always, Cyclops-style units at any
 * range (their pack version also levels the Arrow Tower).
 */
function addFortificationActions(actions: LegalAction[], state: GameState, playerId: PlayerId, activeUnit: CombatUnitState): void {
  const combat = state.combat;
  const siege = combat?.siege;
  if (!combat || !siege || activeUnit.attackedThisActivation) {
    return;
  }

  const demolish = getDemolishAbility(activeUnit);
  const targets: { kind: "wall" | "gate"; position: number }[] = [
    ...siege.walls.map((position) => ({ kind: "wall" as const, position })),
    ...(siege.gatePosition !== null ? [{ kind: "gate" as const, position: siege.gatePosition }] : [])
  ];

  for (const target of targets) {
    const adjacentDemolisher =
      activeUnit.type !== "ranged" && isAdjacent(activeUnit.position, target.position);
    if (!adjacentDemolisher && !demolish) {
      continue;
    }

    actions.push({
      label: `${activeUnit.cardName} destroy the ${target.kind === "wall" ? "Wall" : "Gate"} at ${getBattlefieldLabel(target.position)}`,
      action: { type: "ATTACK_FORTIFICATION", playerId, attackerId: activeUnit.id, target }
    });
  }

  if (demolish?.canTargetArrowTower && siege.arrowTowerUnitId) {
    actions.push({
      label: `${activeUnit.cardName} destroy the Arrow Tower`,
      action: { type: "ATTACK_FORTIFICATION", playerId, attackerId: activeUnit.id, target: { kind: "arrow-tower" } }
    });
  }
}

function addUnitActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (combat && (combat.setup || combat.awaitingContinue)) {
    return;
  }

  if (!combat?.activeUnitId) {
    if (combat && playerId === combat.attackerPlayerId && state.mode !== "adventure") {
      actions.push({
        label: "Start next combat round",
        action: { type: "END_COMBAT_ROUND", playerId }
      });
    }
    return;
  }

  const activeUnit = combat.units[combat.activeUnitId];
  if (!activeUnit || activeUnit.controllerId !== playerId || activeUnit.activatedThisRound) {
    return;
  }

  const alreadyAttacked = Boolean(activeUnit.attackedThisActivation);

  if (!alreadyAttacked) {
    addUnitAbilityActions(actions, state, playerId, activeUnit);
    addFortificationActions(actions, state, playerId, activeUnit);
  }

  for (const destination of getLegalMoveDestinations(combat, activeUnit, state)) {
    actions.push({
      label: `${activeUnit.name} move to ${getBattlefieldLabel(destination)}`,
      action: {
        type: "MOVE_UNIT",
        playerId,
        unitId: activeUnit.id,
        destination
      }
    });
  }

  // Ranged units shoot first and may step afterwards; everyone else may move
  // first and then attack an adjacent enemy. canUnitAttack enforces that a
  // ranged unit that already moved gave up its attack.
  if (!alreadyAttacked) {
    for (const defender of Object.values(combat.units)) {
      if (!canUnitAttack(combat, activeUnit, defender)) {
        continue;
      }

      actions.push({
        label: `${activeUnit.name} attack ${defender.name}`,
        action: {
          type: "ATTACK_UNIT",
          playerId,
          attackerId: activeUnit.id,
          defenderId: defender.id
        }
      });
    }
  }

  if (!alreadyAttacked && !isArrowTowerUnit(activeUnit)) {
    // Defend replaces the attack, so a unit that already moved may still
    // defend. The Arrow Tower never defends — it only shoots or holds.
    actions.push({
      label: `${activeUnit.name} defend`,
      action: {
        type: "DEFEND_UNIT",
        playerId,
        unitId: activeUnit.id
      }
    });
  }

  // Once a unit has begun acting (moved or fired), it may finish its activation
  // without forcing an attack or defend — e.g. a ranged unit holding after a
  // shot. The Arrow Tower may always hold instead of shooting.
  if (alreadyAttacked || activeUnit.movedThisActivation || isArrowTowerUnit(activeUnit)) {
    actions.push({
      label: `${activeUnit.name} hold position`,
      action: {
        type: "END_ACTIVATION",
        playerId,
        unitId: activeUnit.id
      }
    });
  }
}

function addDeckSearchActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  // Searches are normally granted by rewards (level ups, treasure fields,
  // town actions). Until the adventure-map reward loop is implemented, the
  // active player may demo the full search flow from the table decks.
  if (state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }

  if (state.activePlayerId !== playerId) {
    return;
  }

  for (const deckId of SHARED_DECK_IDS) {
    const deck = state.decks[deckId];
    if (!deck || deck.drawPile.length + deck.discardPile.length === 0) {
      continue;
    }

    actions.push({
      label: `Search 2 in the ${deckId} deck`,
      action: {
        type: "SEARCH_DECK",
        playerId,
        deckId,
        count: 2
      }
    });
  }
}

/**
 * Rogues (army map ability): once during your turn, look at the top card of any
 * deck. Offered per shared/neutral deck that has cards, only while it's your
 * uninterrupted turn and the scout has not been used yet.
 */
function addRoguesScoutActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.combat || state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }
  if (state.activePlayerId !== playerId) {
    return;
  }
  const player = state.players[playerId];
  if (!player || player.rogueScoutUsedThisTurn || !armyHasMapEffect(state, playerId, "MAP_TURN_DECK_PEEK")) {
    return;
  }

  for (const [deckId, deck] of Object.entries(state.decks)) {
    if (deck.drawPile.length === 0) {
      continue;
    }
    actions.push({
      label: `Rogues: scout the top of the ${deckId} deck`,
      action: { type: "ROGUES_SCOUT_DECK", playerId, deckId }
    });
  }
}

function addHeroMoveActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.combat || (state.phase !== "map" && state.phase !== "player-turn")) {
    return;
  }

  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId !== playerId || hero.movementPoints <= 0 || !hero.spaceId) {
      continue;
    }

    const space = state.map.spaces[hero.spaceId];
    for (const adjacentSpaceId of space?.adjacent ?? []) {
      actions.push({
        label: `Move hero to ${adjacentSpaceId}`,
        action: {
          type: "MOVE_HERO",
          playerId,
          heroId: hero.id,
          to: adjacentSpaceId
        }
      });
    }
  }
}

function hasResources(
  resources: Record<ResourceKind, number>,
  cost: ResourceCost
): boolean {
  return (Object.entries(cost) as [ResourceKind, number][]).every(
    ([resource, amount]) => resources[resource] >= amount
  );
}

export function canPlayerBuildStructure(
  state: GameState,
  playerId: PlayerId,
  townId: TownId,
  buildingId: BuildingId,
  buildings: BuildingLibrary = sampleBuildings
): boolean {
  const player = state.players[playerId];
  const town = state.towns[townId];
  const building = buildings[buildingId];

  if (!player || !town || !building || building.implementationStatus !== "implemented") {
    return false;
  }

  if (town.controllerId !== playerId || town.buildings.includes(buildingId)) {
    return false;
  }

  if (!hasResources(player.resources, building.cost)) {
    return false;
  }

  return (building.prerequisites ?? []).every((prerequisiteId) => town.buildings.includes(prerequisiteId));
}

function addTownBuildActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  buildings: BuildingLibrary
): void {
  for (const town of Object.values(state.towns)) {
    if (town.controllerId !== playerId) {
      continue;
    }

    for (const building of Object.values(buildings)) {
      if (!canPlayerBuildStructure(state, playerId, town.id, building.id, buildings)) {
        continue;
      }

      actions.push({
        label: `Build ${building.name}`,
        action: {
          type: "BUILD_STRUCTURE",
          playerId,
          townId: town.id,
          buildingId: building.id
        }
      });
    }
  }
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary,
  buildings: BuildingLibrary = sampleBuildings
): LegalAction[] {
  if (state.phase === "game-over") {
    // An adventure combat that just ended waits on the battlefield until a
    // participant closes the end-of-combat notice; only that acknowledgment
    // is legal here (sandbox results stay on the table until a reset).
    if (
      state.mode === "adventure" &&
      state.combat?.outcome &&
      !state.combat.endAcknowledged &&
      state.combat.context.kind !== "sandbox" &&
      isCombatParticipant(state, playerId)
    ) {
      return [
        {
          label: "Return to the adventure map",
          action: { type: "ACKNOWLEDGE_COMBAT_END", playerId }
        }
      ];
    }
    return [];
  }

  if (state.pendingChoice) {
    if (state.pendingChoice.playerId !== playerId) {
      return [];
    }

    if (state.pendingChoice.type === "OPTION_CHOICE") {
      const choice = state.pendingChoice;
      return choice.options.map((option, optionIndex) => ({
        label: option.label,
        action: {
          type: "CHOOSE_OPTION",
          playerId,
          choiceId: choice.id,
          optionIndex
        }
      }));
    }

    if (state.pendingChoice.type === "COMBAT_HAND_DISCARD") {
      const choice = state.pendingChoice;
      const actions: LegalAction[] = choice.powerCardIds.map((cardId) => ({
        label: `Discard ${cards[cardId]?.name ?? cardId}`,
        action: {
          type: "RESOLVE_COMBAT_DISCARD",
          playerId,
          choiceId: choice.id,
          cardId
        }
      }));
      actions.push({
        label: "Let a random card be discarded",
        action: {
          type: "RESOLVE_COMBAT_DISCARD",
          playerId,
          choiceId: choice.id,
          cardId: "random"
        }
      });
      return actions;
    }

    if (state.pendingChoice.type === "DECK_SEARCH") {
      const choice = state.pendingChoice;
      const actions: LegalAction[] = choice.revealedCardIds.map((cardId, index) => ({
        label: `Keep ${cards[cardId]?.name ?? cardId}`,
        action: {
          type: "RESOLVE_DECK_SEARCH",
          playerId,
          choiceId: choice.id,
          pick: { kind: "revealed", index }
        }
      }));

      if (choice.canTakeDiscardTop) {
        actions.push({
          label: "Take the top discard instead",
          action: {
            type: "RESOLVE_DECK_SEARCH",
            playerId,
            choiceId: choice.id,
            pick: { kind: "discard-top" }
          }
        });
      }

      return actions;
    }

    if (state.pendingChoice.type === "ABILITY_TARGET_CHOICE") {
      const choice = state.pendingChoice;
      const verb =
        choice.kind === "second-attack"
          ? `${choice.abilityName}: attack`
          : choice.kind === "enchanter-activation"
            ? `${choice.abilityName}: heal`
            : choice.kind === "flat-damage" || choice.kind === "spell-splash" || choice.kind === "faerie-damage"
              ? `${choice.abilityName}: hit`
              : "Neutrals attack";
      const targetActions = choice.candidateUnitIds.flatMap((unitId) => {
        const unit = state.combat?.units[unitId];
        if (!unit || !isUnitAlive(unit)) {
          return [];
        }
        return [
          {
            label: `${verb} ${unit.cardName}`,
            action: {
              type: "CHOOSE_ABILITY_TARGET",
              playerId,
              choiceId: choice.id,
              targetUnitId: unitId
            }
          } satisfies LegalAction
        ];
      });

      // Optional choices carry a skip (Fireball's empty second space, the
      // Enchanters' "+1 Attack instead" of healing).
      if (choice.optional) {
        targetActions.push({
          label: choice.skipLabel ?? "Skip (no second target)",
          action: {
            type: "CHOOSE_ABILITY_TARGET",
            playerId,
            choiceId: choice.id,
            targetUnitId: "skip"
          }
        });
      }

      return targetActions;
    }

    // A reroll replaces the previous result (rulebook): only the latest roll
    // can be kept, earlier candidates are history.
    const latestIndex = state.pendingChoice.candidates.length - 1;
    const latest = state.pendingChoice.candidates[latestIndex];
    const actions: LegalAction[] = [
      {
        label: `Keep the attack roll ${latest.roll >= 0 ? "+" : ""}${latest.roll}`,
        action: {
          type: "CHOOSE_PENDING_ROLL",
          playerId,
          choiceId: state.pendingChoice?.id ?? "",
          candidateIndex: latestIndex
        }
      }
    ];

    const nextSource = state.pendingChoice.rerollSources.find((source) =>
      rerollSourceAvailableFor(source, latest.roll)
    );
    if (nextSource) {
      actions.push({
        label: `Reroll attack die (${nextSource.name})`,
        action: {
          type: "REROLL_PENDING_CHOICE",
          playerId,
          choiceId: state.pendingChoice.id
        }
      });
    }

    return actions;
  }

  if (state.reactionWindow) {
    if (state.reactionWindow.priorityPlayerId !== playerId) {
      return [];
    }

    return [
      ...(state.reactionWindow.legalReactions[playerId] ?? []),
      {
        label:
          state.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED"
            ? "Keep normal attack"
            : "Pass reaction",
        action: { type: "PASS_REACTION", playerId }
      }
    ];
  }

  if (state.setupLobby && state.phase === "setup") {
    return getSetupLobbyLegalActions(state, playerId);
  }

  if (state.mode === "adventure") {
    return getAdventureLegalActions(state, playerId, cards);
  }

  if (isSimultaneousTurnAvailable(state, playerId)) {
    const actions: LegalAction[] = [];
    addTownBuildActions(actions, state, playerId, buildings);
    actions.push({
      label: "Complete simultaneous turn",
      action: { type: "COMPLETE_SIMULTANEOUS_TURN", playerId }
    });
    return actions;
  }

  if (
    state.turn.mode === "simultaneous" &&
    state.round <= state.turn.simultaneousRoundLimit &&
    state.phase !== "combat" &&
    state.phase !== "reaction"
  ) {
    return [];
  }

  if (state.activePlayerId !== playerId) {
    // Even while the opponent's unit is active you may still cast your one
    // spell per combat round and slot in trigger-free instants.
    const anytimeActions: LegalAction[] = [];
    addActiveEffectActions(anytimeActions, state, playerId);
    addSpellActions(anytimeActions, state, playerId, cards);
    addPlayableCardActions(anytimeActions, state, playerId, cards);
    return anytimeActions;
  }

  const actions: LegalAction[] = [];
  addActiveEffectActions(actions, state, playerId);

  if (state.phase === "town") {
    addTownBuildActions(actions, state, playerId, buildings);
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  if (!state.combat || state.phase !== "combat") {
    addHeroMoveActions(actions, state, playerId);
    addDeckSearchActions(actions, state, playerId);
    addRoguesScoutActions(actions, state, playerId);
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  addUnitActions(actions, state, playerId);
  addSpellActions(actions, state, playerId, cards);
  addPlayableCardActions(actions, state, playerId, cards);
  addDeckSearchActions(actions, state, playerId);
  if (isCombatParticipant(state, playerId)) {
    addPermanentDiscardActions(actions, state, playerId);
  }

  return actions;
}

export function getLegalReactionsForTrigger(
  state: GameState,
  triggerEvent: GameEvent,
  cards: CardLibrary = cardLibrary
): Record<PlayerId, LegalAction[]> {
  if (triggerEvent.type !== "SPELL_CAST_STARTED" && triggerEvent.type !== "UNIT_ATTACK_DECLARED") {
    return {};
  }

  const result: Record<PlayerId, LegalAction[]> = {};
  const isAttackWindow = triggerEvent.type === "UNIT_ATTACK_DECLARED";

  for (const player of Object.values(state.players)) {
    // Garrison defense: "You cannot use your Deck during this Combat, as
    // your Main Hero is not present" — no card plays for that defender.
    if (isHandLockedInCombat(state, player.id)) {
      continue;
    }
    const expertUsesLeft =
      player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound;
    const spellLimitLeft = spellLimitFor(state, player) - player.combatStats.spellsCastThisRound;

    const reactions: LegalAction[] = [];
    // Power has no effect of its own during an attack: it may only be paid
    // alongside an instant spell in the same declaration. Power offers are
    // collected apart and only added when such a spell is available.
    const powerReactions: LegalAction[] = [];

    for (const cardId of new Set(player.hand)) {
      const card = cards[cardId];
      // Permanents join reaction windows only through their printed expert
      // side (School of Magic +3 power from hand); their basic side is the
      // enter-play action outside reaction windows.
      const allowedTiming =
        card && (card.timing === "reaction" || card.timing === "instant" || Boolean(card.permanent));
      if (!card || !allowedTiming || card.implementationStatus !== "implemented") {
        continue;
      }

      // Spell instants respect the one-Spell-per-combat-round limit.
      if (card.kind === "spell" && spellLimitLeft <= 0) {
        continue;
      }

      for (const variant of getCardPlayVariants(card)) {
        if (variant.mapOnly || !variantMatchesTrigger(variant, triggerEvent, player.id)) {
          continue;
        }

        if (!canAffordCardCost(state, player.id, cardId, variant.cost)) {
          continue;
        }

        const variantName = variant.optionLabel ? `${card.name}: ${variant.optionLabel}` : card.name;
        const isPowerPlay = variant.effect.type === "ADD_SPELL_POWER";
        const push = (action: LegalAction) => {
          if (isAttackWindow && isPowerPlay) {
            powerReactions.push(action);
          } else {
            reactions.push(action);
          }
        };

        // Permanents only join reaction windows through their expert side
        // (School of Magic from hand); their basic side is the enter-play
        // action outside reaction windows.
        if (
          !variant.expertOnly &&
          !card.permanent &&
          isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "basic")
        ) {
          push(
            makeReactionAction(variantName, {
              type: "PLAY_REACTION",
              playerId: player.id,
              cardId,
              mode: "basic",
              ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {})
            })
          );
        }

        if (
          (effectHasExpertMode(variant.effect) || variant.expertOnly) &&
          expertUsesLeft > 0 &&
          isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "expert")
        ) {
          push(
            makeReactionAction(`${variantName} expert`, {
              type: "PLAY_REACTION",
              playerId: player.id,
              cardId,
              mode: "expert",
              ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {})
            })
          );
        }
      }
    }

    // School of Magic in play: the caster may discard it for the expert
    // power bonus while their matching spell is being cast.
    const fieldExpert = getPermanentFieldExpertAction(state, player.id, triggerEvent, cards);
    if (fieldExpert) {
      reactions.push(fieldExpert);
    }

    // Brimstone Stormclouds: a stored faction cube powers the owner's cast.
    if (triggerEvent.type === "SPELL_CAST_STARTED" && triggerEvent.playerId === player.id) {
      const town = Object.values(state.towns).find((candidate) => candidate.controllerId === player.id);
      for (const buildingId of town?.buildings ?? []) {
        const building = coreBuildingDefinitions[buildingId];
        const cubes = town?.factionCubes?.[buildingId] ?? 0;
        const stackItem = state.stack.at(-1);
        const alreadySpent = (stackItem?.modifiers.townCubePowerBonus ?? 0) >= 1;
        if (building?.effect?.type === "COMBAT_CUBES" && building.effect.spend === "spell-power" && cubes > 0 && !alreadySpent) {
          reactions.push({
            label: `${building.name}: remove 1 cube for +1 Power (${cubes} stored)`,
            action: { type: "SPEND_TOWN_CUBE", playerId: player.id, buildingId }
          });
        }
      }
    }

    // Hall of Valhalla: once per round, +1 attack on one of your attacks.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attacker = state.combat?.units[triggerEvent.attackerId];
      if (attacker && attacker.controllerId === player.id) {
        const town = Object.values(state.towns).find((candidate) => candidate.controllerId === player.id);
        for (const buildingId of town?.buildings ?? []) {
          const building = coreBuildingDefinitions[buildingId];
          if (
            building?.effect?.type === "HALL_OF_VALHALLA" &&
            (player.buildingUsedRound?.[buildingId] ?? 0) !== state.round
          ) {
            reactions.push({
              label: `${building.name}: +${building.effect.amount} attack on this attack (once per round)`,
              action: { type: "HALL_OF_VALHALLA_BOOST", playerId: player.id, buildingId }
            });
          }
        }
      }
    }

    // The printed alternative bottom effect: discard any Spell card for
    // +1 Power — toward your own cast, or paired with an instant spell in an
    // attack window (the batch validator enforces the pairing).
    const boostLegal =
      triggerEvent.type === "SPELL_CAST_STARTED"
        ? triggerEvent.playerId === player.id
        : isCombatParticipant(state, player.id);
    if (boostLegal) {
      for (const cardId of new Set(player.hand)) {
        const card = cards[cardId];
        if (card?.kind === "spell") {
          const boost = makeReactionAction(`Discard ${card.name}: +1 Power`, {
            type: "PLAY_REACTION",
            playerId: player.id,
            cardId,
            mode: "basic",
            asPowerBoost: true
          });
          if (isAttackWindow) {
            powerReactions.push(boost);
          } else {
            reactions.push(boost);
          }
        }
      }
    }

    // Attack windows: only spells that modify the attack (buffs/nerfs of
    // attack or defense) may consume Power, so Power plays are offered only
    // while the player still holds such an instant spell to pair them with.
    const hasPairableSpell = reactions.some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        !legal.action.asPowerBoost &&
        cards[legal.action.cardId]?.kind === "spell"
    );
    if (!isAttackWindow || hasPairableSpell) {
      reactions.push(...powerReactions);
    }

    if (reactions.length > 0) {
      result[player.id] = reactions;
    }
  }

  return result;
}

/**
 * The in-play School of Magic expert as a reaction: available to the spell's
 * caster while the matching cast is on the stack and an expert use is left.
 */
function getPermanentFieldExpertAction(
  state: GameState,
  playerId: PlayerId,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" }>,
  cards: CardLibrary
): LegalAction | null {
  if (triggerEvent.type !== "SPELL_CAST_STARTED" || triggerEvent.playerId !== playerId) {
    return null;
  }

  const player = state.players[playerId];
  const spellCard = cards[triggerEvent.spellCardId];
  if (!player || !spellCard) {
    return null;
  }

  const match = getPermanentSchoolBonus(state, playerId, spellCard);
  if (!match) {
    return null;
  }

  if (player.combatStats.expertUsesSpentThisRound >= player.limits.expertUses) {
    return null;
  }

  const stackItem = getPendingStackItem(state, triggerEvent);
  if ((stackItem?.modifiers.schoolPowerBonus ?? 0) >= match.expertPower) {
    return null;
  }

  return {
    label: `Discard ${match.card.name} from play: +${match.expertPower} power (expert)`,
    action: { type: "USE_PERMANENT_EXPERT", playerId }
  };
}

function variantMatchesTrigger(
  variant: CardPlayVariant,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" }>,
  playerId: PlayerId
): boolean {
  if (!variant.trigger) {
    // Trigger-free instants (card draws) may be slotted into any open timing
    // window, mirroring how instants work at the table.
    return variant.effect.type === "DRAW_CARDS";
  }

  if (variant.trigger.event !== triggerEvent.type) {
    // Power plays declared on a SPELL_CAST trigger may also be paid into an
    // attack window, fueling a spell instant in the same declaration.
    return (
      triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
      variant.trigger.event === "SPELL_CAST_STARTED" &&
      variant.effect.type === "ADD_SPELL_POWER"
    );
  }

  const isSelf = triggerEvent.playerId === playerId;
  if (variant.trigger.controller === "self" && !isSelf) {
    return false;
  }

  if (variant.trigger.controller === "opponent" && isSelf) {
    return false;
  }

  return true;
}

function getPendingStackItem(state: GameState, triggerEvent: GameEvent) {
  return state.stack.find((item) => item.triggerEventIds.includes(triggerEvent.id));
}

function getPendingSpellPower(state: GameState, triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" }>): number {
  const stackItem = getPendingStackItem(state, triggerEvent);
  return (
    triggerEvent.power + (stackItem?.modifiers.spellPowerBonus ?? 0) + (stackItem?.modifiers.schoolPowerBonus ?? 0)
  );
}

export function effectHasExpertMode(effect: ConcreteEffect): boolean {
  if (effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER" || effect.type === "DRAW_CARDS") {
    return effect.expertAmount !== undefined;
  }

  if (effect.type === "GAIN_MORALE") {
    return effect.expertDrawCards !== undefined;
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return Boolean(effect.expertEffect);
  }

  if (effect.type === "RECALL_SPELL") {
    return Boolean(effect.expertSpellLimitBonus);
  }

  if (effect.type === "CANCEL_SPELL") {
    return Boolean(effect.expertIgnoresMaxPower);
  }

  return false;
}

function makeReactionAction(label: string, action: Extract<GameAction, { type: "PLAY_REACTION" }>): LegalAction {
  const modeLabel = action.mode === "expert" ? " (expert)" : "";
  return {
    label: `Play ${label}${modeLabel}`,
    action
  };
}

export function isEffectLegalForTrigger(
  state: GameState,
  playerId: PlayerId,
  effect: ConcreteEffect,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" }>,
  mode: CardPlayMode
): boolean {
  // Card draws are timing-free instants: they fit inside any open window.
  if (effect.type === "DRAW_CARDS") {
    return true;
  }

  if (triggerEvent.type === "SPELL_CAST_STARTED") {
    if (effect.type === "ADD_SPELL_POWER") {
      if (triggerEvent.playerId !== playerId) {
        return false;
      }

      // Elemental Magic boosts only empower their own school.
      if (effect.schoolOnly) {
        const stackItem = getPendingStackItem(state, triggerEvent);
        const pendingSpell =
          stackItem?.action.type === "CAST_SPELL" ? cardLibrary[stackItem.action.cardId] : undefined;
        const schools = pendingSpell?.spellSchools ?? [];
        return schools.includes(effect.schoolOnly) || schools.includes("any");
      }

      return true;
    }

    if (effect.type === "CANCEL_SPELL") {
      if (triggerEvent.playerId === playerId) {
        return false;
      }

      // Expert play (e.g. Expert Resistance) ends a spell of any power. The
      // basic play only applies while the spell's current power, including
      // Power cards already committed, is at or below the printed limit.
      if (mode === "expert" && effect.expertIgnoresMaxPower) {
        return true;
      }

      if (effect.maxPower !== undefined && getPendingSpellPower(state, triggerEvent) > effect.maxPower) {
        return false;
      }

      return true;
    }

    if (effect.type === "RECALL_SPELL") {
      return triggerEvent.playerId === playerId;
    }

    return false;
  }

  if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const combat = state.combat;
    const attacker = combat?.units[triggerEvent.attackerId];
    const defender = combat?.units[triggerEvent.defenderId];
    if (!attacker || !defender) {
      return false;
    }

    // Centaur's Axe: either fighter may triple the die — the attacker hoping
    // for a +1, the defender fishing for a tripled -1.
    if (effect.type === "TRIPLE_ATTACK_DIE") {
      return attacker.controllerId === playerId || defender.controllerId === playerId;
    }

    if (effect.type === "CREATE_ACTIVE_EFFECT") {
      return effect.effect.modifiers.every((modifier) => {
        if (modifier.type !== "RANGED_ATTACK_BONUS") {
          return true;
        }

        if (attacker.type !== "ranged") {
          return false;
        }

        return !modifier.nonAdjacentOnly || !isAdjacent(attacker.position, defender.position);
      });
    }

    // Bless: "the selected ground or flying unit" ignores the die — only the
    // attacker's controller plays it, and never on a ranged shot.
    if (effect.type === "IGNORE_ATTACK_DIE") {
      return attacker.controllerId === playerId && attacker.type !== "ranged";
    }

    // Alamar's Resurrection: the defender's controller may arm the option that
    // matches their unit's grade to cancel a killing blow on it.
    if (effect.type === "CANCEL_LETHAL_ATTACK") {
      return defender.controllerId === playerId && effect.grade === defender.grade;
    }

    // Power may be paid into an attack window so a spell instant in the same
    // declaration can consume it (the batch validator enforces the pairing).
    if (effect.type === "ADD_SPELL_POWER") {
      return !effect.schoolOnly && (attacker.controllerId === playerId || defender.controllerId === playerId);
    }

    if (effect.type !== "ADD_COMBAT_STAT") {
      return false;
    }

    // Curse (−defense) is played by the attacker against the defender;
    // Weakness (−attack) by the defender against the attacker. Positive
    // bonuses belong to the unit's own side as before.
    const benefitsAttacker = effect.stat === "attack" ? effect.amount >= 0 : effect.amount < 0;
    const owner = benefitsAttacker ? attacker : defender;
    if (owner.controllerId !== playerId) {
      return false;
    }

    // Bloodlust/Precision/Golden Bow restrict the unit types they boost.
    const affected = effect.stat === "attack" ? attacker : defender;
    if (effect.unitTypes && !effect.unitTypes.includes(affected.type)) {
      return false;
    }

    // Precision: only on a ranged (non-adjacent) shot.
    if (effect.ignoreRangedPenalty && triggerEvent.attackKind !== "ranged") {
      return false;
    }

    return true;
  }

  return false;
}

export function getActiveUnitId(state: GameState): UnitId | null {
  return state.combat?.activeUnitId ?? null;
}

// ---------------------------------------------------------------------------
// Adventure mode legal actions
// ---------------------------------------------------------------------------

function addVisitStepActions(actions: LegalAction[], state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  const adventure = state.adventure;
  const visit = adventure?.pendingVisit;
  const step = visit?.steps[0];
  if (!adventure || !visit || !step || visit.playerId !== playerId) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }

  if (step.type === "CHOOSE_ONE") {
    for (const [optionIndex, option] of step.options.entries()) {
      // Pandora's Box: the deck-draw option needs cards left in the deck.
      if (
        option.steps.some((inner) => inner.type === "DRAW_PANDORA_CARD") &&
        !state.adventure?.pandoraDeck?.length
      ) {
        continue;
      }
      actions.push({
        label: option.label,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex }
      });
    }
    return;
  }

  if (step.type === "PAY_TO") {
    for (const [optionIndex, cost] of step.costOptions.entries()) {
      if (!playerHasResources(player, cost)) {
        continue;
      }

      const label = Object.entries(cost)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ");
      actions.push({
        label: `Pay ${label}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex }
      });
    }
    actions.push({
      label: "Decline",
      action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true }
    });
    return;
  }

  if (step.type === "SETTLEMENT_CHOICE") {
    const field = adventure.fields[visit.fieldId];
    const free = field ? !field.everFlagged : false;
    actions.push(
      { label: "Increase gold income by 1", action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 } },
      {
        label: "Increase building materials income by 1",
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 1 }
      },
      { label: "Increase valuables income by 1", action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 2 } }
    );

    const fewUnits = player.army.filter((unit) => {
      if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
        return false;
      }
      const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
      return tier === "bronze" || tier === "silver";
    });
    fewUnits.forEach((unit, index) => {
      const packSide = getUnitSide(unit.unitDefId, "pack");
      const halfCost = Object.entries(packSide?.cost ?? {})
        .map(([resource, amount]) => `${Math.ceil((amount as number) / 2)} ${resource}`)
        .join(" + ");
      actions.push({
        label: free
          ? `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} for free`
          : `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (${halfCost})`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 3 + index }
      });
    });
    return;
  }

  if (step.type === "WITCH_HUT") {
    // The rulebook reveals the top Ability card before the player decides.
    const top = state.decks.abilities?.drawPile.at(-1);
    const topName = top ? (cards[top]?.name ?? top) : "the top Ability card";
    actions.push(
      { label: `Take ${topName} into hand`, action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 } },
      {
        label: `Put ${topName} into the discard pile`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 1 }
      },
      { label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } }
    );
    return;
  }

  if (step.type === "MAGIC_SPRING") {
    const topThree = player.discard.slice(-3).reverse();
    topThree.forEach((cardId, index) => {
      actions.push({
        label: `Return ${cards[cardId]?.name ?? cardId} to hand`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "TRADING_POST") {
    for (const [rateIndex, rate] of TRADE_RATES.entries()) {
      if (playerHasResources(player, rate.sell)) {
        actions.push({
          label: `Trade ${rate.label}`,
          action: { type: "TRADE_RESOURCES", playerId, rateIndex }
        });
      }
    }
    // The other two printed options ("choose one") stay open only until the
    // first resource trade: sell one card from hand for 1 gold (Specialty,
    // Statistic, starting Ability and Magic Arrow excluded), or buy a war
    // machine at the higher price.
    if (!step.traded) {
      for (const { index, cardId } of removableHandCards(state, playerId, "sellable")) {
        actions.push({
          label: `Sell ${cards[cardId]?.name ?? cardId} → gain 1 gold`,
          action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
        });
      }
      for (const offer of warMachinesForSale(state, "trading-post")) {
        if (playerHasResources(player, offer.cost)) {
          actions.push({
            label: `Buy ${offer.card.name} (${offer.cost.gold ?? 0} gold)`,
            action: { type: "BUY_WAR_MACHINE", playerId, cardId: offer.cardId }
          });
        }
      }
    }
    actions.push({ label: "Done trading", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "WAR_MACHINE_SHOP") {
    for (const offer of warMachinesForSale(state, "factory")) {
      if (playerHasResources(player, offer.cost)) {
        actions.push({
          label: `Buy ${offer.card.name} (${offer.cost.gold ?? 0} gold)`,
          action: { type: "BUY_WAR_MACHINE", playerId, cardId: offer.cardId }
        });
      }
    }
    actions.push({ label: "Leave the factory", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "DISCOVER_ADJACENT_TILE") {
    const field = adventure.fields[visit.fieldId];
    const tile = field ? adventure.tiles[field.tileInstanceId] : undefined;
    const candidates = tile ? observatoryDiscoverTargets(adventure, tile) : [];
    candidates.forEach((candidate, index) => {
      actions.push({
        label: `Discover the face-down tile at (${candidate.centerRow}, ${candidate.centerCol})`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "REMOVE_HAND_CARD") {
    for (const { index, cardId } of removableHandCards(state, playerId, step.filter)) {
      actions.push({
        label: `Remove ${cards[cardId]?.name ?? cardId}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    }
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "SEARCH_DISCARD") {
    const deck = state.decks[step.deckId];
    const topCards = deck ? deck.discardPile.slice(-step.count).reverse() : [];
    topCards.forEach((cardId, index) => {
      actions.push({
        label: `Take ${cards[cardId]?.name ?? cardId}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    actions.push({ label: "Take nothing", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "HILL_FORT") {
    const fewUnits = player.army.filter((unit) => {
      if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
        return false;
      }
      const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
      return tier === "bronze" || tier === "silver";
    });
    fewUnits.forEach((unit, index) => {
      const packSide = getUnitSide(unit.unitDefId, "pack");
      const cost = hillFortCost(packSide?.cost ?? {});
      const costLabel = Object.entries(cost)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ") || "free";
      if (playerHasResources(player, cost)) {
        actions.push({
          label: `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (${costLabel})`,
          action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
        });
      }
    });
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
  }
}

function addCombatSetupActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  const setup = combat?.setup;
  const player = state.players[playerId];
  if (!combat || !setup || !player || setup.pendingPlayerIds[0] !== playerId) {
    return;
  }

  const placed = setup.placedUnitIds[playerId] ?? [];
  const cells =
    playerId === combat.attackerPlayerId
      ? [...ATTACKER_FRONTLINE, ...ATTACKER_BACKLINE]
      : [...DEFENDER_FRONTLINE, ...DEFENDER_BACKLINE];
  const takenPositions = new Set(Object.values(combat.units).map((unit) => unit.position));

  if (placed.length < setup.unitLimit) {
    for (const armyUnit of player.army) {
      if (placed.includes(armyUnit.id)) {
        continue;
      }

      const unitName = coreUnitDefinitions[armyUnit.unitDefId]?.name ?? armyUnit.unitDefId;
      for (const position of cells) {
        if (takenPositions.has(position)) {
          continue;
        }

        actions.push({
          label: `Place ${armyUnit.side} ${unitName} at ${getBattlefieldLabel(position)}`,
          action: { type: "PLACE_COMBAT_UNIT", playerId, armyUnitId: armyUnit.id, position }
        });
      }
    }
  }

  for (const armyUnitId of placed) {
    const unitName = coreUnitDefinitions[player.army.find((unit) => unit.id === armyUnitId)?.unitDefId ?? ""]?.name;
    actions.push({
      label: `Take back ${unitName ?? armyUnitId}`,
      action: { type: "UNPLACE_COMBAT_UNIT", playerId, armyUnitId }
    });
  }

  if (placed.length > 0) {
    actions.push({
      label: "Ready for battle",
      action: { type: "FINISH_COMBAT_PLACEMENT", playerId }
    });
  }
}

function addTownActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  const town = getTownOfPlayer(state, playerId);
  if (!player || !town || state.combat) {
    return;
  }

  if (player.townTokens.build) {
    for (const buildingId of coreFactionDefinitions[player.factionId ?? ""]?.buildings ?? []) {
      const building = coreBuildingDefinitions[buildingId];
      if (
        !building ||
        building.implementationStatus !== "implemented" ||
        town.buildings.includes(buildingId) ||
        (building.prerequisites ?? []).some((prerequisite) => !town.buildings.includes(prerequisite)) ||
        !playerHasResources(player, building.cost)
      ) {
        continue;
      }

      actions.push({
        label: `Build ${building.name}`,
        action: { type: "BUILD_STRUCTURE", playerId, townId: town.id, buildingId }
      });
    }
  }

  if (player.townTokens.population) {
    const tiers = unlockedRecruitTiers(state, playerId);
    const canReinforce = townHasBuildingEffect(state, playerId, "UNLOCK_REINFORCE");
    const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;

    for (const unitDefId of faction?.units ?? []) {
      const unit = coreUnitDefinitions[unitDefId];
      const fewSide = unit?.few;
      if (!unit || !fewSide || !tiers.has(unit.tier)) {
        continue;
      }

      // Each unit card exists once: a type already in the army cannot be
      // recruited again — only its Few card may be reinforced to the Pack.
      const owned = player.army.some((armyUnit) => armyUnit.unitDefId === unitDefId);
      if (!owned && hasRecruitResources(state, playerId, fewSide.cost)) {
        actions.push({
          label: `Recruit few ${unit.name}`,
          action: {
            type: "POPULATION_ACTION",
            playerId,
            purchases: [{ kind: "recruit", unitDefId }]
          }
        });
      }

      if (canReinforce) {
        const target = player.army.find((armyUnit) => armyUnit.unitDefId === unitDefId && armyUnit.side === "few");
        const packSide = unit.pack;
        if (target && packSide && hasRecruitResources(state, playerId, packSide.cost)) {
          actions.push({
            label: `Reinforce ${unit.name} to a pack`,
            action: {
              type: "POPULATION_ACTION",
              playerId,
              purchases: [{ kind: "reinforce", unitDefId, armyUnitId: target.id }]
            }
          });
        }
      }
    }
  }

  if (player.townTokens.spellBook && townHasBuildingEffect(state, playerId, "MAGE_GUILD")) {
    const mageGuild = town.buildings
      .map((buildingId) => coreBuildingDefinitions[buildingId])
      .find((building) => building?.effect?.type === "MAGE_GUILD");
    const cost = mageGuild?.spellBookCost ?? 5;
    if (player.mageGuildBuiltRound !== state.round) {
      if (player.resources.gold >= cost) {
        actions.push({
          label: `Buy spells (${cost} gold, Search 2)`,
          action: { type: "SPELL_BOOK_ACTION", playerId }
        });
      }

      // Wisdom rides on the purchase: cheaper spells and a bigger search.
      const ruleset = getRuleset(state);
      const wisdomCardId = player.hand.find((cardId) => cardLibrary[cardId]?.name === "Wisdom");
      if (wisdomCardId) {
        const basicCost = Math.max(0, cost - wisdomGoldDiscount(ruleset, "basic"));
        if (player.resources.gold >= basicCost) {
          actions.push({
            label: `Buy spells with Wisdom (${basicCost} gold, Search ${wisdomSearchCount("basic")})`,
            action: { type: "SPELL_BOOK_ACTION", playerId, wisdom: { cardId: wisdomCardId, mode: "basic" } }
          });
        }

        const expertCost = Math.max(0, cost - wisdomGoldDiscount(ruleset, "expert"));
        if (expertUsesAvailable(player) > 0 && player.resources.gold >= expertCost) {
          actions.push({
            label: `Buy spells with expert Wisdom (${expertCost} gold, Search ${wisdomSearchCount("expert")})`,
            action: { type: "SPELL_BOOK_ACTION", playerId, wisdom: { cardId: wisdomCardId, mode: "expert" } }
          });
        }
      }
    }
  }

  // Blacksmith: once per turn, search Artifacts for gold or sell one.
  const smith = town.buildings
    .map((buildingId) => coreBuildingDefinitions[buildingId])
    .find((building) => building?.effect?.type === "ARTIFACT_SMITH");
  if (smith?.effect?.type === "ARTIFACT_SMITH" && player.blacksmithUsedRound !== state.round) {
    if (player.resources.gold >= smith.effect.searchCost) {
      actions.push({
        label: `Blacksmith: pay ${smith.effect.searchCost} gold, Search (2) Artifacts`,
        action: { type: "BLACKSMITH_ACTION", playerId, option: "search" }
      });
    }
    for (const cardId of new Set(player.hand)) {
      if (cardLibrary[cardId]?.kind === "artifact") {
        actions.push({
          label: `Blacksmith: sell ${cardLibrary[cardId]?.name} for ${smith.effect.sellGold} gold`,
          action: { type: "BLACKSMITH_ACTION", playerId, option: "sell", artifactCardId: cardId }
        });
      }
    }
  }

  // "During your turn" buildings, each once per round.
  if (state.activePlayerId === playerId) {
    for (const buildingId of town.buildings) {
      const building = coreBuildingDefinitions[buildingId];
      if (!building || (player.buildingUsedRound?.[buildingId] ?? 0) === state.round) {
        continue;
      }

      if (building.effect?.type === "COVER_OF_DARKNESS" && player.hand.length > 0) {
        actions.push({
          label: `${building.name}: discard up to 2 cards, draw that many`,
          action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 0, cardIds: [] }
        });
      }

      if (building.effect?.type === "CASTLE_GATE") {
        if (player.resources.gold >= building.effect.discardCost) {
          for (const opponentId of state.turnOrder) {
            const opponent = state.players[opponentId];
            if (opponentId === playerId || opponentId === "neutrals" || !opponent || opponent.hand.length === 0) {
              continue;
            }
            actions.push({
              label: `${building.name}: pay ${building.effect.discardCost} gold — random discard from ${opponent.name}`,
              action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 0, targetPlayerId: opponentId }
            });
          }
        }

        const hero = Object.values(state.heroes).find(
          (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
        );
        if (hero?.spaceId && state.adventure) {
          const here = hero.spaceId;
          const isOwnHolding = (spaceId: string) =>
            Object.values(state.towns).some((candidate) => candidate.fieldId === spaceId && candidate.controllerId === playerId) ||
            (state.adventure?.fields[spaceId]?.location === "settlement" &&
              state.adventure?.fields[spaceId]?.flagOwnerId === playerId);
          if (isOwnHolding(here)) {
            for (const field of Object.values(state.adventure.fields)) {
              if (field.spaceId !== here && isOwnHolding(field.spaceId)) {
                actions.push({
                  label: `${building.name}: move the hero to ${field.location === "settlement" ? "the settlement" : "the town"} at ${field.spaceId}`,
                  action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 1, spaceId: field.spaceId }
                });
              }
            }
          }
        }
      }
    }
  }

  if (player.morale > 0) {
    actions.push({
      label: "Spend morale: draw a card",
      action: { type: "SPEND_MORALE", playerId, benefit: "draw" }
    });
    if (player.hand.length > 0) {
      actions.push({
        label: "Spend morale: discard any cards, draw that many",
        action: { type: "SPEND_MORALE", playerId, benefit: "redraw", discardCardIds: [] }
      });
    }
  }
}

function getSetupLobbyLegalActions(state: GameState, playerId: PlayerId): LegalAction[] {
  const lobby = state.setupLobby;
  const actions: LegalAction[] = [];
  if (!lobby) {
    return actions;
  }

  const seat = lobby.seats.find((candidate) => candidate.playerId === playerId);
  if (!seat) {
    return actions;
  }

  const takenFactions = new Set(
    lobby.seats.filter((candidate) => candidate.playerId !== playerId).map((candidate) => candidate.factionId)
  );

  for (const faction of Object.values(coreFactionDefinitions)) {
    if (takenFactions.has(faction.id)) {
      continue;
    }

    for (const heroDefId of faction.heroes) {
      if (seat.factionId === faction.id && seat.heroDefId === heroDefId) {
        continue;
      }
      actions.push({
        label: `Play ${faction.name} — ${heroDefId}`,
        action: { type: "CHOOSE_FACTION", playerId, factionId: faction.id, heroDefId }
      });
    }
  }

  if (lobby.seats.every((candidate) => candidate.factionId && candidate.heroDefId)) {
    actions.push({
      label: "Start the adventure",
      action: { type: "START_ADVENTURE", playerId }
    });
  }

  return actions;
}

function getAdventureLegalActions(state: GameState, playerId: PlayerId, cards: CardLibrary): LegalAction[] {
  const actions: LegalAction[] = [];
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (!adventure || !player) {
    return actions;
  }

  // A finished combat waits on the battlefield until a participant closes
  // the end-of-combat notice; only then does finalization run.
  if (state.combat?.outcome && !state.combat.endAcknowledged && !state.pendingChoice) {
    if (isCombatParticipant(state, playerId)) {
      actions.push({
        label: "Return to the adventure map",
        action: { type: "ACKNOWLEDGE_COMBAT_END", playerId }
      });
    }
    return actions;
  }

  // Combat setup placement.
  if (state.combat?.setup) {
    addCombatSetupActions(actions, state, playerId);
    return actions;
  }

  // The neutral combat time limit: continue for 1 MP or retreat.
  if (state.combat?.awaitingContinue) {
    const context = state.combat.context;
    if (context.kind === "neutral") {
      const hero = state.heroes[context.heroId];
      if (hero?.controllerId === playerId) {
        if (hero.movementPoints > 0) {
          actions.push({
            label: "Spend 1 movement point: fight another combat round",
            action: { type: "CONTINUE_NEUTRAL_COMBAT", playerId }
          });
        }
        // Dessa's Logistics specialty: continue the combat for free.
        const player = state.players[playerId];
        for (const cardId of new Set(player?.hand ?? [])) {
          if (cards[cardId]?.effect.type === "CONTINUE_NEUTRAL_FREE") {
            actions.push({
              label: `Play ${cards[cardId]?.name}: fight another combat round for free`,
              action: { type: "PLAY_CARD", playerId, cardId, target: { type: "none" } }
            });
          }
        }
        actions.push({
          label: "Retreat to the last visited field",
          action: { type: "RETREAT_FROM_COMBAT", playerId }
        });
      }
    }
    return actions;
  }

  // Active combat: the standard combat actions apply. Spells and instants
  // stay available to both fighters whoever's unit is active.
  if (state.combat && state.phase === "combat") {
    addActiveEffectActions(actions, state, playerId);
    addUnitActions(actions, state, playerId);
    addSpellActions(actions, state, playerId, cards);
    addPlayableCardActions(actions, state, playerId, cards);
    if (isCombatParticipant(state, playerId)) {
      addPermanentDiscardActions(actions, state, playerId);
    }
    return actions;
  }

  // A freshly revealed or placed tile waits for its rotation choice.
  const tileChoice = adventure.pendingTileChoice;
  if (tileChoice) {
    const tile = adventure.tiles[tileChoice.tileInstanceId];
    if (tileChoice.playerId === playerId && tile) {
      const anyConnected = [0, 1, 2, 3, 4, 5].some((rotation) => isTileRotationConnected(state, tile, rotation));
      for (let rotation = 0; rotation < 6; rotation += 1) {
        if (anyConnected && !isTileRotationConnected(state, tile, rotation)) {
          continue;
        }
        actions.push({
          label: `Confirm tile rotation ${rotation * 60}°`,
          action: { type: "SET_TILE_ROTATION", playerId, tileInstanceId: tile.id, rotation }
        });
      }
    }
    return actions;
  }

  // Pending field visit choices.
  if (adventure.pendingVisit) {
    addVisitStepActions(actions, state, playerId, cards);
    return actions;
  }

  // Town and morale actions may happen during any player's turn.
  addTownActions(actions, state, playerId);

  if (state.activePlayerId !== playerId) {
    return actions;
  }

  if (player.needsHandRefresh) {
    return [
      {
        label: "Discard down to your hand limit",
        action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
      },
      ...actions
    ];
  }

  // Start-of-turn mulligan: discard any number of cards, draw that many.
  if (player.canMulligan && player.hand.length > 0) {
    actions.push({
      label: "Discard any cards and draw that many (start of turn)",
      action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
    });
  }

  // Instant, Ongoing and Map cards may be played during your own map turn.
  addTurnCardActions(actions, state, playerId, cards);
  addPermanentDiscardActions(actions, state, playerId);

  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId !== playerId || !hero.spaceId) {
      continue;
    }

    if (hero.movementPoints > 0) {
      for (const destination of getHeroMoveDestinations(state, hero)) {
        actions.push({
          label: `Move hero to ${destination}`,
          action: { type: "MOVE_HERO", playerId, heroId: hero.id, to: destination }
        });
      }

      const field = adventure.fields[hero.spaceId];
      if (field && locationDefinitions[field.location]?.category === "revisitable") {
        actions.push({
          label: `Revisit ${locationDefinitions[field.location]?.name ?? field.location}`,
          action: { type: "REVISIT_FIELD", playerId, heroId: hero.id }
        });
      }

      for (const tile of Object.values(adventure.tiles)) {
        if (tile.faceDown && isTileAdjacentToSpace(state, tile.id, hero.spaceId)) {
          actions.push({
            label: `Discover the face-down tile at (${tile.centerRow}, ${tile.centerCol})`,
            action: { type: "DISCOVER_TILE", playerId, heroId: hero.id, tileInstanceId: tile.id }
          });
        }
      }
    }
  }

  actions.push({
    label: "End turn",
    action: { type: "END_TURN", playerId }
  });

  return actions;
}
