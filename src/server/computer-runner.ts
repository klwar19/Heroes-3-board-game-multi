import {
  applyAction,
  chooseComputerAction,
  collectMapObjectives,
  combatHasHumanParticipant,
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
/**
 * PvP (human vs computer) combat pace — one activation beat at a time so the
 * human sees the fight. AI-only / neutral fights NEVER use this: they bulk-
 * resolve off-screen in the same tick that opened them.
 */
export const COMPUTER_COMBAT_STEP_MS = 450;
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
          // The combat-pause identity MUST count as progress. Resuming a
          // "pre-activation" reaction pause (CONTINUE_NEUTRAL_STEP) only sets
          // `pendingNeutralStep = null` + the unit's `reactionPauseAcked` and
          // leaves activeUnitId as-is, so without this the pump read that real
          // step as "no measurable progress" and STALLED the AI turn — the
          // frozen computer-vs-computer / neutral fight the player saw at game
          // start. Capture the pause's kind + acting unit + who must resume.
          combat.pendingNeutralStep
            ? [
                combat.pendingNeutralStep.kind ?? "guard-walk",
                combat.pendingNeutralStep.unitId,
                combat.pendingNeutralStep.reactingPlayerId ?? null,
              ]
            : null,
          combat.pendingNeutralPlacement ?? null,
          // Unit-level progress: moves, damage, defends and removals inside an
          // activation must all count (a defend changes nothing else above).
          // `reactionPauseAcked` is the other half of resuming a pre-activation
          // pause, so it counts too.
          Object.values(combat.units).map((unit) => [
            unit.id,
            unit.position,
            unit.damage,
            unit.activatedThisRound,
            unit.movedThisActivation,
            unit.attacksThisActivation ?? 0,
            unit.reactionPauseAcked ?? false,
          ]),
        ]
      : null,
    pending: [
      adventure?.pendingVisit?.playerId,
      // Visit step identity must count: auction bids / event choices that only
      // mutate the visit queue still advance progress. The FULL step tree is
      // fingerprinted (not just steps[0].type + length): a nested CHOOSE_ONE
      // that resolves one branch — e.g. the Scholar expert remove/take loop,
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
          player.spellBook,
          player.spellBookUsed ?? [],
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
 * settleComputerWork / settleComputerVisibleStep; tests may inject their own apply.
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
      // The action applied cleanly but moved no fingerprinted field — a no-op
      // for progress purposes (e.g. an in-combat ability play that only sets a
      // pending modifier, or a card whose effect the fingerprint doesn't
      // capture). The old code stalled the WHOLE pump here, which froze the AI
      // turn ("says it's taking its turn and does nothing") whenever such an
      // action outscored a real one. Instead treat it exactly like a rejected
      // attempt: it is already in `attempted`, so DISCARD it (keep the pre-
      // action state) and try the next-best legal candidate. Only when every
      // candidate is exhausted does the loop reach the explicit "no safe legal
      // action" stall. `attempted` grows and the legal set shrinks each pass,
      // so this always terminates (and the maxSteps cap backstops it).
      continue;
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
 * Whether live rooms should FULLY settle computers in one transaction.
 * Setup lobby always bulk-settles (nobody wants to watch draft micro-steps).
 * Adventure work is paced: map moves one-by-one; AI-only fights bulk-resolve
 * inside a single tick so the human never sees them; PvP is paced normally.
 */
export function computerWorkIsInstantBulk(state: GameState): boolean {
  return state.phase === "setup";
}

/**
 * Map actions the human should SEE one-by-one on the adventure map.
 * Combat actions are NOT listed here — AI-only fights bulk-resolve off-screen;
 * human-involving PvP uses {@link isPvpPacedComputerAction} instead.
 */
export function isMapPacedComputerAction(action: GameAction): boolean {
  switch (action.type) {
    case "MOVE_HERO":
    case "DISCOVER_TILE":
    case "PLACE_TILE":
    case "REVISIT_FIELD":
    case "SET_TILE_ROTATION":
    case "CHOOSE_PENDING_ROLL":
    // Market trades and visit resolves the human should notice on the map.
    case "OPEN_MARKET":
    case "TRADE_RESOURCES":
    case "BUY_WAR_MACHINE":
      return true;
    default:
      return false;
  }
}

/**
 * Combat (and combat-adjacent card) actions paced only when a HUMAN is in the
 * fight — so computer units act at a watchable pace during PvP. Never used for
 * AI-only / neutral fights (those bulk-resolve).
 */
export function isPvpPacedComputerAction(action: GameAction): boolean {
  switch (action.type) {
    case "ATTACK_UNIT":
    case "MOVE_AND_ATTACK_UNIT":
    case "MOVE_UNIT":
    case "DEFEND_UNIT":
    case "END_ACTIVATION":
    case "CONTINUE_NEUTRAL_COMBAT":
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
      return true;
    default:
      // Placement / prep / ack / pass-reaction stay bulk so the human is not
      // stuck watching the computer click through setup frames.
      return false;
  }
}

/**
 * Whether this action should end a visible pump tick AFTER it is applied.
 *
 * Rules (user-facing contract):
 * - Map: pace MOVE_HERO / discover / place so the human sees clear 1-by-1 map
 *   movement.
 * - AI-only combat (computer vs neutrals / computer vs computer): NEVER pace —
 *   the whole fight bulk-resolves off-screen in the same tick that opened it.
 * - PvP (human is a participant): pace combat actions at normal watchable pace.
 *
 * Optional `stateAfter` is the post-apply state. When omitted (classification
 * tests), map + PvP combat action kinds are both treated as paced.
 */
export function isPacedComputerAction(
  action: GameAction,
  stateAfter?: GameState,
): boolean {
  if (stateAfter) {
    // Mid AI-only fight: keep bulk-resolving; never broadcast a combat frame.
    if (stateAfter.combat && !combatHasHumanParticipant(stateAfter)) {
      return false;
    }
    // Human is in this fight — pace combat so it plays like normal PvP.
    if (stateAfter.combat && combatHasHumanParticipant(stateAfter)) {
      return (
        isPvpPacedComputerAction(action) || isMapPacedComputerAction(action)
      );
    }
    // On the map (no open combat, or combat just closed): pace map beats only.
    return isMapPacedComputerAction(action);
  }
  // No state: classify by action kind alone (tests / static checks).
  return isMapPacedComputerAction(action) || isPvpPacedComputerAction(action);
}

/** Delay before the next live computer step, by context. */
export function computerStepDelayMs(state: GameState): number {
  if (state.phase === "setup") {
    return COMPUTER_SETUP_STEP_MS;
  }
  // Only PvP (human in the fight) uses combat pacing. AI-only fights bulk-
  // resolve and should never schedule a combat delay.
  if (
    state.combat &&
    !state.combat.endAcknowledged &&
    combatHasHumanParticipant(state)
  ) {
    return COMPUTER_COMBAT_STEP_MS;
  }
  return COMPUTER_MAP_STEP_MS;
}

/**
 * Apply bulk non-paced computer work, then at most ONE paced (visible) action.
 *
 * Critical: walking onto a neutral guard opens combat. That fight is AI-only
 * for a computer hero, so this tick MUST keep resolving until the combat is
 * gone (ack'd) — never broadcast a mid-neutral-battle snapshot. Map movement
 * still stops after each MOVE_HERO so the human sees 1-by-1 steps. PvP combat
 * stops after each combat beat so the human watches the fight normally.
 */
export function settleComputerVisibleStep(state: GameState): ComputerRunResult {
  if (computerPlayerIds(state).length === 0) {
    return { state, decisions: [], stalled: false };
  }

  const decisions: ComputerDecision[] = [];
  let current = state;
  // Soft cap for bookkeeping; AI-only combat extends this so a long fight
  // never leaks a mid-battle frame for want of steps.
  let bulkCap = 96;
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

    // AI-only fight open: keep going (extend the cap) — never return mid-fight.
    if (current.combat && !combatHasHumanParticipant(current)) {
      bulkCap = Math.max(bulkCap, i + DEFAULT_COMPUTER_STEP_LIMIT);
      continue;
    }

    if (isPacedComputerAction(step.action, current)) {
      // One visible map/PvP beat per broadcast frame.
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
 * Live room entry after a normal human action (not ADVANCE_COMPUTER):
 * - Setup: bulk-settle computers (draft is boring to watch).
 * - Human-involved PvP combat: one visible combat beat now; further beats via
 *   the auto timer (normal PvP pace).
 * - Map / AI-only work: DO NOTHING. The human must press ADVANCE_COMPUTER for
 *   each map beat so the computer never finishes its turn during first-player
 *   dice, END_TURN, or any other human action. Policy/AI logic is unchanged —
 *   only WHEN a map step is applied is gated.
 */
export function settleComputerForLiveAction(state: GameState): GameState {
  if (computerPlayerIds(state).length === 0) {
    return state;
  }
  if (computerWorkIsInstantBulk(state)) {
    return settleComputerWork(state);
  }
  // PvP only: answer the human's combat action with one computer beat.
  if (computerAutoPumpOwed(state)) {
    return settleComputerVisibleStep(state).state;
  }
  // Map: wait for ADVANCE_COMPUTER. Leaving state untouched is intentional.
  return state;
}

/**
 * True when a computer seat still owns a required decision (map or combat).
 * Includes human-gated map work — NOT the same as auto-timer owed.
 */
export function computerWorkPending(state: GameState): boolean {
  return (
    computerPlayerIds(state).length > 0 &&
    !computerWorkIsInstantBulk(state) &&
    computerDecisionOwner(state) !== null
  );
}

/**
 * Map / AI-only: the human must press ADVANCE_COMPUTER before the next beat.
 * False during human-involved PvP (auto-pumped) and when no computer work is
 * pending. Used by legal-actions + the client Next button.
 */
export function computerNeedsHumanAdvance(state: GameState): boolean {
  return computerWorkPending(state) && !combatHasHumanParticipant(state);
}

/**
 * Auto timer / alarm pump — ONLY for human-involved PvP combat. Map turns
 * never auto-fire (that was the "computer already finished their move during
 * first-player dice" bug). PartyKit alarms and the in-process setTimeout both
 * key off this; map freezes are impossible because ADVANCE_COMPUTER is always
 * legal for the human while computerNeedsHumanAdvance is true.
 */
export function computerAutoPumpOwed(state: GameState): boolean {
  return computerWorkPending(state) && combatHasHumanParticipant(state);
}

/**
 * @deprecated Prefer computerAutoPumpOwed (auto timer) or computerNeedsHumanAdvance
 * (map Next). Kept as the auto-timer predicate so existing call sites keep the
 * same name without re-arming map pumps.
 */
export function computerPumpOwed(state: GameState): boolean {
  return computerAutoPumpOwed(state);
}

/**
 * After a validated ADVANCE_COMPUTER action: run exactly one visible step
 * (map MOVE_HERO / discover / …, or bulk AI-only combat if a walk opened one).
 * Never schedules more work — the human presses again for the next beat.
 */
export function applyHumanComputerAdvance(state: GameState): ComputerRunResult {
  if (!computerNeedsHumanAdvance(state)) {
    return {
      state,
      decisions: [],
      stalled: false,
      reason: "No computer map step is waiting on human advance.",
    };
  }
  return settleComputerVisibleStep(state);
}
