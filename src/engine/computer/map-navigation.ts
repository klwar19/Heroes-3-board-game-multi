import { isMarketLocation, locationDefinitions } from "@/data/map/locations";
import {
  adventureVictoryMode,
  canCrossEdge,
  classifyHeroStep,
  farTilePlacementCenters,
  getAdjacentSpaceIds,
  getHeroMovementCapabilities,
  heroAtSpace,
  isFieldGuarded,
  neutralBattleLevel,
  playerHasPlaceableFarTile,
} from "../adventure";
import { canHeroDiscoverAdjacentTile } from "../adventure-reducer";
import type {
  GameState,
  HeroState,
  MapFieldState,
  MapSpaceId,
  PlayerId,
} from "../state";
import {
  canBeatCreatureBank,
  shouldAssaultEnemyHolding,
  shouldEngageEnemy,
} from "./army-strength";
import {
  armyReadyForContestedFight,
  developmentResourceTargets,
} from "./development";

/**
 * Lightweight resource-need probe (mirrors map-policy trade deficits without a
 * circular import). Markets become march targets only when gold is tight and
 * the seat holds materials/valuables to convert, or vice versa.
 */
function needsMarketRebalance(state: GameState, playerId: PlayerId): boolean {
  const res = state.players[playerId]?.resources;
  if (!res) return false;
  const gold = res.gold ?? 0;
  const mats = res.buildingMaterials ?? 0;
  const vals = res.valuables ?? 0;
  const target = developmentResourceTargets(state, playerId);
  // Broke with convertible stock → sell for gold.
  if (
    gold < target.gold &&
    (mats > target.buildingMaterials + 1 || vals > target.valuables)
  ) return true;
  // Flush gold but no materials for building → buy materials.
  if (mats < target.buildingMaterials && gold >= 10) return true;
  // Gold for a valuables build when none held.
  if (vals < target.valuables && (gold >= 14 || mats > target.buildingMaterials)) return true;
  return false;
}

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
 * the turn by strategic value, army readiness, and travel distance, so the
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
  | "victory"
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

/** Broad objective importance retained for callers and deterministic tooling. */
export const MAP_OBJECTIVE_PRIORITY: Record<MapObjectiveKind, number> = {
  victory: 10,
  "enemy-hero": 6,
  guard: 5,
  town: 4,
  flaggable: 3,
  visitable: 2,
  explore: 1,
};

/**
 * What a visitable location is actually WORTH, as a delta on the flat
 * "visitable" strategic value (600). Previously every visitable collapsed to
 * the same number, so a Hill Fort (upgrade a unit on the cheap) ranked exactly
 * like a lone morale flag — the march planner could not tell a prize from a
 * trinket. Deltas stay within ±70 so the shared -18/step distance decay still
 * matters (a top location ~4 steps out loses to an equal-value one next door).
 * Unknown / unlisted locations keep the flat base. Effects per
 * `src/data/map/locations.ts`.
 */
