/**
 * Map-only scenario presets for designed maps (mission-book style conditions).
 *
 * A designer can freeze starting resources / income / units / buildings, a
 * victory mode, one-shot starting bonuses, and timed round events. Everything
 * is MAP-SCOPED: it rides the saved map record and is applied when that map is
 * picked (and again when the adventure is built). Lobby players still see a
 * clear note of what the map forces.
 *
 * Victory mode is a PRESET for now (applied on pick); the lobby victory control
 * remains so a later change can unlock mid-lobby edits without a schema break.
 */

import { allTileDefinitions } from "@/data/map/tiles";
import { locationDefinitions } from "@/data/map/locations";
import type { TileDefinition } from "@/data/map/types";
import { seaTileBand, subterraneanTileBand, VII_FIELD_LOCATION } from "./adventure";
import { VICTORY_MODE_LABELS } from "./ruleset";
import { DEFAULT_OBELISK_BONUS } from "./state";
import type {
  CustomMapObeliskBonus,
  CustomMapObeliskConfig,
  CustomMapObject,
  CustomMapObjectKind,
  CustomMapObjectPlacement,
  CustomMapObjectivesConfig,
  CustomMapPreset,
  CustomMapTilePlan,
  CustomStartingUnit,
  DragonUtopiaGuards,
  GameSetupOptions,
  SecretTileFeature,
  UnitLevel,
  VictoryMode
} from "./state";

export type { CustomMapPreset };

/**
 * CANONICAL Secret-landmark matcher — the single copy the designer counts,
 * the demand warnings AND the setup draw all share (adventure-setup imports
 * it from here, so the three consumers can never diverge).
 */
export function tileMatchesSecretFeature(def: TileDefinition, feature: SecretTileFeature): boolean {
  switch (feature) {
    case "gold_mine":
      return def.fields.some((field) => field.location === "mine" && field.resource === "gold");
    case "valuables_mine":
      return def.fields.some((field) => field.location === "mine" && field.resource === "valuables");
    case "materials_mine":
      return def.fields.some(
        (field) => field.location === "mine" && field.resource === "buildingMaterials"
      );
    case "any_mine":
      return def.fields.some((field) => field.location === "mine");
    case "obelisk":
      return def.fields.some((field) => field.location === "obelisk");
    case "settlement":
      return def.fields.some((field) => field.location === "settlement");
    case "town":
      return def.fields.some(
        (field) => field.location === "town" || field.location === "random_town"
      );
    case "objective":
      return def.fields.some(
        (field) => field.location === "grail" || field.location === "dragon_utopia"
      );
    default:
      return false;
  }
}

/** The three legal center-tile Ⅶ-field designations (allow-list for sanitize). */
export const VII_FIELD_DESIGNATIONS = new Set<NonNullable<CustomMapTilePlan["viiField"]>>([
  "town",
  "dragon_utopia",
  "grail"
]);

/** True when `value` is a legal {@link CustomMapTilePlan.viiField} designation. */
export function isViiFieldDesignation(
  value: unknown
): value is NonNullable<CustomMapTilePlan["viiField"]> {
  return typeof value === "string" && VII_FIELD_DESIGNATIONS.has(value as never);
}

// The location a Ⅶ-field designation resolves to ("town" → the neutral Random
// Town) is the shared VII_FIELD_LOCATION from ./adventure (single source of
// truth — the materialization override and the conflict helper read the same map).

const FEATURE_LABELS: Record<SecretTileFeature, string> = {
  gold_mine: "Gold mine",
  valuables_mine: "Valuables mine",
  materials_mine: "Materials mine",
  any_mine: "Any mine",
  obelisk: "Obelisk",
  settlement: "Settlement",
  town: "Town",
  objective: "Grail / Dragons"
};

/** One-shot bonus every player receives when the adventure opens. */
export type CustomMapStartingBonus = NonNullable<CustomMapPreset["startingBonuses"]>[number];

/** Effect fired at the start of a given round (after ROUND_STARTED). */
export type CustomMapTimedEffect = NonNullable<CustomMapPreset["timedEvents"]>[number]["effect"];

export type CustomMapTimedEvent = NonNullable<CustomMapPreset["timedEvents"]>[number];

const VICTORY_MODES = new Set<VictoryMode>([
  "conquest",
  "grail",
  "dragon-hunt",
  "dragon-conqueror"
]);

const BUILDING_SUFFIXES = new Set([
  "citadel",
  "city_hall",
  "mage_guild",
  "dwelling_bronze",
  "dwelling_silver",
  "dwelling_gold",
  "marketplace",
  "blacksmith",
  "resource_silo",
  "tavern"
]);

const SEARCH_DECKS = new Set(["artifacts", "spells", "abilities"]);
const CUBE_LOCATIONS = new Set(["windmill", "water_wheel", "mystical_garden"]);
const OBELISK_ROLES = new Set<CustomMapObeliskConfig["role"]>(["monolith", "bonus", "victory-only"]);

export type { CustomMapObeliskBonus, CustomMapObeliskConfig };

/** Storage/editor limit for one designed map. Keep UI and sanitization in lock-step. */
export const MAX_TIMED_EVENTS = 32;

/** How many designer-placed one-hex objects a map may carry (sanitisation cap). */
export const MAX_CUSTOM_MAP_OBJECTS = 16;

/** How many gates a single colored pair may carry (a two-way pair — extras dropped). */
export const MAX_GATES_PER_PAIR = 2;

const CUSTOM_MAP_OBJECT_KINDS = new Set<CustomMapObjectKind>(["monolith", "whirlpool", "gate"]);

/** Designer effect kinds (order = editor dropdown order). */
export const TIMED_EFFECT_KINDS = [
  "clear_visitable_cubes",
  "resources",
  "search",
  "morale",
  "movement",
  "treasure_roll",
  "resource_roll",
  "note"
] as const;

