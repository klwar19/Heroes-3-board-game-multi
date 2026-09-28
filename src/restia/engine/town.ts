import type { BuildingId, RestiaState } from "./types";
import { BUILDINGS, TOWN_RANKS, maxLevel } from "../data/buildings";
import { BLESSINGS, PERKS } from "../data/progression";
import { SHOPS, INN_MARKUP } from "../data/shops";
import { RECIPES, type RecipeDef, type RecipeInput } from "../data/recipes";
import { ITEMS, buyPrice, itemDef } from "../data/items";
import { ZONES } from "../data/zones";
import { Ctx, addItem, chance, clamp, count, fail, hasItems, perk, removeItem } from "./core";
import { check } from "./conditions";
import { maxStamina } from "./state";
import { gainSkill, skillLevel } from "./farm";
import { track } from "./quests";
import { playScene } from "./scenes";
import { isOpen } from "./world";

// ---------------------------------------------------------------------------
// Outpost Board (base development)
// ---------------------------------------------------------------------------

export function townScore(state: RestiaState): number {
  return Object.values(state.town.levels).reduce((sum, level) => sum + level, 0);
}

export function townRank(state: RestiaState): string {
  const score = townScore(state);
  return [...TOWN_RANKS].reverse().find((rank) => score >= rank.min)!.name;
}

export function nextLevelInfo(state: RestiaState, id: BuildingId) {
  const current = state.town.levels[id];
  return BUILDINGS[id].levels.find((level) => level.level === current + 1) ?? null;
}

export function build(state: RestiaState, id: BuildingId, ctx: Ctx): void {
  if (state.player.zone !== "village" || state.player.inside) fail("Use the Outpost Board in the Frostbitten square.");
  const board = ZONES.village.objects.find((object) => object.kind === "board")!;
  if (Math.max(Math.abs(state.player.x - board.x), Math.abs(state.player.y - board.y)) > 1) fail("Walk up to the Outpost Board first.");
  if (state.town.project) fail(`Builders are busy with ${BUILDINGS[state.town.project.id].name}. One project at a time.`);
  const def = BUILDINGS[id];
  if (state.town.levels[id] >= maxLevel(id)) fail(`${def.name} is fully upgraded.`);
  const next = nextLevelInfo(state, id)!;
  if (next.requires && !check(state, next.requires)) fail(`${def.name}: requires ${next.requiresText ?? "more progress"}.`);
  if (state.gold < next.gold) fail(`Not enough gold (${next.gold} G needed).`);
  if (!hasItems(state, next.items)) fail(`Missing materials for ${def.name}.`);
  state.gold -= next.gold;
  for (const [item, n] of Object.entries(next.items)) removeItem(state, item, n);
  state.town.project = { id, level: next.level, daysLeft: next.days };
  ctx.toast(`Construction started: ${def.name} (${next.days} day${next.days === 1 ? "" : "s"}).`, "good");
}

const BUILT_SCENES: Partial<Record<BuildingId, string>> = { shrine: "shrineRestored", atelier: "atelierBuilt", smithy: "smithyBuilt" };

/** Overnight construction progress. Returns the finished building's name. */
export function progressConstruction(state: RestiaState, ctx: Ctx): string | null {
  const project = state.town.project;
  if (!project) return null;
  project.daysLeft -= 1;
  if (project.daysLeft > 0) return null;
  state.town.levels[project.id] = project.level;
  state.town.project = null;
  const name = BUILDINGS[project.id].name;
  const scene = BUILT_SCENES[project.id];
  if (scene && project.level === 1) playScene(state, scene, ctx);
  return name;
}

// ---------------------------------------------------------------------------
// Shrine: faith and blessings
// ---------------------------------------------------------------------------

export function dailyFaith(state: RestiaState): number {
  const shrine = state.town.levels.shrine;
  if (shrine < 1) return 0;
  const residents = Object.keys(state.members).length - 1 + Math.floor(state.pets.length / 2);
  const inn = state.town.levels.inn >= 3 ? 2 : 0;
  return (5 + residents + inn) * (shrine >= 2 ? 2 : 1);
}

export function blessingCost(state: RestiaState, id: string): number {
  const def = BLESSINGS.find((blessing) => blessing.id === id);
  if (!def) fail("Unknown blessing.");
  return state.town.levels.shrine >= 2 ? Math.ceil(def.cost * 0.67) : def.cost;
}

