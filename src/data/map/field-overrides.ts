/**
 * Field Override — GLOBAL single-hex replacement system.
 *
 * The mechanism (designer pin, pool on tile reveal, placement modes, carve)
 * is core engine, not an anime-mod feature. Content packages (Anime/Ninefold,
 * future mods, optional core kinds) REGISTER override kinds into this catalog.
 *
 * See docs/anime-mod-plan.md §3.10 (mechanism) — content packages only own
 * their object rows.
 */

/** Tile groups that may host an override (matches MapTileState.group). */
export type FieldOverrideTileGroup =
  | "starting"
  | "far"
  | "near"
  | "center"
  | "sea"
  | "subterranean";

/**
 * Which content package owns this kind. `"core"` needs no mod toggle.
 * `"anime-xianxia"` / `"anime-isekai"` join the pool when the Anime mod is on
 * (and designer pins of those kinds auto-enable the mod at map setup).
 */
export type FieldOverridePackage = "core" | "anime-xianxia" | "anime-isekai" | "shared";

export type FieldOverrideDefinition = {
  id: string;
  /** Location id written onto the field (must exist in locationDefinitions). */
  locationId: string;
  name: string;
  /** Optional secondary flavor label (e.g. Vietnamese). */
  nameVi?: string;
  package: FieldOverridePackage;
  tileGroups: FieldOverrideTileGroup[];
  terrain: "land" | "water" | "any";
  /** Optional neutral guard difficulty (1–7) stamped on carve. */
  guard?: number;
  implementationStatus: "implemented" | "not-implemented";
  summary: string;
  /**
   * Hex field art path under /public (assetUrl). When set, the board and
   * designer render it like a Creature Bank / Monolith token.
   */
  image?: string;
};

/** Mutable registry — packages call {@link registerFieldOverrideDefinitions}. */
const REGISTRY: Record<string, FieldOverrideDefinition> = {};

export function registerFieldOverrideDefinitions(
  defs: Record<string, FieldOverrideDefinition> | FieldOverrideDefinition[]
): void {
  const list = Array.isArray(defs) ? defs : Object.values(defs);
  for (const def of list) {
    REGISTRY[def.id] = def;
  }
}

export function getFieldOverrideDefinition(kind: string): FieldOverrideDefinition | undefined {
  return REGISTRY[kind];
}

export function allFieldOverrideDefinitions(): FieldOverrideDefinition[] {
  return Object.values(REGISTRY);
}

export function listFieldOverrideDefinitions(filter?: {
  package?: FieldOverridePackage | FieldOverridePackage[];
  tileGroup?: FieldOverrideTileGroup;
  implementedOnly?: boolean;
  /** When set, only kinds whose package is allowed by this predicate. */
  packageAllowed?: (pkg: FieldOverridePackage) => boolean;
}): FieldOverrideDefinition[] {
  const packages = filter?.package
    ? Array.isArray(filter.package)
      ? filter.package
      : [filter.package]
    : null;
  return Object.values(REGISTRY).filter((def) => {
    if (filter?.implementedOnly && def.implementationStatus !== "implemented") {
      return false;
    }
    if (packages && !packages.includes(def.package) && def.package !== "shared") {
      return false;
    }
    if (filter?.packageAllowed && !filter.packageAllowed(def.package)) {
      return false;
    }
    if (filter?.tileGroup && !def.tileGroups.includes(filter.tileGroup)) {
      return false;
    }
    return true;
  });
}

export function isFieldOverrideKind(kind: string): boolean {
  return kind in REGISTRY;
}

/**
 * Whether a location id is one a Field Override carves (any registered kind's
 * locationId). Carved override hexes are protected like Location Tokens: no
 * token, gate or second override may overwrite one.
 */
export function isFieldOverrideLocation(locationId: string): boolean {
  return Object.values(REGISTRY).some((def) => def.locationId === locationId);
}

/** All registered kind ids (grows as packages register). */
export function fieldOverrideKindIds(): ReadonlySet<string> {
  return new Set(Object.keys(REGISTRY));
}

/** Hex art for a kind or location id, if any. */
export function fieldOverrideImage(kindOrLocationId: string): string | undefined {
  const byKind = REGISTRY[kindOrLocationId];
  if (byKind?.image) {
    return byKind.image;
  }
  for (const def of Object.values(REGISTRY)) {
    if (def.locationId === kindOrLocationId && def.image) {
      return def.image;
    }
  }
  return undefined;
}

/**
 * Whether a package is available given active mods.
 * Core/shared always; anime packages need anime.enabled.
 */
export function fieldOverridePackageAllowed(
  pkg: FieldOverridePackage,
  mods: { animeEnabled?: boolean }
): boolean {
  if (pkg === "core" || pkg === "shared") {
    return true;
  }
  if (pkg === "anime-xianxia" || pkg === "anime-isekai") {
    return Boolean(mods.animeEnabled);
  }
  return false;
}

/** True when this kind belongs to the Anime mod content package. */
export function fieldOverrideKindRequiresAnime(kind: string): boolean {
  const def = REGISTRY[kind];
  return def?.package === "anime-xianxia" || def?.package === "anime-isekai";
}

/** Scan tile plans for any field-override pin (enables the global feature). */
export function customMapHasFieldOverridePins(
  plans:
    | ReadonlyArray<{
        fieldOverride?: { kind: string } | null | undefined;
        fieldOverrides?: Array<{ kind: string } | null | undefined> | null | undefined;
      }>
    | null
    | undefined
): boolean {
  return Boolean(
    plans?.some(
      (plan) =>
        Boolean(plan.fieldOverride?.kind) ||
        Boolean(plan.fieldOverrides?.some((o) => o?.kind))
    )
  );
}

/** Scan tile plans for anime-package override pins (auto-enable Anime mod). */
export function customMapHasAnimeFieldOverridePins(
  plans:
    | ReadonlyArray<{
        fieldOverride?: { kind: string } | null | undefined;
        fieldOverrides?: Array<{ kind: string } | null | undefined> | null | undefined;
      }>
    | null
    | undefined
): boolean {
  return Boolean(
    plans?.some((plan) => {
      if (plan.fieldOverride?.kind && fieldOverrideKindRequiresAnime(plan.fieldOverride.kind)) {
        return true;
      }
      return Boolean(
        plan.fieldOverrides?.some((o) => o?.kind && fieldOverrideKindRequiresAnime(o.kind))
      );
    })
  );
}
