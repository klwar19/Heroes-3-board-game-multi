import { describe, expect, it } from "vitest";
import {
  applyCustomMapTimedEvents,
  isFieldGuarded,
  materializeTileFields,
  processPendingVisit,
  startAdventureRound
} from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { createAdventureGameState, validateCustomMapPlan } from "./adventure-setup";
import { getScenario } from "./adventure-setup";
import { applyAction, createAdventureLobbyState } from "./index";
import { getPlayerView } from "./player-view";
import { allTileDefinitions } from "@/data/map/tiles";

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
      customMapPreset: { difficulty: "easy", farTileOpening: false, farTilesPerPlayer: 0 }
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

  it("sanitizeCustomMapPreset keeps freer timed-effect kinds and clamps amounts", async () => {
    const { sanitizeCustomMapPreset } = await import("./map-preset");
    const cleaned = sanitizeCustomMapPreset({
      timedEvents: [
        { round: 99, effect: { kind: "movement", amount: 99 } }, // round→30, amount→5
        { round: "nope", effect: { kind: "morale", amount: 1 } }, // non-number round dropped
        { round: 5, effect: { kind: "treasure_roll", count: 0 } }, // count clamps to 1
        { round: 5, effect: { kind: "resource_roll", count: 2 } },
        { round: 7, effect: { kind: "note", text: "  Boss wave  " } },
        { round: 8, effect: { kind: "bogus" } } // unknown kind dropped
      ]
    });
    expect(cleaned?.timedEvents).toEqual([
      { round: 5, effect: { kind: "treasure_roll", count: 1 } },
      { round: 5, effect: { kind: "resource_roll", count: 2 } },
      { round: 7, effect: { kind: "note", text: "Boss wave" } },
      { round: 30, effect: { kind: "movement", amount: 5 } }
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

  it("a Search starting bonus opens a REAL shared-deck search for each player", () => {
    const state = createAdventureGameState({
      seed: "preset-search-bonus",
      customMap: NEAR_SLOT,
      customMapPreset: { startingBonuses: [{ kind: "search", deck: "spells", count: 2 }] }
    });
    // One queued search per player…
    const queued = state.adventure!.rewardQueue.filter(
      (reward) =>
        reward.kind === "visit-steps" &&
        reward.steps.some((step) => step.type === "SEARCH_SHARED_DECK" && step.deckId === "spells")
    );
    expect(new Set(queued.map((reward) => reward.playerId))).toEqual(new Set(["p1", "p2"]));

    // …and pumping past the opening home-tile rotation opens the real
    // deck-search choice (the same pipeline every Search reward uses).
    state.adventure!.pendingTileChoice = null;
    pumpAdventureQueues(state);
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
