import type { AdventureState, GameEvent, GameState, PlayerId } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import { combatUnitDecisionOwnerId, isNeutralSideCombatChoice, neutralCombatControllerId, pvpNeutralControllerId } from "./neutral-control";
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
  "polishArtifactAccess",
  "polishRandomArtifactDie",
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
        : key !== "polishArtifactAccess" && key !== "polishRandomArtifactDie" && context.adventure[key],
    )
  );
}

export type ParallelContextOption = {
  ownerPlayerId: PlayerId;
  contextId: string;
  /** "watch" = read-only: this viewer has no decision in that battle. */
  role: "hero" | "neutrals" | "watch";
  fighterName: string;
  controllerName?: string;
  waitingFor: string;
  needsInput: boolean;
  hasCombat: boolean;
};

/**
 * Every context the table currently holds, keyed by owner: the parked ones plus
 * the one that is live in `state` right now.
 */
function allContexts(state: GameState): Record<PlayerId, ParallelCombatContext> {
  const contexts = { ...state.parallelCombats };
  const currentOwner = owner(state);
  if (currentOwner) contexts[currentOwner] = capture(state);
  return contexts;
}

/**
 * A viewer is WATCHING when the selected context is somebody else's battle and
 * they hold no decision in it (not a fighter, not its neutral controller).
 * Read on a PROJECTED frame (the output of `parallelStateForPlayer`), which is
 * why it is a derivation and not a serialized flag: a seated watcher's
 * projection becomes the authoritative state on their next action, and a
 * persisted "watching" bit would leak into it.
 */
export function isParallelWatchOnly(state: GameState, playerId: PlayerId): boolean {
  if (state.turn?.mode !== "parallel") return false;
  const ownerId = state.parallelCombatOwnerId;
  const combat = state.combat;
  if (!ownerId || ownerId === playerId || !combat) return false;
  if (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId) return false;
  return neutralCombatControllerId(state, combat) !== playerId;
}

export function parallelContextOptions(state: GameState, playerId: PlayerId): ParallelContextOption[] {
  if (state.turn.mode !== "parallel" || state.adventure?.eventResolution?.round === state.round) return [];
  // Hosted snapshots carry only the summaries and the selected redacted frame.
  if (state.parallelContextOptions) return state.parallelContextOptions;
  const contexts = allContexts(state);
  const seated = state.turnOrder.includes(playerId) && !state.players[playerId]?.eliminated;
  const controls = state.adventure?.pvpNeutralControl && seated;
  // Every OTHER live battle is watchable read-only — by a bystander seat with
  // its own open turn, by an eliminated seat and by an unseated spectator. This
  // is the only way a viewer with no stake in a battle can follow it at all.
  const watchable = Object.keys(contexts).filter(
    (id) => contexts[id].combat && !contexts[id].combat!.outcome,
  );
  // A COMPUTER seat is never a watcher. `SELECT_PARALLEL_CONTEXT` carries no AI
  // score, so a watch offer would be an unranked no-op candidate the runner
  // could take and then find itself in a read-only context with no work — a
  // stall surface. (The lobby refuses parallel turns beside computer seats, so
  // this is defensive; the fixtures in parallel-combats.test.ts do build such a
  // table.) A computer seat's battle is still watchable BY a human.
  const isComputerSeat = state.controllers?.[playerId]?.kind === "computer";
  const actionable = controls
    ? [playerId, ...watchable.filter(id => id !== playerId &&
        neutralCombatControllerId(state, contexts[id].combat!) === playerId)]
    : seated
      ? [playerId]
      : [];
  const watchOnly = isComputerSeat ? [] : watchable.filter((id) => !actionable.includes(id));
  // No watch offer AND no controller work: keep the PRE-WATCH shape exactly —
  // options existed iff PvP Neutral Control was on for a live seat, and the
  // hosted view keys `parallelCombatOwnerId` / `parallelContextSelections` off
  // this list being non-empty.
  if (!watchOnly.length && !controls) return [];
  const owners = [...actionable, ...watchOnly];
  return owners.map(id => {
    if (watchOnly.includes(id)) {
      const combat = contexts[id].combat!;
      return {
        ownerPlayerId: id,
        contextId: combat.id ?? `map:${id}`,
        role: "watch" as const,
        fighterName: state.players[id]?.name ?? id,
        waitingFor: "Watching",
        needsInput: false,
        hasCombat: true,
      };
    }
    const context = contexts[id];
    const combat = context?.combat;
    const controller = combat ? neutralCombatControllerId(state, combat) : null;
    const unit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
    const deciding = context?.pendingChoice?.playerId ?? context?.reactionWindow?.priorityPlayerId ??
      combat?.pendingNeutralPlacement ?? combat?.pendingTacticsSwaps?.[0] ?? combat?.pendingCommanderPlacement?.[0] ??
      combat?.setup?.pendingPlayerIds[0] ??
      (combat?.pendingNeutralStep ? combat.pendingNeutralStep.reactingPlayerId ?? combat.attackerPlayerId : undefined) ??
      combat?.pendingActivationSkipRecall?.playerId ?? context?.adventure.pendingVisit?.playerId ??
      context?.adventure.pendingNecromancy?.playerId ??
      (combat?.outcome ? id : unit ? combatUnitDecisionOwnerId(state, combat!, unit) : combat ? id : playerId);
    const done = id === playerId && !combat && state.turn.completedPlayerIds.includes(playerId);
    return {
      ownerPlayerId: id,
      contextId: combat?.id ?? `map:${id}`,
      role: id === playerId ? "hero" : "neutrals",
      fighterName: state.players[id]?.name ?? id,
      controllerName: controller ? state.players[controller]?.name ?? controller : undefined,
      waitingFor: done ? "Turn finished" : deciding === playerId ? "Your action" : `Waiting for ${state.players[deciding]?.name ?? deciding}`,
      needsInput: !done && deciding === playerId,
      hasCombat: !!combat,
    };
  });
}

