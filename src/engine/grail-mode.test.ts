import { describe, expect, it } from "vitest";
import type { CombatState, CombatUnitState, GameState, MapFieldState, PlayerId } from "./state";
import { GRAIL_OBELISKS_REQUIRED, NEUTRAL_PLAYER_ID } from "./state";
import {
  adventureSeatCount,
  beginFieldVisit,
  checkDragonConquerorHold,
  getMainHero,
  getTownOfPlayer,
  grailObelisksVisitedCount,
  requiredHeroDefeats,
  tryDeliverGrail
} from "./adventure";
import { finalizeAdventureCombat, startPlayerCombat } from "./adventure-reducer";
import { createAdventureGameState } from "./index";
import { ATTACK_DIE_FACES } from "./battlefield";
import { gameIsOver, detectFinishedMatch } from "@/server/match-report";
import type { AdventurePlayerConfig } from "./adventure-setup";

type Mode = "conquest" | "grail" | "dragon-hunt" | "dragon-conqueror";

function makeGame(victoryMode: Mode): GameState {
  return createAdventureGameState({ seed: `wc-${victoryMode}`, difficulty: "normal", rollFirstPlayer: false, victoryMode });
}

function makeGameWithPlayers(victoryMode: Mode, players: AdventurePlayerConfig[]): GameState {
  return createAdventureGameState({
    seed: `wc-${victoryMode}-${players.length}p`,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode,
    players
  });
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

/** Injects an (ungarded) Obelisk field for the Holy Grail dig prerequisite. */
function injectObelisk(state: GameState, spaceId: string): MapFieldState {
  const field = injectField(state, "obelisk", spaceId);
  field.difficulty = undefined;
  return field;
}

/**
 * Holy Grail: a hero must visit {@link GRAIL_OBELISKS_REQUIRED} distinct
 * Obelisks before the dig unlocks. Visits them (die-reward house rule off so
 * they don't queue a pendingVisit) to satisfy the gate.
 */
function visitTwoObelisks(state: GameState, heroId: string): void {
  state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "obelisk-rewards": false };
  const o1 = injectObelisk(state, "60,60");
  const o2 = injectObelisk(state, "61,61");
  const hero = state.heroes[heroId]!;
  hero.spaceId = o1.spaceId;
  beginFieldVisit(state, heroId, o1.spaceId, false);
  hero.spaceId = o2.spaceId;
  beginFieldVisit(state, heroId, o2.spaceId, false);
}

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

    // Holy Grail: digging before visiting 2 Obelisks does NOT mint the Grail.
    beginFieldVisit(state, heroId, field.spaceId, true);
    expect(state.adventure!.grail).toEqual({ status: "uncollected" });
    expect(field.grailDiggable).toBe(true);

    // After visiting 2 distinct Obelisks the dig unlocks.
    visitTwoObelisks(state, heroId);
    expect(grailObelisksVisitedCount(state, "p1")).toBe(GRAIL_OBELISKS_REQUIRED);

    // Digging (a revisit for 1 MP) now mints the single Grail Token.
    placeHeroOn(state, "p1", field.spaceId);
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
    // Satisfy the 2-Obelisk dig gate, then dig so the Grail is actually carried.
    visitTwoObelisks(state, heroId);
    placeHeroOn(state, "p1", field.spaceId);
    beginFieldVisit(state, heroId, field.spaceId, true);
    expect(state.adventure!.grail).toMatchObject({ status: "carried", carrierHeroId: heroId });

    const hero = getMainHero(state, "p1")!;
    hero.spaceId = getTownOfPlayer(state, "p2")!.fieldId!; // enemy town
    expect(tryDeliverGrail(state, hero)).toBe(false);
    expect(state.adventure!.winnerPlayerId).toBeNull();
  });
});

