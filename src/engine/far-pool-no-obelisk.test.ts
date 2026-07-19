import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { createAdventureGameState } from "./index";

/**
 * House rule: the Ⅱ–Ⅲ Far tile pool never includes an Obelisk-bearing tile
 * (Factory &F1 is the known far+obelisk print). Obelisks live on Ⅳ–Ⅴ Near.
 */
describe("Far (Ⅱ–Ⅲ) pool — no Obelisk tiles", () => {
  it("excludes every Obelisk-bearing tile from adventure.farTilePool (CONTROL: &F1 is far+obelisk in data)", () => {
    // CONTROL: the data still has a far tile with an Obelisk — we strip it from the pool.
    const farWithObelisk = Object.values(allTileDefinitions).filter(
      (def) => def.group === "far" && def.fields.some((field) => field.location === "obelisk")
    );
    expect(farWithObelisk.some((def) => def.id === "&F1"), "Factory &F1 is the known far+obelisk tile").toBe(true);

    const state = createAdventureGameState({
      seed: "far-no-obelisk",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    const pool = state.adventure!.farTilePool ?? [];
    for (const tileDefId of pool) {
      const def = allTileDefinitions[tileDefId];
      expect(
        def?.fields.some((field) => field.location === "obelisk") ?? false,
        `${tileDefId} must not carry an Obelisk in the Far pool`
      ).toBe(false);
    }
    expect(pool.includes("&F1"), "&F1 is stripped from the Far supply pool").toBe(false);
  });
});
