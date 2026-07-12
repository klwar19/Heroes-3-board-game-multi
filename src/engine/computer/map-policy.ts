import { coreBuildingDefinitions } from "@/data/factions/core";
import { locationDefinitions } from "@/data/map/locations";
import type { GameAction } from "../state";
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

function moveScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "MOVE_HERO" }>,
): number {
  const field = observation.state.adventure?.fields[action.to];
  if (!field) return 650;

  const opposingHero = Object.values(observation.state.heroes).some(
    (hero) => hero.spaceId === action.to && hero.controllerId !== observation.playerId,
  );
  // Until the combat-strength evaluator lands, uncertainty is not treated as
  // weakness. Do not initiate PvP or attack an enemy holding blindly.
  if (opposingHero || (field.flagOwnerId && field.flagOwnerId !== observation.playerId)) {
    return 200;
  }
  if ((field.difficulty ?? 0) > 0) return 250;

  const category = locationDefinitions[field.location]?.category;
  let score = 650;
  if (category === "town" && field.flagOwnerId !== observation.playerId) score += 150;
  if (category === "flaggable" && field.flagOwnerId !== observation.playerId) score += 125;
  if (category === "visitable" && !field.blackCube) score += 105;
  if (category === "revisitable") score += 45;
  return score;
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
