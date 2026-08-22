import { describe, expect, it } from "vitest";
import {
  BATTLEFIELD_ONLY_MORALE_CARD_IDS,
  MORALE_CARD_IDS,
  MORALE_NEGATIVE_DECK_ID,
  MORALE_POSITIVE_DECK_ID,
  moraleCardDefinitions,
  moraleNegativeDeckCardIds,
  moralePositiveDeckCardIds
} from "@/data/cards/morale";
import { applyAction, changeMorale, createAdventureGameState, getLegalActions, getMainHero, getPlayerView } from "./index";
import { openSharedDeckSearch } from "./adventure-reducer";
import { processPendingVisit } from "./adventure";
import { ATTACK_DIE_FACES } from "./battlefield";
import { placeCombatToken } from "./tokens";
import type { CombatState, CombatUnitState, GameAction, GameState, MapFieldState, PlayerId } from "./state";

/**
 * Behaviour of every engine-wired Morale card (optional Morale Cards rule).
 * Each spec asserts the observable game outcome (damage moved, dice rolled,
 * cards revealed, activation skipped …) with a CONTROL where the same scene
 * without the card diverges — so a test fails if the wiring is removed OR the
 * effect goes wrong, per CLAUDE.md rule #1a.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    moraleCards: true,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ]
  });
}

function injectField(state: GameState, spaceId = "99,99"): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location: "empty_field",
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

function unit(
  over: Partial<CombatUnitState> & { id: string; controllerId: PlayerId; armyUnitId: string }
): CombatUnitState {
  return {
    name: "Pikemen",
    cardName: "Few Pikemen",
    variant: "few",
    grade: "bronze",
    type: "ground",
    attack: 3,
    defense: 1,
    maxHealth: 6,
    damage: 0,
    initiative: 1,
    position: 5,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    unitDefId: "castle.pikemen",
    assets: { cardImage: "", imageAlt: "" },
    ...over
  } as CombatUnitState;
}

/**
 * A live hand-built PvP combat: p1's attacker (active, position 5) adjacent to
 * p2's defender (position 6). Empty hands on both sides keep every reaction
 * window shut, so an ATTACK_UNIT runs straight into the die roll.
 */
function stageCombat(
  state: GameState,
  overrides: { attacker?: Partial<CombatUnitState>; defender?: Partial<CombatUnitState> } = {}
): GameState {
  const attackerHero = getMainHero(state, "p1")!;
  const defenderHero = getMainHero(state, "p2")!;
  const field = injectField(state);
  attackerHero.spaceId = field.spaceId;
  defenderHero.spaceId = field.spaceId;
  state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];
  state.players.p2.army = [{ id: "b1", unitDefId: "castle.pikemen", side: "few" }];
  state.players.p1.hand = [];
  state.players.p2.hand = [];

  state.combat = {
    id: "c1",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    activeUnitId: "a1",
    context: {
      kind: "player",
      attackerHeroId: attackerHero.id,
      defenderHeroId: defenderHero.id,
      fieldId: field.spaceId
    },
    setup: null,
    awaitingContinue: false,
    outcome: null,
    obstacles: [],
    dice: { faces: [...ATTACK_DIE_FACES], seed: "morale-dice", rollCount: 0 },
    units: {
      a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1", position: 5, ...overrides.attacker }),
      b1: unit({ id: "b1", controllerId: "p2", armyUnitId: "b1", position: 6, ...overrides.defender })
    }
  } as CombatState;
  state.phase = "combat";
  state.activePlayerId = "p1";
  return state;
}

function holdNegative(state: GameState, playerId: PlayerId, cardId: string): void {
  state.players[playerId].moraleCards ??= { positive: [], negative: [] };
  state.players[playerId].moraleCards!.negative.push(cardId);
}

function holdPositive(state: GameState, playerId: PlayerId, cardId: string): void {
  state.players[playerId].moraleCards ??= { positive: [], negative: [] };
  state.players[playerId].moraleCards!.positive.push(cardId);
}

// Isolate a Spell-deck Search from the first-round face-up seed on the Spell
// discards, so the Search opens straight onto its DECK_SEARCH reveal instead of
// the incidental "Search, or take the top discard?" mode prompt.
function clearSpellDiscardSeed(state: GameState): void {
  state.decks.spells.discardPile = [];
  if (state.decks["spells-expert"]) {
    state.decks["spells-expert"].discardPile = [];
  }
}

function attack(state: GameState): GameState {
  return apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "a1", defenderId: "b1" });
}

/**
 * The staged attacker's own roll — never the defender's follow-up Retaliation
 * Attack, which also logs an ATTACK_ROLLED event right after it.
 */
function lastAttackRoll(state: GameState, attackerId = "a1") {
  const event = [...state.eventLog]
    .reverse()
    .find((entry) => entry.type === "ATTACK_ROLLED" && entry.attackerId === attackerId && !entry.isRetaliation);
  expect(event, "an ATTACK_ROLLED event").toBeTruthy();
  return event as Extract<(typeof state.eventLog)[number], { type: "ATTACK_ROLLED" }>;
}

