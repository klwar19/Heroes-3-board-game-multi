import { unitDistance, type FootprintCombat, type FootprintUnit } from "./hex-footprint";

/**
 * Hex battlefield Chain Lightning, PC style (user ruling 2026-09-26: "Chain
 * lightning distance must work correctly"). After the selected unit, every bolt
 * JUMPS from the unit it struck last to the closest unit the chain has not
 * struck yet, friend or foe — the Heroes 3 hop — instead of forking from the
 * selected unit as on the 4×5 board. Units tied at that nearest distance are
 * the caster's pick. Distances are hex distances over whole footprints (a
 * two-hex creature is as near as its nearer hex).
 *
 * Geometry only: callers pass the units still eligible (living, on the board,
 * not yet struck), so the reducer, the hover preview, the legality helpers and
 * the AI all read one rule.
 */
export function chainHopCandidates<U extends FootprintUnit & { id: string }>(
  combat: FootprintCombat | null | undefined,
  from: FootprintUnit,
  pool: readonly U[]
): U[] {
  let best = Infinity;
  let nearest: U[] = [];
  for (const unit of pool) {
    const distance = unitDistance(combat, from, unit);
    if (distance < best) {
      best = distance;
      nearest = [unit];
    } else if (distance === best) {
      nearest.push(unit);
    }
  }
  return nearest.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Every unit some routing of `hops` further bolts could strike from `primary`
 * (each tie branches), for "would or could this hit" checks.
 */
export function chainHexReachable<U extends FootprintUnit & { id: string }>(
  combat: FootprintCombat | null | undefined,
  primary: FootprintUnit,
  others: readonly U[],
  hops: number
): U[] {
  const reached = new Set<U>();
  const follow = (anchor: FootprintUnit, pool: readonly U[], left: number): void => {
    if (left <= 0 || pool.length === 0) return;
    for (const unit of chainHopCandidates(combat, anchor, pool)) {
      reached.add(unit);
      follow(unit, pool.filter((other) => other !== unit), left - 1);
    }
  };
  follow(primary, others, hops);
  return [...reached];
}

/**
 * The hop chain `hops` further bolts follow from `primary` over `others` (the
 * eligible units, primary excluded): `sure` = the units every routing strikes,
 * in hop order; `possible` = the units tied at the first hop that needs the
 * caster's pick (past a tie the route depends on that pick, so the prediction
 * stops there).
 */
export function chainHexHopPreview<U extends FootprintUnit & { id: string }>(
  combat: FootprintCombat | null | undefined,
  primary: FootprintUnit,
  others: readonly U[],
  hops: number
): { sure: U[]; possible: U[] } {
  const sure: U[] = [];
  let anchor: FootprintUnit = primary;
  let pool = [...others];
  for (let hop = 0; hop < hops && pool.length > 0; hop += 1) {
    const nearest = chainHopCandidates(combat, anchor, pool);
    if (nearest.length === 0) break;
    if (nearest.length > 1) return { sure, possible: nearest };
    const struck = nearest[0];
    sure.push(struck);
    anchor = struck;
    pool = pool.filter((unit) => unit !== struck);
  }
  return { sure, possible: [] };
}
