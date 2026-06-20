import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  NEUTRAL_PLAYER_ID
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, CombatUnitState, GameState, MapFieldState, PlayerId } from "./state";

/**
 * "Give up" (house rule, engine-enforced — this suite fails if the wiring is
 * removed): a concede a participating hero may choose at ANY point once a
 * player-vs-player fight is under way, not just the start-of-combat Retreat /
 * Surrender window (a Neutral-guard fight has no Give up).
 *
 * It is always a defeat with the same consequences as a Retreat (5-gold toll,
 * -1 morale, fall back home, the opponent wins and gains its credit). The cost
 * of the troops depends on the lobby's PvP casualty mode:
 *  - losing-troop mode: only the casualties taken up to the point of conceding
 *    are lost — destroyed units leave and Packs flip, but survivors fall back
 *    (it does NOT forfeit the whole army); and
 *  - keep-troops mode: it keeps every unit but discards its entire hand.
 */

function makeGame(opts: { victoryMode?: "conquest" | "grail"; pvpTroopLoss?: "normal" | "none" } = {}): GameState {
  return createAdventureGameState({
    seed: "give-up-combat",
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: opts.victoryMode ?? "conquest",
    pvpTroopLoss: opts.pvpTroopLoss ?? "normal",
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ]
  });
}

function injectField(state: GameState, spaceId = "99,99"): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location: "empty_field",
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

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
 * Stages a PvP combat ended by a Give up: attacker p1 wins, defender p2 concedes.
 * p1's Pack took damage (a Retreat would flip it to Few); p2 has TWO units, one
 * destroyed (b1) and one untouched survivor (b2) — the survivor is what proves
 * Give up wipes more than a Retreat would. p2's hero is parked away from home.
 */
function stageGiveUpPvp(state: GameState): {
  winnerId: PlayerId;
  loserId: PlayerId;
  loserHeroId: string;
  loserHomeFieldId: string | null;
} {
  const attacker = getMainHero(state, "p1")!;
  const defender = getMainHero(state, "p2")!;
  const field = injectField(state);
  attacker.spaceId = field.spaceId;
  defender.spaceId = field.spaceId;

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
    outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "give-up" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {
      a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1", variant: "few", damage: 0 }),
      b1: unit({ id: "b1", controllerId: "p2", armyUnitId: "b1", damage: 2, maxHealth: 2 }),
      b2: unit({ id: "b2", controllerId: "p2", armyUnitId: "b2", damage: 0 })
    }
  } as CombatState;

  return {
    winnerId: "p1",
    loserId: "p2",
    loserHeroId: defender.id,
    loserHomeFieldId: state.towns.town_p2.fieldId ?? null
  };
}

describe("Give up: troop / hand cost by mode", () => {
  it("losing-troop mode: loses only the casualties taken so far — survivors stay", () => {
    const state = makeGame({ pvpTroopLoss: "normal" });
    const { loserId } = stageGiveUpPvp(state);

    finalizeAdventureCombat(state);

    // b1 was destroyed before the concede, so it leaves; b2 (a survivor) STAYS —
    // giving up forfeits the dead, not the whole army.
    expect(state.players[loserId].army.map((armyUnit) => armyUnit.id)).toEqual(["b2"]);
    // The winner's army still settles by the normal rules: its damaged Pack flips
    // to Few exactly as in a Retreat (Give up is not a free pass for the winner).
    expect(state.players.p1.army).toEqual([{ id: "a1", unitDefId: "castle.pikemen", side: "few" }]);
  });

  it("keep-troops mode: every unit is kept, and the conceding hand is discarded instead", () => {
    const state = makeGame({ pvpTroopLoss: "none" });
    const { loserId } = stageGiveUpPvp(state);
    state.players[loserId].hand = ["mock-card-a", "mock-card-b"];
    state.players[loserId].discard = [];

    finalizeAdventureCombat(state);

    // Whole army kept (both the destroyed unit and the survivor stay).
    expect(state.players[loserId].army.map((armyUnit) => armyUnit.id)).toEqual(["b1", "b2"]);
    // The hand is emptied into the discard pile — the keep-troops cost of giving up.
    expect(state.players[loserId].hand).toEqual([]);
    expect(state.players[loserId].discard).toEqual(expect.arrayContaining(["mock-card-a", "mock-card-b"]));
  });
});

