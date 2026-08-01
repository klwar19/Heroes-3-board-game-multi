/**
 * Map-designer combat / tile-choice helpers (break fields, random-tier guards,
 * player resource/VII picks, grail dig knobs, random-town income).
 *
 * Pure helpers only — wiring lives in adventure.ts / adventure-reducer.ts /
 * map-preset.ts / materialize paths. Default-off / absent ⇒ byte-identical.
 */

import { coreUnitDefinitions } from "@/data/factions/units";
import type {
  CustomGuardSpec,
  CustomMapObjectivesConfig,
  CustomMapPreset,
  FactionId,
  GameState,
  MapFieldState
} from "./state";
import { MAX_CUSTOM_GUARD_UNITS } from "./state";
import { houseRuleEnabled } from "./house-rules";

/** Tier a random certain-army slot may roll. */
export type RandomGuardTier = "bronze" | "silver" | "gold" | "azure";

/** Fight-time neutral/faction guard draw (mirrors adventure.NeutralDraw). */
export type ResolvedGuardDraw = {
  unitDefId: string;
  tier: "bronze" | "silver" | "gold" | "azure";
  bankGuard?: boolean;
  factionPack?: boolean;
  /** Named / random-few slot: fight on the faction Few side (not Pack). */
  factionFew?: boolean;
};

/** Prefix for a "random Neutral of this tier" certain-army slot. */
export const RANDOM_GUARD_PREFIX = "random:" as const;
/** Prefix for a named faction Pack certain-army slot. */
export const PACK_GUARD_PREFIX = "pack:" as const;
/** Prefix for a "random Pack of this tier" certain-army slot. */
export const RANDOM_PACK_GUARD_PREFIX = "random-pack:" as const;
/** Prefix for a named faction Few certain-army slot. */
export const FEW_GUARD_PREFIX = "few:" as const;
/** Prefix for a "random Few of this tier" certain-army slot. */
export const RANDOM_FEW_GUARD_PREFIX = "random-few:" as const;

export const RANDOM_GUARD_TIERS: readonly RandomGuardTier[] = ["bronze", "silver", "gold", "azure"];

export function isRandomGuardTier(value: unknown): value is RandomGuardTier {
  return value === "bronze" || value === "silver" || value === "gold" || value === "azure";
}

/** True when `id` is a `random:<tier>` certain-army slot (Neutral). */
export function isRandomGuardSlot(id: unknown): id is `random:${RandomGuardTier}` {
  if (typeof id !== "string" || !id.startsWith(RANDOM_GUARD_PREFIX)) {
    return false;
  }
  // Must not match `random-pack:` (different prefix length / name).
  if (id.startsWith(RANDOM_PACK_GUARD_PREFIX)) {
    return false;
  }
  return isRandomGuardTier(id.slice(RANDOM_GUARD_PREFIX.length));
}

/** True when `id` is a `random-pack:<tier>` certain-army slot (faction Pack). */
export function isRandomPackGuardSlot(id: unknown): id is `random-pack:${RandomGuardTier}` {
  if (typeof id !== "string" || !id.startsWith(RANDOM_PACK_GUARD_PREFIX)) {
    return false;
  }
  return isRandomGuardTier(id.slice(RANDOM_PACK_GUARD_PREFIX.length));
}

/** True when `id` is a `pack:<unitDefId>` certain-army slot (faction Pack). */
export function isPackGuardSlot(id: unknown): id is `pack:${string}` {
  if (typeof id !== "string" || !id.startsWith(PACK_GUARD_PREFIX)) {
    return false;
  }
  // Avoid treating `pack:` collisions — only named unit packs.
  if (id.startsWith(RANDOM_PACK_GUARD_PREFIX)) {
    return false;
  }
  const unitDefId = id.slice(PACK_GUARD_PREFIX.length);
  return Boolean(coreUnitDefinitions[unitDefId]?.pack);
}

