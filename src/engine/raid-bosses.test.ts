import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  type GameAction,
  type GameState
} from "./index";
import { beginFieldVisit, startAdventureRound } from "./adventure";
import { DEFENDER_BACKLINE, finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { RAID_BOSSES } from "@/data/anime/bosses";
import { makeRaidBossCombatUnit, scheduledBossPool } from "./raid-bosses";
import { MAX_CUSTOM_WAVE_OVERRIDES, sanitizeCustomMapPreset } from "./map-preset";
import { NEUTRAL_PLAYER_ID, type MapFieldState } from "./state";

/**
 * Raid Bosses (§6.5) — every claim engine-enforced with CONTROLs: the
 * announced round-4 / spawned round-5 Rift Lair (field conversion + the
 * retry-until-revealed pick), the confirm-prompt lair entry opening a
 * difficulty-0 boss fight (boss pinned back-center, minted from REMAINING
 * layers — wounds persist across attempts and snapshots), the live
 * layer-break payout through the real removal chokepoint, the kill reward +
 * lair clear, escalation (+1 layer every 4th round, capped), designer
 * custom-boss pools, and the module-off byte-silence.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function raidGame(seed: string, options: Record<string, unknown> = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    wog: { enabled: true, raidBosses: true },
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

/** Round 5 spawn, returning the lair record + field. */
function spawnLair(state: GameState): { instanceId: string; fieldId: string; field: MapFieldState } {
  startRound(state, 5);
  const entries = Object.entries(state.adventure!.raidBosses ?? {});
  expect(entries.length, "expected the scheduled boss to spawn").toBe(1);
  const [instanceId, record] = entries[0];
  const field = state.adventure!.fields[record.fieldId];
  expect(field).toBeTruthy();
  return { instanceId, fieldId: record.fieldId, field };
}

/** Walks the p1 hero onto the lair (visit) and answers "Challenge". */
function challengeLair(state: GameState, fieldId: string): GameState {
  const hero = state.heroes.hero_p1;
  state.adventure!.lastVisitedField[hero.id] = hero.spaceId!;
  hero.spaceId = fieldId;
  beginFieldVisit(state, hero.id, fieldId, false);
  expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
  return apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
}

describe("Raid Bosses — spawn schedule", () => {
  it("CONTROL: module OFF — no announcement, no spawn, no lair", () => {
    const state = raidGame("raid-off", { wog: { enabled: true } });
    expect(state.adventure?.raidBosses).toBeUndefined();
    startRound(state, 4);
    startRound(state, 5);
    expect(state.eventLog.some((event) => event.type.startsWith("RAID_BOSS"))).toBe(false);
  });

  it("announces on round 4 ('the sky cracks') and spawns the Rift Lair on round 5, converting the highest-difficulty revealed plain field", () => {
    const state = raidGame("raid-spawn");
    startRound(state, 4);
    expect(state.eventLog.some((event) => event.type === "RAID_BOSS_ANNOUNCED")).toBe(true);
    expect(Object.keys(state.adventure!.raidBosses ?? {}).length).toBe(0);

    const { instanceId, field } = spawnLair(state);
    const record = state.adventure!.raidBosses![instanceId];
    expect(record.scheduled).toBe(true);
    expect(record.spawnedRound).toBe(5);
    // The lair REPLACES the field's printed content: location flips, the guard
    // difficulty is cleared (the boss IS the guard) and the cube resets.
    expect(field.location).toBe("rift_lair");
    expect(field.riftLair).toBe(instanceId);
    expect(field.difficulty).toBeUndefined();
    // Full printed layers at spawn.
    const def = RAID_BOSSES[record.defId];
    expect(def).toBeTruthy();
    expect(record.layersLeft).toBe(def.layers);
    expect(state.eventLog.some((event) => event.type === "RAID_BOSS_SPAWNED")).toBe(true);
  });

  it("the lobby chooses round 4/5/6 arrival, while a designed map's round wins", () => {
    const lobby = raidGame("raid-lobby-round", {
      wog: { enabled: true, raidBosses: true, raidBossSpawnRound: 6 }
    });
    expect(lobby.adventure?.raidBossSpawnRound).toBe(6);
    startRound(lobby, 5);
    expect(lobby.eventLog.some((event) => event.type === "RAID_BOSS_ANNOUNCED")).toBe(true);
    expect(Object.keys(lobby.adventure?.raidBosses ?? {})).toHaveLength(0);
    startRound(lobby, 6);
    expect(Object.keys(lobby.adventure?.raidBosses ?? {})).toHaveLength(1);

    const designed = raidGame("raid-map-round", {
      wog: { enabled: true, raidBosses: true, raidBossSpawnRound: 6 },
      customMapPreset: { raidBosses: { spawnRound: 4 } }
    });
    expect(designed.adventure?.raidBossSpawnRound).toBe(4);
    startRound(designed, 3);
    expect(designed.eventLog.some((event) => event.type === "RAID_BOSS_ANNOUNCED")).toBe(true);
    startRound(designed, 4);
    expect(Object.keys(designed.adventure?.raidBosses ?? {})).toHaveLength(1);
  });

  it("retries the spawn every round until a candidate field is revealed", () => {
    const state = raidGame("raid-retry");
    // Strip every candidate: no revealed field carries a printed difficulty.
    const saved: Array<[string, number]> = [];
    for (const field of Object.values(state.adventure!.fields)) {
      if (field.difficulty) {
        saved.push([field.spaceId, field.difficulty]);
        delete field.difficulty;
      }
    }
    startRound(state, 5);
    expect(Object.keys(state.adventure!.raidBosses ?? {}).length).toBe(0);
    // Guard fields appear (tile reveals in real play): the NEXT round spawns.
    for (const [spaceId, difficulty] of saved) {
      state.adventure!.fields[spaceId].difficulty = difficulty;
    }
    startRound(state, 6);
    expect(Object.keys(state.adventure!.raidBosses ?? {}).length).toBe(1);
  });

  it("a designer custom-boss list REPLACES the catalog pool for the scheduled spawn", () => {
    const state = raidGame("raid-custom-pool");
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      raidBosses: {
        bosses: [
          {
            id: "map_horror",
            name: "The Map Horror",
            attack: 6,
            defense: 1,
            health: 3,
            initiative: 7,
            layers: 4,
            abilities: ["boss-enrage"]
          }
        ]
      }
    };
    expect(scheduledBossPool(state)).toEqual(["map_horror"]);
    const { instanceId } = spawnLair(state);
    expect(state.adventure!.raidBosses![instanceId].defId).toBe("map_horror");
    expect(state.adventure!.raidBosses![instanceId].layersLeft).toBe(4);
  });
});

