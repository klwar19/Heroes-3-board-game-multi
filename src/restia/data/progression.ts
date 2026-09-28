import type { Condition, Effect, GuildRank, NpcId, RequestKind } from "../engine/types";

// ---------------------------------------------------------------------------
// Story quests
// ---------------------------------------------------------------------------

export type QuestDef = {
  id: string;
  chapter: number;
  title: string;
  desc: string;
  goals: { text: string; cond: Condition }[];
  rewards: Effect[];
  /** Quests started automatically when this one completes. */
  next?: string[];
  /** Scene played on completion. */
  scene?: string;
};

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  (
    [
      {
        id: "q1Farm", chapter: 1, title: "A Farm of One's Own",
        desc: "Hikari gave you an abandoned farm. Clear some land and plant your first seeds.",
        goals: [{ text: "Plant 6 crops", cond: { kind: "counter", key: "planted", n: 6 } }],
        rewards: [{ kind: "gold", n: 300 }], next: ["q3Harvest"]
      },
      {
        id: "q2Guild", chapter: 1, title: "The Adventurers' Guild",
        desc: "Register at the Adventurers' Guild in Dawnhollow village (north-east of the plaza).",
        goals: [{ text: "Register with Elise at the Guild", cond: { kind: "flag", key: "registered" } }],
        rewards: [{ kind: "item", id: "potion", n: 3 }], next: ["q4Forest", "q8Exam"]
      },
      {
        id: "q3Harvest", chapter: 1, title: "First Harvest",
        desc: "Water your crops every day. When they ripen, harvest them and put them in the shipping bin.",
        goals: [{ text: "Ship 5 items", cond: { kind: "shipped", n: 5 } }],
        rewards: [{ kind: "gold", n: 200 }, { kind: "ap", n: 2 }, { kind: "item", id: "seed-potato", n: 5 }]
      },
      {
        id: "q4Forest", chapter: 1, title: "The Whispering Forest",
        desc: "The forest north of the village is full of herbs, wood and monsters. Explore it.",
        goals: [
          { text: "Meet the forest's hunter", cond: { kind: "flag", key: "metNell" } },
          { text: "Defeat 3 monsters", cond: { kind: "defeated", n: 3 } }
        ],
        rewards: [{ kind: "gold", n: 200 }, { kind: "item", id: "monsterTreat", n: 3 }], next: ["q5Shrine", "qBarn"]
      },
      {
        id: "q5Shrine", chapter: 1, title: "Restore the Shrine",
        desc: "Hikari's shrine lies in ruins in the village. Restore it on the Restoration Board (wood, stone and a Dawn Lily from the forest).",
        goals: [{ text: "Restore the Sun Shrine", cond: { kind: "building", id: "shrine", level: 1 } }],
        rewards: [{ kind: "gold", n: 300 }]
      },
      {
        id: "q6Atelier", chapter: 1, title: "The Alchemist in the Woods",
        desc: "Mina needs a workshop. Build the Atelier on the Restoration Board.",
        goals: [{ text: "Build the Atelier", cond: { kind: "building", id: "atelier", level: 1 } }],
        rewards: [{ kind: "item", id: "potion", n: 5 }]
      },
      {
        id: "q7Smithy", chapter: 1, title: "Sparks and Steel",
        desc: "Tove needs a forge. Build the Smithy on the Restoration Board.",
        goals: [{ text: "Build the Smithy", cond: { kind: "building", id: "smithy", level: 1 } }],
        rewards: [{ kind: "item", id: "ironOre", n: 6 }]
      },
      {
        id: "q8Exam", chapter: 1, title: "Rank E Exam",
        desc: "Earn 60 Guild Points from requests, then ask Elise for the rank exam.",
        goals: [{ text: "Reach Guild rank E", cond: { kind: "rank", rank: "E" } }],
        rewards: [{ kind: "gold", n: 500 }], next: ["qInn"]
      },
      {
        id: "q9Catacombs", chapter: 1, title: "Beneath the Old Capital",
        desc: "The catacombs open through the cave at the end of the Whispering Forest. Reach floor 3.",
        goals: [{ text: "Reach floor 3", cond: { kind: "floor", n: 3 } }],
        rewards: [{ kind: "gold", n: 500 }, { kind: "item", id: "returnScroll", n: 2 }], next: ["q10Lord"]
      },
      {
        id: "q10Lord", chapter: 1, title: "The Labyrinth Lord",
        desc: "Something guards floor 5. Defeat it.",
        goals: [{ text: "Defeat the Labyrinth Lord", cond: { kind: "flag", key: "boss5" } }],
        rewards: [{ kind: "gold", n: 1000 }]
      },
      {
        id: "q11Knight", chapter: 2, title: "The Knight of Erathia",
        desc: "A knight is asking about the hero of Dawnhollow. With the inn built, she will stay.",
        goals: [{ text: "Recruit Seren", cond: { kind: "recruited", id: "seren" } }],
        rewards: [{ kind: "gold", n: 500 }]
      },
      {
        id: "q12Fox", chapter: 2, title: "Fox Tracks",
        desc: "Become good friends with Nell (3 hearts). Once the inn is built she might move to the village.",
        goals: [{ text: "Recruit Nell", cond: { kind: "recruited", id: "nell" } }],
        rewards: [{ kind: "gold", n: 500 }]
      },
      {
        id: "q13Rival", chapter: 2, title: "Rival",
        desc: "Kaito won't let a farmer outrank him. Earn 250 GP and take the Rank D exam.",
        goals: [{ text: "Reach Guild rank D", cond: { kind: "rank", rank: "D" } }],
        rewards: [{ kind: "gold", n: 800 }], next: ["q14Halls", "q12Fox"]
      },
      {
        id: "q14Halls", chapter: 2, title: "The Drowned Halls",
        desc: "Descend through the Flooded Halls and defeat whatever rules floor 10.",
        goals: [{ text: "Defeat the floor 10 guardian", cond: { kind: "flag", key: "boss10" } }],
        rewards: [{ kind: "gold", n: 2000 }], next: ["q15Deep"]
      },
      {
        id: "q15Deep", chapter: 3, title: "Into the Deep",
        desc: "A chant rises from the Ember Depths. Reach floor 15.",
        goals: [{ text: "Defeat the floor 15 guardian", cond: { kind: "flag", key: "boss15" } }],
        rewards: [{ kind: "gold", n: 4000 }], next: ["q16Godfall"]
      },
      {
        id: "q16Godfall", chapter: 4, title: "Godfall",
        desc: "The Abyssal Rift. The Avatar of Erebos waits on floor 20.",
        goals: [{ text: "Defeat the Avatar of Erebos", cond: { kind: "flag", key: "boss20" } }],
        rewards: [{ kind: "gold", n: 10000 }]
      },
      {
        id: "qBarn", chapter: 1, title: "A Home for Monsters",
        desc: "Build a Monster Barn so beaten monsters can be befriended (Befriend in battle, better with a Monster Treat).",
        goals: [
          { text: "Build the Monster Barn", cond: { kind: "building", id: "barn", level: 1 } },
          { text: "Befriend a monster", cond: { kind: "tamed", n: 1 } }
        ],
        rewards: [{ kind: "item", id: "monsterTreat", n: 5 }, { kind: "ap", n: 2 }]
      },
      {
        id: "qInn", chapter: 1, title: "Lights of the Inn",
        desc: "Travellers need a place to stay. Build the Dawnhollow Inn.",
        goals: [{ text: "Build the Inn", cond: { kind: "building", id: "inn", level: 1 } }],
        rewards: [{ kind: "gold", n: 500 }]
      }
    ] satisfies QuestDef[]
  ).map((quest) => [quest.id, quest])
);

