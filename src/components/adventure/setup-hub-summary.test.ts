/**
 * The Setup Hub's pure derivations. These are the honesty half of the four
 * boxes: the mode label, the "Default vs Customized" advanced badge, and the
 * heroes / map summary lines. Every case has a CONTROL that would flip if the
 * derivation lied (e.g. a map-owned change must NOT read as "Customized").
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureLobbyState,
  DEFAULT_ANIME_OPTIONS,
  DEFAULT_WOG_OPTIONS,
  HOUSE_RULES,
  scenarioDefinitions
} from "@/engine";
import type { GameSetupOptions } from "@/engine";
import {
  advancedSettingsChanged,
  deriveActiveSetupMode,
  designedMapBlockers,
  designedMapInPlay,
  heroesSummary,
  mapSummary,
  MODE_PRESET_PAYLOADS,
  raidBossModuleEnabled,
  setupHubNavItems,
  tableGameMode,
  tableModeAvailability
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

  it("Tournament = every rule at its LEGACY default, plus split decks", () => {
    const tournamentRules = MODE_PRESET_PAYLOADS.tournament.houseRules;
    expect(tournamentRules?.["split-decks"]).toBe(true);
    for (const rule of HOUSE_RULES) {
      if (rule.id === "split-decks") continue;
      // A blanket `false` here would silently flip default-ON legacy rules —
      // torso-of-legion-major is the canary (legacyDefault: true, and turning
      // it off re-tiers/re-prices the card in every Tournament game).
      expect(tournamentRules?.[rule.id], rule.id).toBe(rule.legacyDefault ?? false);
    }
    expect(tournamentRules?.["torso-of-legion-major"]).toBe(true);
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

  it("counts computer seats from the CONTROLLERS, in either session mode", () => {
    const sp = createAdventureLobbyState({
      seed: "hub-summary-sp",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 2
    });
    expect(heroesSummary(sp, "p1")?.computers).toBe(2);
    // CO-OP (step 6): a MULTIPLAYER lobby may hold computer enemies too, and
    // the Heroes box must count them (it was session-gated to 0 before).
    let mpWithAi = createAdventureLobbyState({ seed: "hub-summary-mp-ai", scenarioId: "skirmish" });
    mpWithAi = applyAction(mpWithAi, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 }).state;
    expect(heroesSummary(mpWithAi, "p1")?.computers).toBe(2);
    // CONTROL: an ALL-HUMAN multiplayer lobby still reports none.
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

/**
 * CO-OP (step 6) — the table-mode axis, which is separate from the four rule
 * presets above. Every case carries a clash / absent-field CONTROL, because
 * "absent means clash and nothing changes" is the whole compatibility promise.
 */
describe("tableGameMode / tableModeAvailability / raidBossModuleEnabled", () => {
  it("an ABSENT gameMode reads as clash; only the literal 'coop' reads as co-op", () => {
    const options = freshOptions();
    expect(options.gameMode, "a fresh lobby writes no gameMode at all").toBeUndefined();
    expect(tableGameMode(options)).toBe("clash");
    expect(tableGameMode({ ...options, gameMode: "clash" })).toBe("clash");
    expect(tableGameMode({ ...options, gameMode: "coop" })).toBe("coop");
  });

  it("a map declaring one supported mode disables the other, with the reason", () => {
    const options = freshOptions();
    // CONTROL: no preset at all — every existing map stays playable both ways.
    const both = tableModeAvailability(options);
    expect(both.clash.allowed).toBe(true);
    expect(both.coop.allowed).toBe(true);
    expect(both.clash.reason).toBeUndefined();
    expect(both.coop.reason).toBeUndefined();

    const coopOnly = tableModeAvailability({
      ...options,
      customMapPreset: { supportedModes: { clash: false, coop: true } }
    });
    expect(coopOnly.clash.allowed).toBe(false);
    expect(coopOnly.clash.reason).toContain("Co-op only");
    expect(coopOnly.coop.allowed).toBe(true);

    const clashOnly = tableModeAvailability({
      ...options,
      customMapPreset: { supportedModes: { clash: true, coop: false } }
    });
    expect(clashOnly.coop.allowed).toBe(false);
    expect(clashOnly.coop.reason).toContain("Clash only");
    expect(clashOnly.clash.allowed).toBe(true);

    // A hand-edited record supporting NOTHING would be unplayable, so the
    // engine's `mapSupportedModes` reads it as both — and so must the UI.
    const neither = tableModeAvailability({
      ...options,
      customMapPreset: { supportedModes: { clash: false, coop: false } }
    });
    expect(neither.clash.allowed).toBe(true);
    expect(neither.coop.allowed).toBe(true);
  });

  it("raidBossModuleEnabled needs the MOD enabled as well as the module (four combinations)", () => {
    const options = freshOptions();
    expect(raidBossModuleEnabled(options)).toBe(false);
    expect(
      raidBossModuleEnabled({ ...options, wog: { ...DEFAULT_WOG_OPTIONS, enabled: false, raidBosses: true } })
    ).toBe(false);
    expect(
      raidBossModuleEnabled({ ...options, wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, raidBosses: false } })
    ).toBe(false);
    expect(
      raidBossModuleEnabled({ ...options, wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, raidBosses: true } })
    ).toBe(true);
    // The anime surface is the second road to the same module.
    const anime = { ...DEFAULT_ANIME_OPTIONS, raidBosses: true };
    expect(raidBossModuleEnabled({ ...options, anime: { ...anime, enabled: true } })).toBe(true);
    expect(raidBossModuleEnabled({ ...options, anime: { ...anime, enabled: false } })).toBe(false);
  });

  it("the summary rail names CO-OP on the Game-mode chip — and stays silent on clash", () => {
    const coop = createAdventureLobbyState({ seed: "hub-nav-coop" });
    coop.setupLobby!.options.gameMode = "coop";
    const coopMode = setupHubNavItems(coop, "p1").find((item) => item.id === "mode")!;
    expect(coopMode.detail).toBe("Co-op");

    // With a mod on it joins that line rather than replacing it.
    coop.setupLobby!.options.wog = { ...DEFAULT_WOG_OPTIONS, enabled: true };
    expect(setupHubNavItems(coop, "p1").find((item) => item.id === "mode")!.detail).toBe("Co-op · Mods: WOG");

    // CONTROL: an explicit CLASH table is byte-identical to the absent default
    // — clash has always been every table, so naming it would be pure noise.
    const clash = createAdventureLobbyState({ seed: "hub-nav-clash" });
    clash.setupLobby!.options.gameMode = "clash";
    expect(setupHubNavItems(clash, "p1").find((item) => item.id === "mode")!.detail).toBeUndefined();
  });
});
