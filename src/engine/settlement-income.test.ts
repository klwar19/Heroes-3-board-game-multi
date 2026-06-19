import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState, VisitStep } from "./state";
import { beginFieldVisit, getMainHero } from "./adventure";
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

// The block above drives resolveSettlementChoice in isolation. The block below
// exercises the REAL visit flow (beginFieldVisit), where the bugs lived: a
// hero who walks out of and back into their own settlement, and a hero who
// captures a settlement another player already founded.

/** Walks `playerId`'s main hero onto `field` and triggers the field visit. */
function visit(state: GameState, playerId: string, field: MapFieldState): void {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = field.spaceId;
  beginFieldVisit(state, hero.id, field.spaceId, false);
}

/** Founds a fresh gold settlement for `playerId` via the normal choice flow. */
function foundGoldSettlement(state: GameState, playerId: string): MapFieldState {
  const field = injectSettlement(state, null, false);
  visit(state, playerId, field);
  // First flag opens the choice; pick gold (option 0).
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 });
  return field;
}

describe("settlement re-visit and capture (real visit flow)", () => {
  it("does NOT re-apply the income when the owner walks out and back in", () => {
    const state = makeGame();
    const field = foundGoldSettlement(state, "p1");

    const productionAfterFirstFlag = state.players.p1.production.gold;
    const stockpileAfterFirstFlag = state.players.p1.resources.gold;

    // Re-enter the settlement you already own (the reported bug: this used to
    // re-grant the income every time).
    visit(state, "p1", field);

    // No choice is even offered, and nothing changes.
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(state.players.p1.production.gold).toBe(productionAfterFirstFlag);
    expect(state.players.p1.resources.gold).toBe(stockpileAfterFirstFlag);

    // A third visit must still be inert (guards against an off-by-one).
    visit(state, "p1", field);
    expect(state.players.p1.production.gold).toBe(productionAfterFirstFlag);
  });

  it("auto-transfers a founded settlement to the captor: inherits the resource, no choice, no first-flag bonus", () => {
    const state = makeGame();
    const field = foundGoldSettlement(state, "p1");

    const p1ProductionWithSettlement = state.players.p1.production.gold; // includes +5
    const p2ProductionBefore = state.players.p2.production.gold;
    const p2StockpileBefore = state.players.p2.resources.gold;
    const p2ValuablesBefore = state.players.p2.production.valuables;

    // p2 captures the settlement.
    visit(state, "p2", field);

    // Capture is automatic — no SETTLEMENT_CHOICE is offered.
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(field.flagOwnerId).toBe("p2");

    // p2 inherits exactly the founder's resource (gold), NOT a resource of
    // p2's choosing — valuables production is untouched.
    expect(field.settlementResource).toBe("gold");
    expect(state.players.p2.production.gold).toBe(p2ProductionBefore + 5);
    expect(state.players.p2.production.valuables).toBe(p2ValuablesBefore);

    // p2 does NOT get the one-time first-flag stockpile bonus.
    expect(state.players.p2.resources.gold).toBe(p2StockpileBefore);

    // The former owner loses the income.
    expect(state.players.p1.production.gold).toBe(p1ProductionWithSettlement - 5);
  });

  it("the former owner who recaptures their settlement does not double up", () => {
    const state = makeGame();
    const field = foundGoldSettlement(state, "p1");
    const baselineP1 = state.players.p1.production.gold - 5; // p1 without the settlement
    const baselineP2 = state.players.p2.production.gold; // p2 without the settlement

    visit(state, "p2", field); // p2 takes it: p1 -5, p2 +5
    expect(state.players.p1.production.gold).toBe(baselineP1);
    expect(state.players.p2.production.gold).toBe(baselineP2 + 5);

    visit(state, "p1", field); // p1 takes it back
    expect(field.flagOwnerId).toBe("p1");
    expect(state.players.p1.production.gold).toBe(baselineP1 + 5);
    expect(state.players.p2.production.gold).toBe(baselineP2); // p2 back to baseline, not below
  });

  it("still offers the full choice on the very first flag", () => {
    const state = makeGame();
    const field = injectSettlement(state, null, false);

    visit(state, "p1", field);

    const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "SETTLEMENT_CHOICE" }> | undefined;
    expect(step?.type).toBe("SETTLEMENT_CHOICE");
  });
});
