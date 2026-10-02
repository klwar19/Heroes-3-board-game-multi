import { cardLibrary } from "@/data/cards/library";
import { STACK_TOKENS_BY_DIFFICULTY, type CreatureBankId, type StackTokenStat } from "@/data/map/creature-banks";
import { ATTACK_DIE_FACES } from "../battlefield";
import {
  buildCreatureBankDrawsForState, getUnitSide, makeCombatUnitFromArmy, makeCombatUnitFromNeutral, NEUTRAL_ARMY_TABLE,
  neutralArmyDifficultyForField, PLAYABLE_FACTIONS,
} from "../adventure";
import { applyUnitCurrentSide } from "../unit-transforms";
import { isPlayableFaction, neutralUnitIdsByTier } from "@/data/factions/core";
import { resolveCustomGuardDraws } from "../map-design-features";
import { getRuleset, unitSideRuleOverrides } from "../ruleset";
import { isComputerPlayer, sessionModeOf } from "./control";
import { baseCardId } from "../phantom-cards";
import { houseRuleEnabled } from "../house-rules";
import { HEX_DEFAULT_FREE_COMBAT_ROUNDS } from "../hex-battlefield";
import { unitsAdjacentAt } from "../hex-footprint";
import { getLegalMoveDestinations, resolvedSpellPowerForStackItem } from "../legal-actions";
import { getDeathStareFollowUps, getEnemyRetaliationAuraPenalty, getUnitAbilityDefinitions, unitImmuneToSpellSchools, type DeathStareFollowUp } from "../unit-abilities";
import type { CombatState, CombatUnitState, GameState, HeroState, MapFieldState, PlayerId } from "../state";
import { plannedAttackFaces } from "./battlefield-conditions";
import { isParalyzed, unitRemainingHealth, unitThreatValue } from "./score";
import { dealsElementalStrike, estimatedStrikeDamage } from "./strike-value";
import { heroEquipmentOf } from "../anime-equipment";

/**
 * Bounded pre-fight forecast of a NEUTRAL guard fight from the revealed board
 * (public information only: both armies' printed cards and our own hand).
 *
 * Plays the remaining affordable combat rounds forward many times with sampled
 * attack dice: initiative order, round-1 melee reach from the real board, focus
 * fire, one retaliation per unit per round, a Pack flipping to its Few side
 * before removal, our damage spells (Magic Arrow scaled by held Power, one cast
 * per round, aimed at the armored guards our bodies cannot dent) and our held
 * Attack / Defense statistic cards. Guards hit the body that last struck them
 * in melee (it stands adjacent — the closest target of the neutral script, so
 * retaliation and attack land on the same unit), else our front (melee)
 * bodies before shooters.
 *
 * It is an estimate for the fight-or-scout decision, not a resolver: unit
 * abilities beyond the strike estimator's pierce/cap/elemental reading, moves
 * after round 1 and ability triggers are not modelled. Cost is fixed (at most
 * FORECAST_SAMPLES × rounds × units strikes over cached damage tables) and the
 * result is memoized by the combat's content, because every scored combat
 * action asks for it.
 */
export type NeutralFightForecast = {
  /** Share of sampled fights in which every guard is removed in time. */
  winChance: number;
  /** Average number of our units removed. */
  expectedOwnLosses: number;
  /** Combat rounds the forecast allowed (free + affordable paid rounds). */
  rounds: number;
};

const FORECAST_SAMPLES = 40;
const STARE_GRADE: Record<string, number> = { bronze: 0, silver: 1, gold: 2, azure: 3 };
const MAX_FORECAST_ROUNDS = 4;
const MEMO_LIMIT = 48;
const memo = new Map<string, NeutralFightForecast | null>();
/** Pre-fight map forecasts (guard priors, banks) live apart from the per-action
 * combat memo: in-combat keys changed every action and evicted them, so every map
 * decision re-simulated every bank on the board (30% of AI CPU in the lab). */
const MAP_MEMO_LIMIT = 256;
const mapMemo = new Map<string, NeutralFightForecast | null>();

type SimUnit = {
  id: string;
  own: boolean;
  phases: CombatUnitState[];
  phaseHealth: number[];
  ranged: boolean;
  reachesRoundOne: boolean;
  initiative: number;
  threat: number;
  arrowImmune: boolean;
  /** Post-attack "all dice match → Health 0" follow-ups (Gorgon Death Stare). */
  stares: DeathStareFollowUp[];
  /** Ability riders per life (a Stacked-only bank ability ends with the token). */
  traits: PhaseTraits[];
  /** A Defense token already on the board (a Defend action) for this round. */
  defenseTokenNow: boolean;
  paralyzedAtStart: boolean;
  /** Already activated in the live combat round: it sits out the forecast's first round. */
  actedAtStart: boolean;
  // mutable per sample
  phase: number;
  health: number;
  alive: boolean;
  retaliated: boolean;
  paralyzed: boolean;
  engagedBy: SimUnit | null;
};

/**
 * The strike riders that swing real fights and that the stat-sum estimate
 * cannot see, read from the engine's own ability definitions: paralysis on
 * attack (Stacked Medusa Stores Medusas) or on a die face (Basilisks), the
 * Defend die a Defense token rolls (Stacked Treasury Dwarves), retaliation
 * penalties (Dragon Flies), attacks that never provoke retaliation and
 * unlimited retaliation (Griffins).
 */
type PhaseTraits = {
  paralyzeOnAttack: boolean;
  paralyzeOnDie: Array<{ source: "own" | "extra"; onRoll: number; maxRoll?: number }>;
  selfDefenseToken: boolean;
  ignoresRetaliation: boolean;
  retaliationPenalty: number;
  unlimitedRetaliation: boolean;
  ignoresParalysis: boolean;
  elemental: boolean;
};

