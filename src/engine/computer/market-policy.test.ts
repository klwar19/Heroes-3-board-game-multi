import { describe, expect, it } from "vitest";
import { coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { TRADE_RATES } from "@/data/map/locations";
import { getMainHero } from "../adventure";
import { createAdventureGameState } from "../adventure-setup";
import { applyAction, getLegalActions } from "../index";
import { getPlayerView } from "../player-view";
import type { GameAction, GameState, LegalAction, MapFieldState, MapTileState, PlayerVisibleState } from "../state";
import {
  hasUsefulMarketTrade,
  resourceDeficits,
  scoreMapAction,
  tradeUtility,
} from "./map-policy";
import { canBeatGuardedField, premiumRecruitMarketVisit } from "./map-navigation";
import { nextPlannedSilver, premiumRecruitTradePlan } from "./development";
import { emptyComputerMemory, getComputerMemory } from "./memory";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";
import { observeForComputer } from "./observation";
import { driveComputerPlayers } from "@/server/computer-runner";

/**
 * Market / resource-trade policy for the computer opponent. OPEN_MARKET and
 * TRADE_RESOURCES used to fall through to foundation score 0 (below END_TURN),
 * so the AI never traded; a naive high score would loop forever. These tests
 * pin useful trades above Done, wasteful trades below Done, and idle open-market
 * below END_TURN.
 */

function stateWithResources(
  gold: number,
  buildingMaterials: number,
  valuables: number,
  extras: Partial<GameState> = {},
): GameState {
  return {
    seed: "market-policy",
    round: 5,
    eventCounter: 0,
    combat: null,
    heroes: {},
    players: {
      p2: {
        id: "p2",
        hand: [],
        resources: { gold, buildingMaterials, valuables },
        army: [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }],
        permanents: [],
      },
    },
    adventure: {
      fields: {},
      pendingVisit: {
        playerId: "p2",
        heroId: "h2",
        fieldId: "h:0:0",
        steps: [{ type: "TRADING_POST" }],
      },
    },
    ...extras,
  } as unknown as GameState;
}

function observe(
  state: GameState,
  legalActions: LegalAction[] = [],
): ComputerObservation {
  return {
    playerId: "p2",
    state: state as unknown as PlayerVisibleState,
    legalActions,
  };
}

const endTurn: LegalAction = {
  action: { type: "END_TURN", playerId: "p2" } as GameAction,
  label: "end",
};

