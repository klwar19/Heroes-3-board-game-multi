/**
 * Polish Balance Pack (`polish-card-balance`) — the 11 reprinted HERO SPECIALTIES.
 *
 * Every claim is an OBSERVABLE outcome (which cards really reach the hand, what
 * the covered unit really strikes with, the gold really banked, the Spell really
 * cast and where its card really sits, which options a Search really offers)
 * paired with a rule-OFF CONTROL on the SAME setup — and, for the BOOK-gated and
 * STACK-gated halves, with the Polish Spell Book / Polish Unit Stacks toggle both
 * ways (CLAUDE.md #1a).
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { makeCombatUnitFromArmy } from "./adventure";
import { canPlaceTransformOn, makeUnitTransformState } from "./unit-transforms";
import { nextTurnTimeoutAction } from "./afk-drop";
import { chooseComputerAction } from "./computer/policy";
import type { ComputerObservation } from "./computer/types";
import { polishBalanceSpecialtyCards } from "@/data/cards/specialties-balance";
import { cardLibrary } from "@/data/cards/library";
import type { CardId, GameAction, GameState, UnitId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

type Rules = { balance: boolean; book?: boolean; stacks?: boolean };

/** A sandbox combat whose frozen house rules carry the requested toggles. */
function combat(rules: Rules, seed = "polish-balance-specialties"): GameState {
  const state = createInitialGameState(`${seed}-${JSON.stringify(rules)}`);
  state.adventure = {
    houseRules: {
      "polish-card-balance": rules.balance,
      "polish-spell-book": rules.book ?? false,
      "polish-unit-stacks": rules.stacks ?? false
    }
  } as unknown as GameState["adventure"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;
  state.combat!.units.unit_p1_griffins.attackedThisActivation = false;
  for (const unit of Object.values(state.combat!.units)) {
    unit.damage = 0;
    unit.maxHealth = 40;
  }
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.discard = [];
  state.players.p1.spellBook = [];
  state.players.p1.spellBookUsed = [];
  return state;
}

/** A real adventure game with the requested toggles frozen on. */
function adventure(rules: Rules, seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.adventure!.houseRules = {
    ...(state.adventure!.houseRules ?? {}),
    "polish-card-balance": rules.balance,
    "polish-spell-book": rules.book ?? false,
    "polish-unit-stacks": rules.stacks ?? false
  };
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function plays(state: GameState, cardId: string): Extract<GameAction, { type: "PLAY_CARD" }>[] {
  return getLegalActions(state, "p1")
    .map((legal) => legal.action)
    .filter((action): action is Extract<GameAction, { type: "PLAY_CARD" }> =>
      action.type === "PLAY_CARD" && action.cardId === cardId
    );
}

function choiceLabels(state: GameState): string[] {
  return state.pendingChoice?.type === "OPTION_CHOICE"
    ? state.pendingChoice.options.map((option: { label: string }) => option.label)
    : [];
}

// ===========================================================================
// Adelaide IV — take a Cast a Spell / Specialty, THEN refresh a Book Spell
// ===========================================================================

describe("Balance Pack specialties — Adelaide IV (Frost Ring)", () => {
  const stage = (rules: Rules): GameState => {
    const state = combat(rules, "adelaide");
    state.players.p1.discard = [
      "spell.cast_a_spell" as CardId,
      "spell.haste" as CardId,
      "specialty.adelaide.1" as CardId
    ];
    state.players.p1.spellBookUsed = ["spell.magic_arrow" as CardId];
    state.players.p1.hand = ["specialty.adelaide.4" as CardId];
    return state;
  };

  it("takes a Cast a Spell enabler, then opens a SECOND pick that refreshes a used Book Spell", () => {
    let state = stage({ balance: true, book: true });
    const play = plays(state, "specialty.adelaide.4")[0];
    expect(play, "Adelaide IV is playable").toBeTruthy();
    state = applyOk(state, play);

    // The take menu: the enabler + the Specialty, and NOT the used Book Spell
    // (the refresh is the card's SECOND sentence, offered afterwards).
    const takeLabels = choiceLabels(state);
    expect(takeLabels).toContain("Take Cast a Spell");
    expect(takeLabels.some((label) => label.includes("Frost Ring I"))).toBe(true);
    expect(takeLabels.some((label) => label.startsWith("Refresh "))).toBe(false);
    // An owned Spell lives in the BOOK under Polish, so a raw Spell sitting in the
    // discard pile is NOT what "Cast a Spell or Specialty card" means.
    expect(takeLabels.some((label) => label.includes("Haste"))).toBe(false);

    const takeIndex = takeLabels.indexOf("Take Cast a Spell");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: state.pendingChoice!.id, optionIndex: takeIndex });
    // The take really happened…
    expect(state.players.p1.hand).toContain("spell.cast_a_spell");
    expect(state.players.p1.discard).not.toContain("spell.cast_a_spell");
    // …and the refresh pick is open.
    expect(choiceLabels(state)).toEqual(["Refresh Magic Arrow in the Spell Book"]);

    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: state.pendingChoice!.id, optionIndex: 0 });
    expect(state.players.p1.spellBookUsed ?? []).toEqual([]);
    expect(state.players.p1.spellBook).toContain("spell.magic_arrow");
  });

  it("CONTROL: the PRINTED card takes a Spell or Specialty and refreshes nothing", () => {
    let state = stage({ balance: false, book: true });
    state = applyOk(state, plays(state, "specialty.adelaide.4")[0]);
    const labels = choiceLabels(state);
    // The printed filter is "spell-or-specialty", which the Polish recovery path
    // turns into a refresh menu — never a "Take Cast a Spell".
    expect(labels).not.toContain("Take Cast a Spell");
    const refreshIndex = labels.findIndex((label) => label.startsWith("Refresh "));
    expect(refreshIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: state.pendingChoice!.id, optionIndex: refreshIndex });
    // One pick, no follow-up: the classic card has only one sentence.
    expect(state.pendingChoice).toBeNull();
  });

  it("CONTROL: without the Polish Book the reprint keeps the printed Spell-or-Specialty take and opens no refresh", () => {
    let state = stage({ balance: true, book: false });
    state = applyOk(state, plays(state, "specialty.adelaide.4")[0]);
    const labels = choiceLabels(state);
    expect(labels.some((label) => label.includes("Haste"))).toBe(true);
    const hasteIndex = labels.findIndex((label) => label.includes("Haste"));
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: state.pendingChoice!.id, optionIndex: hasteIndex });
    expect(state.players.p1.hand).toContain("spell.haste");
    expect(state.pendingChoice).toBeNull();
  });

  it("still refreshes when there is nothing to take (the second sentence stands alone)", () => {
    let state = combat({ balance: true, book: true }, "adelaide-empty");
    // Nothing the reprint can TAKE (an Artifact matches neither reading), so the
    // printed second sentence has to stand on its own.
    state.players.p1.discard = ["artifact.centaurs_axe" as CardId];
    state.players.p1.spellBookUsed = ["spell.magic_arrow" as CardId];
    state.players.p1.hand = ["specialty.adelaide.4" as CardId];
    const play = plays(state, "specialty.adelaide.4")[0];
    expect(play, "the card is still playable with nothing to take").toBeTruthy();
    state = applyOk(state, play);
    expect(choiceLabels(state)).toEqual(["Refresh Magic Arrow in the Spell Book"]);
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: state.pendingChoice!.id, optionIndex: 0 });
    expect(state.players.p1.spellBook).toContain("spell.magic_arrow");
  });

  it("the follow-up refresh pick never stalls a computer seat or the AFK driver", () => {
    let state = stage({ balance: true, book: true });
    state = applyOk(state, plays(state, "specialty.adelaide.4")[0]);
    const takeIndex = choiceLabels(state).indexOf("Take Cast a Spell");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: state.pendingChoice!.id, optionIndex: takeIndex });
    expect((state.pendingChoice as { context?: string } | null)?.context).toBe("discard-pick");
    const observation: ComputerObservation = {
      state: state as unknown as ComputerObservation["state"],
      playerId: "p1",
      legalActions: getLegalActions(state, "p1")
    };
    const aiPick = chooseComputerAction(observation);
    expect(aiPick, "the AI answers the refresh pick").toBeTruthy();
    expect(applyAction(state, aiPick!.action).errors).toEqual([]);
    const driven = nextTurnTimeoutAction(state, "p1");
    expect(driven, "the AFK/turn-timeout driver answers it too").toBeTruthy();
    expect(applyAction(state, driven!).errors).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 2026-08-25 USER REPORT: "Adeila speciality should refresh one spell — but
  // now it doesnt." Root cause: the PLAY gate (isOptionEffectPlayable's
  // TAKE_FROM_DISCARD case, and its reaction-window twin) knew nothing about
  // this card's `cast-enabler-or-specialty` filter and nothing about the
  // standalone follow-up refresh, so it fell through to a catch-all keyed purely
  // on "is the discard pile non-empty" — an EMPTY discard pile made the whole
  // card unplayable and its printed second sentence unreachable.
  // -------------------------------------------------------------------------

  const emptyDiscard = (rules: Rules, seed: string): GameState => {
    const state = combat(rules, seed);
    state.players.p1.discard = [];
    state.players.p1.spellBookUsed = ["spell.magic_arrow" as CardId];
    state.players.p1.spellBook = [];
    state.players.p1.hand = ["specialty.adelaide.4" as CardId];
    return state;
  };

  it("with NOTHING to take (an empty discard pile) it is still playable and really refreshes", () => {
    let state = emptyDiscard({ balance: true, book: true }, "adelaide-empty-discard");
    const play = plays(state, "specialty.adelaide.4")[0];
    expect(play, "the standalone 'Refresh 1 Spell' makes the card playable").toBeTruthy();
    state = applyOk(state, play);
    expect(choiceLabels(state)).toEqual(["Refresh Magic Arrow in the Spell Book"]);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    // The OBSERVABLE: the Spell really moved back to the refreshed side.
    expect(state.players.p1.spellBook).toEqual(["spell.magic_arrow"]);
    expect(state.players.p1.spellBookUsed).toEqual([]);
    expect(state.players.p1.polishSpellsRefreshedThisRound).toEqual(["spell.magic_arrow"]);
  });

  it("the STANDALONE refresh pick never stalls a computer seat or the AFK driver", () => {
    let state = emptyDiscard({ balance: true, book: true }, "adelaide-empty-discard-ai");
    state = applyOk(state, plays(state, "specialty.adelaide.4")[0]);
    expect((state.pendingChoice as { context?: string } | null)?.context).toBe("discard-pick");
    const observation: ComputerObservation = {
      state: state as unknown as ComputerObservation["state"],
      playerId: "p1",
      legalActions: getLegalActions(state, "p1")
    };
    const aiPick = chooseComputerAction(observation);
    expect(aiPick, "the AI answers the standalone refresh pick").toBeTruthy();
    expect(applyAction(state, aiPick!.action).errors).toEqual([]);
    const driven = nextTurnTimeoutAction(state, "p1");
    expect(driven, "the AFK/turn-timeout driver answers it too").toBeTruthy();
    expect(applyAction(state, driven!).errors).toEqual([]);
  });

  it("CONTROL: without the Polish Book an empty discard pile leaves it unplayable (there is no Book to refresh)", () => {
    const state = emptyDiscard({ balance: true, book: false }, "adelaide-empty-discard-nobook");
    expect(plays(state, "specialty.adelaide.4")).toEqual([]);
  });

  it("CONTROL: with the refresh already spent AND nothing takeable it is not offered at all (it would do nothing)", () => {
    const state = emptyDiscard({ balance: true, book: true }, "adelaide-empty-discard-spent");
    // Junk in the discard the take can never use, and the round's refresh of the
    // one used Book Spell already made.
    state.players.p1.discard = ["artifact.centaurs_axe" as CardId];
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.magic_arrow" as CardId];
    expect(plays(state, "specialty.adelaide.4")).toEqual([]);
  });

  it("USER RULING: the once-per-round limit is on the REFRESH, not the card — it plays again and only the refresh no-ops", () => {
    let state = combat({ balance: true, book: true }, "adelaide-refresh-spent-still-plays");
    state.players.p1.discard = ["spell.cast_a_spell" as CardId];
    state.players.p1.spellBookUsed = ["spell.magic_arrow" as CardId];
    state.players.p1.spellBook = [];
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.magic_arrow" as CardId];
    state.players.p1.hand = ["specialty.adelaide.4" as CardId];

    const play = plays(state, "specialty.adelaide.4")[0];
    expect(play, "a spent refresh must never block the CARD").toBeTruthy();
    state = applyOk(state, play);
    const takeIndex = choiceLabels(state).indexOf("Take Cast a Spell");
    expect(takeIndex, "the take half is still offered").toBeGreaterThanOrEqual(0);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: takeIndex
    });
    // The take really resolved; the refresh half no-opped, out loud.
    expect(state.players.p1.hand).toContain("spell.cast_a_spell");
    expect(state.players.p1.spellBookUsed).toEqual(["spell.magic_arrow"]);
    expect(state.players.p1.spellBook).toEqual([]);
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "EVENT_NOTE" &&
          event.message.includes("No Spell in the Spell Book can be refreshed right now.")
      ),
      "the dead refresh half says so instead of vanishing silently"
    ).toBe(true);
  });
});

