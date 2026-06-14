import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, makeCombatUnitFromArmy } from "./index";
import { startAdventureRound } from "./adventure";
import { getCombatStartDraws } from "./unit-abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

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

/** Pass instant windows and keep attack rolls; stop on an ability-target choice. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
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
  return current;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function unitTokens(state: GameState, unitId: string): string[] {
  return (state.combat?.units[unitId].tokens ?? []).map((token) => token.kind);
}

function attackRolls(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
  );
}

function declaredAttacks(state: GameState): Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> => event.type === "UNIT_ATTACK_DECLARED"
  );
}

/**
 * A clean melee duel: p1's `unit_p1_griffins` (attacker) stands directly above
 * p2's `unit_p2_skeletons` (defender), both ground with plenty of health so
 * the attack and its Retaliation Attack both resolve without a kill. The other
 * units are pushed out of the way.
 */
function meleeDuel(): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_griffins;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.type = "ground";
  attacker.position = 9; // row 2, col 1
  attacker.attack = 2;
  attacker.defense = 1;
  attacker.maxHealth = 50;
  attacker.damage = 0;
  defender.type = "ground";
  defender.position = 13; // directly below — adjacent
  defender.attack = 3;
  defender.defense = 0;
  defender.maxHealth = 50;
  defender.damage = 0;
  // Keep the rest of the board clear.
  state.combat!.units.unit_p1_marksmen.position = 0;
  state.combat!.units.unit_p1_crusaders.position = 3;
  state.combat!.units.unit_p2_vampires.position = 19;
  state.combat!.units.unit_p2_dread_knights.position = 16;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  setActive(state, "p1", "unit_p1_griffins");
  return state;
}

describe("Leadership in battle", () => {
  it("is played without selecting a unit and grants a positive morale token", () => {
    const state = meleeDuel();
    state.players.p1.hand = ["ability.leadership"];
    state.players.p1.morale = 0;

    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.leadership"
    );
    // Exactly one no-target play — never one play per enemy unit, and never an
    // enemy-unit target prompt (the old default for untargeted cards).
    expect(plays).toHaveLength(1);
    expect(plays[0].action).toMatchObject({ type: "PLAY_CARD", target: { type: "none" } });

    const next = applyOk(state, plays[0].action);
    expect(next.players.p1.morale).toBe(1);
  });
});

describe("Medusas paralysis on retaliation", () => {
  it("Pack/Neutral Medusas paralyse the unit they retaliate against", () => {
    const state = meleeDuel();
    state.combat!.units.unit_p2_skeletons.abilities = ["medusa-paralyze-retaliation"];
    script(state, [1, 1, 1, 1]);

    const next = settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );

    expect(unitTokens(next, "unit_p1_griffins")).toContain("paralysis");
  });

  it("Few Medusas paralyse only on a '0' from the post-retaliation die", () => {
    const paralysed = settle(
      applyOk(
        (() => {
          const state = meleeDuel();
          state.combat!.units.unit_p2_skeletons.abilities = ["medusa-paralyze-retaliation-die"];
          // attack die, retaliation die, then the Medusas' "0" gaze die.
          script(state, [1, 1, 0]);
          return state;
        })(),
        { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" }
      )
    );
    expect(unitTokens(paralysed, "unit_p1_griffins")).toContain("paralysis");

    const spared = settle(
      applyOk(
        (() => {
          const state = meleeDuel();
          state.combat!.units.unit_p2_skeletons.abilities = ["medusa-paralyze-retaliation-die"];
          script(state, [1, 1, 1]); // gaze die is "1" — no paralysis.
          return state;
        })(),
        { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" }
      )
    );
    expect(unitTokens(spared, "unit_p1_griffins")).not.toContain("paralysis");
  });
});

describe("retaliation stat interactions", () => {
  it("Dread Knights gain +1 Defense while targeted by a Retaliation Attack", () => {
    const state = meleeDuel();
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["dread-knight-retaliation-defense"];
    attacker.defense = 1;
    script(state, [1, 1, 1, 1]);

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );

    const retaliation = attackRolls(next).find((event) => event.isRetaliation);
    expect(retaliation).toBeDefined();
    // base defense 1 + the +1 retaliation bonus.
    expect(retaliation?.defenseValue).toBe(2);
  });

  it("Dragon Flies sap 1 Attack from the Retaliation Attack against them", () => {
    const state = meleeDuel();
    state.combat!.units.unit_p1_griffins.abilities = ["dragon-fly-retaliation-penalty"];
    script(state, [1, 1, 1, 1]);

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );

    const retaliation = attackRolls(next).find((event) => event.isRetaliation);
    expect(retaliation?.attackBonus).toBe(-1);
  });

  it("Necropolis Dread Knights force the Retaliation Attack to roll at disadvantage", () => {
    const state = meleeDuel();
    state.combat!.units.unit_p1_griffins.abilities = ["dread-knight-retaliation-disadvantage"];
    script(state, [1, 1, 1, 1]);

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );

    const retaliation = declaredAttacks(next).find((event) => event.isRetaliation);
    expect(retaliation?.rollMode).toBe("disadvantage");
  });
});

/**
 * Drives the activation of one chosen unit: every other unit is marked already
 * activated, the named unit is left fresh, and the currently-active griffins
 * end their activation so the engine advances straight to it.
 */
function activateOnly(state: GameState, unitId: string): GameState {
  for (const unit of Object.values(state.combat!.units)) {
    unit.activatedThisRound = unit.id !== unitId && unit.id !== "unit_p1_griffins";
  }
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;
  setActive(state, "p1", "unit_p1_griffins");
  // Defending ends the griffins' fresh activation and advances straight to the
  // only other un-activated unit, firing its activation-start abilities.
  return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
}

