import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId
} from "./index";
import { checkDragonConquerorHold } from "./adventure";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { SIEGE_ROW_POSITIONS } from "./siege";
import type { GameAction, GameState } from "./state";

/**
 * Dragon Conqueror, end-to-end: the headline rule the table asked for. A rival
 * who walks onto a CAPTURED Dragon Utopia does not re-fight neutral dragons — it
 * BESIEGES the holder, who defends behind Walls, the Gate and the Arrow Tower
 * exactly like a Citadel town. Win the siege and you seize the Utopia; hold it
 * into the start of your next turn and you win the game.
 *
 * Every assertion drives the real action flow (MOVE_HERO → placement → the
 * gate choice → demolition → finalize), so a break anywhere in the contest →
 * siege → capture → hold chain fails a test.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * Dragon Conqueror adventure where p2 already HOLDS the Dragon Utopia (its hero
 * standing on it) and p1 is staged on a real neighbouring field, one step away.
 */
function makeUtopiaSiegeReady(): GameState {
  const state = createAdventureGameState({
    seed: "utopia-siege",
    rollFirstPlayer: false,
    victoryMode: "dragon-conqueror"
  });
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  const adventure = state.adventure!;

  // Re-purpose the enemy town's field as the captured Dragon Utopia p2 holds.
  // No Citadel is added: `utopiaSiege` must be the SOLE reason the fight is a
  // siege, so this also proves the Dragon Conqueror path, not a town's.
  const townField = state.towns.town_p2.fieldId!;
  const utopiaField = adventure.fields[townField];
  utopiaField.location = "dragon_utopia";
  utopiaField.flagOwnerId = "p2";
  utopiaField.everFlagged = true;
  utopiaField.blackCube = false;

  const attacker = state.heroes.hero_p1;
  const defenderHero = state.heroes.hero_p2;
  defenderHero.spaceId = townField;

  const townCoord = parseHexSpaceId(townField)!;
  const stagingId = hexNeighbors(townCoord)
    .map((coord) => hexSpaceId(coord))
    .find((spaceId) => {
      const field = adventure.fields[spaceId];
      return field && !field.difficulty && field.location !== "town";
    })!;
  const staging = adventure.fields[stagingId];
  staging.location = "empty_field";
  staging.difficulty = undefined;
  staging.flagOwnerId = null;
  staging.blackCube = false;
  attacker.spaceId = stagingId;
  adventure.lastVisitedField.hero_p1 = stagingId;
  return state;
}

/** Walk p1 onto the held Utopia, which opens the siege and the deployment window. */
function assaultUtopia(state: GameState): GameState {
  const townField = state.towns.town_p2.fieldId!;
  return applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: townField });
}

/** Both sides ready up and deploy one unit each; returns the state at the gate choice. */
function deploy(state: GameState): GameState {
  if (state.combat?.prep) {
    state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p2" });
  }
  const p1Army = state.players.p1.army[0];
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: p1Army.id, position: 13 });
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  const p2Army = state.players.p2.army[0];
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p2", armyUnitId: p2Army.id, position: 5 });
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p2" });
  return state;
}

