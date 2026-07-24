import { describe, expect, it } from "vitest";
import { createAdventureGameState, type GameState, type PlayerId } from "./index";
import { drawWaveArmy, eliminatePlayer, startAdventureRound } from "./adventure";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { waveArmyLevel, waveNumberForRound } from "./monster-waves";
import { NEUTRAL_PLAYER_ID } from "./state";

/**
 * Calamity Waves (§6.6) — every claim engine-enforced with CONTROLs:
 * schedule purity, the round-before announcement, per-seat assaults behind the
 * round-start barrier (seat order, one combat at a time), difficulty-0
 * unlimited-round contexts, the win reward (2 gold + 1 XP + a Treasure die
 * from wave 3), PILLAGE on any non-win (gold floor + the nearest holding
 * overrun and re-guarded), the skipped field visit, elimination mid-queue,
 * designer wave overrides, and the module-off byte-silence.
 */

/** A 2-player game with Calamity Waves ON at cadence 3 (waves on rounds 3, 6…). */
function wavesGame(seed: string, options: Record<string, unknown> = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    wog: { enabled: true, monsterWaves: true, waveCadence: 3 },
    ...options
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  return state;
}

function startRound(state: GameState, round: number): void {
  state.round = round;
  startAdventureRound(state);
  pumpAdventureQueues(state);
}

/** Force-resolve the OPEN wave combat with the given outcome, then finalize. */
function settleWaveCombat(
  state: GameState,
  outcome: { winner: PlayerId; loser: PlayerId; reason: "all-enemy-units-defeated" | "retreat" }
): void {
  expect(state.combat, "expected an open wave combat").toBeTruthy();
  state.combat!.outcome = {
    winnerPlayerId: outcome.winner,
    defeatedPlayerId: outcome.loser,
    reason: outcome.reason
  };
  finalizeAdventureCombat(state);
  pumpAdventureQueues(state);
}

describe("Calamity Waves — schedule purity", () => {
  it("waveNumberForRound: wave k fires on round k × cadence, quiet otherwise", () => {
    expect(waveNumberForRound(3, 2)).toBeNull();
    expect(waveNumberForRound(3, 3)).toBe(1);
    expect(waveNumberForRound(3, 4)).toBeNull();
    expect(waveNumberForRound(3, 6)).toBe(2);
    expect(waveNumberForRound(4, 4)).toBe(1);
    expect(waveNumberForRound(4, 8)).toBe(2);
    expect(waveNumberForRound(5, 10)).toBe(2);
  });

  it("waveArmyLevel ramps wave+1 and caps at 5", () => {
    expect(waveArmyLevel(1)).toBe(2);
    expect(waveArmyLevel(3)).toBe(4);
    expect(waveArmyLevel(4)).toBe(5);
    expect(waveArmyLevel(9)).toBe(5);
  });
});

