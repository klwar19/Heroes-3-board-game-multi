/**
 * DESIGNER PRE-ASSIGNED SETTLEMENT (`CustomMapSettlementFieldPlan.ownerStart`).
 *
 * A designer names a STARTING tile (S1..Sn); the moment the settlement's own
 * tile is MATERIALIZED the settlement field is flagged to whichever seat
 * started there, and that seat owes the ORDINARY founding choice (production
 * track / reinforce) at the start of their OWN turn — through the same reward
 * queue every other turn-start prompt uses.
 *
 * Every case asserts the OBSERVABLE outcome — the field's `flagOwnerId`, the
 * prompt that really opens, and the production the pick really raises — with a
 * CONTROL on the SAME fixture without `ownerStart`.
 *
 * Mutation-checked:
 *  - deleting the `ownerStart` block in `materializeTileFields` fails every
 *    "flagged to" case (and the two-settlement case);
 *  - deleting the `queueOwedSettlementFoundings` call in
 *    `queueTurnStartBuildingChoices` fails the founding-choice, two-settlement
 *    and AI cases;
 *  - dropping the `ownerStart` arm of `sanitizeSettlementFieldPlan` fails the
 *    sanitiser case (index 0 is a real seat, so a truthiness check fails it
 *    too).
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getTileFootprintSpaceIds,
  RESOURCE_GAIN_LEVEL_AMOUNTS,
  sanitizeSettlementFieldPlan,
  type CustomMapTilePlan,
  type GameAction,
  type GameState,
  type MapFieldState,
  type PlayerId
} from "./index";
import { computerDecisionOwner } from "./computer/window";
import { driveComputerPlayers } from "@/server/computer-runner";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const COMPUTER = { kind: "computer", difficulty: "standard", policyVersion: 1 } as const;

/** Two designer Towns (S1, S2) plus the supply slots a case asks for. */
function towns(): CustomMapTilePlan[] {
  return [
    { row: 8, col: 2, group: "starting", faceDown: false },
    { row: 10, col: 7, group: "starting", faceDown: false }
  ];
}

/**
 * A "Start revealed" Far slot whose secret filter guarantees a settlement, with
 * an optional pre-assigned owner.
 */
function settlementSlot(
  at: { row: number; col: number },
  ownerStart?: number
): CustomMapTilePlan {
  return {
    ...at,
    group: "far",
    faceDown: true,
    revealAtSetup: true,
    secretFeatures: ["settlement"],
    ...(ownerStart === undefined ? {} : { settlement: { ownerStart } })
  };
}

function build(opts: {
  tiles: CustomMapTilePlan[];
  seed?: string;
  manualOrder?: PlayerId[];
  sessionMode?: "multiplayer" | "single-player";
  computers?: number;
  assignments?: Record<PlayerId, number>;
}): GameState {
  const computers = opts.computers ?? 0;
  const controllers = Object.fromEntries(
    Array.from({ length: computers }, (_, index) => [`p${2 - computers + index + 1}`, COMPUTER])
  );
  const state = createAdventureGameState({
    seed: opts.seed ?? "preassigned-settlement",
    difficulty: "normal",
    rollFirstPlayer: false,
    startingBonus: false,
    victoryMode: "conquest",
    customMap: opts.tiles,
    ...(opts.assignments ? { startingTileAssignments: opts.assignments } : {}),
    sessionMode: opts.sessionMode ?? "multiplayer",
    controllers,
    ...(opts.manualOrder
      ? { playerOrderMode: "manual" as const, manualPlayerOrder: opts.manualOrder }
      : {})
  });
  // The mandatory start-of-turn hand step is not what these cases are about;
  // each drives REFRESH_HAND explicitly where the turn-start queue matters.
  return state;
}

/** Every carved settlement field on the map, in placement order. */
function settlements(state: GameState): MapFieldState[] {
  return Object.values(state.adventure!.tiles)
    .filter((tile) => tile.group === "far")
    .flatMap((tile) =>
      getTileFootprintSpaceIds(tile)
        .map((spaceId) => state.adventure!.fields[spaceId])
        .filter((field): field is MapFieldState => field?.location === "settlement")
    );
}

