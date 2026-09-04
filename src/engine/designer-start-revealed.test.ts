/**
 * DESIGNER "START REVEALED" (`CustomMapTilePlan.revealAtSetup`).
 *
 * A NON-starting FACE-DOWN slot keeps its whole DRAW (random pool draw, secret
 * landmark filter, exact secret pin, or a "one of" list) but the drawn tile is
 * placed FACE-UP and materialized at setup, so every player sees it from turn 1.
 *
 * Every case asserts the OBSERVABLE outcome — the placed tile's `faceDown` and
 * whether its seven fields really exist in `adventure.fields` — never the flag
 * itself, and each carries a CONTROL on the SAME fixture with the flag absent.
 *
 * Mutation-checked: reverting `instantiateTile(..., !revealNow)` in
 * adventure-setup.ts back to the literal `true` fails every non-CONTROL case
 * here; dropping the map-registry sanitiser clause fails the two sanitiser
 * cases.
 */
import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  getTileFootprintSpaceIds,
  type CustomMapTilePlan,
  type GameState,
  type MapTileState
} from "./index";
import { allTileDefinitions } from "@/data/map/tiles";
import { sanitizeSharedMap } from "@/server/map-registry";

function build(tiles: CustomMapTilePlan[], seed = "start-revealed"): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    startingBonus: false,
    victoryMode: "conquest",
    customMap: tiles
  });
}

/** The same plans with the flag stripped — the legacy-map CONTROL. */
function stripped(tiles: CustomMapTilePlan[]): CustomMapTilePlan[] {
  return tiles.map((tile) => {
    const next = { ...tile };
    delete next.revealAtSetup;
    return next;
  });
}

function farTile(state: GameState): MapTileState {
  const tile = Object.values(state.adventure!.tiles).find((candidate) => candidate.group === "far");
  if (!tile) {
    throw new Error("no far tile was placed");
  }
  return tile;
}

/** How many of the tile's seven hexes carry a real field state. */
function materializedFields(state: GameState, tile: MapTileState): number {
  return getTileFootprintSpaceIds(tile).filter((spaceId) => Boolean(state.adventure!.fields[spaceId]))
    .length;
}

const TOWNS: CustomMapTilePlan[] = [
  { row: 0, col: 0, group: "starting", faceDown: false },
  { row: 2, col: 0, group: "starting", faceDown: false }
];

describe("designer 'Start revealed' — a face-down slot drawn, then shown", () => {
  it("a RANDOM face-down Far slot is placed face-up and materialized", () => {
    const tiles: CustomMapTilePlan[] = [
      ...TOWNS,
      { row: 4, col: 0, group: "far", faceDown: true, revealAtSetup: true }
    ];
    const state = build(tiles, "reveal-random");
    const tile = farTile(state);
    expect(tile.faceDown, "the drawn tile is revealed").toBe(false);
    expect(materializedFields(state, tile), "all seven fields exist").toBe(7);
    // The draw itself is untouched: still a real Far-pool tile, not a pin.
    expect(allTileDefinitions[tile.tileDefId]?.group).toBe("far");

    // CONTROL — the same fixture without the flag stays a secret back.
    const control = build(stripped(tiles), "reveal-random");
    const controlTile = farTile(control);
    expect(controlTile.faceDown, "CONTROL: still face-down").toBe(true);
    expect(materializedFields(control, controlTile), "CONTROL: no fields carved").toBe(0);
    expect(controlTile.tileDefId, "the same seed draws the same tile either way").toBe(
      tile.tileDefId
    );
  });

  it("a SECRET one-of Far slot is placed face-up and materialized", () => {
    const candidates = Object.values(allTileDefinitions)
      .filter((def) => def.group === "far")
      .slice(0, 3)
      .map((def) => def.id);
    expect(candidates.length, "the Far pool must offer a list").toBe(3);
    const tiles: CustomMapTilePlan[] = [
      ...TOWNS,
      {
        row: 4,
        col: 0,
        group: "far",
        faceDown: true,
        oneOfTileDefIds: candidates,
        revealAtSetup: true
      }
    ];
    const state = build(tiles, "reveal-one-of");
    const tile = farTile(state);
    expect(tile.faceDown).toBe(false);
    expect(materializedFields(state, tile)).toBe(7);
    expect(candidates, "the pick still comes from the authored list").toContain(tile.tileDefId);

    // CONTROL — without the flag the same pick stays hidden.
    const control = build(stripped(tiles), "reveal-one-of");
    expect(farTile(control).faceDown, "CONTROL: still face-down").toBe(true);
    expect(materializedFields(control, farTile(control))).toBe(0);
  });

  it("a revealed slot still applies its designed per-tile settlement plan", () => {
    const tiles: CustomMapTilePlan[] = [
      ...TOWNS,
      {
        row: 4,
        col: 0,
        group: "far",
        faceDown: true,
        secretFeatures: ["settlement"],
        revealAtSetup: true,
        settlement: { vp: 4 }
      }
    ];
    const state = build(tiles, "reveal-settlement");
    const tile = farTile(state);
    expect(tile.faceDown).toBe(false);
    const settlement = getTileFootprintSpaceIds(tile)
      .map((spaceId) => state.adventure!.fields[spaceId])
      .find((field) => field?.location === "settlement");
    expect(settlement, "the secret filter drew a settlement tile").toBeTruthy();
    expect(settlement!.settlementBonusVp, "the per-tile plan was stamped on the carved field").toBe(
      4
    );

    // CONTROL — face-down, so nothing is carved and nothing is stamped yet.
    const control = build(stripped(tiles), "reveal-settlement");
    expect(materializedFields(control, farTile(control))).toBe(0);
  });
});

describe("persistence sanitiser — 'Start revealed' is face-down non-starting only", () => {
  it("keeps the flag on a face-down supply slot", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        scenarioId: "skirmish",
        players: 2,
        tiles: [{ row: 9, col: 4, group: "near", faceDown: true, revealAtSetup: true }]
      },
      1
    );
    expect(record!.tiles[0].revealAtSetup).toBe(true);
  });

  it("strips it on a starting plan, on a face-up plan, and when it is not literally true", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        scenarioId: "skirmish",
        players: 2,
        tiles: [
          { row: 8, col: 2, group: "starting", faceDown: false, revealAtSetup: true },
          { row: 9, col: 4, group: "near", faceDown: false, tileDefId: "N1", revealAtSetup: true },
          { row: 6, col: 4, group: "near", faceDown: true, revealAtSetup: "yes" }
        ]
      },
      1
    );
    expect("revealAtSetup" in record!.tiles[0], "starting seats are always revealed").toBe(false);
    expect("revealAtSetup" in record!.tiles[1], "a face-up slot is already revealed").toBe(false);
    expect("revealAtSetup" in record!.tiles[2], "only a literal true survives").toBe(false);
  });
});
