import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import {
  applyWavePillage,
  beginFieldVisit,
  canCrossEdge,
  drawWaveArmy,
  eliminatePlayer,
  getTileFootprintSpaceIds,
  grantWaveVictoryRewards,
  instantiateTile,
  isSeaField,
  placeCalamityGate,
  tokenPlacementCandidates,
  startAdventureRound
} from "./adventure";
import {
  finalizeAdventureCombat,
  pumpAdventureQueues,
  setTileRotation,
  startNeutralEncounter
} from "./adventure-reducer";
import { waveArmyLevel, waveNumberForRound } from "./monster-waves";
import { NEUTRAL_PLAYER_ID } from "./state";
import { coreUnitDefinitions } from "@/data/factions/units";

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

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Reveal + rotate a Far tile through the real seam (materializes its fields). */
function placeFarTile(
  state: GameState,
  tileDefId: string,
  at: { row: number; col: number }
) {
  const adventure = state.adventure!;
  const tile = instantiateTile(adventure, tileDefId, at, 0, true);
  expect(tile.group).toBe("far");
  tile.awaitingRotation = true;
  adventure.pendingTileChoice = { tileInstanceId: tile.id, playerId: "p1", kind: "place" };
  setTileRotation(state, {
    type: "SET_TILE_ROTATION",
    playerId: "p1",
    tileInstanceId: tile.id,
    rotation: 0
  });
  state.pendingChoice = null;
  return tile;
}

/** Open the wave due at `round` for seat 1 (the barrier's first assault). */
function openWave(state: GameState, round: number): GameState {
  startRound(state, round);
  const context = state.combat?.context;
  expect(context && "waveAssault" in context && context.waveAssault).toBeTruthy();
  return state;
}

/** The invaders as minted for this fight — the stats a battle event must move. */
function neutralStats(state: GameState) {
  return Object.values(state.combat!.units)
    .filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)
    .map((unit) => ({
      unitDefId: unit.unitDefId,
      attack: unit.attack,
      defense: unit.defense,
      initiative: unit.initiative
    }));
}

