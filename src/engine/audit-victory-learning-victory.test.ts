/**
 * AUDIT (read-only probe, protocol v127) — Conquest / Conquer victory swap.
 *
 * Intended NEW rule:
 *  - "conquest" = elimination only (default in MP and SP); PvP wins never win.
 *  - "conquer"  = the fixed distinct-PvP-win target, OR elimination.
 *  - grail / dragon-hunt / dragon-conqueror = their objective, OR elimination.
 *
 * Every assertion is an observable engine outcome (winnerPlayerId / phase /
 * heroDefeats / eliminated), each paired with the mode where it must NOT fire.
 */
import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  createAdventureLobbyState,
  eliminatePlayer,
  getMainHero,
  requiredHeroDefeats
} from "./index";
import {
  adventureVictoryMode,
  checkConquestVictory,
  conquestProgress,
  requiredRivalHeroDefeats,
  victoryModeCountsHeroDefeats
} from "./adventure";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { AdventurePlayerConfig } from "./adventure-setup";
import type {
  CombatState,
  CombatUnitState,
  GameState,
  MapFieldState,
  PlayerId,
  VictoryMode
} from "./state";

const P1: AdventurePlayerConfig = { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" };
const P2: AdventurePlayerConfig = { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" };
const P3: AdventurePlayerConfig = { id: "p3", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" };
const P4: AdventurePlayerConfig = { id: "p4", name: "Gelu", factionId: "rampart", heroDefId: "gelu" };

function makeGame(victoryMode: VictoryMode, who: AdventurePlayerConfig[] = [P1, P2]): GameState {
  const state = createAdventureGameState({
    seed: `audit-victory-${victoryMode}-${who.length}`,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    victoryMode,
    pvpTroopLoss: "normal",
    players: who
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

function plainField(state: GameState, spaceId: string): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: `tile-${spaceId}`,
    slot: 0,
    location: "empty_field",
    difficulty: undefined,
    blackCube: false
  } as MapFieldState;
  state.adventure!.fields[spaceId] = field;
  return field;
}

function unit(
  over: Partial<CombatUnitState> & { id: string; controllerId: PlayerId; armyUnitId: string }
): CombatUnitState {
  return {
    name: "Pikemen",
    cardName: "Few Pikemen",
    variant: "few",
    grade: "bronze",
    type: "ground",
    attack: 1,
    defense: 1,
    maxHealth: 2,
    damage: 0,
    initiative: 1,
    position: 0,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    unitDefId: "castle.pikemen",
    assets: { cardImage: "", imageAlt: "" },
    ...over
  } as CombatUnitState;
}

/**
 * A finished ORDINARY PvP fight (no town, no siege) on a neutral hex: `winner`
 * beat `loser`. Nothing here can eliminate anybody, so the only thing under
 * test is the victory-mode PvP credit.
 */
function stagePvpWin(state: GameState, winner: PlayerId, loser: PlayerId, spaceId = "30,30"): void {
  const field = plainField(state, spaceId);
  const attacker = getMainHero(state, winner)!;
  const defender = getMainHero(state, loser)!;
  attacker.spaceId = field.spaceId;
  defender.spaceId = field.spaceId;
  state.activePlayerId = winner;
  state.players[winner].army = [{ id: `a-${winner}`, unitDefId: "castle.pikemen", side: "few" }];
  state.players[loser].army = [{ id: `a-${loser}`, unitDefId: "castle.pikemen", side: "few" }];
  state.combat = {
    id: `pvp-${winner}-${loser}`,
    round: 1,
    attackerPlayerId: winner,
    defenderPlayerId: loser,
    activeUnitId: null,
    context: {
      kind: "player",
      attackerHeroId: attacker.id,
      defenderHeroId: defender.id,
      fieldId: field.spaceId
    },
    setup: null,
    awaitingContinue: false,
    outcome: { winnerPlayerId: winner, defeatedPlayerId: loser, reason: "all-enemy-units-defeated" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {
      w1: unit({ id: "w1", controllerId: winner, armyUnitId: `a-${winner}` }),
      l1: unit({ id: "l1", controllerId: loser, armyUnitId: `a-${loser}`, damage: 2, maxHealth: 2 })
    }
  } as CombatState;
  finalizeAdventureCombat(state);
}

describe("AUDIT v127 — which modes count distinct PvP wins", () => {
  it("only Conquer counts hero defeats", () => {
    expect(victoryModeCountsHeroDefeats("conquer")).toBe(true);
    for (const mode of ["conquest", "grail", "dragon-hunt", "dragon-conqueror"] as VictoryMode[]) {
      expect(victoryModeCountsHeroDefeats(mode)).toBe(false);
    }
  });

  it("the fixed PvP table is unchanged: 2/3/4/5/6 seats need 1/2/2/3/3", () => {
    expect([2, 3, 4, 5, 6].map(requiredHeroDefeats)).toEqual([1, 2, 2, 3, 3]);
  });

  it("Conquer: one PvP win over the only rival WINS a 2-player game", () => {
    const state = makeGame("conquer");
    stagePvpWin(state, "p1", "p2");
    expect(state.adventure!.heroDefeats?.p1).toEqual(["p2"]);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
    expect(state.phase).toBe("game-over");
  });

  it("CONTROL — Conquest: the same PvP win records NOTHING and wins nothing", () => {
    const state = makeGame("conquest");
    stagePvpWin(state, "p1", "p2");
    expect(state.adventure!.heroDefeats?.p1).toBeUndefined();
    expect(state.adventure!.winnerPlayerId ?? null).toBeNull();
    expect(state.phase).not.toBe("game-over");
    expect(state.players.p2.eliminated).toBeFalsy();
  });

  it("CONTROL — Grail / Dragon Hunt / Dragon Conqueror record no PvP credit either", () => {
    for (const mode of ["grail", "dragon-hunt", "dragon-conqueror"] as VictoryMode[]) {
      const state = makeGame(mode);
      stagePvpWin(state, "p1", "p2");
      expect(state.adventure!.heroDefeats?.p1, mode).toBeUndefined();
      expect(state.adventure!.winnerPlayerId ?? null, mode).toBeNull();
    }
  });

  it("setup seeds heroDefeats ONLY for Conquer", () => {
    expect(makeGame("conquer").adventure!.heroDefeats).toEqual({});
    for (const mode of ["conquest", "grail", "dragon-hunt", "dragon-conqueror"] as VictoryMode[]) {
      expect(makeGame(mode).adventure!.heroDefeats, mode).toBeUndefined();
    }
  });
});

describe("AUDIT v127 — elimination is the shared win path in EVERY mode", () => {
  it.each(["conquest", "conquer", "grail", "dragon-hunt", "dragon-conqueror"] as VictoryMode[])(
    "%s: the last faction standing still wins",
    (mode) => {
      const state = makeGame(mode);
      eliminatePlayer(state, "p2", "audit elimination", false);
      expect(state.adventure!.winnerPlayerId).toBe("p1");
      expect(state.phase).toBe("game-over");
      expect(state.eventLog.some((event) => event.type === "GAME_WON")).toBe(true);
    }
  );

  it("Conquest 3-player: one elimination is NOT a win; the second one is", () => {
    const state = makeGame("conquest", [P1, P2, P3]);
    eliminatePlayer(state, "p2", "audit elimination", false);
    expect(state.adventure!.winnerPlayerId ?? null).toBeNull();
    eliminatePlayer(state, "p3", "audit elimination", false);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });
});

describe("AUDIT v127 — the 'beat every SURVIVING rival' shortcut (USER FEATURE 2026-09-06, kept)", () => {
  it("Conquer 4p: 1 cube + two rivals eliminated by others completes the PvP path when the last survivor is already beaten", () => {
    const state = makeGame("conquer", [P1, P2, P3, P4]);
    expect(requiredRivalHeroDefeats(state, "p1")).toBe(2);

    // p1 beats p2 once (1 cube of the 2 required).
    stagePvpWin(state, "p1", "p2");
    expect(conquestProgress(state, "p1")).toBe(1);
    expect(state.adventure!.winnerPlayerId ?? null).toBeNull();

    // p3 and p4 leave without ever fighting p1 (forfeit / clock).
    eliminatePlayer(state, "p3", "audit elimination", true);
    eliminatePlayer(state, "p4", "audit elimination", true);

    // Only p2 is left and p1 has already beaten them: the fixed target (2) is
    // untouched by the departures, but no unbeaten rival remains to earn the
    // missing cube from, so the surviving-rival shortcut completes the path
    // (the codex v127 draft had dropped it, which left this seat with an
    // unreachable "PvP wins 1/2" and only elimination as a way out).
    expect(conquestProgress(state, "p1")).toBe(1);
    expect(requiredRivalHeroDefeats(state, "p1")).toBe(2);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });

  it("CONTROL — Conquest (elimination mode) never takes the shortcut", () => {
    const state = makeGame("conquest", [P1, P2, P3, P4]);
    stagePvpWin(state, "p1", "p2");
    eliminatePlayer(state, "p3", "audit elimination", true);
    eliminatePlayer(state, "p4", "audit elimination", true);
    expect(state.adventure!.heroDefeats).toBeUndefined();
    expect(state.adventure!.winnerPlayerId ?? null).toBeNull();
    eliminatePlayer(state, "p2", "audit elimination", false);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });
});

describe("AUDIT v127 — saves and defaults", () => {
  it("an OLD conquest save carrying heroDefeats is inert (no retroactive win)", () => {
    const state = makeGame("conquest", [P1, P2, P3]);
    state.adventure!.heroDefeats = { p1: ["p2", "p3"] };
    checkConquestVictory(state, "p1");
    expect(state.adventure!.winnerPlayerId ?? null).toBeNull();
    expect(adventureVictoryMode(state)).toBe("conquest");
  });

  it("a snapshot with NO victoryMode still reads as conquest (elimination)", () => {
    const state = makeGame("conquer");
    delete (state.adventure as { victoryMode?: VictoryMode }).victoryMode;
    expect(adventureVictoryMode(state)).toBe("conquest");
    expect(victoryModeCountsHeroDefeats(adventureVictoryMode(state))).toBe(false);
  });

  it("single player defaults to Conquest in both the game and the lobby", () => {
    const game = createAdventureGameState({ seed: "audit-sp", sessionMode: "single-player", rollFirstPlayer: false });
    expect(game.adventure!.victoryMode).toBe("conquest");
    const lobby = createAdventureLobbyState({ seed: "audit-sp-lobby", sessionMode: "single-player" });
    expect(lobby.setupLobby?.options.victoryMode).toBe("conquest");
  });

  it("an explicit single-player victoryMode still wins over the default", () => {
    const game = createAdventureGameState({
      seed: "audit-sp-explicit",
      sessionMode: "single-player",
      victoryMode: "conquer",
      rollFirstPlayer: false
    });
    expect(game.adventure!.victoryMode).toBe("conquer");
  });
});
