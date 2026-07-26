import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  NEUTRAL_DECK_IDS
} from "./index";
import { openSharedDeckSearch } from "./adventure-reducer";
import { getOffTurnCombatReactions } from "./legal-actions";
import type { GameAction, GameState } from "./state";

/**
 * Engine coverage for Tarnum (Conflux) — the Enchanters Elementalist. Each level
 * is driven through the real engine and each test fails if the wiring is removed.
 *
 *   I  — map: Search(1) the Spell deck; KEEP the found Spell into hand OR REMOVE
 *        it from the game (CARD_DECK_SEARCH with allowRemove).
 *   IV — map: pay 10 gold to fetch the unique neutral Enchanters card (only 1 at
 *        a time) — OR — draw a card (CONVERT_ARMY_UNIT with goldCost).
 *   VI — combat: Search(1) the Spell deck twice into hand, then cast either/both
 *        for FREE over the per-round Spell limit, returning each cast Spell to the
 *        Spell deck top or its discard pile (TARNUM_OVERLIMIT_SEARCH).
 */

const T1 = "specialty.tarnum_conflux.1";
const T4 = "specialty.tarnum_conflux.4";
const T6 = "specialty.tarnum_conflux.6";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** A fresh map turn for p1 playing Tarnum, with a clean board. */
function tarnumMap(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Tarnum", factionId: "conflux", heroDefId: "tarnum_conflux" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  return state;
}

describe("Tarnum (Conflux) — registration", () => {
  it("is the sixth Conflux hero, an Elementalist with all three Enchanters specialties implemented", () => {
    expect(coreFactionDefinitions.conflux.heroes).toContain("tarnum_conflux");
    const tarnum = coreHeroDefinitions.tarnum_conflux;
    expect(tarnum.faction).toBe("conflux");
    expect(tarnum.class).toBe("Elementalist");
    expect(tarnum.startingAbilityCardId).toBe("ability.wisdom");
    expect(tarnum.startingStats).toEqual({ attack: 0, defense: 0, power: 2, knowledge: 3 });
    for (const id of [T1, T4, T6]) {
      expect(cardLibrary[id]?.implementationStatus, id).toBe("implemented");
    }
  });
});

describe("Tarnum I — Search(1) Spell, keep or Remove", () => {
  /** Play Tarnum I and return [searching state, the Spell it revealed]. */
  function openSearch(seed: string): { searching: GameState; revealed: string } {
    const state = tarnumMap(seed);
    state.players.p1.hand = [T1];
    // A clean spell deck whose top cards are spells, no discard top (so the
    // search reveals immediately and offers the keep/Remove picks).
    state.decks.spells.drawPile = ["spell.bless", "spell.lightning_bolt", "spell.fireball"];
    state.decks.spells.discardPile = [];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T1
    );
    expect(play, "Tarnum I should be playable on the map").toBeTruthy();
    let searching = applyOk(state, play!.action);
    // In BINH mode a Search can first ask which spell deck (basic vs expert) or
    // whether to take the discard top; option 0 commits to Searching the basic
    // "spells" deck, reaching the reveal where the keep/Remove picks live.
    let guard = 4;
    while (searching.pendingChoice?.type === "OPTION_CHOICE" && guard-- > 0) {
      searching = applyOk(searching, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: searching.pendingChoice.id, optionIndex: 0 });
    }
    expect(searching.pendingChoice?.type).toBe("DECK_SEARCH");
    const choice = searching.pendingChoice;
    const revealed = choice?.type === "DECK_SEARCH" ? choice.revealedCardIds[0] : "";
    expect(revealed, "the search should reveal a Spell").toBeTruthy();
    return { searching, revealed };
  }

  it("offers both Keep and Remove for the revealed Spell", () => {
    const { searching } = openSearch("tarnum-i-offers");
    const labels = getLegalActions(searching, "p1").map((legal) => legal.label);
    expect(labels.some((l) => /^Keep /.test(l))).toBe(true);
    expect(labels.some((l) => /^Remove /.test(l))).toBe(true);
  });

  it("KEEP puts the searched Spell into hand", () => {
    const { searching, revealed } = openSearch("tarnum-i-keep");
    const keep = getLegalActions(searching, "p1").find(
      (legal) => legal.action.type === "RESOLVE_DECK_SEARCH" && legal.action.pick.remove !== true
    );
    expect(keep).toBeTruthy();
    const after = applyOk(searching, keep!.action);
    expect(after.players.p1.hand).toContain(revealed);
  });

  it("REMOVE deletes the searched Spell entirely — not to hand, not to the Spell deck", () => {
    const { searching, revealed } = openSearch("tarnum-i-remove");
    const remove = getLegalActions(searching, "p1").find(
      (legal) => legal.action.type === "RESOLVE_DECK_SEARCH" && legal.action.pick.remove === true
    );
    expect(remove, "Tarnum I should offer Remove").toBeTruthy();
    const after = applyOk(searching, remove!.action);
    expect(after.players.p1.hand).not.toContain(revealed);
    expect(after.decks.spells.discardPile).not.toContain(revealed);
    expect(after.decks.spells.drawPile).not.toContain(revealed);
  });

  it("CONTROL: a normal shared-deck Search (allowRemove off) offers no Remove pick", () => {
    const state = tarnumMap("tarnum-i-control");
    state.players.p1.hand = [];
    state.decks.spells.drawPile = ["spell.bless", "spell.lightning_bolt", "spell.fireball"];
    state.decks.spells.discardPile = [];
    // A plain Search (no allowRemove) — the same path Tarnum I rides, minus the flag.
    openSharedDeckSearch(state, "p1", "spells", 1, false);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels.some((l) => /^Keep /.test(l))).toBe(true);
    expect(labels.some((l) => /^Remove /.test(l))).toBe(false);
  });
});

