import { describe, expect, it } from "vitest";
import { scenarioDefinitions } from "@/data/map/scenarios";
import { validateCustomMapPlan } from "@/engine";
import { ERATHIA_SCENARIO_MAPS } from "./erathia-maps";

describe("rebuilt Erathia campaign maps", () => {
  it("ships six unique, fully valid authored geometries", () => {
    const maps = Object.entries(ERATHIA_SCENARIO_MAPS);
    expect(maps.map(([id]) => id)).toEqual([
      "homecoming",
      "guardian-angels",
      "griffin-cliff",
      "road-to-steadwick",
      "liberation-day",
      "throne-of-ash"
    ]);

    const geometrySignatures = new Set<string>();
    for (const [id, map] of maps) {
      const validated = validateCustomMapPlan(map.tiles, scenarioDefinitions.skirmish);
      expect(validated.problems, id).toEqual([]);
      expect(validated.accepted, id).toHaveLength(map.tiles.length);
      expect(map.tiles.filter((tile) => tile.group === "starting"), `${id} starts`).toHaveLength(
        id === "homecoming" || id === "guardian-angels" ? 2 : 3
      );
      expect(map.preset.roundLimit, `${id} round limit`).toBeGreaterThan(0);

      const signature = map.tiles
        .map((tile) => `${tile.row}:${tile.col}:${tile.group}`)
        .sort()
        .join("|");
      expect(geometrySignatures.has(signature), `${id} must not reuse another campaign layout`).toBe(false);
      geometrySignatures.add(signature);
    }
  });
});
