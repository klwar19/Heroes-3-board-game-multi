import { describe, expect, it } from "vitest";

import {
  applyAction,
  armyUnitStacksActive,
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  getLegalActions,
  makeCombatUnitFromArmy,
  NEUTRAL_PLAYER_ID,
  unitExperienceActive,
  unitRankForExperience,
  unitRankStatBonuses,
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
  armyUnit: { id: string; unitDefId: string; side: "few" | "pack" | "neutral"; stacks?: number; experience?: number },
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
// Unit Experience — the anime road (`anime.unitExperience`) into the SHARED
// WoG-UES veterancy machinery (the SAME engine the lobby option and the WOG
// module enable — see unit-experience.test.ts for the machinery's own suite).
// Every unit here is BRONZE tier, so the bronze thresholds/bonuses apply.
// ===========================================================================

/** Craft a finished neutral combat with the given units and winner, then finalize. */
function finishNeutralCombat(
  state: GameState,
  units: CombatUnitState[],
  winner: PlayerId,
  difficulty = 1
): void {
  const hero = state.heroes.hero_p1;
  state.phase = "combat";
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    units: Object.fromEntries(units.map((unit) => [unit.id, unit])),
    setup: null,
    awaitingContinue: false,
    context: { kind: "neutral", heroId: hero.id, fieldId: hero.spaceId!, difficulty, hasAzure: false },
    outcome:
      winner === "p1"
        ? { winnerPlayerId: "p1", defeatedPlayerId: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" }
        : { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" }
  } as CombatState;
  finalizeAdventureCombat(state);
}

describe("Anime Unit Experience — the second road into one machinery", () => {
  it("anime.unitExperience freezes the shared rule ON (and off / lobby-only CONTROLs)", () => {
    const animeOn = animeGame({ unitExperience: true });
    expect(unitExperienceActive(animeOn)).toBe(true);
    expect(animeOn.adventure?.unitExperience).toBe(true);

    const off = animeGame({ unitExperience: false });
    expect(unitExperienceActive(off)).toBe(false);

    // Lobby/remote road (anime module off) activates the SAME machinery — the OR,
    // not a replace: unitExperienceActive is true from the frozen adventure flag.
    const lobbyOnly = createAdventureGameState({
      seed: "uxp-lobby-road",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      ruleset: "legacy",
      unitExperience: true
    } as Parameters<typeof createAdventureGameState>[0]);
    expect(unitExperienceActive(lobbyOnly)).toBe(true);
  });
});

describe("Anime Unit Experience — tier-scaled rank data (bronze)", () => {
  it("bronze thresholds 2/5/9 with the CREXPBON default progression (Defense first, +Initiative at rank 3)", () => {
    expect(unitRankForExperience("bronze", 1)).toBe(0);
    expect(unitRankForExperience("bronze", 2)).toBe(1);
    expect(unitRankStatBonuses("bronze", 1)).toEqual({ attack: 0, defense: 1, health: 0, initiative: 0 });
    expect(unitRankForExperience("bronze", 4)).toBe(1);
    expect(unitRankForExperience("bronze", 5)).toBe(2);
    expect(unitRankStatBonuses("bronze", 2)).toEqual({ attack: 1, defense: 1, health: 0, initiative: 0 });
    expect(unitRankForExperience("bronze", 9)).toBe(3);
    expect(unitRankStatBonuses("bronze", 3)).toEqual({ attack: 1, defense: 1, health: 1, initiative: 1 });
  });
});

describe("Anime Unit Experience — gain", () => {
  it("a WON neutral combat grants the Field Difficulty in XP to survivors only (dead card leaves with no XP)", () => {
    const state = animeGame({ unitExperience: true }, "xp-win");
    state.players.p1.army = [
      { id: "surv", unitDefId: "castle.griffins", side: "pack" },
      { id: "dead", unitDefId: "castle.marksmen", side: "few" }
    ];
    const surv = combatUnit(state, state.players.p1.army[0], "cu_surv");
    const dead = combatUnit(state, state.players.p1.army[1], "cu_dead");
    dead.damage = dead.maxHealth; // dies

    finishNeutralCombat(state, [surv, dead], "p1"); // difficulty 1 ⇒ 1 XP each survivor

    expect(state.players.p1.army.find((entry) => entry.id === "surv")?.experience).toBe(1);
    // The dead card left the army (its XP is gone with it — fresh card next owner).
    expect(state.players.p1.army.some((entry) => entry.id === "dead")).toBe(false);
  });

  it("crossing a rank threshold on a win emits UNIT_RANK_UP (bronze 1 XP → 2 = rank 1)", () => {
    const state = animeGame({ unitExperience: true }, "xp-rankup");
    state.players.p1.army = [{ id: "vet", unitDefId: "castle.griffins", side: "pack", experience: 1 }];
    const u = combatUnit(state, state.players.p1.army[0], "cu_rankup");
    finishNeutralCombat(state, [u], "p1"); // +1 XP → 2 = bronze rank 1
    expect(state.players.p1.army[0].experience).toBe(2);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_RANK_UP" && event.unitDefId === "castle.griffins")
    ).toBe(true);
  });

  it("CONTROL: a LOST combat grants NO XP, and the module OFF grants none even on a win", () => {
    const lost = animeGame({ unitExperience: true }, "xp-loss");
    lost.players.p1.army = [{ id: "u", unitDefId: "castle.griffins", side: "pack" }];
    const u = combatUnit(lost, lost.players.p1.army[0], "cu_u");
    finishNeutralCombat(lost, [u], NEUTRAL_PLAYER_ID);
    expect(lost.players.p1.army[0].experience).toBeUndefined();

    const off = animeGame({ unitExperience: false }, "xp-off");
    off.players.p1.army = [{ id: "u", unitDefId: "castle.griffins", side: "pack" }];
    const u2 = combatUnit(off, off.players.p1.army[0], "cu_u2");
    finishNeutralCombat(off, [u2], "p1");
    expect(off.players.p1.army[0].experience).toBeUndefined();
    expect(off.eventLog.some((event) => event.type === "UNIT_RANK_UP")).toBe(false);
    // The grant never opens a window (nothing for the AI to answer).
    expect(off.pendingChoice ?? null).toBeNull();
  });

  it("XP is KEPT across a Pack→Few flip (a flipped survivor of a LOST combat keeps its XP)", () => {
    const state = animeGame({ unitExperience: true }, "xp-flip");
    state.players.p1.army = [{ id: "vet", unitDefId: "castle.griffins", side: "pack", experience: 2 }];
    const u = combatUnit(state, state.players.p1.army[0], "cu_vet");
    // Simulate a Pack that was knocked down to Few but survived.
    u.variant = "few";
    u.damage = 0;
    finishNeutralCombat(state, [u], NEUTRAL_PLAYER_ID); // loss ⇒ no grant, isolates the flip
    const card = state.players.p1.army.find((entry) => entry.id === "vet");
    expect(card?.side).toBe("few");
    expect(card?.experience).toBe(2); // veterans survived the flip
  });
});

describe("Anime Unit Experience — rank bonus folds onto both sides", () => {
  it("a max-rank (bronze rank 3) card's derived stats beat a rookie's by the rank-3 fold (+1 Atk/Def/HP/Init)", () => {
    const state = animeGame({ unitExperience: true }, "xp-fold");
    const rookie = combatUnit(state, { id: "r", unitDefId: "castle.griffins", side: "pack" }, "cu_rookie");
    const legend = combatUnit(state, { id: "l", unitDefId: "castle.griffins", side: "pack", experience: 9 }, "cu_legend");
    expect(legend.attack - rookie.attack).toBe(1);
    expect(legend.defense - rookie.defense).toBe(1);
    expect(legend.maxHealth - rookie.maxHealth).toBe(1);
    expect(legend.initiative - rookie.initiative).toBe(1);
    expect(legend.unitExperience).toBe(9);
    expect(legend.unitRank).toBe(3);

    // The Few side carries the SAME bonus (fold is per-derivation, not per-Pack-side).
    const legendFew = combatUnit(state, { id: "lf", unitDefId: "castle.griffins", side: "few", experience: 9 }, "cu_legend_few");
    const rookieFew = combatUnit(state, { id: "rf", unitDefId: "castle.griffins", side: "few" }, "cu_rookie_few");
    expect(legendFew.attack - rookieFew.attack).toBe(1);
  });

  it("CONTROL: a rookie (no XP) card carries no unitExperience/unitRank (unified fold reads a stamped field only)", () => {
    const state = animeGame({ unitExperience: true }, "xp-fold-rookie");
    const rookie = combatUnit(state, { id: "r", unitDefId: "castle.griffins", side: "pack" }, "cu_r");
    expect(rookie.unitExperience).toBeUndefined();
    expect(rookie.unitRank).toBeUndefined();
    // The off-guarantee is upstream: with the rule off no win ever stamps
    // `experience` (proven in the gain CONTROL above), so no fold ever runs.
    expect(unitRankForExperience("bronze", 0)).toBe(0);
  });
});

describe("Anime Unit Experience — cross-seam with Unit Stacks", () => {
  it("a Stacked veteran card gets BOTH bonuses (+1 stack Attack AND the rank-2 +1 Attack fold)", () => {
    const state = animeGame({ unitStacks: true, unitExperience: true }, "xp-stack");
    const plain = combatUnit(state, { ...centaurs, stacks: 0 }, "cu_plain2");
    // Bronze rank 2 (xp 5) folds +1 Attack (+1 Defense); with a stack layer that's +2 Attack total.
    const both = combatUnit(state, { ...centaurs, stacks: 1, experience: 5 }, "cu_both");
    expect(both.armyStacks).toBe(1);
    expect(both.unitExperience).toBe(5);
    expect(both.unitRank).toBe(2);
    expect(unitRankForExperience("bronze", both.unitExperience!)).toBe(2);
    expect(both.attack - plain.attack).toBe(2); // +1 stack, +1 rank-2 veteran Attack
  });
});
