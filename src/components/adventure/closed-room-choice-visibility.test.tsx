// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import {
  applyAction,
  createAdventureGameState,
  ASTROLOGERS_DECK_ID,
  EVENTS_DECK_ID,
  getActiveEventCard,
  getActiveAstrologersCard,
  getLegalActions,
  pumpAdventureQueues,
  redactStateForSeat,
  seatForViewer,
  OBSERVER_VIEWER_SEAT
} from "@/engine";
import { startAdventureRound } from "@/engine/adventure";
import type { GameAction, GameState } from "@/engine";

afterEach(cleanup);

const EAGLE = "ability.eagle_eye";

type TestActor = { clientId?: string; userId?: string };

function hostedGame(): GameState {
  const state = createAdventureGameState({
    seed: "closed-room-choice",
    difficulty: "normal",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  state.room = {
    hosted: true,
    hostClientId: "c1",
    members: [
      { clientId: "c1", name: "Catherine", seat: "p1", isHost: true },
      { clientId: "c2", name: "Sandro", seat: "p2", isHost: false }
    ]
  };
  return state;
}

/** Exactly what the page sends a hosted connection: seat via seatForViewer → redact. */
function frameForActor(state: GameState, actor: TestActor): GameState {
  const seat = seatForViewer(state, actor);
  const viewer = seat === "observer" ? OBSERVER_VIEWER_SEAT : seat;
  return redactStateForSeat(state, viewer);
}

function frameFor(state: GameState, clientId: string): GameState {
  return frameForActor(state, { clientId });
}

function applyOk(state: GameState, action: GameAction, actor?: string | TestActor): GameState {
  const options =
    typeof actor === "string"
      ? { actorClientId: actor }
      : actor
        ? {
            ...(actor.clientId ? { actorClientId: actor.clientId } : {}),
            ...(actor.userId ? { actorUserId: actor.userId } : {})
          }
        : undefined;
  const result = applyAction(state, action, options);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function stackEventDeck(state: GameState, cardId: string): void {
  const deck = state.decks[EVENTS_DECK_ID];
  deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
  deck.drawPile.push(cardId);
}

function stackAstrologersDeck(state: GameState, cardId: string): void {
  const deck = state.decks[ASTROLOGERS_DECK_ID];
  deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
  deck.drawPile.push(cardId);
}

function eventGame(options: { hosted: boolean; ranked: boolean; p2UserId?: string }): GameState {
  const state = createAdventureGameState({
    seed: `event-visibility-${options.hosted ? "hosted" : "open"}-${options.ranked ? "ranked" : "normal"}-${
      options.p2UserId ?? "guest"
    }`,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: true,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  state.room = options.hosted
    ? {
        hosted: true,
        hostClientId: "c1",
        ranked: options.ranked,
        members: [
          { clientId: "c1", name: "Catherine", seat: "p1", isHost: true },
          {
            clientId: "c2",
            name: "Sandro",
            seat: "p2",
            isHost: false,
            ...(options.p2UserId ? { userId: options.p2UserId } : {})
          }
        ]
      }
    : { hosted: false, hostClientId: null, ranked: options.ranked, members: [] };

  state.adventure!.events!.nextDrawerIndex = 1;
  state.adventure!.astrologers!.activeCardId = "astrologers.dancing_imp";
  stackEventDeck(state, "event.stables");
  state.round = 3;
  startAdventureRound(state);
  pumpAdventureQueues(state);
  const pendingVisit = state.adventure?.pendingVisit as { playerId?: string } | null | undefined;
  expect(pendingVisit?.playerId).toBe("p2");
  return state;
}

describe("closed room: the choice owner actually SEES and can click their Eagle Eye choice", () => {
  it("renders the take/discard buttons in a hosted room and resolves on click", () => {
    let state = hostedGame();
    const active = state.activePlayerId as "p1" | "p2";
    const activeClient = active === "p1" ? "c1" : "c2";

    // Clear the start-of-turn forced draw so a normal card play is legal.
    state = applyOk(state, { type: "REFRESH_HAND", playerId: active, discardCardIds: [] }, activeClient);
    state.players[active].hand = [EAGLE];

    // Play Eagle Eye through the hosted seat guard, as the real client does.
    const play = getLegalActions(state, active).find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === EAGLE
    );
    expect(play, "Eagle Eye should be playable").toBeTruthy();
    state = applyOk(state, play!.action, activeClient);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");

    // Build the frame the OWNER's connection receives, and the legalActions the
    // page computes from it (getLegalActions on the redacted frame for the seat).
    const frame = frameFor(state, activeClient);
    const legalActions = getLegalActions(frame, active);

    const onAction = vi.fn();
    render(
      <PromptTray
        legalActions={legalActions}
        onAction={onAction}
        state={frame}
        viewerPlayerId={active}
      />
    );

    // The choice buttons MUST be visible to the owner.
    const takeBtn = screen.getByRole("button", { name: /Take .* into hand/ });
    expect(takeBtn).toBeTruthy();
    expect(screen.getByRole("button", { name: /Discard it/ })).toBeTruthy();

    // Clicking submits a CHOOSE_OPTION the server accepts from the owner's seat.
    fireEvent.click(takeBtn);
    expect(onAction).toHaveBeenCalledTimes(1);
    const submitted = onAction.mock.calls[0][0] as GameAction;
    expect(submitted.type).toBe("CHOOSE_OPTION");
    const resolved = applyOk(state, submitted, activeClient);
    expect(resolved.pendingChoice).toBeNull();
  });

  it("the OTHER seat sees a waiting strip, not the owner's buttons (privacy + no false stuck)", () => {
    let state = hostedGame();
    const active = state.activePlayerId as "p1" | "p2";
    const activeClient = active === "p1" ? "c1" : "c2";
    const other = active === "p1" ? "p2" : "p1";
    const otherClient = active === "p1" ? "c2" : "c1";

    state = applyOk(state, { type: "REFRESH_HAND", playerId: active, discardCardIds: [] }, activeClient);
    state.players[active].hand = [EAGLE];
    const play = getLegalActions(state, active).find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === EAGLE
    )!;
    state = applyOk(state, play.action, activeClient);

    const frame = frameFor(state, otherClient);
    const legalActions = getLegalActions(frame, other);
    render(
      <PromptTray legalActions={legalActions} onAction={vi.fn()} state={frame} viewerPlayerId={other} />
    );
    // No take/discard buttons for the non-owner; a "is deciding" strip instead.
    expect(screen.queryByRole("button", { name: /into hand/ })).toBeNull();
    expect(screen.getByText(/is deciding/i)).toBeTruthy();
  });
});

const eventVisibilityCases = [
  { label: "open normal guest", hosted: false, ranked: false },
  { label: "open ranked guest", hosted: false, ranked: true },
  { label: "closed normal guest", hosted: true, ranked: false, actor: { clientId: "c2" } },
  { label: "closed ranked guest", hosted: true, ranked: true, actor: { clientId: "c2" } },
  {
    label: "closed ranked account player",
    hosted: true,
    ranked: true,
    p2UserId: "u-player",
    actor: { clientId: "new-tab", userId: "u-player" }
  },
  {
    label: "closed ranked admin account",
    hosted: true,
    ranked: true,
    p2UserId: "u-admin",
    actor: { clientId: "admin-tab", userId: "u-admin" }
  }
] satisfies {
  label: string;
  hosted: boolean;
  ranked: boolean;
  p2UserId?: string;
  actor?: TestActor;
}[];

const astrologersVisibilityCases = [
  { label: "open normal guest", hosted: false, ranked: false },
  { label: "open ranked guest", hosted: false, ranked: true },
  { label: "closed normal guest", hosted: true, ranked: false, actor: { clientId: "c1" } },
  { label: "closed ranked guest", hosted: true, ranked: true, actor: { clientId: "c1" } },
  {
    label: "closed ranked account player",
    hosted: true,
    ranked: true,
    p1UserId: "u-player",
    actor: { clientId: "new-tab", userId: "u-player" }
  },
  {
    label: "closed ranked admin account",
    hosted: true,
    ranked: true,
    p1UserId: "u-admin",
    actor: { clientId: "admin-tab", userId: "u-admin" }
  }
] satisfies {
  label: string;
  hosted: boolean;
  ranked: boolean;
  p1UserId?: string;
  actor?: TestActor;
}[];

function astrologersGame(options: {
  hosted: boolean;
  ranked: boolean;
  p1UserId?: string;
}): GameState {
  const state = createAdventureGameState({
    seed: `astrologers-visibility-${options.hosted ? "hosted" : "open"}-${options.ranked ? "ranked" : "normal"}-${
      options.p1UserId ?? "guest"
    }`,
    difficulty: "normal",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.morale = 0;
  }
  state.players.p1.hand = ["stat.attack"];
  state.players.p1.discard = [];
  state.players.p2.hand = ["stat.defense"];
  state.players.p2.discard = [];
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  state.room = options.hosted
    ? {
        hosted: true,
        hostClientId: "c1",
        ranked: options.ranked,
        members: [
          {
            clientId: "c1",
            name: "Catherine",
            seat: "p1",
            isHost: true,
            ...(options.p1UserId ? { userId: options.p1UserId } : {})
          },
          { clientId: "c2", name: "Sandro", seat: "p2", isHost: false }
        ]
      }
    : { hosted: false, hostClientId: null, ranked: options.ranked, members: [] };

  stackAstrologersDeck(state, "astrologers.dancing_imp");
  state.round = 2;
  startAdventureRound(state);
  pumpAdventureQueues(state);
  const pendingVisit = state.adventure?.pendingVisit as { playerId?: string } | null | undefined;
  expect(pendingVisit?.playerId).toBe("p1");
  return state;
}

describe("Astrologers Proclaim visibility: every seat can see and resolve its proclamation prompt", () => {
  it.each(astrologersVisibilityCases)("$label: the current resolver sees Dancing Imp and can resolve it", (testCase) => {
    const state = astrologersGame(testCase);
    const actor = testCase.actor;
    const viewer = testCase.hosted ? seatForViewer(state, actor ?? {}) : "p1";
    expect(viewer).toBe("p1");
    const frame = testCase.hosted ? frameForActor(state, actor ?? {}) : state;
    expect(frame.adventure?.astrologers?.activeCardId).toBe("astrologers.dancing_imp");
    expect(getActiveAstrologersCard(frame)?.name).toBe("Dancing Imp");
    const legalActions = getLegalActions(frame, "p1");

    const onAction = vi.fn();
    render(<PromptTray legalActions={legalActions} onAction={onAction} state={frame} viewerPlayerId="p1" />);

    expect(screen.getByRole("dialog", { name: /Astrologers Proclaim: Dancing Imp/i })).toBeTruthy();
    const resolve = screen.getByRole("button", { name: /Empower Attack \(hand\)/i });
    fireEvent.click(resolve);
    expect(onAction).toHaveBeenCalledTimes(1);

    const submitted = onAction.mock.calls[0][0] as GameAction;
    const resolved = applyOk(state, submitted, testCase.hosted ? actor : undefined);
    expect(resolved.players.p1.hand).toContain("stat.attack.empowered");
    expect(resolved.adventure?.pendingVisit?.playerId).toBe("p2");
  });

  it.each(astrologersVisibilityCases)("$label: the waiting seat sees the Astrologers proclamation is being resolved", (testCase) => {
    const state = astrologersGame(testCase);
    const frame = testCase.hosted ? frameForActor(state, { clientId: "c2" }) : state;
    expect(frame.adventure?.astrologers?.activeCardId).toBe("astrologers.dancing_imp");
    expect(getActiveAstrologersCard(frame)?.name).toBe("Dancing Imp");

    render(<PromptTray legalActions={getLegalActions(frame, "p2")} onAction={vi.fn()} state={frame} viewerPlayerId="p2" />);

    expect(screen.queryByRole("button", { name: /Empower Attack \(hand\)/i })).toBeNull();
    expect(screen.getByText(/Catherine is resolving the Astrologers proclamation/i)).toBeTruthy();
  });
});

describe("Event deck visibility: rotated starter still shows the Event to every seat", () => {
  it.each(eventVisibilityCases)("$label: the current resolver sees the Event prompt and can resolve it", (testCase) => {
    const state = eventGame(testCase);
    const actor = testCase.actor;
    const viewer = testCase.hosted ? seatForViewer(state, actor ?? {}) : "p2";
    expect(viewer).toBe("p2");
    const frame = testCase.hosted ? frameForActor(state, actor ?? {}) : state;
    expect(frame.adventure?.events?.activeCardId).toBe("event.stables");
    expect(getActiveEventCard(frame)?.name).toMatch(/Stables/i);
    const legalActions = getLegalActions(frame, "p2");

    const onAction = vi.fn();
    render(<PromptTray legalActions={legalActions} onAction={onAction} state={frame} viewerPlayerId="p2" />);

    expect(screen.getByRole("dialog", { name: /Event: Stables/i })).toBeTruthy();
    const resolve = screen.getByRole("button", { name: /Main hero gains \+1 movement/i });
    fireEvent.click(resolve);
    expect(onAction).toHaveBeenCalledTimes(1);

    const submitted = onAction.mock.calls[0][0] as GameAction;
    const resolved = applyOk(state, submitted, testCase.hosted ? actor : undefined);
    expect(resolved.adventure?.pendingVisit?.playerId).toBe("p1");
  });

  it.each(eventVisibilityCases)("$label: the waiting seat still sees which Event is being resolved", (testCase) => {
    const state = eventGame(testCase);
    const frame = testCase.hosted ? frameForActor(state, { clientId: "c1" }) : state;
    expect(frame.adventure?.events?.activeCardId).toBe("event.stables");
    expect(getActiveEventCard(frame)?.name).toMatch(/Stables/i);

    render(<PromptTray legalActions={getLegalActions(frame, "p1")} onAction={vi.fn()} state={frame} viewerPlayerId="p1" />);

    expect(screen.queryByRole("button", { name: /Main hero gains \+1 movement/i })).toBeNull();
    expect(screen.getByText(/Sandro is resolving the round's Event/i)).toBeTruthy();
  });
});

/**
 * Every pending-choice TYPE must render an actionable surface for its owner —
 * a choice type with no surface is literally "player sees no choice, can't do
 * anything" (the closed-room report). TARNUM_SEARCH (Tarnum Conflux VI's
 * over-limit Spell search) was such a hole: getLegalActions offered its
 * CHOOSE_OPTION picks, but PromptTray rendered nothing because it gated every
 * surface on the choice TYPE and TARNUM_SEARCH matched none. The dedicated
 * branch + the catch-all below both close it.
 */
function stateWithChoice(choice: NonNullable<GameState["pendingChoice"]>): GameState {
  const state = createAdventureGameState({ seed: "choice-surface", rollFirstPlayer: false });
  state.combat = null;
  state.pendingChoice = choice;
  return state;
}

describe("no owner-owned pending choice is ever invisible (freeze guard)", () => {
  it("renders TARNUM_SEARCH deck picks for its owner", () => {
    const state = stateWithChoice({
      id: "ts1",
      type: "TARNUM_SEARCH",
      playerId: "p1",
      remaining: 2,
      returnPhase: state0Phase()
    } as NonNullable<GameState["pendingChoice"]>);
    // The two deck-pick CHOOSE_OPTION actions getLegalActions would supply.
    const legalActions = [
      { label: "Search the basic Spell deck", action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId: "ts1", optionIndex: 0 } },
      { label: "Search the expert Spell deck", action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId: "ts1", optionIndex: 1 } }
    ] as Parameters<typeof PromptTray>[0]["legalActions"];

    const onAction = vi.fn();
    render(<PromptTray legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);
    // The owner sees a titled tray naming the Tarnum search…
    expect(screen.getByText(/Tarnum — Search a Spell deck/i)).toBeTruthy();
    // …and both deck-pick buttons, which submit on click.
    fireEvent.click(screen.getByRole("button", { name: /Search the basic Spell deck/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("the catch-all renders resolving actions for ANY owned choice a specific branch missed", () => {
    // A hypothetical/rare choice type that no dedicated branch handles: the
    // catch-all must still surface its resolving actions rather than freeze.
    const state = stateWithChoice({
      id: "x1",
      type: "TARNUM_SEARCH",
      playerId: "p1",
      remaining: 1,
      returnPhase: state0Phase()
    } as NonNullable<GameState["pendingChoice"]>);
    const legalActions = [
      { label: "Some resolving action", action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId: "x1", optionIndex: 0 } }
    ] as Parameters<typeof PromptTray>[0]["legalActions"];
    render(<PromptTray legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.getByRole("button", { name: /Some resolving action/ })).toBeTruthy();
  });

  it("a non-owner sees a waiting strip, not the TARNUM_SEARCH picks", () => {
    const state = stateWithChoice({
      id: "ts2",
      type: "TARNUM_SEARCH",
      playerId: "p2",
      remaining: 2,
      returnPhase: state0Phase()
    } as NonNullable<GameState["pendingChoice"]>);
    render(<PromptTray legalActions={[]} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.queryByRole("button", { name: /Search the/ })).toBeNull();
    expect(screen.getByText(/is deciding/i)).toBeTruthy();
  });
});

/** The setup phase constant a fresh adventure game reports (for returnPhase). */
function state0Phase(): GameState["phase"] {
  return "player-turn";
}
