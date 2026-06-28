import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./setup";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { processPendingVisit } from "./adventure";
import { openSharedDeckSearch, revealSharedDeckSearch } from "./adventure-reducer";
import { canAcquireSharedDeckCard } from "./ruleset";
import type { GameState } from "./state";
import {
  STARTING_ONLY_SPELLS,
  spellDeckBinhBasic,
  spellDeckBinhBasicUnique,
  spellDeckBinhExpert,
  spellDeckBinhExpertUnique,
  spellDeckLegacy
} from "@/data/cards/spells";
import { abilityDeckBinh, abilityDeckLegacy, abilityDeckUnique } from "@/data/cards/abilities-extra";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";

/**
 * House rules for pulling cards out of the shared Ability / Spell decks:
 *  - every deck holds exactly two copies of each card, so two players can each
 *    own one, while a single hero never keeps a duplicate (a duplicate reveal is
 *    redrawn past);
 *  - Necromancy is Necropolis-only — other factions never even draw it;
 *  - Magic Arrow is starting-only and is never in any shared deck.
 *
 * Each behaviour is engine-enforced below: delete the relevant guard in
 * `canAcquireSharedDeckCard` / `revealSharedDeckSearch` / `openSharedDeckSearch`
 * or the deck definitions and a test here fails.
 */

