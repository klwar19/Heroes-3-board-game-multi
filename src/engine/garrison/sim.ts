/**
 * Garrison Wars simulation. Deterministic and tick based: the same config,
 * seed and command stream always produce the same game (online versus runs two
 * copies in lockstep), so nothing in here may read the clock, Math.random or
 * a transcendental Math function — only + - * / floor/round/min/max/abs/imul.
 *
 * `stepGarrison` mutates the state in place and leaves the tick's presentation
 * events in `state.events` for the renderer (sounds, FX, animation cues).
 */

import {
  BLESSINGS, BLESSING_ORDER, CARDS, DEFENDERS, ENEMIES, FIREBALL_DELAY, FIREBALL_DMG, FIRE_WALL_DELAY,
  FIRE_WALL_DMG, GW_COLS, LAND_MINE_ARM, LAND_MINE_DMG, MANA_MAX, MANA_REGEN_EVERY, PASSIVE_MIGHT,
  FIRE_SHOTS, SPELLS, STONE_SKIN_HP, TENT_INCOME, TERRAINS, fusionFor, sec,
  type BlessingId, type CardId, type DefDef, type DefKind, type EnemyKind, type ProjectileKind, type SpellId, type Terrain
} from "./content";

export type Side = "def" | "atk";
export type GarrisonMode = "adventure" | "endless" | "conveyor" | "raid" | "versus";

export type GarrisonConfig = {
  mode: GarrisonMode;
  levelId: string;
  title: string;
  seed: number;
  /** Active lanes (0 = top) out of GW_LANES. */
  lanes: number[];
  terrain: Terrain;
  cards: CardId[];
  spells: SpellId[];
  /** Attacker cards (versus / raid). "tent" places a Supply Tent. */
  atkCards: EnemyKind[];
  atkSpells: SpellId[];
  /** Wave director pool. */
  enemies: EnemyKind[];
  /** The level's new attacker: forced into wave 2 and every flag wave. */
  featured?: EnemyKind;
  /** Total waves (every 10th and the last are flag waves). 0 = no director. */
  waves: number;
  endless?: boolean;
  difficulty: number;
  startGold: number;
  startMight: number;
  startMana: number;
  firstWaveAt: number;
  boss?: "dracolich";
  /** Marches at the head of every great (flag) assault. */
  herald?: EnemyKind;
  /** Pre-placed defenders (raid puzzles). */
  preset?: { kind: DefKind; lane: number; col: number }[];
  chargers: boolean;
  /** Presentation only: the lane charger's sprite and the banner tint. */
  chargerSprite: string;
  bannerColor: string;
  /** Columns (inclusive) the defender may raise units in. */
  defCols: [number, number];
  /** Conveyor mode: cards arrive on a belt instead of costing gold. */
  conveyorPool?: CardId[];
  /** Raid puzzles: attackers may be mustered anywhere right of this x. */
  atkMinX?: number;
  /** Computer-controlled sides. */
  ai: { def: boolean; atk: boolean };
};

export type Defender = {
  id: number;
  kind: DefKind;
  lane: number;
  col: number;
  hp: number;
  maxHp: number;
  shell: number;
  cd: number;
  cd2: number;
  busyUntil: number;
  armedAt: number;
  cursedUntil: number;
  stunnedUntil: number;
  poisonUntil: number;
  poisonDps: number;
  /** Tick the next shot of the running volley leaves (-1 = none). */
  shotAt: number;
  shotsLeft: number;
  shots: number;
  strikes: number;
  raiseAt: number;
  mana: number;
  reborn: boolean;
  placedAt: number;
  dead: boolean;
};

export type EnemyState = "walk" | "eat" | "vault" | "cast" | "teleport" | "appear" | "flung" | "idle" | "glide" | "burrow";

export type Enemy = {
  id: number;
  kind: EnemyKind;
  lane: number;
  x: number;
  px: number;
  dir: 1 | -1;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  /** Headgear that takes every kind of damage first (EnemyDef.armor). */
  armor: number;
  maxArmor: number;
  /** EnemyDef.enrage has triggered. */
  enraged: boolean;
  /** Powder keg: ticks of fuse left (-1 = not lit). */
  fuse: number;
  /** Gold a cutpurse carries (dropped when it dies). */
  loot: number;
  /** Straight shots that reached it (a Spectre lets every Nth one through). */
  evades: number;
  state: EnemyState;
  stateAt: number;
  stateUntil: number;
  /** vault / flung / glide: where the move started and ends (x, or lane for a glide). */
  from: number;
  to: number;
  target: number;
  cd: number;
  cd2: number;
  shotAt: number;
  shotsLeft: number;
  chillUntil: number;
  slowUntil: number;
  freezeUntil: number;
  stunUntil: number;
  poisonUntil: number;
  poisonDps: number;
  vaulted: boolean;
  flung: boolean;
  reborn: boolean;
  bites: number;
  wave: number;
  side: "wave" | "atk";
  dead: boolean;
};

export type Projectile = {
  id: number;
  kind: ProjectileKind;
  side: Side;
  lane: number;
  x: number;
  px: number;
  dir: 1 | -1;
  dmg: number;
  speed: number;
  maxX: number;
  pierce: number;
  hit: number[];
  chill: boolean;
  freeze: boolean;
  burn: boolean;
  burnSplash: number;
  shatter: boolean;
  cloud: boolean;
  /** Straight shot that blows up on its first hit (defender side: damage to foes around it; attacker side: a flag). */
  blast: number;
  skipWalls: boolean;
  stun: { chance: number; dur: number } | null;
  manaOnHit: number;
  passed: number[];
  /** Lobbed: flight from `fromX` to the live target over `dur` ticks. */
  lob: { fromX: number; toX: number; t0: number; dur: number; targetId: number; splash: number; col: number; area: boolean } | null;
  dead: boolean;
};

export type Pickup = {
  id: number;
  x: number;
  /** Lane units: lane L spans [L, L+1). */
  y0: number;
  y: number;
  bornAt: number;
  landAt: number;
  expireAt: number;
  value: number;
  dead: boolean;
};

export type Blast = {
  id: number;
  kind: "fireball" | "fire-wall" | "eruption" | "death-breath";
  lane: number;
  x: number;
  at: number;
  dmg: number;
};

export type Charger = { lane: number; state: "ready" | "charging" | "gone"; x: number; px: number };
export type CardSlot = { id: CardId; readyAt: number };
export type AtkSlot = { id: EnemyKind; readyAt: number };

export type GarrisonEvent =
  | { e: "place"; id: number; kind: DefKind; lane: number; col: number }
  | { e: "upgrade"; id: number; kind: DefKind }
  | { e: "fuse"; id: number; kind: DefKind }
  | { e: "shell"; id: number }
  | { e: "dismiss"; id: number }
  | { e: "defShoot"; id: number }
  | { e: "defStrike"; id: number; target: number }
  | { e: "defHurt"; id: number }
  | { e: "defStun"; id: number }
  | { e: "defDie"; id: number; kind: DefKind; lane: number; col: number; crushed: boolean }
  | { e: "defRise"; id: number; kind: DefKind; how: "rebirth" | "resurrect" | "raise" }
  | { e: "gaze"; id: number; target: number }
  | { e: "stoneShot"; id: number; target: number }
  | { e: "heal"; id: number; target: number; amount: number }
  | { e: "slowCast"; id: number; targets: number[] }
  | { e: "banish"; id: number; target: number; lane: number; fromX: number }
  | { e: "lightning"; id: number; target: number; lane: number; x: number }
  | { e: "mine"; id: number; lane: number; x: number }
  | { e: "spawn"; id: number; kind: EnemyKind; side: "wave" | "atk" }
  | { e: "enemyHurt"; id: number; amount: number; burn: boolean }
  | { e: "shieldBreak"; id: number; kind: EnemyKind; lane: number; x: number; dir: 1 | -1 }
  | { e: "armorBreak"; id: number; kind: EnemyKind; lane: number; x: number; dir: 1 | -1 }
  | { e: "enrage"; id: number }
  | { e: "kegLit"; id: number }
  | { e: "keg"; id: number; lane: number; x: number }
  | { e: "stolen"; id: number; value: number }
  | { e: "hitscan"; id: number; target: number; lane: number; col: number; kind: "bullet" | "flame" }
  | { e: "flame"; id: number; target: number; lane: number; x: number }
  | { e: "evade"; id: number }
  | { e: "enemyBite"; id: number; target: number }
  | { e: "enemyCast"; id: number }
  | { e: "enemyHeal"; id: number; target: number }
  | { e: "atkLightning"; id: number; target: number; lane: number; col: number }
  | { e: "enemyDie"; id: number; kind: EnemyKind; lane: number; x: number; dir: 1 | -1; how: "normal" | "petrify" | "charge" | "burn" }
  | { e: "enemyRise"; id: number }
  | { e: "vault"; id: number }
  | { e: "surface"; id: number }
  | { e: "teleport"; id: number }
  | { e: "fling"; id: number; thrown: number }
  | { e: "projectileHit"; kind: ProjectileKind; lane: number; x: number; burn: boolean }
  | { e: "cloudHit"; kind: ProjectileKind; lane: number; x: number }
  | { e: "blast"; kind: Blast["kind"]; lane: number; x: number }
  | { e: "fireballAim"; lane: number; x: number }
  | { e: "charger"; lane: number }
  | { e: "coin"; id: number; value: number }
  | { e: "collect"; id: number; value: number; x: number; y: number }
  | { e: "income"; side: Side; value: number }
  | { e: "wave"; wave: number; flag: boolean }
  | { e: "hugeWave"; final: boolean }
  | { e: "spell"; side: Side; spell: SpellId; lane: number; x: number }
  | { e: "blessingOffer" }
  | { e: "blessing"; id: BlessingId }
  | { e: "bossAction"; action: "summon" | "breath" | "dragon" | "shift"; lane: number }
  | { e: "raided"; lane: number }
  | { e: "overtime" }
  | { e: "outcome"; winner: Side };

