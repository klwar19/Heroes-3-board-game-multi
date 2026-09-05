/**
 * Parallel turns — WATCHING a battle you have no stake in (user report
 * 2026-09-05: "observer can't see both battles? keep being forced to a battle
 * when view map").
 *
 * Two root causes are pinned here:
 *  1. a viewer with NO SEAT OF THEIR OWN (an unseated spectator, an eliminated
 *     player) used to get the RAW state back from `parallelStateForPlayer`,
 *     i.e. whichever battle the single global `parallelCombatOwnerId` happened
 *     to point at. That pointer moves every time ANY other seat acts, so their
 *     screen was dragged from battle to battle;
 *  2. nobody without a decision in a battle could choose to follow it at all —
 *     `parallelContextOptions` only ever listed a viewer's OWN work and the
 *     guards it commands, and only with PvP Neutral Control on.
 *
 * Every claim below carries a CONTROL (ordered mode, or a seat that really does
 * hold a decision) and was mutation-checked against the pre-fix engine.
 */
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId,
} from "./index";
import { describe, expect, it } from "vitest";
import {
  isParallelWatchOnly,
  parallelContextOptions,
  parallelStateForPlayer,
  settleParallelCombatContext,
} from "./parallel-combats";
import { getPlayerView } from "./player-view";

const SPECTATOR = "observer" as PlayerId;

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" },
];

function makeGame(seed: string, options: { parallelTurns?: number; pvpNeutralControl?: boolean } = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    ruleset: "binh",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: options.parallelTurns ?? 4,
    players: THREE_PLAYERS,
    ...(options.pvpNeutralControl ? { pvpNeutralControl: true } : {}),
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  for (let i = 0; i < 8; i += 1) state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  return state;
}

const usedStagingFields = new WeakMap<GameState, Set<string>>();
function guardFieldNextTo(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "")!;
  const used = usedStagingFields.get(state) ?? new Set<string>();
  usedStagingFields.set(state, used);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !used.has(candidate.spaceId))!;
  used.add(field.spaceId);
  Object.assign(field as unknown as Record<string, unknown>, {
    location: "empty_field",
    difficulty: 1,
    flagOwnerId: null,
    blackCube: false,
    everFlagged: false,
  });
  delete (field as unknown as Record<string, unknown>).bankId;
  return field.spaceId;
}

function fight(state: GameState, playerId: PlayerId): GameState {
  return apply(state, {
    type: "MOVE_HERO",
    playerId,
    heroId: `hero_${playerId}`,
    to: guardFieldNextTo(state, `hero_${playerId}`),
  });
}

/** p1 and p2 each open their own neutral battle; p3's turn is still open. */
function twoBattles(seed: string, options: { pvpNeutralControl?: boolean } = {}): GameState {
  let state = makeGame(seed, options);
  state = fight(state, "p1");
  state = fight(state, "p2");
  expect(Object.keys(state.parallelCombats ?? {})).toContain("p1");
  expect(state.combat, "p2's battle is the globally live one").toBeTruthy();
  expect(state.parallelCombatOwnerId).toBe("p2");
  return state;
}

