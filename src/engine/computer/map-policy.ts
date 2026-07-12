import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { canHeroReachPlacedTile } from "../adventure";
import { isTileRotationConnected } from "../adventure-reducer";
import type { GameAction, GameState, MapSpaceId } from "../state";
import { playerArmyStrength } from "./army-strength";
import {
  collectMapObjectives,
  objectiveDistanceField,
  ownTownSpaceId,
  primaryMapObjective,
  type MapObjectiveKind,
} from "./map-navigation";
import type { ComputerObservation } from "./types";

export type ComputerActionScore = {
  score: number;
  policy: string;
};

/** Keep a small gold cushion so the AI does not spend to 0 and stall next turn. */
const GOLD_RESERVE = 5;

function playerGold(state: GameState, playerId: string): number {
  return state.players[playerId]?.resources.gold ?? 0;
}

function buildingScore(state: GameState, playerId: string, buildingId: string): number {
  const effect = coreBuildingDefinitions[buildingId]?.effect;
  const armySize = state.players[playerId]?.army.length ?? 0;
  const gold = playerGold(state, playerId);
  // When the army is thin, prefer recruit unlocks / reinforce over soft economy.
  const needsArmy = armySize < 4;
  // When gold is tight, deprioritise expensive soft builds so recruit can fire.
  const broke = gold < GOLD_RESERVE + 5;
  switch (effect?.type) {
    case "UNLOCK_RECRUIT_TIER":
      return (
        (effect.tier === "gold" ? 870 : effect.tier === "silver" ? 860 : 850) +
        (needsArmy ? 25 : 0)
      );
    case "UNLOCK_REINFORCE":
      return 865 + (needsArmy ? 25 : 0);
    case "RESOURCE_ROUND_CHOICE":
    case "RESOURCE_ROUND_SEARCH_DISCARD":
      return 820 + (broke ? 15 : 0);
    case "MAGE_GUILD":
      return needsArmy || broke ? 740 : 810;
    case "ROUND_START_FREE_SPRITE":
      return 805 + (needsArmy ? 10 : 0);
    case "RUNE_ALTAR":
      return 800 + effect.levelCap;
    default:
      return broke ? 760 : 790;
  }
}

function populationScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "POPULATION_ACTION" }>,
): number {
  const state = observation.state as unknown as GameState;
  const player = state.players[observation.playerId];
  const armySize = player?.army.length ?? 0;
  const gold = player?.resources.gold ?? 0;
  let score = 900 + (armySize < 4 ? 30 : armySize < 6 ? 12 : 0);
  // Prefer recruiting while gold is healthy; still recruit when thin even if
  // broke (army is the win condition).
  if (gold >= GOLD_RESERVE + 10) score += 8;
  for (const purchase of action.purchases) {
    if (purchase.kind === "reinforce") {
      score += 14;
      continue;
    }
    const unit = coreUnitDefinitions[purchase.unitDefId];
    if (unit?.tier === "gold") score += 20;
    else if (unit?.tier === "silver") score += 14;
    else score += 8;
  }
  return score;
}

// Stepping directly ONTO an objective (flag it, visit it, or fight a beatable
// guard) — kept below map develop/discover actions so the hero still builds,
// recruits and reveals adjacent tiles first, but well above END_TURN (300).
// Victory sites sit above recruit-adjacent movement so the AI commits to the win.
const OBJECTIVE_ENTER_SCORE: Record<MapObjectiveKind, number> = {
  victory: 880,
  "enemy-hero": 770,
  guard: 760,
  town: 750,
  flaggable: 740,
  visitable: 720,
  explore: 735,
};
// A step that shrinks the distance to the sticky primary objective without
// arriving yet: above END_TURN so the march continues, below entering.
const OBJECTIVE_PROGRESS_BASE = 630;
// A step that reaches no objective / makes no progress: below END_TURN (300) so
// the hero stops instead of wandering back and forth over empty fields.
const NO_PROGRESS_SCORE = 260;
// Walking onto the hero's OWN town while marching elsewhere — classic
// ping-pong. Only allowed when the sticky target IS the town or we are
// already closer via that cell for the primary objective.
const OWN_TOWN_DETOUR_SCORE = 240;

function moveScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "MOVE_HERO" }>,
): number {
  const state = observation.state as unknown as GameState;
  const field = state.adventure?.fields[action.to];
  const hero = state.heroes[action.heroId];
  if (!field || !hero) return NO_PROGRESS_SCORE;

  const objectives = collectMapObjectives(state, hero);
  const primary = primaryMapObjective(state, hero, objectives);
  // March toward ONE sticky target so mid-turn objective drop-outs do not reverse
  // the hero through home town toward a different nearby prize.
  const marchTargets = primary ? [primary] : objectives;
  const distance = objectiveDistanceField(state, hero, marchTargets);
  const here = hero.spaceId ? distance.get(hero.spaceId) ?? Infinity : Infinity;
  const to = distance.get(action.to) ?? Infinity;

  const ownTown = ownTownSpaceId(state, observation.playerId);
  const steppingOntoOwnTown = ownTown !== null && action.to === ownTown;

  // The destination IS the sticky objective (or any objective if none sticky).
  const arriving = marchTargets.find((objective) => objective.spaceId === action.to);
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

  // Progress toward the sticky objective: prefer the biggest step in.
  if (to < here) {
    // Prefer not to path through own town unless that IS the only progress.
    if (steppingOntoOwnTown && primary && primary.spaceId !== ownTown) {
      // Still progress, but only barely above END_TURN if every other step is
      // worse — usually a non-town neighbour with the same distance wins.
      return OBJECTIVE_PROGRESS_BASE - 40 + Math.max(0, 10 - to);
    }
    return OBJECTIVE_PROGRESS_BASE + Math.max(0, 10 - to);
  }

  if (steppingOntoOwnTown) {
    return OWN_TOWN_DETOUR_SCORE;
  }
  return NO_PROGRESS_SCORE;
}

/**
 * Score a tile rotation so the AI opens a doorway onto the new land instead of
 * sealing itself off with a random hash pick among equal foundation scores.
 */
function tileRotationScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "SET_TILE_ROTATION" }>,
): number {
  const state = observation.state as unknown as GameState;
  const adventure = state.adventure;
  const tile = adventure?.tiles[action.tileInstanceId];
  if (!adventure || !tile) {
    return 1_100;
  }

  let score = 1_100;
  if (isTileRotationConnected(state, tile, action.rotation)) {
    score += 30;
  }

  const pending = adventure.pendingTileChoice;
  const placingHero = pending?.heroId ? state.heroes[pending.heroId] : null;
  if (placingHero) {
    const center = { row: tile.centerRow, col: tile.centerCol };
    if (
      canHeroReachPlacedTile(
        state,
        placingHero,
        tile.tileDefId,
        center,
        action.rotation,
      )
    ) {
      // Reachable doorway for the placing hero — highest priority.
      score += 80;
    }
  } else {
    // On-foot discovery: prefer any rotation that stays connected (above).
    // Nudge rotations that put more non-blocked ring slots "open" toward the
    // map by rewarding connectedness only — materialization is rotation-fixed
    // after confirm; the connected gate is the practical "can walk in" proxy.
    score += 10;
  }

  // Stable preference among equal scores (lower rotation when all equal).
  score += (6 - action.rotation) * 0.01;
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
        score: populationScore(observation, action),
        policy: "map.recruit-army",
      };
    case "BUILD_STRUCTURE":
      return {
        score: buildingScore(
          observation.state as unknown as GameState,
          observation.playerId,
          action.buildingId,
        ),
        policy: "map.build-structure",
      };
    case "SET_TILE_ROTATION":
      return {
        score: tileRotationScore(observation, action),
        policy: "map.rotate-tile-for-path",
      };
    case "HIRE_SECONDARY_HERO": {
      // A secondary hero early drains gold that should go into the army/town.
      // Only worth it once the main force is already decent.
      const army = (observation.state as unknown as GameState).players[
        observation.playerId
      ]?.army.length ?? 0;
      return {
        score: army >= 5 ? 700 : 420,
        policy: "map.hire-secondary-hero",
      };
    }
    case "DISCOVER_TILE":
    case "PLACE_TILE":
      return { score: 785, policy: "map.explore-tile" };
    case "MOVE_HERO":
      return { score: moveScore(observation, action), policy: "map.move-to-objective" };
    case "REVISIT_FIELD":
      // Revisits are optional luxuries — never outrank marching to new land or
      // a real objective (was 690 and pulled heroes back to known sites).
      return { score: 480, policy: "map.revisit-location" };
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

/** @internal test helper — expose army weakness nudge without exporting score guts. */
export function armyNeedsReinforcement(
  state: GameState,
  playerId: string,
): boolean {
  const army = state.players[playerId]?.army.length ?? 0;
  return army < 4 || playerArmyStrength(state, playerId) < 20;
}

/** @internal — re-export for tests that want sticky target space. */
export function stickyObjectiveSpace(
  state: GameState,
  heroId: string,
): MapSpaceId | null {
  const hero = state.heroes[heroId];
  if (!hero) return null;
  return primaryMapObjective(state, hero)?.spaceId ?? null;
}