export type TimedEffectKind = (typeof TIMED_EFFECT_KINDS)[number];

export const TIMED_EFFECT_KIND_LABELS: Record<TimedEffectKind, string> = {
  clear_visitable_cubes: "Clear black cubes (revisit sites)",
  resources: "All players gain resources",
  search: "All players Search a deck",
  morale: "All players gain/lose morale",
  movement: "All heroes gain movement",
  treasure_roll: "All players roll Treasure die",
  resource_roll: "All players roll Resource die",
  note: "Announcement (feed note only)"
};

/** Default effect when the designer picks a kind (or adds a blank event). */
export function defaultTimedEffect(kind: TimedEffectKind): CustomMapTimedEffect {
  switch (kind) {
    case "clear_visitable_cubes":
      return {
        kind: "clear_visitable_cubes",
        locations: ["windmill", "water_wheel", "mystical_garden"]
      };
    case "resources":
      return { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 };
    case "search":
      return { kind: "search", deck: "artifacts", count: 1 };
    case "morale":
      return { kind: "morale", amount: 1 };
    case "movement":
      return { kind: "movement", amount: 1 };
    case "treasure_roll":
      return { kind: "treasure_roll", count: 1 };
    case "resource_roll":
      return { kind: "resource_roll", count: 1 };
    case "note":
      return { kind: "note", text: "Something stirs across the land…" };
  }
}

/** Fresh timed event for the designer "Add event" button. */
export function defaultTimedEvent(round = 6): CustomMapTimedEvent {
  return { round, effect: defaultTimedEffect("clear_visitable_cubes") };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function sanitizeResources(
  input: unknown
): { gold: number; buildingMaterials: number; valuables: number } | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  return {
    gold: clampInt(raw.gold, 0, 99, 0),
    buildingMaterials: clampInt(raw.buildingMaterials, 0, 99, 0),
    valuables: clampInt(raw.valuables, 0, 99, 0)
  };
}

function sanitizeStartingUnits(input: unknown): CustomStartingUnit[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const cleaned: CustomStartingUnit[] = [];
  const seen = new Set<number>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const raw = entry as Partial<CustomStartingUnit>;
    if (raw.side !== "few" && raw.side !== "pack") {
      continue;
    }
    const level = clampInt(raw.level, 1, 7, 0) as UnitLevel | 0;
    if (!level || seen.has(level)) {
      continue;
    }
    seen.add(level);
    cleaned.push({ level, side: raw.side });
  }
  cleaned.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  return cleaned.length > 0 ? cleaned : [];
}

function sanitizeStartingBonus(input: unknown): CustomMapStartingBonus | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as { kind?: string } & Record<string, unknown>;
  if (raw.kind === "resources") {
    const gold = clampInt(raw.gold, 0, 30, 0);
    const buildingMaterials = clampInt(raw.buildingMaterials, 0, 30, 0);
    const valuables = clampInt(raw.valuables, 0, 30, 0);
    if (gold + buildingMaterials + valuables <= 0) {
      return null;
    }
    return { kind: "resources", gold, buildingMaterials, valuables };
  }
  if (raw.kind === "search" && typeof raw.deck === "string" && SEARCH_DECKS.has(raw.deck)) {
    return {
      kind: "search",
      deck: raw.deck as "artifacts" | "spells" | "abilities",
      count: clampInt(raw.count, 1, 5, 1)
    };
  }
  if (raw.kind === "morale" && (raw.amount === 1 || raw.amount === -1)) {
    return { kind: "morale", amount: raw.amount };
  }
  return null;
}

/** Sanitize one Obelisk "bonus" reward. Clamps amounts; degenerate → null. */
function sanitizeObeliskBonus(input: unknown): CustomMapObeliskBonus | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as { kind?: string } & Record<string, unknown>;
  if (raw.kind === "morale") {
    // The card always grants a single positive morale token (amount is fixed).
    return { kind: "morale", amount: 1 };
  }
  if (raw.kind === "search" && typeof raw.deck === "string" && SEARCH_DECKS.has(raw.deck)) {
    return {
      kind: "search",
      deck: raw.deck as "artifacts" | "spells" | "abilities",
      count: clampInt(raw.count, 1, 3, 1)
    };
  }
  if (raw.kind === "resources") {
    const gold = clampInt(raw.gold, 0, 5, 0);
    const buildingMaterials = clampInt(raw.buildingMaterials, 0, 5, 0);
    const valuables = clampInt(raw.valuables, 0, 5, 0);
    // All-zero is a no-op reward — drop it (the role falls back to the default).
    if (gold + buildingMaterials + valuables <= 0) {
      return null;
    }
    return { kind: "resources", gold, buildingMaterials, valuables };
  }
  if (raw.kind === "movement") {
    return { kind: "movement", amount: clampInt(raw.amount, 1, 3, 1) };
  }
  if (raw.kind === "dice") {
    const treasure = clampInt(raw.treasure, 0, 2, 0);
    const resource = clampInt(raw.resource, 0, 2, 0);
    // No dice at all is a no-op — drop it (the role falls back to the default).
    if (treasure + resource <= 0) {
      return null;
    }
    return { kind: "dice", treasure, resource };
  }
  return null;
}

/**
 * Sanitize the map-wide Obelisk role. Unknown role → undefined (treated as
 * ABSENT = classic locked-die). Only "bonus" carries a reward; a stray bonus on
 * "monolith"/"victory-only" is dropped, and a "bonus" role with no/degenerate
 * bonus falls back to {@link DEFAULT_OBELISK_BONUS} (so the stored config always
 * spells out the reward the engine will grant).
 */
function sanitizeObeliskConfig(input: unknown): CustomMapObeliskConfig | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as { role?: unknown; bonus?: unknown };
  if (typeof raw.role !== "string" || !OBELISK_ROLES.has(raw.role as CustomMapObeliskConfig["role"])) {
    return undefined;
  }
  const role = raw.role as CustomMapObeliskConfig["role"];
  if (role !== "bonus") {
    return { role };
  }
  return { role, bonus: sanitizeObeliskBonus(raw.bonus) ?? DEFAULT_OBELISK_BONUS };
}

