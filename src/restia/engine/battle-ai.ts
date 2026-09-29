import type { AiCondition, AiStyle, BattleAnim, BattleProp, BattleState, BattleUnit, RestiaState, SkillDef } from "./types";
import { MONSTERS } from "../data/monsters";
import { SKILLS } from "../data/skills";
import { Ctx, chance, fail, random } from "./core";
import { cellsAt, cellsOf, distanceTo, nearestPair, unitDistance } from "./footprint";
import { heightOf } from "./battle-field";
import { BOARD_CELLS, hexDistance, neighbors } from "./hex";
import { pv } from "./passives";
import {
  CHARGE_CARRY,
  activeUnit,
  applySkill,
  attackBlock,
  basicAttack,
  canStandAt,
  chargeAction,
  damageProp,
  defendAction,
  doMove,
  eff,
  expectedDamage,
  finishTurn,
  footprintStep,
  hasStatus,
  living,
  reachable,
  shapePlan,
  skillAp,
  skillMp,
  skillTargets,
  tauntedBy,
  type SkillHits
} from "./battle";

/**
 * Enemy turns. A monster's own rules (data/monsters.ts `ai.rules`) are tried
 * top-down; a rule whose skill can't be paid for yet is skipped so a following
 * "charge" rule can build the AP. Otherwise every reachable hex x action is
 * scored with the monster's style, a little seeded noise keeps it from being
 * predictable, and the best plan is played. Boards are at most 19x11 and moves
 * a few hexes, so this stays cheap.
 */

type Act =
  | { kind: "attack"; target: BattleUnit }
  | { kind: "prop"; prop: BattleProp }
  | { kind: "skill"; skill: SkillDef; cell: number; hits: SkillHits }
  | { kind: "defend" };

type Plan = { score: number; cell: number; path: number[]; act: Act };

/** This turn's starting hex, and whether a basic attack can land from anywhere the unit can walk to. */
type TurnView = { start: number; engage: boolean };

/** Where a skill leaves its user's head: the landing hex (leap, blink), the end of the run (dash), else where it stands. */
function skillEnd(skill: SkillDef, cell: number, hits: SkillHits, from: number): number {
  if (skill.move === "leap" || skill.move === "blink") return cell;
  if (skill.move === "dash" && hits.path?.length) return hits.path[hits.path.length - 1]!;
  return from;
}

/** Keeps its distance: shooters, casters, supports and cowards. */
function keepsAway(unit: BattleUnit, style: AiStyle): boolean {
  return unit.range > 1 || style === "sniper" || style === "caster" || style === "support" || style === "coward";
}

/**
 * What ending a leap, blink or dash on `end` is worth beyond the blow itself
 * (hazards, springs and height count through placeScore): distance-keepers
 * value getting out of reach of a foe that was next to them at the start of
 * the turn and dislike landing next to one; everyone else values closing in
 * when no basic attack could land this turn anyway. Landing on thorns hurts.
 */
function moveValue(battle: BattleState, unit: BattleUnit, end: number, style: AiStyle, turn: TurnView): number {
  const foes = foesOf(battle, unit);
  if (!foes.length) return 0;
  const near = (cell: number) => Math.min(...foes.map((foe) => unitDistance(unit, foe, cell)));
  const before = near(turn.start);
  const after = near(end);
  let value = 0;
  if (keepsAway(unit, style)) {
    if (before === 1 && after > 1) value += 12 + Math.min(after, 4) * 2;
    if (after === 1) value -= 10;
    // ...but stays close enough to act next turn.
    value -= Math.max(0, after - (Math.max(unit.range, 2) + 3)) * 2;
  } else if (!turn.engage) {
    value += Math.max(0, before - after) * 1.5;
  }
  if (!unit.flying && !pv(unit).sureFooted && cellsAt(unit, end).some((cell) => battle.tiles[cell] === "thorns")) value -= 4;
  return value;
}

/**
 * Ground shaping: raising the hexes under friends (more for shooters) and
 * sinking foes (their fall damage too) is good, the reverse is bad. Mirrors
 * shapeGround: a two-hex body moves with either of its hexes, or not at all.
 */
