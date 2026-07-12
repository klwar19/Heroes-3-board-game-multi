import {
  applyAction,
  chooseComputerAction,
  collectMapObjectives,
  computerDecisionOwner,
  computerPlayerIds,
  freshEntropy,
  legalityMatchKey,
  observeForComputer,
  primaryMapObjective,
  type ComputerDecision,
  type EngineResult,
  type GameAction,
  type GameState,
  type PlayerId,
} from "@/engine";
import {
  noteComputerAction,
  refreshComputerMemory,
  setStickyObjective,
} from "@/engine/computer/memory";

export const DEFAULT_COMPUTER_STEP_LIMIT = 256;

/** Delay between live map steps (move → roll → move) so the human can watch. */
export const COMPUTER_MAP_STEP_MS = 900;
/** Combat activations pace faster — still one action at a time, not bulk. */
export const COMPUTER_COMBAT_STEP_MS = 320;
/** Lobby/setup picks can be snappy; nobody wants to watch draft micro-steps. */
export const COMPUTER_SETUP_STEP_MS = 80;

export type ComputerApply = (
  state: GameState,
  action: GameAction,
  playerId: PlayerId,
) => EngineResult;

export type ComputerRunResult = {
  state: GameState;
  decisions: ComputerDecision[];
  stalled: boolean;
  reason?: string;
};

export function progressFingerprint(state: GameState, playerId: PlayerId): string {
  const adventure = state.adventure;
  const combat = state.combat;
  const lobby = state.setupLobby;
  const player = state.players[playerId];
  const heroes = Object.values(state.heroes)
    .filter((hero) => hero.controllerId === playerId)
    .map((hero) => [hero.id, hero.spaceId, hero.movementPoints]);
  return JSON.stringify({
    phase: state.phase,
    round: state.round,
    active: state.activePlayerId,
    priority: state.priorityPlayerId,
    eventCounter: state.eventCounter ?? state.eventLog.length,
    choice: state.pendingChoice?.id ?? null,
    reaction: state.reactionWindow?.id ?? null,
    // Setup progress lives in the lobby draft state: seat picks, rolled town/
    // hero options and bans all count as measurable progress.
    lobby: lobby
      ? [
          lobby.seats.map((seat) => [
            seat.playerId,
            seat.factionId,
            seat.heroDefId,
          ]),
          lobby.draft ?? null,
          lobby.startCheck ?? null,
        ]
      : null,
    combat: combat
      ? [
          combat.id,
          combat.activeUnitId,
          combat.setup?.pendingPlayerIds,
          combat.setup?.placedUnitIds,
          combat.pendingTacticsSwaps,
          combat.prep?.accepted,
          combat.awaitingContinue,
          combat.outcome,
          combat.endAcknowledged,
          // Unit-level progress: moves, damage, defends and removals inside an
          // activation must all count (a defend changes nothing else above).
          Object.values(combat.units).map((unit) => [
            unit.id,
            unit.position,
            unit.damage,
            unit.activatedThisRound,
            unit.movedThisActivation,
            unit.attacksThisActivation ?? 0,
          ]),
        ]
      : null,
    pending: [
      adventure?.pendingVisit?.playerId,
      // Visit step identity must count: auction bids / event choices that only
      // mutate the visit queue still advance progress. The FULL step tree is
      // fingerprinted (not just steps[0].type + length): a nested CHOOSE_ONE
      // that resolves one branch — e.g. the Scholar "Empower a Statistic" loop,
      // which drops the picked option and re-prompts with fewer — keeps the same
      // outer type and length, so a coarse read misses the progress and the
      // no-progress guard falsely stalls the paced pump. The step list is
      // already JSON-serializable content, so nesting it here is safe.
      adventure?.pendingVisit?.steps ?? null,
      adventure?.pendingTileChoice?.playerId,
      adventure?.pendingNecromancy?.playerId,
      adventure?.pendingCommanderFirstAid?.playerId,
      adventure?.pendingFarTileFlip?.playerId,
      adventure?.pendingGarrison?.defenderPlayerId,
      adventure?.pendingTokenTeleport?.playerId,
      // Event barrier / auction state (secret bids change without resource
      // deltas until resolve — still measurable progress).
      adventure?.eventResolution?.round ?? null,
      adventure?.events?.auction
        ? [adventure.events.auction.lotCardId, adventure.events.auction.bids]
        : null,
      adventure?.events?.deal ?? null,
      adventure?.rewardQueue?.length ?? 0,
    ],
    completed: state.turn.completedPlayerIds,
    player: player
      ? [
          player.resources,
          player.hand,
          player.deck.length,
          player.discard.length,
          player.army,
          player.eliminated,
        ]
      : null,
    heroes,
  });
}

