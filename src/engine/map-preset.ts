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
import { CREATURE_BANKS, type CreatureBankId } from "@/data/map/creature-banks";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TileDefinition } from "@/data/map/types";
import { getStoryScene, isStoryScene, STORY_SCENE_IDS } from "@/data/story/scenes";
import { RAID_BOSS_ABILITY_CHOICES } from "@/data/anime/bosses";
import { seaTileBand, subterraneanTileBand, TILE_GROUP_BAND_LABELS, VII_FIELD_LOCATION } from "./adventure";
import { CUSTOM_BOSS_LIMITS, MAX_CUSTOM_RAID_BOSSES } from "./raid-bosses";
import { VICTORY_MODE_LABELS } from "./ruleset";
import { DEFAULT_OBELISK_BONUS, MAX_CUSTOM_GUARD_UNITS, MAX_FAR_TILES_PER_PLAYER } from "./state";
import {
  DEFAULT_VICTORY_CONDITION_VP,
  describeCustomWinCondition,
  describeVictoryPointObjective
} from "./victory-points";
import {
  describeGuardArmyGrouped,
  fewGuardUnitDefId,
  isCustomGuardUnitEntry,
  isFewGuardSlot,
  isPackGuardSlot,
  packGuardUnitDefId
} from "./map-design-features";
import type {
  CustomCenterHexPlan,
  CustomCenterHexReward,
  CustomFieldReward,
  CustomGuardSpec,
  CustomHexEvent,
  CustomMapMinesConfig,
  CustomMapObeliskBonus,
  CustomMapObeliskConfig,
  CustomMapRandomTownsConfig,
  CustomMapSettlementConfig,
  CustomMapSettlementFieldPlan,
  CustomMapObject,
  CustomMapObjectKind,
  CustomMapObjectPlacement,
  CustomMapObjectivesConfig,
  CustomMapPreset,
  CustomMapTilePlan,
  CustomObjectFieldPlan,
  CustomRaidBossDef,
  CustomStartingUnit,
  CustomWinCondition,
  HoldWithGrailTarget,
  DragonUtopiaGuards,
  FactionId,
  GameDifficulty,
  GameSetupOptions,
  SecretTileFeature,
  UnitLevel,
  VictoryMode,
  VictoryPointObjective
} from "./state";
import { MAX_HEX_EVENTS } from "./state";

export type { CustomMapPreset };

/**
 * CANONICAL Secret-landmark matcher — the single copy the designer counts,
 * the demand warnings AND the setup draw all share (adventure-setup imports
 * it from here, so the three consumers can never diverge).
 */
/** Every legal {@link SecretTileFeature} id (local copy — map-preset is imported
 *  by adventure-setup, so it cannot reuse that module's `isSecretTileFeature`). */
const SECRET_FEATURE_IDS = new Set<SecretTileFeature>([
  "gold_mine",
  "valuables_mine",
  "materials_mine",
  "any_mine",
  "obelisk",
  "settlement",
  "town",
  "objective"
]);

/** True when `value` is a legal {@link SecretTileFeature} id. */
export function isSecretTileFeatureId(value: unknown): value is SecretTileFeature {
  return typeof value === "string" && SECRET_FEATURE_IDS.has(value as SecretTileFeature);
}

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

/**
 * The allowed secret-landmark set for a face-down plan, folding the multi-value
 * `secretFeatures` and the legacy single `secretFeature` into one deduped list
 * (empty when the slot is a pure-random draw). The single copy every consumer
 * — setup draw, designer count, blind-choice — shares.
 */
export function planAllowedSecretFeatures(
  plan: Pick<CustomMapTilePlan, "secretFeature" | "secretFeatures">
): SecretTileFeature[] {
  const list =
    plan.secretFeatures && plan.secretFeatures.length > 0
      ? plan.secretFeatures
      : plan.secretFeature
        ? [plan.secretFeature]
        : [];
  return [...new Set(list.filter(isSecretTileFeatureId))];
}

/**
 * Landmark bans on a face-down plan (`excludeFeatures`). Empty = no ban.
 * Shared by setup draw, designer counts, and demand warnings.
 */
export function planExcludedSecretFeatures(
  plan: Pick<CustomMapTilePlan, "excludeFeatures">
): SecretTileFeature[] {
  const list = plan.excludeFeatures ?? [];
  return [...new Set(list.filter(isSecretTileFeatureId))];
}

/** Whether a tile definition matches ANY of the allowed secret landmarks. */
export function tileMatchesAnySecretFeature(
  def: TileDefinition,
  features: SecretTileFeature[]
): boolean {
  return features.some((feature) => tileMatchesSecretFeature(def, feature));
}

/** Whether a tile definition matches ANY banned landmark. */
export function tileMatchesAnyExcludedFeature(
  def: TileDefinition,
  features: SecretTileFeature[]
): boolean {
  return features.length > 0 && features.some((feature) => tileMatchesSecretFeature(def, feature));
}

/**
 * Pool-draw predicate: include OR-list (empty = any) AND NOT any exclude.
 * Exact pins / one-of do not use this — the designer already named the tile.
 */
export function tilePassesSecretFilters(
  def: TileDefinition,
  allowed: SecretTileFeature[],
  excluded: SecretTileFeature[]
): boolean {
  if (allowed.length > 0 && !tileMatchesAnySecretFeature(def, allowed)) {
    return false;
  }
  if (tileMatchesAnyExcludedFeature(def, excluded)) {
    return false;
  }
  return true;
}

/** The three legal center-tile Ⅶ-field designations (allow-list for sanitize). */
export const VII_FIELD_DESIGNATIONS = new Set<NonNullable<CustomMapTilePlan["viiField"]>>([
  "town",
  "settlement",
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
/** How many separate Search(X) steps a designer reward may queue per deck. */
export const MAX_CENTER_HEX_SEARCH_TIMES = 5;
/** Main-hero XP from a designer field reward (1–5). */
export const MAX_FIELD_REWARD_EXPERIENCE = 5;
/** Movement points from a designer field reward (1–3). */
export const MAX_FIELD_REWARD_MOVEMENT = 3;
/** Resource dice from a designer field reward (1–3). */
export const MAX_FIELD_REWARD_RESOURCE_DICE = 3;
/** The three adventure resources a center-hex reward may carry. */
const CENTER_HEX_RESOURCES = ["gold", "buildingMaterials", "valuables"] as const;
/** Search size keys paired with their optional Times multipliers. */
const CENTER_HEX_SEARCH_SPECS = [
  { size: "searchSpell", times: "searchSpellTimes", label: "Spells" },
  { size: "searchAbility", times: "searchAbilityTimes", label: "Abilities" },
  { size: "searchArtifact", times: "searchArtifactTimes", label: "Artifacts" }
] as const;

/**
 * True when `unitDefId` is a legal certain-army entry: a Neutral unit, a
 * `random:<tier>` Neutral slot, a `random-pack:<tier>` Pack slot, or a
 * `pack:<unitDefId>` named Pack.
 */
export function isCustomGuardUnit(unitDefId: unknown): unitDefId is string {
  return isCustomGuardUnitEntry(unitDefId);
}

/** Known faction ids that may appear on packFaction (from unit defs). */
const PACK_FACTION_IDS = new Set(
  Object.values(coreUnitDefinitions)
    .filter((d) => d.pack)
    .map((d) => d.faction as string)
);

function sanitizePackFaction(value: unknown): FactionId | "random" | undefined {
  if (value === "random") return "random";
  if (typeof value === "string" && PACK_FACTION_IDS.has(value)) {
    return value as FactionId;
  }
  return undefined;
}

/**
 * Clamp a designer guard ({@link CustomGuardSpec}) to exactly one clean arm:
 * a certain army of known entries (capped, unknown ids dropped) or a level
 * 1-7; `undefined` when nothing valid remains. `units` wins when both are
 * present. Keeps `levelArmy: "packs"` and `packFaction` when valid.
 * Shared by the persistence sanitiser, setup validation and the designer UI.
 */
export function sanitizeCustomGuardSpec(input: unknown): CustomGuardSpec | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  let units = Array.isArray(raw.units)
    ? raw.units.filter(isCustomGuardUnit).slice(0, MAX_CUSTOM_GUARD_UNITS)
    : [];
  const packFaction = sanitizePackFaction(raw.packFaction);

  if (units.length > 0) {
    // Drop named packs/fews that contradict a concrete faction lock.
    if (packFaction && packFaction !== "random") {
      units = units.filter((id) => {
        if (isPackGuardSlot(id)) {
          const unitDefId = packGuardUnitDefId(id);
          return unitDefId ? coreUnitDefinitions[unitDefId]?.faction === packFaction : false;
        }
        if (isFewGuardSlot(id)) {
          const unitDefId = fewGuardUnitDefId(id);
          return unitDefId ? coreUnitDefinitions[unitDefId]?.faction === packFaction : false;
        }
        return true;
      });
    }
    if (units.length === 0) {
      // Empty after faction strip — fall through to level if present.
    } else {
      return {
        units,
        ...(packFaction ? { packFaction } : {})
      };
    }
  }
  const level = clampInt(raw.level, 1, 7, 0);
  if (level <= 0) return undefined;
  const levelArmy = raw.levelArmy === "packs" ? ("packs" as const) : undefined;
  return {
    level,
    ...(levelArmy ? { levelArmy } : {}),
    ...(packFaction && levelArmy === "packs" ? { packFaction } : {})
  };
}

/**
 * Clamp a designer field reward ({@link CustomFieldReward} /
 * {@link CustomCenterHexReward}) to clean positive integers / known flags, or
 * `undefined` when nothing valid remains. Search rewards are Times×Search(X):
 * a size of N with times T queues T separate Search(N) steps. Times is only
 * kept when the matching size is set; absent / 1 is the legacy single-Search
 * default. Special arms (morale, Ability Empower token, Statistic empower, XP,
 * movement, Resource dice) are optional and additive.
 */
export function sanitizeFieldReward(input: unknown): CustomFieldReward | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const reward: CustomFieldReward = {};
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
  for (const { size, times } of CENTER_HEX_SEARCH_SPECS) {
    const searchSize = clampInt(raw[size], 1, MAX_CENTER_HEX_SEARCH, 0);
    if (searchSize > 0) {
      reward[size] = searchSize;
      const t = clampInt(raw[times], 1, MAX_CENTER_HEX_SEARCH_TIMES, 0);
      // Only store times when > 1 so legacy single-Search snapshots stay lean.
      if (t > 1) {
        reward[times] = t;
      }
    }
  }
  // Morale: only ±1 (matches timed events / starting bonuses). Anything else drops.
  if (raw.morale === 1 || raw.morale === -1) {
    reward.morale = raw.morale;
  } else if (typeof raw.morale === "number") {
    const m = Math.trunc(raw.morale);
    if (m >= 1) reward.morale = 1;
    else if (m <= -1) reward.morale = -1;
  }
  if (raw.abilityEmpowerToken === true) {
    reward.abilityEmpowerToken = true;
  }
  if (raw.empowerStatistic === true) {
    reward.empowerStatistic = true;
  }
  const experience = clampInt(raw.experience, 1, MAX_FIELD_REWARD_EXPERIENCE, 0);
  if (experience > 0) {
    reward.experience = experience;
  }
  const movement = clampInt(raw.movement, 1, MAX_FIELD_REWARD_MOVEMENT, 0);
  if (movement > 0) {
    reward.movement = movement;
  }
  const resourceDice = clampInt(raw.resourceDice, 1, MAX_FIELD_REWARD_RESOURCE_DICE, 0);
  if (resourceDice > 0) {
    reward.resourceDice = resourceDice;
  }
  return Object.keys(reward).length > 0 ? reward : undefined;
}