function countById(cardIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function expectExactlyTwoOfEach(deck: string[], unique: string[]): void {
  const counts = countById(deck);
  // Exactly the expected unique set, no more, no fewer.
  expect([...counts.keys()].sort()).toEqual([...unique].sort());
  for (const [id, count] of counts) {
    expect(count, `${id} should appear exactly twice`).toBe(2);
  }
}

describe("shared deck composition — two of each card", () => {
  it("ability decks hold exactly two copies of every ability", () => {
    expectExactlyTwoOfEach(abilityDeckLegacy, abilityDeckUnique);
    expectExactlyTwoOfEach(abilityDeckBinh, abilityDeckUnique);
  });

  it("spell decks hold exactly two copies of every spell", () => {
    expectExactlyTwoOfEach(spellDeckBinhBasic, spellDeckBinhBasicUnique);
    expectExactlyTwoOfEach(spellDeckBinhExpert, spellDeckBinhExpertUnique);
    expectExactlyTwoOfEach(spellDeckLegacy, [...spellDeckBinhBasicUnique, ...spellDeckBinhExpertUnique]);
  });

  it("holds at most ONE copy of each artifact — artifacts are globally unique", () => {
    // Unlike Spells/Abilities (two copies each), every artifact exists exactly
    // once in the whole game, so no deck may stock a duplicate.
    for (const deck of [artifactDeckLegacy, artifactDeckBinhMinor, artifactDeckBinhMajor, artifactDeckBinhRelic]) {
      for (const [id, count] of countById(deck)) {
        expect(count, `${id} should appear at most once`).toBe(1);
      }
    }
    // The BINH Minor/Major/Relic decks are disjoint, so the BINH set as a whole
    // also holds one of each (no artifact is reachable from two decks at once).
    const binhAll = [...artifactDeckBinhMinor, ...artifactDeckBinhMajor, ...artifactDeckBinhRelic];
    expect(new Set(binhAll).size).toBe(binhAll.length);
  });

  it("never shuffles a starting-only spell (Magic Arrow) into any shared deck", () => {
    for (const startingOnly of STARTING_ONLY_SPELLS) {
      expect(spellDeckLegacy).not.toContain(startingOnly);
      expect(spellDeckBinhBasic).not.toContain(startingOnly);
      expect(spellDeckBinhExpert).not.toContain(startingOnly);
    }
    expect(STARTING_ONLY_SPELLS).toContain("spell.magic_arrow");
  });
});

describe("canAcquireSharedDeckCard — the acquisition gate", () => {
  it("rejects a card the hero already owns, accepts one it does not", () => {
    const state = createInitialGameState("acq-dup");
    state.players.p1.deck = ["ability.archery"];
    state.players.p1.hand = [];
    state.players.p1.discard = [];

    expect(canAcquireSharedDeckCard(state, "p1", "abilities", "ability.archery")).toBe(false);
    expect(canAcquireSharedDeckCard(state, "p1", "abilities", "ability.luck")).toBe(true);
  });

  it("rejects Necromancy for a non-Necropolis hero and allows it for Necropolis", () => {
    const state = createInitialGameState("acq-necro");
    // p1 is Castle in the sandbox, p2 is Necropolis.
    expect(state.players.p1.factionId).not.toBe("necropolis");
    expect(state.players.p2.factionId).toBe("necropolis");

    expect(canAcquireSharedDeckCard(state, "p1", "abilities", "ability.necromancy")).toBe(false);
    expect(canAcquireSharedDeckCard(state, "p2", "abilities", "ability.necromancy")).toBe(true);
  });

  it("treats artifacts as globally unique — rejects one ANY player owns (spells stay per-player)", () => {
    const state = createInitialGameState("acq-artifact-global");
    for (const id of ["p1", "p2"] as const) {
      state.players[id].hand = [];
      state.players[id].deck = [];
      state.players[id].discard = [];
    }
    // p2 owns the artifact; p1 may NOT take a second copy (none exists).
    state.players.p2.hand = ["artifact.angel_wings"];
    expect(canAcquireSharedDeckCard(state, "p1", "artifacts", "artifact.angel_wings")).toBe(false);
    // An artifact NO player owns is freely acquirable.
    expect(canAcquireSharedDeckCard(state, "p1", "artifacts", "artifact.boots_of_speed")).toBe(true);

    // CONTROL: a SPELL owned by another player is STILL acquirable by p1 — the
    // per-player rule (two copies in the deck, one per player) is unchanged. This
    // is exactly what diverges between the two card kinds.
    state.players.p2.hand = ["spell.haste"];
    expect(canAcquireSharedDeckCard(state, "p1", "spells", "spell.haste")).toBe(true);
  });

  it("never lets any hero draw a starting-only spell", () => {
    const state = createInitialGameState("acq-arrow");
    state.players.p1.deck = [];
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    expect(canAcquireSharedDeckCard(state, "p1", "spells", "spell.magic_arrow")).toBe(false);
  });
});

describe("revealSharedDeckSearch — redraws past cards the hero may not take", () => {
  function freshState(seed: string) {
    const state = createInitialGameState(seed);
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    return state;
  }

  it("skips a duplicate of an ability the hero owns and reveals the next card", () => {
    const state = freshState("reveal-dup");
    state.players.p1.deck = ["ability.archery"]; // p1 already owns Archery
    // pop() takes the last element, so Archery is the top card.
    state.decks.abilities.drawPile = ["ability.luck", "ability.archery"];
    state.decks.abilities.discardPile = [];

    revealSharedDeckSearch(state, "p1", "abilities", 1);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toEqual(["ability.luck"]);
    }
    // The skipped duplicate is tucked back under the deck, never discarded.
    expect(state.decks.abilities.discardPile).toEqual([]);
    expect(state.decks.abilities.drawPile).toEqual(["ability.archery"]);
  });

  it("skips Necromancy for a non-Necropolis hero", () => {
    const state = freshState("reveal-necro");
    state.players.p1.deck = [];
    state.decks.abilities.drawPile = ["ability.offense", "ability.necromancy"];
    state.decks.abilities.discardPile = [];

    revealSharedDeckSearch(state, "p1", "abilities", 1);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toEqual(["ability.offense"]);
    }
    expect(state.decks.abilities.discardPile).toEqual([]);
    expect(state.decks.abilities.drawPile).toEqual(["ability.necromancy"]);
  });

  it("lets a Necropolis hero reveal Necromancy", () => {
    const state = createInitialGameState("reveal-necro-ok");
    state.activePlayerId = "p2";
    state.players.p2.hand = [];
    state.players.p2.deck = [];
    state.players.p2.discard = [];
    state.decks.abilities.drawPile = ["ability.necromancy"];
    state.decks.abilities.discardPile = [];

    revealSharedDeckSearch(state, "p2", "abilities", 1);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toEqual(["ability.necromancy"]);
    }
    expect(state.decks.abilities.discardPile).toEqual([]);
  });

  it("never reveals two of the same card in a single search", () => {
    const state = freshState("reveal-no-twins");
    state.players.p1.deck = [];
    // Top two are both Luck; only one should be revealed, the rest fills from
    // the next distinct card (Offense).
    state.decks.abilities.drawPile = ["ability.offense", "ability.luck", "ability.luck"];
    state.decks.abilities.discardPile = [];

    revealSharedDeckSearch(state, "p1", "abilities", 2);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toEqual(["ability.luck", "ability.offense"]);
      // No duplicates among the revealed cards.
      expect(new Set(choice.revealedCardIds).size).toBe(choice.revealedCardIds.length);
    }
    // The skipped second copy of Luck is tucked back under the deck, not discarded.
    expect(state.decks.abilities.discardPile).toEqual([]);
    expect(state.decks.abilities.drawPile).toEqual(["ability.luck"]);
  });

  it("skips a duplicate spell the hero owns", () => {
    const state = freshState("reveal-spell-dup");
    state.players.p1.deck = ["spell.haste"]; // p1 already owns Haste
    state.decks.spells.drawPile = ["spell.bless", "spell.haste"];
    state.decks.spells.discardPile = [];

    revealSharedDeckSearch(state, "p1", "spells", 1);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toEqual(["spell.bless"]);
    }
    expect(state.decks.spells.discardPile).toEqual([]);
    expect(state.decks.spells.drawPile).toEqual(["spell.haste"]);
  });

  it("skips an artifact ANOTHER player owns (artifacts are globally unique)", () => {
    const state = freshState("reveal-artifact-global");
    // p2 owns Angel Wings — globally unique, so p1's Search must redraw past it
    // even though p1 owns none of it. (The deck normally never holds a copy a
    // player owns; seeding it here proves the gate, not just the deck's makeup.)
    state.players.p2.hand = ["artifact.angel_wings"];
    state.players.p2.deck = [];
    state.players.p2.discard = [];
    const deck = state.decks["artifacts-minor"];
    deck.drawPile = ["artifact.boots_of_speed", "artifact.angel_wings"];
    deck.discardPile = [];

    revealSharedDeckSearch(state, "p1", "artifacts-minor", 1);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toEqual(["artifact.boots_of_speed"]);
    }
    // The off-limits artifact is tucked back under the deck, never handed over.
    expect(deck.discardPile).toEqual([]);
    expect(deck.drawPile).toEqual(["artifact.angel_wings"]);
  });
});

