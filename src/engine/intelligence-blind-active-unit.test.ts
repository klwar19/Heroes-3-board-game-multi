/**
 * USER REPORT (2026-08-22): "polish balance rule: When cast Blind with
 * 'Intelligence' on a unit - it should not activate - just remove paralysis
 * token and skip activation."
 *
 * ROOT CAUSE (generic, not Balance-Pack specific): the printed Paralysis rule
 * ("if a unit would activate with a Paralysis Token on it, skip its activation
 * and remove the Token") had exactly ONE consumer — `setActiveUnit` — so the
 * token was only ever checked at the instant an activation slot was handed out.
 * The Balance Pack's Intelligence free cast happens in the START-OF-COMBAT
 * window (`combatStartWindowOpen`), which is still open AFTER the first
 * activation slot has been opened — so Blind cast through it landed on the unit
 * whose turn was already running, and that unit moved/attacked with the token
 * on it. The same hole was reachable with the rule OFF (classic Intelligence's
 * combat-long timing freedom), which is why the fix
 * (`enforceParalysisOnOpenActivation`, reducer.ts) is generic and not gated.
 *
 * Every case asserts the OBSERVABLE outcome (did the unit actually get a turn —
 * is it offered a move/attack?), never just "a token exists" (CLAUDE.md #1a),
 * and each is paired with a CONTROL that keeps the setup and removes only the
 * paralysis.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";

import type { CardId, GameAction, GameState, UnitId } from "./state";

const TARGET: UnitId = "unit_p2_skeletons";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Does `unitId` really hold a turn right now (a legal move or attack)? */
function unitCanAct(state: GameState, playerId: "p1" | "p2", unitId: UnitId): boolean {
  return getLegalActions(state, playerId).some(
    (legal) =>
      (legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === unitId) ||
      (legal.action.type === "MOVE_UNIT" && legal.action.unitId === unitId)
  );
}

function hasParalysis(state: GameState, unitId: UnitId): boolean {
  return Boolean(state.combat!.units[unitId].tokens?.some((token) => token.kind === "paralysis"));
}

/**
 * A sandbox combat at its very beginning where the ENEMY unit already holds the
 * open activation slot — exactly what `ensureCombatActivation` produces in a
 * real fight whose fastest unit belongs to the other side. Nobody has acted, so
 * the Balance Pack's start-of-combat Intelligence window is open.
 */
function enemyHoldsTheSlot(seed: string, balance: boolean, hand: string[]): GameState {
  const state = createInitialGameState(seed);
  state.adventure = {
    houseRules: { "polish-card-balance": balance }
  } as unknown as GameState["adventure"];
  state.players.p1.hand = hand as CardId[];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = TARGET;
  state.combat!.units[TARGET].grade = "bronze"; // Blind at Power 0 reaches bronze
  return state;
}

/** Play the Balance-Pack Intelligence (its one-shot start-of-combat free cast). */
function playIntelligence(state: GameState): GameState {
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "ability.intelligence" &&
      legal.action.mode === "basic"
  );
  expect(play, "Intelligence is playable at the start of the combat").toBeTruthy();
  return passAllReactions(applyOk(state, play!.action));
}

/** Cast `cardId` at the enemy unit holding the slot. */
function castAtTarget(state: GameState, cardId: string): GameState {
  const cast = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === TARGET
  );
  expect(cast, `${cardId} is castable on the enemy unit`).toBeTruthy();
  return passAllReactions(applyOk(state, cast!.action));
}

/** The classic (rule OFF) combat-long Intelligence timing freedom. */
function grantClassicFreedom(state: GameState): GameState {
  state.activeEffects.push({
    id: `effect_intelligence_${state.seed}`,
    name: "Intelligence",
    scope: "player",
    controllerId: "p1",
    duration: { type: "combat" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "SPELL_CAST_ANYTIME" }],
    source: { type: "system" },
    startedRound: state.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  });
  return state;
}

