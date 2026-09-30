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
  FIRE_SHOTS, FUSIONS, SPELLS, STONE_SKIN_HP, TENT_INCOME, TERRAINS, fusionFor, sec,
  type BlessingId, type CardId, type DefDef, type DefKind, type EnemyKind, type ProjectileKind, type SpellId, type SurgeDef, type Terrain
} from "./content";
import { ASCEND_TICKS, VALOR_NEED, ascendedKind, baseKind, kindLevel, leveledKind } from "./order-chaos/forms";

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
  /** Order & Chaos rules (Garrison Wars leaves this unset). */
  oc?: OcRules;
};

/** Order & Chaos: Surge orbs, heroes' artifacts, special level rules. */
export type OcRules = {
  /** Chance that a wave foe carries a Surge orb (dropped when it dies). */
  surgeChance: number;
  startSurges: number;
  /** In play from the first tick: the hero's passive and the equipped artifacts. */
  blessings: BlessingId[];
  /** What Endless offers after every flag. */
  blessingPool: BlessingId[];
  /** Last Stand: no gold from the sky; the waves wait until the player sounds the horn. */
  lastStand?: boolean;
  /** Preset units (by position) that must survive: losing one loses the battle. */
  protect?: { lane: number; col: number }[];
  /** Graves standing on the lawn from the start. */
  graves?: { lane: number; col: number }[];
  /** A boss's summons (instead of the Dracolich's undead). */
  bossSummons?: EnemyKind[];
  bossDragon?: EnemyKind;
  /** Units (base kinds) whose Ascended form the player has unlocked. */
  ultimates?: DefKind[];
  /** Chaos Raids: how often each Chaos spell may be cast in the battle (the horde cannot wait and spam them). */
  atkCharges?: Partial<Record<SpellId, number>>;
  /** Valor crowns the hero can carry (default 1). */
  crownMax?: number;
  /** Surge orbs the hero can carry (default 3; a level that hands out more at the start holds them all). */
  surgeMax?: number;
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
  /** Order & Chaos: Surge volley shots still to fire, and when the next leaves. */
  surgeLeft: number;
  surgeAt: number;
  /** Zeal stacks / compound-interest payouts. */
  stacks: number;
  /** Summoned for a while: vanishes at this tick (0 = stays). */
  expireAt: number;
  /** Sanctuary: takes no damage and cannot be carried off until this tick. */
  invulnUntil: number;
  /** Order & Chaos: Ascended until this tick (0 = not ascended). */
  ascendUntil: number;
  /** The defender that laid this one (Azusa's mines), 0 = none. */
  owner: number;
  /** Order & Chaos: turned into a sheep by a Sorceress until this tick (0 = itself). */
  sheepUntil: number;
  /** Order & Chaos: a Ladder Hobgoblin's ladder leans on it (Chaos walkers climb over). */
  laddered: boolean;
  /** Order & Chaos Aegis Surge: the dome is widened (and stops straight shots) until this tick. */
  domeUntil: number;
  dead: boolean;
};

export type EnemyState = "walk" | "eat" | "vault" | "cast" | "teleport" | "appear" | "flung" | "idle" | "glide" | "burrow" | "snatch"
  // Order & Chaos: a Phantom drifting through defenders; an Arch-vile channelling over a corpse.
  | "phase" | "raise"
  // Order & Chaos: a Ladder Hobgoblin planting its ladder.
  | "plant";

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
  /** Order & Chaos: carries a Surge orb (dropped when it dies). */
  carrier: boolean;
  /** A bounding foe that lost its stride (a tall defender stopped it). */
  stopped: boolean;
  /** Order & Chaos stealth: seen (it struck, fired or was hurt). */
  revealed: boolean;
  /** Order & Chaos Nomad: already swerved round a defender. */
  swerved: boolean;
  /** Order & Chaos zig-zag: tiles covered since the last leap, and the side of the next one (+1 / -1). */
  stride: number;
  zig: number;
  /** Order & Chaos troupe: the dancer's leader (0 = none) and its place around her (0 above, 1 below, 2 ahead, 3 behind). */
  leader: number;
  slot: number;
  /** Order & Chaos: charmed to fight for Order (its strike multiplier; 0 = not charmed). */
  charmed: number;
  /** Order & Chaos Juggernaut: defenders already rolled over. */
  rolled: number[];
  /** Order & Chaos: running off the field (a thief with its sack, a deserter). */
  fleeing: boolean;
  /** Order & Chaos Ladder Hobgoblin: still carrying its ladder. */
  ladder: boolean;
  /** Order & Chaos siege engine: boulders left. */
  ammo: number;
  /** Order & Chaos Prism Elemental: spinning (reflecting) until this tick. */
  spinUntil: number;
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
  /** Order & Chaos: reaches flying foes / hops on to nearby foes / hexes the defender it hits. */
  air: boolean;
  chain: { jumps: number; falloff: number } | null;
  curse: number;
  /** Order & Chaos: double damage to the undead / runs beneath shields. */
  holy: boolean;
  underShield: boolean;
  /** Order & Chaos boomerang: where it returns to, and the foes it may cut on each leg. */
  boomerang: { home: number; pierce: number; back: boolean } | null;
  passed: number[];
  /** Lobbed: flight from `fromX` to the live target over `dur` ticks. */
  lob: { fromX: number; toX: number; t0: number; dur: number; targetId: number; splash: number; col: number; area: boolean } | null;
  /** Order & Chaos: a defender's shot a Prism Elemental turned back on the defenders. */
  reflected?: boolean;
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
  /** "surge": a Surge orb instead of gold. */
  kind?: "surge";
  dead: boolean;
};

export type Blast = {
  id: number;
  kind: "fireball" | "fire-wall" | "eruption" | "death-breath" | "storm" | "frost-nova" | "arrows";
  lane: number;
  x: number;
  at: number;
  dmg: number;
  /** Frost nova: ticks the foes stay frozen. */
  freeze?: number;
};

/** `dmg`: a hero's Royal Charge (hurts instead of slaying, then leaves). */
export type Charger = { lane: number; state: "ready" | "charging" | "gone"; x: number; px: number; dmg?: number; hits?: number[]; sprite?: string };
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
  | { e: "enemyDie"; id: number; kind: EnemyKind; lane: number; x: number; dir: 1 | -1; how: KillHow }
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
  | { e: "collect"; id: number; value: number; x: number; y: number; surge?: boolean }
  // Order & Chaos
  | { e: "surge"; id: number; kind: SurgeDef["kind"] }
  | { e: "orb"; id: number }
  | { e: "zap"; lane: number; x: number; toLane: number; toX: number; tint?: "lightning" | "frost" | "fire" | "bolt" }
  | { e: "snipe"; id: number; target: number; lane: number; x: number }
  | { e: "bomb"; lane: number; x: number }
  | { e: "beam"; id: number; lanes: number[] }
  | { e: "gust"; id: number; lanes: number[] }
  | { e: "pounce"; id: number; target: number }
  | { e: "shellGift"; id: number; target: number }
  | { e: "sweep"; id: number; lane: number }
  | { e: "snatchDrop"; id: number; target: number }
  | { e: "snatched"; id: number; target: number; kind: DefKind }
  | { e: "blownAway"; id: number }
  | { e: "ascend"; id: number; kind: DefKind }
  | { e: "descend"; id: number }
  | { e: "crown"; crowns: number }
  | { e: "mineLaid"; id: number; lane: number; col: number }
  | { e: "swerve"; id: number }
  | { e: "reveal"; id: number }
  | { e: "whirl"; id: number }
  | { e: "roots"; id: number; targets: number[] }
  | { e: "blizzard"; id: number; lanes: number[] }
  | { e: "phase"; id: number; on: boolean }
  | { e: "zig"; id: number }
  | { e: "dance"; id: number; dancers: number[] }
  | { e: "raiseStart"; id: number; lane: number; x: number }
  | { e: "raiseDone"; id: number; raised: number; lane: number; x: number }
  | { e: "raiseFail"; id: number }
  | { e: "crush"; id: number; target: number }
  | { e: "pop"; id: number; lane: number; x: number }
  | { e: "shove"; id: number; by: number; from: number; to: number; lane: number }
  | { e: "blink"; id: number; fromX: number }
  | { e: "gasp"; id: number }
  | { e: "daze"; id: number }
  | { e: "flee"; id: number }
  | { e: "escape"; id: number; lane: number; x: number; loot: number }
  | { e: "skyAttack"; id: number; kind: "dive" | "spit" | "breath"; target: number; lane: number; col: number }
  | { e: "divert"; id: number; target: number }
  | { e: "magnet"; id: number; target: number; piece: "armor" | "shield"; kind: EnemyKind; lane: number; x: number; dir: 1 | -1 }
  | { e: "devour"; id: number; target: number; kind: EnemyKind; lane: number; x: number; whole: boolean }
  | { e: "charm"; id: number; by: number }
  | { e: "kite"; id: number; from: number; to: number }
  | { e: "hex"; id: number; target: number }
  | { e: "unhex"; id: number }
  | { e: "spin"; id: number }
  | { e: "reflect"; id: number; kind: ProjectileKind; lane: number; x: number }
  | { e: "ladderPlant"; id: number; target: number }
  | { e: "ladder"; id: number; target: number }
  | { e: "climb"; id: number; target: number }
  | { e: "aegis"; id: number; lane: number; x: number; kind: ProjectileKind | "sky" | "snatch" }
  | { e: "lure"; id: number; target: number }
  | { e: "lizardCharge"; id: number; kind: DefKind; lane: number; col: number }
  | { e: "horn" }
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

/** How a foe died (a swallowed one leaves no body and cannot be raised). */
export type KillHow = "normal" | "petrify" | "charge" | "burn" | "devour";

/** A slain Chaos creature, remembered for raising (where it fell, and when). */
export type FallenFoe = { kind: EnemyKind; lane: number; x?: number; at?: number; claimed?: number };

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
    /** Order & Chaos: Surge orbs in hand and how many fit. */
    surges: number;
    surgeMax: number;
    /** Prayer: defenders act 30% faster until this tick. */
    prayerUntil: number;
    /** Labyrinth Frenzy: melee strikes twice as hard until this tick. */
    frenzyUntil: number;
    /** Order & Chaos Ascension: Valor toward the next crown, crowns in hand and how many fit. */
    valor: number;
    crowns: number;
    crownMax: number;
  };
  atk: {
    might: number;
    cards: AtkSlot[];
    mana: number;
    manaAt: number;
    spellReady: Partial<Record<SpellId, number>>;
    hasteUntil: number;
    mightAt: number;
    fallen: FallenFoe[];
    /** Raid puzzles: lanes already broken through. */
    raided: number[];
    /** Chaos spells cast so far (Order & Chaos raids limit them per battle). */
    casts: Partial<Record<SpellId, number>>;
    /** Raids: the last tick the horde made headway, and the lows it had reached then
     *  (absent in old snapshots; see raidStalled). */
    stall?: { at: number; defHp: number; foeHp: number; foes: number; ids: number; x: number };
  };
  defenders: Defender[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  blasts: Blast[];
  chargers: Charger[];
  /** Order & Chaos: tiles a Juggernaut scorched (nothing can be placed until `until`); absent in old snapshots. */
  scorched?: { lane: number; col: number; until: number }[];
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
  /** Order & Chaos Last Stand: still placing troops; the waves wait for the horn. */
  planning: boolean;
  /** Units that must survive (protect levels). */
  protectIds: number[];
  outcome: { winner: Side; reason: string } | null;
  stats: { kills: number; placed: number; lost: number; goldEarned: number; goldSpent: number; surgesUsed: number };
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
  | { t: "tent"; lane: number; col: number }
  // Order & Chaos
  | { t: "surge"; id: number }
  | { t: "ascend"; id: number }
  | { t: "begin" };

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
      surges: cfg.oc ? cfg.oc.startSurges : 0,
      surgeMax: cfg.oc ? Math.max(1, Number.isFinite(cfg.oc.surgeMax) ? cfg.oc.surgeMax! : 3, cfg.oc.startSurges) : 3,
      prayerUntil: 0,
      frenzyUntil: 0,
      valor: 0,
      crowns: 0,
      crownMax: Math.max(1, cfg.oc?.crownMax ?? 1),
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
      casts: {},
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
    planning: cfg.oc?.lastStand === true,
    protectIds: [],
    outcome: null,
    stats: { kills: 0, placed: 0, lost: 0, goldEarned: 0, goldSpent: 0, surgesUsed: 0 },
    events: [],
  };
  // Order & Chaos: the hero's passive and the equipped artifacts are in play from the start.
  for (const id of cfg.oc?.blessings ?? []) if (BLESSINGS[id]) grantBlessing(s, id);
  for (const unit of cfg.preset ?? []) {
    if (!cfg.lanes.includes(unit.lane) || !DEFENDERS[unit.kind]) continue;
    const placed = addDefender(s, unit.kind, unit.lane, unit.col);
    // A prepared garrison's mines are already primed.
    if (placed.kind === "mine" || DEFENDERS[placed.kind]!.trap) placed.armedAt = 0;
    if (cfg.oc?.protect?.some((spot) => spot.lane === unit.lane && spot.col === unit.col)) s.protectIds.push(placed.id);
  }
  for (const spot of cfg.oc?.graves ?? []) {
    if (cfg.lanes.includes(spot.lane) && !defenderAt(s, spot.lane, spot.col)) spawnEnemy(s, "oc-grave", spot.lane, spot.col + 0.5, "wave", 0);
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
  const trap = DEFENDERS[kind]!.trap;
  const d: Defender = {
    id: s.nextId++, kind, lane, col, hp: maxHp, maxHp, shell: 0, cd: 0, cd2: 0, busyUntil: 0,
    armedAt: kind === "mine" ? s.tick + LAND_MINE_ARM : trap ? s.tick + trap.arm : 0,
    cursedUntil: 0, stunnedUntil: 0, poisonUntil: 0, poisonDps: 0, shotAt: -1, shotsLeft: 0, shots: 0, strikes: 0,
    raiseAt: 0, mana: 0, reborn: false, placedAt: s.tick,
    surgeLeft: 0, surgeAt: 0, stacks: 0, expireAt: 0, invulnUntil: 0, ascendUntil: 0, owner: 0,
    sheepUntil: 0, laddered: false, domeUntil: 0, dead: false,
  };
  resetDefenderTimers(s, d);
  s.defenders.push(d);
  return d;
}

function resetDefenderTimers(s: GarrisonState, d: Defender): void {
  const def = DEFENDERS[d.kind]!;
  d.cd = def.shot ? 12 : def.lightning ? sec(1) : def.banish ? sec(3) : def.flame ? sec(2)
    // Order & Chaos abilities.
    : def.instant ? def.instant.delay
    : def.snipe ? sec(1.5)
    : def.airstrike ? sec(2)
    : def.beam ? def.beam.charge
    : def.pounce ? sec(1)
    : def.caster ? sec(1.5)
    : def.burnAura ? def.burnAura.every
    : def.gust ? sec(3)
    : def.chainLightning ? sec(1.5)
    : def.spikes ? def.spikes.every
    : def.magnet ? sec(2)
    : 0;
  if (def.produce && !def.shot) d.cd = randInt(s, def.produce.first[0], def.produce.first[1]);
  d.cd2 = def.produce && def.shot ? randInt(s, def.produce.first[0], def.produce.first[1])
    : def.heal ? def.heal.every
    : def.stoneShot ? sec(4)
    : def.slowCast ? sec(2)
    : def.resurrect ? def.resurrect.every
    : def.laneHeal ? def.laneHeal.every
    : def.shellGift ? sec(2)
    : def.mineLayer ? sec(8)
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
    cd2: def.heal ? def.heal.every : def.summon ? def.summon.every : def.revive ? def.revive.every : def.graves ? def.graves.every : 0,
    shotAt: -1, shotsLeft: 0, chillUntil: 0, slowUntil: 0, freezeUntil: 0, stunUntil: 0, poisonUntil: 0, poisonDps: 0,
    vaulted: false, flung: false, reborn: false, carrier: false, stopped: false, revealed: false, swerved: false,
    stride: 0, zig: 1, leader: 0, slot: -1, charmed: 0, rolled: [], fleeing: false,
    ladder: def.ladder !== undefined, ammo: def.siege?.ammo ?? 0, spinUntil: 0, bites: 0, wave, side, dead: false,
  };
  // Order & Chaos: a Prism Elemental's first spin comes a moment after it reaches the lawn; a Sorceress hexes soon after.
  if (def.prism) e.cd2 = sec(2);
  if (def.hex) e.cd2 = sec(2);
  // Order & Chaos second timers: flyers' strikes from the sky, a Phantom's phasing, an Arch-vile's raising.
  if (def.skyAttack) e.cd2 = def.skyAttack.every;
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
  return !e.dead && !e.charmed && e.state !== "vault" && e.state !== "flung" && e.state !== "teleport" && e.state !== "glide" && e.state !== "burrow"
    && e.state !== "phase";
}

export function isStructure(e: Enemy): boolean {
  return ENEMIES[e.kind]?.structure === true;
}

/** Whether losing this defender counts as a lost troop: a mine a unit laid for itself
 *  (Azusa) and anything summoned for a while (Surge copies, earthen walls) do not. */
function countsAsTroop(d: Defender): boolean {
  return !d.owner && d.expireAt === 0;
}

/** A defender with nothing but a body: skipped by Mage bolts. */
export function isWall(def: DefDef): boolean {
  return !def.shot && !def.melee && !def.lightning && !def.gaze && !def.stoneShot && !def.banish && !def.slowCast
    && !def.heal && !def.produce && !def.ignite && !def.aura && !def.flame && !def.resurrect
    && !def.trap && !def.spikes && !def.instant && !def.snipe && !def.airstrike && !def.beam && !def.pounce && !def.laneHeal
    && !def.caster && !def.burnAura && !def.gust && !def.shellGift && !def.ammo && !def.chainLightning && !def.luckyKills
    && !def.magnet && !def.devour && !def.charm && !def.aegis;
}

/** Order & Chaos: turned into a sheep (cannot act, but still blocks the lane). */
export function isSheep(s: GarrisonState, d: Defender): boolean {
  return (d.sheepUntil ?? 0) > s.tick;
}

/** Cures (the spell, a Field Hospital) lift a Sorceress' hex. */
function clearHex(s: GarrisonState, d: Defender): void {
  if (!isSheep(s, d)) return;
  d.sheepUntil = 0;
  s.events.push({ e: "unhex", id: d.id });
}

/** Order & Chaos: a tile a Juggernaut left burning (nothing can be placed on it yet). */
export function scorchedAt(s: GarrisonState, lane: number, col: number): boolean {
  return s.scorched?.some((t) => t.lane === lane && t.col === col && t.until > s.tick) === true;
}

/**
 * Order & Chaos Aegis: the dome over this tile, if any (its bearer; none while it is a sheep).
 * `straight`: only a Surge-widened dome turns straight shots aside.
 */
