import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  STACK_TOKENS_BY_DIFFICULTY,
  type CreatureBankId,
} from "@/data/map/creature-banks";
import { getUnitSide } from "../adventure";
import type {
  ArmyUnitState,
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
  difficulty: keyof typeof STACK_TOKENS_BY_DIFFICULTY = "normal",
): number {
  const bank = CREATURE_BANKS[bankId as CreatureBankId];
  if (!bank) return Number.POSITIVE_INFINITY;
  const base = bank.units.reduce(
    (sum, unitDefId) => sum + bankUnitStrength(unitDefId),
    0,
  );
  const rolls = STACK_TOKENS_BY_DIFFICULTY[difficulty] ?? 2;
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
  const difficulty =
    (state.adventure?.difficulty as keyof typeof STACK_TOKENS_BY_DIFFICULTY) ??
    "normal";
  const bankStr = creatureBankStrength(bankId, difficulty);
  if (!Number.isFinite(bankStr) || bankStr <= 0) return false;
  return playerArmyStrength(state, playerId) >= bankStr * BANK_ENGAGE_RATIO;
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
