import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameState
} from "./index";
import { beginFieldVisit, placeDungeonSite, startAdventureRound } from "./adventure";
import { pumpAdventureQueues, startNeutralEncounter } from "./adventure-reducer";
import {
  combatUnitDecisionOwnerId,
  manualGuardControllerId,
  neutralCombatControllerId,
  pvpNeutralControllerId
} from "./neutral-control";
import type { CombatUnitState, MapSpaceId, PlayerId } from "./state";

/**
 * USER RULE: the optional PvE director's own fights — a Calamity Wave assault,
 * a Raid-Boss lair fight and a Dungeon floor fight — are NEVER handed to a
 * manual neutral controller. Neither PvP Neutral Control (which would give the
 * boss to the next player clockwise) nor Manual guard control (which would let
 * the attacked player drive the boss attacking them) reaches them; the normal
 * Neutral AI always plays those guards.
 *
 * Every claim is asserted as an OBSERVABLE outcome — the pre-battle formation
 * SORT window that a controller always gets, who holds priority, whether the
 * would-be controller is offered actions driving a neutral unit, and whether
 * the guards' activation PARKS for a human — each with an ordinary
 * guard-FIELD fight in the SAME mode as the CONTROL.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

type Mode = "pvp" | "manual";

/** The seat each mode WOULD hand the guards to on an ordinary guard fight. */
const WOULD_BE_CONTROLLER: Record<Mode, PlayerId> = { pvp: "p2", manual: "p1" };

function pveGame(seed: string, mode: Mode, modules: Record<string, unknown>): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    ...(mode === "pvp" ? { pvpNeutralControl: true } : { manualGuardControl: true }),
    wog: { enabled: true, ...modules }
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.hand = [];
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  state.activePlayerId = "p1";
  return state;
}

function startRound(state: GameState, round: number): void {
  state.round = round;
  startAdventureRound(state);
  pumpAdventureQueues(state);
}

function neutralUnitsOf(state: GameState): CombatUnitState[] {
  return Object.values(state.combat!.units).filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID);
}

/** Place one unit and finish placement, so the neutral army is revealed. */
function revealArmy(state: GameState): GameState {
  const fighter = state.combat!.attackerPlayerId;
  const placement = getLegalActions(state, fighter).find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  expect(placement, "expected a unit placement offer").toBeTruthy();
  let next = applyOk(state, placement!.action);
  next = applyOk(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: fighter });
  return next;
}

/** The pump has PARKED on a Neutral unit's activation, awaiting a human. */
function guardSlotOpen(state: GameState): boolean {
  const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
  return Boolean(
    active &&
      active.controllerId === NEUTRAL_PLAYER_ID &&
      !active.activatedThisRound &&
      !state.pendingChoice &&
      !state.combat?.pendingNeutralStep &&
      !state.reactionWindow
  );
}

/**
 * Drives the player's own activations (Defend / end) plus pauses and reaction
 * passes until either a Neutral activation PARKS for a human (the bug) or the
 * fight runs on without ever doing so (the rule).
 */
function driveTowardNeutralSlot(state: GameState): { state: GameState; neutralActed: boolean } {
  let safety = 60;
  let neutralActed = false;
  while (safety > 0) {
    safety -= 1;
    neutralActed = neutralActed || neutralUnitsOf(state).some((unit) => unit.activatedThisRound);
    if (guardSlotOpen(state) || state.combat?.outcome) {
      return { state, neutralActed };
    }
    if (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      continue;
    }
    const pause = state.combat?.pendingNeutralStep;
    if (pause) {
      state = applyOk(state, {
        type: "CONTINUE_NEUTRAL_STEP",
        playerId: pause.reactingPlayerId ?? state.combat!.attackerPlayerId
      });
      continue;
    }
    if (state.pendingChoice) {
      // In the plain-AI path a neutral's follow-up picks (e.g. the BINH
      // "fighter picks the neutral's destination" house rule) belong to the
      // FIGHTER, never to a controller. Answer whatever is offered and go on.
      const owner = state.pendingChoice.playerId ?? state.combat!.attackerPlayerId;
      const offer = getLegalActions(state, owner)[0];
      if (!offer) {
        break;
      }
      state = applyOk(state, offer.action);
      continue;
    }
    const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
    if (active && active.controllerId !== NEUTRAL_PLAYER_ID) {
      const offer = getLegalActions(state, active.controllerId).find(
        (entry) =>
          (entry.action.type === "DEFEND_UNIT" && entry.action.unitId === active.id) ||
          (entry.action.type === "END_ACTIVATION" && entry.action.unitId === active.id)
      );
      if (offer) {
        state = applyOk(state, offer.action);
        continue;
      }
    }
    break;
  }
  return { state, neutralActed };
}

