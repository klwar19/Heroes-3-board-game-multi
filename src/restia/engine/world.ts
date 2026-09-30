import type { BuildingId, Dir, FieldMonster, RestiaState, ZoneId } from "./types";
import { mourning } from "./story";
import { BUILDINGS } from "../data/buildings";
import { FOREST_ENCOUNTERS } from "../data/dungeon";
import { itemDef } from "../data/items";
import { rankIndex } from "../data/progression";
import { ZONES, inRect, type Lot } from "../data/zones";
import { Ctx, addItem, chance, fail, formatTime, pickWeighted, randInt, seasonOf, weekday } from "./core";
import { gainSkill, skillLevel, spendStamina } from "./farm";
import { playScene } from "./scenes";
import { track } from "./quests";
import { startFieldBattle } from "./battle";

export const DIRS: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 }
};

/** Lots whose building stands (or is being built) right now. */
export function occupiedLots(state: RestiaState, zone: ZoneId): [BuildingId, Lot][] {
  return (Object.entries(ZONES[zone].lots) as [BuildingId, Lot][]).filter(
    ([id, lot]) => state.town.levels[id] >= Math.max(lot.minLevel, 1) || lot.minLevel === 0 || state.town.project?.id === id
  );
}

export function walkable(state: RestiaState, zone: ZoneId, x: number, y: number): boolean {
  const def = ZONES[zone];
  if (x < 0 || y < 0 || x >= def.cols || y >= def.rows) return false;
  if (def.blocked.some((rect) => inRect(rect, x, y))) return false;
  if (def.water.some((rect) => inRect(rect, x, y))) return false;
  if (def.objects.some((object) => object.x === x && object.y === y)) return false;
  for (const [, lot] of occupiedLots(state, zone)) if (inRect(lot.rect, x, y)) return false;
  return true;
}

function exitAt(zone: ZoneId, x: number, y: number) {
  return ZONES[zone].exits.find((exit) => inRect(exit.rect, x, y)) ?? null;
}

export function travel(state: RestiaState, to: ZoneId, arrive: { x: number; y: number; facing: Dir }, ctx: Ctx): void {
  state.player = { zone: to, x: arrive.x, y: arrive.y, facing: arrive.facing, inside: null };
  state.minute += 15;
  ctx.events.push({ kind: "zone", zone: to });
}

export function step(state: RestiaState, dir: Dir, ctx: Ctx): void {
  if (state.player.inside) fail("Leave the building first.");
  const { dx, dy } = DIRS[dir];
  state.player.facing = dir;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  const zone = state.player.zone;
  const exit = exitAt(zone, nx, ny);
  if (exit && walkable(state, zone, nx, ny)) {
    travel(state, exit.to, exit.arrive, ctx);
    return;
  }
  if (!walkable(state, zone, nx, ny)) return;
  const bumped = state.fieldMonsters.find((monster) => monster.zone === zone && monster.x === nx && monster.y === ny);
  if (bumped) {
    startFieldBattle(state, bumped, "preemptive", ctx);
    return;
  }
  state.player.x = nx;
  state.player.y = ny;
  moveFieldMonsters(state, ctx);
}

export function doorOf(building: BuildingId): { zone: ZoneId; x: number; y: number } | null {
  for (const zone of Object.values(ZONES)) {
    const lot = zone.lots[building];
    if (lot) return { zone: zone.id, x: lot.door.x, y: lot.door.y };
  }
  return null;
}

export function isOpen(state: RestiaState, building: BuildingId): boolean {
  const def = BUILDINGS[building];
  if (mourning(state, def.owner)) return false;
  if (def.closedDay !== undefined && weekday(state.day) === def.closedDay) return false;
  if (!def.hours) return true;
  return state.minute >= def.hours[0] && state.minute < def.hours[1];
}

export function enter(state: RestiaState, building: BuildingId): void {
  if (state.player.inside) fail("You're already inside.");
  const door = doorOf(building);
  const def = BUILDINGS[building];
  if (!door || door.zone !== state.player.zone) fail(`${def.name} isn't here.`);
  if (Math.abs(state.player.x - door.x) + Math.abs(state.player.y - door.y) > 1) fail("Walk up to the door first.");
  if (state.town.levels[building] < 1) fail(`${def.name} hasn't been built yet. Use the Outpost Board in the Frostbitten square.`);
  if (mourning(state, def.owner)) fail(`${def.name} is closed. A note on the door: 'Closed for mourning.'`);
  if (!isOpen(state, building)) {
    const hours = def.hours;
    const when = hours ? `Open ${formatTime(hours[0])} - ${formatTime(hours[1])}` : "";
    fail(`${def.name} is closed. ${when}${def.closedDay !== undefined ? ", closed Sundays" : ""}.`);
  }
  state.player.inside = building;
}

