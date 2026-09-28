import type { BuildingId, Condition, ItemId, Season } from "../engine/types";
import { armorId, weaponId } from "./items";

export type ShopEntry = { item: ItemId; when?: Condition };

const season = (value: Season): Condition => ({ kind: "season", season: value });
const level = (id: BuildingId, n: number): Condition => ({ kind: "building", id, level: n });
const all = (...of: Condition[]): Condition => ({ kind: "all", of });
const any = (...of: Condition[]): Condition => ({ kind: "any", of });

/** Stock per shop building. Tilde's trading post also buys anything (sell). */
export const SHOPS: Partial<Record<BuildingId, ShopEntry[]>> = {
  store: [
    { item: "seed-turnip", when: season("spring") },
    { item: "seed-potato", when: season("spring") },
    { item: "seed-strawberry", when: season("spring") },
    { item: "seed-tomato", when: season("summer") },
    { item: "seed-corn", when: any(season("summer"), season("autumn")) },
    { item: "seed-melon", when: season("summer") },
    { item: "seed-pumpkin", when: season("autumn") },
    { item: "seed-eggplant", when: season("autumn") },
    { item: "seed-sweetPotato", when: season("autumn") },
    { item: "seed-snowRadish", when: season("winter") },
    { item: "seed-manaBlossom", when: all(level("store", 2), any(season("spring"), season("summer"), season("autumn"))) },
    { item: "seed-moonberry", when: all(level("store", 2), any(season("autumn"), season("winter"))) },
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
    { item: "ironOre" }
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
    { item: "thunderBomb", when: level("atelier", 2) }
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
    { item: "ether", when: level("guild", 3) }
  ]
};

/** Items without an explicit `buy` that shops still sell cost 2x their value; foods at the inn cost 1.5x. */
export const INN_MARKUP = 1.5;