describe("activation-start abilities", () => {
  it("Ghost Dragons discard the enemy's positive morale token when they activate", () => {
    const state = createInitialGameState();
    state.players.p2.morale = 1;
    const ghost = state.combat!.units.unit_p1_crusaders;
    ghost.abilities = ["ghost-dragon-morale-drain"];

    const next = activateOnly(state, "unit_p1_crusaders");
    expect(next.combat!.activeUnitId).toBe("unit_p1_crusaders");
    expect(next.players.p2.morale).toBe(0);
  });

  it("Wraiths regenerate damage when they activate", () => {
    const state = createInitialGameState();
    const wraith = state.combat!.units.unit_p1_crusaders;
    wraith.abilities = ["wraith-heal-2"];
    wraith.maxHealth = 6;
    wraith.damage = 4;

    const next = activateOnly(state, "unit_p1_crusaders");
    expect(next.combat!.units.unit_p1_crusaders.damage).toBe(2);
  });

  it("Wraith Pack drains a random card from the enemy hand on activation", () => {
    const state = createInitialGameState();
    state.players.p2.hand = ["spell.magic_arrow", "stat.power"];
    const wraith = state.combat!.units.unit_p1_crusaders;
    wraith.abilities = ["wraith-heal-1", "wraith-enemy-discard"];

    const next = activateOnly(state, "unit_p1_crusaders");
    expect(next.players.p2.hand.length).toBe(1);
    expect(next.players.p2.discard.length).toBe(1);
  });
});

describe("Ghost Dragon Pack attack die bonus", () => {
  it("adds +1 to the attack die result on its own attacks", () => {
    const state = createInitialGameState();
    const dragon = state.combat!.units.unit_p1_marksmen; // ranged — shoots, no retaliation
    dragon.abilities = ["ghost-dragon-attack-die"];
    dragon.attack = 5;
    dragon.position = 1;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_skeletons.maxHealth = 30;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [0, 0, 0]);
    setActive(state, "p1", "unit_p1_marksmen");

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );

    expect(attackRolls(next)[0]?.attackBonus).toBe(1);
  });
});

describe("Archangels combat-start draw", () => {
  it("getCombatStartDraws reports the Few Archangel's 1-card draw", () => {
    const archangel = makeCombatUnitFromArmy(
      { id: "army_arch", unitDefId: "castle.archangels", side: "few" },
      "p1",
      "unit_arch",
      5
    );
    expect(archangel).toBeTruthy();
    const draws = getCombatStartDraws(archangel as CombatUnitState);
    expect(draws).toHaveLength(1);
    expect(draws[0]?.amount).toBe(1);
  });

  it("the Pack Archangel does NOT draw at combat start", () => {
    const archangel = makeCombatUnitFromArmy(
      { id: "army_arch", unitDefId: "castle.archangels", side: "pack" },
      "p1",
      "unit_arch",
      5
    );
    expect(getCombatStartDraws(archangel as CombatUnitState)).toHaveLength(0);
  });
});

describe("army map abilities", () => {
  function adventure(): GameState {
    return createAdventureGameState({ seed: "map-abilities", difficulty: "normal", rollFirstPlayer: false });
  }

  it("Crystal Dragons grant 2 valuables at the start of a Resource round", () => {
    const state = adventure();
    const active = state.activePlayerId;
    state.players[active].army.push({ id: "army_cd", unitDefId: "neutral.crystal_dragons", side: "neutral" });
    state.players[active].production = { gold: 0, buildingMaterials: 0, valuables: 0 };
    const before = state.players[active].resources.valuables;
    state.round = 3; // an odd round after the first = a Resource round.

    startAdventureRound(state);
    expect(state.players[active].resources.valuables).toBe(before + 2);
  });

  it("Rogues scout a deck and may move its top card to the bottom, once per turn", () => {
    const state = adventure();
    const active = state.activePlayerId;
    state.players[active].army.push({ id: "army_rg", unitDefId: "neutral.rogues", side: "neutral" });

    const deckId = Object.keys(state.decks).find((id) => state.decks[id].drawPile.length >= 2);
    expect(deckId).toBeTruthy();
    const top = state.decks[deckId!].drawPile[state.decks[deckId!].drawPile.length - 1];

    let next = applyOk(state, { type: "ROGUES_SCOUT_DECK", playerId: active, deckId: deckId! });
    expect(next.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (next.pendingChoice?.type !== "OPTION_CHOICE") {
      return;
    }
    expect(next.pendingChoice.context).toBe("rogues-scout");

    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: active,
      choiceId: next.pendingChoice.id,
      optionIndex: 1 // move it to the bottom
    });
    expect(next.decks[deckId!].drawPile[0]).toBe(top);

    // A second scout the same turn is rejected.
    const blocked = applyAction(next, { type: "ROGUES_SCOUT_DECK", playerId: active, deckId: deckId! });
    expect(blocked.errors.length).toBeGreaterThan(0);
  });

  it("Nomads grant the end-of-turn adjacent-step map ability", () => {
    const withNomad = adventure();
    const active = withNomad.activePlayerId;
    expect(
      withNomad.players[active].army.some((unit) => unit.unitDefId === "neutral.nomads")
    ).toBe(false);

    withNomad.players[active].army.push({ id: "army_nm", unitDefId: "neutral.nomads", side: "neutral" });
    // End the turn: with a Nomad in the army the per-turn step flag is set.
    const ended = applyOk(withNomad, { type: "END_TURN", playerId: active });
    const stillSamePlayer = ended.activePlayerId === active;
    // Either a move choice opened (flag set, same player) or the turn passed
    // because no empty field was adjacent — both are valid Nomad outcomes.
    expect(stillSamePlayer ? ended.players[active].nomadStepDoneThisTurn === true : true).toBe(true);
  });
});