/** Select an independent player interaction without copying shared decks, armies, or map state.
 * The reducer clones this projection before mutation, so failed actions remain atomic.
 * Human neutral controllers may select their own work or any assigned battle.
 */
export function parallelStateForPlayer(
  state: GameState,
  playerId: PlayerId,
  requestedOwner?: PlayerId,
): GameState {
  if (
    state.mode !== "adventure" ||
    state.turn.mode !== "parallel" ||
    !state.adventure ||
    state.adventure.eventResolution?.round === state.round ||
    state.adventure.winnerPlayerId
  )
    return state;
  const currentOwner = owner(state);
  const parked = state.parallelCombats ?? {};
  // A viewer with no seat of their own — an unseated spectator or an eliminated
  // player — used to get the RAW state back, i.e. whichever battle the global
  // `parallelCombatOwnerId` happened to point at. That pointer moves every time
  // any OTHER player acts, so their screen was dragged from battle to battle
  // (and the client's "a new combat id appeared" hand-off yanked them off the
  // map). They now get a projection of ONE chosen battle, exactly like a seat.
  if (!state.turnOrder.includes(playerId) || state.players[playerId]?.eliminated)
    return projectContext(state, watchTargetFor(state, playerId, requestedOwner));
  const forcedOwnTurn = state.afk?.droppingPlayerId === playerId || state.afk?.turnTimeoutPlayerId === playerId;
  const preferred = requestedOwner ?? (forcedOwnTurn ? playerId : state.parallelContextSelections?.[playerId]) ??
    (state.adventure.pvpNeutralControl ? playerId : undefined);
  const preferredCombat = preferred === currentOwner ? state.combat : preferred ? parked[preferred]?.combat : null;
  const targetPreference = preferred && (preferred === playerId ||
    (preferredCombat && !preferredCombat.outcome &&
      // Read-only WATCH: any live battle may be selected. `isParallelWatchOnly`
      // then reports the projection as watch-only and `getLegalActions` offers
      // nothing there but the switch back, so watching dispatches nothing.
      // A seat the AFK / turn-timeout driver is FORCING still only ever gets its
      // own window — that driver must never end up in a read-only context (it
      // already overrides `preferred`; this covers an explicit requestedOwner).
      (neutralCombatControllerId(state, preferredCombat) === playerId || !forcedOwnTurn)))
    ? preferred : preferred ? playerId : undefined;
  if (currentOwner === (targetPreference ?? playerId)) {
    // Restored battles may predate the explicit owner marker. Persist the
    // inferred owner before an acknowledgement clears combat, or Necromancy
    // and the bank/field reward lose the identity needed to park them.
    return state.parallelCombatOwnerId ? state : { ...state, parallelCombatOwnerId: currentOwner };
  }
  if (!targetPreference && (
    state.pendingChoice?.playerId === playerId ||
    state.reactionWindow?.priorityPlayerId === playerId
  ))
    return state;
  // A battle the actor FIGHTS (its own owner key) OUTRANKS one it merely
  // controls — otherwise a PvP-Neutral-Control controller is pinned to the
  // guards it drives and can never reach its own parked fight. The
  // live-controller pin (and the parked-controller search below) stay as the
  // FALLBACK for a controller with no battle of its own.
  const ownsParkedBattle = Boolean(parked[playerId]);
  if (
    !targetPreference && !ownsParkedBattle &&
    state.combat &&
    neutralCombatControllerId(state, state.combat) === playerId
  )
    return state;
  const controlled = targetPreference || ownsParkedBattle
    ? undefined
    : Object.entries(parked).find(
        ([, context]) =>
          context.pendingChoice?.playerId === playerId ||
          context.reactionWindow?.priorityPlayerId === playerId ||
          (context.combat &&
            neutralCombatControllerId(state, context.combat) === playerId),
      );
  const targetOwner = targetPreference ?? controlled?.[0] ?? playerId;
  // Unowned work (setup, round-start queues and legacy table choices) stays
  // serialized. An idle table must still acquire an owner: otherwise the first
  // map visit or spell choice is never parked and blocks every other player.
  if (!currentOwner && busy(capture(state))) return state;
  return projectContext(state, targetOwner);
}