function keepPendingRoll(state: GameState): GameState {
  const choice = state.pendingChoice;
  if (choice?.type !== "ATTACK_DIE_REROLL") {
    return state;
  }
  return apply(state, {
    type: "CHOOSE_PENDING_ROLL",
    playerId: choice.playerId,
    choiceId: choice.id,
    candidateIndex: choice.candidates.length - 1
  });
}

// ---------------------------------------------------------------------------
// Deck composition — the Battlefield-Symbol cards never enter regular decks
// ---------------------------------------------------------------------------

describe("Morale deck composition (regular games)", () => {
  it("excludes both Battlefield-Symbol cards from the shuffled decks", () => {
    for (const cardId of BATTLEFIELD_ONLY_MORALE_CARD_IDS) {
      expect(moralePositiveDeckCardIds).not.toContain(cardId);
      expect(moraleNegativeDeckCardIds).not.toContain(cardId);
      // The definitions stay (the scans are real cards), explicitly inert.
      expect(moraleCardDefinitions[cardId]?.implementationStatus).toBe("not-implemented");
    }
    const state = makeGame("morale-deck-composition");
    const positive = state.decks[MORALE_POSITIVE_DECK_ID];
    const negative = state.decks[MORALE_NEGATIVE_DECK_ID];
    expect(positive.drawPile).toHaveLength(9);
    expect(negative.drawPile).toHaveLength(8);
    for (const cardId of BATTLEFIELD_ONLY_MORALE_CARD_IDS) {
      expect(positive.drawPile).not.toContain(cardId);
      expect(negative.drawPile).not.toContain(cardId);
    }
  });

  it("every card shuffled into a morale deck is engine-implemented", () => {
    for (const cardId of [...moralePositiveDeckCardIds, ...moraleNegativeDeckCardIds]) {
      expect(moraleCardDefinitions[cardId], `${cardId} has a definition`).toBeTruthy();
      expect(moraleCardDefinitions[cardId].implementationStatus, `${cardId} is implemented`).toBe("implemented");
    }
  });
});

// ---------------------------------------------------------------------------
// Gain flow — absorption and the under-the-deck recycle loop
// ---------------------------------------------------------------------------

describe("Morale card gains (rulebook flow)", () => {
  it("a Negative gain is absorbed by discarding a held Positive card instead of drawing", () => {
    const state = makeGame("morale-absorb");
    holdPositive(state, "p1", MORALE_CARD_IDS.rerollDie);
    const negativeBefore = state.decks[MORALE_NEGATIVE_DECK_ID].drawPile.length;

    changeMorale(state, "p1", -1);

    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    // The absorbed Positive card went under its own deck; no Negative was drawn.
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.rerollDie);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile).toHaveLength(negativeBefore);
  });

  it("CONTROL: with no Positive card held the same Negative gain draws a Negative card", () => {
    const state = makeGame("morale-absorb-control");
    const negativeBefore = state.decks[MORALE_NEGATIVE_DECK_ID].drawPile.length;

    changeMorale(state, "p1", -1);

    expect(state.players.p1.moraleCards?.negative).toHaveLength(1);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile).toHaveLength(negativeBefore - 1);
  });

  it("a -2 swing absorbs one Positive card, then draws one Negative card", () => {
    const state = makeGame("morale-absorb-two");
    holdPositive(state, "p1", MORALE_CARD_IDS.redrawHand);

    changeMorale(state, "p1", -2);

    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.players.p1.moraleCards?.negative).toHaveLength(1);
  });

  it("cancelling a Negative card with a Positive gain puts it under the Negative deck", () => {
    const state = makeGame("morale-cancel-bottom");
    holdNegative(state, "p1", MORALE_CARD_IDS.searchOne);

    changeMorale(state, "p1", 1);

    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.searchOne);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].discardPile).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Search cards
// ---------------------------------------------------------------------------

describe("Negative Morale: Search One", () => {
  it("turns the next Search (3) into a Search (1) and resolves the card", () => {
    const state = makeGame("morale-search-one");
    holdNegative(state, "p1", MORALE_CARD_IDS.searchOne);
    clearSpellDiscardSeed(state);

    openSharedDeckSearch(state, "p1", "spells", 3);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toHaveLength(1);
    }
    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.searchOne);
  });

  it("is not triggered by a Search (1) — the card stays face-up", () => {
    const state = makeGame("morale-search-one-exempt");
    holdNegative(state, "p1", MORALE_CARD_IDS.searchOne);
    clearSpellDiscardSeed(state);

    openSharedDeckSearch(state, "p1", "spells", 1);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toHaveLength(1);
    }
    expect(state.players.p1.moraleCards?.negative).toEqual([MORALE_CARD_IDS.searchOne]);
  });

  it("CONTROL: without the card the same Search reveals all 3", () => {
    const state = makeGame("morale-search-one-control");
    clearSpellDiscardSeed(state);
    openSharedDeckSearch(state, "p1", "spells", 3);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toHaveLength(3);
    }
  });
});

