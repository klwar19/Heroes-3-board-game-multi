import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { artifactDeckBinhMinor, artifactDeckLegacy } from "@/data/cards/artifacts";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions
} from "./index";
import type { GameAction, GameState, PlayerId, UnitId, UnitType } from "./state";

/**
 * Engine coverage for the two Unicorn artifacts. Every rule is engine-enforced;
 * each test drives the real card through the engine and fails if the wiring is
 * removed.
 *
 *   • Helm of the Alabaster Unicorn (Minor, Tower) — option A returns a Spell
 *     from your discard pile to hand (map play); option B casts the top card of
 *     the shared Spell-deck discard pile at your normal Power (a `fromSpellDeck`
 *     cast, like a Spell Scroll) and removes the Helm from the game.
 *   • Bowstring of the Unicorn's Mane (Minor, Stronghold) — option A activates
 *     one of your ranged units that has not acted this round (an out-of-order
 *     activation); option B is the Shield-of-the-Dwarven-Lords post-roll die
 *     ignore, gated to a ranged attacker.
 */

const HELM = "artifact.helm_of_the_alabaster_unicorn";
const BOWSTRING = "artifact.bowstring_of_the_unicorns_mane";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Pass/resolve every open window or attack-die reroll until combat is idle. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety-- > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

function findPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number,
  targetUnitId?: UnitId
): Extract<GameAction, { type: "PLAY_CARD" }> | undefined {
  for (const entry of getLegalActions(state, playerId)) {
    const action = entry.action;
    if (action.type !== "PLAY_CARD" || action.cardId !== cardId || action.optionIndex !== optionIndex) {
      continue;
    }
    if (targetUnitId !== undefined && !(action.target?.type === "unit" && action.target.unitId === targetUnitId)) {
      continue;
    }
    return action;
  }
  return undefined;
}

function choiceLabels(state: GameState): string[] {
  const choice = state.pendingChoice;
  return choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
}

// ---------------------------------------------------------------------------
// Card definitions / deck membership
// ---------------------------------------------------------------------------

