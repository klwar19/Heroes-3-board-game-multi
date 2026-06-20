import { getUnitAbilityDefinitions } from "./unit-abilities";
import { BATTLEFIELD_COLUMNS, BATTLEFIELD_CROSSING_ROW } from "./battlefield";
import { appendEvent } from "./events";
import type { CombatState, CombatUnitState, GameState, PlayerId, SiegeState, UnitId } from "./state";

/**
 * Siege combat (town with a Citadel): 3 Wall cards and 1 Gate card fill the
 * middle row of the combat board; the Arrow Tower fights from beside it.
 *
 *  - Walls and the Gate are Combat Obstacles to the attacker; the Gate is no
 *    obstacle to the defender (defending units may pass and stop on it).
 *  - Any adjacent ground/flying unit may destroy a Wall/Gate as its attack:
 *    automatically successful, no die, no cards, no attack abilities.
 *  - The Arrow Tower (ATK 4 / DEF 2 / HP 3 / initiative 9, Ranged) ignores
 *    everything positional, may only be hit by ranged attacks and card
 *    effects, and collapses when all Walls and the Gate are gone.
 *  - Defenders in the column of an intact Wall/Gate take 1 less damage from
 *    ranged attacks shot from the attacker's side.
 */

/** Middle-row battlefield positions holding the fortification cards. */
export const SIEGE_ROW_POSITIONS = [8, 9, 10, 11];

export const ARROW_TOWER_POSITION = -1;

export const ARROW_TOWER_STATS = {
  attack: 4,
  defense: 2,
  health: 3,
  initiative: 9
} as const;

export function isArrowTowerUnit(unit: CombatUnitState): boolean {
  return unit.abilities.includes("siege-arrow-tower");
}

export function getSiege(combat: CombatState | null): SiegeState | null {
  return combat?.siege ?? null;
}

/** Fortification positions that still stand (walls plus gate). */
export function intactFortificationPositions(siege: SiegeState): number[] {
  return [...siege.walls, ...(siege.gatePosition !== null ? [siege.gatePosition] : [])];
}

/**
 * Catapult bombardment targets. A standing Wall or the Gate has no unit card
 * (and so no unit id), so it is aimed at by a reserved pseudo-id. The generic
 * war-machine target choice carries a flat list of target ids, so this lets it
 * offer fortifications alongside units. `parseFortificationTargetId` is the
 * inverse; together they keep the "siege-fortification:" wire format in one
 * place. The Arrow Tower is deliberately NOT a Catapult target — the card hits
 * "units, Walls and the Gate", and the Tower sits off the board (position -1).
 */
export function fortificationTargetId(kind: "wall" | "gate", position: number): string {
  return `siege-fortification:${kind}:${position}`;
}

export function parseFortificationTargetId(targetId: string): { kind: "wall" | "gate"; position: number } | null {
  const match = /^siege-fortification:(wall|gate):(-?\d+)$/.exec(targetId);
  if (!match) {
    return null;
  }
  return { kind: match[1] as "wall" | "gate", position: Number(match[2]) };
}

/** Every standing Wall and the Gate as a Catapult-aimable target (id + position). */
export function fortificationTargets(
  siege: SiegeState
): { id: string; kind: "wall" | "gate"; position: number }[] {
  const targets: { id: string; kind: "wall" | "gate"; position: number }[] = siege.walls.map((position) => ({
    id: fortificationTargetId("wall", position),
    kind: "wall",
    position
  }));
  if (siege.gatePosition !== null) {
    targets.push({
      id: fortificationTargetId("gate", siege.gatePosition),
      kind: "gate",
      position: siege.gatePosition
    });
  }
  return targets;
}

/** Positions a moving unit may not enter because of fortifications. */
export function siegeBlockedPositions(siege: SiegeState, movingUnit: CombatUnitState): number[] {
  if (movingUnit.controllerId === siege.townPlayerId) {
    // "The Gate Card is not an Obstacle to the defending player."
    return [...siege.walls];
  }
  return intactFortificationPositions(siege);
}

export function makeArrowTowerUnit(unitId: UnitId, controllerId: PlayerId): CombatUnitState {
  return {
    id: unitId,
    controllerId,
    name: "Arrow Tower",
    cardName: "Arrow Tower",
    variant: "neutral",
    grade: "silver",
    type: "ranged",
    attack: ARROW_TOWER_STATS.attack,
    defense: ARROW_TOWER_STATS.defense,
    maxHealth: ARROW_TOWER_STATS.health,
    damage: 0,
    initiative: ARROW_TOWER_STATS.initiative,
    position: ARROW_TOWER_POSITION,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: ["siege-arrow-tower"],
    assets: {
      imageAlt: "Arrow Tower siege card"
    }
  };
}