/** @deprecated Prefer {@link sanitizeFieldReward} — identical clamp. */
export function sanitizeCenterHexReward(input: unknown): CustomCenterHexReward | undefined {
  return sanitizeFieldReward(input);
}

/**
 * Plain-words summary of a designer field reward, e.g.
 * "7 gold · 2× Search(5) Artifacts · Ability Empower token · +1 morale".
 * Empty → "".
 */
export function describeFieldReward(reward: CustomFieldReward | undefined | null): string {
  if (!reward) return "";
  const parts: string[] = [];
  if ((reward.gold ?? 0) > 0) parts.push(`${reward.gold} gold`);
  if ((reward.buildingMaterials ?? 0) > 0) parts.push(`${reward.buildingMaterials} materials`);
  if ((reward.valuables ?? 0) > 0) parts.push(`${reward.valuables} valuables`);
  if ((reward.treasureDice ?? 0) > 0) {
    parts.push(
      reward.treasureDice === 1 ? "1 Treasure die" : `${reward.treasureDice} Treasure dice`
    );
  }
  for (const { size, times, label } of CENTER_HEX_SEARCH_SPECS) {
    const searchSize = reward[size] ?? 0;
    if (searchSize <= 0) continue;
    const t = reward[times] ?? 1;
    parts.push(t > 1 ? `${t}× Search(${searchSize}) ${label}` : `Search(${searchSize}) ${label}`);
  }
  if (reward.morale === 1) parts.push("+1 morale");
  if (reward.morale === -1) parts.push("−1 morale");
  if (reward.abilityEmpowerToken) parts.push("Ability Empower token");
  if (reward.empowerStatistic) parts.push("Empower a Statistic");
  if ((reward.experience ?? 0) > 0) {
    parts.push(reward.experience === 1 ? "+1 experience" : `+${reward.experience} experience`);
  }
  if ((reward.movement ?? 0) > 0) {
    parts.push(reward.movement === 1 ? "+1 movement" : `+${reward.movement} movement`);
  }
  if ((reward.resourceDice ?? 0) > 0) {
    parts.push(
      reward.resourceDice === 1 ? "1 Resource die" : `${reward.resourceDice} Resource dice`
    );
  }
  return parts.join(" · ");
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
  // controlVp / holdRounds use non-positive-as-absent (clampInt would lift 0 → 1).
  if (typeof raw.controlVp === "number" && Number.isFinite(raw.controlVp) && raw.controlVp > 0) {
    centerHex.controlVp = Math.min(MAX_CENTER_HEX_VP, Math.floor(raw.controlVp));
  }
  if (
    typeof raw.holdRoundsToWin === "number" &&
    Number.isFinite(raw.holdRoundsToWin) &&
    raw.holdRoundsToWin > 0
  ) {
    centerHex.holdRoundsToWin = Math.min(MAX_SETTLEMENT_HOLD_ROUNDS, Math.floor(raw.holdRoundsToWin));
  }
  if (raw.holdRequiresGrail === true) {
    centerHex.holdRequiresGrail = true;
  }
  // holdRequiresGrail alone is meaningless without a hold threshold.
  if (!centerHex.holdRoundsToWin) {
    delete centerHex.holdRequiresGrail;
  }
  if (raw.winCondition === true) {
    centerHex.winCondition = true;
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
  "defeat-dragon-utopia",
  "hold-with-grail"
]);

/** Max custom win conditions on one map/game (preset + lobby MERGED — sanitisation cap). */
export const MAX_CUSTOM_WIN_CONDITIONS = 4;

export type { CustomMapObeliskBonus, CustomMapObeliskConfig, CustomMapSettlementConfig };

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
  "oneway_exit",
  "creature_bank"
]);

/** The three one-way exit-pick modes (allow-list for sanitize + the editor). */
export const ONEWAY_EXIT_MODES = ["random", "certain", "mix"] as const;

/** The outpost kinds — STANDALONE-only one-hex objects out of every tile. */
export const OUTPOST_OBJECT_KINDS = new Set<CustomMapObjectKind>(["garrison", "keymaster_tent", "barrier"]);

/**
 * Object kinds that may ONLY sit as a standalone hex (never a tile-slot form).
 * Outposts + the designer Creature Bank pin. Teleporters may be either form.
 */
export const STANDALONE_ONLY_OBJECT_KINDS = new Set<CustomMapObjectKind>([
  "garrison",
  "keymaster_tent",
  "barrier",
  "creature_bank"
]);

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
  "market_trade",
  "choice",
  "note",
  "story"
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
  market_trade: "Each player may trade resources",
  choice: "Each player chooses one reward",
  note: "Announcement (feed note only)",
  story: "Story scene (visual novel)"
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
    case "market_trade":
      return { kind: "market_trade" };
    case "choice":
      return {
        kind: "choice",
        prompt: "Choose one reward",
        options: [
          { kind: "resources", gold: 0, buildingMaterials: 0, valuables: 1 },
          { kind: "resources", gold: 0, buildingMaterials: 2, valuables: 0 }
        ]
      };
    case "note":
      return { kind: "note", text: "Something stirs across the land…" };
    case "story":
      return { kind: "story", sceneId: STORY_SCENE_IDS[0] ?? "" };
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

/** A designed solo map supports one human plus at most three computer seats. */
export const MAX_SINGLE_PLAYER_MAP_OPPONENTS = 3;

/**
 * Sanitise the solo-only role carried by one starting tile. Kept here beside
 * the other map-persistence sanitizers so HTTP, PartyKit and direct engine
 * setup all accept exactly the same shape.
 */
export function sanitizeSinglePlayerMapStart(
  input: unknown
): NonNullable<CustomMapTilePlan["singlePlayer"]> | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as { role?: unknown; bonus?: unknown };
  if (raw.role !== "human" && raw.role !== "computer") {
    return undefined;
  }
  const bonus = raw.role === "computer" ? sanitizeResources(raw.bonus) : undefined;
  const hasBonus = Boolean(bonus && Object.values(bonus).some((amount) => amount > 0));
  return {
    role: raw.role,
    ...(hasBonus ? { bonus } : {})
  };
}

export type SinglePlayerMapDeployment = {
  human: CustomMapTilePlan;
  computers: CustomMapTilePlan[];
};

/**
 * Resolve a COMPLETE map-authored solo deployment. Partial/invalid markings are
 * deliberately inactive: legacy maps then retain their normal seat-count and
 * seat-order behaviour instead of starting with a surprising partial layout.
 */
export function singlePlayerMapDeployment(
  plans: readonly CustomMapTilePlan[] | null | undefined,
  maxOpponents: number = MAX_SINGLE_PLAYER_MAP_OPPONENTS
): SinglePlayerMapDeployment | null {
  const opponentLimit = Math.max(
    0,
    Math.min(MAX_SINGLE_PLAYER_MAP_OPPONENTS, Number.isFinite(maxOpponents) ? Math.floor(maxOpponents) : 0)
  );
  const marked = (plans ?? []).filter(
    (plan) => plan.group === "starting" && sanitizeSinglePlayerMapStart(plan.singlePlayer)
  );
  if (marked.length === 0) {
    return null;
  }
  const humans = marked.filter((plan) => plan.singlePlayer?.role === "human");
  const computers = marked.filter((plan) => plan.singlePlayer?.role === "computer");
  if (
    humans.length !== 1 ||
    computers.length < 1 ||
    computers.length > opponentLimit ||
    marked.length !== humans.length + computers.length
  ) {
    return null;
  }
  return { human: humans[0], computers };
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
  if (raw.kind === "experience") {
    return { kind: "experience", amount: clampInt(raw.amount, 1, 5, 1) };
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
  if (raw.kind === "resource_roll") {
    // Roll 2–3 Resource dice, keep 1 (a single die would make "choose 1" moot).
    return { kind: "resource_roll", count: clampInt(raw.count, 2, 3, 2) };
  }
  if (raw.kind === "ability_token") {
    return { kind: "ability_token" };
  }
  return null;
}

/** Cap on the number of Obelisk awards a "bonus" role may list. */
export const MAX_OBELISK_BONUSES = 4;

/** Cap on the extra VP a designer may attach to each controlled settlement. */
export const MAX_SETTLEMENT_VP = 10;

/** Cap on consecutive rounds a hold-to-win settlement may require. */
export const MAX_SETTLEMENT_HOLD_ROUNDS = 10;

/**
 * Sanitize a per-tile settlement customization ({@link CustomMapTilePlan.settlement}).
 * Returns undefined when every arm is empty so nothing is serialized.
 */
export function sanitizeSettlementFieldPlan(input: unknown): CustomMapSettlementFieldPlan | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    guard?: unknown;
    reward?: unknown;
    vp?: unknown;
    holdRoundsToWin?: unknown;
    holdRequiresGrail?: unknown;
    winCondition?: unknown;
  };
  const plan: CustomMapSettlementFieldPlan = {};
  const guard = sanitizeCustomGuardSpec(raw.guard);
  if (guard) {
    plan.guard = guard;
  }
  const reward = sanitizeFieldReward(raw.reward);
  if (reward) {
    plan.reward = reward;
  }
  // clampInt(0, min=1, …) would lift 0 → 1; treat non-positive as "absent".
  if (typeof raw.vp === "number" && Number.isFinite(raw.vp) && raw.vp > 0) {
    plan.vp = Math.min(MAX_SETTLEMENT_VP, Math.floor(raw.vp));
  }
  if (
    typeof raw.holdRoundsToWin === "number" &&
    Number.isFinite(raw.holdRoundsToWin) &&
    raw.holdRoundsToWin > 0
  ) {
    plan.holdRoundsToWin = Math.min(MAX_SETTLEMENT_HOLD_ROUNDS, Math.floor(raw.holdRoundsToWin));
  }
  if (raw.holdRequiresGrail === true) {
    plan.holdRequiresGrail = true;
  }
  if (!plan.holdRoundsToWin) {
    delete plan.holdRequiresGrail;
  }
  if (raw.winCondition === true) {
    plan.winCondition = true;
  }
  return Object.keys(plan).length > 0 ? plan : undefined;
}