export function leave(state: RestiaState): void {
  if (!state.player.inside) fail("You're already outside.");
  state.player.inside = null;
}

// ---------------------------------------------------------------------------
// Forage (the Frostwood)
// ---------------------------------------------------------------------------

const FORAGE_TABLE: Record<string, { item: string; weight: number }[]> = {
  spring: [
    { item: "wildHerb", weight: 4 },
    { item: "medicinalHerb", weight: 2 },
    { item: "mushroom", weight: 1 },
    { item: "glowcap", weight: 4 },
    { item: "dawnLily", weight: 2 },
    { item: "wildBerries", weight: 1 },
    { item: "wood", weight: 2 },
    { item: "stone", weight: 1 }
  ],
  summer: [
    { item: "wildHerb", weight: 3 },
    { item: "medicinalHerb", weight: 2 },
    { item: "wildBerries", weight: 3 },
    { item: "honey", weight: 1 },
    { item: "glowcap", weight: 3 },
    { item: "dawnLily", weight: 1 },
    { item: "wood", weight: 2 }
  ],
  autumn: [
    { item: "mushroom", weight: 3 },
    { item: "glowcap", weight: 3 },
    { item: "wildBerries", weight: 2 },
    { item: "medicinalHerb", weight: 1 },
    { item: "dawnLily", weight: 1 },
    { item: "wood", weight: 2 },
    { item: "ironOre", weight: 1 }
  ],
  winter: [
    { item: "glowcap", weight: 2 },
    { item: "wood", weight: 3 },
    { item: "stone", weight: 2 },
    { item: "ironOre", weight: 1 },
    { item: "dawnLily", weight: 1 }
  ]
};

export function spawnForage(state: RestiaState): void {
  const spots = [...(ZONES.forest.forage ?? [])];
  state.forage = [];
  const table = FORAGE_TABLE[seasonOf(state.day)]!;
  for (let i = 0; i < 6 && spots.length; i++) {
    const spot = spots.splice(randInt(state, 0, spots.length - 1), 1)[0]!;
    const entry = pickWeighted(state, table)!;
    state.forage.push({ zone: "forest", x: spot.x, y: spot.y, item: entry.item });
  }
}

export function forage(state: RestiaState, index: number, ctx: Ctx): void {
  const spot = state.forage[index];
  if (!spot || spot.zone !== state.player.zone || state.player.inside) fail("Nothing to gather there.");
  if (Math.max(Math.abs(spot.x - state.player.x), Math.abs(spot.y - state.player.y)) > 1) fail("Walk next to it first.");
  spendStamina(state, 2);
  let n = 1;
  if (chance(state, skillLevel(state.skills.foraging) * 0.05)) n += 1;
  addItem(state, spot.item, n);
  state.forage.splice(index, 1);
  state.minute += 5;
  gainSkill(state, "foraging", 3, ctx);
  track(state, ctx, "forage", n);
  ctx.toast(`Gathered ${n > 1 ? `${n} x ` : ""}${itemDef(spot.item).name}`, "info");
}

// ---------------------------------------------------------------------------
// Field monsters (visible symbols in the forest)
// ---------------------------------------------------------------------------

function forestLevel(state: RestiaState): [number, number] {
  const rank = rankIndex(state.guild.rank);
  return rank === 0 ? [1, 2] : rank === 1 ? [2, 4] : rank === 2 ? [4, 6] : [6, 9];
}