// ---------------------------------------------------------------------------
// Guild
// ---------------------------------------------------------------------------

export const RANKS: GuildRank[] = ["F", "E", "D", "C", "B", "A", "S"];
/** GP needed to be promoted INTO the rank. */
export const RANK_GP: Record<GuildRank, number> = { F: 0, E: 60, D: 250, C: 600, B: 1200, A: 2500, S: 5000 };
/** Extra requirement besides GP (the exam) for promotion into the rank. */
export const RANK_EXAM: Record<GuildRank, { text: string; cond?: Condition; scene?: string }> = {
  F: { text: "" },
  E: { text: "Defeat the Goblin Chief (exam battle)", scene: "examF" },
  D: { text: "Win a sparring match against Kaito", scene: "examE", cond: { kind: "flag", key: "metKaito" } },
  C: { text: "Defeat the floor 10 guardian", cond: { kind: "flag", key: "boss10" } },
  B: { text: "Defeat the floor 15 guardian", cond: { kind: "flag", key: "boss15" } },
  A: { text: "Reach floor 18", cond: { kind: "floor", n: 18 } },
  S: { text: "Defeat the Avatar of Erebos", cond: { kind: "flag", key: "boss20" } }
};

export function rankIndex(rank: GuildRank): number {
  return RANKS.indexOf(rank);
}

export type RequestTemplate = {
  kind: RequestKind;
  target: string;
  amount: [number, number];
  rank: GuildRank;
  /** Reward gold per unit. */
  unit: number;
  gp: number;
  clients: NpcId[];
  /** Offered only once this holds (stations for craft requests). */
  when?: Condition;
};

