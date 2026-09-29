import type { LifeSkill, Plot, RestiaState, ToolId } from "./types";
import { CROPS, cropDef } from "../data/crops";
import { ITEMS, itemDef } from "../data/items";
import { MONSTERS } from "../data/monsters";
import { FIELD_MAX, FIELD_RECTS, FIELD_W, ZONES, inRect } from "../data/zones";
import { Ctx, addItem, chance, fail, isRainy, perk, randInt, removeItem, seasonOf } from "./core";
import { activePlot, canCapacity, plotAt, plotIndex } from "./state";
import { track } from "./quests";

export const TOOL_NAMES: Record<ToolId, string> = { hoe: "Hoe", can: "Watering Can", axe: "Axe", hammer: "Hammer", sickle: "Sickle" };
const TOOL_COST: Record<ToolId, number> = { hoe: 4, can: 2, axe: 5, hammer: 5, sickle: 2 };
const TOOL_SKILL: Record<ToolId, LifeSkill> = { hoe: "farming", can: "farming", axe: "foraging", hammer: "mining", sickle: "farming" };

/** Life-skill level from XP: 1 at 8 XP, 5 at 200, 10 at 800. */
export function skillLevel(xp: number): number {
  return Math.min(10, Math.floor(Math.sqrt(Math.max(0, xp) / 8)));
}

export function gainSkill(state: RestiaState, skill: LifeSkill, xp: number, ctx: Ctx): void {
  const before = skillLevel(state.skills[skill]);
  state.skills[skill] += xp;
  const after = skillLevel(state.skills[skill]);
  if (after > before) ctx.toast(`${skill[0]!.toUpperCase()}${skill.slice(1)} skill reached level ${after}!`, "good");
}

export function toolCost(state: RestiaState, tool: ToolId): number {
  const level = skillLevel(state.skills[TOOL_SKILL[tool]]);
  let cost = TOOL_COST[tool] * (1 - level * 0.03);
  if (perk(state, "efficientTools")) cost *= 0.75;
  return Math.max(1, Math.round(cost));
}

export function spendStamina(state: RestiaState, n: number): void {
  if (state.stamina < n) fail("You're too tired. Eat something or get some sleep.");
  state.stamina -= n;
}

/** Cells a tool of `level` affects around the target (1, a row of 3, then 3x3). */
export function toolArea(level: number, x: number, y: number): { x: number; y: number }[] {
  if (level <= 1) return [{ x, y }];
  if (level === 2) return [-1, 0, 1].map((dx) => ({ x: x + dx, y }));
  const cells = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ x: x + dx, y: y + dy });
  return cells;
}

function nearPlayer(state: RestiaState, x: number, y: number): void {
  if (state.player.zone !== "farm" || state.player.inside) fail("You need to be out on the farm.");
  if (Math.max(Math.abs(state.player.x - x), Math.abs(state.player.y - y)) > 1) fail("Walk next to that spot first.");
}

export function applyTool(state: RestiaState, tool: ToolId, x: number, y: number, ctx: Ctx): void {
  nearPlayer(state, x, y);
  const level = state.tools[tool];
  const cells = toolArea(tool === "axe" || tool === "hammer" ? 1 : level, x, y);
  const cost = toolCost(state, tool);
  if (tool === "can" && state.water <= 0) fail("The watering can is empty. Refill it at the pond or the village well.");
  if (state.stamina < cost) fail("You're too tired. Eat something or get some sleep.");
  let done = 0;
  let blocked = "";
  for (const cell of cells) {
    const plot = activePlot(state, cell.x, cell.y);
    if (!plot) continue;
    const result = toolOnPlot(state, plot, tool, level);
    if (result === true) done += 1;
    else if (result) blocked = result;
  }
  if (!done) fail(blocked || nothingText(tool));
  spendStamina(state, cost);
  state.minute += tool === "can" ? 3 : 5;
  if (tool === "can") {
    state.water -= 1;
    track(state, ctx, "water", done);
  }
  if (tool === "hoe") track(state, ctx, "till", done);
  gainSkill(state, TOOL_SKILL[tool], done, ctx);
}

