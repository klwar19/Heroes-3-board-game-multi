import { describe, expect, it } from "vitest";
import { drawAstrologersCard } from "./adventure";
import { createAdventureGameState, type GameState } from "./index";

const FRIENDLY_BEAVER = "astrologers.friendly_beaver";

function makeGame(ruleset: "legacy" | "binh"): GameState {
  return createAdventureGameState({
    ruleset,
    seed: `friendly-beaver-${ruleset}`,
    difficulty: "normal",
    startingBuildings: [],
    rollFirstPlayer: false,
    events: false
  });
}

describe("Friendly Beaver", () => {
  it("is dealt in Legacy and banned only by the BINH house rules", () => {
    const legacy = makeGame("legacy");
    const binh = makeGame("binh");

    expect(legacy.decks.astrologers.drawPile).toContain(FRIENDLY_BEAVER);
    expect(binh.decks.astrologers.drawPile).not.toContain(FRIENDLY_BEAVER);
  });

  it("removes every Black Cube from every map field and changes nothing else", () => {
    const state = makeGame("legacy");
    state.round = 4;

    const fields = Object.values(state.adventure!.fields);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      field.blackCube = true;
    }

    // Colored faction cubes are separate map state and must survive the card.
    fields[0].flagOwnerId = "p1";
    fields[0].extraFlagOwnerIds = ["p2"];
    fields[0].everFlagged = true;
    const before = structuredClone(state.adventure!.fields);

    state.decks.astrologers.drawPile = [FRIENDLY_BEAVER];
    state.decks.astrologers.discardPile = [];
    drawAstrologersCard(state);

    expect(state.adventure!.astrologers!.activeCardId).toBe(FRIENDLY_BEAVER);
    for (const [spaceId, fieldBefore] of Object.entries(before)) {
      expect(state.adventure!.fields[spaceId]).toEqual({ ...fieldBefore, blackCube: false });
    }
  });

  it("discards and redraws Friendly Beaver without clearing cubes on the first Astrologers round", () => {
    const state = makeGame("legacy");
    state.round = 2;
    for (const field of Object.values(state.adventure!.fields)) {
      field.blackCube = true;
    }
    state.decks.astrologers.drawPile = ["astrologers.gold_dragon", FRIENDLY_BEAVER];
    state.decks.astrologers.discardPile = [];

    drawAstrologersCard(state);

    expect(state.adventure!.astrologers!.activeCardId).toBe("astrologers.gold_dragon");
    expect(state.decks.astrologers.discardPile).toContain(FRIENDLY_BEAVER);
    expect(Object.values(state.adventure!.fields).every((field) => field.blackCube)).toBe(true);
  });
});
