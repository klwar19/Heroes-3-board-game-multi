import {
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldCoordinates,
  isAdjacent
} from "./battlefield";
import { arrowTowerRefusesEffect } from "./siege";
import type { CombatState, CombatUnitState, GameState, PlayerId } from "./state";

/**
 * Little Busters hero specialties — the shared, side-effect-free reads.
 *
 * The five sets are ORIGINAL cards (no printed scan); each card's `tags` prose
 * in src/data/cards/adventure.ts states exactly what the engine below runs. The
 * mutating halves live in reducer.ts (they need the attack stack, the card
 * library and the combat-unit minting helpers); everything that can be a pure
 * function lives here so the offer gate and the resolution can never disagree.
 */

/** Feed/FX slugs for the four engine-resolved Little Busters specialty arms. */
export const LITTLE_BUSTERS_HOME_RUN_ID = "little-busters-home-run";
export const LITTLE_BUSTERS_CAT_CORPS_ID = "little-busters-cat-corps";
export const LITTLE_BUSTERS_BOND_ID = "little-busters-bond";
export const LITTLE_BUSTERS_BLADE_DANCE_ID = "little-busters-blade-dance";

/**
 * Local "still on the board" read. Deliberately NOT imported from
 * legal-actions.ts: this module is a leaf that reducer.ts, legal-actions.ts and
 * the tests all import, and pulling the 16k-line legality module in here would
 * close a cycle. The predicate is the engine's own one-liner.
 */
function alive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

// ---------------------------------------------------------------------------
// Sasami — "Home Run"
// ---------------------------------------------------------------------------

/**
 * The cell one space beyond `defender`, continuing the line from `attacker`.
 * Null unless the two stand orthogonally adjacent and the cell is on the board.
 * (A private twin of the reducer's `cellBehindTarget`, which is not exported.)
 */
export function knockbackCellBehind(
  attacker: CombatUnitState,
  defender: CombatUnitState
): number | null {
  const from = getBattlefieldCoordinates(attacker.position);
  const at = getBattlefieldCoordinates(defender.position);
  const rowStep = at.row - from.row;
  const columnStep = at.column - from.column;
  if (Math.abs(rowStep) + Math.abs(columnStep) !== 1) {
    return null;
  }
  const row = at.row + rowStep;
  const column = at.column + columnStep;
  if (row < 0 || row >= BATTLEFIELD_ROWS || column < 0 || column >= BATTLEFIELD_COLUMNS) {
    return null;
  }
  return row * BATTLEFIELD_COLUMNS + column;
}

/**
 * "Any unit the Teleport spell refuses to relocate" — today exactly the Arrow
 * Tower, read through the SAME `arrowTowerRefusesEffect` gate the Teleport spell
 * and the Necklace of Swiftness take, so a future entry in that list covers the
 * Home Run shove for free.
 */
export function unitRefusesRelocation(unit: CombatUnitState): boolean {
  return arrowTowerRefusesEffect(unit, { type: "TELEPORT_UNIT" });
}

export type HomeRunOutcome =
  | { kind: "none" }
  | { kind: "push"; destination: number }
  | { kind: "damage" };

/**
 * What Sasami's Home Run does to `defender` once the attack has resolved.
 *
 *  - "none": the target did not survive (a corpse is neither shoved nor hurt).
 *  - "push": the target survived, the attacker stands orthogonally adjacent, and
 *    the cell continuing the attacker→target line is free.
 *  - "damage": the target survived but cannot be shoved — the attacker is not
 *    adjacent (a ranged shot), the cell is off-board / occupied / an obstacle /
 *    a wall / a spell token, or the unit refuses relocation.
 */
export function homeRunOutcome(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  spaceIsBlocked: (position: number) => boolean
): HomeRunOutcome {
  if (!alive(defender)) {
    return { kind: "none" };
  }
  if (unitRefusesRelocation(defender) || unitRefusesRelocation(attacker)) {
    return { kind: "damage" };
  }
  const destination = knockbackCellBehind(attacker, defender);
  if (destination === null || spaceIsBlocked(destination)) {
    return { kind: "damage" };
  }
  void combat;
  return { kind: "push", destination };
}

// ---------------------------------------------------------------------------
// Rin — "Cat Corps"
// ---------------------------------------------------------------------------

