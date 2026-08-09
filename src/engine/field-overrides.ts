/**
 * Field Override engine — GLOBAL single-hex replacements with real location
 * mechanics. Content packages (Anime/Ninefold, …) only register kinds; this
 * module owns placement, carve, and reveal order.
 *
 * Sibling of Monolith/Whirlpool/Gate Location Tokens — not a second teleporter
 * system. On tile reveal, overrides place BEFORE subterranean gates, creature
 * banks, and teleport tokens so those systems never fight over the same hex.
 */

import { allTileDefinitions } from "@/data/map/tiles";
import { locationDefinitions } from "@/data/map/locations";
// Side-effect: register Anime package kinds into the global catalog.
import "@/data/anime/field-overrides";
// Side-effect: register Wake of Gods (wog.newObjects) package kinds too.
import "@/data/wog/field-overrides";
import {
  customMapHasFieldOverridePins,
  fieldOverridePackageAllowed,
  getFieldOverrideDefinition,
  isFieldOverrideKind,
  isFieldOverrideLocation,
  listFieldOverrideDefinitions,
  type FieldOverrideDefinition,
  type FieldOverrideTileGroup
} from "@/data/map/field-overrides";
import { HEX_DIRECTIONS, hexEquals, hexNeighbor, parseHexSpaceId } from "./hex";
import type {
  AdventureState,
  AnimeModOptions,
  CustomMapTilePlan,
  FieldOverridePlacementMode,
  GameSetupOptions,
  GameState,
  MapFieldState,
  MapSpaceId,
  MapTileState
} from "./state";
import { animeEnabled, animeModuleEnabled } from "./anime";
import { getTileFootprintSpaceIds } from "./adventure";
import { appendEvent } from "./events";
import { planFieldOverrides } from "./tile-hex-placements";

export type TileGroup = FieldOverrideTileGroup;

export const DEFAULT_FIELD_OVERRIDE_PLACEMENT: FieldOverridePlacementMode = "manual-or-refuse";

/** Locations a Field Override may never overwrite (mirrors Location Token safety). */
const OVERRIDE_FORBIDDEN_LOCATIONS = new Set([
  "settlement",
  "mine",
  "grail",
  "obelisk",
  "dragon_utopia",
  "subterranean_gate",
  "creature_bank",
  "monolith",
  "whirlpool",
  "gate",
  "town",
  "random_town",
  "blocked_field"
]);

export { isFieldOverrideKind, getFieldOverrideDefinition, listFieldOverrideDefinitions };
export {
  customMapHasFieldOverridePins,
  customMapHasAnimeFieldOverridePins,
  customMapHasWogFieldOverridePins,
  fieldOverrideKindRequiresAnime,
  fieldOverrideKindRequiresWog
} from "@/data/map/field-overrides";

/** Global feature gate — frozen on adventure or live on setup options / state. */
export function fieldOverridesEnabled(
  state:
    | Pick<GameState, "adventure" | "anime">
    | { adventure?: { fieldOverrides?: boolean } | null; anime?: unknown }
    | null
    | undefined
): boolean {
  return Boolean(state?.adventure?.fieldOverrides);
}

export function fieldOverridePlacementMode(
  state:
    | Pick<GameState, "adventure">
    | { adventure?: { fieldOverridePlacement?: FieldOverridePlacementMode } | null }
    | null
    | undefined
): FieldOverridePlacementMode {
  return state?.adventure?.fieldOverridePlacement ?? DEFAULT_FIELD_OVERRIDE_PLACEMENT;
}

/**
 * Resolve whether Field Overrides should run for this game:
 * - explicit setup option, OR
 * - designer pins on the custom map (auto-ON).
 */
export function resolveFieldOverridesEnabled(
  options: Pick<GameSetupOptions, "fieldOverrides" | "customMap"> | null | undefined
): boolean {
  if (options?.fieldOverrides === true) {
    return true;
  }
  if (options?.fieldOverrides === false) {
    // Still auto-on when the map has pins — a designed map must not lose content.
    return customMapHasFieldOverridePins(options.customMap);
  }
  return customMapHasFieldOverridePins(options?.customMap);
}

