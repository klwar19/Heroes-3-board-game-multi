import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { getMainHero, type NeutralDraw } from "./adventure";
import { finalizeAdventureCombat, revealNeutralArmy, startNeutralEncounter } from "./adventure-reducer";
import { getDefenseDieDamageReduction, getSpellSchoolDamageReduction } from "./unit-abilities";
import { unitDealsElementalDamage } from "./active-effects";
import { NEUTRAL_PLAYER_ID } from "./state";
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

  it("every Messenger also reduces Magic Arrow damage (a school-'any' spell) by 2", () => {
    // Each Messenger reduces its own school by 2 AND Magic Arrow (school "any") by
    // 2, but not an unrelated specific school. This is the reduction the engine
    // subtracts from a Spell hit (reducedSpellDamage), so it is the real value.
    for (const [id, school, other] of [
      ["wog.air_messenger", "air", "earth"],
      ["wog.earth_messenger", "earth", "air"],
      ["wog.fire_messenger", "fire", "water"],
      ["wog.water_messenger", "water", "fire"]
    ] as const) {
      const state = createInitialGameState(`msgr-arrow-${id}`);
      const unit = installWogUnit(state, "unit_p2_skeletons", id);
      expect(getSpellSchoolDamageReduction(unit, ["any"]), `${id} vs Magic Arrow`).toBe(2);
      expect(getSpellSchoolDamageReduction(unit, [school]), `${id} vs its own school`).toBe(2);
      expect(getSpellSchoolDamageReduction(unit, [other]), `${id} vs an unrelated school`).toBe(0);
    }

    // End-to-end: a power-2 Magic Arrow (3 damage) deals only 1 to an Air
    // Messenger (−2), but the full 3 to a plain unit.
    function magicArrowDamage(unitDefId: string | null): number {
      const state = createInitialGameState(`msgr-arrow-e2e-${unitDefId ?? "plain"}`);
      const target = unitDefId
        ? installWogUnit(state, "unit_p2_skeletons", unitDefId)
        : state.combat!.units.unit_p2_skeletons;
      target.maxHealth = 20;
      target.damage = 0;
      state.players.p1.hand = ["spell.magic_arrow", "stat.power", "stat.power", "stat.power", "stat.power"];
      state.players.p1.permanents = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_marksmen";
      state.combat!.units.unit_p1_marksmen.activatedThisRound = false;
      const cast = getLegalActions(state, "p1").find(
        (entry) =>
          entry.action.type === "CAST_SPELL" &&
          entry.action.cardId === "spell.magic_arrow" &&
          entry.action.target?.type === "unit" &&
          entry.action.target.unitId === target.id
      );
      expect(cast, "Magic Arrow should be castable at the target").toBeTruthy();
      const casted = applyOk(state, cast!.action);
      if (casted.stack[0]) {
        casted.stack[0].modifiers.spellPowerBonus = 2; // power 2 → 3 damage
      }
      return passReactions(casted).combat!.units[target.id].damage;
    }
    expect(magicArrowDamage(null)).toBe(3);
    expect(magicArrowDamage("wog.air_messenger")).toBe(1);
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

  it("Hell Steed deals NORMAL melee damage (not elemental) and leaves a 1-damage Fire Wall", () => {
    let state = createInitialGameState("wog-hell-steed-pvp");
    const steed = installWogUnit(state, "unit_p1_marksmen", "wog.hell_steed");
    const target = state.combat!.units.unit_p2_skeletons;
    steed.position = 8;
    target.position = 9;
    target.maxHealth = 20;
    target.defense = 3;
    target.defenseToken = false;
    // Isolate the blow: no Retaliation Attack (whose Fire Shield burn would add to
    // the target's damage) so what we measure is purely the Steed's own strike.
    target.retaliatedThisRound = true;
    // A NORMAL attacker: its blow is reduced by Defense and it rolls its Attack
    // die (no elemental "Magic Arrow"). Attack 5 − Defense 3, die 0 → 2. An
    // elemental attack would IGNORE Defense and the die for a flat 5 — the control.
    expect(unitDealsElementalDamage(state, steed)).toBe(false);
    state.combat!.dice.scriptedRolls = Array.from({ length: 10 }, () => 0);
    state.combat!.dice.rollCount = 0;
    activate(state, "p1", steed.id);

    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: steed.id, defenderId: target.id });
    state = passReactions(state);

    expect(target.position).toBe(9);
    // Exactly attack − defense (2), NOT the un-reduced elemental 5.
    expect(state.combat!.units[target.id].damage).toBe(2);
    expect(state.combat!.battlefieldTokens).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "fire_wall", position: 9, damage: 1 })])
    );
  });

  it("War Zealot / Lava Sharpshooter gain +1 Attack on their OWN attack, but NOT on Retaliation", () => {
    // Own attack: a War Zealot (Attack 3) strikes a Defense-0 target with a "0" die.
    // The +1 "when this unit attacks" bonus makes the blow land for 4, not 3.
    let own = createInitialGameState("wog-zealot-own-attack");
    const zealot = installWogUnit(own, "unit_p1_marksmen", "wog.war_zealot");
    const target = own.combat!.units.unit_p2_skeletons;
    zealot.type = "ground"; // isolate the melee blow from any ranged penalty machinery
    zealot.position = 8;
    target.position = 9;
    target.defense = 0;
    target.defenseToken = false;
    target.maxHealth = 20;
    target.retaliatedThisRound = true; // no Retaliation Attack to muddy the reading
    expect(zealot.attack).toBe(3);
    own.combat!.dice.scriptedRolls = Array.from({ length: 10 }, () => 0);
    own.combat!.dice.rollCount = 0;
    activate(own, "p1", zealot.id);
    own = passReactions(applyOk(own, { type: "ATTACK_UNIT", playerId: "p1", attackerId: zealot.id, defenderId: target.id }));
    expect(own.combat!.units[target.id].damage).toBe(4);

    // CONTROL (mutation): strip the ability id and the very same attack lands for 3.
    let control = createInitialGameState("wog-zealot-own-attack-control");
    const zealot2 = installWogUnit(control, "unit_p1_marksmen", "wog.war_zealot");
    zealot2.abilities = zealot2.abilities.filter((id) => id !== "wog-attack-when-attacking-1");
    const target2 = control.combat!.units.unit_p2_skeletons;
    zealot2.type = "ground";
    zealot2.position = 8;
    target2.position = 9;
    target2.defense = 0;
    target2.defenseToken = false;
    target2.maxHealth = 20;
    target2.retaliatedThisRound = true;
    control.combat!.dice.scriptedRolls = Array.from({ length: 10 }, () => 0);
    control.combat!.dice.rollCount = 0;
    activate(control, "p1", zealot2.id);
    control = passReactions(applyOk(control, { type: "ATTACK_UNIT", playerId: "p1", attackerId: zealot2.id, defenderId: target2.id }));
    expect(control.combat!.units[target2.id].damage).toBe(3);

    // Retaliation: an enemy attacks the Zealot; the Zealot's Retaliation Attack must
    // NOT receive the +1 — it lands for exactly its printed Attack 3, not 4.
    let ret = createInitialGameState("wog-zealot-retaliation");
    const zealot3 = installWogUnit(ret, "unit_p2_skeletons", "wog.war_zealot");
    const enemy = ret.combat!.units.unit_p1_marksmen;
    zealot3.type = "ground";
    zealot3.position = 9;
    zealot3.defense = 0;
    zealot3.defenseToken = false;
    zealot3.maxHealth = 20;
    zealot3.retaliatedThisRound = false;
    enemy.type = "ground";
    enemy.position = 8;
    enemy.attack = 2;
    enemy.defense = 0;
    enemy.defenseToken = false;
    enemy.maxHealth = 20;
    enemy.damage = 0;
    enemy.abilities = [];
    ret.combat!.dice.scriptedRolls = Array.from({ length: 12 }, () => 0);
    ret.combat!.dice.rollCount = 0;
    activate(ret, "p1", enemy.id);
    ret = passReactions(applyOk(ret, { type: "ATTACK_UNIT", playerId: "p1", attackerId: enemy.id, defenderId: zealot3.id }));
    // The Zealot really did retaliate...
    expect(
      ret.eventLog.some(
        (event) => event.type === "ATTACK_ROLLED" && event.attackerId === zealot3.id && event.isRetaliation === true
      )
    ).toBe(true);
    // ...and its retaliation dealt 3 (Attack 3, die 0, no +1), not the own-attack 4.
    expect(ret.combat!.units[enemy.id].damage).toBe(3);

    // Both re-balanced units carry the shared ability id (data wiring guard).
    expect(coreUnitDefinitions["wog.war_zealot"].neutral!.abilities).toContain("wog-attack-when-attacking-1");
    expect(coreUnitDefinitions["wog.lava_sharpshooter"].neutral!.abilities).toContain("wog-attack-when-attacking-1");
  });

  it("Fire Shield burns only when the shielded unit is ATTACKED, never on its own Retaliation", () => {
    // Scenario A: a Hell Steed ATTACKS an enemy, which strikes back. The enemy's
    // Retaliation Attack must NOT trip the Steed's Fire Shield — you burn
    // attackers, not retaliators.
    let atk = createInitialGameState("wog-fire-shield-retaliation");
    const steed = installWogUnit(atk, "unit_p1_marksmen", "wog.hell_steed");
    const enemy = atk.combat!.units.unit_p2_skeletons;
    steed.type = "ground";
    steed.position = 8;
    enemy.type = "ground";
    enemy.position = 9;
    enemy.attack = 2;
    enemy.defense = 0;
    enemy.maxHealth = 20;
    enemy.damage = 0;
    enemy.abilities = [];
    enemy.retaliatedThisRound = false;
    atk.combat!.dice.scriptedRolls = Array.from({ length: 12 }, () => 0);
    atk.combat!.dice.rollCount = 0;
    activate(atk, "p1", steed.id);
    atk = passReactions(applyOk(atk, { type: "ATTACK_UNIT", playerId: "p1", attackerId: steed.id, defenderId: enemy.id }));

    // The enemy really did retaliate (so "no Fire Shield" is meaningful)...
    expect(
      atk.eventLog.some(
        (event) => event.type === "ATTACK_ROLLED" && event.attackerId === enemy.id && event.isRetaliation === true
      )
    ).toBe(true);
    // ...but no Fire Shield burn ever landed on it.
    expect(
      atk.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "fire-shield" && event.targetUnitId === enemy.id
      )
    ).toBe(false);

    // CONTROL: when that enemy instead ATTACKS the Steed (a primary attack), the
    // Fire Shield DOES burn it — for exactly 1.
    let def = createInitialGameState("wog-fire-shield-attacked");
    const steed2 = installWogUnit(def, "unit_p2_skeletons", "wog.hell_steed");
    const enemy2 = def.combat!.units.unit_p1_marksmen;
    enemy2.type = "ground";
    enemy2.attack = 2;
    enemy2.abilities = ["ignores-retaliation"]; // isolate: no retaliation from the Steed
    enemy2.position = 8;
    enemy2.damage = 0;
    steed2.position = 9;
    steed2.defense = 0;
    steed2.maxHealth = 20;
    steed2.damage = 0;
    def.combat!.dice.scriptedRolls = Array.from({ length: 12 }, () => 0);
    def.combat!.dice.rollCount = 0;
    activate(def, "p1", enemy2.id);
    def = passReactions(applyOk(def, { type: "ATTACK_UNIT", playerId: "p1", attackerId: enemy2.id, defenderId: steed2.id }));
    expect(
      def.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "fire-shield" && event.targetUnitId === enemy2.id
      )
    ).toBe(true);
    // The burn dealt to the attacker is exactly 1 (the attack's own damage lands
    // on the Steed, not on the attacker).
    expect(def.combat!.units[enemy2.id].damage).toBe(1);
  });

  it("Fire Wall burns a unit standing on it at the start of its activation", () => {
    // A Hell Steed drops its Fire Wall on the target's OWN space; the target only
    // feels it when its turn comes round (it never moved onto the wall). Drive a
    // real activation start by ending the prior unit's turn so the victim activates.
    let state = createInitialGameState("wog-fire-wall-activation");
    const combat = state.combat!;
    const victim = combat.units.unit_p2_skeletons;
    const prior = combat.units.unit_p1_marksmen;
    victim.type = "ground";
    victim.position = 9;
    victim.maxHealth = 20;
    victim.damage = 0;
    // Everyone has acted except the prior unit (about to end) and the victim (next).
    for (const unit of Object.values(combat.units)) {
      unit.activatedThisRound = unit.id !== prior.id && unit.id !== victim.id;
    }
    combat.battlefieldTokens = [
      { id: "bftoken_fw", kind: "fire_wall", position: 9, controllerId: "p1", damage: 1 }
    ];
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    activate(state, "p1", prior.id);

    // The prior unit Defends (ending its turn); the victim then activates, standing
    // on the wall.
    state = passReactions(applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: prior.id }));

    // The victim, standing on the wall as its turn opened, took the wall's 1 damage.
    expect(state.combat!.activeUnitId).toBe(victim.id);
    expect(state.combat!.units[victim.id].damage).toBe(1);
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "BATTLEFIELD_TOKEN_TRIGGERED" &&
          event.kind === "fire_wall" &&
          event.unitId === victim.id &&
          event.outcome === "damage"
      )
    ).toBe(true);
    // The wall is a lasting obstacle — it is NOT consumed by the burn.
    expect((state.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "fire_wall")).toHaveLength(1);
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
      abilityName: "Necrotic Armor",
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
      abilityName: "Necrotic Armor",
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
    // The spread fires the ability event the table draws the Lich death-cloud FX
    // off (abilityFxPlans["wog-dracolich-death-cloud"]).
    expect(state.eventLog.some(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "wog-dracolich-death-cloud"
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
    // Reflecting fires the ability event the table keys the Magic Mirror FX +
    // sound off (abilityFxPlans["wog-war-zealot-mirror"]).
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "wog-war-zealot-mirror"
      )
    ).toBe(true);
  });

  it("Lava Sharpshooter's Fire Shield burns an adjacent melee attacker for 1", () => {
    let state = createInitialGameState("wog-lava-fire-shield");
    const attacker = state.combat!.units.unit_p1_marksmen;
    const lava = installWogUnit(state, "unit_p2_skeletons", "wog.lava_sharpshooter");
    // A weak, retaliation-ignoring ground attacker so the ONLY damage it takes
    // back is the Fire Shield burn (not a Retaliation Attack).
    attacker.type = "ground";
    attacker.attack = 1;
    attacker.abilities = ["ignores-retaliation"];
    attacker.damage = 0;
    attacker.position = 8;
    lava.position = 9;
    lava.maxHealth = 20;
    lava.damage = 0;
    state.combat!.dice.scriptedRolls = Array.from({ length: 10 }, () => 0);
    state.combat!.dice.rollCount = 0;
    activate(state, "p1", attacker.id);

    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: lava.id });
    state = passReactions(state);

    expect(
      state.eventLog.some(
        (event) =>
          event.type === "UNIT_ABILITY_TRIGGERED" &&
          event.abilityId === "fire-shield" &&
          event.targetUnitId === attacker.id
      )
    ).toBe(true);
    expect(state.combat!.units[attacker.id].damage).toBe(1);
  });

  it("Gorynych ignores retaliation and sweeps every other adjacent enemy at Attack 4", () => {
    let state = createInitialGameState("wog-gorynych-sweep");
    const gorynych = installWogUnit(state, "unit_p1_marksmen", "wog.gorynych");
    const primary = state.combat!.units.unit_p2_skeletons;
    const sweepA = state.combat!.units.unit_p2_vampires;
    const sweepB = state.combat!.units.unit_p2_dread_knights;
    // 4-wide board: cell 5 is adjacent to 1, 4, 6 and 9.
    gorynych.position = 5;
    primary.position = 4;
    sweepA.position = 6;
    sweepB.position = 1;
    for (const enemy of [primary, sweepA, sweepB]) {
      enemy.defense = 0;
      enemy.maxHealth = 20;
      enemy.damage = 0;
    }
    state.combat!.dice.scriptedRolls = Array.from({ length: 20 }, () => 0);
    state.combat!.dice.rollCount = 0;
    activate(state, "p1", gorynych.id);

    state = passReactions(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: gorynych.id, defenderId: primary.id })
    );

    // The two OTHER adjacent enemies each take the fixed Attack-4 sweep (die 0, defense 0).
    expect(state.combat!.units[sweepA.id].damage).toBe(4);
    expect(state.combat!.units[sweepB.id].damage).toBe(4);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.abilityAttack?.baseAttack === 4)
    ).toBe(true);
  });
});

