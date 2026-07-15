import {
  applyAction,
  computerDecisionOwner,
  getLegalActions,
  type GameAction,
  type GameState,
  type PlayerId,
} from "@/engine";
import { driveComputerPlayers } from "./computer-runner";

/**
 * Shared harness for the single-player computer soak / tempo suites. Extracted
 * from the (identical) helper blocks in single-player-soak.test.ts and
 * single-player-opening.test.ts so the new soak-matrix / tempo benchmarks reuse
 * ONE proven driver instead of a third copy.
 *
 * The scripted human plays a deterministic priority script (resolve whatever it
 * is asked, otherwise end the turn); computers are fully settled via
 * driveComputerPlayers after every human action. Nothing here calls `expect` —
 * it returns data (stall reason, invariant violations) so callers own the
 * assertions.
 */

/** Priority order for the scripted human: resolve prompts, then end the turn. */
export const HUMAN_PRIORITY: GameAction["type"][] = [
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

/**
 * A legal REFRESH_HAND that actually discards down when over the limit (the
 * legal-actions template ships discardCardIds: []). Engine requires discarding
 * to the hand limit (4 on a forced refresh, else 5) before refreshing.
 */
function withHumanRefreshDiscards(
  state: GameState,
  action: Extract<GameAction, { type: "REFRESH_HAND" }>,
  playerId: PlayerId,
): GameAction {
  const player = state.players[playerId];
  if (!player) return action;
  const limit = player.needsHandRefresh ? 4 : 5;
  const discardCount = Math.max(0, player.hand.length - limit);
  return { ...action, discardCardIds: player.hand.slice(0, discardCount) };
}

/** The scripted human's next action, or null when it has nothing legal to do. */
export function pickHumanAction(
  state: GameState,
  playerId: PlayerId = "p1",
): GameAction | null {
  const offers = getLegalActions(state, playerId);
  if (offers.length === 0) return null;
  for (const type of HUMAN_PRIORITY) {
    const hit = offers.find((legal) => legal.action.type === type);
    if (hit) {
      if (hit.action.type === "REFRESH_HAND") {
        return withHumanRefreshDiscards(state, hit.action, playerId);
      }
      return hit.action;
    }
  }
  // Last resort: any non-give-up action (e.g. a PvP combat where a computer
  // attacked the human — muddle through the defense instead of conceding).
  const safe = offers.find(
    (legal) =>
      legal.action.type !== "GIVE_UP" && legal.action.type !== "GIVE_UP_COMBAT",
  );
  const chosen = safe ?? offers[0];
  if (chosen.action.type === "REFRESH_HAND") {
    return withHumanRefreshDiscards(state, chosen.action, playerId);
  }
  return chosen.action;
}

/**
 * Non-negative resource / finite-counter invariants. Returns a list of human
 * readable violations (empty = clean) so the caller asserts on it. Covers every
 * live seat's resources, open-combat unit damage, and the round/event counters.
 */
export function invariantViolations(state: GameState, label: string): string[] {
  const problems: string[] = [];
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (!player || player.eliminated) continue;
    const r = player.resources;
    if ((r.gold ?? 0) < 0) problems.push(`${label} ${playerId} gold=${r.gold}`);
    if ((r.buildingMaterials ?? 0) < 0)
      problems.push(`${label} ${playerId} mats=${r.buildingMaterials}`);
    if ((r.valuables ?? 0) < 0)
      problems.push(`${label} ${playerId} vals=${r.valuables}`);
  }
  if (state.combat) {
    for (const unit of Object.values(state.combat.units)) {
      if (!(unit.damage >= 0) || !Number.isFinite(unit.damage)) {
        problems.push(`${label} unit ${unit.id} damage=${unit.damage}`);
      }
    }
  }
  if (!Number.isFinite(state.round)) problems.push(`${label} round=${state.round}`);
  if (!Number.isFinite(state.eventCounter ?? state.eventLog.length)) {
    problems.push(`${label} eventCounter NaN`);
  }
  return problems;
}

export type SoakRunResult = {
  state: GameState;
  stalled: boolean;
  reason?: string;
  loops: number;
  /** Every non-negative-resource / finite-counter violation seen along the way. */
  violations: string[];
};

export type PlayUntilRoundOptions = {
  maxLoops?: number;
  humanPlayerId?: PlayerId;
  /** Called after each fully-settled loop (for per-round tempo checkpoints). */
  onLoop?: (state: GameState, loop: number) => void;
};

/**
 * Advance the table until `targetRound` is reached with the human to act (or the
 * game ends). Computers are settled fully after every human action; the runner
 * never stalls in a healthy game. Accumulates invariant violations rather than
 * throwing, so a single run reports every problem it hit.
 */
export function playUntilRound(
  initial: GameState,
  targetRound: number,
  options: PlayUntilRoundOptions = {},
): SoakRunResult {
  const maxLoops = options.maxLoops ?? 400;
  const humanPlayerId = options.humanPlayerId ?? "p1";
  const violations: string[] = [];
  let state = initial;
  let loops = 0;
  while (loops < maxLoops) {
    loops += 1;
    const run = driveComputerPlayers(state);
    if (run.stalled) {
      return { state: run.state, stalled: true, reason: run.reason, loops, violations };
    }
    state = run.state;
    violations.push(...invariantViolations(state, `loop ${loops}`));
    options.onLoop?.(state, loops);

    if (state.phase === "game-over" && !state.combat) {
      return { state, stalled: false, loops, violations };
    }
    if (
      state.round >= targetRound &&
      state.activePlayerId === humanPlayerId &&
      !computerDecisionOwner(state)
    ) {
      return { state, stalled: false, loops, violations };
    }

    if (computerDecisionOwner(state)) {
      // Fully settled above — a computer still owning is a stall.
      return {
        state,
        stalled: true,
        reason: "computer still owns after drive",
        loops,
        violations,
      };
    }
    const action = pickHumanAction(state, humanPlayerId);
    if (!action) {
      return {
        state,
        stalled: true,
        reason: "human has no legal actions",
        loops,
        violations,
      };
    }
    const result = applyAction(state, action);
    if (result.errors.length > 0) {
      return {
        state,
        stalled: true,
        reason: result.errors.join("; "),
        loops,
        violations,
      };
    }
    state = result.state;
  }
  return {
    state,
    stalled: true,
    reason: `exceeded ${maxLoops} loops`,
    loops,
    violations,
  };
}
