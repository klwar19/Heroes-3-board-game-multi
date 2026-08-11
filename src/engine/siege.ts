import { ignoresAllRangedCombatPenalties } from "./active-effects";
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
 *    ranged attacks shot from the attacker's side — UNLESS the shooter carries
 *    the full "Ignore combat penalties" waiver (see `siegeRangedDamageReduction`).
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

/**
 * THE single read of "this card effect would RELOCATE a unit onto a battlefield
 * cell". Today exactly two shipped effects do that — the Teleport Spell
 * (`TELEPORT_UNIT`) and the Necklace of Swiftness's "move one space" option
 * (`MOVE_UNIT_ADJACENT`); both open a destination pick and then write
 * `unit.position`.
 *
 * It exists so `arrowTowerRefusesEffect` below can be applied at BOTH the
 * legal-action offer and the resolution backstop off ONE list — a future
 * relocation effect only has to be added here.
 */
export function effectRelocatesUnitOnBoard(effect: { type: string } | undefined | null): boolean {
  return effect?.type === "TELEPORT_UNIT" || effect?.type === "MOVE_UNIT_ADJACENT";
}

/**
 * The Arrow Tower "fights from beside the board" (position -1) and "is not
 * affected by anything related to its positioning" — so a card effect whose
 * whole job is to MOVE a unit onto a cell can never target it. Without this a
 * Teleport (or the Necklace of Swiftness) physically dragged the Tower onto the
 * battlefield, where it would occupy a cell, become a melee target and take the
 * ranged penalties the printed card exempts it from.
 *
 * Everything ELSE a card can do to a unit is deliberately left alone (the
 * "aiming spells hit the Arrow Tower" ruling): damage, Paralysis, Slow,
 * Forgetfulness, Disrupting Ray, Berserk, Dispel and the defender's own buffs
 * all target it normally. Tier gates are likewise unchanged — the Tower is a
 * real SILVER card, not a gradeless Creature-Bank guard.
 *
 * KNOWN LATENT GAP (found while fixing this, NOT fixed here): position -1 has
 * PHANTOM orthogonal neighbours — `getOrthogonalNeighbors(-1)` returns
 * `[3, 0]`, which is why the Necklace could step the Tower to cell 3. The
 * adjacency PREDICATE is correct (`isAdjacent(-1, 0)` is false both ways, so no
 * melee unit may attack the Tower and a Fireball centred on it splashes
 * nothing), so the phantom list leaks only into code that calls
 * `getOrthogonalNeighbors(tower.position)` directly. Two such paths exist:
 * `MOVE_UNIT_ADJACENT` (closed here) and the Ghost Dragons' knock-back
 * destinations — and that one is UNREACHABLE today, because only ranged attacks
 * may hit the Tower and the sole `KNOCKBACK_AFTER_ATTACK` carrier is a flying
 * (melee) unit. A future RANGED knock-back would need this guard too.
 */
