import type {
  BattleAnim,
  BattleOrigin,
  BattleRewards,
  BattleState,
  BattleUnit,
  CharId,
  DungeonMonster,
  Element,
  MonsterId,
  RestiaState,
  SkillDef,
  StatKey,
  StatusId
} from "./types";
import { CHARACTERS, KAITO_BATTLE } from "../data/characters";
import { MONSTERS, monsterDef } from "../data/monsters";
import { SKILLS, skillDef } from "../data/skills";
import { ITEMS, itemDef } from "../data/items";
import { EVENT_ENCOUNTERS, themeForFloor } from "../data/dungeon";
import { ZONES } from "../data/zones";
import { Ctx, chance, clamp, count, fail, perk, random, randInt, removeItem } from "./core";
import { BOARD_COLS, BOARD_ROWS, cellOf, hexDistance, neighbors, reach } from "./hex";
import { activeLimit, gainExp, growStats, memberSkills, memberStats, petStats } from "./party";
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
  origin: BattleOrigin;
  canFlee: boolean;
  boss: boolean;
  initiative: "normal" | "preemptive" | "ambushed";
  soft?: boolean;
  winScene?: string;
  loseScene?: string;
};

const DEPLOY_ROWS = [3, 1, 5, 2, 4, 0, 6];
const NEGATIVE: StatusId[] = ["poison", "burn", "sleep", "stun", "slow", "freeze"];
const STATUS_NAMES: Record<StatusId, string> = { poison: "Poisoned", burn: "Burning", sleep: "Asleep", stun: "Stunned", slow: "Slowed", freeze: "Frozen" };

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

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
    statuses: [],
    mods: [],
    retaliated: false,
    defending: false,
    down: false,
    boss: false,
    tame: 0,
    exp: 0,
    gold: 0,
    drops: [],
    sprite: `restia-${id}`,
    scale: 1,
    magic: def.weapon === "staff"
  };
}

function monsterUnit(species: MonsterId, level: number, uid: string, side: "ally" | "enemy", cell: number): BattleUnit {
  const def = monsterDef(species);
  const stats = growStats(def.base, def.growth, level);
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
    statuses: [],
    mods: [],
    retaliated: false,
    defending: false,
    down: false,
    boss: !!def.boss,
    tame: def.tame,
    exp: Math.round(def.exp * (1 + 0.25 * (level - 1))),
    gold: Math.round(def.gold * (1 + 0.2 * (level - 1))),
    drops: def.drops,
    sprite: def.sprite,
    scale: def.scale ?? 1,
    magic: !!def.magic
  };
}

function rivalUnit(level: number, cell: number): BattleUnit {
  const stats = growStats(KAITO_BATTLE.base, KAITO_BATTLE.growth, level);
  return {
    uid: "e-kaito",
    side: "enemy",
    kind: "guest",
    ref: "kaito",
    name: "Kaito",
    level,
    stats,
    move: KAITO_BATTLE.move,
    range: KAITO_BATTLE.range,
    flying: false,
    hp: stats.maxHp,
    mp: stats.maxMp,
    cell,
    facing: "left",
    element: "phys",
    resist: {},
    skills: [...KAITO_BATTLE.skills],
    statuses: [],
    mods: [],
    retaliated: false,
    defending: false,
    down: false,
    boss: true,
    tame: 0,
    exp: 40 * level,
    gold: 0,
    drops: [],
    sprite: "restia-kaito",
    scale: 1,
    magic: false
  };
}

