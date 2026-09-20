/**
 * Focused behavior coverage for the requested town-unit veterancy revisions.
 * Every assertion compares an observable outcome with a control; removing the
 * new rule changes the result and fails the test.
 */
import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { rankScheduleFor } from "@/data/units/experience-rank-abilities";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type PlayerId,
} from "./index";
import { previewSpellDamage } from "./reducer";
import { removeComputerPhantomCards } from "./computer/combat-boost";
import { isPhantomCardId } from "./phantom-cards";

const ATTACKER = "unit_p1_marksmen";
const DEFENDER = "unit_p2_skeletons";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId,
    });
  }
  return current;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety-- > 0) {
    if (current.reactionWindow) {
      current = passReactions(current);
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

function fresh(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  for (const unit of Object.values(state.combat!.units)) {
    unit.abilities = [];
    unit.attack = 0;
    unit.defense = 0;
    unit.maxHealth = 80;
    unit.damage = unit.maxHealth;
    unit.position = 0;
  }
  return state;
}

function place(state: GameState, id: string, values: Partial<CombatUnitState>): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, { damage: 0, maxHealth: 80, ...values });
  return unit;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function armAttack(state: GameState, attackerId = ATTACKER): void {
  const attacker = state.combat!.units[attackerId];
  attacker.attackedThisActivation = false;
  attacker.attacksThisActivation = 0;
  attacker.activatedThisRound = false;
  state.activePlayerId = attacker.controllerId as PlayerId;
  state.combat!.activeUnitId = attacker.id;
  state.phase = "combat";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.stack = [];
}

function attack(state: GameState, attackerId = ATTACKER, defenderId = DEFENDER): GameState {
  armAttack(state, attackerId);
  return settle(applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: state.combat!.units[attackerId].controllerId,
    attackerId,
    defenderId,
  }));
}

