import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { addArmyUnit, getAdjacentSpaceIds } from "../adventure";
import { startNeutralEncounter } from "../adventure-reducer";
import { getLegalActions } from "../legal-actions";
import { applyAction } from "../reducer";
import type { CombatUnitState, GameAction, GameState, LegalAction, PlayerVisibleState } from "../state";
import { scoreCardAction } from "./card-policy";
import { scoreChoiceAction } from "./choice-policy";
import type { ComputerObservation } from "./types";

// Lab 2026-09-28 (fight corpus + paired dice rollouts, E:\heroes-ai-lab): the
// choices a neutral fight hands the ATTACKED player, the Defense-card die read
// and the first-strike deployment. Each case carries a CONTROL the old rule
// fails or the new rule must keep.

function observe(state: GameState, playerId: string, legalActions: LegalAction[] = []): ComputerObservation {
  return { playerId, state: state as unknown as PlayerVisibleState, legalActions };
}

function mainHero(state: GameState, playerId: string) {
  return Object.values(state.heroes).find(hero => hero.controllerId === playerId && hero.kind === "main")!;
}

/** A fresh impossible-difficulty neutral encounter against a level-I field, in deployment. */
function neutralDeployment(seed: string, army: Array<[string, "few" | "pack"]>): GameState {
  const state = createAdventureGameState({ seed, difficulty: "impossible", events: false, rollFirstPlayer: false });
  const player = state.players.p1;
  player.army = [];
  for (const [unitDefId, side] of army) addArmyUnit(player, unitDefId, side);
  player.needsHandRefresh = false;
  player.canMulligan = false;
  const hero = mainHero(state, "p1");
  hero.movementPoints = 3;
  const next = getAdjacentSpaceIds(hero.spaceId!).find(id => state.adventure!.fields[id] &&
    !Object.values(state.heroes).some(other => other.spaceId === id))!;
  const field = state.adventure!.fields[next]!;
  Object.assign(field, { location: "mine", resource: "gold", amount: 2, difficulty: 1, blackCube: false, flagOwnerId: null, everFlagged: false });
  startNeutralEncounter(state, hero, field);
  return state;
}

/** A deployed fight: the drawn guards stand, p1's army stands where the policy put it. */
function deployedFight(seed: string, army: Array<[string, "few" | "pack"]>): GameState {
  let state = neutralDeployment(seed, army);
  for (let step = 0; step < 12 && state.combat?.setup?.pendingPlayerIds?.includes("p1"); step += 1) {
    const legal = getLegalActions(state, "p1");
    const pick = legal.find(entry => entry.action.type === "PLACE_COMBAT_UNIT") ??
      legal.find(entry => entry.action.type === "FINISH_COMBAT_PLACEMENT");
    const result = applyAction(state, pick!.action);
    expect(result.errors).toHaveLength(0);
    state = result.state;
  }
  return state;
}

function ownUnits(state: GameState, playerId: string): CombatUnitState[] {
  return Object.values(state.combat!.units).filter(unit => unit.controllerId === playerId);
}

function guard(state: GameState): CombatUnitState {
  return Object.values(state.combat!.units).find(unit => unit.controllerId !== "p1")!;
}

describe("neutral target tie (rulebook: the player chooses which unit is attacked)", () => {
  it("sends the guard's strike to the body that survives it, not the wounded one", () => {
    const state = deployedFight("tie-target", [["rampart.centaurs", "few"], ["rampart.dwarves", "few"]]);
    const striker = guard(state);
    Object.assign(striker, { attack: 2, type: "ground", abilities: [] });
    const [first, second] = ownUnits(state, "p1");
    // A wounded, higher-threat body one strike removes vs a fresh armoured one.
    Object.assign(first!, { attack: 4, defense: 0, maxHealth: 3, damage: 1, retaliatedThisRound: false });
    Object.assign(second!, { attack: 2, defense: 2, maxHealth: 4, damage: 0, retaliatedThisRound: false });
    state.pendingChoice = {
      id: "choice_tie", type: "ABILITY_TARGET_CHOICE", playerId: "p1", kind: "neutral-target",
      abilityId: null, abilityName: "Neutral target tie", prompt: "tie",
      sourceUnitId: striker.id, anchorUnitId: null, candidateUnitIds: [first!.id, second!.id],
    } as GameState["pendingChoice"];
    const score = (unitId: string) => scoreChoiceAction(observe(state, "p1"),
      { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: "choice_tie", targetUnitId: unitId } as GameAction)!.score;
    // The heal/buff reading ("most wounded, highest threat first") picked `first`.
    expect(score(second!.id)).toBeGreaterThan(score(first!.id));
  });
});