export const VISITABLE_LOCATION_VALUE: Record<string, number> = {
  // Army / card advantage — the payoffs that compound.
  hill_fort: 70, // reinforce a Few unit at reduced cost (army power)
  university: 60, // pick an Ability card from the discard pile
  witch_hut: 50, // take the top Ability card (or clean a junk card)
  artifact_symbol: 50, // Search (2) the Artifact deck
  temple_of_the_sea: 55, // 10 gold + two Artifact searches
  prison: 45, // a free Secondary Hero (or 3 gold when already fielded)
  shrine_of_magic_gesture: 45, // free Search (2) Spells
  tree_of_knowledge: 45, // +2 experience (levels gate which guards we beat)
  cyclops_stockpile: 45, // roll 4 Resource dice
  elemental_conflux: 40, // recruit an Elementals card per Dwelling
  learning_stone: 40, // +1 experience, free
  spell_scroll: 40, // scroll with 2 Spell draws
  derelict_ship: 35, // Search (2) Artifacts + 2 gold
  shipwreck_survivor: 35, // Search (2) Artifacts
  redwood_observatory: 30, // reveal/place an adjacent tile (expansion tempo)
  shrine_of_magic_incantation: 30, // paid Search (2) Spells
  shipwreck: 25, // roll 2 Resource dice
  pandoras_box: 25, // gamble: dice or a Pandora card
  // Plain resource pickups — worth a stop, not a march.
  treasure_symbol: 20, // 1 Treasure die
  warriors_tomb: 20, // two Artifact searches at a morale price
  grave: 15, // 3 gold + Search (1) Artifact at a morale price
  factory_grave: 15,
  scholar: 15, // retake a card from a discard pile
  water_wheel: 15, // 3 gold
  derrick: 15, // 3 gold
  windmill: 12, // 1 valuables
  prospector: 12, // 1 valuables
  mystical_garden: 12, // 3 gold or 1 valuables
  flotsam: 12, // 2 building materials
  resource_symbol: 10, // 1 Resource die
  sea_barrel: 10,
  jetsam: 10,
  sea_chest: 10,
  magic_spring: 10,
  // Morale / movement one-shots — take them in passing, never chase them.
  fountain_of_youth: 5,
  mermaid: 5,
  temple: 0,
  buoy: 0,
  market_of_time: 0, // remove a hand card
  warlock_lab: 0,
  faerie_ring: 0,
};

/**
 * Scenario win-condition fields the hero should march for FIRST: grail dig /
 * grail delivery home, Dragon Utopia for hunt/conqueror modes. Public map
 * state only — no hidden dig sites beyond grailDiggable (which is public once
 * the obelisk/search flow marks it).
 */
function victoryObjectiveKind(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
): MapObjectiveKind | null {
  const mode = adventureVictoryMode(state);
  const playerId = hero.controllerId;

  if (mode === "grail") {
    const grail = state.adventure?.grail;
    // Carry the grail home to own town.
    if (
      grail?.status === "carried" &&
      grail.carrierHeroId === hero.id &&
      locationDefinitions[field.location]?.category === "town" &&
      field.flagOwnerId === playerId
    ) {
      return "victory";
    }
    // Dig the marked grail field (public once diggable).
    if (field.grailDiggable && grail?.status === "uncollected") {
      return "victory";
    }
    // Walk onto the grail location token if present and uncollected.
    if (field.location === "grail" && grail?.status !== "delivered") {
      return "victory";
    }
  }

  if (mode === "dragon-hunt" || mode === "dragon-conqueror") {
    if (field.location === "dragon_utopia") {
      // Hunt: any utopia (defeat wins). Conqueror: unowned or own (hold wins);
      // enemy-held utopia is a siege target worth marching for when beatable.
      if (mode === "dragon-hunt") {
        return "victory";
      }
      if (!field.flagOwnerId || field.flagOwnerId === playerId) {
        return "victory";
      }
      // Enemy-held utopia — still the win object, treat as victory target.
      return "victory";
    }
  }

  // Conquest: capturing an enemy faction town IS the win condition — elevate
  // unowned / enemy towns above ordinary "town" so the sticky primary commits.
  if (mode === "conquest") {
    const category = locationDefinitions[field.location]?.category;
    if (
      category === "town" &&
      field.flagOwnerId &&
      field.flagOwnerId !== playerId
    ) {
      return "victory";
    }
  }

  return null;
}

/**
 * Whether the computer hero should be willing to walk into this guarded field's
 * fight. Grounded in the engine's own Quick Combat rule (see
 * `startNeutralEncounter`): a hero whose neutral-battle level is STRICTLY above
 * the field difficulty wins outright with no battle, so that is always safe; an
 * EQUAL level is the balanced fight the AI is willing to attempt. A hero below
 * the field difficulty stays away — with no drawn-guard strength to read, a
 * lower-level attack would be a blind gamble, exactly the case the stock policy
 * refused. Creature Banks use `canBeatCreatureBank` (public bank card stats +
 * expected stacks) instead of field difficulty — they never Quick-Combat-skip.
 */