function phaseTraits(unit: CombatUnitState): PhaseTraits {
  const effects = getUnitAbilityDefinitions(unit)
    .filter(ability => ability.implementationStatus === "implemented" && ability.effect)
    .map(ability => ability.effect!);
  const traits: PhaseTraits = {
    paralyzeOnAttack: false, paralyzeOnDie: [], selfDefenseToken: false, ignoresRetaliation: false,
    retaliationPenalty: 0, unlimitedRetaliation: false, ignoresParalysis: false, elemental: dealsElementalStrike(unit),
  };
  for (const effect of effects) {
    if (effect.type === "PARALYZE_TARGET_ON_ATTACK") traits.paralyzeOnAttack = true;
    else if (effect.type === "PARALYZE_TARGET_ON_DIE") {
      traits.paralyzeOnDie.push({ source: effect.source, onRoll: effect.onRoll, maxRoll: effect.maxRoll });
    } else if (effect.type === "SELF_DEFENSE_TOKEN" || effect.type === "DEFEND_HEAL") traits.selfDefenseToken = true;
    else if (effect.type === "IGNORE_RETALIATION" || effect.type === "IGNORE_RANGED_PENALTIES_AND_MELEE_RETALIATION" ||
        effect.type === "IGNORE_ADJACENT_RANGED_PENALTY_AND_RETALIATION") traits.ignoresRetaliation = true;
    else if (effect.type === "RETALIATION_AGAINST_ATTACK_PENALTY") {
      traits.retaliationPenalty = Math.max(traits.retaliationPenalty, effect.amount);
    } else if (effect.type === "ALLOW_UNLIMITED_RETALIATION") traits.unlimitedRetaliation = true;
    else if (effect.type === "IGNORE_PARALYSIS") traits.ignoresParalysis = true;
  }
  return traits;
}

const NEUTRAL_TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, azure: 3 };
/** neutral-ai.ts tier priority: own tier 0, lower tiers by closeness, every
 * higher tier one shared class, untiered bodies (summons, bank cards,
 * commanders) last; a gradeless bank guard ranks everything equally. */