export function aegisOver(s: GarrisonState, lane: number, col: number, straight = false): Defender | undefined {
  if (!s.cfg.oc) return undefined;
  for (const a of s.defenders) {
    const aegis = a.dead ? undefined : DEFENDERS[a.kind]!.aegis;
    if (!aegis || isSheep(s, a)) continue;
    const widened = (a.domeUntil ?? 0) > s.tick;
    if (straight && !widened) continue;
    const reach = aegis.reach + (widened ? 1 : 0);
    if (Math.abs(a.lane - lane) <= reach && Math.abs(a.col - col) <= reach) return a;
  }
  return undefined;
}

/** Lies flat on its tile (Land Mine, buried charges, spikes): never shot at, cleaved, blasted or healed. */
export function isFlat(d: Defender): boolean {
  const def = DEFENDERS[d.kind]!;
  return d.kind === "mine" || def.trap !== undefined || def.spikes !== undefined;
}

/** Order & Chaos flyers: over every defender, out of reach of most attacks. */
export function isFlying(e: Enemy): boolean {
  return ENEMIES[e.kind]?.flying === true;
}

/** A grave standing on a lawn tile. */
export function graveAt(s: GarrisonState, lane: number, col: number): Enemy | undefined {
  return s.enemies.find((e) => !e.dead && e.lane === lane && Math.floor(e.x) === col && ENEMIES[e.kind]?.grave !== undefined);
}

/** Structures (tents, banners) are only something to shoot at in versus; graves always are. */
function shootable(s: GarrisonState, e: Enemy): boolean {
  return !e.dead && !e.charmed && e.state !== "teleport" && e.state !== "glide" && e.state !== "burrow" && e.state !== "phase" && !hidden(e)
    && (!isStructure(e) || s.cfg.mode === "versus" || ENEMIES[e.kind]!.grave !== undefined);
}

/** Order & Chaos stealth: out of sight until it comes close, strikes, fires or is hurt. */
export function hidden(e: Enemy): boolean {
  const stealth = ENEMIES[e.kind]?.stealth;
  return stealth !== undefined && !e.revealed && e.x > stealth;
}

function reveal(s: GarrisonState, e: Enemy): void {
  if (e.revealed || ENEMIES[e.kind]?.stealth === undefined) return;
  e.revealed = true;
  s.events.push({ e: "reveal", id: e.id });
}

/** A seed packet's price (Ambassador's Sash: 15% off, to the nearest 5). */
export function cardCost(s: GarrisonState, cardId: CardId): number {
  const cost = CARDS[cardId]?.cost ?? 0;
  return s.def.blessings.includes("ambassadors-sash") ? Math.round((cost * 0.85) / 5) * 5 : cost;
}

export type PlaceCheck =
  | { ok: true; action: "place" | "fuse" | "shell" | "spell"; target?: Defender; result?: DefKind; cost: number }
  | { ok: false; reason: string };

/** Everything the defender's "place card" command checks, for the hover preview too. */
export function checkPlace(s: GarrisonState, cardId: CardId, lane: number, col: number, beltId?: number): PlaceCheck {
  if (s.cfg.mode === "raid") return { ok: false, reason: "The defenders are fixed in this raid." };
  const card = CARDS[cardId];
  if (!card) return { ok: false, reason: "Unknown card." };
  let cost = cardCost(s, cardId);
  if (s.cfg.conveyorPool) {
    if (beltId === undefined || !s.def.belt.some((item) => item.uid === beltId && item.card === cardId)) return { ok: false, reason: "That card is not on the belt." };
    cost = 0;
  } else {
    const slot = s.def.cards.find((c) => c.id === cardId);
    if (!slot) return { ok: false, reason: "Card not in your hand." };
    // Last Stand planning: nothing recharges while the field is frozen.
    if (slot.readyAt > s.tick && !s.planning) return { ok: false, reason: "Still recharging." };
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
    if (!here || isFlat(here)) return { ok: false, reason: "Cast Stone Skin on one of your defenders." };
    return { ok: true, action: "shell", target: here, cost };
  }
  if (here) {
    const result = fusionFor(here.kind, cardId);
    return result ? { ok: true, action: "fuse", target: here, result: fusedKind(s, result, here.kind, cardId), cost } : { ok: false, reason: "Tile taken." };
  }
  const [minCol, maxCol] = s.cfg.defCols;
  if (col < minCol || col > maxCol) return { ok: false, reason: "Your troops can't hold that ground." };
  if (tentAt(s, lane, col)) return { ok: false, reason: "An enemy tent stands there." };
  if (graveAt(s, lane, col)) return { ok: false, reason: "A grave stands there — destroy it first." };
  if (scorchedAt(s, lane, col)) return { ok: false, reason: "Scorched ground — wait for it to cool." };
  return { ok: true, action: "place", cost };
}

/** Order & Chaos: can a Surge orb be dropped on this defender? */
export function checkSurge(s: GarrisonState, id: number): { ok: true; target: Defender } | { ok: false; reason: string } {
  if (!s.cfg.oc) return { ok: false, reason: "No Surges in this mode." };
  if (s.def.surges <= 0) return { ok: false, reason: "No Surge orbs — slay the glowing foes to gather them." };
  const d = s.defenders.find((unit) => unit.id === id && !unit.dead);
  if (!d) return { ok: false, reason: "Drop the Surge on one of your troops." };
  if (!DEFENDERS[d.kind]!.surge) return { ok: false, reason: "This unit has no Surge." };
  if (d.surgeLeft > 0) return { ok: false, reason: "Already surging." };
  if (isSheep(s, d)) return { ok: false, reason: "A sheep cannot Surge — wait for the hex to wear off." };
  return { ok: true, target: d };
}

/** Order & Chaos Fusion: a hybrid keeps the higher Barracks level of its two halves. */
function fusedKind(s: GarrisonState, result: DefKind, placed: DefKind, cardId: CardId): DefKind {
  if (!s.cfg.oc) return result;
  const cardKind = CARDS[cardId]?.places;
  return leveledKind(result, Math.max(kindLevel(placed), cardKind ? kindLevel(cardKind) : 1));
}

/** Order & Chaos: can this defender spend a Valor crown to Ascend? */
export function checkAscend(s: GarrisonState, id: number): { ok: true; target: Defender; form: DefKind } | { ok: false; reason: string } {
  const oc = s.cfg.oc;
  if (!oc?.ultimates || s.cfg.mode === "raid") return { ok: false, reason: "No Ascensions in this battle." };
  const d = s.defenders.find((unit) => unit.id === id && !unit.dead);
  if (!d) return { ok: false, reason: "Choose one of your troops to Ascend." };
  if (DEFENDERS[d.kind]!.ascendedFrom) return { ok: false, reason: "Already ascended." };
  if (isSheep(s, d)) return { ok: false, reason: "A sheep cannot Ascend — wait for the hex to wear off." };
  if (!oc.ultimates.includes(baseKind(d.kind))) return { ok: false, reason: "This unit's Ascension is not unlocked (train it in the Barracks)." };
  const form = ascendedKind(d.kind);
  if (!form) return { ok: false, reason: "This unit has no Ascended form." };
  if (s.def.crowns <= 0) return { ok: false, reason: "No Valor crown — slay the horde to earn one." };
  return { ok: true, target: d, form };
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
  if (spell === "earthen-bulwark") {
    const col = Math.floor(x);
    if (col < s.cfg.defCols[0] || col > s.cfg.defCols[1]) return { ok: false, reason: "Your troops can't hold that ground." };
  }
  if (spell === "supply-drop" && s.def.surges >= s.def.surgeMax) return { ok: false, reason: "Your Surge orbs are full." };
  if (spell === "blind") {
    const target = magicArrowTarget(s, lane, x);
    const def = target ? ENEMIES[target.kind]! : undefined;
    if (def && (def.boss || def.structure || def.stunImmune || def.magicResist === 0)) return { ok: false, reason: "That foe cannot be blinded." };
  }
  if (side === "atk" && spellsLeft(s, spell) <= 0) return { ok: false, reason: "No casts of this spell left in this battle." };
  return { ok: true };
}

/** A spell's recovery time (Charm of Mana: 40% faster for the defending hero). */
export function spellCooldown(s: GarrisonState, side: Side, spell: SpellId): number {
  const cooldown = SPELLS[spell].cooldown;
  return side === "def" && s.def.blessings.includes("charm-of-mana") ? Math.round(cooldown / 1.4) : cooldown;
}

/** Chaos spells left in this battle (unlimited unless the raid sets a limit). */
export function spellsLeft(s: GarrisonState, spell: SpellId): number {
  const limit = s.cfg.oc?.atkCharges?.[spell];
  return limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, limit - (s.atk.casts?.[spell] ?? 0));
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
  // Last Stand: the field is frozen while the player places troops (no recharge, no time).
  if (s.planning) {
    for (const cmd of commands) applyCommand(s, cmd);
    cleanup(s);
    return;
  }
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
    case "surge": case "ascend": return whole(cmd.id);
    case "begin": return true;
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
      s.stats.goldSpent += up.cost;
      transform(s, d, up.to, 0);
      s.events.push({ e: "upgrade", id: d.id, kind: d.kind });
      return;
    }
    case "dismiss": {
      if (cmd.by !== "def" || s.cfg.mode === "raid") return;
      const d = s.defenders.find((unit) => unit.id === cmd.id && !unit.dead);
      if (!d || s.protectIds.includes(d.id)) return;
      d.dead = true;
      s.events.push({ e: "dismiss", id: d.id });
      return;
    }
    case "surge": {
      if (cmd.by !== "def") return;
      const check = checkSurge(s, cmd.id);
      if (!check.ok) return;
      s.def.surges -= 1;
      s.stats.surgesUsed += 1;
      applySurge(s, check.target);
      return;
    }
    case "ascend": {
      if (cmd.by !== "def") return;
      const check = checkAscend(s, cmd.id);
      if (!check.ok) return;
      s.def.crowns -= 1;
      ascend(s, check.target, check.form);
      return;
    }
    case "begin": {
      if (cmd.by !== "def" || !s.planning) return;
      s.planning = false;
      s.director.nextAt = s.tick + sec(3);
      s.events.push({ e: "horn" });
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

/** Order & Chaos: the unit takes its Ascended form (fully healed) for a while. */
function ascend(s: GarrisonState, d: Defender, form: DefKind): void {
  // A form change is not a new life: a Phoenix keeps whether it has risen already.
  const reborn = d.reborn;
  transform(s, d, form, 1);
  d.reborn = reborn;
  // A gold- or mana-maker's harvest starts at once instead of after its opening delay.
  const produce = DEFENDERS[form]!.produce;
  if (produce) {
    if (DEFENDERS[form]!.shot) d.cd2 = sec(1);
    else d.cd = sec(1);
  }
  d.ascendUntil = s.tick + Math.round(ASCEND_TICKS * (has(s, "helm-of-enlightenment") ? 1.5 : 1));
  s.events.push({ e: "ascend", id: d.id, kind: form });
}

/** The Ascension burns out: back to the unit it was, keeping its share of health. */
function descend(s: GarrisonState, d: Defender): void {
  const from = DEFENDERS[d.kind]!.ascendedFrom;
  d.ascendUntil = 0;
  if (!from || !DEFENDERS[from]) return;
  const reborn = d.reborn;
  transform(s, d, from, 0);
  d.reborn = reborn;
  // Back to its usual pay cycle (no quick opening payout).
  const produce = DEFENDERS[from]!.produce;
  if (produce) {
    if (DEFENDERS[from]!.shot) d.cd2 = produce.every;
    else d.cd = produce.every;
  }
  s.events.push({ e: "descend", id: d.id });
}

function payCard(s: GarrisonState, cardId: CardId, cost: number, beltId?: number): void {
  if (s.cfg.conveyorPool) {
    s.def.belt = s.def.belt.filter((item) => item.uid !== beltId);
    return;
  }
  s.def.gold -= cost;
  s.stats.goldSpent += cost;
  const slot = s.def.cards.find((c) => c.id === cardId);
  // Last Stand planning: no recharge while the field is frozen.
  if (slot && !s.planning) {
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
  how?: KillHow;
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
  reveal(s, e);
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
      armorLost(s, e);
    }
  }
  e.hp -= dmg;
  s.events.push({ e: "enemyHurt", id: e.id, amount: dmg + absorbed, burn: hit.fire === true });
  const how = hit.how ?? (hit.fire ? "burn" : "normal");
  if (e.hp <= 0 && def.lastGasp && !e.reborn && how === "normal" && !hit.spell) {
    // Order & Chaos Shambler: the killing blow leaves it crawling on.
    e.reborn = true;
    e.hp = Math.max(1, Math.round(e.maxHp * def.lastGasp));
    e.poisonUntil = 0;
    s.events.push({ e: "gasp", id: e.id });
  } else if (e.hp <= 0) {
    killEnemy(s, e, how);
  } else {
    if (def.enrage?.at === "half" && e.hp < e.maxHp / 2) enrageEnemy(s, e);
    // Order & Chaos: fire striking an unlit powder keg sets it off where it stands.
    if (hit.fire && def.keg && e.fuse === -1 && !e.charmed && s.cfg.oc) kegBlast(s, e, true);
  }
  return dmg + absorbed;
}

/** Headgear or armour came off (a blow or a lodestone): an enrage-at-break foe goes berserk, a dazeable one reels. */
function armorLost(s: GarrisonState, e: Enemy): void {
  const def = ENEMIES[e.kind]!;
  if (def.enrage?.at === "break") enrageEnemy(s, e);
  if (def.daze && !e.dead && canSlow(e) && !def.stunImmune) {
    e.stunUntil = Math.max(e.stunUntil, s.tick + def.daze);
    s.events.push({ e: "daze", id: e.id });
  }
}

function enrageEnemy(s: GarrisonState, e: Enemy): void {
  if (e.enraged || e.dead) return;
  e.enraged = true;
  s.events.push({ e: "enrage", id: e.id });
}

