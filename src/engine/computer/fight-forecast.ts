import { cardLibrary } from "@/data/cards/library";
import { ATTACK_DIE_FACES } from "../battlefield";
import {
  getUnitSide, makeCombatUnitFromArmy, makeCombatUnitFromNeutral, NEUTRAL_ARMY_TABLE, neutralArmyDifficultyForField,
  PLAYABLE_FACTIONS,
} from "../adventure";
import { isPlayableFaction, neutralUnitIdsByTier } from "@/data/factions/core";
import { resolveCustomGuardDraws } from "../map-design-features";
import { getRuleset, unitSideRuleOverrides } from "../ruleset";
import { isComputerPlayer, sessionModeOf } from "./control";
import { baseCardId } from "../phantom-cards";
import { houseRuleEnabled } from "../house-rules";
import { HEX_DEFAULT_FREE_COMBAT_ROUNDS } from "../hex-battlefield";
import { unitsAdjacentAt } from "../hex-footprint";
import { getLegalMoveDestinations, resolvedSpellPowerForStackItem } from "../legal-actions";
import { getDeathStareFollowUps, unitImmuneToSpellSchools, type DeathStareFollowUp } from "../unit-abilities";
import type { CombatState, CombatUnitState, GameState, HeroState, MapFieldState, PlayerId } from "../state";
import { plannedAttackFaces } from "./battlefield-conditions";
import { unitRemainingHealth, unitThreatValue } from "./score";
import { estimatedStrikeDamage } from "./strike-value";

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
  // mutable per sample
  phase: number;
  health: number;
  alive: boolean;
  retaliated: boolean;
  engagedBy: SimUnit | null;
};

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

