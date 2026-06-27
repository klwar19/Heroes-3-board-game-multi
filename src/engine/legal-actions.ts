import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { isMarketLocation, locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { sampleBuildings } from "@/data/towns/buildings";
import {
  adventurePvpTroopLoss,
  applyBestRecruitDiscount,
  armyHasMapEffect,
  canHeroReachPlacedTile,
  capturableEnemyMinesWithin,
  legionDiscountTargets,
  reinforceCostFor,
  getActiveAstrologersCard,
  getMainHero,
  getSecondaryHero,
  getTownOfPlayer,
  getUnitSide,
  hasRecruitResources,
  hasResources as playerHasResources,
  humanPlayerIds,
  isSeaField,
  NEUTRAL_DECK_IDS,
  RESOURCE_GAIN_LEVEL_AMOUNTS,
  SURRENDER_GOLD_COST,
  townHasBuildingEffect,
  unlockedRecruitTiers
} from "./adventure";
import {
  placementCellsFor,
  getHeroMoveDestinations,
  hillFortCost,
  inCombatPrep,
  isDefendingOwnFactionTown,
  canHeroDiscoverAdjacentTile,
  isTileRotationConnected,
  observatoryPlacementCenters,
  observatoryRevealTargets,
  removableHandCards
} from "./adventure-reducer";
import {
  effectAppliesToUnit,
  effectiveInitiative,
  getSchoolPowerBonus,
  getSchoolPowerMultiplier,
  getSpellCastRestriction,
  playerCannotSurrenderCombat,
  playerHasSpellTimingFreedom,
  unitAttackRollDisadvantaged,
  unitImmuneToSpellSchoolsByEffect,
  unitIsBerserk
} from "./active-effects";
import { cancelSpellAllowsSchoolAndLevel, cardCanBoostPower, spellPowerValueOfCard } from "./effects";
import { RUNE_MAX } from "./runes";
import {
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldDistance,
  getBattlefieldLabel,
  getOrthogonalNeighbors,
  getReachableDestinations,
  isAdjacent,
  isBattlefieldPosition
} from "./battlefield";
import {
  countBallistas,
  firstAidVolleyHeals,
  getPermanentCardIds,
  getPermanentSchoolBonus,
  permanentSpellPowerBonus,
  playerCanUseFirstAidVolley,
  warMachinesForSale
} from "./permanents";
import { getDemolishAbility, isArrowTowerUnit, parseFortificationTargetId, siegeBlockedPositions } from "./siege";
import { pvpEscapeWindowOpen } from "./combat-units";
import { canPlaceTransformOn } from "./unit-transforms";
import { SHARED_DECK_IDS } from "./decks";
import {
  abilityExpertIsCrownFree,
  activeSchoolFetches,
  canPlayExpertMode,
  deckDisplayName,
  expertUsesAvailable,
  getRuleset,
  spellBookPowerAvailable,
  spellBookRuleEnabled,
  spellCanEnterSpellBook,
  spellLimitFor,
  SPELL_DECK_BASIC,
  SPELL_DECK_EXPERT,
  wisdomGoldDiscount,
  wisdomSearchCount
} from "./ruleset";
import type {
  AttackRerollSource,
  AttackRollMode,
  ActiveEffectState,
  BuildingId,
  BuildingLibrary,
  CardDefinition,
  CardId,
  CardOptionDefinition,
  CardPlayCost,
  CardPlayMode,
  CardLibrary,
  CombatState,
  CombatUnitState,
  EffectDefinition,
  FactionId,
  GameAction,
  GameEvent,
  GameState,
  LegalAction,
  PlayerId,
  PlayerState,
  ResolutionStackItem,
  ResourceCost,
  ResourceKind,
  SpellSchool,
  TargetDefinition,
  TargetRef,
  TownId,
  TriggerDefinition,
  UnitId
} from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import {
  getActivationSpellPowerBoost,
  getDiscardToIgnoreAttackDieAbility,
  getEnemySpellPowerReduction,
  getLethalSaveUnitAbility,
  getUnitAbilityDefinitions,
  hasBindAdjacentEnemies,
  hasSpellCastLock,
  hasSpellCastPowerTax,
  hasUnitAbilityEffect,
  unitImmuneToSpellSchools
} from "./unit-abilities";

type ConcreteEffect = Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;

/**
 * One playable face of a card: regular cards expose a single variant, while
 * "OR" cards expose one variant per printed option.
 */
type CardPlayVariant = {
  trigger?: TriggerDefinition;
  effect: ConcreteEffect;
  optionIndex?: number;
  optionLabel?: string;
  /** Printed extra price (discard/remove cards) of this option. */
  cost?: CardPlayCost;
  /** Option only playable outside combat. */
  mapOnly?: boolean;
  /** Option only playable during combat. */
  combatOnly?: boolean;
  /** Option is the card's expert side (costs a crown). */
  expertOnly?: boolean;
};

export function getCardPlayVariants(card: CardDefinition): CardPlayVariant[] {
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.map((option, optionIndex) => ({
      trigger: option.trigger,
      effect: option.effect,
      optionIndex,
      optionLabel: option.label,
      cost: option.cost,
      mapOnly: option.mapOnly,
      combatOnly: option.combatOnly,
      expertOnly: option.expertOnly
    }));
  }

  return [
    {
      trigger: card.trigger,
      effect: card.effect
    }
  ];
}

/**
 * The "free" spell Power a player brings to a spell from standing sources this
 * turn/round — the once-per-turn Astrologers bonus, the once-per-round active
 * unit (Magi) boost, and a School-of-Magic permanent's basic bonus for the
 * spell's school. Mirrors what `castSpell` seeds onto a freshly cast spell, so
 * a spell played as an instant/reaction (Slayer, Sorrow…) or a Power-value cost
 * (Sorrow's silver/gold) counts the same standing Power a normal cast would.
 */
export function standingSpellPower(state: GameState, playerId: PlayerId, card: CardDefinition): number {
  const player = state.players[playerId];
  // Hero specialties that pay or scale by Power (Deemer's Meteor Shower, the
  // Alamar/Jeddite lethal-saves) draw standing spell Power too — per the wiki
  // their effect "scales directly with spell power, similar to standard spells" /
  // "can be improved by spell power, just like a regular spell". But a Specialty
  // belongs to NO school of magic, so the ONLY standing source it can pick up is
  // the flat, school-agnostic Pandora-style bonus (permanentSpellPowerBonus,
  // below). Everything school-scoped is excluded for a Specialty:
  //   - School-of-Magic permanent — getPermanentSchoolBonus returns null for any
  //     non-Spell card, so it adds nothing here;
  //   - the Magi pack's first-cast boost and Astrologers' first-spell bonus — both
  //     gated to `card.kind === "spell"` below (also avoids double-dipping a
  //     once-per-spell-cast bonus, since a Specialty never increments the spell
  //     counters);
  //   - the Elemental Orbs' school multiplier and the Tomes' SET_SPELL_POWER_MAX
  //     never reach this function at all — they live only in the CAST_SPELL power
  //     pipeline (getCurrentSpellPower / the cast boost window).
  if (!player || (card.kind !== "spell" && card.kind !== "hero-specialty")) {
    return 0;
  }
  let bonus = 0;
  if (card.kind === "spell" && (player.combatStats.spellsCastThisTurn ?? 0) === 0) {
    const astrologers = getActiveAstrologersCard(state);
    if (astrologers?.effect.type === "FIRST_SPELL_POWER_BONUS") {
      bonus += astrologers.effect.amount;
    }
  }
  if (card.kind === "spell" && (player.combatStats.spellsCastThisRound ?? 0) === 0) {
    const combat = state.combat;
    const activeUnit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
    if (activeUnit && activeUnit.controllerId === playerId) {
      // Pass the card's schools so the school-scoped Conflux Pack Elemental boost
      // ("+1 Power to the first <School> Magic spell") is counted for a matching
      // spell — not only the Magi's school-less boost. Without the schools the
      // preview/affordability/pool-scaling paths silently dropped it, disagreeing
      // with the actual cast in performSpellCast.
      bonus += getActivationSpellPowerBoost(activeUnit, card.spellSchools);
    }
  }
  const school = getPermanentSchoolBonus(state, playerId, card);
  if (school) {
    bonus += school.basicPower;
  }
  // Pandora's Bargain: Power — a flat +Power on every spell while in play.
  bonus += permanentSpellPowerBonus(state, playerId);
  return bonus;
}

/** Whether the player can pay an option's card cost from hand right now. */
function canAffordCardCost(state: GameState, playerId: PlayerId, cardId: string, cost?: CardPlayCost): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  // Resource price (Ballistics' expert bombardment): the player must hold it.
  if (cost?.resources && !hasResources(player.resources, cost.resources)) {
    return false;
  }

  if (
    !cost ||
    (cost.discardCards === undefined && cost.discardCardsUpTo === undefined && cost.powerCost === undefined)
  ) {
    return true;
  }

  // The played card itself cannot pay its own cost.
  const rest = [...player.hand];
  const selfIndex = rest.indexOf(cardId);
  if (selfIndex !== -1) {
    rest.splice(selfIndex, 1);
  }

  const eligible =
    cost.costCardFilter === "spell"
      ? rest.filter((id) => cardLibrary[id]?.kind === "spell")
      : cost.costCardFilter === "power-source"
        ? rest.filter((id) => cardCanBoostPower(cardLibrary[id]))
        : rest;

  // Power-value cost (Sorrow): the standing spell Power plus the full printed
  // Power of every eligible power-source card in hand must reach the threshold.
  if (cost.powerCost !== undefined) {
    const card = cardLibrary[cardId];
    const schools = card?.spellSchools ?? [];
    const standing = card ? standingSpellPower(state, playerId, card) : 0;
    const fromCards = eligible.reduce((sum, id) => sum + spellPowerValueOfCard(cardLibrary[id], schools), 0);
    return standing + fromCards >= cost.powerCost;
  }

  const needed = cost.discardCards ?? 0;
  return eligible.length >= needed;
}

/** Grade ordering shared by spell-immunity and Magic Mirror grade gates. */
export function gradeRank(grade: CombatUnitState["grade"]): number {
  return grade === "bronze" ? 0 : grade === "silver" ? 1 : grade === "gold" ? 2 : 3;
}

/**
 * Tier-gate rank of a UNIT (mirrors the reducer): a Creature Bank defender has
 * NO tier (rulebook p.66), so it ranks above every grade and fails every
 * tier-specific spell/specialty gate — it can never be such an effect's target.
 */
function gradeRankOfUnit(unit: CombatUnitState): number {
  return unit.bankUnit ? Number.POSITIVE_INFINITY : gradeRank(unit.grade);
}

/**
 * Whether a card effect (or option effect) gates its target by tier — it carries
 * a `grade` ceiling or a `gradeByPower` ladder. Such an effect can never reach a
 * gradeless Creature Bank defender, so those are dropped from its target list.
 */
function effectIsTierGated(effect: EffectDefinition): boolean {
  return (
    ("gradeByPower" in effect && effect.gradeByPower !== undefined) ||
    ("grade" in effect && effect.grade !== undefined)
  );
}

/**
 * The highest grade a tier-gated effect's ladder can EVER reach, independent of
 * the Power paid — its grade ceiling. No spell ladder climbs above "gold", so an
 * azure-tier unit (gradeRank 3) sits above every ceiling and can never be
 * affected by a tier-gated spell whatever Power is poured in.
 */
function maxTierGateRank(effect: EffectDefinition): number {
  if ("gradeByPower" in effect && effect.gradeByPower) {
    const ranks = Object.values(effect.gradeByPower).map((grade) => gradeRank(grade));
    return ranks.length > 0 ? Math.max(...ranks) : gradeRank("gold");
  }
  if ("grade" in effect && effect.grade !== undefined) {
    return gradeRank(effect.grade);
  }
  return gradeRank("gold");
}

/**
 * Orb of Vulnerability (option A): while its combat-wide effect is on the
 * table, every unit's innate spell-related ability is switched off. Read at
 * each such ability's site so a single grant covers both armies for the Combat.
 */
export function spellAbilitiesSuppressed(state: GameState): boolean {
  return state.activeEffects.some((effect) =>
    effect.modifiers.some((modifier) => modifier.type === "SUPPRESS_SPELL_ABILITIES")
  );
}

/** Whether a unit currently has spell immunity covering its grade. */
export function isUnitSpellImmune(state: GameState, unit: CombatUnitState): boolean {
  return state.activeEffects.some(
    (effect) =>
      // A Gargoyle/Titan that ignores ongoing (Spell) effects ignores an
      // Anti-Magic placed on it too, so it is not made spell-immune by it.
      effectAppliesToUnit(effect, unit) &&
      effect.target?.type === "unit" &&
      effect.target.unitId === unit.id &&
      effect.modifiers.some(
        (modifier) => modifier.type === "UNIT_SPELL_IMMUNE" && gradeRank(unit.grade) <= gradeRank(modifier.maxGrade)
      )
  );
}

/**
 * Magic Mirror: legal new targets for a pending Spell when redirecting it.
 * Any unit of the paid grade or lower (Power 0 → bronze, 1 → silver, 2 → gold),
 * friend or foe, except the unit currently targeted, and never a unit immune to
 * spells of its grade (a spell "cannot be targeted" at an immune unit).
 */
export function spellRedirectTargets(
  state: GameState,
  currentTargetUnitId: UnitId | null,
  maxGrade: CombatUnitState["grade"]
): CombatUnitState[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }
  return Object.values(combat.units).filter(
    (unit) =>
      // `currentTargetUnitId` is null for a space-targeted blast (Inferno), where
      // there is no single "current" unit to exclude — every legal unit qualifies.
      unit.id !== currentTargetUnitId &&
      isUnitAlive(unit) &&
      gradeRank(unit.grade) <= gradeRank(maxGrade) &&
      !isUnitSpellImmune(state, unit)
  );
}

/** Living units standing on any of `positions`. */
function unitsOnPositions(combat: CombatState, positions: Set<number>): UnitId[] {
  return Object.values(combat.units)
    .filter((unit) => isUnitAlive(unit) && positions.has(unit.position))
    .map((unit) => unit.id);
}

/**
 * The units an in-flight area Spell would (or could) damage — the set Magic
 * Mirror reads to decide whether one of your units "is about to be damaged".
 * Computed from the pending cast on the stack, BEFORE the dice are rolled:
 *  - Inferno (space target): every unit on the centre space and its orthogonal
 *    neighbours (all are hit on a "+1").
 *  - Fireball (unit target, AREA_DAMAGE_ADJACENT): the primary target plus every
 *    unit adjacent to it — the caster picks one of those adjacents as the splash,
 *    so any of them is a potential victim while the cast is pending.
 *  - Frost Ring (space target, AREA_DAMAGE_PICK_ADJACENT): the units adjacent to
 *    the centre — plus the centre unit when the ring includes it — friend or foe.
 * Only a Spell CAST qualifies: a hero specialty reusing an area effect (Deemer's
 * Meteor Shower, Xyron's Inferno) is never a Spell, so it is never reflectable.
 * Single-target casts have no splash and return [] (their primary is handled by
 * pendingSpellTargetForPlayer). Chain Lightning's forks are routed at resolution
 * and are intentionally not predicted here.
 */
export function spellPotentialBlastUnitIds(
  state: GameState,
  stackItem: ResolutionStackItem,
  cards: CardLibrary = cardLibrary
): UnitId[] {
  const combat = state.combat;
  if (!combat || stackItem.action.type !== "CAST_SPELL") {
    return [];
  }
  const card = cards[stackItem.action.cardId];
  if (card?.kind !== "spell") {
    return [];
  }
  const effect = card.effect;
  const target = stackItem.action.target;

  // Inferno: the centre space and all orthogonal neighbours.
  if (effect.type === "INFERNO" && target.type === "space") {
    return unitsOnPositions(combat, new Set([target.position, ...getOrthogonalNeighbors(target.position)]));
  }

  // Fireball: the primary unit plus every unit adjacent to it (the caster picks
  // one adjacent as the splash, so all of them are potential victims).
  if (effect.type === "AREA_DAMAGE_ADJACENT" && target.type === "unit") {
    const primary = combat.units[target.unitId];
    if (!primary) {
      return [];
    }
    return Object.values(combat.units)
      .filter(
        (unit) => isUnitAlive(unit) && (unit.id === primary.id || isAdjacent(unit.position, primary.position))
      )
      .map((unit) => unit.id);
  }

  // Frost Ring (and any AREA_DAMAGE_PICK_ADJACENT cast): the centre's orthogonal
  // neighbours, and the centre unit itself only when the effect includes it.
  if (effect.type === "AREA_DAMAGE_PICK_ADJACENT") {
    const centre =
      target.type === "space"
        ? target.position
        : target.type === "unit"
          ? combat.units[target.unitId]?.position
          : undefined;
    if (centre === undefined) {
      return [];
    }
    const blast = new Set<number>(getOrthogonalNeighbors(centre));
    if (effect.includeCenter) {
      blast.add(centre);
    }
    return unitsOnPositions(combat, blast);
  }

  return [];
}

/**
 * An enemy instant combat Spell layered onto the pending attack that lands on a
 * unit `playerId` controls — the case Magic Mirror reflects in an attack window.
 * Only stat instants qualify: Curse (−defense, lands on the defender) and
 * Weakness (−attack, lands on the attacker). Bloodlust/Bless/Precision buff the
 * caster's OWN unit, so their affected unit is never yours; Bless/Slayer are not
 * even ADD_COMBAT_STAT (no single stat to bounce). Returns the most recent match
 * (the one Resistance would also take first), with its index for splicing.
 */
export function reflectableAttackInstantForPlayer(
  state: GameState,
  stackItem: ResolutionStackItem,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary
): { index: number; cardId: CardId; stat: "attack" | "defense"; affectedUnitId: UnitId } | null {
  if (stackItem.action.type !== "ATTACK_UNIT" && stackItem.action.type !== "MOVE_AND_ATTACK_UNIT") {
    return null;
  }
  const combat = state.combat;
  if (!combat) {
    return null;
  }
  const attacker = combat.units[stackItem.action.attackerId];
  const defender = combat.units[stackItem.action.defenderId];
  const instants = stackItem.modifiers.cancellableSpellInstants ?? [];

  for (let index = instants.length - 1; index >= 0; index -= 1) {
    const entry = instants[index];
    // Only an enemy's Spell can be reflected — never your own buff.
    if (entry.playerId === playerId) {
      continue;
    }
    const effect = cards[entry.cardId]?.effect;
    if (!effect || effect.type !== "ADD_COMBAT_STAT") {
      continue;
    }
    const affected = effect.stat === "attack" ? attacker : defender;
    if (!affected || affected.controllerId !== playerId || !isUnitAlive(affected)) {
      continue;
    }
    return { index, cardId: entry.cardId, stat: effect.stat, affectedUnitId: affected.id };
  }
  return null;
}

/**
 * The unit a pending SPELL_CAST_STARTED is currently aimed at, when that unit
 * belongs to `playerId` — i.e. when Magic Mirror's "your unit is about to be
 * targeted by a spell" condition holds for that player. Reads the live stack
 * item so a chain of redirects keys off the current target, not the original.
 */
export function pendingSpellTargetForPlayer(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" }>,
  playerId: PlayerId
): CombatUnitState | null {
  const stackItem = state.stack.find((item) => item.triggerEventIds.includes(triggerEvent.id));
  if (!stackItem || stackItem.action.type !== "CAST_SPELL" || stackItem.action.target.type !== "unit") {
    return null;
  }
  const targetUnit = state.combat?.units[stackItem.action.target.unitId];
  return targetUnit && targetUnit.controllerId === playerId ? targetUnit : null;
}

export function isUnitAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

// isAdjacent moved to battlefield.ts (dependency-free) so active-effects and
// the permanents module can share it without import cycles.
export { isAdjacent } from "./battlefield";

/**
 * Printed movement values: ground and flying units move up to 3 spaces,
 * ranged units up to 1 space (after shooting or instead of attacking).
 */
export function getUnitMoveRange(unit: CombatUnitState, state?: GameState): number {
  const base = unit.type === "ranged" ? 1 : 3;

  // House rule (BINH only): Haste / Slow (and Cyra / Gundula's specialties) also
  // shift Combat movement by ±1 (MOVEMENT_BONUS). Legacy keeps the fixed range.
  if (!state || getRuleset(state) !== "binh") {
    return base;
  }
  let bonus = 0;
  for (const effect of state.activeEffects) {
    if (!effectAppliesToUnit(effect, unit)) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "MOVEMENT_BONUS") {
        bonus += modifier.amount;
      }
    }
  }
  return Math.max(1, base + bonus);
}

export function getCombatObstacles(combat: CombatState): number[] {
  return combat.obstacles ?? [];
}

/**
 * Spaces holding a Force Field token: these count as Combat Obstacles (they
 * block non-flying movement and nobody may stop on them) while they stand. The
 * other battlefield tokens (Fire Wall / Quicksand / Land Mine) deliberately do
 * NOT block — units enter them so the wall can burn or the trap can spring.
 */
export function getForceFieldPositions(combat: CombatState): number[] {
  return (combat.battlefieldTokens ?? [])
    .filter((token) => token.kind === "force_field")
    .map((token) => token.position);
}

/**
 * Every unit card and obstacle token on the board is a Combat Obstacle.
 * They block movement paths for non-flying units and nobody can stop on them.
 */
export function getBlockedSpaces(combat: CombatState, movingUnit?: CombatUnitState): Set<number> {
  const blocked = new Set<number>(getCombatObstacles(combat));

  for (const position of getForceFieldPositions(combat)) {
    blocked.add(position);
  }

  for (const unit of Object.values(combat.units)) {
    if (isUnitAlive(unit) && unit.id !== movingUnit?.id) {
      blocked.add(unit.position);
    }
  }

  // Siege fortifications are Combat Obstacles; the Gate is open to the
  // defender ("Defending units may move through the Gate and may stop on it").
  if (combat.siege && movingUnit) {
    for (const position of siegeBlockedPositions(combat.siege, movingUnit)) {
      blocked.add(position);
    }
  }

  return blocked;
}

/**
 * Step-count from `origin` to every square `mover` could path to, treating
 * other units and obstacles as walls (flyers ignore them). Used by the neutral
 * AI to walk *around* blockers toward a target rather than only ever stepping
 * in a straight line — a unit boxed off the direct line still closes the gap.
 * Squares the mover can never reach are absent from the result.
 */
export function getPathDistances(combat: CombatState, mover: CombatUnitState, origin: number): Map<number, number> {
  const blocked = getBlockedSpaces(combat, mover);
  // The origin (the target's own square) seeds the flood even though it is
  // occupied — we want the distance to stand *next to* the target.
  blocked.delete(origin);
  const ignoresObstacles = mover.type === "flying";

  const distances = new Map<number, number>([[origin, 0]]);
  let frontier = [origin];
  let step = 0;
  while (frontier.length > 0) {
    step += 1;
    const next: number[] = [];
    for (const position of frontier) {
      for (const neighbor of getOrthogonalNeighbors(position)) {
        if (distances.has(neighbor) || (!ignoresObstacles && blocked.has(neighbor))) {
          continue;
        }
        distances.set(neighbor, step);
        next.push(neighbor);
      }
    }
    frontier = next;
  }

  return distances;
}

function hasCannotMoveEffect(state: GameState | undefined, unit: CombatUnitState): boolean {
  return Boolean(
    state?.activeEffects.some(
      (effect) =>
        effectAppliesToUnit(effect, unit) &&
        effect.modifiers.some((modifier) => modifier.type === "UNIT_CANNOT_MOVE")
    )
  );
}

export function canUnitMoveTo(
  combat: CombatState,
  unit: CombatUnitState,
  destination: number,
  state?: GameState
): boolean {
  return getLegalMoveDestinations(combat, unit, state).includes(destination);
}

/**
 * Rampart Dendroids (Pack) "Bind": an enemy that begins its activation adjacent
 * to a living Dendroid cannot move. Evaluated against the unit's current
 * position — callers only reach here before the active unit has moved, so its
 * position is exactly where its activation began.
 */
function isBoundByAdjacentEnemy(combat: CombatState, unit: CombatUnitState): boolean {
  return Object.values(combat.units).some(
    (binder) =>
      binder.controllerId !== unit.controllerId &&
      isUnitAlive(binder) &&
      hasBindAdjacentEnemies(binder) &&
      isAdjacent(binder.position, unit.position)
  );
}

export function getLegalMoveDestinations(combat: CombatState, unit: CombatUnitState, state?: GameState): number[] {
  if (!isUnitAlive(unit) || unit.activatedThisRound || unit.movedThisActivation) {
    return [];
  }

  if (hasCannotMoveEffect(state, unit)) {
    return [];
  }

  if (isBoundByAdjacentEnemy(combat, unit)) {
    return [];
  }

  const blocked = getBlockedSpaces(combat, unit);

  // Arch Devils teleport: a regular move may land on any empty space.
  if (hasUnitAbilityEffect(unit, "MOVE_ANYWHERE")) {
    return Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, position) => position).filter(
      (position) => position !== unit.position && !blocked.has(position)
    );
  }

  return getReachableDestinations(
    unit.position,
    getUnitMoveRange(unit, state),
    blocked,
    unit.type === "flying"
  ).filter(isBattlefieldPosition);
}

/**
 * Which side activates next, and the units that side may pick from, at the top
 * (highest effective initiative) tier of un-acted units.
 *
 * Tie rules (house rules layered on the rulebook initiative order):
 *  - Units of the SAME side tied at this initiative are ALL returned as
 *    `candidates`, so the controller chooses which goes first (engine prompt).
 *  - When BOTH sides have units tied at this initiative, activation ALTERNATES
 *    between them rather than letting one side run all of its tied units first.
 *    The side that has activated fewer units at this initiative this round acts
 *    next; on an even split the ATTACKER side goes first, then they go back and
 *    forth. In a Neutral fight the player is always the attacker, so the player
 *    leads and the Neutral army follows; in PvP the attacker leads the defender.
 */
export type ActivationStep = {
  side: PlayerId;
  candidates: CombatUnitState[];
  initiative: number;
};

/**
 * The single source of truth for "who activates next", shared by the live
 * engine (getActivationStep, reading `activatedThisRound`) and the rail preview
 * (getActivationOrder, simulating the round). Whatever counts as already-acted
 * is supplied via `hasActed`, so the displayed order can never drift from the
 * order the engine actually plays.
 */
function selectActivationStep(
  units: CombatUnitState[],
  attackerId: PlayerId,
  initiativeOf: (unit: CombatUnitState) => number,
  hasActed: (unit: CombatUnitState) => boolean
): ActivationStep | null {
  const eligible = units.filter((unit) => isUnitAlive(unit) && !hasActed(unit));
  if (eligible.length === 0) {
    return null;
  }

  const topInitiative = Math.max(...eligible.map(initiativeOf));
  const tier = eligible
    .filter((unit) => initiativeOf(unit) === topInitiative)
    .sort((left, right) => left.id.localeCompare(right.id));

  const tierAttackers = tier.filter((unit) => unit.controllerId === attackerId);
  const tierOthers = tier.filter((unit) => unit.controllerId !== attackerId);

  if (tierOthers.length === 0) {
    return { side: attackerId, candidates: tierAttackers, initiative: topInitiative };
  }
  if (tierAttackers.length === 0) {
    return { side: tierOthers[0].controllerId, candidates: tierOthers, initiative: topInitiative };
  }

  // Both sides are present at this initiative: alternate, ATTACKER-first on
  // ties. Whichever side has activated fewer units at this tier goes next; on an
  // even split the attacker leads (the player in a Neutral fight, the attacking
  // hero in PvP), so the two sides go back and forth starting with the attacker.
  const actedAtTier = (predicate: (unit: CombatUnitState) => boolean) =>
    units.filter((unit) => hasActed(unit) && initiativeOf(unit) === topInitiative && predicate(unit)).length;
  const attackerActed = actedAtTier((unit) => unit.controllerId === attackerId);
  const othersActed = actedAtTier((unit) => unit.controllerId !== attackerId);

  if (othersActed < attackerActed) {
    return { side: tierOthers[0].controllerId, candidates: tierOthers, initiative: topInitiative };
  }
  return { side: attackerId, candidates: tierAttackers, initiative: topInitiative };
}

export function getActivationStep(
  combat: CombatState,
  activeEffects: ActiveEffectState[] = []
): ActivationStep | null {
  const initiativeOf = (unit: CombatUnitState) => effectiveInitiative(unit, activeEffects);
  return selectActivationStep(
    Object.values(combat.units),
    combat.attackerPlayerId,
    initiativeOf,
    (unit) => unit.activatedThisRound
  );
}

export function getNextUnitToActivate(combat: CombatState, activeEffects: ActiveEffectState[] = []): CombatUnitState | null {
  return getActivationStep(combat, activeEffects)?.candidates[0] ?? null;
}

/**
 * The full order the current combat round will actually play out, computed by
 * stepping the SAME selection logic the engine uses, one unit at a time. The
 * initiative rail shows this so the displayed order matches reality — in
 * particular the cross-side ALTERNATION on initiative ties (attacker, defender,
 * attacker, …), which a flat "highest initiative, attacker-first" sort gets
 * wrong: it would list all of one side's tied units before the other's, even
 * though the engine interleaves them.
 *
 * Already-activated units come first (the rail greys them as "done"), then the
 * upcoming units in true activation order. Same-side ties are emitted in id
 * order; the live engine prompts the controller to choose among them, so that
 * part is a best-effort preview while the cross-side interleaving is exact.
 */
export function getActivationOrder(
  combat: CombatState,
  activeEffects: ActiveEffectState[] = []
): CombatUnitState[] {
  const alive = Object.values(combat.units).filter(isUnitAlive);
  const initiativeOf = (unit: CombatUnitState) => effectiveInitiative(unit, activeEffects);

  const acted = new Set<UnitId>(alive.filter((unit) => unit.activatedThisRound).map((unit) => unit.id));
  const done = alive
    .filter((unit) => unit.activatedThisRound)
    .sort((left, right) => initiativeOf(right) - initiativeOf(left) || left.id.localeCompare(right.id));

  const upcoming: CombatUnitState[] = [];
  // Bounded by the unit count: each pass marks exactly one more unit acted.
  for (let guard = alive.length; guard > 0; guard -= 1) {
    const next = selectActivationStep(alive, combat.attackerPlayerId, initiativeOf, (unit) => acted.has(unit.id))
      ?.candidates[0];
    if (!next) {
      break;
    }
    upcoming.push(next);
    acted.add(next.id);
  }

  return [...done, ...upcoming];
}

function hasAdjacentEnemy(combat: CombatState, unit: CombatUnitState): boolean {
  return Object.values(combat.units).some(
    (candidate) =>
      candidate.controllerId !== unit.controllerId &&
      isUnitAlive(candidate) &&
      isAdjacent(candidate.position, unit.position)
  );
}

export function getAttackKind(attacker: CombatUnitState, defender: CombatUnitState): "melee" | "ranged" {
  return attacker.type === "ranged" && !isAdjacent(attacker.position, defender.position) ? "ranged" : "melee";
}

function isBackRow(position: number): boolean {
  const row = Math.floor(position / BATTLEFIELD_COLUMNS);
  return row === 0 || row === BATTLEFIELD_ROWS - 1;
}

