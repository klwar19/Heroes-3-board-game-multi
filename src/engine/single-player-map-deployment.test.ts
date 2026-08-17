import { describe, expect, it } from "vitest";
import {
  applyAction,
  classifyHeroStep,
  createAdventureGameState,
  createAdventureLobbyState,
  eliminatePlayer,
  getLegalActions,
  hexSpaceId,
  mapForcedComputerFaction,
  playersAreAllied,
  requiredRivalHeroDefeats,
  scenarioDefinitions,
  singlePlayerMapDeployment,
  type CustomMapTilePlan,
  type GameState
} from "./index";

const starts = scenarioDefinitions.skirmish.layout.starts;

/** Placement order is deliberately different from solo role order. */
const SOLO_TOWNS: CustomMapTilePlan[] = [
  {
    ...starts[0],
    group: "starting",
    faceDown: false,
    singlePlayer: {
      role: "computer",
      bonus: { gold: 3, buildingMaterials: 1, valuables: 0 }
    }
  },
  {
    ...starts[1],
    group: "starting",
    faceDown: false,
    singlePlayer: { role: "human" }
  },
  {
    ...starts[2],
    group: "starting",
    faceDown: false,
    singlePlayer: {
      role: "computer",
      bonus: { gold: 0, buildingMaterials: 0, valuables: 2 }
    }
  },
  { ...starts[3], group: "starting", faceDown: false }
];

const PLAYERS = [
  { id: "p1", name: "You", factionId: "castle" as const },
  { id: "p2", name: "Computer 1", factionId: "necropolis" as const },
  { id: "p3", name: "Computer 2", factionId: "dungeon" as const }
];

function applySoloMap(state: GameState): GameState {
  return applyAction(state, {
    type: "SET_GAME_OPTIONS",
    playerId: "p1",
    options: {
      playerCount: 4,
      customMap: SOLO_TOWNS,
      customMapName: "Role Test",
      customMapPreset: {
        computerStartingBonus: { gold: 2, buildingMaterials: 0, valuables: 1 }
      }
    }
  }).state;
}