function shapeValue(battle: BattleState, unit: BattleUnit, skill: SkillDef, hits: SkillHits): number {
  if (!skill.shape) return 0;
  const cells = new Set(hits.cells);
  for (const other of living(battle)) if (other.wide && cellsOf(other).some((cell) => cells.has(cell))) for (const cell of cellsOf(other)) cells.add(cell);
  const plan = shapePlan(battle, [...cells], skill.shape);
  let value = 0;
  for (const other of living(battle)) {
    if (other.wide && !cellsOf(other).every((cell) => plan.has(cell))) continue;
    const to = plan.get(other.cell);
    if (to === undefined) continue;
    const levels = to - heightOf(battle, other.cell);
    const sign = other.side === unit.side ? 1 : -1;
    const perLevel = other.range > 1 ? 6 : 3;
    if (levels > 0) value += sign * levels * perLevel;
    else if (levels < 0) value -= sign * (-levels * perLevel + (other.flying || other.boss ? 0 : other.stats.maxHp * 0.1 * -levels));
  }
  return value;
}

/**
 * Hexes worth aiming a 'hex' skill at from where the unit stands. Leaps and
 * blinks: landing hexes in range where the whole body fits; damaging ones only
 * where the landing strike reaches a foe (the taunter, when taunted), the rest
 * anywhere (repositioning; none while taunted). Other hex skills: raising
 * ground goes under friends, anything else at foes (or friends, if friendly).
 */
function hexCenters(battle: BattleState, unit: BattleUnit, skill: SkillDef, foes: BattleUnit[], taunt: BattleUnit | null): number[] {
  const hostile = skill.kind === "physical" || skill.kind === "magic" || skill.kind === "debuff";
  if (skill.move === "leap" || skill.move === "blink") {
    if (!hostile && taunt) return [];
    const radius = skill.radius ?? 0;
    const targets = taunt ? [taunt] : foes;
    const out: number[] = [];
    for (let cell = 0; cell < BOARD_CELLS; cell++) {
      if (cell === unit.cell || distanceTo(unit, cell) > skill.range || !canStandAt(battle, unit, cell)) continue;
      if (hostile) {
        const landing = cellsAt(unit, cell);
        if (!targets.some((foe) => { const [a, b] = nearestPair(landing, cellsOf(foe)); return hexDistance(a, b) <= radius; })) continue;
      }
      out.push(cell);
    }
    return out;
  }
  if ((skill.shape ?? 0) > 0) return friendsOf(battle, unit).flatMap((ally) => cellsOf(ally));
  return (hostile ? (taunt ? [taunt] : foes) : friendsOf(battle, unit)).flatMap((other) => cellsOf(other));
}

function styleOf(unit: BattleUnit): AiStyle {
  const def = unit.kind === "monster" ? MONSTERS[unit.ref] : undefined;
  if (def?.ai) return def.ai.style;
  if (unit.boss) return "boss";
  return unit.range > 1 ? (unit.magic ? "caster" : "sniper") : "aggressive";
}

function foesOf(battle: BattleState, unit: BattleUnit): BattleUnit[] {
  return living(battle).filter((entry) => entry.side !== unit.side);
}

function friendsOf(battle: BattleState, unit: BattleUnit): BattleUnit[] {
  return living(battle).filter((entry) => entry.side === unit.side);
}

function conditionHolds(state: RestiaState, battle: BattleState, unit: BattleUnit, condition: AiCondition): boolean {
  const hp = unit.hp / unit.stats.maxHp;
  const foes = foesOf(battle, unit);
  const friends = friendsOf(battle, unit);
  switch (condition.kind) {
    case "hpBelow":
      return hp < condition.value;
    case "hpAbove":
      return hp > condition.value;
    case "allyHurt":
      return friends.some((ally) => ally.hp / ally.stats.maxHp < condition.value);
    case "foesInRange":
      return foes.filter((foe) => unitDistance(foe, unit) <= condition.range).length >= condition.count;
    case "adjacentFoe":
      return foes.some((foe) => unitDistance(foe, unit) === 1);
    case "noAdjacentFoe":
      return !foes.some((foe) => unitDistance(foe, unit) === 1);
    case "round":
      return battle.round >= condition.from;
    case "firstTurn":
      return battle.round === 1;
    case "alone":
      return friends.length === 1;
    case "outnumbered":
      return foes.length > friends.length;
    case "selfLacks":
      return !hasStatus(unit, condition.status);
    case "chance":
      return chance(state, condition.value);
  }
}