const VILLAGERS: NpcId[] = ["guildGirl", "pip", "hikari"];

export const REQUEST_TEMPLATES: RequestTemplate[] = [
  { kind: "gather", target: "wildHerb", amount: [3, 6], rank: "F", unit: 40, gp: 8, clients: ["pip", "guildGirl"] },
  { kind: "gather", target: "mushroom", amount: [2, 4], rank: "F", unit: 55, gp: 8, clients: ["pip", "nell"] },
  { kind: "gather", target: "wood", amount: [10, 20], rank: "F", unit: 16, gp: 8, clients: ["pip", "tove"] },
  { kind: "gather", target: "stone", amount: [10, 20], rank: "F", unit: 14, gp: 8, clients: ["pip", "tove"] },
  { kind: "gather", target: "medicinalHerb", amount: [2, 4], rank: "E", unit: 90, gp: 12, clients: ["mina", "guildGirl"] },
  { kind: "gather", target: "glowcap", amount: [1, 3], rank: "E", unit: 160, gp: 14, clients: ["mina"] },
  { kind: "gather", target: "ironOre", amount: [3, 6], rank: "E", unit: 60, gp: 12, clients: ["tove", "pip"] },
  { kind: "gather", target: "manaCrystal", amount: [1, 3], rank: "D", unit: 150, gp: 18, clients: ["mina", "hikari"] },
  { kind: "gather", target: "silverOre", amount: [2, 4], rank: "C", unit: 110, gp: 22, clients: ["tove"] },
  { kind: "gather", target: "lizardScale", amount: [2, 4], rank: "C", unit: 110, gp: 22, clients: ["tove", "seren"] },
  { kind: "gather", target: "fireCrystal", amount: [2, 3], rank: "B", unit: 170, gp: 30, clients: ["mina", "tove"] },
  { kind: "gather", target: "darkCrystal", amount: [1, 2], rank: "A", unit: 300, gp: 45, clients: ["hikari", "seren"] },
  { kind: "deliver", target: "crop", amount: [3, 8], rank: "F", unit: 0, gp: 10, clients: VILLAGERS },
  { kind: "hunt", target: "goblin", amount: [3, 5], rank: "F", unit: 45, gp: 10, clients: ["guildGirl", "pip"] },
  { kind: "hunt", target: "boar", amount: [2, 4], rank: "F", unit: 50, gp: 10, clients: ["pip"] },
  { kind: "hunt", target: "sprite", amount: [2, 3], rank: "F", unit: 50, gp: 10, clients: ["guildGirl"] },
  { kind: "hunt", target: "harpy", amount: [2, 3], rank: "E", unit: 70, gp: 14, clients: ["guildGirl", "nell"] },
  { kind: "hunt", target: "skeleton", amount: [3, 5], rank: "E", unit: 70, gp: 14, clients: ["hikari", "guildGirl"] },
  { kind: "hunt", target: "zombie", amount: [3, 5], rank: "E", unit: 70, gp: 14, clients: ["hikari"] },
  { kind: "hunt", target: "kobold", amount: [3, 5], rank: "E", unit: 60, gp: 12, clients: ["tove"] },
  { kind: "hunt", target: "wight", amount: [2, 3], rank: "D", unit: 110, gp: 18, clients: ["hikari", "seren"] },
  { kind: "hunt", target: "lizardWarrior", amount: [3, 5], rank: "C", unit: 120, gp: 22, clients: ["seren", "guildGirl"] },
  { kind: "hunt", target: "basilisk", amount: [2, 3], rank: "C", unit: 160, gp: 24, clients: ["seren"] },
  { kind: "hunt", target: "hellHound", amount: [2, 4], rank: "B", unit: 200, gp: 30, clients: ["seren", "kaito"] },
  { kind: "hunt", target: "imp", amount: [3, 5], rank: "B", unit: 170, gp: 28, clients: ["hikari"] },
  { kind: "hunt", target: "blackKnight", amount: [2, 3], rank: "A", unit: 320, gp: 45, clients: ["seren", "kaito"] },
  { kind: "craft", target: "potion", amount: [2, 4], rank: "E", unit: 120, gp: 12, clients: ["guildGirl", "seren"], when: { kind: "building", id: "atelier", level: 1 } },
  { kind: "craft", target: "ironIngot", amount: [1, 3], rank: "E", unit: 200, gp: 14, clients: ["pip", "kaito"], when: { kind: "building", id: "smithy", level: 1 } },
  { kind: "craft", target: "stew", amount: [1, 2], rank: "D", unit: 320, gp: 16, clients: ["seren", "tove"], when: { kind: "building", id: "farmhouse", level: 2 } },
  { kind: "explore", target: "floor", amount: [1, 2], rank: "E", unit: 0, gp: 16, clients: ["guildGirl", "kaito"], when: { kind: "flag", key: "catacombsOpen" } }
];

