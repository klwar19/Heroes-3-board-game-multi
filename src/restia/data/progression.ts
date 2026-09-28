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
      // --- Chapter 1: Snow on the Road Home (Haven arc 1) ---
      {
        id: "q1Farm", chapter: 1, title: "Pocket Haven",
        desc: "Behind Garr's back door there is now a meadow where it is never winter: Pocket Haven, courtesy of the Jester System. Clear some land and plant the first seeds.",
        goals: [{ text: "Plant 6 crops", cond: { kind: "counter", key: "planted", n: 6 } }],
        rewards: [{ kind: "gold", n: 300 }], next: ["q3Harvest"]
      },
      {
        id: "q2Guild", chapter: 1, title: "Legally Deceased",
        desc: "The Adventurers' Guild filed you as dead two months ago. Go to the Guild (north-east of the square) and un-die at the front desk.",
        goals: [{ text: "Get re-registered by Lysa at the Guild", cond: { kind: "flag", key: "registered" } }],
        rewards: [{ kind: "item", id: "potion", n: 3 }], next: ["q4Frostcap", "q8Exam"]
      },
      {
        id: "q3Harvest", chapter: 1, title: "First Harvest",
        desc: "Water your crops every day. When they ripen, harvest them and put them in the shipping crate in Pocket Haven.",
        goals: [{ text: "Ship 5 items", cond: { kind: "shipped", n: 5 } }],
        rewards: [{ kind: "gold", n: 200 }, { kind: "ap", n: 2 }, { kind: "item", id: "seed-potato", n: 5 }]
      },
      {
        id: "q4Frostcap", chapter: 1, title: "Frostcap Shortage",
        desc: "Tessa's warm-up job. Mitia is three weeks short of frostcap for her cough drops, and the gate logs the shipments as 'redirected'. Gather frostcaps in the Frostwood (north of the square) and bring them home.",
        goals: [{ text: "Gather 5 Frostcaps", cond: { kind: "item", id: "glowcap", n: 5 } }],
        rewards: [{ kind: "item", id: "glowcap", n: -5 }, { kind: "gold", n: 250 }, { kind: "flag", key: "frostcapFound", value: true }, { kind: "count", key: "candleCoins", n: 1 }],
        scene: "frostcapDone", next: ["q6Atelier", "q5Log", "qBarn"]
      },
      {
        id: "q5Log", chapter: 1, title: "The Screaming Log",
        desc: "The woodshed log behind the Frosted Mug has started screaming. In rhyme. Visit the Mug (east of the square).",
        goals: [{ text: "Deal with the screaming log", cond: { kind: "flag", key: "spriteJarred" } }],
        rewards: [{ kind: "gold", n: 200 }, { kind: "ap", n: 1 }], next: ["q7Cat"]
      },
      {
        id: "q6Atelier", chapter: 1, title: "Mitia's Apothecary",
        desc: "Mitia has been brewing in Garr's kitchen since her shop burned. Rebuild the Apothecary on the Outpost Board in the square.",
        goals: [{ text: "Rebuild the Apothecary", cond: { kind: "building", id: "atelier", level: 1 } }],
        rewards: [{ kind: "item", id: "potion", n: 5 }]
      },
      {
        id: "q7Cat", chapter: 1, title: "The Cat Job",
        desc: "Mittens, the Frosted Mug's cat, has been missing for four days. Tuli (six, armed with a wooden sword) is paying in unsalted biscuits. Ask at the Mug, then follow the trail into the Frostwood.",
        goals: [{ text: "Bring Mittens home", cond: { kind: "flag", key: "catDone" } }],
        rewards: [{ kind: "gold", n: 300 }, { kind: "item", id: "bread", n: 3 }], next: ["q9Dinner"]
      },
      {
        id: "q9Dinner", chapter: 1, title: "Bread, Stew, and a Knock at the Door",
        desc: "Once Mitia's apothecary is open again, come home to Garr's hut in the evening (after 5 PM) for the family dinner Garr has been cooking for two months.",
        goals: [{ text: "Have dinner at Garr's hut", cond: { kind: "flag", key: "dinnerDone" } }],
        rewards: [{ kind: "gold", n: 500 }, { kind: "ap", n: 3 }]
      },
      {
        id: "q5Shrine", chapter: 1, title: "The Weaver's Shrine",
        desc: "Frida keeps the snowed-in shrine of the Weaver of Fools. Peri is VERY interested. Restore it on the Outpost Board (wood, stone and a Starbloom from the Frostwood).",
        goals: [{ text: "Restore the Weaver's Shrine", cond: { kind: "building", id: "shrine", level: 1 } }],
        rewards: [{ kind: "gold", n: 300 }]
      },
      {
        id: "q7Smithy", chapter: 1, title: "Iron and Snow",
        desc: "The Ironhand Forge's roof caved in under the midwinter snow. Rebuild it on the Outpost Board so Hilda can get back to her anvil.",
        goals: [{ text: "Rebuild the Ironhand Forge", cond: { kind: "building", id: "smithy", level: 1 } }],
        rewards: [{ kind: "item", id: "ironOre", n: 6 }]
      },
      {
        id: "q8Exam", chapter: 1, title: "Rank E Exam",
        desc: "Earn 60 Guild Points from requests, then ask Lysa for Tessa's field test.",
        goals: [{ text: "Reach Guild rank E", cond: { kind: "rank", rank: "E" } }],
        rewards: [{ kind: "gold", n: 500 }], next: ["qInn"]
      },
      {
        id: "qBarn", chapter: 1, title: "A Home for Monsters",
        desc: "Build a Monster Barn in Pocket Haven so beaten monsters can be befriended (Befriend in battle, better with a Monster Treat).",
        goals: [
          { text: "Build the Monster Barn", cond: { kind: "building", id: "barn", level: 1 } },
          { text: "Befriend a monster", cond: { kind: "tamed", n: 1 } }
        ],
        rewards: [{ kind: "item", id: "monsterTreat", n: 5 }, { kind: "ap", n: 2 }]
      },
      {
        id: "qInn", chapter: 1, title: "Rooms at the Mug",
        desc: "The Frosted Mug's guest rooms froze shut last winter. Reopen them so travellers can stay in Frostbitten again.",
        goals: [{ text: "Reopen the Mug's guest rooms", cond: { kind: "building", id: "inn", level: 2 } }],
        rewards: [{ kind: "gold", n: 500 }]
      },
      {
        id: "q9Catacombs", chapter: 1, title: "The Old Temple Ruins",
        desc: "The ruins open through the old stone doorway at the far end of the Frostwood. Reach floor 3.",
        goals: [{ text: "Reach floor 3", cond: { kind: "floor", n: 3 } }],
        rewards: [{ kind: "gold", n: 500 }, { kind: "item", id: "returnScroll", n: 2 }], next: ["q10Lord"]
      },
      {
        id: "q10Lord", chapter: 1, title: "The Temple Chimera",
        desc: "Something with three heads and no manners guards floor 5. Defeat it.",
        goals: [{ text: "Defeat the Temple Chimera", cond: { kind: "flag", key: "boss5" } }],
        rewards: [{ kind: "gold", n: 1000 }]
      },

      // --- Chapter 2+ ---
      {
        id: "q11Knight", chapter: 2, title: "The Warring Princess",
        desc: "A lavender-haired mercenary is asking about whoever beat the Temple Chimera. With the Mug's rooms open, she will stay.",
        goals: [{ text: "Recruit Senna", cond: { kind: "recruited", id: "senna" } }],
        rewards: [{ kind: "gold", n: 500 }]
      },
      {
        id: "q13Rival", chapter: 2, title: "Rival",
        desc: "Dain won't let 'the ghost' outrank him. Earn 250 GP and take the Rank D exam.",
        goals: [{ text: "Reach Guild rank D", cond: { kind: "rank", rank: "D" } }],
        rewards: [{ kind: "gold", n: 800 }], next: ["q14Halls"]
      },
      {
        id: "q14Halls", chapter: 2, title: "The Drowned Cloister",
        desc: "Descend through the flooded cloister and defeat whatever rules floor 10.",
        goals: [{ text: "Defeat the floor 10 guardian", cond: { kind: "flag", key: "boss10" } }],
        rewards: [{ kind: "gold", n: 2000 }], next: ["q15Deep"]
      },
      {
        id: "q15Deep", chapter: 3, title: "Into the Deep",
        desc: "A chant rises from the Ember Vaults. Reach floor 15.",
        goals: [{ text: "Defeat the floor 15 guardian", cond: { kind: "flag", key: "boss15" } }],
        rewards: [{ kind: "gold", n: 4000 }], next: ["q16Godfall"]
      },
      {
        id: "q16Godfall", chapter: 4, title: "The Judge's Herald",
        desc: "The Rift beneath the temple. The Herald of the Ethereal Judge waits on floor 20.",
        goals: [{ text: "Defeat the Herald", cond: { kind: "flag", key: "boss20" } }],
        rewards: [{ kind: "gold", n: 10000 }]
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
  E: { text: "Tessa's field test: the Goblin Chief (exam battle)", scene: "examF" },
  D: { text: "Win a sparring match against Dain", scene: "examE", cond: { kind: "flag", key: "metDain" } },
  C: { text: "Defeat the floor 10 guardian", cond: { kind: "flag", key: "boss10" } },
  B: { text: "Defeat the floor 15 guardian", cond: { kind: "flag", key: "boss15" } },
  A: { text: "Reach floor 18", cond: { kind: "floor", n: 18 } },
  S: { text: "Defeat the Herald of the Ethereal Judge", cond: { kind: "flag", key: "boss20" } }
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

const VILLAGERS: NpcId[] = ["lysa", "tilde", "garr", "mitia"];

export const REQUEST_TEMPLATES: RequestTemplate[] = [
  { kind: "gather", target: "wildHerb", amount: [3, 6], rank: "F", unit: 40, gp: 8, clients: ["tilde", "lysa"] },
  { kind: "gather", target: "mushroom", amount: [2, 4], rank: "F", unit: 55, gp: 8, clients: ["tilde", "bowy"] },
  { kind: "gather", target: "wood", amount: [10, 20], rank: "F", unit: 16, gp: 8, clients: ["tilde", "hilda"] },
  { kind: "gather", target: "stone", amount: [10, 20], rank: "F", unit: 14, gp: 8, clients: ["tilde", "hilda"] },
  { kind: "gather", target: "medicinalHerb", amount: [2, 4], rank: "E", unit: 90, gp: 12, clients: ["mitia", "lysa"] },
  { kind: "gather", target: "glowcap", amount: [1, 3], rank: "E", unit: 160, gp: 14, clients: ["mitia"] },
  { kind: "gather", target: "ironOre", amount: [3, 6], rank: "E", unit: 60, gp: 12, clients: ["hilda", "tilde"] },
  { kind: "gather", target: "manaCrystal", amount: [1, 3], rank: "D", unit: 150, gp: 18, clients: ["mitia", "mara"] },
  { kind: "gather", target: "silverOre", amount: [2, 4], rank: "C", unit: 110, gp: 22, clients: ["hilda"] },
  { kind: "gather", target: "lizardScale", amount: [2, 4], rank: "C", unit: 110, gp: 22, clients: ["hilda", "senna"] },
  { kind: "gather", target: "fireCrystal", amount: [2, 3], rank: "B", unit: 170, gp: 30, clients: ["mitia", "hilda"] },
  { kind: "gather", target: "darkCrystal", amount: [1, 2], rank: "A", unit: 300, gp: 45, clients: ["frida", "senna"] },
  { kind: "deliver", target: "crop", amount: [3, 8], rank: "F", unit: 0, gp: 10, clients: VILLAGERS },
  { kind: "hunt", target: "goblin", amount: [3, 5], rank: "F", unit: 45, gp: 10, clients: ["lysa", "tilde"] },
  { kind: "hunt", target: "boar", amount: [2, 4], rank: "F", unit: 50, gp: 10, clients: ["tilde"] },
  { kind: "hunt", target: "sprite", amount: [2, 3], rank: "F", unit: 50, gp: 10, clients: ["lysa"] },
  { kind: "hunt", target: "harpy", amount: [2, 3], rank: "E", unit: 70, gp: 14, clients: ["lysa", "bowy"] },
  { kind: "hunt", target: "skeleton", amount: [3, 5], rank: "E", unit: 70, gp: 14, clients: ["frida", "lysa"] },
  { kind: "hunt", target: "zombie", amount: [3, 5], rank: "E", unit: 70, gp: 14, clients: ["frida"] },
  { kind: "hunt", target: "kobold", amount: [3, 5], rank: "E", unit: 60, gp: 12, clients: ["hilda"] },
  { kind: "hunt", target: "wight", amount: [2, 3], rank: "D", unit: 110, gp: 18, clients: ["frida", "senna"] },
  { kind: "hunt", target: "lizardWarrior", amount: [3, 5], rank: "C", unit: 120, gp: 22, clients: ["senna", "lysa"] },
  { kind: "hunt", target: "basilisk", amount: [2, 3], rank: "C", unit: 160, gp: 24, clients: ["senna"] },
  { kind: "hunt", target: "hellHound", amount: [2, 4], rank: "B", unit: 200, gp: 30, clients: ["senna", "dain"] },
  { kind: "hunt", target: "imp", amount: [3, 5], rank: "B", unit: 170, gp: 28, clients: ["frida"] },
  { kind: "hunt", target: "blackKnight", amount: [2, 3], rank: "A", unit: 320, gp: 45, clients: ["senna", "dain"] },
  { kind: "craft", target: "potion", amount: [2, 4], rank: "E", unit: 120, gp: 12, clients: ["lysa", "senna"], when: { kind: "building", id: "atelier", level: 1 } },
  { kind: "craft", target: "ironIngot", amount: [1, 3], rank: "E", unit: 200, gp: 14, clients: ["tilde", "dain"], when: { kind: "building", id: "smithy", level: 1 } },
  { kind: "craft", target: "stew", amount: [1, 2], rank: "D", unit: 320, gp: 16, clients: ["senna", "hilda"], when: { kind: "building", id: "farmhouse", level: 2 } },
  { kind: "explore", target: "floor", amount: [1, 2], rank: "E", unit: 0, gp: 16, clients: ["lysa", "dain"], when: { kind: "flag", key: "catacombsOpen" } }
];

export const MAX_ACCEPTED_REQUESTS = 3;
export const REQUESTS_PER_GUILD_LEVEL = [0, 3, 5, 7];

// ---------------------------------------------------------------------------
// Jester Bits (daily missions) & the Cosmic Jester Shop
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

export type PerkDef = {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** Another shop item that must be bought first. */
  requires?: string;
  /** Scene played right after buying (story purchases). */
  scene?: string;
};

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
  { id: "partySlot", name: "Party Expansion", desc: "Bring 5 fighters into battle instead of 4.", cost: 8 },
  { id: "lilyCrystal1", name: "Healing Crystal for Lily", desc: "Peri delivers a healing crystal to Lily's hospital room on Earth. Story item: plays a call with Lily.", cost: 5, scene: "lilyCall1" },
  { id: "lilyCrystal2", name: "Greater Healing Crystal", desc: "A stronger crystal for Lily's treatment. Story item: plays a call with Lily.", cost: 12, requires: "lilyCrystal1", scene: "lilyCall2" },
  { id: "lilyCrystal3", name: "Radiant Healing Crystal", desc: "The best crystal the Jester Shop stocks this season. Story item: plays a call with Lily.", cost: 25, requires: "lilyCrystal2", scene: "lilyCall3" }
];

// ---------------------------------------------------------------------------
// Peri's favours at the Weaver's Shrine (Audience)
// ---------------------------------------------------------------------------

export type BlessingDef = { id: string; name: string; desc: string; cost: number };

export const BLESSINGS: BlessingDef[] = [
  { id: "vigor", name: "Second Act", desc: "Restore 60 stamina now.", cost: 15 },
  { id: "rain", name: "Convenient Weather", desc: "Tomorrow it will rain (crops watered for free).", cost: 20 },
  { id: "valor", name: "Plot Armor", desc: "Today: party ATK and DEF +15%.", cost: 30 },
  { id: "fortune", name: "Good Ratings", desc: "Today: +30% battle gold and shipping value.", cost: 30 }
];

// ---------------------------------------------------------------------------
// Friendship tuning
// ---------------------------------------------------------------------------

export const POINTS_PER_HEART = 100;
export const GIFT_POINTS = { love: 80, like: 45, neutral: 20, dislike: -20, hate: -40 } as const;
export const TALK_POINTS = 10;
export const GIFTS_PER_WEEK = 2;