describe("Raid Bosses — the lair fight", () => {
  it("entering the lair is a confirm prompt; Challenge opens a difficulty-0 fight with the boss pinned back-center at its REMAINING layers", () => {
    const state = raidGame("raid-fight");
    const { instanceId, fieldId } = spawnLair(state);
    const record = state.adventure!.raidBosses![instanceId];
    record.layersLeft = 2; // pre-wounded: the mint must honour remaining layers

    const after = challengeLair(state, fieldId);
    expect(after.combat?.context.kind).toBe("neutral");
    const context = after.combat!.context;
    if (context.kind !== "neutral") {
      throw new Error("expected a neutral raid context");
    }
    expect(context.raidBossId).toBe(instanceId);
    // The bank precedent: no level XP from a raid attempt.
    expect(context.difficulty).toBe(0);

    // The visit is done (no stale empty menu under the fight).
    expect(after.adventure!.pendingVisit).toBeNull();
  });

  it("Withdraw opens no fight — the hero stands at the lair mouth (revisitable), free to Revisit later", () => {
    const state = raidGame("raid-withdraw");
    const { fieldId, instanceId } = spawnLair(state);
    const hero = state.heroes.hero_p1;
    hero.spaceId = fieldId;
    beginFieldVisit(state, hero.id, fieldId, false);
    const after = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 });
    expect(after.combat).toBeNull();
    expect(after.heroes.hero_p1.spaceId).toBe(fieldId);
    // The boss is untouched by a withdrawal.
    expect(after.adventure!.raidBosses![instanceId].layersLeft).toBeGreaterThan(0);
  });

  it("wounds persist: layers shed in one attempt carry to the next (and across a snapshot round-trip)", () => {
    const state = raidGame("raid-wounds");
    const { instanceId, fieldId } = spawnLair(state);
    const fought = challengeLair(state, fieldId);

    // Simulate a fought attempt: place the boss body in the open combat and
    // shed one bar, then retreat out through the REAL finalize write-back.
    const record = fought.adventure!.raidBosses![instanceId];
    const def = RAID_BOSSES[record.defId];
    const boss = makeRaidBossCombatUnit(def, record.layersLeft, "boss_probe", DEFENDER_BACKLINE[1]);
    fought.combat!.units.boss_probe = boss;
    boss.armyStacks = (boss.armyStacks ?? 0) - 1; // one bar broken mid-fight
    fought.combat!.outcome = {
      winnerPlayerId: NEUTRAL_PLAYER_ID,
      defeatedPlayerId: "p1",
      reason: "retreat"
    };
    finalizeAdventureCombat(fought);
    expect(fought.adventure!.raidBosses![instanceId].layersLeft).toBe(def.layers - 1);

    // Snapshot round-trip: the wound survives serialization.
    const restored: GameState = JSON.parse(JSON.stringify(fought));
    expect(restored.adventure!.raidBosses![instanceId].layersLeft).toBe(def.layers - 1);

    // The NEXT attempt opens a fresh fight off the persisted record.
    restored.heroes.hero_p1.spaceId = fieldId;
    const again = challengeLair(restored, fieldId);
    expect(again.combat?.context.kind).toBe("neutral");
  });

  it("every layer broken pays the fighter 2 gold AT ONCE through the real removal chokepoint (+ the per-player ledger)", () => {
    const state = raidGame("raid-layer-pay");
    const { instanceId, fieldId } = spawnLair(state);
    const fought = challengeLair(state, fieldId);

    const record = fought.adventure!.raidBosses![instanceId];
    const def = RAID_BOSSES[record.defId];
    const boss = makeRaidBossCombatUnit(def, def.layers, "boss_probe", DEFENDER_BACKLINE[1]);
    fought.combat!.units.boss_probe = boss;
    const goldBefore = fought.players.p1.resources.gold;

    // A lethal hit through the shared chokepoint sheds one bar → payout.
    boss.damage = boss.maxHealth;
    markUnitRemovedIfNeeded(fought, boss);
    expect(boss.armyStacks).toBe(def.layers - 2);
    expect(fought.players.p1.resources.gold).toBe(goldBefore + 2);
    expect(record.layerBreaks.p1).toBe(1);
    expect(fought.eventLog.some((event) => event.type === "RAID_BOSS_LAYER_BROKEN")).toBe(true);
  });

  it("the KILL pays 5 gold + a relic-tier Artifact search and clears the lair; a later visit is inert", () => {
    const state = raidGame("raid-kill");
    const { instanceId, fieldId } = spawnLair(state);
    const after = challengeLair(state, fieldId);
    const goldBefore = after.players.p1.resources.gold;

    after.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(after);

    const record = after.adventure!.raidBosses![instanceId];
    expect(record.slainBy).toBe("p1");
    expect(record.layersLeft).toBe(0);
    expect(after.players.p1.resources.gold).toBe(goldBefore + 5);
    const first = after.adventure!.rewardQueue[0];
    expect(first?.kind).toBe("shared-deck-search");
    expect(first?.kind === "shared-deck-search" && /artifacts/.test(first.deckId)).toBe(true);
    const field = after.adventure!.fields[fieldId];
    expect(field.riftLair).toBeUndefined();
    expect(field.blackCube).toBe(true);
    expect(after.eventLog.some((event) => event.type === "RAID_BOSS_SLAIN")).toBe(true);

    // A later visit finds nothing to challenge.
    after.adventure!.rewardQueue = [];
    beginFieldVisit(after, after.heroes.hero_p1.id, fieldId, false);
    expect(after.adventure!.pendingVisit).toBeNull();
  });

  it("an ignored boss ESCALATES: +1 layer every 4th round after spawn, capped at the printed layers", () => {
    const state = raidGame("raid-escalate");
    const { instanceId } = spawnLair(state);
    const record = state.adventure!.raidBosses![instanceId];
    const cap = RAID_BOSSES[record.defId].layers;
    record.layersLeft = cap - 1;

    startRound(state, 8); // age 3 — no escalation yet (CONTROL)
    expect(record.layersLeft).toBe(cap - 1);
    startRound(state, 9); // age 4 — regrow
    expect(record.layersLeft).toBe(cap);
    expect(state.eventLog.some((event) => event.type === "RAID_BOSS_ESCALATED")).toBe(true);
    const escalations = state.eventLog.filter((event) => event.type === "RAID_BOSS_ESCALATED").length;
    startRound(state, 13); // age 8 — already at cap: no regrow, no event
    expect(record.layersLeft).toBe(cap);
    expect(state.eventLog.filter((event) => event.type === "RAID_BOSS_ESCALATED").length).toBe(escalations);
  });
});