/** Every offer this seat has that would DRIVE a neutral-side unit or its sort. */
function neutralDrivingOffers(state: GameState, playerId: PlayerId): string[] {
  const combat = state.combat!;
  const isNeutral = (unitId?: string) =>
    Boolean(unitId && combat.units[unitId]?.controllerId === NEUTRAL_PLAYER_ID);
  return getLegalActions(state, playerId)
    .filter((entry) => {
      const action = entry.action as Record<string, unknown> & { type: string };
      if (action.type === "FINISH_NEUTRAL_PLACEMENT" || action.type === "PLACE_NEUTRAL_UNIT") {
        return true;
      }
      return (
        isNeutral(action.unitId as string | undefined) ||
        isNeutral(action.attackerId as string | undefined)
      );
    })
    .map((entry) => entry.action.type);
}

// ---------------------------------------------------------------------------
// Fixtures for the three PvE-director fights and the ordinary-guard CONTROL
// ---------------------------------------------------------------------------

/** A Calamity Wave assault for seat 1 (cadence 3 ⇒ the round-3 wave). */
function waveFight(seed: string, mode: Mode): GameState {
  const state = pveGame(seed, mode, { monsterWaves: true, waveCadence: 3 });
  startRound(state, 3);
  const context = state.combat?.context;
  expect(context && "waveAssault" in context && context.waveAssault, "expected the wave assault").toBeTruthy();
  return state;
}

/** A Raid-Boss lair fight (round-5 spawn, then "Challenge"). */
function raidBossFight(seed: string, mode: Mode): GameState {
  const state = pveGame(seed, mode, { raidBosses: true });
  startRound(state, 5);
  const entries = Object.entries(state.adventure!.raidBosses ?? {});
  expect(entries.length, "expected the scheduled boss to spawn").toBe(1);
  const fieldId = entries[0][1].fieldId;
  const hero = state.heroes.hero_p1;
  state.adventure!.lastVisitedField[hero.id] = hero.spaceId!;
  hero.spaceId = fieldId;
  beginFieldVisit(state, hero.id, fieldId, false);
  expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
  const next = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
  const context = next.combat?.context;
  expect(context && "raidBossId" in context && context.raidBossId, "expected the lair fight").toBeTruthy();
  return next;
}

/** A Dungeon floor-1 den fight (site carved under the hero, one auto door). */
function dungeonFloorFight(seed: string, mode: Mode): GameState {
  const state = pveGame(seed, mode, { dungeon: true });
  const field = Object.values(state.adventure!.fields).find(
    (candidate) => candidate.location !== "town" && !candidate.difficulty
  )!;
  placeDungeonSite(state, field.spaceId);
  state.heroes.hero_p1.spaceId = field.spaceId;
  const fieldId: MapSpaceId = field.spaceId;
  beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
  const menu = state.adventure!.pendingVisit?.steps[0];
  if (menu?.type !== "CHOOSE_ONE") {
    throw new Error("expected the dungeon door menu");
  }
  const pick = menu.options.findIndex(
    (option, index) =>
      index < 2 && !option.steps.some((step) => step.type === "PAY_TO" || step.type === "CHOOSE_ONE")
  );
  expect(pick).toBeGreaterThanOrEqual(0);
  const next = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: pick });
  const context = next.combat?.context;
  expect(
    context && "dungeonFloor" in context && context.dungeonFloor !== undefined,
    "expected the floor den fight"
  ).toBeTruthy();
  return next;
}

/**
 * The CONTROL: an ORDINARY guard-field fight in a game with the very same mode
 * on — the manual controller really does take the guards there.
 */
