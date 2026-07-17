/**
 * Multi hex placements per tile — different slots only, no stacking.
 */
import { describe, expect, it } from "vitest";
import type { CustomMapTilePlan } from "./state";
import {
  dedupePlanHexPlacements,
  firstFreeSlot,
  occupiedSlotsOnPlan,
  planFieldOverrides,
  planTokens,
  withPlanFieldOverrides,
  withPlanTokens
} from "./tile-hex-placements";

const base: CustomMapTilePlan = {
  row: 1,
  col: 2,
  group: "far",
  faceDown: false,
  tileDefId: "far-1"
};

describe("planTokens / planFieldOverrides normalization", () => {
  it("folds legacy singular token into list", () => {
    const plan = { ...base, token: { kind: "monolith" as const, slot: 1 } };
    expect(planTokens(plan)).toEqual([{ kind: "monolith", slot: 1 }]);
  });

  it("merges tokens array with legacy without duplicate", () => {
    const plan = {
      ...base,
      token: { kind: "monolith" as const, slot: 1 },
      tokens: [
        { kind: "monolith" as const, slot: 1 },
        { kind: "gate" as const, pair: 1 as const, slot: 3 }
      ]
    };
    const list = planTokens(plan);
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.slot).sort()).toEqual([1, 3]);
  });

  it("folds fieldOverride singular + array", () => {
    const plan = {
      ...base,
      fieldOverride: { kind: "kiem_trung", slot: 0 },
      fieldOverrides: [{ kind: "linh_tuyen", slot: 2 }]
    };
    const list = planFieldOverrides(plan);
    expect(list).toHaveLength(2);
    expect(list.map((o) => o.kind).sort()).toEqual(["kiem_trung", "linh_tuyen"]);
  });
});

describe("no stacking on same hex", () => {
  it("occupiedSlotsOnPlan unions tokens and overrides", () => {
    const plan = {
      ...base,
      tokens: [{ kind: "monolith" as const, slot: 1 }],
      fieldOverrides: [{ kind: "bi_canh", slot: 4 }]
    };
    expect([...occupiedSlotsOnPlan(plan)].sort()).toEqual([1, 4]);
  });

  it("dedupe drops later pin on same slot (first wins)", () => {
    const plan = {
      ...base,
      tokens: [
        { kind: "monolith" as const, slot: 2 },
        { kind: "gate" as const, pair: 2 as const, slot: 2 }
      ],
      fieldOverrides: [{ kind: "linh_tuyen", slot: 2 }]
    };
    const { tokens, fieldOverrides, problems } = dedupePlanHexPlacements(plan);
    expect(tokens).toEqual([{ kind: "monolith", slot: 2 }]);
    expect(fieldOverrides ?? []).toEqual([]);
    expect(problems.length).toBeGreaterThanOrEqual(1);
  });

  it("allows token + override on different slots", () => {
    const plan = {
      ...base,
      tokens: [{ kind: "whirlpool" as const, slot: 0 }],
      fieldOverrides: [
        { kind: "kiem_trung", slot: 1 },
        { kind: "ngo_dao_thach", slot: 5 }
      ]
    };
    const { tokens, fieldOverrides, problems } = dedupePlanHexPlacements(plan);
    expect(problems).toEqual([]);
    expect(tokens).toHaveLength(1);
    expect(fieldOverrides).toHaveLength(2);
  });

  it("firstFreeSlot skips occupied", () => {
    expect(firstFreeSlot(new Set([0, 1, 2]))).toBe(3);
    expect(firstFreeSlot(new Set([0, 1, 2, 3, 4, 5, 6]))).toBeNull();
  });
});

describe("withPlan* writers clear legacy singular", () => {
  it("withPlanTokens drops token singular", () => {
    const next = withPlanTokens(
      { ...base, token: { kind: "monolith", slot: 0 } },
      [
        { kind: "monolith", slot: 0 },
        { kind: "gate", pair: 1, slot: 2 }
      ]
    );
    expect(next.token).toBeUndefined();
    expect(next.tokens).toHaveLength(2);
  });

  it("withPlanFieldOverrides drops singular", () => {
    const next = withPlanFieldOverrides(
      { ...base, fieldOverride: { kind: "a", slot: 0 } },
      [
        { kind: "a", slot: 0 },
        { kind: "b", slot: 1 }
      ]
    );
    expect(next.fieldOverride).toBeUndefined();
    expect(next.fieldOverrides).toHaveLength(2);
  });
});
