import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  STACK_TOKENS_BY_DIFFICULTY,
  type CreatureBankId,
} from "@/data/map/creature-banks";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { assessDwellingRush } from "./development";
import type { UnitTier } from "@/data/factions/types";
import { getUnitSide, NEUTRAL_ARMY_TABLE, neutralArmyDifficulty } from "../adventure";
import type {
  ArmyUnitState,
  BankSize,
  GameDifficulty,
  GameState,
  MapFieldState,
  PlayerId,
} from "../state";

/**
 * A rough combat value for an army card side, used ONLY to order engagement
 * decisions (fight this hero or not) — never to resolve a battle, which the real
 * dice-driven combat engine still does. Attack is weighted heaviest (it is what
 * ends enemy units), health next (it is what keeps yours alive), with defense
 * and a slice of initiative rounding it out. Mirrors the combat policy's
 * `unitThreatValue` so the map read and the in-combat read agree on what a unit
 * is worth.
 */
export function unitSideStrength(unit: ArmyUnitState): number {
  const side = getUnitSide(unit.unitDefId, unit.side);
  if (!side) {
    return 0;
  }
  const stackLayers =
    unit.side === "pack" || unit.side === "neutral" ? Math.max(0, unit.stacks ?? 0) : 0;
  // A Polish Stack does not create another activation/body: it adds one full
  // Pack health bar per layer, and the whole card has one flat +1 Attack while
  // any layer remains. Mirror that real combat durability instead of treating
  // a Stack as either zero value or a duplicate attacking unit.
  const attack = side.attack + (unit.permanentAttackBonus ?? 0) + (stackLayers > 0 ? 1 : 0);
  const health = (side.health + (unit.permanentHealthBonus ?? 0)) * (1 + stackLayers);
  return attack * 3 + health * 2 + side.defense + Math.round(side.initiative / 2);
}

/** Total army strength of a player's unit deck (all sides summed). */
export function playerArmyStrength(
  state: GameState,
  playerId: PlayerId,
): number {
  const army = state.players[playerId]?.army ?? [];
  return army.reduce((total, unit) => total + unitSideStrength(unit), 0);
}

/**
 * How close the attacker's army must be to the defender's before the computer
 * is willing to start the fight. Below 1 deliberately: a game opponent that only
 * attacks when overwhelmingly ahead never fights, so it engages on a roughly
 * even — or even slightly unfavourable — matchup and lets the dice decide,
 * rather than hoarding units it never risks.
 */
export const ENEMY_ENGAGE_RATIO = 0.85;

/**
 * Banks are always a full fight (no Quick Combat). Slightly pickier than hero
 * fights so the AI does not throw weak armies into stacked near-tier dragons.
 */
export const BANK_ENGAGE_RATIO = 0.9;

/**
 * Whether the computer player `playerId` should be willing to walk its main army
 * into a battle with `enemyPlayerId`. A larger or comparable army engages; a
 * clearly outmatched one holds off. An enemy with no valued army (nothing to
 * fear) is always engaged.
 */
export function shouldEngageEnemy(
  state: GameState,
  playerId: PlayerId,
  enemyPlayerId: PlayerId,
): boolean {
  const enemyStrength = playerArmyStrength(state, enemyPlayerId);
  if (enemyStrength <= 0) {
    return true;
  }
  return playerArmyStrength(state, playerId) >= enemyStrength * ENEMY_ENGAGE_RATIO;
}

/**
 * Combat value of one Creature Bank unit card (bank column stats, not Few/Pack).
 * Unknown ids score 0 so a missing definition never invents a free fight.
 */
export function bankUnitStrength(unitDefId: string): number {
  const side = CREATURE_BANK_UNIT_SIDES[unitDefId];
  if (!side) return 0;
  return (
    side.attack * 3 +
    side.health * 2 +
    side.defense +
    Math.round(side.initiative / 2)
  );
}

/**
 * Estimated defender strength for a known bank token. Expected stack tokens
 * (difficulty rolls) inflate health/attack conservatively so Easy is easier
 * than Impossible — the real stack count is random at combat start.
 */
