/**
 * The Setup Hub's pure derivations. These are the honesty half of the four
 * boxes: the mode label, the "Default vs Customized" advanced badge, and the
 * heroes / map summary lines. Every case has a CONTROL that would flip if the
 * derivation lied (e.g. a map-owned change must NOT read as "Customized").
 */
import { describe, expect, it } from "vitest";
import { createAdventureLobbyState, DEFAULT_WOG_OPTIONS, scenarioDefinitions } from "@/engine";
import type { GameSetupOptions } from "@/engine";
import {
  advancedSettingsChanged,
  deriveActiveSetupMode,
  heroesSummary,
  mapSummary,
  MODE_PRESET_PAYLOADS
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
