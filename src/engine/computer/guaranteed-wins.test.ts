/**
 * Single-player smoothing: a computer seat's first TWO eligible neutral-guard
 * battles are guaranteed flawless one-round wins, resolved through the REAL
 * victory path (XP, card recycling, field visit). Every claim below fails if
 * the wiring in `guaranteed-wins.ts` / `finalizeCombatStart` is removed, and
 * every scope limit has a CONTROL proving the same walk fights for real:
 * - the limit (third battle fights normally),
 * - human seats and multiplayer sessions (never smoothed),
 * - the abuse caps (difficulty III+, a guard above the hero's level, and
 *   Creature Banks all fight for real — the AI cannot use the free win to
 *   leapfrog its natural level-I-then-level-II ladder),
 * - Quick Combat (level > difficulty) neither needs nor consumes a slot.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  standardComputerController,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameState,
} from "../index";
import { getMainHero, placeCreatureBank } from "../adventure";
import { startNeutralEncounter } from "../adventure-reducer";
import {
  COMPUTER_GUARANTEED_WIN_LIMIT,
  computerGuaranteedWinsUsed,
} from "./guaranteed-wins";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(
    result.errors,
    result.errors.map((error) => error.message).join("; "),
  ).toHaveLength(0);
  return result.state;
}

type SetupOptions = {
  /** Seat p1 as a computer (default true). */
  computer?: boolean;
  /** Stamp the single-player session mode (default true). */
  singlePlayer?: boolean;
  /** Guaranteed-win slots already consumed by p1. */
  winsUsed?: number;
  heroLevel?: number;
};

function setup(options: SetupOptions = {}): GameState {
  const state = createAdventureGameState({
    seed: "guaranteed-win-e2e",
    difficulty: "normal",
    rollFirstPlayer: false,
    ...(options.singlePlayer === false
      ? {}
      : { sessionMode: "single-player" as const }),
    ...(options.computer === false
      ? {}
      : { controllers: { p1: standardComputerController() } }),
  });
  const hero = getMainHero(state, "p1")!;
  hero.level = options.heroLevel ?? 1;
  if (options.winsUsed) {
    state.computerGuaranteedWins = { p1: options.winsUsed };
  }
  // Determinism: Diplomacy would open a skip choice at an even fight, Tactics
  // a pre-round swap window — neither is what these tests pin.
  state.players.p1.hand = state.players.p1.hand.filter(
    (id) => id !== "ability.diplomacy" && id !== "ability.tactics",
  );
  return state;
}

/** Puts a fresh guard field of the given difficulty under the hero and walks in. */
function beginGuardFight(state: GameState, difficulty: number): GameState {
  const hero = getMainHero(state, "p1")!;
  state.adventure!.fields["guard-field"] = {
    spaceId: "guard-field",
    tileInstanceId: "t",
    slot: 0,
    location: "treasure_symbol",
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
  };
  hero.spaceId = "guard-field";
  startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
  return state;
}

