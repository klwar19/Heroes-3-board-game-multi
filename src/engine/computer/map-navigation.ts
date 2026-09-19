import { cardLibrary } from "@/data/cards/library";
import { pvpReach } from "./pvp-reach";
import { hasNecromancyPlan, necropolisFarArmyReady } from "./necromancy-plan";
import { openingBronzeCoreReady, committedGoldInvestment, goldStepMarketPlan, goldBodyComboTradePlan, premiumRecruitTradePlan } from "./development";
import { secondFarFightNeedsSilver, securedFarTileIds } from "./far-sweep";
import { isMarketLocation, locationDefinitions } from "@/data/map/locations";
import {
  CREATURE_BANKS,
  type CreatureBankId,
} from "@/data/map/creature-banks";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  adventureVictoryMode,
  canCrossEdge,
  canDigGrail,
  classifyHeroStep,
  farTilePlacementCenters,
  fieldFlaggedByAlly,
  fieldCreatureBankId,
  gateFieldsLinked,
  getAdjacentSpaceIds,
  getHeroMovementCapabilities,
  getMainHero,
  heroAtSpace,
  heroMovementMax,
  isFieldGuarded,
  isBankStyleGuardLocation,
  isTeleportObjectGuardLocation,
  listKnownTeleportDestinations,
  materializeTileFields,
  neutralBattleLevel,
  neutralArmyDifficultyForField,
  playerHoldsTentFlag,
  pvpAttacksBanned,
  obeliskPresetRole,
} from "../adventure";
import { houseRuleEnabled } from "../house-rules";
import { DEFAULT_OBELISK_BONUS, type CustomMapObeliskBonus } from "../state";
import { allTileDefinitions } from "@/data/map/tiles";
import { hexDistance, hexSpaceId, parseHexSpaceId, tileFootprint } from "../hex";
import { ANIME_EQUIPMENT_SLOTS } from "@/data/anime/equipment";
import { equipmentEnabled, heroEquipmentSlot } from "../anime-equipment";
import { canHeroImmediatelyAccessAdjacentTile } from "../adventure-reducer";
import { isComputerPlayer, playersAreAllied } from "./control";
import { repeatsFailedFight } from "./memory";
import { isOpeningFarMaterialMine, isOpeningFarSweepField } from "./far-sweep";
import { MARKET_MIN_ROUND, wantsMarketVisit } from "./market-trades";
import { premiumCombatMovementReserve } from "./combat-movement";
import { polishQuickCombatEnabled, polishQuickCombatOutcome } from "../polish-quick-combat";
import type {
  GameState,
  HeroState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  PlayerId,
} from "../state";
import {
  armyCoversPremiumEconomyGuard,
  currentArmyCoversGuardField,
  armyTierCoversGuardField,
  canBeatCreatureBank,
  isPremiumEconomyField,
  playerArmyStrength,
  premiumEconomyWorthStaging,
  shouldAssaultEnemyHolding,
  shouldEngageEnemy,
  enemyMainHeroLevelDeficit,
} from "./army-strength";
import {
  armyDevelopmentProfile,
  armyReadyForContestedFight,
  assessDwellingRush,
  developmentResourceTargets,
  nextGoldLadderStep,
  hasGoldArmy,
  hasReachedGoldArmy,
  hasOpenedFarEconomy,
  resourceUrgency,
  shouldLaunchBronzeRush,
  valuablesStarved,
} from "./development";
import { objectiveHorizonAdjustment } from "./planning-horizon";

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

/**
 * Per-scoring-pass memo for the expensive map reads below (objective
 * collection, distance fields, guard-beat checks, the primary objective).
 * `chooseComputerAction` scores every legal action against ONE immutable
 * state, and each scorer re-derived these from scratch — measured at several
 * seconds per decision on a live table (the AI "taking longer every turn").
 * The cache is active only inside `withMapScoringCache` and only for that
 * exact state object; any other state (a reducer clone, a probe) computes
 * uncached, so nothing can observe a stale value.
 */
type MapScoringCache = { state: GameState; entries: Map<string, unknown> };
let mapScoringCache: MapScoringCache | null = null;

export function withMapScoringCache<T>(state: GameState, run: () => T): T {
  if (mapScoringCache && mapScoringCache.state === state) return run();
  const previous = mapScoringCache;
  mapScoringCache = { state, entries: new Map() };
  try {
    return run();
  } finally {
    mapScoringCache = previous;
  }
}

function mapScoringCached<T>(state: GameState, key: string, compute: () => T): T {
  const cache = mapScoringCache;
  if (!cache || cache.state !== state) return compute();
  if (cache.entries.has(key)) return cache.entries.get(key) as T;
  const value = compute();
  cache.entries.set(key, value);
  return value;
}

/** Probe heroes (`{ ...hero, spaceId }`) differ by field, so key on the whole small record. */
function heroCacheKey(hero: HeroState): string {
  return JSON.stringify(hero);
}

function objectivesCacheKey(objectives: ReadonlyArray<MapObjective>): string {
  return JSON.stringify(objectives);
}

export type MapObjective = {
  spaceId: MapSpaceId;
  kind: MapObjectiveKind;
  /**
   * Explore doorway that can reveal or place a Far (Ⅱ–Ⅲ) tile. While the
   * seat has no Far economy yet, these doorways are the settlement lottery the
   * scenario guarantees (farTiles.guaranteeSettlement) — the march values them
   * well above generic exploration so the premium rush can find its target.
   */
  opensFarTile?: boolean;
  /** Public tile band includes guards that can still award this hero XP. */
  opensGrowthTile?: boolean;
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
  mystical_garden: 12, // printed 2 gold / 1 valuables; BINH can raise gold to 3
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
  // Designer / mod single-hex objects (conditional boosts may stack on top).
  "anime.ren_binh_cac": 55, // equipment shop — boosted further when surplus + empty slot
  "anime.adventurer_outfitter": 55,
  "wog.emerald_tower": 50, // commander points / XP pay menu
  "wog.mirror_home_way": 40, // pay-2-gold Town teleport
  "wog.junk_merchant": 35, // sell artifacts + paid Artifact Search
  "wog.living_skull": 40, // Listen = Ability Search
  "wog.adventure_cave": 45, // escalating fight ladder
  "wog.altar_of_gods": 45, // pay valuables for morale/XP/commander points
  "wog.fishing_well": 15, // cheap Attack-die gamble
  keymaster_tent: 50, // color key that opens barriers
  garrison: 40, // flaggable outpost
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

  // A designer can mark one SPECIFIC monster/object/town as "first clear ends
  // the scenario". This stamp is the most literal objective on the board and
  // must outrank generic economy even when VP scoring decides the final winner.
  if (field.designerWinCondition) {
    return "victory";
  }

  const vpEnabled = Boolean(state.adventure?.mapPreset?.victoryPoints?.enabled);
  const vpObjectives = state.adventure?.mapPreset?.victoryPoints?.enabled
    ? state.adventure.mapPreset.victoryPoints.objectives ?? []
    : [];
  if (
    // A designer VP bonus only scores while VP mode is enabled; without it the
    // field is just its underlying economy, not a top-priority "victory" march.
    (vpEnabled && (field.centerHexVp ?? 0) + (field.designerRewardVp ?? 0) > 0) ||
    (vpObjectives.some((objective) => objective.kind === "defeat-dragon-utopia") &&
      field.location === "dragon_utopia") ||
    (vpObjectives.some((objective) => objective.kind === "control-towns") &&
      locationDefinitions[field.location]?.category === "town" &&
      field.flagOwnerId !== playerId &&
      !fieldFlaggedByAlly(state, playerId, field)) ||
    (vpObjectives.some((objective) => objective.kind === "flag-mines") &&
      (field.location === "mine" || field.location === "settlement") &&
      field.flagOwnerId !== playerId &&
      !fieldFlaggedByAlly(state, playerId, field))
  ) {
    return "victory";
  }

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

    // Holy Grail: the dig is LOCKED until the digger has visited
    // GRAIL_OBELISKS_REQUIRED (2) distinct Obelisks. While it is still uncollected:
    //  - dig-ready  -> march to the Grail (fight its guard, then dig for 1 MP);
    //  - not ready  -> seek distinct unvisited Obelisks (they ARE the win path).
    // A locked Grail is deliberately NOT a march target — marching to an armed
    // but un-diggable Grail would camp the hero on it with no legal dig action.
    const grailUncollected = grail?.status !== "carried" && grail?.status !== "delivered";
    if (grailUncollected) {
      if (canDigGrail(state, playerId)) {
        // Dig the marked grail field (public once diggable).
        if (field.grailDiggable && grail?.status === "uncollected") {
          return "victory";
        }
        // Walk onto the grail location token to fight its guard, then dig.
        if (field.location === "grail" && grail?.status !== "delivered") {
          return "victory";
        }
      } else if (field.location === "obelisk") {
        // Seek a distinct Obelisk this hero has not visited (flagged) yet.
        const visited = grail?.obelisksVisited?.[playerId] ?? [];
        const alreadyVisited =
          visited.includes(field.spaceId) ||
          field.flagOwnerId === playerId ||
          Boolean(field.extraFlagOwnerIds?.includes(playerId));
        if (!alreadyVisited) {
          return "victory";
        }
      }
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
      // An ALLY's captured Utopia is walked over like your own — a siege there
      // is inert by the ally flag gate, never a march target.
      if (fieldFlaggedByAlly(state, playerId, field)) {
        return null;
      }
      // Enemy-held utopia — still the win object, treat as victory target.
      return "victory";
    }
  }

  // Military modes: an enemy faction Town is the route to its elimination
  // clock, so elevate it above ordinary economy and keep the primary sticky.
  if (mode === "conquest" || mode === "conquer") {
    const category = locationDefinitions[field.location]?.category;
    if (
      category === "town" &&
      field.flagOwnerId &&
      field.flagOwnerId !== playerId &&
      // An ALLY's town is never a conquest target: capturing it is refused by
      // the ally flag gate, so listing it committed allied AI seats to a march
      // that could never resolve (measured in co-op: each AI ranked its
      // ally's town as top-priority "victory" and parked beside it).
      !playersAreAllied(state, field.flagOwnerId, playerId)
    ) {
      return "victory";
    }
  }

  return null;
}

/**
 * How much extra a premium mine is worth given the seat's treasury needs.
 * Lacking valuables (Gold dwelling bottleneck) steers the march to valuables
 * mines first; surplus valuables deprioritizes more of them so gold mines and
 * settlements win; gold shortfall without a valuables hole prefers gold mines.
 * Settlement is always a solid economy prize (flat income + reinforce).
 */
export function premiumEconomyResourceBonus(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
): number {
  if (field.location === "settlement") return 28;
  if (field.location !== "mine") return 0;
  const res = state.players[playerId]?.resources;
  const target = developmentResourceTargets(state, playerId);
  const gold = res?.gold ?? 0;
  const vals = res?.valuables ?? 0;
  const needVals = (target.valuables ?? 0) - vals;
  const needGold = Math.max(0, (target.gold ?? 0) - gold);
  if (field.resource === "valuables") {
    // Deficit-scaled so a NEEDED valuables mine decisively outranks a nearer gold
    // mine (gold-mine bonus below is only 18 while valuables are short). needVals
    // up to 4 for the gold dwelling => up to 55+60=115, which survives ~5 hexes of
    // the 18/step distance decay and wins the march.
    if (needVals > 0) return 55 + Math.min(60, needVals * 20); // hunt valuables first when the dwelling needs them
    if (vals >= (target.valuables ?? 0) + 2) return 8; // surplus — still income, low priority
    return 30;
  }
  if (field.resource === "gold") {
    if (needVals > 0) return 18; // valuables hole outranks more gold income
    if (needGold > 0) return 48;
    return 32;
  }
  return 0;
}

/** Whether the seat already OWNS a recurring valuables source — a flagged
 * valuables mine, or a far settlement it flagged and set to pay valuables. Used
 * to decide whether the hero should keep hunting the map for one. */
function securedValuablesSource(state: GameState, playerId: PlayerId): boolean {
  return Object.values(state.adventure?.fields ?? {}).some(field =>
    field.flagOwnerId === playerId &&
    ((field.location === "mine" && field.resource === "valuables") ||
      (field.location === "settlement" && field.settlementResource === "valuables")));
}

/** Whether the seat still needs to FIND a valuables source: it has no gold body,
 * is short of the gold-dwelling valuables target, and does not already own a
 * valuables mine/settlement. Drives the "keep opening far tiles" push so a
 * valuables mine on a still-face-down far tile gets revealed before R9. */
export function needsFarValuablesReveal(state: GameState, playerId: PlayerId): boolean {
  if (hasGoldArmy(state, playerId)) return false;
  const targets = developmentResourceTargets(state, playerId);
  const held = state.players[playerId]?.resources.valuables ?? 0;
  return held < (targets.valuables ?? 0) && !securedValuablesSource(state, playerId);
}

/**
 * Whether taking / winning `field` can put `resource` in the seat's hands: an
 * unowned settlement (any resource), a matching unowned mine, a creature bank
 * whose floor reward pays it, or a one-shot pickup interaction that can.
 */
export function fieldSuppliesResource(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
  resource: "gold" | "buildingMaterials" | "valuables",
): boolean {
  if (field.location === "settlement") return field.flagOwnerId !== playerId;
  if (field.location === "mine") return field.resource === resource && field.flagOwnerId !== playerId;
  const bankId = fieldCreatureBankId(field);
  if (bankId) {
    if (field.flagOwnerId) return false;
    return interactionCanYield(CREATURE_BANKS[bankId]?.buildReward(0), resource);
  }
  return interactionCanYield(locationDefinitions[field.location]?.interaction, resource);
}

/** Whether a location interaction can yield `resource`, recursing through the
 * SEQUENCE / CHOOSE_ONE / ATTACK_DIE_TABLE wrappers the engine uses. Treasure
 * dice pay valuables; a resource die pays a random one of the three (counted for
 * any). Lets the funding planner see one-shot pickups (treasure symbols, resource
 * rolls, gold chests) that a top-level GAIN_RESOURCES-only check missed. */
function interactionCanYield(interaction: unknown, resource: string, depth = 0): boolean {
  if (!interaction || typeof interaction !== "object" || depth > 6) return false;
  const it = interaction as { type?: string; interactions?: unknown[]; options?: { interaction?: unknown }[];
    plus?: unknown; zero?: unknown; minus?: unknown; [key: string]: unknown };
  switch (it.type) {
    case "GAIN_RESOURCES":
      return ((it[resource] as number) ?? 0) > 0;
    case "ROLL_TREASURE_DICE":
      return resource === "valuables";
    case "ROLL_RESOURCE_DICE":
      return true; // random gold / materials / valuables — can supply any
    case "SEQUENCE":
      return (it.interactions ?? []).some(step => interactionCanYield(step, resource, depth + 1));
    case "CHOOSE_ONE":
      return (it.options ?? []).some(option => interactionCanYield(option?.interaction, resource, depth + 1));
    case "ATTACK_DIE_TABLE":
      return [it.plus, it.zero, it.minus].some(branch => interactionCanYield(branch, resource, depth + 1));
    default:
      return false;
  }
}

/** A visible funding opportunity, not guaranteed income from an unrolled die.
 * Bound travel to two turns and use the normal guard/path checks. */