describe("Tarnum IV — pay 10 gold for the Enchanters", () => {
  function tarnumIvState(seed: string): GameState {
    const state = tarnumMap(seed);
    state.players.p1.hand = [T4];
    state.players.p1.army = [];
    expect(state.decks[NEUTRAL_DECK_IDS.gold].drawPile).toContain("neutral.enchanters");
    return state;
  }

  it("pays 10 gold and adds the unique Enchanters to the army", () => {
    const state = tarnumIvState("tarnum-iv-pay");
    state.players.p1.resources.gold = 10;
    const before = state.players.p1.resources.gold;

    const pay = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T4 && legal.action.optionIndex === 0
    );
    expect(pay, "the pay-10-gold trade should be offered with enough gold").toBeTruthy();
    const after = applyOk(state, pay!.action);
    expect(after.players.p1.resources.gold).toBe(before - 10);
    expect(after.players.p1.army.some((u) => u.unitDefId === "neutral.enchanters")).toBe(true);
    expect(after.decks[NEUTRAL_DECK_IDS.gold].drawPile).not.toContain("neutral.enchanters");
  });

  it("does not offer the trade with fewer than 10 gold (but always offers the draw)", () => {
    const state = tarnumIvState("tarnum-iv-broke");
    state.players.p1.resources.gold = 9;
    const actions = getLegalActions(state, "p1");
    expect(
      actions.find(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T4 && legal.action.optionIndex === 0
      )
    ).toBeFalsy();
    expect(
      actions.find(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T4 && legal.action.optionIndex === 1
      ),
      "the Draw a card option is always available"
    ).toBeTruthy();
  });

  it("CONTROL: with an Enchanters already owned, the unique trade is not offered", () => {
    const state = tarnumIvState("tarnum-iv-unique");
    state.players.p1.resources.gold = 50;
    state.players.p1.army = [{ id: "army_ench", unitDefId: "neutral.enchanters", side: "few" }];
    const pay = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T4 && legal.action.optionIndex === 0
    );
    expect(pay).toBeFalsy();
  });
});