function guardFieldFight(seed: string, mode: Mode): GameState {
  const state = pveGame(seed, mode, {});
  const hero = state.heroes.hero_p1;
  const field = Object.values(state.adventure!.fields).find((candidate) => (candidate.difficulty ?? 0) > 0);
  expect(field, "the map should hold a guarded field").toBeTruthy();
  field!.difficulty = 2;
  startNeutralEncounter(state, hero, field!);
  expect(state.combat?.context.kind).toBe("neutral");
  return state;
}

const PVE_FIGHTS: ReadonlyArray<[string, (seed: string, mode: Mode) => GameState]> = [
  ["a Calamity Wave assault", waveFight],
  ["a Raid-Boss lair fight", raidBossFight],
  ["a Dungeon floor fight", dungeonFloorFight]
];

// ---------------------------------------------------------------------------

for (const mode of ["pvp", "manual"] as const) {
  const label = mode === "pvp" ? "PvP Neutral Control" : "Manual guard control";
  const controller = WOULD_BE_CONTROLLER[mode];

  describe(`${label} never reaches a PvE-director fight`, () => {
    for (const [name, build] of PVE_FIGHTS) {
      it(`${name} has NO neutral controller and never opens the pre-battle SORT window`, () => {
        let state = build(`pve-exempt-${mode}-${name.replace(/\W+/g, "-")}`, mode);
        const combat = state.combat!;
        expect(neutralCombatControllerId(state, combat)).toBeNull();
        expect(pvpNeutralControllerId(state, combat)).toBeNull();
        expect(manualGuardControllerId(state, combat)).toBeNull();

        state = revealArmy(state);
        // The observable: a controller ALWAYS gets the formation sort (and
        // priority) before the fighting begins. Nobody does here.
        expect(state.combat!.pendingNeutralPlacement).toBeFalsy();
        expect(state.eventLog.some((event) => event.type === "NEUTRAL_FORMATION_SORT_OPENED")).toBe(false);
        expect(neutralDrivingOffers(state, controller)).toEqual([]);

        const guards = neutralUnitsOf(state);
        expect(guards.length).toBeGreaterThan(0);
        for (const guard of guards) {
          expect(combatUnitDecisionOwnerId(state, state.combat!, guard)).toBe(NEUTRAL_PLAYER_ID);
        }
      });

      it(`${name} lets the neutral AI play the guards — the activation never parks for a human`, () => {
        let state = build(`pve-drive-${mode}-${name.replace(/\W+/g, "-")}`, mode);
        state = revealArmy(state);
        state.combat!.dice.scriptedRolls = Array(60).fill(0);
        state.combat!.dice.rollCount = 0;
        // Keep the fighter's body alive long enough for the guards to act.
        for (const unit of Object.values(state.combat!.units)) {
          if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
            unit.maxHealth = 200;
            unit.damage = 0;
          }
        }
        const driven = driveTowardNeutralSlot(state);
        state = driven.state;
        expect(guardSlotOpen(state)).toBe(false);
        expect(neutralDrivingOffers(state, controller)).toEqual([]);
        // The AI really played them: a neutral took its own slot with no human
        // input at any point of the drive.
        expect(driven.neutralActed).toBe(true);
      });
    }

    it("CONTROL: an ordinary guard-field fight in the same game DOES get the manual controller", () => {
      let state = guardFieldFight(`pve-exempt-control-${mode}`, mode);
      const combat = state.combat!;
      expect(neutralCombatControllerId(state, combat)).toBe(controller);
      if (mode === "pvp") {
        expect(pvpNeutralControllerId(state, combat)).toBe(controller);
      } else {
        expect(manualGuardControllerId(state, combat)).toBe(controller);
      }

      state = revealArmy(state);
      expect(state.combat!.pendingNeutralPlacement).toBe(controller);
      expect(state.eventLog.some((event) => event.type === "NEUTRAL_FORMATION_SORT_OPENED")).toBe(true);
      expect(neutralDrivingOffers(state, controller).length).toBeGreaterThan(0);
      for (const guard of neutralUnitsOf(state)) {
        expect(combatUnitDecisionOwnerId(state, state.combat!, guard)).toBe(controller);
      }
    });
  });
}
