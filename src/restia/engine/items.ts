import type { CharId, RestiaState } from "./types";
import { CHARACTERS } from "../data/characters";
import { skillDef } from "../data/skills";
import { itemDef } from "../data/items";
import { Ctx, clamp, fail, removeItem } from "./core";
import { maxStamina } from "./state";
import { activeLimit, memberSkills, memberStats, petStats } from "./party";
import { leaveDungeon } from "./dungeon";

type Vitals = { name: string; hp: number; mp: number; maxHp: number; maxMp: number; set: (hp: number, mp: number) => void };

function vitalsOf(state: RestiaState, target: string): Vitals {
  if (target.startsWith("pet:")) {
    const pet = state.pets.find((entry) => `pet:${entry.uid}` === target);
    if (!pet) fail("No such monster.");
    const stats = petStats(pet);
    return { name: pet.name, hp: pet.hp, mp: pet.mp, maxHp: stats.maxHp, maxMp: stats.maxMp, set: (hp, mp) => ((pet.hp = hp), (pet.mp = mp)) };
  }
  const member = state.members[target as CharId];
  if (!member) fail("That character hasn't joined yet.");
  const stats = memberStats(state, member.id);
  return { name: CHARACTERS[member.id].name, hp: member.hp, mp: member.mp, maxHp: stats.maxHp, maxMp: stats.maxMp, set: (hp, mp) => ((member.hp = hp), (member.mp = mp)) };
}

export function consumeItem(state: RestiaState, item: string, target: string, ctx: Ctx): void {
  if (state.battle) fail("Use items from the battle menu.");
  const def = itemDef(item);
  const use = def.use;
  if (!use || (state.inventory[item] ?? 0) < 1) fail(`You can't use ${def.name} here.`);
  if (use.returnHome) {
    if (!state.dungeon) fail("A Return Scroll only works inside the dungeon.");
    removeItem(state, item, 1);
    leaveDungeon(state, ctx, true);
    return;
  }
  if (use.bomb || use.escape || use.fertilizer || use.treat) fail(`${def.name} is used in battle or on the farm.`);
  let changed = false;
  if (use.stamina) {
    const max = maxStamina(state) + (use.buff && !state.buffs.some((buff) => buff.id === use.buff!.id) ? use.buff.stamina ?? 0 : 0);
    if (state.stamina < max) changed = true;
    state.stamina = clamp(state.stamina + use.stamina, 0, max);
  }
  if (use.buff && !state.buffs.some((buff) => buff.id === use.buff!.id)) {
    state.buffs.push(use.buff);
    changed = true;
  }
  if (use.hp || use.hpPct || use.mp || use.mpPct || use.revivePct) {
    const v = vitalsOf(state, target);
    if (use.revivePct) {
      if (v.hp > 0) fail(`${v.name} doesn't need reviving.`);
      v.set(Math.max(1, Math.round((v.maxHp * use.revivePct) / 100)), v.mp);
      changed = true;
    } else {
      if (v.hp <= 0 && (use.hp || use.hpPct)) fail(`${v.name} is knocked out. Use a Phoenix Feather or rest.`);
      const hp = Math.min(v.maxHp, v.hp + (use.hp ?? 0) + Math.round((v.maxHp * (use.hpPct ?? 0)) / 100));
      const mp = Math.min(v.maxMp, v.mp + (use.mp ?? 0) + Math.round((v.maxMp * (use.mpPct ?? 0)) / 100));
      if (hp !== v.hp || mp !== v.mp) changed = true;
      v.set(hp, mp);
    }
  }
  if (!changed) fail(`${def.name} would have no effect right now.`);
  removeItem(state, item, 1);
  ctx.toast(`Used ${def.name}.`, "info");
}

export function fieldSkill(state: RestiaState, caster: CharId, skillId: string, target: string, ctx: Ctx): void {
  if (state.battle) fail("Use skills from the battle menu.");
  const member = state.members[caster];
  if (!member) fail("That character hasn't joined yet.");
  if (!memberSkills(state, caster).includes(skillId)) fail("Unknown skill.");
  const skill = skillDef(skillId);
  if (!skill.field) fail(`${skill.name} can only be used in battle.`);
  if (member.hp <= 0) fail(`${CHARACTERS[caster].name} is knocked out.`);
  if (member.mp < skill.mp) fail("Not enough MP.");
  const stats = memberStats(state, caster);
  const amount = Math.round((skill.power ?? 1) * (stats.mag + member.level * 2));
  const targets = skill.target === "allAllies" ? [...Object.keys(state.members), ...state.pets.map((pet) => `pet:${pet.uid}`)] : [target];
  let changed = false;
  for (const id of targets) {
    const v = vitalsOf(state, id);
    if (skill.kind === "revive") {
      if (v.hp > 0) continue;
      v.set(Math.max(1, Math.round(v.maxHp * (skill.power ?? 0.5))), v.mp);
      changed = true;
    } else if (v.hp > 0 && v.hp < v.maxHp) {
      v.set(Math.min(v.maxHp, v.hp + amount), v.mp);
      changed = true;
    }
  }
  if (!changed) fail("Nobody needs that right now.");
  member.mp -= skill.mp;
  ctx.toast(`${CHARACTERS[caster].name} used ${skill.name}.`, "info");
}

export function setActive(state: RestiaState, active: string[]): void {
  if (!active.includes("bin")) fail("Bin always leads the party.");
  if (new Set(active).size !== active.length) fail("Duplicate party member.");
  if (active.length > activeLimit(state)) fail(`At most ${activeLimit(state)} fighters.`);
  for (const id of active) {
    if (id.startsWith("pet:")) {
      if (!state.pets.some((pet) => `pet:${pet.uid}` === id)) fail("Unknown monster.");
    } else if (!state.members[id as CharId]) {
      fail("That character hasn't joined yet.");
    }
  }
  state.active = [...active];
}

export function releasePet(state: RestiaState, uid: string, ctx: Ctx): void {
  const pet = state.pets.find((entry) => entry.uid === uid);
  if (!pet) fail("No such monster.");
  state.pets = state.pets.filter((entry) => entry.uid !== uid);
  state.active = state.active.filter((id) => id !== `pet:${uid}`);
  ctx.toast(`${pet.name} returned to the wild.`, "info");
}

export function setPetJob(state: RestiaState, uid: string, on: boolean): void {
  const pet = state.pets.find((entry) => entry.uid === uid);
  if (!pet) fail("No such monster.");
  pet.farmJob = on;
}