describe("Tarnum VI — Search twice, cast over the per-round limit", () => {
  /** Combat with p1's Griffins active (cast gate open) and a known Spell deck. */
  function tarnumCombat(seed: string, drawPile: string[]): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [T6];
    state.players.p2.hand = [];
    state.decks.spells.drawPile = drawPile;
    state.decks.spells.discardPile = [];
    // Empty the expert deck by default so the single-deck cases are deterministic
    // (the both-decks test repopulates it). createInitialGameState ships one.
    if (state.decks["spells-expert"]) {
      state.decks["spells-expert"].drawPile = [];
      state.decks["spells-expert"].discardPile = [];
    }
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 30;
    target.damage = 0;
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.movedThisActivation = false;
    griffins.attackedThisActivation = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return state;
  }

  // Drive the per-search deck choice: pick `picks[i]` (default "basic") for each
  // TARNUM_SEARCH step until the choice closes.
  function drivePicks(state: GameState, picks: ("basic" | "expert")[] = []): GameState {
    let cur = state;
    let i = 0;
    let safety = 6;
    while (cur.pendingChoice?.type === "TARNUM_SEARCH" && safety-- > 0) {
      const want = picks[i++] ?? "basic";
      const choices = getLegalActions(cur, "p1").filter((legal) => legal.action.type === "CHOOSE_OPTION");
      const pick = choices.find((legal) => legal.label.toLowerCase().includes(want)) ?? choices[0];
      expect(pick, `a ${want} deck Search should be offered`).toBeTruthy();
      cur = applyOk(cur, pick!.action);
    }
    return cur;
  }

  function playSpecialty(state: GameState, picks: ("basic" | "expert")[] = []): GameState {
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T6
    );
    expect(play, "Tarnum VI should be playable in combat").toBeTruthy();
    return passAllReactions(drivePicks(applyOk(state, play!.action), picks));
  }

  it("Searches two Spells into hand and flags them for an over-limit cast", () => {
    // lightning_bolt is searched first (top = last element), bless second.
    const state = tarnumCombat("tarnum-vi-search", ["spell.bless", "spell.lightning_bolt"]);
    const after = playSpecialty(state);
    expect(after.players.p1.hand).toContain("spell.lightning_bolt");
    expect(after.players.p1.hand).toContain("spell.bless");
    expect(after.players.p1.combatStats.tarnumOverlimitCards).toEqual(
      expect.arrayContaining(["spell.lightning_bolt", "spell.bless"])
    );
    // Both came off the deck.
    expect(after.decks.spells.drawPile).not.toContain("spell.lightning_bolt");
    expect(after.decks.spells.drawPile).not.toContain("spell.bless");
  });

  it("casts a Searched Spell for FREE even after the Spell limit is spent, then returns it to the Spell deck top", () => {
    const state = tarnumCombat("tarnum-vi-overlimit", ["spell.bless", "spell.lightning_bolt"]);
    // The hero has already cast their one Spell this round.
    state.players.p1.combatStats.spellsCastThisRound = 1;
    const searched = playSpecialty(state);
    expect(searched.players.p1.combatStats.spellsCastThisRound).toBe(1);

    const cast = getLegalActions(searched, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.lightning_bolt" &&
        legal.action.tarnumReturn === "deck-top" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "the over-limit cast should be offered despite the spent limit").toBeTruthy();

    const after = passAllReactions(applyOk(searched, cast!.action));
    // Observable outcome: the enemy actually took Lightning Bolt damage.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(0);
    // Free bonus: it did NOT consume the per-round limit.
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(1);
    // The cast Spell returns to the shared Spell deck TOP — not the caster's discard.
    expect(after.decks.spells.drawPile.at(-1)).toBe("spell.lightning_bolt");
    expect(after.players.p1.discard).not.toContain("spell.lightning_bolt");
    expect(after.players.p1.hand).not.toContain("spell.lightning_bolt");
    // The flag for that card is spent; the uncast Bless stays in hand.
    expect(after.players.p1.combatStats.tarnumOverlimitCards).not.toContain("spell.lightning_bolt");
    expect(after.players.p1.hand).toContain("spell.bless");
  });

  it("the 'to Spell discard' placement returns the cast Spell to the Spell discard pile", () => {
    const state = tarnumCombat("tarnum-vi-todiscard", ["spell.bless", "spell.lightning_bolt"]);
    state.players.p1.combatStats.spellsCastThisRound = 1;
    const searched = playSpecialty(state);
    const cast = getLegalActions(searched, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.lightning_bolt" &&
        legal.action.tarnumReturn === "discard" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast).toBeTruthy();
    const after = passAllReactions(applyOk(searched, cast!.action));
    expect(after.decks.spells.discardPile).toContain("spell.lightning_bolt");
    expect(after.players.p1.discard).not.toContain("spell.lightning_bolt");
  });

  it("CONTROL: a forged over-limit cast of a non-Searched hand Spell is rejected", () => {
    const state = tarnumCombat("tarnum-vi-forge", ["spell.bless", "spell.lightning_bolt"]);
    state.players.p1.hand = ["spell.lightning_bolt"]; // in hand, but never Searched/flagged
    state.players.p1.combatStats.spellsCastThisRound = 1;
    const result = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.lightning_bolt",
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      tarnumReturn: "deck-top"
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("PER-SEARCH DECK CHOICE: the caster Searches the basic deck then the expert deck", () => {
    // Basic deck top is lightning_bolt; the expert deck holds bless.
    const state = tarnumCombat("tarnum-vi-bothdecks", ["spell.lightning_bolt"]);
    state.decks["spells-expert"] = { id: "spells-expert", drawPile: ["spell.bless"], discardPile: [] };
    // Both decks are offered as distinct Search picks.
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T6
    );
    const searching = applyOk(state, play!.action);
    expect(searching.pendingChoice?.type).toBe("TARNUM_SEARCH");
    const labels = getLegalActions(searching, "p1").map((legal) => legal.label);
    expect(labels.some((l) => /basic Spell deck/i.test(l))).toBe(true);
    expect(labels.some((l) => /expert Spell deck/i.test(l))).toBe(true);

    // Pick basic first, expert second.
    const after = passAllReactions(drivePicks(searching, ["basic", "expert"]));
    expect(after.players.p1.hand).toContain("spell.lightning_bolt"); // from the basic deck
    expect(after.players.p1.hand).toContain("spell.bless"); // from the expert deck
    expect(after.decks.spells.drawPile).not.toContain("spell.lightning_bolt");
    expect(after.decks["spells-expert"].drawPile).not.toContain("spell.bless");
    expect(after.players.p1.combatStats.tarnumOverlimitCards).toEqual(
      expect.arrayContaining(["spell.lightning_bolt", "spell.bless"])
    );
  });

  it("PER-SEARCH DECK CHOICE: both searches can target the SAME (expert) deck", () => {
    const state = tarnumCombat("tarnum-vi-expert-twice", ["spell.fireball"]);
    state.decks["spells-expert"] = {
      id: "spells-expert",
      drawPile: ["spell.bless", "spell.lightning_bolt"],
      discardPile: []
    };
    const after = playSpecialty(state, ["expert", "expert"]);
    // Both came from the expert deck; the basic Fireball was untouched.
    expect(after.players.p1.hand).toEqual(
      expect.arrayContaining(["spell.lightning_bolt", "spell.bless"])
    );
    expect(after.players.p1.hand).not.toContain("spell.fireball");
    expect(after.decks.spells.drawPile).toContain("spell.fireball");
  });

  it("offers and resolves a Search when the only Spell is in a discard pile", () => {
    let state = tarnumCombat("tarnum-vi-discard-only", []);
    state.decks.spells.discardPile = ["spell.lightning_bolt"];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T6
    );
    expect(play, "discard-only Spell decks still make Tarnum VI playable").toBeTruthy();
    state = applyOk(state, play!.action);

    expect(state.pendingChoice?.type).toBe("TARNUM_SEARCH");
    const choices = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "CHOOSE_OPTION"
    );
    expect(choices.some((legal) => /basic Spell deck/i.test(legal.label))).toBe(true);

    state = drivePicks(state, ["basic"]);
    expect(state.players.p1.hand).toContain("spell.lightning_bolt");
    expect(state.decks.spells.drawPile).not.toContain("spell.lightning_bolt");
    expect(state.decks.spells.discardPile).not.toContain("spell.lightning_bolt");
  });

  it("INSTANT WINDOW: can be played off-turn (during an enemy unit's activation)", () => {
    const state = tarnumCombat("tarnum-vi-offturn", ["spell.bless", "spell.lightning_bolt"]);
    state.phase = "combat";
    // It is NOT p1's activation — an enemy unit is active.
    state.combat!.units.unit_p1_griffins.activatedThisRound = true;
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const offTurn = getOffTurnCombatReactions(state, "p1");
    expect(
      offTurn.some((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T6),
      "Tarnum VI is an Instant, playable off-turn in the instant window"
    ).toBe(true);
  });

  it("INSTANT WINDOW: discard-only Spell decks do not hide Tarnum VI", () => {
    const state = tarnumCombat("tarnum-vi-offturn-discard-only", []);
    state.decks.spells.discardPile = ["spell.bloodlust"];
    state.phase = "combat";
    state.combat!.units.unit_p1_griffins.activatedThisRound = true;
    state.combat!.activeUnitId = "unit_p2_skeletons";

    expect(
      getOffTurnCombatReactions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === T6
      )
    ).toBe(true);
  });

  it("RISK: off-turn, a Searched instant Spell can be cast over-limit but a combat-timed one cannot", () => {
    // Play VI on-turn to Search counterstrike (a trigger-free instant) +
    // lightning_bolt (combat), then flip to an off-turn instant window and see
    // what can actually be cast. lightning_bolt is searched first (deck top).
    const state = tarnumCombat("tarnum-vi-risk", ["spell.counterstrike", "spell.lightning_bolt"]);
    state.players.p1.combatStats.spellsCastThisRound = 1; // limit already spent
    const searched = playSpecialty(state);
    expect(searched.players.p1.hand).toEqual(
      expect.arrayContaining(["spell.counterstrike", "spell.lightning_bolt"])
    );

    // Off-turn: an enemy unit is active, p1 has no active unit of its own.
    searched.phase = "combat";
    searched.combat!.units.unit_p1_griffins.activatedThisRound = true;
    searched.combat!.activeUnitId = "unit_p2_skeletons";
    const offTurn = getOffTurnCombatReactions(searched, "p1");

    const instantCast = offTurn.find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.counterstrike" &&
        legal.action.tarnumReturn
    );
    const boltCast = offTurn.find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.lightning_bolt" &&
        legal.action.tarnumReturn
    );
    // The trigger-free instant "type allows it" off-turn; the combat-timed one
    // does not (it needs your own active unit) — so playing VI off-turn risks
    // Searching spells you cannot cast right then.
    expect(instantCast, "an instant Searched Spell can be cast off-turn").toBeTruthy();
    expect(boltCast, "a combat-timed Searched Spell cannot be cast off-turn").toBeFalsy();
  });
});

