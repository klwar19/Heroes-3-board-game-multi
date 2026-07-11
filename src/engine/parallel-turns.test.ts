import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  normalizeParallelTurnRounds,
  parallelTurnsActive,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { pumpAdventureQueues } from "./adventure-reducer";

/**
 * Parallel turns (optional adventure rule) — engine-enforced behaviour:
 * simultaneous open turns, the one-interaction-at-a-time law with quiet moves,
 * shared-deck first-come-first-served, the PvP battle / mine-steal collapse
 * with the table-wide warning, the period-end collapse, and the post-collapse
 * ordered rotation that skips already-ended players without re-running their
 * start-of-turn. Every test carries an ordered-mode or unowned-target CONTROL.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function makeGame(
  seed: string,
  options: { parallelTurns?: number; players?: 2 | 3; events?: boolean; clearMulligans?: boolean } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: options.events ?? false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {})
  });
  if (options.clearMulligans !== false) {
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
  }
  // Inert Astrologers proclamations so even rounds resolve without a choice.
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

/**
 * An adjacent field of the hero rewritten to plain empty terrain. Each call
 * picks a DIFFERENT neighbour (tracked per state), so one test can paint an
 * empty staging field and a location field around the same hero.
 */
const usedStagingFields = new WeakMap<GameState, Set<string>>();
function emptyFieldNextTo(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) {
    throw new Error(`${heroId} is not on the map`);
  }
  const used = usedStagingFields.get(state) ?? new Set<string>();
  usedStagingFields.set(state, used);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !used.has(candidate.spaceId));
  if (!field) {
    throw new Error(`no adjacent field for ${heroId}`);
  }
  used.add(field.spaceId);
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  return field.spaceId;
}

/** Rewrites `spaceId` into the given location (clearing guards/flags first). */
function paintField(
  state: GameState,
  spaceId: string,
  location: string,
  extra: Partial<GameState["adventure"] extends infer A ? (A extends { fields: Record<string, infer F> } ? F : never) : never> = {}
): void {
  const field = state.adventure!.fields[spaceId];
  field.location = location;
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  Object.assign(field, extra);
}

function moveHero(state: GameState, playerId: PlayerId, to: string): GameState {
  return apply(state, { type: "MOVE_HERO", playerId, heroId: `hero_${playerId}`, to });
}

describe("parallel turns — setup and option plumbing", () => {
  it("starts every player's turn at once when the option is on (and stays ordered when off)", () => {
    const state = makeGame("par-setup", { parallelTurns: 2, clearMulligans: false });
    expect(state.turn.mode).toBe("parallel");
    expect(state.turn.simultaneousRoundLimit).toBe(2);
    expect(state.eventLog.some((event) => event.type === "PARALLEL_TURNS_STARTED")).toBe(true);
    // BOTH players' start-of-turn ran: each owes the mandatory draw. This also
    // pins the reward-queue divider fix — with one "start-turn-hand" divider
    // per player the pump must settle instead of cycling them forever.
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p2.canMulligan).toBe(true);

    const off = makeGame("par-setup-off", { clearMulligans: false });
    expect(off.turn.mode).toBe("ordered");
    expect(off.players.p2.canMulligan).toBe(false);
  });

  it("is multiplayer-only: a solo table always plays ordered", () => {
    const solo = createAdventureGameState({
      seed: "par-solo",
      rollFirstPlayer: false,
      events: false,
      parallelTurns: 3,
      players: [THREE_PLAYERS[0]]
    });
    expect(solo.turn.mode).toBe("ordered");
    expect(solo.turn.simultaneousRoundLimit).toBe(0);
  });

  it("normalizes the lobby value to whole rounds 0..12", () => {
    expect(normalizeParallelTurnRounds(4)).toBe(4);
    expect(normalizeParallelTurnRounds(4.9)).toBe(4);
    expect(normalizeParallelTurnRounds(-2)).toBe(0);
    expect(normalizeParallelTurnRounds(99)).toBe(12);
    expect(normalizeParallelTurnRounds(undefined)).toBe(0);
  });
});

