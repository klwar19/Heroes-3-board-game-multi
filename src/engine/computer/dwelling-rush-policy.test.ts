import { describe, expect, it } from "vitest";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import type { TownBuildingEffect } from "@/data/factions/types";
import { TRADE_RATES } from "@/data/map/locations";
import { getMainHero } from "../adventure";
import { createAdventureGameState } from "../adventure-setup";
import type {
  GameState,
  MapFieldState,
  PlayerVisibleState,
} from "../state";
import { driveComputerPlayers } from "@/server/computer-runner";
import {
  armyDevelopmentProfile,
  assessDwellingRush,
  developmentResourceTargets,
} from "./development";
import { scoreMapAction } from "./map-policy";
import type { ComputerObservation } from "./types";

/**
 * DWELLING-RUSH TRADE PLANNER (Step 5). When the next recruit-tier dwelling is
 * blocked ONLY by a materials/valuables gap the Trading Post can cover from a
 * genuine gold surplus, the AI converts and BUILDS it the same turn — but never
 * so aggressively that it strips the fund reserved for planned recruits.
 *
 * Every claim is mutation-checked: removing the feasibility gate flips the
 * suppression test; removing the OPEN_MARKET boost flips the decisiveness test;
 * the e2e drive fails if the trade→build sequence does not complete in one turn.
 */

function buildingWith(
  state: GameState,
  predicate: (effect: TownBuildingEffect) => boolean,
): string {
  const factionId = state.players.p2.factionId!;
  const id = coreFactionDefinitions[factionId].buildings.find((buildingId) => {
    const effect = coreBuildingDefinitions[buildingId]?.effect;
    return effect ? predicate(effect) : false;
  });
  if (!id) throw new Error("fixture faction is missing a required building");
  return id;
}