describe("Designer sanitize — the monsterWaves / raidBosses preset blocks", () => {
  it("keeps a valid monsterWaves block, clamps wave keys/specs, and drops garbage cadence + empty blocks", () => {
    const preset = sanitizeCustomMapPreset({
      monsterWaves: {
        cadence: 5,
        pressure: "brutal",
        defeatLimit: 2,
        waves: {
          1: { units: ["neutral.skeletons"] },
          2: { level: 3 },
          0: { level: 2 }, // wave numbers start at 1 — dropped
          99: { level: 2 }, // beyond the wave rail — dropped
          3: { level: 99 } // unusable spec (level clamps in the shared sanitizer)
        }
      }
    });
    expect(preset?.monsterWaves?.cadence).toBe(5);
    expect(preset?.monsterWaves?.pressure).toBe("brutal");
    expect(preset?.monsterWaves?.defeatLimit).toBe(2);
    expect(preset?.monsterWaves?.waves?.[1]).toEqual({ units: ["neutral.skeletons"] });
    expect(preset?.monsterWaves?.waves?.[2]).toEqual({ level: 3 });
    expect(preset?.monsterWaves?.waves?.[0]).toBeUndefined();
    expect(preset?.monsterWaves?.waves?.[99]).toBeUndefined();

    // Garbage cadence alone ⇒ the whole block is dropped (legacy byte-identical).
    const garbage = sanitizeCustomMapPreset({ monsterWaves: { cadence: 7 } });
    expect(garbage?.monsterWaves).toBeUndefined();
  });

  it("caps the wave-override list at MAX_CUSTOM_WAVE_OVERRIDES", () => {
    const waves = Object.fromEntries(
      Array.from({ length: MAX_CUSTOM_WAVE_OVERRIDES + 2 }, (_, index) => [index + 1, { level: 2 }])
    );
    const preset = sanitizeCustomMapPreset({ monsterWaves: { waves } });
    expect(Object.keys(preset?.monsterWaves?.waves ?? {}).length).toBe(MAX_CUSTOM_WAVE_OVERRIDES);
  });

  it("raidBosses: clamps custom-boss stats to the rails, filters non-whitelist abilities, dedupes ids and clamps the spawn round", () => {
    const preset = sanitizeCustomMapPreset({
      raidBosses: {
        spawnRound: 99,
        bosses: [
          {
            id: "big_bad",
            name: "Big Bad",
            attack: 99,
            defense: -3,
            health: 0,
            initiative: 40,
            layers: 42,
            type: "flying",
            abilities: ["boss-fear", "genie-spell-draw-few", "no-such-thing", "boss-fear"]
          },
          { id: "big_bad", name: "Duplicate Id", attack: 1, defense: 1, health: 1, initiative: 1, layers: 1 },
          { id: "", name: "Nameless", attack: 1, defense: 1, health: 1, initiative: 1, layers: 1 }
        ]
      }
    });
    expect(preset?.raidBosses?.spawnRound).toBe(30);
    expect(preset?.raidBosses?.bosses?.length).toBe(1);
    const boss = preset!.raidBosses!.bosses![0];
    expect(boss).toEqual({
      id: "big_bad",
      name: "Big Bad",
      attack: 15,
      defense: 0,
      health: 1,
      initiative: 12,
      layers: 8,
      type: "flying",
      // Whitelist-filtered and deduped: the deck-digging id can never reach a boss.
      abilities: ["boss-fear"]
    });

    // Empty block ⇒ dropped.
    expect(sanitizeCustomMapPreset({ raidBosses: {} })?.raidBosses).toBeUndefined();
  });

  it("both blocks survive a save/load round-trip through the sanitizer unchanged", () => {
    const original = sanitizeCustomMapPreset({
      pveTheme: "doom",
      monsterWaves: { cadence: 3, pressure: "standard", defeatLimit: 3, waves: { 2: { level: 4 } } },
      raidBosses: { spawnRound: 7, bosses: [{ id: "b1", name: "B1", attack: 4, defense: 1, health: 3, initiative: 6, layers: 2, abilities: ["boss-devour"] }] },
      dungeon: {
        maxFloor: 5,
        descentCost: 2,
        floorBosses: { 5: "b1", 10: "floor_wyrm", 7: "invalid-floor" }
      }
    });
    expect(original?.pveTheme).toBe("doom");
    expect(original?.monsterWaves).toBeTruthy();
    expect(original?.raidBosses).toBeTruthy();
    expect(original?.dungeon).toEqual({
      maxFloor: 5,
      descentCost: 2,
      floorBosses: { 5: "b1", 10: "floor_wyrm" }
    });
    const roundTripped = sanitizeCustomMapPreset(JSON.parse(JSON.stringify(original)));
    expect(roundTripped?.pveTheme).toEqual(original?.pveTheme);
    expect(roundTripped?.monsterWaves).toEqual(original?.monsterWaves);
    expect(roundTripped?.raidBosses).toEqual(original?.raidBosses);
    expect(roundTripped?.dungeon).toEqual(original?.dungeon);
  });
});
