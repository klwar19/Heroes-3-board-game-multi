import type { Dir, DungeonMonster, DungeonState, RestiaState } from "./types";
import { CHECKPOINTS, floorLevel, themeForFloor } from "../data/dungeon";
import { itemDef } from "../data/items";
import { ZONES } from "../data/zones";
import { Ctx, addItem, chance, fail, pickWeighted, randInt } from "./core";
import { gainSkill, skillLevel, spendStamina } from "./farm";
import { startDungeonBattle } from "./battle";
import { playScene } from "./scenes";
import { track } from "./quests";
import { DIRS } from "./world";

export const DUNGEON_W = 30;
export const DUNGEON_H = 20;

type Room = { x: number; y: number; w: number; h: number };

const BOSS_FLAG_BEFORE: Record<number, string> = { 6: "boss5", 11: "boss10", 16: "boss15" };

export function availableStarts(state: RestiaState): number[] {
  return CHECKPOINTS.filter((floor) => floor === 1 || !!state.flags[BOSS_FLAG_BEFORE[floor]!]);
}

function carve(tiles: string[], x: number, y: number, ch = "."): void {
  if (x > 0 && y > 0 && x < DUNGEON_W - 1 && y < DUNGEON_H - 1) tiles[y * DUNGEON_W + x] = ch;
}

function roomCells(room: Room): { x: number; y: number }[] {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) cells.push({ x, y });
  return cells;
}

function center(room: Room): { x: number; y: number } {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
}

function corridor(state: RestiaState, tiles: string[], a: { x: number; y: number }, b: { x: number; y: number }): void {
  const horizontalFirst = chance(state, 0.5);
  let { x, y } = a;
  const stepX = () => {
    while (x !== b.x) {
      x += Math.sign(b.x - x);
      carve(tiles, x, y);
    }
  };
  const stepY = () => {
    while (y !== b.y) {
      y += Math.sign(b.y - y);
      carve(tiles, x, y);
    }
  };
  if (horizontalFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
}

function distances(tiles: string[], from: { x: number; y: number }): Int32Array {
  const dist = new Int32Array(DUNGEON_W * DUNGEON_H).fill(-1);
  const queue = [from.y * DUNGEON_W + from.x];
  dist[queue[0]!] = 0;
  while (queue.length) {
    const cell = queue.shift()!;
    const x = cell % DUNGEON_W;
    const y = (cell - x) / DUNGEON_W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = (y + dy) * DUNGEON_W + (x + dx);
      if (tiles[next] === "#" || dist[next]! >= 0) continue;
      dist[next] = dist[cell]! + 1;
      queue.push(next);
    }
  }
  return dist;
}

function encounterGroup(state: RestiaState, floor: number, size: number) {
  const theme = themeForFloor(floor);
  const pool = theme.encounters.filter((entry) => !entry.minFloor || floor >= entry.minFloor);
  const group = [];
  for (let i = 0; i < size; i++) {
    const entry = pickWeighted(state, pool)!;
    group.push({ species: entry.species, level: Math.max(1, floorLevel(floor) + randInt(state, -1, 1)) });
  }
  return group;
}