function dwellingId(state: GameState, tier: "bronze" | "silver" | "gold"): string {
  return buildingWith(
    state,
    (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === tier,
  );
}

/** TRADE_RATES index that buys 1 valuables for gold ("6 gold -> 1 valuables"). */
const VALS_RATE_INDEX = TRADE_RATES.findIndex(
  (rate) =>
    Object.keys(rate.sell).length === 1 &&
    (rate.sell.gold ?? 0) > 0 &&
    Object.keys(rate.buy).length === 1 &&
    rate.buy.valuables === 1,
);

/**
 * A real single-player adventure with p2 (the computer) parked on a Trading Post,
 * three Packs established and the town built up to `prereqBuildings` — so the
 * development phase is the intended unlock-silver / unlock-gold. Resources are set
 * verbatim so the reserve arithmetic is exact.
 */
function marketRushState(options: {
  seed: string;
  prereqTiers: ("bronze" | "silver" | "gold")[];
  gold: number;
  buildingMaterials: number;
  valuables: number;
}): { state: GameState; heroId: string; town: GameState["towns"][string] } {
  const state = createAdventureGameState({
    seed: options.seed,
    difficulty: "impossible",
    rollFirstPlayer: false,
    events: false,
    sessionMode: "single-player",
    playerCount: 2,
  });
  state.phase = "player-turn";
  state.round = 5;
  state.activePlayerId = "p2";
  state.priorityPlayerId = "p2";
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Three Packs → past establish-core.
  for (const unit of state.players.p2.army) unit.side = "pack";

  const town = Object.values(state.towns).find(
    (candidate) => candidate.controllerId === "p2",
  )!;
  const citadel = buildingWith(
    state,
    (effect) => effect.type === "UNLOCK_REINFORCE",
  );
  town.buildings = [citadel, ...options.prereqTiers.map((tier) => dwellingId(state, tier))];
  state.players.p2.townTokens = { build: true, population: false, spellBook: false };

  const hero = getMainHero(state, "p2")!;
  const field: MapFieldState = {
    spaceId: `${options.seed}-market`,
    tileInstanceId: "rush-market-tile",
    slot: 0,
    location: "trading_post",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
  } as MapFieldState;
  state.adventure!.fields[field.spaceId] = field;
  hero.spaceId = field.spaceId;
  hero.movementPoints = 0;
  // Clear the war-machine shelf so a legitimate (orthogonal) machine buy does
  // not confound the trade→build sequence under test.
  state.adventure!.warMachineSupply = [];

  state.players.p2.resources = {
    gold: options.gold,
    buildingMaterials: options.buildingMaterials,
    valuables: options.valuables,
  };
  return { state, heroId: hero.id, town };
}

function observe(state: GameState): ComputerObservation {
  return {
    playerId: "p2",
    state: state as unknown as PlayerVisibleState,
    legalActions: [],
  };
}

describe("assessDwellingRush — feasibility & reserve preservation", () => {
  it("is feasible only when gold surplus covers the inputs AND keeps the whole reserve", () => {
    // unlock-silver: dwelling {8,6,3}; reserve gold = developmentResourceTargets.
    const { state } = marketRushState({
      seed: "rush-assess",
      prereqTiers: ["bronze"],
      gold: 34,
      buildingMaterials: 6,
      valuables: 0,
    });
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-silver");
    const reserveGold = developmentResourceTargets(state, "p2").gold;
    // Needs 3 valuables → 18 gold at 6-gold-per; feasible needs 18 + reserve.
    expect(reserveGold).toBe(14);

    const feasible = assessDwellingRush(state, "p2");
    expect(feasible?.feasible).toBe(true);
    expect(feasible?.inputRateIndices).toContain(VALS_RATE_INDEX);

    // Drop gold below reserve+inputs → infeasible (would strip the fund).
    state.players.p2.resources.gold = 26; // 26 - 18 = 8 < 14
    const infeasible = assessDwellingRush(state, "p2");
    expect(infeasible?.feasible).toBe(false);
    expect(infeasible?.inputRateIndices).toContain(VALS_RATE_INDEX);

    // Already affordable → no rush needed (null; the build fires directly).
    state.players.p2.resources = { gold: 20, buildingMaterials: 6, valuables: 3 };
    expect(assessDwellingRush(state, "p2")).toBeNull();
  });
});

describe("dwelling-rush scoring — OPEN_MARKET decisiveness", () => {
  it("opens the market decisively for a feasible rush; CONTROL: a thin surplus does not", () => {
    const { state } = marketRushState({
      seed: "rush-open",
      prereqTiers: ["bronze"],
      gold: 34,
      buildingMaterials: 6,
      valuables: 0,
    });
    if (state.adventure) state.adventure.pendingVisit = null;
    const feasible = scoreMapAction(observe(state), {
      type: "OPEN_MARKET",
      playerId: "p2",
      heroId: "h",
    });
    expect(feasible?.policy).toBe("map.open-market-dwelling-rush");
    // Above the unlock-phase recruit ceiling (940) so it is never out-competed
    // by spending the gold on stray troops instead of the dwelling.
    expect(feasible!.score).toBeGreaterThan(940);

    // CONTROL: thin surplus (infeasible rush) falls back to the ordinary path —
    // the decisive dwelling-rush policy is NOT used.
    state.players.p2.resources.gold = 26;
    const thin = scoreMapAction(observe(state), {
      type: "OPEN_MARKET",
      playerId: "p2",
      heroId: "h",
    });
    expect(thin?.policy).not.toBe("map.open-market-dwelling-rush");
    expect(thin!.score).toBeLessThan(940);
  });
});

describe("dwelling-rush scoring — potential preservation (deliverable test 2)", () => {
  it("SUPPRESSES a dwelling-input trade that would strip the reserve; enables it with surplus", () => {
    const { state } = marketRushState({
      seed: "rush-preserve",
      prereqTiers: ["bronze"],
      gold: 34, // feasible: 34 - 18 = 16 >= reserve 14
      buildingMaterials: 6,
      valuables: 0,
    });
    const buyValuables = {
      type: "TRADE_RESOURCES" as const,
      playerId: "p2",
      rateIndex: VALS_RATE_INDEX,
    };

    // Genuine surplus above the reserve → decisive enabling trade.
    const enabled = scoreMapAction(observe(state), buyValuables);
    expect(enabled!.score).toBeGreaterThan(700);

    // CONTROL: below the reserve → the SAME trade is suppressed under "Done"
    // (520) so the AI leaves the market without stripping the recruit fund,
    // instead of the generic heuristic happily converting gold to zero.
    state.players.p2.resources.gold = 26; // 26 - 18 = 8 < reserve 14
    const suppressed = scoreMapAction(observe(state), buyValuables);
    expect(suppressed!.score).toBeLessThan(520);
    expect(suppressed!.score).toBeLessThanOrEqual(280);
  });
});

describe("dwelling-rush e2e — trade then build the same turn", () => {
  it("trades gold for the missing valuables, then BUILDS the Silver dwelling (deliverable test 1)", () => {
    const { state, town } = marketRushState({
      seed: "rush-silver-e2e",
      prereqTiers: ["bronze"],
      gold: 34,
      buildingMaterials: 6,
      valuables: 0,
    });
    const silver = dwellingId(state, "silver");
    expect(town.buildings).not.toContain(silver);

    const run = driveComputerPlayers(state, undefined, { maxSteps: 20 });
    expect(run.stalled, run.reason).toBe(false);
    const types = run.decisions.map((decision) => decision.action.type);
    const firstTrade = types.indexOf("TRADE_RESOURCES");
    const buildSilver = run.decisions.findIndex(
      (decision) =>
        decision.action.type === "BUILD_STRUCTURE" &&
        (decision.action as { buildingId?: string }).buildingId === silver,
    );
    expect(firstTrade, "a resource trade fired").toBeGreaterThanOrEqual(0);
    expect(buildSilver, "the Silver dwelling was built").toBeGreaterThanOrEqual(0);
    expect(firstTrade).toBeLessThan(buildSilver); // trade THEN build, same turn
    expect(run.state.towns[town.id].buildings).toContain(silver);
  });

  it("CONTROL: a thin surplus preserves potential — no trade, no Silver build", () => {
    const { state, town } = marketRushState({
      seed: "rush-silver-thin",
      prereqTiers: ["bronze"],
      gold: 26, // below reserve+inputs → rush declined
      buildingMaterials: 6,
      valuables: 0,
    });
    const silver = dwellingId(state, "silver");
    const goldBefore = state.players.p2.resources.gold;

    const run = driveComputerPlayers(state, undefined, { maxSteps: 20 });
    expect(run.stalled, run.reason).toBe(false);
    const builtSilver = run.decisions.some(
      (decision) =>
        decision.action.type === "BUILD_STRUCTURE" &&
        (decision.action as { buildingId?: string }).buildingId === silver,
    );
    expect(builtSilver).toBe(false);
    expect(run.state.towns[town.id].buildings).not.toContain(silver);
    // The suppressed dwelling-input trade never fires: no valuables are bought,
    // so the recruit gold reserve is preserved rather than converted to zero.
    const boughtValuables = run.decisions.some(
      (decision) =>
        decision.action.type === "TRADE_RESOURCES" &&
        (decision.action as { rateIndex?: number }).rateIndex === VALS_RATE_INDEX,
    );
    expect(boughtValuables).toBe(false);
    expect(run.state.players.p2.resources.valuables).toBe(0);
    expect(run.state.players.p2.resources.gold).toBeGreaterThanOrEqual(goldBefore);
  });

  it("gold-dwelling variant: trades then BUILDS the Gold dwelling the same turn (deliverable test 3)", () => {
    const { state, town } = marketRushState({
      seed: "rush-gold-e2e",
      prereqTiers: ["bronze", "silver"],
      gold: 80,
      buildingMaterials: 5, // Gold dwelling needs 9 → short by 4
      valuables: 0, // Gold dwelling needs 4 → short by 4
    });
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-gold");
    const gold = dwellingId(state, "gold");
    expect(town.buildings).not.toContain(gold);

    const run = driveComputerPlayers(state, undefined, { maxSteps: 24 });
    expect(run.stalled, run.reason).toBe(false);
    const firstTrade = run.decisions.findIndex(
      (decision) => decision.action.type === "TRADE_RESOURCES",
    );
    const buildGold = run.decisions.findIndex(
      (decision) =>
        decision.action.type === "BUILD_STRUCTURE" &&
        (decision.action as { buildingId?: string }).buildingId === gold,
    );
    expect(firstTrade).toBeGreaterThanOrEqual(0);
    expect(buildGold).toBeGreaterThanOrEqual(0);
    expect(firstTrade).toBeLessThan(buildGold);
    expect(run.state.towns[town.id].buildings).toContain(gold);
  });
});
