import { describe, expect, it } from "vitest";
import {
  applyAction,
  ATTACK_DIE_FACES,
  createInitialGameState,
  findEvent,
  getBattlefieldDistance,
  getLegalActions,
  getPlayerView,
  getUnitMoveRange,
  sampleCards
} from "./index";
import {
  expireEffectsForCombatEnd,
  expireEffectsForGameRoundEnd,
  expireEffectsForTurnEnd,
  makeActiveEffect
} from "./active-effects";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

const castMagicArrow = {
  type: "CAST_SPELL",
  playerId: "p1",
  cardId: "spell.magic_arrow",
  target: { type: "unit", unitId: "unit_p2_vampires" }
} satisfies GameAction;

/** Initial state with p1 holding Magic Arrow so the classic spell flow works. */
function arrowState(): GameState {
  const state = createInitialGameState();
  state.players.p1.hand = ["spell.magic_arrow", "stat.power", "stat.power"];
  state.players.p2.hand = ["ability.resistance", "stat.defense"];
  return state;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);

  expect(result.errors).toEqual([]);
  return result.state;
}

function passPriority(state: GameState): GameState {
  const playerId = state.reactionWindow?.priorityPlayerId;
  if (!playerId) {
    throw new Error("Expected an open reaction window.");
  }

  return applyOk(state, { type: "PASS_REACTION", playerId });
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  while (current.reactionWindow) {
    current = passPriority(current);
  }

  return current;
}

function setActiveUnit(state: GameState, playerId: PlayerId, unitId: string): void {
  if (!state.combat) {
    throw new Error("Expected combat setup.");
  }

  state.activePlayerId = playerId;
  state.combat.activeUnitId = unitId;
}

function scriptDice(state: GameState, rolls: number[]): void {
  if (!state.combat) {
    throw new Error("Expected combat setup.");
  }

  state.combat.dice.scriptedRolls = rolls;
  state.combat.dice.rollCount = 0;
}