describe("Positive Morale: Repeat Search", () => {
  function resolveSearch(state: GameState): GameState {
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type !== "DECK_SEARCH") {
      return state;
    }
    return apply(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: choice.id,
      pick: { kind: "revealed", index: 0 }
    });
  }

  it("offers to discard the gained card and perform the Search (2) again", () => {
    let state = makeGame("morale-repeat-search");
    holdPositive(state, "p1", MORALE_CARD_IDS.repeatSearch);
    state.players.p1.hand = [];
    clearSpellDiscardSeed(state);
    openSharedDeckSearch(state, "p1", "spells", 2);
    const searchChoice = state.pendingChoice;
    const gained = searchChoice?.type === "DECK_SEARCH" ? searchChoice.revealedCardIds[0] : "";

    state = resolveSearch(state);
    expect(state.players.p1.hand).toContain(gained);

    const offer = state.pendingChoice;
    expect(offer?.type).toBe("OPTION_CHOICE");
    if (offer?.type !== "OPTION_CHOICE") {
      return;
    }
    expect(offer.context).toBe("morale-repeat-search");

    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: offer.id, optionIndex: 0 });

    // The gained card was discarded and the morale card resolved.
    expect(state.players.p1.hand).not.toContain(gained);
    expect(state.players.p1.discard).toContain(gained);
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.repeatSearch);

    // The SAME Search (2) runs again. The first search's leftover now sits in
    // the spells discard pile, so the re-run correctly opens the standard
    // Search-or-take-discard-top mode prompt first — commit to Searching.
    const mode = state.pendingChoice;
    expect(mode?.type === "OPTION_CHOICE" ? mode.context : mode?.type).toBe("deck-search-mode");
    if (mode?.type === "OPTION_CHOICE") {
      state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: mode.id, optionIndex: 0 });
    }
    const repeat = state.pendingChoice;
    expect(repeat?.type).toBe("DECK_SEARCH");
    if (repeat?.type === "DECK_SEARCH") {
      expect(repeat.revealedCardIds).toHaveLength(2);
    }
  });

  it("declining keeps both the gained card and the morale card", () => {
    let state = makeGame("morale-repeat-decline");
    holdPositive(state, "p1", MORALE_CARD_IDS.repeatSearch);
    state.players.p1.hand = [];
    clearSpellDiscardSeed(state);
    openSharedDeckSearch(state, "p1", "spells", 2);
    state = resolveSearch(state);
    const offer = state.pendingChoice;
    expect(offer?.type === "OPTION_CHOICE" ? offer.context : null).toBe("morale-repeat-search");
    if (offer?.type !== "OPTION_CHOICE") {
      return;
    }

    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: offer.id, optionIndex: 1 });

    expect(state.players.p1.hand).toHaveLength(1);
    expect(state.players.p1.moraleCards?.positive).toEqual([MORALE_CARD_IDS.repeatSearch]);
    expect(state.pendingChoice).toBeNull();
  });

  it("CONTROL: without the card a resolved Search opens no offer", () => {
    let state = makeGame("morale-repeat-control");
    clearSpellDiscardSeed(state);
    openSharedDeckSearch(state, "p1", "spells", 2);
    state = resolveSearch(state);
    expect(state.pendingChoice).toBeNull();
  });

  it("masks the gained card from other viewers (closed-room privacy)", () => {
    let state = makeGame("morale-repeat-mask");
    holdPositive(state, "p1", MORALE_CARD_IDS.repeatSearch);
    state.players.p1.hand = [];
    clearSpellDiscardSeed(state);
    openSharedDeckSearch(state, "p1", "spells", 2);
    const searchChoice = state.pendingChoice;
    const gained = searchChoice?.type === "DECK_SEARCH" ? searchChoice.revealedCardIds[0] : "";
    state = resolveSearch(state);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : null).toBe(
      "morale-repeat-search"
    );

    // The searcher sees the card by name; an opponent sees the offer exists
    // but never which card the Search gained (it went to a private hand).
    const own = getPlayerView(state, "p1").pendingChoice;
    expect(own?.type === "OPTION_CHOICE" ? JSON.stringify(own) : "").toContain(gained);
    const other = getPlayerView(state, "p2").pendingChoice;
    expect(other?.type).toBe("OPTION_CHOICE");
    if (other?.type === "OPTION_CHOICE") {
      expect(JSON.stringify(other)).not.toContain(gained);
      expect(other.options.every((option) => option.label === "Hidden card")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Attack-die cards (hand-built PvP combat; attacker 3/1 vs defender 3/1/6hp)
// ---------------------------------------------------------------------------

describe("Negative Morale: Set Attack Die -1", () => {
  it("sets the holder's next Attack die to -1 (a rolled +1 becomes -1) and resolves", () => {
    let state = stageCombat(makeGame("morale-set-minus"));
    holdNegative(state, "p1", MORALE_CARD_IDS.setAttackDieMinus);
    state.combat!.dice.scriptedRolls = [1];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    expect(rolled.roll).toBe(-1);
    // attack 3 - 1 (die) vs defense 1 → 1 damage instead of the control's 3.
    expect(rolled.damage).toBe(1);
    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.setAttackDieMinus);
  });

  it("CONTROL: the same scripted +1 stands without the card", () => {
    let state = stageCombat(makeGame("morale-set-minus-control"));
    state.combat!.dice.scriptedRolls = [1];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    expect(rolled.roll).toBe(1);
    expect(rolled.damage).toBe(3);
  });
});

describe("Negative Morale: Reroll +1", () => {
  it("forcibly rerolls the holder's +1 Attack die and resolves the card", () => {
    let state = stageCombat(makeGame("morale-reroll-plus"));
    holdNegative(state, "p1", MORALE_CARD_IDS.rerollPlusOne);
    state.combat!.dice.scriptedRolls = [1, 0];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    expect(rolled.roll).toBe(0);
    expect(rolled.damage).toBe(2);
    // The reroll carries its overlay-replay payload: the "+1" (die 0) that was
    // thrown away and the face it landed on — same channel the Hourglass uses.
    expect(rolled.rerollBeats).toEqual([{ index: 0, from: 1, to: 0 }]);
    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.rerollPlusOne);
  });

  it("stays face-up while the holder keeps rolling 0/-1", () => {
    let state = stageCombat(makeGame("morale-reroll-plus-idle"));
    holdNegative(state, "p1", MORALE_CARD_IDS.rerollPlusOne);
    state.combat!.dice.scriptedRolls = [0];

    state = attack(state);

    expect(lastAttackRoll(state).roll).toBe(0);
    // CONTROL: nothing was rerolled, so no overlay-replay payload is attached.
    expect(lastAttackRoll(state).rerollBeats).toBeUndefined();
    expect(state.players.p1.moraleCards?.negative).toEqual([MORALE_CARD_IDS.rerollPlusOne]);
  });

  it("also rerolls a +1 the holder's defending unit shows on its Defense roll", () => {
    // p2 defends: attack die 0, Defend die +1 would shield 1 damage — the curse
    // rerolls that +1 into -1, so the full hit lands.
    let state = stageCombat(makeGame("morale-reroll-plus-defend"), { defender: { defenseToken: true } });
    holdNegative(state, "p2", MORALE_CARD_IDS.rerollPlusOne);
    state.combat!.dice.scriptedRolls = [0, 1, -1];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    expect(rolled.defendRoll).toBe(-1);
    expect(rolled.damage).toBe(2);
    expect(state.players.p2.moraleCards?.negative).toHaveLength(0);
  });

  it("CONTROL: without the card the defender's +1 Defend roll keeps its shield", () => {
    let state = stageCombat(makeGame("morale-reroll-plus-defend-control"), { defender: { defenseToken: true } });
    state.combat!.dice.scriptedRolls = [0, 1];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    expect(rolled.defendRoll).toBe(1);
    expect(rolled.damage).toBe(1);
  });
});

describe("Negative Morale: Next Roll -1", () => {
  it("suffers -1 on the holder's next Attack roll, whichever comes first", () => {
    let state = stageCombat(makeGame("morale-next-minus-attack"));
    holdNegative(state, "p1", MORALE_CARD_IDS.nextRollMinusOne);
    state.combat!.dice.scriptedRolls = [0];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    // attack 3 + die 0 - 1 (penalty) vs defense 1 → 1 damage (control: 2).
    expect(rolled.damage).toBe(1);
    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.nextRollMinusOne);
  });

  it("or on the holder's next Defense roll — a +1 Defend die no longer shields", () => {
    let state = stageCombat(makeGame("morale-next-minus-defend"), { defender: { defenseToken: true } });
    holdNegative(state, "p2", MORALE_CARD_IDS.nextRollMinusOne);
    state.combat!.dice.scriptedRolls = [0, 1];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    // Defend die +1 -1 → 0: no shield, full 2 damage (control below keeps 1).
    expect(rolled.damage).toBe(2);
    expect(state.players.p2.moraleCards?.negative).toHaveLength(0);
  });

  it("CONTROL: without the card the same rolls deal 2 / shield 1", () => {
    let state = stageCombat(makeGame("morale-next-minus-control"));
    state.combat!.dice.scriptedRolls = [0];
    state = attack(state);
    expect(lastAttackRoll(state).damage).toBe(2);

    let defendState = stageCombat(makeGame("morale-next-minus-control-defend"), { defender: { defenseToken: true } });
    defendState.combat!.dice.scriptedRolls = [0, 1];
    defendState = attack(defendState);
    expect(lastAttackRoll(defendState).damage).toBe(1);
  });
});

