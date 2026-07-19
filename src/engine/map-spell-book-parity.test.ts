import { describe, expect, it } from "vitest";
import { CAST_A_SPELL_CARD_ID } from "./polish-spell-book";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "./index";

/**
 * Map cast-then-boost × both Spell Book systems.
 *
 * OLD stash Book (`spellBook: true`, no polish): map Spells may live in the Book;
 * one Book Spell may burn for +1 Power per turn; Knowledge can return a Book-cast
 * map Spell to the Book (or mark a lasting Fly to return there).
 *
 * POLISH Book (`polish-spell-book`): Spells live only in the Book; cast needs
 * "Cast a Spell" in hand; Book Spells cannot burn for Power; Cast a Spell may
 * still discard for its printed +1 Power; Knowledge returns only Cast a Spell
 * (the Book Spell stays used).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function finishHandStep(state: GameState): GameState {
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    return applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function oldBookGame(seed: string): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    spellBook: true,
    houseRules: { "polish-spell-book": false }
  });
  state = finishHandStep(state);
  return state;
}

function polishBookGame(seed: string): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    spellBook: false,
    houseRules: { "polish-spell-book": true }
  });
  state = finishHandStep(state);
  return state;
}

function castViewAirFrom(state: GameState, fromBook: boolean): GameState {
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "spell.view_air" &&
      Boolean(legal.action.fromSpellBook) === fromBook
  );
  expect(play, `View Air cast fromBook=${fromBook}`).toBeTruthy();
  return applyOk(state, play!.action);
}

function pickBoost(
  state: GameState,
  pred: (offer: NonNullable<Extract<NonNullable<GameState["pendingChoice"]>, { type: "OPTION_CHOICE" }>["mapSpellBoost"]>["offers"][number]) => boolean
): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("map-spell-boost");
  if (choice?.type !== "OPTION_CHOICE" || !choice.mapSpellBoost) {
    throw new Error("expected map-spell-boost");
  }
  const index = choice.mapSpellBoost.offers.findIndex(pred);
  expect(index, "matching boost offer").toBeGreaterThanOrEqual(0);
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: choice.id,
    optionIndex: index
  });
}

function resolveBoostNow(state: GameState): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "map-spell-boost") {
    return state;
  }
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: choice.id,
    optionIndex: choice.mapSpellBoost?.offers.length ?? choice.options.length - 1
  });
}

// ---------------------------------------------------------------------------
// OLD Spell Book
// ---------------------------------------------------------------------------

describe("Map cast-then-boost × OLD Spell Book", () => {
  it("casts a Book map Spell (View Air) without touching the hand", () => {
    let state = oldBookGame("old-book-cast");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.view_air"];
    const goldBefore = state.players.p1.resources.gold;

    state = castViewAirFrom(state, true);
    state = resolveBoostNow(state);

    expect(state.players.p1.spellBook).not.toContain("spell.view_air");
    expect(state.players.p1.hand).not.toContain("spell.view_air");
    expect(state.players.p1.discard).toContain("spell.view_air");
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
  });

  it("burns one Book Spell for +1 Power on a hand-cast View Air (once per turn)", () => {
    let state = oldBookGame("old-book-fuel");
    state.players.p1.hand = ["spell.view_air"];
    state.players.p1.spellBook = ["spell.fly"];
    const materialsBefore = state.players.p1.resources.buildingMaterials;

    state = castViewAirFrom(state, false);
    state = pickBoost(
      state,
      (offer) => offer.kind === "card" && offer.cardId === "spell.fly" && Boolean(offer.fromBook)
    );

    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
    expect(state.players.p1.spellBook).not.toContain("spell.fly");
    expect(state.players.p1.discard).toContain("spell.fly");
    expect(state.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(true);
  });

  it("CONTROL: a second Book Power burn is not offered the same turn", () => {
    let state = oldBookGame("old-book-fuel-once");
    state.players.p1.hand = ["spell.view_air"];
    state.players.p1.spellBook = ["spell.fly", "spell.haste"];
    state.players.p1.combatStats.spellBookPowerUsedThisTurn = true;

    state = castViewAirFrom(state, false);
    // Budget already spent → no Book offer; only resolve-now (or other hand sources).
    const choice = state.pendingChoice;
    if (choice?.type === "OPTION_CHOICE" && choice.mapSpellBoost) {
      expect(
        choice.mapSpellBoost.offers.some((offer) => offer.kind === "card" && offer.fromBook)
      ).toBe(false);
    }
  });

  it("Knowledge returns a Book-cast View Air to the Spell Book (basic, no crown)", () => {
    let state = oldBookGame("old-book-knowledge");
    state.players.p1.hand = ["stat.knowledge"];
    state.players.p1.spellBook = ["spell.view_air"];
    state.players.p1.limits.expertUses = 0;

    state = castViewAirFrom(state, true);
    state = resolveBoostNow(state);

    // Knowledge visit step after the cast.
    expect(state.adventure?.pendingVisit?.steps[0]).toMatchObject({ type: "CHOOSE_ONE" });
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p1.spellBook).toContain("spell.view_air");
    expect(state.players.p1.hand).not.toContain("spell.view_air");
    expect(state.players.p1.hand).not.toContain("stat.knowledge");
  });

  it("Book Fly lasting cast: holds ongoing; Knowledge marks return to Spell Book", () => {
    let state = oldBookGame("old-book-fly");
    state.players.p1.hand = ["stat.knowledge"];
    state.players.p1.spellBook = ["spell.fly"];
    state.players.p1.limits.expertUses = 0;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "spell.fly" &&
        legal.action.fromSpellBook === true
    );
    expect(play).toBeTruthy();
    state = applyOk(state, play!.action);
    state = resolveBoostNow(state);

    expect(state.players.p1.ongoingCards?.some((entry) => entry.cardId === "spell.fly")).toBe(true);
    expect(state.players.p1.discard).not.toContain("spell.fly");
    expect(state.players.p1.spellBook).not.toContain("spell.fly");

    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.ongoingCards?.find((entry) => entry.cardId === "spell.fly")?.returnTo).toBe(
      "spellBook"
    );
  });
});

// ---------------------------------------------------------------------------
// POLISH Spell Book
// ---------------------------------------------------------------------------

describe("Map cast-then-boost × POLISH Spell Book", () => {
  it("casts a Book map Spell only with Cast a Spell in hand; enabler → discard, spell → used", () => {
    let state = polishBookGame("polish-book-cast");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.view_air"];
    state.players.p1.spellBookUsed = [];
    const goldBefore = state.players.p1.resources.gold;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "spell.view_air" &&
        legal.action.fromSpellBook === true &&
        legal.action.castEnablerCardId === CAST_A_SPELL_CARD_ID
    );
    expect(play, "Polish Book View Air needs Cast a Spell").toBeTruthy();

    state = applyOk(state, play!.action);
    state = resolveBoostNow(state);

    expect(state.players.p1.hand).not.toContain(CAST_A_SPELL_CARD_ID);
    expect(state.players.p1.discard).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.players.p1.spellBook).not.toContain("spell.view_air");
    expect(state.players.p1.spellBookUsed).toContain("spell.view_air");
    expect(state.players.p1.discard).not.toContain("spell.view_air"); // never to discard
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
  });

  it("CONTROL: without Cast a Spell, a Polish Book map Spell is not offered", () => {
    const state = polishBookGame("polish-book-no-enabler");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.view_air"];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_air"
    );
    expect(play).toBeUndefined();
  });

  it("CONTROL: Polish Book Spells cannot burn for Power; a spare Cast a Spell can (+1)", () => {
    let state = polishBookGame("polish-book-fuel");
    // One enabler for the cast, one spare for +1 Power; Fly sits in the Book.
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.view_air", "spell.fly"];
    const materialsBefore = state.players.p1.resources.buildingMaterials;

    state = castViewAirFrom(state, true);
    // Boost window: Fly must NOT be offered; remaining Cast a Spell must be.
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("map-spell-boost");
    if (choice?.type === "OPTION_CHOICE" && choice.mapSpellBoost) {
      expect(
        choice.mapSpellBoost.offers.some(
          (offer) => offer.kind === "card" && offer.cardId === "spell.fly"
        ),
        "Polish Book Spells cannot burn for Power"
      ).toBe(false);
      expect(
        choice.mapSpellBoost.offers.some(
          (offer) => offer.kind === "card" && offer.cardId === CAST_A_SPELL_CARD_ID
        ),
        "spare Cast a Spell is +1 Power"
      ).toBe(true);
    }

    state = pickBoost(
      state,
      (offer) => offer.kind === "card" && offer.cardId === CAST_A_SPELL_CARD_ID
    );
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
    expect(state.players.p1.spellBook).toContain("spell.fly"); // untouched
    expect(state.players.p1.spellBookUsed).toContain("spell.view_air");
  });

  it("Knowledge returns only Cast a Spell; the Book Spell stays used", () => {
    let state = polishBookGame("polish-book-knowledge");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "stat.knowledge"];
    state.players.p1.spellBook = ["spell.view_air"];
    state.players.p1.limits.expertUses = 0;

    state = castViewAirFrom(state, true);
    state = resolveBoostNow(state);

    expect(state.adventure?.pendingVisit?.steps[0]).toMatchObject({ type: "CHOOSE_ONE" });
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.players.p1.hand).not.toContain("stat.knowledge");
    expect(state.players.p1.spellBookUsed).toContain("spell.view_air");
    expect(state.players.p1.spellBook).not.toContain("spell.view_air");
  });

  it("Polish Book Fly: spell stays used (no ongoing hold); Knowledge still returns Cast a Spell", () => {
    let state = polishBookGame("polish-book-fly");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "stat.knowledge"];
    state.players.p1.spellBook = ["spell.fly"];
    state.players.p1.limits.expertUses = 0;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "spell.fly" &&
        legal.action.fromSpellBook === true
    );
    expect(play).toBeTruthy();
    state = applyOk(state, play!.action);
    state = resolveBoostNow(state);

    // Effect is live…
    expect(
      state.activeEffects.some(
        (effect) =>
          effect.source.type === "card" &&
          effect.source.cardId === "spell.fly" &&
          effect.modifiers.some((m) => m.type === "HERO_MOVE_THROUGH")
      )
    ).toBe(true);
    // …but the Polish card stays in used, not ongoing.
    expect(state.players.p1.spellBookUsed).toContain("spell.fly");
    expect(state.players.p1.ongoingCards?.some((entry) => entry.cardId === "spell.fly") ?? false).toBe(
      false
    );

    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.players.p1.spellBookUsed).toContain("spell.fly");
  });

  it("Air Magic school basic + Polish Book cast stacks (starting Power 1 → materials)", () => {
    let state = polishBookGame("polish-book-school");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p1.spellBook = ["spell.view_air"];
    state.players.p1.permanents = ["ability.air_magic"];
    const materialsBefore = state.players.p1.resources.buildingMaterials;

    state = castViewAirFrom(state, true);
    // Starting Power 1 (school basic), no fuel → auto-resolve materials.
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
    expect(state.players.p1.spellBookUsed).toContain("spell.view_air");
    expect(state.players.p1.permanents).toContain("ability.air_magic");
  });
});
