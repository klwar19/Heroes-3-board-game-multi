import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import {
  drawAstrologersCard,
  drawNeutralArmy,
  effectiveHandLimit,
  eliminatePlayer,
  EVENTS_DECK_ID,
  finalizeStartOfTurnHand,
  NEUTRAL_DECK_IDS,
  startAdventureRound
} from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { THREE_COPY_NEUTRAL_UNIT_IDS, TWO_COPY_NEUTRAL_UNIT_IDS } from "./adventure-setup";
import { astrologersDeckCardIds } from "@/data/cards/astrologers";
import { neutralUnitIdsByTier } from "@/data/factions/core";
import type { AdventureState, GameAction, GameState, PlayerId } from "./state";

/**
 * The second wave of expansion Astrologers proclamations, engine-enforced end
 * to end (CLAUDE.md #1 — each assertion fails if its wiring is removed, each
 * with a face-down / no-shield / events-off CONTROL that diverges):
 *
 *   - Restart (Stretch Goals): hand limit -2, to a minimum of 4; redrawn on
 *     the first Astrologers round.
 *   - Elementals (Conflux): each non-Azure Neutral deck is dug until an
 *     Elemental shows, which stays face up on top (the next guard drawn).
 *   - Plastic Tray (Stretch Goals): a defending unit's shield pays a FLAT +1
 *     Defense — no Defend die is rolled at all.
 *   - Forty Thieves (Fortress): the next Event draw pops 2 cards; the drawer
 *     picks which resolves, the other goes to the bottom of the Event deck.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function setActive(state: GameState, activeCardId: string): void {
  state.adventure!.astrologers = {
    activeCardId,
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: []
  };
}

// ===========================================================================
// Restart — hand limit -2, to a minimum of 4
// ===========================================================================

describe("Astrologers — Restart (hand limit -2, min 4)", () => {
  function gameWithHandLimit(limit: number, activeCardId = "astrologers.restart"): GameState {
    const state = createAdventureGameState({ seed: "restart", difficulty: "normal", rollFirstPlayer: false });
    setActive(state, activeCardId);
    state.players.p1.limits.hand = limit;
    return state;
  }

  it("reduces a levelled-up hand limit by 2 (6 → 4, 7 → 5)", () => {
    expect(effectiveHandLimit(gameWithHandLimit(6), "p1")).toBe(4);
    expect(effectiveHandLimit(gameWithHandLimit(7), "p1")).toBe(5);
  });

  it("floors at 4 and never RAISES a limit already at the floor (5 → 4, 4 → 4)", () => {
    expect(effectiveHandLimit(gameWithHandLimit(5), "p1")).toBe(4);
    expect(effectiveHandLimit(gameWithHandLimit(4), "p1")).toBe(4);
  });

  it("a permanent's hand bonus joins the base BEFORE the reduction (4 + Pandora 1 → 4, 6 + 1 → 5)", () => {
    const low = gameWithHandLimit(4);
    low.players.p1.permanents = ["pandora.hand_size"];
    expect(effectiveHandLimit(low, "p1")).toBe(4);
    const high = gameWithHandLimit(6);
    high.players.p1.permanents = ["pandora.hand_size"];
    expect(effectiveHandLimit(high, "p1")).toBe(5);
  });

  it("CONTROL: with a different proclamation up the levelled limit stands", () => {
    expect(effectiveHandLimit(gameWithHandLimit(6, "astrologers.dead_silence"), "p1")).toBe(6);
  });

  it("a hand over the shrunken limit forces the start-of-turn discard-down", () => {
    const state = gameWithHandLimit(6);
    state.players.p1.hand = ["stat.attack", "stat.attack", "stat.attack", "stat.attack", "stat.attack"];
    finalizeStartOfTurnHand(state, "p1");
    expect(state.players.p1.needsHandRefresh).toBe(true);

    const control = gameWithHandLimit(6, "astrologers.dead_silence");
    control.players.p1.hand = ["stat.attack", "stat.attack", "stat.attack", "stat.attack", "stat.attack"];
    finalizeStartOfTurnHand(control, "p1");
    expect(control.players.p1.needsHandRefresh).toBe(false);
  });

  it("drawn on the FIRST Astrologers round (round 2): discarded and another card drawn", () => {
    const state = createAdventureGameState({ seed: "restart-redraw", difficulty: "normal", rollFirstPlayer: false });
    state.round = 2;
    // drawPile pops from the END: Restart is on top, Dead Silence underneath.
    state.decks.astrologers!.drawPile = ["astrologers.dead_silence", "astrologers.restart"];
    state.decks.astrologers!.discardPile = [];
    drawAstrologersCard(state);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.dead_silence");
    expect(state.decks.astrologers!.discardPile).toContain("astrologers.restart");
  });

  it("CONTROL: on a LATER Astrologers round Restart stays in play", () => {
    const state = createAdventureGameState({ seed: "restart-stays", difficulty: "normal", rollFirstPlayer: false });
    state.round = 4;
    state.decks.astrologers!.drawPile = ["astrologers.dead_silence", "astrologers.restart"];
    state.decks.astrologers!.discardPile = [];
    drawAstrologersCard(state);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.restart");
  });
});

// ===========================================================================
// Elementals — dig each non-Azure Neutral deck until an Elemental tops it
// ===========================================================================

describe("Astrologers — Elementals (seed an Elemental on top of each Neutral deck)", () => {
  const bronzeFillers = neutralUnitIdsByTier.bronze.filter((id) => !id.includes("elemental"));
  const silverFillers = neutralUnitIdsByTier.silver.filter((id) => !id.includes("elemental"));
  const goldFillers = neutralUnitIdsByTier.gold.filter((id) => !id.includes("elemental"));

  function drawElementals(state: GameState): void {
    state.decks.astrologers!.drawPile = ["astrologers.elementals"];
    state.decks.astrologers!.discardPile = [];
    drawAstrologersCard(state);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.elementals");
  }

  function craftedGame(seed = "elementals"): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    // Bronze: the Elemental sits one card down — the top filler must be dug off.
    state.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile = [bronzeFillers[0], "neutral.storm_elementals", bronzeFillers[1]];
    state.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile = [];
    // Silver: two fillers above the Elemental.
    state.decks[NEUTRAL_DECK_IDS.silver]!.drawPile = ["neutral.energy_elementals", silverFillers[0], silverFillers[1]];
    state.decks[NEUTRAL_DECK_IDS.silver]!.discardPile = [];
    // Gold: NO Elemental in the draw pile — only in the discard pile, so the
    // dig must exhaust the pile, reshuffle the discards in and keep going.
    state.decks[NEUTRAL_DECK_IDS.gold]!.drawPile = [goldFillers[0], goldFillers[1]];
    state.decks[NEUTRAL_DECK_IDS.gold]!.discardPile = ["neutral.magic_elementals", goldFillers[2]];
    return state;
  }

  function topOf(state: GameState, tier: "bronze" | "silver" | "gold" | "azure"): string | undefined {
    const pile = state.decks[NEUTRAL_DECK_IDS[tier]]!.drawPile;
    return pile[pile.length - 1];
  }

  it("digs each non-Azure deck until an Elemental tops it (reshuffling an exhausted pile once)", () => {
    const state = craftedGame();
    const azureBefore = [...state.decks[NEUTRAL_DECK_IDS.azure]!.drawPile];

    drawElementals(state);

    expect(topOf(state, "bronze")).toBe("neutral.storm_elementals");
    // The filler that sat on top was dug off into the tier discard pile.
    expect(state.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile).toEqual([bronzeFillers[1]]);
    expect(topOf(state, "silver")).toBe("neutral.energy_elementals");
    // Gold found its Elemental only after the exhausted pile reshuffled its discards.
    expect(topOf(state, "gold")).toBe("neutral.magic_elementals");
    // "except Azure": the Azure deck is never touched.
    expect(state.decks[NEUTRAL_DECK_IDS.azure]!.drawPile).toEqual(azureBefore);
  });

  it("the seeded Elemental IS the next guard drawn (the observable game outcome)", () => {
    const state = craftedGame("elementals-guard");
    drawElementals(state);
    // Normal difficulty, field difficulty 2 → a 2-bronze guard army; the first
    // card drawn is the seeded deck top.
    const draws = drawNeutralArmy(state, 2);
    expect(draws[0]?.unitDefId).toBe("neutral.storm_elementals");
  });

  it("discards each face-up Elemental when the proclamation is replaced", () => {
    const state = craftedGame("elementals-replaced");
    drawElementals(state);
    const seeded = {
      bronze: topOf(state, "bronze")!,
      silver: topOf(state, "silver")!,
      gold: topOf(state, "gold")!
    };

    state.round = 4;
    state.decks.astrologers!.drawPile = ["astrologers.dead_silence"];
    // Replacement happens at the next Astrologers-round boundary: expire the
    // old card (and its face-up units), then draw the new proclamation.
    startAdventureRound(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.dead_silence");
    for (const tier of ["bronze", "silver", "gold"] as const) {
      expect(topOf(state, tier)).not.toBe(seeded[tier]);
      expect(state.decks[NEUTRAL_DECK_IDS[tier]]!.discardPile).toContain(seeded[tier]);
    }
  });

  it("builds shared Neutral decks with the physical one-copy/two-copy composition", () => {
    const state = createAdventureGameState({ seed: "neutral-two-copies", difficulty: "normal", rollFirstPlayer: false });
    for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
      const deck = state.decks[NEUTRAL_DECK_IDS[tier]]!;
      const allCards = [...deck.drawPile, ...deck.discardPile];
      for (const unitDefId of neutralUnitIdsByTier[tier]) {
        const expected = THREE_COPY_NEUTRAL_UNIT_IDS.has(unitDefId)
          ? 3
          : TWO_COPY_NEUTRAL_UNIT_IDS.has(unitDefId)
            ? 2
            : 1;
        expect(allCards.filter((cardId) => cardId === unitDefId), `${tier}: ${unitDefId}`).toHaveLength(expected);
      }
    }
    expect([...TWO_COPY_NEUTRAL_UNIT_IDS].sort()).toEqual(
      [
        "neutral.azure_dragons",
        "neutral.centaurs",
        "neutral.crystal_dragons",
        "neutral.cyclopes",
        "neutral.diamond_golems",
        "neutral.earth_elementals",
        "neutral.elves",
        "neutral.faerie_dragons",
        "neutral.gold_golems",
        "neutral.gorgons",
        "neutral.halflings",
        "neutral.lizardmen",
        "neutral.magi",
        "neutral.mummies",
        "neutral.nomads",
        "neutral.rust_dragons",
        "neutral.sharpshooters",
        "neutral.titans",
        "neutral.wyverns"
      ].sort()
    );
    expect([...THREE_COPY_NEUTRAL_UNIT_IDS]).toEqual(["neutral.enchanters"]);
  });

  it("a deck with no Elemental left anywhere is skipped without losing a card", () => {
    const state = createAdventureGameState({ seed: "elementals-none", difficulty: "normal", rollFirstPlayer: false });
    state.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile = [bronzeFillers[0], bronzeFillers[1]];
    state.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile = [bronzeFillers[2]];

    drawElementals(state);

    const deck = state.decks[NEUTRAL_DECK_IDS.bronze]!;
    expect([...deck.drawPile, ...deck.discardPile].sort()).toEqual(
      [bronzeFillers[0], bronzeFillers[1], bronzeFillers[2]].sort()
    );
    expect(deck.drawPile.some((id) => id.includes("elemental"))).toBe(false);
  });

  it("CONTROL: a different proclamation leaves every Neutral deck untouched", () => {
    const state = craftedGame("elementals-control");
    const bronzeBefore = [...state.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile];
    state.decks.astrologers!.drawPile = ["astrologers.dead_silence"];
    drawAstrologersCard(state);
    expect(state.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile).toEqual(bronzeBefore);
  });
});

// ===========================================================================
// Plastic Tray — a shield pays a flat +1 Defense, no Defend die at all
// ===========================================================================

describe("Astrologers — Plastic Tray (Defend shields pay flat +1, no die)", () => {
  function settle(state: GameState): GameState {
    let current = state;
    let safety = 50;
    while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
      safety -= 1;
      if (current.reactionWindow) {
        current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
        continue;
      }
      const choice = current.pendingChoice;
      if (choice?.type === "ATTACK_DIE_REROLL") {
        current = applyOk(current, {
          type: "CHOOSE_PENDING_ROLL",
          playerId: choice.playerId,
          choiceId: choice.id,
          candidateIndex: choice.candidates.length - 1
        });
      }
    }
    return current;
  }

  /**
   * Attack-3 melee hit into a 0-Defense defender. Scripted dice: the attack
   * die rolls "+1"; a Defend die — IF one is rolled — comes up `defendFace`.
   */
  function duel(opts: { proclamation: string | null; defenseToken: boolean; defendFace?: number }): GameState {
    const state = createInitialGameState("plastic-tray");
    if (opts.proclamation) {
      // The sim sandbox has no adventure state; the proclamation reader only
      // touches `adventure.astrologers`, seeded here.
      state.adventure = {
        astrologers: {
          activeCardId: opts.proclamation,
          nextResourceModifiers: { gold: 0, valuables: 0 },
          crazyWizardUsedBy: [],
          swiftWeaselUsedBy: []
        }
      } as unknown as AdventureState;
    }
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.defense = 0;
    defender.defenseToken = opts.defenseToken;
    defender.position = 2; // adjacent to 1
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.dice.scriptedRolls = [1, opts.defendFace ?? 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
  }

  function damageTaken(state: GameState): number {
    return state.combat!.units.unit_p2_skeletons.damage;
  }

  it("a defending unit takes 1 less damage with NO Defend die rolled", () => {
    // Plastic Tray: flat +1 → 4-attack hit does 3, and only the attack die was
    // consumed (rollCount 1 — no Defend die at all).
    const tray = duel({ proclamation: "astrologers.plastic_tray", defenseToken: true });
    expect(damageTaken(tray)).toBe(3);
    expect(tray.combat!.dice.rollCount).toBe(1);
  });

  it("CONTROL: without the proclamation the same shield ROLLS the die — a '0' face pays nothing", () => {
    const control = duel({ proclamation: "astrologers.dead_silence", defenseToken: true, defendFace: 0 });
    expect(damageTaken(control)).toBe(4);
    // Both the attack die AND the Defend die were consumed.
    expect(control.combat!.dice.rollCount).toBe(2);
  });

  it("the flat +1 never STACKS with a die: a would-be '+1' Defend face changes nothing", () => {
    const tray = duel({ proclamation: "astrologers.plastic_tray", defenseToken: true, defendFace: 1 });
    expect(damageTaken(tray)).toBe(3); // still exactly +1, and the face was never read
    expect(tray.combat!.dice.rollCount).toBe(1);
  });

  it("CONTROL: a unit with NO shield gets no flat bonus from Plastic Tray", () => {
    const bare = duel({ proclamation: "astrologers.plastic_tray", defenseToken: false });
    expect(damageTaken(bare)).toBe(4);
  });
});