/** True when `id` is a `random-few:<tier>` certain-army slot (faction Few). */
export function isRandomFewGuardSlot(id: unknown): id is `random-few:${RandomGuardTier}` {
  if (typeof id !== "string" || !id.startsWith(RANDOM_FEW_GUARD_PREFIX)) {
    return false;
  }
  return isRandomGuardTier(id.slice(RANDOM_FEW_GUARD_PREFIX.length));
}

/** True when `id` is a `few:<unitDefId>` certain-army slot (faction Few). */
export function isFewGuardSlot(id: unknown): id is `few:${string}` {
  if (typeof id !== "string" || !id.startsWith(FEW_GUARD_PREFIX)) {
    return false;
  }
  if (id.startsWith(RANDOM_FEW_GUARD_PREFIX)) {
    return false;
  }
  const unitDefId = id.slice(FEW_GUARD_PREFIX.length);
  return Boolean(coreUnitDefinitions[unitDefId]?.few);
}

/** True when `id` names a unit with a Neutral side (classic certain-army entry). */
export function isNeutralGuardUnit(id: unknown): id is string {
  return typeof id === "string" && Boolean(coreUnitDefinitions[id]?.neutral);
}

/**
 * A certain-army entry is legal when it is a neutral unit, a random-tier Neutral
 * slot, a random-pack / random-few tier slot, or a named faction Pack / Few.
 * Shared by the sanitiser and the GuardSpecEditor.
 */
export function isCustomGuardUnitEntry(id: unknown): id is string {
  return (
    isNeutralGuardUnit(id) ||
    isRandomGuardSlot(id) ||
    isRandomPackGuardSlot(id) ||
    isPackGuardSlot(id) ||
    isRandomFewGuardSlot(id) ||
    isFewGuardSlot(id)
  );
}

export function randomGuardTierOf(id: string): RandomGuardTier | null {
  if (!isRandomGuardSlot(id)) {
    return null;
  }
  return id.slice(RANDOM_GUARD_PREFIX.length) as RandomGuardTier;
}

export function randomPackGuardTierOf(id: string): RandomGuardTier | null {
  if (!isRandomPackGuardSlot(id)) {
    return null;
  }
  return id.slice(RANDOM_PACK_GUARD_PREFIX.length) as RandomGuardTier;
}

export function packGuardUnitDefId(id: string): string | null {
  if (!isPackGuardSlot(id)) {
    return null;
  }
  return id.slice(PACK_GUARD_PREFIX.length);
}

export function randomFewGuardTierOf(id: string): RandomGuardTier | null {
  if (!isRandomFewGuardSlot(id)) {
    return null;
  }
  return id.slice(RANDOM_FEW_GUARD_PREFIX.length) as RandomGuardTier;
}

export function fewGuardUnitDefId(id: string): string | null {
  if (!isFewGuardSlot(id)) {
    return null;
  }
  return id.slice(FEW_GUARD_PREFIX.length);
}

/** True when the entry mints a Pack (named or random-pack tier). */
export function isAnyPackGuardSlot(id: unknown): boolean {
  return isPackGuardSlot(id) || isRandomPackGuardSlot(id);
}

/** True when the entry mints a Few (named or random-few tier). */
export function isAnyFewGuardSlot(id: unknown): boolean {
  return isFewGuardSlot(id) || isRandomFewGuardSlot(id);
}

