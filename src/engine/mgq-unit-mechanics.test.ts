import { describe, expect, it } from "vitest";

import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { effectiveInitiative, getDisplayAttackBonus } from "./active-effects";
import { applyCombatStartUnitAbilities } from "./adventure-reducer";
import { makeCombatUnitFromArmy } from "./adventure";
import { getUnitTokens, noteUnitDamagedForTokens, placeCombatToken, tokenCount } from "./tokens";
import {
  getSpecialtyDamageReduction,
  getSpellDamageReduction,
  maxHealthAfterUnitAbilityEffects
} from "./unit-abilities";
import { mgqUnitDefinitions } from "@/data/anime/mgq";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

const IDS = {
  dig: "mgq-pack-dig",
  pollen: "mgq-trance-pollen",
  white: "mgq-white-magic",
  hair: "mgq-wild-hair",
  devour: "mgq-devour",
  confusion: "mgq-confusion-club",
  nightmare: "mgq-nightmares-embrace",
  maidenCertain: "mgq-maiden-certain-paralysis",
  sleep: "mgq-sleep-toxin",
  slimed: "mgq-slimed",
  lisa: "mgq-lisa-growth",
  weave: "mgq-slow-weave",
  reaper: "mgq-reaper-scythe",
  aria: "mgq-flower-fragrance",
  love: "mgq-love-arrow",
  web: "mgq-web-the-field",
  regeneration: "mgq-giga-regeneration",
  sparkle: "mgq-sparkle",
  jessie: "mgq-jessie-spear-wall"
} as const;

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function applyRejected(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 100;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, {
        type: "PASS_REACTION",
        playerId: current.reactionWindow.priorityPlayerId
      });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: 0
      });
    }
  }
  expect(safety).toBeGreaterThan(0);
  return current;
}

type Overrides = Partial<
  Pick<
    CombatUnitState,
    | "position"
    | "controllerId"
    | "abilities"
    | "attack"
    | "defense"
    | "maxHealth"
    | "damage"
    | "type"
    | "variant"
    | "initiative"
  >
>;

function fresh(seed: string, roll = 0): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 80 }, () => roll);
  state.combat!.dice.rollCount = 0;
  return state;
}

function place(state: GameState, id: string, overrides: Overrides): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, overrides, {
    activatedThisRound: false,
    movedThisActivation: false,
    attackedThisActivation: false,
    attacksThisActivation: 0
  });
  return unit;
}

function duel(
  seed: string,
  attackerAbilities: string[],
  options: { roll?: number; attack?: number; defenderDefense?: number; defenderHealth?: number; attackerDamage?: number } = {}
): GameState {
  const state = fresh(seed, options.roll ?? 0);
  place(state, "unit_p1_marksmen", {
    position: 9,
    controllerId: "p1",
    abilities: attackerAbilities,
    attack: options.attack ?? 4,
    defense: 0,
    maxHealth: 40,
    damage: options.attackerDamage ?? 0,
    type: "ground"
  });
  place(state, "unit_p2_skeletons", {
    position: 10,
    controllerId: "p2",
    abilities: [],
    attack: 0,
    defense: options.defenderDefense ?? 0,
    maxHealth: options.defenderHealth ?? 40,
    damage: 0,
    type: "ground"
  });
  const parked: [string, number, PlayerId][] = [
    ["unit_p1_griffins", 0, "p1"],
    ["unit_p1_crusaders", 3, "p1"],
    ["unit_p2_vampires", 16, "p2"],
    ["unit_p2_dread_knights", 19, "p2"]
  ];
  for (const [id, position, controllerId] of parked) {
    place(state, id, {
      position,
      controllerId,
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 40,
      damage: 0,
      type: "ground"
    });
  }
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return state;
}

function attack(state: GameState, attackerId = "unit_p1_marksmen", defenderId = "unit_p2_skeletons"): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: attacker.controllerId,
      attackerId,
      defenderId
    })
  );
}

function ownRoll(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }> {
  const event = state.eventLog.find(
    (candidate): candidate is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      candidate.type === "ATTACK_ROLLED" && !candidate.isRetaliation
  );
  if (!event) throw new Error("Expected an own attack roll.");
  return event;
}