export type GarrisonState = {
  cfg: GarrisonConfig;
  tick: number;
  rng: number;
  nextId: number;
  def: {
    gold: number;
    cards: CardSlot[];
    mana: number;
    manaMax: number;
    manaAt: number;
    spellReady: Partial<Record<SpellId, number>>;
    hasteUntil: number;
    belt: { uid: number; card: CardId }[];
    beltAt: number;
    blessings: BlessingId[];
    offer: BlessingId[] | null;
    skyAt: number;
    sackAt: number;
    /** Recently destroyed defenders (Archangel resurrection). */
    fallen: { kind: DefKind; lane: number; col: number }[];
    /** Wraith bolts: mana gathered below one whole point. */
    manaFrac: number;
  };
  atk: {
    might: number;
    cards: AtkSlot[];
    mana: number;
    manaAt: number;
    spellReady: Partial<Record<SpellId, number>>;
    hasteUntil: number;
    mightAt: number;
    fallen: { kind: EnemyKind; lane: number }[];
    /** Raid puzzles: lanes already broken through. */
    raided: number[];
  };
  defenders: Defender[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  blasts: Blast[];
  chargers: Charger[];
  director: {
    wave: number;
    nextAt: number;
    hugeAt: number;
    waveHp: number;
    lastWaveAt: number;
    done: boolean;
    blessPending: boolean;
    laneWeights: number[];
  };
  boss: { id: number; nextAt: number; last: string } | null;
  bannersDown: number;
  overtime: boolean;
  outcome: { winner: Side; reason: string } | null;
  stats: { kills: number; placed: number; lost: number; goldEarned: number };
  events: GarrisonEvent[];
};

export type GarrisonCommand =
  | { t: "place"; card: CardId; lane: number; col: number; beltId?: number }
  | { t: "upgrade"; id: number }
  | { t: "dismiss"; id: number }
  | { t: "collect"; id: number }
  | { t: "cast"; side: Side; spell: SpellId; lane: number; x: number }
  | { t: "bless"; index: number }
  | { t: "muster"; kind: EnemyKind; lane: number; x?: number }
  | { t: "tent"; lane: number; col: number };

/** Commands tagged with the side that issued them (online: validated per seat). */
export type SidedCommand = GarrisonCommand & { by: Side };

export const SPAWN_X = 9.35;
const BANNER_X = 9.5;
const SIGHT_X = 9.15;
const OVERTIME_AT = sec(600);
const CHARGE_SPEED = 0.35;

// ---------------------------------------------------------------------------
// RNG (mulberry32 on an integer kept in the state)

function rand(s: GarrisonState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randInt(s: GarrisonState, lo: number, hi: number): number {
  return lo + Math.floor(rand(s) * (hi - lo + 1));
}

// ---------------------------------------------------------------------------
// Setup

export function createGarrison(cfg: GarrisonConfig): GarrisonState {
  const startAt = (recharge: number) => (recharge >= sec(30) ? Math.round(recharge * 0.5) : 0);
  const s: GarrisonState = {
    cfg,
    tick: 0,
    rng: cfg.seed | 0,
    nextId: 1,
    def: {
      gold: cfg.startGold,
      cards: cfg.cards.filter((id) => CARDS[id]).map((id) => ({ id, readyAt: startAt(CARDS[id]!.recharge) })),
      mana: cfg.startMana,
      manaMax: MANA_MAX,
      manaAt: MANA_REGEN_EVERY,
      spellReady: {},
      hasteUntil: 0,
      belt: [],
      beltAt: sec(2),
      blessings: [],
      offer: null,
      skyAt: sec(5),
      sackAt: sec(15),
      fallen: [],
      manaFrac: 0,
    },
    atk: {
      might: cfg.startMight,
      cards: cfg.atkCards.filter((id) => ENEMIES[id]).map((id) => ({ id, readyAt: startAt(ENEMIES[id]!.recharge) })),
      mana: cfg.mode === "versus" ? 5 : 0,
      manaAt: MANA_REGEN_EVERY,
      spellReady: {},
      hasteUntil: 0,
      mightAt: PASSIVE_MIGHT.every,
      fallen: [],
      raided: [],
    },
    defenders: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    blasts: [],
    chargers: cfg.chargers ? cfg.lanes.map((lane) => ({ lane, state: "ready" as const, x: -0.45, px: -0.45 })) : [],
    director: {
      wave: 0,
      nextAt: cfg.firstWaveAt,
      hugeAt: -1,
      waveHp: 0,
      lastWaveAt: 0,
      done: cfg.waves <= 0 && !cfg.endless,
      blessPending: false,
      laneWeights: [1, 1, 1, 1, 1],
    },
    boss: null,
    bannersDown: 0,
    overtime: false,
    outcome: null,
    stats: { kills: 0, placed: 0, lost: 0, goldEarned: 0 },
    events: [],
  };
  for (const unit of cfg.preset ?? []) {
    if (!cfg.lanes.includes(unit.lane) || !DEFENDERS[unit.kind]) continue;
    const placed = addDefender(s, unit.kind, unit.lane, unit.col);
    // A prepared garrison's mines are already primed.
    if (placed.kind === "mine") placed.armedAt = 0;
  }
  if (cfg.mode === "versus") {
    for (const lane of cfg.lanes) spawnEnemy(s, "banner", lane, BANNER_X, "atk");
  }
  if (cfg.boss === "dracolich") {
    const lane = cfg.lanes[Math.floor(cfg.lanes.length / 2)] ?? 2;
    const boss = spawnEnemy(s, "dracolich", lane, 8.95, "wave");
    boss.state = "idle";
    s.boss = { id: boss.id, nextAt: sec(12), last: "" };
  }
  s.events = [];
  return s;
}

function hpMult(s: GarrisonState): number {
  return s.def.blessings.includes("armor-of-wonder") ? 1.3 : 1;
}

function addDefender(s: GarrisonState, kind: DefKind, lane: number, col: number): Defender {
  const maxHp = Math.round(DEFENDERS[kind]!.hp * hpMult(s));
  const d: Defender = {
    id: s.nextId++, kind, lane, col, hp: maxHp, maxHp, shell: 0, cd: 0, cd2: 0, busyUntil: 0,
    armedAt: kind === "mine" ? s.tick + LAND_MINE_ARM : 0,
    cursedUntil: 0, stunnedUntil: 0, poisonUntil: 0, poisonDps: 0, shotAt: -1, shotsLeft: 0, shots: 0, strikes: 0,
    raiseAt: 0, mana: 0, reborn: false, placedAt: s.tick, dead: false,
  };
  resetDefenderTimers(s, d);
  s.defenders.push(d);
  return d;
}

function resetDefenderTimers(s: GarrisonState, d: Defender): void {
  const def = DEFENDERS[d.kind]!;
  d.cd = def.shot ? 12 : def.lightning ? sec(1) : def.banish ? sec(3) : def.flame ? sec(2) : 0;
  if (def.produce && !def.shot) d.cd = randInt(s, def.produce.first[0], def.produce.first[1]);
  d.cd2 = def.produce && def.shot ? randInt(s, def.produce.first[0], def.produce.first[1])
    : def.heal ? def.heal.every
    : def.stoneShot ? sec(4)
    : def.slowCast ? sec(2)
    : def.resurrect ? def.resurrect.every
    : 0;
}

function spawnEnemy(s: GarrisonState, kind: EnemyKind, lane: number, x: number, side: "wave" | "atk", wave = 0): Enemy {
  const def = ENEMIES[kind]!;
  const e: Enemy = {
    id: s.nextId++, kind, lane, x, px: x, dir: -1, hp: def.hp, maxHp: def.hp,
    shield: def.shield ?? 0, maxShield: def.shield ?? 0, armor: def.armor ?? 0, maxArmor: def.armor ?? 0,
    enraged: false, fuse: -1, loot: 0, evades: 0,
    state: def.structure ? "idle" : "walk", stateAt: s.tick, stateUntil: 0, from: x, to: x, target: 0,
    cd: kind === "tent" ? TENT_INCOME.every : def.ranged ? sec(1) : 0,
    cd2: def.heal ? def.heal.every : def.summon ? def.summon.every : def.revive ? def.revive.every : 0,
    shotAt: -1, shotsLeft: 0, chillUntil: 0, slowUntil: 0, freezeUntil: 0, stunUntil: 0, poisonUntil: 0, poisonDps: 0,
    vaulted: false, flung: false, reborn: false, bites: 0, wave, side, dead: false,
  };
  if (def.teleport) setState(s, e, "teleport", sec(0.9));
  if (def.burrow || def.dig) setState(s, e, "burrow");
  s.enemies.push(e);
  s.events.push({ e: "spawn", id: e.id, kind, side });
  return e;
}

function setState(s: GarrisonState, e: Enemy, state: EnemyState, duration = 0): void {
  e.state = state;
  e.stateAt = s.tick;
  e.stateUntil = duration > 0 ? s.tick + duration : 0;
}

// ---------------------------------------------------------------------------
// Queries shared with the UI and the AIs

export function isActiveLane(s: GarrisonState, lane: number): boolean {
  return s.cfg.lanes.includes(lane);
}

export function defenderAt(s: GarrisonState, lane: number, col: number): Defender | undefined {
  return s.defenders.find((d) => !d.dead && d.lane === lane && d.col === col);
}

export function tentAt(s: GarrisonState, lane: number, col: number): Enemy | undefined {
  return s.enemies.find((e) => !e.dead && e.kind === "tent" && e.lane === lane && Math.floor(e.x) === col);
}

/** Can the foe be struck by straight shots, melee and gazes right now? */
export function grounded(e: Enemy): boolean {
  return !e.dead && e.state !== "vault" && e.state !== "flung" && e.state !== "teleport" && e.state !== "glide" && e.state !== "burrow";
}

export function isStructure(e: Enemy): boolean {
  return ENEMIES[e.kind]?.structure === true;
}

/** A defender with nothing but a body: skipped by Mage bolts. */
export function isWall(def: DefDef): boolean {
  return !def.shot && !def.melee && !def.lightning && !def.gaze && !def.stoneShot && !def.banish && !def.slowCast
    && !def.heal && !def.produce && !def.ignite && !def.aura && !def.flame && !def.resurrect;
}

/** Structures (tents, banners) are only something to shoot at in versus. */
function shootable(s: GarrisonState, e: Enemy): boolean {
  return !e.dead && e.state !== "teleport" && e.state !== "glide" && e.state !== "burrow" && (!isStructure(e) || s.cfg.mode === "versus");
}

export type PlaceCheck =
  | { ok: true; action: "place" | "fuse" | "shell" | "spell"; target?: Defender; result?: DefKind; cost: number }
  | { ok: false; reason: string };

/** Everything the defender's "place card" command checks, for the hover preview too. */
export function checkPlace(s: GarrisonState, cardId: CardId, lane: number, col: number, beltId?: number): PlaceCheck {
  if (s.cfg.mode === "raid") return { ok: false, reason: "The defenders are fixed in this raid." };
  const card = CARDS[cardId];
  if (!card) return { ok: false, reason: "Unknown card." };
  let cost = card.cost;
  if (s.cfg.conveyorPool) {
    if (beltId === undefined || !s.def.belt.some((item) => item.uid === beltId && item.card === cardId)) return { ok: false, reason: "That card is not on the belt." };
    cost = 0;
  } else {
    const slot = s.def.cards.find((c) => c.id === cardId);
    if (!slot) return { ok: false, reason: "Card not in your hand." };
    if (slot.readyAt > s.tick) return { ok: false, reason: "Still recharging." };
    if (s.def.gold < cost) return { ok: false, reason: "Not enough gold." };
  }
  if (!isActiveLane(s, lane) || col < 0 || col >= GW_COLS) return { ok: false, reason: "Outside the field." };
  const here = defenderAt(s, lane, col);
  if (card.spell === "fire-wall") return { ok: true, action: "spell", cost };
  if (card.spell === "fireball") {
    const result = here ? fusionFor(here.kind, cardId) : null;
    if (here && result) return { ok: true, action: "fuse", target: here, result, cost };
    return { ok: true, action: "spell", cost };
  }
  if (card.spell === "stone-skin") {
    if (!here || here.kind === "mine") return { ok: false, reason: "Cast Stone Skin on one of your defenders." };
    return { ok: true, action: "shell", target: here, cost };
  }
  if (here) {
    const result = fusionFor(here.kind, cardId);
    return result ? { ok: true, action: "fuse", target: here, result, cost } : { ok: false, reason: "Tile taken." };
  }
  const [minCol, maxCol] = s.cfg.defCols;
  if (col < minCol || col > maxCol) return { ok: false, reason: "Your troops can't hold that ground." };
  if (tentAt(s, lane, col)) return { ok: false, reason: "An enemy tent stands there." };
  return { ok: true, action: "place", cost };
}

export function checkMuster(s: GarrisonState, kind: EnemyKind, lane: number, col?: number): { ok: true; cost: number } | { ok: false; reason: string } {
  if (s.cfg.mode !== "versus" && s.cfg.mode !== "raid") return { ok: false, reason: "You defend in this mode." };
  const slot = s.atk.cards.find((c) => c.id === kind);
  const def = ENEMIES[kind];
  if (!slot || !def) return { ok: false, reason: "Not in your warband." };
  if (slot.readyAt > s.tick) return { ok: false, reason: "Still mustering." };
  if (s.atk.might < def.might) return { ok: false, reason: "Not enough Might." };
  if (!isActiveLane(s, lane)) return { ok: false, reason: "Outside the field." };
  if (s.atk.raided.includes(lane)) return { ok: false, reason: "That lane is already broken." };
  if (kind === "tent") {
    if (s.cfg.mode !== "versus") return { ok: false, reason: "No tents in a raid." };
    if (col === undefined || col < 7 || col > 8) return { ok: false, reason: "Tents go in the two rightmost columns." };
    if (tentAt(s, lane, col) || defenderAt(s, lane, col)) return { ok: false, reason: "Tile taken." };
  }
  return { ok: true, cost: def.might };
}

export function checkCast(s: GarrisonState, side: Side, spell: SpellId, lane: number, x: number): { ok: true } | { ok: false; reason: string } {
  const def = SPELLS[spell];
  const pool = side === "def" ? s.cfg.spells : s.cfg.atkSpells;
  if (!def || def.side !== side || !pool.includes(spell)) return { ok: false, reason: "Unknown spell." };
  const book = side === "def" ? s.def : s.atk;
  if ((book.spellReady[spell] ?? 0) > s.tick) return { ok: false, reason: "Recovering." };
  if (book.mana < def.mana) return { ok: false, reason: "Not enough mana." };
  if (def.target !== "none" && !isActiveLane(s, lane)) return { ok: false, reason: "Outside the field." };
  if (def.target === "enemy" && !magicArrowTarget(s, lane, x)) return { ok: false, reason: "No foe there." };
  if (spell === "resurrection" && s.atk.fallen.length === 0) return { ok: false, reason: "Nobody has fallen yet." };
  return { ok: true };
}

function magicArrowTarget(s: GarrisonState, lane: number, x: number): Enemy | undefined {
  let best: Enemy | undefined;
  for (const e of s.enemies) {
    if (e.lane !== lane || !shootable(s, e)) continue;
    const reach = ENEMIES[e.kind]!.boss ? 1.6 : 1.2;
    const dist = Math.abs(e.x - x);
    if (dist <= reach && (!best || dist < Math.abs(best.x - x))) best = e;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Step

export function stepGarrison(s: GarrisonState, commands: readonly SidedCommand[]): void {
  s.events = [];
  if (s.outcome) return;
  if (s.def.offer) {
    for (const cmd of commands) if (cmd.t === "bless" && cmd.by === "def") applyCommand(s, cmd);
    return;
  }
  for (const cmd of commands) applyCommand(s, cmd);
  s.tick += 1;
  economy(s);
  director(s);
  bossAct(s);
  defendersAct(s);
  projectilesAct(s);
  enemiesAct(s);
  blastsAct(s);
  chargersAct(s);
  pickupsAct(s);
  cleanup(s);
  checkOutcome(s);
}

/** Online commands arrive as parsed JSON from the other browser: lanes/columns must be whole numbers, positions finite. */
function wellFormed(cmd: SidedCommand): boolean {
  if (!cmd || typeof cmd !== "object") return false;
  const whole = (n: unknown) => Number.isInteger(n);
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  switch (cmd.t) {
    case "place": return typeof cmd.card === "string" && whole(cmd.lane) && whole(cmd.col) && (cmd.beltId === undefined || whole(cmd.beltId));
    case "tent": return whole(cmd.lane) && whole(cmd.col);
    case "upgrade": case "dismiss": case "collect": return whole(cmd.id);
    case "bless": return whole(cmd.index);
    case "cast": return typeof cmd.spell === "string" && whole(cmd.lane) && finite(cmd.x);
    case "muster": return typeof cmd.kind === "string" && whole(cmd.lane) && (cmd.x === undefined || finite(cmd.x));
    default: return false;
  }
}

function applyCommand(s: GarrisonState, cmd: SidedCommand): void {
  if (!wellFormed(cmd)) return;
  switch (cmd.t) {
    case "place": {
      if (cmd.by !== "def") return;
      const check = checkPlace(s, cmd.card, cmd.lane, cmd.col, cmd.beltId);
      if (!check.ok) return;
      const card = CARDS[cmd.card]!;
      payCard(s, cmd.card, check.cost, cmd.beltId);
      if (check.action === "place" && card.places) {
        const d = addDefender(s, card.places, cmd.lane, cmd.col);
        s.stats.placed += 1;
        s.events.push({ e: "place", id: d.id, kind: d.kind, lane: d.lane, col: d.col });
      } else if (check.action === "fuse" && check.target && check.result) {
        transform(s, check.target, check.result, 0.5);
        s.events.push({ e: "fuse", id: check.target.id, kind: check.target.kind });
      } else if (check.action === "shell" && check.target) {
        check.target.shell = STONE_SKIN_HP;
        s.events.push({ e: "shell", id: check.target.id });
      } else if (check.action === "spell") {
        const x = cmd.col + 0.5;
        if (card.spell === "fireball") {
          s.blasts.push({ id: s.nextId++, kind: "fireball", lane: cmd.lane, x, at: s.tick + FIREBALL_DELAY, dmg: FIREBALL_DMG });
          s.events.push({ e: "fireballAim", lane: cmd.lane, x });
        } else if (card.spell === "fire-wall") {
          s.blasts.push({ id: s.nextId++, kind: "fire-wall", lane: cmd.lane, x, at: s.tick + FIRE_WALL_DELAY, dmg: FIRE_WALL_DMG });
        }
      }
      return;
    }
    case "upgrade": {
      if (cmd.by !== "def" || s.cfg.mode === "raid") return;
      const d = s.defenders.find((unit) => unit.id === cmd.id && !unit.dead);
      const up = d ? DEFENDERS[d.kind]!.upgrade : undefined;
      if (!d || !up || s.def.gold < up.cost) return;
      s.def.gold -= up.cost;
      transform(s, d, up.to, 0);
      s.events.push({ e: "upgrade", id: d.id, kind: d.kind });
      return;
    }
    case "dismiss": {
      if (cmd.by !== "def" || s.cfg.mode === "raid") return;
      const d = s.defenders.find((unit) => unit.id === cmd.id && !unit.dead);
      if (!d) return;
      d.dead = true;
      s.events.push({ e: "dismiss", id: d.id });
      return;
    }
    case "collect": {
      if (cmd.by !== "def") return;
      const p = s.pickups.find((item) => item.id === cmd.id && !item.dead);
      if (p) collectPickup(s, p);
      return;
    }
    case "cast": {
      if (cmd.by !== cmd.side) return;
      if (!checkCast(s, cmd.side, cmd.spell, cmd.lane, cmd.x).ok) return;
      castSpell(s, cmd.side, cmd.spell, cmd.lane, cmd.x);
      return;
    }
    case "bless": {
      if (cmd.by !== "def" || !s.def.offer) return;
      const id = s.def.offer[cmd.index];
      if (!id) return;
      grantBlessing(s, id);
      s.def.offer = null;
      s.director.nextAt = s.tick + sec(12);
      return;
    }
    case "muster": {
      if (cmd.by !== "atk" || cmd.kind === "tent") return;
      const check = checkMuster(s, cmd.kind, cmd.lane);
      if (!check.ok) return;
      payMuster(s, cmd.kind, check.cost);
      let x = SPAWN_X;
      if (s.cfg.mode === "raid") x = Math.min(9.2, Math.max(s.cfg.atkMinX ?? 6, cmd.x ?? 9.2));
      spawnEnemy(s, cmd.kind, cmd.lane, x, "atk");
      return;
    }
    case "tent": {
      if (cmd.by !== "atk") return;
      const check = checkMuster(s, "tent", cmd.lane, cmd.col);
      if (!check.ok) return;
      payMuster(s, "tent", check.cost);
      spawnEnemy(s, "tent", cmd.lane, cmd.col + 0.5, "atk");
      return;
    }
  }
}

/** Upgrade / fusion: a new unit in place, keeping its share of health. */
function transform(s: GarrisonState, d: Defender, kind: DefKind, minShare: number): void {
  const ratio = d.hp / d.maxHp;
  d.kind = kind;
  d.maxHp = Math.round(DEFENDERS[kind]!.hp * hpMult(s));
  d.hp = Math.max(1, Math.round(d.maxHp * Math.max(ratio, minShare)));
  d.shotAt = -1;
  d.shotsLeft = 0;
  d.busyUntil = 0;
  d.reborn = false;
  resetDefenderTimers(s, d);
}

function payCard(s: GarrisonState, cardId: CardId, cost: number, beltId?: number): void {
  if (s.cfg.conveyorPool) {
    s.def.belt = s.def.belt.filter((item) => item.uid !== beltId);
    return;
  }
  s.def.gold -= cost;
  const slot = s.def.cards.find((c) => c.id === cardId);
  if (slot) {
    const mult = s.def.blessings.includes("cards-of-prophecy") ? 0.7 : 1;
    slot.readyAt = s.tick + Math.round(CARDS[cardId]!.recharge * mult);
  }
}

function payMuster(s: GarrisonState, kind: EnemyKind, cost: number): void {
  s.atk.might -= cost;
  const slot = s.atk.cards.find((c) => c.id === kind);
  if (slot) slot.readyAt = s.tick + ENEMIES[kind]!.recharge;
}

// ---------------------------------------------------------------------------
// Damage

type EnemyHit = {
  straight?: boolean;
  fire?: boolean;
  spell?: boolean;
  melee?: boolean;
  fromDir?: 1 | -1;
  how?: "normal" | "petrify" | "charge" | "burn";
  /** Goes through headgear (an Arch-vile's flame rises from beneath). */
  pierce?: boolean;
};

function fireMult(s: GarrisonState): number {
  return s.def.blessings.includes("orb-of-fire") ? 1.5 : 1;
}

/** Deals damage to an attacker; returns the damage taken. */
function hurtEnemy(s: GarrisonState, e: Enemy, amount: number, hit: EnemyHit = {}): number {
  if (e.dead || amount <= 0) return 0;
  const def = ENEMIES[e.kind]!;
  let dmg = amount;
  if (hit.spell) {
    if (hit.fire && def.fireImmune) dmg *= 0.5;
    if (def.magicResist !== undefined) dmg *= def.magicResist;
    if (def.structure) dmg *= 0.5;
  }
  if (dmg <= 0) return 0;
  if (hit.straight && e.shield > 0 && hit.fromDir !== undefined && hit.fromDir !== e.dir) {
    const absorbed = Math.min(e.shield, dmg);
    e.shield -= absorbed;
    if (e.shield <= 0) {
      s.events.push({ e: "shieldBreak", id: e.id, kind: e.kind, lane: e.lane, x: e.x, dir: e.dir });
      if (def.enrage?.at === "break") enrageEnemy(s, e);
    }
    s.events.push({ e: "enemyHurt", id: e.id, amount: Math.round(absorbed), burn: false });
    return absorbed;
  }
  dmg = Math.round(dmg);
  // Headgear takes every kind of damage first; the breaking blow's overflow reaches the body.
  let absorbed = 0;
  if (e.armor > 0 && dmg > 0 && !hit.pierce) {
    absorbed = Math.min(e.armor, dmg);
    e.armor -= absorbed;
    dmg -= absorbed;
    if (e.armor <= 0) {
      e.armor = 0;
      s.events.push({ e: "armorBreak", id: e.id, kind: e.kind, lane: e.lane, x: e.x, dir: e.dir });
      if (def.enrage?.at === "break") enrageEnemy(s, e);
    }
  }
  e.hp -= dmg;
  s.events.push({ e: "enemyHurt", id: e.id, amount: dmg + absorbed, burn: hit.fire === true });
  if (e.hp <= 0) killEnemy(s, e, hit.how ?? (hit.fire ? "burn" : "normal"));
  else if (def.enrage?.at === "half" && e.hp < e.maxHp / 2) enrageEnemy(s, e);
  return dmg + absorbed;
}

function enrageEnemy(s: GarrisonState, e: Enemy): void {
  if (e.enraged || e.dead) return;
  e.enraged = true;
  s.events.push({ e: "enrage", id: e.id });
}

function killEnemy(s: GarrisonState, e: Enemy, how: "normal" | "petrify" | "charge" | "burn"): void {
  if (e.dead) return;
  const def = ENEMIES[e.kind]!;
  if (def.rebirth && !e.reborn && (how === "normal" || how === "burn")) {
    e.reborn = true;
    e.hp = e.maxHp;
    e.poisonUntil = 0;
    s.events.push({ e: "enemyRise", id: e.id });
    return;
  }
  e.dead = true;
  e.hp = 0;
  s.events.push({ e: "enemyDie", id: e.id, kind: e.kind, lane: e.lane, x: e.x, dir: e.dir, how });
  if (e.kind === "banner") {
    s.bannersDown += 1;
    return;
  }
  if (def.structure) return;
  s.stats.kills += 1;
  if (!def.boss) {
    s.atk.fallen.push({ kind: e.kind, lane: e.lane });
    if (s.atk.fallen.length > 12) s.atk.fallen.shift();
    raiseFromFallen(s, e);
  }
  if (s.def.blessings.includes("yawning-dead") && rand(s) < 0.2) {
    dropCoin(s, Math.min(8.6, Math.max(0.4, e.x)), e.lane + 0.35, e.lane + 0.75, 15);
  }
  // A cutpurse drops everything it stole.
  if (e.loot > 0) {
    dropCoin(s, Math.min(8.6, Math.max(0.4, e.x)), e.lane + 0.2, e.lane + 0.7, e.loot);
    e.loot = 0;
  }
  // A Pain Elemental bursts into Lost Souls (its lane first, then the neighbours).
  if (def.deathSpawn && ENEMIES[def.deathSpawn.kind] && how !== "charge" && e.x <= SPAWN_X) {
    const lanes = [e.lane, e.lane - 1, e.lane + 1].filter((lane) => isActiveLane(s, lane));
    for (let i = 0; i < def.deathSpawn.count && lanes.length > 0; i += 1) {
      const soul = spawnEnemy(s, def.deathSpawn.kind, lanes[i % lanes.length]!, Math.max(0.3, Math.min(SPAWN_X, e.x + 0.25 * i)), e.side, e.wave);
      s.events.push({ e: "enemyRise", id: soul.id });
    }
  }
  if (def.boss) {
    for (const other of s.enemies) if (!other.dead && other !== e && !isStructure(other)) killEnemy(s, other, "normal");
  }
}

/** Pit Lords raise a slain foe in their 3x3 as a defender. */
function raiseFromFallen(s: GarrisonState, e: Enemy): void {
  for (const d of s.defenders) {
    const raise = DEFENDERS[d.kind]!.raise;
    if (!raise || d.dead || s.tick < d.raiseAt) continue;
    if (Math.abs(e.lane - d.lane) > 1 || Math.abs(e.x - (d.col + 0.5)) > 1.5) continue;
    const col = Math.max(0, Math.min(GW_COLS - 1, Math.floor(e.x)));
    const [minCol, maxCol] = s.cfg.defCols;
    if (col < minCol || col > maxCol || defenderAt(s, e.lane, col) || tentAt(s, e.lane, col)) continue;
    const raised = addDefender(s, raise.kind, e.lane, col);
    d.raiseAt = s.tick + raise.every;
    s.events.push({ e: "defRise", id: raised.id, kind: raised.kind, how: "raise" });
    return;
  }
}

/** Petrify (Basilisk / Medusa / Gorgon): instant death, bosses take a fixed wound. */
function petrify(s: GarrisonState, e: Enemy, bossDmg: number): void {
  if (ENEMIES[e.kind]!.boss) {
    hurtEnemy(s, e, bossDmg * (s.def.blessings.includes("ogres-club") ? 1.5 : 1));
    return;
  }
  e.shield = 0;
  e.armor = 0;
  killEnemy(s, e, "petrify");
}

type DefHit = { crush?: boolean; atk?: boolean; magic?: boolean; cloud?: boolean };

function hurtDefender(s: GarrisonState, d: Defender, amount: number, hit: DefHit = {}): void {
  if (d.dead) return;
  const def = DEFENDERS[d.kind]!;
  if (hit.cloud && def.undead) return;
  if (hit.crush) {
    d.shell = 0;
    d.hp = 0;
  } else {
    let dmg = amount;
    if (hit.atk && s.def.blessings.includes("dragon-scale-shield")) dmg *= 0.75;
    if (hit.magic && def.magicResist !== undefined) dmg *= def.magicResist;
    dmg = Math.round(dmg);
    if (dmg <= 0) return;
    if (d.shell > 0) {
      const absorbed = Math.min(d.shell, dmg);
      d.shell -= absorbed;
      dmg -= absorbed;
    }
    d.hp -= dmg;
  }
  s.events.push({ e: "defHurt", id: d.id });
  if (d.hp > 0) return;
  if (def.rebirth && !d.reborn) {
    d.reborn = true;
    d.hp = d.maxHp;
    d.poisonUntil = 0;
    s.events.push({ e: "defRise", id: d.id, kind: d.kind, how: "rebirth" });
    return;
  }
  d.dead = true;
  s.stats.lost += 1;
  s.events.push({ e: "defDie", id: d.id, kind: d.kind, lane: d.lane, col: d.col, crushed: hit.crush === true });
  if (d.kind !== "mine") {
    s.def.fallen.push({ kind: d.kind, lane: d.lane, col: d.col });
    if (s.def.fallen.length > 20) s.def.fallen.shift();
  }
  if (def.deathBlast) s.blasts.push({ id: s.nextId++, kind: "eruption", lane: d.lane, x: d.col + 0.5, at: s.tick, dmg: def.deathBlast });
  if (def.deathSouls && def.shot) {
    // A Pain Elemental bursts: Lost Souls charge down its lane and the neighbouring ones.
    const lanes = [d.lane, d.lane - 1, d.lane + 1].filter((lane) => isActiveLane(s, lane));
    for (let i = 0; i < def.deathSouls && lanes.length > 0; i += 1) {
      s.projectiles.push(newProjectile(s, {
        kind: "soul", side: "def", lane: lanes[i % lanes.length]!, x: d.col + 0.5, dir: 1, dmg: def.shot.dmg, speed: SHOT_SPEED.soul
      }));
    }
  }
  if (s.cfg.mode === "raid" && def.produce) {
    s.atk.might += 75;
    s.events.push({ e: "income", side: "atk", value: 75 });
  }
}

// ---------------------------------------------------------------------------
// Economy

function economy(s: GarrisonState): void {
  const { def, atk, cfg } = s;
  const regen = def.blessings.includes("orb-of-mana") ? Math.round(MANA_REGEN_EVERY / 2) : MANA_REGEN_EVERY;
  if (cfg.spells.length > 0 && s.tick >= def.manaAt) {
    def.mana = Math.min(def.manaMax, def.mana + 1);
    def.manaAt = s.tick + regen;
  }
  if (cfg.atkSpells.length > 0 && s.tick >= atk.manaAt) {
    atk.mana = Math.min(MANA_MAX, atk.mana + 1);
    atk.manaAt = s.tick + MANA_REGEN_EVERY;
  }
  if (cfg.mode === "versus" && !s.overtime && s.tick >= OVERTIME_AT) {
    s.overtime = true;
    s.events.push({ e: "overtime" });
  }
  if (TERRAINS[cfg.terrain].skyGold && !cfg.conveyorPool && cfg.mode !== "raid" && !s.overtime && s.tick >= def.skyAt) {
    const lane = cfg.lanes[randInt(s, 0, cfg.lanes.length - 1)] ?? 2;
    dropCoin(s, 0.6 + rand(s) * 7.8, -0.6, lane + 0.55 + rand(s) * 0.3, 25);
    def.skyAt = s.tick + Math.round((sec(8) + randInt(s, 0, sec(4))) * (TERRAINS[cfg.terrain].skyRate ?? 1));
  }
  if (def.blessings.includes("sack-of-gold") && s.tick >= def.sackAt) {
    def.gold += 25;
    s.stats.goldEarned += 25;
    s.events.push({ e: "income", side: "def", value: 25 });
    def.sackAt = s.tick + sec(15);
  }
  if (cfg.mode === "versus" && s.tick >= atk.mightAt) {
    const value = PASSIVE_MIGHT.value * (s.overtime ? 2 : 1);
    atk.might += value;
    s.events.push({ e: "income", side: "atk", value });
    atk.mightAt = s.tick + PASSIVE_MIGHT.every;
  }
  if (cfg.conveyorPool && s.tick >= def.beltAt) {
    if (def.belt.length < 8) {
      const pool = cfg.conveyorPool;
      def.belt.push({ uid: s.nextId++, card: pool[randInt(s, 0, pool.length - 1)]! });
    }
    def.beltAt = s.tick + sec(s.tick < sec(40) ? 4.5 : 6.5);
  }
}

function dropCoin(s: GarrisonState, x: number, y0: number, y: number, value: number): void {
  const fall = Math.max(8, Math.round((y - y0) * 20));
  const p: Pickup = { id: s.nextId++, x, y0, y, value, bornAt: s.tick, landAt: s.tick + fall, expireAt: s.tick + fall + sec(10), dead: false };
  s.pickups.push(p);
  s.events.push({ e: "coin", id: p.id, value });
}

function collectPickup(s: GarrisonState, p: Pickup): void {
  if (p.dead) return;
  p.dead = true;
  s.def.gold += p.value;
  s.stats.goldEarned += p.value;
  s.events.push({ e: "collect", id: p.id, value: p.value, x: p.x, y: p.y });
}

function pickupsAct(s: GarrisonState): void {
  const auto = s.def.blessings.includes("estates") ? sec(1) : -1;
  for (const p of s.pickups) {
    if (p.dead) continue;
    if (s.tick >= p.expireAt) p.dead = true;
    else if (auto >= 0 && s.tick >= p.landAt + auto) collectPickup(s, p);
  }
}

// ---------------------------------------------------------------------------
// Waves

function isFlagWave(s: GarrisonState, wave: number): boolean {
  return wave % 10 === 0 || (!s.cfg.endless && wave === s.cfg.waves);
}

function waveBudget(s: GarrisonState, wave: number): number {
  const flags = Math.floor((wave - 1) / 10);
  const diff = s.cfg.difficulty * (s.cfg.endless ? 1 + flags * 0.18 : 1);
  // Ramps steeply for ten waves, then more gently, then gentler still after fifteen
  // (long campaign nights stay winnable; Endless still climbs through its flag multiplier).
  const growth = Math.min(wave, 10) * 0.6 + Math.min(5, Math.max(0, wave - 10)) * 0.45 + Math.max(0, wave - 15) * 0.3;
  const base = Math.max(1, Math.round((1 + growth) * diff));
  return isFlagWave(s, wave) ? Math.round(base * 2.5) : base;
}

function pickLane(s: GarrisonState): number {
  const weights = s.director.laneWeights;
  const lanes = s.cfg.lanes;
  let total = 0;
  for (const lane of lanes) total += weights[lane] ?? 1;
  let roll = rand(s) * total;
  let chosen = lanes[lanes.length - 1]!;
  for (const lane of lanes) {
    roll -= weights[lane] ?? 1;
    if (roll <= 0) {
      chosen = lane;
      break;
    }
  }
  for (const lane of lanes) weights[lane] = lane === chosen ? (weights[lane] ?? 1) * 0.4 : Math.min(1, (weights[lane] ?? 1) + 0.25);
  return chosen;
}

function spawnWave(s: GarrisonState, wave: number): void {
  const d = s.director;
  const flag = isFlagWave(s, wave);
  let budget = waveBudget(s, wave);
  const pool = s.cfg.enemies.filter((kind) => ENEMIES[kind]);
  const eligible = pool.filter((kind) => ENEMIES[kind]!.cost > 0 && ENEMIES[kind]!.cost <= 1 + wave * 0.9);
  const picks: EnemyKind[] = [];
  const featured = s.cfg.featured;
  if (featured && ENEMIES[featured] && (wave === 2 || flag) && ENEMIES[featured]!.cost <= Math.max(budget, 4)) {
    picks.push(featured);
    budget -= ENEMIES[featured]!.cost;
  }
  let guard = 0;
  while (budget > 0 && guard++ < 200) {
    const affordable = eligible.filter((kind) => ENEMIES[kind]!.cost <= budget);
    if (affordable.length === 0) break;
    let total = 0;
    const weights = affordable.map((kind) => {
      const w = 1 / (1 + ENEMIES[kind]!.cost * 0.15);
      total += w;
      return w;
    });
    let roll = rand(s) * total;
    let chosen = affordable[affordable.length - 1]!;
    for (let i = 0; i < affordable.length; i += 1) {
      roll -= weights[i]!;
      if (roll <= 0) {
        chosen = affordable[i]!;
        break;
      }
    }
    picks.push(chosen);
    budget -= ENEMIES[chosen]!.cost;
  }
  if (picks.length === 0) {
    const cheapest = [...pool].sort((a, b) => ENEMIES[a]!.cost - ENEMIES[b]!.cost)[0];
    if (cheapest) picks.push(cheapest);
  }
  let hp = 0;
  // A great assault marches behind its standard-bearer.
  const herald = s.cfg.herald;
  if (flag && herald && ENEMIES[herald]) {
    const e = spawnEnemy(s, herald, pickLane(s), SPAWN_X - 0.2, "wave", wave);
    hp += e.hp + e.shield + e.armor;
  }
  for (let i = 0; i < picks.length; i += 1) {
    const e = spawnEnemy(s, picks[i]!, pickLane(s), SPAWN_X + rand(s) * 0.9 + (flag ? Math.floor(i / 5) * 0.5 : 0), "wave", wave);
    hp += e.hp + e.shield + e.armor;
  }
  d.wave = wave;
  d.waveHp = hp;
  d.lastWaveAt = s.tick;
  d.nextAt = s.tick + sec(25) + randInt(s, 0, sec(6));
  s.events.push({ e: "wave", wave, flag });
  if (s.cfg.endless && flag) d.blessPending = true;
}

function remainingWaveHp(s: GarrisonState, wave: number): number {
  let hp = 0;
  for (const e of s.enemies) if (!e.dead && e.wave === wave) hp += Math.max(0, e.hp) + e.shield + e.armor;
  return hp;
}

function director(s: GarrisonState): void {
  const d = s.director;
  if (d.done || s.cfg.boss) return;
  if (d.blessPending) {
    if (s.enemies.some((e) => !e.dead && !isStructure(e))) return;
    d.blessPending = false;
    offerBlessings(s);
    return;
  }
  if (d.hugeAt >= 0) {
    if (s.tick >= d.hugeAt) {
      d.hugeAt = -1;
      spawnWave(s, d.wave + 1);
    }
    return;
  }
  const early = d.wave > 0 && s.tick - d.lastWaveAt >= sec(6) && remainingWaveHp(s, d.wave) <= d.waveHp * 0.5;
  if (s.tick < d.nextAt && !early) return;
  const next = d.wave + 1;
  if (!s.cfg.endless && next > s.cfg.waves) {
    d.done = true;
    return;
  }
  if (isFlagWave(s, next)) {
    d.hugeAt = s.tick + sec(6);
    d.nextAt = Number.MAX_SAFE_INTEGER;
    s.events.push({ e: "hugeWave", final: !s.cfg.endless && next === s.cfg.waves });
  } else {
    spawnWave(s, next);
  }
}

function offerBlessings(s: GarrisonState): void {
  const owned = new Set(s.def.blessings);
  const pool = BLESSING_ORDER.filter((id) => BLESSINGS[id].repeatable || !owned.has(id));
  const offer: BlessingId[] = [];
  while (offer.length < 3 && pool.length > 0) offer.push(pool.splice(randInt(s, 0, pool.length - 1), 1)[0]!);
  if (offer.length === 0) return;
  s.def.offer = offer;
  s.events.push({ e: "blessingOffer" });
}

function grantBlessing(s: GarrisonState, id: BlessingId): void {
  const first = !s.def.blessings.includes(id);
  if (first) s.def.blessings.push(id);
  if (id === "armor-of-wonder" && first) {
    for (const d of s.defenders) {
      if (d.dead) continue;
      const maxHp = Math.round(DEFENDERS[d.kind]!.hp * 1.3);
      d.hp = Math.round(d.hp * (maxHp / d.maxHp));
      d.maxHp = maxHp;
    }
  }
  if (id === "orb-of-mana") s.def.manaMax = MANA_MAX + 10;
  if (id === "lions-shield") {
    for (const c of s.chargers) if (c.state === "gone") Object.assign(c, { state: "ready", x: -0.45, px: -0.45 });
  }
  s.events.push({ e: "blessing", id });
}

// ---------------------------------------------------------------------------
// The Dracolich

const BOSS_SUMMONS: readonly EnemyKind[] = ["walking-dead", "skeleton", "zombie", "vampire", "skeleton-warrior", "mummy", "lich", "black-knight"];

function bossAct(s: GarrisonState): void {
  const b = s.boss;
  if (!b) return;
  const boss = s.enemies.find((e) => e.id === b.id);
  if (!boss || boss.dead) return;
  if ((boss.state === "glide" || boss.state === "cast") && s.tick >= boss.stateUntil) setState(s, boss, "idle");
  if (s.tick < b.nextAt || boss.state === "glide") return;
  const enraged = boss.hp < boss.maxHp / 2;
  const minutes = s.tick / sec(60);
  const options: ("summon" | "breath" | "dragon" | "shift")[] = ["summon", "summon", "breath"];
  if (b.last !== "shift" && s.cfg.lanes.length > 1) options.push("shift", "shift");
  if (b.last !== "" && b.last !== "dragon" && minutes >= 2) options.push("dragon");
  const action = options[randInt(s, 0, options.length - 1)]!;
  b.last = action;
  b.nextAt = s.tick + (enraged ? sec(9) : sec(12));
  s.events.push({ e: "bossAction", action, lane: boss.lane });
  if (action === "summon") {
    setState(s, boss, "cast", sec(1));
    const tier = Math.min(BOSS_SUMMONS.length, 3 + Math.floor(minutes * 1.2));
    const count = 2 + (enraged ? 1 : 0) + Math.min(2, Math.floor(minutes / 4));
    for (let i = 0; i < count; i += 1) {
      spawnEnemy(s, BOSS_SUMMONS[randInt(s, 0, tier - 1)]!, pickLane(s), SPAWN_X + rand(s) * 0.6, "wave");
    }
  } else if (action === "breath") {
    setState(s, boss, "cast", sec(1.5));
    // 200: a 300 HP shooter survives one breath (at full health) — stone skin and healers save the rest.
    s.blasts.push({ id: s.nextId++, kind: "death-breath", lane: boss.lane, x: boss.x, at: s.tick + sec(1.5), dmg: 200 });
  } else if (action === "dragon") {
    setState(s, boss, "cast", sec(1));
    const lanes = s.cfg.lanes.filter((lane) => lane !== boss.lane);
    const lane = lanes.length ? lanes[randInt(s, 0, lanes.length - 1)]! : boss.lane;
    const dragon = spawnEnemy(s, "bone-dragon", lane, 9.6, "wave");
    dragon.from = 9.6;
    dragon.to = 8.2;
    setState(s, dragon, "flung", sec(1));
  } else {
    const lanes = s.cfg.lanes.filter((lane) => lane !== boss.lane);
    boss.from = boss.lane;
    boss.to = lanes[randInt(s, 0, lanes.length - 1)]!;
    boss.lane = boss.to;
    setState(s, boss, "glide", sec(1.2));
  }
}

// ---------------------------------------------------------------------------
// Defenders

function has(s: GarrisonState, id: BlessingId): boolean {
  return s.def.blessings.includes(id);
}

function actRate(s: GarrisonState, d: Defender, auras: readonly Defender[]): number {
  if (d.stunnedUntil > s.tick) return 0;
  let rate = 1;
  if (s.def.hasteUntil > s.tick) rate *= 1.5;
  if (d.cursedUntil > s.tick) rate *= 0.5;
  if (has(s, "necklace-of-swiftness")) rate *= 1.2;
  let aura = 0;
  for (const a of auras) {
    if (a !== d && Math.abs(a.lane - d.lane) <= 1 && Math.abs(a.col - d.col) <= 1) aura = Math.max(aura, DEFENDERS[a.kind]!.aura ?? 0);
  }
  return rate * (1 + aura);
}

/** The closest shootable foe ahead of x within range in a lane. */
function firstAhead(s: GarrisonState, lane: number, fromX: number, range: number, preferMobile: boolean, skip?: (e: Enemy) => boolean): Enemy | undefined {
  let best: Enemy | undefined;
  let bestStructure: Enemy | undefined;
  for (const e of s.enemies) {
    if (e.lane !== lane || !shootable(s, e) || (skip && skip(e))) continue;
    if (e.x <= fromX - 0.2 || e.x > fromX + range || e.x > (isStructure(e) ? BANNER_X + 0.1 : SIGHT_X)) continue;
    if (isStructure(e)) {
      if (!bestStructure || e.x < bestStructure.x) bestStructure = e;
    } else if (!best || e.x < best.x) {
      best = e;
    }
  }
  if (preferMobile) return best ?? bestStructure;
  if (best && bestStructure) return best.x < bestStructure.x ? best : bestStructure;
  return best ?? bestStructure;
}

function canChill(e: Enemy): boolean {
  const def = ENEMIES[e.kind]!;
  return !def.frostImmune && !def.boss && !def.structure;
}

function canSlow(e: Enemy): boolean {
  const def = ENEMIES[e.kind]!;
  return !def.boss && !def.structure;
}

function defendersAct(s: GarrisonState): void {
  const regen = has(s, "vial-of-lifeblood") && s.tick % 4 === 0;
  const auras = s.defenders.filter((d) => !d.dead && DEFENDERS[d.kind]!.aura);
  const second = s.tick % 20 === 0;
  for (const d of s.defenders) {
    if (d.dead) continue;
    const def = DEFENDERS[d.kind]!;
    const centre = d.col + 0.5;
    if (regen && d.hp < d.maxHp && d.kind !== "mine") d.hp = Math.min(d.maxHp, d.hp + 1);
    if (second && d.poisonUntil > s.tick) {
      hurtDefender(s, d, d.poisonDps);
      if (d.dead) continue;
    }

    if (d.kind === "mine") {
      if (s.tick < d.armedAt) continue;
      const trigger = s.enemies.find((e) => e.lane === d.lane && grounded(e) && !isStructure(e) && !ENEMIES[e.kind]!.boss && Math.abs(e.x - centre) <= 0.5);
      if (trigger) {
        d.dead = true;
        s.events.push({ e: "mine", id: d.id, lane: d.lane, x: centre });
        for (const e of [...s.enemies]) {
          if (e.lane === d.lane && grounded(e) && !isStructure(e) && Math.abs(e.x - centre) <= 0.95) hurtEnemy(s, e, LAND_MINE_DMG, { spell: true });
        }
      }
      continue;
    }

    const rate = actRate(s, d, auras);
    if (rate <= 0) continue;

    if (def.produce && s.cfg.mode !== "raid") {
      const onSecond = def.shot !== undefined;
      const next = (onSecond ? d.cd2 : d.cd) - rate;
      if (next <= 0) {
        const lucky = def.produce.luck !== undefined && rand(s) < def.produce.luck;
        dropCoin(s, centre + (rand(s) - 0.5) * 0.4, d.lane + 0.25, d.lane + 0.7 + rand(s) * 0.15, def.produce.value * (lucky ? 2 : 1));
        if (def.produce.mana) s.def.mana = Math.min(s.def.manaMax, s.def.mana + def.produce.mana);
      }
      const reset = next <= 0 ? next + def.produce.every : next;
      if (onSecond) d.cd2 = reset;
      else d.cd = reset;
    }

    if (def.shot) shooterAct(s, d, rate);

    if (def.gaze && s.tick >= d.busyUntil && rate > 0) {
      let target: Enemy | undefined;
      for (const e of s.enemies) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e)) continue;
        const dx = e.x - centre;
        if (dx < -def.gaze.back || dx > def.gaze.front) continue;
        if (!target || Math.abs(dx) < Math.abs(target.x - centre)) target = e;
      }
      if (target) {
        s.events.push({ e: "gaze", id: d.id, target: target.id });
        petrify(s, target, def.gaze.bossDmg);
        d.busyUntil = s.tick + def.gaze.recover;
      }
    }

    if (def.melee) meleeAct(s, d, rate);

    if (def.heal) {
      d.cd2 -= rate;
      if (d.cd2 <= 0) {
        let target: Defender | undefined;
        for (const other of s.defenders) {
          if (other.dead || other.kind === "mine" || other.hp >= other.maxHp) continue;
          if (Math.abs(other.lane - d.lane) > 1 || Math.abs(other.col - d.col) > 1) continue;
          if (!target || other.maxHp - other.hp > target.maxHp - target.hp) target = other;
        }
        if (target) {
          const amount = Math.min(def.heal.amount, target.maxHp - target.hp);
          target.hp += amount;
          s.events.push({ e: "heal", id: d.id, target: target.id, amount });
          d.cd2 = def.heal.every;
        } else {
          d.cd2 = sec(1);
        }
      }
    }

    if (def.lightning) {
      d.cd -= rate;
      if (d.cd <= 0) {
        let target: Enemy | undefined;
        for (const e of s.enemies) {
          if (e.lane !== d.lane || !shootable(s, e) || e.x > (isStructure(e) ? BANNER_X + 0.1 : SIGHT_X) || e.x < -0.6) continue;
          if (!target || e.x < target.x) target = e;
        }
        if (target) {
          s.events.push({ e: "lightning", id: d.id, target: target.id, lane: target.lane, x: target.x });
          hurtEnemy(s, target, def.lightning.dmg * (has(s, "ogres-club") ? 1.5 : 1));
          d.cd = def.lightning.every;
        } else {
          d.cd = 0;
        }
      }
    }

    if (def.stoneShot) {
      d.cd2 -= rate;
      if (d.cd2 <= 0) {
        const target = firstAhead(s, d.lane, centre, def.stoneShot.range, true, isStructure);
        if (target) {
          s.events.push({ e: "stoneShot", id: d.id, target: target.id });
          petrify(s, target, def.stoneShot.bossDmg);
          d.cd2 = def.stoneShot.every;
        } else {
          d.cd2 = 0;
        }
      }
    }

    if (def.fear && s.tick % 10 === 0 && rate > 0) {
      for (const e of s.enemies) {
        if (e.lane !== d.lane || e.dead || !canSlow(e)) continue;
        const dx = e.x - centre;
        if (dx >= -0.3 && dx <= def.fear.range) e.slowUntil = Math.max(e.slowUntil, s.tick + 12);
      }
    }

    if (def.slowCast) {
      d.cd2 -= rate;
      if (d.cd2 <= 0) {
        const cast = def.slowCast;
        const lanes = cast.lanes === 3 ? [d.lane - 1, d.lane, d.lane + 1] : [d.lane];
        const targets = s.enemies
          .filter((e) => lanes.includes(e.lane) && shootable(s, e) && canSlow(e) && e.x > centre - 0.3 && e.x <= SIGHT_X && e.slowUntil <= s.tick + sec(2))
          .sort((a, b) => a.x - b.x)
          .slice(0, cast.count);
        if (targets.length > 0) {
          for (const e of targets) e.slowUntil = s.tick + cast.dur;
          s.events.push({ e: "slowCast", id: d.id, targets: targets.map((e) => e.id) });
          d.cd2 = cast.every;
        } else {
          d.cd2 = sec(1);
        }
      }
    }

    if (def.flame) {
      d.cd -= rate;
      if (d.cd <= 0) {
        // The healthiest foe within range ahead in its lane erupts in flame.
        let target: Enemy | undefined;
        for (const e of s.enemies) {
          if (e.lane !== d.lane || !shootable(s, e) || isStructure(e) || e.x > SIGHT_X) continue;
          const dx = e.x - centre;
          if (dx < -0.3 || dx > def.flame.range) continue;
          const bulk = e.hp + e.armor + e.shield;
          if (!target || bulk > target.hp + target.armor + target.shield) target = e;
        }
        if (target) {
          s.events.push({ e: "flame", id: d.id, target: target.id, lane: target.lane, x: target.x });
          hurtEnemy(s, target, def.flame.dmg * fireMult(s), { fire: true, pierce: true });
          d.cd = def.flame.every;
        } else {
          d.cd = sec(0.5);
        }
      }
    }

    if (def.resurrect) {
      d.cd2 -= rate;
      if (d.cd2 <= 0) {
        const fallen = s.def.fallen;
        let index = -1;
        for (let i = fallen.length - 1; i >= 0; i -= 1) {
          const f = fallen[i]!;
          if (Math.abs(f.lane - d.lane) <= 1 && Math.abs(f.col - d.col) <= 1 && !defenderAt(s, f.lane, f.col) && isActiveLane(s, f.lane)) {
            index = i;
            break;
          }
        }
        if (index >= 0) {
          const f = fallen.splice(index, 1)[0]!;
          const raised = addDefender(s, f.kind, f.lane, f.col);
          raised.hp = Math.max(1, Math.round(raised.maxHp / 2));
          s.events.push({ e: "defRise", id: raised.id, kind: raised.kind, how: "resurrect" });
          d.cd2 = def.resurrect.every;
        } else {
          d.cd2 = sec(2);
        }
      }
    }

    if (def.banish) {
      d.cd -= rate;
      if (d.cd <= 0) {
        const target = firstAhead(s, d.lane, centre, def.banish.range, true, (e) => isStructure(e) || ENEMIES[e.kind]!.boss === true);
        if (target) {
          s.events.push({ e: "banish", id: d.id, target: target.id, lane: target.lane, fromX: target.x });
          target.x = 8.9;
          target.px = 8.9;
          target.dir = -1;
          setState(s, target, "walk");
          if (def.banish.dmg > 0) hurtEnemy(s, target, def.banish.dmg, { spell: true, fire: true });
          d.cd = def.banish.every;
        } else {
          d.cd = 0;
        }
      }
    }
  }
}

function meleeAct(s: GarrisonState, d: Defender, rate: number): void {
  const def = DEFENDERS[d.kind]!;
  const m = def.melee!;
  // A unit that also shoots (War Zealot) keeps its melee on the second timer.
  const second = def.shot !== undefined;
  const timer = (second ? d.cd2 : d.cd) - rate;
  const setTimer = (value: number) => {
    if (second) d.cd2 = value;
    else d.cd = value;
  };
  setTimer(timer);
  if (timer > 0) return;
  const centre = d.col + 0.5;
  const lanes = m.lanes === 3 ? [d.lane - 1, d.lane, d.lane + 1] : [d.lane];
  let targets = s.enemies.filter((e) => {
    if (!lanes.includes(e.lane) || !grounded(e) || isStructure(e)) return false;
    const dx = e.x - centre;
    return m.front ? dx >= -0.3 && dx <= m.reach : Math.abs(dx) <= m.reach;
  });
  if (targets.length === 0) {
    setTimer(0);
    return;
  }
  if (m.single) {
    targets.sort((a, b) => Math.abs(a.x - centre) - Math.abs(b.x - centre));
    targets = targets.slice(0, 1);
  }
  d.strikes += 1;
  setTimer(m.every);
  s.events.push({ e: "defStrike", id: d.id, target: targets[0]!.id });
  const blow = m.blow && d.strikes % m.blow === 0 ? 3 : 1;
  const club = has(s, "ogres-club") ? 1.5 : 1;
  for (const e of targets) {
    const def = ENEMIES[e.kind]!;
    if (m.dispel && e.shield > 0) {
      e.shield = 0;
      s.events.push({ e: "shieldBreak", id: e.id, kind: e.kind, lane: e.lane, x: e.x, dir: e.dir });
      if (def.enrage?.at === "break") enrageEnemy(s, e);
    }
    const dealt = hurtEnemy(s, e, m.dmg * blow * club * (m.antiCavalry && def.cavalry ? 2 : 1), { melee: true });
    if (m.drain && dealt > 0) d.hp = Math.min(d.maxHp, d.hp + Math.round(dealt * m.drain));
    if (def.fireShield && dealt > 0) hurtDefender(s, d, dealt * def.fireShield, { atk: true });
    if (e.dead) continue;
    if (m.stun && !def.boss && !def.stunImmune && rand(s) < m.stun.chance) e.stunUntil = s.tick + m.stun.dur;
    if (m.poison) {
      e.poisonDps = e.poisonUntil > s.tick ? Math.max(e.poisonDps, m.poison.dps) : m.poison.dps;
      e.poisonUntil = s.tick + m.poison.dur;
    }
    if (m.chill && canChill(e)) e.chillUntil = s.tick + m.chill;
    if (d.dead) return;
  }
}

function shooterAct(s: GarrisonState, d: Defender, rate: number): void {
  const shot = DEFENDERS[d.kind]!.shot!;
  const centre = d.col + 0.5;
  if (d.shotAt >= 0 && s.tick >= d.shotAt) {
    releaseShot(s, d);
    d.shotsLeft -= 1;
    d.shotAt = d.shotsLeft > 0 ? s.tick + 5 : -1;
  }
  d.cd -= rate;
  if (d.cd > 0 || d.shotAt >= 0 || rate <= 0) return;
  const lanes = shot.lanes === 3 ? [d.lane - 1, d.lane, d.lane + 1].filter((lane) => isActiveLane(s, lane)) : [d.lane];
  const sees = lanes.some((lane) => firstAhead(s, lane, centre, shot.range, shot.lob === true) !== undefined);
  if (!sees) {
    d.cd = 0;
    return;
  }
  s.events.push({ e: "defShoot", id: d.id });
  d.shotAt = s.tick + Math.max(1, Math.round(shot.windup / Math.max(rate, 0.5)));
  d.shotsLeft = 1 + (shot.volley ?? 0);
  d.cd = shot.every;
}

function cloudImmune(e: Enemy): boolean {
  return ENEMIES[e.kind]!.undead === true;
}

/** A death cloud does not hurt the undead: it holds them (chilled 4 s). */
function holdUndead(s: GarrisonState, e: Enemy): void {
  if (canChill(e)) e.chillUntil = Math.max(e.chillUntil, s.tick + sec(4));
}

const SHOT_SPEED: Record<ProjectileKind, number> = {
  arrow: 0.32, stone: 0.26, frost: 0.28, bolt: 0.3, holy: 0.28, dark: 0.28, axe: 0.27, spear: 0.3, gift: 0.24, lightning: 0.4,
  fireball: 0, cloud: 0, boulder: 0,
  hellfire: 0.3, cacoball: 0.26, baronball: 0.28, plasma: 0.42, rocket: 0.34, bullet: 0.9, soul: 0.22
};

function newProjectile(s: GarrisonState, init: Partial<Projectile> & Pick<Projectile, "kind" | "side" | "lane" | "x" | "dir" | "dmg">): Projectile {
  return {
    id: s.nextId++, px: init.x, speed: 0, maxX: 10.4, pierce: 1, hit: [], chill: false, freeze: false, burn: false, burnSplash: 0,
    shatter: false, cloud: false, blast: 0, skipWalls: false, stun: null, manaOnHit: 0, passed: [], lob: null, dead: false,
    ...init,
  };
}

function releaseShot(s: GarrisonState, d: Defender): void {
  const shot = DEFENDERS[d.kind]!.shot!;
  const centre = d.col + 0.5;
  const bow = (shot.projectile === "arrow" || shot.projectile === "frost" || shot.projectile === "spear") && has(s, "elven-bow") ? 1.3 : 1;
  d.shots += 1;
  if (shot.lob) {
    const target = firstAhead(s, d.lane, centre, shot.range, true);
    if (!target) return;
    const dist = Math.max(0.5, target.x - centre);
    const fire = FIRE_SHOTS.has(shot.projectile) ? fireMult(s) : 1;
    s.projectiles.push(newProjectile(s, {
      kind: shot.projectile, side: "def", lane: d.lane, x: centre + 0.2, dir: 1, dmg: shot.dmg * fire, shatter: shot.shatter === true, cloud: shot.cloud === true,
      lob: { fromX: centre + 0.2, toX: target.x, t0: s.tick, dur: 16 + Math.round(dist * 2), targetId: target.id, splash: (shot.splash ?? 0) * fire, col: 0, area: false },
    }));
    return;
  }
  const lanes = shot.lanes === 3 ? [d.lane - 1, d.lane, d.lane + 1].filter((lane) => isActiveLane(s, lane)) : [d.lane];
  const freeze = shot.freezeEvery !== undefined && d.shots % shot.freezeEvery === 0;
  for (const lane of lanes) {
    s.projectiles.push(newProjectile(s, {
      kind: shot.projectile, side: "def", lane, x: centre + 0.3, dir: 1, dmg: shot.dmg * bow, speed: SHOT_SPEED[shot.projectile],
      maxX: shot.range < 9 ? centre + shot.range + 0.3 : 10.4, pierce: (shot.pierce ?? 1) + (has(s, "golden-bow") ? 1 : 0),
      chill: shot.chill === true, freeze, burn: shot.ignited === true, manaOnHit: shot.manaOnHit ?? 0,
      blast: (shot.splash ?? 0) * (FIRE_SHOTS.has(shot.projectile) ? fireMult(s) : 1),
    }));
  }
}

// ---------------------------------------------------------------------------
// Projectiles

function projectilesAct(s: GarrisonState): void {
  for (const p of s.projectiles) {
    if (p.dead) continue;
    p.px = p.x;
    if (p.lob) {
      lobAct(s, p);
      continue;
    }
    if (p.side === "atk") {
      attackerShotAct(s, p);
      continue;
    }
    const x0 = p.x;
    p.x += p.speed * p.dir;
    for (const d of s.defenders) {
      if (d.dead || d.lane !== p.lane || !DEFENDERS[d.kind]!.ignite || p.passed.includes(d.id)) continue;
      const c = d.col + 0.5;
      if (c > x0 && c <= p.x) {
        p.passed.push(d.id);
        p.chill = false;
        p.freeze = false;
        p.burn = true;
        p.burnSplash = Math.max(p.burnSplash, DEFENDERS[d.kind]!.ignite!.splash);
      }
    }
    const candidates = s.enemies
      .filter((e) => e.lane === p.lane && grounded(e) && shootable(s, e) && !p.hit.includes(e.id) && e.x > -0.6)
      .filter((e) => {
        const r = ENEMIES[e.kind]!.radius ?? 0.3;
        return e.x + r >= x0 && e.x - r <= p.x;
      })
      .sort((a, b) => a.x - b.x);
    for (const e of candidates) {
      const evade = ENEMIES[e.kind]!.evade;
      if (evade) {
        e.evades += 1;
        if (e.evades % evade === 0) {
          // A Spectre: this one goes right through.
          p.hit.push(e.id);
          s.events.push({ e: "evade", id: e.id });
          continue;
        }
      }
      projectileHit(s, p, e);
      p.hit.push(e.id);
      p.pierce -= 1;
      if (p.pierce <= 0) {
        p.dead = true;
        break;
      }
    }
    if (!p.dead && p.x > p.maxX) p.dead = true;
  }
}

function projectileHit(s: GarrisonState, p: Projectile, e: Enemy): void {
  const def = ENEMIES[e.kind]!;
  let dmg = p.dmg;
  if (p.burn && !def.fireImmune) dmg += p.dmg * fireMult(s);
  const fire = p.burn || FIRE_SHOTS.has(p.kind);
  const hitX = e.x;
  const dealt = hurtEnemy(s, e, dmg, { straight: true, fromDir: p.dir, fire });
  s.events.push({ e: "projectileHit", kind: p.kind, lane: p.lane, x: hitX, burn: p.burn });
  if (p.blast > 0) {
    // A rocket bursts: every other foe within a tile, in three lanes.
    const blast = p.blast;
    p.blast = 0;
    for (const other of [...s.enemies]) {
      if (other === e || other.dead || isStructure(other) || !grounded(other) || Math.abs(other.lane - p.lane) > 1 || Math.abs(other.x - hitX) > 1) continue;
      hurtEnemy(s, other, blast, { fire: true });
    }
  }
  if (p.manaOnHit > 0 && dealt > 0) gainManaFraction(s, p.manaOnHit);
  if (!e.dead && e.shield <= 0 && canChill(e)) {
    if (p.chill) e.chillUntil = s.tick + sec(10);
    if (p.freeze) e.freezeUntil = s.tick + sec(2);
  }
  if (p.burn && p.burnSplash > 0 && dealt > 0) {
    for (const other of [...s.enemies]) {
      if (other === e || other.dead || other.lane !== e.lane || !grounded(other) || isStructure(other)) continue;
      if (Math.abs(other.x - e.x) <= 0.9) hurtEnemy(s, other, dmg * p.burnSplash, { fire: true });
    }
  }
}

/** Wraith bolts: fractional mana for the defending hero. */
function gainManaFraction(s: GarrisonState, amount: number): void {
  s.def.manaFrac += amount;
  while (s.def.manaFrac >= 1) {
    s.def.manaFrac -= 1;
    s.def.mana = Math.min(s.def.manaMax, s.def.mana + 1);
  }
}

function lobAct(s: GarrisonState, p: Projectile): void {
  const lob = p.lob!;
  if (p.side === "def") {
    const target = s.enemies.find((e) => e.id === lob.targetId && !e.dead);
    if (target) {
      lob.toX = target.x;
      if (target.lane !== p.lane) p.lane = target.lane;
    }
  }
  const t = Math.max(0, Math.min(1, (s.tick - lob.t0) / lob.dur));
  p.x = lob.fromX + (lob.toX - lob.fromX) * t;
  if (t < 1) return;
  p.dead = true;
  if (p.side === "atk") {
    s.events.push({ e: "cloudHit", kind: p.kind, lane: p.lane, x: lob.col + 0.5 });
    for (const d of s.defenders) {
      if (d.dead || d.kind === "mine") continue;
      const inArea = lob.area ? Math.abs(d.lane - p.lane) <= 1 && Math.abs(d.col - lob.col) <= 1 : d.lane === p.lane && d.col === lob.col;
      if (inArea) hurtDefender(s, d, p.dmg, { atk: true, cloud: p.cloud, magic: p.cloud });
    }
    return;
  }
  let target = s.enemies.find((e) => e.id === lob.targetId && !e.dead);
  if (!target) {
    let best: Enemy | undefined;
    for (const e of [...s.enemies]) {
      if (e.lane !== p.lane || !shootable(s, e) || Math.abs(e.x - p.x) > 0.6) continue;
      if (!best || Math.abs(e.x - p.x) < Math.abs(best.x - p.x)) best = e;
    }
    target = best;
  }
  const fire = FIRE_SHOTS.has(p.kind);
  s.events.push({ e: "projectileHit", kind: p.kind, lane: p.lane, x: p.x, burn: fire });
  if (target && p.cloud && cloudImmune(target)) {
    holdUndead(s, target);
  } else if (target) {
    if (p.shatter && target.shield > 0) {
      target.shield = 0;
      s.events.push({ e: "shieldBreak", id: target.id, kind: target.kind, lane: target.lane, x: target.x, dir: target.dir });
      if (ENEMIES[target.kind]!.enrage?.at === "break") enrageEnemy(s, target);
    }
    hurtEnemy(s, target, p.dmg, { fire });
  }
  if (lob.splash > 0) {
    for (const e of [...s.enemies]) {
      if (e === target || e.dead || isStructure(e) || e.state === "burrow" || e.state === "teleport" || Math.abs(e.lane - p.lane) > 1) continue;
      if (Math.abs(e.x - p.x) > 1) continue;
      if (p.cloud && cloudImmune(e)) holdUndead(s, e);
      else hurtEnemy(s, e, lob.splash, { fire });
    }
  }
}

/** An attacker's arrow / bolt flying left: strikes the first defender in its way. */
function attackerShotAct(s: GarrisonState, p: Projectile): void {
  const x0 = p.x;
  p.x -= p.speed;
  let hit: Defender | undefined;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== p.lane || d.kind === "mine") continue;
    if (p.skipWalls && isWall(DEFENDERS[d.kind]!)) continue;
    // A Spectre is not there for the shooter: the shot passes through.
    if (DEFENDERS[d.kind]!.veiled) continue;
    const c = d.col + 0.5;
    if (c <= x0 + 0.2 && c >= p.x - 0.3 && (!hit || c > hit.col + 0.5)) hit = d;
  }
  if (hit) {
    p.dead = true;
    s.events.push({ e: "projectileHit", kind: p.kind, lane: p.lane, x: hit.col + 0.5, burn: false });
    if (p.blast > 0) {
      for (const d of s.defenders) {
        if (d === hit || d.dead || d.kind === "mine" || Math.abs(d.lane - hit.lane) > 1 || Math.abs(d.col - hit.col) > 1) continue;
        hurtDefender(s, d, p.dmg * 0.5, { atk: true });
      }
    }
    hurtDefender(s, hit, p.dmg, { atk: true });
    if (!hit.dead && p.stun && rand(s) < p.stun.chance) {
      hit.stunnedUntil = s.tick + p.stun.dur;
      s.events.push({ e: "defStun", id: hit.id });
    }
    return;
  }
  if (p.x < -0.8) p.dead = true;
}