describe("rules engine prototype", () => {
  it("keeps board-game card and unit categories explicit in sample data", () => {
    const state = createInitialGameState();
    const spellSchools = new Set(
      Object.values(sampleCards)
        .flatMap((card) => card.spellSchools ?? [])
        .filter((school) => school !== "any")
    );
    const artifactTiers = new Set(
      Object.values(sampleCards)
        .map((card) => card.artifactTier)
        .filter(Boolean)
    );
    const unitGrades = new Set(Object.values(state.combat?.units ?? {}).map((unit) => unit.grade));

    expect(sampleCards["spell.fireball"]).toMatchObject({
      kind: "spell",
      spellLevel: "expert",
      spellSchools: ["fire"],
      implementationStatus: "implemented"
    });
    expect(spellSchools).toEqual(new Set(["air", "earth", "fire", "water"]));
    expect(artifactTiers).toEqual(new Set(["minor", "major", "relic"]));
    expect(unitGrades).toEqual(new Set(["bronze", "silver", "gold"]));
  });

  it("sets up the level 5 battle simulator with the new test spells in p1's hand", () => {
    const state = createInitialGameState();

    expect(state.heroes.hero_p1).toMatchObject({ heroDefId: "catherine", level: 5 });
    expect(state.heroes.hero_p2).toMatchObject({ heroDefId: "sandro", level: 5 });
    expect(state.players.p1.limits).toEqual({ hand: 6, expertUses: 2 });
    expect(state.players.p1.hand).toContain("specialty.catherine.1");
    expect(state.players.p1.hand).toContain("stat.attack");
    expect(state.players.p1.hand).toContain("artifact.centaurs_axe");
    expect(state.players.p1.hand).toContain("spell.bloodlust");
    // Inferno, Slayer and Sorrow are seeded into p1's hand so they can be tested
    // directly in the simulator.
    expect(state.players.p1.hand).toContain("spell.inferno");
    expect(state.players.p1.hand).toContain("spell.slayer");
    expect(state.players.p1.hand).toContain("spell.sorrow");
    expect(state.players.p2.hand).toHaveLength(6);
    expect(state.players.p2.hand).toContain("specialty.sandro.1");
    expect(state.players.p2.hand).toContain("spell.magic_arrow");
    expect(state.combat?.obstacles).toEqual([8, 11]);
    // Units come from the real roster, so flips and abilities stay in sync.
    expect(state.combat?.units.unit_p1_marksmen).toMatchObject({
      unitDefId: "castle.marksmen",
      abilities: ["double-attack"]
    });
    expect(state.combat?.units.unit_p2_vampires).toMatchObject({
      unitDefId: "necropolis.vampires",
      abilities: ["ignores-retaliation", "vampire-heal-on-attack"]
    });
  });

  it("lists active-unit combat actions, movement actions, and spell cards for the active player", () => {
    const state = createInitialGameState();
    const legalActions = getLegalActions(state, "p1");
    const actionTypes = legalActions.map((item) => item.action.type);

    expect(state.combat?.activeUnitId).toBe("unit_p1_griffins");
    expect(actionTypes).not.toContain("MOVE_AND_ATTACK_UNIT");
    expect(actionTypes).toContain("MOVE_UNIT");
    expect(actionTypes).toContain("DEFEND_UNIT");
    expect(actionTypes).toContain("CAST_SPELL");
    expect(actionTypes).not.toContain("END_TURN");
  });

  it("casts activation spells only during your own unit's activation, once per combat round", () => {
    let state = createInitialGameState();
    // Isolate activation-spell timing: drop p1's Sorrow so its activation-skip
    // reaction window does not open as p2's units come up (Sorrow is covered in
    // rampart-inferno-spells.test.ts).
    state.players.p1.hand = state.players.p1.hand.filter((cardId) => cardId !== "spell.sorrow");
    expect(state.combat?.activeUnitId).toBe("unit_p1_griffins");
    expect(state.activePlayerId).toBe("p1");

    // Magic Arrow carries the activation symbol: p2 cannot cast it while
    // p1's unit is active.
    expect(
      getLegalActions(state, "p2").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
      )
    ).toBe(false);

    // Walk activations forward (defending ends them) until p2's unit is up.
    for (let guard = 0; guard < 6; guard += 1) {
      const activeUnit = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
      if (!activeUnit || activeUnit.controllerId === "p2") {
        break;
      }
      state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: activeUnit.id });
    }
    const activeUnit = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
    expect(activeUnit?.controllerId).toBe("p2");

    // Now the cast is offered and resolves.
    expect(
      getLegalActions(state, "p2").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
      )
    ).toBe(true);
    const casted = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_crusaders" }
    });
    const resolved = passAllReactions(casted);
    expect(resolved.players.p2.combatStats.spellsCastThisRound).toBe(1);

    // The limit of 1 spell per combat round now blocks a second cast.
    resolved.players.p2.hand.push("spell.magic_arrow");
    expect(
      getLegalActions(resolved, "p2").some((legal) => legal.action.type === "CAST_SPELL")
    ).toBe(false);

    // A new combat round resets the limit (the cast comes back as soon as a
    // p2 unit is active again).
    if (!resolved.combat) {
      throw new Error("Expected combat setup.");
    }
    resolved.combat.activeUnitId = null;
    resolved.activePlayerId = "p1";
    const nextRound = applyOk(resolved, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(nextRound.players.p2.combatStats.spellsCastThisRound).toBe(0);
    const nextActive = nextRound.combat?.activeUnitId ? nextRound.combat.units[nextRound.combat.activeUnitId] : null;
    expect(
      getLegalActions(nextRound, "p2").some((legal) => legal.action.type === "CAST_SPELL")
    ).toBe(nextActive?.controllerId === "p2");
  });

  it("opens a reaction window after a spell is cast, starting with the caster's Power timing", () => {
    const result = applyAction(arrowState(), castMagicArrow);

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("reaction");
    expect(result.state.reactionWindow?.priorityPlayerId).toBe("p1");
    expect(result.state.reactionWindow?.allowedPlayerIds).toEqual(["p1", "p2"]);
    expect(result.state.stack[0]?.status).toBe("waiting-for-reaction");
    expect(findEvent(result.state, "SPELL_CAST_STARTED")).toBeDefined();
    expect(findEvent(result.state, "REACTION_WINDOW_OPENED")).toBeDefined();
  });

  it("resolves Magic Arrow damage after all reactions pass", () => {
    const casted = applyAction(arrowState(), castMagicArrow).state;
    const result = passAllReactions(casted);

    expect(result.phase).toBe("combat");
    expect(result.reactionWindow).toBeNull();
    expect(result.stack).toEqual([]);
    expect(result.combat?.units.unit_p2_vampires.damage).toBe(1);
    expect(findEvent(result, "DAMAGE_ASSIGNED")).toMatchObject({
      amount: 1,
      damageKind: "spell"
    });
    // Printed card: Magic Arrow starts at power 0 (1 damage).
    expect(findEvent(result, "SPELL_CAST_RESOLVED")).toMatchObject({
      power: 0
    });
  });

  it("ends combat when spell damage defeats the last opposing unit", () => {
    const state = arrowState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }

    // Vampires sit on their Few side at 1 HP; everything else is defeated.
    state.combat.units.unit_p2_vampires.variant = "few";
    state.combat.units.unit_p2_vampires.maxHealth = 4;
    state.combat.units.unit_p2_vampires.damage = 3;
    state.combat.units.unit_p2_skeletons.damage = 2;
    state.combat.units.unit_p2_skeletons.variant = "few";
    state.combat.units.unit_p2_dread_knights.damage = 7;

    const casted = applyAction(state, castMagicArrow).state;
    const result = passAllReactions(casted);

    expect(result.phase).toBe("game-over");
    expect(result.combat?.activeUnitId).toBeNull();
    expect(result.combat?.outcome).toEqual({
      winnerPlayerId: "p1",
      defeatedPlayerId: "p2",
      reason: "all-enemy-units-defeated"
    });
    expect(getLegalActions(result, "p1")).toEqual([]);
    expect(findEvent(result, "COMBAT_ENDED")).toMatchObject({
      winnerPlayerId: "p1",
      defeatedPlayerId: "p2"
    });
  });

  it("flips a defeated Pack to its Few side, carrying excess damage over", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Pack of Skeletons: 2 HP, defense 1. Griffins attack 3 + roll +1 = 4,
    // so 3 damage hit a 2 HP pack: it flips to Few with 1 carried over.
    state.combat.units.unit_p1_griffins.position = 9;
    setActiveUnit(state, "p1", "unit_p1_griffins");
    scriptDice(state, [1, -1]);

    const result = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });

    const skeletons = result.combat?.units.unit_p2_skeletons;
    expect(findEvent(result, "UNIT_FLIPPED")).toMatchObject({
      unitId: "unit_p2_skeletons",
      excessDamage: 1
    });
    expect(skeletons).toMatchObject({
      variant: "few",
      cardName: "Few Skeletons",
      maxHealth: 2,
      damage: 1
    });
    expect(findEvent(result, "UNIT_REMOVED")).toBeUndefined();
    // The flipped Few side is still in the fight and retaliates as normal.
    expect(findEvent(result, "RETALIATION_ATTACKED")).toBeDefined();
  });

  it("lets Resistance cancel a pending spell after the caster passes", () => {
    const casted = applyAction(arrowState(), castMagicArrow).state;
    const p1Passed = passPriority(casted);
    const result = applyOk(p1Passed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.resistance"
    });

    expect(result.phase).toBe("combat");
    expect(result.reactionWindow).toBeNull();
    expect(result.stack).toEqual([]);
    expect(result.combat?.units.unit_p2_vampires.damage).toBe(0);
    expect(result.players.p2.discard).toContain("ability.resistance");
    expect(findEvent(result, "SPELL_CAST_CANCELLED")).toMatchObject({
      cancelledByPlayerId: "p2",
      cancelledByCardId: "ability.resistance"
    });
  });

  it("uses a crown for expert Power and pushes Magic Arrow above basic Resistance", () => {
    const casted = applyAction(arrowState(), castMagicArrow).state;
    const powered = applyOk(casted, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "expert"
    });

    // The caster keeps priority while they still hold Power cards, so they can
    // finish empowering before the defender weighs Resistance. Pass to hand the
    // window over at the final power.
    const handed = passPriority(powered);

    // At power 3 the basic Resistance play is gone, but the expert play (end
    // any spell) keeps the defender in the window until they pass.
    const p2Reactions = getLegalActions(handed, "p2");
    expect(
      p2Reactions.some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.resistance" && legal.action.mode === "basic"
      )
    ).toBe(false);
    expect(
      p2Reactions.some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.resistance" && legal.action.mode === "expert"
      )
    ).toBe(true);

    const result = passAllReactions(handed);

    expect(result.reactionWindow).toBeNull();
    expect(result.combat?.units.unit_p2_vampires.damage).toBe(3);
    expect(result.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(result.players.p1.discard).toEqual(["spell.magic_arrow", "stat.power"]);
    expect(findEvent(result, "CARD_PLAYED")).toMatchObject({
      cardId: "stat.power",
      mode: "expert",
      effectAmount: 2
    });
    expect(findEvent(result, "SPELL_CAST_RESOLVED")).toMatchObject({
      power: 2
    });
  });

  it("lets Knowledge recall a just-cast spell and expert increases the combat round spell limit", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow", "stat.knowledge"];
    state.players.p2.hand = [];

    const casted = applyOk(state, castMagicArrow);
    const recalled = applyOk(casted, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.knowledge",
      mode: "expert"
    });
    // The recalled spell could still be discarded for +1 Power, so the
    // window stays open until the caster passes.
    const resolved = passAllReactions(recalled);

    expect(resolved.phase).toBe("combat");
    expect(resolved.reactionWindow).toBeNull();
    expect(resolved.players.p1.hand).toContain("spell.magic_arrow");
    expect(resolved.players.p1.discard).toEqual(["stat.knowledge"]);
    expect(resolved.players.p1.combatStats.spellLimitBonusThisRound).toBe(1);
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(1);
  });

  it("lets a unit move, then attack after Attack and Defense cards modify the roll", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["stat.attack"];
    state.players.p2.hand = ["stat.defense"];
    scriptDice(state, [0]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const declared = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    const attackBoosted = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.attack",
      mode: "expert"
    });
    const resolved = applyOk(attackBoosted, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.defense"
    });

    expect(resolved.reactionWindow).toBeNull();
    expect(resolved.phase).toBe("combat");
    expect(resolved.combat?.units.unit_p1_griffins.position).toBe(10);
    expect(resolved.combat?.units.unit_p1_griffins.movedThisActivation).toBe(true);
    expect(resolved.combat?.units.unit_p1_griffins.activatedThisRound).toBe(true);
    // Griffins 3 + 2 expert attack + roll 0 = 5 vs Vampires 1 + 1 defense = 2.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(3);
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires",
      rolls: [0],
      roll: 0,
      attackBonus: 2,
      defenseBonus: 1,
      damage: 3
    });
  });

  it("returns to combat phase after a retaliation attack resolves", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const result = applyAction(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("combat");
    expect(result.state.priorityPlayerId).toBeNull();
    expect(result.state.reactionWindow).toBeNull();
    expect(result.state.combat?.activeUnitId).toBe("unit_p2_vampires");
    expect(findEvent(result.state, "RETALIATION_ATTACKED")).toBeDefined();
  });

  it("never lets attacks against Vampires retaliate (No Retaliation ability)", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Vampires (ignores-retaliation) attack adjacent Crusaders.
    state.combat.units.unit_p2_vampires.position = 10;
    setActiveUnit(state, "p2", "unit_p2_vampires");
    scriptDice(state, [0]);

    const result = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_vampires",
      defenderId: "unit_p1_crusaders"
    });

    expect(findEvent(result, "RETALIATION_ATTACKED")).toBeUndefined();
    expect(result.combat?.units.unit_p2_vampires.activatedThisRound).toBe(true);
  });

  it("applies ranged back-row disadvantage by rolling two dice and taking the lower result", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActiveUnit(state, "p1", "unit_p1_marksmen");
    scriptDice(state, [0, 1]);

    // Marksmen in their own backline shoot the opposite backline.
    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_dread_knights"
    });

    expect(result.errors).toEqual([]);
    expect(findEvent(result.state, "ATTACK_ROLLED")).toMatchObject({
      rolls: [0, 1],
      roll: 0,
      rollMode: "disadvantage"
    });
    expect(findEvent(result.state, "RETALIATION_ATTACKED")).toBeUndefined();
  });

  it("locks ranged units into adjacent targets when an enemy is next to them", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.combat.units.unit_p2_skeletons.position = 2;
    setActiveUnit(state, "p1", "unit_p1_marksmen");

    const legalActions = getLegalActions(state, "p1");
    const attackTargets = legalActions
      .map((legal) => legal.action)
      .filter((action): action is Extract<GameAction, { type: "ATTACK_UNIT" }> => action.type === "ATTACK_UNIT")
      .map((action) => action.defenderId);

    expect(attackTargets).toContain("unit_p2_skeletons");
    expect(attackTargets).not.toContain("unit_p2_vampires");
    expect(attackTargets).not.toContain("unit_p2_dread_knights");
  });

  it("applies ranged melee disadvantage by rolling two dice and taking the lower result", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p2_skeletons.position = 2;
    setActiveUnit(state, "p1", "unit_p1_marksmen");
    scriptDice(state, [0, 1]);

    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });

    expect(result.errors).toEqual([]);
    expect(findEvent(result.state, "ATTACK_ROLLED")).toMatchObject({
      rolls: [0, 1],
      roll: 0,
      rollMode: "disadvantage"
    });
  });

  it("attacks a non-adjacent target twice with Double Attack and stops at the second attack", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Skeletons (Pack, 2 HP, defense 1) far from the Marksmen at position 1.
    setActiveUnit(state, "p1", "unit_p1_marksmen");
    scriptDice(state, [1, 1]);

    const result = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });

    const attackRolls = result.eventLog.filter((event) => event.type === "ATTACK_ROLLED");
    // Exactly two attacks: the printed second attack triggers once and never
    // chains into a third.
    expect(attackRolls).toHaveLength(2);
    expect(result.combat?.units.unit_p1_marksmen.attacksThisActivation).toBe(2);
    expect(findEvent(result, "UNIT_ABILITY_TRIGGERED")).toMatchObject({
      abilityId: "double-attack"
    });
    // First hit (2+1-1=2) breaks the pack: it flips to Few; the second hit
    // (2 damage vs 2 HP Few side) removes it.
    expect(findEvent(result, "UNIT_FLIPPED")).toMatchObject({ unitId: "unit_p2_skeletons" });
    expect(findEvent(result, "UNIT_REMOVED")).toMatchObject({ unitId: "unit_p2_skeletons" });
    // The shooter still owes its 1-space step, so it stays active.
    expect(result.combat?.activeUnitId).toBe("unit_p1_marksmen");
  });

  it("only triggers the Elves-style double attack on a -1 or 0 first roll", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_marksmen.abilities = ["double-attack-low-roll"];
    setActiveUnit(state, "p1", "unit_p1_marksmen");

    // A +1 first roll does not trigger the follow-up shot (Vampires sit in
    // row 4, so no backline-to-backline disadvantage muddies the roll).
    scriptDice(state, [1]);
    const highRoll = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_vampires"
    });
    expect(highRoll.eventLog.filter((event) => event.type === "ATTACK_ROLLED")).toHaveLength(1);

    // A 0 first roll triggers exactly one follow-up.
    const retry = createInitialGameState();
    if (!retry.combat) {
      throw new Error("Expected combat setup.");
    }
    retry.players.p1.hand = [];
    retry.players.p2.hand = [];
    retry.combat.units.unit_p1_marksmen.abilities = ["double-attack-low-roll"];
    setActiveUnit(retry, "p1", "unit_p1_marksmen");
    scriptDice(retry, [0, 0]);
    const lowRoll = applyOk(retry, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_vampires"
    });
    expect(lowRoll.eventLog.filter((event) => event.type === "ATTACK_ROLLED")).toHaveLength(2);
  });

  it("triples the attack die outcome with the Centaur's Axe", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["artifact.centaurs_axe"];
    state.players.p2.hand = [];
    scriptDice(state, [1]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const declared = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    expect(declared.phase).toBe("reaction");

    const tripled = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "artifact.centaurs_axe",
      optionIndex: 0
    });
    const resolved = passAllReactions(tripled);

    // Griffins 3 attack + (+1 roll x3) = 6 vs Vampires defense 1 = 5 damage.
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({
      roll: 1,
      dieMultiplier: 3,
      attackValue: 6,
      damage: 5
    });
  });

  it("only lets the attacker triple the die with the Centaur's Axe — never the defender", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    // Both fighters hold a Centaur's Axe; p1's griffins attack p2's vampires.
    state.players.p1.hand = ["artifact.centaurs_axe"];
    state.players.p2.hand = ["artifact.centaurs_axe"];
    scriptDice(state, [1]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const declared = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    expect(declared.phase).toBe("reaction");

    const offersTriple = (playerId: PlayerId) =>
      (declared.reactionWindow?.legalReactions[playerId] ?? []).some(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === "artifact.centaurs_axe" &&
          legal.action.optionIndex === 0
      );

    // The attacker may triple their own roll; the defender may not reach across
    // to triple the enemy's die. (On a later retaliation the roles flip and the
    // original defender, now attacking, may triple THAT roll — a separate window.)
    expect(offersTriple("p1")).toBe(true);
    expect(offersTriple("p2")).toBe(false);
  });

  it("doubles Catherine's specialty bonus when Crusaders attack", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["specialty.catherine.1"];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_crusaders.position = 10;
    setActiveUnit(state, "p1", "unit_p1_crusaders");
    scriptDice(state, [0, 0]);

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_vampires"
    });
    const boosted = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "specialty.catherine.1",
      optionIndex: 0
    });
    // Crusaders carry their printed reroll, so keep the first roll.
    const pending = passAllReactions(boosted);
    expect(pending.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    const resolved = applyOk(pending, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? "",
      candidateIndex: 0
    });

    // +1 attack doubles to +2 because the attacker is the Crusaders.
    const rolls = resolved.eventLog.filter((event) => event.type === "ATTACK_ROLLED");
    expect(rolls[0]).toMatchObject({
      attackerId: "unit_p1_crusaders",
      attackBonus: 2
    });
  });

  it("ends combat when an attack defeats the last opposing unit", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p2_vampires.variant = "few";
    state.combat.units.unit_p2_vampires.damage = 4;
    state.combat.units.unit_p2_skeletons.variant = "few";
    state.combat.units.unit_p2_skeletons.damage = 2;
    state.combat.units.unit_p2_dread_knights.damage = 6;
    setActiveUnit(state, "p1", "unit_p1_marksmen");
    scriptDice(state, [1, 1]);

    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_dread_knights"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("game-over");
    expect(result.state.activePlayerId).toBe("p1");
    expect(result.state.combat?.outcome?.winnerPlayerId).toBe("p1");
    expect(result.state.combat?.activeUnitId).toBeNull();
  });

  it("lets the active unit move, then stay active to attack or defend", () => {
    const result = applyAction(createInitialGameState(), {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });

    expect(result.errors).toEqual([]);
    expect(result.state.combat?.units.unit_p1_griffins.position).toBe(10);
    expect(result.state.combat?.units.unit_p1_griffins.movedThisActivation).toBe(true);
    expect(result.state.combat?.units.unit_p1_griffins.activatedThisRound).toBe(false);
    expect(result.state.combat?.activeUnitId).toBe("unit_p1_griffins");
    expect(
      getLegalActions(result.state, "p1").some(
        (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.defenderId === "unit_p2_vampires"
      )
    ).toBe(true);
    expect(getLegalActions(result.state, "p1").some((legal) => legal.action.type === "DEFEND_UNIT")).toBe(true);
    expect(getLegalActions(result.state, "p1").some((legal) => legal.action.type === "MOVE_UNIT")).toBe(false);
    expect(findEvent(result.state, "UNIT_MOVED")).toMatchObject({
      unitId: "unit_p1_griffins",
      from: 5,
      to: 10
    });
  });

  it("blocks ground movement paths with units and obstacle tokens, but not flying", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    // Crusaders (ground) at 7: position 15 is 2 steps away, but the only
    // 3-step-or-less paths run through the obstacle at 11 or the occupied 14.
    state.combat.units.unit_p1_crusaders.position = 7;
    setActiveUnit(state, "p1", "unit_p1_crusaders");

    const groundDestinations = getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .filter((action): action is Extract<GameAction, { type: "MOVE_UNIT" }> => action.type === "MOVE_UNIT")
      .map((action) => action.destination);

    expect(groundDestinations).not.toContain(11); // obstacle space itself
    expect(groundDestinations).not.toContain(15); // blocked path
    expect(groundDestinations).toContain(10); // open route through the middle

    // Flying griffins from the same spot pass over the obstacle freely.
    state.combat.units.unit_p1_crusaders.position = 6;
    state.combat.units.unit_p1_griffins.position = 7;
    setActiveUnit(state, "p1", "unit_p1_griffins");

    const flyingDestinations = getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .filter((action): action is Extract<GameAction, { type: "MOVE_UNIT" }> => action.type === "MOVE_UNIT")
      .map((action) => action.destination);

    expect(flyingDestinations).toContain(15);
    expect(flyingDestinations).not.toContain(11); // still cannot land on it
  });

  it("lets a unit defend and advances activation", () => {
    const result = applyAction(createInitialGameState(), {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.combat?.units.unit_p1_griffins.defenseToken).toBe(true);
    expect(result.state.combat?.units.unit_p1_griffins.activatedThisRound).toBe(true);
    expect(result.state.combat?.activeUnitId).toBe("unit_p2_vampires");
    expect(findEvent(result.state, "UNIT_DEFENDED")).toBeDefined();
  });

  it("keeps the defense token across the round end until the unit's next activation", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    setActiveUnit(state, "p1", "unit_p1_crusaders");

    const defended = applyOk(state, {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: "unit_p1_crusaders"
    });
    expect(defended.combat?.units.unit_p1_crusaders.defenseToken).toBe(true);

    defended.combat!.activeUnitId = null;
    defended.activePlayerId = "p1";
    const nextRound = applyOk(defended, { type: "END_COMBAT_ROUND", playerId: "p1" });

    // The token survives the round end. Round 2 opens with the init-9 cross-side
    // tie (Griffins vs Vampires) resolved attacker-first — p1 (the attacker)
    // leads on the even split, then p2.
    expect(nextRound.combat?.activeUnitId).toBe("unit_p1_griffins");
    expect(nextRound.combat?.units.unit_p1_crusaders.defenseToken).toBe(true);

    // Run down the order: Griffins (9), Vampires (9), Dread Knights (7)...
    const afterGriffins = applyOk(nextRound, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(afterGriffins.combat?.activeUnitId).toBe("unit_p2_vampires");
    const afterVampires = applyOk(afterGriffins, { type: "DEFEND_UNIT", playerId: "p2", unitId: "unit_p2_vampires" });
    expect(afterVampires.combat?.activeUnitId).toBe("unit_p2_dread_knights");
    const afterDread = applyOk(afterVampires, {
      type: "DEFEND_UNIT",
      playerId: "p2",
      unitId: "unit_p2_dread_knights"
    });

    // ...now the Marksmen + Crusaders are tied at init 6, so p1 is asked which
    // of its own units goes first. The token still rides on the Crusaders.
    expect(afterDread.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(
      afterDread.pendingChoice?.type === "OPTION_CHOICE" ? afterDread.pendingChoice.context : null
    ).toBe("combat-activation-order");
    expect(afterDread.combat?.units.unit_p1_crusaders.defenseToken).toBe(true);

    // Pick the Crusaders to activate first — its defense token is discarded the
    // moment it becomes active.
    const order =
      afterDread.pendingChoice?.type === "OPTION_CHOICE" ? afterDread.pendingChoice.activationOrder : undefined;
    const crusadersIndex = order?.unitIds.indexOf("unit_p1_crusaders") ?? -1;
    expect(crusadersIndex).toBeGreaterThanOrEqual(0);
    const afterChoice = applyOk(afterDread, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: afterDread.pendingChoice!.id,
      optionIndex: crusadersIndex
    });
    expect(afterChoice.combat?.activeUnitId).toBe("unit_p1_crusaders");
    expect(afterChoice.combat?.units.unit_p1_crusaders.defenseToken).toBe(false);
  });

  it("plays an ongoing Archery effect only on the active player's own activation and expires it at round end", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["ability.archery"];
    state.players.p2.hand = ["ability.archery"];
    setActiveUnit(state, "p1", "unit_p1_marksmen");
    scriptDice(state, [0, 0]);

    // Ongoing cards belong to your own unit's activation, never the enemy's.
    expect(
      getLegalActions(state, "p2").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.archery"
      )
    ).toBe(false);
    state.players.p2.hand = [];

    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.archery",
      target: { type: "none" }
    });
    expect(played.activeEffects).toHaveLength(1);
    expect(findEvent(played, "ACTIVE_EFFECT_CREATED")).toMatchObject({
      name: "Archery",
      controllerId: "p1"
    });

    const resolved = applyOk(played, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_vampires"
    });

    expect(resolved.reactionWindow).toBeNull();
    expect(resolved.activeEffects).toHaveLength(1);
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_vampires",
      attackBonus: 1
    });

    if (!resolved.combat) {
      throw new Error("Expected combat setup.");
    }
    resolved.combat.activeUnitId = null;
    resolved.activePlayerId = "p1";

    const nextRound = applyOk(resolved, {
      type: "END_COMBAT_ROUND",
      playerId: "p1"
    });

    expect(nextRound.activeEffects).toEqual([]);
    expect(findEvent(nextRound, "ACTIVE_EFFECT_EXPIRED")).toMatchObject({
      reason: "combat-round-ended"
    });
  });

  it("plays expert Luck for an Attack-die reroll that lasts the whole game round", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["ability.luck"];
    state.players.p2.hand = [];
    // Attack 1: roll -1, reroll to +1. Attack 2 (a SECOND, separate attack in
    // the same round): roll -1 — Expert Luck must STILL offer a reroll.
    scriptDice(state, [-1, 1, -1, 1]);

    // Ongoing timing: legal during the controller's own activation.
    const luckPlay = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.luck" && legal.action.mode === "expert"
    );
    expect(luckPlay).toBeDefined();

    const played = applyOk(state, luckPlay!.action);
    expect(played.activeEffects.map((effect) => effect.name)).toContain("Expert Luck");

    const moved = applyOk(played, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const pending = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    expect(pending.pendingChoice).toMatchObject({
      type: "ATTACK_DIE_REROLL",
      remainingRerolls: 1
    });

    const rerolled = applyOk(pending, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? ""
    });
    const resolved = applyOk(rerolled, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: rerolled.pendingChoice?.id ?? "",
      candidateIndex: 1
    });
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({ roll: 1 });

    // The fix: Expert Luck is NOT consumed by the reroll — it stays on the table
    // for the rest of the game round. Were it
    // consumed on use (the old bug, consumeEffectOnUse: true), it would be gone
    // here and every later attack this round would lose the reroll. The non-
    // consumed effect is proven reusable per attack by the Crusader+Luck test
    // below. (A test fails if the consume-on-use logic is restored.)
    expect(resolved.activeEffects.map((effect) => effect.name)).toContain("Expert Luck");
  });

  it("keeps Expert Luck through combat and player-turn end, then expires it at game-round end", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["ability.luck"];

    const luckPlay = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.luck" && legal.action.mode === "expert"
    );
    const played = applyOk(state, luckPlay!.action);
    expect(played.activeEffects.map((effect) => effect.name)).toContain("Expert Luck");

    // Neither combat end nor one player's turn end removes round-scoped Luck.
    const afterCombat = expireEffectsForCombatEnd(played);
    expect(afterCombat.map((effect) => effect.name)).not.toContain("Expert Luck");
    expect(played.activeEffects.map((effect) => effect.name)).toContain("Expert Luck");

    const afterTurn = expireEffectsForTurnEnd(played, "p1");
    expect(afterTurn.map((effect) => effect.name)).not.toContain("Expert Luck");
    expect(played.activeEffects.map((effect) => effect.name)).toContain("Expert Luck");

    played.round += 1;
    const afterRound = expireEffectsForGameRoundEnd(played);
    expect(afterRound.map((effect) => effect.name)).toContain("Expert Luck");
    expect(played.activeEffects.map((effect) => effect.name)).not.toContain("Expert Luck");
  });

  it("plays a held Diplomat's Ring as an after-the-roll reaction to reroll the Attack die, then discards it", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    // The artifact is only HELD — never pre-played. Its reroll must be offered
    // from hand once the Attack die is rolled, not selected up front.
    state.players.p1.hand = ["artifact.diplomats_ring"];
    state.players.p2.hand = [];
    scriptDice(state, [-1, 1]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const pending = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });

    expect(pending.pendingChoice).toMatchObject({
      type: "ATTACK_DIE_REROLL",
      remainingRerolls: 1
    });
    expect(
      pending.pendingChoice?.type === "ATTACK_DIE_REROLL" &&
        pending.pendingChoice.rerollSources.some((source) => source.cardId === "artifact.diplomats_ring")
    ).toBe(true);

    const rerolled = applyOk(pending, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? ""
    });
    const resolved = applyOk(rerolled, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: rerolled.pendingChoice?.id ?? "",
      candidateIndex: 1
    });

    // Taking the reroll plays (discards) the artifact, and the reroll lands.
    expect(resolved.players.p1.hand).not.toContain("artifact.diplomats_ring");
    expect(resolved.players.p1.discard).toContain("artifact.diplomats_ring");
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({ roll: 1 });
  });

  it("opens a pending reroll choice from Fortune before attack damage is assigned", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["spell.fortune"];
    state.players.p2.hand = [];
    scriptDice(state, [0, 1]);

    const fortune = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.fortune",
      target: { type: "none" }
    });
    expect(fortune.activeEffects).toHaveLength(1);
    expect(fortune.activeEffects[0]).toMatchObject({
      name: "Fortune"
    });

    const moved = applyOk(fortune, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const pending = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });

    expect(pending.phase).toBe("choice");
    // Power 0 (no Power cards) is a single reroll — the card no longer bakes in
    // +1 Power, which used to open with two rerolls here.
    expect(pending.pendingChoice).toMatchObject({
      type: "ATTACK_DIE_REROLL",
      playerId: "p1",
      remainingRerolls: 1,
      candidates: [{ roll: 0 }]
    });
    expect(pending.combat?.units.unit_p2_vampires.damage).toBe(0);

    const rerolled = applyOk(pending, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? ""
    });
    expect(rerolled.pendingChoice).toMatchObject({
      remainingRerolls: 0,
      candidates: [{ roll: 0 }, { roll: 1 }]
    });

    const resolved = applyOk(rerolled, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: rerolled.pendingChoice?.id ?? "",
      candidateIndex: 1
    });

    expect(resolved.pendingChoice).toBeNull();
    expect(resolved.activeEffects).toEqual([]);
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(3);
    expect(findEvent(resolved, "ATTACK_REROLLED")).toMatchObject({
      roll: 1
    });
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({
      roll: 1,
      damage: 3
    });
  });

  it("stacks the Crusader 0-reroll with Luck and always spends Luck last", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activeEffects.push({
      id: "effect_luck",
      name: "Luck",
      scope: "player",
      duration: { type: "current-turn" },
      polarity: "positive",
      removable: false,
      modifiers: [{ type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 1, consumeEffectOnUse: false }],
      source: { type: "system" },
      controllerId: "p1",
      startedRound: state.round,
      startedCombatRound: state.combat.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });
    setActiveUnit(state, "p1", "unit_p1_crusaders");
    scriptDice(state, [0, 1, -1]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_crusaders",
      destination: 10
    });
    const pending = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_vampires"
    });

    // The die shows 0: the printed Crusader reroll and Luck both apply, the
    // ability is queued first and Luck last.
    expect(pending.pendingChoice).toMatchObject({
      type: "ATTACK_DIE_REROLL",
      remainingRerolls: 2,
      rerollSources: [
        { name: "Attack Reroll", remaining: 1, onlyOnRoll: 0 },
        { name: "Luck", effectId: "effect_luck", remaining: 1 }
      ]
    });

    const firstReroll = applyOk(pending, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? ""
    });
    // The 0 was rerolled into a +1 — the Crusader gate closes, Luck remains.
    expect(findEvent(firstReroll, "ATTACK_REROLLED")).toMatchObject({
      sourceName: "Attack Reroll",
      remainingRerolls: 1
    });

    const secondReroll = applyOk(firstReroll, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: firstReroll.pendingChoice?.id ?? ""
    });
    const rerollEvents = secondReroll.eventLog.filter((event) => event.type === "ATTACK_REROLLED");
    expect(rerollEvents.at(-1)).toMatchObject({
      sourceName: "Luck",
      remainingRerolls: 0
    });

    const resolved = applyOk(secondReroll, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: secondReroll.pendingChoice?.id ?? "",
      candidateIndex: 2
    });
    expect(resolved.pendingChoice).toBeNull();
    // Luck is not consumed on use; it stays active for later attacks this round.
    expect(resolved.activeEffects.map((effect) => effect.name)).toContain("Luck");
    // The reroll replaced the result: the final -1 stands, the earlier +1 is gone.
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({ roll: -1 });
  });

  it("never opens the Crusader reroll when the die shows anything but 0", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActiveUnit(state, "p1", "unit_p1_crusaders");
    scriptDice(state, [1]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_crusaders",
      destination: 10
    });
    // The attack rolls +1: 'reroll every "0"' has nothing to reroll, the
    // attack resolves straight through.
    const first = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_vampires"
    });
    expect(first.pendingChoice).toBeNull();
    expect(findEvent(first, "ATTACK_ROLLED")).toMatchObject({ roll: 1 });
  });

  // FLIPPED 2026-08-10 (was "keeps offering the Crusader reroll on new 0s"):
  // an "[unit_attack]" icon ability activates ONCE PER ATTACK, so a reroll into
  // a second gated face no longer re-opens the offer. The Crusaders' printed
  // "every 0" is read as "every die showing 0 in this one roll" — which the
  // whole-roll reroll already covers. See src/engine/attack-icon-once-per-attack.test.ts.
  it("spends the Crusader reroll once per attack and only lets the latest roll be kept", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActiveUnit(state, "p1", "unit_p1_crusaders");
    scriptDice(state, [0, 0, -1]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_crusaders",
      destination: 10
    });
    const pending = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_vampires"
    });
    expect(pending.pendingChoice).toMatchObject({ type: "ATTACK_DIE_REROLL", remainingRerolls: 1 });

    const rerolledToZero = applyOk(pending, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? ""
    });
    // 0 again — but the one per-attack use is spent, so the offer is gone and
    // a forged second reroll is rejected.
    expect(rerolledToZero.pendingChoice).toMatchObject({ remainingRerolls: 0 });
    const refusedReroll = applyAction(rerolledToZero, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: rerolledToZero.pendingChoice?.id ?? ""
    });
    expect(refusedReroll.errors).not.toEqual([]);

    const refused = applyAction(rerolledToZero, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: rerolledToZero.pendingChoice?.id ?? "",
      candidateIndex: 0
    });
    // Rejected at the legality gate: earlier candidates are no longer offered.
    expect(refused.errors).not.toEqual([]);

    const resolved = applyOk(rerolledToZero, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: rerolledToZero.pendingChoice?.id ?? "",
      candidateIndex: 1
    });
    // The rerolled 0 stands — the third scripted die (-1) is never thrown.
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({ roll: 0 });
  });

  it("rolls two dice and resolves the higher for advantage units (neutral Crusaders)", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Stand in for the neutral Crusaders' printed "roll 2 Attack dice and
    // resolve the higher outcome".
    state.combat.units.unit_p1_griffins.abilities = ["attack-roll-advantage"];
    setActiveUnit(state, "p1", "unit_p1_griffins");
    scriptDice(state, [-1, 1]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const resolved = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });

    expect(findEvent(resolved, "UNIT_ATTACK_DECLARED")).toMatchObject({ rollMode: "advantage" });
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({
      rollMode: "advantage",
      rolls: [-1, 1],
      roll: 1
    });
  });

  it("keeps one-shot reroll effects like Fortune when the player declines to reroll", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["spell.fortune"];
    state.players.p2.hand = [];
    scriptDice(state, [1]);

    const fortune = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.fortune",
      target: { type: "none" }
    });
    const moved = applyOk(fortune, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const pending = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    expect(pending.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");

    // Rerolling is optional: keeping the original roll spends nothing.
    const resolved = applyOk(pending, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? "",
      candidateIndex: 0
    });
    expect(resolved.pendingChoice).toBeNull();
    expect(resolved.activeEffects.map((effect) => effect.name)).toContain("Fortune");
  });

  it("Cure heals by Power and removes negative effects and the Paralysis token", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["spell.cure"];
    state.players.p2.hand = [];
    const griffins = state.combat.units.unit_p1_griffins;
    griffins.damage = 3;
    // A Paralysis token (as left by an enemy Blind/Medusa) on the target unit…
    griffins.tokens = [{ id: "tok_paralysis", kind: "paralysis", amount: 0, sourceName: "Blind" }];
    // …plus a represented negative effect (Curse).
    state.activeEffects.push({
      id: "effect_curse",
      name: "Curse",
      scope: "unit",
      duration: { type: "combat" },
      polarity: "negative",
      removable: true,
      modifiers: [{ type: "ATTACK_BONUS", amount: -1 }],
      source: { type: "system" },
      controllerId: "p2",
      target: { type: "unit", unitId: "unit_p1_griffins" },
      startedRound: state.round,
      startedCombatRound: state.combat.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });

    const result = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.cure",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    // Power 0 (no Power cards) heals exactly 1 — the card no longer bakes in a
    // +1 Power that used to heal 2 at base.
    expect(result.combat?.units.unit_p1_griffins.damage).toBe(2);
    expect(findEvent(result, "DAMAGE_HEALED")).toMatchObject({
      amount: 1
    });
    // Both the negative effect AND the Paralysis token are removed.
    expect(result.activeEffects).toEqual([]);
    expect(result.combat?.units.unit_p1_griffins.tokens ?? []).toHaveLength(0);
    expect(findEvent(result, "ACTIVE_EFFECTS_REMOVED")).toMatchObject({
      effectIds: ["effect_curse"]
    });
  });

  it("places Sandro's Cloak on the Pack of Skeletons and replaces its statistics", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p2.hand = ["specialty.sandro.1"];
    state.players.p1.hand = [];
    // Specialty cards play at your own unit's activation.
    setActiveUnit(state, "p2", "unit_p2_skeletons");

    const transformPlay = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.sandro.1"
    );
    expect(transformPlay).toBeDefined();

    const transformed = applyOk(state, transformPlay!.action);
    // The covering card's statistics apply; the base `name` stays "Skeletons"
    // so the card under the Cloak is still identifiable, the upgrade shows in
    // `cardName`. (Sandbox runs BINH house rules, so the Horde of Skeletons
    // fights with 3 HP instead of the printed 2 — see specialtyTransformHealth.)
    expect(transformed.combat?.units.unit_p2_skeletons).toMatchObject({
      name: "Skeletons",
      cardName: "Horde of Skeletons",
      attack: 3,
      defense: 1,
      maxHealth: 3,
      initiative: 6
    });
    expect(transformed.combat?.units.unit_p2_skeletons.transforms?.at(-1)).toMatchObject({
      cardId: "specialty.sandro.1",
      name: "Horde of Skeletons"
    });
    expect(findEvent(transformed, "UNIT_TRANSFORMED")).toMatchObject({
      unitId: "unit_p2_skeletons",
      newName: "Horde of Skeletons"
    });
  });

  it("creates a First Aid Tent permanent effect and limits healing to once each combat round", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["war_machine.first_aid_tent"];
    state.combat.units.unit_p1_griffins.damage = 2;

    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    // The war machine is a permanent: it stays in play instead of discarding.
    expect(played.players.p1.permanents).toEqual(["war_machine.first_aid_tent"]);
    expect(played.players.p1.discard).toHaveLength(0);
    const tent = played.activeEffects.find((effect) => effect.name === "First Aid Tent");
    expect(tent).toBeDefined();
    expect(tent?.duration).toEqual({ type: "combat" });

    const healed = applyOk(played, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId: tent?.id ?? "",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
    expect(healed.combat?.units.unit_p1_griffins.damage).toBe(1);

    const secondUse = applyAction(healed, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId: tent?.id ?? "",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
    expect(secondUse.errors).toEqual([
      {
        code: "ACTION_NOT_LEGAL",
        message: "That action is not legal in the current game state."
      }
    ]);

    healed.combat!.activeUnitId = null;
    healed.activePlayerId = "p1";
    const nextRound = applyOk(healed, {
      type: "END_COMBAT_ROUND",
      playerId: "p1"
    });
    const healedAgain = applyOk(nextRound, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId: tent?.id ?? "",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
    expect(healedAgain.combat?.units.unit_p1_griffins.damage).toBe(0);
  });

  it("uses an Ogres-style unit ability as an action that buffs then prevents movement", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_ogres = {
      id: "unit_p1_ogres",
      controllerId: "p1",
      name: "Ogres",
      cardName: "Pack of Ogres",
      variant: "pack",
      grade: "silver",
      type: "ground",
      attack: 3,
      defense: 2,
      maxHealth: 6,
      damage: 0,
      initiative: 5,
      position: 4,
      activatedThisRound: false,
      movedThisActivation: false,
      retaliatedThisRound: false,
      defenseToken: false,
      abilities: ["ogres-attack-token-pack"]
    };
    setActiveUnit(state, "p1", "unit_p1_ogres");

    // The token "other action" is offered as a SINGLE open-the-picker command
    // (no specific target) — not one button per candidate unit. The player then
    // clicks a unit on the board, which the engine models as an
    // ABILITY_TARGET_CHOICE the controller resolves with CHOOSE_ABILITY_TARGET.
    const legalAbility = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "USE_UNIT_ABILITY" &&
        legal.action.abilityId === "ogres-attack-token-pack"
    );
    expect(legalAbility?.action).toMatchObject({
      type: "USE_UNIT_ABILITY",
      unitId: "unit_p1_ogres",
      target: { type: "none" }
    });
    // There is exactly one such command — never a wall of one-per-target buttons.
    expect(
      getLegalActions(state, "p1").filter(
        (legal) =>
          legal.action.type === "USE_UNIT_ABILITY" &&
          legal.action.abilityId === "ogres-attack-token-pack"
      )
    ).toHaveLength(1);

    const picking = applyOk(state, legalAbility!.action);
    // Opening the picker does NOT yet end the activation or place a token.
    expect(picking.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(picking.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && picking.pendingChoice.kind).toBe("place-token");
    expect(picking.combat?.units.unit_p1_ogres.activatedThisRound).toBe(false);
    expect(picking.combat?.units.unit_p1_griffins.tokens ?? []).toHaveLength(0);

    const choiceId = picking.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? picking.pendingChoice.id : "";
    const used = applyOk(picking, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId,
      targetUnitId: "unit_p1_griffins"
    });

    // The token action replaces the attack and ends the activation.
    expect(used.combat?.units.unit_p1_ogres.activatedThisRound).toBe(true);

    // The Attack token sits on the buffed unit: +2 attack for 2 combat rounds.
    const tokens = used.combat?.units.unit_p1_griffins.tokens ?? [];
    expect(tokens).toEqual([
      expect.objectContaining({ kind: "attack", amount: 2, expiresAtCombatRoundEnd: 2 })
    ]);

    // A second, weaker Attack token never replaces the better one.
    const fewOgres = { ...used.combat!.units.unit_p1_ogres, id: "unit_p1_ogres_few", abilities: ["ogres-attack-token-few"], activatedThisRound: false };
    used.combat!.units.unit_p1_ogres_few = fewOgres;
    used.combat!.activeUnitId = "unit_p1_ogres_few";
    used.activePlayerId = "p1";
    const openFew = getLegalActions(used, "p1").find(
      (legal) =>
        legal.action.type === "USE_UNIT_ABILITY" &&
        legal.action.abilityId === "ogres-attack-token-few"
    );
    const pickingFew = applyOk(used, openFew!.action);
    const fewChoiceId = pickingFew.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? pickingFew.pendingChoice.id : "";
    const restacked = applyOk(pickingFew, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: fewChoiceId,
      targetUnitId: "unit_p1_griffins"
    });
    const tokensAfter = restacked.combat?.units.unit_p1_griffins.tokens ?? [];
    expect(tokensAfter).toHaveLength(1);
    expect(tokensAfter[0]).toMatchObject({ kind: "attack", amount: 2 });
  });

  it("applies Behemoths' defense reduction to their attack damage", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    Object.assign(state.combat.units.unit_p1_griffins, {
      name: "Behemoths",
      cardName: "Pack of Behemoths",
      variant: "pack",
      grade: "gold",
      type: "ground",
      attack: 7,
      defense: 2,
      maxHealth: 10,
      damage: 0,
      initiative: 9,
      position: 8,
      abilities: ["behemoth-defense-crush-pack"]
    });
    Object.assign(state.combat.units.unit_p2_dread_knights, {
      defense: 2,
      maxHealth: 7,
      damage: 0,
      position: 9
    });
    setActiveUnit(state, "p1", "unit_p1_griffins");
    scriptDice(state, [0]);

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_dread_knights"
    });
    const result = passAllReactions(declared);

    expect(findEvent(result, "UNIT_ABILITY_TRIGGERED")).toMatchObject({
      abilityId: "behemoth-defense-crush-pack",
      targetUnitId: "unit_p2_dread_knights"
    });
    expect(findEvent(result, "ATTACK_ROLLED")).toMatchObject({
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_dread_knights",
      attackValue: 7,
      defenseValue: 0,
      damage: 7
    });
    expect(result.combat?.units.unit_p2_dread_knights.damage).toBe(7);
  });

  it("lets Wolf Raiders strike a second time after the target retaliates", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // The p1 Griffins stand in for a Pack of Wolf Raiders (their printed second
    // strike). Fatten them so the Vampires' Retaliation can't fell them before
    // the follow-up, and make the Vampires a soft, plain target.
    Object.assign(state.combat.units.unit_p1_griffins, {
      name: "Wolf Raiders",
      cardName: "Pack of Wolf Raiders",
      variant: "pack",
      type: "ground",
      attack: 2,
      defense: 0,
      maxHealth: 12,
      damage: 0,
      abilities: ["wolf-raiders-strike-twice"]
    });
    Object.assign(state.combat.units.unit_p2_vampires, {
      attack: 1,
      defense: 0,
      maxHealth: 20,
      damage: 0,
      defenseToken: false,
      abilities: []
    });
    scriptDice(state, [0, 0, 0, 0]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const resolved = passAllReactions(
      applyOk(moved, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_vampires"
      })
    );

    // The engine announces the printed second strike exactly once...
    const strikeTwice = resolved.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "wolf-raiders-strike-twice"
    );
    expect(strikeTwice).toHaveLength(1);

    // ...and the Wolf Raiders actually attack the Vampires TWICE.
    const wolfHits = resolved.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" &&
        event.attackerId === "unit_p1_griffins" &&
        event.defenderId === "unit_p2_vampires"
    );
    expect(wolfHits).toHaveLength(2);

    // The second strike provokes no further Retaliation (only one in the exchange).
    const retaliations = resolved.eventLog.filter((event) => event.type === "RETALIATION_ATTACKED");
    expect(retaliations).toHaveLength(1);

    // Two hits of attack 2 against defense 0 → 4 damage on the Vampires.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(4);
  });

  it("allows opening simultaneous town actions before ordered turns begin", () => {
    const state = createInitialGameState();
    state.phase = "simultaneous-turns";
    state.combat = null;

    expect(getLegalActions(state, "p2").map((legal) => legal.action.type)).toContain("BUILD_STRUCTURE");

    const built = applyOk(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: "town_p2",
      buildingId: "marketplace"
    });
    expect(built.players.p2.resources.gold).toBe(8);
    expect(built.players.p2.resources.buildingMaterials).toBe(4);
    expect(built.players.p2.resources.valuables).toBe(2);
    expect(built.towns.town_p2.buildings).toContain("marketplace");

    const p1Done = applyOk(built, { type: "COMPLETE_SIMULTANEOUS_TURN", playerId: "p1" });
    const roundAdvanced = applyOk(p1Done, { type: "COMPLETE_SIMULTANEOUS_TURN", playerId: "p2" });

    expect(roundAdvanced.round).toBe(2);
    expect(roundAdvanced.turn.mode).toBe("simultaneous");
    expect(roundAdvanced.turn.completedPlayerIds).toEqual([]);
  });

  it("switches from simultaneous setup to ordered observable turns after round four", () => {
    const state = createInitialGameState();
    state.phase = "simultaneous-turns";
    state.combat = null;
    state.round = 4;

    const p1Done = applyOk(state, { type: "COMPLETE_SIMULTANEOUS_TURN", playerId: "p1" });
    const ordered = applyOk(p1Done, { type: "COMPLETE_SIMULTANEOUS_TURN", playerId: "p2" });

    expect(ordered.round).toBe(4);
    expect(ordered.phase).toBe("player-turn");
    expect(ordered.turn.mode).toBe("ordered");
    expect(ordered.activePlayerId).toBe("p1");
    expect(ordered.turn.observingPlayerId).toBe("p1");
    expect(findEvent(ordered, "ORDERED_TURNS_STARTED")).toMatchObject({
      activePlayerId: "p1"
    });
  });

  it("rejects illegal actions with a useful rules error", () => {
    const state = createInitialGameState();
    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_vampires",
      defenderId: "unit_p1_griffins"
    });

    expect(result.state).toBe(state);
    expect(result.errors).toEqual([
      {
        code: "ACTION_NOT_LEGAL",
        message: "That action is not legal in the current game state."
      }
    ]);
  });

  it("builds a player view without leaking opponent hands, deck order, or reaction choices", () => {
    const state = arrowState();
    state.decks = {
      p1: {
        id: "p1",
        drawPile: ["spell.magic_arrow", "ability.resistance"],
        discardPile: ["spell.magic_arrow"]
      }
    };

    const casted = applyAction(state, castMagicArrow).state;
    const p1View = getPlayerView(casted, "p1");
    const p2View = getPlayerView(casted, "p2");

    expect(p1View.players.p1.hand).toEqual(["stat.power", "stat.power"]);
    expect(p1View.players.p1.handCount).toBe(2);
    expect(p1View.players.p2.hand).toEqual([]);
    expect(p1View.players.p2.handCount).toBe(2);
    expect(p1View.decks.p1.drawCount).toBe(2);
    expect(Object.hasOwn(p1View.decks.p1, "drawPile")).toBe(false);
    expect(p1View.players.p1.deck).toEqual([]);
    expect(p1View.players.p1.deckCount).toBe(8);
    expect(p1View.players.p2.deck).toEqual([]);
    expect(p1View.players.p2.deckCount).toBe(7);
    expect(p1View.reactionWindow?.legalReactions.p2).toBeUndefined();
    expect(p1View.reactionWindow?.legalReactions.p1?.[0]?.action).toEqual({
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "basic"
    });
    expect(p2View.reactionWindow?.legalReactions.p2?.[0]?.action).toEqual({
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.resistance",
      mode: "basic"
    });

    p2View.players.p2.hand.push("spell.magic_arrow");
    expect(casted.players.p2.hand).toEqual(["ability.resistance", "stat.defense"]);
  });

  it("uses the real six-face attack die (two -1, two 0, two +1) for unscripted rolls", () => {
    expect(ATTACK_DIE_FACES).toEqual([-1, -1, 0, 0, 1, 1]);

    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    expect(state.combat.dice.faces).toEqual([-1, -1, 0, 0, 1, 1]);
    expect(state.combat.dice.scriptedRolls).toBeUndefined();

    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const attacked = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });

    const rolled = findEvent(attacked, "ATTACK_ROLLED");
    expect(rolled).toBeDefined();
    expect([-1, 0, 1]).toContain(rolled?.roll);
    expect(attacked.combat?.dice.rollCount).toBeGreaterThan(0);
  });

  it("rolls a deterministic attack-die sequence from the combat seed", () => {
    const rollFirstAttack = (seed: string): number | undefined => {
      const state = createInitialGameState(seed);
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      const moved = applyOk(state, {
        type: "MOVE_UNIT",
        playerId: "p1",
        unitId: "unit_p1_griffins",
        destination: 10
      });
      const attacked = applyOk(moved, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_vampires"
      });
      return findEvent(attacked, "ATTACK_ROLLED")?.roll;
    };

    expect(rollFirstAttack("seed-alpha")).toBe(rollFirstAttack("seed-alpha"));
  });

  it("measures movement orthogonally so diagonal steps cost two spaces", () => {
    expect(getBattlefieldDistance(0, 1)).toBe(1);
    expect(getBattlefieldDistance(0, 4)).toBe(1);
    expect(getBattlefieldDistance(0, 5)).toBe(2);

    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    // Marksmen have an orthogonal move range of 1 and start at position 1.
    setActiveUnit(state, "p1", "unit_p1_marksmen");

    const destinations = getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .filter((action): action is Extract<GameAction, { type: "MOVE_UNIT" }> => action.type === "MOVE_UNIT")
      .map((action) => action.destination);

    expect(destinations).toContain(0);
    expect(destinations).toContain(2);
    expect(destinations).not.toContain(4); // diagonal
    expect(destinations).not.toContain(6); // two steps
  });

  it("gives melee and flying units 3 movement points and ranged units 1", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }

    expect(getUnitMoveRange(state.combat.units.unit_p1_griffins)).toBe(3); // flying
    expect(getUnitMoveRange(state.combat.units.unit_p1_crusaders)).toBe(3); // ground
    expect(getUnitMoveRange(state.combat.units.unit_p1_marksmen)).toBe(1); // ranged
  });

  it("lets a ranged unit reposition after shooting", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActiveUnit(state, "p1", "unit_p1_marksmen");
    scriptDice(state, [-1, -1]);

    const shot = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_vampires"
    });

    // The shooter stays active and may still spend its 1-space move.
    expect(shot.combat?.activeUnitId).toBe("unit_p1_marksmen");
    expect(shot.combat?.units.unit_p1_marksmen.attackedThisActivation).toBe(true);
    expect(shot.combat?.units.unit_p1_marksmen.activatedThisRound).toBe(false);

    const actionsAfterShot = getLegalActions(shot, "p1").map((legal) => legal.action.type);
    expect(actionsAfterShot).toContain("MOVE_UNIT");
    expect(actionsAfterShot).toContain("END_ACTIVATION");
    expect(actionsAfterShot).not.toContain("ATTACK_UNIT");
    expect(actionsAfterShot).not.toContain("DEFEND_UNIT");

    const moved = applyOk(shot, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_marksmen",
      destination: 0
    });

    // After moving, the ranged unit's activation is complete.
    expect(moved.combat?.units.unit_p1_marksmen.position).toBe(0);
    expect(moved.combat?.units.unit_p1_marksmen.activatedThisRound).toBe(true);
    expect(moved.combat?.activeUnitId).not.toBe("unit_p1_marksmen");
  });

  it("ends a ranged unit's activation immediately when it moves without shooting", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActiveUnit(state, "p1", "unit_p1_marksmen");

    // "Move up to 1 space without attacking": the move spends the activation.
    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_marksmen",
      destination: 2
    });
    expect(moved.combat?.units.unit_p1_marksmen.movedThisActivation).toBe(true);
    expect(moved.combat?.units.unit_p1_marksmen.activatedThisRound).toBe(true);
    expect(moved.combat?.activeUnitId).not.toBe("unit_p1_marksmen");

    // A ranged unit can never move first and then attack.
    const sneakyShot = applyAction(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_vampires"
    });
    expect(sneakyShot.errors).not.toEqual([]);
  });

  it("plays several attack instants in one batch and rolls the die only after all buffs commit", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["stat.attack", "stat.attack", "ability.offense", "artifact.centaurs_axe"];
    state.players.p2.hand = ["stat.defense", "artifact.buckler_of_the_gnoll_king"];
    setActiveUnit(state, "p1", "unit_p1_griffins");
    scriptDice(state, [0]);

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const declared = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    expect(declared.phase).toBe("reaction");
    expect(declared.reactionWindow?.priorityPlayerId).toBe("p1");

    // Attacker drops three attack instants at once (two copies of the same
    // statistic plus an ability), keeping the artifact in hand.
    const attackerBatch = applyOk(declared, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: "stat.attack", mode: "basic" },
        { cardId: "stat.attack", mode: "basic" },
        { cardId: "ability.offense", mode: "basic" }
      ]
    });
    expect(attackerBatch.stack.at(-1)?.modifiers.attackBonus).toBe(3);
    expect(attackerBatch.players.p1.discard).toEqual(["stat.attack", "stat.attack", "ability.offense"]);
    // No dice rolled yet: the defender still gets a chance to respond.
    expect(findEvent(attackerBatch, "ATTACK_ROLLED")).toBeUndefined();
    // The attacker keeps priority to commit more instants (they still hold the
    // Centaur's Axe); passing hands the window to the defender.
    expect(attackerBatch.reactionWindow?.priorityPlayerId).toBe("p1");
    const attackerDone = passPriority(attackerBatch);
    expect(attackerDone.reactionWindow?.priorityPlayerId).toBe("p2");

    // Defender answers with both defense instants at once. The Buckler is an
    // "OR" card; its option 1 is the plain "+1 defense" side.
    const defenderBatch = applyOk(attackerDone, {
      type: "PLAY_REACTIONS",
      playerId: "p2",
      plays: [
        { cardId: "stat.defense", mode: "basic" },
        { cardId: "artifact.buckler_of_the_gnoll_king", mode: "basic", optionIndex: 1 }
      ]
    });
    expect(defenderBatch.stack.at(-1)?.modifiers.defenseBonus).toBe(2);
    expect(findEvent(defenderBatch, "ATTACK_ROLLED")).toBeUndefined();
    // The attacker still holds a legal instant, so the window stays open.
    expect(defenderBatch.reactionWindow?.priorityPlayerId).toBe("p1");

    const resolved = passAllReactions(defenderBatch);
    const rolled = findEvent(resolved, "ATTACK_ROLLED");

    // Griffins 3 attack + 3 buffs + 0 roll vs Vampires 1 defense + 2 buffs.
    expect(rolled).toMatchObject({
      attackBonus: 3,
      defenseBonus: 2,
      attackValue: 6,
      defenseValue: 3,
      damage: 3
    });

    // The roll happened strictly after every card play in the event log.
    const eventTypes = resolved.eventLog.map((event) => event.type);
    const lastCardPlayed = eventTypes.lastIndexOf("CARD_PLAYED");
    expect(eventTypes.indexOf("ATTACK_ROLLED")).toBeGreaterThan(lastCardPlayed);
  });

  it("rejects batches that overspend crowns or sneak in spell-enders", () => {
    const state = arrowState();
    state.players.p1.limits.expertUses = 1;
    const casted = applyAction(state, castMagicArrow).state;

    // With only one crown, two expert plays must fail as one declaration.
    const overspent = applyAction(casted, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: "stat.power", mode: "expert" },
        { cardId: "stat.power", mode: "expert" }
      ]
    });
    expect(overspent.errors[0]?.message).toContain("crowns");

    // Empower stacks: the rulebook pays thresholds with several plays
    // ("You may pay this cost by playing other cards").
    const doublePower = applyAction(casted, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: "stat.power", mode: "basic" },
        { cardId: "stat.power", mode: "basic" }
      ]
    });
    expect(doublePower.errors).toEqual([]);
    expect(doublePower.state.stack.at(-1)?.modifiers.spellPowerBonus).toBe(2);

    // A single copy still applies.
    const singlePower = applyOk(casted, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "stat.power", mode: "basic" }]
    });
    expect(singlePower.stack.at(-1)?.modifiers.spellPowerBonus).toBe(1);

    const p1Passed = passPriority(casted);
    const sneakyCancel = applyAction(p1Passed, {
      type: "PLAY_REACTIONS",
      playerId: "p2",
      plays: [{ cardId: "ability.resistance", mode: "basic" }]
    });
    expect(sneakyCancel.errors[0]?.message).toContain("on their own");
  });

  it("lets expert Resistance end a spell of any power, while basic stays capped", () => {
    const casted = applyAction(arrowState(), castMagicArrow).state;
    const powered = applyOk(casted, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "expert"
    });
    // The caster keeps priority while empowering; pass to let the defender
    // answer the final power-3 spell.
    const handed = passPriority(powered);

    // Spell is now power 3. Basic Resistance (cap 1) must be rejected.
    const basicAttempt = applyAction(handed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.resistance",
      mode: "basic"
    });
    expect(basicAttempt.errors).not.toEqual([]);

    // Expert Resistance always ends the spell.
    const result = applyOk(handed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.resistance",
      mode: "expert"
    });
    expect(result.reactionWindow).toBeNull();
    expect(result.stack).toEqual([]);
    expect(result.combat?.units.unit_p2_vampires.damage).toBe(0);
    expect(result.players.p2.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(findEvent(result, "SPELL_CAST_CANCELLED")).toMatchObject({
      cancelledByCardId: "ability.resistance"
    });
  });

  it("lets an OR artifact choose +1 Power during a spell or draw a card outside one", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow", "artifact.breastplate_of_petrified_wood"];
    state.players.p2.hand = [];

    // Option 2 (+1 Power) is offered inside the caster's spell window.
    const casted = applyOk(state, castMagicArrow);
    const reactions = getLegalActions(casted, "p1");
    const powerOption = reactions.find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.breastplate_of_petrified_wood" &&
        legal.action.optionIndex === 1
    );
    expect(powerOption).toBeDefined();

    // With no other reactions left the window closes and the spell resolves
    // immediately at boosted power.
    const boosted = applyOk(casted, powerOption!.action);
    expect(findEvent(boosted, "CARD_PLAYED")).toMatchObject({
      cardId: "artifact.breastplate_of_petrified_wood",
      optionLabel: "+1 Power"
    });
    expect(findEvent(boosted, "SPELL_CAST_RESOLVED")).toMatchObject({ power: 1 });

    // Fresh state: option 1 (Draw 1 card) plays as a direct instant.
    const drawState = createInitialGameState();
    drawState.players.p1.hand = ["artifact.breastplate_of_petrified_wood"];
    drawState.players.p2.hand = [];
    const deckBefore = drawState.players.p1.deck.length;

    const drawn = applyOk(drawState, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.breastplate_of_petrified_wood",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(drawn.players.p1.deck.length).toBe(deckBefore - 1);
    expect(drawn.players.p1.hand.length).toBe(1);
    expect(drawn.players.p1.discard).toEqual(["artifact.breastplate_of_petrified_wood"]);
    expect(findEvent(drawn, "CARDS_DRAWN")).toMatchObject({
      playerId: "p1",
      count: 1
    });
  });

  it("reshuffles the discard pile into the draw deck when a draw runs dry", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["artifact.breastplate_of_petrified_wood"];
    state.players.p1.deck = [];
    state.players.p1.discard = ["stat.attack", "stat.defense"];
    state.players.p2.hand = [];

    const drawn = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.breastplate_of_petrified_wood",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });

    // The resolving card is held out. Only the two OLD discard cards become
    // the new deck; one is drawn and one remains there.
    expect(findEvent(drawn, "CARDS_DRAWN")).toMatchObject({ count: 1, reshuffledDiscard: true });
    expect(drawn.players.p1.hand.length).toBe(1);
    expect(drawn.players.p1.deck.length).toBe(1);
    expect(drawn.players.p1.discard).toEqual(["artifact.breastplate_of_petrified_wood"]);
  });

  it("searches a shared deck, keeps one reveal, and discards the rest", () => {
    const state = createInitialGameState();
    state.players.p2.hand = [];
    const spellsBefore = [...state.decks.spells.drawPile];

    const searching = applyOk(state, {
      type: "SEARCH_DECK",
      playerId: "p1",
      deckId: "spells",
      count: 2
    });
    expect(searching.phase).toBe("choice");
    expect(searching.pendingChoice).toMatchObject({ type: "DECK_SEARCH", playerId: "p1" });
    // An empty shared discard is seeded first, then Search (2) reveals the next
    // two cards.
    expect(searching.decks.spells.drawPile.length).toBe(spellsBefore.length - 3);

    // Opponents never see which cards were lifted off the deck.
    const p2View = getPlayerView(searching, "p2");
    expect(
      p2View.pendingChoice?.type === "DECK_SEARCH" ? p2View.pendingChoice.revealedCardIds : []
    ).toEqual(["hidden", "hidden"]);

    const choice = searching.pendingChoice;
    if (choice?.type !== "DECK_SEARCH") {
      throw new Error("Expected a deck search choice.");
    }

    const handBefore = searching.players.p1.hand.length;
    const resolved = applyOk(searching, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: choice.id,
      pick: { kind: "revealed", index: 0 }
    });

    expect(resolved.phase).toBe("combat");
    expect(resolved.players.p1.hand.length).toBe(handBefore + 1);
    expect(resolved.players.p1.hand).toContain(choice.revealedCardIds[0]);
    expect(resolved.decks.spells.discardPile).toEqual([
      spellsBefore.at(-1),
      choice.revealedCardIds[1]
    ]);

    // A later search, with the discard now non-empty, first raises the
    // Search-or-take-discard choice — the player must commit to one before any
    // deck cards are revealed, so they can never both peek and take the discard.
    const searchingAgain = applyOk(resolved, {
      type: "SEARCH_DECK",
      playerId: "p1",
      deckId: "spells",
      count: 2
    });
    const preChoice = searchingAgain.pendingChoice;
    if (preChoice?.type !== "OPTION_CHOICE" || preChoice.context !== "deck-search-mode") {
      throw new Error("Expected the Search-or-take-discard choice.");
    }
    // No deck cards are lifted while the choice is open (nothing revealed yet).
    const drawBefore = searchingAgain.decks.spells.drawPile.length;

    // Option 1 takes the top of the discard pile without revealing the deck.
    const tookDiscard = applyOk(searchingAgain, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: preChoice.id,
      optionIndex: 1
    });
    expect(tookDiscard.players.p1.hand).toContain(choice.revealedCardIds[1]);
    // A shared discard pile is never left empty: taking its last card exposes
    // the card that Search auto-seeded before revealing its two candidates.
    // No additional draw card is consumed at this point.
    expect(tookDiscard.decks.spells.discardPile).toHaveLength(1);
    expect(tookDiscard.decks.spells.discardPile[0]).toBe(spellsBefore.at(-1));
    expect(tookDiscard.decks.spells.drawPile.length).toBe(drawBefore);
    expect(tookDiscard.pendingChoice).toBeNull();
  });

  it("keeps a Scouting search-size override for the search branch and intact when taking the discard top", () => {
    const addScouting = (state: GameState): void => {
      state.activeEffects.push(
        makeActiveEffect(
          state,
          {
            name: "Scouting (test)",
            scope: "player",
            duration: { type: "current-turn" },
            modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 3 }]
          },
          { type: "card", cardId: "ability.scouting", controllerId: "p1" },
          "p1"
        )
      );
    };

    // Branch A — searching reveals the OVERRIDDEN count (3), not the base 2.
    const searchState = (() => {
      const s = createInitialGameState();
      s.players.p2.hand = [];
      s.decks.spells.discardPile = [s.decks.spells.drawPile.pop()!];
      addScouting(s);
      return s;
    })();
    const preA = applyOk(searchState, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    if (preA.pendingChoice?.type !== "OPTION_CHOICE" || preA.pendingChoice.context !== "deck-search-mode") {
      throw new Error("Expected the Search-or-take-discard choice.");
    }
    const searched = applyOk(preA, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: preA.pendingChoice.id,
      optionIndex: 0
    });
    if (searched.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("Expected a deck search reveal.");
    }
    expect(searched.pendingChoice.revealedCardIds).toHaveLength(3);

    // Branch B — taking the discard top does not consume the override.
    const takeState = (() => {
      const s = createInitialGameState();
      s.players.p2.hand = [];
      s.decks.spells.discardPile = [s.decks.spells.drawPile.pop()!];
      addScouting(s);
      return s;
    })();
    const preB = applyOk(takeState, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    if (preB.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("Expected the Search-or-take-discard choice.");
    }
    const tookTop = applyOk(preB, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: preB.pendingChoice.id,
      optionIndex: 1
    });
    expect(tookTop.activeEffects.some((effect) => effect.modifiers.some((m) => m.type === "SEARCH_COUNT_OVERRIDE"))).toBe(
      true
    );
  });

  it("moves a hero across adjacent map fields and spends movement points", () => {
    const state = createInitialGameState();
    state.combat = null;
    state.phase = "player-turn";
    state.turn.mode = "ordered";

    const legalMoves = getLegalActions(state, "p1").filter((legal) => legal.action.type === "MOVE_HERO");
    expect(legalMoves.map((legal) => (legal.action.type === "MOVE_HERO" ? legal.action.to : ""))).toEqual([
      "town_p1",
      "town_p2"
    ]);

    const moved = applyOk(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: "town_p1"
    });
    expect(moved.heroes.hero_p1.spaceId).toBe("town_p1");
    expect(moved.heroes.hero_p1.movementPoints).toBe(2);
    expect(findEvent(moved, "HERO_MOVED")).toMatchObject({
      heroId: "hero_p1",
      from: "field_center",
      to: "town_p1",
      movementLeft: 2
    });

    // Non-adjacent jumps stay illegal.
    const jump = applyAction(moved, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: "town_p2"
    });
    expect(jump.errors).not.toEqual([]);
  });
});