describe("resource deficits and trade utility", () => {
  it("wants gold when broke with convertible stock", () => {
    // TRUE materials surplus (well above the dwelling target + the pre-Gold
    // cushion) may fund gold; the dwelling inputs themselves stay protected.
    const state = stateWithResources(2, 8, 1);
    const deficit = resourceDeficits(state, "p2");
    expect(deficit.gold).toBeGreaterThan(0);
    expect(hasUsefulMarketTrade(state, "p2")).toBe(true);
    // rateIndex 4 = 1 materials → 1 gold; rateIndex 2 = 1 valuables → 3 gold.
    expect(tradeUtility(state, "p2", 4)).toBeGreaterThan(0);
    expect(tradeUtility(state, "p2", 2)).toBeLessThan(0);

    // DWELLING-INPUT FLOOR CONTROL: with materials at/near the next dwelling's
    // own need, the 1:1 sale is refused until the Gold dwelling stands — the
    // market spread makes sell-then-rebuy a net tempo loss (measured: seven
    // materials dumped at 1:1 the round before the Silver dwelling).
    const tight = stateWithResources(2, 5, 1);
    expect(tradeUtility(tight, "p2", 4)).toBeLessThan(0);

    state.towns = {
      t2: {
        id: "t2",
        controllerId: "p2",
        buildings: ["castle.dwelling_gold"],
      },
    } as GameState["towns"];
    expect(tradeUtility(state, "p2", 2)).toBeGreaterThan(0);
  });

  it("sells TRUE surplus valuables for gold even before the Gold dwelling", () => {
    // A valuables mine can stack extras above the dwelling reserve — convert
    // them into gold instead of sitting on a fat coffer while broke.
    const state = stateWithResources(2, 2, 4);
    // rateIndex 2 = 1 valuables → 3 gold. Target usually keeps 1 valuable for
    // the next dwelling; surplus ≥ 2 may be sold.
    expect(tradeUtility(state, "p2", 2)).toBeGreaterThan(0);
    // CONTROL: only one valuable (at/below target) still refuses the sale.
    const tight = stateWithResources(2, 2, 1);
    expect(tradeUtility(tight, "p2", 2)).toBeLessThan(0);
  });

  it("never scores both directions of the v↔m conversion pair positive (churn guard)", () => {
    // Measured pre-fix: "1 valuables → 2 materials" (rate 3) and "3 materials
    // → 1 valuables" (rate 5) alternated around the target boundary, burning a
    // material per cycle in the round before the Silver dwelling was built. An
    // AI that can score both directions positive at ONE state will churn.
    const stocks: Array<[number, number, number]> = [
      [2, 1, 4],
      [2, 10, 1],
      [2, 6, 3],
      [14, 4, 2],
      [8, 8, 4],
    ];
    for (const [gold, mats, vals] of stocks) {
      const state = stateWithResources(gold, mats, vals);
      const vToM = tradeUtility(state, "p2", 3);
      const mToV = tradeUtility(state, "p2", 5);
      expect(
        Math.min(vToM, mToV),
        `both conversion directions positive at g${gold} m${mats} v${vals}`,
      ).toBeLessThanOrEqual(0);
    }
  });

  it("CONTROL: balanced coffers do not invent useful trades", () => {
    // Enough gold, a few mats, one valuable — no strong deficit.
    const state = stateWithResources(20, 4, 1);
    // May still have tiny residual utility; the open-market gate uses
    // hasUsefulMarketTrade which requires utility > 0. A flush seat that
    // already has mats/vals should not need to open for rebalance alone.
    const deficit = resourceDeficits(state, "p2");
    expect(deficit.gold).toBeLessThanOrEqual(0);
  });
});