describe("Negative Morale: Roll One Less", () => {
  it("collapses the holder's 2-dice advantage Attack roll to a single die", () => {
    let state = stageCombat(makeGame("morale-roll-less-attack"), {
      attacker: { abilities: ["attack-roll-advantage"] }
    });
    holdNegative(state, "p1", MORALE_CARD_IDS.rollOneLess);
    state.combat!.dice.scriptedRolls = [-1, 1];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    // One die only: the scripted -1 stands (advantage would have kept the +1).
    expect(rolled.rolls).toEqual([-1]);
    expect(rolled.roll).toBe(-1);
    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.rollOneLess);
  });

  it("CONTROL: without the card the advantage roll throws both dice and keeps the +1", () => {
    let state = stageCombat(makeGame("morale-roll-less-attack-control"), {
      attacker: { abilities: ["attack-roll-advantage"] }
    });
    state.combat!.dice.scriptedRolls = [-1, 1];

    state = attack(state);

    const rolled = lastAttackRoll(state);
    expect(rolled.rolls).toEqual([-1, 1]);
    expect(rolled.roll).toBe(1);
  });

  it("rolls one Treasure die less on the holder's next 2-dice Treasure roll", () => {
    const state = makeGame("morale-roll-less-treasure");
    holdNegative(state, "p1", MORALE_CARD_IDS.rollOneLess);
    const hero = getMainHero(state, "p1")!;
    state.adventure!.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: hero.spaceId!,
      steps: [{ type: "ROLL_TREASURE_DICE", count: 2 }]
    };

    processPendingVisit(state);

    const rolledEvent = [...state.eventLog]
      .reverse()
      .find((entry) => entry.type === "ADVENTURE_DICE_ROLLED" && entry.dice === "treasure");
    expect(rolledEvent && "results" in rolledEvent ? rolledEvent.results : []).toHaveLength(1);
    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
  });

  it("CONTROL: without the card both Treasure dice roll", () => {
    const state = makeGame("morale-roll-less-treasure-control");
    const hero = getMainHero(state, "p1")!;
    state.adventure!.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: hero.spaceId!,
      steps: [{ type: "ROLL_TREASURE_DICE", count: 2 }]
    };

    processPendingVisit(state);

    const rolledEvent = [...state.eventLog]
      .reverse()
      .find((entry) => entry.type === "ADVENTURE_DICE_ROLLED" && entry.dice === "treasure");
    expect(rolledEvent && "results" in rolledEvent ? rolledEvent.results : []).toHaveLength(2);
  });
});

