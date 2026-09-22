import { getBattlefieldDistance } from "../battlefield";
import { previewSpellDamage } from "../reducer";
import type { CardDefinition, CombatUnitState, GameState } from "../state";
import { unitRemainingHealth, unitRemovalHealth, unitThreatValue } from "./score";

/** Value of a real bolt, including wards, immunity, Pack flips and friendly fire. */
export function chainBoltValue(state: GameState, playerId: string, card: CardDefinition,
  unit: CombatUnitState, amount: number): number {
  const damage = previewSpellDamage(state, unit, card, amount);
  if (damage <= 0) return 0;
  const value = Math.min(damage, unitRemainingHealth(unit)) * 9 +
    Math.min(30, unitThreatValue(unit) / 2) +
    (damage >= unitRemovalHealth(unit) ? 45 : damage >= unitRemainingHealth(unit) ? 18 : 0);
  return unit.controllerId === playerId
    ? -value * (unit.grade === "gold" || unit.grade === "azure" ? 4 : 1.5) : value;
}

/** Only three bolts and the two-nearest distance boundary used by the engine.
 * Inspect public units; no actions, random draws or battle rollout are needed. */
export function chainLightningValue(state: GameState, playerId: string, card: CardDefinition,
  primaryId: string, power: number): number {
  const combat = state.combat;
  const primary = combat?.units[primaryId];
  const effect = card.effect;
  if (!combat || !primary || effect.type !== "CHAIN_LIGHTNING") return 0;
  const threshold = Object.keys(effect.damagesByPower ?? {}).map(Number)
    .filter(value => Number.isFinite(value) && value <= power).sort((a, b) => b - a)[0];
  const damages = (threshold === undefined ? undefined : effect.damagesByPower?.[threshold]) ?? effect.damages ?? [];
  let value = chainBoltValue(state, playerId, card, primary, damages[0] ?? 0);
  const living = Object.values(combat.units).filter(unit => unit.position >= 0 && unitRemainingHealth(unit) > 0);
  // The resolver ends combat after removing the last enemy, before any bounce.
  if (primary.controllerId !== playerId && living.filter(unit => unit.controllerId !== playerId).length === 1 &&
      previewSpellDamage(state, primary, card, damages[0] ?? 0) >= unitRemovalHealth(primary)) return value;
  const others = living.filter(unit => unit.id !== primaryId).map(unit => ({ unit,
    distance: getBattlefieldDistance(primary.position, unit.position) }))
    .sort((a, b) => a.distance - b.distance || a.unit.id.localeCompare(b.unit.id));
  const boundary = others[1]?.distance ?? Infinity;
  const pool = others.filter(entry => entry.distance <= boundary).map(entry => entry.unit);
  for (const damage of damages.slice(1).filter(amount => amount > 0)) {
    if (!pool.length) break;
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const bolt = chainBoltValue(state, playerId, card, pool[index], damage);
      if (bolt > bestValue) { bestValue = bolt; bestIndex = index; }
    }
    value += bestValue;
    pool.splice(bestIndex, 1);
  }
  return value;
}