function isOppositeBackRow(leftPosition: number, rightPosition: number): boolean {
  const leftRow = Math.floor(leftPosition / BATTLEFIELD_COLUMNS);
  const rightRow = Math.floor(rightPosition / BATTLEFIELD_COLUMNS);

  return (
    (leftRow === 0 && rightRow === BATTLEFIELD_ROWS - 1) ||
    (leftRow === BATTLEFIELD_ROWS - 1 && rightRow === 0)
  );
}

/** Ammo Cart and friends: a player-scoped waiver of the ranged penalties. */
function hasRangedPenaltyWaiver(state: GameState | undefined, unit: CombatUnitState): boolean {
  return Boolean(
    state?.activeEffects.some(
      (effect) =>
        effectAppliesToUnit(effect, unit) &&
        effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_ALL_PENALTIES")
    )
  );
}

export function getAttackRollMode(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  state?: GameState
): AttackRollMode {
  // A full waiver (Ammo Cart, or the "ignore the combat penalties" units —
  // Magi / Sharpshooters / Halflings) drops both the adjacent-attack and the
  // long-range penalty. The "ignore the combat penalty against adjacent units"
  // units (Evil Eyes / Medusas / Zealots / Titans) drop only the adjacent one.
  const ignoresAllPenalties =
    hasUnitAbilityEffect(attacker, "IGNORE_RANGED_PENALTIES") || hasRangedPenaltyWaiver(state, attacker);
  const ignoresMeleePenalty =
    ignoresAllPenalties || hasUnitAbilityEffect(attacker, "IGNORE_RANGED_MELEE_PENALTY");

  if (attacker.type === "ranged" && getAttackKind(attacker, defender) === "melee" && !ignoresMeleePenalty) {
    return "disadvantage";
  }

  if (
    getAttackKind(attacker, defender) === "ranged" &&
    !ignoresAllPenalties &&
    isBackRow(attacker.position) &&
    isBackRow(defender.position) &&
    isOppositeBackRow(attacker.position, defender.position)
  ) {
    return "disadvantage";
  }

  // Shaman's Puppet (option A): the puppeted unit rolls two Attack dice and
  // resolves the LOWER result for every attack this activation. Checked before
  // the Crusaders' advantage so the debuff wins when both are present (the
  // puppet forces the worse roll). Needs `state` to read the active effect.
  if (state && unitAttackRollDisadvantaged(state, attacker)) {
    return "disadvantage";
  }

  // Neutral Crusaders: "roll 2 Attack dice and resolve the higher outcome".
  // Unlike a reroll this is automatic — both dice roll at once and the better
  // one counts, no player decision involved.
  if (hasUnitAbilityEffect(attacker, "ATTACK_ROLL_ADVANTAGE")) {
    return "advantage";
  }

  return "normal";
}

/**
 * Whether a reroll source can fire against the current (latest) roll: it
 * needs uses left, and face-gated sources like the Crusaders' 'every "0"'
 * only while the die actually shows that face.
 */
export function rerollSourceAvailableFor(source: AttackRerollSource, currentRoll: number): boolean {
  if (source.remaining <= 0) {
    return false;
  }

  if (source.onlyOnRoll !== undefined && currentRoll !== source.onlyOnRoll) {
    return false;
  }

  return true;
}

export function canUnitAttack(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  activeEffects: ActiveEffectState[] = []
): boolean {
  if (!isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  // Berserk forces a unit onto the nearest unit, friend or foe — so a berserked
  // attacker may strike its own ally (which still retaliates). Every other unit
  // can only attack an enemy.
  if (attacker.controllerId === defender.controllerId && !unitIsBerserk(activeEffects, attacker)) {
    return false;
  }

  // Forgetfulness: a unit holding UNIT_CANNOT_ATTACK may move but not attack.
  if (
    activeEffects.some(
      (effect) =>
        effectAppliesToUnit(effect, attacker) &&
        effect.modifiers.some((modifier) => modifier.type === "UNIT_CANNOT_ATTACK")
    )
  ) {
    return false;
  }

  if (attacker.type === "ranged") {
    // Ranged units either shoot then step 1, or move 1 without attacking —
    // a ranged unit that has already moved gave up its attack.
    if (attacker.movedThisActivation) {
      return false;
    }

    if (hasAdjacentEnemy(combat, attacker)) {
      return isAdjacent(attacker.position, defender.position);
    }

    return true;
  }

  return isAdjacent(attacker.position, defender.position);
}

export function canUnitMoveAndAttack(
  combat: CombatState,
  attacker: CombatUnitState,
  destination: number,
  defender: CombatUnitState,
  state?: GameState
): boolean {
  if (attacker.type === "ranged" || !canUnitMoveTo(combat, attacker, destination, state)) {
    return false;
  }

  const movedAttacker = {
    ...attacker,
    position: destination
  };
  const virtualCombat = {
    ...combat,
    units: {
      ...combat.units,
      [attacker.id]: movedAttacker
    }
  };

  return canUnitAttack(virtualCombat, movedAttacker, defender, state?.activeEffects ?? []);
}

/**
 * Berserk targeting: the living units (friend or foe, never the unit itself)
 * tied for the shortest distance from `unit`. A berserked unit must attack one
 * of these — the controller (or the neutral AI) breaks the tie, the rulebook's
 * "the player owning the unit decides the direction." Distance is the orthogonal
 * board distance, the same "closest" measure the neutral AI uses elsewhere.
 */
export function getBerserkNearestTargets(combat: CombatState, unit: CombatUnitState): CombatUnitState[] {
  const others = Object.values(combat.units).filter(
    (candidate) => candidate.id !== unit.id && isUnitAlive(candidate)
  );
  if (others.length === 0) {
    return [];
  }
  const nearest = Math.min(
    ...others.map((candidate) => getBattlefieldDistance(unit.position, candidate.position))
  );
  return others.filter(
    (candidate) => getBattlefieldDistance(unit.position, candidate.position) === nearest
  );
}

/** A target definition that resolves to units (not "none", a space, or an obstacle). */
type UnitTargetDefinition = Exclude<
  TargetDefinition,
  { type: "none" } | { type: "empty-space" } | { type: "any-space" } | { type: "unit-or-obstacle" }
>;

/**
 * Mirrors the reducer's `unitMatchesSpecialtyName` (kept local to avoid a
 * legal-actions -> reducer import cycle): exact name, "X and/or Y" descriptors,
 * and "a … unit" family suffixes all match.
 */
function matchesUnitName(unitName: string | undefined, target: string): boolean {
  if (!unitName) {
    return false;
  }
  if (/\s+(?:and|or)\s+/i.test(target)) {
    return target.split(/\s+(?:and|or)\s+/i).some((part) => matchesUnitName(unitName, part.trim()));
  }
  if (unitName === target) {
    return true;
  }
  const family = target.replace(/^an?\s+/i, "").replace(/\s+units?$/i, "").trim();
  return family.length > 0 && family !== target && unitName.toLowerCase().endsWith(family.toLowerCase());
}

function unitMatchesTarget(unit: CombatUnitState, target: UnitTargetDefinition): boolean {
  if (target.unitTypes && !target.unitTypes.includes(unit.type)) {
    return false;
  }

  if (target.damagedOnly && unit.damage <= 0) {
    return false;
  }

  // Bowstring of the Unicorn's Mane: only a ranged unit that has not yet taken
  // its turn this round can be activated.
  if (target.type === "friendly-unit" && target.notActivatedThisRound && unit.activatedThisRound) {
    return false;
  }

  // Ingham's Zealots VI (friendly) / Tarnum (Dungeon)'s Dragons VI (any unit):
  // the effect lands only on a unit whose name matches the named family.
  if (
    (target.type === "friendly-unit" || target.type === "any-unit") &&
    target.unitName &&
    !matchesUnitName(unit.name, target.unitName)
  ) {
    return false;
  }

  return true;
}

function getEnemyTargets(
  state: GameState,
  playerId: PlayerId,
  target: UnitTargetDefinition
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  let units = Object.values(state.combat.units)
    .filter((unit) => unit.controllerId !== playerId)
    .filter(isUnitAlive)
    .filter((unit) => unitMatchesTarget(unit, target));

  // Artillery: only the enemy unit(s) with the lowest effective initiative are
  // legal targets (a tie offers each, so the controller picks which is hit).
  if (target.type === "enemy-unit" && target.lowestInitiativeOnly && units.length > 0) {
    const lowest = Math.min(...units.map((unit) => effectiveInitiative(unit, state.activeEffects)));
    units = units.filter((unit) => effectiveInitiative(unit, state.activeEffects) === lowest);
  }

  return units.map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

function getFriendlyTargets(
  state: GameState,
  playerId: PlayerId,
  target: UnitTargetDefinition
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  return Object.values(state.combat.units)
    .filter((unit) => unit.controllerId === playerId)
    .filter(isUnitAlive)
    .filter((unit) => unitMatchesTarget(unit, target))
    .map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

function getTargetsForCard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  cards: CardLibrary,
  /**
   * Per-option target override (Ring of the Wayfarer): when a CHOOSE_ONE option
   * carries its own `target`, it is used instead of the card-level one.
   */
  overrideTarget?: TargetDefinition
): TargetRef[] {
  const card = cards[cardId];
  // Self-resolving effects (Leadership's morale token, active effects) never
  // pick a unit: they default to a no-target play. Only effects that actually
  // strike a unit fall back to "enemy-unit".
  const selfTargetedEffect =
    card?.effect.type === "CREATE_ACTIVE_EFFECT" ||
    card?.effect.type === "GAIN_MORALE" ||
    // Mirth: a player-scoped reroll buff picks no unit.
    card?.effect.type === "CREATE_ATTACK_DIE_REROLL" ||
    // Remove Obstacle picks no unit — it opens a board-obstacle choice instead.
    card?.effect.type === "REMOVE_OBSTACLE" ||
    // Quicksand / Land Mine pick no unit either — the cast opens a face-down
    // token placement picker (every token is placed there, including the first).
    card?.effect.type === "PLACE_HIDDEN_TOKENS" ||
    // Eagle Eye digs the shared Spell deck for a Basic/Expert spell — it never
    // touches a battlefield unit. Without this it defaults to "enemy-unit" and
    // (wrongly) demands an enemy-unit pick when played in combat — and becomes
    // un-playable when no enemy unit is targetable. The dig opens a take/discard
    // choice instead. (optionNeedsUnitTarget already excludes it on the option
    // path used by the Tome relics.)
    card?.effect.type === "EAGLE_EYE_DIG";
  const cardTarget = overrideTarget ?? card?.target;
  const targetType =
    cardTarget?.type ??
    (card?.effect.type === "HEAL_DAMAGE"
      ? "friendly-unit"
      : selfTargetedEffect
        ? "none"
        : "enemy-unit");

  if (targetType === "none") {
    return [{ type: "none" }];
  }

  // Summon spells target a chosen empty space (no living unit, obstacle, Wall
  // or Gate). Mirrors isSpaceBlockedForSummon in the reducer.
  if (targetType === "empty-space") {
    const combat = state.combat;
    if (!combat) {
      return [];
    }
    const blocked = new Set<number>();
    for (const unit of Object.values(combat.units)) {
      if (isUnitAlive(unit)) {
        blocked.add(unit.position);
      }
    }
    for (const position of combat.obstacles ?? []) {
      blocked.add(position);
    }
    // A space already holding any spell token (Force Field / Fire Wall /
    // Quicksand / Land Mine) is not "empty" for placing another one or summoning.
    for (const token of combat.battlefieldTokens ?? []) {
      blocked.add(token.position);
    }
    for (const position of combat.siege?.walls ?? []) {
      blocked.add(position);
    }
    if (combat.siege?.gatePosition != null) {
      blocked.add(combat.siege.gatePosition);
    }

    const spaces: TargetRef[] = [];
    for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
      if (!blocked.has(position)) {
        spaces.push({ type: "space", position });
      }
    }
    return spaces;
  }

  // Inferno: any space on the board is a legal target — occupied or empty — so
  // the blast can be centred on a stack of units.
  if (targetType === "any-space") {
    if (!state.combat) {
      return [];
    }
    const spaces: TargetRef[] = [];
    for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
      spaces.push({ type: "space", position });
    }
    return spaces;
  }

  // Dispel targets any unit OR an obstacle space: its unit half behaves like
  // "any-unit"; the obstacle spaces are appended after the unit filtering below.
  const unitTargetType = targetType === "unit-or-obstacle" ? "any-unit" : targetType;
  const target =
    cardTarget &&
    cardTarget.type !== "none" &&
    cardTarget.type !== "empty-space" &&
    cardTarget.type !== "any-space" &&
    cardTarget.type !== "unit-or-obstacle"
      ? cardTarget
      : ({ type: unitTargetType } as UnitTargetDefinition);

  let targets =
    target.type === "friendly-unit"
      ? getFriendlyTargets(state, playerId, target)
      : target.type === "any-unit"
        ? [...getFriendlyTargets(state, playerId, target), ...getEnemyTargets(state, playerId, target)]
        : getEnemyTargets(state, playerId, target);

  // Anti-Magic and elemental immunity: a unit cannot be targeted by a Spell it
  // is immune to. Anti-Magic (the UNIT_SPELL_IMMUNE active effect) blocks every
  // Spell up to its grade; an Elemental's printed immunity blocks only Magic
  // Arrow and its own school (see unitImmuneToSpellSchools).
  if (card?.kind === "spell") {
    targets = targets.filter((candidate) => {
      if (candidate.type !== "unit") {
        return true;
      }
      const unit = state.combat?.units[candidate.unitId];
      if (!unit) {
        return true;
      }
      // Orb of Vulnerability negates a unit's printed spell-school immunity, so
      // an otherwise-immune unit becomes a legal target. Anti-Magic (a Spell
      // effect, not a unit ability) still bars targeting.
      const innateImmune = !spellAbilitiesSuppressed(state) && unitImmuneToSpellSchools(unit, card.spellSchools);
      // Pendant of Negativity (option B): an artifact-granted school immunity also
      // bars targeting; unlike printed immunity it is never lifted by Orb of
      // Vulnerability.
      const artifactImmune = unitImmuneToSpellSchoolsByEffect(state, unit, card.spellSchools);
      return !isUnitSpellImmune(state, unit) && !innateImmune && !artifactImmune;
    });
  }

  // A tier-gated spell/specialty (a `grade` ceiling or `gradeByPower` ladder) can
  // never reach a unit whose grade sits above its ladder's TOP grade, whatever
  // Power is paid — and no spell ladder climbs above "gold". So drop the two kinds
  // of forever-unreachable unit from a tier-gated card's target list: a gradeless
  // Creature Bank defender (rulebook p.66 — gradeRank ∞) AND any AZURE-tier unit
  // (gradeRank above gold). This keeps Berserk / Teleport / Clone — whose per-Power
  // grade gate is otherwise deferred to resolution (Power can be added after the
  // cast is declared) — from ever OFFERING (then silently fizzling on) an azure or
  // bank unit. Option-card tier gates are filtered per option in addOptionPlays.
  if (card && effectIsTierGated(card.effect)) {
    const ceiling = maxTierGateRank(card.effect);
    targets = targets.filter((candidate) => {
      if (candidate.type !== "unit") {
        return true;
      }
      const unit = state.combat?.units[candidate.unitId];
      return !unit || gradeRankOfUnit(unit) <= ceiling;
    });
  }

  // Dispel also targets a board space holding an obstacle/trap token ("Remove all
  // ongoing effects from a space"). Offer each occupied token space once.
  if (targetType === "unit-or-obstacle" && state.combat) {
    const tokenSpaces = new Set<number>();
    for (const token of state.combat.battlefieldTokens ?? []) {
      tokenSpaces.add(token.position);
    }
    for (const position of tokenSpaces) {
      targets.push({ type: "space", position });
    }
  }

  // Clone: only offer on a friendly unit that has a printed side to copy AND at
  // least one empty space orthogonally adjacent to it for the Clone Token —
  // otherwise the cast would be a no-op. The grade gate is NOT applied here: the
  // cast can be empowered after it is declared, so the reachable grade is decided
  // at resolution against the Power actually paid (like Berserk / Teleport).
  if (card?.effect.type === "CLONE_UNIT" && state.combat) {
    const combat = state.combat;
    const blocked = new Set<number>();
    for (const unit of Object.values(combat.units)) {
      if (isUnitAlive(unit)) {
        blocked.add(unit.position);
      }
    }
    for (const position of combat.obstacles ?? []) {
      blocked.add(position);
    }
    for (const position of combat.siege?.walls ?? []) {
      blocked.add(position);
    }
    if (combat.siege?.gatePosition != null) {
      blocked.add(combat.siege.gatePosition);
    }
    targets = targets.filter((candidate) => {
      if (candidate.type !== "unit") {
        return true;
      }
      const unit = combat.units[candidate.unitId];
      if (!unit || !unit.unitDefId) {
        return false;
      }
      return getOrthogonalNeighbors(unit.position).some((position) => !blocked.has(position));
    });
  }

  return targets;
}

function isPhaseAllowedForCard(state: GameState, card: CardDefinition): boolean {
  return !card.phaseLimit || card.phaseLimit.includes(state.phase);
}

function getAttackRerollsForMode(card: CardDefinition, mode: CardPlayMode): number {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
    return 0;
  }

  if (mode === "expert") {
    return card.effect.expertRerolls ?? card.effect.basicRerolls;
  }

  return card.effect.basicRerolls;
}

function getPlayableModesForCard(state: GameState, playerId: PlayerId, card: CardDefinition): CardPlayMode[] {
  // An Empowered ability may take its Expert side without a crown; otherwise a
  // spare Expert use (crown) is required.
  const player = state.players[playerId];
  const expertCrownFree = Boolean(player) && canPlayExpertMode(player, card.id);

  if (card.effect.type === "CREATE_ATTACK_DIE_REROLL" && card.effect.basicRerolls <= 0) {
    return card.effect.expertRerolls && expertCrownFree ? ["expert"] : [];
  }

  const modes: CardPlayMode[] = ["basic"];

  if (
    (card.effect.type === "ADD_COMBAT_STAT" ||
      card.effect.type === "ADD_SPELL_POWER" ||
      card.effect.type === "CREATE_ACTIVE_EFFECT" ||
      card.effect.type === "CREATE_ATTACK_DIE_REROLL" ||
      // Leadership: the expert side (draw 2) is usable mid-battle for an expert use.
      card.effect.type === "GAIN_MORALE") &&
    ((card.effect.type === "CREATE_ACTIVE_EFFECT" && card.effect.expertEffect) ||
      (card.effect.type === "CREATE_ATTACK_DIE_REROLL" && card.effect.expertRerolls && card.effect.expertRerolls > 0) ||
      (card.effect.type === "GAIN_MORALE" && card.effect.expertDrawCards !== undefined) ||
      ("expertAmount" in card.effect && card.effect.expertAmount !== undefined)) &&
    expertCrownFree
  ) {
    modes.push("expert");
  }

  // Eagle Eye's Expert side digs for an Expert spell instead of a Basic one (an
  // Expert use / crown). Offer it in combat too so the player picks Basic or
  // Expert just like on the map play (effectSupportsExpertOption) — never a unit.
  if (card.effect.type === "EAGLE_EYE_DIG" && expertCrownFree) {
    modes.push("expert");
  }

  return modes.filter((mode) => {
    if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
      return true;
    }

    return getAttackRerollsForMode(card, mode) > 0;
  });
}

/** True while combat is running and no attack, reaction or choice is resolving. */
function isCombatCardWindowOpen(state: GameState): boolean {
  return Boolean(
    state.combat &&
      !state.combat.outcome &&
      !state.combat.setup &&
      !state.combat.awaitingContinue &&
      state.phase === "combat" &&
      state.stack.length === 0 &&
      !state.reactionWindow &&
      !state.pendingChoice
  );
}

function isCombatParticipant(state: GameState, playerId: PlayerId): boolean {
  return Boolean(
    state.combat && (state.combat.attackerPlayerId === playerId || state.combat.defenderPlayerId === playerId)
  );
}

/**
 * Hand lock: a player "cannot use your Deck during this Combat" when they have
 * no hero present (a garrison defended without the town hero) or when a
 * Secondary Hero leads the fight — Secondary Heroes never play cards. Applies
 * to the relevant side of both Neutral and player-vs-player combats.
 */
export function isHandLockedInCombat(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  if (combat.context.kind === "neutral") {
    const hero = state.heroes[combat.context.heroId];
    return hero?.controllerId === playerId && hero.kind === "secondary";
  }

  if (combat.context.kind !== "player") {
    return false;
  }

  let heroId: string | null = null;
  if (playerId === combat.attackerPlayerId) {
    heroId = combat.context.attackerHeroId;
  } else if (playerId === combat.defenderPlayerId) {
    heroId = combat.context.defenderHeroId;
  } else {
    return false;
  }

  return heroId === null || state.heroes[heroId]?.kind === "secondary";
}

/**
 * Spell casting by the printed timing symbols — limited to one Spell card per
 * player per combat round (Knowledge/Necklace raise it):
 *  - Activation spells (Magic Arrow, Fireball, Haste…) are cast while one of
 *    YOUR units is active, before it attacks.
 *  - Trigger-free instant spells (Cure, Counterstrike) may be cast at any
 *    open moment of the combat by either fighter.
 *  - Instant spells with an attack trigger (Bloodlust, Stone Skin, Curse…)
 *    are played inside the attack windows instead, never cast directly.
 */
/**
 * Neutral Pegasi "Mystic Toll": a living enemy Pegasi forces this player to pay
 * (discard) one extra Power card whenever they cast a Spell. Combat-only.
 */
export function combatEnemyImposesPowerTax(state: GameState, casterId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  return Object.values(combat.units).some(
    (unit) => unit.controllerId !== casterId && isUnitAlive(unit) && hasSpellCastPowerTax(unit)
  );
}

/**
 * Creature Bank Dragon Utopia Faerie Dragons (while Stacked): a living enemy
 * unit with the spell-cast lock forbids this player from casting any Spell.
 * Combat-only; the Stacked gate lives in `getUnitAbilityDefinitions`, so the
 * lock lifts the moment the Faerie Dragons lose their Stack Token.
 */
export function combatEnemyLocksSpells(state: GameState, casterId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  return Object.values(combat.units).some(
    (unit) => unit.controllerId !== casterId && isUnitAlive(unit) && hasSpellCastLock(unit)
  );
}

/**
 * The Power cards the player could pay for the Pegasi toll. A hand cast spends
 * the spell itself first, so it cannot also pay the toll — the toll must come
 * from a *different* Power card; a Scroll cast leaves the hand intact.
 */
export function payablePowerCardIds(
  hand: readonly CardId[],
  cards: CardLibrary,
  castCardId: CardId,
  fromScroll: boolean
): CardId[] {
  let remaining: readonly CardId[] = hand;
  if (!fromScroll) {
    const index = remaining.indexOf(castCardId);
    if (index >= 0) {
      remaining = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
    }
  }
  return remaining.filter((cardId) => cardCanBoostPower(cards[cardId]));
}

/** Whether the player holds any Power card to pay the Pegasi toll for this cast. */
export function handCanPayPowerTax(
  hand: readonly CardId[],
  cards: CardLibrary,
  castCardId: CardId,
  fromScroll: boolean
): boolean {
  return payablePowerCardIds(hand, cards, castCardId, fromScroll).length > 0;
}

/**
 * Whether a card in hand is a Helm of the Alabaster Unicorn-style artifact whose
 * CHOOSE_ONE offers the "cast the top of the Spell-deck discard pile" side. Such
 * a card lets its holder cast the public top spell of the shared Spell-deck
 * discard pile (sourced from there, not the hand), removing the artifact.
 */
function cardEnablesSpellDeckCast(card: CardDefinition | undefined): boolean {
  return Boolean(
    card &&
      card.implementationStatus === "implemented" &&
      card.effect.type === "CHOOSE_ONE" &&
      card.effect.options.some((option) => option.effect.type === "CAST_FROM_SPELL_DISCARD")
  );
}

function addSpellActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  if (!isCombatCardWindowOpen(state) || !isCombatParticipant(state, playerId) || isHandLockedInCombat(state, playerId)) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }
  // The one-Spell-per-combat-round limit blocks hand and Scroll casts. The Helm
  // of the Alabaster Unicorn cast is a free bonus that does not count toward the
  // limit, so it is still offered (and added) even once the limit is reached.
  const spellLimitReached = player.combatStats.spellsCastThisRound >= spellLimitFor(state, player);

  // Recanter's Cloak (option B): "no Hero can use Spells" this Combat — a global
  // lock that binds both heroes, so no cast is offered at all. (Option A's
  // Power-0 floor is enforced at resolution, since the Power is only fixed once
  // the cast window closes; a cast can still be declared and then boosted.)
  if (getSpellCastRestriction(state).lockAll) {
    return;
  }

  // Creature Bank Dragon Utopia Faerie Dragons (while Stacked): a living enemy
  // Faerie Dragons locks this player out of casting any Spell — none is offered.
  if (combatEnemyLocksSpells(state, playerId)) {
    return;
  }

  // Neutral Pegasi: a living enemy Pegasi gates every Spell cast behind paying
  // an extra Power card — with none to pay, the cast is not offered at all.
  const powerTaxed = combatEnemyImposesPowerTax(state, playerId);

  const combat = state.combat;
  const activeUnit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  // Intelligence lifts the activation-timing gate: its holder may cast an
  // activation spell at any open moment of the combat, even off-turn, without
  // one of their own units being active.
  const ownActivationOpen =
    Boolean(
      activeUnit &&
        activeUnit.controllerId === playerId &&
        !activeUnit.activatedThisRound &&
        !activeUnit.attackedThisActivation
    ) || playerHasSpellTimingFreedom(state, playerId);

  // Tarnum (Conflux) VI: spells Searched this combat are cast for free OVER the
  // per-round limit (a bonus), and they never go to the caster's own discard —
  // they are offered separately from normal hand casts (which they are excluded
  // from) so the limit-reached gate cannot block them.
  const tarnumFlagged = new Set(player.combatStats.tarnumOverlimitCards ?? []);

  // Hand spells plus every Spell Scroll spell (scroll spells are not in hand;
  // they cast at power 0 and are removed once used). Both share the timing and
  // targeting rules below, and both are blocked once the spell limit is reached.
  const castCandidates: {
    cardId: string;
    fromScroll?: string;
    fromSpellDeck?: string;
    fromSpellBook?: boolean;
    tarnumReturn?: "deck-top" | "discard";
  }[] = spellLimitReached
    ? []
    : [
        ...[...new Set(player.hand)].filter((cardId) => !tarnumFlagged.has(cardId)).map((cardId) => ({ cardId })),
        // Spell Book (house rule): Book Spells cast like hand Spells — full
        // Power, same one-Spell-per-round limit, same timing/targeting gates.
        ...(spellBookRuleEnabled(state)
          ? [...new Set(player.spellBook)].map((cardId) => ({ cardId, fromSpellBook: true }))
          : []),
        ...(player.scrolls ?? []).flatMap((scroll) =>
          [...new Set(scroll.spellCardIds)].map((cardId) => ({ cardId, fromScroll: scroll.id }))
        )
      ];

  // Tarnum over-limit casts: each flagged hand spell, offered with both
  // placements ("on the top of the Spell deck or on its discard pile").
  for (const cardId of tarnumFlagged) {
    if (!player.hand.includes(cardId)) {
      continue;
    }
    castCandidates.push({ cardId, tarnumReturn: "deck-top" });
    castCandidates.push({ cardId, tarnumReturn: "discard" });
  }

  // Helm of the Alabaster Unicorn (option B): cast the top card of the shared
  // Spell-deck discard pile. Offered like a scroll cast — the spell is sourced
  // from that discard, not the hand — and the Helm that enables it is removed by
  // the cast (its removal lives in performSpellCast). Only the public top card is
  // castable; the same timing/targeting rules below decide whether it can be cast
  // now (a map-only or untargetable top spell is simply not offered).
  // Helm of the Alabaster Unicorn (option B) casts the discard TOP; Ciele's Magic
  // Arrow IV — a hero-specialty enabler whose CAST_FROM_SPELL_DISCARD option sets
  // `spellId` — instead casts that specific Spell found anywhere in the discard
  // pile. Both are free bonus casts sourced from the Spell-deck discard pile and
  // consume the enabling card (see performSpellCast).
  for (const enablerId of [...new Set(player.hand)].filter((id) => cardEnablesSpellDeckCast(cards[id]))) {
    const enabler = cards[enablerId];
    const castOption =
      enabler?.effect.type === "CHOOSE_ONE"
        ? enabler.effect.options.find((o) => o.effect.type === "CAST_FROM_SPELL_DISCARD")
        : undefined;
    const spellIdFilter =
      castOption?.effect.type === "CAST_FROM_SPELL_DISCARD" ? castOption.effect.spellId : undefined;
    const discardPile = state.decks.spells?.discardPile ?? [];
    const sourceSpell = spellIdFilter
      ? [...discardPile].reverse().find((id) => id === spellIdFilter)
      : discardPile.at(-1);
    if (sourceSpell) {
      castCandidates.push({ cardId: sourceSpell, fromSpellDeck: enablerId });
    }
  }

  for (const { cardId, fromScroll, fromSpellDeck, fromSpellBook, tarnumReturn } of castCandidates) {
    const card = cards[cardId];
    if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
      continue;
    }

    // Attack-window instants (triggered spells) and Map spells route elsewhere.
    // A CHOOSE_ONE spell is NOT skipped wholesale: its trigger-free, directly-
    // castable arms are offered below as a real Spell cast (see the CHOOSE_ONE
    // branch); its triggered arms still wait for their reaction window.
    if (card.trigger || card.timing === "map") {
      continue;
    }

    if (!isPhaseAllowedForCard(state, card)) {
      continue;
    }

    // Activation spells need one of your own units active, pre-attack.
    const needsOwnActivation = card.timing === "combat" || card.timing === "action";
    if (needsOwnActivation && !ownActivationOpen) {
      continue;
    }

    // Neutral Pegasi toll: cannot cast without a separate Power card to pay.
    if (powerTaxed && !handCanPayPowerTax(player.hand, cards, cardId, Boolean(fromScroll))) {
      continue;
    }

    // A CHOOSE_ONE spell's trigger-free, directly-castable arm (Prayer's
    // +initiative side) is offered here as a real Spell cast, so it flows through
    // the normal pipeline (SPELL_CAST_STARTED window for Resist/Power, power
    // scaling, the one-Spell-per-round limit) and resolves the chosen option in
    // resolveTopStack. Its +attack/+defense arms carry triggers and were skipped
    // above, so they stay on the reaction-window path and are never offered here.
    if (card.effect.type === "CHOOSE_ONE") {
      addChooseOneSpellInstantCasts(actions, state, playerId, card, cardId, cards, {
        fromScroll,
        fromSpellDeck,
        fromSpellBook,
        tarnumReturn
      });
      continue;
    }

    // Earthquake works only against standing siege fortifications.
    if (card.effect.type === "EARTHQUAKE") {
      const siege = combat?.siege;
      if (!siege || (siege.walls.length === 0 && siege.gatePosition === null)) {
        continue;
      }
    }

    // Remove Obstacle needs at least one obstacle to lift: an obstacle marker, a
    // battlefield token (Force Field / Fire Wall / Quicksand / Land Mine), or a
    // standing siege Wall or Gate.
    if (card.effect.type === "REMOVE_OBSTACLE") {
      const siege = combat?.siege;
      const hasObstacleMarker = (combat?.obstacles ?? []).length > 0;
      const hasToken = (combat?.battlefieldTokens ?? []).length > 0;
      const hasFortification = Boolean(siege && (siege.walls.length > 0 || siege.gatePosition !== null));
      if (!hasObstacleMarker && !hasToken && !hasFortification) {
        continue;
      }
    }

    // Quicksand / Land Mine open a face-down placement picker on cast, so the
    // spell can only be cast when there is at least one empty space to drop a
    // token on (same "empty space" rule as the Summon spells above).
    if (card.effect.type === "PLACE_HIDDEN_TOKENS") {
      if (!combat) {
        continue;
      }
      const blocked = new Set<number>();
      for (const unit of Object.values(combat.units)) {
        if (isUnitAlive(unit)) {
          blocked.add(unit.position);
        }
      }
      for (const position of combat.obstacles ?? []) {
        blocked.add(position);
      }
      for (const token of combat.battlefieldTokens ?? []) {
        blocked.add(token.position);
      }
      for (const position of combat.siege?.walls ?? []) {
        blocked.add(position);
      }
      if (combat.siege?.gatePosition != null) {
        blocked.add(combat.siege.gatePosition);
      }
      let hasEmpty = false;
      for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
        if (!blocked.has(position)) {
          hasEmpty = true;
          break;
        }
      }
      if (!hasEmpty) {
        continue;
      }
    }

    // School of Magic (Air/Earth/Fire/Water Magic) in play matching this spell,
    // with an expert use to spend: a normal hand cast may instead discard the
    // permanent for its expert power bonus. Offered as a separate cast option so
    // the choice is made up front — never as a prompt after the cast.
    // A Scroll/Spell-deck cast can't pair a School of Magic permanent; a Book
    // cast can (it casts like a hand cast), so it is offered the expert variant.
    const schoolExpert =
      !fromScroll && !fromSpellDeck && !tarnumReturn && expertUsesAvailable(player) > 0
        ? getPermanentSchoolBonus(state, playerId, card)
        : null;

    for (const target of getTargetsForCard(state, playerId, cardId, cards)) {
      actions.push({
        label: fromScroll
          ? `Cast ${card.name} (Scroll)`
          : fromSpellDeck
            ? `Cast ${card.name} (Helm of the Alabaster Unicorn)`
            : fromSpellBook
              ? `Cast ${card.name} (Spell Book)`
              : tarnumReturn
                ? `Cast ${card.name} (free; ${tarnumReturn === "deck-top" ? "to Spell deck top" : "to Spell discard"})`
                : `Cast ${card.name}`,
        action: {
          type: "CAST_SPELL",
          playerId,
          cardId,
          target,
          ...(fromScroll ? { fromScroll } : {}),
          ...(fromSpellDeck ? { fromSpellDeck } : {}),
          ...(fromSpellBook ? { fromSpellBook: true } : {}),
          ...(tarnumReturn ? { tarnumReturn } : {})
        }
      });

      if (schoolExpert) {
        actions.push({
          label: `Cast ${card.name} + ${schoolExpert.card.name} (+${schoolExpert.expertPower} expert)${
            fromSpellBook ? " (Spell Book)" : ""
          }`,
          action: {
            type: "CAST_SPELL",
            playerId,
            cardId,
            target,
            useSchoolExpert: true,
            ...(fromSpellBook ? { fromSpellBook: true } : {})
          }
        });
      }
    }
  }
}