describe("Give up: a defeat with the Retreat consequences", () => {
  it("pays 5 gold to the winner (may go into debt), -1 morale, and falls the hero back home", () => {
    const state = makeGame();
    const { winnerId, loserId, loserHeroId, loserHomeFieldId } = stageGiveUpPvp(state);
    state.players[loserId].resources.gold = 2; // cannot cover the toll
    state.players[winnerId].resources.gold = 10;
    state.players[loserId].morale = 0;

    finalizeAdventureCombat(state);

    expect(state.players[loserId].resources.gold).toBe(-3);
    expect(state.players[winnerId].resources.gold).toBe(15);
    expect(state.players[loserId].morale).toBe(-1);
    expect(state.heroes[loserHeroId].spaceId).toBe(loserHomeFieldId);
  });

  it("counts as a win for the opponent — records a hero-defeat and can win the game (grail mode)", () => {
    const state = makeGame({ victoryMode: "grail" });
    const { winnerId, loserId } = stageGiveUpPvp(state);

    finalizeAdventureCombat(state);

    expect(state.adventure?.heroDefeats?.[winnerId] ?? []).toContain(loserId);
    expect(state.adventure?.winnerPlayerId).toBe(winnerId);
  });

  it("grants the opponent a Necromancy window (unlike a Surrender)", () => {
    const state = makeGame();
    const { winnerId } = stageGiveUpPvp(state);
    state.players[winnerId].necromancyWindow = false;

    finalizeAdventureCombat(state);

    expect(state.players[winnerId].necromancyWindow).toBe(true);
  });
});

describe("Give up: player-vs-player only", () => {
  it("is never offered, and is rejected by the reducer, in a Neutral-guard fight", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    const here = injectField(state, "50,50");
    hero.spaceId = here.spaceId;
    state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];

    state.phase = "combat";
    state.activePlayerId = "p1";
    state.combat = {
      id: "n1",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: NEUTRAL_PLAYER_ID,
      activeUnitId: null,
      context: { kind: "neutral", heroId: hero.id, fieldId: here.spaceId, difficulty: 7, hasAzure: false },
      setup: null,
      awaitingContinue: false,
      outcome: null,
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {
        a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1", activatedThisRound: true }),
        g1: unit({ id: "g1", controllerId: NEUTRAL_PLAYER_ID, armyUnitId: "g1", bankGuard: true })
      }
    } as CombatState;

    expect(getLegalActions(state, "p1").some((l) => l.action.type === "GIVE_UP_COMBAT")).toBe(false);

    const result = applyAction(state, { type: "GIVE_UP_COMBAT", playerId: "p1" });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.combat?.outcome ?? null).toBeNull();
  });
});

describe("Give up: action wiring and availability", () => {
  /** An active PvP combat (phase combat, no outcome) with one unit already acted. */
  function activePvp(seed: string): GameState {
    const state = makeGame();
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    const field = injectField(state, seed);
    attacker.spaceId = field.spaceId;
    defender.spaceId = field.spaceId;
    state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];
    state.players.p2.army = [{ id: "b1", unitDefId: "castle.pikemen", side: "few" }];
    state.phase = "combat";
    state.activePlayerId = "p1";
    state.combat = {
      id: "c1",
      round: 2,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: null,
      context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId: field.spaceId },
      setup: null,
      awaitingContinue: false,
      outcome: null,
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {
        // Units have already fought (the start-of-combat escape window is closed).
        a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1", activatedThisRound: true }),
        b1: unit({ id: "b1", controllerId: "p2", armyUnitId: "b1" })
      }
    } as CombatState;
    return state;
  }

  const offersGiveUp = (state: GameState, playerId: PlayerId) =>
    getLegalActions(state, playerId).some((l) => l.action.type === "GIVE_UP_COMBAT");

  it("offers Give up to both fighters mid-combat, after the Retreat window has closed", () => {
    const state = activePvp("70,70");
    // The start-of-combat escape is gone now (a unit has acted)…
    expect(getLegalActions(state, "p1").some((l) => l.action.type === "RETREAT_FROM_COMBAT")).toBe(false);
    // …but Give up is still on the table for both participants.
    expect(offersGiveUp(state, "p1")).toBe(true);
    expect(offersGiveUp(state, "p2")).toBe(true);
  });

  it("labels the cost by the troop-loss mode (casualties so far vs hand discard)", () => {
    const lossy = activePvp("71,71");
    const lossyLabel = getLegalActions(lossy, "p1").find((l) => l.action.type === "GIVE_UP_COMBAT")?.label ?? "";
    expect(lossyLabel).toMatch(/survivors fall back/i);

    const kept = activePvp("72,72");
    kept.adventure!.pvpTroopLoss = "none";
    const keptLabel = getLegalActions(kept, "p1").find((l) => l.action.type === "GIVE_UP_COMBAT")?.label ?? "";
    expect(keptLabel).toMatch(/discard your hand/i);
  });

  it("applying GIVE_UP_COMBAT ends the combat as a give-up loss for the conceding player", () => {
    const state = activePvp("73,73");
    const result = applyAction(state, { type: "GIVE_UP_COMBAT", playerId: "p2" });
    expect(result.errors).toEqual([]);
    expect(result.state.combat?.outcome).toMatchObject({
      winnerPlayerId: "p1",
      defeatedPlayerId: "p2",
      reason: "give-up"
    });
  });

  it("rejects Give up from a non-participant", () => {
    const state = activePvp("74,74");
    // A third party is not in this combat.
    const result = applyAction(state, { type: "GIVE_UP_COMBAT", playerId: "neutral" as PlayerId });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.combat?.outcome ?? null).toBeNull();
  });
});

