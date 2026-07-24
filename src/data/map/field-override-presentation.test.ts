/**
 * Field Override PRESENTATION helper — the single data-driven seam the board
 * tooltip + click-to-inspect float read so EVERY registered override kind (WOG +
 * anime) tells the player what visiting the hex does. Mutation-checked: the
 * data-driven loop fails if a kind's name/summary/tag stops resolving.
 */

import { describe, expect, it } from "vitest";
// Register both content packages so the registry is populated.
import "@/data/anime/field-overrides";
import "@/data/wog/field-overrides";
import {
  allFieldOverrideDefinitions,
  getFieldOverrideDefinition,
  listFieldOverrideDefinitions
} from "./field-overrides";
import {
  fieldOverrideDefinitionForLocation,
  fieldOverridePackageTag,
  fieldOverridePresentation,
  fieldOverrideTooltipClause
} from "./field-override-presentation";

describe("fieldOverridePresentation — every registered kind resolves", () => {
  it("resolves name + summary + mod tag for EVERY registered override kind (by kind AND by location id)", () => {
    const defs = allFieldOverrideDefinitions();
    // We ship 7 WOG + 13 anime kinds; assert the loop actually covers a real set,
    // not an empty one (a broken import would silently pass an empty loop).
    expect(defs.length).toBeGreaterThanOrEqual(20);
    for (const def of defs) {
      // By kind id.
      const byKind = fieldOverridePresentation(def.id);
      expect(byKind, `no presentation for kind ${def.id}`).not.toBeNull();
      expect(byKind!.name.trim().length, def.id).toBeGreaterThan(0);
      expect(byKind!.summary.trim().length, `${def.id} summary`).toBeGreaterThan(0);
      expect(byKind!.packageTag.trim().length, `${def.id} tag`).toBeGreaterThan(0);
      expect(byKind!.name).toBe(def.name);
      expect(byKind!.summary).toBe(def.summary);

      // By carved location id — the board passes field.location straight through.
      const byLocation = fieldOverridePresentation(def.locationId);
      expect(byLocation, `no presentation for location ${def.locationId}`).not.toBeNull();
      expect(byLocation!.summary).toBe(def.summary);

      // The tooltip clause carries the summary verbatim.
      const clause = fieldOverrideTooltipClause(def.locationId);
      expect(clause).toContain(def.summary);
    }
  });

  it("returns null / empty for a non-override location (CONTROL)", () => {
    expect(fieldOverridePresentation("empty_field")).toBeNull();
    expect(fieldOverridePresentation("mine")).toBeNull();
    expect(fieldOverridePresentation("town")).toBeNull();
    expect(fieldOverrideTooltipClause("empty_field")).toBe("");
    expect(fieldOverrideDefinitionForLocation("empty_field")).toBeUndefined();
  });

  it("resolves a definition by kind id AND by carved location id", () => {
    const bi = getFieldOverrideDefinition("bi_canh")!;
    expect(fieldOverrideDefinitionForLocation("bi_canh")?.id).toBe("bi_canh");
    expect(fieldOverrideDefinitionForLocation(bi.locationId)?.id).toBe("bi_canh");
    // WOG kind resolves too (both packages register).
    expect(fieldOverrideDefinitionForLocation("wog.emerald_tower")?.id).toBe("emerald_tower");
  });

  it("maps each package to a readable mod tag", () => {
    expect(fieldOverridePackageTag("wog")).toBe("WOG");
    expect(fieldOverridePackageTag("anime-xianxia")).toContain("Xianxia");
    expect(fieldOverridePackageTag("anime-isekai")).toContain("Isekai");
    // A WOG override reports the WOG tag; an anime one an Anime tag (spot check).
    expect(fieldOverridePresentation("wog.junk_merchant")!.packageTag).toBe("WOG");
    expect(fieldOverridePresentation("anime.bi_canh")!.packageTag).toContain("Anime");
  });

  it("the equipment-gated outfitters still resolve a presentation (listing gate is separate)", () => {
    // requiresModule only affects pool/palette listing — the presentation seam
    // (tooltip/inspect) must still describe a carved outfitter hex.
    expect(fieldOverridePresentation("anime.ren_binh_cac")).not.toBeNull();
    expect(fieldOverridePresentation("anime.adventurer_outfitter")).not.toBeNull();
    // And they ARE registered kinds (sanity: the listing without a module gate
    // excludes them, but the registry still knows them).
    expect(getFieldOverrideDefinition("ren_binh_cac")).toBeTruthy();
    const ungated = listFieldOverrideDefinitions({}).map((d) => d.id);
    expect(ungated).not.toContain("ren_binh_cac");
  });
});
