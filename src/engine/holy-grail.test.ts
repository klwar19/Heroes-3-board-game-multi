import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  beginFieldVisit,
  canDigGrail,
  grailObelisksVisitedCount,
  getMainHero
} from "./adventure";
import { revisitField } from "./adventure-reducer";
import { createAdventureGameState } from "./index";
import { getLegalActions } from "./legal-actions";
import type { GameState, MapFieldState, MapSpaceId, PlayerId } from "./state";
import { GRAIL_OBELISKS_REQUIRED } from "./state";

/**
 * Holy Grail win condition: map seeds ≥2 Grail dig sites (when tiles allow)
 * and ≥2 Obelisks (designer presets count); a player must visit 2 distinct
 * Obelisks before they may dig (1 MP) and carry the Grail home.
 * Obelisk die rewards remain a separate house rule (`obelisk-rewards`).
 */

function makeGrailGame(seed = "holy-grail", extra: { scenarioId?: string } = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "grail",
    ...(extra.scenarioId ? { scenarioId: extra.scenarioId } : {})
  });
  // Clear the opening hand gate so map actions / legal digs resolve cleanly.
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

function injectObelisk(state: GameState, spaceId: MapSpaceId): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: `obelisk-tile-${spaceId}`,
    slot: 0,
    location: "obelisk",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

function parkHero(state: GameState, playerId: PlayerId, field: MapFieldState) {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = field.spaceId;
  return hero;
}

function countLocations(state: GameState, location: string): number {
  return Object.values(state.adventure!.fields).filter((field) => field.location === location).length;
}

function countLocationTiles(state: GameState, location: string): number {
  // Face-down tiles still contribute their def locations once materialised into
  // fields; for face-down-only maps count tile defs as well.
  const fromFields = countLocations(state, location);
  if (fromFields > 0) {
    return fromFields;
  }
  return Object.values(state.adventure!.tiles).filter((tile) =>
    (allTileDefinitions[tile.tileDefId]?.fields ?? []).some((field) => field.location === location)
  ).length;
}

