import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { sampleBuildings } from "@/data/towns/buildings";
import {
  getTownOfPlayer,
  getUnitSide,
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
  isTileAdjacentToSpace
} from "./adventure-reducer";
import {
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldDistance,
  getBattlefieldLabel,
  getBattlefieldTerrain,
  isBattlefieldPosition
} from "./battlefield";
import { SHARED_DECK_IDS } from "./decks";
import type {
  AttackRollMode,
  ActiveEffectState,
  BuildingId,
  BuildingLibrary,
  CardDefinition,
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
};

export function getCardPlayVariants(card: CardDefinition): CardPlayVariant[] {
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.map((option, optionIndex) => ({
      trigger: option.trigger,
      effect: option.effect,
      optionIndex,
      optionLabel: option.label
    }));
  }

  return [
    {
      trigger: card.trigger,
      effect: card.effect
    }
  ];
}

export function isUnitAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

export function isAdjacent(leftPosition: number, rightPosition: number, columns = BATTLEFIELD_COLUMNS): boolean {
  const leftRow = Math.floor(leftPosition / columns);
  const leftColumn = leftPosition % columns;
  const rightRow = Math.floor(rightPosition / columns);
  const rightColumn = rightPosition % columns;

  return Math.abs(leftRow - rightRow) + Math.abs(leftColumn - rightColumn) === 1;
}

export function getUnitMoveRange(unit: CombatUnitState): number {
  if (unit.type === "ranged") {
    return 1;
  }

  return 3;
}

function isPositionOccupied(combat: CombatState, position: number): boolean {
  return Object.values(combat.units).some((unit) => isUnitAlive(unit) && unit.position === position);
}

function changesSideWithoutCrossing(unit: CombatUnitState, destination: number): boolean {
  if (unit.type === "flying") {
    return false;
  }

  const fromTerrain = getBattlefieldTerrain(unit.position);
  const toTerrain = getBattlefieldTerrain(destination);

  return (
    (fromTerrain === "grass" && toTerrain === "dirt") ||
    (fromTerrain === "dirt" && toTerrain === "grass")
  );
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
  if (!isUnitAlive(unit) || unit.activatedThisRound || unit.movedThisActivation || !isBattlefieldPosition(destination)) {
    return false;
  }

  if (hasCannotMoveEffect(state, unit)) {
    return false;
  }

  if (unit.position === destination || isPositionOccupied(combat, destination)) {
    return false;
  }

  if (changesSideWithoutCrossing(unit, destination)) {
    return false;
  }

  const distance = getBattlefieldDistance(unit.position, destination);
  return distance > 0 && distance <= getUnitMoveRange(unit);
}

export function getLegalMoveDestinations(combat: CombatState, unit: CombatUnitState, state?: GameState): number[] {
  return Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, position) => position).filter((position) =>
    canUnitMoveTo(combat, unit, position, state)
  );
}