/**
 * Trigger-free CHOOSE_ONE Spell arms the spell-cast pipeline can resolve directly
 * (i.e. arms that resolveTopStack's CHOOSE_ONE-spell branch knows how to apply).
 * Today only Prayer's +initiative arm — a trigger-free CREATE_INITIATIVE_BUFF.
 * Any other trigger-free option type has no spell-cast resolution path yet, so it
 * stays skipped (never silently offered, then fizzling).
 */
function optionCastableAsCombatSpell(effect: ConcreteEffect): boolean {
  return effect.type === "CREATE_INITIATIVE_BUFF";
}

/**
 * Offers the trigger-free, directly-castable arms of a CHOOSE_ONE Spell as real
 * Spell casts (CAST_SPELL carrying an optionIndex + the option's own target).
 * This is the on-turn / off-turn cast path for Prayer's +initiative arm — the
 * arm that was previously unreachable. The triggered arms (+attack/+defense) are
 * deliberately NOT offered here: they wait for their UNIT_ATTACK_DECLARED
 * reaction window, exactly as before.
 */
function addChooseOneSpellInstantCasts(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  cardId: string,
  cards: CardLibrary,
  source: {
    fromScroll?: string;
    fromSpellDeck?: string;
    fromSpellBook?: boolean;
    tarnumReturn?: "deck-top" | "discard";
  }
): void {
  if (card.effect.type !== "CHOOSE_ONE") {
    return;
  }
  for (const [optionIndex, option] of card.effect.options.entries()) {
    // Triggered arms route through reaction windows; map-only arms never apply in
    // combat; everything the spell-cast dispatch can't resolve is left alone.
    if (option.trigger || option.mapOnly || !optionCastableAsCombatSpell(option.effect)) {
      continue;
    }
    for (const target of getTargetsForCard(state, playerId, cardId, cards, option.target)) {
      actions.push({
        label: source.fromScroll
          ? `Cast ${card.name} — ${option.label} (Scroll)`
          : source.fromSpellDeck
            ? `Cast ${card.name} — ${option.label} (Helm of the Alabaster Unicorn)`
            : source.fromSpellBook
              ? `Cast ${card.name} — ${option.label} (Spell Book)`
              : source.tarnumReturn
                ? `Cast ${card.name} — ${option.label} (free; ${
                    source.tarnumReturn === "deck-top" ? "to Spell deck top" : "to Spell discard"
                  })`
                : `Cast ${card.name} — ${option.label}`,
        action: {
          type: "CAST_SPELL",
          playerId,
          cardId,
          target,
          optionIndex,
          ...(source.fromScroll ? { fromScroll: source.fromScroll } : {}),
          ...(source.fromSpellDeck ? { fromSpellDeck: source.fromSpellDeck } : {}),
          ...(source.fromSpellBook ? { fromSpellBook: true } : {}),
          ...(source.tarnumReturn ? { tarnumReturn: source.tarnumReturn } : {})
        }
      });
    }
  }
}

function getTransformTargets(
  state: GameState,
  playerId: PlayerId,
  effect: Extract<ConcreteEffect, { type: "TRANSFORM_UNIT" }>
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  return Object.values(state.combat.units)
    .filter(
      (unit) =>
        unit.controllerId === playerId &&
        isUnitAlive(unit) &&
        canPlaceTransformOn(unit.name, unit.variant, unit.transforms, effect)
    )
    .map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

/**
 * Non-spell cards during combat, with the printed timing rules:
 *  - Instant cards may be played at any time (both players), except while an
 *    attack resolves — trigger cards wait for their reaction window instead.
 *  - Ongoing and activation cards may only be played while one of your own
 *    units is active and before it attacks.
 */
function addPlayableCardActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const player = state.players[playerId];
  const combat = state.combat;
  if (!player || !combat || !isCombatCardWindowOpen(state) || !isCombatParticipant(state, playerId)) {
    return;
  }

  // Garrison defense: the heroless defender cannot use their deck.
  if (isHandLockedInCombat(state, playerId)) {
    return;
  }

  const activeUnit = combat.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === playerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.kind === "spell" || card.implementationStatus !== "implemented") {
      continue;
    }

    // Permanents are played like activation cards: during one of your own
    // unit's activations, before it attacks. They enter play instead of
    // resolving (replacing the previous permanent — the one-permanent limit
    // applies in combat too). A hybrid permanent/instant artifact (income
    // rings and carts) instead exposes its sides through the CHOOSE_ONE option
    // machinery below, so it is not short-circuited here.
    if (card.permanent && card.effect.type !== "CHOOSE_ONE") {
      if (ownActivationOpen) {
        actions.push({
          label: `Put ${card.name} into play`,
          action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
        });
      }
      continue;
    }

    if (card.trigger || !isPhaseAllowedForCard(state, card)) {
      continue;
    }

    if (card.timing !== "combat" && card.timing !== "instant" && card.timing !== "ongoing" && card.timing !== "action") {
      continue;
    }

    const needsOwnActivation = card.timing !== "instant";
    if (needsOwnActivation && !ownActivationOpen) {
      continue;
    }

    if (card.effect.type === "CHOOSE_ONE") {
      // Options with a trigger wait for their reaction window; the rest play
      // directly when their effect makes sense in combat.
      addOptionPlays(actions, state, playerId, card, cardId, "combat", cards);
      continue;
    }

    if (card.effect.type === "TRANSFORM_UNIT") {
      for (const target of getTransformTargets(state, playerId, card.effect)) {
        actions.push({
          label: `Play ${card.name}`,
          action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target }
        });
      }
      continue;
    }

    // Necromancy is a map ability played after a combat win, never during one.
    if (card.effect.type === "NECROMANCY_REINFORCE") {
      continue;
    }

    for (const mode of getPlayableModesForCard(state, playerId, card)) {
      for (const target of getTargetsForCard(state, playerId, cardId, cards)) {
        actions.push({
          label: `Play ${card.name}${mode === "expert" ? " expert" : ""}`,
          action: {
            type: "PLAY_CARD",
            playerId,
            cardId,
            mode,
            target
          }
        });
      }
    }
  }
}

/**
 * The reactions a combat participant may take OFF-TURN — while it is not one of
 * their own units' activation: cast a Spell (Intelligence lifts the activation-
 * timing gate; trigger-free instant spells are castable by anyone), play an
 * instant ability/card (e.g. Intelligence itself), or use an active effect.
 *
 * This is the SINGLE source of truth for off-turn combat reactions, used two
 * ways: it is the exact menu offered to the reacting player during a
 * "pre-activation" pause, AND the pump opens that pause (neutral and PvP alike)
 * precisely when this is non-empty for the off-turn side. It only returns
 * anything while a combat card window is open (no attack/reaction/choice
 * resolving), so callers can rely on it being empty whenever the player has
 * nothing useful to do.
 *
 * To add a new off-turn reaction (a new instant, ability, or active effect),
 * make it appear here — it then both shows up in the pause and earns the
 * forced PvP stop automatically, with no change to the pump or reactor logic.
 */
export function getOffTurnCombatReactions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary
): LegalAction[] {
  const actions: LegalAction[] = [];
  addActiveEffectActions(actions, state, playerId);
  addSpellActions(actions, state, playerId, cards);
  addPlayableCardActions(actions, state, playerId, cards);
  // Instant damage specialties (Gerwulf's Ballista discard, Adelaide's Frost
  // Ring, Deemer's Meteor Shower) are "Instant" — playable off-turn during an
  // enemy unit's activation, not only on the owner's own turn. They are timed
  // "combat" (so addPlayableCardActions skips them off-turn); this offers just
  // their `combatAnytime` sides here.
  addCombatAnytimeSpecialtyPlays(actions, state, playerId, cards);
  return actions;
}

/**
 * The instant damage specialties a player may play OFF-TURN — i.e. during an
 * enemy unit's activation (Gerwulf's Ballista discard, Adelaide's Frost Ring,
 * Deemer's Meteor Shower). Only the `combatAnytime` options are offered, never a
 * card's own-turn-only sides (Gerwulf IV's free 1 damage, Gerwulf VI's ongoing
 * aim). These cards are timed "combat", so the normal off-turn card pass
 * (addPlayableCardActions) skips them while it is not the owner's turn — this
 * adds just their instant sides back. It self-gates to OFF-turn: when the
 * player's own unit is active and yet to act, the on-turn pass already offers
 * every option, so this no-ops to avoid double-listing.
 */
function addCombatAnytimeSpecialtyPlays(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const combat = state.combat;
  if (!combat || combat.outcome || combat.setup || !isCombatParticipant(state, playerId)) {
    return;
  }
  if (isHandLockedInCombat(state, playerId)) {
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  // On-turn (this player's own fresh unit is active), the standard card pass
  // offers every option, including these — skip to avoid offering them twice.
  const activeUnit = combat.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === playerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );
  if (ownActivationOpen) {
    return;
  }
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (
      !card ||
      card.kind !== "hero-specialty" ||
      card.implementationStatus !== "implemented" ||
      card.effect.type !== "CHOOSE_ONE" ||
      !card.effect.options.some((option) => option.combatAnytime)
    ) {
      continue;
    }
    addOptionPlays(actions, state, playerId, card, cardId, "combat", cards, (option) =>
      Boolean(option.combatAnytime)
    );
  }
}

/** Effects an "OR" option may resolve directly in the given context. */
function isOptionEffectPlayable(
  state: GameState,
  playerId: PlayerId,
  effect: ConcreteEffect,
  context: "combat" | "map",
  /** The card being played, excluded from "is there a card to remove" counts. */
  excludeCardId?: CardId
): boolean {
  switch (effect.type) {
    case "GAIN_RESOURCES":
      // Sephinroth's Valuables I: "Pay N gold to gain …" is only offered when the
      // player can actually afford the gold cost.
      return !effect.goldCost || (state.players[playerId]?.resources.gold ?? 0) >= effect.goldCost;
    case "DRAW_CARDS":
    // Legion artifacts' discount side: banking the one-shot recruit discount is
    // always a valid choice (it is spent later, on the map, by a recruit/reinforce).
    case "GAIN_RECRUIT_DISCOUNT":
    case "GAIN_MORALE":
    case "ENEMY_MORALE_STRIP":
    case "ROLL_FOR_MORALE":
    case "RANDOM_ENEMY_DISCARD":
    case "GAIN_EXPERT_USE":
    case "CREATE_ACTIVE_EFFECT":
      return true;
    case "ENTER_PLAY":
      // The permanent-income side of a hybrid artifact (Eversmoking Ring of
      // Sulfur, Inexhaustible Cart of Ore): putting the card into play is
      // always a valid choice in either context.
      return true;
    case "TAKE_FROM_DISCARD": {
      // Map play (needs an adventure), except Scholar's basic side
      // (allowInCombat) which may also be played mid-Combat — every other
      // TAKE_FROM_DISCARD card stays map-only.
      if (context === "map" ? !state.adventure : !(effect.allowInCombat && state.combat)) {
        return false;
      }
      const player = state.players[playerId];
      const pool = effect.fromTop ? (player?.discard.slice(-effect.fromTop) ?? []) : (player?.discard ?? []);
      return pool.some((cardId) => {
        const kind = cardLibrary[cardId]?.kind;
        if (effect.filter === "spell") {
          return kind === "spell";
        }
        if (effect.filter === "non-artifact") {
          return kind !== "artifact";
        }
        if (effect.filter === "spell-or-specialty") {
          return kind === "spell" || kind === "hero-specialty";
        }
        if (effect.filter === "magic-arrow") {
          return cardId === "spell.magic_arrow";
        }
        return true;
      });
    }
    case "SCHOLAR_EMPOWER_SWAP": {
      // Scholar's expert swap: map-only, and only with a non-empowered Statistic
      // card in hand or discard to trade in.
      if (context !== "map" || !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      if (!player) {
        return false;
      }
      return [...player.hand, ...player.discard].some((cardId) => {
        const card = cardLibrary[cardId];
        return card?.kind === "statistic" && Boolean(card.statisticType) && !cardId.endsWith(".empowered");
      });
    }
    case "CARD_DECK_SEARCH":
    case "EAGLE_EYE_DIG":
    case "TELEPORT_HERO_TO_TOWN":
    case "DISCOVER_TILE_CARD":
    case "GAIN_HERO_MOVEMENT":
    case "DIMENSION_DOOR":
    // Octavia "Gold" / Melodia "Fortune": Resource-die roll, morale/gold gain,
    // and the location-dice buff are all resolved through a queued map visit.
    case "RESOURCE_FORTUNE_PLAY":
      return context === "map" && Boolean(state.adventure);
    case "REMOVE_HAND_CARD_THEN_SEARCH": {
      // Map play that removes a card matching the filter (default "removable" =
      // ability / artifact / spell; Miriam's Scouting I narrows it to "ability"),
      // then Searches that card's deck. There must be at least one matching card
      // to remove OTHER than the card being played: the Hat is itself a removable
      // artifact (so it needs a second removable), while Miriam's hero-specialty
      // never matches the filter (so one matching card is enough).
      const removeFilter = effect.filter ?? "removable";
      const removable = removableHandCards(state, playerId, removeFilter).filter(
        (candidate) => candidate.cardId !== excludeCardId
      );
      return context === "map" && Boolean(state.adventure) && removable.length >= 1;
    }
    case "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD": {
      // Spellbinder's Hat (option B): map play; needs at least one OTHER card to
      // remove alongside the Hat (which is still in hand at this point).
      if (context !== "map" || !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      return Boolean(player && player.hand.length + player.discard.length >= 2);
    }
    case "VIEW_EARTH":
      // View Earth captures an enemy-owned Mine in reach — offered only when at
      // least one such Mine sits within this option's range of the caster's Hero.
      return (
        context === "map" &&
        Boolean(state.adventure) &&
        capturableEnemyMinesWithin(state, playerId, effect.withinFields).length > 0
      );
    case "DIPLOMACY_RECRUIT":
      // Diplomacy's Map side only does something with at least one Dwelling.
      return context === "map" && Boolean(state.adventure) && unlockedRecruitTiers(state, playerId).size > 0;
    case "VISIONS_SCRY":
      // Visions scrys a Neutral Unit deck — only useful when at least one tier
      // deck still holds cards.
      return (
        context === "map" &&
        Boolean(state.adventure) &&
        (["bronze", "silver", "gold", "azure"] as const).some((tier) => {
          const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
          return Boolean(deck) && deck.drawPile.length + deck.discardPile.length > 0;
        })
      );
    case "CREATE_INITIATIVE_BUFF":
    case "CREATE_ATTACK_BUFF":
    case "CREATE_DEFENSE_BUFF":
    case "ADD_UNIT_MAX_HEALTH":
    case "MOVE_UNIT_ADJACENT":
    case "HEAL_DAMAGE":
    // Shaman's Puppet (option B): a Cure-style cleanse, played in combat on a unit.
    case "HEAL_DAMAGE_AND_REMOVE_EFFECTS":
    case "AREA_DAMAGE_ALL_ADJACENT":
    case "AREA_DAMAGE_PICK_ADJACENT":
    case "CREATE_FIRE_SHIELD":
    case "GRANT_ELEMENTAL_DAMAGE":
    // Ballistics' expert bombardment: a combat play. The primary enemy is the
    // option's `enemy-unit` target (so an empty enemy board offers no play); the
    // building-material price is enforced by canAffordCardCost.
    case "BALLISTICS_BOMBARD":
    case "DAMAGE_LOWEST_INITIATIVE_ENEMY":
    // Septienna's Death Ripple: a targetless combat activation that sweeps every
    // enemy unit of a grade.
    case "DAMAGE_ENEMY_UNITS_BY_GRADE":
    // Oidana VI: a targetless combat activation that auras every neutral unit
    // the caster controls with +1 Attack for the whole battle.
    case "CREATE_VARIANT_ATTACK_BUFF":
    // Tarnum (Castle)'s Ballista VI / Gerwulf's Ballista IV: pick N enemy units
    // to damage (a targetless combat activation; the pick choice handles the rest).
    case "DAMAGE_CHOSEN_ENEMIES":
    // Tarnum (Dungeon)'s Dragons IV (line damage) / VI (toggle a Dragons unit's
    // Black cube) are combat plays.
    case "DAMAGE_BATTLEFIELD_LINE":
    case "TOGGLE_RETALIATION_MARKER":
    // Luna's Fire Wall specialty (I/VI): place a Fire Wall token on an empty
    // space — a combat play (its empty-space targets are generated generically).
    case "PLACE_FIRE_WALL_FIXED":
      return context === "combat" && Boolean(state.combat);
    case "GAIN_RUNES":
      // Kriv (Bulwark): bank Runes mid-combat — only a Bulwark caster benefits.
      return context === "combat" && Boolean(state.combat) && state.players[playerId]?.factionId === "bulwark";
    case "GAIN_STARTING_RUNES":
      // Kriv (Bulwark): become Rune-Empowered on the MAP — only a Bulwark caster
      // benefits, and only while the starting-rune flag is below the cap (so the
      // option is never offered once it can add nothing).
      return (
        context === "map" &&
        Boolean(state.adventure) &&
        state.players[playerId]?.factionId === "bulwark" &&
        (state.players[playerId]?.runeEmpoweredNextCombats ?? 0) < RUNE_MAX
      );
    case "RESHUFFLE_DISCARD_THEN_DRAW": {
      // Deemer's Meteor Shower IV deck-cycle: useful whenever there is a card to
      // shuffle back or draw (map or combat).
      const player = state.players[playerId];
      return Boolean(player && player.deck.length + player.discard.length > 0);
    }
    case "DECK_DIG_KEEP_MATCHING": {
      // Jeddite's Mysterious Warlock I/VI: a map dig — useful while the deck
      // still holds at least one card to look at.
      if (context !== "map" || !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      return Boolean(player && player.deck.length > 0);
    }
    case "SEARCH_DECK_THEN_RESHUFFLE": {
      // Adrienne's Fire Magic IV: a map Search + reshuffle — useful whenever
      // there is a card to reveal or a discard pile to shuffle back.
      if (context !== "map" || !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      return Boolean(player && player.deck.length + player.discard.length > 0);
    }
    case "DRAW_TOP_ARTIFACT": {
      // Tazar's War Hero VI: a map draw — useful while any Artifact deck (the
      // Legacy deck, or a BINH Minor/Major/Relic deck) still holds a card.
      if (context !== "map" || !state.adventure) {
        return false;
      }
      return ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"].some(
        (deckId) => (state.decks[deckId]?.drawPile.length ?? 0) > 0
      );
    }
    case "PLACE_PARALYSIS":
      // Ring of the Wayfarer's paralysis side is a combat play; the neutral /
      // opening-round gate lives on its `requiresNeutralCombatStart` flag.
      return context === "combat" && Boolean(state.combat);
    case "FORGETFULNESS":
      // Zilare's Forgetfulness specialty: a combat play; the grade/type gate
      // lives on the option's gradeByPower and target filters.
      return context === "combat" && Boolean(state.combat);
    case "PLACE_WEAKNESS_TOKEN":
      // Casmetra's Sorceresses VI (option A): a combat play that drops a
      // −2 Weakness token on a chosen unit.
      return context === "combat" && Boolean(state.combat);
    case "BLOCK_ENEMY_SURRENDER":
      // Shackles of War (house rule): only at the start of a player-vs-player
      // combat, where there is an enemy hero who could otherwise surrender.
      return context === "combat" && state.combat?.context.kind === "player" && state.combat.round === 1;
    case "BORROW_NEUTRAL_UNIT": {
      // Tarnum (Rampart) Sharpshooters VI: "Play at the start of Combat" — only on
      // combat round 1, and only while the unit is still available to borrow from
      // its tier's Neutral deck (draw or discard pile).
      if (context !== "combat" || !state.combat || state.combat.round !== 1) {
        return false;
      }
      const deck = state.decks[NEUTRAL_DECK_IDS[effect.tier]];
      return Boolean(
        deck && (deck.drawPile.includes(effect.unitDefId) || deck.discardPile.includes(effect.unitDefId))
      );
    }
    case "DOUBLE_FIRST_AID_TENT":
      // Gem's First Aid VI only does something with a First Aid Tent in play.
      return (
        context === "combat" &&
        Boolean(state.combat) &&
        state.activeEffects.some(
          (active) =>
            active.controllerId === playerId &&
            active.modifiers.some((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND")
        )
      );
    case "CONVERT_ARMY_UNIT": {
      // Gelu's Sharpshooters IV: needs a Pack of Elves, the Sharpshooters still
      // in the silver Neutral deck, and (unique) no Sharpshooters already owned.
      if (context !== "map" || !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      const deck = state.decks[NEUTRAL_DECK_IDS[effect.toTier]];
      if (!player || !deck) {
        return false;
      }
      // Tarnum (Conflux) IV pays gold instead of trading in a unit, so the
      // from-unit requirement only applies when fromUnitDefId is set.
      const hasFrom = effect.fromUnitDefId
        ? player.army.some(
            (unit) => unit.unitDefId === effect.fromUnitDefId && unit.side === effect.fromSide
          )
        : true;
      const canPayGold = !effect.goldCost || player.resources.gold >= effect.goldCost;
      const blockedByUnique =
        Boolean(effect.unique) && player.army.some((unit) => unit.unitDefId === effect.toUnitDefId);
      const deckHasTarget =
        deck.drawPile.includes(effect.toUnitDefId) || deck.discardPile.includes(effect.toUnitDefId);
      return hasFrom && canPayGold && !blockedByUnique && deckHasTarget;
    }
    case "SIEGE_DEMOLISH": {
      const siege = state.combat?.siege;
      if (context !== "combat" || !siege) {
        return false;
      }
      return effect.target === "arrow-tower"
        ? Boolean(siege.arrowTowerUnitId)
        : siege.walls.length > 0 || siege.gatePosition !== null;
    }
    case "GAIN_WAR_MACHINE": {
      // Torosar's Ballista I "Pay 5 gold to gain a Ballista": needs the machine
      // still in the supply and enough gold (a map/economy play).
      if (context !== "map" || !state.adventure) {
        return false;
      }
      if (!(state.adventure.warMachineSupply ?? []).includes(effect.warMachineCardId)) {
        return false;
      }
      const buyer = state.players[playerId];
      return !effect.goldCost || (buyer?.resources.gold ?? 0) >= effect.goldCost;
    }
    case "BALLISTA_SPECIALTY":
      // Torosar's Ballista I "Activate your Ballista" needs one to activate; the
      // IV/VI grants always do something (and bring their own Ballista).
      if (context !== "combat" || !state.combat) {
        return false;
      }
      if (effect.activate === "one" && !effect.grant) {
        return countBallistas(state, playerId) >= 1;
      }
      return true;
    case "DISCARD_WAR_MACHINE_DAMAGE":
      // Gerwulf's Ballista IV/VI discard: needs an in-play war-machine card to
      // discard (a temporary Torosar grant is not a card and cannot be spent).
      return (
        context === "combat" &&
        Boolean(state.combat) &&
        getPermanentCardIds(state, playerId).includes(effect.warMachineCardId)
      );
    case "REMOVE_ACTIVE_EFFECT":
      // Boots of Polarity (option B): only worth playing while at least one
      // removable, unit-scoped ongoing effect is on the table to strip.
      return (
        context === "combat" &&
        Boolean(state.combat) &&
        state.activeEffects.some(
          (active) => active.target?.type === "unit" && active.removable !== false
        )
      );
    default:
      return false;
  }
}

/** Whether the option's effect needs a unit on the battlefield as target. */
function optionNeedsUnitTarget(effect: ConcreteEffect): boolean {
  // A unit-scoped active effect (Pendant of Second Sight's Paralysis immunity)
  // is placed on a chosen unit; player/global-scoped ones (Golden Bow, the
  // Orbs) pick no unit.
  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return effect.effect.scope === "unit";
  }

  return (
    effect.type === "CREATE_INITIATIVE_BUFF" ||
    effect.type === "CREATE_ATTACK_BUFF" ||
    effect.type === "CREATE_DEFENSE_BUFF" ||
    effect.type === "ADD_UNIT_MAX_HEALTH" ||
    effect.type === "MOVE_UNIT_ADJACENT" ||
    effect.type === "HEAL_DAMAGE" ||
    // Shaman's Puppet (option B): a Cure-style cleanse placed on a chosen unit.
    effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS" ||
    effect.type === "AREA_DAMAGE_ALL_ADJACENT" ||
    effect.type === "AREA_DAMAGE_PICK_ADJACENT" ||
    effect.type === "GRANT_ELEMENTAL_DAMAGE" ||
    effect.type === "DAMAGE_LOWEST_INITIATIVE_ENEMY" ||
    // Ballistics' expert bombardment: the player picks the primary enemy unit.
    effect.type === "BALLISTICS_BOMBARD" ||
    // Gerwulf's Ballista discard: the player picks which enemy unit it hits.
    effect.type === "DISCARD_WAR_MACHINE_DAMAGE" ||
    // Tarnum (Dungeon)'s Dragons VI: toggle the Black cube on a chosen Dragons unit.
    effect.type === "TOGGLE_RETALIATION_MARKER" ||
    effect.type === "PLACE_PARALYSIS" ||
    // Zilare's Forgetfulness specialty (the chosen enemy cannot attack next activation).
    effect.type === "FORGETFULNESS" ||
    // Casmetra's Sorceresses VI (option A) drops a Weakness token on a chosen unit.
    effect.type === "PLACE_WEAKNESS_TOKEN" ||
    // Boots of Polarity (option B): the ongoing effect it strips lives on a
    // chosen unit (yours or the enemy's).
    effect.type === "REMOVE_ACTIVE_EFFECT"
  );
}

/** Highest grade unlocked by the paid power (mirrors the reducer's gate). */
function gradeAtPower(
  gradeByPower: Record<number, CombatUnitState["grade"]>,
  power: number
): CombatUnitState["grade"] | null {
  const thresholds = Object.keys(gradeByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matched = thresholds.filter((value) => value <= power).at(-1);
  return matched === undefined ? null : (gradeByPower[matched] ?? null);
}

/**
 * Direct plays of "OR" card options outside reaction windows — Estates'
 * gold, Logistics' ongoing step, an artifact's "Remove this card: gain 6
 * gold", Boots of Speed's initiative side, and so on.
 */
function addOptionPlays(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  cardId: string,
  context: "combat" | "map",
  cards: CardLibrary,
  // When given, only options matching the predicate are offered. Used to offer
  // ONLY the `combatAnytime` instant sides off-turn (so a card's own-turn-only
  // sides, e.g. Gerwulf IV's free 1 damage, are never offered during an enemy's
  // activation window).
  filter?: (option: CardOptionDefinition) => boolean,
  // Spell Book (house rule): when true the card is an "OR" Map Spell played from
  // the Book, so every PLAY_CARD offer here carries `fromSpellBook`.
  fromSpellBook?: boolean
): void {
  if (card.effect.type !== "CHOOSE_ONE") {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }

  // Spell "OR" cards (Prayer) still respect the combat spell limit.
  if (card.kind === "spell" && state.combat && player.combatStats.spellsCastThisRound >= spellLimitFor(state, player)) {
    return;
  }

  for (const [optionIndex, option] of card.effect.options.entries()) {
    if (option.trigger) {
      continue;
    }
    if (filter && !filter(option)) {
      continue;
    }
    if (option.mapOnly && context !== "map") {
      continue;
    }
    if (option.combatOnly && context !== "combat") {
      continue;
    }
    // Shackles of War's "block the enemy's Surrender" side is never played from
    // hand: Surrender is a before-battle (defender prep) decision, so the block is
    // offered to the attacker as a dedicated start-of-combat choice instead (see
    // maybeOpenShacklesDecision). Played mid-fight it would be a no-op.
    if (option.effect.type === "BLOCK_ENEMY_SURRENDER") {
      continue;
    }
    // Mystic Orb of Mana's "draw 2" option is offered only on an empty discard.
    if (option.requiresEmptyDiscard && (state.players[playerId]?.discard.length ?? 0) > 0) {
      continue;
    }
    // Crown of the Five Seas' sea side: only while this player's main Hero is on
    // a Sea (water-terrain) field.
    if (option.requiresSeaTile) {
      const hero = getMainHero(state, playerId);
      if (!hero?.spaceId || !isSeaField(state, hero.spaceId)) {
        continue;
      }
    }
    // Ring of the Wayfarer's paralysis side: only at the start (opening round)
    // of a Combat against Neutral Units.
    if (option.requiresNeutralCombatStart) {
      if (!state.combat || state.combat.context.kind !== "neutral" || state.combat.round !== 1) {
        continue;
      }
    }
    // Jeremy's Cannon IV/VI "use the Cannon" side: only while the player has the
    // war-machine card in play (the same gate as Torosar's "if you have one").
    if (option.requiresWarMachine && !getPermanentCardIds(state, playerId).includes(option.requiresWarMachine)) {
      continue;
    }
    if (!isOptionEffectPlayable(state, playerId, option.effect, context, cardId)) {
      continue;
    }
    // Legion artifacts' discount side: hide it unless there is a unit to spend it
    // on, and never let one piece bank twice in a turn. Once this card has banked
    // a voucher this turn its discount side disappears (its resource side stays),
    // so it cannot be replayed for a second voucher after being pulled back from
    // the discard pile; and with no recruitable/reinforceable target the only
    // sensible choice is the resource side, so the discount side is withheld
    // (this also guarantees the selection prompt is never opened empty).
    if (option.effect.type === "GAIN_RECRUIT_DISCOUNT") {
      const alreadyBanked = player.recruitDiscounts?.some((voucher) => voucher.cardId === cardId) ?? false;
      if (alreadyBanked || legionDiscountTargets(state, playerId).length === 0) {
        continue;
      }
    }
    if (!canAffordCardCost(state, playerId, cardId, option.cost)) {
      continue;
    }

    // An Empowered ability may take its Expert side without a crown.
    const expertOk = canPlayExpertMode(player, cardId);
    const modes: CardPlayMode[] = option.expertOnly
      ? expertOk
        ? ["expert"]
        : []
      : effectSupportsExpertOption(option.effect) && expertOk
        ? ["basic", "expert"]
        : ["basic"];

    let targets = optionNeedsUnitTarget(option.effect)
      ? getTargetsForCard(state, playerId, cardId, cards, option.target)
      : [{ type: "none" } as TargetRef];

    // Some options only land on a named unit (Moandor's elemental grant reads
    // "your Liches unit").
    const restrictName =
      option.effect.type === "GRANT_ELEMENTAL_DAMAGE" ? option.effect.targetUnitName : undefined;
    if (restrictName) {
      targets = targets.filter(
        (candidate) => candidate.type === "unit" && state.combat?.units[candidate.unitId]?.name === restrictName
      );
    }

    // Ring of the Wayfarer's paralysis side reads "any unit except Azure": its
    // gradeByPower gate unlocks gold at Power 0, so units above that grade
    // (Azure) are never legal targets — keep the offered list in step with the
    // resolution gate rather than offering a no-op.
    // Zilare's Forgetfulness specialty shares the same grade gate: its option
    // unlocks a fixed top grade (I -> silver, IV/VI -> gold), so units above it
    // are never offered rather than offering a no-op.
    if (option.effect.type === "PLACE_PARALYSIS" || option.effect.type === "FORGETFULNESS") {
      const gradeByPower = option.effect.gradeByPower;
      targets = targets.filter((candidate) => {
        if (candidate.type !== "unit") {
          return true;
        }
        const unit = state.combat?.units[candidate.unitId];
        if (!unit) {
          return false;
        }
        const maxGrade = gradeAtPower(gradeByPower, card.power ?? 0);
        return maxGrade !== null && gradeRankOfUnit(unit) <= gradeRank(maxGrade);
      });
    }
    // Necklace of Swiftness's "Move one of your units 1 space": only offer a
    // unit that has at least one empty orthogonally-adjacent space to step onto
    // (occupied spaces, obstacles, Walls and the Gate are blocked) — otherwise
    // the move would be a no-op. Mirrors the Clone target filter.
    if (option.effect.type === "MOVE_UNIT_ADJACENT" && state.combat) {
      const combat = state.combat;
      const blocked = new Set<number>();
      for (const unit of Object.values(combat.units)) {
        if (isUnitAlive(unit)) {
          blocked.add(unit.position);
        }
      }
      for (const position of combat.obstacles ?? []) {
        blocked.add(position);
      }
      for (const position of combat.siege?.walls ?? []) {
        blocked.add(position);
      }
      if (combat.siege?.gatePosition != null) {
        blocked.add(combat.siege.gatePosition);
      }
      targets = targets.filter((candidate) => {
        if (candidate.type !== "unit") {
          return false;
        }
        const unit = combat.units[candidate.unitId];
        return Boolean(unit) && getOrthogonalNeighbors(unit!.position).some((position) => !blocked.has(position));
      });
    }
    // Boots of Polarity (option B): only units that actually carry a removable
    // ongoing effect are legal targets, so the play is never a no-op.
    if (option.effect.type === "REMOVE_ACTIVE_EFFECT") {
      targets = targets.filter(
        (candidate) =>
          candidate.type === "unit" &&
          state.activeEffects.some(
            (active) =>
              active.target?.type === "unit" &&
              active.target.unitId === candidate.unitId &&
              active.removable !== false
          )
      );
    }
    if (targets.length === 0) {
      continue;
    }

    for (const mode of modes) {
      for (const target of targets) {
        actions.push({
          label: `${card.name}: ${option.label}${mode === "expert" && !option.expertOnly ? " (expert)" : ""}${
            fromSpellBook ? " (Spell Book)" : ""
          }`,
          action: {
            type: "PLAY_CARD",
            playerId,
            cardId,
            mode,
            optionIndex,
            target,
            ...(fromSpellBook ? { fromSpellBook: true } : {})
          }
        });
      }
    }
  }
}

/** Expert sides of option effects playable outside reaction windows. */
function effectSupportsExpertOption(effect: ConcreteEffect): boolean {
  if (effect.type === "DRAW_CARDS") {
    return effect.expertAmount !== undefined;
  }
  if (effect.type === "GAIN_RESOURCES") {
    return effect.expertGain !== undefined;
  }
  if (effect.type === "GAIN_HERO_MOVEMENT") {
    return effect.expertAmount !== undefined;
  }
  if (effect.type === "GAIN_MORALE") {
    return effect.expertDrawCards !== undefined;
  }
  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return Boolean(effect.expertEffect);
  }
  // Eagle Eye: the expert play digs for an Expert spell instead.
  if (effect.type === "EAGLE_EYE_DIG") {
    return true;
  }
  return false;
}

/** Effects that do something useful when played on the adventure map. */
function isMapPlayableEffect(state: GameState, playerId: PlayerId, card: CardDefinition, effect: ConcreteEffect): boolean {
  if (card.timing === "map") {
    return true;
  }

  if (effect.type === "DRAW_CARDS" || effect.type === "GAIN_MORALE") {
    return true;
  }

  // Offense/Armorer (ADD_COMBAT_STAT) and Sorcery (ADD_SPELL_POWER) carry a
  // "then draw a card" rider: "may be played outside Combat just for the draw."
  // On the map the stat/Power has nothing to apply to and fizzles; the draw runs.
  if ((effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER") && effect.drawCards) {
    return true;
  }

  if (
    effect.type === "GAIN_RESOURCES" ||
    // Octavia's "Gold" / Melodia's "Fortune": roll Resource dice, gain morale /
    // gold, or raise the location-dice count — all map-only economy plays.
    effect.type === "RESOURCE_FORTUNE_PLAY" ||
    // Legion artifacts' discount side: banked on the map for the next recruit.
    effect.type === "GAIN_RECRUIT_DISCOUNT" ||
    effect.type === "ENEMY_MORALE_STRIP" ||
    effect.type === "ROLL_FOR_MORALE" ||
    effect.type === "RANDOM_ENEMY_DISCARD" ||
    effect.type === "GAIN_EXPERT_USE" ||
    // Gem's First Aid: grab the Tent from the supply (or draw) on the map.
    effect.type === "GAIN_WAR_MACHINE"
  ) {
    return true;
  }

  if (isOptionEffectPlayable(state, playerId, effect, "map") && effect.type !== "CREATE_ACTIVE_EFFECT") {
    return true;
  }

  // Fortune: its Attack-die reroll effect also rerolls the map Treasure/Resource
  // dice (the adventureDice flag), so it is useful on the adventure map.
  if (effect.type === "CREATE_ATTACK_DIE_REROLL" && effect.adventureDice) {
    return true;
  }

  return (
    effect.type === "CREATE_ACTIVE_EFFECT" &&
    effect.effect.modifiers.some(
      (modifier) =>
        modifier.type === "ADVENTURE_DIE_REROLL" ||
        modifier.type === "ADVENTURE_DIE_SET" ||
        modifier.type === "SEARCH_COUNT_OVERRIDE" ||
        modifier.type === "SEARCH_REPEAT_ONCE" ||
        modifier.type === "SPELL_SCHOOL_FETCH" ||
        modifier.type === "END_TURN_ADJACENT_MOVE" ||
        modifier.type === "HERO_MOVE_THROUGH"
    )
  );
}

/**
 * Cards playable during your own map turn, outside combat: Instant and
 * Ongoing cards (Luck before dice, Estates' gold, Scouting before a search,
 * Eagle Eye, map spells like Town Portal…). Map-timed cards can never be
 * used during combat.
 */
function addTurnCardActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const player = state.players[playerId];
  if (!player || state.combat || state.activePlayerId !== playerId || state.pendingChoice || state.reactionWindow) {
    return;
  }

  // Spell Book (house rule): a Map Spell in the Book may be cast on your turn
  // exactly like a hand Spell, flagged `fromSpellBook` so it resolves from (and
  // returns to the discard from) the Book. The Book holds only Spells; the gates
  // below drop anything that is not a Map-playable Spell.
  const turnCardSources: { cardId: CardId; fromSpellBook?: true }[] = [
    ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
    ...(spellBookRuleEnabled(state)
      ? [...new Set(player.spellBook)].map((cardId) => ({ cardId, fromSpellBook: true as const }))
      : [])
  ];

  for (const { cardId, fromSpellBook } of turnCardSources) {
    const card = cards[cardId];
    if (!card || card.implementationStatus !== "implemented") {
      continue;
    }

    // Permanents may also enter play on the owner's map turn (they are
    // played the same way as map cards). A plain permanent offers a single
    // enter-play action; a hybrid permanent/instant artifact (income rings and
    // carts) exposes its enter-play side AND its one-shot instant side through
    // the CHOOSE_ONE option machinery below instead. (Book entries are Spells,
    // never permanents, so this branch never fires for them.)
    if (card.permanent && card.effect.type !== "CHOOSE_ONE") {
      actions.push({
        label: `Put ${card.name} into play`,
        action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
      });
      continue;
    }

    // Trigger cards wait for their windows — except the "+stat / +Power, then
    // draw a card" instants (Offense/Armorer's ADD_COMBAT_STAT, Sorcery's
    // ADD_SPELL_POWER), which may be played outside their window just for the
    // card draw: with no attack/spell to apply it to the stat/Power fizzles, but
    // the draw rider still resolves (see the matching reducer handler).
    const drawOnly =
      (card.effect.type === "ADD_COMBAT_STAT" || card.effect.type === "ADD_SPELL_POWER") &&
      Boolean(card.effect.drawCards);
    if (card.trigger && !drawOnly) {
      continue;
    }

    // Spells reach the map only when printed as Map effects (Town Portal) or
    // when their effect is otherwise useful there (Fortune's adventure-die
    // rerolls — same gate isMapPlayableEffect applies to non-spell cards).
    if (card.kind === "spell" && card.timing !== "map") {
      const mapUsable =
        card.effect.type !== "CHOOSE_ONE" && isMapPlayableEffect(state, playerId, card, card.effect);
      if (!mapUsable) {
        continue;
      }
    }

    if (card.timing !== "instant" && card.timing !== "ongoing" && card.timing !== "map") {
      continue;
    }

    if (card.effect.type === "CHOOSE_ONE") {
      addOptionPlays(actions, state, playerId, card, cardId, "map", cards, undefined, fromSpellBook);
      continue;
    }

    // Necromancy is NEVER a free-turn play: it is legal ONLY in the now-or-never
    // after-combat window (the pendingNecromancy gate in
    // getAdventureLegalActions, surfaced via addNecromancyPlays). Skip it here so
    // a player can't bank gold during the turn and reinforce cheaply later.
    if (card.effect.type === "NECROMANCY_REINFORCE") {
      continue;
    }

    // Sandro's Cloak: place the specialty card on a matching unit card during
    // your turn (it rides into the next combat).
    if (card.effect.type === "TRANSFORM_UNIT") {
      const effectDef = card.effect;
      for (const armyUnit of player.army) {
        const def = coreUnitDefinitions[armyUnit.unitDefId];
        if (def && canPlaceTransformOn(def.name, armyUnit.side, armyUnit.transforms, effectDef)) {
          actions.push({
            label: `Place ${card.name} on ${def.name}`,
            action: {
              type: "PLAY_CARD",
              playerId,
              cardId,
              mode: "basic",
              target: { type: "none" },
              armyUnitId: armyUnit.id
            }
          });
        }
      }
      continue;
    }

    const effect = card.effect;
    if (!isMapPlayableEffect(state, playerId, card, effect)) {
      continue;
    }

    const modes: CardPlayMode[] =
      effectSupportsExpertOption(effect) && canPlayExpertMode(player, cardId) ? ["basic", "expert"] : ["basic"];
    for (const mode of modes) {
      actions.push({
        label: `Play ${card.name}${mode === "expert" ? " (expert)" : ""}${fromSpellBook ? " (Spell Book)" : ""}`,
        action: {
          type: "PLAY_CARD",
          playerId,
          cardId,
          mode,
          target: { type: "none" },
          ...(fromSpellBook ? { fromSpellBook: true } : {})
        }
      });
    }
  }
}

/**
 * Spell Book (house rule): on your own map turn you may move any Spell from hand
 * into your Spell Book, freeing the hand slot without drawing a replacement.
 * Offered only outside combat / reaction windows / pending choices — the same
 * "your map turn" gate addTurnCardActions uses.
 */
function addSpellBookStashActions(actions: LegalAction[], state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  if (!spellBookRuleEnabled(state)) {
    return;
  }
  const player = state.players[playerId];
  if (!player || state.combat || state.activePlayerId !== playerId || state.pendingChoice || state.reactionWindow) {
    return;
  }
  // Over the hand limit at the start of the turn, the forced discard
  // (REFRESH_HAND) must be resolved FIRST — you cannot dodge it by stashing a
  // Spell into the Book. getAdventureLegalActions already returns before reaching
  // here while needsHandRefresh is set; this guard states the rule explicitly.
  if (player.needsHandRefresh) {
    return;
  }
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    // Magic Arrow (any starting-only Spell) may be held and cast, but never
    // stashed — it has no Spell Book home (spellCanEnterSpellBook).
    if (card?.kind === "spell" && spellCanEnterSpellBook(cardId)) {
      actions.push({
        label: `Move ${card.name} to your Spell Book`,
        action: { type: "MOVE_SPELL_TO_SPELL_BOOK", playerId, cardId }
      });
    }
  }
}

/**
 * The after-combat Necromancy plays for a Necropolis player who holds one. A
 * copy drawn from the Ability deck on level-up is kept but never playable (house
 * rule). Vidomina's specialties pin the tier (no expert crown); the printed
 * ability may be played basic, or expert when a crown use is spare. Used only
 * inside the pendingNecromancy now-or-never gate.
 */
function addNecromancyPlays(actions: LegalAction[], state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  const player = state.players[playerId];
  if (!player || player.factionId !== "necropolis") {
    return;
  }

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.effect.type !== "NECROMANCY_REINFORCE") {
      continue;
    }
    if (player.deckDrawnAbilityCardIds?.includes(cardId)) {
      continue;
    }

    if (card.effect.forceMode) {
      actions.push({
        label: `Play ${card.name}`,
        action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
      });
    } else {
      const modes: CardPlayMode[] = canPlayExpertMode(player, cardId) ? ["basic", "expert"] : ["basic"];
      for (const mode of modes) {
        actions.push({
          label: `Play ${card.name}${mode === "expert" ? " (expert)" : ""}`,
          action: { type: "PLAY_CARD", playerId, cardId, mode, target: { type: "none" } }
        });
      }
    }
  }
}

function isSimultaneousTurnAvailable(state: GameState, playerId: PlayerId): boolean {
  return (
    state.turn.mode === "simultaneous" &&
    state.round <= state.turn.simultaneousRoundLimit &&
    state.phase !== "combat" &&
    state.phase !== "reaction" &&
    !state.turn.completedPlayerIds.includes(playerId)
  );
}

/**
 * Rulebook voluntary removal: the owner may put an in-play permanent into
 * the discard pile at any open moment (no reaction window or choice pending).
 */
function addPermanentDiscardActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }

  for (const cardId of getPermanentCardIds(state, playerId)) {
    actions.push({
      label: `Discard ${cardLibrary[cardId]?.name ?? cardId} from play`,
      action: { type: "DISCARD_PERMANENT", playerId, cardId }
    });
  }
}

function addActiveEffectActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || state.phase !== "combat" || state.stack.length > 0 || state.reactionWindow || state.pendingChoice) {
    return;
  }
  actions.push(...firstAidHealActions(state, playerId));
}

/**
 * The First Aid Tent (and any HEAL_ONCE_PER_COMBAT_ROUND active effect) heal
 * plays available to `playerId` right now — one per wounded friendly unit. This
 * is the *content* of the heal offer with no timing gate of its own, so it can
 * be surfaced both on the player's turn (addActiveEffectActions) and as an
 * instant reaction the moment one of their units is attacked
 * (getLegalReactionsForTrigger), letting the owner mend a wound BEFORE the
 * incoming attack's damage is calculated.
 */
export function firstAidHealActions(state: GameState, playerId: PlayerId): LegalAction[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }

  const out: LegalAction[] = [];
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }

    const healModifier = effect.modifiers.find((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND");
    if (!healModifier || healModifier.type !== "HEAL_ONCE_PER_COMBAT_ROUND") {
      continue;
    }

    // First Aid Tent: one basic heal per round, OR — if the player holds the
    // First Aid ability card with a free expert use — spend it (discarding the
    // card) to heal the same target several times this round. The volley size is
    // read from that card (firstAidVolleyHeals), mirroring Artillery/Ballista.
    const usage = effect.healRound?.round === combat.round ? effect.healRound : undefined;
    const expertMax = firstAidVolleyHeals();
    const canBasic = !usage;
    const canExpertActivate = !usage && playerCanUseFirstAidVolley(state, playerId);
    const canExpertContinue = Boolean(usage?.expert && usage.count < expertMax);
    if (!canBasic && !canExpertActivate && !canExpertContinue) {
      continue;
    }

    for (const unit of Object.values(combat.units)) {
      if (unit.controllerId !== playerId || !isUnitAlive(unit) || unit.damage <= 0) {
        continue;
      }
      const target = { type: "unit" as const, unitId: unit.id };

      // Basic heal and expert continuations omit the mode (it defaults to
      // basic), so plays submitted without a mode still match.
      if (canBasic) {
        out.push({
          label: `${effect.name} heal ${unit.name}`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target }
        });
      }
      if (canExpertActivate) {
        out.push({
          label: `${effect.name} expert: heal ${unit.name} (1/${expertMax}, spend 1 crown)`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target, mode: "expert" }
        });
      }
      // The expert volley resolves against the SAME target each time, so only
      // the unit pinned by the first expert heal is offered the continuation.
      if (canExpertContinue && (!usage?.targetUnitId || usage.targetUnitId === unit.id)) {
        out.push({
          label: `${effect.name} heal ${unit.name} (${(usage?.count ?? 0) + 1}/${expertMax})`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target }
        });
      }
    }
  }
  return out;
}

const FIRST_AID_ABILITY_CARD_ID = "ability.first_aid" as CardId;

/**
 * The First Aid ability card's BASIC heal played as an instant reaction the
 * moment one of `playerId`'s units is attacked — one offer per wounded friendly
 * unit, the chosen target travelling on the reaction's `target` (mirroring the
 * Bowstring ranged-activation reaction). This is the card held in hand mending 1
 * damage BEFORE the incoming hit is calculated, so a healed unit can survive a
 * blow that would otherwise defeat it. It is available even WITHOUT a First Aid
 * Tent in play (the Tent's own per-round heal is surfaced separately by
 * firstAidHealActions). The card's EXPERT side is never played from hand — it
 * rides the Tent's heal (USE_ACTIVE_EFFECT, mode "expert"), so only the basic
 * side (option 0) is offered here.
 */
export function firstAidCardHealReactions(state: GameState, playerId: PlayerId): LegalAction[] {
  const combat = state.combat;
  const player = state.players[playerId];
  if (!combat || !player || isHandLockedInCombat(state, playerId)) {
    return [];
  }
  if (!player.hand.includes(FIRST_AID_ABILITY_CARD_ID)) {
    return [];
  }
  const card = cardLibrary[FIRST_AID_ABILITY_CARD_ID];
  if (!card || card.implementationStatus !== "implemented") {
    return [];
  }

  const out: LegalAction[] = [];
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== playerId || !isUnitAlive(unit) || unit.damage <= 0) {
      continue;
    }
    out.push(
      makeReactionAction(`${card.name} heal ${unit.name}`, {
        type: "PLAY_REACTION",
        playerId,
        cardId: FIRST_AID_ABILITY_CARD_ID,
        mode: "basic",
        optionIndex: 0,
        target: { type: "unit", unitId: unit.id }
      })
    );
  }
  return out;
}

function addUnitAbilityActions(actions: LegalAction[], state: GameState, playerId: PlayerId, activeUnit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || activeUnit.movedThisActivation) {
    return;
  }

  for (const ability of getUnitAbilityDefinitions(activeUnit)) {
    if (ability.implementationStatus !== "implemented") {
      continue;
    }

    if (ability.effect?.type === "ACTIVATION_ATTACK_BUFF") {
      for (const target of Object.values(combat.units)) {
        if (
          target.controllerId !== playerId ||
          !isUnitAlive(target) ||
          !ability.effect.targetTypes.includes(target.type)
        ) {
          continue;
        }

        actions.push({
          label: `${activeUnit.name} use ${ability.name} on ${target.name}`,
          action: {
            type: "USE_UNIT_ABILITY",
            playerId,
            unitId: activeUnit.id,
            abilityId: ability.id,
            target: { type: "unit", unitId: target.id }
          }
        });
      }
    }

    // Pit Lords' "Summon Demons" other action: only after a friendly unit has
    // been removed this combat, and once per combat per Pit Lords unit. Used
    // instead of moving or attacking (the caller already gated on those).
    if (
      ability.effect?.type === "SUMMON_OR_REINFORCE_DEMONS" &&
      combat.unitRemovedControllerIds?.includes(playerId) &&
      !activeUnit.summonedThisCombat
    ) {
      const demonDefId = ability.effect.demonUnitDefId;
      const demonName = coreUnitDefinitions[demonDefId]?.name ?? "Demons";

      // Summon: place a Few of Demons on an empty adjacent space.
      if (getUnitSide(demonDefId, "few")) {
        const occupied = new Set<number>(
          Object.values(combat.units)
            .filter(isUnitAlive)
            .map((candidate) => candidate.position)
        );
        for (const position of combat.obstacles ?? []) {
          occupied.add(position);
        }
        for (const position of getOrthogonalNeighbors(activeUnit.position)) {
          if (!isBattlefieldPosition(position) || occupied.has(position)) {
            continue;
          }
          actions.push({
            label: `${activeUnit.name}: Summon a Few of ${demonName} at ${getBattlefieldLabel(position)}`,
            action: { type: "SUMMON_DEMONS", playerId, unitId: activeUnit.id, mode: "summon", position }
          });
        }
      }

      // Reinforce: flip a friendly Few of Demons up to a Pack at no cost.
      if (getUnitSide(demonDefId, "pack")) {
        for (const candidate of Object.values(combat.units)) {
          if (
            candidate.controllerId === playerId &&
            isUnitAlive(candidate) &&
            candidate.unitDefId === demonDefId &&
            candidate.variant === "few"
          ) {
            actions.push({
              label: `${activeUnit.name}: Reinforce ${candidate.cardName} to a Pack`,
              action: {
                type: "SUMMON_DEMONS",
                playerId,
                unitId: activeUnit.id,
                mode: "reinforce",
                targetUnitId: candidate.id
              }
            });
          }
        }
      }
    }

    // Token "other actions": Ogres' Attack ("Bloodlust") token, Few Sorceresses'
    // Weakness token. A single "use" command opens a board target picker (the
    // ABILITY_TARGET_CHOICE the player resolves by clicking a glowing unit) —
    // offered only when at least one legal recipient exists, so a side with no
    // eligible target never advertises a dead button.
    if (ability.effect?.type === "PLACE_TOKEN_ACTION") {
      const effect = ability.effect;
      const hasCandidate = Object.values(combat.units).some((target) => {
        const sideOk =
          effect.targets === "any" ||
          (effect.targets === "friendly" && target.controllerId === activeUnit.controllerId) ||
          (effect.targets === "enemy" && target.controllerId !== activeUnit.controllerId);
        return (
          sideOk &&
          isUnitAlive(target) &&
          !isArrowTowerUnit(target) &&
          (!effect.targetTypes || effect.targetTypes.includes(target.type))
        );
      });
      if (hasCandidate) {
        actions.push({
          label: `${activeUnit.name}: ${ability.name} (${effect.amount >= 0 ? "+" : ""}${effect.amount})`,
          action: {
            type: "USE_UNIT_ABILITY",
            playerId,
            unitId: activeUnit.id,
            abilityId: ability.id,
            target: { type: "none" }
          }
        });
      }
    }

    // Tower Genies (Few) "Wish" other action: dig Spells out of your own deck.
    // Used instead of moving/attacking, and only when the deck (or its discard
    // pile, which reshuffles in) still holds a card to dig.
    if (
      ability.effect?.type === "DECK_DISCARD_TAKE_SPELL" &&
      ability.effect.trigger === "other-action" &&
      !activeUnit.attackedThisActivation
    ) {
      const player = state.players[playerId];
      if ((player?.deck.length ?? 0) + (player?.discard.length ?? 0) > 0) {
        actions.push({
          label: `${activeUnit.name}: ${ability.name} (discard ${ability.effect.count} from your deck, take a Spell)`,
          action: { type: "USE_GENIE_DECK_DRAW", playerId, unitId: activeUnit.id }
        });
      }
    }
  }
}

/**
 * Siege demolition: the active unit may bring down a Wall or the Gate as its
 * attack — adjacent ground/flying units always, Cyclops-style units at any
 * range (their pack version also levels the Arrow Tower).
 */
function addFortificationActions(actions: LegalAction[], state: GameState, playerId: PlayerId, activeUnit: CombatUnitState): void {
  const combat = state.combat;
  const siege = combat?.siege;
  if (!combat || !siege || activeUnit.attackedThisActivation) {
    return;
  }

  const demolish = getDemolishAbility(activeUnit);
  const targets: { kind: "wall" | "gate"; position: number }[] = [
    ...siege.walls.map((position) => ({ kind: "wall" as const, position })),
    ...(siege.gatePosition !== null ? [{ kind: "gate" as const, position: siege.gatePosition }] : [])
  ];

  for (const target of targets) {
    const adjacentDemolisher =
      activeUnit.type !== "ranged" && isAdjacent(activeUnit.position, target.position);
    if (!adjacentDemolisher && !demolish) {
      continue;
    }

    actions.push({
      label: `${activeUnit.cardName} destroy the ${target.kind === "wall" ? "Wall" : "Gate"} at ${getBattlefieldLabel(target.position)}`,
      action: { type: "ATTACK_FORTIFICATION", playerId, attackerId: activeUnit.id, target }
    });
  }

  if (demolish?.canTargetArrowTower && siege.arrowTowerUnitId) {
    actions.push({
      label: `${activeUnit.cardName} destroy the Arrow Tower`,
      action: { type: "ATTACK_FORTIFICATION", playerId, attackerId: activeUnit.id, target: { kind: "arrow-tower" } }
    });
  }
}

/** Berserk: move destinations that step strictly closer to a nearest target. */
function berserkApproachSquares(
  unit: CombatUnitState,
  nearest: CombatUnitState[],
  moveDestinations: number[]
): number[] {
  return moveDestinations.filter((space) =>
    nearest.some(
      (target) =>
        getBattlefieldDistance(space, target.position) <
        getBattlefieldDistance(unit.position, target.position)
    )
  );
}

/**
 * The forced menu of a berserked unit: it must attack the nearest unit (friend
 * or foe) or move to the nearest unit and attack it. In priority order —
 *  1. strike a nearest unit it can already hit (the only options offered);
 *  2. else move-and-attack / step adjacent to a nearest unit to strike this turn
 *     (those squares only — the board's move-then-attack flow forces the hit);
 *  3. else advance on a nearest unit (the squares that close the distance);
 *  4. else (boxed in, or alone on the board) hold.
 * Every branch drops Defend, abilities and free movement — that is the spell.
 */
function addBerserkUnitActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  activeUnit: CombatUnitState
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const hold: LegalAction = {
    label: `${activeUnit.name} hold position`,
    action: { type: "END_ACTIVATION", playerId, unitId: activeUnit.id }
  };

  // Its forced strike is spent — the activation is over.
  if (activeUnit.attackedThisActivation) {
    actions.push(hold);
    return;
  }

  const nearest = getBerserkNearestTargets(combat, activeUnit);
  if (nearest.length === 0) {
    actions.push(hold);
    return;
  }

  // 1. Attack a nearest unit it can reach from here (ranged shots included).
  let canStrikeNow = false;
  for (const target of nearest) {
    if (canUnitAttack(combat, activeUnit, target, state.activeEffects)) {
      canStrikeNow = true;
      actions.push({
        label: `${activeUnit.name} attack ${target.name}`,
        action: { type: "ATTACK_UNIT", playerId, attackerId: activeUnit.id, defenderId: target.id }
      });
    }
  }
  if (canStrikeNow) {
    return;
  }

  const moveDestinations = getLegalMoveDestinations(combat, activeUnit, state);
  if (moveDestinations.length === 0) {
    actions.push(hold);
    return;
  }

  // 2. Close in and strike a nearest unit this activation.
  const strikeSquares = new Set<number>();
  for (const target of nearest) {
    for (const space of moveDestinations) {
      if (isAdjacent(space, target.position) && canUnitMoveAndAttack(combat, activeUnit, space, target, state)) {
        strikeSquares.add(space);
        actions.push({
          label: `${activeUnit.name} move to ${getBattlefieldLabel(space)} and attack ${target.name}`,
          action: {
            type: "MOVE_AND_ATTACK_UNIT",
            playerId,
            attackerId: activeUnit.id,
            destination: space,
            defenderId: target.id
          }
        });
      }
    }
  }
  if (strikeSquares.size > 0) {
    for (const space of strikeSquares) {
      actions.push({
        label: `${activeUnit.name} move to ${getBattlefieldLabel(space)}`,
        action: { type: "MOVE_UNIT", playerId, unitId: activeUnit.id, destination: space }
      });
    }
    return;
  }

  // 3. Cannot reach a strike — advance on a nearest unit (closing squares only).
  const approaches = berserkApproachSquares(activeUnit, nearest, moveDestinations);
  if (approaches.length === 0) {
    actions.push(hold);
    return;
  }
  for (const space of approaches) {
    actions.push({
      label: `${activeUnit.name} move to ${getBattlefieldLabel(space)}`,
      action: { type: "MOVE_UNIT", playerId, unitId: activeUnit.id, destination: space }
    });
  }
}

function addUnitActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (combat && (combat.setup || combat.awaitingContinue)) {
    return;
  }

  if (!combat?.activeUnitId) {
    if (combat && playerId === combat.attackerPlayerId && state.mode !== "adventure") {
      actions.push({
        label: "Start next combat round",
        action: { type: "END_COMBAT_ROUND", playerId }
      });
    }
    return;
  }

  const activeUnit = combat.units[combat.activeUnitId];
  if (!activeUnit || activeUnit.controllerId !== playerId || activeUnit.activatedThisRound) {
    return;
  }

  // Berserk: the unit must attack the nearest unit (friend or foe), or move to
  // it and attack — no free move, defend, ability or hold while a target stands.
  if (unitIsBerserk(state.activeEffects, activeUnit)) {
    addBerserkUnitActions(actions, state, playerId, activeUnit);
    return;
  }

  const alreadyAttacked = Boolean(activeUnit.attackedThisActivation);

  if (!alreadyAttacked) {
    addUnitAbilityActions(actions, state, playerId, activeUnit);
    addFortificationActions(actions, state, playerId, activeUnit);
  }

  for (const destination of getLegalMoveDestinations(combat, activeUnit, state)) {
    actions.push({
      label: `${activeUnit.name} move to ${getBattlefieldLabel(destination)}`,
      action: {
        type: "MOVE_UNIT",
        playerId,
        unitId: activeUnit.id,
        destination
      }
    });
  }

  // Ranged units shoot first and may step afterwards; everyone else may move
  // first and then attack an adjacent enemy. canUnitAttack enforces that a
  // ranged unit that already moved gave up its attack.
  if (!alreadyAttacked) {
    for (const defender of Object.values(combat.units)) {
      if (!canUnitAttack(combat, activeUnit, defender, state.activeEffects)) {
        continue;
      }

      actions.push({
        label: `${activeUnit.name} attack ${defender.name}`,
        action: {
          type: "ATTACK_UNIT",
          playerId,
          attackerId: activeUnit.id,
          defenderId: defender.id
        }
      });
    }
  }

  if (!alreadyAttacked && !isArrowTowerUnit(activeUnit)) {
    // Defend replaces the attack, so a unit that already moved may still
    // defend. The Arrow Tower never defends — it only shoots or holds.
    actions.push({
      label: `${activeUnit.name} defend`,
      action: {
        type: "DEFEND_UNIT",
        playerId,
        unitId: activeUnit.id
      }
    });
  }

  // Once a unit has begun acting (moved or fired), it may finish its activation
  // without forcing an attack or defend — e.g. a ranged unit holding after a
  // shot. The Arrow Tower may always hold instead of shooting.
  if (alreadyAttacked || activeUnit.movedThisActivation || isArrowTowerUnit(activeUnit)) {
    actions.push({
      label: `${activeUnit.name} hold position`,
      action: {
        type: "END_ACTIVATION",
        playerId,
        unitId: activeUnit.id
      }
    });
  }
}

function addDeckSearchActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  // Searches are normally granted by rewards (level ups, treasure fields,
  // town actions). Until the adventure-map reward loop is implemented, the
  // active player may demo the full search flow from the table decks.
  if (state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }

  if (state.activePlayerId !== playerId) {
    return;
  }

  for (const deckId of SHARED_DECK_IDS) {
    const deck = state.decks[deckId];
    if (!deck || deck.drawPile.length + deck.discardPile.length === 0) {
      continue;
    }

    actions.push({
      label: `Search 2 in the ${deckId} deck`,
      action: {
        type: "SEARCH_DECK",
        playerId,
        deckId,
        count: 2
      }
    });
  }
}

/**
 * Rogues (army map ability): once during your turn, look at the top card of any
 * deck. Offered per shared/neutral deck that has cards, only while it's your
 * uninterrupted turn and the scout has not been used yet.
 */
function addRoguesScoutActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.combat || state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }
  if (state.activePlayerId !== playerId) {
    return;
  }
  const player = state.players[playerId];
  if (!player || player.rogueScoutUsedThisTurn || !armyHasMapEffect(state, playerId, "MAP_TURN_DECK_PEEK")) {
    return;
  }

  for (const [deckId, deck] of Object.entries(state.decks)) {
    if (deck.drawPile.length === 0) {
      continue;
    }
    actions.push({
      label: `Rogues: scout the top of the ${deckId} deck`,
      action: { type: "ROGUES_SCOUT_DECK", playerId, deckId }
    });
  }
}

function addHeroMoveActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.combat || (state.phase !== "map" && state.phase !== "player-turn")) {
    return;
  }

  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId !== playerId || hero.movementPoints <= 0 || !hero.spaceId) {
      continue;
    }

    const space = state.map.spaces[hero.spaceId];
    for (const adjacentSpaceId of space?.adjacent ?? []) {
      actions.push({
        label: `Move hero to ${adjacentSpaceId}`,
        action: {
          type: "MOVE_HERO",
          playerId,
          heroId: hero.id,
          to: adjacentSpaceId
        }
      });
    }
  }
}

function hasResources(
  resources: Record<ResourceKind, number>,
  cost: ResourceCost
): boolean {
  return (Object.entries(cost) as [ResourceKind, number][]).every(
    ([resource, amount]) => resources[resource] >= amount
  );
}

export function canPlayerBuildStructure(
  state: GameState,
  playerId: PlayerId,
  townId: TownId,
  buildingId: BuildingId,
  buildings: BuildingLibrary = sampleBuildings
): boolean {
  const player = state.players[playerId];
  const town = state.towns[townId];
  const building = buildings[buildingId];

  if (!player || !town || !building || building.implementationStatus !== "implemented") {
    return false;
  }

  if (town.controllerId !== playerId || town.buildings.includes(buildingId)) {
    return false;
  }

  if (!hasResources(player.resources, building.cost)) {
    return false;
  }

  return (building.prerequisites ?? []).every((prerequisiteId) => town.buildings.includes(prerequisiteId));
}

function addTownBuildActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  buildings: BuildingLibrary
): void {
  for (const town of Object.values(state.towns)) {
    if (town.controllerId !== playerId) {
      continue;
    }

    for (const building of Object.values(buildings)) {
      if (!canPlayerBuildStructure(state, playerId, town.id, building.id, buildings)) {
        continue;
      }

      actions.push({
        label: `Build ${building.name}`,
        action: {
          type: "BUILD_STRUCTURE",
          playerId,
          townId: town.id,
          buildingId: building.id
        }
      });
    }
  }
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary,
  buildings: BuildingLibrary = sampleBuildings
): LegalAction[] {
  if (state.phase === "game-over") {
    // An adventure combat that just ended waits on the battlefield until a
    // participant closes the end-of-combat notice; only that acknowledgment
    // is legal here (sandbox results stay on the table until a reset).
    if (
      state.mode === "adventure" &&
      state.combat?.outcome &&
      !state.combat.endAcknowledged &&
      state.combat.context.kind !== "sandbox" &&
      isCombatParticipant(state, playerId)
    ) {
      return [
        {
          label: "Return to the adventure map",
          action: { type: "ACKNOWLEDGE_COMBAT_END", playerId }
        }
      ];
    }
    return [];
  }

  if (state.pendingChoice) {
    if (state.pendingChoice.playerId !== playerId) {
      return [];
    }

    if (state.pendingChoice.type === "OPTION_CHOICE") {
      const choice = state.pendingChoice;
      return choice.options.map((option, optionIndex) => ({
        label: option.label,
        action: {
          type: "CHOOSE_OPTION",
          playerId,
          choiceId: choice.id,
          optionIndex
        }
      }));
    }

    if (state.pendingChoice.type === "COMBAT_HAND_DISCARD") {
      const choice = state.pendingChoice;
      const actions: LegalAction[] = choice.powerCardIds.map((cardId) => ({
        label: `Discard ${cards[cardId]?.name ?? cardId}`,
        action: {
          type: "RESOLVE_COMBAT_DISCARD",
          playerId,
          choiceId: choice.id,
          cardId
        }
      }));
      // The Magi drain also offers a random discard; the Pegasi toll is a pure
      // "pay a Power card of your choice" — no random option.
      if (choice.kind === "magi-power-or-random") {
        actions.push({
          label: "Let a random card be discarded",
          action: {
            type: "RESOLVE_COMBAT_DISCARD",
            playerId,
            choiceId: choice.id,
            cardId: "random"
          }
        });
      }
      return actions;
    }

    if (state.pendingChoice.type === "TARNUM_SEARCH") {
      const choice = state.pendingChoice;
      // Tarnum (Conflux) VI: pick ONE Spell deck (basic or expert) to Search 1
      // card from — only decks that still hold a card are offered.
      const actions: LegalAction[] = [];
      const decks = [SPELL_DECK_BASIC, SPELL_DECK_EXPERT].filter(
        (deckId) => (state.decks[deckId]?.drawPile.length ?? 0) > 0
      );
      for (const [optionIndex, deckId] of decks.entries()) {
        actions.push({
          label: `Search the ${deckId === SPELL_DECK_EXPERT ? "expert" : "basic"} Spell deck`,
          action: { type: "CHOOSE_OPTION", playerId, choiceId: choice.id, optionIndex }
        });
      }
      return actions;
    }

    if (state.pendingChoice.type === "DECK_SEARCH") {
      const choice = state.pendingChoice;
      // The discard-top and Basic X Magic "draw from a School of Magic"
      // alternatives are resolved up front (the "deck-search-mode" option
      // choice), so once a player is looking at the revealed cards they only
      // keep one of those — no fall back to the discard pile or a fetch here.
      const actions: LegalAction[] = choice.revealedCardIds.map((cardId, index) => ({
        label: `Keep ${cards[cardId]?.name ?? cardId}`,
        action: {
          type: "RESOLVE_DECK_SEARCH",
          playerId,
          choiceId: choice.id,
          pick: { kind: "revealed", index }
        }
      }));

      // Tarnum (Conflux) I: each revealed card may instead be Removed from the
      // game rather than kept in hand.
      if (choice.allowRemove) {
        for (const [index, cardId] of choice.revealedCardIds.entries()) {
          actions.push({
            label: `Remove ${cards[cardId]?.name ?? cardId}`,
            action: {
              type: "RESOLVE_DECK_SEARCH",
              playerId,
              choiceId: choice.id,
              pick: { kind: "revealed", index, remove: true }
            }
          });
        }
      }

      return actions;
    }

    if (state.pendingChoice.type === "ABILITY_TARGET_CHOICE") {
      const choice = state.pendingChoice;
      const verb =
        choice.kind === "second-attack"
          ? `${choice.abilityName}: attack`
          : choice.kind === "enchanter-activation"
            ? `${choice.abilityName}: heal`
            : choice.kind === "jotunn-teleport"
              ? `${choice.abilityName}: teleport`
              : choice.kind === "place-token"
                ? `${choice.abilityName}: place on`
              : choice.kind === "spell-redirect"
              ? `${choice.abilityName}: redirect to`
              : choice.kind === "flat-damage" ||
                  choice.kind === "spell-splash" ||
                  choice.kind === "ballistics-splash" ||
                  choice.kind === "area-pick" ||
                  choice.kind === "faerie-damage" ||
                  choice.kind === "chain-lightning" ||
                  choice.kind === "war-machine"
                ? `${choice.abilityName}: hit`
                : "Neutrals attack";
      const targetActions = choice.candidateUnitIds.flatMap((unitId) => {
        // Catapult bombardment: a Wall/Gate target is a pseudo-id, not a unit.
        const fort = parseFortificationTargetId(unitId);
        if (fort) {
          return [
            {
              label: `${choice.abilityName}: batter the ${fort.kind === "gate" ? "Gate" : "Wall"}`,
              action: {
                type: "CHOOSE_ABILITY_TARGET",
                playerId,
                choiceId: choice.id,
                targetUnitId: unitId
              }
            } satisfies LegalAction
          ];
        }
        const unit = state.combat?.units[unitId];
        if (!unit || !isUnitAlive(unit)) {
          return [];
        }
        return [
          {
            label: `${verb} ${unit.cardName}`,
            action: {
              type: "CHOOSE_ABILITY_TARGET",
              playerId,
              choiceId: choice.id,
              targetUnitId: unitId
            }
          } satisfies LegalAction
        ];
      });

      // Optional choices carry a skip (Fireball's empty second space, the
      // Enchanters' "+1 Attack instead" of healing).
      if (choice.optional) {
        targetActions.push({
          label: choice.skipLabel ?? "Skip (no second target)",
          action: {
            type: "CHOOSE_ABILITY_TARGET",
            playerId,
            choiceId: choice.id,
            targetUnitId: "skip"
          }
        });
      }

      return targetActions;
    }

    // A reroll replaces the previous result (rulebook): only the latest roll
    // can be kept, earlier candidates are history.
    const latestIndex = state.pendingChoice.candidates.length - 1;
    const latest = state.pendingChoice.candidates[latestIndex];
    const actions: LegalAction[] = [
      {
        label: `Keep the attack roll ${latest.roll >= 0 ? "+" : ""}${latest.roll}`,
        action: {
          type: "CHOOSE_PENDING_ROLL",
          playerId,
          choiceId: state.pendingChoice?.id ?? "",
          candidateIndex: latestIndex
        }
      }
    ];

    const nextSource = state.pendingChoice.rerollSources.find((source) =>
      rerollSourceAvailableFor(source, latest.roll)
    );
    if (nextSource) {
      actions.push({
        label: `Reroll attack die (${nextSource.name})`,
        action: {
          type: "REROLL_PENDING_CHOICE",
          playerId,
          choiceId: state.pendingChoice.id
        }
      });
    }

    return actions;
  }

  if (state.reactionWindow) {
    if (state.reactionWindow.priorityPlayerId !== playerId) {
      return [];
    }

    return [
      ...(state.reactionWindow.legalReactions[playerId] ?? []),
      {
        label:
          state.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED"
            ? "Keep normal attack"
            : "Pass reaction",
        action: { type: "PASS_REACTION", playerId }
      }
    ];
  }

  if (state.setupLobby && state.phase === "setup") {
    return getSetupLobbyLegalActions(state, playerId);
  }

  if (state.mode === "adventure") {
    return getAdventureLegalActions(state, playerId, cards);
  }

  if (isSimultaneousTurnAvailable(state, playerId)) {
    const actions: LegalAction[] = [];
    addTownBuildActions(actions, state, playerId, buildings);
    actions.push({
      label: "Complete simultaneous turn",
      action: { type: "COMPLETE_SIMULTANEOUS_TURN", playerId }
    });
    return actions;
  }

  if (
    state.turn.mode === "simultaneous" &&
    state.round <= state.turn.simultaneousRoundLimit &&
    state.phase !== "combat" &&
    state.phase !== "reaction"
  ) {
    return [];
  }

  if (state.activePlayerId !== playerId) {
    // Even while the opponent's unit is active you may still cast your one
    // spell per combat round, slot in trigger-free instants, use the First Aid
    // Tent, and play an instant damage specialty (Gerwulf/Adelaide/Deemer) —
    // these are "Instant" and playable at any time during the Combat.
    const anytimeActions: LegalAction[] = [];
    addActiveEffectActions(anytimeActions, state, playerId);
    addSpellActions(anytimeActions, state, playerId, cards);
    addPlayableCardActions(anytimeActions, state, playerId, cards);
    addCombatAnytimeSpecialtyPlays(anytimeActions, state, playerId, cards);
    return anytimeActions;
  }

  const actions: LegalAction[] = [];
  addActiveEffectActions(actions, state, playerId);

  if (state.phase === "town") {
    addTownBuildActions(actions, state, playerId, buildings);
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  if (!state.combat || state.phase !== "combat") {
    addHeroMoveActions(actions, state, playerId);
    addDeckSearchActions(actions, state, playerId);
    addRoguesScoutActions(actions, state, playerId);
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  addUnitActions(actions, state, playerId);
  addSpellActions(actions, state, playerId, cards);
  addPlayableCardActions(actions, state, playerId, cards);
  addDeckSearchActions(actions, state, playerId);
  if (isCombatParticipant(state, playerId)) {
    addPermanentDiscardActions(actions, state, playerId);
    // A positive morale token may be spent mid-combat for its draw / discard-
    // redraw here (the reroll use is offered by the attack-die reroll choice).
    addMoraleActions(actions, state, playerId);
  }

  return actions;
}

/**
 * Alamar's Resurrection save window: when a unit is about to die, offer its
 * controller the grade-matching, affordable Resurrection option(s) — and
 * nothing else. Passing lets the unit die.
 */
/**
 * Shield of the Dwarven Lords: after a real Attack die roll, the defending
 * unit's controller may play it to ignore the die. Offered only to that
 * controller, only while the die-cancel has not already been armed, and never
 * when the defender's hand is locked out of the Combat.
 */
/**
 * Bowstring of the Unicorn's Mane: a player's ranged units that may be activated
 * out of order in the pre-activation window — alive, ranged, not yet activated
 * this round, and not the unit currently about to activate.
 */
function getActivateRangedUnitTargets(
  state: GameState,
  playerId: PlayerId,
  aboutToActivateUnitId: UnitId,
  // Valeska's Marksmen VI may re-fire a ranged unit that has already acted; the
  // Bowstring leaves this false so it only reaches not-yet-activated units.
  allowAlreadyActivated = false
): UnitId[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }
  return Object.values(combat.units)
    .filter(
      (unit) =>
        unit.controllerId === playerId &&
        isUnitAlive(unit) &&
        unit.type === "ranged" &&
        (allowAlreadyActivated || !unit.activatedThisRound) &&
        unit.id !== aboutToActivateUnitId
    )
    .map((unit) => unit.id);
}

function getDieCancelReactions(
  state: GameState,
  defenderId: UnitId,
  attackerId: UnitId,
  cards: CardLibrary,
  roll: number
): Record<PlayerId, LegalAction[]> {
  const combat = state.combat;
  const defender = combat?.units[defenderId];
  if (!combat || !defender) {
    return {};
  }
  // Bowstring of the Unicorn's Mane (option B) is gated to a ranged attacker.
  const attackerIsRanged = combat.units[attackerId]?.type === "ranged";
  const playerId = defender.controllerId;
  const player = state.players[playerId];
  if (!player || playerId === NEUTRAL_PLAYER_ID || isHandLockedInCombat(state, playerId)) {
    return {};
  }

  // Only one die-cancel per attack: if it is already armed, offer nothing more.
  const pendingAttack = state.stack.find(
    (item) => item.action.type === "ATTACK_UNIT" || item.action.type === "MOVE_AND_ATTACK_UNIT"
  );
  if (pendingAttack?.modifiers.attackDieCancelled) {
    return {};
  }

  const reactions: LegalAction[] = [];
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.implementationStatus !== "implemented" || card.effect.type !== "CHOOSE_ONE") {
      continue;
    }
    for (const [optionIndex, option] of card.effect.options.entries()) {
      if (option.effect.type !== "IGNORE_ATTACK_DIE_RESULT") {
        continue;
      }
      // Bowstring of the Unicorn's Mane: only "after a ranged unit's Attack die
      // roll". Shield of the Dwarven Lords sets no such gate and is always offered.
      if (option.requiresRangedAttacker && !attackerIsRanged) {
        continue;
      }
      if (!canAffordCardCost(state, playerId, cardId, option.cost)) {
        continue;
      }
      reactions.push(
        makeReactionAction(`${card.name}: ${option.label}`, {
          type: "PLAY_REACTION",
          playerId,
          cardId,
          mode: "basic",
          optionIndex
        })
      );
    }
  }

  // Castle Halberdiers (Pack): the DEFENDING unit itself may discard a card to
  // ignore the Attack die. Offered only on a "+1" face (the sole result worth
  // cancelling — ignoring a 0/−1 never helps the defender) and only while the
  // controller still holds a card to pay the discard cost. Not a card play, so
  // it is pushed as a plain unit-ability reaction (like the Archangels' save).
  if (roll > 0 && player.hand.length > 0 && getDiscardToIgnoreAttackDieAbility(defender)) {
    reactions.push({
      label: `${defender.cardName}: discard a card to ignore the Attack die`,
      action: { type: "USE_UNIT_DIE_IGNORE", playerId, defenderUnitId: defender.id }
    });
  }

  return reactions.length > 0 ? { [playerId]: reactions } : {};
}

/**
 * Misfortune's dedicated pre-buff window: the instant an enemy unit declares an
 * attack, the attacked unit's controller may play Misfortune — before any other
 * card — to negate that attack's die and lock the attacker out of buffing it.
 * Only the option whose grade matches the attacking unit is offered, and only
 * when affordable and within the one-Spell-per-combat-round limit. Returns the
 * defender's offers (or nothing, so the pre-window simply does not open and the
 * normal buff window takes over).
 */
function getMisfortunePreWindowReactions(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }>,
  cards: CardLibrary
): Record<PlayerId, LegalAction[]> {
  const combat = state.combat;
  const attacker = combat?.units[triggerEvent.attackerId];
  const defender = combat?.units[triggerEvent.defenderId];
  if (!combat || !attacker || !defender) {
    return {};
  }
  const playerId = defender.controllerId;
  const player = state.players[playerId];
  if (!player || playerId === NEUTRAL_PLAYER_ID || isHandLockedInCombat(state, playerId)) {
    return {};
  }
  // Misfortune is a Spell, so it respects the one-Spell-per-round limit.
  if (spellLimitFor(state, player) - player.combatStats.spellsCastThisRound <= 0) {
    return {};
  }

  const reactions: LegalAction[] = [];
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (
      !card ||
      card.kind !== "spell" ||
      card.implementationStatus !== "implemented" ||
      card.effect.type !== "CHOOSE_ONE"
    ) {
      continue;
    }
    for (const [optionIndex, option] of card.effect.options.entries()) {
      // Only the option whose grade matches the attacking unit (Power 0/1/2 →
      // bronze/silver/gold) is offered, and only when its Power cost is payable.
      if (
        option.effect.type !== "NEGATE_ATTACK" ||
        option.effect.grade === undefined ||
        gradeRankOfUnit(attacker) !== gradeRank(option.effect.grade) ||
        !canAffordCardCost(state, playerId, cardId, option.cost)
      ) {
        continue;
      }
      reactions.push(
        makeReactionAction(`${card.name}: ${option.label}`, {
          type: "PLAY_REACTION",
          playerId,
          cardId,
          mode: "basic",
          optionIndex
        })
      );
    }
  }

  return reactions.length > 0 ? { [playerId]: reactions } : {};
}

function getLethalSaveReactions(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "UNIT_LETHAL_HIT" }>,
  cards: CardLibrary
): Record<PlayerId, LegalAction[]> {
  const combat = state.combat;
  const defender = combat?.units[triggerEvent.defenderId];
  if (!combat || !defender) {
    return {};
  }
  const playerId = defender.controllerId;
  const player = state.players[playerId];
  if (!player || playerId === NEUTRAL_PLAYER_ID) {
    return {};
  }

  // The killing blow is saved at most once: if a save is already armed on the
  // pending attack, offer nothing more so a second source can't double-save.
  const pendingAttack = state.stack.find(
    (item) => item.action.type === "ATTACK_UNIT" || item.action.type === "MOVE_AND_ATTACK_UNIT"
  );
  if (pendingAttack?.modifiers.cancelLethal) {
    return {};
  }

  const reactions: LegalAction[] = [];

  // Deck-based saves (the Resurrection Spell, Alamar's Resurrection specialty)
  // are played from the controller's hand, so they are unavailable whenever
  // that controller "cannot use your Deck during this Combat" — a Secondary
  // Hero leads the fight, or a heroless garrison defends. The Archangels' free
  // unit ability below is NOT a Deck card, so it must still be offered then.
  if (!isHandLockedInCombat(state, playerId)) {
    // A Resurrection-style Spell counts against the one-Spell-per-combat-round
    // limit (Expert Knowledge / Intelligence raise it); the specialty and the
    // Archangels' ability do not.
    const spellLimitReached = player.combatStats.spellsCastThisRound >= spellLimitFor(state, player);

    for (const cardId of new Set(player.hand)) {
      const card = cards[cardId];
      if (!card || card.implementationStatus !== "implemented" || card.effect.type !== "CHOOSE_ONE") {
        continue;
      }
      if (card.kind === "spell" && spellLimitReached) {
        continue;
      }
      for (const [optionIndex, option] of card.effect.options.entries()) {
        if (
          option.effect.type !== "CANCEL_LETHAL_ATTACK" ||
          defender.bankUnit ||
          option.effect.grade !== defender.grade
        ) {
          continue;
        }
        if (!canAffordCardCost(state, playerId, cardId, option.cost)) {
          continue;
        }
        reactions.push(
          makeReactionAction(`${card.name}: ${option.label}`, {
            type: "PLAY_REACTION",
            playerId,
            cardId,
            mode: "basic",
            optionIndex
          })
        );
      }
    }
  }

  // Archangels (Pack): a free once-per-combat cancel of a killing blow on any
  // OTHER friendly unit (any grade), offered as a unit-ability reaction.
  for (const unit of Object.values(combat.units)) {
    if (
      unit.controllerId !== playerId ||
      unit.id === defender.id ||
      unit.damage >= unit.maxHealth ||
      unit.usedLethalSaveThisCombat
    ) {
      continue;
    }
    const ability = getLethalSaveUnitAbility(unit);
    if (!ability) {
      continue;
    }
    reactions.push({
      label: `${unit.cardName}: ${ability.abilityName} (cancel the killing blow, once per Combat)`,
      action: { type: "USE_UNIT_RESURRECTION", playerId, savingUnitId: unit.id }
    });
  }

  return reactions.length > 0 ? { [playerId]: reactions } : {};
}

/**
 * The unit Magic Mirror would lift the Spell OFF of for `playerId`, or null when
 * the card cannot fire for them in this window. This is the "your unit is about
 * to be targeted or damaged" gate, and the unit it returns is excluded from the
 * new-target candidates (you cannot redirect a Spell onto the very unit it was
 * already going to hit). null with eligibility still true means a space-centred
 * blast (Inferno) where no single unit is the anchor — every legal unit qualifies.
 */
function magicMirrorRedirectContext(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  playerId: PlayerId,
  cards: CardLibrary
): { excludeUnitId: UnitId | null } | null {
  if (triggerEvent.type === "SPELL_CAST_STARTED") {
    // Magic Mirror answers an ENEMY Spell only — never the caster's own.
    if (triggerEvent.playerId === playerId) {
      return null;
    }
    // (a) a single-target cast aimed straight at one of your units.
    const primary = pendingSpellTargetForPlayer(state, triggerEvent, playerId);
    if (primary) {
      return { excludeUnitId: primary.id };
    }
    // (b) an area cast whose blast would catch one of your units even though its
    // primary target is an enemy unit or a bare space.
    const stackItem = getPendingStackItem(state, triggerEvent);
    if (stackItem?.action.type === "CAST_SPELL") {
      const hitsMine = spellPotentialBlastUnitIds(state, stackItem, cards).some(
        (unitId) => state.combat?.units[unitId]?.controllerId === playerId
      );
      if (hitsMine) {
        const target = stackItem.action.target;
        return { excludeUnitId: target.type === "unit" ? target.unitId : null };
      }
    }
    return null;
  }

  // (c) an enemy instant combat debuff layered onto the pending attack.
  if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const stackItem = state.stack.at(-1);
    const instant = stackItem ? reflectableAttackInstantForPlayer(state, stackItem, playerId, cards) : null;
    return instant ? { excludeUnitId: instant.affectedUnitId } : null;
  }

  return null;
}

/**
 * Builds the Magic Mirror offers for one player: one PLAY_REACTION per grade
 * tier they can both afford and find a legal new target for. Shared by every
 * window the card can fire in (cast-on-your-unit, area-damage-on-your-unit,
 * attack-instant-on-your-unit) so the offer, the spell-limit gate and the cost
 * picker all behave identically regardless of what is being reflected.
 */
function getMagicMirrorReactions(
  state: GameState,
  player: PlayerState,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  spellLimitLeft: number,
  cards: CardLibrary
): LegalAction[] {
  if (spellLimitLeft <= 0) {
    return [];
  }
  const context = magicMirrorRedirectContext(state, triggerEvent, player.id, cards);
  if (!context) {
    return [];
  }

  const offers: LegalAction[] = [];
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
      continue;
    }
    if (card.timing !== "reaction" && card.timing !== "instant") {
      continue;
    }
    for (const variant of getCardPlayVariants(card)) {
      if (variant.effect.type !== "REDIRECT_SPELL") {
        continue;
      }
      if (!canAffordCardCost(state, player.id, cardId, variant.cost)) {
        continue;
      }
      if (spellRedirectTargets(state, context.excludeUnitId, variant.effect.grade).length === 0) {
        continue;
      }
      const variantName = variant.optionLabel ? `${card.name}: ${variant.optionLabel}` : card.name;
      offers.push(
        makeReactionAction(variantName, {
          type: "PLAY_REACTION",
          playerId: player.id,
          cardId,
          mode: "basic",
          ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {})
        })
      );
    }
  }
  return offers;
}

/** Whether either shared Spell deck still holds a card for Tarnum VI to Search. */
function tarnumSearchableDeckExists(state: GameState): boolean {
  return [SPELL_DECK_BASIC, SPELL_DECK_EXPERT].some((deckId) => (state.decks[deckId]?.drawPile.length ?? 0) > 0);
}