/** Display label for one certain-army entry (editor chips + previews). */
export function guardUnitEntryLabel(id: string): string {
  if (isRandomPackGuardSlot(id)) {
    const tier = randomPackGuardTierOf(id)!;
    const labels: Record<RandomGuardTier, string> = {
      bronze: "Pack of Tier I (random)",
      silver: "Pack of Tier II (random)",
      gold: "Pack of Tier III (random)",
      azure: "Pack of Tier IV (random)"
    };
    return labels[tier];
  }
  if (isRandomFewGuardSlot(id)) {
    const tier = randomFewGuardTierOf(id)!;
    const labels: Record<RandomGuardTier, string> = {
      bronze: "Few of Tier I (random)",
      silver: "Few of Tier II (random)",
      gold: "Few of Tier III (random)",
      azure: "Few of Tier IV (random)"
    };
    return labels[tier];
  }
  if (isRandomGuardSlot(id)) {
    const tier = randomGuardTierOf(id)!;
    const labels: Record<RandomGuardTier, string> = {
      bronze: "Random brown Neutral",
      silver: "Random silver Neutral",
      gold: "Random gold Neutral",
      azure: "Random azure Neutral"
    };
    return labels[tier];
  }
  if (isPackGuardSlot(id)) {
    const unitDefId = packGuardUnitDefId(id)!;
    const def = coreUnitDefinitions[unitDefId];
    return def ? `Pack of ${def.name}` : id;
  }
  if (isFewGuardSlot(id)) {
    const unitDefId = fewGuardUnitDefId(id)!;
    const def = coreUnitDefinitions[unitDefId];
    return def ? `Few of ${def.name}` : id;
  }
  return coreUnitDefinitions[id]?.name ?? id;
}

/**
 * Collapse consecutive-identical certain-army entries into { id, count } rows
 * for the designer UI and tooltips (presentation only — the stored list stays
 * expanded so sanitize / fight resolve stay slot-based).
 */
export function groupGuardUnitEntries(units: string[]): { id: string; count: number }[] {
  const groups: { id: string; count: number }[] = [];
  for (const id of units) {
    const last = groups[groups.length - 1];
    if (last && last.id === id) {
      last.count += 1;
    } else {
      groups.push({ id, count: 1 });
    }
  }
  return groups;
}

/**
 * Plain-words army summary, e.g. "3× Random gold, Storm Elementals".
 * Empty list → "".
 */
export function describeGuardArmyGrouped(units: string[]): string {
  return groupGuardUnitEntries(units)
    .map(({ id, count }) => {
      const label = guardUnitEntryLabel(id);
      return count > 1 ? `${count}× ${label}` : label;
    })
    .join(", ");
}

/**
 * Expand a grouped count edit back into a flat unit list (capped).
 * Pure helper for the designer +/− steppers.
 */
export function expandGuardUnitGroups(
  groups: { id: string; count: number }[],
  maxUnits: number = MAX_CUSTOM_GUARD_UNITS
): string[] {
  const out: string[] = [];
  for (const { id, count } of groups) {
    const n = Math.max(0, Math.floor(count));
    for (let i = 0; i < n && out.length < maxUnits; i++) {
      out.push(id);
    }
    if (out.length >= maxUnits) break;
  }
  return out;
}

/**
 * Difficulty contribution of one certain-army entry for the map Roman numeral /
 * experience (random tier slots use the tier's point value; packs use the
 * unit's tier). Azure body ⇒ Ⅶ overall when ANY entry is azure-tier.
 */
export function guardUnitEntryPoints(id: string): { points: number; azure: boolean } {
  if (isRandomGuardSlot(id) || isRandomPackGuardSlot(id) || isRandomFewGuardSlot(id)) {
    const tier = isRandomPackGuardSlot(id)
      ? randomPackGuardTierOf(id)!
      : isRandomFewGuardSlot(id)
        ? randomFewGuardTierOf(id)!
        : randomGuardTierOf(id)!;
    if (tier === "azure") return { points: 0, azure: true };
    return { points: tier === "gold" ? 3 : tier === "silver" ? 2 : 1, azure: false };
  }
  const unitDefId = isPackGuardSlot(id)
    ? packGuardUnitDefId(id)!
    : isFewGuardSlot(id)
      ? fewGuardUnitDefId(id)!
      : id;
  const tier = coreUnitDefinitions[unitDefId]?.tier;
  if (tier === "azure") return { points: 0, azure: true };
  return {
    points: tier === "gold" ? 3 : tier === "silver" ? 2 : tier === "bronze" ? 1 : 0,
    azure: false
  };
}

