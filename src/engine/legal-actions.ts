import { sampleCards } from "@/data/cards/sample";
import { sampleBuildings } from "@/data/towns/buildings";
import {
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldDistance,
  getBattlefieldLabel,
  getBattlefieldTerrain,
  isBattlefieldPosition
} from "./battlefield";
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
  UnitId
} from "./state";
import { getUnitAbilityDefinitions, hasUnitAbilityEffect } from "./unit-abilities";

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

  for (const cardId of player.hand) {
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

  for (const cardId of player.hand) {
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
  if (!combat?.activeUnitId) {
    if (combat && playerId === combat.attackerPlayerId) {
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
  cards: CardLibrary = sampleCards,
  buildings: BuildingLibrary = sampleBuildings
): LegalAction[] {
  if (state.phase === "game-over") {
    return [];
  }

  if (state.pendingChoice) {
    if (state.pendingChoice.playerId !== playerId) {
      return [];
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
      actions.push({
        label: "Reroll attack die",
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
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  addUnitActions(actions, state, playerId);
  addSpellActions(actions, state, playerId, cards);
  addPlayableCardActions(actions, state, playerId, cards);

  return actions;
}

export function getLegalReactionsForTrigger(
  state: GameState,
  triggerEvent: GameEvent,
  cards: CardLibrary = sampleCards
): Record<PlayerId, LegalAction[]> {
  if (triggerEvent.type !== "SPELL_CAST_STARTED" && triggerEvent.type !== "UNIT_ATTACK_DECLARED") {
    return {};
  }

  const result: Record<PlayerId, LegalAction[]> = {};

  for (const player of Object.values(state.players)) {
    const reactions = player.hand.flatMap((cardId) => {
      const card = cards[cardId];
      if (
        !card ||
        (card.timing !== "reaction" && card.timing !== "instant") ||
        card.implementationStatus !== "implemented"
      ) {
        return [];
      }

      if (!card.trigger || card.trigger.event !== triggerEvent.type) {
        return [];
      }

      const isSelf = triggerEvent.playerId === player.id;
      if (card.trigger.controller === "self" && !isSelf) {
        return [];
      }

      if (card.trigger.controller === "opponent" && isSelf) {
        return [];
      }

      if (!isCardEffectLegalForTrigger(state, player.id, cardId, triggerEvent, cards)) {
        return [];
      }

      const actions: LegalAction[] = [
        makeReactionAction(card.name, {
          type: "PLAY_REACTION",
          playerId: player.id,
          cardId,
          mode: "basic"
        })
      ];

      if (
        getExpertAmount(card.effect) !== null &&
        player.combatStats.expertUsesSpentThisRound < player.limits.expertUses
      ) {
        actions.push(
          makeReactionAction(`${card.name} expert`, {
            type: "PLAY_REACTION",
            playerId: player.id,
            cardId,
            mode: "expert"
          })
        );
      }

      return actions;
    });

    if (reactions.length > 0) {
      result[player.id] = reactions;
    }
  }

  return result;
}

function getPendingStackItem(state: GameState, triggerEvent: GameEvent) {
  return state.stack.find((item) => item.triggerEventIds.includes(triggerEvent.id));
}

function getPendingSpellPower(state: GameState, triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" }>): number {
  const stackItem = getPendingStackItem(state, triggerEvent);
  return triggerEvent.power + (stackItem?.modifiers.spellPowerBonus ?? 0);
}

function getExpertAmount(effect: CardLibrary[string]["effect"]): number | null {
  if (effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER") {
    return effect.expertAmount ?? null;
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return effect.expertEffect ? 0 : null;
  }

  if (effect.type === "RECALL_SPELL") {
    return effect.expertSpellLimitBonus ? 0 : null;
  }

  return null;
}

function makeReactionAction(label: string, action: Extract<GameAction, { type: "PLAY_REACTION" }>): LegalAction {
  const modeLabel = action.mode === "expert" ? " (expert)" : "";
  return {
    label: `Play ${label}${modeLabel}`,
    action
  };
}

function isCardEffectLegalForTrigger(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" }>,
  cards: CardLibrary
): boolean {
  const card = cards[cardId];
  if (!card) {
    return false;
  }

  if (triggerEvent.type === "SPELL_CAST_STARTED") {
    if (card.effect.type === "ADD_SPELL_POWER") {
      return triggerEvent.playerId === playerId;
    }

    if (card.effect.type === "CANCEL_SPELL") {
      if (triggerEvent.playerId === playerId) {
        return false;
      }

      if (card.effect.maxPower !== undefined) {
        if (getPendingSpellPower(state, triggerEvent) > card.effect.maxPower) {
          return false;
        }
      }

      return true;
    }

    if (card.effect.type === "RECALL_SPELL") {
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

    if (card.effect.type === "CREATE_ACTIVE_EFFECT") {
      return card.effect.effect.modifiers.every((modifier) => {
        if (modifier.type !== "RANGED_ATTACK_BONUS") {
          return true;
        }

        if (attacker.type !== "ranged") {
          return false;
        }

        return !modifier.nonAdjacentOnly || !isAdjacent(attacker.position, defender.position);
      });
    }

    if (card.effect.type !== "ADD_COMBAT_STAT") {
      return false;
    }

    if (card.effect.stat === "attack") {
      return attacker.controllerId === playerId;
    }

    return defender.controllerId === playerId;
  }

  return false;
}

export function getActiveUnitId(state: GameState): UnitId | null {
  return state.combat?.activeUnitId ?? null;
}
