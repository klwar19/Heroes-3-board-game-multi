import { describe, expect, it } from "vitest";
import type { CombatState, CombatUnitState, GameState, MapFieldState, PlayerId } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import {
  beginFieldVisit,
  checkDragonConquerorHold,
  getMainHero,
  getTownOfPlayer,
  requiredHeroDefeats,
  tryDeliverGrail
} from "./adventure";
import { finalizeAdventureCombat, startPlayerCombat } from "./adventure-reducer";
import { createAdventureGameState } from "./index";
import { ATTACK_DIE_FACES } from "./battlefield";

type Mode = "conquest" | "grail" | "dragon-hunt" | "dragon-conqueror";

function makeGame(victoryMode: Mode): GameState {
  return createAdventureGameState({ seed: `wc-${victoryMode}`, difficulty: "normal", rollFirstPlayer: false, victoryMode });
}

function injectField(state: GameState, location: string, spaceId = "99,99"): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location,
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

/** Stands the player's main hero on the field, returns the hero id. */
function placeHeroOn(state: GameState, playerId: PlayerId, spaceId: string): string {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = spaceId;
  return hero.id;
}

describe("Grail Hunt setup", () => {
  it("guarantees a Grail on a Center tile", () => {
    const state = makeGame("grail");
    const fields = Object.values(state.adventure!.fields);
    const tiles = state.adventure!.tiles;
    // The Center tile is placed face-down but its def is fixed at setup.
    const tileDefs = Object.values(tiles).map((tile) => tile.tileDefId);
    // C2 and C4 are the Grail center tiles.
    expect(tileDefs.some((id) => id === "C2" || id === "C4")).toBe(true);
    expect(state.adventure!.victoryMode).toBe("grail");
    expect(state.adventure!.grail).toEqual({ status: "uncollected" });
    expect(fields.length).toBeGreaterThan(0);
  });
});

describe("Dragon Conqueror setup", () => {
  it("guarantees a Dragon Utopia on a Center tile", () => {
    const state = makeGame("dragon-conqueror");
    const tileDefs = Object.values(state.adventure!.tiles).map((tile) => tile.tileDefId);
    // C1 and C3 are the Dragon Utopia center tiles.
    expect(tileDefs.some((id) => id === "C1" || id === "C3")).toBe(true);
  });
});

describe("Dragon Hunt setup", () => {
  it("guarantees a Dragon Utopia on a Center tile and tracks hero defeats", () => {
    const state = makeGame("dragon-hunt");
    const tileDefs = Object.values(state.adventure!.tiles).map((tile) => tile.tileDefId);
    expect(tileDefs.some((id) => id === "C1" || id === "C3")).toBe(true);
    expect(state.adventure!.victoryMode).toBe("dragon-hunt");
    // No Grail token is minted; the "defeat every enemy hero" path is tracked.
    expect(state.adventure!.grail).toBeUndefined();
    expect(state.adventure!.heroDefeats).toEqual({});
  });
});

describe("Grail capture", () => {
  it("arms the dig after the guard falls, then carries and delivers home to win", () => {
    const state = makeGame("grail");
    const field = injectField(state, "grail");
    const heroId = placeHeroOn(state, "p1", field.spaceId);

    // The guards just fell: the field is dug-pending, not yet collected.
    beginFieldVisit(state, heroId, field.spaceId, false);
    expect(field.grailDiggable).toBe(true);
    expect(field.blackCube).toBe(true);
    expect(state.adventure!.grail).toEqual({ status: "uncollected" });

    // Digging (a revisit for 1 MP) mints the single Grail Token.
    beginFieldVisit(state, heroId, field.spaceId, true);
    expect(state.adventure!.grail).toMatchObject({ status: "carried", carrierHeroId: heroId });
    expect(field.grailDiggable).toBe(false);

    // Carrying it onto your own town wins the game.
    const townFieldId = getTownOfPlayer(state, "p1")!.fieldId!;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = townFieldId;
    expect(tryDeliverGrail(state, hero)).toBe(true);
    expect(state.phase).toBe("game-over");
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });

  it("does not deliver at a town the carrier does not control", () => {
    const state = makeGame("grail");
    const field = injectField(state, "grail");
    const heroId = placeHeroOn(state, "p1", field.spaceId);
    beginFieldVisit(state, heroId, field.spaceId, false);
    beginFieldVisit(state, heroId, field.spaceId, true);

    const hero = getMainHero(state, "p1")!;
    hero.spaceId = getTownOfPlayer(state, "p2")!.fieldId!; // enemy town
    expect(tryDeliverGrail(state, hero)).toBe(false);
    expect(state.adventure!.winnerPlayerId).toBeNull();
  });
});