/**
 * Sanitize the Grail / Dragon Utopia options block. Each field surfaces an
 * EXISTING engine knob; garbage → the field is dropped (treated as absent =
 * today's default). An all-empty block collapses to undefined.
 */
function sanitizeObjectivesConfig(input: unknown): CustomMapObjectivesConfig | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    grailObelisksRequired?: unknown;
    utopiaGuards?: unknown;
    utopiaBonusSearch?: unknown;
  };
  const config: CustomMapObjectivesConfig = {};
  if (raw.grailObelisksRequired === 1 || raw.grailObelisksRequired === 2 || raw.grailObelisksRequired === 3 || raw.grailObelisksRequired === 4) {
    config.grailObelisksRequired = raw.grailObelisksRequired;
  }
  if (raw.utopiaGuards === "four" || raw.utopiaGuards === "by-difficulty") {
    config.utopiaGuards = raw.utopiaGuards as DragonUtopiaGuards;
  }
  if (raw.utopiaBonusSearch === 1 || raw.utopiaBonusSearch === 2 || raw.utopiaBonusSearch === 3) {
    config.utopiaBonusSearch = raw.utopiaBonusSearch;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * Sanitize ONE designer-placed map object (untrusted input). Keeps only a
 * well-formed shape: a known kind, a valid placement (tile-slot with a 0-6 slot,
 * or standalone), a colored pair 1-4 REQUIRED for a gate (and never on another
 * kind), and an optional guard clamped to 1-7. Geometry consistency (inside a
 * tile, colliding hexes, illegal tile slot, both-layers/standalone-whirlpool) is
 * a separate concern handled by {@link validateCustomMapObjects} at setup —
 * sanitisation is only structural hygiene so untrusted input can't crash setup.
 */
export function sanitizeCustomMapObject(input: unknown): CustomMapObject | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as { kind?: unknown; pair?: unknown; guard?: unknown; placement?: unknown };
  if (typeof raw.kind !== "string" || !CUSTOM_MAP_OBJECT_KINDS.has(raw.kind as CustomMapObjectKind)) {
    return null;
  }
  const kind = raw.kind as CustomMapObjectKind;
  const placementRaw = raw.placement as { type?: unknown; row?: unknown; col?: unknown; slot?: unknown } | null;
  if (!placementRaw || typeof placementRaw !== "object") {
    return null;
  }
  if (!Number.isInteger(placementRaw.row) || !Number.isInteger(placementRaw.col)) {
    return null;
  }
  const row = placementRaw.row as number;
  const col = placementRaw.col as number;
  let placement: CustomMapObjectPlacement;
  if (placementRaw.type === "tile-slot") {
    const slot = placementRaw.slot;
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) > 6) {
      return null;
    }
    placement = { type: "tile-slot", row, col, slot: slot as number };
  } else if (placementRaw.type === "standalone") {
    placement = { type: "standalone", row, col };
  } else {
    return null;
  }
  const object: CustomMapObject = { kind, placement };
  // A gate carries a colored pair 1-4 (required); any other kind never does.
  if (kind === "gate") {
    if (raw.pair !== 1 && raw.pair !== 2 && raw.pair !== 3 && raw.pair !== 4) {
      return null;
    }
    object.pair = raw.pair;
  }
  // A deliberate neutral guard difficulty 1-7 (optional; clamped).
  if (raw.guard !== undefined) {
    const guard = clampInt(raw.guard, 1, 7, 0);
    if (guard > 0) {
      object.guard = guard;
    }
  }
  return object;
}

function sanitizeCustomMapObjects(input: unknown): CustomMapObject[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const objects: CustomMapObject[] = [];
  const gatesPerPair = new Map<number, number>();
  for (const entry of input) {
    if (objects.length >= MAX_CUSTOM_MAP_OBJECTS) {
      break;
    }
    const object = sanitizeCustomMapObject(entry);
    if (!object) {
      continue;
    }
    // At most two gates per colored pair (a two-way pair) — the 3rd+ is dropped
    // deterministically, keeping the first two in list order.
    if (object.kind === "gate" && object.pair !== undefined) {
      const count = gatesPerPair.get(object.pair) ?? 0;
      if (count >= MAX_GATES_PER_PAIR) {
        continue;
      }
      gatesPerPair.set(object.pair, count + 1);
    }
    objects.push(object);
  }
  return objects;
}

function sanitizeTimedEffect(input: unknown): CustomMapTimedEffect | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as { kind?: string } & Record<string, unknown>;
  if (raw.kind === "resources") {
    const gold = clampInt(raw.gold, 0, 30, 0);
    const buildingMaterials = clampInt(raw.buildingMaterials, 0, 30, 0);
    const valuables = clampInt(raw.valuables, 0, 30, 0);
    if (gold + buildingMaterials + valuables <= 0) {
      return null;
    }
    return { kind: "resources", gold, buildingMaterials, valuables };
  }
  if (raw.kind === "search" && typeof raw.deck === "string" && SEARCH_DECKS.has(raw.deck)) {
    return {
      kind: "search",
      deck: raw.deck as "artifacts" | "spells" | "abilities",
      count: clampInt(raw.count, 1, 5, 1)
    };
  }
  if (raw.kind === "clear_visitable_cubes" && Array.isArray(raw.locations)) {
    const locations = raw.locations.filter(
      (loc): loc is "windmill" | "water_wheel" | "mystical_garden" =>
        typeof loc === "string" && CUBE_LOCATIONS.has(loc)
    );
    if (locations.length === 0) {
      return null;
    }
    return { kind: "clear_visitable_cubes", locations: [...new Set(locations)] };
  }
  if (raw.kind === "morale" && (raw.amount === 1 || raw.amount === -1)) {
    return { kind: "morale", amount: raw.amount };
  }
  if (raw.kind === "movement") {
    const amount = clampInt(raw.amount, 1, 5, 1);
    return { kind: "movement", amount };
  }
  if (raw.kind === "treasure_roll") {
    return { kind: "treasure_roll", count: clampInt(raw.count, 1, 3, 1) };
  }
  if (raw.kind === "resource_roll") {
    return { kind: "resource_roll", count: clampInt(raw.count, 1, 3, 1) };
  }
  if (raw.kind === "note" && typeof raw.text === "string") {
    const text = raw.text.trim().slice(0, 200);
    return text.length > 0 ? { kind: "note", text } : null;
  }
  return null;
}

