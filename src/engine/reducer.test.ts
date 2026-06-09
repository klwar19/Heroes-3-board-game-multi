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
import type { GameAction, GameState, PlayerId } from "./state";

const castMagicArrow = {
  type: "CAST_SPELL",
  playerId: "p1",
  cardId: "spell.magic_arrow",
  target: { type: "unit", unitId: "unit_p2_pit_lords" }
} satisfies GameAction;

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
      implementationStatus: "not-implemented"
    });
    expect(spellSchools).toEqual(new Set(["air", "earth", "fire", "water"]));
    expect(artifactTiers).toEqual(new Set(["minor", "major", "relic"]));
    expect(unitGrades).toEqual(new Set(["bronze", "silver", "gold"]));
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

  it("opens a reaction window after a spell is cast, starting with the caster's Power timing", () => {
    const result = applyAction(createInitialGameState(), castMagicArrow);

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("reaction");
    expect(result.state.reactionWindow?.priorityPlayerId).toBe("p1");
    expect(result.state.reactionWindow?.allowedPlayerIds).toEqual(["p1", "p2"]);
    expect(result.state.stack[0]?.status).toBe("waiting-for-reaction");
    expect(findEvent(result.state, "SPELL_CAST_STARTED")).toBeDefined();
    expect(findEvent(result.state, "REACTION_WINDOW_OPENED")).toBeDefined();
  });

  it("resolves Magic Arrow damage after all reactions pass", () => {
    const casted = applyAction(createInitialGameState(), castMagicArrow).state;
    const result = passAllReactions(casted);

    expect(result.phase).toBe("combat");
    expect(result.reactionWindow).toBeNull();
    expect(result.stack).toEqual([]);
    expect(result.combat?.units.unit_p2_pit_lords.damage).toBe(2);
    expect(findEvent(result, "DAMAGE_ASSIGNED")).toMatchObject({
      amount: 2,
      damageKind: "spell"
    });
    expect(findEvent(result, "SPELL_CAST_RESOLVED")).toMatchObject({
      power: 1
    });
  });

  it("ends combat when spell damage defeats the last opposing unit", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }

    state.combat.units.unit_p2_pit_lords.damage = 4;
    state.combat.units.unit_p2_magogs.damage = 3;
    state.combat.units.unit_p2_dread_knights.damage = 6;

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

  it("lets Resistance cancel a pending spell after the caster passes", () => {
    const casted = applyAction(createInitialGameState(), castMagicArrow).state;
    const p1Passed = passPriority(casted);
    const result = applyOk(p1Passed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.resistance"
    });

    expect(result.phase).toBe("combat");
    expect(result.reactionWindow).toBeNull();
    expect(result.stack).toEqual([]);
    expect(result.combat?.units.unit_p2_pit_lords.damage).toBe(0);
    expect(result.players.p2.discard).toContain("ability.resistance");
    expect(findEvent(result, "SPELL_CAST_CANCELLED")).toMatchObject({
      cancelledByPlayerId: "p2",
      cancelledByCardId: "ability.resistance"
    });
  });

  it("uses a crown for expert Power and pushes Magic Arrow above Resistance", () => {
    const casted = applyAction(createInitialGameState(), castMagicArrow).state;
    const powered = applyOk(casted, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "expert"
    });
    const result = applyOk(powered, {
      type: "PASS_REACTION",
      playerId: "p1"
    });

    expect(result.reactionWindow).toBeNull();
    expect(result.combat?.units.unit_p2_pit_lords.damage).toBe(3);
    expect(result.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(result.players.p1.discard).toEqual(["spell.magic_arrow", "stat.power"]);
    expect(findEvent(result, "CARD_PLAYED")).toMatchObject({
      cardId: "stat.power",
      mode: "expert",
      effectAmount: 2
    });
    expect(findEvent(result, "SPELL_CAST_RESOLVED")).toMatchObject({
      power: 3
    });
  });

  it("lets Knowledge recall a just-cast spell and expert increases the combat round spell limit", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow", "stat.knowledge"];
    state.players.p2.hand = [];

    const casted = applyOk(state, castMagicArrow);
    const resolved = applyOk(casted, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.knowledge",
      mode: "expert"
    });

    expect(resolved.phase).toBe("combat");
    expect(resolved.reactionWindow).toBeNull();
    expect(resolved.players.p1.hand).toContain("spell.magic_arrow");
    expect(resolved.players.p1.discard).toEqual(["stat.knowledge"]);
    expect(resolved.players.p1.combatStats.spellLimitBonusThisRound).toBe(1);
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(resolved.combat?.units.unit_p2_pit_lords.damage).toBe(2);
  });

  it("lets a unit move, then attack after Attack and Defense cards modify the roll", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["stat.attack"];
    state.players.p2.hand = ["stat.defense"];
    state.combat.units.unit_p2_pit_lords.damage = 3;
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
      defenderId: "unit_p2_pit_lords"
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
    expect(resolved.combat?.units.unit_p2_pit_lords.damage).toBe(6);
    expect(resolved.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_pit_lords",
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
      defenderId: "unit_p2_pit_lords"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("combat");
    expect(result.state.priorityPlayerId).toBeNull();
    expect(result.state.reactionWindow).toBeNull();
    expect(result.state.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(findEvent(result.state, "RETALIATION_ATTACKED")).toBeDefined();
  });

  it("applies ranged back-row disadvantage by rolling two dice and taking the lower result", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_griffins.activatedThisRound = true;
    setActiveUnit(state, "p1", "unit_p1_elves");
    scriptDice(state, [0, 1]);

    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_elves",
      defenderId: "unit_p2_magogs"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.combat?.units.unit_p2_magogs.damage).toBe(3);
    expect(findEvent(result.state, "ATTACK_ROLLED")).toMatchObject({
      rolls: [0, 1],
      roll: 0,
      rollMode: "disadvantage",
      damage: 3
    });
    expect(findEvent(result.state, "RETALIATION_ATTACKED")).toBeUndefined();
  });

  it("locks ranged units into adjacent targets when an enemy is next to them", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.combat.units.unit_p1_elves.position = 10;
    state.combat.units.unit_p2_pit_lords.position = 14;
    state.combat.units.unit_p1_griffins.activatedThisRound = true;
    setActiveUnit(state, "p1", "unit_p1_elves");

    const legalActions = getLegalActions(state, "p1");
    const attackTargets = legalActions
      .map((legal) => legal.action)
      .filter((action): action is Extract<GameAction, { type: "ATTACK_UNIT" }> => action.type === "ATTACK_UNIT")
      .map((action) => action.defenderId);

    expect(attackTargets).toContain("unit_p2_pit_lords");
    expect(attackTargets).not.toContain("unit_p2_magogs");
  });

  it("applies ranged melee disadvantage by rolling two dice and taking the lower result", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_elves.position = 10;
    state.combat.units.unit_p2_pit_lords.position = 14;
    state.combat.units.unit_p1_griffins.activatedThisRound = true;
    setActiveUnit(state, "p1", "unit_p1_elves");
    scriptDice(state, [0, 1]);

    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_elves",
      defenderId: "unit_p2_pit_lords"
    });

    expect(result.errors).toEqual([]);
    expect(findEvent(result.state, "ATTACK_ROLLED")).toMatchObject({
      rolls: [0, 1],
      roll: 0,
      rollMode: "disadvantage"
    });
  });

  it("ends combat when an attack defeats the last opposing unit", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_griffins.activatedThisRound = true;
    state.combat.units.unit_p2_pit_lords.damage = 6;
    state.combat.units.unit_p2_magogs.damage = 2;
    state.combat.units.unit_p2_dread_knights.damage = 6;
    setActiveUnit(state, "p1", "unit_p1_elves");

    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_elves",
      defenderId: "unit_p2_magogs"
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
        (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.defenderId === "unit_p2_pit_lords"
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

  it("requires non-flying units to use the crossing row before switching sides", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }

    state.activePlayerId = "p2";
    state.combat.activeUnitId = "unit_p2_pit_lords";

    const illegalDirectCrossing = applyAction(state, {
      type: "MOVE_UNIT",
      playerId: "p2",
      unitId: "unit_p2_pit_lords",
      destination: 6
    });
    const legalLaneMove = applyAction(state, {
      type: "MOVE_UNIT",
      playerId: "p2",
      unitId: "unit_p2_pit_lords",
      destination: 10
    });

    expect(illegalDirectCrossing.errors).toEqual([
      {
        code: "ACTION_NOT_LEGAL",
        message: "That action is not legal in the current game state."
      }
    ]);
    expect(legalLaneMove.errors).toEqual([]);
    expect(legalLaneMove.state.combat?.units.unit_p2_pit_lords.position).toBe(10);
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
    expect(result.state.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(findEvent(result.state, "UNIT_DEFENDED")).toBeDefined();
  });

  it("plays an ongoing Archery effect only on the active player's turn and expires it at combat round end", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["ability.archery"];
    state.players.p2.hand = ["ability.archery"];
    state.combat.units.unit_p1_griffins.activatedThisRound = true;
    setActiveUnit(state, "p1", "unit_p1_elves");
    scriptDice(state, [0]);

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
      attackerId: "unit_p1_elves",
      defenderId: "unit_p2_pit_lords"
    });

    expect(resolved.reactionWindow).toBeNull();
    expect(resolved.activeEffects).toHaveLength(1);
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({
      attackerId: "unit_p1_elves",
      defenderId: "unit_p2_pit_lords",
      attackBonus: 1,
      damage: 3
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
      defenderId: "unit_p2_pit_lords"
    });

    expect(pending.phase).toBe("choice");
    expect(pending.pendingChoice).toMatchObject({
      type: "ATTACK_DIE_REROLL",
      playerId: "p1",
      remainingRerolls: 2,
      candidates: [{ roll: 0 }]
    });
    expect(pending.combat?.units.unit_p2_pit_lords.damage).toBe(0);

    const rerolled = applyOk(pending, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: pending.pendingChoice?.id ?? ""
    });
    expect(rerolled.pendingChoice).toMatchObject({
      remainingRerolls: 1,
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
    expect(resolved.combat?.units.unit_p2_pit_lords.damage).toBe(3);
    expect(findEvent(resolved, "ATTACK_REROLLED")).toMatchObject({
      roll: 1
    });
    expect(findEvent(resolved, "ATTACK_ROLLED")).toMatchObject({
      roll: 1,
      damage: 3
    });
  });

  it("lets Cure heal damage and remove represented negative unit effects", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = ["spell.cure"];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_griffins.damage = 3;
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

    expect(result.combat?.units.unit_p1_griffins.damage).toBe(1);
    expect(result.activeEffects).toEqual([]);
    expect(findEvent(result, "DAMAGE_HEALED")).toMatchObject({
      amount: 2
    });
    expect(findEvent(result, "ACTIVE_EFFECTS_REMOVED")).toMatchObject({
      effectIds: ["effect_curse"]
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
    const tent = played.activeEffects.find((effect) => effect.name === "First Aid Tent");
    expect(tent).toBeDefined();
    expect(tent?.duration).toEqual({ type: "permanent" });

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

    const legalAbility = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.target.type === "unit"
    );
    expect(legalAbility?.action).toMatchObject({
      type: "USE_UNIT_ABILITY",
      unitId: "unit_p1_ogres"
    });

    const used = applyOk(state, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: "unit_p1_ogres",
      abilityId: "ogres-attack-token-pack",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    expect(used.combat?.units.unit_p1_ogres.activatedThisRound).toBe(true);
    expect(used.activeEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Ogre Attack Token",
          target: { type: "unit", unitId: "unit_p1_griffins" },
          modifiers: [{ type: "ATTACK_BONUS", amount: 2 }]
        }),
        expect.objectContaining({
          target: { type: "unit", unitId: "unit_p1_ogres" },
          modifiers: [{ type: "UNIT_CANNOT_MOVE" }]
        })
      ])
    );

    used.combat!.activeUnitId = "unit_p1_ogres";
    used.activePlayerId = "p1";
    used.combat!.units.unit_p1_ogres.activatedThisRound = false;

    expect(getLegalActions(used, "p1").some((legal) => legal.action.type === "MOVE_UNIT")).toBe(false);
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
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
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
    const state = createInitialGameState();
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

    expect(p1View.players.p1.hand).toEqual([
      "spell.lightning_bolt",
      "spell.stone_skin",
      "spell.bloodlust",
      "spell.cure",
      "spell.fortune",
      "stat.attack",
      "stat.power",
      "stat.knowledge",
      "ability.archery",
      "ability.offense",
      "ability.luck",
      "artifact.centaurs_axe",
      "artifact.ogres_club_of_havoc",
      "artifact.titans_gladius",
      "war_machine.first_aid_tent"
    ]);
    expect(p1View.players.p1.handCount).toBe(15);
    expect(p1View.players.p2.hand).toEqual([]);
    expect(p1View.players.p2.handCount).toBe(4);
    expect(p1View.decks.p1.drawCount).toBe(2);
    expect(Object.hasOwn(p1View.decks.p1, "drawPile")).toBe(false);
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
    expect(casted.players.p2.hand).toEqual([
      "ability.resistance",
      "stat.defense",
      "stat.attack",
      "artifact.buckler_of_the_gnoll_king"
    ]);
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
      defenderId: "unit_p2_pit_lords"
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
        defenderId: "unit_p2_pit_lords"
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
    // Elves have an orthogonal move range of 1 and start at position 1 (row 0, col 1).
    state.combat.units.unit_p1_griffins.activatedThisRound = true;
    setActiveUnit(state, "p1", "unit_p1_elves");

    const destinations = getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .filter((action): action is Extract<GameAction, { type: "MOVE_UNIT" }> => action.type === "MOVE_UNIT")
      .map((action) => action.destination);

    expect(destinations).toContain(0);
    expect(destinations).toContain(2);
    expect(destinations).not.toContain(4);
    expect(destinations).not.toContain(6);
  });

  it("gives melee and flying units 3 movement points and ranged units 1", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }

    expect(getUnitMoveRange(state.combat.units.unit_p1_griffins)).toBe(3); // flying
    expect(getUnitMoveRange(state.combat.units.unit_p2_pit_lords)).toBe(3); // ground
    expect(getUnitMoveRange(state.combat.units.unit_p1_elves)).toBe(1); // ranged
  });

  it("lets a ranged unit reposition after shooting", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_griffins.activatedThisRound = true;
    setActiveUnit(state, "p1", "unit_p1_elves");
    scriptDice(state, [0]);

    const shot = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_elves",
      defenderId: "unit_p2_pit_lords"
    });

    // The shooter stays active and may still spend its move.
    expect(shot.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(shot.combat?.units.unit_p1_elves.attackedThisActivation).toBe(true);
    expect(shot.combat?.units.unit_p1_elves.activatedThisRound).toBe(false);
    // 2 from the shot (3 attack + 0 roll - 1 defense) plus 1 from the Elves'
    // low-roll extra shot ability (roll of 0).
    expect(shot.combat?.units.unit_p2_pit_lords.damage).toBe(3);

    const elfActions = getLegalActions(shot, "p1").map((legal) => legal.action.type);
    expect(elfActions).toContain("MOVE_UNIT");
    expect(elfActions).toContain("END_ACTIVATION");
    expect(elfActions).not.toContain("ATTACK_UNIT");
    expect(elfActions).not.toContain("DEFEND_UNIT");

    const moved = applyOk(shot, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_elves",
      destination: 0
    });

    // After moving, the ranged unit's activation is complete.
    expect(moved.combat?.units.unit_p1_elves.position).toBe(0);
    expect(moved.combat?.units.unit_p1_elves.activatedThisRound).toBe(true);
    expect(moved.combat?.activeUnitId).not.toBe("unit_p1_elves");
  });

  it("ends a ranged unit's activation when it moves before shooting", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat.units.unit_p1_griffins.activatedThisRound = true;
    setActiveUnit(state, "p1", "unit_p1_elves");
    scriptDice(state, [0]);

    // Move first (range 1), then the unit may still shoot.
    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_elves",
      destination: 2
    });
    expect(moved.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(moved.combat?.units.unit_p1_elves.movedThisActivation).toBe(true);

    const shot = applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_elves",
      defenderId: "unit_p2_pit_lords"
    });

    // Having already moved, the shot ends the activation (no second move).
    expect(shot.combat?.units.unit_p1_elves.activatedThisRound).toBe(true);
    expect(shot.combat?.activeUnitId).not.toBe("unit_p1_elves");
  });
});
