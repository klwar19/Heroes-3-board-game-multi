import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  POLISH_CREATURE_BANKS,
  STACK_TOKENS_BY_DIFFICULTY,
  getCreatureBankUnitSide,
  type CreatureBankId,
} from "@/data/map/creature-banks";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { assessDwellingRush, openingCorePackTarget, openingBronzeCoreReady } from "./development";
import { isComputerPlayer, playersAreAllied } from "./control";
import { forecastContextKey, forecastCreatureBankField, forecastPlayerFight } from "./fight-forecast";
import { getRuleset, unitSideRuleOverrides } from "../ruleset";
import { houseRuleEnabled } from "../house-rules";
import { isOpeningFarMaterialMine, secondFarFightNeedsSilver } from "./far-sweep";
import type { UnitTier } from "@/data/factions/types";
import {
  getUnitSide,
  heroMovementMax,
  makeCombatUnitFromArmy,
  NEUTRAL_ARMY_TABLE,
  neutralArmyDifficulty,
  neutralArmyDifficultyForField,
} from "../adventure";
import { armyUnitRankInfo } from "../unit-experience";
import { COMBAT_UNIT_LIMIT, combatUnitLimit } from "../adventure-reducer";
import { commandersModuleEnabled, makeCommanderCombatUnit } from "../commanders";
import { NEUTRAL_PLAYER_ID } from "../state";
import { unitAbilities } from "@/data/units/abilities";
import { vpEngageBarShift } from "./vp-plan";
import { ATTACK_DIE_FACES } from "../battlefield";
import type {
  ArmyUnitState,
  BankSize,
  CombatUnitState,
  HeroState,
  GameDifficulty,
  GameState,
  MapFieldState,
  PlayerId,
} from "../state";

/**
 * A rough combat value for an army card side, used ONLY to order engagement
 * decisions (fight this hero or not) — never to resolve a battle, which the real
 * dice-driven combat engine still does. Attack is weighted heaviest (it is what
 * ends enemy units), health next (it is what keeps yours alive), with defense
 * and a slice of initiative rounding it out. Mirrors the combat policy's
 * `unitThreatValue` so the map read and the in-combat read agree on what a unit
 * is worth.
 */
export function unitSideStrength(unit: ArmyUnitState): number {
  const side = getUnitSide(unit.unitDefId, unit.side);
  if (!side) {
    return 0;
  }
  const stackLayers =
    unit.side === "pack" || unit.side === "neutral" ? Math.max(0, unit.stacks ?? 0) : 0;
  // A Polish Stack does not create another activation/body: it adds one full
  // Pack health bar per layer, and the whole card has one flat +1 Attack while
  // any layer remains. Mirror that real combat durability instead of treating
  // a Stack as either zero value or a duplicate attacking unit.
  // Unit Experience (optional rule): a card only ever carries `experience` while
  // the rule is on, so the veteran-rank bonus can be folded unconditionally (no
  // flag to thread — a rule-off card returns null here and folds nothing).
  const rankBonus = armyUnitRankInfo(unit)?.bonus;
  const attack =
    side.attack + (unit.permanentAttackBonus ?? 0) + (stackLayers > 0 ? 1 : 0) + (rankBonus?.attack ?? 0);
  const health = (side.health + (unit.permanentHealthBonus ?? 0) + (rankBonus?.health ?? 0)) * (1 + stackLayers);
  return attack * 3 + health * 2 + side.defense + (rankBonus?.defense ?? 0) + Math.round(side.initiative / 2) +
    killHealValue(side.abilities);
}

/**
 * Forge Cyberbrutes' "heals 1 per kill": modest sustain — worth about one
 * extra point of Health per combat (kills are not guaranteed), so +2 per
 * healed point in the same health * 2 currency.
 */
function killHealValue(abilityIds: readonly string[]): number {
  return abilityIds.reduce((sum, id) => {
    const ability = unitAbilities[id];
    return ability?.implementationStatus === "implemented" && ability.effect?.type === "HEAL_PER_KILL"
      ? sum + ability.effect.amount * 2
      : sum;
  }, 0);
}

/** Total army strength of a player's unit deck (all sides summed). */
export function playerArmyStrength(
  state: GameState,
  playerId: PlayerId,
): number {
  const army = state.players[playerId]?.army ?? [];
  return army.reduce((total, unit) => total + unitSideStrength(unit), 0);
}

/**
 * How close the attacker's army must be to the defender's before the computer
 * is willing to start the fight. Equal armies can still engage, but a known
 * unit-strength deficit must not itself qualify as a favourable attack.
 * This remains a heuristic: cards, formations and dice can change the outcome.
 */
export const ENEMY_ENGAGE_RATIO = 1;

/** Extra strength margin per additional hostile side still able to punish the
 * winner of a PvP fight, capped by MAX_ENEMY_ENGAGE_RATIO. A duel permits
 * equal armies. Hostile allies count as one side, not several seats. */
export const MULTIPLAYER_ENGAGE_MARGIN = 0.2;
export const MAX_ENEMY_ENGAGE_RATIO = 1.15;

/**
 * Extra strength margin per LEVEL the enemy MAIN hero holds over ours before a
 * PvP battle is opened. Ranked-replay lesson (2026-09-02/03, rooms 06j7su,
 * bi3xov, qzb56c): every PvP battle in the three full-length games was opened
 * by the seat whose main hero was two levels BEHIND (L4 vs L6, L4 vs L6,
 * L5 vs L7) with an army the unit-stat read called comparable — and every
 * attacker lost (damage 39–62, 38–62, 20–25), then gave up. A higher-level hero
 * brings more specialty / expert cards, more crowns and a bigger hand into the
 * fight, none of which the unit stats can see. One level of deficit still
 * demands an army advantage; two demand a larger margin.
 */
export const HERO_LEVEL_ENGAGE_MARGIN = 0.12;
/** Ceiling after the level margin — deliberately above MAX_ENEMY_ENGAGE_RATIO. */
export const MAX_HERO_LEVEL_ENGAGE_RATIO = 1.45;

/** Level of `playerId`'s MAIN hero (public information); 0 when it has none. */
export function mainHeroLevel(state: GameState, playerId: PlayerId): number {
  let level = 0;
  for (const hero of Object.values(state.heroes ?? {})) {
    if (hero.controllerId === playerId && hero.kind === "main") {
      level = Math.max(level, hero.level);
    }
  }
  return level;
}

/** Levels the enemy main hero holds over ours; 0 when equal, ahead or heroless. */
export function enemyMainHeroLevelLead(
  state: GameState,
  playerId: PlayerId,
  enemyPlayerId: PlayerId,
): number {
  const own = mainHeroLevel(state, playerId);
  const enemy = mainHeroLevel(state, enemyPlayerId);
  if (own <= 0 || enemy <= 0) return 0;
  return Math.max(0, enemy - own);
}

