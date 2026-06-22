import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Engine coverage for Ciele — the Conflux Magic Arrow Elementalist. Every level
 * is driven through the real engine and each test fails if the wiring is removed.
 *
 *   I  — map: take a Magic Arrow from your discard pile to hand (TAKE_FROM_DISCARD,
 *        filtered to Magic Arrow). — OR — +1 Power reaction.
 *   IV — combat: cast a Magic Arrow from the Spell-deck discard pile for FREE
 *        (reuses the Helm of the Alabaster Unicorn CAST_FROM_SPELL_DISCARD path,
 *        `spellId`-filtered to Magic Arrow; consumes the specialty to the discard,
 *        not removed; full Power scaling; does not count toward the Spell limit).
 *        — OR — +1 Power reaction.
 *   VI — combat: a chosen enemy suffers 2 damage (DAMAGE_CHOSEN_ENEMIES). — OR —
 *        +2 Power reaction.
 */

const CIELE_1 = "specialty.ciele.1";
const CIELE_4 = "specialty.ciele.4";
const CIELE_6 = "specialty.ciele.6";
const MAGIC_ARROW = "spell.magic_arrow";

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

/** A combat state where p1's Griffins are the fresh active unit (cast gate open). */
function cieleCombat(seed: string, hand: string[], discardPile: string[]): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = hand;
  state.players.p2.hand = [];
  state.decks.spells.discardPile = discardPile;
  const target = state.combat!.units.unit_p2_skeletons;
  target.maxHealth = 20;
  target.damage = 0;
  const griffins = state.combat!.units.unit_p1_griffins;
  griffins.activatedThisRound = false;
  griffins.movedThisActivation = false;
  griffins.attackedThisActivation = false;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

function cieleArrowCast(state: GameState) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.fromSpellDeck === CIELE_4 &&
      legal.action.cardId === MAGIC_ARROW &&
      legal.action.target.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
}

describe("Ciele — registration", () => {
  it("is the fifth Conflux hero, an Elementalist with all three Magic Arrow specialties implemented", () => {
    expect(coreFactionDefinitions.conflux.heroes).toContain("ciele");
    const ciele = coreHeroDefinitions.ciele;
    expect(ciele.faction).toBe("conflux");
    expect(ciele.class).toBe("Elementalist");
    expect(ciele.startingAbilityCardId).toBe("ability.water_magic");
    expect(ciele.startingStats).toEqual({ attack: 0, defense: 0, power: 2, knowledge: 3 });
    for (const id of [CIELE_1, CIELE_4, CIELE_6]) {
      expect(cardLibrary[id]?.implementationStatus, id).toBe("implemented");
    }
  });
});

