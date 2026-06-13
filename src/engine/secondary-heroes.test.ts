import { describe, expect, it } from "vitest";
import type { CombatState, GameAction, GameState, MapFieldState } from "./state";
import {
  beginFieldVisit,
  createSecondaryHero,
  getAstrologersState,
  getMainHero,
  getSecondaryHero,
  getTownOfPlayer,
  heroMovementMax,
  refreshRoundTokens,
  SECONDARY_HERO_MOVEMENT
} from "./adventure";
import { finalizeAdventureCombat, hireSecondaryHero, resolveVisitStep } from "./adventure-reducer";
import { getLegalActions, isHandLockedInCombat } from "./legal-actions";
import { createAdventureGameState } from "./index";
import { ATTACK_DIE_FACES } from "./battlefield";

type Mode = "conquest" | "grail" | "dragon-conqueror";

function makeGame(victoryMode: Mode = "conquest"): GameState {
  return createAdventureGameState({ seed: `sec-${victoryMode}`, difficulty: "normal", rollFirstPlayer: false, victoryMode });
}

function injectField(state: GameState, location: string, spaceId = "70,70", difficulty?: number): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location,
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

/** A neutral combat the given hero just won, ready for finalize. */
function neutralWin(state: GameState, heroId: string, fieldId: string, difficulty: number): void {
  state.combat = {
    id: "c-neutral",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: "neutral",
    activeUnitId: null,
    context: { kind: "neutral", heroId, fieldId, difficulty, hasAzure: false },
    setup: null,
    awaitingContinue: false,
    outcome: { winnerPlayerId: "p1", defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {}
  } as CombatState;
}

describe("Prison", () => {
  it("grants a Secondary Hero on the field, then 3 gold once you have one", () => {
    const state = makeGame();
    const goldStart = state.players.p1.resources.gold;

    const first = injectField(state, "prison", "70,70");
    const main = getMainHero(state, "p1")!;
    main.spaceId = first.spaceId;
    beginFieldVisit(state, main.id, first.spaceId, false);

    const secondary = getSecondaryHero(state, "p1");
    expect(secondary).not.toBeNull();
    expect(secondary!.kind).toBe("secondary");
    expect(secondary!.spaceId).toBe(first.spaceId);
    expect(secondary!.movementPointsMax).toBe(SECONDARY_HERO_MOVEMENT);

    // Visiting a second Prison while you already field one pays 3 gold instead.
    const goldBefore = state.players.p1.resources.gold;
    const second = injectField(state, "prison", "71,71");
    main.spaceId = second.spaceId;
    beginFieldVisit(state, main.id, second.spaceId, false);

    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    // Still exactly one Secondary Hero.
    expect(Object.values(state.heroes).filter((h) => h.controllerId === "p1" && h.kind === "secondary")).toHaveLength(1);
    expect(goldBefore).toBeGreaterThanOrEqual(goldStart);
  });
});

describe("Tavern", () => {
  it("pays 7 gold for a Secondary Hero and makes a chosen enemy discard a card", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 10;
    state.players.p2.hand = ["stat.attack"];
    state.players.p2.discard = [];

    const field = injectField(state, "tavern", "72,72");
    const main = getMainHero(state, "p1")!;
    main.spaceId = field.spaceId;
    beginFieldVisit(state, main.id, field.spaceId, false);

    // The visit waits for input: pay (targeting p2) or decline.
    const actions = getLegalActions(state, "p1");
    expect(actions.some((a) => a.label.startsWith("Pay 7 gold"))).toBe(true);
    expect(actions.some((a) => a.label === "Decline")).toBe(true);

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(getSecondaryHero(state, "p1")?.spaceId).toBe(field.spaceId);
    expect(state.players.p1.resources.gold).toBe(3);
    expect(state.players.p2.hand).toHaveLength(0);
    expect(state.players.p2.discard).toEqual(["stat.attack"]);
  });

  it("can be declined with no effect", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 10;
    const field = injectField(state, "tavern", "73,73");
    const main = getMainHero(state, "p1")!;
    main.spaceId = field.spaceId;
    beginFieldVisit(state, main.id, field.spaceId, false);

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });

    expect(getSecondaryHero(state, "p1")).toBeNull();
    expect(state.players.p1.resources.gold).toBe(10);
  });

  it("offers no purchase once you already field a Secondary Hero", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 50;
    createSecondaryHero(state, "p1", "70,70");

    const field = injectField(state, "tavern", "74,74");
    const main = getMainHero(state, "p1")!;
    main.spaceId = field.spaceId;
    beginFieldVisit(state, main.id, field.spaceId, false);

    const actions = getLegalActions(state, "p1");
    expect(actions.some((a) => a.label.startsWith("Pay 7 gold"))).toBe(false);
    expect(actions.some((a) => a.label === "Decline")).toBe(true);
  });
});