export function generateFloor(state: RestiaState, floor: number): DungeonState {
  const theme = themeForFloor(floor);
  const tiles = Array.from({ length: DUNGEON_W * DUNGEON_H }, () => "#");
  const bossFloor = floor === theme.boss.floor && !state.flags[theme.boss.flag];
  const rooms: Room[] = [];
  if (floor === theme.boss.floor) {
    rooms.push({ x: 2, y: 8, w: 5, h: 4 });
    rooms.push({ x: 11, y: 3, w: 16, h: 14 });
  } else {
    for (let attempt = 0; attempt < 80 && rooms.length < 9; attempt++) {
      const w = randInt(state, 4, 8);
      const h = randInt(state, 3, 6);
      const room = { x: randInt(state, 1, DUNGEON_W - w - 2), y: randInt(state, 1, DUNGEON_H - h - 2), w, h };
      const overlaps = rooms.some(
        (other) => room.x - 1 < other.x + other.w && room.x + room.w + 1 > other.x && room.y - 1 < other.y + other.h && room.y + room.h + 1 > other.y
      );
      if (!overlaps) rooms.push(room);
    }
  }
  for (const room of rooms) for (const cell of roomCells(room)) carve(tiles, cell.x, cell.y);
  for (let i = 1; i < rooms.length; i++) corridor(state, tiles, center(rooms[i - 1]!), center(rooms[i]!));
  for (let i = 0; i < 2 && rooms.length > 3; i++) {
    corridor(state, tiles, center(rooms[randInt(state, 0, rooms.length - 1)]!), center(rooms[randInt(state, 0, rooms.length - 1)]!));
  }
  const start = center(rooms[0]!);
  tiles[start.y * DUNGEON_W + start.x] = "<";
  let stairs: { x: number; y: number };
  if (floor === theme.boss.floor) {
    stairs = { x: 24, y: 10 };
  } else {
    const dist = distances(tiles, start);
    let best = 0;
    stairs = start;
    for (const room of rooms.slice(1)) {
      const c = center(room);
      const d = dist[c.y * DUNGEON_W + c.x]!;
      if (d > best) {
        best = d;
        stairs = c;
      }
    }
  }
  tiles[stairs.y * DUNGEON_W + stairs.x] = ">";

  const occupied = new Set<number>([start.y * DUNGEON_W + start.x, stairs.y * DUNGEON_W + stairs.x]);
  const freeCell = (room: Room) => {
    for (let tries = 0; tries < 20; tries++) {
      const x = randInt(state, room.x, room.x + room.w - 1);
      const y = randInt(state, room.y, room.y + room.h - 1);
      const key = y * DUNGEON_W + x;
      if (tiles[key] === "." && !occupied.has(key) && Math.abs(x - start.x) + Math.abs(y - start.y) > 3) {
        occupied.add(key);
        return { x, y };
      }
    }
    return null;
  };

  const monsters: DungeonMonster[] = [];
  if (bossFloor) {
    const level = floorLevel(floor) + 2;
    monsters.push({
      uid: `boss${floor}`,
      x: stairs.x - 2,
      y: stairs.y,
      symbol: theme.boss.species,
      group: [{ species: theme.boss.species, level }, ...theme.boss.minions.map((species) => ({ species, level: level - 2 }))],
      boss: true,
      frozen: 0
    });
    occupied.add(stairs.y * DUNGEON_W + stairs.x - 2);
  } else if (floor !== theme.boss.floor) {
    const groups = 3 + Math.floor(floor / 5) + randInt(state, 0, 2);
    for (let i = 0; i < groups; i++) {
      const room = rooms[randInt(state, 1, rooms.length - 1)]!;
      const cell = freeCell(room);
      if (!cell) continue;
      const group = encounterGroup(state, floor, randInt(state, 1, floor >= 6 ? 4 : 3));
      monsters.push({ uid: `m${floor}-${i}`, x: cell.x, y: cell.y, symbol: group[0]!.species, group, boss: false, frozen: 0 });
    }
  }
  const chests = [];
  const chestCount = floor === theme.boss.floor ? (bossFloor ? 0 : 1) : randInt(state, 1, 3);
  for (let i = 0; i < chestCount; i++) {
    const cell = freeCell(rooms[randInt(state, rooms.length > 1 ? 1 : 0, rooms.length - 1)]!);
    if (!cell) continue;
    const loot = pickWeighted(state, theme.chest)!;
    chests.push({ x: cell.x, y: cell.y, opened: false, item: loot.item, n: loot.n });
  }
  const nodes = [];
  const nodeCount = floor === theme.boss.floor ? 0 : randInt(state, 2, 4);
  for (let i = 0; i < nodeCount; i++) {
    const cell = freeCell(rooms[randInt(state, 0, rooms.length - 1)]!);
    if (cell) nodes.push({ x: cell.x, y: cell.y, kind: chance(state, 0.6) ? ("ore" as const) : ("herb" as const), used: false });
  }
  const dungeon: DungeonState = {
    floor,
    theme: theme.id,
    w: DUNGEON_W,
    h: DUNGEON_H,
    tiles: tiles.join(""),
    seen: "0".repeat(DUNGEON_W * DUNGEON_H),
    x: start.x,
    y: start.y,
    facing: "down",
    monsters,
    chests,
    nodes,
    bossFloor,
    stepCount: 0
  };
  reveal(dungeon);
  return dungeon;
}

