// ---------------------------------------------------------------------------
// Hex Battlefield: the PC combat cursor and its melee approach.
//
// As in Heroes 3, resting the mouse on an enemy the active creature can reach
// shows an attack sword on the side of the enemy it will strike from. The side
// follows the mouse inside the enemy's hex (the sword turns as it moves), and a
// click strikes from exactly that side: from where the creature stands (the
// engine's ATTACK_UNIT), or by first walking to that hex (the engine's own
// MOVE_UNIT to it) and then attacking — both legal actions the engine offers
// and validates; nothing here decides legality. Ranged shots show the bow
// (broken when the shot rolls at a disadvantage), reachable hexes the walk /
// fly cursor and a First Aid mend the tent's cross.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";
import type { CombatState, CombatUnitState, GameAction, GameState } from "@/engine";
import { canUnitMoveAndAttack, getAttackKind, getAttackRollMode } from "@/engine/legal-actions";
import { isAdjacent, isHexPosition } from "@/engine/battlefield";
import { unitCells, unitCellsAt } from "@/engine/hex-footprint";
import { assetUrl } from "@/lib/asset-url";
import combatCursors from "@/data/battle-hex/combat-cursors.json";
import { hexBoardMetrics, hexCellCenter } from "./hex-battlefield";

type CursorName = keyof typeof combatCursors;

/** CSS for one PC combat cursor (the arrow pointer when its art is missing). */
export function hexCursorStyle(name: CursorName): CSSProperties {
  const cursor = combatCursors[name];
  return { cursor: `url("${assetUrl(cursor.image)}") ${cursor.hotX} ${cursor.hotY}, pointer` };
}

/** One side of the enemy the active creature can strike from. */
export type HexApproach = {
  /** The attacker's head hex when it strikes (its current hex for an attack in place). */
  destination: number;
  /** The move to take first; absent when the creature strikes from where it stands. */
  move?: Extract<GameAction, { type: "MOVE_UNIT" }>;
  /** The attack in place (only when `move` is absent). */
  attack?: GameAction;
  /** Screen-space angle (radians, y down) from the aimed enemy hex to the attacker's striking hex. */
  angle: number;
};

