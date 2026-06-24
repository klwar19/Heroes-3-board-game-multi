import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import { cardLibrary } from "@/data/cards/library";
import { cardShotFxPlans } from "@/data/fx";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** PLAY_CARD legal actions for Ballistics (optionally one option / target). */
function ballisticsPlays(state: GameState, playerId: PlayerId, optionIndex?: number) {
  return getLegalActions(state, playerId).filter(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "ability.ballistics" &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex)
  );
}

/** A sandbox combat with Ballistics in p1's hand and the means to pay for it. */
function combatReady(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["ability.ballistics"];
  state.players.p2.hand = [];
  state.players.p1.resources.buildingMaterials = 1;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  return state;
}

// ===========================================================================
// Card definition — the truth about what runs (CLAUDE.md rule #2)
// ===========================================================================

describe("Ballistics card definition (house-rule buff)", () => {
  it("is a CHOOSE_ONE: two BASIC demolish sides + the expert bombardment", () => {
    const card = cardLibrary["ability.ballistics"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") {
      return;
    }
    expect(card.effect.options).toHaveLength(3);

    // Option 0: destroy a Wall or the Gate — basic.
    const wallGate = card.effect.options[0];
    expect(wallGate.expertOnly).toBeFalsy();
    expect(wallGate.effect.type).toBe("SIEGE_DEMOLISH");
    if (wallGate.effect.type === "SIEGE_DEMOLISH") {
      expect(wallGate.effect.target).toBe("wall-or-gate");
    }

    // Option 1: destroy the Arrow Tower — now a BASIC side (was expert).
    const arrowTower = card.effect.options[1];
    expect(arrowTower.expertOnly).toBeFalsy();
    expect(arrowTower.effect.type).toBe("SIEGE_DEMOLISH");
    if (arrowTower.effect.type === "SIEGE_DEMOLISH") {
      expect(arrowTower.effect.target).toBe("arrow-tower");
    }

    // Option 2: the new expert bombardment — crown + 1 building material.
    const bombard = card.effect.options[2];
    expect(bombard.expertOnly).toBe(true);
    expect(bombard.cost?.resources?.buildingMaterials).toBe(1);
    expect(bombard.target?.type).toBe("enemy-unit");
    expect(bombard.effect.type).toBe("BALLISTICS_BOMBARD");
    if (bombard.effect.type === "BALLISTICS_BOMBARD") {
      expect(bombard.effect.amount).toBe(1);
    }
  });

  it("is reachable in real games — included in the ability decks", () => {
    expect(abilityDeckLegacy).toContain("ability.ballistics");
    expect(abilityDeckBinh).toContain("ability.ballistics");
  });
});

// ===========================================================================
// Expert bombardment — pay 1 material to deal 1 damage to 2 adjacent units
// ===========================================================================

describe("Ballistics expert — bombard 2 adjacent units", () => {
  it("hits the primary enemy and a chosen adjacent enemy, spending 1 material and a crown", () => {
    const state = combatReady("ballistics-bombard");

    // Vampires (pos 14) sit between Skeletons (13) and Dread Knights (18) — both
    // orthogonally adjacent, both enemies of p1.
    const expert = ballisticsPlays(state, "p1", 2).find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    expect(expert, "the expert bombardment should target an enemy unit").toBeTruthy();
    expect(expert!.action.type === "PLAY_CARD" && expert!.action.mode).toBe("expert");

    const afterPlay = applyOk(state, expert!.action);
    // Primary took 1 damage.
    expect(afterPlay.combat!.units.unit_p2_vampires.damage).toBe(1);
    // The splash choice opened for an adjacent enemy.
    const choice = afterPlay.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(choice?.type === "ABILITY_TARGET_CHOICE" && choice.kind).toBe("ballistics-splash");
    expect(
      choice?.type === "ABILITY_TARGET_CHOICE" ? [...choice.candidateUnitIds].sort() : []
    ).toEqual(["unit_p2_dread_knights", "unit_p2_skeletons"]);

    const splash = applyOk(afterPlay, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      targetUnitId: "unit_p2_skeletons"
    });

    // The adjacent enemy took the same 1 damage; the non-picked one is untouched.
    expect(splash.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(splash.combat!.units.unit_p2_dread_knights.damage).toBe(0);
    // Paid 1 building material AND spent one crown (expert side).
    expect(splash.players.p1.resources.buildingMaterials).toBe(0);
    expect(splash.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    // The card is spent.
    expect(splash.players.p1.discard).toContain("ability.ballistics");
  });

  it("the splash is optional — skipping leaves only the primary hit", () => {
    const state = combatReady("ballistics-skip");
    const expert = ballisticsPlays(state, "p1", 2).find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    )!;
    const afterPlay = applyOk(state, expert.action);
    const choice = afterPlay.pendingChoice!;
    const skipped = applyOk(afterPlay, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "skip"
    });
    expect(skipped.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(skipped.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(skipped.combat!.units.unit_p2_dread_knights.damage).toBe(0);
    // Material/crown still paid even when the splash is skipped.
    expect(skipped.players.p1.resources.buildingMaterials).toBe(0);
  });

  it("no splash candidates: a lone, isolated enemy is bombarded once with no choice", () => {
    const state = combatReady("ballistics-lone");
    // Move both other enemies far away so nothing is adjacent to the vampires.
    state.combat!.units.unit_p2_skeletons.position = 0;
    state.combat!.units.unit_p2_dread_knights.position = 3;
    const expert = ballisticsPlays(state, "p1", 2).find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    )!;
    const after = applyOk(state, expert.action);
    expect(after.combat!.units.unit_p2_vampires.damage).toBe(1);
    // No adjacent enemy -> no splash choice opened.
    expect(after.pendingChoice).toBeNull();
  });

  it("fires the Catapult report from the card, so the FX layer plays the shot", () => {
    // The table plays the bombard shot off cardShotFxPlans[source.cardId] on the
    // card-sourced DAMAGE_ASSIGNED it logs. Assert both halves of that link: the
    // damage names the card as its source, AND a shot plan is keyed there.
    const state = combatReady("ballistics-sound");
    const expert = ballisticsPlays(state, "p1", 2).find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    )!;
    const after = applyOk(state, expert.action);
    const hit = after.eventLog.find(
      (event): event is Extract<GameEvent, { type: "DAMAGE_ASSIGNED" }> =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "card" &&
        event.source.cardId === "ability.ballistics"
    );
    expect(hit, "Ballistics damage must name the card as its source").toBeTruthy();
    const plan = hit!.source.type === "card" ? cardShotFxPlans[hit!.source.cardId] : undefined;
    expect(plan, "cardShotFxPlans must answer the Ballistics damage").toBeTruthy();
    expect(plan!.sound).toBe("units/catapult-shoot");
  });

  it("is NOT offered without a building material to pay (the crown alone is not enough)", () => {
    const state = combatReady("ballistics-no-material");
    state.players.p1.resources.buildingMaterials = 0;
    expect(ballisticsPlays(state, "p1", 2)).toHaveLength(0);
  });

  it("is NOT offered without an available crown (expert use)", () => {
    const state = combatReady("ballistics-no-crown");
    state.players.p1.limits.expertUses = 0;
    expect(ballisticsPlays(state, "p1", 2)).toHaveLength(0);
  });
});
