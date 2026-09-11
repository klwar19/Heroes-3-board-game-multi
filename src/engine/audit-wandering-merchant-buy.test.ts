/**
 * AUDIT (read-only): the atomic BUY_WANDERING_MERCHANT purchase path.
 *
 * These tests are an effect-level audit of the uncommitted v128 change. They
 * assert OBSERVABLE engine outcomes (gold actually spent, card actually in
 * hand, other seats' state actually untouched), never labels.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
} from "./index";
import type { GameAction, GameState, PlayerId } from "./state";
import { ASTROLOGERS_DECK_ID, drawAstrologersCard } from "./adventure";
import { getPlayerView } from "./player-view";
import { observeForComputer } from "./computer/observation";
import { scoreMapAction } from "./computer/map-policy";

const THREE = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" },
];

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function rejects(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected a rejection").toBeGreaterThan(0);
  // A rejected action must leave the stored state untouched.
  expect(result.state).toBe(state);
  return result.errors[0].message;
}

/** Even (Astrologers) round with the Wandering Merchant face up. */
function merchantRound(options: { parallelTurns?: number } = {}): GameState {
  const state = createAdventureGameState({
    seed: "audit-merchant",
    difficulty: "normal",
    ruleset: "binh",
    rollFirstPlayer: false,
    events: false,
    players: THREE,
    ...(options.parallelTurns ? { parallelTurns: options.parallelTurns } : {}),
  });
  state.round = 2;
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.adventure!.pendingTileChoice = null;
  state.pendingChoice = null;
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources.gold = 20;
  }
  const deck = state.decks[ASTROLOGERS_DECK_ID]!;
  deck.drawPile = ["astrologers.wandering_merchant"];
  deck.discardPile = [];
  drawAstrologersCard(state);
  expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.wandering_merchant");
  return state;
}

function buyOffers(state: GameState, playerId: PlayerId) {
  return getLegalActions(state, playerId).filter(
    (entry) => entry.action.type === "BUY_WANDERING_MERCHANT",
  );
}

const TENT = "war_machine.first_aid_tent";
const CANNON = "war_machine.cannon";

function guardFieldNextTo(state: GameState, heroId: string, used: Set<string>): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "")!;
  const field = hexNeighbors(coord)
    .map((n) => state.adventure!.fields[hexSpaceId(n)])
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

// ---------------------------------------------------------------------------
// 1. Core purchase
// ---------------------------------------------------------------------------