export function resolveFieldOverridePlacement(
  options: Pick<GameSetupOptions, "fieldOverridePlacement"> | null | undefined
): FieldOverridePlacementMode {
  return options?.fieldOverridePlacement ?? DEFAULT_FIELD_OVERRIDE_PLACEMENT;
}

/**
 * A map-objects CONTENT module — the Wake of Gods "New Objects" package
 * (`wog.enabled && wog.newObjects`) or the Anime "Map objects" package
 * (`anime.enabled && anime.mapObjects !== false`, absent === ON for
 * legacy/campaign) — requires the GLOBAL Field Override mechanism to place its
 * hexes. True when either package is active in the given options; callers force
 * `fieldOverrides` ON when this holds (the `setGameOptions` chokepoint AND the
 * game-build backstop). The anime gate mirrors `fieldOverridePackageAllowed`
 * verbatim so the "is content legal in the pool" and "is FO forced on"
 * questions can never diverge.
 */
export function mapObjectsModuleActive(
  options:
    | {
        wog?: { enabled?: boolean; newObjects?: boolean } | null;
        anime?: { enabled?: boolean; mapObjects?: boolean } | null;
      }
    | null
    | undefined
): boolean {
  const wog = options?.wog;
  const wogObjectsOn = Boolean(wog?.enabled) && Boolean(wog?.newObjects);
  const anime = options?.anime;
  const animeObjectsOn = Boolean(anime?.enabled) && anime?.mapObjects !== false;
  return wogObjectsOn || animeObjectsOn;
}

export function fieldOverrideLabel(kind: string): string {
  return getFieldOverrideDefinition(kind)?.name ?? kind;
}

function modsFromState(
  state:
    | Pick<GameState, "anime" | "wog">
    | { anime?: { enabled?: boolean }; wog?: { enabled?: boolean; newObjects?: boolean } }
    | null
    | undefined
) {
  return {
    animeEnabled: animeEnabled(state as never),
    // Anime `mapObjects` module gate (absent === ON): reported alongside so
    // `fieldOverridePackageAllowed` can drop anime FO content when it is
    // explicitly unticked in the lobby.
    animeMapObjects: (state?.anime as { mapObjects?: boolean } | undefined)?.mapObjects,
    // Wake of Gods object package: gated on `wog.enabled && wog.newObjects`.
    wogNewObjects: Boolean(state?.wog?.enabled && state.wog.newObjects)
  };
}

function packageAllowedForState(
  state:
    | Pick<GameState, "anime" | "wog">
    | { anime?: { enabled?: boolean }; wog?: { enabled?: boolean; newObjects?: boolean } }
    | null
    | undefined
) {
  const mods = modsFromState(state);
  return (pkg: FieldOverrideDefinition["package"]) => fieldOverridePackageAllowed(pkg, mods);
}

/**
 * Module gate for the pool builds (§3.13): a kind carrying `requiresModule`
 * (e.g. the equipment outfitters) joins the pool only when that anime module is
 * on. With `anime.equipment` off the outfitters appear in no pool draw.
 */
function moduleEnabledForState(state: Pick<GameState, "anime">) {
  return (module: keyof AnimeModOptions): boolean =>
    module !== "enabled" &&
    module !== "waveCadence" &&
    module !== "pveTheme" &&
    module !== "wavePressure" &&
    module !== "waveDefeatLimit" &&
    module !== "raidBossSpawnRound" &&
    module !== "dungeonDepth" &&
    module !== "dungeonDescentCost" &&
    animeModuleEnabled(state, module);
}

/**
 * Whether a tile-DEFINITION field may host this override kind: legal location,
 * matching terrain, tile group allowed, no guard already printed.
 */
export function fieldOverrideMayCoverFieldDef(
  def: (typeof allTileDefinitions)[string],
  slot: number,
  overrideDef: FieldOverrideDefinition,
  tileGroup: TileGroup
): boolean {
  if (!overrideDef.tileGroups.includes(tileGroup)) {
    return false;
  }
  const fieldDef = def.fields[slot];
  if (!fieldDef) {
    return false;
  }
  const location = locationDefinitions[fieldDef.location];
  if (!location || location.category === "blocked" || location.category === "town") {
    return false;
  }
  if (
    OVERRIDE_FORBIDDEN_LOCATIONS.has(fieldDef.location) ||
    isFieldOverrideLocation(fieldDef.location) ||
    fieldDef.difficulty
  ) {
    return false;
  }
  const isWater = fieldDef.terrain ? fieldDef.terrain === "water" : def.terrain === "water";
  if (overrideDef.terrain === "land" && isWater) {
    return false;
  }
  if (overrideDef.terrain === "water" && !isWater) {
    return false;
  }
  return true;
}