function neutralTargetRank(attacker: CombatUnitState, target: CombatUnitState): number {
  if (attacker.bankUnit) return 0;
  if (target.summoned || target.bankUnit || target.commanderSlug || target.heroUnit) return 100;
  const own = NEUTRAL_TIER_RANK[attacker.grade];
  const theirs = NEUTRAL_TIER_RANK[target.grade];
  if (own === undefined || theirs === undefined) return 50;
  if (theirs === own) return 0;
  return theirs < own ? own - theirs : 10;
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The lives a unit still has, in order. A Stack Token absorbs the first lethal
 * blow — the token and its stat bonus are discarded and the unit fights on at
 * its printed statistics (rulebook p.67) — and a Pack then flips to its Few
 * side, keeping any temporary stat bonus the Pack carried. */
function phasesOf(state: GameState, unit: CombatUnitState): { phases: CombatUnitState[]; health: number[] } {
  const phases = [unit];
  const health = [unitRemainingHealth(unit)];
  let current = unit;
  if (unit.stackToken) {
    // A private copy: the stat re-derivation writes into the unit it is given.
    const bare = structuredClone(unit);
    bare.stackToken = null;
    bare.damage = 0;
    applyUnitCurrentSide(bare, getRuleset(state), unitSideRuleOverrides(state));
    phases.push(bare);
    health.push(Math.max(0, bare.maxHealth));
    current = bare;
  }
  if (current.variant === "pack" && current.unitDefId) {
    const pack = getUnitSide(current.unitDefId, "pack");
    const few = getUnitSide(current.unitDefId, "few");
    if (few && few.health > 0) {
      phases.push({
        ...current,
        variant: "few",
        attack: Math.max(0, few.attack + (current.attack - (pack?.attack ?? current.attack))),
        defense: Math.max(0, few.defense + (current.defense - (pack?.defense ?? current.defense))),
        maxHealth: few.health,
        damage: 0,
        armyStacks: 0,
      });
      health.push(few.health);
    }
  }
  return { phases, health };
}

/**
 * Rounds still to fight: the round in progress (none while the continue window
 * is open), the free rounds after it, and one more per movement point — every
 * later round costs one to continue (the movement already paid for the current
 * round is gone from the hero, so it is not counted twice).
 */
function roundsLeft(state: GameState, combat: CombatState): number {
  const hero = state.heroes[combat.context.kind === "neutral" ? combat.context.heroId : ""];
  if (combat.context.kind !== "neutral" || combat.context.hasAzure || combat.context.unlimitedRounds ||
      houseRuleEnabled(state, "free-neutral-combat-extend")) return MAX_FORECAST_ROUNDS;
  const free = combat.geometry === "hex" ? HEX_DEFAULT_FREE_COMBAT_ROUNDS : 1;
  const round = Math.max(1, combat.round ?? 1);
  const current = combat.awaitingContinue ? 0 : 1;
  const freeAfter = Math.max(0, free - round);
  const paid = Math.max(0, hero?.movementPoints ?? 0);
  return Math.max(1, Math.min(MAX_FORECAST_ROUNDS, current + freeAfter + paid));
}

type HeldCards = { spells: number[]; power: number; attack: number[]; defense: number[] };

type ForecastOptions = {
  /** The cards the fight will open with (default: the current hand). */
  hand?: readonly string[];
  /** Rounds the fight will have (default: read from the live combat). */
  rounds?: number;
  /** Unplaced prospective board: melee reach in round 1 by geometry alone. */
  meleeReachesRoundOne?: boolean;
  samples?: number;
  /** Prospective boards only (synthetic positions): strike tables shared across
   * the sampled parties / token placements of one forecast, keyed by the bodies'
   * printed statistics and abilities. */
  faceCache?: Map<string, { dice: readonly number[]; faces: number[] }>;
  /** "player": a thinking opponent — it focus-fires like we do and plays the
   * estimated combat cards of `enemyHand` (damage spells, Attack, Defense). */
  mode?: "neutral" | "player";
  enemyHand?: readonly string[];
};

function strikeSignature(unit: CombatUnitState): string {
  return `${unit.unitDefId ?? unit.name}|${unit.variant}|${unit.type}|${unit.attack}|${unit.defense}|${unit.maxHealth}|` +
    `${unit.initiative}|${unit.stackToken ?? ""}|${unit.abilities.join(".")}`;
}

/** The part of a hand the forecast actually reads (damage-spell ladders after
 * Power, Attack / Defense amounts): map forecasts key on it, so drawing a card
 * the fight never uses does not re-simulate every guard and bank on the board. */
function combatHandSignature(hand: readonly string[]): string {
  const held = heldCombatCards(hand);
  return `${held.spells.join(".")}/${held.power}/${held.attack.join(".")}/${held.defense.join(".")}`;
}

function heldCombatCards(hand: readonly string[], powerSpent = 0): HeldCards {
  const held: HeldCards = { spells: [], power: 0, attack: [], defense: [] };
  const ladders: Array<Record<number, number>> = [];
  for (const id of hand) {
    const baseId = baseCardId(id);
    const card = cardLibrary[baseId];
    if (!card) continue;
    const empowered = id.includes(".empowered");
    if (baseId.startsWith("stat.power")) held.power += 1;
    else if (card.effect?.type === "ADD_COMBAT_STAT" && card.effect.stat === "attack") {
      held.attack.push(empowered ? card.effect.expertAmount ?? card.effect.amount : card.effect.amount);
    } else if (card.effect?.type === "ADD_COMBAT_STAT" && card.effect.stat === "defense") {
      held.defense.push(empowered ? card.effect.expertAmount ?? card.effect.amount : card.effect.amount);
    } else if (card.kind === "spell" && card.effect?.type === "DEAL_DAMAGE" &&
        card.target?.type === "enemy-unit" && card.effect.amountByPower) {
      ladders.push(card.effect.amountByPower);
    }
  }
  // Spend held Power on the first casts, one point per cast, capped at the ladder.
  let power = Math.max(0, held.power - powerSpent);
  for (const ladder of ladders) {
    const top = Math.max(...Object.keys(ladder).map(Number));
    const boost = Math.min(power, top);
    power -= boost;
    held.spells.push(ladder[boost] ?? ladder[0] ?? 0);
  }
  held.spells.sort((a, b) => b - a);
  held.attack.sort((a, b) => b - a);
  held.defense.sort((a, b) => b - a);
  return held;
}

/**
 * Our damage spells already cast and waiting on the stack (the reaction window
 * before they resolve). They left the hand but have not hit yet — without this
 * the forecast dips for that instant, which read as "hopeless" and stopped the
 * AI from adding its held Power to its own Arrow. Held Power boosts them first.
 */
function pendingOwnSpellHits(
  state: GameState, playerId: PlayerId, combat: CombatState, heldPower: number,
): { hits: Array<{ unitId: string; damage: number }>; powerSpent: number } {
  const hits: Array<{ unitId: string; damage: number }> = [];
  let power = heldPower;
  for (const item of state.stack ?? []) {
    const action = item.action;
    if (action.type !== "CAST_SPELL" || action.playerId !== playerId) continue;
    const target = action.target;
    if (!target || target.type !== "unit") continue;
    const victim = combat.units[target.unitId];
    if (!victim || victim.controllerId === playerId) continue;
    const card = cardLibrary[baseCardId(action.cardId)];
    const ladder = card?.effect?.type === "DEAL_DAMAGE" ? card.effect.amountByPower : undefined;
    if (!ladder) continue;
    const top = Math.max(...Object.keys(ladder).map(Number));
    const base = Math.min(top, resolvedSpellPowerForStackItem(state, item));
    const boost = Math.min(power, top - base);
    power -= boost;
    hits.push({ unitId: target.unitId, damage: ladder[base + boost] ?? ladder[0] ?? 0 });
  }
  return { hits, powerSpent: heldPower - power };
}

/**
 * Board context a forecast reads beyond the units and hands in its memo key:
 * active effects (spells, Luck, riders), the live combat's round and
 * Battlefield Condition (attack faces read state.combat even for a map
 * forecast), each seat's permanents / war machine / equipment / morale, and the
 * round. Without it an entry computed under one context was served under
 * another — lab 2026-09-27: the lab's own recording forecasts changed the AI's
 * later decisions, i.e. a stale forecast survived an effect or a new permanent.
 */
export function forecastContextKey(state: GameState, playerIds: readonly PlayerId[]): string {
  const effects = (state.activeEffects ?? []).map(effect => `${effect.id}:${effect.controllerId ?? ""}`).sort().join(",");
  const combat = state.combat
    ? `${state.combat.id}:${state.combat.round}:${state.combat.battlefieldCondition?.id ?? ""}`
    : "-";
  const seats = playerIds.map(id => {
    const player = state.players[id];
    if (!player) return "";
    const gear = Object.values(heroEquipmentOf(state, id)).sort().join(".");
    return `${(player.permanents ?? []).join(".")}:${player.activeWarMachineCardId ?? ""}:${gear}:${player.morale ?? 0}`;
  }).join("/");
  return `${state.round ?? 0}|${effects}|${combat}|${seats}`;
}

function memoKey(state: GameState, playerId: PlayerId, combat: CombatState): string {
  // The memo is module-wide and the server hosts many games: combat ids
  // (`combat_<event#>`) and unit ids repeat across tables, so the key carries
  // the game's seed and each body's identity, not only its position/stats.
  // The per-unit round state the forecast reads (sits out round 1 once
  // activated, a Defend token, paralysis) is part of the content: a Defend or a
  // bare END_ACTIVATION changes nothing else in this key.
  const units = Object.values(combat.units)
    .map(unit => `${unit.id}:${unit.controllerId}:${unit.unitDefId ?? ""}:${unit.type}:${unit.position}:${unit.damage}:` +
      `${unit.maxHealth}:${unit.armyStacks ?? 0}:${unit.variant}:${unit.attack}:${unit.defense}:${unit.initiative}:` +
      `${unit.stackToken ?? ""}:${unit.activatedThisRound ? 1 : 0}${unit.defenseToken ? 1 : 0}${isParalyzed(unit) ? 1 : 0}:` +
      `${unit.abilities.join(".")}`)
    .sort().join("|");
  const hero = combat.context.kind === "neutral" ? state.heroes[combat.context.heroId] : undefined;
  const hand = [...(state.players[playerId]?.hand ?? [])].sort().join(",");
  const stack = (state.stack ?? []).map(item => item.action.type === "CAST_SPELL"
    ? `${item.action.playerId}:${item.action.cardId}:${JSON.stringify(item.action.target ?? null)}:${JSON.stringify(item.modifiers ?? {})}` : item.action.type).join(";");
  const seats = [...new Set(Object.values(combat.units).map(unit => unit.controllerId))];
  return `${state.seed}|${forecastContextKey(state, seats)}|${playerId}|${combat.id}|${combat.geometry ?? "grid"}|${combat.round}|${combat.awaitingContinue ? 1 : 0}|` +
    `${hero?.movementPoints ?? 0}|${units}|${hand}|${stack}`;
}

export function forecastNeutralFight(
  state: GameState,
  playerId: PlayerId,
  combat: CombatState,
): NeutralFightForecast | null {
  if (combat.context.kind !== "neutral") return null;
  const key = memoKey(state, playerId, combat);
  if (memo.has(key)) return memo.get(key)!;
  const result = forecastUncached(state, playerId, combat);
  if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string);
  memo.set(key, result);
  return result;
}

