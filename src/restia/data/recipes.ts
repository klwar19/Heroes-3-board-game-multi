import type { BuildingId, ItemId, Station, ToolId } from "../engine/types";
import { armorId, weaponId } from "./items";

export type RecipeInput = { item: ItemId; n: number } | { tag: string; n: number; label: string };

export type RecipeDef = {
  id: string;
  station: Station;
  name: string;
  output?: { item: ItemId; n: number };
  toolUpgrade?: { tool: ToolId; level: number };
  inputs: RecipeInput[];
  gold: number;
  minutes: number;
  xp: number;
  requires: { building: BuildingId; level: number };
};

const smithy = (level: number) => ({ building: "smithy" as const, level });
const atelier = (level: number) => ({ building: "atelier" as const, level });
const kitchen = { building: "farmhouse" as const, level: 2 };

function forge(id: string, name: string, out: ItemId, n: number, inputs: RecipeInput[], gold: number, level: number, xp = 6): RecipeDef {
  return { id, station: "forge", name, output: { item: out, n }, inputs, gold, minutes: 60, xp, requires: smithy(level) };
}
function brew(id: string, name: string, out: ItemId, n: number, inputs: RecipeInput[], level: number, xp = 5): RecipeDef {
  return { id, station: "alchemy", name, output: { item: out, n }, inputs, gold: 0, minutes: 40, xp, requires: atelier(level) };
}
function cook(id: string, name: string, out: ItemId, n: number, inputs: RecipeInput[], xp = 4): RecipeDef {
  return { id, station: "cooking", name, output: { item: out, n }, inputs, gold: 0, minutes: 30, xp, requires: kitchen };
}

const TIER_INPUTS: { metal: RecipeInput[]; gold: number; level: number }[] = [
  { metal: [{ item: "ironOre", n: 2 }, { item: "wood", n: 3 }], gold: 100, level: 1 },
  { metal: [{ item: "ironIngot", n: 2 }, { item: "wood", n: 2 }], gold: 300, level: 1 },
  { metal: [{ item: "silverIngot", n: 2 }, { item: "ironIngot", n: 1 }], gold: 800, level: 2 },
  { metal: [{ item: "mythrilOre", n: 3 }, { item: "manaCrystal", n: 1 }, { item: "silverIngot", n: 1 }], gold: 2000, level: 2 },
  { metal: [{ item: "goldIngot", n: 2 }, { item: "lightCrystal", n: 2 }, { item: "dragonScale", n: 1 }], gold: 5000, level: 3 }
];

const ARMOR_EXTRA: Record<string, RecipeInput> = {
  light: { item: "leather", n: 1 },
  heavy: { item: "ironOre", n: 2 },
  robe: { item: "linen", n: 2 }
};

/** Sums repeated items (e.g. bronze heavy armor: tier Iron Ore + the armor's extra Iron Ore). */
function mergeInputs(inputs: RecipeInput[]): RecipeInput[] {
  const out: RecipeInput[] = [];
  for (const input of inputs) {
    const same = "item" in input ? out.find((entry): entry is { item: string; n: number } => "item" in entry && entry.item === input.item) : undefined;
    if (same) same.n += input.n;
    else out.push({ ...input });
  }
  return out;
}

const TOOL_NAMES: Record<ToolId, string> = { hoe: "Hoe", can: "Watering Can", axe: "Axe", hammer: "Hammer", sickle: "Sickle" };

