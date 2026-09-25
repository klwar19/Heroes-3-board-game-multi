import { describe, expect, it } from "vitest";

import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, makeCombatUnitFromArmy } from "./index";
import { getActiveDefenseBonus, unitAttackRollAdvantaged } from "./active-effects";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function playSpecialty(state: GameState, cardId: string): GameState {
  const action = getLegalActions(state, "p1").find(
    (entry) => entry.action.type === "PLAY_CARD" && entry.action.cardId === cardId,
  )?.action;
  expect(action, `${cardId} is offered in its printed window`).toBeDefined();
  return applyOk(state, action!);
}

function passReactions(state: GameState): GameState {
  let current = state;
  for (let n = 0; current.reactionWindow && n < 20; n += 1) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  expect(current.reactionWindow).toBeNull();
  return current;
}

function combatWithHalflings(cardId: string): GameState {
  const state = createInitialGameState(`henrietta-${cardId}`);
  const combat = state.combat!;
  const faction = makeCombatUnitFromArmy(
    { id: "army_factory_halflings", unitDefId: "factory.halflings", side: "pack" },
    "p1", "unit_p1_griffins", 9, state.ruleset,
  )!;
  const neutral = makeCombatUnitFromArmy(
    { id: "army_neutral_halflings", unitDefId: "neutral.halflings", side: "neutral" },
    "p1", "unit_p1_marksmen", 10, state.ruleset,
  )!;
  const other = makeCombatUnitFromArmy(
    { id: "army_factory_engineers", unitDefId: "factory.mechanics", side: "few" },
    "p1", "unit_p1_swordsmen", 11, state.ruleset,
  )!;
  combat.units[faction.id] = faction;
  combat.units[neutral.id] = neutral;
  combat.units[other.id] = other;
  state.players.p1.hand = [cardId];
  state.players.p2.hand = [];
  // The opposing army owns the first activation slot. The start window is
  // still open for Henrietta, before either army has acted.
  combat.activeUnitId = "unit_p2_skeletons";
  state.activePlayerId = "p2";
  return state;
}

