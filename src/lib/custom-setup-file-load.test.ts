/**
 * Custom setting FILE — end-to-end round-trip through the real SET_GAME_OPTIONS
 * load path. Proves the file saves and RESTORES every setting across all four
 * setup tabs (Mode & Rules, Match, Map & Setup, Army), and deliberately does NOT
 * carry a faction/hero pick (those live on the lobby seat, chosen per game).
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState, type GameState, type GameSetupOptions } from "@/engine";
import { buildCustomSetupFile, parseCustomSetupFile } from "./custom-setup-file";

function lobby(seed: string): GameState {
  return createAdventureLobbyState({ seed });
}

/** Distinctive, non-default values spanning all four setup tabs. */
function configureAllTabs(state: GameState): GameState {
  const options: Partial<GameSetupOptions> = {
    // Mode & Rules
    ruleset: "binh",
    moraleCards: true,
    undoMoves: true,
    houseRules: { "griffin-buff": false, "mine-guard-reinforcement": true },
    tournamentMoraleSearchAgain: true,
    tournamentRemovedArtifactsVp: true,
    tournamentObservatoryRerotate: true,
    // Match
    victoryMode: "grail",
    difficulty: "easy",
    pvpTroopLoss: "none",
    // Map & Setup
    creatureBanks: false,
    farTilesPerPlayer: 5,
    fieldOverrides: true,
    // Army
    startingResources: { gold: 42, buildingMaterials: 7, valuables: 3 },
    startingUnits: [{ level: 3, side: "pack" }],
    startingBuildings: ["city_hall"]
  };
  return applyAction(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options }).state;
}

describe("Custom setting file — all four tabs round-trip through SET_GAME_OPTIONS", () => {
  it("restores every tab's settings onto a fresh lobby (faction/hero excluded)", () => {
    const configured = configureAllTabs(lobby("custom-file-source"));
    const file = buildCustomSetupFile(configured.setupLobby!.options, "All tabs");

    const parsed = parseCustomSetupFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Apply the loaded options to a DIFFERENT fresh lobby (default settings).
    const loaded = applyAction(lobby("custom-file-target"), {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: parsed.options
    }).state;
    const o = loaded.setupLobby!.options;

    // Mode & Rules
    expect(o.ruleset).toBe("binh");
    expect(o.moraleCards).toBe(true);
    expect(o.undoMoves).toBe(true);
    expect(o.houseRules?.["griffin-buff"]).toBe(false);
    expect(o.houseRules?.["mine-guard-reinforcement"]).toBe(true);
    expect(o.tournamentMoraleSearchAgain).toBe(true);
    expect(o.tournamentRemovedArtifactsVp).toBe(true);
    expect(o.tournamentObservatoryRerotate).toBe(true);
    // Match
    expect(o.victoryMode).toBe("grail");
    expect(o.difficulty).toBe("easy");
    expect(o.pvpTroopLoss).toBe("none");
    // Map & Setup
    expect(o.creatureBanks).toBe(false);
    expect(o.farTilesPerPlayer).toBe(5);
    expect(o.fieldOverrides).toBe(true);
    // Army
    expect(o.startingResources).toEqual({ gold: 42, buildingMaterials: 7, valuables: 3 });
    expect(o.startingUnits).toEqual([{ level: 3, side: "pack" }]);
    expect(o.startingBuildings).toEqual(["city_hall"]);

    // The load lands the lobby in Custom mode and never carries a seat pick.
    expect(o.customMode).toBe(true);
    expect("faction" in file).toBe(false);
    expect(loaded.setupLobby!.seats.find((seat) => seat.playerId === "p1")?.factionId ?? null).toBeNull();
  });

  it("CONTROL — a fresh lobby (no load) does NOT carry the configured values", () => {
    const fresh = lobby("custom-file-control").setupLobby!.options;
    // Sanity that the values above are genuinely non-default.
    expect(fresh.difficulty).not.toBe("easy");
    expect(fresh.startingResources).not.toEqual({ gold: 42, buildingMaterials: 7, valuables: 3 });
  });
});