describe("Dragon Utopia objective", () => {
  it("wins outright in Dragon Hunt — no need to hold it", () => {
    const state = makeGame("dragon-hunt");
    const field = injectField(state, "dragon_utopia");
    const heroId = placeHeroOn(state, "p1", field.spaceId);
    beginFieldVisit(state, heroId, field.spaceId, false);
    expect(state.phase).toBe("game-over");
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });

  it("is only a creature bank in Grail Hunt — defeating it does NOT win", () => {
    const state = makeGame("grail");
    const field = injectField(state, "dragon_utopia");
    const heroId = placeHeroOn(state, "p1", field.spaceId);
    const goldBefore = state.players.p1.resources.gold;

    beginFieldVisit(state, heroId, field.spaceId, false);

    // The Dragon Utopia pays the creature-bank consolation, never the game.
    expect(state.adventure!.winnerPlayerId).toBeNull();
    expect(state.phase).not.toBe("game-over");
    expect(field.blackCube).toBe(true);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 10);
    const reward = state.adventure!.rewardQueue.at(-1);
    expect(reward).toMatchObject({ kind: "shared-deck-search", count: 2 });
    expect((reward as { deckId: string }).deckId).toMatch(/artifacts/);
  });

  it("is captured and held to win in Dragon Conqueror", () => {
    const state = makeGame("dragon-conqueror");
    const field = injectField(state, "dragon_utopia");
    const heroId = placeHeroOn(state, "p1", field.spaceId);

    // Defeating the dragons flags the Utopia for the victor — no instant win.
    beginFieldVisit(state, heroId, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");
    expect(field.everFlagged).toBe(true);
    expect(state.adventure!.winnerPlayerId).toBeNull();

    // Holding it into the start of a later turn wins.
    checkDragonConquerorHold(state, "p1");
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });
});

describe("Creature-bank consolation (Conquest)", () => {
  for (const location of ["grail", "dragon_utopia"]) {
    it(`gives 10 gold and a Relic search when ${location} is not the objective`, () => {
      const state = makeGame("conquest");
      const field = injectField(state, location);
      const heroId = placeHeroOn(state, "p1", field.spaceId);
      const goldBefore = state.players.p1.resources.gold;

      beginFieldVisit(state, heroId, field.spaceId, false);

      expect(field.blackCube).toBe(true);
      expect(state.players.p1.resources.gold).toBe(goldBefore + 10);
      const reward = state.adventure!.rewardQueue.at(-1);
      expect(reward).toMatchObject({ kind: "shared-deck-search", count: 2 });
      expect((reward as { deckId: string }).deckId).toMatch(/artifacts/);
      expect(state.adventure!.winnerPlayerId).toBeNull();
    });
  }
});

describe("Defeat every enemy hero", () => {
  it("scales the requirement: all enemies, but only 2 in a 4-player game", () => {
    expect(requiredHeroDefeats(2)).toBe(1);
    expect(requiredHeroDefeats(3)).toBe(2);
    expect(requiredHeroDefeats(4)).toBe(2);
  });

  // Both objective modes also allow winning by military dominance.
  for (const mode of ["grail", "dragon-hunt"] as const) {
    it(`wins once the required enemy heroes are beaten (2-player, ${mode})`, () => {
      const state = makeGame(mode);
      const attacker = getMainHero(state, "p1")!;
      const defender = getMainHero(state, "p2")!;
      const field = injectField(state, "empty_field");

      state.combat = {
        id: "c1",
        round: 1,
        attackerPlayerId: "p1",
        defenderPlayerId: "p2",
        activeUnitId: null,
        context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId: field.spaceId },
        setup: null,
        awaitingContinue: false,
        outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
        dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
        units: {}
      } as CombatState;

      finalizeAdventureCombat(state);

      expect(state.adventure!.heroDefeats?.p1).toEqual(["p2"]);
      expect(state.phase).toBe("game-over");
      expect(state.adventure!.winnerPlayerId).toBe("p1");
    });
  }
});