describe("Retreat is the single in-combat escape; Surrender is before-battle only", () => {
  /**
   * A round-1 PvP combat sitting in the post-deployment escape window: deployment
   * is done (no setup) and no unit has acted. Only Retreat should be on the table
   * here — Surrender is a before-battle (prep) option, and the in-fight concede is
   * suppressed until fighting begins.
   */
  function escapeWindowPvp(seed: string): GameState {
    const state = makeGame();
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    const field = injectField(state, seed);
    attacker.spaceId = field.spaceId;
    defender.spaceId = field.spaceId;
    state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];
    state.players.p2.army = [{ id: "b1", unitDefId: "castle.pikemen", side: "few" }];
    state.players.p1.resources.gold = 50; // would be enough to Surrender, if it were offered
    state.players.p2.resources.gold = 50;
    state.phase = "combat";
    state.activePlayerId = "p1";
    state.combat = {
      id: "c1",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: null,
      context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId: field.spaceId },
      setup: null,
      awaitingContinue: false,
      outcome: null,
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {
        // No unit has acted: the start-of-combat escape window is OPEN.
        a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1" }),
        b1: unit({ id: "b1", controllerId: "p2", armyUnitId: "b1" })
      }
    } as CombatState;
    return state;
  }

  const has = (state: GameState, playerId: PlayerId, type: "RETREAT_FROM_COMBAT" | "SURRENDER_COMBAT" | "GIVE_UP_COMBAT") =>
    getLegalActions(state, playerId).some((l) => l.action.type === type);

  it("offers ONLY Retreat in the post-deployment window (no Surrender, no separate concede)", () => {
    const state = escapeWindowPvp("80,80");
    for (const playerId of ["p1", "p2"] as PlayerId[]) {
      expect(has(state, playerId, "RETREAT_FROM_COMBAT")).toBe(true);
      // Surrender is a before-battle (prep) option only.
      expect(has(state, playerId, "SURRENDER_COMBAT")).toBe(false);
      // The in-fight concede is suppressed while the no-casualties Retreat is up,
      // so there is never more than one Retreat button on screen.
      expect(has(state, playerId, "GIVE_UP_COMBAT")).toBe(false);
    }
  });

  it("offers Retreat to the player currently deploying (not the one waiting), and never Surrender", () => {
    const state = escapeWindowPvp("82,82");
    // Mid-deployment: it is p1's turn to place; p2 is waiting.
    state.combat!.setup = {
      pendingPlayerIds: ["p1", "p2"],
      placedUnitIds: { p1: [], p2: [] },
      unitLimit: 7
    } as never;
    // The deploying player may Retreat…
    expect(has(state, "p1", "RETREAT_FROM_COMBAT")).toBe(true);
    expect(has(state, "p1", "SURRENDER_COMBAT")).toBe(false);
    expect(has(state, "p1", "GIVE_UP_COMBAT")).toBe(false);
    // …the waiting player has no escape control yet (they see a waiting panel).
    expect(has(state, "p2", "RETREAT_FROM_COMBAT")).toBe(false);
  });

  it("keeps Retreat as the only escape once a unit begins fighting (now the concede)", () => {
    const state = escapeWindowPvp("81,81");
    // A single unit acting closes the start-of-combat window for the rest of the
    // fight; the in-fight concede (GIVE_UP_COMBAT) takes over, labelled "Retreat".
    state.combat!.units.a1.activatedThisRound = true;
    for (const playerId of ["p1", "p2"] as PlayerId[]) {
      expect(has(state, playerId, "RETREAT_FROM_COMBAT")).toBe(false);
      expect(has(state, playerId, "SURRENDER_COMBAT")).toBe(false);
      expect(has(state, playerId, "GIVE_UP_COMBAT")).toBe(true);
      // It is shown to the player as "Retreat", not "Give up".
      const concede = getLegalActions(state, playerId).find((l) => l.action.type === "GIVE_UP_COMBAT");
      expect(concede?.label.toLowerCase().startsWith("retreat")).toBe(true);
    }
  });
});
