import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getMainHero, type GameAction, type GameState } from "./index";
import { createSecondaryHero } from "./adventure";
import { finalizeAdventureCombat, pumpAdventureQueues, startNeutralEncounter } from "./adventure-reducer";
import type { CombatState, MapFieldState } from "./state";

// ---------------------------------------------------------------------------
// Hero Experience after a WON combat — the printed ladder, pinned as a matrix.
//
// REPORT: "after fight: BUG no exp received with 5 vs 5 ????? (should be
// +0.5 lvl)" — a level-5 hero beating a level-5 hero (and a level-5 hero
// fighting a Field Difficulty Ⅴ guard) is the EQUAL rung, which pays ONE
// experience step. The printed track is 13 boxes: 7 level boxes on the even
// values and 6 half-step boxes on the odd ones (`levelOfExperience` =
// 1 + floor(xp / 2)), so one step IS the "+0.5 level" the report expects and
// it deliberately does NOT change the printed level number.
//
// This suite drives BOTH combat kinds through their real entry points (the
// PvP rows go through `applyAction(ACKNOWLEDGE_COMBAT_END)`, which is what a
// player actually clicks; the neutral rows go through `startNeutralEncounter`
// so the Quick-Combat / fight classification is exercised too) and asserts the
// observable delta — the hero's experience AND level — for every rung, each
// with a CONTROL that must stay at 0.
//
// The equal rung was NOT covered by a matrix before: only single level-1 cases
// existed (`surrender-retreat.test.ts`, `learning-after-combat.test.ts`), so a
// regression on any other level (or on the winner/loser side symmetry) would
// have shipped green.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  const state = createAdventureGameState({
    seed: "pvp-hero-experience",
    ruleset: "binh",
    difficulty: "normal",
    players: [
      { id: "p1", name: "Attacker", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Defender", factionId: "rampart", heroDefId: "mephala" }
    ],
    rollFirstPlayer: false
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

const FIELD_ID = "99,1";

function addField(state: GameState, difficulty: number): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "test-tile",
    slot: 0,
    location: "none",
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[FIELD_ID] = field;
  return field;
}

/** Experience for a hero standing exactly on its level box (even xp). */
function experienceOfLevel(level: number): number {
  return (level - 1) * 2;
}

interface PvpResult {
  /** Experience steps the winner actually gained (the observable delta). */
  gain: number;
  /** The winner's level after the fight. */
  level: number;
  /** The winner's experience box after the fight. */
  experience: number;
  /** The amount on the public EXPERIENCE_GAINED feed line, or 0 when none. */
  reported: number;
}

/**
 * Stages a finished PvP fight between the two main heroes on one field and
 * closes it the way a player does — ACKNOWLEDGE_COMBAT_END through
 * `applyAction`, whose automation pass runs `finalizeAdventureCombat`.
 */
function resolvePvp(options: {
  winnerLevel: number;
  loserLevel: number;
  /** false = the DEFENDER wins (the mirror of every attacker row). */
  attackerWins?: boolean;
  reason?: "all-enemy-units-defeated" | "retreat" | "give-up" | "surrender";
  /** Heroless holding defense: the defender's hero is away (garrison fight). */
  heroless?: boolean;
  /** The beaten hero is the loser's SECONDARY hero, not their Main. */
  secondaryLoser?: boolean;
}): PvpResult {
  const attackerWins = options.attackerWins ?? true;
  const state = makeGame();
  const attackerHero = getMainHero(state, "p1")!;
  const defenderHero = getMainHero(state, "p2")!;
  const winnerHero = attackerWins ? attackerHero : defenderHero;
  const loserHero = attackerWins ? defenderHero : attackerHero;
  winnerHero.level = options.winnerLevel;
  winnerHero.experience = experienceOfLevel(options.winnerLevel);
  loserHero.level = options.loserLevel;
  loserHero.experience = experienceOfLevel(options.loserLevel);
  addField(state, 1);
  attackerHero.spaceId = FIELD_ID;
  defenderHero.spaceId = FIELD_ID;
  state.activePlayerId = "p1";

  let defenderHeroId: string | null = defenderHero.id;
  if (options.heroless) {
    defenderHeroId = null;
  }
  if (options.secondaryLoser) {
    defenderHeroId = createSecondaryHero(state, "p2", FIELD_ID).id;
  }

  const before = winnerHero.experience;
  const eventsBefore = state.eventLog.length;
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    context: { kind: "player", attackerHeroId: attackerHero.id, defenderHeroId, fieldId: FIELD_ID },
    outcome: {
      winnerPlayerId: winnerHero.controllerId,
      defeatedPlayerId: loserHero.controllerId,
      reason: options.reason ?? "all-enemy-units-defeated"
    },
    units: {},
    round: 1
  } as unknown as CombatState;
  state.phase = "combat";

  const action = {
    type: "ACKNOWLEDGE_COMBAT_END",
    playerId: winnerHero.controllerId
  } as unknown as GameAction;
  const result = applyAction(state, action);
  expect(result.errors.map((error) => error.message).join("; ")).toBe("");
  const after = getMainHero(result.state, winnerHero.controllerId)!;
  const reported = result.state.eventLog
    .slice(eventsBefore)
    .filter(
      (event): event is Extract<typeof event, { type: "EXPERIENCE_GAINED" }> =>
        event.type === "EXPERIENCE_GAINED" && event.playerId === winnerHero.controllerId
    )
    .reduce((sum, event) => sum + event.amount, 0);
  return { gain: after.experience - before, level: after.level, experience: after.experience, reported };
}