export function creatureBankStrength(
  bankId: string,
  difficultyOrSize: keyof typeof STACK_TOKENS_BY_DIFFICULTY | BankSize = "normal",
): number {
  const bank = CREATURE_BANKS[bankId as CreatureBankId];
  if (!bank) return Number.POSITIVE_INFINITY;
  if (typeof difficultyOrSize === "number") {
    const layers = Math.max(0, difficultyOrSize - 1);
    return bank.units.reduce((sum, unitDefId) => {
      const side = CREATURE_BANK_UNIT_SIDES[unitDefId];
      if (!side) return sum;
      // Numeric Polish sizes are deterministic: each of all four cards repeats
      // its complete Health bar once per layer, plus one flat Attack while any
      // layer remains. This mirrors the combat stat valuation above.
      return sum + bankUnitStrength(unitDefId) + layers * side.health * 2 + (layers > 0 ? 3 : 0);
    }, 0);
  }
  const base = bank.units.reduce(
    (sum, unitDefId) => sum + bankUnitStrength(unitDefId),
    0,
  );
  const rolls = STACK_TOKENS_BY_DIFFICULTY[difficultyOrSize] ?? 2;
  // Stack tokens add a mild bulk/soak bonus, not a full extra unit each.
  // Calibrated so a full starting army (~45) clears Imp Cache on Normal but
  // refuses Dragon Utopia and refuses when gutted to one card.
  const expectedStacks = rolls * 0.77;
  return Math.round(base * (1 + expectedStacks * 0.1));
}

/**
 * Whether the computer should walk into this Creature Bank. Requires a known
 * `field.bankId` (face-up token). Unknown banks are refused (no blind gamble).
 */
export function canBeatCreatureBank(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
): boolean {
  if (field.location !== "creature_bank") return false;
  const bankId = field.bankId;
  if (!bankId) return false;
  const difficultyOrSize =
    field.bankSize ??
    ((state.adventure?.difficulty as keyof typeof STACK_TOKENS_BY_DIFFICULTY) ??
      "normal");
  const bankStr = creatureBankStrength(bankId, difficultyOrSize);
  if (!Number.isFinite(bankStr) || bankStr <= 0) return false;
  return playerArmyStrength(state, playerId) >= bankStr * BANK_ENGAGE_RATIO;
}

// ---------------------------------------------------------------------------
// ARMY-TIER GUARD ENGAGEMENT REFERENCE (Step 5)
// ---------------------------------------------------------------------------
//
// The user's reference: "silver unit can take lv3 neutral at impossible, gold
// can take lv5" — army COMPOSITION, not just hero level, should decide which
// guard FIELDS the AI is willing to fight.
//
// GROUNDING — how the scenario difficulty scales a guard-field battle: a plain
// guard field IS scaled by scenario difficulty. `drawGuardArmy` in adventure.ts
// draws the guard party from `NEUTRAL_ARMY_TABLE[scenarioDifficulty][fieldDifficulty]`
// (STACK_TOKENS_BY_DIFFICULTY is the SEPARATE Creature-Bank knob). For a fixed
// field difficulty the party gets strictly HARDER (higher tiers) as the scenario
// difficulty rises — e.g. field difficulty 3 is {bronze 1, silver 1} on Easy but
// {silver 3} on Impossible. So Impossible is the WORST case, which is exactly
// where the user pinned the anchors; at any easier scenario difficulty the same
// army tier safely takes an EQUAL-or-HIGHER field difficulty.
//
// DERIVATION — `armyTierGuardCap` reads the real table: an army whose top tier is
// T can take a field whose guard party (a) contains NO tier strictly above T, and
// (b) has at most MAX_TOP_TIER_GUARDS units of T. MAX_TOP_TIER_GUARDS = 3 falls
// straight out of BOTH anchors (field 3 @ Impossible = {silver 3}; field 5 @
// Impossible = {silver 1, gold 3} — each is exactly 3 of the army's own top tier).
// This reproduces the anchors (silver→3, gold→5 at Impossible) and derives the
// rest: silver caps 4/4/4/3 (easy/normal/hard/impossible), gold caps 6/6/6/5,
// bronze caps 2/2/2/1, azure 7 everywhere (nothing outranks an azure dragon).
const TIER_RANK: Record<UnitTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  azure: 3,
};
const ALL_TIERS: readonly UnitTier[] = ["bronze", "silver", "gold", "azure"];