describe("Henrietta Halflings specialties", () => {
  it("I buffs real Factory Grenadiers and neutral Halflings at combat start, with neutral-only Health", () => {
    const control = combatWithHalflings("specialty.henrietta.1");
    const faction = control.combat!.units.unit_p1_griffins;
    const neutral = control.combat!.units.unit_p1_marksmen;
    const other = control.combat!.units.unit_p1_swordsmen;
    const base = [faction, neutral, other].map((unit) => ({
      defense: getActiveDefenseBonus(control, unit), health: unit.maxHealth,
    }));
    const played = playSpecialty(control, "specialty.henrietta.1");
    const [playedFaction, playedNeutral, playedOther] = [
      played.combat!.units.unit_p1_griffins,
      played.combat!.units.unit_p1_marksmen,
      played.combat!.units.unit_p1_swordsmen,
    ];
    expect(getActiveDefenseBonus(played, playedFaction)).toBe(base[0].defense + 1);
    expect(getActiveDefenseBonus(played, playedNeutral)).toBe(base[1].defense + 1);
    expect(getActiveDefenseBonus(played, playedOther)).toBe(base[2].defense);
    expect(playedFaction.maxHealth).toBe(base[0].health);
    expect(playedNeutral.maxHealth).toBe(base[1].health + 1);
    expect(playedOther.maxHealth).toBe(base[2].health);
    function incomingDamage(fight: GameState): number {
      fight.combat!.units.unit_p2_skeletons.position = 13;
      fight.combat!.units.unit_p1_griffins.maxHealth = 10;
      fight.combat!.dice.scriptedRolls = [0];
      fight.combat!.dice.rollCount = 0;
      const resolved = passReactions(applyOk(fight, {
        type: "ATTACK_UNIT", playerId: "p2",
        attackerId: "unit_p2_skeletons", defenderId: "unit_p1_griffins",
      }));
      return resolved.combat!.units.unit_p1_griffins.damage;
    }
    expect(incomingDamage(played)).toBe(incomingDamage(control) - 1);
    expect(getLegalActions(played, "p1").some((entry) =>
      entry.action.type === "PLAY_CARD" && entry.action.cardId === "specialty.henrietta.1"
    )).toBe(false);
    const late = combatWithHalflings("specialty.henrietta.1");
    late.combat!.units.unit_p2_skeletons.activatedThisRound = true;
    expect(getLegalActions(late, "p1").some((entry) =>
      entry.action.type === "PLAY_CARD" && entry.action.cardId === "specialty.henrietta.1"
    )).toBe(false);
  });

  it("VI gives every friendly unit attack advantage in a later round, not enemy units", () => {
    const state = combatWithHalflings("specialty.henrietta.6");
    state.combat!.round = 2;
    const faction = state.combat!.units.unit_p1_griffins;
    const other = state.combat!.units.unit_p1_swordsmen;
    const enemy = state.combat!.units.unit_p2_skeletons;
    expect(unitAttackRollAdvantaged(state, faction)).toBe(false);
    expect(unitAttackRollAdvantaged(state, other)).toBe(false);
    const played = playSpecialty(state, "specialty.henrietta.6");
    expect(unitAttackRollAdvantaged(played, played.combat!.units.unit_p1_griffins)).toBe(true);
    expect(unitAttackRollAdvantaged(played, played.combat!.units.unit_p1_swordsmen)).toBe(true);
    expect(unitAttackRollAdvantaged(played, played.combat!.units.unit_p2_skeletons)).toBe(false);
    expect(played.players.p1.ongoingCards?.some((entry) => entry.cardId === "specialty.henrietta.6")).toBe(true);
    played.combat!.units.unit_p2_skeletons.position = 15;
    played.combat!.units.unit_p2_skeletons.maxHealth = 30;
    played.combat!.activeUnitId = "unit_p1_swordsmen";
    played.activePlayerId = "p1";
    played.combat!.dice.scriptedRolls = [-1, 1];
    played.combat!.dice.rollCount = 0;
    const attacked = passReactions(applyOk(played, {
      type: "ATTACK_UNIT", playerId: "p1",
      attackerId: "unit_p1_swordsmen", defenderId: "unit_p2_skeletons",
    }));
    const roll = attacked.eventLog.find((event) =>
      event.type === "ATTACK_ROLLED" && event.attackerId === "unit_p1_swordsmen"
    );
    expect(roll).toMatchObject({ rolls: [-1, 1], roll: 1, rollMode: "advantage" });
    const late = combatWithHalflings("specialty.henrietta.6");
    late.combat!.round = 2;
    late.combat!.units.unit_p2_skeletons.activatedThisRound = true;
    expect(getLegalActions(late, "p1").some((entry) =>
      entry.action.type === "PLAY_CARD" && entry.action.cardId === "specialty.henrietta.6"
    )).toBe(false);
  });

  it("IV's combat arm reacts to an enemy attack on a real Factory Grenadiers unit", () => {
    const state = combatWithHalflings("specialty.henrietta.4");
    state.combat!.units.unit_p2_skeletons.position = 13;
    const declared = applyOk(state, {
      type: "ATTACK_UNIT", playerId: "p2",
      attackerId: "unit_p2_skeletons", defenderId: "unit_p1_griffins",
    });
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find((entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === "specialty.henrietta.4" &&
      entry.action.optionIndex === 1
    );
    expect(reaction).toBeDefined();
    const resolved = passReactions(applyOk(declared, reaction!.action));
    const roll = resolved.eventLog.find((event) =>
      event.type === "ATTACK_ROLLED" && event.defenderId === "unit_p1_griffins"
    );
    expect(roll).toMatchObject({ defenseBonus: 2 });
  });

  it("IV searches the actual bronze Neutral deck and recruits its chosen Halflings copy for free", () => {
    let state = createAdventureGameState({
      seed: "henrietta-four", rollFirstPlayer: false, events: false,
      players: [
        { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
      ],
    });
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.adventure!.pendingVisit = null;
    state.adventure!.rewardQueue = [];
    state.players.p1.needsHandRefresh = false;
    state.players.p1.canMulligan = false;
    state.players.p1.hand = ["specialty.henrietta.4"];
    const deck = state.decks["neutral-bronze"];
    expect(deck).toBeDefined();
    deck.drawPile = ["neutral.halflings"];
    deck.discardPile = ["neutral.grenadiers"];
    const beforeGold = state.players.p1.resources.gold;
    state = playSpecialty(state, "specialty.henrietta.4");
    const menu = state.adventure!.pendingVisit!.steps[0];
    expect(menu.type).toBe("CHOOSE_ONE");
    if (menu.type !== "CHOOSE_ONE") return;
    expect(menu.options.some((option) => option.label.includes("Halflings"))).toBe(true);
    expect(menu.options.some((option) => option.label.includes("Grenadiers"))).toBe(true);
    const pick = menu.options.findIndex((option) => option.label.includes("Halflings"));
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: pick });
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "neutral.halflings" && unit.side === "neutral")).toBe(true);
    expect(state.players.p1.resources.gold).toBe(beforeGold);
    expect(state.decks["neutral-bronze"].drawPile).not.toContain("neutral.halflings");
  });
});