function killEnemy(s: GarrisonState, e: Enemy, how: KillHow): void {
  if (e.dead) return;
  const def = ENEMIES[e.kind]!;
  // An Arch-vile slain mid-spell lets go of the corpse.
  if (e.state === "raise") abortRaise(s, e, false);
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
  // A swallowed foe is gone for good: nothing to raise.
  if (!def.boss && how !== "devour") {
    s.atk.fallen.push({ kind: e.kind, lane: e.lane, x: e.x, at: s.tick });
    if (s.atk.fallen.length > 12) s.atk.fallen.shift();
    raiseFromFallen(s, e);
  }
  if (s.def.blessings.includes("yawning-dead") && rand(s) < 0.2) {
    dropCoin(s, Math.min(8.6, Math.max(0.4, e.x)), e.lane + 0.35, e.lane + 0.75, 15);
  }
  // Order & Chaos: a glowing foe drops its Surge orb; Leprechauns turn kills into gold.
  if (e.carrier) {
    e.carrier = false;
    dropOrb(s, Math.min(8.6, Math.max(0.4, e.x)), e.lane);
  }
  if (s.cfg.oc) luckyDrop(s, e);
  // Order & Chaos mercenaries carry their pay; every slain foe builds Valor toward an Ascension.
  if (s.cfg.oc && s.cfg.mode !== "raid") {
    if (def.purse) dropCoin(s, Math.min(8.6, Math.max(0.4, e.x)), e.lane + 0.2, e.lane + 0.7, def.purse);
    if (s.cfg.oc.ultimates?.length) gainValor(s, Math.max(1, def.cost));
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

/** Order & Chaos: Valor toward the next Ascension crown (Crown of Dragontooth: half as much again). */
function gainValor(s: GarrisonState, amount: number): void {
  if (s.def.crowns >= s.def.crownMax) return;
  s.def.valor += amount * (has(s, "crown-of-dragontooth") ? 1.5 : 1);
  if (s.def.valor >= VALOR_NEED) {
    s.def.valor = 0;
    s.def.crowns += 1;
    s.events.push({ e: "crown", crowns: s.def.crowns });
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
    if (col < minCol || col > maxCol || defenderAt(s, e.lane, col) || tentAt(s, e.lane, col) || scorchedAt(s, e.lane, col)) continue;
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
  // Sanctuary: untouchable (even by a smasher).
  if (d.invulnUntil > s.tick) return;
  if (hit.crush) {
    d.shell = 0;
    d.hp = 0;
  } else {
    let dmg = amount;
    if (hit.atk && s.def.blessings.includes("dragon-scale-shield")) dmg *= 0.75;
    if (hit.magic && def.magicResist !== undefined) dmg *= def.magicResist;
    if (s.cfg.oc) dmg *= 1 - wardAt(s, d);
    dmg = Math.round(dmg);
    if (dmg <= 0) return;
    if (d.shell > 0) {
      const absorbed = Math.min(d.shell, dmg);
      d.shell -= absorbed;
      dmg -= absorbed;
    }
    d.hp -= dmg;
    // Order & Chaos Gold Golem: every so much damage knocks a nugget loose.
    const nuggets = def.nuggets;
    if (nuggets && dmg > 0 && s.cfg.mode !== "raid") {
      d.stacks += dmg;
      while (d.stacks >= nuggets.every) {
        d.stacks -= nuggets.every;
        dropCoin(s, d.col + 0.5 + (rand(s) - 0.5) * 0.5, d.lane + 0.2, d.lane + 0.7, nuggets.value);
      }
    }
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
  if (countsAsTroop(d)) s.stats.lost += 1;
  s.events.push({ e: "defDie", id: d.id, kind: d.kind, lane: d.lane, col: d.col, crushed: hit.crush === true });
  // Summoned troops (Surge copies, earthen walls) are not there to be raised again.
  if (!isFlat(d) && d.expireAt === 0) {
    // An Ascended unit is remembered (and raised) as the unit it was.
    s.def.fallen.push({ kind: def.ascendedFrom ?? d.kind, lane: d.lane, col: d.col });
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
  if (TERRAINS[cfg.terrain].skyGold && !cfg.conveyorPool && cfg.mode !== "raid" && !cfg.oc?.lastStand && !s.overtime && s.tick >= def.skyAt) {
    const lane = cfg.lanes[randInt(s, 0, cfg.lanes.length - 1)] ?? 2;
    dropCoin(s, 0.6 + rand(s) * 7.8, -0.6, lane + 0.55 + rand(s) * 0.3, 25);
    def.skyAt = s.tick + Math.round((sec(8) + randInt(s, 0, sec(4))) * (TERRAINS[cfg.terrain].skyRate ?? 1) / (def.blessings.includes("endless-purse") ? 1.4 : 1));
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

/** Order & Chaos: a Surge orb falls where a glowing foe died. */
function dropOrb(s: GarrisonState, x: number, lane: number): void {
  const p: Pickup = { id: s.nextId++, x, y0: lane + 0.1, y: lane + 0.6, value: 0, kind: "surge", bornAt: s.tick, landAt: s.tick + 10, expireAt: s.tick + 10 + sec(14), dead: false };
  s.pickups.push(p);
  s.events.push({ e: "orb", id: p.id });
}

function collectPickup(s: GarrisonState, p: Pickup): void {
  if (p.dead) return;
  if (p.kind === "surge") {
    // A full hand leaves the orb lying (until it fades).
    if (s.def.surges >= s.def.surgeMax) return;
    p.dead = true;
    s.def.surges += 1;
    s.events.push({ e: "collect", id: p.id, value: 0, x: p.x, y: p.y, surge: true });
    return;
  }
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
  const oc = s.cfg.oc;
  let carried = false;
  for (let i = 0; i < picks.length; i += 1) {
    const e = spawnEnemy(s, picks[i]!, pickLane(s), SPAWN_X + rand(s) * 0.9 + (flag ? Math.floor(i / 5) * 0.5 : 0), "wave", wave);
    hp += e.hp + e.shield + e.armor;
    // Order & Chaos: some foes glow with a Surge orb (every great assault brings at least one).
    if (oc && oc.surgeChance > 0 && (rand(s) < oc.surgeChance || (flag && !carried && i === picks.length - 1))) {
      e.carrier = true;
      carried = true;
    }
  }
  // ...and the dead climb out of every grave.
  if (oc && flag) {
    for (const grave of s.enemies.filter((g) => !g.dead && ENEMIES[g.kind]!.grave)) {
      const kind = ENEMIES[grave.kind]!.grave!.raise;
      if (!ENEMIES[kind]) continue;
      const risen = spawnEnemy(s, kind, grave.lane, grave.x, "wave", wave);
      s.events.push({ e: "enemyRise", id: risen.id });
      hp += risen.hp + risen.shield + risen.armor;
    }
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
  const pool = (s.cfg.oc?.blessingPool ?? BLESSING_ORDER).filter((id) => BLESSINGS[id] && (BLESSINGS[id].repeatable || !owned.has(id)));
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
    for (const c of s.chargers) if (c.state === "gone" && c.dmg === undefined) Object.assign(c, { state: "ready", x: -0.45, px: -0.45 });
  }
  if (id === "surge-chalice" && first) {
    s.def.surgeMax += 1;
    s.def.surges = Math.min(s.def.surgeMax, s.def.surges + 1);
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
    const summons = s.cfg.oc?.bossSummons?.length ? s.cfg.oc.bossSummons : BOSS_SUMMONS;
    const tier = Math.min(summons.length, 3 + Math.floor(minutes * 1.2));
    const count = 2 + (enraged ? 1 : 0) + Math.min(2, Math.floor(minutes / 4));
    for (let i = 0; i < count; i += 1) {
      spawnEnemy(s, summons[randInt(s, 0, tier - 1)]!, pickLane(s), SPAWN_X + rand(s) * 0.6, "wave");
    }
  } else if (action === "breath") {
    setState(s, boss, "cast", sec(1.5));
    // 200: a 300 HP shooter survives one breath (at full health) — stone skin and healers save the rest.
    s.blasts.push({ id: s.nextId++, kind: "death-breath", lane: boss.lane, x: boss.x, at: s.tick + sec(1.5), dmg: 200 });
  } else if (action === "dragon") {
    setState(s, boss, "cast", sec(1));
    const lanes = s.cfg.lanes.filter((lane) => lane !== boss.lane);
    const lane = lanes.length ? lanes[randInt(s, 0, lanes.length - 1)]! : boss.lane;
    const dragon = spawnEnemy(s, s.cfg.oc?.bossDragon ?? "bone-dragon", lane, 9.6, "wave");
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
  if (d.stunnedUntil > s.tick || isSheep(s, d)) return 0;
  let rate = 1;
  if (s.def.hasteUntil > s.tick) rate *= 1.5;
  if (s.def.prayerUntil > s.tick) rate *= 1.3;
  if (d.cursedUntil > s.tick) rate *= 0.5;
  if (has(s, "necklace-of-swiftness")) rate *= 1.2;
  let aura = 0;
  for (const a of auras) {
    if (a !== d && Math.abs(a.lane - d.lane) <= 1 && Math.abs(a.col - d.col) <= 1 && !isSheep(s, a)) aura = Math.max(aura, DEFENDERS[a.kind]!.aura ?? 0);
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
  return !def.frostImmune && !def.boss && !def.structure && !e.charmed;
}

function canSlow(e: Enemy): boolean {
  const def = ENEMIES[e.kind]!;
  return !def.boss && !def.structure && !e.charmed;
}

function defendersAct(s: GarrisonState): void {
  const regen = has(s, "vial-of-lifeblood") && s.tick % 4 === 0;
  const auras = s.defenders.filter((d) => !d.dead && DEFENDERS[d.kind]!.aura);
  const second = s.tick % 20 === 0;
  for (const d of s.defenders) {
    if (d.dead) continue;
    if (d.ascendUntil > 0 && s.tick >= d.ascendUntil) descend(s, d);
    // Order & Chaos: a Sorceress' hex wears off.
    if (d.sheepUntil > 0 && s.tick >= d.sheepUntil) {
      d.sheepUntil = 0;
      s.events.push({ e: "unhex", id: d.id });
    }
    const def = DEFENDERS[d.kind]!;
    const centre = d.col + 0.5;
    // Summoned for a while (Surge copies, earthen walls): gone when the time is up.
    if (d.expireAt > 0 && s.tick >= d.expireAt) {
      d.dead = true;
      s.events.push({ e: "dismiss", id: d.id });
      continue;
    }
    if (regen && d.hp < d.maxHp && !isFlat(d)) d.hp = Math.min(d.maxHp, d.hp + 1);
    if (second && d.poisonUntil > s.tick) {
      hurtDefender(s, d, d.poisonDps);
      if (d.dead) continue;
    }

    const trap = d.kind === "mine" ? MINE_TRAP : def.trap;
    if (trap) {
      if (s.tick < d.armedAt) continue;
      const trigger = s.enemies.find((e) => e.lane === d.lane && grounded(e) && !isStructure(e) && !isFlying(e) && !ENEMIES[e.kind]!.boss && Math.abs(e.x - centre) <= 0.5);
      if (trigger) {
        d.dead = true;
        s.events.push({ e: "mine", id: d.id, lane: d.lane, x: centre });
        for (const e of [...s.enemies]) {
          if (e.lane === d.lane && grounded(e) && !isStructure(e) && !isFlying(e) && Math.abs(e.x - centre) <= trap.radius) hurtEnemy(s, e, trap.dmg, { spell: true });
        }
      }
      continue;
    }

    // Order & Chaos instants act once, stunned or not, and are gone.
    if (def.instant) {
      d.cd -= 1;
      if (d.cd <= 0) fireInstant(s, d);
      continue;
    }

    const rate = actRate(s, d, auras);
    if (rate <= 0) continue;

    if (d.surgeLeft > 0 && s.tick >= d.surgeAt) surgeVolley(s, d);

    if (def.produce && s.cfg.mode !== "raid") {
      const onSecond = def.shot !== undefined;
      const next = (onSecond ? d.cd2 : d.cd) - rate;
      if (next <= 0) {
        const lucky = def.produce.luck !== undefined && rand(s) < def.produce.luck;
        const grow = def.produce.grow;
        const value = grow ? Math.min(grow.max, def.produce.value + d.stacks * grow.step) : def.produce.value;
        if (grow) d.stacks += 1;
        if (value > 0) dropCoin(s, centre + (rand(s) - 0.5) * 0.4, d.lane + 0.25, d.lane + 0.7 + rand(s) * 0.15, value * (lucky ? 2 : 1));
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
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e)) continue;
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
          if (other.dead || isFlat(other) || other.hp >= other.maxHp) continue;
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
        const target = firstAhead(s, d.lane, centre, def.stoneShot.range, true, (e) => isStructure(e) || isFlying(e));
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
          if (Math.abs(f.lane - d.lane) <= 1 && Math.abs(f.col - d.col) <= 1 && !defenderAt(s, f.lane, f.col) && isActiveLane(s, f.lane) && !scorchedAt(s, f.lane, f.col)) {
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
          if (target.state === "raise") abortRaise(s, target, false);
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

    if (s.cfg.oc) orderAct(s, d, def, rate);
  }
}

const MINE_TRAP = { arm: LAND_MINE_ARM, dmg: LAND_MINE_DMG, radius: 0.95 };

// ---------------------------------------------------------------------------
// Order & Chaos: unit abilities

/** On the visible lawn (not still marching in beyond the edge). */
function onLawn(e: Enemy): boolean {
  return e.x <= SIGHT_X + 0.3 && e.x > -0.6;
}

/** Foes that can be hit anywhere on the lawn (graves and tents excluded). */
function foesOnField(s: GarrisonState, keep?: (e: Enemy) => boolean): Enemy[] {
  return s.enemies.filter((e) => shootable(s, e) && !isStructure(e) && onLawn(e) && (!keep || keep(e)));
}

function bulk(e: Enemy): number {
  return Math.max(0, e.hp) + e.armor + e.shield;
}

/** The `count` toughest foes on the lawn (ties: the earliest raised). */
function bulkiestFoes(s: GarrisonState, count: number, keep?: (e: Enemy) => boolean): Enemy[] {
  return foesOnField(s, keep).sort((a, b) => bulk(b) - bulk(a) || a.id - b.id).slice(0, count);
}

/** The nearest foe to a point, within `reach` tiles and `laneReach` lanes, not yet struck. */
function nearestFoe(s: GarrisonState, at: { lane: number; x: number }, reach: number, exclude: ReadonlySet<number>, laneReach = 1): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDist = Number.MAX_VALUE;
  for (const e of s.enemies) {
    if (exclude.has(e.id) || !shootable(s, e) || isStructure(e) || !onLawn(e)) continue;
    const lanes = Math.abs(e.lane - at.lane);
    const dx = Math.abs(e.x - at.x);
    if (lanes > laneReach || dx > reach) continue;
    const dist = dx + lanes;
    if (dist < bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  return best;
}

/** Lightning (or a bolt) that strikes `first` and leaps on to the nearest foes. */
function chainHit(
  s: GarrisonState, from: { lane: number; x: number }, first: Enemy, dmg: number, jumps: number, falloff: number,
  reach: number, tint: "lightning" | "bolt", laneReach = 1
): void {
  const struck = new Set<number>();
  let cur: Enemy | undefined = first;
  let src = from;
  let amount = dmg;
  for (let i = 0; i <= jumps && cur; i += 1) {
    struck.add(cur.id);
    s.events.push({ e: "zap", lane: src.lane, x: src.x, toLane: cur.lane, toX: cur.x, tint });
    src = { lane: cur.lane, x: cur.x };
    hurtEnemy(s, cur, amount, { spell: tint === "lightning" });
    amount *= falloff;
    cur = nearestFoe(s, src, reach, struck, laneReach);
  }
}

/** Neighbours' Ammo Carts: extra shots per volley. */
function ammoAt(s: GarrisonState, d: Defender): number {
  let best = 0;
  for (const o of s.defenders) {
    if (o === d || o.dead || Math.abs(o.lane - d.lane) > 1 || Math.abs(o.col - d.col) > 1 || isSheep(s, o)) continue;
    best = Math.max(best, DEFENDERS[o.kind]!.ammo ?? 0);
  }
  return best;
}

/** War Unicorn wards: share of damage the defender is spared. */
function wardAt(s: GarrisonState, d: Defender): number {
  let best = 0;
  for (const o of s.defenders) {
    if (o.dead || Math.abs(o.lane - d.lane) > 1 || Math.abs(o.col - d.col) > 1 || isSheep(s, o)) continue;
    best = Math.max(best, DEFENDERS[o.kind]!.ward ?? 0);
  }
  return Math.min(0.9, best);
}

/** Leprechauns: a foe slain in their lane or the two beside it may drop gold. */
function luckyDrop(s: GarrisonState, e: Enemy): void {
  for (const d of s.defenders) {
    const luck = DEFENDERS[d.kind]!.luckyKills;
    if (!luck || d.dead || Math.abs(d.lane - e.lane) > 1 || isSheep(s, d)) continue;
    if (rand(s) < luck.chance) {
      dropCoin(s, Math.min(8.6, Math.max(0.4, e.x)), e.lane + 0.2, e.lane + 0.7, luck.value);
      return;
    }
  }
}

/** A tile a summoned defender may take. */
function canSummonAt(s: GarrisonState, lane: number, col: number): boolean {
  const [minCol, maxCol] = s.cfg.defCols;
  return isActiveLane(s, lane) && col >= minCol && col <= maxCol && !defenderAt(s, lane, col) && !tentAt(s, lane, col) && !graveAt(s, lane, col)
    && !scorchedAt(s, lane, col);
}

function fireBeam(s: GarrisonState, d: Defender, lanes: readonly number[], dmg: number): void {
  const centre = d.col + 0.5;
  s.events.push({ e: "beam", id: d.id, lanes: [...lanes] });
  for (const e of [...s.enemies]) {
    if (!lanes.includes(e.lane) || !shootable(s, e) || e.x < centre - 0.2 || e.x > SIGHT_X + 0.3) continue;
    hurtEnemy(s, e, dmg, {});
  }
}

/** A gale: flyers (and a hovering Snatcher) are blown off the field, the rest pushed back. */
function gustFoe(s: GarrisonState, e: Enemy, push: number): void {
  const def = ENEMIES[e.kind]!;
  // Charmed foes fight for Order: its gales spare them.
  if (e.dead || e.charmed || def.structure || def.boss || !onLawn(e)) return;
  if (e.state === "burrow" || e.state === "teleport" || e.state === "vault" || e.state === "flung" || e.state === "glide" || e.state === "phase") return;
  // An Arch-vile blown back loses its hold on the corpse.
  if (e.state === "raise") abortRaise(s, e, true);
  if ((def.flying && !def.anchored) || e.state === "snatch") {
    s.events.push({ e: "blownAway", id: e.id });
    killEnemy(s, e, "normal");
    return;
  }
  // Too heavy for any gale (Black Dragon): it holds its course.
  if (def.anchored) return;
  e.x = Math.min(SPAWN_X - 0.1, e.x + push);
  e.px = e.x;
  if (e.state === "eat" || e.state === "cast" || e.state === "plant") setState(s, e, "walk");
}

/** A lobbed shot from a defender onto a chosen foe (Surges). */
function lobAt(s: GarrisonState, d: Defender, target: Enemy, kind: ProjectileKind, dmg: number, splash: number, shatter: boolean): void {
  const fromX = d.col + 0.7;
  const dist = Math.abs(target.x - fromX);
  s.projectiles.push(newProjectile(s, {
    kind, side: "def", lane: d.lane, x: fromX, dir: 1, dmg, shatter,
    lob: { fromX, toX: target.x, t0: s.tick, dur: 16 + Math.round(dist * 2), targetId: target.id, splash, col: 0, area: false },
  }));
}

function fireInstant(s: GarrisonState, d: Defender): void {
  const inst = DEFENDERS[d.kind]!.instant!;
  const x = d.col + 0.5;
  d.dead = true;
  s.events.push({ e: "dismiss", id: d.id });
  if (inst.kind === "immolate") s.blasts.push({ id: s.nextId++, kind: "fireball", lane: d.lane, x, at: s.tick, dmg: inst.dmg });
  else if (inst.kind === "storm") s.blasts.push({ id: s.nextId++, kind: "storm", lane: d.lane, x, at: s.tick, dmg: inst.dmg });
  else s.blasts.push({ id: s.nextId++, kind: "frost-nova", lane: d.lane, x, at: s.tick, dmg: inst.dmg, freeze: inst.freeze });
}

/** One shot of a Surge volley (Longbowman, Hina). */
function surgeVolley(s: GarrisonState, d: Defender): void {
  const def = DEFENDERS[d.kind]!;
  const surge = def.surge;
  if (!surge || surge.kind !== "storm") {
    d.surgeLeft = 0;
    return;
  }
  const kind: ProjectileKind = def.shot?.projectile ?? "arrow";
  const lanes = surge.lanes === 3 ? [d.lane - 1, d.lane, d.lane + 1].filter((lane) => isActiveLane(s, lane)) : [d.lane];
  for (const lane of lanes) {
    s.projectiles.push(newProjectile(s, {
      kind, side: "def", lane, x: d.col + 0.8, dir: 1, dmg: surge.dmg * (def.power ?? 1), speed: SHOT_SPEED[kind] || 0.3, air: def.shot?.air === true,
    }));
    // Order & Chaos Rearguard: as many behind it.
    if (surge.back) {
      s.projectiles.push(newProjectile(s, {
        kind, side: "def", lane, x: d.col + 0.2, dir: -1, dmg: surge.dmg * (def.power ?? 1), speed: SHOT_SPEED[kind] || 0.3, air: def.shot?.air === true,
      }));
    }
  }
  if (d.surgeLeft % 5 === 0) s.events.push({ e: "defShoot", id: d.id });
  d.surgeLeft -= 1;
  d.surgeAt = s.tick + surge.gap;
}

/** The Order & Chaos abilities of one defender, this tick. */
function orderAct(s: GarrisonState, d: Defender, def: DefDef, rate: number): void {
  const centre = d.col + 0.5;

  if (def.spikes) {
    d.cd -= rate;
    if (d.cd <= 0) {
      d.cd = def.spikes.every;
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e) || Math.abs(e.x - centre) > 0.55) continue;
        hurtEnemy(s, e, def.spikes.dmg, { melee: true });
        // Each foe that tramples it wears it down.
        hurtDefender(s, d, def.spikes.dmg);
        if (d.dead) return;
      }
    }
  }

  if (def.snipe) {
    d.cd -= rate;
    if (d.cd <= 0) {
      const target = bulkiestFoes(s, 1, (e) => e.lane === d.lane && e.x <= SIGHT_X)[0];
      if (target) {
        s.events.push({ e: "snipe", id: d.id, target: target.id, lane: target.lane, x: target.x });
        hurtEnemy(s, target, def.snipe.dmg, { pierce: true });
        d.cd = def.snipe.every;
      } else {
        d.cd = 0;
      }
    }
  }

  if (def.airstrike) {
    d.cd -= rate;
    if (d.cd <= 0) {
      const pool = foesOnField(s, (e) => e.x <= SIGHT_X);
      if (pool.length > 0) {
        const target = pool[randInt(s, 0, pool.length - 1)]!;
        const { lane, x } = target;
        s.events.push({ e: "bomb", lane, x });
        hurtEnemy(s, target, def.airstrike.dmg, {});
        for (const e of [...s.enemies]) {
          if (e === target || e.dead || e.charmed || isStructure(e) || Math.abs(e.lane - lane) > 1 || Math.abs(e.x - x) > 1) continue;
          hurtEnemy(s, e, def.airstrike.dmg * def.airstrike.splash, {});
        }
        d.cd = def.airstrike.every;
      } else {
        d.cd = 0;
      }
    }
  }

  if (def.beam) {
    // Charges only while there is something in her lane to aim at.
    if (firstAhead(s, d.lane, centre, 9.6, false)) {
      d.cd -= rate;
      if (d.cd <= 0) {
        fireBeam(s, d, [d.lane], def.beam.dmg);
        d.cd = def.beam.charge;
      }
    }
  }

  if (def.pounce) {
    d.cd -= rate;
    if (d.cd <= 0) {
      let target: Enemy | undefined;
      for (const e of s.enemies) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e)) continue;
        const dx = e.x - centre;
        if (dx < -0.3 || dx > def.pounce.range) continue;
        if (!target || e.x < target.x) target = e;
      }
      if (target) {
        s.events.push({ e: "pounce", id: d.id, target: target.id });
        hurtEnemy(s, target, def.pounce.dmg, { melee: true });
        d.cd = def.pounce.every;
      } else {
        d.cd = 0;
      }
    }
  }

  if (def.laneHeal) {
    d.cd2 -= rate;
    if (d.cd2 <= 0) {
      d.cd2 = def.laneHeal.every;
      for (const o of s.defenders) {
        if (o.dead || o.lane !== d.lane || isFlat(o) || o.hp >= o.maxHp) continue;
        const amount = Math.min(def.laneHeal.amount, o.maxHp - o.hp);
        o.hp += amount;
        s.events.push({ e: "heal", id: d.id, target: o.id, amount });
      }
    }
  }

  if (def.caster) {
    d.cd -= rate;
    if (d.cd <= 0) {
      const target = firstAhead(s, d.lane, centre, 9.6, true, isStructure);
      if (target) {
        const roll = randInt(s, 0, 2);
        const tint = roll === 0 ? "frost" : roll === 1 ? "fire" : "lightning";
        s.events.push({ e: "zap", lane: d.lane, x: centre, toLane: target.lane, toX: target.x, tint });
        const x = target.x;
        if (roll === 1) {
          const dmg = def.caster.dmg * fireMult(s);
          hurtEnemy(s, target, dmg, { spell: true, fire: true });
          for (const e of [...s.enemies]) {
            if (e === target || e.dead || e.charmed || e.lane !== d.lane || isStructure(e) || Math.abs(e.x - x) > 1) continue;
            hurtEnemy(s, e, dmg * 0.5, { spell: true, fire: true });
          }
        } else {
          hurtEnemy(s, target, def.caster.dmg, { spell: true });
          if (!target.dead && roll === 0 && canChill(target)) target.chillUntil = Math.max(target.chillUntil, s.tick + sec(6));
          if (!target.dead && roll === 2 && canSlow(target) && !ENEMIES[target.kind]!.stunImmune) target.stunUntil = Math.max(target.stunUntil, s.tick + sec(1));
        }
        d.cd = def.caster.every;
      } else {
        d.cd = 0;
      }
    }
  }

  if (def.burnAura) {
    d.cd -= rate;
    if (d.cd <= 0) {
      d.cd = def.burnAura.every;
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e)) continue;
        const dx = e.x - centre;
        if (dx < -0.4 || dx > def.burnAura.reach) continue;
        s.events.push({ e: "flame", id: d.id, target: e.id, lane: e.lane, x: e.x });
        hurtEnemy(s, e, def.burnAura.dmg * fireMult(s), { fire: true });
      }
    }
  }

  if (def.gust) {
    d.cd -= rate;
    if (d.cd <= 0) {
      const range = def.gust.range;
      const struck = s.enemies.filter((e) => e.lane === d.lane && !e.dead && !e.charmed && !isStructure(e) && e.x - centre >= -0.3 && e.x - centre <= range && onLawn(e));
      if (struck.length > 0) {
        s.events.push({ e: "gust", id: d.id, lanes: [d.lane] });
        for (const e of struck) gustFoe(s, e, def.gust.push);
        d.cd = def.gust.every;
      } else {
        d.cd = 0;
      }
    }
  }

  if (def.shellGift) {
    d.cd2 -= rate;
    if (d.cd2 <= 0) {
      let target: Defender | undefined;
      for (const o of s.defenders) {
        if (o === d || o.dead || isFlat(o) || o.shell > 0 || Math.abs(o.lane - d.lane) > 1 || Math.abs(o.col - d.col) > 1) continue;
        if (!target || o.hp / o.maxHp < target.hp / target.maxHp) target = o;
      }
      if (target) {
        target.shell = def.shellGift.amount;
        s.events.push({ e: "shellGift", id: d.id, target: target.id });
        d.cd2 = def.shellGift.every;
      } else {
        d.cd2 = sec(1);
      }
    }
  }

  if (def.chainLightning) {
    d.cd -= rate;
    if (d.cd <= 0) {
      let target: Enemy | undefined;
      for (const e of s.enemies) {
        if (e.lane !== d.lane || !shootable(s, e) || isStructure(e) || e.x > SIGHT_X || e.x < -0.6) continue;
        if (!target || e.x < target.x) target = e;
      }
      if (target) {
        chainHit(s, { lane: d.lane, x: centre }, target, def.chainLightning.dmg, def.chainLightning.jumps, 1, 1.6, "lightning");
        d.cd = def.chainLightning.every;
      } else {
        d.cd = 0;
      }
    }
  }

  if (def.mineLayer) {
    d.cd2 -= rate;
    if (d.cd2 <= 0) {
      const layer = def.mineLayer;
      const own = s.defenders.filter((o) => !o.dead && o.owner === d.id).length;
      let laid = false;
      if (own < layer.max) {
        for (let col = d.col + 1; col <= Math.min(d.col + layer.reach, s.cfg.defCols[1]); col += 1) {
          if (!canSummonAt(s, d.lane, col)) continue;
          const mine = addDefender(s, "mine", d.lane, col);
          mine.owner = d.id;
          s.events.push({ e: "mineLaid", id: d.id, lane: d.lane, col });
          s.events.push({ e: "place", id: mine.id, kind: mine.kind, lane: mine.lane, col });
          laid = true;
          break;
        }
      }
      d.cd2 = laid ? layer.every : sec(2);
    }
  }

  if (def.magnet) {
    d.cd -= rate;
    if (d.cd <= 0) {
      const mg = def.magnet;
      let target: Enemy | undefined;
      let best = Number.MAX_VALUE;
      for (const e of s.enemies) {
        if (!magnetizable(e) || Math.abs(e.lane - d.lane) > 1 || Math.abs(e.x - centre) > mg.range) continue;
        const dist = Math.abs(e.x - centre) + Math.abs(e.lane - d.lane);
        if (dist < best) {
          target = e;
          best = dist;
        }
      }
      if (target) {
        magnetPull(s, d, target);
        d.cd = mg.every;
      } else {
        d.cd = sec(0.5);
      }
    }
  }

  if (def.devour && s.tick >= d.busyUntil) {
    const dv = def.devour;
    let target: Enemy | undefined;
    for (const e of s.enemies) {
      if (e.lane !== d.lane || !grounded(e) || hidden(e) || isStructure(e) || isFlying(e) || e.x > SIGHT_X) continue;
      const dx = e.x - centre;
      if (dx < -0.3 || dx > dv.reach) continue;
      if (!target || Math.abs(dx) < Math.abs(target.x - centre)) target = e;
    }
    if (target) {
      const whole = !ENEMIES[target.kind]!.boss && bulk(target) <= dv.cap;
      s.events.push({ e: "devour", id: d.id, target: target.id, kind: target.kind, lane: target.lane, x: target.x, whole });
      if (whole) {
        killEnemy(s, target, "devour");
        d.busyUntil = s.tick + dv.digest;
      } else {
        hurtEnemy(s, target, dv.bite, { melee: true });
        d.busyUntil = s.tick + sec(4);
      }
    }
  }

  if (def.kite) {
    if (d.cd2 > 0) {
      d.cd2 -= rate;
    } else {
      const near = def.kite.near;
      const pressed = s.enemies.some((e) => e.lane === d.lane && grounded(e) && !hidden(e) && !isStructure(e) && !isFlying(e) && e.x - centre >= -0.2 && e.x - centre <= near);
      if (pressed) {
        const to = d.col - 1;
        if (canSummonAt(s, d.lane, to)) {
          s.events.push({ e: "kite", id: d.id, from: d.col, to });
          d.col = to;
          d.cd2 = def.kite.every;
        } else {
          d.cd2 = sec(1);
        }
      }
    }
  }

  // Bellwether: walkers in the lanes beside it that come near swerve into its lane to attack it.
  if (def.lure && (s.tick + d.id) % 5 === 0 && !s.atk.raided.includes(d.lane)) {
    for (const e of s.enemies) {
      if (Math.abs(e.lane - d.lane) !== 1 || !lurable(s, e)) continue;
      const dx = e.x - centre;
      if (dx < -0.3 || dx > def.lure.reach) continue;
      // Already heading for a bellwether of its own lane: it keeps to it (no tug of war).
      if (s.defenders.some((o) => !o.dead && o.lane === e.lane && DEFENDERS[o.kind]!.lure && !isSheep(s, o)
        && e.x - (o.col + 0.5) >= -0.3 && e.x - (o.col + 0.5) <= DEFENDERS[o.kind]!.lure!.reach)) continue;
      lureFoe(s, e, d);
    }
  }

  // Lizard Warrior: badly wounded, it charges down its lane and leaves the lawn.
  if (def.lastCharge && d.hp < d.maxHp * def.lastCharge.below) {
    d.dead = true;
    s.events.push({ e: "lizardCharge", id: d.id, kind: d.kind, lane: d.lane, col: d.col });
    s.chargers.push({ lane: d.lane, state: "charging", x: centre, px: centre, dmg: def.lastCharge.dmg, hits: [], sprite: def.sprite });
  }
}

/** A Chaos walker a Bellwether can draw across (on foot, marching, on the lawn, not a shooter or an engine). */
function lurable(s: GarrisonState, e: Enemy, busy = false): boolean {
  if (e.dead || (e.state !== "walk" && !(busy && e.state === "eat")) || e.dir >= 0 || e.charmed || e.fleeing || e.leader || hidden(e) || e.x > SIGHT_X) return false;
  const ed = ENEMIES[e.kind]!;
  return !ed.boss && !ed.structure && !ed.flying && !ed.ranged && !ed.roller && !ed.siege && !ed.snatch && !ed.dig && !ed.burrow && ed.bite > 0;
}

/** A walker swerves from its lane into a Bellwether's (unless it would come down inside a troop). */
function lureFoe(s: GarrisonState, e: Enemy, d: Defender): boolean {
  if (s.defenders.some((o) => !o.dead && o.lane === d.lane && !isFlat(o) && Math.abs(o.col + 0.5 - e.x) < 0.6)) return false;
  e.from = e.lane;
  e.to = d.lane;
  e.lane = d.lane;
  setState(s, e, "glide", sec(0.6));
  s.events.push({ e: "lure", id: d.id, target: e.id });
  return true;
}

/** A foe whose helm, armour or shield a lodestone can reach. */
function magnetizable(e: Enemy): boolean {
  return !e.dead && !e.charmed && !hidden(e) && !isStructure(e) && onLawn(e) && e.x <= SIGHT_X && (e.armor > 0 || e.shield > 0)
    && e.state !== "burrow" && e.state !== "teleport";
}

/** A lodestone tears the helm / armour (or else the shield) off a foe. */
function magnetPull(s: GarrisonState, d: Defender, e: Enemy): void {
  const piece: "armor" | "shield" = e.armor > 0 ? "armor" : "shield";
  if (piece === "armor") e.armor = 0;
  else e.shield = 0;
  s.events.push({ e: "magnet", id: d.id, target: e.id, piece, kind: e.kind, lane: e.lane, x: e.x, dir: e.dir });
  armorLost(s, e);
}

/** A Surge orb dropped on a defender: its own power-up. */
function applySurge(s: GarrisonState, d: Defender): void {
  const def = DEFENDERS[d.kind]!;
  const surge = def.surge!;
  const p = def.power ?? 1;
  const centre = d.col + 0.5;
  s.events.push({ e: "surge", id: d.id, kind: surge.kind });
  switch (surge.kind) {
    case "gold":
      for (let i = 0; i < surge.coins; i += 1) {
        dropCoin(s, centre + (i - (surge.coins - 1) / 2) * 0.35, d.lane + 0.15, d.lane + 0.7, Math.round(surge.value * p));
      }
      return;
    case "audit":
      for (const pk of s.pickups) if (!pk.dead && pk.kind !== "surge") pk.value *= 2;
      dropCoin(s, centre, d.lane + 0.15, d.lane + 0.7, Math.round(surge.bonus * p));
      return;
    case "rainbow":
      for (let i = 0; i < surge.coins; i += 1) {
        const lane = s.cfg.lanes[randInt(s, 0, s.cfg.lanes.length - 1)] ?? d.lane;
        dropCoin(s, 0.6 + rand(s) * 7.8, -0.6, lane + 0.55 + rand(s) * 0.3, Math.round(surge.value * p));
      }
      return;
    case "mana":
      s.def.mana = s.def.manaMax;
      s.def.spellReady = {};
      return;
    case "storm":
      d.surgeLeft = surge.shots;
      d.surgeAt = s.tick;
      return;
    case "freeze-lane":
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !shootable(s, e) || isStructure(e) || !onLawn(e)) continue;
        hurtEnemy(s, e, surge.dmg * p, { spell: true });
        if (!e.dead && canChill(e)) e.freezeUntil = Math.max(e.freezeUntil, s.tick + surge.dur);
      }
      return;
    case "chain": {
      const first = firstAhead(s, d.lane, centre, 9.6, true, isStructure) ?? bulkiestFoes(s, 1)[0];
      if (first) chainHit(s, { lane: d.lane, x: centre }, first, surge.dmg * p, surge.hops, 1, 10, "bolt", 4);
      return;
    }
    case "rockfall":
      for (const t of bulkiestFoes(s, surge.count, (e) => !isFlying(e))) lobAt(s, d, t, "boulder", surge.dmg * p, 0, true);
      return;
    case "headshot":
      for (const t of bulkiestFoes(s, surge.count)) {
        s.events.push({ e: "snipe", id: d.id, target: t.id, lane: t.lane, x: t.x });
        hurtEnemy(s, t, surge.dmg * p, { pierce: true });
      }
      return;
    case "cluster":
      for (let i = 0; i < surge.count; i += 1) {
        const pool = foesOnField(s, (e) => !isFlying(e));
        if (pool.length === 0) break;
        lobAt(s, d, pool[randInt(s, 0, pool.length - 1)]!, "fireball", surge.dmg * p, surge.dmg * p * 0.5, false);
      }
      return;
    case "smite":
      for (const e of foesOnField(s)) {
        s.events.push({ e: "lightning", id: d.id, target: e.id, lane: e.lane, x: e.x });
        hurtEnemy(s, e, surge.dmg * p, { spell: true });
      }
      return;
    case "bolts":
      for (const lane of [d.lane - 1, d.lane, d.lane + 1]) {
        if (!isActiveLane(s, lane)) continue;
        for (let i = 0; i < surge.count; i += 1) {
          s.projectiles.push(newProjectile(s, {
            kind: "spear", side: "def", lane, x: centre + 0.3 - i * 0.5, dir: 1, dmg: surge.dmg * p, speed: SHOT_SPEED.spear, pierce: 99, air: true,
          }));
        }
      }
      return;
    case "broadside":
      for (const lane of s.cfg.lanes) {
        s.projectiles.push(newProjectile(s, {
          kind: "rocket", side: "def", lane, x: centre + 0.3, dir: 1, dmg: surge.dmg * p * fireMult(s), speed: SHOT_SPEED.rocket,
          blast: surge.dmg * p * 0.5 * fireMult(s),
        }));
      }
      return;
    case "beam":
      if (def.beam) {
        fireBeam(s, d, [d.lane - 1, d.lane, d.lane + 1].filter((lane) => isActiveLane(s, lane)), def.beam.dmg * 2);
        d.cd = def.beam.charge;
      }
      return;
    case "plate":
      d.shell = Math.min(Math.round(surge.amount * p * 2), d.shell + Math.round(surge.amount * p));
      return;
    case "stomp":
      for (const e of [...s.enemies]) {
        if (Math.abs(e.lane - d.lane) > 1 || Math.abs(e.x - centre) > 1.5 || !grounded(e) || isStructure(e) || isFlying(e)) continue;
        hurtEnemy(s, e, surge.dmg * p, { melee: true });
        if (!e.dead && canSlow(e) && !ENEMIES[e.kind]!.stunImmune) e.stunUntil = Math.max(e.stunUntil, s.tick + surge.dur);
      }
      return;
    case "phalanx":
      for (const col of [d.col + 1, d.col - 1]) {
        if (!canSummonAt(s, d.lane, col)) continue;
        // Copies are the unit's normal form (an Ascension is not copied).
        const copy = addDefender(s, def.ascendedFrom ?? d.kind, d.lane, col);
        copy.expireAt = s.tick + surge.life;
        s.events.push({ e: "place", id: copy.id, kind: copy.kind, lane: copy.lane, col });
      }
      return;
    case "charge":
      s.events.push({ e: "sweep", id: d.id, lane: d.lane });
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e) || e.x < centre - 0.3 || e.x > SIGHT_X) continue;
        hurtEnemy(s, e, surge.dmg * p, { melee: true });
      }
      return;
    case "rampage":
      s.events.push({ e: "sweep", id: d.id, lane: d.lane });
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e) || e.x > SIGHT_X) continue;
        hurtEnemy(s, e, surge.dmg * p, { melee: true });
        if (!e.dead && canSlow(e) && !ENEMIES[e.kind]!.stunImmune) e.stunUntil = Math.max(e.stunUntil, s.tick + sec(2));
      }
      return;
    case "sanctuary":
      for (const o of s.defenders) {
        if (!o.dead && Math.abs(o.lane - d.lane) <= 1 && Math.abs(o.col - d.col) <= 1) o.invulnUntil = s.tick + surge.dur;
      }
      return;
    case "mass-heal":
      for (const o of s.defenders) {
        if (o.dead || isFlat(o) || o.hp >= o.maxHp) continue;
        const amount = Math.min(Math.round(surge.amount * p), o.maxHp - o.hp);
        o.hp += amount;
        s.events.push({ e: "heal", id: d.id, target: o.id, amount });
      }
      return;
    case "mass-slow": {
      const targets = s.enemies.filter((e) => !e.dead && canSlow(e) && onLawn(e));
      for (const e of targets) e.slowUntil = Math.max(e.slowUntil, s.tick + surge.dur);
      s.events.push({ e: "slowCast", id: d.id, targets: targets.map((e) => e.id) });
      return;
    }
    case "resurrect-all": {
      const fallen = s.def.fallen;
      for (let i = fallen.length - 1; i >= 0; i -= 1) {
        const f = fallen[i]!;
        if (Math.abs(f.lane - d.lane) > 1 || Math.abs(f.col - d.col) > 1 || !DEFENDERS[f.kind] || !canSummonAt(s, f.lane, f.col)) continue;
        fallen.splice(i, 1);
        const raised = addDefender(s, f.kind, f.lane, f.col);
        s.events.push({ e: "defRise", id: raised.id, kind: raised.kind, how: "resurrect" });
      }
      return;
    }
    case "stare":
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e) || e.x > SIGHT_X || e.dead) continue;
        s.events.push({ e: "gaze", id: d.id, target: e.id });
        petrify(s, e, surge.bossDmg * p);
      }
      return;
    case "meteors":
      for (const t of bulkiestFoes(s, surge.count)) {
        s.blasts.push({ id: s.nextId++, kind: "fireball", lane: t.lane, x: t.x, at: s.tick + FIREBALL_DELAY, dmg: surge.dmg * p });
        s.events.push({ e: "fireballAim", lane: t.lane, x: t.x });
      }
      return;
    case "supernova":
      s.blasts.push({ id: s.nextId++, kind: "eruption", lane: d.lane, x: centre, at: s.tick, dmg: surge.dmg * p });
      d.reborn = false;
      d.hp = d.maxHp;
      return;
    case "tempest":
      s.events.push({ e: "gust", id: d.id, lanes: [...s.cfg.lanes] });
      for (const e of [...s.enemies]) gustFoe(s, e, surge.push);
      return;
    case "quake":
      s.events.push({ e: "sweep", id: d.id, lane: d.lane });
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e) || e.x > SIGHT_X) continue;
        hurtEnemy(s, e, surge.dmg * p, { pierce: true });
      }
      return;
    case "tide":
      for (const o of s.defenders) if (!o.dead && !isFlat(o)) o.shell = Math.max(o.shell, Math.round(surge.amount * p));
      return;
    case "fire-lane":
      s.blasts.push({ id: s.nextId++, kind: "fire-wall", lane: d.lane, x: centre, at: s.tick + FIRE_WALL_DELAY, dmg: surge.dmg * p });
      return;
    case "rearm":
      d.armedAt = s.tick;
      for (let col = d.col + 1; col <= s.cfg.defCols[1]; col += 1) {
        if (!canSummonAt(s, d.lane, col)) continue;
        const extra = addDefender(s, d.kind, d.lane, col);
        extra.armedAt = s.tick;
        s.events.push({ e: "place", id: extra.id, kind: extra.kind, lane: d.lane, col });
        break;
      }
      return;
    case "hospital":
      for (const o of s.defenders) {
        if (o.dead || o.lane !== d.lane || isFlat(o)) continue;
        const amount = o.maxHp - o.hp;
        o.hp = o.maxHp;
        o.poisonUntil = 0;
        o.cursedUntil = 0;
        o.stunnedUntil = 0;
        clearHex(s, o);
        if (amount > 0) s.events.push({ e: "heal", id: d.id, target: o.id, amount });
      }
      return;
    case "reload":
      // A full volley right away (Ammo Carts' extra shots included).
      for (const o of s.defenders) {
        const shot = DEFENDERS[o.kind]!.shot;
        if (o.dead || !shot || o.stunnedUntil > s.tick) continue;
        o.shotsLeft = 1 + (shot.volley ?? 0) + ammoAt(s, o);
        o.shotAt = s.tick;
      }
      return;
    case "overload":
      for (const e of foesOnField(s, (foe) => Math.abs(foe.lane - d.lane) <= 1 && foe.x <= SIGHT_X)) {
        s.events.push({ e: "zap", lane: d.lane, x: centre, toLane: e.lane, toX: e.x, tint: "lightning" });
        hurtEnemy(s, e, surge.dmg * p, { spell: true });
      }
      return;
    case "whirl":
      s.events.push({ e: "whirl", id: d.id });
      for (const e of [...s.enemies]) {
        if (Math.abs(e.lane - d.lane) > 1 || Math.abs(e.x - centre) > 1.5 || !grounded(e) || isStructure(e) || isFlying(e)) continue;
        hurtEnemy(s, e, surge.dmg * p, { melee: true });
        if (!e.dead && canSlow(e) && !ENEMIES[e.kind]!.stunImmune) e.stunUntil = Math.max(e.stunUntil, s.tick + surge.dur);
      }
      return;
    case "skyfall":
      for (const e of foesOnField(s, isFlying)) {
        s.events.push({ e: "bomb", lane: e.lane, x: e.x });
        hurtEnemy(s, e, surge.dmg * p, {});
      }
      return;
    case "roots": {
      const targets = s.enemies.filter((e) => Math.abs(e.lane - d.lane) <= 1 && grounded(e) && !isStructure(e) && !isFlying(e)
        && e.x >= centre - 0.3 && e.x <= centre + surge.reach && canSlow(e) && !ENEMIES[e.kind]!.stunImmune);
      for (const e of targets) e.stunUntil = Math.max(e.stunUntil, s.tick + surge.dur);
      s.events.push({ e: "roots", id: d.id, targets: targets.map((e) => e.id) });
      return;
    }
    case "blizzard": {
      const lanes = [d.lane - 1, d.lane, d.lane + 1].filter((lane) => isActiveLane(s, lane));
      s.events.push({ e: "blizzard", id: d.id, lanes });
      for (const e of [...s.enemies]) {
        if (!lanes.includes(e.lane) || !shootable(s, e) || isStructure(e) || !onLawn(e)) continue;
        hurtEnemy(s, e, surge.dmg * p, { spell: true });
        if (!e.dead && canChill(e)) e.freezeUntil = Math.max(e.freezeUntil, s.tick + surge.dur);
      }
      return;
    }
    case "minefield":
      for (let col = d.col + 1, laid = 0; col <= s.cfg.defCols[1] && laid < 4; col += 1) {
        if (!canSummonAt(s, d.lane, col)) continue;
        const mine = addDefender(s, "mine", d.lane, col);
        mine.armedAt = s.tick;
        mine.owner = d.id;
        s.events.push({ e: "mineLaid", id: d.id, lane: d.lane, col });
        s.events.push({ e: "place", id: mine.id, kind: mine.kind, lane: mine.lane, col });
        laid += 1;
      }
      return;
    case "scatter":
      // Every foe in her lane wanders off into the lanes beside it, bewildered.
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e) || ENEMIES[e.kind]!.boss || !onLawn(e) || e.x > SIGHT_X) continue;
        divertFoe(s, e, surge.dur, d.id);
      }
      return;
    case "magnetize":
      for (const e of [...s.enemies]) if (magnetizable(e)) magnetPull(s, d, e);
      return;
    case "feast": {
      const dv = def.devour;
      if (!dv) return;
      const prey = s.enemies
        .filter((e) => e.lane === d.lane && grounded(e) && !isStructure(e) && !isFlying(e) && !ENEMIES[e.kind]!.boss && e.x <= SIGHT_X
          && e.x - centre >= -0.3 && e.x - centre <= surge.reach && bulk(e) <= dv.cap)
        .sort((a, b) => a.x - b.x || a.id - b.id)
        .slice(0, surge.count);
      for (const e of prey) {
        s.events.push({ e: "devour", id: d.id, target: e.id, kind: e.kind, lane: e.lane, x: e.x, whole: true });
        killEnemy(s, e, "devour");
      }
      // ...and it is hungry again at once.
      d.busyUntil = s.tick;
      return;
    }
    case "charm": {
      const dist = (e: Enemy) => Math.abs(e.x - centre) + Math.abs(e.lane - d.lane);
      const foes = s.enemies
        .filter((e) => Math.abs(e.lane - d.lane) <= 1 && grounded(e) && !isStructure(e) && !isFlying(e) && !ENEMIES[e.kind]!.boss && !ENEMIES[e.kind]!.smash
          && onLawn(e) && e.x <= SIGHT_X && e.x >= centre - 0.3)
        .sort((a, b) => dist(a) - dist(b) || a.id - b.id)
        .slice(0, surge.count);
      for (const e of foes) charmFoe(s, e, d.id, def.charm?.mult ?? 1);
      return;
    }
    case "dome":
      d.domeUntil = s.tick + surge.dur;
      return;
    case "herd":
      // Every walker on the lawn in the lanes beside it is drawn into its lane.
      for (const e of s.enemies) {
        if (Math.abs(e.lane - d.lane) !== 1 || !lurable(s, e, true) || e.x < centre - 0.3) continue;
        lureFoe(s, e, d);
      }
      d.shell = Math.max(d.shell, Math.round(surge.shell * p));
      return;
    case "war-party":
      for (const lane of [d.lane - 1, d.lane, d.lane + 1]) {
        if (!isActiveLane(s, lane)) continue;
        s.chargers.push({ lane, state: "charging", x: centre, px: centre, dmg: Math.round(surge.dmg * p), hits: [], sprite: def.sprite });
      }
      return;
    case "air-raid":
      for (const lane of s.cfg.lanes) {
        const front = foesOnField(s, (e) => e.lane === lane && e.x <= SIGHT_X).sort((a, b) => a.x - b.x)[0];
        if (!front) continue;
        const x = front.x;
        s.events.push({ e: "bomb", lane, x });
        hurtEnemy(s, front, surge.dmg * p, {});
        for (const o of [...s.enemies]) {
          if (o === front || o.dead || o.charmed || o.lane !== lane || isStructure(o) || Math.abs(o.x - x) > 1) continue;
          hurtEnemy(s, o, surge.dmg * p * 0.5, {});
        }
      }
      return;
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
    if (!lanes.includes(e.lane) || !grounded(e) || isStructure(e) || (isFlying(e) && !m.air)) return false;
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
  const zeal = def.zeal;
  setTimer(zeal ? m.every / (1 + Math.min(zeal.max, d.stacks) * zeal.per) : m.every);
  s.events.push({ e: "defStrike", id: d.id, target: targets[0]!.id });
  const blow = m.blow && d.strikes % m.blow === 0 ? 3 : 1;
  const club = (has(s, "ogres-club") ? 1.5 : 1) * (s.def.frenzyUntil > s.tick ? 2 : 1);
  for (const e of targets) {
    const def = ENEMIES[e.kind]!;
    if (m.dispel && e.shield > 0) {
      e.shield = 0;
      s.events.push({ e: "shieldBreak", id: e.id, kind: e.kind, lane: e.lane, x: e.x, dir: e.dir });
      if (def.enrage?.at === "break") enrageEnemy(s, e);
    }
    const dealt = hurtEnemy(s, e, m.dmg * blow * club * (m.antiCavalry && def.cavalry ? 2 : 1), { melee: true });
    if (m.drain && dealt > 0) d.hp = Math.min(d.maxHp, d.hp + Math.round(dealt * m.drain));
    if (zeal && e.dead && d.stacks < zeal.max) d.stacks += 1;
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
  // Only anti-air straight shots see flyers.
  const skip = shot.lob || !shot.air ? isFlying : undefined;
  const sees = lanes.some((lane) => firstAhead(s, lane, centre, shot.range, shot.lob === true, skip) !== undefined)
    || (shot.back === true && !shot.lob && foeBehind(s, d.lane, centre, shot.air === true) !== undefined);
  if (!sees) {
    d.cd = 0;
    return;
  }
  s.events.push({ e: "defShoot", id: d.id });
  d.shotAt = s.tick + Math.max(1, Math.round(shot.windup / Math.max(rate, 0.5)));
  d.shotsLeft = 1 + (shot.volley ?? 0) + (s.cfg.oc ? ammoAt(s, d) : 0);
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
    shatter: false, cloud: false, blast: 0, skipWalls: false, stun: null, manaOnHit: 0, air: false, chain: null, curse: 0,
    holy: false, underShield: false, boomerang: null, passed: [], lob: null, dead: false,
    ...init,
  };
}