export function hasAttainableGoldFunding(state: GameState, playerId: string): boolean {
  const step = nextGoldLadderStep(state, playerId);
  const player = state.players[playerId];
  if (!step || step.kind !== "recruit" || !player) return false;
  return Object.values(state.heroes).some(hero => hero.controllerId === playerId && hero.spaceId &&
    collectMapObjectives(state, hero).some(objective => {
      const field = state.adventure?.fields[objective.spaceId];
      if (!field || objective.kind === "explore" ||
          ((isFieldGuarded(field) || field.location === "creature_bank") && !canBeatGuardedField(state, hero, field))) return false;
      const distance = distanceFromHeroTo(state, hero, objective.spaceId, true);
      if (distance === undefined || distance + premiumCombatMovementReserve(state, hero, field) >
          hero.movementPoints + heroMovementMax(state, hero)) return false;
      return (["gold", "buildingMaterials", "valuables"] as const).some(resource =>
        player.resources[resource] < (step.cost[resource] ?? 0) &&
        (field.location === "settlement" ? field.flagOwnerId !== playerId :
          field.location === "mine" ? field.resource === resource && field.flagOwnerId !== playerId :
            interactionCanYield(locationDefinitions[field.location]?.interaction, resource)));
    }));
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
 *
 * Step 5 EXTENSION (army-tier reference): the level gate below is OR-ed with the
 * army-COMPOSITION reference (`armyTierCoversGuardField`) — a silver-bearing army
 * takes difficulty-3 guards, a gold-bearing one difficulty-5, at Impossible (and
 * proportionally more at easier scenario difficulties, where the same field draws
 * a weaker party). Premium economy uses a difficulty-aware Pack-core rush
 * (`armyCoversPremiumEconomyGuard`) so hard/normal/easy lv3 settlements and
 * gold/valuables mines are hit with three bronze Packs alone. The opening safety
 * gates below may deliberately defer an equal-risk neutral while the core is
 * rebuilding or being preserved for the conquest timing window.
 */
/** Field difficulty from which must-attack human guard control needs three bodies. */
export const HUMAN_MUST_ATTACK_DEPTH_DIFFICULTY = 4;

export function canBeatGuardedField(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
): boolean {
  // Cache only the state's own field record; a caller-built field computes fresh.
  if (state.adventure?.fields[field.spaceId] !== field) {
    return canBeatGuardedFieldUncached(state, hero, field);
  }
  return mapScoringCached(state, `beat|${field.spaceId}|${heroCacheKey(hero)}`, () =>
    canBeatGuardedFieldUncached(state, hero, field));
}

function canBeatGuardedFieldUncached(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
): boolean {
  // Once the composition-aware conquest fallback is live, the main army must convert
  // that timing window into pressure on the opponent, not bleed units into a
  // side neutral on the way — EXCEPT premium Far economy (settlement / gold /
  // valuables mine). Those ARE the economy the rush is for, and with three
  // bronze Packs the AI must attempt FAR III by round 4 with its combat reserve,
  // accepting losses. Enemy-held/victory fields are deliberately not
  // covered by this neutral-only gate.
  const rushProfile = armyDevelopmentProfile(state, hero.controllerId);
  const fieldDifficulty = field.location === "random_town" ? 7 : field.difficulty ?? 0;
  const premiumEconomy = isPremiumEconomyField(field) ||
    (hero.kind === "main" && isOpeningFarMaterialMine(state, hero.controllerId, field));
  // With optional PvP Neutral Control, the next live HUMAN seat can coordinate
  // guard focus instead of following the stock neutral script. When free guard
  // control is enabled (must-attack OFF), require formation depth for a real
  // battle: at least three bodies can screen a valuable shooter and survive
  // coordinated focus. This uses only public lobby/controller data; it never
  // peeks at the human's hand or intended move. Forced-attack control remains
  // on the printed curve because its legal menu is deliberately constrained.
  const turnOrder = state.turnOrder ?? [];
  const fighterIndex = turnOrder.indexOf(hero.controllerId);
  const nextNeutralController =
    fighterIndex >= 0 && turnOrder.length >= 2
      ? turnOrder[(fighterIndex + 1) % turnOrder.length]
      : undefined;
  const humanNeutralControl = Boolean(
    state.gameMode !== "coop" &&
      state.adventure?.pvpNeutralControl &&
      nextNeutralController &&
      nextNeutralController !== hero.controllerId &&
      state.controllers?.[nextNeutralController]?.kind === "human",
  );
  const freeHumanNeutralControl =
    humanNeutralControl && state.adventure?.pvpNeutralControlMustAttack === false;
  // Must-attack human guards still choose WHICH unit each guard hits. At the
  // hardest side fields (difficulty 4+, where the printed party carries two
  // premium bodies) a two-body army cannot screen its carry against that
  // focus, so the same formation depth is required there; difficulty ≤ 3
  // stays on the printed strength curve (CONTROL kept).
  const deepFormationNeeded =
    freeHumanNeutralControl ||
    (humanNeutralControl &&
      fieldDifficulty >= HUMAN_MUST_ATTACK_DEPTH_DIFFICULTY);
  const humanNeutralFormationReady =
    !deepFormationNeeded ||
    (state.players[hero.controllerId]?.army.filter(
      (unit) => unit.side !== "bank",
    ).length ?? 0) >= 3;
  // Home-tile difficulty-1/2 guards (the income mine + treasure) stay engageable
  // while the hero is still on tile Ⅰ — drain all three opening items before
  // any establish-core / bronze-rush refusal can abandon them.
  const homeTileId = homeTileInstanceId(state, hero.controllerId);
  const heroOnHome =
    Boolean(homeTileId) &&
    hero.spaceId != null &&
    state.adventure?.fields[hero.spaceId]?.tileInstanceId === homeTileId;
  const homeOpeningGuard =
    heroOnHome &&
    field.tileInstanceId === homeTileId &&
    fieldDifficulty > 0 &&
    fieldDifficulty <= HOME_TILE_SWEEP_MAX_DIFFICULTY;
  // A strict level advantage resolves before a battle opens. Secondary heroes
  // should collect these free cleanups even without a Silver unit.
  const guaranteedQuickWin =
    !fieldCreatureBankId(field) &&
    !isBankStyleGuardLocation(field.location) &&
    !isTeleportObjectGuardLocation(field.location) &&
    !field.customGuardUnits?.length && !field.unlimitedCombatRounds &&
    fieldDifficulty > 0 &&
    (polishQuickCombatEnabled(state)
      ? polishQuickCombatOutcome(state, hero, fieldDifficulty) === "mandatory"
      : neutralBattleLevel(state, hero) > fieldDifficulty);
  if (hero.kind === "secondary" && guaranteedQuickWin) return true;
  // A strict level advantage resolves as Quick Combat BEFORE a battle opens:
  // free XP, loot and the field visit at zero army risk. The core-preservation
  // and rush gates below exist to stop the army BLEEDING into side fights —
  // a fight that never happens cannot bleed, so the main hero always accepts.
  // Measured pre-fix: those gates skipped every free difficulty-1/2 cleanup
  // from the moment the Pack core stood until Far economy opened, flatlining
  // hero levels at 2-3 for the whole mid-game.
  if (hero.kind === "main" && guaranteedQuickWin) return true;
  // After the income opening, finish the first Gold Pack before risking
  // both Gold Few cards in an optional bank/deep guard. Losing the lower
  // Few repeatedly otherwise restarts recruitment and starves the upgrade.
  if (hero.kind === "main" && !field.flagOwnerId &&
      (fieldCreatureBankId(field) || fieldDifficulty >= 4) &&
      committedGoldInvestment(state, hero.controllerId) &&
      nextGoldLadderStep(state, hero.controllerId)?.kind === "reinforce" &&
      !state.players[hero.controllerId].army.some(unit => unit.side === "pack" &&
        ["gold", "azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier))) return false;
  // Other towns pay for their Bronze core and bring a real Silver body to
  // the next Far III. This is AI planning only; quick wins remain free.
  if (hero.kind === "main" && state.players[hero.controllerId]?.factionId !== "necropolis" &&
      fieldDifficulty >= 3 && field.tileInstanceId &&
      state.adventure?.tiles[field.tileInstanceId]?.group === "far") {
    const higherTier = state.players[hero.controllerId].army.some(unit => unit.side !== "bank" &&
      ["silver", "gold", "azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier));
    if (!higherTier && (!openingBronzeCoreReady(state, hero.controllerId) ||
        secondFarFightNeedsSilver(state, hero.controllerId, field))) return false;
  }
  if (hero.kind === "main" && hasNecromancyPlan(state, hero.controllerId) &&
      ["hard", "impossible"].includes(neutralArmyDifficultyForField(state, field)) &&
      fieldDifficulty >= 2 && (field.location === "settlement" || field.location === "mine") &&
      field.tileInstanceId && state.adventure?.tiles[field.tileInstanceId]?.group === "far") {
    const army = state.players[hero.controllerId].army;
    const silver = army.some(u=>u.side!=="bank" && ["silver","gold","azure"].includes(coreUnitDefinitions[u.unitDefId]?.tier));
    if (!silver && !necropolisFarArmyReady(state, hero.controllerId) &&
        !(state.round <= 5 && fieldDifficulty === 2 && rushProfile.bronzePacks >= 3)) return false;
    const otherFarIncome = Object.values(state.adventure.fields).some(f=> f.tileInstanceId &&
      f.tileInstanceId !== field.tileInstanceId && state.adventure!.tiles[f.tileInstanceId]?.group === "far" &&
      f.flagOwnerId === hero.controllerId && (f.location === "settlement" || f.location === "mine"));
    if (fieldDifficulty >= 3 && otherFarIncome && !silver) return false;
  }
  if (repeatsFailedFight(state, hero.controllerId, field.spaceId)) return false;
  // An opening full Bronze core can earn income/XP from ordinary level II
  // guards instead of waiting exclusively for the much harder Far III.
  if (hero.kind === "main" && state.round <= 5 && fieldDifficulty === 2 &&
      !field.flagOwnerId && !fieldCreatureBankId(field) && !field.customGuardUnits?.length &&
      !isBankStyleGuardLocation(field.location) && !isTeleportObjectGuardLocation(field.location) &&
      !field.unlimitedCombatRounds && neutralBattleLevel(state, hero) >= 2 &&
      rushProfile.bronzePacks >= 3 && humanNeutralFormationReady) return true;
  // Easy neutrals the hero level already covers (difficulty ≤ 1): ALWAYS take.
  // Older gates parked the army for several turns "waiting for its core / Far
  // economy" before walking into a free/equal difficulty-1 fight — that felt
  // like the AI was frozen, then suddenly moved. Harder (difficulty ≥ 2) side
  // neutrals still respect the core-build / bronze-rush refuse gates below.
  const heroBattleLevel = neutralBattleLevel(state, hero);
  const easyLevelCovered =
    fieldDifficulty > 0 &&
    fieldDifficulty <= 1 &&
    heroBattleLevel >= fieldDifficulty;
  if (hero.kind === "main" && easyLevelCovered) {
    return humanNeutralFormationReady &&
      currentArmyCoversGuardField(state, hero.controllerId, fieldDifficulty, field);
  }
  // A held Necromancy can complete the Bronze core through a level-II
  // fight before the first Far III commitment. Home guards remain first.
  if (hero.kind === "main" && hasNecromancyPlan(state, hero.controllerId) &&
      fieldDifficulty === 2 && !fieldCreatureBankId(field) && !field.customGuardUnits?.length &&
      heroBattleLevel >= 2 && rushProfile.totalUnits >= 3 && rushProfile.bronzePacks >= 1 &&
      !necropolisFarArmyReady(state, hero.controllerId) &&
      state.players[hero.controllerId].hand.some(id=>cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE")) return true;
  // establish-core: only refuse difficulty-2+ fair/hard neutrals (equal or
  // under-level). Difficulty-1 is handled above.
  const rebuildingCoreCannotRiskNeutral =
    hero.kind === "main" &&
    !field.flagOwnerId &&
    !premiumEconomy &&
    !homeOpeningGuard &&
    (state.round ?? 0) >= 2 &&
    rushProfile.phase === "establish-core" &&
    fieldDifficulty >= 2 &&
    heroBattleLevel <= fieldDifficulty;
  if (rebuildingCoreCannotRiskNeutral) return false;
  // Bronze-only Pack core skips non-premium difficulty-2+ neutrals, but
  // premium economy is difficulty-calibrated (hard: 3 Packs alone take lv3).
  const bronzeCoreCannotMatchGuard =
    hero.kind === "main" &&
    !field.flagOwnerId &&
    fieldDifficulty >= 2 &&
    heroBattleLevel <= fieldDifficulty &&
    rushProfile.bronzePacks >= rushProfile.corePackTarget &&
    rushProfile.silverUnits === 0 &&
    rushProfile.goldUnits === 0 &&
    !(
      premiumEconomy &&
      armyCoversPremiumEconomyGuard(state, hero.controllerId, fieldDifficulty, field)
    );
  if (bronzeCoreCannotMatchGuard) return false;
  const preservingNextRoundRush =
    (state.round ?? 0) >= 2 &&
    rushProfile.totalUnits >= 3 &&
    rushProfile.bronzePacks >= rushProfile.corePackTarget &&
    !hasOpenedFarEconomy(state, hero.controllerId);
  // Bronze-rush: refuse difficulty-2+ side neutrals that would bleed the army
  // before Far economy — never park multi-turn over a difficulty-1 the level
  // already covers (handled above via easyLevelCovered).
  if (
    hero.kind === "main" &&
    !field.flagOwnerId &&
    !premiumEconomy &&
    !homeOpeningGuard &&
    fieldDifficulty >= 2 &&
    (adventureVictoryMode(state) === "conquest" || adventureVictoryMode(state) === "conquer") &&
    (shouldLaunchBronzeRush(state, hero.controllerId) ||
      preservingNextRoundRush)
  ) {
    return false;
  }
  if (hero.kind === "secondary") {
    const hasPremiumUnit = (state.players[hero.controllerId]?.army ?? []).some(
      (unit) => {
        const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
        return tier === "silver" || tier === "gold" || tier === "azure";
      },
    );
    if (!hasPremiumUnit) return false;
    if (field.location === "creature_bank") {
      const bank = field.bankId
        ? CREATURE_BANKS[field.bankId as CreatureBankId]
        : undefined;
      return (
        bank?.tier === "far" &&
        canBeatCreatureBank(state, hero.controllerId, field)
      );
    }
    if (fieldDifficulty > 2) return false;
  }
  if (field.location === "creature_bank") {
    return canBeatCreatureBank(state, hero.controllerId, field);
  }
  const difficulty = fieldDifficulty;
  if (difficulty <= 0) {
    return false;
  }
  // Premium settlement / gold / valuables: scenario-difficulty Pack-core rush
  // (Impossible FAR III: three bronze Packs with three entry MP). Losses OK.
  if (
    premiumEconomy &&
    armyCoversPremiumEconomyGuard(state, hero.controllerId, difficulty, field)
  ) {
    return humanNeutralFormationReady;
  }
  // The home-tile opening sweep keeps the classic equal-level engagement: the
  // guarded treasure/mine on tile Ⅰ is a difficulty-1/2 fight the documented
  // home-drain must take EVERY game, and on Impossible the tier cap (bronze
  // cap 1) would otherwise refuse it until level 3 — abandoning the opening
  // that `homeOpeningGuard` exists to protect.
  if (homeOpeningGuard && heroBattleLevel >= difficulty) {
    return true;
  }
  // A real fight must be covered by the army that still exists, not by a hero
  // level earned before that army was destroyed. This includes the ordinary
  // equal-level case; strict level advantage returned above as a no-risk Quick
  // Combat win.
  return (
    humanNeutralFormationReady &&
    currentArmyCoversGuardField(state, hero.controllerId, difficulty, field)
  );
}

/**
 * A guarded LINKED Subterranean-Gate half can only be FOUGHT by an ordinary
 * arrival from a NON-TWIN neighbor: the free hop between the two halves SLIPS
 * PAST the guard by engine rule (2026-08-07, resolveHeroArrival's gate arm), so
 * a hero can never open that battle by crossing the gate. When no non-twin
 * neighbor exists to stand on, the guard is unfightable by walking at all —
 * listing it as a march objective would commit the hero to a fight that can
 * never fire (measured: the AI slipped onto the guarded half, believed it had
 * "arrived", and parked there for the rest of the game). Non-gate fields and
 * unguarded halves always answer true.
 */
export function guardedGateHalfHasFightApproach(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
): boolean {
  if (field.location !== "subterranean_gate" || !field.gateLinkSpaceId) {
    return true;
  }
  const twin = state.adventure?.fields[field.gateLinkSpaceId];
  if (!gateFieldsLinked(field, twin)) {
    return true;
  }
  const movement = getHeroMovementCapabilities(state, hero);
  return getAdjacentSpaceIds(field.spaceId).some((neighbor) => {
    if (neighbor === field.gateLinkSpaceId) return false;
    if (!state.adventure?.fields[neighbor]) return false;
    if (!canCrossEdge(state, neighbor, field.spaceId, movement)) return false;
    const kind = classifyHeroStep(state, hero, neighbor, movement);
    // The approach cell must be one the hero could actually STAND on.
    return kind === "open" || kind === "stop" || kind === "encounter";
  });
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
/** Rough visit worth of one designer Obelisk award (Event-menu weights). */
function obeliskBonusValue(bonus: CustomMapObeliskBonus): number {
  switch (bonus.kind) {
    case "morale":
      return 8;
    case "search":
      return 10 + bonus.count * 3;
    case "ability_token":
      return 14;
    case "resources":
      return (bonus.gold ?? 0) * 2 + (bonus.buildingMaterials ?? 0) * 3 + (bonus.valuables ?? 0) * 6;
    case "movement":
      return bonus.amount * 3;
    case "experience":
      return 10 + bonus.amount * 4;
    case "dice":
      return bonus.treasure * 9 + bonus.resource * 7;
    case "resource_roll":
      return 9;
  }
}

/**
 * Worth of visiting an Obelisk this seat has not flagged, or null when the
 * visit grants nothing the AI can use — the reward changes with the map
 * setting, so the AI reads it instead of treating every Obelisk alike:
 *  - designer role "monolith": a teleport connector, not a visit target;
 *  - role "victory-only": only Holy-Grail progress (handled as a victory
 *    objective while the dig is locked), no reward otherwise;
 *  - role "bonus": the designer awards (a "choose" menu counts its best one);
 *  - classic: the `obelisk-rewards` house rule's locked Attack-die face — the
 *    face is PUBLIC once any hero rolled it (+1 Treasure+Resource dice beats a
 *    0 Artifact Search beats a -1 morale token; unknown = the average).
 */
export function obeliskVisitValue(state: GameState, field: MapFieldState): number | null {
  if (field.location !== "obelisk") return null;
  const role = obeliskPresetRole(state);
  if (role === "monolith" || role === "victory-only") return null;
  if (role === "bonus") {
    const config = state.adventure?.mapPreset?.obelisks;
    const list = config?.bonuses && config.bonuses.length > 0 ? config.bonuses : [config?.bonus ?? DEFAULT_OBELISK_BONUS];
    const values = list.map(obeliskBonusValue);
    return config?.bonusMode === "choose" && values.length > 1
      ? Math.max(...values)
      : values.reduce((sum, value) => sum + value, 0);
  }
  if (!houseRuleEnabled(state, "obelisk-rewards")) return null;
  switch (field.obeliskRoll) {
    case 1:
      return 16;
    case 0:
      return 13;
    case -1:
      return 8;
    default:
      return 11;
  }
}

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
    if (occupant && !playersAreAllied(state, occupant.controllerId, playerId)) {
      if (locationDefinitions[field.location]?.passive?.protectsFromAttack) {
        return null;
      }
      return shouldEngageEnemy(state, playerId, occupant.controllerId, { field })
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
    // A `control-towns` VP objective (non-conquest modes) elevates an
    // enemy-flagged town/settlement to "victory"; it still opens a GARRISON
    // fight, so respect the army-strength gate rather than march to a certain
    // loss turn after turn. Conquest mode is untouched (an enemy town is a
    // conquest target there, gated by its own clause).
    if (
      adventureVictoryMode(state) !== "conquest" &&
      adventureVictoryMode(state) !== "conquer" &&
      field.flagOwnerId &&
      !playersAreAllied(state, field.flagOwnerId, playerId) &&
      (locationDefinitions[field.location]?.category === "town" ||
        field.location === "settlement") &&
      !shouldAssaultEnemyHolding(state, playerId, field)
    ) {
      return null;
    }
    return victory;
  }

  const occupant = heroAtSpace(state, field.spaceId, hero.id);
  if (occupant && !playersAreAllied(state, occupant.controllerId, playerId)) {
    // A hero protected by either Sanctuary rule can never be attacked; an
    // outmatched fight is declined. Either way the field is not an objective.
    if (
      pvpAttacksBanned(state) ||
      locationDefinitions[field.location]?.passive?.protectsFromAttack
    ) {
      return null;
    }
    return shouldEngageEnemy(state, playerId, occupant.controllerId, { field })
      ? "enemy-hero"
      : null;
  }

  const category = locationDefinitions[field.location]?.category;
  // An ALLY's flag counts as ours: the engine's ally flag gate makes walking
  // onto an ally's town/mine/settlement a no-op (no re-flag, no visit), so an
  // ally-flagged field can never be a collectible objective — listing it sent
  // allied computer seats marching to fields where nothing could ever happen.
  const ownedByUs =
    field.flagOwnerId === playerId ||
    Boolean(field.extraFlagOwnerIds?.includes(playerId)) ||
    fieldFlaggedByAlly(state, playerId, field);

  // Obelisks flag for every visitor (an enemy cube never blocks ours), but the
  // reward depends on the map setting — designer role, house rule, locked die
  // face. No reward, no detour; otherwise the normal enemy-flag / guard /
  // flaggable gates below decide exactly as for any other flaggable field.
  if (field.location === "obelisk" && !ownedByUs && obeliskVisitValue(state, field) === null) {
    return null;
  }

  // PvE module sites are revisitable by design, so the generic category path
  // below does not claim them. Once the same strength gate used by the visit
  // policy says the fight is viable, deliberately march to the live site.
  const dungeonSite = state.adventure?.dungeonSite;
  if (
    field.location === "dungeon_gate" &&
    dungeonSite?.fieldId === field.spaceId &&
    playerArmyStrength(state, playerId) >= 4
  ) {
    return "visitable";
  }
  if (
    field.location === "rift_lair" &&
    field.riftLair &&
    playerArmyStrength(state, playerId) >= 8
  ) {
    const raid = state.adventure?.raidBosses?.[field.riftLair];
    if (raid && raid.fieldId === field.spaceId && !raid.slainBy && raid.layersLeft > 0) {
      return "visitable";
    }
  }

  // Enemy-flagged holdings (no enemy hero on the hex):
  //  - bare mines / flaggables re-flag for free → always worth taking
  //  - towns / settlements may open a garrison fight → army-strength gate
  if (field.flagOwnerId && !playersAreAllied(state, field.flagOwnerId, playerId)) {
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
    // A guarded gate half with no non-twin approach can never be fought —
    // never a march target (the twin hop only slips past its guard).
    if (!guardedGateHalfHasFightApproach(state, hero, field)) {
      return null;
    }
    if (canBeatGuardedField(state, hero, field)) {
      return "guard";
    }
    // Premium STAGING (Impossible): a lv1-3 settlement / gold / valuables the
    // ready opening core cannot cover until its first silver body arrives is
    // still the march target — walk there and WAIT adjacent (moveScore blocks
    // the actual entry while the guard is unbeatable), so the fight fires the
    // round the silver is bought instead of after a fresh multi-round march.
    if (
      hero.kind === "main" &&
      premiumEconomyWorthStaging(state, playerId, field)
    ) {
      return "guard";
    }
    return null;
  }
  if (category === "town" && !ownedByUs) {
    return "town";
  }
  if (category === "flaggable" && !ownedByUs) {
    return "flaggable";
  }
  if (category === "visitable" && !field.blackCube && !isMarketLocation(field.location)) {
    return "visitable";
  }
  // Markets (revisitable) are only worth a detour when resources need a trade.
  // Opening an idle market is free while parked; marching across the map for
  // one is only justified by a real rebalance need.
  if (
    isMarketLocation(field.location) &&
    field.spaceId !== hero.spaceId &&
    state.computerMemory?.[playerId]?.lastMarketRound !== state.round &&
    (wantsMarketVisit(state, playerId, field.location) ||
      premiumRecruitMarketVisit(state, playerId, field.location, field.spaceId))
  ) {
    return "visitable";
  }

  // Anime equipment outfitters: march when module on, gold surplus, empty slot.
  if (
    (field.location === "anime.ren_binh_cac" ||
      field.location === "anime.adventurer_outfitter") &&
    equipmentEnabled(state) &&
    wantsEquipmentShop(state, playerId)
  ) {
    return "visitable";
  }

  // WOG field overrides / designer payoffs: treat unvisited ones as visitables
  // when their module content is on the board (location present ⇒ package active).
  if (
    !field.blackCube &&
    (field.location === "wog.emerald_tower" ||
      field.location === "wog.mirror_home_way" ||
      field.location === "wog.junk_merchant" ||
      field.location === "wog.living_skull" ||
      field.location === "wog.adventure_cave" ||
      field.location === "wog.altar_of_gods" ||
      field.location === "wog.fishing_well")
  ) {
    return "visitable";
  }

  // Keymaster tents: always worth flagging when not yet held (opens barriers).
  if (field.location === "keymaster_tent" && !ownedByUs) {
    return "flaggable";
  }

  // Barriers are walls, not visit targets — never objectives.
  // Teleport connectors (monolith/gate/whirlpool/oneway): not visit objectives
  // when unguarded (pathfinding reverse edges already route through them).

  return null;
}

/**
 * True when the seat should detour to an equipment outfitter: anime equipment
 * module on, at least one empty body slot, and gold covers the cheapest grade
 * (I = 4) plus a small cushion so the shop leave path stays clean.
 */
export function wantsEquipmentShop(state: GameState, playerId: PlayerId): boolean {
  if (!equipmentEnabled(state)) return false;
  const gold = state.players[playerId]?.resources.gold ?? 0;
  if (gold < 4 + 6) return false;
  return ANIME_EQUIPMENT_SLOTS.some((slot) => !heroEquipmentSlot(state, playerId, slot));
}

/**
 * Same-color Keymaster tent the hero should seek because a barrier of that
 * color still blocks map connectivity and the seat does not hold the key.
 * Pure public-state heuristic for objectiveStrategicValue boosts.
 */
export function tentKeysStillNeeded(state: GameState, playerId: PlayerId): Set<1 | 2 | 3 | 4> {
  const needed = new Set<1 | 2 | 3 | 4>();
  for (const field of Object.values(state.adventure?.fields ?? {})) {
    if (field.location !== "barrier" || field.gatePair === undefined) continue;
    if (!playerHoldsTentFlag(state, playerId, field.gatePair)) {
      needed.add(field.gatePair);
    }
  }
  return needed;
}

/**
 * Fields from which this hero could DISCOVER a still face-down tile OR place a
 * Far (Ⅱ–Ⅲ) supply tile (same geometry/seal rules legal-actions uses).
 * Marching here then flipping/placing is how the AI expands the map.
 *
 * Yellow (sealed) outer borders NEVER become AI explore objectives: immediate-
 * access discovery and strict placement both refuse a sealed hero edge, even
 * when a Legacy human table has adjacency-only discovery enabled.
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
  const canPlaceFar = seatHoldsFarSupplyTile(state, hero.controllerId);
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
    let opensFarTile = false;
    let opensGrowthTile = false;
    for (const tile of faceDown) {
      if (shouldDeferExpansionTile(state, probe, tile)) continue;
      // AI gate: geometric adjacency plus an open doorway now. Every yellow arc
      // is refused, a carved Creature Bank / Gate hex included — USER RULE
      // 2026-09-05 keeps the slot's PRINTED outer arc through a carve, so the
      // hero's vantage is whatever `isOuterEdgeSealed` says. Never re-derive it
      // here: this probe asks the live gate.
      if (canHeroImmediatelyAccessAdjacentTile(state, probe, tile)) {
        useful = true;
        if (tile.group === "far") {
          opensFarTile = true;
        }
        if (tileBandOffersGrowth(hero, tile.group)) opensGrowthTile = true;
      }
    }
    // A field where the hero could DROP a Ⅱ–Ⅲ tile is an expand objective even
    // when every laid face-down tile is sealed off from here. Placement also
    // refuses sealed hero edges independently of the human rules toggle.
    if (
      !opensFarTile &&
      canPlaceFar &&
      farTilePlacementCenters(state, probe, undefined, { requireImmediateAccess: true }).length > 0
    ) {
      useful = true;
      opensFarTile = true;
    }
    if (useful) {
      found.set(field.spaceId, {
        spaceId: field.spaceId,
        kind: "explore",
        ...(opensFarTile ? { opensFarTile: true } : {}),
        ...(opensGrowthTile ? { opensGrowthTile: true } : {}),
      });
    }
  }
  return [...found.values()];
}

/**
 * FALLBACK STAGING (never stand still): when NOTHING on the map is currently
 * worth marching to — every guard/bank outmatches the army, no town/flag/visit
 * remains, no face-down tile is reachable and no Ⅱ–Ⅲ supply is placeable —
 * the old empty objective list made the hero END TURN in place, turn after
 * turn ("feels not strong enough and just stands still"). Instead, list the
 * still-unbeatable neutral guards and Creature Banks as march targets: the
 * hero walks over and parks ADJACENT (moveScore blocks the actual entry while
 * `canBeatGuardedField` is false — the same gate premium staging relies on),
 * so the fight fires the round the level/army catches up instead of after a
 * fresh cross-map march. Main hero only: a secondary never takes these fights.
 */
function collectStagingObjectives(
  state: GameState,
  hero: HeroState,
): MapObjective[] {
  if (hero.kind !== "main") {
    return [];
  }
  const objectives: MapObjective[] = [];
  const fields = state.adventure?.fields ?? {};
  for (const spaceId of Object.keys(fields).sort()) {
    const field = fields[spaceId];
    if (!isFieldGuarded(field)) continue;
    if (field.flagOwnerId) continue;
    if (heroAtSpace(state, field.spaceId, hero.id)) continue;
    // A guard the hero could never ARRIVE at (gate half with no non-twin
    // approach) is not worth staging beside either.
    if (!guardedGateHalfHasFightApproach(state, hero, field)) continue;
    objectives.push({ spaceId, kind: "guard" });
  }
  return objectives;
}

/** Every objective field on the map for this hero, in stable spaceId order. */
export function collectMapObjectives(
  state: GameState,
  hero: HeroState,
): MapObjective[] {
  return mapScoringCached(state, `objectives|${heroCacheKey(hero)}`, () =>
    collectMapObjectivesUncached(state, hero));
}

function collectMapObjectivesUncached(
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
  if (objectives.length === 0) {
    return collectStagingObjectives(state, hero);
  }
  return objectives;
}

/**
 * Reverse teleport edges for multi-source BFS-from-objectives: for each portal
 * P that can jump to a known field D, the reverse edge is D → P (cost 1). Only
 * portals the hero can ENTER (unguarded, or a beatable guard) are included —
 * an unbeatable guarded portal is never a corridor. Face-down landings are
 * omitted (listKnownTeleportDestinations). Built once per distance-field call.
 */
function buildReverseTeleportEdges(
  state: GameState,
  hero: HeroState,
): Map<MapSpaceId, MapSpaceId[]> {
  const reverse = new Map<MapSpaceId, MapSpaceId[]>();
  const fields = state.adventure?.fields ?? {};
  for (const spaceId of Object.keys(fields)) {
    const field = fields[spaceId];
    if (!field) continue;
    // Must be able to walk onto the portal to use it.
    if (isFieldGuarded(field) && !canBeatGuardedField(state, hero, field)) {
      continue;
    }
    const destinations = listKnownTeleportDestinations(state, spaceId);
    if (destinations.length === 0) continue;
    for (const dest of destinations) {
      const list = reverse.get(dest);
      if (list) {
        list.push(spaceId);
      } else {
        reverse.set(dest, [spaceId]);
      }
    }
  }
  return reverse;
}

/**
 * Multi-source BFS distance (in hero steps) from every cell to its NEAREST
 * objective, across the graph the hero can actually walk PLUS teleport-network
 * jumps (Monolith / Whirlpool / colored Gate / one-way entrance→exit). An
 * objective cell is a source at distance 0. Expansion follows a real hero step
 * `neighbour -> node` (so `canCrossEdge` is asked in that direction) and never
 * routes THROUGH a field the hero cannot pass (a "stop" field is a valid
 * endpoint but not a walk corridor). Teleports are reverse edges landing →
 * portal ({@link buildReverseTeleportEdges}): a stop landing still fires those
 * edges without becoming a walk corridor. Cells with no objective reachable
 * are simply absent from the map.
 */
export function objectiveDistanceField(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective>,
  resolvePeacefulVisits = false,
): Map<MapSpaceId, number> {
  return mapScoringCached(state,
    `distance|${resolvePeacefulVisits ? 1 : 0}|${heroCacheKey(hero)}|${objectivesCacheKey(objectives)}`,
    () => objectiveDistanceFieldUncached(state, hero, objectives, resolvePeacefulVisits));
}

function objectiveDistanceFieldUncached(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective>,
  resolvePeacefulVisits: boolean,
): Map<MapSpaceId, number> {
  const distance = new Map<MapSpaceId, number>();
  const fields = state.adventure?.fields ?? {};
  const movement = getHeroMovementCapabilities(state, hero);
  const reverseTeleports = buildReverseTeleportEdges(state, hero);
  const queue: MapSpaceId[] = [];

  /**
   * Reverse teleport relax: landings mark every portal that can jump here.
   * Portals are always queued so walk approaches to the portal keep expanding
   * (the portal itself is typically a stop and would not be walk-queued).
   */
  const relaxReverseTeleports = (landing: MapSpaceId, landingDistance: number) => {
    for (const portal of reverseTeleports.get(landing) ?? []) {
      if (!fields[portal]) continue;
      const next = landingDistance + 1;
      const prior = distance.get(portal);
      if (prior !== undefined && prior <= next) continue;
      distance.set(portal, next);
      queue.push(portal);
    }
  };

  /**
   * Subterranean-Gate slip relax: a GUARDED linked gate half classifies as a
   * "stop" (fighting is how you normally arrive), but the free hop from its
   * TWIN slips past the guard by engine rule — so for a hero coming through
   * the gate the guarded half IS a corridor. When such a half settles as a
   * stop, hand its twin a distance anyway so the far layer stays reachable in
   * the AI's model exactly as it is on the real table.
   */
  const relaxGateTwinSlip = (half: MapSpaceId, halfDistance: number) => {
    const field = fields[half];
    if (field?.location !== "subterranean_gate" || !field.gateLinkSpaceId) {
      return;
    }
    const twinId = field.gateLinkSpaceId;
    const twin = fields[twinId];
    if (!gateFieldsLinked(field, twin)) return;
    const next = halfDistance + 1;
    const prior = distance.get(twinId);
    if (prior !== undefined && prior <= next) return;
    distance.set(twinId, next);
    const kind = classifyHeroStep(state, hero, twinId, movement);
    if (kind !== "stop") {
      queue.push(twinId);
    } else {
      relaxReverseTeleports(twinId, next);
    }
  };

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
      if (!fields[neighbor]) {
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
      const next = nodeDistance + 1;
      const prior = distance.get(neighbor);
      if (prior !== undefined && prior <= next) {
        continue;
      }
      distance.set(neighbor, next);
      // Only "open"/passable cells may be walked THROUGH; a "stop" cell is a
      // reachable endpoint but not a walk corridor. Stop landings still fire
      // reverse teleport edges so a portal-pair shortens the field.
      // A premium march may finish a peaceful one-use visit and continue with
      // another legal MOVE_HERO. Keep combat stops, markets and teleports out
      // of this exception; ordinary path consumers retain their usual graph.
      const peacefulVisit = resolvePeacefulVisits && kind === "stop" &&
        locationDefinitions[fields[neighbor].location]?.category === "visitable" &&
        !isFieldGuarded(fields[neighbor]) && !heroAtSpace(state, neighbor, hero.id);
      if (kind !== "stop" || peacefulVisit) {
        queue.push(neighbor);
      } else {
        relaxReverseTeleports(neighbor, next);
        relaxGateTwinSlip(neighbor, next);
      }
    }

    // Reverse teleports from this node as a landing (open cells + portals).
    relaxReverseTeleports(node, nodeDistance);
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
  resolvePeacefulVisits = false,
): number | undefined {
  if (!hero.spaceId) {
    return undefined;
  }
  if (hero.spaceId === spaceId) {
    return 0;
  }
  const field = objectiveDistanceField(state, hero, [
    { spaceId, kind: "visitable" },
  ], resolvePeacefulVisits);
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
 * HOME-TILE SWEEP (a strong human's tempo). While the hero still stands on its
 * OWN starting tile (tile Ⅰ), every remaining local payoff — the free resource
 * symbol, the guarded (difficulty 1) treasure, and the guarded (difficulty 1)
 * income MINE — MUST be drained before the hero marches off ("get all 3 items
 * in tile 1 all the time, then move to II–Ⅲ properly"). Measurement of the
 * stock policy showed the fresh hero grabbing only the unguarded symbol and
 * abandoning the mine + treasure; conquest bronze-rush victory values also used
 * to outrank home payoffs and yank the hero away mid-sweep.
 *
 * Levers (scoped to the home tile while the hero is still on it):
 *  1. the not-ready guard penalty is LIFTED for a level-coverable difficulty-1/2
 *     guard on the home tile (opening play, not a fair fight to postpone),
 *  2. a decisive sweep bonus keeps every home payoff above off-tile prizes, and
 *  3. `primaryMapObjective` RESTRICTS the pool to remaining home payoffs while
 *     any exist — conquest / Far / sticky commits cannot interrupt the drain.
 * Both (1) and (2) switch off the moment the hero leaves the tile; (3) ends
 * once the home tile has nothing left to sweep.
 */
const HOME_TILE_SWEEP_MAX_DIFFICULTY = 2;
const HOME_TILE_SWEEP_BONUS = 320;
const HOME_OPENING_LOCATIONS: ReadonlySet<string> = new Set([
  "mine",
  "resource_symbol",
  "treasure_symbol",
]);

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
 * Whether this objective qualifies for the home-tile sweep: a sweepable payoff
 * on the hero's OWN starting tile, while the hero still stands on that tile.
 * Only the first two rounds force the opening sweep. Returning home later
 * must not restart the opening and displace an income commitment.
 * Pure public-state reads (town flag, tile ids) — never touches the
 * guaranteed-win house rule.
 */
export function isHomeTileSweepObjective(
  state: GameState,
  hero: HeroState,
  objective: MapObjective,
  field: MapFieldState | undefined = state.adventure?.fields[objective.spaceId],
): boolean {
  if (state.round > 2) return false;
  if (!SWEEPABLE_KINDS.has(objective.kind)) return false;
  const homeTile = homeTileInstanceId(state, hero.controllerId);
  if (!homeTile) return false;
  const heroTile = hero.spaceId
    ? state.adventure?.fields[hero.spaceId]?.tileInstanceId
    : undefined;
  return heroTile === homeTile && field?.tileInstanceId === homeTile;
}

/** The three stock tile-I objects governed by the two-turn opening route. */
export function isHomeTileOpeningObjective(
  state: GameState,
  hero: HeroState,
  objective: MapObjective,
): boolean {
  const field = state.adventure?.fields[objective.spaceId];
  return (
    isHomeTileSweepObjective(state, hero, objective, field) &&
    Boolean(field && HOME_OPENING_LOCATIONS.has(field.location))
  );
}

/**
 * ALLIED-SEAT DEDUP: two allied computer seats used to pick the SAME free
 * mine / settlement / guard / doorway and march there in lockstep — pure waste
 * for the team (only one of them can collect it). When an ALLIED COMPUTER
 * seat's main hero stands strictly closer to a collectible objective, this
 * seat discounts it and picks the next-best target instead. Straight-line hex
 * distance only (cheap, public hero positions); enemy-facing kinds (victory /
 * enemy-hero) are deliberately never discounted — converging on the enemy is
 * cooperation, not duplication. Human allies are not read: their plans are
 * unknowable, and shadowing them out of objectives would just idle the AI.
 */
const ALLY_CLAIM_KINDS: ReadonlySet<MapObjectiveKind> = new Set([
  "guard",
  "flaggable",
  "visitable",
  "town",
  "explore",
]);
const ALLY_CLAIM_PENALTY = 140;

export function alliedComputerSeatCloser(
  state: GameState,
  hero: HeroState,
  spaceId: MapSpaceId,
): boolean {
  if (!hero.spaceId) return false;
  const target = parseHexSpaceId(spaceId);
  const heroCell = parseHexSpaceId(hero.spaceId);
  if (!target || !heroCell) return false;
  const own = hexDistance(heroCell, target);
  for (const other of Object.values(state.heroes)) {
    if (
      other.id === hero.id ||
      other.kind !== "main" ||
      !other.spaceId ||
      other.controllerId === hero.controllerId ||
      !playersAreAllied(state, other.controllerId, hero.controllerId) ||
      !isComputerPlayer(state, other.controllerId)
    ) {
      continue;
    }
    const otherCell = parseHexSpaceId(other.spaceId);
    if (otherCell && hexDistance(otherCell, target) < own) {
      return true;
    }
  }
  return false;
}

/**
 * CO-OP HUMAN HUNT: a co-op computer seat can only win by ELIMINATING the
 * humans (checkCustomWinConditions skips AI seats in co-op, and the mode's own
 * win is last-alliance-standing), yet nothing in the map policy pushed toward
 * that — the AI played its economy game and only fought a human who wandered
 * into range. Once the army reads READY, a human hero / enemy town outranks
 * yet another neutral pickup. Zero on clash tables and for human seats
 * (CONTROL-pinned); the shouldEngageEnemy strength gate still applies, so an
 * outmatched AI never suicides into the alliance.
 */
export function coopHumanHuntBonus(state: GameState, playerId: PlayerId): number {
  if (state.gameMode !== "coop") return 0;
  if (!isComputerPlayer(state, playerId)) return 0;
  return 80;
}

/**
 * Guard-objective demotion for a Creature Bank while an enemy main hero
 * out-levels ours. Ranked-replay lesson (2026-09-02/03): the losers of all
 * three full-length games spent rounds 6–10 on banks and Quick-Combat cleanups
 * — gold, but NO hero experience (banks pay none by rule) — and were still
 * level 4 when the winners, who kept taking difficulty-4/5 guard fields,
 * reached level 6–7 and won the PvP. Sized so a ready bank (710) drops below a
 * ready experience-paying guard field but stays above a bare flaggable (658).
 */
/**
 * Whether a Trading Post visit would COMPLETE the purchase this seat is saving
 * for: the Gold-ladder recruit plan (buy its missing valuable, sell the stock it
 * does not need) or the same-visit Gold dwelling + level-7 body combo. Both
 * planners return null the moment the purchase is affordable, so the pull
 * disappears by itself. Memoised per scoring pass — `objectiveStrategicValue`
 * runs once per objective per candidate action.
 */
function savedPurchaseNeedsMarket(state: GameState, playerId: PlayerId): boolean {
  return mapScoringCached(state, `marketCompletes|${playerId}`, () =>
    Boolean(goldStepMarketPlan(state, playerId) ?? goldBodyComboTradePlan(state, playerId)));
}

export const BANK_LEVEL_DEFICIT_PENALTY = 40;

/** Exported for tests only — the ranking seam behind primaryMapObjective. */
export function objectiveStrategicValue(
  state: GameState,
  hero: HeroState,
  objective: MapObjective,
  distance: number,
  /** Whether ANY fight (guard / enemy hero) is on the current objective list. */
  fightAvailable = true,
): number {
  const ready = armyReadyForContestedFight(state, hero.controllerId);
  const mode = adventureVictoryMode(state);
  const bronzeRush =
    hero.kind === "main" &&
    (mode === "conquest" || mode === "conquer") &&
    shouldLaunchBronzeRush(state, hero.controllerId);
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
      else if (mode === "conquest" || mode === "conquer") value = bronzeRush ? 1_080 : ready ? 790 : 360;
      else if (mode === "dragon-hunt" || mode === "dragon-conqueror") {
        value = ready ? 900 : 390;
      } else value = 950;
      break;
    }
    case "enemy-hero":
      value = bronzeRush ? 970 : ready ? 760 : 390;
      break;
    case "guard": {
      const difficulty = field?.difficulty ?? 0;
      const battleLevel = neutralBattleLevel(state, hero);
      const guaranteedQuickWin =
        difficulty > 0 && battleLevel > difficulty;
      // Home-tile opening sweep lifts the not-ready penalty for a level-
      // coverable difficulty-1/2 guard (the income mine / the guarded treasure
      // are opening plays, not fair fights to postpone for army development).
      // Same band for ANY difficulty-1 the level covers — do not park multi-
      // turn waiting for Packs before a free/equal easy fight off-home.
      const homeGuardTakeable =
        homeSweep &&
        difficulty > 0 &&
        difficulty <= HOME_TILE_SWEEP_MAX_DIFFICULTY;
      // Off-home difficulty-1 the level covers: engage (canBeat) with a mid
      // band so a NEARBY easy fight outranks a doorway, but a distant one does
      // not yank the hero off expansion for several dead turns.
      const easyLevelCovered =
        !homeGuardTakeable &&
        difficulty > 0 &&
        difficulty <= 1 &&
        battleLevel >= difficulty;
      value = guaranteedQuickWin
        ? 800
        : ready || homeGuardTakeable
          ? 710
          : easyLevelCovered
            ? 560
            : 410;
      // A survivable LOWER-level (difficulty-2) tile that carries GOODS — a
      // materials mine or a resource-yielding guarded pickup (treasure symbol,
      // resource roll, gold chest) — is worth taking for its loot on the way to
      // an L3, the user's "flexibly fight a beatable lower tile for goods" rule.
      // Rank it near a flaggable (625-658) but below a premium L3 (920+). This is
      // OBJECTIVE PRIORITY only: entry stays gated by canBeatGuardedField and the
      // retreat rule still decides at combat time, so no unbeatable fight opens
      // (golden rule 3 — the guard-difficulty band — is untouched).
      if (
        !guaranteedQuickWin && !ready && difficulty === 2 && field &&
        (field.location === "mine" ||
          interactionCanYield(locationDefinitions[field.location]?.interaction, "valuables") ||
          interactionCanYield(locationDefinitions[field.location]?.interaction, "gold") ||
          interactionCanYield(locationDefinitions[field.location]?.interaction, "buildingMaterials")) &&
        canBeatGuardedField(state, hero, field)
      ) {
        value = Math.max(value, 640);
      }
      // Premium Far economy (settlement / gold / valuables): hit ASAP once the
      // army can cover it for this scenario difficulty. Worth multi-turn
      // marches and unit losses — before round 6 a 3-turn prep path must
      // outrank random side neutrals. Resource need steers gold vs valuables.
      if (field && isPremiumEconomyField(field) && difficulty > 0 && difficulty <= 3) {
        const canCover =
          guaranteedQuickWin ||
          neutralBattleLevel(state, hero) >= difficulty ||
          armyCoversPremiumEconomyGuard(state, hero.controllerId, difficulty, field) ||
          armyTierCoversGuardField(state, hero.controllerId, difficulty, field) ||
          // Direct combat proof (user 2026-09-18, live tutoring): if the army can
          // actually BEAT this guarded premium mine, commit the march to it — a
          // reachable, winnable valuables/gold mine outranks opening yet another far
          // tile and then backtracking to it. The coarse army-cover heuristics above
          // can miss a fresh Silver body (Crusader) that makes an L3 mine winnable.
          canBeatGuardedField(state, hero, field);
        if (canCover) {
          value = Math.max(value, ready ? 920 : 860);
          if ((state.round ?? 0) < 6) value += 90;
          // First premium economy this seat still lacks → extra ASAP push.
          if (!hasOpenedFarEconomy(state, hero.controllerId)) value += 40;
          value += premiumEconomyResourceBonus(state, hero.controllerId, field);
        }
      }
      // Secondary heroes receive no combat Experience. Keep a useful premium-
      // army cleanup possible, but rank that real fight below a free pickup.
      if (hero.kind === "secondary" && !guaranteedQuickWin) value -= 140;
      // Experience discipline: while a hostile main hero out-levels ours, a
      // bank (no experience) ranks below an experience-paying guard field of
      // the same readiness. No level deficit ⇒ unchanged (see the constant).
      if (
        hero.kind === "main" &&
        field?.location === "creature_bank" &&
        enemyMainHeroLevelDeficit(state, hero.controllerId) > 0
      ) {
        value -= BANK_LEVEL_DEFICIT_PENALTY;
      }
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
      // Gold/valuables mines (already flagged free / unguarded) also beat
      // generic materials mines once the home tile is drained.
      if (field?.location === "settlement") value = 658;
      else if (field?.location === "obelisk") {
        // Reward-scaled: a +1 die face / rich designer award edges past a bare
        // materials mine (625); a -1 morale token sits well below it.
        value = 590 + Math.min(50, (obeliskVisitValue(state, field) ?? 0) * 2);
      } else if (
        field?.location === "mine" &&
        (field.resource === "gold" || field.resource === "valuables")
      ) {
        value =
          640 + premiumEconomyResourceBonus(state, hero.controllerId, field);
      } else if (
        field?.location === "keymaster_tent" &&
        field.gatePair !== undefined &&
        tentKeysStillNeeded(state, hero.controllerId).has(field.gatePair)
      ) {
        // Color key that opens a still-blocking barrier — high priority.
        value = 670;
      } else if (field?.location === "keymaster_tent" || field?.location === "garrison") {
        value = 635;
      } else value = 625;
      break;
    case "visitable":
      value = 600 + (VISITABLE_LOCATION_VALUE[field?.location ?? ""] ?? 0);
      // A Trading Post that completes the saved purchase is the march target,
      // not a trinket: a feasible dwelling rush, the Gold-ladder recruit plan
      // (sell the stock the body does not need / buy its missing valuable) or
      // the same-visit Gold dwelling + level-7 combo. Measured (Necropolis seed
      // eval-14, R9): 12 gold, 5 materials and 7 valuables with the Ghost
      // Dragons 7 gold short and their plan ready — the post kept its 600-band
      // trinket value, the hero wandered, arrived R10 and bought there.
      if (field?.location === "trading_post" &&
          (savedPurchaseNeedsMarket(state, hero.controllerId) ||
            assessDwellingRush(state, hero.controllerId)?.feasible)) value = 940;
      // Equipment shops: extra pull when surplus + empty slot (else the base
      // value alone rarely wins over economy flaggables — intentional).
      if (
        (field?.location === "anime.ren_binh_cac" ||
          field?.location === "anime.adventurer_outfitter") &&
        wantsEquipmentShop(state, hero.controllerId)
      ) {
        value += 40;
      }
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
      // After the home tile is drained and Far economy is still missing, push
      // II–III discovery harder (the bronze-rush cap used to park the hero).
      value = seatHoldsFarSupplyTile(state, hero.controllerId) ? 530 : 500;
      if (!fightAvailable) value += 60;
      if (
        bronzeRush ||
        ((state.round ?? 0) >= 2 &&
          (state.round ?? 0) < 6 &&
          !hasOpenedFarEconomy(state, hero.controllerId))
      ) {
        // Still expand — just do not outrank a live premium-economy fight.
        value = Math.max(value, seatHoldsFarSupplyTile(state, hero.controllerId) ? 560 : 520);
      }
      if (bronzeRush && fightAvailable) value = Math.min(value, 480);
      // FAR-TILE HUNT: a doorway that can FLIP a face-down Ⅱ–Ⅲ tile while the
      // seat still has no Far economy is the guaranteed-settlement lottery —
      // the premium rush cannot fire until one is revealed. Rank it above every
      // trinket visit / leftover flag (600-640) but below a FREE settlement
      // flag (658) and any live beatable fight (710+), so the hero flips its
      // own Far tiles the round after placing them instead of wandering.
      // Measured pre-fix: F19/F14 placed R3/R5 were STILL face-down at R8 and
      // premium capture slipped to R7-R11/never.
      if (
        hero.kind === "main" &&
        objective.opensFarTile &&
        (!hasOpenedFarEconomy(state, hero.controllerId) ||
          // Keep flipping far tiles AFTER the first far capture while the seat
          // still lacks a valuables source — the valuables mine that unblocks the
          // gold dwelling may sit on a still-face-down 3rd/4th far tile.
          needsFarValuablesReveal(state, hero.controllerId))
      ) {
        value = Math.max(value, 655);
      }
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
  // Co-op invaders press the human alliance once the army reads ready —
  // a human hero / enemy town then outranks another neutral pickup.
  if (
    ready &&
    (objective.kind === "enemy-hero" ||
      (objective.kind === "victory" && (mode === "conquest" || mode === "conquer")))
  ) {
    value += coopHumanHuntBonus(state, hero.controllerId);
  }
  // Allied-seat dedup: an allied computer main hero strictly closer to a
  // collectible objective claims it — this seat picks its next-best instead.
  if (
    ALLY_CLAIM_KINDS.has(objective.kind) &&
    alliedComputerSeatCloser(state, hero, objective.spaceId)
  ) {
    value -= ALLY_CLAIM_PENALTY;
  }
  // Price recurring resources by the next real development deficit. An early
  // materials mine that unlocks a dwelling can beat another gold pickup.
  if (field && field.flagOwnerId !== hero.controllerId &&
      (field.location === "mine" || field.location === "settlement")) {
    const resources = state.players[hero.controllerId]?.resources;
    const targets = developmentResourceTargets(state, hero.controllerId);
    if (resources && field.location === "mine" && field.resource) {
      const resource = field.resource;
      if (resource === "gold" || resource === "buildingMaterials" || resource === "valuables") {
        const deficit = Math.max(0, targets[resource] - resources[resource]);
        value += Math.min(60, deficit * (resource === "gold" ? 4 : 12));
      }
    }
    if (field.location === "settlement" && !hasOpenedFarEconomy(state, hero.controllerId)) value += 45;
  }
  // Four-round public-board forecast: recurring income pays once per future
  // Resource round, contested targets account for the enemy's arrival window,
  // and dense regions retain option value for the next objective. This stays a
  // bounded adjustment on top of the rule-specific priorities above.
  value += mapScoringCached(state,
    `horizon:${heroCacheKey(hero)}:${objective.kind}:${objective.spaceId}:${distance}`,
    () => objectiveHorizonAdjustment(state, hero, objective, distance));
  return value - distance * 18;
}

/**
 * Free map seizures: unguarded mines/settlements, unvisited symbols, free towns.
 * These are NOT fights — paths are full of them and the AI must scoop them up
 * instead of tunnel-visioning a distant battle or parking for "readiness".
 */
const FREE_SEIZE_KINDS: ReadonlySet<MapObjectiveKind> = new Set([
  "flaggable",
  "visitable",
  "town",
]);

export function isFreeSeizeObjective(objective: MapObjective, state?: GameState): boolean {
  const field = state?.adventure?.fields[objective.spaceId];
  // A shop offers a purchase, not free loot. Never use it as a pickup detour
  // that interrupts a mine/settlement march or spends its combat MP reserve.
  return FREE_SEIZE_KINDS.has(objective.kind) && !(field && (
    isMarketLocation(field.location) ||
    field.location === "anime.ren_binh_cac" ||
    field.location === "anime.adventurer_outfitter"
  ));
}

/**
 * Free pickups the hero can still walk onto THIS turn (distance ≤ remaining MP).
 * Public-state reachability only.
 */
export function freeSeizuresWithinReach(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective>,
): MapObjective[] {
  const mp = Math.max(0, hero.movementPoints ?? 0);
  return objectives.filter((objective) => {
    if (!isFreeSeizeObjective(objective, state)) return false;
    const distance = distanceFromHeroTo(state, hero, objective.spaceId);
    return distance !== undefined && distance <= mp;
  });
}

/** Extra steps a march may spend to scoop a free pickup beside its route. */
export const MARCH_SCOOP_DETOUR_SLACK = 2;

/**
 * Free pickups that lie ALONG the march to `primary`, however many turns the
 * march takes — USER RULING (2026-09-17): the hero must not walk past a
 * resource field it could have taken on the way and come back for it later.
 * A pickup qualifies when it is no farther from the primary than the hero is
 * (never a step BACK — a pickup behind the hero would reverse a committed
 * march) and either sits in this turn's walking reach (the original scoop) or
 * costs at most `detourSlack` extra steps over the strict route:
 * hero→pickup + pickup→primary ≤ hero→primary + slack. Slack 0 keeps only
 * pickups on a shortest path (used for premium marches whose combat movement
 * reserve is budgeted separately). `towardPrimary` is the distance field
 * sourced at the primary. Public-state reachability only.
 */
export function freeSeizuresAlongMarch(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective>,
  primary: MapObjective,
  towardPrimary: ReadonlyMap<MapSpaceId, number>,
  detourSlack = MARCH_SCOOP_DETOUR_SLACK,
  includeTurnReach = true,
): MapObjective[] {
  if (!hero.spaceId) return [];
  const heroToPrimary = towardPrimary.get(hero.spaceId);
  if (heroToPrimary === undefined || !Number.isFinite(heroToPrimary)) return [];
  const mp = Math.max(0, hero.movementPoints ?? 0);
  return objectives.filter((objective) => {
    if (objective.spaceId === primary.spaceId || !isFreeSeizeObjective(objective, state)) return false;
    const toPrimary = towardPrimary.get(objective.spaceId);
    if (toPrimary === undefined || toPrimary > heroToPrimary) return false;
    const walk = distanceFromHeroTo(state, hero, objective.spaceId);
    if (walk === undefined) return false;
    return (includeTurnReach && walk <= mp) || walk + toPrimary <= heroToPrimary + detourSlack;
  });
}

/**
 * A fight the seat's MAIN hero can still open THIS turn — an unflagged
 * neutral guard the army covers (or a premium field worth staging for the
 * very Silver body being bought), or a Creature Bank the army covers — within
 * the movement left after walking to `fromSpaceId` (the market being visited;
 * omitted = the hero's own position and full remaining movement). Scans the
 * fields directly rather than through collectMapObjectives: objectiveKind
 * classifies market fields with premiumRecruitMarketVisit, so going through
 * the objective list from here would recurse on a map with two posts.
 */
export function premiumRecruitFightInReach(
  state: GameState,
  playerId: PlayerId,
  fromSpaceId?: MapSpaceId,
): boolean {
  const main = getMainHero(state, playerId);
  if (!main?.spaceId) return false;
  let budget = main.movementPoints ?? 0;
  let probe: HeroState = main;
  if (fromSpaceId && fromSpaceId !== main.spaceId) {
    const walk = distanceFromHeroTo(state, main, fromSpaceId);
    if (walk === undefined) return false;
    budget -= walk;
    probe = { ...main, spaceId: fromSpaceId, movementPoints: Math.max(0, budget) };
  }
  if (budget <= 0) return false;
  for (const field of Object.values(state.adventure?.fields ?? {})) {
    // Neutral guards and banks only: no flagged holding (a garrison is not a
    // neutral fight), no hex with another hero on it.
    if (field.spaceId === probe.spaceId || field.flagOwnerId || heroAtSpace(state, field.spaceId, probe.id)) continue;
    const guard =
      isFieldGuarded(field) &&
      field.location !== "creature_bank" &&
      (canBeatGuardedField(state, probe, field) || premiumEconomyWorthStaging(state, playerId, field));
    const bank = field.location === "creature_bank" && canBeatCreatureBank(state, playerId, field);
    if (!guard && !bank) continue;
    const distance = distanceFromHeroTo(state, probe, field.spaceId);
    if (distance !== undefined && distance > 0 && distance <= budget) return true;
  }
  return false;
}

/**
 * USER RULING (2026-09-17): from MARKET_MIN_ROUND the Trading Post is worth a
 * visit for a resource exchange ONLY when
 *  1. the trades get the planned Silver body NEXT (premiumRecruitTradePlan —
 *     payable this visit, Population token unspent),
 *  2. that body joins a fight THIS round — a Creature Bank or neutral guard the
 *     main hero can still reach after the visit, and
 *  3. no income lands next round: odd rounds are Resource Rounds (income just
 *     arrived), even rounds are Astrologers rounds — trading DURING an
 *     Astrologers round throws away stock the next Resource Round would fund.
 * Anything else is "terrible": wait, fight with what stands, or let the
 * dwelling-rush / Gold-step planners (their own rulings) act.
 */
export function premiumRecruitMarketVisit(
  state: GameState,
  playerId: PlayerId,
  location?: string,
  marketSpaceId?: MapSpaceId,
): boolean {
  if (location !== undefined && location !== "trading_post") return false;
  const round = state.round ?? 0;
  if (round < MARKET_MIN_ROUND || round % 2 === 0) return false;
  if (!premiumRecruitTradePlan(state, playerId)) return false;
  return premiumRecruitFightInReach(state, playerId, marketSpaceId);
}

/**
 * Whether a fight keeps primary over a free seizure THIS turn.
 * - Premium Far economy commits multi-turn (free pickups on the walk are still
 *   scooped via multi-source marchTargets in moveScore).
 * - A strictly closer Quick-Combat freebie may divert.
 * Fair/equal side neutrals do NOT outrank free loot — seize free first.
 */
function fightOutranksFreeSeize(
  state: GameState,
  hero: HeroState,
  fight: MapObjective,
  freeDistance: number,
): boolean {
  if (fight.kind !== "guard" && fight.kind !== "enemy-hero") return false;
  const fightDistance = distanceFromHeroTo(state, hero, fight.spaceId);
  if (fightDistance === undefined) return false;
  if (fight.kind === "enemy-hero") {
    return (
      armyReadyForContestedFight(state, hero.controllerId) &&
      fightDistance < freeDistance
    );
  }
  const field = state.adventure?.fields[fight.spaceId];
  if (!field) return false;
  // Premium settlement / gold / valuables: keep the multi-turn economy commit.
  if (isPremiumEconomyField(field)) return true;
  const difficulty = field.difficulty ?? 0;
  // Strictly closer Quick Combat (level > difficulty) may divert — but only a
  // difficulty-2+ fight. User ruling (2026-09-18, live tutoring): a difficulty-1
  // guard is a 1-turn finish you can take whenever, so it must NOT preempt a free
  // resource seize on the way — scoop the free value FIRST and take the easy
  // fight after, ending the turn on the object nearest the next far-tile doorway
  // instead of backtracking (resource → treasure → far tile, not treasure →
  // back for resource → back for the tile). A tougher (difficulty-2+) fight is a
  // real commitment and still diverts when it is strictly closer.
  if (
    difficulty >= 2 &&
    neutralBattleLevel(state, hero) > difficulty &&
    fightDistance < freeDistance
  ) {
    return true;
  }
  return false;
}

function bestObjectiveOf(
  state: GameState,
  hero: HeroState,
  candidates: ReadonlyArray<MapObjective>,
  fightAvailable: boolean,
  resolvePeacefulVisits = false,
): MapObjective | null {
  let best: MapObjective | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const objective of candidates) {
    const distance = distanceFromHeroTo(state, hero, objective.spaceId, resolvePeacefulVisits);
    if (distance === undefined) continue;
    const value = objectiveStrategicValue(
      state,
      hero,
      objective,
      distance,
      fightAvailable,
    );
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

/** Small stable permutation helper; the home opening has at most 3 payoffs. */
function objectiveOrders(items: ReadonlyArray<MapObjective>): MapObjective[][] {
  if (items.length <= 1) return [items.slice()];
  const orders: MapObjective[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const head = items[index];
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of objectiveOrders(rest)) orders.push([head, ...tail]);
  }
  return orders;
}

function distanceBetweenHomeFields(
  state: GameState,
  hero: HeroState,
  from: MapSpaceId,
  to: MapSpaceId,
): number | undefined {
  return distanceFromHeroTo(state, { ...hero, spaceId: from }, to);
}

/**
 * Minimum PRINTED guard difficulty a face-down tile of this BAND can carry,
 * derived from the shipped catalog instead of a hardcoded table (today:
 * starting 1 · far Ⅱ–Ⅲ 2 · near Ⅳ–Ⅴ 4 · center Ⅵ–Ⅶ 6 · sea/subterranean 4).
 * The band is exactly what a face-down tile's printed BACK shows every player,
 * so reading it leaks nothing a human cannot see. A band nobody prints a guard
 * on answers 0 (never "unbeatable").
 */
export function minPrintedGuardDifficultyForBand(
  group: string | undefined,
): number {
  if (!group) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const def of Object.values(allTileDefinitions)) {
    if (def.group !== group) continue;
    for (const field of def.fields) {
      if (field?.difficulty && field.difficulty < min) min = field.difficulty;
    }
  }
  return Number.isFinite(min) ? min : 0;
}

/** Public bands, never the identity or rewards of a hidden tile. */
export function tileBandOffersGrowth(hero: HeroState, group: string | undefined): boolean {
  const minimum = minPrintedGuardDifficultyForBand(group);
  return minimum > 0 && minimum <= hero.level && minimum + 1 >= hero.level;
}

export function heroReadyForGrowth(state: GameState, hero: HeroState): boolean {
  return hero.kind === "main" && hero.level >= 3 && hero.level < 7 &&
    (hasGoldArmy(state, hero.controllerId) ||
      (hero.level >= 4 && securedFarTileIds(state, hero.controllerId).size >= 2));
}

/**
 * Whether NOTHING guarded on a face-down tile of this band could be fought by
 * this hero — its `neutralBattleLevel` is below the band's cheapest printed
 * guard (the same `>=` reading `canBeatGuardedField` engages on). Deliberately
 * NOT "cannot enter": every band also prints unguarded fields to walk onto, so
 * this only says the tile holds no fight the hero can take yet.
 */
export function heroCanBeatNoGuardInBand(
  state: GameState,
  hero: HeroState,
  group: string | undefined,
): boolean {
  const min = minPrintedGuardDifficultyForBand(group);
  return min > 0 && neutralBattleLevel(state, hero) < min;
}

/**
 * Mask-safe "does this seat still hold an unspent Ⅱ–Ⅲ supply tile?".
 *
 * `playerHasPlaceableFarTile` matches `UNOPENED_FAR_TILE` ("?") exactly, but the
 * policy scores against `getPlayerView`, which rewrites EVERY `playerFarTiles`
 * entry — including the owner's own — to the literal `"hidden"` (a supply tile
 * is face down even for its holder). So that predicate is ALWAYS false on the
 * frame the AI reasons over. The COUNTS survive redaction and are exactly what
 * the owner's own UI shows, so a masked entry counts as an unspent supply tile
 * here; the far POOL is length-checked the same way. Nothing hidden is read.
 * Never call `playerHasPlaceableFarTile` from policy scoring for this reason.
 */
export function seatHoldsFarSupplyTile(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const adventure = state.adventure;
  if (!adventure || (adventure.farTilePool?.length ?? 0) === 0) return false;
  return (adventure.playerFarTiles?.[playerId] ?? []).length > 0;
}

/**
 * Whether the seat still has a Ⅱ–Ⅲ expansion route it has not spent: an UNOPENED
 * Far supply tile it may still drop, or a face-down Ⅱ–Ⅲ tile this hero could
 * flip from where it stands right now.
 *
 * The second half is deliberately "from HERE", not "somewhere on the board": a
 * face-down Ⅱ–Ⅲ tile walled off behind a sealed border forever would otherwise
 * make this true for the rest of the game and permanently freeze the seat's Ⅳ+
 * discovery (see `map.discover-high-band-defer`). The supply half needs no such
 * guard — the AI actively marches to placement doorways, so a held tile is spent.
 */
export function farExpansionRouteRemains(
  state: GameState,
  playerId: PlayerId,
  hero?: HeroState | null,
): boolean {
  if (seatHoldsFarSupplyTile(state, playerId)) return true;
  if (!hero?.spaceId) return false;
  return Object.values(state.adventure?.tiles ?? {}).some(
    (tile) =>
      tile.faceDown &&
      tile.group === "far" &&
      canHeroImmediatelyAccessAdjacentTile(state, hero, tile),
  );
}

/** Keep doorway planning and the actual discovery decision on the same band gate. */
export function shouldDeferExpansionTile(
  state: GameState,
  hero: HeroState,
  tile: MapTileState,
): boolean {
  // A valuables-starved seat reveals deeper bands regardless: their unguarded
  // pickups and beatable banks/mines are the only valuables in sight (USER
  // RULING 2026-09-16 — "check underground and sea tiles too, or even grab
  // something from the center tile but not fight the neutral"). Guarded
  // fields it cannot beat stay off the objective list as before.
  if (valuablesStarved(state, hero.controllerId)) return false;
  return tile.group !== "far" && tile.group !== "starting" &&
    heroCanBeatNoGuardInBand(state, hero, tile.group) &&
    farExpansionRouteRemains(state, hero.controllerId, hero);
}

const EXPANSION_BAND_ORDER: Readonly<Record<string, number>> = {
  starting: 0,
  far: 1,
  near: 2,
  center: 3,
};

/**
 * Whether this hero can reveal a lower map band from its CURRENT position.
 * This is deliberately local and advisory: it orders simultaneous choices
 * I -> II-III -> IV-V -> VI-VII, but never blocks a higher band when the lower
 * route is sealed or somewhere else on the board. The face-down tile backs are
 * public information, so the read is observation-safe.
 */
export function lowerExpansionBandImmediatelyAvailable(
  state: GameState,
  hero: HeroState,
  targetGroup: string | undefined,
): boolean {
  const targetRank = targetGroup ? EXPANSION_BAND_ORDER[targetGroup] : undefined;
  if (targetRank === undefined || targetRank <= 1) return false;
  return Object.values(state.adventure?.tiles ?? {}).some((tile) => {
    if (!tile.faceDown || tile.group === targetGroup) return false;
    const rank = tile.group ? EXPANSION_BAND_ORDER[tile.group] : undefined;
    return (
      rank !== undefined &&
      rank >= 1 &&
      rank < targetRank &&
      canHeroImmediatelyAccessAdjacentTile(state, hero, tile)
    );
  });
}

/**
 * Would the home (Ⅰ) tile, turned to `rotation`, leave this hero a Ⅱ–Ⅲ DOORWAY —
 * a hex of its own tile it can walk to and from which it may either flip an
 * adjacent face-down Ⅱ–Ⅲ tile or drop a Ⅱ–Ⅲ supply tile?
 *
 * The rotation is evaluated by re-materializing the ring through the ENGINE's own
 * `materializeTileFields` onto a shallow copy of `adventure.fields` — the exact
 * fields SET_TILE_ROTATION will produce — and then asking the LIVE discovery /
 * placement gates (`canHeroImmediatelyAccessAdjacentTile`,
 * `farTilePlacementCenters`), never a re-implementation of border logic. Both
 * honour `discovery-border-gate` in either reading, because the AI probe always
 * demands immediate access.
 *
 * Scoped to the round-1 starting rotation (`onlyRing`, hero on the invariant
 * centre): re-materializing a ring resets its flags, which is only safe before
 * anything on the ring has been claimed.
 */
export function startTileRotationOpensFarExpansion(
  state: GameState,
  tile: MapTileState,
  rotation: number,
  hero: HeroState,
): boolean {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId) return false;
  // Mask-safe: the policy scores against a redacted view (see the note on
  // seatHoldsFarSupplyTile) where `playerHasPlaceableFarTile` is always false.
  const canPlaceFar = seatHoldsFarSupplyTile(state, hero.controllerId);
  const faceDownFar = Object.values(adventure.tiles).filter(
    (candidate) => candidate.faceDown && candidate.group === "far",
  );
  if (!canPlaceFar && faceDownFar.length === 0) return false;

  const rotated: MapTileState = { ...tile, rotation, awaitingRotation: false };
  const fields = { ...adventure.fields };
  const probeAdventure = {
    ...adventure,
    fields,
    tiles: { ...adventure.tiles, [tile.id]: rotated },
  };
  materializeTileFields(probeAdventure, rotated, { onlyRing: true });
  const probeState = { ...state, adventure: probeAdventure } as GameState;

  for (const cell of tileFootprint(
    { row: tile.centerRow, col: tile.centerCol },
    rotation,
  )) {
    const spaceId = hexSpaceId(cell);
    const field = fields[spaceId];
    if (!field || locationDefinitions[field.location]?.category === "blocked") {
      continue;
    }
    // The doorway must be one the hero can actually WALK to (printed internal
    // borders / blocked fields can pocket a ring hex off from the centre).
    if (
      spaceId !== hero.spaceId &&
      distanceFromHeroTo(probeState, hero, spaceId) === undefined
    ) {
      continue;
    }
    const probe: HeroState = { ...hero, spaceId };
    for (const target of faceDownFar) {
      if (canHeroImmediatelyAccessAdjacentTile(probeState, probe, target)) {
        return true;
      }
    }
    if (
      canPlaceFar &&
      farTilePlacementCenters(probeState, probe, undefined, {
        requireImmediateAccess: true,
      }).length > 0
    ) {
      return true;
    }
  }
  return false;
}

/** Whether a payoff field itself is an open doorway into revealed/new land. */
export function isImmediateExpansionDoorway(
  state: GameState,
  hero: HeroState,
  spaceId: MapSpaceId,
): boolean {
  const probe = { ...hero, spaceId };
  for (const tile of Object.values(state.adventure?.tiles ?? {})) {
    if (tile.faceDown && canHeroImmediatelyAccessAdjacentTile(state, probe, tile)) {
      return true;
    }
  }
  return Boolean(
    seatHoldsFarSupplyTile(state, hero.controllerId) &&
      farTilePlacementCenters(state, probe, undefined, {
        requireImmediateAccess: true,
      }).length > 0
  );
}

/**
 * How many objects of `order` the hero can actually WALK ONTO and resolve with
 * the movement it has right now. Two movement facts of the stock tile-Ⅰ opening
 * are modelled exactly, because they decide whether a route banks one or two:
 *
 *  - ENTRY needs `distance + reserve` movement: a live guard is only enterable
 *    with the combat movement reserve still in hand (`premiumCombatMovementReserve`
 *    — the same gate the reducer and move scoring apply). A free symbol needs no
 *    reserve.
 *  - RESOLVING it spends only the `distance`: the difficulty-1 home guards are
 *    fights the opening army wins inside combat round 1 (or takes as a flawless
 *    guaranteed win), so the reserved continuation movement is not actually
 *    spent and the walk continues to the next stop with just the travel gone.
 *
 * The old abstract distance sum ignored the entry reserve, so a free-symbol-first
 * order scored as "banks two" although its second stop was a guard the leftover
 * point could never open: the hero grabbed the symbol, walked back toward the
 * guard, and ended round 1 one field short with a single capture (the observed
 * Castle / Necropolis / Cove opening). Walking the order with the real entry
 * gate makes the fight-first pair — the one that truly banks two — win the
 * `banked * 20_000` term.
 */
function bankableHomeObjectives(
  state: GameState,
  hero: HeroState,
  order: ReadonlyArray<MapObjective>,
  movement: number,
): number {
  let mp = movement;
  let from = hero.spaceId;
  if (!from) return 0;
  let banked = 0;
  for (const objective of order) {
    const leg = from === hero.spaceId
      ? distanceFromHeroTo(state, hero, objective.spaceId)
      : distanceBetweenHomeFields(state, hero, from, objective.spaceId);
    if (leg === undefined) break;
    const field = state.adventure?.fields[objective.spaceId];
    const reserve = field ? premiumCombatMovementReserve(state, hero, field) : 0;
    if (mp < leg + reserve) break;
    mp -= leg;
    from = objective.spaceId;
    banked += 1;
  }
  return banked;
}

/**
 * Opening route on tile I. With three objects, choose a first-turn path that
 * BANKS as many objects as the movement really allows (reserve-aware, see
 * `bankableHomeObjectives`) — for the stock two-guards-plus-free-symbol layouts
 * that is the fight-first pair the user's traditional opening asks for. Among
 * equally banking orders, leave the expansion-doorway object LAST so round 2
 * finishes the third object and opens new land, and keep the two-turn route
 * short. Re-run after each pickup so the plan survives each visit/combat.
 */
function bestHomeOpeningObjective(
  state: GameState,
  hero: HeroState,
  remaining: ReadonlyArray<MapObjective>,
): MapObjective | null {
  if (remaining.length < 2 || remaining.length > 3 || !hero.spaceId) return null;
  const movement = Math.max(0, hero.movementPoints ?? 0);
  let best: MapObjective[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestBanked = 0;
  for (const order of objectiveOrders(remaining)) {
    const firstDistance = distanceFromHeroTo(state, hero, order[0].spaceId);
    if (firstDistance === undefined) continue;
    const secondDistance = distanceBetweenHomeFields(
      state,
      hero,
      order[0].spaceId,
      order[1].spaceId,
    );
    if (secondDistance === undefined) continue;
    const final = order[order.length - 1];
    const finalIsDoorway = isImmediateExpansionDoorway(
      state,
      hero,
      final.spaceId,
    );
    const futureDistance = remaining.length === 3
      ? distanceBetweenHomeFields(state, hero, order[1].spaceId, final.spaceId)
      : secondDistance;
    if (futureDistance === undefined) continue;
    // Objects this order walks onto with the CURRENT movement points, honouring
    // each guarded stop's combat movement reserve (reserve-aware count).
    const banked = bankableHomeObjectives(state, hero, order, movement);
    const score =
      banked * 20_000 +
      (finalIsDoorway ? 10_000 : 0) -
      futureDistance * 100 -
      (firstDistance + secondDistance) * 5;
    if (
      !best ||
      score > bestScore ||
      (score === bestScore && order[0].spaceId.localeCompare(best[0].spaceId) < 0)
    ) {
      best = order;
      bestScore = score;
      bestBanked = banked;
    }
  }
  // The three-object opening must be able to bank the first two this turn;
  // otherwise the general planner picks (unchanged fallback).
  if (!best || (remaining.length === 3 && bestBanked < 2)) return null;
  return best[0];
}

/**
 * Keep the committed march target when it is still worth marching to.
 *
 * `stickySpaceId` survives only while it remains an objective in `pool`, stays
 * reachable, and no other reachable objective is MATERIALLY better: small value
 * fluctuations (a resource just picked up, one step of travel decay) must not
 * re-point the route. A premium economy fight before round 6 and a free seizure
 * already inside this turn's walking reach break it on a lower bar — scooping
 * free value and hitting the economy window are the standing golden rules.
 *
 * Extracted so every sticky read in the cascade shares one answer to "is this
 * commitment still the plan?" — two different readings would alternate and the
 * hero would shuffle.
 */
function stickyObjectiveIfStillBest(
  state: GameState,
  hero: HeroState,
  pool: ReadonlyArray<MapObjective>,
  stickySpaceId: MapSpaceId,
  fightAvailable: boolean,
): MapObjective | null {
  const sticky = pool.find((objective) => objective.spaceId === stickySpaceId);
  if (!sticky) return null;
  const stickyField = state.adventure?.fields[sticky.spaceId];
  const stickyDistance = distanceFromHeroTo(state, hero, sticky.spaceId);
  const stickyValue = stickyDistance === undefined
    ? Number.NEGATIVE_INFINITY
    : objectiveStrategicValue(state, hero, sticky, stickyDistance, fightAvailable);
  const higher = pool.find((objective) => {
    const distance = distanceFromHeroTo(state, hero, objective.spaceId);
    if (distance === undefined) return false;
    const value = objectiveStrategicValue(
      state,
      hero,
      objective,
      distance,
      fightAvailable,
    );
    const objectiveField = state.adventure?.fields[objective.spaceId];
    const premiumBreak =
      objectiveField &&
      isPremiumEconomyField(objectiveField) &&
      objective.kind === "guard" &&
      (state.round ?? 0) < 6 &&
      !(
        stickyField &&
        isPremiumEconomyField(stickyField) &&
        sticky.kind === "guard"
      );
    const freeSeizeBreak =
      isFreeSeizeObjective(objective, state) &&
      (sticky.kind === "guard" ||
        sticky.kind === "enemy-hero" ||
        sticky.kind === "explore") &&
      distance <= Math.max(0, hero.movementPoints ?? 0);
    return (
      value > stickyValue + (premiumBreak || freeSeizeBreak ? 40 : 90)
    );
  });
  // Unreachable sticky (e.g. explore doorway sealed behind a yellow border
  // the hero cannot cross without Pathfinding, or a fight we can no longer
  // reach) must drop — otherwise the AI parks forever on an END_TURN with a
  // dead commit. Reachability uses the same walk graph as the march BFS.
  const stickyReachable = stickyDistance !== undefined;
  return !higher && stickyReachable ? sticky : null;
}

export function primaryMapObjective(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective> = collectMapObjectives(state, hero),
  stickySpaceId?: MapSpaceId | null,
): MapObjective | null {
  return mapScoringCached(state,
    `primary|${stickySpaceId ?? ""}|${heroCacheKey(hero)}|${objectivesCacheKey(objectives)}`,
    () => primaryMapObjectiveUncached(state, hero, objectives, stickySpaceId));
}

function primaryMapObjectiveUncached(
  state: GameState,
  hero: HeroState,
  objectives: ReadonlyArray<MapObjective>,
  stickySpaceId: MapSpaceId | null | undefined,
): MapObjective | null {
  if (objectives.length === 0) {
    return null;
  }
  // A sealed home reward must not hide every reachable target elsewhere.
  // Peaceful one-use visits (temple, shrine, learning stone …) are passable
  // stops — the hero resolves the visit and keeps walking with its remaining
  // movement (engine behaviour, see MOVE → RESOLVE_VISIT_STEP → MOVE in the
  // traces) — so reachability reads the visit-passing graph. Measured
  // (Dungeon seed eval-22, R7): the only Trading Post, four cells away behind
  // a shrine, was "unreachable" under the strict graph, so the funded
  // dwelling rush never marched and the Gold dwelling waited for income to R9.
  const reachable = objectives.filter((objective) =>
    distanceFromHeroTo(state, hero, objective.spaceId, true) !== undefined,
  );
  // Staging is only a fallback. Do not camp at a fight we cannot start while
  // reachable pickups or expansion doorways can still improve the position.
  let actionable = reachable.filter((objective) => {
    const field = state.adventure?.fields[objective.spaceId];
    return !field ||
      (!isFieldGuarded(field) && field.location !== "creature_bank") ||
      canBeatGuardedField(state, hero, field);
  });
  // Only an immediate, unfavourable player encounter can change the normal
  // route. Prefer an existing productive objective outside that opponent's
  // next movement reach; if none exists, retain the normal plan rather than
  // inventing an idle retreat or a new exploration requirement.
  if (hero.spaceId && hero.kind === "main") {
    const incoming = Object.values(state.heroes ?? {}).filter(enemy =>
      enemy.spaceId && enemy.controllerId !== "neutrals" &&
      !state.players[enemy.controllerId]?.eliminated &&
      !playersAreAllied(state, hero.controllerId, enemy.controllerId) &&
      (pvpReach(state, enemy, true).has(hero.spaceId!) || pvpReach(state, hero).has(enemy.spaceId)) &&
      !shouldEngageEnemy(state, hero.controllerId, enemy.controllerId));
    if (incoming.length) {
      const safe = actionable.filter(objective => pvpReach(state, hero).has(objective.spaceId) &&
        (locationDefinitions[state.adventure?.fields[objective.spaceId]?.location ?? ""]?.passive?.protectsFromAttack ||
          incoming.every(enemy => !pvpReach(state, enemy, true).has(objective.spaceId))));
      if (safe.length) {
        actionable = safe;
        // Income overrides below also read this pool. Keep the detour finite:
        // a currently reachable payoff, not a march across the map to hide.
        objectives = safe;
      }
    }
  }
  const available = actionable.length > 0 ? actionable : reachable;
  // During rounds 1–2, sweep reachable home rewards before expanding. Later
  // returns retain normal reward value without restarting the opening.
  const homeRemaining = available.filter((objective) =>
    isHomeTileSweepObjective(state, hero, objective),
  );
  const pool = homeRemaining.length > 0 ? homeRemaining : available;
  const openingRemaining = homeRemaining.filter((objective) =>
    isHomeTileOpeningObjective(state, hero, objective),
  );
  const openingObjective = openingRemaining.length === homeRemaining.length
    ? bestHomeOpeningObjective(state, hero, openingRemaining)
    : null;

  // "Can we fight anything at all?" — when no beatable guard / enemy hero is
  // listed, explore objectives get a boost so the hero opens new land instead
  // of idling (see objectiveStrategicValue). Derived from `pool`, which does
  // not change below.
  const fightAvailable = pool.some(
    (objective) => objective.kind === "guard" || objective.kind === "enemy-hero",
  );

  // Early information is worth a short legal approach when held Far supply
  // remains. No supply means this branch does nothing; normal income/pickups
  // and attainable exploration continue below.
  // BUT (user 2026-09-18, live tutoring): do NOT open a fresh Far tile when a
  // reachable, BEATABLE premium-economy mine (gold/valuables) is already on the
  // board — marching to it now beats opening new land and then backtracking to
  // the mine (terrible routing). The premium capture / general ranking below take it.
  const beatablePremiumGuardReachable = actionable.some((objective) => {
    if (objective.kind !== "guard") return false;
    const guardField = state.adventure?.fields[objective.spaceId];
    return Boolean(guardField && isPremiumEconomyField(guardField) &&
      (guardField.difficulty ?? 0) > 0 &&
      canBeatGuardedField(state, hero, guardField));
  });
  if (hero.kind === "main" && homeRemaining.length === 0 && state.round >= 2 && state.round <= 3 &&
      !beatablePremiumGuardReachable &&
      seatHoldsFarSupplyTile(state, hero.controllerId) &&
      (state.adventure?.farTilesOpenedByPlayer?.[hero.controllerId] ?? 0) < 2) {
    const doorways = actionable.filter(objective => objective.kind === "explore" && objective.opensFarTile &&
      (distanceFromHeroTo(state, hero, objective.spaceId) ?? Infinity) < heroMovementMax(state, hero));
    const doorway = bestObjectiveOf(state, hero, doorways, false);
    if (doorway) return doorway;
  }

  // A difficult Far III is not the only route to income and experience.
  // Before committing a Bronze army without its spell hand, take a nearby
  // beatable II first. Revealed public difficulty only; no guard-deck peeking.
  if (hero.kind === "main" && homeRemaining.length === 0 && state.round <= 5) {
    const player = state.players[hero.controllerId];
    const bronzeOnly = player.army.every(unit => coreUnitDefinitions[unit.unitDefId]?.tier === "bronze");
    // Computer combat start grants a plain Arrow and Power in every battle.
    // Knowledge is not required to cast that spell; missing a natural duplicate
    // must not force a ready army away from a beatable Far objective.
    const spellReady = isComputerPlayer(state, hero.controllerId) ||
      ([...player.hand, ...(player.spellBook ?? [])].includes("spell.magic_arrow") &&
        player.hand.includes("stat.power"));
    if (bronzeOnly && !spellReady) {
      const easier = actionable.filter(objective => {
        const field = state.adventure?.fields[objective.spaceId];
        return field && (field.difficulty ?? 0) === 2 &&
          (objective.kind === "guard" || objective.kind === "flaggable") &&
          (distanceFromHeroTo(state, hero, objective.spaceId, true) ?? Infinity) <= heroMovementMax(state, hero) &&
          (!isFieldGuarded(field) || canBeatGuardedField(state, hero, field));
      });
      const income = easier.filter(objective => {
        const field = state.adventure!.fields[objective.spaceId];
        return field.location === "mine" || field.location === "settlement";
      });
      const preferred = income.length ? income : easier;
      if (preferred.length) return preferred.find(objective => objective.spaceId === stickySpaceId) ??
        bestObjectiveOf(state, hero, preferred, true, true);
    }
  }

  // Far guards below our level no longer pay XP. Once the opening economy
  // supports expansion, stop letting endless income/funding overrides preempt
  // the main hero's growth. Only choose reachable, currently beatable fights;
  // discoveries use the same public band/access gates as ordinary navigation.
  // Do NOT pivot to XP growth while the seat is still saving resources for its
  // gold-ladder milestone (the gold dwelling wants 10 gold / 9 materials / 4
  // valuables, then the gold body ~19-22 gold + 1 valuable). Growth preempts the
  // resource-funding (below) and far-economy capture blocks, so the hero would
  // march for XP the moment ~2 far tiles are secured and never gather the
  // valuables the gold dwelling needs. Keep gathering until the targets are met
  // (or no Gold recruit remains); the growth march resumes unchanged then.
  // Gate at the CALL SITE only — heroReadyForGrowth itself is unchanged so its
  // other users (growth-tile band) keep their behaviour.
  const goldEconomyTargets = developmentResourceTargets(state, hero.controllerId);
  const goldEconomyRes = state.players[hero.controllerId]?.resources;
  const missingGoldRecruit = nextGoldLadderStep(state, hero.controllerId)?.kind === "recruit";
  const savingForGoldEconomy = (!hasGoldArmy(state, hero.controllerId) || missingGoldRecruit) && goldEconomyRes !== undefined &&
    ((goldEconomyRes.valuables ?? 0) < (goldEconomyTargets.valuables ?? 0) ||
      (goldEconomyRes.buildingMaterials ?? 0) < (goldEconomyTargets.buildingMaterials ?? 0) ||
      (goldEconomyRes.gold ?? 0) < (goldEconomyTargets.gold ?? 0));
  if (heroReadyForGrowth(state, hero) && homeRemaining.length === 0 && !savingForGoldEconomy) {
    const progression = actionable.filter(objective => {
      const field = state.adventure?.fields[objective.spaceId];
      if (!field || field.noExperience) return false;
      if (objective.kind === "guard") return !fieldCreatureBankId(field) &&
        !isBankStyleGuardLocation(field.location) && !isTeleportObjectGuardLocation(field.location) &&
        (field.difficulty ?? 0) >= hero.level;
      return objective.kind === "visitable" &&
        ["learning_stone", "tree_of_knowledge"].includes(field.location);
    });
    // Do not march across the map for XP while a nearby frontier can offer it.
    const nearby = progression.filter(objective =>
      (distanceFromHeroTo(state, hero, objective.spaceId) ?? Infinity) <= heroMovementMax(state, hero) * 2);
    const doorways = actionable.filter(objective => objective.kind === "explore");
    const growthDoorways = doorways.filter(objective => objective.opensGrowthTile);
    const expansion = growthDoorways.length > 0 ? growthDoorways : doorways.filter(objective => !objective.opensFarTile);
    const growth = nearby.length > 0 ? nearby : expansion.length > 0 ? expansion : progression;
    if (growth.length > 0) return growth.find(objective => objective.spaceId === stickySpaceId) ??
      bestObjectiveOf(state, hero, growth, nearby.length > 0);
  }

  // A Trading Post that completes the saved Gold recruit (or a feasible
  // dwelling rush) on THIS visit outranks gathering more resources: the trade
  // finishes the milestone now. Measured (impossible, 4 seats): a seat parked
  // on 24 gold for two Resource Rounds, one valuable short of its level-7
  // body, while a Trading Post stood two fields away. Reach = this turn's
  // movement plus one refresh, so a far-off post never hijacks the march.
  if (hero.kind === "main" && homeRemaining.length === 0 &&
      (savedPurchaseNeedsMarket(state, hero.controllerId) || assessDwellingRush(state, hero.controllerId)?.feasible)) {
    const posts = actionable
      .filter((objective) => {
        const field = state.adventure?.fields[objective.spaceId];
        // Only the Trading Post trades resources; a War Machine Factory is a
        // market that cannot close any resource gap (measured re-visit loop).
        return Boolean(field && objective.kind === "visitable" && field.location === "trading_post");
      })
      .map((objective) => ({
        objective,
        distance: distanceFromHeroTo(state, hero, objective.spaceId, true) ?? Infinity,
      }))
      .filter((entry) => entry.distance <= hero.movementPoints + heroMovementMax(state, hero))
      .sort((a, b) => a.distance - b.distance);
    if (posts.length > 0) return posts[0].objective;
  }

  // Fund the next army milestone with attainable resources: Silver after
  // the first Far capture, then the Gold dwelling/recruit/upgrade ladder.
  // Gate on STICKY-INDEPENDENT facts only: needsPremiumSilverBreakthrough's
  // committed-target branch reads the sticky objective this block would then
  // overwrite with a resource source, flipping the predicate every decision
  // (the known gate-oscillation stall class).
  if (hero.kind === "main" && homeRemaining.length === 0 &&
      (missingGoldRecruit || (state.computerMemory?.[hero.controllerId]?.settlementLossStreak ?? 0) >= 2 ||
        securedFarTileIds(state, hero.controllerId).size > 0)) {
    const targets = developmentResourceTargets(state, hero.controllerId);
    const resources = state.players[hero.controllerId].resources;
    // Weigh each shortage by the Resource Rounds of income it still needs, not
    // by raw units: on 15 gold / 1 valuable income a 16-gold gap closes next
    // round while a 3-valuable gap takes three, so the valuables source must
    // win (measured: gold sources tied valuables at the 12 cap, and seats
    // parked on 39–52 gold waiting for valuables — USER RULING 2026-09-16).
    const urgency = resourceUrgency(state, hero.controllerId);
    let valuablesSupplierFound = false;
    const fundingCandidates = actionable.flatMap(objective => {
        const field = state.adventure?.fields[objective.spaceId];
        if (!field || objective.kind === "explore") return [];
        const distance = distanceFromHeroTo(state, hero, objective.spaceId, true);
        if (distance === undefined) return [];
        let benefit = 0;
        for (const resource of ["valuables", "buildingMaterials", "gold"] as const) {
          const deficit = targets[resource] - resources[resource];
          if (deficit <= 0) continue;
          if (!fieldSuppliesResource(state, hero.controllerId, field, resource)) continue;
          if (resource === "valuables") valuablesSupplierFound = true;
          benefit = Math.max(benefit, Math.min(12, Math.round(urgency[resource] * 4) +
            Math.min(4, deficit * (resource === "valuables" ? 2 : 1))));
        }
        if (benefit === 0) return [];
        const travel = distance + premiumCombatMovementReserve(state, hero, field);
        const turns = Math.max(0, Math.ceil((travel - hero.movementPoints) / Math.max(1, heroMovementMax(state, hero))));
        // Compare all shortages together. A distant valuables source must not
        // preempt reachable gold/materials every turn just because it is first
        // in an array. Captures also add recurring income to the same budget.
        const income = field.location === "mine" || field.location === "settlement";
        const score = (benefit + (income ? 8 : 0)) / (1 + turns) - travel * 0.25 +
          (objective.spaceId === stickySpaceId ? 1 : 0);
        return [{ objective, score }];
    });
    fundingCandidates.sort((a, b) => b.score - a.score || a.objective.spaceId.localeCompare(b.objective.spaceId));
    // Valuables-starved with no known valuables source: the productive move
    // is to REVEAL one — near/deeper tiles, their creature banks and mines
    // (USER RULING 2026-09-16: "explore more, near tiles or other, fight
    // creature banks"). shouldDeferExpansionTile lifts the band deferral for
    // this seat, so the explore objectives here include those bands.
    // A Trading Post that can close the gap from the gold surplus (rush plan /
    // Gold-step plan, handled by the market branch below) beats revealing land:
    // measured (Dungeon seed eval-22, R7, 31 gold, 2 of 4 valuables, post four
    // cells away) the explore push fired first and the dwelling waited to R9.
    const marketCanClose = (savedPurchaseNeedsMarket(state, hero.controllerId) ||
        assessDwellingRush(state, hero.controllerId)?.feasible) &&
      actionable.some(objective => {
        const field = state.adventure?.fields[objective.spaceId];
        return Boolean(field && objective.kind === "visitable" && field.location === "trading_post") &&
          (distanceFromHeroTo(state, hero, objective.spaceId, true) ?? Infinity) <=
            hero.movementPoints + heroMovementMax(state, hero);
      });
    if (!valuablesSupplierFound && !marketCanClose && valuablesStarved(state, hero.controllerId)) {
      const doorways = actionable.filter(objective => objective.kind === "explore");
      const doorway = doorways.find(objective => objective.spaceId === stickySpaceId) ??
        bestObjectiveOf(state, hero, doorways, false);
      if (doorway) return doorway;
    }
    if (fundingCandidates.length > 0) return fundingCandidates[0].objective;
  }

  // FAR II–III income is the opening objective, starting as soon as the army
  // can fight (including rounds 2–3). Pick an actionable Settlement first,
  // then gold/valuables mines, before a sticky trinket, shop or conquest march.
  // Keep this on the AI's target path: shared movement and battle legality are
  // unchanged, and unreachable/unbeatable guards were filtered above.
  if (hero.kind === "main" && homeRemaining.length === 0 && !hasGoldArmy(state, hero.controllerId)) {
    const sweep = objectives.filter(objective => {
      const field = state.adventure?.fields[objective.spaceId];
      return field && isOpeningFarSweepField(state, hero.controllerId, field) &&
        (objective.kind === "guard" || isFreeSeizeObjective(objective, state)) &&
        (!isFieldGuarded(field) || canBeatGuardedField(state, hero, field)) &&
        distanceFromHeroTo(state, hero, objective.spaceId, true) !== undefined;
    });
    const captures = sweep.filter(objective => {
      const field = state.adventure!.fields[objective.spaceId];
      return field.location === "settlement" || field.location === "mine";
    });
    // The sweep used to return before the round-four scheduling below, so
    // a distant sticky settlement could silently defeat the opening deadline.
    const attackRound = (objective: MapObjective) => {
      const field = state.adventure!.fields[objective.spaceId];
      const distance = distanceFromHeroTo(state, hero, objective.spaceId, true) ?? Infinity;
      return state.round + Math.max(0, Math.ceil((distance + premiumCombatMovementReserve(state, hero, field) -
        hero.movementPoints) / Math.max(1, heroMovementMax(state, hero))));
    };
    const earliest = Math.min(...captures.map(attackRound));
    // A round-2 capture beats waiting until round 4 for an equal-quality
    // holding. Allow one turn for a better income type, within the deadline.
    const timely = captures.filter(objective => attackRound(objective) <= Math.min(Math.max(4, earliest), earliest + 1));
    const premium = timely.filter(objective => isPremiumEconomyField(state.adventure!.fields[objective.spaceId]));
    const settlements = premium.filter(objective => state.adventure!.fields[objective.spaceId].location === "settlement");
    const remaining = settlements.length > 0 ? settlements : premium.length > 0 ? premium : timely.length > 0 ? timely : sweep;
    if (remaining.length > 0) return remaining.find(objective => objective.spaceId === stickySpaceId) ??
      bestObjectiveOf(state, hero, remaining, true, true);
  }
  if (hero.kind === "main" && homeRemaining.length === 0) {
    const secured = new Set<string>();
    let securedSettlements = 0;
    const settlementTarget = hasGoldArmy(state, hero.controllerId) ? 1 : 2;
    for (const field of Object.values(state.adventure?.fields ?? {})) {
      const tile = field.tileInstanceId && state.adventure?.tiles[field.tileInstanceId];
      if (field.flagOwnerId !== hero.controllerId || !tile || tile.group !== "far" || tile.faceDown) continue;
      if (field.location === "settlement") {
        secured.add("settlement");
        securedSettlements++;
      }
      else if (field.location === "mine" && field.resource) secured.add(field.resource);
    }
    const farEconomy = objectives.filter(objective => {
      if (objective.kind !== "guard" && objective.kind !== "flaggable") return false;
      const field = state.adventure?.fields[objective.spaceId];
      const tile = field?.tileInstanceId && state.adventure?.tiles[field.tileInstanceId];
      return field && tile && tile.group === "far" && !tile.faceDown &&
        isPremiumEconomyField(field) &&
        distanceFromHeroTo(state, hero, objective.spaceId, true) !== undefined &&
        (!isFieldGuarded(field) || canBeatGuardedField(state, hero, field));
    });
    // Remaining MP changes on every step. Do not let a recalculated attack
    // round reverse a live march toward income we still lack.
    const committedIncome = farEconomy.find(objective => {
      if (objective.spaceId !== stickySpaceId) return false;
      const field = state.adventure!.fields[objective.spaceId];
      return field.location === "settlement" ? securedSettlements < settlementTarget :
        !secured.has(field.resource!) && (settlementTarget === 1 || securedSettlements >= settlementTarget ||
          !farEconomy.some(candidate => state.adventure?.fields[candidate.spaceId]?.location === "settlement"));
    });
    if (committedIncome) return committedIncome;
    // Prefer a capture by round 4 over a Settlement that cannot be reached
    // by then. After the deadline, use the earliest available attack turn.
    // This is a route estimate, never permission to enter an unready fight.
    const attackRound = (objective: MapObjective) => {
      const field = state.adventure!.fields[objective.spaceId];
      const distance = distanceFromHeroTo(state, hero, objective.spaceId, true) ?? Infinity;
      const reserve = premiumCombatMovementReserve(state, hero, field);
      return state.round + Math.max(0, Math.ceil(
        (distance + reserve - hero.movementPoints) / Math.max(1, heroMovementMax(state, hero)),
      ));
    };
    const schedule = farEconomy.map(objective => ({ objective, round: attackRound(objective) }));
    const earliest = Math.min(...schedule.map(candidate => candidate.round));
    const timely = schedule.filter(candidate => candidate.round <= Math.min(Math.max(4, earliest), earliest + 1))
      .map(candidate => candidate.objective);
    // Prefer settlements only inside the early-capture schedule. A distant
    // second settlement must not displace reachable premium income.
    const timelySettlements = timely.filter(objective =>
      state.adventure?.fields[objective.spaceId]?.location === "settlement",
    );
    const settlements = timelySettlements;
    const newMines = timely.filter(objective => {
      const field = state.adventure!.fields[objective.spaceId];
      return field.location === "mine" && field.resource && !secured.has(field.resource);
    });
    const captures = securedSettlements < settlementTarget && settlements.length > 0 ? settlements :
      newMines.length > 0 ? newMines : timely;
    if (captures.length > 0) {
      return captures.find(objective => objective.spaceId === stickySpaceId) ??
        bestObjectiveOf(state, hero, captures, true, true);
    }
  }

  if (openingObjective) return openingObjective;

  // The post-Gold collector consumes existing leftovers before opening more
  // land. It must not chase the main hero's current objective.
  if (hero.kind === "secondary" && hasReachedGoldArmy(state, hero.controllerId)) {
    const mainTarget = state.computerMemory?.[hero.controllerId]?.stickyObjectiveSpaceId;
    // "town" passes isFreeSeizeObjective but is an enemy town — a siege, not a
    // leftover pickup for the fresh collector.
    const leftovers = actionable.filter(objective =>
      objective.spaceId !== mainTarget && objective.kind !== "town" &&
      (isFreeSeizeObjective(objective, state) ||
        (isMarketLocation(state.adventure?.fields[objective.spaceId]?.location ?? "") &&
          (wantsMarketVisit(state, hero.controllerId, state.adventure?.fields[objective.spaceId]?.location) ||
            premiumRecruitMarketVisit(state, hero.controllerId,
              state.adventure?.fields[objective.spaceId]?.location, objective.spaceId)))));
    if (leftovers.length > 0) return bestObjectiveOf(state, hero, leftovers, false);
  }

  // After the two-turn home opening, find income land before spending another
  // turn on home leftovers. A known attainable FAR capture returned above.
  if (hero.kind === "main" && state.round >= 3 && !hasOpenedFarEconomy(state, hero.controllerId)) {
    const incomeDoorways = available.filter(objective => objective.kind === "explore" && objective.opensFarTile);
    if (incomeDoorways.length > 0) {
      return incomeDoorways.find(objective => objective.spaceId === stickySpaceId) ??
        bestObjectiveOf(state, hero, incomeDoorways, false);
    }
  }

  // FREE SEIZE THIS TURN: scoop unguarded mines / symbols / settlements before
  // locking a fight sticky or trekking to a fair battle. Map is full of free
  // paths — taking them is the intelligent play, not "wait then fight".
  if (homeRemaining.length === 0) {
    const freeNow = freeSeizuresWithinReach(state, hero, pool);
    if (freeNow.length > 0) {
      const stickyIsFree =
        Boolean(stickySpaceId) &&
        freeNow.some((objective) => objective.spaceId === stickySpaceId);
      // The runner records this objective, then movement scoring reads it
      // again. Returning a different target merely because it is now sticky
      // made those two reads alternate and sent the hero back and forth.
      if (stickyIsFree) return freeNow.find(objective => objective.spaceId === stickySpaceId)!;
      if (!stickyIsFree) {
        const bestFree = bestObjectiveOf(state, hero, freeNow, fightAvailable);
        if (bestFree) {
          const freeDistance =
            distanceFromHeroTo(state, hero, bestFree.spaceId) ?? 0;
          const divertingFight = pool.find((objective) =>
            fightOutranksFreeSeize(state, hero, objective, freeDistance),
          );
          if (!divertingFight) {
            return bestFree;
          }
        }
      }
    }
  }

  // Sticky only applies once the home tile is drained — a sticky Far/victory
  // target must not yank the hero off tile Ⅰ mid-sweep.
  if (stickySpaceId && homeRemaining.length === 0) {
    // Change plans only for a materially better reachable objective; small
    // value fluctuations keep the existing march stable across turns.
    // Premium economy fights break sticky early (unit-loss trades are fine;
    // missing the pre-round-6 window is not). Free seizures within reach
    // also break a fight sticky (low bar — scoop free value on the way).
    const sticky = stickyObjectiveIfStillBest(
      state,
      hero,
      pool,
      stickySpaceId,
      fightAvailable,
    );
    if (sticky) {
      return sticky;
    }
  }

  let best: MapObjective | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const objective of pool) {
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
