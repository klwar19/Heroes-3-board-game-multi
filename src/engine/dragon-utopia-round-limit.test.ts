/**
 * Dragon Utopia (dragon-hunt / dragon-conqueror objective field): the fight has
 * NO one-round time limit — rounds advance automatically. Other neutral fights
 * still pause for continue-or-retreat when they have no azure guards.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "@/engine";
import { getMainHero } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshP1(state: GameState): GameState {
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    return apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

/** Place the main hero on a field and open a real neutral combat, then finish placement. */
function openNeutralFight(state: GameState, fieldId: string, forceNoAzure: boolean): GameState {
  state = refreshP1(state);
  const hero = getMainHero(state, "p1")!;
  hero.level = 7;
  hero.spaceId = fieldId;
  hero.movementPoints = 5;
  startNeutralEncounter(state, hero, state.adventure!.fields[fieldId]!);

  // Place one unit and lock placement so guards reveal.
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  expect(place, "placement is offered").toBeTruthy();
  state = apply(state, place!.action);
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  expect(state.phase).toBe("combat");
  expect(state.combat?.context.kind).toBe("neutral");

  if (forceNoAzure && state.combat?.context.kind === "neutral") {
    // Mutation control: strip the azure flag so the location exemption (not
    // hasAzure) is what keeps Utopia unlimited.
    state.combat.context.hasAzure = false;
  }

  // Nobody can deal damage — drive full activations without ending the fight.
  state.combat!.dice.scriptedRolls = Array(120).fill(-1);
  for (const unit of Object.values(state.combat!.units)) {
    unit.attack = 0;
  }
  return state;
}

function driveUntilRoundGateOrTwo(state: GameState): GameState {
  let safety = 300;
  while (state.combat && state.combat.round < 2 && !state.combat.awaitingContinue && !state.combat.outcome && safety > 0) {
    safety -= 1;
    const actions = getLegalActions(state, "p1");
    const defend = actions.find((legal) => legal.action.type === "DEFEND_UNIT");
    const pass = actions.find((legal) => legal.action.type === "PASS_REACTION");
    const keepRoll = actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
    const continueStep = actions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP");
    const next = defend ?? pass ?? keepRoll ?? continueStep ?? actions[0];
    if (!next) {
      break;
    }
    state = apply(state, next.action);
  }
  return state;
}

describe("Dragon Utopia — unlimited combat rounds", () => {
  it("does NOT open continue-or-retreat on the Utopia field (even with hasAzure forced off)", () => {
    let state = createAdventureGameState({
      seed: "utopia-round-limit",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "dragon-hunt",
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });

    // Guarantee a Utopia field under the hero.
    let utopiaFieldId =
      Object.values(state.adventure!.fields).find((field) => field.location === "dragon_utopia")?.spaceId ?? null;
    if (!utopiaFieldId) {
      const any = Object.values(state.adventure!.fields)[0]!;
      any.location = "dragon_utopia";
      any.difficulty = 7;
      any.blackCube = false;
      any.flagOwnerId = null;
      utopiaFieldId = any.spaceId;
    } else {
      const field = state.adventure!.fields[utopiaFieldId]!;
      field.blackCube = false;
      field.flagOwnerId = null;
      field.difficulty = field.difficulty ?? 7;
    }

    state = openNeutralFight(state, utopiaFieldId, true);
    state = driveUntilRoundGateOrTwo(state);

    expect(state.combat, "combat still open").toBeTruthy();
    expect(
      state.combat!.awaitingContinue,
      "Dragon Utopia must NOT open the continue-or-retreat gate after a round"
    ).toBe(false);
    expect(state.combat!.round, "round advanced automatically past 1").toBeGreaterThanOrEqual(2);
  });

  it("CONTROL: a normal difficulty-1 neutral fight DOES open continue-or-retreat", () => {
    let state = createAdventureGameState({
      seed: "normal-round-limit",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });

    // Mint a plain guarded field at difficulty 7 (matches hero level so Quick
    // Combat does not auto-win) that is NOT the Utopia.
    const fieldId = "plain-guard";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "t",
      slot: 0,
      location: "nothing",
      difficulty: 7,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };

    state = openNeutralFight(state, fieldId, true);
    // hasAzure forced false; location is not utopia → must pause.
    state = driveUntilRoundGateOrTwo(state);

    expect(state.combat?.awaitingContinue, "ordinary neutral fight pauses after round 1").toBe(true);
    expect(state.combat?.round).toBe(1);
  });
});