/** Sanitize untrusted preset input (HTTP body / storage). Returns undefined if empty. */
export function sanitizeCustomMapPreset(input: unknown): CustomMapPreset | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Partial<CustomMapPreset>;
  const preset: CustomMapPreset = {};

  if (typeof raw.victoryMode === "string" && VICTORY_MODES.has(raw.victoryMode as VictoryMode)) {
    preset.victoryMode = raw.victoryMode as VictoryMode;
  }
  const resources = sanitizeResources(raw.startingResources);
  if (resources) {
    preset.startingResources = resources;
  }
  const production = sanitizeResources(raw.startingProduction);
  if (production) {
    preset.startingProduction = production;
  }
  if (Array.isArray(raw.startingBuildings)) {
    // An empty list means "nothing forced", not "force zero buildings" — the
    // editor deletes empties and applyCustomMapPresetToOptions skips them, so
    // sanitize keeps the three layers consistent by dropping [] here too.
    const buildings = raw.startingBuildings
      .filter((id): id is string => typeof id === "string" && BUILDING_SUFFIXES.has(id))
      .slice(0, 12);
    if (buildings.length > 0) {
      preset.startingBuildings = buildings;
    }
  }
  if (raw.startingUnits !== undefined) {
    preset.startingUnits = sanitizeStartingUnits(raw.startingUnits);
  }
  if (Array.isArray(raw.startingBonuses)) {
    const bonuses = raw.startingBonuses
      .map(sanitizeStartingBonus)
      .filter((b): b is CustomMapStartingBonus => b !== null)
      .slice(0, 8);
    if (bonuses.length > 0) {
      preset.startingBonuses = bonuses;
    }
  }
  if (Array.isArray(raw.timedEvents)) {
    const events: CustomMapTimedEvent[] = [];
    // Cap high enough for mission-book style maps (many rounds × multi-effects).
    for (const entry of raw.timedEvents.slice(0, MAX_TIMED_EVENTS)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const round = clampInt((entry as CustomMapTimedEvent).round, 1, 30, 0);
      const effect = sanitizeTimedEffect((entry as CustomMapTimedEvent).effect);
      if (round > 0 && effect) {
        events.push({ round, effect });
      }
    }
    events.sort((a, b) => a.round - b.round);
    if (events.length > 0) {
      preset.timedEvents = events;
    }
  }
  if (raw.roundLimit !== undefined) {
    const limit = clampInt(raw.roundLimit, 0, 30, 0);
    if (limit > 0) {
      preset.roundLimit = limit;
    }
  }
  if (typeof raw.notes === "string") {
    const notes = raw.notes.trim().slice(0, 400);
    if (notes.length > 0) {
      preset.notes = notes;
    }
  }
  if (raw.obelisks !== undefined) {
    const obelisks = sanitizeObeliskConfig(raw.obelisks);
    if (obelisks) {
      preset.obelisks = obelisks;
    }
  }
  if (raw.objects !== undefined) {
    const objects = sanitizeCustomMapObjects(raw.objects);
    if (objects.length > 0) {
      preset.objects = objects;
    }
  }
  if (raw.objectives !== undefined) {
    const objectives = sanitizeObjectivesConfig(raw.objectives);
    if (objectives) {
      preset.objectives = objectives;
    }
  }

  return customMapPresetIsActive(preset) ? preset : undefined;
}

/** True when the preset carries any forced condition or designer note. */
export function customMapPresetIsActive(preset: CustomMapPreset | null | undefined): boolean {
  if (!preset) {
    return false;
  }
  return Boolean(
    preset.victoryMode ||
      preset.startingResources ||
      preset.startingProduction ||
      (preset.startingBuildings && preset.startingBuildings.length > 0) ||
      preset.startingUnits ||
      (preset.startingBonuses && preset.startingBonuses.length > 0) ||
      (preset.timedEvents && preset.timedEvents.length > 0) ||
      preset.roundLimit ||
      (preset.notes && preset.notes.length > 0) ||
      preset.obelisks ||
      (preset.objects && preset.objects.length > 0) ||
      Boolean(preset.objectives)
  );
}

/**
 * Plain-words one-line summary of a map's designer objects (lobby banner +
 * designer summary): "2 gate pairs, 1 monolith, 1 guarded". Counts a colored
 * pair once (regardless of whether one or both gates are placed), monoliths and
 * whirlpools by count, and how many objects carry a neutral guard.
 */
export function describeMapObjects(objects: CustomMapObject[]): string {
  const gatePairs = new Set<number>();
  let monoliths = 0;
  let whirlpools = 0;
  let guarded = 0;
  for (const object of objects) {
    if (object.guard) {
      guarded += 1;
    }
    if (object.kind === "gate" && object.pair !== undefined) {
      gatePairs.add(object.pair);
    } else if (object.kind === "monolith") {
      monoliths += 1;
    } else if (object.kind === "whirlpool") {
      whirlpools += 1;
    }
  }
  const parts: string[] = [];
  if (gatePairs.size > 0) {
    parts.push(`${gatePairs.size} gate pair${gatePairs.size === 1 ? "" : "s"}`);
  }
  if (monoliths > 0) {
    parts.push(`${monoliths} monolith${monoliths === 1 ? "" : "s"}`);
  }
  if (whirlpools > 0) {
    parts.push(`${whirlpools} whirlpool${whirlpools === 1 ? "" : "s"}`);
  }
  if (guarded > 0) {
    parts.push(`${guarded} guarded`);
  }
  return parts.join(", ");
}

