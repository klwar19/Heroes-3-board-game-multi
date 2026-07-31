import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { countBallistas } from "./permanents";
import type { GameAction, GameEvent, GameState, UnitId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, optionIndex?: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (unitId === undefined || (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

function lastRolled(state: GameState, defenderId: UnitId) {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.defenderId === defenderId
    );
}

function attackBonusBy(state: GameState, attackerId: UnitId): number | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId
    )?.attackBonus;
}

function warMachineHits(state: GameState): Extract<GameEvent, { type: "WAR_MACHINE_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "WAR_MACHINE_TRIGGERED" }> => event.type === "WAR_MACHINE_TRIGGERED"
  );
}

// ---------------------------------------------------------------------------
// Solmyr — Chain Lightning (I: 1/1/0, VI: 2/1/1) + the level-IV deck dig.
//
// Board (4 columns): the selected unit takes the leftmost bolt, the rest fork
// to the two units closest to it. Distances are Manhattan (getBattlefieldDistance).
// ---------------------------------------------------------------------------

describe("Solmyr's Chain Lightning", () => {
  /** skeletons(13) is the primary; vampires(14) and dread_knights(9) are its two closest. */
  function chainState(seed: string, cardId: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [cardId];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_vampires.position = 14; // distance 1
    state.combat!.units.unit_p2_dread_knights.position = 9; // distance 1
    state.combat!.units.unit_p1_marksmen.position = 0; // distance 4 — out of the chain
    state.combat!.units.unit_p1_griffins.position = 1; // distance 3 — out of the chain
    state.combat!.units.unit_p1_crusaders.position = 2; // distance 3 — out of the chain
    // Plenty of HP so a bolt never removes a unit and confuses the assertions.
    for (const unit of Object.values(state.combat!.units)) {
      unit.maxHealth = 10;
    }
    return state;
  }

  it("I deals 1 to the selected unit and lets the caster route the second 1 (the third is 0)", () => {
    const state = chainState("solmyr-i", "specialty.solmyr.1");
    const play = findPlay(state, "specialty.solmyr.1", undefined, "unit_p2_skeletons");
    expect(play, "Chain Lightning I should target any unit").toBeTruthy();
    let next = applyOk(state, play!.action);
    // The selected unit takes the leftmost bolt immediately.
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // Two equally-close units → the caster picks who takes the surviving 1.
    expect(next.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    const choice = next.pendingChoice!;
    expect(choice.type === "ABILITY_TARGET_CHOICE" && choice.kind).toBe("chain-lightning");
    expect((choice as { candidateUnitIds: UnitId[] }).candidateUnitIds.sort()).toEqual(
      ["unit_p2_dread_knights", "unit_p2_vampires"]
    );

    next = applyOk(next, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
    // The other closest unit takes the 0 — the chain skips it.
    expect(next.combat!.units.unit_p2_dread_knights.damage).toBe(0);
    expect(next.pendingChoice).toBeNull();
  });

  it("VI deals 2 to the selected unit and 1 to each of the two closest (no choice when exactly two)", () => {
    const state = chainState("solmyr-vi", "specialty.solmyr.6");
    const play = findPlay(state, "specialty.solmyr.6", undefined, "unit_p2_skeletons");
    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(next.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(next.pendingChoice).toBeNull();
  });

  it("VI lets the caster choose which two of three equidistant units are struck (and can spare an ally)", () => {
    const state = chainState("solmyr-vi-tie", "specialty.solmyr.6");
    // A friendly griffins now sits equally close to the primary as the two foes.
    state.combat!.units.unit_p1_griffins.position = 12; // distance 1 from skeletons(13)
    const play = findPlay(state, "specialty.solmyr.6", undefined, "unit_p2_skeletons");
    let next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(2);
    // Three units tie for "closest": the caster picks the first to take a 1.
    let choice = next.pendingChoice!;
    expect(choice.type === "ABILITY_TARGET_CHOICE" && choice.kind).toBe("chain-lightning");
    expect((choice as { candidateUnitIds: UnitId[] }).candidateUnitIds.sort()).toEqual(
      ["unit_p1_griffins", "unit_p2_dread_knights", "unit_p2_vampires"]
    );
    next = applyOk(next, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_vampires"
    });
    // A second pick for the last 1 — route it to the other foe, sparing the ally.
    choice = next.pendingChoice!;
    expect(choice.type).toBe("ABILITY_TARGET_CHOICE");
    next = applyOk(next, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_dread_knights"
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(next.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(next.combat!.units.unit_p1_griffins.damage).toBe(0); // ally spared
    expect(next.pendingChoice).toBeNull();
  });

  it("IV digs the top 3 of your deck and keeps the one you choose, discarding the rest", () => {
    const state = createInitialGameState("solmyr-iv");
    state.players.p1.hand = ["specialty.solmyr.4"];
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"]; // top of pile = last element
    const play = findPlay(state, "specialty.solmyr.4");
    expect(play, "Chain Lightning IV should be playable in combat").toBeTruthy();
    let next = applyOk(state, play!.action);
    // Top three lifted: power (top), defense, attack — the owner chooses.
    expect(next.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(next.players.p1.deck).toEqual([]);
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice!.id,
      optionIndex: 0
    });
    expect(next.players.p1.hand).toEqual(["stat.power"]);
    expect(next.players.p1.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.defense"]));
  });

  it("IV auto-keeps the only card when the deck holds fewer than two", () => {
    const state = createInitialGameState("solmyr-iv-one");
    state.players.p1.hand = ["specialty.solmyr.4"];
    state.players.p1.deck = ["stat.attack"];
    const next = applyOk(state, findPlay(state, "specialty.solmyr.4")!.action);
    expect(next.pendingChoice).toBeNull();
    expect(next.players.p1.hand).toEqual(["stat.attack"]);
    expect(next.players.p1.deck).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cyra — Haste IV (initiative-conditional attack) and VI (initiative buff +
// defense against slower foes).
// ---------------------------------------------------------------------------

describe("Cyra's Haste IV/VI", () => {
  function cyraAttack(seed: string, defenderInitiative: number): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["specialty.cyra.4"];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.position = 9;
    attacker.initiative = 3;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.initiative = defenderInitiative;
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
  }

  it("IV grants +1 attack, doubled to +2 when the attacked unit is faster", () => {
    const faster = applyOk(cyraAttack("cyra-iv-fast", 5), {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "specialty.cyra.4" }]
    });
    expect(attackBonusBy(faster, "unit_p1_griffins")).toBe(2);
  });

  it("IV stays +1 when the attacked unit is not faster", () => {
    const slower = applyOk(cyraAttack("cyra-iv-slow", 1), {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "specialty.cyra.4" }]
    });
    expect(attackBonusBy(slower, "unit_p1_griffins")).toBe(1);
  });

  it("VI buffs initiative by 3 and adds a conditional +1 defense modifier", () => {
    const state = createInitialGameState("cyra-vi");
    state.players.p1.hand = ["specialty.cyra.6"];
    const play = findPlay(state, "specialty.cyra.6", undefined, "unit_p1_griffins");
    expect(play, "Haste VI should target a friendly unit").toBeTruthy();
    const next = applyOk(state, play!.action);
    const effect = next.activeEffects.find(
      (active) => active.target?.type === "unit" && active.target.unitId === "unit_p1_griffins"
    );
    expect(effect, "a unit-scoped Haste effect should exist").toBeTruthy();
    expect(effect!.modifiers).toEqual(
      expect.arrayContaining([
        { type: "INITIATIVE_BONUS", amount: 3 },
        { type: "DEFENSE_VS_LOWER_INITIATIVE", amount: 1 }
      ])
    );
  });

  it("VI's +1 defense applies only against an attacker slower than the buffed unit", () => {
    function defendWith(seed: string, attackerInitiative: number): number | undefined {
      const state = createInitialGameState(seed);
      state.players.p1.hand = ["specialty.cyra.6"];
      state.players.p2.hand = [];
      const guard = state.combat!.units.unit_p1_griffins;
      guard.position = 9;
      guard.initiative = 3; // effective 6 once Haste VI lands
      const attacker = state.combat!.units.unit_p2_skeletons;
      attacker.position = 13;
      attacker.initiative = attackerInitiative;
      const buffed = applyOk(state, findPlay(state, "specialty.cyra.6", undefined, "unit_p1_griffins")!.action);
      buffed.activePlayerId = "p2";
      buffed.combat!.activeUnitId = "unit_p2_skeletons";
      buffed.combat!.dice.scriptedRolls = [0];
      buffed.combat!.dice.rollCount = 0;
      const struck = applyOk(buffed, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p1_griffins"
      });
      return lastRolled(struck, "unit_p1_griffins")?.defenseBonus;
    }

    // Attacker initiative 1 < guard's effective 6 → +1 defense.
    expect(defendWith("cyra-vi-slow", 1)).toBe(1);
    // Attacker initiative 9 > guard's effective 6 → no bonus.
    expect(defendWith("cyra-vi-fast", 9)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Torosar — every level is a current-game-round Ballista grant and is playable
// on the map. IV activates this + one other now; VI activates all.
// ---------------------------------------------------------------------------

describe("Torosar's Ballista specialty", () => {
  function torosarMap(cardId = "specialty.torosar.1"): GameState {
    const state = createAdventureGameState({
      seed: "torosar-map",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Torosar", factionId: "tower", heroDefId: "torosar" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = [cardId];
    return state;
  }

  it.each([1, 4, 6] as const)("level %s is playable on the map and banks a game-round Ballista", (level) => {
    const cardId = `specialty.torosar.${level}`;
    const state = torosarMap(cardId);
    const play = findPlay(state, cardId);
    expect(play, `${cardId} should be offered on the map`).toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(next.players.p1.hand).not.toContain(cardId);
    expect(
      next.activeEffects.some(
        (effect) =>
          effect.controllerId === "p1" &&
          effect.duration.type === "current-game-round" &&
          effect.modifiers.some((modifier) => modifier.type === "EXTRA_BALLISTA")
      )
    ).toBe(true);
  });

  it("I grants the temporary Ballista in combat without an immediate activation", () => {
    const state = createInitialGameState("torosar-i-combat");
    state.players.p1.hand = ["specialty.torosar.1"];
    state.players.p1.permanents = [];
    state.players.p2.hand = [];
    const next = applyOk(state, findPlay(state, "specialty.torosar.1")!.action);
    expect(warMachineHits(next)).toHaveLength(0);
    expect(
      next.activeEffects.some((effect) => effect.modifiers.some((modifier) => modifier.type === "EXTRA_BALLISTA"))
    ).toBe(true);
  });

  it("IV grants one and activates at most two Ballistas immediately", () => {
    const state = createInitialGameState("torosar-iv");
    state.players.p1.hand = ["specialty.torosar.4"];
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p2.hand = [];
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "p2") {
        unit.initiative = 5;
      }
    }
    state.combat!.units.unit_p2_skeletons.initiative = 1;
    const next = applyOk(state, findPlay(state, "specialty.torosar.4")!.action);
    expect(countBallistas(next, "p1")).toBe(2);
    expect(
      next.activeEffects.some(
        (effect) => effect.controllerId === "p1" && effect.modifiers.some((modifier) => modifier.type === "EXTRA_BALLISTA")
      )
    ).toBe(true);
    expect(warMachineHits(next)).toHaveLength(2);
  });

  it("IV's grant expires at the end of the game round (and survives within it)", () => {
    const state = createAdventureGameState({
      seed: "torosar-iv-expire",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Torosar", factionId: "tower", heroDefId: "torosar" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    // A grant gained during round 3 (a resource round).
    state.round = 3;
    state.activeEffects.push({
      id: "effect_grant",
      name: "Ballista",
      scope: "player",
      modifiers: [{ type: "EXTRA_BALLISTA" }],
      duration: { type: "current-game-round" },
      source: { type: "card", cardId: "specialty.torosar.4", controllerId: "p1" },
      controllerId: "p1",
      startedRound: 3,
      expiresAtGameRound: 3,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });

    const hasGrant = () =>
      state.activeEffects.some((effect) => effect.modifiers.some((modifier) => modifier.type === "EXTRA_BALLISTA"));

    // Starting the same round again does not end it.
    startAdventureRound(state);
    expect(hasGrant()).toBe(true);

    // The next game round begins → the grant is gone.
    state.round = 4;
    startAdventureRound(state);
    expect(hasGrant()).toBe(false);
  });

  it("VI fields a game-round Ballista and fires every Ballista now", () => {
    const state = createInitialGameState("torosar-vi");
    state.players.p1.hand = ["specialty.torosar.6"];
    state.players.p1.permanents = ["war_machine.ballista"]; // 1 permanent + the VI grant = 2
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.initiative = 1;
    state.combat!.units.unit_p2_skeletons.maxHealth = 10;
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;
    const next = applyOk(state, findPlay(state, "specialty.torosar.6")!.action);
    // Two Ballistas (permanent + grant) each fire once at the slowest enemy.
    expect(warMachineHits(next)).toHaveLength(2);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(
      next.activeEffects.some((effect) => effect.modifiers.some((modifier) => modifier.type === "EXTRA_BALLISTA"))
    ).toBe(true);
  });

  it("VI works with no permanent Ballista — the granted one alone fires", () => {
    const state = createInitialGameState("torosar-vi-grant-only");
    state.players.p1.hand = ["specialty.torosar.6"];
    state.players.p1.permanents = [];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.initiative = 1;
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;
    const next = applyOk(state, findPlay(state, "specialty.torosar.6")!.action);
    expect(warMachineHits(next)).toHaveLength(1);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });
});