function nothingText(tool: ToolId): string {
  switch (tool) {
    case "hoe":
      return "Nothing to till there (clear debris first).";
    case "can":
      return "Nothing there needs water.";
    case "sickle":
      return "No weeds there.";
    case "axe":
      return "Nothing to chop there.";
    case "hammer":
      return "Nothing to break there.";
  }
}

/** true = acted, string = why it could not, false = nothing to do. */
function toolOnPlot(state: RestiaState, plot: Plot, tool: ToolId, level: number): boolean | string {
  switch (tool) {
    case "hoe":
      if (plot.sprinkler) return "A sprinkler stands there. Put the tool away (0) and click it to pick it up.";
      if (plot.debris || plot.tilled) return false;
      plot.tilled = true;
      // The rain waters every tilled plot today, including soil tilled after it started.
      plot.watered = isRainy(state.weather);
      return true;
    case "can":
      if (!plot.tilled || plot.watered) return false;
      plot.watered = true;
      return true;
    case "sickle":
      if (plot.debris !== "weed" && plot.debris !== "withered") return false;
      plot.debris = null;
      if (chance(state, 0.15)) addItem(state, "wildHerb", 1);
      return true;
    case "axe":
      if (plot.debris === "branch") {
        plot.debris = null;
        addItem(state, "wood", randInt(state, 1, 2));
        return true;
      }
      if (plot.debris === "stump") {
        if (level < 2) return "This stump is too tough. Upgrade your Axe at the Smithy.";
        plot.debris = null;
        addItem(state, "wood", 3);
        addItem(state, "hardwood", randInt(state, 1, 2));
        return true;
      }
      return false;
    case "hammer":
      if (plot.debris === "stone") {
        plot.debris = null;
        addItem(state, "stone", 1);
        if (chance(state, 0.06)) addItem(state, "ironOre", 1);
        return true;
      }
      if (plot.debris === "boulder") {
        if (level < 2) return "This boulder is too big. Upgrade your Hammer at the Smithy.";
        plot.debris = null;
        addItem(state, "stone", 4);
        if (chance(state, 0.35)) addItem(state, "ironOre", randInt(state, 1, 2));
        if (chance(state, 0.1)) addItem(state, "silverOre", 1);
        return true;
      }
      return false;
  }
}

export function plant(state: RestiaState, seed: string, x: number, y: number, ctx: Ctx): void {
  nearPlayer(state, x, y);
  const def = itemDef(seed);
  if (!def.seedOf) fail(`${def.name} can't be planted.`);
  const crop = cropDef(def.seedOf);
  const plot = activePlot(state, x, y);
  if (!plot || !plot.tilled) fail("Till the soil first.");
  if (plot.crop) fail("Something is already growing there.");
  if (plot.debris) fail("Clear the withered plant off that soil first (Sickle).");
  if (!crop.seasons.includes(seasonOf(state.day))) fail(`${crop.name} won't grow in ${seasonOf(state.day)}.`);
  if (!removeItem(state, seed, 1)) fail(`You have no ${def.name}.`);
  plot.crop = { id: crop.id, growth: 0, harvests: 0 };
  state.minute += 2;
  track(state, ctx, "plant", 1);
  track(state, ctx, "planted", 1);
}

export function isRipe(plot: Plot): boolean {
  return !!plot.crop && plot.crop.growth >= cropDef(plot.crop.id).days;
}

export function harvest(state: RestiaState, x: number, y: number, ctx: Ctx): void {
  nearPlayer(state, x, y);
  const plot = activePlot(state, x, y);
  if (!plot?.crop) fail("Nothing to harvest there.");
  if (!isRipe(plot)) fail("It isn't ripe yet.");
  const giant = plot.crop.giant !== undefined;
  harvestPlot(state, plot, ctx, "inventory");
  state.minute += giant ? 10 : 3;
}

/** A giant crop yields what its nine plants would, plus this many extra. */
const GIANT_BONUS: [number, number] = [6, 12];
/** Nightly chance for each eligible 3x3 block of ripe plants to fuse. */
const GIANT_CHANCE = 0.1;

