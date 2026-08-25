import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * Sandbox grades: p1 marksmen/griffins = bronze, crusaders = silver; p2
 * skeletons = bronze, vampires = silver, dread_knights = gold.
 *
 * Sets up p2 (defender) about to cast Magic Arrow at one of p1's units, with
 * p1 holding Magic Mirror (+ optional power for the silver/gold grades).
 */
function mirrorSetup(p1Hand: string[], targetUnitId: UnitId = "unit_p1_griffins"): GameState {
  const state = createInitialGameState();
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = ["spell.magic_arrow"];
  // p2 casts during its own unit's activation (skeletons, pre-attack).
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
  return applyOk(state, {
    type: "CAST_SPELL",
    playerId: "p2",
    cardId: "spell.magic_arrow",
    target: { type: "unit", unitId: targetUnitId }
  });
}

function reactionFor(state: GameState, playerId: PlayerId, cardId: string, optionIndex: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

/** Narrows and returns the open spell-redirect target choice. */
function redirectChoice(state: GameState) {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "ABILITY_TARGET_CHOICE") {
    throw new Error("expected an ABILITY_TARGET_CHOICE to be open");
  }
  return choice;
}

describe("Magic Mirror", () => {
  it("offers Air Magic expert before the redirect and unlocks the gold target tier", () => {
    const base = createInitialGameState("mirror-school-expert");
    base.players.p1.hand = ["spell.magic_mirror"];
    base.players.p1.permanents = ["ability.air_magic"];
    base.players.p1.limits.expertUses = 1;
    base.players.p2.hand = ["spell.magic_arrow"];
    base.activePlayerId = "p2";
    base.combat!.activeUnitId = "unit_p2_skeletons";
    base.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    let state = applyOk(base, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    const expert = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_SCHOOL_PERMANENT_EXPERT"
    );
    expect(expert).toBeTruthy();
    state = applyOk(state, expert!.action);
    expect(state.players.p1.discard).toContain("ability.air_magic");

    const gold = reactionFor(state, "p1", "spell.magic_mirror", 2);
    expect(gold).toBeTruthy();
    state = applyOk(state, gold!.action);
    expect(redirectChoice(state).candidateUnitIds).toContain("unit_p2_dread_knights");
  });

  it("redirects an enemy spell from your unit to a new bronze target, which takes the damage", () => {
    let state = mirrorSetup(["spell.magic_mirror"]);

    // The cast paused for reactions: p1 (the targeted side) may Magic Mirror it.
    expect(state.reactionWindow).toBeTruthy();
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");

    const bronze = reactionFor(state, "p1", "spell.magic_mirror", 0);
    expect(bronze, "bronze redirect should be offered").toBeTruthy();
    state = applyOk(state, bronze!.action);

    // Playing it opens a follow-up target choice (it does not resolve yet).
    const choice = redirectChoice(state);
    expect(choice.kind).toBe("spell-redirect");
    expect(choice.playerId).toBe("p1");
    // Bronze grade: only bronze units, never the original target.
    expect(choice.candidateUnitIds).toContain("unit_p2_skeletons");
    expect(choice.candidateUnitIds).toContain("unit_p1_marksmen");
    expect(choice.candidateUnitIds).not.toContain("unit_p1_griffins");
    expect(choice.candidateUnitIds).not.toContain("unit_p2_vampires"); // silver
    expect(choice.candidateUnitIds).not.toContain("unit_p2_dread_knights"); // gold

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_skeletons"
    });

    // The spell resolved against the new target; the original unit is untouched.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.stack).toHaveLength(0);
    expect(state.reactionWindow).toBeNull();
    expect(state.pendingChoice).toBeNull();

    // Casting Magic Mirror spends p1's one spell for the round.
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
    expect(state.players.p1.discard).toContain("spell.magic_mirror");
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
  });

  it("gates the new target by the Power paid: gold needs 2 Power and unlocks gold units", () => {
    let state = mirrorSetup(["spell.magic_mirror", "stat.power", "stat.power"]);

    const gold = reactionFor(state, "p1", "spell.magic_mirror", 2);
    expect(gold, "gold redirect should be affordable with 2 Power").toBeTruthy();
    state = applyOk(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.magic_mirror",
      mode: "basic",
      optionIndex: 2,
      costCardIds: ["stat.power", "stat.power"]
    });

    // Gold grade lists every grade, including the gold Dread Knights.
    const choice = redirectChoice(state);
    expect(choice.candidateUnitIds).toContain("unit_p2_dread_knights");
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_dread_knights"
    });

    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    // The two Power cards were spent paying for the gold grade.
    expect(state.players.p1.discard.filter((id) => id === "stat.power")).toHaveLength(2);
  });

  it("offers only the grades you can pay for (bronze when holding no Power)", () => {
    const state = mirrorSetup(["spell.magic_mirror"]);
    expect(reactionFor(state, "p1", "spell.magic_mirror", 0)).toBeTruthy(); // bronze, free
    expect(reactionFor(state, "p1", "spell.magic_mirror", 1)).toBeFalsy(); // silver needs 1 Power
    expect(reactionFor(state, "p1", "spell.magic_mirror", 2)).toBeFalsy(); // gold needs 2 Power
  });

  it("is offered only to the side whose unit is targeted — never the caster", () => {
    // Both players hold Magic Mirror; p2 casts at p1's griffins.
    const state = mirrorSetup(["spell.magic_mirror"]);
    state.players.p2.hand.push("spell.magic_mirror");
    // The caster (p2) is never offered the redirect, even holding the card.
    expect(reactionFor(state, "p2", "spell.magic_mirror", 0)).toBeFalsy();
    // And the redirect window belongs to the targeted side.
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");
  });

  it("does not trigger when the enemy spell targets the caster's own unit", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_mirror"];
    state.players.p2.hand = ["spell.haste"]; // Haste targets a friendly (p2) unit
    state.activePlayerId = "p2";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.activeUnitId = "unit_p2_skeletons";

    const next = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.haste",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });

    // p1 is never offered Magic Mirror — the spell never targeted a p1 unit.
    if (next.reactionWindow) {
      expect(reactionFor(next, "p1", "spell.magic_mirror", 0)).toBeFalsy();
    }
    expect(next.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(false);
  });

  it("lets the targeted side keep the original target by passing the window", () => {
    let state = mirrorSetup(["spell.magic_mirror"]);
    state = applyOk(state, { type: "PASS_REACTION", playerId: "p1" });
    // Passing resolves the spell on the original unit.
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(false);
  });
});