// Single source of truth for victory-mode names (renamed "Grail Hunt" ->
// "Holy Grail" there) — the designer must never drift from the game-options UI.
const VICTORY_LABELS: Record<VictoryMode, string> = VICTORY_MODE_LABELS;

/** Shared resource line for UI + feed messages. */
export function formatPresetResources(r: {
  gold?: number;
  buildingMaterials?: number;
  valuables?: number;
}): string {
  const parts: string[] = [];
  if (r.gold) {
    parts.push(`${r.gold} gold`);
  }
  if (r.buildingMaterials) {
    parts.push(`${r.buildingMaterials} materials`);
  }
  if (r.valuables) {
    parts.push(`${r.valuables} valuables`);
  }
  return parts.join(", ") || "nothing";
}

function formatResources(r: { gold: number; buildingMaterials: number; valuables: number }): string {
  return formatPresetResources(r);
}

/** Plain-words line for a timed effect (feed + designer). */
export function describeTimedMapEffect(effect: CustomMapTimedEffect): string {
  return describeTimedEffect(effect);
}

function describeBonus(bonus: CustomMapStartingBonus): string {
  if (bonus.kind === "resources") {
    return `+${formatPresetResources(bonus)}`;
  }
  if (bonus.kind === "search") {
    return `Search(${bonus.count}) ${bonus.deck}`;
  }
  return bonus.amount > 0 ? "+1 morale" : "−1 morale";
}

/** Plain-words description of one Obelisk "bonus" reward (designer + summary). */
export function describeObeliskBonus(bonus: CustomMapObeliskBonus): string {
  switch (bonus.kind) {
    case "morale":
      return "+1 morale";
    case "search":
      return `Search(${bonus.count}) ${bonus.deck}`;
    case "resources":
      return `+${formatPresetResources(bonus)}`;
    case "movement":
      return `+${bonus.amount} movement`;
    case "dice": {
      const parts: string[] = [];
      if (bonus.treasure) {
        parts.push(`${bonus.treasure} Treasure`);
      }
      if (bonus.resource) {
        parts.push(`${bonus.resource} Resource`);
      }
      return `roll ${parts.join(" + ")} ${bonus.treasure + bonus.resource === 1 ? "die" : "dice"}`;
    }
  }
}

/** Plain-words label for a Dragon Utopia guard mode. */
export function describeUtopiaGuards(guards: DragonUtopiaGuards): string {
  return guards === "four" ? "always four dragons" : "scale by difficulty";
}

/**
 * Icon-tagged lines for the Grail / Dragon Utopia options block (lobby banner +
 * designer summary). One entry per set field; 🏆 for the Grail knob, 🐉 for the
 * Utopia knobs.
 */
export function describeObjectivesConfig(config: CustomMapObjectivesConfig): CustomMapPresetEntry[] {
  const entries: CustomMapPresetEntry[] = [];
  if (config.grailObelisksRequired) {
    entries.push({
      icon: "🏆",
      text: `Grail dig needs ${config.grailObelisksRequired} Obelisk${config.grailObelisksRequired === 1 ? "" : "s"}`
    });
  }
  if (config.utopiaGuards) {
    entries.push({ icon: "🐉", text: `Dragon Utopia guards: ${describeUtopiaGuards(config.utopiaGuards)}` });
  }
  if (config.utopiaBonusSearch) {
    entries.push({ icon: "🐉", text: `Dragon Utopia bonus: Search(${config.utopiaBonusSearch}) Artifacts` });
  }
  return entries;
}

/** Plain-words line for the map-wide Obelisk role (lobby banner + designer). */
export function describeObeliskRole(config: CustomMapObeliskConfig): string {
  if (config.role === "monolith") {
    return "Obelisks: Monolith teleport network";
  }
  if (config.role === "victory-only") {
    return "Obelisks: victory marker only (no reward)";
  }
  return `Obelisks: fixed bonus — ${describeObeliskBonus(config.bonus ?? DEFAULT_OBELISK_BONUS)}`;
}

function describeTimedEffect(effect: CustomMapTimedEffect): string {
  if (effect.kind === "resources") {
    return `all players gain ${formatPresetResources(effect)}`;
  }
  if (effect.kind === "search") {
    return `all players Search(${effect.count}) ${effect.deck}`;
  }
  if (effect.kind === "clear_visitable_cubes") {
    const names = effect.locations.map(
      (id) => locationDefinitions[id]?.name ?? id.replace(/_/g, " ")
    );
    return `clear black cubes on ${names.join(", ")}`;
  }
  if (effect.kind === "morale") {
    return effect.amount > 0 ? "all players gain +1 morale" : "all players lose 1 morale";
  }
  if (effect.kind === "movement") {
    return `all heroes gain +${effect.amount} movement`;
  }
  if (effect.kind === "treasure_roll") {
    return effect.count === 1
      ? "all players roll a Treasure die"
      : `all players roll ${effect.count} Treasure dice`;
  }
  if (effect.kind === "resource_roll") {
    return effect.count === 1
      ? "all players roll a Resource die"
      : `all players roll ${effect.count} Resource dice`;
  }
  return effect.text;
}

/** One condition line with a UI icon tag (designer summary + lobby banner). */
export type CustomMapPresetEntry = { icon: string; text: string };

