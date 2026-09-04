import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  describeCustomWinCondition,
  getLegalActions,
  getMainHero,
  type CustomWinCondition,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { eliminatePlayer, pvpAttacksBanned, startAdventureRound } from "./adventure";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { computerDecisionOwner } from "./computer/window";
import { arenaDuelAttackerIndex, arenaDuelNumberForRound, arenaDuelWins } from "./arena-duel";
import { NEUTRAL_PLAYER_ID } from "./state";

// ---------------------------------------------------------------------------
// "Arena duels" custom win condition (1v1 ONLY): at the start of rounds 4, 8
// and 12 the two MAIN heroes fight a PvP battle wherever they stand, and the
// match is a best of three (2 duel wins wins the game). The normal victory mode
// keeps running in parallel.
//
// Every claim asserts an observable outcome (a combat really opening with both
// heroes, the tally, hero POSITIONS, resources, winnerPlayerId, the GAME_WON
// reason, a public feed line) and carries a CONTROL that fails if the wiring is
// removed. Mutation kills are recorded per test.
// ---------------------------------------------------------------------------

const ARENA: CustomWinCondition[] = [{ kind: "arena-duel" }];

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function duelGame(
  seed: string,
  opts: { conditions?: CustomWinCondition[]; players?: number } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    victoryMode: "conquest",
    ...(opts.players === 3
      ? {
          players: [
            { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
            { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" },
            { id: "p3", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
          ] as never
        }
      : {}),
    customWinConditions: opts.conditions ?? ARENA
  });
  // Inert Astrologers proclamations so the even rounds never open their own
  // choice/barrier on top of the duel.
  for (let i = 0; i < 10; i += 1) {
    state.decks.astrologers?.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

/** Real END_TURN round wraps until `state.round === round` (or a combat opens). */
function playToRound(state: GameState, round: number): GameState {
  let next = state;
  let guard = 0;
  while (next.round < round && !next.combat && guard < 40) {
    guard += 1;
    const seats = next.turnOrder.filter(
      (id) => id !== NEUTRAL_PLAYER_ID && !next.players[id]?.eliminated
    );
    for (const playerId of seats) {
      if (next.combat || next.round >= round) {
        break;
      }
      const refresh = getLegalActions(next, playerId).find(
        (entry) => entry.action.type === "REFRESH_HAND"
      );
      if (refresh) {
        next = apply(next, refresh.action);
      }
      const end = getLegalActions(next, playerId).find(
        (entry) => entry.action.type === "END_TURN"
      );
      if (!end) {
        break;
      }
      next = apply(next, end.action);
    }
  }
  return next;
}

/** applyAction in place (the caller keeps one `state` object). */
function step(state: GameState, action: GameAction): void {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  Object.assign(state, result.state);
}

/**
 * Settle the OPEN duel in `winner`'s favour through the REAL path: both sides
 * accept the prep, both really deploy (so a unit activation publishes the acting
 * side as activePlayerId — the wave-branch bug this feature inherits), then the
 * outcome is forced and the real finalize runs. Drains the winner's Necromancy
 * window and the round-start queue afterwards.
 */
function settleDuel(state: GameState, winner: PlayerId): void {
  const combat = state.combat;
  expect(combat, "a duel must be open").toBeTruthy();
  const sides = [combat!.attackerPlayerId, combat!.defenderPlayerId];
  for (const playerId of sides) {
    const accept = getLegalActions(state, playerId).find(
      (entry) => entry.action.type === "ACCEPT_COMBAT"
    );
    if (accept) {
      step(state, accept.action);
    }
  }
  // Real deployment: one unit each, then finish. Answer any activation-order
  // tie so the fight genuinely begins.
  for (let i = 0; i < 6 && state.combat?.setup; i += 1) {
    const owner = state.combat.setup.pendingPlayerIds[0];
    if (!owner) {
      break;
    }
    const place = getLegalActions(state, owner).find(
      (entry) => entry.action.type === "PLACE_COMBAT_UNIT"
    );
    if (place) {
      step(state, place.action);
    }
    const finish = getLegalActions(state, owner).find(
      (entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT"
    );
    if (!finish) {
      break;
    }
    step(state, finish.action);
  }
  for (let i = 0; i < 6 && state.pendingChoice && state.combat; i += 1) {
    const choice = state.pendingChoice;
    step(state, {
      type: "CHOOSE_OPTION",
      playerId: choice.playerId,
      choiceId: choice.id,
      optionIndex: 0
    });
  }
  const loser =
    state.combat!.attackerPlayerId === winner
      ? state.combat!.defenderPlayerId
      : state.combat!.attackerPlayerId;
  state.combat!.outcome = {
    winnerPlayerId: winner,
    defeatedPlayerId: loser,
    reason: "all-enemy-units-defeated"
  };
  finalizeAdventureCombat(state);
  pumpAdventureQueues(state);
  for (let i = 0; i < 3; i += 1) {
    const skip = getLegalActions(state, winner).find(
      (entry) => entry.action.type === "SKIP_NECROMANCY"
    );
    if (!skip) {
      break;
    }
    const result = applyAction(state, skip.action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    Object.assign(state, result.state);
  }
}

function wonReason(state: GameState): string | null {
  const won = state.eventLog.find((event) => event.type === "GAME_WON");
  return won?.type === "GAME_WON" ? won.reason : null;
}

// ===========================================================================
// 1. The schedule (pure) + describe/sanitize plumbing.
// ===========================================================================

describe("Arena duels — schedule and plumbing", () => {
  it("only rounds 4/8/12 host a duel, numbered 1-3, with an alternating attacker", () => {
    expect(arenaDuelNumberForRound(4)).toBe(1);
    expect(arenaDuelNumberForRound(8)).toBe(2);
    expect(arenaDuelNumberForRound(12)).toBe(3);
    // CONTROL: every other round (incl. the announcement rounds) hosts none.
    for (const round of [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 16]) {
      expect(arenaDuelNumberForRound(round), `round ${round}`).toBeNull();
    }
    expect(arenaDuelAttackerIndex(1)).toBe(0);
    expect(arenaDuelAttackerIndex(2)).toBe(1);
    expect(arenaDuelAttackerIndex(3)).toBe(0);
  });

  it("describeCustomWinCondition names the series", () => {
    expect(describeCustomWinCondition({ kind: "arena-duel" })).toBe(
      "win the arena best of three (duels at rounds 4, 8 and 12)"
    );
  });

  it("SET_GAME_OPTIONS sanitizes the parameterless condition (stray fields dropped, copies deduped)", () => {
    let lobby = createAdventureLobbyState({ seed: "arena-lobby" });
    lobby = apply(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        customWinConditions: [
          { kind: "arena-duel", count: 9 } as unknown as CustomWinCondition,
          { kind: "gold", amount: 200 }
        ]
      }
    });
    expect(lobby.setupLobby?.options.customWinConditions).toEqual([
      { kind: "arena-duel" },
      { kind: "gold", amount: 200 }
    ]);
  });

  it("the built game carries the condition and reports 0 / 2 progress up front", () => {
    const state = duelGame("arena-progress");
    expect(state.adventure?.mapPreset?.customWinConditions).toEqual([{ kind: "arena-duel" }]);
    expect(arenaDuelWins(state, "p1")).toBe(0);
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
  });
});

// ===========================================================================
// 2. The 1v1 build gate.
// ===========================================================================

describe("Arena duels — the 1v1 gate", () => {
  it("a 3-player game DROPS the condition with a public feed line, and a sibling condition survives", () => {
    const state = duelGame("arena-three", {
      players: 3,
      conditions: [{ kind: "arena-duel" }, { kind: "gold", amount: 200 }]
    });
    expect(state.adventure?.mapPreset?.customWinConditions).toEqual([
      { kind: "gold", amount: 200 }
    ]);
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "MAP_SECRET_FEATURE_FALLBACK" && event.feature === "arena-duel"
      ),
      "the drop must be announced, never silent"
    ).toBe(true);
  });

  it("CONTROL: the same 3-player game keeps a lone sibling condition and raises NO fallback line", () => {
    const state = duelGame("arena-three-control", {
      players: 3,
      conditions: [{ kind: "gold", amount: 200 }]
    });
    expect(state.adventure?.mapPreset?.customWinConditions).toEqual([
      { kind: "gold", amount: 200 }
    ]);
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "MAP_SECRET_FEATURE_FALLBACK" && event.feature === "arena-duel"
      )
    ).toBe(false);
  });

  it("a 3-player game never schedules a duel — round 4 opens no combat at all", () => {
    let state = duelGame("arena-three-round4", { players: 3, conditions: ARENA });
    state = playToRound(state, 4);
    expect(state.round).toBeGreaterThanOrEqual(4);
    expect(state.combat).toBeNull();
  });
});

