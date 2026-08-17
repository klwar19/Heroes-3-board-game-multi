/**
 * SPECIFIC (per-tile) object plans (obelisk / mine), the designer "first clear
 * wins" condition, and designer HEX EVENTS (invisible triggers) — each claim
 * mutation-checked with global-config / no-plan / mode-off CONTROLs.
 */
import { describe, expect, it } from "vitest";
import {
  beginFieldVisit,
  getMainHero,
  isFieldGuarded,
  materializeTileFields
} from "./adventure";
import {
  createAdventureGameState,
  getPlayerView,
  sanitizeCustomMapPreset,
  sanitizeHexEvent,
  sanitizeHexEvents,
  sanitizeObjectPlans
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import type { GameState, MapFieldState, MapTileState, PlayerId } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

function makeGame(seed = "object-plans"): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest"
  });
}

/** Place the real N15 near tile (it prints BOTH an obelisk and a mine). */
function placeN15(
  state: GameState,
  opts: {
    objectPlans?: MapTileState["objectPlans"];
    globalMines?: { guard?: { level: number }; breakField?: boolean };
    globalObelisks?: { role: "bonus"; guard?: { level: number } };
  } = {}
): { tile: MapTileState; obelisk: MapFieldState; mine: MapFieldState } {
  const adventure = state.adventure!;
  if (opts.globalMines) {
    adventure.mapPreset = { ...(adventure.mapPreset ?? {}), mines: opts.globalMines };
  }
  if (opts.globalObelisks) {
    adventure.mapPreset = { ...(adventure.mapPreset ?? {}), obelisks: opts.globalObelisks };
  }
  const tile: MapTileState = {
    id: "n15-test",
    tileDefId: "N15",
    group: "near",
    faceDown: false,
    centerRow: 40,
    centerCol: 40,
    rotation: 0,
    ...(opts.objectPlans ? { objectPlans: opts.objectPlans } : {})
  } as MapTileState;
  adventure.tiles[tile.id] = tile;
  materializeTileFields(adventure, tile);
  const fields = Object.values(adventure.fields).filter((f) => f.tileInstanceId === tile.id);
  const obelisk = fields.find((f) => f.location === "obelisk")!;
  const mine = fields.find((f) => f.location === "mine")!;
  expect(obelisk).toBeTruthy();
  expect(mine).toBeTruthy();
  return { tile, obelisk, mine };
}

function injectField(
  state: GameState,
  location: string,
  spaceId: string,
  extra: Partial<MapFieldState> = {}
): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    ...extra
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

function visitWithMainHero(state: GameState, playerId: PlayerId, spaceId: string): void {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = spaceId;
  beginFieldVisit(state, hero.id, spaceId, false);
}

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

