import { cardLibrary } from "@/data/cards/library";
import { coreUnitDefinitions } from "@/data/factions/units";
import { combatGeometry, getBattlefieldDistance, getBattlefieldPositions, isBattlefieldPosition } from "./battlefield";
import { battlefieldTokenCells, footprintAt, unitCells, unitTailOffset } from "./hex-footprint";
import { siegeGatePositions } from "./siege";
import type { CardId, CombatUnitState, GameState, PlayerId } from "./state";

export function israFetchCandidates(state: GameState, playerId: PlayerId, excludeCardId?: CardId) {
  const player = state.players[playerId];
  if (!player) return [];
  return (["deck", "discard"] as const).flatMap((source) =>
    // The deck is listed sorted so the offer does not reveal the draw order.
    (source === "deck" ? [...player.deck].sort() : player.discard).flatMap((cardId) => {
      const kind = cardLibrary[cardId]?.kind;
      return cardId !== excludeCardId && (kind === "ability" || kind === "hero-specialty")
        ? [{ cardId, source }]
        : [];
    }),
  );
}

export function israRemovedUnits(state: GameState, playerId: PlayerId): CombatUnitState[] {
  const player = state.players[playerId];
  if (!state.combat || !player) return [];
  return Object.values(state.combat.units).filter((unit) => {
    if (unit.controllerId !== playerId || !unit.armyUnitId || unit.cloneOfUnitId ||
        unit.variant !== "few" || unit.damage < unit.maxHealth) return false;
    const armyCard = player.army.find((card) => card.id === unit.armyUnitId);
    const tier = unit.unitDefId ? coreUnitDefinitions[unit.unitDefId]?.tier : undefined;
    // "Except Pack" reads the side the unit was removed on (`variant`, checked
    // above). A Pack CARD that was flipped to its Few side and then destroyed
    // was a Few unit when it left the board, so it returns (as that Few side).
    // Requiring the army card itself to be Few (the old read) meant a Pack card
    // (the usual Necropolis army after Necromancy) could never return.
    // Neutral / Creature-Bank cards stay excluded.
    return (armyCard?.side === "few" || armyCard?.side === "pack") && (tier === "bronze" || tier === "silver");
  });
}

/**
 * Where a removed unit may return (user ruling 2026-09-30): its OLD space (the
 * head position it held when removed) when that space is free; otherwise the
 * nearest free spaces, i.e. every free anchor at the smallest board distance
 * from the old space that has any (orthogonal steps on the 4x5 grid, hex
 * distance on the hex board). A double-wide unit needs its whole footprint free.
 */
export function israReturnPositions(state: GameState, unit: CombatUnitState): number[] {
  const free = israEmptyPositions(state, unit);
  if (free.includes(unit.position)) return [unit.position];
  let nearest = Number.POSITIVE_INFINITY;
  for (const position of free) {
    nearest = Math.min(nearest, getBattlefieldDistance(unit.position, position));
  }
  return free.filter((position) => getBattlefieldDistance(unit.position, position) === nearest);
}

/** Removed units that have at least one space to return to. */
export function israReturnableUnits(state: GameState, playerId: PlayerId): CombatUnitState[] {
  return israRemovedUnits(state, playerId).filter((unit) => israReturnPositions(state, unit).length > 0);
}

export function israEmptyPositions(
  state: GameState,
  /** The returning unit: a double-wide one (hex board) needs its whole footprint empty. */
  returning?: CombatUnitState
): number[] {
  const combat = state.combat;
  if (!combat) return [];
  const occupied = new Set(Object.values(combat.units)
    .filter((unit) => unit.damage < unit.maxHealth).flatMap((unit) => unitCells(combat, unit)));
  const obstacles = new Set(combat.obstacles ?? []);
  const tokens = new Set((combat.battlefieldTokens ?? []).flatMap((token) => battlefieldTokenCells(token)));
  const walls = new Set(combat.siege?.walls ?? []);
  const gate = new Set(combat.siege ? siegeGatePositions(combat.siege) : []);
  const free = (position: number) => isBattlefieldPosition(position) && !occupied.has(position) &&
      !obstacles.has(position) && !tokens.has(position) && !walls.has(position) &&
      !gate.has(position);
  return getBattlefieldPositions(combatGeometry(combat)).filter(
    (position) => returning && unitTailOffset(combat, returning) !== 0
      ? (footprintAt(combat, returning, position) ?? []).length > 1 &&
        footprintAt(combat, returning, position)!.every(free)
      : free(position),
  );
}
