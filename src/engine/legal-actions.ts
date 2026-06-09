import { sampleCards } from "@/data/cards/sample";
import {
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  getBattlefieldDistance,
  getBattlefieldLabel,
  getBattlefieldTerrain,
  isBattlefieldPosition
} from "./battlefield";
import type {
  CardLibrary,
  CombatState,
  CombatUnitState,
  GameAction,
  GameEvent,
  GameState,
  LegalAction,
  PlayerId,
  TargetRef,
  UnitId
} from "./state";

export function isUnitAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

export function isAdjacent(leftPosition: number, rightPosition: number, columns = BATTLEFIELD_COLUMNS): boolean {
  const leftRow = Math.floor(leftPosition / columns);
  const leftColumn = leftPosition % columns;
  const rightRow = Math.floor(rightPosition / columns);
  const rightColumn = rightPosition % columns;

  return Math.abs(leftRow - rightRow) <= 1 && Math.abs(leftColumn - rightColumn) <= 1;
}

export function getUnitMoveRange(unit: CombatUnitState): number {
  return unit.type === "flying" ? unit.initiative : Math.min(3, unit.initiative);
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

export function canUnitMoveTo(combat: CombatState, unit: CombatUnitState, destination: number): boolean {
  if (!isUnitAlive(unit) || unit.activatedThisRound || !isBattlefieldPosition(destination)) {
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

export function getLegalMoveDestinations(combat: CombatState, unit: CombatUnitState): number[] {
  return Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, position) => position).filter((position) =>
    canUnitMoveTo(combat, unit, position)
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

export function canUnitAttack(attacker: CombatUnitState, defender: CombatUnitState): boolean {
  if (!isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  if (attacker.controllerId === defender.controllerId) {
    return false;
  }

  if (attacker.type === "ranged" || attacker.type === "flying") {
    return true;
  }

  return isAdjacent(attacker.position, defender.position);
}

function getEnemyTargets(state: GameState, playerId: PlayerId): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  return Object.values(state.combat.units)
    .filter((unit) => unit.controllerId !== playerId)
    .filter(isUnitAlive)
    .map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

function addSpellActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const player = state.players[playerId];
  if (!player || player.combatStats.spellsCastThisRound > 0) {
    return;
  }

  for (const cardId of player.hand) {
    const card = cards[cardId];
    if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
      continue;
    }

    for (const target of getEnemyTargets(state, playerId)) {
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

  for (const destination of getLegalMoveDestinations(combat, activeUnit)) {
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

  for (const defender of Object.values(combat.units)) {
    if (!canUnitAttack(activeUnit, defender)) {
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

export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = sampleCards
): LegalAction[] {
  if (state.phase === "game-over") {
    return [];
  }

  if (state.reactionWindow) {
    if (state.reactionWindow.priorityPlayerId !== playerId) {
      return [];
    }

    return [
      ...(state.reactionWindow.legalReactions[playerId] ?? []),
      {
        label: "Pass reaction",
        action: { type: "PASS_REACTION", playerId }
      }
    ];
  }

  if (state.activePlayerId !== playerId) {
    return [];
  }

  const actions: LegalAction[] = [];

  if (!state.combat || state.phase !== "combat") {
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  addUnitActions(actions, state, playerId);
  addSpellActions(actions, state, playerId, cards);

  return actions;
}

export function getLegalReactionsForTrigger(
  state: GameState,
  triggerEvent: GameEvent,
  cards: CardLibrary = sampleCards
): Record<PlayerId, LegalAction[]> {
  if (triggerEvent.type !== "SPELL_CAST_STARTED") {
    return {};
  }

  const result: Record<PlayerId, LegalAction[]> = {};

  for (const player of Object.values(state.players)) {
    const reactions = player.hand.flatMap((cardId) => {
      const card = cards[cardId];
      if (!card || card.timing !== "reaction" || card.implementationStatus !== "implemented") {
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

      if (card.effect.type === "CANCEL_SPELL" && card.effect.maxPower !== undefined) {
        if (triggerEvent.power > card.effect.maxPower) {
          return [];
        }
      }

      return [
        {
          label: `Play ${card.name}`,
          action: {
            type: "PLAY_REACTION",
            playerId: player.id,
            cardId
          } satisfies GameAction
        }
      ];
    });

    if (reactions.length > 0) {
      result[player.id] = reactions;
    }
  }

  return result;
}

export function getActiveUnitId(state: GameState): UnitId | null {
  return state.combat?.activeUnitId ?? null;
}