function releaseShot(s: GarrisonState, d: Defender): void {
  const shot = DEFENDERS[d.kind]!.shot!;
  const centre = d.col + 0.5;
  const bow = (shot.projectile === "arrow" || shot.projectile === "frost" || shot.projectile === "spear") && has(s, "elven-bow") ? 1.3 : 1;
  d.shots += 1;
  // Order & Chaos criticals (Longbowman).
  const crit = shot.crit && d.shots % shot.crit.every === 0 ? shot.crit.mult : 1;
  if (shot.lob) {
    const target = firstAhead(s, d.lane, centre, shot.range, true, isFlying);
    if (!target) return;
    const dist = Math.max(0.5, target.x - centre);
    const fire = FIRE_SHOTS.has(shot.projectile) ? fireMult(s) : 1;
    const stun = shot.stunEvery && d.shots % shot.stunEvery.every === 0 ? { chance: 1, dur: shot.stunEvery.dur } : null;
    s.projectiles.push(newProjectile(s, {
      kind: shot.projectile, side: "def", lane: d.lane, x: centre + 0.2, dir: 1, dmg: shot.dmg * fire * crit, shatter: shot.shatter === true, cloud: shot.cloud === true, stun,
      lob: { fromX: centre + 0.2, toX: target.x, t0: s.tick, dur: 16 + Math.round(dist * 2), targetId: target.id, splash: (shot.splash ?? 0) * fire, col: 0, area: false },
    }));
    return;
  }
  const lanes = shot.lanes === 3 ? [d.lane - 1, d.lane, d.lane + 1].filter((lane) => isActiveLane(s, lane)) : [d.lane];
  const freeze = shot.freezeEvery !== undefined && d.shots % shot.freezeEvery === 0;
  const pierce = (shot.pierce ?? 1) + (has(s, "golden-bow") ? 1 : 0);
  const straight = (lane: number, dir: 1 | -1) => newProjectile(s, {
    kind: shot.projectile, side: "def", lane, x: centre + 0.3 * dir, dir, dmg: shot.dmg * bow * crit, speed: SHOT_SPEED[shot.projectile],
    maxX: shot.range < 9 ? centre + shot.range + 0.3 : 10.4, pierce,
    chill: shot.chill === true, freeze, burn: shot.ignited === true, manaOnHit: shot.manaOnHit ?? 0,
    air: shot.air === true, chain: shot.chain ?? null,
    blast: (shot.splash ?? 0) * (FIRE_SHOTS.has(shot.projectile) ? fireMult(s) : 1),
    holy: shot.holy === true, underShield: shot.underShield === true,
    boomerang: shot.boomerang && dir > 0 ? { home: centre, pierce, back: false } : null,
  });
  // Order & Chaos Rearguard: the volley goes behind it when that is where the foes are.
  const behind = shot.back === true && foeBehind(s, d.lane, centre, shot.air === true) !== undefined;
  const ahead = !behind || lanes.some((lane) => firstAhead(s, lane, centre, shot.range, false, shot.air ? undefined : isFlying) !== undefined);
  if (ahead) for (const lane of lanes) s.projectiles.push(straight(lane, 1));
  if (behind) s.projectiles.push(straight(d.lane, -1));
}

