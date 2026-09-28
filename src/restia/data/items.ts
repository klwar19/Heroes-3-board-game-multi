import type { EquipDef, IconRef, ItemCategory, ItemDef, ItemUse } from "../engine/types";

/**
 * Item catalog. Icons index the three 6x6 icon sheets (row-major):
 * a = farm & nature, b = materials & monster drops, c = crafted goods.
 * `price` is what shipping/selling pays; shops charge `buy` (default 2x price).
 */

function a(index: number): IconRef {
  return { sheet: "a", index };
}
function b(index: number): IconRef {
  return { sheet: "b", index };
}
function c(index: number): IconRef {
  return { sheet: "c", index };
}

type Extra = Partial<Pick<ItemDef, "buy" | "tags" | "use" | "equip" | "seedOf">>;

function item(
  id: string,
  name: string,
  category: ItemCategory,
  price: number,
  icon: IconRef,
  desc: string,
  extra: Extra = {}
): ItemDef {
  return { id, name, category, price, icon, desc, ...extra };
}

function food(id: string, name: string, price: number, icon: IconRef, desc: string, use: ItemUse): ItemDef {
  return item(id, name, "food", price, icon, desc, { use, tags: ["food"] });
}

function gear(
  id: string,
  name: string,
  price: number,
  icon: IconRef,
  desc: string,
  equip: EquipDef
): ItemDef {
  const category: ItemCategory = equip.slot === "weapon" ? "weapon" : equip.slot === "armor" ? "armor" : "accessory";
  return item(id, name, category, price, icon, desc, { equip });
}

const CROPS: ItemDef[] = [
  item("turnip", "Turnip", "crop", 60, a(0), "A crisp spring root. Everyone's first harvest.", { tags: ["veg"] }),
  item("potato", "Potato", "crop", 110, a(1), "Hearty and dependable, like a good party tank.", { tags: ["veg"] }),
  item("strawberry", "Strawberry", "crop", 70, a(2), "Sweet spring berries. Keeps producing after the first picking.", { tags: ["fruit"] }),
  item("tomato", "Tomato", "crop", 65, a(3), "Sun-ripened and juicy. Regrows through summer.", { tags: ["veg", "fruit"] }),
  item("corn", "Corn", "crop", 90, a(4), "Golden summer corn. Regrows.", { tags: ["veg"] }),
  item("melon", "Melon", "crop", 280, a(5), "A striped summer melon worth the wait.", { tags: ["fruit"] }),
  item("pumpkin", "Pumpkin", "crop", 320, a(6), "A big autumn pumpkin.", { tags: ["veg"] }),
  item("eggplant", "Eggplant", "crop", 70, a(7), "Glossy autumn eggplant. Regrows.", { tags: ["veg"] }),
  item("sweetPotato", "Sweet Potato", "crop", 150, a(8), "Sweet, warm, and perfect for a cold evening.", { tags: ["veg"] }),
  item("snowRadish", "Snow Radish", "crop", 140, a(9), "Grows even under frost.", { tags: ["veg"] }),
  item("manaBlossom", "Mana Blossom", "crop", 300, a(10), "An otherworld flower that hums with mana. Alchemists pay well.", { tags: ["flower", "mana"] }),
  item("moonberry", "Moonberry", "crop", 190, a(11), "Silver-blue berries that glow at night. Regrows.", { tags: ["fruit", "mana"] })
];

const SEEDS: ItemDef[] = [
  ["turnip", "Turnip Seeds", 10, 20],
  ["potato", "Potato Seeds", 25, 50],
  ["strawberry", "Strawberry Seeds", 50, 100],
  ["tomato", "Tomato Seeds", 25, 50],
  ["corn", "Corn Seeds", 40, 80],
  ["melon", "Melon Seeds", 60, 120],
  ["pumpkin", "Pumpkin Seeds", 70, 140],
  ["eggplant", "Eggplant Seeds", 30, 60],
  ["sweetPotato", "Sweet Potato Seeds", 40, 80],
  ["snowRadish", "Snow Radish Seeds", 40, 80],
  ["manaBlossom", "Mana Blossom Seeds", 90, 180],
  ["moonberry", "Moonberry Seeds", 110, 220]
].map(([crop, name, price, buy]) =>
  item(`seed-${crop}`, name as string, "seed", price as number, a(24), `Plant on tilled soil in the right season.`, {
    buy: buy as number,
    seedOf: crop as string
  })
);