describe("revealSharedDeckSearch — reshuffles a depleted deck instead of softlocking", () => {
  it("draw pile empty (cards in discard): reshuffles, reveals, and the player can keep one", () => {
    const state = createAdventureGameState({ seed: "reshuffle-search", difficulty: "easy", rollFirstPlayer: false });
    const deck = state.decks.abilities!;
    // The normal state after enough Searches: the draw pile is empty, every card
    // sits in the discard (the rest of each Search is discarded there).
    deck.discardPile = [...deck.discardPile, ...deck.drawPile];
    deck.drawPile = [];
    const stash = deck.discardPile.length;
    expect(stash).toBeGreaterThan(0);

    revealSharedDeckSearch(state, "p1", "abilities", 2);

    // It reshuffled the discard into the draw pile and revealed real cards…
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    const revealed = state.pendingChoice?.type === "DECK_SEARCH" ? state.pendingChoice.revealedCardIds.length : 0;
    expect(revealed).toBeGreaterThan(0);
    expect(deck.discardPile.length).toBeLessThan(stash);
    // …so the player has cards to keep — not a softlocked, empty modal.
    const picks = getLegalActions(state, "p1").filter((entry) => entry.action.type === "RESOLVE_DECK_SEARCH");
    expect(picks.length).toBe(revealed);
  });

  it("no takeable card anywhere: opens no dead choice and hands the turn back (no softlock)", () => {
    const state = createAdventureGameState({ seed: "reshuffle-none", difficulty: "easy", rollFirstPlayer: false });
    const deck = state.decks.abilities!;
    const owned = deck.drawPile[0] ?? deck.discardPile[0]!;
    state.players.p1.hand = [owned]; // the hero already owns the only card the deck holds
    deck.drawPile = [];
    deck.discardPile = [owned];

    revealSharedDeckSearch(state, "p1", "abilities", 2);

    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("player-turn");
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });
});

