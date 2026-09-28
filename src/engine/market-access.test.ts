import { describe, expect, it } from "vitest";
import type { GameAction, GameState, HeroState, MapFieldState } from "./state";
import { getMainHero } from "./adventure";
import { openMarket, resolveVisitStep } from "./adventure-reducer";
import { createAdventureGameState, getLegalActions } from "./index";

function makeGame(): GameState {
  const state = createAdventureGameState({ seed: "market", difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";
  return state;
}

function injectField(state: GameState, location: string, spaceId = "50,50"): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "market-tile",
    slot: 0,
    location,
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

describe("Market access (Trading Post / War Machine Factory)", () => {
  it("reopening the Trading Post for a parked hero costs 1 movement point (refused at 0)", () => {
    // b4509ac6 (v139): reopening a Trading Post costs that hero 1 MP, including
    // on later turns; the War Machine Factory stays free (CONTROL below).
    const state = makeGame();
    injectField(state, "trading_post");
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "50,50";
    hero.movementPoints = 0;
    expect(() => openMarket(state, { type: "OPEN_MARKET", playerId: "p1", heroId: hero.id })).toThrow(
      /1 movement point/
    );
    expect(state.adventure!.pendingVisit ?? null).toBeNull();

    hero.movementPoints = 2;
    openMarket(state, { type: "OPEN_MARKET", playerId: "p1", heroId: hero.id });

    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("TRADING_POST");
    expect(state.heroes[hero.id].movementPoints).toBe(1);
  });

  it("offers OPEN_MARKET — not the 1-MP revisit — as a legal action on a market tile", () => {
    const state = makeGame();
    injectField(state, "trading_post");
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "50,50";
    hero.movementPoints = 3;

    const actions = getLegalActions(state, "p1");
    const open = actions.filter(
      (legal) => legal.action.type === "OPEN_MARKET" && legal.action.heroId === hero.id
    );
    const revisit = actions.filter(
      (legal) => legal.action.type === "REVISIT_FIELD" && legal.action.heroId === hero.id
    );

    expect(open).toHaveLength(1);
    // The free OPEN_MARKET supersedes the generic 1-MP "Revisit" for markets.
    expect(revisit).toHaveLength(0);
  });

  it("keeps the market reachable through a Secondary Hero parked on the tile", () => {
    const state = makeGame();
    injectField(state, "trading_post");

    const secondary: HeroState = {
      id: "hero_p1_secondary",
      controllerId: "p1",
      kind: "secondary",
      level: 1,
      experience: 0,
      movementPoints: 0,
      movementPointsMax: 4,
      spaceId: "50,50"
    };
    state.heroes[secondary.id] = secondary;

    const openFor = () =>
      getLegalActions(state, "p1").filter(
        (legal) => legal.action.type === "OPEN_MARKET" && legal.action.heroId === secondary.id
      );
    // The reopen costs the Secondary Hero 1 MP too (b4509ac6): not offered at 0.
    expect(openFor()).toHaveLength(0);
    secondary.movementPoints = 1;
    expect(openFor()).toHaveLength(1);

    openMarket(state, { type: "OPEN_MARKET", playerId: "p1", heroId: secondary.id });
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("TRADING_POST");
    expect(state.adventure!.pendingVisit?.heroId).toBe(secondary.id);
    expect(state.heroes[secondary.id].movementPoints).toBe(0);
  });

  it("rejects opening a market when the hero is not standing on one", () => {
    const state = makeGame();
    injectField(state, "empty_field");
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "50,50";

    expect(() => openMarket(state, { type: "OPEN_MARKET", playerId: "p1", heroId: hero.id })).toThrow(/Market/);
  });

  it("also opens the War Machine Factory for free", () => {
    const state = makeGame();
    injectField(state, "war_machine_factory");
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "50,50";
    hero.movementPoints = 0;

    openMarket(state, { type: "OPEN_MARKET", playerId: "p1", heroId: hero.id });
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("WAR_MACHINE_SHOP");
    expect(state.heroes[hero.id].movementPoints).toBe(0);
  });
});

describe("Trading Post card sales (USER RULING 2026-09-17: a sale never closes the market)", () => {
  it("keeps the visit open after selling a card, allows a second sale, and only Done closes it", () => {
    const state = makeGame();
    injectField(state, "trading_post");
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "50,50";
    state.players.p1.hand.push("spell.bless", "spell.blind");
    openMarket(state, { type: "OPEN_MARKET", playerId: "p1", heroId: hero.id });
    const sellOf = (cardId: string) => {
      const index = state.players.p1.hand.indexOf(cardId);
      const legal = getLegalActions(state, "p1").find(
        (candidate) =>
          candidate.action.type === "RESOLVE_VISIT_STEP" &&
          candidate.label.startsWith("Sell ") &&
          candidate.action.optionIndex === index,
      );
      expect(legal, `a sell action for ${cardId}`).toBeDefined();
      return legal!.action as Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>;
    };
    const goldBefore = state.players.p1.resources.gold;

    resolveVisitStep(state, sellOf("spell.bless"));
    expect(state.players.p1.resources.gold).toBe(goldBefore + 1);
    expect(state.players.p1.hand).not.toContain("spell.bless");
    expect(state.players.p1.removed).toContain("spell.bless");
    // Still the same open Trading Post visit — not closed by the sale.
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("TRADING_POST");
    expect(state.adventure!.pendingVisit?.steps[0]).toMatchObject({ sold: 1 });

    // A second card sells on the same visit.
    resolveVisitStep(state, sellOf("spell.blind"));
    expect(state.players.p1.resources.gold).toBe(goldBefore + 2);
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("TRADING_POST");
    expect(state.adventure!.pendingVisit?.steps[0]).toMatchObject({ sold: 2 });

    // CONTROL: "Done trading" is what ends the visit.
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
    expect(state.adventure!.pendingVisit).toBeFalsy();
  });
});
