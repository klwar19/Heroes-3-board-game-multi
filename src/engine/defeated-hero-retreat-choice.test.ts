import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero } from "./index";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { ATTACK_DIE_FACES } from "./battlefield";
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
    // The hero is still on the fight field (movement spent) until it picks.
    expect(state.heroes[loserHeroId].movementPoints).toBe(0);
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
  });
});

describe("Defeated-hero retreat CHOICE — neutral loss", () => {
  function stageNeutralLoss(state: GameState): { heroId: string; fieldId: string } {
    const hero = getMainHero(state, "p1")!;
    const field = injectField(state, "50,50", "empty_field");
    hero.spaceId = field.spaceId;
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
  });
});