describe("WOG neutral map abilities", () => {
  function neutralCombat(seed: string): GameState {
    const state = createAdventureGameState({ seed, rollFirstPlayer: false });
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.spaceId = "wog-field";
    // Difficulty strictly above the hero's level: no Quick Combat, no Diplomacy
    // (which needs difficulty == level), so we get a real neutral Combat shell.
    state.adventure!.fields["wog-field"] = {
      spaceId: "wog-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 2,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    startNeutralEncounter(state, hero, state.adventure!.fields["wog-field"]);
    return state;
  }

  function seedNeutralArmy(state: GameState, draws: NeutralDraw[]): void {
    const combat = state.combat!;
    expect(combat.context.kind).toBe("neutral");
    combat.units = {};
    combat.pendingNeutralDraws = null;
    state.pendingChoice = null;
    revealNeutralArmy(state, draws);
  }

  it("Santa Gremlin adds a neutral Gremlin guard before Combat (ADD_NEUTRAL_GUARD)", () => {
    const state = neutralCombat("wog-santa-guard");
    seedNeutralArmy(state, [{ unitDefId: "wog.santa_gremlin", tier: "bronze" }]);
    const defIds = Object.values(state.combat!.units).map((unit) => unit.unitDefId);
    expect(defIds).toContain("wog.santa_gremlin");
    expect(defIds).toContain("neutral.gremlins");

    // CONTROL: a neutral without the ability summons no extra guard.
    const control = neutralCombat("wog-santa-guard-control");
    seedNeutralArmy(control, [{ unitDefId: "wog.ghost", tier: "bronze" }]);
    expect(Object.values(control.combat!.units).map((unit) => unit.unitDefId)).not.toContain("neutral.gremlins");
  });

  // Win a neutral fight whose (already-defeated) army is `draws`, and return how
  // many extra Resource dice the win owed the attacker. The field is removed
  // right before finalize so the immediate field visit — which would spend the
  // owed dice on the spot — is skipped, leaving the produced count observable.
  function owedResourceDiceAfterWin(seed: string, draws: NeutralDraw[]): number {
    const state = neutralCombat(seed);
    seedNeutralArmy(state, draws);
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === NEUTRAL_PLAYER_ID) {
        unit.damage = unit.maxHealth;
      }
    }
    state.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    delete state.adventure!.fields["wog-field"];
    finalizeAdventureCombat(state);
    return state.players.p1.pendingWogResourceDice ?? 0;
  }

  it("defeating Santa Gremlin owes the winner an extra Resource die (EXTRA_RESOURCE_DIE_ON_NEUTRAL_DEFEAT)", () => {
    expect(owedResourceDiceAfterWin("wog-santa-gift", [{ unitDefId: "wog.santa_gremlin", tier: "bronze" }])).toBe(1);
    // CONTROL: winning the same neutral fight without a Santa owes no bonus dice.
    expect(owedResourceDiceAfterWin("wog-santa-gift-control", [{ unitDefId: "wog.ghost", tier: "bronze" }])).toBe(0);
  });
});
