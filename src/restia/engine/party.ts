import type { CharId, ItemId, MemberState, PassiveId, PetState, RestiaState, SkillId, StatKey, Stats } from "./types";
import { CHARACTERS, MAX_LEVEL, expToNext } from "../data/characters";
import { MONSTERS } from "../data/monsters";
import { ITEMS, itemDef } from "../data/items";
import { POINTS_PER_HEART } from "../data/progression";
import { Ctx, addItem, fail, perk, removeItem } from "./core";
import { defaultJobs, jobPassives, jobSkills, jobStats } from "./jobs";
import { sumPassives } from "./passives";
import { available, penaltyActive } from "./story";
import { PENALTY_STAT_MULT } from "../data/endings";

export const STAT_KEYS: StatKey[] = ["maxHp", "maxMp", "atk", "def", "mag", "res", "spd", "luk"];

export function growStats(base: Stats, growth: Stats, level: number): Stats {
  const out = {} as Stats;
  for (const key of STAT_KEYS) out[key] = Math.floor(base[key] + growth[key] * (level - 1));
  return out;
}

export function newMember(id: CharId, level: number): MemberState {
  return { id, level, exp: 0, hp: 1, mp: 0, equip: { ...CHARACTERS[id].startEquip }, ...defaultJobs(id) };
}

/** Stats with job levels, equipment and today's food/blessing buffs (battle modifiers come on top). */
export function memberStats(state: RestiaState, id: CharId): Stats {
  const member = state.members[id];
  if (!member) fail(`${id} has not joined the party`);
  const def = CHARACTERS[id];
  const stats = growStats(def.base, def.growth, member.level);
  for (const [key, value] of Object.entries(jobStats(member))) stats[key as StatKey] += value ?? 0;
  for (const slot of ["weapon", "armor", "accessory"] as const) {
    const item = member.equip[slot];
    const equip = item ? ITEMS[item]?.equip : undefined;
    if (!equip) continue;
    for (const [key, value] of Object.entries(equip.stats)) stats[key as StatKey] += value ?? 0;
  }
  for (const buff of state.buffs) {
    for (const [key, value] of Object.entries(buff.stats ?? {})) stats[key as StatKey] += value ?? 0;
  }
  if (penaltyActive(state)) for (const key of ["atk", "def", "mag", "res"] as const) stats[key] = Math.floor(stats[key] * PENALTY_STAT_MULT);
  // Passive max HP/MP bonuses (e.g. Veteran) apply outside battle too, so HP bars stay consistent.
  const passives = sumPassives(memberPassives(state, id));
  stats.maxHp = Math.round(stats.maxHp * (1 + (passives.stats.maxHp ?? 0) / 100));
  stats.maxMp = Math.round(stats.maxMp * (1 + (passives.stats.maxMp ?? 0) / 100));
  for (const key of STAT_KEYS) stats[key] = Math.max(key === "maxHp" ? 1 : 0, stats[key]);
  return stats;
}

export function petStats(pet: PetState): Stats {
  const def = MONSTERS[pet.species]!;
  return growStats(def.base, def.growth, pet.level);
}

export function hearts(state: RestiaState, npc: string): number {
  const rel = state.social[npc as keyof typeof state.social];
  return rel ? Math.floor(rel.points / POINTS_PER_HEART) : 0;
}

export function memberSkills(state: RestiaState, id: CharId): SkillId[] {
  const member = state.members[id];
  if (!member) return [];
  const def = CHARACTERS[id];
  const skills = def.skills.filter((entry) => entry.level <= member.level).map((entry) => entry.skill);
  for (const bond of def.bondSkills ?? []) if (hearts(state, id) >= bond.hearts) skills.push(bond.skill);
  for (const skill of jobSkills(member)) if (!skills.includes(skill)) skills.push(skill);
  return skills;
}

/** Battle passives: innate, every learned job passive, and gear. */
export function memberPassives(state: RestiaState, id: CharId): PassiveId[] {
  const member = state.members[id];
  if (!member) return [];
  const out: PassiveId[] = [];
  const innate = CHARACTERS[id].passive;
  if (innate) out.push(innate);
  for (const passive of jobPassives(member)) if (!out.includes(passive)) out.push(passive);
  for (const slot of ["weapon", "armor", "accessory"] as const) {
    const passive = member.equip[slot] ? ITEMS[member.equip[slot]!]?.equip?.passive : undefined;
    if (passive && !out.includes(passive)) out.push(passive);
  }
  return out;
}