/** Stages a finished neutral combat the hero just won on `field`. */
function stageNeutralWin(state: GameState, heroId: string, fieldId: string): void {
  state.combat = {
    id: "c-neutral",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    activeUnitId: null,
    context: {
      kind: "neutral",
      heroId,
      fieldId,
      difficulty: 7,
      hasAzure: true
    },
    setup: null,
    awaitingContinue: false,
    outcome: {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {}
  } as CombatState;
}

describe("Dragon Utopia objective", () => {
  it("wins outright in Dragon Hunt — no need to hold it", () => {
    const state = makeGame("dragon-hunt");
    const field = injectField(state, "dragon_utopia");
    const heroId = placeHeroOn(state, "p1", field.spaceId);
    beginFieldVisit(state, heroId, field.spaceId, false);
    expect(state.phase).toBe("game-over");
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });

  it("wins IMMEDIATELY via combat finalization in Dragon Hunt (real post-fight path)", () => {
    const state = makeGame("dragon-hunt");
    const field = injectField(state, "dragon_utopia");
    const heroId = placeHeroOn(state, "p1", field.spaceId);
    stageNeutralWin(state, heroId, field.spaceId);

    finalizeAdventureCombat(state);

    expect(state.combat).toBeNull();
    expect(state.phase).toBe("game-over");
    expect(state.adventure!.winnerPlayerId).toBe("p1");
    expect(state.eventLog.some((e) => e.type === "GAME_WON" && e.reason === "defeated the Dragon Utopia")).toBe(
      true
    );
  });

  it("wins IMMEDIATELY even when Necromancy would otherwise defer the field visit", () => {
    const state = makeGame("dragon-hunt");
    // Necropolis + printed Necromancy in hand would open the after-combat window
    // and withhold a normal field reward — Utopia must NOT wait on that.
    state.players.p1.factionId = "necropolis";
    state.players.p1.hand = ["ability.necromancy"];
    const field = injectField(state, "dragon_utopia");
    const heroId = placeHeroOn(state, "p1", field.spaceId);
    stageNeutralWin(state, heroId, field.spaceId);

    finalizeAdventureCombat(state);

    expect(state.adventure!.winnerPlayerId).toBe("p1");
    expect(state.phase).toBe("game-over");
    expect(state.adventure!.pendingNecromancy ?? null).toBeNull();
    expect(state.players.p1.necromancyWindow).toBe(false);
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
  it("scales the requirement: 2p→1, 3p→2, 4p→2", () => {
    expect(requiredHeroDefeats(2)).toBe(1);
    expect(requiredHeroDefeats(3)).toBe(2);
    expect(requiredHeroDefeats(4)).toBe(2);
  });

  function stagePvpWin(state: GameState, winnerId: PlayerId, loserId: PlayerId): void {
    const winnerHero = getMainHero(state, winnerId)!;
    const loserHero = getMainHero(state, loserId)!;
    const field = injectField(state, "empty_field", `pvp-${winnerId}-${loserId}`);
    state.combat = {
      id: `c-${winnerId}-${loserId}`,
      round: 1,
      attackerPlayerId: winnerId,
      defenderPlayerId: loserId,
      activeUnitId: null,
      context: {
        kind: "player",
        attackerHeroId: winnerHero.id,
        defenderHeroId: loserHero.id,
        fieldId: field.spaceId
      },
      setup: null,
      awaitingContinue: false,
      outcome: {
        winnerPlayerId: winnerId,
        defeatedPlayerId: loserId,
        reason: "all-enemy-units-defeated"
      },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {}
    } as CombatState;
  }

  // Both objective modes also allow winning by military dominance.
  for (const mode of ["grail", "dragon-hunt"] as const) {
    it(`wins IMMEDIATELY once the required enemy heroes are beaten (2-player, ${mode})`, () => {
      const state = makeGame(mode);
      stagePvpWin(state, "p1", "p2");

      finalizeAdventureCombat(state);

      expect(state.adventure!.heroDefeats?.p1).toEqual(["p2"]);
      expect(state.phase).toBe("game-over");
      expect(state.adventure!.winnerPlayerId).toBe("p1");
    });

    it(`needs 2 distinct hero defeats in a 3-player ${mode} game (1 is not enough)`, () => {
      const state = makeGameWithPlayers(mode, [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "dungeon", heroDefId: "alamar" },
        { id: "p3", name: "C", factionId: "necropolis", heroDefId: "sandro" }
      ]);
      expect(adventureSeatCount(state)).toBe(3);
      expect(requiredHeroDefeats(adventureSeatCount(state))).toBe(2);

      stagePvpWin(state, "p1", "p2");
      finalizeAdventureCombat(state);
      expect(state.adventure!.heroDefeats?.p1).toEqual(["p2"]);
      expect(state.adventure!.winnerPlayerId).toBeNull();
      expect(state.phase).not.toBe("game-over");

      stagePvpWin(state, "p1", "p3");
      finalizeAdventureCombat(state);
      expect(state.adventure!.heroDefeats?.p1).toEqual(["p2", "p3"]);
      expect(state.adventure!.winnerPlayerId).toBe("p1");
      expect(state.phase).toBe("game-over");
    });

    it(`needs only 2 of 3 hero defeats in a 4-player ${mode} game`, () => {
      const state = makeGameWithPlayers(mode, [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "dungeon", heroDefId: "alamar" },
        { id: "p3", name: "C", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p4", name: "D", factionId: "tower", heroDefId: "solmyr" }
      ]);
      expect(requiredHeroDefeats(adventureSeatCount(state))).toBe(2);

      stagePvpWin(state, "p1", "p2");
      finalizeAdventureCombat(state);
      expect(state.adventure!.winnerPlayerId).toBeNull();

      stagePvpWin(state, "p1", "p3");
      finalizeAdventureCombat(state);
      expect(state.adventure!.heroDefeats?.p1).toEqual(["p2", "p3"]);
      expect(state.adventure!.winnerPlayerId).toBe("p1");
      // The third enemy was never beaten — still a win at 2/3.
      expect(state.adventure!.heroDefeats?.p1).not.toContain("p4");
    });

    it(`does not lower the 3-player threshold when one seat is eliminated (${mode})`, () => {
      const state = makeGameWithPlayers(mode, [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "dungeon", heroDefId: "alamar" },
        { id: "p3", name: "C", factionId: "necropolis", heroDefId: "sandro" }
      ]);
      // p3 leaves the turn order (eliminated) but remains a seat for counting.
      state.players.p3.eliminated = true;
      state.turnOrder = state.turnOrder.filter((id) => id !== "p3");
      expect(adventureSeatCount(state)).toBe(3);
      expect(requiredHeroDefeats(adventureSeatCount(state))).toBe(2);

      stagePvpWin(state, "p1", "p2");
      finalizeAdventureCombat(state);
      // Live turn order is only 2, but the scenario still needs 2 defeats.
      expect(state.adventure!.heroDefeats?.p1).toEqual(["p2"]);
      expect(state.adventure!.winnerPlayerId).toBeNull();
    });
  }

  it("does not count a Surrender toward the hero-defeat win path", () => {
    const state = makeGame("dragon-hunt");
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    const field = injectField(state, "empty_field");
    state.players.p2.resources.gold = 20;
    state.combat = {
      id: "c-surrender",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: null,
      context: {
        kind: "player",
        attackerHeroId: attacker.id,
        defenderHeroId: defender.id,
        fieldId: field.spaceId
      },
      setup: null,
      awaitingContinue: false,
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "surrender" },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {}
    } as CombatState;

    finalizeAdventureCombat(state);

    expect(state.adventure!.heroDefeats?.p1 ?? []).toEqual([]);
    expect(state.adventure!.winnerPlayerId).toBeNull();
  });
});

