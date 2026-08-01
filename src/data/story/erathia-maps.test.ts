import { describe, expect, it } from "vitest";
import { scenarioDefinitions } from "@/data/map/scenarios";
import { createAdventureGameState, validateCustomMapObjects, validateCustomMapPlan } from "@/engine";
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
      const starts = map.tiles.filter((tile) => tile.group === "starting").map(({ row, col }) => ({ row, col }));
      const objects = validateCustomMapObjects(map.tiles, map.preset.objects ?? [], starts);
      expect(objects.problems, `${id} standalone objects`).toEqual([]);
      expect(objects.accepted, `${id} accepted standalone objects`).toHaveLength(map.preset.objects?.length ?? 0);
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

  it("uses the campaign feature vocabulary and explicit VP/AI pressure on real buildable maps", () => {
    const maps = Object.entries(ERATHIA_SCENARIO_MAPS);
    const groups = new Set(maps.flatMap(([, map]) => map.tiles.map((tile) => tile.group)));
    const tokens = new Set(maps.flatMap(([, map]) => map.tiles.flatMap((tile) => tile.tokens?.map((token) => token.kind) ?? [])));
    const objects = new Set(maps.flatMap(([, map]) => map.preset.objects?.map((object) => object.kind) ?? []));
    expect([...groups]).toEqual(expect.arrayContaining(["sea", "subterranean"]));
    expect([...tokens]).toEqual(expect.arrayContaining(["monolith", "whirlpool", "gate", "oneway_entrance", "oneway_exit"]));
    expect(objects.has("keymaster_tent")).toBe(true);
    expect(objects.has("barrier")).toBe(true);

    for (const [id, map] of maps) {
      expect(map.preset.victoryPoints?.enabled, `${id} VP`).toBe(true);
      expect(map.preset.victoryPoints?.objectives?.length, `${id} VP objectives`).toBeGreaterThan(0);
      expect(map.preset.computerStartingBonus?.gold, `${id} computer war chest`).toBeGreaterThan(0);
      expect(map.preset.timedEvents?.some((event) => event.effect.kind === "story"), `${id} dialogue event`).toBe(true);

      const startCount = map.tiles.filter((tile) => tile.group === "starting").length;
      const players = [
        { id: "p1", name: "Catherine", factionId: "castle" as const },
        { id: "p2", name: "Computer 1", factionId: "dungeon" as const },
        ...(startCount === 3 ? [{ id: "p3", name: "Computer 2", factionId: "inferno" as const }] : [])
      ];
      const state = createAdventureGameState({
        seed: `campaign-build-${id}`,
        scenarioId: "skirmish",
        sessionMode: "single-player",
        controllers: {
          p1: { kind: "human" },
          p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
          ...(startCount === 3 ? { p3: { kind: "computer" as const, difficulty: "standard" as const, policyVersion: 1 as const } } : {})
        },
        players,
        customMap: map.tiles,
        customMapPreset: map.preset,
        rollFirstPlayer: false
      });
      const baseGold = map.preset.startingResources!.gold;
      expect(state.players.p1.resources.gold, `${id} human resources`).toBe(baseGold);
      expect(state.players.p2.resources.gold, `${id} computer resources`).toBe(
        baseGold + map.preset.computerStartingBonus!.gold
      );
    }
  });
});
