import { allTileDefinitions } from "@/data/map/tiles";
import type { FarTileType } from "./state";

/**
 * Ⅱ–Ⅲ (Far) tile LANDMARK CLASSIFICATION — the single home of "what kind of
 * tile is this?" for the Far band.
 *
 * This module is a LEAF (it imports tile data only) so both the far-tile flip
 * machinery in `adventure-reducer.ts` and the optional Ⅱ–Ⅲ TYPE CHOICE rule can
 * share ONE classifier. `adventure-reducer.ts` re-exports the three predicates
 * under their historical names, so every existing import site is unchanged.
 */

/**
 * A Ⅱ–Ⅲ tile TYPE a player may ask for when the optional "Ⅱ–Ⅲ tile type choice"
 * rule (`GameSetupOptions.farTileTypeChoice`) is on. Declared in `state.ts` (a
 * dependency-free type file) and re-exported here beside its classifier.
 */
export type { FarTileType };

/** Menu order — mines first (gold, crystal, stone), then the Settlement. */
export const FAR_TILE_TYPES: readonly FarTileType[] = [
  "gold",
  "valuables",
  "buildingMaterials",
  "settlement"
] as const;

/** Player-facing name of a Ⅱ–Ⅲ tile type (used in the choice labels). */
export const FAR_TILE_TYPE_LABELS: Record<FarTileType, string> = {
  gold: "GOLD mine",
  valuables: "CRYSTAL (valuables) mine",
  buildingMaterials: "STONE (ore) mine",
  settlement: "SETTLEMENT"
};

/**
 * Feature id used in the public `MAP_SECRET_FEATURE_FALLBACK` note when a
 * requested type has no tile left in the pool. `gold_mine` / `valuables_mine`
 * are the ids the older blind Ⅱ–Ⅲ choice already emitted — keep them stable.
 */
export const FAR_TILE_TYPE_FALLBACK_FEATURE: Record<FarTileType, string> = {
  gold: "gold_mine",
  valuables: "valuables_mine",
  buildingMaterials: "ore_mine",
  settlement: "settlement"
};

/** Whether `value` is one of the four Ⅱ–Ⅲ tile types (sanitiser guard). */
export function isFarTileType(value: unknown): value is FarTileType {
  return typeof value === "string" && (FAR_TILE_TYPES as readonly string[]).includes(value);
}

/** A Ⅱ–Ⅲ tile definition that carries a Settlement field. */
export function tileDefHasSettlement(tileDefId: string): boolean {
  return Boolean(
    allTileDefinitions[tileDefId]?.fields.some((field) => field.location === "settlement")
  );
}

/**
 * A Ⅱ–Ⅲ tile definition that carries an ORE Mine — a `location: "mine"` field
 * whose resource is `buildingMaterials` (ore). Gold Mines and Valuables Mines do
 * NOT count: the one-time "reroll if you get a Mine tile" guarantee applies only
 * to ore Mines, never a gold or valuables Mine.
 */
export function tileDefHasOreMine(tileDefId: string): boolean {
  return Boolean(
    allTileDefinitions[tileDefId]?.fields.some(
      (field) => field.location === "mine" && field.resource === "buildingMaterials"
    )
  );
}

/** A Ⅱ–Ⅲ tile definition that carries a Mine of the given resource. */
export function tileDefHasResourceMine(tileDefId: string, resource: "gold" | "valuables"): boolean {
  return Boolean(
    allTileDefinitions[tileDefId]?.fields.some(
      (field) => field.location === "mine" && field.resource === resource
    )
  );
}

/**
 * Whether a tile definition matches a Ⅱ–Ⅲ tile TYPE. Deliberately delegates to
 * the three predicates above rather than re-reading the tile fields, so the type
 * menu can never classify a tile differently from the Ore-Mine reroll or the
 * Settlement guarantee.
 */
export function farTileTypeMatches(tileDefId: string, type: FarTileType): boolean {
  switch (type) {
    case "settlement":
      return tileDefHasSettlement(tileDefId);
    case "buildingMaterials":
      return tileDefHasOreMine(tileDefId);
    default:
      return tileDefHasResourceMine(tileDefId, type);
  }
}

/**
 * The subset of `allowed` types for which the given pool still holds at least
 * one tile, in {@link FAR_TILE_TYPES} order. A type with nothing left is never
 * offered — the menu must not sell a draw that would silently fall back.
 */
export function availableFarTileTypes(
  pool: readonly string[],
  allowed: readonly FarTileType[]
): FarTileType[] {
  const allowedSet = new Set(allowed);
  return FAR_TILE_TYPES.filter(
    (type) => allowedSet.has(type) && pool.some((tileDefId) => farTileTypeMatches(tileDefId, type))
  );
}