describe("Ciele IV — cast a Magic Arrow from the discard pile for free", () => {
  it("casts the Magic Arrow at the caster's Power, leaves it in the shared discard, and cycles the specialty to the discard (not removed)", () => {
    const state = cieleCombat("ciele-iv", [CIELE_4], [MAGIC_ARROW]);
    const cast = cieleArrowCast(state);
    expect(cast, "Ciele IV should offer casting the discard Magic Arrow").toBeTruthy();

    const after = passAllReactions(applyOk(state, cast!.action));
    // Power 0 → Magic Arrow deals 1.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // The spell is the shared deck's card — it stays in the Spell-deck discard.
    expect(after.decks.spells.discardPile).toContain(MAGIC_ARROW);
    expect(after.players.p1.hand).not.toContain(MAGIC_ARROW);
    // The specialty is a hero card, so it cycles to the player's discard (redrawable),
    // NOT removed from the game like the Helm artifact.
    expect(after.players.p1.discard).toContain(CIELE_4);
    expect(after.players.p1.removed).not.toContain(CIELE_4);
    expect(after.players.p1.hand).not.toContain(CIELE_4);
    // Free bonus cast — it does not consume the one-Spell-per-round limit.
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(0);
  });

  it("is a free cast — still offered and castable after the Spell limit is used up", () => {
    const state = cieleCombat("ciele-iv-limit", [CIELE_4], [MAGIC_ARROW]);
    state.players.p1.combatStats.spellsCastThisRound = 1;
    const cast = cieleArrowCast(state);
    expect(cast, "Ciele IV bypasses the Spell limit").toBeTruthy();
    const after = passAllReactions(applyOk(state, cast!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("finds the Magic Arrow anywhere in the discard — not just the top (proves the spellId filter)", () => {
    // Haste is on top, a Magic Arrow is buried beneath it. The Helm would cast the
    // top (Haste); Ciele casts the filtered Magic Arrow.
    const state = cieleCombat("ciele-iv-buried", [CIELE_4], [MAGIC_ARROW, "spell.haste"]);
    const arrow = cieleArrowCast(state);
    expect(arrow, "Ciele casts the buried Magic Arrow, not the discard top").toBeTruthy();
    const castHaste = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromSpellDeck === CIELE_4 && legal.action.cardId === "spell.haste"
    );
    expect(castHaste, "Ciele must NOT be able to cast a non-Magic-Arrow spell").toBeFalsy();
  });

  it("is not offered when the discard pile holds no Magic Arrow", () => {
    const state = cieleCombat("ciele-iv-none", [CIELE_4], ["spell.haste", "spell.bless"]);
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromSpellDeck === CIELE_4
    );
    expect(cast).toBeFalsy();
  });

  it("scales with Power — a Power source raises the Magic Arrow's damage", () => {
    const state = cieleCombat("ciele-iv-power", [CIELE_4, "stat.power"], [MAGIC_ARROW]);
    let after = applyOk(state, cieleArrowCast(state)!.action);
    const boost = getLegalActions(after, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    expect(boost, "a Power source feeds the Ciele cast window").toBeTruthy();
    after = passAllReactions(applyOk(after, boost!.action));
    // Magic Arrow at Power 1 deals 2 (vs 1 at Power 0).
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("option B is a +1 Power reaction offered when you cast a Spell", () => {
    const state = cieleCombat("ciele-iv-power-react", [CIELE_4, MAGIC_ARROW], [MAGIC_ARROW]);
    // Cast the Magic Arrow from HAND (a normal cast), opening a SPELL_CAST_STARTED window.
    const handCast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === MAGIC_ARROW &&
        !legal.action.fromSpellDeck &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    let after = applyOk(state, handCast!.action);
    const react = getLegalActions(after, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === CIELE_4 && legal.action.optionIndex === 1
    );
    expect(react, "Ciele IV's +1 Power reaction should be offered on your spell cast").toBeTruthy();
    after = passAllReactions(applyOk(after, react!.action));
    // The hand Magic Arrow now resolves at Power 1 → 2 damage.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});

describe("Ciele VI — a chosen enemy suffers 2 damage", () => {
  it("deals 2 damage to the sole living enemy", () => {
    const state = cieleCombat("ciele-vi", [CIELE_6], []);
    // Leave exactly one living enemy so the pick auto-resolves onto it.
    for (const id of ["unit_p2_vampires", "unit_p2_dread_knights"] as const) {
      const unit = state.combat!.units[id];
      if (unit) unit.damage = unit.maxHealth;
    }
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === CIELE_6 && legal.action.optionIndex === 0
    );
    expect(play, "Ciele VI's 2-damage option should be a combat play").toBeTruthy();
    const after = passAllReactions(applyOk(state, play!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});

describe("Ciele I — recall a Magic Arrow from the discard pile (map)", () => {
  function mapState(seed: string, discard: string[]): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    for (const pl of Object.values(state.players)) {
      pl.canMulligan = false;
      pl.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    state.players.p1.hand = [CIELE_1];
    state.players.p1.discard = discard;
    return state;
  }

  it("offers the recall and puts a Magic Arrow into hand, cycling the specialty to the discard", () => {
    const state = mapState("ciele-i", [MAGIC_ARROW, "spell.haste", "stat.attack"]);
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === CIELE_1 && legal.action.optionIndex === 0
    );
    expect(play, "the Magic Arrow recall should be offered on the map").toBeTruthy();
    const opened = applyOk(state, play!.action);
    expect(opened.pendingChoice?.type).toBe("OPTION_CHOICE");
    const took = applyOk(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 0
    });
    expect(took.players.p1.hand).toContain(MAGIC_ARROW);
    expect(took.players.p1.discard).toContain(CIELE_1);
  });

  it("is NOT offered when the discard pile holds a Spell but no Magic Arrow (proves the filter)", () => {
    const state = mapState("ciele-i-filter", ["spell.haste", "spell.bless"]);
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === CIELE_1 && legal.action.optionIndex === 0
    );
    expect(play, "no Magic Arrow in discard → no recall").toBeFalsy();
  });
});