export function tileAt(dungeon: DungeonState, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= dungeon.w || y >= dungeon.h) return "#";
  return dungeon.tiles[y * dungeon.w + x]!;
}

function reveal(dungeon: DungeonState): void {
  const seen = dungeon.seen.split("");
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = dungeon.x + dx;
      const y = dungeon.y + dy;
      if (x < 0 || y < 0 || x >= dungeon.w || y >= dungeon.h || dx * dx + dy * dy > 18) continue;
      seen[y * dungeon.w + x] = "1";
    }
  }
  dungeon.seen = seen.join("");
}

export function enterDungeon(state: RestiaState, floor: number, ctx: Ctx): void {
  if (state.dungeon) fail("You're already in the dungeon.");
  if (!state.flags.catacombsOpen) fail("The Guild hasn't cleared you for the catacombs yet (Rank E).");
  const cave = ZONES.forest.spots.caveMouth!;
  if (state.player.zone !== "forest" || state.player.inside || Math.abs(state.player.x - cave.x) + Math.abs(state.player.y - cave.y) > 1) {
    fail("The Old Temple Ruins open through the stone doorway at the far end of the Frostwood.");
  }
  if (!availableStarts(state).includes(floor)) fail("You haven't reached that floor yet.");
  state.dungeon = openFloor(state, floor, ctx);
  state.stats.deepest = Math.max(state.stats.deepest, floor);
  state.minute += 10;
  playScene(state, "catacombsFirst", ctx);
}

/**
 * A floor already visited today comes back exactly as it was left (beaten monsters
 * stay beaten, opened chests and used nodes stay empty), so leaving and re-entering
 * can't restock it. Bin arrives on its stairs up. Floors restock overnight.
 */
function openFloor(state: RestiaState, floor: number, ctx: Ctx): DungeonState {
  const kept = state.floorsToday[floor];
  if (!kept) return generateFloor(state, floor);
  delete state.floorsToday[floor];
  const up = kept.tiles.indexOf("<");
  kept.x = up % kept.w;
  kept.y = Math.floor(up / kept.w);
  kept.facing = "down";
  reveal(kept);
  ctx.toast(`Floor ${floor} is as you left it. The ruins restock overnight.`, "info");
  return kept;
}

/** Remembers the floor Bin is leaving for the rest of the day. */
function stashFloor(state: RestiaState): void {
  if (state.dungeon) state.floorsToday[state.dungeon.floor] = state.dungeon;
}

export function leaveDungeon(state: RestiaState, ctx: Ctx, viaScroll = false): void {
  const dungeon = state.dungeon;
  if (!dungeon) fail("You're not in the dungeon.");
  if (!viaScroll && tileAt(dungeon, dungeon.x, dungeon.y) !== "<") fail("Stand on the stairs up to leave (or use a Return Scroll).");
  stashFloor(state);
  state.dungeon = null;
  const cave = ZONES.forest.spots.caveMouth!;
  state.player = { zone: "forest", x: cave.x, y: cave.y, facing: "down", inside: null };
  state.minute += 10;
  ctx.events.push({ kind: "zone", zone: "forest" });
}

function monsterAt(dungeon: DungeonState, x: number, y: number): DungeonMonster | undefined {
  return dungeon.monsters.find((monster) => monster.x === x && monster.y === y);
}

function bumpMonster(state: RestiaState, monster: DungeonMonster, initiative: "preemptive" | "ambushed", ctx: Ctx): void {
  if (monster.boss) playScene(state, themeForFloor(state.dungeon!.floor).boss.scene, ctx);
  startDungeonBattle(state, monster, initiative, ctx);
}

