import { secondaryHeroPlacementFields } from "../adventure";
import type { GameState, HeroState } from "../state";
import {
  armyReadyForContestedFight,
  developmentResourceTargets,
  armyDevelopmentProfile,
} from "./development";
import {
  collectMapObjectives,
  objectiveDistanceField,
  primaryMapObjective,
} from "./map-navigation";
/** Hire for a concrete short route, not merely because the treasury can pay.
 * Two jobs or a premium income capture must be reachable within two turns. */
export function secondaryHeroOpportunity(
  state: GameState,
  playerId: string,
  fieldId?: string,
): { worthwhile: boolean; jobs: number; target?: string } {
  const player = state.players[playerId];
  const reserve = developmentResourceTargets(state, playerId);
  if (
    !player ||
    !armyReadyForContestedFight(state, playerId) ||
    player.resources.gold < reserve.gold + 10 ||
    (armyDevelopmentProfile(state, playerId).goldUnlocked &&
      armyDevelopmentProfile(state, playerId).goldUnits === 0)
  )
    return { worthwhile: false, jobs: 0 };
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
  let best = {
    worthwhile: false,
    jobs: 0,
    target: undefined as string | undefined,
  };
  for (const placement of placements) {
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
          ["flaggable", "visitable", "explore"].includes(o.kind) &&
          o.spaceId !== mainGoal?.spaceId,
      )
      .filter((o) => {
        const distance = objectiveDistanceField(state, scout, [o]).get(
          placement.fieldId,
        );
        return distance !== undefined && distance > 0 && distance <= 4;
      });
    const premium = jobs.find((o) => {
      const f = state.adventure?.fields[o.spaceId];
      return (
        o.kind === "flaggable" &&
        (f?.location === "settlement" ||
          (f?.location === "mine" && f.resource === "gold"))
      );
    });
    const worthwhile = jobs.length >= 2 || Boolean(premium);
    if (jobs.length > best.jobs || (worthwhile && !best.worthwhile))
      best = {
        worthwhile,
        jobs: jobs.length,
        target: premium?.spaceId ?? jobs[0]?.spaceId,
      };
  }
  return best;
}