function forecastUncached(
  state: GameState,
  playerId: PlayerId,
  combat: CombatState,
  options: ForecastOptions = {},
): NeutralFightForecast | null {
  const living = Object.values(combat.units).filter(unit => unitRemainingHealth(unit) > 0);
  const own = living.filter(unit => unit.controllerId === playerId);
  const foes = living.filter(unit => unit.controllerId !== playerId);
  if (!own.length || !foes.length || own.length + foes.length > 12) return null;
  const rounds = options.rounds ?? roundsLeft(state, combat);
  const placed = living.every(unit => unit.position >= 0);

  const sims: SimUnit[] = living.map(unit => {
    const { phases, health } = phasesOf(state, unit);
    const enemies = unit.controllerId === playerId ? foes : own;
    let reachesRoundOne = unit.type === "ranged";
    if (!reachesRoundOne && options.meleeReachesRoundOne !== undefined) {
      reachesRoundOne = options.meleeReachesRoundOne;
    } else if (!reachesRoundOne && placed && (combat.round ?? 1) === 1) {
      const destinations = [unit.position, ...getLegalMoveDestinations(combat, unit, state)];
      reachesRoundOne = enemies.some(enemy => destinations.some(cell => unitsAdjacentAt(combat, unit, cell, enemy)));
    } else if (!reachesRoundOne) {
      reachesRoundOne = (combat.round ?? 1) > 1;
    }
    return {
      id: unit.id, own: unit.controllerId === playerId, phases, phaseHealth: health,
      ranged: unit.type === "ranged", reachesRoundOne, initiative: unit.initiative,
      threat: unitThreatValue(unit), arrowImmune: unitImmuneToSpellSchools(unit, ["any"]),
      stares: getDeathStareFollowUps(unit),
      traits: phases.map(phaseTraits),
      defenseTokenNow: Boolean(unit.defenseToken),
      paralyzedAtStart: isParalyzed(unit),
      // At the continue window the round is over: its activation flags are
      // stale, and the first simulated round is the next (fresh) one.
      actedAtStart: !combat.awaitingContinue && Boolean(unit.activatedThisRound),
      phase: 0, health: health[0], alive: true, retaliated: false, paralyzed: false, engagedBy: null,
    };
  });
  const order = [...sims].sort((a, b) => b.initiative - a.initiative || Number(b.own) - Number(a.own) || a.id.localeCompare(b.id));
  // Strike tables by numeric (attacker, life, defender, life, retaliation) slot:
  // the samples ask for them tens of thousands of times per forecast.
  const index = new Map(sims.map((sim, slot) => [sim, slot]));
  const lives = Math.max(...sims.map(sim => sim.phases.length));
  const slotOf = (attacker: SimUnit, defender: SimUnit, retaliation: boolean) =>
    (((index.get(attacker)! * lives + attacker.phase) * sims.length + index.get(defender)!) * lives + defender.phase) * 2 +
    (retaliation ? 1 : 0);
  const table: Array<number[] | undefined> = [];
  const rolls: Array<readonly number[] | undefined> = [];
  const means: Array<number | undefined> = [];
  const damageFaces = (attacker: SimUnit, defender: SimUnit, retaliation: boolean): number[] => {
    const key = slotOf(attacker, defender, retaliation);
    let faces = table[key];
    if (!faces) {
      const a = attacker.phases[attacker.phase];
      const d = defender.phases[defender.phase];
      // A retaliation against a Dazzling Flight body suffers its printed -N Attack;
      // enemy Mermaids (Siren Song) sap every retaliation too — read from the
      // live board at forecast start (a carrier falling mid-sample is not
      // replayed: the strike tables are cached per slot).
      const penalty = retaliation
        ? defender.traits[defender.phase].retaliationPenalty + getEnemyRetaliationAuraPenalty(combat, a)
        : 0;
      const shared = options.faceCache ? `${strikeSignature(a)}>${strikeSignature(d)}:${retaliation ? 1 : 0}:${penalty}` : null;
      const cached = shared ? options.faceCache!.get(shared) : undefined;
      let dice: readonly number[];
      if (cached) {
        ({ dice, faces } = cached);
      } else {
        dice = plannedAttackFaces(state, a, d, a.position, retaliation);
        faces = dice.map(face => estimatedStrikeDamage(penalty ? { ...a, attack: Math.max(0, a.attack - penalty) } : a,
          d, a.position, retaliation, face));
        if (shared) options.faceCache!.set(shared, { dice, faces });
      }
      table[key] = faces;
      rolls[key] = dice;
    }
    return faces;
  };
  const dieFaces = (attacker: SimUnit, defender: SimUnit, retaliation: boolean): readonly number[] => {
    damageFaces(attacker, defender, retaliation);
    return rolls[slotOf(attacker, defender, retaliation)]!;
  };
  const meanStrike = (attacker: SimUnit, defender: SimUnit): number => {
    const key = slotOf(attacker, defender, false);
    let value = means[key];
    if (value === undefined) {
      const faces = damageFaces(attacker, defender, false);
      value = faces.reduce((sum, face) => sum + face, 0) / faces.length;
      means[key] = value;
    }
    return value;
  };
  const rollDie = (random: () => number) => ATTACK_DIE_FACES[Math.floor(random() * ATTACK_DIE_FACES.length)];
  // The Defend die: a "+1" face grants +1 Defense against this blow (moot vs an
  // Elemental strike). A board Defense token counts only in the current round.
  const defendRoll = (defender: SimUnit, attacker: SimUnit, round: number, random: () => number): number => {
    const shielded = defender.traits[defender.phase].selfDefenseToken || (round === 1 && defender.phase === 0 && defender.defenseTokenNow);
    if (!shielded || attacker.traits[attacker.phase].elemental) return 0;
    return rollDie(random) === 1 ? 1 : 0;
  };
  const hand = options.hand ?? state.players[playerId]?.hand ?? [];
  const heldPower = heldCombatCards(hand).power;
  // A prospective (pre-reveal) board has no stack of its own.
  const pending = options.hand ? { hits: [], powerSpent: 0 } : pendingOwnSpellHits(state, playerId, combat, heldPower);
  const held = heldCombatCards(hand, pending.powerSpent);
  const enemyHeld = options.enemyHand ? heldCombatCards(options.enemyHand) : null;
  const thinkingEnemy = options.mode === "player";
  const samples = options.samples ?? FORECAST_SAMPLES;

  let wins = 0;
  let losses = 0;
  const random = seededRandom(`${combat.id}|${combat.round}`);
  for (let sample = 0; sample < samples; sample += 1) {
    for (const sim of sims) {
      sim.phase = 0; sim.health = sim.phaseHealth[0]; sim.alive = true; sim.engagedBy = null;
      sim.paralyzed = sim.paralyzedAtStart;
    }
    const spells = [...held.spells];
    const attackCards = [...held.attack];
    const defenseCards = [...held.defense];
    const enemySpells = enemyHeld ? [...enemyHeld.spells] : [];
    const enemyAttackCards = enemyHeld ? [...enemyHeld.attack] : [];
    const enemyDefenseCards = enemyHeld ? [...enemyHeld.defense] : [];
    // A blow's excess damage carries into the next life (combat-units.ts: the
    // Stack Token absorb and the Pack → Few flip both keep `damage - maxHealth`),
    // capped at that one life: a still-lethal excess leaves the life after it whole.
    const hit = (target: SimUnit, amount: number) => {
      if (amount <= 0 || !target.alive) return;
      target.paralyzed = false;
      if (amount < target.health) { target.health -= amount; return; }
      let excess = amount - target.health;
      for (;;) {
        if (target.phase + 1 >= target.phases.length) { target.alive = false; return; }
        target.phase += 1;
        target.health = target.phaseHealth[target.phase];
        if (excess < target.health) { target.health -= excess; return; }
        excess = 0;
      }
    };
    for (const pendingHit of pending.hits) {
      const victim = sims.find(sim => sim.id === pendingHit.unitId);
      if (victim) hit(victim, pendingHit.damage);
    }
    for (let round = 1; round <= rounds; round += 1) {
      for (const sim of sims) sim.retaliated = false;
      // One damage spell per round, at the guard where it buys the most; a
      // cast already on the stack is this round's spell.
      const spell = round === 1 && pending.hits.length > 0 ? undefined : spells.shift();
      if (spell) {
        let best: SimUnit | null = null;
        let bestValue = 0;
        for (const foe of sims) {
          if (foe.own || !foe.alive || foe.arrowImmune) continue;
          const bodies = sims.filter(unit => unit.own && unit.alive);
          const physical = Math.max(0, ...bodies.map(body => meanStrike(body, foe)));
          const kills = spell >= foe.health && foe.phase + 1 >= foe.phases.length;
          const value = foe.threat * Math.min(1, spell / Math.max(1, foe.health)) *
            (kills ? 2 : 1) * (physical < 1.5 ? 1.6 : 1);
          if (value > bestValue) { bestValue = value; best = foe; }
        }
        if (best) hit(best, spell);
      }
      // The opponent's damage spell, aimed the same way at our bodies.
      const enemySpell = enemySpells.shift();
      if (enemySpell) {
        let best: SimUnit | null = null;
        let bestValue = 0;
        for (const body of sims) {
          if (!body.own || !body.alive || body.arrowImmune) continue;
          const kills = enemySpell >= body.health && body.phase + 1 >= body.phases.length;
          const value = body.threat * Math.min(1, enemySpell / Math.max(1, body.health)) * (kills ? 2 : 1);
          if (value > bestValue) { bestValue = value; best = body; }
        }
        if (best) hit(best, enemySpell);
      }
      for (const actor of order) {
        if (!actor.alive || (round === 1 && (!actor.reachesRoundOne || actor.actedAtStart))) continue;
        // Paralysis: the unit skips this activation, then it wears off.
        if (actor.paralyzed) { actor.paralyzed = false; continue; }
        const targets = sims.filter(unit => unit.own !== actor.own && unit.alive);
        if (!targets.length) break;
        let target: SimUnit;
        if (actor.own || thinkingEnemy) {
          target = targets[0];
          let bestScore = Number.NEGATIVE_INFINITY;
          for (const candidate of targets) {
            const expected = meanStrike(actor, candidate);
            const lethal = expected >= candidate.health && candidate.phase + 1 >= candidate.phases.length;
            const score = (lethal ? 1_000 : 0) + candidate.threat * Math.min(1, expected / Math.max(1, candidate.health));
            if (score > bestScore) { bestScore = score; target = candidate; }
          }
        } else {
          // The engine's neutral script (neutral-ai.ts rankedTargetPool /
          // sortNeutralTargetCandidates): an engaged shooter strikes the body
          // engaging it, a free one hunts our shooters first; a graded guard then
          // takes its own tier, the next tier down, then any higher tier (a
          // gradeless bank guard skips the tier rule); nearest breaks ties — the
          // body already engaging it is the nearest.
          const engaged = actor.engagedBy?.alive ? actor.engagedBy : null;
          let pool = targets;
          if (actor.ranged) {
            if (engaged) pool = [engaged];
            else if (pool.some(unit => unit.ranged)) pool = pool.filter(unit => unit.ranged);
          }
          const attacker = actor.phases[actor.phase];
          const rank = (unit: SimUnit) => neutralTargetRank(attacker, unit.phases[unit.phase]);
          const best = Math.min(...pool.map(rank));
          pool = pool.filter(unit => rank(unit) === best);
          target = engaged && pool.includes(engaged) ? engaged : pool[Math.floor(random() * pool.length)];
        }
        const faces = damageFaces(actor, target, false);
        const faceIndex = Math.floor(random() * faces.length);
        const face = dieFaces(actor, target, false)[faceIndex];
        let damage = Math.max(0, faces[faceIndex] - defendRoll(target, actor, round, random));
        // A held statistic card is spent where it changes the strike's result:
        // Attack turns a wound into a flip/removal, Defense saves one.
        if (actor.own && attackCards.length && damage < target.health &&
            damage + attackCards[0] >= target.health) damage += attackCards.shift()!;
        if (!actor.own && defenseCards.length && damage >= target.health &&
            damage - defenseCards[0] < target.health) damage -= defenseCards.shift()!;
        if (!actor.own && enemyAttackCards.length && damage < target.health &&
            damage + enemyAttackCards[0] >= target.health) damage += enemyAttackCards.shift()!;
        if (actor.own && enemyDefenseCards.length && damage >= target.health &&
            damage - enemyDefenseCards[0] < target.health) damage -= enemyDefenseCards.shift()!;
        hit(target, damage);
        // Death Stare: after its own attack, all matching dice set the
        // surviving target's Health to 0 (a Pack flips, a Few is removed).
        for (const stare of actor.stares) {
          if (!target.alive) break;
          const grade = target.phases[target.phase].grade;
          if (stare.targetGradeAtMost && STARE_GRADE[grade] > STARE_GRADE[stare.targetGradeAtMost]) continue;
          let matched = true;
          for (let die = 0; die < stare.diceCount && matched; die += 1) {
            matched = ATTACK_DIE_FACES[Math.floor(random() * ATTACK_DIE_FACES.length)] === stare.onRoll;
          }
          if (matched) hit(target, target.health);
        }
        // Paralysis riders land after the blow (Petrifying Gaze on every attack,
        // or on a die face — the attack's own die or one extra roll).
        const actorTraits = actor.traits[actor.phase];
        if (target.alive && !target.traits[target.phase].ignoresParalysis) {
          if (actorTraits.paralyzeOnAttack) target.paralyzed = true;
          for (const rider of actorTraits.paralyzeOnDie) {
            const roll = rider.source === "own" ? face : rollDie(random);
            if (roll >= rider.onRoll && roll <= (rider.maxRoll ?? rider.onRoll)) target.paralyzed = true;
          }
        }
        if (!actor.ranged) target.engagedBy = actor;
        if (target.alive && !actor.ranged && !actorTraits.ignoresRetaliation &&
            (!target.retaliated || target.traits[target.phase].unlimitedRetaliation)) {
          target.retaliated = true;
          const back = damageFaces(target, actor, true);
          hit(actor, Math.max(0, back[Math.floor(random() * back.length)] - defendRoll(actor, target, round, random)));
        }
      }
      if (!sims.some(unit => !unit.own && unit.alive) || !sims.some(unit => unit.own && unit.alive)) break;
    }
    if (!sims.some(unit => !unit.own && unit.alive)) wins += 1;
    // A PvP battle has no round limit: one still undecided at the horizon goes
    // to the side holding more of its fighting value (threat x health share).
    else if (thinkingEnemy && sims.some(unit => unit.own && unit.alive)) {
      const standing = (own: boolean) => sims.reduce((sum, unit) => unit.own === own && unit.alive
        ? sum + unit.threat * (unit.phase + unit.health / Math.max(1, unit.phaseHealth[unit.phase])) : sum, 0);
      if (standing(true) > standing(false)) wins += 1;
    }
    losses += sims.filter(unit => unit.own && !unit.alive).length;
  }
  return { winChance: wins / samples, expectedOwnLosses: losses / samples, rounds };
}

