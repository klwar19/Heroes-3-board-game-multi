import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Engine tests for the Fire Shield spell (Expert Fire). It is an Ongoing buff:
 * while it stands, any ADJACENT (melee) attacker that strikes the shielded unit
 * takes 1/2/3 flat damage by Power (0/2/4). A non-adjacent (ranged) attacker is
 * never burned — the wiki reads "attacked by an adjacent unit".
 *
 * The burn fires a "fire-shield" ability event on the attacker so the table can
 * flare the burn over it (its own SFX + animation, distinct from the cast
 * shimmer). Every assertion below fails if its wiring is removed.
 */

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

/** Push a Fire Shield active effect (amount) onto a unit, bypassing the cast. */
function pushFireShield(state: GameState, unitId: UnitId, amount: number): void {
  state.activeEffects.push({
    id: `fireshield_${unitId}`,
    name: "Fire Shield",
    scope: "unit",
    duration: { type: "current-combat-round" },
    polarity: "positive",
    removable: true,
    modifiers: [{ type: "FIRE_SHIELD", amount }],
    source: { type: "system" },
    controllerId: state.combat!.units[unitId].controllerId,
    target: { type: "unit", unitId },
    startedRound: state.round,
    startedCombatRound: state.combat!.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  });
}

function fireShieldBurnEvents(state: GameState, attackerId: UnitId) {
  return state.eventLog.filter(
    (event) =>
      event.type === "UNIT_ABILITY_TRIGGERED" &&
      event.abilityId === "fire-shield" &&
      event.targetUnitId === attackerId
  );
}

function burnDamageEvents(state: GameState, attackerId: UnitId) {
  return state.eventLog.filter(
    (event) =>
      event.type === "DAMAGE_ASSIGNED" &&
      event.target.type === "unit" &&
      event.target.unitId === attackerId &&
      event.damageKind === "effect"
  );
}

describe("Fire Shield spell — casting it raises the shield", () => {
  function castOnFriendlyAt(power: number): number {
    const state = createInitialGameState(`fireshield-cast-${power}`);
    state.players.p1.hand = ["spell.fire_shield", "stat.power", "stat.power", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.fire_shield" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_griffins"
    );
    expect(cast, "Fire Shield should be castable on a friendly unit").toBeTruthy();
    const casted = applyOk(state, cast!.action);
    casted.stack[0]!.modifiers.spellPowerBonus = power;
    const result = passAllReactions(casted);

    let total = 0;
    for (const effect of result.activeEffects) {
      if (effect.target?.type === "unit" && effect.target.unitId === "unit_p1_griffins") {
        for (const modifier of effect.modifiers) {
          if (modifier.type === "FIRE_SHIELD") {
            total += modifier.amount;
          }
        }
      }
    }
    return total;
  }

  it("scales the shield 1 / 2 / 3 at Power 0 / 2 / 4", () => {
    expect(castOnFriendlyAt(0)).toBe(1);
    expect(castOnFriendlyAt(2)).toBe(2);
    expect(castOnFriendlyAt(4)).toBe(3);
  });
});

describe("Fire Shield spell — burning the attacker", () => {
  function meleeAttackScene(seed: string, shieldAmount: number): GameState {
    const state = createInitialGameState(seed);
    state.combat!.obstacles = [];
    const attacker = state.combat!.units.unit_p1_crusaders;
    const defender = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    defender.abilities = [];
    attacker.position = 9;
    defender.position = 13; // vertically adjacent → a melee attack
    attacker.maxHealth = 40;
    attacker.damage = 0;
    defender.maxHealth = 40;
    pushFireShield(state, "unit_p2_skeletons", shieldAmount);
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.combat!.units.unit_p1_crusaders.activatedThisRound = false;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return state;
  }

  it("burns an adjacent melee attacker and fires the fire-shield burn event", () => {
    const state = meleeAttackScene("fireshield-burn", 2);
    const attacked = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
    const result = passAllReactions(attacked);

    // The shield's 2 damage lands on the attacker as "effect" damage.
    const burns = burnDamageEvents(result, "unit_p1_crusaders");
    expect(burns.length).toBe(1);
    expect(burns[0]).toMatchObject({ amount: 2 });
    expect(result.combat!.units.unit_p1_crusaders.damage).toBeGreaterThanOrEqual(2);

    // …and the table cue: a "fire-shield" ability event anchored on the attacker.
    expect(fireShieldBurnEvents(result, "unit_p1_crusaders").length).toBe(1);

    // The cue MUST be logged before the burn's damage — the contract the table
    // relies on to play the flare (SFX + animation) before the damage lands.
    const cueIndex = result.eventLog.findIndex(
      (event) =>
        event.type === "UNIT_ABILITY_TRIGGERED" &&
        event.abilityId === "fire-shield" &&
        event.targetUnitId === "unit_p1_crusaders"
    );
    const burnIndex = result.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p1_crusaders" &&
        event.damageKind === "effect"
    );
    expect(cueIndex).toBeGreaterThanOrEqual(0);
    expect(burnIndex).toBeGreaterThan(cueIndex);
  });

  it("does NOT burn a non-adjacent ranged attacker (an adjacent unit only)", () => {
    const state = createInitialGameState("fireshield-ranged");
    state.combat!.obstacles = [];
    const shooter = state.combat!.units.unit_p1_marksmen; // ranged
    const defender = state.combat!.units.unit_p2_skeletons;
    shooter.abilities = [];
    defender.abilities = [];
    shooter.position = 1;
    defender.position = 13; // far away → a ranged shot, not adjacent
    shooter.maxHealth = 40;
    shooter.damage = 0;
    pushFireShield(state, "unit_p2_skeletons", 2);
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p1_marksmen.activatedThisRound = false;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    const attacked = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    const result = passAllReactions(attacked);

    expect(burnDamageEvents(result, "unit_p1_marksmen").length).toBe(0);
    expect(fireShieldBurnEvents(result, "unit_p1_marksmen").length).toBe(0);
    expect(result.combat!.units.unit_p1_marksmen.damage).toBe(0);
  });

  it("burn scales with the shield amount (1 burns 1)", () => {
    const state = meleeAttackScene("fireshield-burn-1", 1);
    const attacked = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
    const result = passAllReactions(attacked);
    const burns = burnDamageEvents(result, "unit_p1_crusaders");
    expect(burns.length).toBe(1);
    expect(burns[0]).toMatchObject({ amount: 1 });
  });
});