export function pray(state: RestiaState, id: string, ctx: Ctx): void {
  if (state.player.inside !== "shrine") fail("Ask for Peri's favours at the Weaver's Shrine.");
  if (state.blessingDay === state.day) fail("Peri already did you a favour today. \"Don't get greedy, it's bad for ratings.\"");
  const cost = blessingCost(state, id);
  if (state.faith < cost) fail(`Not enough Audience (${cost} needed).`);
  state.faith -= cost;
  state.blessingDay = state.day;
  switch (id) {
    case "vigor":
      state.stamina = clamp(state.stamina + 60, 0, maxStamina(state));
      break;
    case "rain":
      state.tomorrow = "rain";
      break;
    case "valor":
      state.buffs.push({ id: "valor", label: "Blessing of Valor (+15% ATK/DEF)" });
      break;
    case "fortune":
      state.buffs.push({ id: "fortune", label: "Blessing of Fortune (+30% gold)" });
      break;
    default:
      fail("Unknown blessing.");
  }
  ctx.toast(`${BLESSINGS.find((blessing) => blessing.id === id)!.name} received!`, "system");
}

export function hasBuff(state: RestiaState, id: string): boolean {
  return state.buffs.some((buff) => buff.id === id);
}

// ---------------------------------------------------------------------------
// Cosmic Jester Shop
// ---------------------------------------------------------------------------

export function buyPerk(state: RestiaState, id: string, ctx: Ctx): void {
  const def = PERKS.find((entry) => entry.id === id);
  if (!def) fail("Unknown perk.");
  if (state.admin.perks.includes(id)) fail("Already bought.");
  if (def.requires && !state.admin.perks.includes(def.requires)) fail(`Buy ${PERKS.find((entry) => entry.id === def.requires)?.name ?? "the previous item"} first.`);
  if (state.admin.ap < def.cost) fail(`Not enough Jester Points (${def.cost} needed).`);
  state.admin.ap -= def.cost;
  state.admin.perks.push(id);
  if (id === "bigCan") state.water = Math.min(state.water * 2, [0, 20, 40, 80][state.tools.can]! * 2);
  ctx.toast(`[CJS] Purchased: ${def.name}`, "system");
  if (def.scene) playScene(state, def.scene, ctx);
}

// ---------------------------------------------------------------------------
// Shops, selling and shipping
// ---------------------------------------------------------------------------

export function shopStock(state: RestiaState, building: string): string[] {
  const entries = SHOPS[building as BuildingId] ?? [];
  return entries.filter((entry) => check(state, entry.when)).map((entry) => entry.item);
}

export function priceAt(building: string, item: string): number {
  const base = buyPrice(item);
  return building === "inn" && ITEMS[item]?.category === "food" ? Math.round(itemDef(item).price * INN_MARKUP) : base;
}

export function sellValue(state: RestiaState, item: string): number {
  const bonus = (perk(state, "merchant") ? 0.1 : 0) + (hasBuff(state, "fortune") ? 0.3 : 0);
  return Math.floor(itemDef(item).price * (1 + bonus));
}

export function buy(state: RestiaState, item: string, n: number, ctx: Ctx): void {
  const building = state.player.inside;
  if (!building || !shopStock(state, building).includes(item)) fail("That isn't sold here.");
  if (!isOpen(state, building)) fail("The shop has closed for today.");
  if (!Number.isInteger(n) || n < 1 || n > 99) fail("Invalid amount.");
  const total = priceAt(building, item) * n;
  if (state.gold < total) fail(`Not enough gold (${total} G).`);
  state.gold -= total;
  addItem(state, item, n);
  ctx.toast(`Bought ${itemDef(item).name} x${n} for ${total} G`, "info");
}

export function sell(state: RestiaState, item: string, n: number, ctx: Ctx): void {
  if (state.player.inside !== "store") fail("Tilde buys goods at the Trading Post.");
  if (!isOpen(state, "store")) fail("The shop has closed for today.");
  if (!Number.isInteger(n) || n < 1) fail("Invalid amount.");
  if (!removeItem(state, item, n)) fail("You don't have that many.");
  const total = sellValue(state, item) * n;
  state.gold += total;
  ctx.toast(`Sold ${itemDef(item).name} x${n} for ${total} G`, "good");
}

function nearBin(state: RestiaState): boolean {
  const bin = ZONES.farm.objects.find((object) => object.kind === "shippingBin")!;
  return state.player.zone === "farm" && !state.player.inside && Math.max(Math.abs(state.player.x - bin.x), Math.abs(state.player.y - bin.y)) <= 1;
}

export function ship(state: RestiaState, item: string, n: number): void {
  if (!nearBin(state)) fail("Stand next to the shipping bin on your farm.");
  if (!Number.isInteger(n) || n < 1) fail("Invalid amount.");
  if (!removeItem(state, item, n)) fail("You don't have that many.");
  state.shipping[item] = (state.shipping[item] ?? 0) + n;
}

export function unship(state: RestiaState, item: string, n: number): void {
  if (!nearBin(state)) fail("Stand next to the shipping bin on your farm.");
  const have = state.shipping[item] ?? 0;
  if (!Number.isInteger(n) || n < 1 || have < n) fail("Not in the bin.");
  if (have === n) delete state.shipping[item];
  else state.shipping[item] = have - n;
  addItem(state, item, n);
}