/** Icon-tagged bullet entries for lobby / designer summary. */
export function describeCustomMapPresetEntries(
  preset: CustomMapPreset | null | undefined
): CustomMapPresetEntry[] {
  if (!preset || !customMapPresetIsActive(preset)) {
    return [];
  }
  const entries: CustomMapPresetEntry[] = [];
  if (preset.victoryMode) {
    entries.push({
      icon: "🏆",
      text: `Victory: ${VICTORY_LABELS[preset.victoryMode] ?? preset.victoryMode}`
    });
  }
  if (preset.startingResources) {
    entries.push({
      icon: "🪙",
      text: `Starting resources: ${formatResources(preset.startingResources)}`
    });
  }
  if (preset.startingProduction) {
    entries.push({ icon: "🏭", text: `Income: ${formatResources(preset.startingProduction)}` });
  }
  if (preset.startingBuildings && preset.startingBuildings.length > 0) {
    entries.push({
      icon: "🏗️",
      text: `Buildings: ${preset.startingBuildings.map((id) => id.replace(/_/g, " ")).join(", ")}`
    });
  }
  if (preset.startingUnits) {
    entries.push({
      icon: "⚔️",
      text:
        preset.startingUnits.length === 0
          ? "Starting army: none"
          : `Starting army: ${preset.startingUnits.map((u) => `lv${u.level} ${u.side}`).join(", ")}`
    });
  }
  if (preset.startingBonuses && preset.startingBonuses.length > 0) {
    entries.push({
      icon: "🎁",
      text: `Start bonus: ${preset.startingBonuses.map(describeBonus).join("; ")}`
    });
  }
  if (preset.timedEvents && preset.timedEvents.length > 0) {
    for (const event of preset.timedEvents) {
      entries.push({ icon: "⏳", text: `Round ${event.round}: ${describeTimedEffect(event.effect)}` });
    }
  }
  if (preset.roundLimit) {
    entries.push({ icon: "🕰️", text: `Suggested length: ${preset.roundLimit} rounds` });
  }
  if (preset.obelisks) {
    entries.push({ icon: "🗿", text: describeObeliskRole(preset.obelisks) });
  }
  if (preset.objectives) {
    for (const line of describeObjectivesConfig(preset.objectives)) {
      entries.push(line);
    }
  }
  if (preset.objects && preset.objects.length > 0) {
    const summary = describeMapObjects(preset.objects);
    if (summary.length > 0) {
      entries.push({ icon: "⛩️", text: `Objects: ${summary}` });
    }
  }
  if (preset.notes) {
    entries.push({ icon: "📜", text: preset.notes });
  }
  return entries;
}

/** Short bullet lines for lobby / designer summary (plain-text form). */
export function describeCustomMapPreset(preset: CustomMapPreset | null | undefined): string[] {
  return describeCustomMapPresetEntries(preset).map((entry) => entry.text);
}

/** GameSetupOptions keys a map preset may force. */
export type PresetForcedOptionKey =
  | "victoryMode"
  | "startingResources"
  | "startingProduction"
  | "startingBuildings"
  | "startingUnits";

/** Which lobby option fields THIS preset forces (for apply / restore symmetry). */
export function presetForcedOptionKeys(
  preset: CustomMapPreset | null | undefined
): PresetForcedOptionKey[] {
  if (!preset) {
    return [];
  }
  const keys: PresetForcedOptionKey[] = [];
  if (preset.victoryMode) {
    keys.push("victoryMode");
  }
  if (preset.startingResources) {
    keys.push("startingResources");
  }
  if (preset.startingProduction) {
    keys.push("startingProduction");
  }
  if (preset.startingBuildings && preset.startingBuildings.length > 0) {
    keys.push("startingBuildings");
  }
  if (preset.startingUnits) {
    keys.push("startingUnits");
  }
  return keys;
}

/**
 * Merge a map preset into lobby game options (resources, army, buildings,
 * victory). Does not touch the tile plan — caller sets customMap separately.
 * `skip` withholds fields the caller set explicitly (apply-once semantics:
 * the preset seeds the lobby on pick; later lobby edits win at build time).
 */
export function applyCustomMapPresetToOptions(
  options: GameSetupOptions,
  preset: CustomMapPreset | null | undefined,
  skip?: ReadonlySet<PresetForcedOptionKey>
): string[] {
  if (!preset || !customMapPresetIsActive(preset)) {
    return [];
  }
  const changes: string[] = [];
  if (preset.victoryMode && !skip?.has("victoryMode")) {
    options.victoryMode = preset.victoryMode;
    changes.push(`victory ${VICTORY_LABELS[preset.victoryMode] ?? preset.victoryMode}`);
  }
  if (preset.startingResources && !skip?.has("startingResources")) {
    options.startingResources = { ...preset.startingResources };
    changes.push(`resources ${formatResources(preset.startingResources)}`);
  }
  if (preset.startingProduction && !skip?.has("startingProduction")) {
    options.startingProduction = { ...preset.startingProduction };
    changes.push(`income ${formatResources(preset.startingProduction)}`);
  }
  if (preset.startingBuildings && preset.startingBuildings.length > 0 && !skip?.has("startingBuildings")) {
    options.startingBuildings = [...preset.startingBuildings];
    changes.push(`buildings ${preset.startingBuildings.join(", ")}`);
  }
  if (preset.startingUnits && !skip?.has("startingUnits")) {
    options.startingUnits = preset.startingUnits.map((u) => ({ ...u }));
    changes.push(
      preset.startingUnits.length === 0
        ? "army: none"
        : `army ${preset.startingUnits.map((u) => `lv${u.level} ${u.side}`).join(", ")}`
    );
  }
  return changes;
}

/**
 * Undo a previously-applied preset: every option field the OLD preset forced
 * — and the NEW preset does not force — is restored to the scenario default,
 * so switching maps (or going back to the scenario layout) never leaks one
 * map's resources/army/victory into the next game.
 */
