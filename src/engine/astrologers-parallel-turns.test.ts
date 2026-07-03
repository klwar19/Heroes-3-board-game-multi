import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  effectiveHandLimit,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";

/**
 * Astrologers Proclaim × parallel turns (optional rule) — the audit the user
 * asked for: do the proclamations still behave under simultaneous turns?
 *
 * They do, BY CONSTRUCTION, and each mechanism is pinned here with an
 * ordered-mode or face-down CONTROL:
 *
 *  A. Immediate ALL-PLAYER effects (movement/morale/resource) are applied in a
 *     round-start loop over every seat — they reach non-active parallel seats
 *     too (Battalion's Stallion gives BOTH heroes +1, not just the drawer's).
 *  B. Per-player CHOICE effects go through the shared reward queue under the
 *     round-start Event barrier: they open ONE seat's choice at a time in seat
 *     order, and while ANY seat's choice is open the WHOLE table is frozen — no
 *     other seat may resolve, end its turn, or even take a quiet move until every
 *     seat has resolved the proclamation (Dancing Imp). The freeze lifts the
 *     instant the last seat resolves, and parallel quiet play resumes.
 *  C. Ongoing PASSIVE effects are read at the point of use for ANY seat, not
 *     just the active player (Profuse Growth's hand-limit +1).
 *  D. Sanctuary (the new PvP-attack ban) makes a Hero-vs-Hero attack illegal AND
 *     therefore keeps parallel turns RUNNING — no PvP ever triggers the collapse.
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

/** Visit-step option labels currently offered to `playerId`. */
function visitLabels(state: GameState, playerId: PlayerId): string[] {
  return getLegalActions(state, playerId)
    .filter((legal) => legal.action.type === "RESOLVE_VISIT_STEP")
    .map((legal) => legal.label);
}

/** Resolves the mandatory start-of-turn draw (draw new, keep all) if pending. */
function takeStartOfTurnDraw(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player.needsHandRefresh || player.canMulligan) {
    return apply(state, { type: "REFRESH_HAND", playerId, discardCardIds: [] });
  }
  return state;
}

/**
 * A parallel-turns adventure game whose round-2 (Astrologers) draw is
 * `round2Card`; later even rounds draw Dead Silence. Mulligans/hand refresh are
 * cleared so round 1 ends cleanly with plain END_TURNs.
 */
function makeParallelGame(seed: string, round2Card: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    parallelTurns: 4
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Later even rounds resolve without a choice; the round-2 draw is popped last.
  state.decks.astrologers.drawPile = [
    "astrologers.dead_silence",
    "astrologers.dead_silence",
    round2Card
  ];
  return state;
}

/** Ends round 1 for both seats, wrapping into the round-2 Astrologers round. */
function wrapIntoRound2(state: GameState): GameState {
  let next = apply(state, { type: "END_TURN", playerId: "p2" });
  next = apply(next, { type: "END_TURN", playerId: "p1" });
  expect(next.round).toBe(2);
  return next;
}

/** Repaints an empty, trigger-free field next to a hero and returns its id. */
function emptyFieldNextTo(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) {
    throw new Error(`${heroId} is not on the map`);
  }
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town");
  if (!field) {
    throw new Error(`no adjacent field for ${heroId}`);
  }
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  return field.spaceId;
}

// ===========================================================================
// A. Immediate all-player effect reaches every parallel seat
// ===========================================================================

describe("Astrologers × parallel — immediate all-player effects reach non-active seats", () => {
  it("Battalion's Stallion gives BOTH heroes +1 Movement, not just the first seat's", () => {
    const buffed = wrapIntoRound2(makeParallelGame("par-astro-stallion", "astrologers.battalions_stallion"));
    const control = wrapIntoRound2(makeParallelGame("par-astro-stallion", "astrologers.dead_silence"));

    expect(buffed.adventure?.astrologers?.activeCardId).toBe("astrologers.battalions_stallion");
    // Same seed → same base movement; the proclamation adds exactly +1 to EACH
    // hero (every seat), while parallel mode is running for the whole table.
    expect(buffed.heroes.hero_p1.movementPoints).toBe(control.heroes.hero_p1.movementPoints + 1);
    expect(buffed.heroes.hero_p2.movementPoints).toBe(control.heroes.hero_p2.movementPoints + 1);
    expect(buffed.turn.mode).toBe("parallel");
  });
});

// ===========================================================================
// B. Per-player choice serializes through the singleton interaction
// ===========================================================================