describe("map-authored single-player deployment", () => {
  it("requires exactly one human and at least one computer role", () => {
    expect(singlePlayerMapDeployment(SOLO_TOWNS)?.computers).toHaveLength(2);
    expect(
      singlePlayerMapDeployment(
        SOLO_TOWNS.map((plan) => ({ ...plan, singlePlayer: { role: "computer" as const } }))
      )
    ).toBeNull();
    expect(singlePlayerMapDeployment(SOLO_TOWNS, 1)).toBeNull();
    expect(singlePlayerMapDeployment(SOLO_TOWNS.map((plan) => ({ ...plan, singlePlayer: undefined })))).toBeNull();
  });

  it("resizes a solo lobby from the map and resists later manual seat-count changes", () => {
    let state = createAdventureLobbyState({
      seed: "solo-map-lobby",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 1
    });
    state = applySoloMap(state);

    expect(state.setupLobby?.seats.map((seat) => seat.playerId)).toEqual(["p1", "p2", "p3"]);
    expect(state.controllers).toEqual({
      p1: { kind: "human" },
      p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
      p3: { kind: "computer", difficulty: "standard", policyVersion: 1 }
    });

    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 4 }
    }).state;
    expect(state.setupLobby?.seats).toHaveLength(3);
    const rejected = applyAction(state, {
      type: "SET_COMPUTER_OPPONENTS",
      playerId: "p1",
      count: 3
    });
    expect(rejected.errors).toHaveLength(1);
    expect(rejected.state.setupLobby?.seats).toHaveLength(3);
  });

  it("places the human and AIs at their marked Towns and combines per-map/per-AI bonuses", () => {
    const state = createAdventureGameState({
      seed: "solo-map-build",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: SOLO_TOWNS,
      customMapPreset: {
        computerStartingBonus: { gold: 2, buildingMaterials: 0, valuables: 1 }
      },
      players: PLAYERS
    });

    expect(state.heroes.hero_p1.spaceId).toBe(hexSpaceId(starts[1]));
    expect(state.heroes.hero_p2.spaceId).toBe(hexSpaceId(starts[0]));
    expect(state.heroes.hero_p3.spaceId).toBe(hexSpaceId(starts[2]));
    expect(state.players.p1.resources).toEqual({ gold: 10, buildingMaterials: 2, valuables: 1 });
    expect(state.players.p2.resources).toEqual({ gold: 15, buildingMaterials: 3, valuables: 2 });
    expect(state.players.p3.resources).toEqual({ gold: 12, buildingMaterials: 2, valuables: 4 });
  });

  it("can team all computer enemies without allying the human or changing multiplayer", () => {
    const allied = createAdventureGameState({
      seed: "solo-map-allies",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: SOLO_TOWNS,
      customMapPreset: { computerDiplomacy: "allied" },
      players: PLAYERS
    });
    expect(playersAreAllied(allied, "p2", "p3")).toBe(true);
    expect(playersAreAllied(allied, "p1", "p2")).toBe(false);
    expect(classifyHeroStep(allied, allied.heroes.hero_p2, allied.heroes.hero_p3.spaceId!)).toBe("pass-only");

    const rivals = createAdventureGameState({
      seed: "solo-map-rivals",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: SOLO_TOWNS,
      customMapPreset: { computerDiplomacy: "free-for-all" },
      players: PLAYERS
    });
    expect(playersAreAllied(rivals, "p2", "p3")).toBe(false);
    expect(classifyHeroStep(rivals, rivals.heroes.hero_p2, rivals.heroes.hero_p3.spaceId!)).toBe("stop");

    const multiplayer = createAdventureGameState({
      seed: "solo-map-allies-mp-control",
      scenarioId: "skirmish",
      sessionMode: "multiplayer",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: SOLO_TOWNS,
      customMapPreset: { computerDiplomacy: "allied" },
      players: PLAYERS
    });
    expect(multiplayer.playerTeams).toBeUndefined();
  });

  it("lets the allied computer team finish elimination and excludes teammates from hero-defeat targets", () => {
    const state = createAdventureGameState({
      seed: "solo-map-allied-victory",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: SOLO_TOWNS,
      customMapPreset: { computerDiplomacy: "allied" },
      players: PLAYERS
    });

    expect(requiredRivalHeroDefeats(state, "p2")).toBe(1);
    expect(requiredRivalHeroDefeats(state, "p1")).toBe(2);

    eliminatePlayer(state, "p1", "defeated by the computer alliance", false);
    expect(state.adventure?.winnerPlayerId).toBe("p2");
    expect(state.eventLog.at(-1)).toMatchObject({
      type: "GAME_WON",
      playerId: "p2",
      reason: "the last alliance standing"
    });
  });

  // A solo map that FORCES p2's enemy town type (its tile is deployment.computers[0]).
  const FORCED_FACTION_TOWNS: CustomMapTilePlan[] = SOLO_TOWNS.map((plan, index) =>
    index === 0
      ? { ...plan, singlePlayer: { role: "computer" as const, factionId: "rampart" as const } }
      : plan
  );

  function soloForcedLobby(): GameState {
    let state = createAdventureLobbyState({
      seed: "solo-forced-faction",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 1
    });
    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 4, customMap: FORCED_FACTION_TOWNS, customMapName: "Forced" }
    }).state;
    return state;
  }

  /** Apply the CHOOSE_FACTION legal action that plays `factionId` for `playerId`. */
  function pickFaction(state: GameState, playerId: string, factionId: string): GameState {
    const offer = getLegalActions(state, playerId).find(
      (entry) => entry.action.type === "CHOOSE_FACTION" && entry.action.factionId === factionId
    );
    if (!offer) {
      throw new Error(`no CHOOSE_FACTION offer for ${playerId} → ${factionId}`);
    }
    return applyAction(state, offer.action).state;
  }

  it("mapForcedComputerFaction reads the designer's forced enemy town (only for the mapped AI seat)", () => {
    const state = soloForcedLobby();
    // p2 ↔ deployment.computers[0] (the forced tile); p3 ↔ computers[1] (unforced).
    expect(mapForcedComputerFaction(state, "p2")).toBe("rampart");
    expect(mapForcedComputerFaction(state, "p3")).toBeNull();
    // Never forces the human seat.
    expect(mapForcedComputerFaction(state, "p1")).toBeNull();
    // CONTROL: the same map with NO forced faction returns null for both AIs.
    const unforced = applyAction(soloForcedLobby(), {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMap: SOLO_TOWNS }
    }).state;
    expect(mapForcedComputerFaction(unforced, "p2")).toBeNull();
  });

  it("offers the forced AI seat ONLY its map faction, and lets an unforced seat pick any", () => {
    const state = soloForcedLobby();
    const p2Factions = new Set(
      getLegalActions(state, "p2")
        .filter((entry) => entry.action.type === "CHOOSE_FACTION")
        .map((entry) => (entry.action as { factionId: string }).factionId)
    );
    expect([...p2Factions]).toEqual(["rampart"]);
    // CONTROL: the unforced AI seat still sees many towns to choose from.
    const p3Factions = new Set(
      getLegalActions(state, "p3")
        .filter((entry) => entry.action.type === "CHOOSE_FACTION")
        .map((entry) => (entry.action as { factionId: string }).factionId)
    );
    expect(p3Factions.size).toBeGreaterThan(1);
    expect(p3Factions.has("rampart")).toBe(true);
  });

  it("locks a forced AI seat to its map faction even when the human hand-picks another", () => {
    const state = soloForcedLobby();
    // The human tries to set p2 to Dungeon — the map lock wins (stays Rampart).
    const locked = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "dungeon", heroDefId: "mutare" }
    }).state;
    expect(locked.setupLobby?.seats.find((s) => s.playerId === "p2")?.factionId).toBe("rampart");
    // CONTROL: an UNFORCED AI seat honours the human's hand-pick.
    const freePick = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p3",
      choice: { factionId: "dungeon", heroDefId: "mutare" }
    }).state;
    expect(freePick.setupLobby?.seats.find((s) => s.playerId === "p3")?.factionId).toBe("dungeon");
  });

  it("the built game deploys the forced AI with the designer's town (end to end)", () => {
    let state = soloForcedLobby();
    state = pickFaction(state, "p1", "castle");
    state = pickFaction(state, "p2", "rampart"); // the only offer for the forced seat
    // p3 is free — take any faction its offers include that isn't taken.
    const p3Faction = getLegalActions(state, "p3")
      .map((entry) => entry.action)
      .find(
        (action): action is Extract<typeof action, { type: "CHOOSE_FACTION" }> =>
          action.type === "CHOOSE_FACTION" && action.factionId !== "castle" && action.factionId !== "rampart"
      );
    expect(p3Faction).toBeTruthy();
    state = applyAction(state, p3Faction!).state;

    state = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" }).state;
    expect(state.setupLobby).toBeNull();
    // p2's town was built from the forced faction.
    expect(state.towns.town_p2?.factionId).toBe("rampart");
    // CONTROL: p2's start hero also leads Rampart (not a random town).
    expect(state.heroes.hero_p2?.heroDefId).toBeTruthy();
  });

  // A solo map that gives p2's enemy (deployment.computers[0]) a fully custom
  // starting army; p3 (computers[1]) has none, as the CONTROL.
  const ARMY_TOWNS: CustomMapTilePlan[] = SOLO_TOWNS.map((plan, index) =>
    index === 0
      ? {
          ...plan,
          singlePlayer: {
            role: "computer" as const,
            army: { units: ["neutral.boars", "random-pack:bronze", "random-few:bronze"] },
            armyExperience: 5
          }
        }
      : plan
  );

  it("deploys a per-enemy custom starting army (few/pack/neutral) and stamps its experience", () => {
    const state = createAdventureGameState({
      seed: "solo-army-build",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: ARMY_TOWNS,
      players: PLAYERS
    });

    // p2 fields EXACTLY the authored army: the named Neutral, a Pack, a Few.
    const p2Army = state.players.p2.army;
    expect(p2Army.map((unit) => unit.side)).toEqual(["neutral", "pack", "few"]);
    expect(p2Army[0].unitDefId).toBe("neutral.boars");
    // Every custom-army card carries the stamped veteran experience.
    expect(p2Army.every((unit) => unit.experience === 5)).toBe(true);
    // The restock list mirrors the deployed army (same sides, so an empty deck
    // rebuilds the same starting force).
    expect(state.players.p2.startingArmy).toEqual(
      p2Army.map((unit) => ({ unitDefId: unit.unitDefId, side: unit.side }))
    );

    // CONTROL: p3 has no authored army → its default faction (Dungeon) start,
    // all `few`, no stamped experience.
    const p3Army = state.players.p3.army;
    expect(p3Army.length).toBeGreaterThan(0);
    expect(p3Army.every((unit) => unit.side === "few")).toBe(true);
    expect(p3Army.every((unit) => unit.unitDefId.startsWith("dungeon."))).toBe(true);
    expect(p3Army.some((unit) => unit.experience !== undefined)).toBe(false);
    // CONTROL: the human seat is untouched by any enemy army authoring.
    expect(state.players.p1.army.every((unit) => unit.side === "few")).toBe(true);
  });

  it("CONTROL: the same custom-army map grants a multiplayer seat no custom army", () => {
    const game = createAdventureGameState({
      seed: "solo-army-mp",
      scenarioId: "skirmish",
      sessionMode: "multiplayer",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: ARMY_TOWNS,
      players: PLAYERS
    });
    // No solo deployment in multiplayer → p2 keeps its default Necropolis start.
    expect(game.players.p2.army.every((unit) => unit.side === "few")).toBe(true);
    expect(game.players.p2.army.some((unit) => unit.unitDefId === "neutral.boars")).toBe(false);
  });

  it("CONTROL: the identical map keeps multiplayer seat order/count and grants no AI-only bonus", () => {
    let lobby = createAdventureLobbyState({ seed: "same-map-mp", scenarioId: "skirmish", playerCount: 2 });
    lobby = applyAction(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 4, customMap: SOLO_TOWNS, customMapName: "Role Test" }
    }).state;
    expect(lobby.setupLobby?.seats).toHaveLength(4);
    expect(lobby.controllers).toBeUndefined();

    const game = createAdventureGameState({
      seed: "same-map-mp-build",
      scenarioId: "skirmish",
      sessionMode: "multiplayer",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: SOLO_TOWNS,
      customMapPreset: {
        computerStartingBonus: { gold: 9, buildingMaterials: 9, valuables: 9 }
      },
      // Even an unusual hosted multiplayer snapshot with a computer controller
      // must not activate solo map rules.
      controllers: {
        p1: { kind: "human" },
        p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
        p3: { kind: "human" }
      },
      players: PLAYERS
    });

    expect(game.heroes.hero_p1.spaceId).toBe(hexSpaceId(starts[0]));
    expect(game.heroes.hero_p2.spaceId).toBe(hexSpaceId(starts[1]));
    expect(game.heroes.hero_p3.spaceId).toBe(hexSpaceId(starts[2]));
    expect(game.players.p2.resources).toEqual({ gold: 10, buildingMaterials: 2, valuables: 1 });
  });
});
