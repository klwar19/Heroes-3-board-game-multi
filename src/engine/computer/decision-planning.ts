import { locationDefinitions } from "@/data/map/locations";
import { isFieldGuarded } from "../adventure";
import type { GameState, LegalAction } from "../state";
import { upcomingFight } from "./card-planning";
import { playersAreAllied } from "./control";
import { ATTACK_CEIL, ATTACK_FLOOR } from "./combat-policy";
import {
  combatHorizonAdjustment,
  COMBAT_PLANNING_CANDIDATES,
  COMBAT_PLANNING_WORK_LIMIT,
} from "./planning-horizon";
import type { ComputerObservation } from "./types";

type RankedAction = { legal: LegalAction; score: number; policy: string; tie: number };

const FREE_INFORMATION_INTERACTIONS = new Set([
  "ROLL_RESOURCE_DICE", "ROLL_TREASURE_DICE", "GAIN_RESOURCES",
  "SEARCH_SHARED_DECK", "DISCOVER_ADJACENT_TILE", "SCHOLAR",
]);

/** A finite reveal/pickup can change the best use of money and town tokens.
 * Defer discretionary spending until that result is known, but preserve core
 * development, vouchers, battle preparation and every existing safety gate.
 * No new routes or hypothetical purchases are generated here. */
export function deferDiscretionarySpending(observation: ComputerObservation, ranked: RankedAction[]): void {
  const state = observation.state as unknown as GameState;
  if (!state.adventure || state.combat || upcomingFight(observation)?.kind === "pvp" ||
      observation.memory?.developmentPlan?.goal === "rebuild") return;

  let informationScore = 300;
  for (const candidate of ranked) {
    if (candidate.score <= 300) continue;
    const action = candidate.legal.action;
    if (action.type === "DISCOVER_TILE") {
      informationScore = Math.max(informationScore, candidate.score);
    } else if (action.type === "MOVE_HERO") {
      const field = state.adventure.fields[action.to];
      // Restrict to a fresh, unguarded pickup. Empty moves, repeat visits,
      // banks, town assaults and teleports must not starve development.
      if (!field || field.blackCube || isFieldGuarded(field) ||
          locationDefinitions[field.location]?.category !== "visitable" ||
          !FREE_INFORMATION_INTERACTIONS.has(locationDefinitions[field.location]?.interaction.type) ||
          Object.values(state.heroes).some(hero => hero.spaceId === action.to &&
            !playersAreAllied(state, observation.playerId, hero.controllerId))) continue;
      informationScore = Math.max(informationScore, candidate.score);
    }
  }
  if (informationScore <= 300) return;
  for (const candidate of ranked) {
    const type = candidate.legal.action.type;
    // The 950+ band contains explicit milestone / hero priorities. The
    // voucher and preparation bands are higher still and remain untouched.
    if ((type === "BUILD_STRUCTURE" || type === "POPULATION_ACTION") &&
        candidate.score > 300 && candidate.score < 950 && candidate.score >= informationScore) {
      candidate.score = Math.max(301, informationScore - 13);
      candidate.policy = "plan.observe-before-discretionary-spend";
    }
  }
}

/** Called once after ordinary scoring, before learned close-choice nudges.
 * At most four close attacks share 384 reply checks. Exhaustion discards the
 * whole refinement, so enumeration order cannot reward an unfinished search. */
export function refineCombatShortlist(observation: ComputerObservation, ranked: RankedAction[]): void {
  if (!observation.state.combat) return;
  const ordinaryAttack = (candidate: RankedAction) =>
    candidate.policy === "combat.attack-target" && candidate.score >= ATTACK_FLOOR && candidate.score <= ATTACK_CEIL;
  const shortlist = ranked.filter(ordinaryAttack)
    .sort((a, b) => b.score - a.score || b.tie - a.tie);
  const best = shortlist[0];
  if (!best || ranked.some(candidate => !ordinaryAttack(candidate) && candidate.score > Math.min(ATTACK_CEIL, best.score + 24))) return;
  const close = shortlist.filter(candidate => best.score - candidate.score <= 48).slice(0, COMBAT_PLANNING_CANDIDATES);
  const budget = { remaining: COMBAT_PLANNING_WORK_LIMIT };
  const adjustments: number[] = [];
  for (const candidate of close) {
    adjustments.push(combatHorizonAdjustment(observation.state as unknown as GameState, candidate.legal.action, budget));
    if (budget.remaining < 0) return;
  }
  close.forEach((candidate, index) => {
    candidate.score = Math.max(ATTACK_FLOOR, Math.min(ATTACK_CEIL, candidate.score + adjustments[index]));
    if (adjustments[index] !== 0) candidate.policy = "combat.attack-target-lookahead";
  });
}
