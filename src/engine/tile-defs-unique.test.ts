/**
 * THE PHYSICAL BOARD HAS EXACTLY ONE COPY OF EVERY MAP TILE, so a tile
 * definition must never sit on the map twice — nor sit on the map while still
 * being drawable from a live supply pool.
 *
 * Reported bug (live play, screenshot of two C1 tiles on one map): "Tile C1
 * somehow can repeat, which should not happen." Root cause: a map-designer
 * "one of these tiles" slot resolved its RANDOM pick independently per slot, so
 * two slots sharing one candidate list (the natural way to author a symmetric
 * map) could both land on the same tile — and, because a resolved pick is then
 * treated exactly like an exact pin, nothing downstream caught it.
 *
 * Rule 1a: this file leads with the INVARIANT (`expectUniqueTileDefs`) and every
 * seam test asserts it, instead of N one-off equality checks.
 */
import { describe, expect, it } from "vitest";
import { createAdventureGameState, shuffleCards } from "./index";
import { allTileDefinitions, DEFAULT_TILE_CONTENT, tilePoolIds } from "@/data/map/tiles";
import type { CustomMapTilePlan, GameState } from "./state";

/**
 * The map-wide invariant: every PLACED tile def id is unique, no live supply
 * pool holds a def that is already placed (it would be dealt out a second
 * time), and no pool holds the same def twice.
 */
export function expectUniqueTileDefs(state: GameState, tag = "map"): void {
  const adventure = state.adventure!;
  const counts = new Map<string, number>();
  for (const tile of Object.values(adventure.tiles)) {
    counts.set(tile.tileDefId, (counts.get(tile.tileDefId) ?? 0) + 1);
  }
  const placedTwice = [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
  expect(placedTwice, `${tag}: no tile definition may be placed twice`).toEqual([]);

  const placed = new Set(counts.keys());
  for (const [name, pool] of [
    ["far", adventure.farTilePool ?? []],
    ["near", adventure.nearTilePool ?? []],
    ["subterranean", adventure.subterraneanTilePool ?? []]
  ] as const) {
    const alsoPlaced = pool.filter((id) => placed.has(id));
    expect(alsoPlaced, `${tag}: ${name} supply pool must not still hold a placed tile`).toEqual([]);
    const poolDupes = pool.filter((id, index) => pool.indexOf(id) !== index);
    expect(poolDupes, `${tag}: ${name} supply pool must not hold a tile twice`).toEqual([]);
  }
}

const CENTER_POOL = tilePoolIds("center", DEFAULT_TILE_CONTENT);

/** Two seats plus center slots on a 4-row spacing (no footprint overlap). */
function centerSlotMap(slots: Partial<CustomMapTilePlan>[]): CustomMapTilePlan[] {
  return [
    { row: 0, col: 0, group: "starting", faceDown: false },
    { row: 0, col: 6, group: "starting", faceDown: false },
    ...slots.map((slot, index) => ({
      row: 4 + index * 4,
      col: 0,
      group: "center" as const,
      faceDown: false,
      ...slot
    }))
  ];
}

function build(tiles: CustomMapTilePlan[], seed: string): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest",
    customMap: tiles
  });
}

function placedCenters(state: GameState): string[] {
  return Object.values(state.adventure!.tiles)
    .filter((tile) => tile.group === "center")
    .map((tile) => tile.tileDefId);
}