export function arrowTowerRefusesEffect(
  unit: CombatUnitState | undefined | null,
  effect: { type: string } | undefined | null
): boolean {
  return Boolean(unit) && isArrowTowerUnit(unit!) && effectRelocatesUnitOnBoard(effect);
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

/**
 * House rule ("destroy the wall as if it were a unit"): the geometric zone of a
 * multi-target second attack / splash (the cell behind the target, the cells
 * adjacent to the target, the cells adjacent to the attacker) may cover the
 * ENEMY's fortifications. Returns every standing Wall/Gate of the DEFENDER
 * (`townPlayerId`) that sits on one of `cells` — and ONLY when the acting unit
 * is on the OTHER side (a besieger), so a defender's own splash can never fell
 * its own walls. The Arrow Tower is a real unit (position -1) and is never
 * returned here; it is attacked through the normal unit path.
 */
export function enemyFortificationsInCells(
  siege: SiegeState,
  attackerControllerId: PlayerId,
  cells: Iterable<number>
): { kind: "wall" | "gate"; position: number }[] {
  // Only the besieging side (not the wall owner) tears the fortifications down.
  if (attackerControllerId === siege.townPlayerId) {
    return [];
  }
  const cellSet = cells instanceof Set ? cells : new Set(cells);
  const hits: { kind: "wall" | "gate"; position: number }[] = [];
  for (const position of siege.walls) {
    if (cellSet.has(position)) {
      hits.push({ kind: "wall", position });
    }
  }
  if (siege.gatePosition !== null && cellSet.has(siege.gatePosition)) {
    hits.push({ kind: "gate", position: siege.gatePosition });
  }
  return hits;
}

/** Positions a moving unit may not enter because of fortifications. */
export function siegeBlockedPositions(siege: SiegeState, movingUnit: CombatUnitState): number[] {
  if (movingUnit.controllerId === siege.townPlayerId) {
    // "The Gate Card is not an Obstacle to the defending player."
    return [...siege.walls];
  }
  return intactFortificationPositions(siege);
}

/**
 * A living DEFENDER unit standing on this fortification cell, if any. Only the
 * Gate can be occupied — defending units may stop on it, Walls block everyone,
 * and the besieger may never enter a fortification cell. A defender standing on
 * its own Gate SHIELDS it: the Gate cannot be destroyed while occupied (so a
 * champion may plug the Gate to keep it from being battered down). Walls always
 * return null here (nobody can stand on a Wall), so this only ever guards the
 * Gate.
 */
export function defenderOnFortification(
  combat: CombatState,
  siege: SiegeState,
  position: number
): CombatUnitState | null {
  for (const unit of Object.values(combat.units)) {
    if (
      unit.controllerId === siege.townPlayerId &&
      unit.position === position &&
      unit.damage < unit.maxHealth
    ) {
      return unit;
    }
  }
  return null;
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
      cardImage: "/assets/structures-arrow_tower.webp",
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
  attackKind: "melee" | "ranged",
  state?: GameState,
  isRetaliation = false
): number {
  const siege = combat.siege;
  if (!siege || attackKind !== "ranged") {
    return 0;
  }
  // "Ignore combat penalties" (Magi / Sharpshooters / the neutral Halfling, plus
  // the Ammo Cart's player-scoped waiver) covers the behind-Wall shot too — the
  // SAME read `getAttackRollMode` uses for the roll penalty, so the two can never
  // disagree. The narrower "No Adjacent Penalty" variant prints that this penalty
  // still applies and is deliberately NOT read here.
  if (ignoresAllRangedCombatPenalties(attacker, state, isRetaliation)) {
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

  // A defender standing on the Gate shields it — it cannot be destroyed while
  // occupied (backstop for every destruction path: Catapult/Cannon, melee
  // demolish, Earthquake, splash). Only the Gate can be occupied, so this never
  // affects Walls.
  if (defenderOnFortification(combat, siege, position)) {
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

/**
 * House rule ("as like attack a unit"): fell every ENEMY Wall/Gate the acting
 * unit's multi-attack zone covers (`cells`). One hit fells a fortification —
 * the same auto-success the Catapult uses (a Wall/Gate has no HP), so this reuses
 * `destroyFortification` (its `FORTIFICATION_DESTROYED` event + Arrow-Tower
 * collapse). The AUTOMATIC multi-attack kinds (Gold Dragon line breath, Lich
 * Death Cloud, attack-all) call this; the pick-one kinds (Hydra, Magog/Cerberi
 * splash) instead offer the fortification as a choosable target. Returns the
 * number felled.
 */
export function destroyEnemyFortificationsInCells(
  state: GameState,
  attacker: CombatUnitState,
  cells: Iterable<number>
): number {
  const siege = state.combat?.siege;
  if (!siege) {
    return 0;
  }
  const hits = enemyFortificationsInCells(siege, attacker.controllerId, cells);
  for (const hit of hits) {
    destroyFortification(state, attacker, hit.kind, hit.position);
  }
  return hits.length;
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
