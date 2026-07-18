// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  DEFAULT_ANIME_OPTIONS,
  DEFAULT_WOG_OPTIONS,
  mapObjectsModuleActive
} from "./index";
import type { FieldOverridePlacementMode, GameSetupOptions, GameState } from "./state";

/**
 * A map-objects CONTENT module (WOG "New Objects" — `wog.enabled &&
 * wog.newObjects` — or the Anime "Map objects" package — `anime.enabled &&
 * anime.mapObjects !== false`) REQUIRES the global Field Override mechanism to
 * place its hexes. So whenever such a module is active, `fieldOverrides` must be
 * ON. This is enforced at TWO seams — the `setGameOptions` lobby chokepoint (a
 * multiplayer client cannot land with map objects ticked but FO off, whatever
 * payload it sends) AND the game-build backstop (a direct build payload) — and
 * it is FORCE-ON ONLY: unticking the module never forces FO back off, and an
 * explicit `fieldOverrides: false` in the same payload loses to the force.
 *
 * Each claim fails if its wiring is removed.
 */

function newLobby(): GameState {
  return createAdventureLobbyState({ seed: "fo-force", scenarioId: "skirmish" });
}

function driver(initial: GameState) {
  let state = initial;
  const apply = (options: Partial<GameSetupOptions>) => {
    const result = applyAction(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options });
    expect(result.errors.map((e) => e.message).join("; ")).toBe("");
    state = result.state;
  };
  const applyRaw = (options: Partial<GameSetupOptions>) =>
    applyAction(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options });
  return { apply, applyRaw, get: () => state };
}

const fo = (state: GameState): boolean | undefined => state.setupLobby!.options.fieldOverrides;
const placement = (state: GameState): FieldOverridePlacementMode | undefined =>
  state.setupLobby!.options.fieldOverridePlacement;

describe("mapObjectsModuleActive — the shared predicate", () => {
  it("is true only for an ACTIVE map-objects package (wog newObjects / anime mapObjects)", () => {
    // WOG New Objects.
    expect(mapObjectsModuleActive({ wog: { enabled: true, newObjects: true } })).toBe(true);
    expect(mapObjectsModuleActive({ wog: { enabled: true, newObjects: false } })).toBe(false);
    expect(mapObjectsModuleActive({ wog: { enabled: false, newObjects: true } })).toBe(false);
    // Anime Map objects — absent `mapObjects` counts as ON (legacy/campaign),
    // only an explicit `false` drops it (mirrors fieldOverridePackageAllowed).
    expect(mapObjectsModuleActive({ anime: { enabled: true, mapObjects: true } })).toBe(true);
    expect(mapObjectsModuleActive({ anime: { enabled: true } })).toBe(true);
    expect(mapObjectsModuleActive({ anime: { enabled: true, mapObjects: false } })).toBe(false);
    expect(mapObjectsModuleActive({ anime: { enabled: false, mapObjects: true } })).toBe(false);
    // Neither / empty.
    expect(mapObjectsModuleActive({})).toBe(false);
    expect(mapObjectsModuleActive(null)).toBe(false);
  });
});

