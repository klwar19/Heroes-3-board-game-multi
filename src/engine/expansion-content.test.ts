import { describe, expect, it } from "vitest";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import { expansionTileDefinitions } from "@/data/map/expansion-tiles";
import { allTileDefinitions, ALL_TILE_CONTENT, DEFAULT_TILE_CONTENT, tilePoolIds } from "@/data/map/tiles";
import { locationDefinitions } from "@/data/map/locations";
import { getTileBorderSegments } from "@/data/map/borders";
import {
  classifyHeroStep,
  createAdventureGameState,
  getLegalActions,
  applyAction,
  type GameState,
  type GameAction
} from "./index";
import { hillFortCost, observatoryDiscoverTargets, removableHandCards } from "./adventure-reducer";
import { beginFieldVisit } from "./adventure";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

describe("expansion tile data", () => {
  it("defines structurally sound tiles for every entry", () => {
    for (const [key, tile] of Object.entries(allTileDefinitions)) {
      expect(tile.fields, `${key} field count`).toHaveLength(7);
      expect(tile.outerImpassable, `${key} border arity`).toHaveLength(6);
      expect(tile.content, `${key} content`).toBeTruthy();
      for (const field of tile.fields) {
        expect(locationDefinitions[field.location], `${key} location ${field.location}`).toBeDefined();
        if (field.location === "mine") {
          expect(field.resource, `${key} mine resource`).toBeTruthy();
          expect(field.amount, `${key} mine amount`).toBeGreaterThan(0);
        }
        if (field.location === "settlement") {
          expect(field.faction, `${key} settlement faction`).toBeTruthy();
        }
      }
      // Border segments derive without throwing for every tile.
      expect(getTileBorderSegments(tile).length).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the boxed sets and expansions disjoint and complete", () => {
    const coreIds = new Set(Object.keys(coreTileDefinitions));
    for (const id of Object.keys(expansionTileDefinitions)) {
      expect(coreIds.has(id), `${id} duplicated`).toBe(false);
    }
    // 41 boxed tiles + 66 expansion tiles = every tile the wiki documents.
    expect(Object.keys(allTileDefinitions)).toHaveLength(107);
  });

  it("keeps the default pools exactly as before the expansion data landed", () => {
    expect(new Set(tilePoolIds("far", DEFAULT_TILE_CONTENT))).toEqual(
      new Set(Object.values(coreTileDefinitions).filter((tile) => tile.group === "far").map((tile) => tile.id))
    );
    expect(new Set(tilePoolIds("near", DEFAULT_TILE_CONTENT))).toEqual(
      new Set(Object.values(coreTileDefinitions).filter((tile) => tile.group === "near").map((tile) => tile.id))
    );
    // C5 (Random Town) stays out of the default center pool.
    expect(new Set(tilePoolIds("center", DEFAULT_TILE_CONTENT))).toEqual(new Set(["C1", "C2", "C3", "C4"]));
  });

  it("excludes Random Town tiles from pools even with everything enabled", () => {
    const center = tilePoolIds("center", ALL_TILE_CONTENT);
    expect(center).not.toContain("C5");
    expect(center).not.toContain("#C3");
    expect(center).not.toContain("#C4");
    // Sea and subterranean tiles only come through their own groups.
    expect(tilePoolIds("far", ALL_TILE_CONTENT).every((id) => allTileDefinitions[id].group === "far")).toBe(true);
    expect(tilePoolIds("sea", ALL_TILE_CONTENT).length).toBeGreaterThan(0);
  });

  it("derives sea-tile groups and water terrain from the wiki data", () => {
    for (const id of ["#N8", "#N9", "#N10", "#N11", "#C4", "#C5", "W1", "W7"]) {
      const tile = allTileDefinitions[id];
      expect(tile, `${id} defined`).toBeDefined();
      expect(tile.group).toBe("sea");
      expect(tile.terrain).toBe("water");
    }
  });

  it("ships local art for every boxed tile and the covered expansions", () => {
    for (const tile of Object.values(coreTileDefinitions)) {
      expect(tile.assets?.tileImage).toBe(`/assets/board/tiles/${tile.id.toLowerCase()}.webp`);
    }
    const withArt = Object.values(allTileDefinitions).filter((tile) => tile.assets?.tileImage);
    expect(withArt).toHaveLength(98);
  });
});

describe("rulebook conformance fixes", () => {
  it("lets friendly heroes pass through enemies standing in a Sanctuary", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal" });
    const adventure = state.adventure;
    if (!adventure) {
      throw new Error("no adventure");
    }

    const sanctuaryField = Object.values(adventure.fields).find((field) => field.location === "sanctuary");
    // The skirmish layout reveals no sanctuary at setup; fabricate one.
    const anyField = sanctuaryField ?? Object.values(adventure.fields).find((field) => field.location === "empty_field");
    if (!anyField) {
      throw new Error("no field to test on");
    }
    anyField.location = "sanctuary";

    const heroes = Object.values(state.heroes);
    const p1Hero = heroes.find((hero) => hero.controllerId === "p1");
    const p2Hero = heroes.find((hero) => hero.controllerId === "p2");
    if (!p1Hero || !p2Hero) {
      throw new Error("missing heroes");
    }
    p2Hero.spaceId = anyField.spaceId;

    expect(classifyHeroStep(state, p1Hero, anyField.spaceId)).toBe("pass-only");
  });

  it("only lets the Observatory flip tiles whose flowers actually touch", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal" });
    const adventure = state.adventure;
    if (!adventure) {
      throw new Error("no adventure");
    }
    const anchor = Object.values(adventure.tiles).find((tile) => !tile.faceDown);
    if (!anchor) {
      throw new Error("no revealed tile");
    }
    // A face-down tile six columns away matched the old Manhattan check.
    adventure.tiles["test-far-away"] = {
      id: "test-far-away",
      tileDefId: "N1",
      centerRow: anchor.centerRow,
      centerCol: anchor.centerCol + 6,
      rotation: 0,
      faceDown: true
    };
    const targets = observatoryDiscoverTargets(adventure, anchor);
    expect(targets.map((tile) => tile.id)).not.toContain("test-far-away");
  });

  it("offers the Trading Post remove-a-card option and pays 1 valuables", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal" });
    const adventure = state.adventure;
    const player = state.players.p1;
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    if (!adventure || !player || !hero) {
      throw new Error("setup failed");
    }

    player.hand = ["spell.magic_arrow", "stat.attack"];
    const field = Object.values(adventure.fields)[0];
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [{ type: "TRADING_POST" }]
    };

    const removeAction = getLegalActions(state, "p1").find((legal) => legal.label.startsWith("Remove "));
    expect(removeAction).toBeDefined();

    const before = player.resources.valuables;
    const next = apply(state, removeAction!.action);
    expect(next.players.p1.resources.valuables).toBe(before + 1);
    expect(next.players.p1.hand).toHaveLength(1);
    expect(next.players.p1.removed).toHaveLength(1);
    expect(next.adventure?.pendingVisit).toBeNull();
  });

  it("resolves the Faerie Ring by searching the removed card's own deck", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal" });
    const adventure = state.adventure;
    const player = state.players.p1;
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    if (!adventure || !player || !hero) {
      throw new Error("setup failed");
    }

    player.hand = ["spell.magic_arrow", "stat.attack"];
    const field = Object.values(adventure.fields)[0];
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [
        {
          type: "REMOVE_HAND_CARD",
          prompt: "Faerie Ring: remove a card, then search its deck",
          filter: "removable",
          then: "search-same-deck"
        }
      ]
    };

    // Statistic cards are not removable here - only the spell qualifies.
    expect(removableHandCards(state, "p1", "removable").map((entry) => entry.cardId)).toEqual([
      "spell.magic_arrow"
    ]);

    const actions = getLegalActions(state, "p1").filter((legal) => legal.label.startsWith("Remove "));
    expect(actions).toHaveLength(1);
    const next = apply(state, actions[0].action);
    expect(next.players.p1.removed).toEqual(["spell.magic_arrow"]);
    // The follow-up queued a spells-deck search (it may already have been
    // pumped into the pending deck-search choice).
    const queued = next.adventure?.rewardQueue.some(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells"
    );
    const choosing = next.pendingChoice?.type === "DECK_SEARCH";
    expect(queued || choosing).toBe(true);
  });

  it("lets multiple players flag an Obelisk while keeping the first cube", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal" });
    const adventure = state.adventure;
    if (!adventure) {
      throw new Error("no adventure");
    }
    const field = Object.values(adventure.fields)[0];
    field.location = "obelisk";
    field.difficulty = undefined;

    const heroes = Object.values(state.heroes);
    const p1Hero = heroes.find((hero) => hero.controllerId === "p1");
    const p2Hero = heroes.find((hero) => hero.controllerId === "p2");
    if (!p1Hero || !p2Hero) {
      throw new Error("missing heroes");
    }

    // Visits resolve through the engine helper both times.
    state.adventure!.pendingVisit = null;
    beginFieldVisit(state, p1Hero.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");
    beginFieldVisit(state, p2Hero.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");
    expect(field.extraFlagOwnerIds).toEqual(["p2"]);
  });

  it("discounts Hill Fort reinforcement by 3 gold to a minimum of zero", () => {
    expect(hillFortCost({ gold: 5, valuables: 1 })).toEqual({ gold: 2, valuables: 1 });
    expect(hillFortCost({ gold: 2 })).toEqual({});
    expect(hillFortCost({ buildingMaterials: 2 })).toEqual({ buildingMaterials: 2 });
  });
});
