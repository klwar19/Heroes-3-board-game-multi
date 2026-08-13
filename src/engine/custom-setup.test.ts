import { describe, expect, it } from "vitest";
import {
  applyCustomMapTimedEvents,
  isFieldGuarded,
  materializeTileFields,
  processPendingVisit,
  startAdventureRound
} from "./adventure";
import { pumpAdventureQueues, resolveVisitStep } from "./adventure-reducer";
import { createAdventureGameState, validateCustomMapPlan } from "./adventure-setup";
import { getScenario } from "./adventure-setup";
import { applyAction, createAdventureLobbyState } from "./index";
import { getLegalActions } from "./legal-actions";
import { getPlayerView } from "./player-view";
import { allTileDefinitions } from "@/data/map/tiles";
import { STORY_SCENE_IDS } from "@/data/story/scenes";
import { coreUnitDefinitions } from "@/data/factions/units";

describe("custom starting army", () => {
  it("gives each player their own faction's unit of every picked level", () => {
    const state = createAdventureGameState({
      seed: "level-army",
      startingUnits: [
        { level: 2, side: "pack" },
        { level: 5, side: "few" },
        { level: 7, side: "few" }
      ]
    });

    // Default seats: p1 Castle, p2 Necropolis — same levels, own units.
    expect(state.players.p1.army.map((unit) => `${unit.unitDefId}:${unit.side}`)).toEqual([
      "castle.marksmen:pack",
      "castle.zealots:few",
      "castle.archangels:few"
    ]);
    expect(state.players.p2.army.map((unit) => `${unit.unitDefId}:${unit.side}`)).toEqual([
      "necropolis.zombies:pack",
      "necropolis.liches:few",
      "necropolis.ghost_dragons:few"
    ]);
  });

  it("randomizes only MGQ beginning-of-game bronze/silver slots without replacement", () => {
    const make = (seed: string) => createAdventureGameState({
      seed,
      players: [
        { id: "p1", name: "Luka", factionId: "mgq", heroDefId: "luka" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      startingUnits: [
        { level: 1, side: "few" },
        { level: 2, side: "few" },
        { level: 4, side: "few" }
      ]
    });

    const first = make("mgq-random-start-a");
    const firstIds = first.players.p1.army.map((unit) => unit.unitDefId);
    expect(firstIds).toHaveLength(3);
    expect(new Set(firstIds).size).toBe(3);
    expect(firstIds.slice(0, 2).every((id) => coreUnitDefinitions[id]?.tier === "bronze")).toBe(true);
    expect(coreUnitDefinitions[firstIds[2]!]?.tier).toBe("silver");
    expect(make("mgq-random-start-a").players.p1.army.map((unit) => unit.unitDefId)).toEqual(firstIds);

    const outcomes = new Set<string>();
    for (let index = 0; index < 24; index += 1) {
      outcomes.add(make(`mgq-random-start-${index}`).players.p1.army.map((unit) => unit.unitDefId).join("|"));
    }
    expect(outcomes.size).toBeGreaterThan(1);

    // CONTROL: Castle keeps the fixed level mapping.
    expect(first.players.p2.army.map((unit) => unit.unitDefId)).toEqual([
      "castle.halberdiers",
      "castle.marksmen",
      "castle.crusaders"
    ]);
  });

  it("treats an empty starting-units list as an empty army", () => {
    const state = createAdventureGameState({ seed: "empty-army", startingUnits: [] });
    expect(state.players.p1.army).toHaveLength(0);
    expect(state.players.p2.army).toHaveLength(0);
  });

  it("expands tier slots into each player's own faction units, cycling repeated tiers", () => {
    const state = createAdventureGameState({
      seed: "custom-army",
      startingUnits: [
        { tier: "bronze", side: "pack" },
        { tier: "silver", side: "few" },
        { tier: "silver", side: "few" },
        { tier: "gold", side: "few" }
      ]
    });

    // Default seats: p1 Castle, p2 Necropolis — same tier slots, own units.
    expect(state.players.p1.army.map((unit) => `${unit.unitDefId}:${unit.side}`)).toEqual([
      "castle.halberdiers:pack",
      "castle.crusaders:few",
      "castle.zealots:few",
      "castle.champions:few"
    ]);
    const p2Army = state.players.p2.army;
    expect(p2Army).toHaveLength(4);
    expect(p2Army.every((unit) => unit.unitDefId.startsWith("necropolis."))).toBe(true);
    expect(p2Army[0].side).toBe("pack");
  });

  it("still honors legacy exact-unit entries from old lobbies", () => {
    const state = createAdventureGameState({
      seed: "legacy-army",
      startingUnits: [
        { unitDefId: "castle.griffins", side: "pack" },
        { unitDefId: "necropolis.skeletons", side: "few" }
      ]
    });

    for (const playerId of state.turnOrder) {
      const army = state.players[playerId].army;
      expect(army.map((unit) => `${unit.unitDefId}:${unit.side}`)).toEqual([
        "castle.griffins:pack",
        "necropolis.skeletons:few"
      ]);
    }
  });

  it("falls back to the tier default when no custom army is set", () => {
    const state = createAdventureGameState({ seed: "tier-army" });
    const army = state.players.p1.army;
    expect(army.length).toBeGreaterThan(0);
    expect(army.every((unit) => unit.side === "few")).toBe(true);
  });
});

describe("map designer", () => {
  it("places designed tiles: face-up chosen tiles revealed, face-down ones random from their pool", () => {
    const state = createAdventureGameState({
      seed: "designed-map",
      customMap: [
        // Both slots are gapless neighbours of seat 0 (8,2), so they interlock
        // with the board with no hole.
        { row: 9, col: 4, group: "near", faceDown: true },
        { row: 11, col: 2, group: "far", faceDown: false, tileDefId: "F1", rotation: 2 }
      ]
    });

    const tiles = Object.values(state.adventure!.tiles);
    // Two starting tiles (two default players) + the two designed tiles.
    expect(tiles).toHaveLength(4);

    const faceUp = tiles.find((tile) => tile.tileDefId === "F1");
    expect(faceUp).toBeDefined();
    expect(faceUp!.faceDown).toBe(false);
    expect(faceUp!.rotation).toBe(2);
    // Its 7 fields are materialized from the start.
    expect(
      Object.values(state.adventure!.fields).filter((field) => field.tileInstanceId === faceUp!.id)
    ).toHaveLength(7);

    const faceDown = tiles.find((tile) => tile.faceDown);
    expect(faceDown).toBeDefined();
    expect(faceDown!.backLabel).toBe("Ⅳ–Ⅴ");
    // Random pool draw, never the hand-picked face-up tile.
    expect(faceDown!.tileDefId).not.toBe("F1");
  });

  it("places a face-down pin as a secret predetermined tile (designer-only until discovery)", () => {
    // A face-down slot with tileDefId keeps that exact tile face-down — e.g. the
    // designer pins N3 (obelisk + valuables mine) so discovery always yields it,
    // while players only ever see the Ⅳ–Ⅴ back until then.
    const state = createAdventureGameState({
      seed: "designed-secret-pin",
      customMap: [
        { row: 9, col: 4, group: "near", faceDown: true, tileDefId: "N3", rotation: 1 },
        // CONTROL: a pure-random far slot still draws; the pin must not leak
        // into the face-up path or materialize fields early.
        { row: 11, col: 2, group: "far", faceDown: true }
      ]
    });

    const secret = Object.values(state.adventure!.tiles).find(
      (tile) => tile.faceDown && tile.group === "near"
    );
    expect(secret, "secret near tile was placed").toBeDefined();
    expect(secret!.tileDefId).toBe("N3");
    expect(secret!.faceDown).toBe(true);
    expect(secret!.rotation).toBe(1);
    // Still face-down: no fields until discovery.
    expect(
      Object.values(state.adventure!.fields).filter((field) => field.tileInstanceId === secret!.id)
    ).toHaveLength(0);
    // The pinned tile carries the designed landmarks (mutation control: wrong
    // id would not both have an obelisk and a valuables mine).
    const def = allTileDefinitions["N3"];
    expect(def.fields.some((field) => field.location === "obelisk")).toBe(true);
    expect(
      def.fields.some((field) => field.location === "mine" && field.resource === "valuables")
    ).toBe(true);

    // Player views must not leak the secret id — only the band/back shows.
    const view = getPlayerView(state, "p1");
    const viewed = view.adventure!.tiles[secret!.id];
    expect(viewed.faceDown).toBe(true);
    expect(viewed.tileDefId).toBe("hidden");
    expect(viewed.backLabel).toBe("Ⅳ–Ⅴ");
  });

  it("removes a face-down pin from the random pool so it is never also drawn elsewhere", () => {
    // Two face-down near slots: one pins N3, the other draws random — the random
    // draw must never be N3 (the pin already consumed it).
    const state = createAdventureGameState({
      seed: "designed-secret-pool",
      customMap: [
        { row: 9, col: 4, group: "near", faceDown: true, tileDefId: "N3" },
        { row: 11, col: 2, group: "near", faceDown: true }
      ]
    });
    const nearTiles = Object.values(state.adventure!.tiles).filter((tile) => tile.group === "near");
    expect(nearTiles).toHaveLength(2);
    const pinned = nearTiles.find((tile) => tile.tileDefId === "N3");
    const random = nearTiles.find((tile) => tile.tileDefId !== "N3");
    expect(pinned, "pinned N3 present").toBeDefined();
    expect(pinned!.faceDown).toBe(true);
    expect(random, "random near slot present").toBeDefined();
    expect(random!.tileDefId).not.toBe("N3");
  });

  it("materializes the secret pin's landmarks when the tile is revealed", () => {
    // Discovery path: fields come from the pinned tileDefId, so an N3 pin
    // always yields its obelisk + valuables mine — never a random Near draw.
    const state = createAdventureGameState({
      seed: "designed-secret-reveal",
      customMap: [{ row: 9, col: 4, group: "near", faceDown: true, tileDefId: "N3" }]
    });
    const secret = Object.values(state.adventure!.tiles).find((tile) => tile.tileDefId === "N3")!;
    expect(secret.faceDown).toBe(true);

    secret.faceDown = false;
    materializeTileFields(state.adventure!, secret);

    const fields = Object.values(state.adventure!.fields).filter(
      (field) => field.tileInstanceId === secret.id
    );
    expect(fields).toHaveLength(7);
    expect(fields.some((field) => field.location === "obelisk")).toBe(true);
    expect(
      fields.some((field) => field.location === "mine" && field.resource === "valuables")
    ).toBe(true);
    // CONTROL: a wrong pin (e.g. if setup ignored tileDefId and drew randomly)
    // would only rarely include both; asserting both landmarks pins the id.
  });

  it("draws a face-down underground slot only from its own guard band (Ⅳ–Ⅴ vs the Ⅵ–Ⅶ boss tier)", () => {
    // The designer offers Underground Ⅳ–Ⅴ and Underground Ⅵ–Ⅶ as two palette
    // entries (mirroring the two sea bands). A face-down underground slot must
    // draw only from the band its plan carries — the Ⅵ–Ⅶ band is exactly the
    // three VII-centre boss tiles (U7 / #C2 Cyclops Stockpile, #C3 Random Town).
    const bossIds = new Set(["U7", "#C2", "#C3"]);
    const drawUnderground = (subBand: "iv-v" | "vi-vii") => {
      const state = createAdventureGameState({
        seed: `designed-underground-${subBand}`,
        customMap: [{ row: 9, col: 4, group: "subterranean", faceDown: true, subBand }]
      });
      const tile = Object.values(state.adventure!.tiles).find((candidate) => candidate.group === "subterranean");
      expect(tile, "an underground tile was placed").toBeDefined();
      return tile!;
    };

    const boss = drawUnderground("vi-vii");
    expect(bossIds.has(boss.tileDefId!)).toBe(true);
    expect(boss.backLabel).toBe("Ⅵ–Ⅶ");

    // Control: the regular band never draws one of the three boss tiles, and a
    // Ⅳ–Ⅴ draw reports the regular back numeral — so the band genuinely gates
    // the pool, not just the label.
    const regular = drawUnderground("iv-v");
    expect(bossIds.has(regular.tileDefId!)).toBe(false);
    expect(regular.backLabel).toBe("Ⅳ–Ⅴ");
  });

  it("forces the win-condition objective onto a face-down Center tile, not a random draw", () => {
    // A designed map's face-down Center slot must guarantee the victory mode's
    // objective tile, exactly like the scenario layout does.
    const centerFields = (victoryMode: "grail" | "dragon-hunt") => {
      const state = createAdventureGameState({
        seed: "designed-objective",
        victoryMode,
        customMap: [{ row: 9, col: 4, group: "center", faceDown: true }]
      });
      const centerTile = Object.values(state.adventure!.tiles).find((tile) => tile.group === "center");
      expect(centerTile).toBeDefined();
      return allTileDefinitions[centerTile!.tileDefId]?.fields ?? [];
    };

    expect(centerFields("grail").some((field) => field.location === "grail")).toBe(true);
    expect(centerFields("dragon-hunt").some((field) => field.location === "dragon_utopia")).toBe(true);
    // CONTROL: the seed is identical, so without the win-condition forcing both
    // modes would pop the SAME random Center tile — and one tile cannot be both
    // a Grail and a Dragon Utopia, so dropping the fix fails one assertion above.
  });

  it("secretFeature draws a random face-down tile that carries that landmark", () => {
    // Designer picks "gold mine", not a specific tile id — at setup any
    // remaining Near tile with a gold mine may land on the slot (still face-down).
    const state = createAdventureGameState({
      seed: "feature-secret-gold",
      customMap: [
        {
          row: 9,
          col: 4,
          group: "near",
          faceDown: true,
          secretFeature: "gold_mine"
        }
      ]
    });
    const near = Object.values(state.adventure!.tiles).find(
      (tile) => tile.centerRow === 9 && tile.centerCol === 4
    );
    expect(near, "feature-secret slot placed").toBeDefined();
    expect(near!.faceDown).toBe(true);
    expect(near!.tileDefId).toBeTruthy();
    const def = allTileDefinitions[near!.tileDefId];
    expect(def?.group).toBe("near");
    expect(
      def?.fields.some((field) => field.location === "mine" && field.resource === "gold"),
      `expected a gold mine on ${near!.tileDefId}, fields=${JSON.stringify(def?.fields)}`
    ).toBe(true);

    // CONTROL: an exact pin still wins over the feature when both are set.
    const exactWins = createAdventureGameState({
      seed: "feature-secret-exact-wins",
      customMap: [
        {
          row: 9,
          col: 4,
          group: "near",
          faceDown: true,
          tileDefId: "N3",
          secretFeature: "gold_mine"
        }
      ]
    });
    const exactTile = Object.values(exactWins.adventure!.tiles).find(
      (tile) => tile.centerRow === 9 && tile.centerCol === 4
    );
    expect(exactTile?.tileDefId).toBe("N3");
  });

  it("secretFeatures draws a face-down tile matching ANY allowed landmark (valuables OR gold)", () => {
    const allowed = ["gold_mine", "valuables_mine"] as const;
    // Across several seeds the slot must ALWAYS land on a tile carrying gold OR
    // valuables — never stone or a settlement. (A single-feature draw is the
    // strict subset this generalises; the CONTROL is the exact-pin test above.)
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const state = createAdventureGameState({
        seed: `feature-multi-${seed}`,
        customMap: [{ row: 9, col: 4, group: "near", faceDown: true, secretFeatures: [...allowed] }]
      });
      const near = Object.values(state.adventure!.tiles).find(
        (tile) => tile.centerRow === 9 && tile.centerCol === 4
      )!;
      const def = allTileDefinitions[near.tileDefId];
      const hasGold = def?.fields.some((f) => f.location === "mine" && f.resource === "gold");
      const hasValuables = def?.fields.some((f) => f.location === "mine" && f.resource === "valuables");
      expect(
        hasGold || hasValuables,
        `tile ${near.tileDefId} should carry a gold or valuables mine (fields=${JSON.stringify(def?.fields)})`
      ).toBe(true);
    }
  });

  it("secretFeature obelisk / settlement resolve from the matching pool", () => {
    const make = (feature: "obelisk" | "settlement" | "any_mine", seed: string) => {
      // Settlements are rare on Near tiles — use Far for settlement, Near for
      // the rest (Far has many settlement fields in the core pool).
      const group = feature === "settlement" ? "far" : "near";
      const state = createAdventureGameState({
        seed,
        customMap: [{ row: 9, col: 4, group, faceDown: true, secretFeature: feature }]
      });
      const tile = Object.values(state.adventure!.tiles).find(
        (entry) => entry.centerRow === 9 && entry.centerCol === 4
      );
      expect(tile?.faceDown).toBe(true);
      expect(tile?.tileDefId).toBeTruthy();
      return allTileDefinitions[tile!.tileDefId];
    };

    const withObelisk = make("obelisk", "feature-secret-obelisk");
    expect(withObelisk.fields.some((field) => field.location === "obelisk")).toBe(true);

    // Settlement may not exist on every pool; use any_mine as a guaranteed
    // second control when settlement is sparse — still assert settlement when found.
    const withSettlement = make("settlement", "feature-secret-settlement");
    expect(withSettlement.fields.some((field) => field.location === "settlement")).toBe(true);
  });

  it("secretFeature falls back to random and notes the table when the pool is empty", () => {
    // Flood the near pool with more gold-mine secrets than matching tiles —
    // extras fall back to pure random and emit a public note.
    const goldNear = Object.values(allTileDefinitions).filter(
      (def) =>
        def.group === "near" &&
        def.fields.some((field) => field.location === "mine" && field.resource === "gold")
    );
    expect(goldNear.length).toBeGreaterThan(0);

    const customMap: import("./state").CustomMapTilePlan[] = [
      { row: 9, col: 4, group: "near", faceDown: true, secretFeature: "gold_mine" },
      ...goldNear.map((_, index) => ({
        row: 20 + index * 3,
        col: 20 + index * 3,
        group: "near" as const,
        faceDown: true as const,
        secretFeature: "gold_mine" as const
      }))
    ];
    const state = createAdventureGameState({
      seed: "feature-fallback",
      customMap
    });
    const fallbacks = state.eventLog.filter((e) => e.type === "MAP_SECRET_FEATURE_FALLBACK");
    expect(fallbacks.length, "at least one soft-fail note").toBeGreaterThan(0);
    expect(fallbacks[0]).toMatchObject({
      type: "MAP_SECRET_FEATURE_FALLBACK",
      feature: "gold_mine",
      group: "near"
    });
    // CONTROL: every near tile is still placed (no empty hole).
    const nearTiles = Object.values(state.adventure!.tiles).filter((t) => t.group === "near");
    expect(nearTiles.length).toBe(1 + goldNear.length);
  });

  it("map preset applies starting resources, victory mode, and timed events", () => {
    const state = createAdventureGameState({
      seed: "map-preset-core",
      customMap: [{ row: 9, col: 4, group: "near", faceDown: true }],
      customMapPreset: {
        victoryMode: "grail",
        startingResources: { gold: 17, buildingMaterials: 3, valuables: 2 },
        startingProduction: { gold: 12, buildingMaterials: 1, valuables: 0 },
        startingBuildings: ["citadel", "city_hall"],
        startingBonuses: [{ kind: "resources", gold: 5, buildingMaterials: 0, valuables: 0 }],
        timedEvents: [
          { round: 1, effect: { kind: "note", text: "The war begins." } },
          {
            round: 2,
            effect: {
              kind: "clear_visitable_cubes",
              locations: ["windmill", "water_wheel", "mystical_garden"]
            }
          }
        ],
        notes: "Test map conditions"
      }
    });

    expect(state.adventure?.victoryMode).toBe("grail");
    expect(state.players.p1.resources.gold).toBe(17 + 5); // start + bonus
    expect(state.players.p1.resources.buildingMaterials).toBe(3);
    expect(state.players.p1.resources.valuables).toBe(2);
    expect(state.players.p1.production.gold).toBe(12);

    const p1Town = state.towns[`town_p1`] ?? Object.values(state.towns).find((t) => t.controllerId === "p1");
    expect(p1Town, "p1 town exists").toBeDefined();
    // Buildings are faction-prefixed on the town.
    expect(p1Town!.buildings.some((b) => b.endsWith("citadel"))).toBe(true);
    expect(p1Town!.buildings.some((b) => b.endsWith("city_hall"))).toBe(true);

    expect(state.adventure?.mapPreset?.notes).toBe("Test map conditions");
    expect(
      state.eventLog.some(
        (e) => e.type === "MAP_PRESET_TRIGGERED" && e.message.includes("The war begins")
      )
    ).toBe(true);
    expect(
      state.eventLog.some(
        (e) => e.type === "MAP_PRESET_TRIGGERED" && e.message.includes("Map note")
      )
    ).toBe(true);

    // CONTROL: without the preset, default gold is not 17.
    const plain = createAdventureGameState({
      seed: "map-preset-core",
      customMap: [{ row: 9, col: 4, group: "near", faceDown: true }]
    });
    expect(plain.players.p1.resources.gold).not.toBe(17 + 5);
  });

  it("two secretFeature slots of the same kind never share one physical tile", () => {
    // Each feature draw splices from the pool, so two "gold mine" secrets get
    // two distinct tiles (when the pool has at least two).
    const goldNearIds = Object.values(allTileDefinitions)
      .filter(
        (def) =>
          def.group === "near" &&
          def.fields.some((field) => field.location === "mine" && field.resource === "gold")
      )
      .map((def) => def.id);
    expect(goldNearIds.length, "need ≥2 near gold mines for this control").toBeGreaterThanOrEqual(2);

    const state = createAdventureGameState({
      seed: "feature-secret-two-golds",
      customMap: [
        { row: 9, col: 4, group: "near", faceDown: true, secretFeature: "gold_mine" },
        { row: 11, col: 2, group: "near", faceDown: true, secretFeature: "gold_mine" }
      ]
    });
    const placed = Object.values(state.adventure!.tiles).filter((tile) => tile.group === "near");
    expect(placed).toHaveLength(2);
    expect(placed[0].tileDefId).not.toBe(placed[1].tileDefId);
    for (const tile of placed) {
      const def = allTileDefinitions[tile.tileDefId!];
      expect(
        def?.fields.some((field) => field.location === "mine" && field.resource === "gold")
      ).toBe(true);
    }
  });

  it("accepts free-form tiles that leave gaps or float disconnected from the board", () => {
    const scenario = getScenario("skirmish");
    const { accepted, problems } = validateCustomMapPlan(
      [
        // Interlocks with seat 0, leaving no hole.
        { row: 9, col: 4, group: "near", faceDown: true },
        // Far off on its own — a detached island (room for future teleport gates).
        { row: 20, col: 20, group: "near", faceDown: true }
      ],
      scenario
    );
    expect(accepted).toHaveLength(2);
    expect(problems).toHaveLength(0);
  });

  it("keeps lockRotation on a starting plan but strips it off non-starting groups", () => {
    const scenario = getScenario("skirmish");
    const { accepted } = validateCustomMapPlan(
      [
        // Starting plan: lockRotation is meaningful here — it stays.
        { row: 8, col: 2, group: "starting", faceDown: false, lockRotation: true, rotation: 3 },
        // Non-starting plan carrying lockRotation — stripped (like gateLinks are
        // cavern-only), leaving everything else about the plan intact.
        { row: 9, col: 4, group: "near", faceDown: true, lockRotation: true, rotation: 2 }
      ],
      scenario
    );
    const start = accepted.find((plan) => plan.group === "starting");
    const near = accepted.find((plan) => plan.group === "near");
    expect(start?.lockRotation, "starting plan keeps its lock").toBe(true);
    expect(near?.lockRotation, "non-starting plan is stripped of lockRotation").toBeUndefined();
    // The stripped plan is otherwise unchanged (rotation 0-5 is validated globally).
    expect(near).toMatchObject({ group: "near", faceDown: true, rotation: 2 });
  });

  it("keeps the UNDERGROUND flag on far/near/center/sea but strips it off starting/subterranean", () => {
    const scenario = getScenario("skirmish");
    const { accepted } = validateCustomMapPlan(
      [
        // A supply tile flagged underground — the layer override is meaningful,
        // it stays (and the tile keeps its band identity).
        { row: 9, col: 4, group: "near", faceDown: true, underground: true },
        // A starting seat tile — Surface only (v1), the flag is stripped.
        { row: 8, col: 2, group: "starting", faceDown: false, underground: true },
        // A printed cavern — already underground, the flag is redundant → stripped.
        { row: 20, col: 20, group: "subterranean", faceDown: true, underground: true }
      ],
      scenario
    );
    const near = accepted.find((plan) => plan.group === "near");
    const start = accepted.find((plan) => plan.group === "starting");
    const cavern = accepted.find((plan) => plan.group === "subterranean");
    expect(near?.underground, "supply tile keeps its underground flag").toBe(true);
    expect(near, "otherwise unchanged").toMatchObject({ group: "near", faceDown: true });
    expect(start?.underground, "stripped off a starting seat tile").toBeUndefined();
    expect(cavern?.underground, "stripped off a printed cavern (redundant)").toBeUndefined();
  });

  it("rejects overlapping and duplicate positions", () => {
    const scenario = getScenario("skirmish");
    const overlapping = validateCustomMapPlan([{ row: 8, col: 3, group: "near", faceDown: true }], scenario);
    expect(overlapping.accepted).toHaveLength(0);
    expect(overlapping.problems.length).toBeGreaterThan(0);

    const duplicate = validateCustomMapPlan(
      [
        { row: 9, col: 4, group: "near", faceDown: true },
        { row: 9, col: 4, group: "center", faceDown: true }
      ],
      scenario
    );
    expect(duplicate.accepted).toHaveLength(1);
    expect(duplicate.problems[0]).toContain("duplicate");
  });
});

describe("Pandora's Box deck", () => {
  it("sets up a hidden Pandora deck and draws its top card into the visitor's hand", () => {
    const state = createAdventureGameState({ seed: "pandora-deck" });
    expect(state.adventure?.pandoraDeck?.length).toBeGreaterThan(0);

    // Deck order stays hidden in every player view; only the size shows.
    const view = getPlayerView(state, "p1");
    expect(view.adventure?.pandoraDeck?.every((cardId) => cardId === "hidden")).toBe(true);

    const top = state.adventure!.pandoraDeck!.at(-1)!;
    state.adventure!.pendingVisit = {
      playerId: "p1",
      heroId: "hero_p1",
      fieldId: state.heroes.hero_p1.spaceId!,
      steps: [{ type: "DRAW_PANDORA_CARD" }]
    };
    processPendingVisit(state);

    expect(state.players.p1.hand).toContain(top);
    expect(state.eventLog.some((event) => event.type === "PANDORA_CARD_DRAWN")).toBe(true);
  });
});

describe("map preset conditions — effects and apply-once semantics", () => {
  const NEAR_SLOT: import("./state").CustomMapTilePlan[] = [
    { row: 9, col: 4, group: "near", faceDown: true }
  ];

  /** Plant a visitable field with a black cube (mirrors visitable-fields-cube.test). */
  function injectCubeField(
    state: import("./state").GameState,
    spaceId: string,
    location: string,
    overrides: Partial<import("./state").MapFieldState> = {}
  ): import("./state").MapFieldState {
    const field: import("./state").MapFieldState = {
      spaceId,
      tileInstanceId: "preset-cube-tile",
      slot: 0,
      location,
      blackCube: true,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      ...overrides
    };
    state.adventure!.fields[spaceId] = field;
    return field;
  }

  /** Plant a live tile of a given group so tile-group filters can resolve it. */
  function injectTile(
    state: import("./state").GameState,
    id: string,
    group: import("./state").MapTileState["group"]
  ): void {
    state.adventure!.tiles[id] = {
      id,
      tileDefId: "F1",
      centerRow: 0,
      centerCol: 0,
      rotation: 0,
      faceDown: false,
      group
    };
  }

  it("an explicit victory choice OVERRIDES the preset at build (apply-once), while unset fields still fill", () => {
    // The lobby path always passes every option explicitly (the preset was
    // already applied on pick), so a host's later victory edit must win.
    const state = createAdventureGameState({
      seed: "preset-apply-once",
      victoryMode: "conquest",
      customMap: NEAR_SLOT,
      customMapPreset: {
        victoryMode: "grail",
        startingResources: { gold: 17, buildingMaterials: 3, valuables: 2 }
      }
    });
    expect(state.adventure?.victoryMode).toBe("conquest");
    // Fields the caller did NOT pass are still seeded by the preset.
    expect(state.players.p1.resources.gold).toBe(17);

    // CONTROL: without the explicit choice the preset decides the victory mode.
    const implicit = createAdventureGameState({
      seed: "preset-apply-once",
      customMap: NEAR_SLOT,
      customMapPreset: {
        victoryMode: "grail",
        startingResources: { gold: 17, buildingMaterials: 3, valuables: 2 }
      }
    });
    expect(implicit.adventure?.victoryMode).toBe("grail");
  });

  it("switching away from a preset map restores the scenario defaults (no condition leaks)", () => {
    let state = createAdventureLobbyState({ seed: "preset-restore", scenarioId: "skirmish" });
    const lobby = () => state.setupLobby!;
    const baseVictory = lobby().options.victoryMode;
    const baseResources = { ...lobby().options.startingResources };

    const apply = (options: Record<string, unknown>) => {
      const result = applyAction(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options });
      expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
      state = result.state;
    };

    // Pick a designed map WITH conditions: they seed the lobby options.
    apply({
      customMap: NEAR_SLOT,
      customMapName: "Conditions",
      customMapPreset: {
        victoryMode: "grail",
        startingResources: { gold: 17, buildingMaterials: 3, valuables: 2 }
      }
    });
    expect(lobby().options.victoryMode).toBe("grail");
    expect(lobby().options.startingResources.gold).toBe(17);
    expect(lobby().options.customMapPreset?.victoryMode).toBe("grail");

    // Switch to a preset-LESS designed map: the old map's conditions revert.
    apply({ customMap: NEAR_SLOT, customMapName: "Plain", customMapPreset: null });
    expect(lobby().options.customMapPreset).toBeNull();
    expect(lobby().options.victoryMode).toBe(baseVictory);
    expect(lobby().options.startingResources).toEqual(baseResources);
    // The waiting seats' resource preview follows the restore.
    expect(state.players.p1.resources.gold).toBe(baseResources.gold);

    // Re-pick the conditions map, then go back to the plain scenario layout.
    apply({
      customMap: NEAR_SLOT,
      customMapName: "Conditions",
      customMapPreset: { victoryMode: "grail", startingResources: { gold: 17, buildingMaterials: 3, valuables: 2 } }
    });
    expect(lobby().options.victoryMode).toBe("grail");
    apply({ customMap: null });
    expect(lobby().options.customMapPreset).toBeNull();
    expect(lobby().options.victoryMode).toBe(baseVictory);
    expect(lobby().options.startingResources).toEqual(baseResources);

    // And a BARE scenario switch (drops the designed map) reverts too.
    apply({
      customMap: NEAR_SLOT,
      customMapName: "Conditions",
      customMapPreset: { victoryMode: "grail", startingResources: { gold: 17, buildingMaterials: 3, valuables: 2 } }
    });
    apply({ scenarioId: "land-2p" });
    expect(lobby().options.customMap).toBeNull();
    expect(lobby().options.customMapPreset).toBeNull();
    expect(lobby().options.victoryMode).toBe(baseVictory);
  });

  // ---- Map-settings defaults (difficulty / far-tile supply) hoisted 1:1 ----

  it("seeds the map-settings defaults (difficulty / far tiles / victory) onto the lobby on pick, then a host edit wins", () => {
    let state = createAdventureLobbyState({ seed: "preset-map-settings", scenarioId: "skirmish" });
    const lobby = () => state.setupLobby!;
    const baseDifficulty = lobby().options.difficulty; // "impossible"
    const apply = (options: Record<string, unknown>) => {
      const result = applyAction(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options });
      expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
      state = result.state;
    };

    // CONTROL: a legacy preset WITHOUT the new fields leaves every lobby default.
    apply({ customMap: NEAR_SLOT, customMapName: "Legacy", customMapPreset: { victoryMode: "grail" } });
    expect(lobby().options.difficulty).toBe(baseDifficulty);
    expect(lobby().options.farTileOpening).toBe(true);
    expect(lobby().options.farTilesPerPlayer).toBe(2);

    // Pick a map whose preset carries all three map-settings defaults → they seed.
    apply({
      customMap: NEAR_SLOT,
      customMapName: "Settings",
      customMapPreset: {
        difficulty: "hard",
        farTileOpening: false,
        farTilesPerPlayer: 0,
        victoryMode: "grail"
      }
    });
    expect(lobby().options.difficulty).toBe("hard");
    expect(lobby().options.farTileOpening).toBe(false);
    expect(lobby().options.farTilesPerPlayer).toBe(0);
    expect(lobby().options.victoryMode).toBe("grail");

    // APPLY-ONCE: a later bare edit sticks — the preset does not re-force it.
    apply({ difficulty: "easy" });
    expect(lobby().options.difficulty).toBe("easy");
    apply({ farTileOpening: true, farTilesPerPlayer: 4 });
    expect(lobby().options.farTileOpening).toBe(true);
    expect(lobby().options.farTilesPerPlayer).toBe(4);
  });

  it("build seeds the preset difficulty + far-tile supply into the adventure (direct build, legacy CONTROL)", () => {
    const built = createAdventureGameState({
      seed: "preset-build-settings",
      customMap: NEAR_SLOT,
      customMapPreset: { difficulty: "hard", farTilesPerPlayer: 0 }
    });
    // Difficulty landed on the built GameState (adventure.difficulty is the store;
    // its downstream consumers — guard-army strength via NEUTRAL_ARMY_TABLE, the
    // Scenario-Difficulty starting bonus — are covered by existing difficulty tests).
    expect(built.adventure?.difficulty).toBe("hard");
    // farTilesPerPlayer 0 → no Ⅱ–Ⅲ supply for any player.
    expect(built.adventure?.playerFarTiles.p1).toEqual([]);
    expect(built.adventure?.playerFarTiles.p2).toEqual([]);

    // A supply of 3 → three face-down "?" markers per player.
    const three = createAdventureGameState({
      seed: "preset-build-settings",
      customMap: NEAR_SLOT,
      customMapPreset: { farTilesPerPlayer: 3 }
    });
    expect(three.adventure?.playerFarTiles.p1).toHaveLength(3);

    // farTileOpening false → empty supply even with a positive count.
    const off = createAdventureGameState({
      seed: "preset-build-settings",
      customMap: NEAR_SLOT,
      customMapPreset: { farTileOpening: false, farTilesPerPlayer: 5 }
    });
    expect(off.adventure?.playerFarTiles.p1).toEqual([]);

    // CONTROL: a legacy preset (no map-settings fields) keeps the scenario
    // defaults — Impossible difficulty and the 2-tile skirmish supply.
    const control = createAdventureGameState({
      seed: "preset-build-settings",
      customMap: NEAR_SLOT,
      customMapPreset: { victoryMode: "grail" }
    });
    expect(control.adventure?.difficulty).toBe("impossible");
    expect(control.adventure?.playerFarTiles.p1).toHaveLength(2);
  });

  it("build honours an explicit difficulty over the preset (apply-once at build), else the preset fills it", () => {
    // The lobby build path passes every option, so a host's edited difficulty wins.
    const explicit = createAdventureGameState({
      seed: "preset-build-applyonce",
      difficulty: "easy",
      customMap: NEAR_SLOT,
      customMapPreset: { difficulty: "hard" }
    });
    expect(explicit.adventure?.difficulty).toBe("easy");
    // CONTROL: with no explicit difficulty the preset decides.
    const implicit = createAdventureGameState({
      seed: "preset-build-applyonce",
      customMap: NEAR_SLOT,
      customMapPreset: { difficulty: "hard" }
    });
    expect(implicit.adventure?.difficulty).toBe("hard");
  });

  it("map presets seed the two global house rules while explicit setup choices win", () => {
    const preset = {
      houseRules: {
        "no-secondary-heroes": true,
        "free-neutral-combat-extend": true
      }
    } as const;
    const seeded = createAdventureGameState({
      seed: "preset-global-rules",
      customMap: NEAR_SLOT,
      customMapPreset: preset
    });
    expect(seeded.adventure?.houseRules?.["no-secondary-heroes"]).toBe(true);
    expect(seeded.adventure?.houseRules?.["free-neutral-combat-extend"]).toBe(true);

    const explicit = createAdventureGameState({
      seed: "preset-global-rules-explicit",
      customMap: NEAR_SLOT,
      customMapPreset: preset,
      houseRules: {
        "no-secondary-heroes": false,
        "free-neutral-combat-extend": false
      }
    });
    expect(explicit.adventure?.houseRules?.["no-secondary-heroes"]).toBe(false);
    expect(explicit.adventure?.houseRules?.["free-neutral-combat-extend"]).toBe(false);
  });

  it("switching away from a map-settings preset restores the scenario difficulty + far-tile defaults", () => {
    let state = createAdventureLobbyState({ seed: "preset-settings-revert", scenarioId: "skirmish" });
    const lobby = () => state.setupLobby!;
    const baseDifficulty = lobby().options.difficulty;
    const baseFarOpening = lobby().options.farTileOpening;
    const baseFarCount = lobby().options.farTilesPerPlayer;
    const apply = (options: Record<string, unknown>) => {
      const result = applyAction(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options });
      expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
      state = result.state;
    };

    apply({
      customMap: NEAR_SLOT,
      customMapName: "Settings",
      customMapPreset: {
        difficulty: "easy",
        farTileOpening: false,
        farTilesPerPlayer: 0
      }
    });
    expect(lobby().options.difficulty).toBe("easy");
    expect(lobby().options.farTileOpening).toBe(false);
    expect(lobby().options.farTilesPerPlayer).toBe(0);

    // Switch to a preset-less map: the map-settings revert to the scenario defaults.
    apply({ customMap: NEAR_SLOT, customMapName: "Plain", customMapPreset: null });
    expect(lobby().options.difficulty).toBe(baseDifficulty);
    expect(lobby().options.farTileOpening).toBe(baseFarOpening);
    expect(lobby().options.farTilesPerPlayer).toBe(baseFarCount);
  });

  it("sanitizeCustomMapPreset validates the map-settings defaults (difficulty / far tiles); legacy untouched", async () => {
    const { sanitizeCustomMapPreset } = await import("./map-preset");
    // Garbage difficulty dropped; farTilesPerPlayer clamps 99→6; farTileOpening kept as a real boolean.
    const cleaned = sanitizeCustomMapPreset({
      difficulty: "nightmare",
      farTileOpening: false,
      farTilesPerPlayer: 99
    });
    expect(cleaned?.difficulty).toBeUndefined();
    expect(cleaned?.farTileOpening).toBe(false);
    expect(cleaned?.farTilesPerPlayer).toBe(6);

    // A valid difficulty is kept; a negative count floors to 0; a non-number count is dropped.
    const kept = sanitizeCustomMapPreset({ difficulty: "hard", farTilesPerPlayer: -1 });
    expect(kept?.difficulty).toBe("hard");
    expect(kept?.farTilesPerPlayer).toBe(0);
    const garbageCount = sanitizeCustomMapPreset({ difficulty: "normal", farTilesPerPlayer: "lots" });
    expect(garbageCount?.difficulty).toBe("normal");
    expect(garbageCount?.farTilesPerPlayer).toBeUndefined();

    // A non-boolean farTileOpening is dropped (only a real boolean is kept).
    const noOpen = sanitizeCustomMapPreset({ difficulty: "easy", farTileOpening: "yes" });
    expect(noOpen?.farTileOpening).toBeUndefined();
    // LEGACY CONTROL: a preset without the new fields is byte-identical after sanitize.
    expect(sanitizeCustomMapPreset({ victoryMode: "grail" })).toEqual({ victoryMode: "grail" });
  });

  it("describeCustomMapPresetEntries names the map-settings defaults (difficulty + additional tiles), legacy CONTROL shows neither", async () => {
    const { describeCustomMapPresetEntries } = await import("./map-preset");
    const hardOff = describeCustomMapPresetEntries({ difficulty: "hard", farTileOpening: false }).map((e) => e.text);
    expect(hardOff.some((t) => t.includes("Difficulty") && t.includes("Hard"))).toBe(true);
    expect(hardOff.some((t) => t.includes("Additional") && t.includes("off"))).toBe(true);

    const perPlayer = describeCustomMapPresetEntries({ farTilesPerPlayer: 3 }).map((e) => e.text);
    expect(perPlayer.some((t) => t.includes("Additional") && t.includes("3 per player"))).toBe(true);

    // CONTROL: a legacy preset without the map-settings fields shows neither line.
    const legacy = describeCustomMapPresetEntries({ victoryMode: "grail" }).map((e) => e.text);
    expect(legacy.some((t) => t.includes("Difficulty"))).toBe(false);
    expect(legacy.some((t) => t.includes("Additional"))).toBe(false);
  });

  it("a round-N timed event fires when THAT round starts: cubes clear, resources land (with controls)", () => {
    const build = (withPreset: boolean) =>
      createAdventureGameState({
        seed: "preset-timed-round",
        customMap: NEAR_SLOT,
        ...(withPreset
          ? {
              customMapPreset: {
                timedEvents: [
                  {
                    round: 3,
                    effect: { kind: "clear_visitable_cubes" as const, locations: ["windmill" as const] }
                  },
                  {
                    round: 3,
                    effect: { kind: "resources" as const, gold: 4, buildingMaterials: 0, valuables: 0 }
                  }
                ]
              }
            }
          : {})
      });

    const state = build(true);
    const control = build(false);
    const windmill = injectCubeField(state, "60,60", "windmill");
    // CONTROL location: a cubed Mystical Garden is NOT in the event's list.
    const garden = injectCubeField(state, "61,61", "mystical_garden");

    // Round 2 (Astrologers): the round-3 event must NOT fire early.
    state.round = 2;
    startAdventureRound(state);
    control.round = 2;
    startAdventureRound(control);
    expect(windmill.blackCube).toBe(true);
    expect(state.eventLog.some((e) => e.type === "MAP_PRESET_TRIGGERED" && e.round === 3)).toBe(false);

    // Round 3 (Resource): cube cleared, control cube stays, +4 gold vs the
    // identical-seed control state (isolates the event from round income).
    state.round = 3;
    startAdventureRound(state);
    control.round = 3;
    startAdventureRound(control);
    expect(windmill.blackCube).toBe(false);
    expect(garden.blackCube).toBe(true);
    expect(state.players.p1.resources.gold - control.players.p1.resources.gold).toBe(4);
    expect(state.players.p2.resources.gold - control.players.p2.resources.gold).toBe(4);
    expect(
      state.eventLog.some(
        (e) => e.type === "MAP_PRESET_TRIGGERED" && e.round === 3 && e.message.includes("windmill")
      )
    ).toBe(true);
  });

  it("opens a trade-only Market event after Resource-round income", () => {
    const state = createAdventureGameState({
      seed: "preset-market-day",
      rollFirstPlayer: false,
      events: false,
      startingResources: { gold: 0, buildingMaterials: 0, valuables: 0 },
      startingProduction: { gold: 7, buildingMaterials: 2, valuables: 1 },
      customMapPreset: {
        timedEvents: [{ round: 3, effect: { kind: "market_trade" } }]
      }
    });
    const before = { ...state.players.p1.resources };
    state.round = 3;

    startAdventureRound(state);

    expect(state.players.p1.resources).toEqual({
      gold: before.gold + 7,
      buildingMaterials: before.buildingMaterials + 2,
      valuables: before.valuables + 1
    });
    const incomeIndex = state.eventLog.findIndex(
      (event) => event.type === "RESOURCES_GAINED" && event.playerId === "p1" && event.reason === "resource round income"
    );
    const marketIndex = state.eventLog.findIndex(
      (event) => event.type === "MAP_PRESET_TRIGGERED" && event.message.includes("Market rates")
    );
    expect(incomeIndex).toBeGreaterThanOrEqual(0);
    expect(marketIndex).toBeGreaterThan(incomeIndex);

    const marketRewards = state.adventure!.rewardQueue.filter(
      (reward) =>
        reward.kind === "visit-steps" &&
        reward.steps.some((step) => step.type === "TRADING_POST" && step.tradesOnly === true)
    );
    expect(new Set(marketRewards.map((reward) => reward.playerId))).toEqual(new Set(["p1", "p2"]));
    expect(
      marketRewards.every(
        (reward) => reward.kind === "visit-steps" && reward.steps.every((step) => step.type === "TRADING_POST")
      )
    ).toBe(true);

    pumpAdventureQueues(state);
    expect(state.adventure!.pendingVisit?.steps[0]).toMatchObject({
      type: "TRADING_POST",
      tradesOnly: true
    });
    const actions = getLegalActions(state, "p1");
    expect(actions.some((entry) => entry.action.type === "TRADE_RESOURCES")).toBe(true);
    expect(actions.some((entry) => entry.action.type === "BUY_WAR_MACHINE")).toBe(false);
    expect(actions.some((entry) => entry.action.type === "SELL_SCROLL_SPELL")).toBe(false);
    expect(
      actions.some(
        (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && entry.action.decline !== true
      )
    ).toBe(false);
  });

  it("clear_visitable_cubes also re-opens Factory Derrick/Prospector aliases (rulebook p.7)", () => {
    const state = createAdventureGameState({
      seed: "preset-factory-cubes",
      customMap: NEAR_SLOT,
      customMapPreset: {
        timedEvents: [
          {
            round: 2,
            effect: {
              kind: "clear_visitable_cubes",
              locations: ["windmill", "water_wheel"]
            }
          }
        ]
      }
    });
    const derrick = injectCubeField(state, "70,70", "derrick");
    const prospector = injectCubeField(state, "71,71", "prospector");
    // CONTROL: garden is not targeted and must stay cubed.
    const garden = injectCubeField(state, "72,72", "mystical_garden");
    state.round = 2;
    startAdventureRound(state);
    expect(derrick.blackCube).toBe(false);
    expect(prospector.blackCube).toBe(false);
    expect(garden.blackCube).toBe(true);
  });

  it("clear_tile_cubes re-opens matching-group Tile cubes but never banks or victory fields (with controls)", () => {
    const build = (withPreset: boolean) =>
      createAdventureGameState({
        seed: "preset-tile-cubes",
        customMap: NEAR_SLOT,
        ...(withPreset
          ? {
              customMapPreset: {
                timedEvents: [
                  {
                    round: 3,
                    effect: { kind: "clear_tile_cubes" as const, groups: ["far" as const] }
                  }
                ]
              }
            }
          : {})
      });

    const state = build(true);
    const control = build(false);
    injectTile(state, "far-tile", "far");
    injectTile(state, "near-tile", "near");
    injectTile(control, "far-tile", "far");

    // On the FAR (Ⅱ–Ⅲ) tile: a plain visitable cube, a Creature-Bank cube (bank
    // rule) and a Grail victory-field cube (victory safety) — the discriminating
    // pair/trio that a mutation would clear.
    const farPlain = injectCubeField(state, "60,60", "windmill", { tileInstanceId: "far-tile" });
    const farBank = injectCubeField(state, "60,61", "creature_bank", {
      tileInstanceId: "far-tile",
      bankId: "dragon_fly_hive" // realism only — the exclusion keys off `location`
    });
    const farGrail = injectCubeField(state, "60,62", "grail", { tileInstanceId: "far-tile" });
    // NEAR (Ⅳ–Ⅴ) tile — wrong group, must stay cubed.
    const nearPlain = injectCubeField(state, "61,61", "windmill", { tileInstanceId: "near-tile" });
    // CONTROL twin (no preset): the same far plain cube must survive.
    const controlPlain = injectCubeField(control, "60,60", "windmill", {
      tileInstanceId: "far-tile"
    });

    state.round = 3;
    applyCustomMapTimedEvents(state);
    control.round = 3;
    applyCustomMapTimedEvents(control);

    expect(farPlain.blackCube).toBe(false); // matching group → re-opened
    expect(farBank.blackCube).toBe(true); // bank keeps its defeat cube (hard rule)
    expect(farGrail.blackCube).toBe(true); // victory field never re-opened
    expect(nearPlain.blackCube).toBe(true); // wrong group → untouched
    expect(controlPlain.blackCube).toBe(true); // no preset → nothing clears
    expect(
      state.eventLog.some(
        (e) => e.type === "MAP_PRESET_TRIGGERED" && e.round === 3 && e.message.includes("Ⅱ–Ⅲ")
      )
    ).toBe(true);
  });

  it("clear_tile_cubes excludeSettlementTiles spares a whole settlement Tile (flag control)", () => {
    const build = (exclude: boolean) => {
      const s = createAdventureGameState({
        seed: "preset-tile-cube-settlement",
        customMap: NEAR_SLOT,
        customMapPreset: {
          timedEvents: [
            {
              round: 3,
              effect: {
                kind: "clear_tile_cubes" as const,
                groups: ["far" as const],
                excludeSettlementTiles: exclude
              }
            }
          ]
        }
      });
      injectTile(s, "far-a", "far");
      injectTile(s, "far-b", "far");
      // far-a hosts a Settlement; far-b does not.
      injectCubeField(s, "settle", "settlement", { tileInstanceId: "far-a", blackCube: false });
      const aCube = injectCubeField(s, "a-cube", "windmill", { tileInstanceId: "far-a" });
      const bCube = injectCubeField(s, "b-cube", "windmill", { tileInstanceId: "far-b" });
      s.round = 3;
      applyCustomMapTimedEvents(s);
      return { aCube, bCube };
    };

    const excluded = build(true);
    expect(excluded.aCube.blackCube).toBe(true); // settlement tile spared
    expect(excluded.bCube.blackCube).toBe(false); // non-settlement far tile cleared

    // FLAG CONTROL: with the flag off, the settlement tile's cube clears too.
    const included = build(false);
    expect(included.aCube.blackCube).toBe(false);
    expect(included.bCube.blackCube).toBe(false);
  });

  it("a re-opened Tile field with printed difficulty becomes guarded again (the re-open tool)", () => {
    const state = createAdventureGameState({
      seed: "preset-tile-cube-reguard",
      customMap: NEAR_SLOT,
      customMapPreset: {
        timedEvents: [
          { round: 3, effect: { kind: "clear_tile_cubes" as const, groups: ["far" as const] } }
        ]
      }
    });
    injectTile(state, "far-tile", "far");
    // A defeated guarded field: printed difficulty, cube marked, never flagged.
    const field = injectCubeField(state, "guard", "windmill", {
      tileInstanceId: "far-tile",
      difficulty: 3
    });
    expect(isFieldGuarded(field)).toBe(false); // cube down → not guarded

    state.round = 3;
    applyCustomMapTimedEvents(state);

    expect(field.blackCube).toBe(false);
    expect(isFieldGuarded(field)).toBe(true); // re-opened → guards return, re-fightable
  });

  it("timed morale / movement / treasure-roll / resource-roll fire with observable outcomes (and controls)", () => {
    const build = (withPreset: boolean) =>
      createAdventureGameState({
        seed: "preset-timed-freedom",
        customMap: NEAR_SLOT,
        ...(withPreset
          ? {
              customMapPreset: {
                timedEvents: [
                  { round: 3, effect: { kind: "morale" as const, amount: 1 as const } },
                  { round: 3, effect: { kind: "movement" as const, amount: 2 } },
                  { round: 3, effect: { kind: "treasure_roll" as const, count: 1 } },
                  { round: 3, effect: { kind: "resource_roll" as const, count: 2 } }
                ]
              }
            }
          : {})
      });

    const state = build(true);
    const control = build(false);

    // Snapshot MPs after round-2 refresh so the control isolates the timed grant.
    state.round = 2;
    startAdventureRound(state);
    control.round = 2;
    startAdventureRound(control);
    const p1Hero = Object.values(state.heroes).find((h) => h.controllerId === "p1")!;
    const controlHero = Object.values(control.heroes).find((h) => h.controllerId === "p1")!;
    const mpBefore = p1Hero.movementPoints;
    const controlMpBefore = controlHero.movementPoints;
    expect(mpBefore).toBe(controlMpBefore);

    state.round = 3;
    startAdventureRound(state);
    control.round = 3;
    startAdventureRound(control);

    // Morale: Castle gains, Necropolis still ignores (real changeMorale path).
    expect(state.players.p1.morale).toBe(control.players.p1.morale + 1);
    expect(state.players.p2.morale).toBe(control.players.p2.morale);

    // Movement stacks on the round's refreshed MP.
    expect(p1Hero.movementPoints).toBe(controlHero.movementPoints + 2);

    // Dice queues: one treasure + one resource roll per live player.
    const treasureQueued = state.adventure!.rewardQueue.filter(
      (reward) =>
        reward.kind === "visit-steps" &&
        reward.steps.some((step) => step.type === "ROLL_TREASURE_DICE" && step.count === 1)
    );
    const resourceQueued = state.adventure!.rewardQueue.filter(
      (reward) =>
        reward.kind === "visit-steps" &&
        reward.steps.some((step) => step.type === "ROLL_RESOURCE_DICE" && step.count === 2)
    );
    expect(new Set(treasureQueued.map((r) => r.playerId))).toEqual(new Set(["p1", "p2"]));
    expect(new Set(resourceQueued.map((r) => r.playerId))).toEqual(new Set(["p1", "p2"]));

    // CONTROL: plain map never queues those rolls or bumps morale/MP.
    expect(
      control.adventure!.rewardQueue.some(
        (reward) =>
          reward.kind === "visit-steps" &&
          reward.steps.some(
            (step) => step.type === "ROLL_TREASURE_DICE" || step.type === "ROLL_RESOURCE_DICE"
          )
      )
    ).toBe(false);
    expect(control.players.p1.morale).toBe(0);

    // Feed lines exist for every effect (mutation-check the event appends).
    for (const snippet of ["morale", "movement", "Treasure", "Resource"]) {
      expect(
        state.eventLog.some(
          (e) => e.type === "MAP_PRESET_TRIGGERED" && e.round === 3 && e.message.includes(snippet)
        ),
        `expected MAP_PRESET_TRIGGERED mentioning ${snippet}`
      ).toBe(true);
    }
  });

  it("timed choice events queue one real reward choice per live player", () => {
    const state = createAdventureGameState({
      seed: "preset-timed-choice",
      customMap: NEAR_SLOT,
      customMapPreset: {
        timedEvents: [
          {
            round: 3,
            effect: {
              kind: "choice",
              prompt: "The stars align: choose your boon",
              options: [
                { kind: "resources", gold: 0, buildingMaterials: 0, valuables: 1 },
                { kind: "resources", gold: 0, buildingMaterials: 2, valuables: 0 },
                { kind: "experience", amount: 2 }
              ]
            }
          }
        ]
      }
    });
    state.round = 3;

    applyCustomMapTimedEvents(state);

    const queuedChoices = state.adventure!.rewardQueue.filter(
      (reward) =>
        reward.kind === "visit-steps" &&
        reward.steps[0]?.type === "CHOOSE_ONE" &&
        reward.steps[0].prompt === "The stars align: choose your boon"
    );
    const liveOrder = state.turnOrder.filter((playerId) => playerId === "p1" || playerId === "p2");
    expect(queuedChoices.map((reward) => reward.playerId)).toEqual(liveOrder);
    expect(state.adventure!.rewardQueue.at(-1)?.kind).toBe("round-start-events-resolved");

    state.adventure!.pendingTileChoice = null;
    pumpAdventureQueues(state);
    const choiceOwner = liveOrder[0];
    const materialsBefore = state.players[choiceOwner].resources.buildingMaterials;
    const step = state.adventure!.pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") {
      throw new Error("Timed choice did not open.");
    }
    expect(step.options).toHaveLength(3);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: choiceOwner, optionIndex: 1 });
    expect(state.players[choiceOwner].resources.buildingMaterials).toBe(materialsBefore + 2);
  });

  // A timed event that queues per-player resolution raises the round-start EVENT
  // BARRIER (the Astrologers/Fortress-Event machinery), so the whole table waits
  // while each seat answers — and the trailing sentinel must still lift it. Round
  // 1 is the harshest case: the barrier goes up inside setup, before any action.
  it("a timed reward event freezes the whole table until every seat resolves it", () => {
    const state = createAdventureGameState({
      seed: "preset-timed-choice-barrier",
      rollFirstPlayer: false,
      customMap: NEAR_SLOT,
      customMapPreset: {
        timedEvents: [
          {
            round: 1,
            effect: {
              kind: "choice",
              prompt: "Choose your boon",
              options: [
                { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 },
                { kind: "morale", amount: 1 }
              ]
            }
          }
        ]
      }
    });
    const goldBefore = { p1: state.players.p1.resources.gold, p2: state.players.p2.resources.gold };

    // Setup already pumped the queue: the barrier is up on p1's choice and p2 —
    // whose own choice is still queued — cannot act at all.
    expect(state.adventure!.eventResolution).toEqual({ round: 1 });
    expect(state.adventure!.pendingVisit?.playerId).toBe("p1");
    expect(getLegalActions(state, "p2"), "a frozen seat has NO legal actions").toEqual([]);
    expect(
      applyAction(state, { type: "END_TURN", playerId: "p2" }).errors.map((error) => error.message)
    ).toEqual([expect.stringMatching(/Event is still being resolved/i)]);

    // p1 answers → p2's copy opens and the roles swap.
    let next = applyAction(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(next.errors).toEqual([]);
    expect(next.state.adventure!.pendingVisit?.playerId).toBe("p2");
    expect(next.state.adventure!.eventResolution).toEqual({ round: 1 });
    expect(getLegalActions(next.state, "p1")).toEqual([]);

    // p2 answers → the sentinel lifts the barrier and normal play resumes.
    next = applyAction(next.state, { type: "RESOLVE_VISIT_STEP", playerId: "p2", optionIndex: 0 });
    expect(next.errors).toEqual([]);
    expect(next.state.adventure!.eventResolution).toBeNull();
    expect(next.state.players.p1.resources.gold).toBe(goldBefore.p1 + 3);
    expect(next.state.players.p2.resources.gold).toBe(goldBefore.p2 + 3);
    expect(getLegalActions(next.state, "p1").length).toBeGreaterThan(0);
  });

  it("CONTROL: a timed event that queues nothing raises no barrier", () => {
    const state = createAdventureGameState({
      seed: "preset-timed-note-no-barrier",
      rollFirstPlayer: false,
      customMap: NEAR_SLOT,
      customMapPreset: {
        timedEvents: [{ round: 1, effect: { kind: "note", text: "Something stirs" } }]
      }
    });
    expect(state.adventure!.eventResolution ?? null).toBeNull();
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });

  it("timed events skip eliminated seats and their heroes", () => {
    const state = createAdventureGameState({
      seed: "preset-timed-live-seats",
      customMap: NEAR_SLOT,
      customMapPreset: {
        timedEvents: [
          { round: 3, effect: { kind: "movement", amount: 2 } },
          { round: 3, effect: { kind: "treasure_roll", count: 1 } }
        ]
      }
    });
    const eliminatedHero = Object.values(state.heroes).find(
      (hero) => hero.controllerId === "p2"
    )!;
    const movementBefore = eliminatedHero.movementPoints;
    state.players.p2.eliminated = true;
    state.round = 3;
    applyCustomMapTimedEvents(state);

    expect(eliminatedHero.movementPoints).toBe(movementBefore);
    const timedRollOwners = state.adventure!.rewardQueue
      .filter(
        (reward) =>
          reward.kind === "visit-steps" &&
          reward.steps.some((step) => step.type === "ROLL_TREASURE_DICE")
      )
      .map((reward) => reward.playerId);
    expect(timedRollOwners).toEqual(["p1"]);
  });

  it("a repeating timed event fires on its schedule (round, +N, +2N…) but never off-schedule (controls)", () => {
    const build = (repeat: number | undefined) =>
      createAdventureGameState({
        seed: "preset-timed-repeat",
        customMap: NEAR_SLOT,
        customMapPreset: {
          timedEvents: [
            {
              round: 3,
              ...(repeat ? { repeatEveryRounds: repeat } : {}),
              effect: { kind: "resources" as const, gold: 5, buildingMaterials: 0, valuables: 0 }
            }
          ]
        }
      });

    const state = build(2);
    const oneShot = build(undefined); // CONTROL: a legacy one-shot (no repeat).

    const gold = (s: import("./state").GameState) => s.players.p1.resources.gold;
    const fire = (s: import("./state").GameState, round: number) => {
      s.round = round;
      applyCustomMapTimedEvents(s);
    };
    const base = gold(state);
    const oneShotBase = gold(oneShot);

    // Round 2 (< the event round): neither fires.
    fire(state, 2);
    fire(oneShot, 2);
    expect(gold(state)).toBe(base);
    expect(gold(oneShot)).toBe(oneShotBase);

    // Round 3: both fire (+5).
    fire(state, 3);
    fire(oneShot, 3);
    expect(gold(state)).toBe(base + 5);
    expect(gold(oneShot)).toBe(oneShotBase + 5);

    // Round 4 (CONTROL): interval 2 → NOT due; the one-shot is also silent.
    fire(state, 4);
    fire(oneShot, 4);
    expect(gold(state)).toBe(base + 5);
    expect(gold(oneShot)).toBe(oneShotBase + 5);

    // Round 5: the repeating event fires again (+5); the one-shot NEVER fires
    // again (CONTROL: a one-shot fires exactly once).
    fire(state, 5);
    fire(oneShot, 5);
    expect(gold(state)).toBe(base + 10);
    expect(gold(oneShot)).toBe(oneShotBase + 5);

    // Round 6 (CONTROL): off-schedule, no fire.
    fire(state, 6);
    expect(gold(state)).toBe(base + 10);

    // Round 7: the third firing (+5).
    fire(state, 7);
    expect(gold(state)).toBe(base + 15);

    // Each firing appends a DISTINCT MAP_PRESET_TRIGGERED (the map-event overlay
    // dedupes by id — a repeat firing must not be swallowed as the same event).
    const firedIds = state.eventLog
      .filter((e) => e.type === "MAP_PRESET_TRIGGERED")
      .map((e) => e.id);
    expect(firedIds).toHaveLength(3); // rounds 3, 5, 7
    expect(new Set(firedIds).size).toBe(3); // all distinct
  });

  it("a timed experience event raises the main hero via the NORMAL level pipeline (eliminated seat skipped)", () => {
    const state = createAdventureGameState({
      seed: "preset-timed-xp",
      customMap: NEAR_SLOT,
      customMapPreset: {
        timedEvents: [{ round: 3, effect: { kind: "experience", amount: 4 } }]
      }
    });
    const p1Hero = Object.values(state.heroes).find((h) => h.controllerId === "p1")!;
    const p2Hero = Object.values(state.heroes).find((h) => h.controllerId === "p2")!;
    // Baseline: heroes start at level 1 / exp 0, expert-use limit 0, hand 4.
    expect(p1Hero.level).toBe(1);
    expect(state.players.p1.limits.expertUses).toBe(0);
    const p2ExpBefore = p2Hero.experience;
    const p2LevelBefore = p2Hero.level;

    // CONTROL: p2 is eliminated and must gain nothing.
    state.players.p2.eliminated = true;

    state.round = 3;
    applyCustomMapTimedEvents(state);

    // +4 XP → level 3 (levelOfExperience(4) = 3): the NORMAL pipeline bumps the
    // hero LEVEL and its downstream hand-limit / expert-use limits, and appends
    // the same EXPERIENCE_GAINED / HERO_LEVEL_UP events a combat award produces.
    expect(p1Hero.experience).toBe(4);
    expect(p1Hero.level).toBe(3);
    expect(state.players.p1.limits.expertUses).toBe(1); // EXPERT_USES_BY_LEVEL[3]
    expect(state.players.p1.limits.hand).toBe(5); // HAND_LIMIT_BY_LEVEL[3]
    expect(state.eventLog.some((e) => e.type === "HERO_LEVEL_UP" && e.playerId === "p1")).toBe(true);
    expect(state.eventLog.some((e) => e.type === "EXPERIENCE_GAINED" && e.playerId === "p1")).toBe(true);

    // Eliminated seat untouched (no XP, no level change).
    expect(p2Hero.experience).toBe(p2ExpBefore);
    expect(p2Hero.level).toBe(p2LevelBefore);
  });

  it("a NEGATIVE resources timed event drains every treasury, floored at 0 (floor control)", () => {
    const state = createAdventureGameState({
      seed: "preset-timed-loss",
      customMap: NEAR_SLOT,
      customMapPreset: {
        timedEvents: [
          { round: 3, effect: { kind: "resources", gold: -5, buildingMaterials: 0, valuables: 0 } }
        ]
      }
    });
    // p1 holds plenty; p2 is short (1 gold) — the FLOOR control.
    state.players.p1.resources.gold = 20;
    state.players.p2.resources.gold = 1;

    state.round = 3;
    applyCustomMapTimedEvents(state);

    expect(state.players.p1.resources.gold).toBe(15); // 20 − 5
    expect(state.players.p2.resources.gold).toBe(0); // 1 − 5 floored at 0, never negative

    // Feed line says the players LOSE, not gain.
    expect(
      state.eventLog.some(
        (e) =>
          e.type === "MAP_PRESET_TRIGGERED" && e.round === 3 && e.message.includes("loses 5 gold")
      )
    ).toBe(true);
    // The ACTUAL removal is recorded — p2 only lost its lone gold, not the full 5.
    const p2Spent = state.eventLog.find((e) => e.type === "RESOURCES_SPENT" && e.playerId === "p2");
    expect(p2Spent?.type === "RESOURCES_SPENT" ? p2Spent.cost.gold : undefined).toBe(1);
  });

  it("sanitizeCustomMapPreset keeps freer timed-effect kinds and clamps amounts", async () => {
    const { sanitizeCustomMapPreset } = await import("./map-preset");
    const cleaned = sanitizeCustomMapPreset({
      timedEvents: [
        { round: 99, effect: { kind: "movement", amount: 99 } }, // round→30, amount→5
        { round: "nope", effect: { kind: "morale", amount: 1 } }, // non-number round dropped
        { round: 5, effect: { kind: "treasure_roll", count: 0 } }, // count clamps to 1
        { round: 5, effect: { kind: "resource_roll", count: 2 } },
        {
          round: 6,
          effect: {
            kind: "choice",
            prompt: "  Pick a reward  ",
            options: [
              { kind: "resources", gold: 0, buildingMaterials: 2, valuables: 0 },
              { kind: "morale", amount: 1 },
              { kind: "bogus" }
            ]
          }
        },
        { round: 7, effect: { kind: "note", text: "  Boss wave  " } },
        { round: 8, effect: { kind: "bogus" } } // unknown kind dropped
      ]
    });
    expect(cleaned?.timedEvents).toEqual([
      { round: 5, effect: { kind: "treasure_roll", count: 1 } },
      { round: 5, effect: { kind: "resource_roll", count: 2 } },
      {
        round: 6,
        effect: {
          kind: "choice",
          prompt: "Pick a reward",
          options: [
            { kind: "resources", gold: 0, buildingMaterials: 2, valuables: 0 },
            { kind: "morale", amount: 1 }
          ]
        }
      },
      { round: 7, effect: { kind: "note", text: "Boss wave" } },
      { round: 30, effect: { kind: "movement", amount: 5 } }
    ]);
  });

  it("a timed STORY event fires STORY_SCENE_TRIGGERED on its round (table-wide), with a wrong-round CONTROL", () => {
    const sceneId = STORY_SCENE_IDS[0];
    const build = () =>
      createAdventureGameState({
        seed: "preset-timed-story",
        customMap: NEAR_SLOT,
        customMapPreset: { timedEvents: [{ round: 3, effect: { kind: "story", sceneId } }] }
      });

    // CONTROL: nothing fires on the wrong round.
    const early = build();
    early.round = 2;
    applyCustomMapTimedEvents(early);
    expect(early.eventLog.some((e) => e.type === "STORY_SCENE_TRIGGERED")).toBe(false);

    // The configured round fires exactly one table-wide scene — an eliminated
    // seat is a no-op for a story event (it touches no player/hero state).
    const state = build();
    state.players.p2.eliminated = true;
    state.round = 3;
    applyCustomMapTimedEvents(state);
    const fired = state.eventLog.filter((e) => e.type === "STORY_SCENE_TRIGGERED");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ type: "STORY_SCENE_TRIGGERED", round: 3, sceneId });
  });

  it("sanitizeCustomMapPreset keeps a valid story scene and drops an unknown sceneId", async () => {
    const { sanitizeCustomMapPreset } = await import("./map-preset");
    const cleaned = sanitizeCustomMapPreset({
      timedEvents: [
        { round: 2, effect: { kind: "story", sceneId: STORY_SCENE_IDS[0] } },
        { round: 4, effect: { kind: "story", sceneId: "story.does.not.exist" } }, // unknown → dropped
        { round: 5, effect: { kind: "story" } } // no sceneId → dropped
      ]
    });
    expect(cleaned?.timedEvents).toEqual([
      { round: 2, effect: { kind: "story", sceneId: STORY_SCENE_IDS[0] } }
    ]);
  });

  it("sanitizeCustomMapPreset cleans a clear_tile_cubes effect (groups deduped/filtered, flag coerced)", async () => {
    const { sanitizeCustomMapPreset } = await import("./map-preset");
    const cleaned = sanitizeCustomMapPreset({
      timedEvents: [
        {
          round: 4,
          effect: {
            kind: "clear_tile_cubes",
            groups: ["far", "far", "bogus", "subterranean"], // dedupe + drop invalid
            excludeSettlementTiles: "yes" // non-boolean coerced away
          }
        },
        // No valid group survives → the whole event is dropped.
        { round: 5, effect: { kind: "clear_tile_cubes", groups: ["nonsense"] } },
        {
          round: 6,
          effect: { kind: "clear_tile_cubes", groups: ["center"], excludeSettlementTiles: true }
        }
      ]
    });
    expect(cleaned?.timedEvents).toEqual([
      { round: 4, effect: { kind: "clear_tile_cubes", groups: ["far", "subterranean"] } },
      {
        round: 6,
        effect: { kind: "clear_tile_cubes", groups: ["center"], excludeSettlementTiles: true }
      }
    ]);

    // LEGACY CONTROL: a preset without the new kind is byte-identical after sanitize.
    const legacy = sanitizeCustomMapPreset({
      timedEvents: [{ round: 2, effect: { kind: "clear_visitable_cubes", locations: ["windmill"] } }]
    });
    expect(legacy?.timedEvents).toEqual([
      { round: 2, effect: { kind: "clear_visitable_cubes", locations: ["windmill"] } }
    ]);
  });

  it("sanitizeCustomMapPreset clamps negative resource losses, the repeat interval, and experience", async () => {
    const { sanitizeCustomMapPreset } = await import("./map-preset");
    const cleaned = sanitizeCustomMapPreset({
      timedEvents: [
        // Positive legacy entry — unchanged (byte-identical).
        { round: 2, effect: { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 } },
        // −999 gold clamps to the −50 loss floor.
        { round: 3, effect: { kind: "resources", gold: -999, buildingMaterials: 0, valuables: 0 } },
        // repeatEveryRounds 99 clamps to 10.
        { round: 4, repeatEveryRounds: 99, effect: { kind: "morale", amount: 1 } },
        // repeatEveryRounds 1 is DROPPED (below the 2 minimum → one-shot).
        { round: 5, repeatEveryRounds: 1, effect: { kind: "movement", amount: 1 } },
        // a non-int repeat is DROPPED.
        { round: 6, repeatEveryRounds: "weekly", effect: { kind: "movement", amount: 1 } },
        // experience clamps to 1..5.
        { round: 7, effect: { kind: "experience", amount: 99 } },
        // an all-zero resources loss/gain is dropped entirely.
        { round: 8, effect: { kind: "resources", gold: 0, buildingMaterials: 0, valuables: 0 } }
      ]
    } as unknown);
    expect(cleaned?.timedEvents).toEqual([
      { round: 2, effect: { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 } },
      { round: 3, effect: { kind: "resources", gold: -50, buildingMaterials: 0, valuables: 0 } },
      { round: 4, repeatEveryRounds: 10, effect: { kind: "morale", amount: 1 } },
      { round: 5, effect: { kind: "movement", amount: 1 } },
      { round: 6, effect: { kind: "movement", amount: 1 } },
      { round: 7, effect: { kind: "experience", amount: 5 } }
    ]);
  });

  it("a Search starting bonus opens a REAL shared-deck search for each player", () => {
    const state = createAdventureGameState({
      seed: "preset-search-bonus",
      customMap: NEAR_SLOT,
      customMapPreset: { startingBonuses: [{ kind: "search", deck: "spells", count: 2 }] }
    });
    // The first player's REAL search opens immediately, before the game-order
    // roll; the second player's bonus remains queued behind it.
    const queued = state.adventure!.rewardQueue.filter(
      (reward) =>
        (reward.kind === "visit-steps" &&
          reward.steps.some((step) => step.type === "SEARCH_SHARED_DECK" && step.deckId === "spells")) ||
        (reward.kind === "shared-deck-search" && reward.deckId === "spells")
    );
    expect(state.pendingChoice?.playerId).toBe("p1");
    expect(new Set(queued.map((reward) => reward.playerId))).toEqual(new Set(["p2"]));
    expect(state.adventure?.firstPlayerRoll).toBeFalsy();

    // It is the real deck-search choice (the same pipeline every Search uses),
    // not a decorative setup marker.
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected an OPTION_CHOICE");
    }
    expect(choice.context).toBe("deck-search-mode");
    expect(choice.deckSearchMode).toMatchObject({ deckId: "spells", count: 2 });

    // CONTROL: without the preset no search reward is queued at setup.
    const control = createAdventureGameState({ seed: "preset-search-bonus", customMap: NEAR_SLOT });
    expect(
      control.adventure!.rewardQueue.some(
        (reward) =>
          reward.kind === "visit-steps" &&
          reward.steps.some((step) => step.type === "SEARCH_SHARED_DECK")
      )
    ).toBe(false);
  });

  it("a morale starting bonus moves the morale token — and undead factions still ignore it", () => {
    const state = createAdventureGameState({
      seed: "preset-morale-bonus",
      customMap: NEAR_SLOT,
      customMapPreset: { startingBonuses: [{ kind: "morale", amount: 1 }] }
    });
    // Default seats: p1 Castle, p2 Necropolis. The bonus routes through
    // changeMorale, so Necropolis's ignoresMorale rule still applies — the
    // undead seat is the built-in control that this is the REAL morale path.
    expect(state.players.p1.morale).toBe(1);
    expect(state.players.p2.morale).toBe(0);

    const control = createAdventureGameState({ seed: "preset-morale-bonus", customMap: NEAR_SLOT });
    expect(control.players.p1.morale).toBe(0);
  });
});