/**
 * Field Difficulty a certain army COUNTS AS — same ladder as
 * `customGuardArmyDifficulty`, but understands random-tier / pack slots.
 */
export function customGuardArmyDifficultyFromEntries(units: string[]): number {
  let points = 0;
  for (const unit of units) {
    const { points: p, azure } = guardUnitEntryPoints(unit);
    if (azure) return 7;
    points += p;
  }
  if (points <= 1) return 1;
  if (points <= 3) return 2;
  if (points === 4) return 3;
  if (points <= 7) return 4;
  if (points <= 10) return 5;
  return 6;
}

export type ResolveCustomGuardOptions = {
  /** Lock Pack / random-pack slots to one faction, or roll once. Neutrals ignore. */
  packFaction?: FactionId | "random";
  /** Playable faction ids when packFaction is "random" (anime-aware list from caller). */
  playableFactions?: readonly string[];
};

function pickRandomFromPool(
  pool: string[],
  rng: { nextInt: (min: number, max: number) => number }
): string | null {
  if (pool.length === 0) return null;
  return pool[rng.nextInt(0, pool.length - 1)] ?? null;
}

/** Unit def ids that have a Pack side of the given tier (optional faction lock). */
export function packUnitPoolForTier(
  tier: RandomGuardTier,
  faction?: string | null
): string[] {
  return Object.keys(coreUnitDefinitions).filter((id) => {
    const def = coreUnitDefinitions[id];
    if (!def?.pack || def.tier !== tier) return false;
    if (faction && def.faction !== faction) return false;
    return true;
  });
}

/** Unit def ids that have a Few side of the given tier (optional faction lock). */
export function fewUnitPoolForTier(
  tier: RandomGuardTier,
  faction?: string | null
): string[] {
  return Object.keys(coreUnitDefinitions).filter((id) => {
    const def = coreUnitDefinitions[id];
    if (!def?.few || def.tier !== tier) return false;
    if (faction && def.faction !== faction) return false;
    return true;
  });
}

/** Unit def ids with a Neutral side of the given tier. */
export function neutralUnitPoolForTier(tier: RandomGuardTier): string[] {
  return Object.keys(coreUnitDefinitions).filter(
    (id) => coreUnitDefinitions[id]?.tier === tier && coreUnitDefinitions[id]?.neutral
  );
}

/**
 * Resolve a packFaction option once for a fight: concrete id, rolled faction,
 * or null (free mix). Used by exact-army and level-as-packs paths.
 */
export function resolvePackFactionForFight(
  packFaction: FactionId | "random" | undefined,
  rng: { nextInt: (min: number, max: number) => number },
  playableFactions?: readonly string[]
): string | null {
  if (!packFaction) return null;
  if (packFaction !== "random") return packFaction;
  const pool =
    playableFactions && playableFactions.length > 0
      ? [...playableFactions]
      : [
          ...new Set(
            Object.values(coreUnitDefinitions)
              .filter((d) => d.pack)
              .map((d) => d.faction)
          )
        ];
  if (pool.length === 0) return null;
  return pool[rng.nextInt(0, pool.length - 1)] ?? null;
}

/**
 * Mint one Pack body of `tier`, honouring an optional faction lock. When no
 * Pack exists for the pool — azure has NO Pack sides anywhere, and a locked
 * faction may lack a tier — fall back to a same-tier NEUTRAL body instead of
 * silently minting nothing: the fight-time army must keep the body COUNT and
 * tier mix the design derived its difficulty (and experience) from.
 */