/**
 * Both anchors have exactly three of the army's own top tier (field 3 @
 * Impossible = 3 silver; field 5 @ Impossible = 3 gold), so three top-tier
 * guards is the reference an army of that tier is expected to clear.
 */
export const MAX_TOP_TIER_GUARDS = 3;

/**
 * Guard rail so a single premium body does not charge a camp: the army must hold
 * at least this many ALIVE units of the qualifying tier for that tier to unlock
 * its guard cap. Map army cards carry no fractional health (a unit is alive iff
 * it is still in the deck), so a COUNT is the honest floor — one lone silver Few
 * alone never justifies a level-3 fight; two do.
 *
 * Exception (`MIN_SILVER_WITH_BRONZE_CORE` + `BRONZE_PACK_CORE_FOR_SILVER`): a
 * three-Pack bronze core PLUS even a single silver body IS enough for the silver
 * cap (difficulty 3 @ Impossible) — the opening force the AI must hit premium
 * Far economy with, not afraid of trading units.
 */
export const MIN_TIER_UNITS_FOR_ENGAGE = 2;

/** One silver body is enough once the three-Pack bronze core is fielded. */
export const MIN_SILVER_WITH_BRONZE_CORE = 1;

/** Pack-side bronze count that unlocks the single-silver soft engagement. */
export const BRONZE_PACK_CORE_FOR_SILVER = 3;

/** How many army cards of each tier the player currently fields (alive = in deck). */
function armyTierCounts(
  state: GameState,
  playerId: PlayerId,
): Record<UnitTier, number> {
  const counts: Record<UnitTier, number> = {
    bronze: 0,
    silver: 0,
    gold: 0,
    azure: 0,
  };
  for (const unit of state.players[playerId]?.army ?? []) {
    const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
    if (tier) {
      counts[tier] += 1;
    }
  }
  return counts;
}

/** Pack-side bronze bodies — the reliable early core the soft silver unlock needs. */
function armyBronzePackCount(state: GameState, playerId: PlayerId): number {
  let packs = 0;
  for (const unit of state.players[playerId]?.army ?? []) {
    if (
      unit.side === "pack" &&
      coreUnitDefinitions[unit.unitDefId]?.tier === "bronze"
    ) {
      packs += 1;
    }
  }
  return packs;
}

/**
 * The highest unit tier the army fields in real numbers — the top tier for which
 * it holds at least MIN_TIER_UNITS_FOR_ENGAGE alive cards. Soft unlock: three
 * bronze Packs + a single silver body still unlocks the silver guard cap (user:
 * "3 pack bronze + even just 1 silver → MUST HIT lv3") — checked BEFORE the
 * bronze-only floor so a pack core does not mask the silver reach. Null when
 * no tier clears either rail.
 */
export function armyEngagementTier(
  state: GameState,
  playerId: PlayerId,
): UnitTier | null {
  const counts = armyTierCounts(state, playerId);
  // Premium tiers first (azure → gold → silver) with the hard MIN_TIER floor.
  for (let rank = ALL_TIERS.length - 1; rank >= 1; rank -= 1) {
    const tier = ALL_TIERS[rank];
    if (counts[tier] >= MIN_TIER_UNITS_FOR_ENGAGE) {
      return tier;
    }
  }
  // Soft silver unlock — gold/azure still need two bodies (MIN_TIER). A lone
  // silver Few with no Pack core stays on the level gate (CONTROL). Must beat
  // the bronze floor below or three Packs would always report "bronze".
  if (
    counts.silver >= MIN_SILVER_WITH_BRONZE_CORE &&
    armyBronzePackCount(state, playerId) >= BRONZE_PACK_CORE_FOR_SILVER
  ) {
    return "silver";
  }
  if (counts.bronze >= MIN_TIER_UNITS_FOR_ENGAGE) {
    return "bronze";
  }
  return null;
}

/**
 * Settlement or gold/valuables mine — the premium Far economy the AI must hit
 * aggressively (lv3 ASAP once the force is ready for the scenario difficulty).
 * Not afraid of unit losses on these targets.
 */