/** The nearest shootable foe behind a defender in its lane (something that slipped past). */
function foeBehind(s: GarrisonState, lane: number, x: number, air: boolean): Enemy | undefined {
  let best: Enemy | undefined;
  for (const e of s.enemies) {
    if (e.lane !== lane || !shootable(s, e) || isStructure(e) || (!air && isFlying(e)) || e.x >= x - 0.2 || e.x < -0.6) continue;
    if (!best || e.x > best.x) best = e;
  }
  return best;
}

/** A boomerang at the end of its outward flight (or out of cuts) turns for home, ready to cut again. */
function turnBoomerang(p: Projectile): boolean {
  if (!p.boomerang || p.boomerang.back) return false;
  p.boomerang.back = true;
  p.dir = -1;
  p.hit = [];
  p.pierce = p.boomerang.pierce;
  return true;
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
    const lo = Math.min(x0, p.x);
    const hi = Math.max(x0, p.x);
    for (const d of s.defenders) {
      if (d.dead || d.lane !== p.lane || !DEFENDERS[d.kind]!.ignite || p.passed.includes(d.id) || isSheep(s, d)) continue;
      const c = d.col + 0.5;
      if (p.dir > 0 ? c > x0 && c <= p.x : c < x0 && c >= p.x) {
        p.passed.push(d.id);
        p.chill = false;
        p.freeze = false;
        p.burn = true;
        p.burnSplash = Math.max(p.burnSplash, DEFENDERS[d.kind]!.ignite!.splash);
      }
    }
    const candidates = s.enemies
      .filter((e) => e.lane === p.lane && grounded(e) && shootable(s, e) && !p.hit.includes(e.id) && e.x > -0.6 && (p.air || !isFlying(e)))
      .filter((e) => {
        const r = ENEMIES[e.kind]!.radius ?? 0.3;
        return e.x + r >= lo && e.x - r <= hi;
      })
      .sort((a, b) => (a.x - b.x) * p.dir);
    let reflected = false;
    for (const e of candidates) {
      // Order & Chaos: a spinning Prism Elemental turns the shot back on the defenders.
      if (p.dir > 0 && prismSpinning(s, e)) {
        reflectShot(s, p, e);
        reflected = true;
        break;
      }
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
        // A boomerang out of cuts heads home early; anything else is spent.
        if (!turnBoomerang(p)) p.dead = true;
        break;
      }
    }
    if (p.dead || reflected) continue;
    if (p.dir > 0 && p.x > p.maxX) {
      if (!turnBoomerang(p)) p.dead = true;
    } else if (p.dir < 0 && (p.boomerang ? p.x <= p.boomerang.home : p.x < -0.8)) {
      p.dead = true;
    }
  }
}

/** Order & Chaos Prism Elemental: spinning (and not held by frost or a stun). */
function prismSpinning(s: GarrisonState, e: Enemy): boolean {
  return ENEMIES[e.kind]!.prism !== undefined && (e.spinUntil ?? 0) > s.tick && e.freezeUntil <= s.tick && e.stunUntil <= s.tick && !e.charmed;
}

/** A straight shot glances off a spinning prism and flies back down the lane at the defenders (weaker, stripped of its tricks). */
function reflectShot(s: GarrisonState, p: Projectile, e: Enemy): void {
  const share = ENEMIES[e.kind]!.prism!.share;
  Object.assign(p, {
    side: "atk", dir: -1, x: e.x - 0.35, px: e.x - 0.35, dmg: Math.round(p.dmg * share), speed: Math.max(0.26, p.speed),
    pierce: 1, hit: [], chill: false, freeze: false, burn: false, burnSplash: 0, shatter: false, cloud: false, blast: 0, skipWalls: false,
    stun: null, manaOnHit: 0, air: false, chain: null, curse: 0, holy: false, underShield: false, boomerang: null, passed: [], reflected: true
  } satisfies Partial<Projectile>);
  s.events.push({ e: "reflect", id: e.id, kind: p.kind, lane: p.lane, x: e.x });
}