describe("MGQ ability registry", () => {
  it("registers every novel unit arm as implemented", () => {
    for (const id of Object.values(IDS)) {
      expect(unitAbilities[id], id).toMatchObject({ id, implementationStatus: "implemented" });
    }
    expect(unitAbilities[IDS.sleep].effect).toMatchObject({
      type: "ON_ATTACK_TOKEN",
      token: "temptation",
      requiresDamageDealt: true
    });
    expect(unitAbilities[IDS.love].effect).toMatchObject({
      type: "ON_ATTACK_DIE_TOKEN",
      token: "temptation",
      count: 2
    });
  });
});

describe("MGQ Mage and Hunter Jobs", () => {
  it("Mage fires one Magic Arrow before moving without ending its activation", () => {
    const state = duel("mgq-job-mage-arrow", ["mgq-mage-magic-arrow"], { defenderHealth: 10 });
    const source = state.combat!.units.unit_p1_marksmen;
    const target = state.combat!.units.unit_p2_skeletons;
    const arrow = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "USE_UNIT_ABILITY" &&
        entry.action.abilityId === "mgq-mage-magic-arrow" &&
        entry.action.target.type === "unit" &&
        entry.action.target.unitId === target.id
    );
    expect(arrow).toBeTruthy();
    const after = applyOk(state, arrow!.action);
    expect(after.combat!.units[target.id].damage).toBe(1);
    expect(after.combat!.units[source.id].usedMgqMageMagicArrowThisCombat).toBe(true);
    expect(after.combat!.units[source.id].activatedThisRound).toBe(false);
    expect(after.combat!.activeUnitId).toBe(source.id);
    expect(getLegalActions(after, "p1").some(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.abilityId === "mgq-mage-magic-arrow"
    )).toBe(false);
  });

  it("Hunter ignores exactly 1 Defense on -1/0, but not on +1", () => {
    const lowControl = attack(duel("mgq-hunter-low-control", [], { roll: 0, attack: 4, defenderDefense: 2 }));
    const lowHunter = attack(duel("mgq-hunter-low", ["mgq-hunter-low-roll-pierce"], { roll: 0, attack: 4, defenderDefense: 2 }));
    expect(lowHunter.combat!.units.unit_p2_skeletons.damage).toBe(
      lowControl.combat!.units.unit_p2_skeletons.damage + 1
    );

    const highControl = attack(duel("mgq-hunter-high-control", [], { roll: 1, attack: 4, defenderDefense: 2 }));
    const highHunter = attack(duel("mgq-hunter-high", ["mgq-hunter-low-roll-pierce"], { roll: 1, attack: 4, defenderDefense: 2 }));
    expect(highHunter.combat!.units.unit_p2_skeletons.damage).toBe(
      highControl.combat!.units.unit_p2_skeletons.damage
    );
  });
});

describe("MGQ Temptation", () => {
  it("stacks to exactly two, survives damage, skips once, clears both, and never changes sides", () => {
    const state = fresh("mgq-temptation-two");
    const target = state.combat!.units.unit_p2_skeletons;
    const originalController = target.controllerId;
    placeCombatToken(state, target, "temptation", 1, "one");
    noteUnitDamagedForTokens(state, target, 1);
    expect(tokenCount(target, "temptation")).toBe(1);
    placeCombatToken(state, target, "temptation", 1, "two");
    placeCombatToken(state, target, "temptation", 1, "capped");
    expect(tokenCount(target, "temptation")).toBe(2);

    for (const unit of Object.values(state.combat!.units)) unit.activatedThisRound = true;
    const current = state.combat!.units.unit_p1_marksmen;
    current.activatedThisRound = false;
    target.activatedThisRound = false;
    state.activePlayerId = current.controllerId;
    state.combat!.activeUnitId = current.id;
    const after = applyOk(state, { type: "END_ACTIVATION", playerId: "p1", unitId: current.id });

    expect(tokenCount(after.combat!.units[target.id], "temptation")).toBe(0);
    expect(after.combat!.units[target.id].controllerId).toBe(originalController);
    expect(
      after.eventLog.some(
        (event) => event.type === "UNIT_ACTIVATION_ENDED" && event.unitId === target.id
      )
    ).toBe(true);
  });

  it("one token is inert: activation proceeds and the marker remains", () => {
    const state = fresh("mgq-temptation-one");
    const target = state.combat!.units.unit_p2_skeletons;
    placeCombatToken(state, target, "temptation", 1, "one");
    for (const unit of Object.values(state.combat!.units)) unit.activatedThisRound = true;
    const current = state.combat!.units.unit_p1_marksmen;
    current.activatedThisRound = false;
    target.activatedThisRound = false;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = current.id;
    const after = applyOk(state, { type: "END_ACTIVATION", playerId: "p1", unitId: current.id });
    expect(after.combat!.activeUnitId).toBe(target.id);
    expect(tokenCount(after.combat!.units[target.id], "temptation")).toBe(1);
  });
});

