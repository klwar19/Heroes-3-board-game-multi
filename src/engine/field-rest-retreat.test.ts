import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameState
} from "./index";
import { startNeutralEncounter } from "./adventure-reducer";

/**
 * USER RULE 2026-09-12 (engine-enforced; each test fails if the wiring is
 * removed): a neutral FIELD fight lets the attacker rest — the continue-or-
 * retreat window opens after EVERY round, round 1 included, exactly like a
 * Creature Bank — so a hero can cut their losses instead of being forced to
 * fight on. Only a TRUE Level-VII field (Field Difficulty 7 / azure guard /
 * Dragon Utopia) still fights to the death with no retreat. A designer numeric
 * turn-limit keeps its own paid window untouched (so a VII field with a limit
 * still opens the paid window once its free rounds run out — the CONTROL below).
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/**
 * Drive a NON-bank designer field fight (an exact-army guard so Quick Combat
 * never skips it) to the first continue-or-retreat pause. Nobody can deal
 * damage (every attack rolls "-1" and every unit's Attack is zeroed), so rounds
 * cycle until a window opens or the fight ends. `roundLimit` gives that many
 * FREE rounds before the paid window.
 */
function driveFieldToWindow(seed: string, difficulty: number, roundLimit: 1 | 2 | 3): GameState {
  let state = createAdventureGameState({ seed, difficulty: "easy", rollFirstPlayer: false });
  state =
    state.players.p1.needsHandRefresh || state.players.p1.canMulligan
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;

  const hero = getMainHero(state, "p1")!;
  hero.level = 7; // exact-army fights never Quick-Combat, but keep it high anyway
  hero.spaceId = "field-1";
  state.adventure!.fields["field-1"] = {
    spaceId: "field-1",
    tileInstanceId: "t",
    slot: 0,
    location: "empty_field",
    difficulty,
    designedGuard: true,
    customGuardUnits: ["neutral.skeletons", "neutral.skeletons", "neutral.skeletons"],
    combatRoundLimit: roundLimit,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };

  startNeutralEncounter(state, hero, state.adventure!.fields["field-1"]);
  // Place one unit and lock in deployment.
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  state = apply(state, place!.action);
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

  state.combat!.dice.scriptedRolls = Array(120).fill(-1);
  for (const unit of Object.values(state.combat!.units)) {
    unit.attack = 0;
  }

  let safety = 200;
  while (state.combat && !state.combat.awaitingContinue && !state.combat.outcome && safety > 0) {
    safety -= 1;
    const actions = getLegalActions(state, "p1");
    const next =
      actions.find((legal) => legal.action.type === "DEFEND_UNIT") ??
      actions.find((legal) => legal.action.type === "PASS_REACTION") ??
      actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL") ??
      actions[0];
    if (!next) break;
    state = apply(state, next.action);
  }
  return state;
}

describe("neutral field fight: rest / retreat every round (except VII)", () => {
  it("a VI field opens the FREE rest-or-retreat window at the end of ROUND 1", () => {
    const state = driveFieldToWindow("field-rest-vi", 6, 2);
    expect(state.combat?.awaitingContinue).toBe(true);
    // The window opened DURING the free rounds — round 1, not after them.
    expect(state.combat?.round).toBe(1);
    // Continuing costs no movement (a free rest, like a bank), and Retreat is
    // offered right here at round 1.
    expect(state.combat?.continueFree).toBe(true);
    const actions = getLegalActions(state, "p1");
    expect(actions.some((legal) => legal.action.type === "RETREAT_FROM_COMBAT")).toBe(true);
  });

  it("CONTROL: a VII field with the SAME limit only opens the window AFTER its free rounds (round 2, paid)", () => {
    const state = driveFieldToWindow("field-rest-vii", 7, 2);
    expect(state.combat?.awaitingContinue).toBe(true);
    // A true VII field never rests during its free rounds: the window is the
    // designer limit's own PAID window, opening only once the 2 free rounds pass.
    expect(state.combat?.round).toBe(2);
    expect(state.combat?.continueFree ?? false).toBe(false);
  });
});
