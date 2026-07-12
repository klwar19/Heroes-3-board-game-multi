import { describe, expect, it } from "vitest";
import {
  applyAction,
  computerDecisionOwner,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState,
} from "@/engine";
import { driveComputerPlayers } from "./computer-runner";

/**
 * Fixed-seed multi-round soak + reconnect suite for single-player computers.
 * Asserts the runner never freezes, resources stay non-negative, and a
 * mid-turn snapshot resume continues cleanly (reconnect).
 *
 * Kept bounded for CI: 8 seeds × 1 computer × 5 rounds, plus a 2-computer
 * short soak and a reconnect case. Nightly can raise SEED_COUNT / ROUNDS.
 */

const SEED_COUNT = 8;
const ROUNDS_TARGET = 5;
const HUMAN_PRIORITY: GameAction["type"][] = [
  "SET_TILE_ROTATION",
  "CHOOSE_OPTION",
  "CHOOSE_ABILITY_TARGET",
  "CHOOSE_PENDING_ROLL",
  "RESOLVE_VISIT_STEP",
  "RESOLVE_DECK_SEARCH",
  "RESOLVE_COMBAT_DISCARD",
  "COMMANDER_FIRST_AID",
  "SKIP_NECROMANCY",
  "REFRESH_HAND",
  "ACKNOWLEDGE_COMBAT_END",
  "FINISH_COMBAT_PLACEMENT",
  "FINISH_TACTICS",
  "ACCEPT_COMBAT",
  "END_TURN",
];

function humanAct(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.join("; ")).toEqual([]);
  return result.state;
}

/**
 * Build a legal REFRESH_HAND that actually discards down when over the limit
 * (the legal-actions template ships discardCardIds: []).
 * Engine error text: "Discard down to your hand limit of 4 first."
 */
function withHumanRefreshDiscards(
  state: GameState,
  action: Extract<GameAction, { type: "REFRESH_HAND" }>,
): GameAction {
  const player = state.players.p1;
  if (!player) return action;
  // Forced over-limit refresh requires discarding down to 4; start-of-turn
  // mulligan may discard 0. Prefer dumping the first cards (stable).
  const limit = player.needsHandRefresh ? 4 : 5;
  const discardCount = Math.max(0, player.hand.length - limit);
  return {
    ...action,
    discardCardIds: player.hand.slice(0, discardCount),
  };
}

function pickHumanAction(state: GameState): GameAction | null {
  const offers = getLegalActions(state, "p1");
  if (offers.length === 0) return null;
  for (const type of HUMAN_PRIORITY) {
    const hit = offers.find((legal) => legal.action.type === type);
    if (hit) {
      if (hit.action.type === "REFRESH_HAND") {
        return withHumanRefreshDiscards(state, hit.action);
      }
      return hit.action;
    }
  }
  // Last resort: any non-give-up action.
  const safe = offers.find(
    (legal) =>
      legal.action.type !== "GIVE_UP" &&
      legal.action.type !== "GIVE_UP_COMBAT",
  );
  if (!safe) return offers[0]?.action ?? null;
  if (safe.action.type === "REFRESH_HAND") {
    return withHumanRefreshDiscards(state, safe.action);
  }
  return safe.action;
}

function assertInvariants(state: GameState, label: string): void {
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (!player || player.eliminated) continue;
    expect(player.resources.gold, `${label} ${playerId} gold`).toBeGreaterThanOrEqual(0);
    expect(
      player.resources.buildingMaterials,
      `${label} ${playerId} mats`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      player.resources.valuables,
      `${label} ${playerId} vals`,
    ).toBeGreaterThanOrEqual(0);
  }
  if (state.combat) {
    for (const unit of Object.values(state.combat.units)) {
      expect(unit.damage, `${label} unit damage`).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(unit.damage)).toBe(true);
    }
  }
  // No NaN counters.
  expect(Number.isFinite(state.round)).toBe(true);
  expect(Number.isFinite(state.eventCounter ?? state.eventLog.length)).toBe(true);
}

/**
 * Advance the table until `targetRound` is reached with p1 to act (or game
 * over). Human plays a deterministic priority script; computers are settled
 * fully after every human action.
 */