function aliveFighter(state: RestiaState, id: string): boolean {
  if (id.startsWith("pet:")) return (state.pets.find((pet) => `pet:${pet.uid}` === id)?.hp ?? 0) > 0;
  return (state.members[id as CharId]?.hp ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

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
  const units: BattleUnit[] = [];
  ids.forEach((id, index) => {
    const cell = cellOf(index < DEPLOY_ROWS.length ? 1 : 0, DEPLOY_ROWS[index % DEPLOY_ROWS.length]!);
    if (id.startsWith("pet:")) {
      const pet = state.pets.find((entry) => `pet:${entry.uid}` === id)!;
      const unit = monsterUnit(pet.species, pet.level, `a-pet-${pet.uid}`, "ally", cell);
      unit.name = pet.name;
      unit.hp = pet.hp;
      unit.mp = pet.mp;
      unit.stats = petStats(pet);
      unit.petUid = pet.uid;
      unit.boss = false;
      units.push(unit);
    } else {
      units.push(memberUnit(state, id as CharId, cell));
    }
  });
  spec.enemies.forEach((enemy, index) => {
    units.push(monsterUnit(enemy.species, enemy.level, `e${index}`, "enemy", cellOf(9, DEPLOY_ROWS[index % DEPLOY_ROWS.length]!)));
  });
  if (spec.rival) units.push(rivalUnit(Math.max(8, (state.members.bin?.level ?? 1) + 1), cellOf(9, 3)));
  const blocked: number[] = [];
  if (!spec.boss) {
    const obstacles = randInt(state, 0, 3);
    let guard = 0;
    while (blocked.length < obstacles && guard++ < 40) {
      const cell = cellOf(randInt(state, 3, 7), randInt(state, 0, BOARD_ROWS - 1));
      if (!blocked.includes(cell)) blocked.push(cell);
    }
  }
  for (const unit of units) {
    if (unit.kind !== "monster") continue;
    const entry = (state.bestiary[unit.ref] ??= { seen: 0, defeated: 0, analyzed: false });
    entry.seen += 1;
    if (perk(state, "autoAnalyze")) entry.analyzed = true;
  }
  const battle: BattleState = {
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    backdrop: spec.backdrop,
    blocked,
    units,
    round: 0,
    queue: [],
    active: null,
    turn: { moved: false, acted: false, waited: false },
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
  state.battle = battle;
  if (spec.initiative === "preemptive") battle.log.push("You caught them off guard! Your party moves first.");
  if (spec.initiative === "ambushed") battle.log.push("Ambush! The enemy moves first.");
  const anims: BattleAnim[] = [];
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
      initiative
    },
    ctx
  );
}