// ---------------------------------------------------------------------------
// Attackers

function enemyRate(s: GarrisonState, e: Enemy, auraBonus: number): number {
  if (e.freezeUntil > s.tick || e.stunUntil > s.tick) return 0;
  let rate = 1;
  if (e.enraged) rate *= ENEMIES[e.kind]!.enrage?.mult ?? 1;
  if (e.chillUntil > s.tick || e.slowUntil > s.tick) rate *= 0.5;
  if (s.atk.hasteUntil > s.tick) rate *= 1.5;
  if (has(s, "shackles-of-war")) rate *= 0.85;
  return rate * (1 + auraBonus);
}

/** The defender this attacker is pressed against. */
function blocker(s: GarrisonState, e: Enemy): Defender | undefined {
  let best: Defender | undefined;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== e.lane) continue;
    if (d.kind === "mine" && s.tick >= d.armedAt) continue;
    const c = d.col;
    if (e.dir < 0) {
      if (e.x - 0.3 <= c + 0.85 && e.x > c + 0.2 && (!best || c > best.col)) best = d;
    } else if (e.x + 0.3 >= c + 0.15 && e.x < c + 0.8 && (!best || c < best.col)) {
      best = d;
    }
  }
  return best;
}

function reachGate(s: GarrisonState, e: Enemy): void {
  if (s.cfg.mode !== "raid" || e.x >= -0.3) return;
  if (!s.atk.raided.includes(e.lane)) {
    s.atk.raided.push(e.lane);
    s.events.push({ e: "raided", lane: e.lane });
  }
  e.dead = true;
}