export const MAX_ACCEPTED_REQUESTS = 3;
export const REQUESTS_PER_GUILD_LEVEL = [0, 3, 5, 7];

// ---------------------------------------------------------------------------
// System missions (daily) & Admin Console
// ---------------------------------------------------------------------------

export type MissionTemplate = { id: string; text: string; key: string; n: [number, number]; ap: number; when?: Condition };

export const MISSIONS: MissionTemplate[] = [
  { id: "water", text: "Water {n} crops", key: "water", n: [6, 12], ap: 1 },
  { id: "harvest", text: "Harvest {n} crops", key: "harvest", n: [3, 8], ap: 1 },
  { id: "till", text: "Till {n} plots", key: "till", n: [4, 10], ap: 1 },
  { id: "ship", text: "Ship {n} items (counted when the bin pays out at night)", key: "ship", n: [5, 15], ap: 1 },
  { id: "talk", text: "Talk with {n} people", key: "talk", n: [2, 4], ap: 1 },
  { id: "gift", text: "Give {n} gifts", key: "gift", n: [1, 3], ap: 1 },
  { id: "forage", text: "Gather {n} wild items", key: "forage", n: [3, 6], ap: 1 },
  { id: "defeat", text: "Defeat {n} monsters", key: "defeat", n: [3, 8], ap: 2, when: { kind: "flag", key: "registered" } },
  { id: "craft", text: "Craft or cook {n} items", key: "craft", n: [1, 3], ap: 1, when: { kind: "any", of: [{ kind: "building", id: "atelier", level: 1 }, { kind: "building", id: "smithy", level: 1 }, { kind: "building", id: "farmhouse", level: 2 }] } },
  { id: "floor", text: "Descend {n} dungeon floors", key: "floor", n: [2, 4], ap: 2, when: { kind: "flag", key: "catacombsOpen" } },
  { id: "befriend", text: "Befriend {n} monster", key: "befriend", n: [1, 1], ap: 3, when: { kind: "building", id: "barn", level: 1 } }
];

export type PerkDef = { id: string; name: string; desc: string; cost: number };

export const PERKS: PerkDef[] = [
  { id: "bigCan", name: "Bottomless Can", desc: "Watering can holds twice as much.", cost: 2 },
  { id: "staminaPlus", name: "Stamina+", desc: "+30 max stamina.", cost: 3 },
  { id: "tamer", name: "Monster Whisperer", desc: "+15% Befriend chance.", cost: 3 },
  { id: "efficientTools", name: "Efficient Tools", desc: "Tools cost 25% less stamina.", cost: 4 },
  { id: "quickLearner", name: "Quick Learner", desc: "+20% battle EXP.", cost: 4 },
  { id: "treasureSense", name: "Treasure Sense", desc: "+25% battle gold and +10% drop chance.", cost: 4 },
  { id: "greenThumb", name: "Green Thumb", desc: "Watered crops have a 15% chance to grow an extra day overnight.", cost: 5 },
  { id: "merchant", name: "Merchant's Tongue", desc: "+10% from shipping and selling.", cost: 5 },
  { id: "silverTongue", name: "Silver Tongue", desc: "+25% friendship from talking and gifts.", cost: 5 },
  { id: "autoAnalyze", name: "Auto-Analyze", desc: "Every monster is analyzed the moment a battle starts.", cost: 6 },
  { id: "partySlot", name: "Party Expansion", desc: "Bring 5 fighters into battle instead of 4.", cost: 8 }
];

// ---------------------------------------------------------------------------
// Shrine blessings (Faith)
// ---------------------------------------------------------------------------

export type BlessingDef = { id: string; name: string; desc: string; cost: number };

export const BLESSINGS: BlessingDef[] = [
  { id: "vigor", name: "Blessing of Vigor", desc: "Restore 60 stamina now.", cost: 15 },
  { id: "rain", name: "Blessing of Rain", desc: "Tomorrow it will rain (crops watered for free).", cost: 20 },
  { id: "valor", name: "Blessing of Valor", desc: "Today: party ATK and DEF +15%.", cost: 30 },
  { id: "fortune", name: "Blessing of Fortune", desc: "Today: +30% battle gold and shipping value.", cost: 30 }
];

// ---------------------------------------------------------------------------
// Friendship tuning
// ---------------------------------------------------------------------------

export const POINTS_PER_HEART = 100;
export const GIFT_POINTS = { love: 80, like: 45, neutral: 20, dislike: -20, hate: -40 } as const;
export const TALK_POINTS = 10;
export const GIFTS_PER_WEEK = 2;