/**
 * Largest level lead any LIVE hostile main hero holds over ours. The read the
 * map policy uses to prefer experience-paying guard fields over Creature Banks
 * (which pay no experience) while the seat is being out-levelled.
 */
export function enemyMainHeroLevelDeficit(
  state: GameState,
  playerId: PlayerId,
): number {
  let deficit = 0;
  for (const [otherId, player] of Object.entries(state.players)) {
    if (
      otherId === playerId ||
      otherId === NEUTRAL_PLAYER_ID ||
      player?.eliminated ||
      playersAreAllied(state, playerId, otherId)
    ) {
      continue;
    }
    deficit = Math.max(deficit, enemyMainHeroLevelLead(state, playerId, otherId));
  }
  return deficit;
}

/** Number of distinct, living hostile sides facing `playerId`. */
export function activeEnemySideCount(
  state: GameState,
  playerId: PlayerId,
): number {
  const sides = new Set<string>();
  for (const [otherId, player] of Object.entries(state.players)) {
    if (
      otherId === playerId ||
      otherId === NEUTRAL_PLAYER_ID ||
      player?.eliminated ||
      playersAreAllied(state, playerId, otherId)
    ) {
      continue;
    }
    // Team ids collapse a coordinated alliance into one third-party threat.
    sides.add(state.playerTeams?.[otherId] ?? `seat:${otherId}`);
  }
  return sides.size;
}

/**
 * The living commander is the army's extra body when the WOG commanders module
 * is on (combatUnitLimit already drops a card slot for it): price it with the
 * same stat formula as a deployed card, off the BUILT unit so grades and
 * commander artifacts count. 0 with the module off or the commander dead, so
 * every other game reads exactly as before. Ranked-replay evidence (4 of 11
 * rooms with commanders): the commander fought in all 5 commander sides and
 * was the last body standing in two fights — leaving it out made the PvP gate
 * read both armies short by one gold-grade unit.
 */
export function commanderStrength(state: GameState, playerId: PlayerId): number {
  if (!commandersModuleEnabled(state)) return 0;
  const player = state.players[playerId];
  if (!player) return 0;
  const built = makeCommanderCombatUnit(player, 0);
  if (!built) return 0;
  return (
    built.attack * 3 +
    built.maxHealth * 2 +
    built.defense +
    Math.round(built.initiative / 2)
  );
}

/** Only units that can actually deploy may justify an engagement. Reserve
 * cards still have economic value, but cannot all attack in the same battle. */
export function deployedArmyStrength(state: GameState, playerId: PlayerId): number {
  return (state.players[playerId]?.army ?? []).map(unitSideStrength)
    .sort((a, b) => b - a).slice(0, plannedUnitLimit(state, playerId))
    .reduce((sum, strength) => sum + strength, commanderStrength(state, playerId));
}

/** Deploy cap for PLANNING a future fight: the module default, plus the
 * Hellstorm round bonus. Passing the player id into `combatUnitLimit`
 * unconditionally would make map-time strength depend on whether some OTHER
 * combat happens to be open (the not-in-this-combat commander branch), letting
 * the same engage decision flip between ticks. */
function plannedUnitLimit(state: GameState, playerId: PlayerId): number {
  return combatUnitLimit(
    state,
    state.players[playerId]?.hellstormSixUnitRound === state.round ? playerId : undefined,
  );
}

/** Matchup adjustment isolated to PvP. Average the printed die faces instead
 * of assuming every hit rolls zero, and price actual defense-ignoring riders.
 * The correction is capped: formations, cards and conditional attacks remain
 * uncertain, so this cannot replace the army/level/fortification safeguards. */
export function pvpArmyStrength(state: GameState, playerId: PlayerId, enemyId: PlayerId): number {
  const deployed = (id: PlayerId) => [...(state.players[id]?.army ?? [])]
    .sort((a, b) => unitSideStrength(b) - unitSideStrength(a)).slice(0, plannedUnitLimit(state, id));
  const enemies = deployed(enemyId).map(unit => ({ unit, side: getUnitSide(unit.unitDefId, unit.side) }))
    .filter(entry => entry.side);
  const base = deployedArmyStrength(state, playerId);
  if (!enemies.length) return base;
  let adjustment = 0;
  for (const unit of deployed(playerId)) {
    const side = getUnitSide(unit.unitDefId, unit.side);
    if (!side) continue;
    const rank = armyUnitRankInfo(unit)?.bonus;
    const attack = side.attack + (unit.permanentAttackBonus ?? 0) + (rank?.attack ?? 0) +
      ((unit.side === "pack" || unit.side === "neutral") && (unit.stacks ?? 0) > 0 ? 1 : 0);
    const type = side.type ?? coreUnitDefinitions[unit.unitDefId]?.type;
    const effects = side.abilities.map(id => unitAbilities[id]).filter(ability => ability?.implementationStatus === "implemented")
      .map(ability => ability.effect);
    const ignores = effects.some(effect => effect?.type === "IGNORE_TARGET_CARD_DEFENSE" ||
      (effect?.type === "DEALS_ELEMENTAL_DAMAGE" && (!effect.rangedOnly || type === "ranged")));
    const pierce = Math.max(0, ...effects.map(effect => effect?.type === "DEFENSE_REDUCTION_ON_ATTACK" && !effect.fraction ? effect.amount : 0));
    // Forge Cyberbrutes halve (round up) whatever Defense the target has.
    const halves = effects.some(effect => effect?.type === "DEFENSE_REDUCTION_ON_ATTACK" && effect.fraction === "half-round-up");
    const damage = enemies.reduce((sum, enemy) => {
      const enemyDefense = Math.max(0, enemy.side!.defense + (armyUnitRankInfo(enemy.unit)?.bonus.defense ?? 0) - pierce);
      const defense = ignores ? 0 : halves ? enemyDefense - Math.ceil(enemyDefense / 2) : enemyDefense;
      const cap = Math.min(Infinity, ...enemy.side!.abilities.map(id => {
        const ability = unitAbilities[id];
        return ability?.implementationStatus === "implemented" && ability.effect?.type === "CAP_DAMAGE_PER_ATTACK"
          ? ability.effect.amount : Infinity;
      }));
      return sum + ATTACK_DIE_FACES.reduce((total, die) => total + Math.min(cap, Math.max(0, attack + die - defense)), 0) / ATTACK_DIE_FACES.length;
    }, 0) / enemies.length;
    adjustment += (damage - attack) * 3 + (type === "ranged" ? 3 : type === "flying" ? 1 : 0);
  }
  return base + Math.max(-base * 0.2, Math.min(base * 0.2, adjustment));
}