const FORAGE: ItemDef[] = [
  item("wildHerb", "Wild Herb", "forage", 20, a(12), "A common green herb. Alchemy base.", { tags: ["herb"] }),
  item("medicinalHerb", "Medicinal Herb", "forage", 45, a(13), "Red-leaf herb used in potions.", { tags: ["herb"] }),
  item("mushroom", "Forest Mushroom", "forage", 30, a(14), "Earthy and edible.", { tags: ["mushroom"] }),
  item("glowcap", "Frostcap", "forage", 90, a(15), "A pale-blue mushroom that only grows under snow-heavy pines. The base of every cough drop in Frostbitten.", { tags: ["mushroom", "mana"] }),
  item("wildBerries", "Wild Berries", "forage", 25, a(16), "Tart forest berries.", { tags: ["fruit"] }),
  item("dawnLily", "Starbloom", "forage", 120, a(17), "A white star-shaped flower that opens under the aurora. Norheim folk leave them at the Weaver's shrine.", {
    tags: ["flower"]
  }),
  item("egg", "Egg", "animal", 50, a(18), "Fresh from a friendly monster.", { tags: ["animal"] }),
  item("milk", "Milk", "animal", 90, a(19), "Rich monster milk.", { tags: ["animal"] }),
  item("wool", "Wool", "animal", 120, a(20), "Soft, warm wool.", { tags: ["animal"] }),
  item("honey", "Honey", "animal", 110, a(21), "Golden honey.", { tags: ["animal"] }),
  item("feather", "Feather", "animal", 60, a(22), "A light, strong feather.", { tags: ["animal"] }),
  item("truffle", "Truffle", "animal", 350, a(23), "A prized underground delicacy.", { tags: ["animal"] })
];

const FARM: ItemDef[] = [
  item("fertilizer", "Fertilizer", "farm", 15, a(25), "Apply to tilled soil: crops sometimes grow an extra day.", {
    buy: 40,
    use: { fertilizer: 1 }
  }),
  item("growthElixir", "Growth Elixir", "farm", 80, c(23), "Alchemical fertilizer: crops grow an extra day more often.", {
    use: { fertilizer: 2 }
  }),
  item("dawnCharm", "Star Charm", "special", 500, a(31), "A little star charm on a bracelet. Some things are worth trying twice. Give it to someone at 8 hearts to confess.", { buy: 1000 }),
  item("eternalRing", "Eternal Ring", "special", 2500, a(32), "A northern silver ring set with a star-stone. Give it to your sweetheart at 10 hearts to propose.", {}),
  item("tamingBrush", "Taming Brush", "special", 100, a(33), "Keeps befriended monsters happy. Raises Befriend chance by 10% when carried.", {
    buy: 400
  }),
  item("giftBox", "Gift Box", "gift", 150, a(34), "A nicely wrapped present. Most people like it.", { buy: 300 }),
  item("monsterTreat", "Monster Treat", "special", 30, a(35), "Consumed by Befriend for +25% success.", { buy: 80, use: { treat: true } })
];

