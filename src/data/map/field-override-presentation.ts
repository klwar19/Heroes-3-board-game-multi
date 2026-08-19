/**
 * Field Override PRESENTATION helpers (pure, data-driven).
 *
 * The board tooltip + click-to-inspect float read a single seam here so EVERY
 * registered override kind (WOG + anime, present and future) tells the player
 * what visiting the hex does — its `name` and printed `summary` (which, per
 * CLAUDE.md §2, states exactly the wired effect) — with no per-kind hand-written
 * clause in the render layer.
 *
 * A field carries the carved `locationId` (e.g. "anime.bi_canh" / "wog.emerald_tower"),
 * while the registry is keyed by `kind` id. Every function here accepts EITHER
 * so the board can pass `field.location` straight through.
 */

import {
  allFieldOverrideDefinitions,
  getFieldOverrideDefinition,
  type FieldOverrideDefinition,
  type FieldOverridePackage
} from "./field-overrides";

/** Resolve a field-override definition by kind id OR carved location id. */
export function fieldOverrideDefinitionForLocation(
  kindOrLocationId: string
): FieldOverrideDefinition | undefined {
  const byKind = getFieldOverrideDefinition(kindOrLocationId);
  if (byKind) {
    return byKind;
  }
  return allFieldOverrideDefinitions().find((def) => def.locationId === kindOrLocationId);
}

/** Short mod tag for the inspect float (WOG / Anime · Xianxia / …). */
export function fieldOverridePackageTag(pkg: FieldOverridePackage): string {
  switch (pkg) {
    case "wog":
      return "WOG";
    case "anime-xianxia":
      return "Anime · Xianxia";
    case "anime-isekai":
      return "Anime · Isekai";
    case "shared":
      return "Shared";
    case "core":
    default:
      return "Core";
  }
}

export type FieldOverridePresentation = {
  def: FieldOverrideDefinition;
  /** Display name (== the carved location's name). */
  name: string;
  /** What visiting does — the registry `summary` (never empty). */
  summary: string;
  /** Short mod tag, e.g. "WOG" / "Anime · Xianxia". */
  packageTag: string;
  /** Raw registry glyph, if any — shown as a corner badge EVEN when art exists. */
  glyph?: string;
  /** Hex art path, if any. */
  image?: string;
};

/**
 * Presentation bundle for a carved / pinned override hex, resolved by carved
 * location id OR kind. Returns null for a non-override location — the single
 * seam the board tooltip + inspect float read, so a new kind is covered
 * automatically (data-driven from the registry, never a per-kind clause).
 */
export function fieldOverridePresentation(
  kindOrLocationId: string
): FieldOverridePresentation | null {
  const def = fieldOverrideDefinitionForLocation(kindOrLocationId);
  if (!def) {
    return null;
  }
  return {
    def,
    name: def.name,
    summary: def.summary,
    packageTag: fieldOverridePackageTag(def.package),
    glyph: def.glyph,
    image: def.image
  };
}

/**
 * Hover-tooltip clause for a hex title. Returns " — <summary>" for an override
 * location (the name is already printed by the caller), else "" for a non-override.
 */
export function fieldOverrideTooltipClause(kindOrLocationId: string): string {
  const info = fieldOverridePresentation(kindOrLocationId);
  return info ? ` — ${info.summary}` : "";
}

/**
 * The three PvE-module map sites (Calamity Gate / Rift Lair / The Dungeon) are
 * NOT Field Overrides, so the tooltip + inspect seam above returned null for
 * them and the map showed NO description at all — "hard to understand" (user
 * report 2026-08-19). Each summary states exactly what the engine runs
 * (monster-waves.ts / raid-bosses.ts / dungeon.ts; the numeric constants are
 * pinned by those modules' tests).
 *
 * Deliberately a SEPARATE lookup from `fieldOverridePresentation`: the board's
 * border-suppression pass uses that function as "is an override hex", and a
 * Rift Lair (a converted guard field) must KEEP its printed borders.
 */
export type PveSitePresentation = {
  name: string;
  summary: string;
  packageTag: string;
  glyph?: string;
  /** Theme-aware painted map-object art (classic / doom). */
  image?: string;
};

const PVE_SITE_INFO: Record<string, { name: string; summary: string; glyph: string; artKind?: string }> = {
  calamity_gate: {
    name: "Calamity Gate",
    glyph: "🌋",
    summary:
      "The source of the monster waves. Visit it (revisit for 1 movement) to PREPARE: the next numbered wave's battle event is neutralized for YOU alone — each player must scout it themselves, once per wave."
  },
  rift_lair: {
    name: "Rift Lair",
    glyph: "👹",
    summary:
      "A Raid Boss lairs here — its health bars are whole army stacks, and wounds PERSIST between attempts. Each bar you break pays 2 gold; the kill pays 5 gold plus a relic Artifact search and clears the lair. Left alone, the boss regrows one bar every 4th round."
  },
  dungeon_gate: {
    name: "The Dungeon",
    glyph: "🗝",
    summary:
      "A repeatable delve, personal floor progress. Each visit: pick one of two rooms (its boon — treasure, shrine, story… — resolves first), then fight the floor guard at real difficulty (floor + 1, capped at 7; floors 5 and 10 hold layered bosses). A win pays the floor's reward ladder and takes you one floor deeper — chaining straight on costs the configured descent movement; a loss costs nothing but the wounds."
  }
};

/**
 * Presentation for a PvE-module site hex, or null for anything else. `theme`
 * picks the classic/doom painted art (matching `pveThemeFieldArt`).
 */
export function pveSitePresentation(
  locationId: string,
  theme?: "classic" | "doom"
): PveSitePresentation | null {
  const info = PVE_SITE_INFO[locationId];
  if (!info) {
    return null;
  }
  return {
    name: info.name,
    summary: info.summary,
    packageTag: "PvE module",
    glyph: info.glyph,
    image: `/assets/bosses/${locationId}_${theme === "doom" ? "doom" : "classic"}.webp`
  };
}

/**
 * ONE read for "does this hex have an explain-what-it-does card?": a PvE-module
 * site's presentation, else a Field Override's registry presentation. This is
 * the seam the board tooltip + click-to-inspect float use — NEVER the border
 * pass.
 *
 * The PvE table is consulted FIRST on purpose: the isekai WAGER override's
 * kind id is also "dungeon_gate" (its CARVED hexes are "anime.dungeon_gate",
 * but `fieldOverridePresentation` falls back to a by-kind match on the bare
 * string), so the module's Dungeon hex used to pick up the wager site's
 * summary — actively wrong information on the board.
 */
export function mapObjectPresentation(
  kindOrLocationId: string,
  theme?: "classic" | "doom"
): (Omit<FieldOverridePresentation, "def"> & { def?: FieldOverrideDefinition }) | null {
  return pveSitePresentation(kindOrLocationId, theme) ?? fieldOverridePresentation(kindOrLocationId);
}