/** Live-field legality after the tile is revealed. */
export function fieldOverrideMayCoverField(
  state: GameState,
  spaceId: MapSpaceId,
  overrideDef: FieldOverrideDefinition
): boolean {
  const adventure = state.adventure;
  const field = adventure?.fields[spaceId];
  if (!adventure || !field) {
    return false;
  }
  const tile = adventure.tiles[field.tileInstanceId];
  if (!tile || tile.faceDown || tile.awaitingRotation) {
    return false;
  }
  const group = (tile.group ?? "far") as TileGroup;
  if (!overrideDef.tileGroups.includes(group)) {
    return false;
  }
  const location = locationDefinitions[field.location];
  if (!location || location.category === "blocked" || location.category === "town") {
    return false;
  }
  // A carved override hex is protected like a Location Token: a later override
  // (multi-pin queue, pool draw) must pick a DIFFERENT hex, never stack.
  if (
    OVERRIDE_FORBIDDEN_LOCATIONS.has(field.location) ||
    isFieldOverrideLocation(field.location) ||
    field.difficulty
  ) {
    return false;
  }
  if (field.bankId || field.location === "creature_bank") {
    return false;
  }
  const isWater = field.terrain === "water";
  if (overrideDef.terrain === "land" && isWater) {
    return false;
  }
  if (overrideDef.terrain === "water" && !isWater) {
    return false;
  }
  for (const hero of Object.values(state.heroes ?? {})) {
    if (hero.spaceId === spaceId) {
      return false;
    }
  }
  return true;
}

/**
 * Single chokepoint carve — mirrors `carveMapTokenField` so no leftover bank /
 * gate / cube / flag state can produce weird behaviour.
 */
export function carveFieldOverride(
  adventure: AdventureState,
  spaceId: MapSpaceId,
  kind: string
): MapFieldState | null {
  const overrideDef = getFieldOverrideDefinition(kind);
  if (!overrideDef || overrideDef.implementationStatus !== "implemented") {
    return null;
  }
  const field = adventure.fields[spaceId];
  if (!field) {
    return null;
  }
  field.location = overrideDef.locationId;
  delete field.resource;
  delete field.amount;
  delete field.faction;
  field.blackCube = false;
  field.flagOwnerId = null;
  delete field.extraFlagOwnerIds;
  field.everFlagged = false;
  field.settlementResource = null;
  delete field.grailDiggable;
  // The field is no longer a converted Ⅶ objective at all — drop its origin
  // marker with the rest of the old identity.
  delete field.grailConverted;
  delete field.gateToTileId;
  delete field.gateLinkSpaceId;
  delete field.bankId;
  delete field.bankSize;
  delete field.whirlpoolNumber;
  delete field.gatePair;
  if (overrideDef.terrain === "water") {
    field.terrain = "water";
  } else {
    delete field.terrain;
  }
  if (overrideDef.guard && overrideDef.guard >= 1 && overrideDef.guard <= 7) {
    field.difficulty = overrideDef.guard;
  } else {
    delete field.difficulty;
  }
  return field;
}

export function fieldOverridePlacementCandidates(
  state: GameState,
  tile: MapTileState,
  kind: string
): MapSpaceId[] {
  const overrideDef = getFieldOverrideDefinition(kind);
  if (!overrideDef) {
    return [];
  }
  return getTileFootprintSpaceIds(tile).filter((spaceId) =>
    fieldOverrideMayCoverField(state, spaceId, overrideDef)
  );
}

/**
 * Apply designer-pinned field overrides at adventure build.
 * Multiple pins per tile allowed on different slots. Face-up → carve now;
 * face-down → pendingFieldOverrides queue with preferred hexes.
 */
