import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  beginFieldVisit,
  canCrossEdge,
  canDigGrail,
  drawGuardArmy,
  getMainHero,
  getTownOfPlayer
} from "./adventure";
import { buildGrail, transferPolishCarriedGrailAfterPvp } from "./adventure-reducer";
import { createAdventureGameState } from "./adventure-setup";
import {
  grailBuildAt,
  grailBuildReward,
  grailPossessionVp
} from "./map-design-features";
import { sanitizeCustomMapObject } from "./map-preset";
import { computeVictoryPoints } from "./victory-points";
import type { GameState, MapFieldState, PendingChoice } from "./state";

const PLAYERS = [
  { id: "p1", name: "P1", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "P2", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "P3", factionId: "dungeon" as const, heroDefId: "mutare" },
  { id: "p4", name: "P4", factionId: "rampart" as const, heroDefId: "gelu" }
];

function game(seed: string, playerCount = 2): GameState {
  return createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: PLAYERS.slice(0, playerCount),
    houseRules: { "polish-grail-utopia": true }
  });
}

function field(location: string, spaceId: string): MapFieldState {
  return {
    spaceId,
    tileInstanceId: `test-${spaceId}`,
    slot: 0,
    location,
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    standalone: true,
    standaloneLayer: "surface"
  };
}

function objectiveCounts(state: GameState): { grail: number; utopia: number } {
  const tileIds = [
    ...Object.values(state.adventure!.tiles).map((tile) => tile.tileDefId),
    ...(state.adventure!.farTilePool ?? [])
  ];
  let grail = 0;
  let utopia = 0;
  for (const tileId of tileIds) {
    const fields = allTileDefinitions[tileId]?.fields ?? [];
    if (fields.some((entry) => entry.location === "grail")) grail += 1;
    if (fields.some((entry) => entry.location === "dragon_utopia")) utopia += 1;
  }
  return { grail, utopia };
}