function packDrawWithNeutralFallback(
  tier: RandomGuardTier,
  lockedFaction: string | null,
  rng: { nextInt: (min: number, max: number) => number }
): ResolvedGuardDraw | null {
  const packId = pickRandomFromPool(packUnitPoolForTier(tier, lockedFaction), rng);
  if (packId) {
    return { unitDefId: packId, tier, factionPack: true, bankGuard: true };
  }
  const neutralId = pickRandomFromPool(neutralUnitPoolForTier(tier), rng);
  if (neutralId) {
    return { unitDefId: neutralId, tier, bankGuard: true };
  }
  return null;
}

function fewDrawWithNeutralFallback(
  tier: RandomGuardTier,
  lockedFaction: string | null,
  rng: { nextInt: (min: number, max: number) => number }
): ResolvedGuardDraw | null {
  const fewId = pickRandomFromPool(fewUnitPoolForTier(tier, lockedFaction), rng);
  if (fewId) {
    return { unitDefId: fewId, tier, factionFew: true, bankGuard: true };
  }
  const neutralId = pickRandomFromPool(neutralUnitPoolForTier(tier), rng);
  if (neutralId) {
    return { unitDefId: neutralId, tier, bankGuard: true };
  }
  return null;
}

/**
 * Resolve design-time certain-army entries into fight-time draws.
 * - `random:<tier>` → random Neutral of that tier
 * - `random-pack:<tier>` → random Pack of that tier (optional faction lock;
 *   no Pack available for the pool → same-tier Neutral, never a missing body)
 * - `random-few:<tier>` → random Few of that tier (same faction lock / fallback)
 * - `pack:<id>` → named Pack; under a faction lock a mismatching name converts
 *   to a random Pack of the SAME tier in the locked faction (the lock promises
 *   one shared faction, the entry promises a body of that tier — keep both)
 * - `few:<id>` → named Few (same faction-lock conversion)
 * - plain id → named Neutral
 * When packFaction is "random", one faction is rolled for the whole army.
 */
export function resolveCustomGuardDraws(
  units: string[],
  rng: { nextInt: (min: number, max: number) => number },
  options?: ResolveCustomGuardOptions
): ResolvedGuardDraw[] {
  const needsFaction =
    Boolean(options?.packFaction) &&
    units.some((entry) => isAnyPackGuardSlot(entry) || isAnyFewGuardSlot(entry));
  const lockedFaction = needsFaction
    ? resolvePackFactionForFight(options?.packFaction, rng, options?.playableFactions)
    : options?.packFaction && options.packFaction !== "random"
      ? options.packFaction
      : null;

  const draws: ResolvedGuardDraw[] = [];
  for (const entry of units.slice(0, MAX_CUSTOM_GUARD_UNITS)) {
    if (isRandomGuardSlot(entry)) {
      const tier = randomGuardTierOf(entry)!;
      const unitDefId = pickRandomFromPool(neutralUnitPoolForTier(tier), rng);
      if (!unitDefId) continue;
      draws.push({ unitDefId, tier, bankGuard: true });
      continue;
    }
    if (isRandomPackGuardSlot(entry)) {
      const tier = randomPackGuardTierOf(entry)!;
      const draw = packDrawWithNeutralFallback(tier, lockedFaction, rng);
      if (draw) draws.push(draw);
      continue;
    }
    if (isRandomFewGuardSlot(entry)) {
      const tier = randomFewGuardTierOf(entry)!;
      const draw = fewDrawWithNeutralFallback(tier, lockedFaction, rng);
      if (draw) draws.push(draw);
      continue;
    }
    if (isPackGuardSlot(entry)) {
      const unitDefId = packGuardUnitDefId(entry)!;
      const def = coreUnitDefinitions[unitDefId];
      if (!def?.pack) continue;
      if (lockedFaction && def.faction !== lockedFaction) {
        const draw = packDrawWithNeutralFallback(def.tier as RandomGuardTier, lockedFaction, rng);
        if (draw) draws.push(draw);
        continue;
      }
      draws.push({
        unitDefId,
        tier: def.tier as RandomGuardTier,
        factionPack: true,
        bankGuard: true
      });
      continue;
    }
    if (isFewGuardSlot(entry)) {
      const unitDefId = fewGuardUnitDefId(entry)!;
      const def = coreUnitDefinitions[unitDefId];
      if (!def?.few) continue;
      if (lockedFaction && def.faction !== lockedFaction) {
        const draw = fewDrawWithNeutralFallback(def.tier as RandomGuardTier, lockedFaction, rng);
        if (draw) draws.push(draw);
        continue;
      }
      draws.push({
        unitDefId,
        tier: def.tier as RandomGuardTier,
        factionFew: true,
        bankGuard: true
      });
      continue;
    }
    const def = coreUnitDefinitions[entry];
    if (!def?.neutral) continue;
    draws.push({
      unitDefId: entry,
      tier: def.tier as RandomGuardTier,
      bankGuard: true
    });
  }
  return draws;
}