/** Deploy one hero unit and reveal the waiting wave army. */
function revealWaveArmy(state: GameState): GameState {
  const placement = getLegalActions(state, state.combat!.attackerPlayerId).find(
    (entry) => entry.action.type === "PLACE_COMBAT_UNIT"
  );
  expect(placement, "expected a wave placement offer").toBeTruthy();
  let next = apply(state, placement!.action);
  next = apply(next, {
    type: "FINISH_COMBAT_PLACEMENT",
    playerId: next.combat!.attackerPlayerId
  });
  return next;
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

describe("Calamity Waves — shared map object", () => {
  it("the first Far Blocked Field becomes a themed, revisitable Gate that prepares a player for the next wave", () => {
    const state = wavesGame("waves-calamity-gate", {
      anime: {
        enabled: true,
        monsterWaves: true,
        waveCadence: 3,
        pveTheme: "doom"
      }
    });
    const adventure = state.adventure!;
    const tile = instantiateTile(adventure, "F1", { row: -9, col: -9 }, 0, true);
    tile.awaitingRotation = true;
    adventure.pendingTileChoice = { tileInstanceId: tile.id, playerId: "p1", kind: "place" };
    setTileRotation(state, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: tile.id,
      rotation: 0
    });

    const gateId = adventure.monsterWaves?.gateFieldId;
    expect(gateId).toBeTruthy();
    expect(adventure.fields[gateId!].location).toBe("calamity_gate");
    expect(adventure.pveTheme).toBe("doom");
    expect(state.eventLog.some((event) => event.type === "CALAMITY_GATE_PLACED")).toBe(true);

    state.heroes.hero_p1.spaceId = gateId!;
    beginFieldVisit(state, state.heroes.hero_p1.id, gateId!, true);
    expect(state.players.p1.wavePreparedFor).toBe(1);
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "CALAMITY_GATE_PREPARED" &&
          event.playerId === "p1" &&
          event.wave === 1
      )
    ).toBe(true);
    // It is personal preparation: the shared object's other visitors must scout it too.
    expect(state.players.p2.wavePreparedFor).toBeUndefined();
  });

  it("places with Creature Banks OFF too (the Gate carves ahead of the absent token pile)", () => {
    const state = wavesGame("waves-gate-no-banks", {
      creatureBanks: false,
      wog: { enabled: true, monsterWaves: true, waveCadence: 3 }
    });
    expect(state.adventure?.creatureBankTokensFar).toBeUndefined();
    placeFarTile(state, "F1", { row: -9, col: -9 });
    const gateId = state.adventure!.monsterWaves?.gateFieldId;
    expect(gateId).toBeTruthy();
    expect(state.adventure!.fields[gateId!].location).toBe("calamity_gate");
    // ONE per map: a second Far Blocked Field is not converted.
    const before = gateId;
    placeFarTile(state, "F5", { row: 9, col: 9 });
    expect(state.adventure!.monsterWaves?.gateFieldId).toBe(before);
  });

  it("carves a WALKABLE Gate: the Blocked Field's water terrain and designed border edges are dropped", () => {
    // placeCreatureBank / placeDungeonSite both clear these; the Gate must too,
    // or a mixed-terrain or designer-sealed Blocked Field would carve a hex no
    // hero can ever enter (the preparation would be unreachable).
    const state = wavesGame("waves-gate-walkable");
    const adventure = state.adventure!;
    // The first Far tile's Blocked Field is claimed by the Gate at rotation;
    // a SECOND Far tile keeps its (materialized) Blocked Field, so use that one
    // to drive placeCalamityGate over a hostile hex.
    placeFarTile(state, "F1", { row: -9, col: -9 });
    const second = placeFarTile(state, "F5", { row: 9, col: 9 });
    const blockedId = getTileFootprintSpaceIds(second).find(
      (spaceId) => adventure.fields[spaceId]?.location === "blocked_field"
    )!;
    expect(blockedId).toBeTruthy();
    adventure.fields[blockedId].terrain = "water";
    adventure.fields[blockedId].borderEdges = [0, 1, 2, 3, 4, 5];
    const neighbour = getTileFootprintSpaceIds(second).find((spaceId) => spaceId !== blockedId)!;
    // A Blocked Field is not crossable at all before the carve.
    expect(canCrossEdge(state, neighbour, blockedId)).toBeFalsy();
    expect(isSeaField(state, blockedId)).toBe(true);

    expect(placeCalamityGate(state, blockedId)).toBeTruthy();
    expect(adventure.fields[blockedId].location).toBe("calamity_gate");
    // The observable effect: the Gate hex is crossable again from both sides and
    // is no longer open sea, so a hero can actually walk in and scout it.
    expect(isSeaField(state, blockedId)).toBe(false);
    expect(canCrossEdge(state, neighbour, blockedId)).toBe(true);
    expect(canCrossEdge(state, blockedId, neighbour)).toBe(true);
  });

  it("a designer Monolith token can never overwrite a PvE module hex (Gate / Dungeon / Rift Lair)", () => {
    // All three are one-per-map singletons whose field id is LATCHED in
    // adventure state; overwriting the hex would leave the latch pointing at a
    // Monolith and silently kill the module. They must be as untouchable as a
    // Creature Bank.
    const state = wavesGame("waves-gate-token-safe");
    const adventure = state.adventure!;
    const tile = placeFarTile(state, "F1", { row: -9, col: -9 });
    const gateId = adventure.monsterWaves!.gateFieldId!;
    expect(adventure.fields[gateId].location).toBe("calamity_gate");
    expect(tokenPlacementCandidates(state, tile, "monolith")).not.toContain(gateId);
    // CONTROL: a plain hex of the same tile IS offered, so the exclusion is the
    // location and not the whole tile.
    expect(tokenPlacementCandidates(state, tile, "monolith").length).toBeGreaterThan(0);

    for (const location of ["dungeon_gate", "rift_lair"] as const) {
      const plain = tokenPlacementCandidates(state, tile, "monolith")[0]!;
      const previous = adventure.fields[plain].location;
      adventure.fields[plain].location = location;
      expect(tokenPlacementCandidates(state, tile, "monolith"), location).not.toContain(plain);
      adventure.fields[plain].location = previous;
    }
  });

  it("the wave's battle event REALLY changes the invaders' stats, and Gate preparation REALLY cancels it", () => {
    // Wave 1 rotates in War Drums (+1 Attack). The engine folds the modifier
    // into the minted neutral stats at reveal; the feed line alone proves
    // nothing, so compare the actual Attack values.
    const exposed = wavesGame("waves-event-effect");
    startRound(exposed, 3);
    const revealed = revealWaveArmy(exposed);
    const exposedAttacks = neutralStats(revealed).map((unit) => unit.attack);
    expect(exposedAttacks.length).toBeGreaterThan(0);

    const prepared = wavesGame("waves-event-effect");
    prepared.players.p1.wavePreparedFor = 1;
    startRound(prepared, 3);
    const canceled = revealWaveArmy(prepared);
    const preparedUnits = neutralStats(canceled);
    // Same seed ⇒ the SAME army; only the modifier differs.
    expect(preparedUnits.map((unit) => unit.unitDefId)).toEqual(
      neutralStats(revealed).map((unit) => unit.unitDefId)
    );
    expect(preparedUnits.map((unit) => unit.attack)).toEqual(
      exposedAttacks.map((attack) => attack - 1)
    );
    // CONTROL: preparation is per-WAVE — a hero prepared for a LATER wave is
    // not protected from this one.
    const stale = wavesGame("waves-event-effect");
    stale.players.p1.wavePreparedFor = 2;
    startRound(stale, 3);
    expect(neutralStats(revealWaveArmy(stale)).map((unit) => unit.attack)).toEqual(exposedAttacks);
  });

  it("the Defense / Initiative rotations are real too, and the Gate prepares the NEXT numbered wave", () => {
    // Waves 2 and 3 rotate in Shield Wall (+1 Defense) and Stampede (+2
    // Initiative) — one deterministic rotation, so every wave carries a
    // mechanically real modifier.
    const bare = wavesGame("waves-event-rotation");
    const baseline = neutralStats(revealWaveArmy(openWave(bare, 6)));

    const shielded = wavesGame("waves-event-rotation");
    shielded.players.p1.wavePreparedFor = 2;
    const shieldedUnits = neutralStats(revealWaveArmy(openWave(shielded, 6)));
    expect(baseline.map((unit) => unit.defense)).toEqual(
      shieldedUnits.map((unit) => unit.defense + 1)
    );

    const rushed = wavesGame("waves-event-rotation-3");
    const rushedBase = neutralStats(revealWaveArmy(openWave(rushed, 9)));
    const rushedPrepared = wavesGame("waves-event-rotation-3");
    rushedPrepared.players.p1.wavePreparedFor = 3;
    const rushedUnits = neutralStats(revealWaveArmy(openWave(rushedPrepared, 9)));
    expect(rushedBase.map((unit) => unit.initiative)).toEqual(
      rushedUnits.map((unit) => unit.initiative + 2)
    );

    // The Gate's arithmetic: on round 4 (cadence 3) wave 1 has already fired, so
    // scouting prepares for wave 2.
    const gate = wavesGame("waves-gate-next-wave");
    placeFarTile(gate, "F1", { row: -9, col: -9 });
    const gateId = gate.adventure!.monsterWaves!.gateFieldId!;
    expect(gateId).toBeTruthy();
    gate.round = 4;
    gate.heroes.hero_p1.spaceId = gateId;
    beginFieldVisit(gate, gate.heroes.hero_p1.id, gateId, true);
    expect(gate.players.p1.wavePreparedFor).toBe(2);
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

  it("each wave reveals a real battle event, while Gate preparation cancels it for that player", () => {
    const exposed = wavesGame("waves-event");
    startRound(exposed, 3);
    const revealed = revealWaveArmy(exposed);
    const activeEvent = revealed.eventLog.find(
      (event) => event.type === "MONSTER_WAVE_BATTLE_EVENT" && event.playerId === "p1"
    );
    if (activeEvent?.type !== "MONSTER_WAVE_BATTLE_EVENT") {
      throw new Error("expected the wave battle event");
    }
    expect(activeEvent.eventId).toBe("war_drums");
    expect(activeEvent.message).toMatch(/\+1 Attack/);

    const prepared = wavesGame("waves-event-prepared");
    prepared.players.p1.wavePreparedFor = 1;
    startRound(prepared, 3);
    const canceled = revealWaveArmy(prepared);
    const canceledEvent = canceled.eventLog.find(
      (event) => event.type === "MONSTER_WAVE_BATTLE_EVENT" && event.playerId === "p1"
    );
    if (canceledEvent?.type !== "MONSTER_WAVE_BATTLE_EVENT") {
      throw new Error("expected the canceled wave battle event");
    }
    expect(canceledEvent.message).toMatch(/neutralized/i);
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
    expect(state.activePlayerId).toBe("p1");
  });

  it("Anime Monster Waves return control to player 1 after every queued assault", () => {
    const state = wavesGame("anime-waves-preserve-first-player", {
      wog: { enabled: false },
      anime: { enabled: true, monsterWaves: true, waveCadence: 3 }
    });
    state.activePlayerId = "p1";
    startRound(state, 3);

    expect(state.combat?.attackerPlayerId).toBe("p1");
    settleWaveCombat(state, { winner: "p1", loser: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" });
    expect(state.combat?.attackerPlayerId).toBe("p2");
    settleWaveCombat(state, { winner: "p2", loser: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" });

    expect(state.combat).toBeNull();
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    expect(state.activePlayerId).toBe("p1");
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

  it("the wave director freezes designer-first: map cadence, pressure, and loss rule beat setup", () => {
    const state = createAdventureGameState({
      seed: "waves-cadence-preset",
      rollFirstPlayer: false,
      wog: {
        enabled: true,
        monsterWaves: true,
        waveCadence: 3,
        wavePressure: "standard",
        waveDefeatLimit: 0
      },
      customMapPreset: {
        pveTheme: "doom",
        monsterWaves: { cadence: 5, pressure: "brutal", defeatLimit: 2 }
      }
    });
    expect(state.adventure?.monsterWaves).toMatchObject({
      cadence: 5,
      pressure: "brutal",
      defeatLimit: 2
    });
    expect(state.adventure?.pveTheme).toBe("doom");
  });

  it("anime.monsterWaves is the second surface activating the SAME frozen flag", () => {
    const state = createAdventureGameState({
      seed: "waves-anime-surface",
      rollFirstPlayer: false,
      anime: { enabled: true, monsterWaves: true, waveCadence: 4 }
    });
    expect(state.adventure?.monsterWaves).toMatchObject({
      cadence: 4,
      pressure: "standard",
      defeatLimit: 0,
      gateFieldId: null
    });
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

describe("Calamity Waves — themes and pressure", () => {
  it("a Doom theme mints an all-Doom wave without polluting the shared Neutral decks", () => {
    const state = wavesGame("waves-doom", {
      anime: {
        enabled: true,
        monsterWaves: true,
        waveCadence: 3,
        pveTheme: "doom"
      }
    });
    const draws = drawWaveArmy(state, 2);
    expect(state.adventure?.pveTheme).toBe("doom");
    expect(draws.length).toBeGreaterThan(0);
    expect(draws.every((draw) => draw.unitDefId.startsWith("doom."))).toBe(true);
    expect(draws.every((draw) => draw.bankGuard)).toBe(true);

    // The EFFECT: a minted doom card is a real fighting body (its definition is
    // always registered, independent of the "Doom neutrals" DECK option) and it
    // is NOT a gradeless bank unit — it keeps its printed tier, so tier-gated
    // spells / the neutral AI's tier order / Neutral Rank-Up all still see it.
    const fought = revealWaveArmy(openWave(state, 3));
    const invaders = Object.values(fought.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    );
    expect(invaders.length).toBeGreaterThan(0);
    for (const unit of invaders) {
      const def = coreUnitDefinitions[unit.unitDefId!];
      expect(def, unit.unitDefId).toBeDefined();
      expect(unit.unitDefId!.startsWith("doom.")).toBe(true);
      expect(unit.maxHealth).toBeGreaterThan(0);
      expect(unit.bankUnit).toBeFalsy();
      expect(unit.grade).toBe(def.tier);
    }
  });

  it("a wave assault is FOUGHT on the theme's dedicated calamity board (server-assigned, not client guesswork)", () => {
    // The EFFECT a player sees: the opened assault carries the frozen theme's
    // PvE board id, stamped by the engine at combat creation (the client only
    // renders `combat.boardArtId`). An ordinary guard fight in the SAME game is
    // the CONTROL — it never gets a calamity board.
    for (const [theme, expected] of [
      ["classic", "pve-calamity-classic"],
      ["doom", "pve-calamity-doom"]
    ] as const) {
      const state = wavesGame(`waves-board-${theme}`, {
        anime: { enabled: true, monsterWaves: true, waveCadence: 3, pveTheme: theme }
      });
      const opened = openWave(state, 3);
      expect(opened.combat?.boardArtId, theme).toBe(expected);
    }

    const control = wavesGame("waves-board-control", {
      wog: { enabled: true, monsterWaves: true, waveCadence: 3, pveTheme: "doom" }
    });
    const guarded = Object.values(control.adventure!.fields).find(
      (field) => field.location !== "town" && !field.flagOwnerId
    )!;
    guarded.difficulty = 3;
    control.heroes.hero_p1.spaceId = guarded.spaceId;
    startNeutralEncounter(control, control.heroes.hero_p1, guarded);
    expect(control.combat?.context.kind).toBe("neutral");
    expect(control.combat?.boardArtId).not.toBe("pve-calamity-doom");
    expect(control.combat?.boardArtId).not.toBe("pve-calamity-classic");
  });

  it("Brutal pressure increases rewards/pillage and an optional loss limit eliminates only at the threshold", () => {
    const state = wavesGame("waves-brutal-limit", {
      wog: {
        enabled: true,
        monsterWaves: true,
        waveCadence: 3,
        wavePressure: "brutal",
        waveDefeatLimit: 2
      }
    });
    const winnerGold = state.players.p2.resources.gold;
    const winnerXp = state.heroes.hero_p2.experience ?? 0;
    grantWaveVictoryRewards(state, "p2", 1);
    expect(state.players.p2.resources.gold).toBe(winnerGold + 3);
    expect(state.heroes.hero_p2.experience ?? 0).toBe(winnerXp + 2);

    state.players.p1.resources.gold = 20;
    const moraleBefore = state.players.p1.morale;
    applyWavePillage(state, "p1", 1);
    expect(state.players.p1.resources.gold).toBe(15);
    expect(state.players.p1.morale).toBeLessThan(moraleBefore);
    expect(state.players.p1.eliminated).not.toBe(true);
    applyWavePillage(state, "p1", 2);
    expect(state.players.p1.waveDefeats).toBe(2);
    expect(state.players.p1.eliminated).toBe(true);
  });

  it("a wave-loss elimination that ENDS the game stops the queue: the winner is not dragged into their own assault", () => {
    // The pillage runs inside finalizeAdventureCombat, so hitting the limit
    // eliminates the last opponent MID-QUEUE and last-faction-standing is
    // declared right there. The remaining queued assault must be dropped — the
    // pump would otherwise open a combat for the winner and clear "game-over".
    const state = wavesGame("waves-limit-ends-game", {
      wog: {
        enabled: true,
        monsterWaves: true,
        waveCadence: 3,
        waveDefeatLimit: 2
      }
    });
    state.players.p1.waveDefeats = 1;
    startRound(state, 3);
    expect(state.combat?.attackerPlayerId).toBe("p1");
    settleWaveCombat(state, {
      winner: NEUTRAL_PLAYER_ID,
      loser: "p1",
      reason: "all-enemy-units-defeated"
    });

    expect(state.players.p1.eliminated).toBe(true);
    expect(state.adventure?.winnerPlayerId).toBe("p2");
    expect(state.combat).toBeNull();
    expect(state.phase).toBe("game-over");
    // The barrier still lifts (the sentinel is pumped past the dropped assault).
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    expect(state.adventure?.rewardQueue.some((reward) => reward.kind === "wave-assault")).toBe(
      false
    );

    // CONTROL: with no defeat limit the same loss only pillages, so seat 2's
    // assault DOES open behind the barrier.
    const control = wavesGame("waves-limit-ends-game");
    control.players.p1.waveDefeats = 1;
    startRound(control, 3);
    settleWaveCombat(control, {
      winner: NEUTRAL_PLAYER_ID,
      loser: "p1",
      reason: "all-enemy-units-defeated"
    });
    expect(control.players.p1.eliminated).not.toBe(true);
    expect(control.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(control.combat?.attackerPlayerId).toBe("p2");
  });
});