function enemiesAct(s: GarrisonState): void {
  const second = s.tick % 20 === 0;
  const auraMap = new Map<number, number>();
  for (const a of s.enemies) {
    const aura = ENEMIES[a.kind]!.aura;
    if (!aura || a.dead) continue;
    for (const e of s.enemies) {
      if (e === a || e.dead || e.lane !== a.lane || Math.abs(e.x - a.x) > 1.5) continue;
      auraMap.set(e.id, Math.max(auraMap.get(e.id) ?? 0, aura));
    }
  }
  for (const e of s.enemies) {
    if (e.dead) continue;
    e.px = e.x;
    const def = ENEMIES[e.kind]!;
    if (def.boss) continue;
    if (e.kind === "tent") {
      e.cd -= 1;
      if (e.cd <= 0) {
        s.atk.might += TENT_INCOME.value;
        s.events.push({ e: "income", side: "atk", value: TENT_INCOME.value });
        e.cd = TENT_INCOME.every;
      }
      continue;
    }
    if (def.structure) continue;
    if (second) {
      if (def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + def.regen);
      if (e.poisonUntil > s.tick) {
        hurtEnemy(s, e, e.poisonDps);
        if (e.dead) continue;
      }
    }
    const rate = enemyRate(s, e, auraMap.get(e.id) ?? 0);

    // A lit powder keg burns down (held while frozen or stunned).
    if (e.fuse > 0) {
      e.fuse -= rate;
      if (e.fuse <= 0) {
        kegBlast(s, e);
        continue;
      }
    }

    switch (e.state) {
      case "teleport":
        if (s.tick >= e.stateUntil) {
          e.x = 0.25;
          e.px = e.x;
          e.dir = 1;
          setState(s, e, "appear", sec(0.7));
          s.events.push({ e: "teleport", id: e.id });
        }
        continue;
      case "appear":
        if (s.tick >= e.stateUntil) setState(s, e, "walk");
        continue;
      case "vault":
      case "flung": {
        const t = Math.min(1, (s.tick - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt));
        e.x = e.from + (e.to - e.from) * t;
        if (t >= 1) setState(s, e, "walk");
        continue;
      }
      case "burrow":
        burrowAct(s, e, rate);
        continue;
      case "idle":
        if (s.tick >= e.stateUntil) setState(s, e, "walk");
        continue;
      default:
        break;
    }

    if (def.heal && rate > 0) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) {
        let target: Enemy | undefined;
        for (const other of s.enemies) {
          if (other.dead || isStructure(other) || ENEMIES[other.kind]!.boss) continue;
          if (Math.abs(other.lane - e.lane) > 1 || Math.abs(other.x - e.x) > def.heal.range) continue;
          const hurt = other.maxHp - other.hp > 0 || other.chillUntil > s.tick || other.slowUntil > s.tick;
          if (hurt && (!target || other.maxHp - other.hp > target.maxHp - target.hp)) target = other;
        }
        if (target) {
          target.hp = Math.min(target.maxHp, target.hp + def.heal.amount);
          target.chillUntil = 0;
          target.slowUntil = 0;
          s.events.push({ e: "enemyHeal", id: e.id, target: target.id });
          e.cd2 = def.heal.every;
        } else {
          e.cd2 = sec(1);
        }
      }
    }

    if (def.summon && rate > 0) {
      e.cd2 -= rate;
      if (e.cd2 <= 0 && ENEMIES[def.summon.kind]) {
        if (!def.summonSpread) {
          spawnEnemy(s, def.summon.kind, e.lane, Math.min(SPAWN_X, e.x + 0.5), e.side, e.wave);
          s.events.push({ e: "enemyCast", id: e.id });
          e.cd2 = def.summon.every;
        } else if (e.x > SIGHT_X) {
          // Raises its escort only once it stands on the lawn.
          e.cd2 = sec(1);
        } else {
          const spots: [number, number][] = [[e.lane - 1, e.x], [e.lane + 1, e.x], [e.lane, e.x - 0.8]];
          for (const [lane, x] of spots) {
            if (isActiveLane(s, lane) && x >= 0.8) spawnEnemy(s, def.summon.kind, lane, Math.min(SPAWN_X, x), e.side, e.wave);
          }
          s.events.push({ e: "enemyCast", id: e.id });
          e.cd2 = def.summon.every;
        }
      }
    }

    if (def.revive && rate > 0 && e.x <= SIGHT_X) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) {
        const fallen = s.atk.fallen;
        let index = -1;
        for (let i = fallen.length - 1; i >= 0; i -= 1) {
          const f = ENEMIES[fallen[i]!.kind];
          if (f && !f.boss && !f.structure && !f.revive) {
            index = i;
            break;
          }
        }
        if (index >= 0) {
          const kind = fallen.splice(index, 1)[0]!.kind;
          const raised = spawnEnemy(s, kind, e.lane, Math.min(SPAWN_X, e.x + 0.4), e.side, e.wave);
          s.events.push({ e: "enemyRise", id: raised.id });
          s.events.push({ e: "enemyCast", id: e.id });
          e.cd2 = def.revive.every;
        } else {
          e.cd2 = sec(1);
        }
      }
    }

    if (def.fling && !e.flung && e.hp < e.maxHp / 2 && e.x > 3.5 && e.dir < 0 && rate > 0) {
      e.flung = true;
      setState(s, e, "idle", sec(1.2));
      const thrown = spawnEnemy(s, def.flingKind && ENEMIES[def.flingKind] ? def.flingKind : "skeleton", e.lane, e.x - 0.3, e.side, e.wave);
      thrown.from = e.x - 0.3;
      thrown.to = Math.max(1, Math.min(e.x - 3, 2.2 + rand(s) * 1.6));
      setState(s, thrown, "flung", sec(1));
      s.events.push({ e: "fling", id: e.id, thrown: thrown.id });
      continue;
    }

    if (def.ranged) {
      rangedAct(s, e, rate);
      continue;
    }

    const block = blocker(s, e);
    if (block) {
      if (def.vault && !e.vaulted && e.dir < 0) {
        e.vaulted = true;
        if (!DEFENDERS[block.kind]!.tall) {
          e.from = e.x;
          e.to = block.col - 0.05;
          setState(s, e, "vault", sec(0.8));
          s.events.push({ e: "vault", id: e.id });
          continue;
        }
      }
      if (e.state !== "eat" || e.target !== block.id) {
        setState(s, e, "eat");
        e.target = block.id;
        e.cd = def.smash ? sec(1.2) : 6;
      }
      if (def.keg && e.fuse < 0) {
        e.fuse = def.keg.fuse;
        s.events.push({ e: "kegLit", id: e.id });
      }
      e.cd -= rate;
      if (e.cd <= 0) {
        e.cd += def.biteEvery;
        biteAct(s, e, block);
      }
      continue;
    }

    if (e.state !== "walk") setState(s, e, "walk");
    const speed = def.vault && !e.vaulted ? def.vault.fastSpeed : def.speed;
    e.x += speed * rate * e.dir;
    if (e.dir > 0 && e.x >= 8.8) e.dir = -1;
    reachGate(s, e);
  }
}