describe("BUY_WANDERING_MERCHANT — core purchase", () => {
  it("offers exactly the affordable machines and charges Trading Post minus 3", () => {
    const state = merchantRound();
    state.players.p1.resources.gold = 3; // Tent (6-3=3) only.
    const offers = buyOffers(state, "p1");
    expect(offers.map((o) => (o.action as { cardId: string }).cardId)).toEqual([TENT]);

    const next = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT });
    expect(next.players.p1.resources.gold).toBe(0);
    expect(next.players.p1.hand).toContain(TENT);
    // Supply is NOT consumed (rulebook: the catalog never depletes).
    expect(next.adventure?.warMachineSupply).toContain(TENT);
    expect(next.adventure?.astrologers?.wanderingMerchantBoughtBy).toEqual(["p1"]);
  });

  it("emits WAR_MACHINE_BOUGHT in the action's returned events", () => {
    const state = merchantRound();
    const result = applyAction(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT });
    expect(result.errors).toEqual([]);
    const bought = result.events.filter((e) => e.type === "WAR_MACHINE_BOUGHT");
    expect(bought).toHaveLength(1);
    expect(bought[0]).toMatchObject({ playerId: "p1", cardId: TENT, at: "trading-post" });
  });

  it("is once per player per round, and every other seat keeps its own offer", () => {
    let state = merchantRound();
    state = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT });
    expect(buyOffers(state, "p1")).toEqual([]);
    expect(rejects(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: CANNON })).toMatch(
      /no longer available/i,
    );
    // p2 may still buy the very same machine.
    expect(buyOffers(state, "p2").map((o) => (o.action as { cardId: string }).cardId)).toContain(TENT);
    state = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p2", cardId: TENT });
    expect(state.players.p2.hand).toContain(TENT);
  });

  it("refuses a machine the player already owns, and an unaffordable one", () => {
    const state = merchantRound();
    state.players.p1.hand = [...state.players.p1.hand, TENT];
    expect(buyOffers(state, "p1").map((o) => (o.action as { cardId: string }).cardId)).not.toContain(TENT);
    expect(rejects(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT })).toMatch(
      /no longer available/i,
    );
    state.players.p2.resources.gold = 2;
    expect(rejects(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p2", cardId: TENT })).toMatch(
      /no longer available|Not enough/i,
    );
  });

  it("expires on the odd (Resource) round even though the card stays face up", () => {
    const state = merchantRound();
    state.round = 3;
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.wandering_merchant");
    expect(buyOffers(state, "p1")).toEqual([]);
    expect(rejects(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT })).toMatch(
      /no longer available/i,
    );
  });

  it("CONTROL: no offer at all when a different proclamation is face up", () => {
    const state = createAdventureGameState({
      seed: "audit-merchant-control",
      rollFirstPlayer: false,
      events: false,
      players: THREE,
    });
    state.round = 2;
    for (const p of Object.values(state.players)) { p.canMulligan = false; p.needsHandRefresh = false; }
    state.decks[ASTROLOGERS_DECK_ID]!.drawPile = ["astrologers.dead_silence"];
    drawAstrologersCard(state);
    expect(buyOffers(state, "p1")).toEqual([]);
    expect(rejects(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT })).toBeTruthy();
  });

  it("refuses an eliminated seat, a spectator and a finished game", () => {
    const state = merchantRound();
    state.players.p2.eliminated = true;
    expect(buyOffers(state, "p2")).toEqual([]);
    expect(rejects(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p2", cardId: TENT })).toBeTruthy();
    expect(rejects(state, { type: "BUY_WANDERING_MERCHANT", playerId: "observer" as PlayerId, cardId: TENT })).toBeTruthy();
    const over = merchantRound();
    over.phase = "game-over";
    over.adventure!.winnerPlayerId = "p3";
    expect(rejects(over, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Ordered mode — off-turn purchase must not disturb the table
// ---------------------------------------------------------------------------

describe("BUY_WANDERING_MERCHANT — ordered mode, off turn", () => {
  it("an off-turn seat may buy without touching the active player's turn", () => {
    const state = merchantRound();
    expect(state.turn.mode).toBe("ordered");
    expect(state.activePlayerId).toBe("p1");
    const before = getLegalActions(state, "p1").map((entry) => entry.label).sort();

    const next = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p3", cardId: TENT });

    expect(next.players.p3.hand).toContain(TENT);
    expect(next.activePlayerId).toBe("p1");
    expect(next.turn.mode).toBe("ordered");
    expect(next.turn.parallelStopped).toBeUndefined();
    expect(next.pendingChoice).toBeNull();
    expect(next.adventure?.pendingVisit).toBeNull();
    expect(next.combat).toBeFalsy();
    expect(next.players.p1.resources).toEqual(state.players.p1.resources);
    expect(next.players.p1.hand).toEqual(state.players.p1.hand);
    // p1's own action menu is unchanged apart from nothing at all.
    const after = getLegalActions(next, "p1")
      .map((entry) => entry.label)
      .sort();
    expect(after).toEqual(before);
  });

  it("does not open or clear the round-start event barrier bookkeeping", () => {
    const state = merchantRound();
    const next = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p2", cardId: TENT });
    expect(next.adventure?.eventResolution).toEqual(state.adventure?.eventResolution);
    expect(next.adventure?.rewardQueue).toEqual(state.adventure?.rewardQueue);
  });
});

// ---------------------------------------------------------------------------
// 3. Parallel mode
// ---------------------------------------------------------------------------

describe("BUY_WANDERING_MERCHANT — parallel turns", () => {
  /** p1 and p2 each open their own neutral battle; p3 is idle. */
  function twoBattles(): GameState {
    let state = merchantRound({ parallelTurns: 4 });
    const used = new Set<string>();
    state = apply(state, {
      type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1",
      to: guardFieldNextTo(state, "hero_p1", used),
    });
    state = apply(state, {
      type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2",
      to: guardFieldNextTo(state, "hero_p2", used),
    });
    expect(Object.keys(state.parallelCombats ?? {})).toContain("p1");
    expect(state.combat, "p2's battle is live").toBeTruthy();
    return state;
  }

  it("blocks the buyer while their OWN battle is open, and allows it again after", () => {
    const state = twoBattles();
    expect(buyOffers(state, "p1"), "p1 is parked in their own fight").toEqual([]);
    expect(buyOffers(state, "p2"), "p2's fight is the live one").toEqual([]);
    expect(rejects(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT })).toMatch(
      /no longer available/i,
    );
    // The idle third seat is not blocked by anybody else's battle.
    expect(buyOffers(state, "p3").length).toBeGreaterThan(0);
  });

  it("an idle seat buys mid-battle; both battles survive intact (as parked contexts)", () => {
    const state = twoBattles();
    const p1Before = JSON.stringify(state.parallelCombats!.p1.combat);
    const p2Before = JSON.stringify(state.combat);

    const next = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p3", cardId: TENT });

    expect(next.players.p3.hand).toContain(TENT);
    // Neither battle lost a single byte; p2's merely moved from the live slot
    // into its parked slot, exactly as any other bystander action does.
    expect(JSON.stringify(next.parallelCombats!.p1.combat)).toBe(p1Before);
    expect(JSON.stringify(next.parallelCombats!.p2?.combat ?? next.combat)).toBe(p2Before);
    expect(next.turn.mode).toBe("parallel");
    expect(next.turn.parallelStopped).toBeUndefined();
    // Each fighter still gets their own battle back on their next look.
    expect(getPlayerView(next, "p1").combat?.id).toBe(state.parallelCombats!.p1.combat!.id);
    expect(getPlayerView(next, "p2").combat?.id).toBe(state.combat!.id);

    // CONTROL: a plain bystander action parks the live battle the same way, so
    // the re-parking above is not something the purchase introduced.
    const control = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p1" });
    expect(Object.keys(control.parallelCombats ?? {}).sort()).toEqual(["p1", "p2"]);
  });

  it("a WATCHING seat can buy, with or without a parallelContextId, and keeps watching", () => {
    let state = twoBattles();
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p1" });
    expect(state.parallelContextSelections?.p3).toBe("p1");
    const watched = getPlayerView(state, "p3").combat?.id;
    expect(watched, "p3 is watching p1's battle").toBeTruthy();

    // Without a context id.
    const plain = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p3", cardId: TENT });
    expect(plain.players.p3.hand).toContain(TENT);
    expect(plain.parallelContextSelections?.p3).toBe("p1");
    expect(getPlayerView(plain, "p3").combat?.id).toBe(watched);

    // With the watched battle's context id attached.
    const tagged = apply(state, {
      type: "BUY_WANDERING_MERCHANT", playerId: "p3", cardId: TENT,
      parallelContextId: watched,
    } as GameAction);
    expect(tagged.players.p3.hand).toContain(TENT);
    expect(tagged.parallelContextSelections?.p3).toBe("p1");

    // And with a stale/foreign context id — the bypass accepts it.
    const stale = applyAction(state, {
      type: "BUY_WANDERING_MERCHANT", playerId: "p3", cardId: TENT,
      parallelContextId: "map:nobody",
    } as GameAction);
    expect(stale.errors).toEqual([]);
  });

  it("buying while another seat holds an open pendingChoice does not error or steal it", () => {
    const state = twoBattles();
    // Park a pending choice on p2 (the live battle's owner) and re-run the buy.
    const withChoice = JSON.parse(JSON.stringify(state)) as GameState;
    withChoice.pendingChoice = {
      id: "choice_audit",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "audit stand-in",
      options: [{ label: "ok" }],
    } as unknown as GameState["pendingChoice"];
    const next = apply(withChoice, { type: "BUY_WANDERING_MERCHANT", playerId: "p3", cardId: TENT });
    expect(next.players.p3.hand).toContain(TENT);
    // p2's choice is preserved (parked with p2's context), never discarded.
    expect(next.pendingChoice?.playerId ?? next.parallelCombats?.p2?.pendingChoice?.playerId).toBe("p2");
    expect(getPlayerView(next, "p2").pendingChoice?.playerId).toBe("p2");
  });
});

// ---------------------------------------------------------------------------
// 4. Legacy visit path
// ---------------------------------------------------------------------------

describe("legacy OPEN_WANDERING_MERCHANT / saved pendingVisit", () => {
  it("still resolves a saved WAR_MACHINE_DISCOUNT_OFFER visit and cannot double-buy", () => {
    let state = merchantRound();
    state = apply(state, { type: "OPEN_WANDERING_MERCHANT", playerId: "p1" });
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    const buy = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && /First Aid Tent/.test(entry.label),
    );
    expect(buy, "the legacy visit still offers the Tent").toBeTruthy();
    state = apply(state, buy!.action);
    expect(state.players.p1.hand).toContain(TENT);
    expect(state.players.p1.resources.gold).toBe(17);
    expect(state.adventure?.astrologers?.wanderingMerchantBoughtBy).toEqual(["p1"]);
    // Re-opening the legacy shop after the purchase is refused.
    expect(rejects(state, { type: "OPEN_WANDERING_MERCHANT", playerId: "p1" })).toMatch(/no longer available/i);
  });

  it("a stale saved price is re-priced at the live discounted cost, not the saved one", () => {
    let state = apply(merchantRound(), { type: "OPEN_WANDERING_MERCHANT", playerId: "p1" });
    // Rewrite the parked offer to a free Tent, exactly as an old snapshot or a
    // tampered client would.
    const choice = state.adventure!.pendingVisit!.steps[0] as unknown as {
      type: string; options: { label: string; steps: { type: string; cardId?: string; cost?: { gold?: number } }[] }[];
    };
    expect(choice.type).toBe("CHOOSE_ONE");
    const tentOption = choice.options.find((option) => option.steps[0]?.cardId === TENT)!;
    tentOption.steps[0].cost = { gold: 0 };

    const index = choice.options.indexOf(tentOption);
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: index } as GameAction);
    expect(state.players.p1.hand).toContain(TENT);
    // Re-priced to the real discounted cost (20 - 3), not the saved 0.
    expect(state.players.p1.resources.gold).toBe(17);
  });

  it("the atomic buy clears an UNPROCESSED offer step AND an OPENED legacy shop (fixed 2026-09-11)", () => {
    // (a) a saved, not-yet-processed WAR_MACHINE_DISCOUNT_OFFER visit is cleared.
    const saved = merchantRound();
    saved.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: saved.heroes.hero_p1.spaceId ?? "",
      steps: [{ type: "WAR_MACHINE_DISCOUNT_OFFER", discountGold: 3 }],
    } as unknown as NonNullable<GameState["adventure"]>["pendingVisit"];
    const clearedState = apply(saved, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT });
    expect(clearedState.adventure?.pendingVisit).toBeNull();

    // (b) the shape `openWanderingMerchant` actually produces (a CHOOSE_ONE of
    //     PRICED GRANT_WAR_MACHINE options) is matched too, so the opened shop
    //     closes with the atomic buy instead of dangling with stale offers.
    let opened = apply(merchantRound(), { type: "OPEN_WANDERING_MERCHANT", playerId: "p1" });
    expect(opened.adventure?.pendingVisit?.steps[0].type).toBe("CHOOSE_ONE");
    opened = apply(opened, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT });
    expect(opened.players.p1.hand).toContain(TENT);
    expect(opened.adventure?.pendingVisit, "the opened shop is closed by the buy").toBeNull();
    expect(getLegalActions(opened, "p1").filter((e) => e.action.type === "RESOLVE_VISIT_STEP")).toEqual([]);
    // CONTROL: a FREE McGiver grant (no cost) is not a merchant shop and survives.
    const grant = merchantRound();
    grant.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: grant.heroes.hero_p1.spaceId ?? "",
      steps: [{ type: "CHOOSE_ONE", prompt: "McGiver", options: [{ label: "Ballista", steps: [{ type: "GRANT_WAR_MACHINE", cardId: "war_machine.ballista" }] }] }],
    } as unknown as NonNullable<GameState["adventure"]>["pendingVisit"];
    const kept = apply(grant, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT });
    expect(kept.adventure?.pendingVisit?.playerId).toBe("p1");
  });

  it("the legacy open stays gated on the active turn (an off-turn open would freeze the table)", () => {
    const state = merchantRound();
    expect(state.activePlayerId).toBe("p1");
    const result = applyAction(state, { type: "OPEN_WANDERING_MERCHANT", playerId: "p3" });
    // An OFF-TURN seat may NOT seize the single shared pendingVisit slot…
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.adventure?.pendingVisit ?? null).toBeNull();
    expect(result.state.activePlayerId).toBe("p1");
    expect(getLegalActions(result.state, "p1").some((e) => e.action.type === "END_TURN")).toBe(true);
    // …its any-turn purchase is the atomic action instead.
    expect(getLegalActions(state, "p3").some((e) => e.action.type === "BUY_WANDERING_MERCHANT")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Player view + reducer return-shape regression
// ---------------------------------------------------------------------------

describe("view + reducer plumbing", () => {
  it("leaks nothing: another seat's purchase is visible only as public bookkeeping", () => {
    let state = merchantRound();
    state = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT });
    const p2View = getPlayerView(state, "p2");
    expect(p2View.adventure?.astrologers?.wanderingMerchantBoughtBy).toEqual(["p1"]);
    expect(p2View.players.p1.hand, "another seat's hand is never exposed").toEqual([]);
    // The buyer's own view keeps the machine.
    expect(getPlayerView(state, "p1").players.p1.hand).toContain(TENT);
  });

  it("is offered to a COMPUTER seat and scored as a real buy", () => {
    const state = merchantRound();
    state.controllers = { ...(state.controllers ?? {}), p3: { kind: "computer", difficulty: "normal" } } as unknown as GameState["controllers"];
    const observation = observeForComputer(state, "p3");
    const offer = observation.legalActions.find((entry) => entry.action.type === "BUY_WANDERING_MERCHANT");
    expect(offer, "the AI sees the purchase").toBeTruthy();
    const score = scoreMapAction(observation, offer!.action);
    expect(score?.policy).toBe("map.buy-wandering-merchant");
    expect(score!.score).toBeGreaterThan(0);
    // ...and the AI's chosen action really resolves.
    const next = apply(state, offer!.action);
    expect(next.players.p3.hand).toContain((offer!.action as { cardId: string }).cardId);
  });

  it("OBSERVATION: the purchase is offered while the buyer's own choice is open and pushes past the hand limit", () => {
    const state = merchantRound();
    state.pendingChoice = {
      id: "choice_audit",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "audit stand-in",
      options: [{ label: "ok" }],
    } as unknown as GameState["pendingChoice"];
    state.players.p1.hand = new Array(state.players.p1.limits.hand).fill("card.town_portal");
    expect(buyOffers(state, "p1").length, "offered even mid-choice").toBeGreaterThan(0);

    const next = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p1", cardId: TENT });
    // The open choice survives untouched...
    expect(next.pendingChoice?.playerId).toBe("p1");
    // ...and the buyer ends over the hand limit. That is self-healing: the
    // discard-down is re-evaluated at their next turn start (adventure.ts:21193).
    expect(next.players.p1.hand.length).toBe(next.players.p1.limits.hand + 1);
  });

  it("crosses the round-start Event barrier without disturbing it", () => {
    const state = merchantRound();
    state.adventure!.eventResolution = { round: state.round } as NonNullable<GameState["adventure"]>["eventResolution"];
    state.pendingChoice = {
      id: "choice_audit",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "audit event stand-in",
      options: [{ label: "ok" }],
    } as unknown as GameState["pendingChoice"];
    // CONTROL: any other p3 action is refused by the barrier.
    expect(rejects(state, { type: "END_TURN", playerId: "p3" })).toBeTruthy();

    const next = apply(state, { type: "BUY_WANDERING_MERCHANT", playerId: "p3", cardId: TENT });
    expect(next.players.p3.hand).toContain(TENT);
    expect(next.adventure?.eventResolution).toEqual(state.adventure?.eventResolution);
    expect(next.pendingChoice?.playerId).toBe("p1");
  });

  it("REGRESSION: a normal action still returns exactly its own new events", () => {
    const state = merchantRound();
    const before = state.eventLog.length;
    const result = applyAction(state, { type: "END_TURN", playerId: "p1" });
    expect(result.errors).toEqual([]);
    const expected = result.state.eventLog.filter(
      (event) => Number(event.id.slice(4)) > Math.max(state.eventCounter ?? 0, before),
    );
    expect(result.events.map((e) => e.id)).toEqual(expected.map((e) => e.id));
    expect(result.events.length).toBeGreaterThan(0);
  });
});
