/**
 * The Setup Hub's pure derivations. These are the honesty half of the four
 * boxes: the mode label, the "Default vs Customized" advanced badge, and the
 * heroes / map summary lines. Every case has a CONTROL that would flip if the
 * derivation lied (e.g. a map-owned change must NOT read as "Customized").
 */
import { describe, expect, it } from "vitest";
import { createAdventureLobbyState, DEFAULT_WOG_OPTIONS, HOUSE_RULES, scenarioDefinitions } from "@/engine";
import type { GameSetupOptions } from "@/engine";
import {
  advancedSettingsChanged,
  deriveActiveSetupMode,
  designedMapBlockers,
  designedMapInPlay,
  heroesSummary,
  mapSummary,
  MODE_PRESET_PAYLOADS,
  setupHubNavItems
} from "./setup-hub-summary";

/**
 * The options a REAL fresh lobby carries — the only thing the Setup Hub ever
 * renders. Note this is NOT `defaultGameSetupOptions(scenario)`: the lobby also
 * pre-builds the three universal core town cards (see the first case below).
 */
function freshOptions(): GameSetupOptions {
  return createAdventureLobbyState({ seed: "advanced-fresh" }).setupLobby!.options;
}

describe("deriveActiveSetupMode", () => {
  it("reads BINH by default and each preset branch off the options", () => {
    const binh = freshOptions();
    expect(deriveActiveSetupMode(binh)).toBe("binh");

    // Legacy = the rulebook ruleset without the tournament package.
    expect(deriveActiveSetupMode({ ...binh, ...MODE_PRESET_PAYLOADS.legacy })).toBe("legacy");

    // Tournament needs ALL THREE: every tournament rule, legacy ruleset, Hard.
    const tournament = { ...binh, ...MODE_PRESET_PAYLOADS.tournament };
    expect(deriveActiveSetupMode(tournament)).toBe("tournament");
    // CONTROL: the same package on Normal difficulty is plain Legacy, not
    // Tournament (the difficulty is part of the preset's identity).
    expect(deriveActiveSetupMode({ ...tournament, difficulty: "normal" })).toBe("legacy");

    // Custom wins over everything (it is a whole saved setup file).
    expect(deriveActiveSetupMode({ ...tournament, customMode: true })).toBe("custom");
  });

  it("makes tier-split Spell and Artifact decks the Tournament preset's only BINH house rule", () => {
    const tournamentRules = MODE_PRESET_PAYLOADS.tournament.houseRules;
    expect(tournamentRules?.["split-decks"]).toBe(true);
    for (const rule of HOUSE_RULES) {
      expect(tournamentRules?.[rule.id], rule.id).toBe(rule.id === "split-decks");
    }
  });
});