const MATERIALS: ItemDef[] = [
  item("wood", "Wood", "material", 8, b(0), "Chopped from branches and stumps.", { buy: 20, tags: ["wood"] }),
  item("hardwood", "Hardwood", "material", 40, b(1), "Dense timber from old stumps.", { tags: ["wood"] }),
  item("stone", "Stone", "material", 6, b(2), "Plain building stone.", { buy: 16, tags: ["stone"] }),
  item("clay", "Clay", "material", 20, b(3), "Useful for bricks and kilns.", { tags: ["stone"] }),
  item("ironOre", "Iron Ore", "ore", 30, b(4), "Smelt 3 at the forge for an ingot.", { tags: ["ore"] }),
  item("silverOre", "Silver Ore", "ore", 60, b(5), "Smelt 3 at the forge for an ingot.", { tags: ["ore"] }),
  item("goldOre", "Gold Ore", "ore", 120, b(6), "Smelt 3 at the forge for an ingot.", { tags: ["ore"] }),
  item("mythrilOre", "Mythril Ore", "ore", 200, b(7), "A legendary blue metal from the deep floors.", { tags: ["ore"] }),
  item("manaCrystal", "Mana Crystal", "ore", 80, b(8), "Crystallised mana.", { tags: ["crystal"] }),
  item("fireCrystal", "Fire Crystal", "ore", 90, b(9), "Warm to the touch.", { tags: ["crystal"] }),
  item("iceCrystal", "Ice Crystal", "ore", 90, b(10), "Never melts.", { tags: ["crystal"] }),
  item("windCrystal", "Wind Crystal", "ore", 90, b(11), "Hums in a breeze.", { tags: ["crystal"] }),
  item("earthCrystal", "Earth Crystal", "ore", 90, b(12), "Heavy and steady.", { tags: ["crystal"] }),
  item("lightCrystal", "Light Crystal", "ore", 150, b(13), "Glows like starlight on snow.", { tags: ["crystal"] }),
  item("darkCrystal", "Dark Crystal", "ore", 150, b(14), "Swallows light.", { tags: ["crystal"] }),
  item("ironIngot", "Iron Ingot", "material", 110, b(15), "Forged iron.", { tags: ["ingot"] }),
  item("silverIngot", "Silver Ingot", "material", 210, b(16), "Forged silver.", { tags: ["ingot"] }),
  item("goldIngot", "Gold Ingot", "material", 420, b(17), "Forged gold.", { tags: ["ingot"] }),
  item("goblinCloth", "Goblin Cloth", "drop", 12, b(18), "A torn rag. Still cloth.", { tags: ["monster", "cloth"] }),
  item("wolfFang", "Wolf Fang", "drop", 30, b(19), "Sharp and sturdy.", { tags: ["monster"] }),
  item("beastPelt", "Beast Pelt", "drop", 45, b(20), "Thick fur from a forest beast.", { tags: ["monster"] }),
  item("oldBone", "Old Bone", "drop", 20, b(21), "From the temple ruins. Try not to think about it.", { tags: ["monster"] }),
  item("slimeJelly", "Slime Jelly", "drop", 25, b(22), "Wobbly and oddly useful in alchemy.", { tags: ["monster"] }),
  item("batWing", "Bat Wing", "drop", 35, b(23), "Leathery wing.", { tags: ["monster"] }),
  item("rustyBlade", "Rusty Blade", "drop", 40, b(24), "Can be re-forged.", { tags: ["monster", "metal"] }),
  item("minotaurHorn", "Chimera Horn", "drop", 400, b(25), "Trophy of the Temple Chimera.", { tags: ["monster", "trophy"] }),
  item("lizardScale", "Lizard Scale", "drop", 60, b(26), "Tough, water-resistant scale.", { tags: ["monster"] }),
  item("venomSac", "Venom Sac", "drop", 70, b(27), "Handle with care.", { tags: ["monster"] }),
  item("dragonScale", "Dragon Scale", "drop", 600, b(28), "Harder than steel.", { tags: ["monster", "trophy"] }),
  item("demonHorn", "Demon Horn", "drop", 300, b(29), "Still warm.", { tags: ["monster", "trophy"] }),
  item("manaInk", "Mana Ink", "material", 60, b(30), "Ink for skill tomes.", { buy: 150 }),
  item("magicPaper", "Magic Paper", "material", 40, b(31), "Paper that holds a spell.", { buy: 100 }),
  item("rope", "Rope", "material", 15, b(32), "Always useful.", { buy: 40 }),
  item("leather", "Leather", "material", 50, b(33), "Tanned hide.", { buy: 120, tags: ["cloth"] }),
  item("linen", "Linen", "material", 30, b(34), "Woven cloth.", { buy: 80, tags: ["cloth"] }),
  item("thread", "Thread", "material", 10, b(35), "A spool of strong thread.", { buy: 30 })
];