// ===========================================================================
// Jeddite I / VI — the dig keeps Cast a Spell enablers under the Book
// ===========================================================================

describe("Balance Pack specialties — Jeddite's Mysterious Warlock I / VI", () => {
  const dig = (rules: Rules, level: 1 | 6): GameState => {
    let state = combat(rules, `jeddite-${level}`);
    // Deck top is the LAST entry; dig 3 takes the last three.
    state.players.p1.deck = [
      "stat.attack" as CardId,
      "specialty.adelaide.1" as CardId,
      "spell.haste" as CardId,
      "spell.cast_a_spell" as CardId
    ];
    state.players.p1.hand = [`specialty.jeddite.${level}` as CardId];
    const play = plays(state, `specialty.jeddite.${level}`)[0];
    expect(play, `Jeddite ${level} is playable`).toBeTruthy();
    state = applyOk(state, play);
    return passAllReactions(state);
  };

  it("takes the Cast a Spell enabler and the Specialty, and DISCARDS the raw Spell", () => {
    const state = dig({ balance: true, book: true }, 1);
    expect(state.players.p1.hand).toContain("spell.cast_a_spell");
    expect(state.players.p1.hand).toContain("specialty.adelaide.1");
    expect(state.players.p1.hand).not.toContain("spell.haste");
    expect(state.players.p1.discard).toContain("spell.haste");
  });

  it("CONTROL: the PRINTED card keeps the raw Spell", () => {
    const state = dig({ balance: false, book: true }, 1);
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(state.players.p1.discard).not.toContain("spell.haste");
  });

  it("CONTROL: without the Polish Book the reprint keeps the printed Spell-and-Specialty reading", () => {
    const state = dig({ balance: true, book: false }, 1);
    expect(state.players.p1.hand).toContain("spell.haste");
    expect(state.players.p1.discard).not.toContain("spell.haste");
  });

  it("level VI digs 4 cards (the whole staged deck), level I only 3", () => {
    const six = dig({ balance: true, book: true }, 6);
    expect(six.players.p1.deck).toEqual([]);
    const one = dig({ balance: true, book: true }, 1);
    expect(one.players.p1.deck).toEqual(["stat.attack"]);
  });
});

