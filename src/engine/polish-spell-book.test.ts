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
import { gainExperience, startAdventureRound } from "./adventure";
import { CAST_A_SPELL_CARD_ID } from "./polish-spell-book";

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
  const adventure = createAdventureGameState({
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
    const state = createAdventureGameState({
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
    const state = createAdventureGameState({
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
    const state = createAdventureGameState({
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
    const state = createAdventureGameState({
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

  it("expert Mysticism adds +1 Spell Power to the very cast it answers", () => {
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

    // Expert half: a crown pays the expert side and the cast lands at 2 + 1 = 3.
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
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(3);
    // Expert still refreshes the Spell and returns the enabler like basic.
    expect(resolved.players.p1.spellBook).toContain("spell.lightning_bolt");
    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
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
    let state = createAdventureGameState({
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
    let state = createAdventureGameState({
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
    let state = createAdventureGameState({
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
    const state = createAdventureGameState({
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
    let map = createAdventureGameState({
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

  it("adapts Genie Wish to discard as printed and refresh one used Book Spell", () => {
    const state = polishCombat("polish-book-genie");
    const genie = state.combat!.units.unit_p1_griffins;
    genie.abilities = ["genie-spell-draw-few"];
    state.combat!.activeUnitId = genie.id;
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    state.players.p1.spellBookUsed = ["spell.haste"];

    const wish = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_GENIE_DECK_DRAW" && legal.action.unitId === genie.id
    );
    expect(wish).toBeTruthy();
    const resolved = applyOk(state, wish!.action);
    expect(resolved.players.p1.deck).toEqual([]);
    expect(resolved.players.p1.discard).toEqual(
      expect.arrayContaining(["stat.attack", "stat.defense", "stat.power"])
    );
    expect(resolved.players.p1.spellBook).toContain("spell.haste");
    expect(resolved.players.p1.spellBookUsed).not.toContain("spell.haste");
    expect(resolved.combat!.units[genie.id].activatedThisRound).toBe(true);
  });

  it("Crown of Dragontooth removes a refreshed or used Book Spell before Search 2", () => {
    let state = createAdventureGameState({
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
    let state = createAdventureGameState({
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
    // The refreshed Book spell went to the Book, never to the hand — the only
    // "spell"-kind card the recover ever put in hand is the Cast a Spell enabler.
    expect(state.players.p1.hand).not.toContain("spell.haste");
    expect(state.players.p1.hand).not.toContain("spell.slow");
    expect(state.players.p1.hand.filter((cardId) => cardLibrary[cardId]?.kind === "spell")).toEqual([
      CAST_A_SPELL_CARD_ID
    ]);
  });

  it("CONTROL: with the rule OFF, Crown option A takes 2 Spells from discard to hand and ignores Cast a Spell", () => {
    let state = createAdventureGameState({
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
    let state = createAdventureGameState({
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
    expect(legal.some((entry) => entry.label.includes("Search 3"))).toBe(true);
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
    let state = createAdventureGameState({
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

  it("a newly built Guild offers two Search-3-or-Cast rewards", () => {
    const state = createAdventureGameState({
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
    const state = createAdventureGameState({
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
    const state = createAdventureGameState({
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
// 2 — NOT the base game's unlimited). In Book mode either still needs a Cast a
// Spell card to actually cast (the shared gate).
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
    let state = createAdventureGameState({
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
    let state = createAdventureGameState({
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
