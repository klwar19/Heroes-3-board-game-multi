/**
 * Wake of Gods adventure-map object CONTENT (`wog.newObjects`).
 *
 * The Field Override *mechanism* is global (`src/data/map/field-overrides.ts` +
 * `src/engine/field-overrides.ts`). This file only registers the three WoG
 * single-hex objects into that catalog, mirroring the Anime content package
 * (`src/data/anime/field-overrides.ts`).
 *
 * These are board-ADAPTED readings of three real WoG scripted objects — the
 * printed `summary` states EXACTLY what the engine runs (CLAUDE.md §1/§2). The
 * per-object simplifications are named in `src/data/wog/locations.ts` and in the
 * CLAUDE.md "WOG New Objects" bullet: WoG's Emerald Tower enchanted creatures
 * (here it trains the WOG commander instead), the Mirror of the Home-Way's full
 * Town-Portal price table (here a flat 2-gold Town teleport), and the Junk
 * Merchant's 32-artifact trade table (here tier-priced sells + a 4-gold search).
 *
 * ART: all three ship with real hex art on disk
 * (`public/assets/wog/field-overrides/<slug>.webp`, 512×512) — no glyph
 * placeholder registry needed (art wins over glyph, pinned in
 * `field-overrides.test.ts`).
 */

import {
  registerFieldOverrideDefinitions,
  type FieldOverrideDefinition
} from "@/data/map/field-overrides";

const art = (slug: string) => `/assets/wog/field-overrides/${slug}.webp`;

/**
 * The three WoG override kinds. Every kind is package `"wog"`: it joins pool
 * draws / the designer palette ONLY when `wog.enabled && wog.newObjects` (the
 * package gate in `fieldOverridePackageAllowed`), and a designer pin of a wog
 * kind auto-enables the module at setup (`customMapHasWogFieldOverridePins`).
 */
export const WOG_FIELD_OVERRIDE_DEFINITIONS: Record<string, FieldOverrideDefinition> = {
  /**
   * Emerald Tower — WoG's commander-training tower (board-adapted). Guarded
   * (difficulty 3); after the win the visit opens a City-Hall-style CHOOSE_ONE:
   * pay 3 gold for a commander stat point (only with the Commanders module on
   * and a commander), pay 2 gold for +1 hero experience, or leave. Menu built
   * dynamically in `beginFieldVisit` (context-filtered arms).
   */
  emerald_tower: {
    id: "emerald_tower",
    locationId: "wog.emerald_tower",
    name: "Emerald Tower",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    guard: 3,
    implementationStatus: "implemented",
    summary:
      "Guarded (Ⅲ). After the win: pay 3 gold for +1 commander stat point (Commanders module only), or 2 gold for +1 hero experience.",
    image: art("emerald_tower")
  },

  /**
   * Mirror of the Home-Way — WoG's Town-Portal-for-a-price object (board-
   * adapted). Visit: pay 2 gold to teleport the hero to one of your Towns /
   * Settlements (the visitor picks when several are reachable), else leave. The
   * teleport reuses the Town-Portal `TELEPORT_HERO` destination machinery. With
   * no reachable Town the pay arm is absent.
   */
  mirror_home_way: {
    id: "mirror_home_way",
    locationId: "wog.mirror_home_way",
    name: "Mirror of the Home-Way",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Pay 2 gold: teleport your Hero to one of your Towns or Settlements (Town-Portal style).",
    image: art("mirror_home_way")
  },

  /**
   * Junk Merchant — WoG's weak-artifact buyer (board-adapted). Visit: sell one
   * Artifact card from your hand for tier-priced gold (minor 2 / major 3 /
   * relic 4), or pay 4 gold to Search (1) the Artifact deck, or leave. Sold
   * cards leave the game (Trading-Post sell semantics). The sell arm is absent
   * with no Artifact in hand.
   */
  junk_merchant: {
    id: "junk_merchant",
    locationId: "wog.junk_merchant",
    name: "Junk Merchant",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Sell a hand Artifact for gold by tier (minor 2 / major 3 / relic 4), or pay 4 gold to Search (1) the Artifact deck.",
    image: art("junk_merchant")
  }
};

/** Every wog override kind id (pool/palette membership + tests). */
export const WOG_FIELD_OVERRIDE_KIND_IDS: readonly string[] = Object.keys(
  WOG_FIELD_OVERRIDE_DEFINITIONS
);

/** The location ids the three kinds carve (dynamic-menu gate in beginFieldVisit). */
export const WOG_FIELD_OVERRIDE_LOCATION_IDS: ReadonlySet<string> = new Set(
  Object.values(WOG_FIELD_OVERRIDE_DEFINITIONS).map((def) => def.locationId)
);

// Register into the global catalog at module load.
registerFieldOverrideDefinitions(WOG_FIELD_OVERRIDE_DEFINITIONS);
