import { describe, expect, it } from "vitest";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { buildingTimingLabel, describeBuildingEffect } from "./describe";

/**
 * The town panel renders {describeBuildingEffect(building)} as the building's
 * rules text and a {buildingTimingLabel(building)} tag. Any effect type missing
 * from the switch silently falls through to "No special effect." — which is how
 * the Cove City Hall, the Cove Pub and the Fortress Blood Obelisk shipped reading
 * as inert even though the engine runs them. This pins every implemented
 * building to a real description so a new effect type can't regress that way.
 */
describe("describeBuildingEffect — no implemented building reads as inert", () => {
  it("never returns the 'No special effect.' fallback for a building the engine runs", () => {
    for (const building of Object.values(coreBuildingDefinitions)) {
      if (building.implementationStatus === "not-implemented" || !building.effect) {
        continue;
      }
      const text = describeBuildingEffect(building);
      expect(text, building.id).not.toBe("No special effect.");
      expect(text.length, building.id).toBeGreaterThan(0);
    }
  });

  it("describes the Cove City Hall's Astrologers'-round gold / experience choice", () => {
    const building = coreBuildingDefinitions["cove.city_hall"];
    const text = describeBuildingEffect(building);
    expect(text).toMatch(/Astrologers' round/i);
    expect(text).toMatch(/4 gold/i);
    expect(text).toMatch(/experience/i);
    expect(buildingTimingLabel(building)).toBe("start of Astrologers' rounds");
  });

  it("describes the Cove Pub's flat −3-gold Astrologers'-round reinforce", () => {
    const building = coreBuildingDefinitions["cove.pub"];
    const text = describeBuildingEffect(building);
    expect(text).toMatch(/Astrologers' round/i);
    expect(text).toMatch(/3 less gold/i);
    expect(buildingTimingLabel(building)).toBe("start of Astrologers' rounds");
  });

  it("describes the Cove Thieves' Guild's once-per-turn top-2 deck peek", () => {
    const building = coreBuildingDefinitions["cove.thieves_guild"];
    const text = describeBuildingEffect(building);
    expect(text).toMatch(/top 2/i);
    expect(text).toMatch(/discard/i);
    expect(text).toMatch(/back on top/i);
    expect(buildingTimingLabel(building)).toBe("during your turn");
  });

  it("describes the Fortress Blood Obelisk's Resource-round discard search (regression)", () => {
    const building = coreBuildingDefinitions["fortress.blood_obelisk"];
    const text = describeBuildingEffect(building);
    expect(text).toMatch(/discard pile/i);
    expect(text).not.toBe("No special effect.");
    expect(buildingTimingLabel(building)).toBe("start of Resource rounds");
  });
});