describe("advancedSettingsChanged", () => {
  it("reads Default on a REAL fresh lobby (its pre-built town cards are the baseline)", () => {
    // createAdventureLobbyState pre-builds Citadel / Mage Guild / Bronze
    // Dwelling when the scenario authors no startingBuildings — the baseline
    // must fold that in, or every untouched table would read "Customized".
    const lobby = createAdventureLobbyState({ seed: "advanced-default" }).setupLobby!.options;
    expect(lobby.startingBuildings).toEqual(["citadel", "mage_guild", "dwelling_bronze"]);
    expect(advancedSettingsChanged(lobby)).toEqual({ changed: false, label: "Default" });
    // …and dropping one of those pre-built cards IS a customization.
    expect(advancedSettingsChanged({ ...lobby, startingBuildings: ["citadel"] }).changed).toBe(true);
  });

  it("reads Default after applying any mode preset (each has its OWN baseline)", () => {
    const fresh = freshOptions();
    // Each preset has its OWN baseline — applying one is not "Customized".
    for (const mode of ["legacy", "binh", "tournament"] as const) {
      const applied = { ...fresh, ...MODE_PRESET_PAYLOADS[mode] };
      expect(advancedSettingsChanged(applied), mode).toEqual({ changed: false, label: "Default" });
    }
  });

  it("flips to Customized on an advanced-owned option (Event deck, a house rule, army)", () => {
    const fresh = freshOptions();
    expect(advancedSettingsChanged({ ...fresh, events: true }).changed).toBe(true);
    expect(advancedSettingsChanged({ ...fresh, houseRules: { "polish-wait": true } }).changed).toBe(true);
    expect(advancedSettingsChanged({ ...fresh, startingResources: { gold: 99, buildingMaterials: 0, valuables: 0 } }).changed).toBe(
      true
    );
    expect(advancedSettingsChanged({ ...fresh, victoryPoints: true }).changed).toBe(true);
    expect(advancedSettingsChanged({ ...fresh, parallelTurns: 3 }).changed).toBe(true);
  });

  it("CONTROL: a MAP-box or MODE-box change never reads as Customized", () => {
    const fresh = freshOptions();
    // Difficulty / scenario / seats / designed map belong to the MAP box.
    expect(advancedSettingsChanged({ ...fresh, difficulty: "easy" }).changed).toBe(false);
    expect(advancedSettingsChanged({ ...fresh, scenarioId: "land-2p" }).changed).toBe(false);
    expect(advancedSettingsChanged({ ...fresh, playerCount: 3 }).changed).toBe(false);
    expect(advancedSettingsChanged({ ...fresh, customMapName: "Someone's map" }).changed).toBe(false);
    // The mods belong to the MODE box.
    expect(advancedSettingsChanged({ ...fresh, wog: { ...DEFAULT_WOG_OPTIONS, enabled: true } }).changed).toBe(false);
  });

  it("CONTROL: an explicit toggle set back to its own default stays Default", () => {
    const fresh = freshOptions();
    // Creature Banks default ON, Events default OFF — writing those exact
    // values explicitly must not read as a deviation.
    expect(advancedSettingsChanged({ ...fresh, creatureBanks: true, events: false }).changed).toBe(false);
    // …but the opposite value does.
    expect(advancedSettingsChanged({ ...fresh, creatureBanks: false }).changed).toBe(true);
  });

  it("is honest about Custom mode (a loaded setting file IS a customized setup)", () => {
    expect(advancedSettingsChanged({ ...freshOptions(), customMode: true })).toEqual({
      changed: true,
      label: "Custom setup file"
    });
  });
});

describe("heroesSummary / mapSummary", () => {
  it("summarizes the format, the viewer's own pick and the picked count", () => {
    const state = createAdventureLobbyState({ seed: "hub-summary" });
    const empty = heroesSummary(state, "p1");
    expect(empty).toMatchObject({ formatLabel: "Free pick", yourPick: null, picked: 0, computers: 0 });
    expect(empty?.seats).toBe(state.setupLobby!.seats.length);

    // A seat that has picked shows "Faction — Hero" and bumps the count.
    const seat = state.setupLobby!.seats.find((entry) => entry.playerId === "p1")!;
    seat.factionId = "castle";
    seat.heroDefId = "catherine";
    const picked = heroesSummary(state, "p1");
    expect(picked?.yourPick).toBe("Castle — Catherine");
    expect(picked?.picked).toBe(1);
  });

  it("counts computer seats in single-player only", () => {
    const sp = createAdventureLobbyState({
      seed: "hub-summary-sp",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 2
    });
    expect(heroesSummary(sp, "p1")?.computers).toBe(2);
    // CONTROL: a multiplayer lobby reports no computers.
    const mp = createAdventureLobbyState({ seed: "hub-summary-mp", scenarioId: "skirmish", playerCount: 3 });
    expect(heroesSummary(mp, "p1")?.computers).toBe(0);
  });

  it("names the scenario sheet, or the designed map when one is applied", () => {
    const state = createAdventureLobbyState({ seed: "hub-summary-map" });
    const sheet = mapSummary(state)!;
    expect(sheet.name).toBe(scenarioDefinitions[state.setupLobby!.options.scenarioId].name);
    expect(sheet.designed).toBe(false);
    expect(sheet.difficulty).toBe(state.setupLobby!.options.difficulty);
    expect(sheet.difficultyLabel).toBe("Impossible");

    state.setupLobby!.options.customMap = [{ row: 0, col: 0, group: "starting", faceDown: false }];
    state.setupLobby!.options.customMapName = "Twin Peaks";
    const designed = mapSummary(state)!;
    expect(designed.name).toBe("Twin Peaks");
    expect(designed.designed).toBe(true);
  });
});