/** Printed Pack → Few flip keeps any temporary stat bonus the Pack carried. */
function phasesOf(unit: CombatUnitState): { phases: CombatUnitState[]; health: number[] } {
  const phases = [unit];
  const health = [unitRemainingHealth(unit)];
  if (unit.variant === "pack" && unit.unitDefId && !unit.stackToken) {
    const pack = getUnitSide(unit.unitDefId, "pack");
    const few = getUnitSide(unit.unitDefId, "few");
    if (few && few.health > 0) {
      phases.push({
        ...unit,
        variant: "few",
        attack: Math.max(0, few.attack + (unit.attack - (pack?.attack ?? unit.attack))),
        defense: Math.max(0, few.defense + (unit.defense - (pack?.defense ?? unit.defense))),
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
};

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

function memoKey(state: GameState, playerId: PlayerId, combat: CombatState): string {
  // The memo is module-wide and the server hosts many games: combat ids
  // (`combat_<event#>`) and unit ids repeat across tables, so the key carries
  // the game's seed and each body's identity, not only its position/stats.
  const units = Object.values(combat.units)
    .map(unit => `${unit.id}:${unit.controllerId}:${unit.unitDefId ?? ""}:${unit.type}:${unit.position}:${unit.damage}:` +
      `${unit.maxHealth}:${unit.armyStacks ?? 0}:${unit.variant}:${unit.attack}:${unit.defense}:${unit.initiative}:` +
      `${unit.abilities.join(".")}`)
    .sort().join("|");
  const hero = combat.context.kind === "neutral" ? state.heroes[combat.context.heroId] : undefined;
  const hand = [...(state.players[playerId]?.hand ?? [])].sort().join(",");
  const stack = (state.stack ?? []).map(item => item.action.type === "CAST_SPELL"
    ? `${item.action.playerId}:${item.action.cardId}:${JSON.stringify(item.action.target ?? null)}:${JSON.stringify(item.modifiers ?? {})}` : item.action.type).join(";");
  return `${state.seed}|${playerId}|${combat.id}|${combat.geometry ?? "grid"}|${combat.round}|${combat.awaitingContinue ? 1 : 0}|` +
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
  // A Stack Token's survivors change printed stats mid-fight; do not guess.
  if (living.some(unit => unit.stackToken)) return null;
  const own = living.filter(unit => unit.controllerId === playerId);
  const foes = living.filter(unit => unit.controllerId !== playerId);
  if (!own.length || !foes.length || own.length + foes.length > 12) return null;
  const rounds = options.rounds ?? roundsLeft(state, combat);
  const placed = living.every(unit => unit.position >= 0);

  const sims: SimUnit[] = living.map(unit => {
    const { phases, health } = phasesOf(unit);
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
      phase: 0, health: health[0], alive: true, retaliated: false, engagedBy: null,
    };
  });
  const order = [...sims].sort((a, b) => b.initiative - a.initiative || Number(b.own) - Number(a.own) || a.id.localeCompare(b.id));
  const table = new Map<string, number[]>();
  const damageFaces = (attacker: SimUnit, defender: SimUnit, retaliation: boolean): number[] => {
    const key = `${attacker.id}:${attacker.phase}>${defender.id}:${defender.phase}:${retaliation ? 1 : 0}`;
    let faces = table.get(key);
    if (!faces) {
      const a = attacker.phases[attacker.phase];
      const d = defender.phases[defender.phase];
      faces = plannedAttackFaces(state, a, d, a.position, retaliation)
        .map(face => estimatedStrikeDamage(a, d, a.position, retaliation, face));
      table.set(key, faces);
    }
    return faces;
  };
  const mean = (faces: number[]) => faces.reduce((sum, value) => sum + value, 0) / faces.length;
  const hand = options.hand ?? state.players[playerId]?.hand ?? [];
  const heldPower = heldCombatCards(hand).power;
  // A prospective (pre-reveal) board has no stack of its own.
  const pending = options.hand ? { hits: [], powerSpent: 0 } : pendingOwnSpellHits(state, playerId, combat, heldPower);
  const held = heldCombatCards(hand, pending.powerSpent);
  const samples = options.samples ?? FORECAST_SAMPLES;

  let wins = 0;
  let losses = 0;
  const random = seededRandom(`${combat.id}|${combat.round}`);
  for (let sample = 0; sample < samples; sample += 1) {
    for (const sim of sims) {
      sim.phase = 0; sim.health = sim.phaseHealth[0]; sim.alive = true; sim.engagedBy = null;
    }
    const spells = [...held.spells];
    const attackCards = [...held.attack];
    const defenseCards = [...held.defense];
    const hit = (target: SimUnit, amount: number) => {
      if (amount <= 0 || !target.alive) return;
      if (amount < target.health) { target.health -= amount; return; }
      if (target.phase + 1 < target.phases.length) {
        target.phase += 1;
        target.health = target.phaseHealth[target.phase];
      } else {
        target.alive = false;
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
          const physical = Math.max(0, ...bodies.map(body => mean(damageFaces(body, foe, false))));
          const kills = spell >= foe.health && foe.phase + 1 >= foe.phases.length;
          const value = foe.threat * Math.min(1, spell / Math.max(1, foe.health)) *
            (kills ? 2 : 1) * (physical < 1.5 ? 1.6 : 1);
          if (value > bestValue) { bestValue = value; best = foe; }
        }
        if (best) hit(best, spell);
      }
      for (const actor of order) {
        if (!actor.alive || (round === 1 && !actor.reachesRoundOne)) continue;
        const targets = sims.filter(unit => unit.own !== actor.own && unit.alive);
        if (!targets.length) break;
        let target: SimUnit;
        if (actor.own) {
          target = targets[0];
          let bestScore = Number.NEGATIVE_INFINITY;
          for (const candidate of targets) {
            const expected = mean(damageFaces(actor, candidate, false));
            const lethal = expected >= candidate.health && candidate.phase + 1 >= candidate.phases.length;
            const score = (lethal ? 1_000 : 0) + candidate.threat * Math.min(1, expected / Math.max(1, candidate.health));
            if (score > bestScore) { bestScore = score; target = candidate; }
          }
        } else {
          // Closest-target script: the melee body engaging it, else our front.
          const engaged = actor.engagedBy?.alive ? actor.engagedBy : null;
          const front = targets.filter(unit => !unit.ranged);
          const pool = front.length ? front : targets;
          target = engaged ?? pool[Math.floor(random() * pool.length)];
        }
        const faces = damageFaces(actor, target, false);
        let damage = faces[Math.floor(random() * faces.length)];
        // A held statistic card is spent where it changes the strike's result:
        // Attack turns a wound into a flip/removal, Defense saves one.
        if (actor.own && attackCards.length && damage < target.health &&
            damage + attackCards[0] >= target.health) damage += attackCards.shift()!;
        if (!actor.own && defenseCards.length && damage >= target.health &&
            damage - defenseCards[0] < target.health) damage -= defenseCards.shift()!;
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
        if (!actor.ranged) target.engagedBy = actor;
        if (target.alive && !actor.ranged && !target.retaliated) {
          target.retaliated = true;
          const back = damageFaces(target, actor, true);
          hit(actor, back[Math.floor(random() * back.length)]);
        }
      }
      if (!sims.some(unit => !unit.own && unit.alive) || !sims.some(unit => unit.own && unit.alive)) break;
    }
    if (!sims.some(unit => !unit.own && unit.alive)) wins += 1;
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
  const key = `prior|${state.seed}|${playerId}|${field.spaceId}|${difficulty}|${scenario}|${rounds}|${hex}|` +
    `${(field.customGuardUnits ?? []).join(",")}|${field.customGuardPackFaction ?? ""}|` +
    `${army.map(unit => `${unit.unitDefId}:${unit.side}:${unit.stacks ?? 0}:${unit.permanentAttackBonus ?? 0}:` +
      `${unit.permanentHealthBonus ?? 0}:${unit.experience ?? 0}:${unit.job ?? ""}:${unit.transforms?.length ?? 0}`).join(",")}|` +
    `${[...hand].sort().join(",")}`;
  if (memo.has(key)) return memo.get(key)!;
  const ruleset = getRuleset(state);
  const overrides = unitSideRuleOverrides(state);
  const own = army.flatMap((unit, index) => {
    const made = makeCombatUnitFromArmy(unit, playerId, `own-${index}`, index, ruleset, overrides);
    return made ? [made] : [];
  });
  let win = 0;
  let losses = 0;
  let parties = 0;
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
      hand, rounds, meleeReachesRoundOne: !hex, samples: PRIOR_SAMPLES,
    });
    if (!result) continue;
    win += result.winChance;
    losses += result.expectedOwnLosses;
    parties += 1;
  }
  const forecast = parties ? { winChance: win / parties, expectedOwnLosses: losses / parties, rounds } : null;
  if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string);
  memo.set(key, forecast);
  return forecast;
}