export function revertCustomMapPresetOptions(
  options: GameSetupOptions,
  previousPreset: CustomMapPreset | null | undefined,
  nextPreset: CustomMapPreset | null | undefined,
  defaults: GameSetupOptions
): string[] {
  const nextForced = new Set(presetForcedOptionKeys(nextPreset));
  const changes: string[] = [];
  for (const key of presetForcedOptionKeys(previousPreset)) {
    if (nextForced.has(key)) {
      continue;
    }
    switch (key) {
      case "victoryMode":
        options.victoryMode = defaults.victoryMode;
        changes.push(`victory back to ${VICTORY_LABELS[defaults.victoryMode ?? "conquest"] ?? "Conquest"}`);
        break;
      case "startingResources":
        options.startingResources = { ...defaults.startingResources };
        changes.push("resources back to the scenario default");
        break;
      case "startingProduction":
        options.startingProduction = { ...defaults.startingProduction };
        changes.push("income back to the scenario default");
        break;
      case "startingBuildings":
        options.startingBuildings = [...defaults.startingBuildings];
        changes.push("buildings back to the scenario default");
        break;
      case "startingUnits":
        options.startingUnits = defaults.startingUnits?.map((u) => ({ ...u })) ?? null;
        changes.push("army back to the scenario default");
        break;
    }
  }
  return changes;
}

/**
 * How many pool tiles of a group match a secret feature (designer demand
 * check). Band filters mirror the setup draw exactly, and `excludeTileIds`
 * subtracts tiles the designer already pinned elsewhere — a pinned tile is
 * spliced out of the random pool at setup, so it can never satisfy a secret.
 */
export function countPoolTilesMatchingFeature(
  group: CustomMapTilePlan["group"],
  feature: SecretTileFeature,
  options?: {
    seaBand?: CustomMapTilePlan["seaBand"];
    subBand?: CustomMapTilePlan["subBand"];
    excludeTileIds?: ReadonlySet<string>;
  }
): number {
  return Object.values(allTileDefinitions).filter((def) => {
    if (def.group !== group) {
      return false;
    }
    if (options?.excludeTileIds?.has(def.id)) {
      return false;
    }
    if (group === "sea" && options?.seaBand && seaTileBand(def) !== options.seaBand) {
      return false;
    }
    if (group === "subterranean" && options?.subBand && subterraneanTileBand(def) !== options.subBand) {
      return false;
    }
    return tileMatchesSecretFeature(def, feature);
  }).length;
}

/**
 * Designer warnings: secret feature demand exceeds remaining pool supply, or a
 * feature has zero matches (will fall back to pure random in game). Supply is
 * counted the way SETUP will see it: same band filters, minus every tile the
 * plan pins by exact id (face-up or exact secret).
 */
export function secretFeatureDemandWarnings(plans: CustomMapTilePlan[]): string[] {
  const pinnedIds = new Set(
    plans.filter((plan) => plan.tileDefId).map((plan) => plan.tileDefId as string)
  );
  const demand = new Map<
    string,
    {
      feature: SecretTileFeature;
      group: CustomMapTilePlan["group"];
      seaBand?: CustomMapTilePlan["seaBand"];
      subBand?: CustomMapTilePlan["subBand"];
      count: number;
    }
  >();
  for (const plan of plans) {
    if (!plan.faceDown || !plan.secretFeature || plan.tileDefId) {
      continue;
    }
    const key = `${plan.group}:${plan.secretFeature}:${plan.seaBand ?? ""}:${plan.subBand ?? ""}`;
    const current = demand.get(key) ?? {
      feature: plan.secretFeature,
      group: plan.group,
      seaBand: plan.seaBand,
      subBand: plan.subBand,
      count: 0
    };
    current.count += 1;
    demand.set(key, current);
  }
  const warnings: string[] = [];
  for (const entry of demand.values()) {
    const supply = countPoolTilesMatchingFeature(entry.group, entry.feature, {
      seaBand: entry.seaBand,
      subBand: entry.subBand,
      excludeTileIds: pinnedIds
    });
    if (supply === 0) {
      warnings.push(
        `Secret “${FEATURE_LABELS[entry.feature] ?? entry.feature}” on ${entry.group}: no tiles in that pool have it — in game the slot becomes pure random.`
      );
    } else if (entry.count > supply) {
      warnings.push(
        `Secret “${FEATURE_LABELS[entry.feature] ?? entry.feature}” on ${entry.group}: ${entry.count} slots need it but only ${supply} matching tiles exist — extras fall back to random.`
      );
    }
  }
  return warnings;
}

/** The location a center tile def's printed difficulty-7 field carries, if any. */
function tileViiLocation(tileDefId: string | undefined): string | undefined {
  if (!tileDefId) {
    return undefined;
  }
  return allTileDefinitions[tileDefId]?.fields.find((field) => field.difficulty === 7)?.location;
}

/** How many center-group tiles carry `location` on their difficulty-7 field. */
function centerObjectiveTileCount(location: string): number {
  return Object.values(allTileDefinitions).filter(
    (def) =>
      def.group === "center" &&
      def.fields.some((field) => field.location === location && field.difficulty === 7)
  ).length;
}

/**
 * Whether a center plan's Ⅶ field CAN end up as `designation` (Grail or Dragon
 * Utopia) after setup + the designer override. A viiField designation forces the
 * answer; otherwise a pinned tile is read from its printed Ⅶ field, an
 * "objective" secret could draw either, and a plain random/forced draw could
 * become it (or is forced to it by the win condition).
 */
function centerCanYield(plan: CustomMapTilePlan, designation: "grail" | "dragon_utopia"): boolean {
  const location = VII_FIELD_LOCATION[designation];
  if (plan.viiField) {
    return plan.viiField === designation;
  }
  if (plan.tileDefId) {
    return tileViiLocation(plan.tileDefId) === location;
  }
  if (plan.secretFeature) {
    return plan.secretFeature === "objective";
  }
  return true;
}

