import { cardLibrary } from "@/data/cards/library";
import { coreUnitDefinitions } from "@/data/factions/units";
import { BATTLEFIELD_CELL_COUNT, isBattlefieldPosition } from "./battlefield";
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
    return armyCard?.side === "few" && (tier === "bronze" || tier === "silver");
  });
}

export function israEmptyPositions(state: GameState): number[] {
  const combat = state.combat;
  if (!combat) return [];
  const occupied = new Set(Object.values(combat.units)
    .filter((unit) => unit.damage < unit.maxHealth).map((unit) => unit.position));
  const obstacles = new Set(combat.obstacles ?? []);
  const tokens = new Set((combat.battlefieldTokens ?? []).map((token) => token.position));
  const walls = new Set(combat.siege?.walls ?? []);
  return Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, position) => position).filter(
    (position) => isBattlefieldPosition(position) && !occupied.has(position) &&
      !obstacles.has(position) && !tokens.has(position) && !walls.has(position) &&
      combat.siege?.gatePosition !== position,
  );
}