/** The nine plots of the giant crop `plot` belongs to, or null for a normal plant. */
export function giantPlots(state: RestiaState, plot: Plot): Plot[] | null {
  const anchor = plot.crop?.giant;
  if (anchor === undefined) return null;
  const ax = FIELD_MAX[0] + (anchor % FIELD_W);
  const ay = FIELD_MAX[1] + Math.floor(anchor / FIELD_W);
  const cells: Plot[] = [];
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const other = plotAt(state, ax + dx, ay + dy);
      if (other?.crop && other.crop.giant === anchor) cells.push(other);
    }
  }
  return cells.includes(plot) ? cells : null;
}

/** Shared by the player and befriended monsters. Returns the item and amount. */
export function harvestPlot(state: RestiaState, plot: Plot, ctx: Ctx, into: "inventory" | "storage"): { item: string; n: number } {
  const crop = cropDef(plot.crop!.id);
  const giant = giantPlots(state, plot);
  const targets = giant ?? [plot];
  let n = 0;
  for (let i = 0; i < targets.length; i++) {
    n += randInt(state, crop.yield[0], crop.yield[1]);
    if (chance(state, skillLevel(state.skills.farming) * 0.03)) n += 1;
  }
  if (giant) n += randInt(state, GIANT_BONUS[0], GIANT_BONUS[1]);
  if (into === "inventory") addItem(state, crop.produce, n);
  else state.storage[crop.produce] = (state.storage[crop.produce] ?? 0) + n;
  for (const target of targets) {
    if (crop.regrow) {
      target.crop = { id: crop.id, growth: crop.days - crop.regrow, harvests: target.crop!.harvests + 1 };
    } else {
      target.crop = null;
      target.fertilizer = 0;
    }
  }
  if (into === "inventory") {
    gainSkill(state, "farming", crop.xp * targets.length, ctx);
    track(state, ctx, "harvest", targets.length);
    track(state, ctx, "harvested", targets.length);
    if (giant) ctx.toast(`Giant ${crop.name} harvested: ${itemDef(crop.produce).name} x${n}!`, "good");
  }
  return { item: crop.produce, n };
}

export function fertilize(state: RestiaState, item: string, x: number, y: number): void {
  nearPlayer(state, x, y);
  const def = itemDef(item);
  const strength = def.use?.fertilizer;
  if (!strength) fail(`${def.name} is not a fertilizer.`);
  const plot = activePlot(state, x, y);
  if (!plot || !plot.tilled) fail("Fertilizer goes on tilled soil.");
  if (plot.debris) fail("Clear the withered plant off that soil first (Sickle).");
  if (plot.fertilizer >= strength) fail("That soil is already fertilized.");
  if (!removeItem(state, item, 1)) fail(`You have no ${def.name}.`);
  plot.fertilizer = strength;
  state.minute += 2;
}

export function nearWater(state: RestiaState): boolean {
  const zone = ZONES[state.player.zone];
  const { x, y } = state.player;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (zone.water.some((rect) => inRect(rect, x + dx, y + dy))) return true;
      if (zone.objects.some((object) => object.kind === "well" && Math.abs(object.x - x) <= 2 && Math.abs(object.y - y) <= 2)) return true;
    }
  }
  return false;
}

export function refill(state: RestiaState, ctx: Ctx): void {
  if (state.player.inside) fail("Go outside first.");
  if (!nearWater(state)) fail("Stand next to the pond or the village well to refill.");
  state.water = canCapacity(state);
  ctx.toast("Watering can refilled.", "info");
}

/**
 * Overnight: befriended monsters work, crops grow, the soil dries. `rained` =
 * the day that just ended was rainy (every tilled plot counts as watered).
 */
