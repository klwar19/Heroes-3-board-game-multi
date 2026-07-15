import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  STACK_TOKENS_BY_DIFFICULTY,
  type CreatureBankId,
} from "@/data/map/creature-banks";
import { coreUnitDefinitions } from "@/data/factions/units";
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
  const attack = side.attack + (unit.permanentAttackBonus ?? 0);
  const health = side.health + (unit.permanentHealthBonus ?? 0);
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
  const base = bank.units.reduce(
    (sum, unitDefId) => sum + bankUnitStrength(unitDefId),
    0,
  );
  const rolls =
    typeof difficultyOrSize === "number"
      ? difficultyOrSize
      : STACK_TOKENS_BY_DIFFICULTY[difficultyOrSize] ?? 2;
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
 * never justifies a level-3 fight; two do.
 */
export const MIN_TIER_UNITS_FOR_ENGAGE = 2;

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

/**
 * The highest unit tier the army fields in real numbers — the top tier for which
 * it holds at least MIN_TIER_UNITS_FOR_ENGAGE alive cards. Null when no tier
 * clears the guard rail (nothing to anchor an extended engagement on).
 */
export function armyEngagementTier(
  state: GameState,
  playerId: PlayerId,
): UnitTier | null {
  const counts = armyTierCounts(state, playerId);
  for (let rank = ALL_TIERS.length - 1; rank >= 0; rank -= 1) {
    const tier = ALL_TIERS[rank];
    if (counts[tier] >= MIN_TIER_UNITS_FOR_ENGAGE) {
      return tier;
    }
  }
  return null;
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
 * Whether the player's ARMY composition (not just hero level) justifies fighting
 * a guard field of `fieldDifficulty`. Deliberately EXTENDS engagement and never
 * refuses one: it is OR-ed with the level-based Quick-Combat gate in
 * `canBeatGuardedField`, so a fight the level already covers is untouched.
 *
 * Only a SILVER-or-higher engagement tier extends the reach: a bronze-only army
 * is exactly the baseline the level gate already models, so its behaviour is left
 * unchanged (the reference's job is to let a silver/gold-bearing army punch above
 * its hero level, not to re-tune the opening bronze play). The full derived table
 * — including the bronze caps — is still pinned in the tests.
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