export function getLegalReactionsForTrigger(
  state: GameState,
  triggerEvent: GameEvent,
  cards: CardLibrary = cardLibrary
): Record<PlayerId, LegalAction[]> {
  // Alamar's Resurrection: its own save window when a unit is about to die.
  if (triggerEvent.type === "UNIT_LETHAL_HIT") {
    return getLethalSaveReactions(state, triggerEvent, cards);
  }

  // Shield of the Dwarven Lords: the defender's post-roll window to ignore the
  // Attack die and the effects it triggered.
  if (triggerEvent.type === "ATTACK_DIE_SETTLED") {
    return getDieCancelReactions(state, triggerEvent.defenderId, triggerEvent.attackerId, cards, triggerEvent.roll);
  }

  if (
    triggerEvent.type !== "SPELL_CAST_STARTED" &&
    triggerEvent.type !== "UNIT_ATTACK_DECLARED" &&
    triggerEvent.type !== "UNIT_ACTIVATION_STARTED"
  ) {
    return {};
  }

  const result: Record<PlayerId, LegalAction[]> = {};
  const isAttackWindow = triggerEvent.type === "UNIT_ATTACK_DECLARED";
  // Recanter's Cloak (option B): "no Hero can use Spells" blocks casting a Spell
  // as a reaction/instant too, not just on a turn (the cast-offer gate handles
  // turn casts). Artifact/ability counters (Resistance, the Boots, etc.) are not
  // Spells and are unaffected.
  const castLocked = getSpellCastRestriction(state).lockAll;

  // Misfortune pre-buff window: the instant an enemy unit declares an attack, the
  // attacked unit's controller may play Misfortune BEFORE any other card. While
  // that phase is open, ONLY Misfortune is offered (to the defender) — no buffs,
  // no debuffs — matching "play immediately when the enemy is attacking, before
  // other cards are played".
  if (isAttackWindow && state.stack.at(-1)?.modifiers.misfortunePhase) {
    return getMisfortunePreWindowReactions(state, triggerEvent, cards);
  }

  for (const player of Object.values(state.players)) {
    // Only the two sides actually in the fight may react. A bystander (neither
    // the attacker nor the defender — e.g. another player during someone else's
    // Neutral combat) is never offered an instant/reaction, even a trigger-free
    // "Draw a card" instant (Offense I's draw side) that variantMatchesTrigger
    // would otherwise slot into any open window. Without this gate every attack
    // or cast in a Neutral fight opened a reaction window for every onlooker
    // holding such a card.
    if (state.combat && !isCombatParticipant(state, player.id)) {
      continue;
    }
    // Garrison defense: "You cannot use your Deck during this Combat, as
    // your Main Hero is not present" — no card plays for that defender.
    if (isHandLockedInCombat(state, player.id)) {
      continue;
    }
    const expertUsesLeft =
      player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound;
    const spellLimitLeft = spellLimitFor(state, player) - player.combatStats.spellsCastThisRound;
    // Tarnum (Conflux) VI: just-Searched flagged Spells are offered as free
    // over-limit reactions through a dedicated pass below, so the normal
    // (limit-counting, own-discard) reaction path skips them here.
    const tarnumFlagged = new Set(player.combatStats.tarnumOverlimitCards ?? []);

    const reactions: LegalAction[] = [];
    // Power has no effect of its own during an attack: it may only be paid
    // alongside an instant spell in the same declaration. Power offers are
    // collected apart and only added when such a spell is available.
    const powerReactions: LegalAction[] = [];

    // Spell Book (house rule): a Book Spell may be played as a combat instant
    // exactly like a hand Spell — full Power, expert side, same limit — so the
    // Book entries run through the SAME offer logic, flagged `fromSpellBook` so
    // the reaction resolves from the Book zone. (The Book holds only Spells; the
    // card-kind/timing gates below drop anything that is not a playable instant.)
    const reactionSources: { cardId: CardId; fromSpellBook?: true }[] = [
      ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
      ...(spellBookRuleEnabled(state)
        ? [...new Set(player.spellBook)].map((cardId) => ({ cardId, fromSpellBook: true as const }))
        : [])
    ];

    for (const { cardId, fromSpellBook } of reactionSources) {
      const card = cards[cardId];
      // Tarnum-flagged Spells run through the dedicated free over-limit pass.
      if (!fromSpellBook && tarnumFlagged.has(cardId)) {
        continue;
      }
      // Permanents join reaction windows only through their printed expert
      // side (School of Magic +3 power from hand); their basic side is the
      // enter-play action outside reaction windows.
      const allowedTiming =
        card && (card.timing === "reaction" || card.timing === "instant" || Boolean(card.permanent));
      if (!card || !allowedTiming || card.implementationStatus !== "implemented") {
        continue;
      }

      // Spell instants respect the one-Spell-per-combat-round limit.
      if (card.kind === "spell" && spellLimitLeft <= 0) {
        continue;
      }

      // Recanter's Cloak (option B) locks every Hero out of casting any Spell.
      if (card.kind === "spell" && castLocked) {
        continue;
      }

      for (const variant of getCardPlayVariants(card)) {
        if (variant.mapOnly || !variantMatchesTrigger(variant, triggerEvent, player.id)) {
          continue;
        }

        if (!canAffordCardCost(state, player.id, cardId, variant.cost)) {
          continue;
        }

        const variantName = variant.optionLabel ? `${card.name}: ${variant.optionLabel}` : card.name;
        const isPowerPlay = variant.effect.type === "ADD_SPELL_POWER";
        const push = (action: LegalAction) => {
          if (isAttackWindow && isPowerPlay) {
            powerReactions.push(action);
          } else {
            reactions.push(action);
          }
        };

        // Magic Mirror is offered through its own dedicated pass
        // (getMagicMirrorReactions), which covers all three windows it can fire
        // in — a single-target cast on your unit, an area cast that would damage
        // your unit, and an instant debuff layered onto an attack. Skip its
        // REDIRECT_SPELL options here so they are never double-offered.
        if (variant.effect.type === "REDIRECT_SPELL") {
          continue;
        }

        // Permanents only join reaction windows through their expert side
        // (School of Magic from hand); their basic side is the enter-play
        // action outside reaction windows.
        if (
          !variant.expertOnly &&
          !card.permanent &&
          isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "basic")
        ) {
          if (variant.effect.type === "ACTIVATE_RANGED_UNIT" && triggerEvent.type === "UNIT_ACTIVATION_STARTED") {
            // Bowstring of the Unicorn's Mane / Valeska's Marksmen VI: one play
            // per eligible ranged unit — the chosen unit travels on the reaction's
            // `target`. Valeska may also re-fire an already-activated unit.
            for (const unitId of getActivateRangedUnitTargets(
              state,
              player.id,
              triggerEvent.unitId,
              variant.effect.allowAlreadyActivated
            )) {
              const targetUnit = state.combat?.units[unitId];
              push(
                makeReactionAction(`${variantName} (${targetUnit?.cardName ?? unitId})${fromSpellBook ? " (Spell Book)" : ""}`, {
                  type: "PLAY_REACTION",
                  playerId: player.id,
                  cardId,
                  mode: "basic",
                  ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
                  ...(fromSpellBook ? { fromSpellBook: true } : {}),
                  target: { type: "unit", unitId }
                })
              );
            }
          } else {
            push(
              makeReactionAction(`${variantName}${fromSpellBook ? " (Spell Book)" : ""}`, {
                type: "PLAY_REACTION",
                playerId: player.id,
                cardId,
                mode: "basic",
                ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
                ...(fromSpellBook ? { fromSpellBook: true } : {})
              })
            );
          }
        }

        if (
          (effectHasExpertMode(variant.effect) || variant.expertOnly) &&
          // An Empowered ability may take its Expert side without a crown.
          (expertUsesLeft > 0 || abilityExpertIsCrownFree(player, cardId)) &&
          isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "expert")
        ) {
          push(
            makeReactionAction(`${variantName} expert${fromSpellBook ? " (Spell Book)" : ""}`, {
              type: "PLAY_REACTION",
              playerId: player.id,
              cardId,
              mode: "expert",
              ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
              ...(fromSpellBook ? { fromSpellBook: true } : {})
            })
          );
        }
      }
    }

    // Magic Mirror: its own pass, covering all three windows it fires in. Kept
    // out of the variant loop above (whose trigger gate is tied to the cast
    // window) so an attack-instant or area-damage reflection is offered too.
    for (const offer of getMagicMirrorReactions(state, player, triggerEvent, spellLimitLeft, cards)) {
      reactions.push(offer);
    }

    // Spell Scroll spells played as reactions: basic side only, power-locked
    // to 0, removed once used. They respect the same spell-per-round limit, and
    // Recanter's Cloak (option B) locks them out along with every other Spell.
    if (spellLimitLeft > 0 && !castLocked) {
      for (const scroll of player.scrolls ?? []) {
        for (const cardId of new Set(scroll.spellCardIds)) {
          const card = cards[cardId];
          const allowedTiming =
            card && (card.timing === "reaction" || card.timing === "instant");
          if (!card || card.kind !== "spell" || !allowedTiming || card.implementationStatus !== "implemented") {
            continue;
          }

          for (const variant of getCardPlayVariants(card)) {
            if (
              variant.mapOnly ||
              variant.expertOnly ||
              variant.cost ||
              variant.effect.type === "ADD_SPELL_POWER" ||
              !variantMatchesTrigger(variant, triggerEvent, player.id) ||
              !isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "basic")
            ) {
              continue;
            }

            const variantName = variant.optionLabel
              ? `${card.name}: ${variant.optionLabel} (Scroll)`
              : `${card.name} (Scroll)`;
            reactions.push(
              makeReactionAction(variantName, {
                type: "PLAY_REACTION",
                playerId: player.id,
                cardId,
                mode: "basic",
                fromScroll: scroll.id,
                ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {})
              })
            );
          }
        }
      }
    }

    // School of Magic (Air/Earth/Fire/Water Magic) in play: the discard-for-+3
    // expert is NOT a reaction here — it would pop an extra prompt on every
    // matching cast. It is decided up front as a cast option instead (a
    // `useSchoolExpert` CAST_SPELL variant; see addSpellActions), so a plain
    // cast just keeps the standing +1 and resolves.

    // Basic X Magic in play (the spell-fetch permanent): +3 Power for a
    // matching-school spell — a normal cast or an instant on the attack — without
    // discarding the permanent. Once per stack per player, and only while you
    // hold an expert use.
    for (const offer of getSchoolFetchExpertActions(state, player.id, triggerEvent, cards)) {
      reactions.push(offer);
    }

    // Brimstone Stormclouds: a stored faction cube powers the owner's cast.
    if (triggerEvent.type === "SPELL_CAST_STARTED" && triggerEvent.playerId === player.id) {
      const town = Object.values(state.towns).find((candidate) => candidate.controllerId === player.id);
      for (const buildingId of town?.buildings ?? []) {
        const building = coreBuildingDefinitions[buildingId];
        const cubes = town?.factionCubes?.[buildingId] ?? 0;
        const stackItem = state.stack.at(-1);
        const alreadySpent = (stackItem?.modifiers.townCubePowerBonus ?? 0) >= 1;
        if (building?.effect?.type === "COMBAT_CUBES" && building.effect.spend === "spell-power" && cubes > 0 && !alreadySpent) {
          reactions.push({
            label: `${building.name}: remove 1 cube for +1 Power (${cubes} stored)`,
            action: { type: "SPEND_TOWN_CUBE", playerId: player.id, buildingId }
          });
        }
      }
    }

    // Resistance against an instant Spell buff the OTHER side has played into
    // this attack (Curse/Weakness/Bloodlust/Precision/Bless/Slayer): the player
    // whose unit it was cast against may end it, exactly like Resistance counters
    // an Activation cast — basic ends a spell at or below its power cap, expert
    // ends any power (spending a crown). Reversing the buff is handled by the
    // reducer; only the offer is built here.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attackItem = state.stack.at(-1);
      const instants =
        attackItem?.action.type === "ATTACK_UNIT" || attackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
          ? (attackItem.modifiers.cancellableSpellInstants ?? [])
          : [];
      const enemyInstants = instants.filter((entry) => entry.playerId !== player.id);
      if (enemyInstants.length > 0) {
        // Resistance's basic power cap is judged against the CASTER's own attack
        // Power pool, not a shared total, so one side's Power can't push the
        // other's spell above a cap that should still be cancellable. (In a
        // two-player attack every enemy instant shares the one opposing caster.)
        const spellPower = attackItem?.modifiers.attackPowerByPlayer?.[enemyInstants[0]!.playerId] ?? 0;
        for (const cardId of new Set(player.hand)) {
          const card = cards[cardId];
          if (
            !card ||
            card.effect.type !== "CANCEL_SPELL" ||
            card.implementationStatus !== "implemented" ||
            (card.timing !== "reaction" && card.timing !== "instant")
          ) {
            continue;
          }
          const cancel = card.effect;
          // Protection-from-X is offered only when an enemy instant of its own
          // School (and, at basic, Basic level) is on the attack; Resistance, with
          // no such gate, matches every enemy instant.
          const matchesAt = (mode: CardPlayMode) =>
            enemyInstants.some((entry) =>
              cancelSpellAllowsSchoolAndLevel(
                cancel,
                { schools: cards[entry.cardId]?.spellSchools ?? [], level: cards[entry.cardId]?.spellLevel },
                mode
              )
            );
          // Basic still respects Resistance's power cap (Protection has none).
          if ((cancel.maxPower === undefined || spellPower <= cancel.maxPower) && matchesAt("basic")) {
            reactions.push(makeReactionAction(card.name, { type: "PLAY_REACTION", playerId: player.id, cardId, mode: "basic" }));
          }
          if (
            (cancel.expertIgnoresMaxPower || cancel.expertIgnoresMaxSpellLevel) &&
            (expertUsesLeft > 0 || abilityExpertIsCrownFree(player, cardId)) &&
            matchesAt("expert")
          ) {
            reactions.push(
              makeReactionAction(`${card.name} expert`, { type: "PLAY_REACTION", playerId: player.id, cardId, mode: "expert" })
            );
          }
        }
      }
    }

    // Hall of Valhalla: once per round, +1 attack on one of your attacks.
    // Misfortune-locked attacks cannot be buffed, so it is not offered then.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attacker = state.combat?.units[triggerEvent.attackerId];
      const attackLocked = Boolean(state.stack.at(-1)?.modifiers.negateAttackBuffs);
      if (attacker && attacker.controllerId === player.id && !attackLocked) {
        const town = Object.values(state.towns).find((candidate) => candidate.controllerId === player.id);
        for (const buildingId of town?.buildings ?? []) {
          const building = coreBuildingDefinitions[buildingId];
          if (
            building?.effect?.type === "HALL_OF_VALHALLA" &&
            (player.buildingUsedRound?.[buildingId] ?? 0) !== state.round
          ) {
            reactions.push({
              label: `${building.name}: +${building.effect.amount} attack on this attack (once per round)`,
              action: { type: "HALL_OF_VALHALLA_BOOST", playerId: player.id, buildingId }
            });
          }
        }
      }
    }

    // Crag Hack's Offense VI: while its aura is up, discard any held card during
    // your own unit's attack for +1 attack ("every card you play can grant +1
    // attack instead of its effect"). One offer per distinct held card; the window
    // reopens after each conversion, so several cards can stack on one attack.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attacker = state.combat?.units[triggerEvent.attackerId];
      const attackLocked = Boolean(state.stack.at(-1)?.modifiers.negateAttackBuffs);
      const auraAmount = state.activeEffects.reduce((sum, effect) => {
        if (effect.scope !== "player" || effect.controllerId !== player.id) {
          return sum;
        }
        return sum + effect.modifiers.reduce((inner, modifier) => inner + (modifier.type === "CARDS_AS_ATTACK_BONUS" ? modifier.amount : 0), 0);
      }, 0);
      if (attacker && attacker.controllerId === player.id && !attackLocked && auraAmount > 0) {
        for (const cardId of [...new Set(player.hand)]) {
          reactions.push({
            label: `Offense VI: discard ${cardLibrary[cardId]?.name ?? cardId} for +${auraAmount} attack`,
            action: { type: "CONVERT_CARD_TO_ATTACK", playerId: player.id, cardId }
          });
        }
      }
    }

    // Cage of Warlords: while an attack waits to resolve, remove a faction
    // cube for +1 attack (you are the attacker) or +1 defense (your unit is
    // the target). One per cube — offered again while cubes remain.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attacker = state.combat?.units[triggerEvent.attackerId];
      const defender = state.combat?.units[triggerEvent.defenderId];
      const town = Object.values(state.towns).find((candidate) => candidate.controllerId === player.id);
      for (const buildingId of town?.buildings ?? []) {
        const building = coreBuildingDefinitions[buildingId];
        const cubes = town?.factionCubes?.[buildingId] ?? 0;
        if (building?.effect?.type !== "COMBAT_CUBES" || building.effect.spend !== "attack-or-defense" || cubes <= 0) {
          continue;
        }
        // A Misfortune-locked attack cannot be buffed: the attacker's +attack
        // option is withheld, but the defender's +defense option stands.
        const attackLocked = Boolean(state.stack.at(-1)?.modifiers.negateAttackBuffs);
        if (attacker && attacker.controllerId === player.id && !attackLocked) {
          reactions.push({
            label: `${building.name}: remove 1 cube for +1 attack (${cubes} stored)`,
            action: { type: "SPEND_TOWN_CUBE", playerId: player.id, buildingId, boost: "attack" }
          });
        }
        if (defender && defender.controllerId === player.id) {
          reactions.push({
            label: `${building.name}: remove 1 cube for +1 defense (${cubes} stored)`,
            action: { type: "SPEND_TOWN_CUBE", playerId: player.id, buildingId, boost: "defense" }
          });
        }
      }
    }

    // The printed alternative bottom effect: discard any Spell card for
    // +1 Power — toward your own cast, or paired with an instant spell in an
    // attack window (the batch validator enforces the pairing). NOT offered in
    // the Sorrow activation-skip window: that window has no spell on the stack
    // to empower, and Sorrow pays its own Power as the chosen option's cost.
    const boostLegal =
      (triggerEvent.type === "SPELL_CAST_STARTED"
        ? triggerEvent.playerId === player.id
        : isCombatParticipant(state, player.id)) &&
      triggerEvent.type !== "UNIT_ACTIVATION_STARTED";
    if (boostLegal) {
      for (const cardId of new Set(player.hand)) {
        const card = cards[cardId];
        if (card?.kind === "spell") {
          const boost = makeReactionAction(`Discard ${card.name}: +1 Power`, {
            type: "PLAY_REACTION",
            playerId: player.id,
            cardId,
            mode: "basic",
            asPowerBoost: true
          });
          if (isAttackWindow) {
            powerReactions.push(boost);
          } else {
            reactions.push(boost);
          }
        }
      }

      // Spell Book (house rule): a Book Spell may also be discarded for +1 Power,
      // but only ONE Book Spell per turn (crown-style). Once the per-turn budget is
      // spent (spellBookPowerUsedThisTurn) no Book Power boost is offered; hand
      // boosts above are unaffected.
      if (spellBookRuleEnabled(state) && spellBookPowerAvailable(player)) {
        for (const cardId of new Set(player.spellBook)) {
          const card = cards[cardId];
          if (card?.kind === "spell") {
            const boost = makeReactionAction(`Discard ${card.name}: +1 Power (Spell Book)`, {
              type: "PLAY_REACTION",
              playerId: player.id,
              cardId,
              mode: "basic",
              asPowerBoost: true,
              fromSpellBook: true
            });
            if (isAttackWindow) {
              powerReactions.push(boost);
            } else {
              reactions.push(boost);
            }
          }
        }
      }
    }

    // Attack windows: only spells that modify the attack (buffs/nerfs of
    // attack or defense) may consume Power, so Power plays are offered only
    // while the player still holds such an instant spell to pair them with…
    const hasPairableSpell = reactions.some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        !legal.action.asPowerBoost &&
        cards[legal.action.cardId]?.kind === "spell"
    );
    // …or while a Power-scaling spell this player already cast into the attack
    // is still on the stack waiting to grow (the caster keeps priority and may
    // keep empowering a Bloodlust/Bless after playing it).
    const attackStackItem = isAttackWindow ? state.stack.at(-1) : undefined;
    const attackOwner =
      attackStackItem?.action.type === "ATTACK_UNIT" || attackStackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
        ? attackStackItem.action.playerId
        : undefined;
    // Either side may keep empowering a Power-scaling spell instant THEY already
    // cast into this attack (the attacker's Bloodlust/Slayer/Frenzy, the
    // defender's Curse/Weakness) — each pays into their own Power pool.
    const hasEmpowerablePlayed =
      (attackStackItem?.modifiers.powerScaledAttackInstants ?? []).some((record) => record.playerId === player.id) ||
      (attackOwner === player.id && attackStackItem?.modifiers.slayerRollsByPower !== undefined) ||
      attackStackItem?.modifiers.ignoreDefenseCasterId === player.id;
    if (!isAttackWindow || hasPairableSpell || hasEmpowerablePlayed) {
      reactions.push(...powerReactions);
    }

    // Tarnum (Conflux) VI used AS a reaction: in an attack window the holder may
    // play the specialty to Search 2 Spells (the per-search deck choice opens),
    // then — once the window re-derives its offers — immediately cast an
    // applicable Searched instant into the SAME window. Offered to either side
    // (the attacker's buffs, the defender's debuffs).
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED" && tarnumSearchableDeckExists(state)) {
      for (const cardId of new Set(player.hand)) {
        const card = cards[cardId];
        if (
          card?.kind === "hero-specialty" &&
          card.implementationStatus === "implemented" &&
          card.effect.type === "TARNUM_OVERLIMIT_SEARCH"
        ) {
          reactions.push(
            makeReactionAction(`${card.name}: Search 2 Spells`, {
              type: "PLAY_REACTION",
              playerId: player.id,
              cardId,
              mode: "basic"
            })
          );
        }
      }
    }

    // Tarnum (Conflux) VI: a just-Searched, flagged trigger-instant Spell (Bless,
    // Curse, Stone Skin… — the attack/defense changers) is castable here in the
    // instant window for FREE, OVER the per-round limit, returning to the shared
    // Spell deck top or its discard pile (the caster's choice). Offered as a
    // dedicated pass so it bypasses the spell-limit gate the normal path applies.
    if (!castLocked) {
      for (const cardId of tarnumFlagged) {
        if (!player.hand.includes(cardId)) {
          continue;
        }
        const card = cards[cardId];
        if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
          continue;
        }
        for (const variant of getCardPlayVariants(card)) {
          if (
            variant.mapOnly ||
            variant.expertOnly ||
            Boolean(card.permanent) ||
            variant.effect.type === "ADD_SPELL_POWER" ||
            variant.effect.type === "REDIRECT_SPELL" ||
            !variantMatchesTrigger(variant, triggerEvent, player.id) ||
            !isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "basic")
          ) {
            continue;
          }
          const base = variant.optionLabel ? `${card.name}: ${variant.optionLabel}` : card.name;
          for (const tarnumReturn of ["deck-top", "discard"] as const) {
            reactions.push(
              makeReactionAction(
                `${base} (free; ${tarnumReturn === "deck-top" ? "to Spell deck top" : "to Spell discard"})`,
                {
                  type: "PLAY_REACTION",
                  playerId: player.id,
                  cardId,
                  mode: "basic",
                  ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
                  tarnumReturn
                }
              )
            );
          }
        }
      }
    }

    if (reactions.length > 0) {
      result[player.id] = reactions;
    }
  }

  // First Aid (instant): the moment one of your units is attacked, its
  // controller may mend an existing wound on one of their units BEFORE the
  // incoming attack's damage is calculated — First Aid is "usable at any time
  // during the round, like an instant". A healed unit therefore enters the hit
  // with more health, which can let it survive a blow that would otherwise
  // defeat it. Optional: the defender may simply pass and take the attack. Two
  // sources are offered to the defender: the First Aid Tent's per-round heal
  // (and its expert volley — both via firstAidHealActions), and the First Aid
  // ability card's basic heal played straight from hand (firstAidCardHealReactions,
  // which needs no Tent).
  if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const defenderId = state.combat?.units[triggerEvent.defenderId]?.controllerId;
    const heals = defenderId
      ? [...firstAidHealActions(state, defenderId), ...firstAidCardHealReactions(state, defenderId)]
      : [];
    if (defenderId && heals.length > 0) {
      result[defenderId] = [...(result[defenderId] ?? []), ...heals];
    }
  }

  return result;
}

/** Whether a card's schools include `school` (or the school-agnostic "any"). */
function cardMatchesSchool(cardId: CardId, school: SpellSchool): boolean {
  const schools = cardLibrary[cardId]?.spellSchools ?? [];
  return schools.includes(school) || schools.includes("any");
}

/**
 * Whether `playerId` has a Power-scaling spell instant of `school` of their own
 * on this attack — the spells whose Power the Basic X Magic +3 expert can feed:
 * the recorded buffs/debuffs (Bloodlust, Curse, Weakness, Precision, the scaled
 * Bless), plus Slayer and Frenzy (both Fire, tracked separately).
 */
export function playerHasAttackInstantOfSchool(
  stackItem: ResolutionStackItem,
  playerId: PlayerId,
  school: SpellSchool
): boolean {
  const records = stackItem.modifiers.powerScaledAttackInstants ?? [];
  if (records.some((record) => record.playerId === playerId && cardMatchesSchool(record.cardId, school))) {
    return true;
  }
  const attackerId =
    stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT"
      ? stackItem.action.playerId
      : undefined;
  // Slayer and Frenzy are Fire and do not create scaling records.
  if (school === "fire") {
    if (stackItem.modifiers.slayerRollsByPower !== undefined && attackerId === playerId) {
      return true;
    }
    if (stackItem.modifiers.ignoreDefenseCasterId === playerId) {
      return true;
    }
  }
  return false;
}

/**
 * Basic X Magic (in-play spell-fetch permanent): its expert +3 Power offers, for
 * every school the player can fetch. Offered while one of the player's matching
 * spells is on the stack — a normal cast they own, or an instant of that school
 * they played into the attack — and an expert use remains, once per stack.
 */
function getSchoolFetchExpertActions(
  state: GameState,
  playerId: PlayerId,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  cards: CardLibrary
): LegalAction[] {
  if (triggerEvent.type !== "SPELL_CAST_STARTED" && triggerEvent.type !== "UNIT_ATTACK_DECLARED") {
    return [];
  }
  const player = state.players[playerId];
  if (!player || expertUsesAvailable(player) <= 0) {
    return [];
  }
  const stackItem = triggerEvent.type === "UNIT_ATTACK_DECLARED" ? state.stack.at(-1) : getPendingStackItem(state, triggerEvent);
  if (!stackItem || (stackItem.modifiers.schoolFetchExpertUsedBy ?? []).includes(playerId)) {
    return [];
  }

  const offers: LegalAction[] = [];
  for (const school of activeSchoolFetches(state, playerId)) {
    let matches = false;
    if (stackItem.action.type === "CAST_SPELL") {
      if (stackItem.action.playerId === playerId && !stackItem.modifiers.scrollLocked) {
        const schools = cards[stackItem.action.cardId]?.spellSchools ?? [];
        matches = schools.includes(school) || schools.includes("any");
      }
    } else if (
      stackItem.action.type === "ATTACK_UNIT" ||
      stackItem.action.type === "MOVE_AND_ATTACK_UNIT"
    ) {
      matches = playerHasAttackInstantOfSchool(stackItem, playerId, school);
    }
    if (matches) {
      offers.push({
        label: `Basic ${school.charAt(0).toUpperCase()}${school.slice(1)} Magic: +3 Power (expert)`,
        action: { type: "USE_SCHOOL_FETCH_EXPERT", playerId, school }
      });
    }
  }
  return offers;
}

function variantMatchesTrigger(
  variant: CardPlayVariant,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  playerId: PlayerId
): boolean {
  if (!variant.trigger) {
    // Trigger-free instants (card draws) may be slotted into any open timing
    // window, mirroring how instants work at the table.
    return variant.effect.type === "DRAW_CARDS";
  }

  if (variant.trigger.event !== triggerEvent.type) {
    // Power plays declared on a SPELL_CAST trigger may also be paid into an
    // attack window, fueling a spell instant in the same declaration.
    if (
      triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
      variant.trigger.event === "SPELL_CAST_STARTED" &&
      variant.effect.type === "ADD_SPELL_POWER"
    ) {
      return true;
    }
    // Interference / Plate of the Dying Light: their "+X defense" base is the
    // same as Armorer's, i.e. a plain defense reaction usable against a physical
    // attack too (the spell-damage-reduction rider is simply inert vs an attack).
    // Their printed trigger is the SPELL_CAST window, so cross them into the
    // attack window for the DEFENDER — the side whose unit is being attacked.
    // isEffectLegalForTrigger re-checks the exact defender match.
    if (
      triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
      variant.trigger.event === "SPELL_CAST_STARTED" &&
      variant.effect.type === "INTERFERE_SPELL"
    ) {
      return triggerEvent.playerId !== playerId;
    }
    return false;
  }

  const isSelf = triggerEvent.playerId === playerId;
  if (variant.trigger.controller === "self" && !isSelf) {
    return false;
  }

  if (variant.trigger.controller === "opponent" && isSelf) {
    return false;
  }

  return true;
}

function getPendingStackItem(state: GameState, triggerEvent: GameEvent) {
  return state.stack.find((item) => item.triggerEventIds.includes(triggerEvent.id));
}

/**
 * The Power a spell will RESOLVE at — the single source of truth shared by the
 * cast pipeline (reducer's getCurrentSpellPower delegates here) and the live UI
 * power readout / Resistance offer gate, so the defender always SEES and is
 * GATED BY the exact Power the spell finally resolves at. Mirrors the cast
 * formula verbatim:
 *   (printed power + Power statistics/"+1 Power" Spell discards + School-of-Magic
 *    bonus + Brimstone town cube + Adrienne's Fire Magic + Astrologers' school
 *    proclamation + Pandora's flat bonus)
 *   × the matching Elemental-Orb multiplier − the enemy Pegasi reduction,
 *   floored at 0.
 * A Spell Scroll cast is locked to Power 0 and ignores every source.
 *
 * Previously the readout/gate counted only the stack-item modifier terms and
 * silently dropped the Orb doubling, the school/flat bonuses and the Pegasi
 * reduction — so a Lightning Bolt doubled by an Air Orb showed (and let the
 * defender Resist) "Power 1" while it actually resolved at Power 2. Unifying
 * with the cast removes that divergence.
 */
export function resolvedSpellPowerForStackItem(
  state: GameState,
  stackItem: ResolutionStackItem | undefined,
  cards: CardLibrary = cardLibrary
): number {
  if (!stackItem || stackItem.action.type !== "CAST_SPELL" || stackItem.modifiers.scrollLocked) {
    return 0;
  }
  const card = cards[stackItem.action.cardId];
  const playerId = stackItem.action.playerId;
  const base =
    (card?.power ?? 0) +
    stackItem.modifiers.spellPowerBonus +
    (stackItem.modifiers.schoolPowerBonus ?? 0) +
    (stackItem.modifiers.townCubePowerBonus ?? 0) +
    getSchoolPowerBonus(state, playerId, card) +
    astrologersSchoolPowerBonusFor(state, card) +
    permanentSpellPowerBonus(state, playerId);
  const doubled = base * getSchoolPowerMultiplier(state, playerId, card);
  return Math.max(0, doubled - enemySpellPowerReductionFor(state, playerId));
}

/**
 * Astrologers Blue Sky (Air+Water) / Scorched Ground (Earth+Fire): +Power to
 * every matching-school spell while the card is up, for every player. A
 * school-agnostic "any" spell (Magic Arrow) qualifies for either proclamation,
 * mirroring getSchoolPowerBonus. Replicated here (the reducer keeps its own copy
 * private) so the readout and the cast stay byte-for-byte equal.
 */