const defaultApply: ComputerApply = (state, action, playerId) =>
  applyAction(state, action, { computerActorPlayerId: playerId });

const liveApply: ComputerApply = (state, action, playerId) =>
  applyAction(state, action, {
    computerActorPlayerId: playerId,
    entropy: freshEntropy(),
    now: Date.now(),
  });

/**
 * Transport-neutral computer pump: while a computer seat owns the next
 * required decision, pick one legal action and apply it, with per-fingerprint
 * retry/no-progress guards and a hard step cap. Live rooms call it through
 * settleComputerWork / settleComputerOneStep; tests may inject their own apply.
 */
export function driveComputerPlayers(
  initialState: GameState,
  apply: ComputerApply = defaultApply,
  options: { maxSteps?: number } = {},
): ComputerRunResult {
  const maxSteps = Math.max(
    1,
    Math.floor(options.maxSteps ?? DEFAULT_COMPUTER_STEP_LIMIT),
  );
  const decisions: ComputerDecision[] = [];
  const attemptedAtFingerprint = new Map<string, Set<string>>();
  let state = initialState;

  while (decisions.length < maxSteps) {
    const playerId = computerDecisionOwner(state);
    if (!playerId) {
      return { state, decisions, stalled: false };
    }

    // Refresh multi-round economy / sticky memory before the decision so the
    // policy sees up-to-date focus and visit thrash guards (persists on state).
    state = refreshComputerMemory(state, playerId);
    // Commit the current sticky map objective for this seat's main hero so the
    // next turn keeps the same march target when it is still valid.
    const mainHero = Object.values(state.heroes).find(
      (hero) => hero.controllerId === playerId && hero.kind === "main",
    );
    if (mainHero && state.adventure) {
      const objectives = collectMapObjectives(state, mainHero);
      const primary = primaryMapObjective(
        state,
        mainHero,
        objectives,
        state.computerMemory?.[playerId]?.stickyObjectiveSpaceId,
      );
      state = setStickyObjective(state, playerId, primary?.spaceId ?? null);
    }

    const observation = observeForComputer(state, playerId);
    const fingerprint = progressFingerprint(state, playerId);
    const attempted =
      attemptedAtFingerprint.get(fingerprint) ?? new Set<string>();
    attemptedAtFingerprint.set(fingerprint, attempted);
    const available = observation.legalActions.filter(
      (legal) => !attempted.has(legalityMatchKey(legal.action)),
    );
    const decision = chooseComputerAction({
      ...observation,
      legalActions: available,
    });
    if (!decision) {
      return {
        state,
        decisions,
        stalled: true,
        reason: `Computer ${playerId} owns the next decision but has no safe legal action.`,
      };
    }

    const actionKey = legalityMatchKey(decision.action);
    if (
      !observation.legalActions.some(
        (legal) => legalityMatchKey(legal.action) === actionKey,
      )
    ) {
      return {
        state,
        decisions,
        stalled: true,
        reason: "Computer policy selected an action outside the legal set.",
      };
    }
    attempted.add(actionKey);

    const result = apply(state, decision.action, playerId);
    if (result.errors.length > 0) {
      // Recompute at the same state and try another legal candidate. If none
      // remain, the next loop returns the explicit stall instead of spinning.
      continue;
    }
    const nextFingerprint = progressFingerprint(result.state, playerId);
    if (nextFingerprint === fingerprint) {
      return {
        state,
        decisions,
        stalled: true,
        reason: "Computer action succeeded without measurable progress.",
      };
    }
    // Persist action notes (visits, market, recruit) on the settled state.
    state = noteComputerAction(result.state, playerId, decision.action);
    decisions.push(decision);
  }

  return {
    state,
    decisions,
    stalled: true,
    reason: `Computer runner reached its ${maxSteps}-action safety limit.`,
  };
}

/**
 * Whether live rooms should FULLY settle computers in one transaction (setup
 * lobby only). Once the adventure is live, visible map/combat steps are paced
 * with intermediate broadcasts so the human watches real moves, rolls, and
 * rewards as they happen — not a post-hoc fake walk over an already-finished
 * turn.
 */
export function computerWorkIsInstantBulk(state: GameState): boolean {
  return state.phase === "setup";
}

/**
 * Actions the human should SEE one-by-one. Card/spell/ability plays are paced
 * so PvP (and any open combat) shows the same FX/feed as a human play — never
 * bulk-resolve a Magic Arrow or save into an invisible snapshot. Placement,
 * pass-reaction, finish-stage, and pure bookkeeping still bulk-apply.
 */
