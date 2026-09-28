import type { BattleUnit, Element, PassiveDef, StatKey, StatusId } from "./types";
import { PASSIVES } from "../data/passives";

/** Everything a unit's passives add up to (see PassiveDef for the meaning of each field). */
export type PassiveSum = {
  stats: Partial<Record<StatKey, number>>;
  lowHp: { below: number; stats: Partial<Record<StatKey, number>> }[];
  ap: number;
  move: number;
  range: number;
  regen: number;
  mpRegen: number;
  onHit: { status: StatusId; chance: number; turns: number }[];
  lifesteal: number;
  thorns: number;
  counter: number;
  firstStrike: boolean;
  noRetaliation: boolean;
  pack: number;
  backstab: number;
  elementBoost: Partial<Record<Element, number>>;
  immune: StatusId[];
  evasion: number;
  crit: number;
  critDamage: number;
  shieldStart: number;
  deathBurst: PassiveDef["deathBurst"] | null;
  undying: boolean;
  highGround: number;
  healBoost: number;
  mpSave: number;
  aura: Partial<Record<StatKey, number>>;
  sureFooted: boolean;
};

function add(target: Partial<Record<StatKey, number>>, from: Partial<Record<StatKey, number>> | undefined): void {
  for (const [key, value] of Object.entries(from ?? {})) target[key as StatKey] = (target[key as StatKey] ?? 0) + (value ?? 0);
}

export function sumPassives(ids: readonly string[]): PassiveSum {
  const sum: PassiveSum = {
    stats: {},
    lowHp: [],
    ap: 0,
    move: 0,
    range: 0,
    regen: 0,
    mpRegen: 0,
    onHit: [],
    lifesteal: 0,
    thorns: 0,
    counter: 0.5,
    firstStrike: false,
    noRetaliation: false,
    pack: 0,
    backstab: 0,
    elementBoost: {},
    immune: [],
    evasion: 0,
    crit: 0,
    critDamage: 0,
    shieldStart: 0,
    deathBurst: null,
    undying: false,
    highGround: 0,
    healBoost: 0,
    mpSave: 0,
    aura: {},
    sureFooted: false
  };
  for (const id of ids) {
    const def = PASSIVES[id];
    if (!def) continue;
    add(sum.stats, def.stats);
    if (def.lowHp) sum.lowHp.push(def.lowHp);
    sum.ap += def.ap ?? 0;
    sum.move += def.move ?? 0;
    sum.range += def.range ?? 0;
    sum.regen += def.regen ?? 0;
    sum.mpRegen += def.mpRegen ?? 0;
    if (def.onHit) sum.onHit.push(def.onHit);
    sum.lifesteal += def.lifesteal ?? 0;
    sum.thorns += def.thorns ?? 0;
    if (def.counter !== undefined) sum.counter = Math.max(sum.counter, def.counter);
    sum.firstStrike ||= !!def.firstStrike;
    sum.noRetaliation ||= !!def.noRetaliation;
    sum.pack += def.pack ?? 0;
    sum.backstab += def.backstab ?? 0;
    if (def.elementBoost) sum.elementBoost[def.elementBoost.element] = (sum.elementBoost[def.elementBoost.element] ?? 0) + def.elementBoost.pct;
    for (const status of def.immune ?? []) if (!sum.immune.includes(status)) sum.immune.push(status);
    sum.evasion += def.evasion ?? 0;
    sum.crit += def.crit ?? 0;
    sum.critDamage += def.critDamage ?? 0;
    sum.shieldStart = Math.max(sum.shieldStart, def.shieldStart ?? 0);
    if (def.deathBurst && (!sum.deathBurst || def.deathBurst.power > sum.deathBurst.power)) sum.deathBurst = def.deathBurst;
    sum.undying ||= !!def.undying;
    sum.highGround += def.highGround ?? 0;
    sum.healBoost += def.healBoost ?? 0;
    sum.mpSave += def.mpSave ?? 0;
    add(sum.aura, def.aura);
    sum.sureFooted ||= !!def.sureFooted;
  }
  sum.mpSave = Math.min(50, sum.mpSave);
  sum.evasion = Math.min(0.4, sum.evasion);
  return sum;
}

// Units are cloned on every dispatch, so caching by the passives array is safe and cheap.
const cache = new WeakMap<readonly string[], PassiveSum>();

export function pv(unit: BattleUnit): PassiveSum {
  let sum = cache.get(unit.passives);
  if (!sum) {
    sum = sumPassives(unit.passives);
    cache.set(unit.passives, sum);
  }
  return sum;
}