describe("openSharedDeckSearch — the take-the-top-discard branch", () => {
  function freshState(seed: string) {
    const state = createInitialGameState(seed);
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    return state;
  }

  it("offers the take-discard option when the top discard is acquirable", () => {
    const state = freshState("discard-ok");
    state.decks.abilities.drawPile = ["ability.luck"];
    state.decks.abilities.discardPile = ["ability.offense"];

    openSharedDeckSearch(state, "p1", "abilities", 2);

    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      expect(state.pendingChoice.context).toBe("deck-search-mode");
      expect(state.pendingChoice.options).toHaveLength(2);
    }
  });

  it("hides the take-discard option when the top discard is a duplicate the hero owns", () => {
    const state = freshState("discard-dup");
    state.players.p1.deck = ["ability.offense"]; // owns the discard top
    state.decks.abilities.drawPile = ["ability.luck"];
    state.decks.abilities.discardPile = ["ability.offense"];

    openSharedDeckSearch(state, "p1", "abilities", 1);

    // No take option — it goes straight to a reveal (and the revealed card is the
    // acquirable Luck, not the off-limits Offense).
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type === "DECK_SEARCH") {
      expect(state.pendingChoice.revealedCardIds).toEqual(["ability.luck"]);
    }
  });
});

describe("Scouting prompt — a held Scouting offers to boost every shared-deck Search", () => {
  function freshState(seed: string) {
    const state = createInitialGameState(seed);
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    return state;
  }

  function choose(state: GameState, optionIndex: number): GameState {
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error(`expected an OPTION_CHOICE, got ${choice?.type ?? "none"}`);
    }
    const result = applyAction(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex });
    expect(result.errors).toEqual([]);
    return result.state;
  }

  // Five distinct, acquirable Castle abilities (p1's deck is empty, so it owns
  // none of them and never redraws past one) — enough to reveal up to five.
  const fiveAbilities = [
    "ability.offense",
    "ability.armorer",
    "ability.archery",
    "ability.resistance",
    "ability.leadership"
  ];

  it("pops up a 'use Scouting?' choice before a Search (2) when a Scouting is held", () => {
    const state = freshState("scout-prompt");
    state.players.p1.hand = ["ability.scouting"];
    state.players.p1.limits = { ...state.players.p1.limits, expertUses: 0 }; // no crown → no Expert option
    state.decks.abilities.drawPile = [...fiveAbilities];
    state.decks.abilities.discardPile = [];

    openSharedDeckSearch(state, "p1", "abilities", 2);

    // The instant pop-up: decline + the basic play (Expert hidden, no crown).
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the Scouting prompt");
    }
    expect(state.pendingChoice.context).toBe("scouting-prompt");
    expect(state.pendingChoice.options).toHaveLength(2);
    expect(state.pendingChoice.options[0].label).toMatch(/don't use Scouting/i);
    expect(state.pendingChoice.options[1].label).toMatch(/Search \(3\)/);
  });

  it("playing basic Scouting from the prompt reveals THREE cards and spends the card", () => {
    const state = freshState("scout-use-basic");
    state.players.p1.hand = ["ability.scouting"];
    state.players.p1.limits = { ...state.players.p1.limits, expertUses: 0 };
    state.decks.abilities.drawPile = [...fiveAbilities];
    state.decks.abilities.discardPile = [];

    openSharedDeckSearch(state, "p1", "abilities", 2);
    const after = choose(state, 1); // play basic Scouting

    expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    if (after.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected a DECK_SEARCH choice");
    }
    expect(after.pendingChoice.revealedCardIds).toHaveLength(3);
    expect(after.players.p1.hand).not.toContain("ability.scouting");
    expect(after.players.p1.discard).toContain("ability.scouting");
    expect(after.eventLog.some((event) => event.type === "CARD_PLAYED" && event.cardId === "ability.scouting")).toBe(
      true
    );
  });

  it("declining the prompt reveals only the base count and keeps the card", () => {
    const state = freshState("scout-decline");
    state.players.p1.hand = ["ability.scouting"];
    state.players.p1.limits = { ...state.players.p1.limits, expertUses: 0 };
    state.decks.abilities.drawPile = [...fiveAbilities];
    state.decks.abilities.discardPile = [];

    openSharedDeckSearch(state, "p1", "abilities", 2);
    const after = choose(state, 0); // decline

    expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    if (after.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected a DECK_SEARCH choice");
    }
    expect(after.pendingChoice.revealedCardIds).toHaveLength(2);
    expect(after.players.p1.hand).toContain("ability.scouting");
  });

  it("no prompt at all when no Scouting is held (control)", () => {
    const state = freshState("scout-none");
    state.decks.abilities.drawPile = [...fiveAbilities];
    state.decks.abilities.discardPile = [];

    openSharedDeckSearch(state, "p1", "abilities", 2);

    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected a DECK_SEARCH choice");
    }
    expect(state.pendingChoice.revealedCardIds).toHaveLength(2);
  });

  it("offers an Expert (Search 5) option when a crown is affordable, spending it on use", () => {
    const state = freshState("scout-expert");
    state.players.p1.hand = ["ability.scouting"];
    state.players.p1.limits = { ...state.players.p1.limits, expertUses: 1 };
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.decks.abilities.drawPile = [...fiveAbilities];
    state.decks.abilities.discardPile = [];

    openSharedDeckSearch(state, "p1", "abilities", 2);
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the Scouting prompt");
    }
    // decline + basic (Search 3) + expert (Search 5)
    expect(state.pendingChoice.options).toHaveLength(3);
    expect(state.pendingChoice.options[2].label).toMatch(/Search \(5\).*crown/i);

    const after = choose(state, 2); // play Expert Scouting
    expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    if (after.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected a DECK_SEARCH choice");
    }
    expect(after.pendingChoice.revealedCardIds).toHaveLength(5);
    expect(after.players.p1.combatStats.expertUsesSpentThisRound).toBe(1); // crown spent
    expect(after.players.p1.discard).toContain("ability.scouting");
  });

  it("prompts on a Spell Search too (any shared deck), not just abilities", () => {
    const state = freshState("scout-spell");
    state.players.p1.hand = ["ability.scouting"];
    state.players.p1.limits = { ...state.players.p1.limits, expertUses: 0 };
    state.decks.spells.drawPile = ["spell.haste", "spell.bloodlust", "spell.stone_skin", "spell.curse"];
    state.decks.spells.discardPile = [];

    openSharedDeckSearch(state, "p1", "spells", 2);
    const after = choose(state, 1); // play basic Scouting

    expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    if (after.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected a DECK_SEARCH choice");
    }
    expect(after.pendingChoice.revealedCardIds).toHaveLength(3);
    expect(after.players.p1.discard).toContain("ability.scouting");
  });

  it("no prompt when even Expert Scouting could not improve the Search (base ≥ 5)", () => {
    const state = freshState("scout-big");
    state.players.p1.hand = ["ability.scouting"];
    state.players.p1.limits = { ...state.players.p1.limits, expertUses: 1 };
    state.decks.abilities.drawPile = [...fiveAbilities];
    state.decks.abilities.discardPile = [];

    openSharedDeckSearch(state, "p1", "abilities", 5);

    // Neither basic (3) nor Expert (5) beats a Search (5): go straight to reveal,
    // card untouched.
    expect(state.players.p1.hand).toContain("ability.scouting");
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type === "DECK_SEARCH") {
      expect(state.pendingChoice.revealedCardIds).toHaveLength(5);
    }
  });

  it("does not prompt or burn the card when an override was already pre-played", () => {
    const state = freshState("scout-manual-expert");
    state.players.p1.hand = ["ability.scouting"];
    state.decks.abilities.drawPile = [...fiveAbilities];
    state.decks.abilities.discardPile = [];
    // A pre-played Expert Scouting (Search 5) already sits as an active effect.
    state.activeEffects.push({
      id: "effect_expert_scouting",
      name: "Expert Scouting",
      scope: "player",
      duration: { type: "current-turn" },
      polarity: "positive",
      removable: false,
      modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 5 }],
      source: { type: "system" },
      controllerId: "p1",
      startedRound: state.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });

    openSharedDeckSearch(state, "p1", "abilities", 2);

    // The pre-played override (5) is used; the held card is untouched, no prompt.
    expect(state.players.p1.hand).toContain("ability.scouting");
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type === "DECK_SEARCH") {
      expect(state.pendingChoice.revealedCardIds).toHaveLength(5);
    }
  });
});

