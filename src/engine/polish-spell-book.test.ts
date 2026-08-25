import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  spellLimitFor,
  type GameAction,
  type GameState,
  type LegalAction
} from "./index";
import {
  buildStructureAdventure,
  openDiscardPickChoice,
  openSharedDeckSearch,
  pumpAdventureQueues
} from "./adventure-reducer";
import {
  gainExperience,
  processPendingVisit,
  startAdventureRound,
  startPlayerTurn
} from "./adventure";
import {
  CAST_A_SPELL_CARD_ID,
  midRoundRefreshablePolishUsedSpells,
  partitionPolishBookAtRoundStart,
  polishBookSpellEffectIsLive,
  polishBookSpellRefreshBlocked
} from "./polish-spell-book";
import { MORALE_CARD_IDS } from "@/data/cards/morale";

function ownedCount(player: ReturnType<typeof createAdventureGameState>["players"][string], cardId: string): number {
  return [...player.deck, ...player.hand, ...player.discard].filter((candidate) => candidate === cardId).length;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

function polishCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  const adventure = createAdventureGameState({ startingBuildings: [],
    seed: `${seed}-rules`,
    ruleset: "binh",
    rollFirstPlayer: false,
    houseRules: { "polish-spell-book": true }
  });
  state.adventure = adventure.adventure;
  state.ruleset = "binh";
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.players.p1.hand = [];
  state.players.p1.discard = [];
  state.players.p1.spellBook = [];
  state.players.p1.spellBookUsed = [];
  state.players.p2.hand = [];
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 50;
  target.damage = 0;
  return state;
}

function castAtSkeletons(state: GameState, cardId: string): LegalAction {
  const legal = getLegalActions(state, "p1").find(
    (candidate) =>
      candidate.action.type === "CAST_SPELL" &&
      candidate.action.cardId === cardId &&
      candidate.action.fromSpellBook &&
      candidate.action.target.type === "unit" &&
      candidate.action.target.unitId === "unit_p2_skeletons"
  );
  expect(legal, `${cardId} should be castable from the Polish Book`).toBeTruthy();
  return legal!;
}

describe("Polish Spell Book setup", () => {
  it("gives Might 1 and Magic 2 Cast-a-Spell cards while seeding the matching Magic Arrows in Book", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-starting",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true },
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Solmyr", factionId: "tower", heroDefId: "solmyr" },
      ],
    });

    expect(ownedCount(state.players.p1, CAST_A_SPELL_CARD_ID)).toBe(1);
    expect(ownedCount(state.players.p2, CAST_A_SPELL_CARD_ID)).toBe(2);
    expect(ownedCount(state.players.p1, "spell.magic_arrow")).toBe(0);
    expect(ownedCount(state.players.p2, "spell.magic_arrow")).toBe(0);
    expect(state.players.p1.spellBook).toEqual(["spell.magic_arrow"]);
    expect(state.players.p2.spellBook).toEqual(["spell.magic_arrow", "spell.magic_arrow"]);
    expect(state.players.p1.spellBookUsed).toEqual([]);
    expect(state.players.p2.spellBookUsed).toEqual([]);
  });

  it("forces one Spell deck while retaining split Artifact decks", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-merged-spells",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true, "split-decks": true },
    });
    expect(state.decks.spells).toBeTruthy();
    expect(state.decks["spells-expert"]).toBeUndefined();
    expect(state.decks["artifacts-minor"]).toBeTruthy();
    expect([...state.decks.spells.drawPile, ...state.decks.spells.discardPile]).toContain("spell.implosion");
  });

  it("supersedes the existing stash-style Spell Book when both flags are submitted", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-mutual-exclusion",
      ruleset: "binh",
      rollFirstPlayer: false,
      spellBook: true,
      houseRules: { "polish-spell-book": true },
    });
    expect(state.adventure?.houseRules?.["polish-spell-book"]).toBe(true);
    expect(state.adventure?.spellBook).toBe(false);
  });

  it("registers the supplied card art and printed +1 Power alternative", () => {
    const card = cardLibrary[CAST_A_SPELL_CARD_ID];
    expect(card?.effect.type).toBe("CAST_FROM_SPELL_BOOK");
    expect(card?.assets?.cardImage).toBe("/assets/spells-cast_a_spell.webp");
    expect(card?.tags.join(" ")).toContain("+1 Power");
  });

  it("CONTROL: rule off keeps starting Magic Arrows in the M&M deck", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-off",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": false },
    });
    expect(ownedCount(state.players.p1, CAST_A_SPELL_CARD_ID)).toBe(0);
    expect(ownedCount(state.players.p1, "spell.magic_arrow")).toBeGreaterThan(0);
    expect(state.players.p1.spellBook).toEqual([]);
    expect(state.decks["spells-expert"]).toBeTruthy();
  });
});

