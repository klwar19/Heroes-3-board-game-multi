import { getLegalActions } from "./legal-actions";
import { neutralCombatControllerId } from "./neutral-control";
import { applyAction } from "./reducer";
import type { GameAction, GameState, LegalAction, PlayerId } from "./state";

/**
 * Server-side driver for a PASSED AFK kick vote (`afk.droppingPlayerId`).
 *
 * The drop runs through the NORMAL action pipeline, one legal action at a
 * time, so every rule and invariant the engine enforces keeps holding:
 *
 *  1. while the kicked seat owns a pending interaction (a choice, a visit
 *     step, a tile rotation, a reaction window, the Necromancy window…), the
 *     driver answers it with a default pick — preferring a "skip/decline"
 *     option where one exists, else the first offer;
 *  2. once the seat holds no pending input, RESOLVE_AFK_DROP concedes their
 *     open combat (the opponent wins, normal finalization) and, called again,
 *     eliminates them exactly like a give-up — the ordered/parallel turn
 *     rotation, the round wrap and the last-faction-standing win all continue
 *     through the existing machinery.
 *
 * When the table's exclusive interaction currently belongs to ANOTHER player
 * (their choice, their reaction priority), the driver simply stops — the
 * transports re-run it after every applied action, so the drop resumes the
 * moment the interaction settles. Both transports call `driveAfkDrop` after
 * each successful action; engine tests call it directly with explicit options.
 */

/** The seat a passed kick vote is currently removing, or null. */
export function afkDropPending(state: GameState): PlayerId | null {
  return state.afk?.droppingPlayerId ?? null;
}

/** The seat whose expired 10-minute turn is being force-ended, or null. */
export function turnTimeoutPending(state: GameState): PlayerId | null {
  return state.afk?.turnTimeoutPlayerId ?? null;
}

/**
 * Whether the driver has ANY forced resolution to run (an AFK drop or a turn
 * timeout) — the transports' cheap "should I call driveAfkDrop?" test.
 */
export function forcedResolutionPending(state: GameState): boolean {
  return afkDropPending(state) !== null || turnTimeoutPending(state) !== null;
}

/** Action types that RESOLVE a pending interaction (never "play the game"). */
const RESOLVING_ACTION_TYPES = new Set<GameAction["type"]>([
  "CHOOSE_OPTION",
  // An ABILITY_TARGET_CHOICE owned by the dropped seat (a Magog splash pick,
  // the neutral-target tie — under PvP Neutral Control possibly held by a seat
  // that is not even fighting) resolves through this; without it the driver
  // waited forever on a choice only the vanished seat could answer.
  "CHOOSE_ABILITY_TARGET",
  // An attack-die reroll window owned by the dropped seat: keep the current
  // roll ("Keep the attack roll …" is always the first, skip-flavoured offer)
  // so the paused attack resolves instead of stalling the drop.
  "CHOOSE_PENDING_ROLL",
  "RESOLVE_VISIT_STEP",
  "SET_TILE_ROTATION",
  "SKIP_NECROMANCY",
  "REFRESH_HAND"
]);

/** Prefer the do-nothing option so the drop changes as little as possible. */
const SKIP_LABEL = /skip|decline|no thanks|keep|done|let it fall|cancel|nothing/i;

/** The unit commands a PvP-Neutral-Control seat drives a guard with. */
const NEUTRAL_UNIT_COMMAND_TYPES = new Set<GameAction["type"]>([
  "MOVE_UNIT",
  "ATTACK_UNIT",
  "MOVE_AND_ATTACK_UNIT",
  "DEFEND_UNIT",
  "END_ACTIVATION"
]);

function pickResolvingAction(offers: LegalAction[]): GameAction | null {
  const candidates = offers.filter((offer) => RESOLVING_ACTION_TYPES.has(offer.action.type));
  if (candidates.length === 0) {
    return null;
  }
  return (candidates.find((offer) => SKIP_LABEL.test(offer.label)) ?? candidates[0]).action;
}

/** Whether the kicked seat itself owns the currently open pending input. */
function ownsPendingInput(state: GameState, playerId: PlayerId): boolean {
  const adventure = state.adventure;
  return (
    state.pendingChoice?.playerId === playerId ||
    adventure?.pendingVisit?.playerId === playerId ||
    adventure?.pendingTileChoice?.playerId === playerId ||
    adventure?.pendingNecromancy?.playerId === playerId ||
    adventure?.pendingFarTileFlip?.playerId === playerId ||
    adventure?.pendingGarrison?.defenderPlayerId === playerId
  );
}

/**
 * The next single action that advances the drop, or null when the driver must
 * wait (another player's interaction is open) or the drop is done.
 */