describe("Match W/L detection after combat-end notice", () => {
  it("does not treat the combat-end notice as a finished match", () => {
    const state = makeGame("dragon-hunt");
    const field = injectField(state, "dragon_utopia");
    const heroId = placeHeroOn(state, "p1", field.spaceId);
    stageNeutralWin(state, heroId, field.spaceId);
    // finishCombatIfNeeded parks phase at game-over while combat is still open.
    state.phase = "game-over";

    expect(gameIsOver(state)).toBe(false);
    expect(detectFinishedMatch(state, state)).toBeNull();
  });

  it("detects a finished match when Utopia win lands from combat finalization", () => {
    const prev = makeGame("dragon-hunt");
    prev.phase = "game-over"; // combat-end notice (no winner yet)
    prev.combat = {
      id: "c",
      outcome: {
        winnerPlayerId: "p1",
        defeatedPlayerId: NEUTRAL_PLAYER_ID,
        reason: "all-enemy-units-defeated"
      }
    } as CombatState;
    // Stamp a hosted room so the detector can attribute seats.
    prev.room = {
      id: "room-1",
      hosted: true,
      hostClientId: "c1",
      ranked: true,
      members: [
        { clientId: "c1", name: "Alice", seat: "p1", isHost: true, userId: "u1" },
        { clientId: "c2", name: "Bob", seat: "p2", isHost: false, userId: "u2" }
      ],
      matchSeats: {
        p1: { userId: "u1", name: "Alice" },
        p2: { userId: "u2", name: "Bob" }
      }
    } as typeof prev.room;

    const next = structuredClone(prev);
    next.combat = null;
    next.adventure!.winnerPlayerId = "p1";
    next.phase = "game-over";

    expect(gameIsOver(prev)).toBe(false);
    expect(gameIsOver(next)).toBe(true);
    const match = detectFinishedMatch(prev, next);
    expect(match).not.toBeNull();
    expect(match!.participants.find((p) => p.accountId === "u1")?.result).toBe("win");
    expect(match!.participants.find((p) => p.accountId === "u2")?.result).toBe("loss");
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
