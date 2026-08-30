import { describe, expect, it } from "vitest";

import { applyAction, createInitialGameState } from "./index";
import { applyCombatStartUnitAbilities } from "./adventure-reducer";
import { getOrthogonalNeighbors } from "./battlefield";
import { maybeOpenKivotosCombatStartChoice, maybeOpenPlayerActivationChoice } from "./reducer";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  for (let safety = 60; safety > 0 && current.reactionWindow; safety -= 1) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

function rangedDuel(abilityId: string | null, roll: number, targetRetaliated = false, targetDamage = 0, sagittaUsed = false): GameState {
  const state = createInitialGameState("blue-archive-ranged-duel");
  const attacker = state.combat!.units.unit_p1_marksmen;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.abilities = abilityId ? [abilityId] : [];
  attacker.attack = 3;
  attacker.position = 1;
  attacker.sagittaMortisUsedRound = sagittaUsed ? state.combat!.round : undefined;
  defender.position = 13;
  defender.defense = 2;
  defender.maxHealth = 30;
  defender.damage = targetDamage;
  defender.defenseToken = false;
  defender.retaliatedThisRound = targetRetaliated;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attacker.id;
  state.combat!.dice.scriptedRolls = [roll];
  state.combat!.dice.rollCount = 0;
  return settle(applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: attacker.id,
    defenderId: defender.id
  }));
}

function meleeDuel(options: {
  abilityId: string | null;
  moved?: boolean;
  targetActivated?: boolean;
  attackerType?: "ground" | "ranged";
}): GameState {
  const state = createInitialGameState("blue-archive-melee-duel");
  const attacker = state.combat!.units.unit_p1_marksmen;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.abilities = options.abilityId ? [options.abilityId] : [];
  attacker.type = options.attackerType ?? "ground";
  attacker.attack = 3;
  attacker.position = 1;
  attacker.damage = 0;
  attacker.maxHealth = 30;
  attacker.movedThisActivation = options.moved ?? false;
  defender.position = getOrthogonalNeighbors(attacker.position)[0];
  defender.attack = 3;
  defender.defense = 1;
  defender.damage = 0;
  defender.maxHealth = 30;
  defender.activatedThisRound = options.targetActivated ?? false;
  defender.retaliatedThisRound = false;
  defender.defenseToken = false;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attacker.id;
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return settle(applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: attacker.id,
    defenderId: defender.id
  }));
}