describe("Polish Grail / Dragon Utopia house rule", () => {
  it("seeds 2 Grails + 2 Utopias for four players, including compact-map Far supply overflow", () => {
    expect(objectiveCounts(game("polish-objectives-4", 4))).toEqual({ grail: 2, utopia: 2 });
  });

  it("seeds a deterministic random 1+2 mix for three players (always total 3)", () => {
    const seen = new Set<number>();
    for (let index = 0; index < 12; index += 1) {
      const counts = objectiveCounts(game(`polish-objectives-3-${index}`, 3));
      expect(counts.grail + counts.utopia).toBe(3);
      expect([1, 2]).toContain(counts.grail);
      seen.add(counts.grail);
    }
    expect(seen).toEqual(new Set([1, 2]));
  });

  it("uses the exact Grail and Utopia guard packages", () => {
    const state = game("polish-objective-guards");
    const grail = drawGuardArmy(state, field("grail", "20,20"), 7);
    const utopia = drawGuardArmy(state, field("dragon_utopia", "21,21"), 7);
    expect(grail.map((draw) => draw.tier)).toEqual(["azure", "azure"]);
    expect(utopia.map((draw) => draw.tier)).toEqual(["azure", "azure", "gold"]);
    expect(utopia.at(-1)?.unitDefId).toBe("neutral.black_dragons");
  });

  it("clears for XP only, converts other Grails immediately, then digs for 1 MP/20 gold and a 3-VP token", () => {
    const state = game("polish-grail-flow");
    const hero = getMainHero(state, "p1")!;
    const first = field("grail", "30,30");
    const second = field("grail", "31,31");
    state.adventure!.fields[first.spaceId] = first;
    state.adventure!.fields[second.spaceId] = second;
    hero.spaceId = first.spaceId;
    const goldBefore = state.players.p1.resources.gold;

    beginFieldVisit(state, hero.id, first.spaceId, false);
    expect(state.players.p1.resources.gold, "fight itself has no field payout").toBe(goldBefore);
    expect(first.grailDiggable).toBe(true);
    expect(second.location).toBe("dragon_utopia");
    expect(canDigGrail(state, "p1")).toBe(true);

    beginFieldVisit(state, hero.id, first.spaceId, true);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 20);
    expect(state.adventure!.grail).toMatchObject({ status: "carried", carrierHeroId: hero.id });
    expect(grailPossessionVp(state)).toBe(3);
    expect(grailBuildAt(state)).toBe("both");
    expect(grailBuildReward(state)?.freeBuilding).toBe(true);
    state.adventure!.mapPreset = { victoryPoints: { enabled: true } };
    const scored = computeVictoryPoints(state).breakdown.find((entry) => entry.playerId === "p1");
    expect(scored?.rows.find((row) => row.label === "Possessing the Grail")?.vp).toBe(3);
  });

  it("builds at a controlled Town for free and opens the free-building picker", () => {
    const state = game("polish-grail-build");
    const hero = getMainHero(state, "p1")!;
    const town = getTownOfPlayer(state, "p1")!;
    hero.spaceId = town.fieldId!;
    state.adventure!.grail = { status: "carried", carrierHeroId: hero.id };
    state.activePlayerId = "p1";
    state.phase = "player-turn";
    state.players.p1.needsHandRefresh = false;
    state.players.p1.canMulligan = false;
    state.pendingChoice = null;

    buildGrail(state, { type: "BUILD_GRAIL", playerId: "p1", heroId: hero.id });
    expect(state.adventure!.grail).toMatchObject({ status: "built", builtFieldId: town.fieldId });
    const pending = state.pendingChoice as PendingChoice | null;
    expect(pending?.type).toBe("OPTION_CHOICE");
    expect(pending?.type === "OPTION_CHOICE" && pending.context).toBe("grail-free-building");
    state.adventure!.mapPreset = { victoryPoints: { enabled: true } };
    const scored = computeVictoryPoints(state).breakdown.find((entry) => entry.playerId === "p1");
    expect(scored?.rows.find((row) => row.label === "Possessing the Grail")?.vp).toBe(3);
  });

  it("transfers the carried token to the PvP winner", () => {
    const state = game("polish-grail-transfer");
    const loser = getMainHero(state, "p1")!;
    const winner = getMainHero(state, "p2")!;
    state.adventure!.grail = { status: "carried", carrierHeroId: loser.id };
    expect(transferPolishCarriedGrailAfterPvp(state, "p2", "p1", winner)).toBe(true);
    expect(state.adventure!.grail.carrierHeroId).toBe(winner.id);
  });

  it("pays Utopia's 20 gold, two Search (3) Artifact rewards, and token choice", () => {
    const state = game("polish-utopia-reward");
    const hero = getMainHero(state, "p1")!;
    const utopia = field("dragon_utopia", "40,40");
    state.adventure!.fields[utopia.spaceId] = utopia;
    hero.spaceId = utopia.spaceId;
    const goldBefore = state.players.p1.resources.gold;
    beginFieldVisit(state, hero.id, utopia.spaceId, false);

    expect(state.players.p1.resources.gold).toBe(goldBefore + 20);
    expect(
      state.adventure!.rewardQueue.filter(
        (reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts" && reward.count === 3
      )
    ).toHaveLength(2);
    const choice = state.adventure!.rewardQueue.find((reward) => reward.kind === "visit-steps");
    expect(choice?.kind === "visit-steps" && choice.steps[0]?.type).toBe("CHOOSE_ONE");
  });
});

describe("Garrison yellow-border passage", () => {
  it("sanitizes/persists only on Garrisons and opens a sealed adjacent edge both ways", () => {
    const sanitized = sanitizeCustomMapObject({
      kind: "garrison",
      placement: { type: "standalone", row: 0, col: 0 },
      garrisonBorderPassage: true
    });
    expect(sanitized?.garrisonBorderPassage).toBe(true);
    expect(
      sanitizeCustomMapObject({
        kind: "monolith",
        placement: { type: "standalone", row: 0, col: 0 },
        garrisonBorderPassage: true
      })?.garrisonBorderPassage
    ).toBeUndefined();

    const state = game("garrison-border-passage");
    const garrison = { ...field("garrison", "h:0:0"), borderEdges: [0, 1, 2, 3, 4, 5] };
    const neighbor = field("empty_field", "h:0:1");
    state.adventure!.fields = { [garrison.spaceId]: garrison, [neighbor.spaceId]: neighbor };
    expect(canCrossEdge(state, garrison.spaceId, neighbor.spaceId)).toBe(false);
    garrison.garrisonBorderPassage = true;
    expect(canCrossEdge(state, garrison.spaceId, neighbor.spaceId)).toBe(true);
    expect(canCrossEdge(state, neighbor.spaceId, garrison.spaceId)).toBe(true);
  });
});
