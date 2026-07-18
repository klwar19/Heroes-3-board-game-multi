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
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TileDefinition } from "@/data/map/types";
import { seaTileBand, subterraneanTileBand, TILE_GROUP_BAND_LABELS, VII_FIELD_LOCATION } from "./adventure";
import { VICTORY_MODE_LABELS } from "./ruleset";
import { DEFAULT_OBELISK_BONUS, MAX_CUSTOM_GUARD_UNITS, MAX_FAR_TILES_PER_PLAYER } from "./state";
import {
  DEFAULT_VICTORY_CONDITION_VP,
  describeCustomWinCondition,
  describeVictoryPointObjective
} from "./victory-points";
import type {
  CustomCenterHexPlan,
  CustomCenterHexReward,
  CustomGuardSpec,
  CustomMapObeliskBonus,
  CustomMapObeliskConfig,
  CustomMapObject,
  CustomMapObjectKind,
  CustomMapObjectPlacement,
  CustomMapObjectivesConfig,
  CustomMapPreset,
  CustomMapTilePlan,
  CustomStartingUnit,
  CustomWinCondition,
  DragonUtopiaGuards,
  GameDifficulty,
  GameSetupOptions,
  SecretTileFeature,
  UnitLevel,
  VictoryMode,
  VictoryPointObjective
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

/** Largest amount a single center-hex resource reward may grant, per resource. */
export const MAX_CENTER_HEX_RESOURCE = 50;
/** Largest Victory-Point award a designer may attach to a center hex. */
export const MAX_CENTER_HEX_VP = 10;
/** Largest Treasure-dice count a center-hex reward may roll. */
export const MAX_CENTER_HEX_DICE = 3;
/** Largest Search size a center-hex reward may grant per shared deck. */
export const MAX_CENTER_HEX_SEARCH = 5;
/** The three adventure resources a center-hex reward may carry. */
const CENTER_HEX_RESOURCES = ["gold", "buildingMaterials", "valuables"] as const;

/** True when `unitDefId` names a unit that can guard a hex (it has a `neutral` side). */
export function isCustomGuardUnit(unitDefId: unknown): unitDefId is string {
  return typeof unitDefId === "string" && Boolean(coreUnitDefinitions[unitDefId]?.neutral);
}

/**
 * Clamp a designer guard ({@link CustomGuardSpec}) to exactly one clean arm:
 * a certain army of known neutral-sided units (capped, unknown ids dropped) or
 * a level 1-7; `undefined` when nothing valid remains. `units` wins when both
 * are present. Shared by the persistence sanitiser, setup validation and the
 * designer UI so the clamp can never drift.
 */
export function sanitizeCustomGuardSpec(input: unknown): CustomGuardSpec | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const units = Array.isArray(raw.units)
    ? raw.units.filter(isCustomGuardUnit).slice(0, MAX_CUSTOM_GUARD_UNITS)
    : [];
  if (units.length > 0) {
    return { units };
  }
  const level = clampInt(raw.level, 1, 7, 0);
  return level > 0 ? { level } : undefined;
}

/**
 * Clamp a designer center-hex reward ({@link CustomCenterHexReward}) to clean,
 * positive integers, or `undefined` when nothing valid remains.
 */
export function sanitizeCenterHexReward(input: unknown): CustomCenterHexReward | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const reward: CustomCenterHexReward = {};
  for (const key of CENTER_HEX_RESOURCES) {
    const amount = clampInt(raw[key], 1, MAX_CENTER_HEX_RESOURCE, 0);
    if (amount > 0) {
      reward[key] = amount;
    }
  }
  const dice = clampInt(raw.treasureDice, 1, MAX_CENTER_HEX_DICE, 0);
  if (dice > 0) {
    reward.treasureDice = dice;
  }
  for (const key of ["searchSpell", "searchAbility", "searchArtifact"] as const) {
    const size = clampInt(raw[key], 1, MAX_CENTER_HEX_SEARCH, 0);
    if (size > 0) {
      reward[key] = size;
    }
  }
  return Object.keys(reward).length > 0 ? reward : undefined;
}

/**
 * Clamp a whole center-hex customization ({@link CustomMapTilePlan.centerHex})
 * — guard, first-clear reward, VP — or `undefined` when every arm is empty.
 */