/** PvP risk is contextual: accept parity in a duel, demand a survivor's
 * cushion when one or more third parties remain. */
export function enemyEngagementRatio(
  state: GameState,
  playerId: PlayerId,
): number {
  const extraHostileSides = Math.max(0, activeEnemySideCount(state, playerId) - 1);
  return Math.min(
    MAX_ENEMY_ENGAGE_RATIO,
    ENEMY_ENGAGE_RATIO + extraHostileSides * MULTIPLAYER_ENGAGE_MARGIN,
  );
}

/**
 * Banks are always a full fight (no Quick Combat). Slightly pickier than hero
 * fights so the AI does not throw weak armies into stacked near-tier dragons.
 */
export const BANK_ENGAGE_RATIO = 0.9;

/**
 * Whether the computer player `playerId` should be willing to walk its main army
 * into a battle with `enemyPlayerId`. A larger or comparable army engages; a
 * clearly outmatched one holds off. An enemy with no valued army (nothing to
 * fear) is always engaged.
 */
export function shouldEngageEnemy(
  state: GameState,
  playerId: PlayerId,
  enemyPlayerId: PlayerId,
  /** `ignoreHeroLevel`: the fight has no enemy hero in it (heroless garrison). */
  options: { ignoreHeroLevel?: boolean; field?: MapFieldState } = {},
): boolean {
  const enemyStrength = pvpArmyStrength(state, enemyPlayerId, playerId);
  if (enemyStrength <= 0) {
    return true;
  }
  const levelMargin = options.ignoreHeroLevel
    ? 0
    : enemyMainHeroLevelLead(state, playerId, enemyPlayerId) * HERO_LEVEL_ENGAGE_MARGIN;
  const field = options.field;
  // Walls consume attacker actions while the tower and defending shooters
  // keep firing. Only public, actually fortified holdings earn this margin.
  const fortified = field && Object.values(state.towns ?? {}).some(town =>
    town.controllerId === enemyPlayerId &&
    town.buildings.some(id => coreBuildingDefinitions[id]?.effect?.type === "UNLOCK_REINFORCE") &&
    ((field.location === "town" && town.fieldId === field.spaceId) ||
      ((field.location === "settlement" || field.location === "random_town") &&
        field.flagOwnerId === enemyPlayerId)));
  // Forecast first: the two public armies fought forward over
  // sampled dice against a thinking opponent, instead of a stat-sum ratio that
  // cannot see matchups (Defense vs Attack, elemental strikes, shooters,
  // paralysis). The ranked-replay lesson stays: every level the enemy main hero
  // leads by demands a safer win chance (more specialty / expert cards, crowns).
  // Walls and the town tower are not simulated: a fortified holding demands a
  // wider margin instead (the stat-sum ratio waved a Conflux army into a
  // Citadel-backed Settlement the forecast gave 0%, lab seed lab-4 R8).
  {
    const forecast = pvpEngagementForecast(state, playerId, enemyPlayerId,
      Boolean(options.ignoreHeroLevel) && options.field?.location !== "mine");
    if (forecast) {
      const extraSides = Math.max(0, activeEnemySideCount(state, playerId) - 1);
      const levelLead = options.ignoreHeroLevel ? 0 : enemyMainHeroLevelLead(state, playerId, enemyPlayerId);
      // Victory Points endgame: the 3-VP Main Hero defeat can decide the
      // score — guard a lead a loss would hand over, chase one a win takes.
      const vpShift = options.ignoreHeroLevel ? 0 : vpEngageBarShift(state, playerId, enemyPlayerId);
      // USER RULING (2026-09-28): two equal armies FIGHT ("for fun for
      // players") — an even hero duel opens from the coin-flip bar. A heroless
      // garrison assault, a walled holding and a duel against a main hero that
      // leads in level (the ranked-replay lesson) keep the older edge bar.
      const base = options.ignoreHeroLevel || fortified || levelLead > 0
        ? PVP_FORECAST_EDGE_WIN : PVP_FORECAST_ENGAGE_WIN;
      const bar = Math.min(PVP_FORECAST_MAX_WIN,
        base + extraSides * PVP_FORECAST_SIDE_MARGIN + levelLead * PVP_FORECAST_LEVEL_MARGIN +
        (fortified ? PVP_FORECAST_FORTIFIED_MARGIN : 0) + vpShift);
      return forecast.winChance >= bar;
    }
  }
  const ratio = Math.min(
    MAX_HERO_LEVEL_ENGAGE_RATIO + (fortified ? 0.2 : 0),
    enemyEngagementRatio(state, playerId) + levelMargin + (fortified ? 0.2 : 0),
  );
  return pvpArmyStrength(state, playerId, enemyPlayerId) >= enemyStrength * ratio;
}

/**
 * Whether a hostile player is a real THREAT if it attacks us: our forecast of
 * that fight (their public army and estimated cards vs ours) stays under the
 * defender bar. Separate from shouldEngageEnemy on purpose — declining to OPEN a
 * fight the side / level / VP margins make risky is prudence, but running from
 * one hands the attacker a free turn (and a reckless attacker a free defeat).
 * The plain duel engage bar equals this bar (2026-09-28), so an even duel is
 * opened, not fled. Falls back to the engage gate.
 */
export const PVP_THREAT_MAX_WIN = 0.45;

/**
 * The garrison fee our bases need right now: 8 gold (a Town / Settlement) when
 * a hostile hero can reach one of them next turn while no hero of ours stands on
 * it — and either it is our last base (losing it starts the elimination clock)
 * or our units-only garrison would likely hold. 0 when nothing is threatened.
 * A broke owner cannot garrison at all, so the holding simply falls (lab league
 * 2026-09-27: Settlement and Town lost for free, then the game).
 */