const CONSUMABLES: ItemDef[] = [
  item("potion", "Healing Potion", "potion", 40, c(12), "Restores 60 HP.", { buy: 100, use: { hp: 60 } }),
  item("hiPotion", "Greater Potion", "potion", 120, c(13), "Restores 50% HP.", { buy: 320, use: { hpPct: 50 } }),
  item("ether", "Mana Potion", "potion", 80, c(14), "Restores 30 MP.", { buy: 200, use: { mp: 30 } }),
  item("antidote", "Antidote", "potion", 20, c(15), "Cures poison, burn, sleep, stun, slow and freeze.", { buy: 60, use: { cure: true } }),
  item("elixir", "Elixir", "potion", 400, c(16), "Fully restores HP and MP.", { use: { hpPct: 100, mpPct: 100 } }),
  item("phoenixFeather", "Phoenix Feather", "potion", 300, c(17), "Revives a fallen ally with 40% HP.", { buy: 800, use: { revivePct: 40 } }),
  item("fireBomb", "Fire Bomb", "bomb", 60, c(18), "Thrown: fire damage around the target.", { use: { bomb: { power: 1.3, element: "fire", radius: 1, status: "burn" } } }),
  item("frostBomb", "Frost Bomb", "bomb", 60, c(19), "Thrown: ice damage around the target.", { use: { bomb: { power: 1.3, element: "ice", radius: 1, status: "freeze" } } }),
  item("thunderBomb", "Thunder Bomb", "bomb", 60, c(20), "Thrown: wind damage around the target.", { use: { bomb: { power: 1.3, element: "wind", radius: 1, status: "stun" } } }),
  item("smokeBomb", "Smoke Bomb", "bomb", 50, c(21), "Guaranteed escape from a normal battle.", { buy: 150, use: { escape: true } }),
  item("returnScroll", "Return Scroll", "special", 60, c(22), "Leave the dungeon from any floor.", { buy: 200, use: { returnHome: true } })
];

const FOODS: ItemDef[] = [
  food("bread", "Bread", 40, c(24), "Restores 30 stamina.", { stamina: 30, hp: 20 }),
  food("salad", "Garden Salad", 90, c(25), "Restores 40 stamina and 40 HP.", { stamina: 40, hp: 40 }),
  food("cornSoup", "Corn Soup", 140, c(26), "Restores 50 stamina. Today: +2 DEF.", {
    stamina: 50,
    hp: 30,
    buff: { id: "cornSoup", label: "Corn Soup (+2 DEF)", stats: { def: 2 } }
  }),
  food("stew", "Hearty Stew", 180, c(27), "Restores 60 stamina and 80 HP. Today: +2 ATK.", {
    stamina: 60,
    hp: 80,
    buff: { id: "stew", label: "Hearty Stew (+2 ATK)", stats: { atk: 2 } }
  }),
  food("omelet", "Omelet", 120, c(28), "Restores 45 stamina and 50 HP.", { stamina: 45, hp: 50 }),
  food("friedPotatoes", "Fried Potatoes", 150, c(29), "Restores 55 stamina. Today: +20 max stamina.", {
    stamina: 55,
    buff: { id: "friedPotatoes", label: "Fried Potatoes (+20 stamina)", stamina: 20 }
  }),
  food("strawberryCake", "Strawberry Cake", 260, c(30), "Restores 60 stamina and 20 MP. A lovely gift.", { stamina: 60, mp: 20 }),
  food("pumpkinPie", "Pumpkin Pie", 480, c(31), "Restores 80 stamina. Today: +3 MAG.", {
    stamina: 80,
    buff: { id: "pumpkinPie", label: "Pumpkin Pie (+3 MAG)", stats: { mag: 3 } }
  }),
  food("moonberryTart", "Moonberry Tart", 520, c(32), "Restores 80 stamina and 40 MP. Today: +2 SPD.", {
    stamina: 80,
    mp: 40,
    buff: { id: "moonberryTart", label: "Moonberry Tart (+2 SPD)", stats: { spd: 2 } }
  }),
  food("pickles", "Turnip Pickles", 110, c(33), "Restores 35 stamina.", { stamina: 35 }),
  food("herbTea", "Herb Tea", 60, c(34), "Restores 25 stamina and 15 MP.", { stamina: 25, mp: 15 }),
  food("feast", "Grand Feast", 900, c(35), "Restores all stamina. Today: +3 ATK/DEF/MAG.", {
    stamina: 999,
    hpPct: 100,
    buff: { id: "feast", label: "Grand Feast (+3 ATK/DEF/MAG)", stats: { atk: 3, def: 3, mag: 3 } }
  })
];