/**
 * Whether the ranged shot is fired "from the opponent's side of the Combat
 * Board" at a defender protected by an intact Wall/Gate in its column:
 * such hits deal 1 less damage.
 */
export function siegeRangedDamageReduction(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged"
): number {
  const siege = combat.siege;
  if (!siege || attackKind !== "ranged") {
    return 0;
  }
  if (defender.controllerId !== siege.townPlayerId) {
    return 0;
  }
  // The tower itself is "not affected by anything related to its positioning".
  if (isArrowTowerUnit(defender) || isArrowTowerUnit(attacker)) {
    return 0;
  }

  const defenderRow = Math.floor(defender.position / BATTLEFIELD_COLUMNS);
  const attackerRow = Math.floor(attacker.position / BATTLEFIELD_COLUMNS);
  const defenderOnOwnSide = defenderRow < BATTLEFIELD_CROSSING_ROW;
  const attackerOnFarSide = attackerRow > BATTLEFIELD_CROSSING_ROW;
  if (!defenderOnOwnSide || !attackerOnFarSide) {
    return 0;
  }

  const column = defender.position % BATTLEFIELD_COLUMNS;
  const wallPosition = BATTLEFIELD_CROSSING_ROW * BATTLEFIELD_COLUMNS + column;
  return intactFortificationPositions(siege).includes(wallPosition) ? 1 : 0;
}

/** The cyclops-style demolish ability of a unit, if any. */
export function getDemolishAbility(unit: CombatUnitState): { abilityId: string; canTargetArrowTower: boolean } | null {
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (ability.implementationStatus === "implemented" && ability.effect?.type === "DEMOLISH_FORTIFICATION") {
      return { abilityId: ability.id, canTargetArrowTower: ability.effect.canTargetArrowTower };
    }
  }
  return null;
}

/**
 * Removes a wall/gate from the board, announces it, and collapses the Arrow
 * Tower once every Wall and the Gate are gone.
 */
export function destroyFortification(
  state: GameState,
  byUnit: CombatUnitState | null,
  kind: "wall" | "gate",
  position: number
): void {
  const combat = state.combat;
  const siege = combat?.siege;
  if (!combat || !siege) {
    return;
  }

  if (kind === "wall") {
    siege.walls = siege.walls.filter((candidate) => candidate !== position);
  } else if (siege.gatePosition === position) {
    siege.gatePosition = null;
  }

  appendEvent(state, {
    type: "FORTIFICATION_DESTROYED",
    playerId: byUnit?.controllerId ?? siege.townPlayerId,
    byUnitId: byUnit?.id ?? null,
    kind,
    position,
    message: `${byUnit ? byUnit.cardName : "An effect"} destroys the ${kind === "wall" ? "Wall" : "Gate"}.`
  });

  collapseArrowTowerIfBreached(state);
}

/** "It is instantly destroyed when all Walls and the Gate are destroyed." */
export function collapseArrowTowerIfBreached(state: GameState): void {
  const combat = state.combat;
  const siege = combat?.siege;
  if (!combat || !siege || !siege.arrowTowerUnitId) {
    return;
  }

  if (intactFortificationPositions(siege).length > 0) {
    return;
  }

  removeArrowTower(state, null, "the fortifications were breached");
}

export function removeArrowTower(state: GameState, byUnit: CombatUnitState | null, why: string): void {
  const combat = state.combat;
  const siege = combat?.siege;
  const tower = siege?.arrowTowerUnitId ? combat?.units[siege.arrowTowerUnitId] : undefined;
  if (!combat || !siege || !tower) {
    return;
  }

  siege.arrowTowerUnitId = null;
  tower.damage = tower.maxHealth;

  appendEvent(state, {
    type: "FORTIFICATION_DESTROYED",
    playerId: byUnit?.controllerId ?? siege.townPlayerId,
    byUnitId: byUnit?.id ?? null,
    kind: "arrow-tower",
    message: `The Arrow Tower falls — ${why}.`
  });
  appendEvent(state, {
    type: "UNIT_REMOVED",
    unitId: tower.id,
    playerId: tower.controllerId
  });
}