function biteAct(s: GarrisonState, e: Enemy, block: Defender): void {
  const def = ENEMIES[e.kind]!;
  e.bites += 1;
  s.events.push({ e: "enemyBite", id: e.id, target: block.id });
  if (def.smash) {
    hurtDefender(s, block, 0, { crush: true, atk: true });
    return;
  }
  let dmg = def.bite;
  if (def.deathBlow && e.bites % def.deathBlow === 0) dmg *= 3;
  if (def.joust && e.bites === 1) dmg *= def.joust;
  const blockDef = DEFENDERS[block.kind]!;
  if (def.dispel) block.shell = 0;
  const victims: Defender[] = [block];
  if (def.cleave === "line") {
    const behind = defenderAt(s, block.lane, block.col + (e.dir < 0 ? -1 : 1));
    if (behind && behind.kind !== "mine") victims.push(behind);
  } else if (def.cleave === "lanes") {
    for (const lane of [block.lane - 1, block.lane + 1]) {
      const side = defenderAt(s, lane, block.col);
      if (side && side.kind !== "mine") victims.push(side);
    }
  }
  for (const v of victims) {
    const before = v.hp + v.shell;
    hurtDefender(s, v, dmg, { atk: true });
    const dealt = Math.max(0, before - Math.max(0, v.hp) - v.shell);
    if (v !== block) continue;
    if (def.drain && dealt > 0) e.hp = Math.min(e.maxHp, e.hp + Math.round(dealt * def.drain));
    if (v.dead) continue;
    if (def.curse) v.cursedUntil = s.tick + def.curse;
    if (def.poison) {
      v.poisonDps = v.poisonUntil > s.tick ? Math.max(v.poisonDps, def.poison.dps) : def.poison.dps;
      v.poisonUntil = s.tick + def.poison.dur;
    }
    if (def.stun && e.bites % def.stun.every === 0) {
      v.stunnedUntil = s.tick + def.stun.dur;
      s.events.push({ e: "defStun", id: v.id });
    }
  }
  if (def.manaDrain) s.def.mana = Math.max(0, s.def.mana - def.manaDrain);
  if (def.steal) {
    const taken = Math.min(s.def.gold, def.steal);
    if (taken > 0) {
      s.def.gold -= taken;
      e.loot += taken;
      s.events.push({ e: "stolen", id: e.id, value: taken });
    }
  }
  if (blockDef.chillBiters && canSlow(e)) e.slowUntil = Math.max(e.slowUntil, s.tick + blockDef.chillBiters);
  if (blockDef.thorns && !e.dead) hurtEnemy(s, e, blockDef.thorns * (has(s, "ogres-club") ? 1.5 : 1), { melee: true, fire: DEFENDERS[block.kind]!.ignite !== undefined });
}