export const GARRISON_FEE_GOLD = 8;
export function garrisonFeeReserve(
  state: GameState,
  playerId: PlayerId,
  reach: (hero: HeroState) => ReadonlyMap<string, number>,
): number {
  if (!state.adventure) return 0;
  const bases = Object.values(state.adventure.fields).filter(field => field.flagOwnerId === playerId &&
    (field.location === "settlement" || field.location === "random_town" ||
      Object.values(state.towns ?? {}).some(town => town.fieldId === field.spaceId)));
  if (!bases.length) return 0;
  const guarded = new Set(Object.values(state.heroes).filter(hero => hero.controllerId === playerId && hero.spaceId)
    .map(hero => hero.spaceId!));
  for (const enemy of Object.values(state.heroes)) {
    if (!enemy.spaceId || enemy.controllerId === playerId || enemy.controllerId === NEUTRAL_PLAYER_ID ||
        state.players[enemy.controllerId]?.eliminated || playersAreAllied(state, playerId, enemy.controllerId)) continue;
    const enemyReach = reach(enemy);
    const exposed = bases.filter(base => !guarded.has(base.spaceId) && enemyReach.has(base.spaceId));
    if (!exposed.length) continue;
    if (bases.length === 1) return GARRISON_FEE_GOLD;
    // Our units-only garrison against their public army and estimated cards
    // (never their actual hidden hand).
    const hold = pvpEngagementForecast(state, playerId, enemy.controllerId, false, true);
    if (!hold || hold.winChance >= 0.5) return GARRISON_FEE_GOLD;
  }
  return 0;
}
export function pvpThreatens(state: GameState, playerId: PlayerId, enemyId: PlayerId): boolean {
  const forecast = pvpEngagementForecast(state, playerId, enemyId, false);
  return forecast ? forecast.winChance < PVP_THREAT_MAX_WIN : !shouldEngageEnemy(state, playerId, enemyId);
}

/** Win chance a PvP HERO fight must forecast before the AI opens it. USER
 * RULING (2026-09-28): "two equal armies ... should fight, for fun for
 * players" — a duel opens at the coin-flip bar, which is exactly the threat bar
 * (PVP_THREAT_MAX_WIN), so an even duel is either opened or evaded, never a
 * stand-off where neither side moves. Each further hostile side (who profits
 * from the winner's losses) still demands more; an enemy main hero that leads
 * in level moves the duel onto PVP_FORECAST_EDGE_WIN plus its level margin. */
export const PVP_FORECAST_ENGAGE_WIN = PVP_THREAT_MAX_WIN;
/** The pre-2026-09-28 clear-edge bar, still the base for a heroless garrison
 * assault or a walled holding (walls and the tower are not simulated, and a
 * failed assault strands the army) and for a duel against a main hero that
 * leads in level (its level margin stacks on this, as before). */
export const PVP_FORECAST_EDGE_WIN = 0.55;
export const PVP_FORECAST_SIDE_MARGIN = 0.1;
export const PVP_FORECAST_LEVEL_MARGIN = 0.08;
export const PVP_FORECAST_MAX_WIN = 0.9;
export const PVP_FORECAST_FORTIFIED_MARGIN = 0.15;

/** The bodies a player would actually deploy — its strongest cards up to the
 * deploy cap plus a living commander — as combat units. A heroless GARRISON
 * side has no commander (it stands only beside its main hero —
 * commanderStandsInCurrentCombat) and deploys the full five cards
 * (combatSetupUnitLimit; Hellstorm's sixth still counts). */
function deployableCombatUnits(state: GameState, playerId: PlayerId, garrison = false): CombatUnitState[] {
  const player = state.players[playerId];
  if (!player) return [];
  const ruleset = getRuleset(state);
  const overrides = unitSideRuleOverrides(state);
  const limit = garrison
    ? COMBAT_UNIT_LIMIT + (player.hellstormSixUnitRound === state.round ? 1 : 0)
    : plannedUnitLimit(state, playerId);
  const cards = [...player.army].sort((a, b) => unitSideStrength(b) - unitSideStrength(a))
    .slice(0, limit);
  const units = cards.flatMap((unit, index) => {
    const made = makeCombatUnitFromArmy(unit, playerId, `u-${index}`, index, ruleset, overrides);
    return made ? [made] : [];
  });
  if (!garrison && commandersModuleEnabled(state)) {
    const commander = makeCommanderCombatUnit(player, units.length);
    if (commander) units.push(commander);
  }
  return units;
}

/** Combat cards an opponent's HIDDEN hand is assumed to hold, from its public
 * size alone (roughly one Attack or Defense card per three cards, a damage
 * spell from three, Power from five), plus the phantom Power + Magic Arrow a
 * computer seat fields in every combat. A garrison defends with units only. */
/** An opponent's hand SIZE is public: a seat view empties the cards and keeps
 * `handCount` (player-view.ts); the full state still carries the array. */
function publicHandSize(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId] as (GameState["players"][string] & { handCount?: number }) | undefined;
  return player?.handCount ?? player?.hand?.length ?? 0;
}

function estimatedEnemyCombatHand(state: GameState, enemyId: PlayerId, garrison: boolean): string[] {
  if (garrison) return [];
  const size = publicHandSize(state, enemyId);
  const hand: string[] = [];
  for (let card = 0; card < Math.floor(size / 3); card += 1) hand.push(card % 2 === 0 ? "stat.attack" : "stat.defense");
  if (size >= 3) hand.push("spell.magic_arrow");
  if (size >= 5) hand.push("stat.power");
  if (isComputerPlayer(state, enemyId)) hand.push("stat.power", "spell.magic_arrow");
  return hand;
}

const PVP_ENGAGE_MEMO_LIMIT = 128;
const pvpEngageMemo = new Map<string, { winChance: number; expectedOwnLosses: number } | null>();
function armySignature(state: GameState, playerId: PlayerId): string {
  return (state.players[playerId]?.army ?? []).map(unit => `${unit.unitDefId}:${unit.side}:${unit.stacks ?? 0}:` +
    `${unit.permanentAttackBonus ?? 0}:${unit.permanentHealthBonus ?? 0}:${unit.experience ?? 0}:${unit.transforms?.length ?? 0}`).join(",");
}

/** Memoized on the public armies and hands, so the map scorer can ask per candidate action. */
export function pvpEngagementForecast(
  state: GameState, playerId: PlayerId, enemyId: PlayerId, garrison: boolean,
  /** WE hold a garrison: our units fight without cards. */
  ownUnitsOnly = false,
): { winChance: number; expectedOwnLosses: number } | null {
  const key = `${state.seed}|${forecastContextKey(state, [playerId, enemyId])}|${playerId}|${enemyId}|${garrison}|${ownUnitsOnly}|${armySignature(state, playerId)}|${armySignature(state, enemyId)}|` +
    `${plannedUnitLimit(state, playerId)}/${plannedUnitLimit(state, enemyId)}|` +
    `${[...(state.players[playerId]?.hand ?? [])].sort().join(",")}|${publicHandSize(state, enemyId)}|` +
    `${commandersModuleEnabled(state) ? commanderStrength(state, playerId) + "/" + commanderStrength(state, enemyId) : ""}`;
  if (pvpEngageMemo.has(key)) return pvpEngageMemo.get(key)!;
  const forecast = forecastPlayerFight(state, playerId, enemyId, deployableCombatUnits(state, playerId, ownUnitsOnly),
    deployableCombatUnits(state, enemyId, garrison), estimatedEnemyCombatHand(state, enemyId, garrison), ownUnitsOnly);
  if (pvpEngageMemo.size >= PVP_ENGAGE_MEMO_LIMIT) pvpEngageMemo.delete(pvpEngageMemo.keys().next().value as string);
  pvpEngageMemo.set(key, forecast);
  return forecast;
}