describe("MGQ attack-triggered tokens", () => {
  it("Trance Pollen applies one Temptation only on +1", () => {
    expect(tokenCount(attack(duel("pollen-hit", [IDS.pollen], { roll: 1 })).combat!.units.unit_p2_skeletons, "temptation")).toBe(1);
    expect(tokenCount(attack(duel("pollen-control", [IDS.pollen], { roll: 0 })).combat!.units.unit_p2_skeletons, "temptation")).toBe(0);
  });

  it("Love Arrow applies two Temptation tokens only on +1", () => {
    expect(tokenCount(attack(duel("love-hit", [IDS.love], { roll: 1 })).combat!.units.unit_p2_skeletons, "temptation")).toBe(2);
    expect(tokenCount(attack(duel("love-control", [IDS.love], { roll: 0 })).combat!.units.unit_p2_skeletons, "temptation")).toBe(0);
  });

  it("Confusion Club applies Weakness and Nightmare's Embrace applies Paralysis only on +1", () => {
    const confused = attack(duel("confusion-hit", [IDS.confusion], { roll: 1 }));
    const paralyzed = attack(duel("nightmare-hit", [IDS.nightmare], { roll: 1 }));
    expect(tokenCount(confused.combat!.units.unit_p2_skeletons, "weakness")).toBe(1);
    expect(tokenCount(paralyzed.combat!.units.unit_p2_skeletons, "paralysis")).toBe(1);
    expect(tokenCount(attack(duel("confusion-control", [IDS.confusion], { roll: 0 })).combat!.units.unit_p2_skeletons, "weakness")).toBe(0);
    expect(tokenCount(attack(duel("nightmare-control", [IDS.nightmare], { roll: 0 })).combat!.units.unit_p2_skeletons, "paralysis")).toBe(0);
  });

  it("Maiden Pack always Paralyzes after its own attack", () => {
    const after = attack(duel("maiden-certain", [IDS.maidenCertain], { roll: -1, defenderDefense: 50 }));
    expect(tokenCount(after.combat!.units.unit_p2_skeletons, "paralysis")).toBe(1);
  });

  it("Sleep Toxin and Slimed require actual damage; legacy on-attack tokens keep their zero-damage default", () => {
    const sleepHit = attack(duel("sleep-hit", [IDS.sleep]));
    const sleepSoaked = attack(duel("sleep-soaked", [IDS.sleep], { defenderDefense: 50 }));
    const slimeHit = attack(duel("slime-hit", [IDS.slimed]));
    const slimeSoaked = attack(duel("slime-soaked", [IDS.slimed], { defenderDefense: 50 }));
    expect(tokenCount(sleepHit.combat!.units.unit_p2_skeletons, "temptation")).toBe(1);
    expect(tokenCount(sleepSoaked.combat!.units.unit_p2_skeletons, "temptation")).toBe(0);
    expect(tokenCount(slimeHit.combat!.units.unit_p2_skeletons, "corrosion")).toBe(1);
    expect(tokenCount(slimeSoaked.combat!.units.unit_p2_skeletons, "corrosion")).toBe(0);

    const legacy = attack(duel("legacy-zero-token", ["sorceress-weakness-on-attack"], { defenderDefense: 50 }));
    expect(tokenCount(legacy.combat!.units.unit_p2_skeletons, "weakness")).toBe(1);
  });
});

