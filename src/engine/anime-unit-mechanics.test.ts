import { describe, expect, it } from "vitest";

import {
  applyAction,
  armyUnitStacksActive,
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  getLegalActions,
  makeCombatUnitFromArmy,
  NEUTRAL_PLAYER_ID,
  unitExperienceBonus,
  unitRankForXp,
  unitSideRuleOverrides
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import type { AnimeModOptions, CombatState, CombatUnitState, GameAction, GameState, PlayerId } from "./state";

/**
 * Anime Unit Stacks (§5.2 road into the Polish army-stack machinery) and Unit
 * Experience (WoG-style veterancy). Each claim is mutation-checked with a
 * module-off / polish-off / not-a-winner CONTROL — the observable game outcome
 * (a purchase succeeds, an attack/defense value moves, an army card gains XP) is
 * asserted, never just a stored intermediate.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A BINH adventure game with the given anime module flags; polish rules OFF. */
function animeGame(anime: Partial<AnimeModOptions>, seed = "anime-unit-mech"): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: "binh",
    houseRules: { "polish-unit-stacks": false },
    anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, ...anime }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.resources = { gold: 500, buildingMaterials: 100, valuables: 100 };
  return state;
}

function addCitadel(state: GameState): void {
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
  if (!town.buildings.includes("castle.citadel")) {
    town.buildings.push("castle.citadel");
  }
}

const centaurs = { id: "stack_centaurs", unitDefId: "rampart.centaurs", side: "pack" as const };

function combatUnit(
  state: GameState,
  armyUnit: { id: string; unitDefId: string; side: "few" | "pack" | "neutral"; stacks?: number; xp?: number },
  id = "cu"
): CombatUnitState {
  return makeCombatUnitFromArmy(armyUnit, "p1", id, 0, "binh", unitSideRuleOverrides(state))!;
}

// ===========================================================================
// Unit Stacks — the anime road into the EXISTING Polish machinery
// ===========================================================================

describe("Anime Unit Stacks — the second road into one machinery", () => {
  it("anime.unitStacks activates armyUnitStacksActive with the Polish rule OFF (and both-off / polish-only CONTROLs)", () => {
    const animeOn = animeGame({ unitStacks: true });
    expect(armyUnitStacksActive(animeOn)).toBe(true);

    const bothOff = animeGame({ unitStacks: false });
    expect(armyUnitStacksActive(bothOff)).toBe(false);

    // Polish-only (anime module off) still activates it — the OR, not a replace.
    const polishOnly = createAdventureGameState({
      seed: "polish-only-road",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      ruleset: "legacy",
      houseRules: { "polish-unit-stacks": true }
    });
    expect(armyUnitStacksActive(polishOnly)).toBe(true);
  });

  it("offers and resolves a Citadel Stack purchase via the anime road (Polish rule OFF)", () => {
    let state = animeGame({ unitStacks: true });
    addCitadel(state);
    state.players.p1.townTokens.population = true;
    state.players.p1.army = [{ ...centaurs }];
    const beforeGold = state.players.p1.resources.gold;

    const offered = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.kind === "stack"
    );
    expect(offered?.label).toContain("Add Stack to Centaurs");

    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: centaurs.unitDefId, armyUnitId: centaurs.id }]
    });
    // Centaur: 3 Pack gold + tier-1 surcharge = 4 (same pricing as the Polish road).
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(beforeGold - 4);
  });

  it("CONTROL: with both roads OFF the offer is absent and a forged purchase is rejected", () => {
    const state = animeGame({ unitStacks: false });
    addCitadel(state);
    state.players.p1.townTokens.population = true;
    state.players.p1.army = [{ ...centaurs }];
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.kind === "stack"
      )
    ).toBe(false);
    expect(
      applyAction(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "stack", unitDefId: centaurs.unitDefId, armyUnitId: centaurs.id }]
      }).errors[0]?.message
    ).toContain("not enabled");
  });

  it("the anime-road +1 Attack rides the combat unit (a stacked Pack outhits a plain Pack by 1)", () => {
    const state = animeGame({ unitStacks: true });
    const stacked = combatUnit(state, { ...centaurs, stacks: 1 }, "cu_stacked");
    const plain = combatUnit(state, { ...centaurs, stacks: 0 }, "cu_plain");
    expect(stacked.armyStacks).toBe(1);
    expect(stacked.attack - plain.attack).toBe(1);
  });
});

// ===========================================================================
// Unit Experience — WoG-style veterancy
// ===========================================================================

