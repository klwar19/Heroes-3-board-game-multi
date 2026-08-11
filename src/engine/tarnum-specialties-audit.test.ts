import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions } from "@/data/factions/core";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  NEUTRAL_DECK_IDS
} from "./index";
import { getPlayerView, redactStateForSeat } from "./player-view";
import { chooseComputerAction } from "./computer/policy";
import { nextTurnTimeoutAction } from "./afk-drop";
import type { FactionId } from "@/data/factions/types";
import type { GameAction, GameState, LegalAction } from "./state";

/**
 * Tarnum specialties — a whole-family effect audit (2026-08-11).
 *
 * Tarnum is SIX heroes, one per faction: Castle (Ballista), Conflux (Enchanters),
 * Dungeon (Dragons), Fortress (Basilisks), Rampart (Sharpshooters) and Stronghold
 * (Offense). Every level is driven through the real pipeline here — offer →
 * apply → observable outcome — and each case fails if its wiring is removed.
 *
 * The two REPORTED bugs both had their root cause in a surface the older tests
 * never exercised, so each has a dedicated block below:
 *
 *  (1) "Tarnum 4 does not let me recruit enchanters, only draw a card." The
 *      Enchanters/Sharpshooters FETCH halves gate on the target card still
 *      sitting in a Neutral Units deck — read straight off `drawPile`. On a
 *      HOSTED table (every single-player room and every CLOSED multiplayer
 *      table) the browser holds a per-seat REDACTED frame whose shared-deck draw
 *      piles are `HIDDEN_CARD_ID` placeholders, so that read was FALSE and the
 *      fetch half was filtered out of the client's own offers — leaving only
 *      "Draw a card". Fixed at ONE seam (`neutralDeckHas`), which also fixes the
 *      three siblings on the same effects: Dracon IV (Tower — the OTHER
 *      Enchanters specialist), Gelu IV and Tarnum (Rampart) VI.
 *
 *  (2) "Tarnum 6 can't be played on a map screen." Tarnum (Conflux) VI is an
 *      Instant whose whole printed effect is "Search(1) Spell twice", i.e. a
 *      card-gain instant — the class the 2026-08-10 ruling made map-playable —
 *      but `TARNUM_OVERLIMIT_SEARCH` had no `isOptionEffectPlayable` case, so no
 *      map offer ever existed (the Solmyr IV shape).
 */

const VARIANTS: Record<string, { faction: FactionId; hero: string }> = {
  tarnum_castle: { faction: "castle", hero: "tarnum_castle" },
  tarnum_conflux: { faction: "conflux", hero: "tarnum_conflux" },
  tarnum_dungeon: { faction: "dungeon", hero: "tarnum_dungeon" },
  tarnum_fortress: { faction: "fortress", hero: "tarnum_fortress" },
  tarnum_rampart: { faction: "rampart", hero: "tarnum_rampart" },
  tarnum_stronghold: { faction: "stronghold", hero: "tarnum_stronghold" }
};

const TARNUM_IDS = Object.keys(cardLibrary)
  .filter((id) => id.startsWith("specialty.tarnum_"))
  .sort();

const GOLD_DECK = NEUTRAL_DECK_IDS.gold;
const SILVER_DECK = NEUTRAL_DECK_IDS.silver;

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

/** A clean map turn for p1 on `heroDefId`. */
function mapTurn(seed: string, factionId: FactionId, heroDefId: string): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "P1", factionId, heroDefId },
      { id: "p2", name: "P2", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  return state;
}

function playOffers(state: GameState, playerId: string, cardId: string): LegalAction[] {
  return getLegalActions(state, playerId).filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
  );
}

function optionIndexes(offers: LegalAction[]): (number | undefined)[] {
  return offers.map((legal) =>
    legal.action.type === "PLAY_CARD" ? legal.action.optionIndex : undefined
  );
}

/**
 * What the BROWSER really renders from on a hosted table: the per-seat redacted
 * frame. Offers derived here are the offers the player can actually click.
 */
function clientPlayOffers(state: GameState, playerId: string, cardId: string): LegalAction[] {
  return playOffers(redactStateForSeat(state, playerId), playerId, cardId);
}

// ---------------------------------------------------------------------------
// Registry / inventory
// ---------------------------------------------------------------------------