/**
 * Expand a Field Difficulty table row into fight-time Pack draws (level guard
 * as real units). Counts come from NEUTRAL_ARMY_TABLE[difficulty][level]; each
 * body is a random Pack of that tier, optionally locked to one faction. A tier
 * with no Pack pool (azure — no faction ships azure Packs) mints a same-tier
 * NEUTRAL instead, so a high-level "packs" guard never fields fewer bodies
 * than the table row it advertises.
 */
export function resolveLevelPackGuardDraws(
  composition: { bronze: number; silver: number; gold: number; azure: number },
  rng: { nextInt: (min: number, max: number) => number },
  options?: ResolveCustomGuardOptions
): ResolvedGuardDraw[] {
  const lockedFaction = resolvePackFactionForFight(
    options?.packFaction,
    rng,
    options?.playableFactions
  );
  const draws: ResolvedGuardDraw[] = [];
  const pushTier = (tier: RandomGuardTier, count: number) => {
    for (let i = 0; i < count; i += 1) {
      const draw = packDrawWithNeutralFallback(tier, lockedFaction, rng);
      if (draw) draws.push(draw);
    }
  };
  pushTier("bronze", composition.bronze);
  pushTier("silver", composition.silver);
  pushTier("gold", composition.gold);
  pushTier("azure", composition.azure);
  return draws;
}

/** True when a CustomGuardSpec uses the level arm with Pack minting. */
export function isLevelPackGuard(guard: CustomGuardSpec | undefined): boolean {
  return Boolean(guard?.level && guard.levelArmy === "packs" && !(guard.units && guard.units.length > 0));
}

/**
 * After a lost / retreated break-field fight, collapse the living neutral
 * units into a fresh certain-army list (unitDefIds, full health on re-fight).
 * Pack survivors keep the `pack:` prefix so they re-mint as faction Packs.
 */
export function survivorsToCustomGuardUnits(
  living: Array<{
    unitDefId?: string;
    factionPack?: boolean;
    factionFew?: boolean;
    bankGuard?: boolean;
  }>
): string[] {
  const units: string[] = [];
  for (const unit of living) {
    if (!unit.unitDefId) continue;
    if (unit.factionPack) {
      units.push(`${PACK_GUARD_PREFIX}${unit.unitDefId}`);
    } else if (unit.factionFew) {
      units.push(`${FEW_GUARD_PREFIX}${unit.unitDefId}`);
    } else {
      units.push(unit.unitDefId);
    }
  }
  return units.slice(0, MAX_CUSTOM_GUARD_UNITS);
}

/** Stamp break / persistent / unlimited combat flags onto a field (optional). */
export function applyBreakFieldOptions(
  field: MapFieldState,
  options:
    | {
        breakField?: boolean;
        persistentGuard?: boolean;
        unlimitedRounds?: boolean;
      }
    | undefined
): void {
  if (!options) return;
  if (options.breakField) field.breakField = true;
  else delete field.breakField;
  if (options.persistentGuard) field.persistentGuard = true;
  else delete field.persistentGuard;
  if (options.unlimitedRounds) field.unlimitedCombatRounds = true;
  else delete field.unlimitedCombatRounds;
}

