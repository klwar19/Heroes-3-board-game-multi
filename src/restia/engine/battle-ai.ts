import type { AiCondition, AiStyle, BattleAnim, BattleProp, BattleState, BattleUnit, RestiaState, SkillDef } from "./types";
import { MONSTERS } from "../data/monsters";
import { SKILLS } from "../data/skills";
import { Ctx, chance, fail, random } from "./core";
import { hexDistance } from "./hex";
import { heightOf } from "./battle-field";
import { pv } from "./passives";
import {
  CHARGE_CARRY,
  activeUnit,
  applySkill,
  attackBlock,
  basicAttack,
  chargeAction,
  damageProp,
  defendAction,
  doMove,
  eff,
  expectedDamage,
  finishTurn,
  hasStatus,
  living,
  reachable,
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
 * predictable, and the best plan is played. Boards are 11x7, so this stays cheap.
 */

type Act =
  | { kind: "attack"; target: BattleUnit }
  | { kind: "prop"; prop: BattleProp }
  | { kind: "skill"; skill: SkillDef; cell: number; hits: SkillHits }
  | { kind: "defend" };

type Plan = { score: number; cell: number; path: number[]; act: Act };

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
      return foes.filter((foe) => hexDistance(foe.cell, unit.cell) <= condition.range).length >= condition.count;
    case "adjacentFoe":
      return foes.some((foe) => hexDistance(foe.cell, unit.cell) === 1);
    case "noAdjacentFoe":
      return !foes.some((foe) => hexDistance(foe.cell, unit.cell) === 1);
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

/** How good it is to end the turn on `cell` (hazards, springs, height, distance). */
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
  if (heightOf(battle, cell) > 0) score += ranged ? 6 : 2;
  if (tile === "cover" && ranged) score += 5;
  const foes = foesOf(battle, unit);
  const nearest = foes.length ? Math.min(...foes.map((foe) => hexDistance(foe.cell, cell))) : 0;
  if (ranged && nearest === 1) score -= 8;
  if ((style === "coward" && hp < 0.4) || style === "support") score += Math.min(nearest, 4) * 1.5;
  if (style === "tank") {
    const hurt = friendsOf(battle, unit).filter((ally) => ally !== unit && ally.hp / ally.stats.maxHp < 0.6);
    for (const ally of hurt) if (hexDistance(ally.cell, cell) <= 1) score += 3;
  }
  return score;
}

function attackValue(state: RestiaState, battle: BattleState, unit: BattleUnit, target: BattleUnit, from: number, style: AiStyle): number {
  const distance = hexDistance(from, target.cell);
  const ranged = unit.range > 1 && distance > 1;
  const damage = expectedDamage(state, unit, target, 1, unit.element, !unit.magic, unit.range > 1 && distance === 1, ranged);
  let score = damage + (damage >= target.hp + target.shield ? 40 : 0) + (1 - target.hp / target.stats.maxHp) * 10;
  if (distance === 1 && !target.retaliated && !target.down && !pv(unit).noRetaliation) {
    score -= expectedDamage(state, target, unit, pv(target).counter, target.element, !target.magic, false) * (pv(target).firstStrike ? 0.7 : 0.4);
  }
  if (style === "swarmer") score += friendsOf(battle, unit).filter((ally) => ally !== unit && hexDistance(ally.cell, target.cell) === 1).length * 4;
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
    if (hexDistance(other.cell, prop.cell) > 1) continue;
    value += other.side === unit.side ? -blast : Math.min(blast, other.hp) + (blast >= other.hp ? 30 : 0);
  }
  void state;
  return value;
}