export function isPremiumEconomyField(field: MapFieldState): boolean {
  if (field.location === "settlement") return true;
  return (
    field.location === "mine" &&
    (field.resource === "gold" || field.resource === "valuables")
  );
}

/**
 * The highest guard-FIELD difficulty an army whose top tier is `armyTier` should
 * fight at scenario `difficulty`, read from the real guard-draw table. Fields are
 * walked from 1 up; the walk stops at the first field whose party introduces a
 * tier above the army's own (a fight it cannot answer) or more than
 * MAX_TOP_TIER_GUARDS of its own top tier — both are monotonic in field
 * difficulty, so the last field before the stop is the cap. 0 = never extends.
 */
export function armyTierGuardCap(
  difficulty: GameDifficulty,
  armyTier: UnitTier,
): number {
  const table = NEUTRAL_ARMY_TABLE[difficulty];
  const armyRank = TIER_RANK[armyTier];
  let cap = 0;
  for (let field = 1; field <= 7; field += 1) {
    const party = table[field];
    if (!party) {
      break;
    }
    const hasHigherTier = ALL_TIERS.some(
      (tier) => TIER_RANK[tier] > armyRank && (party[tier] ?? 0) > 0,
    );
    if (hasHigherTier) {
      break;
    }
    if ((party[armyTier] ?? 0) > MAX_TOP_TIER_GUARDS) {
      break;
    }
    cap = field;
  }
  return cap;
}

/**
 * PREMIUM-ECONOMY rush cap (settlement / gold / valuables only).
 *
 * The strict `armyTierGuardCap` stops bronze armies at the first field that
 * introduces a silver guard — so hard/normal/easy field-3 parties (which all
 * mix in silver) would wait for a silver recruit. Premium economy is worth
 * unit losses, so three bronze Packs alone unlock difficulty 3 on easy /
 * normal / hard the moment the Pack core is ready. Impossible still needs at
 * least one silver body (3 pure silver guards). Silver/gold tier extensions
 * still raise the cap above 3 when the army qualifies.
 *
 * Grounded in NEUTRAL_ARMY_TABLE field-3 parties:
 *   easy    {bronze 1, silver 1}  — 3 Packs overpower
 *   normal  {bronze 2, silver 1}  — 3 Packs overpower with losses
 *   hard    {bronze 1, silver 2}  — user: 3 Packs can tackle
 *   impossible {silver 3}         — needs a silver body + 3 Packs
 */
export function premiumEconomyEngageCap(
  state: GameState,
  playerId: PlayerId,
): number {
  const scenario = neutralArmyDifficulty(state);
  const bronzePacks = armyBronzePackCount(state, playerId);
  const counts = armyTierCounts(state, playerId);
  let cap = 0;

  // Full silver/gold/azure tier extension still applies on premium targets.
  const tier = armyEngagementTier(state, playerId);
  if (tier && TIER_RANK[tier] >= TIER_RANK.silver) {
    cap = Math.max(cap, armyTierGuardCap(scenario, tier));
  }

  // Three bronze Packs → lv3 ASAP on every difficulty that does not field a
  // pure multi-silver wall (Impossible needs the soft-silver unlock above).
  if (bronzePacks >= BRONZE_PACK_CORE_FOR_SILVER) {
    if (scenario === "impossible") {
      if (counts.silver + counts.gold + counts.azure >= 1) {
        cap = Math.max(cap, 3);
      }
    } else {
      // easy / normal / hard — Pack core alone is enough for lv3 premium.
      cap = Math.max(cap, 3);
    }
  }

  return cap;
}

/**
 * Whether the army is ready to walk into this premium-economy guard (losses OK).
 * Used only for settlement / gold / valuables — never for junk neutrals.
 */
export function armyCoversPremiumEconomyGuard(
  state: GameState,
  playerId: PlayerId,
  fieldDifficulty: number,
): boolean {
  if (fieldDifficulty <= 0) return false;
  return fieldDifficulty <= premiumEconomyEngageCap(state, playerId);
}