/**
 * Ending the turn on a shrine or banner this side doesn't hold captures it:
 * worth a little (a shrine more when hurt, taking one from the foe a bit more),
 * always well below a kill or a solid hit.
 */
function pointScore(battle: BattleState, unit: BattleUnit, cell: number): number {
  let score = 0;
  const footprint = cellsAt(unit, cell);
  for (const point of battle.points ?? []) {
    if (point.kind === "cache" || point.owner === unit.side || !footprint.includes(point.cell)) continue;
    score += (point.kind === "shrine" ? 4 + (1 - unit.hp / unit.stats.maxHp) * 8 : 5) + (point.owner ? 2 : 0);
  }
  return score;
}

/** Walking through an unopened supply cache: a monster smashes it (denies the party its loot). */
function cacheScore(battle: BattleState, unit: BattleUnit, path: number[]): number {
  if (!path.length || !battle.points?.some((point) => point.kind === "cache" && !point.used)) return 0;
  const crossed = new Set(path.flatMap((cell) => cellsAt(unit, cell)));
  return (battle.points ?? []).filter((point) => point.kind === "cache" && !point.used && crossed.has(point.cell)).length * 3;
}

/** How good it is to end the turn on `cell` (hazards, springs, height, objectives, distance). */
function placeScore(state: RestiaState, battle: BattleState, unit: BattleUnit, cell: number, style: AiStyle): number {
  let score = 0;
  const tile = battle.tiles[cell];
  const grounded = !unit.flying && !pv(unit).sureFooted;
  const hp = unit.hp / unit.stats.maxHp;
  if (battle.warnings.includes(cell)) score -= 25;
  if (tile === "fire" && grounded) score -= 12;
  if (tile === "spring") score += (1 - hp) * 18;
  if (tile === "crystal") score += 4;
  const ranged = unit.range > 1 || style === "sniper" || style === "caster" || style === "support";
  score += heightOf(battle, cell) * (ranged ? 5 : 2);
  if (tile === "cover" && ranged) score += 5;
  score += pointScore(battle, unit, cell);
  const foes = foesOf(battle, unit);
  const nearest = foes.length ? Math.min(...foes.map((foe) => unitDistance(unit, foe, cell))) : 0;
  if (ranged && nearest === 1) score -= 8;
  if ((style === "coward" && hp < 0.4) || style === "support") score += Math.min(nearest, 4) * 1.5;
  if (style === "tank") {
    const hurt = friendsOf(battle, unit).filter((ally) => ally !== unit && ally.hp / ally.stats.maxHp < 0.6);
    for (const ally of hurt) if (unitDistance(unit, ally, cell) <= 1) score += 3;
  }
  return score;
}

function attackValue(state: RestiaState, battle: BattleState, unit: BattleUnit, target: BattleUnit, from: number, style: AiStyle): number {
  const distance = unitDistance(unit, target, from);
  const ranged = unit.range > 1 && distance > 1;
  const damage = expectedDamage(state, unit, target, 1, unit.element, !unit.magic, unit.range > 1 && distance === 1, ranged);
  let score = damage + (damage >= target.hp + target.shield ? 40 : 0) + (1 - target.hp / target.stats.maxHp) * 10;
  if (distance === 1 && !target.retaliated && !target.down && !pv(unit).noRetaliation) {
    score -= expectedDamage(state, target, unit, pv(target).counter, target.element, !target.magic, false) * (pv(target).firstStrike ? 0.7 : 0.4);
  }
  if (style === "swarmer") score += friendsOf(battle, unit).filter((ally) => ally !== unit && unitDistance(ally, target) === 1).length * 4;
  if (style === "aggressive" || style === "boss") score *= 1.1;
  return score;
}

/** Blowing up a barrel next to the party. */
function barrelValue(state: RestiaState, battle: BattleState, unit: BattleUnit, prop: BattleProp): number {
  if (prop.kind !== "barrel") return 0;
  const level = Math.max(1, ...battle.units.map((entry) => entry.level));
  const blast = (18 + 3 * level) * 1.2;
  let value = 0;
  for (const other of living(battle)) {
    if (distanceTo(other, prop.cell) > 1) continue;
    value += other.side === unit.side ? -blast : Math.min(blast, other.hp) + (blast >= other.hp ? 30 : 0);
  }
  void state;
  return value;
}