/** Cards a seat opens a neutral fight with: its hand, plus the computer seat's
 * phantom Power + Magic Arrow (every combat) and, in single-player, the
 * temporary Empowered Attack / Defense (see combat-boost.ts). */
function prospectiveHand(state: GameState, playerId: PlayerId): string[] {
  const hand = [...(state.players[playerId]?.hand ?? [])];
  if (!isComputerPlayer(state, playerId)) return hand;
  hand.push("stat.power", "spell.magic_arrow");
  if (sessionModeOf(state) === "single-player") hand.push("stat.attack.empowered", "stat.defense.empowered");
  return hand;
}

const PRIOR_PARTIES = 8;
const PRIOR_SAMPLES = 16;
type PartyTier = "bronze" | "silver" | "gold" | "azure";

/**
 * "Vision" before a guard is revealed: the same forecast averaged over parties
 * sampled from the PUBLIC guard composition — the printed Field-Difficulty row
 * of the neutral army table and the catalogue of neutral units per tier (or a
 * designer's fixed guard list). Never the hidden deck order or the next draw.
 * `reserve` is the combat movement the hero will enter with (the paid rounds).
 */
export function forecastGuardField(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
  reserve: number,
): NeutralFightForecast | null {
  const difficulty = field.difficulty ?? 0;
  if (difficulty <= 0 || difficulty >= 7 || field.bankId || field.location === "creature_bank") return null;
  const playerId = hero.controllerId;
  const army = (state.players[playerId]?.army ?? []).filter(unit => unit.side !== "bank");
  if (!army.length) return null;
  const scenario = neutralArmyDifficultyForField(state, field);
  const party = NEUTRAL_ARMY_TABLE[scenario]?.[difficulty];
  if (!party && !field.customGuardUnits?.length) return null;
  const hex = houseRuleEnabled(state, "hex-battlefield");
  const rounds = Math.min(MAX_FORECAST_ROUNDS, (hex ? HEX_DEFAULT_FREE_COMBAT_ROUNDS : 1) + Math.max(0, reserve));
  const hand = prospectiveHand(state, playerId);
  // Seed + seat: the module-wide memo serves every table the server hosts, and
  // map space ids repeat across games. Veterancy / health bonuses change the
  // bodies makeCombatUnitFromArmy mints, so they are part of the army read.
  const key = `prior|${state.seed}|${forecastContextKey(state, [playerId])}|${playerId}|${field.spaceId}|${difficulty}|${scenario}|${rounds}|${hex}|` +
    `${(field.customGuardUnits ?? []).join(",")}|${field.customGuardPackFaction ?? ""}|` +
    `${army.map(unit => `${unit.unitDefId}:${unit.side}:${unit.stacks ?? 0}:${unit.permanentAttackBonus ?? 0}:` +
      `${unit.permanentHealthBonus ?? 0}:${unit.experience ?? 0}:${unit.job ?? ""}:${unit.transforms?.length ?? 0}`).join(",")}|` +
    `${combatHandSignature(hand)}`;
  if (mapMemo.has(key)) return mapMemo.get(key)!;
  const ruleset = getRuleset(state);
  const overrides = unitSideRuleOverrides(state);
  const own = army.flatMap((unit, index) => {
    const made = makeCombatUnitFromArmy(unit, playerId, `own-${index}`, index, ruleset, overrides);
    return made ? [made] : [];
  });
  let win = 0;
  let losses = 0;
  let parties = 0;
  const faceCache: NonNullable<ForecastOptions["faceCache"]> = new Map();
  for (let k = 0; k < PRIOR_PARTIES && own.length; k += 1) {
    const random = seededRandom(`${field.spaceId}|${difficulty}|${k}`);
    const ids: Array<{ unitDefId: string; tier: PartyTier; factionPack?: boolean; factionFew?: boolean }> = [];
    if (field.customGuardUnits?.length) {
      // The designer's certain army is public (the map previews it), but its
      // slots are not all plain Neutral ids: `random:<tier>`, `pack:<id>`,
      // `few:<id>`, town-rank and one-of slots only exist as bodies once
      // resolved. Resolve them like the fight does — with this forecast's own
      // sampling RNG, never the game's seeded draw.
      const rng = { nextInt: (min: number, max: number) => min + Math.floor(random() * (max - min + 1)) };
      ids.push(...resolveCustomGuardDraws(field.customGuardUnits, rng, {
        packFaction: field.customGuardPackFaction,
        playableFactions: PLAYABLE_FACTIONS.filter(faction => isPlayableFaction(faction, state.anime)),
      }));
    } else if (party) {
      for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
        const pool = [...(neutralUnitIdsByTier[tier] ?? [])];
        for (let n = 0; n < (party[tier] ?? 0) && pool.length; n += 1) {
          ids.push({ unitDefId: pool.splice(Math.floor(random() * pool.length), 1)[0], tier });
        }
      }
    }
    const guards = ids.flatMap((draw, index) => {
      const made = makeCombatUnitFromNeutral(draw, `guard-${index}`, 100 + index, ruleset, overrides);
      return made ? [made] : [];
    });
    if (!guards.length) continue;
    const combat = {
      id: `prior|${field.spaceId}|${k}`,
      round: 1,
      units: Object.fromEntries([...own, ...guards].map(unit => [unit.id, unit])),
      obstacles: [],
      attackerPlayerId: playerId,
      defenderPlayerId: guards[0].controllerId,
      context: { kind: "neutral", heroId: hero.id, fieldId: field.spaceId, difficulty },
    } as unknown as CombatState;
    const result = forecastUncached(state, playerId, combat, {
      hand, rounds, meleeReachesRoundOne: !hex, samples: PRIOR_SAMPLES, faceCache,
    });
    if (!result) continue;
    win += result.winChance;
    losses += result.expectedOwnLosses;
    parties += 1;
  }
  const forecast = parties ? { winChance: win / parties, expectedOwnLosses: losses / parties, rounds } : null;
  if (mapMemo.size >= MAP_MEMO_LIMIT) mapMemo.delete(mapMemo.keys().next().value as string);
  mapMemo.set(key, forecast);
  return forecast;
}

