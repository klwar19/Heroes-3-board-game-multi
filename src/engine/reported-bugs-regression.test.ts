import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { expansionTileDefinitions } from "@/data/map/expansion-tiles";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import { beginFieldVisit, classifyHeroStep, getMainHero, isFieldGuarded } from "./adventure";
import { createAdventureGameState } from "./index";
import type { GameState, MapFieldState, MapTileState } from "./state";

function makeGame(): GameState {
  return createAdventureGameState({ seed: "reported-bugs-regression", difficulty: "normal", rollFirstPlayer: false });
}

function addField(state: GameState, location: string, difficulty?: number): MapFieldState {
  const field: MapFieldState = {
    spaceId: "reported-bug-field",
    tileInstanceId: "reported-bug-tile",
    slot: 0,
    location,
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return field;
}

function addTile(state: GameState, group: MapTileState["group"]): void {
  state.adventure!.tiles["reported-bug-tile"] = {
    id: "reported-bug-tile",
    tileDefId: "reported-bug",
    centerRow: 0,
    centerCol: 0,
    rotation: 0,
    faceDown: false,
    group
  };
}

function treasureRollCount(
  state: GameState,
  group: MapTileState["group"],
  treasureDice?: 1 | 2
): number | undefined {
  addTile(state, group);
  const field = addField(state, "treasure_symbol");
  field.treasureDice = treasureDice;
  beginFieldVisit(state, getMainHero(state, "p1")!.id, field.spaceId, false);
  const roll = [...state.eventLog].reverse().find(
    (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "treasure"
  );
  return roll?.type === "ADVENTURE_DICE_ROLLED" ? roll.treasureRolls?.length : undefined;
}

describe("reported map and unit-data regressions", () => {
  it("marks the #N1 Tree of Knowledge as a level-4 guarded field", () => {
    const tree = expansionTileDefinitions["#N1"].fields.find((field) => field.location === "tree_of_knowledge");
    expect(tree?.difficulty).toBe(4);

    const state = makeGame();
    const field = addField(state, "tree_of_knowledge", tree?.difficulty);
    const hero = getMainHero(state, "p1")!;
    expect(isFieldGuarded(field)).toBe(true);
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("stop");
  });

  it("keeps F2's Factory Grave at level 2", () => {
    const grave = expansionTileDefinitions["&F2"].fields.find((field) => field.location === "factory_grave");
    expect(grave?.difficulty).toBe(2);
  });

  it("uses the dice count printed on each Treasure field, never its tile group", () => {
    expect(treasureRollCount(makeGame(), "far", 2)).toBe(2);
    expect(treasureRollCount(makeGame(), "far")).toBe(1);
    expect(treasureRollCount(makeGame(), "starting")).toBe(1);

    const f7Chest = coreTileDefinitions.F7.fields.find((field) => field.location === "treasure_symbol");
    const f14Chest = coreTileDefinitions.F14.fields.find((field) => field.location === "treasure_symbol");
    expect(f7Chest?.treasureDice).toBe(2);
    expect(f14Chest?.treasureDice).toBeUndefined();
  });

  it("maps &N1's question-mark cabin to a Trading Post, not a Treasure chest", () => {
    expect(expansionTileDefinitions["&N1"].fields[4]?.location).toBe("trading_post");
    expect(expansionTileDefinitions["&N1"].fields.some((field) => field.location === "treasure_symbol")).toBe(false);
  });

  it("uses initiative 6 for Few Minotaurs and 7 for Neutral Minotaurs", () => {
    expect(coreUnitDefinitions["dungeon.minotaurs"].few?.initiative).toBe(6);
    expect(coreUnitDefinitions["neutral.minotaurs"].neutral?.initiative).toBe(7);
  });
});
