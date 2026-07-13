import { describe, expect, it } from "vitest";

import { locationDefinitions } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import { applyAction, createAdventureGameState } from "./index";
import {
  beginFieldVisit,
  getHeroMovementCapabilities,
  getMainHero,
  startPlayerTurn
} from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import type { GameState, MapFieldState, VisitStep } from "./state";

/**
 * Factory rulebook p.7–8 locations — each claim fails if the wiring is removed.
 * Tile object IDs are pinned in factory-content.test.ts; these assert the
 * OBSERVABLE effects (resources, movement, move-through, next-turn bonus).
 */

const FIELD_ID = "50,50";

function factoryGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

function injectField(state: GameState, location: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "factory-loc-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  return field;
}

function visit(state: GameState, location: string): void {
  const field = injectField(state, location);
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = field.spaceId;
  beginFieldVisit(state, hero.id, field.spaceId, false);
}

function payFirstOption(state: GameState): void {
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
}

function declinePay(state: GameState): void {
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
}

describe("Factory rulebook locations — observable effects", () => {
  it("Derrick grants +3 gold (Water Wheel equivalent)", () => {
    const state = factoryGame("derrick");
    const before = state.players.p1.resources.gold;
    visit(state, "derrick");
    expect(state.players.p1.resources.gold).toBe(before + 3);
  });

  it("Prospector grants +1 valuables (Windmill equivalent) — NOT a resource die", () => {
    const state = factoryGame("prospector");
    const before = state.players.p1.resources.valuables;
    visit(state, "prospector");
    expect(state.players.p1.resources.valuables).toBe(before + 1);
    expect(locationDefinitions.prospector.interaction).toEqual({
      type: "GAIN_RESOURCES",
      valuables: 1
    });
  });

  it("Trailblazer grants +1 movement (revisitable teepee, not Stables id)", () => {
    const state = factoryGame("trailblazer");
    const hero = getMainHero(state, "p1")!;
    const before = hero.movementPoints;
    visit(state, "trailblazer");
    expect(hero.movementPoints).toBe(before + 1);
    expect(locationDefinitions.trailblazer.name).toBe("Trailblazer");
    expect(locationDefinitions.trailblazer.category).toBe("revisitable");
  });

  it("Airship Yard: pay 3 gold → +2 movement and move-through blocked", () => {
    const state = factoryGame("airship");
    const hero = getMainHero(state, "p1")!;
    state.players.p1.resources.gold = 10;
    const gold = state.players.p1.resources.gold;
    const mp = hero.movementPoints;
    visit(state, "airship_yard");
    const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "PAY_TO" }> | undefined;
    expect(step?.type).toBe("PAY_TO");
    payFirstOption(state);
    expect(state.players.p1.resources.gold).toBe(gold - 3);
    expect(hero.movementPoints).toBe(mp + 2);
    expect(getHeroMovementCapabilities(state, hero).moveThrough).toBe(true);

    // CONTROL: declining leaves gold/MP unchanged and no move-through.
    const decline = factoryGame("airship-decline");
    const dHero = getMainHero(decline, "p1")!;
    decline.players.p1.resources.gold = 10;
    const dGold = decline.players.p1.resources.gold;
    const dMp = dHero.movementPoints;
    visit(decline, "airship_yard");
    declinePay(decline);
    expect(decline.players.p1.resources.gold).toBe(dGold);
    expect(dHero.movementPoints).toBe(dMp);
    expect(getHeroMovementCapabilities(decline, dHero).moveThrough).toBe(false);
  });

  it("Watering Hole zeros movement now and grants +1 on the next turn start", () => {
    const state = factoryGame("watering");
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 4;
    visit(state, "watering_hole");
    expect(hero.movementPoints).toBe(0);
    expect(hero.wateringHoleBonusPending).toBe(true);

    hero.movementPoints = 3; // simulate refreshed movement before next turn
    startPlayerTurn(state, "p1");
    expect(hero.movementPoints).toBe(4);
    expect(hero.wateringHoleBonusPending).toBeFalsy();
  });

  it("Factory Grave is optional pay-1-valuables → Search(2) Artifacts + morale (not Cove Grave)", () => {
    expect(locationDefinitions.factory_grave.interaction.type).toBe("PAY_TO");
    // Cove control: the shared `grave` id keeps the Cove effect.
    expect(locationDefinitions.grave.interaction.type).toBe("SEQUENCE");
    expect(allTileDefinitions["&F2"].fields.some((f) => f.location === "factory_grave")).toBe(true);
    expect(allTileDefinitions["&F2"].fields.some((f) => f.location === "grave")).toBe(false);

    const state = factoryGame("factory-grave");
    state.players.p1.resources.valuables = 2;
    const morale = state.players.p1.morale;
    visit(state, "factory_grave");
    payFirstOption(state);
    expect(state.players.p1.resources.valuables).toBe(1);
    expect(state.players.p1.morale).toBe(morale + 1);
    const searches = state.adventure!.rewardQueue.filter(
      (r) => r.kind === "shared-deck-search" && (r as { deckId?: string }).deckId === "artifacts"
    );
    expect(searches.length, "Search(2) artifacts queued").toBe(1);
  });

  it("Warlock's Lab removes a hand card for +1 valuables", () => {
    const state = factoryGame("warlock-lab");
    state.players.p1.hand = ["stat.attack", "stat.defense"];
    const valuables = state.players.p1.resources.valuables;
    visit(state, "warlock_lab");
    const step = state.adventure!.pendingVisit?.steps[0];
    expect(step?.type).toBe("REMOVE_HAND_CARD");
    // Pick the first removable card via RESOLVE_VISIT_STEP.
    const result = applyAction(state, {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p1",
      optionIndex: 0
    });
    expect(result.errors).toEqual([]);
    expect(result.state.players.p1.hand).toHaveLength(1);
    expect(result.state.players.p1.resources.valuables).toBe(valuables + 1);
  });
});
