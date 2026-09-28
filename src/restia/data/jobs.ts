import type { JobDef } from "../engine/types";

/**
 * Jobs (Monster Girl Quest Paradox style): each has five levels. Job levels give
 * permanent stat gains; level 1/3/5 teach a passive, level 2/4 a skill. What a
 * member learned stays with them after changing jobs. Job EXP only goes to the
 * current job. Tier-2 jobs need their tier-1 job at level 5 on the same member.
 */
const LIST: JobDef[] = [
  {
    id: "fighter",
    name: "Fighter",
    tier: 1,
    desc: "Front-line damage. Hits hard, gets harder to put down.",
    levels: [
      { stats: { maxHp: 4, atk: 1 }, passive: "weaponTraining" },
      { stats: { maxHp: 4, atk: 1 }, skill: "jPowerStrike" },
      { stats: { maxHp: 5, atk: 1, def: 1 }, passive: "battleRhythm" },
      { stats: { maxHp: 5, atk: 1 }, skill: "jWhirlwind" },
      { stats: { maxHp: 6, atk: 2 }, passive: "veteran" }
    ]
  },
  {
    id: "guardian",
    name: "Guardian",
    tier: 1,
    desc: "Holds the line: taunts, shields and hits back.",
    levels: [
      { stats: { maxHp: 6, def: 1 }, passive: "stalwart" },
      { stats: { maxHp: 6, def: 1 }, skill: "jProvoke" },
      { stats: { maxHp: 6, def: 1, res: 1 }, passive: "counterguard" },
      { stats: { maxHp: 6, def: 1 }, skill: "jBulwark" },
      { stats: { maxHp: 8, def: 2 }, passive: "ironWill" }
    ]
  },
  {
    id: "ranger",
    name: "Ranger",
    tier: 1,
    desc: "Pins foes down from afar and walks any ground.",
    levels: [
      { stats: { atk: 1, luk: 1 }, passive: "keenEye" },
      { stats: { atk: 1, spd: 1 }, skill: "jPinningShot" },
      { stats: { atk: 1, luk: 1 }, passive: "sureFooted" },
      { stats: { atk: 1, spd: 1 }, skill: "jVolley" },
      { stats: { atk: 2, luk: 1 }, passive: "eagleEye" }
    ]
  },
  {
    id: "mage",
    name: "Mage",
    tier: 1,
    desc: "Elemental magic. Fragile, but nothing burns like it.",
    levels: [
      { stats: { maxMp: 3, mag: 1 }, passive: "arcaneMind" },
      { stats: { maxMp: 3, mag: 1 }, skill: "jFireBolt" },
      { stats: { maxMp: 4, mag: 1, res: 1 }, passive: "manaFlow" },
      { stats: { maxMp: 4, mag: 1 }, skill: "jBlizzard" },
      { stats: { maxMp: 5, mag: 2 }, passive: "spellEcho" }
    ]
  },
  {
    id: "cleric",
    name: "Cleric",
    tier: 1,
    desc: "Heals, cleanses and keeps everyone standing.",
    levels: [
      { stats: { maxMp: 3, res: 1 }, passive: "devotion" },
      { stats: { maxMp: 3, mag: 1 }, skill: "jMend" },
      { stats: { maxMp: 3, res: 1, maxHp: 3 }, passive: "sanctuaryAura" },
      { stats: { maxMp: 4, mag: 1 }, skill: "jPurify" },
      { stats: { maxMp: 4, res: 2 }, passive: "mercy" }
    ]
  },
  {
    id: "rogue",
    name: "Rogue",
    tier: 1,
    desc: "Fast, dirty, and deadly from behind.",
    levels: [
      { stats: { spd: 1, luk: 1 }, passive: "nimble" },
      { stats: { atk: 1, spd: 1 }, skill: "jCheapShot" },
      { stats: { atk: 1, luk: 1 }, passive: "assassinsEdge" },
      { stats: { atk: 1, spd: 1 }, skill: "jPoisonBlade" },
      { stats: { atk: 1, spd: 1, luk: 1 }, passive: "shadowstep" }
    ]
  },
  {
    id: "knight",
    name: "Knight",
    tier: 2,
    desc: "An armoured wall that protects everyone near it.",
    requires: { job: "guardian", level: 5 },
    levels: [
      { stats: { maxHp: 8, def: 2 }, passive: "knightsOath" },
      { stats: { maxHp: 8, def: 1, atk: 1 }, skill: "jShieldBash" },
      { stats: { maxHp: 8, def: 2, res: 1 }, passive: "lastBastion" },
      { stats: { maxHp: 8, atk: 2 }, skill: "jHolyCharge" },
      { stats: { maxHp: 10, def: 2, res: 2 }, passive: "paladin" }
    ]
  },
  {
    id: "berserker",
    name: "Berserker",
    tier: 2,
    desc: "Trades safety for carnage. Stronger the closer it is to falling.",
    requires: { job: "fighter", level: 5 },
    levels: [
      { stats: { maxHp: 6, atk: 2 }, passive: "bloodlust" },
      { stats: { maxHp: 6, atk: 2 }, skill: "jRecklessSwing" },
      { stats: { maxHp: 6, atk: 2 }, passive: "frenzy" },
      { stats: { maxHp: 6, atk: 2 }, skill: "jEarthsplitter" },
      { stats: { maxHp: 8, atk: 3 }, passive: "unstoppable" }
    ]
  },
  {
    id: "sniper",
    name: "Sniper",
    tier: 2,
    desc: "Patient, precise, lethal from high ground.",
    requires: { job: "ranger", level: 5 },
    levels: [
      { stats: { atk: 2, luk: 1 }, passive: "steadyAim" },
      { stats: { atk: 2 }, skill: "jHeadshot" },
      { stats: { atk: 2, luk: 2 }, passive: "deadeye" },
      { stats: { atk: 2 }, skill: "jPiercingArrow" },
      { stats: { atk: 3, luk: 2 }, passive: "overwatch" }
    ]
  },
  {
    id: "elementalist",
    name: "Elementalist",
    tier: 2,
    desc: "Storms and meteors. Wants a charged turn and a crowded enemy line.",
    requires: { job: "mage", level: 5 },
    levels: [
      { stats: { maxMp: 5, mag: 2 }, passive: "elementalMastery" },
      { stats: { maxMp: 5, mag: 2 }, skill: "jThunderstorm" },
      { stats: { maxMp: 5, mag: 2 }, passive: "burningSoul" },
      { stats: { maxMp: 5, mag: 2 }, skill: "jMeteor" },
      { stats: { maxMp: 6, mag: 3 }, passive: "manaSurge" }
    ]
  },
  {
    id: "sage",
    name: "Sage",
    tier: 2,
    desc: "Whole-party healing, shields and a hand back from the brink.",
    requires: { job: "cleric", level: 5 },
    levels: [
      { stats: { maxMp: 5, mag: 1, res: 1 }, passive: "wisdom" },
      { stats: { maxMp: 5, mag: 2 }, skill: "jSanctuary" },
      { stats: { maxMp: 5, res: 2 }, passive: "serenity" },
      { stats: { maxMp: 5, mag: 2 }, skill: "jRaise" },
      { stats: { maxMp: 6, mag: 2, res: 2 }, passive: "periBlessing" }
    ]
  },
  {
    id: "assassin",
    name: "Assassin",
    tier: 2,
    desc: "Marks a target and ends it.",
    requires: { job: "rogue", level: 5 },
    levels: [
      { stats: { atk: 2, spd: 1 }, passive: "silentKiller" },
      { stats: { atk: 2, luk: 1 }, skill: "jShadowStrike" },
      { stats: { atk: 2, spd: 1 }, passive: "venomous" },
      { stats: { atk: 2, luk: 1 }, skill: "jExecution" },
      { stats: { atk: 3, spd: 1 }, passive: "phantom" }
    ]
  },
  {
    id: "jester",
    name: "Jester",
    tier: 1,
    desc: "Peri's own job. Luck, timing, and an audience that refuses to let him die.",
    only: ["bin"],
    levels: [
      { stats: { maxHp: 3, luk: 2 }, passive: "jestersLuck" },
      { stats: { atk: 1, luk: 1 }, skill: "jCardTrick" },
      { stats: { maxHp: 4, spd: 1 }, passive: "improv" },
      { stats: { atk: 1, luk: 2 }, skill: "jGambit" },
      { stats: { maxHp: 5, atk: 1, luk: 2 }, passive: "plotArmor" }
    ]
  }
];

export const JOBS: Record<string, JobDef> = Object.fromEntries(LIST.map((job) => [job.id, job]));
export const JOB_IDS = LIST.map((job) => job.id);

/** Job EXP needed to go from level L to L+1 (index L-1). */
export const JOB_EXP = [40, 90, 160, 260];
export const JOB_MAX = 5;