// ===========================================================================
// Forty Thieves — the Event draw pops 2; the drawer picks which resolves
// ===========================================================================

describe("Astrologers — Forty Thieves (draw 2 Events, pick 1, other to the bottom)", () => {
  /** Fresh multi-player game with the Event deck on and a quiet board. */
  function eventsGame(seed: string, playerCount: 2 | 3 = 2): GameState {
    const players =
      playerCount === 3
        ? [
            { id: "p1", name: "One", factionId: "castle" as const, heroDefId: "catherine" },
            { id: "p2", name: "Two", factionId: "necropolis" as const },
            { id: "p3", name: "Three", factionId: "tower" as const }
          ]
        : undefined;
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      events: true,
      ...(players ? { players } : {})
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    return state;
  }

  /** Puts `cardId` on TOP of the Event draw pile (draws pop the array end). */
  function stackEventDeck(state: GameState, cardId: string): void {
    const deck = state.decks[EVENTS_DECK_ID]!;
    deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
    deck.drawPile.push(cardId);
  }

  function startResourceRound(state: GameState, round = 3): void {
    state.round = round;
    startAdventureRound(state);
    pumpAdventureQueues(state);
  }

  function chooseVisitOption(state: GameState, playerId: PlayerId, match: RegExp): GameState {
    const legal = getLegalActions(state, playerId).find(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
    );
    expect(legal, `expected a visit option matching ${match}`).toBeTruthy();
    return applyOk(state, legal!.action);
  }

  /** Total Event cards across every zone (nothing may ever leak out of the game). */
  function eventCardCount(state: GameState): number {
    const deck = state.decks[EVENTS_DECK_ID]!;
    const events = state.adventure!.events;
    return (
      deck.drawPile.length +
      deck.discardPile.length +
      (events?.activeCardId ? 1 : 0) +
      (events?.pendingPick?.cardIds.length ?? 0)
    );
  }

  function pickOpen(seed: string, playerCount: 2 | 3 = 2): GameState {
    const state = eventsGame(seed, playerCount);
    setActive(state, "astrologers.forty_thieves");
    stackEventDeck(state, "event.the_villagers_plea");
    stackEventDeck(state, "event.stables"); // top — drawn first
    startResourceRound(state, 3);
    return state;
  }

  it("draws 2 cards and opens the drawer's pick; the table is frozen behind the barrier", () => {
    const state = pickOpen("forty-flow");

    // Both cards left the pile and wait in the shared pick custody; no Event is
    // active yet (the overlay fires only for the CHOSEN card).
    expect(state.adventure!.events?.pendingPick?.cardIds).toEqual(["event.stables", "event.the_villagers_plea"]);
    expect(state.adventure!.events?.activeCardId).toBeNull();
    expect(state.adventure!.eventResolution).toBeTruthy();
    expect(eventCardCount(state)).toBe(20);

    // The drawer (p1, first Event draw) owns the pick as a normal visit choice…
    expect(state.adventure!.pendingVisit?.playerId).toBe("p1");
    const labels = getLegalActions(state, "p1")
      .filter((entry) => entry.action.type === "RESOLVE_VISIT_STEP")
      .map((entry) => entry.label);
    expect(labels.some((label) => /Stables/.test(label))).toBe(true);
    expect(labels.some((label) => /Villagers/.test(label))).toBe(true);
    // …while the other seat is frozen (round-start event barrier).
    expect(getLegalActions(state, "p2")).toEqual([]);
  });

  it("the pick resolves the CHOSEN card ahead of the barrier sentinel; the other goes to the bottom", () => {
    const after = chooseVisitOption(pickOpen("forty-pick"), "p1", /Stables/);

    expect(after.adventure!.events?.activeCardId).toBe("event.stables");
    expect(after.adventure!.events?.pendingPick).toBeFalsy();
    // "Put the other at the bottom of the Event deck" (draws pop the end).
    expect(after.decks[EVENTS_DECK_ID]!.drawPile[0]).toBe("event.the_villagers_plea");
    expect(eventCardCount(after)).toBe(20);
    // The table saw the normal drawn-Event moment for the chosen card.
    expect(
      after.eventLog.some((event) => event.type === "EVENT_CARD_DRAWN" && event.cardId === "event.stables")
    ).toBe(true);

    // Stables resolves clockwise from the drawer BEFORE the barrier lifts: p1's
    // own choice is already open, p2's waits in the queue AHEAD of the sentinel.
    expect(after.adventure!.eventResolution).toBeTruthy();
    const queue = after.adventure!.rewardQueue;
    const p2Step = queue.findIndex(
      (reward) => reward.kind === "visit-steps" && reward.playerId === "p2" && reward.steps[0]?.type === "EVENT_PLAYER_CHOICE"
    );
    const sentinel = queue.findIndex((reward) => reward.kind === "round-start-events-resolved");
    expect(p2Step).toBeGreaterThanOrEqual(0);
    expect(sentinel).toBeGreaterThan(p2Step);
  });

  it("CONTROL: with a different proclamation up the draw is the normal single card", () => {
    const state = eventsGame("forty-control");
    setActive(state, "astrologers.dead_silence");
    stackEventDeck(state, "event.stables");
    startResourceRound(state, 3);
    expect(state.adventure!.events?.activeCardId).toBe("event.stables");
    expect(state.adventure!.events?.pendingPick).toBeFalsy();
  });

  it("falls back to the single-card draw when fewer than 2 Event cards remain anywhere", () => {
    const state = eventsGame("forty-single");
    setActive(state, "astrologers.forty_thieves");
    state.decks[EVENTS_DECK_ID]!.drawPile = ["event.stables"];
    state.decks[EVENTS_DECK_ID]!.discardPile = [];
    startResourceRound(state, 3);
    expect(state.adventure!.events?.activeCardId).toBe("event.stables");
    expect(state.adventure!.events?.pendingPick).toBeFalsy();
  });

  it("survives the drawer's elimination mid-pick: the next live seat inherits the SAME pick", () => {
    const state = pickOpen("forty-elim", 3);
    expect(state.adventure!.pendingVisit?.playerId).toBe("p1");

    eliminatePlayer(state, "p1", "removed mid-pick", false);
    pumpAdventureQueues(state);

    // The custodied pair never left the game; p2 now owns the identical choice.
    expect(state.adventure!.events?.pendingPick?.cardIds).toEqual(["event.stables", "event.the_villagers_plea"]);
    expect(state.adventure!.pendingVisit?.playerId).toBe("p2");

    const after = chooseVisitOption(state, "p2", /Villagers/);
    expect(after.adventure!.events?.activeCardId).toBe("event.the_villagers_plea");
    expect(after.decks[EVENTS_DECK_ID]!.drawPile[0]).toBe("event.stables");
    expect(eventCardCount(after)).toBe(20);
    // Only live seats are queued for the resolution.
    expect(
      after.adventure!.rewardQueue.every(
        (reward) => reward.kind === "round-start-events-resolved" || reward.playerId !== "p1"
      )
    ).toBe(true);
  });

  it("only joins the Astrologers deck when the Event deck is in play", () => {
    const withEvents = createAdventureGameState({ seed: "forty-on", difficulty: "normal", rollFirstPlayer: false, events: true });
    expect(withEvents.decks.astrologers!.drawPile).toContain("astrologers.forty_thieves");

    const withoutEvents = createAdventureGameState({ seed: "forty-off", difficulty: "normal", rollFirstPlayer: false });
    expect(withoutEvents.decks.astrologers!.drawPile).not.toContain("astrologers.forty_thieves");
    // The static deck list still carries it — the exclusion is per-game setup.
    expect(astrologersDeckCardIds).toContain("astrologers.forty_thieves");
  });

  it("removes a legacy/imported Forty Thieves at draw time when Events are off", () => {
    const withoutEvents = createAdventureGameState({
      seed: "forty-imported-off",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    withoutEvents.round = 4;
    withoutEvents.decks.astrologers!.drawPile = ["astrologers.dead_silence", "astrologers.forty_thieves"];
    withoutEvents.decks.astrologers!.discardPile = [];

    drawAstrologersCard(withoutEvents);

    expect(withoutEvents.adventure!.astrologers?.activeCardId).toBe("astrologers.dead_silence");
    expect(withoutEvents.decks.astrologers!.drawPile).not.toContain("astrologers.forty_thieves");
    expect(withoutEvents.decks.astrologers!.discardPile).not.toContain("astrologers.forty_thieves");
    expect(
      withoutEvents.eventLog.some(
        (event) => event.type === "ASTROLOGERS_DRAWN" && event.cardId === "astrologers.forty_thieves"
      )
    ).toBe(false);

    // Even a malformed one-card deck must not surface the unsupported card.
    withoutEvents.adventure!.astrologers!.activeCardId = null;
    withoutEvents.decks.astrologers!.drawPile = ["astrologers.forty_thieves"];
    withoutEvents.decks.astrologers!.discardPile = [];
    drawAstrologersCard(withoutEvents);
    expect(withoutEvents.adventure!.astrologers?.activeCardId).toBeNull();
  });
});