export function isPacedComputerAction(action: GameAction): boolean {
  switch (action.type) {
    case "MOVE_HERO":
    case "DISCOVER_TILE":
    case "PLACE_TILE":
    case "REVISIT_FIELD":
    case "SET_TILE_ROTATION":
    case "CHOOSE_PENDING_ROLL":
    case "ATTACK_UNIT":
    case "MOVE_AND_ATTACK_UNIT":
    case "MOVE_UNIT":
    case "DEFEND_UNIT":
    case "END_ACTIVATION":
    case "CONTINUE_NEUTRAL_COMBAT":
    // Visible card / spell / ability plays (combat AND map).
    case "CAST_SPELL":
    case "PLAY_CARD":
    case "PLAY_REACTION":
    case "PLAY_REACTIONS":
    case "USE_UNIT_ABILITY":
    case "USE_ACTIVE_EFFECT":
    case "USE_UNIT_RESURRECTION":
    case "USE_COMMANDER_CAST_REACTION":
    case "SPEND_MORALE":
    case "SUMMON_DEMONS":
    case "USE_GENIE_DECK_DRAW":
    // Market trades and visit resolves the human should notice.
    case "OPEN_MARKET":
    case "TRADE_RESOURCES":
    case "BUY_WAR_MACHINE":
      return true;
    default:
      return false;
  }
}

/** Delay before the next live computer step, by context. */
export function computerStepDelayMs(state: GameState): number {
  if (state.phase === "setup") {
    return COMPUTER_SETUP_STEP_MS;
  }
  if (state.combat && !state.combat.endAcknowledged) {
    return COMPUTER_COMBAT_STEP_MS;
  }
  return COMPUTER_MAP_STEP_MS;
}

/**
 * Apply bulk non-paced computer work, then at most ONE paced (visible) action.
 * Used by the live pump so the human sees move → (optional roll) → move, while
 * placement/pass-reaction/finish-stage still resolve without a delay each.
 */
export function settleComputerVisibleStep(state: GameState): ComputerRunResult {
  if (computerPlayerIds(state).length === 0) {
    return { state, decisions: [], stalled: false };
  }

  const decisions: ComputerDecision[] = [];
  let current = state;
  // Cap bulk non-paced work so a bug cannot spin forever inside one tick.
  const bulkCap = 64;
  for (let i = 0; i < bulkCap; i += 1) {
    if (!computerDecisionOwner(current)) {
      return { state: current, decisions, stalled: false };
    }
    const peek = driveComputerPlayers(current, liveApply, { maxSteps: 1 });
    if (peek.decisions.length === 0) {
      return {
        state: current,
        decisions,
        stalled: peek.stalled,
        reason: peek.reason,
      };
    }
    const step = peek.decisions[0];
    current = peek.state;
    decisions.push(step);
    if (isPacedComputerAction(step.action)) {
      // One visible action per broadcast frame.
      return { state: current, decisions, stalled: false };
    }
  }
  return {
    state: current,
    decisions,
    stalled: true,
    reason: "Computer visible-step bulk cap reached.",
  };
}

/** @deprecated alias — prefer settleComputerVisibleStep for live pacing. */
export function settleComputerOneStep(state: GameState): ComputerRunResult {
  return settleComputerVisibleStep(state);
}

/**
 * Transport-facing full settle: run every owed computer decision through
 * applyAction with trusted computer authority. Used by tests and by live
 * setup (instant bulk). Adventure/combat live rooms use
 * settleComputerVisibleStep + a scheduled pump instead so each visible action
 * is its own broadcast.
 */
export function settleComputerWork(state: GameState): GameState {
  if (computerPlayerIds(state).length === 0) {
    return state;
  }
  const result = driveComputerPlayers(state, liveApply);
  if (result.stalled) {
    console.warn(
      `[computer-runner] ${result.reason ?? "stalled"} (after ${result.decisions.length} decisions)`,
    );
  }
  return result.state;
}

/**
 * Live room entry: bulk-settle setup seats; on adventure, apply the first
 * visible step immediately (so the human's END_TURN is answered with the
 * computer's first real action in the same response) and leave remaining
 * paced work for the scheduled pump.
 */
export function settleComputerForLiveAction(state: GameState): GameState {
  if (computerPlayerIds(state).length === 0) {
    return state;
  }
  if (computerWorkIsInstantBulk(state)) {
    return settleComputerWork(state);
  }
  // First visible beat lands in this frame; further beats are pumped.
  return settleComputerVisibleStep(state).state;
}

/** True when a live room still has computer work that the paced pump must run. */
export function computerPumpOwed(state: GameState): boolean {
  return (
    computerPlayerIds(state).length > 0 &&
    !computerWorkIsInstantBulk(state) &&
    computerDecisionOwner(state) !== null
  );
}
