/**
 * Stretch Goals 2026 neutrals (cards 099 / 101):
 *  - Clockwork Dwarves "Steam Burst": after its own attack, 1 damage to every
 *    adjacent ENEMY (the struck target included), then all damage is removed
 *    from the Dwarves.
 *  - Mermaids "Siren Song": every enemy Retaliation Attack has -1 Attack per
 *    living carrier, wherever it stands.
 * Each rule is asserted against a CONTROL board without the ability.
 */
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createInitialGameState, type CombatUnitState, type GameAction, type GameState } from "./index";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  for (let safety = 0; safety < 80; safety += 1) {
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
        candidateIndex: choice.candidates.length - 1,
      });
      continue;
    }
    break;
  }
  return current;
}

/** Legacy 4x5 sandbox with every unit knocked out (parked on cell 0) until placed. */
function fresh(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  for (const unit of Object.values(state.combat!.units)) {
    Object.assign(unit, { abilities: [], attack: 0, defense: 0, maxHealth: 80, damage: 80, position: 0, type: "ground" });
  }
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => 0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function place(state: GameState, id: string, values: Partial<CombatUnitState>): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, { damage: 0, maxHealth: 80, retaliatedThisRound: false, ...values });
  return unit;
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const unit = state.combat!.units[attackerId];
  Object.assign(unit, { attackedThisActivation: false, attacksThisActivation: 0, activatedThisRound: false });
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attackerId;
  state.phase = "combat";
  return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId, defenderId }));
}

describe("Clockwork Dwarves — Steam Burst", () => {
  it("is printed on the neutral card", () => {
    expect(coreUnitDefinitions["neutral.clockwork_dwarves"]?.neutral?.abilities).toEqual(["clockwork-dwarves-steam-burst"]);
  });

  // Dwarves (p1 crusaders) at 9; the target (skeletons) below at 13; another
  // enemy (vampires) beside at 8; a friend (marksmen) beside at 10; a far enemy
  // (dread knights) at 19. Defense 20 keeps the Retaliation from adding damage.
  function burst(seed: string, abilities: string[]): GameState {
    const state = fresh(seed);
    place(state, "unit_p1_crusaders", { position: 9, attack: 3, defense: 20, damage: 5, abilities });
    place(state, "unit_p1_marksmen", { position: 10 });
    place(state, "unit_p2_skeletons", { position: 13 });
    place(state, "unit_p2_vampires", { position: 8 });
    place(state, "unit_p2_dread_knights", { position: 19 });
    return attack(state, "unit_p1_crusaders", "unit_p2_skeletons");
  }

  it("deals 1 to every adjacent enemy (target included) and removes all its own damage (CONTROL: no ability)", () => {
    const after = burst("cw-burst", ["clockwork-dwarves-steam-burst"]);
    const control = burst("cw-burst-control", []);
    const units = after.combat!.units;
    const ctl = control.combat!.units;
    expect(ctl.unit_p2_skeletons.damage, "control: the attack itself").toBe(3);
    expect(units.unit_p2_skeletons.damage, "the struck target takes the burst too").toBe(4);
    expect(units.unit_p2_vampires.damage, "adjacent enemy").toBe(1);
    expect(ctl.unit_p2_vampires.damage).toBe(0);
    expect(units.unit_p1_marksmen.damage, "adjacent friend is spared").toBe(0);
    expect(units.unit_p2_dread_knights.damage, "non-adjacent enemy is spared").toBe(0);
    expect(units.unit_p1_crusaders.damage, "self-repair").toBe(0);
    expect(ctl.unit_p1_crusaders.damage, "control keeps its damage").toBe(5);
    expect(
      after.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "clockwork-dwarves-steam-burst-repair")
    ).toBe(true);
  });
});

describe("Mermaids — Siren Song", () => {
  it("is printed on the neutral card", () => {
    expect(coreUnitDefinitions["neutral.mermaids"]?.neutral?.abilities).toEqual(["mermaids-siren-song"]);
  });

  // p1 crusaders (9) strike p2 skeletons (13, Attack 5), which retaliate on a 0
  // die. `carriers` p1 units elsewhere on the board carry Siren Song.
  function exchange(seed: string, carriers: string[]): GameState {
    const state = fresh(seed);
    place(state, "unit_p1_crusaders", { position: 9, attack: 4, defense: 0 });
    place(state, "unit_p2_skeletons", { position: 13, attack: 5, defense: 0 });
    const spots = [3, 0];
    carriers.forEach((id, index) => place(state, id, { position: spots[index], abilities: ["mermaids-siren-song"] }));
    return attack(state, "unit_p1_crusaders", "unit_p2_skeletons");
  }

  it("each living enemy carrier takes 1 Attack off the Retaliation, never off the attack (CONTROL: none)", () => {
    const control = exchange("mm-control", []);
    const one = exchange("mm-one", ["unit_p1_marksmen"]);
    const two = exchange("mm-two", ["unit_p1_marksmen", "unit_p1_griffins"]);
    expect(control.combat!.units.unit_p1_crusaders.damage, "control Retaliation").toBe(5);
    expect(one.combat!.units.unit_p1_crusaders.damage, "one carrier: -1").toBe(4);
    expect(two.combat!.units.unit_p1_crusaders.damage, "two carriers stack").toBe(3);
    // The carrier's own side's attack is untouched.
    expect(one.combat!.units.unit_p2_skeletons.damage).toBe(control.combat!.units.unit_p2_skeletons.damage);
    expect(
      one.eventLog.filter((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "mermaids-siren-song")
    ).toHaveLength(1);
  });

  it("a FALLEN carrier and an ALLIED retaliator are unaffected", () => {
    const state = fresh("mm-dead");
    place(state, "unit_p1_crusaders", { position: 9, attack: 4, defense: 0 });
    place(state, "unit_p2_skeletons", { position: 13, attack: 5, defense: 0 });
    // Dead p1 carrier (fresh() leaves it at full damage) and a LIVING p2 carrier:
    // the p2 Mermaids never sap their own side's Retaliation.
    state.combat!.units.unit_p1_marksmen.abilities = ["mermaids-siren-song"];
    place(state, "unit_p2_vampires", { position: 19, abilities: ["mermaids-siren-song"] });
    const after = attack(state, "unit_p1_crusaders", "unit_p2_skeletons");
    expect(after.combat!.units.unit_p1_crusaders.damage).toBe(5);
  });
});
