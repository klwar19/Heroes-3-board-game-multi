import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { cardLibrary } from "@/data/cards/library";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import type { CardPlayMode, GameAction, GameState, PlayerId, UnitId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Passes every open reaction window so the pending spell resolves. */
function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/**
 * Sets up p2 (the caster) about to deal Spell damage to one of p1's units,
 * with p1 holding Interference (plus any extras). Sandbox grades: p1 griffins
 * are bronze. p2 casts during its own skeletons' activation, exactly like the
 * Magic Mirror sandbox.
 */
function setup(
  p1Hand: string[],
  spellCardId = "spell.magic_arrow",
  targetUnitId: UnitId = "unit_p1_griffins"
): GameState {
  const state = createInitialGameState();
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [spellCardId];
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
  return applyOk(state, {
    type: "CAST_SPELL",
    playerId: "p2",
    cardId: spellCardId,
    target: { type: "unit", unitId: targetUnitId }
  });
}

function interferenceReaction(state: GameState, playerId: PlayerId, mode: CardPlayMode) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "ability.interference" &&
      legal.action.mode === mode
  );
}

describe("Interference — card definition", () => {
  it("is an implemented INTERFERE_SPELL reaction wired to enemy spells", () => {
    const card = cardLibrary["ability.interference"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.effect.type).toBe("INTERFERE_SPELL");
    if (card.effect.type === "INTERFERE_SPELL") {
      expect(card.effect.amount).toBe(1);
      expect(card.effect.expertAmount).toBe(2);
    }
    expect(card.trigger).toEqual({ event: "SPELL_CAST_STARTED", controller: "opponent" });
  });

  it("is reachable in both the legacy and BINH ability decks", () => {
    expect(abilityDeckLegacy).toContain("ability.interference");
    expect(abilityDeckBinh).toContain("ability.interference");
  });
});

describe("Interference — reducing spell damage", () => {
  it("basic +1 reduces an enemy Magic Arrow (1 damage) to 0 and grants the unit +1 defense", () => {
    let state = setup(["ability.interference"]);

    // The cast paused for reactions; the targeted side (p1) holds priority.
    expect(state.reactionWindow).toBeTruthy();
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");

    const basic = interferenceReaction(state, "p1", "basic");
    expect(basic, "basic Interference should be offered to the targeted side").toBeTruthy();
    state = applyOk(state, basic!.action);

    // Playing the ability does not cost a Spell for the round (it is not a Spell).
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
    expect(state.players.p1.discard).toContain("ability.interference");

    // The reaction may auto-settle the cast (only reactor acted). Magic Arrow's
    // 1 damage is fully blunted; wiki `<instant>` leaves no combat-long ward.
    state = passAllReactions(state);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.stack).toEqual([]);
    expect(
      state.activeEffects.filter((candidate) =>
        candidate.modifiers.some(
          (modifier) =>
            modifier.type === "SPELL_DAMAGE_REDUCTION" || modifier.type === "DEFENSE_BONUS"
        )
      )
    ).toEqual([]);
  });

  it("control: without Interference the same Magic Arrow deals its full 1 damage", () => {
    const state = passAllReactions(setup([]));
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);
  });

  it("expert +2 reduces an enemy Lightning Bolt (2 damage) to 0 and spends an expert use", () => {
    let state = setup(["ability.interference"], "spell.lightning_bolt");
    state.players.p1.limits.expertUses = 1;

    const expert = interferenceReaction(state, "p1", "expert");
    expect(expert, "expert Interference should be offered with an expert use available").toBeTruthy();
    state = applyOk(state, expert!.action);

    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    state = passAllReactions(state);
    // Lightning Bolt's 2 damage minus expert +2 = 0.
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
  });

  it("control: basic +1 only blunts 1 of Lightning Bolt's 2 damage", () => {
    let state = setup(["ability.interference"], "spell.lightning_bolt");
    const basic = interferenceReaction(state, "p1", "basic");
    state = passAllReactions(applyOk(state, basic!.action));
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);
  });

  it("CONTROL: a LATER enemy spell is NOT reduced (Interference is Instant, not combat-long)", () => {
    let state = setup(["ability.interference"]);
    const basic = interferenceReaction(state, "p1", "basic");
    state = passAllReactions(applyOk(state, basic!.action));
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);

    // A second Magic Arrow later in the Combat hits for full damage — the first
    // Interference was this-cast only and is gone with that stack item.
    state.players.p2.hand = ["spell.magic_arrow"];
    state.players.p2.combatStats.spellsCastThisRound = 0;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
    state = passAllReactions(state);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);
  });
});

describe("Interference — when it is offered", () => {
  it("is never offered to the caster, even holding the card", () => {
    const state = setup(["ability.interference"]);
    state.players.p2.hand.push("ability.interference");
    expect(interferenceReaction(state, "p2", "basic")).toBeFalsy();
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");
  });

  it("is not offered against a non-damaging enemy spell (Haste) on the caster's own unit", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["ability.interference"];
    state.players.p2.hand = ["spell.haste"]; // buff on a p2 unit — no damage, not p1's unit
    state.activePlayerId = "p2";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.activeUnitId = "unit_p2_skeletons";

    const next = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.haste",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });

    if (next.reactionWindow) {
      expect(interferenceReaction(next, "p1", "basic")).toBeFalsy();
    }
    expect(
      next.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "SPELL_DAMAGE_REDUCTION")
      )
    ).toBe(false);
  });

  it("is not offered without an expert use (expert side only)", () => {
    // Expert uses are read when the reaction window opens, so they must be
    // spent before the cast that opens it.
    const base = createInitialGameState();
    base.players.p1.hand = ["ability.interference"];
    base.players.p2.hand = ["spell.magic_arrow"];
    base.players.p1.combatStats.expertUsesSpentThisRound = base.players.p1.limits.expertUses;
    base.activePlayerId = "p2";
    base.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    base.combat!.activeUnitId = "unit_p2_skeletons";
    const state = applyOk(base, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    expect(interferenceReaction(state, "p1", "basic")).toBeTruthy();
    expect(interferenceReaction(state, "p1", "expert")).toBeFalsy();
  });
});