export function applyCustomMapFieldOverrides(
  adventure: AdventureState,
  planned: { plan: CustomMapTilePlan; tile: MapTileState }[],
  options: { enabled: boolean }
): string[] {
  const problems: string[] = [];
  if (!options.enabled) {
    for (const { plan } of planned) {
      for (const pin of planFieldOverrides(plan)) {
        problems.push(
          `Field Override "${pin.kind}" on tile at ${plan.row},${plan.col} was dropped — fieldOverrides is off.`
        );
      }
    }
    return problems;
  }

  for (const { plan, tile } of planned) {
    const pins = planFieldOverrides(plan);
    if (pins.length === 0) {
      continue;
    }
    const pendingList: NonNullable<MapTileState["pendingFieldOverrides"]> = [];
    for (const pin of pins) {
      const overrideDef = getFieldOverrideDefinition(pin.kind);
      if (!overrideDef || !isFieldOverrideKind(pin.kind)) {
        problems.push(`Unknown Field Override kind "${pin.kind}" at ${plan.row},${plan.col} — dropped.`);
        continue;
      }
      if (overrideDef.implementationStatus !== "implemented") {
        problems.push(`Field Override "${pin.kind}" is not implemented — dropped.`);
        continue;
      }
      const group = (plan.group ?? tile.group ?? "far") as TileGroup;
      if (!overrideDef.tileGroups.includes(group)) {
        problems.push(
          `Field Override "${pin.kind}" cannot host on a ${group} tile at ${plan.row},${plan.col} — dropped.`
        );
        continue;
      }

      if (tile.faceDown) {
        const preferredSpaceId =
          pin.slot !== undefined ? getTileFootprintSpaceIds(tile)[pin.slot] : undefined;
        pendingList.push({
          kind: pin.kind,
          fromPool: false,
          ...(preferredSpaceId ? { preferredSpaceId } : {})
        });
        continue;
      }

      const def = allTileDefinitions[tile.tileDefId];
      const slot = pin.slot;
      if (!def || slot === undefined || !fieldOverrideMayCoverFieldDef(def, slot, overrideDef, group)) {
        problems.push(
          `Field Override "${pin.kind}" slot ${slot ?? "?"} on ${tile.tileDefId} is illegal — dropped.`
        );
        continue;
      }
      const spaceId = getTileFootprintSpaceIds(tile)[slot];
      if (!spaceId || adventure.fields[spaceId]?.tileInstanceId !== tile.id) {
        problems.push(`Field Override "${pin.kind}" could not resolve hex at ${plan.row},${plan.col} — dropped.`);
        continue;
      }
      const existing = adventure.fields[spaceId];
      if (
        existing &&
        (existing.location === "monolith" ||
          existing.location === "whirlpool" ||
          existing.location === "gate" ||
          isFieldOverrideLocation(existing.location))
      ) {
        problems.push(
          `Field Override "${pin.kind}" collides with another hex object on the same slot — dropped.`
        );
        continue;
      }
      carveFieldOverride(adventure, spaceId, pin.kind);
    }
    if (pendingList.length > 0) {
      tile.pendingFieldOverrides = pendingList;
      tile.pendingFieldOverride = pendingList[0];
    }
  }
  return problems;
}

/**
 * Stamp pool overrides onto face-down Far/Near/Center tiles with no designer
 * pin. Every such tile gets AT LEAST ONE override when the feature is on
 * (user rule: "every time open map at least 1 function hex will be replaced").
 * Only kinds from packages allowed by the current mods are drawn.
 */
export function assignPoolFieldOverrides(
  state: GameState,
  rng: () => number,
  options: { enabled: boolean }
): void {
  if (!options.enabled || !state.adventure) {
    return;
  }
  const adventure = state.adventure;
  const allowed = packageAllowedForState(state);
  for (const tile of Object.values(adventure.tiles)) {
    if (!tile.faceDown) {
      continue;
    }
    // Designer pins already queued — do not add a pool draw on top.
    if (tile.pendingFieldOverride || (tile.pendingFieldOverrides?.length ?? 0) > 0) {
      continue;
    }
    const group = (tile.group ?? "far") as TileGroup;
    if (group !== "far" && group !== "near" && group !== "center") {
      continue;
    }
    const pool = listFieldOverrideDefinitions({
      tileGroup: group,
      implementedOnly: true,
      packageAllowed: allowed,
      moduleEnabled: moduleEnabledForState(state)
    });
    if (pool.length === 0) {
      continue;
    }
    const pick = pool[Math.floor(rng() * pool.length) % pool.length];
    tile.pendingFieldOverrides = [{ kind: pick.id, fromPool: true }];
    tile.pendingFieldOverride = tile.pendingFieldOverrides[0];
  }
}