export function sanitizeCenterHexPlan(input: unknown): CustomCenterHexPlan | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const centerHex: CustomCenterHexPlan = {};
  const guard = sanitizeCustomGuardSpec(raw.guard);
  if (guard) {
    centerHex.guard = guard;
  }
  const reward = sanitizeCenterHexReward(raw.reward);
  if (reward) {
    centerHex.reward = reward;
  }
  const vp = clampInt(raw.vp, 1, MAX_CENTER_HEX_VP, 0);
  if (vp > 0) {
    centerHex.vp = vp;
  }
  return Object.keys(centerHex).length > 0 ? centerHex : undefined;
}

/**
 * Fold the pre-centerHex `viiFieldReward` / `viiFieldVp` plan fields (one
 * earlier build wrote them) into the canonical {@link CustomCenterHexPlan}.
 * An explicit `centerHex` always wins; the legacy pair only fills gaps.
 */
export function foldLegacyViiBonus(
  centerHex: CustomCenterHexPlan | undefined,
  legacyReward: unknown,
  legacyVp: unknown
): CustomCenterHexPlan | undefined {
  const reward = sanitizeCenterHexReward(legacyReward);
  const vp = clampInt(legacyVp, 1, MAX_CENTER_HEX_VP, 0);
  if (!reward && vp <= 0) {
    return centerHex;
  }
  const folded: CustomCenterHexPlan = { ...(centerHex ?? {}) };
  if (!folded.reward && reward) {
    folded.reward = reward;
  }
  if (folded.vp === undefined && vp > 0) {
    folded.vp = vp;
  }
  return Object.keys(folded).length > 0 ? folded : undefined;
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

const DIFFICULTY_VALUES = new Set<GameDifficulty>(["easy", "normal", "hard", "impossible"]);

const DIFFICULTY_LABELS: Record<GameDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  impossible: "Impossible"
};

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
/** The six tile groups a clear_tile_cubes filter may target. */
const TILE_GROUPS = new Set(["starting", "far", "near", "center", "sea", "subterranean"]);
const OBELISK_ROLES = new Set<CustomMapObeliskConfig["role"]>(["monolith", "bonus", "victory-only"]);
const VICTORY_POINT_OBJECTIVE_KINDS = new Set<VictoryPointObjective["kind"]>([
  "control-towns",
  "flag-mines",
  "hero-level",
  "defeat-dragon-utopia"
]);

/** Max designer-chosen VP objectives per map (sanitisation cap). */
export const MAX_VICTORY_POINT_OBJECTIVES = 4;

/** The custom-win-condition kinds a map / lobby may author (sanitiser allowlist). */
const CUSTOM_WIN_CONDITION_KINDS = new Set<CustomWinCondition["kind"]>([
  "control-towns",
  "flag-mines",
  "hero-level",
  "gold",
  "artifacts",
  "buildings",
  "obelisks",
  "defeat-heroes",
  "defeat-dragon-utopia"
]);

/** Max custom win conditions on one map/game (preset + lobby MERGED — sanitisation cap). */
export const MAX_CUSTOM_WIN_CONDITIONS = 4;

export type { CustomMapObeliskBonus, CustomMapObeliskConfig };

/** Storage/editor limit for one designed map. Keep UI and sanitization in lock-step. */
export const MAX_TIMED_EVENTS = 32;

/** How many designer-placed one-hex objects a map may carry (sanitisation cap). */
export const MAX_CUSTOM_MAP_OBJECTS = 16;

/**
 * How many gates a single colored pair (network) may carry — extras dropped by
 * the sanitiser. A colored gate is now a per-color teleport NETWORK (like the
 * Monolith network), not a strict two-gate pair, so up to 8 of one color may sit
 * on the map. Counted across BOTH sources (plan gate tokens + gate objects) by
 * {@link validateCustomMapObjects}.
 */
export const MAX_GATES_PER_PAIR = 8;

const CUSTOM_MAP_OBJECT_KINDS = new Set<CustomMapObjectKind>([
  "monolith",
  "whirlpool",
  "gate",
  "garrison",
  "keymaster_tent",
  "barrier",
  "oneway_entrance",
  "oneway_exit"
]);

