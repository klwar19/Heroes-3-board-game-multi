import { coreTileDefinitions } from "./tile-defs";
import { expansionTileDefinitions } from "./expansion-tiles";
import type { TileContent, TileDefinition, TileGroup } from "./types";

/** Every known map tile across all boxed sets, keyed like the printed ids. */
export const allTileDefinitions: Record<string, TileDefinition> = {
  ...coreTileDefinitions,
  ...expansionTileDefinitions
};

/**
 * The content sets whose tiles enter the setup pools when a game does not
 * say otherwise: exactly the four boxed sets the original 41-tile pools
 * mixed, so default games play out the same as before the expansion data
 * landed.
 */
export const DEFAULT_TILE_CONTENT: TileContent[] = [
  "core_game",
  "rampart_expansion",
  "fortress_expansion",
  "inferno_expansion"
];

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
 * Tile ids of one supply pool. Random Town tiles stay out of the random
 * face-down pools (the printed reveal asks every player to roll for the
 * defending faction, which the lobby cannot stage) — the engine resolves the
 * fight and capture when a designed map places one. Sea and Subterranean tiles
 * only come in through scenarios that ask for them by group.
 */
export function tilePoolIds(group: TileGroup, content: readonly TileContent[]): string[] {
  return Object.values(allTileDefinitions)
    .filter(
      (tile) =>
        tile.group === group &&
        content.includes(tile.content) &&
        !tile.fields.some((field) => field.location === "random_town")
    )
    .map((tile) => tile.id);
}