/**
 * Combat value of one Creature Bank unit card (bank column stats, not Few/Pack).
 * Unknown ids score 0 so a missing definition never invents a free fight.
 */
export function bankUnitStrength(unitDefId: string, bankSideKey?: string): number {
  const side = bankSideKey ? getCreatureBankUnitSide(unitDefId, bankSideKey) : CREATURE_BANK_UNIT_SIDES[unitDefId];
  if (!side) return 0;
  return (
    side.attack * 3 +
    side.health * 2 +
    side.defense +
    Math.round(side.initiative / 2)
  );
}

/**
 * Estimated defender strength for a known bank token. Stack Tokens inflate the
 * base conservatively so Easy is easier than Impossible. A numeric Polish size
 * is the GUARANTEED number of Stacked defenders (size N → N tokens); a
 * difficulty is the official guaranteed count. The optional BINH 80% rule is
 * conservatively evaluated at that same maximum. Either way a Stack Token is a
 * mild bulk/soak bonus, not a full extra unit — calibrated so a full starting
 * army (~45) clears Imp Cache on Normal but refuses Dragon Utopia and refuses
 * when gutted to one card.
 */
export function creatureBankStrength(
  bankId: string,
  difficultyOrSize: keyof typeof STACK_TOKENS_BY_DIFFICULTY | BankSize = "normal",
  polishCards = typeof difficultyOrSize === "number",
): number {
  const sized = typeof difficultyOrSize === "number";
  const bank = (polishCards ? POLISH_CREATURE_BANKS : CREATURE_BANKS)[bankId as CreatureBankId];
  if (!bank) return Number.POSITIVE_INFINITY;
  const entries = polishCards && sized && bank.buildUnits
    ? bank.buildUnits(difficultyOrSize as BankSize)
    : bank.units.map((unitDefId, index) => ({ unitDefId, bankSideKey: polishCards ? bank.unitSideKeys?.[index] : undefined }));
  const base = entries.reduce(
    (sum, entry) => sum + bankUnitStrength(entry.unitDefId, entry.bankSideKey),
    0,
  );
  const expectedStacks =
    typeof difficultyOrSize === "number"
      ? difficultyOrSize
      : (STACK_TOKENS_BY_DIFFICULTY[difficultyOrSize] ?? 2);
  return Math.round(base * (1 + expectedStacks * 0.1));
}

/**
 * Whether the computer should walk into this Creature Bank. Requires a known
 * `field.bankId` (face-up token). Unknown banks are refused (no blind gamble).
 */
export function canBeatCreatureBank(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
): boolean {
  return creatureBankMatchupRatio(state, playerId, field) >= BANK_ENGAGE_RATIO;
}

/** Public army-to-bank strength ratio. A favorable margin can justify taking
 * a bank before the ordinary side-fight preparation gates would allow it. */
export function creatureBankMatchupRatio(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
): number {
  if (field.location !== "creature_bank") return 0;
  const bankId = field.bankId;
  if (!bankId) return 0;
  const difficultyOrSize =
    field.bankSize ??
    ((state.adventure?.difficulty as keyof typeof STACK_TOKENS_BY_DIFFICULTY) ??
      "normal");
  const bankStr = creatureBankStrength(
    bankId,
    difficultyOrSize,
    Boolean(state.adventure?.houseRules?.["polish-creature-banks"]),
  );
  if (!Number.isFinite(bankStr) || bankStr <= 0) return 0;
  const ratio = deployedArmyStrength(state, playerId) / bankStr;
  const polish = Boolean(state.adventure?.houseRules?.["polish-creature-banks"]);
  const bank = (polish ? POLISH_CREATURE_BANKS : CREATURE_BANKS)[bankId as CreatureBankId];
  const paysResources = bankRewardPaysResources(bank);
  // A resource-paying bank is judged by the simulated fight whatever the stat
  // sum says (lab 2026-09-27: 30 in-reach banks forecast >= 90% were never
  // fought because their stat ratio sat under 0.85 — ranked humans take 2.25
  // banks by R7, this AI took 0.61). A unit-reward bank keeps the stat-sum
  // pre-gate: opened to the forecast, armies went into 32 Dragon Fly Hive fights
  // by R7 and the level-7 slipped (89 -> 83 of 156 by R8).
  if (!paysResources && ratio <= BANK_ENGAGE_RATIO - 0.05) return ratio;
  // Judged on the longest fight the seat can buy: a fresh turn's entry keeps
  // every other movement point for paid continuations (see bankFightRounds).
  const forecast = forecastCreatureBankField(state, playerId, field, bankFightRounds(state, playerId));
  return forecast ? bankRatioFromForecast(ratio, forecast, paysResources) : ratio;
}

/**
 * The simulated bank fight (public defender cards, sampled Stack Tokens, our
 * army and fight cards) decides the bank: under this win chance it VETOES a bank
 * the stat-sum ratio would enter (Dwarven Treasury and Medusa Stores entered on
 * the ratio alone retreated 33 of 75 times in the 2026-09-27 lab); at or above
 * it the bank is beatable whatever the ratio says. Only resource-paying banks
 * earn the clear-margin promotion below (a promoting variant sent armies into
 * 52 Dragon Fly Hive fights).
 */
export const BANK_FORECAST_ENGAGE_WIN = 0.75;

/**
 * Rounds a bank fight can last when entered on a fresh turn. Under
 * `bank-move-points` each round after the first costs one movement point, so it
 * is the main hero's movement (1 to enter, the rest to continue); otherwise the
 * bank rolls on for free. Lab 2026-09-27: Treasury fights forecast at 95% were
 * FORCED to retreat after round 2 (0 MP left) in 35% of entries.
 */