/**
 * Sanitize one SPECIFIC (per-tile) object plan ({@link CustomMapTilePlan.objectPlans}
 * entry): guard / reward / VP / break flags / winCondition, all optional.
 * Returns undefined when every arm is empty so nothing is serialized.
 */
export function sanitizeObjectFieldPlan(input: unknown): CustomObjectFieldPlan | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    guard?: unknown;
    reward?: unknown;
    vp?: unknown;
    breakField?: unknown;
    persistentGuard?: unknown;
    unlimitedRounds?: unknown;
    winCondition?: unknown;
  };
  const plan: CustomObjectFieldPlan = {};
  const guard = sanitizeCustomGuardSpec(raw.guard);
  if (guard) {
    plan.guard = guard;
  }
  const reward = sanitizeFieldReward(raw.reward);
  if (reward) {
    plan.reward = reward;
  }
  if (typeof raw.vp === "number" && Number.isFinite(raw.vp) && raw.vp > 0) {
    plan.vp = Math.min(MAX_CENTER_HEX_VP, Math.floor(raw.vp));
  }
  if (raw.breakField === true) plan.breakField = true;
  if (raw.persistentGuard === true) plan.persistentGuard = true;
  if (raw.unlimitedRounds === true) plan.unlimitedRounds = true;
  if (raw.winCondition === true) plan.winCondition = true;
  return Object.keys(plan).length > 0 ? plan : undefined;
}

/** The object kinds a per-tile SPECIFIC plan may target. */
export const OBJECT_PLAN_KINDS = ["obelisk", "mine"] as const;
export type ObjectPlanKind = (typeof OBJECT_PLAN_KINDS)[number];

/**
 * Sanitize a tile's whole `objectPlans` record — unknown kinds dropped, each
 * plan clamped; undefined when nothing valid remains.
 */
export function sanitizeObjectPlans(
  input: unknown
): CustomMapTilePlan["objectPlans"] | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const plans: NonNullable<CustomMapTilePlan["objectPlans"]> = {};
  for (const kind of OBJECT_PLAN_KINDS) {
    const plan = sanitizeObjectFieldPlan(raw[kind]);
    if (plan) {
      plans[kind] = plan;
    }
  }
  return Object.keys(plans).length > 0 ? plans : undefined;
}

/**
 * Sanitize the map-wide Obelisk role. Unknown role → undefined (treated as
 * ABSENT = classic locked-die). A guard applies to every role (an Obelisk may be
 * guarded in any mode). Only "bonus" carries awards: the multi-award `bonuses`
 * list (degenerate entries dropped, capped) with an optional `bonusMode` OR the
 * legacy single `bonus`, falling back to {@link DEFAULT_OBELISK_BONUS} so the
 * stored config always spells out the reward the engine will grant.
 */
/** Shared break-field flag trio (obelisks / mines). Only true values survive. */
function sanitizeBreakFlags(raw: {
  breakField?: unknown;
  persistentGuard?: unknown;
  unlimitedRounds?: unknown;
}): {
  breakField?: true;
  persistentGuard?: true;
  unlimitedRounds?: true;
} {
  const flags: {
    breakField?: true;
    persistentGuard?: true;
    unlimitedRounds?: true;
  } = {};
  if (raw.breakField === true) flags.breakField = true;
  if (raw.persistentGuard === true) flags.persistentGuard = true;
  if (raw.unlimitedRounds === true) flags.unlimitedRounds = true;
  return flags;
}

function sanitizeObeliskConfig(input: unknown): CustomMapObeliskConfig | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    role?: unknown;
    bonus?: unknown;
    bonuses?: unknown;
    bonusMode?: unknown;
    guard?: unknown;
    breakField?: unknown;
    persistentGuard?: unknown;
    unlimitedRounds?: unknown;
  };
  if (typeof raw.role !== "string" || !OBELISK_ROLES.has(raw.role as CustomMapObeliskConfig["role"])) {
    return undefined;
  }
  const role = raw.role as CustomMapObeliskConfig["role"];
  const guard = sanitizeCustomGuardSpec(raw.guard);
  const breakFlags = sanitizeBreakFlags(raw);
  if (role !== "bonus") {
    const config: CustomMapObeliskConfig = { role, ...breakFlags };
    if (guard) config.guard = guard;
    return config;
  }
  const config: CustomMapObeliskConfig = { role, ...breakFlags };
  const bonuses = Array.isArray(raw.bonuses)
    ? raw.bonuses
        .map(sanitizeObeliskBonus)
        .filter((bonus): bonus is CustomMapObeliskBonus => bonus !== null)
        .slice(0, MAX_OBELISK_BONUSES)
    : [];
  if (bonuses.length > 0) {
    config.bonuses = bonuses;
    if (raw.bonusMode === "choose" && bonuses.length > 1) {
      config.bonusMode = "choose";
    }
  } else {
    config.bonus = sanitizeObeliskBonus(raw.bonus) ?? DEFAULT_OBELISK_BONUS;
  }
  if (guard) {
    config.guard = guard;
  }
  return config;
}

/** Sanitize MAP-WIDE mine options (guard + break flags). Empty → undefined. */
function sanitizeMinesConfig(input: unknown): CustomMapMinesConfig | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    guard?: unknown;
    breakField?: unknown;
    persistentGuard?: unknown;
    unlimitedRounds?: unknown;
  };
  const config: CustomMapMinesConfig = { ...sanitizeBreakFlags(raw) };
  const guard = sanitizeCustomGuardSpec(raw.guard);
  if (guard) config.guard = guard;
  return config.guard || config.breakField || config.persistentGuard || config.unlimitedRounds
    ? config
    : undefined;
}

/** Sanitize MAP-WIDE Random Town options. Empty → undefined. */
function sanitizeRandomTownsConfig(input: unknown): CustomMapRandomTownsConfig | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    guard?: unknown;
    captureReward?: unknown;
    incomeGold?: unknown;
    vp?: unknown;
  };
  const config: CustomMapRandomTownsConfig = {};
  const guard = sanitizeCustomGuardSpec(raw.guard);
  if (guard) config.guard = guard;
  if (raw.captureReward && typeof raw.captureReward === "object") {
    const r = raw.captureReward as Record<string, unknown>;
    const gold = clampInt(r.gold, 0, 50, 0);
    const buildingMaterials = clampInt(r.buildingMaterials, 0, 30, 0);
    const valuables = clampInt(r.valuables, 0, 30, 0);
    if (gold + buildingMaterials + valuables > 0) {
      config.captureReward = {
        ...(gold > 0 ? { gold } : {}),
        ...(buildingMaterials > 0 ? { buildingMaterials } : {}),
        ...(valuables > 0 ? { valuables } : {})
      };
    }
  }
  if (typeof raw.incomeGold === "number" && Number.isFinite(raw.incomeGold) && raw.incomeGold >= 0) {
    config.incomeGold = Math.min(50, Math.floor(raw.incomeGold));
  }
  if (typeof raw.vp === "number" && Number.isFinite(raw.vp) && raw.vp > 0) {
    config.vp = Math.min(MAX_SETTLEMENT_VP, Math.floor(raw.vp));
  }
  return config.guard || config.captureReward || config.incomeGold !== undefined || config.vp
    ? config
    : undefined;
}

/**
 * Sanitize the MAP-WIDE settlement options: a guard ({@link CustomGuardSpec})
 * and/or extra VP per controlled settlement (clamped). Returns undefined when
 * neither survives, so an empty block never persists.
 */
