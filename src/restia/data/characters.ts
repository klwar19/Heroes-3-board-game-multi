import type { CharId, CharacterDef, Stats } from "../engine/types";
import { armorId, weaponId } from "./items";

function stats(maxHp: number, maxMp: number, atk: number, def: number, mag: number, res: number, spd: number, luk: number): Stats {
  return { maxHp, maxMp, atk, def, mag, res, spd, luk };
}

/** Party-capable characters. Stats at level L = base + growth * (L - 1). */
export const CHARACTERS: Record<CharId, CharacterDef> = {
  bin: {
    id: "bin",
    name: "Bin",
    title: "Cosmic Jester",
    base: stats(48, 14, 11, 8, 7, 7, 7, 6),
    growth: stats(7, 2, 2.2, 1.6, 1.4, 1.4, 0.35, 0.5),
    move: 4,
    range: 1,
    weapon: "sword",
    armor: ["light"],
    element: "phys",
    resist: {},
    skills: [
      { level: 1, skill: "analyze" },
      { level: 1, skill: "powerSlash" },
      { level: 3, skill: "raiseStage" },
      { level: 4, skill: "quickPatch" },
      { level: 6, skill: "stageDive" },
      { level: 7, skill: "crossSlash" },
      { level: 11, skill: "encore" },
      { level: 10, skill: "overclock" },
      { level: 14, skill: "adminStrike" },
      { level: 18, skill: "sudo" }
    ],
    startEquip: { weapon: weaponId("sword", 0), armor: armorId("light", 0), accessory: null },
    passive: "comicTiming",
    job: "jester"
  },
  mitia: {
    id: "mitia",
    name: "Mitia",
    title: "Apothecary of Frostbitten",
    base: stats(38, 26, 6, 6, 13, 12, 6, 8),
    growth: stats(5.5, 3.4, 1, 1.2, 2.5, 2.2, 0.3, 0.6),
    move: 3,
    range: 3,
    weapon: "staff",
    armor: ["robe"],
    element: "ice",
    resist: { ice: 0.5, dark: 0.75, fire: 1.5 },
    skills: [
      { level: 1, skill: "heal" },
      { level: 1, skill: "holyLight" },
      { level: 3, skill: "acidFlask" },
      { level: 4, skill: "glacierRise" },
      { level: 5, skill: "blessing" },
      { level: 7, skill: "frostFlask" },
      { level: 9, skill: "healAll" },
      { level: 11, skill: "avalanche" },
      { level: 13, skill: "radiance" },
      { level: 17, skill: "resurrection" }
    ],
    bondSkills: [
      { hearts: 3, skill: "dawnPrayer" },
      { hearts: 6, skill: "sunburst" },
      { hearts: 9, skill: "divineGrace" }
    ],
    startEquip: { weapon: weaponId("staff", 1), armor: armorId("robe", 0), accessory: null },
    passive: "faeBlood",
    job: "cleric"
  },
  bowy: {
    id: "bowy",
    name: "Bowy",
    title: "Half-Orc Marksman",
    base: stats(50, 12, 12, 9, 5, 6, 7, 7),
    growth: stats(7.5, 1.6, 2.4, 1.7, 0.9, 1.2, 0.35, 0.6),
    move: 3,
    range: 4,
    weapon: "bow",
    armor: ["light"],
    element: "phys",
    resist: { wind: 0.5, earth: 1.5 },
    skills: [
      { level: 1, skill: "aimedShot" },
      { level: 3, skill: "grappleBolt" },
      { level: 4, skill: "poisonArrow" },
      { level: 6, skill: "plungingVolley" },
      { level: 8, skill: "galeArrow" },
      { level: 12, skill: "arrowRain" },
      { level: 16, skill: "foxfire" }
    ],
    bondSkills: [
      { hearts: 3, skill: "hunterMark" },
      { hearts: 6, skill: "tailwind" },
      { hearts: 9, skill: "ninefoldVolley" }
    ],
    startEquip: { weapon: weaponId("bow", 0), armor: armorId("light", 0), accessory: null },
    passive: "thunderCrossbow",
    job: "ranger"
  },
  garr: {
    id: "garr",
    name: "Garr",
    title: "Veteran Hunter",
    base: stats(58, 12, 13, 11, 5, 8, 6, 6),
    growth: stats(8, 1.6, 2.4, 2.1, 0.8, 1.5, 0.3, 0.5),
    move: 4,
    range: 1,
    weapon: "sword",
    armor: ["light", "heavy"],
    element: "phys",
    resist: { wind: 0.5, ice: 0.75, light: 1.5 },
    skills: [
      { level: 1, skill: "huntersStrike" },
      { level: 1, skill: "firstAid" },
      { level: 3, skill: "hookLine" },
      { level: 4, skill: "sleepGas" },
      { level: 6, skill: "pitfall" },
      { level: 8, skill: "rally" },
      { level: 13, skill: "deadfall" }
    ],
    bondSkills: [
      { hearts: 3, skill: "veteransInstinct" },
      { hearts: 6, skill: "packLeader" },
      { hearts: 9, skill: "lastHunt" }
    ],
    startEquip: { weapon: weaponId("sword", 1), armor: armorId("light", 1), accessory: null },
    passive: "oldWolf",
    job: "rogue"
  },
  hilda: {
    id: "hilda",
    name: "Hilda",
    title: "Master of the Ironhand Forge",
    base: stats(60, 10, 13, 10, 4, 6, 5, 6),
    growth: stats(8.5, 1.5, 2.6, 2, 0.8, 1.2, 0.25, 0.5),
    move: 3,
    range: 1,
    weapon: "hammer",
    armor: ["heavy", "light"],
    element: "earth",
    resist: { fire: 0.5, ice: 1.5 },
    skills: [
      { level: 1, skill: "hammerBlow" },
      { level: 3, skill: "earthshaper" },
      { level: 4, skill: "armorBreak" },
      { level: 8, skill: "groundSlam" },
      { level: 9, skill: "seismicDrop" },
      { level: 12, skill: "forgeFire" },
      { level: 16, skill: "titanSmash" }
    ],
    bondSkills: [
      { hearts: 3, skill: "sharpen" },
      { hearts: 6, skill: "anvilGuard" },
      { hearts: 9, skill: "meteorHammer" }
    ],
    startEquip: { weapon: weaponId("hammer", 0), armor: armorId("heavy", 0), accessory: null },
    passive: "ironhand",
    job: "guardian"
  },
  senna: {
    id: "senna",
    name: "Senna",
    title: "The Warring Princess",
    base: stats(58, 12, 12, 12, 6, 9, 6, 5),
    growth: stats(8, 1.8, 2.3, 2.3, 1, 1.8, 0.3, 0.4),
    move: 4,
    range: 1,
    weapon: "spear",
    armor: ["heavy"],
    element: "phys",
    resist: { light: 0.75, dark: 1.5 },
    skills: [
      { level: 1, skill: "lanceThrust" },
      { level: 3, skill: "guardUp" },
      { level: 5, skill: "pinningCharge" },
      { level: 7, skill: "holyLance" },
      { level: 10, skill: "skyfallLance" },
      { level: 11, skill: "shieldWall" },
      { level: 15, skill: "valiantCharge" }
    ],
    bondSkills: [
      { hearts: 3, skill: "warlust" },
      { hearts: 6, skill: "griffinDive" },
      { hearts: 9, skill: "erathianOath" }
    ],
    startEquip: { weapon: weaponId("spear", 1), armor: armorId("heavy", 1), accessory: null },
    passive: "warringPrincess",
    job: "fighter"
  }
};

/** Dain is never recruited: he appears as the C-rank sparring rival. */
export const DAIN_BATTLE = {
  base: stats(70, 20, 15, 11, 8, 9, 8, 7),
  growth: stats(9, 2, 2.6, 1.9, 1.2, 1.5, 0.35, 0.5),
  move: 4,
  range: 1,
  skills: ["braveSlash", "thunderEdge"]
};

export const CHAR_IDS = Object.keys(CHARACTERS) as CharId[];

/** EXP needed to go from `level` to `level + 1`. */
export function expToNext(level: number): number {
  return Math.round(18 * Math.pow(level, 1.55) + 6 * level);
}

export const MAX_LEVEL = 50;