/**
 * `boost`: power multiplier the forecast can't see (a dash's run); `fromHeight`:
 * the height the skill began at (leaps keep their drop for `heightPower`).
 */
function skillValue(state: RestiaState, battle: BattleState, unit: BattleUnit, skill: SkillDef, hits: SkillHits, style: AiStyle, boost = 1, fromHeight = heightOf(battle, unit.cell)): number {
  const foes = foesOf(battle, unit);
  let value = 0;
  for (const target of hits.units) {
    if (skill.kind === "physical" || skill.kind === "magic") {
      const ranged = unitDistance(unit, target) > 1;
      const drop = skill.heightPower ? 1 + skill.heightPower * Math.max(0, fromHeight - heightOf(battle, target.cell)) : 1;
      const damage = expectedDamage(state, unit, target, (skill.power ?? 1) * boost * drop, skill.element ?? unit.element, skill.kind === "physical", false, ranged) * (skill.hits ?? 1);
      value += damage + (damage >= target.hp + target.shield ? 40 : 0);
      if (skill.status && !pv(target).immune.includes(skill.status.id)) value += 12 * skill.status.chance;
      if (skill.knockback && !target.boss) value += 4;
      // Dragging a foe in: good for brawlers, a little for others.
      if (skill.pull && !target.boss) value += unit.range > 1 ? 2 : 5;
    } else if (skill.kind === "heal") {
      const missing = target.stats.maxHp - target.hp;
      if (target.hp < target.stats.maxHp * 0.7) value += Math.min(missing, (skill.power ?? 1) * (eff(state, unit, "mag") + unit.level * 2)) * 1.2;
      if (skill.cure) value += target.statuses.filter((status) => status.id !== "regen" && status.id !== "haste").length * 8;
    } else if (skill.kind === "buff") {
      const fresh = (skill.mods ?? []).some((mod) => !target.mods.some((existing) => existing.stat === mod.stat && existing.pct > 0));
      const statusFresh = skill.status ? !hasStatus(target, skill.status.id) : false;
      if ((fresh || statusFresh) && foes.some((foe) => unitDistance(foe, target) <= 6)) value += 12;
    } else if (skill.kind === "debuff") {
      const fresh = (skill.mods ?? []).some((mod) => !target.mods.some((existing) => existing.stat === mod.stat && existing.pct < 0));
      const statusOk = skill.status && !hasStatus(target, skill.status.id) && !pv(target).immune.includes(skill.status.id);
      value += (fresh ? 10 : 0) + (statusOk ? 14 * skill.status!.chance : 0);
    }
    if (skill.shield && target.hp > 0) value += target.hp < target.stats.maxHp * 0.8 ? 14 : 5;
  }
  for (const prop of hits.props) value += barrelValue(state, battle, unit, prop) + (prop.kind === "totem" ? 0 : 1);
  if (skill.taunt) {
    const hurt = friendsOf(battle, unit).some((ally) => ally !== unit && ally.hp < ally.stats.maxHp * 0.6);
    value += foes.filter((foe) => unitDistance(foe, unit) <= 2 && !hasStatus(foe, "taunt")).length * (hurt ? 12 : 6);
  }
  if (skill.terrain === "fire") value += hits.units.length * 5;
  if (skill.terrain === "thorns") value += hits.units.length * 3;
  value += shapeValue(battle, unit, skill, hits);
  if (value <= 0) return 0;
  const styleMult = style === "support" && (skill.kind === "heal" || skill.kind === "buff") ? 1.5 : style === "caster" && skill.kind === "magic" ? 1.2 : style === "boss" ? 1.2 : 1;
  return value * styleMult - skillMp(unit, skill) * 0.3;
}

/**
 * Every useful thing `skill` can do from `from`; `end` is where the unit's head
 * finishes (movement skills). Blows are judged from where they land, dashes
 * with their run bonus; a movement skill adds moveValue, and one that hits
 * nothing must also beat staying on `from` by a clear margin (no wasted turns).
 */
