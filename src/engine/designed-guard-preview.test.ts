import { describe, expect, it } from "vitest";
import { applyCustomGuardToField, clearCustomGuard, designedGuardPreview } from "./index";
import type { MapFieldState } from "./state";

// ---------------------------------------------------------------------------
// Designer altered-guard marker + preview: a field whose neutral guard was set
// by the MAP DESIGNER (a custom army, a custom level, or a map-wide settlement/
// obelisk guard) carries `field.designedGuard`, and `designedGuardPreview` maps
// it to what the player will face — so the map can SHOW it and WARN before the
// fight. A printed guard is NOT flagged (the CONTROL).
// ---------------------------------------------------------------------------

function field(overrides: Partial<MapFieldState> = {}): MapFieldState {
  return {
    spaceId: "f",
    tileInstanceId: "t",
    slot: 0,
    location: "blocked_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    ...overrides
  } as MapFieldState;
}

describe("Designer altered-guard marker + preview", () => {
  it("marks an EXACT-ARMY guard and previews its units + derived difficulty", () => {
    const f = field();
    applyCustomGuardToField(f, { units: ["neutral.cyclopes", "neutral.troglodytes"] });
    expect(f.designedGuard).toBe(true);
    expect(f.customGuardUnits).toEqual(["neutral.cyclopes", "neutral.troglodytes"]);

    const preview = designedGuardPreview(f);
    expect(preview).not.toBeNull();
    expect(preview!.units).toEqual(["Cyclopes", "Troglodytes"]);
    expect(preview!.difficulty).toBe(f.difficulty);
  });

  it("marks a LEVEL guard and previews just the level (its army is drawn at fight time)", () => {
    const f = field();
    applyCustomGuardToField(f, { level: 3 });
    expect(f.designedGuard).toBe(true);
    expect(f.difficulty).toBe(3);
    expect(f.customGuardUnits).toBeUndefined();
    expect(designedGuardPreview(f)).toEqual({ difficulty: 3, units: [] });
  });

  it("CONTROL: a PRINTED guard (difficulty set, not designer) previews nothing", () => {
    const f = field({ difficulty: 4 });
    expect(f.designedGuard ?? false).toBe(false);
    expect(designedGuardPreview(f)).toBeNull();
  });

  it("an absent guard spec is a no-op — no marker, no difficulty, no preview", () => {
    const f = field();
    applyCustomGuardToField(f, undefined);
    expect(f.designedGuard ?? false).toBe(false);
    expect(f.difficulty).toBeUndefined();
    expect(designedGuardPreview(f)).toBeNull();
  });

  it("clearCustomGuard removes the marker together with the guard", () => {
    const f = field();
    applyCustomGuardToField(f, { units: ["neutral.cyclopes"] });
    clearCustomGuard(f);
    expect(f.designedGuard).toBeUndefined();
    expect(f.difficulty).toBeUndefined();
    expect(f.customGuardUnits).toBeUndefined();
    expect(designedGuardPreview(f)).toBeNull();
  });
});
