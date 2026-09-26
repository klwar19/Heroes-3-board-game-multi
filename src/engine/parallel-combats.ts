import type { AdventureState, GameEvent, GameState, HeroId, PlayerId } from "./state";
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
  | "pendingManaTurbulence"
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

export function captureParallelContext(state: GameState): ParallelCombatContext {
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
    pendingManaTurbulence: state.pendingManaTurbulence,
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

/**
 * Parallel PvP "keep" option (`turn.pvpKeepsParallel`): PvP battles and
 * player-affecting interactions run inside the parallel mode instead of
 * ending it.
 */
export function parallelPvpKeeps(state: GameState): boolean {
  return state.mode === "adventure" && state.turn?.mode === "parallel" && state.turn.pvpKeepsParallel === true;
}

/**
 * Work in `context` that waits on `playerId` as a PRINCIPAL: they fight its
 * PvP battle, or a choice / reaction / visit / garrison decision / queued
 * reward in it is theirs. Never true for a mere PvP-Neutral-Control commander
 * of a Neutral fight — that seat keeps its own map (see
 * `parallelMapInteractionBlocker`).
 */
function contextAwaitsPrincipal(context: ParallelCombatContext, playerId: PlayerId): boolean {
  const combat = context.combat;
  if (combat) {
    // A Neutral fight belongs to its (single) human fighter, who owns the key.
    return combat.context.kind === "player" &&
      (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId);
  }
  const adventure = context.adventure;
  return (
    context.pendingChoice?.playerId === playerId ||
    context.reactionWindow?.priorityPlayerId === playerId ||
    adventure.pendingVisit?.playerId === playerId ||
    adventure.pendingTileChoice?.playerId === playerId ||
    adventure.pendingNecromancy?.playerId === playerId ||
    adventure.pendingCompanionRecruitment?.playerId === playerId ||
    adventure.pendingCommanderFirstAid?.playerId === playerId ||
    adventure.pendingFarTileFlip?.playerId === playerId ||
    adventure.pendingTokenTeleport?.playerId === playerId ||
    adventure.pendingGarrison?.defenderPlayerId === playerId ||
    adventure.rewardQueue.some((reward) => reward.playerId === playerId)
  );
}

/**
 * Parallel PvP "keep": the OTHER seat's context `playerId` is engaged in as a
 * principal — the attacker's key for a PvP defender, or the key of whoever
 * opened a choice / garrison decision for them. While set, that seat acts only
 * there (see `parallelStateForPlayer`). Null outside the keep option.
 */
export function parallelPvpPinOwner(state: GameState, playerId: PlayerId): PlayerId | null {
  if (!parallelPvpKeeps(state) || playerId === NEUTRAL_PLAYER_ID) return null;
  const contexts = allContexts(state);
  return state.turnOrder.find((ownerId) =>
    ownerId !== playerId &&
    !state.players[ownerId]?.eliminated &&
    Boolean(contexts[ownerId]) &&
    contextAwaitsPrincipal(contexts[ownerId], playerId),
  ) ?? null;
}

/**
 * Parallel PvP "keep": whether `playerId` is ENGAGED anywhere, i.e. must not be
 * attacked or otherwise affected by another seat right now. Returns the key of
 * the context holding the engagement (or the seat itself for its round-event
 * work), null when free. Engaged = their own context holds any open work; they
 * fight, command neutrals in, or owe a decision in another context; or their
 * round-start event work is still open. `ignoreOwnerId` skips one context —
 * the live one the current action is running in, whose participants are part
 * of that very interaction.
 */
export function parallelEngagementOwner(
  state: GameState,
  playerId: PlayerId,
  ignoreOwnerId?: PlayerId,
): PlayerId | null {
  const contexts = allContexts(state);
  for (const ownerId of Object.keys(contexts)) {
    if (ownerId === ignoreOwnerId || state.players[ownerId]?.eliminated) continue;
    const context = contexts[ownerId];
    const combat = context.combat;
    if (
      (ownerId === playerId && busy(context)) ||
      contextAwaitsPrincipal(context, playerId) ||
      (combat && !combat.outcome && neutralCombatControllerId(state, combat) === playerId) ||
      context.pendingChoice?.playerId === playerId ||
      context.reactionWindow?.priorityPlayerId === playerId
    ) {
      return ownerId;
    }
  }
  const adventure = state.adventure;
  if (
    adventure?.parallelRoundRewards?.[playerId]?.length ||
    adventure?.parallelEventOpenPlayers?.includes(playerId) ||
    adventure?.parallelEventSuspended?.[playerId] ||
    adventure?.parallelSharedEventQueue?.some((reward) => reward.playerId === playerId)
  ) {
    return playerId;
  }
  return null;
}

/** "Wait" message for an action refused because `targetId` is engaged. */
export function parallelEngagementMessage(state: GameState, targetId: PlayerId, engagementOwnerId: PlayerId): string {
  const name = state.players[targetId]?.name ?? targetId;
  const context = allContexts(state)[engagementOwnerId];
  const inBattle = Boolean(
    context?.combat &&
      (context.combat.attackerPlayerId === targetId ||
        context.combat.defenderPlayerId === targetId ||
        neutralCombatControllerId(state, context.combat) === targetId),
  );
  return `Parallel turns: ${name} is busy ${inBattle ? "in a battle" : "resolving a choice"} — wait until they finish before attacking or affecting them.`;
}

export type ParallelContextOption = {
  ownerPlayerId: PlayerId;
  contextId: string;
  /** "watch" = read-only: this viewer has no decision in that battle. */
  role: "hero" | "neutrals" | "watch";
  /** A player-vs-player battle: `fighterName` then reads "A vs B". */
  pvp?: boolean;
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
  // Parallel PvP "keep": a seat pinned into another seat's context (the
  // defender of a PvP battle) has THAT window as its own — never its idle map.
  const home = seated ? parallelPvpPinOwner(state, playerId) ?? playerId : playerId;
  const actionable = controls
    ? [home, ...watchable.filter(id => id !== home && id !== playerId &&
        neutralCombatControllerId(state, contexts[id].combat!) === playerId)]
    : seated
      ? [home]
      : [];
  const battleName = (id: PlayerId): { fighterName: string; pvp?: true } => {
    const combat = contexts[id]?.combat;
    if (combat?.context.kind === "player") {
      const name = (seat: PlayerId) => state.players[seat]?.name ?? seat;
      return { fighterName: `${name(combat.attackerPlayerId)} vs ${name(combat.defenderPlayerId)}`, pvp: true };
    }
    return { fighterName: state.players[id]?.name ?? id };
  };
  // A seat pinned into another seat's PvP battle / choice is not offered
  // read-only watching: its own fight or answer comes first.
  const watchOnly = isComputerSeat || home !== playerId ? [] : watchable.filter((id) => !actionable.includes(id));
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
        ...battleName(id),
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
      role: id === home ? "hero" : "neutrals",
      ...battleName(id),
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
    state.adventure.winnerPlayerId
  )
    return state;
  if (state.adventure.eventResolution?.round === state.round) {
    // Only a seat whose Event window is actually OPEN leaves a separate wave /
    // timed-event barrier. A seat with work merely QUEUED must keep the raw
    // frame: projecting it parks the barrier owner's combat/visit, so
    // `roundStartEventResolver` reads null off the empty projection and both
    // barrier gates (`resolver && resolver !== playerId`) would let it act
    // freely under a whole-table freeze (audit 2026-09-11).
    return state.adventure.parallelEventOpenPlayers?.includes(playerId)
      ? projectContext(state, playerId) : state;
  }
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
  // Parallel PvP "keep": a seat engaged in ANOTHER seat's context — the
  // defender of a PvP battle keyed by its attacker, or the target of a choice /
  // garrison decision another seat opened — acts only there until it resolves,
  // never on its own map (where it could walk its fighting hero away or open a
  // second interaction). The pin is its "own" window: the turn clock and the
  // AFK / turn-timeout drivers (which ask for the seat's own window) land on it
  // too. It may still switch to command the neutrals of another live battle it
  // was assigned (PvP Neutral Control) so that battle is not stalled — the same
  // rule a fighter of its own Neutral battle has: the selection is honoured
  // while it owes no choice / reaction / end-of-battle acknowledgement in the
  // pinned one, and its "My battle" window is flagged when its unit is up.
  // Read-only watching is not offered to a pinned seat (parallelContextOptions).
  const pvpPin = parallelPvpPinOwner(state, playerId);
  if (pvpPin) {
    // Unowned serialized work is live (setup / legacy table choice): leave the
    // frame alone, as the owner resolution below would.
    if (!currentOwner && busy(capture(state))) return state;
    const pinned = pvpPin === currentOwner ? capture(state) : parked[pvpPin];
    const pinnedCombat = pinned?.combat;
    const pinnedOwesNow = !pinnedCombat || Boolean(pinnedCombat.outcome) ||
      pinned?.pendingChoice?.playerId === playerId ||
      pinned?.reactionWindow?.priorityPlayerId === playerId;
    const wanted = forcedOwnTurn ? undefined : requestedOwner ?? state.parallelContextSelections?.[playerId];
    const wantedCombat = wanted && wanted !== pvpPin && wanted !== playerId
      ? wanted === currentOwner ? state.combat : parked[wanted]?.combat
      : null;
    const target = wantedCombat && !wantedCombat.outcome && !pinnedOwesNow &&
      neutralCombatControllerId(state, wantedCombat) === playerId
      ? wanted!
      : pvpPin;
    if (currentOwner === target) {
      return state.parallelCombatOwnerId ? state : { ...state, parallelCombatOwnerId: currentOwner };
    }
    return projectContext(state, target);
  }
  const preferred = requestedOwner ?? (forcedOwnTurn ? playerId : state.parallelContextSelections?.[playerId]) ??
    (state.adventure.pvpNeutralControl ? playerId : undefined);
  const preferredCombat = preferred === currentOwner ? state.combat : preferred ? parked[preferred]?.combat : null;
  // A read-only WATCH selection must never HIDE a decision the viewer themselves
  // owes — a level-up Learning offer, a reward/visit choice, a reaction — whether
  // it is live or parked behind the battle they are watching. Their selection
  // sticks (getPlayerView mirrors it into the view) until the watched battle ends,
  // so without this a seat that peeked at another fight never sees its own pop-up
  // after winning ("Learning not asked after combat" in parallel play). An IDLE
  // watcher (nothing to answer) still keeps the battle it picked. A battle the
  // viewer FIGHTS or CONTROLS is not a passive watch, so it is honoured regardless.
  // Work the viewer themselves OWES in a context: an open pop-up or reaction
  // addressed to them, or — user re-report 2026-09-13 — their own DECIDED but
  // still unacknowledged battle. The acknowledgement comes BEFORE any pop-up
  // exists: XP, the field visit and the level-up Learning offer all resolve
  // only after this seat's ACKNOWLEDGE_COMBAT_END (finalizeAdventureCombat),
  // and while a selection pinned the seat to ANOTHER battle that
  // acknowledgement was not even legal (a watcher is offered nothing but the
  // switch), so the finished battle — and everything queued behind it — sat
  // parked until the seat manually switched back ("Learning not asked after
  // combat" in parallel play).
  const owesCombatAck = (combat: ParallelCombatContext["combat"]): boolean =>
    Boolean(
      combat?.outcome &&
        !combat.endAcknowledged &&
        combat.context.kind !== "sandbox" &&
        (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId),
    );
  const owesIn = (context: Pick<ParallelCombatContext, "combat" | "pendingChoice" | "reactionWindow">): boolean =>
    context.pendingChoice?.playerId === playerId ||
    context.reactionWindow?.priorityPlayerId === playerId ||
    owesCombatAck(context.combat);
  // A selection is only honoured while the viewer owes nothing OUTSIDE the
  // selected context — and that holds for a battle they CONTROL exactly as for
  // a read-only watch: the guards they command can wait the one click their own
  // acknowledgement / Learning offer / reward pop-up takes, and once their own
  // queue empties the still-standing selection returns them to the battle it
  // names by itself. (Owed work INSIDE the selected battle honours the
  // selection, of course — that projection is where the work is answered.)
  // Only the viewer's OWN flow counts here. A decision the viewer owes merely as
  // the PvP-Neutral-Control COMMANDER of somebody else's guards (activation
  // order, a guard reaction, formation) is not their own after-combat work: it
  // never outranked their own window (`preferred === playerId` is honoured
  // regardless), so it must not silently override an explicit watch / control
  // selection either — otherwise SELECT_PARALLEL_CONTEXT is accepted yet the seat
  // keeps acting in (and advancing) the commanded battle instead of the one it
  // chose. The option list still flags that battle `needsInput`.
  const commandsOnly = (combat: ParallelCombatContext["combat"]): boolean =>
    Boolean(
      combat &&
        combat.attackerPlayerId !== playerId &&
        combat.defenderPlayerId !== playerId &&
        neutralCombatControllerId(state, combat) === playerId,
    );
  const owesOwnWorkIn = (context: Pick<ParallelCombatContext, "combat" | "pendingChoice" | "reactionWindow">): boolean =>
    !commandsOnly(context.combat) && owesIn(context);
  const viewerOwesElsewhere =
    (currentOwner !== preferred && owesOwnWorkIn(state)) ||
    Object.entries(parked).some(([ownerId, context]) => ownerId !== preferred && owesOwnWorkIn(context));
  const honorsWatch = Boolean(preferred) && (preferred === playerId ||
    (preferredCombat && !preferredCombat.outcome && !viewerOwesElsewhere &&
      // A seat the AFK / turn-timeout driver is FORCING still only ever gets its
      // own window — that driver must never end up in a read-only context (it
      // already overrides `preferred`; this covers an explicit requestedOwner).
      (neutralCombatControllerId(state, preferredCombat) === playerId ||
        !forcedOwnTurn)));
  // When a watch is refused because the viewer owes work elsewhere, fall
  // THROUGH to the owner-resolution below (which finds the exact context that
  // holds it — own live/parked window, a finished battle awaiting their
  // acknowledgement, or a battle they control) rather than pinning them to
  // their own empty map frame.
  const targetPreference = honorsWatch
    ? preferred
    : viewerOwesElsewhere
      ? undefined
      : preferred
        ? playerId
        : undefined;
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
          // A finished battle parked under ANOTHER owner's key still awaiting
          // THIS participant's acknowledgement (a PvP fight is keyed by one
          // side only).
          owesCombatAck(context.combat) ||
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
export function projectContext(state: GameState, targetOwner: PlayerId): GameState {
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
    pendingManaTurbulence: target?.pendingManaTurbulence,
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
 * Whether `heroId` is a combatant of a battle that is still on the table — the
 * live frame's or one parked in ANY parallel context (an orphaned context of an
 * eliminated owner never counts, see `contextCounts`). Such a hero stays on its
 * battlefield until the battle is finalized: no map step may take it away, even
 * from another context its seat is acting in (e.g. commanding the neutrals of
 * someone else's fight). The seat's other heroes are unaffected.
 */
export function heroInAnyCombat(state: GameState, heroId: HeroId): boolean {
  const combats = [
    state.combat,
    ...Object.entries(state.parallelCombats ?? {})
      .filter(([ownerId]) => !state.players[ownerId]?.eliminated)
      .map(([, context]) => context.combat),
  ];
  return combats.some((combat) => {
    const context = combat?.context;
    return context?.kind === "neutral"
      ? context.heroId === heroId
      : context?.kind === "player"
        ? context.attackerHeroId === heroId || context.defenderHeroId === heroId
        : false;
  });
}

const capture = captureParallelContext;

/** Replace only one Event seat's interaction slots; all other contexts stay parked. */
export function replaceEventContext(state: GameState, playerId: PlayerId, replacement?: ParallelCombatContext): GameState {
  const own = projectContext(state, playerId);
  const contexts = { ...own.parallelCombats };
  if (replacement) contexts[playerId] = replacement;
  else delete contexts[playerId];
  // Do not re-capture the frame being replaced. Event callers have saved it.
  return projectContext({ ...own, parallelCombatOwnerId: undefined, combat: null, parallelCombats: contexts }, playerId);
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
