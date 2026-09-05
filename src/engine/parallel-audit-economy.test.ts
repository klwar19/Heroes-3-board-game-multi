import { describe, expect, it } from "vitest";
import { parallelStateForPlayer } from "./parallel-combats";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { HIDDEN_CARD_ID } from "./state";

type DeckSearchReveal = { deckSearch?: { revealedCardIds?: string[] } } | null | undefined;
import { coreBuildingDefinitions, coreFactionDefinitions } from "../data/factions/core";
import { cardLibrary } from "../data/cards/library";

/**
 * PARALLEL-TURNS AUDIT — resources, town actions, recruiting, markets and the
 * card pools (shared decks / discards / own decks).
 *
 * Every spec builds a REAL parallel table (multiplayer lobby, `parallelTurns > 0`,
 * so `state.turn.mode === "parallel"` and every live seat has an open turn) and
 * asserts an observable outcome, each with an ordered-mode or wrong-seat CONTROL.
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

const WOG_ON = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };

const TWO_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" }
];

function makeGame(seed: string, options: { parallelTurns?: number; wog?: boolean } = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.wog ? { wog: WOG_ON } : {}),
    players: TWO_PLAYERS
  } as never);
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Inert Astrologers proclamations so even rounds wrap without a table choice.
  for (let i = 0; i < 16; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

/** Wraps the round once (every seat ends), then clears the fresh hand steps. */
function wrapRound(state: GameState, order: PlayerId[] = ["p1", "p2"]): GameState {
  let next = state;
  for (const playerId of order) {
    if (!next.turn.completedPlayerIds.includes(playerId)) {
      next = apply(next, { type: "END_TURN", playerId });
    }
  }
  for (const player of Object.values(next.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return next;
}

const usedStagingFields = new WeakMap<GameState, Set<string>>();
function emptyFieldNextTo(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) {
    throw new Error(heroId + " is not on the map");
  }
  const used = usedStagingFields.get(state) ?? new Set<string>();
  usedStagingFields.set(state, used);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !used.has(candidate.spaceId));
  if (!field) {
    throw new Error("no adjacent field for " + heroId);
  }
  used.add(field.spaceId);
  paintField(state, field.spaceId, "empty_field");
  return field.spaceId;
}

function paintField(state: GameState, spaceId: string, location: string): void {
  const field = state.adventure!.fields[spaceId];
  field.location = location;
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
}

function moveHero(state: GameState, playerId: PlayerId, to: string): GameState {
  return apply(state, { type: "MOVE_HERO", playerId, heroId: "hero_" + playerId, to });
}

/** p1 walks onto an unowned settlement, so p1 owns the table's one interaction. */
function withOpenVisit(state: GameState): GameState {
  const settlement = emptyFieldNextTo(state, "hero_p1");
  paintField(state, settlement, "settlement");
  const next = moveHero(state, "p1", settlement);
  expect(next.adventure?.pendingVisit?.playerId ?? next.pendingChoice?.playerId).toBe("p1");
  return next;
}

function townOf(state: GameState, playerId: PlayerId) {
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId);
  if (!town) {
    throw new Error("no town for " + playerId);
  }
  return town;
}

/** Stands up every implemented faction building so the town surface is wide. */
function buildEverything(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId]!;
  const town = townOf(state, playerId);
  const faction = (coreFactionDefinitions as Record<string, { buildings: string[] }>)[player.factionId ?? ""];
  for (const buildingId of faction?.buildings ?? []) {
    const building = (coreBuildingDefinitions as Record<string, { implementationStatus?: string }>)[buildingId];
    if (building?.implementationStatus === "implemented" && !town.buildings.includes(buildingId)) {
      town.buildings.push(buildingId);
    }
  }
}

function rich(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.resources.gold = 80;
    player.resources.buildingMaterials = 40;
    player.resources.valuables = 40;
  }
}

