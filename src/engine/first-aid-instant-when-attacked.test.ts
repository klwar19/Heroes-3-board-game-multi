import { describe, expect, it } from "vitest";
import { healFxPlans } from "@/data/fx";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { applyPermanentCombatEffects } from "./permanents";
import type { GameAction, GameState } from "./state";

/**
 * The First Aid Tent heal as an INSTANT used the moment your unit is attacked —
 * resolved BEFORE the incoming attack's damage is calculated, so mending an
 * existing wound can let the unit survive a blow that would otherwise defeat it.
 *
 * Every assertion fails if the heal-when-attacked wiring is removed (CLAUDE.md
 * #1): the reaction window that opens on the attack, the heal offered in it, the
 * heal landing before damage, and the attack then resolving on the healed unit.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** p2's Skeletons stand adjacent to p1's wounded Crusaders and are set to attack. */
function attackOnWoundedFriendly(): GameState {
  const state = createInitialGameState("first-aid-instant");
  state.players.p1.hand = [];
  state.players.p2.hand = [];

  // p1 fields a First Aid Tent (seed its in-combat heal effect).
  state.players.p1.permanents = ["war_machine.first_aid_tent"];
  applyPermanentCombatEffects(state);

  const units = state.combat!.units;
  // The target: a Crusaders stack already carrying 2 damage, 6 max health.
  const target = units.unit_p1_crusaders;
  target.maxHealth = 6;
  target.damage = 2;
  target.position = 14;
  // The attacker: p2 Skeletons adjacent (positions 13 & 14 are neighbours).
  const attacker = units.unit_p2_skeletons;
  attacker.position = 13;
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;

  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  return state;
}

describe("First Aid Tent — instant heal when attacked (before damage calculation)", () => {
  it("opens a reaction window on the attack and offers the defender the Tent heal", () => {
    const state = attackOnWoundedFriendly();
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });

    // The attack PAUSED before resolving: the damage has not landed yet.
    expect(declared.reactionWindow, "the declared attack opened a reaction window").toBeTruthy();
    expect(declared.combat!.units.unit_p1_crusaders.damage, "no attack damage applied yet").toBe(2);

    // The attacked unit's controller (p1) is offered the First Aid Tent heal.
    const heal = getLegalActions(declared, "p1").find(
      (legal) =>
        legal.action.type === "USE_ACTIVE_EFFECT" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === "unit_p1_crusaders"
    );
    expect(heal, "p1 may heal in response to the attack").toBeTruthy();
  });

  it("heals BEFORE the hit, so the Crusaders survive a blow that would otherwise kill them", () => {
    const state = attackOnWoundedFriendly();
    // Make the incoming hit deal exactly 4: 2 (existing) + 4 = 6 = lethal without
    // a heal; 1 (after healing) + 4 = 5 < 6 survives. Skeletons attack 4 vs a
    // defenceless target, with a scripted +0 Attack die — a flat 4 damage.
    state.combat!.units.unit_p2_skeletons.attack = 4;
    state.combat!.units.unit_p1_crusaders.defense = 0;
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });

    const heal = getLegalActions(declared, "p1").find((legal) => legal.action.type === "USE_ACTIVE_EFFECT");
    expect(heal).toBeTruthy();
    const healed = applyOk(declared, heal!.action);

    const visualEvent = healed.eventLog.find(
      (event) =>
        event.type === "DAMAGE_HEALED" &&
        event.source.type === "card" &&
        event.source.cardId === "war_machine.first_aid_tent"
    );
    expect(visualEvent, "the instant heal must carry the Tent card source used by the FX layer").toBeTruthy();
    expect(healFxPlans["war_machine.first_aid_tent"]?.affect?.length).toBeGreaterThan(0);

    // The wound was mended first (2 -> 1); the attack then lands its 4. The unit
    // ends at 5/6 damage — alive — instead of dying to 6/6.
    const crusaders = healed.combat!.units.unit_p1_crusaders;
    expect(crusaders.damage).toBe(5);
    expect(crusaders.damage).toBeLessThan(crusaders.maxHealth);
  });

  it("is optional — passing the window takes the full hit, with no heal spent", () => {
    const state = attackOnWoundedFriendly();
    state.combat!.units.unit_p1_crusaders.maxHealth = 8; // non-lethal margin, no pack flip
    state.combat!.units.unit_p2_skeletons.attack = 4;
    state.combat!.units.unit_p1_crusaders.defense = 0;
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });

    // Decline the heal: the full 4 lands on top of the existing 2 → 6 damage.
    const passed = applyOk(declared, { type: "PASS_REACTION", playerId: "p1" });
    expect(passed.reactionWindow ?? null, "the window closed and the attack resolved").toBeNull();
    expect(passed.combat!.units.unit_p1_crusaders.damage).toBe(6);
    // No First Aid heal was consumed this round (the Tent is still available).
    const tent = passed.activeEffects.find((effect) => effect.name === "First Aid Tent");
    expect(tent?.healRound ?? null).toBeNull();
  });
});