// ===========================================================================
// Sandro I / IV & Vidomina IV — the Stack cover and its +1 Attack rider
// ===========================================================================

describe("Balance Pack specialties — the Cloak / Necromancy covers on a Stack", () => {
  const coverAttack = (
    cardId: string,
    unitDefId: string,
    unitName: string,
    rules: Rules,
    layers: number
  ): number => {
    const card = rules.balance ? polishBalanceSpecialtyCards[cardId] : cardLibrary[cardId];
    const effect = card!.effect;
    expect(effect.type).toBe("TRANSFORM_UNIT");
    if (effect.type !== "TRANSFORM_UNIT") {
      throw new Error("not a transform");
    }
    // The cover may only be placed on a card the printed text allows — a
    // "Stack" IS a Pack carrying paid layers, so this is the placement half.
    expect(canPlaceTransformOn(unitName, "pack", undefined, effect)).toBe(true);
    const unit = makeCombatUnitFromArmy(
      {
        id: "army_1",
        unitDefId,
        side: "pack",
        stacks: layers,
        transforms: [makeUnitTransformState(effect, cardId, "binh", false)]
      },
      "p1",
      "unit_cover" as UnitId,
      5,
      "binh",
      { polishUnitStacks: rules.stacks ?? false }
    );
    expect(unit, "the covered unit builds").toBeTruthy();
    return unit!.attack;
  };

  it("Sandro I: the Horde on a STACK strikes at +1 (4, not the printed 3)", () => {
    expect(
      coverAttack("specialty.sandro.1", "necropolis.skeletons", "Skeletons", { balance: true, stacks: true }, 2)
    ).toBe(4);
  });

  it("CONTROL: the PRINTED Cloak I on the same Stack strikes at 3", () => {
    expect(
      coverAttack("specialty.sandro.1", "necropolis.skeletons", "Skeletons", { balance: false, stacks: true }, 2)
    ).toBe(3);
  });

  it("CONTROL: the reprint on a plain PACK (no layers) strikes at the printed 3", () => {
    expect(
      coverAttack("specialty.sandro.1", "necropolis.skeletons", "Skeletons", { balance: true, stacks: true }, 0)
    ).toBe(3);
  });

  it("CONTROL: with polish-unit-stacks OFF the layers do not exist, so the rider is inert", () => {
    expect(
      coverAttack("specialty.sandro.1", "necropolis.skeletons", "Skeletons", { balance: true, stacks: false }, 2)
    ).toBe(3);
  });

  it("Vidomina IV: the same Stack rider (4, not 3)", () => {
    expect(
      coverAttack("specialty.vidomina.4", "necropolis.skeletons", "Skeletons", { balance: true, stacks: true }, 2)
    ).toBe(4);
    expect(
      coverAttack("specialty.vidomina.4", "necropolis.skeletons", "Skeletons", { balance: false, stacks: true }, 2)
    ).toBe(3);
  });

  it("Sandro IV: its face prints NO Stack rider — the Horde of Zombies keeps its printed 4 on a Stack", () => {
    expect(
      coverAttack("specialty.sandro.4", "necropolis.zombies", "Zombies", { balance: true, stacks: true }, 2)
    ).toBe(4);
    expect(
      coverAttack("specialty.sandro.4", "necropolis.zombies", "Zombies", { balance: false, stacks: true }, 2)
    ).toBe(4);
  });
});

