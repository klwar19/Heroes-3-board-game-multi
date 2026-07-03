import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "./index";
import { drawAstrologersCard, getMainHero, getTownOfPlayer, pvpAttacksBanned } from "./adventure";
import { openSharedDeckSearch, startPlayerCombat } from "./adventure-reducer";
import type { GameState } from "./state";

/**
 * Three newly-wired expansion Astrologers proclamations, engine-enforced end to
 * end (CLAUDE.md #1 — every assertion fails if its wiring is deleted, each with
 * a face-down / off-round CONTROL that diverges):
 *
 *   - Destruction (Stretch Goals): each player who has a permanent card in play
 *     must Remove it (OUT OF THE GAME, not the discard) and take 5 gold.
 *   - Sanctuary (Stretch Goals): during the drawn Astrologers round Heroes
 *     cannot attack one another — enforced at the PvP-combat chokepoint.
 *   - Spells (Conflux): when about to Search the Spell deck, Search(4) instead.
 */

/** Seeds `state.adventure.astrologers` with `activeCardId` face up. */
function setActiveProclamation(state: GameState, activeCardId: string): void {
  state.adventure!.astrologers = {
    activeCardId,
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: []
  };
}

// ===========================================================================
// Destruction — remove each holder's permanent (out of the game), pay 5 gold
// ===========================================================================