describe("Dragon Conqueror siege", () => {
  it("assaulting a captured Dragon Utopia is a siege", () => {
    const state = makeGame("dragon-conqueror");
    const field = injectField(state, "dragon_utopia");
    field.flagOwnerId = "p2";
    field.everFlagged = true;

    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    startPlayerCombat(state, attacker, defender, field.spaceId);

    expect(state.combat?.context.kind).toBe("player");
    expect(state.combat?.context.kind === "player" && state.combat.context.siege).toBe(true);
  });
});

describe("PvP troop-loss option", () => {
  function unit(over: Partial<CombatUnitState> & { id: string; controllerId: PlayerId; armyUnitId: string }): CombatUnitState {
    return {
      name: "Pikemen",
      cardName: "Few Pikemen",
      variant: "few",
      grade: "bronze",
      type: "ground",
      attack: 1,
      defense: 1,
      maxHealth: 2,
      damage: 0,
      initiative: 1,
      position: 0,
      activatedThisRound: false,
      movedThisActivation: false,
      retaliatedThisRound: false,
      defenseToken: false,
      abilities: [],
      unitDefId: "castle.pikemen",
      assets: { cardImage: "", imageAlt: "" },
      ...over
    } as CombatUnitState;
  }

  /** Stages a finished PvP fight where p1 (a downgraded Pack) beats a dead p2. */
  function stageFinishedPvpFight(state: GameState): void {
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    const field = injectField(state, "empty_field");

    state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "pack" }];
    state.players.p2.army = [
      { id: "b1", unitDefId: "castle.pikemen", side: "few" },
      { id: "b2", unitDefId: "castle.pikemen", side: "few" }
    ];

    state.combat = {
      id: "c1",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: null,
      context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId: field.spaceId },
      setup: null,
      awaitingContinue: false,
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {
        // The winner's Pack took damage and would normally flip down to Few.
        a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1", variant: "few", damage: 0 }),
        // One loser unit is destroyed, one survives.
        b1: unit({ id: "b1", controllerId: "p2", armyUnitId: "b1", damage: 2, maxHealth: 2 }),
        b2: unit({ id: "b2", controllerId: "p2", armyUnitId: "b2", damage: 0 })
      }
    } as CombatState;
  }

  it("loses dead units and downgrades Packs by default (normal)", () => {
    const state = makeGame("conquest");
    stageFinishedPvpFight(state);

    finalizeAdventureCombat(state);

    // The winner's Pack flipped to Few; the loser's destroyed unit left.
    expect(state.players.p1.army).toEqual([{ id: "a1", unitDefId: "castle.pikemen", side: "few" }]);
    expect(state.players.p2.army.map((u) => u.id)).toEqual(["b2"]);
  });

  it("keeps both armies intact when pvpTroopLoss is 'none'", () => {
    const state = createAdventureGameState({
      seed: "wc-keep-troops",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      pvpTroopLoss: "none"
    });
    stageFinishedPvpFight(state);

    finalizeAdventureCombat(state);

    // No unit card was removed and the Pack was not downgraded.
    expect(state.players.p1.army).toEqual([{ id: "a1", unitDefId: "castle.pikemen", side: "pack" }]);
    expect(state.players.p2.army).toEqual([
      { id: "b1", unitDefId: "castle.pikemen", side: "few" },
      { id: "b2", unitDefId: "castle.pikemen", side: "few" }
    ]);
    // The fight still resolved a winner (conquest tracks no hero defeats).
    expect(state.combat).toBeNull();
  });

  it("does not spare Neutral guard fights", () => {
    const state = createAdventureGameState({
      seed: "wc-keep-troops-neutral",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      pvpTroopLoss: "none"
    });
    const hero = getMainHero(state, "p1")!;
    const field = injectField(state, "empty_field");
    state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];

    state.combat = {
      id: "c2",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: NEUTRAL_PLAYER_ID,
      activeUnitId: null,
      context: { kind: "neutral", heroId: hero.id, fieldId: field.spaceId, difficulty: 1, hasAzure: false },
      setup: null,
      awaitingContinue: false,
      outcome: { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {
        a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1", damage: 2, maxHealth: 2 })
      }
    } as CombatState;

    finalizeAdventureCombat(state);

    // "Keep troops" never applies to Neutral combat: the dead unit still left
    // (and the empty army was restocked from the scenario starting army).
    expect(state.players.p1.army.some((u) => u.id === "a1")).toBe(false);
  });
});
