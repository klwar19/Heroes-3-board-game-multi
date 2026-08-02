import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero } from "./index";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { ATTACK_DIE_FACES } from "./battlefield";
import {
  customMapPresetIsActive,
  describeCustomMapPresetEntries,
  sanitizeCustomMapPreset
} from "./map-preset";
import type { CombatState, CombatUnitState, GameState, MapFieldState, PlayerId } from "./state";

/**
 * BINH house rule: a defeated Hero "moves to a friendly Town or Settlement" —
 * the loser's CHOICE, not a fixed Town. When the beaten player is the turn-owner
 * (every neutral loss, and a PvP loss taken by the attacker) and their main Hero
 * owns two or more retreat fields, a retreat CHOICE opens (a pendingVisit the
 * loser resolves by picking the destination). With one retreat field it
 * auto-homes; a beaten DEFENDER (not the turn-owner) always auto-homes so the
 * attacker's turn never stalls.
 *
 * Every claim below is an observable outcome (the pendingVisit offered or not,
 * and the Hero's resulting spaceId), each with a control where it must NOT fire.
 */

function makeGame(): GameState {
  return createAdventureGameState({
    seed: "defeated-retreat-choice",
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest",
    pvpTroopLoss: "normal",
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ]
  });
}

function injectField(state: GameState, spaceId: string, location: string, over: Partial<MapFieldState> = {}): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: `tile-${spaceId}`,
    slot: 0,
    location,
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    ...over
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

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

/**
 * Stage a finished PvP fight in which `loser` is defeated. `attackerIsLoser`
 * decides whether the beaten side is the attacker (the turn-owner — promptable)
 * or the defender (auto-homes). The fight field is a neutral empty field so it
 * is never itself a retreat destination.
 */
function stagePvp(state: GameState, attackerIsLoser: boolean): { loserId: PlayerId; loserHeroId: string } {
  const attacker = getMainHero(state, "p1")!;
  const defender = getMainHero(state, "p2")!;
  const field = injectField(state, "50,50", "empty_field");
  attacker.spaceId = field.spaceId;
  defender.spaceId = field.spaceId;
  state.activePlayerId = "p1"; // the attacker's turn

  state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];
  state.players.p2.army = [{ id: "b1", unitDefId: "castle.pikemen", side: "few" }];

  const loserId: PlayerId = attackerIsLoser ? "p1" : "p2";
  const winnerId: PlayerId = attackerIsLoser ? "p2" : "p1";
  // The approach/fight already consumed its normal cost. Falling back home
  // must preserve what remains instead of imposing an extra zero-MP penalty.
  state.heroes[attackerIsLoser ? attacker.id : defender.id].movementPoints = 2;

  state.combat = {
    id: "c1",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    activeUnitId: null,
    context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId: field.spaceId },
    setup: null,
    awaitingContinue: false,
    outcome: { winnerPlayerId: winnerId, defeatedPlayerId: loserId, reason: "retreat" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {
      a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1" }),
      b1: unit({ id: "b1", controllerId: "p2", armyUnitId: "b1" })
    }
  } as CombatState;

  return { loserId, loserHeroId: attackerIsLoser ? attacker.id : defender.id };
}

