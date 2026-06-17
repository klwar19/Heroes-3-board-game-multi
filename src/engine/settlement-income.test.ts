import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState } from "./state";
import { getMainHero } from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { createAdventureGameState } from "./index";

// A settlement raises one production track by a full resource-gain level —
// +5 gold, +2 building materials, or +1 valuables (the same levels as the
// town-conquest reward) — not a flat +1. Losing the settlement strips the
// same amount from the former owner.

function makeGame(): GameState {
  return createAdventureGameState({ seed: "settlement-income", difficulty: "normal", rollFirstPlayer: false });
}

function injectSettlement(state: GameState, flagOwnerId: string | null, everFlagged = false): MapFieldState {
  const field: MapFieldState = {
    spaceId: "50,50",
    tileInstanceId: "loc-tile",
    slot: 0,
    location: "settlement",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId,
    everFlagged,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  return field;
}

function openSettlementChoice(state: GameState, playerId: string, field: MapFieldState): void {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = field.spaceId;
  state.adventure!.pendingVisit = {
    heroId: hero.id,
    playerId,
    fieldId: field.spaceId,
    steps: [{ type: "SETTLEMENT_CHOICE" }]
  };
}

describe("settlement income levels", () => {
  it("raises gold production by 5 (a full level), not 1", () => {
    const state = makeGame();
    const field = injectSettlement(state, null);
    openSettlementChoice(state, "p1", field);

    const goldBefore = state.players.p1.production.gold;
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p1.production.gold).toBe(goldBefore + 5);
    expect(field.settlementResource).toBe("gold");
    expect(field.flagOwnerId).toBe("p1");
  });

  it("raises building materials production by 2, not 1", () => {
    const state = makeGame();
    const field = injectSettlement(state, null);
    openSettlementChoice(state, "p1", field);

    const before = state.players.p1.production.buildingMaterials;
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 });

    expect(state.players.p1.production.buildingMaterials).toBe(before + 2);
  });

  it("raises valuables production by 1", () => {
    const state = makeGame();
    const field = injectSettlement(state, null);
    openSettlementChoice(state, "p1", field);

    const before = state.players.p1.production.valuables;
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 2 });

    expect(state.players.p1.production.valuables).toBe(before + 1);
  });

  it("grants the first-flag one-time bonus at the level amount (5 gold), too", () => {
    const state = makeGame();
    const field = injectSettlement(state, null, false);
    openSettlementChoice(state, "p1", field);

    const goldBefore = state.players.p1.resources.gold;
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p1.resources.gold).toBe(goldBefore + 5);
    expect(field.everFlagged).toBe(true);
  });

  it("strips the whole level (5 gold) from a former owner when the settlement changes hands", () => {
    const state = makeGame();
    // p2 already owns a gold settlement and earns its full +5 level.
    const field = injectSettlement(state, "p2", true);
    field.settlementResource = "gold";
    state.players.p2.production.gold = 7; // includes the +5 from this settlement

    openSettlementChoice(state, "p1", field);
    const p1Before = state.players.p1.production.gold;

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    // p2 loses the whole +5 level; p1 gains a fresh +5.
    expect(state.players.p2.production.gold).toBe(2);
    expect(state.players.p1.production.gold).toBe(p1Before + 5);
    expect(field.flagOwnerId).toBe("p1");
  });

  it("never drives a former owner's production below zero", () => {
    const state = makeGame();
    const field = injectSettlement(state, "p2", true);
    field.settlementResource = "gold";
    state.players.p2.production.gold = 3; // less than a full level somehow

    openSettlementChoice(state, "p1", field);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p2.production.gold).toBe(0);
  });
});