describe("Dragon Conqueror — contesting a held Utopia is a siege", () => {
  it("turns a rival's assault on the captured Utopia into a Walls/Gate/Tower siege", () => {
    let state = makeUtopiaSiegeReady();
    state = assaultUtopia(state);

    // It is a PLAYER siege (the holder defends), never a neutral dragon re-fight.
    expect(state.combat?.context.kind).toBe("player");
    expect(state.combat?.context.kind === "player" && state.combat.context.siege).toBe(true);
    expect(state.combat?.context.kind === "player" && state.combat.context.defenderHeroId).toBe("hero_p2");

    state = deploy(state);

    // The defender is asked to place the Gate (the siege-gate choice).
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("siege-gate");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });

    const siege = state.combat?.siege;
    expect(siege?.gatePosition).toBe(9);
    expect(siege?.walls.slice().sort((a, b) => a - b)).toEqual([8, 10, 11]);
    const tower = siege?.arrowTowerUnitId ? state.combat?.units[siege.arrowTowerUnitId] : null;
    expect(tower?.name).toBe("Arrow Tower");
    expect(tower?.controllerId).toBe("p2");
  });

  it("lets the defender set up the Gate in ANY of the four columns", () => {
    for (let column = 0; column < SIEGE_ROW_POSITIONS.length; column += 1) {
      let state = makeUtopiaSiegeReady();
      state = assaultUtopia(state);
      state = deploy(state);

      expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("siege-gate");
      // Every column is a live option, never a forced/default placement.
      const offered = getLegalActions(state, "p2").filter((legal) => legal.action.type === "CHOOSE_OPTION");
      expect(offered).toHaveLength(SIEGE_ROW_POSITIONS.length);

      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p2",
        choiceId: state.pendingChoice!.id,
        optionIndex: column
      });

      const siege = state.combat!.siege!;
      const expectedGate = SIEGE_ROW_POSITIONS[column];
      expect(siege.gatePosition).toBe(expectedGate);
      expect(siege.walls.slice().sort((a, b) => a - b)).toEqual(
        SIEGE_ROW_POSITIONS.filter((position) => position !== expectedGate)
      );
    }
  });

  it("collapses the Arrow Tower once the assault breaches every Wall and the Gate", () => {
    let state = makeUtopiaSiegeReady();
    state = assaultUtopia(state);
    state = deploy(state);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });

    const combat = state.combat!;
    expect(combat.siege!.arrowTowerUnitId).toBeTruthy();

    // Force-demolish each standing fortification with a ground unit at melee range.
    const ram = combat.units[state.players.p1.army[0].id]
      ? combat.units[state.players.p1.army[0].id]
      : Object.values(combat.units).find((unit) => unit.controllerId === "p1")!;

    const pieces: { kind: "wall" | "gate"; position: number }[] = [
      ...combat.siege!.walls.map((position) => ({ kind: "wall" as const, position })),
      ...(combat.siege!.gatePosition !== null ? [{ kind: "gate" as const, position: combat.siege!.gatePosition }] : [])
    ];

    let working = state;
    for (const piece of pieces) {
      const unit = working.combat!.units[ram.id];
      unit.activatedThisRound = false;
      unit.attackedThisActivation = false;
      unit.attacksThisActivation = 0;
      unit.movedThisActivation = false;
      unit.position = piece.position - 4; // the cell directly in front, adjacent
      working.combat!.activeUnitId = ram.id;
      working.activePlayerId = "p1";
      working = applyOk(working, {
        type: "ATTACK_FORTIFICATION",
        playerId: "p1",
        attackerId: ram.id,
        target: piece
      });
    }

    expect(working.combat?.siege?.walls).toEqual([]);
    expect(working.combat?.siege?.gatePosition).toBeNull();
    expect(working.combat?.siege?.arrowTowerUnitId).toBeNull();
    expect(
      working.eventLog.some((event) => event.type === "FORTIFICATION_DESTROYED" && event.kind === "arrow-tower")
    ).toBe(true);
  });

  it("seizes the Utopia for the winner, who then holds it to win the game", () => {
    let state = makeUtopiaSiegeReady();
    state = assaultUtopia(state);
    state = deploy(state);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });

    const townField = state.towns.town_p2.fieldId!;
    expect(state.adventure!.fields[townField].flagOwnerId).toBe("p2"); // still the holder's

    // The attacker wins the siege; finalize routes the winner's field visit,
    // which (Dragon Conqueror) re-flags the Utopia for them.
    state.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: "p2",
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);

    expect(state.combat).toBeNull();
    expect(state.adventure!.fields[townField].flagOwnerId).toBe("p1"); // seized
    expect(state.adventure!.winnerPlayerId).toBeNull(); // not won yet — must hold it

    // Holding the Utopia into the start of p1's next turn wins.
    checkDragonConquerorHold(state, "p1");
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });
});