describe("Negative Morale: Skip Activation Check", () => {
  function stageActivationHandoff(state: GameState): GameState {
    // b1 already acted, so ending a1's activation hands the spotlight to a2 —
    // the fresh activation the morale check rolls for.
    state.players.p1.army = [
      { id: "a1", unitDefId: "castle.pikemen", side: "few" },
      { id: "a2", unitDefId: "castle.pikemen", side: "few" }
    ];
    state.combat!.units.a2 = unit({ id: "a2", controllerId: "p1", armyUnitId: "a2", position: 9 });
    state.combat!.units.b1.activatedThisRound = true;
    return state;
  }

  it("a -1 pre-activation roll skips the unit and discards the card", () => {
    let state = stageActivationHandoff(stageCombat(makeGame("morale-skip-activation")));
    holdNegative(state, "p1", MORALE_CARD_IDS.skipActivation);
    state.combat!.dice.scriptedRolls = [-1];

    // Defending ends a1's activation, handing the spotlight to a2.
    state = apply(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "a1" });

    // a2's activation was skipped outright: the check rolled -1, the skip is
    // logged, and a2's activation ended without it ever acting.
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "UNIT_ABILITY_TRIGGERED" &&
          event.abilityId === "morale-skip-activation-check" &&
          event.message.includes("skipped")
      )
    ).toBe(true);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_ACTIVATION_ENDED" && event.unitId === "a2")
    ).toBe(true);
    expect(state.eventLog.some((event) => event.type === "UNIT_ACTIVATION_STARTED" && event.unitId === "a2")).toBe(
      false
    );
    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.skipActivation);
  });

  it("any other face lets the activation proceed and keeps the card face-up", () => {
    let state = stageActivationHandoff(stageCombat(makeGame("morale-skip-activation-pass")));
    holdNegative(state, "p1", MORALE_CARD_IDS.skipActivation);
    state.combat!.dice.scriptedRolls = [0];

    state = apply(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "a1" });

    expect(state.combat!.activeUnitId).toBe("a2");
    expect(state.combat!.units.a2.activatedThisRound).toBe(false);
    expect(state.players.p1.moraleCards?.negative).toEqual([MORALE_CARD_IDS.skipActivation]);
  });

  it("CONTROL: without the card no pre-activation die is rolled at all", () => {
    let state = stageActivationHandoff(stageCombat(makeGame("morale-skip-activation-control")));
    state.combat!.dice.scriptedRolls = [-1];

    state = apply(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "a1" });

    expect(state.combat!.activeUnitId).toBe("a2");
    expect(state.combat!.dice.rollCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Positive combat cards
// ---------------------------------------------------------------------------

describe("Positive Morale: Set Attack Die +1", () => {
  it("offers a set-die window and flips the rolled die to +1 without rerolling", () => {
    let state = stageCombat(makeGame("morale-set-plus"));
    holdPositive(state, "p1", MORALE_CARD_IDS.setAttackDiePlus);
    state.combat!.dice.scriptedRolls = [-1];

    state = attack(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    const setAction = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "REROLL_PENDING_CHOICE" && legal.action.useSetDie
    );
    expect(setAction, "the set-die play should be offered").toBeTruthy();

    const rollCountBefore = state.combat!.dice.rollCount;
    state = apply(state, setAction!.action);
    // A SET, not a reroll: no new die was thrown.
    expect(state.combat!.dice.rollCount).toBe(rollCountBefore);
    state = keepPendingRoll(state);

    const rolled = lastAttackRoll(state);
    expect(rolled.roll).toBe(1);
    expect(rolled.damage).toBe(3);
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.setAttackDiePlus);
  });

  it("is not offered once the roll already shows +1", () => {
    let state = stageCombat(makeGame("morale-set-plus-idle"));
    holdPositive(state, "p1", MORALE_CARD_IDS.setAttackDiePlus);
    state.combat!.dice.scriptedRolls = [1];

    state = attack(state);

    // No window at all: the set-die source cannot improve a +1.
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p1.moraleCards?.positive).toEqual([MORALE_CARD_IDS.setAttackDiePlus]);
  });

  it("CONTROL: without the card the -1 roll opens no window and stands", () => {
    let state = stageCombat(makeGame("morale-set-plus-control"));
    state.combat!.dice.scriptedRolls = [-1];

    state = attack(state);

    expect(state.pendingChoice).toBeNull();
    expect(lastAttackRoll(state).roll).toBe(-1);
  });
});