function sanitizeSettlementConfig(input: unknown): CustomMapSettlementConfig | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as { guard?: unknown; vp?: unknown };
  const guard = sanitizeCustomGuardSpec(raw.guard);
  const vp = clampInt(raw.vp, 0, MAX_SETTLEMENT_VP, 0);
  const config: CustomMapSettlementConfig = {};
  if (guard) {
    config.guard = guard;
  }
  if (vp > 0) {
    config.vp = vp;
  }
  return config.guard || config.vp !== undefined ? config : undefined;
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
    hiddenGrailUtopia?: unknown;
    grailObelisksRequired?: unknown;
    utopiaGuards?: unknown;
    utopiaBonusSearch?: unknown;
    grailAsUtopia?: unknown;
    grailDigCost?: unknown;
    grailDigReward?: unknown;
    grailPossessionVp?: unknown;
    grailBuildAt?: unknown;
    grailBuildReward?: unknown;
  };
  const config: CustomMapObjectivesConfig = {};
  if (raw.hiddenGrailUtopia === true) {
    config.hiddenGrailUtopia = true;
  }
  if (raw.grailObelisksRequired === 1 || raw.grailObelisksRequired === 2 || raw.grailObelisksRequired === 3 || raw.grailObelisksRequired === 4) {
    config.grailObelisksRequired = raw.grailObelisksRequired;
  }
  if (raw.utopiaGuards === "four" || raw.utopiaGuards === "by-difficulty") {
    config.utopiaGuards = raw.utopiaGuards as DragonUtopiaGuards;
  }
  if (raw.utopiaBonusSearch === 1 || raw.utopiaBonusSearch === 2 || raw.utopiaBonusSearch === 3) {
    config.utopiaBonusSearch = raw.utopiaBonusSearch;
  }
  if (
    raw.grailAsUtopia === "always" ||
    raw.grailAsUtopia === "after-dig-utopia" ||
    raw.grailAsUtopia === "after-dig-empty"
  ) {
    config.grailAsUtopia = raw.grailAsUtopia;
  }
  if (raw.grailDigCost === 0 || raw.grailDigCost === 1 || raw.grailDigCost === 2) {
    config.grailDigCost = raw.grailDigCost;
  }
  if (raw.grailDigReward && typeof raw.grailDigReward === "object") {
    const r = raw.grailDigReward as Record<string, unknown>;
    const gold = clampInt(r.gold, 0, 50, 0);
    const buildingMaterials = clampInt(r.buildingMaterials, 0, 30, 0);
    const valuables = clampInt(r.valuables, 0, 30, 0);
    if (gold + buildingMaterials + valuables > 0) {
      config.grailDigReward = {
        ...(gold > 0 ? { gold } : {}),
        ...(buildingMaterials > 0 ? { buildingMaterials } : {}),
        ...(valuables > 0 ? { valuables } : {})
      };
    }
  }
  if (
    typeof raw.grailPossessionVp === "number" &&
    Number.isFinite(raw.grailPossessionVp) &&
    raw.grailPossessionVp > 0
  ) {
    config.grailPossessionVp = Math.min(20, Math.floor(raw.grailPossessionVp));
  }
  if (
    raw.grailBuildAt === "town" ||
    raw.grailBuildAt === "settlement" ||
    raw.grailBuildAt === "both" ||
    raw.grailBuildAt === "starting-town"
  ) {
    config.grailBuildAt = raw.grailBuildAt;
  }
  if (raw.grailBuildReward && typeof raw.grailBuildReward === "object") {
    const r = raw.grailBuildReward as Record<string, unknown>;
    const reward: NonNullable<CustomMapObjectivesConfig["grailBuildReward"]> = {};
    const gold = clampInt(r.gold, 0, 50, 0);
    const buildingMaterials = clampInt(r.buildingMaterials, 0, 30, 0);
    const valuables = clampInt(r.valuables, 0, 30, 0);
    if (gold > 0) reward.gold = gold;
    if (buildingMaterials > 0) reward.buildingMaterials = buildingMaterials;
    if (valuables > 0) reward.valuables = valuables;
    if (typeof r.vp === "number" && Number.isFinite(r.vp) && r.vp > 0) {
      reward.vp = Math.min(20, Math.floor(r.vp));
    }
    if (r.freeBuilding === true) reward.freeBuilding = true;
    if (Object.keys(reward).length > 0) {
      config.grailBuildReward = reward;
    }
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
function sanitizeHoldWithGrailTarget(input: unknown): HoldWithGrailTarget | null {
  if (input === "starting-town" || input === "settlement" || input === "random-town" || input === "random-settlement") {
    return input;
  }
  if (input && typeof input === "object" && typeof (input as { spaceId?: unknown }).spaceId === "string") {
    const spaceId = (input as { spaceId: string }).spaceId.trim();
    if (spaceId.length > 0 && spaceId.length <= 32) {
      return { spaceId };
    }
  }
  return null;
}

function sanitizeCustomWinCondition(input: unknown): CustomWinCondition | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as {
    kind?: unknown;
    count?: unknown;
    level?: unknown;
    amount?: unknown;
    rounds?: unknown;
    target?: unknown;
  };
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
      return { kind: "defeat-dragon-utopia", count: clampInt(raw.count, 1, 6, 1) };
    case "hold-with-grail": {
      const target = sanitizeHoldWithGrailTarget(raw.target);
      if (!target) {
        return null;
      }
      return {
        kind: "hold-with-grail",
        rounds: clampInt(raw.rounds, 1, MAX_SETTLEMENT_HOLD_ROUNDS, 3),
        target
      };
    }
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
  const raw = input as {
    kind?: unknown;
    pair?: unknown;
    guard?: unknown;
    reward?: unknown;
    vp?: unknown;
    placement?: unknown;
    bankId?: unknown;
    bankSize?: unknown;
    garrisonBorderPassage?: unknown;
  };
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
    // Creature Bank pins are STANDALONE-only (a tile-slot form is dropped).
    // Outposts are also standalone-only in the designer, but a legacy tile-slot
    // outpost still sanitises so validateCustomMapObjects can surface the problem.
    if (kind === "creature_bank") {
      return null;
    }
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
  // Creature Bank pin: bankId REQUIRED (one of the 12 published banks); optional
  // fixed Polish size 1–4. Never carries a designer guard / first-clear reward /
  // yellow borders (a bank is always border-free — same as an on-tile bank token;
  // seals for a break-out choke go on neighbouring tiles, not the bank hex).
  if (kind === "creature_bank") {
    if (typeof raw.bankId !== "string" || !(raw.bankId in CREATURE_BANKS)) {
      return null;
    }
    object.bankId = raw.bankId as CreatureBankId;
    if (raw.bankSize === 1 || raw.bankSize === 2 || raw.bankSize === 3 || raw.bankSize === 4) {
      object.bankSize = raw.bankSize;
    }
    return object;
  }
  // A designer guard (optional): the LEGACY plain number is a level 1-7; the
  // spec form adds "certain army" guards. Both normalise to a clean spec. A
  // Barrier and a one-way EXIT are NEVER guarded (printed rules) — stripped.
  const guard = kind === "barrier" || kind === "oneway_exit" ? undefined : sanitizeObjectGuard(raw.guard);
  if (guard) {
    object.guard = guard;
  }
  // First-clear reward / VP (optional). Barriers never keep either (no fight,
  // no farmable free hex). One-way exits may carry a reward (landing bonus).
  if (kind !== "barrier") {
    const reward = sanitizeFieldReward(raw.reward);
    if (reward) {
      object.reward = reward;
    }
    if (typeof raw.vp === "number" && Number.isFinite(raw.vp) && raw.vp > 0) {
      object.vp = Math.min(MAX_CENTER_HEX_VP, Math.floor(raw.vp));
    }
  }
  // Exit-pick extras: a one-way ENTRANCE picks its exit mode; a one-way EXIT
  // may be flagged always-pickable ("mix" mode). Two-way GATES and MONOLITHS
  // share the whole vocabulary (they are both the origin AND a destination) —
  // matching the tile-token sanitizer. Anything else never carries either.
  const rawOneway = input as { exitMode?: unknown; alwaysPickable?: unknown };
  const carriesExitMode = kind === "oneway_entrance" || kind === "gate" || kind === "monolith";
  const carriesAlwaysPickable = kind === "oneway_exit" || kind === "gate" || kind === "monolith";
  if (carriesExitMode && ONEWAY_EXIT_MODES.includes(rawOneway.exitMode as never)) {
    object.exitMode = rawOneway.exitMode as CustomMapObject["exitMode"];
  }
  if (carriesAlwaysPickable && rawOneway.alwaysPickable === true) {
    object.alwaysPickable = true;
  }
  if (kind === "garrison") {
    // Garrisons are connectors by default. Preserve an explicit false so map
    // authors can still make a sealed outpost; absent legacy values inherit
    // the fixed, crossable default at materialisation/movement time.
    object.garrisonBorderPassage = raw.garrisonBorderPassage !== false;
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

/** Longest hex-event message a designer may store. */
export const MAX_HEX_EVENT_MESSAGE = 240;

/**
 * Sanitize one designer hex event: placement required (integer row/col), every
 * payload arm optional and clamped. Null when nothing meaningful remains (an
 * event with no message, reward, VP AND no guard does nothing — dropped).
 */
export function sanitizeHexEvent(input: unknown): CustomHexEvent | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as {
    id?: unknown;
    placement?: unknown;
    message?: unknown;
    reward?: unknown;
    vp?: unknown;
    guard?: unknown;
    mode?: unknown;
    replaceVisit?: unknown;
  };
  const placement = raw.placement as { row?: unknown; col?: unknown } | undefined;
  if (
    !placement ||
    typeof placement.row !== "number" ||
    typeof placement.col !== "number" ||
    !Number.isInteger(placement.row) ||
    !Number.isInteger(placement.col)
  ) {
    return null;
  }
  const event: CustomHexEvent = {
    id:
      typeof raw.id === "string" && raw.id.length > 0 && raw.id.length <= 40
        ? raw.id
        : `hexev_${placement.row}_${placement.col}`,
    placement: { row: placement.row, col: placement.col }
  };
  if (typeof raw.message === "string" && raw.message.trim().length > 0) {
    event.message = raw.message.trim().slice(0, MAX_HEX_EVENT_MESSAGE);
  }
  const reward = sanitizeFieldReward(raw.reward);
  if (reward) {
    event.reward = reward;
  }
  if (typeof raw.vp === "number" && Number.isFinite(raw.vp) && raw.vp > 0) {
    event.vp = Math.min(MAX_CENTER_HEX_VP, Math.floor(raw.vp));
  }
  const guard = sanitizeCustomGuardSpec(raw.guard);
  if (guard) {
    event.guard = guard;
  }
  if (raw.mode === "each-player") {
    event.mode = "each-player";
  }
  if (raw.replaceVisit === true) {
    event.replaceVisit = true;
  }
  if (!event.message && !event.reward && !event.vp && !event.guard) {
    return null;
  }
  return event;
}

/**
 * Sanitize the preset's hex-event list: degenerate entries dropped, one event
 * per hex (first wins), unique ids enforced, capped at {@link MAX_HEX_EVENTS}.
 */
export function sanitizeHexEvents(input: unknown): CustomHexEvent[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const events: CustomHexEvent[] = [];
  const seenHexes = new Set<string>();
  const seenIds = new Set<string>();
  for (const entry of input) {
    if (events.length >= MAX_HEX_EVENTS) {
      break;
    }
    const event = sanitizeHexEvent(entry);
    if (!event) {
      continue;
    }
    const hexKey = `${event.placement.row},${event.placement.col}`;
    if (seenHexes.has(hexKey)) {
      continue;
    }
    if (seenIds.has(event.id)) {
      event.id = `${event.id}_${hexKey}`;
      if (seenIds.has(event.id)) {
        continue;
      }
    }
    seenHexes.add(hexKey);
    seenIds.add(event.id);
    events.push(event);
  }
  return events;
}

/** Plain-words summary of one hex event (designer list rows / preset banner). */
export function describeHexEvent(event: CustomHexEvent): string {
  const parts: string[] = [];
  if (event.guard) {
    parts.push(
      event.guard.units && event.guard.units.length > 0
        ? `ambush: ${describeGuardArmyGrouped(event.guard.units)}`
        : `ambush guard Ⅰ-Ⅶ level ${event.guard.level ?? "?"}`
    );
  }
  const reward = describeFieldReward(event.reward);
  if (reward) {
    parts.push(reward);
  }
  if ((event.vp ?? 0) > 0) {
    parts.push(`+${event.vp} VP`);
  }
  if (event.message) {
    parts.push(`“${event.message.length > 32 ? `${event.message.slice(0, 32)}…` : event.message}”`);
  }
  if (event.mode === "each-player") {
    parts.push("every player");
  }
  if (event.replaceVisit) {
    parts.push("replaces the visit");
  }
  return parts.join(" · ") || "empty event";
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
  if (raw.kind === "market_trade") {
    return { kind: "market_trade" };
  }
  if (raw.kind === "choice" && Array.isArray(raw.options)) {
    const options = raw.options
      .map(sanitizeObeliskBonus)
      .filter((option): option is CustomMapObeliskBonus => option !== null)
      .slice(0, MAX_OBELISK_BONUSES);
    if (options.length < 2) {
      return null;
    }
    const prompt =
      typeof raw.prompt === "string"
        ? raw.prompt.trim().slice(0, 120) || "Choose one reward"
        : "Choose one reward";
    return { kind: "choice", prompt, options };
  }
  if (raw.kind === "note" && typeof raw.text === "string") {
    const text = raw.text.trim().slice(0, 200);
    return text.length > 0 ? { kind: "note", text } : null;
  }
  // Story scene: keep only a sceneId that resolves in the registry (an unknown
  // id — a deleted/renamed scene — is dropped, mirroring the search-deck gate).
  if (raw.kind === "story" && typeof raw.sceneId === "string" && isStoryScene(raw.sceneId)) {
    return { kind: "story", sceneId: raw.sceneId };
  }
  return null;
}

/** Sanitize untrusted preset input (HTTP body / storage). Returns undefined if empty. */
/** Designer wave overrides: at most this many exact-wave army entries. */
export const MAX_CUSTOM_WAVE_OVERRIDES = 8;
/** Wave numbers a designer may override (wave 10 ≈ round 30 at cadence 3). */
const MAX_CUSTOM_WAVE_NUMBER = 10;

/**
 * Calamity Waves designer block (module `monsterWaves`): cadence kept only as
 * a literal 3|4|5; per-wave exact armies ride the shared CustomGuardSpec
 * sanitizer (unknown slots dropped, MAX_CUSTOM_GUARD_UNITS cap), keyed by an
 * integer wave number 1..10, capped at MAX_CUSTOM_WAVE_OVERRIDES entries.
 * Empty block ⇒ dropped (byte-identical legacy presets).
 */
function sanitizeMonsterWavesPreset(input: unknown): CustomMapPreset["monsterWaves"] | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    cadence?: unknown;
    pressure?: unknown;
    defeatLimit?: unknown;
    waves?: unknown;
  };
  const cadence =
    raw.cadence === 3 || raw.cadence === 4 || raw.cadence === 5 ? raw.cadence : undefined;
  const pressure =
    raw.pressure === "standard" || raw.pressure === "brutal" ? raw.pressure : undefined;
  const defeatLimit =
    raw.defeatLimit === 0 || raw.defeatLimit === 2 || raw.defeatLimit === 3
      ? raw.defeatLimit
      : undefined;
  let waves: Record<number, CustomGuardSpec> | undefined;
  if (raw.waves && typeof raw.waves === "object") {
    const entries = Object.entries(raw.waves as Record<string, unknown>)
      .map(([key, value]) => [Number(key), sanitizeCustomGuardSpec(value)] as const)
      .filter(
        (entry): entry is readonly [number, CustomGuardSpec] =>
          Number.isInteger(entry[0]) &&
          entry[0] >= 1 &&
          entry[0] <= MAX_CUSTOM_WAVE_NUMBER &&
          entry[1] !== undefined
      )
      .slice(0, MAX_CUSTOM_WAVE_OVERRIDES);
    if (entries.length > 0) {
      waves = Object.fromEntries(entries);
    }
  }
  if (cadence === undefined && pressure === undefined && defeatLimit === undefined && !waves) {
    return undefined;
  }
  return {
    ...(cadence !== undefined ? { cadence } : {}),
    ...(pressure !== undefined ? { pressure } : {}),
    ...(defeatLimit !== undefined ? { defeatLimit } : {}),
    ...(waves ? { waves } : {})
  };
}