type Tier = { key: string; label: string; mult: number; price: number };
const TIERS: Tier[] = [
  { key: "bronze", label: "Bronze", mult: 1, price: 60 },
  { key: "iron", label: "Iron", mult: 2, price: 250 },
  { key: "silver", label: "Silver", mult: 3.2, price: 700 },
  { key: "mythril", label: "Mythril", mult: 4.6, price: 1600 },
  { key: "dawn", label: "Starsteel", mult: 6.2, price: 3500 }
];

/** Silver tier and up carry the line's passive (data/passives.ts). */
const WEAPON_LINES = [
  { type: "sword", icon: c(0), names: ["Bronze Sword", "Iron Sword", "Silver Sword", "Mythril Sword", "Starsteel Blade"], stat: "atk", base: 4, passive: "keenEdge", perk: "Crit +5%" },
  { type: "spear", icon: c(1), names: ["Knight's Spear", "Iron Spear", "Silver Lance", "Mythril Lance", "Starsteel Glaive"], stat: "atk", base: 5, passive: "longReach", perk: "Strikes first when attacked in melee" },
  { type: "hammer", icon: c(2), names: ["Smith's Hammer", "Iron Maul", "Silver Maul", "Mythril Maul", "Starsteel Crusher"], stat: "atk", base: 6, passive: "crushing", perk: "Hits may stun (10%)" },
  { type: "bow", icon: c(3), names: ["Hunting Bow", "Composite Bow", "Silver Bow", "Mythril Bow", "Starsteel Crossbow"], stat: "atk", base: 4, passive: "longshot", perk: "Range +1" },
  { type: "staff", icon: c(4), names: ["Oak Staff", "Crystal Staff", "Silver Staff", "Mythril Staff", "Sunbeam Staff"], stat: "mag", base: 4, passive: "focus", perk: "Skills cost 10% less MP" }
] as const;

const ARMOR_LINES = [
  { type: "light", icon: c(6), names: ["Leather Vest", "Studded Vest", "Silver Mail", "Mythril Vest", "Starsteel Coat"], def: 2, res: 1, spd: 0, passive: "lightFoot", perk: "5% dodge" },
  { type: "heavy", icon: c(7), names: ["Bronze Plate", "Iron Plate", "Silver Plate", "Mythril Plate", "Starsteel Plate"], def: 4, res: 1, spd: -1, passive: "bulwark", perk: "Starts battles shielded (8% HP)" },
  { type: "robe", icon: c(8), names: ["Linen Robe", "Mage Robe", "Silver Robe", "Mythril Robe", "Starweave Robe"], def: 1, res: 3, spd: 0, passive: "manaWeave", perk: "+3% MP each turn" }
] as const;

export function weaponId(type: string, tier: number): string {
  return `${TIERS[tier]!.key}-${type}`;
}
export function armorId(type: string, tier: number): string {
  return `${TIERS[tier]!.key}-${type}-armor`;
}

