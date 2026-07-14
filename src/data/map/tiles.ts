import { coreTileDefinitions } from "./tile-defs";
import { expansionTileDefinitions } from "./expansion-tiles";
import type { TileContent, TileDefinition, TileGroup } from "./types";

/** Every known map tile across all boxed sets, keyed like the printed ids. */
export const allTileDefinitions: Record<string, TileDefinition> = {
  ...coreTileDefinitions,
  ...expansionTileDefinitions
};

/**
 * Every content set whose tiles exist in `allTileDefinitions`. Default games
 * mix the full catalog into the supply pools so no expansion / stretch-goal
 * tile is permanently locked out of random draws.
 */
export const ALL_TILE_CONTENT: TileContent[] = [
  "core_game",
  "rampart_expansion",
  "fortress_expansion",
  "inferno_expansion",
  "tower_expansion",
  "stronghold_expansion",
  "conflux_expansion",
  "cove_expansion",
  "regular_stretch_goals"
];

/**
 * Content sets that fill face-down supply pools when a game does not override
 * `tileContent`. Same as {@link ALL_TILE_CONTENT}: every published tile set.
 */
export const DEFAULT_TILE_CONTENT: TileContent[] = [...ALL_TILE_CONTENT];

/**
 * Tile ids of one supply pool for the given content sets. Every tile of that
 * group is eligible — including Random Town (C5 / #C3 / #C4); the engine
 * assigns the defending faction when the field is fought (`ensureRandomTownFaction`).
 * Sea and Subterranean tiles only come in through scenarios / custom maps that
 * place those groups; starting (Ⅰ) tiles are faction-fixed and never pool.
 */
export function tilePoolIds(group: TileGroup, content: readonly TileContent[]): string[] {
  return Object.values(allTileDefinitions)
    .filter((tile) => tile.group === group && content.includes(tile.content))
    .map((tile) => tile.id);
}
