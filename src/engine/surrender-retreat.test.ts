import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { gainRunes, seedRunesForCombat } from "./runes";
import { getActiveAttackBonus } from "./active-effects";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, CombatUnitState, GameState, HouseRuleId, MapFieldState, PlayerId } from "./state";

/**
 * House rule for leaving a player-vs-player Combat (see CLAUDE.md — every rule
 * here is engine-enforced and fails this suite if the wiring is removed):
 *
 * - Surrender: pay a flat 10 gold to the opponent (only choosable with the full
 *   toll in hand), keep your WHOLE army in both troop-loss modes, take no morale
 *   hit, return home, and give the opponent NOTHING toward winning (no XP, no
 *   Necromancy, no "defeat every enemy hero" credit).
 * - Retreat / fought-out loss: pay 5 gold to the winner — which may push the
 *   loser into debt (gold goes negative) — take -1 morale, lose troops per the
 *   lobby mode, count as a win for the opponent, and fall back home.
 * - Shackles of War blocks Surrender only; Retreat still works (covered in
 *   library-cards.test.ts).
 */

type Mode = "conquest" | "grail";

function makeGame(
  opts: {
    victoryMode?: Mode;
    pvpTroopLoss?: "normal" | "none";
    houseRules?: Partial<Record<HouseRuleId, boolean>>;
  } = {}
): GameState {
  // Both seats bear morale (Necropolis ignores it), so the loser's morale hit
  // is observable whichever side concedes.
  return createAdventureGameState({
    seed: "surrender-retreat",
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: opts.victoryMode ?? "conquest",
    pvpTroopLoss: opts.pvpTroopLoss ?? "normal",
    houseRules: opts.houseRules,
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
 * Stages a finished PvP fight: attacker p1 holds the field, defender p2 is the
 * loser. p1's Pack took damage (would flip to Few on a real loss); one of p2's
 * two units is destroyed, one survives. p2's hero is parked away from home so
 * its fall-back is visible. Returns the loser's home town field id.
 */
function stageFinishedPvpFight(
  state: GameState,
  reason: "surrender" | "retreat" | "all-enemy-units-defeated"
): { winnerId: PlayerId; loserId: PlayerId; loserHeroId: string; loserHomeFieldId: string | null } {
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
    outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason },
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

describe("Surrender (house rule): a paid escape, not a defeat", () => {
  it("keeps the surrendering player's WHOLE army even in normal troop-loss mode", () => {
    const state = makeGame({ pvpTroopLoss: "normal" });
    stageFinishedPvpFight(state, "surrender");

    finalizeAdventureCombat(state);

    // Nothing flips or leaves: the winner's Pack stays a Pack and neither of the
    // loser's units (one of which "died" on the board) is removed.
    expect(state.players.p1.army).toEqual([{ id: "a1", unitDefId: "castle.pikemen", side: "pack" }]);
    expect(state.players.p2.army).toEqual([
      { id: "b1", unitDefId: "castle.pikemen", side: "few" },
      { id: "b2", unitDefId: "castle.pikemen", side: "few" }
    ]);
  });

  it("pays exactly 10 gold from the surrendering player to the opponent", () => {
    const state = makeGame();
    const { winnerId, loserId } = stageFinishedPvpFight(state, "surrender");
    state.players[winnerId].resources.gold = 10;
    state.players[loserId].resources.gold = 10;

    finalizeAdventureCombat(state);

    expect(state.players[loserId].resources.gold).toBe(0);
    expect(state.players[winnerId].resources.gold).toBe(20);
  });

  it("applies no morale penalty and grants the opponent no experience or Necromancy", () => {
    const state = makeGame();
    const { winnerId, loserId } = stageFinishedPvpFight(state, "surrender");
    state.players[loserId].morale = 0;
    state.players[winnerId].necromancyWindow = false;
    const winnerXpBefore = getMainHero(state, winnerId)!.experience;

    finalizeAdventureCombat(state);

    expect(state.players[loserId].morale).toBe(0);
    expect(getMainHero(state, winnerId)!.experience).toBe(winnerXpBefore);
    expect(state.players[winnerId].necromancyWindow).toBeFalsy();
  });

  it("sends the surrendering hero home (to its town)", () => {
    const state = makeGame();
    const { loserHeroId, loserHomeFieldId } = stageFinishedPvpFight(state, "surrender");

    finalizeAdventureCombat(state);

    expect(loserHomeFieldId).toBeTruthy();
    expect(state.heroes[loserHeroId].spaceId).toBe(loserHomeFieldId);
    expect(state.heroes[loserHeroId].movementPoints).toBe(0);
  });

  it("does NOT count toward the opponent's defeat-every-hero victory (grail mode)", () => {
    const state = makeGame({ victoryMode: "grail" });
    const { winnerId, loserId } = stageFinishedPvpFight(state, "surrender");

    finalizeAdventureCombat(state);

    // No hero-defeat is recorded and, crucially, the game is NOT won — the
    // contrast test below shows a real loss here WOULD win it.
    expect(state.adventure?.heroDefeats?.[winnerId] ?? []).not.toContain(loserId);
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(state.phase).not.toBe("game-over");
  });
});

describe("Retreat / fought-out loss (house rule): a real defeat", () => {
  it("pays the full 5 gold to the winner and can push the loser into debt (negative gold)", () => {
    const state = makeGame();
    const { winnerId, loserId } = stageFinishedPvpFight(state, "retreat");
    state.players[loserId].resources.gold = 2; // cannot cover the 5-gold toll
    state.players[winnerId].resources.gold = 10;

    finalizeAdventureCombat(state);

    // The loser pays the whole 5 (into debt); the winner receives the whole 5.
    expect(state.players[loserId].resources.gold).toBe(-3);
    expect(state.players[winnerId].resources.gold).toBe(15);
  });

  it("OFF (house rule 'defeat-gold-debt'): the toll is capped so gold never goes negative", () => {
    const state = makeGame({ houseRules: { "defeat-gold-debt": false } });
    const { winnerId, loserId } = stageFinishedPvpFight(state, "retreat");
    state.players[loserId].resources.gold = 2; // only 2 gold toward the 5-gold toll
    state.players[winnerId].resources.gold = 10;

    finalizeAdventureCombat(state);

    // The loser pays only what they have (2) and floors at zero — no debt — and
    // the winner receives only what the loser could actually pay.
    expect(state.players[loserId].resources.gold, "capped at 0, never negative").toBe(0);
    expect(state.players[winnerId].resources.gold, "winner gets what was paid").toBe(12);
  });

  it("OFF: a solvent loser still pays the full 5 — the cap only bites when short (control)", () => {
    const state = makeGame({ houseRules: { "defeat-gold-debt": false } });
    const { winnerId, loserId } = stageFinishedPvpFight(state, "retreat");
    state.players[loserId].resources.gold = 8;
    state.players[winnerId].resources.gold = 10;

    finalizeAdventureCombat(state);

    expect(state.players[loserId].resources.gold, "full 5 paid when affordable").toBe(3);
    expect(state.players[winnerId].resources.gold).toBe(15);
  });

  it("applies -1 morale to the loser and falls the loser's hero back home", () => {
    const state = makeGame();
    const { loserId, loserHeroId, loserHomeFieldId } = stageFinishedPvpFight(state, "retreat");
    state.players[loserId].morale = 0;

    finalizeAdventureCombat(state);

    expect(state.players[loserId].morale).toBe(-1);
    expect(state.heroes[loserHeroId].spaceId).toBe(loserHomeFieldId);
  });

  it("loses casualties for both sides in normal mode, but keeps them in no-unit-loss mode", () => {
    const lossy = makeGame({ pvpTroopLoss: "normal" });
    stageFinishedPvpFight(lossy, "retreat");
    finalizeAdventureCombat(lossy);
    // Winner's Pack flipped to Few; the loser's destroyed unit left the army.
    expect(lossy.players.p1.army).toEqual([{ id: "a1", unitDefId: "castle.pikemen", side: "few" }]);
    expect(lossy.players.p2.army.map((u) => u.id)).toEqual(["b2"]);

    const kept = makeGame({ pvpTroopLoss: "none" });
    stageFinishedPvpFight(kept, "retreat");
    finalizeAdventureCombat(kept);
    expect(kept.players.p1.army).toEqual([{ id: "a1", unitDefId: "castle.pikemen", side: "pack" }]);
    expect(kept.players.p2.army.map((u) => u.id)).toEqual(["b1", "b2"]);
  });

  it("counts as a win for the opponent — records a hero-defeat and can win the game (grail mode)", () => {
    const state = makeGame({ victoryMode: "grail" });
    const { winnerId, loserId } = stageFinishedPvpFight(state, "retreat");

    finalizeAdventureCombat(state);

    expect(state.adventure?.heroDefeats?.[winnerId] ?? []).toContain(loserId);
    // 2-player grail: beating the one rival once meets the threshold and wins.
    expect(state.adventure?.winnerPlayerId).toBe(winnerId);
    expect(state.phase).toBe("game-over");
  });

  it("grants the opponent experience and a Necromancy window", () => {
    const state = makeGame();
    const { winnerId } = stageFinishedPvpFight(state, "retreat");
    state.players[winnerId].necromancyWindow = false;
    const winnerXpBefore = getMainHero(state, winnerId)!.experience;

    finalizeAdventureCombat(state);

    expect(getMainHero(state, winnerId)!.experience).toBeGreaterThan(winnerXpBefore);
    expect(state.players[winnerId].necromancyWindow).toBe(true);
  });
});

describe("Combat-scoped effects do not leak past a Retreat/Surrender (Bulwark Runes)", () => {
  // A fought-out win expires combat effects when the last unit falls
  // (finishCombatIfNeeded); a Retreat/Surrender/Give-up ends the battle by
  // setting `outcome` without that path. finalizeAdventureCombat must expire
  // them too, or a player-scoped Bulwark Rune buff would survive into the NEXT
  // combat and the seed would stack a second copy — the reported "+1 twice".
  function makeBulwarkGame(): GameState {
    return createAdventureGameState({
      seed: "rune-leak",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      pvpTroopLoss: "none", // keep both armies so the only thing under test is the effect
      players: [
        { id: "p1", name: "Kriv", factionId: "bulwark", heroDefId: "kriv" },
        { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
      ]
    });
  }

  for (const reason of ["retreat", "surrender"] as const) {
    it(`a ${reason} clears the Bulwark player's army-wide Rune buff (no leak into the next combat)`, () => {
      const state = makeBulwarkGame();
      stageFinishedPvpFight(state, reason);
      // p2 holds the 10-gold surrender toll so the staged outcome is legal to settle.
      state.players.p2.resources.gold = 10;

      // p1 (Bulwark) earned a Rune Level this fight: a live, player-scoped +1 Attack.
      seedRunesForCombat(state);
      gainRunes(state, "p1", 4); // 0 → 4 = Level 1
      const ctx = {
        attacker: state.combat!.units.a1,
        defender: state.combat!.units.b2,
        attackKind: "ranged" as const
      };
      expect(getActiveAttackBonus(state, ctx)).toBe(1);
      expect(state.activeEffects.some((effect) => effect.name === "Rune Power")).toBe(true);

      finalizeAdventureCombat(state);

      // Combat is over and torn down: the Rune buff must be gone, not lingering
      // in state.activeEffects to double up in the next battle's seed.
      expect(state.combat).toBeNull();
      expect(state.activeEffects.some((effect) => effect.name === "Rune Power")).toBe(false);
    });
  }
});

describe("Surrender gating: a before-battle (prep) decision needing the 10-gold toll", () => {
  // Surrender is offered ONLY in the pre-battle prep window (where BOTH sides
  // ready up). A round-1 PvP combat parked in that window: p1 attacks p2, neither
  // has accepted yet, so both hold their escape choices.
  function prepState(seed: string): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    state.combat = createInitialGameState(seed).combat;
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: state.heroes.hero_p1.spaceId ?? "0,0"
    };
    state.combat!.prep = { accepted: [] };
    state.phase = "combat-setup";
    state.priorityPlayerId = null;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    return state;
  }

  const offersSurrender = (state: GameState, playerId: PlayerId) =>
    getLegalActions(state, playerId).some((l) => l.action.type === "SURRENDER_COMBAT");
  const offersRetreat = (state: GameState, playerId: PlayerId) =>
    getLegalActions(state, playerId).some((l) => l.action.type === "RETREAT_FROM_COMBAT");

  it("offers a preparing hero Surrender only at >= 10 gold, but always offers Retreat", () => {
    const state = prepState("surr-gate");

    state.players.p2.resources.gold = 10;
    expect(offersSurrender(state, "p2")).toBe(true);
    expect(offersRetreat(state, "p2")).toBe(true);

    state.players.p2.resources.gold = 9;
    expect(offersSurrender(state, "p2")).toBe(false);
    expect(offersRetreat(state, "p2")).toBe(true); // a poorer hero may still flee
  });

  it("offers Surrender to BOTH participants in prep (both get a before-battle window)", () => {
    const state = prepState("surr-both");
    state.players.p1.resources.gold = 100;
    state.players.p2.resources.gold = 100;
    expect(offersSurrender(state, "p1")).toBe(true);
    expect(offersSurrender(state, "p2")).toBe(true);
  });

  it("stops offering Surrender to a participant once they have accepted the battle", () => {
    const state = prepState("surr-accepted");
    state.players.p1.resources.gold = 100;
    state.combat!.prep = { accepted: ["p1"] }; // p1 readied up
    expect(offersSurrender(state, "p1")).toBe(false);
  });

  it("rejects a Surrender action below 10 gold and accepts it at exactly 10", () => {
    const poor = prepState("surr-poor");
    poor.players.p2.resources.gold = 9;
    const rejected = applyAction(poor, { type: "SURRENDER_COMBAT", playerId: "p2" });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.state.combat?.outcome ?? null).toBeNull();

    const rich = prepState("surr-rich");
    rich.players.p2.resources.gold = 10;
    const ok = applyAction(rich, { type: "SURRENDER_COMBAT", playerId: "p2" });
    expect(ok.errors).toEqual([]);
    expect(ok.state.combat?.outcome).toMatchObject({ defeatedPlayerId: "p2", reason: "surrender" });
  });

  it("rejects a Surrender once deployment has begun (no longer a before-battle decision)", () => {
    const state = prepState("surr-too-late");
    state.players.p2.resources.gold = 50;
    // Deployment has started: the prep window is gone and placement is underway.
    state.combat!.prep = null;
    state.combat!.setup = {
      pendingPlayerIds: ["p1", "p2"],
      placedUnitIds: { p1: [], p2: [] },
      unitLimit: 7
    } as never;
    expect(offersSurrender(state, "p2")).toBe(false);
    const rejected = applyAction(state, { type: "SURRENDER_COMBAT", playerId: "p2" });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.state.combat?.outcome ?? null).toBeNull();
  });
});