interface NeutralResult {
  /** Whether a real battlefield opened (false = the guards fell to Quick Combat). */
  fought: boolean;
  gain: number;
  level: number;
}

/**
 * Walks a main hero onto a plain guard field of the given difficulty through
 * the real `startNeutralEncounter` classifier, then WINS whatever fight it
 * opened and finalizes. A Quick-Combat resolution opens no combat at all.
 */
function resolveNeutral(options: {
  heroLevel: number;
  difficulty: number;
  /** Fight a Creature Bank instead of a plain guard field (no experience). */
  bank?: boolean;
}): NeutralResult {
  const state = makeGame();
  const hero = getMainHero(state, "p1")!;
  hero.level = options.heroLevel;
  hero.experience = experienceOfLevel(options.heroLevel);
  const field = addField(state, options.difficulty);
  if (options.bank) {
    field.location = "creature_bank";
    field.bankId = "griffin_conservatory";
  }
  hero.spaceId = FIELD_ID;
  state.activePlayerId = "p1";
  const before = hero.experience;

  startNeutralEncounter(state, hero, field);
  const fought = Boolean(state.combat);
  if (state.combat) {
    (state.combat as CombatState).outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutral",
      reason: "all-enemy-units-defeated"
    } as never;
    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);
  }
  const after = getMainHero(state, "p1")!;
  return { fought, gain: after.experience - before, level: after.level };
}

