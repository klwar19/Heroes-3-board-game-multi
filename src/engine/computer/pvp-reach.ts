import { locationDefinitions } from "@/data/map/locations";
import {
  canCrossEdge, classifyHeroStep, gateFieldsLinked, getAdjacentSpaceIds,
  getHeroMovementCapabilities, heroMovementMax, isFieldGuarded,
  listKnownTeleportDestinations, seaStepHalts,
} from "../adventure";
import type { GameState, HeroState, MapSpaceId } from "../state";

const reachCache = new WeakMap<GameState, Map<string, ReadonlyMap<MapSpaceId, number>>>();

/** Public route forecast for PvP decisions only. No actions, RNG or battles
 * are executed. Current movement is used for our approach; a fresh movement
 * budget is used for an opponent's next opportunity to move. */
export function pvpReach(state: GameState, hero: HeroState, freshTurn = false): ReadonlyMap<MapSpaceId, number> {
  let cache = reachCache.get(state);
  if (!cache) { cache = new Map(); reachCache.set(state, cache); }
  const key = `${hero.id}:${hero.spaceId}:${hero.movementPoints}:${hero.movementHaltedThisTurn}:${freshTurn}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const result = new Map<MapSpaceId, number>();
  cache.set(key, result);
  if (!state.adventure || !hero.spaceId || (!freshTurn && hero.movementHaltedThisTurn)) return result;
  const budget = Math.max(0, freshTurn ? heroMovementMax(state, hero) : hero.movementPoints);
  const movement = getHeroMovementCapabilities(state, hero);
  const best = new Map<string, number>([[`${hero.spaceId}:false:false`, 0]]);
  const queue = [{ spaceId: hero.spaceId, cost: 0, halted: false, transportOnly: false }];
  result.set(hero.spaceId, 0);
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index];
    if (node.cost !== best.get(`${node.spaceId}:${node.halted}:${node.transportOnly}`)) continue;
    const from = state.adventure.fields[node.spaceId];
    // Project the mover's position for equipment-specific embark exemptions.
    const probe = { ...hero, spaceId: node.spaceId, movementPoints: budget - node.cost, movementHaltedThisTurn: false };
    const view = { ...state, heroes: { ...state.heroes, [hero.id]: probe } };
    const steps = (node.halted || node.transportOnly ? [] : getAdjacentSpaceIds(node.spaceId)).map(spaceId => ({ spaceId, teleport: false }));
    // Random portals are possible threats, not a promise of a chosen landing.
    if (from && !isFieldGuarded(from)) {
      steps.push(...listKnownTeleportDestinations(view, node.spaceId).map(spaceId => ({ spaceId, teleport: true })));
    }
    for (const step of steps) {
      const field = state.adventure.fields[step.spaceId];
      if (!field || (!step.teleport && !canCrossEdge(view, node.spaceId, step.spaceId, movement))) continue;
      const freeGate = gateFieldsLinked(from, field);
      const cost = node.cost + (freeGate || step.teleport ? 0 : 1);
      if (cost > budget) continue;
      const kind = classifyHeroStep(view, probe, step.spaceId, movement, budget - cost, node.spaceId);
      if (kind === "block") continue;
      if (kind !== "pass-only") result.set(step.spaceId, Math.min(result.get(step.spaceId) ?? Infinity, cost));
      const occupied = Object.values(state.heroes).some(other => other.id !== hero.id && other.spaceId === step.spaceId);
      const portal = listKnownTeleportDestinations(view, step.spaceId).length > 0;
      const peacefulStop = !occupied && (!isFieldGuarded(field) || freeGate) &&
        (["visitable", "flaggable"].includes(locationDefinitions[field.location]?.category ?? "") ||
          field.location === "subterranean_gate" || portal) && field.location !== "market";
      // Do not assume a guard was won, an enemy was beaten, or a key acquired.
      if (kind === "stop" && !peacefulStop) continue;
      const halted = node.halted || (!step.teleport && seaStepHalts(view, node.spaceId, step.spaceId, movement));
      if (halted && !portal) continue;
      const transportOnly = portal && kind === "stop" && !step.teleport;
      const nextKey = `${step.spaceId}:${halted}:${transportOnly}`;
      if (cost >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, cost);
      queue.push({ spaceId: step.spaceId, cost, halted, transportOnly });
    }
  }
  return result;
}
