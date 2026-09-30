import type { BuildingId, NpcId, Plot, Relationship, RestiaState } from "./types";
import { newStory } from "./story";
import { START_LEVELS } from "../data/buildings";
import { NPC_IDS } from "../data/npcs";
import { FIELD_H, FIELD_MAX, FIELD_RECTS, FIELD_W, PAINTED_DEBRIS, inRect } from "../data/zones";
import { DAY_START, chance, perk, pick, randInt, rollWeather } from "./core";
import { healMember, newMember } from "./party";

export const SAVE_VERSION = 3;
export const BASE_STAMINA = 100;
export const BARN_CAPACITY = [0, 4, 8];

export const PROLOGUE = [
  "p0Bookstore",
  "p0Saturdays",
  "p0Bracelet",
  "p1Daily",
  "p1Kfc",
  "p2Ward",
  "p3TrashCan",
  "p4Goddess",
  "p5Eos",
  "p7NextDay",
  "p8Contract",
  "h1Road",
  "h1Gate",
  "h1Home",
  "farmArrive"
];

export function newRelationship(): Relationship {
  return { points: 0, met: false, talkedDay: 0, giftDay: 0, giftsWeek: 0, giftWeek: 0, events: [], status: "none" };
}

function emptyPlot(): Plot {
  return { tilled: false, watered: false, fertilizer: 0, crop: null, debris: null };
}

export function newGame(seed: number): RestiaState {
  const state: RestiaState = {
    version: SAVE_VERSION,
    rng: seed | 0,
    day: 1,
    minute: DAY_START,
    weather: "sunny",
    tomorrow: "sunny",
    gold: 500,
    stamina: BASE_STAMINA,
    player: { zone: "farm", x: 3, y: 6, facing: "down", inside: null },
    inventory: { potion: 2 },
    storage: {},
    tools: { hoe: 1, can: 1, axe: 1, hammer: 1, sickle: 1 },
    water: 20,
    plots: Array.from({ length: FIELD_W * FIELD_H }, emptyPlot),
    shipping: {},
    members: {},
    pets: [],
    active: ["bin"],
    social: Object.fromEntries(NPC_IDS.map((id) => [id, newRelationship()])) as Record<NpcId, Relationship>,
    flags: {},
    quests: { active: [], done: [] },
    requests: [],
    requestDay: 0,
    guild: { rank: "F", gp: 0, examReady: false },
    missions: { day: 0, list: [] },
    admin: { ap: 0, perks: [] },
    faith: 0,
    town: { levels: { ...START_LEVELS }, project: null },
    skills: { farming: 0, foraging: 0, mining: 0, forging: 0, alchemy: 0, cooking: 0, taming: 0 },
    recipes: [],
    buffs: [],
    bestiary: {},
    stats: {
      shipped: {},
      shippedTotal: 0,
      defeated: {},
      defeatedTotal: 0,
      deepest: 0,
      crafted: 0,
      befriended: 0,
      today: {},
      counters: {}
    },
    fieldMonsters: [],
    forage: [],
    dungeon: null,
    floorsToday: {},
    battle: null,
    scene: null,
    sceneQueue: [],
    seenScenes: [],
    playSeconds: 0,
    blessingDay: 0,
    story: newStory(),
    ending: null,
    gameOver: null,
    checkpoint: null
  };
  state.members.bin = newMember("bin", 1);
  healMember(state, "bin");
  // An abandoned field: weeds, stones and branches everywhere.
  for (let y = FIELD_MAX[1]; y <= FIELD_MAX[3]; y++) {
    for (let x = FIELD_MAX[0]; x <= FIELD_MAX[2]; x++) {
      const plot = plotAt(state, x, y)!;
      if (chance(state, inRect(FIELD_RECTS[1]!, x, y) ? 0.4 : 0.6)) {
        plot.debris = pick(state, ["weed", "weed", "weed", "stone", "stone", "branch"] as const)!;
      }
    }
  }
  // Big obstacles outside the starting field (need upgraded tools to clear).
  for (let i = 0; i < 4; i++) {
    const x = randInt(state, FIELD_MAX[0], FIELD_MAX[2]);
    const y = randInt(state, FIELD_MAX[1], FIELD_MAX[3]);
    if (!inRect(FIELD_RECTS[1]!, x, y)) plotAt(state, x, y)!.debris = i % 2 ? "boulder" : "stump";
  }
  for (const painted of PAINTED_DEBRIS) {
    const plot = plotAt(state, painted.x, painted.y);
    if (plot) plot.debris = painted.kind;
  }
  state.tomorrow = rollWeather(state, 2);
  // Earth prologue -> Eos trial -> the Contract -> Haven. The two battles
  // (Eos, the frost wolf) pause the queue; their win/lose scenes play first.
  state.sceneQueue = [...PROLOGUE];
  return state;
}

export function plotIndex(x: number, y: number): number {
  if (!inRect(FIELD_MAX, x, y)) return -1;
  return (y - FIELD_MAX[1]) * FIELD_W + (x - FIELD_MAX[0]);
}

export function plotAt(state: RestiaState, x: number, y: number): Plot | null {
  const index = plotIndex(x, y);
  return index < 0 ? null : state.plots[index] ?? null;
}

/** Plot exists and lies inside the field the player has unlocked (field level). */
export function activePlot(state: RestiaState, x: number, y: number): Plot | null {
  const level = state.town.levels.field;
  if (!inRect(FIELD_RECTS[level]!, x, y)) return null;
  return plotAt(state, x, y);
}

export function maxStamina(state: RestiaState): number {
  const house = state.town.levels.farmhouse;
  const buff = state.buffs.reduce((sum, entry) => sum + (entry.stamina ?? 0), 0);
  return BASE_STAMINA + (house >= 2 ? 20 : 0) + (house >= 3 ? 30 : 0) + (perk(state, "staminaPlus") ? 30 : 0) + buff;
}

export function canCapacity(state: RestiaState): number {
  return [0, 20, 40, 80][state.tools.can]! * (perk(state, "bigCan") ? 2 : 1);
}

export function barnCapacity(state: RestiaState): number {
  return BARN_CAPACITY[state.town.levels.barn] ?? 0;
}

export function buildingLevel(state: RestiaState, id: BuildingId): number {
  return state.town.levels[id];
}