// ===========================================================================
// Dracon IV / Gelu IV — gold per traded-in Stack layer
// ===========================================================================

describe("Balance Pack specialties — Dracon IV & Gelu IV Stack refunds", () => {
  const trade = (
    cardId: string,
    fromDefId: string,
    toDefId: string,
    deckId: "neutral-gold" | "neutral-silver",
    rules: Rules,
    layers: number
  ): { gold: number; owns: boolean } => {
    const state = adventure(rules, `${cardId}-${layers}-${rules.balance}`);
    state.players.p1.army = [
      { id: "army_trade", unitDefId: fromDefId, side: "pack", ...(layers ? { stacks: layers } : {}) } as never
    ];
    state.decks[deckId]!.drawPile = [toDefId, ...state.decks[deckId]!.drawPile];
    state.players.p1.resources.gold = 0;
    state.players.p1.hand = [cardId as CardId];
    const play = plays(state, cardId).find((action) => action.optionIndex === 0);
    expect(play, `${cardId}'s trade option is offered`).toBeTruthy();
    const next = applyOk(state, play!);
    return {
      gold: next.players.p1.resources.gold,
      owns: next.players.p1.army.some((unit) => unit.unitDefId === toDefId)
    };
  };

  it("Dracon IV: a 2-layer Stack of Magi refunds 26 gold and still takes the Enchanters", () => {
    const result = trade(
      "specialty.dracon.4",
      "tower.magi",
      "neutral.enchanters",
      "neutral-gold",
      { balance: true, stacks: true },
      2
    );
    expect(result).toEqual({ gold: 26, owns: true });
  });

  it("CONTROL: the PRINTED Dracon IV refunds nothing for the same Stack", () => {
    expect(
      trade("specialty.dracon.4", "tower.magi", "neutral.enchanters", "neutral-gold", { balance: false, stacks: true }, 2)
    ).toEqual({ gold: 0, owns: true });
  });

  it("CONTROL: a plain Pack (no layers) refunds nothing under the reprint either", () => {
    expect(
      trade("specialty.dracon.4", "tower.magi", "neutral.enchanters", "neutral-gold", { balance: true, stacks: true }, 0)
    ).toEqual({ gold: 0, owns: true });
  });

  it("Gelu IV: a 2-layer Stack of Elves refunds 18 gold", () => {
    expect(
      trade("specialty.gelu.4", "rampart.elves", "neutral.sharpshooters", "neutral-silver", { balance: true, stacks: true }, 2)
    ).toEqual({ gold: 18, owns: true });
  });

  it("CONTROL: the PRINTED Gelu IV refunds nothing", () => {
    expect(
      trade("specialty.gelu.4", "rampart.elves", "neutral.sharpshooters", "neutral-silver", { balance: false, stacks: true }, 2)
    ).toEqual({ gold: 0, owns: true });
  });
});