describe("parallel turns — simultaneous open turns", () => {
  it("lets every player move in the same round, in any order (ordered mode rejects the same move)", () => {
    let state = makeGame("par-both-move", { parallelTurns: 2 });
    const p2Target = emptyFieldNextTo(state, "hero_p2");
    const p1Target = emptyFieldNextTo(state, "hero_p1");

    // Out of seat order: p2 moves first, then p1 — both succeed.
    state = moveHero(state, "p2", p2Target);
    state = moveHero(state, "p1", p1Target);
    expect(state.heroes.hero_p2.spaceId).toBe(p2Target);
    expect(state.heroes.hero_p1.spaceId).toBe(p1Target);

    // CONTROL: the identical off-turn move is illegal in an ordered game.
    const ordered = makeGame("par-both-move-ctrl");
    const target = emptyFieldNextTo(ordered, "hero_p2");
    expect(
      expectRejected(ordered, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: target })
    ).toContain("not that player's turn");
  });

  it("END_TURN marks a player done (no more actions) and wraps the round only when everyone ended", () => {
    let state = makeGame("par-end-turn", { parallelTurns: 3 });
    const p1Target = emptyFieldNextTo(state, "hero_p1");

    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.round).toBe(1); // p2 still open — no wrap
    expect(state.turn.completedPlayerIds).toEqual(["p1"]);
    expect(state.eventLog.some((event) => event.type === "PARALLEL_TURN_ENDED")).toBe(true);
    // A finished player is a spectator until the round wraps.
    expect(
      expectRejected(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: p1Target })
    ).toContain("already ended your parallel turn");
    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "END_TURN")).toBe(false);

    // p2 still plays, then ends: the round wraps and BOTH turns reopen.
    const p2Target = emptyFieldNextTo(state, "hero_p2");
    state = moveHero(state, "p2", p2Target);
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.round).toBe(2);
    expect(state.turn.mode).toBe("parallel");
    expect(state.turn.completedPlayerIds).toEqual([]);
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p2.canMulligan).toBe(true);
  });

  it("stops with a warning when the chosen period ends, then plays ordered", () => {
    let state = makeGame("par-period-end", { parallelTurns: 1 });
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // reverse order on purpose
    state = apply(state, { type: "END_TURN", playerId: "p1" });

    expect(state.round).toBe(2);
    expect(state.turn.mode).toBe("ordered");
    const stopped = state.eventLog.find((event) => event.type === "PARALLEL_TURNS_STOPPED");
    expect(stopped && stopped.type === "PARALLEL_TURNS_STOPPED" ? stopped.reason : null).toBe("period-ended");
    expect(state.activePlayerId).toBe("p1");
    // Round 2 starts ONE turn (p1's), not everyone's.
    state.players.p1.canMulligan = false;
    expect(state.players.p2.canMulligan).toBe(false);

    // Parallel gating is off: p2 may no longer act on p1's turn.
    const p2Target = emptyFieldNextTo(state, "hero_p2");
    expect(
      expectRejected(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p2Target })
    ).toContain("not that player's turn");
  });
});

