import { describe, expect, it } from "vitest";
import { createAdventureGameState, getMainHero } from "./index";
import { finalizeAdventureCombat, startPlayerCombat } from "./adventure-reducer";
import type { AdventurePlayerConfig } from "./adventure-setup";
import { ATTACK_DIE_FACES } from "./battlefield";
import type {
  CombatState,
  CombatUnitState,
  GameState,
  MapFieldState,
  PlayerId,
  VictoryMode
} from "./state";

/**
 * BINH house rule — SIEGE DEFEAT ends a player on the spot.
 *
 * When a player's MAIN Hero is defeated defending their OWN faction Town and
 * they have no other base (Settlement or captured Random Town) to fall back to,
 * they are eliminated IMMEDIATELY rather than being put on the usual 2-turn
 * grace clock: with the main Hero beaten and the last Town falling there is no
 * Hero left to recapture a base, so the grace turns are pointless.
 *
 * `eliminatePlayer` resolves both table sizes from one place:
 *   - 2 players  → the survivor wins instantly (last faction standing).
 *   - 3+ players → it is only this player's loss; the game continues, and the
 *     winner's "1 win" toward the defeat-every-hero victory path (the
 *     faction-cube credit) is recorded in the victory modes that count it.
 *
 * A Settlement survivor is NOT eliminated — the beaten Hero retreats there.
 *
 * Every claim is an observable outcome (winnerPlayerId / phase / eliminated /
 * hero spaceId / heroDefeats), each with a control where it must NOT fire.
 */

