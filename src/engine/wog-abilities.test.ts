import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getDefenseDieDamageReduction } from "./unit-abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passReactions(state: GameState): GameState {
  let current = state;
  for (let guard = 0; current.reactionWindow && guard < 30; guard += 1) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

function installWogUnit(state: GameState, unitId: string, unitDefId: string): CombatUnitState {
  const unit = state.combat!.units[unitId];
  const def = coreUnitDefinitions[unitDefId];
  const side = def.neutral!;
  unit.name = def.name;
  unit.cardName = def.name;
  unit.unitDefId = unitDefId;
  unit.variant = "neutral";
  unit.grade = def.tier;
  unit.type = side.type ?? def.type;
  unit.attack = side.attack;
  unit.defense = side.defense;
  unit.maxHealth = side.health;
  unit.damage = 0;
  unit.initiative = side.initiative;
  unit.abilities = [...side.abilities];
  return unit;
}

function activate(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

describe("WOG abilities in two-player combat", () => {
  it("Messenger protection reduces only its matching school spell damage", () => {
    let airState = createInitialGameState("wog-air-protection");
    const air = installWogUnit(airState, "unit_p2_skeletons", "wog.air_messenger");
    air.maxHealth = 20;
    airState.players.p1.hand = ["spell.lightning_bolt"];
    airState.activePlayerId = "p1";
    airState.combat!.activeUnitId = "unit_p1_marksmen";
    const airCast = getLegalActions(airState, "p1").find(
      (entry) =>
        entry.action.type === "CAST_SPELL" &&
        entry.action.cardId === "spell.lightning_bolt" &&
        entry.action.target?.type === "unit" &&
        entry.action.target.unitId === air.id
    );
    expect(airCast).toBeTruthy();
    airState = passReactions(applyOk(airState, airCast!.action));
    const airDamage = airState.combat!.units[air.id].damage;

    let earthState = createInitialGameState("wog-earth-vs-air");
    const earth = installWogUnit(earthState, "unit_p2_skeletons", "wog.earth_messenger");
    earth.maxHealth = 20;
    earthState.players.p1.hand = ["spell.lightning_bolt"];
    earthState.activePlayerId = "p1";
    earthState.combat!.activeUnitId = "unit_p1_marksmen";
    const earthCast = getLegalActions(earthState, "p1").find(
      (entry) =>
        entry.action.type === "CAST_SPELL" &&
        entry.action.cardId === "spell.lightning_bolt" &&
        entry.action.target?.type === "unit" &&
        entry.action.target.unitId === earth.id
    );
    expect(earthCast).toBeTruthy();
    earthState = passReactions(applyOk(earthState, earthCast!.action));
    const earthDamage = earthState.combat!.units[earth.id].damage;
    expect(earthDamage - airDamage).toBe(2);
  });

  it("Sylvan Centaur treats a -1 Attack die as 0", () => {
    let state = createInitialGameState("wog-sylvan-minimum");
    const centaur = installWogUnit(state, "unit_p1_marksmen", "wog.sylvan_centaur");
    const target = state.combat!.units.unit_p2_skeletons;
    target.defense = 0;
    target.maxHealth = 20;
    centaur.position = 16;
    target.position = 0;
    state.combat!.dice.scriptedRolls = Array.from({ length: 10 }, () => -1);
    state.combat!.dice.rollCount = 0;
    activate(state, "p1", centaur.id);

    state = passReactions(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: centaur.id, defenderId: target.id })
    );
    expect(state.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "wog-no-negative-attack-roll")).toBe(true);
    expect(state.combat!.units[target.id].damage).toBeGreaterThanOrEqual(3);
  });

  it("Ghost heals and permanently gains Health after killing a non-Undead unit", () => {
    let state = createInitialGameState("wog-ghost-pvp");
    const ghost = installWogUnit(state, "unit_p1_marksmen", "wog.ghost");
    const target = state.combat!.units.unit_p2_skeletons;
    ghost.damage = 3;
    ghost.position = 8;
    ghost.armyUnitId = "army_ghost";
    state.players.p1.army = [{ id: "army_ghost", unitDefId: "wog.ghost", side: "neutral" }];
    target.defense = 0;
    target.maxHealth = 1;
    target.damage = 0;
    target.variant = "few";
    target.unitDefId = "castle.pikemen";
    target.position = 9;
    state.combat!.dice.scriptedRolls = [1];
    state.combat!.dice.rollCount = 0;
    activate(state, "p1", ghost.id);

    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: ghost.id, defenderId: target.id });
    state = passReactions(state);

    expect(state.combat!.units[ghost.id].damage).toBe(0);
    expect(state.combat!.units[ghost.id].maxHealth).toBe(5);
    expect(state.players.p1.army[0].permanentHealthBonus).toBe(1);
  });

  it("Werewolf is forced to attack on an Astrologers round and summons one weak copy after a kill", () => {
    let state = createInitialGameState("wog-werewolf-pvp");
    state.round = 2;
    const wolf = installWogUnit(state, "unit_p1_marksmen", "wog.werewolf");
    const target = state.combat!.units.unit_p2_skeletons;
    wolf.position = 8;
    target.position = 9;
    target.defense = 0;
    target.maxHealth = 1;
    target.damage = 0;
    activate(state, "p1", wolf.id);

    const menu = getLegalActions(state, "p1").filter((entry) =>
      ["ATTACK_UNIT", "MOVE_AND_ATTACK_UNIT", "MOVE_UNIT", "DEFEND_UNIT", "END_ACTIVATION"].includes(entry.action.type)
    );
    expect(menu.some((entry) => entry.action.type === "ATTACK_UNIT")).toBe(true);
    expect(menu.some((entry) => entry.action.type === "DEFEND_UNIT" || entry.action.type === "MOVE_UNIT")).toBe(false);

    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: wolf.id, defenderId: target.id });
    state = passReactions(state);

    const weak = Object.values(state.combat!.units).find((unit) => unit.cardName === "Weak Werewolf");
    expect(weak).toBeTruthy();
    expect([weak!.attack, weak!.defense, weak!.maxHealth, weak!.initiative]).toEqual([2, 0, 4, 6]);
    expect(weak!.temporary).toBe(true);
  });

  it("Hell Steed deals elemental damage and leaves Fire Wall on its target space", () => {
    let state = createInitialGameState("wog-hell-steed-pvp");
    const steed = installWogUnit(state, "unit_p1_marksmen", "wog.hell_steed");
    const target = state.combat!.units.unit_p2_skeletons;
    steed.position = 8;
    target.position = 9;
    target.maxHealth = 20;
    target.defense = 9;
    activate(state, "p1", steed.id);

    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: steed.id, defenderId: target.id });
    state = passReactions(state);

    expect(target.position).toBe(9);
    expect(state.combat!.units[target.id].damage).toBeGreaterThanOrEqual(5);
    expect(state.combat!.battlefieldTokens).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "fire_wall", position: 9, damage: 1 })])
    );
  });

  it("Dracolich rolls its armor die and reduces an incoming attack by 2 on -1", () => {
    let state = createInitialGameState("wog-dracolich-armor");
    const attacker = state.combat!.units.unit_p1_marksmen;
    const dracolich = installWogUnit(state, "unit_p2_skeletons", "wog.dracolich");
    attacker.attack = 5;
    attacker.abilities = [];
    dracolich.defense = 0;
    dracolich.maxHealth = 20;
    dracolich.defenseToken = false;
    expect(getDefenseDieDamageReduction(dracolich)).toEqual({
      abilityId: "wog-dracolich-armor",
      onRoll: -1,
      amount: 2
    });
    state.combat!.dice.scriptedRolls = Array.from({ length: 20 }, () => -1);
    state.combat!.dice.rollCount = 0;
    activate(state, "p1", attacker.id);

    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: dracolich.id });
    state = passReactions(state);

    expect(getDefenseDieDamageReduction(state.combat!.units[dracolich.id])).toEqual({
      abilityId: "wog-dracolich-armor",
      onRoll: -1,
      amount: 2
    });
    expect(state.combat!.units[dracolich.id].damage).toBe(2);
    expect(state.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "wog-dracolich-armor")).toBe(true);
  });

  it("Dracolich makes a Lich-style spread attack with base Attack 4", () => {
    let state = createInitialGameState("wog-dracolich-spread");
    const dracolich = installWogUnit(state, "unit_p1_marksmen", "wog.dracolich");
    const target = state.combat!.units.unit_p2_skeletons;
    const splash = state.combat!.units.unit_p2_vampires;
    const alternateSplash = state.combat!.units.unit_p2_dread_knights;
    dracolich.position = 1;
    target.position = 13;
    target.maxHealth = 20;
    target.defense = 0;
    splash.position = 14;
    splash.maxHealth = 20;
    splash.defense = 0;
    alternateSplash.position = 17;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.dice.scriptedRolls = [0, 1];
    state.combat!.dice.rollCount = 0;
    activate(state, "p1", dracolich.id);

    state = passReactions(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: dracolich.id, defenderId: target.id })
    );
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("Expected Dracolich spread target choice");
    expect(choice.candidateUnitIds).toContain(splash.id);

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: splash.id
    });
    expect(state.eventLog.some(
      (event) => event.type === "UNIT_ATTACK_DECLARED" && event.abilityAttack?.baseAttack === 4
    )).toBe(true);
    state = passReactions(state);

    const rolls = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    expect(rolls.at(-1)?.attackValue).toBe(5);
    expect(state.combat!.units[splash.id].damage).toBe(5);
  });

  it("War Zealot offers its free innate Magic Mirror in PvP", () => {
    let state = createInitialGameState("wog-zealot-mirror");
    const zealot = installWogUnit(state, "unit_p2_skeletons", "wog.war_zealot");
    state.players.p1.hand = ["spell.lightning_bolt"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const cast = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "CAST_SPELL" &&
        entry.action.cardId === "spell.lightning_bolt" &&
        entry.action.target?.type === "unit" &&
        entry.action.target.unitId === zealot.id
    );
    expect(cast).toBeTruthy();
    state = applyOk(state, cast!.action);

    while (state.reactionWindow?.priorityPlayerId !== "p2") {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow!.priorityPlayerId });
    }
    const mirror = getLegalActions(state, "p2").find((entry) => entry.action.type === "USE_UNIT_MAGIC_MIRROR");
    expect(mirror).toBeTruthy();
    state = applyOk(state, mirror!.action);
    const pendingChoice = state.pendingChoice;
    expect(pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (pendingChoice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("Expected Magic Mirror target choice");
    expect(pendingChoice.kind).toBe("spell-redirect");
    expect(state.players.p2.hand).not.toContain("spell.magic_mirror");
  });
});
