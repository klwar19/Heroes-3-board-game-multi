import type { RequestState, RestiaState } from "./types";
import { PROLOGUE, SAVE_VERSION, newGame, newRelationship } from "./state";
import { defaultJobs } from "./jobs";
import { JOBS } from "../data/jobs";
import { canEquip, clampVitals, healMember, newMember } from "./party";
import { CHARACTERS } from "../data/characters";
import { ITEMS } from "../data/items";
import { MONSTERS } from "../data/monsters";
import { MISSIONS, PERKS, QUESTS } from "../data/progression";
import { SCENES } from "./scenes";
import { formatDate } from "./core";
import { ZONES } from "../data/zones";
import { CROPS } from "../data/crops";
import { giantPlots } from "./farm";

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
  const place = state.dungeon ? `Old Temple Ruins B${state.dungeon.floor}` : ZONES[state.player.zone].name;
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
  if (state.ending) throw new Error("This story has ended. Load an earlier save instead.");
  if (state.gameOver) throw new Error("Not now. Peri is still reviewing the footage.");
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
    throw new Error("That file isn't a Restia (Haven) save.");
  }
  const file = raw as Partial<SaveFile>;
  if (!file || file.format !== "restia-save" || typeof file.version !== "number" || !file.state) throw new Error("That file isn't a Restia (Haven) save.");
  if (file.version > SAVE_VERSION) throw new Error("This save comes from a newer version of the game.");
  return { ...file, state: migrate(file.state as RestiaState) } as SaveFile;
}

/**
 * Brings an older save up to date: every field a newer version added is filled
 * from a fresh game so old saves keep loading.
 */
export function migrate(input: RestiaState): RestiaState {
  if ((input.version ?? 1) < 2) input = fromRestiaWorld(input);
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
  // Story state arrived later; older saves start with an empty history.
  state.story = { ...fresh.story, ...input.story };
  state.ending = input.ending ?? null;
  state.gameOver = input.gameOver ?? null;
  state.checkpoint = input.checkpoint ? migrate(input.checkpoint) : null;
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
    // Version 3 added jobs: older members start in their default job.
    member.jobs = Object.fromEntries(Object.entries(member.jobs ?? {}).filter(([job]) => job in JOBS));
    if (!member.job || !(member.job in JOBS)) Object.assign(member, { job: defaultJobs(member.id).job });
    member.jobs[member.job] ??= { level: 1, exp: 0 };
    for (const slot of ["weapon", "armor", "accessory"] as const) {
      const item = member.equip[slot];
      if (item && !(item in ITEMS)) member.equip[slot] = null;
      // Renamed version-1 characters can use other gear (Mitia wears robes only): back to the bag.
      else if (item && !canEquip(member.id, item)) {
        state.inventory[item] = (state.inventory[item] ?? 0) + 1;
        member.equip[slot] = null;
      }
    }
    // Stats changed (renamed characters, job bonuses): keep HP/MP within the new maximums.
    clampVitals(state, member.id);
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
  for (const floor of Object.values(state.floorsToday ?? {})) floor.monsters = floor.monsters.filter((monster) => monster.group.every((entry) => entry.species in MONSTERS));
  // Farm plots: sprinklers and giant crops are optional fields added later (missing = none).
  // Unknown crops, bad sprinkler tiers and broken giant groups are dropped so the night can't crash.
  state.plots = Array.from({ length: fresh.plots.length }, (_, index) => input.plots?.[index] ?? fresh.plots[index]!);
  for (const plot of state.plots) {
    if (plot.crop && !(plot.crop.id in CROPS)) plot.crop = null;
    if (plot.sprinkler !== undefined && plot.sprinkler !== 1 && plot.sprinkler !== 2 && plot.sprinkler !== 3) delete plot.sprinkler;
  }
  for (const plot of state.plots) {
    if (plot.crop?.giant !== undefined && (!CROPS[plot.crop.id]!.giant || giantPlots(state, plot)?.length !== 9)) delete plot.crop.giant;
  }
  // Saves are never written mid-battle; a battle in an imported file is discarded.
  state.battle = null;
  state.version = SAVE_VERSION;
  return state;
}

/** Version 1 saves come from the original Restia/Dawnhollow story (same map, farm and systems). */
const OLD_IDS: Record<string, string> = {
  guildGirl: "lysa",
  pip: "tilde",
  kaito: "dain",
  hikari: "frida",
  mina: "mitia",
  nell: "bowy",
  tove: "hilda",
  seren: "senna"
};
/** Same role in both stories: the relationship status carries over. Others restart as friends. */
const SAME_ROLE = new Set(["guildGirl", "tove", "seren"]);

/**
 * Moves a version-1 save into the Haven story. Farm, town, items, levels and
 * friendship points are kept; characters are renamed to their Haven
 * counterparts; the new chapter 1 (prologue through the family dinner) is
 * treated as already played, so Garr, Bowy and Mitia join straight away.
 */
function fromRestiaWorld(old: RestiaState): RestiaState {
  const input = structuredClone(old) as RestiaState & Record<string, unknown>;
  const rename = (id: string) => OLD_IDS[id] ?? id;
  const members: Record<string, unknown> = {};
  for (const [id, member] of Object.entries(input.members ?? {})) {
    if (!member || id === "hikari") continue;
    members[rename(id)] = { ...member, id: rename(id) };
  }
  input.members = members as RestiaState["members"];
  const social: Record<string, unknown> = {};
  for (const [id, rel] of Object.entries(input.social ?? {})) {
    if (!rel) continue;
    social[rename(id)] = SAME_ROLE.has(id) ? rel : { ...rel, status: "none", events: [] };
  }
  input.social = social as RestiaState["social"];
  input.active = (input.active ?? []).filter((id) => id !== "hikari").map(rename);
  input.requests = (input.requests ?? []).map((request) => ({ ...request, client: rename(request.client) as RequestState["client"] }));
  const flags = { ...(input.flags ?? {}) };
  if (flags.metTove) flags.metHilda = true;
  if (flags.metSeren) flags.metSenna = true;
  for (const key of ["metDain", "metMara", "metFrida", "frostwoodSeen", "contract", "frostcapFound", "spriteJarred", "catJob", "catFound", "catDone", "dinnerDone", "chapter1Done"]) flags[key] = true;
  input.flags = flags;
  input.stats = { ...input.stats, counters: { ...input.stats?.counters, candleCoins: Math.max(10, input.stats?.counters?.candleCoins ?? 0) } };
  // The Frosted Mug stands from day one in Haven; the old inn levels shift up by one.
  if (input.town?.levels) input.town.levels.inn = Math.min(3, (input.town.levels.inn ?? 0) + 1);
  if (input.town?.project?.id === "inn") input.town.project.level = Math.min(3, input.town.project.level + 1);
  const level = Math.max(1, (input.members.bin?.level ?? 1) - 1);
  for (const id of ["garr", "bowy", "mitia"] as const) {
    if (input.members[id]) continue;
    input.members[id] = newMember(id, level);
  }
  for (const id of ["garr", "bowy", "mitia"] as const) healMember(input, id);
  for (const npc of ["garr", "bowy", "mitia", "lysa", "dain", "mara", "frida"] as const) {
    // Garr and Mara are new in Haven: chapter 1 counts as played, so they are met too.
    (input.social[npc] ??= newRelationship()).met = true;
  }
  input.seenScenes = [...(input.seenScenes ?? []), ...PROLOGUE];
  input.scene = null;
  input.sceneQueue = [];
  return input;
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