/**
 * `designedMapInPlay` is the ONE reading of "a designed map is in play" — the
 * Map box, the Map window's "in play" marks and the classic Map & Setup picker
 * all take it, so none of them can claim a map the engine will not build.
 */
describe("designedMapInPlay / designedMapBlockers", () => {
  it("matches the engine: a plan with tiles is in play, an EMPTY plan is not", () => {
    const options = freshOptions();
    expect(designedMapInPlay(options)).toBe(false);
    expect(designedMapInPlay({ ...options, customMap: [{ row: 0, col: 0, group: "starting", faceDown: false }] })).toBe(
      true
    );
    // createAdventureGameState reads `setupOptions.customMap?.length`, so an
    // empty plan builds the SCENARIO layout — a surface testing only
    // `Boolean(customMap)` would mark it in play and name the wrong map.
    expect(designedMapInPlay({ ...options, customMap: [] })).toBe(false);
  });

  it("mapSummary falls back to the scenario sheet for an empty plan", () => {
    const state = createAdventureLobbyState({ seed: "hub-summary-empty" });
    state.setupLobby!.options.customMap = [];
    state.setupLobby!.options.customMapName = "Blank Slate";
    const summary = mapSummary(state)!;
    expect(summary.designed).toBe(false);
    expect(summary.name).toBe(scenarioDefinitions[state.setupLobby!.options.scenarioId].name);
  });

  it("blocks an empty saved map, and passes a real one's own problems through", () => {
    expect(designedMapBlockers(0, [])[0]).toMatch(/no tiles/);
    // CONTROL: a map WITH tiles is judged purely on its plan problems.
    expect(designedMapBlockers(7, [])).toEqual([]);
    expect(designedMapBlockers(7, ["pick a tile for the face-up slot"])).toEqual([
      "pick a tile for the face-up slot"
    ]);
  });
});

/**
 * The strip every hub window shows. It is built from the SAME derivations the
 * four boxes render, so what a window says about the other boxes is exactly
 * what those boxes say — that shared reading is the whole connection.
 */
describe("setupHubNavItems", () => {
  it("carries all four boxes' live values, agreeing with the box derivations", () => {
    const state = createAdventureLobbyState({ seed: "hub-nav" });
    const options = state.setupLobby!.options;
    Object.assign(options, MODE_PRESET_PAYLOADS.legacy);
    options.wog = { ...DEFAULT_WOG_OPTIONS, enabled: true };
    options.difficulty = "easy";
    options.customMap = [{ row: 0, col: 0, group: "starting", faceDown: false }];
    options.customMapName = "Twin Peaks";
    const seat = state.setupLobby!.seats.find((entry) => entry.playerId === "p1")!;
    seat.factionId = "castle";
    seat.heroDefId = "catherine";

    const items = setupHubNavItems(state, "p1");
    expect(items.map((item) => item.id)).toEqual(["mode", "heroes", "map", "advanced"]);
    const byId = Object.fromEntries(items.map((item) => [item.id, `${item.value} | ${item.detail ?? ""}`]));
    expect(byId.mode).toContain("Legacy");
    expect(byId.mode).toContain("WOG");
    expect(byId.heroes).toContain("Castle — Catherine");
    expect(byId.heroes).toContain(`${heroesSummary(state, "p1")!.picked}/${state.setupLobby!.seats.length} picked`);
    expect(byId.map).toContain(mapSummary(state)!.name);
    expect(byId.map).toContain("Easy");
    expect(items.find((item) => item.id === "advanced")!.value).toBe(advancedSettingsChanged(options).label);
  });

  it("CONTROL: a fresh lobby reports the plain defaults, and no mods", () => {
    const items = setupHubNavItems(createAdventureLobbyState({ seed: "hub-nav-fresh" }), "p1");
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    expect(byId.mode.value).toBe("BINH — house-rule edition");
    // No mod line at all when neither WOG nor the Anime mod is on.
    expect(byId.mode.detail).toBeUndefined();
    expect(byId.heroes.value).toBe("no town yet");
    expect(byId.advanced.value).toBe("Default");
  });
});