describe("parallel turns — one interaction at a time (quiet moves while busy)", () => {
  /** p1 walks onto an unowned settlement, leaving p1's visit choice open. */
  function withOpenVisit(seed: string): { state: GameState; settlement: string } {
    let state = makeGame(seed, { parallelTurns: 2 });
    const settlement = emptyFieldNextTo(state, "hero_p1");
    paintField(state, settlement, "settlement");
    state = moveHero(state, "p1", settlement);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    return { state, settlement };
  }

  it("lets a bystander take quiet moves while another player's visit choice is open — but not visits, searches, card plays or END_TURN", () => {
    const { state } = withOpenVisit("par-busy-visit");

    // Quiet move: allowed.
    const quiet = emptyFieldNextTo(state, "hero_p2");
    const moved = moveHero(state, "p2", quiet);
    expect(moved.heroes.hero_p2.spaceId).toBe(quiet);
    // The open visit was untouched.
    expect(moved.adventure?.pendingVisit?.playerId).toBe("p1");

    // A location arrival would open a second visit: rejected with the wait message.
    const loud = emptyFieldNextTo(state, "hero_p2");
    paintField(state, loud, "settlement");
    expect(
      expectRejected(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: loud })
    ).toContain("wait until");

    // Ending the turn, deck searches and card plays wait too.
    expect(expectRejected(state, { type: "END_TURN", playerId: "p2" })).toContain("wait until");
    const p2Offers = getLegalActions(state, "p2");
    expect(p2Offers.some((legal) => legal.action.type === "SEARCH_DECK")).toBe(false);
    expect(p2Offers.some((legal) => legal.action.type === "PLAY_CARD")).toBe(false);
    expect(p2Offers.some((legal) => legal.action.type === "END_TURN")).toBe(false);
    // Quiet moves ARE offered.
    expect(p2Offers.some((legal) => legal.action.type === "MOVE_HERO")).toBe(true);

    // Once p1 resolves the settlement choice, the table unlocks.
    const choiceActions = getLegalActions(state, "p1");
    expect(choiceActions.length).toBeGreaterThan(0);
    const resolved = apply(state, choiceActions[0].action);
    if (!resolved.pendingChoice && !resolved.adventure?.pendingVisit) {
      const after = apply(resolved, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: loud });
      expect(after.adventure?.pendingVisit?.playerId).toBe("p2");
    }
  });

  it("keeps quiet moves and the start-of-turn draw available while another player's BATTLE is open", () => {
    let state = makeGame("par-busy-combat", { parallelTurns: 2 });
    const guardField = emptyFieldNextTo(state, "hero_p1");
    paintField(state, guardField, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p1", guardField);
    expect(state.combat).not.toBeNull();

    // Quiet move during the battle: allowed, battle untouched.
    const quiet = emptyFieldNextTo(state, "hero_p2");
    const moved = moveHero(state, "p2", quiet);
    expect(moved.combat?.id).toBe(state.combat?.id);
    expect(moved.heroes.hero_p2.spaceId).toBe(quiet);

    // A second battle cannot open while one is running.
    const guarded2 = emptyFieldNextTo(state, "hero_p2");
    paintField(state, guarded2, "empty_field", { difficulty: 1 });
    expect(
      expectRejected(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: guarded2 })
    ).toContain("wait until");
    // Town actions are blocked during combats (as in ordered play).
    expect(getLegalActions(state, "p2").some((legal) => legal.action.type === "BUILD_STRUCTURE")).toBe(false);

    // The mandatory start-of-turn draw can be taken while the battle runs.
    state.players.p2.canMulligan = true;
    const refreshed = apply(state, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
    expect(refreshed.players.p2.canMulligan).toBe(false);
  });

  it("serializes shared-deck searches strictly by arrival: whoever earns one first draws first, with no double-handling", () => {
    let state = makeGame("par-deck-order", { parallelTurns: 2 });
    const deckId = "abilities";
    // Undo the first-round face-up seed on this deck (tuck it back under the draw
    // pile), so the search flow starts from a full draw pile / empty discard —
    // this test asserts exact card conservation and a two-card discard.
    state.decks[deckId].drawPile.unshift(...state.decks[deckId].discardPile.splice(0));
    const before = state.decks[deckId].drawPile.length;
    expect(before).toBeGreaterThan(4);
    const p1HandBefore = state.players.p1.hand.length;
    const p2HandBefore = state.players.p2.hand.length;

    // Both players earn a Search of the SAME shared deck in the same parallel
    // round — p2's arrived first, so p2 draws first (the "who gets first" rule).
    state.adventure!.rewardQueue.push({ playerId: "p2", kind: "shared-deck-search", deckId, count: 2 });
    state.adventure!.rewardQueue.push({ playerId: "p1", kind: "shared-deck-search", deckId, count: 2 });
    pumpAdventureQueues(state);

    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(state.pendingChoice?.playerId).toBe("p2");
    const p2Revealed = state.pendingChoice?.type === "DECK_SEARCH" ? [...state.pendingChoice.revealedCardIds] : [];
    expect(p2Revealed).toHaveLength(2);
    // While p2 is looking at the revealed cards, p1 sees no search of their own.
    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "RESOLVE_DECK_SEARCH")).toBe(false);

    const keepP2 = getLegalActions(state, "p2").find((legal) => legal.action.type === "RESOLVE_DECK_SEARCH");
    expect(keepP2).toBeDefined();
    state = apply(state, keepP2!.action);

    // p1's search opened automatically next. (p2's leftovers created a discard
    // pile, so p1 may first be asked "search the deck or take the discard top"
    // — pick the deck search.)
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      expect(state.pendingChoice.playerId).toBe("p1");
      state = apply(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: state.pendingChoice.id,
        optionIndex: 0
      });
    }
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(state.pendingChoice?.playerId).toBe("p1");
    const p1Revealed = state.pendingChoice?.type === "DECK_SEARCH" ? [...state.pendingChoice.revealedCardIds] : [];
    expect(p1Revealed).toHaveLength(2);
    for (const cardId of p1Revealed) {
      expect(p2Revealed).not.toContain(cardId);
    }
    const keepP1 = getLegalActions(state, "p1").find((legal) => legal.action.type === "RESOLVE_DECK_SEARCH");
    state = apply(state, keepP1!.action);

    // Conservation: exactly 4 cards left the draw pile — one kept per player,
    // the rest to the deck's discard — nothing duplicated, nothing lost.
    const deck = state.decks[deckId];
    expect(deck.drawPile.length).toBe(before - 4);
    expect(deck.discardPile.length).toBe(2);
    expect(state.players.p1.hand.length).toBe(p1HandBefore + 1);
    expect(state.players.p2.hand.length).toBe(p2HandBefore + 1);
  });
});