/**
 * One designer custom boss: non-empty id/name (trimmed, bounded), stats
 * clamped to CUSTOM_BOSS_LIMITS, type kept only as a real UnitType, abilities
 * filtered against the curated implemented whitelist
 * (RAID_BOSS_ABILITY_CHOICES) and deduped. Null = unusable entry, dropped.
 */
function sanitizeCustomRaidBoss(input: unknown): CustomRaidBossDef | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as Partial<CustomRaidBossDef>;
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 40) : "";
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
  if (!id || !name) {
    return null;
  }
  const abilities = Array.isArray(raw.abilities)
    ? [...new Set(raw.abilities.filter((entry): entry is string => typeof entry === "string" && RAID_BOSS_ABILITY_CHOICES.includes(entry)))].slice(0, 5)
    : [];
  const type = raw.type === "ranged" || raw.type === "flying" || raw.type === "ground" ? raw.type : undefined;
  return {
    id,
    name,
    attack: clampInt(raw.attack, CUSTOM_BOSS_LIMITS.attack.min, CUSTOM_BOSS_LIMITS.attack.max, 4),
    defense: clampInt(raw.defense, CUSTOM_BOSS_LIMITS.defense.min, CUSTOM_BOSS_LIMITS.defense.max, 1),
    health: clampInt(raw.health, CUSTOM_BOSS_LIMITS.health.min, CUSTOM_BOSS_LIMITS.health.max, 3),
    initiative: clampInt(
      raw.initiative,
      CUSTOM_BOSS_LIMITS.initiative.min,
      CUSTOM_BOSS_LIMITS.initiative.max,
      6
    ),
    layers: clampInt(raw.layers, CUSTOM_BOSS_LIMITS.layers.min, CUSTOM_BOSS_LIMITS.layers.max, 3),
    ...(type ? { type } : {}),
    ...(abilities.length > 0 ? { abilities } : {})
  };
}

/**
 * Raid Bosses designer block (module `raidBosses`): the optional spawn-round
 * override (2..30) and the custom boss list (cap MAX_CUSTOM_RAID_BOSSES, ids
 * deduped keep-first). Empty block ⇒ dropped.
 */
function sanitizeRaidBossesPreset(input: unknown): CustomMapPreset["raidBosses"] | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as { spawnRound?: unknown; bosses?: unknown };
  const spawnRound = clampInt(raw.spawnRound, 2, 30, 0);
  let bosses: CustomRaidBossDef[] | undefined;
  if (Array.isArray(raw.bosses)) {
    const seen = new Set<string>();
    const list = raw.bosses
      .map(sanitizeCustomRaidBoss)
      .filter((boss): boss is CustomRaidBossDef => {
        if (!boss || seen.has(boss.id)) {
          return false;
        }
        seen.add(boss.id);
        return true;
      })
      .slice(0, MAX_CUSTOM_RAID_BOSSES);
    if (list.length > 0) {
      bosses = list;
    }
  }
  if (spawnRound <= 0 && !bosses) {
    return undefined;
  }
  return { ...(spawnRound > 0 ? { spawnRound } : {}), ...(bosses ? { bosses } : {}) };
}

/** Dungeon campaign block: compact/full depth, immediate-descent cost, and optional floor wardens. */
function sanitizeDungeonPreset(input: unknown): CustomMapPreset["dungeon"] | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    maxFloor?: unknown;
    descentCost?: unknown;
    floorBosses?: unknown;
  };
  const maxFloor = raw.maxFloor === 5 || raw.maxFloor === 10 ? raw.maxFloor : undefined;
  const descentCost =
    raw.descentCost === 0 || raw.descentCost === 1 || raw.descentCost === 2
      ? raw.descentCost
      : undefined;
  const floorBosses: Partial<Record<5 | 10, string>> = {};
  if (raw.floorBosses && typeof raw.floorBosses === "object") {
    for (const floor of [5, 10] as const) {
      const value = (raw.floorBosses as Record<string, unknown>)[floor];
      if (typeof value === "string") {
        const id = value.trim().slice(0, 40);
        if (id) {
          floorBosses[floor] = id;
        }
      }
    }
  }
  const hasBosses = Object.keys(floorBosses).length > 0;
  if (maxFloor === undefined && descentCost === undefined && !hasBosses) {
    return undefined;
  }
  return {
    ...(maxFloor !== undefined ? { maxFloor } : {}),
    ...(descentCost !== undefined ? { descentCost } : {}),
    ...(hasBosses ? { floorBosses } : {})
  };
}