export function sortUnitsForActivation(combat: CombatState): CombatUnitState[] {
  return Object.values(combat.units)
    .filter(isUnitAlive)
    .sort((left, right) => {
      if (right.initiative !== left.initiative) {
        return right.initiative - left.initiative;
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

export function getNextUnitToActivate(combat: CombatState): CombatUnitState | null {
  return sortUnitsForActivation(combat).find((unit) => !unit.activatedThisRound) ?? null;
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

export function getAttackRollMode(attacker: CombatUnitState, defender: CombatUnitState): AttackRollMode {
  const ignoresPenalty = hasUnitAbilityEffect(attacker, "IGNORE_RANGED_BACK_ROW_PENALTY");

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

  return "normal";
}

export function canUnitAttack(combat: CombatState, attacker: CombatUnitState, defender: CombatUnitState): boolean {
  if (!isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  if (attacker.controllerId === defender.controllerId) {
    return false;
  }

  if (attacker.type === "ranged") {
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

  if (target.type === "friendly-unit") {
    return getFriendlyTargets(state, playerId, target);
  }

  if (target.type === "any-unit") {
    return [...getFriendlyTargets(state, playerId, target), ...getEnemyTargets(state, playerId, target)];
  }

  return getEnemyTargets(state, playerId, target);
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

function addSpellActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const player = state.players[playerId];
  const spellLimit = 1 + (player?.combatStats.spellLimitBonusThisRound ?? 0);
  if (!player || player.combatStats.spellsCastThisRound >= spellLimit) {
    return;
  }

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
      continue;
    }

    if (!isPhaseAllowedForCard(state, card)) {
      continue;
    }

    for (const target of getTargetsForCard(state, playerId, cardId, cards)) {
      actions.push({
        label: target.type === "unit" ? `Cast ${card.name}` : `Cast ${card.name}`,
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

function addPlayableCardActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (
      !card ||
      card.kind === "spell" ||
      card.trigger ||
      card.implementationStatus !== "implemented" ||
      !isPhaseAllowedForCard(state, card)
    ) {
      continue;
    }

    if (card.timing !== "combat" && card.timing !== "instant" && card.timing !== "ongoing" && card.timing !== "action") {
      continue;
    }

    if (card.effect.type === "CHOOSE_ONE") {
      // Options that carry a trigger wait for their reaction window; the
      // remaining options (currently card draws) play as direct instants.
      for (const [optionIndex, option] of card.effect.options.entries()) {
        if (option.trigger || option.effect.type !== "DRAW_CARDS") {
          continue;
        }

        actions.push({
          label: `${card.name}: ${option.label}`,
          action: {
            type: "PLAY_CARD",
            playerId,
            cardId,
            mode: "basic",
            optionIndex,
            target: { type: "none" }
          }
        });
      }
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

function isSimultaneousTurnAvailable(state: GameState, playerId: PlayerId): boolean {
  return (
    state.turn.mode === "simultaneous" &&
    state.round <= state.turn.simultaneousRoundLimit &&
    state.phase !== "combat" &&
    state.phase !== "reaction" &&
    !state.turn.completedPlayerIds.includes(playerId)
  );
}

function addActiveEffectActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || state.phase !== "combat" || state.stack.length > 0 || state.reactionWindow || state.pendingChoice) {
    return;
  }

  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId || effect.usedCombatRoundNumbers.includes(combat.round)) {
      continue;
    }

    const healModifier = effect.modifiers.find((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND");
    if (!healModifier) {
      continue;
    }

    for (const unit of Object.values(combat.units)) {
      if (unit.controllerId !== playerId || !isUnitAlive(unit) || unit.damage <= 0) {
        continue;
      }

      actions.push({
        label: `${effect.name} heal ${unit.name}`,
        action: {
          type: "USE_ACTIVE_EFFECT",
          playerId,
          effectId: effect.id,
          target: { type: "unit", unitId: unit.id }
        }
      });
    }
  }
}

function addUnitAbilityActions(actions: LegalAction[], state: GameState, playerId: PlayerId, activeUnit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || activeUnit.movedThisActivation) {
    return;
  }

  for (const ability of getUnitAbilityDefinitions(activeUnit)) {
    if (ability.implementationStatus !== "implemented" || ability.effect?.type !== "ACTIVATION_ATTACK_BUFF") {
      continue;
    }

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
  // without forcing an attack or defend — e.g. a ranged unit holding after a shot.
  if (alreadyAttacked || activeUnit.movedThisActivation) {
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

    const actions: LegalAction[] = state.pendingChoice.candidates.map((candidate, candidateIndex) => ({
      label: `Choose attack roll ${candidate.roll >= 0 ? "+" : ""}${candidate.roll}`,
      action: {
        type: "CHOOSE_PENDING_ROLL",
        playerId,
        choiceId: state.pendingChoice?.id ?? "",
        candidateIndex
      }
    }));

    if (state.pendingChoice.remainingRerolls > 0) {
      const nextSource = state.pendingChoice.rerollSources.find((source) => source.remaining > 0);
      actions.push({
        label: nextSource ? `Reroll attack die (${nextSource.name})` : "Reroll attack die",
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
    const anytimeActions: LegalAction[] = [];
    addActiveEffectActions(anytimeActions, state, playerId);
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

  for (const player of Object.values(state.players)) {
    const reactions = [...new Set(player.hand)].flatMap((cardId) => {
      const card = cards[cardId];
      if (
        !card ||
        (card.timing !== "reaction" && card.timing !== "instant") ||
        card.implementationStatus !== "implemented"
      ) {
        return [];
      }

      const actions: LegalAction[] = [];

      for (const variant of getCardPlayVariants(card)) {
        if (!variantMatchesTrigger(variant, triggerEvent, player.id)) {
          continue;
        }

        const variantName = variant.optionLabel ? `${card.name}: ${variant.optionLabel}` : card.name;

        if (isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "basic")) {
          actions.push(
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
          effectHasExpertMode(variant.effect) &&
          player.combatStats.expertUsesSpentThisRound < player.limits.expertUses &&
          isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "expert")
        ) {
          actions.push(
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

      return actions;
    });

    if (reactions.length > 0) {
      result[player.id] = reactions;
    }
  }

  return result;
}

function variantMatchesTrigger(
  variant: CardPlayVariant,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" }>,
  playerId: PlayerId
): boolean {
  if (!variant.trigger) {
    // Trigger-free instants (currently card draws) may be slotted into any
    // open timing window, mirroring how instants work at the table.
    return variant.effect.type === "DRAW_CARDS";
  }

  if (variant.trigger.event !== triggerEvent.type) {
    return false;
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
  return triggerEvent.power + (stackItem?.modifiers.spellPowerBonus ?? 0);
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
      // Spell power may only be buffed one time per cast, unlike attack and
      // defense buffs that can keep going back and forth between players.
      const stackItem = getPendingStackItem(state, triggerEvent);
      return triggerEvent.playerId === playerId && (stackItem?.modifiers.spellPowerBonus ?? 0) === 0;
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

    if (effect.type !== "ADD_COMBAT_STAT") {
      return false;
    }

    if (effect.stat === "attack") {
      return attacker.controllerId === playerId;
    }

    return defender.controllerId === playerId;
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
    actions.push(
      { label: "Take the top Ability card", action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 } },
      {
        label: "Discard the top Ability card",
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
    actions.push({ label: "Done trading", action: { type: "RESOLVE_VISIT_STEP", playerId } });
    return;
  }

  if (step.type === "DISCOVER_ADJACENT_TILE") {
    const field = adventure.fields[visit.fieldId];
    const tile = field ? adventure.tiles[field.tileInstanceId] : undefined;
    const candidates = tile
      ? Object.values(adventure.tiles).filter(
          (candidate) =>
            candidate.faceDown &&
            Math.abs(candidate.centerRow - tile.centerRow) + Math.abs(candidate.centerCol - tile.centerCol) <= 6
        )
      : [];
    candidates.forEach((candidate, index) => {
      actions.push({
        label: `Discover the face-down tile at (${candidate.centerRow}, ${candidate.centerCol})`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
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

      if (playerHasResources(player, fewSide.cost)) {
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
        if (target && packSide && playerHasResources(player, packSide.cost)) {
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
    if (player.mageGuildBuiltRound !== state.round && player.resources.gold >= cost) {
      actions.push({
        label: `Buy spells (${cost} gold, Search 2)`,
        action: { type: "SPELL_BOOK_ACTION", playerId }
      });
    }
  }

  if (player.morale > 0) {
    actions.push({
      label: "Spend morale: draw a card",
      action: { type: "SPEND_MORALE", playerId, benefit: "draw" }
    });
  }
}

function getAdventureLegalActions(state: GameState, playerId: PlayerId, cards: CardLibrary): LegalAction[] {
  const actions: LegalAction[] = [];
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (!adventure || !player) {
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
            label: "Spend 1 MP: fight another combat round",
            action: { type: "CONTINUE_NEUTRAL_COMBAT", playerId }
          });
        }
        actions.push({
          label: "Retreat to the last visited field",
          action: { type: "RETREAT_FROM_COMBAT", playerId }
        });
      }
    }
    return actions;
  }

  // Active combat: the standard combat actions apply.
  if (state.combat && state.phase === "combat") {
    addActiveEffectActions(actions, state, playerId);
    addUnitActions(actions, state, playerId);
    addSpellActions(actions, state, playerId, cards);
    addPlayableCardActions(actions, state, playerId, cards);
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
        label: "Draw up to your hand limit",
        action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
      },
      ...actions
    ];
  }

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
