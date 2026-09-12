import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions
} from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Tarnum (Conflux) I — "Search (1) Spell" — IN COMBAT.
 *
 * USER RULING 2026-09-12 ("make it usable IN COMBAT properly — Search in
 * combat"): the card is printed as an INSTANT, so its Search is a click-to-use
 * play on the map AND mid-Combat, exactly like every other instant Search side
 * (instantSideAllowedInCombat — the same house rule that opened the Spellbinder's
 * Hat / Breastplate of Brimstone / Miriam's Scouting twin in combat). Before this
 * change the card was `timing: "map"` and the combat card pass dropped it at the
 * timing gate (legal-actions' `card.timing !== "combat" && … !== "instant" …`).
 *
 * The CONTROL is Torosar's Ballista IV — a MAP-timed hero-specialty with no draw
 * face (a plain DRAW_CARDS side waives the combat timing gate on its own, via
 * hasTimingFreeDrawVariant, so Tarnum's own level IV would NOT discriminate) —
 * so these tests pin the TIMING change, not merely "hero-specialty cards exist
 * in combat".
 *
 * Tarnum VI (TARNUM_OVERLIMIT_SEARCH) is NOT re-pinned here: its end-to-end
 * combat behaviour is already pinned by conflux-tarnum-specialty.test.ts —
 * the two searches and the over-limit flag (:279), the free over-limit cast +
 * return-to-deck-top (:292), the return-to-discard choice (:356), the off-turn
 * play (:451), the reaction-window play (:618) and the Polish Spell Book routing
 * (:752, with a rule-off CONTROL).
 */

const T1 = "specialty.tarnum_conflux.1";
/** CONTROL: Torosar's Ballista IV — `timing: "map"`, never a combat play. */
const MAP_ONLY_SPECIALTY = "specialty.torosar.4";

const SPELL_PILE = ["spell.bless", "spell.lightning_bolt", "spell.fireball"];

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string) {
  return getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
  );
}

/**
 * A live combat with p1's Griffins active (their activation open) and a clean
 * shared Spell deck, so the Search reveals immediately.
 */
function tarnumCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [T1, MAP_ONLY_SPECIALTY];
  state.players.p2.hand = [];
  state.decks.spells.drawPile = [...SPELL_PILE];
  state.decks.spells.discardPile = [];
  // Keep the single-deck case deterministic (no basic/expert deck pick).
  if (state.decks["spells-expert"]) {
    state.decks["spells-expert"].drawPile = [];
    state.decks["spells-expert"].discardPile = [];
  }
  const griffins = state.combat!.units.unit_p1_griffins;
  griffins.activatedThisRound = false;
  griffins.movedThisActivation = false;
  griffins.attackedThisActivation = false;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

/** Play Tarnum I and drive any up-front deck pick down to the reveal. */
function openSearch(state: GameState): { searching: GameState; revealed: string } {
  const play = findPlay(state, T1);
  expect(play, "Tarnum I should be playable here").toBeTruthy();
  let searching = applyOk(state, play!.action);
  let guard = 4;
  while (searching.pendingChoice?.type === "OPTION_CHOICE" && guard-- > 0) {
    searching = applyOk(searching, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: searching.pendingChoice.id,
      optionIndex: 0
    });
  }
  expect(
    searching.pendingChoice?.type,
    "the Search must open immediately — never park on a reward queue"
  ).toBe("DECK_SEARCH");
  const choice = searching.pendingChoice;
  const revealed = choice?.type === "DECK_SEARCH" ? choice.revealedCardIds[0] : "";
  expect(revealed, "the Search should reveal a Spell").toBeTruthy();
  return { searching, revealed };
}

function keepRevealed(searching: GameState): GameState {
  const keep = getLegalActions(searching, "p1").find(
    (legal) => legal.action.type === "RESOLVE_DECK_SEARCH" && legal.action.pick.remove !== true
  );
  expect(keep, "the revealed Spell must be keepable").toBeTruthy();
  return applyOk(searching, keep!.action);
}

describe("Tarnum (Conflux) I — Search in COMBAT", () => {
  it("is offered on the owner's combat activation; a map-timed specialty is NOT (CONTROL)", () => {
    const state = tarnumCombat("tarnum-i-combat-offer");
    expect(findPlay(state, T1), "Tarnum I should be offered during combat").toBeTruthy();
    expect(
      findPlay(state, MAP_ONLY_SPECIALTY),
      "CONTROL: Ballista IV is still a MAP-timed specialty — never a combat play"
    ).toBeUndefined();
  });

  it("opens the Spell Search inside the fight, keeps the Spell into hand, and combat resumes", () => {
    const state = tarnumCombat("tarnum-i-combat-keep");
    const { searching, revealed } = openSearch(state);
    expect(searching.phase).toBe("choice");

    const after = keepRevealed(searching);
    expect(after.players.p1.hand).toContain(revealed);
    expect(after.decks.spells.drawPile).not.toContain(revealed);
    // The fight is intact: phase restored, the same unit still active.
    expect(after.pendingChoice).toBeNull();
    expect(after.phase).toBe("combat");
    expect(after.combat?.activeUnitId).toBe("unit_p1_griffins");
    // The specialty was spent.
    expect(after.players.p1.hand).not.toContain(T1);
  });

  it("still offers the printed Remove pick mid-combat", () => {
    const { searching, revealed } = openSearch(tarnumCombat("tarnum-i-combat-remove"));
    const remove = getLegalActions(searching, "p1").find(
      (legal) => legal.action.type === "RESOLVE_DECK_SEARCH" && legal.action.pick.remove === true
    );
    expect(remove, "Tarnum I keeps its allowRemove pick in combat").toBeTruthy();
    const after = applyOk(searching, remove!.action);
    expect(after.players.p1.hand).not.toContain(revealed);
    expect(after.decks.spells.drawPile).not.toContain(revealed);
    expect(after.decks.spells.discardPile).not.toContain(revealed);
    expect(after.phase).toBe("combat");
  });

  it("is STILL playable on the map exactly as before", () => {
    const state = createAdventureGameState({
      seed: "tarnum-i-map-still",
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
    state.players.p1.hand = [T1];
    state.decks.spells.drawPile = [...SPELL_PILE];
    state.decks.spells.discardPile = [];

    const { searching, revealed } = openSearch(state);
    const after = keepRevealed(searching);
    expect(after.players.p1.hand).toContain(revealed);
  });
});

describe("Tarnum (Conflux) I in combat — Polish Balance Pack reprint", () => {
  /**
   * The reprint is a whole-card substitution (polishBalanceCardLibrary), so it
   * inherits the printed timing: making the printed card an Instant makes the
   * reprint combat-playable too. Its own change — the dropped Remove pick —
   * must survive mid-combat.
   */
  function balanceCombat(seed: string, balance: boolean): GameState {
    const state = tarnumCombat(seed);
    state.adventure = {
      houseRules: { "polish-card-balance": balance }
    } as unknown as GameState["adventure"];
    return state;
  }

  it("the reprint is offered in combat and drops the Remove pick", () => {
    const { searching } = openSearch(balanceCombat("tarnum-i-combat-balance", true));
    const labels = getLegalActions(searching, "p1").map((legal) => legal.label);
    expect(labels.some((label) => /^Keep /.test(label))).toBe(true);
    expect(labels.some((label) => /^Remove /.test(label))).toBe(false);
  });

  it("CONTROL (rule OFF): the same combat Search still offers Remove", () => {
    const { searching } = openSearch(balanceCombat("tarnum-i-combat-balance-off", false));
    const labels = getLegalActions(searching, "p1").map((legal) => legal.label);
    expect(labels.some((label) => /^Remove /.test(label))).toBe(true);
  });
});

describe("Tarnum (Conflux) I in combat — Polish Spell Book routing", () => {
  /** The combat above, with `polish-spell-book` frozen on/off. */
  function combatWithBook(seed: string, polish: boolean): GameState {
    const state = tarnumCombat(seed);
    const rules = createAdventureGameState({
      seed: `${seed}-rules`,
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": polish }
    });
    state.adventure = rules.adventure;
    state.ruleset = "binh";
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = [];
    return state;
  }

  it("routes the Spell Searched in combat into the Spell Book, not the hand", () => {
    const { searching, revealed } = openSearch(combatWithBook("tarnum-i-combat-book", true));
    const after = keepRevealed(searching);
    expect(after.players.p1.spellBook ?? []).toContain(revealed);
    expect(after.players.p1.hand).not.toContain(revealed);
    expect(after.phase).toBe("combat");
  });

  it("CONTROL (rule OFF): the same combat Search puts the Spell in hand", () => {
    const { searching, revealed } = openSearch(combatWithBook("tarnum-i-combat-book-off", false));
    const after = keepRevealed(searching);
    expect(after.players.p1.hand).toContain(revealed);
    expect(after.players.p1.spellBook ?? []).not.toContain(revealed);
  });
});