export function farmNight(state: RestiaState, rained: boolean, ctx: Ctx): { grown: number; petWork: string[]; giants: string[] } {
  const petWork = petJobs(state, ctx);
  let grown = 0;
  const fieldRect = FIELD_RECTS[state.town.levels.field]!;
  for (let y = FIELD_MAX[1]; y <= FIELD_MAX[3]; y++) {
    for (let x = FIELD_MAX[0]; x <= FIELD_MAX[2]; x++) {
      const plot = plotAt(state, x, y)!;
      const active = inRect(fieldRect, x, y);
      const wet = plot.watered || (rained && plot.tilled);
      if (plot.crop && wet) {
        const crop = CROPS[plot.crop.id]!;
        let add = 1;
        const bonus = plot.fertilizer === 2 ? 0.4 : plot.fertilizer === 1 ? 0.2 : 0;
        if (chance(state, bonus)) add += 1;
        if (perk(state, "greenThumb") && chance(state, 0.15)) add += 1;
        const before = plot.crop.growth;
        plot.crop.growth = Math.min(crop.days, plot.crop.growth + add);
        if (plot.crop.growth > before) grown += 1;
      }
      if (active && plot.tilled && !plot.crop && !wet && chance(state, 0.15)) plot.tilled = false;
      if (active && !plot.tilled && !plot.crop && !plot.debris && !plot.sprinkler && chance(state, 0.02)) plot.debris = "weed";
      plot.watered = false;
    }
  }
  return { grown, petWork, giants: formGiants(state) };
}

/**
 * After the night's growth, every 3x3 block of the same giant-capable crop,
 * all ripe and still normal plants, has a GIANT_CHANCE to fuse into one giant
 * crop (never when tomorrow's season would wither it). Returns the crop names.
 */
function formGiants(state: RestiaState): string[] {
  const rect = FIELD_RECTS[state.town.levels.field]!;
  const tomorrow = seasonOf(state.day + 1);
  const formed: string[] = [];
  for (let y = rect[1]; y + 2 <= rect[3]; y++) {
    for (let x = rect[0]; x + 2 <= rect[2]; x++) {
      const first = plotAt(state, x, y)!.crop;
      const def = first ? CROPS[first.id] : undefined;
      if (!first || !def?.giant || !def.seasons.includes(tomorrow)) continue;
      const block: Plot[] = [];
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) block.push(plotAt(state, x + dx, y + dy)!);
      if (!block.every((plot) => plot.crop?.id === first.id && plot.crop.giant === undefined && isRipe(plot))) continue;
      if (!chance(state, GIANT_CHANCE)) continue;
      const anchor = plotIndex(x, y);
      for (const plot of block) plot.crop!.giant = anchor;
      formed.push(def.name);
    }
  }
  return formed;
}

// ---------------------------------------------------------------------------
// Sprinklers
// ---------------------------------------------------------------------------

/** What each sprinkler tier covers, for descriptions. */
export const SPRINKLER_AREA: Record<1 | 2 | 3, string> = {
  1: "the 4 plots next to it",
  2: "the 8 plots around it",
  3: "the 5x5 square around it"
};

/** Plots a sprinkler waters: 1 = the 4 orthogonal neighbours, 2 = the 8 around it, 3 = the 5x5 square minus its own cell. */
export function sprinklerCells(tier: number, x: number, y: number): { x: number; y: number }[] {
  const radius = tier >= 3 ? 2 : 1;
  const cells: { x: number; y: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (!dx && !dy) continue;
      if (tier <= 1 && dx && dy) continue;
      cells.push({ x: x + dx, y: y + dy });
    }
  }
  return cells;
}

/** The item a placed sprinkler of `tier` goes back to. */
export function sprinklerItem(tier: number): string {
  const def = Object.values(ITEMS).find((entry) => entry.sprinkler === tier);
  if (!def) throw new Error(`No Restia sprinkler item for tier ${tier}`);
  return def.id;
}

export function placeSprinkler(state: RestiaState, item: string, x: number, y: number, ctx: Ctx): void {
  nearPlayer(state, x, y);
  const def = ITEMS[item];
  if (!def?.sprinkler) fail(`${def?.name ?? "That"} is not a sprinkler.`);
  const plot = activePlot(state, x, y);
  if (!plot) fail("Sprinklers go on your field plots.");
  if (plot.sprinkler) fail("A sprinkler already stands there.");
  if (plot.debris) fail("Clear that spot first.");
  if (plot.tilled || plot.crop) fail("Sprinklers need untilled ground: pick a plot you haven't hoed.");
  if (!removeItem(state, item, 1)) fail(`You have no ${def.name}.`);
  plot.sprinkler = def.sprinkler;
  state.minute += 5;
  ctx.toast(`${def.name} placed. From tomorrow morning it waters ${SPRINKLER_AREA[def.sprinkler]}.`, "info");
}