function astrologersSchoolPowerBonusFor(state: GameState, spellCard: CardDefinition | undefined): number {
  const active = getActiveAstrologersCard(state);
  if (active?.effect.type !== "SCHOOL_SPELL_POWER_BONUS") {
    return 0;
  }
  const schools = spellCard?.spellSchools ?? [];
  const matches = schools.includes("any") || active.effect.schools.some((school) => schools.includes(school));
  return matches ? active.effect.amount : 0;
}

/**
 * Rampart/neutral Pegasi drain the Power of every spell their enemy resolves (to
 * a minimum of 0); Orb of Vulnerability suppresses the drain. Mirrors the
 * reducer's enemySpellPowerReduction so the readout/gate match the cast.
 */
function enemySpellPowerReductionFor(state: GameState, casterPlayerId: PlayerId): number {
  const combat = state.combat;
  if (!combat || spellAbilitiesSuppressed(state)) {
    return 0;
  }
  let total = 0;
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== casterPlayerId && isUnitAlive(unit)) {
      total += getEnemySpellPowerReduction(unit);
    }
  }
  return total;
}

/** Whether a spell of `school` (or "any") has already been played into this attack. */
function attackStackHasSpellOfSchool(stackItem: ResolutionStackItem | undefined, school: SpellSchool): boolean {
  if (!stackItem) {
    return false;
  }
  return stackItem.modifiers.playedCardIds.some((id) => {
    const card = cardLibrary[id];
    if (card?.kind !== "spell") {
      return false;
    }
    const schools = card.spellSchools ?? [];
    return schools.includes(school) || schools.includes("any");
  });
}

function getPendingSpellPower(state: GameState, triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" }>): number {
  return resolvedSpellPowerForStackItem(state, getPendingStackItem(state, triggerEvent));
}

/**
 * The current Power of whatever an open reaction window is reacting to — a spell
 * cast or a declared attack carrying a Power-scaling spell instant. Returns the
 * printed base, the Power fueled on top (Power cards / +1-Power discards /
 * School of Magic / town cube), and their sum. The UI shows this live so a
 * caster can SEE how much Power they have committed, and the defender can SEE
 * the final Power before deciding Resistance (capped at Power 1) or Magic
 * Mirror. Returns null when nothing power-relevant is pending.
 */
export type PendingReactionPower = {
  kind: "spell" | "attack";
  /** The spell being empowered (null for a bare attack window). */
  spellCardId: CardId | null;
  /** Printed power of the spell (0 for an attack). */
  basePower: number;
  /** Power added since the cast/declaration. */
  fueledPower: number;
  /** basePower + fueledPower — the power level it currently resolves at. */
  totalPower: number;
};

export function getPendingReactionPower(
  state: GameState,
  cards: CardLibrary = cardLibrary
): PendingReactionPower | null {
  const window = state.reactionWindow;
  if (!window) {
    return null;
  }
  const trigger = window.triggerEvent;
  if (trigger.type !== "SPELL_CAST_STARTED" && trigger.type !== "UNIT_ATTACK_DECLARED") {
    return null;
  }

  const stackItem = getPendingStackItem(state, trigger) ?? state.stack.at(-1);
  if (!stackItem) {
    return null;
  }

  if (stackItem.action.type === "CAST_SPELL") {
    const basePower = stackItem.modifiers.scrollLocked ? 0 : cards[stackItem.action.cardId]?.power ?? 0;
    // The resolved Power (with Orb doubling / school + flat bonuses / Pegasi
    // reduction) drives the displayed total and the damage preview; the fuelled
    // portion is the remainder so the "base + fuelled" line still sums to it.
    const totalPower = resolvedSpellPowerForStackItem(state, stackItem, cards);
    return {
      kind: "spell",
      spellCardId: stackItem.action.cardId,
      basePower,
      fueledPower: totalPower - basePower,
      totalPower
    };
  }

  if (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT") {
    // Attack windows pool Power per caster, so the readout reports the Power the
    // player currently on priority has fuelled into their own spell instant
    // (the attacker's Bloodlust/Bless/Slayer or the defender's Curse/Weakness).
    const fueledPower = stackItem.modifiers.attackPowerByPlayer?.[window.priorityPlayerId] ?? 0;
    // An attack only has a Power to report while a Power-scaling spell instant
    // (Bloodlust/Bless/Slayer) sits on it — otherwise a plain attack has none.
    const hasPowerSubject =
      fueledPower > 0 ||
      (stackItem.modifiers.powerScaledAttackInstants?.length ?? 0) > 0 ||
      stackItem.modifiers.slayerRollsByPower !== undefined;
    if (!hasPowerSubject) {
      return null;
    }
    return { kind: "attack", spellCardId: null, basePower: 0, fueledPower, totalPower: fueledPower };
  }

  return null;
}

export function effectHasExpertMode(effect: ConcreteEffect): boolean {
  if (effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER" || effect.type === "DRAW_CARDS") {
    return effect.expertAmount !== undefined;
  }

  if (effect.type === "GAIN_MORALE") {
    return effect.expertDrawCards !== undefined;
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return Boolean(effect.expertEffect);
  }

  if (effect.type === "RECALL_SPELL") {
    // Mysticism's expert side recalls every card played with the spell;
    // Knowledge's expert side raises the spell-per-round limit. Either makes the
    // expert play real.
    return Boolean(effect.expertSpellLimitBonus || effect.expertRecallPlayedCards);
  }

  if (effect.type === "CANCEL_SPELL") {
    // Resistance's expert ignores the power cap; Protection-from-X's expert
    // ignores the spell-level cap. Either makes the card's expert play real.
    return Boolean(effect.expertIgnoresMaxPower || effect.expertIgnoresMaxSpellLevel);
  }

  // Interference has an expert side (+2 instead of +1); Plate of the Dying
  // Light reuses the same effect with no expert side, so it omits expertAmount.
  if (effect.type === "INTERFERE_SPELL") {
    return effect.expertAmount !== undefined;
  }

  return false;
}

function makeReactionAction(label: string, action: Extract<GameAction, { type: "PLAY_REACTION" }>): LegalAction {
  const modeLabel = action.mode === "expert" ? " (expert)" : "";
  return {
    label: `Play ${label}${modeLabel}`,
    action
  };
}

export function isEffectLegalForTrigger(
  state: GameState,
  playerId: PlayerId,
  effect: ConcreteEffect,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  mode: CardPlayMode
): boolean {
  // Sorrow: skip the about-to-activate unit. Offered to the unit's opponent
  // only, and only the CHOOSE_ONE option whose grade matches that unit (bronze
  // free, silver pay 2, gold pay 4) — so the tray shows a single "skip this
  // unit" choice with its cost picker. Whether that cost is affordable is judged
  // separately by canAffordCardCost, so a grade you cannot pay never opens the
  // window.
  if (triggerEvent.type === "UNIT_ACTIVATION_STARTED") {
    // Bowstring of the Unicorn's Mane: either side may interject here (controller
    // "any") to activate one of THEIR ranged units that has not acted this round —
    // never the unit about to activate. Legal as long as such a ranged unit
    // exists; the offer loop enumerates one play per eligible unit.
    if (effect.type === "ACTIVATE_RANGED_UNIT") {
      return (
        getActivateRangedUnitTargets(state, playerId, triggerEvent.unitId, effect.allowAlreadyActivated).length > 0
      );
    }
    if (effect.type !== "SKIP_ACTIVATION" || !effect.grade) {
      return false;
    }
    if (triggerEvent.playerId === playerId) {
      return false;
    }
    const unit = state.combat?.units[triggerEvent.unitId];
    return Boolean(unit && isUnitAlive(unit) && gradeRankOfUnit(unit) === gradeRank(effect.grade));
  }

  // Card draws are timing-free instants: they fit inside any open window.
  if (effect.type === "DRAW_CARDS") {
    return true;
  }

  if (triggerEvent.type === "SPELL_CAST_STARTED") {
    if (effect.type === "ADD_SPELL_POWER") {
      if (triggerEvent.playerId !== playerId) {
        return false;
      }

      // Elemental Magic boosts only empower their own school.
      if (effect.schoolOnly) {
        const stackItem = getPendingStackItem(state, triggerEvent);
        const pendingSpell =
          stackItem?.action.type === "CAST_SPELL" ? cardLibrary[stackItem.action.cardId] : undefined;
        const schools = pendingSpell?.spellSchools ?? [];
        return schools.includes(effect.schoolOnly) || schools.includes("any");
      }

      return true;
    }

    // Tome of X (option B): offered to the caster only, while casting a spell of
    // the Tome's School (a school-agnostic "any" spell qualifies).
    if (effect.type === "SET_SPELL_POWER_MAX") {
      if (triggerEvent.playerId !== playerId) {
        return false;
      }
      const stackItem = getPendingStackItem(state, triggerEvent);
      const pendingSpell =
        stackItem?.action.type === "CAST_SPELL" ? cardLibrary[stackItem.action.cardId] : undefined;
      const schools = pendingSpell?.spellSchools ?? [];
      return schools.includes(effect.schoolOnly) || schools.includes("any");
    }

    if (effect.type === "CANCEL_SPELL") {
      if (triggerEvent.playerId === playerId) {
        return false;
      }

      // Protection-from-X: the pending spell must belong to the card's School,
      // and (basic play) be a Basic spell. Resistance leaves both gates open.
      const pendingStackItem = getPendingStackItem(state, triggerEvent);
      const pendingSpell =
        pendingStackItem?.action.type === "CAST_SPELL" ? cardLibrary[pendingStackItem.action.cardId] : undefined;
      if (
        !cancelSpellAllowsSchoolAndLevel(
          effect,
          { schools: pendingSpell?.spellSchools ?? [], level: pendingSpell?.spellLevel },
          mode
        )
      ) {
        return false;
      }

      // Expert play (e.g. Expert Resistance) ends a spell of any power. The
      // basic play only applies while the spell's current power, including
      // Power cards already committed, is at or below the printed limit.
      if (mode === "expert" && effect.expertIgnoresMaxPower) {
        return true;
      }

      if (effect.maxPower !== undefined && getPendingSpellPower(state, triggerEvent) > effect.maxPower) {
        return false;
      }

      return true;
    }

    if (effect.type === "RECALL_SPELL") {
      return triggerEvent.playerId === playerId;
    }

    // Interference: offered to the targeted side only (never the caster) when
    // the pending Spell deals Spell damage to one of this player's units. The
    // bonus lands on that unit; an enemy buff/debuff or a non-damaging spell
    // never opens the window.
    if (effect.type === "INTERFERE_SPELL") {
      if (triggerEvent.playerId === playerId) {
        return false;
      }
      if (!pendingSpellTargetForPlayer(state, triggerEvent, playerId)) {
        return false;
      }
      const stackItem = getPendingStackItem(state, triggerEvent);
      const pendingSpell =
        stackItem?.action.type === "CAST_SPELL" ? cardLibrary[stackItem.action.cardId] : undefined;
      return Boolean(
        pendingSpell &&
          pendingSpell.effect.type === "DEAL_DAMAGE" &&
          pendingSpell.effect.damageKind === "spell"
      );
    }

    return false;
  }

  if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const combat = state.combat;
    const attacker = combat?.units[triggerEvent.attackerId];
    const defender = combat?.units[triggerEvent.defenderId];
    if (!attacker || !defender) {
      return false;
    }

    // Kriv (Bulwark): bank Runes in reaction to an enemy's attack so a crossed
    // Rune-Level threshold's army-wide buff turns on BEFORE the attack resolves.
    // Only a Bulwark reactor benefits (gainRunes is a no-op otherwise); the card's
    // "opponent" trigger already keeps this off the attacker's own tray.
    if (effect.type === "GAIN_RUNES") {
      return state.players[playerId]?.factionId === "bulwark";
    }

    // Centaur's Axe: only the attacker (the side whose unit is making this
    // attack and rolling its Attack die) may triple the outcome. It is the
    // attacker's own die — the defender can never reach across to triple the
    // enemy's roll (e.g. fishing for a tripled -1 against the attacker).
    if (effect.type === "TRIPLE_ATTACK_DIE") {
      return attacker.controllerId === playerId;
    }

    if (effect.type === "CREATE_ACTIVE_EFFECT") {
      return effect.effect.modifiers.every((modifier) => {
        if (modifier.type !== "RANGED_ATTACK_BONUS") {
          return true;
        }

        if (attacker.type !== "ranged") {
          return false;
        }

        return !modifier.nonAdjacentOnly || !isAdjacent(attacker.position, defender.position);
      });
    }

    // Misfortune locked this attack: refuse every attack-INCREASING reaction to
    // the attacker (its die is cancelled and its attack cannot be buffed from any
    // source). The defender's debuffs and the attacker's defense-ignore (Frenzy)
    // are untouched — only increases to the attacker's attack are negated.
    const attackBuffsNegated = Boolean(
      attacker.controllerId === playerId && state.stack.at(-1)?.modifiers.negateAttackBuffs
    );

    // Bless: "the selected ground or flying unit" ignores the die — only the
    // attacker's controller plays it, and never on a ranged shot.
    if (effect.type === "IGNORE_ATTACK_DIE") {
      return !attackBuffsNegated && attacker.controllerId === playerId && attacker.type !== "ranged";
    }

    // Ivor's Elves I / VI: force this attack's die to a fixed face. The card's
    // trigger controller already decided who may play it (I = "any" — either side
    // may set the next roll to 0; VI = "self" — the attacker sets their roll to
    // +1), so legality here only needs the attack to exist. A Misfortune-locked
    // attacker may not touch their own die.
    if (effect.type === "FORCE_ATTACK_ROLL") {
      return !attackBuffsNegated;
    }

    // Lord Haart (Necropolis) Dread Knights I/VI: an instant that softens an
    // enemy Retaliation Attack. Offered only on a genuine retaliation
    // (`isRetaliation`) aimed at one of the reacting player's own units — the
    // trigger controller "opponent" already kept it off the attacker's tray, so
    // this just confirms the strike is a retaliation against your unit.
    if (effect.type === "REDUCE_RETALIATION_DAMAGE") {
      return triggerEvent.isRetaliation && defender.controllerId === playerId;
    }

    // Slayer: only the attacker's controller, and only when striking a gold
    // unit ("when attacking a golden unit"). A Creature Bank defender has no
    // tier, so it never counts as golden. Misfortune locks it out too.
    if (effect.type === "SLAYER_ATTACK") {
      return (
        !attackBuffsNegated && attacker.controllerId === playerId && !defender.bankUnit && defender.grade === "gold"
      );
    }

    // Frenzy: only the attacker's controller. The Power-scaled form (gradeByPower)
    // is offered whenever you attack — the pierced grade is decided at resolution
    // from the Power you pool in (power 0 already pierces bronze, like Bloodlust
    // is always offered). The legacy fixed-grade form is offered only when its
    // grade reaches the defender, keeping a wasted pierce off the menu.
    if (effect.type === "IGNORE_DEFENSE") {
      // A Creature Bank defender has no tier, so Frenzy can never pierce it —
      // never offer it (the Power-scaled form would otherwise always appear).
      if (defender.bankUnit) {
        return false;
      }
      if (effect.gradeByPower) {
        return attacker.controllerId === playerId;
      }
      return (
        attacker.controllerId === playerId &&
        effect.grade !== undefined &&
        gradeRankOfUnit(defender) <= gradeRank(effect.grade)
      );
    }

    // Alamar's Resurrection is never a pre-die attack reaction — it is offered
    // only in its own save window, when the attack would actually be lethal.

    // Power may be paid into an attack window so a spell instant in the same
    // declaration can consume it (the batch validator enforces the pairing).
    if (effect.type === "ADD_SPELL_POWER") {
      if (!(attacker.controllerId === playerId || defender.controllerId === playerId)) {
        return false;
      }
      // School-restricted Power (Elemental Orbs, Basic-School Magic abilities)
      // may empower a spell instant here only once a matching-school spell has
      // been played into this attack — Slayer, Bloodlust and Frenzy are Fire,
      // so a Fire Orb fuels them. Generic Power needs no school match.
      if (effect.schoolOnly) {
        return attackStackHasSpellOfSchool(getPendingStackItem(state, triggerEvent), effect.schoolOnly);
      }
      return true;
    }

    // Interference / Plate of the Dying Light: the "+X defense" base is a plain
    // defense reaction, so it is offered to the controller of the unit being
    // attacked. Only the DEFENSE_BONUS half applies to an attack; the paired
    // SPELL_DAMAGE_REDUCTION rider is inert here. (basic +X / expert +X.)
    if (effect.type === "INTERFERE_SPELL") {
      return defender.controllerId === playerId;
    }

    if (effect.type !== "ADD_COMBAT_STAT") {
      return false;
    }

    // Misfortune: a positive attack bonus on the attacker (Bloodlust, Precision)
    // is refused once their attack is locked. A negative attack (Weakness, the
    // defender's debuff) and any defense change (Curse) are NOT attack increases,
    // so they are untouched.
    if (attackBuffsNegated && effect.stat === "attack" && effect.amount >= 0) {
      return false;
    }

    // Curse (−defense) is played by the attacker against the defender;
    // Weakness (−attack) by the defender against the attacker. Positive
    // bonuses belong to the unit's own side as before.
    const benefitsAttacker = effect.stat === "attack" ? effect.amount >= 0 : effect.amount < 0;
    const owner = benefitsAttacker ? attacker : defender;
    if (owner.controllerId !== playerId) {
      return false;
    }

    // Bloodlust/Precision/Golden Bow restrict the unit types they boost.
    const affected = effect.stat === "attack" ? attacker : defender;
    if (effect.unitTypes && !effect.unitTypes.includes(affected.type)) {
      return false;
    }

    // Shield (instant): +Defense only against a ground/flying attacker. Gate on
    // the ATTACKER's type, not the buffed defender's (the unitTypes check above).
    // A ranged shot slips past Shield — that is Air Shield's (Ongoing) job.
    if (effect.vsAttackerType === "ground-or-flying" && attacker.type === "ranged") {
      return false;
    }
    if (effect.vsAttackerType === "ranged" && attacker.type !== "ranged") {
      return false;
    }

    // Precision: only on a ranged (non-adjacent) shot.
    if (effect.ignoreRangedPenalty && triggerEvent.attackKind !== "ranged") {
      return false;
    }

    return true;
  }

  return false;
}

export function getActiveUnitId(state: GameState): UnitId | null {
  return state.combat?.activeUnitId ?? null;
}

// ---------------------------------------------------------------------------
// Adventure mode legal actions
// ---------------------------------------------------------------------------