function skillPlans(state: RestiaState, battle: BattleState, unit: BattleUnit, skill: SkillDef, from: number, style: AiStyle, turn: TurnView): { score: number; cell: number; hits: SkillHits; end: number }[] {
  const saved = unit.cell;
  unit.cell = from;
  const out: { score: number; cell: number; hits: SkillHits; end: number }[] = [];
  const foes = foesOf(battle, unit);
  const taunt = tauntedBy(battle, unit);
  const centers =
    skill.target === "enemy" || skill.target === "area"
      ? skill.range === 0
        ? [from]
        : [...(taunt && skill.target === "enemy" ? [taunt] : foes).flatMap((foe) => cellsOf(foe)), ...battle.props.filter((prop) => prop.kind === "barrel" && prop.hp > 0).map((prop) => prop.cell)]
      : skill.target === "ally"
        ? friendsOf(battle, unit).map((ally) => ally.cell)
        : skill.target === "hex"
          ? hexCenters(battle, unit, skill, foes, taunt)
          : [from];
  const fromHeight = heightOf(battle, from);
  for (const center of new Set(centers)) {
    const hits = skillTargets(state, battle, unit, skill, center);
    if (typeof hits === "string") continue;
    if (!skill.move) {
      const score = skillValue(state, battle, unit, skill, hits, style);
      if (score > 0) out.push({ score, cell: center, hits, end: from });
      continue;
    }
    const end = skillEnd(skill, center, hits, from);
    const travelled = skill.move === "dash" ? hits.path?.length ?? 0 : 0;
    unit.cell = end;
    const blow = skillValue(state, battle, unit, skill, hits, style, 1 + 0.15 * travelled, fromHeight);
    unit.cell = from;
    const moved = moveValue(battle, unit, end, style, turn);
    if (hits.units.length || hits.props.length) {
      if (blow + moved > 0) out.push({ score: blow + moved, cell: center, hits, end });
      continue;
    }
    // Nothing to hit: only worth it as a clearly better place to be.
    const gain = moved + placeScore(state, battle, unit, end, style) - placeScore(state, battle, unit, from, style) - skillMp(unit, skill) * 0.3;
    if (skill.kind !== "physical" && skill.kind !== "magic" && gain > 3) out.push({ score: gain + blow, cell: center, hits, end });
  }
  unit.cell = saved;
  return out;
}

function usable(unit: BattleUnit, skill: SkillDef): boolean {
  return unit.skills.includes(skill.id) && !hasStatus(unit, "silence") && unit.mp >= skillMp(unit, skill) && skill.kind !== "analyze" && skill.kind !== "revive";
}

function plansFrom(state: RestiaState, battle: BattleState, unit: BattleUnit, from: number, path: number[], style: AiStyle, turn: TurnView, only?: SkillDef | "attack"): Plan[] {
  const plans: Plan[] = [];
  const place = placeScore(state, battle, unit, from, style) + cacheScore(battle, unit, path) - path.length * 0.2;
  const taunt = tauntedBy(battle, unit);
  if (!only || only === "attack") {
    if (unit.ap >= 1) {
      for (const target of taunt ? [taunt] : foesOf(battle, unit)) {
        if (attackBlock(battle, unit, target, from)) continue;
        plans.push({ score: attackValue(state, battle, unit, target, from, style) + place, cell: from, path, act: { kind: "attack", target } });
      }
      if (!only && !taunt) {
        for (const prop of battle.props) {
          if (prop.kind !== "barrel" || prop.hp <= 0 || attackBlock(battle, unit, prop, from)) continue;
          const value = barrelValue(state, battle, unit, prop);
          if (value > 0) plans.push({ score: value + place, cell: from, path, act: { kind: "prop", prop } });
        }
      }
    }
  }
  const skills = only && only !== "attack" ? [only] : only ? [] : unit.skills.map((id) => SKILLS[id]).filter((skill): skill is SkillDef => !!skill);
  for (const skill of skills) {
    if (!usable(unit, skill) || unit.ap < skillAp(skill)) continue;
    for (const plan of skillPlans(state, battle, unit, skill, from, style, turn)) {
      // Movement skills are judged by where they leave the unit (and what a dash runs over).
      const at = plan.end === from && !plan.hits.path?.length ? place : placeScore(state, battle, unit, plan.end, style) + cacheScore(battle, unit, [...path, ...(plan.hits.path ?? [])]) - path.length * 0.2;
      plans.push({ score: plan.score + at, cell: from, path, act: { kind: "skill", skill, cell: plan.cell, hits: plan.hits } });
    }
  }
  return plans;
}