export function bankFightRounds(state: GameState, playerId: PlayerId, keptMovement?: number): number {
  if (!houseRuleEnabled(state, "bank-move-points") || houseRuleEnabled(state, "free-neutral-combat-extend")) return 4;
  if (keptMovement !== undefined) return 1 + Math.max(0, keptMovement);
  const hero = Object.values(state.heroes ?? {}).find(candidate => candidate.controllerId === playerId && candidate.kind === "main");
  return hero ? Math.max(1, heroMovementMax(state, hero)) : 3;
}
function bankRatioFromForecast(
  ratio: number,
  forecast: { winChance: number; expectedOwnLosses: number },
  paysResources: boolean,
): number {
  if (forecast.winChance < BANK_FORECAST_ENGAGE_WIN) return Math.min(ratio, BANK_ENGAGE_RATIO - 0.05);
  // A likely win of a paying bank the stat sum undervalues is still a fight the army can take.
  if (paysResources) ratio = Math.max(ratio, BANK_ENGAGE_RATIO);
  // A near-certain, cheap win of a bank that PAYS resources earns the clear-
  // margin promotion (>= 1.2): on-time level-7 seats won 0.85 banks by R7 vs
  // 0.36 for late ones (lab 2026-09-27). Unit-reward banks never get it — a
  // promoting variant sent armies into 52 Dragon Fly Hive fights.
  if (paysResources && forecast.winChance >= BANK_FORECAST_CLEAR_WIN && forecast.expectedOwnLosses <= BANK_FORECAST_CLEAR_LOSSES) {
    return Math.max(ratio, 1.2);
  }
  return ratio;
}
export const BANK_FORECAST_CLEAR_WIN = 0.9;
export const BANK_FORECAST_CLEAR_LOSSES = 0.5;