function addVisitStepActions(actions: LegalAction[], state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  const adventure = state.adventure;
  const visit = adventure?.pendingVisit;
  const step = visit?.steps[0];
  if (!adventure || !visit || !step || visit.playerId !== playerId) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }

  if (step.type === "CHOOSE_ONE") {
    for (const [optionIndex, option] of step.options.entries()) {
      // Pandora's Box: the deck-draw option needs cards left in the deck.
      if (
        option.steps.some((inner) => inner.type === "DRAW_PANDORA_CARD") &&
        !state.adventure?.pandoraDeck?.length
      ) {
        continue;
      }
      actions.push({
        label: option.label,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex }
      });
    }
    return;
  }

  if (step.type === "PAY_TO") {
    for (const [optionIndex, cost] of step.costOptions.entries()) {
      if (!playerHasResources(player, cost)) {
        continue;
      }

      const label = Object.entries(cost)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ");
      actions.push({
        label: `Pay ${label}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex }
      });
    }
    actions.push({
      label: "Decline",
      action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true }
    });
    return;
  }

  if (step.type === "SETTLEMENT_CHOICE") {
    const field = adventure.fields[visit.fieldId];
    const free = field ? !field.everFlagged : false;
    actions.push(
      {
        label: `Increase gold income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.gold}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 }
      },
      {
        label: `Increase building materials income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.buildingMaterials}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 1 }
      },
      {
        label: `Increase valuables income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.valuables}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 2 }
      }
    );

    const fewUnits = player.army.filter((unit) => {
      if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
        return false;
      }
      const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
      return tier === "bronze" || tier === "silver";
    });
    fewUnits.forEach((unit, index) => {
      // Half cost (rounded up), unless a Legion voucher reserved for this unit
      // beats it (non-stacking; matches what resolveSettlementChoice charges).
      const halfCost = Object.entries(reinforceCostFor(state, playerId, unit.id, true, false, false) ?? {})
        .filter(([, amount]) => amount)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ");
      actions.push({
        label: free
          ? `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} for free`
          : `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (${halfCost})`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 3 + index }
      });
    });
    return;
  }

  if (step.type === "RESOURCE_GAIN_LEVEL") {
    actions.push(
      {
        label: `Raise Gold income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.gold} (one level)`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 }
      },
      {
        label: `Raise Building Materials income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.buildingMaterials} (one level)`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 1 }
      },
      {
        label: `Raise Valuables income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.valuables} (one level)`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 2 }
      }
    );
    return;
  }

  if (step.type === "WITCH_HUT") {
    // The rulebook reveals the top Ability card before the player decides.
    const top = state.decks.abilities?.drawPile.at(-1);
    const topName = top ? (cards[top]?.name ?? top) : "the top Ability card";
    actions.push(
      { label: `Take ${topName} into hand`, action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 } },
      {
        label: `Put ${topName} into the discard pile`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 1 }
      },
      { label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } }
    );
    return;
  }

  if (step.type === "MAGIC_SPRING") {
    const topThree = player.discard.slice(-3).reverse();
    topThree.forEach((cardId, index) => {
      actions.push({
        label: `Return ${cards[cardId]?.name ?? cardId} to hand`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "TRADING_POST") {
    for (const [rateIndex, rate] of TRADE_RATES.entries()) {
      if (playerHasResources(player, rate.sell)) {
        actions.push({
          label: `Trade ${rate.label}`,
          action: { type: "TRADE_RESOURCES", playerId, rateIndex }
        });
      }
    }
    // The other two printed options ("choose one") stay open only until the
    // first resource trade: sell one card from hand for 1 gold (Specialty,
    // Statistic, starting Ability and Magic Arrow excluded), or buy a war
    // machine at the higher price.
    if (!step.traded) {
      for (const { index, cardId } of removableHandCards(state, playerId, "sellable")) {
        actions.push({
          label: `Sell ${cards[cardId]?.name ?? cardId} → gain 1 gold`,
          action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
        });
      }
      for (const offer of warMachinesForSale(state, "trading-post")) {
        if (playerHasResources(player, offer.cost)) {
          actions.push({
            label: `Buy ${offer.card.name} (${offer.cost.gold ?? 0} gold)`,
            action: { type: "BUY_WAR_MACHINE", playerId, cardId: offer.cardId }
          });
        }
      }
      // Spell Scroll spells may be sold here for 2 gold each.
      for (const scroll of player.scrolls ?? []) {
        for (const cardId of new Set(scroll.spellCardIds)) {
          actions.push({
            label: `Sell ${cards[cardId]?.name ?? cardId} (Scroll) → gain 2 gold`,
            action: { type: "SELL_SCROLL_SPELL", playerId, scrollId: scroll.id, cardId }
          });
        }
      }
    }
    actions.push({ label: "Done trading", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "WAR_MACHINE_SHOP") {
    for (const offer of warMachinesForSale(state, "factory")) {
      if (playerHasResources(player, offer.cost)) {
        actions.push({
          label: `Buy ${offer.card.name} (${offer.cost.gold ?? 0} gold)`,
          action: { type: "BUY_WAR_MACHINE", playerId, cardId: offer.cardId }
        });
      }
    }
    actions.push({ label: "Leave the factory", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "DISCOVER_ADJACENT_TILE") {
    const field = adventure.fields[visit.fieldId];
    const tile = field ? adventure.tiles[field.tileInstanceId] : undefined;
    const hero = state.heroes[visit.heroId];
    // Flip any adjacent face-down tile on the hero's layer — the Observatory /
    // Speculum ignore borders and edges, so there is NO "stand at an open
    // border" requirement here (unlike ordinary movement-driven discovery).
    const candidates = tile && hero ? observatoryRevealTargets(state, hero, tile) : [];
    candidates.forEach((candidate, index) => {
      actions.push({
        label: `Discover the face-down tile at (${candidate.centerRow}, ${candidate.centerCol})`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    // Or open a brand-new tile by dropping a Far (Ⅱ–Ⅲ) supply tile into an empty
    // slot adjacent to the observatory's own flower — no hero-access/border gate
    // (that is the whole point of the Observatory). Face-down Far tiles are
    // interchangeable backs, so the top of the supply is offered for each slot.
    const supply = adventure.playerFarTiles[playerId] ?? [];
    if (tile && hero && supply.length > 0) {
      const supplyIndex = 0;
      for (const center of observatoryPlacementCenters(state, hero, tile, supply[supplyIndex])) {
        actions.push({
          label: `Place a Far (Ⅱ–Ⅲ) tile at (${center.row}, ${center.col})`,
          action: {
            type: "PLACE_OBSERVATORY_TILE",
            playerId,
            supplyIndex,
            centerRow: center.row,
            centerCol: center.col
          }
        });
      }
    }
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "REMOVE_HAND_CARD") {
    for (const { index, cardId } of removableHandCards(state, playerId, step.filter)) {
      actions.push({
        label: `Remove ${cards[cardId]?.name ?? cardId}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    }
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "SEARCH_DISCARD") {
    const deck = state.decks[step.deckId];
    const topCards = deck ? deck.discardPile.slice(-step.count).reverse() : [];
    topCards.forEach((cardId, index) => {
      actions.push({
        label: `Take ${cards[cardId]?.name ?? cardId}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    actions.push({ label: "Take nothing", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "HILL_FORT") {
    const fewUnits = player.army.filter((unit) => {
      if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
        return false;
      }
      const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
      return tier === "bronze" || tier === "silver";
    });
    fewUnits.forEach((unit, index) => {
      const packSide = getUnitSide(unit.unitDefId, "pack");
      const cost = hillFortCost(packSide?.cost ?? {});
      const costLabel = Object.entries(cost)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ") || "free";
      if (playerHasResources(player, cost)) {
        actions.push({
          label: `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (${costLabel})`,
          action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
        });
      }
    });
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "TAVERN") {
    // Pay 7 gold to gain a Secondary Hero (one per player), then pick an enemy
    // to discard a card. optionIndex selects the enemy in turn order.
    const canGain = !getSecondaryHero(state, playerId) && playerHasResources(player, { gold: 7 });
    if (canGain) {
      const enemies = humanPlayerIds(state).filter((id) => id !== playerId);
      if (enemies.length === 0) {
        actions.push({
          label: "Pay 7 gold to gain a Secondary Hero",
          action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 }
        });
      } else {
        enemies.forEach((enemyId, index) => {
          actions.push({
            label: `Pay 7 gold — ${state.players[enemyId]?.name ?? enemyId} discards a card`,
            action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
          });
        });
      }
    }
    actions.push({ label: "Decline", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }
}

function addCombatSetupActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  const setup = combat?.setup;
  const player = state.players[playerId];
  if (!combat || !setup || !player || setup.pendingPlayerIds[0] !== playerId) {
    return;
  }

  const placed = setup.placedUnitIds[playerId] ?? [];
  const cells = placementCellsFor(state, playerId);
  const takenPositions = new Set(Object.values(combat.units).map((unit) => unit.position));

  if (placed.length < setup.unitLimit) {
    for (const armyUnit of player.army) {
      if (placed.includes(armyUnit.id)) {
        continue;
      }

      const unitName = coreUnitDefinitions[armyUnit.unitDefId]?.name ?? armyUnit.unitDefId;
      for (const position of cells) {
        if (takenPositions.has(position)) {
          continue;
        }

        actions.push({
          label: `Place ${armyUnit.side} ${unitName} at ${getBattlefieldLabel(position)}`,
          action: { type: "PLACE_COMBAT_UNIT", playerId, armyUnitId: armyUnit.id, position }
        });
      }
    }
  }

  for (const armyUnitId of placed) {
    const unitName = coreUnitDefinitions[player.army.find((unit) => unit.id === armyUnitId)?.unitDefId ?? ""]?.name;
    actions.push({
      label: `Take back ${unitName ?? armyUnitId}`,
      action: { type: "UNPLACE_COMBAT_UNIT", playerId, armyUnitId }
    });
  }

  if (placed.length > 0) {
    actions.push({
      label: "Ready for battle",
      action: { type: "FINISH_COMBAT_PLACEMENT", playerId }
    });
  }
}

/** A player's living, swappable (non-Arrow-Tower) units, left-to-right. */
function tacticsSwappableUnits(combat: CombatState, playerId: PlayerId): CombatUnitState[] {
  return Object.values(combat.units)
    .filter((unit) => unit.controllerId === playerId && isUnitAlive(unit) && !isArrowTowerUnit(unit))
    .sort((left, right) => left.position - right.position);
}

/** Start-of-combat Tactics window: every two-unit switch, plus "keep". */
function addTacticsSetupActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.pendingTacticsSwaps?.[0] !== playerId) {
    return;
  }

  const units = tacticsSwappableUnits(combat, playerId);
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      actions.push({
        label: `Tactics: switch ${units[i].cardName} (${getBattlefieldLabel(units[i].position)}) and ${units[j].cardName} (${getBattlefieldLabel(units[j].position)})`,
        action: { type: "SWAP_COMBAT_UNITS", playerId, unitIdA: units[i].id, unitIdB: units[j].id }
      });
    }
  }

  actions.push({
    label: "Tactics: keep your current positions",
    action: { type: "FINISH_TACTICS", playerId }
  });
}

/**
 * Expert Tactics mid-combat: on the holder's turn, before their active unit has
 * moved or attacked, spend one expert use to switch any two of their units.
 */
function addTacticsCombatActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || state.phase !== "combat" || state.pendingChoice || state.reactionWindow || state.stack.length > 0) {
    return;
  }
  const player = state.players[playerId];
  // Tactics is Expert-only; an Empowered Tactics may be used without a crown.
  if (!player || !player.hand.includes("ability.tactics") || !canPlayExpertMode(player, "ability.tactics")) {
    return;
  }
  const active = combat.activeUnitId ? combat.units[combat.activeUnitId] : null;
  if (!active || active.controllerId !== playerId || active.movedThisActivation || active.attackedThisActivation) {
    return;
  }

  const units = tacticsSwappableUnits(combat, playerId);
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      actions.push({
        label: `Tactics (expert): switch ${units[i].cardName} (${getBattlefieldLabel(units[i].position)}) and ${units[j].cardName} (${getBattlefieldLabel(units[j].position)})`,
        action: { type: "SWAP_COMBAT_UNITS", playerId, unitIdA: units[i].id, unitIdB: units[j].id }
      });
    }
  }
}

function addTownActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  const town = getTownOfPlayer(state, playerId);
  // Town actions are normally blocked during a combat, with one exception: a
  // participant in their PvP pre-battle preparation window may still spend the
  // round's town actions before the fight (build / recruit / buy spells).
  const inPrep = inCombatPrep(state, playerId);
  if (!player || !town || (state.combat && !inPrep)) {
    return;
  }

  if (player.townTokens.build) {
    for (const buildingId of coreFactionDefinitions[player.factionId ?? ""]?.buildings ?? []) {
      const building = coreBuildingDefinitions[buildingId];
      if (
        !building ||
        building.implementationStatus !== "implemented" ||
        town.buildings.includes(buildingId) ||
        (building.prerequisites ?? []).some((prerequisite) => !town.buildings.includes(prerequisite)) ||
        !playerHasResources(player, building.cost)
      ) {
        continue;
      }

      actions.push({
        label: `Build ${building.name}`,
        action: { type: "BUILD_STRUCTURE", playerId, townId: town.id, buildingId }
      });
    }
  }

  if (player.townTokens.population) {
    const tiers = unlockedRecruitTiers(state, playerId);
    const canReinforce = townHasBuildingEffect(state, playerId, "UNLOCK_REINFORCE");
    const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;

    for (const unitDefId of faction?.units ?? []) {
      const unit = coreUnitDefinitions[unitDefId];
      const fewSide = unit?.few;
      if (!unit || !fewSide || !tiers.has(unit.tier)) {
        continue;
      }

      // Each unit card exists once: a type already in the army cannot be
      // recruited again — only its Few card may be reinforced to the Pack.
      const owned = player.army.some((armyUnit) => armyUnit.unitDefId === unitDefId);
      // A Legion voucher reserved for this unit may make it affordable — fold in
      // the single best (non-stacking) gold discount when offering the action.
      const recruitCost = applyBestRecruitDiscount(state, playerId, { kind: "recruit", unitDefId }, fewSide.cost);
      if (!owned && hasRecruitResources(state, playerId, recruitCost)) {
        actions.push({
          label: `Recruit few ${unit.name}`,
          action: {
            type: "POPULATION_ACTION",
            playerId,
            purchases: [{ kind: "recruit", unitDefId }]
          }
        });
      }

      if (canReinforce) {
        const target = player.army.find((armyUnit) => armyUnit.unitDefId === unitDefId && armyUnit.side === "few");
        const packSide = unit.pack;
        // Reinforcement discounts do NOT stack: the gold paid drops by the single
        // largest of the Champions' Stables discount and a Legion voucher reserved
        // for this unit (applyBestRecruitDiscount), never their sum.
        const reinforceCost =
          packSide && target
            ? applyBestRecruitDiscount(
                state,
                playerId,
                { kind: "reinforce", unitDefId, armyUnitId: target.id },
                packSide.cost
              )
            : undefined;
        if (target && packSide && reinforceCost && hasRecruitResources(state, playerId, reinforceCost)) {
          actions.push({
            label: `Reinforce ${unit.name} to a pack`,
            action: {
              type: "POPULATION_ACTION",
              playerId,
              purchases: [{ kind: "reinforce", unitDefId, armyUnitId: target.id }]
            }
          });
        }
      }
    }
  }

  if (player.townTokens.spellBook && townHasBuildingEffect(state, playerId, "MAGE_GUILD")) {
    const mageGuild = town.buildings
      .map((buildingId) => coreBuildingDefinitions[buildingId])
      .find((building) => building?.effect?.type === "MAGE_GUILD");
    const cost = mageGuild?.spellBookCost ?? 5;
    if (player.mageGuildBuiltRound !== state.round) {
      if (player.resources.gold >= cost) {
        actions.push({
          label: `Buy spells (${cost} gold, Search 2)`,
          action: { type: "SPELL_BOOK_ACTION", playerId }
        });
      }

      // Wisdom rides on the purchase: cheaper spells and a bigger search.
      const ruleset = getRuleset(state);
      const wisdomCardId = player.hand.find((cardId) => cardLibrary[cardId]?.name === "Wisdom");
      if (wisdomCardId) {
        const basicCost = Math.max(0, cost - wisdomGoldDiscount(ruleset, "basic"));
        if (player.resources.gold >= basicCost) {
          actions.push({
            label: `Buy spells with Wisdom (${basicCost} gold, Search ${wisdomSearchCount("basic")})`,
            action: { type: "SPELL_BOOK_ACTION", playerId, wisdom: { cardId: wisdomCardId, mode: "basic" } }
          });
        }

        const expertCost = Math.max(0, cost - wisdomGoldDiscount(ruleset, "expert"));
        // Empowered Wisdom skips the crown but still pays the gold.
        if (canPlayExpertMode(player, wisdomCardId) && player.resources.gold >= expertCost) {
          actions.push({
            label: `Buy spells with expert Wisdom (${expertCost} gold, Search ${wisdomSearchCount("expert")})`,
            action: { type: "SPELL_BOOK_ACTION", playerId, wisdom: { cardId: wisdomCardId, mode: "expert" } }
          });
        }
      }
    }
  }

  // Blacksmith: once per turn, search Artifacts for gold or sell one.
  const smith = town.buildings
    .map((buildingId) => coreBuildingDefinitions[buildingId])
    .find((building) => building?.effect?.type === "ARTIFACT_SMITH");
  if (smith?.effect?.type === "ARTIFACT_SMITH" && player.blacksmithUsedRound !== state.round) {
    if (player.resources.gold >= smith.effect.searchCost) {
      actions.push({
        label: `Blacksmith: pay ${smith.effect.searchCost} gold, Search (2) Artifacts`,
        action: { type: "BLACKSMITH_ACTION", playerId, option: "search" }
      });
    }
    for (const cardId of new Set(player.hand)) {
      if (cardLibrary[cardId]?.kind === "artifact") {
        actions.push({
          label: `Blacksmith: sell ${cardLibrary[cardId]?.name} for ${smith.effect.sellGold} gold`,
          action: { type: "BLACKSMITH_ACTION", playerId, option: "sell", artifactCardId: cardId }
        });
      }
    }
  }

  // Magic University (Conflux): once per round, instead of buying spells at the
  // Mage Guild, choose a School of Magic and dig your deck for that school's
  // Spell. Offered as one action per school during your turn.
  if (
    townHasBuildingEffect(state, playerId, "MAGIC_UNIVERSITY") &&
    player.magicUniversityUsedRound !== state.round
  ) {
    const schools: SpellSchool[] = ["air", "earth", "fire", "water"];
    for (const school of schools) {
      actions.push({
        label: `Magic University: search your deck for a ${school[0].toUpperCase()}${school.slice(1)} Magic spell`,
        action: { type: "MAGIC_UNIVERSITY_ACTION", playerId, school }
      });
    }
  }

  // "During your turn" buildings, each once per round.
  if (state.activePlayerId === playerId) {
    for (const buildingId of town.buildings) {
      const building = coreBuildingDefinitions[buildingId];
      if (!building || (player.buildingUsedRound?.[buildingId] ?? 0) === state.round) {
        continue;
      }

      if (building.effect?.type === "COVER_OF_DARKNESS" && player.hand.length > 0) {
        actions.push({
          label: `${building.name}: discard up to 2 cards, draw that many`,
          action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 0, cardIds: [] }
        });
      }

      // A clean map turn action only — never mid-combat (incl. the PvP prep
      // window, where addTownActions also runs) or mid-reaction, matching
      // thievesGuildAction's assertNoPendingInput so the offer can never be rejected.
      if (building.effect?.type === "THIEVES_GUILD" && !state.combat && !state.reactionWindow) {
        // "Any one deck in the game": every shared deck with at least 2 cards on
        // top to look at...
        for (const [deckId, deck] of Object.entries(state.decks)) {
          if (deck.drawPile.length >= 2) {
            actions.push({
              label: `${building.name}: look at the top 2 of the ${deckDisplayName(state, deckId)} deck`,
              action: { type: "THIEVES_GUILD_ACTION", playerId, buildingId, target: { kind: "shared", deckId } }
            });
          }
        }
        // ...plus every player's Might & Magic deck (your own and opponents').
        for (const ownerId of state.turnOrder) {
          const owner = state.players[ownerId];
          if (ownerId === "neutrals" || !owner || owner.deck.length < 2) {
            continue;
          }
          actions.push({
            label: `${building.name}: look at the top 2 of ${ownerId === playerId ? "your own" : `${owner.name}'s`} Might & Magic deck`,
            action: { type: "THIEVES_GUILD_ACTION", playerId, buildingId, target: { kind: "player", ownerId } }
          });
        }
      }

      if (building.effect?.type === "CASTLE_GATE") {
        if (player.resources.gold >= building.effect.discardCost) {
          for (const opponentId of state.turnOrder) {
            const opponent = state.players[opponentId];
            if (opponentId === playerId || opponentId === "neutrals" || !opponent || opponent.hand.length === 0) {
              continue;
            }
            actions.push({
              label: `${building.name}: pay ${building.effect.discardCost} gold — random discard from ${opponent.name}`,
              action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 0, targetPlayerId: opponentId }
            });
          }
        }

        const hero = Object.values(state.heroes).find(
          (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
        );
        if (hero?.spaceId && state.adventure) {
          const here = hero.spaceId;
          const isOwnHolding = (spaceId: string) =>
            Object.values(state.towns).some((candidate) => candidate.fieldId === spaceId && candidate.controllerId === playerId) ||
            (state.adventure?.fields[spaceId]?.location === "settlement" &&
              state.adventure?.fields[spaceId]?.flagOwnerId === playerId);
          if (isOwnHolding(here)) {
            for (const field of Object.values(state.adventure.fields)) {
              if (field.spaceId !== here && isOwnHolding(field.spaceId)) {
                actions.push({
                  label: `${building.name}: move the hero to ${field.location === "settlement" ? "the settlement" : "the town"} at ${field.spaceId}`,
                  action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 1, spaceId: field.spaceId }
                });
              }
            }
          }
        }
      }
    }
  }

  // Buy a Secondary Hero for 10 gold (one per player). It appears at the town
  // wearing the portrait of one of your faction's other heroes.
  if (!getSecondaryHero(state, playerId) && playerHasResources(player, { gold: 10 })) {
    const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;
    const mainHeroDefId = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
    )?.heroDefId;
    for (const heroDefId of faction?.heroes ?? []) {
      if (heroDefId === mainHeroDefId) {
        continue;
      }
      actions.push({
        label: `Hire Secondary Hero as ${coreHeroDefinitions[heroDefId]?.name ?? heroDefId} (10 gold)`,
        action: { type: "HIRE_SECONDARY_HERO", playerId, heroDefId }
      });
    }
  }
}

/**
 * The positive morale token's non-reroll uses, by the book ("Draw a card from
 * your Deck" / "Discard any number of cards, then draw that many") — spendable
 * at any time while you hold the token, not only while standing at your Town.
 * The third use, rerolling a Die you have thrown, is offered inside the dice
 * flows (adventure rolls and the combat attack-die reroll) instead.
 */
/**
 * Player-vs-player escape (house rule): at the start of the combat (round 1,
 * between activations) a participating hero may:
 * - Retreat — lose the combat: pay 5 gold (may go into debt), take -1 morale,
 *   lose troops per the lobby mode, and fall back home. Always available.
 * - Surrender — pay a flat 10 gold to the opponent, keep the whole army, take
 *   no morale hit, return home, and deny the opponent any victory credit.
 *   Offered only with the full 10 gold in hand and while Shackles of War has
 *   not locked it.
 */
function addPvpEscapeActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player") {
    return;
  }
  // Retreat is offered here in two spots: a participant's pre-battle prep window,
  // and after deployment but before any unit has begun fighting
  // (pvpEscapeWindowOpen) while the combat card window is open. (It is also
  // offered DURING placement — see addPvpRetreatDuringSetup.) Once a unit acts
  // Retreat closes and the in-fight concede takes over (addGiveUpCombatActions,
  // labelled Retreat). Surrender, by contrast, is a "before battle" option only:
  // it is offered solely in the prep window, never once deployment has begun.
  const inPrep = inCombatPrep(state, playerId);
  if (!inPrep && (!pvpEscapeWindowOpen(combat) || !isCombatCardWindowOpen(state))) {
    return;
  }
  const heroId =
    playerId === combat.attackerPlayerId ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  if (!heroId) {
    return;
  }
  actions.push({
    label: "Retreat (lose the combat: pay 5 gold, -1 morale, fall back home)",
    action: { type: "RETREAT_FROM_COMBAT", playerId }
  });
  // Surrender is a before-battle decision only (the prep window), and never when
  // defending your own Faction Town (rulebook p.46).
  const gold = state.players[playerId]?.resources.gold ?? 0;
  if (
    inPrep &&
    gold >= SURRENDER_GOLD_COST &&
    !playerCannotSurrenderCombat(state, playerId) &&
    !isDefendingOwnFactionTown(state, playerId)
  ) {
    actions.push({
      label: `Surrender (pay ${SURRENDER_GOLD_COST} gold, keep your whole army, return home)`,
      action: { type: "SURRENDER_COMBAT", playerId }
    });
  }
}

/**
 * Retreat offered WHILE units are being placed (the combat-setup / deployment
 * step). A PvP hero may bail out before the fighting starts even mid-deployment;
 * no unit has acted yet, so it is the same no-casualties Retreat as the
 * post-deployment window. Surrender is NOT offered here — it is a prep-only
 * ("before battle") option.
 */
function addPvpRetreatDuringSetup(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player" || combat.outcome || !combat.setup) {
    return;
  }
  // Offered to the player whose turn it is to place (the one looking at the
  // deployment panel) — the other side is shown a "waiting" panel with no
  // controls, so offering it to them would be a button-less legal action.
  if (combat.setup.pendingPlayerIds[0] !== playerId) {
    return;
  }
  const heroId =
    playerId === combat.attackerPlayerId ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  if (!heroId) {
    return;
  }
  actions.push({
    label: "Retreat (lose the combat: pay 5 gold, -1 morale, fall back home)",
    action: { type: "RETREAT_FROM_COMBAT", playerId }
  });
}

/**
 * The in-fight Retreat: once the fighting has begun there is only ONE way to
 * leave a player-vs-player combat, and it is shown to the player as "Retreat".
 * Internally it is the GIVE_UP_COMBAT concede (the start-of-combat
 * RETREAT_FROM_COMBAT is a no-casualties flee that closes the instant a unit
 * acts). Always a defeat with the same consequences (5 gold, -1 morale, fall
 * back home, the opponent wins). The troop cost depends on the lobby's PvP
 * casualty mode: in losing-troop mode only the casualties taken up to that point
 * are lost (survivors fall back); in keep-troops mode every unit is kept and the
 * hand is discarded instead. Neutral-guard fights have no in-fight Retreat — only
 * the end-of-round Retreat.
 *
 * It is NOT offered while the start-of-combat escape window is still open: there
 * the no-casualties RETREAT_FROM_COMBAT is offered instead (also labelled
 * "Retreat"), so the player always sees exactly one Retreat button. This concede
 * surfaces only once fighting has begun and that window has closed.
 */
function addGiveUpCombatActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.outcome || combat.context.kind !== "player") {
    return;
  }
  // While the no-casualties RETREAT_FROM_COMBAT is still available (start of
  // combat, before any unit acts) this concede is suppressed so there is never
  // more than one Retreat button on screen at a time.
  if (pvpEscapeWindowOpen(combat)) {
    return;
  }
  const isParticipant = combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId;
  const heroId =
    playerId === combat.attackerPlayerId ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  if (!isParticipant || !heroId) {
    return;
  }
  const losesTroops = adventurePvpTroopLoss(state) === "normal";
  actions.push({
    label: losesTroops
      ? "Retreat (lose the combat — your fallen so far stay lost, survivors fall back home)"
      : "Retreat (lose the combat and discard your hand, fall back home)",
    action: { type: "GIVE_UP_COMBAT", playerId }
  });
}

function addMoraleActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  // The stored +1 token, or an overflow token gained past the cap that must be
  // spent now — both resolve through the same draw / discard-redraw actions.
  if (!player || ((player.morale ?? 0) <= 0 && (player.moraleOverflow ?? 0) <= 0)) {
    return;
  }

  actions.push({
    label: "Spend morale: draw a card",
    action: { type: "SPEND_MORALE", playerId, benefit: "draw" }
  });
  if (player.hand.length > 0) {
    actions.push({
      label: "Spend morale: discard any cards, draw that many",
      action: { type: "SPEND_MORALE", playerId, benefit: "redraw", discardCardIds: [] }
    });
  }
}

function getSetupLobbyLegalActions(state: GameState, playerId: PlayerId): LegalAction[] {
  const lobby = state.setupLobby;
  const actions: LegalAction[] = [];
  if (!lobby) {
    return actions;
  }

  const seat = lobby.seats.find((candidate) => candidate.playerId === playerId);
  if (!seat) {
    return actions;
  }

  const takenFactions = new Set(
    lobby.seats.filter((candidate) => candidate.playerId !== playerId).map((candidate) => candidate.factionId)
  );
  const draft = lobby.draft ?? { mode: "open" as const, bannedHeroDefIds: [] };
  const banned = new Set(draft.mode === "ban" ? draft.bannedHeroDefIds : []);

  for (const faction of Object.values(coreFactionDefinitions)) {
    if (takenFactions.has(faction.id)) {
      continue;
    }

    for (const heroDefId of faction.heroes) {
      if (banned.has(heroDefId)) {
        continue;
      }
      if (seat.factionId === faction.id && seat.heroDefId === heroDefId) {
        continue;
      }
      actions.push({
        label: `Play ${faction.name} — ${heroDefId}`,
        action: { type: "CHOOSE_FACTION", playerId, factionId: faction.id, heroDefId }
      });
    }
  }

  // Draft tab: switch the mode, ban/un-ban heroes (ban mode only), and roll a
  // random town/hero. Mirrors the engine handlers' own validation.
  actions.push({
    label: draft.mode === "ban" ? "Return to free hero picking" : "Open ban-pick drafting",
    action: { type: "SET_DRAFT_MODE", playerId, mode: draft.mode === "ban" ? "open" : "ban" }
  });

  if (draft.mode === "ban") {
    for (const faction of Object.values(coreFactionDefinitions)) {
      for (const heroDefId of faction.heroes) {
        const isBanned = banned.has(heroDefId);
        if (!isBanned && lobby.seats.some((candidate) => candidate.heroDefId === heroDefId)) {
          continue;
        }
        actions.push({
          label: `${isBanned ? "Un-ban" : "Ban"} ${heroDefId}`,
          action: { type: "TOGGLE_HERO_BAN", playerId, heroDefId }
        });
      }
    }
  }

  const selectableHeroFor = (factionId: FactionId): boolean => {
    const faction = coreFactionDefinitions[factionId];
    return Boolean(faction && faction.heroes.some((heroDefId) => !banned.has(heroDefId)));
  };
  const hasRollableFaction = (Object.values(coreFactionDefinitions) as { id: FactionId }[]).some(
    (faction) => !takenFactions.has(faction.id) && selectableHeroFor(faction.id)
  );
  if (hasRollableFaction) {
    actions.push({
      label: "Roll a random town and hero",
      action: { type: "RANDOM_ASSIGN_SEAT", playerId, scope: "faction" }
    });
  }
  if (seat.factionId && selectableHeroFor(seat.factionId)) {
    actions.push({
      label: "Roll a random hero",
      action: { type: "RANDOM_ASSIGN_SEAT", playerId, scope: "hero" }
    });
  }

  if (lobby.seats.every((candidate) => candidate.factionId && candidate.heroDefId)) {
    actions.push({
      label: "Start the adventure",
      action: { type: "START_ADVENTURE", playerId }
    });
  }

  return actions;
}

function getAdventureLegalActions(state: GameState, playerId: PlayerId, cards: CardLibrary): LegalAction[] {
  const actions: LegalAction[] = [];
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (!adventure || !player) {
    return actions;
  }

  // A finished combat waits on the battlefield until a participant closes
  // the end-of-combat notice; only then does finalization run.
  if (state.combat?.outcome && !state.combat.endAcknowledged && !state.pendingChoice) {
    if (isCombatParticipant(state, playerId)) {
      actions.push({
        label: "Return to the adventure map",
        action: { type: "ACKNOWLEDGE_COMBAT_END", playerId }
      });
    }
    return actions;
  }

  // PvP pre-battle preparation: before deployment, BOTH the attacker and the
  // defender may spend any town action they still hold this round (build /
  // recruit / buy spells), then Accept to ready up — or Retreat / Surrender out
  // of the fight. Deployment begins only once both have accepted. The town
  // actions surface through addTownActions (allowed during this window). A
  // participant who has already accepted gets nothing here but waits.
  if (state.combat?.prep) {
    if (inCombatPrep(state, playerId)) {
      addTownActions(actions, state, playerId);
      addPvpEscapeActions(actions, state, playerId);
      actions.push({
        label: "Accept the battle (ready up — deployment begins when both sides accept)",
        action: { type: "ACCEPT_COMBAT", playerId }
      });
    }
    return actions;
  }

  // Start-of-combat Tactics window: the head of the queue switches two of their
  // units or declines, before round 1 begins.
  if (state.combat?.pendingTacticsSwaps && state.combat.pendingTacticsSwaps.length > 0) {
    if (state.combat.pendingTacticsSwaps[0] === playerId) {
      addTacticsSetupActions(actions, state, playerId);
    }
    return actions;
  }

  // Combat setup placement.
  if (state.combat?.setup) {
    addCombatSetupActions(actions, state, playerId);
    // A PvP hero may still Retreat while deploying (before any fighting).
    addPvpRetreatDuringSetup(actions, state, playerId);
    return actions;
  }

  // Combat pacing / reaction pause (see CombatState.pendingNeutralStep). The
  // reacting player may cast/react first (pre-activation) and then resumes; the
  // guard-walk pause just lets the table click the enemy move on.
  if (state.combat?.pendingNeutralStep) {
    const pause = state.combat.pendingNeutralStep;
    const reactor = pause.reactingPlayerId ?? state.combat.attackerPlayerId;
    if (playerId === reactor) {
      if (pause.kind === "pre-activation") {
        // Cast Intelligence-enabled spells, trigger-free instant spells, play
        // an instant ability, use an active effect (First Aid Tent), or play an
        // instant damage specialty (Gerwulf/Adelaide/Deemer's `combatAnytime`
        // sides) — all before the unit acts. (addSpellActions already gates
        // activation spells on the Intelligence freedom, so only the right
        // spells are offered off-turn.)
        actions.push(...getOffTurnCombatReactions(state, playerId, cards));
      }
      actions.push({
        label: pause.kind === "pre-activation" ? "Let the unit act" : "Continue the enemy turn",
        action: { type: "CONTINUE_NEUTRAL_STEP", playerId }
      });
    }
    return actions;
  }

  // The neutral combat time limit: continue for 1 MP or retreat.
  if (state.combat?.awaitingContinue) {
    const context = state.combat.context;
    if (context.kind === "neutral") {
      const hero = state.heroes[context.heroId];
      if (hero?.controllerId === playerId) {
        if (hero.movementPoints > 0) {
          actions.push({
            label: "Spend 1 movement point: fight another combat round",
            action: { type: "CONTINUE_NEUTRAL_COMBAT", playerId }
          });
        }
        // Dessa's Logistics specialty: continue the combat for free.
        const player = state.players[playerId];
        for (const cardId of new Set(player?.hand ?? [])) {
          if (cards[cardId]?.effect.type === "CONTINUE_NEUTRAL_FREE") {
            actions.push({
              label: `Play ${cards[cardId]?.name}: fight another combat round for free`,
              action: { type: "PLAY_CARD", playerId, cardId, target: { type: "none" } }
            });
          }
        }
        actions.push({
          label: "Retreat to the last visited field",
          action: { type: "RETREAT_FROM_COMBAT", playerId }
        });
      }
    }
    return actions;
  }

  // Active combat: the standard combat actions apply. Spells and instants
  // stay available to both fighters whoever's unit is active.
  if (state.combat && state.phase === "combat") {
    addActiveEffectActions(actions, state, playerId);
    addUnitActions(actions, state, playerId);
    addTacticsCombatActions(actions, state, playerId);
    addSpellActions(actions, state, playerId, cards);
    addPlayableCardActions(actions, state, playerId, cards);
    // Instant damage specialties are playable off-turn too (self-gates to the
    // off-turn side, so the active player is not double-offered them).
    addCombatAnytimeSpecialtyPlays(actions, state, playerId, cards);
    if (isCombatParticipant(state, playerId)) {
      addPermanentDiscardActions(actions, state, playerId);
      // A morale token (e.g. gained by playing Leadership mid-battle) may also
      // be spent for its draw / discard-redraw here; the reroll use is offered
      // by the attack-die reroll choice instead.
      addMoraleActions(actions, state, playerId);
      addPvpEscapeActions(actions, state, playerId);
      // Give up (concede) is available throughout the fight, not just the
      // start-of-combat escape window.
      addGiveUpCombatActions(actions, state, playerId);
    }
    return actions;
  }

  // A freshly revealed or placed tile waits for its rotation choice.
  const tileChoice = adventure.pendingTileChoice;
  if (tileChoice) {
    const tile = adventure.tiles[tileChoice.tileInstanceId];
    if (tileChoice.playerId === playerId && tile) {
      const anyConnected = [0, 1, 2, 3, 4, 5].some((rotation) => isTileRotationConnected(state, tile, rotation));
      // On-foot Far placements also require a rotation the placing hero can cross
      // onto (matches setTileRotation). Redwood Observatory openings carry no
      // heroId — they only need to connect to the map, no hero-access gate.
      const placingHero = tileChoice.heroId ? state.heroes[tileChoice.heroId] : null;
      const center = { row: tile.centerRow, col: tile.centerCol };
      const anyReachable =
        placingHero != null &&
        [0, 1, 2, 3, 4, 5].some((rotation) =>
          canHeroReachPlacedTile(state, placingHero, tile.tileDefId, center, rotation)
        );
      for (let rotation = 0; rotation < 6; rotation += 1) {
        if (anyConnected && !isTileRotationConnected(state, tile, rotation)) {
          continue;
        }
        if (
          placingHero &&
          anyReachable &&
          !canHeroReachPlacedTile(state, placingHero, tile.tileDefId, center, rotation)
        ) {
          continue;
        }
        actions.push({
          label: `Confirm tile rotation ${rotation * 60}°`,
          action: { type: "SET_TILE_ROTATION", playerId, tileInstanceId: tile.id, rotation }
        });
      }
    }
    return actions;
  }

  // Pending field visit choices. Any free combat-driven reinforce (the Skeleton
  // fallback) or level-up choice queued during finalization resolves here FIRST,
  // before the Necromancy gate below — none of these is the withheld field
  // reward, so the now-or-never rule is not weakened by letting them through.
  if (adventure.pendingVisit) {
    addVisitStepActions(actions, state, playerId, cards);
    return actions;
  }

  // BINH house rule: the after-combat Necromancy window is now-or-never. Until
  // the winner plays Necromancy or skips it, NOTHING else on the map is legal
  // and the field reward of the fight they just won stays withheld — so "collect
  // the field gold, then reinforce with it" is impossible.
  if (adventure.pendingNecromancy) {
    if (adventure.pendingNecromancy.playerId === playerId) {
      addNecromancyPlays(actions, state, playerId, cards);
      actions.push({ label: "Skip Necromancy", action: { type: "SKIP_NECROMANCY", playerId } });
    }
    return actions;
  }

  // Town and morale actions may happen during any player's turn. The morale
  // token's draw / discard-redraw is spendable anywhere, not only at a Town.
  addTownActions(actions, state, playerId);
  addMoraleActions(actions, state, playerId);

  if (state.activePlayerId !== playerId) {
    return actions;
  }

  // Over the hand limit at the start of the turn: discarding down (then drawing
  // back up) MUST come first — before town/morale actions, the optional draw,
  // any card play, movement or exploration. Nothing else is offered until the
  // forced discard is resolved, so the over-limit check always starts the turn.
  if (player.needsHandRefresh) {
    return [
      {
        label: "Discard down to your hand limit, then draw",
        action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
      }
    ];
  }

  // Start-of-turn draw/discard (every turn, including the first): discard any
  // number of cards, then draw back up to the hand limit ("draw new" with no
  // discards is the no-op pass). The draw is MANDATORY (house rule): it must be
  // taken before the player MOVES, EXPLORES or USES A CARD, so it can never be
  // forgotten. While it is unspent, the only turn actions offered are the draw
  // itself, ending the turn, and the town/morale actions already added above —
  // no movement, exploration, market or card play. (The engine backstops this in
  // assertHandRefreshed / assertStartOfTurnDrawTaken for handler-validated map
  // actions that skip this legal-action check.)
  if (player.canMulligan) {
    actions.push({
      label: "Draw new — or discard some and draw up to your hand limit (start of turn)",
      action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
    });
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  // Instant, Ongoing and Map cards may be played during your own map turn.
  addTurnCardActions(actions, state, playerId, cards);
  // Spell Book (house rule): stash hand Spells into the Book to free hand slots.
  addSpellBookStashActions(actions, state, playerId, cards);
  addPermanentDiscardActions(actions, state, playerId);

  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId !== playerId || !hero.spaceId) {
      continue;
    }

    const field = adventure.fields[hero.spaceId];

    // A hero parked on a Market may reopen the trade/shop panel any time, for
    // free — no movement point needed, so it stays available even when a
    // Secondary Hero simply sits on the tile.
    if (field && isMarketLocation(field.location)) {
      actions.push({
        label: `Open the ${locationDefinitions[field.location]?.name ?? field.location}`,
        action: { type: "OPEN_MARKET", playerId, heroId: hero.id }
      });
    }

    if (hero.movementPoints > 0) {
      for (const destination of getHeroMoveDestinations(state, hero)) {
        actions.push({
          label: `Move hero to ${destination}`,
          action: { type: "MOVE_HERO", playerId, heroId: hero.id, to: destination }
        });
      }

      if (field?.grailDiggable) {
        actions.push({
          label: "Dig the Grail (1 movement point)",
          action: { type: "REVISIT_FIELD", playerId, heroId: hero.id }
        });
      } else if (
        field &&
        locationDefinitions[field.location]?.category === "revisitable" &&
        // Markets use the free OPEN_MARKET path above, not the 1-MP revisit.
        !isMarketLocation(field.location)
      ) {
        actions.push({
          label: `Revisit ${locationDefinitions[field.location]?.name ?? field.location}`,
          action: { type: "REVISIT_FIELD", playerId, heroId: hero.id }
        });
      }

      for (const tile of Object.values(adventure.tiles)) {
        // Ordinary discovery needs an open border on the hero's own layer (no
        // crossing the Surface/Subterranean divide, no flipping across a sealed
        // yellow edge). The Redwood Observatory / Speculum bypass this gate.
        if (canHeroDiscoverAdjacentTile(state, hero, tile)) {
          actions.push({
            label: `Discover the face-down tile at (${tile.centerRow}, ${tile.centerCol})`,
            action: { type: "DISCOVER_TILE", playerId, heroId: hero.id, tileInstanceId: tile.id }
          });
        }
      }
    }
  }

  actions.push({
    label: "End turn",
    action: { type: "END_TURN", playerId }
  });

  // Concede: only on your own quiet map turn (never mid-Combat — "you cannot
  // surrender when defending your Faction Town", rulebook p.46).
  if (
    !state.combat &&
    !state.pendingChoice &&
    !state.reactionWindow &&
    !adventure.pendingVisit &&
    !adventure.pendingTileChoice &&
    !state.players[playerId]?.eliminated
  ) {
    actions.push({
      label: "Give up (become an observer)",
      action: { type: "GIVE_UP", playerId }
    });
  }

  return actions;
}