describe("Unicorn artifacts — definitions", () => {
  it("are implemented Minor artifacts wired to the new mechanics and reachable in a deck", () => {
    for (const id of [HELM, BOWSTRING]) {
      const card = cardLibrary[id];
      expect(card, `${id} should exist`).toBeTruthy();
      expect(card!.implementationStatus).toBe("implemented");
      expect(card!.artifactTier).toBe("minor");
      expect(artifactDeckLegacy).toContain(id);
      expect(artifactDeckBinhMinor).toContain(id);
    }

    const helm = cardLibrary[HELM]!;
    const bowstring = cardLibrary[BOWSTRING]!;
    if (helm.effect.type !== "CHOOSE_ONE" || bowstring.effect.type !== "CHOOSE_ONE") {
      throw new Error("Both Unicorn artifacts are CHOOSE_ONE cards.");
    }
    expect(helm.effect.options.map((option) => option.effect.type)).toEqual([
      "TAKE_FROM_DISCARD",
      "CAST_FROM_SPELL_DISCARD"
    ]);
    expect(bowstring.effect.options.map((option) => option.effect.type)).toEqual([
      "ACTIVATE_RANGED_UNIT",
      "IGNORE_ATTACK_DIE_RESULT"
    ]);
    // Option B of the Bowstring is gated to a ranged attacker.
    expect(bowstring.effect.options[1]?.requiresRangedAttacker).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helm of the Alabaster Unicorn — option A (return a Spell, map play)
// ---------------------------------------------------------------------------

describe("Helm of the Alabaster Unicorn — return a Spell (option A)", () => {
  it("returns a Spell from your discard pile to your hand and keeps the Helm in the discard", () => {
    const state = createAdventureGameState({ seed: "helm-return", difficulty: "normal", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    state.players.p1.hand = [HELM];
    // Only the Spell is a candidate; the two Statistic cards are filtered out.
    state.players.p1.discard = ["stat.attack", "spell.haste", "stat.defense"];

    const play = findPlay(state, "p1", HELM, 0);
    expect(play, "the Spell-from-discard side should be offered on the map").toBeTruthy();

    const opened = applyOk(state, play!);
    expect(opened.pendingChoice?.type).toBe("OPTION_CHOICE");
    const labels = choiceLabels(opened);
    expect(labels.length).toBe(1);
    expect(labels[0]).toContain("Haste");

    const took = applyOk(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 0
    });
    expect(took.players.p1.hand).toContain("spell.haste");
    // Option A has no "Remove this card": the Helm cycles to the discard pile.
    expect(took.players.p1.discard).toContain(HELM);
    expect(took.players.p1.removed).not.toContain(HELM);
  });
});

// ---------------------------------------------------------------------------
// Helm of the Alabaster Unicorn — option B (cast top of Spell-deck discard)
// ---------------------------------------------------------------------------

describe("Helm of the Alabaster Unicorn — cast the Spell-deck discard top (option B)", () => {
  function helmCastState(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [HELM];
    state.players.p2.hand = [];
    // The public top of the shared Spell-deck discard pile is a Magic Arrow.
    state.decks.spells.discardPile = ["spell.magic_arrow"];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 20;
    target.damage = 0;
    // p1's Griffins are the fresh active unit, so the activation-timing gate is open.
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.movedThisActivation = false;
    griffins.attackedThisActivation = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return state;
  }

  function helmCast(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.fromSpellDeck === HELM &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
  }

  it("casts the top spell, removes the Helm, and leaves the spell in the shared discard pile", () => {
    const state = helmCastState("helm-cast");
    const cast = helmCast(state);
    expect(cast, "the Helm spell-deck cast should be offered").toBeTruthy();

    const after = passAllReactions(applyOk(state, cast!.action));

    // The spell resolved at the caster's Power (0 here → Magic Arrow deals 1).
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // "Remove this card": the Helm leaves the game, never to the discard pile.
    expect(after.players.p1.removed).toContain(HELM);
    expect(after.players.p1.discard).not.toContain(HELM);
    expect(after.players.p1.hand).not.toContain(HELM);
    // The cast spell stays in the SHARED Spell-deck discard — it is never the
    // caster's card, so it never enters their hand or discard pile.
    expect(after.decks.spells.discardPile).toContain("spell.magic_arrow");
    expect(after.players.p1.discard).not.toContain("spell.magic_arrow");
    expect(after.players.p1.hand).not.toContain("spell.magic_arrow");
    // It counts as the player's spell for the combat round.
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("casts at the caster's Power — a Power source raises it (unlike a power-locked Scroll)", () => {
    const state = helmCastState("helm-power");
    state.players.p1.hand = [HELM, "stat.power"];

    const cast = helmCast(state);
    expect(cast).toBeTruthy();
    let after = applyOk(state, cast!.action);

    // A Power statistic is offered into the cast window and boosts it.
    const boost = getLegalActions(after, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    expect(boost, "a Power source should be offered into the Helm cast window").toBeTruthy();
    after = passAllReactions(applyOk(after, boost!.action));

    // Magic Arrow at Power 1 deals 2 (vs 1 at Power 0): the cast is NOT power-locked.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("is not offered when the Spell-deck discard pile is empty", () => {
    const state = helmCastState("helm-empty");
    state.decks.spells.discardPile = [];
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromSpellDeck === HELM
      )
    ).toBe(false);
  });

  it("is never offered as a from-hand PLAY_CARD (only as the Spell-deck cast)", () => {
    const state = helmCastState("helm-not-playcard");
    expect(findPlay(state, "p1", HELM, 1)).toBeFalsy();
    // Trying to force the play through is rejected as illegal.
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: HELM,
      mode: "basic",
      optionIndex: 1,
      target: { type: "none" }
    });
    expect(result.errors.length).toBeGreaterThan(0);
    // The Helm is untouched by the rejected play.
    expect(result.state.players.p1.hand).toContain(HELM);
  });
});

// ---------------------------------------------------------------------------
// Bowstring of the Unicorn's Mane — option A (activate a ranged unit)
// ---------------------------------------------------------------------------

describe("Bowstring of the Unicorn's Mane — activate a ranged unit (option A)", () => {
  function combatState(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [BOWSTRING];
    state.players.p2.hand = [];
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.type = "ground";
    griffins.activatedThisRound = false;
    griffins.movedThisActivation = false;
    griffins.attackedThisActivation = false;
    const marksmen = state.combat!.units.unit_p1_marksmen;
    marksmen.type = "ranged";
    marksmen.activatedThisRound = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return state;
  }

  it("offers activating a ranged unit that has not acted — but never the active unit itself", () => {
    const state = combatState("bowstring-offer");
    expect(findPlay(state, "p1", BOWSTRING, 0, "unit_p1_marksmen"), "the ranged unit is a target").toBeTruthy();
    // The currently-active unit is excluded (activating it would be a no-op).
    expect(findPlay(state, "p1", BOWSTRING, 0, "unit_p1_griffins")).toBeFalsy();
    // A ground unit is never a target.
    state.combat!.units.unit_p1_crusaders.type = "ground";
    state.combat!.units.unit_p1_crusaders.activatedThisRound = false;
    expect(findPlay(state, "p1", BOWSTRING, 0, "unit_p1_crusaders")).toBeFalsy();
  });

  it("makes the chosen ranged unit the active unit and takes its activation out of order", () => {
    const state = combatState("bowstring-activate");
    // Leave only Griffins (active) and Marksmen un-activated, so the resume is
    // deterministic: everyone else has already gone this round.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.id !== "unit_p1_griffins" && unit.id !== "unit_p1_marksmen") {
        unit.activatedThisRound = true;
      }
    }

    const play = findPlay(state, "p1", BOWSTRING, 0, "unit_p1_marksmen");
    expect(play).toBeTruthy();
    const activated = passAllReactions(applyOk(state, play!));

    // The Marksmen are now the active unit, fresh and ready to act.
    expect(activated.combat!.activeUnitId).toBe("unit_p1_marksmen");
    expect(activated.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(false);
    // The Bowstring was spent (it has no "Remove this card").
    expect(activated.players.p1.hand).not.toContain(BOWSTRING);
    expect(activated.players.p1.discard).toContain(BOWSTRING);

    // Ending the Marksmen's out-of-order turn (they Defend) marks them done and
    // hands the round back to the interrupted Griffins — no unit activates twice.
    const ended = passAllReactions(
      applyOk(activated, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_marksmen" })
    );
    expect(ended.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(true);
    expect(ended.combat!.activeUnitId).toBe("unit_p1_griffins");
    expect(ended.combat!.units.unit_p1_griffins.activatedThisRound).toBe(false);
  });

  it("is not offered once the active unit has already moved or attacked this turn", () => {
    const state = combatState("bowstring-not-fresh");
    state.combat!.units.unit_p1_griffins.movedThisActivation = true;
    expect(findPlay(state, "p1", BOWSTRING, 0, "unit_p1_marksmen")).toBeFalsy();
  });

  it("does not target a ranged unit that has already been activated this round", () => {
    const state = combatState("bowstring-already-acted");
    state.combat!.units.unit_p1_marksmen.activatedThisRound = true;
    expect(findPlay(state, "p1", BOWSTRING, 0, "unit_p1_marksmen")).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Bowstring of the Unicorn's Mane — option B (ignore a ranged attacker's die)
// ---------------------------------------------------------------------------

describe("Bowstring of the Unicorn's Mane — ignore a ranged unit's Attack die (option B)", () => {
  function rangedAttack(seed: string, rolls: number[], attackerType: UnitType, p2Hand: string[]): GameState {
    const state = createInitialGameState(seed);
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.type = attackerType;
    attacker.position = 9;
    attacker.attack = 5;
    attacker.abilities = [];
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13; // adjacent to 9
    defender.defense = 1;
    defender.maxHealth = 40;
    defender.damage = 0;
    defender.abilities = [];
    state.players.p1.hand = [];
    state.players.p2.hand = p2Hand;
    state.combat!.dice.scriptedRolls = rolls;
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
  }

  function passToDieSettledWindow(state: GameState): GameState {
    let current = state;
    let safety = 12;
    while (
      safety-- > 0 &&
      current.reactionWindow &&
      current.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED"
    ) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
    }
    return current;
  }

  function bowstringDieIgnore(state: GameState) {
    return (state.reactionWindow?.legalReactions.p2 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === BOWSTRING && legal.action.optionIndex === 1
    );
  }

  function skeletonDamage(state: GameState): number {
    return state.combat!.units.unit_p2_skeletons.damage;
  }

  it("offers the post-roll die-ignore when the attacker is a ranged unit", () => {
    // A ranged attack rolls the Attack die with disadvantage (two dice, take the
    // lower), so both scripted dice are +1 to leave a +1 on the table.
    const atDie = passToDieSettledWindow(rangedAttack("bow-ranged", [1, 1, 0], "ranged", [BOWSTRING]));
    expect(atDie.reactionWindow?.triggerEvent.type).toBe("ATTACK_DIE_SETTLED");
    expect(bowstringDieIgnore(atDie), "the die-ignore should be offered vs a ranged attacker").toBeTruthy();
  });

  it("does NOT offer the die-ignore when the attacker is not a ranged unit", () => {
    // With a ground attacker the Bowstring is gated out; it is the only die-cancel
    // card here, so the post-roll window never even opens for it.
    const atDie = passToDieSettledWindow(rangedAttack("bow-melee", [1, 0, 0], "ground", [BOWSTRING]));
    expect(atDie.reactionWindow?.triggerEvent.type ?? null).not.toBe("ATTACK_DIE_SETTLED");
    expect(
      (atDie.reactionWindow?.legalReactions.p2 ?? []).some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === BOWSTRING
      ),
      "a non-ranged attacker must not unlock the die-ignore"
    ).toBe(false);
  });

  it("ignoring the die drops the die's contribution from the resolved hit", () => {
    // A ranged attack rolls the Attack die with disadvantage (two dice, take the
    // lower), so both scripted dice are +1 → a +1 lands. Control: nobody cancels,
    // the +1 die lands → 5 attack + 1 − 1 defense = 5.
    const control = settle(passToDieSettledWindow(rangedAttack("bow-control", [1, 1, 0], "ranged", [])));
    const controlDamage = skeletonDamage(control);
    expect(controlDamage).toBe(5);

    // Ignore the die → the +1 the die contributed is dropped (5 + 0 − 1 = 4), and
    // the card is spent.
    const atDie = passToDieSettledWindow(rangedAttack("bow-ignore", [1, 1, 0], "ranged", [BOWSTRING]));
    const ignore = bowstringDieIgnore(atDie);
    expect(ignore, "the die-ignore option should be offered").toBeTruthy();
    const after = settle(applyOk(atDie, ignore!.action));

    expect(skeletonDamage(after)).toBe(controlDamage - 1);
    expect(after.players.p2.hand).not.toContain(BOWSTRING);
    expect(after.reactionWindow).toBeNull();
  });
});
