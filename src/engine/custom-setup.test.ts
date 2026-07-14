import { describe, expect, it } from "vitest";
import { materializeTileFields, processPendingVisit } from "./adventure";
import { createAdventureGameState, validateCustomMapPlan } from "./adventure-setup";
import { getScenario } from "./adventure-setup";
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