/** The three one-way exit-pick modes (allow-list for sanitize + the editor). */
export const ONEWAY_EXIT_MODES = ["random", "certain", "mix"] as const;

/** The outpost kinds — STANDALONE-only one-hex objects out of every tile. */
export const OUTPOST_OBJECT_KINDS = new Set<CustomMapObjectKind>(["garrison", "keymaster_tent", "barrier"]);

/** Designer effect kinds (order = editor dropdown order). */
export const TIMED_EFFECT_KINDS = [
  "clear_visitable_cubes",
  "clear_tile_cubes",
  "resources",
  "experience",
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
  clear_tile_cubes: "Clear black cubes (Tiles)",
  resources: "All players gain/lose resources",
  experience: "All heroes gain experience",
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
    case "clear_tile_cubes":
      return { kind: "clear_tile_cubes", groups: ["far"], excludeSettlementTiles: false };
    case "resources":
      return { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 };
    case "experience":
      return { kind: "experience", amount: 2 };
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
 * Sanitize ONE Victory-Points objective (untrusted). Drops unknown kinds and a
 * zero/degenerate `vp`; clamps each kind's threshold to its legal band. Returns
 * null for anything unusable so the array filter removes it.
 */
function sanitizeVictoryPointObjective(input: unknown): VictoryPointObjective | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as { kind?: unknown; vp?: unknown; count?: unknown; level?: unknown };
  if (typeof raw.kind !== "string" || !VICTORY_POINT_OBJECTIVE_KINDS.has(raw.kind as VictoryPointObjective["kind"])) {
    return null;
  }
  // A degenerate `vp` (0, negative, non-numeric) is a no-op objective — drop it
  // (min 0 so a real 0 falls through the < 1 guard instead of clamping up to 1).
  const vp = clampInt(raw.vp, 0, 10, 0);
  if (vp < 1) {
    return null;
  }
  switch (raw.kind as VictoryPointObjective["kind"]) {
    case "control-towns":
      return { kind: "control-towns", vp, count: clampInt(raw.count, 1, 4, 1) };
    case "flag-mines":
      return { kind: "flag-mines", vp, count: clampInt(raw.count, 1, 8, 1) };
    case "hero-level":
      return { kind: "hero-level", vp, level: clampInt(raw.level, 2, 7, 2) };
    case "defeat-dragon-utopia":
      return { kind: "defeat-dragon-utopia", vp };
  }
}

/**
 * Sanitize the Victory-Points block (untrusted). `enabled` must be LITERALLY
 * true; `victoryConditionVp` clamps to 0-10 (default {@link
 * DEFAULT_VICTORY_CONDITION_VP}); up to {@link MAX_VICTORY_POINT_OBJECTIVES}
 * objectives survive (unknown kinds / degenerate ones dropped). Returns
 * undefined when not enabled — so a `{ enabled: false }` block collapses away.
 */
function sanitizeVictoryPoints(input: unknown): CustomMapPreset["victoryPoints"] | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as { enabled?: unknown; victoryConditionVp?: unknown; objectives?: unknown };
  if (raw.enabled !== true) {
    return undefined;
  }
  const victoryPoints: NonNullable<CustomMapPreset["victoryPoints"]> = {
    enabled: true,
    victoryConditionVp: clampInt(raw.victoryConditionVp, 0, 10, DEFAULT_VICTORY_CONDITION_VP)
  };
  if (Array.isArray(raw.objectives)) {
    const objectives = raw.objectives
      .map(sanitizeVictoryPointObjective)
      .filter((objective): objective is VictoryPointObjective => objective !== null)
      .slice(0, MAX_VICTORY_POINT_OBJECTIVES);
    if (objectives.length > 0) {
      victoryPoints.objectives = objectives;
    }
  }
  return victoryPoints;
}

/**
 * Sanitize ONE custom win condition (untrusted). Drops an unknown kind; clamps
 * each kind's threshold to its legal band. The min-clamps (control-towns ≥ 2 so
 * the home town alone can't instant-win, level ≥ 2, gold ≥ 20…) REDUCE but never
 * eliminate the instant-win foot-gun — a condition already met at setup ends the
 * game on the first action (the designer's responsibility). Returns null for an
 * unusable input so the array filter removes it.
 */