export function takeSprinkler(state: RestiaState, x: number, y: number, ctx: Ctx): void {
  nearPlayer(state, x, y);
  const plot = activePlot(state, x, y);
  if (!plot?.sprinkler) fail("There's no sprinkler there.");
  const item = sprinklerItem(plot.sprinkler);
  delete plot.sprinkler;
  addItem(state, item, 1);
  state.minute += 2;
  ctx.toast(`Picked up the ${itemDef(item).name}.`, "info");
}

/**
 * Morning: every sprinkler waters the tilled plots in its pattern, exactly as
 * the watering can would (same `watered` flag). Returns how many it watered.
 */
export function runSprinklers(state: RestiaState): number {
  let watered = 0;
  for (let y = FIELD_MAX[1]; y <= FIELD_MAX[3]; y++) {
    for (let x = FIELD_MAX[0]; x <= FIELD_MAX[2]; x++) {
      const tier = plotAt(state, x, y)!.sprinkler;
      if (!tier) continue;
      for (const cell of sprinklerCells(tier, x, y)) {
        const target = activePlot(state, cell.x, cell.y);
        if (target && target.tilled && !target.watered) {
          target.watered = true;
          watered += 1;
        }
      }
    }
  }
  return watered;
}

/** Season change: crops that can't grow in the new season wither. */
export function witherOutOfSeason(state: RestiaState): number {
  const season = seasonOf(state.day);
  let withered = 0;
  for (const plot of state.plots) {
    if (plot.crop && !CROPS[plot.crop.id]!.seasons.includes(season)) {
      plot.crop = null;
      plot.debris = "withered";
      plot.fertilizer = 0;
      withered += 1;
    }
  }
  return withered;
}

export function waterAllTilled(state: RestiaState): void {
  for (const plot of state.plots) if (plot.tilled) plot.watered = true;
}

function petJobs(state: RestiaState, ctx: Ctx): string[] {
  const notes: string[] = [];
  const fieldRect = FIELD_RECTS[state.town.levels.field]!;
  const plots: Plot[] = [];
  for (let y = fieldRect[1]; y <= fieldRect[3]; y++) for (let x = fieldRect[0]; x <= fieldRect[2]; x++) plots.push(plotAt(state, x, y)!);
  for (const pet of state.pets) {
    if (!pet.farmJob) continue;
    const def = MONSTERS[pet.species]!;
    let done = 0;
    switch (def.farmJob) {
      case "water":
        for (const plot of plots) {
          if (done >= 8) break;
          if (plot.tilled && plot.crop && !plot.watered) {
            plot.watered = true;
            done += 1;
          }
        }
        if (done) notes.push(`${pet.name} watered ${done} crops.`);
        break;
      case "harvest":
        for (const plot of plots) {
          if (done >= 4) break;
          if (plot.crop && isRipe(plot) && plot.crop.giant === undefined) {
            const got = harvestPlot(state, plot, ctx, "storage");
            done += got.n;
          }
        }
        if (done) notes.push(`${pet.name} harvested ${done} crops into your chest.`);
        break;
      case "clear":
        for (const plot of plots) {
          if (done >= 3) break;
          if (plot.debris === "weed" || plot.debris === "stone" || plot.debris === "branch" || plot.debris === "withered") {
            const loot = plot.debris === "stone" ? "stone" : plot.debris === "branch" ? "wood" : null;
            if (loot) state.storage[loot] = (state.storage[loot] ?? 0) + 1;
            plot.debris = null;
            done += 1;
          }
        }
        if (done) notes.push(`${pet.name} cleared ${done} patches of debris.`);
        break;
      case "produce":
        if (def.produce) {
          state.storage[def.produce] = (state.storage[def.produce] ?? 0) + 1;
          notes.push(`${pet.name} left a ${itemDef(def.produce).name} in your chest.`);
        }
        break;
    }
  }
  return notes;
}