describe("a map tile definition can never be placed twice", () => {
  it("CONTROL: the data really does have one C1 center tile that two slots could both want", () => {
    expect(allTileDefinitions.C1?.group).toBe("center");
    expect(CENTER_POOL).toContain("C1");
    expect(CENTER_POOL).toContain("C2");
  });

  it("REPRO: two face-up slots sharing ONE “one of these tiles” list place DIFFERENT tiles", () => {
    // Pre-fix this duplicated on most seeds (each slot resolved its own pick
    // from the same two-tile list), which is the reported two-C1 board.
    for (let seed = 0; seed < 20; seed += 1) {
      const list = ["C1", "C2"];
      const state = build(
        centerSlotMap([{ oneOfTileDefIds: list }, { oneOfTileDefIds: list }]),
        `oneof-faceup-${seed}`
      );
      const centers = placedCenters(state);
      expect(centers, `seed ${seed}: both slots placed`).toHaveLength(2);
      // Each slot still honours the list, and the two are different tiles.
      for (const id of centers) {
        expect(list, `seed ${seed}: ${id} came from the list`).toContain(id);
      }
      expect(new Set(centers).size, `seed ${seed}: ${centers.join(" + ")}`).toBe(2);
      expectUniqueTileDefs(state, `oneof-faceup-${seed}`);
    }
  });

  it("REPRO: three FACE-DOWN slots sharing one three-tile list resolve to three different tiles", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const list = ["C1", "C2", "C3"];
      const state = build(
        centerSlotMap([
          { faceDown: true, oneOfTileDefIds: list },
          { faceDown: true, oneOfTileDefIds: list },
          { faceDown: true, oneOfTileDefIds: list }
        ]),
        `oneof-facedown-${seed}`
      );
      const centers = placedCenters(state);
      expect(centers, `seed ${seed}`).toHaveLength(3);
      expect(new Set(centers), `seed ${seed}: ${centers.join(" + ")}`).toEqual(new Set(list));
      expectUniqueTileDefs(state, `oneof-facedown-${seed}`);
    }
  });

  it("a “one of” pick skips a tile another slot EXPLICITLY pins", () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const state = build(
        centerSlotMap([{ tileDefId: "C1" }, { oneOfTileDefIds: ["C1", "C2"] }]),
        `pin-vs-oneof-${seed}`
      );
      const centers = placedCenters(state);
      expect(centers, `seed ${seed}`).toHaveLength(2);
      expect(centers, `seed ${seed}: the pinned tile is honoured`).toContain("C1");
      // The list slot must take its OTHER candidate, never a second C1.
      expect(centers.filter((id) => id === "C1"), `seed ${seed}`).toHaveLength(1);
      expect(centers, `seed ${seed}`).toContain("C2");
      expectUniqueTileDefs(state, `pin-vs-oneof-${seed}`);
    }
  });

  it("graceful exhaustion: a list whose every candidate is taken draws a random tile of its own group (never a duplicate, never a hole)", () => {
    const state = build(
      centerSlotMap([{ oneOfTileDefIds: ["C1"] }, { oneOfTileDefIds: ["C1"] }]),
      "oneof-exhausted"
    );
    const centers = placedCenters(state);
    // Both slots still SHOW a tile — the second one just is not C1.
    expect(centers).toHaveLength(2);
    expect(centers.filter((id) => id === "C1")).toHaveLength(1);
    const substitute = centers.find((id) => id !== "C1")!;
    expect(allTileDefinitions[substitute]?.group, `${substitute} is a real center tile`).toBe("center");
    expectUniqueTileDefs(state, "oneof-exhausted");
    // The table is told, rather than silently getting a different map.
    expect(
      state.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && /one of these tiles/i.test(event.message ?? "")
      ),
      "an EVENT_NOTE explains the substitution"
    ).toBe(true);
  });

  it("CONTROL: a lone mixed Grail/Utopia list draws the first GRAIL-printing candidate of its seeded shuffle (the balanced-Ⅶ preference), still unique", () => {
    // SUPERSEDED premise (bf74c63b, Random-Ⅶ redesign — USER RULE 2026-08-19):
    // this used to pin the raw shuffle's first entry, but a one-of list mixing
    // Grail-printing (C2/C4) and Utopia-printing (C1/C3) candidates is now a
    // random Ⅶ slot: a LONE slot is guaranteed the Grail by the balanced pool,
    // and the pick prefers a candidate whose printed Ⅶ objective IS that
    // assignment so art and field agree. The de-duplication itself still never
    // reshuffles — the preference is a stable partition of the SAME seeded
    // shuffle order.
    const seed = "oneof-single-slot";
    const list = ["C1", "C2", "C3", "C4"];
    const state = build(centerSlotMap([{ oneOfTileDefIds: list }]), seed);
    const ordered = shuffleCards(list, `${seed}#tilechoice#4#0`);
    const printsGrail = (id: string) =>
      Boolean(
        allTileDefinitions[id]?.fields.some(
          (fieldDef) => fieldDef.difficulty === 7 && fieldDef.location === "grail"
        )
      );
    const expected = ordered.find(printsGrail);
    expect(placedCenters(state)).toEqual([expected]);
    // Discriminating on THIS seed: the raw shuffle leads with a Utopia-printing
    // tile, so reverting the balanced-Ⅶ preference (falling back to plain
    // shuffle order) fails this test.
    expect(
      printsGrail(ordered[0]!),
      `seed ${seed} must lead with a Utopia-printing tile to discriminate`
    ).toBe(false);
    expect(placedCenters(state)).not.toEqual([ordered[0]]);
    expectUniqueTileDefs(state, seed);
  });

  it("CONTROL (deliberate exception): two slots that EXPLICITLY pin the same tile still both place it", () => {
    // A designer foot-gun the plan validator has always allowed. Only RANDOM
    // picks are de-duplicated — rewriting an explicit pin would change existing
    // designed maps.
    const state = build(centerSlotMap([{ tileDefId: "C1" }, { tileDefId: "C1" }]), "double-pin");
    expect(placedCenters(state)).toEqual(["C1", "C1"]);
  });

  it("the standard scenario layout holds the invariant across seeds, seat counts and victory modes", () => {
    for (let players = 1; players <= 6; players += 1) {
      for (let seed = 0; seed < 6; seed += 1) {
        for (const victoryMode of ["conquest", "grail", "dragon-hunt", "dragon-conqueror"] as const) {
          const tag = `${players}p/seed${seed}/${victoryMode}`;
          const state = createAdventureGameState({
            seed: `unique-tiles-${tag}`,
            difficulty: "normal",
            rollFirstPlayer: false,
            playerCount: players,
            victoryMode
          });
          expectUniqueTileDefs(state, tag);
        }
      }
    }
  });

  it("a designed map mixing pins, secret landmarks, bands and random slots holds the invariant", () => {
    for (let seed = 0; seed < 6; seed += 1) {
      for (const victoryMode of ["conquest", "grail", "dragon-hunt"] as const) {
        const tiles: CustomMapTilePlan[] = [
          { row: 0, col: 0, group: "starting", faceDown: false },
          { row: 6, col: 4, group: "starting", faceDown: false },
          { row: 3, col: 2, group: "far", faceDown: true },
          { row: 3, col: 5, group: "far", faceDown: true, secretFeature: "settlement" },
          { row: 9, col: 2, group: "near", faceDown: true },
          { row: 9, col: 5, group: "near", faceDown: true, secretFeature: "obelisk" },
          { row: 12, col: 2, group: "center", faceDown: true },
          { row: 12, col: 5, group: "center", faceDown: false, tileDefId: "C2" },
          { row: 15, col: 2, group: "subterranean", faceDown: true },
          { row: 15, col: 5, group: "sea", faceDown: true, seaBand: "iv-v" }
        ];
        expectUniqueTileDefs(build(tiles, `designed-mix-${seed}-${victoryMode}`), `${seed}/${victoryMode}`);
      }
    }
  });

  it("center slots beyond the printed supply place fewer tiles instead of repeating one", () => {
    // Graceful exhaustion of an ordinary random pool: pops only, never a wrap.
    const state = build(
      centerSlotMap(Array.from({ length: CENTER_POOL.length + 4 }, () => ({ faceDown: true }))),
      "center-pool-exhaustion"
    );
    const centers = placedCenters(state);
    expect(centers.length).toBeLessThanOrEqual(CENTER_POOL.length);
    expectUniqueTileDefs(state, "center-pool-exhaustion");
  });
});