// ===========================================================================
// 3. The duel really opens at round 4, wherever the heroes stand.
// ===========================================================================

describe("Arena duels — the round-start duel", () => {
  it("round 4 opens a PvP battle between BOTH main heroes even though they stand far apart", () => {
    let state = duelGame("arena-open");
    // The announcement lands the round BEFORE (round 3, a Resource round).
    state = playToRound(state, 4);
    expect(state.round).toBe(4);

    const combat = state.combat;
    expect(combat, "the duel must open at round 4").toBeTruthy();
    expect(combat!.context.kind).toBe("player");
    const context = combat!.context;
    expect(context.kind === "player" && context.arenaDuel?.duel).toBe(1);
    // Both MAIN heroes are the fighters, and neither is a siege/holding defense.
    const p1Hero = getMainHero(state, "p1")!;
    const p2Hero = getMainHero(state, "p2")!;
    expect([context.kind === "player" ? context.attackerHeroId : null]).toContain(
      combat!.attackerPlayerId === "p1" ? p1Hero.id : p2Hero.id
    );
    expect(context.kind === "player" && context.defenderHeroId).toBe(
      combat!.defenderPlayerId === "p1" ? p1Hero.id : p2Hero.id
    );
    expect(context.kind === "player" && context.siege).toBeFalsy();
    expect(context.kind === "player" && context.holdingDefense).toBeFalsy();
    // The heroes are NOT on the same hex — the duel ignored the map entirely.
    expect(p1Hero.spaceId).not.toBe(p2Hero.spaceId);
    // Duel 1 belongs to the first seat in turn order.
    expect(combat!.attackerPlayerId).toBe(state.turnOrder[0]);
    // Announced twice: one round ahead and at the duel itself.
    const notes = state.eventLog.filter(
      (event) => event.type === "EVENT_NOTE" && event.message.includes("arena")
    );
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(
      state.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && event.message.includes("Arena duel 1 of 3")
      )
    ).toBe(true);
  });

  it("CONTROL: without the condition the same game reaches round 4 with no combat", () => {
    let state = duelGame("arena-open-control", { conditions: [{ kind: "gold", amount: 500 }] });
    state = playToRound(state, 4);
    expect(state.round).toBe(4);
    expect(state.combat).toBeNull();
  });

  it("a round can never queue its duel twice (a re-entered round start is idempotent)", () => {
    let state = duelGame("arena-idempotent");
    state = playToRound(state, 4);
    expect(state.adventure?.arenaDuels?.fought).toEqual([4]);
    const queuedBefore = state.adventure!.rewardQueue.filter(
      (reward) => reward.kind === "arena-duel"
    ).length;
    startAdventureRound(state);
    expect(
      state.adventure!.rewardQueue.filter((reward) => reward.kind === "arena-duel").length
    ).toBe(queuedBefore);
  });

  it("SANCTUARY does not cancel the arena: the scheduled duel still opens on that round", () => {
    let state = duelGame("arena-sanctuary");
    state = playToRound(state, 3);
    // Round 4 is an Astrologers round: make its proclamation Sanctuary ("Heroes
    // cannot attack one another this round"). A duel is a scheduled event, not a
    // hero choosing to attack, so it must still open — and it must not THROW
    // (a throw inside the round-start pump would freeze the table).
    state.decks.astrologers!.drawPile.push("astrologers.sanctuary");
    state = playToRound(state, 4);
    expect(pvpAttacksBanned(state), "Sanctuary must really be in force").toBe(true);
    const context = state.combat?.context;
    expect(context?.kind === "player" && context.arenaDuel?.duel).toBe(1);
  });

  it("the arena is never a HOLDING defense: the attacker standing on the enemy's own Settlement still duels on a plain board", () => {
    let state = duelGame("arena-no-holding");
    state = playToRound(state, 3);
    // Park the round-4 attacker (seat 1) on a Settlement flagged by seat 2. On an
    // ordinary PvP attack that is a settlement DEFENSE; a scheduled duel must
    // ignore it (the fieldId is only the board anchor).
    const seatOne = state.turnOrder[0]!;
    const seatTwo = state.turnOrder[1]!;
    const hero = getMainHero(state, seatOne)!;
    const field = state.adventure!.fields[hero.spaceId!]!;
    field.location = "settlement";
    field.flagOwnerId = seatTwo;
    state = playToRound(state, 4);
    const context = state.combat!.context;
    expect(context.kind === "player" && context.arenaDuel?.duel).toBe(1);
    expect(context.kind === "player" && context.holdingDefense).toBeUndefined();
    expect(context.kind === "player" && context.siege).toBeFalsy();
    expect(state.combat!.siege ?? null).toBeNull();
  });

  it("the duel opens as a real PvP PREP window — both seats may still shop before deploying", () => {
    let state = duelGame("arena-prep");
    state = playToRound(state, 4);
    expect(state.combat?.prep).toBeTruthy();
    for (const playerId of [state.combat!.attackerPlayerId, state.combat!.defenderPlayerId]) {
      expect(
        getLegalActions(state, playerId).some(
          (entry) => entry.action.type === "ACCEPT_COMBAT"
        ),
        `${playerId} must be able to accept`
      ).toBe(true);
    }
  });
});