describe("Astrologers — Destruction (remove a permanent for 5 gold)", () => {
  function destructionGame(activeDraw = "astrologers.destruction"): GameState {
    const state = createAdventureGameState({ seed: "destruction", difficulty: "normal", rollFirstPlayer: false });
    state.decks.astrologers!.drawPile = [activeDraw];
    // p1 holds a permanent in play; p2 holds none.
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p1.permanent = null;
    state.players.p1.removed = [];
    state.players.p1.discard = [];
    state.players.p2.permanents = [];
    state.players.p2.permanent = null;
    return state;
  }

  it("removes the holder's permanent to the REMOVED pile and pays exactly 5 gold; a player without one is untouched", () => {
    const state = destructionGame();
    const p1GoldBefore = state.players.p1.resources.gold;
    const p2GoldBefore = state.players.p2.resources.gold;

    drawAstrologersCard(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.destruction");
    // "Remove" = out of the GAME (removed pile), never the discard pile.
    expect(state.players.p1.permanents).toEqual([]);
    expect(state.players.p1.removed).toContain("war_machine.ballista");
    expect(state.players.p1.discard).not.toContain("war_machine.ballista");
    // The observable outcome: p1 gained EXACTLY 5 gold (not just "some gold").
    expect(state.players.p1.resources.gold).toBe(p1GoldBefore + 5);
    // p2 had no permanent in play: no removal, and NO gold ("who HAS a permanent").
    expect(state.players.p2.resources.gold).toBe(p2GoldBefore);
  });

  it("CONTROL: does nothing while a different proclamation is face up", () => {
    const state = destructionGame("astrologers.dead_silence");
    const goldBefore = state.players.p1.resources.gold;

    drawAstrologersCard(state);

    expect(state.players.p1.permanents).toEqual(["war_machine.ballista"]);
    expect(state.players.p1.removed).not.toContain("war_machine.ballista");
    expect(state.players.p1.resources.gold).toBe(goldBefore);
  });
});

// ===========================================================================
// Sanctuary — Heroes cannot attack one another (the drawn round only)
// ===========================================================================

describe("Astrologers — Sanctuary (PvP-attack ban)", () => {
  function sanctuaryGame(round: number, activeCardId = "astrologers.sanctuary"): GameState {
    const state = createAdventureGameState({ seed: "sanctuary", difficulty: "normal", rollFirstPlayer: false });
    state.round = round;
    setActiveProclamation(state, activeCardId);
    return state;
  }

  it("rejects a Hero-vs-Hero attack outright on the drawn (even) round", () => {
    const state = sanctuaryGame(2);
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    expect(pvpAttacksBanned(state)).toBe(true);
    expect(() => startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0")).toThrow(/Sanctuary/);
    // The attack never happened: no combat was created.
    expect(state.combat).toBeNull();
  });

  it("CONTROL: the same attack proceeds while a different proclamation is up", () => {
    const state = sanctuaryGame(2, "astrologers.dead_silence");
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    expect(pvpAttacksBanned(state)).toBe(false);
    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    expect(state.combat?.context.kind).toBe("player");
  });

  it("'during this round' scoping: the ban lifts on the following (odd) Resource round though the card stays face up", () => {
    // Round 3 is the Resource round after the even Astrologers round the card was
    // drawn on — the card is still face up but the ban no longer applies.
    const state = sanctuaryGame(3);
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    expect(pvpAttacksBanned(state)).toBe(false);
    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    expect(state.combat?.context.kind).toBe("player");
  });

  it("literal 'Heroes cannot attack one another': capturing an undefended enemy garrison is NOT banned", () => {
    const state = sanctuaryGame(2);
    const attacker = getMainHero(state, "p1")!;
    const townField = getTownOfPlayer(state, "p2")!.fieldId!;
    expect(pvpAttacksBanned(state)).toBe(true);
    // defender = null (no enemy Hero present), garrisonDefenderId = "p2": a
    // town/garrison capture, which the printed wording does not cover.
    expect(() => startPlayerCombat(state, attacker, null, townField, "p2")).not.toThrow(/Sanctuary/);
    expect(state.combat?.defenderPlayerId).toBe("p2");
  });
});

// ===========================================================================
// Spells — Search(4) the Spell deck instead of the base size
// ===========================================================================

describe("Astrologers — Spells (widen a Spell-deck Search to 4)", () => {
  function spellsGame(activeCardId = "astrologers.spells"): GameState {
    const state = createAdventureGameState({ seed: "spells-widen", difficulty: "normal", rollFirstPlayer: false });
    setActiveProclamation(state, activeCardId);
    // p1 owns no spells / abilities and holds no Scouting, so a Search reveals
    // straight away (no scouting prompt, no discard-top / school-fetch branch).
    state.players.p1.deck = [];
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    state.decks.spells!.drawPile = ["spell.bless", "spell.haste", "spell.curse", "spell.slow", "spell.bloodlust"];
    state.decks.spells!.discardPile = [];
    state.decks.abilities!.drawPile = ["ability.luck", "ability.offense", "ability.tactics"];
    state.decks.abilities!.discardPile = [];
    return state;
  }

  function revealedCount(state: GameState): number {
    const choice = state.pendingChoice;
    return choice?.type === "DECK_SEARCH" ? choice.revealedCardIds.length : -1;
  }

  it("a base Search(1) of the Spell deck reveals 4 cards while Spells is face up", () => {
    const state = spellsGame();
    openSharedDeckSearch(state, "p1", "spells", 1);
    expect(revealedCount(state)).toBe(4);
  });

  it("CONTROL: without Spells face up, the same Search(1) reveals just 1", () => {
    const state = spellsGame("astrologers.dead_silence");
    openSharedDeckSearch(state, "p1", "spells", 1);
    expect(revealedCount(state)).toBe(1);
  });

  it("never SHRINKS an already-larger Search — Search(5) stays 5", () => {
    const state = spellsGame();
    state.decks.spells!.drawPile = [
      "spell.bless",
      "spell.haste",
      "spell.curse",
      "spell.slow",
      "spell.bloodlust",
      "spell.weakness"
    ];
    openSharedDeckSearch(state, "p1", "spells", 5);
    expect(revealedCount(state)).toBe(5);
  });

  it("gated to the Spell deck: an Abilities Search is NOT widened", () => {
    const state = spellsGame();
    openSharedDeckSearch(state, "p1", "abilities", 1);
    expect(revealedCount(state)).toBe(1);
  });
});