function skillValue(state: RestiaState, battle: BattleState, unit: BattleUnit, skill: SkillDef, hits: SkillHits, style: AiStyle): number {
  const foes = foesOf(battle, unit);
  let value = 0;
  for (const target of hits.units) {
    if (skill.kind === "physical" || skill.kind === "magic") {
      const ranged = hexDistance(unit.cell, target.cell) > 1;
      const damage = expectedDamage(state, unit, target, skill.power ?? 1, skill.element ?? unit.element, skill.kind === "physical", false, ranged) * (skill.hits ?? 1);
      value += damage + (damage >= target.hp + target.shield ? 40 : 0);
      if (skill.status && !pv(target).immune.includes(skill.status.id)) value += 12 * skill.status.chance;
      if (skill.knockback && !target.boss) value += 4;
    } else if (skill.kind === "heal") {
      const missing = target.stats.maxHp - target.hp;
      if (target.hp < target.stats.maxHp * 0.7) value += Math.min(missing, (skill.power ?? 1) * (eff(state, unit, "mag") + unit.level * 2)) * 1.2;
      if (skill.cure) value += target.statuses.filter((status) => status.id !== "regen" && status.id !== "haste").length * 8;
    } else if (skill.kind === "buff") {
      const fresh = (skill.mods ?? []).some((mod) => !target.mods.some((existing) => existing.stat === mod.stat && existing.pct > 0));
      const statusFresh = skill.status ? !hasStatus(target, skill.status.id) : false;
      if ((fresh || statusFresh) && foes.some((foe) => hexDistance(foe.cell, target.cell) <= 6)) value += 12;
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
    value += foes.filter((foe) => hexDistance(foe.cell, unit.cell) <= 2 && !hasStatus(foe, "taunt")).length * (hurt ? 12 : 6);
  }
  if (skill.terrain === "fire") value += hits.units.length * 5;
  if (value <= 0) return 0;
  const styleMult = style === "support" && (skill.kind === "heal" || skill.kind === "buff") ? 1.5 : style === "caster" && skill.kind === "magic" ? 1.2 : style === "boss" ? 1.2 : 1;
  return value * styleMult - skillMp(unit, skill) * 0.3;
}

/** Every useful thing `skill` can do from `from`. */
function skillPlans(state: RestiaState, battle: BattleState, unit: BattleUnit, skill: SkillDef, from: number, style: AiStyle): { score: number; cell: number; hits: SkillHits }[] {
  const saved = unit.cell;
  unit.cell = from;
  const out: { score: number; cell: number; hits: SkillHits }[] = [];
  const foes = foesOf(battle, unit);
  const taunt = tauntedBy(battle, unit);
  const centers =
    skill.target === "enemy" || skill.target === "area"
      ? skill.range === 0
        ? [from]
        : [...(taunt && skill.target === "enemy" ? [taunt] : foes).map((foe) => foe.cell), ...battle.props.filter((prop) => prop.kind === "barrel" && prop.hp > 0).map((prop) => prop.cell)]
      : skill.target === "ally"
        ? friendsOf(battle, unit).map((ally) => ally.cell)
        : [from];
  for (const center of new Set(centers)) {
    const hits = skillTargets(state, battle, unit, skill, center);
    if (typeof hits === "string") continue;
    const score = skillValue(state, battle, unit, skill, hits, style);
    if (score > 0) out.push({ score, cell: center, hits });
  }
  unit.cell = saved;
  return out;
}

function usable(unit: BattleUnit, skill: SkillDef): boolean {
  return unit.skills.includes(skill.id) && !hasStatus(unit, "silence") && unit.mp >= skillMp(unit, skill) && skill.kind !== "analyze" && skill.kind !== "revive";
}

function plansFrom(state: RestiaState, battle: BattleState, unit: BattleUnit, from: number, path: number[], style: AiStyle, only?: SkillDef | "attack"): Plan[] {
  const plans: Plan[] = [];
  const place = placeScore(state, battle, unit, from, style) - path.length * 0.2;
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
    for (const plan of skillPlans(state, battle, unit, skill, from, style)) {
      plans.push({ score: plan.score + place, cell: from, path, act: { kind: "skill", skill, cell: plan.cell, hits: plan.hits } });
    }
  }
  return plans;
}

function bestPlan(state: RestiaState, battle: BattleState, unit: BattleUnit, options: Map<number, number[]>, style: AiStyle, only?: SkillDef | "attack"): Plan | null {
  let best: Plan | null = null;
  for (const [cell, path] of options) {
    for (const plan of plansFrom(state, battle, unit, cell, path, style, only)) {
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
    anims.push({ kind: "attack", uid: unit.uid, target: act.prop.uid, anim: unit.range > 1 && hexDistance(unit.cell, act.prop.cell) > 1 ? "shoot" : "attack" });
    if (unit.range > 1 && hexDistance(unit.cell, act.prop.cell) > 1) anims.push({ kind: "projectile", from: unit.cell, to: act.prop.cell, sprite: "arrow" });
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
    const nearest = foes.length ? Math.min(...foes.map((foe) => hexDistance(foe.cell, cell))) : 0;
    const score = nearest * 3 + placeScore(state, battle, unit, cell, "coward");
    if (!best || score > best.score) best = { path, score };
  }
  return best?.path ?? null;
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
  const rules = unit.kind === "monster" ? MONSTERS[unit.ref]?.ai?.rules ?? [] : [];
  let done = false;
  for (const rule of rules) {
    if (done) break;
    if (!rule.when.every((condition) => conditionHolds(state, battle, unit, condition))) continue;
    const action = rule.do;
    if (action === "attack") {
      const plan = bestPlan(state, battle, unit, options, style, "attack");
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
      const plan = bestPlan(state, battle, unit, options, style, skill);
      if (!plan) continue;
      execute(state, battle, unit, plan, anims, ctx);
      done = true;
    }
  }
  if (!done) {
    const plan = bestPlan(state, battle, unit, options, style);
    if (plan && plan.score > 1) {
      execute(state, battle, unit, plan, anims, ctx);
    } else if (style === "coward" && unit.hp < unit.stats.maxHp * 0.4) {
      const path = retreatCell(state, battle, unit, options);
      if (path && path.length) doMove(state, battle, unit, path, anims, ctx);
    } else {
      // Close in (ranged units keep to their reach), avoiding marked and burning hexes.
      const foes = foesOf(battle, unit);
      const want = unit.range > 1 ? unit.range : 1;
      let target: { path: number[]; score: number } | null = null;
      for (const [cell, path] of options) {
        if (!foes.length) break;
        const nearest = Math.min(...foes.map((foe) => hexDistance(cell, foe.cell)));
        const score = Math.abs(nearest - want) * 10 + nearest + path.length * 0.01 - placeScore(state, battle, unit, cell, style) * 0.5;
        if (!target || score < target.score) target = { path, score };
      }
      if (target && target.path.length) doMove(state, battle, unit, target.path, anims, ctx);
    }
  }
  battle.turn.acted = true;
  if (battle.phase === "turn") finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