// ===========================================================================
// 4. What a resolved duel costs (and does NOT cost).
// ===========================================================================

describe("Arena duels — the resolution", () => {
  it("a resolved duel scores a point and costs the loser NOTHING on the map", () => {
    let state = duelGame("arena-resolve");
    state = playToRound(state, 4);
    const attackerId = state.combat!.attackerPlayerId;
    const defenderId = state.combat!.defenderPlayerId;
    const p1Space = getMainHero(state, "p1")!.spaceId;
    const p2Space = getMainHero(state, "p2")!.spaceId;
    const goldBefore = {
      p1: state.players.p1.resources.gold,
      p2: state.players.p2.resources.gold
    };
    const moraleBefore = state.players[defenderId]!.morale;
    const flagsBefore = Object.values(state.adventure!.fields)
      .map((field) => `${field.spaceId}:${field.flagOwnerId ?? "-"}`)
      .join("|");

    settleDuel(state, attackerId);

    // The tally moved…
    expect(arenaDuelWins(state, attackerId)).toBe(1);
    expect(arenaDuelWins(state, defenderId)).toBe(0);
    expect(state.adventure?.arenaDuels?.fought).toEqual([4]);
    expect(
      state.eventLog.some(
        (event) => event.type === "ARENA_DUEL_RESOLVED" && event.winnerPlayerId === attackerId
      )
    ).toBe(true);
    // …and NOTHING else did: both heroes stand exactly where they were.
    expect(getMainHero(state, "p1")!.spaceId).toBe(p1Space);
    expect(getMainHero(state, "p2")!.spaceId).toBe(p2Space);
    // No gold toll in either direction, no morale hit, no flag changed.
    expect(state.players.p1.resources.gold).toBe(goldBefore.p1);
    expect(state.players.p2.resources.gold).toBe(goldBefore.p2);
    expect(state.players[defenderId]!.morale).toBe(moraleBefore);
    expect(
      Object.values(state.adventure!.fields)
        .map((field) => `${field.spaceId}:${field.flagOwnerId ?? "-"}`)
        .join("|")
    ).toBe(flagsBefore);
    // The loser is NOT eliminated and no conquest hero-defeat credit was paid.
    expect(state.players[defenderId]!.eliminated).toBeFalsy();
    expect(state.adventure?.heroDefeats?.[attackerId] ?? []).not.toContain(defenderId);
    // The game is not over on one duel.
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
  });

  it("after the duel the round's FIRST seat holds the turn and still owes/gets its draw", () => {
    let state = duelGame("arena-turn-restore");
    state = playToRound(state, 4);
    // Deploy for real so an activation publishes SEAT 2 as activePlayerId — the
    // exact corruption the restore exists for. Without that divergence this test
    // would pass with the restore removed (the monster-waves lesson).
    const defenderSeat = state.combat!.defenderPlayerId;
    for (const playerId of [state.combat!.attackerPlayerId, defenderSeat]) {
      const accept = getLegalActions(state, playerId).find(
        (entry) => entry.action.type === "ACCEPT_COMBAT"
      );
      if (accept) {
        step(state, accept.action);
      }
    }
    for (let i = 0; i < 6 && state.combat?.setup; i += 1) {
      const owner = state.combat.setup.pendingPlayerIds[0];
      if (!owner) {
        break;
      }
      const place = getLegalActions(state, owner).find(
        (entry) => entry.action.type === "PLACE_COMBAT_UNIT"
      );
      if (place) {
        step(state, place.action);
      }
      const finish = getLegalActions(state, owner).find(
        (entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT"
      );
      if (!finish) {
        break;
      }
      step(state, finish.action);
    }
    // Force seat 2 to hold the turn the way a real activation would.
    state.activePlayerId = defenderSeat;
    expect(state.activePlayerId).not.toBe(state.turnOrder[0]);
    settleDuel(state, defenderSeat);
    expect(state.combat).toBeNull();
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    const firstSeat = state.turnOrder[0]!;
    expect(state.activePlayerId).toBe(firstSeat);
    expect(state.turn.observingPlayerId).toBe(firstSeat);
    const actions = getLegalActions(state, firstSeat);
    expect(
      actions.some((entry) => entry.action.type === "REFRESH_HAND"),
      "the start-of-turn draw must still be offered after the duel"
    ).toBe(true);
    expect(actions.some((entry) => entry.action.type === "END_TURN")).toBe(true);
  });

  it("TWO duel wins wins the game with the arena reason (and the third duel never opens)", () => {
    let state = duelGame("arena-two-wins");
    state = playToRound(state, 4);
    const champion = state.combat!.attackerPlayerId;
    settleDuel(state, champion);
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();

    state = playToRound(state, 8);
    expect(state.round).toBe(8);
    expect(state.combat, "duel 2 must open at round 8").toBeTruthy();
    const context = state.combat!.context;
    expect(context.kind === "player" && context.arenaDuel?.duel).toBe(2);
    // Duel 2's attacker is the OTHER seat.
    expect(state.combat!.attackerPlayerId).toBe(state.turnOrder[1]);
    settleDuel(state, champion);

    expect(state.adventure?.winnerPlayerId).toBe(champion);
    expect(wonReason(state)).toContain("arena best of three");
    expect(arenaDuelWins(state, champion)).toBe(2);
  });

  it("one win each is decided by duel 3 at round 12", () => {
    let state = duelGame("arena-decider");
    state = playToRound(state, 4);
    const seatOne = state.turnOrder[0]!;
    const seatTwo = state.turnOrder[1]!;
    settleDuel(state, seatOne);
    state = playToRound(state, 8);
    settleDuel(state, seatTwo);
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(arenaDuelWins(state, seatOne)).toBe(1);
    expect(arenaDuelWins(state, seatTwo)).toBe(1);

    state = playToRound(state, 12);
    expect(state.round).toBe(12);
    const context = state.combat!.context;
    expect(context.kind === "player" && context.arenaDuel?.duel).toBe(3);
    // Duel 3 swings back to the first seat.
    expect(state.combat!.attackerPlayerId).toBe(seatOne);
    settleDuel(state, seatTwo);
    expect(state.adventure?.winnerPlayerId).toBe(seatTwo);
    expect(wonReason(state)).toContain("arena best of three");
  });

  it("conquest still ends the series: eliminating the opponent wins whatever the duel tally says", () => {
    let state = duelGame("arena-conquest");
    state = playToRound(state, 4);
    const seatOne = state.turnOrder[0]!;
    const seatTwo = state.turnOrder[1]!;
    // Seat two leads the series 1-0 …
    settleDuel(state, seatTwo);
    expect(arenaDuelWins(state, seatTwo)).toBe(1);
    // … and is then knocked out of the game entirely.
    eliminatePlayer(state, seatTwo, "gave up", true);
    expect(state.adventure?.winnerPlayerId).toBe(seatOne);
    expect(arenaDuelWins(state, seatTwo)).toBe(1);
  });

  it("a game already won never opens a queued duel (the queue drops it)", () => {
    let state = duelGame("arena-won-first");
    state = playToRound(state, 3);
    // Win by conquest during round 3 — the duel for round 4 has not been queued
    // yet, so drive the round start with the winner already set.
    eliminatePlayer(state, state.turnOrder[1]!, "gave up", true);
    expect(state.adventure?.winnerPlayerId).toBe(state.turnOrder[0]);
    const before = state.combat;
    pumpAdventureQueues(state);
    expect(state.combat).toBe(before);
  });
});

// ===========================================================================
// 5. A computer seat can complete a duel (no stall).
// ===========================================================================

describe("Arena duels — a computer seat", () => {
  it("the computer seat OWNS the decision during the duel's prep window", () => {
    let state = duelGame("arena-ai");
    state = playToRound(state, 4);
    expect(state.combat?.prep).toBeTruthy();
    // Make seat 2 computer-controlled: the prep gate must name it as the seat
    // that owes the next decision (its accept), never "nobody".
    const aiSeat = state.combat!.defenderPlayerId;
    state.controllers = { ...(state.controllers ?? {}), [aiSeat]: { kind: "computer" } as never };
    expect(computerDecisionOwner(state)).toBe(aiSeat);
    // Once it accepts, the human's own accept is still owed (and the AI owes
    // nothing more) — so the table waits for the human rather than stalling.
    const accept = getLegalActions(state, aiSeat).find(
      (entry) => entry.action.type === "ACCEPT_COMBAT"
    );
    expect(accept).toBeTruthy();
    state = apply(state, accept!.action);
    expect(computerDecisionOwner(state)).toBeNull();
  });
});