const STACK_TOKEN_STATS: readonly StackTokenStat[] = ["attack", "defense", "health", "initiative"];
const BANK_PRIOR_PLACEMENTS = 6;

/**
 * "Vision" before a Creature Bank fight. The face-up bank token's defender
 * cards are public, and so is HOW MANY defenders carry a Stack Token (Scenario
 * Difficulty, or the Polish rolled size). Which defenders are Stacked and with
 * which random statistic is not, so the forecast averages over placements drawn
 * the way the engine draws them (distinct defenders, uniform statistic, at most
 * two of one statistic). A bank has no round limit and no paid continuation.
 * Never the game's seeded stream: public information only.
 */
export function forecastCreatureBankField(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
  /** Rounds the fight gets: with `bank-move-points` each round after the
   * first costs a movement point, so it is 1 + the MP kept after entering. */
  rounds = MAX_FORECAST_ROUNDS,
): NeutralFightForecast | null {
  rounds = Math.max(1, Math.min(MAX_FORECAST_ROUNDS, rounds));
  if (field.location !== "creature_bank" || !field.bankId) return null;
  const army = (state.players[playerId]?.army ?? []).filter(unit => unit.side !== "bank");
  if (!army.length) return null;
  const polishSizes = houseRuleEnabled(state, "polish-bank-sizes");
  const bankSize = polishSizes ? field.bankSize ?? 1 : field.bankSize;
  const hex = houseRuleEnabled(state, "hex-battlefield");
  const hand = prospectiveHand(state, playerId);
  const key = `bank|${state.seed}|${forecastContextKey(state, [playerId])}|${playerId}|${field.spaceId}|${field.bankId}|${bankSize ?? ""}|${field.bankVariant ?? ""}|${rounds}|` +
    `${state.adventure?.difficulty ?? ""}|${hex}|` +
    `${army.map(unit => `${unit.unitDefId}:${unit.side}:${unit.stacks ?? 0}:${unit.permanentAttackBonus ?? 0}:` +
      `${unit.permanentHealthBonus ?? 0}:${unit.experience ?? 0}:${unit.job ?? ""}:${unit.transforms?.length ?? 0}`).join(",")}|` +
    `${combatHandSignature(hand)}`;
  if (mapMemo.has(key)) return mapMemo.get(key)!;
  let forecast: NeutralFightForecast | null = null;
  try {
    const draws = buildCreatureBankDrawsForState(state, field.bankId as CreatureBankId, bankSize, field.bankVariant);
    const ruleset = getRuleset(state);
    const overrides = unitSideRuleOverrides(state);
    const own = army.flatMap((unit, index) => {
      const made = makeCombatUnitFromArmy(unit, playerId, `own-${index}`, index, ruleset, overrides);
      return made ? [made] : [];
    });
    const difficulty = state.adventure?.difficulty ?? "normal";
    const tokenRolls = polishSizes && field.bankId === "black_tower" ? 0
      : Math.min(bankSize ?? STACK_TOKENS_BY_DIFFICULTY[difficulty], draws.length, 4);
    const binhChance = !polishSizes && houseRuleEnabled(state, "bank-stack-chance-80");
    let win = 0;
    let losses = 0;
    let placements = 0;
    const faceCache: NonNullable<ForecastOptions["faceCache"]> = new Map();
    for (let k = 0; k < BANK_PRIOR_PLACEMENTS && own.length; k += 1) {
      const random = seededRandom(`bank|${field.spaceId}|${field.bankId}|${k}`);
      const guards = draws.flatMap((draw, index) => {
        const made = makeCombatUnitFromNeutral(draw, `bank-${index}`, 100 + index, ruleset, overrides);
        return made ? [made] : [];
      });
      if (!guards.length) continue;
      const order = guards.map((_, index) => index);
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const used: Partial<Record<StackTokenStat, number>> = {};
      for (let i = 0; i < Math.min(tokenRolls, guards.length); i += 1) {
        if (binhChance && random() >= 0.8) continue;
        const open = STACK_TOKEN_STATS.filter(stat => (used[stat] ?? 0) < 2);
        const stat = open[Math.floor(random() * open.length)];
        used[stat] = (used[stat] ?? 0) + 1;
        const unit = guards[order[i]];
        unit.stackToken = stat;
        applyUnitCurrentSide(unit, ruleset, overrides);
      }
      const combat = {
        id: `bank|${field.spaceId}|${k}`,
        round: 1,
        units: Object.fromEntries([...own, ...guards].map(unit => [unit.id, unit])),
        obstacles: [],
        attackerPlayerId: playerId,
        defenderPlayerId: guards[0].controllerId,
        context: { kind: "neutral", heroId: "", fieldId: field.spaceId, difficulty: 0, bankId: field.bankId, hasAzure: false },
      } as unknown as CombatState;
      const result = forecastUncached(state, playerId, combat, {
        hand, rounds, meleeReachesRoundOne: !hex, samples: PRIOR_SAMPLES, faceCache,
      });
      if (!result) continue;
      win += result.winChance;
      losses += result.expectedOwnLosses;
      placements += 1;
    }
    forecast = placements ? { winChance: win / placements, expectedOwnLosses: losses / placements, rounds } : null;
  } catch {
    forecast = null;
  }
  if (mapMemo.size >= MAP_MEMO_LIMIT) mapMemo.delete(mapMemo.keys().next().value as string);
  mapMemo.set(key, forecast);
  return forecast;
}