function sanitizeCustomWinCondition(input: unknown): CustomWinCondition | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as { kind?: unknown; count?: unknown; level?: unknown; amount?: unknown };
  if (
    typeof raw.kind !== "string" ||
    !CUSTOM_WIN_CONDITION_KINDS.has(raw.kind as CustomWinCondition["kind"])
  ) {
    return null;
  }
  switch (raw.kind as CustomWinCondition["kind"]) {
    case "control-towns":
      return { kind: "control-towns", count: clampInt(raw.count, 2, 8, 2) };
    case "flag-mines":
      return { kind: "flag-mines", count: clampInt(raw.count, 2, 12, 2) };
    case "hero-level":
      return { kind: "hero-level", level: clampInt(raw.level, 2, 7, 2) };
    case "gold":
      return { kind: "gold", amount: clampInt(raw.amount, 20, 500, 20) };
    case "artifacts":
      return { kind: "artifacts", count: clampInt(raw.count, 1, 10, 1) };
    case "buildings":
      // min 8: the DEFAULT opening is 3 buildings (citadel/mage_guild/dwelling)
      // and a preset can force at most 7 (Castle's blacksmith + the 6 core-
      // suffix buildings any faction defines), so 8 is the smallest instant-win-
      // safe floor. max 15: a single Town caps near 8, so a high target is a
      // genuine multi-Town economic race. The reader sums all controlled Towns.
      return { kind: "buildings", count: clampInt(raw.count, 8, 15, 8) };
    case "obelisks":
      // 1-4 matches the grail dig knob's Obelisk range. NOTE: obelisk visits are
      // tracked per player only in GRAIL victory mode (see CustomWinCondition).
      return { kind: "obelisks", count: clampInt(raw.count, 1, 4, 1) };
    case "defeat-heroes":
      return { kind: "defeat-heroes", count: clampInt(raw.count, 1, 6, 1) };
    case "defeat-dragon-utopia":
      return { kind: "defeat-dragon-utopia" };
  }
}

/**
 * Sanitize a LIST of custom win conditions (untrusted) — the SHARED sanitiser
 * used by both the designed-preset path and the lobby `SET_GAME_OPTIONS` block.
 * Unknown kinds / degenerate params are dropped/clamped and the list is capped at
 * {@link MAX_CUSTOM_WIN_CONDITIONS}. A non-array yields `[]`.
 */
export function sanitizeCustomWinConditions(input: unknown): CustomWinCondition[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map(sanitizeCustomWinCondition)
    .filter((condition): condition is CustomWinCondition => condition !== null)
    .slice(0, MAX_CUSTOM_WIN_CONDITIONS);
}

/**
 * The EFFECTIVE custom-win-condition list for a game: the map-authored list
 * first, the lobby-added list appended, exact-duplicate deduped (same kind +
 * params) and capped at {@link MAX_CUSTOM_WIN_CONDITIONS}. Map-authored
 * conditions are never removed — the lobby can only ADD. Pure (no sanitisation);
 * callers pass already-sanitised lists. Shared by the engine build
 * (`applyLobbyCustomWinConditions`) and the lobby UI so they never drift.
 */
