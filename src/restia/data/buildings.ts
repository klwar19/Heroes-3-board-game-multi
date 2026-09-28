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
    name: "Farmhouse",
    desc: "Bin's home. Sleep, save, store items and (once expanded) cook.",
    interior: "home",
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "A bed, a chest and a leaky roof." },
      { level: 2, gold: 3000, items: { wood: 50, stone: 30 }, days: 3, effect: "Kitchen (cooking) and a proper bedroom: +20 max stamina. Needed to marry." },
      { level: 3, gold: 8000, items: { hardwood: 20, ironIngot: 5 }, days: 3, effect: "Master bedroom: +30 max stamina." }
    ]
  },
  field: {
    id: "field",
    name: "Farm Field",
    desc: "Tillable land on the farm.",
    interior: "home",
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "8 x 5 plots." },
      { level: 2, gold: 1500, items: { wood: 30 }, days: 2, effect: "Clear more land: 12 x 6 plots." },
      { level: 3, gold: 5000, items: { wood: 60, stone: 60 }, days: 3, effect: "The whole valley floor: 16 x 7 plots." }
    ]
  },
  guild: {
    id: "guild",
    name: "Adventurers' Guild",
    desc: "Requests, rank exams and adventuring supplies.",
    interior: "guild",
    owner: "guildGirl",
    hours: [8 * H, 20 * H],
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "3 requests a day." },
      { level: 2, gold: 3000, items: { hardwood: 10, stone: 30 }, days: 3, effect: "5 requests a day; better-paying commissions." },
      { level: 3, gold: 8000, items: { silverIngot: 3, hardwood: 20 }, days: 4, effect: "7 requests a day; guild supply shop expands." }
    ]
  },
  store: {
    id: "store",
    name: "Pip's General Store",
    desc: "Seeds, supplies and a merchant who buys anything.",
    interior: "store",
    owner: "pip",
    hours: [9 * H, 17 * H],
    closedDay: 6,
    levels: [
      { level: 1, gold: 0, items: {}, days: 0, effect: "Seasonal seeds and basic supplies." },
      { level: 2, gold: 2000, items: { wood: 30 }, days: 2, effect: "Otherworld seeds (Mana Blossom, Moonberry), greater potions, return scrolls." },
      { level: 3, gold: 6000, items: { hardwood: 15 }, days: 3, effect: "Growth elixirs, lucky charms and fine goods." }
    ]
  },
  shrine: {
    id: "shrine",
    name: "Sun Shrine",
    desc: "Hikari's shrine. Faith gathered here powers her blessings.",
    interior: "shrine",
    owner: "hikari",
    levels: [
      { level: 0, gold: 0, items: {}, days: 0, effect: "In ruins." },
      { level: 1, gold: 500, items: { stone: 20, wood: 20, dawnLily: 1 }, days: 2, effect: "Restored: Hikari joins the party and blessings become available." },
      { level: 2, gold: 3000, items: { lightCrystal: 2, stone: 40 }, days: 3, effect: "Radiant shrine: double faith income and stronger blessings.", requires: { kind: "rank", rank: "D" }, requiresText: "Guild rank D" }
    ]
  },
  smithy: {
    id: "smithy",
    name: "Smithy",
    desc: "Tove's forge: smelting, weapons, armor and tool upgrades.",
    interior: "smithy",
    owner: "tove",
    hours: [10 * H, 18 * H],
    closedDay: 6,
    levels: [
      { level: 0, gold: 0, items: {}, days: 0, effect: "An empty lot." },
      { level: 1, gold: 1200, items: { stone: 30, wood: 20, ironOre: 5 }, days: 2, effect: "Tove moves in. Smelting, bronze & iron gear, tool upgrades to Iron.", requires: { kind: "flag", key: "metTove" }, requiresText: "Meet the dwarven smith" },
      { level: 2, gold: 4000, items: { ironIngot: 5, hardwood: 10 }, days: 3, effect: "Silver & mythril gear, tool upgrades to Silver, accessories." },
      { level: 3, gold: 12000, items: { goldIngot: 3, mythrilOre: 3 }, days: 4, effect: "Dawnsteel gear.", requires: { kind: "rank", rank: "B" }, requiresText: "Guild rank B" }
    ]
  },
  atelier: {
    id: "atelier",
    name: "Atelier",
    desc: "Mina's alchemy workshop.",
    interior: "atelier",
    owner: "mina",
    hours: [10 * H, 19 * H],
    levels: [
      { level: 0, gold: 0, items: {}, days: 0, effect: "An empty lot." },
      { level: 1, gold: 1000, items: { wood: 25, clay: 5, wildHerb: 5 }, days: 2, effect: "Mina moves in. Potions, antidotes, fertilizer, bombs.", requires: { kind: "flag", key: "metMina" }, requiresText: "Find the lost alchemist" },
      { level: 2, gold: 3500, items: { manaCrystal: 3, hardwood: 10 }, days: 3, effect: "Advanced alchemy: greater potions, elixirs, phoenix feathers, growth elixirs." }
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
    name: "Dawnhollow Inn",
    desc: "Lodging for travellers and a hot meal.",
    interior: "inn",
    hours: [8 * H, 24 * H],
    levels: [
      { level: 0, gold: 0, items: {}, days: 0, effect: "An empty lot." },
      { level: 1, gold: 2500, items: { wood: 40, stone: 20, linen: 5 }, days: 3, effect: "Travellers can stay: new companions arrive. Hot meals for sale.", requires: { kind: "rank", rank: "E" }, requiresText: "Guild rank E" },
      { level: 2, gold: 6000, items: { hardwood: 20, silverIngot: 2 }, days: 3, effect: "A busier inn: +2 faith a day and the kitchen sells feasts." }
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
  inn: 0
};

export function maxLevel(id: BuildingId): number {
  return BUILDINGS[id].levels[BUILDINGS[id].levels.length - 1]!.level;
}

export const TOWN_RANKS = [
  { min: 0, name: "Hamlet" },
  { min: 8, name: "Village" },
  { min: 14, name: "Town" },
  { min: 20, name: "City" }
] as const;