describe("MGQ conditional combat abilities", () => {
  it("Wild Hair adds +1 only while its own side is damaged", () => {
    expect(ownRoll(attack(duel("hair-healthy", [IDS.hair]))).attackValue).toBe(4);
    expect(ownRoll(attack(duel("hair-damaged", [IDS.hair], { attackerDamage: 1 }))).attackValue).toBe(5);
  });

  it("Reaper Scythe adds +2 against any listed status and nothing against an unmarked target", () => {
    const plain = duel("reaper-plain", [IDS.reaper]);
    const marked = duel("reaper-marked", [IDS.reaper]);
    placeCombatToken(marked, marked.combat!.units.unit_p2_skeletons, "temptation", 1, "setup");
    expect(ownRoll(attack(plain)).attackValue).toBe(4);
    expect(ownRoll(attack(marked)).attackValue).toBe(6);
  });

  it("Devour heals to full only when its own attack defeats a marked side", () => {
    const marked = duel("devour-marked", [IDS.devour], {
      attack: 6,
      defenderHealth: 3,
      attackerDamage: 4
    });
    placeCombatToken(marked, marked.combat!.units.unit_p2_skeletons, "temptation", 1, "setup");
    expect(attack(marked).combat!.units.unit_p1_marksmen.damage).toBe(0);

    const control = duel("devour-control", [IDS.devour], {
      attack: 6,
      defenderHealth: 3,
      attackerDamage: 4
    });
    expect(attack(control).combat!.units.unit_p1_marksmen.damage).toBe(4);
  });

  it("Slow Weave lasts only the current round and requires damage", () => {
    const hit = attack(duel("weave-hit", [IDS.weave]));
    const target = hit.combat!.units.unit_p2_skeletons;
    expect(effectiveInitiative(target, hit.activeEffects, hit.combat!)).toBe(target.initiative - 1);
    expect(
      hit.activeEffects.find((effect) => effect.source.type === "unit" && effect.source.unitId === "unit_p1_marksmen")
        ?.expiresAtCombatRoundEnd
    ).toBe(hit.combat!.round);

    const soaked = attack(duel("weave-soaked", [IDS.weave], { defenderDefense: 50 }));
    expect(soaked.activeEffects.some((effect) => effect.source.type === "unit" && effect.source.unitId === "unit_p1_marksmen")).toBe(false);
  });

  it("Lisa gains permanent +1 Health per defeated side/layer, capped at +2", () => {
    let state = duel("lisa-growth", [IDS.lisa], { attack: 10, defenderHealth: 3 });
    const baseHealth = state.combat!.units.unit_p1_marksmen.maxHealth;
    for (const expected of [1, 2, 2]) {
      const lisa = state.combat!.units.unit_p1_marksmen;
      const enemy = state.combat!.units.unit_p2_skeletons;
      enemy.damage = 0;
      enemy.maxHealth = 3;
      lisa.activatedThisRound = false;
      lisa.attackedThisActivation = false;
      lisa.attacksThisActivation = 0;
      state.combat!.activeUnitId = lisa.id;
      state = attack(state);
      expect(state.combat!.units[lisa.id].permanentHealthBonus).toBe(expected);
      expect(state.combat!.units[lisa.id].maxHealth).toBe(baseHealth + expected);
    }
  });

  it("Flower Fragrance triggers on retaliation, never on Aria's own attack", () => {
    const retaliation = duel("aria-retaliation", []);
    const aria = retaliation.combat!.units.unit_p2_skeletons;
    aria.abilities = [IDS.aria];
    aria.attack = 2;
    const afterRetaliation = attack(retaliation);
    expect(tokenCount(afterRetaliation.combat!.units.unit_p1_marksmen, "temptation")).toBe(1);

    const own = attack(duel("aria-own-control", [IDS.aria]));
    expect(tokenCount(own.combat!.units.unit_p2_skeletons, "temptation")).toBe(0);
  });
});