describe("Surrender ban: defending your own Faction Town (rulebook p.46)", () => {
  // A prep-window PvP combat fought ON the defender's own Faction Town field:
  // p1 besieges p2's town, p2's hero defends. Both still hold the 10-gold toll,
  // so only the Faction-Town rule (not money) can withhold Surrender.
  function townDefenseState(seed: string): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    state.combat = createInitialGameState(seed).combat;
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: state.towns.town_p2.fieldId ?? "0,0"
    };
    state.combat!.prep = { accepted: [] };
    state.phase = "combat-setup";
    state.priorityPlayerId = null;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.resources.gold = 20;
    state.players.p2.resources.gold = 20;
    return state;
  }

  const offersSurrender = (state: GameState, playerId: PlayerId) =>
    getLegalActions(state, playerId).some((l) => l.action.type === "SURRENDER_COMBAT");
  const offersRetreat = (state: GameState, playerId: PlayerId) =>
    getLegalActions(state, playerId).some((l) => l.action.type === "RETREAT_FROM_COMBAT");

  it("withholds Surrender from the town's own defender, but still offers Retreat", () => {
    const state = townDefenseState("surr-town-defender");
    expect(state.towns.town_p2.controllerId).toBe("p2"); // it really is p2's Faction Town
    expect(offersSurrender(state, "p2")).toBe(false);
    expect(offersRetreat(state, "p2")).toBe(true);
  });

  it("still offers Surrender to the attacker (they are not defending a Faction Town)", () => {
    const state = townDefenseState("surr-town-attacker");
    expect(offersSurrender(state, "p1")).toBe(true);
  });

  it("rejects a forced Surrender from the town's defender, leaving combat unresolved", () => {
    const state = townDefenseState("surr-town-force");
    const rejected = applyAction(state, { type: "SURRENDER_COMBAT", playerId: "p2" });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.state.combat?.outcome ?? null).toBeNull();
  });

  it("lets the defender Surrender a fight that is NOT on their Faction Town", () => {
    const state = townDefenseState("surr-town-elsewhere");
    // Same combat, but moved off the town onto open ground: the ban lifts.
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: "99,99"
    };
    expect(offersSurrender(state, "p2")).toBe(true);
  });
});