/** Places one unit and finishes placement — the guards reveal and round 1 would begin. */
function deployAndReveal(state: GameState): GameState {
  expect(state.phase).toBe("combat-setup");
  const armyUnit = state.players.p1.army[0];
  state = applyOk(state, {
    type: "PLACE_COMBAT_UNIT",
    playerId: "p1",
    armyUnitId: armyUnit.id,
    position: 13,
  });
  return applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

function guaranteedWinEvents(state: GameState) {
  return state.eventLog.filter(
    (event) => event.type === "COMPUTER_GUARANTEED_WIN",
  );
}

describe("computer guaranteed first-battle wins (single-player smoothing)", () => {
  it("wins the first eligible guard battle flawlessly in round 1 and grants the REAL rewards", () => {
    let state = setup();
    state = beginGuardFight(state, 1);
    const armyBefore = JSON.stringify(state.players.p1.army);
    const xpBefore = getMainHero(state, "p1")!.experience;
    state = deployAndReveal(state);

    // The win fired before any unit acted: outcome set inside round 1, an
    // explicit event says so, and NOT ONE die was rolled.
    const combat = state.combat!;
    expect(combat.outcome?.winnerPlayerId).toBe("p1");
    expect(combat.outcome?.reason).toBe("all-enemy-units-defeated");
    expect(combat.round).toBe(1);
    expect(guaranteedWinEvents(state)).toMatchObject([
      { playerId: "p1", fieldId: "guard-field", difficulty: 1, battleNumber: 1 },
    ]);
    expect(
      state.eventLog.some((event) => event.type === "ATTACK_ROLLED"),
    ).toBe(false);
    expect(computerGuaranteedWinsUsed(state, "p1")).toBe(1);

    // Flawless: every guard fell, no own unit took a scratch.
    const units = Object.values(combat.units);
    expect(units.some((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)).toBe(
      true,
    );
    for (const unit of units) {
      if (unit.controllerId === NEUTRAL_PLAYER_ID) {
        expect(unit.damage).toBeGreaterThanOrEqual(unit.maxHealth);
      } else {
        expect(unit.damage).toBe(0);
      }
    }

    // Acknowledging runs the REAL victory path: the fight closes, the hero
    // gains the even-fight experience (difficulty === level → +1), and the
    // army is byte-identical — no card lost, no Pack flipped.
    state = applyOk(state, {
      type: "ACKNOWLEDGE_COMBAT_END",
      playerId: "p1",
    });
    expect(state.combat).toBeNull();
    expect(getMainHero(state, "p1")!.experience).toBe(xpBefore + 1);
    expect(JSON.stringify(state.players.p1.army)).toBe(armyBefore);
  });

  it("wins the second battle too, and the THIRD fights for real (the limit is enforced)", () => {
    // Second battle: one slot already consumed.
    let second = setup({ winsUsed: 1 });
    second = beginGuardFight(second, 1);
    second = deployAndReveal(second);
    expect(second.combat?.outcome?.winnerPlayerId).toBe("p1");
    expect(guaranteedWinEvents(second)).toMatchObject([{ battleNumber: 2 }]);
    expect(computerGuaranteedWinsUsed(second, "p1")).toBe(
      COMPUTER_GUARANTEED_WIN_LIMIT,
    );

    // CONTROL — third battle: both slots consumed, the same walk opens a REAL
    // fight (guards alive, no outcome, round 1 waiting to be played).
    let third = setup({ winsUsed: COMPUTER_GUARANTEED_WIN_LIMIT });
    third = beginGuardFight(third, 1);
    third = deployAndReveal(third);
    expect(third.combat?.outcome).toBeNull();
    expect(guaranteedWinEvents(third)).toHaveLength(0);
    expect(
      Object.values(third.combat!.units).some(
        (unit) =>
          unit.controllerId === NEUTRAL_PLAYER_ID &&
          unit.damage < unit.maxHealth,
      ),
    ).toBe(true);
    expect(computerGuaranteedWinsUsed(third, "p1")).toBe(
      COMPUTER_GUARANTEED_WIN_LIMIT,
    );
  });

  it("CONTROL: a HUMAN seat gets no free win — the same walk fights for real", () => {
    let state = setup({ computer: false });
    state = beginGuardFight(state, 1);
    state = deployAndReveal(state);
    expect(state.combat?.outcome).toBeNull();
    expect(guaranteedWinEvents(state)).toHaveLength(0);
    expect(state.computerGuaranteedWins).toBeUndefined();
  });

  it("CONTROL: a multiplayer session gets no free win even for a computer seat", () => {
    let state = setup({ singlePlayer: false });
    state = beginGuardFight(state, 1);
    state = deployAndReveal(state);
    expect(state.combat?.outcome).toBeNull();
    expect(guaranteedWinEvents(state)).toHaveLength(0);
  });

  it("abuse caps: a level-III guard and a guard ABOVE the hero's level both fight for real", () => {
    // Difficulty III at hero level 3 — engageable by the policy, but past the
    // smoothing cap: the free win covers level I/II guards only.
    let high = setup({ heroLevel: 3 });
    high = beginGuardFight(high, 3);
    high = deployAndReveal(high);
    expect(high.combat?.outcome).toBeNull();
    expect(guaranteedWinEvents(high)).toHaveLength(0);

    // Difficulty II at hero level 1 — a fight the policy would never seek; the
    // guarantee must not make reaching above the hero's level profitable.
    let above = setup({ heroLevel: 1 });
    above = beginGuardFight(above, 2);
    above = deployAndReveal(above);
    expect(above.combat?.outcome).toBeNull();
    expect(guaranteedWinEvents(above)).toHaveLength(0);
    expect(computerGuaranteedWinsUsed(above, "p1")).toBe(0);
  });

  it("CONTROL: a Creature Bank never gets the free win — its guards fight for real", () => {
    let state = setup();
    const hero = getMainHero(state, "p1")!;
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
    };
    expect(placeCreatureBank(state, "bank-field", "crypt")).not.toBeNull();
    hero.spaceId = "bank-field";
    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    state = deployAndReveal(state);
    expect(state.combat?.context).toMatchObject({ kind: "neutral", bankId: "crypt" });
    expect(state.combat?.outcome).toBeNull();
    expect(guaranteedWinEvents(state)).toHaveLength(0);
    expect(
      Object.values(state.combat!.units).some(
        (unit) =>
          unit.controllerId === NEUTRAL_PLAYER_ID &&
          unit.damage < unit.maxHealth,
      ),
    ).toBe(true);
    expect(computerGuaranteedWinsUsed(state, "p1")).toBe(0);
  });

  it("Quick Combat (level > difficulty) needs no slot and consumes none", () => {
    let state = setup({ heroLevel: 2 });
    state = beginGuardFight(state, 1);
    // No combat ever opened — the engine's own Quick Combat resolved the walk.
    expect(state.combat).toBeNull();
    expect(
      state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON"),
    ).toBe(true);
    expect(guaranteedWinEvents(state)).toHaveLength(0);
    expect(computerGuaranteedWinsUsed(state, "p1")).toBe(0);
  });
});