describe("Polish Spell Book lifecycle", () => {
  it("atomically spends Cast a Spell and marks the selected Book spell used", () => {
    const state = polishCombat("polish-book-cast");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.lightning_bolt"];

    const cast = castAtSkeletons(state, "spell.lightning_bolt");
    expect(cast.action).toMatchObject({
      fromSpellBook: true,
      castEnablerCardId: CAST_A_SPELL_CARD_ID
    });
    const resolved = passAll(applyOk(state, cast.action));

    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(resolved.players.p1.hand).not.toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.discard).toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.spellBook).not.toContain("spell.lightning_bolt");
    expect(resolved.players.p1.spellBookUsed).toEqual(["spell.lightning_bolt"]);
    expect(getLegalActions(resolved, "p1").some((legal) => legal.action.type === "CAST_SPELL")).toBe(false);
  });

  it("keeps the supplied Cast-a-Spell card's printed +1 Power alternative", () => {
    const state = polishCombat("polish-book-cast-power");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.lightning_bolt"];

    let opened = applyOk(state, castAtSkeletons(state, "spell.lightning_bolt").action);
    const boost = getLegalActions(opened, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === CAST_A_SPELL_CARD_ID &&
        legal.action.asPowerBoost
    );
    expect(boost, "the second Cast card should be discardable for its printed +1 Power").toBeTruthy();
    opened = applyOk(opened, boost!.action);
    const resolved = passAll(opened);
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(resolved.players.p1.discard.filter((id) => id === CAST_A_SPELL_CARD_ID)).toHaveLength(2);
  });

  it("rejects a forged attempt to cast a used Spell even with an enabler in hand", () => {
    const state = polishCombat("polish-book-used-backstop");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBookUsed = ["spell.lightning_bolt"];

    const result = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.lightning_bolt",
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      fromSpellBook: true,
      castEnablerCardId: CAST_A_SPELL_CARD_ID
    });
    expect(result.errors.map((error) => error.message).join(" ")).toContain("not legal");
    expect(result.state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(result.state.players.p1.spellBookUsed).toEqual(["spell.lightning_bolt"]);
  });

  it("Knowledge returns only Cast a Spell while the selected Spell remains used", () => {
    const state = polishCombat("polish-book-knowledge");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "stat.knowledge"];
    state.players.p1.spellBook = ["spell.lightning_bolt"];

    const opened = applyOk(state, castAtSkeletons(state, "spell.lightning_bolt").action);
    const knowledge = getLegalActions(opened, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.knowledge"
    );
    expect(knowledge).toBeTruthy();
    const resolved = passAll(applyOk(opened, knowledge!.action));

    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.spellBookUsed).toContain("spell.lightning_bolt");
    expect(resolved.players.p1.spellBook).not.toContain("spell.lightning_bolt");
  });

  it("basic Mysticism refreshes the selected Book spell AND returns Cast a Spell to hand", () => {
    const state = polishCombat("polish-book-mysticism");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism"];
    state.players.p1.spellBook = ["spell.lightning_bolt"];

    const opened = applyOk(state, castAtSkeletons(state, "spell.lightning_bolt").action);
    const mysticism = getLegalActions(opened, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.mysticism"
    );
    expect(mysticism).toBeTruthy();
    const resolved = passAll(applyOk(opened, mysticism!.action));

    // The Spell flips back to refreshed…
    expect(resolved.players.p1.spellBook).toContain("spell.lightning_bolt");
    expect(resolved.players.p1.spellBookUsed).not.toContain("spell.lightning_bolt");
    expect(resolved.players.p1.hand).not.toContain("spell.lightning_bolt");
    // …and the reference sheet's "Cast a Spell returns → Hand" clause fires, so the
    // consumed enabler comes back to hand rather than lingering in the discard pile.
    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.discard).not.toContain(CAST_A_SPELL_CARD_ID);
  });

  // FLIPPED (2026-08-11, user report "Expert Misticysm now - adds +1 SP to magic
  // arrow - but it shouldnt"). This test used to assert the opposite — that the
  // expert side lifted the cast to Power 3 — from b2d427bd's misreading of the
  // Polish reference sheet. Mysticism prints no Power rider on either side, and
  // docs/polish-house-rules-plan.md records the expert rider as "unchanged"; the
  // +1 also never existed on the other two Mysticism paths (the attack-window
  // instant recall and the cast-reaction recall). Full behaviour, with the Magic
  // Arrow repro and the non-power class sweep, in mysticism-no-spell-power.test.ts.
  it("expert Mysticism leaves the Power of the cast it answers alone", () => {
    // CONTROL half: basic Mysticism leaves the Lightning Bolt at its printed 2.
    const basicState = polishCombat("polish-book-mysticism-basic-power");
    basicState.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism"];
    basicState.players.p1.spellBook = ["spell.lightning_bolt"];
    const basicOpened = applyOk(basicState, castAtSkeletons(basicState, "spell.lightning_bolt").action);
    const basicMyst = getLegalActions(basicOpened, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.mysticism"
    );
    const basicResolved = passAll(applyOk(basicOpened, basicMyst!.action));
    expect(basicResolved.combat!.units.unit_p2_skeletons.damage).toBe(2);

    // Expert half: a crown pays the expert side and the cast STAYS at its
    // printed 2 — the expert side buys the support-card sweep, not Power.
    const state = polishCombat("polish-book-mysticism-expert-power");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism"];
    state.players.p1.spellBook = ["spell.lightning_bolt"];
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;

    const opened = applyOk(state, castAtSkeletons(state, "spell.lightning_bolt").action);
    const expertMyst = getLegalActions(opened, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "ability.mysticism" &&
        legal.action.mode === "expert"
    );
    expect(expertMyst, "expert Mysticism should be offered with a crown available").toBeTruthy();
    const resolved = passAll(applyOk(opened, expertMyst!.action));
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
    // Expert still refreshes the Spell and returns the enabler like basic.
    expect(resolved.players.p1.spellBook).toContain("spell.lightning_bolt");
    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.hand).not.toContain("ability.mysticism");
    expect(resolved.players.p1.discard).toContain("ability.mysticism");
  });

  it("refreshes every used Spell at the beginning of a new game round", () => {
    const state = polishCombat("polish-book-round-refresh");
    state.players.p1.spellBookUsed = ["spell.haste", "spell.lightning_bolt"];
    state.players.p1.spellBook = ["spell.slow"];
    state.round = 2;
    startAdventureRound(state);
    expect(state.players.p1.spellBook).toEqual(["spell.slow", "spell.haste", "spell.lightning_bolt"]);
    expect(state.players.p1.spellBookUsed).toEqual([]);
  });

  it("routes a searched Spell straight into the refreshed Book", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-search-gain",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.decks.spells.discardPile = [];
    state.decks.spells.drawPile = ["spell.haste"];
    openSharedDeckSearch(state, "p1", "spells", 1, true);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected Spell search");
    }
    state = applyOk(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      pick: { kind: "revealed", index: 0 }
    });
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(state.players.p1.hand).not.toContain("spell.haste");
  });

  it("adapts discard-recovery cards to refresh used Book spells", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-recovery",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste", "spell.slow"];
    state.players.p1.discard = [CAST_A_SPELL_CARD_ID];
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(true);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected Polish Book refresh choice");
    }
    expect(state.pendingChoice.options.every((option) => option.label.startsWith("Refresh"))).toBe(true);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 0
    });
    expect(state.players.p1.spellBook).toHaveLength(1);
    expect(state.players.p1.spellBookUsed).toHaveLength(1);
    // Reference sheet: these recovery cards ALSO return one Cast a Spell enabler
    // from the discard pile to hand (fired up front, before the refresh pick).
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.players.p1.discard).not.toContain(CAST_A_SPELL_CARD_ID);
  });

  it("names the Spell Book (not the discard pile) when every recover option is a Book refresh, and refreshes exactly the picked Spell", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-refresh-prompt",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste", "spell.slow", "spell.lightning_bolt"];
    // Nothing in the discard pile — so every recover option is a Book refresh.
    state.players.p1.discard = [];
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(true);
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the Polish Book refresh choice");
    }
    // ONE option per USED Book Spell — the player picks which to refresh.
    expect(state.pendingChoice.options).toHaveLength(3);
    expect(state.pendingChoice.options.every((option) => option.label.startsWith("Refresh"))).toBe(true);
    // Honest prompt: it NAMES the Spell Book and never the discard pile (nothing
    // is being taken off the discard here).
    expect(state.pendingChoice.prompt).toMatch(/Spell Book/);
    expect(state.pendingChoice.prompt).not.toMatch(/discard pile/i);

    // Pick Slow: exactly that Spell moves used → refreshed (castable again),
    // leaving the other two used.
    const slowIndex = state.pendingChoice.discardPick?.cardIds.indexOf("spell.slow") ?? -1;
    expect(slowIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: slowIndex
    });
    expect(state.players.p1.spellBook).toEqual(["spell.slow"]);
    expect(new Set(state.players.p1.spellBookUsed)).toEqual(new Set(["spell.haste", "spell.lightning_bolt"]));
  });

  it("names BOTH the discard pile and the Spell Book when the recover pick mixes them", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-refresh-mixed",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    // A hero-specialty in the discard is a genuine "spell-or-specialty" discard
    // candidate (not excluded like a discard Spell is), so the pick mixes a
    // discard take with a Book refresh.
    state.players.p1.discard = ["specialty.ciele.1"];
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell-or-specialty" })).toBe(true);
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the Polish Book mixed recover choice");
    }
    expect(state.pendingChoice.prompt).toMatch(/discard pile/i);
    expect(state.pendingChoice.prompt).toMatch(/Spell Book/);
  });

  it("lets Ciele I refresh a used Magic Arrow and Ciele IV cast a refreshed one for free", () => {
    let map = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-ciele-i",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    map.players.p1.canMulligan = false;
    map.players.p1.needsHandRefresh = false;
    map.players.p1.hand = ["specialty.ciele.1"];
    map.players.p1.discard = [];
    map.players.p1.spellBook = [];
    map.players.p1.spellBookUsed = ["spell.magic_arrow"];
    const recall = getLegalActions(map, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.ciele.1" &&
        legal.action.optionIndex === 0
    );
    expect(recall, "Ciele I should read the used side of the Polish Book").toBeTruthy();
    map = applyOk(map, recall!.action);
    expect(map.pendingChoice?.type).toBe("OPTION_CHOICE");
    map = applyOk(map, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: map.pendingChoice!.id,
      optionIndex: 0
    });
    expect(map.players.p1.spellBook).toContain("spell.magic_arrow");
    expect(map.players.p1.spellBookUsed).not.toContain("spell.magic_arrow");

    const combat = polishCombat("polish-book-ciele-iv");
    combat.players.p1.hand = ["specialty.ciele.4"];
    combat.players.p1.spellBook = ["spell.magic_arrow"];
    const cast = getLegalActions(combat, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.fromSpellDeck === "specialty.ciele.4" &&
        legal.action.fromOwnDiscard
    );
    expect(cast, "Ciele IV should cast the refreshed Book arrow without Cast a Spell").toBeTruthy();
    const resolved = passAll(applyOk(combat, cast!.action));
    expect(resolved.players.p1.spellBook).not.toContain("spell.magic_arrow");
    expect(resolved.players.p1.spellBookUsed).toContain("spell.magic_arrow");
    expect(resolved.players.p1.discard).toContain("specialty.ciele.4");
    expect(resolved.players.p1.combatStats.spellsCastThisRound).toBe(0);
  });

  // User ruling 2026-08-04: the Wish is FAR too strong when it refreshes a Book
  // Spell (a Dimension Door back every fight). Under the Polish Book it runs the
  // PRINTED dig instead, and the card it can take out of the M&M deck is a
  // "Cast a Spell" enabler — never a Book refresh.
  it("Genie Wish digs the deck and takes a Cast a Spell — it NEVER refreshes a Book Spell", () => {
    const state = polishCombat("polish-book-genie");
    const genie = state.combat!.units.unit_p1_griffins;
    genie.abilities = ["genie-spell-draw-few"];
    state.combat!.activeUnitId = genie.id;
    state.players.p1.deck = ["stat.attack", CAST_A_SPELL_CARD_ID, "stat.power"];
    state.players.p1.spellBookUsed = ["spell.haste"];

    const wish = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_GENIE_DECK_DRAW" && legal.action.unitId === genie.id
    );
    expect(wish).toBeTruthy();
    const resolved = applyOk(state, wish!.action);
    expect(resolved.players.p1.deck).toEqual([]);
    // The enabler is TAKEN to hand; the two statistics go to the discard.
    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.discard).toEqual(
      expect.arrayContaining(["stat.attack", "stat.power"])
    );
    expect(resolved.players.p1.discard).not.toContain(CAST_A_SPELL_CARD_ID);
    // The used Book Spell is UNTOUCHED — no refresh (mutation control: the old
    // behaviour moved it back into `spellBook`).
    expect(resolved.players.p1.spellBookUsed).toEqual(["spell.haste"]);
    expect(resolved.players.p1.spellBook).not.toContain("spell.haste");
    expect(resolved.combat!.units[genie.id].activatedThisRound).toBe(true);
  });

  it("CONTROL: no Cast a Spell in the dug cards → nothing taken, every card discarded", () => {
    const state = polishCombat("polish-book-genie-nothing-taken");
    const genie = state.combat!.units.unit_p1_griffins;
    genie.abilities = ["genie-spell-draw-few"];
    state.combat!.activeUnitId = genie.id;
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    state.players.p1.spellBookUsed = ["spell.haste"];

    const wish = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_GENIE_DECK_DRAW" && legal.action.unitId === genie.id
    );
    expect(wish, "the printed dig is offered whenever there are cards to dig").toBeTruthy();
    const resolved = applyOk(state, wish!.action);
    expect(resolved.players.p1.hand).toEqual([]);
    expect(resolved.players.p1.discard).toEqual(
      expect.arrayContaining(["stat.attack", "stat.defense", "stat.power"])
    );
    expect(resolved.players.p1.spellBookUsed).toEqual(["spell.haste"]);
  });

  it("the Few's Wish is offered with NOTHING used in the Book (the dig is the ability)", () => {
    const state = polishCombat("polish-book-genie-nothing-used");
    const genie = state.combat!.units.unit_p1_griffins;
    genie.abilities = ["genie-spell-draw-few"];
    state.combat!.activeUnitId = genie.id;
    state.players.p1.deck = ["stat.attack", CAST_A_SPELL_CARD_ID, "stat.power"];
    state.players.p1.spellBookUsed = [];

    const wish = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_GENIE_DECK_DRAW" && legal.action.unitId === genie.id
    );
    expect(wish, "the dig no longer needs a used Book Spell").toBeTruthy();
    expect(applyOk(state, wish!.action).players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
  });

  it("CONTROL: with an empty deck AND discard the Wish is not offered (nothing to dig)", () => {
    const state = polishCombat("polish-book-genie-empty-deck");
    const genie = state.combat!.units.unit_p1_griffins;
    genie.abilities = ["genie-spell-draw-few"];
    state.combat!.activeUnitId = genie.id;
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    state.players.p1.spellBookUsed = ["spell.haste"];

    const wish = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_GENIE_DECK_DRAW" && legal.action.unitId === genie.id
    );
    expect(wish, "no cards to dig — and there is no refresh payoff any more").toBeFalsy();
  });

  it("the Pack's on-attack Wish digs and takes the Cast a Spell, Book untouched", () => {
    const state = polishCombat("polish-book-genie-pack-refresh");
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = ["genie-spell-draw-pack"];
    attacker.position = 1;
    const target = state.combat!.units.unit_p2_skeletons;
    target.position = 13; // non-adjacent → ranged, no retaliation
    state.players.p1.deck = ["stat.attack", CAST_A_SPELL_CARD_ID, "stat.power"];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.combat!.dice.scriptedRolls = [0];

    const next = passAll(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: attacker.id,
        defenderId: target.id
      })
    );
    expect(next.players.p1.deck).toEqual([]);
    expect(next.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(next.players.p1.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.power"]));
    expect(next.players.p1.spellBookUsed).toEqual(["spell.haste"]);
    expect(next.players.p1.spellBook).not.toContain("spell.haste");
  });

  it("Crown of Dragontooth removes a refreshed or used Book Spell before Search 2", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-crown",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = ["artifact.crown_of_dragontooth"];
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.decks.spells.drawPile = ["spell.slow", "spell.bless"];
    state.decks.spells.discardPile = [];

    const replace = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.crown_of_dragontooth" &&
        legal.action.optionIndex === 1
    );
    expect(replace, "Crown option B should be payable from either side of the Polish Book").toBeTruthy();
    state = applyOk(state, { ...replace!.action, costCardIds: ["spell.haste"] } as GameAction);
    expect(state.players.p1.removed).toContain("spell.haste");
    expect(state.players.p1.spellBookUsed).not.toContain("spell.haste");
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected Crown Search 2");
    }
    expect(state.pendingChoice.revealedCardIds).toHaveLength(2);
    state = applyOk(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      pick: { kind: "revealed", index: 0 }
    });
    expect(state.players.p1.spellBook).toHaveLength(1);
    expect(state.players.p1.hand.every((cardId) => cardLibrary[cardId]?.kind !== "spell")).toBe(true);
  });

  it("Crown of Dragontooth option A does BOTH: returns Cast a Spell to hand AND refreshes a used Book spell", () => {
    // USER REQUIREMENT: in Book mode the Crown must ALSO return the Cast a Spell
    // enabler (Discard→Hand) and refresh a used Book spell — the same "√: return
    // Cast a Spell (Discard→Hand). Refresh spell (1)" recover arm the four
    // discard-recovery artifacts carry. Option A (TAKE_FROM_DISCARD, filter
    // "spell") routes through the shared openDiscardPickChoice Polish path.
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-crown-recover",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = ["artifact.crown_of_dragontooth"];
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste", "spell.slow"];
    state.players.p1.discard = [CAST_A_SPELL_CARD_ID, "stat.attack"];

    const recover = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.crown_of_dragontooth" &&
        legal.action.optionIndex === 0
    );
    expect(recover, "Crown option A recover arm should be playable off the used Book").toBeTruthy();
    state = applyOk(state, recover!.action);

    // The Cast a Spell enabler comes back to hand up front (before the refresh pick).
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.players.p1.discard).not.toContain(CAST_A_SPELL_CARD_ID);

    // …and the recover arm offers refreshing a used Book spell (not "take to hand").
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the used-Spell refresh choice");
    }
    expect(state.pendingChoice.options.every((option) => option.label.startsWith("Refresh"))).toBe(true);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 0
    });
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(state.players.p1.spellBookUsed).not.toContain("spell.haste");
    expect(state.players.p1.spellBookUsed).toContain("spell.slow");
    expect(state.pendingChoice, "Crown refreshes exactly one Spell and closes the picker").toBeNull();
    // The refreshed Book spell went to the Book, never to the hand — the only
    // "spell"-kind card the recover ever put in hand is the Cast a Spell enabler.
    expect(state.players.p1.hand).not.toContain("spell.haste");
    expect(state.players.p1.hand).not.toContain("spell.slow");
    expect(state.players.p1.hand.filter((cardId) => cardLibrary[cardId]?.kind === "spell")).toEqual([
      CAST_A_SPELL_CARD_ID
    ]);
  });

  it("CONTROL: with the rule OFF, Crown option A takes 2 Spells from discard to hand and ignores Cast a Spell", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-book-crown-recover-off",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": false }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = ["artifact.crown_of_dragontooth"];
    state.players.p1.discard = [CAST_A_SPELL_CARD_ID, "spell.haste", "spell.slow"];

    const recover = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.crown_of_dragontooth" &&
        legal.action.optionIndex === 0
    );
    expect(recover, "classic Crown option A is a discard Spell recall").toBeTruthy();
    state = applyOk(state, recover!.action);
    // Classic behaviour: the discard Spells themselves are the picks (no "Refresh"
    // wording), and the Cast a Spell card is never touched by the recover.
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the classic discard pick");
    }
    expect(state.pendingChoice.options.every((option) => !option.label.startsWith("Refresh"))).toBe(true);
    expect(state.players.p1.discard).toContain(CAST_A_SPELL_CARD_ID);
  });
});