const LIST: RecipeDef[] = [
  forge("smelt-iron", "Smelt Iron Ingot", "ironIngot", 1, [{ item: "ironOre", n: 3 }], 0, 1, 3),
  forge("smelt-silver", "Smelt Silver Ingot", "silverIngot", 1, [{ item: "silverOre", n: 3 }], 0, 1, 4),
  forge("smelt-gold", "Smelt Gold Ingot", "goldIngot", 1, [{ item: "goldOre", n: 3 }], 0, 2, 6),
  forge("smelt-ironleaf", "Smelt Ironleaf", "ironIngot", 1, [{ item: "ironleaf", n: 4 }], 0, 2, 3),
  ...(["sword", "spear", "hammer", "bow", "staff"] as const).flatMap((type) =>
    TIER_INPUTS.map((tier, index) => forge(`w-${type}-${index}`, "", weaponId(type, index), 1, tier.metal, tier.gold, tier.level, 6 + index * 4))
  ),
  ...(["light", "heavy", "robe"] as const).flatMap((type) =>
    TIER_INPUTS.map((tier, index) =>
      forge(`a-${type}-${index}`, "", armorId(type, index), 1, mergeInputs([...tier.metal, ARMOR_EXTRA[type]!]), Math.round(tier.gold * 0.9), tier.level, 6 + index * 4)
    )
  ),
  forge("powerRing", "", "powerRing", 1, [{ item: "silverIngot", n: 1 }, { item: "fireCrystal", n: 1 }], 400, 2),
  forge("guardRing", "", "guardRing", 1, [{ item: "silverIngot", n: 1 }, { item: "earthCrystal", n: 1 }], 400, 2),
  forge("sageAmulet", "", "sageAmulet", 1, [{ item: "goldIngot", n: 1 }, { item: "manaCrystal", n: 2 }], 500, 2),
  forge("lifeAmulet", "", "lifeAmulet", 1, [{ item: "goldIngot", n: 1 }, { item: "medicinalHerb", n: 4 }], 500, 2),
  forge("swiftCharm", "", "swiftCharm", 1, [{ item: "windCrystal", n: 2 }, { item: "feather", n: 3 }, { item: "thread", n: 2 }], 300, 1),
  forge("luckyCharm", "", "luckyCharm", 1, [{ item: "linen", n: 1 }, { item: "dawnLily", n: 1 }, { item: "thread", n: 1 }], 200, 1),
  forge("vampireFang", "", "vampireFang", 1, [{ item: "wolfFang", n: 3 }, { item: "darkCrystal", n: 1 }, { item: "silverIngot", n: 1 }], 400, 2),
  forge("thornCharm", "", "thornCharm", 1, [{ item: "venomSac", n: 1 }, { item: "ironIngot", n: 2 }, { item: "leather", n: 1 }], 300, 1),
  forge("swiftBoots", "", "swiftBoots", 1, [{ item: "leather", n: 2 }, { item: "windCrystal", n: 2 }, { item: "batWing", n: 2 }], 400, 2),
  forge("emberHeart", "", "emberHeart", 1, [{ item: "fireCrystal", n: 2 }, { item: "goldIngot", n: 1 }], 400, 2),
  forge("frostHeart", "", "frostHeart", 1, [{ item: "iceCrystal", n: 2 }, { item: "goldIngot", n: 1 }], 400, 2),
  forge("guardianSeal", "", "guardianSeal", 1, [{ item: "earthCrystal", n: 2 }, { item: "lizardScale", n: 2 }, { item: "silverIngot", n: 1 }], 500, 2),
  forge("phoenixFeather", "", "phoenixFeather", 1, [{ item: "lightCrystal", n: 1 }, { item: "feather", n: 5 }, { item: "fireCrystal", n: 1 }], 800, 2),
  forge("jestersBell", "", "jestersBell", 1, [{ item: "mythrilOre", n: 2 }, { item: "lightCrystal", n: 1 }, { item: "darkCrystal", n: 1 }], 1500, 2, 20),
  forge("sprinkler1", "", "sprinkler1", 1, [{ item: "ironIngot", n: 1 }, { item: "stone", n: 5 }], 50, 1, 8),
  forge("sprinkler2", "", "sprinkler2", 1, [{ item: "silverIngot", n: 1 }, { item: "ironIngot", n: 1 }, { item: "iceCrystal", n: 1 }], 150, 1, 12),
  forge("sprinkler3", "", "sprinkler3", 1, [{ item: "goldIngot", n: 1 }, { item: "mythrilOre", n: 2 }, { item: "iceCrystal", n: 2 }], 400, 2, 18),
  forge("eternalRing", "", "eternalRing", 1, [{ item: "goldIngot", n: 2 }, { item: "lightCrystal", n: 1 }, { item: "dawnLily", n: 1 }], 1000, 2, 20),
  ...(Object.keys(TOOL_NAMES) as ToolId[]).flatMap((tool) => [
    { id: `tool-${tool}-2`, station: "forge" as const, name: `Iron ${TOOL_NAMES[tool]}`, toolUpgrade: { tool, level: 2 }, inputs: [{ item: "ironIngot", n: 2 }], gold: 500, minutes: 60, xp: 8, requires: smithy(1) },
    { id: `tool-${tool}-3`, station: "forge" as const, name: `Silver ${TOOL_NAMES[tool]}`, toolUpgrade: { tool, level: 3 }, inputs: [{ item: "silverIngot", n: 2 }], gold: 1500, minutes: 60, xp: 12, requires: smithy(2) }
  ]),

  brew("potion", "", "potion", 2, [{ item: "wildHerb", n: 2 }, { item: "medicinalHerb", n: 1 }], 1),
  brew("antidote", "", "antidote", 2, [{ item: "wildHerb", n: 1 }, { item: "mushroom", n: 1 }], 1),
  brew("ether", "", "ether", 1, [{ item: "glowcap", n: 1 }, { item: "wildHerb", n: 1 }], 1),
  brew("fertilizer", "", "fertilizer", 3, [{ tag: "monster", n: 1, label: "any monster drop" }, { item: "wildHerb", n: 1 }], 1, 3),
  brew("smokeBomb", "", "smokeBomb", 1, [{ item: "mushroom", n: 2 }, { item: "goblinCloth", n: 1 }], 1),
  brew("fireBomb", "", "fireBomb", 2, [{ item: "fireCrystal", n: 1 }, { item: "stone", n: 2 }, { item: "rope", n: 1 }], 1),
  brew("frostBomb", "", "frostBomb", 2, [{ item: "iceCrystal", n: 1 }, { item: "stone", n: 2 }, { item: "rope", n: 1 }], 1),
  brew("thunderBomb", "", "thunderBomb", 2, [{ item: "windCrystal", n: 1 }, { item: "stone", n: 2 }, { item: "rope", n: 1 }], 1),
  brew("monsterTreat", "", "monsterTreat", 3, [{ item: "wildBerries", n: 2 }, { tag: "veg", n: 1, label: "any vegetable" }], 1, 3),
  brew("manaInk", "", "manaInk", 1, [{ item: "glowcap", n: 1 }, { item: "slimeJelly", n: 1 }], 1),
  brew("hiPotion", "", "hiPotion", 2, [{ item: "medicinalHerb", n: 2 }, { item: "glowcap", n: 1 }, { item: "honey", n: 1 }], 2, 8),
  brew("elixir", "", "elixir", 1, [{ item: "manaBlossom", n: 1 }, { item: "moonberry", n: 1 }, { item: "medicinalHerb", n: 2 }, { item: "lightCrystal", n: 1 }], 2, 14),
  brew("phoenixFeather", "", "phoenixFeather", 1, [{ item: "feather", n: 1 }, { item: "fireCrystal", n: 1 }, { item: "lightCrystal", n: 1 }], 2, 12),
  brew("growthElixir", "", "growthElixir", 3, [{ item: "fertilizer", n: 2 }, { item: "manaCrystal", n: 1 }], 2, 8),

  cook("bread", "", "bread", 2, [{ item: "corn", n: 2 }]),
  cook("salad", "", "salad", 1, [{ tag: "veg", n: 2, label: "any 2 vegetables" }]),
  cook("cornSoup", "", "cornSoup", 1, [{ item: "corn", n: 1 }, { item: "milk", n: 1 }]),
  cook("stew", "", "stew", 1, [{ item: "potato", n: 1 }, { item: "mushroom", n: 1 }, { tag: "veg", n: 2, label: "any 2 vegetables" }], 6),
  cook("omelet", "", "omelet", 1, [{ item: "egg", n: 2 }, { item: "milk", n: 1 }]),
  cook("friedPotatoes", "", "friedPotatoes", 1, [{ item: "potato", n: 2 }]),
  cook("strawberryCake", "", "strawberryCake", 1, [{ item: "strawberry", n: 2 }, { item: "egg", n: 1 }, { item: "milk", n: 1 }], 6),
  cook("pumpkinPie", "", "pumpkinPie", 1, [{ item: "pumpkin", n: 1 }, { item: "egg", n: 1 }, { item: "milk", n: 1 }], 8),
  cook("moonberryTart", "", "moonberryTart", 1, [{ item: "moonberry", n: 2 }, { item: "egg", n: 1 }, { item: "honey", n: 1 }], 8),
  cook("pickles", "", "pickles", 2, [{ item: "turnip", n: 3 }]),
  cook("herbTea", "", "herbTea", 2, [{ item: "wildHerb", n: 2 }]),
  cook("feast", "", "feast", 1, [{ item: "stew", n: 1 }, { item: "salad", n: 1 }, { item: "pumpkinPie", n: 1 }, { item: "melon", n: 1 }], 20),
  cook("hotHotCurry", "", "hotHotCurry", 1, [{ item: "hotHotFruit", n: 1 }, { item: "carrot", n: 1 }, { item: "onion", n: 1 }, { item: "potato", n: 1 }], 10),
  cook("cabbageRolls", "", "cabbageRolls", 1, [{ item: "cabbage", n: 1 }, { item: "onion", n: 1 }, { item: "egg", n: 1 }], 6),
  cook("pineappleJuice", "", "pineappleJuice", 2, [{ item: "pineapple", n: 1 }], 5),
  cook("spinachQuiche", "", "spinachQuiche", 1, [{ item: "spinach", n: 2 }, { item: "egg", n: 2 }, { item: "milk", n: 1 }], 7)
];

export const RECIPES: Record<string, RecipeDef> = Object.fromEntries(LIST.map((recipe) => [recipe.id, recipe]));
export const RECIPE_LIST = LIST;