describe("Astrologers × parallel — per-player choices freeze the whole table until every seat resolves", () => {
  function dancingImpGame(seed: string): GameState {
    const state = makeParallelGame(seed, "astrologers.dancing_imp");
    // Each seat holds an empowerable Statistic, so each is offered the empower.
    state.players.p1.hand = ["stat.attack"];
    state.players.p2.hand = ["stat.attack"];
    return state;
  }

  it("opens seat 1's empower first; seat 2 is FULLY frozen (no quiet move) until the whole table resolves", () => {
    let state = wrapIntoRound2(dancingImpGame("par-astro-imp"));

    // Seat 1's Dancing Imp empower is the open (singleton) interaction — offered
    // to seat 1 (the empower renders as a CHOOSE_ONE visit; assert by its label).
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(state.adventure?.eventResolution?.round).toBe(2); // the barrier is up
    expect(visitLabels(state, "p1").some((label) => /Empower Attack/.test(label))).toBe(true);

    // Seat 2 is frozen by the round-start Event barrier: it has NO legal actions
    // at all — it may not resolve the visit, may not end its turn, and (unlike a
    // plain foreign-interaction bystander) may not even take a quiet move.
    expect(getLegalActions(state, "p2")).toEqual([]);
    expect(expectRejected(state, { type: "END_TURN", playerId: "p2" })).toContain("Event is still being resolved");
    const quiet = emptyFieldNextTo(state, "hero_p2");
    expect(expectRejected(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: quiet })).toContain(
      "Event is still being resolved"
    );
    // The blocked move never happened — seat 2's hero stayed put and seat 1's
    // interaction is untouched.
    expect(state.heroes.hero_p2.spaceId).not.toBe(quiet);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    // Seat 1 empowers: the effect actually fires for a parallel seat...
    const empowerP1 = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Empower Attack/.test(legal.label)
    );
    expect(empowerP1).toBeTruthy();
    state = apply(state, empowerP1!.action);
    expect(state.players.p1.hand).toContain("stat.attack.empowered");

    // ...and the barrier hands the choice to seat 2 next (seat order). It is STILL
    // up, so now it is SEAT 1 that is frozen out — even of a quiet move.
    expect(state.adventure?.pendingVisit?.playerId).toBe("p2");
    expect(state.adventure?.eventResolution?.round).toBe(2);
    const seat1Quiet = emptyFieldNextTo(state, "hero_p1");
    expect(expectRejected(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: seat1Quiet })).toContain(
      "Event is still being resolved"
    );

    const empowerP2 = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Empower Attack/.test(legal.label)
    );
    expect(empowerP2).toBeTruthy();
    state = apply(state, empowerP2!.action);
    expect(state.players.p2.hand).toContain("stat.attack.empowered");

    // Both empowers resolved: the barrier LIFTS (sentinel cleared it), the
    // singleton interaction is free, and the table is still in parallel mode.
    expect(state.adventure?.pendingVisit).toBeNull();
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    expect(state.turn.mode).toBe("parallel");

    // CONTROL: with the whole table done resolving, the quiet move the barrier
    // rejected moments ago now succeeds again (after the freed start-of-turn draw).
    state = takeStartOfTurnDraw(state, "p2");
    const nowQuiet = emptyFieldNextTo(state, "hero_p2");
    state = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: nowQuiet });
    expect(state.heroes.hero_p2.spaceId).toBe(nowQuiet);
  });
});

// ===========================================================================
// C. Ongoing passive effect is read for every seat, not just the active one
// ===========================================================================

describe("Astrologers × parallel — ongoing passive effects are read for every seat", () => {
  it("Profuse Growth raises the hand limit by 1 for BOTH parallel seats", () => {
    const grown = wrapIntoRound2(makeParallelGame("par-astro-growth", "astrologers.profuse_growth"));
    const control = wrapIntoRound2(makeParallelGame("par-astro-growth", "astrologers.dead_silence"));

    expect(grown.adventure?.astrologers?.activeCardId).toBe("astrologers.profuse_growth");
    expect(effectiveHandLimit(grown, "p1")).toBe(effectiveHandLimit(control, "p1") + 1);
    expect(effectiveHandLimit(grown, "p2")).toBe(effectiveHandLimit(control, "p2") + 1);
  });
});

// ===========================================================================
// D. Sanctuary makes PvP illegal AND keeps parallel turns running
// ===========================================================================

describe("Astrologers × parallel — Sanctuary bans PvP and so keeps parallel mode alive", () => {
  /**
   * Round-2 parallel game with `card` face up, p2's hero parked on an empty
   * field adjacent to p1's, and p1's start-of-turn draw already taken — so the
   * only thing that can stop p1's attack is the proclamation itself.
   */
  function readyToAttack(seed: string, card: string): { state: GameState; enemyField: string } {
    const wrapped = wrapIntoRound2(makeParallelGame(seed, card));
    const enemyField = emptyFieldNextTo(wrapped, "hero_p1");
    wrapped.heroes.hero_p2.spaceId = enemyField; // direct-mutate the base before applyAction
    const state = takeStartOfTurnDraw(wrapped, "p1");
    return { state, enemyField };
  }

  it("under Sanctuary, moving onto an enemy Hero is rejected and the round stays parallel", () => {
    const { state, enemyField } = readyToAttack("par-astro-sanctuary", "astrologers.sanctuary");
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.sanctuary");

    const message = expectRejected(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: enemyField });
    // Rejected by Sanctuary itself — NOT by the draw gate or a "wait until".
    expect(message).toContain("Sanctuary");
    // No battle, no collapse — parallel play continues for the whole table.
    expect(state.combat).toBeNull();
    expect(state.turn.mode).toBe("parallel");
    expect(state.heroes.hero_p1.spaceId).not.toBe(enemyField); // move rolled back
  });

  it("CONTROL: without Sanctuary, the identical attack starts combat and collapses parallel turns", () => {
    const { state, enemyField } = readyToAttack("par-astro-sanctuary", "astrologers.dead_silence");

    const attacked = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: enemyField });
    expect(attacked.combat?.context.kind).toBe("player");
    expect(attacked.turn.mode).toBe("ordered");
    expect(attacked.turn.parallelStopped?.reason).toBe("pvp-battle");
  });
});