describe("Polish Mage Guild", () => {
  it("offers Search 3 or one Cast-a-Spell purchase and enforces one token purchase", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-guild-buy",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.resources.gold = 20;
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("castle.mage_guild");

    const legal = getLegalActions(state, "p1");
    expect(legal.some((entry) => entry.label.includes("search (3)"))).toBe(true);
    const buyCast = legal.find(
      (entry) => entry.action.type === "SPELL_BOOK_ACTION" && entry.action.takeCastCard
    );
    expect(buyCast).toBeTruthy();
    const before = state.players.p1.hand.filter((id) => id === CAST_A_SPELL_CARD_ID).length;
    state = applyOk(state, buyCast!.action);
    expect(state.players.p1.hand.filter((id) => id === CAST_A_SPELL_CARD_ID)).toHaveLength(before + 1);
    expect(state.players.p1.townTokens.spellBook).toBe(false);
    expect(
      getLegalActions(state, "p1").some(
        (entry) => entry.action.type === "SPELL_BOOK_ACTION" && entry.action.takeCastCard
      )
    ).toBe(false);
  });

  it("Rolling Spells costs 3 gold, returns one owned Spell, and queues Search 2 once per turn", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-guild-roll",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.resources.gold = 10;
    state.players.p1.spellBook = ["spell.haste"];
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("castle.mage_guild");

    const roll = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "SPELL_BOOK_ACTION" && entry.action.rollSpell?.cardId === "spell.haste"
    );
    expect(roll).toBeTruthy();
    state = applyOk(state, roll!.action);
    expect(state.players.p1.resources.gold).toBe(7);
    expect(state.players.p1.spellBook).not.toContain("spell.haste");
    expect(state.decks.spells.discardPile).toContain("spell.haste");
    expect(state.players.p1.polishSpellRollUsedRound).toBe(state.round);
    expect(
      getLegalActions(state, "p1").some(
        (entry) => entry.action.type === "SPELL_BOOK_ACTION" && Boolean(entry.action.rollSpell)
      )
    ).toBe(false);
    expect(
      Boolean(state.pendingChoice) ||
      Boolean(state.adventure?.rewardQueue.some((reward) => reward.kind === "shared-deck-search" && reward.count === 2))
    ).toBe(true);
  });

  /**
   * USER BUG 2026-08-26: "polish spell book: Rolling spells — still there is a
   * bug that 1st proposition is the same spell you roll — not the first from
   * discard."
   *
   * The roll returns the Spell to the shared Spell discard and queues its own
   * Search (2). That Search opens with the rulebook either/or, whose
   * take-the-discard proposition reads the pile's face-up TOP — which used to be
   * the just-rolled Spell, so 3 gold bought the offer to take it straight back.
   * The rolled Spell now slides UNDER the face-up top instead, so the
   * proposition is the card that was already there ("the first from discard").
   */
  function rollGame(seed: string): GameState {
    const state = createAdventureGameState({ startingBuildings: [],
      seed,
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.resources.gold = 10;
    state.players.p1.spellBook = ["spell.haste"];
    state.players.p1.spellBookUsed = [];
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("castle.mage_guild");
    return state;
  }

  function rollHaste(state: GameState): GameState {
    const roll = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "SPELL_BOOK_ACTION" && entry.action.rollSpell?.cardId === "spell.haste"
    );
    expect(roll).toBeTruthy();
    return applyOk(state, roll!.action);
  }

  function searchModeOptions(state: GameState): { label: string }[] {
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the Search-or-take-discard menu");
    }
    expect(state.pendingChoice.context).toBe("deck-search-mode");
    return state.pendingChoice.options;
  }

  it("Rolling Spells: the queued Search offers the DISCARD TOP, never the rolled Spell", () => {
    let state = rollGame("polish-roll-discard-top");
    // A deterministic pile: Bless is the face-up top the Search must offer.
    state.decks.spells.discardPile = ["spell.magic_arrow", "spell.bless"];

    state = rollHaste(state);

    // The rolled Spell is really in the pile (nothing created or lost) but it is
    // NOT the face-up top — Bless still is.
    const pile = state.decks.spells.discardPile;
    expect(pile).toContain("spell.haste");
    expect(pile[pile.length - 1]).toBe("spell.bless");

    const options = searchModeOptions(state);
    const take = options.findIndex((option) => option.label.startsWith("Take the top discard"));
    expect(take).toBeGreaterThan(-1);
    expect(options[take]!.label).toContain("Bless");
    // The whole menu never mentions the Spell just paid for and rolled away.
    expect(options.every((option) => !/haste/i.test(option.label))).toBe(true);

    // Taking the proposition really moves BLESS (not Haste) into the Book.
    const choiceId = state.pendingChoice!.id;
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: take });
    expect(state.players.p1.spellBook).toContain("spell.bless");
    expect(state.players.p1.spellBook).not.toContain("spell.haste");
    expect(state.decks.spells.discardPile).not.toContain("spell.bless");
    expect(state.decks.spells.discardPile).toContain("spell.haste");
  });

  it("Rolling Spells with an EMPTY Spell discard still never offers the rolled Spell", () => {
    let state = rollGame("polish-roll-empty-discard");
    // Degenerate pile (an older snapshot / a pile just emptied by a take): the
    // face-up invariant is seeded from the draw pile and the rolled Spell goes
    // under THAT, so it can never be the proposition either.
    state.decks.spells.drawPile = [...state.decks.spells.discardPile, ...state.decks.spells.drawPile];
    state.decks.spells.discardPile = [];

    state = rollHaste(state);

    const pile = state.decks.spells.discardPile;
    expect(pile).toContain("spell.haste");
    expect(pile.length).toBeGreaterThan(1);
    expect(pile[pile.length - 1]).not.toBe("spell.haste");
    if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "deck-search-mode") {
      expect(state.pendingChoice.options.every((option) => !/haste/i.test(option.label))).toBe(true);
    }
  });

  it("CONTROL: an ordinary Search still offers the pile's genuine face-up top", () => {
    // The fix must not have removed (or blanket-skipped) the take-the-top-discard
    // proposition: a Spell that reached the shared discard WITHOUT a roll — a
    // cast, a bin — is still the card the next Search offers.
    let state = rollGame("polish-roll-control-top");
    state.decks.spells.discardPile = ["spell.magic_arrow", "spell.bless"];
    // The classic route onto a shared discard: pushed on top.
    state.decks.spells.discardPile.push("spell.slow");

    openSharedDeckSearch(state, "p1", "spells", 2);
    const options = searchModeOptions(state);
    const take = options.findIndex((option) => option.label.startsWith("Take the top discard"));
    expect(take).toBeGreaterThan(-1);
    expect(options[take]!.label).toContain("Slow");
    expect(options[take]!.label).not.toContain("Bless");
  });

  it("a newly built Guild offers two Search-3-or-Cast rewards", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-guild-build",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    buildStructureAdventure(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: town.id,
      buildingId: "castle.mage_guild"
    });
    const rewards = state.adventure!.rewardQueue.filter(
      (reward) => reward.kind === "shared-deck-search" && reward.allowCastCardInstead
    );
    expect(rewards).toHaveLength(2);
    expect(rewards.every((reward) => reward.kind === "shared-deck-search" && reward.count === 3)).toBe(true);
    pumpAdventureQueues(state);
    expect(state.pendingChoice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "polish-spell-or-cast"
    });
  });

  it("grants free Cast-a-Spell cards at levels V and VII only with a Mage Guild", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-guild-level-grants",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    const player = state.players.p1;
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("castle.mage_guild");
    const before = player.hand.filter((id) => id === CAST_A_SPELL_CARD_ID).length;
    gainExperience(state, "p1", 8);
    expect(state.heroes.hero_p1.level).toBe(5);
    expect(player.hand.filter((id) => id === CAST_A_SPELL_CARD_ID)).toHaveLength(before + 1);
    gainExperience(state, "p1", 4);
    expect(state.heroes.hero_p1.level).toBe(7);
    expect(player.hand.filter((id) => id === CAST_A_SPELL_CARD_ID)).toHaveLength(before + 2);
  });

  it("does not grant the level-V Cast-a-Spell card without a built Mage Guild", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-guild-level-no-guild",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    const before = ownedCount(state.players.p1, CAST_A_SPELL_CARD_ID);
    gainExperience(state, "p1", 8);
    expect(state.heroes.hero_p1.level).toBe(5);
    expect(ownedCount(state.players.p1, CAST_A_SPELL_CARD_ID)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Reaction gating (Task B): casting a Book Spell as an instant/reaction still
// needs — and consumes — a Cast a Spell card, exactly like an on-turn cast.
// ---------------------------------------------------------------------------

describe("Polish Spell Book — casting a Book Spell as a reaction requires Cast a Spell", () => {
  function openBloodlustWindow(seed: string, hand: string[]): GameState {
    // Bloodlust buffs a ground/flying attacker in the attack window — the flying
    // Griffins set adjacent to the Skeletons (the spell-book.test.ts pattern).
    const state = polishCombat(seed);
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.position = 9;
    state.players.p1.hand = hand;
    state.players.p1.spellBook = ["spell.bloodlust"];
    const opened = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(opened.reactionWindow, "declaring the attack opens the buff window").toBeTruthy();
    return opened;
  }

  it("offers the Book reaction only with a Cast a Spell card in hand, and consumes it", () => {
    const opened = openBloodlustWindow("polish-react-with", [CAST_A_SPELL_CARD_ID]);
    const play = getLegalActions(opened, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.bloodlust" &&
        Boolean(legal.action.fromSpellBook)
    );
    expect(play, "a Book reaction is offered when the enabler is in hand").toBeTruthy();
    expect(play!.action).toMatchObject({ castEnablerCardId: CAST_A_SPELL_CARD_ID });

    const resolved = passAll(applyOk(opened, play!.action));
    // The enabler was spent (hand → discard) and the Spell is now used.
    expect(resolved.players.p1.hand).not.toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.discard).toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.spellBook).not.toContain("spell.bloodlust");
    expect(resolved.players.p1.spellBookUsed).toContain("spell.bloodlust");
  });

  it("CONTROL: without a Cast a Spell card in hand the Book reaction is not offered", () => {
    const opened = openBloodlustWindow("polish-react-without", []);
    const offered = getLegalActions(opened, "p1").some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.bloodlust" &&
        Boolean(legal.action.fromSpellBook)
    );
    expect(offered, "no enabler in hand → the Book reaction is gated out").toBe(false);
  });

  it("CONTROL: resolution rejects a Book reaction when the enabler is not actually in hand", () => {
    const opened = openBloodlustWindow("polish-react-forge", [CAST_A_SPELL_CARD_ID]);
    const play = getLegalActions(opened, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.bloodlust" &&
        Boolean(legal.action.fromSpellBook)
    );
    // Palm the enabler away, then force the very same action: the resolution guard
    // (consumePolishSpellBookCast) must reject it — offer removal is not the only line.
    opened.players.p1.hand = [];
    const result = applyAction(opened, play!.action);
    expect(result.errors.length, "a Book reaction with no enabler in hand must be rejected").toBeGreaterThan(0);
    expect(result.state.players.p1.spellBook).toContain("spell.bloodlust");
  });
});

