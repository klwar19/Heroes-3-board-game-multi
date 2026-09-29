import type {
  BattleAnim,
  BattleChallenge,
  BattleOrigin,
  BattlePoint,
  BattleProp,
  BattleRewards,
  BattleState,
  BattleUnit,
  BoardSize,
  CharId,
  DungeonMonster,
  Element,
  MonsterId,
  RestiaState,
  SkillDef,
  SkillSprite,
  StatKey,
  StatusId
} from "./types";
import { CHARACTERS, DAIN_BATTLE } from "../data/characters";
import { MONSTERS, monsterDef } from "../data/monsters";
import { SKILLS, skillDef } from "../data/skills";
import { ITEMS, itemDef } from "../data/items";
import { EVENT_ENCOUNTERS, themeForFloor } from "../data/dungeon";
import { ZONES } from "../data/zones";
import { POINT_NAMES, PROP_NAMES, battlefieldOf } from "../data/battlefields";
import { unitSound } from "../data/unit-sounds";
import { Ctx, chance, clamp, count, fail, perk, pick, random, randInt, removeItem } from "./core";
import { BOARD_CELLS, BOARD_COLS, cellOf, colRow, hexDistance, hexLine, hexRay, inBoard, neighbors, reachWeighted, stepAway } from "./hex";
import { activeLimit, gainExp, growStats, memberPassives, memberSkills, memberStats, petStats } from "./party";
import { gainJobExp } from "./jobs";
import { pv } from "./passives";
import { cellsAt, cellsOf, distanceTo, nearestPair, occupies, tailAt, unitDistance } from "./footprint";
import {
  BOARD_SIZES,
  MAX_HEIGHT,
  blocksSight,
  buildField,
  cliffBetween,
  hasHighGround,
  hasLineOfSight,
  heightOf,
  isCrag,
  openCells,
  propAt,
  randomOpenCell,
  setHeight,
  standable,
  stepCost,
  weatherMult,
  weatherRange
} from "./battle-field";
import { barnCapacity } from "./state";
import { gainSkill, skillLevel } from "./farm";
import { hasBuff } from "./town";
import { track } from "./quests";
import { playScene } from "./scenes";
import { passOut } from "./day";

export type BattleSpec = {
  enemies: { species: MonsterId; level: number }[];
  rival?: boolean;
  backdrop: string;
  /** Named board layout (data/battlefields.ts); default: picked for the biome. */
  layout?: string;
  origin: BattleOrigin;
  canFlee: boolean;
  boss: boolean;
  initiative: "normal" | "preemptive" | "ambushed";
  soft?: boolean;
  winScene?: string;
  loseScene?: string;
  reinforce?: BattleState["reinforce"];
  /** Board size for random fights (default small). Event, soft and fixed-layout battles are always small. */
  size?: BoardSize;
};

/** AP every turn starts with (before passives and carried AP). */
export const BASE_AP = 3;
/** Sprint: 1 AP for this much extra movement (before the turn's action). */
export const SPRINT_MOVE = 2;
export const ITEM_AP = 1;
/** Defend carries 1 AP into the next turn; ending a turn without acting (Charge) carries 2. */
export const DEFEND_CARRY = 1;
export const CHARGE_CARRY = 2;

/** Deployment rows, middle first: [3, 1, 5, 2, 4, 0, 6] on the 7-row board, the same spread on taller ones. */
function deployRows(rows: number): number[] {
  const middle = Math.floor(rows / 2);
  return [0, -2, 2, -1, 1, -3, 3, -4, 4, -5, 5].map((offset) => middle + offset).filter((row) => row >= 0 && row < rows);
}

/** Random fights: the board grows with the enemy group, with a little luck either way. */
export function pickBoardSize(state: RestiaState, enemies: number): BoardSize {
  const roll = random(state);
  if (enemies <= 1) return roll < 0.65 ? "small" : "medium";
  if (enemies === 2) return roll < 0.4 ? "small" : "medium";
  if (enemies <= 4) return roll < (enemies === 3 ? 0.7 : 0.45) ? "medium" : "large";
  return roll < 0.15 ? "medium" : "large";
}

/** Where a unit's whole footprint can stand: free, standable and (two-hex units) level. */
export function canStandAt(battle: BattleState, unit: BattleUnit, head: number): boolean {
  const cells = cellsAt(unit, head);
  if (unit.wide && cells.length < 2) return false;
  for (const cell of cells) {
    if (!standable(battle, cell)) return false;
    const other = unitAt(battle, cell);
    if (other && other !== unit) return false;
  }
  return !unit.wide || heightOf(battle, cells[0]!) === heightOf(battle, cells[1]!);
}

/**
 * A deployment hex: allies in the two west columns, enemies in the two east
 * columns (front column first, middle rows first), then anywhere on their half.
 */
function deployCell(battle: BattleState, unit: BattleUnit, preferred: number | null): number | null {
  if (preferred !== null && canStandAt(battle, unit, preferred)) return preferred;
  const ally = unit.side === "ally";
  const columns = ally ? [1, 0] : [battle.cols - 2, battle.cols - 1];
  const rows = deployRows(battle.rows);
  for (const col of columns) for (const row of rows) if (canStandAt(battle, unit, cellOf(col, row))) return cellOf(col, row);
  for (let offset = 2; offset < battle.cols; offset++) {
    const col = ally ? offset : battle.cols - 1 - offset;
    for (const row of rows) if (canStandAt(battle, unit, cellOf(col, row))) return cellOf(col, row);
  }
  return null;
}

/**
 * Medium and large boards: an enemy's spot in the eastern ~40% of the field,
 * near its group's first member when it has one (whole footprint on free,
 * standable, level ground, off the objectives). Null: no room (deploy instead).
 */
function scatterCell(state: RestiaState, battle: BattleState, unit: BattleUnit, anchor: number | null): number | null {
  const east = Math.floor(battle.cols * 0.6);
  const onPoint = (head: number) => cellsAt(unit, head).some((cell) => !!battle.points?.some((point) => point.cell === cell));
  const fits = (cell: number) => colRow(cell).col >= east && colRow(cell).col < battle.cols && canStandAt(battle, unit, cell) && !onPoint(cell);
  if (anchor === null) return randomOpenCell(state, battle, fits);
  const at = anchor;
  const near = openCells(battle).filter((cell) => fits(cell) && hexDistance(cell, at) <= 3);
  if (!near.length) return randomOpenCell(state, battle, fits);
  const closest = Math.min(...near.map((cell) => hexDistance(cell, at)));
  return pick(state, near.filter((cell) => hexDistance(cell, at) <= Math.max(2, closest)));
}
const NEGATIVE: StatusId[] = ["poison", "burn", "sleep", "stun", "slow", "freeze", "bleed", "silence", "blind", "root", "mark", "taunt"];
const POSITIVE: StatusId[] = ["regen", "haste"];
const STATUS_NAMES: Record<StatusId, string> = {
  poison: "Poisoned",
  burn: "Burning",
  sleep: "Asleep",
  stun: "Stunned",
  slow: "Slowed",
  freeze: "Frozen",
  bleed: "Bleeding",
  silence: "Silenced",
  blind: "Blinded",
  root: "Rooted",
  mark: "Marked",
  taunt: "Taunted",
  regen: "Regenerating",
  haste: "Hasted"
};
/** Statuses that count down at the end of the holder's own turn (control effects count down when they skip it). */
const TICKING: StatusId[] = ["poison", "burn", "slow", "bleed", "silence", "blind", "root", "mark", "taunt", "regen", "haste"];

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

function blankCombat(): Pick<BattleUnit, "statuses" | "mods" | "retaliated" | "defending" | "down" | "ap" | "apCarry" | "shield"> {
  return { statuses: [], mods: [], retaliated: false, defending: false, down: false, ap: 0, apCarry: 0, shield: 0 };
}

/** Passive max HP/MP bonuses for units whose stats don't already include them (monsters, pets, the rival). */
function withPassiveVitals(stats: BattleUnit["stats"], passives: string[]): BattleUnit["stats"] {
  const sum = pv({ passives } as BattleUnit);
  const out = { ...stats };
  out.maxHp = Math.max(1, Math.round(out.maxHp * (1 + (sum.stats.maxHp ?? 0) / 100)));
  out.maxMp = Math.max(0, Math.round(out.maxMp * (1 + (sum.stats.maxMp ?? 0) / 100)));
  return out;
}

function memberUnit(state: RestiaState, id: CharId, cell: number): BattleUnit {
  const def = CHARACTERS[id];
  const member = state.members[id]!;
  const weapon = member.equip.weapon ? ITEMS[member.equip.weapon]?.equip : undefined;
  return {
    uid: `a-${id}`,
    side: "ally",
    kind: "member",
    ref: id,
    name: def.name,
    level: member.level,
    stats: memberStats(state, id),
    move: def.move,
    range: def.range,
    flying: false,
    hp: member.hp,
    mp: member.mp,
    cell,
    facing: "right",
    element: weapon?.element ?? def.element,
    resist: def.resist,
    skills: memberSkills(state, id),
    ...blankCombat(),
    boss: false,
    tame: 0,
    exp: 0,
    gold: 0,
    drops: [],
    sprite: `restia-${id}`,
    scale: 1,
    magic: def.weapon === "staff",
    passives: memberPassives(state, id)
  };
}

function monsterUnit(species: MonsterId, level: number, uid: string, side: "ally" | "enemy", cell: number): BattleUnit {
  const def = monsterDef(species);
  const passives = [...(def.passives ?? [])];
  const stats = withPassiveVitals(growStats(def.base, def.growth, level), passives);
  return {
    uid,
    side,
    kind: side === "ally" ? "pet" : "monster",
    ref: species,
    name: def.name,
    level,
    stats,
    move: def.move,
    range: def.range,
    flying: !!def.flying,
    hp: stats.maxHp,
    mp: stats.maxMp,
    cell,
    facing: side === "ally" ? "right" : "left",
    element: def.element,
    resist: def.resist,
    skills: [...def.skills],
    ...blankCombat(),
    boss: !!def.boss,
    tame: def.tame,
    exp: Math.round(def.exp * (1 + 0.25 * (level - 1))),
    gold: Math.round(def.gold * (1 + 0.2 * (level - 1))),
    drops: def.drops,
    sprite: def.sprite,
    scale: def.scale ?? 1,
    magic: !!def.magic,
    passives,
    ...(def.wide ? { wide: true } : {})
  };
}

const RIVAL_PASSIVES = ["weaponTraining", "battleRhythm"];

function rivalUnit(level: number, cell: number): BattleUnit {
  const stats = withPassiveVitals(growStats(DAIN_BATTLE.base, DAIN_BATTLE.growth, level), RIVAL_PASSIVES);
  return {
    uid: "e-dain",
    side: "enemy",
    kind: "guest",
    ref: "dain",
    name: "Dain",
    level,
    stats,
    move: DAIN_BATTLE.move,
    range: DAIN_BATTLE.range,
    flying: false,
    hp: stats.maxHp,
    mp: stats.maxMp,
    cell,
    facing: "left",
    element: "phys",
    resist: {},
    skills: [...DAIN_BATTLE.skills],
    ...blankCombat(),
    boss: true,
    tame: 0,
    exp: 40 * level,
    gold: 0,
    drops: [],
    sprite: "restia-dain",
    scale: 1,
    magic: false,
    passives: [...RIVAL_PASSIVES]
  };
}

