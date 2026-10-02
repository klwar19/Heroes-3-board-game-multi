import type { BuildingId, Condition, ItemId, Season } from "../engine/types";
import { CROPS } from "./crops";
import { armorId, weaponId } from "./items";

export type ShopEntry = { item: ItemId; when?: Condition };

const season = (value: Season): Condition => ({ kind: "season", season: value });
const level = (id: BuildingId, n: number): Condition => ({ kind: "building", id, level: n });
const all = (...of: Condition[]): Condition => ({ kind: "all", of });
const any = (...of: Condition[]): Condition => ({ kind: "any", of });

/** A crop's seeds, on sale in its growing seasons once the crop is unlocked (data/crops.ts). */
function seed(crop: string): ShopEntry {
  const def = CROPS[crop];
  if (!def) throw new Error(`Unknown Restia crop ${crop}`);
  const seasons = def.seasons.length === 1 ? season(def.seasons[0]!) : any(...def.seasons.map(season));
  return { item: def.seed, when: def.unlock ? all(def.unlock, seasons) : seasons };
}

/** Stock per shop building. Tilde's trading post also buys anything (sell). */
export const SHOPS: Partial<Record<BuildingId, ShopEntry[]>> = {
  store: [
    ...["turnip", "potato", "strawberry", "cabbage", "pinkCat", "toyherb"].map(seed),
    ...["tomato", "corn", "melon", "onion", "greenPepper"].map(seed),
    ...["pumpkin", "eggplant", "sweetPotato", "carrot", "spinach"].map(seed),
    ...["snowRadish", "leek", "noelGrass"].map(seed),
    // Rare and late seeds: Trading Post upgrades, the Ember Vaults, a master farmer's skill.
    ...["manaBlossom", "moonberry", "pineapple", "hotHotFruit", "goldenTurnip"].map(seed),
    { item: "fertilizer" },
    { item: "wood" },
    { item: "stone" },
    { item: "clay" },
    { item: "rope" },
    { item: "linen" },
    { item: "thread" },
    { item: "egg" },
    { item: "milk" },
    { item: "potion" },
    { item: "antidote" },
    { item: "monsterTreat" },
    { item: "tamingBrush" },
    { item: "giftBox" },
    { item: "dawnCharm" },
    { item: "leather", when: level("store", 2) },
    { item: "honey", when: level("store", 2) },
    { item: "hiPotion", when: level("store", 2) },
    { item: "returnScroll", when: level("store", 2) },
    { item: "growthElixir", when: level("store", 3) },
    { item: "luckyCharm", when: level("store", 3) },
    { item: "lightCrystal", when: level("store", 3) }
  ],
  smithy: [
    ...(["sword", "spear", "hammer", "bow", "staff"] as const).flatMap((type) => [
      { item: weaponId(type, 0) },
      { item: weaponId(type, 1) },
      { item: weaponId(type, 2), when: level("smithy", 2) }
    ]),
    ...(["light", "heavy", "robe"] as const).flatMap((type) => [
      { item: armorId(type, 0) },
      { item: armorId(type, 1) },
      { item: armorId(type, 2), when: level("smithy", 2) }
    ]),
    { item: "ironOre" },
    seed("ironleaf")
  ],
  atelier: [
    { item: "potion" },
    { item: "antidote" },
    { item: "ether" },
    { item: "magicPaper" },
    { item: "hiPotion", when: level("atelier", 2) },
    { item: "phoenixFeather", when: level("atelier", 2) },
    { item: "fireBomb", when: level("atelier", 2) },
    { item: "frostBomb", when: level("atelier", 2) },
    { item: "thunderBomb", when: level("atelier", 2) },
    // Mitia's alchemical flowers; crystal blooms once the matching vault depth is reached.
    ...["lampGrass", "stonepetal", "frostglass", "emberbloom"].map(seed)
  ],
  inn: [
    { item: "bread" },
    { item: "salad" },
    { item: "stew" },
    { item: "herbTea" },
    { item: "omelet" },
    { item: "feast", when: level("inn", 3) }
  ],
  guild: [
    { item: "potion" },
    { item: "smokeBomb" },
    { item: "monsterTreat" },
    { item: "returnScroll", when: { kind: "flag", key: "catacombsOpen" } },
    { item: "phoenixFeather", when: { kind: "rank", rank: "D" } },
    { item: "ether", when: level("guild", 3) },
    seed("windbell")
  ]
};

/** Items without an explicit `buy` that shops still sell cost 2x their value; foods at the inn cost 1.5x. */
export const INN_MARKUP = 1.5;