/**
 * Ensure a just-revealed tile has a pool override when the feature is on and
 * none was pre-stamped (e.g. standard maps, late reveal). Guarantees ≥1 hex
 * function on every open of a Far/Near/Center tile when content is available.
 */
export function ensurePoolFieldOverrideOnReveal(
  state: GameState,
  tile: MapTileState,
  rng: () => number
): void {
  if (
    !fieldOverridesEnabled(state) ||
    tile.pendingFieldOverride ||
    (tile.pendingFieldOverrides?.length ?? 0) > 0
  ) {
    return;
  }
  const group = (tile.group ?? "far") as TileGroup;
  if (group !== "far" && group !== "near" && group !== "center") {
    return;
  }
  const pool = listFieldOverrideDefinitions({
    tileGroup: group,
    implementedOnly: true,
    packageAllowed: packageAllowedForState(state),
    moduleEnabled: moduleEnabledForState(state)
  });
  if (pool.length === 0) {
    return;
  }
  const pick = pool[Math.floor(rng() * pool.length) % pool.length];
  tile.pendingFieldOverrides = [{ kind: pick.id, fromPool: true }];
  tile.pendingFieldOverride = tile.pendingFieldOverrides[0];
}

/**
 * Place or offer the NEXT pending field override on a just-revealed tile.
 * Multiple pins queue on `pendingFieldOverrides`; each call drains the head.
 * Returns true when a pending choice was opened (caller should stop the chain).
 */
