import { describe, expect, it } from "vitest";
import { createAdventureGameState, isTileRotationConnected, type MapTileState } from "@/engine";

/**
 * Tile-rotation connectivity must NOT treat a teleport gate as a blocked field.
 * A tile linked into the map by a Subterranean Gate (or hosting/adjacent to a
 * Monolith / Teleport Gate / one-way / Whirlpool) reaches the rest of the map
 * THROUGH the teleport network, not by a walked edge — so no rotation can ever
 * report it "sealed off". The user's bug: rotating a tile toward a teleport gate
 * was rejected with "Border lines seal the tile off — keep rotating."
 */
describe("tile rotation connectivity — a teleport gate is a valid connection", () => {
  it("a gate-linked tile is connected in EVERY rotation, even with all edges sealed (CONTROL: no gate = sealed off)", () => {
    const state = createAdventureGameState({ seed: "rot-gate", difficulty: "normal", rollFirstPlayer: false });
    const adventure = state.adventure!;
    const tile = Object.values(adventure.tiles)[0] as MapTileState;

    // Seal every outer edge with a designer border → no WALKED connection exists.
    tile.extraBorders = [0, 1, 2, 3, 4, 5];

    // CONTROL: with no gate, the fully-sealed tile is genuinely disconnected.
    expect(isTileRotationConnected(state, tile, tile.rotation)).toBe(false);

    // A Subterranean Gate plan naming the tile links it via the teleport network,
    // so it is connected in EVERY rotation (fails if the gate-plan branch is gone).
    adventure.gatePlans = [{ surfaceTileId: tile.id, undergroundTileId: "cavern", designed: true }];
    for (let rotation = 0; rotation < 6; rotation += 1) {
      expect(isTileRotationConnected(state, tile, rotation), `rotation ${rotation}`).toBe(true);
    }

    // The cavern half of the SAME plan is likewise always connected.
    adventure.gatePlans = [{ surfaceTileId: "surface", undergroundTileId: tile.id, designed: true }];
    expect(isTileRotationConnected(state, tile, tile.rotation)).toBe(true);
  });

  it("a teleport connector carved on the tile's OWN hex connects it (CONTROL: a plain field does not)", () => {
    const state = createAdventureGameState({ seed: "rot-gate-own", difficulty: "normal", rollFirstPlayer: false });
    const adventure = state.adventure!;
    const tile = Object.values(adventure.tiles).find((candidate) =>
      Object.values(adventure.fields).some((field) => field.tileInstanceId === candidate.id)
    ) as MapTileState;
    tile.extraBorders = [0, 1, 2, 3, 4, 5]; // seal every walked edge

    const ownField = Object.values(adventure.fields).find(
      (field) => field.tileInstanceId === tile.id && field.slot > 0
    )!;
    const original = ownField.location;

    // CONTROL: a plain own field leaves the sealed tile disconnected…
    ownField.location = "empty_field";
    expect(isTileRotationConnected(state, tile, tile.rotation)).toBe(false);

    // …but a Teleport Gate carved on the tile's own hex connects it via the network.
    ownField.location = "gate";
    expect(isTileRotationConnected(state, tile, tile.rotation)).toBe(true);
    ownField.location = original;
  });
});