export function mergeCustomWinConditions(
  presetConditions: CustomWinCondition[] | undefined,
  lobbyConditions: CustomWinCondition[] | undefined
): CustomWinCondition[] {
  const merged: CustomWinCondition[] = [];
  const seen = new Set<string>();
  for (const condition of [...(presetConditions ?? []), ...(lobbyConditions ?? [])]) {
    const key = JSON.stringify(condition);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(condition);
    if (merged.length >= MAX_CUSTOM_WIN_CONDITIONS) {
      break;
    }
  }
  return merged;
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
  // A gate / tent / barrier / one-way monolith carries a colored pair 1-4
  // (required); the other kinds never do.
  if (
    kind === "gate" ||
    kind === "keymaster_tent" ||
    kind === "barrier" ||
    kind === "oneway_entrance" ||
    kind === "oneway_exit"
  ) {
    if (raw.pair !== 1 && raw.pair !== 2 && raw.pair !== 3 && raw.pair !== 4) {
      return null;
    }
    object.pair = raw.pair;
  }
  // A designer guard (optional): the LEGACY plain number is a level 1-7; the
  // spec form adds "certain army" guards. Both normalise to a clean spec. A
  // Barrier and a one-way EXIT are NEVER guarded (printed rules) — stripped.
  const guard = kind === "barrier" || kind === "oneway_exit" ? undefined : sanitizeObjectGuard(raw.guard);
  if (guard) {
    object.guard = guard;
  }
  // One-way extras: an ENTRANCE may pick its exit mode; an EXIT may be flagged
  // always-pickable ("mix" mode). Anything else never carries either.
  const rawOneway = input as { exitMode?: unknown; alwaysPickable?: unknown };
  if (kind === "oneway_entrance" && ONEWAY_EXIT_MODES.includes(rawOneway.exitMode as never)) {
    object.exitMode = rawOneway.exitMode as CustomMapObject["exitMode"];
  }
  if (kind === "oneway_exit" && rawOneway.alwaysPickable === true) {
    object.alwaysPickable = true;
  }
  // Designer yellow border edges on the object hex (absolute dirs 0-5).
  const rawEdges = (input as { borderEdges?: unknown }).borderEdges;
  if (Array.isArray(rawEdges)) {
    const edges = [
      ...new Set(rawEdges.filter((dir): dir is number => Number.isInteger(dir) && dir >= 0 && dir <= 5))
    ].sort((a, b) => a - b);
    if (edges.length > 0) {
      object.borderEdges = edges;
    }
  }
  return object;
}

/**
 * Normalise a {@link CustomMapObject.guard} — a LEGACY plain level number or a
 * full {@link CustomGuardSpec} — to a clean spec (or `undefined`).
 */
export function sanitizeObjectGuard(input: unknown): CustomGuardSpec | undefined {
  if (typeof input === "number") {
    const level = clampInt(input, 1, 7, 0);
    return level > 0 ? { level } : undefined;
  }
  return sanitizeCustomGuardSpec(input);
}

