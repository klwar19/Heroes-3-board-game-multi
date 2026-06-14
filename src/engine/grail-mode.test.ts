import { describe, expect, it } from "vitest";
import type { CombatState, GameState, MapFieldState, PlayerId } from "./state";
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

type Mode = "conquest" | "grail" | "dragon-conqueror";

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
  it("wins outright in Grail Hunt", () => {
    const state = makeGame("grail");
    const field = injectField(state, "dragon_utopia");
    const heroId = placeHeroOn(state, "p1", field.spaceId);
    beginFieldVisit(state, heroId, field.spaceId, false);
    expect(state.phase).toBe("game-over");
    expect(state.adventure!.winnerPlayerId).toBe("p1");
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

  it("wins once the required enemy heroes are beaten (2-player)", () => {
    const state = makeGame("grail");
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