describe("Blind cast through Intelligence onto the unit already holding the activation slot", () => {
  it("REPRO/FIX: the paralysed unit does NOT act — the token is removed and the activation is skipped", () => {
    let state = enemyHoldsTheSlot("int-blind-fix", true, ["ability.intelligence", "spell.blind"]);
    state = playIntelligence(state);
    // The free cast happens while the enemy unit still holds an untouched slot.
    expect(state.combat!.activeUnitId, "the enemy unit holds the open activation").toBe(TARGET);
    expect(state.combat!.units[TARGET].activatedThisRound).toBe(false);

    state = castAtTarget(state, "spell.blind");

    const target = state.combat!.units[TARGET];
    expect(hasParalysis(state, TARGET), "the token was consumed by the skip").toBe(false);
    expect(target.activatedThisRound, "its activation was skipped").toBe(true);
    expect(target.movedThisActivation, "it never moved").toBe(false);
    expect(target.attackedThisActivation, "it never attacked").toBeFalsy();
    expect(state.combat!.activeUnitId, "the slot moved on to another unit").not.toBe(TARGET);
    expect(unitCanAct(state, "p2", TARGET), "a skipped unit is offered no move/attack").toBe(false);
  });

  it("CONTROL: the same Intelligence cast of a NON-paralysis Spell leaves the unit's turn intact", () => {
    let state = enemyHoldsTheSlot("int-arrow-control", true, ["ability.intelligence", "spell.magic_arrow"]);
    state = playIntelligence(state);
    const damageBefore = state.combat!.units[TARGET].damage;
    state = castAtTarget(state, "spell.magic_arrow");

    const target = state.combat!.units[TARGET];
    expect(target.damage, "Magic Arrow really resolved (it dealt damage)").toBeGreaterThan(damageBefore);
    expect(target.activatedThisRound, "no paralysis, no skip").toBe(false);
    expect(state.combat!.activeUnitId, "it still holds the slot").toBe(TARGET);
    expect(unitCanAct(state, "p2", TARGET), "it still gets its turn").toBe(true);
  });

  it("CONTROL: with nothing cast at all the enemy unit simply takes its turn", () => {
    let state = enemyHoldsTheSlot("int-none-control", true, ["ability.intelligence"]);
    state = playIntelligence(state);
    expect(state.combat!.activeUnitId).toBe(TARGET);
    expect(unitCanAct(state, "p2", TARGET)).toBe(true);
  });

  it("the POLISH SPELL BOOK free cast behaves identically (the fix is source-independent)", () => {
    let state = enemyHoldsTheSlot("int-blind-book", true, ["ability.intelligence"]);
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "polish-spell-book": true };
    state.players.p1.spellBook = ["spell.blind"] as CardId[];
    state.players.p1.spellBookUsed = [];
    state = playIntelligence(state);

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.blind" &&
        legal.action.fromSpellBook === true &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === TARGET
    );
    expect(cast, "the Book Blind is castable through the Intelligence free cast").toBeTruthy();
    state = passAllReactions(applyOk(state, cast!.action));

    expect(hasParalysis(state, TARGET)).toBe(false);
    expect(state.combat!.units[TARGET].activatedThisRound, "the activation was skipped").toBe(true);
    expect(unitCanAct(state, "p2", TARGET)).toBe(false);
  });

  it("the hole was GENERIC: the same Blind through CLASSIC (rule OFF) Intelligence skips too", () => {
    let state = grantClassicFreedom(enemyHoldsTheSlot("int-blind-classic", false, ["spell.blind"]));
    state = castAtTarget(state, "spell.blind");

    expect(hasParalysis(state, TARGET)).toBe(false);
    expect(state.combat!.units[TARGET].activatedThisRound, "the activation was skipped").toBe(true);
    expect(unitCanAct(state, "p2", TARGET)).toBe(false);
  });

  it("SCOPE CONTROL: a unit that has ALREADY begun acting keeps its turn — its token waits for the next activation", () => {
    let state = grantClassicFreedom(enemyHoldsTheSlot("int-blind-midturn", false, ["spell.blind"]));
    // The activation has started (this is the Medusa-retaliation shape: the
    // paralysis arrives after the unit began acting).
    state.combat!.units[TARGET].movedThisActivation = true;
    state = castAtTarget(state, "spell.blind");

    expect(hasParalysis(state, TARGET), "the token stays for the NEXT activation").toBe(true);
    expect(state.combat!.units[TARGET].activatedThisRound, "the running activation is not cancelled").toBe(false);
    expect(state.combat!.activeUnitId, "it keeps the slot").toBe(TARGET);
  });

});