function bestPlan(state: RestiaState, battle: BattleState, unit: BattleUnit, options: Map<number, number[]>, style: AiStyle, turn: TurnView, only?: SkillDef | "attack"): Plan | null {
  let best: Plan | null = null;
  for (const [cell, path] of options) {
    for (const plan of plansFrom(state, battle, unit, cell, path, style, turn, only)) {
      // Up to +/-10% seeded noise: close calls vary from fight to fight.
      const score = plan.score * (0.9 + random(state) * 0.2);
      if (!best || score > best.score) best = { ...plan, score };
    }
  }
  return best;
}

function execute(state: RestiaState, battle: BattleState, unit: BattleUnit, plan: Plan, anims: BattleAnim[], ctx: Ctx): void {
  doMove(state, battle, unit, plan.path, anims, ctx);
  if (unit.hp <= 0) return;
  const act = plan.act;
  if (act.kind === "attack") {
    // The move may have changed things (hazards); re-check before swinging.
    if (act.target.hp <= 0 || attackBlock(battle, unit, act.target)) return;
    unit.ap -= 1;
    basicAttack(state, battle, unit, act.target, anims, ctx);
    battle.log.push(`${unit.name} attacks ${act.target.name}.`);
  } else if (act.kind === "prop") {
    if (act.prop.hp <= 0 || attackBlock(battle, unit, act.prop)) return;
    unit.ap -= 1;
    anims.push({ kind: "attack", uid: unit.uid, target: act.prop.uid, anim: unit.range > 1 && distanceTo(unit, act.prop.cell) > 1 ? "shoot" : "attack" });
    if (unit.range > 1 && distanceTo(unit, act.prop.cell) > 1) anims.push({ kind: "projectile", from: unit.cell, to: act.prop.cell, sprite: "arrow" });
    damageProp(state, battle, act.prop, eff(state, unit, unit.magic ? "mag" : "atk"), unit.element, anims, ctx);
    battle.log.push(`${unit.name} shoots the powder barrel!`);
  } else if (act.kind === "skill") {
    const hits = skillTargets(state, battle, unit, act.skill, act.cell);
    if (typeof hits === "string" || unit.ap < skillAp(act.skill) || unit.mp < skillMp(unit, act.skill)) return;
    applySkill(state, battle, unit, act.skill, act.cell, hits, anims, ctx);
  } else {
    defendAction(battle, unit, anims);
  }
}

/** Walk as far from the party as possible (preferring springs and cover). */
function retreatCell(state: RestiaState, battle: BattleState, unit: BattleUnit, options: Map<number, number[]>): number[] | null {
  const foes = foesOf(battle, unit);
  let best: { path: number[]; score: number } | null = null;
  for (const [cell, path] of options) {
    const nearest = foes.length ? Math.min(...foes.map((foe) => unitDistance(unit, foe, cell))) : 0;
    const score = nearest * 3 + placeScore(state, battle, unit, cell, "coward");
    if (!best || score > best.score) best = { path, score };
  }
  return best?.path ?? null;
}

/**
 * Movement each hex still is from a spot where this unit's basic attack lands on
 * one of `foes`, going round water, chasms, crags, cliffs and foes the way it
 * really walks (Dijkstra backwards over its own step costs; missing = no way
 * there). Closing in by this, not by straight-line distance, keeps a monster
 * from waiting on a riverbank or under a cliff it can't climb.
 */
function travelField(battle: BattleState, unit: BattleUnit, foes: BattleUnit[]): Map<number, number> {
  const sure = pv(unit).sureFooted;
  const cost = new Map<number, number>();
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    if (canStandAt(battle, unit, cell) && foes.some((foe) => !attackBlock(battle, unit, foe, cell))) cost.set(cell, 0);
  }
  const open = [...cost.keys()];
  while (open.length) {
    let index = 0;
    for (let i = 1; i < open.length; i++) if (cost.get(open[i]!)! < cost.get(open[index]!)!) index = i;
    const cell = open.splice(index, 1)[0]!;
    const here = cost.get(cell)!;
    for (const from of neighbors(cell)) {
      const total = here + footprintStep(battle, unit, from, cell, sure);
      if (!(total < (cost.get(from) ?? Infinity))) continue;
      if (!cost.has(from)) open.push(from);
      cost.set(from, total);
    }
  }
  return cost;
}

/** A skill this unit is saving up for: known, affordable in MP, more AP than it has now. */
function chargeTarget(unit: BattleUnit): SkillDef | null {
  for (const id of unit.skills) {
    const skill = SKILLS[id];
    if (skill && usable(unit, skill) && skillAp(skill) > unit.ap && skillAp(skill) <= unit.ap + CHARGE_CARRY) return skill;
  }
  return null;
}