function projectileHit(s: GarrisonState, p: Projectile, e: Enemy): void {
  const def = ENEMIES[e.kind]!;
  let dmg = p.dmg * (p.holy && def.undead ? 2 : 1);
  if (p.burn && !def.fireImmune) dmg += p.dmg * fireMult(s);
  const fire = p.burn || FIRE_SHOTS.has(p.kind);
  const hitX = e.x;
  // A torpedo runs beneath the shield (it soaks none of it).
  const dealt = hurtEnemy(s, e, dmg, { straight: !p.underShield, fromDir: p.dir, fire });
  s.events.push({ e: "projectileHit", kind: p.kind, lane: p.lane, x: hitX, burn: p.burn });
  if (p.blast > 0) {
    // A rocket bursts: every other foe within a tile, in three lanes.
    const blast = p.blast;
    p.blast = 0;
    for (const other of [...s.enemies]) {
      if (other === e || other.dead || isStructure(other) || !grounded(other) || isFlying(other) || Math.abs(other.lane - p.lane) > 1 || Math.abs(other.x - hitX) > 1) continue;
      hurtEnemy(s, other, blast, { fire: true });
    }
  }
  if (p.manaOnHit > 0 && dealt > 0) gainManaFraction(s, p.manaOnHit);
  // Arch Mage bolts leap on to nearby foes.
  if (p.chain) {
    const struck = new Set<number>([e.id]);
    let src = { lane: e.lane, x: hitX };
    let amount = p.dmg;
    for (let i = 0; i < p.chain.jumps; i += 1) {
      amount *= p.chain.falloff;
      const next = nearestFoe(s, src, 1.6, struck);
      if (!next) break;
      struck.add(next.id);
      s.events.push({ e: "zap", lane: src.lane, x: src.x, toLane: next.lane, toX: next.x, tint: "bolt" });
      src = { lane: next.lane, x: next.x };
      hurtEnemy(s, next, amount, {});
    }
  }
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
    const target = s.enemies.find((e) => e.id === lob.targetId && !e.dead && !e.charmed);
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
    // Order & Chaos: a lob falling on an Aegis dome bounces off it.
    const dome = aegisOver(s, p.lane, lob.col);
    if (dome) {
      s.events.push({ e: "aegis", id: dome.id, lane: p.lane, x: lob.col + 0.5, kind: p.kind });
      return;
    }
    s.events.push({ e: "cloudHit", kind: p.kind, lane: p.lane, x: lob.col + 0.5 });
    for (const d of s.defenders) {
      if (d.dead || isFlat(d)) continue;
      const inArea = lob.area ? Math.abs(d.lane - p.lane) <= 1 && Math.abs(d.col - lob.col) <= 1 : d.lane === p.lane && d.col === lob.col;
      if (!inArea) continue;
      // ...and the troops under a dome beside the blast are spared.
      if (lob.area && aegisOver(s, d.lane, d.col)) continue;
      hurtDefender(s, d, p.dmg, { atk: true, cloud: p.cloud, magic: p.cloud });
      // Order & Chaos hexes and webs.
      if (d.dead) continue;
      const steadfast = DEFENDERS[d.kind]!.steadfast === true;
      if (p.curse > 0 && !steadfast) d.cursedUntil = Math.max(d.cursedUntil, s.tick + p.curse);
      if (p.stun && rand(s) < p.stun.chance && !steadfast) {
        d.stunnedUntil = s.tick + p.stun.dur;
        s.events.push({ e: "defStun", id: d.id });
      }
    }
    return;
  }
  let target = s.enemies.find((e) => e.id === lob.targetId && !e.dead && !e.charmed);
  if (!target) {
    let best: Enemy | undefined;
    for (const e of [...s.enemies]) {
      if (e.lane !== p.lane || !shootable(s, e) || isFlying(e) || Math.abs(e.x - p.x) > 0.6) continue;
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
    // Order & Chaos: a Cyclops' third boulder stuns.
    if (p.stun && !target.dead && canSlow(target) && !ENEMIES[target.kind]!.stunImmune) target.stunUntil = Math.max(target.stunUntil, s.tick + p.stun.dur);
  }
  if (lob.splash > 0) {
    for (const e of [...s.enemies]) {
      if (e === target || e.dead || e.charmed || isStructure(e) || isFlying(e) || e.state === "burrow" || e.state === "teleport" || Math.abs(e.lane - p.lane) > 1) continue;
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
    if (d.dead || d.lane !== p.lane || isFlat(d)) continue;
    if (p.skipWalls && isWall(DEFENDERS[d.kind]!)) continue;
    // A Spectre is not there for the shooter: the shot passes through.
    if (DEFENDERS[d.kind]!.veiled) continue;
    const c = d.col + 0.5;
    if (c <= x0 + 0.2 && c >= p.x - 0.3 && (!hit || c > hit.col + 0.5)) hit = d;
  }
  if (hit) {
    p.dead = true;
    // Order & Chaos: a Surge-widened Aegis dome turns straight shots aside too.
    const dome = aegisOver(s, hit.lane, hit.col, true);
    if (dome) {
      s.events.push({ e: "aegis", id: dome.id, lane: p.lane, x: hit.col + 0.5, kind: p.kind });
      return;
    }
    s.events.push({ e: "projectileHit", kind: p.kind, lane: p.lane, x: hit.col + 0.5, burn: false });
    if (p.blast > 0) {
      for (const d of s.defenders) {
        if (d === hit || d.dead || isFlat(d) || Math.abs(d.lane - hit.lane) > 1 || Math.abs(d.col - hit.col) > 1) continue;
        hurtDefender(s, d, p.dmg * 0.5, { atk: true });
      }
    }
    hurtDefender(s, hit, p.dmg, { atk: true });
    const steadfast = DEFENDERS[hit.kind]!.steadfast === true;
    if (!hit.dead && p.stun && rand(s) < p.stun.chance && !steadfast) {
      hit.stunnedUntil = s.tick + p.stun.dur;
      s.events.push({ e: "defStun", id: hit.id });
    }
    if (!hit.dead && p.curse > 0 && !steadfast) hit.cursedUntil = Math.max(hit.cursedUntil, s.tick + p.curse);
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
    // Armed charges lie flat; spikes are walked over.
    if (isFlat(d) && (s.tick >= d.armedAt || DEFENDERS[d.kind]!.spikes)) continue;
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
  const oppressed = has(s, "spirit-of-oppression");
  for (const a of s.enemies) {
    const aura = ENEMIES[a.kind]!.aura;
    if (!aura || a.dead || oppressed) continue;
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
    // Order & Chaos: a Harpy Snatcher hovering over her prey.
    if (def.snatch && !e.charmed && snatchAct(s, e)) continue;
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
      case "glide":
        // A Nomad swerving (or a bewildered foe wandering) into the next lane; a zig-zagger keeps running as it leaps.
        if (def.zigzag && rate > 0) {
          e.x += def.speed * rate * e.dir;
          reachGate(s, e);
        }
        if (s.tick >= e.stateUntil) setState(s, e, "walk");
        continue;
      case "phase":
        phaseAct(s, e, rate);
        continue;
      case "raise":
        raiseAct(s, e, rate);
        continue;
      case "plant":
        plantAct(s, e, rate);
        continue;
      default:
        break;
    }

    // Order & Chaos: a charmed foe fights for Order.
    if (e.charmed) {
      charmedAct(s, e, rate);
      continue;
    }
    // Order & Chaos: a thief with a full sack, a deserter at the end of its courage.
    const flee = def.flee;
    if (flee && !e.fleeing && rate > 0 && (e.state === "walk" || e.state === "eat")
      && ((flee.loot !== undefined && e.loot >= flee.loot) || (flee.below !== undefined && e.hp < e.maxHp * flee.below))) {
      e.fleeing = true;
      e.dir = 1;
      setState(s, e, "walk");
      s.events.push({ e: "flee", id: e.id });
    }
    if (e.fleeing) {
      fleeAct(s, e, rate);
      continue;
    }

    // Order & Chaos: a Prism Elemental gathers itself to spin; a Sorceress hexes the troop ahead.
    if (def.prism && rate > 0 && e.x <= SIGHT_X && (e.spinUntil ?? 0) <= s.tick) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) {
        e.spinUntil = s.tick + def.prism.spin;
        e.cd2 = def.prism.every;
        s.events.push({ e: "spin", id: e.id });
      }
    }
    if (def.hex && rate > 0 && e.x <= SIGHT_X - 0.2 && (e.state === "walk" || e.state === "eat")) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) e.cd2 = hexAct(s, e) ? def.hex.every : sec(0.5);
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
          if (f && !f.boss && !f.structure && !f.revive && fallen[i]!.claimed === undefined) {
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

    // Order & Chaos: Necromancers raise graves once on the lawn.
    if (def.graves && rate > 0 && e.x <= SIGHT_X) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) {
        e.cd2 = def.graves.every;
        raiseGrave(s, e);
      }
    }

    // Order & Chaos: the Revel Queen's dance.
    if (def.troupe && rate > 0 && e.x <= SIGHT_X - 0.3 && e.dir < 0) {
      e.cd2 -= rate;
      if (e.cd2 <= 0 && e.state === "walk") {
        troupeDance(s, e);
        // She stops where she stands for the dance (and her ring holds with her).
        if ((e.state as EnemyState) === "idle") continue;
      }
    }
    // Order & Chaos: an Arch-vile looks for a fresh corpse to raise.
    if (def.raiseDead && rate > 0 && e.x <= SIGHT_X) {
      e.cd2 -= rate;
      if (e.cd2 <= 0 && (e.state === "walk" || e.state === "eat") && startRaise(s, e)) continue;
    }
    // Order & Chaos: a Phantom gathers itself to phase again.
    if (def.phase && e.cd2 > 0) e.cd2 -= rate;

    // Flyers pass over everything on their way to the gate.
    if (def.flying) {
      if (e.state !== "walk") setState(s, e, "walk");
      // Order & Chaos: some strike the defender beneath them as they pass.
      if (def.skyAttack && rate > 0 && e.x <= SIGHT_X) {
        e.cd2 -= rate;
        if (e.cd2 <= 0) skyStrike(s, e);
      }
      e.x += def.speed * rate * e.dir;
      if (e.dir > 0 && e.x >= 8.8) e.dir = -1;
      if (def.zigzag && rate > 0) zigzagStep(s, e, def.speed * rate);
      reachGate(s, e);
      continue;
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

    // Order & Chaos: a charmed foe stands in the way — fight it out.
    const rival = s.cfg.oc ? charmedRival(s, e) : undefined;
    if (rival) {
      brawl(s, e, rival, rate);
      continue;
    }

    // Order & Chaos siege engine: rolls in, halts and lobs boulders until its ammunition is spent (then it rolls on).
    if (def.siege && e.ammo > 0 && e.dir < 0) {
      siegeAct(s, e, rate);
      continue;
    }

    // Order & Chaos Juggernaut: rolls on over the defenders until a tall one stops it.
    if (def.roller && !e.stopped && e.dir < 0 && rollerAct(s, e, rate)) continue;

    // Order & Chaos: a ranged foe with a poison bite (Spider Princess) bites what it is pressed against.
    if (def.ranged && !def.siege && !(def.poison && def.bite > 0 && blocker(s, e))) {
      rangedAct(s, e, rate);
      continue;
    }

    const block = blocker(s, e);
    // Order & Chaos ladders: every walker climbs over a laddered troop; a Ladder Hobgoblin plants its ladder on the first wall it meets.
    if (block && s.cfg.oc && e.dir < 0 && rate > 0 && !def.roller) {
      if (block.laddered) {
        climbOver(s, e, block);
        continue;
      }
      if (def.ladder && e.ladder && canLadder(block, def.ladder.wallHp)) {
        e.target = block.id;
        setState(s, e, "plant", def.ladder.plant);
        s.events.push({ e: "ladderPlant", id: e.id, target: block.id });
        continue;
      }
    }
    if (block && def.swerve && !e.swerved && e.dir < 0 && rate > 0 && swerve(s, e)) continue;
    // Order & Chaos Phantom: drifts through the defender in its way (when it has gathered itself).
    if (block && def.phase && e.cd2 <= 0 && e.dir < 0 && rate > 0) {
      e.from = block.col + 0.5;
      setState(s, e, "phase");
      s.events.push({ e: "phase", id: e.id, on: true });
      continue;
    }
    if (block) {
      // Order & Chaos Imp: blinks past the first defender it meets (a tall one bars it).
      if (def.blink && !e.vaulted && e.dir < 0) {
        e.vaulted = true;
        if (!DEFENDERS[block.kind]!.tall) {
          s.events.push({ e: "blink", id: e.id, fromX: e.x });
          e.from = e.x;
          e.to = block.col - 0.05;
          setState(s, e, "vault", sec(0.5));
          continue;
        }
      }
      if (def.pogo && def.vault && !e.stopped && e.dir < 0) {
        // Bounds over every defender — until a tall one stops it for good.
        e.vaulted = true;
        if (DEFENDERS[block.kind]!.tall) {
          e.stopped = true;
        } else {
          e.from = e.x;
          e.to = block.col - 0.05;
          setState(s, e, "vault", sec(0.8));
          s.events.push({ e: "vault", id: e.id });
          continue;
        }
      } else if (def.vault && !def.pogo && !e.vaulted && e.dir < 0) {
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
      if (def.keg && e.fuse === -1) {
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
    // Order & Chaos: a backup dancer holds while its Revel Queen dances.
    if (e.leader && heldByLeader(s, e)) continue;
    const bounding = def.pogo ? !e.stopped : !e.vaulted;
    // A Shambler that took its last gasp crawls on, slower.
    const speed = (def.vault && bounding ? def.vault.fastSpeed : def.speed) * (def.lastGasp && e.reborn ? 0.6 : 1);
    e.x += speed * rate * e.dir;
    if (e.dir > 0 && e.x >= 8.8) e.dir = -1;
    if (def.zigzag && rate > 0) zigzagStep(s, e, speed * rate);
    reachGate(s, e);
  }
}

// ---------------------------------------------------------------------------
// Order & Chaos: Chaos movement and tricks

/** Zig-zag: after every `every` tiles covered, leap (flyers: flit) diagonally into a neighbouring lane, alternating sides. */
function zigzagStep(s: GarrisonState, e: Enemy, moved: number): void {
  const zz = ENEMIES[e.kind]!.zigzag!;
  e.stride += Math.abs(moved);
  if (e.stride < zz.every || e.x > SIGHT_X) return;
  e.stride = 0;
  const flying = isFlying(e);
  for (const lane of [e.lane + e.zig, e.lane - e.zig]) {
    if (!isActiveLane(s, lane) || s.atk.raided.includes(lane)) continue;
    // A leaper on foot will not come down inside a defender.
    if (!flying && s.defenders.some((d) => !d.dead && d.lane === lane && !isFlat(d) && Math.abs(d.col + 0.5 - (e.x - 0.2)) < 0.8)) continue;
    e.zig = lane > e.lane ? -1 : 1;
    e.from = e.lane;
    e.to = lane;
    e.lane = lane;
    setState(s, e, "glide", sec(0.5));
    s.events.push({ e: "zig", id: e.id });
    return;
  }
}

/** Phantom: drifts through the defenders ahead, untouchable, and turns solid again on open ground. */
function phaseAct(s: GarrisonState, e: Enemy, rate: number): void {
  const phase = ENEMIES[e.kind]!.phase!;
  e.x += phase.speed * rate * e.dir;
  const inside = s.defenders.some((d) => !d.dead && d.lane === e.lane && !isFlat(d) && Math.abs(d.col + 0.5 - e.x) < 0.75);
  if ((e.x < e.from - 0.6 && !inside) || e.x <= 0.2) {
    setState(s, e, "walk");
    e.cd2 = phase.every;
    s.events.push({ e: "phase", id: e.id, on: false });
  }
  reachGate(s, e);
}

/** Revel Queen: dances and calls the missing backup dancers into the four tiles around her. */
function troupeDance(s: GarrisonState, e: Enemy): void {
  const troupe = ENEMIES[e.kind]!.troupe!;
  if (!ENEMIES[troupe.kind]) return;
  const troop = s.enemies.filter((o) => !o.dead && o.leader === e.id);
  const taken = new Set(troop.map((o) => o.slot));
  const spots: [number, number][] = [[e.lane - 1, e.x], [e.lane + 1, e.x], [e.lane, e.x - 0.9], [e.lane, e.x + 0.9]];
  const called: number[] = [];
  for (let slot = 0; slot < spots.length; slot += 1) {
    const [lane, x] = spots[slot]!;
    if (taken.has(slot) || !isActiveLane(s, lane) || s.atk.raided.includes(lane) || x < 0.8 || x > SPAWN_X) continue;
    // Never inside (or past) a defender's tile.
    if (s.defenders.some((d) => !d.dead && d.lane === lane && !isFlat(d) && Math.abs(d.col + 0.5 - x) < 0.8)) continue;
    const dancer = spawnEnemy(s, troupe.kind, lane, x, e.side, e.wave);
    dancer.leader = e.id;
    dancer.slot = slot;
    called.push(dancer.id);
  }
  if (called.length === 0) {
    e.cd2 = sec(1);
    return;
  }
  setState(s, e, "idle", troupe.dance);
  s.events.push({ e: "dance", id: e.id, dancers: [...troop.map((o) => o.id), ...called] });
  e.cd2 = troupe.every;
}

/** A backup dancer holds its ground while its (living, uncharmed) Revel Queen dances. */
function heldByLeader(s: GarrisonState, e: Enemy): boolean {
  const lead = s.enemies.find((o) => o.id === e.leader);
  if (!lead || lead.dead || lead.charmed) {
    e.leader = 0;
    return false;
  }
  return lead.state === "idle" && ENEMIES[lead.kind]!.troupe !== undefined;
}

/** Arch-vile: claims the nearest fresh corpse in reach and starts the raising. */
function startRaise(s: GarrisonState, e: Enemy): boolean {
  const rd = ENEMIES[e.kind]!.raiseDead!;
  let best: FallenFoe | undefined;
  let bestDist = Number.MAX_VALUE;
  for (const f of s.atk.fallen) {
    const fd = ENEMIES[f.kind];
    if (!fd || fd.boss || fd.structure || fd.raiseDead || fd.revive || f.claimed !== undefined || f.x === undefined || f.at === undefined) continue;
    if (s.tick - f.at > rd.fresh || Math.abs(f.lane - e.lane) > 1 || !isActiveLane(s, f.lane) || Math.abs(f.x - e.x) > rd.range) continue;
    const dist = Math.abs(f.x - e.x) + Math.abs(f.lane - e.lane);
    if (dist < bestDist) {
      best = f;
      bestDist = dist;
    }
  }
  if (!best) {
    e.cd2 = sec(0.5);
    return false;
  }
  best.claimed = e.id;
  e.from = best.x!;
  e.to = best.lane;
  setState(s, e, "raise", rd.channel);
  s.events.push({ e: "raiseStart", id: e.id, lane: best.lane, x: best.x! });
  return true;
}

/** Arch-vile channelling: a stun or a freeze breaks the spell; otherwise the corpse rises whole. */
function raiseAct(s: GarrisonState, e: Enemy, rate: number): void {
  if (rate <= 0) {
    abortRaise(s, e, true);
    return;
  }
  if (s.tick < e.stateUntil) return;
  const rd = ENEMIES[e.kind]!.raiseDead!;
  const index = s.atk.fallen.findIndex((f) => f.claimed === e.id);
  setState(s, e, "walk");
  e.cd2 = rd.every;
  if (index < 0) {
    s.events.push({ e: "raiseFail", id: e.id });
    return;
  }
  const f = s.atk.fallen.splice(index, 1)[0]!;
  const raised = spawnEnemy(s, f.kind, f.lane, Math.max(0.3, Math.min(SPAWN_X, f.x ?? e.x)), e.side, e.wave);
  s.events.push({ e: "enemyRise", id: raised.id });
  s.events.push({ e: "raiseDone", id: e.id, raised: raised.id, lane: raised.lane, x: raised.x });
}

/** The raising is broken: the corpse is free again (and the Arch-vile walks on, when it still stands). */
function abortRaise(s: GarrisonState, e: Enemy, walk: boolean): void {
  for (const f of s.atk.fallen) if (f.claimed === e.id) delete f.claimed;
  s.events.push({ e: "raiseFail", id: e.id });
  if (walk) {
    setState(s, e, "walk");
    e.cd2 = ENEMIES[e.kind]!.raiseDead?.every ?? sec(4);
  }
}

/**
 * Juggernaut: rolls on, crushing each defender it passes over once, until a tall one stops it
 * (then it grinds that one like any biter). Spikes pop it. Returns false when it has just been stopped.
 */
function rollerAct(s: GarrisonState, e: Enemy, rate: number): boolean {
  const def = ENEMIES[e.kind]!;
  const block = blocker(s, e);
  if (block && DEFENDERS[block.kind]!.tall) {
    e.stopped = true;
    return false;
  }
  if (e.state !== "walk") setState(s, e, "walk");
  e.x += def.speed * rate * e.dir;
  // Order & Chaos Juggernaut: the ground it rolls over burns (nothing can be placed there for a while).
  const scorch = def.roller!.scorch;
  if (scorch && s.cfg.oc && e.x <= SIGHT_X && e.x >= 0) markScorch(s, e.lane, Math.min(GW_COLS - 1, Math.floor(e.x)), s.tick + scorch);
  for (const d of [...s.defenders]) {
    if (d.dead || d.lane !== e.lane || e.rolled.includes(d.id) || Math.abs(d.col + 0.5 - e.x) > 0.45) continue;
    const dd = DEFENDERS[d.kind]!;
    if (dd.spikes) {
      s.events.push({ e: "pop", id: e.id, lane: e.lane, x: e.x });
      killEnemy(s, e, "normal");
      return true;
    }
    // An armed charge goes off under it by itself.
    if ((d.kind === "mine" || dd.trap) && s.tick >= d.armedAt) continue;
    e.rolled.push(d.id);
    s.events.push({ e: "crush", id: e.id, target: d.id });
    hurtDefender(s, d, def.roller!.dmg, { atk: true });
  }
  reachGate(s, e);
  return true;
}

/** A tile burns until `until` (a second pass keeps it burning). */
function markScorch(s: GarrisonState, lane: number, col: number, until: number): void {
  const list = (s.scorched ??= []);
  const tile = list.find((t) => t.lane === lane && t.col === col);
  if (tile) tile.until = Math.max(tile.until, until);
  else list.push({ lane, col, until });
}

/** A wall a ladder can be planted on: a tall troop, or a sturdy one (not a flat charge or spikes). */
function canLadder(d: Defender, wallHp: number): boolean {
  const def = DEFENDERS[d.kind]!;
  return !isFlat(d) && (def.tall === true || d.maxHp >= wallHp);
}

/** A walker climbs the ladder over a troop and comes down on the far side. */
/** How long a ladder climb takes (longer than any leap, so the renderer can tell the two apart). */
export const CLIMB_TICKS = sec(1);

function climbOver(s: GarrisonState, e: Enemy, block: Defender): void {
  e.from = e.x;
  e.to = block.col - 0.05;
  setState(s, e, "vault", CLIMB_TICKS);
  s.events.push({ e: "climb", id: e.id, target: block.id });
}

/** Ladder Hobgoblin: planting (held while frozen or stunned); then the ladder stands and it climbs. */
function plantAct(s: GarrisonState, e: Enemy, rate: number): void {
  const block = s.defenders.find((d) => d.id === e.target && !d.dead);
  // The wall fell, or was knocked out of reach: it walks on, ladder still on its back.
  if (!block || blocker(s, e) !== block) {
    setState(s, e, "walk");
    return;
  }
  if (block.laddered) {
    climbOver(s, e, block);
    return;
  }
  if (rate <= 0) {
    e.stateUntil += 1;
    return;
  }
  if (s.tick < e.stateUntil) return;
  block.laddered = true;
  e.ladder = false;
  s.events.push({ e: "ladder", id: e.id, target: block.id });
  climbOver(s, e, block);
}

/** Siege engine: rolls to its firing line (or until something blocks it), then lobs at the rearmost troop in its lane. */
function siegeAct(s: GarrisonState, e: Enemy, rate: number): void {
  const def = ENEMIES[e.kind]!;
  const siege = def.siege!;
  const r = def.ranged!;
  if (!blocker(s, e) && e.x > siege.stopX) {
    if (e.state !== "walk") setState(s, e, "walk");
    e.x += def.speed * rate * e.dir;
    return;
  }
  if (e.state !== "cast") {
    setState(s, e, "cast");
    e.cd = Math.min(e.cd, sec(1.5));
  }
  if (rate <= 0) return;
  e.cd -= rate;
  if (e.cd > 0) return;
  // The rearmost troop in its lane: where the gold-makers hide.
  let target: Defender | undefined;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== e.lane || isFlat(d) || DEFENDERS[d.kind]!.veiled || d.col + 0.5 > e.x) continue;
    if (!target || d.col < target.col) target = d;
  }
  if (!target) {
    // Nothing left to lob at (its lane cleared, or only flat or veiled troops): it gives up the siege and rolls on.
    e.ammo = 0;
    setState(s, e, "walk");
    return;
  }
  e.cd = r.every;
  e.ammo -= 1;
  reveal(s, e);
  s.events.push({ e: "enemyCast", id: e.id });
  const fromX = e.x - 0.2;
  const dist = Math.abs(fromX - (target.col + 0.5));
  s.projectiles.push(newProjectile(s, {
    kind: r.projectile, side: "atk", lane: e.lane, x: fromX, dir: -1, dmg: r.dmg,
    lob: { fromX, toX: target.col + 0.5, t0: s.tick, dur: 18 + Math.round(dist * 2.5), targetId: target.id, splash: 0, col: target.col, area: false },
  }));
}