function aliveFighter(state: RestiaState, id: string): boolean {
  if (id.startsWith("pet:")) return (state.pets.find((pet) => `pet:${pet.uid}` === id)?.hp ?? 0) > 0;
  return (state.members[id as CharId]?.hp ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const CHALLENGES: { id: BattleChallenge["id"]; weight: number; make: (enemies: number) => Omit<BattleChallenge, "progress" | "failed" | "id"> }[] = [
  { id: "fast", weight: 3, make: (n) => ({ text: `Win within ${n <= 2 ? 3 : 4} rounds`, target: n <= 2 ? 3 : 4, jp: 1 }) },
  { id: "weakness", weight: 3, make: () => ({ text: "Land 3 hits on a weakness", target: 3, jp: 1 }) },
  { id: "crit", weight: 2, make: () => ({ text: "Finish a foe with a critical hit", target: 1, jp: 1 }) },
  { id: "untouched", weight: 2, make: () => ({ text: "Win without anyone falling", target: 1, jp: 1 }) },
  { id: "boom", weight: 2, make: () => ({ text: "Take out a foe with an explosion", target: 1, jp: 2 }) },
  { id: "highGround", weight: 2, make: () => ({ text: "Land 3 hits from high ground", target: 3, jp: 1 }) },
  { id: "points", weight: 2, make: () => ({ text: "Hold every point at once", target: 1, jp: 2 }) }
];
/** Audience challenges per day (Jester Points can't be farmed). */
export const CHALLENGES_PER_DAY = 3;

function rollChallenge(state: RestiaState, battle: BattleState, spec: BattleSpec): BattleChallenge | null {
  if (spec.soft || spec.origin.kind === "event") return null;
  if ((state.stats.today.challenges ?? 0) >= CHALLENGES_PER_DAY || !chance(state, 0.4)) return null;
  const hasBarrels = battle.props.some((prop) => prop.kind === "barrel");
  const hasHigh = hasHighGround(battle);
  const holdable = (battle.points ?? []).filter((point) => point.kind !== "cache").length;
  const options = CHALLENGES.filter((entry) => (entry.id !== "boom" || hasBarrels) && (entry.id !== "highGround" || hasHigh) && (entry.id !== "points" || holdable >= 2));
  let total = options.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random(state) * total;
  for (const entry of options) {
    roll -= entry.weight;
    if (roll > 0) continue;
    total = spec.enemies.length + (spec.rival ? 1 : 0);
    state.stats.today.challenges = (state.stats.today.challenges ?? 0) + 1;
    return { id: entry.id, progress: 0, failed: false, ...entry.make(total) };
  }
  return null;
}

export function startBattle(state: RestiaState, spec: BattleSpec, ctx: Ctx): void {
  let ids = state.active.filter((id) => aliveFighter(state, id)).slice(0, activeLimit(state));
  if (!ids.length) {
    ids = (Object.keys(state.members) as CharId[]).filter((id) => aliveFighter(state, id)).slice(0, activeLimit(state));
  }
  if (!ids.length) {
    ctx.toast("Nobody is fit to fight...", "bad");
    passOut(state, ctx, "Your whole party was down. Someone carried you home.");
    return;
  }
  const level = Math.max(1, Math.round(ids.reduce((sum, id) => sum + (id.startsWith("pet:") ? state.pets.find((pet) => `pet:${pet.uid}` === id)?.level ?? 1 : state.members[id as CharId]?.level ?? 1), 0) / ids.length));
  // Story/event fights, spars and fixed arenas keep the small authored boards.
  const randomFight = !spec.layout && !spec.soft && spec.origin.kind !== "event";
  const size: BoardSize = randomFight ? spec.size ?? "small" : "small";
  const { cols, rows } = BOARD_SIZES[size];
  // A two-hex walker on either side (flyers pass over everything) needs a way across the board.
  const walker = (species: MonsterId | undefined) => !!species && !!MONSTERS[species]?.wide && !MONSTERS[species]?.flying;
  const wide = spec.enemies.some((enemy) => walker(enemy.species)) || ids.some((id) => walker(state.pets.find((pet) => `pet:${pet.uid}` === id)?.species));
  const field = buildField(state, { backdrop: spec.backdrop, layout: spec.layout, boss: spec.boss, level, cols, rows, objectives: randomFight && !spec.boss, wide });
  const units: BattleUnit[] = [];
  ids.forEach((id) => {
    const cell = -1;
    if (id.startsWith("pet:")) {
      const pet = state.pets.find((entry) => `pet:${entry.uid}` === id)!;
      const unit = monsterUnit(pet.species, pet.level, `a-pet-${pet.uid}`, "ally", cell);
      unit.name = pet.name;
      unit.stats = withPassiveVitals(petStats(pet), unit.passives);
      unit.hp = Math.min(pet.hp, unit.stats.maxHp);
      unit.mp = Math.min(pet.mp, unit.stats.maxMp);
      unit.petUid = pet.uid;
      unit.boss = false;
      units.push(unit);
    } else {
      units.push(memberUnit(state, id as CharId, cell));
    }
  });
  spec.enemies.forEach((enemy, index) => {
    units.push(monsterUnit(enemy.species, enemy.level, `e${index}`, "enemy", -1));
  });
  if (spec.rival) units.push(rivalUnit(Math.max(8, (state.members.bin?.level ?? 1) + 1), -1));
  for (const unit of units) {
    const shield = pv(unit).shieldStart;
    if (shield > 0) unit.shield = Math.round(unit.stats.maxHp * shield);
    if (unit.kind !== "monster") continue;
    const entry = (state.bestiary[unit.ref] ??= { seen: 0, defeated: 0, analyzed: false });
    entry.seen += 1;
    if (perk(state, "autoAnalyze")) entry.analyzed = true;
  }
  const biome = battlefieldOf(spec.backdrop).biome;
  // Falling rocks/icicles: some dungeon and Frostwood fights (never story or boss fights).
  const hazardRoll = spec.origin.kind === "dungeon" ? 0.35 : spec.origin.kind === "field" && biome === "frost" ? 0.2 : 0;
  const hazard = !spec.boss && !spec.soft && hazardRoll > 0 && chance(state, hazardRoll) ? { kind: biome === "frost" || biome === "nave" ? ("icicles" as const) : ("rockfall" as const), from: 3 } : null;
  const battle: BattleState = {
    size,
    cols,
    rows,
    backdrop: spec.backdrop,
    ...field,
    warnings: [],
    hazard,
    reinforce: spec.reinforce ?? null,
    challenge: null,
    units: [],
    round: 0,
    queue: [],
    active: null,
    turn: { moved: false, acted: false, waited: false, sprinted: false, item: false, movePts: 0 },
    waited: [],
    phase: "turn",
    origin: spec.origin,
    canFlee: spec.canFlee,
    boss: spec.boss,
    initiative: spec.initiative,
    rewards: null,
    log: [],
    ...(spec.winScene ? { winScene: spec.winScene } : {}),
    ...(spec.loseScene ? { loseScene: spec.loseScene } : {}),
    ...(spec.soft ? { soft: true } : {})
  };
  // Each unit takes the first deployment hex its whole footprint fits on (the rival fights up front).
  // On medium and large boards enemies stand in small groups over the eastern part of the field instead.
  let anchor: number | null = null;
  let group = 0;
  for (const unit of units) {
    let cell: number | null = null;
    if (size !== "small" && unit.side === "enemy" && unit.uid !== "e-dain") {
      if (group <= 0) {
        anchor = null;
        group = randInt(state, 1, 3);
      }
      cell = scatterCell(state, battle, unit, anchor);
      if (cell !== null) {
        anchor ??= cell;
        group -= 1;
      }
    }
    cell ??= deployCell(battle, unit, unit.uid === "e-dain" ? cellOf(battle.cols - 2, Math.floor(battle.rows / 2)) : null);
    if (cell === null) continue;
    unit.cell = cell;
    battle.units.push(unit);
  }
  battle.challenge = rollChallenge(state, battle, spec);
  state.battle = battle;
  const anims: BattleAnim[] = [];
  if (battle.weather !== "clear") battle.log.push(`Weather: ${battle.weather}.`);
  if (battle.challenge) {
    battle.log.push(`[CJS] Audience challenge: ${battle.challenge.text} (+${battle.challenge.jp} JP).`);
    anims.push({ kind: "banner", text: `Audience challenge: ${battle.challenge.text}` });
  }
  if (spec.initiative === "preemptive") battle.log.push("You caught them off guard! Your party moves first.");
  if (spec.initiative === "ambushed") battle.log.push("Ambush! The enemy moves first.");
  beginTurn(state, battle, anims, ctx);
  if (anims.length) ctx.events.push({ kind: "battle", anims });
}

export function startFieldBattle(state: RestiaState, monster: DungeonMonster, initiative: "preemptive" | "ambushed", ctx: Ctx): void {
  startBattle(
    state,
    {
      enemies: monster.group,
      backdrop: ZONES[state.player.zone].battleBackdrop,
      origin: { kind: "field", monsterUid: monster.uid },
      canFlee: true,
      boss: false,
      initiative,
      size: pickBoardSize(state, monster.group.length)
    },
    ctx
  );
}

export function startDungeonBattle(state: RestiaState, monster: DungeonMonster, initiative: "preemptive" | "ambushed" | "normal", ctx: Ctx): void {
  const dungeon = state.dungeon!;
  const theme = themeForFloor(dungeon.floor);
  const boss = monster.boss;
  const bossFloor = boss && dungeon.floor === theme.boss.floor;
  // Floor bosses call two of their minions in on round 3.
  const minions = monster.group.filter((entry) => entry.species !== theme.boss.species).slice(0, 2);
  startBattle(
    state,
    {
      enemies: monster.group,
      backdrop: theme.backdrop,
      ...(bossFloor ? { layout: "arena" } : { size: pickBoardSize(state, monster.group.length) }),
      origin: { kind: "dungeon", monsterUid: monster.uid },
      canFlee: !boss,
      boss,
      initiative: boss ? "normal" : initiative,
      ...(bossFloor ? { winScene: theme.boss.winScene } : {}),
      ...(bossFloor && minions.length ? { reinforce: { round: 3, enemies: minions } } : {})
    },
    ctx
  );
}

export function startEventBattle(state: RestiaState, id: string, ctx: Ctx): void {
  const encounter = EVENT_ENCOUNTERS[id];
  if (!encounter) throw new Error(`Unknown Restia encounter ${id}`);
  startBattle(
    state,
    {
      enemies: encounter.enemies,
      rival: encounter.rival,
      backdrop: encounter.backdrop,
      ...(encounter.layout ? { layout: encounter.layout } : {}),
      origin: { kind: "event", encounter: id },
      canFlee: encounter.canFlee,
      boss: true,
      initiative: "normal",
      soft: encounter.soft,
      winScene: encounter.winScene,
      loseScene: encounter.loseScene
    },
    ctx
  );
}

// ---------------------------------------------------------------------------
// Stats & helpers
// ---------------------------------------------------------------------------

export function hasStatus(unit: BattleUnit, id: StatusId): boolean {
  return unit.statuses.some((status) => status.id === id);
}

/** Bonus % to a stat from allies' auras and friendly ward totems nearby. */
function auraPct(battle: BattleState, unit: BattleUnit, stat: StatKey): number {
  let pct = 0;
  for (const other of battle.units) {
    if (other === unit || other.side !== unit.side || other.hp <= 0 || other.gone) continue;
    const aura = pv(other).aura[stat];
    if (aura && unitDistance(other, unit) <= 2) pct += aura;
  }
  if (stat === "def" || stat === "res") {
    for (const prop of battle.props) if (prop.kind === "totem" && prop.hp > 0 && prop.side === unit.side && distanceTo(unit, prop.cell) <= 3) pct += 20;
  }
  // War banners: +10% ATK and MAG for the side holding each one.
  if (stat === "atk" || stat === "mag") for (const point of battle.points ?? []) if (point.kind === "banner" && point.owner === unit.side) pct += 10;
  return pct;
}

export function eff(state: RestiaState, unit: BattleUnit, stat: StatKey): number {
  const passives = pv(unit);
  let pct = unit.mods.filter((mod) => mod.stat === stat).reduce((sum, mod) => sum + mod.pct, 0);
  if (stat !== "maxHp" && stat !== "maxMp") {
    pct += passives.stats[stat] ?? 0;
    for (const low of passives.lowHp) if (unit.hp > 0 && unit.hp < unit.stats.maxHp * low.below) pct += low.stats[stat] ?? 0;
    if (state.battle) pct += auraPct(state.battle, unit, stat);
  }
  let value = unit.stats[stat] * (1 + clamp(pct, -60, 150) / 100);
  if (unit.side === "ally" && (stat === "atk" || stat === "def") && hasBuff(state, "valor")) value *= 1.15;
  if (stat === "spd" && hasStatus(unit, "slow")) value *= 0.7;
  if (stat === "spd" && hasStatus(unit, "haste")) value *= 1.25;
  if ((stat === "def" || stat === "res") && unit.defending) value *= 1.5;
  return Math.max(0, value);
}

export function moveRange(unit: BattleUnit): number {
  if (hasStatus(unit, "root")) return 0;
  return Math.max(1, unit.move + pv(unit).move - (hasStatus(unit, "slow") ? 1 : 0) + (hasStatus(unit, "haste") ? 1 : 0));
}

export function living(battle: BattleState): BattleUnit[] {
  return battle.units.filter((unit) => unit.hp > 0 && !unit.gone);
}

export function unitAt(battle: BattleState, cell: number): BattleUnit | undefined {
  return battle.units.find((unit) => occupies(unit, cell) && unit.hp > 0 && !unit.gone);
}

function findUnit(battle: BattleState, uid: string): BattleUnit {
  const unit = battle.units.find((entry) => entry.uid === uid);
  if (!unit) fail("No such unit.");
  return unit;
}

export function activeUnit(battle: BattleState): BattleUnit | null {
  return battle.active ? battle.units.find((unit) => unit.uid === battle.active) ?? null : null;
}

export function skillAp(skill: SkillDef): number {
  return skill.ap ?? 2;
}

export function skillMp(unit: BattleUnit, skill: SkillDef): number {
  return Math.max(0, Math.round(skill.mp * (1 - pv(unit).mpSave / 100)));
}

/**
 * Hexes the unit's head can move to with `budget` movement points (default: a
 * full turn's), each with its path. A two-hex unit drags its tail along: the
 * tail hex must be enterable and level with the head at every step.
 */
export function reachable(battle: BattleState, unit: BattleUnit, budget = moveRange(unit)): Map<number, number[]> {
  if (moveRange(unit) === 0 || budget <= 0) return new Map();
  const sure = pv(unit).sureFooted;
  return reachWeighted(unit.cell, budget, (cell, from) => footprintStep(battle, unit, from, cell, sure), (cell) => canStandAt(battle, unit, cell));
}

/**
 * Movement points for the unit's head to step from `from` onto `cell`
 * (Infinity: it can't). Foes in any hex of the footprint block it unless it
 * flies (with `blockAllies`, friends block too: a charge can't run through
 * anyone); a two-hex body's tail must stay on the board and, for walkers, be
 * enterable and level with the head. Shared by walking and dashes.
 */
function footprintStep(battle: BattleState, unit: BattleUnit, from: number, cell: number, sure: boolean, blockAllies = false): number {
  for (const covered of cellsAt(unit, cell)) {
    const other = unitAt(battle, covered);
    if (other && other !== unit && !unit.flying && (blockAllies || other.side !== unit.side)) return Infinity;
  }
  if (unit.wide) {
    const tail = tailAt(unit, cell);
    if (tail === null) return Infinity;
    if (!unit.flying) {
      const tile = battle.tiles[tail];
      if (tile === "void" || tile === "water" || propAt(battle, tail) || heightOf(battle, tail) !== heightOf(battle, cell)) return Infinity;
    }
  }
  return stepCost(battle, unit, from, cell, sure);
}

/** Movement points a path costs from where the unit stands. */
export function pathCost(battle: BattleState, unit: BattleUnit, path: number[]): number {
  const sure = pv(unit).sureFooted;
  let from = unit.cell;
  let total = 0;
  for (const cell of path) {
    total += stepCost(battle, unit, from, cell, sure);
    from = cell;
  }
  return total;
}

/** Melee can't reach across a cliff (two levels between the hexes); flyers and shooters can. */
function cliffBlocksMelee(battle: BattleState, unit: BattleUnit, from: number, to: number): boolean {
  return unit.range <= 1 && !unit.flying && hexDistance(from, to) === 1 && cliffBetween(battle, from, to);
}

const CLIFF = "Too high to reach: a cliff.";

/** Basic-attack reach: ranged units gain from high ground (+1 per level) and passives, lose to blizzards and storms. */
export function attackRange(battle: BattleState, unit: BattleUnit): number {
  if (unit.range <= 1) return 1;
  return Math.max(2, unit.range + pv(unit).range + heightOf(battle, unit.cell) + weatherRange(battle.weather));
}

/** A foe this unit must attack (taunt), if any. */
export function tauntedBy(battle: BattleState, unit: BattleUnit): BattleUnit | null {
  const status = unit.statuses.find((entry) => entry.id === "taunt");
  if (!status?.source) return null;
  const source = battle.units.find((entry) => entry.uid === status.source);
  return source && source.hp > 0 && !source.gone ? source : null;
}

/** Why `unit` can't basic-attack `target` from `from` (null = it can). */
export function attackBlock(battle: BattleState, unit: BattleUnit, target: { cell: number } | BattleUnit, from = unit.cell): string | null {
  // Two-hex units reach from, and can be hit on, either of their hexes.
  const [a, b] = nearestPair(cellsAt(unit, from), "side" in target ? cellsOf(target) : [target.cell]);
  const distance = hexDistance(a, b);
  const saved = unit.cell;
  unit.cell = from;
  const range = attackRange(battle, unit);
  unit.cell = saved;
  if (distance > range) return "Out of range.";
  if (distance > 1 && !hasLineOfSight(battle, a, b)) return "No line of sight.";
  if (cliffBlocksMelee(battle, unit, a, b)) return CLIFF;
  return null;
}

function elementMult(battle: BattleState, target: BattleUnit, element: Element): number {
  return (target.resist[element] ?? 1) * weatherMult(battle.weather, element);
}

/** Target faces away from the attacker (units face left or right). */
function fromBehind(attacker: BattleUnit, target: BattleUnit): boolean {
  const a = colRow(attacker.cell).col;
  const t = colRow(target.cell).col;
  return (target.facing === "right" && a < t) || (target.facing === "left" && a > t);
}

function hitChance(state: RestiaState, battle: BattleState, attacker: BattleUnit, target: BattleUnit, physical: boolean): number {
  if (!physical) return 1;
  let p = 0.95 + (eff(state, attacker, "luk") - eff(state, target, "luk")) * 0.005;
  if (hasStatus(attacker, "blind")) p -= 0.35;
  p -= 0.05 * Math.max(0, heightOf(battle, target.cell) - heightOf(battle, attacker.cell));
  return clamp(p - pv(target).evasion, 0.3, 0.99);
}

function rawDamage(state: RestiaState, attacker: BattleUnit, target: BattleUnit, power: number, physical: boolean): number {
  const a = physical ? eff(state, attacker, "atk") : eff(state, attacker, "mag");
  const d = physical ? eff(state, target, "def") : eff(state, target, "res");
  return a <= 0 ? 1 : (power * a * a) / (a + d);
}

type StrikeOpts = {
  power: number;
  element: Element;
  physical: boolean;
  pointBlank?: boolean;
  ranged?: boolean;
  crit?: number;
  /** Arcing: cover doesn't help the target. */
  indirect?: boolean;
  /** Extra power per level `fromHeight` (where the attacker began) is above the target. */
  heightPower?: number;
  fromHeight?: number;
};

/** Positional and passive multipliers shared by real hits and forecasts. */
function situational(state: RestiaState, battle: BattleState, attacker: BattleUnit, target: BattleUnit, opts: StrikeOpts): number {
  const pa = pv(attacker);
  let mult = 1;
  // Striking down: +15% one level, +25% two; striking up: -10% per level.
  const dh = heightOf(battle, attacker.cell) - heightOf(battle, target.cell);
  if (dh > 0) mult *= 1.05 + 0.1 * dh + pa.highGround / 100;
  else if (dh < 0) mult *= 1 + 0.1 * dh;
  if (opts.heightPower) mult *= 1 + opts.heightPower * Math.max(0, (opts.fromHeight ?? heightOf(battle, attacker.cell)) - heightOf(battle, target.cell));
  if (opts.ranged && !opts.indirect && cellsOf(target).some((cell) => battle.tiles[cell] === "cover")) mult *= 0.7;
  if (hasStatus(target, "mark")) mult *= 1.25;
  if (target.down) mult *= 1.25;
  if (opts.pointBlank) mult *= 0.5;
  if (fromBehind(attacker, target)) mult *= 1.1 + pa.backstab / 100;
  if (pa.pack > 0) {
    const flankers = battle.units.filter((unit) => unit !== attacker && unit.side === attacker.side && unit.hp > 0 && !unit.gone && unitDistance(unit, target) === 1).length;
    mult *= 1 + (pa.pack * flankers) / 100;
  }
  mult *= 1 + (pa.elementBoost[opts.element] ?? 0) / 100;
  return mult;
}

export function expectedDamage(
  state: RestiaState,
  attacker: BattleUnit,
  target: BattleUnit,
  power: number,
  element: Element,
  physical: boolean,
  pointBlank: boolean,
  ranged = false
): number {
  const battle = state.battle;
  if (!battle) return 0;
  const opts = { power, element, physical, pointBlank, ranged };
  return (
    rawDamage(state, attacker, target, power, physical) *
    elementMult(battle, target, element) *
    situational(state, battle, attacker, target, opts) *
    hitChance(state, battle, attacker, target, physical)
  );
}

// ---------------------------------------------------------------------------
// Damage, death, statuses
// ---------------------------------------------------------------------------

function progressChallenge(battle: BattleState, id: BattleChallenge["id"], n = 1): void {
  if (battle.challenge?.id === id) battle.challenge.progress += n;
}

function kill(state: RestiaState, battle: BattleState, unit: BattleUnit, anims: BattleAnim[], ctx: Ctx, cause?: "explosion"): void {
  unit.hp = 0;
  unit.statuses = [];
  unit.mods = [];
  unit.down = false;
  unit.defending = false;
  unit.shield = 0;
  anims.push({ kind: "death", uid: unit.uid, ...deathSound(unit) });
  if (unit.side === "ally" && battle.challenge?.id === "untouched") battle.challenge.failed = true;
  if (unit.side === "enemy" && cause === "explosion") progressChallenge(battle, "boom");
  const burst = pv(unit).deathBurst;
  if (burst) {
    battle.log.push(`${unit.name} bursts!`);
    explode(state, battle, unit.cell, burst.power, burst.element, burst.radius, burst.status, anims, ctx);
  }
}

function deathSound(unit: BattleUnit): { sound?: string } {
  const sound = unit.kind === "monster" || unit.kind === "pet" ? unitSound(unit.sprite, "death") : undefined;
  return sound ? { sound } : {};
}

/**
 * Applies damage to a unit: shield first, then HP; undying passives keep it at 1 HP once.
 * Returns the HP actually lost.
 */
function dealDamage(
  state: RestiaState,
  battle: BattleState,
  target: BattleUnit,
  amount: number,
  anims: BattleAnim[],
  ctx: Ctx,
  flags: { crit?: boolean; weak?: boolean; resist?: boolean; cause?: "explosion" } = {}
): number {
  if (target.hp <= 0 || target.gone) return 0;
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  let loss = amount - absorbed;
  const passives = pv(target);
  if (loss >= target.hp && passives.undying && !target.spent) {
    loss = target.hp - 1;
    target.spent = true;
    anims.push({ kind: "status", uid: target.uid, text: "Refuses to fall!" });
  }
  target.hp = Math.max(0, target.hp - loss);
  anims.push({ kind: "hit", uid: target.uid, amount, crit: !!flags.crit, weak: !!flags.weak, resist: !!flags.resist, miss: false, heal: false, ...(absorbed ? { shielded: absorbed } : {}) });
  if (target.hp <= 0) kill(state, battle, target, anims, ctx, flags.cause);
  return loss;
}

function heal(target: BattleUnit, amount: number, anims: BattleAnim[]): void {
  const before = target.hp;
  target.hp = Math.min(target.stats.maxHp, target.hp + Math.max(0, Math.round(amount)));
  anims.push({ kind: "hit", uid: target.uid, amount: target.hp - before, crit: false, weak: false, resist: false, miss: false, heal: true });
}

function addStatus(battle: BattleState, target: BattleUnit, id: StatusId, turns: number, anims: BattleAnim[], source?: BattleUnit): boolean {
  if (target.hp <= 0 || target.gone) return false;
  if (pv(target).immune.includes(id)) {
    anims.push({ kind: "status", uid: target.uid, text: `Immune (${STATUS_NAMES[id]})` });
    return false;
  }
  // Bosses shrug off hard control after one turn of it.
  const hard = id === "sleep" || id === "stun" || id === "freeze";
  const length = target.boss && hard ? 1 : turns;
  const existing = target.statuses.find((status) => status.id === id);
  if (existing) {
    existing.turns = Math.max(existing.turns, length);
    if (source && id === "taunt") existing.source = source.uid;
  } else target.statuses.push({ id, turns: length, ...(source && id === "taunt" ? { source: source.uid } : {}) });
  // A status landing on the unit whose turn it is must survive that turn's countdown.
  if (target.uid === battle.active && TICKING.includes(id)) {
    const inst = target.statuses.find((status) => status.id === id)!;
    inst.turns += 1;
  }
  anims.push({ kind: "status", uid: target.uid, text: STATUS_NAMES[id] });
  return true;
}

/** Buffs/debuffs; one landing on the unit whose turn it is skips this turn's countdown. */
function addMods(battle: BattleState, target: BattleUnit, mods: SkillDef["mods"]): void {
  for (const mod of mods ?? []) target.mods.push({ ...mod, skip: target.uid === battle.active });
}

function strike(state: RestiaState, battle: BattleState, attacker: BattleUnit, target: BattleUnit, opts: StrikeOpts, anims: BattleAnim[], ctx: Ctx): number {
  const pa = pv(attacker);
  if (!chance(state, hitChance(state, battle, attacker, target, opts.physical))) {
    anims.push({ kind: "hit", uid: target.uid, amount: 0, crit: false, weak: false, resist: false, miss: true, heal: false });
    return 0;
  }
  const mult = elementMult(battle, target, opts.element);
  if ((target.resist[opts.element] ?? 1) === 0) {
    anims.push({ kind: "hit", uid: target.uid, amount: 0, crit: false, weak: false, resist: true, miss: false, heal: false });
    return 0;
  }
  const behind = fromBehind(attacker, target);
  const critChance = clamp(0.05 + eff(state, attacker, "luk") * 0.004 + pa.crit + (opts.crit ?? 0) + (behind ? 0.1 : 0), 0, 0.6);
  const crit = chance(state, critChance);
  const variance = 0.9 + random(state) * 0.2;
  const damage = Math.max(
    1,
    Math.round(rawDamage(state, attacker, target, opts.power, opts.physical) * variance * mult * (crit ? 1.5 + pa.critDamage : 1) * situational(state, battle, attacker, target, opts))
  );
  const weak = (target.resist[opts.element] ?? 1) > 1;
  if (attacker.side === "ally") {
    if (weak) progressChallenge(battle, "weakness");
    if (heightOf(battle, attacker.cell) > heightOf(battle, target.cell)) progressChallenge(battle, "highGround");
  }
  const lost = dealDamage(state, battle, target, damage, anims, ctx, { crit, weak, resist: mult < 1 });
  if (target.hp <= 0 && crit && attacker.side === "ally") progressChallenge(battle, "crit");
  target.statuses = target.statuses.filter((status) => status.id !== "sleep" && !(status.id === "freeze" && opts.element === "fire"));
  if (target.hp > 0) {
    if (weak && !target.boss && !target.down) {
      target.down = true;
      anims.push({ kind: "status", uid: target.uid, text: "DOWN!" });
    }
    for (const onHit of pa.onHit) if (chance(state, onHit.chance)) addStatus(battle, target, onHit.status, onHit.turns, anims);
  }
  if (lost > 0 && pa.lifesteal > 0 && attacker.hp > 0) heal(attacker, lost * pa.lifesteal, anims);
  const thorns = pv(target).thorns;
  if (!opts.ranged && thorns > 0 && attacker.hp > 0 && damage > 0) {
    dealDamage(state, battle, attacker, Math.max(1, Math.round(damage * thorns)), anims, ctx);
  }
  // Ground reacts to elements: fire melts ice and lights barrels, ice puts out fire.
  groundReaction(battle, target.cell, opts.element);
  return damage;
}

function groundReaction(battle: BattleState, cell: number, element: Element): void {
  const tile = battle.tiles[cell];
  if (element === "fire" && tile === "ice") {
    delete battle.tiles[cell];
    delete battle.tileTimers[cell];
  } else if (element === "ice" && tile === "fire") {
    delete battle.tiles[cell];
    delete battle.tileTimers[cell];
  }
}

/** Blast around a hex: hurts everyone (and props) within `radius`. */
function explode(state: RestiaState, battle: BattleState, cell: number, power: number, element: Element, radius: number, status: StatusId | undefined, anims: BattleAnim[], ctx: Ctx): void {
  anims.push({ kind: "fx", cell, fx: element === "fire" ? "explosion" : element === "ice" ? "ice" : element === "dark" ? "dark" : "explosion", sound: "spells/fireball-hit" });
  const level = Math.max(1, ...battle.units.map((unit) => unit.level));
  for (const unit of living(battle)) {
    if (distanceTo(unit, cell) > radius) continue;
    const mult = elementMult(battle, unit, element);
    if (mult === 0) continue;
    const amount = Math.max(1, Math.round((18 + 3 * level) * power * mult * (0.9 + random(state) * 0.2)));
    dealDamage(state, battle, unit, amount, anims, ctx, { weak: mult > 1, resist: mult < 1, cause: "explosion" });
    if (unit.hp > 0 && status && chance(state, 0.4)) addStatus(battle, unit, status, status === "burn" ? 3 : 1, anims);
  }
  for (const prop of [...battle.props]) {
    if (prop.cell === cell || prop.hp <= 0 || prop.kind === "rock" || hexDistance(prop.cell, cell) > radius) continue;
    damageProp(state, battle, prop, Math.round((18 + 3 * level) * power), element, anims, ctx);
  }
}

/** Damage a destructible prop; barrels explode when they break. */
export function damageProp(state: RestiaState, battle: BattleState, prop: BattleProp, amount: number, element: Element, anims: BattleAnim[], ctx: Ctx): void {
  if (prop.kind === "rock" || prop.hp <= 0) return;
  const dealt = prop.kind === "barrel" ? prop.hp : Math.max(1, Math.round(amount));
  prop.hp = Math.max(0, prop.hp - dealt);
  anims.push({ kind: "hit", uid: prop.uid, amount: dealt, crit: false, weak: false, resist: false, miss: false, heal: false });
  if (prop.hp > 0) return;
  anims.push({ kind: "prop", uid: prop.uid, destroyed: true });
  battle.log.push(`${PROP_NAMES[prop.kind]} destroyed.`);
  if (prop.kind === "barrel") explode(state, battle, prop.cell, 1.2, "fire", 1, "burn", anims, ctx);
  void element;
}

// ---------------------------------------------------------------------------
// Terrain on the move
// ---------------------------------------------------------------------------

/** Walks a path hex by hex: hazards, pickups and bleeding apply; stops if the unit falls. */
function walk(state: RestiaState, battle: BattleState, unit: BattleUnit, path: number[], anims: BattleAnim[], ctx: Ctx, kind: "move" | "knock" = "move"): void {
  if (!path.length) return;
  // The walk is animated in segments, split wherever something happens on the way.
  let from = unit.cell;
  const segment: number[] = [];
  const flush = () => {
    if (!segment.length) return;
    anims.push(kind === "move" ? { kind: "move", uid: unit.uid, path: [from, ...segment] } : { kind: "knock", uid: unit.uid, path: [from, ...segment] });
    from = segment[segment.length - 1]!;
    segment.length = 0;
  };
  for (const cell of path) {
    const before = cellsOf(unit);
    segment.push(cell);
    unit.cell = cell;
    for (const covered of cellsOf(unit)) {
      if (before.includes(covered)) continue;
      enterTile(state, battle, unit, covered, anims, ctx, flush);
      if (unit.hp <= 0) return;
    }
  }
  flush();
  if (kind === "move" && hasStatus(unit, "bleed") && unit.hp > 0) {
    anims.push({ kind: "status", uid: unit.uid, text: "Bleeding" });
    dealDamage(state, battle, unit, Math.max(1, Math.round(unit.stats.maxHp * 0.06)), anims, ctx);
  }
}

/**
 * Stepping onto a hex: crystals are picked up; thorns and fire hurt grounded units.
 * `before` runs first whenever something happens (flushes the walk animation).
 */
function enterTile(state: RestiaState, battle: BattleState, unit: BattleUnit, cell: number, anims: BattleAnim[], ctx: Ctx, before: () => void): void {
  const tile = battle.tiles[cell];
  const cache = battle.points?.find((point) => point.kind === "cache" && !point.used && point.cell === cell);
  if (cache) {
    before();
    openCache(battle, unit, cache, anims);
  }
  if (tile === "crystal") {
    before();
    delete battle.tiles[cell];
    unit.mp = Math.min(unit.stats.maxMp, unit.mp + Math.round(unit.stats.maxMp * 0.3));
    unit.apCarry += 1;
    anims.push({ kind: "status", uid: unit.uid, text: "+MP, +1 AP next turn" });
  }
  if (unit.flying || pv(unit).sureFooted) return;
  if (tile === "thorns") {
    before();
    dealDamage(state, battle, unit, Math.max(1, Math.round(unit.stats.maxHp * 0.06)), anims, ctx);
  } else if (tile === "fire") {
    before();
    dealDamage(state, battle, unit, Math.max(1, Math.round(unit.stats.maxHp * 0.05)), anims, ctx);
    if (unit.hp > 0) addStatus(battle, unit, "burn", 2, anims);
  }
}

/** A supply cache: the first ally to enter claims its loot (paid with the victory rewards); an enemy smashes it. */
function openCache(battle: BattleState, unit: BattleUnit, point: BattlePoint, anims: BattleAnim[]): void {
  point.used = true;
  point.owner = unit.side;
  if (unit.side !== "ally") {
    anims.push({ kind: "status", uid: unit.uid, text: `Smashed the ${POINT_NAMES.cache}!` });
    battle.log.push(`${unit.name} smashed the ${POINT_NAMES.cache}. Its loot is lost.`);
    return;
  }
  const reward = point.reward ?? { gold: 0 };
  const loot = (battle.loot ??= { gold: 0, items: {} });
  loot.gold += reward.gold;
  if (reward.item) loot.items[reward.item] = (loot.items[reward.item] ?? 0) + 1;
  const found = [reward.gold > 0 ? `${reward.gold} gold` : "", reward.item ? ITEMS[reward.item]?.name ?? reward.item : ""].filter(Boolean).join(" + ") || "nothing";
  anims.push({ kind: "status", uid: unit.uid, text: `Found ${found}!` });
  battle.log.push(`${unit.name} opened the ${POINT_NAMES.cache}: ${found} (yours if you win).`);
}

/** Ending a turn with any hex of the footprint on a shrine or banner captures it for the unit's side. */
function capturePoints(battle: BattleState, unit: BattleUnit, anims: BattleAnim[]): void {
  if (unit.hp <= 0 || unit.gone || !battle.points?.length) return;
  const cells = cellsOf(unit);
  for (const point of battle.points) {
    if (point.kind === "cache" || point.owner === unit.side || !cells.includes(point.cell)) continue;
    point.owner = unit.side;
    anims.push({ kind: "status", uid: unit.uid, text: `Captured the ${POINT_NAMES[point.kind]}!` });
    battle.log.push(`${unit.name} captured the ${POINT_NAMES[point.kind]}.`);
  }
  const held = battle.points.filter((point) => point.kind !== "cache");
  if (battle.challenge?.id === "points" && held.length && held.every((point) => point.owner === "ally")) battle.challenge.progress = Math.max(battle.challenge.progress, 1);
}

/**
 * A leap through the air (or a blink) onto `cell` (skills): lands whatever the
 * height or what is in between, then steps onto every hex of the footprint it
 * didn't already cover (pickups, thorns, fire).
 */
function land(state: RestiaState, battle: BattleState, unit: BattleUnit, cell: number, sprite: SkillSprite, anims: BattleAnim[], ctx: Ctx, blink = false): void {
  anims.push(blink ? { kind: "blink", uid: unit.uid, from: unit.cell, to: cell } : { kind: "leap", uid: unit.uid, from: unit.cell, to: cell, sprite });
  const before = cellsOf(unit);
  face(unit, cell);
  unit.cell = cell;
  for (const covered of cellsOf(unit)) {
    if (before.includes(covered)) continue;
    enterTile(state, battle, unit, covered, anims, ctx, () => {});
    if (unit.hp <= 0) return;
  }
}

/** Dropping `levels` of ground (knocked, dragged or the ground sank) hurts 10% max HP per level; flyers glide. */
function fall(state: RestiaState, battle: BattleState, unit: BattleUnit, levels: number, anims: BattleAnim[], ctx: Ctx): void {
  if (levels <= 0 || unit.flying || unit.boss || unit.hp <= 0 || unit.gone) return;
  anims.push({ kind: "status", uid: unit.uid, text: levels > 1 ? "Long fall!" : "Falls!" });
  dealDamage(state, battle, unit, Math.max(1, Math.round(unit.stats.maxHp * 0.1 * levels)), anims, ctx);
}

/** Moves a unit along a forced path (knockback, pulls), then it takes the fall for every level it dropped. */
function shove(state: RestiaState, battle: BattleState, unit: BattleUnit, path: number[], anims: BattleAnim[], ctx: Ctx): void {
  if (!path.length) return;
  let drop = 0;
  let previous = unit.cell;
  for (const cell of path) {
    drop += Math.max(0, heightOf(battle, previous) - heightOf(battle, cell));
    previous = cell;
  }
  walk(state, battle, unit, path, anims, ctx, "knock");
  if (unit.cell === path[path.length - 1]) fall(state, battle, unit, drop, anims, ctx);
}

/**
 * What stops a unit being pushed or dragged from `at` to `next` (null = nothing):
 * a unit or prop in any hex of its footprint, water or the board's edge, or
 * rising ground (a two-hex unit also needs both hexes level).
 */
function pushBlock(battle: BattleState, unit: BattleUnit, at: number, next: number): { blocker?: BattleUnit; prop?: BattleProp } | null {
  const cells = cellsAt(unit, next);
  if (unit.wide && cells.length < 2) return {};
  for (const cell of cells) {
    const blocker = unitAt(battle, cell);
    if (blocker && blocker !== unit) return { blocker };
    const prop = propAt(battle, cell);
    if (prop) return { prop };
    const tile = battle.tiles[cell];
    if (tile === "void" || tile === "water" || isCrag(battle, cell)) return {};
  }
  if (!unit.flying) {
    const ground = heightOf(battle, at);
    if (cells.some((cell) => heightOf(battle, cell) > ground)) return {};
  }
  // A two-hex body only ever stands level, flyers included (canStandAt).
  if (unit.wide && heightOf(battle, cells[0]!) !== heightOf(battle, cells[1]!)) return {};
  return null;
}

/**
 * Drags a unit toward `to` (hook lines). It stops next to `to`, at anything in
 * the way, or at ground it can't be hauled onto (a cliff, or uneven for a two-hex body).
 */
function pullToward(state: RestiaState, battle: BattleState, to: number, target: BattleUnit, steps: number, anims: BattleAnim[], ctx: Ctx): void {
  if (target.hp <= 0 || target.boss || target.gone) return;
  const path: number[] = [];
  let at = target.cell;
  for (let i = 0; i < steps; i++) {
    const next = hexLine(at, to)[1];
    if (next === undefined || next === to || cellsAt(target, next).includes(to)) break;
    if (cellsAt(target, next).some((cell) => { const other = unitAt(battle, cell); return (other && other !== target) || !!propAt(battle, cell) || battle.tiles[cell] === "void" || battle.tiles[cell] === "water" || isCrag(battle, cell); })) break;
    if (target.wide && cellsAt(target, next).length < 2) break;
    if (!target.flying && heightOf(battle, next) - heightOf(battle, at) >= 2) break;
    // A two-hex body only ever stands level, flyers included (canStandAt).
    if (target.wide && heightOf(battle, next) !== heightOf(battle, tailAt(target, next)!)) break;
    path.push(next);
    at = next;
  }
  if (path.length) anims.push({ kind: "status", uid: target.uid, text: "Hooked!" });
  shove(state, battle, target, path, anims, ctx);
}

/** Raises or lowers the ground of these hexes; whoever stands there rides along (and falls when it sinks). */
function shapeGround(state: RestiaState, battle: BattleState, cells: number[], delta: number, anims: BattleAnim[], ctx: Ctx): void {
  const changes: { cell: number; from: number; to: number }[] = [];
  // A two-hex creature stays level: its other hex moves with it.
  const affected = new Set(cells);
  for (const unit of living(battle)) if (unit.wide && cellsOf(unit).some((cell) => affected.has(cell))) for (const cell of cellsOf(unit)) affected.add(cell);
  let plan = shapePlan(battle, [...affected], delta);
  // ...and only if both of its hexes can move: otherwise neither does.
  for (let guard = 0; guard <= battle.units.length; guard++) {
    const split = living(battle).filter((unit) => unit.wide && cellsOf(unit).some((cell) => plan.has(cell)) && !cellsOf(unit).every((cell) => plan.has(cell)));
    if (!split.length) break;
    for (const unit of split) for (const cell of cellsOf(unit)) affected.delete(cell);
    plan = shapePlan(battle, [...affected], delta);
  }
  for (const [cell, to] of plan) {
    const from = setHeight(battle, cell, to);
    changes.push({ cell, from, to });
  }
  if (!changes.length) return;
  anims.push({ kind: "terrain", changes });
  for (const unit of living(battle)) {
    const change = changes.find((entry) => entry.cell === unit.cell);
    if (change && change.to < change.from) fall(state, battle, unit, change.from - change.to, anims, ctx);
  }
}

/** The ground of this hex can still move that way (water and chasms have none). */
function canShape(battle: BattleState, cell: number, delta: number): boolean {
  const tile = battle.tiles[cell];
  if (tile === "void" || tile === "water" || delta === 0 || isCrag(battle, cell)) return false;
  const height = heightOf(battle, cell);
  return delta > 0 ? height < MAX_HEIGHT : height > 0;
}

/**
 * New heights for shaping these hexes, keeping every reshaped hex walkable: it
 * must keep a neighbour within one level (a ramp), so no one can raise an
 * unreachable pillar or sink a pit nobody can climb out of. Hexes that would
 * break that are left as they are (checked together, so a whole mound can rise).
 */
function shapePlan(battle: BattleState, cells: number[], delta: number): Map<number, number> {
  const plan = new Map<number, number>();
  for (const cell of cells) if (canShape(battle, cell, delta)) plan.set(cell, clamp(heightOf(battle, cell) + delta, 0, MAX_HEIGHT));
  const heightAfter = (cell: number) => plan.get(cell) ?? heightOf(battle, cell);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [cell, to] of plan) {
      const ramp = neighbors(cell).some((next) => {
        const tile = battle.tiles[next];
        // A crag is no ramp: nobody stands on it.
        return tile !== "void" && tile !== "water" && !isCrag(battle, next) && !propAt(battle, next) && Math.abs(heightAfter(next) - to) <= 1;
      });
      if (ramp) continue;
      plan.delete(cell);
      changed = true;
    }
  }
  return plan;
}