export function canBeatGuardedField(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
): boolean {
  if (field.location === "creature_bank") {
    return canBeatCreatureBank(state, hero.controllerId, field);
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
 * the real dice still decide the outcome); a guarded field / known bank is an
 * objective only when the hero can beat it; otherwise an unowned town /
 * flaggable / unvisited visitable. Enemy-flagged bare mines re-flag free (take
 * them). Enemy towns/settlements open a garrison fight — engage when the army
 * read says we can take the owner's unit deck. A field an enemy hero we CANNOT
 * beat stands on is never a stop.
 */
function objectiveKind(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
): MapObjectiveKind | null {
  const playerId = hero.controllerId;

  // Win-condition targets outrank everything else.
  const victory = victoryObjectiveKind(state, hero, field);
  if (victory) {
    // Still refuse to walk into an outmatched enemy hero standing on it.
    const occupant = heroAtSpace(state, field.spaceId, hero.id);
    if (occupant && occupant.controllerId !== playerId) {
      if (locationDefinitions[field.location]?.passive?.protectsFromAttack) {
        return null;
      }
      return shouldEngageEnemy(state, playerId, occupant.controllerId)
        ? "victory"
        : null;
    }
    // Guarded victory site (Dragon Utopia, etc.): only march if beatable, or
    // if it is unguarded / already our flag.
    if (isFieldGuarded(field) && !canBeatGuardedField(state, hero, field)) {
      // Dragon Utopia has no standard difficulty — still list it so the AI
      // walks there when the field is open / we can engage; when a hard guard
      // blocks and we cannot read strength, skip until stronger.
      if (field.location !== "dragon_utopia") {
        return null;
      }
    }
    return victory;
  }

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

  const category = locationDefinitions[field.location]?.category;
  const ownedByUs =
    field.flagOwnerId === playerId ||
    Boolean(field.extraFlagOwnerIds?.includes(playerId));

  // Enemy-flagged holdings (no enemy hero on the hex):
  //  - bare mines / flaggables re-flag for free → always worth taking
  //  - towns / settlements may open a garrison fight → army-strength gate
  if (field.flagOwnerId && field.flagOwnerId !== playerId) {
    if (category === "flaggable") {
      return "flaggable";
    }
    if (
      (category === "town" || field.location === "settlement") &&
      shouldAssaultEnemyHolding(state, playerId, field)
    ) {
      return category === "town" ? "town" : "flaggable";
    }
    return null;
  }

  if (isFieldGuarded(field)) {
    return canBeatGuardedField(state, hero, field) ? "guard" : null;
  }
  if (category === "town" && !ownedByUs) {
    return "town";
  }
  if (category === "flaggable" && !ownedByUs) {
    return "flaggable";
  }
  if (category === "visitable" && !field.blackCube) {
    return "visitable";
  }
  // Markets (revisitable) are only worth a detour when resources need a trade.
  // Opening an idle market is free while parked; marching across the map for
  // one is only justified by a real rebalance need.
  if (
    isMarketLocation(field.location) &&
    needsMarketRebalance(state, playerId)
  ) {
    return "visitable";
  }
  return null;
}

/**
 * Fields from which this hero could DISCOVER a still face-down tile OR place a
 * Far (Ⅱ–Ⅲ) supply tile (same geometry/seal rules legal-actions uses).
 * Marching here then flipping/placing is how the AI expands the map.
 *
 * Yellow (sealed) outer borders NEVER open a tile — `canHeroDiscoverAdjacentTile`
 * and `farTilePlacementCenters` both refuse a hero standing on a sealed edge.
 * Explore objectives therefore only include real open doorways; a face-down
 * tile sitting behind a yellow wall is not a march target from the sealed side.
 *
 * Without PLACE-capable doorways the AI only walked toward already-laid
 * face-down Near/center tiles (IV–VII). When those sit behind a sealed yellow
 * border — or the hero cannot spend the last MP to flip them — it parked and
 * stared. Ⅱ–Ⅲ supply placements open a new notch and unstick that dead-end.
 */
function collectExploreObjectives(
  state: GameState,
  hero: HeroState,
): MapObjective[] {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId) {
    return [];
  }
  const faceDown = Object.values(adventure.tiles ?? {}).filter((tile) => tile.faceDown);
  const canPlaceFar = playerHasPlaceableFarTile(state, hero.controllerId);
  if (faceDown.length === 0 && !canPlaceFar) {
    return [];
  }
  const found = new Map<MapSpaceId, MapObjective>();
  for (const field of Object.values(adventure.fields)) {
    // Don't park explore objectives under enemy heroes / unbeatable guards.
    const occupant = heroAtSpace(state, field.spaceId, hero.id);
    if (occupant && occupant.controllerId !== hero.controllerId) {
      continue;
    }
    if (isFieldGuarded(field) && !canBeatGuardedField(state, hero, field)) {
      continue;
    }
    // Probe as if the hero already stands here — the discover/place gates read
    // the hero field's sealed yellow arc. A sealed ring slot is never useful.
    const probe: HeroState = { ...hero, spaceId: field.spaceId };
    let useful = false;
    for (const tile of faceDown) {
      // Engine gate: geometric adjacency + NOT heroFieldSealedForDiscovery
      // (yellow outer border blocks ordinary discovery; Creature Bank exception).
      if (canHeroDiscoverAdjacentTile(state, probe, tile)) {
        useful = true;
        break;
      }
    }
    // A field where the hero could DROP a Ⅱ–Ⅲ tile is an expand objective even
    // when every laid face-down tile is sealed off from here. Placement also
    // refuses sealed hero edges (canHeroReachPlacementCenter).
    if (!useful && canPlaceFar && farTilePlacementCenters(state, probe).length > 0) {
      useful = true;
    }
    if (useful) {
      found.set(field.spaceId, { spaceId: field.spaceId, kind: "explore" });
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
 * The single objective this hero should march toward right now. Strategic
 * value accounts for army readiness, scenario stakes, and travel distance; a
 * stable spaceId breaks exact ties. A sticky single target stops the
 * multi-source thrash that walked the hero back through its home town whenever
 * a nearer objective fell off the list.
 *
 * When `stickySpaceId` is still among the current objectives, keep marching
 * there across turns unless another reachable objective is materially better.
 * The margin avoids chase-thrash while still allowing the AI to abandon a weak
 * or premature commitment for a nearby win, safe reward, or newly ready fight.
 */
/**
 * Sweep the current tile first: a collectible payoff (guard / flag / visit) on
 * the tile the hero is STANDING ON outranks a marginally better prize tiles
 * away, and beats the sticky-march +90 hysteresis — so the AI drains the local
 * pickups before marching off and leaving them behind. A beatable enemy hero
 * on the tile counts too (it is about to take those same local payoffs, and
 * unlike a static guard it will not wait). Victory sites, towns and explore
 * doorways stay globally ranked (a win condition is never postponed for a
 * windmill).
 */
const SAME_TILE_SWEEP_BONUS = 130;
const SWEEPABLE_KINDS: ReadonlySet<MapObjectiveKind> = new Set([
  "guard",
  "flaggable",
  "visitable",
  "enemy-hero",
]);

/**
 * OPENING HOME-TILE SWEEP (a strong human's tempo). While the hero still stands
 * on its OWN starting tile (tile Ⅰ) in the first rounds, every remaining local
 * payoff — the free resource symbol, the guarded (difficulty 1) treasure, and
 * the guarded (difficulty 1) income MINE — should be drained before the hero
 * marches off the tile. Measurement of the stock policy showed the fresh hero
 * grabbing only the unguarded symbol and abandoning the mine + treasure: the
 * army-readiness gate (`armyReadyForContestedFight`) dropped a level-coverable
 * home guard to 410, which any nearby off-tile prize outranked.
 *
 * Two levers fix that, both scoped to the home tile + the opening rounds so the
 * general "collect a safe hex before FAIR fights" discipline is untouched
 * elsewhere:
 *  1. the not-ready guard penalty is LIFTED for a level-coverable difficulty-1/2
 *     guard on the home tile (a deliberate opening play, not a fair fight to
 *     postpone — the Quick-Combat reference already proved it takeable), and
 *  2. a decisive sweep bonus keeps every home payoff above anything off the tile
 *     until the tile is drained.
 * Both switch off once the hero leaves the tile or the opening window closes.
 */
const HOME_TILE_SWEEP_MAX_ROUND = 3;
const HOME_TILE_SWEEP_MAX_DIFFICULTY = 2;
const HOME_TILE_SWEEP_BONUS = 220;

/** The tile instance carrying this player's own faction town, if any. */
export function homeTileInstanceId(
  state: GameState,
  playerId: string,
): string | null {
  for (const field of Object.values(state.adventure?.fields ?? {})) {
    if (
      locationDefinitions[field.location]?.category === "town" &&
      field.flagOwnerId === playerId
    ) {
      return field.tileInstanceId ?? null;
    }
  }
  return null;
}

/**
 * Whether this objective qualifies for the opening home-tile sweep: a sweepable
 * payoff on the hero's OWN starting tile, while the hero still stands on that
 * tile, in the first rounds. Pure public-state reads (town flag, tile ids,
 * round) — never touches the guaranteed-win house rule.
 */
function isHomeTileSweepObjective(
  state: GameState,
  hero: HeroState,
  objective: MapObjective,
  field: MapFieldState | undefined,
): boolean {
  if ((state.round ?? 0) > HOME_TILE_SWEEP_MAX_ROUND) return false;
  if (!SWEEPABLE_KINDS.has(objective.kind)) return false;
  const homeTile = homeTileInstanceId(state, hero.controllerId);
  if (!homeTile) return false;
  const heroTile = hero.spaceId
    ? state.adventure?.fields[hero.spaceId]?.tileInstanceId
    : undefined;
  return heroTile === homeTile && field?.tileInstanceId === homeTile;
}

function objectiveStrategicValue(
  state: GameState,
  hero: HeroState,
  objective: MapObjective,
  distance: number,
  /** Whether ANY fight (guard / enemy hero) is on the current objective list. */
  fightAvailable = true,
): number {
  const ready = armyReadyForContestedFight(state, hero.controllerId);
  const mode = adventureVictoryMode(state);
  const field = state.adventure?.fields[objective.spaceId];
  const homeSweep = isHomeTileSweepObjective(state, hero, objective, field);
  let value: number;
  switch (objective.kind) {
    case "victory": {
      const carryingGrailHome = Boolean(
        mode === "grail" &&
          state.adventure?.grail?.status === "carried" &&
          state.adventure.grail.carrierHeroId === hero.id &&
          field?.flagOwnerId === hero.controllerId,
      );
      if (carryingGrailHome) value = 1_250;
      else if (mode === "conquest") value = ready ? 790 : 360;
      else if (mode === "dragon-hunt" || mode === "dragon-conqueror") {
        value = ready ? 900 : 390;
      } else value = 950;
      break;
    }
    case "enemy-hero":
      value = ready ? 760 : 390;
      break;
    case "guard": {
      const difficulty = field?.difficulty ?? 0;
      const guaranteedQuickWin =
        difficulty > 0 && neutralBattleLevel(state, hero) > difficulty;
      // Home-tile opening sweep lifts the not-ready penalty for a level-
      // coverable difficulty-1/2 guard (the income mine / the guarded treasure
      // are opening plays, not fair fights to postpone for army development).
      const homeGuardTakeable =
        homeSweep &&
        difficulty > 0 &&
        difficulty <= HOME_TILE_SWEEP_MAX_DIFFICULTY;
      value = guaranteedQuickWin ? 800 : ready || homeGuardTakeable ? 710 : 410;
      break;
    }
    case "town":
      value = 660;
      break;
    case "flaggable":
      // A Settlement is a top early economy objective (per-round income +
      // reinforce it flags for free) — value it distinctly above a generic
      // flaggable (bare mine / sawmill) so a discovered one becomes the march
      // target over a leftover mine. Stays just under a full town (660).
      value = field?.location === "settlement" ? 658 : 625;
      break;
    case "visitable":
      value = 600 + (VISITABLE_LOCATION_VALUE[field?.location ?? ""] ?? 0);
      break;
    case "explore":
    default:
      // Expansion tempo: a doorway NEXT DOOR usually out-values a multi-turn
      // march to a distant leftover payoff — the shared -18/step decay makes
      // the comparison (a visitable ~5+ steps out loses to an adjacent
      // doorway; anything closer still wins). Unspent Ⅱ–Ⅲ supply pushes
      // harder: placing it opens a fresh notch of new land ("open/place Ⅱ–Ⅲ
      // once the home tile is milked"). And when NO fight is on the board at
      // all (nothing beatable — e.g. right after a lost battle), opening new
      // land is the productive move: the boost lets a doorway outrank even a
      // moderately-distant leftover so the hero keeps expanding, not parking.
      value = playerHasPlaceableFarTile(state, hero.controllerId) ? 530 : 500;
      if (!fightAvailable) value += 60;
      break;
  }
  if (SWEEPABLE_KINDS.has(objective.kind)) {
    const heroTile = hero.spaceId
      ? state.adventure?.fields[hero.spaceId]?.tileInstanceId
      : undefined;
    if (heroTile && field?.tileInstanceId === heroTile) {
      // Own starting tile in the opening rounds: a decisive bonus keeps every
      // local payoff above anything off the tile until it is drained. Any other
      // tile keeps the ordinary same-tile sweep nudge.
      value += homeSweep ? HOME_TILE_SWEEP_BONUS : SAME_TILE_SWEEP_BONUS;
    }
  }
  return value - distance * 18;
}

export function primaryMapObjective(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective> = collectMapObjectives(state, hero),
  stickySpaceId?: MapSpaceId | null,
): MapObjective | null {
  if (objectives.length === 0) {
    return null;
  }
  // "Can we fight anything at all?" — when no beatable guard / enemy hero is
  // listed, explore objectives get a boost so the hero opens new land instead
  // of idling (see objectiveStrategicValue).
  const fightAvailable = objectives.some(
    (objective) => objective.kind === "guard" || objective.kind === "enemy-hero",
  );

  if (stickySpaceId) {
    const sticky = objectives.find((objective) => objective.spaceId === stickySpaceId);
    if (sticky) {
      // Change plans only for a materially better reachable objective; small
      // value fluctuations keep the existing march stable across turns.
      const stickyDistance = distanceFromHeroTo(state, hero, sticky.spaceId);
      const stickyValue = stickyDistance === undefined
        ? Number.NEGATIVE_INFINITY
        : objectiveStrategicValue(state, hero, sticky, stickyDistance, fightAvailable);
      const higher = objectives.find((objective) => {
        const distance = distanceFromHeroTo(state, hero, objective.spaceId);
        return (
          distance !== undefined &&
          objectiveStrategicValue(state, hero, objective, distance, fightAvailable) >
            stickyValue + 90
        );
      });
      // Unreachable sticky (e.g. explore doorway sealed behind a yellow border
      // the hero cannot cross without Pathfinding, or a fight we can no longer
      // reach) must drop — otherwise the AI parks forever on an END_TURN with a
      // dead commit. Reachability uses the same walk graph as the march BFS.
      const stickyReachable =
        distanceFromHeroTo(state, hero, sticky.spaceId) !== undefined;
      if (!higher && stickyReachable) {
        return sticky;
      }
    }
  }

  let best: MapObjective | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const objective of objectives) {
    const distance = distanceFromHeroTo(state, hero, objective.spaceId);
    if (distance === undefined) {
      continue;
    }
    const value = objectiveStrategicValue(state, hero, objective, distance, fightAvailable);
    if (
      !best ||
      value > bestValue ||
      (value === bestValue && distance < bestDistance) ||
      (value === bestValue &&
        distance === bestDistance &&
        objective.spaceId.localeCompare(best.spaceId) < 0)
    ) {
      best = objective;
      bestValue = value;
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
