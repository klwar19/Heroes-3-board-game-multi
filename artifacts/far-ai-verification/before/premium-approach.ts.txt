import { fieldCreatureBankId, heroMovementMax, isBankStyleGuardLocation, isFieldGuarded, isTeleportObjectGuardLocation, neutralBattleLevel } from "../adventure";
import { houseRuleEnabled } from "../house-rules";
import { polishQuickCombatEnabled, polishQuickCombatOutcome } from "../polish-quick-combat";
import type { GameAction, GameState, HeroState, MapFieldState } from "../state";
import {
  canBeatGuardedField, collectMapObjectives, distanceFromHeroTo,
  isFreeSeizeObjective, objectiveDistanceField, primaryMapObjective,
} from "./map-navigation";
import type { ComputerPolicyMemory } from "./memory";

/** Reserve paid continuations before entry; dice/cards can still prolong a fight. */
export function premiumCombatMovementReserve(state: GameState, hero: HeroState, field: MapFieldState): number {
  if (!isFieldGuarded(field) || fieldCreatureBankId(field) || isBankStyleGuardLocation(field.location) ||
      isTeleportObjectGuardLocation(field.location) || field.location === "random_town" || field.unlimitedCombatRounds ||
      houseRuleEnabled(state, "free-neutral-combat-extend")) return 0;
  if (!field.customGuardUnits?.length) {
    const difficulty = field.difficulty ?? 1;
    const quickWin = polishQuickCombatEnabled(state)
      ? polishQuickCombatOutcome(state, hero, difficulty) === "mandatory"
      : neutralBattleLevel(state, hero) > difficulty;
    if (quickWin) return 0;
  }
  // Level 2–3 FAR economy (and harder NEAR economy) can take more than two
  // battle rounds. Budget two continuations, capped by a refreshed turn's
  // actual capacity after paying entry so a low-MP hero cannot wait forever.
  const economyFight = field.location === "settlement" || field.location === "mine";
  const reserve = economyFight && (field.difficulty ?? 0) >= 2 ? 2 : 1;
  return Math.min(reserve, Math.max(0, heroMovementMax(state, hero) - 1));
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
  if (!primary || !field || (field.location !== "settlement" && field.location !== "mine") ||
      !canBeatGuardedField(state, hero, field)) return null;

  const distance = objectiveDistanceField(state, hero, [primary]);
  const here = distance.get(hero.spaceId) ?? Infinity;
  const to = distance.get(action.to) ?? Infinity;
  const reserve = premiumCombatMovementReserve(state, hero, field);
  const movement = hero.movementPoints;
  const nextMovement = heroMovementMax(state, hero);

  if (action.to === primary.spaceId) {
    // The entry itself costs one point. Never start a paid-continuation fight
    // on the last MP when a refreshed turn can afford entry plus the buffer.
    if (movement < 1 + reserve && nextMovement >= 1 + reserve) {
      return { score: 250, policy: "map.premium-save-combat-movement" };
    }
    return { score: 945, policy: "map.premium-capture-now" };
  }

  // No diversion when the capture plus buffer fits THIS turn. Otherwise take
  // a real pickup that leaves the premium guard in next turn's strike range.
  if (here + reserve > movement) {
    const pickups = objectives.filter(objective => {
      if (!isFreeSeizeObjective(objective, state) || objective.spaceId === hero.spaceId ||
          objective.spaceId === primary.spaceId) return false;
      const walk = distanceFromHeroTo(state, hero, objective.spaceId);
      const returnWalk = distance.get(objective.spaceId) ?? Infinity;
      return walk !== undefined && walk <= movement && returnWalk + reserve <= nextMovement;
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
  return null;
}