/** Whether a bank's printed win reward pays gold, materials or valuables. */
function bankRewardPaysResources(bank: { buildReward?: (x: number) => unknown } | undefined): boolean {
  const yields = (interaction: unknown, depth = 0): boolean => {
    if (!interaction || typeof interaction !== "object" || depth > 6) return false;
    const it = interaction as { type?: string; interactions?: unknown[]; options?: { interaction?: unknown }[] } & Record<string, unknown>;
    if (it.type === "GAIN_RESOURCES") return ["gold", "buildingMaterials", "valuables"].some(key => Number(it[key] ?? 0) > 0);
    if (it.type === "SEQUENCE") return (it.interactions ?? []).some(step => yields(step, depth + 1));
    if (it.type === "CHOOSE_ONE") return (it.options ?? []).some(option => yields(option?.interaction, depth + 1));
    return false;
  };
  try {
    return yields(bank?.buildReward?.(0));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// ARMY-TIER GUARD ENGAGEMENT REFERENCE (Step 5)
// ---------------------------------------------------------------------------
//
// The user's reference: "silver unit can take lv3 neutral at impossible, gold
// can take lv5" — army COMPOSITION, not just hero level, should decide which
// guard FIELDS the AI is willing to fight.
//
// GROUNDING — how the scenario difficulty scales a guard-field battle: a plain
// guard field IS scaled by scenario difficulty. `drawGuardArmy` in adventure.ts
// draws the guard party from `NEUTRAL_ARMY_TABLE[scenarioDifficulty][fieldDifficulty]`
// (STACK_TOKENS_BY_DIFFICULTY is the SEPARATE Creature-Bank knob). For a fixed
// field difficulty the party gets strictly HARDER (higher tiers) as the scenario
// difficulty rises — e.g. field difficulty 3 is {bronze 1, silver 1} on Easy but
// {silver 3} on Impossible. So Impossible is the WORST case, which is exactly
// where the user pinned the anchors; at any easier scenario difficulty the same
// army tier safely takes an EQUAL-or-HIGHER field difficulty.
//
// DERIVATION — `armyTierGuardCap` reads the real table: an army whose top tier is
// T can take a field whose guard party (a) contains NO tier strictly above T, and
// (b) has at most MAX_TOP_TIER_GUARDS units of T. MAX_TOP_TIER_GUARDS = 3 falls
// straight out of BOTH anchors (field 3 @ Impossible = {silver 3}; field 5 @
// Impossible = {silver 1, gold 3} — each is exactly 3 of the army's own top tier).
// This reproduces the anchors (silver→3, gold→5 at Impossible) and derives the
// rest: silver caps 4/4/4/3 (easy/normal/hard/impossible), gold caps 6/6/6/5,
// bronze caps 2/2/2/1, azure 7 everywhere (nothing outranks an azure dragon).
const TIER_RANK: Record<UnitTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  azure: 3,
};
const ALL_TIERS: readonly UnitTier[] = ["bronze", "silver", "gold", "azure"];

/**
 * Both anchors have exactly three of the army's own top tier (field 3 @
 * Impossible = 3 silver; field 5 @ Impossible = 3 gold), so three top-tier
 * guards is the reference an army of that tier is expected to clear.
 */
export const MAX_TOP_TIER_GUARDS = 3;

/**
 * Guard rail so a single premium body does not charge a camp: the army must hold
 * at least this many ALIVE units of the qualifying tier for that tier to unlock
 * its guard cap. Map army cards carry no fractional health (a unit is alive iff
 * it is still in the deck), so a COUNT is the honest floor — one lone silver Few
 * alone never justifies a level-3 fight; two do.
 *
 * Exception: a composition-ready bronze core PLUS even a single silver body is
 * enough for the silver cap. The target is one for exceptional tempo units such
 * as Elves, two for ordinary strong openings, and three for weak compositions.
 */
export const MIN_TIER_UNITS_FOR_ENGAGE = 2;

/** One silver body is enough once the composition-aware bronze core is fielded. */
export const MIN_SILVER_WITH_BRONZE_CORE = 1;

/** Pack-side bronze count that unlocks the single-silver soft engagement. */
export const BRONZE_PACK_CORE_FOR_SILVER = 3;

/** How many army cards of each tier the player currently fields (alive = in deck). */
function armyTierCounts(
  state: GameState,
  playerId: PlayerId,
): Record<UnitTier, number> {
  const counts: Record<UnitTier, number> = {
    bronze: 0,
    silver: 0,
    gold: 0,
    azure: 0,
  };
  for (const unit of state.players[playerId]?.army ?? []) {
    const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
    if (tier) {
      counts[tier] += 1;
    }
  }
  return counts;
}

/** Pack-side bronze bodies — the reliable early core the soft silver unlock needs. */
function armyBronzePackCount(state: GameState, playerId: PlayerId): number {
  let packs = 0;
  for (const unit of state.players[playerId]?.army ?? []) {
    if (
      unit.side === "pack" &&
      coreUnitDefinitions[unit.unitDefId]?.tier === "bronze"
    ) {
      packs += 1;
    }
  }
  return packs;
}

/**
 * The highest unit tier the army fields in real numbers — the top tier for which
 * it holds at least MIN_TIER_UNITS_FOR_ENGAGE alive cards. Soft unlock: three
 * bronze Packs + a single silver body still unlocks the silver guard cap (user:
 * "3 pack bronze + even just 1 silver → MUST HIT lv3") — checked BEFORE the
 * bronze-only floor so a pack core does not mask the silver reach. Null when
 * no tier clears either rail.
 */
export function armyEngagementTier(
  state: GameState,
  playerId: PlayerId,
): UnitTier | null {
  const counts = armyTierCounts(state, playerId);
  // Premium tiers first (azure → gold → silver) with the hard MIN_TIER floor.
  for (let rank = ALL_TIERS.length - 1; rank >= 1; rank -= 1) {
    const tier = ALL_TIERS[rank];
    if (counts[tier] >= MIN_TIER_UNITS_FOR_ENGAGE) {
      return tier;
    }
  }
  // Soft silver unlock — gold/azure still need two bodies (MIN_TIER). A lone
  // silver Few with no Pack core stays on the level gate (CONTROL). Must beat
  // the bronze floor below or three Packs would always report "bronze".
  if (
    counts.silver >= MIN_SILVER_WITH_BRONZE_CORE &&
    armyBronzePackCount(state, playerId) >= openingCorePackTarget(state, playerId)
  ) {
    return "silver";
  }
  if (counts.bronze >= MIN_TIER_UNITS_FOR_ENGAGE) {
    return "bronze";
  }
  return null;
}

/**
 * Settlement or gold/valuables mine — the premium Far economy the AI must hit
 * aggressively (lv3 ASAP once the force is ready for the scenario difficulty).
 * Not afraid of unit losses on these targets.
 */
export function isPremiumEconomyField(field: MapFieldState): boolean {
  if (field.location === "settlement") return true;
  return (
    field.location === "mine" &&
    (field.resource === "gold" || field.resource === "valuables")
  );
}

/**
 * The highest guard-FIELD difficulty an army whose top tier is `armyTier` should
 * fight at scenario `difficulty`, read from the real guard-draw table. Fields are
 * walked from 1 up; the walk stops at the first field whose party introduces a
 * tier above the army's own (a fight it cannot answer) or more than
 * MAX_TOP_TIER_GUARDS of its own top tier — both are monotonic in field
 * difficulty, so the last field before the stop is the cap. 0 = never extends.
 */
export function armyTierGuardCap(
  difficulty: GameDifficulty,
  armyTier: UnitTier,
): number {
  const table = NEUTRAL_ARMY_TABLE[difficulty];
  const armyRank = TIER_RANK[armyTier];
  let cap = 0;
  for (let field = 1; field <= 7; field += 1) {
    const party = table[field];
    if (!party) {
      break;
    }
    const hasHigherTier = ALL_TIERS.some(
      (tier) => TIER_RANK[tier] > armyRank && (party[tier] ?? 0) > 0,
    );
    if (hasHigherTier) {
      break;
    }
    if ((party[armyTier] ?? 0) > MAX_TOP_TIER_GUARDS) {
      break;
    }
    cap = field;
  }
  return cap;
}

/**
 * PREMIUM-ECONOMY rush cap (settlement / gold / valuables only).
 *
 * The strict `armyTierGuardCap` stops bronze armies at the first field that
 * introduces a silver guard — so hard/normal/easy field-3 parties (which all
 * mix in silver) would wait for a silver recruit. Premium economy is worth
 * unit losses, so three bronze Packs alone unlock difficulty 3 on easy /
 * normal / hard the moment the Pack core is ready. Strong easy/normal openings
 * may use their smaller composition-ready core. Impossible FAR economy allows
 * field 3 with three Packs and a full attack-turn movement budget. Tier extensions
 * still raise the cap above 3 when the army qualifies.
 *
 * Grounded in NEUTRAL_ARMY_TABLE field-3 parties:
 *   easy    {bronze 1, silver 1}  — 3 Packs overpower
 *   normal  {bronze 2, silver 1}  — 3 Packs overpower with losses
 *   hard    {bronze 1, silver 2}  — user: 3 Packs can tackle
 *   impossible {silver 3}         — 3 Packs attempt with two continuations
 */
export function premiumEconomyEngageCap(
  state: GameState,
  playerId: PlayerId,
  field?: MapFieldState,
): number {
  const scenario = field
    ? neutralArmyDifficultyForField(state, field)
    : neutralArmyDifficulty(state);
  const bronzePacks = armyBronzePackCount(state, playerId);
  const counts = armyTierCounts(state, playerId);
  let cap = 0;

  // The paid faction core (two or three Packs) opens Far III on every
  // difficulty. Restrict this to the income route, never generic side guards.
  const openingFar = field && field.tileInstanceId &&
    state.adventure?.tiles[field.tileInstanceId]?.group === "far" &&
    (isPremiumEconomyField(field) || isOpeningFarMaterialMine(state, playerId, field));
  if (state.players[playerId]?.factionId !== "necropolis" && openingFar &&
      openingBronzeCoreReady(state, playerId)) cap = 3;

  // Full silver/gold/azure tier extension still applies on premium targets.
  const tier = armyEngagementTier(state, playerId);
  if (tier && TIER_RANK[tier] >= TIER_RANK.silver) {
    cap = Math.max(cap, armyTierGuardCap(scenario, tier));
  }

  // Easier guards can be attempted with the actual composition-ready core;
  // do not force a strong faction to buy a redundant third Pack first.
  if ((scenario === "easy" || scenario === "normal") && counts.bronze >= 3 &&
      bronzePacks >= openingCorePackTarget(state, playerId)) {
    cap = Math.max(cap, 3);
  }

  // Three bronze Packs can attempt FAR income without waiting for Silver.
  // Impossible's stronger party is paired with a three-MP entry budget in
  // combat-movement; this exception never opens unrelated silver guards.
  if (bronzePacks >= BRONZE_PACK_CORE_FOR_SILVER) {
    if (scenario === "impossible") {
      // Impossible field 2 draws two bronzes and one silver, not field 3's
      // three silvers. A full Pack core can open II economy before Silver.
      cap = Math.max(cap, 2);
      const farEconomy = field && (isPremiumEconomyField(field) || isOpeningFarMaterialMine(state, playerId, field)) && field.tileInstanceId &&
        state.adventure?.tiles[field.tileInstanceId]?.group === "far";
      if (farEconomy || counts.silver + counts.gold + counts.azure >= 1) {
        cap = Math.max(cap, 3);
      }
    } else {
      // easy / normal / hard — Pack core alone is enough for lv3 premium.
      cap = Math.max(cap, 3);
    }
  }

  // Keep staging and entry aligned: a second Far III needs a purchased
  // premium body even when the intact Bronze core could attempt the first.
  if (field && state.players[playerId]?.factionId !== "necropolis" &&
      secondFarFightNeedsSilver(state, playerId, field) &&
      counts.silver + counts.gold + counts.azure === 0) return Math.min(cap, 2);
  return cap;
}

/**
 * Whether the army is ready to walk into this premium-economy guard (losses OK).
 * Used only for settlement / gold / valuables — never for junk neutrals.
 */
export function armyCoversPremiumEconomyGuard(
  state: GameState,
  playerId: PlayerId,
  fieldDifficulty: number,
  field?: MapFieldState,
): boolean {
  if (fieldDifficulty <= 0) return false;
  return fieldDifficulty <= premiumEconomyEngageCap(state, playerId, field);
}

/**
 * STAGING: a known premium field (settlement / gold / valuables, difficulty
 * 1-3) the Pack core cannot cover YET — on Impossible the cap needs the first
 * silver body, which is one Population purchase away once the Silver dwelling
 * stands. Marching there NOW and waiting adjacent converts "silver arrives →
 * fight next round" instead of "silver arrives → 3-round march → fight R8+"
 * (measured: the hero drifted from dist 2 to dist 5 exactly while the silver
 * chain completed). The march planner must never ENTER the field until
 * `canBeatGuardedField` flips — staging is positioning only.
 */
export function premiumEconomyWorthStaging(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
): boolean {
  if (!isPremiumEconomyField(field)) return false;
  const difficulty = field.difficulty ?? 0;
  if (difficulty <= 0 || difficulty > 3) return false;
  if (field.flagOwnerId) return false;
  if (armyCoversPremiumEconomyGuard(state, playerId, difficulty, field)) return false;
  // The Pack core must already stand — staging with a half-built army would
  // pull the hero off the home-tile drain and the opening development.
  const counts = armyTierCounts(state, playerId);
  if (
    armyBronzePackCount(state, playerId) < openingCorePackTarget(state, playerId) ||
    counts.silver + counts.gold + counts.azure > 0
  ) {
    return false;
  }
  // The whole remaining silver chain (dwelling gold+materials, then the body)
  // is position-independent — builds and Population purchases fire from
  // anywhere — with ONE exception: a feasible dwelling-rush TRADE needs the
  // hero standing at a market. Staging while that trade is pending deadlocks
  // (measured: the parked hero never walked back, silver slid to R10/never);
  // staging in every other case is pure tempo (measured: capture R9 → R6 when
  // the hero waits adjacent instead of collecting westward and marching back).
  const dwelling = coreFactionDefinitions[
    state.players[playerId]?.factionId ?? ""
  ]?.buildings.find((buildingId) => {
    const effect = coreBuildingDefinitions[buildingId]?.effect;
    return effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver";
  });
  if (!dwelling) return false;
  const silverUnlocked = Object.values(state.towns ?? {}).some(
    (town) =>
      town.controllerId === playerId && town.buildings.includes(dwelling),
  );
  if (silverUnlocked) return true;
  return !assessDwellingRush(state, playerId)?.feasible;
}

/**
 * Whether the player's ARMY composition (not just hero level) justifies fighting
 * a guard field of `fieldDifficulty`. Deliberately EXTENDS engagement and never
 * refuses one: it is OR-ed with the level-based Quick-Combat gate in
 * `canBeatGuardedField`, so a fight the level already covers is untouched.
 *
 * Only a SILVER-or-higher engagement tier extends the reach: a bronze-only army
 * is exactly the baseline the level gate already models, so its behaviour is left
 * unchanged (the reference's job is to let a silver/gold-bearing army punch above
 * its hero level, not to re-tune the opening bronze play). Three bronze Packs +
 * one silver soft-unlocks the silver cap (lv3). The full derived table —
 * including the bronze caps — is still pinned in the tests.
 *
 * Premium economy uses `armyCoversPremiumEconomyGuard` instead (difficulty-
 * aware Pack-core rush).
 */
export function armyTierCoversGuardField(
  state: GameState,
  playerId: PlayerId,
  fieldDifficulty: number,
  field?: MapFieldState,
): boolean {
  if (fieldDifficulty <= 0) {
    return false;
  }
  const tier = armyEngagementTier(state, playerId);
  if (!tier || TIER_RANK[tier] < TIER_RANK.silver) {
    return false;
  }
  // The engine's own effective-difficulty read: folds in an active Astrologers
  // "Rulebook" proclamation (guards drawn one level easier), so the AI seizes
  // that window exactly like the guard draw itself does.
  const scenario = field
    ? neutralArmyDifficultyForField(state, field)
    : neutralArmyDifficulty(state);
  return fieldDifficulty <= armyTierGuardCap(scenario, tier);
}

/**
 * Whether the army that is alive right now can sustain a real guard fight.
 * Unlike `armyTierCoversGuardField`, this includes bronze: it is a safety floor,
 * not an extension above the hero-level gate. A wiped high-level hero therefore
 * cannot keep entering high-level fights on level alone, while a strict
 * hero-level advantage still Quick-Combat wins before this check is needed.
 */
export function currentArmyCoversGuardField(
  state: GameState,
  playerId: PlayerId,
  fieldDifficulty: number,
  field?: MapFieldState,
): boolean {
  if (fieldDifficulty <= 0) return false;
  const tier = armyEngagementTier(state, playerId);
  if (!tier) return false;
  const scenario = field
    ? neutralArmyDifficultyForField(state, field)
    : neutralArmyDifficulty(state);
  return fieldDifficulty <= armyTierGuardCap(scenario, tier);
}

/**
 * Assault an enemy-flagged Town/Settlement (garrison prompt may open). Uses the
 * same army-strength gate as hero fights — the owner may pay 8 gold and defend
 * with their unit deck, so their army is the right proxy.
 */
export function shouldAssaultEnemyHolding(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
): boolean {
  const ownerId = field.flagOwnerId;
  if (!ownerId || ownerId === playerId) return false;
  // An ALLY's holding is never assaulted (defense in depth — callers filter
  // allies too, but this read must be safe to reuse on its own).
  if (playersAreAllied(state, ownerId, playerId)) return false;
  // The owner must PAY to garrison (3 gold for a Mine / Garrison object, 8 for
  // a Town / Settlement) and needs an army to do it: a broke or empty owner
  // loses the holding without a fight — take it while that window is open.
  const owner = state.players[ownerId];
  const fee = field.location === "garrison" || field.location === "mine" ? 3 : 8;
  if (!owner || owner.army.length === 0 || owner.resources.gold < fee) return true;
  // A garrison is defended by the owner's unit deck alone — no hero, so the
  // owner's hero level (cards, crowns) never enters this fight.
  return shouldEngageEnemy(state, playerId, ownerId, { ignoreHeroLevel: true, field });
}
