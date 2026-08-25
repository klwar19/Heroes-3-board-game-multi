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
  fieldOverrideTooltipClause,
  mapObjectPresentation,
  pveSitePresentation
} from "./field-override-presentation";

describe("fieldOverridePresentation — every registered kind resolves", () => {
  it("resolves name + summary + mod tag for EVERY registered override kind (by kind AND by location id)", () => {
    const defs = allFieldOverrideDefinitions();
    // We ship 7 WOG + 17 anime kinds; assert the loop actually covers a real set,
    // not an empty one (a broken import would silently pass an empty loop).
    expect(defs.length).toBeGreaterThanOrEqual(24);
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

  it("the three PvE-module sites (Calamity Gate / Rift Lair / The Dungeon) get a description card too", () => {
    // User report 2026-08-19: "Dungeon: shows no description at all". These are
    // NOT Field Overrides, so the override seam alone left them blank.
    for (const [locationId, name] of [
      ["calamity_gate", "Calamity Gate"],
      ["rift_lair", "Rift Lair"],
      ["dungeon_gate", "The Dungeon"]
    ] as const) {
      const info = pveSitePresentation(locationId);
      expect(info, locationId).not.toBeNull();
      expect(info!.name).toBe(name);
      expect(info!.summary.trim().length, `${locationId} summary`).toBeGreaterThan(40);
      expect(info!.packageTag).toBe("PvE module");
      // Theme-aware painted art, matching pveThemeFieldArt's path scheme.
      expect(info!.image).toBe(`/assets/bosses/${locationId}_classic.webp`);
      expect(pveSitePresentation(locationId, "doom")!.image).toBe(
        `/assets/bosses/${locationId}_doom.webp`
      );
      // The combined seam (what the board tooltip + inspect float read) serves it.
      expect(mapObjectPresentation(locationId)?.summary).toBe(info!.summary);
    }
    // The Dungeon summary explains the actual loop (rooms, floor guard, descent).
    expect(pveSitePresentation("dungeon_gate")!.summary).toMatch(/two rooms/i);
    expect(pveSitePresentation("dungeon_gate")!.summary).toMatch(/floor/i);
  });

  it("PvE sites vs the override registry (CONTROL — the board's border pass reads fieldOverridePresentation as 'is an override hex')", () => {
    expect(fieldOverridePresentation("calamity_gate")).toBeNull();
    expect(fieldOverridePresentation("rift_lair")).toBeNull();
    // KNOWN COLLISION: the isekai WAGER override's kind id is also
    // "dungeon_gate" (carved hexes are "anime.dungeon_gate"), so the bare
    // string resolves by kind here. That is exactly why mapObjectPresentation
    // consults the PvE table FIRST — the module's Dungeon hex must show the
    // module summary, never the wager site's.
    expect(fieldOverridePresentation("dungeon_gate")?.name).toBe("Dungeon Gate");
    expect(mapObjectPresentation("dungeon_gate")?.name).toBe("The Dungeon");
    // The wager site's own carved hexes keep their own summary.
    expect(mapObjectPresentation("anime.dungeon_gate")?.name).toBe("Dungeon Gate");
    // And plain locations stay null through the combined seam too.
    expect(pveSitePresentation("empty_field")).toBeNull();
    expect(mapObjectPresentation("mine")).toBeNull();
    // The combined seam still resolves real overrides.
    expect(mapObjectPresentation("wog.junk_merchant")?.packageTag).toBe("WOG");
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