function players2(): AdventurePlayerConfig[] {
  return [
    { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
    { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
  ];
}

function players3(): AdventurePlayerConfig[] {
  return [
    ...players2(),
    { id: "p3", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
  ];
}

function makeGame(
  victoryMode: VictoryMode = "conquest",
  who: AdventurePlayerConfig[] = players2()
): GameState {
  const state = createAdventureGameState({
    seed: "pvp-siege-victory",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    victoryMode,
    pvpTroopLoss: "normal",
    players: who
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

function injectSettlement(state: GameState, spaceId: string, ownerId: PlayerId): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: `tile-${spaceId}`,
    slot: 0,
    location: "settlement",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: ownerId,
    everFlagged: true,
    settlementResource: "gold"
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

describe("PvP on a controlled Settlement", () => {
  it("records the owner as defending the Settlement without granting siege fortifications", () => {
    const state = makeGame();
    const settlement = injectSettlement(state, "20,20", "p2");
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    attacker.spaceId = settlement.spaceId;
    defender.spaceId = settlement.spaceId;

    startPlayerCombat(state, attacker, defender, settlement.spaceId);

    expect(state.combat?.defenderPlayerId).toBe("p2");
    expect(state.combat?.context).toMatchObject({
      kind: "player",
      defenderHeroId: defender.id,
      fieldId: settlement.spaceId,
      holdingDefense: "settlement"
    });
    expect(state.combat?.context.kind === "player" && state.combat.context.siege).toBeFalsy();
    expect(state.combat?.siege ?? null).toBeNull();
  });
});

function unit(
  over: Partial<CombatUnitState> & { id: string; controllerId: PlayerId; armyUnitId: string }
): CombatUnitState {
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

/**
 * Stage a finished siege: p1's Hero has assaulted p2's own faction Town and p2
 * lost. `garrison` drops p2's defending Hero (a heroless 8-gold defense) so the
 * "with the main Hero" gate can be exercised. Returns p2's Hero id.
 */
function stageSiege(state: GameState, opts: { garrison?: boolean; attackerLoses?: boolean } = {}): string {
  const attacker = getMainHero(state, "p1")!;
  const defender = getMainHero(state, "p2")!;
  const townField = state.towns.town_p2.fieldId!;

  attacker.spaceId = townField;
  defender.spaceId = townField;
  state.activePlayerId = "p1"; // the attacker is the turn-owner

  state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];
  state.players.p2.army = [{ id: "b1", unitDefId: "castle.pikemen", side: "few" }];

  const loserId: PlayerId = opts.attackerLoses ? "p1" : "p2";
  const winnerId: PlayerId = opts.attackerLoses ? "p2" : "p1";

  state.combat = {
    id: "siege",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    activeUnitId: null,
    context: {
      kind: "player",
      attackerHeroId: attacker.id,
      defenderHeroId: opts.garrison ? null : defender.id,
      fieldId: townField
    },
    setup: null,
    awaitingContinue: false,
    outcome: { winnerPlayerId: winnerId, defeatedPlayerId: loserId, reason: "all-enemy-units-defeated" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {
      a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1" }),
      b1: unit({ id: "b1", controllerId: "p2", armyUnitId: "b1", damage: 2, maxHealth: 2 })
    }
  } as CombatState;

  return defender.id;
}

describe("siege defeat — main Hero loses their last Town", () => {
  it("2 players: the other player wins IMMEDIATELY, with no grace clock", () => {
    const state = makeGame();
    stageSiege(state);

    finalizeAdventureCombat(state);

    // p2 is out at once (not merely on a 2-turn countdown), and p1 wins now.
    expect(state.players.p2.eliminated).toBe(true);
    expect(state.players.p2.eliminationCountdown ?? null).toBeNull();
    expect(state.adventure?.winnerPlayerId).toBe("p1");
    expect(state.phase).toBe("game-over");
    expect(state.eventLog.some((event) => event.type === "PLAYER_ELIMINATED")).toBe(true);
    expect(state.eventLog.some((event) => event.type === "GAME_WON")).toBe(true);
  });

  it("3 players: the siege cube persists after elimination and wins at the reduced threshold", () => {
    const state = makeGame("conquest", players3());
    stageSiege(state);

    finalizeAdventureCombat(state);

    expect(state.players.p2.eliminated).toBe(true);
    expect(state.turnOrder).not.toContain("p2");
    expect(state.turnOrder).toContain("p1");
    expect(state.turnOrder).toContain("p3");
    // Two factions remain and the earned cube meets the one-cube requirement.
    expect(state.adventure?.winnerPlayerId).toBe("p1");
    expect(state.phase).toBe("game-over");
    expect(state.adventure?.heroDefeats?.p1).toContain("p2");
  });

  it("credits the winner 1 win (the faction cube) toward the defeat-every-hero path", () => {
    // Grail shares Conquest: the earned cube survives the loser's elimination.
    const state = makeGame("grail", players3());
    stageSiege(state);

    finalizeAdventureCombat(state);

    expect(state.adventure?.heroDefeats?.p1 ?? []).toContain("p2");
    expect(state.players.p2.eliminated).toBe(true);
    expect(state.adventure?.winnerPlayerId).toBe("p1");
  });

  it("CONTROL: a Settlement survivor is NOT eliminated — the beaten Hero retreats there", () => {
    const state = makeGame("conquest", players3());
    const settlement = injectSettlement(state, "40,40", "p2");
    const defenderHeroId = stageSiege(state);

    finalizeAdventureCombat(state);

    // Still in the game (they hold a Settlement), no winner, and the Hero fell
    // back to the Settlement rather than off the map.
    expect(state.players.p2.eliminated).toBeFalsy();
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(state.phase).not.toBe("game-over");
    expect(state.heroes[defenderHeroId].spaceId).toBe(settlement.spaceId);
  });

  it("a heroless garrison loss counts as PvP defeat without instant elimination", () => {
    const state = makeGame("conquest", players3());
    stageSiege(state, { garrison: true });

    finalizeAdventureCombat(state);

    // With no main Hero defending, the old flow applies: the Town falls and the
    // 2-turn elimination clock starts instead of an instant loss.
    expect(state.players.p2.eliminated).toBeFalsy();
    expect(state.players.p2.eliminationCountdown).toBe(2);
    expect(state.adventure?.heroDefeats?.p1).toContain("p2");
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
  });

  it("CONTROL: when the ATTACKER loses their assault, nobody is eliminated", () => {
    const state = makeGame("conquest", players3());
    stageSiege(state, { attackerLoses: true });

    finalizeAdventureCombat(state);

    expect(state.players.p1.eliminated).toBeFalsy();
    expect(state.players.p2.eliminated).toBeFalsy();
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(state.phase).not.toBe("game-over");
  });
});
