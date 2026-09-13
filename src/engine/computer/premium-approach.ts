import { heroMovementMax, isFieldGuarded } from "../adventure";
import type { GameAction, GameState } from "../state";
import { premiumCombatMovementReserve } from "./combat-movement";
export { premiumCombatMovementReserve } from "./combat-movement";
import {
  canBeatGuardedField, collectMapObjectives, distanceFromHeroTo,
  isFreeSeizeObjective, objectiveDistanceField, primaryMapObjective,
} from "./map-navigation";
import type { ComputerPolicyMemory } from "./memory";
import { isPremiumEconomyField } from "./army-strength";
import { isOpeningFarSweepField } from "./far-sweep";

/** A known, fightable income route takes precedence over another reveal. */
export function hasCommittedIncomeRoute(
  state: GameState, heroId: string, memory: ComputerPolicyMemory,
): boolean {
  const hero = state.heroes[heroId];
  if (!hero?.spaceId || hero.kind !== "main") return false;
  const primary = primaryMapObjective(state, hero, undefined, memory.stickyObjectiveSpaceId);
  const field = primary && state.adventure?.fields[primary.spaceId];
  return Boolean(primary && primary.kind !== "explore" && field && (isPremiumEconomyField(field) || isOpeningFarSweepField(state, hero.controllerId, field)) &&
    (!isFieldGuarded(field) || canBeatGuardedField(state, hero, field)) &&
    distanceFromHeroTo(state, hero, primary.spaceId, true) !== undefined);
}

/** Convert the premium economy commitment into a current/next-turn movement budget. */
export function scorePremiumApproach(
  state: GameState,
  action: Extract<GameAction, { type: "MOVE_HERO" }>,
  memory: ComputerPolicyMemory,
): { score: number; policy: string } | null {
  const hero = state.heroes[action.heroId];
  if (!hero?.spaceId || hero.kind !== "main") return null;
  const objectives = collectMapObjectives(state, hero);
  const primary = primaryMapObjective(state, hero, objectives, memory.stickyObjectiveSpaceId);
  const field = primary && state.adventure?.fields[primary.spaceId];
  if (!primary || primary.kind === "explore" || !field || (field.location !== "settlement" && field.location !== "mine" &&
      !isOpeningFarSweepField(state, hero.controllerId, field)) ||
      (isFieldGuarded(field) && !canBeatGuardedField(state, hero, field))) return null;

  const distance = objectiveDistanceField(state, hero, [primary], true);
  const here = distance.get(hero.spaceId) ?? Infinity;
  const to = distance.get(action.to) ?? Infinity;
  if (!Number.isFinite(here)) return null;
  const reserve = premiumCombatMovementReserve(state, hero, field);
  const movement = hero.movementPoints;
  const nextMovement = heroMovementMax(state, hero);

  if (action.to === primary.spaceId) {
    // The entry itself costs one point. Never start a paid-continuation fight
    // on the last MP when a refreshed turn can afford entry plus the buffer.
    if (movement < 1 + reserve) {
      return { score: 250, policy: "map.premium-save-combat-movement" };
    }
    return { score: 945, policy: "map.premium-capture-now" };
  }

  // No diversion when the capture plus buffer fits THIS turn. Otherwise take
  // a real pickup that leaves the premium guard in next turn's strike range.
  if (here + reserve > movement && here + reserve <= nextMovement) {
    const pickups = objectives.filter(objective => {
      if (!isFreeSeizeObjective(objective, state) || objective.spaceId === hero.spaceId ||
          objective.spaceId === primary.spaceId) return false;
      const walk = distanceFromHeroTo(state, hero, objective.spaceId);
      const returnWalk = distance.get(objective.spaceId) ?? Infinity;
      // Never walk away from the guard to spend leftover MP. A pickup must
      // maintain or shorten the committed route and preserve next-turn entry.
      return walk !== undefined && walk <= movement && returnWalk <= here &&
        returnWalk + reserve <= nextMovement;
    }).sort((a, b) =>
      (distanceFromHeroTo(state, hero, a.spaceId) ?? Infinity) -
      (distanceFromHeroTo(state, hero, b.spaceId) ?? Infinity) ||
      a.spaceId.localeCompare(b.spaceId),
    );
    if (pickups[0]) {
      const pickupDistance = objectiveDistanceField(state, hero, [pickups[0]]);
      if ((pickupDistance.get(action.to) ?? Infinity) <
          (pickupDistance.get(hero.spaceId) ?? Infinity)) {
        return { score: 940, policy: "map.premium-pickup-before-next-turn" };
      }
    }
  }

  // Ordinary safe corridor steps only; existing scoring still handles guards,
  // enemy occupants and gate mechanics. The caller checks that safety score.
  if (to < here) return { score: 931 + Math.max(0, 8 - to), policy: "map.premium-approach" };
  // Do not let a fallback home/exploration move spend the reserved attack
  // turn or reverse this route. Safe, budgeted pickups were handled above.
  // The clamp exists for the PREMIUM income commitment only: an ordinary-mine
  // primary keeps normal scoring (free-pickup scoops stay collectable), and a
  // zero-distance stand (gate-slip re-entry, where no step can shorten the
  // route) must fall through so the guard-reentry setup score can win.
  if (here === 0 || (!isPremiumEconomyField(field) && !isOpeningFarSweepField(state, hero.controllerId, field))) return null;
  return { score: 200, policy: "map.premium-keep-commitment" };
}
