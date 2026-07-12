import { locationDefinitions } from "@/data/map/locations";
import {
  canCrossEdge,
  classifyHeroStep,
  getAdjacentSpaceIds,
  getHeroMovementCapabilities,
  heroAtSpace,
  isFieldGuarded,
  neutralBattleLevel,
} from "../adventure";
import { canHeroDiscoverAdjacentTile } from "../adventure-reducer";
import type {
  GameState,
  HeroState,
  MapFieldState,
  MapSpaceId,
} from "../state";
import { shouldEngageEnemy } from "./army-strength";

/**
 * Map navigation for the computer opponent. The stock policy scored each
 * adjacent MOVE_HERO cell in isolation, so with every empty cell worth the same
 * the hero picked a hash-random neighbour each hop and wandered back and forth.
 * This module gives the policy a sense of DIRECTION: it finds the fields worth
 * reaching (objectives), runs an unbounded multi-source breadth-first search
 * outward from them across the passable map graph, and hands the policy a
 * distance-to-nearest-objective for any cell. Scoring a step by how much it
 * shrinks that distance turns the wander into a march — the potential strictly
 * decreases along the chosen path, so a hero never oscillates.
 *
 * Sticky primary objective: mid-turn, when one objective is visited and drops
 * out of the set, multi-source BFS can reverse the hero toward a DIFFERENT
 * objective (often via home town). `primaryMapObjective` picks ONE target for
 * the turn — highest kind priority, then closest, then stable spaceId — so the
 * march stays committed instead of thrashing through town.
 *
 * Explore objectives: face-down tiles are worth marching to (a field from which
 * DISCOVER_TILE is legal). Without them the AI never expands the map.
 *
 * Every read here is PUBLIC (map fields, difficulties, hero positions/levels),
 * so running it on the seat's redacted view is identical to running it on the
 * authoritative state — no hidden information reaches a decision.
 */

/** What kind of objective a field is, ordered by how much the AI wants it. */
export type MapObjectiveKind =
  | "enemy-hero"
  | "guard"
  | "town"
  | "flaggable"
  | "visitable"
  | "explore";

export type MapObjective = {
  spaceId: MapSpaceId;
  kind: MapObjectiveKind;
};

/** Higher = more important. Used by sticky primary selection. */
export const MAP_OBJECTIVE_PRIORITY: Record<MapObjectiveKind, number> = {
  "enemy-hero": 6,
  guard: 5,
  town: 4,
  flaggable: 3,
  visitable: 2,
  explore: 1,
};

/**
 * Whether the computer hero should be willing to walk into this guarded field's
 * fight. Grounded in the engine's own Quick Combat rule (see
 * `startNeutralEncounter`): a hero whose neutral-battle level is STRICTLY above
 * the field difficulty wins outright with no battle, so that is always safe; an
 * EQUAL level is the balanced fight the AI is willing to attempt. A hero below
 * the field difficulty stays away — with no drawn-guard strength to read, a
 * lower-level attack would be a blind gamble, exactly the case the stock policy
 * refused. Creature Banks (no difficulty, never Quick-Combat-skippable) are left
 * out until a real bank-strength read exists.
 */
export function canBeatGuardedField(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
): boolean {
  if (field.location === "creature_bank") {
    return false;
  }
  const difficulty = field.difficulty ?? 0;
  if (difficulty <= 0) {
    return false;
  }
  return neutralBattleLevel(state, hero) >= difficulty;
}

/**
 * Whether a field is worth marching toward for this hero. An enemy hero the
 * army-strength read says we can take is the prize the AI now hunts (see
 * `shouldEngageEnemy` — the AI is not afraid to trade a roughly even fight, and
 * the real dice still decide the outcome); a guarded field is an objective only
 * when the hero can beat it; otherwise an unowned town / flaggable / unvisited
 * visitable. An enemy-FLAGGED field with no hero stays off-limits (taking a town
 * garrison / defended holding is a separate strength read not modelled yet), and
 * a field an enemy hero we CANNOT beat stands on is never a stop — we do not
 * wander into a losing fight for the visitable underneath it.
 */
function objectiveKind(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
): MapObjectiveKind | null {
  const playerId = hero.controllerId;

  const occupant = heroAtSpace(state, field.spaceId, hero.id);
  if (occupant && occupant.controllerId !== playerId) {
    // Sanctuary-protected heroes can never be attacked; an outmatched fight is
    // declined. Either way the enemy-occupied field is not an objective.
    if (locationDefinitions[field.location]?.passive?.protectsFromAttack) {
      return null;
    }
    return shouldEngageEnemy(state, playerId, occupant.controllerId)
      ? "enemy-hero"
      : null;
  }

  // Never march into an enemy hero's flag / holding — no blind PvP.
  if (field.flagOwnerId && field.flagOwnerId !== playerId) {
    return null;
  }
  if (isFieldGuarded(field)) {
    return canBeatGuardedField(state, hero, field) ? "guard" : null;
  }
  const category = locationDefinitions[field.location]?.category;
  const mine =
    field.flagOwnerId === playerId ||
    Boolean(field.extraFlagOwnerIds?.includes(playerId));
  if (category === "town" && !mine) {
    return "town";
  }
  if (category === "flaggable" && !mine) {
    return "flaggable";
  }
  if (category === "visitable" && !field.blackCube) {
    return "visitable";
  }
  return null;
}

/**
 * Fields from which this hero could DISCOVER a still face-down tile (same
 * geometry/seal rules the legal-actions offer uses). Marching here then
 * flipping the tile is how the AI expands the map.
 */
