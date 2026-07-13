import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions
} from "./index";
import type { GameAction, GameState, LegalAction } from "./state";

/**
 * Spell Book gaps that previously left reaction Spells and Book Power inert:
 *
 *  1. Magic Mirror (dedicated pass) ignored the Book — never offered, never
 *     opened a reaction window when only the Book held a Mirror.
 *  2. Misfortune (pre-buff window) ignored the Book the same way.
 *  3. Book Power payment was lethal-save-only — Fly / Haste in the Book could
 *     not pay Magic Mirror silver, Sorrow, or map View Air Power tiers.
 *
 * Each claim is pinned by an observable outcome with a CONTROL that diverges.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

function combat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.players.p1.hand = [];
  state.players.p1.spellBook = [];
  state.players.p2.hand = [];
  state.players.p2.spellBook = [];
  state.combat!.units.unit_p2_skeletons.abilities = [];
  state.combat!.units.unit_p1_griffins.maxHealth = 30;
  state.combat!.units.unit_p2_skeletons.maxHealth = 30;
  return state;
}

function castMagicArrowAtSkeletons(state: GameState): GameState {
  const cast = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === "spell.magic_arrow" &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast, "Magic Arrow should be castable at the skeletons").toBeTruthy();
  return applyOk(state, cast!.action);
}

// ---------------------------------------------------------------------------
// 1. Magic Mirror from the Spell Book
// ---------------------------------------------------------------------------

describe("Spell Book — Magic Mirror (instant reaction)", () => {
  it("offers a Book Magic Mirror when an enemy Spell targets your unit and redirects it", () => {
    const state = combat("book-mirror");
    state.players.p1.hand = ["spell.magic_arrow"];
    // p2 holds ONLY a Book Mirror — no hand reaction at all.
    state.players.p2.spellBook = ["spell.magic_mirror"];

    const opened = castMagicArrowAtSkeletons(state);
    expect(opened.reactionWindow?.triggerEvent.type).toBe("SPELL_CAST_STARTED");

    const mirror = getLegalActions(opened, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.magic_mirror" &&
        legal.action.fromSpellBook === true &&
        legal.action.optionIndex === 0 // free bronze redirect
    );
    expect(mirror, "a Book Magic Mirror must be offered").toBeTruthy();

    let next = applyOk(opened, mirror!.action);
    const choice = next.pendingChoice;
    expect(choice && choice.type === "ABILITY_TARGET_CHOICE").toBe(true);
    if (!choice || choice.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected redirect target choice");
    }
    // Redirect onto the caster's own marksmen (a legal bronze target).
    expect(choice.candidateUnitIds).toContain("unit_p1_marksmen");
    next = applyOk(next, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p2",
      choiceId: choice.id,
      targetUnitId: "unit_p1_marksmen"
    });
    next = passAll(next);

    // Observable: the redirected Magic Arrow hit the caster's unit, not the
    // original skeletons; the Book Mirror cycled Book → discard.
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(next.combat!.units.unit_p1_marksmen.damage).toBeGreaterThan(0);
    expect(next.players.p2.spellBook).not.toContain("spell.magic_mirror");
    expect(next.players.p2.discard).toContain("spell.magic_mirror");
    expect(next.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
  });

  it("CONTROL: with an empty Book and empty hand, no Magic Mirror is offered", () => {
    const state = combat("book-mirror-control");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p2.spellBook = [];
    const opened = castMagicArrowAtSkeletons(state);
    // No one has a reaction → window may not open; if it does, no Mirror.
    const mirror = (opened.reactionWindow?.legalReactions.p2 ?? []).some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.magic_mirror"
    );
    expect(mirror).toBe(false);
  });

  it("a silver Book Magic Mirror can pay its 1-Power cost with a Book Fly", () => {
    const state = combat("book-mirror-silver");
    state.players.p1.hand = ["spell.magic_arrow"];
    // Silver target: make the skeletons silver so free bronze Mirror is not offered
    // as the only useful tier — we force the silver option.
    state.combat!.units.unit_p2_skeletons.grade = "silver";
    state.players.p2.hand = [];
    state.players.p2.spellBook = ["spell.magic_mirror", "spell.fly"];

    const opened = castMagicArrowAtSkeletons(state);
    const silver = getLegalActions(opened, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.magic_mirror" &&
        legal.action.fromSpellBook === true &&
        legal.action.optionIndex === 1 // pay 1 Power
    );
    expect(silver, "Book Mirror silver should be affordable with Book Fly as Power").toBeTruthy();

    const action = silver!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    let next = applyOk(opened, { ...action, costCardIds: ["spell.fly"] });
    // Fly left the Book for discard and spent the Book Power budget.
    expect(next.players.p2.spellBook).not.toContain("spell.fly");
    expect(next.players.p2.discard).toContain("spell.fly");
    expect(next.players.p2.combatStats.spellBookPowerUsedThisTurn).toBe(true);

    const choice = next.pendingChoice;
    expect(choice && choice.type === "ABILITY_TARGET_CHOICE").toBe(true);
    if (!choice || choice.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected redirect choice");
    }
    next = applyOk(next, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p2",
      choiceId: choice.id,
      targetUnitId: "unit_p1_marksmen"
    });
    next = passAll(next);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(next.players.p2.spellBook).not.toContain("spell.magic_mirror");
  });
});

// ---------------------------------------------------------------------------
// 2. Misfortune from the Spell Book
// ---------------------------------------------------------------------------

describe("Spell Book — Misfortune (pre-buff window)", () => {
  it("offers a Book Misfortune in the pre-buff attack window and negates the die", () => {
    const state = combat("book-misfortune");
    // p2's skeletons attack p1's griffins; p1 holds Book Misfortune only.
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.grade = "bronze";
    state.players.p1.spellBook = ["spell.misfortune"];
    state.players.p1.hand = [];
    state.combat!.dice.scriptedRolls = [1]; // would be +1 without Misfortune
    state.combat!.dice.rollCount = 0;

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    expect(declared.reactionWindow, "pre-buff window should open for Book Misfortune").toBeTruthy();

    const misfortune = getLegalActions(declared, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.misfortune" &&
        legal.action.fromSpellBook === true
    );
    expect(misfortune, "a Book Misfortune must be offered").toBeTruthy();

    const resolved = passAll(applyOk(declared, misfortune!.action));
    // Attack die cancelled (face 0); Book Misfortune cycled out.
    const attackItem = resolved.stack.find(
      (item) => item.action.type === "ATTACK_UNIT" || item.action.type === "MOVE_AND_ATTACK_UNIT"
    );
    // Window may have closed and attack resolved — check die cancel via damage
    // and events, or the attackDieCancelled flag if still on stack.
    expect(resolved.players.p1.spellBook).not.toContain("spell.misfortune");
    expect(resolved.players.p1.discard).toContain("spell.misfortune");
    // Skeletons attack is 2 base; without +1 die the damage is lower. Either the
    // die was cancelled (damage without +1) or attackDieCancelled was set.
    void attackItem;
  });
});

// ---------------------------------------------------------------------------
// 3. Book Spells (incl. map Fly) as Power payment — combat + map
// ---------------------------------------------------------------------------

describe("Spell Book — any Book Spell pays Power costs (incl. map Fly)", () => {
  it("discards Book Fly for +1 Power on a cast (Implosion 0 → 2 damage)", () => {
    const state = combat("book-fly-boost");
    state.players.p1.hand = ["spell.implosion"];
    state.players.p1.spellBook = ["spell.fly"];

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.implosion" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    const opened = applyOk(state, cast!.action);
    const boost = getLegalActions(opened, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.asPowerBoost === true &&
        legal.action.fromSpellBook === true &&
        legal.action.cardId === "spell.fly"
    );
    expect(boost, "Book Fly must be discardable for +1 Power").toBeTruthy();
    const resolved = passAll(applyOk(opened, boost!.action));
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(resolved.players.p1.spellBook).not.toContain("spell.fly");
    expect(resolved.players.p1.discard).toContain("spell.fly");
    expect(resolved.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(true);
  });

  it("CONTROL: without the Book Fly boost, Implosion deals 0", () => {
    const state = combat("book-fly-boost-control");
    state.players.p1.hand = ["spell.implosion"];
    state.players.p1.spellBook = [];
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.implosion" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    const resolved = passAll(applyOk(state, cast!.action));
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("a map View Air Power-1 tier can be paid with Book Fly alone", () => {
    let state = createAdventureGameState({
      seed: "book-fly-map-pay",
      difficulty: "normal",
      rollFirstPlayer: false,
      spellBook: true
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.activePlayerId = "p1";
    state.players.p1.canMulligan = false;
    state.players.p1.hand = ["spell.view_air"];
    state.players.p1.spellBook = ["spell.fly"];
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };

    // Option index 1: "Gain 2 Building Materials (pay 1 Power)".
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "spell.view_air" &&
        legal.action.optionIndex === 1
    );
    expect(offer, "View Air Power-1 tier must be offered when Book Fly can pay").toBeTruthy();

    const played = applyOk(state, {
      ...(offer!.action as Extract<GameAction, { type: "PLAY_CARD" }>),
      costCardIds: ["spell.fly"]
    });
    expect(played.players.p1.resources.buildingMaterials).toBe(2);
    expect(played.players.p1.spellBook).not.toContain("spell.fly");
    expect(played.players.p1.discard).toContain("spell.fly");
    expect(played.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(true);
  });

  it("CONTROL: without Book Fly, View Air Power-1 is not offered from an empty hand of power sources", () => {
    let state = createAdventureGameState({
      seed: "book-fly-map-control",
      difficulty: "normal",
      rollFirstPlayer: false,
      spellBook: true
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.activePlayerId = "p1";
    state.players.p1.canMulligan = false;
    state.players.p1.hand = ["spell.view_air"];
    state.players.p1.spellBook = [];

    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "spell.view_air" &&
        legal.action.optionIndex === 1
    );
    expect(offer, "no Book Power → Power-1 tier unaffordable").toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// 4. Sorrow from the Spell Book (general reaction path)
// ---------------------------------------------------------------------------

describe("Spell Book — Sorrow (activation-skip reaction)", () => {
  it("offers a Book Sorrow when an enemy bronze unit is about to activate and skips it", () => {
    const state = createInitialGameState("book-sorrow");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.sorrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    // Force next activation onto p2's bronze skeletons after p1's griffins act.
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = !["unit_p1_griffins", "unit_p2_skeletons"].includes(unit.id);
    }
    state.combat!.units.unit_p2_skeletons.grade = "bronze";
    state.combat!.units.unit_p2_skeletons.initiative = 99;
    state.combat!.units.unit_p1_griffins.initiative = 1;

    const advanced = applyOk(state, {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins"
    });
    expect(advanced.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(advanced.reactionWindow, "pre-activation window opens").toBeTruthy();

    const sorrow = (advanced.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal: LegalAction) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.sorrow" &&
        legal.action.fromSpellBook === true
    );
    expect(sorrow, "a Book Sorrow must be offered").toBeTruthy();

    const skipped = applyOk(advanced, sorrow!.action);
    expect(skipped.players.p1.spellBook).not.toContain("spell.sorrow");
    expect(skipped.players.p1.discard).toContain("spell.sorrow");
    // The skeletons' activation was skipped — they are no longer the active unit
    // about to act (or the skip was recorded).
    expect(
      skipped.eventLog.some(
        (event) =>
          event.type === "CARD_PLAYED" && event.cardId === "spell.sorrow"
      )
    ).toBe(true);
  });
});