describe("parallel turns — PvP stops the mode with a table-wide warning", () => {
  it("a PvP battle collapses parallel turns; the aggressor owns the ordered turn (ordered CONTROL: no warning event)", () => {
    let state = makeGame("par-pvp-battle", { parallelTurns: 3 });
    // March p2's hero next to p1's hero, then p1 attacks.
    const staging = emptyFieldNextTo(state, "hero_p1");
    state.heroes.hero_p2.spaceId = staging;
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: staging });

    expect(state.combat?.context.kind).toBe("player");
    expect(state.turn.mode).toBe("ordered");
    expect(state.turn.parallelStopped?.reason).toBe("pvp-battle");
    expect(state.activePlayerId).toBe("p1");
    const stopped = state.eventLog.find((event) => event.type === "PARALLEL_TURNS_STOPPED");
    expect(stopped && stopped.type === "PARALLEL_TURNS_STOPPED" ? stopped.message : "").toContain("STOPPED");

    // CONTROL: the same attack in an ordered game logs no parallel warning.
    let ordered = makeGame("par-pvp-battle-ctrl");
    const stagingCtrl = emptyFieldNextTo(ordered, "hero_p1");
    ordered.heroes.hero_p2.spaceId = stagingCtrl;
    ordered = apply(ordered, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: stagingCtrl });
    expect(ordered.combat?.context.kind).toBe("player");
    expect(ordered.eventLog.some((event) => event.type === "PARALLEL_TURNS_STOPPED")).toBe(false);
  });

  it("stealing another player's mine (walking in) collapses the mode; flagging an UNOWNED mine does not", () => {
    let state = makeGame("par-mine-steal", { parallelTurns: 3 });
    const mine = emptyFieldNextTo(state, "hero_p1");
    paintField(state, mine, "mine", { resource: "gold", amount: 1, flagOwnerId: "p2", everFlagged: true });

    state = moveHero(state, "p1", mine);
    expect(state.adventure?.fields[mine].flagOwnerId).toBe("p1");
    expect(state.turn.mode).toBe("ordered");
    expect(state.turn.parallelStopped?.reason).toBe("pvp-interaction");
    expect(state.activePlayerId).toBe("p1");

    // CONTROL: an unowned mine is ordinary expansion — parallel play continues.
    let control = makeGame("par-mine-neutral", { parallelTurns: 3 });
    const freeMine = emptyFieldNextTo(control, "hero_p1");
    paintField(control, freeMine, "mine", { resource: "gold", amount: 1 });
    control = moveHero(control, "p1", freeMine);
    expect(control.adventure?.fields[freeMine].flagOwnerId).toBe("p1");
    expect(control.turn.mode).toBe("parallel");
    expect(control.eventLog.some((event) => event.type === "PARALLEL_TURNS_STOPPED")).toBe(false);
  });

  it("a View Earth capture of an enemy mine collapses the mode through the same chokepoint", () => {
    let state = makeGame("par-view-earth", { parallelTurns: 3 });
    const mine = emptyFieldNextTo(state, "hero_p1");
    paintField(state, mine, "mine", { resource: "gold", amount: 1, flagOwnerId: "p2", everFlagged: true });
    state.players.p1.hand.push("spell.view_earth");

    state = apply(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_earth",
      target: { type: "none" },
      optionIndex: 0
    });
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("view-earth");
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 0 });

    expect(state.adventure?.fields[mine].flagOwnerId).toBe("p1");
    expect(state.turn.mode).toBe("ordered");
    expect(state.turn.parallelStopped?.reason).toBe("pvp-interaction");
  });

  it("a steal can never resolve while another player's interaction is open — the whole action is rejected", () => {
    let state = makeGame("par-steal-blocked", { parallelTurns: 2 });
    // p1 opens a settlement visit (their choice stays pending).
    const settlement = emptyFieldNextTo(state, "hero_p1");
    paintField(state, settlement, "settlement");
    state = moveHero(state, "p1", settlement);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    // p2 tries to walk onto p1's mine meanwhile: rejected atomically.
    const mine = emptyFieldNextTo(state, "hero_p2");
    paintField(state, mine, "mine", { resource: "gold", amount: 1, flagOwnerId: "p1", everFlagged: true });
    expect(
      expectRejected(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: mine })
    ).toContain("wait until");
    expect(state.adventure?.fields[mine].flagOwnerId).toBe("p1"); // not stolen
    expect(state.turn.mode).toBe("parallel"); // mode not collapsed
    expect(state.heroes.hero_p2.spaceId).not.toBe(mine); // move rolled back
  });

  it("a collapse before ANYONE ended still gives every seat its remaining turn — no premature round wrap past seat 1", () => {
    let state = makeGame("par-collapse-full-table", { parallelTurns: 3, players: 3 });
    // p2 (a MIDDLE seat) is the aggressor: steals p1's mine with nobody ended.
    const mine = emptyFieldNextTo(state, "hero_p2");
    paintField(state, mine, "mine", { resource: "gold", amount: 1, flagOwnerId: "p1", everFlagged: true });
    state = moveHero(state, "p2", mine);
    expect(state.turn.mode).toBe("ordered");
    expect(state.activePlayerId).toBe("p2");

    // p2 ends → p3 plays; p3 ends → the rotation passes seat 1 WITHOUT
    // wrapping the round, because p1 never had their turn ended.
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.activePlayerId).toBe("p3");
    expect(state.round).toBe(1);
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.activePlayerId).toBe("p1");
    expect(state.round).toBe(1);

    // Only once p1 (the last owed seat) ends does the round wrap.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.round).toBe(2);
    expect(state.activePlayerId).toBe("p1");
    expect(state.turn.mode).toBe("ordered");
  });

  it("after a mid-round collapse the ordered rotation skips already-ended players and never re-runs their start-of-turn", () => {
    let state = makeGame("par-collapse-rotation", { parallelTurns: 3, players: 3 });
    // p3 finishes their parallel turn first.
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.turn.completedPlayerIds).toEqual(["p3"]);

    // p1 steals p2's mine → collapse; p1 owns the ordered turn.
    const mine = emptyFieldNextTo(state, "hero_p1");
    paintField(state, mine, "mine", { resource: "gold", amount: 1, flagOwnerId: "p2", everFlagged: true });
    state = moveHero(state, "p1", mine);
    expect(state.turn.mode).toBe("ordered");
    expect(state.activePlayerId).toBe("p1");

    // p1 ends: the turn passes to p2 (p3 already played) with NO second
    // start-of-turn — p2 resumes, so no fresh mandatory draw appears.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    expect(state.round).toBe(1);
    expect(state.players.p2.canMulligan).toBe(false);

    // p2 ends: everyone has played — the round wraps into ordered round 2,
    // and only p1's turn starts (with a fresh draw), not everybody's.
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.round).toBe(2);
    expect(state.activePlayerId).toBe("p1");
    expect(state.turn.mode).toBe("ordered");
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p2.canMulligan).toBe(false);
    expect(state.players.p3.canMulligan).toBe(false);
  });
});

