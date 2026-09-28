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
    title: "Summoned Gamer",
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
      { level: 4, skill: "quickPatch" },
      { level: 7, skill: "crossSlash" },
      { level: 10, skill: "overclock" },
      { level: 14, skill: "adminStrike" },
      { level: 18, skill: "sudo" }
    ],
    startEquip: { weapon: weaponId("sword", 0), armor: armorId("light", 0), accessory: null }
  },
  hikari: {
    id: "hikari",
    name: "Hikari",
    title: "Goddess of Dawn (Broke)",
    base: stats(38, 26, 6, 6, 13, 12, 6, 8),
    growth: stats(5.5, 3.4, 1, 1.2, 2.5, 2.2, 0.3, 0.6),
    move: 3,
    range: 3,
    weapon: "staff",
    armor: ["robe"],
    element: "light",
    resist: { light: 0.5, dark: 1.5 },
    skills: [
      { level: 1, skill: "heal" },
      { level: 1, skill: "holyLight" },
      { level: 5, skill: "blessing" },
      { level: 9, skill: "healAll" },
      { level: 13, skill: "radiance" },
      { level: 17, skill: "resurrection" }
    ],
    bondSkills: [
      { hearts: 3, skill: "dawnPrayer" },
      { hearts: 6, skill: "sunburst" },
      { hearts: 9, skill: "divineGrace" }
    ],
    startEquip: { weapon: weaponId("staff", 1), armor: armorId("robe", 0), accessory: null }
  },
  mina: {
    id: "mina",
    name: "Mina",
    title: "Half-Elf Alchemist",
    base: stats(40, 22, 7, 6, 12, 10, 7, 7),
    growth: stats(5.5, 3, 1.2, 1.2, 2.3, 2, 0.35, 0.5),
    move: 4,
    range: 3,
    weapon: "staff",
    armor: ["robe", "light"],
    element: "earth",
    resist: { earth: 0.5, wind: 1.5 },
    skills: [
      { level: 1, skill: "acidFlask" },
      { level: 1, skill: "firstAid" },
      { level: 5, skill: "flameFlask" },
      { level: 9, skill: "frostFlask" },
      { level: 13, skill: "catalyst" },
      { level: 17, skill: "philosophersMist" }
    ],
    bondSkills: [
      { hearts: 3, skill: "sleepGas" },
      { hearts: 6, skill: "thunderFlask" },
      { hearts: 9, skill: "grandTransmute" }
    ],
    startEquip: { weapon: weaponId("staff", 0), armor: armorId("robe", 0), accessory: null }
  },
  tove: {
    id: "tove",
    name: "Tove",
    title: "Dwarven Blacksmith",
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
      { level: 4, skill: "armorBreak" },
      { level: 8, skill: "groundSlam" },
      { level: 12, skill: "forgeFire" },
      { level: 16, skill: "titanSmash" }
    ],
    bondSkills: [
      { hearts: 3, skill: "sharpen" },
      { hearts: 6, skill: "anvilGuard" },
      { hearts: 9, skill: "meteorHammer" }
    ],
    startEquip: { weapon: weaponId("hammer", 0), armor: armorId("heavy", 0), accessory: null }
  },
  seren: {
    id: "seren",
    name: "Seren",
    title: "Knight of Erathia",
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
      { level: 7, skill: "holyLance" },
      { level: 11, skill: "shieldWall" },
      { level: 15, skill: "valiantCharge" }
    ],
    bondSkills: [
      { hearts: 3, skill: "rally" },
      { hearts: 6, skill: "griffinDive" },
      { hearts: 9, skill: "erathianOath" }
    ],
    startEquip: { weapon: weaponId("spear", 1), armor: armorId("heavy", 1), accessory: null }
  },
  nell: {
    id: "nell",
    name: "Nell",
    title: "Foxkin Ranger",
    base: stats(42, 14, 12, 7, 7, 8, 9, 10),
    growth: stats(6, 2, 2.4, 1.3, 1.2, 1.5, 0.45, 0.8),
    move: 5,
    range: 4,
    weapon: "bow",
    armor: ["light"],
    element: "wind",
    resist: { wind: 0.5, fire: 1.5 },
    skills: [
      { level: 1, skill: "aimedShot" },
      { level: 4, skill: "poisonArrow" },
      { level: 8, skill: "galeArrow" },
      { level: 12, skill: "arrowRain" },
      { level: 16, skill: "foxfire" }
    ],
    bondSkills: [
      { hearts: 3, skill: "hunterMark" },
      { hearts: 6, skill: "tailwind" },
      { hearts: 9, skill: "ninefoldVolley" }
    ],
    startEquip: { weapon: weaponId("bow", 0), armor: armorId("light", 0), accessory: null }
  }
};

/** Kaito is never recruited: he appears as a sparring rival. */
export const KAITO_BATTLE = {
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