describe("neutral landing cell (BINH: the player picks where a moving guard lands)", () => {
  it("keeps the guard off our other shooter", () => {
    const state = deployedFight("tie-landing", [["rampart.dwarves", "few"], ["rampart.elves", "few"]]);
    const striker = guard(state);
    const dwarves = ownUnits(state, "p1").find(unit => unit.unitDefId === "rampart.dwarves")!;
    const elves = ownUnits(state, "p1").find(unit => unit.unitDefId === "rampart.elves")!;
    // Dwarves on 13, Elves on 18: cell 12 touches only the Dwarves, cell 14 also the Elves.
    dwarves.position = 13;
    elves.position = 18;
    for (const other of Object.values(state.combat!.units)) {
      if (other.controllerId !== "p1" && other.id !== striker.id) other.position = -1;
    }
    striker.position = 3;
    state.pendingChoice = {
      id: "choice_land", type: "OPTION_CHOICE", playerId: "p1", prompt: "land",
      options: [{ label: "Move to 14" }, { label: "Move to 12" }],
      context: "neutral-destination",
      neutralDestination: { unitId: striker.id, positions: [14, 12], defenderId: dwarves.id },
      returnPhase: "combat",
    } as GameState["pendingChoice"];
    const score = (optionIndex: number) => scoreChoiceAction(observe(state, "p1"),
      { type: "CHOOSE_OPTION", playerId: "p1", choiceId: "choice_land", optionIndex } as GameAction)!.score;
    expect(score(1)).toBeGreaterThan(score(0));
  });
});

describe("Defense reaction die read (neutral fights)", () => {
  function reactionState(targetHealth: number, followUp: boolean): { state: GameState; pass: LegalAction; play: LegalAction } {
    const state = deployedFight("defense-read", [["rampart.dwarves", "few"], ["rampart.centaurs", "few"]]);
    const striker = guard(state);
    Object.assign(striker, { attack: 2, type: "ground", abilities: [], position: 9, activatedThisRound: false });
    const target = ownUnits(state, "p1").find(unit => unit.unitDefId === "rampart.centaurs")!;
    Object.assign(target, { defense: 0, maxHealth: targetHealth, damage: 0, position: 13, abilities: [] });
    let shooterPlaced = false;
    for (const other of Object.values(state.combat!.units)) {
      if (other.controllerId === "p1" && other.id !== target.id) other.position = 19;
      if (other.controllerId !== "p1" && other.id !== striker.id) {
        // One shooter still to act this round can finish a chipped body.
        Object.assign(other, followUp && !shooterPlaced
          ? { position: 0, type: "ranged", attack: 2, activatedThisRound: false, abilities: [] }
          : { position: -1 });
        shooterPlaced = true;
      }
    }
    state.players.p1.hand = ["stat.defense"];
    (state as unknown as { stack: unknown[] }).stack = [{
      action: { type: "ATTACK_UNIT", playerId: striker.controllerId, attackerId: striker.id, defenderId: target.id },
      modifiers: { spellPowerBonus: 0, attackBonus: 0, defenseBonus: 0 },
    }];
    const pass: LegalAction = { label: "Pass", action: { type: "PASS_REACTION", playerId: "p1" } as GameAction };
    const play: LegalAction = { label: "Defense", action: { type: "PLAY_REACTION", playerId: "p1", cardId: "stat.defense", mode: "basic" } as GameAction };
    return { state, pass, play };
  }

  it("keeps the card when no Attack-die face of the hit is lethal and nobody else can finish the body", () => {
    // Attack 2 into a 4-health, 0-Defense body: 1/2/3 damage, never lethal.
    const { state, pass, play } = reactionState(4, false);
    expect(scoreCardAction(observe(state, "p1", [pass, play]), play.action)!.score).toBeLessThan(1_050);
  });

  it("CONTROL: plays it when the +1 face alone would remove the body", () => {
    // 3 health: the +1 face deals 3 — the card turns that face into a survival.
    const { state, pass, play } = reactionState(3, false);
    expect(scoreCardAction(observe(state, "p1", [pass, play]), play.action)!.score).toBeGreaterThan(1_050);
  });

  it("CONTROL: plays it when the chip decides whether a guard still to act finishes the body", () => {
    // 4 health, a 2-Attack shooter still to act: 2 chip + 2 shot = dead; 1 chip + 2 = alive.
    const { state, pass, play } = reactionState(4, true);
    expect(scoreCardAction(observe(state, "p1", [pass, play]), play.action)!.score).toBeGreaterThan(1_050);
  });
});
