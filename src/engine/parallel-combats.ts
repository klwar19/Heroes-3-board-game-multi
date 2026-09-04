import type { AdventureState, GameEvent, GameState, PlayerId } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import { neutralCombatControllerId } from "./neutral-control";
import { makeNeutralSeatPlayer } from "./neutral-player";

const adventureSlots = [
  "pendingVisit",
  "pendingTileChoice",
  "pendingNecromancy",
  "pendingCompanionRecruitment",
  "pendingCommanderFirstAid",
  "pendingFarTileFlip",
  "pendingGarrison",
  "pendingTokenTeleport",
  "rewardQueue",
] as const satisfies readonly (keyof AdventureState)[];

export type ParallelCombatContext = Pick<
  GameState,
  | "combat"
  | "phase"
  | "priorityPlayerId"
  | "pendingChoice"
  | "reactionWindow"
  | "stack"
> & {
  adventure: Pick<AdventureState, (typeof adventureSlots)[number]>;
  effects: GameState["activeEffects"];
  neutralPlayer: GameState["players"][string];
};

function localEffect(effect: GameState["activeEffects"][number]): boolean {
  return [
    "combat",
    "current-combat-round",
    "next-combat-round",
    "combat-rounds",
    "current-activation",
    "next-activation",
    "next-round-activation",
  ].includes(effect.duration.type);
}

function owner(state: GameState): PlayerId | undefined {
  return (
    state.parallelCombatOwnerId ??
    (state.combat?.context.kind === "neutral"
      ? state.combat.attackerPlayerId === NEUTRAL_PLAYER_ID
        ? state.combat.defenderPlayerId
        : state.combat.attackerPlayerId
      : undefined)
  );
}

function capture(state: GameState): ParallelCombatContext {
  const adventure = Object.fromEntries(
    adventureSlots.map((key) => [
      key,
      state.adventure![key] ?? (key === "rewardQueue" ? [] : null),
    ]),
  ) as ParallelCombatContext["adventure"];
  return {
    combat: state.combat,
    phase: state.phase,
    priorityPlayerId: state.priorityPlayerId,
    pendingChoice: state.pendingChoice,
    reactionWindow: state.reactionWindow,
    stack: state.stack,
    adventure,
    effects: state.activeEffects.filter(localEffect),
    neutralPlayer: state.players[NEUTRAL_PLAYER_ID],
  };
}

function busy(context: ParallelCombatContext): boolean {
  return !!(
    context.combat ||
    context.pendingChoice ||
    context.reactionWindow ||
    context.stack.length ||
    adventureSlots.some((key) =>
      key === "rewardQueue"
        ? context.adventure.rewardQueue.length
        : context.adventure[key],
    )
  );
}

/** Select an independent neutral battle without copying shared decks, armies, or map state.
 * The reducer clones this projection before mutation, so failed actions remain atomic.
 * Manual neutral controllers keep their existing battle until that responsibility ends.
 */