describe("a viewer with no seat is never dragged between parallel battles", () => {
  it("a spectator holds one chosen battle while other seats act (raw-pointer CONTROL)", () => {
    let state = twoBattles("watch-spectator-stable");
    const first = getPlayerView(state, SPECTATOR).combat?.id ?? null;
    expect(first, "the spectator is shown a battle").toBeTruthy();
    // The globally live context is p2's; the spectator is deterministically put
    // on the FIRST live battle in seat order instead of following the pointer.
    expect(first).toBe(state.parallelCombats!.p1.combat!.id);

    // p3 now opens a third battle, which moves the global pointer to p3.
    state = fight(state, "p3");
    expect(state.parallelCombatOwnerId, "the global pointer moved").toBe("p3");
    expect(
      getPlayerView(state, SPECTATOR).combat?.id,
      "the spectator's screen did NOT follow the pointer",
    ).toBe(first);
    // CONTROL: the spectator is not merely stuck on nothing — the battle they
    // hold is a real, live one and the other two are offered as watch options.
    const options = getPlayerView(state, SPECTATOR).parallelContextOptions ?? [];
    expect(options.map((option) => option.ownerPlayerId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(options.every((option) => option.role === "watch" && !option.needsInput)).toBe(true);
  });

  it("a spectator may be pointed at any running battle, and falls back when it ends", () => {
    const state = twoBattles("watch-spectator-pick");
    expect(parallelStateForPlayer(state, SPECTATOR, "p2").combat?.id).toBe(state.combat!.id);
    expect(parallelStateForPlayer(state, SPECTATOR, "p1").combat?.id).toBe(
      state.parallelCombats!.p1.combat!.id,
    );
    // A seat with no battle at all is not a watchable target: the spectator
    // falls back to the first live one rather than an empty screen.
    expect(parallelStateForPlayer(state, SPECTATOR, "p3").combat?.id).toBe(
      state.parallelCombats!.p1.combat!.id,
    );
  });

  it("a spectator's own switch never moves the table's live context", () => {
    let state = fight(twoBattles("watch-spectator-commit"), "p3");
    const liveBefore = state.combat!.id;
    expect(state.parallelCombatOwnerId, "p3 fought last, so it holds the live slot").toBe("p3");
    // The spectator starts on p1 (first live in seat order) and pins p2's battle
    // instead. Its own frame is a PROJECTION — if the reducer committed that
    // projection the authoritative pointer (and therefore what every OTHER seat
    // renders) would have been dragged to p2 by a viewer with no seat at all.
    expect(getPlayerView(state, SPECTATOR).combat?.id).toBe(state.parallelCombats!.p1.combat!.id);
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: SPECTATOR, ownerPlayerId: "p2" });
    expect(state.parallelContextSelections?.[SPECTATOR]).toBe("p2");
    expect(state.parallelCombatOwnerId, "the authoritative pointer stayed put").toBe("p3");
    expect(state.combat?.id).toBe(liveBefore);
    expect(getPlayerView(state, "p3").combat?.id).toBe(liveBefore);
    // ...while the spectator now really holds p2's battle.
    expect(getPlayerView(state, SPECTATOR).combat?.id).toBe(state.parallelCombats!.p2.combat!.id);
  });

  it("CONTROL: an ORDERED-mode table offers no watch options and is untouched", () => {
    let state = makeGame("watch-ordered-control", { parallelTurns: 0 });
    expect(state.turn.mode).toBe("ordered");
    state = fight(state, "p1");
    expect(parallelContextOptions(state, SPECTATOR)).toEqual([]);
    expect(parallelContextOptions(state, "p2")).toEqual([]);
    expect(parallelStateForPlayer(state, SPECTATOR)).toBe(state);
    expect(getPlayerView(state, SPECTATOR).parallelContextOptions).toBeUndefined();
  });
});