export function store(state: RestiaState, item: string, n: number): void {
  if (state.player.inside !== "farmhouse") fail("Your storage chest is in Garr's hut.");
  if (!Number.isInteger(n) || n < 1 || !removeItem(state, item, n)) fail("You don't have that many.");
  state.storage[item] = (state.storage[item] ?? 0) + n;
}

export function retrieve(state: RestiaState, item: string, n: number): void {
  if (state.player.inside !== "farmhouse") fail("Your storage chest is in Garr's hut.");
  const have = state.storage[item] ?? 0;
  if (!Number.isInteger(n) || n < 1 || have < n) fail("Not in the chest.");
  if (have === n) delete state.storage[item];
  else state.storage[item] = have - n;
  addItem(state, item, n);
}

// ---------------------------------------------------------------------------
// Crafting (forge / alchemy / cooking)
// ---------------------------------------------------------------------------

const STATION_BUILDING = { forge: "smithy", alchemy: "atelier", cooking: "farmhouse" } as const;
const STATION_SKILL = { forge: "forging", alchemy: "alchemy", cooking: "cooking" } as const;

export function recipeName(recipe: RecipeDef): string {
  return recipe.name || (recipe.output ? itemDef(recipe.output.item).name : recipe.id);
}

export function recipeUnlocked(state: RestiaState, recipe: RecipeDef): boolean {
  if (state.town.levels[recipe.requires.building] < recipe.requires.level) return false;
  if (recipe.toolUpgrade && state.tools[recipe.toolUpgrade.tool] !== recipe.toolUpgrade.level - 1) return false;
  return true;
}

/** Picks concrete items for a recipe (cheapest for tag slots), or null if short. */
export function planInputs(state: RestiaState, recipe: RecipeDef, times = 1): Record<string, number> | null {
  const plan: Record<string, number> = {};
  const specific = recipe.inputs.filter((input): input is { item: string; n: number } => "item" in input);
  const tagged = recipe.inputs.filter((input): input is Extract<RecipeInput, { tag: string }> => "tag" in input);
  for (const input of specific) plan[input.item] = (plan[input.item] ?? 0) + input.n * times;
  for (const [item, n] of Object.entries(plan)) if (count(state, item) < n) return null;
  for (const input of tagged) {
    let need = input.n * times;
    const candidates = Object.keys(state.inventory)
      .filter((item) => ITEMS[item]?.tags?.includes(input.tag))
      .sort((a, b) => itemDef(a).price - itemDef(b).price);
    for (const item of candidates) {
      const free = count(state, item) - (plan[item] ?? 0);
      if (free <= 0) continue;
      const take = Math.min(free, need);
      plan[item] = (plan[item] ?? 0) + take;
      need -= take;
      if (!need) break;
    }
    if (need > 0) return null;
  }
  return plan;
}

export function craft(state: RestiaState, recipeId: string, times: number, ctx: Ctx): void {
  const recipe = RECIPES[recipeId];
  if (!recipe) fail("Unknown recipe.");
  if (!Number.isInteger(times) || times < 1 || times > 20 || (recipe.toolUpgrade && times !== 1)) fail("Invalid amount.");
  const building = STATION_BUILDING[recipe.station];
  if (state.player.inside !== building) fail(`Craft this at the ${building === "farmhouse" ? "kitchen in Garr's hut" : BUILDINGS[building as BuildingId]?.name ?? building}.`);
  if (!isOpen(state, building)) fail("The workshop has closed for today.");
  if (!recipeUnlocked(state, recipe)) fail("You can't make that yet.");
  const gold = recipe.gold * times;
  if (state.gold < gold) fail(`Not enough gold (${gold} G).`);
  const plan = planInputs(state, recipe, times);
  if (!plan) fail("Missing ingredients.");
  state.gold -= gold;
  for (const [item, n] of Object.entries(plan)) removeItem(state, item, n);
  if (recipe.toolUpgrade) {
    state.tools[recipe.toolUpgrade.tool] = recipe.toolUpgrade.level;
    ctx.toast(`${recipeName(recipe)} ready!`, "good");
  } else if (recipe.output) {
    const level = skillLevel(state.skills[STATION_SKILL[recipe.station]]);
    let made = recipe.output.n * times;
    // Skilled crafters sometimes get an extra batch out of the same ingredients (not gear).
    if (!itemDef(recipe.output.item).equip) {
      for (let i = 0; i < times; i++) if (chance(state, level * 0.04)) made += recipe.output.n;
    }
    addItem(state, recipe.output.item, made);
    ctx.toast(`Made ${recipeName(recipe)} x${made}`, "good");
  }
  state.minute += recipe.minutes * times;
  state.stats.crafted += times;
  gainSkill(state, STATION_SKILL[recipe.station], recipe.xp * times, ctx);
  track(state, ctx, "craft", times);
}