// ---------------------------------------------------------------------------
// Intelligence (reference sheet): basic = "Start of Combat: Cast a Spell" (the
// SPELL_CAST_ANYTIME freedom, limit 1); expert adds "+1 Limit" (limit rises to
// 2 — NOT the base game's unlimited). USER RULE (2026-07): while the effect is
// held, a Book Spell is selected and cast DIRECTLY — no Cast a Spell card
// needed or consumed ("as if you used cast a spell card").
// ---------------------------------------------------------------------------

describe("Polish Intelligence", () => {
  function playIntelligence(state: GameState, mode: "basic" | "expert"): GameState {
    state.players.p1.hand = ["ability.intelligence"];
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.intelligence" &&
        legal.action.mode === mode
    );
    expect(play, `Intelligence (${mode}) should be playable`).toBeTruthy();
    return applyOk(state, play!.action);
  }

  it("Expert Intelligence raises the per-round Spell limit by exactly 1", () => {
    const after = playIntelligence(polishCombat("polish-intelligence-expert"), "expert");
    expect(spellLimitFor(after, after.players.p1)).toBe(2);
  });

  it("basic Intelligence grants the cast freedom but no extra limit (still 1)", () => {
    const after = playIntelligence(polishCombat("polish-intelligence-basic"), "basic");
    expect(spellLimitFor(after, after.players.p1)).toBe(1);
  });

  it("USER RULE: with Intelligence held, a Book Spell casts directly — no Cast a Spell needed or consumed", () => {
    const state = playIntelligence(polishCombat("polish-intelligence-free-cast"), "basic");
    state.players.p1.spellBook = ["spell.magic_arrow"];
    state.players.p1.hand = [];

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        Boolean(legal.action.fromSpellBook) &&
        legal.action.castEnablerCardId === undefined &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "the Book cast is offered with NO enabler in hand").toBeTruthy();
    expect(cast!.label).toContain("Intelligence");

    const resolved = passAll(applyOk(state, cast!.action));
    expect(resolved.players.p1.spellBook).not.toContain("spell.magic_arrow");
    expect(resolved.players.p1.spellBookUsed).toContain("spell.magic_arrow");
    expect(resolved.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("with Intelligence AND an enabler in hand, the cast is free and Cast a Spell stays in hand", () => {
    const state = playIntelligence(polishCombat("polish-intelligence-keeps-enabler"), "basic");
    state.players.p1.spellBook = ["spell.magic_arrow"];
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];

    const cast = castAtSkeletons(state, "spell.magic_arrow");
    expect(
      cast.action.type === "CAST_SPELL" ? cast.action.castEnablerCardId : "wrong-type"
    ).toBeUndefined();

    const resolved = passAll(applyOk(state, cast.action));
    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.spellBookUsed).toContain("spell.magic_arrow");
  });

  it("CONTROL: without Intelligence a Book cast still needs the Cast a Spell enabler", () => {
    const state = polishCombat("polish-intelligence-enabler-control");
    state.players.p1.spellBook = ["spell.magic_arrow"];
    state.players.p1.hand = [];

    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "CAST_SPELL" && Boolean(legal.action.fromSpellBook)
    );
    expect(offered, "no enabler + no Intelligence → no Book cast").toBe(false);

    const forced = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      fromSpellBook: true,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    } as GameAction);
    expect(forced.errors.length, "a forged enabler-less cast is rejected").toBeGreaterThan(0);
    expect(forced.state.players.p1.spellBook).toContain("spell.magic_arrow");
  });

  it("CONTROL: with the rule OFF, Expert Intelligence lifts the limit entirely", () => {
    const state = createInitialGameState("polish-intelligence-off");
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.players.p1.hand = ["ability.intelligence"];
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.intelligence" &&
        legal.action.mode === "expert"
    );
    const after = applyOk(state, play!.action);
    expect(spellLimitFor(after, after.players.p1)).toBe(Number.POSITIVE_INFINITY);
  });
});

// ---------------------------------------------------------------------------
// Discard-recovery artifacts (reference sheet): "√: return Cast a Spell
// (Discard→Hand). Refresh spell (1)". Rib Cage additionally shuffles.
// ---------------------------------------------------------------------------

describe("Polish Spell Book — discard-recovery artifacts", () => {
  const RECOVERY_ARTIFACTS = [
    "artifact.rib_cage",
    "artifact.helm_of_the_alabaster_unicorn",
    "artifact.crown_of_the_five_seas",
    "artifact.thunder_helmet"
  ];

  it("all four name a count-1, Spell-filtered TAKE_FROM_DISCARD recover arm (shared path)", () => {
    for (const id of RECOVERY_ARTIFACTS) {
      const effect = cardLibrary[id]?.effect;
      expect(effect?.type, `${id} should be a CHOOSE_ONE`).toBe("CHOOSE_ONE");
      if (effect?.type !== "CHOOSE_ONE") {
        throw new Error("unreachable");
      }
      const recover = effect.options[0]?.effect;
      expect(recover, `${id} option 0 recover effect`).toMatchObject({
        type: "TAKE_FROM_DISCARD",
        count: 1,
        filter: "spell"
      });
    }
  });

  function playRecoveryArtifact(seed: string, artifactId: string, extraDiscard: string[]): GameState {
    let state = createAdventureGameState({ startingBuildings: [],
      seed,
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = [artifactId];
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.players.p1.discard = [CAST_A_SPELL_CARD_ID, ...extraDiscard];
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === artifactId &&
        legal.action.optionIndex === 0
    );
    expect(play, `${artifactId} recover arm should be playable on the map`).toBeTruthy();
    return applyOk(state, play!.action);
  }

  it("Rib Cage returns Cast a Spell to hand, refreshes a used Book Spell, and shuffles the rest", () => {
    let state = playRecoveryArtifact("polish-ribcage", "artifact.rib_cage", ["stat.attack"]);
    // The enabler is already back in hand (returned up front), before the refresh.
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the used-Spell refresh choice");
    }
    expect(state.pendingChoice.options.every((option) => option.label.startsWith("Refresh"))).toBe(true);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 0
    });
    // Refreshed the used Spell…
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(state.players.p1.spellBookUsed).not.toContain("spell.haste");
    // …the enabler stayed in hand (never shuffled away)…
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    // …and Rib Cage's "shuffle the rest into your deck" fired (discard emptied).
    expect(state.players.p1.discard).toHaveLength(0);
    expect(state.players.p1.deck).toContain("stat.attack");
  });

  it("Crown of the Five Seas returns Cast a Spell + refreshes, with NO shuffle", () => {
    let state = playRecoveryArtifact("polish-five-seas", "artifact.crown_of_the_five_seas", ["stat.attack"]);
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the used-Spell refresh choice");
    }
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 0
    });
    expect(state.players.p1.spellBook).toContain("spell.haste");
    // No shuffle side effect — the leftover discard card stays put.
    expect(state.players.p1.discard).toContain("stat.attack");
  });

  it("CONTROL: with the rule OFF, the recover arm takes a Spell from discard and never touches Cast a Spell", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-recovery-off",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": false }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = ["artifact.crown_of_the_five_seas"];
    state.players.p1.discard = ["spell.haste"];
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.crown_of_the_five_seas" &&
        legal.action.optionIndex === 0
    );
    state = applyOk(state, play!.action);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the classic discard pick");
    }
    // Classic behaviour: the discard Spell itself is the pick (no "Refresh" wording).
    expect(state.pendingChoice.options.some((option) => option.label.includes("spell.haste") || option.label.includes("Haste"))).toBe(true);
    expect(state.pendingChoice.options.every((option) => !option.label.startsWith("Refresh"))).toBe(true);
  });
});