describe("Calamity Waves — the wave round", () => {
  it("CONTROL: with the module OFF, a wave round starts with no wave event and no assault", () => {
    const state = wavesGame("waves-off-control", { wog: { enabled: true } });
    expect(state.adventure?.monsterWaves).toBeUndefined();
    startRound(state, 3);
    expect(state.eventLog.some((event) => event.type.startsWith("MONSTER_WAVE"))).toBe(false);
    expect(state.combat).toBeNull();
  });

  it("the round BEFORE a wave announces it ('the Gate groans')", () => {
    const state = wavesGame("waves-announce");
    startRound(state, 2);
    const announce = state.eventLog.find((event) => event.type === "MONSTER_WAVE_ANNOUNCED");
    expect(announce).toBeTruthy();
    expect(announce?.type === "MONSTER_WAVE_ANNOUNCED" && announce.wave).toBe(1);
    // No assault yet — the wave itself fires next round.
    expect(state.combat).toBeNull();
  });

  it("on the wave round every live seat's assault queues in seat order behind ONE barrier, resolving one combat at a time", () => {
    const state = wavesGame("waves-assaults");
    startRound(state, 3);

    // The barrier is up and seat 1's assault combat is OPEN (combat-setup).
    expect(state.adventure?.eventResolution?.round).toBe(3);
    expect(state.combat?.context.kind).toBe("neutral");
    const context1 = state.combat!.context;
    if (context1.kind !== "neutral") {
      throw new Error("expected a neutral wave context");
    }
    expect(context1.waveAssault).toEqual({ wave: 1 });
    // Bank precedent: no level XP (difficulty 0) and the assault is fought out.
    expect(context1.difficulty).toBe(0);
    expect(context1.unlimitedRounds).toBe(true);
    expect(state.combat!.attackerPlayerId).toBe("p1");
    // Seat 2's assault still WAITS in the queue behind the open fight.
    expect(
      state.adventure!.rewardQueue.some(
        (reward) => reward.kind === "wave-assault" && reward.playerId === "p2"
      )
    ).toBe(true);

    // Seat 1 wins: seat 2's assault opens next; the barrier is STILL up.
    settleWaveCombat(state, { winner: "p1", loser: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" });
    expect(state.adventure?.eventResolution?.round).toBe(3);
    expect(state.combat?.attackerPlayerId).toBe("p2");

    // Seat 2 resolves too: the sentinel lifts the whole-table freeze.
    settleWaveCombat(state, { winner: "p2", loser: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" });
    expect(state.combat).toBeNull();
    expect(state.adventure?.eventResolution ?? null).toBeNull();
  });

  it("an eliminated seat's queued assault is dropped, not opened", () => {
    const state = wavesGame("waves-eliminated");
    startRound(state, 3);
    expect(state.combat?.attackerPlayerId).toBe("p1");
    // p2 concedes while p1's assault is open.
    eliminatePlayer(state, "p2", "gave up", true);
    settleWaveCombat(state, { winner: "p1", loser: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" });
    // No second assault opened for the dead seat; the barrier lifted.
    expect(state.combat).toBeNull();
    expect(state.adventure?.eventResolution ?? null).toBeNull();
  });
});

describe("Calamity Waves — outcomes", () => {
  it("repelling the assault pays 2 gold + 1 hero XP and SKIPS the field visit (the hero merely stands there)", () => {
    const state = wavesGame("waves-win");
    startRound(state, 3);
    // Measure AFTER the round-start income, with seat 1's assault open.
    const goldBefore = state.players.p1.resources.gold;
    const xpBefore = state.heroes.hero_p1.experience ?? 0;
    const fieldVisitsBefore = state.eventLog.filter((event) => event.type === "FIELD_VISITED").length;
    settleWaveCombat(state, { winner: "p1", loser: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" });

    expect(state.players.p1.resources.gold).toBe(goldBefore + 2);
    expect(state.heroes.hero_p1.experience ?? 0).toBe(xpBefore + 1);
    expect(
      state.eventLog.some((event) => event.type === "MONSTER_WAVE_REPELLED" && event.playerId === "p1")
    ).toBe(true);
    // The win never re-visits the field under the hero (no wave-win FIELD_VISITED).
    expect(state.eventLog.filter((event) => event.type === "FIELD_VISITED").length).toBe(fieldVisitsBefore);
    // Wave 1 pays no Treasure die (that starts at wave 3).
    expect(
      state.adventure!.rewardQueue.some(
        (reward) => reward.kind === "visit-steps" && reward.playerId === "p1"
      )
    ).toBe(false);
  });

  it("from wave 3 on the win also queues one Treasure-die roll", () => {
    const state = wavesGame("waves-win-die");
    startRound(state, 9); // cadence 3 → wave 3
    const context = state.combat!.context;
    expect(context.kind === "neutral" && context.waveAssault?.wave).toBe(3);
    state.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);
    // The die is unshifted to the queue FRONT (the winner rolls before seat 2's assault).
    const first = state.adventure!.rewardQueue[0];
    expect(first?.kind).toBe("visit-steps");
    expect(
      first?.kind === "visit-steps" && first.steps.some((step) => step.type === "ROLL_TREASURE_DICE")
    ).toBe(true);
  });

  it("PILLAGE on a loss: 3 gold plundered (floored) and the mine nearest home is overrun — flag removed, level-Ⅰ guard re-seeded; the hero stays put", () => {
    const state = wavesGame("waves-pillage");
    // Seed a flagged mine for p1 so the overrun has a target.
    const mine = Object.values(state.adventure!.fields).find((field) => field.location === "mine");
    expect(mine, "expected a mine on the map").toBeTruthy();
    mine!.flagOwnerId = "p1";
    mine!.everFlagged = true;
    mine!.blackCube = true;
    delete mine!.difficulty;

    startRound(state, 3);
    state.players.p1.resources.gold = 2; // less than the 3-gold pillage → floored
    const heroSpace = state.heroes.hero_p1.spaceId;
    settleWaveCombat(state, { winner: NEUTRAL_PLAYER_ID, loser: "p1", reason: "all-enemy-units-defeated" });

    expect(state.players.p1.resources.gold).toBe(0);
    expect(mine!.flagOwnerId).toBeNull();
    expect(mine!.difficulty).toBe(1);
    expect(mine!.blackCube).toBe(false);
    expect(mine!.everFlagged).toBe(false);
    const pillage = state.eventLog.find((event) => event.type === "MONSTER_WAVE_PILLAGED");
    expect(pillage?.type === "MONSTER_WAVE_PILLAGED" && pillage.overrunFieldId).toBe(mine!.spaceId);
    // The assault came TO the hero: no bounce home, no retreat step.
    expect(state.heroes.hero_p1.spaceId).toBe(heroSpace);
  });

  it("retreating from the assault is pillage too, and the hero still stays put (no lastVisitedField bounce)", () => {
    const state = wavesGame("waves-retreat");
    startRound(state, 3);
    const heroSpace = state.heroes.hero_p1.spaceId!;
    // Fake a stale lastVisitedField that a normal retreat would bounce to.
    state.adventure!.lastVisitedField[state.heroes.hero_p1.id] = heroSpace;
    const goldBefore = state.players.p1.resources.gold;
    settleWaveCombat(state, { winner: NEUTRAL_PLAYER_ID, loser: "p1", reason: "retreat" });
    expect(state.players.p1.resources.gold).toBe(Math.max(0, goldBefore - 3));
    expect(state.heroes.hero_p1.spaceId).toBe(heroSpace);
    expect(state.eventLog.some((event) => event.type === "MONSTER_WAVE_PILLAGED")).toBe(true);
  });

  it("CONTROL: pillage with NO flagged holding loses gold only (no overrun)", () => {
    const state = wavesGame("waves-pillage-nothing");
    startRound(state, 3);
    settleWaveCombat(state, { winner: NEUTRAL_PLAYER_ID, loser: "p1", reason: "all-enemy-units-defeated" });
    const pillage = state.eventLog.find((event) => event.type === "MONSTER_WAVE_PILLAGED");
    expect(pillage?.type === "MONSTER_WAVE_PILLAGED" && pillage.overrunFieldId).toBeNull();
  });
});

describe("Calamity Waves — the wave army", () => {
  it("a standard wave draws the level table (wave 1 → a level-2 party from the real neutral decks)", () => {
    const state = wavesGame("waves-army");
    const draws = drawWaveArmy(state, 1);
    // NORMAL difficulty level 2 = 2 bronze bodies.
    expect(draws.length).toBe(2);
    expect(draws.every((draw) => draw.tier === "bronze")).toBe(true);
  });

  it("a designer exact-wave override REPLACES the level draw for that wave (and only that wave)", () => {
    const state = wavesGame("waves-designed");
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      monsterWaves: { waves: { 1: { units: ["neutral.skeletons", "neutral.skeletons"] } } }
    };
    const designed = drawWaveArmy(state, 1);
    expect(designed.map((draw) => draw.unitDefId)).toEqual(["neutral.skeletons", "neutral.skeletons"]);
    // CONTROL: wave 2 keeps the level-table draw (level 3 on NORMAL = 3 bodies).
    const normal = drawWaveArmy(state, 2);
    expect(normal.length).toBe(3);
  });

  it("the cadence freezes designer-first: preset cadence beats the mod option", () => {
    const state = createAdventureGameState({
      seed: "waves-cadence-preset",
      rollFirstPlayer: false,
      wog: { enabled: true, monsterWaves: true, waveCadence: 3 },
      customMapPreset: { monsterWaves: { cadence: 5 } }
    });
    expect(state.adventure?.monsterWaves?.cadence).toBe(5);
  });

  it("anime.monsterWaves is the second surface activating the SAME frozen flag", () => {
    const state = createAdventureGameState({
      seed: "waves-anime-surface",
      rollFirstPlayer: false,
      anime: { enabled: true, monsterWaves: true, waveCadence: 4 }
    });
    expect(state.adventure?.monsterWaves).toEqual({ cadence: 4 });
  });
});

describe("Calamity Waves — a COMPUTER seat's assault is driven under the barrier", () => {
  it("computerDecisionOwner claims the AI's open wave combat (the barrier's resolver is null during a fight)", async () => {
    const { computerDecisionOwner } = await import("./computer/window");
    const state = createAdventureGameState({
      seed: "waves-ai-owner",
      difficulty: "normal",
      rollFirstPlayer: false,
      sessionMode: "single-player",
      playerCount: 2,
      wog: { enabled: true, monsterWaves: true, waveCadence: 3 }
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;

    startRound(state, 3);
    // Seat 1 (the human) fights first; settle it, then the AI seat's assault opens.
    expect(state.combat?.attackerPlayerId).toBe("p1");
    settleWaveCombat(state, { winner: "p1", loser: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" });
    expect(state.combat?.attackerPlayerId).toBe("p2");
    expect(state.adventure?.eventResolution?.round).toBe(3);
    // The barrier is up AND a combat is open: the owner read must fall through
    // to the combat block and claim the computer fighter — reverting the
    // `!state.combat` guard in computerDecisionOwner returns null here and the
    // whole table hangs (the all-on soak's stall).
    expect(computerDecisionOwner(state)).toBe("p2");
  });
});

// A frozen bystander during the wave barrier (parallel-mode seam) — the
// action-level freeze is pinned by the shared barrier suites
// (round-start-event-barrier.test.ts); here we pin that waves USE that exact
// machinery (eventResolution + the trailing sentinel), which those suites gate.
describe("Calamity Waves — barrier reuse", () => {
  it("a wave round leaves exactly ONE trailing barrier sentinel in the queue", () => {
    const state = wavesGame("waves-single-sentinel");
    startRound(state, 3);
    const sentinels = state.adventure!.rewardQueue.filter(
      (reward) => reward.kind === "round-start-events-resolved"
    );
    expect(sentinels.length).toBe(1);
    // And it sits AFTER the remaining assault steps.
    const lastAssault = state.adventure!.rewardQueue.map((reward) => reward.kind).lastIndexOf("wave-assault");
    const sentinelIndex = state.adventure!.rewardQueue.map((reward) => reward.kind).indexOf("round-start-events-resolved");
    expect(sentinelIndex).toBeGreaterThan(lastAssault);
  });
});