export function parallelStateForPlayer(
  state: GameState,
  playerId: PlayerId,
): GameState {
  if (
    state.mode !== "adventure" ||
    state.turn.mode !== "parallel" ||
    !state.adventure ||
    state.adventure.eventResolution?.round === state.round ||
    !state.turnOrder.includes(playerId) ||
    state.players[playerId]?.eliminated ||
    state.adventure.winnerPlayerId
  )
    return state;
  const currentOwner = owner(state);
  if (currentOwner === playerId) return state;
  if (
    state.pendingChoice?.playerId === playerId ||
    state.reactionWindow?.priorityPlayerId === playerId
  )
    return state;
  const parked = state.parallelCombats ?? {};
  // A battle the actor FIGHTS (its own owner key) OUTRANKS one it merely
  // controls — otherwise a PvP-Neutral-Control controller is pinned to the
  // guards it drives and can never reach its own parked fight. The
  // live-controller pin (and the parked-controller search below) stay as the
  // FALLBACK for a controller with no battle of its own.
  const ownsParkedBattle = Boolean(parked[playerId]);
  if (
    !ownsParkedBattle &&
    state.combat &&
    neutralCombatControllerId(state, state.combat) === playerId
  )
    return state;
  const controlled = ownsParkedBattle
    ? undefined
    : Object.entries(parked).find(
        ([, context]) =>
          context.pendingChoice?.playerId === playerId ||
          context.reactionWindow?.priorityPlayerId === playerId ||
          (context.combat &&
            neutralCombatControllerId(state, context.combat) === playerId),
      );
  const targetOwner = controlled?.[0] ?? playerId;
  if (!currentOwner && !parked[targetOwner]) return state;
  // An unrelated map choice remains a table interaction until resolved.
  if (!currentOwner && busy(capture(state))) return state;
  const contexts = { ...parked };
  if (currentOwner) {
    const context = capture(state);
    if (busy(context)) contexts[currentOwner] = context;
  }
  const target = contexts[targetOwner];
  delete contexts[targetOwner];
  const emptyAdventure = Object.fromEntries(
    adventureSlots.map((key) => [key, key === "rewardQueue" ? [] : null]),
  );
  return {
    ...state,
    parallelCombats: contexts,
    parallelCombatOwnerId: targetOwner,
    combat: target?.combat ?? null,
    phase: target?.phase ?? "player-turn",
    priorityPlayerId: target?.priorityPlayerId ?? null,
    pendingChoice: target?.pendingChoice ?? null,
    reactionWindow: target?.reactionWindow ?? null,
    stack: target?.stack ?? [],
    players: {
      ...state.players,
      [NEUTRAL_PLAYER_ID]: target?.neutralPlayer ?? makeNeutralSeatPlayer(),
    },
    activeEffects: [
      ...state.activeEffects.filter((effect) => !localEffect(effect)),
      ...(target?.effects ?? []),
    ],
    adventure: { ...state.adventure, ...emptyAdventure, ...target?.adventure },
  };
}

/**
 * A parked context only counts while its OWNER is still in the game. An
 * eliminated seat's battle can never be resumed (`parallelStateForPlayer`
 * refuses an eliminated seat), so counting it would pause the turn clock
 * table-wide and make `stopParallelTurns` throw forever. `eliminatePlayer`
 * drops the context outright; this read is the defensive twin for a snapshot
 * that already carries such an orphan.
 */
function contextCounts(
  state: GameState,
  ownerId: PlayerId,
  context: ParallelCombatContext,
): boolean {
  return !state.players[ownerId]?.eliminated && busy(context);
}

export function hasParkedParallelInteractions(state: GameState): boolean {
  return Object.entries(state.parallelCombats ?? {}).some(([ownerId, context]) =>
    contextCounts(state, ownerId, context),
  );
}

/**
 * Drop one seat's parked battle for good. Called at the top of
 * `eliminatePlayer`: nothing else deletes a parked context, so an eliminated
 * owner's battle would otherwise be orphaned forever.
 */
export function dropParallelCombatContext(
  state: GameState,
  playerId: PlayerId,
): void {
  if (state.parallelCombats) {
    delete state.parallelCombats[playerId];
    if (Object.keys(state.parallelCombats).length === 0) {
      delete state.parallelCombats;
    }
  }
  if (state.parallelCombatOwnerId === playerId) {
    delete state.parallelCombatOwnerId;
  }
}

/** Keep the shared event cursor intact while animating only the selected battle. */
export function parallelPresentationEvents(
  state: GameState,
  events: readonly GameEvent[],
): GameEvent[] {
  return events.filter(
    (event) =>
      !event.combatContextId || event.combatContextId === state.combat?.id,
  );
}

/** Drop context bookkeeping once the last battle and its rewards have settled. */
export function settleParallelCombatContext(state: GameState): void {
  if (!state.adventure || state.turn?.mode !== "parallel") return;
  if (!busy(capture(state)) && !hasParkedParallelInteractions(state)) {
    delete state.parallelCombatOwnerId;
    delete state.parallelCombats;
  }
}