describe("scoreMapAction — market open / trade / done", () => {
  it("USER RULING 2026-09-17: a bare deficit no longer opens the market from round 5 (CONTROL: the Silver-recruit plan does, see below)", () => {
    const state = stateWithResources(2, 8, 0);
    // Not inside a visit — OPEN_MARKET is a map action while parked on market.
    if (state.adventure) {
      state.adventure.pendingVisit = null;
    }
    expect(hasUsefulMarketTrade(state, "p2")).toBe(true);
    const open = scoreMapAction(observe(state), {
      type: "OPEN_MARKET",
      playerId: "p2",
      heroId: "h2",
    });
    expect(open?.score).toBeLessThan(300);
    expect(open?.policy).toBe("map.market-skip-balanced");
  });

  it("CONTROL: does not open the market when resources are balanced", () => {
    const state = stateWithResources(20, 4, 1);
    if (state.adventure) {
      state.adventure.pendingVisit = null;
    }
    // Also give a couple permanents so war-machine hunger does not open it.
    (state.players.p2 as { permanents: string[] }).permanents = [
      "war_machine.ballista",
      "war_machine.first_aid_tent",
    ];
    const open = scoreMapAction(observe(state), {
      type: "OPEN_MARKET",
      playerId: "p2",
      heroId: "h2",
    });
    expect(open?.score).toBeLessThan(300);
    expect(open?.policy).toBe("map.market-skip-balanced");
  });

  it("ranks every unplanned exchange below Done (USER RULING 2026-09-17), wasteful ones included", () => {
    // Broke with a TRUE materials surplus: the old heuristic sold one for gold;
    // without a Silver body to buy NEXT that exchange is "terrible".
    const state = stateWithResources(1, 7, 0);
    expect(tradeUtility(state, "p2", 4)).toBeGreaterThan(0);
    const useful = scoreMapAction(observe(state), {
      type: "TRADE_RESOURCES",
      playerId: "p2",
      rateIndex: 4, // 1 materials → 1 gold
    });
    const done = scoreMapAction(observe(state), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      decline: true,
    });
    expect(useful?.score).toBeLessThan(done?.score ?? 0);
    expect(done?.score).toBeGreaterThan(300);

    // Flush gold, zero need for more valuables: 6 gold → 1 valuables is waste.
    const flush = stateWithResources(30, 4, 2);
    const waste = scoreMapAction(observe(flush), {
      type: "TRADE_RESOURCES",
      playerId: "p2",
      rateIndex: 0, // 6 gold → 1 valuables
    });
    const doneFlush = scoreMapAction(observe(flush), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      decline: true,
    });
    expect(waste?.score).toBeLessThan(doneFlush?.score ?? 0);
  });

  it("chooseComputerAction exits the market when only wasteful trades remain", () => {
    const state = stateWithResources(30, 4, 2);
    const waste: LegalAction = {
      action: {
        type: "TRADE_RESOURCES",
        playerId: "p2",
        rateIndex: 0,
      } as GameAction,
      label: "6 gold for 1 valuables",
    };
    const done: LegalAction = {
      action: {
        type: "RESOLVE_VISIT_STEP",
        playerId: "p2",
        decline: true,
      } as GameAction,
      label: "Done trading",
    };
    const decision = chooseComputerAction(observe(state, [waste, done, endTurn]));
    expect(decision?.action.type).toBe("RESOLVE_VISIT_STEP");
    expect((decision?.action as { decline?: boolean }).decline).toBe(true);
  });

  it("chooseComputerAction leaves an unplanned gold trade on the table and exits (USER RULING 2026-09-17)", () => {
    const state = stateWithResources(1, 7, 0);
    const trade: LegalAction = {
      action: {
        type: "TRADE_RESOURCES",
        playerId: "p2",
        rateIndex: 4,
      } as GameAction,
      label: "1 building materials for 1 gold",
    };
    const done: LegalAction = {
      action: {
        type: "RESOLVE_VISIT_STEP",
        playerId: "p2",
        decline: true,
      } as GameAction,
      label: "Done trading",
    };
    const decision = chooseComputerAction(observe(state, [trade, done]));
    expect(decision?.action.type).toBe("RESOLVE_VISIT_STEP");
    expect((decision?.action as { decline?: boolean }).decline).toBe(true);
  });

  it("USER RULING 2026-09-17: the AI dumps at most ONE junk card per visit now that a sale keeps the market open", () => {
    const state = stateWithResources(1, 0, 0, {
      players: {
        p2: {
          id: "p2",
          hand: ["spell.bless"],
          resources: { gold: 1, buildingMaterials: 0, valuables: 0 },
          army: [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }],
          permanents: [],
        },
      },
    } as unknown as Partial<GameState>);
    const sell: GameAction = { type: "RESOLVE_VISIT_STEP", playerId: "p2", optionIndex: 0 } as GameAction;
    const done = scoreMapAction(observe(state), { type: "RESOLVE_VISIT_STEP", playerId: "p2", decline: true });
    // Broke: the first junk sale outranks Done …
    expect(scoreMapAction(observe(state), sell)?.score).toBeGreaterThan(done?.score ?? 0);
    // … but once a card was sold on this visit the next one ranks below Done.
    (state.adventure!.pendingVisit!.steps[0] as { sold?: number }).sold = 1;
    expect(scoreMapAction(observe(state), sell)?.score).toBeLessThan(done?.score ?? 0);
  });

  it("refuses every marketplace action before round 5", () => {
    const state = stateWithResources(1, 6, 2);
    state.round = 4;
    state.towns = {
      t2: {
        id: "t2",
        controllerId: "p2",
        buildings: ["castle.dwelling_gold"],
      },
    } as GameState["towns"];
    if (state.adventure) state.adventure.pendingVisit = null;
    const open = scoreMapAction(observe(state), {
      type: "OPEN_MARKET",
      playerId: "p2",
      heroId: "h2",
    });
    expect(open?.policy).toBe("map.market-wait-until-round-five");
    expect(open!.score).toBeLessThan(300);

    if (state.adventure) {
      state.adventure.pendingVisit = {
        playerId: "p2",
        heroId: "h2",
        fieldId: "h:0:0",
        steps: [{ type: "TRADING_POST" }],
      };
    }
    const trade = scoreMapAction(observe(state), {
      type: "TRADE_RESOURCES",
      playerId: "p2",
      rateIndex: 4,
    });
    const done = scoreMapAction(observe(state), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      decline: true,
    });
    expect(trade!.score).toBeLessThan(done!.score);
  });

  it("allows only a well-funded First Aid Tent as the early shop exception", () => {
    const state = stateWithResources(50, 6, 2);
    state.round = 3;
    state.players.p2.army = ["a1", "a2", "a3"].map((id) => ({
      id,
      unitDefId: "castle.pikemen",
      side: "pack" as const,
    }));
    state.heroes.h2 = {
      id: "h2",
      controllerId: "p2",
      kind: "main",
      spaceId: "h:0:0",
    } as GameState["heroes"][string];
    state.adventure!.fields["h:0:0"] = {
      spaceId: "h:0:0",
      tileInstanceId: "early-tent-tile",
      slot: 0,
      location: "war_machine_factory",
    } as MapFieldState;
    state.adventure!.pendingVisit = null;

    const open = scoreMapAction(observe(state), {
      type: "OPEN_MARKET",
      playerId: "p2",
      heroId: "h2",
    });
    const tent = scoreMapAction(observe(state), {
      type: "BUY_WAR_MACHINE",
      playerId: "p2",
      cardId: "war_machine.first_aid_tent",
    });
    const ballista = scoreMapAction(observe(state), {
      type: "BUY_WAR_MACHINE",
      playerId: "p2",
      cardId: "war_machine.ballista",
    });
    expect(open?.policy).toBe("map.open-war-machine-first-aid");
    expect(open!.score).toBeGreaterThan(520);
    expect(tent!.score).toBeGreaterThan(520);
    expect(ballista!.score).toBeLessThan(520);

    state.players.p2.resources.gold = 20;
    expect(
      scoreMapAction(observe(state), {
        type: "BUY_WAR_MACHINE",
        playerId: "p2",
        cardId: "war_machine.first_aid_tent",
      })!.score,
    ).toBeLessThan(520);
  });
});