describe("pre-assigned settlement — the flag at materialize", () => {
  it("flags the settlement to the seat that started on the named Town", () => {
    const state = build({ tiles: [...towns(), settlementSlot({ row: 5, col: 1 }, 1)] });
    expect(state.adventure!.startingTileSeats, "S1 = p1, S2 = p2 in game order").toEqual([
      "p1",
      "p2"
    ]);
    const [settlement] = settlements(state);
    expect(settlement, "the secret filter drew a settlement tile").toBeTruthy();
    expect(settlement.flagOwnerId, "S2's seat owns it from turn 1").toBe("p2");
    expect(settlement.everFlagged, "the founding bonus is still owed").toBe(false);
    expect(settlement.settlementFoundingOwedBy).toBe("p2");

    // CONTROL — the same fixture with no ownerStart is an ordinary settlement.
    const control = build({ tiles: [...towns(), settlementSlot({ row: 5, col: 1 })] });
    const [plain] = settlements(control);
    expect(plain.flagOwnerId, "CONTROL: unowned").toBeNull();
    expect(plain.settlementFoundingOwedBy, "CONTROL: nobody owes a choice").toBeUndefined();
  });

  it("the MANUAL player order decides which seat sits at that Town", () => {
    const state = build({
      tiles: [...towns(), settlementSlot({ row: 5, col: 1 }, 1)],
      manualOrder: ["p2", "p1"]
    });
    expect(state.adventure!.startingTileSeats).toEqual(["p2", "p1"]);
    expect(settlements(state)[0].flagOwnerId, "p1 now sits on S2").toBe("p1");
  });

  it("the LOBBY seat → starting-tile record moves the owner with the seat", () => {
    // Three designer Towns, two seats. The settlement is attached to S3, and
    // the lobby record decides WHO sits there — so the same map hands the same
    // settlement to a different player.
    const tiles: CustomMapTilePlan[] = [
      ...towns(),
      { row: 6, col: 4, group: "starting", faceDown: false },
      settlementSlot({ row: 5, col: 1 }, 2)
    ];
    const toP1 = build({ tiles, seed: "preassigned-lobby", assignments: { p1: 2, p2: 0 } });
    expect(toP1.adventure!.startingTileSeats).toEqual(["p2", null, "p1"]);
    expect(settlements(toP1)[0].flagOwnerId, "p1 sits on S3 and owns it").toBe("p1");
    expect(settlements(toP1)[0].settlementFoundingOwedBy).toBe("p1");

    // The SAME map with the seats swapped hands it to p2 instead.
    const toP2 = build({ tiles, seed: "preassigned-lobby", assignments: { p1: 0, p2: 2 } });
    expect(settlements(toP2)[0].flagOwnerId, "the owner follows the SEAT").toBe("p2");

    // CONTROL — with no record the default order seats p1/p2 on S1/S2, so
    // nobody sits on S3 and the settlement stays unowned.
    const control = build({ tiles, seed: "preassigned-lobby" });
    expect(settlements(control)[0].flagOwnerId, "CONTROL: unowned").toBeNull();
  });

  it("an EMPTY starting position leaves the settlement unowned", () => {
    // Three designer Towns, two seats: nobody sits at S3.
    const tiles: CustomMapTilePlan[] = [
      ...towns(),
      { row: 6, col: 4, group: "starting", faceDown: false },
      settlementSlot({ row: 5, col: 1 }, 2)
    ];
    const state = build({ tiles, seed: "preassigned-empty" });
    expect(state.adventure!.startingTileSeats).toEqual(["p1", "p2", null]);
    const [settlement] = settlements(state);
    expect(settlement.flagOwnerId, "no seat at S3 ⇒ unowned").toBeNull();
    expect(settlement.settlementFoundingOwedBy).toBeUndefined();
  });
});