describe("Polish Spell Book — co-composition fixes", () => {
  function polishAdventure(seed: string): GameState {
    return createAdventureGameState({ startingBuildings: [],
      seed,
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true },
      moraleCards: true
    });
  }

  it("morale repeat_search returns a Book Spell to the shared Spell discard, never personal discard", () => {
    // Seed: player held a Book Spell from a Search; accepting repeat_search must
    // uninscribe it to the SHARED discard (mutation control: personal discard).
    let state = polishAdventure("polish-morale-repeat-book");
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.spellBook = ["spell.haste"];
    state.players.p1.spellBookUsed = [];
    state.players.p1.discard = [];
    // Inject a held Positive Morale repeat_search card.
    state.players.p1.moraleCards = { positive: [MORALE_CARD_IDS.repeatSearch], negative: [] };
    // Open the morale-repeat-search choice as if a Search just kept Haste into Book.
    state.pendingChoice = {
      id: "choice_morale_repeat",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Discard the gained card to Search again?",
      options: [{ label: "Discard Haste and Search again" }, { label: "Keep Haste" }],
      context: "morale-repeat-search",
      moraleRepeatSearch: { cardId: "spell.haste", deckId: "spells", count: 2 },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";

    const sharedBefore = state.decks.spells?.discardPile.length ?? 0;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_morale_repeat",
      optionIndex: 0
    });

    expect(state.players.p1.spellBook).not.toContain("spell.haste");
    expect(state.players.p1.discard).not.toContain("spell.haste");
    expect(state.decks.spells?.discardPile).toContain("spell.haste");
    expect((state.decks.spells?.discardPile.length ?? 0)).toBe(sharedBefore + 1);
  });

  /**
   * The Rolling Spells bug in its SECOND flow: the Tournament Morale
   * "Search again" card discards the Spell just gained and re-opens the SAME
   * Spell Search, so a Spell uninscribed onto the top of the shared pile came
   * straight back as that Search's take-the-top-discard proposition. It goes
   * UNDER the face-up top for the same reason.
   */
  it("morale repeat_search: the re-run Search offers the discard TOP, never the Spell just returned", () => {
    let state = polishAdventure("polish-morale-repeat-not-offered");
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.spellBook = ["spell.haste"];
    state.players.p1.spellBookUsed = [];
    state.players.p1.discard = [];
    state.players.p1.moraleCards = { positive: [MORALE_CARD_IDS.repeatSearch], negative: [] };
    state.decks.spells!.discardPile = ["spell.magic_arrow", "spell.bless"];
    state.pendingChoice = {
      id: "choice_morale_repeat",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Discard the gained card to Search again?",
      options: [{ label: "Discard Haste and Search again" }, { label: "Keep Haste" }],
      context: "morale-repeat-search",
      moraleRepeatSearch: { cardId: "spell.haste", deckId: "spells", count: 2 },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_morale_repeat",
      optionIndex: 0
    });

    const pile = state.decks.spells!.discardPile;
    expect(pile).toContain("spell.haste");
    expect(pile[pile.length - 1]).toBe("spell.bless");
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the re-run Search menu");
    }
    expect(state.pendingChoice.context).toBe("deck-search-mode");
    const take = state.pendingChoice.options.findIndex((option) =>
      option.label.startsWith("Take the top discard")
    );
    expect(take).toBeGreaterThan(-1);
    expect(state.pendingChoice.options[take]!.label).toContain("Bless");
    expect(state.pendingChoice.options.every((option) => !/haste/i.test(option.label))).toBe(true);
  });

  it("Event remove-for-search offers Book Spells and never Cast a Spell", () => {
    const state = polishAdventure("polish-event-remove-book");
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "stat.attack"];
    state.players.p1.spellBook = ["spell.haste", "spell.magic_arrow"];
    state.players.p1.spellBookUsed = ["spell.slow"];
    state.players.p1.removed = [];
    // Need a real field id on the map for pendingVisit.
    const fieldId = Object.keys(state.adventure!.fields)[0];
    const heroId = Object.keys(state.heroes).find((id) => state.heroes[id]?.controllerId === "p1") ?? "hero_p1";
    state.adventure!.pendingVisit = {
      playerId: "p1",
      heroId,
      fieldId,
      steps: [
        {
          type: "EVENT_REMOVE_FOR_SEARCH",
          filter: "spell",
          removed: 0,
          per: 2,
          searchCount: 3,
          searchDecks: ["artifacts"],
          single: true,
          minRemoved: 2,
          mustRemove: 1
        }
      ]
    };
    processPendingVisit(state);
    expect(state.adventure?.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
    const step = state.adventure!.pendingVisit!.steps[0];
    if (step.type !== "CHOOSE_ONE") {
      throw new Error("expected remove menu");
    }
    const labels = step.options.map((option) => option.label);
    expect(labels.some((label) => /haste/i.test(label))).toBe(true);
    expect(labels.some((label) => /slow/i.test(label))).toBe(true);
    // Cast a Spell must NOT be offered as an owned Spell.
    expect(labels.every((label) => !/cast a spell/i.test(label))).toBe(true);
    // Removing a Book Spell lands it in removed.
    const hasteOpt = step.options.find((option) => /haste/i.test(option.label));
    expect(hasteOpt).toBeTruthy();
    state.adventure!.pendingVisit!.steps = [
      ...(hasteOpt!.steps ?? []),
      ...state.adventure!.pendingVisit!.steps.slice(1)
    ];
    processPendingVisit(state);
    expect(state.players.p1.spellBook).not.toContain("spell.haste");
    expect(state.players.p1.removed).toContain("spell.haste");
  });

  it("own-deck dig keep routes a leaked Spell into the Book, not hand", () => {
    let state = polishAdventure("polish-dig-keep-book");
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = [];
    state.players.p1.spellBook = [];
    // Simulate own-deck-pick of a Spell that somehow sat in the M&M deck.
    state.pendingChoice = {
      id: "choice_dig",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Keep one",
      options: [{ label: "Keep Haste" }, { label: "Keep Attack" }],
      context: "own-deck-pick",
      ownDeckPick: { cardIds: ["spell.haste", "stat.attack"] },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_dig",
      optionIndex: 0
    });
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(state.players.p1.hand).not.toContain("spell.haste");
    expect(state.players.p1.discard).toContain("stat.attack");
  });

  it("CONTROL: with the rule OFF, morale repeat_search still uses personal discard", () => {
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-morale-repeat-off",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": false },
      moraleCards: true
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = ["spell.haste"];
    state.players.p1.discard = [];
    state.players.p1.moraleCards = { positive: [MORALE_CARD_IDS.repeatSearch], negative: [] };
    state.pendingChoice = {
      id: "choice_morale_repeat_off",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Discard the gained card to Search again?",
      options: [{ label: "Discard Haste and Search again" }, { label: "Keep Haste" }],
      context: "morale-repeat-search",
      moraleRepeatSearch: { cardId: "spell.haste", deckId: "spells", count: 2 },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_morale_repeat_off",
      optionIndex: 0
    });
    expect(state.players.p1.hand).not.toContain("spell.haste");
    expect(state.players.p1.discard).toContain("spell.haste");
  });
});

/**
 * User demand surface #4: the Basic X Magic +3 expert must be offered AS PART OF
 * a Polish Spell Book cast (Cast a Spell + a refreshed Book Spell) exactly like a
 * hand cast — the up-front `useSchoolFetchExpert` CAST_SPELL variant flows through
 * the same performSpellCast chokepoint, so the crown-spend / +3 fold is shared.
 */