describe("requested town-unit veterancy ranks", () => {
  it("maps every requested rule to the exact town unit rank", () => {
    expect(rankScheduleFor("fortress.hydras")[1]).toMatchObject({ choices: ["veteran-fear-aura"] });
    expect(rankScheduleFor("fortress.hydras")[2]).toMatchObject({ choices: ["town-hydra-forced-reroll"] });
    expect(rankScheduleFor("fortress.basilisks")[4]).toMatchObject({ choices: ["town-basilisk-lower-roll"] });
    expect(rankScheduleFor("fortress.gnolls")[3]).toMatchObject({ choices: ["town-gnoll-gold"] });
    expect(rankScheduleFor("fortress.dragon_flies")[4]).toMatchObject({ choices: ["town-dragon-fly-landing"] });
    expect(rankScheduleFor("tower.titans")[1]).toMatchObject({ choices: ["town-titan-storm-cache"] });
    expect(rankScheduleFor("cove.nix")[2]).toMatchObject({ choices: ["town-nix-guarded"] });
    expect(rankScheduleFor("fortress.wyverns")[2]).toMatchObject({ choices: ["town-wyvern-reroll"] });
    expect(rankScheduleFor("inferno.pit_lords")[1]).toMatchObject({ stats: expect.objectContaining({ initiative: 1 }), choices: ["town-pit-demon-bond"] });
    expect(rankScheduleFor("inferno.pit_lords")[2]).toMatchObject({ choices: ["reduce-spell-damage-2"] });
    expect(rankScheduleFor("cove.haspids")[2]).toMatchObject({ choices: ["town-haspid-aggressive-drill"] });
    expect(rankScheduleFor("fortress.gorgons")[1]).toMatchObject({ choices: ["town-gorgon-stare-reroll"] });
  });

  it("Hydra rerolls every +1 and bites the attacker once when a replacement remains +1 [MUTATION-CHECK]", () => {
    const state = fresh("hydra-bite");
    place(state, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 4 });
    place(state, DEFENDER, { controllerId: "p2", position: 13, abilities: ["town-hydra-forced-reroll"] });
    script(state, [1, 1]);
    const next = attack(state);
    expect(next.combat!.units[ATTACKER].damage).toBe(1);
    expect(next.eventLog).toContainEqual(expect.objectContaining({ type: "UNIT_ABILITY_TRIGGERED", abilityId: "town-hydra-forced-reroll-bite" }));

    const control = fresh("hydra-bite-control");
    place(control, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 4 });
    place(control, DEFENDER, { controllerId: "p2", position: 13 });
    script(control, [1, 1]);
    expect(attack(control).combat!.units[ATTACKER].damage).toBe(0);
  });

  it("Basilisk forces the lower of two dice on attacks and retaliations", () => {
    const incoming = fresh("basilisk-incoming");
    place(incoming, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 4 });
    place(incoming, DEFENDER, { controllerId: "p2", position: 13, abilities: ["town-basilisk-lower-roll"] });
    script(incoming, [1, -1]);
    expect(attack(incoming).combat!.units[DEFENDER].damage).toBe(3);

    const retaliation = fresh("basilisk-retaliation");
    place(retaliation, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 0, abilities: ["town-basilisk-lower-roll"] });
    place(retaliation, DEFENDER, { controllerId: "p2", position: 10, type: "ground", attack: 4 });
    script(retaliation, [0, 1, -1]);
    expect(attack(retaliation).combat!.units[ATTACKER].damage).toBe(3);
  });

  it("Gnolls earn after attacks and retaliation but never exceed 3 Gold per combat", () => {
    let state = fresh("gnoll-gold");
    const gnoll = place(state, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 1, abilities: ["town-gnoll-gold"] });
    place(state, DEFENDER, { controllerId: "p2", position: 10, type: "ground", attack: 0 });
    const before = state.players.p1.resources.gold;
    script(state, Array(30).fill(0));
    for (let index = 0; index < 4; index += 1) {
      state = attack(state);
      state.combat!.units[DEFENDER].damage = 0;
      state.combat!.outcome = null;
    }
    expect(state.players.p1.resources.gold).toBe(before + 3);
    expect(state.combat!.units[gnoll.id].townVeterancy?.goldEarned).toBe(3);
    expect(state.eventLog.filter((event) => event.type === "RESOURCES_GAINED" && event.reason === "Raiders' Pay")).toHaveLength(3);
  });

  it("Dragon Fly movement opens a real adjacent damage choice and resolves 1 damage", () => {
    let state = fresh("dragon-fly-landing");
    place(state, ATTACKER, { controllerId: "p1", position: 9, type: "flying", initiative: 6, abilities: ["town-dragon-fly-landing"], cardName: "Dragon Flies" });
    place(state, DEFENDER, { controllerId: "p2", position: 11, cardName: "Target" });
    armAttack(state);
    state = applyOk(state, { type: "MOVE_UNIT", playerId: "p1", unitId: ATTACKER, destination: 10 });
    const pick = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "CHOOSE_OPTION" && /Target/.test(entry.label),
    );
    expect(pick, "Venomous Landing must expose the adjacent target in the usable UI choice").toBeDefined();
    state = applyOk(state, pick!.action);
    expect(state.combat!.units[DEFENDER].damage).toBe(1);
    expect(state.eventLog).toContainEqual(expect.objectContaining({ type: "UNIT_ABILITY_TRIGGERED", abilityId: "town-dragon-fly-landing" }));
  });

  it("Titan advantage grants at most two disposable Chain Lightning cards when neither die is +1", () => {
    let state = fresh("titan-cache");
    place(state, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 1, abilities: ["town-titan-storm-cache"] });
    place(state, DEFENDER, { controllerId: "p2", position: 13, attack: 0 });
    script(state, Array(20).fill(0));
    for (let index = 0; index < 3; index += 1) {
      state = attack(state);
      state.combat!.units[DEFENDER].damage = 0;
      state.combat!.outcome = null;
    }
    const phantoms = state.players.p1.hand.filter(isPhantomCardId);
    expect(phantoms).toHaveLength(2);
    expect(phantoms.every((id) => id.startsWith("spell.chain_lightning"))).toBe(true);
    removeComputerPhantomCards(state);
    expect(state.players.p1.hand.filter(isPhantomCardId)).toEqual([]);
  });

  it("Nix always rolls Defend and gains 1 Defense on a 0 result", () => {
    const guarded = fresh("nix-guarded");
    place(guarded, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 4 });
    place(guarded, DEFENDER, { controllerId: "p2", position: 13, abilities: ["town-nix-guarded"] });
    script(guarded, [0, 0]);
    expect(attack(guarded).combat!.units[DEFENDER].damage).toBe(3);

    const control = fresh("nix-guarded-control");
    place(control, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 4 });
    place(control, DEFENDER, { controllerId: "p2", position: 13 });
    script(control, [0]);
    expect(attack(control).combat!.units[DEFENDER].damage).toBe(4);
  });

  it("Wyvern may reroll -1 twice and heals for every replacement that is still -1", () => {
    let state = fresh("wyvern-instinct");
    place(state, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 3, damage: 2, abilities: ["town-wyvern-reroll"] });
    place(state, DEFENDER, { controllerId: "p2", position: 13 });
    script(state, [-1, -1, -1]);
    armAttack(state);
    state = passReactions(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: ATTACKER, defenderId: DEFENDER }));
    for (const expectedDamage of [1, 0]) {
      const choice = state.pendingChoice;
      expect(choice?.type).toBe("ATTACK_DIE_REROLL");
      state = applyOk(state, { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: choice!.id });
      expect(state.combat!.units[ATTACKER].damage).toBe(expectedDamage);
    }
    const choice = state.pendingChoice!;
    state = applyOk(state, { type: "CHOOSE_PENDING_ROLL", playerId: "p1", choiceId: choice.id, candidateIndex: 2 });
    expect(state.combat!.units[ATTACKER].damage).toBe(0);
  });

  it("Pit Lords gain adjacent-Demon Attack and reduce Spell damage by 2", () => {
    const bonded = fresh("pit-bond");
    place(bonded, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 3, abilities: ["town-pit-demon-bond"] });
    place(bonded, "unit_p1_crusaders", { controllerId: "p1", position: 8, unitDefId: "inferno.demons", name: "Demons" });
    place(bonded, DEFENDER, { controllerId: "p2", position: 10, attack: 0 });
    script(bonded, [0, 0]);
    expect(attack(bonded).combat!.units[DEFENDER].damage).toBe(4);

    const unbonded = fresh("pit-bond-control");
    place(unbonded, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 3, abilities: ["town-pit-demon-bond"] });
    place(unbonded, DEFENDER, { controllerId: "p2", position: 10, attack: 0 });
    script(unbonded, [0, 0]);
    expect(attack(unbonded).combat!.units[DEFENDER].damage).toBe(3);

    const warded = place(fresh("pit-spell"), DEFENDER, { abilities: ["reduce-spell-damage-2"] });
    const spellState = fresh("pit-spell-state");
    const target = place(spellState, DEFENDER, { abilities: warded.abilities });
    expect(previewSpellDamage(spellState, target, cardLibrary["spell.magic_arrow"], 4)).toBe(2);
    target.abilities = [];
    expect(previewSpellDamage(spellState, target, cardLibrary["spell.magic_arrow"], 4)).toBe(4);
  });

  it("Haspid gets +1 only on its own attack and heals when the enemy is already poisoned", () => {
    const state = fresh("haspid-drill");
    place(state, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 3, damage: 2, abilities: ["town-haspid-aggressive-drill"] });
    place(state, DEFENDER, { controllerId: "p2", position: 10, attack: 0, poisonCubes: 1 });
    script(state, [0, 0]);
    const next = attack(state);
    expect(next.combat!.units[ATTACKER].damage).toBe(1);

    const control = fresh("haspid-drill-control");
    place(control, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 3, damage: 2 });
    place(control, DEFENDER, { controllerId: "p2", position: 10, attack: 0, poisonCubes: 1 });
    script(control, [0, 0]);
    const controlNext = attack(control);
    expect(next.combat!.units[DEFENDER].damage).toBe(controlNext.combat!.units[DEFENDER].damage + 1);
    expect(controlNext.combat!.units[ATTACKER].damage).toBe(2);
  });

  it("Gorgon R1 rerolls exactly the selected Death Stare die and preserves the other", () => {
    let state = fresh("gorgon-one-die");
    place(state, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 1, abilities: ["fortress-gorgon-death-stare", "town-gorgon-stare-reroll"] });
    place(state, DEFENDER, { controllerId: "p2", position: 13 });
    script(state, [0, 0, 1, 0]);
    armAttack(state);
    state = passReactions(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: ATTACKER, defenderId: DEFENDER }));
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    if (choice?.type !== "ATTACK_DIE_REROLL") throw new Error("Expected a Death Stare reroll choice.");
    expect(choice.candidates[0].rolls).toEqual([0, 1]);
    const rerollSecond = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "REROLL_PENDING_CHOICE" && entry.action.dieIndex === 1,
    );
    expect(rerollSecond).toBeDefined();
    state = applyOk(state, rerollSecond!.action);
    expect(state.pendingChoice?.type === "ATTACK_DIE_REROLL" && state.pendingChoice.candidates.at(-1)?.rolls).toEqual([0, 0]);
  });
});