const PVP_SAMPLES = 64;
/** PvP has no round limit; play far enough that most battles are decided. */
const PVP_ROUNDS = 10;

/**
 * PvP "vision" before engaging a player: both deployable armies are public
 * cards, so the fight is played forward like a guard fight, but against a
 * thinking opponent — it focus-fires like we do and uses the combat cards its
 * public hand size suggests (`enemyHand`, estimated by the caller: its real
 * cards are hidden). Our side opens with our real hand plus the computer seat's
 * phantom Power + Magic Arrow (every combat, PvP included). No siege walls.
 */
export function forecastPlayerFight(
  state: GameState,
  playerId: PlayerId,
  enemyId: PlayerId,
  own: readonly CombatUnitState[],
  enemies: readonly CombatUnitState[],
  enemyHand: readonly string[],
  /** Our side fights units-only (a garrison defense): no hand, no phantom cards. */
  unitsOnly = false,
): NeutralFightForecast | null {
  if (!own.length || !enemies.length || own.length + enemies.length > 14) return null;
  const hand = unitsOnly ? [] : [...(state.players[playerId]?.hand ?? [])];
  if (!unitsOnly && isComputerPlayer(state, playerId)) hand.push("stat.power", "spell.magic_arrow");
  const hex = houseRuleEnabled(state, "hex-battlefield");
  const signature = (units: readonly CombatUnitState[]) => units.map(strikeSignature).sort().join(",");
  const key = `pvp|${state.seed}|${forecastContextKey(state, [playerId, enemyId])}|${playerId}|${enemyId}|${hex}|${signature(own)}|${signature(enemies)}|` +
    `${combatHandSignature(hand)}|${combatHandSignature(enemyHand)}`;
  if (mapMemo.has(key)) return mapMemo.get(key)!;
  const units = [
    ...own.map((unit, index) => ({ ...unit, id: `own-${index}`, controllerId: playerId, position: index })),
    ...enemies.map((unit, index) => ({ ...unit, id: `foe-${index}`, controllerId: enemyId, position: 100 + index })),
  ];
  const combat = {
    id: `pvp|${playerId}|${enemyId}`,
    round: 1,
    units: Object.fromEntries(units.map(unit => [unit.id, unit])),
    obstacles: [],
    attackerPlayerId: playerId,
    defenderPlayerId: enemyId,
    context: { kind: "player" },
  } as unknown as CombatState;
  let forecast: NeutralFightForecast | null = null;
  try {
    forecast = forecastUncached(state, playerId, combat, {
      hand, enemyHand, rounds: PVP_ROUNDS, meleeReachesRoundOne: !hex, samples: PVP_SAMPLES,
      mode: "player", faceCache: new Map(),
    });
  } catch {
    forecast = null;
  }
  if (mapMemo.size >= MAP_MEMO_LIMIT) mapMemo.delete(mapMemo.keys().next().value as string);
  mapMemo.set(key, forecast);
  return forecast;
}