export function dungeonStep(state: RestiaState, dir: Dir, ctx: Ctx): void {
  const dungeon = state.dungeon;
  if (!dungeon) fail("You're not in the dungeon.");
  const { dx, dy } = DIRS[dir];
  dungeon.facing = dir;
  const nx = dungeon.x + dx;
  const ny = dungeon.y + dy;
  if (tileAt(dungeon, nx, ny) === "#") return;
  const monster = monsterAt(dungeon, nx, ny);
  if (monster) {
    bumpMonster(state, monster, "preemptive", ctx);
    return;
  }
  if (dungeon.chests.some((chest) => chest.x === nx && chest.y === ny && !chest.opened)) return;
  if (dungeon.nodes.some((node) => node.x === nx && node.y === ny && !node.used)) return;
  dungeon.x = nx;
  dungeon.y = ny;
  dungeon.stepCount += 1;
  if (dungeon.stepCount % 10 === 0) state.minute += 10;
  reveal(dungeon);
  for (const other of dungeon.monsters) {
    if (other.boss) continue;
    if (other.frozen > 0) {
      other.frozen -= 1;
      continue;
    }
    const distance = Math.abs(dungeon.x - other.x) + Math.abs(dungeon.y - other.y);
    const steps = [
      { x: other.x + 1, y: other.y },
      { x: other.x - 1, y: other.y },
      { x: other.x, y: other.y + 1 },
      { x: other.x, y: other.y - 1 }
    ].filter(
      (cell) =>
        tileAt(dungeon, cell.x, cell.y) === "." &&
        !monsterAt(dungeon, cell.x, cell.y) &&
        !dungeon.chests.some((chest) => chest.x === cell.x && chest.y === cell.y && !chest.opened) &&
        !dungeon.nodes.some((node) => node.x === cell.x && node.y === cell.y && !node.used)
    );
    let options = steps;
    if (distance <= 6) options = steps.filter((cell) => Math.abs(dungeon.x - cell.x) + Math.abs(dungeon.y - cell.y) < distance);
    else if (!chance(state, 0.5)) options = [];
    if (!options.length) continue;
    const next = options[randInt(state, 0, options.length - 1)]!;
    other.x = next.x;
    other.y = next.y;
    if (other.x === dungeon.x && other.y === dungeon.y) {
      bumpMonster(state, other, "ambushed", ctx);
      return;
    }
  }
}

/** Open a chest / gather a node next to Bin, or take the stairs he stands on. */
export function dungeonInteract(state: RestiaState, ctx: Ctx): void {
  const dungeon = state.dungeon;
  if (!dungeon) fail("You're not in the dungeon.");
  const here = tileAt(dungeon, dungeon.x, dungeon.y);
  if (here === ">") return descend(state, ctx);
  if (here === "<") return leaveDungeon(state, ctx);
  const near = (x: number, y: number) => Math.abs(x - dungeon.x) + Math.abs(y - dungeon.y) === 1;
  const chest = dungeon.chests.find((entry) => !entry.opened && near(entry.x, entry.y));
  if (chest) {
    chest.opened = true;
    addItem(state, chest.item, chest.n);
    ctx.toast(`Treasure! ${itemDef(chest.item).name} x${chest.n}`, "good");
    return;
  }
  const node = dungeon.nodes.find((entry) => !entry.used && near(entry.x, entry.y));
  if (node) {
    spendStamina(state, 4);
    const theme = themeForFloor(dungeon.floor);
    const table = node.kind === "ore" ? theme.ore : theme.herb;
    const skill = node.kind === "ore" ? "mining" : "foraging";
    let n = 1;
    if (chance(state, skillLevel(state.skills[skill]) * 0.05)) n += 1;
    const item = pickWeighted(state, table)!.item;
    addItem(state, item, n);
    node.used = true;
    state.minute += 10;
    gainSkill(state, skill, 5, ctx);
    track(state, ctx, "forage", n);
    ctx.toast(`Gathered ${itemDef(item).name}${n > 1 ? ` x${n}` : ""}`, "info");
    return;
  }
  fail("Nothing here. Stand on stairs, or next to a chest or gathering spot.");
}

function descend(state: RestiaState, ctx: Ctx): void {
  const dungeon = state.dungeon!;
  if (dungeon.bossFloor && dungeon.monsters.some((monster) => monster.boss)) fail("The guardian blocks the way down.");
  const next = dungeon.floor + 1;
  stashFloor(state);
  state.dungeon = openFloor(state, next, ctx);
  if (next > state.stats.deepest) state.stats.deepest = next;
  state.minute += 20;
  track(state, ctx, "floor", 1);
  ctx.toast(`Floor ${next} - ${themeForFloor(next).name}`, "info");
}