/**
 * STAGING: a known premium field (settlement / gold / valuables, difficulty
 * 1-3) the Pack core cannot cover YET — on Impossible the cap needs the first
 * silver body, which is one Population purchase away once the Silver dwelling
 * stands. Marching there NOW and waiting adjacent converts "silver arrives →
 * fight next round" instead of "silver arrives → 3-round march → fight R8+"
 * (measured: the hero drifted from dist 2 to dist 5 exactly while the silver
 * chain completed). The march planner must never ENTER the field until
 * `canBeatGuardedField` flips — staging is positioning only.
 */
export function premiumEconomyWorthStaging(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
): boolean {
  if (!isPremiumEconomyField(field)) return false;
  const difficulty = field.difficulty ?? 0;
  if (difficulty <= 0 || difficulty > 3) return false;
  if (field.flagOwnerId) return false;
  if (armyCoversPremiumEconomyGuard(state, playerId, difficulty)) return false;
  // The Pack core must already stand — staging with a half-built army would
  // pull the hero off the home-tile drain and the opening development.
  const counts = armyTierCounts(state, playerId);
  if (
    armyBronzePackCount(state, playerId) < BRONZE_PACK_CORE_FOR_SILVER ||
    counts.silver + counts.gold + counts.azure > 0
  ) {
    return false;
  }
  // The whole remaining silver chain (dwelling gold+materials, then the body)
  // is position-independent — builds and Population purchases fire from
  // anywhere — with ONE exception: a feasible dwelling-rush TRADE needs the
  // hero standing at a market. Staging while that trade is pending deadlocks
  // (measured: the parked hero never walked back, silver slid to R10/never);
  // staging in every other case is pure tempo (measured: capture R9 → R6 when
  // the hero waits adjacent instead of collecting westward and marching back).
  const dwelling = coreFactionDefinitions[
    state.players[playerId]?.factionId ?? ""
  ]?.buildings.find((buildingId) => {
    const effect = coreBuildingDefinitions[buildingId]?.effect;
    return effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver";
  });
  if (!dwelling) return false;
  const silverUnlocked = Object.values(state.towns ?? {}).some(
    (town) =>
      town.controllerId === playerId && town.buildings.includes(dwelling),
  );
  if (silverUnlocked) return true;
  return !assessDwellingRush(state, playerId)?.feasible;
}

/**
 * Whether the player's ARMY composition (not just hero level) justifies fighting
 * a guard field of `fieldDifficulty`. Deliberately EXTENDS engagement and never
 * refuses one: it is OR-ed with the level-based Quick-Combat gate in
 * `canBeatGuardedField`, so a fight the level already covers is untouched.
 *
 * Only a SILVER-or-higher engagement tier extends the reach: a bronze-only army
 * is exactly the baseline the level gate already models, so its behaviour is left
 * unchanged (the reference's job is to let a silver/gold-bearing army punch above
 * its hero level, not to re-tune the opening bronze play). Three bronze Packs +
 * one silver soft-unlocks the silver cap (lv3). The full derived table —
 * including the bronze caps — is still pinned in the tests.
 *
 * Premium economy uses `armyCoversPremiumEconomyGuard` instead (difficulty-
 * aware Pack-core rush).
 */
export function armyTierCoversGuardField(
  state: GameState,
  playerId: PlayerId,
  fieldDifficulty: number,
): boolean {
  if (fieldDifficulty <= 0) {
    return false;
  }
  const tier = armyEngagementTier(state, playerId);
  if (!tier || TIER_RANK[tier] < TIER_RANK.silver) {
    return false;
  }
  // The engine's own effective-difficulty read: folds in an active Astrologers
  // "Rulebook" proclamation (guards drawn one level easier), so the AI seizes
  // that window exactly like the guard draw itself does.
  return fieldDifficulty <= armyTierGuardCap(neutralArmyDifficulty(state), tier);
}

/**
 * Assault an enemy-flagged Town/Settlement (garrison prompt may open). Uses the
 * same army-strength gate as hero fights — the owner may pay 8 gold and defend
 * with their unit deck, so their army is the right proxy.
 */
export function shouldAssaultEnemyHolding(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
): boolean {
  const ownerId = field.flagOwnerId;
  if (!ownerId || ownerId === playerId) return false;
  return shouldEngageEnemy(state, playerId, ownerId);
}