describe("Tarnum VI — instant-window (reaction) casting of attack/defense changers", () => {
  /** Declare a p1 griffins → p2 skeletons melee attack, opening a reaction window. */
  function declareAttack(opts: { hand: string[]; flagged?: string[]; spellsCast?: number }): GameState {
    const state = createInitialGameState("tarnum-react");
    state.players.p1.hand = opts.hand;
    state.players.p2.hand = [];
    state.players.p1.combatStats.tarnumOverlimitCards = opts.flagged ?? [];
    state.players.p1.combatStats.spellsCastThisRound = opts.spellsCast ?? 0;
    state.decks.spells.drawPile = [];
    state.decks.spells.discardPile = [];
    if (state.decks["spells-expert"]) {
      state.decks["spells-expert"].drawPile = [];
      state.decks["spells-expert"].discardPile = [];
    }
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.maxHealth = 50;
    skeletons.damage = 0;
    state.combat!.units.unit_p1_griffins.position = 9;
    skeletons.position = 13;
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
  }

  const BLOODLUST = "spell.bloodlust"; // instant, attack-trigger, +1 attack at Power 0

  it("offers a flagged attack/defense-changing instant as a free over-limit reaction (both placements), even at the limit", () => {
    const state = declareAttack({ hand: [BLOODLUST], flagged: [BLOODLUST], spellsCast: 1 });
    const offers = state.reactionWindow?.legalReactions.p1 ?? [];
    const tarnumOffers = offers.filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === BLOODLUST && legal.action.tarnumReturn
    );
    expect(tarnumOffers.map((o) => o.action.type === "PLAY_REACTION" && o.action.tarnumReturn).sort()).toEqual([
      "deck-top",
      "discard"
    ]);
    // The normal (limit-counting, own-discard) Bloodlust reaction is NOT offered
    // for a flagged card.
    expect(
      offers.some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === BLOODLUST && !legal.action.tarnumReturn
      )
    ).toBe(false);
  });

  it("CONTROL: an unflagged Bloodlust is blocked at the spell limit (only the flag lifts it)", () => {
    const state = declareAttack({ hand: [BLOODLUST], spellsCast: 1 });
    const offers = state.reactionWindow?.legalReactions.p1 ?? [];
    expect(offers.some((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === BLOODLUST)).toBe(false);
  });

  it("casts the flagged instant for FREE, applies its buff, and returns it to the Spell deck top", () => {
    // Baseline damage with no Bloodlust.
    const baseline = passAllReactions(declareAttack({ hand: [] }));
    const baseDamage = baseline.combat!.units.unit_p2_skeletons.damage;

    const state = declareAttack({ hand: [BLOODLUST], flagged: [BLOODLUST], spellsCast: 1 });
    const cast = (state.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === BLOODLUST && legal.action.tarnumReturn === "deck-top"
    );
    expect(cast, "the free over-limit Bloodlust reaction should be offered").toBeTruthy();
    const after = passAllReactions(applyOk(state, cast!.action));

    // Observable: the +1 attack buff landed — more damage than the no-Bloodlust baseline.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(baseDamage);
    // Free over-limit: the per-round limit did not advance past the spent 1.
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(1);
    // The cast Spell returned to the shared Spell deck TOP — not the caster's discard.
    expect(after.decks.spells.drawPile.at(-1)).toBe(BLOODLUST);
    expect(after.players.p1.discard).not.toContain(BLOODLUST);
    expect(after.players.p1.hand).not.toContain(BLOODLUST);
    // The over-limit flag is spent.
    expect(after.players.p1.combatStats.tarnumOverlimitCards ?? []).not.toContain(BLOODLUST);
  });

  it("the 'to Spell discard' placement returns the cast reaction Spell to the Spell discard pile", () => {
    const state = declareAttack({ hand: [BLOODLUST], flagged: [BLOODLUST], spellsCast: 1 });
    const cast = (state.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === BLOODLUST && legal.action.tarnumReturn === "discard"
    );
    const after = passAllReactions(applyOk(state, cast!.action));
    expect(after.decks.spells.discardPile).toContain(BLOODLUST);
    expect(after.players.p1.discard).not.toContain(BLOODLUST);
  });

  it("CONTROL: a forged tarnumReturn reaction on an unflagged Spell is rejected", () => {
    const state = declareAttack({ hand: [BLOODLUST], spellsCast: 1 });
    const result = applyAction(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: BLOODLUST,
      mode: "basic",
      tarnumReturn: "deck-top"
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("VI used AS a reaction: play it in the attack window, Search, then cast an applicable instant into the SAME window", () => {
    function attackHoldingVI(): GameState {
      const state = createInitialGameState("tarnum-react-vi");
      state.players.p1.hand = [T6];
      state.players.p2.hand = [];
      state.players.p1.combatStats.spellsCastThisRound = 1; // limit already spent
      // Bloodlust on top (Searched first), then a combat Fireball.
      state.decks.spells.drawPile = ["spell.fireball", BLOODLUST];
      state.decks.spells.discardPile = [];
      if (state.decks["spells-expert"]) {
        state.decks["spells-expert"].drawPile = [];
        state.decks["spells-expert"].discardPile = [];
      }
      const skeletons = state.combat!.units.unit_p2_skeletons;
      skeletons.maxHealth = 50;
      skeletons.damage = 0;
      state.combat!.units.unit_p1_griffins.position = 9;
      skeletons.position = 13;
      let s = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });

      const viReaction = getLegalActions(s, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === T6
      );
      expect(viReaction, "VI should be usable as a reaction in the attack window").toBeTruthy();
      s = applyOk(s, viReaction!.action);

      // The per-search deck choice opens inside the window; pick the basic deck twice.
      expect(s.pendingChoice?.type).toBe("TARNUM_SEARCH");
      let guard = 4;
      while (s.pendingChoice?.type === "TARNUM_SEARCH" && guard-- > 0) {
        const pick = getLegalActions(s, "p1").find((legal) => legal.action.type === "CHOOSE_OPTION");
        s = applyOk(s, pick!.action);
      }
      return s;
    }

    const searched = attackHoldingVI();
    // The attack window is still open and refreshed.
    expect(searched.reactionWindow, "the attack window stays open through the Search").toBeTruthy();
    expect(searched.players.p1.discard).toContain(T6); // the specialty cycled to discard
    // The just-Searched Bloodlust is now castable as a free over-limit reaction…
    const bloodlustCast = getLegalActions(searched, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === BLOODLUST && legal.action.tarnumReturn === "deck-top"
    );
    expect(bloodlustCast, "the Searched Bloodlust can be cast into the same window").toBeTruthy();
    // …but the Searched combat Fireball is NOT castable here and just stays in hand.
    expect(
      getLegalActions(searched, "p1").some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.fireball"
      )
    ).toBe(false);
    expect(searched.players.p1.hand).toContain("spell.fireball");

    // Baseline: pass instead of casting Bloodlust — the attack resolves unbuffed.
    const baseline = passAllReactions(applyOk(searched, { type: "PASS_REACTION", playerId: "p1" }));
    const baseDamage = baseline.combat!.units.unit_p2_skeletons.damage;

    const after = passAllReactions(applyOk(searched, bloodlustCast!.action));
    // Observable: the +1 attack buff landed.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(baseDamage);
    // Free over-limit, returned to the Spell deck top, flag spent.
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(1);
    expect(after.decks.spells.drawPile.at(-1)).toBe(BLOODLUST);
    expect(after.players.p1.discard).not.toContain(BLOODLUST);
    expect(after.players.p1.combatStats.tarnumOverlimitCards ?? []).not.toContain(BLOODLUST);
  });
});