describe("Basic X Magic +3 up-front cast — Polish Spell Book surface", () => {
  it("offers the fetch-expert Book cast (Cast a Spell + Magic Arrow) and resolves at damage 3", () => {
    const state = polishCombat("polish-book-fetch-expert");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.magic_arrow"];
    state.players.p1.spellBookUsed = [];
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    state.players.p1.limits.expertUses = 1;

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.fromSpellBook &&
        legal.action.useSchoolFetchExpert === true &&
        legal.action.castEnablerCardId === CAST_A_SPELL_CARD_ID &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "the up-front +3 fetch-expert Book cast should be offered").toBeTruthy();

    const s = passAll(applyOk(state, cast!.action));
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(3); // Power 0 → 3 (+3)
    expect(s.players.p1.permanents).toEqual([]); // the +3 consumes the fetch permanent
    expect(s.players.p1.discard).toContain("ability.basic_fire_magic");
    expect(s.players.p1.spellBookUsed).toContain("spell.magic_arrow"); // Book spell spent
    expect(s.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("CONTROL: with no crown the fetch-expert Book variant is withheld (the plain Book cast is not)", () => {
    const state = polishCombat("polish-book-fetch-nocrown");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.magic_arrow"];
    state.players.p1.spellBookUsed = [];
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    state.players.p1.limits.expertUses = 0;

    const fetchExpert = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.useSchoolFetchExpert === true
    );
    expect(fetchExpert, "no crown → no up-front +3 Book cast").toBeFalsy();
    // The plain Book cast is still available.
    expect(castAtSkeletons(state, "spell.magic_arrow")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// "In effect" — the third Book section (user ruling 2026-08-04)
// ---------------------------------------------------------------------------

function polishMapGame(seed: string): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: { "polish-spell-book": true }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function resolveMapBoostNow(state: GameState, playerId = "p1"): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "map-spell-boost") {
    return state;
  }
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId,
    choiceId: choice.id,
    optionIndex: choice.mapSpellBoost?.offers.length ?? choice.options.length - 1
  });
}

/** Casts an ongoing map Spell out of the Polish Book; returns the settled state. */
function castOngoingBookSpell(state: GameState, spellId: string, playerId = "p1"): GameState {
  state.players[playerId]!.hand = [CAST_A_SPELL_CARD_ID];
  state.players[playerId]!.spellBook = [spellId];
  state.players[playerId]!.spellBookUsed = [];
  const play = getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === spellId &&
      legal.action.fromSpellBook === true
  );
  expect(play, `${spellId} should be castable from the Polish Book`).toBeTruthy();
  return resolveMapBoostNow(applyOk(state, play!.action), playerId);
}

/**
 * Drives the REAL round wrap: every live seat takes its start-of-turn hand step
 * and then ENDs its turn, so `startAdventureRound` and `startPlayerTurn` run in
 * the same action chain the live game uses (hand-poking `state.round` and
 * calling `startAdventureRound` alone cannot see the ordering bug this pins).
 */
function playOutRound(state: GameState): GameState {
  let current = state;
  const startRound = current.round;
  for (let guard = 0; guard < 12 && current.round === startRound; guard += 1) {
    const playerId = current.activePlayerId;
    for (let hand = 0; hand < 4; hand += 1) {
      const refresh = getLegalActions(current, playerId).find(
        (legal) => legal.action.type === "REFRESH_HAND"
      );
      if (!refresh) {
        break;
      }
      current = applyOk(current, { type: "REFRESH_HAND", playerId, discardCardIds: [] });
    }
    const end = getLegalActions(current, playerId).find((legal) => legal.action.type === "END_TURN");
    expect(end, `${playerId} should be able to end its turn`).toBeTruthy();
    current = applyOk(current, end!.action);
  }
  expect(current.round, "the round should have wrapped").toBe(startRound + 1);
  return current;
}

function effectLive(state: GameState, cardId: string): boolean {
  return state.activeEffects.some(
    (effect) => effect.source.type === "card" && effect.source.cardId === cardId
  );
}

describe("Polish Spell Book — a Spell IN EFFECT cannot be refreshed", () => {
  it("a live Water Walk is NOT refreshable while its caster's turn is still running", () => {
    // The mid-round reading (the one every refresh SOURCE consults) is strict:
    // while the "this turn" effect is up, the Spell is in effect and untouchable.
    // Removing the in-effect gate makes this pass a refresh straight through.
    let state = polishMapGame("polish-book-in-effect-mid-round");
    state = castOngoingBookSpell(state, "spell.water_walk");

    expect(state.players.p1.spellBookUsed).toContain("spell.water_walk");
    expect(effectLive(state, "spell.water_walk")).toBe(true);
    expect(midRoundRefreshablePolishUsedSpells(state, state.players.p1)).not.toContain(
      "spell.water_walk"
    );
    expect(
      polishBookSpellRefreshBlocked(state, "p1", "spell.water_walk", state.players.p1)
    ).toBe("in-effect");

    // Once the effect ends (the caster's next turn starts) it is an ordinary
    // used Book Spell again and every source may refresh it.
    startPlayerTurn(state, "p1");
    expect(effectLive(state, "spell.water_walk")).toBe(false);
    expect(midRoundRefreshablePolishUsedSpells(state, state.players.p1)).toContain(
      "spell.water_walk"
    );
  });

  it("CONTROL: an INSTANT Book Spell cast the same way still refreshes at the round start", () => {
    const state = polishMapGame("polish-book-in-effect-control");
    // View Air resolves at once (resources) and leaves no lasting effect.
    let next = castOngoingBookSpell(state, "spell.view_air");
    expect(next.players.p1.spellBookUsed).toContain("spell.view_air");
    expect(effectLive(next, "spell.view_air")).toBe(false);
    next.round = 2;
    startAdventureRound(next);
    expect(next.players.p1.spellBook).toContain("spell.view_air");
    expect(next.players.p1.spellBookUsed).not.toContain("spell.view_air");
  });

  it("a live Book Spell is neither offered nor refreshable by discard-recovery; a used one is", () => {
    let state = polishMapGame("polish-book-in-effect-recovery");
    state = castOngoingBookSpell(state, "spell.water_walk");
    // A second, plainly USED Book Spell for the control half of the same pick.
    state.players.p1.spellBookUsed = [...(state.players.p1.spellBookUsed ?? []), "spell.haste"];
    state.players.p1.discard = [];

    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(true);
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the Polish Book refresh choice");
    }
    const offered = state.pendingChoice.discardPick?.cardIds ?? [];
    expect(offered).toContain("spell.haste");
    expect(offered, "a Spell in effect is not a refresh candidate").not.toContain("spell.water_walk");

    const hasteIndex = offered.indexOf("spell.haste");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: hasteIndex
    });
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(state.players.p1.spellBookUsed).toContain("spell.water_walk");
  });

  it("with ONLY an in-effect Spell used, a discard-recovery has nothing to recover", () => {
    // The same read gates the recovery card's own playability offer, so it can
    // never look playable while its only candidate is locked in effect.
    let state = polishMapGame("polish-book-in-effect-recovery-empty");
    state = castOngoingBookSpell(state, "spell.water_walk");
    state.players.p1.discard = [];
    expect(state.players.p1.spellBookUsed).toEqual(["spell.water_walk"]);
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(false);
    expect(state.players.p1.spellBookUsed).toEqual(["spell.water_walk"]);
  });

  it("Mysticism cannot refresh a Book Spell whose combat effect is still live", () => {
    // Haste leaves a combat-long effect: the Mysticism recall ("refresh the cast
    // Spell") is refused while it lasts, and the Spell stays used.
    let state = polishCombat("polish-book-in-effect-mysticism");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism"];
    state.players.p1.spellBook = ["spell.haste"];
    state.players.p1.limits.expertUses = 0;

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.haste" &&
        legal.action.fromSpellBook === true
    );
    expect(cast, "Haste should be castable from the Polish Book").toBeTruthy();
    let opened = applyOk(state, cast!.action);
    const myst = getLegalActions(opened, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.mysticism"
    );
    expect(myst, "Mysticism is offered into the cast window").toBeTruthy();
    const resolved = passAll(applyOk(opened, myst!.action));

    expect(effectLive(resolved, "spell.haste")).toBe(true);
    expect(resolved.players.p1.spellBookUsed).toContain("spell.haste");
    expect(resolved.players.p1.spellBook).not.toContain("spell.haste");
    // The enabler still comes back (that half of the recall is unaffected).
    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
  });
});

// ---------------------------------------------------------------------------
// Reported bug (2026-08-09): "Water walk not refreshed next round"
//
// A "this turn" map Spell (Water Walk / Fly) is spent for the rest of its
// caster's turn and MUST be castable again next round. The round wrap runs
// `startAdventureRound` (the Book refresh) and only THEN `startPlayerTurn`,
// which is where `expireEffectsForTurnEnd` drops the effect — so the refresh
// used to see a still-"live" effect, withhold the Spell for the whole new
// round, and only hand it back one round late. Every case here drives the REAL
// END_TURN wrap; hand-poking `state.round` cannot see the ordering at all.
// ---------------------------------------------------------------------------

