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
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    state.players.p1.hand = [HELM];
    // Only the Spell is a candidate; the two Statistic cards are filtered out.
    state.players.p1.discard = ["stat.attack", "spell.haste", "stat.defense"];

    const play = findPlay(state, "p1", HELM, 0);
    expect(play, "the Spell-from-discard side should be offered on the map").toBeTruthy();

    const opened = applyOk(state, play!);
    expect(opened.pendingChoice?.type).toBe("OPTION_CHOICE");
    const labels = choiceLabels(opened);
    // Spell Book (house rule, default ON) adds a "→ Spell Book" route for the
    // Spell candidate; optionIndex 0 is still the "to hand" one.
    expect(labels.length).toBe(2);
    expect(labels.every((label) => label.includes("Haste"))).toBe(true);
    expect(labels.some((label) => label.includes("Spell Book"))).toBe(true);

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

  it("is usable IN COMBAT too — an instant artifact is click-to-use, not map-only", () => {
    // Reported bug: clicking the Helm in battle offered NEITHER option (option A
    // was map-only, option B needs a Spell-deck-discard top). An instant artifact
    // is a click-to-use combat play, so its "return a Spell from your discard"
    // side must be offered and resolve mid-Combat.
    const state = createInitialGameState("helm-return-combat");
    state.players.p1.hand = [HELM];
    state.players.p2.hand = [];
    state.players.p1.discard = ["spell.haste"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;

    const play = findPlay(state, "p1", HELM, 0);
    expect(play, "option A must be offered mid-Combat (instant artifact)").toBeTruthy();

    const opened = applyOk(state, play!);
    // The discard-pick opens IMMEDIATELY in combat (not parked on the map queue).
    expect(opened.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect((opened.pendingChoice as { context?: string }).context).toBe("discard-pick");

    const took = applyOk(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 0
    });
    // Observable outcome: the Spell is back in hand mid-battle; the Helm cycled out.
    expect(took.players.p1.hand).toContain("spell.haste");
    expect(took.players.p1.hand).not.toContain(HELM);
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
    // It is a free bonus cast: it does NOT consume the one-Spell-per-round limit.
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(0);
  });

  it("is a free cast — offered, and castable, even after the spell limit is used up", () => {
    const state = helmCastState("helm-past-limit");
    // The player has already cast their Spell this combat round.
    state.players.p1.combatStats.spellsCastThisRound = 1;

    const cast = helmCast(state);
    expect(cast, "the Helm cast bypasses the spell limit").toBeTruthy();

    const after = passAllReactions(applyOk(state, cast!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(after.players.p1.removed).toContain(HELM);
    // Still does not bump the limit counter past where it already was.
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

  it("the Tower Magi Pack +1 Power lands on only the first spell — never both the free Helm cast and a later one", () => {
    const state = helmCastState("helm-magi");
    state.players.p1.hand = [HELM, "spell.magic_arrow"];
    // The active unit carries the Magi Pack "+1 Power to your first spell this round".
    state.combat!.units.unit_p1_griffins.abilities = ["magi-power-boost"];

    // Cast 1 — the free Helm cast is the round's first spell, so it gets the +1
    // (Magic Arrow at Power 1 = 2 damage).
    let after = passAllReactions(applyOk(state, helmCast(state)!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);

    // Cast 2 — a normal Magic Arrow from hand is no longer the first spell (the
    // Helm cast consumed the bonus), so it gets NO +1: +1 more damage, not +2.
    const normalCast = getLegalActions(after, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        !legal.action.fromSpellDeck &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(normalCast, "the normal cast is still allowed — the Helm did not use the limit").toBeTruthy();
    after = passAllReactions(applyOk(after, normalCast!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(3);
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
  /**
   * Leaves Griffins (active), `targetId`, and p1's ranged Marksmen fresh, then
   * ends Griffins so `targetId` becomes the about-to-activate unit and the
   * pre-activation window settles around it. `targetId` is given top initiative
   * and the Marksmen the lowest so the queue is deterministic.
   */
  function aboutToActivate(targetId: string, p1Hand: string[]): GameState {
    const state = createInitialGameState("bowstring-seed");
    state.players.p1.hand = [...p1Hand];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const marksmen = state.combat!.units.unit_p1_marksmen;
    marksmen.type = "ranged";
    marksmen.initiative = 1; // lowest — never jumps the queue ahead of the target
    state.combat!.units[targetId].initiative = 99; // activates right after Griffins
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = !["unit_p1_griffins", targetId, "unit_p1_marksmen"].includes(unit.id);
    }
    return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
  }

  function bowstringReaction(state: GameState, playerId: PlayerId, targetUnitId?: UnitId) {
    return getLegalActions(state, playerId).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === BOWSTRING &&
        legal.action.optionIndex === 0 &&
        (targetUnitId === undefined ||
          (legal.action.target?.type === "unit" && legal.action.target.unitId === targetUnitId))
    );
  }

  it("opens a pre-activation window to activate your ranged unit BEFORE an enemy unit acts", () => {
    let state = aboutToActivate("unit_p2_skeletons", [BOWSTRING]);
    // The enemy Skeletons are about to activate; the shared window is open to p1.
    expect(state.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(state.reactionWindow, "the pre-activation window should open").toBeTruthy();

    const play = bowstringReaction(state, "p1", "unit_p1_marksmen");
    expect(play, "p1 may activate their Marksmen before the enemy acts").toBeTruthy();
    state = applyOk(state, play!.action);

    // The Marksmen take an out-of-order activation now; the Bowstring is spent.
    expect(state.combat!.activeUnitId).toBe("unit_p1_marksmen");
    expect(state.players.p1.hand).not.toContain(BOWSTRING);
    expect(state.players.p1.discard).toContain(BOWSTRING);
  });

  it("can also interject before your own unit acts, and the interrupted unit then resumes", () => {
    let state = aboutToActivate("unit_p1_crusaders", [BOWSTRING]);
    expect(state.combat!.activeUnitId).toBe("unit_p1_crusaders");

    const play = bowstringReaction(state, "p1", "unit_p1_marksmen");
    expect(play, "p1 may activate their Marksmen before their own Crusaders").toBeTruthy();
    state = passAllReactions(applyOk(state, play!.action));
    expect(state.combat!.activeUnitId).toBe("unit_p1_marksmen");

    // End the Marksmen's out-of-order turn: the interrupted Crusaders resume and
    // no unit activates twice.
    state = passAllReactions(applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_marksmen" }));
    expect(state.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(true);
    expect(state.combat!.activeUnitId).toBe("unit_p1_crusaders");
    expect(state.combat!.units.unit_p1_crusaders.activatedThisRound).toBe(false);
  });

  it("offers only your ranged units that have not acted — not ground units, not the active unit", () => {
    const state = aboutToActivate("unit_p2_skeletons", [BOWSTRING]);
    // The Marksmen (ranged, fresh) are a target.
    expect(bowstringReaction(state, "p1", "unit_p1_marksmen")).toBeTruthy();
    // The enemy unit about to act is never a target (it is the active unit).
    expect(bowstringReaction(state, "p1", "unit_p2_skeletons")).toBeFalsy();
    // Griffins are a ground unit (and already activated) — never offered.
    expect(bowstringReaction(state, "p1", "unit_p1_griffins")).toBeFalsy();
  });

  it("does not re-prompt on the unit it just activated — the remaining interrupt waits for the next frame", () => {
    // p1 holds TWO Bowstrings and has two fresh ranged units; the enemy is about
    // to act. Top initiative on the enemy so the queue is deterministic.
    const state = createInitialGameState("bowstring-next-frame");
    state.players.p1.hand = [BOWSTRING, BOWSTRING];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_marksmen.type = "ranged";
    state.combat!.units.unit_p1_marksmen.initiative = 2;
    state.combat!.units.unit_p1_crusaders.type = "ranged";
    state.combat!.units.unit_p1_crusaders.initiative = 3;
    state.combat!.units.unit_p2_skeletons.initiative = 99;
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = !["unit_p1_griffins", "unit_p2_skeletons", "unit_p1_marksmen", "unit_p1_crusaders"].includes(
        unit.id
      );
    }
    let s = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(s.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(s.reactionWindow).toBeTruthy();

    // Use Bowstring #1 to activate the Marksmen.
    s = applyOk(s, bowstringReaction(s, "p1", "unit_p1_marksmen")!.action);
    expect(s.combat!.activeUnitId).toBe("unit_p1_marksmen");
    // It does NOT immediately re-pop a window on the Marksmen, even though a
    // second Bowstring and a second ranged unit remain.
    expect(s.reactionWindow, "no interrupt re-prompt right after the use").toBeNull();
    expect(bowstringReaction(s, "p1"), "the Bowstring is not offered again this instant").toBeFalsy();

    // The Marksmen take their out-of-order turn; only at the NEXT activation frame
    // does the remaining Bowstring surface again (now for the Crusaders).
    s = applyOk(s, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_marksmen" });
    expect(s.reactionWindow, "a fresh window opens at the next frame").toBeTruthy();
    expect(
      bowstringReaction(s, "p1", "unit_p1_crusaders"),
      "the remaining Bowstring is offered at the next frame"
    ).toBeTruthy();
  });

  it("shares the pre-activation window with other interrupts (Sorrow) — both are offered at once", () => {
    // p1's Crusaders are about to act (bronze, so Sorrow's free skip matches).
    // p2 holds Sorrow (skip the Crusaders); p1 holds the Bowstring (fire the
    // Marksmen first). Both interrupts must be live in the one shared window.
    const state = createInitialGameState("bowstring-compose");
    state.players.p1.hand = [BOWSTRING];
    state.players.p2.hand = ["spell.sorrow"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const marksmen = state.combat!.units.unit_p1_marksmen;
    marksmen.type = "ranged";
    marksmen.initiative = 1;
    const crusaders = state.combat!.units.unit_p1_crusaders;
    crusaders.grade = "bronze";
    crusaders.initiative = 99;
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = !["unit_p1_griffins", "unit_p1_crusaders", "unit_p1_marksmen"].includes(unit.id);
    }
    const advanced = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });

    expect(advanced.combat!.activeUnitId).toBe("unit_p1_crusaders");
    expect(advanced.reactionWindow, "the shared pre-activation window opens").toBeTruthy();
    const p2Reactions = advanced.reactionWindow?.legalReactions.p2 ?? [];
    const p1Reactions = advanced.reactionWindow?.legalReactions.p1 ?? [];
    expect(
      p2Reactions.some((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.sorrow"),
      "p2's Sorrow skip is offered"
    ).toBe(true);
    expect(
      p1Reactions.some(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === BOWSTRING &&
          legal.action.target?.type === "unit" &&
          legal.action.target.unitId === "unit_p1_marksmen"
      ),
      "p1's Bowstring activation is offered in the same window"
    ).toBe(true);
  });

  it("does not open the window when the player has no eligible ranged unit", () => {
    const state = aboutToActivate("unit_p2_skeletons", [BOWSTRING]);
    // Re-run with the Marksmen turned into a ground unit: no ranged target exists,
    // so the Bowstring offers nothing and (being the only interrupt) no window opens.
    const noRanged = createInitialGameState("bowstring-no-ranged");
    noRanged.players.p1.hand = [BOWSTRING];
    noRanged.players.p2.hand = [];
    noRanged.activePlayerId = "p1";
    noRanged.combat!.activeUnitId = "unit_p1_griffins";
    noRanged.combat!.units.unit_p1_marksmen.type = "ground";
    noRanged.combat!.units.unit_p2_skeletons.initiative = 99;
    for (const unit of Object.values(noRanged.combat!.units)) {
      unit.activatedThisRound = !["unit_p1_griffins", "unit_p2_skeletons"].includes(unit.id);
    }
    const advanced = applyOk(noRanged, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(advanced.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(bowstringReaction(advanced, "p1")).toBeFalsy();
    // Sanity: the harness with a ranged unit DID open it.
    expect(state.reactionWindow).toBeTruthy();
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