describe("Witch Hut — hands out an Ability under the same rules", () => {
  function witchHutState(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ],
      rollFirstPlayer: false
    });
    state.pendingChoice = null;
    state.activePlayerId = "p1";
    const heroId = Object.values(state.heroes).find((hero) => hero.controllerId === "p1")!.id;
    const fieldId = Object.keys(state.adventure!.fields)[0];
    state.adventure!.pendingVisit = { heroId, playerId: "p1", fieldId, steps: [{ type: "WITCH_HUT" }] };
    return state;
  }

  it("revealing the top discards cards the hero may not take (duplicate / Necromancy)", () => {
    const state = witchHutState("witch-reveal");
    state.players.p1.deck = ["ability.archery"]; // already owns Archery
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    // Top of the deck (last element) is the owned Archery, then Necromancy
    // (Castle can't take it), then the acquirable Luck underneath.
    state.decks.abilities.drawPile = ["ability.luck", "ability.necromancy", "ability.archery"];
    state.decks.abilities.discardPile = [];

    processPendingVisit(state);

    // Only the acquirable Luck is left on top; the two off-limits cards were binned.
    expect(state.decks.abilities.drawPile.at(-1)).toBe("ability.luck");
    expect(state.decks.abilities.discardPile).toEqual(["ability.archery", "ability.necromancy"]);
  });

  it("taking the card never hands the hero a duplicate or Necromancy", () => {
    const state = witchHutState("witch-take");
    state.players.p1.deck = ["ability.archery"];
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    state.decks.abilities.drawPile = ["ability.luck", "ability.necromancy", "ability.archery"];
    state.decks.abilities.discardPile = [];

    const take = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === 0
    );
    expect(take, "the Witch Hut take option should be offered").toBeTruthy();

    const result = applyAction(state, take!.action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);

    expect(result.state.players.p1.hand).toContain("ability.luck");
    expect(result.state.players.p1.hand).not.toContain("ability.archery");
    expect(result.state.players.p1.hand).not.toContain("ability.necromancy");
  });
});