describe("Positive Morale: Combat Bonus", () => {
  it("+1 Attack for this Combat raises the holder's attack damage", () => {
    let state = stageCombat(makeGame("morale-combat-bonus"));
    holdPositive(state, "p1", MORALE_CARD_IDS.combatBonus);
    state.combat!.dice.scriptedRolls = [0];

    const offers = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "combat-bonus"
    );
    expect(offers.map((legal) => (legal.action as { bonus?: string }).bonus).sort()).toEqual(["attack", "defense"]);

    state = apply(state, { type: "SPEND_MORALE", playerId: "p1", benefit: "combat-bonus", bonus: "attack" });
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.combatBonus);

    state = attack(state);

    // attack 3 +1 (bonus) + die 0 vs defense 1 → 3 damage (control: 2).
    expect(lastAttackRoll(state).damage).toBe(3);
  });

  it("+1 Defense for this Combat lowers damage taken by the holder's units", () => {
    let state = stageCombat(makeGame("morale-combat-bonus-defense"));
    holdPositive(state, "p2", MORALE_CARD_IDS.combatBonus);
    state.combat!.dice.scriptedRolls = [0];

    state = apply(state, { type: "SPEND_MORALE", playerId: "p2", benefit: "combat-bonus", bonus: "defense" });
    state = attack(state);

    // attack 3 + 0 vs defense 1 +1 → 1 damage (control: 2).
    expect(lastAttackRoll(state).damage).toBe(1);
  });

  it("is playable as an INSTANT-WINDOW REACTION: the defender adds +1 Defense inside the open attack window", () => {
    let state = stageCombat(makeGame("morale-combat-bonus-reaction"));
    holdPositive(state, "p2", MORALE_CARD_IDS.combatBonus);
    state.combat!.dice.scriptedRolls = [0];

    // p1 declares the attack — this opens an instant/reaction window in which
    // p2 (the target's controller) may respond.
    state = apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "a1", defenderId: "b1" });
    expect(state.reactionWindow, "the attack opens a reaction window").toBeTruthy();

    // The combat bonus is offered to p2 INSIDE the window (both picks).
    const windowOffers = getLegalActions(state, "p2").filter(
      (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "combat-bonus"
    );
    expect(windowOffers.map((legal) => (legal.action as { bonus?: string }).bonus).sort()).toEqual([
      "attack",
      "defense"
    ]);

    // p2 plays +1 Defense as a reaction to the incoming attack.
    state = apply(state, { type: "SPEND_MORALE", playerId: "p2", benefit: "combat-bonus", bonus: "defense" });
    // The card is spent and is no longer re-offered (the window re-derived its
    // offers). FLIPPED 2026-08-22 (consecutive-pass rule, noteReactionWindowPlay):
    // a Morale spend inside a window is now advanced exactly like a PLAY_CARD
    // join instead of a bare refresh — it clears the opponent's standing pass
    // AND, when the play leaves NOBODY with a legal reaction (as here: p1 holds
    // nothing and p2's only card is spent), it closes the window and resolves
    // the parked attack rather than leaving an offer-less window that both
    // seats must click Pass on. The old expectation was "the window stays open".
    expect(state.players.p2.moraleCards?.positive).toHaveLength(0);
    expect(
      getLegalActions(state, "p2").some(
        (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "combat-bonus"
      )
    ).toBe(false);

    // Drain anything left (nothing, today) and check the attack resolved with
    // the reaction defense buff.
    let safety = 20;
    while (state.reactionWindow && safety-- > 0) {
      state = apply(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    }
    expect(state.reactionWindow, "the exchange settled — no frozen window").toBeNull();
    // attack 3 + 0 vs defense 1 +1 → 1 damage (control: 2).
    expect(lastAttackRoll(state).damage).toBe(1);
  });

  it("CONTROL: unplayed, the same attack deals 2 — and the play is rejected outside the holder's combat", () => {
    let state = stageCombat(makeGame("morale-combat-bonus-control"));
    state.combat!.dice.scriptedRolls = [0];
    state = attack(state);
    expect(lastAttackRoll(state).damage).toBe(2);

    // Outside a combat the play is refused outright.
    const mapState = makeGame("morale-combat-bonus-map");
    holdPositive(mapState, "p1", MORALE_CARD_IDS.combatBonus);
    const result = applyAction(mapState, {
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "combat-bonus",
      bonus: "attack"
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("Positive Morale: Remove Token", () => {
  it("removes a negative combat token from an own unit (Corrosion: defense returns)", () => {
    let state = stageCombat(makeGame("morale-remove-token"));
    holdPositive(state, "p2", MORALE_CARD_IDS.removeToken);
    placeCombatToken(state, state.combat!.units.b1, "corrosion", 1, "test");
    state.combat!.dice.scriptedRolls = [0];

    const offer = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "remove-token"
    );
    expect(offer, "the remove-token play should be offered").toBeTruthy();

    state = apply(state, offer!.action);
    expect(state.combat!.units.b1.tokens ?? []).toHaveLength(0);
    expect(state.players.p2.moraleCards?.positive).toHaveLength(0);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.removeToken);

    state = attack(state);
    // Corrosion gone: defense 1 holds → 2 damage, not the corroded 3.
    expect(lastAttackRoll(state).damage).toBe(2);
  });

  it("CONTROL: with the token still on, the corroded unit takes 3 — and the play needs a token", () => {
    let state = stageCombat(makeGame("morale-remove-token-control"));
    placeCombatToken(state, state.combat!.units.b1, "corrosion", 1, "test");
    state.combat!.dice.scriptedRolls = [0];
    state = attack(state);
    expect(lastAttackRoll(state).damage).toBe(3);

    // Holding the card with no tokenized unit offers nothing.
    const clean = stageCombat(makeGame("morale-remove-token-clean"));
    holdPositive(clean, "p2", MORALE_CARD_IDS.removeToken);
    const offers = getLegalActions(clean, "p2").filter(
      (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "remove-token"
    );
    expect(offers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Positive Morale: Reroll a Die — the MAP dice (Resource / Treasure / the
// Scholar & Sea-Chest Attack-die branch rolls). With the Morale Cards rule on,
// this card stands in for the ±1 token's "Reroll any Die you have thrown"
// map action, so a holder must get the reroll window the token used to give.
// ---------------------------------------------------------------------------

describe("Positive Morale: Reroll a Die (map dice)", () => {
  /** A p1-turn game with an empty hand (no reroll artifacts muddying offers). */
  function readyMapGame(seed: string): GameState {
    const state = makeGame(seed);
    const readied =
      state.players.p1.needsHandRefresh || state.players.p1.canMulligan
        ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
        : state;
    readied.players.p1.hand = [];
    return readied;
  }

  function injectVisit(state: GameState, steps: unknown[]): void {
    const hero = getMainHero(state, "p1")!;
    state.adventure!.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: hero.spaceId!,
      steps: steps as never
    };
  }

  function attackDieEvents(state: GameState) {
    return state.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "attack"
    );
  }

  function treasureDieEvents(state: GameState) {
    return state.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "treasure"
    );
  }

  /** The open visit CHOOSE_ONE's option index whose label plays the reroll card. */
  function rerollOptionIndex(state: GameState): number {
    const step = state.adventure?.pendingVisit?.steps[0];
    expect(step?.type, "a CHOOSE_ONE die window is open").toBe("CHOOSE_ONE");
    const options = step?.type === "CHOOSE_ONE" ? step.options : [];
    return options.findIndex((option) => /Reroll a Die/.test(option.label));
  }

  it("offers — and resolves — the held card on a single map Treasure die", () => {
    let state = readyMapGame("morale-reroll-map-treasure");
    holdPositive(state, "p1", MORALE_CARD_IDS.rerollDie);
    injectVisit(state, [{ type: "ROLL_TREASURE_DICE", count: 1 }]);

    processPendingVisit(state);

    // The roll no longer resolves silently: a window opened with the card play.
    const index = rerollOptionIndex(state);
    expect(index).toBeGreaterThan(0);

    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: index });

    // The die was thrown again, and the card resolved back under its deck.
    expect(treasureDieEvents(state)).toHaveLength(2);
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.rerollDie);
  });

  it("offers the held card on a map Resource die too", () => {
    let state = readyMapGame("morale-reroll-map-resource");
    holdPositive(state, "p1", MORALE_CARD_IDS.rerollDie);
    injectVisit(state, [{ type: "ROLL_RESOURCE_DICE", count: 1 }]);

    processPendingVisit(state);

    const index = rerollOptionIndex(state);
    expect(index).toBeGreaterThan(0);

    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: index });

    const rolls = state.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "resource"
    );
    expect(rolls).toHaveLength(2);
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
  });

  it("CONTROL: without the card a single Treasure die resolves with no window", () => {
    const state = readyMapGame("morale-reroll-map-treasure-control");
    injectVisit(state, [{ type: "ROLL_TREASURE_DICE", count: 1 }]);

    processPendingVisit(state);

    expect(treasureDieEvents(state)).toHaveLength(1);
    const step = state.adventure?.pendingVisit?.steps[0];
    expect(step?.type === "CHOOSE_ONE" && /Reroll a Die/.test(JSON.stringify(step.options))).toBe(false);
  });

  it("lets the holder reroll the Scholar's Attack die before the branch resolves", () => {
    let state = readyMapGame("morale-reroll-map-scholar");
    holdPositive(state, "p1", MORALE_CARD_IDS.rerollDie);
    injectVisit(state, [{ type: "SCHOLAR" }]);

    processPendingVisit(state);

    // The keep-or-reroll window is open on the rolled face.
    const step = state.adventure?.pendingVisit?.steps[0];
    expect(step?.type === "CHOOSE_ONE" && step.prompt).toMatch(/Scholar Attack die/);
    const index = rerollOptionIndex(state);
    expect(index).toBe(1);

    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: index });

    // The Scholar die was thrown a second time and the card is spent.
    expect(attackDieEvents(state)).toHaveLength(2);
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile[0]).toBe(MORALE_CARD_IDS.rerollDie);
  });

  it("CONTROL: without the card the Scholar roll resolves its branch straight through", () => {
    const state = readyMapGame("morale-reroll-map-scholar-control");
    injectVisit(state, [{ type: "SCHOLAR" }]);

    processPendingVisit(state);

    expect(attackDieEvents(state)).toHaveLength(1);
    const step = state.adventure?.pendingVisit?.steps[0];
    expect(step?.type === "CHOOSE_ONE" && /Keep the .* result/.test(step.prompt ?? "")).toBe(false);
  });

  it("lets the holder reroll a Sea-Chest-style ATTACK_DIE_TABLE roll (keeping is also honoured)", () => {
    let state = readyMapGame("morale-reroll-map-die-table");
    holdPositive(state, "p1", MORALE_CARD_IDS.rerollDie);
    const table = {
      type: "ATTACK_DIE_TABLE",
      plus: [{ type: "GAIN_RESOURCES", gold: 5 }],
      zero: [{ type: "GAIN_RESOURCES", gold: 5 }],
      minus: [{ type: "GAIN_RESOURCES", gold: 5 }]
    };
    injectVisit(state, [table]);

    processPendingVisit(state);

    const goldBefore = state.players.p1.resources.gold;
    const step = state.adventure?.pendingVisit?.steps[0];
    expect(step?.type === "CHOOSE_ONE" && step.prompt).toMatch(/Attack die/);

    // Reroll once…
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: rerollOptionIndex(state) });
    expect(attackDieEvents(state)).toHaveLength(2);
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);

    // …the card is spent, so the SECOND roll resolves its branch directly.
    expect(state.adventure?.pendingVisit).toBeNull();
    expect(state.players.p1.resources.gold).toBe(goldBefore + 5);
  });

  it("CONTROL: without the card the ATTACK_DIE_TABLE branch resolves with no window", () => {
    const state = readyMapGame("morale-reroll-map-die-table-control");
    const goldBefore = state.players.p1.resources.gold;
    injectVisit(state, [
      {
        type: "ATTACK_DIE_TABLE",
        plus: [{ type: "GAIN_RESOURCES", gold: 5 }],
        zero: [{ type: "GAIN_RESOURCES", gold: 5 }],
        minus: [{ type: "GAIN_RESOURCES", gold: 5 }]
      }
    ]);

    processPendingVisit(state);

    expect(attackDieEvents(state)).toHaveLength(1);
    expect(state.adventure?.pendingVisit).toBeNull();
    expect(state.players.p1.resources.gold).toBe(goldBefore + 5);
  });
});
