import {
  applyAction,
  chooseComputerAction,
  computerDecisionOwner,
  legalityMatchKey,
  observeForComputer,
  type ComputerDecision,
  type EngineResult,
  type GameAction,
  type GameState,
  type PlayerId,
} from "@/engine";

export const DEFAULT_COMPUTER_STEP_LIMIT = 256;

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

function progressFingerprint(state: GameState, playerId: PlayerId): string {
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
      adventure?.pendingTileChoice?.playerId,
      adventure?.pendingNecromancy?.playerId,
      adventure?.pendingFarTileFlip?.playerId,
      adventure?.pendingGarrison?.defenderPlayerId,
      adventure?.pendingTokenTeleport?.playerId,
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

/**
 * Transport-neutral computer pump. It is intentionally not wired into live
 * rooms until the strategic policies are complete enough for user-facing play.
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
    state = result.state;
    decisions.push(decision);
  }

  return {
    state,
    decisions,
    stalled: true,
    reason: `Computer runner reached its ${maxSteps}-action safety limit.`,
  };
}