/** Craft a finished neutral combat with the given units and winner, then finalize. */
function finishNeutralCombat(state: GameState, units: CombatUnitState[], winner: PlayerId): void {
  const hero = state.heroes.hero_p1;
  state.phase = "combat";
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    units: Object.fromEntries(units.map((unit) => [unit.id, unit])),
    context: { kind: "neutral", heroId: hero.id, fieldId: hero.spaceId!, difficulty: 1, hasAzure: false },
    outcome:
      winner === "p1"
        ? { winnerPlayerId: "p1", defeatedPlayerId: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" }
        : { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" }
  } as CombatState;
  finalizeAdventureCombat(state);
}

describe("Anime Unit Experience — rank data", () => {
  it("data-driven thresholds: 2 → Veteran, 5 → Elite, 9 → Legend (below 2 = none)", () => {
    expect(unitRankForXp(1)).toBeNull();
    expect(unitRankForXp(2)?.id).toBe("veteran");
    expect(unitExperienceBonus(2)).toEqual({ attack: 1, defense: 0, health: 0 });
    expect(unitRankForXp(4)?.id).toBe("veteran");
    expect(unitRankForXp(5)?.id).toBe("elite");
    expect(unitExperienceBonus(5)).toEqual({ attack: 1, defense: 1, health: 0 });
    expect(unitRankForXp(9)?.id).toBe("legend");
    expect(unitExperienceBonus(12)).toEqual({ attack: 1, defense: 1, health: 1 });
  });
});

describe("Anime Unit Experience — gain", () => {
  it("a WON neutral combat grants +1 XP to survivors only (dead unit's card leaves with no XP)", () => {
    const state = animeGame({ unitExperience: true }, "xp-win");
    state.players.p1.army = [
      { id: "surv", unitDefId: "castle.griffins", side: "pack" },
      { id: "dead", unitDefId: "castle.marksmen", side: "few" }
    ];
    const surv = combatUnit(state, state.players.p1.army[0], "cu_surv");
    const dead = combatUnit(state, state.players.p1.army[1], "cu_dead");
    dead.damage = dead.maxHealth; // dies

    finishNeutralCombat(state, [surv, dead], "p1");

    expect(state.players.p1.army.find((entry) => entry.id === "surv")?.xp).toBe(1);
    // The dead card left the army (its XP is gone with it — fresh card next owner).
    expect(state.players.p1.army.some((entry) => entry.id === "dead")).toBe(false);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_EXPERIENCE_GAINED" && event.armyUnitId === "surv")
    ).toBe(true);
  });

  it("CONTROL: a LOST combat grants NO XP, and the module OFF grants none even on a win", () => {
    const lost = animeGame({ unitExperience: true }, "xp-loss");
    lost.players.p1.army = [{ id: "u", unitDefId: "castle.griffins", side: "pack" }];
    const u = combatUnit(lost, lost.players.p1.army[0], "cu_u");
    finishNeutralCombat(lost, [u], NEUTRAL_PLAYER_ID);
    expect(lost.players.p1.army[0].xp).toBeUndefined();

    const off = animeGame({ unitExperience: false }, "xp-off");
    off.players.p1.army = [{ id: "u", unitDefId: "castle.griffins", side: "pack" }];
    const u2 = combatUnit(off, off.players.p1.army[0], "cu_u2");
    finishNeutralCombat(off, [u2], "p1");
    expect(off.players.p1.army[0].xp).toBeUndefined();
    expect(off.eventLog.some((event) => event.type === "UNIT_EXPERIENCE_GAINED")).toBe(false);
    // The grant never opens a window (nothing for the AI to answer).
    expect(off.pendingChoice ?? null).toBeNull();
  });

  it("XP is KEPT across a Pack→Few flip (a flipped survivor of a LOST combat keeps its XP)", () => {
    const state = animeGame({ unitExperience: true }, "xp-flip");
    state.players.p1.army = [{ id: "vet", unitDefId: "castle.griffins", side: "pack", xp: 2 }];
    const u = combatUnit(state, state.players.p1.army[0], "cu_vet");
    // Simulate a Pack that was knocked down to Few but survived.
    u.variant = "few";
    u.damage = 0;
    finishNeutralCombat(state, [u], NEUTRAL_PLAYER_ID); // loss ⇒ no grant, isolates the flip
    const card = state.players.p1.army.find((entry) => entry.id === "vet");
    expect(card?.side).toBe("few");
    expect(card?.xp).toBe(2); // veterans survived the flip
  });
});

describe("Anime Unit Experience — rank bonus folds onto both sides", () => {
  it("a Veteran/Elite/Legend card's derived Attack/Defense/Health beats a rookie's by the rank bonus", () => {
    const state = animeGame({ unitExperience: true }, "xp-fold");
    const rookie = combatUnit(state, { id: "r", unitDefId: "castle.griffins", side: "pack" }, "cu_rookie");
    const legend = combatUnit(state, { id: "l", unitDefId: "castle.griffins", side: "pack", xp: 9 }, "cu_legend");
    expect(legend.attack - rookie.attack).toBe(1);
    expect(legend.defense - rookie.defense).toBe(1);
    expect(legend.maxHealth - rookie.maxHealth).toBe(1);
    expect(legend.unitXp).toBe(9);

    // The Few side carries the SAME bonus (fold is per-derivation, not per-Pack-side).
    const legendFew = combatUnit(state, { id: "lf", unitDefId: "castle.griffins", side: "few", xp: 9 }, "cu_legend_few");
    const rookieFew = combatUnit(state, { id: "rf", unitDefId: "castle.griffins", side: "few" }, "cu_rookie_few");
    expect(legendFew.attack - rookieFew.attack).toBe(1);
  });

  it("CONTROL: with the module OFF the same XP card is NOT boosted and carries no unitXp", () => {
    const off = animeGame({ unitExperience: false }, "xp-fold-off");
    const rookie = combatUnit(off, { id: "r", unitDefId: "castle.griffins", side: "pack" }, "cu_r");
    const veteranCard = combatUnit(off, { id: "v", unitDefId: "castle.griffins", side: "pack", xp: 9 }, "cu_v");
    expect(veteranCard.attack).toBe(rookie.attack);
    expect(veteranCard.unitXp).toBeUndefined();
  });
});

describe("Anime Unit Experience — cross-seam with Unit Stacks", () => {
  it("a Stacked Veteran card gets BOTH bonuses (+1 stack Attack AND +1 veteran Attack)", () => {
    const state = animeGame({ unitStacks: true, unitExperience: true }, "xp-stack");
    const plain = combatUnit(state, { ...centaurs, stacks: 0 }, "cu_plain2");
    const both = combatUnit(state, { ...centaurs, stacks: 1, xp: 2 }, "cu_both");
    expect(both.armyStacks).toBe(1);
    expect(both.unitXp).toBe(2);
    expect(unitRankForXp(both.unitXp)?.id).toBe("veteran");
    expect(both.attack - plain.attack).toBe(2); // +1 stack, +1 veteran
  });
});