export function nextAfkDropAction(state: GameState, playerId: PlayerId): GameAction | null {
  // A reaction window where the kicked seat holds priority: pass. (Passing is
  // always legal for the priority holder.)
  if (state.reactionWindow && state.reactionWindow.priorityPlayerId === playerId) {
    return { type: "PASS_REACTION", playerId };
  }

  // Their own pending interaction: answer it with the default pick.
  if (ownsPendingInput(state, playerId)) {
    return pickResolvingAction(getLegalActions(state, playerId));
  }

  // Someone ELSE's interaction is open: wait — the transports re-run the
  // driver after every action, so the drop resumes when it settles.
  if (state.pendingChoice || state.reactionWindow || state.stack.length > 0) {
    return null;
  }

  // A finished combat they fought in, waiting for the end notice (a kick that
  // landed right after a battle ended): close it on their behalf.
  const combat = state.combat;
  if (
    combat?.outcome &&
    !combat.endAcknowledged &&
    combat.context.kind !== "sandbox" &&
    (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId)
  ) {
    return { type: "ACKNOWLEDGE_COMBAT_END", playerId };
  }

  // PvP Neutral Control: the dropped seat is playing the guards of an OPEN
  // fight — play the current guard action out with a default pick (prefer the
  // do-least option) so the fight advances and the drop can proceed. Only real
  // unit commands qualify (never a stray card offer), and once the guards'
  // slots pass to the fighter's units the driver just waits below.
  if (combat && !combat.outcome && neutralCombatControllerId(state, combat) === playerId) {
    const unitCommands = getLegalActions(state, playerId).filter((offer) =>
      NEUTRAL_UNIT_COMMAND_TYPES.has(offer.action.type)
    );
    const command =
      unitCommands.find((offer) => offer.action.type === "END_ACTIVATION") ??
      unitCommands.find((offer) => offer.action.type === "DEFEND_UNIT") ??
      unitCommands[0];
    if (command) {
      return command.action;
    }
    return null;
  }

  // A combat between two OTHER players: wait for it, like any bystander.
  if (combat && !combat.outcome && combat.attackerPlayerId !== playerId && combat.defenderPlayerId !== playerId) {
    return null;
  }

  // Clear of interactions: concede their combat / eliminate them.
  return { type: "RESOLVE_AFK_DROP", playerId };
}

/**
 * The next single action that advances a TURN TIMEOUT force-shift, or null when
 * the driver must wait (another player's interaction is open) or nothing is
 * left. Mirrors the drop driver, but the terminal step ends the turn instead of
 * eliminating the seat (see resolveTurnTimeout in adventure-reducer.ts).
 */
export function nextTurnTimeoutAction(state: GameState, playerId: PlayerId): GameAction | null {
  if (state.reactionWindow && state.reactionWindow.priorityPlayerId === playerId) {
    return { type: "PASS_REACTION", playerId };
  }

  // Their own pending interaction: answer it with the default pick.
  if (ownsPendingInput(state, playerId)) {
    return pickResolvingAction(getLegalActions(state, playerId));
  }

  // Someone ELSE's interaction is open: wait — the transports re-run the
  // driver after every action, so the shift resumes when it settles.
  if (state.pendingChoice || state.reactionWindow || state.stack.length > 0) {
    return null;
  }
  const adventure = state.adventure;
  if (
    adventure &&
    (adventure.pendingVisit ||
      adventure.pendingTileChoice ||
      adventure.pendingNecromancy ||
      adventure.pendingFarTileFlip ||
      adventure.pendingGarrison)
  ) {
    return null;
  }

  const combat = state.combat;
  if (combat && combat.context.kind !== "sandbox" && (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId)) {
    if (combat.outcome && !combat.endAcknowledged) {
      return { type: "ACKNOWLEDGE_COMBAT_END", playerId };
    }
    if (!combat.outcome) {
      // Safety net: any open battle pauses the turn clock (PvP AND the fighter's
      // own neutral combat), so a timeout cannot NORMALLY arm mid-fight. If a
      // race ever leaves one open, concede it as a retreat so the shift proceeds.
      return { type: "RESOLVE_TURN_TIMEOUT", playerId };
    }
    return null; // acknowledged but not yet finalized — the automation finishes it.
  }
  // A battle between two OTHER players: wait for it, like any bystander.
  if (combat && !combat.outcome) {
    return null;
  }

  // Clear of interactions: end their turn (or just clear a stale flag).
  return { type: "RESOLVE_TURN_TIMEOUT", playerId };
}

/**
 * Runs every pending forced resolution — the AFK drop first, then a turn
 * timeout — to completion (or to the first must-wait point). `optionsFor` lets
 * the transports mint fresh per-step apply options (entropy, wall clock);
 * tests may omit it.
 */
export function driveAfkDrop(
  initial: GameState,
  optionsFor: () => { entropy?: string; now?: number } = () => ({})
): GameState {
  let state = initial;
  // Bounded hard: each step either resolves one interaction, eliminates the
  // dropped player or ends the expired turn; nothing a game can queue takes
  // more steps than this.
  for (let guard = 0; guard < 200; guard += 1) {
    const droppingId = afkDropPending(state);
    const timeoutId = droppingId ? null : turnTimeoutPending(state);
    const playerId = droppingId ?? timeoutId;
    if (!playerId) {
      return state;
    }
    const action = droppingId ? nextAfkDropAction(state, droppingId) : nextTurnTimeoutAction(state, playerId);
    if (!action) {
      return state;
    }
    const result = applyAction(state, action, optionsFor());
    if (result.errors.length > 0) {
      // Leave the flag set — the next applied action re-runs the driver. The
      // error is deliberately not thrown: a stuck auto-step must never break
      // the (unrelated) action that triggered this run.
      return state;
    }
    state = result.state;
  }
  return state;
}