/** The attacker hex (of its footprint at `head`) nearest the aimed enemy hex. */
function strikingCell(combat: CombatState, attacker: CombatUnitState, head: number, aimed: number, flipped: boolean): number {
  const cells = unitCellsAt(combat, attacker, head);
  const target = hexCellCenter(aimed, flipped);
  let best = cells[0];
  let bestDistance = Infinity;
  for (const cell of cells) {
    const point = hexCellCenter(cell, flipped);
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}

function angleFrom(aimed: number, cell: number, flipped: boolean): number {
  const from = hexCellCenter(aimed, flipped);
  const to = hexCellCenter(cell, flipped);
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * The side a strike from `head` comes from, as VCMI reads it: the centre of the
 * attacker's hexes that touch the aimed hex — one neighbour (a straight side),
 * or, for a two-hex creature standing across both hexes above / below it, the
 * point straight above / below (the PC's north / south swords). A two-hex
 * attacker touching only the enemy's other hex strikes from its nearest hex.
 */
function approachAngle(combat: CombatState, attacker: CombatUnitState, head: number, aimed: number, flipped: boolean): number {
  const touching = unitCellsAt(combat, attacker, head).filter((cell) => isAdjacent(cell, aimed));
  if (touching.length === 0) return angleFrom(aimed, strikingCell(combat, attacker, head, aimed, flipped), flipped);
  const from = hexCellCenter(aimed, flipped);
  const points = touching.map((cell) => hexCellCenter(cell, flipped));
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return Math.atan2(y - from.y, x - from.x);
}

/**
 * The PC attack side under the mouse (VCMI BattleFieldController::
 * selectAttackDirection): of the test points around the aimed hex — its six
 * neighbours' centres, plus, for a two-hex striker, the points one hex-height
 * straight above and below — the one nearest the mouse. `dx`/`dy` are the
 * mouse's offset from the aimed hex centre in board units; returns that test
 * point's direction (radians, y down), so the board re-renders only when the
 * side changes, never on every mouse pixel.
 */
export function hexAimSideAngle(dx: number, dy: number, twoHexStriker: boolean): number {
  const { hexWidth: w, hexRadius, rowStep } = hexBoardMetrics;
  const points: Array<[number, number]> = [
    [w, 0], [w / 2, rowStep], [-w / 2, rowStep], [-w, 0], [-w / 2, -rowStep], [w / 2, -rowStep]
  ];
  if (twoHexStriker) points.push([0, -2 * hexRadius], [0, 2 * hexRadius]);
  let best = points[0];
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = (point[0] - dx) ** 2 + (point[1] - dy) ** 2;
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return Math.atan2(best[1], best[0]);
}

/**
 * Every side the active melee creature can strike `defender` from this
 * activation: its current hex when the engine offers the attack in place
 * (`attackInPlace`, a melee ATTACK_UNIT), and every offered MOVE_UNIT
 * destination from which the engine's own move-then-attack rule
 * (canUnitMoveAndAttack) lets it strike. `aimed` is the enemy hex under the
 * mouse (a two-hex enemy has two).
 */
export function hexApproaches({
  state,
  combat,
  attacker,
  defender,
  aimed,
  flipped,
  attackInPlace,
  moves
}: {
  state: GameState;
  combat: CombatState;
  attacker: CombatUnitState;
  defender: CombatUnitState;
  aimed: number;
  flipped: boolean;
  attackInPlace: GameAction | undefined;
  moves: ReadonlyMap<number, GameAction>;
}): HexApproach[] {
  if (!isHexPosition(aimed) || !isHexPosition(attacker.position)) return [];
  const approaches: HexApproach[] = [];
  if (attackInPlace && getAttackKind(attacker, defender, combat) === "melee") {
    approaches.push({
      destination: attacker.position,
      attack: attackInPlace,
      angle: approachAngle(combat, attacker, attacker.position, aimed, flipped)
    });
  }
  // Ranged creatures never walk up and strike (they shoot, or melee only when
  // already adjacent), and an attack already made this activation ends it.
  if (attacker.type === "ranged" || attacker.attackedThisActivation) return approaches;
  for (const [destination, action] of moves) {
    if (action.type !== "MOVE_UNIT" || action.unitId !== attacker.id || destination === attacker.position) continue;
    if (!canUnitMoveAndAttack(combat, attacker, destination, defender, state)) continue;
    const cell = strikingCell(combat, attacker, destination, aimed, flipped);
    // Strike from a hex that touches the enemy (a two-hex attacker's other end
    // may be the one touching it).
    if (!unitCells(combat, defender).some((enemyCell) => isAdjacent(enemyCell, cell))) continue;
    approaches.push({ destination, move: action, angle: approachAngle(combat, attacker, destination, aimed, flipped) });
  }
  return approaches;
}

/** The approach whose side is nearest the mouse's direction from the aimed hex centre. */
export function pickHexApproach(approaches: readonly HexApproach[], mouseAngle: number | null): HexApproach | null {
  if (approaches.length === 0) return null;
  if (mouseAngle === null) {
    return approaches.find((approach) => !approach.move) ?? approaches[0];
  }
  let best = approaches[0];
  let bestGap = Infinity;
  for (const approach of approaches) {
    const raw = Math.abs(approach.angle - mouseAngle) % (2 * Math.PI);
    const gap = raw > Math.PI ? 2 * Math.PI - raw : raw;
    // Ties (a two-hex attacker reaching the same side from two heads) keep the
    // attack in place, then the shorter move (engine offer order).
    if (gap < bestGap - 1e-6 || (Math.abs(gap - bestGap) <= 1e-6 && !approach.move && best.move)) {
      best = approach;
      bestGap = gap;
    }
  }
  return best;
}

/** The PC sword pointing from the striking side into the enemy. */
export function hexAttackCursor(approach: HexApproach): CursorName {
  const toward = approach.angle + Math.PI;
  const degrees = ((toward * 180) / Math.PI + 360) % 360;
  const swords: Array<[number, CursorName]> = [
    [0, "attack-e"], [45, "attack-se"], [90, "attack-s"], [135, "attack-sw"],
    [180, "attack-w"], [225, "attack-nw"], [270, "attack-n"], [315, "attack-ne"], [360, "attack-e"]
  ];
  let best: CursorName = "attack-e";
  let bestGap = Infinity;
  for (const [angle, name] of swords) {
    const gap = Math.abs(degrees - angle);
    if (gap < bestGap) {
      best = name;
      bestGap = gap;
    }
  }
  return best;
}

/** The bow, or the broken bow when this shot rolls two dice and keeps the lower. */
export function hexShootCursor(state: GameState, attacker: CombatUnitState, defender: CombatUnitState): CursorName {
  return getAttackRollMode(attacker, defender, state) === "disadvantage" ? "shoot-penalty" : "shoot";
}

/** The attack the engine offers is a shot (not adjacent, a shooter). */
export function hexAttackIsRanged(combat: CombatState, attacker: CombatUnitState, defender: CombatUnitState): boolean {
  return getAttackKind(attacker, defender, combat) === "ranged";
}