/** Sorceress: turns the nearest troop ahead in her lane into a sheep. Returns false when there is none to hex. */
function hexAct(s: GarrisonState, e: Enemy): boolean {
  const hex = ENEMIES[e.kind]!.hex!;
  let target: Defender | undefined;
  let best = Number.MAX_VALUE;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== e.lane || isFlat(d) || isSheep(s, d) || d.invulnUntil > s.tick) continue;
    const dd = DEFENDERS[d.kind]!;
    if (dd.steadfast || dd.instant || dd.veiled) continue;
    const gap = (e.x - (d.col + 0.5)) * -e.dir;
    if (gap < -0.3 || gap > hex.range || gap >= best) continue;
    target = d;
    best = gap;
  }
  if (!target) return false;
  target.sheepUntil = s.tick + hex.dur;
  target.shotAt = -1;
  target.shotsLeft = 0;
  reveal(s, e);
  s.events.push({ e: "hex", id: e.id, target: target.id });
  return true;
}

/** Knocks a struck defender a tile back (when the tile is free and it can be moved) and stuns it. */
function shoveDefender(s: GarrisonState, e: Enemy, d: Defender): void {
  const shove = ENEMIES[e.kind]!.shove!;
  const dd = DEFENDERS[d.kind]!;
  if (shove.dmg > 0) hurtDefender(s, d, shove.dmg, { atk: true });
  if (d.dead || dd.steadfast || d.invulnUntil > s.tick) return;
  const from = d.col;
  const to = d.col + (e.dir < 0 ? -1 : 1);
  if (!dd.tall && !isFlat(d) && canSummonAt(s, d.lane, to)) d.col = to;
  s.events.push({ e: "shove", id: d.id, by: e.id, from, to: d.col, lane: d.lane });
  d.stunnedUntil = Math.max(d.stunnedUntil, s.tick + shove.dur);
  s.events.push({ e: "defStun", id: d.id });
}

/** A thief or deserter runs back off the field; if it gets away, what it carried goes with it. */
function fleeAct(s: GarrisonState, e: Enemy, rate: number): void {
  const def = ENEMIES[e.kind]!;
  if (e.state !== "walk") setState(s, e, "walk");
  e.dir = 1;
  e.x += (def.vault ? def.vault.fastSpeed : def.speed) * 1.25 * rate;
  if (e.x >= SPAWN_X) {
    s.events.push({ e: "escape", id: e.id, lane: e.lane, x: e.x, loot: e.loot });
    e.loot = 0;
    e.carrier = false;
    e.dead = true;
  }
}

/** A flyer strikes the defender beneath it: a dive, a spat bolt, or a breath that also scorches the tile ahead. */
function skyStrike(s: GarrisonState, e: Enemy): void {
  const sky = ENEMIES[e.kind]!.skyAttack!;
  const col = Math.floor(e.x);
  const target = s.defenders.find((d) => !d.dead && d.lane === e.lane && d.col === col && !isFlat(d) && !DEFENDERS[d.kind]!.veiled);
  if (!target) {
    e.cd2 = sec(0.5);
    return;
  }
  e.cd2 = sky.every;
  reveal(s, e);
  // Order & Chaos: nothing strikes a troop under an Aegis dome from the sky.
  const dome = aegisOver(s, target.lane, target.col);
  if (dome) {
    s.events.push({ e: "aegis", id: dome.id, lane: target.lane, x: target.col + 0.5, kind: "sky" });
    return;
  }
  s.events.push({ e: "skyAttack", id: e.id, kind: sky.kind, target: target.id, lane: target.lane, col: target.col });
  hurtDefender(s, target, sky.dmg, { atk: true, magic: sky.kind !== "dive" });
  if (!target.dead && sky.poison) {
    target.poisonDps = target.poisonUntil > s.tick ? Math.max(target.poisonDps, sky.poison.dps) : sky.poison.dps;
    target.poisonUntil = s.tick + sky.poison.dur;
  }
  if (sky.kind === "breath") {
    const ahead = defenderAt(s, e.lane, col + (e.dir < 0 ? -1 : 1));
    if (ahead && !isFlat(ahead) && !aegisOver(s, ahead.lane, ahead.col)) hurtDefender(s, ahead, sky.dmg, { atk: true, magic: true });
  }
}

/** Charms a foe: it turns round and fights for Order (`mult`: its strikes, and a full heal when above 1). */
function charmFoe(s: GarrisonState, e: Enemy, by: number, mult: number): void {
  if (e.state === "raise") abortRaise(s, e, false);
  e.charmed = Math.max(1, mult);
  e.dir = 1;
  e.fuse = -1;
  e.target = 0;
  e.leader = 0;
  e.fleeing = false;
  e.shotAt = -1;
  e.shotsLeft = 0;
  if (mult > 1) e.hp = e.maxHp;
  reveal(s, e);
  setState(s, e, "walk");
  s.events.push({ e: "charm", id: e.id, by });
}

/** A charmed foe marches back the way it came and fights every Chaos creature it meets; off the field, it is gone. */
function charmedAct(s: GarrisonState, e: Enemy, rate: number): void {
  if (rate <= 0) return;
  const def = ENEMIES[e.kind]!;
  let foe: Enemy | undefined;
  for (const o of s.enemies) {
    if (o === e || o.lane !== e.lane || !grounded(o) || isStructure(o) || isFlying(o) || ENEMIES[o.kind]!.boss) continue;
    const dx = o.x - e.x;
    if (dx >= -0.15 && dx <= 0.65 && (!foe || o.x < foe.x)) foe = o;
  }
  if (foe) {
    if (e.state !== "eat" || e.target !== foe.id) {
      setState(s, e, "eat");
      e.target = foe.id;
      e.cd = 6;
    }
    e.cd -= rate;
    if (e.cd <= 0) {
      e.cd += def.biteEvery;
      e.bites += 1;
      s.events.push({ e: "enemyBite", id: e.id, target: foe.id });
      hurtEnemy(s, foe, Math.max(25, def.bite) * e.charmed, { melee: true });
    }
    return;
  }
  if (e.state !== "walk") setState(s, e, "walk");
  e.dir = 1;
  e.x += def.speed * rate;
  if (e.x >= SPAWN_X) {
    // It wanders off the field, leaving any gold it stole behind.
    if (e.loot > 0) dropCoin(s, 8.6, e.lane + 0.2, e.lane + 0.7, e.loot);
    e.loot = 0;
    e.dead = true;
    s.events.push({ e: "escape", id: e.id, lane: e.lane, x: e.x, loot: 0 });
  }
}

/** The charmed foe a marching Chaos creature has run into (it must fight its way past). */
function charmedRival(s: GarrisonState, e: Enemy): Enemy | undefined {
  if (e.dir >= 0 || isFlying(e) || (e.state !== "walk" && e.state !== "eat" && e.state !== "cast")) return undefined;
  let best: Enemy | undefined;
  for (const o of s.enemies) {
    if (!o.charmed || o.dead || o.lane !== e.lane) continue;
    const dx = e.x - o.x;
    if (dx >= -0.15 && dx <= 0.65 && (!best || o.x > best.x)) best = o;
  }
  return best;
}

function brawl(s: GarrisonState, e: Enemy, rival: Enemy, rate: number): void {
  const def = ENEMIES[e.kind]!;
  if (e.state !== "eat" || e.target !== rival.id) {
    setState(s, e, "eat");
    e.target = rival.id;
    e.cd = 6;
  }
  if (rate <= 0) return;
  e.cd -= rate;
  if (e.cd <= 0) {
    e.cd += def.biteEvery;
    // (Not counted in `bites`: first-strike and every-Nth-strike tricks are for defenders.)
    s.events.push({ e: "enemyBite", id: e.id, target: rival.id });
    hurtEnemy(s, rival, Math.max(25, def.bite), { melee: true });
  }
}

/** Bewilders a foe into a neighbouring lane (preferring one with nothing standing right there). */
function divertFoe(s: GarrisonState, e: Enemy, slow: number, by: number): boolean {
  const first = rand(s) < 0.5 ? -1 : 1;
  const options = [e.lane + first, e.lane - first].filter((lane) => isActiveLane(s, lane) && !s.atk.raided.includes(lane));
  if (options.length === 0) return false;
  // An Arch-vile led astray lets go of its corpse.
  if (e.state === "raise") abortRaise(s, e, false);
  const clear = options.find((lane) => !s.defenders.some((d) => !d.dead && d.lane === lane && !isFlat(d) && Math.abs(d.col + 0.5 - e.x) < 0.9));
  const lane = clear ?? options[0]!;
  e.from = e.lane;
  e.to = lane;
  e.lane = lane;
  setState(s, e, "glide", sec(0.6));
  if (slow > 0 && canSlow(e)) e.slowUntil = Math.max(e.slowUntil, s.tick + slow);
  s.events.push({ e: "divert", id: by, target: e.id });
  return true;
}

/** Order & Chaos Nomad: sidesteps into a neighbouring lane with nothing standing in its way (once). */
function swerve(s: GarrisonState, e: Enemy): boolean {
  e.swerved = true;
  const lanes = rand(s) < 0.5 ? [e.lane - 1, e.lane + 1] : [e.lane + 1, e.lane - 1];
  for (const lane of lanes) {
    if (!isActiveLane(s, lane) || s.atk.raided.includes(lane)) continue;
    const blocked = s.defenders.some((d) => !d.dead && d.lane === lane && !isFlat(d) && Math.abs(d.col + 0.5 - e.x) < 1);
    if (blocked || graveAt(s, lane, Math.floor(e.x)) || tentAt(s, lane, Math.floor(e.x))) continue;
    e.from = e.lane;
    e.to = lane;
    e.lane = lane;
    setState(s, e, "glide", sec(0.6));
    s.events.push({ e: "swerve", id: e.id });
    return true;
  }
  return false;
}

/** Order & Chaos Harpy Snatcher: swoops onto the costliest defender, carries it off unless slain in time. */
function snatchAct(s: GarrisonState, e: Enemy): boolean {
  const def = ENEMIES[e.kind]!;
  if (e.state === "snatch") {
    // Frozen or stunned, she cannot lift her prey.
    if (e.freezeUntil > s.tick || e.stunUntil > s.tick) {
      e.stateUntil += 1;
      return true;
    }
    if (s.tick < e.stateUntil) return true;
    const victim = s.defenders.find((d) => d.id === e.target && !d.dead);
    // A victim knocked or fallen back out from under her talons is not carried off.
    // Order & Chaos: a dome raised over the prey in time turns her talons aside.
    const dome = victim && victim.lane === e.lane ? aegisOver(s, victim.lane, victim.col) : undefined;
    if (dome) s.events.push({ e: "aegis", id: dome.id, lane: victim!.lane, x: victim!.col + 0.5, kind: "snatch" });
    const taken = victim !== undefined && !dome && victim.invulnUntil <= s.tick && victim.lane === e.lane && Math.abs(victim.col + 0.5 - e.x) < 0.05;
    if (taken) {
      victim.dead = true;
      if (countsAsTroop(victim)) s.stats.lost += 1;
    }
    s.events.push({ e: "snatched", id: e.id, target: taken ? victim.id : -1, kind: taken ? victim.kind : "" });
    e.dead = true;
    return true;
  }
  // Frozen or stunned, she cannot swoop either.
  if ((e.state !== "walk" && e.state !== "eat") || e.freezeUntil > s.tick || e.stunUntil > s.tick || (s.tick + e.id) % 10 !== 0) return false;
  const victim = snatchTarget(s);
  if (!victim) return false;
  e.target = victim.id;
  e.lane = victim.lane;
  e.x = victim.col + 0.5;
  e.px = e.x;
  e.dir = -1;
  setState(s, e, "snatch", def.snatch!.delay);
  s.events.push({ e: "snatchDrop", id: e.id, target: victim.id });
  return true;
}

/** The costliest defender no other Snatcher is after (flat charges, guarded wards and sanctuaries excluded). */
function snatchTarget(s: GarrisonState): Defender | undefined {
  const claimed = new Set(s.enemies.filter((e) => !e.dead && e.state === "snatch").map((e) => e.target));
  let best: Defender | undefined;
  let bestCost = -1;
  for (const d of s.defenders) {
    if (d.dead || isFlat(d) || d.invulnUntil > s.tick || claimed.has(d.id) || s.protectIds.includes(d.id) || !isActiveLane(s, d.lane)) continue;
    // Order & Chaos: a troop under an Aegis dome cannot be snatched.
    if (aegisOver(s, d.lane, d.col)) continue;
    const cost = s.cfg.oc ? ocTroopValue(d.kind) : CARDS[d.kind]?.cost ?? 0;
    if (cost > bestCost) {
      best = d;
      bestCost = cost;
    }
  }
  return best;
}

/** Order & Chaos: what a troop is worth to a Harpy — its packet's price (a hybrid: both packets). */
function ocTroopValue(kind: DefKind): number {
  const plain = baseKind(DEFENDERS[kind]?.ascendedFrom ?? kind);
  const card = CARDS[plain];
  if (card) return card.cost;
  const recipe = FUSIONS.find((entry) => entry.result === plain);
  return recipe ? (CARDS[recipe.a[0]!]?.cost ?? 0) + (CARDS[recipe.b[0]!]?.cost ?? 0) : 0;
}