describe("Polish Spell Book — a 'this turn' Spell refreshes at the NEXT round start", () => {
  for (const spellId of ["spell.water_walk", "spell.fly"]) {
    it(`${spellId} cast in round 1 is refreshed and castable again in round 2`, () => {
      let state = polishMapGame(`polish-book-this-turn-${spellId}`);
      state = castOngoingBookSpell(state, spellId);
      expect(state.players.p1.spellBookUsed).toContain(spellId);
      expect(effectLive(state, spellId)).toBe(true);

      state = playOutRound(state);

      expect(state.round).toBe(2);
      // The effect really is over…
      expect(effectLive(state, spellId)).toBe(false);
      // …so the Spell is back on the refreshed side (this is the reported bug:
      // it used to still sit in `spellBookUsed` for the whole of round 2).
      expect(state.players.p1.spellBook).toContain(spellId);
      expect(state.players.p1.spellBookUsed ?? []).not.toContain(spellId);

      // And it is genuinely castable again — a refreshed-side entry nobody can
      // cast would be a data check, not the effect. (Round 2 opens with p1's
      // mandatory start-of-turn hand step; take it first.)
      for (let hand = 0; hand < 4; hand += 1) {
        const refresh = getLegalActions(state, "p1").find(
          (legal) => legal.action.type === "REFRESH_HAND"
        );
        if (!refresh) {
          break;
        }
        state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      }
      state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
      const recast = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === spellId &&
          legal.action.fromSpellBook === true
      );
      expect(recast, `${spellId} should be castable again in round 2`).toBeTruthy();
    });
  }

  it("a LAST-seat caster's Water Walk refreshes in the same round wrap", () => {
    // Seat order decides how much of the round runs between the cast and the
    // wrap; the last seat casts immediately before `startAdventureRound`, which
    // is the tightest case for the ordering.
    let state = polishMapGame("polish-book-this-turn-last-seat");
    // p1 (first seat) simply ends its turn so p2 (last seat) may act.
    for (let hand = 0; hand < 4; hand += 1) {
      const refresh = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "REFRESH_HAND"
      );
      if (!refresh) {
        break;
      }
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const endP1 = getLegalActions(state, "p1").find((legal) => legal.action.type === "END_TURN");
    expect(endP1).toBeTruthy();
    state = applyOk(state, endP1!.action);
    expect(state.activePlayerId).toBe("p2");

    for (let hand = 0; hand < 4; hand += 1) {
      const refresh = getLegalActions(state, "p2").find(
        (legal) => legal.action.type === "REFRESH_HAND"
      );
      if (!refresh) {
        break;
      }
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
    }
    state = castOngoingBookSpell(state, "spell.water_walk", "p2");
    expect(state.players.p2.spellBookUsed).toContain("spell.water_walk");

    const endP2 = getLegalActions(state, "p2").find((legal) => legal.action.type === "END_TURN");
    expect(endP2).toBeTruthy();
    state = applyOk(state, endP2!.action);

    expect(state.round).toBe(2);
    expect(state.players.p2.spellBook).toContain("spell.water_walk");
    expect(state.players.p2.spellBookUsed ?? []).not.toContain("spell.water_walk");
  });

  it("CONTROL: the round-start read still blocks a live effect that is NOT turn-scoped", () => {
    // The discount is scoped to `expiresAtTurnEndPlayerId === the Book owner` —
    // a combat-long Haste effect carries no such stamp, so the round-start read
    // keeps calling it live and the partition keeps it used. Widening the
    // discount to every live effect fails this.
    let state = polishCombat("polish-book-round-start-live-control");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.haste"];
    state.players.p1.limits.expertUses = 0;

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.haste" &&
        legal.action.fromSpellBook === true
    );
    expect(cast, "Haste should be castable from the Polish Book").toBeTruthy();
    state = passAll(applyOk(state, cast!.action));

    const live = state.activeEffects.find(
      (effect) => effect.source.type === "card" && effect.source.cardId === "spell.haste"
    );
    expect(live, "Haste leaves a live combat effect").toBeTruthy();
    expect(live!.expiresAtTurnEndPlayerId, "…that is not turn-scoped").toBeUndefined();
    expect(state.players.p1.spellBookUsed).toContain("spell.haste");

    expect(
      polishBookSpellEffectIsLive(state, "p1", "spell.haste", state.players.p1, {
        atRoundStart: true
      })
    ).toBe(true);
    const partition = partitionPolishBookAtRoundStart(state, state.players.p1);
    expect(partition.stillInEffect).toContain("spell.haste");
    expect(partition.refresh).not.toContain("spell.haste");
  });

  it("the round-start partition discounts ONLY the Book owner's own turn-scoped effect", () => {
    // A real Water Walk cast: live for the mid-round read, discounted for the
    // round-start read. Both halves of the partition agree.
    let state = polishMapGame("polish-book-round-start-partition");
    state = castOngoingBookSpell(state, "spell.water_walk");

    expect(polishBookSpellEffectIsLive(state, "p1", "spell.water_walk", state.players.p1)).toBe(
      true
    );
    expect(
      polishBookSpellEffectIsLive(state, "p1", "spell.water_walk", state.players.p1, {
        atRoundStart: true
      })
    ).toBe(false);

    const partition = partitionPolishBookAtRoundStart(state, state.players.p1);
    expect(partition.refresh).toContain("spell.water_walk");
    expect(partition.stillInEffect).not.toContain("spell.water_walk");
  });

  it("CONTROL: the mid-round once-per-round limit is untouched by the round-start reading", () => {
    // The round-start refresh is exempt from the marker AND clears it; a Spell
    // already refreshed mid-round is still blocked from a SECOND mid-round
    // refresh in the same round.
    let state = polishMapGame("polish-book-round-start-marker");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.haste"];

    expect(polishBookSpellRefreshBlocked(state, "p1", "spell.haste", state.players.p1)).toBe(
      "already-refreshed"
    );
    // The round start ignores the marker, refreshes, and then wipes it.
    state = playOutRound(state);
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(state.players.p1.polishSpellsRefreshedThisRound ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Non-book (physical card) game: an ongoing spell mid-effect is unrecoverable
// ---------------------------------------------------------------------------

describe("Ongoing spells mid-effect stay in play (no Book)", () => {
  function plainMapGame(seed: string): GameState {
    let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    return state;
  }

  it("a live Water Walk sits in the Ongoing tray — never the discard, so nothing can recover it", () => {
    let state = plainMapGame("plain-ongoing-water-walk");
    state.players.p1.hand = ["spell.water_walk", "stat.knowledge"];
    state.players.p1.discard = [];
    state.players.p1.limits.expertUses = 0;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.water_walk"
    );
    expect(play).toBeTruthy();
    state = resolveMapBoostNow(applyOk(state, play!.action));

    expect(effectLive(state, "spell.water_walk")).toBe(true);
    expect(state.players.p1.ongoingCards?.some((entry) => entry.cardId === "spell.water_walk")).toBe(
      true
    );
    expect(state.players.p1.discard).not.toContain("spell.water_walk");
    expect(state.players.p1.hand).not.toContain("spell.water_walk");

    // Knowledge only MARKS it to come back once the effect ends…
    if (state.adventure?.pendingVisit) {
      state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
      expect(
        state.players.p1.ongoingCards?.find((entry) => entry.cardId === "spell.water_walk")?.returnTo
      ).toBe("hand");
      expect(state.players.p1.hand).not.toContain("spell.water_walk");
    }

    // …and a discard-recovery card sees nothing to recover while it is in play.
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(false);
    expect(state.players.p1.hand).not.toContain("spell.water_walk");

    // Only at the caster's next turn start does it leave play.
    startPlayerTurn(state, "p1");
    expect(effectLive(state, "spell.water_walk")).toBe(false);
    expect(state.players.p1.ongoingCards ?? []).toEqual([]);
  });

  it("CONTROL: a resolved INSTANT spell is in the discard and IS recoverable at once", () => {
    let state = plainMapGame("plain-instant-recoverable");
    state.players.p1.hand = ["spell.view_air"];
    state.players.p1.discard = [];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_air"
    );
    expect(play).toBeTruthy();
    state = resolveMapBoostNow(applyOk(state, play!.action));

    expect(state.players.p1.discard).toContain("spell.view_air");
    expect(state.players.p1.ongoingCards ?? []).toEqual([]);
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Once per round 窶・part of the Polish Spell Book mode itself (user rule
// 2026-08-07: "a single spell can be refreshed only once per round")
// ---------------------------------------------------------------------------

function refreshMarkers(state: GameState): string[] {
  return state.players.p1.polishSpellsRefreshedThisRound ?? [];
}

function feedSays(state: GameState, fragment: string): boolean {
  return state.eventLog.some(
    (event) => event.type === "EVENT_NOTE" && event.message.includes(fragment)
  );
}

/** Opens the shared Polish discard-recovery pick and returns the offered card ids. */
function openRecoveryOffers(state: GameState): string[] {
  if (!openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })) {
    return [];
  }
  if (state.pendingChoice?.type !== "OPTION_CHOICE") {
    throw new Error("expected the Polish Book refresh choice");
  }
  return [...(state.pendingChoice.discardPick?.cardIds ?? [])];
}

describe("Polish Spell Book 窶・a Spell can be refreshed only ONCE per round", () => {
  it("Mysticism refreshes a Book Spell once; the SAME Spell is refused a second time that round", () => {
    const state = polishCombat("polish-book-once-per-round-mysticism");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism", "ability.mysticism"];
    state.players.p1.spellBook = ["spell.lightning_bolt"];
    state.players.p1.limits.expertUses = 0;

    // First cast + Mysticism: the Spell really flips back to the refreshed side窶ｦ
    const firstOpen = applyOk(state, castAtSkeletons(state, "spell.lightning_bolt").action);
    const firstMyst = getLegalActions(firstOpen, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.mysticism"
    );
    expect(firstMyst, "Mysticism is offered into the cast window").toBeTruthy();
    const next = passAll(applyOk(firstOpen, firstMyst!.action));
    expect(next.players.p1.spellBook).toContain("spell.lightning_bolt");
    expect(next.players.p1.spellBookUsed).not.toContain("spell.lightning_bolt");
    // 窶ｦand the once-per-round budget for that Spell is now spent.
    expect(refreshMarkers(next)).toEqual(["spell.lightning_bolt"]);
    expect(next.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);

    // A later COMBAT round inside the SAME game round (the marker only clears at
    // a game-round start): cast it again and answer with the second Mysticism.
    next.players.p1.combatStats.spellsCastThisRound = 0;
    const secondOpen = applyOk(next, castAtSkeletons(next, "spell.lightning_bolt").action);
    const secondMyst = getLegalActions(secondOpen, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.mysticism"
    );
    expect(secondMyst, "Mysticism stays a legal reaction 窶・only the refresh half is gated").toBeTruthy();
    const resolved = passAll(applyOk(secondOpen, secondMyst!.action));

    expect(resolved.players.p1.spellBookUsed).toContain("spell.lightning_bolt");
    expect(resolved.players.p1.spellBook).not.toContain("spell.lightning_bolt");
    expect(resolved.players.p1.hand).not.toContain("spell.lightning_bolt");
    expect(feedSays(resolved, "has already been refreshed this round")).toBe(true);
    // The enabler still comes back (that half of the recall is unaffected).
    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    // No second marker for a refresh that never happened.
    expect(refreshMarkers(resolved)).toEqual(["spell.lightning_bolt"]);
  });

  it("the discard-recovery pick drops an already-refreshed Spell but still offers a DIFFERENT one", () => {
    let state = polishMapGame("polish-book-once-per-round-recovery");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste", "spell.slow"];
    state.players.p1.discard = [];

    // First recovery: refresh Haste for real.
    const first = openRecoveryOffers(state);
    expect(first).toEqual(expect.arrayContaining(["spell.haste", "spell.slow"]));
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: first.indexOf("spell.haste")
    });
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(refreshMarkers(state)).toEqual(["spell.haste"]);

    // Haste is cast again inside the same game round, so it is used once more 窶・    // but its once-per-round refresh is spent, so it is NOT a candidate now.
    state.players.p1.spellBook = state.players.p1.spellBook.filter((id) => id !== "spell.haste");
    state.players.p1.spellBookUsed = ["spell.haste", "spell.slow"];
    const second = openRecoveryOffers(state);
    expect(second, "an already-refreshed Spell is not offered again this round").not.toContain(
      "spell.haste"
    );
    // CONTROL: the untouched Slow is still refreshable the very same round.
    expect(second).toContain("spell.slow");
  });

  it("a STALE pick naming an already-refreshed Spell is refused at resolution", () => {
    // The offer filter hides it, so the only way to reach the resolution backstop
    // is a pick opened before the Spell was refreshed (or a forged one): open the
    // pick, let another source spend Haste's budget, then answer with Haste.
    let state = polishMapGame("polish-book-once-per-round-stale-pick");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste", "spell.slow"];
    state.players.p1.discard = [];

    const offers = openRecoveryOffers(state);
    expect(offers).toContain("spell.haste");
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.haste"];

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: offers.indexOf("spell.haste")
    });
    expect(state.players.p1.spellBookUsed).toContain("spell.haste");
    expect(state.players.p1.spellBook).not.toContain("spell.haste");
    expect(state.players.p1.hand).not.toContain("spell.haste");
    expect(feedSays(state, "has already been refreshed this round")).toBe(true);
    // Slow was never touched by the refused pick.
    expect(state.players.p1.spellBookUsed).toContain("spell.slow");
  });

  it("the ROUND-START refresh ignores the marker, clears it, and a fresh mid-round refresh works again", () => {
    let state = polishMapGame("polish-book-once-per-round-round-start");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.players.p1.discard = [];

    const offers = openRecoveryOffers(state);
    expect(offers).toContain("spell.haste");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: offers.indexOf("spell.haste")
    });
    expect(refreshMarkers(state)).toEqual(["spell.haste"]);

    // Cast again inside the same game round 竊・used, and still blocked.
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    expect(openRecoveryOffers(state)).not.toContain("spell.haste");
    state.pendingChoice = null;

    // Round start: the whole USED side refreshes 窶・the marker never blocks the
    // round mechanism itself 窶・and every marker is cleared.
    state.round = 2;
    startAdventureRound(state);
    expect(state.players.p1.spellBook).toContain("spell.haste");
    expect(state.players.p1.spellBookUsed).not.toContain("spell.haste");
    expect(refreshMarkers(state)).toEqual([]);

    // A fresh mid-round refresh of the same Spell is legal again next round.
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    expect(openRecoveryOffers(state)).toContain("spell.haste");
  });

  it("cross-source: a Mysticism-refreshed Spell is refused by Crown of Dragontooth the same round", () => {
    let state = createAdventureGameState({
      startingBuildings: [],
      seed: "polish-book-once-per-round-cross-source",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    state.players.p1.hand = ["artifact.crown_of_dragontooth"];
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste", "spell.slow"];
    state.players.p1.discard = [CAST_A_SPELL_CARD_ID];
    // Haste's once-per-round refresh was already spent by a Mysticism recall.
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.haste"];

    const recover = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.crown_of_dragontooth" &&
        legal.action.optionIndex === 0
    );
    expect(recover, "the Crown is still playable 窶・Slow can be refreshed").toBeTruthy();
    state = applyOk(state, recover!.action);
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the used-Spell refresh choice");
    }
    const offered = state.pendingChoice.discardPick?.cardIds ?? [];
    expect(offered, "Haste already used its refresh this round").not.toContain("spell.haste");
    expect(offered).toEqual(["spell.slow"]);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 0
    });
    expect(state.players.p1.spellBook).toEqual(["spell.slow"]);
    expect(state.players.p1.spellBookUsed).toEqual(["spell.haste"]);
    expect(refreshMarkers(state)).toEqual(["spell.haste", "spell.slow"]);
  });

  it("with EVERY used Spell already refreshed, a recovery card is not playable at all", () => {
    const state = polishMapGame("polish-book-once-per-round-nothing-left");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.players.p1.discard = [];
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.haste"];
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(false);
    expect(state.players.p1.spellBookUsed).toEqual(["spell.haste"]);

    // CONTROL: clear the marker and the very same card opens its pick.
    state.players.p1.polishSpellsRefreshedThisRound = [];
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(true);
  });

  it("two genuine copies of one Spell each get their own refresh that round", () => {
    let state = polishMapGame("polish-book-once-per-round-two-copies");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste", "spell.haste"];
    state.players.p1.discard = [];

    for (let copy = 0; copy < 2; copy += 1) {
      const offers = openRecoveryOffers(state);
      expect(offers, `copy ${copy + 1} should still be refreshable`).toContain("spell.haste");
      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: state.pendingChoice!.id,
        optionIndex: offers.indexOf("spell.haste")
      });
    }
    expect(state.players.p1.spellBook).toEqual(["spell.haste", "spell.haste"]);
    expect(refreshMarkers(state)).toEqual(["spell.haste", "spell.haste"]);

    // Both copies are spent: cast them again and neither may be refreshed.
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste", "spell.haste"];
    expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(false);
  });

  it("CONTROL: with the Polish Book OFF, the same Spell may be recovered twice in one round", () => {
    let state = createAdventureGameState({
      seed: "polish-book-once-per-round-control-off",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.hand = [];
    state.players.p1.discard = ["spell.haste"];

    for (let take = 0; take < 2; take += 1) {
      expect(openDiscardPickChoice(state, "p1", { count: 1, filter: "spell" })).toBe(true);
      if (state.pendingChoice?.type !== "OPTION_CHOICE") {
        throw new Error("expected the classic discard pick");
      }
      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: state.pendingChoice.id,
        optionIndex: 0
      });
      expect(state.players.p1.hand).toContain("spell.haste");
      // Put it back for the second pass: a classic game keeps no refresh marker.
      state.players.p1.hand = state.players.p1.hand.filter((id) => id !== "spell.haste");
      state.players.p1.discard = ["spell.haste"];
      expect(state.players.p1.polishSpellsRefreshedThisRound ?? []).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// USER RULING 2026-08-25: "all card that refresh spells can be played multiple
// times in 1 round (just their effect of refreshing spells works once per
// round)" — the once-per-round limit belongs to the REFRESH, never to the card.
// Paired with the reported Adelaide IV bug: the printed "Refresh 1 Spell"
// sentence has to stand on its own, so a used Book Spell really becomes
// CASTABLE again (asserted by a second cast that really deals damage).
// ---------------------------------------------------------------------------

/** `polishCombat` plus the Polish Balance Pack (Adelaide IV's reprint). */
function polishBalanceCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  const adventure = createAdventureGameState({
    startingBuildings: [],
    seed: `${seed}-rules`,
    ruleset: "binh",
    rollFirstPlayer: false,
    houseRules: { "polish-spell-book": true, "polish-card-balance": true }
  });
  state.adventure = adventure.adventure;
  state.ruleset = "binh";
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.players.p1.hand = [];
  state.players.p1.discard = [];
  state.players.p1.spellBook = [];
  state.players.p1.spellBookUsed = [];
  state.players.p2.hand = [];
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 50;
  target.damage = 0;
  return state;
}

function optionLabels(state: GameState): string[] {
  return state.pendingChoice?.type === "OPTION_CHOICE"
    ? state.pendingChoice.options.map((option: { label: string }) => option.label)
    : [];
}

function chooseLabel(state: GameState, label: string): GameState {
  const index = optionLabels(state).indexOf(label);
  expect(index, `"${label}" should be offered (got ${JSON.stringify(optionLabels(state))})`).toBeGreaterThanOrEqual(0);
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: state.pendingChoice!.id,
    optionIndex: index
  });
}