export function sanitizeCustomMapPreset(input: unknown): CustomMapPreset | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as Partial<CustomMapPreset>;
  const preset: CustomMapPreset = {};

  if (typeof raw.victoryMode === "string" && VICTORY_MODES.has(raw.victoryMode as VictoryMode)) {
    preset.victoryMode = raw.victoryMode as VictoryMode;
  }
  if (raw.pveTheme === "classic" || raw.pveTheme === "doom" || raw.pveTheme === "random") {
    preset.pveTheme = raw.pveTheme;
  }
  // Map-settings defaults (difficulty / far-tile supply). Garbage difficulty is
  // dropped; farTilesPerPlayer clamps to 0..MAX (a non-number is dropped, never
  // coerced to a silent 0). Boolean tile-rule overrides are kept only when real.
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
  if (raw.houseRules && typeof raw.houseRules === "object") {
    const houseRules: NonNullable<CustomMapPreset["houseRules"]> = {};
    for (const id of ["no-secondary-heroes", "free-neutral-combat-extend"] as const) {
      if (typeof raw.houseRules[id] === "boolean") {
        houseRules[id] = raw.houseRules[id];
      }
    }
    if (Object.keys(houseRules).length > 0) {
      preset.houseRules = houseRules;
    }
  }
  const resources = sanitizeResources(raw.startingResources);
  if (resources) {
    preset.startingResources = resources;
  }
  const computerStartingBonus = sanitizeResources(raw.computerStartingBonus);
  if (computerStartingBonus && Object.values(computerStartingBonus).some((amount) => amount > 0)) {
    preset.computerStartingBonus = computerStartingBonus;
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
  const monsterWaves = sanitizeMonsterWavesPreset(raw.monsterWaves);
  if (monsterWaves) {
    preset.monsterWaves = monsterWaves;
  }
  const raidBosses = sanitizeRaidBossesPreset(raw.raidBosses);
  if (raidBosses) {
    preset.raidBosses = raidBosses;
  }
  const dungeon = sanitizeDungeonPreset(raw.dungeon);
  if (dungeon) {
    preset.dungeon = dungeon;
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
  if (raw.heroDefeatGold !== undefined) {
    const bounty = clampInt(raw.heroDefeatGold, 0, 100, 0);
    if (bounty > 0) {
      preset.heroDefeatGold = bounty;
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
  if (raw.settlements !== undefined) {
    const settlements = sanitizeSettlementConfig(raw.settlements);
    if (settlements) {
      preset.settlements = settlements;
    }
  }
  if (raw.mines !== undefined) {
    const mines = sanitizeMinesConfig(raw.mines);
    if (mines) {
      preset.mines = mines;
    }
  }
  if (raw.randomTowns !== undefined) {
    const randomTowns = sanitizeRandomTownsConfig(raw.randomTowns);
    if (randomTowns) {
      preset.randomTowns = randomTowns;
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
  if (raw.hexEvents !== undefined) {
    const hexEvents = sanitizeHexEvents(raw.hexEvents);
    if (hexEvents.length > 0) {
      preset.hexEvents = hexEvents;
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
      preset.pveTheme ||
      preset.difficulty ||
      preset.farTileOpening !== undefined ||
      preset.farTilesPerPlayer !== undefined ||
      Boolean(preset.houseRules && Object.keys(preset.houseRules).length > 0) ||
      preset.startingResources ||
      preset.computerStartingBonus ||
      preset.startingProduction ||
      (preset.startingBuildings && preset.startingBuildings.length > 0) ||
      preset.startingUnits ||
      (preset.startingBonuses && preset.startingBonuses.length > 0) ||
      (preset.timedEvents && preset.timedEvents.length > 0) ||
      preset.roundLimit ||
      preset.heroDefeatGold ||
      (preset.notes && preset.notes.length > 0) ||
      preset.obelisks ||
      Boolean(preset.settlements) ||
      Boolean(preset.mines) ||
      Boolean(preset.randomTowns) ||
      (preset.objects && preset.objects.length > 0) ||
      Boolean(preset.objectives) ||
      Boolean(preset.victoryPoints?.enabled) ||
      (preset.customWinConditions && preset.customWinConditions.length > 0) ||
      (preset.hexEvents && preset.hexEvents.length > 0) ||
      Boolean(preset.monsterWaves) ||
      Boolean(preset.raidBosses) ||
      Boolean(preset.dungeon)
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
  let banks = 0;
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
    } else if (object.kind === "creature_bank") {
      banks += 1;
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
  if (banks > 0) {
    parts.push(`${banks} creature bank${banks === 1 ? "" : "s"}`);
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
    case "ability_token":
      return "Ability Empower token";
    case "resources":
      return `+${formatPresetResources(bonus)}`;
    case "movement":
      return `+${bonus.amount} movement`;
    case "experience":
      return `+${bonus.amount} experience`;
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
    case "resource_roll":
      return `roll ${bonus.count} Resource dice, keep 1`;
  }
}

/**
 * Plain-words label for a Dragon Utopia guard mode. "by-difficulty" draws the
 * COMPLETE Field Difficulty Ⅶ row (tiers included), so it is not a scaled
 * dragon party — say so, or the banner promises dragons the fight will not
 * field.
 */
export function describeUtopiaGuards(guards: DragonUtopiaGuards): string {
  return guards === "four" ? "always four dragons" : "the Field Difficulty table";
}

/**
 * Icon-tagged lines for the Grail / Dragon Utopia options block (lobby banner +
 * designer summary). One entry per set field; 🏆 for the Grail knob, 🐉 for the
 * Utopia knobs.
 */
export function describeObjectivesConfig(config: CustomMapObjectivesConfig): CustomMapPresetEntry[] {
  const entries: CustomMapPresetEntry[] = [];
  if (config.hiddenGrailUtopia) {
    entries.push({
      icon: "🏆",
      text: "Hidden Grail / Utopia fields: balanced placement and special rewards"
    });
  }
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
  if (config.grailAsUtopia === "always") {
    entries.push({ icon: "🏆", text: "Grail fields also fight as Dragon Utopia" });
  } else if (config.grailAsUtopia === "after-dig-utopia") {
    entries.push({ icon: "🏆", text: "After dig, other Grail tiles become Utopia" });
  } else if (config.grailAsUtopia === "after-dig-empty") {
    entries.push({ icon: "🏆", text: "After dig, other Grail tiles become empty" });
  }
  if (config.grailDigCost !== undefined && config.grailDigCost !== 1) {
    entries.push({
      icon: "🏆",
      text: config.grailDigCost === 0 ? "Grail dig is free (0 MP)" : `Grail dig costs ${config.grailDigCost} MP`
    });
  }
  if (config.grailDigReward) {
    entries.push({ icon: "🏆", text: `Grail dig reward: +${formatPresetResources(config.grailDigReward)}` });
  }
  if (config.grailPossessionVp) {
    entries.push({ icon: "🏆", text: `Grail possession: +${config.grailPossessionVp} VP at scoring` });
  }
  if (config.grailBuildAt) {
    const where =
      config.grailBuildAt === "both"
        ? "Town or Settlement"
        : config.grailBuildAt === "starting-town"
          ? "starting Town"
          : config.grailBuildAt === "settlement"
            ? "Settlement"
            : "Town";
    entries.push({ icon: "🏆", text: `Grail may be built in a ${where}` });
  }
  if (config.grailBuildReward?.freeBuilding) {
    entries.push({ icon: "🏆", text: "Building the Grail grants one free Town building (picker)" });
  }
  if (config.grailBuildReward) {
    const res = formatPresetResources(config.grailBuildReward);
    if (res && res !== "nothing") {
      entries.push({ icon: "🏆", text: `Grail build reward: +${res}` });
    }
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

/** Short label for a designer guard: a level Ⅰ–Ⅶ or a grouped exact army. */
export function describeGuardSpec(guard: CustomGuardSpec): string {
  if (guard.units && guard.units.length > 0) {
    const grouped = describeGuardArmyGrouped(guard.units);
    const base = grouped || `${guard.units.length}-unit army`;
    if (guard.packFaction === "random") return `${base} · random faction packs`;
    if (guard.packFaction) return `${base} · ${guard.packFaction} packs`;
    return base;
  }
  if (!guard.level) return "none";
  if (guard.levelArmy === "packs") {
    const fac =
      guard.packFaction === "random"
        ? " · random faction"
        : guard.packFaction
          ? ` · ${guard.packFaction}`
          : "";
    return `level ${guard.level} packs${fac}`;
  }
  return `level ${guard.level}`;
}

/** Plain-words description of the awards a "bonus" Obelisk grants. */
export function describeObeliskAwards(config: CustomMapObeliskConfig): string {
  const list =
    config.bonuses && config.bonuses.length > 0
      ? config.bonuses
      : [config.bonus ?? DEFAULT_OBELISK_BONUS];
  const joiner = config.bonusMode === "choose" && list.length > 1 ? " OR " : " + ";
  return list.map(describeObeliskBonus).join(joiner);
}

/** Plain-words line for the map-wide Obelisk role (lobby banner + designer). */
export function describeObeliskRole(config: CustomMapObeliskConfig): string {
  const extras: string[] = [];
  if (config.guard) extras.push(`guard ${describeGuardSpec(config.guard)}`);
  if (config.breakField) extras.push("break field");
  if (config.persistentGuard) extras.push("persistent army");
  if (config.unlimitedRounds) extras.push("unlimited rounds");
  const tail = extras.length > 0 ? ` (${extras.join(", ")})` : "";
  if (config.role === "monolith") {
    return `Obelisks: Monolith teleport network${tail}`;
  }
  if (config.role === "victory-only") {
    return `Obelisks: victory marker only (no reward)${tail}`;
  }
  return `Obelisks: fixed bonus — ${describeObeliskAwards(config)}${tail}`;
}

/** Plain-words line for the map-wide settlement options (banner + designer). */
export function describeSettlementConfig(config: CustomMapSettlementConfig): string {
  const parts: string[] = [];
  if (config.guard) {
    parts.push(`guard ${describeGuardSpec(config.guard)}`);
  }
  if (config.vp) {
    parts.push(`+${config.vp} VP each`);
  }
  return `Settlements: ${parts.length > 0 ? parts.join(", ") : "classic"}`;
}

/** Plain-words line for a per-tile settlement customization. */
export function describeSettlementFieldPlan(plan: CustomMapSettlementFieldPlan): string {
  const parts: string[] = [];
  if (plan.guard) {
    parts.push(`guard ${describeGuardSpec(plan.guard)}`);
  }
  if (plan.vp) {
    parts.push(`+${plan.vp} VP`);
  }
  if (plan.holdRoundsToWin) {
    parts.push(`hold ${plan.holdRoundsToWin} round${plan.holdRoundsToWin === 1 ? "" : "s"} to win`);
  }
  return `This settlement: ${parts.length > 0 ? parts.join(", ") : "classic"}`;
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
  if (effect.kind === "market_trade") {
    return "each player may trade resources at Market rates (trade only)";
  }
  if (effect.kind === "choice") {
    return `each player chooses: ${effect.options.map(describeObeliskBonus).join(" OR ")}`;
  }
  if (effect.kind === "story") {
    const scene = getStoryScene(effect.sceneId);
    return `play story scene "${scene?.id ?? effect.sceneId}"`;
  }
  return effect.text;
}

/** One condition line with a UI icon tag (designer summary + lobby banner). */
export type CustomMapPresetEntry = { icon: string; text: string };

/** Icon-tagged bullet entries for lobby / designer summary. */
export function describeCustomMapPresetEntries(
  preset: CustomMapPreset | null | undefined,
  plans?: CustomMapTilePlan[] | null
): CustomMapPresetEntry[] {
  // The Ⅶ Grail / Utopia reward-stacking line rides the TILE plans, so it is
  // built even when the preset itself carries nothing "active" (a centre-hex
  // reward lives on the tile, not the preset) — players must see before they
  // start that a Ⅶ objective pays more than its standard reward.
  const stackEntries = describeViiRewardStackEntries(plans, preset);
  if (!preset || !customMapPresetIsActive(preset)) {
    return stackEntries;
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
  if (preset.houseRules?.["no-secondary-heroes"] !== undefined) {
    entries.push({
      icon: "⚙️",
      text: `Secondary Heroes: ${preset.houseRules["no-secondary-heroes"] ? "disabled" : "allowed"}`
    });
  }
  if (preset.houseRules?.["free-neutral-combat-extend"] !== undefined) {
    entries.push({
      icon: "⚙️",
      text: `Neutral battle extension: ${
        preset.houseRules["free-neutral-combat-extend"] ? "free" : "costs 1 movement"
      }`
    });
  }
  if (preset.startingResources) {
    entries.push({
      icon: "🪙",
      text: `Starting resources: ${formatResources(preset.startingResources)}`
    });
  }
  if (preset.computerStartingBonus) {
    entries.push({
      icon: "🤖",
      text: `Single-player AI base bonus: +${formatResources(preset.computerStartingBonus)} (ignored in multiplayer)`
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
  if (preset.pveTheme) {
    entries.push({
      icon: "🌀",
      text: `PvE theme: ${
        preset.pveTheme === "classic"
          ? "Erathian calamity"
          : preset.pveTheme === "doom"
            ? "Doom invasion"
            : "random each match"
      }`
    });
  }
  if (preset.monsterWaves) {
    const parts: string[] = [];
    if (preset.monsterWaves.cadence) parts.push(`every ${preset.monsterWaves.cadence} rounds`);
    if (preset.monsterWaves.pressure) parts.push(`${preset.monsterWaves.pressure} pressure`);
    if (preset.monsterWaves.defeatLimit !== undefined) {
      parts.push(
        preset.monsterWaves.defeatLimit === 0
          ? "pillage only"
          : `eliminate after ${preset.monsterWaves.defeatLimit} losses`
      );
    }
    const overrides = Object.keys(preset.monsterWaves.waves ?? {}).length;
    if (overrides > 0) parts.push(`${overrides} authored ${overrides === 1 ? "army" : "armies"}`);
    entries.push({ icon: "🌊", text: `Calamity Waves: ${parts.join(", ") || "map directed"}` });
  }
  if (preset.raidBosses) {
    const bossCount = preset.raidBosses.bosses?.length ?? 0;
    entries.push({
      icon: "🐉",
      text: `Raid Bosses: ${
        preset.raidBosses.spawnRound ? `round ${preset.raidBosses.spawnRound}` : "lobby arrival"
      }${bossCount > 0 ? `, ${bossCount} custom ${bossCount === 1 ? "boss" : "bosses"}` : ""}`
    });
  }
  if (preset.dungeon) {
    const parts: string[] = [];
    if (preset.dungeon.maxFloor) parts.push(`${preset.dungeon.maxFloor} floors`);
    if (preset.dungeon.descentCost !== undefined) {
      parts.push(`${preset.dungeon.descentCost} movement to descend`);
    }
    const wardens = Object.keys(preset.dungeon.floorBosses ?? {}).length;
    if (wardens > 0) parts.push(`${wardens} custom ${wardens === 1 ? "warden" : "wardens"}`);
    entries.push({ icon: "🗝️", text: `Dungeon: ${parts.join(", ") || "map directed"}` });
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
  if (preset.heroDefeatGold) {
    entries.push({ icon: "⚔️", text: `Defeat an enemy Hero: +${preset.heroDefeatGold} gold` });
  }
  if (preset.obelisks) {
    entries.push({ icon: "🗿", text: describeObeliskRole(preset.obelisks) });
  }
  if (preset.settlements) {
    entries.push({ icon: "🏠", text: describeSettlementConfig(preset.settlements) });
  }
  if (preset.mines) {
    const parts: string[] = [];
    if (preset.mines.guard) parts.push(`guard ${describeGuardSpec(preset.mines.guard)}`);
    if (preset.mines.breakField) parts.push("break field");
    if (preset.mines.persistentGuard) parts.push("persistent army");
    if (preset.mines.unlimitedRounds) parts.push("unlimited rounds");
    entries.push({ icon: "⛏️", text: `Mines: ${parts.join(", ") || "custom"}` });
  }
  if (preset.randomTowns) {
    const parts: string[] = [];
    if (preset.randomTowns.guard) parts.push(`guard ${describeGuardSpec(preset.randomTowns.guard)}`);
    if (preset.randomTowns.incomeGold !== undefined) {
      parts.push(`${preset.randomTowns.incomeGold} gold income`);
    }
    if (preset.randomTowns.captureReward) {
      parts.push(`capture +${formatPresetResources(preset.randomTowns.captureReward)}`);
    }
    if (preset.randomTowns.vp) {
      parts.push(`+${preset.randomTowns.vp} VP each (control)`);
    }
    entries.push({ icon: "🏰", text: `Random Town: ${parts.join(", ") || "custom"}` });
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
  for (const line of stackEntries) {
    entries.push(line);
  }
  return entries;
}

/**
 * ONE concise lobby-banner line when the map stacks extra designer rewards on a
 * Ⅶ Grail / Dragon Utopia field (empty when nothing stacks). Shares
 * {@link viiObjectiveRewardStacks} with the designer warning.
 */
function describeViiRewardStackEntries(
  plans: CustomMapTilePlan[] | null | undefined,
  preset: CustomMapPreset | null | undefined
): CustomMapPresetEntry[] {
  const stacks = viiObjectiveRewardStacks(plans, preset);
  if (stacks.length === 0) {
    return [];
  }
  const names = Array.from(
    new Set(stacks.map((stack) => (stack.objective === "dragon_utopia" ? "Dragon Utopia" : "Grail")))
  ).join(" / ");
  return [
    {
      icon: "🐉",
      text: `Extra rewards stack on ${stacks.length === 1 ? "the" : `${stacks.length}`} Ⅶ ${names} field${
        stacks.length === 1 ? "" : "s"
      } — the standard objective reward still pays too`
    }
  ];
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
  | "startingUnits"
  | "noSecondaryHeroes"
  | "freeNeutralCombatExtend";

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
  if (preset.houseRules?.["no-secondary-heroes"] !== undefined) {
    keys.push("noSecondaryHeroes");
  }
  if (preset.houseRules?.["free-neutral-combat-extend"] !== undefined) {
    keys.push("freeNeutralCombatExtend");
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
  if (
    preset.houseRules?.["no-secondary-heroes"] !== undefined &&
    !skip?.has("noSecondaryHeroes")
  ) {
    options.houseRules = {
      ...(options.houseRules ?? {}),
      "no-secondary-heroes": preset.houseRules["no-secondary-heroes"]
    };
    changes.push(
      `Secondary Heroes ${preset.houseRules["no-secondary-heroes"] ? "disabled" : "allowed"}`
    );
  }
  if (
    preset.houseRules?.["free-neutral-combat-extend"] !== undefined &&
    !skip?.has("freeNeutralCombatExtend")
  ) {
    options.houseRules = {
      ...(options.houseRules ?? {}),
      "free-neutral-combat-extend": preset.houseRules["free-neutral-combat-extend"]
    };
    changes.push(
      `neutral battle extension ${
        preset.houseRules["free-neutral-combat-extend"] ? "free" : "costs 1 movement"
      }`
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
      case "noSecondaryHeroes":
        options.houseRules = { ...(options.houseRules ?? {}) };
        if (defaults.houseRules?.["no-secondary-heroes"] === undefined) {
          delete options.houseRules["no-secondary-heroes"];
        } else {
          options.houseRules["no-secondary-heroes"] =
            defaults.houseRules["no-secondary-heroes"];
        }
        changes.push("Secondary Heroes back to the scenario default");
        break;
      case "freeNeutralCombatExtend":
        options.houseRules = { ...(options.houseRules ?? {}) };
        if (defaults.houseRules?.["free-neutral-combat-extend"] === undefined) {
          delete options.houseRules["free-neutral-combat-extend"];
        } else {
          options.houseRules["free-neutral-combat-extend"] =
            defaults.houseRules["free-neutral-combat-extend"];
        }
        changes.push("neutral battle extension back to the scenario default");
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
      features: SecretTileFeature[];
      excluded: SecretTileFeature[];
      group: CustomMapTilePlan["group"];
      seaBand?: CustomMapTilePlan["seaBand"];
      subBand?: CustomMapTilePlan["subBand"];
      count: number;
    }
  >();
  for (const plan of plans) {
    if (!plan.faceDown || plan.tileDefId) {
      continue;
    }
    const features = planAllowedSecretFeatures(plan);
    const excluded = planExcludedSecretFeatures(plan);
    if (features.length === 0 && excluded.length === 0) {
      continue;
    }
    const key = `${plan.group}:${features.join(",")}:${excluded.join(",")}:${plan.seaBand ?? ""}:${plan.subBand ?? ""}`;
    const current = demand.get(key) ?? {
      features,
      excluded,
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
    // Count tiles that pass include AND exclude (not just the first include).
    const supply = Object.values(allTileDefinitions).filter((def) => {
      if (def.group !== entry.group) return false;
      if (pinnedIds.has(def.id)) return false;
      if (entry.group === "sea" && entry.seaBand && seaTileBand(def) !== entry.seaBand) return false;
      if (entry.group === "subterranean" && entry.subBand && subterraneanTileBand(def) !== entry.subBand) {
        return false;
      }
      return tilePassesSecretFilters(def, entry.features, entry.excluded);
    }).length;
    const includeLabel =
      entry.features.length > 0
        ? entry.features.map((f) => FEATURE_LABELS[f] ?? f).join(" / ")
        : "any";
    const excludeLabel =
      entry.excluded.length > 0
        ? ` excluding ${entry.excluded.map((f) => FEATURE_LABELS[f] ?? f).join(" / ")}`
        : "";
    if (supply === 0) {
      warnings.push(
        `Filter “${includeLabel}”${excludeLabel} on ${entry.group}: no tiles in that pool match — in game the slot falls back to pure random.`
      );
    } else if (entry.count > supply) {
      warnings.push(
        `Filter “${includeLabel}”${excludeLabel} on ${entry.group}: ${entry.count} slots need it but only ${supply} matching tiles exist — extras fall back to random.`
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

// ---------------------------------------------------------------------------
// Ⅶ objective reward STACKING (Dragon Utopia / Grail) — designer + lobby warning
//
// A Ⅶ Grail or Dragon Utopia field ALREADY pays a built-in objective reward (the
// Utopia's 10 gold + the fixed Search 3 / 5 / 5 Artifact ladder and its
// morale-or-Empower-token pick; the Grail's dig reward, or 10 gold + a Relic
// Search outside Grail Hunt). Several INDEPENDENT map-design options can attach
// MORE payouts to that same field for the same clear:
//   • the centre-hex reward / VP (`plan.centerHex`),
//   • an invisible hex event's reward / VP on that hex (`preset.hexEvents`),
//   • the Dragon Utopia bonus Search (`preset.objectives.utopiaBonusSearch`).
// Every one of those is DELIBERATE (a designer authored it), so nothing is
// blocked or nerfed — but they stack silently, which is easy to do by accident.
// These pure helpers are the single derivation behind BOTH warning surfaces: the
// map designer's alert panel and the lobby map-pick banner line.
// ---------------------------------------------------------------------------

/** One extra payout stacked on a Ⅶ objective field's own built-in reward. */
export type ViiRewardStackSource = "center-hex" | "hex-event" | "utopia-bonus-search";

/** A Ⅶ Grail / Dragon Utopia field that pays MORE than its built-in reward. */
export type ViiRewardStack = {
  /** Plan centre of the tile — a centre tile's Ⅶ field is always its own centre hex. */
  row: number;
  col: number;
  objective: "dragon_utopia" | "grail";
  /** Which extra options pay on top, in a stable order. */
  sources: ViiRewardStackSource[];
};

/** True when a designer reward package actually pays something. */
function fieldRewardPays(reward: CustomFieldReward | undefined): boolean {
  if (!reward) {
    return false;
  }
  return Object.values(reward).some((value) =>
    typeof value === "number" ? value !== 0 : Boolean(value)
  );
}

/**
 * The Ⅶ objective a CENTRE plan is CERTAIN to host, or undefined when the slot
 * could still draw anything. Certain = a `viiField` designation, an exact tile
 * pin, or a "one of these tiles" list whose EVERY candidate prints the same Ⅶ
 * objective. A plain random / partly-random slot is deliberately NOT reported:
 * whether it even becomes a Grail / Utopia is unknown at design time (documented
 * limit — the stack warning would be a guess).
 */
function certainViiObjective(plan: CustomMapTilePlan): "dragon_utopia" | "grail" | undefined {
  if (plan.group !== "center") {
    return undefined;
  }
  if (plan.viiField) {
    return plan.viiField === "dragon_utopia" || plan.viiField === "grail" ? plan.viiField : undefined;
  }
  const fromLocation = (location: string | undefined): "dragon_utopia" | "grail" | undefined =>
    location === "dragon_utopia" || location === "grail" ? location : undefined;
  if (plan.tileDefId) {
    return fromLocation(tileViiLocation(plan.tileDefId));
  }
  const oneOf = plan.oneOfTileDefIds;
  if (oneOf && oneOf.length > 0) {
    const first = fromLocation(tileViiLocation(oneOf[0]));
    if (!first) {
      return undefined;
    }
    return oneOf.every((id) => fromLocation(tileViiLocation(id)) === first) ? first : undefined;
  }
  return undefined;
}

/**
 * Every Ⅶ Grail / Dragon Utopia field whose built-in objective reward is stacked
 * with extra designer payouts, with WHICH options stack. Pure; drives the
 * designer alert AND the lobby banner so the two can never disagree.
 *
 * A centre tile's Ⅶ objective is always slot 0 — the tile's own centre hex
 * (verified across every centre tile definition) — so a hex event stacks exactly
 * when it sits on the plan's own `row`/`col`, whatever the tile's rotation.
 */
export function viiObjectiveRewardStacks(
  plans: CustomMapTilePlan[] | null | undefined,
  preset: CustomMapPreset | null | undefined
): ViiRewardStack[] {
  if (!plans || plans.length === 0) {
    return [];
  }
  const hexEventAt = new Map<string, CustomHexEvent>();
  for (const event of preset?.hexEvents ?? []) {
    hexEventAt.set(`${event.placement.row},${event.placement.col}`, event);
  }
  const bonusSearch = preset?.objectives?.utopiaBonusSearch;
  const stacks: ViiRewardStack[] = [];
  for (const plan of plans) {
    const objective = certainViiObjective(plan);
    if (!objective) {
      continue;
    }
    const sources: ViiRewardStackSource[] = [];
    if (fieldRewardPays(plan.centerHex?.reward) || (plan.centerHex?.vp ?? 0) > 0) {
      sources.push("center-hex");
    }
    const event = hexEventAt.get(`${plan.row},${plan.col}`);
    if (event && (fieldRewardPays(event.reward) || (event.vp ?? 0) > 0)) {
      sources.push("hex-event");
    }
    if (objective === "dragon_utopia" && bonusSearch) {
      sources.push("utopia-bonus-search");
    }
    if (sources.length > 0) {
      stacks.push({ row: plan.row, col: plan.col, objective, sources });
    }
  }
  return stacks;
}

/** What a Ⅶ objective field pays on its own, in plain words. */
function viiBuiltInRewardText(objective: "dragon_utopia" | "grail"): string {
  return objective === "dragon_utopia"
    ? "10 gold + three Artifact Searches (3, then 5, 5) + a Morale / Ability-Empower pick"
    : "its own objective reward (the Grail dig, or 10 gold + a Relic Artifact Search outside Grail Hunt)";
}

const VII_STACK_SOURCE_LABELS: Record<ViiRewardStackSource, string> = {
  "center-hex": "the centre-hex reward",
  "hex-event": "a hidden hex event on that same hex",
  "utopia-bonus-search": "the Dragon Utopia bonus Search"
};

/**
 * Designer warnings (never blocks): one line per Ⅶ Grail / Dragon Utopia field
 * that pays extra options ON TOP of its built-in objective reward. Rendered in
 * the designer's existing alert panel beside the Ⅶ victory-vs-design conflicts.
 */
export function viiRewardStackWarnings(
  plans: CustomMapTilePlan[] | null | undefined,
  preset: CustomMapPreset | null | undefined
): string[] {
  return viiObjectiveRewardStacks(plans, preset).map((stack) => {
    const name = stack.objective === "dragon_utopia" ? "Dragon Utopia" : "Grail";
    const extras = stack.sources.map((source) => VII_STACK_SOURCE_LABELS[source]).join(" and ");
    return `The ${name} at row ${stack.row}, col ${stack.col} already pays ${viiBuiltInRewardText(
      stack.objective
    )} — ${extras} stack${stack.sources.length > 1 ? "" : "s"} on top for the same clear. That is allowed; clear the extra reward if you did not mean to pay twice.`;
  });
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
  { id: "ability_token", label: "Ability Empower token" },
  { id: "resources", label: "Resources" },
  { id: "movement", label: "Movement" },
  { id: "experience", label: "Experience" },
  { id: "dice", label: "Treasure / Resource dice" },
  { id: "resource_roll", label: "Resource dice — roll N, choose 1" }
];

/** Fresh default reward when the designer switches the "bonus" role's kind. */
export function defaultObeliskBonusForKind(kind: CustomMapObeliskBonus["kind"]): CustomMapObeliskBonus {
  switch (kind) {
    case "morale":
      return { kind: "morale", amount: 1 };
    case "search":
      return { kind: "search", deck: "artifacts", count: 1 };
    case "ability_token":
      return { kind: "ability_token" };
    case "resources":
      return { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 };
    case "movement":
      return { kind: "movement", amount: 1 };
    case "experience":
      return { kind: "experience", amount: 1 };
    case "dice":
      return { kind: "dice", treasure: 1, resource: 0 };
    case "resource_roll":
      return { kind: "resource_roll", count: 2 };
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
  param: { field: "count" | "level" | "amount" | "rounds"; label: string; min: number; max: number } | null;
}[] = [
  { id: "control-towns", label: "Control N Towns", param: { field: "count", label: "Towns", min: 2, max: 8 } },
  { id: "flag-mines", label: "Flag N Mines / Settlements", param: { field: "count", label: "Mines", min: 2, max: 12 } },
  { id: "hero-level", label: "Reach Hero level N", param: { field: "level", label: "Level", min: 2, max: 7 } },
  { id: "gold", label: "Reach N gold", param: { field: "amount", label: "Gold", min: 20, max: 500 } },
  { id: "artifacts", label: "Own N Artifacts", param: { field: "count", label: "Artifacts", min: 1, max: 10 } },
  { id: "buildings", label: "Build N Buildings", param: { field: "count", label: "Buildings", min: 8, max: 15 } },
  { id: "obelisks", label: "Visit N Obelisks (grail maps)", param: { field: "count", label: "Obelisks", min: 1, max: 4 } },
  { id: "defeat-heroes", label: "Defeat N enemy Heroes", param: { field: "count", label: "Heroes", min: 1, max: 6 } },
  {
    id: "defeat-dragon-utopia",
    label: "Flag N Dragon Utopias",
    param: { field: "count", label: "Utopias", min: 1, max: 6 }
  },
  {
    id: "hold-with-grail",
    label: "Control place + Grail for N rounds",
    param: { field: "rounds", label: "Rounds", min: 1, max: 10 }
  }
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
      return { kind: "defeat-dragon-utopia", count: 2 };
    case "hold-with-grail":
      return { kind: "hold-with-grail", rounds: 3, target: "starting-town" };
  }
}
