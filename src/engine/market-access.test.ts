import { describe, expect, it } from "vitest";
import type { GameState, HeroState, MapFieldState } from "./state";
import { getMainHero } from "./adventure";
import { openMarket } from "./adventure-reducer";
import { createAdventureGameState, getLegalActions } from "./index";

function makeGame(): GameState {
  const state = createAdventureGameState({ seed: "market", difficulty: "normal", rollFirstPlayer: false });
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
  it("opens the Trading Post for free — no movement point spent — while a hero is parked on it", () => {
    const state = makeGame();
    injectField(state, "trading_post");
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "50,50";
    hero.movementPoints = 0; // out of movement: the market is still reachable

    openMarket(state, { type: "OPEN_MARKET", playerId: "p1", heroId: hero.id });

    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("TRADING_POST");
    // Free: opening the market never costs a movement point.
    expect(state.heroes[hero.id].movementPoints).toBe(0);
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

    const open = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "OPEN_MARKET" && legal.action.heroId === secondary.id
    );
    expect(open).toHaveLength(1);

    openMarket(state, { type: "OPEN_MARKET", playerId: "p1", heroId: secondary.id });
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("TRADING_POST");
    expect(state.adventure!.pendingVisit?.heroId).toBe(secondary.id);
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