describe("ongoing cards stay in play until their effect ends", () => {
  it("lets the owner discard an Ongoing card and ends its live effect immediately", () => {
    const state = createInitialGameState();
    const effect = makeActiveEffect(
      state,
      {
        name: "Voluntary Ongoing discard probe",
        scope: "player",
        duration: { type: "current-game-round" },
        polarity: "positive",
        removable: false,
        modifiers: []
      },
      { type: "card", cardId: "ability.luck", controllerId: "p1" },
      "p1"
    );
    state.activeEffects.push(effect);
    state.players.p1.ongoingCards = [
      { cardId: "ability.luck", effectIds: [effect.id], returnTo: "discard" }
    ];

    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "DISCARD_ONGOING_CARD" && legal.action.cardId === "ability.luck"
      )
    ).toBe(true);

    const discarded = applyOk(state, {
      type: "DISCARD_ONGOING_CARD",
      playerId: "p1",
      cardId: "ability.luck"
    });

    expect(discarded.activeEffects.some((active) => active.id === effect.id)).toBe(false);
    expect(discarded.players.p1.ongoingCards).toEqual([]);
    expect(discarded.players.p1.discard).toContain("ability.luck");
  });

  // A held ongoing card carries the zone IT must return to: an ongoing Spell
  // recalled by Knowledge/Mysticism is marked "hand", and one cast from the
  // Spell Book "spellBook". Ending it EARLY must respect that — pushing it to
  // the discard leaked a Book Spell out of the Book into the deck cycle.
  it("returns a voluntarily ended Ongoing card to its OWN zone, not always the discard", () => {
    for (const returnTo of ["spellBook", "hand"] as const) {
      const state = createInitialGameState();
      const effect = makeActiveEffect(
        state,
        {
          name: `Recalled ongoing probe (${returnTo})`,
          scope: "player",
          duration: { type: "current-game-round" },
          polarity: "positive",
          removable: false,
          modifiers: []
        },
        { type: "card", cardId: "spell.fly", controllerId: "p1" },
        "p1"
      );
      state.activeEffects.push(effect);
      state.players.p1.ongoingCards = [{ cardId: "spell.fly", effectIds: [effect.id], returnTo }];
      state.players.p1.spellBook = [];
      state.players.p1.hand = [];
      state.players.p1.discard = [];

      const ended = applyOk(state, {
        type: "DISCARD_ONGOING_CARD",
        playerId: "p1",
        cardId: "spell.fly"
      });

      expect(ended.activeEffects.some((active) => active.id === effect.id)).toBe(false);
      expect(ended.players.p1.ongoingCards ?? []).toEqual([]);
      expect(ended.players.p1.discard, `${returnTo} must never reach the discard`).not.toContain("spell.fly");
      expect(returnTo === "spellBook" ? ended.players.p1.spellBook : ended.players.p1.hand).toContain("spell.fly");
    }
  });

  it("holds an ongoing spell out of the discard pile and discards it once the effect is consumed", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["spell.fortune"];
    state.players.p2.hand = [];
    scriptDice(state, [0, 1]);

    const casted = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.fortune",
      target: { type: "none" }
    });

    // Ongoing: the card sits next to the board, not in the discard pile.
    expect(casted.activeEffects.map((effect) => effect.name)).toContain("Fortune");
    expect(casted.players.p1.discard).toEqual([]);
    expect(casted.players.p1.hand).toEqual([]);
    expect(casted.players.p1.ongoingCards).toMatchObject([{ cardId: "spell.fortune", returnTo: "discard" }]);

    const moved = applyOk(casted, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const pending = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    const rerolled = applyOk(pending, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? ""
    });
    const resolved = applyOk(rerolled, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: rerolled.pendingChoice?.id ?? "",
      candidateIndex: 1
    });

    // Fortune was consumed by the reroll: only now the card reaches the
    // discard pile.
    expect(resolved.activeEffects).toEqual([]);
    expect(resolved.players.p1.ongoingCards).toEqual([]);
    expect(resolved.players.p1.discard).toContain("spell.fortune");
  });

  it("returns a Knowledge-recalled ongoing spell to hand only after its effect ends", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["spell.fortune", "stat.knowledge"];
    state.players.p2.hand = [];
    scriptDice(state, [0, 1]);

    const casted = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.fortune",
      target: { type: "none" }
    });
    const recalled = applyOk(casted, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    const settled = passAllReactions(recalled);

    // Knowledge cannot loop the ongoing spell: the card stays in play while
    // its effect lasts, flagged to come back to the hand afterwards.
    expect(settled.players.p1.hand).toEqual([]);
    expect(settled.players.p1.discard).toEqual(["stat.knowledge"]);
    expect(settled.players.p1.ongoingCards).toMatchObject([{ cardId: "spell.fortune", returnTo: "hand" }]);

    const moved = applyOk(settled, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    const pending = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    const rerolled = applyOk(pending, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? ""
    });
    const resolved = applyOk(rerolled, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: rerolled.pendingChoice?.id ?? "",
      candidateIndex: 1
    });

    // Effect consumed -> the recalled card finally returns to the hand.
    expect(resolved.players.p1.ongoingCards).toEqual([]);
    expect(resolved.players.p1.hand).toContain("spell.fortune");
    expect(resolved.players.p1.discard).not.toContain("spell.fortune");
    expect(
      resolved.eventLog.some(
        (event) => event.type === "SPELL_RETURNED_TO_HAND" && event.cardId === "spell.fortune"
      )
    ).toBe(true);
  });

  it("keeps the event log bounded while event ids stay unique", () => {
    const state = createInitialGameState();
    state.eventCounter = 1200;
    state.eventLog = Array.from({ length: 500 }, (_, index) => ({
      id: `evt_${700 + index}`,
      type: "REACTION_PASSED",
      playerId: "p1",
      windowId: "w"
    })) as GameState["eventLog"];
    state.players.p1.hand = [];
    state.players.p2.hand = [];

    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });

    expect(moved.eventLog.length).toBeLessThanOrEqual(500);
    const lastEvent = moved.eventLog.at(-1);
    expect(lastEvent?.type).toBe("UNIT_MOVED");
    expect(Number(lastEvent?.id.slice(4))).toBeGreaterThan(1200);
  });
});