export function aiTurn(state: RestiaState, ctx: Ctx): void {
  const battle = state.battle;
  if (!battle || battle.phase !== "turn") fail("No battle in progress.");
  const unit = activeUnit(battle);
  if (!unit || unit.side !== "enemy") fail("Not the enemy's turn.");
  const anims: BattleAnim[] = [];
  const style = styleOf(unit);
  const options = new Map<number, number[]>([[unit.cell, []], ...reachable(battle, unit)]);
  const taunter = tauntedBy(battle, unit);
  const turn: TurnView = {
    start: unit.cell,
    engage: [...options.keys()].some((cell) => (taunter ? [taunter] : foesOf(battle, unit)).some((foe) => !attackBlock(battle, unit, foe, cell)))
  };
  const rules = unit.kind === "monster" ? MONSTERS[unit.ref]?.ai?.rules ?? [] : [];
  let done = false;
  for (const rule of rules) {
    if (done) break;
    if (!rule.when.every((condition) => conditionHolds(state, battle, unit, condition))) continue;
    const action = rule.do;
    if (action === "attack") {
      const plan = bestPlan(state, battle, unit, options, style, turn, "attack");
      if (plan) {
        execute(state, battle, unit, plan, anims, ctx);
        done = true;
      }
    } else if (action === "defend") {
      defendAction(battle, unit, anims);
      done = true;
    } else if (action === "charge") {
      const saving = chargeTarget(unit);
      if (!saving) continue;
      chargeAction(battle, unit, anims);
      anims.push({ kind: "banner", text: `${unit.name} is gathering power for ${saving.name}!` });
      battle.log.push(`${unit.name} is gathering power...`);
      done = true;
    } else if (action === "retreat") {
      const path = retreatCell(state, battle, unit, options);
      if (path && path.length) doMove(state, battle, unit, path, anims, ctx);
      if (unit.hp > 0) defendAction(battle, unit, anims);
      done = true;
    } else {
      const skill = SKILLS[action];
      // Unaffordable (AP/MP/silence) or no target: fall through to the next rule.
      if (!skill || !usable(unit, skill) || unit.ap < skillAp(skill)) continue;
      const plan = bestPlan(state, battle, unit, options, style, turn, skill);
      // A movement skill whose best use still leaves the unit somewhere bad is skipped.
      if (!plan || (skill.move && plan.score <= 0)) continue;
      execute(state, battle, unit, plan, anims, ctx);
      done = true;
    }
  }
  if (!done) {
    const plan = bestPlan(state, battle, unit, options, style, turn);
    if (plan && plan.score > 1) {
      execute(state, battle, unit, plan, anims, ctx);
    } else if (style === "coward" && unit.hp < unit.stats.maxHp * 0.4) {
      const path = retreatCell(state, battle, unit, options);
      if (path && path.length) doMove(state, battle, unit, path, anims, ctx);
    } else {
      // Close in (ranged units keep to their reach), avoiding marked and burning hexes.
      const foes = foesOf(battle, unit);
      const want = unit.range > 1 ? unit.range : 1;
      // With a way to a striking spot, the gap is the movement still needed to get there
      // (round water, chasms and cliffs); walled off, the straight-line distance.
      const travel = travelField(battle, unit, taunter ? [taunter] : foes);
      const way = travel.has(unit.cell);
      let target: { path: number[]; score: number } | null = null;
      for (const [cell, path] of options) {
        if (!foes.length) break;
        const nearest = Math.min(...foes.map((foe) => unitDistance(unit, foe, cell)));
        const gap = way ? travel.get(cell) ?? 1e6 : Math.abs(nearest - want);
        // Objectives count in full here: a monster with nothing to hit may detour a hex to take one.
        const score = gap * 10 + nearest + path.length * 0.01 - placeScore(state, battle, unit, cell, style) * 0.5 - pointScore(battle, unit, cell) * 0.5 - cacheScore(battle, unit, path);
        if (!target || score < target.score) target = { path, score };
      }
      if (target && target.path.length) doMove(state, battle, unit, target.path, anims, ctx);
    }
  }
  battle.turn.acted = true;
  if (battle.phase === "turn") finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

