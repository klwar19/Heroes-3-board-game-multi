import { coreUnitDefinitions } from "@/data/factions/units";
import { hexDistance } from "../hex";
import type { GameState, MapFieldState } from "../state";

/** Captured income, not merely revealed tiles, advances the army plan. */
export function securedFarTileIds(state: GameState, playerId: string): Set<string> {
  return new Set(Object.values(state.adventure?.fields ?? {}).filter(field =>
    field.flagOwnerId === playerId && (field.location === "settlement" || field.location === "mine") &&
    field.tileInstanceId && state.adventure?.tiles[field.tileInstanceId]?.group === "far",
  ).map(field => field.tileInstanceId!));
}

export function secondFarFightNeedsSilver(state: GameState, playerId: string, field: MapFieldState): boolean {
  if ((field.difficulty ?? 0) < 3 || !field.tileInstanceId ||
      state.adventure?.tiles[field.tileInstanceId]?.group !== "far") return false;
  const secured = securedFarTileIds(state, playerId);
  if (secured.size > 0 && !secured.has(field.tileInstanceId)) return true;
  // The paid-Bronze opening already spent its Far III attempt when that fight
  // was LOST on another Far tile (not a pristine armored-guard scouting
  // withdrawal): the next Far III elsewhere also waits for Silver.
  return (state.computerMemory?.[playerId]?.failedFields ?? []).some(entry => {
    if (entry.scoutedRetreat) return false;
    const failed = state.adventure?.fields[entry.fieldId];
    return Boolean(failed && failed.tileInstanceId && failed.tileInstanceId !== field.tileInstanceId &&
      (failed.difficulty ?? 0) >= 3 && state.adventure?.tiles[failed.tileInstanceId]?.group === "far");
  });
}

/** Two-nearest-Far-tile ids per (adventure, player). Tile centers never move,
 * so a cached entry stays valid while its home field is still this player's;
 * hot callers (per-candidate scoring) would otherwise rescan every field and
 * re-sort every tile on each call. */
const openingSweepCache = new WeakMap<object, Map<string, { homeSpaceId: string; tileIds: string[] }>>();

function openingSweepTiles(state: GameState, playerId: string): { homeSpaceId: string; tileIds: string[] } | null {
  const adventure = state.adventure;
  if (!adventure) return null;
  let byPlayer = openingSweepCache.get(adventure);
  const cached = byPlayer?.get(playerId);
  if (cached && adventure.fields[cached.homeSpaceId]?.flagOwnerId === playerId) return cached;
  const homeField = Object.values(adventure.fields).find(candidate =>
    candidate.location === "town" && candidate.flagOwnerId === playerId && candidate.tileInstanceId &&
    adventure.tiles[candidate.tileInstanceId]?.group === "starting");
  const home = homeField?.tileInstanceId && adventure.tiles[homeField.tileInstanceId];
  if (!homeField || !home) return null;
  const origin = { row: home.centerRow, col: home.centerCol };
  const tileIds = Object.values(adventure.tiles).filter(tile => tile.group === "far" &&
      Boolean(tile.underground) === Boolean(home.underground))
    .sort((a, b) =>
      hexDistance(origin, { row: a.centerRow, col: a.centerCol }) -
      hexDistance(origin, { row: b.centerRow, col: b.centerCol }) || a.id.localeCompare(b.id))
    .slice(0, 2)
    .map(tile => tile.id);
  const entry = { homeSpaceId: homeField.spaceId, tileIds };
  if (!byPlayer) {
    byPlayer = new Map();
    openingSweepCache.set(adventure, byPlayer);
  }
  byPlayer.set(playerId, entry);
  return entry;
}

/** The two Far tiles nearest our starting town, selected from public tile
 * positions even before reveal. Revealing distant tiles cannot move the sweep. */
export function isOpeningFarSweepField(state: GameState, playerId: string, field: MapFieldState): boolean {
  if ((state.players[playerId]?.army ?? []).some(unit => unit.side !== "bank" &&
      ["gold", "azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier))) return false;
  if (!field.tileInstanceId) return false;
  const entry = openingSweepTiles(state, playerId);
  if (!entry || !entry.tileIds.includes(field.tileInstanceId)) return false;
  const tile = state.adventure?.tiles[field.tileInstanceId];
  return Boolean(tile && !tile.faceDown && !tile.awaitingRotation);
}

/** Only this opening's material mine joins premium guard preparation. */
export function isOpeningFarMaterialMine(state: GameState, playerId: string, field: MapFieldState): boolean {
  return field.location === "mine" && field.resource === "buildingMaterials" &&
    isOpeningFarSweepField(state, playerId, field);
}