/**
 * USER RULING (2026-09-17) fixture: a Castle seat on a Resource Round (odd,
 * income just landed) standing on a Trading Post, its Silver dwelling built,
 * its first Far settlement secured (so the planned Silver body is the
 * breakthrough purchase), the Population token unspent, ONE gold short of that
 * body with two spare materials — and a beatable level-1 guard one step away
 * for the body to fight this same turn (the lv3 mine on the second Far tile
 * is deliberately NOT such a fight: the far-sweep rule wants a Silver there).
 */
function silverRecruitFixture(round = 5) {
  const state = createAdventureGameState({
    seed: "market-silver-recruit",
    difficulty: "normal",
    events: false,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Control", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Computer", factionId: "castle", heroDefId: "catherine" },
    ],
  });
  const hero = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main")!;
  state.round = round;
  state.activePlayerId = "p2";
  state.priorityPlayerId = "p2";
  state.controllers = { p1: { kind: "human" }, p2: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
  state.players.p2.army = coreFactionDefinitions.castle.units
    .filter((id) => coreUnitDefinitions[id]?.tier === "bronze")
    .slice(0, 3)
    .map((unitDefId, i) => ({ id: `core-${i}`, unitDefId, side: "pack" as const }));
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  state.adventure!.houseRules = {
    ...state.adventure!.houseRules,
    "free-neutral-combat-extend": false,
    "polish-quick-combat": false,
  };
  hero.spaceId = "h:10:7"; hero.level = 2; hero.movementPoints = 3; hero.movementPointsMax = 3;
  const template = Object.values(state.adventure!.fields)[0];
  state.adventure!.fields = {};
  state.adventure!.tiles = {};
  state.adventure!.playerFarTiles.p2 = [];
  state.adventure!.farTilePool = [];
  for (const [id, col, group] of [["home", 9, "starting"], ["far1", 6, "far"], ["far2", 5, "far"]] as const) {
    state.adventure!.tiles[id] = {
      id, tileDefId: "test-corridor", centerRow: 10, centerCol: col, group, faceDown: false, rotation: 0,
    } as MapTileState;
  }
  for (let col = 4; col <= 10; col += 1) {
    const spaceId = `h:10:${col}`;
    state.adventure!.fields[spaceId] = {
      ...template, spaceId, tileInstanceId: col <= 5 ? "far2" : col <= 7 ? "far1" : "home",
      location: "empty_field", flagOwnerId: null, everFlagged: false, blackCube: false, difficulty: undefined,
    };
  }
  const townField = state.adventure!.fields["h:10:9"];
  townField.location = "town"; townField.flagOwnerId = "p2";
  const ownTown = Object.values(state.towns).find((t) => t.controllerId === "p2")!;
  ownTown.fieldId = townField.spaceId;
  if (!ownTown.buildings.includes("castle.dwelling_silver")) ownTown.buildings.push("castle.dwelling_silver");
  const rivalTown = Object.values(state.towns).find((t) => t.controllerId === "p1")!;
  state.adventure!.fields[rivalTown.fieldId!] = {
    ...template, spaceId: rivalTown.fieldId!, location: "town", flagOwnerId: "p1", difficulty: undefined,
  };
  for (const other of Object.values(state.heroes)) {
    if (other.id !== hero.id) other.spaceId = other.controllerId === "p1" ? rivalTown.fieldId! : null;
  }
  const first = state.adventure!.fields["h:10:6"];
  first.location = "settlement"; first.flagOwnerId = "p2"; first.everFlagged = true;
  const second = state.adventure!.fields["h:10:5"];
  second.location = "mine"; second.resource = "buildingMaterials"; second.difficulty = 3;
  const guard = state.adventure!.fields["h:10:8"];
  guard.location = "resource_symbol"; guard.difficulty = 1;
  const post = state.adventure!.fields["h:10:7"];
  post.location = "trading_post";
  state.computerMemory = { p2: emptyComputerMemory(round) };
  state.players.p2.townTokens = { build: true, population: true, spellBook: true };
  const silver = nextPlannedSilver(state, "p2")!;
  const cost = coreUnitDefinitions[silver].few!.cost;
  state.players.p2.resources = {
    gold: (cost.gold ?? 0) - 1,
    buildingMaterials: (cost.buildingMaterials ?? 0) + 2,
    valuables: cost.valuables ?? 0,
  };
  const sale = TRADE_RATES.findIndex((rate) => rate.sell.buildingMaterials === 1 && (rate.buy.gold ?? 0) > 0);
  const observe = (): ComputerObservation => ({
    playerId: "p2",
    state: getPlayerView(state, "p2"),
    memory: getComputerMemory(state, "p2"),
    legalActions: getLegalActions(state, "p2"),
  });
  return { state, hero, silver, cost, second, guard, sale, observe };
}