describe("PvP: beating an enemy Main Hero pays the printed Experience ladder", () => {
  it("the reported 5-vs-5 fight pays the half-level step (level stays Ⅴ; a second such win reaches Ⅵ)", () => {
    const first = resolvePvp({ winnerLevel: 5, loserLevel: 5 });
    // 8 = the level-Ⅴ box; 9 = the half-step box between Ⅴ and Ⅵ.
    expect(first.experience).toBe(9);
    expect(first.gain).toBe(1);
    expect(first.reported).toBe(1);
    // The printed level number deliberately does not move on a half step …
    expect(first.level).toBe(5);

    // … but the step is real: the SAME win taken from the half box levels up.
    const state = makeGame();
    const winner = getMainHero(state, "p1")!;
    const loser = getMainHero(state, "p2")!;
    winner.level = 5;
    winner.experience = 9;
    loser.level = 5;
    loser.experience = 8;
    addField(state, 1);
    winner.spaceId = FIELD_ID;
    loser.spaceId = FIELD_ID;
    state.activePlayerId = "p1";
    state.combat = {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      context: { kind: "player", attackerHeroId: winner.id, defenderHeroId: loser.id, fieldId: FIELD_ID },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
      units: {},
      round: 1
    } as unknown as CombatState;
    state.phase = "combat";
    const result = applyAction(state, {
      type: "ACKNOWLEDGE_COMBAT_END",
      playerId: "p1"
    } as unknown as GameAction);
    expect(result.errors).toHaveLength(0);
    expect(getMainHero(result.state, "p1")!.experience).toBe(10);
    expect(getMainHero(result.state, "p1")!.level).toBe(6);
  });

  it("pays exactly one step at EVERY equal level Ⅰ–Ⅵ, attacking or defending", () => {
    for (let level = 1; level <= 6; level += 1) {
      const attacking = resolvePvp({ winnerLevel: level, loserLevel: level });
      const defending = resolvePvp({ winnerLevel: level, loserLevel: level, attackerWins: false });
      expect(`atk lv${level}: ${attacking.gain}`).toBe(`atk lv${level}: 1`);
      expect(`def lv${level}: ${defending.gain}`).toBe(`def lv${level}: 1`);
      expect(attacking.experience).toBe(experienceOfLevel(level) + 1);
      expect(defending.experience).toBe(experienceOfLevel(level) + 1);
    }
  });

  it("pays a FULL level (two steps) when the beaten hero outranks the winner by 1 or 2", () => {
    for (let level = 1; level <= 5; level += 1) {
      const one = resolvePvp({ winnerLevel: level, loserLevel: level + 1 });
      const two = resolvePvp({ winnerLevel: level, loserLevel: level + 2 });
      expect(`+1 lv${level}: ${one.gain}`).toBe(`+1 lv${level}: 2`);
      expect(`+2 lv${level}: ${two.gain}`).toBe(`+2 lv${level}: 2`);
      expect(one.level).toBe(level + 1);
    }
  });

  it("CONTROL — a LOWER-level beaten hero pays nothing at any level", () => {
    for (let level = 2; level <= 7; level += 1) {
      const one = resolvePvp({ winnerLevel: level, loserLevel: level - 1 });
      expect(`-1 lv${level}: ${one.gain}`).toBe(`-1 lv${level}: 0`);
      if (level >= 3) {
        const two = resolvePvp({ winnerLevel: level, loserLevel: level - 2 });
        expect(`-2 lv${level}: ${two.gain}`).toBe(`-2 lv${level}: 0`);
      }
    }
  });

  it("CONTROL — a level-Ⅶ winner gains nothing: the experience track is already full", () => {
    const result = resolvePvp({ winnerLevel: 7, loserLevel: 7 });
    expect(result.experience).toBe(12);
    expect(result.gain).toBe(0);
    // DOCUMENTED LIMIT (cosmetic, pinned so a change here is conscious): the
    // feed line still announces the REQUESTED step even though the clamp at
    // MAX_EXPERIENCE swallowed it — nothing on the printed track moves.
    expect(result.reported).toBe(1);
  });

  it("CONTROL — a heroless holding defense pays nothing, while the same fight with the hero present pays the step", () => {
    expect(resolvePvp({ winnerLevel: 5, loserLevel: 5, heroless: true }).gain).toBe(0);
    expect(resolvePvp({ winnerLevel: 5, loserLevel: 5 }).gain).toBe(1);
  });

  it("CONTROL — beating a SECONDARY hero pays nothing, while the Main-hero twin pays the step", () => {
    expect(resolvePvp({ winnerLevel: 5, loserLevel: 5, secondaryLoser: true }).gain).toBe(0);
    expect(resolvePvp({ winnerLevel: 5, loserLevel: 5 }).gain).toBe(1);
  });

  it("a retreat or a give-up still pays the step; a paid SURRENDER pays nothing (CONTROL)", () => {
    expect(resolvePvp({ winnerLevel: 5, loserLevel: 5, reason: "retreat" }).gain).toBe(1);
    expect(resolvePvp({ winnerLevel: 5, loserLevel: 5, reason: "give-up" }).gain).toBe(1);
    expect(resolvePvp({ winnerLevel: 5, loserLevel: 5, reason: "surrender" }).gain).toBe(0);
  });
});

describe("Neutral guards: the Field Difficulty ladder pays the same steps", () => {
  it("a FOUGHT win on a field of the hero's own level pays the half-level step (Ⅰ–Ⅵ)", () => {
    for (let level = 1; level <= 6; level += 1) {
      const result = resolveNeutral({ heroLevel: level, difficulty: level });
      expect(`lv${level} vs Ⅴ-equal fought: ${result.fought}`).toBe(`lv${level} vs Ⅴ-equal fought: true`);
      expect(`lv${level} equal: ${result.gain}`).toBe(`lv${level} equal: 1`);
    }
  });

  it("a field ABOVE the hero's level pays a full level; Ⅶ fills the track to level Ⅶ", () => {
    expect(resolveNeutral({ heroLevel: 5, difficulty: 6 }).gain).toBe(2);
    const seven = resolveNeutral({ heroLevel: 5, difficulty: 7 });
    expect(seven.level).toBe(7);
    expect(seven.gain).toBe(4);
  });

  it("CONTROL — a field BELOW the hero's level resolves as Quick Combat and pays nothing", () => {
    for (let level = 2; level <= 7; level += 1) {
      const result = resolveNeutral({ heroLevel: level, difficulty: level - 1 });
      expect(`lv${level} quick: ${result.fought}`).toBe(`lv${level} quick: false`);
      expect(`lv${level} quick gain: ${result.gain}`).toBe(`lv${level} quick gain: 0`);
    }
  });

  it("CONTROL — a Creature Bank is fought but pays no experience (rulebook p.66)", () => {
    const result = resolveNeutral({ heroLevel: 5, difficulty: 5, bank: true });
    expect(result.fought).toBe(true);
    expect(result.gain).toBe(0);
  });
});