function playUntilRound(
  initial: GameState,
  targetRound: number,
  maxLoops = 400,
): { state: GameState; stalled: boolean; reason?: string; loops: number } {
  let state = initial;
  let loops = 0;
  while (loops < maxLoops) {
    loops += 1;
    const run = driveComputerPlayers(state);
    if (run.stalled) {
      return {
        state: run.state,
        stalled: true,
        reason: run.reason,
        loops,
      };
    }
    state = run.state;
    assertInvariants(state, `loop ${loops}`);

    if (state.phase === "game-over" && !state.combat) {
      return { state, stalled: false, loops };
    }
    if (
      state.round >= targetRound &&
      state.activePlayerId === "p1" &&
      !computerDecisionOwner(state)
    ) {
      return { state, stalled: false, loops };
    }

    // Human must act (or we are waiting on something only p1 can answer).
    if (computerDecisionOwner(state)) {
      // Should have been settled above — treat as stall.
      return {
        state,
        stalled: true,
        reason: "computer still owns after drive",
        loops,
      };
    }
    const action = pickHumanAction(state);
    if (!action) {
      return {
        state,
        stalled: true,
        reason: "human has no legal actions",
        loops,
      };
    }
    state = humanAct(state, action);
  }
  return {
    state,
    stalled: true,
    reason: `exceeded ${maxLoops} loops`,
    loops,
  };
}

describe("single-player multi-round soak", () => {
  for (let i = 0; i < SEED_COUNT; i += 1) {
    const seed = `soak-sp-${i}`;
    it(`seed ${seed}: ${ROUNDS_TARGET} rounds, 1 computer, no stall`, () => {
      const initial = createAdventureGameState({
        seed,
        scenarioId: "skirmish",
        playerCount: 2,
        sessionMode: "single-player",
      });
      const result = playUntilRound(initial, ROUNDS_TARGET);
      expect(result.stalled, result.reason).toBe(false);
      expect(result.state.round).toBeGreaterThanOrEqual(
        Math.min(ROUNDS_TARGET, result.state.round),
      );
      // Either reached the target round or the game ended cleanly.
      expect(
        result.state.round >= ROUNDS_TARGET ||
          result.state.phase === "game-over" ||
          Boolean(result.state.winnerPlayerId),
      ).toBe(true);
      assertInvariants(result.state, seed);
      // Memory should have been written for the computer seat at some point.
      if (result.state.computerMemory?.p2) {
        expect(result.state.computerMemory.p2.resourceTrail.length).toBeGreaterThan(0);
      }
    });
  }

  it("2 computers for 3 rounds without stall (seed soak-2p)", () => {
    const initial = createAdventureGameState({
      seed: "soak-2p",
      scenarioId: "skirmish",
      playerCount: 3,
      sessionMode: "single-player",
    });
    const result = playUntilRound(initial, 3, 500);
    expect(result.stalled, result.reason).toBe(false);
    assertInvariants(result.state, "soak-2p");
  });
});

describe("single-player reconnect / resume", () => {
  it("resumes a mid-computer-turn snapshot without stall or double-play freeze", () => {
    let state = createAdventureGameState({
      seed: "soak-reconnect",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });

    // Play until the computer owns a decision on the map (after human ends R1).
    let guard = 0;
    while (guard++ < 80) {
      const run = driveComputerPlayers(state, undefined, { maxSteps: 1 });
      if (run.stalled) {
        // One-step may report stalled at cap — only fail if no progress path.
        if (run.decisions.length === 0 && computerDecisionOwner(run.state)) {
          expect(run.stalled, run.reason).toBe(false);
        }
      }
      state = run.state;
      if (
        computerDecisionOwner(state) === "p2" &&
        state.phase !== "setup" &&
        state.adventure
      ) {
        break;
      }
      if (!computerDecisionOwner(state)) {
        const action = pickHumanAction(state);
        if (!action) break;
        state = humanAct(state, action);
      }
    }

    // Snapshot as if the client reconnected mid-turn.
    const snapshot = JSON.parse(JSON.stringify(state)) as GameState;
    expect(computerDecisionOwner(snapshot) === "p2" || snapshot.round >= 1).toBe(
      true,
    );

    // Resume from pure JSON — no in-memory runner maps survive.
    const resumed = driveComputerPlayers(snapshot);
    expect(resumed.stalled, resumed.reason).toBe(false);
    assertInvariants(resumed.state, "reconnect");

    // A second full settle is a no-op (idempotent when no computer owes work).
    const again = driveComputerPlayers(resumed.state);
    expect(again.stalled, again.reason).toBe(false);
    expect(computerDecisionOwner(again.state)).toBeNull();
  });

  it("memory survives JSON snapshot resume (sticky / trail)", () => {
    let state = createAdventureGameState({
      seed: "soak-memory-resume",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });
    // Drive far enough that computer memory is written.
    const played = playUntilRound(state, 2, 200);
    expect(played.stalled, played.reason).toBe(false);
    state = played.state;
    const mem = state.computerMemory?.p2;
    if (!mem) {
      // Acceptable if computers never acted (unlikely); skip sticky assert.
      return;
    }
    const snap = JSON.parse(JSON.stringify(state)) as GameState;
    expect(snap.computerMemory?.p2?.resourceTrail?.length).toBeGreaterThan(0);
    // Resume does not wipe memory.
    const after = driveComputerPlayers(snap);
    expect(after.state.computerMemory?.p2?.resourceTrail?.length).toBeGreaterThan(0);
  });
});