/**
 * Victory-vs-design conflicts: a hand-placed (designer) tile set whose layout
 * makes the chosen win condition's objective IMPOSSIBLE. Returns human-readable
 * messages (empty = compatible). Used live in the designer / lobby summaries AND
 * as the hard BLOCK at game start (startAdventureFromLobby throws the first one).
 *
 * A scenario-driven map (no `customMap`) never conflicts — its objectives come
 * from the normal setup forcing. The checks mirror the real machinery
 * (forcedObjectiveCenterTiles + takeRemainingGrailTiles) and are deliberately
 * CONSERVATIVE: they flag only genuine impossibility, never a merely-tight
 * layout that setup would soft-fill from the pool.
 */
export function victoryDesignConflicts(
  plans: CustomMapTilePlan[],
  victoryMode: VictoryMode | undefined
): string[] {
  if (!plans.length) {
    return [];
  }
  const mode = victoryMode ?? "conquest";
  const centerPlans = plans.filter((plan) => plan.group === "center");

  if (mode === "dragon-hunt" || mode === "dragon-conqueror") {
    // The Dragon Utopia is a CENTER-tile field, so it can only come from a
    // center slot. Compatible when at least one center slot can host one.
    if (centerPlans.some((plan) => centerCanYield(plan, "dragon_utopia"))) {
      return [];
    }
    return [
      `${VICTORY_LABELS[mode]} needs a Dragon Utopia, but this design leaves no centre slot that can host one — every centre Ⅶ field is designated away from a Utopia (or there is no centre slot). Set a centre slot's Ⅶ field to Dragon Utopia, or leave one as a random draw.`
    ];
  }

  if (mode === "grail") {
    // A viiField "grail" designation forces a Grail even onto a non-Grail tile
    // (no pool tile spent). Every other Grail dig site needs a pool Grail tile,
    // placed on a Grail-capable center slot OR overflowed onto a face-down
    // Near/Far slot (takeRemainingGrailTiles). Cap the tile-fed hosts by the
    // pool's Grail-tile count. Near/Far hosts are counted optimistically (setup
    // shares them with forced Obelisks — a very tight layout soft-fills from the
    // random pool, never a hard failure), keeping this conservative.
    const forcedGrail = centerPlans.filter((plan) => plan.viiField === "grail").length;
    const grailHostSlots =
      centerPlans.filter((plan) => plan.viiField !== "grail" && centerCanYield(plan, "grail")).length +
      plans.filter(
        (plan) => (plan.group === "near" || plan.group === "far") && plan.faceDown && !plan.tileDefId
      ).length;
    const capacity = forcedGrail + Math.min(grailHostSlots, centerObjectiveTileCount("grail"));
    if (capacity < 2) {
      return [
        `${VICTORY_LABELS.grail} seeds 2 Grail dig sites, but this design can host only ${capacity}. Free up a centre slot (set its Ⅶ field to Grail or leave it a random draw), or add face-down Near/Far slots for the Grail overflow.`
      ];
    }
    return [];
  }

  return [];
}

/** Building suffixes the designer may pre-build (shared across factions). */
export const MAP_PRESET_BUILDING_OPTIONS: { id: string; label: string }[] = [
  { id: "citadel", label: "Citadel" },
  { id: "city_hall", label: "City Hall" },
  { id: "mage_guild", label: "Mage Guild" },
  { id: "dwelling_bronze", label: "Bronze dwelling" },
  { id: "dwelling_silver", label: "Silver dwelling" },
  { id: "dwelling_gold", label: "Gold dwelling" },
  { id: "marketplace", label: "Marketplace" },
  { id: "blacksmith", label: "Blacksmith" },
  { id: "resource_silo", label: "Resource Silo" },
  { id: "tavern", label: "Tavern" }
];

export const MAP_PRESET_VICTORY_OPTIONS: { id: VictoryMode; label: string }[] = (
  Object.keys(VICTORY_MODE_LABELS) as VictoryMode[]
).map((id) => ({ id, label: VICTORY_MODE_LABELS[id] }));

/**
 * Obelisk role picker for the designer. "classic" is the ABSENCE of a config
 * (the locked-die house rule) — it is NOT a stored enum value; the editor maps
 * it to `obelisks: undefined`.
 */
export const MAP_PRESET_OBELISK_ROLE_OPTIONS: {
  id: CustomMapObeliskConfig["role"] | "classic";
  label: string;
  hint: string;
}[] = [
  {
    id: "classic",
    label: "Classic (locked die)",
    hint: "First visitor rolls the Attack die; every visitor then gets that same fixed reward."
  },
  {
    id: "monolith",
    label: "Monolith teleport",
    hint: "Every Obelisk joins one shared teleport network with designer Monolith tokens."
  },
  { id: "bonus", label: "Fixed bonus", hint: "Each visitor gets the same designer-chosen reward." },
  {
    id: "victory-only",
    label: "Victory marker only",
    hint: "No reward at all — an Obelisk still counts toward the Holy-Grail dig."
  }
];

/** Bonus-kind picker for the "bonus" Obelisk role (editor dropdown order). */
export const MAP_PRESET_OBELISK_BONUS_KINDS: { id: CustomMapObeliskBonus["kind"]; label: string }[] = [
  { id: "morale", label: "+1 morale" },
  { id: "search", label: "Search a deck" },
  { id: "resources", label: "Resources" },
  { id: "movement", label: "Movement" },
  { id: "dice", label: "Treasure / Resource dice" }
];

/** Fresh default reward when the designer switches the "bonus" role's kind. */
export function defaultObeliskBonusForKind(kind: CustomMapObeliskBonus["kind"]): CustomMapObeliskBonus {
  switch (kind) {
    case "morale":
      return { kind: "morale", amount: 1 };
    case "search":
      return { kind: "search", deck: "artifacts", count: 1 };
    case "resources":
      return { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 };
    case "movement":
      return { kind: "movement", amount: 1 };
    case "dice":
      return { kind: "dice", treasure: 1, resource: 0 };
  }
}