function doMove(state: RestiaState, battle: BattleState, unit: BattleUnit, path: number[], anims: BattleAnim[], ctx: Ctx): void {
  if (!path.length) return;
  const previous = path.length > 1 ? path[path.length - 2]! : unit.cell;
  walk(state, battle, unit, path, anims, ctx);
  const from = previous % BOARD_COLS;
  const to = unit.cell % BOARD_COLS;
  if (to !== from) unit.facing = to > from ? "right" : "left";
}

/**
 * Shoves a unit away from `from`; collisions hurt both sides (and break props).
 * Rising ground stops it like a wall (flyers excepted); dropping off a ledge hurts.
 */
function knockBack(state: RestiaState, battle: BattleState, from: number, target: BattleUnit, steps: number, anims: BattleAnim[], ctx: Ctx): void {
  if (target.hp <= 0 || target.boss) return;
  const path: number[] = [];
  let at = target.cell;
  let origin = from;
  for (let i = 0; i < steps; i++) {
    const next = stepAway(origin, at);
    const stop = next === null ? {} : pushBlock(battle, target, at, next);
    const blocker = stop?.blocker;
    const prop = stop?.prop;
    if (stop || next === null) {
      anims.push({ kind: "status", uid: target.uid, text: "Slammed!" });
      shove(state, battle, target, path, anims, ctx);
      dealDamage(state, battle, target, Math.max(1, Math.round(target.stats.maxHp * 0.08)), anims, ctx);
      if (blocker) dealDamage(state, battle, blocker, Math.max(1, Math.round(blocker.stats.maxHp * 0.05)), anims, ctx);
      if (prop) damageProp(state, battle, prop, Math.round(target.stats.maxHp * 0.1), "phys", anims, ctx);
      return;
    }
    path.push(next);
    origin = at;
    at = next;
  }
  shove(state, battle, target, path, anims, ctx);
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function newRound(state: RestiaState, battle: BattleState, anims: BattleAnim[], ctx: Ctx): void {
  battle.round += 1;
  battle.waited = [];
  for (const unit of battle.units) unit.retaliated = false;
  // Temporary ground (fire, ice from skills) fades.
  for (const [cell, left] of Object.entries(battle.tileTimers)) {
    if (left <= 1) {
      delete battle.tiles[Number(cell)];
      delete battle.tileTimers[Number(cell)];
    } else battle.tileTimers[Number(cell)] = left - 1;
  }
  // Last round's warnings land now; the next ones are marked a round ahead.
  if (battle.warnings.length) {
    const fx = battle.hazard?.kind === "icicles" ? "ice" : "earth";
    for (const cell of battle.warnings) {
      anims.push({ kind: "fx", cell, fx, sound: "spells/earthquake" });
      const unit = unitAt(battle, cell);
      if (unit) dealDamage(state, battle, unit, Math.max(1, Math.round(unit.stats.maxHp * 0.2)), anims, ctx);
      const prop = propAt(battle, cell);
      if (prop) damageProp(state, battle, prop, 20, "earth", anims, ctx);
    }
    battle.warnings = [];
  }
  if (battle.hazard && battle.round >= battle.hazard.from - 1) {
    const targets: number[] = [];
    const occupied = living(battle).flatMap((unit) => cellsOf(unit));
    for (let i = 0; i < 3; i++) {
      // Aim near units, so the hazard is a real reason to move.
      const near = occupied.length ? occupied[randInt(state, 0, occupied.length - 1)]! : null;
      const cell = randomOpenCell(state, battle, (c) => !targets.includes(c) && (near === null || hexDistance(c, near) <= 1));
      if (cell !== null) targets.push(cell);
    }
    battle.warnings = targets;
    if (targets.length) anims.push({ kind: "banner", text: battle.hazard.kind === "icicles" ? "Icicles creak overhead! (marked hexes)" : "The ceiling rumbles! (marked hexes)" });
  }
  if (battle.reinforce && battle.round === battle.reinforce.round) {
    let index = battle.units.length;
    for (const enemy of battle.reinforce.enemies) {
      const unit = monsterUnit(enemy.species, enemy.level, `r${index++}`, "enemy", -1);
      const cell = randomOpenCell(state, battle, (c) => colRow(c).col >= battle.cols - 3 && canStandAt(battle, unit, c));
      if (cell === null) continue;
      unit.cell = cell;
      battle.units.push(unit);
      anims.push({ kind: "status", uid: unit.uid, text: "Joins the fight!" });
    }
    battle.log.push("Reinforcements arrive!");
    anims.push({ kind: "banner", text: "Enemy reinforcements!" });
    battle.reinforce = null;
  }
  const order = living(battle).sort((a, b) => {
    const diff = eff(state, b, "spd") - eff(state, a, "spd");
    if (Math.abs(diff) > 0.001) return diff;
    if (a.side !== b.side) return a.side === "ally" ? -1 : 1;
    return a.uid.localeCompare(b.uid);
  });
  if (battle.round === 1 && battle.initiative !== "normal") {
    const first = battle.initiative === "preemptive" ? "ally" : "enemy";
    order.sort((a, b) => (a.side === b.side ? 0 : a.side === first ? -1 : 1));
  }
  battle.queue = order.map((unit) => unit.uid);
}

function tickEndOfTurn(unit: BattleUnit): void {
  unit.mods = unit.mods.map((mod) => (mod.skip ? { ...mod, skip: false } : { ...mod, turns: mod.turns - 1 })).filter((mod) => mod.turns > 0);
  unit.statuses = unit.statuses.map((status) => (TICKING.includes(status.id) ? { ...status, turns: status.turns - 1 } : status)).filter((status) => status.turns > 0);
}

/** Start-of-turn upkeep: damage over time, regeneration, ground effects. */
function upkeep(state: RestiaState, battle: BattleState, unit: BattleUnit, anims: BattleAnim[], ctx: Ctx): void {
  const passives = pv(unit);
  for (const status of unit.statuses) {
    if (status.id !== "poison" && status.id !== "burn") continue;
    const damage = Math.max(1, Math.round(unit.stats.maxHp * (status.id === "poison" ? 0.08 : 0.06)));
    dealDamage(state, battle, unit, damage, anims, ctx);
    if (unit.hp <= 0) return;
  }
  const tile = battle.tiles[unit.cell];
  const grounded = !unit.flying && !passives.sureFooted;
  if (tile === "fire" && grounded) addStatus(battle, unit, "burn", 2, anims);
  // Healing shrines: 5% max HP for each one the unit's side holds (once per round, like regeneration).
  const shrines = (battle.points ?? []).filter((point) => point.kind === "shrine" && point.owner === unit.side).length;
  const regen = passives.regen + (hasStatus(unit, "regen") ? 0.08 : 0) + (tile === "spring" && !unit.flying ? 0.1 : 0) + 0.05 * shrines;
  if (regen > 0 && unit.hp < unit.stats.maxHp) heal(unit, unit.stats.maxHp * regen, anims);
  if (passives.mpRegen > 0) unit.mp = Math.min(unit.stats.maxMp, unit.mp + Math.max(1, Math.round(unit.stats.maxMp * passives.mpRegen)));
}

function beginTurn(state: RestiaState, battle: BattleState, anims: BattleAnim[], ctx: Ctx): void {
  let guard = 0;
  while (battle.phase === "turn") {
    if (guard++ > 200) throw new Error("Battle turn loop");
    if (!battle.queue.length) {
      newRound(state, battle, anims, ctx);
      if (checkEnd(state, battle, ctx)) return;
    }
    const uid = battle.queue.shift();
    const unit = uid ? battle.units.find((entry) => entry.uid === uid) : undefined;
    if (!unit || unit.hp <= 0 || unit.gone) continue;
    const returning = battle.waited.includes(unit.uid);
    battle.active = unit.uid;
    battle.turn = { moved: false, acted: false, waited: returning, sprinted: false, item: false, movePts: moveRange(unit) };
    unit.defending = false;
    if (!returning) {
      // Poison/burn/regen once per round: not again when a unit returns after Wait.
      unit.ap = BASE_AP + pv(unit).ap + unit.apCarry;
      unit.apCarry = 0;
      upkeep(state, battle, unit, anims, ctx);
    }
    if (unit.hp <= 0) {
      battle.log.push(`${unit.name} succumbed.`);
      if (checkEnd(state, battle, ctx)) return;
      continue;
    }
    if (unit.down) {
      unit.down = false;
      anims.push({ kind: "status", uid: unit.uid, text: "Gets back up" });
      tickEndOfTurn(unit);
      continue;
    }
    const disabled = unit.statuses.find((status) => status.id === "sleep" || status.id === "stun" || status.id === "freeze");
    if (disabled) {
      anims.push({ kind: "status", uid: unit.uid, text: STATUS_NAMES[disabled.id] });
      disabled.turns -= 1;
      unit.statuses = unit.statuses.filter((status) => status.turns > 0);
      tickEndOfTurn(unit);
      continue;
    }
    return;
  }
}

export function finishTurn(state: RestiaState, battle: BattleState, anims: BattleAnim[], ctx: Ctx): void {
  const unit = activeUnit(battle);
  if (unit) {
    capturePoints(battle, unit, anims);
    tickEndOfTurn(unit);
  }
  battle.active = null;
  if (checkEnd(state, battle, ctx)) return;
  beginTurn(state, battle, anims, ctx);
}

function checkEnd(state: RestiaState, battle: BattleState, ctx: Ctx): boolean {
  if (battle.phase !== "turn") return true;
  const allies = living(battle).filter((unit) => unit.side === "ally");
  const enemies = living(battle).filter((unit) => unit.side === "enemy");
  // Beating everyone on the field wins (reinforcements that never arrived don't matter).
  if (!enemies.length) {
    battle.phase = "victory";
    battle.active = null;
    victory(state, battle, ctx);
    return true;
  }
  if (!allies.length) {
    battle.phase = "defeat";
    battle.active = null;
    copyBack(state, battle);
    return true;
  }
  return false;
}

function copyBack(state: RestiaState, battle: BattleState): void {
  for (const unit of battle.units) {
    if (unit.side !== "ally") continue;
    if (unit.kind === "member") {
      const member = state.members[unit.ref as CharId];
      if (member) {
        member.hp = Math.min(unit.hp, memberStats(state, member.id).maxHp);
        member.mp = Math.min(unit.mp, memberStats(state, member.id).maxMp);
      }
    } else if (unit.petUid) {
      const pet = state.pets.find((entry) => entry.uid === unit.petUid);
      if (pet) {
        const stats = petStats(pet);
        pet.hp = Math.min(unit.hp, stats.maxHp);
        pet.mp = Math.min(unit.mp, stats.maxMp);
      }
    }
  }
}

/** EXP share for a fighter of `level` against an enemy of `enemyLevel`: weak foes teach little. */
export function levelGapMult(level: number, enemyLevel: number): number {
  return clamp(1 + 0.12 * (enemyLevel - level), 0.15, 1.5);
}

/** Repeats of the same species on the same day teach less (resets every morning). */
export function repeatMult(killsToday: number): number {
  return killsToday < 3 ? 1 : Math.max(0.25, 1 - 0.15 * (killsToday - 2));
}

function victory(state: RestiaState, battle: BattleState, ctx: Ctx): void {
  copyBack(state, battle);
  const rewards: BattleRewards = { exp: 0, gold: 0, items: {}, levelUps: [], jobUps: [], befriended: [] };
  const goldMult = (perk(state, "treasureSense") ? 1.25 : 1) * (hasBuff(state, "fortune") ? 1.3 : 1);
  const dropMult = perk(state, "treasureSense") ? 1.1 : 1;
  const expMult = perk(state, "quickLearner") ? 1.2 : 1;
  // Each defeated foe: base EXP x today's repeat factor (per species).
  const foes: { exp: number; level: number }[] = [];
  let repeated = false;
  for (const unit of battle.units) {
    if (unit.side !== "enemy") continue;
    const key = `kill:${unit.ref}`;
    const fresh = unit.kind === "monster" ? repeatMult(state.stats.today[key] ?? 0) : 1;
    if (fresh < 1) repeated = true;
    foes.push({ exp: unit.exp * fresh * expMult, level: unit.level });
    if (unit.kind === "monster") state.stats.today[key] = (state.stats.today[key] ?? 0) + 1;
    if (unit.gone) {
      rewards.befriended.push(unit.name);
      continue;
    }
    rewards.gold += unit.gold;
    for (const drop of unit.drops) {
      if (chance(state, Math.min(1, drop.chance * dropMult))) rewards.items[drop.item] = (rewards.items[drop.item] ?? 0) + 1;
    }
    if (unit.kind === "monster") {
      const entry = (state.bestiary[unit.ref] ??= { seen: 1, defeated: 0, analyzed: false });
      entry.defeated += 1;
      state.stats.defeated[unit.ref] = (state.stats.defeated[unit.ref] ?? 0) + 1;
      state.stats.defeatedTotal += 1;
      track(state, ctx, "defeat", 1, unit.ref);
    }
  }
  const shareFor = (level: number) => Math.round(foes.reduce((sum, foe) => sum + foe.exp * levelGapMult(level, foe.level), 0));
  rewards.gold = Math.round(rewards.gold * goldMult);
  // Supply caches opened during the fight.
  const loot = battle.loot;
  if (loot && (loot.gold > 0 || Object.keys(loot.items).length)) {
    rewards.gold += loot.gold;
    for (const [item, n] of Object.entries(loot.items)) rewards.items[item] = (rewards.items[item] ?? 0) + n;
    rewards.found = { gold: loot.gold, items: { ...loot.items } };
  }
  state.gold += rewards.gold;
  for (const [item, n] of Object.entries(rewards.items)) state.inventory[item] = (state.inventory[item] ?? 0) + n;
  const fought = new Set<string>();
  let lowGap = false;
  for (const unit of battle.units) {
    if (unit.side !== "ally") continue;
    const who = unit.kind === "member" ? unit.ref : `pet:${unit.petUid}`;
    fought.add(who);
    if (unit.hp <= 0 || unit.gone) continue;
    const share = shareFor(unit.level);
    if (foes.some((foe) => levelGapMult(unit.level, foe.level) < 0.6)) lowGap = true;
    if (unit.ref === "bin") rewards.exp = share;
    const up = gainExp(state, who, share, ctx);
    if (up) rewards.levelUps.push({ who: unit.name, level: up.level });
    if (unit.kind === "member") {
      const jobUp = gainJobExp(state, unit.ref as CharId, Math.round(share * 0.6), ctx);
      if (jobUp) rewards.jobUps.push({ who: unit.name, job: jobUp.job, level: jobUp.level });
    }
  }
  for (const id of Object.keys(state.members) as CharId[]) {
    if (fought.has(id)) continue;
    const up = gainExp(state, id, Math.round(shareFor(state.members[id]!.level) * 0.3), ctx);
    if (up) rewards.levelUps.push({ who: CHARACTERS[id].name, level: up.level });
  }
  if (repeated || lowGap) rewards.expNote = repeated ? "Less EXP: you've fought a lot of these today." : "Less EXP: these foes are far below your level.";
  const challenge = battle.challenge;
  if (challenge) {
    const ok = challenge.id === "fast" ? battle.round <= challenge.target : challenge.id === "untouched" ? !challenge.failed : challenge.progress >= challenge.target;
    rewards.challenge = { text: challenge.text, ok, jp: ok ? challenge.jp : 0 };
    if (ok) {
      state.admin.ap += challenge.jp;
      ctx.toast(`[CJS] The audience loved it! "${challenge.text}" (+${challenge.jp} JP)`, "system");
    }
  }
  battle.rewards = rewards;
  state.minute += 20;
}

// ---------------------------------------------------------------------------
// Player actions (the active ally)
// ---------------------------------------------------------------------------

function activeAlly(state: RestiaState): { battle: BattleState; unit: BattleUnit } {
  const battle = state.battle;
  if (!battle || battle.phase !== "turn") fail("No battle in progress.");
  const unit = activeUnit(battle);
  if (!unit || unit.side !== "ally") fail("It's not your turn.");
  return { battle, unit };
}

function face(unit: BattleUnit, toward: number): void {
  const from = unit.cell % BOARD_COLS;
  const to = toward % BOARD_COLS;
  if (to !== from) unit.facing = to > from ? "right" : "left";
}

function spend(unit: BattleUnit, ap: number): void {
  if (unit.ap < ap) fail(`Needs ${ap} AP (you have ${unit.ap}). Defend (+1) or Charge (+2) to carry AP into next turn.`);
  unit.ap -= ap;
}

export function battleMove(state: RestiaState, cell: number, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (moveRange(unit) === 0) fail("Rooted: can't move.");
  if (battle.turn.movePts <= 0) fail("No movement left this turn.");
  const path = reachable(battle, unit, battle.turn.movePts).get(cell);
  if (!path) fail("Can't move there.");
  const cost = pathCost(battle, unit, path);
  const anims: BattleAnim[] = [];
  doMove(state, battle, unit, path, anims, ctx);
  battle.turn.moved = true;
  battle.turn.movePts = Math.max(0, battle.turn.movePts - cost);
  // After the action, the turn ends once there is nowhere left to go.
  if (unit.hp <= 0 || (battle.turn.acted && !canStillMove(battle, unit))) finishTurn(state, battle, anims, ctx);
  else checkEnd(state, battle, ctx);
  ctx.events.push({ kind: "battle", anims });
}

/** Movement points left, not rooted or disabled, and somewhere to go. */
export function canStillMove(battle: BattleState, unit: BattleUnit): boolean {
  if (unit.hp <= 0 || unit.gone || unit.down || battle.turn.movePts <= 0 || moveRange(unit) === 0) return false;
  if (unit.statuses.some((status) => status.id === "sleep" || status.id === "stun" || status.id === "freeze")) return false;
  return reachable(battle, unit, battle.turn.movePts).size > 0;
}

/** After the turn's main action the unit may still spend leftover movement (hit and run); otherwise the turn ends. */
function afterAction(state: RestiaState, battle: BattleState, unit: BattleUnit, anims: BattleAnim[], ctx: Ctx): void {
  battle.turn.acted = true;
  if (battle.phase === "turn" && !checkEnd(state, battle, ctx) && canStillMove(battle, unit)) return;
  finishTurn(state, battle, anims, ctx);
}

export function battleSprint(state: RestiaState, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Sprint before your action.");
  if (battle.turn.sprinted) fail("Already sprinting.");
  if (moveRange(unit) === 0) fail("Rooted: can't move.");
  spend(unit, 1);
  battle.turn.sprinted = true;
  battle.turn.movePts += SPRINT_MOVE;
  ctx.events.push({ kind: "battle", anims: [{ kind: "status", uid: unit.uid, text: `Sprint (+${SPRINT_MOVE} move)` }] });
}

/** A basic attack (and the defender's counter). Shared with the enemy AI. */
export function basicAttack(state: RestiaState, battle: BattleState, attacker: BattleUnit, target: BattleUnit, anims: BattleAnim[], ctx: Ctx): void {
  const [from, to] = nearestPair(cellsOf(attacker), cellsOf(target));
  const distance = hexDistance(from, to);
  const ranged = attacker.range > 1 && distance > 1;
  face(attacker, to);
  const sound = attackSound(attacker, ranged);
  const canCounter = () =>
    distance === 1 &&
    target.hp > 0 &&
    attacker.hp > 0 &&
    !target.retaliated &&
    !target.down &&
    !pv(attacker).noRetaliation &&
    !cliffBlocksMelee(battle, target, to, from) &&
    !target.statuses.some((status) => status.id === "sleep" || status.id === "stun" || status.id === "freeze");
  const counter = () => {
    target.retaliated = true;
    face(target, from);
    anims.push({ kind: "attack", uid: target.uid, target: attacker.uid, anim: "attack", ...(attackSound(target, false) ? { sound: attackSound(target, false) } : {}) });
    strike(state, battle, target, attacker, { power: pv(target).counter, element: target.element, physical: !target.magic }, anims, ctx);
  };
  const first = pv(target).firstStrike && canCounter();
  if (first) {
    anims.push({ kind: "status", uid: target.uid, text: "First strike!" });
    counter();
    if (attacker.hp <= 0) return;
  }
  anims.push({ kind: "attack", uid: attacker.uid, target: target.uid, anim: ranged ? "shoot" : attacker.magic ? "cast" : "attack", ...(sound ? { sound } : {}) });
  if (ranged) anims.push({ kind: "projectile", from, to, sprite: attacker.magic ? magicBolt(attacker.element) : "arrow" });
  if (attacker.magic && distance > 1) anims.push({ kind: "fx", cell: to, fx: elementFx(attacker.element) });
  strike(state, battle, attacker, target, { power: 1, element: attacker.element, physical: !attacker.magic, pointBlank: attacker.range > 1 && distance === 1, ranged }, anims, ctx);
  if (!first && canCounter()) counter();
}

function attackSound(unit: BattleUnit, ranged: boolean): string | undefined {
  if (unit.kind === "monster" || unit.kind === "pet") return unitSound(unit.sprite, ranged ? "shoot" : "attack");
  const byChar: Record<string, string> = {
    bin: "units/swordsman-attack",
    mitia: "spells/ice-bolt",
    bowy: "units/sharpshooter-shoot",
    garr: "units/rogue-attack",
    hilda: "units/champion-attack",
    senna: "units/crusader-attack",
    dain: "units/swordsman-attack"
  };
  return byChar[unit.ref];
}

function magicBolt(element: Element): "fireball" | "ice" | "dark" | "light" | "wind" | "rock" {
  return element === "fire" ? "fireball" : element === "ice" ? "ice" : element === "dark" ? "dark" : element === "wind" ? "wind" : element === "earth" ? "rock" : "light";
}

export function elementFx(element: Element): "fire" | "ice" | "wind" | "earth" | "light" | "dark" | "slash" {
  return element === "phys" ? "slash" : element;
}

export function battleAttack(state: RestiaState, targetUid: string, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  const anims: BattleAnim[] = [];
  if (targetUid.startsWith("prop-")) {
    const prop = battle.props.find((entry) => entry.uid === targetUid && entry.hp > 0);
    if (!prop) fail("Nothing to hit there.");
    const block = attackBlock(battle, unit, prop);
    if (block) fail(block);
    spend(unit, 1);
    face(unit, prop.cell);
    const ranged = unit.range > 1 && hexDistance(unit.cell, prop.cell) > 1;
    anims.push({ kind: "attack", uid: unit.uid, target: prop.uid, anim: ranged ? "shoot" : unit.magic ? "cast" : "attack", ...(attackSound(unit, ranged) ? { sound: attackSound(unit, ranged) } : {}) });
    if (ranged) anims.push({ kind: "projectile", from: unit.cell, to: prop.cell, sprite: unit.magic ? magicBolt(unit.element) : "arrow" });
    damageProp(state, battle, prop, eff(state, unit, unit.magic ? "mag" : "atk"), unit.element, anims, ctx);
    battle.log.push(`${unit.name} strikes the ${PROP_NAMES[prop.kind]}.`);
  } else {
    const target = findUnit(battle, targetUid);
    if (target.side === unit.side || target.hp <= 0 || target.gone) fail("Pick an enemy.");
    const taunt = tauntedBy(battle, unit);
    if (taunt && taunt !== target) fail(`Taunted: ${unit.name} must attack ${taunt.name}.`);
    const block = attackBlock(battle, unit, target);
    if (block) fail(block);
    spend(unit, 1);
    basicAttack(state, battle, unit, target, anims, ctx);
    battle.log.push(`${unit.name} attacks ${target.name}.`);
  }
  afterAction(state, battle, unit, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

/** `path`: the hexes a dash charges through before striking. */
export type SkillHits = { units: BattleUnit[]; props: BattleProp[]; cells: number[]; path?: number[] };

/**
 * The head's path for a dash at `target`, ending next to it (or why it can't).
 * The run is the straight line from the charger's hex nearest the target; a
 * two-hex body keeps its shape, its head shifting with that hex at every step,
 * and each step is checked like walking (`footprintStep`: the whole footprint
 * enterable, a walker's tail level with its head) except that anyone in the way
 * stops a walker. Flyers swoop over units, water and crags; they only need a
 * free spot next to the target where the run ends (that hex, or else the first
 * free one beside both it and the target).
 */
function chargePath(battle: BattleState, caster: BattleUnit, target: BattleUnit): number[] | string {
  if (moveRange(caster) === 0) return "Rooted: can't charge.";
  const [lead, spot] = nearestPair(cellsOf(caster), cellsOf(target));
  if (hexDistance(lead, spot) < 2) return "Too close to charge.";
  // Head and tail share a row, so shifting both by the same step keeps them together.
  const shift = colRow(caster.cell).col - colRow(lead).col;
  const sure = pv(caster).sureFooted;
  const path: number[] = [];
  let previous = caster.cell;
  let leadEnd = lead;
  for (const step of hexLine(lead, spot).slice(1, -1)) {
    const { col, row } = colRow(step);
    const head = inBoard(col + shift, row) ? cellOf(col + shift, row) : null;
    if (head === null || !Number.isFinite(footprintStep(battle, caster, previous, head, sure, true))) return "The charge is blocked.";
    path.push(head);
    previous = head;
    leadEnd = step;
  }
  if (!caster.flying) {
    if (!canStandAt(battle, caster, previous)) return "The charge is blocked.";
    return cliffBetween(battle, leadEnd, spot) ? CLIFF : path;
  }
  if (canStandAt(battle, caster, previous)) return path;
  const landing = neighbors(previous).find((cell) => canStandAt(battle, caster, cell) && unitDistance(caster, target, cell) === 1);
  if (landing === undefined) return "No room to land next to it.";
  path.push(landing);
  return path;
}

function hostileSkill(skill: SkillDef): boolean {
  return skill.kind === "physical" || skill.kind === "magic" || skill.kind === "debuff" || skill.kind === "analyze";
}

/** What a skill would affect if aimed at `cell` (validates range, sight and target). */
export function skillTargets(state: RestiaState, battle: BattleState, caster: BattleUnit, skill: SkillDef, cell: number): SkillHits | string {
  void state;
  const friendly = (unit: BattleUnit) => unit.side === caster.side;
  const all = battle.units.filter((unit) => !unit.gone);
  const reach = skill.range + (skill.projectile ? weatherRange(battle.weather) : 0);
  const none = { props: [] as BattleProp[], cells: [] as number[] };
  switch (skill.target) {
    case "self":
      return { units: [caster], ...none, cells: [caster.cell] };
    case "allAllies": {
      const units = all.filter((unit) => friendly(unit) && (skill.kind === "revive" ? unit.hp <= 0 : unit.hp > 0));
      return units.length ? { units, ...none, cells: units.map((unit) => unit.cell) } : "No one to affect.";
    }
    case "allEnemies": {
      const units = all.filter((unit) => !friendly(unit) && unit.hp > 0);
      return units.length ? { units, ...none, cells: units.map((unit) => unit.cell) } : "No targets.";
    }
    case "enemy": {
      // Measured between the nearest hexes of the caster and of whatever is aimed at.
      const aimed = all.find((unit) => occupies(unit, cell) && unit.hp > 0 && !friendly(unit));
      const [origin, spot] = nearestPair(cellsOf(caster), aimed ? cellsOf(aimed) : [cell]);
      const distance = hexDistance(origin, spot);
      if (distance > Math.max(1, reach)) return "Out of range.";
      if (skill.line) {
        // Travels the whole line; stops at the first sight-blocking prop (which takes the hit).
        const cells: number[] = [];
        const props: BattleProp[] = [];
        for (const step of hexRay(caster.cell, cell, skill.range)) {
          // A crag stops the line like a wall.
          if (isCrag(battle, step)) break;
          const prop = propAt(battle, step);
          cells.push(step);
          if (prop) {
            if (prop.kind !== "rock") props.push(prop);
            if (blocksSight(prop)) break;
          }
        }
        const units = all.filter((unit) => unit.hp > 0 && !friendly(unit) && cellsOf(unit).some((covered) => cells.includes(covered)));
        return units.length || props.length ? { units, props, cells } : "Nothing on that line.";
      }
      // Shots and hook lines need a clear line; arcing volleys don't.
      if ((skill.projectile || skill.pull) && !skill.indirect && distance > 1 && !hasLineOfSight(battle, origin, spot)) return "No line of sight.";
      // A weapon strike from the next hex can't reach across a cliff.
      const contactCliff = distance === 1 && skill.kind === "physical" && !skill.projectile && !caster.flying && cliffBetween(battle, origin, spot);
      const target = aimed;
      if (target) {
        const taunt = tauntedBy(battle, caster);
        if (taunt && taunt !== target && skill.kind !== "analyze") return `Taunted: must target ${taunt.name}.`;
        if (skill.move === "dash") {
          const path = chargePath(battle, caster, target);
          return typeof path === "string" ? path : { units: [target], ...none, cells: [cell], path };
        }
        if (contactCliff) return CLIFF;
        return { units: [target], ...none, cells: [cell] };
      }
      const prop = propAt(battle, cell);
      if (prop && prop.kind !== "rock" && (skill.kind === "physical" || skill.kind === "magic") && !skill.move) {
        return contactCliff ? CLIFF : { units: [], props: [prop], cells: [cell] };
      }
      return "Pick an enemy.";
    }
    case "hex": {
      if (cell < 0 || cell >= BOARD_CELLS || battle.tiles[cell] === "void") return "Off the board.";
      const distance = distanceTo(caster, cell);
      if (distance > skill.range) return "Out of range.";
      // Leaps and blinks put the caster's head on the chosen hex: its whole body must fit there.
      const mover = skill.move === "leap" || skill.move === "blink";
      if (mover) {
        if (moveRange(caster) === 0) return skill.move === "blink" ? "Rooted: can't blink." : "Rooted: can't leap.";
        if (cell === caster.cell || !canStandAt(battle, caster, cell)) return caster.wide ? "Needs two free, level hexes to land on." : "Land on an empty hex.";
      }
      if (skill.projectile && !skill.indirect && distance > 1 && !hasLineOfSight(battle, caster.cell, cell)) return "No line of sight.";
      const radius = skill.radius ?? 0;
      // A landing reaches out from every hex the body comes down on.
      const centers = mover ? cellsAt(caster, cell) : [cell];
      const cells: number[] = [];
      for (let c = 0; c < BOARD_CELLS; c++) if (battle.tiles[c] !== "void" && centers.some((center) => hexDistance(c, center) <= radius)) cells.push(c);
      if (skill.shape && !shapePlan(battle, cells, skill.shape).size) return skill.shape > 0 ? "The ground there can't rise any higher (it would leave no way up)." : "The ground there can't sink any lower.";
      const hostile = hostileSkill(skill);
      let units = all.filter((unit) => unit.hp > 0 && (!mover || unit !== caster) && cellsOf(unit).some((covered) => cells.includes(covered)) && (hostile ? !friendly(unit) : friendly(unit)));
      // Landing strikes are weapon blows: not across a cliff from the landing hexes.
      if (mover && skill.kind === "physical" && !caster.flying) {
        units = units.filter((unit) => {
          const [own, their] = nearestPair(cellsAt(caster, cell), cellsOf(unit));
          return !cliffBetween(battle, own, their);
        });
      }
      const props = hostile && skill.kind !== "debuff" ? battle.props.filter((prop) => prop.hp > 0 && prop.kind !== "rock" && cells.includes(prop.cell)) : [];
      if (!units.length && !props.length && !skill.move && !skill.shape) return "No targets there.";
      const taunter = hostile ? tauntedBy(battle, caster) : null;
      if (taunter && !units.includes(taunter)) return `Taunted: must target ${taunter.name}.`;
      return { units, props, cells };
    }
    case "ally": {
      const target = all.find((unit) => occupies(unit, cell) && friendly(unit) && (skill.kind === "revive" ? unit.hp <= 0 : unit.hp > 0));
      if ((target ? unitDistance(caster, target) : distanceTo(caster, cell)) > skill.range) return "Out of range.";
      return target ? { units: [target], ...none, cells: [cell] } : skill.kind === "revive" ? "Pick a fallen ally." : "Pick an ally.";
    }
    case "area": {
      const center = skill.range === 0 ? caster.cell : cell;
      if (distanceTo(caster, center) > skill.range) return "Out of range.";
      const radius = skill.radius ?? 0;
      const cells: number[] = [];
      for (let c = 0; c < BOARD_CELLS; c++) if (hexDistance(c, center) <= radius && battle.tiles[c] !== "void") cells.push(c);
      const hostile = hostileSkill(skill);
      // Radius-0 self areas (ground slams) reach out from every hex of a two-hex caster.
      if (skill.range === 0) for (const own of cellsOf(caster)) for (let c = 0; c < BOARD_CELLS; c++) if (hexDistance(c, own) <= radius && battle.tiles[c] !== "void" && !cells.includes(c)) cells.push(c);
      let units = all.filter((unit) => unit.hp > 0 && cellsOf(unit).some((covered) => cells.includes(covered)) && (hostile ? !friendly(unit) : friendly(unit)));
      // A weapon sweep around the caster is still a weapon blow: not across a cliff.
      if (skill.range === 0 && skill.kind === "physical" && !skill.projectile && !caster.flying) {
        units = units.filter((unit) => {
          const [own, their] = nearestPair(cellsOf(caster), cellsOf(unit));
          return hexDistance(own, their) > 1 || !cliffBetween(battle, own, their);
        });
      }
      const props = hostile && skill.kind !== "debuff" ? battle.props.filter((prop) => prop.hp > 0 && prop.kind !== "rock" && cells.includes(prop.cell)) : [];
      const taunter = hostile && skill.kind !== "debuff" ? tauntedBy(battle, caster) : null;
      if (taunter && (units.length || props.length) && !units.includes(taunter)) return `Taunted: must target ${taunter.name}.`;
      return units.length || props.length || skill.terrain ? { units, props, cells } : "No targets there.";
    }
  }
}

/** Where fallen allies stand up: own hex or the nearest free one (null = packed). */
export function revivalCell(battle: BattleState, target: BattleUnit): number | null {
  const free = (cell: number) => canStandAt(battle, target, cell);
  if (free(target.cell)) return target.cell;
  const seen = new Set([target.cell]);
  const queue = [target.cell];
  while (queue.length) {
    const cell = queue.shift()!;
    for (const next of neighbors(cell)) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (free(next)) return next;
      queue.push(next);
    }
  }
  return null;
}

/** Performs a skill (costs already checked). Shared with the enemy AI. */
export function applySkill(state: RestiaState, battle: BattleState, caster: BattleUnit, skill: SkillDef, cell: number, hits: SkillHits, anims: BattleAnim[], ctx: Ctx): void {
  caster.mp -= skillMp(caster, skill);
  caster.ap -= skillAp(skill);
  // Height bonuses count from where the caster began (a leap off a hill keeps its drop).
  const fromHeight = heightOf(battle, caster.cell);
  let travelled = 0;
  if (skill.move === "leap") {
    // A grapple line flies out first, then the caster follows it.
    if (skill.projectile) anims.push({ kind: "projectile", from: caster.cell, to: cell, sprite: skill.projectile });
    land(state, battle, caster, cell, skill.sprite ?? "jump", anims, ctx);
    if (caster.hp <= 0) return;
  } else if (skill.move === "blink") {
    land(state, battle, caster, cell, skill.sprite ?? "jump", anims, ctx, true);
    if (caster.hp <= 0) return;
  } else if (skill.move === "dash" && hits.path?.length) {
    travelled = hits.path.length;
    doMove(state, battle, caster, hits.path, anims, ctx);
    if (caster.hp <= 0) return;
  }
  const first = hits.units[0] ?? null;
  const aim = first ? nearestPair(cellsOf(caster), cellsOf(first))[1] : hits.props[0]?.cell ?? cell;
  if (aim !== caster.cell) face(caster, aim);
  const casting = skill.anim === "cast";
  if (casting) anims.push({ kind: "fx", cell: caster.cell, fx: "cast" });
  // Leaps drawn with a full leap-and-strike row already showed the blow; a plain jump strikes on landing.
  // A blink only strikes when there is something to hit around the arrival.
  const strikes = hits.units.length > 0 || hits.props.length > 0;
  const blow = skill.move === "leap" ? (skill.sprite ?? "jump") === "jump" && strikes : skill.move === "blink" ? strikes : true;
  if (blow) {
    anims.push({
      kind: "attack",
      uid: caster.uid,
      target: first?.uid ?? caster.uid,
      anim: casting ? "cast" : caster.range > 1 && distanceTo(caster, aim) > 1 ? "shoot" : "attack",
      ...(skill.sprite && skill.move !== "leap" ? { sprite: skill.sprite } : {})
    });
  }
  const fx = skill.fx ?? (skill.kind === "heal" || skill.kind === "revive" ? "heal" : skill.kind === "buff" ? "buff" : skill.kind === "debuff" ? "debuff" : elementFx(skill.element ?? caster.element));
  if (skill.projectile && skill.move !== "leap" && aim !== caster.cell) anims.push({ kind: "projectile", from: caster.cell, to: aim, sprite: skill.projectile });
  if (skill.target === "area" || (skill.target === "hex" && (skill.radius ?? 0) > 0)) {
    anims.push({ kind: "fx", cell: skill.range === 0 ? caster.cell : cell, fx, ...(skill.sfx ? { sound: skill.sfx } : {}) });
  } else if (skill.line) {
    let played = false;
    for (const step of hits.cells) {
      anims.push({ kind: "fx", cell: step, fx, ...(skill.sfx && !played ? { sound: skill.sfx } : {}) });
      played = true;
    }
  } else {
    const cells = hits.units.length ? hits.units.map((unit) => unit.cell) : hits.cells;
    cells.forEach((c, index) => anims.push({ kind: "fx", cell: c, fx, ...(skill.sfx && index === 0 ? { sound: skill.sfx } : {}) }));
  }
  battle.log.push(`${caster.name} uses ${skill.name}.`);
  const physical = skill.kind === "physical";
  // Measured from the caster's nearest hex (a two-hex body strikes from its tail too).
  const ranged = distanceTo(caster, aim) > 1;
  for (const target of hits.units) {
    switch (skill.kind) {
      case "physical":
      case "magic": {
        let dealt = 0;
        for (let i = 0; i < (skill.hits ?? 1) && target.hp > 0; i++) {
          dealt += strike(
            state,
            battle,
            caster,
            target,
            {
              // A dash hits harder the further it ran.
              power: (skill.power ?? 1) * (1 + 0.15 * travelled),
              element: skill.element ?? caster.element,
              physical,
              ranged,
              crit: skill.crit,
              indirect: skill.indirect,
              heightPower: skill.heightPower,
              fromHeight
            },
            anims,
            ctx
          );
        }
        if (dealt > 0 && target.hp > 0) {
          if (skill.status && chance(state, skill.status.chance)) addStatus(battle, target, skill.status.id, skill.status.turns, anims, caster);
          addMods(battle, target, skill.mods);
          // Pushed away from / dragged toward the caster's nearest hex (a two-hex body has two).
          const near = nearestPair(cellsOf(caster), cellsOf(target))[0];
          if (skill.knockback) knockBack(state, battle, near, target, skill.knockback, anims, ctx);
          if (skill.pull) pullToward(state, battle, near, target, skill.pull, anims, ctx);
        }
        if (dealt > 0 && skill.drain) heal(caster, dealt * skill.drain, anims);
        break;
      }
      case "heal": {
        const boost = 1 + pv(caster).healBoost / 100;
        if ((skill.power ?? 0) > 0) heal(target, (skill.power ?? 1) * (eff(state, caster, "mag") + caster.level * 2) * boost, anims);
        if (skill.cure) target.statuses = target.statuses.filter((status) => !NEGATIVE.includes(status.id));
        if (skill.status && POSITIVE.includes(skill.status.id) && chance(state, skill.status.chance)) addStatus(battle, target, skill.status.id, skill.status.turns, anims);
        addMods(battle, target, skill.mods);
        break;
      }
      case "revive": {
        target.cell = revivalCell(battle, target) ?? target.cell;
        target.hp = Math.max(1, Math.round(target.stats.maxHp * (skill.power ?? 0.5)));
        target.statuses = [];
        anims.push({ kind: "hit", uid: target.uid, amount: target.hp, crit: false, weak: false, resist: false, miss: false, heal: true });
        break;
      }
      case "buff":
        addMods(battle, target, skill.mods);
        if (skill.status && POSITIVE.includes(skill.status.id) && chance(state, skill.status.chance)) addStatus(battle, target, skill.status.id, skill.status.turns, anims);
        if (!skill.shield && !skill.taunt && (skill.mods?.length || skill.status)) anims.push({ kind: "status", uid: target.uid, text: skill.name });
        break;
      case "debuff":
        addMods(battle, target, skill.mods);
        if (skill.status && chance(state, skill.status.chance)) addStatus(battle, target, skill.status.id, skill.status.turns, anims, caster);
        else if (!skill.mods?.length) anims.push({ kind: "hit", uid: target.uid, amount: 0, crit: false, weak: false, resist: false, miss: true, heal: false });
        break;
      case "analyze":
        if (target.kind === "monster") {
          const entry = (state.bestiary[target.ref] ??= { seen: 1, defeated: 0, analyzed: false });
          entry.analyzed = true;
          ctx.toast(`[CJS] ${target.name} analyzed: weaknesses revealed.`, "system");
        }
        anims.push({ kind: "status", uid: target.uid, text: "Analyzed" });
        break;
    }
    if (skill.shield && target.hp > 0) {
      const amount = Math.round(skill.shield * (eff(state, caster, "mag") + caster.level * 2) * (1 + pv(caster).healBoost / 100));
      target.shield += amount;
      anims.push({ kind: "status", uid: target.uid, text: `Shield ${amount}` });
    }
  }
  for (const prop of hits.props) {
    if (skill.kind !== "physical" && skill.kind !== "magic") continue;
    damageProp(state, battle, prop, (skill.power ?? 1) * eff(state, caster, physical ? "atk" : "mag"), skill.element ?? caster.element, anims, ctx);
  }
  if (skill.taunt) {
    for (const foe of living(battle).filter((unit) => unit.side !== caster.side && unitDistance(unit, caster) <= 2)) addStatus(battle, foe, "taunt", skill.taunt, anims, caster);
  }
  if (skill.shape) shapeGround(state, battle, hits.cells, skill.shape, anims, ctx);
  if (skill.terrain) {
    for (const c of hits.cells) {
      if (battle.tiles[c] === "void" || battle.tiles[c] === "water" || isCrag(battle, c) || propAt(battle, c)) continue;
      battle.tiles[c] = skill.terrain;
      battle.tileTimers[c] = 3;
    }
  }
  if (skill.element === "fire" || skill.element === "ice") for (const c of hits.cells) groundReaction(battle, c, skill.element);
  if (skill.selfMods?.length && caster.hp > 0) {
    for (const mod of skill.selfMods) caster.mods.push({ ...mod, skip: true });
  }
}

/** Why the active unit can't use a skill right now (null = it can). */
export function skillBlock(battle: BattleState, unit: BattleUnit, skill: SkillDef): string | null {
  if (!unit.skills.includes(skill.id)) return "Not known.";
  if (hasStatus(unit, "silence")) return "Silenced.";
  if (unit.mp < skillMp(unit, skill)) return "Not enough MP.";
  if (unit.ap < skillAp(skill)) return `Needs ${skillAp(skill)} AP.`;
  void battle;
  return null;
}

export function battleSkill(state: RestiaState, skillId: string, cell: number, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  const skill = skillDef(skillId);
  const block = skillBlock(battle, unit, skill);
  if (block) fail(block === `Needs ${skillAp(skill)} AP.` ? `${skill.name} needs ${skillAp(skill)} AP (you have ${unit.ap}). Defend (+1) or Charge (+2) first.` : block);
  const hits = skillTargets(state, battle, unit, skill, cell);
  if (typeof hits === "string") fail(hits);
  if (skill.kind === "revive" && hits.units.some((target) => revivalCell(battle, target) === null)) fail("There's no room around that fallen ally.");
  const anims: BattleAnim[] = [];
  applySkill(state, battle, unit, skill, cell, hits, anims, ctx);
  afterAction(state, battle, unit, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

/** Items are a quick action: 1 AP, once per turn, and the turn goes on. */
export function battleItem(state: RestiaState, itemId: string, cell: number, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  if (battle.turn.item) fail("One item per turn.");
  const def = itemDef(itemId);
  const use = def.use;
  if (!use || count(state, itemId) < 1) fail(`You have no ${def.name}.`);
  const anims: BattleAnim[] = [];
  if (use.escape) {
    if (!battle.canFlee) fail("There's no escaping this fight!");
    removeItem(state, itemId, 1);
    battle.log.push("Smoke fills the field. You slip away!");
    battle.phase = "fled";
    battle.active = null;
    copyBack(state, battle);
    ctx.events.push({ kind: "battle", anims });
    return;
  }
  if (use.bomb) {
    if (distanceTo(unit, cell) > 3) fail("Too far to throw (3 hexes).");
    spend(unit, ITEM_AP);
    removeItem(state, itemId, 1);
    anims.push({ kind: "attack", uid: unit.uid, target: unit.uid, anim: "attack" });
    anims.push({ kind: "projectile", from: unit.cell, to: cell, sprite: "rock" });
    anims.push({ kind: "fx", cell, fx: use.bomb.element === "ice" ? "ice" : "explosion", sound: use.bomb.element === "ice" ? "spells/frost-ring" : "spells/fireball-hit" });
    for (const target of living(battle).filter((entry) => entry.side !== unit.side && distanceTo(entry, cell) <= use.bomb!.radius)) {
      const mult = elementMult(battle, target, use.bomb.element);
      if (mult === 0) {
        anims.push({ kind: "hit", uid: target.uid, amount: 0, crit: false, weak: false, resist: true, miss: false, heal: false });
        continue;
      }
      const damage = Math.max(1, Math.round(use.bomb.power * (25 + 4 * unit.level) * mult * (0.9 + random(state) * 0.2)));
      dealDamage(state, battle, target, damage, anims, ctx, { weak: mult > 1, resist: mult < 1, cause: "explosion" });
      if (target.hp > 0 && use.bomb.status && chance(state, 0.35)) addStatus(battle, target, use.bomb.status, use.bomb.status === "burn" ? 3 : 1, anims);
    }
    for (const prop of [...battle.props]) {
      if (prop.hp > 0 && prop.kind !== "rock" && hexDistance(prop.cell, cell) <= use.bomb.radius) damageProp(state, battle, prop, use.bomb.power * (25 + 4 * unit.level), use.bomb.element, anims, ctx);
    }
    for (let c = 0; c < BOARD_CELLS; c++) if (hexDistance(c, cell) <= use.bomb.radius) groundReaction(battle, c, use.bomb.element);
  } else {
    if (distanceTo(unit, cell) > 1) fail("Items reach yourself or an adjacent ally.");
    const target = battle.units.find((entry) => occupies(entry, cell) && entry.side === unit.side && !entry.gone && (use.revivePct ? entry.hp <= 0 : entry.hp > 0));
    if (!target) fail(use.revivePct ? "Pick a fallen ally next to you." : "Pick yourself or an adjacent ally.");
    if (!use.hp && !use.hpPct && !use.mp && !use.mpPct && !use.cure && !use.revivePct) fail(`${def.name} can't be used in battle.`);
    const revival = use.revivePct ? revivalCell(battle, target) : null;
    if (use.revivePct && revival === null) fail("There's no room around that fallen ally.");
    spend(unit, ITEM_AP);
    removeItem(state, itemId, 1);
    anims.push({ kind: "pose", uid: unit.uid, pose: "item" });
    anims.push({ kind: "fx", cell: target.cell, fx: "heal", sound: "spells/cure" });
    if (use.revivePct) {
      target.cell = revival!;
      target.hp = Math.max(1, Math.round((target.stats.maxHp * use.revivePct) / 100));
      anims.push({ kind: "hit", uid: target.uid, amount: target.hp, crit: false, weak: false, resist: false, miss: false, heal: true });
    } else {
      if (use.hp || use.hpPct) heal(target, (use.hp ?? 0) + (target.stats.maxHp * (use.hpPct ?? 0)) / 100, anims);
      if (use.mp || use.mpPct) target.mp = Math.min(target.stats.maxMp, target.mp + (use.mp ?? 0) + Math.round((target.stats.maxMp * (use.mpPct ?? 0)) / 100));
      if (use.cure) target.statuses = target.statuses.filter((status) => !NEGATIVE.includes(status.id));
    }
  }
  battle.log.push(`${unit.name} uses ${def.name}.`);
  battle.turn.item = true;
  if (!checkEnd(state, battle, ctx) && unit.hp <= 0) finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

/** Defend: DEF/RES x1.5 until the next turn, +10% MP, and 1 AP carried over. Shared with the AI. */
export function defendAction(battle: BattleState, unit: BattleUnit, anims: BattleAnim[]): void {
  unit.defending = true;
  unit.apCarry += DEFEND_CARRY;
  unit.mp = Math.min(unit.stats.maxMp, unit.mp + Math.round(unit.stats.maxMp * 0.1));
  anims.push({ kind: "status", uid: unit.uid, text: `Defending (+${DEFEND_CARRY} AP)` });
  void battle;
}

export function battleDefend(state: RestiaState, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  const anims: BattleAnim[] = [];
  defendAction(battle, unit, anims);
  battle.turn.acted = true;
  finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

export function battleWait(state: RestiaState, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.moved || battle.turn.acted || battle.turn.sprinted || battle.turn.item) fail("Wait is only possible before doing anything.");
  if (battle.turn.waited) fail("This unit already waited this round.");
  if (!battle.queue.length) fail("Everyone else has acted; end the turn instead.");
  battle.waited.push(unit.uid);
  battle.queue.push(unit.uid);
  battle.active = null;
  const anims: BattleAnim[] = [];
  beginTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

/** Ends the turn. Without a main action this is Charge: 2 AP carried into the next turn. */
export function chargeAction(battle: BattleState, unit: BattleUnit, anims: BattleAnim[]): void {
  if (battle.turn.acted) return;
  unit.apCarry += CHARGE_CARRY;
  anims.push({ kind: "pose", uid: unit.uid, pose: "charge" });
  anims.push({ kind: "status", uid: unit.uid, text: `Charging (+${CHARGE_CARRY} AP)` });
}

export function battleEndTurn(state: RestiaState, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  const anims: BattleAnim[] = [];
  chargeAction(battle, unit, anims);
  finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

export function befriendChance(state: RestiaState, target: BattleUnit): number {
  const hpRatio = target.hp / target.stats.maxHp;
  let p = target.tame * (1.6 - hpRatio);
  if (count(state, "monsterTreat") > 0) p += 0.25;
  if (count(state, "tamingBrush") > 0) p += 0.1;
  if (perk(state, "tamer")) p += 0.15;
  p += skillLevel(state.skills.taming) * 0.02;
  return clamp(p, 0.02, 0.95);
}

export function battleBefriend(state: RestiaState, targetUid: string, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  const target = findUnit(battle, targetUid);
  if (target.side === unit.side || target.hp <= 0 || target.gone) fail("Pick a monster.");
  if (target.kind !== "monster" || target.tame <= 0 || target.boss) fail(`${target.name} can't be befriended.`);
  if (unitDistance(unit, target) > 1) fail("Get next to it first.");
  if (state.town.levels.barn < 1) fail("Build a Monster Barn first (Outpost Board).");
  if (state.pets.length >= barnCapacity(state)) fail("The barn is full.");
  spend(unit, 1);
  const p = befriendChance(state, target);
  if (count(state, "monsterTreat") > 0) removeItem(state, "monsterTreat", 1);
  const anims: BattleAnim[] = [{ kind: "attack", uid: unit.uid, target: target.uid, anim: "cast" }];
  if (chance(state, p)) {
    target.gone = true;
    target.hp = 0;
    const def = MONSTERS[target.ref]!;
    const pet = { uid: `p${state.day}-${state.stats.befriended}-${randInt(state, 100, 999)}`, species: def.id, name: def.name, level: target.level, exp: 0, hp: 1, mp: 0, farmJob: !!def.farmJob };
    const stats = growStats(def.base, def.growth, pet.level);
    pet.hp = stats.maxHp;
    pet.mp = stats.maxMp;
    state.pets.push(pet);
    state.stats.befriended += 1;
    track(state, ctx, "befriend", 1);
    gainSkill(state, "taming", 12, ctx);
    anims.push({ kind: "befriend", uid: target.uid, ok: true });
    battle.log.push(`${target.name} wants to come home with you!`);
    ctx.toast(`${target.name} was befriended and moved to your barn!`, "good");
  } else {
    gainSkill(state, "taming", 2, ctx);
    anims.push({ kind: "befriend", uid: target.uid, ok: false });
    battle.log.push(`${target.name} isn't convinced.`);
  }
  afterAction(state, battle, unit, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

export function fleeChance(state: RestiaState, battle: BattleState): number {
  const avg = (side: "ally" | "enemy") => {
    const units = living(battle).filter((unit) => unit.side === side);
    return units.reduce((sum, unit) => sum + eff(state, unit, "spd"), 0) / Math.max(1, units.length);
  };
  return clamp(0.5 + (avg("ally") - avg("enemy")) * 0.03, 0.2, 0.9);
}

export function battleFlee(state: RestiaState, ctx: Ctx): void {
  const { battle } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  if (!battle.canFlee) fail("There's no escaping this fight!");
  const anims: BattleAnim[] = [];
  if (chance(state, fleeChance(state, battle))) {
    battle.phase = "fled";
    battle.active = null;
    battle.log.push("You got away!");
    copyBack(state, battle);
  } else {
    battle.log.push("Couldn't escape!");
    ctx.toast("Couldn't escape!", "bad");
    battle.turn.acted = true;
    finishTurn(state, battle, anims, ctx);
  }
  ctx.events.push({ kind: "battle", anims });
}

export function rushReady(battle: BattleState): boolean {
  const enemies = living(battle).filter((unit) => unit.side === "enemy");
  return enemies.length > 0 && enemies.every((unit) => unit.down);
}

export function battleRush(state: RestiaState, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  if (!rushReady(battle)) fail("Rush needs every enemy to be down.");
  spend(unit, 1);
  const anims: BattleAnim[] = [{ kind: "banner", text: "ALL-OUT RUSH!" }];
  for (const ally of living(battle).filter((entry) => entry.side === "ally")) {
    for (const enemy of living(battle).filter((entry) => entry.side === "enemy")) {
      anims.push({ kind: "attack", uid: ally.uid, target: enemy.uid, anim: "attack" });
      anims.push({ kind: "fx", cell: enemy.cell, fx: "slash" });
      strike(state, battle, ally, enemy, { power: 0.8, element: ally.element, physical: !ally.magic }, anims, ctx);
    }
  }
  for (const enemy of living(battle).filter((entry) => entry.side === "enemy")) enemy.down = false;
  battle.log.push(`${unit.name} leads an all-out RUSH!`);
  afterAction(state, battle, unit, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

// ---------------------------------------------------------------------------
// Closing the battle
// ---------------------------------------------------------------------------

export function finishBattle(state: RestiaState, ctx: Ctx): void {
  const battle = state.battle;
  if (!battle || battle.phase === "turn") fail("The battle isn't over.");
  state.battle = null;
  const origin = battle.origin;
  if (battle.phase === "victory") {
    if (origin.kind === "field") state.fieldMonsters = state.fieldMonsters.filter((monster) => monster.uid !== origin.monsterUid);
    if (origin.kind === "dungeon" && state.dungeon) {
      const dungeon = state.dungeon;
      const monster = dungeon.monsters.find((entry) => entry.uid === origin.monsterUid);
      dungeon.monsters = dungeon.monsters.filter((entry) => entry.uid !== origin.monsterUid);
      if (monster?.boss) {
        const theme = themeForFloor(dungeon.floor);
        if (theme.boss.floor === dungeon.floor) state.flags[theme.boss.flag] = true;
      }
    }
    if (battle.winScene) playScene(state, battle.winScene, ctx);
    return;
  }
  if (battle.phase === "fled") {
    const list = origin.kind === "dungeon" ? state.dungeon?.monsters ?? [] : origin.kind === "field" ? state.fieldMonsters : [];
    const monster = list.find((entry) => entry.uid === (origin as { monsterUid: string }).monsterUid);
    if (monster) monster.frozen = 4;
    return;
  }
  // Defeat.
  if (battle.soft) {
    for (const member of Object.values(state.members)) if (member && member.hp <= 0) member.hp = 1;
    for (const pet of state.pets) if (pet.hp <= 0) pet.hp = 1;
    if (battle.loseScene) playScene(state, battle.loseScene, ctx);
    else ctx.toast("You lost the match. Try again when you're stronger.", "bad");
    return;
  }
  passOut(state, ctx, "Your party was defeated. Villagers found you and carried you home.");
}

export function bestiaryAnalyzed(state: RestiaState, species: string): boolean {
  return !!state.bestiary[species]?.analyzed;
}

// Engine internals the AI module plays through.
export { NEGATIVE, POSITIVE, STATUS_NAMES, doMove, strike, knockBack, shapePlan, footprintStep };
