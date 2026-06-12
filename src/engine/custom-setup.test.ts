import { describe, expect, it } from "vitest";
import { processPendingVisit } from "./adventure";
import { createAdventureGameState, validateCustomMapPlan } from "./adventure-setup";
import { getScenario } from "./adventure-setup";
import { getPlayerView } from "./player-view";

describe("custom starting army", () => {
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
        // Scenario layout slots are on the lattice and touch the starts.
        { row: 5, col: 3, group: "near", faceDown: true },
        { row: 5, col: 6, group: "far", faceDown: false, tileDefId: "F1", rotation: 2 }
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

  it("rejects designed tiles that do not touch the board", () => {
    const scenario = getScenario("skirmish");
    const { accepted, problems } = validateCustomMapPlan(
      [
        { row: 5, col: 3, group: "near", faceDown: true },
        { row: 20, col: 20, group: "near", faceDown: true }
      ],
      scenario
    );
    expect(accepted).toHaveLength(1);
    expect(problems[0]).toContain("must touch");
  });

  it("rejects overlapping and duplicate positions", () => {
    const scenario = getScenario("skirmish");
    const overlapping = validateCustomMapPlan([{ row: 8, col: 3, group: "near", faceDown: true }], scenario);
    expect(overlapping.accepted).toHaveLength(0);
    expect(overlapping.problems.length).toBeGreaterThan(0);

    const duplicate = validateCustomMapPlan(
      [
        { row: 5, col: 3, group: "near", faceDown: true },
        { row: 5, col: 3, group: "center", faceDown: true }
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
