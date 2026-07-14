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

/** Local match (mirrors adventure-setup) to avoid a circular import. */
function tileMatchesSecretFeature(def: TileDefinition, feature: SecretTileFeature): boolean {
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
    preset.startingBuildings = raw.startingBuildings
      .filter((id): id is string => typeof id === "string" && BUILDING_SUFFIXES.has(id))
      .slice(0, 12);
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
    for (const entry of raw.timedEvents.slice(0, 16)) {
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
  return effect.text;
}

/** Short bullet lines for lobby / designer summary. */
export function describeCustomMapPreset(preset: CustomMapPreset | null | undefined): string[] {
  if (!preset || !customMapPresetIsActive(preset)) {
    return [];
  }
  const lines: string[] = [];
  if (preset.victoryMode) {
    lines.push(`Victory: ${VICTORY_LABELS[preset.victoryMode] ?? preset.victoryMode}`);
  }
  if (preset.startingResources) {
    lines.push(`Starting resources: ${formatResources(preset.startingResources)}`);
  }
  if (preset.startingProduction) {
    lines.push(`Income: ${formatResources(preset.startingProduction)}`);
  }
  if (preset.startingBuildings && preset.startingBuildings.length > 0) {
    lines.push(`Buildings: ${preset.startingBuildings.map((id) => id.replace(/_/g, " ")).join(", ")}`);
  }
  if (preset.startingUnits) {
    if (preset.startingUnits.length === 0) {
      lines.push("Starting army: none");
    } else {
      lines.push(
        `Starting army: ${preset.startingUnits
          .map((u) => `lv${u.level} ${u.side}`)
          .join(", ")}`
      );
    }
  }
  if (preset.startingBonuses && preset.startingBonuses.length > 0) {
    lines.push(`Start bonus: ${preset.startingBonuses.map(describeBonus).join("; ")}`);
  }
  if (preset.timedEvents && preset.timedEvents.length > 0) {
    for (const event of preset.timedEvents) {
      lines.push(`Round ${event.round}: ${describeTimedEffect(event.effect)}`);
    }
  }
  if (preset.roundLimit) {
    lines.push(`Suggested length: ${preset.roundLimit} rounds`);
  }
  if (preset.notes) {
    lines.push(preset.notes);
  }
  return lines;
}

/**
 * Merge a map preset into lobby game options (resources, army, buildings,
 * victory). Does not touch the tile plan — caller sets customMap separately.
 */
export function applyCustomMapPresetToOptions(
  options: GameSetupOptions,
  preset: CustomMapPreset | null | undefined
): string[] {
  if (!preset || !customMapPresetIsActive(preset)) {
    return [];
  }
  const changes: string[] = [];
  if (preset.victoryMode) {
    options.victoryMode = preset.victoryMode;
    changes.push(`victory ${VICTORY_LABELS[preset.victoryMode] ?? preset.victoryMode}`);
  }
  if (preset.startingResources) {
    options.startingResources = { ...preset.startingResources };
    changes.push(`resources ${formatResources(preset.startingResources)}`);
  }
  if (preset.startingProduction) {
    options.startingProduction = { ...preset.startingProduction };
    changes.push(`income ${formatResources(preset.startingProduction)}`);
  }
  if (preset.startingBuildings) {
    options.startingBuildings = [...preset.startingBuildings];
    changes.push(`buildings ${preset.startingBuildings.join(", ") || "none"}`);
  }
  if (preset.startingUnits) {
    options.startingUnits = preset.startingUnits.map((u) => ({ ...u }));
    changes.push(
      preset.startingUnits.length === 0
        ? "army: none"
        : `army ${preset.startingUnits.map((u) => `lv${u.level} ${u.side}`).join(", ")}`
    );
  }
  return changes;
}

/** How many pool tiles of a group match a secret feature (designer demand check). */
export function countPoolTilesMatchingFeature(
  group: CustomMapTilePlan["group"],
  feature: SecretTileFeature,
  options?: { seaBand?: CustomMapTilePlan["seaBand"]; subBand?: CustomMapTilePlan["subBand"] }
): number {
  return Object.values(allTileDefinitions).filter((def) => {
    if (def.group !== group) {
      return false;
    }
    // Band filters are applied at setup via seaTileBand/subterraneanTileBand;
    // count is a soft designer hint — exact band filtering happens in setup.
    void options;
    return tileMatchesSecretFeature(def, feature);
  }).length;
}

/**
 * Designer warnings: secret feature demand exceeds remaining pool supply, or a
 * feature has zero matches (will fall back to pure random in game).
 */
export function secretFeatureDemandWarnings(plans: CustomMapTilePlan[]): string[] {
  const demand = new Map<string, { feature: SecretTileFeature; group: string; count: number }>();
  for (const plan of plans) {
    if (!plan.faceDown || !plan.secretFeature || plan.tileDefId) {
      continue;
    }
    const key = `${plan.group}:${plan.secretFeature}:${plan.seaBand ?? ""}:${plan.subBand ?? ""}`;
    const current = demand.get(key) ?? {
      feature: plan.secretFeature,
      group: plan.group,
      count: 0
    };
    current.count += 1;
    demand.set(key, current);
  }
  const warnings: string[] = [];
  for (const entry of demand.values()) {
    const supply = countPoolTilesMatchingFeature(entry.group as CustomMapTilePlan["group"], entry.feature);
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
