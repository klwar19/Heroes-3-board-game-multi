import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { createAdventureGameState, type GameState } from "./index";
import { materializeTileFields } from "./adventure";
import { grailDigMovementCost } from "./map-design-features";
import { sanitizeCustomMapPreset } from "./map-preset";
import { SUGGESTED_TEMPLE_OF_THE_SEA_AWARD, type CustomMapPreset, type MapFieldState, type MapTileState } from "./state";

/**
 * Map editor — MAP-WIDE Temple of the Sea options (per-tile values override
 * field by field) and the hidden Grail/Utopia package's own dig cost. Each
 * claim is asserted against a CONTROL where the rule's absence diverges.
 */

function game(seed: string): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
}

/** Materialize a printed sea tile carrying a Temple of the Sea, far from the map. */
function templeField(state: GameState, plan?: MapTileState["objectPlans"]): MapFieldState {
  const def = Object.values(allTileDefinitions).find((candidate) =>
    candidate.fields.some((field) => field.location === "temple_of_the_sea")
  );
  expect(def, "expected a printed tile with a Temple of the Sea").toBeTruthy();
  const tile: MapTileState = {
    id: "temple-probe",
    tileDefId: def!.id,
    centerRow: 60,
    centerCol: 60,
    rotation: 0,
    faceDown: false,
    group: "sea",
    ...(plan ? { objectPlans: plan } : {})
  };
  state.adventure!.tiles[tile.id] = tile;
  materializeTileFields(state.adventure!, tile);
  const field = Object.values(state.adventure!.fields).find(
    (candidate) => candidate.tileInstanceId === tile.id && candidate.location === "temple_of_the_sea"
  );
  expect(field).toBeTruthy();
  return field!;
}

describe("Temple of the Sea — map-wide options", () => {
  it("CONTROL: no preset ⇒ the printed Temple (no custom award, printed Ⅶ guard)", () => {
    const field = templeField(game("temple-printed"));
    expect(field.templeCustomAward).toBeUndefined();
    expect(field.designerReward).toBeUndefined();
    expect(field.difficulty).toBe(7);
  });

  it("the map-wide guard / award / VP apply to every Temple", () => {
    const state = game("temple-global");
    state.adventure!.mapPreset = {
      templesOfTheSea: { guard: { level: 4 }, reward: { gold: 20 }, vp: 3 }
    };
    const field = templeField(state);
    expect(field.templeCustomAward).toBe(true);
    expect(field.designerReward).toEqual({ gold: 20 });
    expect(field.designerRewardVp).toBe(3);
    expect(field.difficulty).toBe(4);
  });

  it("a per-tile value overrides field by field; unset per-tile values fall back to the map-wide ones", () => {
    const state = game("temple-override");
    state.adventure!.mapPreset = {
      templesOfTheSea: { guard: { level: 4 }, reward: { gold: 20 }, vp: 3 }
    };
    const field = templeField(state, { temple_of_the_sea: { vp: 5 } });
    expect(field.designerReward).toEqual({ gold: 20 }); // global award
    expect(field.designerRewardVp).toBe(5); // per-tile VP wins
    expect(field.difficulty).toBe(4); // global guard
  });

  it("the suggested award is a fill value only — the sanitizer keeps it when applied, nothing when absent", () => {
    const applied = sanitizeCustomMapPreset({
      templesOfTheSea: { reward: SUGGESTED_TEMPLE_OF_THE_SEA_AWARD.reward, vp: SUGGESTED_TEMPLE_OF_THE_SEA_AWARD.vp }
    } satisfies CustomMapPreset);
    expect(applied?.templesOfTheSea?.reward).toMatchObject({
      gold: 20,
      moraleOrAbilityEmpowerToken: true,
      searchArtifact: 5,
      searchSpell: 5,
      searchSpellTimes: 2
    });
    expect(applied?.templesOfTheSea?.vp).toBe(3);
    expect(sanitizeCustomMapPreset({ templesOfTheSea: {} })?.templesOfTheSea).toBeUndefined();
  });
});

describe("Hidden Grail/Utopia package — its own dig cost", () => {
  it("reads hiddenGrailDigCost 0 / 2 inside the package (absent = 1); the classic grailDigCost never leaks in", () => {
    const state = game("hidden-dig");
    state.adventure!.mapPreset = { objectives: { hiddenGrailUtopia: true, grailDigCost: 2 } };
    expect(grailDigMovementCost(state)).toBe(1);
    state.adventure!.mapPreset = { objectives: { hiddenGrailUtopia: true, hiddenGrailDigCost: 0 } };
    expect(grailDigMovementCost(state)).toBe(0);
    state.adventure!.mapPreset = { objectives: { hiddenGrailUtopia: true, hiddenGrailDigCost: 2 } };
    expect(grailDigMovementCost(state)).toBe(2);
    // CONTROL: outside the package the classic knob rules and the hidden one is ignored.
    state.adventure!.mapPreset = { objectives: { grailDigCost: 0, hiddenGrailDigCost: 2 } };
    expect(grailDigMovementCost(state)).toBe(0);
  });

  it("the sanitizer keeps hiddenGrailDigCost only with the hidden package on", () => {
    expect(
      sanitizeCustomMapPreset({ objectives: { hiddenGrailUtopia: true, hiddenGrailDigCost: 0 } })?.objectives?.hiddenGrailDigCost
    ).toBe(0);
    expect(
      sanitizeCustomMapPreset({ objectives: { grailDigCost: 1, hiddenGrailDigCost: 0 } })?.objectives?.hiddenGrailDigCost
    ).toBeUndefined();
  });
});