describe("Defeated-hero retreat CHOICE (town or settlement)", () => {
  it("attacker who loses, owning a Town AND a Settlement, is offered BOTH as a retreat choice", () => {
    const state = makeGame();
    const townField = state.towns.town_p1.fieldId!;
    const settlement = injectField(state, "10,10", "settlement", { flagOwnerId: "p1", everFlagged: true });
    const { loserHeroId } = stagePvp(state, true);

    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);

    // The beaten hero is NOT auto-homed yet: a retreat choice is open for p1.
    const visit = state.adventure!.pendingVisit;
    expect(visit?.playerId).toBe("p1");
    const step = visit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    const teleportTargets = (step as { options: { steps: { type: string; spaceId?: string }[] }[] }).options.map(
      (option) => option.steps[0]
    );
    // Every option is a TELEPORT_HERO to a friendly Town or Settlement — never a
    // "cancel/stay" (a defeated hero cannot stay on the fight field).
    expect(teleportTargets.every((s) => s.type === "TELEPORT_HERO")).toBe(true);
    const offered = teleportTargets.map((s) => s.spaceId).sort();
    expect(offered).toEqual([settlement.spaceId, townField].sort());
    // The hero is still on the fight field until it picks, retaining the MP
    // left after the normal approach/combat deduction.
    expect(state.heroes[loserHeroId].movementPoints).toBe(2);
  });

  it("picking the Settlement teleports the hero there; picking the Town teleports home (mutation control)", () => {
    for (const target of ["settlement", "town"] as const) {
      const state = makeGame();
      const townField = state.towns.town_p1.fieldId!;
      const settlement = injectField(state, "10,10", "settlement", { flagOwnerId: "p1", everFlagged: true });
      const { loserHeroId } = stagePvp(state, true);

      finalizeAdventureCombat(state);
      pumpAdventureQueues(state);

      const wanted = target === "settlement" ? settlement.spaceId : townField;
      const offers = getLegalActions(state, "p1").filter((l) => l.action.type === "RESOLVE_VISIT_STEP");
      const step = state.adventure!.pendingVisit!.steps[0] as {
        options: { steps: { type: string; spaceId?: string }[] }[];
      };
      const optionIndex = step.options.findIndex((option) => option.steps[0]?.spaceId === wanted);
      expect(optionIndex).toBeGreaterThanOrEqual(0);
      const chosen = offers.find(
        (l) => l.action.type === "RESOLVE_VISIT_STEP" && l.action.optionIndex === optionIndex
      );
      expect(chosen, `retreat option for ${target}`).toBeTruthy();

      const result = applyAction(state, chosen!.action);
      expect(result.errors).toEqual([]);
      expect(result.state.heroes[loserHeroId].spaceId).toBe(wanted);
      expect(result.state.heroes[loserHeroId].movementPoints).toBe(2);
      expect(result.state.adventure!.pendingVisit).toBeNull();
    }
  });

  it("CONTROL: an attacker who loses with ONLY a Town (no settlement) auto-homes — no choice", () => {
    const state = makeGame();
    const townField = state.towns.town_p1.fieldId!;
    const { loserHeroId } = stagePvp(state, true);

    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);

    expect(state.adventure!.pendingVisit).toBeNull();
    expect(state.heroes[loserHeroId].spaceId).toBe(townField);
    expect(state.heroes[loserHeroId].movementPoints).toBe(2);
  });

  it("CONTROL: a beaten DEFENDER (not the turn-owner) auto-homes even with a Town AND Settlement", () => {
    const state = makeGame();
    const townField = state.towns.town_p2.fieldId!;
    injectField(state, "20,20", "settlement", { flagOwnerId: "p2", everFlagged: true });
    const { loserHeroId } = stagePvp(state, false);

    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);

    // p2 is the defender on p1's turn — no cross-turn prompt; auto-home to town.
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(state.heroes[loserHeroId].spaceId).toBe(townField);
    expect(state.heroes[loserHeroId].movementPoints).toBe(2);
  });
});

describe("Defeated-hero retreat CHOICE — neutral loss", () => {
  function stageNeutralLoss(state: GameState): { heroId: string; fieldId: string } {
    const hero = getMainHero(state, "p1")!;
    const field = injectField(state, "50,50", "empty_field");
    hero.spaceId = field.spaceId;
    hero.movementPoints = 1;
    state.activePlayerId = "p1";
    state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];

    state.combat = {
      id: "cn",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "neutrals",
      activeUnitId: null,
      context: { kind: "neutral", heroId: hero.id, fieldId: field.spaceId, difficulty: 7, hasAzure: false },
      setup: null,
      awaitingContinue: false,
      outcome: { winnerPlayerId: "neutrals", defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {
        a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1", damage: 2, maxHealth: 2 })
      }
    } as CombatState;

    return { heroId: hero.id, fieldId: field.spaceId };
  }

  it("a neutral loss with a Town AND Settlement opens the retreat choice (fighter is the turn-owner)", () => {
    const state = makeGame();
    const townField = state.towns.town_p1.fieldId!;
    const settlement = injectField(state, "10,10", "settlement", { flagOwnerId: "p1", everFlagged: true });
    stageNeutralLoss(state);

    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);

    const visit = state.adventure!.pendingVisit;
    expect(visit?.playerId).toBe("p1");
    expect(visit!.steps[0].type).toBe("CHOOSE_ONE");
    const offered = (visit!.steps[0] as { options: { steps: { spaceId?: string }[] }[] }).options
      .map((option) => option.steps[0]?.spaceId)
      .sort();
    expect(offered).toEqual([settlement.spaceId, townField].sort());
    expect(state.heroes.hero_p1.movementPoints).toBe(1);
  });
});