function playCard(state: GameState, cardId: string, optionIndex?: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex)
  );
}

describe("Polish Spell Book — the once-per-round limit gates the REFRESH, not the card", () => {
  it("Adelaide IV's refresh makes a used Book Spell castable again — the second cast really lands", () => {
    let state = polishBalanceCombat("adelaide-refresh-recast");
    state.players.p1.spellBook = ["spell.magic_arrow"];
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, CAST_A_SPELL_CARD_ID, "specialty.adelaide.4"];

    state = passAll(applyOk(state, castAtSkeletons(state, "spell.magic_arrow").action));
    const firstDamage = state.combat!.units.unit_p2_skeletons.damage;
    expect(firstDamage, "the first Book cast really damages the target").toBeGreaterThan(0);
    expect(state.players.p1.spellBookUsed).toContain("spell.magic_arrow");

    // The used Spell is uncastable, even with the second enabler still in hand
    // and the per-round cast budget cleared.
    state.players.p1.combatStats.spellsCastThisRound = 0;
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
      ),
      "a USED Book Spell cannot be cast"
    ).toBe(false);

    // Adelaide IV: take the spent enabler back, then the printed second sentence.
    state = applyOk(state, playCard(state, "specialty.adelaide.4")!.action);
    state = chooseLabel(state, "Take Cast a Spell");
    state = chooseLabel(state, "Refresh Magic Arrow in the Spell Book");
    expect(state.players.p1.spellBook).toContain("spell.magic_arrow");
    expect(state.players.p1.spellBookUsed).not.toContain("spell.magic_arrow");
    expect(refreshMarkers(state)).toEqual(["spell.magic_arrow"]);

    // THE observable: the refreshed Spell is castable again and the cast resolves.
    state = passAll(applyOk(state, castAtSkeletons(state, "spell.magic_arrow").action));
    expect(
      state.combat!.units.unit_p2_skeletons.damage,
      "the second cast really deals more damage"
    ).toBeGreaterThan(firstDamage);
    expect(state.players.p1.spellBookUsed).toContain("spell.magic_arrow");
  });

  it("a spent refresh never blocks the recovery CARD: Rib Cage still hands back the Cast a Spell enabler", () => {
    let state = polishMapGame("polish-recovery-card-not-blocked");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.haste"];
    state.players.p1.discard = [CAST_A_SPELL_CARD_ID];
    state.players.p1.hand = ["artifact.rib_cage"];

    const play = playCard(state, "artifact.rib_cage", 0);
    expect(play, "the recovery half still has work (the enabler return)").toBeTruthy();
    state = applyOk(state, play!.action);

    expect(state.players.p1.hand, "the enabler really came back").toContain(CAST_A_SPELL_CARD_ID);
    // The refresh half is spent, so the Spell stays used and no second marker lands.
    expect(state.players.p1.spellBookUsed).toEqual(["spell.haste"]);
    expect(state.players.p1.spellBook).toEqual([]);
    expect(refreshMarkers(state)).toEqual(["spell.haste"]);
  });

  it("CONTROL: with the refresh spent AND no enabler to return, the same recovery half is not offered", () => {
    const state = polishMapGame("polish-recovery-card-nothing-to-do");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.players.p1.polishSpellsRefreshedThisRound = ["spell.haste"];
    state.players.p1.discard = ["artifact.centaurs_axe"];
    state.players.p1.hand = ["artifact.rib_cage"];
    expect(playCard(state, "artifact.rib_cage", 0)).toBeUndefined();
  });

  it("CONTROL: with the refresh AVAILABLE the same card refreshes, proving the gate is the marker", () => {
    let state = polishMapGame("polish-recovery-card-refresh-available");
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.haste"];
    state.players.p1.discard = ["artifact.centaurs_axe"];
    state.players.p1.hand = ["artifact.rib_cage"];

    const play = playCard(state, "artifact.rib_cage", 0);
    expect(play, "a refreshable used Book Spell is work on its own").toBeTruthy();
    state = applyOk(state, play!.action);
    state = chooseLabel(state, "Refresh Haste in the Spell Book");
    expect(state.players.p1.spellBook).toEqual(["spell.haste"]);
    expect(refreshMarkers(state)).toEqual(["spell.haste"]);
  });
});