function collectExploreObjectives(
  state: GameState,
  hero: HeroState,
): MapObjective[] {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId) {
    return [];
  }
  const faceDown = Object.values(adventure.tiles).filter((tile) => tile.faceDown);
  if (faceDown.length === 0) {
    return [];
  }
  const found = new Map<MapSpaceId, MapObjective>();
  for (const field of Object.values(adventure.fields)) {
    // Skip fields already claimed as a stronger objective kind.
    if (found.has(field.spaceId)) {
      continue;
    }
    // Don't park explore objectives under enemy heroes / unbeatable guards.
    const occupant = heroAtSpace(state, field.spaceId, hero.id);
    if (occupant && occupant.controllerId !== hero.controllerId) {
      continue;
    }
    if (isFieldGuarded(field) && !canBeatGuardedField(state, hero, field)) {
      continue;
    }
    const probe: HeroState = { ...hero, spaceId: field.spaceId };
    for (const tile of faceDown) {
      if (canHeroDiscoverAdjacentTile(state, probe, tile)) {
        found.set(field.spaceId, { spaceId: field.spaceId, kind: "explore" });
        break;
      }
    }
  }
  return [...found.values()];
}

/** Every objective field on the map for this hero, in stable spaceId order. */
export function collectMapObjectives(
  state: GameState,
  hero: HeroState,
): MapObjective[] {
  const fields = state.adventure?.fields ?? {};
  const objectives: MapObjective[] = [];
  const claimed = new Set<MapSpaceId>();
  for (const spaceId of Object.keys(fields).sort()) {
    const field = fields[spaceId];
    const kind = objectiveKind(state, hero, field);
    if (kind) {
      objectives.push({ spaceId, kind });
      claimed.add(spaceId);
    }
  }
  for (const explore of collectExploreObjectives(state, hero)) {
    if (!claimed.has(explore.spaceId)) {
      objectives.push(explore);
    }
  }
  return objectives;
}

/**
 * Multi-source BFS distance (in hero steps) from every cell to its NEAREST
 * objective, across the graph the hero can actually walk. An objective cell is a
 * source at distance 0. Expansion follows a real hero step `neighbour -> node`
 * (so `canCrossEdge` is asked in that direction) and never routes THROUGH a
 * field the hero cannot pass (a "stop" field is a valid endpoint but not a
 * corridor). Cells with no objective reachable are simply absent from the map.
 */
export function objectiveDistanceField(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective>,
): Map<MapSpaceId, number> {
  const distance = new Map<MapSpaceId, number>();
  const fields = state.adventure?.fields ?? {};
  const movement = getHeroMovementCapabilities(state, hero);
  const queue: MapSpaceId[] = [];
  for (const objective of objectives) {
    if (!distance.has(objective.spaceId)) {
      distance.set(objective.spaceId, 0);
      queue.push(objective.spaceId);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const node = queue[head];
    head += 1;
    const nodeDistance = distance.get(node) ?? 0;
    for (const neighbor of getAdjacentSpaceIds(node)) {
      if (distance.has(neighbor) || !fields[neighbor]) {
        continue;
      }
      // The real hero step is neighbour -> node: ask the edge in that direction
      // and confirm the hero could stand on `neighbor` at all.
      if (!canCrossEdge(state, neighbor, node, movement)) {
        continue;
      }
      const kind = classifyHeroStep(state, hero, neighbor, movement);
      if (kind === "block") {
        continue;
      }
      distance.set(neighbor, nodeDistance + 1);
      // Only "open"/passable cells may be walked THROUGH to reach something
      // further out; a "stop" cell is reachable but is a dead end as a corridor.
      if (kind !== "stop") {
        queue.push(neighbor);
      }
    }
  }

  return distance;
}

/**
 * Distance from the hero's CURRENT cell to a single objective (undefined if
 * unreachable). Built by running the BFS with that objective alone.
 */
export function distanceFromHeroTo(
  state: GameState,
  hero: HeroState,
  spaceId: MapSpaceId,
): number | undefined {
  if (!hero.spaceId) {
    return undefined;
  }
  if (hero.spaceId === spaceId) {
    return 0;
  }
  const field = objectiveDistanceField(state, hero, [
    { spaceId, kind: "visitable" },
  ]);
  return field.get(hero.spaceId);
}

/**
 * The single objective this hero should march toward right now. Highest kind
 * priority wins; among equals, the closest; among equals, stable spaceId. A
 * sticky single target stops the multi-source thrash that walked the hero
 * back through its home town whenever a nearer objective fell off the list.
 */
export function primaryMapObjective(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective> = collectMapObjectives(state, hero),
): MapObjective | null {
  if (objectives.length === 0) {
    return null;
  }
  let best: MapObjective | null = null;
  let bestPriority = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const objective of objectives) {
    const distance = distanceFromHeroTo(state, hero, objective.spaceId);
    if (distance === undefined) {
      continue;
    }
    const priority = MAP_OBJECTIVE_PRIORITY[objective.kind];
    if (
      !best ||
      priority > bestPriority ||
      (priority === bestPriority && distance < bestDistance) ||
      (priority === bestPriority &&
        distance === bestDistance &&
        objective.spaceId.localeCompare(best.spaceId) < 0)
    ) {
      best = objective;
      bestPriority = priority;
      bestDistance = distance;
    }
  }
  return best;
}

/** Own faction-town space for this hero's controller, if any. */
export function ownTownSpaceId(
  state: GameState,
  playerId: string,
): MapSpaceId | null {
  for (const field of Object.values(state.adventure?.fields ?? {})) {
    if (
      locationDefinitions[field.location]?.category === "town" &&
      field.flagOwnerId === playerId
    ) {
      return field.spaceId;
    }
  }
  return null;
}
