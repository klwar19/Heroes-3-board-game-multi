import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  beginFieldVisit,
  canCrossEdge,
  canDigGrail,
  drawGuardArmy,
  getMainHero,
  getTownOfPlayer,
  instantiateTile,
  materializeTileFields
} from "./adventure";
import { CREATURE_BANK_ATTACKER_CELLS, placementCellsFor } from "./index";
import {
  buildGrail,
  startNeutralEncounter,
  transferPolishCarriedGrailAfterPvp
} from "./adventure-reducer";
import { createAdventureGameState } from "./adventure-setup";
import {
  grailBuildAt,
  grailBuildReward,
  grailDigMovementCost,
  grailPossessionVp
} from "./map-design-features";
import { sanitizeCustomMapObject } from "./map-preset";
import { computeVictoryPoints } from "./victory-points";
import type { GameDifficulty, GameState, MapFieldState, PendingChoice } from "./state";

const PLAYERS = [
  { id: "p1", name: "P1", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "P2", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "P3", factionId: "dungeon" as const, heroDefId: "mutare" },
  { id: "p4", name: "P4", factionId: "rampart" as const, heroDefId: "gelu" }
];

function game(seed: string, playerCount = 2): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    players: PLAYERS.slice(0, playerCount),
    houseRules: { "polish-grail-utopia": true }
  });
}

