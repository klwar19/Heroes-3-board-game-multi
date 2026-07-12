import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, createAdventureGameState, getLegalActions } from "./index";
import { coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Behavioural tests for the newly-wired Cove heroes (cove-content.test.ts only
 * checks registration/art). Every assertion fails if the specialty's engine
 * wiring is removed, and each test pairs the effect with a control proving the
 * opposite.
 *
 *   Jeremy (Captain, Cannon) — buys the Cove Cannon war machine and fires its
 *   2-damage chosen-target shot from the specialty. The IV/VI "use the Cannon"
 *   option is gated on owning a Cannon (NEW requiresWarMachine option gate), so
 *   the free shot can never land without one.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, optionIndex?: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (unitId === undefined || (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

/** Combat with exactly one living enemy (unit_p2_skeletons) so a single-target shot auto-resolves. */
function loneEnemyCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  for (const id of ["unit_p2_vampires", "unit_p2_dread_knights"] as const) {
    const unit = state.combat!.units[id];
    unit.damage = unit.maxHealth; // removed
  }
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 40;
  target.damage = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

function coveAdventure(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Jeremy", factionId: "cove", heroDefId: "jeremy" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  return state;
}

describe("Jeremy's Cannon specialty", () => {
  it("I option A pays 7 gold to take a Cannon from the supply into hand (map)", () => {
    const state = coveAdventure("jeremy-i-gain");
    state.players.p1.hand = ["specialty.jeremy.1"];
    state.players.p1.resources.gold = 10;
    expect(state.adventure?.warMachineSupply).toContain("war_machine.cannon");
    const gain = findPlay(state, "specialty.jeremy.1", 0);
    expect(gain, "the gain-a-Cannon option should be offered on the map").toBeTruthy();
    const next = applyOk(state, gain!.action);
    expect(next.players.p1.hand).toContain("war_machine.cannon");
    expect(next.players.p1.resources.gold).toBe(3); // 10 - 7
  });

  it("I option A is a map-only play (never offered in combat)", () => {
    const state = loneEnemyCombat("jeremy-i-maponly");
    state.players.p1.hand = ["specialty.jeremy.1"];
    expect(findPlay(state, "specialty.jeremy.1", 0)).toBeFalsy();
  });

  it("I option B deals 1 damage to a chosen enemy in combat", () => {
    const state = loneEnemyCombat("jeremy-i-damage");
    state.players.p1.hand = ["specialty.jeremy.1"];
    const play = findPlay(state, "specialty.jeremy.1", 1);
    expect(play, "the deal-1-damage option should be a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("IV option A is NOT offered without a Cannon in play (requiresWarMachine gate)", () => {
    const state = loneEnemyCombat("jeremy-iv-nogun");
    state.players.p1.hand = ["specialty.jeremy.4"];
    state.players.p1.permanents = [];
    expect(findPlay(state, "specialty.jeremy.4", 0)).toBeFalsy();
  });

  it("IV option A fires the Cannon (2 damage) once a Cannon is in play", () => {
    const state = loneEnemyCombat("jeremy-iv-fire");
    state.players.p1.hand = ["specialty.jeremy.4"];
    state.players.p1.permanents = ["war_machine.cannon"];
    const play = findPlay(state, "specialty.jeremy.4", 0);
    expect(play, "the use-the-Cannon option needs a Cannon in play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("IV option A is rejected by the reducer if forced without a Cannon", () => {
    const state = loneEnemyCombat("jeremy-iv-cheat");
    state.players.p1.hand = ["specialty.jeremy.4"];
    state.players.p1.permanents = [];
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.jeremy.4",
      optionIndex: 0
    });
    expect(result.errors.length, "the free shot must be blocked without a Cannon").toBeGreaterThan(0);
    expect(result.state.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("IV option B draws 1 card", () => {
    const state = loneEnemyCombat("jeremy-iv-draw");
    state.players.p1.hand = ["specialty.jeremy.4"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    const before = state.players.p1.hand.length;
    const play = findPlay(state, "specialty.jeremy.4", 1);
    expect(play, "the draw option should be a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.hand.length).toBe(before - 1 + 1); // play the card, draw 1
  });

  it("VI option A fires the Cannon (2 damage) with a Cannon in play; VI option B draws 2", () => {
    const fire = loneEnemyCombat("jeremy-vi-fire");
    fire.players.p1.hand = ["specialty.jeremy.6"];
    fire.players.p1.permanents = ["war_machine.cannon"];
    const after = applyOk(fire, findPlay(fire, "specialty.jeremy.6", 0)!.action);
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);

    const draw = loneEnemyCombat("jeremy-vi-draw");
    draw.players.p1.hand = ["specialty.jeremy.6"];
    draw.players.p1.permanents = [];
    draw.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    expect(findPlay(draw, "specialty.jeremy.6", 0), "no Cannon → no free shot").toBeFalsy();
    const before = draw.players.p1.hand.length;
    const drew = applyOk(draw, findPlay(draw, "specialty.jeremy.6", 1)!.action);
    expect(drew.players.p1.hand.length).toBe(before - 1 + 2); // play the card, draw 2
  });

  it("registers Jeremy as a Cove Captain with the Cannon specialty", () => {
    const hero = coreHeroDefinitions.jeremy;
    expect(hero.faction).toBe("cove");
    expect(hero.class).toBe("Captain");
    expect(hero.specialtyCardIds).toEqual({
      1: "specialty.jeremy.1",
      4: "specialty.jeremy.4",
      6: "specialty.jeremy.6"
    });
  });
});

// ---------------------------------------------------------------------------
// Zilare — Forgetfulness (reuses the engine FORGETFULNESS effect)
// ---------------------------------------------------------------------------

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function unitCannotAttackEffectExists(state: GameState, unitId: string): boolean {
  return state.activeEffects.some(
    (effect) =>
      effect.target?.type === "unit" &&
      effect.target.unitId === unitId &&
      effect.modifiers.some((modifier) => modifier.type === "UNIT_CANNOT_ATTACK")
  );
}

function p2CanAttackWith(state: GameState, attackerId: string): boolean {
  return getLegalActions(state, "p2").some(
    (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === attackerId
  );
}

/** p1 holds the given Zilare specialty; the named p2 enemy gets the type/grade set. */
function zilareCombat(seed: string, cardId: string, enemy: { type?: "ranged" | "ground" | "flying"; grade?: "bronze" | "silver" | "gold" }): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [cardId];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  const target = state.combat!.units.unit_p2_skeletons;
  if (enemy.type) target.type = enemy.type;
  if (enemy.grade) target.grade = enemy.grade;
  target.movedThisActivation = false;
  return state;
}

describe("Zilare's Forgetfulness specialty", () => {
  it("I forbids a bronze/silver ranged enemy from attacking next activation (a normal one attacks)", () => {
    // Control: the same ranged skeletons unit can shoot when active.
    const control = createInitialGameState("zilare-i-control");
    control.players.p1.hand = [];
    control.players.p2.hand = [];
    control.combat!.units.unit_p2_skeletons.type = "ranged";
    control.combat!.units.unit_p2_skeletons.movedThisActivation = false;
    control.activePlayerId = "p2";
    control.combat!.activeUnitId = "unit_p2_skeletons";
    control.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    expect(p2CanAttackWith(control, "unit_p2_skeletons")).toBe(true);

    // Forget the (silver) ranged skeletons with Zilare I.
    const state = zilareCombat("zilare-i", "specialty.zilare.1", { type: "ranged", grade: "silver" });
    const play = findPlay(state, "specialty.zilare.1", 0, "unit_p2_skeletons");
    expect(play, "the forget option should target a silver ranged enemy").toBeTruthy();
    const after = passAllReactions(applyOk(state, play!.action));
    expect(unitCannotAttackEffectExists(after, "unit_p2_skeletons")).toBe(true);

    after.activePlayerId = "p2";
    after.combat!.activeUnitId = "unit_p2_skeletons";
    after.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    after.combat!.units.unit_p2_skeletons.movedThisActivation = false;
    expect(p2CanAttackWith(after, "unit_p2_skeletons")).toBe(false);
  });

  it("I is NOT offered against a gold ranged enemy (grade gate)", () => {
    const state = zilareCombat("zilare-i-gold", "specialty.zilare.1", { type: "ranged", grade: "gold" });
    expect(findPlay(state, "specialty.zilare.1", 0, "unit_p2_skeletons")).toBeFalsy();
  });

  it("I is NOT offered against a melee enemy (type gate: ranged only)", () => {
    const state = zilareCombat("zilare-i-melee", "specialty.zilare.1", { type: "ground", grade: "bronze" });
    expect(findPlay(state, "specialty.zilare.1", 0, "unit_p2_skeletons")).toBeFalsy();
  });

  it("I option B draws a card", () => {
    const state = zilareCombat("zilare-i-draw", "specialty.zilare.1", {});
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    const before = state.players.p1.hand.length;
    const after = applyOk(state, findPlay(state, "specialty.zilare.1", 1)!.action);
    expect(after.players.p1.hand.length).toBe(before - 1 + 1);
  });

  it("IV reaches a gold ranged enemy (grade gate raised to gold)", () => {
    const state = zilareCombat("zilare-iv-gold", "specialty.zilare.4", { type: "ranged", grade: "gold" });
    const play = findPlay(state, "specialty.zilare.4", 0, "unit_p2_skeletons");
    expect(play, "IV should reach a gold ranged enemy").toBeTruthy();
    const after = passAllReactions(applyOk(state, play!.action));
    expect(unitCannotAttackEffectExists(after, "unit_p2_skeletons")).toBe(true);
  });

  it("VI reaches a gold MELEE enemy (any unit type)", () => {
    const state = zilareCombat("zilare-vi-melee", "specialty.zilare.6", { type: "ground", grade: "gold" });
    const play = findPlay(state, "specialty.zilare.6", 0, "unit_p2_skeletons");
    expect(play, "VI should reach a gold melee enemy").toBeTruthy();
    const after = passAllReactions(applyOk(state, play!.action));
    expect(unitCannotAttackEffectExists(after, "unit_p2_skeletons")).toBe(true);
  });

  it("VI still respects the grade gate (no effect above gold — Azure)", () => {
    const state = zilareCombat("zilare-vi-azure", "specialty.zilare.6", { type: "ground", grade: "bronze" });
    state.combat!.units.unit_p2_skeletons.grade = "azure";
    expect(findPlay(state, "specialty.zilare.6", 0, "unit_p2_skeletons")).toBeFalsy();
  });

  it("IV/VI option B adds +2 Power to a Spell you are casting (reaction-triggered)", () => {
    for (const cardId of ["specialty.zilare.4", "specialty.zilare.6"] as const) {
      const card = adventureCards[cardId];
      const powerOption =
        card.effect.type === "CHOOSE_ONE"
          ? card.effect.options.find((option) => option.effect.type === "ADD_SPELL_POWER")
          : undefined;
      expect(powerOption, `${cardId} should offer a +Power option`).toBeTruthy();
      expect(powerOption!.effect).toMatchObject({ type: "ADD_SPELL_POWER", amount: 2 });
      expect(powerOption!.trigger).toMatchObject({ event: "SPELL_CAST_STARTED", controller: "self" });
    }
  });

  it("is NOT counted as a Spell: it never ticks the one-per-round limit and stays playable after a Spell was cast", () => {
    // The Forgetfulness SPECIALTY shares the FORGETFULNESS effect with the
    // Forgetfulness SPELL, but it is a hero-specialty card, not a Spell — so it
    // must not touch the one-Spell-per-combat-round accounting. Playing it leaves
    // spellsCastThisRound untouched...
    const state = zilareCombat("zilare-not-a-spell", "specialty.zilare.1", { type: "ranged", grade: "silver" });
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
    const play = findPlay(state, "specialty.zilare.1", 0, "unit_p2_skeletons");
    expect(play).toBeTruthy();
    const after = passAllReactions(applyOk(state, play!.action));
    expect(
      after.players.p1.combatStats.spellsCastThisRound,
      "playing the specialty must not count as a Spell cast"
    ).toBe(0);

    // ...and, conversely, the one-Spell-per-round limit must not block it: even
    // with the round's Spell already spent, the specialty is still offered. (This
    // is what the `card.kind === "spell"` guard in addOptionPlays protects — remove
    // it and the specialty wrongly disappears once a Spell has been cast.)
    const limitReached = zilareCombat("zilare-limit-reached", "specialty.zilare.1", {
      type: "ranged",
      grade: "silver"
    });
    limitReached.players.p1.combatStats.spellsCastThisRound = 1;
    expect(
      findPlay(limitReached, "specialty.zilare.1", 0, "unit_p2_skeletons"),
      "the specialty must stay playable even after the round's Spell is spent"
    ).toBeTruthy();
  });

  it("IV: playing the specialty does NOT spend the Spell — a Spell is still castable afterwards (the reported bug)", () => {
    // Reported scenario: "Zilare's Forgetfulness IV — play it and can't cast a
    // Spell, uses the limit of Spell?". Assert the OBSERVABLE outcome: with a real
    // Spell in hand, playing the IV specialty (option A) leaves the one-Spell-per-
    // round limit fully available — the Spell is still offered as a CAST_SPELL —
    // and spellsCastThisRound never moves off 0.
    const state = zilareCombat("zilare-iv-then-spell", "specialty.zilare.4", { type: "ranged", grade: "gold" });
    state.players.p1.hand = ["specialty.zilare.4", "spell.magic_arrow"];
    const spellCastableBefore = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(spellCastableBefore, "the Spell should be castable before the specialty is used").toBe(true);

    const play = findPlay(state, "specialty.zilare.4", 0, "unit_p2_skeletons");
    expect(play, "Forgetfulness IV option A should be offered against a gold ranged enemy").toBeTruthy();
    const after = passAllReactions(applyOk(state, play!.action));

    expect(
      after.players.p1.combatStats.spellsCastThisRound,
      "using the specialty must not spend the one-Spell-per-round limit"
    ).toBe(0);
    expect(
      getLegalActions(after, "p1").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
      ),
      "the Spell must STILL be castable after playing the specialty (it did not eat the Spell)"
    ).toBe(true);
  });

  it("registers Zilare as a Cove Navigator with the Forgetfulness specialty", () => {
    const hero = coreHeroDefinitions.zilare;
    expect(hero.faction).toBe("cove");
    expect(hero.class).toBe("Navigator");
    expect(hero.type).toBe("magic");
    expect(hero.specialtyCardIds).toEqual({
      1: "specialty.zilare.1",
      4: "specialty.zilare.4",
      6: "specialty.zilare.6"
    });
  });
});

// ---------------------------------------------------------------------------
// Miriam — Scouting (reuses REMOVE_HAND_CARD_THEN_SEARCH)
// ---------------------------------------------------------------------------

function visitSteps(state: GameState): { label: string; action: GameAction }[] {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "RESOLVE_VISIT_STEP")
    .map((legal) => ({ label: legal.label, action: legal.action }));
}

/** A Cove (Miriam) adventure with p1 active on the map, hand set by the caller. */
function miriamMap(seed: string, hand: string[]): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Miriam", factionId: "cove", heroDefId: "miriam" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.players.p1.hand = [...hand];
  state.players.p1.removed = [];
  // Isolate Miriam's Scouting searches from the first-round face-up seed on the
  // shared discards (which would otherwise raise a deck-search-mode prompt).
  for (const id of ["abilities", "spells", "spells-expert", "artifacts-minor", "artifacts-major"]) {
    if (state.decks[id]) state.decks[id].discardPile = [];
  }
  return state;
}

/** Resolve the remove-then-search flow and return the open DECK_SEARCH choice. */
function searchChoiceAfterRemoving(state: GameState, removeLabelMatch: string): GameState {
  const step = visitSteps(state).find((candidate) => candidate.label.toLowerCase().includes(removeLabelMatch.toLowerCase()));
  if (!step) throw new Error(`no remove step matching "${removeLabelMatch}"`);
  return applyOk(state, step.action);
}

describe("Miriam's Scouting specialty", () => {
  it("I removes an Ability card (only) and Searches the Ability deck (2)", () => {
    const state = miriamMap("miriam-i", ["specialty.miriam.1", "ability.offense", "spell.magic_arrow", "stat.attack"]);
    const play = findPlay(state, "specialty.miriam.1", 0);
    expect(play, "Scouting I should be a map play with an Ability in hand").toBeTruthy();
    const after = applyOk(state, play!.action);

    // Only the Ability card is removable (filter "ability"): not the spell, not the statistic.
    const removeLabels = visitSteps(after).filter((s) => s.label.startsWith("Remove ")).map((s) => s.label.toLowerCase());
    expect(removeLabels.some((label) => label.includes("offense"))).toBe(true);
    expect(removeLabels.some((label) => label.includes("magic arrow"))).toBe(false);
    expect(removeLabels.some((label) => label.includes("attack"))).toBe(false);

    const searched = searchChoiceAfterRemoving(after, "offense");
    expect(searched.players.p1.removed).toContain("ability.offense");
    expect(searched.players.p1.discard).toContain("specialty.miriam.1"); // option 0 keeps the specialty
    const choice = searched.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.deckId).toBe("abilities");
      expect(choice.revealedCardIds.length).toBe(2);
    }
  });

  it("I is NOT offered without an Ability card in hand (filter gate)", () => {
    const state = miriamMap("miriam-i-none", ["specialty.miriam.1", "spell.magic_arrow", "artifact.centaurs_axe", "stat.attack"]);
    expect(findPlay(state, "specialty.miriam.1", 0)).toBeFalsy();
    expect(findPlay(state, "specialty.miriam.1", 1)).toBeFalsy();
  });

  it("I option 1 also removes the Specialty card (cost.removeSelf)", () => {
    const state = miriamMap("miriam-i-self", ["specialty.miriam.1", "ability.offense"]);
    const play = findPlay(state, "specialty.miriam.1", 1);
    expect(play, "the remove-this-Specialty variant should be offered").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.removed).toContain("specialty.miriam.1");
    expect(after.players.p1.discard).not.toContain("specialty.miriam.1");
    // The Search still happens.
    const searched = searchChoiceAfterRemoving(after, "offense");
    expect(searched.players.p1.removed).toContain("ability.offense");
    expect(searched.pendingChoice?.type).toBe("DECK_SEARCH");
  });

  it("IV removes a Spell and offers a Basic-OR-Expert Spell deck choice (the Expert reach)", () => {
    const state = miriamMap("miriam-iv", ["specialty.miriam.4", "spell.magic_arrow", "stat.attack"]);
    const play = findPlay(state, "specialty.miriam.4", 0);
    expect(play, "Scouting IV should accept any removable card").toBeTruthy();
    const removed = searchChoiceAfterRemoving(applyOk(state, play!.action), "magic arrow");
    expect(removed.players.p1.removed).toContain("spell.magic_arrow");

    // The scouting reach now offers a deck-pick that INCLUDES the Expert Spell deck
    // (a Captain would never reach it through the normal expert-spell gate).
    const picks = visitSteps(removed).map((s) => s.label.toLowerCase());
    expect(picks.some((label) => label.includes("expert spell")), "Expert Spell deck should be offered").toBe(true);
    expect(picks.some((label) => label.includes("spell"))).toBe(true);

    const expert = visitSteps(removed).find((s) => s.label.toLowerCase().includes("expert spell"));
    const searched = applyOk(removed, expert!.action);
    const choice = searched.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.deckId).toBe("spells-expert");
      expect(choice.revealedCardIds.length).toBeGreaterThan(0);
    }
  });

  it("IV removes an Artifact and offers a Minor-OR-Major Artifact deck choice (the Major reach)", () => {
    const state = miriamMap("miriam-iv-art", ["specialty.miriam.4", "artifact.centaurs_axe", "stat.attack"]);
    const play = findPlay(state, "specialty.miriam.4", 0);
    expect(play, "Scouting IV should accept an Artifact").toBeTruthy();
    const removed = searchChoiceAfterRemoving(applyOk(state, play!.action), "centaur");
    expect(removed.players.p1.removed).toContain("artifact.centaurs_axe");

    // Cove has no artifact-source building, so the normal gate would never unlock
    // Major artifacts — the specialty's scouting reach grants the choice.
    const major = visitSteps(removed).find((s) => s.label.toLowerCase().includes("major artifact"));
    expect(major, "Major Artifact deck should be offered").toBeTruthy();
    const searched = applyOk(removed, major!.action);
    const choice = searched.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.deckId).toBe("artifacts-major");
      expect(choice.revealedCardIds.length).toBeGreaterThan(0);
    }
  });

  it("I stays Ability-only — no Major/Expert reach (the tier choice is IV/VI's)", () => {
    const state = miriamMap("miriam-i-noreach", ["specialty.miriam.1", "ability.offense"]);
    const removed = searchChoiceAfterRemoving(applyOk(state, findPlay(state, "specialty.miriam.1", 0)!.action), "offense");
    // The Ability deck has no tiers, so I goes straight to the DECK_SEARCH (no deck-pick).
    expect(removed.pendingChoice?.type).toBe("DECK_SEARCH");
    if (removed.pendingChoice?.type === "DECK_SEARCH") {
      expect(removed.pendingChoice.deckId).toBe("abilities");
    }
  });

  it("VI Searches 4 deep (the count flows through to the deck Search, not the hardcoded 2)", () => {
    const state = miriamMap("miriam-vi", ["specialty.miriam.6", "ability.offense"]);
    const after = applyOk(state, findPlay(state, "specialty.miriam.6", 0)!.action);
    const searched = searchChoiceAfterRemoving(after, "offense");
    const choice = searched.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.deckId).toBe("abilities");
      expect(choice.revealedCardIds.length).toBe(4);
    }
  });

  it("registers Miriam as a Cove Captain with the Scouting specialty", () => {
    const hero = coreHeroDefinitions.miriam;
    expect(hero.faction).toBe("cove");
    expect(hero.class).toBe("Captain");
    expect(hero.specialtyCardIds).toEqual({
      1: "specialty.miriam.1",
      4: "specialty.miriam.4",
      6: "specialty.miriam.6"
    });
  });
});