describe("pre-assigned settlement — the founding choice on the owner's own turn", () => {
  it("opens at the owner's turn start and the pick really raises production", () => {
    const state = build({
      tiles: [...towns(), settlementSlot({ row: 5, col: 1 }, 0)],
      seed: "preassigned-choice"
    });
    expect(state.activePlayerId, "S1's seat plays first with no roll").toBe("p1");
    const beforeGold = state.players.p1.production.gold;
    // Nothing is open before the owner takes their turn-start hand step.
    expect(state.adventure!.pendingVisit).toBeNull();

    let next = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(next.adventure!.pendingVisit?.playerId, "the owner's own prompt").toBe("p1");
    expect(next.adventure!.pendingVisit?.steps[0].type).toBe("SETTLEMENT_CHOICE");
    const offers = getLegalActions(next, "p1").filter(
      (action) => action.action.type === "RESOLVE_VISIT_STEP"
    );
    expect(
      offers.map((offer) => offer.label).slice(0, 3),
      "the printed production tracks are offered"
    ).toEqual([
      `Increase gold income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.gold}`,
      `Increase building materials income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.buildingMaterials}`,
      `Increase valuables income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.valuables}`
    ]);

    next = apply(next, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(
      next.players.p1.production.gold - beforeGold,
      "founding really raised the gold track"
    ).toBe(RESOURCE_GAIN_LEVEL_AMOUNTS.gold);
    const [settlement] = settlements(next);
    expect(settlement.settlementResource).toBe("gold");
    expect(settlement.everFlagged, "founded ⇒ the one-time bonus is spent").toBe(true);
    expect(settlement.settlementFoundingOwedBy, "asked exactly once").toBeUndefined();
    expect(next.adventure!.pendingVisit, "and the prompt closed").toBeNull();

    // CONTROL — with no ownerStart the same turn start opens nothing at all.
    const control = apply(
      build({ tiles: [...towns(), settlementSlot({ row: 5, col: 1 })], seed: "preassigned-choice" }),
      { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }
    );
    expect(control.adventure!.pendingVisit, "CONTROL: no prompt").toBeNull();
    expect(control.players.p1.production.gold, "CONTROL: production untouched").toBe(beforeGold);
  });

  it("TWO pre-assigned settlements open TWO choices, one at a time", () => {
    const state = build({
      tiles: [
        ...towns(),
        settlementSlot({ row: 5, col: 1 }, 0),
        settlementSlot({ row: 10, col: 0 }, 0)
      ],
      seed: "preassigned-two"
    });
    const owned = settlements(state).filter((field) => field.settlementFoundingOwedBy === "p1");
    expect(owned.length, "both settlements are pre-assigned to p1").toBeGreaterThanOrEqual(2);
    const beforeGold = state.players.p1.production.gold;

    let next = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(next.adventure!.pendingVisit?.steps[0].type).toBe("SETTLEMENT_CHOICE");
    const firstFieldId = next.adventure!.pendingVisit!.fieldId;
    next = apply(next, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(next.adventure!.pendingVisit?.steps[0].type, "the second choice follows").toBe(
      "SETTLEMENT_CHOICE"
    );
    expect(next.adventure!.pendingVisit!.fieldId, "a DIFFERENT settlement").not.toBe(firstFieldId);
    next = apply(next, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(next.adventure!.pendingVisit).toBeNull();
    expect(
      next.players.p1.production.gold - beforeGold,
      "both settlements raised the track"
    ).toBe(2 * RESOURCE_GAIN_LEVEL_AMOUNTS.gold);
  });

  it("a COMPUTER owner answers its own founding choice (no stall)", () => {
    const state = build({
      tiles: [...towns(), settlementSlot({ row: 5, col: 1 }, 1)],
      seed: "preassigned-ai",
      sessionMode: "single-player",
      computers: 1
    });
    expect(settlements(state)[0].settlementFoundingOwedBy, "the AI seat owns it").toBe("p2");
    // Fast-forward to the AI's turn: p1 draws, then ends.
    let next = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    next = apply(next, { type: "END_TURN", playerId: "p1" });
    const run = driveComputerPlayers(next);
    expect(run.stalled, "the AI never stalls on the founding choice").toBe(false);
    expect(computerDecisionOwner(run.state), "nothing is left owed").toBeNull();
    const [settlement] = settlements(run.state);
    expect(settlement.everFlagged, "the AI founded it").toBe(true);
    expect(settlement.settlementResource, "…on a real production track").toBeTruthy();
    expect(settlement.settlementFoundingOwedBy).toBeUndefined();
  });
});

describe("sanitizeSettlementFieldPlan — ownerStart", () => {
  it("keeps a whole in-range index (0 included) and drops anything else", () => {
    expect(sanitizeSettlementFieldPlan({ ownerStart: 0 }), "S1 is index 0").toEqual({
      ownerStart: 0
    });
    expect(sanitizeSettlementFieldPlan({ ownerStart: 5 })).toEqual({ ownerStart: 5 });
    expect(sanitizeSettlementFieldPlan({ ownerStart: 6 }), "past the seat ceiling").toBeUndefined();
    expect(sanitizeSettlementFieldPlan({ ownerStart: -1 })).toBeUndefined();
    expect(sanitizeSettlementFieldPlan({ ownerStart: 1.5 })).toBeUndefined();
    expect(sanitizeSettlementFieldPlan({ ownerStart: "1" })).toBeUndefined();
    expect(sanitizeSettlementFieldPlan({ vp: 3, ownerStart: 2 })).toEqual({
      vp: 3,
      ownerStart: 2
    });
  });
});