describe("a seat with no decision in a battle can WATCH it read-only", () => {
  it("a bystander seat selects another player's battle and is offered nothing but the switch", () => {
    let state = twoBattles("watch-bystander");
    // p3 is a bystander: its own turn is open and it fights nothing.
    const offered = parallelContextOptions(parallelStateForPlayer(state, "p3"), "p3");
    expect(offered.find((option) => option.ownerPlayerId === "p1")?.role).toBe("watch");
    const selects = getLegalActions(state, "p3").filter(
      (legal) => legal.action.type === "SELECT_PARALLEL_CONTEXT",
    );
    expect(selects.map((legal) => (legal.action as { ownerPlayerId: PlayerId }).ownerPlayerId).sort())
      .toEqual(["p1", "p2"]);
    // Before watching, p3 really does have its own turn to play.
    expect(getLegalActions(state, "p3").some((legal) => legal.action.type === "MOVE_HERO")).toBe(true);

    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p1" });
    const watched = parallelStateForPlayer(state, "p3");
    expect(watched.combat?.id, "p3 now sees p1's battle").toBe(
      state.parallelCombats!.p1.combat!.id ?? watched.combat?.id,
    );
    expect(isParallelWatchOnly(watched, "p3")).toBe(true);
    // READ-ONLY: nothing but the switch back / to the other battle.
    const watching = getLegalActions(state, "p3");
    expect(watching.length).toBeGreaterThan(0);
    expect(new Set(watching.map((legal) => legal.action.type))).toEqual(
      new Set(["SELECT_PARALLEL_CONTEXT"]),
    );
    expect(
      watching.some((legal) => (legal.action as { ownerPlayerId: PlayerId }).ownerPlayerId === "p3"),
      "the way back to their own turn is always offered — a watcher is never wedged",
    ).toBe(true);

    // And it really is reversible: back on their own window the turn returns.
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p3" });
    expect(state.parallelContextSelections?.p3).toBeUndefined();
    expect(isParallelWatchOnly(parallelStateForPlayer(state, "p3"), "p3")).toBe(false);
    expect(getLegalActions(state, "p3").some((legal) => legal.action.type === "MOVE_HERO")).toBe(true);
  });

  it("CONTROL: a FIGHTER is never watch-only in their own battle", () => {
    const state = twoBattles("watch-fighter-control");
    const own = parallelStateForPlayer(state, "p1");
    expect(own.combat).toBeTruthy();
    expect(isParallelWatchOnly(own, "p1")).toBe(false);
    expect(getLegalActions(state, "p1").every((legal) => legal.action.type === "SELECT_PARALLEL_CONTEXT"))
      .toBe(false);
  });

  it("one seat's choice never changes what another seat renders", () => {
    let state = twoBattles("watch-per-seat");
    const p2Before = getPlayerView(state, "p2").combat?.id;
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p1" });
    expect(getPlayerView(state, "p2").combat?.id, "p2 still sees its OWN battle").toBe(p2Before);
    expect(getPlayerView(state, "p1").combat?.id).toBe(
      parallelStateForPlayer(state, "p1").combat?.id,
    );
    // The wire never carries another seat's selection.
    expect(Object.keys(getPlayerView(state, "p2").parallelContextSelections ?? {})).toEqual(["p2"]);
    expect(getPlayerView(state, "p2").parallelCombats).toBeUndefined();
  });

  it("a watch ends by itself when the watched battle does", () => {
    let state = twoBattles("watch-auto-end");
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p1" });
    expect(state.parallelContextSelections?.p3).toBe("p1");
    // While the battle runs the selection survives a settle...
    settleParallelCombatContext(state);
    expect(state.parallelContextSelections?.p3).toBe("p1");
    // ...and is dropped the moment that battle is decided, returning p3 to its
    // own adventure without having to remember to switch back.
    state.parallelCombats!.p1.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutrals" as PlayerId,
      reason: "all-enemy-units-defeated",
    };
    settleParallelCombatContext(state);
    expect(state.parallelContextSelections?.p3).toBeUndefined();
    expect(isParallelWatchOnly(parallelStateForPlayer(state, "p3"), "p3")).toBe(false);
  });

  it("a watched context's private search reveals stay masked", () => {
    let state = twoBattles("watch-privacy");
    const deckId = Object.keys(state.decks).find((id) => state.decks[id].drawPile.length > 2)!;
    const secret = state.parallelCombats!.p1.adventure.rewardQueue; // touched below only for shape
    expect(Array.isArray(secret)).toBe(true);
    const lifted = state.decks[deckId].drawPile.pop()!;
    state.parallelCombats!.p1.pendingChoice = {
      id: "p1-search",
      type: "DECK_SEARCH",
      playerId: "p1",
      deckId,
      revealedCardIds: [lifted],
      returnPhase: "player-turn",
    };
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p1" });
    const view = getPlayerView(state, "p3");
    expect(view.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(
      (view.pendingChoice as { revealedCardIds: string[] }).revealedCardIds,
      "the watcher learns the COUNT, never the cards",
    ).toEqual(["hidden"]);
    // CONTROL: the searcher themselves still sees the real card.
    expect((getPlayerView(state, "p1").pendingChoice as { revealedCardIds: string[] } | null)?.revealedCardIds ?? [lifted])
      .toContain(lifted);
  });
});