export function clampVitals(state: RestiaState, id: CharId): void {
  const member = state.members[id];
  if (!member) return;
  const stats = memberStats(state, id);
  member.hp = Math.max(0, Math.min(member.hp, stats.maxHp));
  member.mp = Math.max(0, Math.min(member.mp, stats.maxMp));
}

export function healMember(state: RestiaState, id: CharId): void {
  const member = state.members[id];
  if (!member) return;
  const stats = memberStats(state, id);
  member.hp = stats.maxHp;
  member.mp = stats.maxMp;
}

export function healEveryone(state: RestiaState): void {
  for (const id of Object.keys(state.members) as CharId[]) healMember(state, id);
  for (const pet of state.pets) {
    const stats = petStats(pet);
    pet.hp = stats.maxHp;
    pet.mp = stats.maxMp;
  }
}

export function activeLimit(state: RestiaState): number {
  return perk(state, "partySlot") ? 5 : 4;
}

export function recruit(state: RestiaState, id: CharId, ctx: Ctx): void {
  if (state.members[id] || !available(state, id)) return;
  const binLevel = state.members.bin?.level ?? 1;
  const member = newMember(id, Math.max(1, binLevel - 1));
  state.members[id] = member;
  healMember(state, id);
  if (state.active.length < activeLimit(state)) state.active.push(id);
  ctx.toast(`${CHARACTERS[id].name} joined the party!`, "good");
}

/** Gives EXP to a member (CharId) or pet ("pet:<uid>"), handling level ups. */
export function gainExp(state: RestiaState, who: string, amount: number, ctx: Ctx): { level: number } | null {
  if (amount <= 0) return null;
  if (who.startsWith("pet:")) {
    const pet = state.pets.find((entry) => `pet:${entry.uid}` === who);
    if (!pet) return null;
    pet.exp += amount;
    let leveled = false;
    while (pet.level < MAX_LEVEL && pet.exp >= expToNext(pet.level)) {
      pet.exp -= expToNext(pet.level);
      pet.level += 1;
      leveled = true;
    }
    if (leveled) {
      ctx.events.push({ kind: "levelUp", who: pet.name, level: pet.level });
      return { level: pet.level };
    }
    return null;
  }
  const member = state.members[who as CharId];
  if (!member) return null;
  const before = memberSkills(state, member.id);
  const oldMax = memberStats(state, member.id);
  member.exp += amount;
  let leveled = false;
  while (member.level < MAX_LEVEL && member.exp >= expToNext(member.level)) {
    member.exp -= expToNext(member.level);
    member.level += 1;
    leveled = true;
  }
  if (!leveled) return null;
  const newMax = memberStats(state, member.id);
  // Level ups add the new max HP/MP on top of current vitals.
  member.hp += newMax.maxHp - oldMax.maxHp;
  member.mp += newMax.maxMp - oldMax.maxMp;
  clampVitals(state, member.id);
  ctx.events.push({ kind: "levelUp", who: CHARACTERS[member.id].name, level: member.level });
  for (const skill of memberSkills(state, member.id)) {
    if (!before.includes(skill)) ctx.toast(`${CHARACTERS[member.id].name} learned a new skill!`, "good");
  }
  return { level: member.level };
}

export function canEquip(id: CharId, item: ItemId): boolean {
  const equip = ITEMS[item]?.equip;
  if (!equip) return false;
  const def = CHARACTERS[id];
  if (equip.slot === "weapon") return equip.weaponType === def.weapon;
  if (equip.slot === "armor") return !!equip.armorType && def.armor.includes(equip.armorType);
  return true;
}

export function equip(state: RestiaState, id: CharId, item: ItemId | null, slot: "weapon" | "armor" | "accessory"): void {
  const member = state.members[id];
  if (!member) fail("That character has not joined yet.");
  if (item) {
    const def = itemDef(item);
    if (def.equip?.slot !== slot) fail(`${def.name} does not go in that slot.`);
    if (!canEquip(id, item)) fail(`${CHARACTERS[id].name} can't use ${def.name}.`);
    if (!removeItem(state, item, 1)) fail(`You don't have ${def.name}.`);
  }
  const previous = member.equip[slot];
  if (previous) addItem(state, previous, 1);
  member.equip[slot] = item;
  clampVitals(state, id);
}