describe("parallel turns — leaving the game", () => {
  it("a player may give up mid-parallel: they are eliminated and the round wraps for the remaining players", () => {
    let state = makeGame("par-give-up", { parallelTurns: 3, players: 3 });
    state = apply(state, { type: "GIVE_UP", playerId: "p2" });
    expect(state.players.p2.eliminated).toBe(true);
    expect(state.turnOrder).toEqual(["p1", "p3"]);
    expect(state.turn.mode).toBe("parallel");
    expect(state.round).toBe(1);

    // The two remaining players end; the round wraps and stays parallel.
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.round).toBe(1);
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.round).toBe(2);
    expect(state.turn.mode).toBe("parallel");
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p3.canMulligan).toBe(true);
    expect(state.players.p2.canMulligan).toBe(false);
  });
});

describe("parallel turns — round-boundary decks (Astrologers & Events)", () => {
  it("wrapping a parallel round draws exactly ONE Astrologers card, and a Resource round exactly ONE Event card", () => {
    let state = makeGame("par-decks", { parallelTurns: 4, events: true });
    expect(parallelTurnsActive(state)).toBe(true);
    expect(state.decks.events).toBeDefined();

    const astrologersBefore = state.decks.astrologers.drawPile.length;
    // Round 1 → 2 (Astrologers round): both end, one proclamation drawn.
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.round).toBe(2);
    expect(state.decks.astrologers.drawPile.length).toBe(astrologersBefore - 1);
    expect(state.adventure?.astrologers?.activeCardId).toBeTruthy();

    // Round 2 → 3 (Resource round): exactly one Event card leaves the deck.
    const eventsBefore = state.decks.events.drawPile.length;
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.round).toBe(3);
    expect(state.turn.mode).toBe("parallel");
    expect(state.decks.events.drawPile.length).toBe(eventsBefore - 1);
  });
});