describe("MGQ activation and combat-start abilities", () => {
  it("White Magic freely heals or buffs one adjacent ally, then consumes Sofia's activation", () => {
    const healing = duel("white-magic-heal", [IDS.white]);
    const healer = healing.combat!.units.unit_p1_marksmen;
    const adjacent = healing.combat!.units.unit_p1_crusaders;
    adjacent.position = 8;
    adjacent.damage = 3;
    const distant = healing.combat!.units.unit_p1_griffins;
    distant.damage = 3;

    const whiteMagic = getLegalActions(healing, "p1").filter(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.abilityId === IDS.white
    );
    expect(
      whiteMagic.map((entry) =>
        entry.action.type === "USE_UNIT_ABILITY"
          ? { mode: entry.action.mode, target: entry.action.target }
          : null
      )
    ).toEqual([
      { mode: "heal", target: { type: "unit", unitId: adjacent.id } },
      { mode: "attack", target: { type: "unit", unitId: adjacent.id } }
    ]);

    const healed = applyOk(healing, whiteMagic.find(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.mode === "heal"
    )!.action);
    expect(healed.combat!.units[adjacent.id].damage).toBe(2);
    expect(healed.combat!.units[healer.id].activatedThisRound).toBe(true);
    expect(healed.combat!.activeUnitId).not.toBe(healer.id);

    const buffing = duel("white-magic-buff", [IDS.white]);
    const buffer = buffing.combat!.units.unit_p1_marksmen;
    const buffTarget = buffing.combat!.units.unit_p1_crusaders;
    buffTarget.position = 8;
    buffTarget.damage = 3;
    const buff = getLegalActions(buffing, "p1").find(
      (entry) =>
        entry.action.type === "USE_UNIT_ABILITY" &&
        entry.action.abilityId === IDS.white &&
        entry.action.mode === "attack" &&
        entry.action.target.type === "unit" &&
        entry.action.target.unitId === buffTarget.id
    );
    expect(buff, "the Attack option remains available while the ally is wounded").toBeTruthy();
    const buffed = applyOk(buffing, buff!.action);
    expect(getDisplayAttackBonus(buffed, buffed.combat!.units[buffTarget.id])).toBe(1);
    expect(buffed.combat!.units[buffTarget.id].damage).toBe(3);
    expect(buffed.combat!.units[buffer.id].activatedThisRound).toBe(true);

    const forged = duel("white-magic-forged", [IDS.white]);
    const forgedSource = forged.combat!.units.unit_p1_marksmen;
    const forgedTarget = forged.combat!.units.unit_p1_griffins;
    forgedTarget.damage = 2;
    const rejected = applyRejected(forged, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: forgedSource.id,
      abilityId: IDS.white,
      target: { type: "unit", unitId: forgedTarget.id },
      mode: "heal"
    });
    expect(rejected.combat!.units[forgedTarget.id].damage).toBe(2);
    expect(rejected.combat!.units[forgedSource.id].activatedThisRound).toBe(false);
  });

  it("Giga regenerates 2 damage at the start of each activation", () => {
    let state = duel("giga-regeneration", [IDS.regeneration]);
    const giga = state.combat!.units.unit_p1_marksmen;
    giga.damage = 4;
    for (const unit of Object.values(state.combat!.units)) unit.activatedThisRound = unit.id !== giga.id;
    const current = state.combat!.units.unit_p2_skeletons;
    current.activatedThisRound = false;
    state.activePlayerId = current.controllerId;
    state.combat!.activeUnitId = current.id;
    state = applyOk(state, { type: "END_ACTIVATION", playerId: current.controllerId, unitId: current.id });
    expect(state.combat!.activeUnitId).toBe(giga.id);
    expect(state.combat!.units[giga.id].damage).toBe(2);
  });

  it("Pack Dig offers adjacent empty cells, places one obstacle, and rejects occupied targets without mutation", () => {
    const state = duel("pack-dig", [IDS.dig]);
    const actions = getLegalActions(state, "p1").filter(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.abilityId === IDS.dig
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(
      actions.every(
        (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.target.type === "space"
      )
    ).toBe(true);
    const dig = actions.find(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.target.type === "space"
    );
    expect(dig).toBeDefined();
    if (!dig || dig.action.type !== "USE_UNIT_ABILITY" || dig.action.target.type !== "space") return;
    const dugPosition = dig.action.target.position;
    const dug = applyOk(state, dig!.action);
    expect(dug.combat!.obstacles).toContain(dugPosition);
    expect(dug.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(true);

    const blocked = duel("pack-dig-blocked", [IDS.dig]);
    const before = [...(blocked.combat!.obstacles ?? [])];
    const rejected = applyRejected(blocked, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: "unit_p1_marksmen",
      abilityId: IDS.dig,
      target: { type: "space", position: 10 }
    });
    expect(rejected.combat!.obstacles ?? []).toEqual(before);
  });

  it("Pack Dig may replace the attack after Pochi moves", () => {
    let state = duel("pack-dig-after-move", [IDS.dig]);
    const move = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "MOVE_UNIT" && entry.action.unitId === "unit_p1_marksmen"
    );
    expect(move).toBeDefined();
    state = applyOk(state, move!.action);
    expect(state.combat!.units.unit_p1_marksmen.movedThisActivation).toBe(true);

    const dig = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.abilityId === IDS.dig
    );
    expect(dig).toBeDefined();
    state = applyOk(state, dig!.action);
    expect(state.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(true);
    expect(state.combat!.obstacles?.length).toBeGreaterThan(0);
  });

  it("Jessie's Spear Wall deals fixed 2 damage behind a normal first attack", () => {
    const state = duel("jessie-spear-wall", [IDS.jessie], { attack: 4, defenderHealth: 40 });
    const behind = place(state, "unit_p2_vampires", {
      position: 11,
      controllerId: "p2",
      abilities: [],
      attack: 0,
      defense: 99,
      maxHealth: 40,
      damage: 0,
      type: "ground"
    });
    const after = attack(state);
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(4);
    expect(after.combat!.units[behind.id].damage).toBe(2);
    expect(
      after.eventLog.some((event) => event.type === "ATTACK_ROLLED" && event.defenderId === behind.id)
    ).toBe(false);
  });

  it("Jessie's Spear Wall never demolishes a Wall behind the target (the Gold-Dragon breath does)", () => {
    // The shared SECOND_ATTACK_BEHIND_TARGET arm carries a house rule: with NO
    // unit behind the target, a line BREATH fells an enemy Wall/Gate in that
    // cell. Jessie's printed text is "deal 2 damage to the unit directly behind
    // the target" — no breath, so a fixed-damage arm must leave the wall alone.
    function walledAttack(abilityId: string): GameState {
      const state = duel(`jessie-wall-${abilityId}`, [abilityId], { attack: 4 });
      state.combat!.siege = {
        townPlayerId: "p2",
        walls: [11],
        gatePosition: null,
        arrowTowerUnitId: null
      };
      return attack(state);
    }
    expect(walledAttack(IDS.jessie).combat!.siege!.walls, "Spear Wall leaves the wall standing").toEqual([11]);
    // CONTROL: the ordinary (non-fixed) line arm still fells it.
    expect(walledAttack("mechanics-line-attack-2").combat!.siege!.walls).toEqual([]);
  });

  it("Web the Field targets adjacent enemies, applies Weakness, and gives only its source a Defense token", () => {
    const state = duel("web-field", [IDS.web]);
    const open = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.abilityId === IDS.web
    );
    expect(open).toBeDefined();
    const picking = applyOk(state, open!.action);
    expect(picking.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (picking.pendingChoice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(picking.pendingChoice.candidateUnitIds).toContain("unit_p2_skeletons");
    expect(picking.pendingChoice.candidateUnitIds).not.toContain("unit_p2_vampires");
    const placed = applyOk(picking, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: picking.pendingChoice.id,
      targetUnitId: "unit_p2_skeletons"
    });
    expect(tokenCount(placed.combat!.units.unit_p2_skeletons, "weakness")).toBe(1);
    expect(placed.combat!.units.unit_p1_marksmen.defenseToken).toBe(true);
    expect(placed.combat!.units.unit_p2_skeletons.defenseToken).not.toBe(true);

    const invalid = duel("web-field-control", [IDS.web]);
    const invalidOpen = getLegalActions(invalid, "p1").find(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.abilityId === IDS.web
    )!;
    const invalidPicking = applyOk(invalid, invalidOpen.action);
    const rejected = applyRejected(invalidPicking, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: invalidPicking.pendingChoice!.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(getUnitTokens(rejected.combat!.units.unit_p2_vampires)).toEqual([]);
    expect(rejected.combat!.units.unit_p1_marksmen.defenseToken).not.toBe(true);
  });

  it("Sparkle grants positive Morale at combat start; an untagged control and the neutral seat do not", () => {
    const state = fresh("sparkle-start");
    state.players.p1.morale = 0;
    state.players.p2.morale = 0;
    state.combat!.units.unit_p1_marksmen.abilities = [IDS.sparkle];
    applyCombatStartUnitAbilities(state);
    expect(state.players.p1.morale).toBe(1);
    expect(state.players.p2.morale).toBe(0);
    expect(state.combat!.units.unit_p1_marksmen.controllerId).toBe("p1");
  });
});

const CARMILLA = "mgq-carmilla-life-drain";

describe("Carmilla — Vampire Life-Drain heals by the damage dealt", () => {
  it("scales with the damage dealt, caps at current damage, and needs a hit", () => {
    // Attack 6, roll 0, no defence → 6 damage dealt → heal 6 (from 6 damage → 0).
    const big = attack(duel("carmilla-drain-big", [CARMILLA], { attack: 6, attackerDamage: 6, defenderHealth: 40 }));
    expect(big.combat!.units.unit_p1_marksmen.damage).toBe(0);

    // Attack 2 → only 2 damage dealt → heal 2 (from 6 damage → 4). This is what
    // discriminates "heal by damage dealt" from a fixed self-heal amount.
    const small = attack(duel("carmilla-drain-small", [CARMILLA], { attack: 2, attackerDamage: 6, defenderHealth: 40 }));
    expect(small.combat!.units.unit_p1_marksmen.damage).toBe(4);

    // A fully soaked attack deals 0 → heals nothing.
    const soaked = attack(
      duel("carmilla-drain-soaked", [CARMILLA], { attack: 4, attackerDamage: 6, defenderDefense: 50, defenderHealth: 40 })
    );
    expect(soaked.combat!.units.unit_p1_marksmen.damage).toBe(6);

    // CONTROL: without the ability, no heal.
    const control = attack(duel("carmilla-drain-control", [], { attack: 6, attackerDamage: 6, defenderHealth: 40 }));
    expect(control.combat!.units.unit_p1_marksmen.damage).toBe(6);
  });

  it("is the ability Carmilla actually carries on both sides", () => {
    expect(mgqUnitDefinitions["mgq.carmilla"].few!.abilities).toContain(CARMILLA);
    expect(mgqUnitDefinitions["mgq.carmilla"].pack!.abilities).toContain(CARMILLA);
  });
});

const MAIDEN_WARD = "reduce-spell-and-specialty-damage-1";

describe("Maiden — Dream Ward reduces Spell and Specialty damage by 1", () => {
  it("both Maiden sides carry the reduction and it softens spell AND specialty damage by 1", () => {
    expect(mgqUnitDefinitions["mgq.maiden"].few!.abilities).toContain(MAIDEN_WARD);
    expect(mgqUnitDefinitions["mgq.maiden"].pack!.abilities).toContain(MAIDEN_WARD);
    const warded = { abilities: [MAIDEN_WARD] } as CombatUnitState;
    expect(getSpellDamageReduction(warded)).toBe(1);
    expect(getSpecialtyDamageReduction(warded)).toBe(1);
  });

  it("shrugs exactly 1 damage off a Magic Arrow compared with an unwarded target", () => {
    function arrowDamage(abilities: string[]): number {
      const state = createInitialGameState("maiden-ward-arrow");
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      // Scroll-cast Magic Arrow (fixed elemental damage) so no book/limit gates.
      state.players.p1.scrolls = [{ id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_griffins";
      const target = state.combat!.units.unit_p2_vampires;
      target.abilities = abilities;
      target.maxHealth = 20;
      target.damage = 0;
      const cast = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "CAST_SPELL" &&
          legal.action.fromScroll === "scroll_1" &&
          legal.action.target?.type === "unit" &&
          legal.action.target.unitId === target.id
      );
      let after = applyOk(state, cast!.action);
      let safety = 40;
      while (after.reactionWindow && safety-- > 0) {
        after = applyOk(after, { type: "PASS_REACTION", playerId: after.reactionWindow.priorityPlayerId });
      }
      return after.combat!.units.unit_p2_vampires.damage;
    }
    const warded = arrowDamage([MAIDEN_WARD]);
    const bare = arrowDamage([]);
    expect(bare - warded).toBe(1);
    expect(warded).toBe(bare - 1);
  });
});
