import { coreBuildingDefinitions } from "@/data/factions/core";
import type { GameAction, GameState } from "../state";
import {
  collectMapObjectives,
  objectiveDistanceField,
  type MapObjectiveKind,
} from "./map-navigation";
import type { ComputerObservation } from "./types";

export type ComputerActionScore = {
  score: number;
  policy: string;
};

function buildingScore(buildingId: string): number {
  const effect = coreBuildingDefinitions[buildingId]?.effect;
  switch (effect?.type) {
    case "UNLOCK_RECRUIT_TIER":
      return effect.tier === "gold" ? 855 : effect.tier === "silver" ? 845 : 835;
    case "UNLOCK_REINFORCE":
      return 850;
    case "RESOURCE_ROUND_CHOICE":
    case "RESOURCE_ROUND_SEARCH_DISCARD":
      return 830;
    case "MAGE_GUILD":
      return 810;
    case "ROUND_START_FREE_SPRITE":
      return 805;
    case "RUNE_ALTAR":
      return 800 + effect.levelCap;
    default:
      return 790;
  }
}

// Stepping directly ONTO an objective (flag it, visit it, or fight a beatable
// guard) — kept below map develop/discover actions so the hero still builds,
// recruits and reveals adjacent tiles first, but well above END_TURN (300).
const OBJECTIVE_ENTER_SCORE: Record<MapObjectiveKind, number> = {
  "enemy-hero": 770,
  guard: 760,
  town: 750,
  flaggable: 740,
  visitable: 720,
};
// A step that shrinks the distance to the nearest objective without arriving
// yet: above END_TURN so the march continues, below entering an objective.
const OBJECTIVE_PROGRESS_BASE = 630;
// A step that reaches no objective / makes no progress: below END_TURN (300) so
// the hero stops instead of wandering back and forth over empty fields.
const NO_PROGRESS_SCORE = 260;

function moveScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "MOVE_HERO" }>,
): number {
  const state = observation.state as unknown as GameState;
  const field = state.adventure?.fields[action.to];
  const hero = state.heroes[action.heroId];
  if (!field || !hero) return NO_PROGRESS_SCORE;

  const objectives = collectMapObjectives(state, hero);
  const distance = objectiveDistanceField(state, hero, objectives);
  const here = hero.spaceId ? distance.get(hero.spaceId) ?? Infinity : Infinity;
  const to = distance.get(action.to) ?? Infinity;

  // The destination IS an objective: enter it (flag / visit / fight the guard or
  // a beatable enemy hero). Enemy-hero engagement is gated by army strength in
  // collectMapObjectives, so reaching this branch already means "worth the risk".
  const arriving = objectives.find((objective) => objective.spaceId === action.to);
  if (to === 0 && arriving) {
    return OBJECTIVE_ENTER_SCORE[arriving.kind];
  }

  // Not a chosen objective: keep clear of a fight we did not calculate for — an
  // enemy hero or holding we are too weak to take, and any guard we cannot beat.
  const opposingHero = Object.values(state.heroes).some(
    (other) => other.spaceId === action.to && other.controllerId !== observation.playerId,
  );
  if (opposingHero || (field.flagOwnerId && field.flagOwnerId !== observation.playerId)) {
    return 200;
  }
  if ((field.difficulty ?? 0) > 0) {
    return 250;
  }
  // Progress toward the nearest objective: prefer the biggest step in, so the
  // hero heads straight down the shortest path instead of drifting.
  if (to < here) {
    return OBJECTIVE_PROGRESS_BASE + Math.max(0, 10 - to);
  }
  return NO_PROGRESS_SCORE;
}

/**
 * Strategic scores for finite adventure-map actions. Returning null delegates
 * to the total safety fallback. In particular OPEN_MARKET and generic deck
 * searches remain delegated because they are repeatable and could loop.
 */
export function scoreMapAction(
  observation: ComputerObservation,
  action: GameAction,
): ComputerActionScore | null {
  switch (action.type) {
    case "POPULATION_ACTION":
      return {
        score: 900 + action.purchases.filter((purchase) => purchase.kind === "reinforce").length * 5,
        policy: "map.recruit-army",
      };
    case "BUILD_STRUCTURE":
      return { score: buildingScore(action.buildingId), policy: "map.build-structure" };
    case "HIRE_SECONDARY_HERO":
      return { score: 780, policy: "map.hire-secondary-hero" };
    case "DISCOVER_TILE":
    case "PLACE_TILE":
      return { score: 775, policy: "map.explore-tile" };
    case "MOVE_HERO":
      return { score: moveScore(observation, action), policy: "map.move-to-objective" };
    case "REVISIT_FIELD":
      return { score: 690, policy: "map.revisit-location" };
    case "SPELL_BOOK_ACTION":
      return { score: 620, policy: "town.buy-spells" };
    case "MAGIC_UNIVERSITY_ACTION":
      return { score: 615, policy: "town.use-magic-university" };
    case "BLACKSMITH_ACTION":
      return {
        score: action.option === "sell" ? 640 : 590,
        policy: action.option === "sell" ? "town.sell-artifact" : "town.search-artifact",
      };
    case "USE_TOWN_BUILDING":
      return { score: 585, policy: "town.use-building" };
    case "SATYR_MORALE_ROLL":
      return { score: 575, policy: "map.use-free-army-action" };
    case "ROGUES_SCOUT_DECK":
    case "THIEVES_GUILD_ACTION":
      return { score: 540, policy: "map.scout-deck" };
    default:
      return null;
  }
}