// ===========================================================================
// Ciele I / IV — refresh a Book Magic Arrow and cast it
// ===========================================================================

describe("Balance Pack specialties — Ciele's Magic Arrow I / IV", () => {
  const stage = (rules: Rules, level: 1 | 4, enablerInDiscard = true): GameState => {
    const state = combat(rules, `ciele-${level}`);
    state.players.p1.hand = [`specialty.ciele.${level}` as CardId];
    state.players.p1.discard = enablerInDiscard ? ["spell.cast_a_spell" as CardId] : [];
    state.players.p1.spellBookUsed = ["spell.magic_arrow" as CardId];
    return state;
  };

  const arrowCast = (state: GameState) =>
    getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .find(
        (action): action is Extract<GameAction, { type: "CAST_SPELL" }> =>
          action.type === "CAST_SPELL" &&
          action.cardId === "spell.magic_arrow" &&
          action.target.type === "unit" &&
          action.target.unitId === "unit_p2_skeletons"
      );

  it("level I: refreshes the used Book Magic Arrow, casts it for real damage, and SPENDS the round's Spell", () => {
    let state = stage({ balance: true, book: true }, 1);
    const cast = arrowCast(state);
    expect(cast, "the Book refresh-and-cast arm is offered").toBeTruthy();
    const before = state.combat!.units.unit_p2_skeletons.damage;
    state = passAllReactions(applyOk(state, cast!));
    expect(state.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(before);
    // The Arrow really came OFF the used side (the printed "Refresh") — the
    // cast then marks it used again, which is why it ends where it started.
    expect(
      state.eventLog.some(
        (event) => event.type === "SPELL_RETURNED_TO_HAND" && event.reason === "refreshed in the Spell Book"
      ),
      "the Book refresh really fired"
    ).toBe(true);
    expect(state.players.p1.polishSpellsRefreshedThisRound ?? []).toContain("spell.magic_arrow");
    expect(state.players.p1.spellBookUsed ?? []).toContain("spell.magic_arrow");
    expect(state.players.p1.discard).not.toContain("spell.magic_arrow");
    // …the enabler in the discard pile was only the CONDITION, never spent…
    expect(state.players.p1.discard).toContain("spell.cast_a_spell");
    // …and level I's cast counts against the per-round Spell limit.
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("level IV: the same cast is FREE of the per-round Spell limit", () => {
    let state = stage({ balance: true, book: true }, 4);
    const before = state.combat!.units.unit_p2_skeletons.damage;
    state = passAllReactions(applyOk(state, arrowCast(state)!));
    expect(state.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(before);
    expect(state.players.p1.polishSpellsRefreshedThisRound ?? []).toContain("spell.magic_arrow");
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
  });

  it("CONTROL: no Cast a Spell card in the discard pile — the arm is not offered", () => {
    const state = stage({ balance: true, book: true }, 1, false);
    expect(arrowCast(state)).toBeUndefined();
  });

  it("CONTROL: a used Book Spell already refreshed this round is not castable again", () => {
    const state = stage({ balance: true, book: true }, 1);
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.magic_arrow" as CardId];
    expect(arrowCast(state)).toBeUndefined();
  });

  it("CONTROL: the PRINTED Ciele I offers only its recall-to-hand side", () => {
    const state = stage({ balance: false, book: true }, 1);
    expect(arrowCast(state)).toBeUndefined();
    expect(plays(state, "specialty.ciele.1").length).toBeGreaterThan(0);
  });

  it("CONTROL: without the Polish Book the reprint keeps the printed classic side", () => {
    let state = stage({ balance: true, book: false }, 1);
    state.players.p1.spellBookUsed = [];
    state.players.p1.discard = ["spell.magic_arrow" as CardId];
    expect(arrowCast(state)).toBeUndefined();
    const recall = plays(state, "specialty.ciele.1").find((action) => action.optionIndex === 1);
    expect(recall, "the classic recall side is offered off the Book").toBeTruthy();
    state = passAllReactions(applyOk(state, recall!));
    expect((state.pendingChoice as { context?: string } | null)?.context).toBe("discard-pick");
  });
});

// ===========================================================================
// Tarnum (Conflux) I — the Remove option is gone
// ===========================================================================

describe("Balance Pack specialties — Tarnum (Conflux) I", () => {
  const search = (rules: Rules): string[] => {
    const state = adventure(rules, `tarnum-conflux-${rules.balance}`);
    state.players.p1.hand = ["specialty.tarnum_conflux.1" as CardId];
    const play = plays(state, "specialty.tarnum_conflux.1")[0];
    expect(play, "Tarnum I has a map play").toBeTruthy();
    let next = applyOk(state, play);
    // A BINH table splits the Spell deck, so the Search first asks WHICH deck.
    if (next.pendingChoice?.type === "OPTION_CHOICE") {
      next = applyOk(next, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: next.pendingChoice.id,
        optionIndex: 0
      });
    }
    expect(next.pendingChoice?.type).toBe("DECK_SEARCH");
    // The revealed-card menu IS the legal-action list of a DECK_SEARCH.
    return getLegalActions(next, "p1")
      .filter((legal) => legal.action.type === "RESOLVE_DECK_SEARCH")
      .map((legal) => legal.label ?? "");
  };

  it("offers no 'Remove …' pick — the found Spell is always kept", () => {
    const labels = search({ balance: true });
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => label.startsWith("Remove"))).toBe(false);
  });

  it("CONTROL: the PRINTED card offers the Remove-from-the-game pick", () => {
    expect(search({ balance: false }).some((label) => label.startsWith("Remove"))).toBe(true);
  });
});
