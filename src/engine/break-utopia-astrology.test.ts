import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameState,
  type MapFieldState
} from "./index";
import {
  beginFieldVisit,
  classifyHeroStep,
  getMainHero,
  processPendingVisit,
  startAdventureRound
} from "./adventure";
import { sanitizeCenterHexPlan, sanitizeCustomMapPreset } from "./map-preset";

function game(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest"
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

function field(extra: Partial<MapFieldState> = {}): MapFieldState {
  return {
    spaceId: "break-target",
    tileInstanceId: "target-tile",
    slot: 0,
    location: "mine",
    difficulty: 4,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    ...extra
  };
}

describe("Break setup", () => {
  it("sanitizes the three broad gates and the exact-VII field controls", () => {
    expect(
      sanitizeCustomMapPreset({
        breaks: { enterNearTiles: true, enterCenterTiles: true, enterViiFields: true, junk: true }
      })?.breaks
    ).toEqual({ enterNearTiles: true, enterCenterTiles: true, enterViiFields: true });
    expect(
      sanitizeCenterHexPlan({
        breakField: true,
        persistentGuard: true,
        unlimitedRounds: true,
        flaggableDragonUtopia: true
      })
    ).toMatchObject({
      breakField: true,
      persistentGuard: true,
      unlimitedRounds: true,
      flaggableDragonUtopia: true
    });
  });

  it("stops Pathfinding only at the configured tile/field boundary", () => {
    const state = game("break-entry-gates");
    const hero = getMainHero(state, "p1")!;
    const origin = state.adventure!.fields[hero.spaceId!]!;
    const target = field();
    state.adventure!.fields[target.spaceId] = target;
    state.adventure!.tiles[target.tileInstanceId] = { id: target.tileInstanceId, group: "near" } as never;
    state.adventure!.mapPreset = { breaks: { enterNearTiles: true } };
    const pathfinding = { passEncounters: true, moveThrough: false } as never;

    expect(classifyHeroStep(state, hero, target.spaceId, pathfinding)).toBe("stop");
    // CONTROL: already inside the same tile, the tile-entry gate no longer bites.
    target.tileInstanceId = origin.tileInstanceId;
    expect(classifyHeroStep(state, hero, target.spaceId, pathfinding)).toBe("encounter");

    // The VII-field gate is independent of tile crossing.
    target.difficulty = 7;
    state.adventure!.mapPreset = { breaks: { enterViiFields: true } };
    expect(classifyHeroStep(state, hero, target.spaceId, pathfinding)).toBe("stop");
    state.adventure!.mapPreset = undefined;
    expect(classifyHeroStep(state, hero, target.spaceId, pathfinding)).toBe("encounter");
  });
});

describe("flaggable Dragon Utopia", () => {
  it("flags on clear, then gives one non-stacking paid Search(2) Azure recruit offer per Astrologers round", () => {
    const state = game("flaggable-utopia-azure");
    const hero = getMainHero(state, "p1")!;
    const utopia = field({
      spaceId: "utopia",
      location: "dragon_utopia",
      difficulty: 7,
      flaggableDragonUtopia: true
    });
    state.adventure!.fields[utopia.spaceId] = utopia;
    state.adventure!.fields["utopia-two"] = field({
      spaceId: "utopia-two",
      location: "dragon_utopia",
      difficulty: 7,
      flaggableDragonUtopia: true,
      flagOwnerId: "p1",
      everFlagged: true
    });
    hero.spaceId = utopia.spaceId;
    beginFieldVisit(state, hero.id, utopia.spaceId, false);
    expect(utopia.flagOwnerId).toBe("p1");
    expect(utopia.blackCube).toBe(false);

    state.adventure!.rewardQueue = [];
    state.pendingChoice = null;
    state.adventure!.pendingVisit = null;
    state.players.p1.resources.gold = 100;
    state.players.p1.resources.valuables = 10;
    state.decks["neutral-azure"]!.drawPile = ["neutral.azure_dragons", "neutral.crystal_dragons"];
    state.round = 2;
    state.decks.astrologers!.drawPile.push("astrologers.dead_silence");
    startAdventureRound(state);

    const offers = state.adventure!.rewardQueue.filter(
      (reward) =>
        reward.playerId === "p1" &&
        reward.kind === "visit-steps" &&
        reward.steps.some((step) => step.type === "UTOPIA_AZURE_RECRUIT_OFFER")
    );
    expect(offers).toHaveLength(1);

    // Isolate the Utopia reward from any proclamation bookkeeping and execute
    // the queued engine step end-to-end.
    state.phase = "player-turn";
    state.adventure!.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: utopia.spaceId,
      steps: [{ type: "UTOPIA_AZURE_RECRUIT_OFFER" }]
    };
    processPendingVisit(state);
    const recruit = getLegalActions(state, "p1").find((legal) => legal.label.startsWith("Recruit "));
    expect(recruit?.label).toMatch(/Azure Dragons|Crystal Dragons/);
    const result = applyAction(state, recruit!.action);
    expect(result.errors).toHaveLength(0);
    expect(result.state.players.p1.army.some((unit) => unit.unitDefId === "neutral.azure_dragons" || unit.unitDefId === "neutral.crystal_dragons")).toBe(true);
  });

  it("CONTROL: an unmarked legacy Utopia remains ownerless and grants no Astrology recruit", () => {
    const state = game("legacy-utopia-control");
    const hero = getMainHero(state, "p1")!;
    const utopia = field({ spaceId: "legacy-utopia", location: "dragon_utopia", difficulty: 7 });
    state.adventure!.fields[utopia.spaceId] = utopia;
    hero.spaceId = utopia.spaceId;
    beginFieldVisit(state, hero.id, utopia.spaceId, false);
    expect(utopia.flagOwnerId).toBeNull();
    state.adventure!.rewardQueue = [];
    state.round = 2;
    state.decks.astrologers!.drawPile.push("astrologers.dead_silence");
    startAdventureRound(state);
    expect(
      state.adventure!.rewardQueue.some(
        (reward) => reward.kind === "visit-steps" && reward.steps.some((step) => step.type === "UTOPIA_AZURE_RECRUIT_OFFER")
      )
    ).toBe(false);
  });

  it("an ally stopping on a team-captured Utopia keeps the owner's flag; a rival still captures it", () => {
    const state = game("flaggable-utopia-ally-gate");
    const utopia = field({
      spaceId: "utopia-ally",
      location: "dragon_utopia",
      difficulty: 7,
      flaggableDragonUtopia: true,
      flagOwnerId: "p1",
      everFlagged: true
    });
    state.adventure!.fields[utopia.spaceId] = utopia;
    const visitor = getMainHero(state, "p2")!;
    visitor.spaceId = utopia.spaceId;

    // ALLY: p2 shares p1's team, so the visit must NOT steal the flag.
    state.playerTeams = { p1: "friends", p2: "friends" };
    beginFieldVisit(state, visitor.id, utopia.spaceId, false);
    expect(utopia.flagOwnerId).toBe("p1");

    // CONTROL: the same visitor on a rival team DOES capture it.
    state.playerTeams = { p1: "friends", p2: "foes" };
    state.adventure!.pendingVisit = null;
    state.adventure!.rewardQueue = [];
    state.pendingChoice = null;
    beginFieldVisit(state, visitor.id, utopia.spaceId, false);
    expect(utopia.flagOwnerId).toBe("p2");
  });
});