/** A Necromancer raises a grave on an empty tile near it (its lane or the ones beside it). */
function raiseGrave(s: GarrisonState, e: Enemy): void {
  const spots: [number, number][] = [];
  const near = Math.floor(e.x);
  for (const lane of [e.lane - 1, e.lane, e.lane + 1]) {
    if (!isActiveLane(s, lane)) continue;
    for (let col = Math.max(3, near - 3); col <= Math.min(GW_COLS - 1, near); col += 1) {
      if (lane === e.lane && col === near) continue;
      if (!defenderAt(s, lane, col) && !tentAt(s, lane, col) && !graveAt(s, lane, col)) spots.push([lane, col]);
    }
  }
  if (spots.length === 0) return;
  const [lane, col] = spots[randInt(s, 0, spots.length - 1)]!;
  spawnEnemy(s, "oc-grave", lane, col + 0.5, "wave", 0);
  s.events.push({ e: "enemyCast", id: e.id });
}

function biteAct(s: GarrisonState, e: Enemy, block: Defender): void {
  const def = ENEMIES[e.kind]!;
  e.bites += 1;
  s.events.push({ e: "enemyBite", id: e.id, target: block.id });
  reveal(s, e);
  if (def.smash) {
    hurtDefender(s, block, 0, { crush: true, atk: true });
    return;
  }
  // Order & Chaos Cupi: the biter falls in love and turns on the horde; she is spent.
  const charm = DEFENDERS[block.kind]!.charm;
  // (A sheep does nothing but stand there.)
  const sheep = isSheep(s, block);
  if (charm && s.cfg.oc && !def.boss && !e.charmed && block.invulnUntil <= s.tick && !sheep) {
    block.dead = true;
    s.events.push({ e: "dismiss", id: block.id });
    charmFoe(s, e, block.id, charm.mult);
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
    if (behind && !isFlat(behind)) victims.push(behind);
  } else if (def.cleave === "lanes") {
    for (const lane of [block.lane - 1, block.lane + 1]) {
      const side = defenderAt(s, lane, block.col);
      if (side && !isFlat(side)) victims.push(side);
    }
  }
  for (const v of victims) {
    const before = v.hp + v.shell;
    hurtDefender(s, v, dmg, { atk: true });
    const dealt = Math.max(0, before - Math.max(0, v.hp) - v.shell);
    if (v !== block) continue;
    if (def.drain && dealt > 0) e.hp = Math.min(e.maxHp, e.hp + Math.round(dealt * def.drain));
    if (v.dead) continue;
    const steadfast = DEFENDERS[v.kind]!.steadfast === true;
    if (def.curse && !steadfast) v.cursedUntil = s.tick + def.curse;
    if (def.poison) {
      v.poisonDps = v.poisonUntil > s.tick ? Math.max(v.poisonDps, def.poison.dps) : def.poison.dps;
      v.poisonUntil = s.tick + def.poison.dur;
    }
    if (def.stun && e.bites % def.stun.every === 0 && !steadfast) {
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
  if (blockDef.chillBiters && canSlow(e) && !sheep) e.slowUntil = Math.max(e.slowUntil, s.tick + blockDef.chillBiters);
  if (blockDef.thorns && !e.dead && !sheep) hurtEnemy(s, e, blockDef.thorns * (has(s, "ogres-club") ? 1.5 : 1), { melee: true, fire: DEFENDERS[block.kind]!.ignite !== undefined });
  // Order & Chaos: rams and trolls knock the defender back; a Nymph bewilders her biter into the next lane.
  if (def.shove && !block.dead && !e.dead && (def.shove.every === 0 ? e.bites === 1 : e.bites % def.shove.every === 0)) shoveDefender(s, e, block);
  if (blockDef.divert && s.cfg.oc && !sheep && !e.dead && !e.charmed && !def.boss && !isFlying(e) && e.state === "eat") divertFoe(s, e, blockDef.divert.slow, block.id);
}

/**
 * The keg goes up: everything in the 3x3 around the carrier takes the blast, the carrier too.
 * `cooked`: set off by fire before it was lit (Order & Chaos) — it tears through the carrier's own ranks as well.
 */
function kegBlast(s: GarrisonState, e: Enemy, cooked = false): void {
  const keg = ENEMIES[e.kind]!.keg!;
  // -2: spent (a cooked-off keg is not lit again by the blasts it sets off).
  e.fuse = cooked ? -2 : -1;
  s.events.push({ e: "keg", id: e.id, lane: e.lane, x: e.x });
  for (const d of s.defenders) {
    if (d.dead || isFlat(d) || Math.abs(d.lane - e.lane) > 1 || Math.abs(d.col - Math.floor(e.x)) > 1) continue;
    hurtDefender(s, d, keg.dmg, { atk: true });
  }
  const x = e.x;
  const lane = e.lane;
  killEnemy(s, e, "burn");
  if (!cooked) return;
  for (const o of [...s.enemies]) {
    if (o.dead || o === e || isStructure(o) || ENEMIES[o.kind]!.boss || Math.abs(o.lane - lane) > 1 || Math.abs(o.x - x) > 1.5) continue;
    if (o.state === "burrow" || o.state === "teleport") continue;
    hurtEnemy(s, o, keg.dmg, { fire: true });
  }
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
      if (d.dead || d.lane !== e.lane || isFlat(d) || !inRange(d)) continue;
      if (r.cloud && DEFENDERS[d.kind]!.undead) continue;
      if (DEFENDERS[d.kind]!.veiled) continue;
      const closer = (a: Defender | undefined) => !a || Math.abs(e.x - (d.col + 0.5)) < Math.abs(e.x - (a.col + 0.5));
      // Order & Chaos Bounty Hunter: the costliest defender in range (the nearer on a tie).
      const worth = (a: Defender) => (s.cfg.oc ? ocTroopValue(a.kind) : CARDS[a.kind]?.cost ?? 0);
      const better = (a: Defender | undefined) => !a || worth(d) > worth(a) || (worth(d) === worth(a) && closer(a));
      if (r.skipWalls && isWall(DEFENDERS[d.kind]!)) {
        if (closer(wall)) wall = d;
      } else if (ENEMIES[e.kind]!.costliest ? better(best) : closer(best)) {
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
  reveal(s, e);
  if (r.hitscan) {
    // Order & Chaos: a Surge-widened Aegis dome turns gunfire aside.
    const dome = r.hitscan === "bullet" ? aegisOver(s, target.lane, target.col, true) : undefined;
    if (dome) {
      s.events.push({ e: "hitscan", id: e.id, target: target.id, lane: target.lane, col: target.col, kind: r.hitscan });
      s.events.push({ e: "aegis", id: dome.id, lane: target.lane, x: target.col + 0.5, kind: "bullet" });
      return;
    }
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
      kind: r.projectile, side: "atk", lane: e.lane, x: e.x - 0.2, dir: -1, dmg: r.dmg, cloud: r.cloud === true, stun: r.stun ?? null, curse: r.curse ?? 0,
      lob: { fromX: e.x - 0.2, toX: target.col + 0.5, t0: s.tick, dur: 16 + Math.round(dist * 2), targetId: target.id, splash: 0, col: target.col, area: r.splash === true },
    }));
    return;
  }
  s.projectiles.push(newProjectile(s, {
    kind: r.projectile, side: "atk", lane: e.lane, x: e.x - 0.3, dir: -1, dmg: r.dmg, speed: SHOT_SPEED[r.projectile] || 0.28,
    skipWalls: r.skipWalls === true && !isWall(DEFENDERS[target.kind]!), stun: r.stun ?? null, blast: r.blast ? 1 : 0, curse: r.curse ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Spells, blasts, chargers

function castSpell(s: GarrisonState, side: Side, spell: SpellId, lane: number, x: number): void {
  const def = SPELLS[spell];
  const book = side === "def" ? s.def : s.atk;
  book.mana -= def.mana;
  book.spellReady[spell] = s.tick + spellCooldown(s, side, spell);
  // 10. Only raids with limited charges count casts (old snapshots may lack the field).
  if (side === "atk" && s.cfg.oc?.atkCharges) s.atk.casts[spell] = (s.atk.casts[spell] ?? 0) + 1;
  s.events.push({ e: "spell", side, spell, lane, x });
  // Charmed foes fight for Order: its spells spare them (and Chaos' no longer count them as their own).
  const inArea = (e: Enemy) => !e.dead && !e.charmed && Math.abs(e.lane - lane) <= 1 && Math.abs(e.x - x) <= 1.5 && e.state !== "teleport" && e.state !== "burrow";
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
      for (const e of [...s.enemies]) if (!e.dead && !e.charmed && e.state !== "teleport" && e.state !== "burrow") hurtEnemy(s, e, 800 * fireMult(s), { spell: true, fire: true });
      for (const d of s.defenders) if (!d.dead && !isFlat(d)) hurtDefender(s, d, 150, { magic: true });
      return;
    case "earthquake":
      for (const d of s.defenders) if (!d.dead && !isFlat(d)) hurtDefender(s, d, 60, { magic: true });
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
    // Order & Chaos heroes' signature spells.
    case "royal-charge":
      s.chargers.push({ lane, state: "charging", x: -0.45, px: -0.45, dmg: 1200, hits: [] });
      s.events.push({ e: "charger", lane });
      return;
    case "rain-of-arrows":
      for (let i = 0; i < 5; i += 1) s.blasts.push({ id: s.nextId++, kind: "arrows", lane, x, at: s.tick + 1 + i * 10, dmg: 90 });
      return;
    case "chain-lightning": {
      const target = magicArrowTarget(s, lane, x);
      if (target) chainHit(s, { lane, x: 0 }, target, 600, 4, 0.5, 2.5, "lightning");
      return;
    }
    case "prayer":
      for (const d of s.defenders) {
        if (d.dead || isFlat(d) || d.hp >= d.maxHp) continue;
        const amount = Math.min(300, d.maxHp - d.hp);
        d.hp += amount;
        s.events.push({ e: "heal", id: d.id, target: d.id, amount });
      }
      s.def.prayerUntil = s.tick + sec(10);
      return;
    case "earthen-bulwark": {
      const col = Math.floor(x);
      for (const l of [lane - 1, lane, lane + 1]) {
        if (!canSummonAt(s, l, col)) continue;
        const wall = addDefender(s, "oc-earthwall", l, col);
        wall.expireAt = s.tick + sec(30);
        s.events.push({ e: "place", id: wall.id, kind: wall.kind, lane: l, col });
      }
      return;
    }
    case "supply-drop": {
      const mid = s.cfg.lanes[Math.floor(s.cfg.lanes.length / 2)] ?? 2;
      dropOrb(s, 3.5 + rand(s) * 2, mid);
      return;
    }
    case "frenzy":
      s.def.frenzyUntil = s.tick + sec(10);
      return;
    case "inferno":
      for (const l of [lane - 1, lane, lane + 1]) {
        if (isActiveLane(s, l)) s.blasts.push({ id: s.nextId++, kind: "fire-wall", lane: l, x, at: s.tick + FIRE_WALL_DELAY, dmg: 700 });
      }
      return;
    case "lightning-bolt": {
      const target = magicArrowTarget(s, lane, x);
      if (target) {
        s.events.push({ e: "zap", lane: target.lane, x: target.x, toLane: target.lane, toX: target.x, tint: "lightning" });
        hurtEnemy(s, target, 350, { spell: true });
      }
      return;
    }
    case "ice-bolt": {
      const target = magicArrowTarget(s, lane, x);
      if (target) {
        hurtEnemy(s, target, 250, { spell: true });
        if (!target.dead && canChill(target) && (ENEMIES[target.kind]!.magicResist ?? 1) > 0) target.freezeUntil = Math.max(target.freezeUntil, s.tick + sec(4));
      }
      return;
    }
    case "blind": {
      const target = magicArrowTarget(s, lane, x);
      if (target && canSlow(target) && !ENEMIES[target.kind]!.stunImmune && (ENEMIES[target.kind]!.magicResist ?? 1) > 0) {
        target.stunUntil = Math.max(target.stunUntil, s.tick + sec(8));
      }
      return;
    }
    case "implosion": {
      const target = magicArrowTarget(s, lane, x);
      if (target) hurtEnemy(s, target, 1500, { spell: true, pierce: true });
      return;
    }
    case "cure":
      for (const d of s.defenders) {
        if (d.dead || isFlat(d)) continue;
        d.poisonUntil = 0;
        d.cursedUntil = 0;
        d.stunnedUntil = 0;
        clearHex(s, d);
        const amount = Math.min(150, d.maxHp - d.hp);
        if (amount > 0) {
          d.hp += amount;
          s.events.push({ e: "heal", id: d.id, target: d.id, amount });
        }
      }
      return;
    case "death-ripple":
      for (const e of [...s.enemies]) {
        const edef = ENEMIES[e.kind]!;
        if (e.dead || e.charmed || edef.undead || edef.structure || e.state === "teleport" || e.state === "burrow" || !onLawn(e)) continue;
        hurtEnemy(s, e, 200, { spell: true });
      }
      return;
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
      for (const d of s.defenders) if (!d.dead && d.lane === b.lane && !isFlat(d)) hurtDefender(s, d, b.dmg, { atk: true, magic: true });
      continue;
    }
    // Order & Chaos: lightning down a lane, a frost nova, a rain of arrows (not fire).
    const fire = b.kind !== "storm" && b.kind !== "frost-nova" && b.kind !== "arrows";
    const dmg = b.dmg * (fire ? fireMult(s) : 1);
    for (const e of [...s.enemies]) {
      // Charmed foes fight for Order: its blasts spare them.
      if (e.dead || e.charmed || e.state === "teleport" || e.state === "burrow") continue;
      const inside = b.kind === "fire-wall" || b.kind === "storm"
        ? e.lane === b.lane && e.x < 10
        : Math.abs(e.lane - b.lane) <= 1 && Math.abs(e.x - b.x) <= 1.5;
      if (!inside) continue;
      hurtEnemy(s, e, dmg, { spell: true, fire });
      if (b.kind === "frost-nova" && !e.dead && canChill(e)) e.freezeUntil = Math.max(e.freezeUntil, s.tick + (b.freeze ?? sec(5)));
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
      // A hero's Royal Charge rides past the charmed (they fight for Order).
      if (c.dmg !== undefined && e.charmed) continue;
      if (Math.abs(e.x - c.x) > 0.6) continue;
      if (c.dmg === undefined) {
        killEnemy(s, e, "charge");
      } else if (c.hits && !c.hits.includes(e.id)) {
        // A hero's Royal Charge: a heavy blow, not certain death.
        c.hits.push(e.id);
        hurtEnemy(s, e, c.dmg, { melee: true });
      }
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
  if (s.chargers.some((c) => c.dmg !== undefined && c.state === "gone")) s.chargers = s.chargers.filter((c) => c.dmg === undefined || c.state !== "gone");
  if (s.scorched?.some((t) => t.until <= s.tick)) s.scorched = s.scorched.filter((t) => t.until > s.tick);
}

function finish(s: GarrisonState, winner: Side, reason: string): void {
  s.outcome = { winner, reason };
  s.events.push({ e: "outcome", winner });
}

/** How long a raid may go without any headway before the defenders are declared to hold. */
const RAID_STALL_TICKS = sec(40);

/**
 * Raids: true once the horde has made no headway for RAID_STALL_TICKS while it has
 * nothing left to add (e.g. a Medusa parked out of reach of every defender, shooting a
 * troop the Clerics keep healing). Headway = a new low in the defenders' total HP, a new
 * low in the horde's total HP (the defenders are winning), an attacker moving, or the
 * horde changing (deploys, deaths, raises). While the player can still deploy, or is
 * saving mana for a spell with charges left, the clock does not run.
 */
function raidStalled(s: GarrisonState, cheapest: number): boolean {
  let defHp = 0;
  for (const d of s.defenders) if (!d.dead) defHp += d.hp + d.shell;
  let foeHp = 0;
  let foes = 0;
  let ids = 0;
  let x = 0;
  for (const e of s.enemies) {
    if (e.dead || isStructure(e)) continue;
    foeHp += e.hp + e.shield + e.armor;
    foes += 1;
    ids += e.id;
    x += e.x;
  }
  const waiting = s.atk.might >= cheapest
    || s.cfg.atkSpells.some((spell) => spellsLeft(s, spell) > 0 && s.atk.mana < MANA_MAX);
  const w = s.atk.stall;
  const headway = !w || waiting || defHp < w.defHp || foeHp < w.foeHp || foes !== w.foes || ids !== w.ids || Math.abs(x - w.x) > 1e-6;
  if (headway) {
    s.atk.stall = { at: s.tick, defHp, foeHp, foes, ids, x };
    return false;
  }
  w.x = x;
  return s.tick - w.at >= RAID_STALL_TICKS;
}

function checkOutcome(s: GarrisonState): void {
  const { cfg } = s;
  if (cfg.mode === "raid") {
    if (cfg.lanes.every((lane) => s.atk.raided.includes(lane))) return finish(s, "atk", "Every lane has been broken.");
    const open = s.atk.cards.filter((c) => c.id !== "tent").map((c) => ENEMIES[c.id]!.might);
    const cheapest = open.length ? Math.min(...open) : Number.MAX_SAFE_INTEGER;
    const marching = s.enemies.some((e) => !isStructure(e));
    // Resurrection can still raise the fallen (mana keeps regenerating).
    const canRaise = cfg.atkSpells.includes("resurrection") && s.atk.fallen.length > 0 && spellsLeft(s, "resurrection") > 0;
    if (!marching && !canRaise && s.atk.might < cheapest) return finish(s, "def", "Your Might ran dry and the raid stalled.");
    if (marching && raidStalled(s, cheapest)) finish(s, "def", "Your horde can make no headway: the defenders hold.");
    return;
  }
  // Order & Chaos: the ward you were sent to guard must stand.
  if (s.protectIds.some((id) => !s.defenders.some((d) => d.id === id && !d.dead))) {
    return finish(s, "atk", "The relic you were guarding has fallen.");
  }
  for (const e of s.enemies) {
    if (isStructure(e) || ENEMIES[e.kind]!.boss) continue;
    if (e.x < -0.55 && e.dir < 0) {
      const c = s.chargers.find((charger) => charger.lane === e.lane && charger.dmg === undefined);
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
  mix(s.tick); mix(s.rng); mix(s.def.gold); mix(s.atk.might); mix(s.def.mana); mix(s.atk.mana); mix(s.def.surges);
  if (s.cfg.oc) { mix(s.def.valor); mix(s.def.crowns); }
  for (const d of s.defenders) { mix(d.id); mix(d.hp); mix(d.col); }
  for (const e of s.enemies) { mix(e.id); mix(e.x); mix(e.hp); mix(e.shield); mix(e.armor); }
  mix(s.projectiles.length);
  mix(s.pickups.length);
  return h >>> 0;
}

export function cloneGarrison(s: GarrisonState): GarrisonState {
  return JSON.parse(JSON.stringify({ ...s, events: [] })) as GarrisonState;
}