export function spawnFieldMonsters(state: RestiaState): void {
  state.fieldMonsters = [];
  const area = ZONES.forest.monsterArea ?? [];
  const eligible = FOREST_ENCOUNTERS.filter((entry) => !entry.minRank || rankIndex(state.guild.rank) >= rankIndex(entry.minRank));
  const [minLevel, maxLevel] = forestLevel(state);
  const total = randInt(state, 3, 4);
  let guard = 0;
  while (state.fieldMonsters.length < total && guard++ < 80) {
    const rect = area[randInt(state, 0, area.length - 1)]!;
    const x = randInt(state, rect[0], rect[2]);
    const y = randInt(state, rect[1], rect[3]);
    if (!walkable(state, "forest", x, y)) continue;
    if (state.fieldMonsters.some((monster) => Math.abs(monster.x - x) + Math.abs(monster.y - y) < 3)) continue;
    const size = randInt(state, 1, rankIndex(state.guild.rank) === 0 ? 2 : 3);
    const group = [];
    for (let i = 0; i < size; i++) {
      const entry = pickWeighted(state, eligible)!;
      group.push({ species: entry.species, level: randInt(state, minLevel, maxLevel) });
    }
    const monster: FieldMonster = {
      uid: `f${state.day}-${state.fieldMonsters.length}`,
      zone: "forest",
      x,
      y,
      symbol: group[0]!.species,
      group,
      boss: false,
      frozen: 0
    };
    state.fieldMonsters.push(monster);
  }
}

export function moveFieldMonsters(state: RestiaState, ctx: Ctx): void {
  const zone = state.player.zone;
  for (const monster of state.fieldMonsters) {
    if (monster.zone !== zone) continue;
    if (monster.frozen > 0) {
      monster.frozen -= 1;
      continue;
    }
    const dx = state.player.x - monster.x;
    const dy = state.player.y - monster.y;
    const distance = Math.abs(dx) + Math.abs(dy);
    let options: { x: number; y: number }[] = [];
    const neighbours = [
      { x: monster.x + 1, y: monster.y },
      { x: monster.x - 1, y: monster.y },
      { x: monster.x, y: monster.y + 1 },
      { x: monster.x, y: monster.y - 1 }
    ].filter(
      (cell) =>
        walkable(state, zone, cell.x, cell.y) &&
        !ZONES[zone].exits.some((exit) => inRect(exit.rect, cell.x, cell.y)) &&
        !state.fieldMonsters.some((other) => other !== monster && other.zone === zone && other.x === cell.x && other.y === cell.y)
    );
    if (distance <= 5) {
      options = neighbours.filter((cell) => Math.abs(state.player.x - cell.x) + Math.abs(state.player.y - cell.y) < distance);
    } else if (chance(state, 0.4)) {
      const area = ZONES[zone].monsterArea ?? [];
      options = neighbours.filter((cell) => area.some((rect) => inRect(rect, cell.x, cell.y)));
    }
    if (!options.length) continue;
    const next = options[randInt(state, 0, options.length - 1)]!;
    monster.x = next.x;
    monster.y = next.y;
    if (monster.x === state.player.x && monster.y === state.player.y) {
      startFieldBattle(state, monster, "ambushed", ctx);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Location-based story triggers
// ---------------------------------------------------------------------------

export function locationTriggers(state: RestiaState, ctx: Ctx): void {
  if (state.scene || state.battle) return;
  const { zone, inside } = state.player;
  const flags = state.flags;
  const active = (id: string) => state.quests.active.includes(id);
  if (!inside && zone === "forest" && flags.registered && !flags.frostwoodSeen) {
    playScene(state, "frostwoodFirst", ctx);
  } else if (!inside && zone === "forest" && flags.catJob && !flags.catFound) {
    playScene(state, "rolfHut", ctx);
  } else if (!inside && zone === "village" && flags.registered && !flags.metFrida) {
    playScene(state, "meetFrida", ctx);
  } else if (!inside && zone === "village" && flags.registered && state.day >= 2 && !flags.metHilda) {
    playScene(state, "meetHilda", ctx);
  } else if (inside === "inn" && active("q5Log") && !flags.spriteJarred && flags.logLostDay !== state.day) {
    playScene(state, "mugLog", ctx);
  } else if (inside === "inn" && active("q7Cat") && !flags.catJob) {
    playScene(state, "tuliCat", ctx);
  } else if (
    inside === "farmhouse" &&
    active("q9Dinner") &&
    !flags.dinnerDone &&
    state.town.levels.atelier >= 1 &&
    state.minute >= 17 * 60
  ) {
    playScene(state, "dinner", ctx);
  } else if (inside === "inn" && flags.chapter2 && state.town.levels.inn >= 2 && !flags.metSenna) {
    playScene(state, "sennaArrives", ctx);
  }
}