function editorGame(seed: string, difficulty: GameDifficulty = "normal"): GameState {
  return createAdventureGameState({
    seed,
    difficulty,
    rollFirstPlayer: false,
    players: PLAYERS.slice(0, 2),
    customMapPreset: { objectives: { hiddenGrailUtopia: true } }
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

  it("fights the Dragon Utopia as a NORMAL Level-VII field (opposing rows), not bank corners", () => {
    const state = game("polish-utopia-formation");
    const hero = getMainHero(state, "p1")!;
    const utopia = field("dragon_utopia", "40,40");
    state.adventure!.fields[utopia.spaceId] = utopia;
    hero.spaceId = utopia.spaceId;

    startNeutralEncounter(state, hero, utopia);

    // A field-VII fight: NO bank-corner formation, and the attacker deploys in
    // the normal rows — not the central six bank cells.
    expect(state.combat?.context).toMatchObject({ kind: "neutral" });
    expect((state.combat?.context as { bankFormation?: boolean } | undefined)?.bankFormation ?? false).toBe(false);
    const cells = placementCellsFor(state, "p1").slice().sort((a, b) => a - b);
    expect(cells).not.toEqual([...CREATURE_BANK_ATTACKER_CELLS].sort((a, b) => a - b));
  });

  it("CONTROL: a classic-mode Dragon Utopia still deploys in bank-corner formation", () => {
    const state = createAdventureGameState({
      seed: "classic-utopia-formation",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: PLAYERS.slice(0, 2),
      victoryMode: "dragon-hunt"
    });
    const hero = getMainHero(state, "p1")!;
    const utopia = field("dragon_utopia", "41,41");
    state.adventure!.fields[utopia.spaceId] = utopia;
    hero.spaceId = utopia.spaceId;

    startNeutralEncounter(state, hero, utopia);

    expect(state.combat?.context).toMatchObject({ kind: "neutral", bankFormation: true });
    const cells = placementCellsFor(state, "p1").slice().sort((a, b) => a - b);
    expect(cells).toEqual([...CREATURE_BANK_ATTACKER_CELLS].sort((a, b) => a - b));
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

  it("does NOT resurrect an already-fought Grail when a later Grail is cleared", () => {
    // Repro of the face-down-timing bug: the 2nd Grail's tile is still
    // face-down (not in adventure.fields) when the 1st Grail is fought+dug, so
    // it escapes the 1st fight's conversion. When the 2nd Grail is later
    // revealed and fought, its conversion pass must SKIP the spent 1st Grail,
    // not rewrite it into a fresh, fightable Dragon Utopia with a full reward.
    const state = game("polish-grail-reconvert");
    const hero = getMainHero(state, "p1")!;
    const first = field("grail", "30,30");
    state.adventure!.fields[first.spaceId] = first;
    hero.spaceId = first.spaceId;

    beginFieldVisit(state, hero.id, first.spaceId, false);
    expect(first.grailDiggable).toBe(true);
    beginFieldVisit(state, hero.id, first.spaceId, true);
    expect(state.adventure!.grail).toMatchObject({ status: "carried", carrierHeroId: hero.id });
    // Spent dig site: still a Grail field, guards fallen, no longer diggable.
    expect(first.location).toBe("grail");
    expect(first.blackCube).toBe(true);

    // The 2nd Grail tile is revealed later and fought.
    const second = field("grail", "31,31");
    state.adventure!.fields[second.spaceId] = second;
    hero.spaceId = second.spaceId;
    beginFieldVisit(state, hero.id, second.spaceId, false);

    // CONTROL: without the `blackCube` skip, the spent first Grail is converted
    // back into a fresh difficulty-7 Dragon Utopia (blackCube cleared).
    expect(first.location, "spent Grail must stay a spent Grail, not become a Utopia").toBe("grail");
    expect(first.blackCube).toBe(true);
    expect(first.grailDiggable ?? false).toBe(false);
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

  it("pays Utopia's 20 gold, the fixed Search 3 / 5 / 5 Artifact reward, and token choice", () => {
    const state = game("polish-utopia-reward");
    const hero = getMainHero(state, "p1")!;
    const utopia = field("dragon_utopia", "40,40");
    state.adventure!.fields[utopia.spaceId] = utopia;
    hero.spaceId = utopia.spaceId;
    const goldBefore = state.players.p1.resources.gold;
    beginFieldVisit(state, hero.id, utopia.spaceId, false);

    expect(state.players.p1.resources.gold).toBe(goldBefore + 20);
    // USER RULE 2026-08-03: three Searches (3 / 5 / 5), not two Search (3).
    expect(
      state.adventure!.rewardQueue
        .filter((reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts")
        .map((reward) => (reward.kind === "shared-deck-search" ? reward.count : 0))
    ).toEqual([3, 5, 5]);
    const choice = state.adventure!.rewardQueue.find((reward) => reward.kind === "visit-steps");
    expect(choice?.kind === "visit-steps" && choice.steps[0]?.type).toBe("CHOOSE_ONE");
  });

  it("preserves both explicit after-dig Grail conversions", () => {
    for (const [mode, expected] of [
      ["after-dig-utopia", "dragon_utopia"],
      ["after-dig-empty", "empty_field"]
    ] as const) {
      const state = createAdventureGameState({
        seed: `grail-after-dig-${mode}`,
        difficulty: "normal",
        rollFirstPlayer: false,
        players: PLAYERS.slice(0, 2),
        victoryMode: "grail",
        customMapPreset: { objectives: { grailAsUtopia: mode } }
      });
      const hero = getMainHero(state, "p1")!;
      const first = field("grail", `first-${mode}`);
      const second = field("grail", `second-${mode}`);
      state.adventure!.fields[first.spaceId] = first;
      state.adventure!.fields[second.spaceId] = second;
      hero.spaceId = first.spaceId;

      beginFieldVisit(state, hero.id, first.spaceId, false);
      state.adventure!.grail!.obelisksVisited = { p1: ["obelisk-a", "obelisk-b"] };
      beginFieldVisit(state, hero.id, first.spaceId, true);
      expect(second.location).toBe(expected);
    }
  });

  it("materializes grailAsUtopia=always as a real Utopia with Utopia guards and rewards", () => {
    const state = createAdventureGameState({
      seed: "grail-always-real-utopia",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: PLAYERS.slice(0, 2),
      victoryMode: "grail",
      customMapPreset: { objectives: { grailAsUtopia: "always", utopiaGuards: "four" } }
    });
    const hero = getMainHero(state, "p1")!;
    const grail = field("grail", "42,42");
    state.adventure!.fields[grail.spaceId] = grail;
    hero.spaceId = grail.spaceId;
    const goldBefore = state.players.p1.resources.gold;

    const guards = drawGuardArmy(state, grail, 7);
    expect(grail.location).toBe("dragon_utopia");
    // The configured four-dragon Utopia party is the fixed four-card army;
    // it is intentionally not the separate Black-Dragon bonus used by the
    // editor-authored Utopia guard package.
    expect(guards).toHaveLength(4);

    beginFieldVisit(state, hero.id, grail.spaceId, false);
    expect(grail.grailDiggable).toBeUndefined();
    expect(state.players.p1.resources.gold).toBe(goldBefore + 10);
    expect(state.adventure!.grail?.status).toBe("uncollected");
    expect(
      state.adventure!.rewardQueue
        .filter((reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts")
        .map((reward) => (reward.kind === "shared-deck-search" ? reward.count : 0))
    ).toEqual([3, 5, 5]);
  });
});

describe("Map Editor hidden Grail / Dragon Utopia rules", () => {
  it("scales both VII armies from scenario difficulty and adds exactly one Black Dragon to Utopia", () => {
    const expected: Record<GameDifficulty, string[]> = {
      easy: ["azure"],
      normal: ["azure", "azure"],
      hard: ["gold", "azure", "azure"],
      impossible: ["gold", "gold", "azure", "azure"]
    };
    for (const difficulty of Object.keys(expected) as GameDifficulty[]) {
      const state = editorGame(`editor-guards-${difficulty}`, difficulty);
      const grail = drawGuardArmy(state, field("grail", `g-${difficulty}`), 7);
      const utopia = drawGuardArmy(state, field("dragon_utopia", `u-${difficulty}`), 7);
      expect(grail.map((draw) => draw.tier), `Grail ${difficulty}`).toEqual(expected[difficulty]);
      expect(utopia.slice(0, -1).map((draw) => draw.tier), `Utopia base ${difficulty}`).toEqual(expected[difficulty]);
      expect(utopia.at(-1), `Utopia Black Dragon ${difficulty}`).toMatchObject({
        unitDefId: "neutral.black_dragons",
        tier: "gold"
      });
    }
  });

  it("converts a second Grail that was still face-down when the first guard fell", () => {
    const state = editorGame("hidden-second-grail");
    const hero = getMainHero(state, "p1")!;
    const first = field("grail", "32,32");
    state.adventure!.fields[first.spaceId] = first;
    const hiddenSecond = instantiateTile(state.adventure!, "C2", { row: 50, col: 50 }, 0, true);
    hero.spaceId = first.spaceId;

    beginFieldVisit(state, hero.id, first.spaceId, false);
    expect(state.adventure!.grailFieldCleared).toBe(true);

    hiddenSecond.faceDown = false;
    materializeTileFields(state.adventure!, hiddenSecond);
    const revealedObjective = Object.values(state.adventure!.fields).find(
      (candidate) => candidate.tileInstanceId === hiddenSecond.id && candidate.difficulty === 7
    );
    expect(revealedObjective?.location).toBe("dragon_utopia");
  });

  it("uses the exact editor reward bundle without the legacy Utopia gold bonus", () => {
    const state = editorGame("editor-utopia-rewards");
    const hero = getMainHero(state, "p1")!;
    const utopia = field("dragon_utopia", "50,50");
    state.adventure!.fields[utopia.spaceId] = utopia;
    hero.spaceId = utopia.spaceId;
    const goldBefore = state.players.p1.resources.gold;

    beginFieldVisit(state, hero.id, utopia.spaceId, false);

    expect(state.players.p1.resources.gold).toBe(goldBefore);
    // USER RULE 2026-08-03: the Utopia's artifact reward is the fixed 3 / 5 / 5
    // Search ladder (see dragon-utopia-artifact-reward.test.ts) — this bundle
    // used to be two Search (3) rewards.
    expect(
      state.adventure!.rewardQueue
        .filter((reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts")
        .map((reward) => (reward.kind === "shared-deck-search" ? reward.count : 0))
    ).toEqual([3, 5, 5]);
    const choice = state.adventure!.rewardQueue.find((reward) => reward.kind === "visit-steps");
    expect(choice?.kind === "visit-steps" && choice.steps[0]).toMatchObject({
      type: "CHOOSE_ONE",
      options: [
        expect.objectContaining({ label: expect.stringMatching(/Morale/) }),
        expect.objectContaining({ label: expect.stringMatching(/Ability/) })
      ]
    });
  });

  it("applies the 1-MP, 20-gold, 3-VP, build-anywhere Grail defaults without a Polish rule toggle", () => {
    const state = editorGame("editor-grail-defaults");
    const hero = getMainHero(state, "p1")!;
    const grailField = field("grail", "51,51");
    state.adventure!.fields[grailField.spaceId] = grailField;
    hero.spaceId = grailField.spaceId;
    hero.movementPoints = 3;
    const goldBefore = state.players.p1.resources.gold;

    beginFieldVisit(state, hero.id, grailField.spaceId, false);
    expect(canDigGrail(state, "p1")).toBe(true);
    expect(grailDigMovementCost(state)).toBe(1);
    beginFieldVisit(state, hero.id, grailField.spaceId, true);

    expect(state.players.p1.resources.gold).toBe(goldBefore + 20);
    expect(state.adventure!.grail).toMatchObject({ status: "carried", carrierHeroId: hero.id });
    expect(grailPossessionVp(state)).toBe(3);
    expect(grailBuildAt(state)).toBe("both");
    expect(grailBuildReward(state)?.freeBuilding).toBe(true);
  });
});

describe("Garrison yellow-border passage", () => {
  it("defaults legacy Garrisons to open, persists an explicit opt-out, and crosses both ways", () => {
    const sanitized = sanitizeCustomMapObject({
      kind: "garrison",
      placement: { type: "standalone", row: 0, col: 0 },
      garrisonBorderPassage: true
    });
    expect(sanitized?.garrisonBorderPassage).toBe(true);
    expect(
      sanitizeCustomMapObject({
        kind: "garrison",
        placement: { type: "standalone", row: 0, col: 0 }
      })?.garrisonBorderPassage
    ).toBe(true);
    expect(
      sanitizeCustomMapObject({
        kind: "garrison",
        placement: { type: "standalone", row: 0, col: 0 },
        garrisonBorderPassage: false
      })?.garrisonBorderPassage
    ).toBe(false);
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
    expect(canCrossEdge(state, garrison.spaceId, neighbor.spaceId)).toBe(true);
    garrison.garrisonBorderPassage = false;
    expect(canCrossEdge(state, garrison.spaceId, neighbor.spaceId)).toBe(false);
    garrison.garrisonBorderPassage = true;
    expect(canCrossEdge(state, garrison.spaceId, neighbor.spaceId)).toBe(true);
    expect(canCrossEdge(state, neighbor.spaceId, garrison.spaceId)).toBe(true);
  });
});
