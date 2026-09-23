import { secondaryHeroPlacementFields } from "../adventure";
import type { GameState, HeroState } from "../state";
import {
  armyReadyForContestedFight,
  hasGoldArmy,
  nextGoldLadderStep,
  purchaseLandingRounds,
} from "./development";
import { isMarketLocation } from "@/data/map/locations";
import { GOLD_RESERVE, wantsMarketVisit } from "./market-trades";
import {
  collectMapObjectives,
  objectiveDistanceField,
  primaryMapObjective,
  isFreeSeizeObjective,
  premiumRecruitMarketVisit,
  mapScoringCached,
} from "./map-navigation";
import { playersAreAllied } from "./control";
import { pvpReach } from "./pvp-reach";
/** Hire for a concrete short route, not merely because the treasury can pay.
 * Two jobs or a premium income capture must be reachable within two turns. */
export function secondaryHeroOpportunity(
  state: GameState,
  playerId: string,
  fieldId?: string,
): { worthwhile: boolean; jobs: number; target?: string } {
  return mapScoringCached(state, `secondary-route:${playerId}:${fieldId ?? "any"}`,
    () => secondaryHeroOpportunityUncached(state, playerId, fieldId));
}

function secondaryHeroOpportunityUncached(
  state: GameState, playerId: string, fieldId?: string,
): { worthwhile: boolean; jobs: number; target?: string } {
  const player = state.players[playerId];
  if (
    !player ||
    !hasGoldArmy(state, playerId) ||
    !armyReadyForContestedFight(state, playerId) ||
    player.resources.gold < GOLD_RESERVE + 10
  )
    return { worthwhile: false, jobs: 0 };
  const step = nextGoldLadderStep(state, playerId);
  if (step) {
    const before = purchaseLandingRounds(player.resources, player.production, step.cost, false);
    const after = purchaseLandingRounds({ ...player.resources, gold: player.resources.gold - 10 }, player.production, step.cost, false);
    // Hiring also spends this round's Population token. Keep an affordable
    // Gold recruit first. With a Gold body already standing, a collector that
    // sweeps the leftover pickups may push the next ladder step back by at
    // most one Resource Round (it pays that back from the pickups); measured
    // before: the strict "no delay at all" gate hired only at R11, in 5 of 48
    // impossible games, even for seats holding their Gold body from R7.
    if (step.kind === "recruit" && before === 0 || before !== null && (after === null || after > before + 1)) {
      return { worthwhile: false, jobs: 0 };
    }
  }
  const main = Object.values(state.heroes ?? {}).find(
    (h) => h.controllerId === playerId && h.kind === "main",
  );
  if (
    !main ||
    Object.values(state.heroes ?? {}).some(
      (h) => h.controllerId === playerId && h.kind === "secondary",
    )
  )
    return { worthwhile: false, jobs: 0 };
  const mainGoal = primaryMapObjective(
    state,
    main,
    collectMapObjectives(state, main),
  );
  const placements = secondaryHeroPlacementFields(state, playerId).filter(
    (p) => !fieldId || p.fieldId === fieldId,
  );
  const danger = new Set<string>();
  for (const enemy of Object.values(state.heroes ?? {})) {
    if (!enemy.spaceId || enemy.controllerId === "neutrals" || state.players[enemy.controllerId]?.eliminated ||
        playersAreAllied(state, playerId, enemy.controllerId)) continue;
    for (const spaceId of pvpReach(state, enemy, true).keys()) danger.add(spaceId);
  }
  let best = {
    worthwhile: false,
    jobs: 0,
    target: undefined as string | undefined,
  };
  for (const placement of placements) {
    if (danger.has(placement.fieldId)) continue;
    const scout: HeroState = {
      id: "prospective-secondary",
      controllerId: playerId,
      kind: "secondary",
      level: 1,
      experience: 0,
      movementPoints: 2,
      movementPointsMax: 2,
      spaceId: placement.fieldId,
    };
    const jobs = collectMapObjectives(state, scout)
      .filter(
        (o) =>
          // "town" passes isFreeSeizeObjective but means an enemy town — a
          // siege is not a collection job for the fresh scout.
          o.kind !== "town" &&
          (isFreeSeizeObjective(o, state) ||
            (isMarketLocation(state.adventure?.fields[o.spaceId]?.location ?? "") &&
              (wantsMarketVisit(state, playerId, state.adventure?.fields[o.spaceId]?.location) ||
                premiumRecruitMarketVisit(state, playerId, state.adventure?.fields[o.spaceId]?.location)))) &&
          o.spaceId !== mainGoal?.spaceId && !danger.has(o.spaceId),
      )
      .map(objective => ({ objective, distances: objectiveDistanceField(state, scout, [objective], true) }))
      .map(job => ({ ...job, distance: job.distances.get(placement.fieldId) ?? Infinity }))
      .filter(job => job.distance > 0 && job.distance <= 4)
      .sort((a, b) => a.distance - b.distance || a.objective.spaceId.localeCompare(b.objective.spaceId))
      .slice(0, 8);
    for (const first of jobs) {
      const field = state.adventure?.fields[first.objective.spaceId];
      const premium = first.objective.kind === "flaggable" && (field?.location === "settlement" || field?.location === "mine");
      // Count a connected itinerary, not two independent four-step radii on
      // opposite sides of the hire location. Reuse the same distance fields.
      const second = jobs.some(next => next !== first &&
        first.distance + (next.distances.get(first.objective.spaceId) ?? Infinity) <= 4);
      const count = second ? 2 : 1;
      const worthwhile = second || premium;
      if (worthwhile && (!best.worthwhile || count > best.jobs)) best = {
        worthwhile, jobs: count, target: first.objective.spaceId,
      };
    }
  }
  return best;
}