/** The keg goes up: everything in the 3x3 around the carrier takes the blast, the carrier too. */
function kegBlast(s: GarrisonState, e: Enemy): void {
  const keg = ENEMIES[e.kind]!.keg!;
  e.fuse = -1;
  s.events.push({ e: "keg", id: e.id, lane: e.lane, x: e.x });
  for (const d of s.defenders) {
    if (d.dead || d.kind === "mine" || Math.abs(d.lane - e.lane) > 1 || Math.abs(d.col - Math.floor(e.x)) > 1) continue;
    hurtDefender(s, d, keg.dmg, { atk: true });
  }
  killEnemy(s, e, "burn");
}

/**
 * Earth Elementals: underground until they have passed beneath a defender.
 * Gravediggers (`dig`): underground all the way to the gate, then out behind the lines.
 */
function burrowAct(s: GarrisonState, e: Enemy, rate: number): void {
  const def = ENEMIES[e.kind]!;
  if (def.dig) {
    e.x -= def.dig.speed * rate;
    if (e.x <= 0.3) {
      e.x = 0.3;
      e.dir = 1;
      setState(s, e, "appear", sec(0.9));
      s.events.push({ e: "surface", id: e.id });
    }
    return;
  }
  const x0 = e.x;
  e.x -= def.burrow!.speed * rate;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== e.lane) continue;
    const c = d.col + 0.5;
    if (c <= x0 && c > e.x) e.vaulted = true;
  }
  const overlapping = s.defenders.some((d) => !d.dead && d.lane === e.lane && Math.abs(d.col + 0.5 - e.x) < 0.65);
  if ((e.vaulted && !overlapping) || e.x <= 1) {
    setState(s, e, "appear", sec(0.6));
    s.events.push({ e: "surface", id: e.id });
  }
}