/** Grail dig MP cost (0 / 1 / 2). Absent preset ⇒ classic 1. */
export function grailDigMovementCost(state: GameState): 0 | 1 | 2 {
  if (polishGrailUtopiaEnabled(state)) return 1;
  const cost = state.adventure?.mapPreset?.objectives?.grailDigCost;
  return cost === 0 || cost === 1 || cost === 2 ? cost : 1;
}

/** End-game VP for possessing / controlling the Grail (0 when unset). */
export function grailPossessionVp(state: GameState): number {
  if (polishGrailUtopiaEnabled(state)) return 3;
  return state.adventure?.mapPreset?.objectives?.grailPossessionVp ?? 0;
}

/** The global Polish Grail / Dragon Utopia rules package. */
export function polishGrailUtopiaEnabled(state: GameState): boolean {
  return houseRuleEnabled(state, "polish-grail-utopia");
}

/** Legal construction sites for the effective Grail rules. */
export function grailBuildAt(
  state: GameState
): NonNullable<CustomMapObjectivesConfig["grailBuildAt"]> | undefined {
  return polishGrailUtopiaEnabled(state)
    ? "both"
    : state.adventure?.mapPreset?.objectives?.grailBuildAt;
}

/** Effective construction reward; the Polish rule always grants a free building. */
export function grailBuildReward(state: GameState): CustomMapObjectivesConfig["grailBuildReward"] {
  const authored = state.adventure?.mapPreset?.objectives?.grailBuildReward;
  return polishGrailUtopiaEnabled(state) ? { ...authored, freeBuilding: true } : authored;
}

/** How a second / Grail dig site may convert after dig (or always-as-utopia). */
export function grailAsUtopiaMode(
  state: GameState
): NonNullable<CustomMapObjectivesConfig["grailAsUtopia"]> | undefined {
  return state.adventure?.mapPreset?.objectives?.grailAsUtopia;
}

/** Random-town gold income (map-maker override; default 10). */
export function randomTownIncomeGold(state: GameState): number {
  const income = state.adventure?.mapPreset?.randomTowns?.incomeGold;
  return typeof income === "number" && Number.isFinite(income) && income >= 0
    ? Math.min(50, Math.floor(income))
    : 10;
}

/** Capture-time resource reward for a Random Town (first capture only when set). */
export function randomTownCaptureReward(
  state: GameState
): { gold?: number; buildingMaterials?: number; valuables?: number } | undefined {
  return state.adventure?.mapPreset?.randomTowns?.captureReward;
}

/** Map-wide custom Random Town guard, if the designer set one. */
export function randomTownCustomGuard(state: GameState): CustomGuardSpec | undefined {
  return state.adventure?.mapPreset?.randomTowns?.guard;
}

/** Map-wide mine options (guard / break) from the preset. */
export function minePresetOptions(state: GameState): CustomMapPreset["mines"] | undefined {
  return state.adventure?.mapPreset?.mines;
}

/** Map-wide obelisk break options (beyond role/guard/bonus). */
export function obeliskBreakOptions(state: GameState): Pick<
  NonNullable<CustomMapPreset["obelisks"]>,
  "breakField" | "persistentGuard" | "unlimitedRounds"
> | undefined {
  const o = state.adventure?.mapPreset?.obelisks;
  if (!o) return undefined;
  if (!o.breakField && !o.persistentGuard && !o.unlimitedRounds) return undefined;
  return {
    ...(o.breakField ? { breakField: true } : {}),
    ...(o.persistentGuard ? { persistentGuard: true } : {}),
    ...(o.unlimitedRounds ? { unlimitedRounds: true } : {})
  };
}