/** Every Spell-kind card anywhere it can legitimately sit — a conservation census. */
function spellCardCensus(state: GameState): number {
  const isSpell = (cardId: string) => cardLibrary[cardId]?.kind === "spell";
  let total = 0;
  for (const deckId of Object.keys(state.decks)) {
    if (!deckId.startsWith("spells")) continue;
    total += state.decks[deckId].drawPile.filter(isSpell).length;
    total += state.decks[deckId].discardPile.filter(isSpell).length;
  }
  for (const player of Object.values(state.players)) {
    total += player.hand.filter(isSpell).length;
    total += player.deck.filter(isSpell).length;
    total += player.discard.filter(isSpell).length;
    total += (player.spellBook ?? []).filter(isSpell).length;
    total += (player.spellBookUsed ?? []).filter(isSpell).length;
    total += player.removed.filter(isSpell).length;
  }
  const revealed = (state.pendingChoice as DeckSearchReveal)?.deckSearch?.revealedCardIds ?? [];
  total += revealed.filter(isSpell).length;
  return total;
}

// =========================================================================
// 1. BUG — the Commander Forge still reads state.activePlayerId
// =========================================================================

describe("parallel audit — the Commander Forge accepts an open parallel actor", () => {
  function forgeReady(seed: string, parallelTurns: number): GameState {
    let state = makeGame(seed, { parallelTurns, wog: true });
    state = wrapRound(state); // -> round 2, where Grade I forging unlocks
    expect(state.round).toBe(2);
    rich(state);
    return state;
  }

  it("offers and completes FORGE_COMMANDER_ARTIFACT for the non-active seat", () => {
    const state = forgeReady("audit-forge-parallel", 6);
    expect(state.turn.mode).toBe("parallel");
    // p2 has a fully open parallel turn, but is not the nominal activePlayerId.
    expect(state.activePlayerId).toBe("p1");
    expect(state.turn.completedPlayerIds).not.toContain("p2");
    expect(state.players.p2.commander).toBeTruthy();

    const offers = getLegalActions(state, "p2").filter(
      (legal) => legal.action.type === "FORGE_COMMANDER_ARTIFACT"
    );
    expect(offers.length).toBeGreaterThan(0);

    // The purchase belongs to the actor even when another seat is nominally active.
    const forgedCardId = (offers[0].action as { cardId: string }).cardId;
    const forged = apply(state, offers[0].action);
    expect(forged.players.p2.hand).toContain(forgedCardId);
    expect(forged.players.p2.resources.gold).toBe(75);
  });

  it("CONTROL: the ACTIVE seat forges fine, and an off-turn ordered seat is never offered it", () => {
    const parallel = forgeReady("audit-forge-control", 6);
    const p1Offers = getLegalActions(parallel, "p1").filter(
      (legal) => legal.action.type === "FORGE_COMMANDER_ARTIFACT"
    );
    expect(p1Offers.length).toBeGreaterThan(0);
    const forgedCardId = (p1Offers[0].action as { cardId: string }).cardId;
    const forged = apply(parallel, p1Offers[0].action);
    expect(forged.players.p1.hand).toContain(forgedCardId);
    expect(forged.players.p1.resources.gold).toBe(75);

    // Ordered mode: p2 has no open turn at all, so nothing is offered and
    // nothing is refused — the divergence exists only under parallel turns.
    let ordered = makeGame("audit-forge-ordered", { wog: true });
    ordered = apply(ordered, { type: "END_TURN", playerId: "p1" });
    ordered = apply(ordered, { type: "END_TURN", playerId: "p2" });
    for (const player of Object.values(ordered.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    rich(ordered);
    expect(ordered.round).toBe(2);
    expect(ordered.activePlayerId).toBe("p1");
    expect(
      getLegalActions(ordered, "p2").some((legal) => legal.action.type === "FORGE_COMMANDER_ARTIFACT")
    ).toBe(false);
  });
});

// =========================================================================
// 2. GUARD — no OTHER offer made to a non-active parallel actor is refused
// =========================================================================

describe("parallel audit — offer/reducer agreement for a non-active parallel actor", () => {
  /**
   * Every legal action the engine offers must be accepted by the reducer.
   * FORGE_COMMANDER_ARTIFACT is excluded here because it is the one confirmed
   * divergence, pinned by its own spec above; USE_TOWN_BUILDING is excluded
   * because Cover of Darkness' offer is a template (`cardIds: []`) the client
   * fills in — refused in ordered play too (CONTROL below).
   */
  function rejections(state: GameState, playerId: PlayerId): string[] {
    const out: string[] = [];
    for (const offer of getLegalActions(state, playerId)) {
      if (offer.action.type === "FORGE_COMMANDER_ARTIFACT") continue;
      if (offer.action.type === "USE_TOWN_BUILDING") continue;
      const result = applyAction(state, offer.action);
      if (result.errors.length > 0) {
        out.push(offer.action.type + ": " + (result.errors[0]?.message ?? ""));
      }
    }
    return out;
  }

  it("accepts every town/economy offer, with the table free AND while another seat holds the interaction", () => {
    let state = makeGame("audit-sweep", { parallelTurns: 6, wog: true });
    state = wrapRound(state);
    buildEverything(state, "p1");
    buildEverything(state, "p2");
    rich(state);
    expect(state.turn.mode).toBe("parallel");
    expect(state.activePlayerId).toBe("p1");

    expect(rejections(state, "p2")).toEqual([]);
    expect(rejections(withOpenVisit(state), "p2")).toEqual([]);
  });

  it("CONTROL: the Cover of Darkness template offer is refused in ORDERED play too", () => {
    // Cover of Darkness is a NECROPOLIS building, so hand the ordered turn to p2.
    let ordered = makeGame("audit-sweep-control");
    ordered = apply(ordered, { type: "END_TURN", playerId: "p1" });
    for (const player of Object.values(ordered.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    expect(ordered.activePlayerId).toBe("p2");
    buildEverything(ordered, "p2");
    rich(ordered);
    const cover = getLegalActions(ordered, "p2").find(
      (legal) => legal.action.type === "USE_TOWN_BUILDING"
    );
    expect(cover).toBeTruthy();
    if (cover) {
      expect(expectRejected(ordered, cover.action)).toContain("Discard 1 or 2 cards");
    }
  });
});

// =========================================================================
// 3. Shared-deck searches from two parallel actors: FIFO, attribution, no loss
// =========================================================================

describe("parallel audit — two seats buying spells at once", () => {
  it("opens both Mage Guild searches independently, attributes each to its buyer and conserves every Spell card", () => {
    let state = makeGame("audit-fifo", { parallelTurns: 6 });
    state = wrapRound(state);
    rich(state);
    const before = spellCardCensus(state);
    const p1HandBefore = [...state.players.p1.hand];
    const p2HandBefore = [...state.players.p2.hand];

    // p2 (NOT the active player) buys first: its Search opens immediately.
    state = apply(state, { type: "SPELL_BOOK_ACTION", playerId: "p2" });
    expect(state.pendingChoice?.playerId).toBe("p2");

    const p2Choice = structuredClone(state.pendingChoice);
    state = apply(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
    expect(state.pendingChoice?.playerId).toBe("p1");
    expect(parallelStateForPlayer(state, "p2").pendingChoice).toEqual(p2Choice);
    const p1Choice = structuredClone(state.pendingChoice);

    // p2 resolves; p1's queued search is next in line (FIFO), owned by p1.
    let guard = 0;
    while (parallelStateForPlayer(state, "p2").pendingChoice?.playerId === "p2" && guard < 20) {
      state = apply(state, getLegalActions(state, "p2")[0].action);
      guard += 1;
    }
    expect(parallelStateForPlayer(state, "p1").pendingChoice).toEqual(p1Choice);
    guard = 0;
    while (parallelStateForPlayer(state, "p1").pendingChoice?.playerId === "p1" && guard < 20) {
      state = apply(state, getLegalActions(state, "p1")[0].action);
      guard += 1;
    }

    // Each buyer got its own card (never the other seat's), and no Spell card
    // was lost or duplicated across the shared deck, its discard and the hands.
    const p1Gained = state.players.p1.hand.filter((cardId) => !p1HandBefore.includes(cardId));
    const p2Gained = state.players.p2.hand.filter((cardId) => !p2HandBefore.includes(cardId));
    expect(p1Gained.length + p2Gained.length).toBeGreaterThan(0);
    for (const cardId of p1Gained) {
      expect(p2Gained).not.toContain(cardId);
    }
    expect(spellCardCensus(state)).toBe(before);
  });
});

// =========================================================================
// 4. Resource-round income and the per-round town tokens
// =========================================================================

describe("parallel audit — round-start economy", () => {
  it("pays every seat its income at a parallel round wrap and refreshes both seats' town tokens", () => {
    let state = makeGame("audit-income", { parallelTurns: 6 });
    state = wrapRound(state); // -> round 2 (Astrologers)
    // Spend both seats' round tokens, so a refresh is observable.
    state.players.p1.townTokens = { build: false, population: false, spellBook: false };
    state.players.p2.townTokens = { build: false, population: false, spellBook: false };
    state.players.p1.blacksmithUsedRound = state.round;
    state.players.p2.magicUniversityUsedRound = state.round;
    const goldBefore = { p1: state.players.p1.resources.gold, p2: state.players.p2.resources.gold };

    state = wrapRound(state, ["p2", "p1"]); // -> round 3 (Resources)
    expect(state.round).toBe(3);
    expect(state.turn.mode).toBe("parallel");

    expect(state.players.p1.resources.gold - goldBefore.p1).toBeGreaterThan(0);
    expect(state.players.p2.resources.gold - goldBefore.p2).toBeGreaterThan(0);
    // Both seats refreshed, and neither latch leaked across the wrap.
    expect(state.players.p1.townTokens).toEqual({ build: true, population: true, spellBook: true });
    expect(state.players.p2.townTokens).toEqual({ build: true, population: true, spellBook: true });
    expect(state.players.p1.blacksmithUsedRound).not.toBe(state.round);
    expect(state.players.p2.magicUniversityUsedRound).not.toBe(state.round);
  });

  it("keeps the once-per-round town latches PER PLAYER: one seat spending its token never spends another's", () => {
    let state = makeGame("audit-latches", { parallelTurns: 6 });
    state = wrapRound(state);
    rich(state);

    state = apply(state, { type: "SPELL_BOOK_ACTION", playerId: "p2" });
    expect(state.players.p2.townTokens.spellBook).toBe(false);
    expect(state.players.p1.townTokens.spellBook).toBe(true);
    // p2's spent token does not stop p1 buying (its search just queues).
    state = apply(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
    expect(state.players.p1.townTokens.spellBook).toBe(false);
    // And a second attempt by the same seat is refused.
    expect(expectRejected(state, { type: "SPELL_BOOK_ACTION", playerId: "p2" })).toContain(
      "already used this round"
    );
  });
});

// =========================================================================
// 5. Markets are a singleton visit — the blocked seat gets the wait message
// =========================================================================

describe("parallel audit — the market panel under parallel turns", () => {
  it("opens the actor's market without dismissing another player's visit", () => {
    let state = makeGame("audit-market", { parallelTurns: 6 });
    state = wrapRound(state);
    const market = emptyFieldNextTo(state, "hero_p2");
    paintField(state, market, "trading_post");
    state = withOpenVisit(state);

    // p2 stands ON the market (placed, not walked, so no visit of its own opened).
    state.heroes.hero_p2.spaceId = market;
    expect(getLegalActions(state, "p2").some((legal) => legal.action.type === "OPEN_MARKET")).toBe(true);
    const opened = apply(state, { type: "OPEN_MARKET", playerId: "p2", heroId: "hero_p2" });
    expect(opened.adventure?.pendingVisit?.playerId).toBe("p2");
    expect(parallelStateForPlayer(opened, "p1").adventure?.pendingVisit).toEqual(state.adventure?.pendingVisit);
  });
});

// =========================================================================
// 6. Bank expiry is the OWNER's hero step, never another seat's
// =========================================================================

describe("parallel audit — map banks expire on their owner's step only", () => {
  it("survives another seat's hero step and dies on the owner's", () => {
    let state = makeGame("audit-banks", { parallelTurns: 6 });
    state = wrapRound(state);
    state.players.p1.mapSpellPowerBank = 2;
    state.players.p2.mapSpellPowerBank = 3;

    // p2 walks: only p2's bank goes.
    const p2Target = emptyFieldNextTo(state, "hero_p2");
    state = moveHero(state, "p2", p2Target);
    expect(state.players.p2.mapSpellPowerBank).toBe(0);
    expect(state.players.p1.mapSpellPowerBank).toBe(2);

    // CONTROL: the owner's own step does clear it.
    const p1Target = emptyFieldNextTo(state, "hero_p1");
    state = moveHero(state, "p1", p1Target);
    expect(state.players.p1.mapSpellPowerBank).toBe(0);
  });
});

// =========================================================================
// 7. Player-view masking with two seats holding private state at once
// =========================================================================

describe("parallel audit — private windows stay private while two seats act", () => {
  it("masks the other seat's hand and open Search reveal while keeping the viewer's own visible", () => {
    let state = makeGame("audit-view", { parallelTurns: 6 });
    state = wrapRound(state);
    rich(state);
    state = apply(state, { type: "SPELL_BOOK_ACTION", playerId: "p2" });
    expect(state.pendingChoice?.playerId).toBe("p2");

    const p1View = getPlayerView(state, "p1");
    const p2View = getPlayerView(state, "p2");
    // Each seat sees its OWN hand.
    expect(p2View.players.p2.hand).toEqual(state.players.p2.hand);
    expect(p1View.players.p1.hand).toEqual(state.players.p1.hand);
    // Neither sees the other seat's hand identities.
    expect(p1View.players.p2.hand.every((cardId) => cardId === HIDDEN_CARD_ID)).toBe(true);
    expect(p2View.players.p1.hand.every((cardId) => cardId === HIDDEN_CARD_ID)).toBe(true);
    // p2's open Search reveal is not readable from p1's frame.
    const p2Revealed = (state.pendingChoice as DeckSearchReveal)?.deckSearch?.revealedCardIds ?? [];
    if (p2Revealed.length > 0) {
      const p1Revealed = (p1View.pendingChoice as DeckSearchReveal)?.deckSearch?.revealedCardIds ?? [];
      expect(p1Revealed.every((cardId) => cardId === HIDDEN_CARD_ID)).toBe(true);
    }
  });
});

// =========================================================================
// 8. The applyAction victory tail runs on a bystander's quiet move
// =========================================================================

describe("parallel audit — the custom-win check on a bystander action", () => {
  function withGoldCondition(seed: string, p2Gold: number): GameState {
    let state = makeGame(seed, { parallelTurns: 6 });
    state = wrapRound(state);
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      customWinConditions: [{ kind: "gold", amount: 500 }]
    } as never;
    state.players.p2.resources.gold = p2Gold;
    return withOpenVisit(state);
  }

  it("runs the win check from a bystander's quiet move without crashing or awarding the wrong seat", () => {
    // Nobody qualifies: the tail evaluates every seat and ends nothing.
    let idle = withGoldCondition("audit-win-idle", 10);
    idle = moveHero(idle, "p2", emptyFieldNextTo(idle, "hero_p2"));
    expect(idle.adventure?.winnerPlayerId ?? null).toBeNull();

    // The BYSTANDER (not the interaction owner) satisfies it: the win goes to
    // p2, never to the seat whose interaction happens to be open.
    let won = withGoldCondition("audit-win-hit", 600);
    won = moveHero(won, "p2", emptyFieldNextTo(won, "hero_p2"));
    expect(won.adventure?.winnerPlayerId).toBe("p2");
  });
});
