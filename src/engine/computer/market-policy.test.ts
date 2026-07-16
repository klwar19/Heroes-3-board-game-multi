import { describe, expect, it } from "vitest";
import { getMainHero } from "../adventure";
import { createAdventureGameState } from "../adventure-setup";
import { applyAction, getLegalActions } from "../index";
import type { GameAction, GameState, LegalAction, MapFieldState, PlayerVisibleState } from "../state";
import {
  hasUsefulMarketTrade,
  resourceDeficits,
  scoreMapAction,
  tradeUtility,
} from "./map-policy";
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
    const state = stateWithResources(2, 5, 1);
    const deficit = resourceDeficits(state, "p2");
    expect(deficit.gold).toBeGreaterThan(0);
    // Materials may fund gold; the last dwelling-needed valuable stays protected
    // until Gold is built (or a true surplus arrives from mines).
    expect(hasUsefulMarketTrade(state, "p2")).toBe(true);
    // rateIndex 4 = 1 materials → 1 gold; rateIndex 2 = 1 valuables → 3 gold.
    expect(tradeUtility(state, "p2", 4)).toBeGreaterThan(0);
    expect(tradeUtility(state, "p2", 2)).toBeLessThan(0);

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
  it("opens the market when a useful trade exists (above END_TURN)", () => {
    const state = stateWithResources(2, 5, 0);
    // Not inside a visit — OPEN_MARKET is a map action while parked on market.
    if (state.adventure) {
      state.adventure.pendingVisit = null;
    }
    const open = scoreMapAction(observe(state), {
      type: "OPEN_MARKET",
      playerId: "p2",
      heroId: "h2",
    });
    expect(open?.score).toBeGreaterThan(300);
    expect(open?.policy).toBe("map.open-market");
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

  it("ranks a useful trade above Done, and a wasteful trade below Done", () => {
    // Broke with spare materials: selling one for gold is useful.
    const state = stateWithResources(1, 3, 0);
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
    expect(useful?.score).toBeGreaterThan(done?.score ?? 0);
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

  it("chooseComputerAction takes a useful gold trade over Done", () => {
    const state = stateWithResources(1, 3, 0);
    const trade: LegalAction = {
      action: {
        type: "TRADE_RESOURCES",
        playerId: "p2",
        rateIndex: 4,
      } as GameAction,
      label: "1 valuables for 3 gold",
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
    expect(decision?.action.type).toBe("TRADE_RESOURCES");
    expect((decision?.action as { rateIndex: number }).rateIndex).toBe(4);
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

describe("market e2e — real engine + computer runner", () => {
  it("opens the Trading Post, sells valuables for gold, and exits Done (no loop)", () => {
    // Full engine path: park the computer hero on a trading_post, give it
    // convertible stock, drive the runner. Observable: gold rises, visit closes.
    const state = createAdventureGameState({
      seed: "market-e2e",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      sessionMode: "single-player",
      playerCount: 2,
    });
    // Computer seat is p2 on single-player adventure builds.
    state.activePlayerId = "p2";
    state.priorityPlayerId = "p2";
    state.round = 5;
    for (const pl of Object.values(state.players)) {
      pl.canMulligan = false;
      pl.needsHandRefresh = false;
    }
    const hero = getMainHero(state, "p2");
    expect(hero).toBeTruthy();
    const field: MapFieldState = {
      spaceId: "market-e2e-hex",
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
    hero!.spaceId = field.spaceId;
    hero!.movementPoints = 0;
    // Broke with valuables → must trade 1 valuables for 3 gold.
    state.players.p2.resources = {
      gold: 1,
      buildingMaterials: 0,
      valuables: 2,
    };
    Object.values(state.towns).find(
      (town) => town.controllerId === "p2",
    )!.buildings.push("castle.dwelling_gold");
    const goldBefore = state.players.p2.resources.gold;

    // Legal OPEN_MARKET must exist for the computer.
    const openOffer = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "OPEN_MARKET",
    );
    expect(openOffer, "OPEN_MARKET must be legal on the trading post").toBeDefined();

    // Drive: open → useful trade(s) → Done. Cap keeps a bug from spinning.
    const run = driveComputerPlayers(state, undefined, { maxSteps: 12 });
    expect(run.stalled, run.reason).toBe(false);

    const types = run.decisions.map((d) => d.action.type);
    expect(types).toContain("OPEN_MARKET");
    expect(types).toContain("TRADE_RESOURCES");
    expect(types).toContain("RESOLVE_VISIT_STEP");

    // Gold increased (valuables sold) and the visit is closed.
    expect(run.state.players.p2.resources.gold).toBeGreaterThan(goldBefore);
    expect(run.state.adventure?.pendingVisit).toBeFalsy();
    // Did not open the market a second time in a loop after Done.
    expect(types.filter((t) => t === "OPEN_MARKET")).toHaveLength(1);
  });

  it("CONTROL: balanced resources on a market never opens a trade loop", () => {
    const state = createAdventureGameState({
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