export function startDungeonBattle(state: RestiaState, monster: DungeonMonster, initiative: "preemptive" | "ambushed" | "normal", ctx: Ctx): void {
  const dungeon = state.dungeon!;
  const theme = themeForFloor(dungeon.floor);
  const boss = monster.boss;
  startBattle(
    state,
    {
      enemies: monster.group,
      backdrop: theme.backdrop,
      origin: { kind: "dungeon", monsterUid: monster.uid },
      canFlee: !boss,
      boss,
      initiative: boss ? "normal" : initiative,
      ...(boss && dungeon.floor === theme.boss.floor ? { winScene: theme.boss.winScene } : {})
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

function hasStatus(unit: BattleUnit, id: StatusId): boolean {
  return unit.statuses.some((status) => status.id === id);
}

export function eff(state: RestiaState, unit: BattleUnit, stat: StatKey): number {
  let value = unit.stats[stat];
  const pct = unit.mods.filter((mod) => mod.stat === stat).reduce((sum, mod) => sum + mod.pct, 0);
  value *= 1 + clamp(pct, -60, 150) / 100;
  if (unit.side === "ally" && (stat === "atk" || stat === "def") && hasBuff(state, "valor")) value *= 1.15;
  if (stat === "spd" && hasStatus(unit, "slow")) value *= 0.7;
  if ((stat === "def" || stat === "res") && unit.defending) value *= 1.5;
  return Math.max(0, value);
}

export function moveRange(unit: BattleUnit): number {
  return Math.max(1, unit.move - (hasStatus(unit, "slow") ? 1 : 0));
}

export function living(battle: BattleState): BattleUnit[] {
  return battle.units.filter((unit) => unit.hp > 0 && !unit.gone);
}

export function unitAt(battle: BattleState, cell: number): BattleUnit | undefined {
  return battle.units.find((unit) => unit.cell === cell && unit.hp > 0 && !unit.gone);
}

function findUnit(battle: BattleState, uid: string): BattleUnit {
  const unit = battle.units.find((entry) => entry.uid === uid);
  if (!unit) fail("No such unit.");
  return unit;
}

export function activeUnit(battle: BattleState): BattleUnit | null {
  return battle.active ? battle.units.find((unit) => unit.uid === battle.active) ?? null : null;
}

/** Cells the unit can move to this turn, each with its path. */
export function reachable(battle: BattleState, unit: BattleUnit): Map<number, number[]> {
  const passable = (cell: number) => {
    if (battle.blocked.includes(cell) && !unit.flying) return false;
    const other = unitAt(battle, cell);
    if (!other) return true;
    return unit.flying || other.side === unit.side;
  };
  const stoppable = (cell: number) => !battle.blocked.includes(cell) && !unitAt(battle, cell);
  return reach(unit.cell, moveRange(unit), passable, stoppable);
}

function elementMult(target: BattleUnit, element: Element): number {
  return target.resist[element] ?? 1;
}

function hitChance(state: RestiaState, attacker: BattleUnit, target: BattleUnit, physical: boolean): number {
  if (!physical) return 1;
  return clamp(0.95 + (eff(state, attacker, "luk") - eff(state, target, "luk")) * 0.005, 0.75, 0.99);
}

function rawDamage(state: RestiaState, attacker: BattleUnit, target: BattleUnit, power: number, physical: boolean): number {
  const a = physical ? eff(state, attacker, "atk") : eff(state, attacker, "mag");
  const d = physical ? eff(state, target, "def") : eff(state, target, "res");
  return a <= 0 ? 1 : (power * a * a) / (a + d);
}

export function expectedDamage(
  state: RestiaState,
  attacker: BattleUnit,
  target: BattleUnit,
  power: number,
  element: Element,
  physical: boolean,
  pointBlank: boolean
): number {
  const mult = elementMult(target, element);
  return rawDamage(state, attacker, target, power, physical) * mult * (target.down ? 1.25 : 1) * (pointBlank ? 0.5 : 1) * hitChance(state, attacker, target, physical);
}

function kill(unit: BattleUnit, anims: BattleAnim[]): void {
  unit.hp = 0;
  unit.statuses = [];
  unit.mods = [];
  unit.down = false;
  unit.defending = false;
  anims.push({ kind: "death", uid: unit.uid });
}

type StrikeOpts = { power: number; element: Element; physical: boolean; pointBlank?: boolean };

function strike(state: RestiaState, attacker: BattleUnit, target: BattleUnit, opts: StrikeOpts, anims: BattleAnim[]): number {
  if (!chance(state, hitChance(state, attacker, target, opts.physical))) {
    anims.push({ kind: "hit", uid: target.uid, amount: 0, crit: false, weak: false, resist: false, miss: true, heal: false });
    return 0;
  }
  const mult = elementMult(target, opts.element);
  if (mult === 0) {
    anims.push({ kind: "hit", uid: target.uid, amount: 0, crit: false, weak: false, resist: true, miss: false, heal: false });
    return 0;
  }
  const crit = chance(state, clamp(0.05 + eff(state, attacker, "luk") * 0.004, 0, 0.35));
  const variance = 0.9 + random(state) * 0.2;
  const damage = Math.max(
    1,
    Math.round(
      rawDamage(state, attacker, target, opts.power, opts.physical) *
        variance *
        mult *
        (crit ? 1.5 : 1) *
        (target.down ? 1.25 : 1) *
        (opts.pointBlank ? 0.5 : 1)
    )
  );
  target.hp = Math.max(0, target.hp - damage);
  const weak = mult > 1;
  anims.push({ kind: "hit", uid: target.uid, amount: damage, crit, weak, resist: mult < 1, miss: false, heal: false });
  target.statuses = target.statuses.filter((status) => status.id !== "sleep" && !(status.id === "freeze" && opts.element === "fire"));
  if (target.hp <= 0) {
    kill(target, anims);
  } else if (weak && !target.boss && !target.down) {
    target.down = true;
    anims.push({ kind: "status", uid: target.uid, text: "DOWN!" });
  }
  return damage;
}

/** Buffs/debuffs; one landing on the unit whose turn it is skips this turn's countdown. */
function addMods(battle: BattleState, target: BattleUnit, mods: SkillDef["mods"]): void {
  for (const mod of mods ?? []) target.mods.push({ ...mod, skip: target.uid === battle.active });
}

/**
 * Where a fallen unit stands up: its own hex, or (if someone moved onto the
 * corpse) the nearest free hex. null = the whole area is packed.
 */
export function revivalCell(battle: BattleState, target: BattleUnit): number | null {
  const free = (cell: number) => !battle.blocked.includes(cell) && !battle.units.some((unit) => unit !== target && unit.cell === cell && unit.hp > 0 && !unit.gone);
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

function addStatus(target: BattleUnit, id: StatusId, turns: number, anims: BattleAnim[]): void {
  if (target.hp <= 0) return;
  const existing = target.statuses.find((status) => status.id === id);
  if (existing) existing.turns = Math.max(existing.turns, turns);
  else target.statuses.push({ id, turns });
  anims.push({ kind: "status", uid: target.uid, text: STATUS_NAMES[id] });
}

function heal(target: BattleUnit, amount: number, anims: BattleAnim[]): void {
  const before = target.hp;
  target.hp = Math.min(target.stats.maxHp, target.hp + Math.max(0, Math.round(amount)));
  anims.push({ kind: "hit", uid: target.uid, amount: target.hp - before, crit: false, weak: false, resist: false, miss: false, heal: true });
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function newRound(state: RestiaState, battle: BattleState): void {
  battle.round += 1;
  battle.waited = [];
  for (const unit of battle.units) unit.retaliated = false;
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
  unit.statuses = unit.statuses
    .map((status) => (status.id === "poison" || status.id === "burn" || status.id === "slow" ? { ...status, turns: status.turns - 1 } : status))
    .filter((status) => status.turns > 0);
}

function beginTurn(state: RestiaState, battle: BattleState, anims: BattleAnim[], ctx: Ctx): void {
  let guard = 0;
  while (battle.phase === "turn") {
    if (guard++ > 200) throw new Error("Battle turn loop");
    if (!battle.queue.length) newRound(state, battle);
    const uid = battle.queue.shift();
    const unit = uid ? battle.units.find((entry) => entry.uid === uid) : undefined;
    if (!unit || unit.hp <= 0 || unit.gone) continue;
    battle.active = unit.uid;
    battle.turn = { moved: false, acted: false, waited: battle.waited.includes(unit.uid) };
    unit.defending = false;
    // Poison/burn bite once per round: not again when a unit returns after Wait.
    for (const status of battle.turn.waited ? [] : unit.statuses) {
      if (status.id !== "poison" && status.id !== "burn") continue;
      const damage = Math.max(1, Math.round(unit.stats.maxHp * (status.id === "poison" ? 0.08 : 0.06)));
      unit.hp = Math.max(0, unit.hp - damage);
      anims.push({ kind: "hit", uid: unit.uid, amount: damage, crit: false, weak: false, resist: false, miss: false, heal: false });
    }
    if (unit.hp <= 0) {
      kill(unit, anims);
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

function finishTurn(state: RestiaState, battle: BattleState, anims: BattleAnim[], ctx: Ctx): void {
  const unit = activeUnit(battle);
  if (unit) tickEndOfTurn(unit);
  battle.active = null;
  if (checkEnd(state, battle, ctx)) return;
  beginTurn(state, battle, anims, ctx);
}

function checkEnd(state: RestiaState, battle: BattleState, ctx: Ctx): boolean {
  if (battle.phase !== "turn") return true;
  const allies = living(battle).filter((unit) => unit.side === "ally");
  const enemies = living(battle).filter((unit) => unit.side === "enemy");
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
        member.hp = unit.hp;
        member.mp = unit.mp;
      }
    } else if (unit.petUid) {
      const pet = state.pets.find((entry) => entry.uid === unit.petUid);
      if (pet) {
        pet.hp = unit.hp;
        pet.mp = unit.mp;
      }
    }
  }
}

function victory(state: RestiaState, battle: BattleState, ctx: Ctx): void {
  copyBack(state, battle);
  const rewards: BattleRewards = { exp: 0, gold: 0, items: {}, levelUps: [], befriended: [] };
  const goldMult = (perk(state, "treasureSense") ? 1.25 : 1) * (hasBuff(state, "fortune") ? 1.3 : 1);
  const dropMult = perk(state, "treasureSense") ? 1.1 : 1;
  for (const unit of battle.units) {
    if (unit.side !== "enemy") continue;
    rewards.exp += unit.exp;
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
  rewards.exp = Math.round(rewards.exp * (perk(state, "quickLearner") ? 1.2 : 1));
  rewards.gold = Math.round(rewards.gold * goldMult);
  state.gold += rewards.gold;
  for (const [item, n] of Object.entries(rewards.items)) state.inventory[item] = (state.inventory[item] ?? 0) + n;
  const fought = new Set<string>();
  for (const unit of battle.units) {
    if (unit.side !== "ally") continue;
    const who = unit.kind === "member" ? unit.ref : `pet:${unit.petUid}`;
    fought.add(who);
    if (unit.hp <= 0 || unit.gone) continue;
    const up = gainExp(state, who, rewards.exp, ctx);
    if (up) rewards.levelUps.push({ who: unit.name, level: up.level });
  }
  for (const id of Object.keys(state.members)) {
    if (fought.has(id)) continue;
    const up = gainExp(state, id, Math.round(rewards.exp * 0.3), ctx);
    if (up) rewards.levelUps.push({ who: CHARACTERS[id as CharId].name, level: up.level });
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

export function battleMove(state: RestiaState, cell: number, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.moved || battle.turn.acted) fail("This unit already moved.");
  const path = reachable(battle, unit).get(cell);
  if (!path) fail("Can't move there.");
  const anims: BattleAnim[] = [];
  doMove(unit, path, anims);
  battle.turn.moved = true;
  ctx.events.push({ kind: "battle", anims });
}

function doMove(unit: BattleUnit, path: number[], anims: BattleAnim[]): void {
  if (!path.length) return;
  const previous = path.length > 1 ? path[path.length - 2]! : unit.cell;
  anims.push({ kind: "move", uid: unit.uid, path: [unit.cell, ...path] });
  unit.cell = path[path.length - 1]!;
  const from = previous % BOARD_COLS;
  const to = unit.cell % BOARD_COLS;
  if (to !== from) unit.facing = to > from ? "right" : "left";
}

function basicAttack(state: RestiaState, attacker: BattleUnit, target: BattleUnit, anims: BattleAnim[]): void {
  const distance = hexDistance(attacker.cell, target.cell);
  face(attacker, target.cell);
  anims.push({ kind: "attack", uid: attacker.uid, target: target.uid, anim: attacker.range > 1 && distance > 1 ? "shoot" : attacker.magic ? "cast" : "attack" });
  strike(state, attacker, target, { power: 1, element: attacker.element, physical: !attacker.magic, pointBlank: attacker.range > 1 && distance === 1 }, anims);
  const canRetaliate =
    distance === 1 &&
    target.hp > 0 &&
    !target.retaliated &&
    !target.down &&
    !target.statuses.some((status) => status.id === "sleep" || status.id === "stun" || status.id === "freeze");
  if (canRetaliate && attacker.hp > 0) {
    target.retaliated = true;
    face(target, attacker.cell);
    anims.push({ kind: "attack", uid: target.uid, target: attacker.uid, anim: "attack" });
    strike(state, target, attacker, { power: 0.5, element: target.element, physical: !target.magic }, anims);
  }
}

export function battleAttack(state: RestiaState, targetUid: string, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  const target = findUnit(battle, targetUid);
  if (target.side === unit.side || target.hp <= 0 || target.gone) fail("Pick an enemy.");
  if (hexDistance(unit.cell, target.cell) > unit.range) fail("Out of range.");
  const anims: BattleAnim[] = [];
  basicAttack(state, unit, target, anims);
  battle.log.push(`${unit.name} attacks ${target.name}.`);
  battle.turn.acted = true;
  finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

/** Units a skill would affect if aimed at `cell` (validates range and target). */
export function skillTargets(state: RestiaState, battle: BattleState, caster: BattleUnit, skill: SkillDef, cell: number): BattleUnit[] | string {
  const friendly = (unit: BattleUnit) => unit.side === caster.side;
  const all = battle.units.filter((unit) => !unit.gone);
  switch (skill.target) {
    case "self":
      return [caster];
    case "allAllies":
      return all.filter((unit) => friendly(unit) && (skill.kind === "revive" ? unit.hp <= 0 : unit.hp > 0));
    case "allEnemies":
      return all.filter((unit) => !friendly(unit) && unit.hp > 0);
    case "enemy": {
      if (hexDistance(caster.cell, cell) > skill.range) return "Out of range.";
      const target = all.find((unit) => unit.cell === cell && unit.hp > 0 && !friendly(unit));
      return target ? [target] : "Pick an enemy.";
    }
    case "ally": {
      if (hexDistance(caster.cell, cell) > skill.range) return "Out of range.";
      const target = all.find((unit) => unit.cell === cell && friendly(unit) && (skill.kind === "revive" ? unit.hp <= 0 : unit.hp > 0));
      return target ? [target] : skill.kind === "revive" ? "Pick a fallen ally." : "Pick an ally.";
    }
    case "area": {
      const center = skill.range === 0 ? caster.cell : cell;
      if (hexDistance(caster.cell, center) > skill.range) return "Out of range.";
      const hostileKind = skill.kind === "physical" || skill.kind === "magic" || skill.kind === "debuff";
      const hits = all.filter(
        (unit) => unit.hp > 0 && hexDistance(unit.cell, center) <= (skill.radius ?? 0) && (hostileKind ? !friendly(unit) : friendly(unit))
      );
      return hits.length ? hits : "No targets there.";
    }
  }
}

function applySkill(state: RestiaState, battle: BattleState, caster: BattleUnit, skill: SkillDef, cell: number, targets: BattleUnit[], anims: BattleAnim[], ctx: Ctx): void {
  caster.mp -= skill.mp;
  const first = targets[0];
  if (first && first !== caster) face(caster, first.cell);
  anims.push({ kind: "attack", uid: caster.uid, target: first?.uid ?? caster.uid, anim: skill.anim === "cast" ? "cast" : caster.range > 1 ? "shoot" : "attack" });
  if (skill.target === "area") anims.push({ kind: "area", cell: skill.range === 0 ? caster.cell : cell, radius: skill.radius ?? 0, element: skill.element ?? "phys" });
  battle.log.push(`${caster.name} uses ${skill.name}.`);
  for (const target of targets) {
    switch (skill.kind) {
      case "physical":
      case "magic": {
        const dealt = strike(state, caster, target, { power: skill.power ?? 1, element: skill.element ?? caster.element, physical: skill.kind === "physical" }, anims);
        if (dealt > 0 && target.hp > 0) {
          if (skill.status && chance(state, skill.status.chance)) addStatus(target, skill.status.id, skill.status.turns, anims);
          addMods(battle, target, skill.mods);
        }
        if (dealt > 0 && skill.drain) heal(caster, dealt * skill.drain, anims);
        break;
      }
      case "heal":
        heal(target, (skill.power ?? 1) * (eff(state, caster, "mag") + caster.level * 2), anims);
        if (skill.cure) target.statuses = target.statuses.filter((status) => !NEGATIVE.includes(status.id));
        addMods(battle, target, skill.mods);
        break;
      case "revive":
        target.cell = revivalCell(battle, target) ?? target.cell;
        target.hp = Math.max(1, Math.round(target.stats.maxHp * (skill.power ?? 0.5)));
        target.statuses = [];
        anims.push({ kind: "hit", uid: target.uid, amount: target.hp, crit: false, weak: false, resist: false, miss: false, heal: true });
        break;
      case "buff":
        addMods(battle, target, skill.mods);
        anims.push({ kind: "status", uid: target.uid, text: skill.name });
        break;
      case "debuff":
        addMods(battle, target, skill.mods);
        if (skill.status && chance(state, skill.status.chance)) addStatus(target, skill.status.id, skill.status.turns, anims);
        else if (!skill.mods?.length) anims.push({ kind: "hit", uid: target.uid, amount: 0, crit: false, weak: false, resist: false, miss: true, heal: false });
        break;
      case "analyze":
        if (target.kind === "monster") {
          const entry = (state.bestiary[target.ref] ??= { seen: 1, defeated: 0, analyzed: false });
          entry.analyzed = true;
          ctx.toast(`[SYSTEM] ${target.name} analyzed: weaknesses revealed.`, "system");
        }
        anims.push({ kind: "status", uid: target.uid, text: "Analyzed" });
        break;
    }
  }
}

export function battleSkill(state: RestiaState, skillId: string, cell: number, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  if (!unit.skills.includes(skillId)) fail("That unit doesn't know this skill.");
  const skill = skillDef(skillId);
  if (unit.mp < skill.mp) fail("Not enough MP.");
  const targets = skillTargets(state, battle, unit, skill, cell);
  if (typeof targets === "string") fail(targets);
  if (skill.kind === "revive" && targets.some((target) => revivalCell(battle, target) === null)) fail("There's no room around that fallen ally.");
  const anims: BattleAnim[] = [];
  applySkill(state, battle, unit, skill, cell, targets, anims, ctx);
  battle.turn.acted = true;
  finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

export function battleItem(state: RestiaState, itemId: string, cell: number, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
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
    if (hexDistance(unit.cell, cell) > 3) fail("Too far to throw (3 hexes).");
    removeItem(state, itemId, 1);
    anims.push({ kind: "attack", uid: unit.uid, target: unit.uid, anim: "attack" });
    anims.push({ kind: "area", cell, radius: use.bomb.radius, element: use.bomb.element });
    for (const target of living(battle).filter((entry) => entry.side !== unit.side && hexDistance(entry.cell, cell) <= use.bomb!.radius)) {
      const mult = elementMult(target, use.bomb.element);
      const damage = Math.max(1, Math.round(use.bomb.power * (25 + 4 * unit.level) * mult * (0.9 + random(state) * 0.2)));
      if (mult === 0) {
        anims.push({ kind: "hit", uid: target.uid, amount: 0, crit: false, weak: false, resist: true, miss: false, heal: false });
        continue;
      }
      target.hp = Math.max(0, target.hp - damage);
      anims.push({ kind: "hit", uid: target.uid, amount: damage, crit: false, weak: mult > 1, resist: mult < 1, miss: false, heal: false });
      if (target.hp <= 0) kill(target, anims);
      else if (use.bomb.status && chance(state, 0.35)) addStatus(target, use.bomb.status, use.bomb.status === "burn" ? 3 : 1, anims);
    }
  } else {
    if (hexDistance(unit.cell, cell) > 1) fail("Items reach yourself or an adjacent ally.");
    const target = battle.units.find((entry) => entry.cell === cell && entry.side === unit.side && !entry.gone && (use.revivePct ? entry.hp <= 0 : entry.hp > 0));
    if (!target) fail(use.revivePct ? "Pick a fallen ally next to you." : "Pick yourself or an adjacent ally.");
    if (!use.hp && !use.hpPct && !use.mp && !use.mpPct && !use.cure && !use.revivePct) fail(`${def.name} can't be used in battle.`);
    const revival = use.revivePct ? revivalCell(battle, target) : null;
    if (use.revivePct && revival === null) fail("There's no room around that fallen ally.");
    removeItem(state, itemId, 1);
    anims.push({ kind: "attack", uid: unit.uid, target: target.uid, anim: "cast" });
    if (use.revivePct) {
      target.cell = revival!;
      target.hp = Math.max(1, Math.round((target.stats.maxHp * use.revivePct) / 100));
      anims.push({ kind: "hit", uid: target.uid, amount: target.hp, crit: false, weak: false, resist: false, miss: false, heal: true });
    } else {
      if (use.hp || use.hpPct) heal(target, (use.hp ?? 0) + (target.stats.maxHp * (use.hpPct ?? 0)) / 100, anims);
      if (use.mp || use.mpPct) target.mp = Math.min(target.stats.maxMp, target.mp + (use.mp ?? 0) + Math.round((target.stats.maxMp * (use.mpPct ?? 0)) / 100));
      if (use.cure) target.statuses = [];
    }
  }
  battle.log.push(`${unit.name} uses ${def.name}.`);
  battle.turn.acted = true;
  finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

export function battleDefend(state: RestiaState, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.acted) fail("Already acted.");
  // Defending lasts until the unit's next turn starts (beginTurn clears it).
  unit.defending = true;
  const anims: BattleAnim[] = [{ kind: "status", uid: unit.uid, text: "Defending" }];
  battle.turn.acted = true;
  finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

export function battleWait(state: RestiaState, ctx: Ctx): void {
  const { battle, unit } = activeAlly(state);
  if (battle.turn.moved || battle.turn.acted) fail("Wait is only possible before moving or acting.");
  if (battle.turn.waited) fail("This unit already waited this round.");
  if (!battle.queue.length) fail("Everyone else has acted; end the turn instead.");
  battle.waited.push(unit.uid);
  battle.queue.push(unit.uid);
  battle.active = null;
  const anims: BattleAnim[] = [];
  beginTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

export function battleEndTurn(state: RestiaState, ctx: Ctx): void {
  const { battle } = activeAlly(state);
  const anims: BattleAnim[] = [];
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
  if (hexDistance(unit.cell, target.cell) > 1) fail("Get next to it first.");
  if (state.town.levels.barn < 1) fail("Build a Monster Barn first (Restoration Board).");
  if (state.pets.length >= barnCapacity(state)) fail("The barn is full.");
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
  battle.turn.acted = true;
  finishTurn(state, battle, anims, ctx);
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
  const anims: BattleAnim[] = [{ kind: "area", cell: cellOf(8, 3), radius: 3, element: "phys" }];
  for (const ally of living(battle).filter((entry) => entry.side === "ally")) {
    for (const enemy of living(battle).filter((entry) => entry.side === "enemy")) {
      anims.push({ kind: "attack", uid: ally.uid, target: enemy.uid, anim: "attack" });
      strike(state, ally, enemy, { power: 0.8, element: ally.element, physical: !ally.magic }, anims);
    }
  }
  for (const enemy of living(battle).filter((entry) => entry.side === "enemy")) enemy.down = false;
  battle.log.push(`${unit.name} leads an all-out RUSH!`);
  battle.turn.acted = true;
  finishTurn(state, battle, anims, ctx);
  ctx.events.push({ kind: "battle", anims });
}

// ---------------------------------------------------------------------------
// Enemy AI
// ---------------------------------------------------------------------------

type Plan = { score: number; cell: number; path: number[]; act: null | { kind: "attack"; target: BattleUnit } | { kind: "skill"; skill: SkillDef; cell: number; targets: BattleUnit[] } };

function evaluate(state: RestiaState, battle: BattleState, unit: BattleUnit, from: number, pathLength: number): Plan[] {
  const plans: Plan[] = [];
  const saved = unit.cell;
  unit.cell = from;
  const hostiles = living(battle).filter((entry) => entry.side !== unit.side);
  const friends = living(battle).filter((entry) => entry.side === unit.side);
  const nearHostile = hostiles.some((entry) => hexDistance(entry.cell, from) === 1);
  const cost = pathLength * 0.2 + (unit.range > 1 && nearHostile ? 8 : 0);
  for (const target of hostiles) {
    const distance = hexDistance(from, target.cell);
    if (distance > unit.range) continue;
    const damage = expectedDamage(state, unit, target, 1, unit.element, !unit.magic, unit.range > 1 && distance === 1);
    let score = damage + (damage >= target.hp ? 40 : 0) + (1 - target.hp / target.stats.maxHp) * 10;
    if (distance === 1 && !target.retaliated && !target.down) score -= expectedDamage(state, target, unit, 0.5, target.element, !target.magic, false) * 0.4;
    plans.push({ score: score - cost, cell: from, path: [], act: { kind: "attack", target } });
  }
  for (const id of unit.skills) {
    const skill = SKILLS[id];
    if (!skill || unit.mp < skill.mp || skill.kind === "analyze" || skill.kind === "revive") continue;
    const centers =
      skill.target === "enemy" || skill.target === "area"
        ? skill.range === 0
          ? [from]
          : hostiles.map((entry) => entry.cell)
        : skill.target === "ally"
          ? friends.map((entry) => entry.cell)
          : [from];
    for (const center of centers) {
      const targets = skillTargets(state, battle, unit, skill, center);
      if (typeof targets === "string" || !targets.length) continue;
      let value = 0;
      for (const target of targets) {
        if (skill.kind === "physical" || skill.kind === "magic") {
          const damage = expectedDamage(state, unit, target, skill.power ?? 1, skill.element ?? unit.element, skill.kind === "physical", false);
          value += damage + (damage >= target.hp ? 40 : 0) + (skill.status ? 10 * skill.status.chance : 0);
        } else if (skill.kind === "heal") {
          const missing = target.stats.maxHp - target.hp;
          if (target.hp < target.stats.maxHp * 0.7) value += Math.min(missing, (skill.power ?? 1) * (eff(state, unit, "mag") + unit.level * 2)) * 1.2;
        } else if (skill.kind === "buff") {
          const fresh = (skill.mods ?? []).some((mod) => !target.mods.some((existing) => existing.stat === mod.stat && existing.pct > 0));
          if (fresh && hostiles.some((entry) => hexDistance(entry.cell, target.cell) <= 6)) value += 12;
        } else if (skill.kind === "debuff") {
          const fresh = (skill.mods ?? []).some((mod) => !target.mods.some((existing) => existing.stat === mod.stat && existing.pct < 0));
          value += (fresh ? 10 : 0) + (skill.status ? 14 * skill.status.chance : 0);
        }
      }
      if (value <= 0) continue;
      plans.push({ score: value - skill.mp * 0.3 - cost, cell: from, path: [], act: { kind: "skill", skill, cell: center, targets } });
    }
  }
  unit.cell = saved;
  return plans;
}

export function aiTurn(state: RestiaState, ctx: Ctx): void {
  const battle = state.battle;
  if (!battle || battle.phase !== "turn") fail("No battle in progress.");
  const unit = activeUnit(battle);
  if (!unit || unit.side !== "enemy") fail("Not the enemy's turn.");
  const anims: BattleAnim[] = [];
  const options = new Map<number, number[]>([[unit.cell, []], ...reachable(battle, unit)]);
  let best: Plan | null = null;
  for (const [cell, path] of options) {
    for (const plan of evaluate(state, battle, unit, cell, path.length)) {
      if (!best || plan.score > best.score) best = { ...plan, path };
    }
  }
  if (best && best.act && best.score > 1) {
    doMove(unit, best.path, anims);
    if (best.act.kind === "attack") {
      basicAttack(state, unit, best.act.target, anims);
      battle.log.push(`${unit.name} attacks ${best.act.target.name}.`);
    } else {
      const targets = skillTargets(state, battle, unit, best.act.skill, best.act.cell);
      if (typeof targets !== "string") applySkill(state, battle, unit, best.act.skill, best.act.cell, targets, anims, ctx);
    }
  } else {
    // Close in on the nearest foe (ranged units try to stay at their range).
    const hostiles = living(battle).filter((entry) => entry.side !== unit.side);
    const want = unit.range > 1 ? unit.range : 1;
    let target: { cell: number; path: number[]; score: number } | null = null;
    for (const [cell, path] of options) {
      const nearest = Math.min(...hostiles.map((entry) => hexDistance(cell, entry.cell)));
      const score = Math.abs(nearest - want) * 10 + nearest + path.length * 0.01;
      if (!target || score < target.score) target = { cell, path, score };
    }
    if (target && target.path.length) doMove(unit, target.path, anims);
  }
  battle.turn.acted = true;
  finishTurn(state, battle, anims, ctx);
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

export { NEGATIVE, STATUS_NAMES };
