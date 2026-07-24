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