describe("Hiring a Secondary Hero (10 gold)", () => {
  /** A HIRE_SECONDARY_HERO action the town offers, with its portrait heroDefId. */
  function offeredHire(state: GameState): Extract<GameAction, { type: "HIRE_SECONDARY_HERO" }> | undefined {
    const legal = getLegalActions(state, "p1").find((a) => a.action.type === "HIRE_SECONDARY_HERO");
    return legal?.action as Extract<GameAction, { type: "HIRE_SECONDARY_HERO" }> | undefined;
  }

  it("spawns at the main town for 10 gold wearing another hero's portrait", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 10;
    const townField = getTownOfPlayer(state, "p1")!.fieldId!;
    const mainHeroDefId = getMainHero(state, "p1")!.heroDefId;

    const hire = offeredHire(state);
    expect(hire).toBeDefined();
    expect(hire!.heroDefId).not.toBe(mainHeroDefId);

    hireSecondaryHero(state, hire!);

    const secondary = getSecondaryHero(state, "p1")!;
    expect(secondary.spaceId).toBe(townField);
    expect(secondary.heroDefId).toBe(hire!.heroDefId);
    expect(secondary.movementPointsMax).toBe(SECONDARY_HERO_MOVEMENT);
    expect(state.players.p1.resources.gold).toBe(0);
  });

  it("is not offered without 10 gold, nor once you already have one", () => {
    const poor = makeGame();
    poor.players.p1.resources.gold = 9;
    expect(offeredHire(poor)).toBeUndefined();

    const state = makeGame();
    state.players.p1.resources.gold = 50;
    createSecondaryHero(state, "p1", getTownOfPlayer(state, "p1")!.fieldId!);
    expect(offeredHire(state)).toBeUndefined();
  });

  it("never offers the Main Hero's own portrait", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 30;
    const mainHeroDefId = getMainHero(state, "p1")!.heroDefId;
    const offered = getLegalActions(state, "p1")
      .filter((a) => a.action.type === "HIRE_SECONDARY_HERO")
      .map((a) => (a.action as Extract<GameAction, { type: "HIRE_SECONDARY_HERO" }>).heroDefId);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered).not.toContain(mainHeroDefId);
  });
});

describe("Secondary Hero movement", () => {
  it("starts at a base of 2 movement points", () => {
    const state = makeGame();
    const secondary = createSecondaryHero(state, "p1", "70,70");
    expect(secondary.movementPoints).toBe(2);
    expect(secondary.movementPointsMax).toBe(SECONDARY_HERO_MOVEMENT);
    expect(heroMovementMax(state, secondary)).toBe(2);
  });

  it("is buffed like any hero by an Astrologers movement proclamation", () => {
    const state = makeGame();
    const secondary = createSecondaryHero(state, "p1", "70,70");
    // "Battalion's Stallion — Until the next Astrologers' round: each Hero
    // gains +1 Movement." The base 2 is a floor, not a cap.
    getAstrologersState(state)!.activeCardId = "astrologers.battalions_stallion";

    expect(heroMovementMax(state, secondary)).toBe(3);
    expect(heroMovementMax(state, getMainHero(state, "p1")!)).toBe(4);

    secondary.movementPoints = 0;
    refreshRoundTokens(state);
    expect(secondary.movementPoints).toBe(3);
  });
});