describe("setGameOptions — a map-objects module forces Field Overrides ON", () => {
  it("ticking WOG New Objects flips fieldOverrides on, even with NO fieldOverrides key in the payload", () => {
    const { apply, get } = driver(newLobby());
    expect(fo(get())).not.toBe(true); // default OFF
    apply({ wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newObjects: true } });
    expect(fo(get())).toBe(true);
  });

  it("an explicit fieldOverrides:false in the SAME payload as WOG New Objects LOSES to the force", () => {
    const { apply, get } = driver(newLobby());
    apply({ wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newObjects: true }, fieldOverrides: false });
    expect(fo(get())).toBe(true);
  });

  it("ticking Anime Map objects flips fieldOverrides on, and an explicit false in the same payload loses", () => {
    const { apply, get } = driver(newLobby());
    apply({ anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, mapObjects: true }, fieldOverrides: false });
    expect(fo(get())).toBe(true);
  });

  it("CONTROL: with NEITHER module active, fieldOverrides is left untouched (an explicit false stays off)", () => {
    const { apply, get } = driver(newLobby());
    // No module ⇒ the force never fires.
    apply({ fieldOverrides: false });
    expect(fo(get())).toBe(false);
    // WOG enabled but New Objects UNticked ⇒ still not a map-objects module.
    apply({ wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newObjects: false }, fieldOverrides: false });
    expect(fo(get())).toBe(false);
    // Anime enabled but Map objects UNticked ⇒ still not a map-objects module.
    apply({ anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, mapObjects: false }, fieldOverrides: false });
    expect(fo(get())).toBe(false);
  });

  it("force-ON ONLY: unticking the module later does NOT force fieldOverrides back off", () => {
    const { apply, get } = driver(newLobby());
    apply({ wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newObjects: true } });
    expect(fo(get())).toBe(true);
    // Untick New Objects — the module is now inactive, but FO stays as the table
    // left it (it may want FO for other content).
    apply({ wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newObjects: false } });
    expect(fo(get())).toBe(true);
  });
});

describe("Field Override placement mode — stored from a client payload, frozen on the built game", () => {
  const MODES: FieldOverridePlacementMode[] = ["manual", "manual-or-refuse", "random"];

  it("setGameOptions stores each of the three placement modes on the lobby", () => {
    for (const mode of MODES) {
      const { apply, get } = driver(newLobby());
      apply({ fieldOverrides: true, fieldOverridePlacement: mode });
      expect(placement(get())).toBe(mode);
    }
  });

  it("REJECTS a garbage placement value (the lobby value is left unchanged)", () => {
    const { apply, applyRaw, get } = driver(newLobby());
    apply({ fieldOverrides: true, fieldOverridePlacement: "manual" });
    const result = applyRaw({ fieldOverridePlacement: "bogus" as FieldOverridePlacementMode });
    expect(result.errors.map((e) => e.message).join("; ")).toMatch(/placement mode/i);
    // The prior valid value survived the rejected action.
    expect(placement(get())).toBe("manual");
  });

  it("the BUILT adventure freezes each placement mode", () => {
    for (const mode of MODES) {
      const state = createAdventureGameState({
        seed: `fo-place-${mode}`,
        ruleset: "binh",
        fieldOverrides: true,
        fieldOverridePlacement: mode,
        players: [
          { id: "p1", name: "One", factionId: "castle" as never, heroDefId: "catherine" },
          { id: "p2", name: "Two", factionId: "necropolis" as never }
        ]
      });
      expect(state.adventure!.fieldOverrides).toBe(true);
      expect(state.adventure!.fieldOverridePlacement).toBe(mode);
    }
  });
});

describe("game build — a map-objects module forces Field Overrides ON (backstop)", () => {
  it("a direct build with WOG New Objects + fieldOverrides:false STILL freezes fieldOverrides on", () => {
    const state = createAdventureGameState({
      seed: "fo-build-wog",
      ruleset: "binh",
      wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newObjects: true },
      fieldOverrides: false,
      players: [
        { id: "p1", name: "One", factionId: "castle" as never, heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis" as never }
      ]
    });
    expect(state.adventure!.fieldOverrides).toBe(true);
  });

  it("a direct build with Anime Map objects + fieldOverrides:false STILL freezes fieldOverrides on", () => {
    const state = createAdventureGameState({
      seed: "fo-build-anime",
      ruleset: "binh",
      anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, mapObjects: true },
      fieldOverrides: false,
      players: [
        { id: "p1", name: "One", factionId: "castle" as never, heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis" as never }
      ]
    });
    expect(state.adventure!.fieldOverrides).toBe(true);
  });

  it("CONTROL: a build with NO map-objects module and fieldOverrides:false keeps FO off", () => {
    const state = createAdventureGameState({
      seed: "fo-build-control",
      ruleset: "binh",
      wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newObjects: false },
      fieldOverrides: false,
      players: [
        { id: "p1", name: "One", factionId: "castle" as never, heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis" as never }
      ]
    });
    expect(state.adventure!.fieldOverrides).toBe(false);
  });
});