/**
 * "…on an empty space NEXT TO one of your units" (the printed card): a cat may
 * only slip in beside a living body its owner controls, so the summons cannot be
 * dropped behind the enemy line. THE one read behind both surfaces — the offered
 * empty spaces (legal-actions.ts) and the auto-placed second cat below — so the
 * offer and the resolution can never disagree. A cat already placed by this play
 * counts, exactly like any other friendly unit.
 */
export function catLandingIsAnchored(
  combat: CombatState,
  playerId: PlayerId,
  position: number,
  extraFriendlyPositions: readonly number[] = []
): boolean {
  if (extraFriendlyPositions.some((friendly) => isAdjacent(friendly, position))) {
    return true;
  }
  return Object.values(combat.units).some(
    (unit) => unit.controllerId === playerId && alive(unit) && isAdjacent(unit.position, position)
  );
}

/**
 * Where `count` summoned cats land: the player's chosen empty space first, then
 * the lowest-numbered remaining legal cell STILL beside one of the player's own
 * units. Deterministic on purpose — a second placement window would be one more
 * thing a computer or AFK seat could stall on (see the computer/window.ts
 * lockstep rule), and the shipped Summon Elemental offers no pick beyond its own
 * card target either.
 */
export function campusCatPositions(
  combat: CombatState,
  playerId: PlayerId,
  firstPosition: number,
  count: number,
  spaceIsBlocked: (position: number) => boolean
): number[] {
  const taken = new Set<number>();
  const positions: number[] = [];
  if (!spaceIsBlocked(firstPosition) && catLandingIsAnchored(combat, playerId, firstPosition)) {
    positions.push(firstPosition);
    taken.add(firstPosition);
  }
  for (let position = 0; position < BATTLEFIELD_CELL_COUNT && positions.length < count; position += 1) {
    if (
      taken.has(position) ||
      spaceIsBlocked(position) ||
      !catLandingIsAnchored(combat, playerId, position, positions)
    ) {
      continue;
    }
    positions.push(position);
    taken.add(position);
  }
  return positions.slice(0, count);
}

// ---------------------------------------------------------------------------
// Riki — "Little Busters' Bond"
// ---------------------------------------------------------------------------

/**
 * How many of `playerId`'s OWN ARMY units this combat has already taken off the
 * board. A summoned cat, a borrowed/temporary body and the WOG commander are all
 * excluded (they are not army cards); a Pack that merely flipped to its Few side
 * is still alive and is not counted.
 */
export function fallenArmyUnitCount(state: GameState, playerId: PlayerId): number {
  const combat = state.combat;
  if (!combat) {
    return 0;
  }
  return Object.values(combat.units).filter(
    (unit) =>
      unit.controllerId === playerId &&
      !alive(unit) &&
      Boolean(unit.armyUnitId) &&
      !unit.summoned &&
      !unit.temporary &&
      !unit.commanderSlug &&
      !unit.cloneOfUnitId
  ).length;
}

// ---------------------------------------------------------------------------
// Yuiko — "Blade Dance"
// ---------------------------------------------------------------------------

/**
 * The Blade Dance splash `attacker` owes after its own declared attack resolved
 * on `roll`, or 0. Several copies would stack, which is why this sums rather
 * than taking the first match.
 */
export function bladeDanceSplashFor(
  state: GameState,
  attacker: CombatUnitState,
  roll: number
): number {
  let total = 0;
  for (const effect of state.activeEffects) {
    if (effect.target?.type !== "unit" || effect.target.unitId !== attacker.id) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "BLADE_DANCE_SPLASH" && roll >= modifier.minRoll) {
        total += modifier.amount;
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Komari — "Star Candy"
// ---------------------------------------------------------------------------

/**
 * The level-VI second shield target: the owner's most WOUNDED other living unit
 * (ties broken by unit id, so it is reproducible on every client). Null when the
 * player fields nobody else.
 */
export function starCandySecondTarget(
  state: GameState,
  playerId: PlayerId,
  chosenUnitId: string
): CombatUnitState | null {
  const combat = state.combat;
  if (!combat) {
    return null;
  }
  const candidates = Object.values(combat.units)
    .filter((unit) => unit.controllerId === playerId && unit.id !== chosenUnitId && alive(unit))
    .sort((left, right) => right.damage - left.damage || (left.id < right.id ? -1 : 1));
  return candidates[0] ?? null;
}