/** The guard spec of a {@link CustomMapObject}, whichever shape it was stored in. */
export function objectGuardSpec(object: Pick<CustomMapObject, "guard">): CustomGuardSpec | undefined {
  return sanitizeObjectGuard(object.guard);
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
    // At most MAX_GATES_PER_PAIR gates per colored network — extras are dropped
    // deterministically, keeping the first ones in list order. (This per-array
    // cap sees only objects; the cross-source count — objects + plan gate tokens
    // — lives in validateCustomMapObjects, which WARNS rather than truncates.)
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
    // Positive = every player GAINS; negative = every player LOSES (the engine
    // floors the treasury at 0). Clamp each field to [-50, 50]; a legacy
    // positive-only entry (was 0..30) stays byte-identical. At least one nonzero.
    const gold = clampInt(raw.gold, -50, 50, 0);
    const buildingMaterials = clampInt(raw.buildingMaterials, -50, 50, 0);
    const valuables = clampInt(raw.valuables, -50, 50, 0);
    if (gold === 0 && buildingMaterials === 0 && valuables === 0) {
      return null;
    }
    return { kind: "resources", gold, buildingMaterials, valuables };
  }
  if (raw.kind === "experience") {
    return { kind: "experience", amount: clampInt(raw.amount, 1, 5, 1) };
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
  if (raw.kind === "clear_tile_cubes" && Array.isArray(raw.groups)) {
    const groups = raw.groups.filter(
      (group): group is "starting" | "far" | "near" | "center" | "sea" | "subterranean" =>
        typeof group === "string" && TILE_GROUPS.has(group)
    );
    if (groups.length === 0) {
      return null;
    }
    const effect: Extract<CustomMapTimedEffect, { kind: "clear_tile_cubes" }> = {
      kind: "clear_tile_cubes",
      groups: [...new Set(groups)]
    };
    if (raw.excludeSettlementTiles === true) {
      effect.excludeSettlementTiles = true;
    }
    return effect;
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
  // Map-settings defaults (difficulty / far-tile supply). Garbage difficulty is
  // dropped; farTilesPerPlayer clamps to 0..MAX (a non-number is dropped, never
  // coerced to a silent 0). farTileOpening is kept only as a real boolean.
  if (typeof raw.difficulty === "string" && DIFFICULTY_VALUES.has(raw.difficulty as GameDifficulty)) {
    preset.difficulty = raw.difficulty as GameDifficulty;
  }
  if (typeof raw.farTileOpening === "boolean") {
    preset.farTileOpening = raw.farTileOpening;
  }
  if (typeof raw.farTilesPerPlayer === "number" && Number.isFinite(raw.farTilesPerPlayer)) {
    preset.farTilesPerPlayer = Math.max(
      0,
      Math.min(MAX_FAR_TILES_PER_PLAYER, Math.floor(raw.farTilesPerPlayer))
    );
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
        const event: CustomMapTimedEvent = { round, effect };
        // Optional repeat schedule: an int in [2, 10] fires the event again
        // every N rounds. Anything below 2 (incl. a hand-edited 1) or a non-int
        // is DROPPED — the event stays a one-shot (byte-identical to legacy).
        const rawRepeat = (entry as CustomMapTimedEvent).repeatEveryRounds;
        if (typeof rawRepeat === "number" && Number.isFinite(rawRepeat)) {
          const repeat = Math.floor(rawRepeat);
          if (repeat >= 2) {
            event.repeatEveryRounds = Math.min(10, repeat);
          }
        }
        events.push(event);
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
  if (raw.victoryPoints !== undefined) {
    const victoryPoints = sanitizeVictoryPoints(raw.victoryPoints);
    if (victoryPoints) {
      preset.victoryPoints = victoryPoints;
    }
  }
  if (raw.customWinConditions !== undefined) {
    const conditions = sanitizeCustomWinConditions(raw.customWinConditions);
    if (conditions.length > 0) {
      preset.customWinConditions = conditions;
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
      preset.difficulty ||
      preset.farTileOpening !== undefined ||
      preset.farTilesPerPlayer !== undefined ||
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
      Boolean(preset.objectives) ||
      Boolean(preset.victoryPoints?.enabled) ||
      (preset.customWinConditions && preset.customWinConditions.length > 0)
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

/**
 * Schedule prefix for a timed event — "Round 4" for a one-shot, or "Round 4,
 * then every 3 rounds" for a repeating event. Shared by the designer summary
 * line and the editor's live preview.
 */
export function describeTimedEventSchedule(event: {
  round: number;
  repeatEveryRounds?: number;
}): string {
  if (event.repeatEveryRounds && event.repeatEveryRounds >= 2) {
    return `Round ${event.round}, then every ${event.repeatEveryRounds} rounds`;
  }
  return `Round ${event.round}`;
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

/**
 * Icon-tagged lines for the Victory-Points block (lobby banner + designer
 * summary). 🎖️ for the mode headline (naming the two end triggers and the
 * completion VP) and one 🎖️ line per extra objective.
 */
export function describeVictoryPointsConfig(
  config: NonNullable<CustomMapPreset["victoryPoints"]>,
  roundLimit?: number
): CustomMapPresetEntry[] {
  const completionVp = config.victoryConditionVp ?? DEFAULT_VICTORY_CONDITION_VP;
  const trigger = roundLimit
    ? `game ends at round ${roundLimit} or on the victory condition`
    : "game ends on the victory condition (set a round limit for a hard cap)";
  const entries: CustomMapPresetEntry[] = [
    {
      icon: "🎖️",
      text: `Victory Points: ${trigger}; most VPs wins (completion +${completionVp} VP)`
    }
  ];
  for (const objective of config.objectives ?? []) {
    entries.push({
      icon: "🎖️",
      text: `Objective: ${describeVictoryPointObjective(objective)} — +${objective.vp} VP`
    });
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
    const gains: string[] = [];
    const losses: string[] = [];
    for (const [amount, label] of [
      [effect.gold ?? 0, "gold"],
      [effect.buildingMaterials ?? 0, "materials"],
      [effect.valuables ?? 0, "valuables"]
    ] as const) {
      if (amount > 0) {
        gains.push(`${amount} ${label}`);
      } else if (amount < 0) {
        losses.push(`${-amount} ${label}`);
      }
    }
    const clauses: string[] = [];
    if (gains.length > 0) {
      clauses.push(`gain ${gains.join(", ")}`);
    }
    if (losses.length > 0) {
      clauses.push(`lose ${losses.join(", ")}`);
    }
    return `all players ${clauses.join(" and ") || "gain nothing"}`;
  }
  if (effect.kind === "experience") {
    return `all heroes gain ${effect.amount} experience`;
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
  if (effect.kind === "clear_tile_cubes") {
    const bands = effect.groups.map((group) => TILE_GROUP_BAND_LABELS[group]);
    return `clear black cubes on ${bands.join(", ")} Tiles${
      effect.excludeSettlementTiles ? " (skip settlements)" : ""
    }`;
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
  if (preset.difficulty) {
    entries.push({ icon: "⚙️", text: `Difficulty: ${DIFFICULTY_LABELS[preset.difficulty]}` });
  }
  if (preset.farTileOpening !== undefined || preset.farTilesPerPlayer !== undefined) {
    const on = preset.farTileOpening !== false;
    const count = preset.farTilesPerPlayer;
    entries.push({
      icon: "🀆",
      text: !on
        ? "Additional Ⅱ–Ⅲ tiles: off"
        : count !== undefined
          ? `Additional Ⅱ–Ⅲ tiles: ${count} per player`
          : "Additional Ⅱ–Ⅲ tiles: on"
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
      entries.push({
        icon: "⏳",
        text: `${describeTimedEventSchedule(event)}: ${describeTimedEffect(event.effect)}`
      });
    }
  }
  if (preset.roundLimit) {
    // With Victory Points on, the round limit is the HARD end trigger — not a
    // mere suggestion. The wording changes so a designer knows which it is.
    entries.push({
      icon: "🕰️",
      text: preset.victoryPoints?.enabled
        ? `Game ends at round ${preset.roundLimit} (then Victory Points are scored)`
        : `Suggested length: ${preset.roundLimit} rounds`
    });
  }
  if (preset.obelisks) {
    entries.push({ icon: "🗿", text: describeObeliskRole(preset.obelisks) });
  }
  if (preset.objectives) {
    for (const line of describeObjectivesConfig(preset.objectives)) {
      entries.push(line);
    }
  }
  if (preset.victoryPoints?.enabled) {
    for (const line of describeVictoryPointsConfig(preset.victoryPoints, preset.roundLimit)) {
      entries.push(line);
    }
  }
  if (preset.customWinConditions && preset.customWinConditions.length > 0) {
    for (const condition of preset.customWinConditions) {
      entries.push({ icon: "🏁", text: `Custom win: ${describeCustomWinCondition(condition)}` });
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
  | "difficulty"
  | "farTileOpening"
  | "farTilesPerPlayer"
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
  if (preset.difficulty) {
    keys.push("difficulty");
  }
  if (preset.farTileOpening !== undefined) {
    keys.push("farTileOpening");
  }
  if (preset.farTilesPerPlayer !== undefined) {
    keys.push("farTilesPerPlayer");
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
  if (preset.difficulty && !skip?.has("difficulty")) {
    options.difficulty = preset.difficulty;
    changes.push(`difficulty ${DIFFICULTY_LABELS[preset.difficulty]}`);
  }
  if (preset.farTileOpening !== undefined && !skip?.has("farTileOpening")) {
    options.farTileOpening = preset.farTileOpening;
    changes.push(`Ⅱ–Ⅲ tile opening ${preset.farTileOpening ? "on" : "off"}`);
  }
  if (preset.farTilesPerPlayer !== undefined && !skip?.has("farTilesPerPlayer")) {
    options.farTilesPerPlayer = preset.farTilesPerPlayer;
    changes.push(`Ⅱ–Ⅲ tiles per player ${preset.farTilesPerPlayer}`);
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
      case "difficulty":
        options.difficulty = defaults.difficulty;
        changes.push(`difficulty back to ${DIFFICULTY_LABELS[defaults.difficulty]}`);
        break;
      case "farTileOpening":
        options.farTileOpening = defaults.farTileOpening;
        changes.push("Ⅱ–Ⅲ tile opening back to the scenario default");
        break;
      case "farTilesPerPlayer":
        options.farTilesPerPlayer = defaults.farTilesPerPlayer;
        changes.push("Ⅱ–Ⅲ tiles per player back to the scenario default");
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

/** Difficulty chips for the map-settings designer (Easy … Impossible). */
export const MAP_PRESET_DIFFICULTY_OPTIONS: { id: GameDifficulty; label: string }[] = (
  ["easy", "normal", "hard", "impossible"] as GameDifficulty[]
).map((id) => ({ id, label: DIFFICULTY_LABELS[id] }));

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

/** Victory-Points objective kinds the designer may add (editor dropdown order). */
export const VICTORY_POINT_OBJECTIVE_OPTIONS: {
  id: VictoryPointObjective["kind"];
  label: string;
  hint: string;
}[] = [
  {
    id: "control-towns",
    label: "Control N Towns",
    hint: "Award VP to every player controlling at least N Towns when the game is scored."
  },
  {
    id: "flag-mines",
    label: "Flag N Mines / Settlements",
    hint: "Award VP to every player holding at least N flagged Mines + Settlements at scoring."
  },
  {
    id: "hero-level",
    label: "Reach Hero level N",
    hint: "Award VP to every player whose main Hero is at least level N at scoring."
  },
  {
    id: "defeat-dragon-utopia",
    label: "Defeat a Dragon Utopia",
    hint: "Award VP to each player who defeated a Dragon Utopia at any point in the game."
  }
];

/** Fresh default objective when the designer adds one / switches its kind. */
export function defaultVictoryPointObjective(kind: VictoryPointObjective["kind"]): VictoryPointObjective {
  switch (kind) {
    case "control-towns":
      return { kind: "control-towns", vp: 3, count: 2 };
    case "flag-mines":
      return { kind: "flag-mines", vp: 3, count: 3 };
    case "hero-level":
      return { kind: "hero-level", vp: 3, level: 5 };
    case "defeat-dragon-utopia":
      return { kind: "defeat-dragon-utopia", vp: 5 };
  }
}

/**
 * Custom-win-condition kinds the designer/host may add (editor + lobby dropdown
 * order). `param` names which numeric field the row edits and its clamp band
 * (matches {@link sanitizeCustomWinConditions}); `null` = no parameter.
 */
export const CUSTOM_WIN_CONDITION_OPTIONS: {
  id: CustomWinCondition["kind"];
  label: string;
  param: { field: "count" | "level" | "amount"; label: string; min: number; max: number } | null;
}[] = [
  { id: "control-towns", label: "Control N Towns", param: { field: "count", label: "Towns", min: 2, max: 8 } },
  { id: "flag-mines", label: "Flag N Mines / Settlements", param: { field: "count", label: "Mines", min: 2, max: 12 } },
  { id: "hero-level", label: "Reach Hero level N", param: { field: "level", label: "Level", min: 2, max: 7 } },
  { id: "gold", label: "Reach N gold", param: { field: "amount", label: "Gold", min: 20, max: 500 } },
  { id: "artifacts", label: "Own N Artifacts", param: { field: "count", label: "Artifacts", min: 1, max: 10 } },
  { id: "buildings", label: "Build N Buildings", param: { field: "count", label: "Buildings", min: 8, max: 15 } },
  { id: "obelisks", label: "Visit N Obelisks (grail maps)", param: { field: "count", label: "Obelisks", min: 1, max: 4 } },
  { id: "defeat-heroes", label: "Defeat N enemy Heroes", param: { field: "count", label: "Heroes", min: 1, max: 6 } },
  { id: "defeat-dragon-utopia", label: "Defeat the Dragon Utopia", param: null }
];

/** Fresh default custom win condition when one is added / its kind is switched. */
export function defaultCustomWinCondition(kind: CustomWinCondition["kind"]): CustomWinCondition {
  switch (kind) {
    case "control-towns":
      return { kind: "control-towns", count: 3 };
    case "flag-mines":
      return { kind: "flag-mines", count: 4 };
    case "hero-level":
      return { kind: "hero-level", level: 5 };
    case "gold":
      return { kind: "gold", amount: 100 };
    case "artifacts":
      return { kind: "artifacts", count: 3 };
    case "buildings":
      return { kind: "buildings", count: 10 };
    case "obelisks":
      return { kind: "obelisks", count: 2 };
    case "defeat-heroes":
      return { kind: "defeat-heroes", count: 1 };
    case "defeat-dragon-utopia":
      return { kind: "defeat-dragon-utopia" };
  }
}