/**
 * Falling back after a defeat is a RELOCATION, not an extra movement cost: the
 * points the Hero had left after its normal approach/combat deductions survive
 * (matching how a RETREAT from a neutral fight has always behaved — it steps the
 * Hero back without zeroing its movement). The observable consequence is that the
 * beaten Hero can still march this turn; the control is the same beaten Hero with
 * its movement genuinely spent, which is offered nothing.
 */
describe("Defeated-hero fall-back keeps the movement left over", () => {
  function beatenAttackerMoveOffers(state: GameState, movementLeft: number): string[] {
    const { loserHeroId } = stagePvp(state, true);
    state.heroes[loserHeroId].movementPoints = movementLeft;

    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);
    // Only ONE retreat field (the Town) — the Hero auto-homes, no open choice.
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(state.heroes[loserHeroId].spaceId).toBe(state.towns.town_p1.fieldId);
    expect(state.heroes[loserHeroId].movementPoints).toBe(movementLeft);

    // Clear the two gates that stand between the finished fight and map play:
    // the combat notice, then the mandatory start-of-turn hand step (which the
    // harness still owes — in real play the walk into the fight came after it).
    for (const type of ["ACKNOWLEDGE_COMBAT_END", "REFRESH_HAND"] as const) {
      const gate = getLegalActions(state, "p1").find((entry) => entry.action.type === type);
      if (gate) {
        const result = applyAction(state, gate.action);
        expect(result.errors).toEqual([]);
        state = result.state;
      }
    }
    expect(state.heroes[loserHeroId].movementPoints).toBe(movementLeft);
    return getLegalActions(state, "p1")
      .filter((entry) => entry.action.type === "MOVE_HERO")
      .map((entry) => entry.label);
  }

  it("the beaten Hero can still march out of the Town it fell back to", () => {
    expect(beatenAttackerMoveOffers(makeGame(), 2).length).toBeGreaterThan(0);
  });

  it("CONTROL: a beaten Hero whose movement was genuinely spent is offered no move", () => {
    expect(beatenAttackerMoveOffers(makeGame(), 0)).toEqual([]);
  });
});

/**
 * Designer map bonus `heroDefeatGold`: the winner of a REAL enemy-hero defeat
 * (fought-out or retreat) gains extra gold, on top of the normal 5-gold spoils.
 * A surrender never reaches the real-defeat branch, so it pays no bounty. Every
 * claim is a gold delta with a control that isolates the bounty.
 */
describe("Hero-defeat bounty (designer map bonus, heroDefeatGold)", () => {
  // Gold the WINNER (p1) gains from finalizing a staged PvP loss for p2 with the
  // given outcome reason and optional bounty. Two runs differ ONLY by the preset,
  // so the difference is exactly the bounty the branch pays.
  const winnerGoldDelta = (reason: "retreat" | "surrender", bounty?: number): number => {
    const state = makeGame();
    if (bounty !== undefined) {
      state.adventure!.mapPreset = { heroDefeatGold: bounty };
    }
    stagePvp(state, false); // p1 (attacker) WINS; p2 (defender) is beaten
    state.combat!.outcome!.reason = reason;
    const before = state.players.p1.resources.gold;
    finalizeAdventureCombat(state);
    return state.players.p1.resources.gold - before;
  };

  it("a real enemy-hero defeat pays the winner the bounty on top of the spoils", () => {
    // Fails if the grant is removed (both deltas become the spoils toll → 0 gap).
    expect(winnerGoldDelta("retreat", 25) - winnerGoldDelta("retreat", undefined)).toBe(25);
  });

  it("CONTROL: a SURRENDER pays no bounty — no hero was truly defeated", () => {
    expect(winnerGoldDelta("surrender", 25)).toBe(winnerGoldDelta("surrender", undefined));
  });

  it("sanitize clamps the bounty 0..100, keeps the preset active, and the banner names it", () => {
    expect(sanitizeCustomMapPreset({ heroDefeatGold: 250 })?.heroDefeatGold).toBe(100);
    expect(sanitizeCustomMapPreset({ heroDefeatGold: 0 })?.heroDefeatGold).toBeUndefined();
    const preset = sanitizeCustomMapPreset({ heroDefeatGold: 30 });
    expect(preset?.heroDefeatGold).toBe(30);
    expect(customMapPresetIsActive(preset)).toBe(true);
    expect(
      describeCustomMapPresetEntries(preset).some((entry) =>
        entry.text.includes("Defeat an enemy Hero: +30 gold")
      )
    ).toBe(true);
  });
});