/**
 * The battle a viewer with no seat of their own is looking at: their own
 * request wins, then their recorded selection, then — deterministically, so the
 * screen holds still while other seats act — the first live battle in seat
 * order. No live battle at all leaves them on the read-only map.
 */
function watchTargetFor(
  state: GameState,
  playerId: PlayerId,
  requestedOwner: PlayerId | undefined,
): PlayerId {
  const contexts = allContexts(state);
  const live = (id: PlayerId | undefined): boolean =>
    Boolean(id && contexts[id]?.combat && !contexts[id].combat!.outcome);
  if (live(requestedOwner)) return requestedOwner!;
  const selected = state.parallelContextSelections?.[playerId];
  if (live(selected)) return selected!;
  return state.turnOrder.find((id) => live(id)) ?? playerId;
}

/**
 * Park every other context and make `targetOwner`'s the live one. Only reached
 * from `parallelStateForPlayer`, which has already established `state.adventure`
 * — the `!` below is that guarantee, not a guess.
 */
function projectContext(state: GameState, targetOwner: PlayerId): GameState {
  const currentOwner = owner(state);
  const contexts = { ...(state.parallelCombats ?? {}) };
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
    adventure: { ...state.adventure!, ...emptyAdventure, ...target?.adventure },
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

/** Elimination must hand back neutral decisions in parked battles as well. */
export function reassignParkedNeutralController(state: GameState, departedPlayerId: PlayerId): void {
  for (const context of Object.values(state.parallelCombats ?? {})) {
    const combat = context.combat;
    if (!combat || combat.outcome) continue;
    const nextController = neutralCombatControllerId(state, combat);
    if (context.pendingChoice?.playerId === departedPlayerId && isNeutralSideCombatChoice(combat, context.pendingChoice)) {
      context.pendingChoice.playerId = nextController ?? NEUTRAL_PLAYER_ID;
      if (context.priorityPlayerId === departedPlayerId) context.priorityPlayerId = nextController;
    }
    if (combat.pendingNeutralPlacement === departedPlayerId) {
      combat.pendingNeutralPlacement = pvpNeutralControllerId(state, combat);
      if (context.phase === "combat-setup") context.priorityPlayerId = combat.pendingNeutralPlacement ?? combat.attackerPlayerId;
    }
  }
}

/** Keep the shared event cursor intact while animating only the selected battle. */
export function parallelPresentationEvents(
  state: GameState,
  events: readonly GameEvent[],
  viewerPlayerId: PlayerId | undefined = state.parallelCombatOwnerId,
): GameEvent[] {
  return events.filter(
    (event) =>
      !event.combatContextId || event.combatContextId === state.combat?.id ||
      // Rewards and personal draws may arrive in the same snapshot that clears
      // combat. They still belong to this viewer after the battlefield closes.
      (viewerPlayerId !== undefined && "playerId" in event && event.playerId === viewerPlayerId),
  );
}

/** Drop context bookkeeping once the last battle and its rewards have settled. */
export function settleParallelCombatContext(state: GameState): void {
  if (!state.adventure || state.turn?.mode !== "parallel") return;
  // A finished window must not silently reopen on a later battle fought by the
  // same hero. The moment the selected battle is gone or decided the viewer is
  // returned to their own adventure — which is also how a read-only WATCH ends
  // by itself: the watcher never has to remember to switch back.
  for (const [viewer, selected] of Object.entries(state.parallelContextSelections ?? {})) {
    const combat = selected === owner(state) ? state.combat : state.parallelCombats?.[selected]?.combat;
    if (selected !== viewer && (!combat || combat.outcome)) {
      delete state.parallelContextSelections![viewer];
    }
  }
  if (!busy(capture(state)) && !hasParkedParallelInteractions(state)) {
    delete state.parallelCombatOwnerId;
    delete state.parallelCombats;
  }
}