describe("market e2e — real engine + computer runner", () => {
  it("USER RULING 2026-09-17: opens the Trading Post to make the planned Silver body payable, sells exactly the spare materials, recruits it and leaves (no loop)", () => {
    const f = silverRecruitFixture(5);
    expect(f.state.players.p2.townTokens.population).toBe(true);
    expect(canBeatGuardedField(f.state, f.hero, f.guard)).toBe(true);
    expect(premiumRecruitTradePlan(f.state, "p2")).toEqual({ unitDefId: f.silver, rateIndices: [f.sale] });
    expect(premiumRecruitMarketVisit(f.state, "p2", "trading_post", f.hero.spaceId!)).toBe(true);
    const open = scoreMapAction(f.observe(), { type: "OPEN_MARKET", playerId: "p2", heroId: f.hero.id });
    expect(open?.policy).toBe("map.open-market-premium-recruit");
    expect(open?.score).toBeGreaterThan(900);
    // Legal OPEN_MARKET must exist for the computer.
    expect(getLegalActions(f.state, "p2").some((legal) => legal.action.type === "OPEN_MARKET")).toBe(true);

    const run = driveComputerPlayers(f.state, undefined, { maxSteps: 8 });
    const types = run.decisions.map((d) => d.action.type);
    const openAt = types.indexOf("OPEN_MARKET");
    const tradeAt = types.indexOf("TRADE_RESOURCES");
    const recruitAt = types.findIndex((type, index) => type === "POPULATION_ACTION" &&
      (run.decisions[index].action as { purchases?: { unitDefId: string }[] }).purchases?.[0]?.unitDefId === f.silver);
    expect(openAt, types.join(",")).toBeGreaterThanOrEqual(0);
    expect(tradeAt, types.join(",")).toBeGreaterThan(openAt);
    expect(recruitAt, types.join(",")).toBeGreaterThan(tradeAt);
    // Exactly the one-gold gap was closed: one material sold, never a loop.
    expect(run.decisions.filter((d) => d.action.type === "TRADE_RESOURCES")).toHaveLength(1);
    expect(types.filter((t) => t === "OPEN_MARKET")).toHaveLength(1);
    expect(run.state.players.p2.army.some((unit) => unit.unitDefId === f.silver && unit.side !== "bank")).toBe(true);
    expect(run.state.players.p2.resources.buildingMaterials).toBe(1);
  });

  it("CONTROL: the same seat on an Astrologers round (income lands next round) does not trade, nor without a fight in reach, a Population token, or a gap to close", () => {
    // Even round: wait for the Resource Round instead of selling stock.
    const even = silverRecruitFixture(6);
    expect(premiumRecruitTradePlan(even.state, "p2")).not.toBeNull();
    expect(premiumRecruitMarketVisit(even.state, "p2", "trading_post", even.hero.spaceId!)).toBe(false);
    const open = scoreMapAction(even.observe(), { type: "OPEN_MARKET", playerId: "p2", heroId: even.hero.id });
    expect(open?.policy).not.toBe("map.open-market-premium-recruit");
    expect(open?.score).toBeLessThan(300);
    // Inside a forced-open visit the sale ranks below Done on the even round …
    even.state.adventure!.pendingVisit = { heroId: even.hero.id, playerId: "p2", fieldId: "h:10:7", steps: [{ type: "TRADING_POST" }] };
    const evenSale = scoreMapAction(even.observe(), { type: "TRADE_RESOURCES", playerId: "p2", rateIndex: even.sale });
    const evenDone = scoreMapAction(even.observe(), { type: "RESOLVE_VISIT_STEP", playerId: "p2", decline: true });
    expect(evenSale?.score).toBeLessThan(evenDone?.score ?? 0);
    // … and above it on the odd round, while an off-plan rate stays below.
    const odd = silverRecruitFixture(5);
    odd.state.adventure!.pendingVisit = { heroId: odd.hero.id, playerId: "p2", fieldId: "h:10:7", steps: [{ type: "TRADING_POST" }] };
    const oddSale = scoreMapAction(odd.observe(), { type: "TRADE_RESOURCES", playerId: "p2", rateIndex: odd.sale });
    const oddDone = scoreMapAction(odd.observe(), { type: "RESOLVE_VISIT_STEP", playerId: "p2", decline: true });
    const offPlan = scoreMapAction(odd.observe(), { type: "TRADE_RESOURCES", playerId: "p2", rateIndex: 0 });
    expect(oddSale?.score).toBeGreaterThan(oddDone?.score ?? 0);
    expect(offPlan?.score).toBeLessThan(oddDone?.score ?? 0);

    // No fight the body can join this turn: no movement left.
    const parked = silverRecruitFixture(5);
    parked.hero.movementPoints = 0;
    expect(premiumRecruitMarketVisit(parked.state, "p2", "trading_post", parked.hero.spaceId!)).toBe(false);
    // Population token already spent: the body could not follow the trade.
    const spent = silverRecruitFixture(5);
    spent.state.players.p2.townTokens.population = false;
    expect(premiumRecruitTradePlan(spent.state, "p2")).toBeNull();
    // Already affordable: no trade needed, the recruit fires directly.
    const flush = silverRecruitFixture(5);
    flush.state.players.p2.resources.gold = flush.cost.gold ?? 0;
    expect(premiumRecruitTradePlan(flush.state, "p2")).toBeNull();
    expect(premiumRecruitMarketVisit(flush.state, "p2", "trading_post", flush.hero.spaceId!)).toBe(false);
  });

  it("CONTROL: balanced resources on a market never opens a trade loop", () => {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "market-e2e-balanced",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      sessionMode: "single-player",
      playerCount: 2,
    });
    state.activePlayerId = "p2";
    state.round = 5;
    for (const pl of Object.values(state.players)) {
      pl.canMulligan = false;
      pl.needsHandRefresh = false;
    }
    const hero = getMainHero(state, "p2")!;
    const field: MapFieldState = {
      spaceId: "market-bal-hex",
      tileInstanceId: "market-tile",
      slot: 0,
      location: "trading_post",
      difficulty: undefined,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
    };
    state.adventure!.fields[field.spaceId] = field;
    hero.spaceId = field.spaceId;
    hero.movementPoints = 2;
    state.players.p2.resources = {
      gold: 20,
      buildingMaterials: 6,
      valuables: 2,
    };
    state.players.p2.permanents = [
      "war_machine.ballista",
      "war_machine.first_aid_tent",
    ];

    // Policy must not prefer OPEN_MARKET over END_TURN when balanced.
    const obs = observeForComputer(state, "p2");
    const decision = chooseComputerAction(obs);
    expect(decision?.action.type).not.toBe("OPEN_MARKET");

    // Force-open: only Done / trades are legal. Done must win — no gold spent
    // on wasteful rates or extra war machines when already stocked.
    const opened = applyAction(
      state,
      { type: "OPEN_MARKET", playerId: "p2", heroId: hero.id },
      { computerActorPlayerId: "p2" },
    );
    expect(opened.errors).toEqual([]);
    // Empty the war-machine shelf so BUY is not on the menu (this CONTROL is
    // about trade rates, not shop buys).
    if (opened.state.adventure) {
      opened.state.adventure.warMachineSupply = [];
    }
    const goldBefore = opened.state.players.p2.resources.gold;
    // Drive ONLY until the visit closes — the map turn continues after Done
    // and would keep going if we full-settle. maxSteps:1 reports stalled:true
    // whenever more work remains (cap hit), so we only assert a real decision.
    let current = opened.state;
    const decisions: { action: { type: string } }[] = [];
    for (let i = 0; i < 6; i += 1) {
      if (!current.adventure?.pendingVisit) break;
      const step = driveComputerPlayers(current, undefined, { maxSteps: 1 });
      expect(step.decisions.length, step.reason).toBe(1);
      decisions.push(step.decisions[0]);
      current = step.state;
    }
    expect(current.adventure?.pendingVisit).toBeFalsy();
    expect(current.players.p2.resources.gold).toBe(goldBefore);
    expect(decisions.some((d) => d.action.type === "TRADE_RESOURCES")).toBe(
      false,
    );
    expect(decisions.some((d) => d.action.type === "RESOLVE_VISIT_STEP")).toBe(
      true,
    );
  });
});