export function offerPendingFieldOverridePlacement(
  state: GameState,
  tile: MapTileState,
  playerId: string,
  /** Internal: after placing one pin, drain the rest of the queue without re-drawing a pool override. */
  opts: { allowPoolDraw?: boolean } = {}
): boolean {
  const allowPoolDraw = opts.allowPoolDraw !== false;
  const adventure = state.adventure;
  // Late assign if feature on and nothing pending yet — only on the outer call,
  // never after auto-placing a queue item (that would loop forever).
  if (
    allowPoolDraw &&
    adventure &&
    fieldOverridesEnabled(state) &&
    !tile.pendingFieldOverride &&
    !(tile.pendingFieldOverrides?.length)
  ) {
    // hashSeed yields [0, 2^31); normalize by 2^31 so the whole pool is reachable.
    ensurePoolFieldOverrideOnReveal(state, tile, () => hashSeed(state.seed, `${tile.id}#late`) / 0x80000000);
  }
  // Normalize singular → array head.
  if (tile.pendingFieldOverride && !(tile.pendingFieldOverrides?.length)) {
    tile.pendingFieldOverrides = [tile.pendingFieldOverride];
  }
  const queue = tile.pendingFieldOverrides ?? [];
  const pending = queue[0] ?? tile.pendingFieldOverride;
  if (!adventure || !pending || tile.faceDown || tile.awaitingRotation) {
    return false;
  }
  if (!fieldOverridesEnabled(state) && pending.fromPool) {
    shiftPendingFieldOverride(tile);
    // Try next in queue (no new pool draw).
    return offerPendingFieldOverridePlacement(state, tile, playerId, { allowPoolDraw: false });
  }

  const candidates = fieldOverridePlacementCandidates(state, tile, pending.kind);
  if (candidates.length === 0) {
    shiftPendingFieldOverride(tile);
    appendEvent(state, {
      type: "EVENT_NOTE",
      message: `${fieldOverrideLabel(pending.kind)} could not be placed — no legal hex on the revealed tile.`,
      playerId
    });
    return offerPendingFieldOverridePlacement(state, tile, playerId, { allowPoolDraw: false });
  }

  const mode = pending.fromPool ? fieldOverridePlacementMode(state) : "manual";
  const placeAndContinue = (spaceId: MapSpaceId): boolean => {
    placeFieldOverride(state, tile, spaceId, pending.kind, playerId);
    // More overrides on this tile? Drain queue only — never re-pool.
    return offerPendingFieldOverridePlacement(state, tile, playerId, { allowPoolDraw: false });
  };

  if (!pending.fromPool) {
    if (pending.preferredSpaceId && candidates.includes(pending.preferredSpaceId)) {
      return placeAndContinue(pending.preferredSpaceId);
    }
    if (candidates.length === 1) {
      return placeAndContinue(candidates[0]);
    }
  } else if (mode === "random") {
    const pick = candidates[hashSeed(state.seed, `${tile.id}:${pending.kind}`) % candidates.length];
    const spaceId =
      pending.preferredSpaceId && candidates.includes(pending.preferredSpaceId)
        ? pending.preferredSpaceId
        : pick;
    return placeAndContinue(spaceId);
  } else if (candidates.length === 1 && mode === "manual") {
    return placeAndContinue(candidates[0]);
  }

  const allowRefuse = Boolean(pending.fromPool && mode === "manual-or-refuse");
  const options = candidates.map((spaceId) => {
    const field = adventure.fields[spaceId];
    const location = field ? locationDefinitions[field.location]?.name ?? field.location : "field";
    // Prefix the ring edge (Centre / NE edge — …) so two candidates with the
    // same printed location stay distinguishable (mirrors place-map-token).
    const edge = ringEdgeLabel(tile, spaceId);
    return { label: `${edge} — ${location}` };
  });
  if (allowRefuse) {
    options.push({ label: "Refuse — leave the tile as printed" });
  }

  state.pendingChoice = {
    id: `choice_field_override_${tile.id}_${pending.kind}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: pending.preferredSpaceId
      ? `${fieldOverrideLabel(pending.kind)} — reserved hex is illegal after reveal. Choose a glowing legal field${allowRefuse ? " or refuse" : ""}.`
      : `${fieldOverrideLabel(pending.kind)} — choose which glowing field it replaces${allowRefuse ? " (or refuse)" : ""}.`,
    options,
    context: "place-field-override",
    fieldOverride: {
      tileInstanceId: tile.id,
      kind: pending.kind,
      candidates,
      allowRefuse
    },
    returnPhase: state.phase
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  return true;
}

/** Pop the head of the pending FO queue (and legacy singular). */
function shiftPendingFieldOverride(tile: MapTileState): void {
  if (tile.pendingFieldOverrides && tile.pendingFieldOverrides.length > 0) {
    tile.pendingFieldOverrides = tile.pendingFieldOverrides.slice(1);
    tile.pendingFieldOverride = tile.pendingFieldOverrides[0];
    if (tile.pendingFieldOverrides.length === 0) {
      delete tile.pendingFieldOverrides;
      delete tile.pendingFieldOverride;
    }
    return;
  }
  delete tile.pendingFieldOverride;
}

export function placeFieldOverride(
  state: GameState,
  tile: MapTileState,
  spaceId: MapSpaceId,
  kind: string,
  playerId: string
): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }
  const carved = carveFieldOverride(adventure, spaceId, kind);
  shiftPendingFieldOverride(tile);
  if (!carved) {
    return;
  }
  appendEvent(state, {
    type: "EVENT_NOTE",
    message: `${fieldOverrideLabel(kind)} placed on the map.`,
    playerId
  });
}

export function refuseFieldOverride(state: GameState, tile: MapTileState, playerId: string): void {
  const kind = tile.pendingFieldOverride?.kind ?? tile.pendingFieldOverrides?.[0]?.kind;
  shiftPendingFieldOverride(tile);
  if (kind) {
    appendEvent(state, {
      type: "EVENT_NOTE",
      message: `${fieldOverrideLabel(kind)} was refused — the tile stays as printed.`,
      playerId
    });
  }
}

/** "Centre" or "<compass> edge" of a hex on the tile flower, for option labels. */
function ringEdgeLabel(tile: MapTileState, spaceId: MapSpaceId): string {
  const coord = parseHexSpaceId(spaceId);
  const center = { row: tile.centerRow, col: tile.centerCol };
  if (coord && hexEquals(coord, center)) {
    return "Centre";
  }
  for (let direction = 0; direction < 6; direction += 1) {
    if (coord && hexEquals(hexNeighbor(center, direction), coord)) {
      return `${HEX_DIRECTIONS[direction]} edge`;
    }
  }
  return "Field";
}

function hashSeed(seed: string, salt: string): number {
  let h = 2166136261;
  const s = `${seed}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
