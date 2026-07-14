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
import { seaTileBand, subterraneanTileBand } from "./adventure";
import type {
  CustomMapPreset,
  CustomMapTilePlan,
  CustomStartingUnit,
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
    for (const entry of raw.timedEvents.slice(0, 32)) {
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
      (preset.notes && preset.notes.length > 0)
  );
}

const VICTORY_LABELS: Record<VictoryMode, string> = {
  conquest: "Conquest",
  grail: "Grail Hunt",
  "dragon-hunt": "Dragon Hunt",
  "dragon-conqueror": "Dragon Conqueror"
};

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

export const MAP_PRESET_VICTORY_OPTIONS: { id: VictoryMode; label: string }[] = [
  { id: "conquest", label: "Conquest" },
  { id: "grail", label: "Grail Hunt" },
  { id: "dragon-hunt", label: "Dragon Hunt" },
  { id: "dragon-conqueror", label: "Dragon Conqueror" }
];
