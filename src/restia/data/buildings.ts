import type { BuildingId, Condition, ItemId, NpcId } from "../engine/types";

export type BuildingLevel = {
  level: number;
  gold: number;
  items: Record<ItemId, number>;
  days: number;
  effect: string;
  requires?: Condition;
  requiresText?: string;
};

export type BuildingDef = {
  id: BuildingId;
  name: string;
  desc: string;
  levels: BuildingLevel[];
  /** Visual-novel backdrop key for the interior. */
  interior: string;
  owner?: NpcId;
  /** Opening hours in minutes; undefined = always open. */
  hours?: [number, number];
  /** Weekday (0 = Monday) the building is closed. */
  closedDay?: number;
};

const H = 60;

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  farmhouse: {
    id: "farmhouse",
    name: "Garr's Hut",
    desc: "The family cabin at the edge of Frostbitten. Its back door opens into Pocket Haven. Sleep, save, store items and (once expanded) cook.",
    interior: "home",
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "Three bunks, a chest and a draughty roof." },
      { level: 2, gold: 3000, items: { wood: 50, stone: 30 }, days: 3, effect: "A real kitchen (cooking) and a room of your own: +20 max stamina. Needed to marry." },
      { level: 3, gold: 8000, items: { hardwood: 20, ironIngot: 5 }, days: 3, effect: "Master bedroom: +30 max stamina." }
    ]
  },
  field: {
    id: "field",
    name: "Pocket Haven Field",
    desc: "The Jester System's pocket-dimension field behind Garr's back door. No snow, ever.",
    interior: "home",
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "8 x 5 plots." },
      { level: 2, gold: 1500, items: { wood: 30 }, days: 2, effect: "Clear more land: 12 x 6 plots." },
      { level: 3, gold: 5000, items: { wood: 60, stone: 60 }, days: 3, effect: "The whole pocket meadow: 16 x 7 plots." }
    ]
  },
  guild: {
    id: "guild",
    name: "Adventurers' Guild",
    desc: "Requests, rank exams and adventuring supplies.",
    interior: "guild",
    owner: "lysa",
    hours: [8 * H, 20 * H],
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "3 requests a day." },
      { level: 2, gold: 3000, items: { hardwood: 10, stone: 30 }, days: 3, effect: "5 requests a day; better-paying commissions." },
      { level: 3, gold: 8000, items: { silverIngot: 3, hardwood: 20 }, days: 4, effect: "7 requests a day; guild supply shop expands." }
    ]
  },
  store: {
    id: "store",
    name: "Tilde's Trading Post",
    desc: "Seeds, supplies, tea, and a shopkeeper who buys anything.",
    interior: "store",
    owner: "tilde",
    hours: [9 * H, 17 * H],
    closedDay: 6,
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "Seasonal seeds and basic supplies." },
      { level: 2, gold: 2000, items: { wood: 30 }, days: 2, effect: "Rare seeds (Mana Blossom, Moonberry, Pineapple), greater potions, return scrolls." },
      { level: 3, gold: 6000, items: { hardwood: 15 }, days: 3, effect: "Growth elixirs, lucky charms and fine goods; Golden Turnip seeds for master farmers (Farming 7)." }
    ]
  },
  shrine: {
    id: "shrine",
    name: "Weaver's Shrine",
    desc: "The old shrine of the Weaver of Fools (Peri, in Norheim myth). The Audience it gathers pays for her favours.",
    interior: "shrine",
    owner: "frida",
    levels: [
      { level: 0, gold: 0, items: {}, days: 0, effect: "Collapsed under the midwinter snow." },
      { level: 1, gold: 500, items: { stone: 20, wood: 20, dawnLily: 1 }, days: 2, effect: "Restored: Frida moves in and Peri's favours (Audience) become available." },
      { level: 2, gold: 3000, items: { lightCrystal: 2, stone: 40 }, days: 3, effect: "Starlit shrine: double Audience and cheaper favours.", requires: { kind: "rank", rank: "D" }, requiresText: "Guild rank D" }
    ]
  },
  smithy: {
    id: "smithy",
    name: "Ironhand Forge",
    desc: "Hilda's forge: smelting, weapons, armor and tool upgrades.",
    interior: "smithy",
    owner: "hilda",
    hours: [10 * H, 18 * H],
    closedDay: 6,
    levels: [
      { level: 0, gold: 0, items: {}, days: 0, effect: "The roof caved in under the midwinter snow." },
      { level: 1, gold: 1200, items: { stone: 30, wood: 20, ironOre: 5 }, days: 2, effect: "Hilda is back at her anvil. Smelting, bronze & iron gear, tool upgrades to Iron.", requires: { kind: "flag", key: "metHilda" }, requiresText: "Talk to Hilda in her tent" },
      { level: 2, gold: 4000, items: { ironIngot: 5, hardwood: 10 }, days: 3, effect: "Silver & mythril gear, tool upgrades to Silver, accessories, Ironleaf seeds." },
      { level: 3, gold: 12000, items: { goldIngot: 3, mythrilOre: 3 }, days: 4, effect: "Starsteel gear.", requires: { kind: "rank", rank: "B" }, requiresText: "Guild rank B" }
    ]
  },
  atelier: {
    id: "atelier",
    name: "Apothecary",
    desc: "Mitia's apothecary: potions, antidotes, fertilizer and bombs.",
    interior: "atelier",
    owner: "mitia",
    hours: [10 * H, 19 * H],
    levels: [
      { level: 0, gold: 0, items: {}, days: 0, effect: "Burned out last winter. Mitia brews in Garr's kitchen." },
      { level: 1, gold: 1000, items: { wood: 25, clay: 5, wildHerb: 5 }, days: 2, effect: "Mitia reopens the shop and joins the party. Potions, antidotes, fertilizer, bombs.", requires: { kind: "flag", key: "frostcapFound" }, requiresText: "Solve the frostcap shortage" },
      { level: 2, gold: 3500, items: { manaCrystal: 3, hardwood: 10 }, days: 3, effect: "Advanced alchemy: greater potions, elixirs, phoenix feathers, growth elixirs; Lamp Grass and crystal-bloom seeds." }
    ]
  },
  barn: {
    id: "barn",
    name: "Monster Barn",
    desc: "A home for befriended monsters. They help on the farm.",
    interior: "barn",
    levels: [
      { level: 0, gold: 0, items: {}, days: 0, effect: "No barn yet: monsters cannot be befriended." },
      { level: 1, gold: 1500, items: { wood: 40, stone: 10 }, days: 2, effect: "Room for 4 monsters." },
      { level: 2, gold: 4000, items: { hardwood: 15, ironIngot: 3 }, days: 3, effect: "Room for 8 monsters." }
    ]
  },
  inn: {
    id: "inn",
    name: "The Frosted Mug",
    desc: "Warm food, cold ale and dangerous gossip density.",
    interior: "inn",
    hours: [8 * H, 24 * H],
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "Soup, ale and a tavern cat. The guest rooms froze shut last winter." },
      { level: 2, gold: 2500, items: { wood: 40, stone: 20, linen: 5 }, days: 3, effect: "Guest rooms reopen: travellers can stay and new companions arrive.", requires: { kind: "rank", rank: "E" }, requiresText: "Guild rank E" },
      { level: 3, gold: 6000, items: { hardwood: 20, silverIngot: 2 }, days: 3, effect: "A packed tavern: +2 Audience a day and the kitchen sells feasts." }
    ]
  }
};

export const BUILDING_ORDER: BuildingId[] = ["farmhouse", "field", "shrine", "guild", "store", "smithy", "atelier", "barn", "inn"];

export const START_LEVELS: Record<BuildingId, number> = {
  farmhouse: 1,
  field: 1,
  guild: 1,
  store: 1,
  shrine: 0,
  smithy: 0,
  atelier: 0,
  barn: 0,
  inn: 1
};

export function maxLevel(id: BuildingId): number {
  return BUILDINGS[id].levels[BUILDINGS[id].levels.length - 1]!.level;
}

export const TOWN_RANKS = [
  { min: 0, name: "Frozen Outpost" },
  { min: 8, name: "Frontier Town" },
  { min: 14, name: "Thriving Town" },
  { min: 20, name: "Jewel of the North" }
] as const;