function rangedAct(s: GarrisonState, e: Enemy, rate: number): void {
  const r = ENEMIES[e.kind]!.ranged!;
  const inRange = (d: Defender) => {
    const gap = (e.x - (d.col + 0.5)) * -e.dir;
    return gap >= -0.3 && gap <= r.range;
  };
  // It only stops to shoot once it is on the lawn, where the defenders can see it too.
  const onLawn = e.dir > 0 || e.x <= SIGHT_X - 0.25;
  const pickTarget = (): Defender | undefined => {
    if (!onLawn) return undefined;
    let best: Defender | undefined;
    let wall: Defender | undefined;
    for (const d of s.defenders) {
      if (d.dead || d.lane !== e.lane || d.kind === "mine" || !inRange(d)) continue;
      if (r.cloud && DEFENDERS[d.kind]!.undead) continue;
      if (DEFENDERS[d.kind]!.veiled) continue;
      const closer = (a: Defender | undefined) => !a || Math.abs(e.x - (d.col + 0.5)) < Math.abs(e.x - (a.col + 0.5));
      if (r.skipWalls && isWall(DEFENDERS[d.kind]!)) {
        if (closer(wall)) wall = d;
      } else if (closer(best)) {
        best = d;
      }
    }
    return best ?? wall;
  };
  if (e.shotAt >= 0 && s.tick >= e.shotAt) {
    const target = pickTarget();
    if (target) fireAttackerShot(s, e, target);
    e.shotsLeft -= 1;
    e.shotAt = e.shotsLeft > 0 ? s.tick + 5 : -1;
  }
  const target = pickTarget();
  if (!target) {
    if (e.shotAt >= 0) return;
    // Pressed against something it cannot shoot (a Lich before an undead wall, an
    // unarmed mine): it strikes it in melee instead of walking through.
    const block = blocker(s, e);
    if (block) {
      if (e.state !== "eat" || e.target !== block.id) {
        setState(s, e, "eat");
        e.target = block.id;
        e.cd = 6;
      }
      e.cd -= rate;
      if (e.cd <= 0) {
        e.cd += sec(1);
        e.bites += 1;
        s.events.push({ e: "enemyBite", id: e.id, target: block.id });
        hurtDefender(s, block, r.dmg, { atk: true });
      }
      return;
    }
    if (e.state !== "walk") setState(s, e, "walk");
    e.x += ENEMIES[e.kind]!.speed * rate * e.dir;
    if (e.dir > 0 && e.x >= 8.8) e.dir = -1;
    reachGate(s, e);
    return;
  }
  if (e.state !== "cast") {
    setState(s, e, "cast");
    e.cd = Math.min(e.cd, sec(1));
  }
  if (e.shotAt >= 0) return;
  e.cd -= rate;
  if (e.cd > 0) return;
  e.cd = r.every;
  s.events.push({ e: "enemyCast", id: e.id });
  e.shotAt = s.tick + 6;
  e.shotsLeft = 1 + (r.volley ?? 0);
}