const GEAR: ItemDef[] = [
  ...WEAPON_LINES.flatMap((line) =>
    TIERS.map((tier, index) => {
      const power = Math.round(line.base * tier.mult);
      const stats = line.stat === "mag" ? { mag: power, atk: Math.round(power / 3) } : { atk: power };
      const perk = index >= 2 ? ` ${line.perk}.` : "";
      return gear(weaponId(line.type, index), line.names[index]!, tier.price, line.icon, `${tier.label} ${line.type}. ${line.stat === "mag" ? "MAG" : "ATK"} +${power}.${perk}`, {
        slot: "weapon",
        weaponType: line.type,
        stats,
        ...(index === 4 ? { element: "light" as const } : {}),
        ...(index >= 2 ? { passive: line.passive } : {})
      });
    })
  ),
  ...ARMOR_LINES.flatMap((line) =>
    TIERS.map((tier, index) =>
      gear(
        armorId(line.type, index),
        line.names[index]!,
        Math.round(tier.price * 0.9),
        line.icon,
        `${tier.label} ${line.type} armor.${index >= 2 ? ` ${line.perk}.` : ""}`,
        {
          slot: "armor",
          armorType: line.type,
          stats: {
            def: Math.round(line.def * tier.mult),
            res: Math.round(line.res * tier.mult),
            maxHp: Math.round(6 * tier.mult),
            ...(line.spd ? { spd: line.spd } : {})
          },
          ...(index >= 2 ? { passive: line.passive } : {})
        }
      )
    )
  ),
  gear("powerRing", "Power Ring", 400, c(9), "ATK +4.", { slot: "accessory", stats: { atk: 4 } }),
  gear("guardRing", "Guard Ring", 400, c(9), "DEF +4, RES +2.", { slot: "accessory", stats: { def: 4, res: 2 } }),
  gear("sageAmulet", "Sage Amulet", 450, c(10), "MAG +5, max MP +10.", { slot: "accessory", stats: { mag: 5, maxMp: 10 } }),
  gear("lifeAmulet", "Life Amulet", 450, c(10), "Max HP +30.", { slot: "accessory", stats: { maxHp: 30 } }),
  gear("swiftCharm", "Swift Charm", 500, c(11), "SPD +3.", { slot: "accessory", stats: { spd: 3 } }),
  gear("luckyCharm", "Lucky Charm", 300, c(11), "LUK +6.", { slot: "accessory", stats: { luk: 6 } }),
  gear("spellbook", "Grimoire of Stars", 900, c(5), "MAG +8, RES +4.", { slot: "accessory", stats: { mag: 8, res: 4 } }),
  // Battle-passive accessories (forged; data/recipes.ts).
  gear("vampireFang", "Vampire Fang", 700, c(9), "ATK +2. Heals 12% of the damage dealt.", { slot: "accessory", stats: { atk: 2 }, passive: "vampireFang" }),
  gear("thornCharm", "Thorn Charm", 600, c(11), "DEF +2. Returns 20% of melee damage taken.", { slot: "accessory", stats: { def: 2 }, passive: "thornGuard" }),
  gear("swiftBoots", "Swift Boots", 800, c(11), "SPD +1. Move +1, ignores terrain move costs.", { slot: "accessory", stats: { spd: 1 }, passive: "swiftBoots" }),
  gear("emberHeart", "Ember Heart", 750, c(10), "MAG +2. Fire damage +15%; hits may burn.", { slot: "accessory", stats: { mag: 2 }, passive: "emberHeart" }),
  gear("frostHeart", "Frost Heart", 750, c(10), "RES +2. Ice damage +15%; can't be frozen.", { slot: "accessory", stats: { res: 2 }, passive: "frostHeart" }),
  gear("guardianSeal", "Guardian Seal", 900, c(9), "Max HP +10. Starts battles with a 15% shield.", { slot: "accessory", stats: { maxHp: 10 }, passive: "guardianSeal" }),
  gear("phoenixFeather", "Phoenix Feather", 1500, c(11), "Once per battle, survive a lethal blow with 1 HP.", { slot: "accessory", stats: {}, passive: "phoenixFeather" }),
  gear("jestersBell", "Jester's Bell", 2500, c(11), "LUK +3. +1 AP every turn.", { slot: "accessory", stats: { luk: 3 }, passive: "jestersBell" })
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [...CROPS, ...SEEDS, ...FORAGE, ...FARM, ...MATERIALS, ...CONSUMABLES, ...FOODS, ...GEAR].map((def) => [def.id, def])
);

export function itemDef(id: string): ItemDef {
  const def = ITEMS[id];
  if (!def) throw new Error(`Unknown Restia item ${id}`);
  return def;
}

export function buyPrice(id: string): number {
  const def = itemDef(id);
  return def.buy ?? def.price * 2;
}

export function itemHasTag(id: string, tag: string): boolean {
  return ITEMS[id]?.tags?.includes(tag) ?? false;
}