describe("Secondary Hero experience", () => {
  it("gains no experience from winning a Neutral combat (Main Hero does)", () => {
    // Control: the Main Hero winning a same-level guard gains 1 experience.
    const mainState = makeGame();
    const mainField = injectField(mainState, "empty_field", "70,70", 1);
    neutralWin(mainState, getMainHero(mainState, "p1")!.id, mainField.spaceId, 1);
    finalizeAdventureCombat(mainState);
    expect(getMainHero(mainState, "p1")!.experience).toBe(1);

    // A Secondary Hero winning the same fight gains nothing — and the Main
    // Hero it shares a player with does not benefit either.
    const state = makeGame();
    const field = injectField(state, "empty_field", "70,70", 1);
    const secondary = createSecondaryHero(state, "p1", field.spaceId);
    neutralWin(state, secondary.id, field.spaceId, 1);
    finalizeAdventureCombat(state);

    expect(getMainHero(state, "p1")!.experience).toBe(0);
    expect(getSecondaryHero(state, "p1")!.experience).toBe(0);
  });

  it("gains no experience from a map location, but still resolves the field", () => {
    const state = makeGame();
    const field = injectField(state, "learning_stone", "75,75");
    const secondary = createSecondaryHero(state, "p1", field.spaceId);

    beginFieldVisit(state, secondary.id, field.spaceId, false);

    expect(getMainHero(state, "p1")!.experience).toBe(0);
    expect(secondary.experience).toBe(0);
    // The visitable Learning Stone is still marked used.
    expect(field.blackCube).toBe(true);
  });

  it("grants no experience when it defeats an enemy hero, but the win still counts", () => {
    const state = makeGame("grail");
    const secondary = createSecondaryHero(state, "p1", "70,70");
    const enemyMain = getMainHero(state, "p2")!;
    const field = injectField(state, "empty_field", "76,76");

    state.combat = {
      id: "c-pvp",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: null,
      context: { kind: "player", attackerHeroId: secondary.id, defenderHeroId: enemyMain.id, fieldId: field.spaceId },
      setup: null,
      awaitingContinue: false,
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {}
    } as CombatState;

    finalizeAdventureCombat(state);

    // No experience for the Secondary Hero's win...
    expect(getMainHero(state, "p1")!.experience).toBe(0);
    // ...but beating the enemy Main Hero still counts toward conquest.
    expect(state.adventure!.heroDefeats?.p1).toEqual(["p2"]);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });
});

describe("Secondary Hero cards in combat", () => {
  it("locks the hand whenever a Secondary Hero leads the fight", () => {
    const state = makeGame();
    const secondary = createSecondaryHero(state, "p1", "70,70");

    // Neutral combat led by the Secondary Hero: no cards.
    neutralWin(state, secondary.id, "70,70", 3);
    state.combat!.outcome = null;
    expect(isHandLockedInCombat(state, "p1")).toBe(true);

    // The same fight led by the Main Hero is not locked.
    neutralWin(state, getMainHero(state, "p1")!.id, "70,70", 3);
    state.combat!.outcome = null;
    expect(isHandLockedInCombat(state, "p1")).toBe(false);
  });

  it("still locks a garrison defense without a hero, and a Secondary attacker", () => {
    const state = makeGame();
    const secondary = createSecondaryHero(state, "p1", "70,70");
    const enemyMain = getMainHero(state, "p2")!;
    const field = injectField(state, "empty_field", "77,77");

    // Secondary attacker vs Main defender: only the attacker is locked.
    state.combat = {
      id: "c-pvp2",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: null,
      context: { kind: "player", attackerHeroId: secondary.id, defenderHeroId: enemyMain.id, fieldId: field.spaceId },
      setup: null,
      awaitingContinue: false,
      outcome: null,
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {}
    } as CombatState;
    expect(isHandLockedInCombat(state, "p1")).toBe(true);
    expect(isHandLockedInCombat(state, "p2")).toBe(false);

    // Garrison defense (no defender hero) still locks the defender.
    state.combat.context = { kind: "player", attackerHeroId: enemyMain.id, defenderHeroId: null, fieldId: field.spaceId };
    state.combat.attackerPlayerId = "p2";
    state.combat.defenderPlayerId = "p1";
    expect(isHandLockedInCombat(state, "p1")).toBe(true);
    expect(isHandLockedInCombat(state, "p2")).toBe(false);
  });
});