function fireAttackerShot(s: GarrisonState, e: Enemy, target: Defender): void {
  const r = ENEMIES[e.kind]!.ranged!;
  if (r.hitscan) {
    s.events.push({ e: "hitscan", id: e.id, target: target.id, lane: target.lane, col: target.col, kind: r.hitscan });
    hurtDefender(s, target, r.dmg, { atk: true, magic: r.hitscan === "flame" });
    return;
  }
  if (r.spread) {
    // Mancubus volleys fan out: left + centre, centre + right, left + right.
    const volley = 1 + (r.volley ?? 0) - e.shotsLeft;
    const fans: readonly (readonly number[])[] = [[-1, 0], [0, 1], [-1, 1]];
    for (const offset of fans[((volley % 3) + 3) % 3]!) {
      const lane = e.lane + offset;
      if (!isActiveLane(s, lane)) continue;
      s.projectiles.push(newProjectile(s, {
        kind: r.projectile, side: "atk", lane, x: e.x - 0.3, dir: -1, dmg: r.dmg, speed: SHOT_SPEED[r.projectile] || 0.28
      }));
    }
    return;
  }
  if (r.lightning) {
    s.events.push({ e: "atkLightning", id: e.id, target: target.id, lane: target.lane, col: target.col });
    hurtDefender(s, target, r.dmg, { atk: true });
    return;
  }
  if (r.lob) {
    const dist = Math.abs(e.x - (target.col + 0.5));
    s.projectiles.push(newProjectile(s, {
      kind: r.projectile, side: "atk", lane: e.lane, x: e.x - 0.2, dir: -1, dmg: r.dmg, cloud: r.cloud === true,
      lob: { fromX: e.x - 0.2, toX: target.col + 0.5, t0: s.tick, dur: 16 + Math.round(dist * 2), targetId: target.id, splash: 0, col: target.col, area: r.splash === true },
    }));
    return;
  }
  s.projectiles.push(newProjectile(s, {
    kind: r.projectile, side: "atk", lane: e.lane, x: e.x - 0.3, dir: -1, dmg: r.dmg, speed: SHOT_SPEED[r.projectile] || 0.28,
    skipWalls: r.skipWalls === true && !isWall(DEFENDERS[target.kind]!), stun: r.stun ?? null, blast: r.blast ? 1 : 0,
  }));
}

// ---------------------------------------------------------------------------
// Spells, blasts, chargers

function castSpell(s: GarrisonState, side: Side, spell: SpellId, lane: number, x: number): void {
  const def = SPELLS[spell];
  const book = side === "def" ? s.def : s.atk;
  book.mana -= def.mana;
  book.spellReady[spell] = s.tick + def.cooldown;
  s.events.push({ e: "spell", side, spell, lane, x });
  const inArea = (e: Enemy) => !e.dead && Math.abs(e.lane - lane) <= 1 && Math.abs(e.x - x) <= 1.5 && e.state !== "teleport" && e.state !== "burrow";
  switch (spell) {
    case "magic-arrow": {
      const target = magicArrowTarget(s, lane, x);
      if (target) hurtEnemy(s, target, 150, { spell: true });
      return;
    }
    case "frost-ring":
      for (const e of [...s.enemies]) {
        if (!inArea(e)) continue;
        hurtEnemy(s, e, 40, { spell: true });
        if (!e.dead && canChill(e) && (ENEMIES[e.kind]!.magicResist ?? 1) > 0) e.freezeUntil = s.tick + sec(5);
      }
      return;
    case "meteor-shower":
      for (const e of [...s.enemies]) if (inArea(e)) hurtEnemy(s, e, 500, { spell: true });
      return;
    case "haste":
      s.def.hasteUntil = s.tick + sec(10);
      return;
    case "armageddon":
      for (const e of [...s.enemies]) if (!e.dead && e.state !== "teleport" && e.state !== "burrow") hurtEnemy(s, e, 800 * fireMult(s), { spell: true, fire: true });
      for (const d of s.defenders) if (!d.dead && d.kind !== "mine") hurtDefender(s, d, 150, { magic: true });
      return;
    case "earthquake":
      for (const d of s.defenders) if (!d.dead && d.kind !== "mine") hurtDefender(s, d, 60, { magic: true });
      return;
    case "war-cry":
      s.atk.hasteUntil = s.tick + sec(8);
      return;
    case "resurrection": {
      const raised = s.atk.fallen.splice(Math.max(0, s.atk.fallen.length - 3));
      const x0 = s.cfg.mode === "raid" ? 9 : SPAWN_X;
      for (const body of raised) if (isActiveLane(s, body.lane) && !s.atk.raided.includes(body.lane)) spawnEnemy(s, body.kind, body.lane, x0, "atk");
      return;
    }
  }
}

function blastsAct(s: GarrisonState): void {
  if (s.blasts.length === 0) return;
  const due = s.blasts.filter((b) => b.at <= s.tick);
  if (due.length === 0) return;
  s.blasts = s.blasts.filter((b) => b.at > s.tick);
  for (const b of due) {
    s.events.push({ e: "blast", kind: b.kind, lane: b.lane, x: b.x });
    if (b.kind === "death-breath") {
      for (const d of s.defenders) if (!d.dead && d.lane === b.lane && d.kind !== "mine") hurtDefender(s, d, b.dmg, { atk: true, magic: true });
      continue;
    }
    const dmg = b.dmg * fireMult(s);
    for (const e of [...s.enemies]) {
      if (e.dead || e.state === "teleport" || e.state === "burrow") continue;
      const inside = b.kind === "fire-wall"
        ? e.lane === b.lane && e.x < 10
        : Math.abs(e.lane - b.lane) <= 1 && Math.abs(e.x - b.x) <= 1.5;
      if (inside) hurtEnemy(s, e, dmg, { spell: true, fire: true });
    }
  }
}

function chargersAct(s: GarrisonState): void {
  for (const c of s.chargers) {
    c.px = c.x;
    if (c.state === "ready") {
      const breach = s.enemies.some((e) => !e.dead && e.lane === c.lane && !isStructure(e) && !ENEMIES[e.kind]!.boss && e.dir < 0 && e.x < 0.05
        && e.state !== "teleport" && e.state !== "burrow");
      if (breach) {
        c.state = "charging";
        s.events.push({ e: "charger", lane: c.lane });
      }
      continue;
    }
    if (c.state !== "charging") continue;
    c.x += CHARGE_SPEED;
    for (const e of s.enemies) {
      if (e.dead || e.lane !== c.lane || isStructure(e) || ENEMIES[e.kind]!.boss || e.state === "teleport" || e.state === "burrow") continue;
      if (Math.abs(e.x - c.x) <= 0.6) killEnemy(s, e, "charge");
    }
    if (c.x > 10.5) c.state = "gone";
  }
}

// ---------------------------------------------------------------------------
// Cleanup and outcome

function cleanup(s: GarrisonState): void {
  if (s.defenders.some((d) => d.dead)) s.defenders = s.defenders.filter((d) => !d.dead);
  if (s.enemies.some((e) => e.dead)) s.enemies = s.enemies.filter((e) => !e.dead);
  if (s.projectiles.some((p) => p.dead)) s.projectiles = s.projectiles.filter((p) => !p.dead);
  if (s.pickups.some((p) => p.dead)) s.pickups = s.pickups.filter((p) => !p.dead);
}

function finish(s: GarrisonState, winner: Side, reason: string): void {
  s.outcome = { winner, reason };
  s.events.push({ e: "outcome", winner });
}

function checkOutcome(s: GarrisonState): void {
  const { cfg } = s;
  if (cfg.mode === "raid") {
    if (cfg.lanes.every((lane) => s.atk.raided.includes(lane))) return finish(s, "atk", "Every lane has been broken.");
    const open = s.atk.cards.filter((c) => c.id !== "tent").map((c) => ENEMIES[c.id]!.might);
    const cheapest = open.length ? Math.min(...open) : Number.MAX_SAFE_INTEGER;
    const marching = s.enemies.some((e) => !isStructure(e));
    // Resurrection can still raise the fallen (mana keeps regenerating).
    const canRaise = cfg.atkSpells.includes("resurrection") && s.atk.fallen.length > 0;
    if (!marching && !canRaise && s.atk.might < cheapest) finish(s, "def", "Your Might ran dry and the raid stalled.");
    return;
  }
  for (const e of s.enemies) {
    if (isStructure(e) || ENEMIES[e.kind]!.boss) continue;
    if (e.x < -0.55 && e.dir < 0) {
      const c = s.chargers.find((charger) => charger.lane === e.lane);
      if (!c || c.state !== "ready") return finish(s, "atk", "The attackers broke through the gate.");
    }
  }
  if (cfg.mode === "versus") {
    const needed = Math.min(3, cfg.lanes.length);
    if (s.bannersDown >= needed) finish(s, "def", `${needed} war banners have fallen.`);
    return;
  }
  if (cfg.boss) {
    if (s.boss && !s.enemies.some((e) => e.id === s.boss!.id)) finish(s, "def", "The Dracolich is destroyed.");
    return;
  }
  if (s.director.done && !s.enemies.some((e) => !isStructure(e)) && s.blasts.length === 0) {
    finish(s, "def", "The assault is broken.");
  }
}

// ---------------------------------------------------------------------------
// Online lockstep helpers

/** A compact checksum of the simulation (desync detection). */
export function garrisonHash(s: GarrisonState): number {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= Math.round(n * 1000) | 0;
    h = Math.imul(h, 16777619);
  };
  mix(s.tick); mix(s.rng); mix(s.def.gold); mix(s.atk.might); mix(s.def.mana); mix(s.atk.mana);
  for (const d of s.defenders) { mix(d.id); mix(d.hp); mix(d.col); }
  for (const e of s.enemies) { mix(e.id); mix(e.x); mix(e.hp); mix(e.shield); mix(e.armor); }
  mix(s.projectiles.length);
  mix(s.pickups.length);
  return h >>> 0;
}

export function cloneGarrison(s: GarrisonState): GarrisonState {
  return JSON.parse(JSON.stringify({ ...s, events: [] })) as GarrisonState;
}