describe("Tarnum specialties — the whole family is registered and implemented", () => {
  it("ships six Tarnums, one per faction, each with three implemented levels", () => {
    expect(TARNUM_IDS).toHaveLength(18);
    for (const [slug, { faction }] of Object.entries(VARIANTS)) {
      expect(coreFactionDefinitions[faction].heroes, faction).toContain(slug);
      for (const level of [1, 4, 6]) {
        const card = cardLibrary[`specialty.${slug}.${level}`];
        expect(card, `specialty.${slug}.${level}`).toBeTruthy();
        expect(card.implementationStatus, `specialty.${slug}.${level}`).toBe("implemented");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// REPORT 1 — the hosted (redacted) frame hid every Neutral-deck FETCH half
// ---------------------------------------------------------------------------

describe("REPORT 1: Tarnum IV recruits the Enchanters on a HOSTED table", () => {
  function conflux4(seed: string): GameState {
    const state = mapTurn(seed, "conflux", "tarnum_conflux");
    state.players.p1.hand = ["specialty.tarnum_conflux.4"];
    state.players.p1.resources.gold = 30;
    expect(state.decks[GOLD_DECK].drawPile, "the unique Enchanters starts in the gold deck").toContain(
      "neutral.enchanters"
    );
    return state;
  }

  it("REPRO: the browser's own frame offers the pay-10-gold Enchanters, and it really joins the army", () => {
    const state = conflux4("tc4-hosted");

    // The client derives its buttons from the redacted frame — this is the exact
    // list the player sees. Before the fix it was [1] (Draw a card) alone.
    const client = clientPlayOffers(state, "p1", "specialty.tarnum_conflux.4");
    expect(optionIndexes(client), "both halves must be clickable on a hosted table").toEqual([0, 1]);
    const fetch = client.find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 0
    );
    expect(fetch?.label).toMatch(/10 gold.*Enchanters/i);

    // Observable outcome: the SERVER accepts the button the client rendered, the
    // Enchanters card leaves the gold Neutral deck and joins p1's army for 10 gold.
    const after = applyOk(state, fetch!.action);
    expect(after.players.p1.army.some((unit) => unit.unitDefId === "neutral.enchanters")).toBe(true);
    expect(after.players.p1.resources.gold).toBe(20);
    expect(after.decks[GOLD_DECK].drawPile).not.toContain("neutral.enchanters");
    expect(after.decks[GOLD_DECK].discardPile).not.toContain("neutral.enchanters");
  });

  it("CONTROL: on the real (unmasked) state a truly emptied gold deck offers ONLY the draw", () => {
    const state = conflux4("tc4-empty");
    state.decks[GOLD_DECK].drawPile = state.decks[GOLD_DECK].drawPile.filter(
      (cardId) => cardId !== "neutral.enchanters"
    );
    state.decks[GOLD_DECK].discardPile = [];
    expect(optionIndexes(playOffers(state, "p1", "specialty.tarnum_conflux.4"))).toEqual([1]);
  });

  it("LIMIT: a masked client cannot know the card vanished, so the SERVER refuses and the card is KEPT", () => {
    // The deliberate residual of the masked-pile fix: with the draw pile hidden
    // and the Enchanters not visibly in anyone's army, the client cannot prove
    // absence, so it still renders the fetch button. The server — which holds
    // the real pile — rejects the play, so the specialty card is never spent for
    // nothing. That is the safe failure direction; the alternative (hiding it)
    // is the reported bug.
    const state = conflux4("tc4-masked-residual");
    state.decks[GOLD_DECK].drawPile = state.decks[GOLD_DECK].drawPile.filter(
      (cardId) => cardId !== "neutral.enchanters"
    );
    state.decks[GOLD_DECK].discardPile = [];
    const fetch = clientPlayOffers(state, "p1", "specialty.tarnum_conflux.4").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 0
    );
    expect(fetch, "the masked client still shows the fetch").toBeTruthy();
    const result = applyAction(state, fetch!.action);
    expect(result.errors.length, "the server refuses it").toBeGreaterThan(0);
    expect(result.state.players.p1.hand, "the specialty card is not spent").toContain(
      "specialty.tarnum_conflux.4"
    );
    expect(result.state.players.p1.resources.gold, "no gold is lost").toBe(30);
  });

  it("CONTROL: an OPPONENT visibly holding the unique Enchanters keeps the fetch hidden on a masked frame", () => {
    // Armies are public, so a redacted client can PROVE the card left the deck.
    const state = conflux4("tc4-opponent-holds");
    state.decks[GOLD_DECK].drawPile = state.decks[GOLD_DECK].drawPile.filter(
      (cardId) => cardId !== "neutral.enchanters"
    );
    state.players.p2.army = [
      ...state.players.p2.army,
      { id: "army_p2_ench", unitDefId: "neutral.enchanters", side: "neutral" }
    ];
    expect(optionIndexes(clientPlayOffers(state, "p1", "specialty.tarnum_conflux.4"))).toEqual([1]);
  });

  it("CONTROL: the gold and uniqueness gates still bite on the hosted frame", () => {
    const broke = conflux4("tc4-broke");
    broke.players.p1.resources.gold = 9;
    expect(
      optionIndexes(clientPlayOffers(broke, "p1", "specialty.tarnum_conflux.4")),
      "9 gold cannot pay the printed 10"
    ).toEqual([1]);

    const owns = conflux4("tc4-owns");
    owns.players.p1.army = [
      ...owns.players.p1.army,
      { id: "army_p1_ench", unitDefId: "neutral.enchanters", side: "neutral" }
    ];
    expect(
      optionIndexes(clientPlayOffers(owns, "p1", "specialty.tarnum_conflux.4")),
      "only 1 Enchanters at a time"
    ).toEqual([1]);
  });

  it("SIBLINGS: Dracon IV (Tower Enchanters) and Gelu IV offer their fetch on a hosted frame too", () => {
    const cases = [
      {
        cardId: "specialty.dracon.4",
        faction: "tower" as FactionId,
        hero: "dracon",
        from: "tower.magi",
        to: "neutral.enchanters",
        deck: GOLD_DECK
      },
      {
        cardId: "specialty.gelu.4",
        faction: "rampart" as FactionId,
        hero: "gelu",
        from: "rampart.elves",
        to: "neutral.sharpshooters",
        deck: SILVER_DECK
      }
    ];
    for (const testCase of cases) {
      const state = mapTurn(`sib-${testCase.cardId}`, testCase.faction, testCase.hero);
      state.players.p1.hand = [testCase.cardId];
      state.players.p1.resources.gold = 30;
      state.players.p1.army = [{ id: "army_from", unitDefId: testCase.from, side: "pack" }];
      expect(state.decks[testCase.deck].drawPile, testCase.cardId).toContain(testCase.to);

      const fetch = clientPlayOffers(state, "p1", testCase.cardId).find(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 0
      );
      expect(fetch, `${testCase.cardId}: the trade half must be clickable on a hosted table`).toBeTruthy();
      const after = applyOk(state, fetch!.action);
      expect(after.players.p1.army.some((unit) => unit.unitDefId === testCase.to), testCase.cardId).toBe(true);
    }
  });
});

describe("REPORT 1 (same seam): Tarnum (Rampart) VI borrows on a HOSTED table", () => {
  function rampart6(seed: string, inDeck = true): GameState {
    const state = createInitialGameState(seed);
    state.decks[SILVER_DECK] = {
      id: SILVER_DECK,
      drawPile: inDeck ? ["neutral.sharpshooters"] : [],
      discardPile: []
    };
    state.players.p1.hand = ["specialty.tarnum_rampart.6"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return state;
  }

  it("the client offers the borrow, and a Sharpshooters really joins the fight", () => {
    const state = rampart6("tr6-hosted");
    const client = clientPlayOffers(state, "p1", "specialty.tarnum_rampart.6");
    expect(optionIndexes(client), "borrow + draw").toEqual([0, 1]);

    const borrow = client.find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 0
    );
    const after = applyOk(state, borrow!.action);
    const borrowed = Object.values(after.combat!.units).find(
      (unit) => unit.name === "Sharpshooters" && unit.controllerId === "p1"
    );
    expect(borrowed, "a Sharpshooters is on the board").toBeTruthy();
    expect(borrowed!.temporary).toBe(true);
    expect(after.decks[SILVER_DECK].drawPile).not.toContain("neutral.sharpshooters");
  });

  it("CONTROL: with the silver deck genuinely empty only the draw is offered on the client", () => {
    const state = rampart6("tr6-empty", false);
    expect(optionIndexes(clientPlayOffers(state, "p1", "specialty.tarnum_rampart.6"))).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// REPORT 2 — Tarnum (Conflux) VI on the map
// ---------------------------------------------------------------------------

describe("REPORT 2: Tarnum (Conflux) VI is playable on the map screen", () => {
  const T6 = "specialty.tarnum_conflux.6";

  function conflux6Map(seed: string, basic: string[] = ["spell.bless", "spell.lightning_bolt"]): GameState {
    const state = mapTurn(seed, "conflux", "tarnum_conflux");
    state.players.p1.hand = [T6];
    state.decks.spells.drawPile = [...basic];
    state.decks.spells.discardPile = [];
    if (state.decks["spells-expert"]) {
      state.decks["spells-expert"].drawPile = [];
      state.decks["spells-expert"].discardPile = [];
    }
    return state;
  }

  it("REPRO: the map turn offers it, and both Searches really put a Spell into hand", () => {
    const state = conflux6Map("tc6-map");
    const play = playOffers(state, "p1", T6)[0];
    expect(play, "Tarnum VI must be playable on the adventure map").toBeTruthy();
    // Also clickable on a hosted table's redacted frame.
    expect(clientPlayOffers(state, "p1", T6).length).toBeGreaterThan(0);

    let current = applyOk(state, play!.action);
    // Two per-search deck picks, resolved on the MAP (returnPhase "player-turn").
    let safety = 6;
    while (current.pendingChoice?.type === "TARNUM_SEARCH" && safety-- > 0) {
      const pick = getLegalActions(current, "p1").find((legal) => legal.action.type === "CHOOSE_OPTION");
      expect(pick, "a Spell deck Search should be offered").toBeTruthy();
      current = applyOk(current, pick!.action);
    }
    expect(current.pendingChoice, "the map Search chain closes cleanly").toBeNull();

    // Observable outcome: BOTH searched Spells are in hand and off the deck.
    expect(current.players.p1.hand).toContain("spell.lightning_bolt");
    expect(current.players.p1.hand).toContain("spell.bless");
    expect(current.decks.spells.drawPile).not.toContain("spell.lightning_bolt");
    expect(current.decks.spells.drawPile).not.toContain("spell.bless");
    // The map play never leaves the table stuck: p1 can still end its turn.
    expect(
      getLegalActions(current, "p1").some((legal) => legal.action.type === "END_TURN")
    ).toBe(true);
  });

  it("CONTROL: with both Spell decks empty it is not offered (nothing to Search)", () => {
    const state = conflux6Map("tc6-empty", []);
    expect(playOffers(state, "p1", T6)).toHaveLength(0);
    expect(clientPlayOffers(state, "p1", T6)).toHaveLength(0);
  });

  it("neither a computer seat nor the forced-resolution driver can stall on the new map play", () => {
    const state = conflux6Map("tc6-nonstall");

    // The AI already prices TARNUM_OVERLIMIT_SEARCH in its card-search band, so
    // the new map offer is scorable — never a "no safe legal action" stall.
    const legalActions = getLegalActions(state, "p1");
    const decision = chooseComputerAction({
      playerId: "p1",
      state: getPlayerView(state, "p1"),
      legalActions
    });
    expect(decision, "a computer seat always picks something on this map turn").toBeTruthy();

    // Whatever it picks, if it plays the specialty the open TARNUM_SEARCH is
    // answerable by the shared forced-resolution driver (the AFK-kick /
    // 10-minute-timeout path), so a dropped seat cannot freeze the table on it.
    const searching = applyOk(state, playOffers(state, "p1", T6)[0]!.action);
    expect(searching.pendingChoice?.type).toBe("TARNUM_SEARCH");
    let current = searching;
    let safety = 6;
    while (current.pendingChoice?.type === "TARNUM_SEARCH" && safety-- > 0) {
      const forced = nextTurnTimeoutAction(current, "p1");
      expect(forced, "the driver must answer the map Search").toBeTruthy();
      current = applyOk(current, forced!);
    }
    expect(current.pendingChoice).toBeNull();
  });

  it("CONTROL: the COMBAT play is unchanged, and an attack window offers it exactly ONCE", () => {
    const state = createInitialGameState("tc6-combat");
    state.players.p1.hand = [T6];
    state.players.p2.hand = [];
    state.decks.spells.drawPile = ["spell.bless", "spell.lightning_bolt"];
    state.decks.spells.discardPile = [];
    if (state.decks["spells-expert"]) {
      state.decks["spells-expert"].drawPile = [];
      state.decks["spells-expert"].discardPile = [];
    }
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.type = "ground";
    attacker.position = 9;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = new Array(12).fill(0);
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    expect(playOffers(state, "p1", T6).length, "still playable on your own activation").toBe(1);

    // In an open attack window it joins as its dedicated Search reaction — one
    // tile, never a duplicate from the generic card-gain utility strip.
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const windowOffers = (declared.reactionWindow?.legalReactions.p1 ?? []).filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === T6
    );
    expect(windowOffers).toHaveLength(1);
    passAllReactions(declared);
  });
});

// ---------------------------------------------------------------------------
// Tarnum (Stronghold) — the Offense family had no EFFECT coverage: it is the
// only consumer of the offenseSpecialty* generators, and the only places it
// appeared were a registry row (expansion-content) plus Offense I used as a prop
// in neutral-reaction-pause, which asserts only that its offer exists. These
// cases assert the DAMAGE each level actually changes.
// ---------------------------------------------------------------------------

describe("Tarnum (Stronghold) — Offense I/IV/VI observable effects", () => {
  /** A scripted-die duel: p1's Griffins hit p2's Skeletons for a known amount. */
  function duel(seed: string, cardId: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [cardId];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.type = "ground";
    attacker.position = 9;
    attacker.attack = 4;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 60;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = new Array(12).fill(0);
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return state;
  }

  function damageDealt(state: GameState, reactionOptionIndex?: number): number {
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    let current = declared;
    if (reactionOptionIndex !== undefined) {
      const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          (legal.action.optionIndex ?? undefined) === (reactionOptionIndex === -1 ? undefined : reactionOptionIndex)
      );
      expect(reaction, "the attack buff should be offered in the window").toBeTruthy();
      current = applyOk(declared, reaction!.action);
    }
    const settled = passAllReactions(current);
    return settled.combat!.units.unit_p2_skeletons.damage;
  }

  it("I's +1 attack half really raises the damage the attack deals by 1", () => {
    const base = damageDealt(duel("ts1-base", "ability.armorer"));
    const buffed = damageDealt(duel("ts1-buff", "specialty.tarnum_stronghold.1"), 0);
    expect(buffed - base, "Offense I adds exactly +1").toBe(1);
  });

  it("VI's +3 attack really raises the damage the attack deals by 3", () => {
    const base = damageDealt(duel("ts6-base", "ability.armorer"));
    const buffed = damageDealt(duel("ts6-buff", "specialty.tarnum_stronghold.6"), -1);
    expect(buffed - base, "Offense VI adds exactly +3").toBe(3);
  });

  it("I's draw half is playable on the adventure map and really draws a card", () => {
    const state = mapTurn("ts1-map", "stronghold", "tarnum_stronghold");
    state.players.p1.hand = ["specialty.tarnum_stronghold.1"];
    state.players.p1.deck = ["ability.armorer", "ability.offense"];
    const draw = playOffers(state, "p1", "specialty.tarnum_stronghold.1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 1
    );
    expect(draw, "the draw half is a map play").toBeTruthy();
    const after = applyOk(state, draw!.action);
    expect(after.players.p1.hand).toHaveLength(1);
    expect(after.players.p1.deck).toHaveLength(1);
    expect(after.players.p1.discard).toContain("specialty.tarnum_stronghold.1");
  });

  it("IV gives a chosen friendly unit +1 attack for the whole combat (a second attack too)", () => {
    const state = duel("ts4-buff", "specialty.tarnum_stronghold.4");
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.tarnum_stronghold.4" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_griffins"
    );
    expect(play, "IV targets a friendly unit in combat").toBeTruthy();
    const buffed = applyOk(state, play!.action);
    const withBuff = damageDealt(buffed);
    const withoutBuff = damageDealt(duel("ts4-base", "ability.armorer"));
    expect(withBuff - withoutBuff, "Offense IV adds +1 for the combat").toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Family sweep — no Tarnum specialty is decorative
// ---------------------------------------------------------------------------

describe("Tarnum family sweep — every level is reachable in a printed situation", () => {
  /**
   * For each of the 18 cards: it must be offered on a MAP turn, on the holder's
   * own COMBAT activation, or inside an open attack WINDOW. A card offered
   * nowhere would be decorative.
   */
  it("every Tarnum specialty is offered somewhere, and each offer applies cleanly", () => {
    const unreachable: string[] = [];
    // Non-vacuity tallies: each bucket must genuinely carry cards, so the sweep
    // cannot pass because one path happens to cover everything.
    const covered = { map: 0, combat: 0, window: 0 };
    for (const cardId of TARNUM_IDS) {
      const slug = cardId.split(".")[1];
      const variant = VARIANTS[slug];

      // (a) map turn
      const mapState = mapTurn(`sweep-map-${cardId}`, variant.faction, variant.hero);
      mapState.players.p1.hand = [cardId];
      mapState.players.p1.resources.gold = 50;
      const mapOffers = playOffers(mapState, "p1", cardId);

      // (b)/(c) combat: own activation and an open attack window. Give p1 a
      // Dragons body and a Ballista so the printed situations of the
      // Dragons/Ballista halves exist.
      const combat = createInitialGameState(`sweep-combat-${cardId}`);
      combat.players.p1.hand = [cardId];
      combat.players.p2.hand = [];
      combat.players.p1.resources.gold = 50;
      // A Ballista in play so Tarnum (Castle) I's "Activate your Ballista" half
      // has its printed situation (a war machine is a PERMANENT card, not a
      // player field — countBallistas reads getPermanentCardIds).
      combat.players.p1.permanents = [
        ...(combat.players.p1.permanents ?? []),
        "war_machine.ballista"
      ];
      combat.decks[SILVER_DECK] = {
        id: SILVER_DECK,
        drawPile: ["neutral.sharpshooters"],
        discardPile: []
      };
      const attacker = combat.combat!.units.unit_p1_griffins;
      attacker.name = "Dragons";
      attacker.abilities = [];
      attacker.type = "ground";
      attacker.position = 9;
      const defender = combat.combat!.units.unit_p2_skeletons;
      defender.position = 13;
      defender.maxHealth = 40;
      defender.damage = 0;
      combat.combat!.dice.scriptedRolls = new Array(12).fill(0);
      combat.combat!.dice.rollCount = 0;
      combat.activePlayerId = "p1";
      combat.combat!.activeUnitId = "unit_p1_griffins";

      const combatOffers = playOffers(combat, "p1", cardId);
      const declared = applyAction(combat, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      const windowOffers = (declared.state.reactionWindow?.legalReactions.p1 ?? []).filter(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
      );

      if (mapOffers.length + combatOffers.length + windowOffers.length === 0) {
        unreachable.push(cardId);
        continue;
      }
      if (mapOffers.length > 0) covered.map += 1;
      if (combatOffers.length > 0) covered.combat += 1;
      if (windowOffers.length > 0) covered.window += 1;

      // Every offer the engine makes must EXECUTE — no offer it cannot apply.
      for (const offer of mapOffers) {
        const result = applyAction(mapState, offer.action);
        expect(
          result.errors.map((error) => error.message),
          `${cardId} map offer "${offer.label}"`
        ).toEqual([]);
      }
      for (const offer of combatOffers) {
        const result = applyAction(combat, offer.action);
        expect(
          result.errors.map((error) => error.message),
          `${cardId} combat offer "${offer.label}"`
        ).toEqual([]);
      }
      for (const offer of windowOffers) {
        const result = applyAction(declared.state, offer.action);
        expect(
          result.errors.map((error) => error.message),
          `${cardId} window offer "${offer.label}"`
        ).toEqual([]);
      }
    }
    expect(unreachable, "no Tarnum specialty may be unplayable in every printed situation").toEqual([]);
    // Six map plays (Castle I's Ballista purchase, Conflux I/IV/VI, Rampart
    // IV/VI's draw halves, Stronghold I's draw), and both combat paths in use.
    expect(covered.map, "map bucket").toBeGreaterThanOrEqual(6);
    expect(covered.combat, "own-activation bucket").toBeGreaterThanOrEqual(6);
    expect(covered.window, "attack-window bucket").toBeGreaterThanOrEqual(7);
  });

  it("CONTROL: the sweep is not vacuous — a hosted client sees the same reachability", () => {
    const missing: string[] = [];
    for (const cardId of TARNUM_IDS) {
      const slug = cardId.split(".")[1];
      const variant = VARIANTS[slug];
      const mapState = mapTurn(`sweep-client-${cardId}`, variant.faction, variant.hero);
      mapState.players.p1.hand = [cardId];
      mapState.players.p1.resources.gold = 50;
      const server = optionIndexes(playOffers(mapState, "p1", cardId)).join(",");
      const client = optionIndexes(clientPlayOffers(mapState, "p1", cardId)).join(",");
      if (server !== client) {
        missing.push(`${cardId}: server=[${server}] client=[${client}]`);
      }
    }
    expect(missing, "a hosted client must never see fewer map offers than the server").toEqual([]);
  });
});