describe("map designer — \"one of these tiles\" random tile choice", () => {
  const farTileIds = Object.keys(allTileDefinitions).filter(
    (id) => allTileDefinitions[id].group === "far"
  );

  it("places a face-up slot as one of the listed tiles, with its fields materialized", () => {
    const choices = farTileIds.slice(0, 3);
    const state = createAdventureGameState({
      seed: "one-of-faceup",
      customMap: [{ row: 11, col: 2, group: "far", faceDown: false, oneOfTileDefIds: choices }]
    });
    const placed = Object.values(state.adventure!.tiles).find(
      (tile) => tile.group === "far" && !tile.faceDown
    );
    expect(placed, "the one-of face-up tile was placed").toBeDefined();
    expect(placed!.faceDown).toBe(false);
    // The placed tile is ONE of the listed candidates (never something else).
    expect(choices).toContain(placed!.tileDefId);
    // Face-up: all seven fields materialize from the start (a real placed tile).
    expect(
      Object.values(state.adventure!.fields).filter((field) => field.tileInstanceId === placed!.id)
    ).toHaveLength(7);
  });

  it("is deterministic by seed and varies across seeds (a real random pick)", () => {
    const choices = farTileIds.slice(0, 4);
    const pick = (seed: string): string | undefined =>
      Object.values(
        createAdventureGameState({
          seed,
          customMap: [{ row: 11, col: 2, group: "far", faceDown: false, oneOfTileDefIds: choices }]
        }).adventure!.tiles
      ).find((tile) => tile.group === "far" && !tile.faceDown)?.tileDefId;

    // Same seed → same pick.
    expect(pick("one-of-detA")).toBe(pick("one-of-detA"));
    // Across many seeds the pick genuinely varies (not pinned to one tile).
    const seen = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => pick(`one-of-var-${s}`))
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("an exact tileDefId always overrides the list (pin wins)", () => {
    const choices = farTileIds.slice(0, 3);
    const exact = farTileIds[5] ?? farTileIds[0];
    const state = createAdventureGameState({
      seed: "one-of-exact-wins",
      customMap: [
        { row: 11, col: 2, group: "far", faceDown: false, tileDefId: exact, oneOfTileDefIds: choices }
      ]
    });
    const placed = Object.values(state.adventure!.tiles).find(
      (tile) => tile.group === "far" && !tile.faceDown
    );
    expect(placed!.tileDefId).toBe(exact);
  });

  it("resolves a FACE-DOWN one-of slot to a hidden pick from the list", () => {
    const choices = farTileIds.slice(0, 2);
    const state = createAdventureGameState({
      seed: "one-of-facedown",
      customMap: [{ row: 11, col: 2, group: "far", faceDown: true, oneOfTileDefIds: choices }]
    });
    const placed = Object.values(state.adventure!.tiles).find(
      (tile) => tile.group === "far" && tile.faceDown
    );
    expect(placed, "the one-of face-down tile was placed").toBeDefined();
    expect(choices).toContain(placed!.tileDefId);
    // Still face-down: no fields until discovery.
    expect(
      Object.values(state.adventure!.fields).filter((field) => field.tileInstanceId === placed!.id)
    ).toHaveLength(0);
  });

  it("a FACE-DOWN one-of list of Obelisk-bearing Far tiles places an Obelisk despite the Far-pool strip (the user's ask); reveals + redacts normally", () => {
    // The user's exact scenario: Obelisks are stripped from the random Far pool
    // (a Ⅱ–Ⅲ house rule — see far-pool-no-obelisk.test.ts), so the ONLY way to
    // land an Obelisk on a Far slot is an explicit pin / one-of list — and it
    // must work FACE-DOWN (a secret "random tile with an obelisk").
    const obeliskFar = Object.values(allTileDefinitions)
      .filter((def) => def.group === "far" && def.fields.some((field) => field.location === "obelisk"))
      .map((def) => def.id);
    // CONTROL: the data genuinely ships a far+obelisk tile (Factory &F1) that the
    // pool strips — otherwise this whole scenario would be vacuous.
    expect(obeliskFar.length, "data has ≥1 far tile with an Obelisk").toBeGreaterThan(0);
    expect(obeliskFar).toContain("&F1");

    const state = createAdventureGameState({
      seed: "one-of-secret-obelisk",
      victoryMode: "conquest", // never grail, so nothing FORCES an obelisk anywhere
      customMap: [
        { row: 9, col: 4, group: "far", faceDown: true, oneOfTileDefIds: obeliskFar },
        // CONTROL: a pure-random Far slot can NEVER draw an Obelisk (the pool
        // strips them). So an Obelisk on the one-of slot proves the LIST (an
        // explicit pin) bypassed the strip — not a lucky pool draw.
        { row: 11, col: 2, group: "far", faceDown: true }
      ]
    });

    const slot = Object.values(state.adventure!.tiles).find(
      (tile) => tile.centerRow === 9 && tile.centerCol === 4
    )!;
    expect(slot, "the secret one-of slot was placed").toBeDefined();
    expect(slot.faceDown).toBe(true);
    expect(obeliskFar).toContain(slot.tileDefId);
    expect(
      allTileDefinitions[slot.tileDefId].fields.some((field) => field.location === "obelisk"),
      "the placed FACE-DOWN one-of tile carries an Obelisk (impossible from the stripped pool)"
    ).toBe(true);
    // Still face-down: no fields until discovery.
    expect(
      Object.values(state.adventure!.fields).filter((field) => field.tileInstanceId === slot.id)
    ).toHaveLength(0);

    // CONTROL: the pure-random Far slot never carries an Obelisk.
    const randomFar = Object.values(state.adventure!.tiles).find(
      (tile) => tile.centerRow === 11 && tile.centerCol === 2
    )!;
    expect(
      allTileDefinitions[randomFar.tileDefId]?.fields.some((field) => field.location === "obelisk") ?? false,
      "a plain random Far slot never draws an Obelisk"
    ).toBe(false);

    // Player views redact the resolved id while face-down (only the band back
    // shows) — exactly like an exact secret pin.
    const view = getPlayerView(state, "p1");
    const viewed = view.adventure!.tiles[slot.id];
    expect(viewed.faceDown).toBe(true);
    expect(viewed.tileDefId).toBe("hidden");

    // Reveal on discovery → the Obelisk field materializes through the normal path.
    slot.faceDown = false;
    materializeTileFields(state.adventure!, slot);
    const fields = Object.values(state.adventure!.fields).filter((field) => field.tileInstanceId === slot.id);
    expect(fields).toHaveLength(7);
    expect(fields.some((field) => field.location === "obelisk")).toBe(true);
  });

  it("validator accepts a valid FACE-DOWN one-of list (the secret variant)", () => {
    const scenario = getScenario("skirmish");
    const choices = farTileIds.slice(0, 3);
    const { accepted, problems } = validateCustomMapPlan(
      [{ row: 9, col: 4, group: "far", faceDown: true, oneOfTileDefIds: choices }],
      scenario
    );
    expect(problems, "a valid face-down list raises no problems").toHaveLength(0);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].faceDown).toBe(true);
    expect(accepted[0].oneOfTileDefIds).toEqual(choices);
    // CONTROL: an unknown id in the face-down list is still rejected.
    expect(
      validateCustomMapPlan(
        [{ row: 9, col: 4, group: "far", faceDown: true, oneOfTileDefIds: ["NOPE_TILE"] }],
        scenario
      ).accepted
    ).toHaveLength(0);
  });

  it("validator accepts a valid face-up list and rejects empty / unknown / wrong-group / starting", () => {
    const scenario = getScenario("skirmish");
    const nearId = Object.keys(allTileDefinitions).find((id) => allTileDefinitions[id].group === "near")!;
    const { accepted } = validateCustomMapPlan(
      [{ row: 9, col: 4, group: "far", faceDown: false, oneOfTileDefIds: farTileIds.slice(0, 2) }],
      scenario
    );
    expect(accepted, "a valid face-up list satisfies the face-up requirement").toHaveLength(1);
    expect(accepted[0].oneOfTileDefIds).toEqual(farTileIds.slice(0, 2));

    // Empty list on a face-up slot → dropped (and no valid tile either).
    const empty = validateCustomMapPlan(
      [{ row: 9, col: 4, group: "far", faceDown: false, oneOfTileDefIds: [] }],
      scenario
    );
    expect(empty.accepted).toHaveLength(0);
    expect(empty.problems.length).toBeGreaterThan(0);

    // Unknown tile id → dropped.
    expect(
      validateCustomMapPlan(
        [{ row: 9, col: 4, group: "far", faceDown: true, oneOfTileDefIds: ["NOPE_TILE"] }],
        scenario
      ).accepted
    ).toHaveLength(0);

    // A tile from the wrong pool (near tile in a far slot) → dropped.
    expect(
      validateCustomMapPlan(
        [{ row: 9, col: 4, group: "far", faceDown: true, oneOfTileDefIds: [nearId] }],
        scenario
      ).accepted
    ).toHaveLength(0);
  });
});