describe("Blue Archive authored unit mechanics", () => {
  it("Railgun Charge adds exactly +1 Attack only after the target retaliated this round", () => {
    expect(rangedDuel("kivotos-railgun-charge", 0, false).combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(rangedDuel("kivotos-railgun-charge", 0, true).combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("End of Vacation ignores exactly 1 Defense on 0/+1 and not on -1", () => {
    const controlZeroState = rangedDuel(null, 0);
    const abilityZeroState = rangedDuel("kivotos-end-of-vacation", 0);
    const controlZero = controlZeroState.combat!.units.unit_p2_skeletons.damage;
    const controlMinus = rangedDuel(null, -1).combat!.units.unit_p2_skeletons.damage;
    expect(
      abilityZeroState.combat!.units.unit_p2_skeletons.damage,
      JSON.stringify({ control: controlZeroState.eventLog.slice(-4), ability: abilityZeroState.eventLog.slice(-5) })
    ).toBe(controlZero + 1);
    expect(rangedDuel("kivotos-end-of-vacation", -1).combat!.units.unit_p2_skeletons.damage).toBe(controlMinus);
  });

  it("Royal Artillery opens its Attack-3 follow-up only after a non-adjacent attack", () => {
    const state = createInitialGameState("blue-archive-royal-artillery");
    const attacker = state.combat!.units.unit_p1_marksmen;
    const target = state.combat!.units.unit_p2_skeletons;
    const secondary = state.combat!.units.unit_p2_vampires;
    attacker.abilities = ["kivotos-royal-artillery"];
    attacker.position = 1;
    target.position = 13;
    secondary.position = getOrthogonalNeighbors(target.position)[0];
    target.maxHealth = 30;
    secondary.maxHealth = 30;
    secondary.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    state.combat!.dice.scriptedRolls = [0, 0];
    state.combat!.dice.rollCount = 0;

    const atChoice = settle(applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: attacker.id,
      defenderId: target.id
    }));
    const artilleryAttacks = atChoice.eventLog.filter(
      (event) => event.type === "UNIT_ATTACK_DECLARED" && event.abilityAttack?.abilityId === "kivotos-royal-artillery"
    );
    expect(artilleryAttacks).toHaveLength(1);
    expect(atChoice.combat!.units[secondary.id].damage).toBeGreaterThan(0);
  });

  it("Cleaner Rush suppresses retaliation only after Neru moved", () => {
    expect(meleeDuel({ abilityId: "kivotos-cleaner-rush", moved: true }).combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(meleeDuel({ abilityId: "kivotos-cleaner-rush", moved: false }).combat!.units.unit_p1_marksmen.damage).toBeGreaterThan(0);
  });

  it("Vanitas grants +1 Attack and suppresses retaliation only against an unactivated target", () => {
    const fresh = meleeDuel({ abilityId: "kivotos-vanitas", targetActivated: false });
    const spent = meleeDuel({ abilityId: "kivotos-vanitas", targetActivated: true });
    expect(fresh.combat!.units.unit_p2_skeletons.damage).toBe(spent.combat!.units.unit_p2_skeletons.damage + 1);
    expect(fresh.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(spent.combat!.units.unit_p1_marksmen.damage).toBeGreaterThan(0);
  });

  it("Prefect Snipe adds +1 only against a damaged non-adjacent target", () => {
    const healthy = rangedDuel("kivotos-prefect-snipe", 0, false, 0);
    const damaged = rangedDuel("kivotos-prefect-snipe", 0, false, 1);
    expect(damaged.combat!.units.unit_p2_skeletons.damage - 1).toBe(healthy.combat!.units.unit_p2_skeletons.damage + 1);
  });

  it("Rapid Reposition removes the adjacent ranged penalty and all retaliation", () => {
    const rapid = meleeDuel({ abilityId: "kivotos-rapid-reposition", attackerType: "ranged" });
    const control = meleeDuel({ abilityId: null, attackerType: "ranged" });
    expect(rapid.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(control.combat!.units.unit_p1_marksmen.damage).toBeGreaterThan(0);
    expect(rapid.combat!.units.unit_p2_skeletons.damage).toBeGreaterThanOrEqual(control.combat!.units.unit_p2_skeletons.damage);
  });

  it("Silent Faith offers its -1 reroll only against a non-adjacent target", () => {
    const make = (adjacent: boolean): GameState => {
      const state = createInitialGameState(`silent-faith-${adjacent}`);
      const attacker = state.combat!.units.unit_p1_marksmen;
      const defender = state.combat!.units.unit_p2_skeletons;
      attacker.abilities = ["kivotos-silent-faith"];
      attacker.position = 1;
      defender.position = adjacent ? getOrthogonalNeighbors(attacker.position)[0] : 13;
      defender.maxHealth = 30;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      state.combat!.dice.scriptedRolls = [-1, 0];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id }));
    };
    expect(make(false).pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    expect(make(true).pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
  });

  it("Prefect Barrage performs exactly one Attack-3 follow-up on the same target", () => {
    const state = rangedDuel("kivotos-prefect-barrage", 0);
    const followUps = state.eventLog.filter(
      (event) => event.type === "UNIT_ATTACK_DECLARED" && event.abilityAttack?.abilityId === "kivotos-prefect-barrage"
    );
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({ defenderId: "unit_p2_skeletons" });
  });

  it("Kyrie Eleison splashes exactly once per combat", () => {
    let state = createInitialGameState("kyrie-eleison-once");
    const attacker = state.combat!.units.unit_p1_marksmen;
    const target = state.combat!.units.unit_p2_skeletons;
    const secondary = state.combat!.units.unit_p2_vampires;
    attacker.abilities = ["kivotos-kyrie-eleison"];
    attacker.position = 1;
    target.position = 13;
    secondary.position = getOrthogonalNeighbors(target.position)[0];
    target.maxHealth = 40;
    secondary.maxHealth = 40;
    target.damage = 0;
    secondary.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: target.id }));
    if (state.pendingChoice?.type === "ABILITY_TARGET_CHOICE") {
      state = settle(applyOk(state, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: state.pendingChoice.id,
        targetUnitId: secondary.id
      }));
    }
    const afterFirst = state.combat!.units[secondary.id].damage;
    expect(afterFirst).toBe(1);

    const currentAttacker = state.combat!.units[attacker.id];
    currentAttacker.activatedThisRound = false;
    currentAttacker.attackedThisActivation = false;
    currentAttacker.attacksThisActivation = 0;
    currentAttacker.movedThisActivation = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = currentAttacker.id;
    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: target.id }));
    expect(state.combat!.units[secondary.id].damage).toBe(afterFirst);
  });

  it("Abi-Eshuh grants +1 Defense against only Toki's first incoming attack", () => {
    const hit = (alreadyUsed: boolean): GameState => {
      const state = createInitialGameState(`abi-eshuh-${alreadyUsed}`);
      const attacker = state.combat!.units.unit_p1_marksmen;
      const defender = state.combat!.units.unit_p2_skeletons;
      attacker.abilities = [];
      attacker.attack = 4;
      attacker.position = 1;
      defender.abilities = ["kivotos-abi-eshuh"];
      defender.position = 13;
      defender.defense = 1;
      defender.maxHealth = 30;
      defender.damage = 0;
      defender.defenseToken = false;
      defender.tokiFirstDefenseUsedThisCombat = alreadyUsed;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      state.combat!.dice.scriptedRolls = [0];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id }));
    };
    const first = hit(false);
    const later = hit(true);
    expect(first.combat!.units.unit_p2_skeletons.damage + 1).toBe(later.combat!.units.unit_p2_skeletons.damage);
    expect(first.combat!.units.unit_p2_skeletons.tokiFirstDefenseUsedThisCombat).toBe(true);
  });

  it("Sagitta Mortis ignores 1 Defense on only the first non-adjacent attack each round", () => {
    const control = rangedDuel(null, 0).combat!.units.unit_p2_skeletons.damage;
    const first = rangedDuel("kivotos-sagitta-mortis", 0, false, 0, false);
    const spent = rangedDuel("kivotos-sagitta-mortis", 0, false, 0, true);
    expect(first.combat!.units.unit_p2_skeletons.damage).toBe(control + 1);
    expect(first.combat!.units.unit_p1_marksmen.sagittaMortisUsedRound).toBe(first.combat!.round);
    expect(spent.combat!.units.unit_p2_skeletons.damage).toBe(control);
  });

  it("Trick Mine damages only the first enemy that attacks Mutsuki in melee", () => {
    let state = createInitialGameState("trick-mine-once");
    const attacker = state.combat!.units.unit_p1_marksmen;
    const mutsuki = state.combat!.units.unit_p2_skeletons;
    attacker.type = "ground";
    attacker.attack = 1;
    attacker.maxHealth = 30;
    attacker.damage = 0;
    attacker.position = 1;
    mutsuki.abilities = ["kivotos-trick-mine"];
    mutsuki.attack = 0;
    mutsuki.defense = 0;
    mutsuki.maxHealth = 30;
    mutsuki.position = getOrthogonalNeighbors(attacker.position)[0];
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: mutsuki.id }));
    expect(state.combat!.units[attacker.id].damage).toBe(1);
    expect(state.combat!.units[mutsuki.id].mutsukiTrickMineUsedThisCombat).toBe(true);

    const currentAttacker = state.combat!.units[attacker.id];
    currentAttacker.activatedThisRound = false;
    currentAttacker.attackedThisActivation = false;
    currentAttacker.attacksThisActivation = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = currentAttacker.id;
    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: mutsuki.id }));
    expect(state.combat!.units[attacker.id].damage).toBe(1);
    expect(state.eventLog.filter(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "kivotos-trick-mine"
    )).toHaveLength(1);
  });

  it("Tea Party Order gives +1 Defense to the first attacked adjacent ally only", () => {
    const hit = (used: boolean, adjacent: boolean): GameState => {
      const state = createInitialGameState(`tea-party-order-${used}-${adjacent}`);
      const attacker = state.combat!.units.unit_p1_marksmen;
      const ally = state.combat!.units.unit_p2_skeletons;
      const seia = state.combat!.units.unit_p2_vampires;
      attacker.attack = 4;
      attacker.position = 1;
      ally.defense = 1;
      ally.defenseToken = false;
      ally.maxHealth = 30;
      ally.damage = 0;
      ally.position = 13;
      seia.abilities = ["kivotos-tea-party-order"];
      seia.position = adjacent ? getOrthogonalNeighbors(ally.position)[0] : 30;
      seia.teaPartyOrderUsedThisCombat = used;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      state.combat!.dice.scriptedRolls = [0];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: ally.id }));
    };

    const protectedHit = hit(false, true);
    const spentHit = hit(true, true);
    const distantHit = hit(false, false);
    expect(
      protectedHit.combat!.units.unit_p2_skeletons.damage + 1,
      JSON.stringify({ protected: protectedHit.eventLog.slice(-8), spent: spentHit.eventLog.slice(-8) })
    ).toBe(spentHit.combat!.units.unit_p2_skeletons.damage);
    expect(protectedHit.combat!.units.unit_p2_vampires.teaPartyOrderUsedThisCombat).toBe(true);
    expect(distantHit.combat!.units.unit_p2_vampires.teaPartyOrderUsedThisCombat).not.toBe(true);
    expect(distantHit.eventLog.some(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "kivotos-tea-party-order"
    )).toBe(false);
  });

  it("Foxfire Mark marks the first damaged enemy and adds +1 beginning with the next attack", () => {
    let state = createInitialGameState("foxfire-mark-next-attack");
    const wakamo = state.combat!.units.unit_p1_marksmen;
    const target = state.combat!.units.unit_p2_skeletons;
    wakamo.abilities = ["kivotos-foxfire-mark"];
    wakamo.attack = 3;
    wakamo.position = 1;
    target.position = 13;
    target.defense = 2;
    target.defenseToken = false;
    target.maxHealth = 40;
    target.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = wakamo.id;
    state.combat!.dice.scriptedRolls = [0, 0];
    state.combat!.dice.rollCount = 0;

    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: wakamo.id, defenderId: target.id }));
    const firstDamage = state.combat!.units[target.id].damage;
    expect(firstDamage).toBe(1);
    expect(state.combat!.units[wakamo.id].wakamoMarkedTargetId).toBe(target.id);

    const currentWakamo = state.combat!.units[wakamo.id];
    currentWakamo.activatedThisRound = false;
    currentWakamo.attackedThisActivation = false;
    currentWakamo.attacksThisActivation = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = currentWakamo.id;
    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: wakamo.id, defenderId: target.id }));
    expect(state.combat!.units[target.id].damage - firstDamage).toBe(firstDamage + 1);
  });

  it("Crimson Calamity deals 1 to a chosen enemy adjacent to Wakamo's damaged marked target", () => {
    let state = createInitialGameState("crimson-calamity-splash");
    const wakamo = state.combat!.units.unit_p1_marksmen;
    const target = state.combat!.units.unit_p2_skeletons;
    const adjacentEnemy = state.combat!.units.unit_p2_vampires;
    wakamo.abilities = ["kivotos-foxfire-mark", "kivotos-crimson-calamity"];
    wakamo.attack = 3;
    wakamo.position = 1;
    target.position = 13;
    target.defense = 2;
    target.defenseToken = false;
    target.maxHealth = 40;
    adjacentEnemy.position = getOrthogonalNeighbors(target.position)[0];
    adjacentEnemy.maxHealth = 40;
    adjacentEnemy.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = wakamo.id;
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;

    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: wakamo.id, defenderId: target.id }));
    expect(state.pendingChoice).toMatchObject({ type: "ABILITY_TARGET_CHOICE", abilityId: "kivotos-crimson-calamity" });
    state = settle(applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      targetUnitId: adjacentEnemy.id
    }));
    expect(state.combat!.units[adjacentEnemy.id].damage).toBe(1);
  });

  it("Hardboiled Boss rerolls -1 once and draws only when the replacement is also -1", () => {
    const rerollInto = (replacement: number): GameState => {
      let state = createInitialGameState(`hardboiled-boss-${replacement}`);
      const aru = state.combat!.units.unit_p1_marksmen;
      const target = state.combat!.units.unit_p2_skeletons;
      aru.abilities = ["kivotos-hardboiled-boss"];
      aru.position = 1;
      target.position = 13;
      target.maxHealth = 30;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = aru.id;
      state.combat!.dice.scriptedRolls = [-1, replacement];
      state.combat!.dice.rollCount = 0;
      state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: aru.id, defenderId: target.id }));
      expect(state.pendingChoice).toMatchObject({ type: "ATTACK_DIE_REROLL" });
      return applyOk(state, {
        type: "REROLL_PENDING_CHOICE",
        playerId: "p1",
        choiceId: state.pendingChoice!.id
      });
    };

    const repeatedMinus = rerollInto(-1);
    const escapedMinus = rerollInto(0);
    expect(repeatedMinus.players.p1.hand).toHaveLength(1);
    expect(escapedMinus.players.p1.hand).toHaveLength(0);
    expect(repeatedMinus.eventLog.some(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "kivotos-hardboiled-boss"
    )).toBe(true);
  });

  it("Abyssal Shield grants a real Defense-token roll only on an ally's first incoming attack each round", () => {
    const hit = (usedThisRound: boolean, adjacent: boolean): GameState => {
      const state = createInitialGameState(`abyssal-shield-${usedThisRound}-${adjacent}`);
      const attacker = state.combat!.units.unit_p1_marksmen;
      const ally = state.combat!.units.unit_p2_skeletons;
      const hoshino = state.combat!.units.unit_p2_vampires;
      attacker.abilities = [];
      attacker.attack = 4;
      attacker.position = 1;
      ally.position = 13;
      ally.defense = 1;
      ally.defenseToken = false;
      ally.abyssalShieldUsedRound = usedThisRound ? state.combat!.round : undefined;
      ally.maxHealth = 30;
      ally.damage = 0;
      hoshino.abilities = ["kivotos-abyssal-shield"];
      hoshino.position = adjacent ? getOrthogonalNeighbors(ally.position)[0] : 30;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      // Attack die 0, then Abyssal Shield's actual Defend die +1.
      state.combat!.dice.scriptedRolls = [0, 1];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: ally.id }));
    };

    const protectedHit = hit(false, true);
    const spentHit = hit(true, true);
    const distantHit = hit(false, false);
    expect(
      protectedHit.combat!.units.unit_p2_skeletons.damage + 1,
      JSON.stringify({ protected: protectedHit.eventLog.slice(-8), spent: spentHit.eventLog.slice(-8) })
    ).toBe(spentHit.combat!.units.unit_p2_skeletons.damage);
    expect(protectedHit.combat!.units.unit_p2_skeletons.abyssalShieldUsedRound).toBe(protectedHit.combat!.round);
    expect(distantHit.eventLog.some(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "kivotos-abyssal-shield"
    )).toBe(false);
  });

  it("Survey Route teleports one chosen allied unit to a chosen empty space at combat start", () => {
    let state = createInitialGameState("survey-route-combat-start");
    for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
    const miyo = state.combat!.units.unit_p1_marksmen;
    const ally = state.combat!.units.unit_p1_griffins;
    miyo.abilities = ["kivotos-survey-route"];
    const originalPosition = ally.position;
    applyCombatStartUnitAbilities(state);
    maybeOpenKivotosCombatStartChoice(state);
    expect(state.pendingChoice).toMatchObject({
      type: "ABILITY_TARGET_CHOICE",
      kind: "combat-start-teleport",
      abilityId: "kivotos-survey-route"
    });

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      targetUnitId: ally.id
    });
    expect(state.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-teleport" });
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(state.combat!.units[ally.id].position).not.toBe(originalPosition);
  });

  it("Prophetic Dream keeps one of the top 3 cards and returns the others to the deck in order", () => {
    let state = createInitialGameState("prophetic-dream-combat-start");
    for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
    const seia = state.combat!.units.unit_p1_marksmen;
    seia.abilities = ["kivotos-prophetic-dream"];
    state.players.p1.hand = [];
    state.players.p1.deck = ["spell.mana-vortex.basic", "spell.fireball.basic", "spell.magic-arrow.basic"];

    applyCombatStartUnitAbilities(state);
    maybeOpenKivotosCombatStartChoice(state);
    expect(state.pendingChoice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "kivotos-prophetic-dream",
      propheticDream: {
        cardIds: ["spell.magic-arrow.basic", "spell.fireball.basic", "spell.mana-vortex.basic"]
      }
    });

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });
    expect(state.players.p1.hand).toEqual(["spell.fireball.basic"]);
    expect([...state.players.p1.deck].reverse()).toEqual([
      "spell.magic-arrow.basic",
      "spell.mana-vortex.basic"
    ]);
  });

  it.each([
    ["kivotos-cycle-scout", "Cycle Scout"],
    ["kivotos-arius-ambush", "Arius Ambush"]
  ])("%s moves its own unit up to 2 spaces after deployment", (abilityId) => {
    let state = createInitialGameState(`${abilityId}-combat-start`);
    for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
    const source = state.combat!.units.unit_p1_marksmen;
    source.abilities = [abilityId];
    source.position = 0;
    const original = source.position;

    applyCombatStartUnitAbilities(state);
    maybeOpenKivotosCombatStartChoice(state);
    expect(state.pendingChoice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "combat-step",
      step: { unitId: source.id, combatStart: true }
    });
    const choice = state.pendingChoice;
    if (!choice || choice.type !== "OPTION_CHOICE" || !choice.step) throw new Error("Expected move choice.");
    const twoSpaceIndex = choice.step.positions.findIndex((position) => position === 2 || position === 16);
    expect(twoSpaceIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: twoSpaceIndex
    });
    expect([2, 16]).toContain(state.combat!.units[source.id].position);
    expect(state.combat!.units[source.id].position).not.toBe(original);
  });

  it("queues multiple combat-start abilities instead of dropping later prompts", () => {
    let state = createInitialGameState("kivotos-combat-start-queue");
    for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
    const first = state.combat!.units.unit_p1_marksmen;
    const second = state.combat!.units.unit_p1_griffins;
    first.abilities = ["kivotos-cycle-scout"];
    second.abilities = ["kivotos-survey-route"];

    applyCombatStartUnitAbilities(state);
    maybeOpenKivotosCombatStartChoice(state);
    expect(state.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-step" });
    const moveChoice = state.pendingChoice;
    if (!moveChoice || moveChoice.type !== "OPTION_CHOICE") throw new Error("Expected first queued choice.");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: moveChoice.id,
      optionIndex: moveChoice.options.length - 1
    });
    expect(state.pendingChoice).toMatchObject({
      type: "ABILITY_TARGET_CHOICE",
      kind: "combat-start-teleport",
      abilityId: "kivotos-survey-route"
    });
  });

  it("Explosive Prank waits for an enemy, deals 2 to it, and 1 to every adjacent enemy", () => {
    let state = createInitialGameState("explosive-prank-activation");
    for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
    const mutsuki = state.combat!.units.unit_p1_marksmen;
    const friendly = state.combat!.units.unit_p1_griffins;
    const mover = state.combat!.units.unit_p2_skeletons;
    const splash = state.combat!.units.unit_p2_vampires;
    mutsuki.abilities = ["kivotos-explosive-prank"];
    mutsuki.position = 0;
    friendly.position = 2;
    mover.position = 3;
    splash.position = 5;
    mover.maxHealth = 30;
    mover.damage = 0;
    splash.maxHealth = 30;
    splash.damage = 0;
    state.combat!.activeUnitId = mutsuki.id;
    state.activePlayerId = "p1";

    maybeOpenPlayerActivationChoice(state);
    expect(state.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "kivotos-explosive-prank" });
    const placement = state.pendingChoice;
    if (!placement || placement.type !== "OPTION_CHOICE" || !placement.explosivePrank) {
      throw new Error("Expected Explosive Prank placement.");
    }
    const mineIndex = placement.explosivePrank.positions.indexOf(1);
    expect(mineIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: placement.id,
      optionIndex: mineIndex
    });
    expect(state.combat!.battlefieldTokens).toEqual([
      expect.objectContaining({ kind: "land_mine", position: 1, enemyOnly: true, damage: 2, adjacentEnemyDamage: 1 })
    ]);
    const placedState = structuredClone(state);

    // A friendly crossing the mine does not reveal or consume it.
    state.combat!.activeUnitId = friendly.id;
    state.activePlayerId = "p1";
    friendly.activatedThisRound = false;
    state = applyOk(state, { type: "MOVE_UNIT", playerId: "p1", unitId: friendly.id, destination: 1 });
    expect(state.combat!.battlefieldTokens).toHaveLength(1);

    state = placedState;
    state.combat!.units[friendly.id].position = 20;
    state.combat!.units[mover.id].position = 2;
    state.combat!.activeUnitId = mover.id;
    state.activePlayerId = "p2";
    state.combat!.units[mover.id].activatedThisRound = false;
    state = applyOk(state, { type: "MOVE_UNIT", playerId: "p2", unitId: mover.id, destination: 1 });
    expect(state.combat!.units[mover.id].damage).toBe(2);
    expect(state.combat!.units[splash.id].damage).toBe(1);
    expect(state.combat!.battlefieldTokens).toHaveLength(0);
  });

  it("Drone Support marks within 3 after moving, then the next friendly attack gets exactly +1", () => {
    const make = (withMark: boolean): GameState => {
      let state = createInitialGameState(`drone-support-${withMark}`);
      for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
      const shiroko = state.combat!.units.unit_p1_marksmen;
      const ally = state.combat!.units.unit_p1_griffins;
      const target = state.combat!.units.unit_p2_skeletons;
      shiroko.abilities = ["kivotos-drone-support"];
      shiroko.position = 0;
      shiroko.movedThisActivation = true;
      ally.position = 4;
      ally.attack = 3;
      ally.type = "ranged";
      ally.abilities = [];
      target.position = 12;
      target.defense = 2;
      target.defenseToken = false;
      target.maxHealth = 30;
      target.damage = 0;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = shiroko.id;

      if (withMark) {
        state = applyOk(state, {
          type: "USE_UNIT_ABILITY",
          playerId: "p1",
          unitId: shiroko.id,
          abilityId: "kivotos-drone-support",
          target: { type: "unit", unitId: target.id }
        });
        expect(state.combat!.units[shiroko.id].droneSupportUsedRound).toBe(state.combat!.round);
        expect(state.combat!.units[shiroko.id].droneSupportMarkedTargetId).toBe(target.id);
      }

      state.combat!.activeUnitId = ally.id;
      ally.activatedThisRound = false;
      state.combat!.dice.scriptedRolls = [0];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: ally.id,
        defenderId: target.id
      }));
    };

    const control = make(false);
    const marked = make(true);
    expect(marked.combat!.units.unit_p2_skeletons.damage).toBe(
      control.combat!.units.unit_p2_skeletons.damage + 1
    );
    expect(marked.combat!.units.unit_p1_marksmen.droneSupportMarkedTargetId).toBeUndefined();
  });

  it("Iron Horus reduces the first damage from any source each round, including a mine", () => {
    let state = createInitialGameState("iron-horus-all-damage");
    for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
    const hoshino = state.combat!.units.unit_p2_skeletons;
    hoshino.abilities = ["kivotos-iron-horus"];
    let parking = 20;
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.id !== hoshino.id && (unit.position === 1 || unit.position === 2)) {
        unit.position = parking++;
      }
    }
    hoshino.position = 2;
    hoshino.maxHealth = 30;
    hoshino.damage = 0;
    state.activePlayerId = "p2";

    const springMine = (current: GameState, id: string): GameState => {
      const unit = current.combat!.units[hoshino.id];
      unit.position = 2;
      unit.activatedThisRound = false;
      unit.movedThisActivation = false;
      unit.attackedThisActivation = false;
      current.combat!.activeUnitId = unit.id;
      current.activePlayerId = "p2";
      current.combat!.battlefieldTokens = [{
        id,
        kind: "land_mine",
        position: 1,
        controllerId: "p1",
        armed: true,
        damage: 2
      }];
      return applyOk(current, { type: "MOVE_UNIT", playerId: "p2", unitId: unit.id, destination: 1 });
    };

    state = springMine(state, "iron-mine-1");
    expect(state.combat!.units[hoshino.id].damage).toBe(1);
    expect(state.combat!.units[hoshino.id].ironHorusUsedRound).toBe(state.combat!.round);

    state = springMine(state, "iron-mine-2");
    expect(state.combat!.units[hoshino.id].damage).toBe(3);

    state.combat!.round += 1;
    state = springMine(state, "iron-mine-3");
    expect(state.combat!.units[hoshino.id].damage).toBe(4);
  });

  it.each(["p1", "p2"] as const)(
    "Future Sight controlled by %s may force either an allied or enemy Attack die reroll",
    (controllerId) => {
      let state = createInitialGameState(`future-sight-${controllerId}`);
      for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
      const attacker = state.combat!.units.unit_p1_marksmen;
      const defender = state.combat!.units.unit_p2_skeletons;
      const seia = controllerId === "p1"
        ? state.combat!.units.unit_p1_griffins
        : state.combat!.units.unit_p2_vampires;
      seia.abilities = ["kivotos-future-sight"];
      attacker.position = 1;
      attacker.attack = 3;
      defender.position = 13;
      defender.defense = 2;
      defender.defenseToken = false;
      defender.maxHealth = 30;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      state.combat!.dice.scriptedRolls = [1, -1];
      state.combat!.dice.rollCount = 0;

      state = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: attacker.id,
        defenderId: defender.id
      });
      expect(state.pendingChoice).toMatchObject({
        type: "ATTACK_DIE_REROLL",
        playerId: controllerId,
        rerollSources: [expect.objectContaining({ futureSight: true })]
      });
      state = applyOk(state, {
        type: "REROLL_PENDING_CHOICE",
        playerId: controllerId,
        choiceId: state.pendingChoice!.id
      });
      expect(state.combat!.units[seia.id].futureSightUsedThisCombat).toBe(true);
      const rerollChoice = state.pendingChoice;
      if (!rerollChoice || rerollChoice.type !== "ATTACK_DIE_REROLL") throw new Error("Expected reroll choice.");
      state = settle(applyOk(state, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: controllerId,
        choiceId: rerollChoice.id,
        candidateIndex: rerollChoice.candidates.length - 1
      }));
      expect(state.combat!.units[defender.id].damage).toBe(0);
    }
  );

  it("Key Authority may cancel an enemy activation ability and draws exactly 1", () => {
    let state = createInitialGameState("key-authority-cancel");
    for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
    const toki = state.combat!.units.unit_p1_marksmen;
    const kei = state.combat!.units.unit_p2_skeletons;
    toki.abilities = ["kivotos-mode-change"];
    kei.abilities = ["kivotos-key-authority"];
    state.players.p2.hand = [];
    state.players.p2.deck = ["spell.magic-arrow.basic"];
    state.combat!.activeUnitId = toki.id;
    state.activePlayerId = "p1";

    maybeOpenPlayerActivationChoice(state);
    expect(state.pendingChoice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "kivotos-key-authority",
      playerId: "p2",
      keyAuthority: {
        sourceUnitId: kei.id,
        targetUnitId: toki.id,
        targetAbilityId: "kivotos-mode-change"
      }
    });
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(state.combat!.units[kei.id].keyAuthorityUsedThisCombat).toBe(true);
    expect(state.players.p2.hand).toEqual(["spell.magic-arrow.basic"]);
    expect(state.combat!.units[toki.id].tokiMode).toBeUndefined();
    expect(state.pendingChoice).toBeNull();
  });

  it("Key Authority may allow the trigger without spending itself", () => {
    let state = createInitialGameState("key-authority-allow");
    for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
    const toki = state.combat!.units.unit_p1_marksmen;
    const kei = state.combat!.units.unit_p2_skeletons;
    toki.abilities = ["kivotos-mode-change"];
    kei.abilities = ["kivotos-key-authority"];
    state.combat!.activeUnitId = toki.id;
    state.activePlayerId = "p1";
    maybeOpenPlayerActivationChoice(state);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });
    expect(state.combat!.units[kei.id].keyAuthorityUsedThisCombat).not.toBe(true);
    expect(state.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "kivotos-mode-change", playerId: "p1" });
  });

  it("Key Authority also intercepts an automatic activation ability before it resolves", () => {
    let state = createInitialGameState("key-authority-auto-regeneration");
    for (const unit of Object.values(state.combat!.units)) {
      unit.abilities = [];
      unit.activatedThisRound = true;
    }
    const current = state.combat!.units.unit_p1_marksmen;
    const kei = state.combat!.units.unit_p1_griffins;
    const wraith = state.combat!.units.unit_p2_skeletons;
    current.activatedThisRound = false;
    kei.abilities = ["kivotos-key-authority"];
    wraith.abilities = ["wraith-heal-1"];
    wraith.activatedThisRound = false;
    wraith.damage = 2;
    wraith.maxHealth = 30;
    state.combat!.activeUnitId = current.id;
    state.activePlayerId = "p1";

    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: current.id });
    expect(state.pendingChoice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "kivotos-key-authority",
      keyAuthority: { targetUnitId: wraith.id, targetAbilityId: "wraith-heal-1", resume: "automatic" }
    });
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(state.combat!.units[wraith.id].damage).toBe(2);
    expect(state.combat!.units[kei.id].keyAuthorityUsedThisCombat).toBe(true);
  });

  it("Calculated Cover offers exactly a one-space move or stay after Yuuka attacks", () => {
    const attack = (): GameState => {
      const state = createInitialGameState("calculated-cover-post-attack");
      const yuuka = state.combat!.units.unit_p1_marksmen;
      const target = state.combat!.units.unit_p2_skeletons;
      yuuka.abilities = ["kivotos-calculated-cover"];
      yuuka.position = 1;
      target.position = 13;
      target.maxHealth = 30;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = yuuka.id;
      state.combat!.dice.scriptedRolls = [0];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: yuuka.id, defenderId: target.id }));
    };

    let moved = attack();
    const original = moved.combat!.units.unit_p1_marksmen.position;
    expect(moved.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-step" });
    moved = applyOk(moved, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: moved.pendingChoice!.id,
      optionIndex: 0
    });
    expect(getOrthogonalNeighbors(original)).toContain(moved.combat!.units.unit_p1_marksmen.position);

    let stayed = attack();
    const stayChoice = stayed.pendingChoice;
    expect(stayChoice?.type).toBe("OPTION_CHOICE");
    const stayIndex = stayChoice?.type === "OPTION_CHOICE" ? stayChoice.options.length - 1 : -1;
    stayed = applyOk(stayed, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: stayChoice!.id,
      optionIndex: stayIndex
    });
    expect(stayed.combat!.units.unit_p1_marksmen.position).toBe(original);
  });

  it("Mode Change forces one stance at activation and applies only that stance's +1 stat", () => {
    let choiceState = createInitialGameState("mode-change-choice");
    const toki = choiceState.combat!.units.unit_p1_marksmen;
    const previous = choiceState.combat!.units.unit_p1_griffins;
    for (const unit of Object.values(choiceState.combat!.units)) unit.activatedThisRound = true;
    previous.activatedThisRound = false;
    toki.activatedThisRound = false;
    toki.abilities = ["kivotos-mode-change"];
    choiceState.activePlayerId = "p1";
    choiceState.combat!.activeUnitId = previous.id;
    choiceState = applyOk(choiceState, { type: "DEFEND_UNIT", playerId: "p1", unitId: previous.id });
    expect(choiceState.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "kivotos-mode-change" });
    choiceState = applyOk(choiceState, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choiceState.pendingChoice!.id,
      optionIndex: 0
    });
    expect(choiceState.combat!.units[toki.id].tokiMode).toBe("attack");

    const attackDamage = (mode: "attack" | "guard"): number => {
      const state = createInitialGameState(`mode-change-attack-${mode}`);
      const attacker = state.combat!.units.unit_p1_marksmen;
      const defender = state.combat!.units.unit_p2_skeletons;
      attacker.abilities = ["kivotos-mode-change"];
      attacker.tokiMode = mode;
      attacker.attack = 3;
      attacker.position = 1;
      defender.position = 13;
      defender.defense = 2;
      defender.defenseToken = false;
      defender.maxHealth = 30;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      state.combat!.dice.scriptedRolls = [0];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id }))
        .combat!.units[defender.id].damage;
    };
    expect(attackDamage("attack")).toBe(attackDamage("guard") + 1);

    const incomingDamage = (mode: "attack" | "guard"): number => {
      const state = createInitialGameState(`mode-change-defense-${mode}`);
      const attacker = state.combat!.units.unit_p1_marksmen;
      const defender = state.combat!.units.unit_p2_skeletons;
      attacker.abilities = [];
      attacker.attack = 4;
      attacker.position = 1;
      defender.abilities = ["kivotos-mode-change"];
      defender.tokiMode = mode;
      defender.position = 13;
      defender.defense = 1;
      defender.defenseToken = false;
      defender.maxHealth = 30;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      state.combat!.dice.scriptedRolls = [0];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id }))
        .combat!.units[defender.id].damage;
    };
    expect(incomingDamage("guard") + 1).toBe(incomingDamage("attack"));
  });
});
