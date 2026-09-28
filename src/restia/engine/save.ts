import type { RestiaState } from "./types";
import { SAVE_VERSION, newGame } from "./state";
import { CHARACTERS } from "../data/characters";
import { ITEMS } from "../data/items";
import { MONSTERS } from "../data/monsters";
import { MISSIONS, PERKS, QUESTS } from "../data/progression";
import { SCENES } from "./scenes";
import { formatDate } from "./core";
import { ZONES } from "../data/zones";

/**
 * Saves live only in this browser (localStorage) — Restia is single-player and
 * never talks to a server. Players can export a save file and import it on
 * another device.
 */
export type SlotId = "auto" | "1" | "2" | "3";
export const SLOTS: SlotId[] = ["auto", "1", "2", "3"];

export type SaveMeta = { slot: SlotId; savedAt: number; date: string; gold: number; level: number; playSeconds: number; place: string };

type SaveFile = { format: "restia-save"; version: number; meta: SaveMeta; state: RestiaState };

const KEY = (slot: SlotId) => `restia:save:${slot}`;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function metaOf(state: RestiaState, slot: SlotId): SaveMeta {
  const place = state.dungeon ? `Catacombs B${state.dungeon.floor}` : ZONES[state.player.zone].name;
  return {
    slot,
    savedAt: Date.now(),
    date: formatDate(state.day),
    gold: state.gold,
    level: state.members.bin?.level ?? 1,
    playSeconds: state.playSeconds,
    place
  };
}

export function saveGame(state: RestiaState, slot: SlotId): SaveMeta {
  if (state.battle) throw new Error("You can't save during a battle.");
  const meta = metaOf(state, slot);
  const file: SaveFile = { format: "restia-save", version: SAVE_VERSION, meta, state };
  const store = storage();
  if (!store) throw new Error("This browser blocks local storage, so the game can't be saved here. Use Export instead.");
  try {
    store.setItem(KEY(slot), JSON.stringify(file));
  } catch {
    throw new Error("Saving failed: browser storage is full or blocked. Try Export to keep a copy.");
  }
  return meta;
}

function parse(text: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Restia save.");
  }
  const file = raw as Partial<SaveFile>;
  if (!file || file.format !== "restia-save" || typeof file.version !== "number" || !file.state) throw new Error("That file isn't a Restia save.");
  if (file.version > SAVE_VERSION) throw new Error("This save comes from a newer version of the game.");
  return { ...file, state: migrate(file.state as RestiaState) } as SaveFile;
}

/**
 * Brings an older save up to date: every field a newer version added is filled
 * from a fresh game so old saves keep loading.
 */
export function migrate(input: RestiaState): RestiaState {
  const fresh = newGame(1);
  const state = { ...fresh, ...input } as RestiaState;
  state.stats = { ...fresh.stats, ...input.stats };
  state.town = { ...fresh.town, ...input.town, levels: { ...fresh.town.levels, ...input.town?.levels } };
  state.skills = { ...fresh.skills, ...input.skills };
  state.tools = { ...fresh.tools, ...input.tools };
  state.social = { ...fresh.social, ...input.social };
  state.guild = { ...fresh.guild, ...input.guild };
  state.admin = { ...fresh.admin, ...input.admin };
  state.player = { ...fresh.player, ...input.player };
  for (const id of Object.keys(state.members)) {
    if (!(id in CHARACTERS)) delete state.members[id as keyof typeof state.members];
  }
  if (!state.members.bin) throw new Error("This save is damaged (no Bin).");
  // Content a later version renamed or removed must not crash the game: drop it.
  const knownItems = (record: Record<string, number> = {}) => Object.fromEntries(Object.entries(record).filter(([id, n]) => id in ITEMS && n > 0));
  state.inventory = knownItems(state.inventory);
  state.storage = knownItems(state.storage);
  state.shipping = knownItems(state.shipping);
  for (const member of Object.values(state.members)) {
    if (!member) continue;
    for (const slot of ["weapon", "armor", "accessory"] as const) {
      if (member.equip[slot] && !(member.equip[slot]! in ITEMS)) member.equip[slot] = null;
    }
  }
  state.quests = { active: (state.quests?.active ?? []).filter((id) => id in QUESTS), done: (state.quests?.done ?? []).filter((id) => id in QUESTS) };
  if (state.scene && !(state.scene.id in SCENES)) state.scene = null;
  state.sceneQueue = (state.sceneQueue ?? []).filter((id) => id in SCENES);
  state.social = Object.fromEntries(Object.entries(state.social).filter(([id]) => id in fresh.social)) as RestiaState["social"];
  state.pets = (state.pets ?? []).filter((pet) => pet.species in MONSTERS);
  state.active = (state.active ?? []).filter((id) => (id.startsWith("pet:") ? state.pets.some((pet) => `pet:${pet.uid}` === id) : id in state.members));
  if (!state.active.includes("bin")) state.active.unshift("bin");
  state.requests = (state.requests ?? []).filter((request) => (request.kind === "hunt" ? request.target in MONSTERS : request.kind === "explore" || request.target in ITEMS));
  state.missions = { day: state.missions?.day ?? 0, list: (state.missions?.list ?? []).filter((mission) => MISSIONS.some((template) => template.id === mission.id)) };
  state.admin.perks = state.admin.perks.filter((id) => PERKS.some((perk) => perk.id === id));
  state.forage = (state.forage ?? []).filter((spot) => spot.item in ITEMS);
  state.fieldMonsters = (state.fieldMonsters ?? []).filter((monster) => monster.group.every((entry) => entry.species in MONSTERS));
  if (state.dungeon) state.dungeon.monsters = state.dungeon.monsters.filter((monster) => monster.group.every((entry) => entry.species in MONSTERS));
  // Saves are never written mid-battle; a battle in an imported file is discarded.
  state.battle = null;
  state.version = SAVE_VERSION;
  return state;
}

function isMeta(value: unknown): value is SaveMeta {
  const meta = value as Partial<SaveMeta> | null;
  return (
    !!meta &&
    typeof meta.savedAt === "number" &&
    typeof meta.date === "string" &&
    typeof meta.gold === "number" &&
    typeof meta.level === "number" &&
    typeof meta.playSeconds === "number" &&
    typeof meta.place === "string"
  );
}

export function loadGame(slot: SlotId): RestiaState | null {
  const text = storage()?.getItem(KEY(slot));
  if (!text) return null;
  return parse(text).state;
}

export function listSaves(): Record<SlotId, SaveMeta | null> {
  const out = {} as Record<SlotId, SaveMeta | null>;
  for (const slot of SLOTS) {
    try {
      const text = storage()?.getItem(KEY(slot));
      const meta = text ? (JSON.parse(text) as Partial<SaveFile>).meta : null;
      out[slot] = isMeta(meta) ? { ...meta, slot } : null;
    } catch {
      out[slot] = null;
    }
  }
  return out;
}

export function deleteSave(slot: SlotId): void {
  storage()?.removeItem(KEY(slot));
}

export function exportSave(state: RestiaState): string {
  const file: SaveFile = { format: "restia-save", version: SAVE_VERSION, meta: metaOf(state, "1"), state };
  return JSON.stringify(file);
}

export function importSave(text: string): RestiaState {
  return parse(text).state;
}
