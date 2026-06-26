import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getLegalReactionsForTrigger, getPendingReactionPower } from "./legal-actions";
import { makeActiveEffect } from "./active-effects";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * The live Power readout the defender reads (getPendingReactionPower) and the
 * Resistance offer gate (CANCEL_SPELL maxPower) must agree with the Power the
 * spell finally RESOLVES at. Both share resolvedSpellPowerForStackItem, the same
 * formula the cast uses (getCurrentSpellPower delegates to it).
 *
 * Regression: the readout/gate previously summed only the stack-item modifier
 * terms and DROPPED the Elemental-Orb doubling, so an Air-Orb Lightning Bolt
 * fuelled to Power 1 was shown — and Resisted — as "Power 1" while it actually
 * resolved at Power 2. Each assertion fails if the doubling is dropped again.
 */
function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findCast(state: GameState, cardId: string, unitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

/**
 * p1 casts an Air Lightning Bolt (printed Power 0) at p2's skeletons with two
 * spare Power statistics keeping the Empower window open, then Power 1 is staged
 * onto the stack. p2 holds Resistance (basic: ignores a spell of Power ≤ 1).
 * Optionally an Air Elemental Orb (doubles Air-spell Power) is in play.
 */
function castWithOpenWindow(seed: string, withOrb: boolean, paidPower = 1): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["spell.lightning_bolt", "stat.power", "stat.power"];
  state.players.p2.hand = ["ability.resistance"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.combat!.units.unit_p2_skeletons.maxHealth = 30;
  state.combat!.units.unit_p2_skeletons.damage = 0;

  if (withOrb) {
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Orb of the Firmament",
          scope: "player",
          duration: { type: "combat" },
          modifiers: [{ type: "SPELL_POWER_DOUBLE", school: "air" }]
        },
        { type: "card", cardId: "artifact.orb_of_the_firmament", controllerId: "p1" },
        "p1"
      )
    );
  }

  const cast = findCast(state, "spell.lightning_bolt", "unit_p2_skeletons");
  expect(cast, "Lightning Bolt should be a legal cast").toBeTruthy();
  const casted = applyOk(state, cast!.action);
  // Stage the paid Power onto the open cast (mirrors paying Power statistics).
  casted.stack[0]!.modifiers.spellPowerBonus = paidPower;
  return casted;
}

function p2OfferedResistance(state: GameState): boolean {
  const reactions = getLegalReactionsForTrigger(state, state.reactionWindow!.triggerEvent, cardLibrary);
  return (reactions.p2 ?? []).some(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "ability.resistance" &&
      legal.action.mode !== "expert"
  );
}

describe("spell-power preview/gate agrees with the resolved cast", () => {
  it("the live readout reflects Elemental-Orb doubling (Power 1 → 2)", () => {
    expect(getPendingReactionPower(castWithOpenWindow("orb-readout", true))?.totalPower).toBe(2);
  });

  it("control: with no Orb the same fuelled cast reads Power 1", () => {
    expect(getPendingReactionPower(castWithOpenWindow("no-orb-readout", false))?.totalPower).toBe(1);
  });

  it("the Orb MULTIPLIES (not +1s): a Power-2 cast reads Power 4, not 3", () => {
    // (0 + 2) × 2 = 4. A multiplier silently replaced by "+1" would read 3, so
    // this distinguishes true doubling from a mere additive bonus.
    expect(getPendingReactionPower(castWithOpenWindow("orb-double-high", true, 2))?.totalPower).toBe(4);
    // Same fuelled cast with no Orb stays at the paid Power 2.
    expect(getPendingReactionPower(castWithOpenWindow("no-orb-high", false, 2))?.totalPower).toBe(2);
  });

  it("basic Resistance is NOT offered against the Orb-doubled Power-2 cast", () => {
    // Resolved Power 2 > Resistance's maxPower 1 → the gate must withhold it.
    expect(p2OfferedResistance(castWithOpenWindow("orb-gate", true))).toBe(false);
  });

  it("control: basic Resistance IS offered against the same cast at Power 1 (no Orb)", () => {
    expect(p2OfferedResistance(castWithOpenWindow("no-orb-gate", false))).toBe(true);
  });
});