describe("sanitizeObjectPlans", () => {
  it("keeps valid obelisk/mine plans and drops garbage kinds / empty plans", () => {
    expect(sanitizeObjectPlans(undefined)).toBeUndefined();
    expect(sanitizeObjectPlans({ mine: {} })).toBeUndefined();
    expect(sanitizeObjectPlans({ garbage: { vp: 3 } })).toBeUndefined();
    expect(
      sanitizeObjectPlans({
        mine: { guard: { level: 4 }, vp: 99, winCondition: true, breakField: true },
        obelisk: { reward: { gold: 5 } }
      })
    ).toEqual({
      mine: { guard: { level: 4 }, vp: 10, winCondition: true, breakField: true },
      obelisk: { reward: { gold: 5 } }
    });
  });

  it("round-trips through sanitizeCustomMapPreset for hex events", () => {
    const preset = sanitizeCustomMapPreset({
      hexEvents: [
        { id: "e1", placement: { row: 3, col: 4 }, message: "  Hello  ", vp: 99 },
        { id: "e2", placement: { row: 3, col: 4 }, message: "dup hex dropped" },
        { placement: { row: 9, col: 9 } }, // empty payload → dropped
        { id: "e3", placement: { row: "x", col: 1 }, message: "bad placement" }
      ]
    });
    expect(preset?.hexEvents).toEqual([
      { id: "e1", placement: { row: 3, col: 4 }, message: "Hello", vp: 10 }
    ]);
  });

  it("sanitizeHexEvent keeps guard / reward / mode / replaceVisit", () => {
    expect(
      sanitizeHexEvent({
        id: "amb",
        placement: { row: 1, col: 2 },
        guard: { units: ["neutral.skeletons", "garbage"] },
        winCondition: true,
        reward: { gold: 3, searchArtifact: 2, searchArtifactTimes: 2 },
        mode: "each-player",
        replaceVisit: true
      })
    ).toEqual({
      id: "amb",
      placement: { row: 1, col: 2 },
      guard: { units: ["neutral.skeletons"] },
      winCondition: true,
      reward: { gold: 3, searchArtifact: 2, searchArtifactTimes: 2 },
      mode: "each-player",
      replaceVisit: true
    });
    // Special reward arms (Ability Empower token, morale, Statistic empower…)
    // ride the same CustomFieldReward sanitiser through hex events.
    expect(
      sanitizeHexEvent({
        id: "special",
        placement: { row: 2, col: 3 },
        reward: {
          morale: 1,
          abilityEmpowerToken: true,
          empowerStatistic: true,
          experience: 2,
          movement: 1,
          resourceDice: 1
        }
      })
    ).toEqual({
      id: "special",
      placement: { row: 2, col: 3 },
      reward: {
        morale: 1,
        abilityEmpowerToken: true,
        empowerStatistic: true,
        experience: 2,
        movement: 1,
        resourceDice: 1
      }
    });
    expect(sanitizeHexEvents("garbage" as never)).toEqual([]);
    expect(
      sanitizeHexEvent({
        id: "no-monster",
        placement: { row: 2, col: 4 },
        message: "No fight",
        winCondition: true
      })?.winCondition
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SPECIFIC plans at materialize — override global field-by-field
// ---------------------------------------------------------------------------

describe("per-tile object plans (materialize)", () => {
  it("stamps a SPECIFIC mine guard/reward/VP/winCondition over the global config", () => {
    const state = makeGame("plan-mine");
    const { mine } = placeN15(state, {
      objectPlans: {
        mine: {
          guard: { units: ["neutral.zombies", "neutral.zombies"] },
          reward: { gold: 7 },
          vp: 3,
          winCondition: true,
          breakField: true
        }
      },
      globalMines: { guard: { level: 2 } }
    });
    // Specific certain army wins over the global level guard.
    expect(mine.customGuardUnits).toEqual(["neutral.zombies", "neutral.zombies"]);
    expect(mine.designedGuard).toBe(true);
    expect(mine.designerReward).toEqual({ gold: 7 });
    expect(mine.designerRewardVp).toBe(3);
    expect(mine.designerWinCondition).toBe(true);
    expect(mine.breakField).toBe(true);
  });

  it("CONTROL: no specific plan → the global mine guard applies; no plan at all → printed only", () => {
    const global = makeGame("plan-mine-global");
    const { mine: globalMine } = placeN15(global, { globalMines: { guard: { level: 2 } } });
    expect(globalMine.difficulty).toBe(2);
    expect(globalMine.designedGuard).toBe(true);
    expect(globalMine.designerWinCondition).toBeUndefined();

    const plain = makeGame("plan-mine-plain");
    const { mine: plainMine } = placeN15(plain);
    // N15's mine prints difficulty 5 — untouched without any designer config.
    expect(plainMine.difficulty).toBe(5);
    expect(plainMine.designedGuard).toBeUndefined();
    expect(plainMine.designerReward).toBeUndefined();
  });

  it("SPECIFIC obelisk plan overrides the global obelisk guard; unset fields fall back", () => {
    const state = makeGame("plan-obelisk");
    const { obelisk } = placeN15(state, {
      objectPlans: { obelisk: { guard: { level: 6 }, reward: { treasureDice: 2 } } },
      globalObelisks: { role: "bonus", guard: { level: 1 } }
    });
    expect(obelisk.difficulty).toBe(6);
    expect(obelisk.designerReward).toEqual({ treasureDice: 2 });

    // CONTROL: a plan that only sets a reward keeps the GLOBAL guard (fallback).
    const fallback = makeGame("plan-obelisk-fallback");
    const { obelisk: fallbackObelisk } = placeN15(fallback, {
      objectPlans: { obelisk: { reward: { gold: 2 } } },
      globalObelisks: { role: "bonus", guard: { level: 1 } }
    });
    expect(fallbackObelisk.difficulty).toBe(1);
    expect(fallbackObelisk.designerReward).toEqual({ gold: 2 });
  });
});

// ---------------------------------------------------------------------------
// Designer "first clear wins"
// ---------------------------------------------------------------------------

describe("designer winCondition", () => {
  it("the first player to visit a designerWinCondition field wins immediately", () => {
    const state = makeGame("win-cond");
    injectField(state, "mine", "77,77", {
      designerWinCondition: true,
      settlementResource: "gold"
    });
    visitWithMainHero(state, "p1", "77,77");
    expect(state.adventure!.winnerPlayerId).toBe("p1");
    expect(
      state.eventLog.some(
        (e) => e.type === "GAME_WON" && "reason" in e && String(e.reason).includes("captured the designated")
      )
    ).toBe(true);
  });

  it("CONTROL: without the stamp the same visit wins nothing", () => {
    const state = makeGame("win-cond-off");
    injectField(state, "mine", "77,77", { settlementResource: "gold" });
    visitWithMainHero(state, "p1", "77,77");
    expect(state.adventure!.winnerPlayerId ?? null).toBeNull();
  });

  it("routes through VP scoring when Victory Points mode is on", () => {
    const state = makeGame("win-cond-vp");
    state.adventure!.mapPreset = { victoryPoints: { enabled: true } };
    injectField(state, "mine", "77,77", {
      designerWinCondition: true,
      settlementResource: "gold"
    });
    visitWithMainHero(state, "p1", "77,77");
    // VP mode: the completion scores the table (VP_SCORING event) instead of a
    // raw objective win; a winner is still declared by the scoring.
    expect(state.eventLog.some((e) => e.type === "VP_SCORING")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hex events
// ---------------------------------------------------------------------------

describe("designer hex events", () => {
  function gameWithEvent(
    seed: string,
    event: Record<string, unknown>,
    fieldLocation = "empty_field"
  ): { state: GameState; field: MapFieldState } {
    const state = makeGame(seed);
    const field = injectField(state, fieldLocation, "50,50");
    state.adventure!.hexEvents = {
      "50,50": {
        event: sanitizeHexEvent({ id: "ev", placement: { row: 50, col: 50 }, ...event })!,
        firedPlayerIds: []
      }
    };
    return { state, field };
  }

  it("fires message + reward + VP once for the FIRST player (mode default)", () => {
    const { state } = gameWithEvent("hex-first", { message: "A hidden cache!", reward: { gold: 4 } });
    const before = state.players.p1.resources.gold;
    visitWithMainHero(state, "p1", "50,50");
    expect(state.players.p1.resources.gold).toBe(before + 4);
    expect(state.eventLog.some((e) => e.type === "EVENT_NOTE" && "message" in e && e.message === "A hidden cache!")).toBe(
      true
    );
    // One-shot: the record is spent.
    expect(state.adventure!.hexEvents?.["50,50"]).toBeUndefined();

    // CONTROL: a second visit (other player) finds nothing.
    const p2Before = state.players.p2.resources.gold;
    visitWithMainHero(state, "p2", "50,50");
    expect(state.players.p2.resources.gold).toBe(p2Before);
  });

  it("each-player mode pays every player once", () => {
    const { state } = gameWithEvent("hex-each", { reward: { gold: 2 }, mode: "each-player" });
    const p1Before = state.players.p1.resources.gold;
    visitWithMainHero(state, "p1", "50,50");
    expect(state.players.p1.resources.gold).toBe(p1Before + 2);
    // Re-visit by the SAME player: nothing (fired latch).
    visitWithMainHero(state, "p1", "50,50");
    expect(state.players.p1.resources.gold).toBe(p1Before + 2);
    // A different player still fires.
    const p2Before = state.players.p2.resources.gold;
    visitWithMainHero(state, "p2", "50,50");
    expect(state.players.p2.resources.gold).toBe(p2Before + 2);
    expect(state.adventure!.hexEvents?.["50,50"]?.firedPlayerIds).toEqual(["p1", "p2"]);
  });

  it("ambush guard: springs a REAL fight (stamped designed guard), the win fires the event", () => {
    const { state, field } = gameWithEvent("hex-ambush", {
      message: "Ambushed!",
      reward: { gold: 5 },
      guard: { units: ["neutral.skeletons"] }
    });
    const hero = getMainHero(state, "p1")!;
    hero.level = 7; // even a level-7 hero cannot Quick-Combat a surprise
    const before = state.players.p1.resources.gold;
    visitWithMainHero(state, "p1", "50,50");
    // The visit aborted into a combat; the guard is now stamped on the field.
    expect(state.combat).toBeTruthy();
    expect(field.customGuardUnits).toEqual(["neutral.skeletons"]);
    expect(state.players.p1.resources.gold).toBe(before);

    // Win the fight: minimal minted guard, dead.
    const combat = state.combat!;
    combat.setup = null;
    combat.units.n0 = {
      id: "n0",
      controllerId: NEUTRAL_PLAYER_ID,
      name: "Skeletons",
      cardName: "Neutral Skeletons",
      variant: "neutral",
      grade: "bronze",
      type: "melee",
      attack: 1,
      defense: 0,
      maxHealth: 2,
      damage: 2,
      initiative: 1,
      position: 0,
      unitDefId: "neutral.skeletons",
      bankGuard: true,
      abilities: []
    } as never;
    combat.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "victory"
    } as never;
    finalizeAdventureCombat(state);

    // The post-win visit fired the event: reward paid, guard swept, record spent.
    expect(state.players.p1.resources.gold).toBe(before + 5);
    expect(isFieldGuarded(field)).toBe(false);
    expect(field.customGuardUnits).toBeUndefined();
    expect(state.adventure!.hexEvents?.["50,50"]).toBeUndefined();
  });

  it("monster objective declares the guard's actual defeater (and not the initial trigger)", () => {
    const { state } = gameWithEvent("hex-monster-win", {
      message: "Slay the marked monster!",
      guard: { units: ["neutral.skeletons"] },
      winCondition: true
    });
    visitWithMainHero(state, "p1", "50,50");
    expect(state.adventure!.winnerPlayerId).toBeNull();
    expect(state.combat).toBeTruthy();

    const combat = state.combat!;
    combat.setup = null;
    combat.units.n0 = {
      id: "n0",
      controllerId: NEUTRAL_PLAYER_ID,
      name: "Skeletons",
      cardName: "Neutral Skeletons",
      variant: "neutral",
      grade: "bronze",
      type: "melee",
      attack: 1,
      defense: 0,
      maxHealth: 2,
      damage: 2,
      initiative: 1,
      position: 0,
      unitDefId: "neutral.skeletons",
      bankGuard: true,
      abilities: []
    } as never;
    combat.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "victory"
    } as never;
    finalizeAdventureCombat(state);

    expect(state.adventure!.winnerPlayerId).toBe("p1");
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "GAME_WON" &&
          "reason" in event &&
          String(event.reason).includes("defeated the monster at 50,50")
      )
    ).toBe(true);
  });

  it("RETREATING from a sprung ambush returns the hero WHENCE THEY CAME (not onto the ambush hex)", () => {
    // Mutation control: without the lastVisitedField restore, beginFieldVisit's
    // own stamp makes the retreat "return" the hero onto the ambush field —
    // standing on a live guard, which a normal guarded arrival never allows.
    const { state } = gameWithEvent("hex-ambush-retreat", {
      reward: { gold: 5 },
      guard: { units: ["neutral.skeletons"] }
    });
    injectField(state, "empty_field", "49,49");
    const hero = getMainHero(state, "p1")!;
    state.adventure!.lastVisitedField[hero.id] = "49,49";
    visitWithMainHero(state, "p1", "50,50");
    expect(state.combat).toBeTruthy();

    const combat = state.combat!;
    combat.setup = null;
    combat.units.n0 = {
      id: "n0",
      controllerId: NEUTRAL_PLAYER_ID,
      name: "Skeletons",
      cardName: "Neutral Skeletons",
      variant: "neutral",
      grade: "bronze",
      type: "melee",
      attack: 1,
      defense: 0,
      maxHealth: 2,
      damage: 0,
      initiative: 1,
      position: 0,
      unitDefId: "neutral.skeletons",
      bankGuard: true,
      abilities: []
    } as never;
    combat.outcome = {
      winnerPlayerId: NEUTRAL_PLAYER_ID,
      defeatedPlayerId: "p1",
      reason: "retreat"
    } as never;
    finalizeAdventureCombat(state);
    expect(hero.spaceId, "pulled back to the previous field").toBe("49,49");
    // The sprung guard stays on the field for the next attempt.
    expect(state.adventure!.fields["50,50"].customGuardUnits).toEqual(["neutral.skeletons"]);
  });

  it("replaceVisit suppresses the field's normal visit on the triggering entry only", () => {
    const state = makeGame("hex-replace");
    // A visitable field would normally stamp its black cube on the visit.
    const field = injectField(state, "resource_symbol", "50,50", { settlementResource: null });
    void field;
    state.adventure!.hexEvents = {
      "50,50": {
        event: sanitizeHexEvent({
          id: "ev",
          placement: { row: 50, col: 50 },
          message: "Override!",
          replaceVisit: true
        })!,
        firedPlayerIds: []
      }
    };
    visitWithMainHero(state, "p1", "50,50");
    // The event note fired…
    expect(state.eventLog.some((e) => e.type === "EVENT_NOTE" && "message" in e && e.message === "Override!")).toBe(true);
    // …and the field's own visit did NOT run on this entry (no black cube yet).
    expect(state.adventure!.fields["50,50"].blackCube).toBe(false);
    // Next entry behaves normally (the one-shot event is spent).
    visitWithMainHero(state, "p1", "50,50");
    expect(state.adventure!.fields["50,50"].blackCube).toBe(true);
  });

  it("setup carves only events that land on the map; player views never see them", () => {
    // Skirmish start positions (the vii-field test's constants): the event on
    // p1's home-tile CENTER hex is on the map; row 999 is nowhere.
    const state = createAdventureGameState({
      seed: "hex-carve",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: [
        { row: 8, col: 2, group: "starting", faceDown: false },
        { row: 10, col: 7, group: "starting", faceDown: false }
      ],
      customMapPreset: {
        hexEvents: [
          { id: "on-map", placement: { row: 8, col: 2 }, message: "hi" },
          { id: "off-map", placement: { row: 999, col: 999 }, message: "lost" }
        ]
      }
    });
    const entries = Object.values(state.adventure!.hexEvents ?? {});
    expect(entries.map((entry) => entry.event.id)).toEqual(["on-map"]);

    // REDACTED for every viewer: live records AND the preset list.
    const view = getPlayerView(state, "p1");
    expect(view.adventure!.hexEvents).toBeUndefined();
    expect(view.adventure!.mapPreset?.hexEvents).toBeUndefined();
    // CONTROL: the raw state still carries the preset list (engine truth).
    expect(state.adventure!.mapPreset?.hexEvents?.length).toBe(2);
  });
});