describe("Holy Grail — map seeding", () => {
  it("seeds at least 2 Obelisks on a standard layout", () => {
    const state = makeGrailGame("holy-grail-obelisks");
    expect(countLocationTiles(state, "obelisk")).toBeGreaterThanOrEqual(2);
  });

  it("seeds 2 Grail dig sites when the layout has room (land-2p has Far slots for overflow)", () => {
    // Skirmish only has 2 Near + 1 Center — Obelisks take Near first so dig is
    // completable; land-2p has Far layout slots for the second Grail too.
    const state = makeGrailGame("holy-grail-two-sites", { scenarioId: "land-2p" });
    expect(countLocationTiles(state, "grail")).toBeGreaterThanOrEqual(2);
    expect(countLocationTiles(state, "obelisk")).toBeGreaterThanOrEqual(2);
  });

  it("counts map-designer preset Obelisks toward the 2-Obelisk seed (no double force)", () => {
    // Two Near slots secretly guarantee Obelisks; engine must not need to force more.
    const state = createAdventureGameState({
      seed: "holy-grail-designer-obelisks",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "grail",
      customMap: [
        { row: 9, col: 4, group: "center", faceDown: true },
        { row: 7, col: 6, group: "near", faceDown: true, secretFeature: "obelisk" },
        { row: 11, col: 2, group: "near", faceDown: true, secretFeature: "obelisk" },
        { row: 8, col: 2, group: "starting", faceDown: false },
        { row: 10, col: 7, group: "starting", faceDown: false }
      ]
    });
    expect(countLocationTiles(state, "obelisk")).toBeGreaterThanOrEqual(2);
    // Both secret Near slots should have resolved to Obelisk-bearing tiles.
    const nearTiles = Object.values(state.adventure!.tiles).filter((tile) => tile.group === "near");
    const nearWithObelisk = nearTiles.filter((tile) =>
      (allTileDefinitions[tile.tileDefId]?.fields ?? []).some((field) => field.location === "obelisk")
    );
    expect(nearWithObelisk.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Holy Grail — dig unlock (2 Obelisks)", () => {
  it("does not offer Dig until the player has visited 2 distinct Obelisks", () => {
    const state = makeGrailGame("holy-grail-dig-gate");
    // Suppress die-reward visits so pendingVisit does not block legal digs.
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "obelisk-rewards": false };
    const o1 = injectObelisk(state, "60,60");
    const o2 = injectObelisk(state, "61,61");
    const grailField: MapFieldState = {
      spaceId: "70,70",
      tileInstanceId: "grail-tile",
      slot: 0,
      location: "grail",
      difficulty: 7,
      blackCube: true,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      grailDiggable: true
    };
    state.adventure!.fields[grailField.spaceId] = grailField;
    state.adventure!.grail = { status: "uncollected", obelisksVisited: {} };

    const hero = parkHero(state, "p1", grailField);
    hero.movementPoints = 3;

    expect(canDigGrail(state, "p1")).toBe(false);
    expect(
      getLegalActions(state, "p1").some((legal) => legal.label.startsWith("Dig the Grail"))
    ).toBe(false);

    // Visit first Obelisk — still locked.
    parkHero(state, "p1", o1);
    beginFieldVisit(state, hero.id, o1.spaceId, false);
    expect(grailObelisksVisitedCount(state, "p1")).toBe(1);
    expect(canDigGrail(state, "p1")).toBe(false);

    // Visit second Obelisk — dig unlocks.
    parkHero(state, "p1", o2);
    beginFieldVisit(state, hero.id, o2.spaceId, false);
    expect(grailObelisksVisitedCount(state, "p1")).toBe(GRAIL_OBELISKS_REQUIRED);
    expect(canDigGrail(state, "p1")).toBe(true);

    parkHero(state, "p1", grailField);
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    expect(
      getLegalActions(state, "p1").some((legal) => legal.label.startsWith("Dig the Grail"))
    ).toBe(true);
  });

  it("rejects a forged dig before 2 Obelisks (no movement spent)", () => {
    const state = makeGrailGame("holy-grail-forged-dig");
    const grailField: MapFieldState = {
      spaceId: "70,70",
      tileInstanceId: "grail-tile",
      slot: 0,
      location: "grail",
      difficulty: 7,
      blackCube: true,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      grailDiggable: true
    };
    state.adventure!.fields[grailField.spaceId] = grailField;
    state.adventure!.grail = { status: "uncollected" };
    const hero = parkHero(state, "p1", grailField);
    hero.movementPoints = 2;

    expect(() =>
      revisitField(state, { type: "REVISIT_FIELD", playerId: "p1", heroId: hero.id })
    ).toThrow(/visit 2 Obelisks/i);
    expect(hero.movementPoints).toBe(2);
    expect(state.adventure!.grail?.status).toBe("uncollected");
  });

  it("digs for 1 MP and marks the Grail carried once 2 Obelisks are visited", () => {
    const state = makeGrailGame("holy-grail-dig-success");
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "obelisk-rewards": false };
    const o1 = injectObelisk(state, "60,60");
    const o2 = injectObelisk(state, "61,61");
    const grailField: MapFieldState = {
      spaceId: "70,70",
      tileInstanceId: "grail-tile",
      slot: 0,
      location: "grail",
      difficulty: 7,
      blackCube: true,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      grailDiggable: true
    };
    state.adventure!.fields[grailField.spaceId] = grailField;
    state.adventure!.grail = { status: "uncollected" };

    const hero = getMainHero(state, "p1")!;
    parkHero(state, "p1", o1);
    beginFieldVisit(state, hero.id, o1.spaceId, false);
    parkHero(state, "p1", o2);
    beginFieldVisit(state, hero.id, o2.spaceId, false);

    parkHero(state, "p1", grailField);
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    hero.movementPoints = 2;
    revisitField(state, { type: "REVISIT_FIELD", playerId: "p1", heroId: hero.id });

    expect(hero.movementPoints).toBe(1);
    expect(state.adventure!.grail?.status).toBe("carried");
    expect(state.adventure!.grail?.carrierHeroId).toBe(hero.id);
    expect(grailField.grailDiggable).toBe(false);
  });

  it("does not re-credit a second visit to the same Obelisk", () => {
    const state = makeGrailGame("holy-grail-same-obelisk");
    const o1 = injectObelisk(state, "60,60");
    const hero = parkHero(state, "p1", o1);
    beginFieldVisit(state, hero.id, o1.spaceId, false);
    beginFieldVisit(state, hero.id, o1.spaceId, false);
    expect(grailObelisksVisitedCount(state, "p1")).toBe(1);
    expect(canDigGrail(state, "p1")).toBe(false);
  });
});

describe("Obelisk house-rule rewards toggle", () => {
  it("skips the die reward when obelisk-rewards is off, but still counts Holy Grail visits", () => {
    const state = createAdventureGameState({
      seed: "obelisk-rewards-off",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "grail",
      houseRules: { "obelisk-rewards": false }
    });
    // Freeze the house-rule flag the way setup does.
    state.adventure!.houseRules = {
      ...(state.adventure!.houseRules ?? {}),
      "obelisk-rewards": false
    };

    const field = injectObelisk(state, "60,60");
    const hero = parkHero(state, "p1", field);
    beginFieldVisit(state, hero.id, field.spaceId, false);

    expect(field.flagOwnerId).toBe("p1");
    expect(field.obeliskRoll).toBeUndefined();
    expect(state.eventLog.some((event) => event.type === "ADVENTURE_DICE_ROLLED")).toBe(false);
    expect(grailObelisksVisitedCount(state, "p1")).toBe(1);
  });
});
