/**
 * Order & Chaos unit forms: the Barracks levels (`kind@N`) and the Ascended
 * forms (`kind^`, or `kind@N^`) a unit takes for a while when the player
 * spends a Valor crown on it. Both are real defender entries registered in
 * DEFENDERS on first use, so every system that reads DEFENDERS[d.kind] (the
 * simulation, the renderer, the popover) sees the scaled numbers.
 */

import { CARDS, DEFENDERS, type DefDef, type DefKind } from "../content";
import { sec } from "../clock";
import { OC_ULTIMATES } from "./roster";

export const OC_MAX_LEVEL = 4;

/** Health and power of a Barracks level: +15% per level. */
export function levelPower(level: number): number {
  return 1 + 0.15 * (Math.max(1, Math.min(OC_MAX_LEVEL, level)) - 1);
}

/** Ascended forms hit 30% harder and are 30% tougher on top of their level. */
export const ASCEND_POWER = 1.3;
/** How long an Ascension lasts (Helm of Heavenly Enlightenment: half as long again). */
export const ASCEND_TICKS = sec(15);
/** Valor (the cost of the foes slain) that earns one Ascension crown. */
export const VALOR_NEED = 30;

/** A unit's numbers scaled by `p` (health, damage, healing, income). */
function scaleDef(base: DefDef, p: number): DefDef {
  const n = (value: number) => Math.round(value * p);
  return {
    ...base,
    hp: n(base.hp),
    power: p,
    shot: base.shot ? { ...base.shot, dmg: n(base.shot.dmg), splash: base.shot.splash !== undefined ? n(base.shot.splash) : undefined } : undefined,
    melee: base.melee ? { ...base.melee, dmg: n(base.melee.dmg) } : undefined,
    produce: base.produce ? {
      ...base.produce,
      value: base.produce.value > 0 ? Math.round((base.produce.value * p) / 5) * 5 : 0,
      // Compound interest (Yuuka) grows and caps in step with the level.
      grow: base.produce.grow ? { step: Math.round((base.produce.grow.step * p) / 5) * 5, max: Math.round((base.produce.grow.max * p) / 5) * 5 } : undefined
    } : undefined,
    heal: base.heal ? { ...base.heal, amount: n(base.heal.amount) } : undefined,
    lightning: base.lightning ? { ...base.lightning, dmg: n(base.lightning.dmg) } : undefined,
    gaze: base.gaze ? { ...base.gaze, bossDmg: n(base.gaze.bossDmg) } : undefined,
    trap: base.trap ? { ...base.trap, dmg: n(base.trap.dmg) } : undefined,
    spikes: base.spikes ? { ...base.spikes, dmg: n(base.spikes.dmg) } : undefined,
    instant: base.instant ? { ...base.instant, dmg: n(base.instant.dmg) } : undefined,
    snipe: base.snipe ? { ...base.snipe, dmg: n(base.snipe.dmg) } : undefined,
    airstrike: base.airstrike ? { ...base.airstrike, dmg: n(base.airstrike.dmg) } : undefined,
    beam: base.beam ? { ...base.beam, dmg: n(base.beam.dmg) } : undefined,
    pounce: base.pounce ? { ...base.pounce, dmg: n(base.pounce.dmg) } : undefined,
    laneHeal: base.laneHeal ? { ...base.laneHeal, amount: n(base.laneHeal.amount) } : undefined,
    caster: base.caster ? { ...base.caster, dmg: n(base.caster.dmg) } : undefined,
    burnAura: base.burnAura ? { ...base.burnAura, dmg: n(base.burnAura.dmg) } : undefined,
    shellGift: base.shellGift ? { ...base.shellGift, amount: n(base.shellGift.amount) } : undefined,
    chainLightning: base.chainLightning ? { ...base.chainLightning, dmg: n(base.chainLightning.dmg) } : undefined,
    luckyKills: base.luckyKills ? { ...base.luckyKills, value: n(base.luckyKills.value) } : undefined,
    devour: base.devour ? { ...base.devour, bite: n(base.devour.bite) } : undefined,
    lastCharge: base.lastCharge ? { ...base.lastCharge, dmg: n(base.lastCharge.dmg) } : undefined,
    thorns: base.thorns !== undefined ? n(base.thorns) : undefined
  };
}

/** The unit a leveled or ascended kind was raised from (`oc-longbow@3^` -> `oc-longbow`). */
export function baseKind(kind: DefKind): DefKind {
  const cut = kind.search(/[@^]/);
  return cut >= 0 ? kind.slice(0, cut) : kind;
}

/** The Barracks level baked into a kind (1 when none). */
export function kindLevel(kind: DefKind): number {
  return DEFENDERS[kind]?.level ?? 1;
}

/**
 * The defender (and card) for a unit at a Barracks level: a scaled copy
 * registered as `kind@level` (level 1 is the unit itself).
 */
export function leveledKind(kind: DefKind, level: number): DefKind {
  const lv = Math.max(1, Math.min(OC_MAX_LEVEL, Math.floor(level)));
  const plain = baseKind(kind);
  const base = DEFENDERS[plain];
  if (!base || lv === 1) return plain;
  const id = `${plain}@${lv}`;
  if (DEFENDERS[id]) return id;
  DEFENDERS[id] = { ...scaleDef(base, levelPower(lv)), kind: id, level: lv };
  const card = CARDS[plain];
  if (card) CARDS[id] = { ...card, id, places: id };
  return id;
}

/** Does this (possibly leveled) unit have an Ascended form? */
export function hasUltimate(kind: DefKind): boolean {
  return OC_ULTIMATES[baseKind(kind)] !== undefined && !DEFENDERS[kind]?.ascendedFrom;
}

/**
 * The Ascended form of a (possibly leveled) unit, registered as `kind^`:
 * its ultimate's changes on top of the level-1 unit, then scaled by the
 * level and ASCEND_POWER. Null when the unit has no ultimate.
 */
export function ascendedKind(kind: DefKind): DefKind | null {
  const plain = baseKind(kind);
  const ult = OC_ULTIMATES[plain];
  const base = DEFENDERS[plain];
  const from = DEFENDERS[kind];
  if (!ult || !base || !from || from.ascendedFrom) return null;
  const id = `${kind}^`;
  if (DEFENDERS[id]) return id;
  const level = from.level ?? 1;
  const merged: DefDef = { ...base, ...ult.patch(base) };
  DEFENDERS[id] = {
    ...scaleDef(merged, levelPower(level) * ASCEND_POWER),
    kind: id,
    name: ult.name,
    sprite: ult.sprite ?? base.sprite,
    blurb: ult.blurb,
    level,
    card: undefined,
    ascendedFrom: kind
  };
  return id;
}
