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
  type BlessingId, type CardId, type DefDef, type DefKind, type EnemyKind, type ProjectileKind, type SpellId, type SurgeDef, type Terrain,
  type WarbossDef, type WarbossMove
} from "./content";
import { ASCEND_TICKS, VALOR_NEED, ascendedKind, baseKind, kindLevel, leveledKind } from "./order-chaos/forms";
import {
  AQUATIC, FIELD, SWIMMERS, TILE, createFieldState, needsFooting, stopsShots, weatherStepAt,
  type BankSpot, type FieldSpot, type FieldState, type FieldTile, type OriginKind, type SpawnOrigin, type WeatherKind, type WeatherState, type WeatherStep
} from "./order-chaos/field";

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
  /** The world boss that leads wave `wave` (its fall breaks the horde and wins the battle). */
  warboss?: { kind: EnemyKind; wave: number };
  bossDragon?: EnemyKind;
  /** Units (base kinds) whose Ascended form the player has unlocked. */
  ultimates?: DefKind[];
  /** Chaos Raids: how often each Chaos spell may be cast in the battle (the horde cannot wait and spam them). */
  atkCharges?: Partial<Record<SpellId, number>>;
  /** Valor crowns the hero can carry (default 1). */
  crownMax?: number;
  /** Surge orbs the hero can carry (default 3; a level that hands out more at the start holds them all). */
  surgeMax?: number;
  // --- The battlefield (order-chaos/field.ts has the rules text and numbers) ---
  /** Lawn tiles: water (troops need a Raft unless they swim; foes wade), bridges, the roof (troops need a Crate; its ridge stops straight shots), ruins (stop straight shots), brambles (slow and cut foes), clover (the troop on it acts faster). */
  tiles?: FieldTile[];
  /** A night battle: no gold falls from the sky; nocturnal troops are awake (by day they sleep until given a Wake-Up Brew). */
  night?: boolean;
  /** The weather, from the start or turning at a wave: rain, fog, blizzard, sandstorm, thunderstorm, night. */
  weather?: WeatherStep[];
  /** Where part of each wave comes from besides the road: out of the water, dropped from the sky, or tunnels behind the lines. */
  origins?: SpawnOrigin[];
  /** Lawful landmarks standing from the start (Windmill, Magic Well, Shrine of Magic, Pillar of Fire). */
  landmarks?: FieldSpot<DefKind>[];
  /** Chaos structures standing from the start (crypts, treasure chests). */
  structures?: FieldSpot<EnemyKind>[];
  /** Creature banks, each with the Chaos foes sleeping around it. */
  banks?: BankSpot[];
  /** Packets the field hands out on top of the chosen hand (Raft, Rooting Boar), for the HUD. */
  fieldCards?: CardId[];
};

/** A lawn tile a world boss has marked for its next blow. */
export type BossMark = { lane: number; col: number };
/** The move a world boss is winding up: which (index into its moves), the ticks left, the marked tiles, and its target lane/troop/lanes. */
export type BossCue = { move: number; left: number; marks: BossMark[]; lane?: number; target?: number; lanes?: number[] };

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
  /** Order & Chaos: asleep and doing nothing — 1: a nocturnal troop in a day battle, 2: lulled by a Nightmare (0 / absent: awake). A Wake-Up Brew wakes it. */
  asleep?: number;
  /** Order & Chaos band (Wood Elf Band): members standing on the tile (absent: 1). */
  members?: number;
  /** Order & Chaos: sealed in ice by a Jotunn Frostcaller until this tick (it cannot act; absent / 0: free). */
  iceUntil?: number;
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
  /** Order & Chaos battlefield: the creature bank this foe sleeps beside (0 / absent: awake). */
  guard?: number;
  /** Order & Chaos battlefield: where it came onto the lawn (water, sky, tunnels, a crypt door) — for its entrance. */
  origin?: OriginKind | "crypt";
  /** Order & Chaos Fire Messenger: frost, rain or water has put its fire out. */
  doused?: boolean;
  /** Order & Chaos Stormbird Carrier: still carrying its passenger. */
  carrying?: boolean;
  /** Order & Chaos Forgetfulness: it cannot shoot until this tick (it walks in and bites). */
  forgetUntil?: number;
  /** Gales that have blown it back (it braces against the wind after GUST_LIMIT). */
  gusts?: number;
  /** Order & Chaos stall-breaker: ticks it has held its ground to shoot while the battle waited on the field. */
  standoff?: number;
  /** Order & Chaos stall-breaker: out of ammunition — it has given up shooting and charges in to fight hand to hand. */
  unnerved?: boolean;
  /** Order & Chaos world boss: its phase (0 first), the move it is winding up, and the last one it made. */
  bossPhase?: number;
  cue?: BossCue;
  lastMove?: number;
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
  /** Where the shot left from (a sandstorm drops straight shots after FIELD.sandRange). */
  from?: number;
  /** Order & Chaos: knocks the foe it strikes this many tiles back (Zephyr Archer). */
  push?: number;
  /** Order & Chaos: a bouncing shot (Softball Ace), drawn hopping from foe to foe. */
  hop?: boolean;
  /** Order & Chaos: how long a freezing lob holds what it strikes (straight shots freeze for 2 s). */
  freezeFor?: number;
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
  kind: "fireball" | "fire-wall" | "eruption" | "death-breath" | "storm" | "frost-nova" | "arrows" | "doom";
  lane: number;
  x: number;
  at: number;
  dmg: number;
  /** Frost nova: ticks the foes stay frozen. */
  freeze?: number;
};

/**
 * `dmg`: a hero's Royal Charge (hurts instead of slaying, then leaves). `bowl`: an Order & Chaos
 * Rolling Armadillo — rolls at `speed`, and with bounces left glances into a neighbouring lane
 * after each foe it strikes (`fromLane` / `laneAt`: where and when it last changed lane, for drawing).
 */
export type Charger = {
  lane: number; state: "ready" | "charging" | "gone"; x: number; px: number; dmg?: number; hits?: number[]; sprite?: string;
  bowl?: { bounces: number; zig: 1 | -1; speed: number; fromLane: number; laneAt: number; scale?: number };
};
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
  | { e: "mine"; id: number; lane: number; x: number; frost?: boolean }
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
  // Order & Chaos content pass: the new troops' and foes' moments
  | { e: "band"; id: number; members: number }
  | { e: "leap"; id: number; kind: DefKind; lane: number; col: number; x: number; fire: boolean }
  | { e: "bash"; id: number; target: number; from: number; to: number; lane: number }
  | { e: "quickdraw"; id: number; target: number; lane: number; x: number }
  | { e: "gas"; id: number; big: boolean }
  | { e: "maw"; id: number; target: number; whole: boolean; kind: EnemyKind; lane: number; x: number }
  | { e: "allies"; id: number; count: number }
  | { e: "bowl"; lane: number; x: number }
  | { e: "dash"; id: number; reach: number }
  | { e: "slam"; id: number; reach: number }
  | { e: "shockwave"; id: number; lanes: number[] }
  | { e: "radiance"; id: number }
  | { e: "grab"; id: number; target: number; from: number; to: number; lane: number }
  | { e: "incinerate"; id: number; target: number; lane: number; col: number }
  | { e: "douse"; id: number }
  | { e: "knight"; id: number; target: number }
  | { e: "parasol"; id: number; lane: number; x: number }
  | { e: "drop"; id: number; passenger: number }
  | { e: "encase"; id: number; target: number }
  | { e: "thaw"; id: number }
  | { e: "foeWhirl"; id: number; lane: number; col: number }
  | { e: "foeSlam"; id: number; lane: number; col: number }
  | { e: "assassinate"; id: number; target: number; lane: number; col: number }
  | { e: "unnerved"; id: number; lane: number; x: number }
  | { e: "bossEnter"; id: number; kind: EnemyKind }
  | { e: "bossCue"; id: number; move: WarbossMove["kind"]; index: number; marks: BossMark[] }
  | { e: "bossMove"; id: number; move: WarbossMove["kind"]; index: number; marks: BossMark[]; lane: number; x: number }
  | { e: "bossPhase"; id: number; phase: number }
  | { e: "bossRepel"; id: number; lane: number }
  | { e: "bossFall"; id: number; kind: EnemyKind }
  // Order & Chaos battlefield
  | { e: "weather"; kind: WeatherKind }
  | { e: "strikeMark"; lane: number; col: number }
  | { e: "strike"; lane: number; col: number }
  | { e: "raft"; lane: number; col: number }
  | { e: "crate"; lane: number; col: number }
  | { e: "iced"; lane: number; col: number }
  | { e: "melt"; lane: number; col: number }
  | { e: "crater"; lane: number; col: number }
  | { e: "lull"; id: number; target: number }
  | { e: "brew"; id: number }
  | { e: "burn"; lane: number; col: number }
  | { e: "emerge"; id: number; origin: OriginKind | "crypt" }
  | { e: "chew"; id: number; target: number }
  | { e: "tombEaten"; id: number; lane: number; col: number; kind: EnemyKind }
  | { e: "loot"; id: number; target: number; value: number; lane: number; x: number }
  | { e: "chestOpen"; lane: number; x: number; value: number }
  | { e: "bankFreed"; id: number; lane: number; col: number; kind: DefKind }
  | { e: "wake"; id: number }
  | { e: "shotBlocked"; lane: number; x: number }
  | { e: "fogClear"; lane: number }
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
/** `rout`: the horde breaking when its boss falls (no rebirth, last gasp, split or corpse to raise). */
export type KillHow = "normal" | "petrify" | "charge" | "burn" | "devour" | "rout";

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
    /** Order & Chaos Counterstrike: every troop strikes back at its biters until this tick (absent: never cast). */
    counterUntil?: number;
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
  /** Order & Chaos battlefield: the lawn tile by tile (flat arrays: tiles, footing laid, ice, craters); absent until the level or the battle needs one. */
  field?: FieldState;
  /** Order & Chaos battlefield: the weather in play; absent under clear skies with no weather set. */
  weather?: WeatherState;
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
  /** Order & Chaos: the world boss once it has come on (its id). */
  warbossId?: number;
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
  if (cfg.oc) setupField(s, cfg.oc);
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

/** Health multiplier for a troop of this kind (Armor of Wonder; Order & Chaos Shield of the Dwarven Lords: walls +50%). */
function hpMult(s: GarrisonState, kind?: DefKind): number {
  let mult = s.def.blessings.includes("armor-of-wonder") ? 1.3 : 1;
  if (kind && s.def.blessings.includes("dwarven-shield") && DEFENDERS[kind] && isWall(DEFENDERS[kind]!)) mult *= 1.5;
  return mult;
}

/** A troop's full health: its kind's, scaled (a band counts every member). */
function fullHp(s: GarrisonState, kind: DefKind, members = 1): number {
  return Math.round(DEFENDERS[kind]!.hp * hpMult(s, kind) * Math.max(1, members));
}

function addDefender(s: GarrisonState, kind: DefKind, lane: number, col: number): Defender {
  const maxHp = fullHp(s, kind);
  const trap = DEFENDERS[kind]!.trap;
  const d: Defender = {
    id: s.nextId++, kind, lane, col, hp: maxHp, maxHp, shell: 0, cd: 0, cd2: 0, busyUntil: 0,
    armedAt: kind === "mine" ? s.tick + LAND_MINE_ARM : trap ? s.tick + trap.arm : 0,
    cursedUntil: 0, stunnedUntil: 0, poisonUntil: 0, poisonDps: 0, shotAt: -1, shotsLeft: 0, shots: 0, strikes: 0,
    raiseAt: 0, mana: 0, reborn: false, placedAt: s.tick,
    surgeLeft: 0, surgeAt: 0, stacks: 0, expireAt: 0, invulnUntil: 0, ascendUntil: 0, owner: 0,
    sheepUntil: 0, laddered: false, domeUntil: 0, dead: false,
  };
  // Order & Chaos: a nocturnal troop raised in a day battle sleeps until it gets a Wake-Up Brew.
  if (DEFENDERS[kind]!.nocturnal && s.cfg.oc && !s.cfg.oc.night) d.asleep = 1;
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
    // Order & Chaos content pass.
    : def.quickdraw ? sec(1)
    : def.gas ? def.gas.every
    : def.dash ? sec(1)
    : def.slam ? sec(1)
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
    : def.allies ? sec(4)
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
  if (def.hex || def.lull) e.cd2 = sec(2);
  // Order & Chaos second timers: flyers' strikes from the sky, a Phantom's phasing, an Arch-vile's raising.
  if (def.skyAttack) e.cd2 = def.skyAttack.every;
  // Order & Chaos content pass: tentacles, knightings, frost bolts and blinks come a moment after it reaches the lawn.
  if (def.grab || def.knight || def.frostbite || def.assassin) e.cd2 = sec(2);
  if (def.carry) e.carrying = true;
  // Order & Chaos Treasure Kobold: its sack of loot and a Surge orb, however it came onto the lawn (a wave, a crypt door...).
  if (def.treasure) {
    e.loot = def.treasure.loot;
    if (s.cfg.oc) e.carrier = true;
  }
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
  return !d.owner && d.expireAt === 0 && !DEFENDERS[d.kind]?.landmark;
}

/** A defender with nothing but a body: skipped by Mage bolts. */
export function isWall(def: DefDef): boolean {
  return !def.shot && !def.melee && !def.lightning && !def.gaze && !def.stoneShot && !def.banish && !def.slowCast
    && !def.heal && !def.produce && !def.ignite && !def.aura && !def.flame && !def.resurrect
    && !def.trap && !def.spikes && !def.instant && !def.snipe && !def.airstrike && !def.beam && !def.pounce && !def.laneHeal
    && !def.caster && !def.burnAura && !def.gust && !def.shellGift && !def.ammo && !def.chainLightning && !def.luckyKills
    && !def.magnet && !def.devour && !def.charm && !def.aegis
    // Order & Chaos content pass (a Nix's bash, an Iron Maiden's jaws and a Yeti Warden's frost are a wall's own).
    && !def.leap && !def.quickdraw && !def.gas && !def.allies && !def.dash && !def.slam && !def.bowl;
}

/** Order & Chaos: turned into a sheep (cannot act, but still blocks the lane). */
export function isSheep(s: GarrisonState, d: Defender): boolean {
  return (d.sheepUntil ?? 0) > s.tick;
}

/** Order & Chaos: asleep (a night creature by day, a Nightmare's lull) or sealed in a Frostcaller's ice. */
function dormant(s: GarrisonState, d: Defender): boolean {
  return (d.asleep ?? 0) > 0 || (d.iceUntil ?? 0) > s.tick;
}

/**
 * Whether a troop's own aura-like ability is working: a speed, ward or ammunition aura, an Aegis
 * dome, a Bellwether's lure, light, warmth, setting passing shots alight, a Leprechaun's luck.
 * Not while it is a sheep, asleep or sealed in ice (a stun is momentary and leaves auras on). Its
 * body — health, armour, resistances, being tall or steadfast — always counts.
 */
export function auraActive(s: GarrisonState, d: Defender): boolean {
  return !isSheep(s, d) && !dormant(s, d);
}

/**
 * Whether a troop reacts to being bitten or touched — shield-bashes, snapping jaws, charms,
 * freezing, chilling or bewildering its biter, thorns, retaliation, raising the fallen — Order &
 * Chaos: not while it is a sheep, asleep, sealed in ice or stunned. Every such trigger asks this.
 * (Garrison Wars has none of those states and keeps its thorns and plague walls as they were.)
 */
export function canReact(s: GarrisonState, d: Defender): boolean {
  if (isSheep(s, d)) return false;
  return !s.cfg.oc || (!dormant(s, d) && d.stunnedUntil <= s.tick);
}

/** Cures (the spell, a Field Hospital) lift a Sorceress' hex (and a Nightmare's lull). */
function clearHex(s: GarrisonState, d: Defender): void {
  if (d.asleep === 2) wakeTroop(s, d, false);
  // (Order & Chaos: a Frostcaller's ice melts too.)
  if ((d.iceUntil ?? 0) > s.tick) thaw(s, d);
  if (!isSheep(s, d)) return;
  d.sheepUntil = 0;
  s.events.push({ e: "unhex", id: d.id });
}

/** Order & Chaos: a tile a Juggernaut left burning (nothing can be placed on it yet). */
export function scorchedAt(s: GarrisonState, lane: number, col: number): boolean {
  return s.scorched?.some((t) => t.lane === lane && t.col === col && t.until > s.tick) === true;
}

/**
 * Order & Chaos Aegis: the dome over this tile, if any (its bearer; none while it is a sheep, asleep or iced).
 * `straight`: only a Surge-widened dome turns straight shots aside.
 */
export function aegisOver(s: GarrisonState, lane: number, col: number, straight = false): Defender | undefined {
  if (!s.cfg.oc) return undefined;
  for (const a of s.defenders) {
    const aegis = a.dead ? undefined : DEFENDERS[a.kind]!.aegis;
    if (!aegis || !auraActive(s, a)) continue;
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

/**
 * Structures (tents, banners) are only something to shoot at in versus; the
 * lawn's graves, crypts, chests and creature banks always are. Order & Chaos
 * fog hides foes past the fog line, and a swimmer under the water is unseen.
 */
function shootable(s: GarrisonState, e: Enemy): boolean {
  return !e.dead && !e.charmed && e.state !== "teleport" && e.state !== "glide" && e.state !== "burrow" && e.state !== "phase" && !hidden(e)
    && (!isStructure(e) || s.cfg.mode === "versus" || isLawnStructure(e))
    && (!s.weather || !fogged(s, e)) && (!s.field || !submerged(s, e));
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
  | { ok: true; action: "place" | "fuse" | "shell" | "spell" | "band"; target?: Defender; result?: DefKind; cost: number }
  | { ok: false; reason: string };

/** Order & Chaos band: what regrouping this troop costs (the packet's price plus `step` per member already there), or null when it can't grow. */
export function bandCost(s: GarrisonState, d: Defender, cardId: CardId): number | null {
  const band = DEFENDERS[d.kind]?.band;
  const places = CARDS[cardId]?.places;
  if (!band || !places || baseKind(places) !== baseKind(d.kind) || DEFENDERS[d.kind]!.ascendedFrom || (d.members ?? 1) >= band.max) return null;
  return cardCost(s, cardId) + band.step * (d.members ?? 1);
}

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
  // Order & Chaos footing: a Raft goes on open water, a Crate on the roof (then any troop can stand there).
  if (card.spell === "raft" || card.spell === "crate") {
    const code = tileCode(s, lane, col);
    const fits = card.spell === "raft" ? code === TILE.water : code === TILE.roof || code === TILE.ridge;
    if (!fits) return { ok: false, reason: card.spell === "raft" ? "Lay a Raft on open water." : "Set a Crate down on the roof." };
    if (hasFooting(s, lane, col)) return { ok: false, reason: card.spell === "raft" ? "There's a raft there already." : "There's a crate there already." };
    if (here) return { ok: false, reason: "Tile taken." };
    return { ok: true, action: "spell", cost };
  }
  // Order & Chaos Wake-Up Brew: poured on a sleeping troop.
  if (card.spell === "wake") {
    if (!here?.asleep) return { ok: false, reason: "Pour the Brew on a sleeping troop (Zzz)." };
    return { ok: true, action: "spell", target: here, cost };
  }
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
    // Order & Chaos band: the same packet on a band grows it by one member (a dearer regroup).
    const regroup = s.cfg.oc ? bandCost(s, here, cardId) : null;
    if (regroup !== null) {
      const price = s.cfg.conveyorPool ? 0 : regroup;
      if (s.def.gold < price) return { ok: false, reason: `Regrouping costs ${price} gold.` };
      if (isSheep(s, here)) return { ok: false, reason: "A sheep can't be regrouped — wait for the hex to wear off." };
      return { ok: true, action: "band", target: here, cost: price };
    }
    if (s.cfg.oc && DEFENDERS[here.kind]?.band && CARDS[cardId]?.places && baseKind(CARDS[cardId]!.places!) === baseKind(here.kind)) {
      return { ok: false, reason: DEFENDERS[here.kind]!.ascendedFrom ? "An Ascended band can't take new members." : "The band is already a full Horde." };
    }
    const result = fusionFor(here.kind, cardId);
    return result ? { ok: true, action: "fuse", target: here, result: fusedKind(s, result, here.kind, cardId), cost } : { ok: false, reason: "Tile taken." };
  }
  const [minCol, maxCol] = s.cfg.defCols;
  if (col < minCol || col > maxCol) return { ok: false, reason: "Your troops can't hold that ground." };
  if (tentAt(s, lane, col)) return { ok: false, reason: "An enemy tent stands there." };
  // Order & Chaos: a Rooting Boar is planted on a grave or crypt (and nowhere else).
  if (card.places && DEFENDERS[card.places]?.eatTomb) {
    return tombAt(s, lane, col) ? { ok: true, action: "place", cost } : { ok: false, reason: "Plant the Boar on a grave or a crypt — it eats tombs." };
  }
  if (graveAt(s, lane, col)) return { ok: false, reason: s.cfg.cards.some((id) => DEFENDERS[CARDS[id]?.places ?? ""]?.eatTomb) ? "A grave stands there — destroy it, or plant a Rooting Boar on it." : "A grave stands there — destroy it first." };
  if (s.cfg.oc) {
    const blocked = fieldBlocks(s, lane, col, card.places);
    if (blocked) return { ok: false, reason: blocked };
  }
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
  if (d.asleep) return { ok: false, reason: "It's asleep — wake it with a Wake-Up Brew first." };
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
  if (d.asleep) return { ok: false, reason: "It's asleep — wake it with a Wake-Up Brew first." };
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
  if (s.weather) weatherAct(s);
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
      } else if (check.action === "band" && check.target) {
        // One more member joins the band: its health, and an extra shot in every volley.
        const d = check.target;
        d.members = (d.members ?? 1) + 1;
        const maxHp = fullHp(s, d.kind, d.members);
        d.hp = Math.min(maxHp, d.hp + (maxHp - d.maxHp));
        d.maxHp = maxHp;
        s.stats.placed += 1;
        s.events.push({ e: "band", id: d.id, members: d.members });
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
        } else if (card.spell === "raft" || card.spell === "crate") {
          layFooting(s, cmd.lane, cmd.col);
        } else if (card.spell === "wake" && check.target) {
          wakeTroop(s, check.target, true);
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
      // Protected wards and the field's landmarks stay.
      if (!d || s.protectIds.includes(d.id) || DEFENDERS[d.kind]!.landmark) return;
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
  // (A band keeps its members through an Ascension.)
  d.maxHp = fullHp(s, kind, d.members);
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
  /** With `fire`: how much of `amount` is flame (a shot set alight: its burn bonus). Absent: all of it. Rain and water douse only this part. */
  firePart?: number;
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
  // Order & Chaos battlefield: rain and standing water douse fire (only the flames: a burning arrow keeps its point).
  if (hit.fire && s.cfg.oc) {
    let douse = 1;
    if (s.weather && wetWeather(s)) douse *= FIELD.rainFire;
    if (s.field && inWater(s, e)) douse *= FIELD.wetFire;
    if (douse < 1) {
      const flames = hit.firePart === undefined ? 1 : Math.max(0, Math.min(1, hit.firePart / amount));
      dmg *= 1 - flames * (1 - douse);
    }
  }
  // Order & Chaos Dragon Wing Tabard: flyers take half as much again.
  if (def.flying && s.cfg.oc && has(s, "dragon-wing-tabard")) dmg *= 1.5;
  if (dmg <= 0) return 0;
  reveal(s, e);
  // A blow on a creature bank or one of its sleepers wakes them all.
  if (e.guard) wakeGuards(s, e.guard);
  else if (def.bank) wakeGuards(s, e.id);
  // Order & Chaos Blackshard of the Dead Knight: blows bite half again as deep into shields, helms and armour.
  const gear = s.cfg.oc && has(s, "blackshard") ? 1.5 : 1;
  if (hit.straight && e.shield > 0 && hit.fromDir !== undefined && hit.fromDir !== e.dir) {
    const absorbed = Math.min(e.shield, dmg * gear);
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
    absorbed = Math.min(e.armor, Math.round(dmg * gear));
    e.armor -= absorbed;
    dmg = Math.max(0, dmg - Math.round(absorbed / gear));
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
  if (def.structure) {
    if (s.cfg.oc) structureDown(s, e, how);
    return;
  }
  // Order & Chaos: a Lawful ally (Rin's cat) that falls is no kill, no Valor and no corpse to raise.
  if (def.ally) return;
  // Order & Chaos Stormbird Carrier: brought down (or blown away) with its passenger, the passenger falls where it is.
  if (def.carry && e.carrying) dropPassenger(s, e);
  s.stats.kills += 1;
  // A swallowed foe is gone for good: nothing to raise (nor is a routed one).
  if (!def.boss && how !== "devour" && how !== "rout") {
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
  // A Pain Elemental bursts into Lost Souls (its lane first, then the neighbours). (Swallowed whole, nothing gets out.)
  if (def.deathSpawn && ENEMIES[def.deathSpawn.kind] && how !== "charge" && how !== "devour" && how !== "rout" && e.x <= SPAWN_X) {
    const lanes = [e.lane, e.lane - 1, e.lane + 1].filter((lane) => isActiveLane(s, lane));
    for (let i = 0; i < def.deathSpawn.count && lanes.length > 0; i += 1) {
      const soul = spawnEnemy(s, def.deathSpawn.kind, lanes[i % lanes.length]!, Math.max(0.3, Math.min(SPAWN_X, e.x + 0.25 * i)), e.side, e.wave);
      s.events.push({ e: "enemyRise", id: soul.id });
    }
  }
  if (def.boss) {
    // Order & Chaos: the horde breaks at once — nothing rises again, crawls on, splits or bursts into more.
    // (Garrison Wars' Dracolich keeps its old sweep.)
    for (const other of s.enemies) if (!other.dead && other !== e && !isStructure(other)) killEnemy(s, other, s.cfg.oc ? "rout" : "normal");
    // Order & Chaos: a world boss's fall breaks the horde for good (no more waves).
    if (def.warboss) {
      s.director.done = true;
      s.events.push({ e: "bossFall", id: e.id, kind: e.kind });
    }
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
    // (A hexed, sleeping, iced or stunned raiser lets the corpse lie.)
    if (!raise || d.dead || s.tick < d.raiseAt || !canReact(s, d)) continue;
    if (Math.abs(e.lane - d.lane) > 1 || Math.abs(e.x - (d.col + 0.5)) > 1.5) continue;
    const col = Math.max(0, Math.min(GW_COLS - 1, Math.floor(e.x)));
    const [minCol, maxCol] = s.cfg.defCols;
    if (col < minCol || col > maxCol || defenderAt(s, e.lane, col) || tentAt(s, e.lane, col) || scorchedAt(s, e.lane, col)) continue;
    if (s.cfg.oc && fieldBlocks(s, e.lane, col, raise.kind)) continue;
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

/** `fire`: Chaos fire (fireballs, flames, rockets, kegs, breath) — rain halves it. */
type DefHit = { crush?: boolean; atk?: boolean; magic?: boolean; cloud?: boolean; fire?: boolean };

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
    // Order & Chaos rain: fire deals half (theirs too).
    if (hit.fire && s.weather && wetWeather(s)) dmg *= FIELD.rainFire;
    // Order & Chaos Eversmoking Ring of Sulfur: the troops shrug off half of any fire.
    if (hit.fire && s.cfg.oc && has(s, "ring-of-sulfur")) dmg *= 0.5;
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
  // Summoned troops (Surge copies, earthen walls) and the field's landmarks are not there to be raised again.
  if (!isFlat(d) && d.expireAt === 0 && !def.landmark) {
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
  // (Order & Chaos: a moonless night drops no gold at all.)
  if (TERRAINS[cfg.terrain].skyGold && !cfg.conveyorPool && cfg.mode !== "raid" && !cfg.oc?.lastStand && !s.overtime && s.tick >= def.skyAt && !cfg.oc?.night) {
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
  // Order & Chaos: the weather turns as the wave that brings it comes.
  if (s.weather) advanceWeather(s, wave);
  let budget = waveBudget(s, wave);
  // Order & Chaos: the wave a world boss leads is its escort (the boss is the assault).
  const bossWave = s.cfg.oc?.warboss?.wave === wave && !s.warbossId;
  if (bossWave) budget = Math.max(1, Math.round(budget * BOSS_ESCORT));
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
      // (Order & Chaos Treasure Kobolds are drafted only now and then.)
      const w = (1 / (1 + ENEMIES[kind]!.cost * 0.15)) * (ENEMIES[kind]!.treasure?.rare ?? 1);
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
  // Order & Chaos: the world boss leads its assault down the middle road.
  const warboss = s.cfg.oc?.warboss;
  if (warboss && wave === warboss.wave && !s.warbossId && ENEMIES[warboss.kind]?.warboss) {
    const lanes = s.cfg.lanes;
    const boss = spawnEnemy(s, warboss.kind, lanes.includes(2) ? 2 : lanes[Math.floor(lanes.length / 2)]!, SPAWN_X - 0.2, "wave", wave);
    boss.cd2 = sec(4);
    s.warbossId = boss.id;
    hp += boss.hp + boss.shield + boss.armor;
    s.events.push({ e: "bossEnter", id: boss.id, kind: boss.kind });
  }
  const oc = s.cfg.oc;
  let carried = false;
  for (let i = 0; i < picks.length; i += 1) {
    // Order & Chaos: some come out of the water, drop from the sky or climb out of tunnels instead.
    const origin = oc?.origins?.length ? pickOrigin(s, picks[i]!, wave) : null;
    const e = (origin ? spawnFrom(s, picks[i]!, origin, wave) : null)
      ?? spawnEnemy(s, picks[i]!, pickLane(s), SPAWN_X + rand(s) * 0.9 + (flag ? Math.floor(i / 5) * 0.5 : 0), "wave", wave);
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
    // Crypt doors open wide, and every creature bank's sleepers join the assault.
    for (const crypt of s.enemies.filter((c) => !c.dead && ENEMIES[c.kind]!.crypt)) {
      const cr = ENEMIES[crypt.kind]!.crypt!;
      for (let k = 0; k < cr.flag; k += 1) {
        const risen = cryptRaise(s, crypt, cr.maxCost + 1, wave);
        hp += risen.hp + risen.shield + risen.armor;
      }
    }
    for (const g of s.enemies) if (!g.dead && g.guard) wake(s, g);
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
    if (s.enemies.some((e) => !e.dead && !isStructure(e) && !ENEMIES[e.kind]!.ally)) return;
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
  // (Order & Chaos Shield of the Dwarven Lords: the walls already standing grow too.)
  if ((id === "armor-of-wonder" || id === "dwarven-shield") && first) {
    for (const d of s.defenders) {
      if (d.dead) continue;
      const maxHp = fullHp(s, d.kind, d.members);
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
  if (d.stunnedUntil > s.tick || isSheep(s, d) || d.asleep || (d.iceUntil ?? 0) > s.tick) return 0;
  let rate = 1;
  if (s.def.hasteUntil > s.tick) rate *= 1.5;
  if (s.def.prayerUntil > s.tick) rate *= 1.3;
  if (d.cursedUntil > s.tick) rate *= 0.5;
  if (has(s, "necklace-of-swiftness")) rate *= 1.2;
  // Order & Chaos battlefield: a blizzard slows the troops; the one on clover is lucky.
  if (s.weather?.kind === "blizzard") rate *= FIELD.blizzardTroops;
  if (s.field && tileCode(s, d.lane, d.col) === TILE.clover) rate *= FIELD.clover;
  let aura = 0;
  for (const a of auras) {
    if (a !== d && Math.abs(a.lane - d.lane) <= 1 && Math.abs(a.col - d.col) <= 1 && auraActive(s, a)) aura = Math.max(aura, DEFENDERS[a.kind]!.aura ?? 0);
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
    // Order & Chaos: a fire troop next to a troop sealed in ice melts it free.
    if (second && (d.iceUntil ?? 0) > s.tick && warmAt(s, d)) thaw(s, d);

    const trap: DefDef["trap"] = d.kind === "mine" ? MINE_TRAP : def.trap;
    if (trap) {
      if (s.tick < d.armedAt) continue;
      const trigger = s.enemies.find((e) => e.lane === d.lane && grounded(e) && !isStructure(e) && !isFlying(e) && !ENEMIES[e.kind]!.boss && Math.abs(e.x - centre) <= 0.5);
      if (trigger) {
        d.dead = true;
        const wide = trap.wide === true;
        const freeze = trap.freeze ?? 0;
        s.events.push({ e: "mine", id: d.id, lane: d.lane, x: centre, frost: freeze > 0 });
        for (const e of [...s.enemies]) {
          // (Order & Chaos Glacial Charge: a frost blast over the lanes beside it too, freezing what it catches.)
          if ((wide ? Math.abs(e.lane - d.lane) > 1 : e.lane !== d.lane) || !grounded(e) || isStructure(e) || isFlying(e) || Math.abs(e.x - centre) > trap.radius) continue;
          hurtEnemy(s, e, trap.dmg, { spell: true });
          if (freeze > 0 && !e.dead && canChill(e)) e.freezeUntil = Math.max(e.freezeUntil, s.tick + frost(s, freeze));
        }
      }
      continue;
    }

    // Order & Chaos Stone Gargoyle: drops on the first foe to come near, then is gone (awake and free to move first).
    if (def.leap) {
      if (!d.asleep && d.stunnedUntil <= s.tick && !isSheep(s, d) && (d.iceUntil ?? 0) <= s.tick) leapAct(s, d, def.leap);
      continue;
    }
    // Order & Chaos Rolling Armadillo: curls up and rolls off down the lane at once.
    if (def.bowl) {
      d.dead = true;
      s.events.push({ e: "dismiss", id: d.id });
      s.chargers.push({
        lane: d.lane, state: "charging", x: centre, px: centre, dmg: def.bowl.dmg, hits: [], sprite: def.sprite,
        bowl: { bounces: def.bowl.bounces, zig: d.lane >= 2 ? -1 : 1, speed: 0.2, fromLane: d.lane, laneAt: s.tick, scale: def.scale }
      });
      continue;
    }

    // Order & Chaos instants act once, stunned or not, and are gone (a sleeping one waits for its Brew).
    if (def.instant) {
      if (d.asleep) continue;
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
        // Order & Chaos Shrine of Magic: a Surge orb beside it.
        if (def.produce.orb) dropOrb(s, Math.min(8.6, centre + 0.55), d.lane);
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
          shockEnemy(s, target, def.lightning.dmg * (has(s, "ogres-club") ? 1.5 : 1));
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
          if (Math.abs(f.lane - d.lane) <= 1 && Math.abs(f.col - d.col) <= 1 && !defenderAt(s, f.lane, f.col) && isActiveLane(s, f.lane) && !scorchedAt(s, f.lane, f.col)
            && (!s.cfg.oc || !fieldBlocks(s, f.lane, f.col, f.kind))) {
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
  // Order & Chaos rain: lightning leaps one foe further, and farther.
  if (tint === "lightning" && s.weather && wetWeather(s)) {
    jumps += FIELD.rainHops;
    reach *= FIELD.rainReach;
  }
  // Order & Chaos Thunder Helmet: chain lightning leaps to one more foe.
  if (tint === "lightning" && s.cfg.oc && has(s, "thunder-helmet")) jumps += 1;
  for (let i = 0; i <= jumps && cur; i += 1) {
    struck.add(cur.id);
    s.events.push({ e: "zap", lane: src.lane, x: src.x, toLane: cur.lane, toX: cur.x, tint });
    src = { lane: cur.lane, x: cur.x };
    if (tint === "lightning") shockEnemy(s, cur, amount, { spell: true });
    else hurtEnemy(s, cur, amount, {});
    amount *= falloff;
    cur = nearestFoe(s, src, reach, struck, laneReach);
  }
}

/** Neighbours' Ammo Carts: extra shots per volley. */
function ammoAt(s: GarrisonState, d: Defender): number {
  let best = 0;
  for (const o of s.defenders) {
    if (o === d || o.dead || Math.abs(o.lane - d.lane) > 1 || Math.abs(o.col - d.col) > 1 || !auraActive(s, o)) continue;
    best = Math.max(best, DEFENDERS[o.kind]!.ammo ?? 0);
  }
  return best;
}

/** War Unicorn wards: share of damage the defender is spared. */
function wardAt(s: GarrisonState, d: Defender): number {
  let best = 0;
  for (const o of s.defenders) {
    if (o.dead || Math.abs(o.lane - d.lane) > 1 || Math.abs(o.col - d.col) > 1 || !auraActive(s, o)) continue;
    best = Math.max(best, DEFENDERS[o.kind]!.ward ?? 0);
  }
  return Math.min(0.9, best);
}

/** Leprechauns: a foe slain in their lane or the two beside it may drop gold. */
function luckyDrop(s: GarrisonState, e: Enemy): void {
  for (const d of s.defenders) {
    const luck = DEFENDERS[d.kind]!.luckyKills;
    if (!luck || d.dead || Math.abs(d.lane - e.lane) > 1 || !auraActive(s, d)) continue;
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
    && !scorchedAt(s, lane, col) && (!s.cfg.oc || fieldBlocks(s, lane, col) === null);
}

function fireBeam(s: GarrisonState, d: Defender, lanes: readonly number[], dmg: number): void {
  const centre = d.col + 0.5;
  s.events.push({ e: "beam", id: d.id, lanes: [...lanes] });
  for (const e of [...s.enemies]) {
    if (!lanes.includes(e.lane) || !shootable(s, e) || e.x < centre - 0.2 || e.x > SIGHT_X + 0.3) continue;
    hurtEnemy(s, e, dmg, {});
  }
}

/** How often one walker can be blown back by gales before it braces against the wind. */
export const GUST_LIMIT = 3;

/** A gale: flyers (and a hovering Snatcher) are blown off the field, the rest pushed back. */
function gustFoe(s: GarrisonState, e: Enemy, push: number): void {
  const def = ENEMIES[e.kind]!;
  // Charmed foes fight for Order: its gales spare them. (A creature bank's sleepers lie low in the wind.)
  if (e.dead || e.charmed || def.structure || def.boss || !onLawn(e) || e.guard) return;
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
  // A walker braces against the wind after GUST_LIMIT gales (gales alone must never hold a lane shut for good).
  if ((e.gusts ?? 0) >= GUST_LIMIT) return;
  e.gusts = (e.gusts ?? 0) + 1;
  // (Never out of sight: a foe blown back past the edge of the lawn could be pinned there, beyond every shot.)
  e.x = Math.max(e.x, Math.min(SIGHT_X - 0.05, e.x + push));
  e.px = e.x;
  if (e.state === "eat" || e.state === "cast" || e.state === "plant") setState(s, e, "walk");
}

/** A lobbed shot from a defender onto a chosen foe (Surges). */
function lobAt(
  s: GarrisonState, d: Defender, target: Enemy, kind: ProjectileKind, dmg: number, splash: number, shatter: boolean,
  frost: { chill?: boolean; freeze?: number } = {}
): void {
  const fromX = d.col + 0.7;
  const dist = Math.abs(target.x - fromX);
  s.projectiles.push(newProjectile(s, {
    kind, side: "def", lane: d.lane, x: fromX, dir: 1, dmg, shatter, chill: frost.chill === true,
    freeze: (frost.freeze ?? 0) > 0, freezeFor: frost.freeze,
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
  else if (inst.kind === "doom") {
    // Order & Chaos Magma Elemental: a huge eruption (five lanes, 2.5 tiles each way), leaving a crater.
    s.blasts.push({ id: s.nextId++, kind: "doom", lane: d.lane, x, at: s.tick, dmg: inst.dmg });
    markCrater(s, d.lane, d.col);
  } else s.blasts.push({ id: s.nextId++, kind: "frost-nova", lane: d.lane, x, at: s.tick, dmg: inst.dmg, freeze: inst.freeze });
}

/** One shot of a Surge volley (Longbowman, Hina). */
function surgeVolley(s: GarrisonState, d: Defender): void {
  const def = DEFENDERS[d.kind]!;
  const surge = def.surge;
  // Order & Chaos Gunslinger: trick shots at random foes anywhere on the lawn (flyers too).
  if (surge?.kind === "fan") {
    const pool = foesOnField(s, (e) => e.x <= SIGHT_X);
    if (pool.length > 0) {
      const target = pool[randInt(s, 0, pool.length - 1)]!;
      s.events.push({ e: "quickdraw", id: d.id, target: target.id, lane: target.lane, x: target.x });
      hurtEnemy(s, target, surge.dmg * (def.power ?? 1), { straight: true, fromDir: target.x >= d.col + 0.5 ? 1 : -1 });
    }
    if (d.surgeLeft % 6 === 0) s.events.push({ e: "defShoot", id: d.id });
    d.surgeLeft -= 1;
    d.surgeAt = s.tick + 2;
    return;
  }
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

  // Order & Chaos battlefield: a Rooting Boar eating the tomb under it.
  if (def.eatTomb) {
    eatTombAct(s, d, def.eatTomb, rate);
    return;
  }

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
          if (roll === 2) shockEnemy(s, target, def.caster.dmg, { spell: true });
          else hurtEnemy(s, target, def.caster.dmg, { spell: true });
          if (!target.dead && roll === 0 && canChill(target)) target.chillUntil = Math.max(target.chillUntil, s.tick + frost(s, sec(6)));
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
      const struck = s.enemies.filter((e) => e.lane === d.lane && !e.dead && !e.charmed && !e.guard && !isStructure(e) && e.x - centre >= -0.3 && e.x - centre <= range && onLawn(e));
      if (struck.length > 0) {
        s.events.push({ e: "gust", id: d.id, lanes: [d.lane] });
        for (const e of struck) gustFoe(s, e, def.gust.push);
        // Order & Chaos fog: the gale blows it out of her lane for a while.
        if (s.weather) clearFog(s, [d.lane]);
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
      if (s.defenders.some((o) => !o.dead && o.lane === e.lane && DEFENDERS[o.kind]!.lure && auraActive(s, o)
        && e.x - (o.col + 0.5) >= -0.3 && e.x - (o.col + 0.5) <= DEFENDERS[o.kind]!.lure!.reach)) continue;
      lureFoe(s, e, d);
    }
  }

  // --- Order & Chaos content pass -------------------------------------------------
  // Nix Warrior: a spent shield-bash comes back in time.
  if (def.repel && d.stacks > 0) {
    d.cd2 -= rate;
    if (d.cd2 <= 0) {
      d.stacks -= 1;
      d.cd2 = d.stacks > 0 ? def.repel.regrow : 0;
    }
  }

  // Gunslinger: fans the hammer at the nearest foe in three lanes (flyers too).
  if (def.quickdraw) quickdrawAct(s, d, def.quickdraw, rate);

  // Rafflesia: the stench all round her (front and back, her lane and both beside it).
  if (def.gas) {
    d.cd -= rate;
    if (d.cd <= 0) {
      d.cd = def.gas.every;
      let struck = false;
      for (const e of [...s.enemies]) {
        if (Math.abs(e.lane - d.lane) > 1 || !grounded(e) || isStructure(e) || isFlying(e) || hidden(e) || !onLawn(e) || Math.abs(e.x - centre) > def.gas.reach) continue;
        if (s.field && submerged(s, e)) continue;
        hurtEnemy(s, e, def.gas.dmg, {});
        struck = true;
      }
      if (struck) s.events.push({ e: "gas", id: d.id, big: false });
    }
  }

  // Rin: lets a cat loose down her lane while there is a foe in it.
  if (def.allies) {
    d.cd2 -= rate;
    if (d.cd2 <= 0) {
      if (firstAhead(s, d.lane, centre, 9.6, true, isStructure)) {
        releaseAllies(s, d, [d.lane], def.allies.count);
        d.cd2 = def.allies.every;
      } else {
        d.cd2 = sec(1);
      }
    }
  }

  // Ayanami: the iai dash — down the lane through every foe within reach, and back.
  if (def.dash) {
    d.cd -= rate;
    if (d.cd <= 0) {
      const dash = def.dash;
      const struck = s.enemies.filter((e) => e.lane === d.lane && grounded(e) && !isStructure(e) && !isFlying(e) && !hidden(e)
        && e.x - centre >= -0.3 && e.x - centre <= dash.reach);
      if (struck.length > 0) {
        let far = 0;
        for (const e of struck) far = Math.max(far, e.x - centre);
        s.events.push({ e: "dash", id: d.id, reach: Math.min(dash.reach, far + 0.4) });
        const club = (has(s, "ogres-club") ? 1.5 : 1) * (s.def.frenzyUntil > s.tick ? 2 : 1);
        for (const e of struck) meleeBlow(s, d, e, dash.dmg * club);
        d.cd = dash.every;
      } else {
        d.cd = sec(0.25);
      }
    }
  }

  // War Mammoth: the ground-slam.
  if (def.slam) {
    d.cd -= rate;
    if (d.cd <= 0) {
      const slam = def.slam;
      const struck = s.enemies.filter((e) => Math.abs(e.lane - d.lane) <= 1 && grounded(e) && !isStructure(e) && !isFlying(e) && !hidden(e)
        && Math.abs(e.x - centre) <= slam.reach);
      if (struck.length > 0) {
        s.events.push({ e: "slam", id: d.id, reach: slam.reach });
        const club = (has(s, "ogres-club") ? 1.5 : 1) * (s.def.frenzyUntil > s.tick ? 2 : 1);
        for (const e of struck) {
          meleeBlow(s, d, e, slam.dmg * club);
          if (!e.dead && canSlow(e) && !ENEMIES[e.kind]!.stunImmune) e.stunUntil = Math.max(e.stunUntil, s.tick + slam.stun);
          if (d.dead) return;
        }
        d.cd = slam.every;
      } else {
        d.cd = sec(0.25);
      }
    }
  }

  // Lizard Warrior: badly wounded, it charges down its lane and leaves the lawn.
  if (def.lastCharge && d.hp < d.maxHp * def.lastCharge.below) {
    d.dead = true;
    s.events.push({ e: "lizardCharge", id: d.id, kind: d.kind, lane: d.lane, col: d.col });
    s.chargers.push({ lane: d.lane, state: "charging", x: centre, px: centre, dmg: def.lastCharge.dmg, hits: [], sprite: def.sprite });
  }
}

/** A melee blow from a troop's ability (dash, slam): an Efreet's fire shield scorches the striker back. */
function meleeBlow(s: GarrisonState, d: Defender, e: Enemy, dmg: number): number {
  const dealt = hurtEnemy(s, e, dmg, { melee: true });
  const fireShield = ENEMIES[e.kind]!.fireShield;
  if (fireShield && dealt > 0) hurtDefender(s, d, dealt * fireShield, { atk: true, fire: true });
  return dealt;
}

/** Order & Chaos Gunslinger: the nearest foe ahead in its lane or the two beside it (flyers too; a same-lane shot stops at ruins). */
function quickdrawTarget(s: GarrisonState, d: Defender): Enemy | undefined {
  const centre = d.col + 0.5;
  let best: Enemy | undefined;
  let bestDist = Number.MAX_VALUE;
  for (const e of s.enemies) {
    if (Math.abs(e.lane - d.lane) > 1 || !shootable(s, e) || isStructure(e) || !onLawn(e) || e.x > SIGHT_X) continue;
    const dx = e.x - centre;
    if (dx < -0.5) continue;
    // (A sandstorm: gunfire carries only FIELD.sandRange, like every straight shot.)
    if (s.weather && dx > carry(s, Number.POSITIVE_INFINITY)) continue;
    if (s.field && e.lane === d.lane && ruinsCrossed(s, d.lane, centre, e.x) !== null) continue;
    const dist = Math.abs(dx) + Math.abs(e.lane - d.lane) * 0.75;
    if (dist < bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  return best;
}

/** Order & Chaos Gunslinger: a burst of quick shots (each at whoever is nearest then); Ammo Carts add shots. */
function quickdrawAct(s: GarrisonState, d: Defender, qd: NonNullable<DefDef["quickdraw"]>, rate: number): void {
  const centre = d.col + 0.5;
  if (d.shotAt >= 0) {
    if (s.tick < d.shotAt) return;
    const target = quickdrawTarget(s, d);
    if (target) {
      s.events.push({ e: "quickdraw", id: d.id, target: target.id, lane: target.lane, x: target.x });
      hurtEnemy(s, target, qd.dmg, { straight: true, fromDir: target.x >= centre ? 1 : -1 });
    }
    d.shotsLeft -= 1;
    d.shotAt = d.shotsLeft > 0 && target ? s.tick + 3 : -1;
    return;
  }
  d.cd -= rate;
  if (d.cd > 0) return;
  if (!quickdrawTarget(s, d)) {
    d.cd = 0;
    return;
  }
  s.events.push({ e: "defShoot", id: d.id });
  d.shotAt = s.tick + Math.max(1, Math.round(5 / Math.max(rate, 0.5)));
  d.shotsLeft = qd.shots + ammoAt(s, d);
  d.cd = qd.every;
}

/** Order & Chaos: a troop's allies (Rin's cats) set off down the given lanes, fighting for Order. */
function releaseAllies(s: GarrisonState, d: Defender, lanes: readonly number[], count: number): void {
  const kind = DEFENDERS[d.kind]!.allies?.kind;
  if (!kind || !ENEMIES[kind] || lanes.length === 0) return;
  for (let i = 0; i < count; i += 1) {
    const lane = lanes[i % lanes.length]!;
    const ally = spawnEnemy(s, kind, lane, Math.min(SPAWN_X - 0.2, d.col + 0.8 + 0.3 * Math.floor(i / lanes.length)), "wave", 0);
    ally.charmed = 1;
    ally.dir = 1;
  }
  s.events.push({ e: "allies", id: d.id, count });
}

/** Order & Chaos Stone Gargoyle: drops on the nearest foe in reach (ahead, or right on top of it) and shatters. */
function leapAct(s: GarrisonState, d: Defender, leap: NonNullable<DefDef["leap"]>): void {
  const centre = d.col + 0.5;
  let target: Enemy | undefined;
  for (const e of s.enemies) {
    if (e.lane !== d.lane || !grounded(e) || isStructure(e) || isFlying(e) || hidden(e) || (s.field && submerged(s, e))) continue;
    const dx = e.x - centre;
    if (dx < -0.5 || dx > leap.reach) continue;
    if (!target || Math.abs(dx) < Math.abs(target.x - centre)) target = e;
  }
  if (!target) return;
  d.dead = true;
  const x = target.x;
  const fire = leap.fire === true;
  s.events.push({ e: "leap", id: d.id, kind: d.kind, lane: d.lane, col: d.col, x, fire });
  const wide = leap.radius >= 1;
  for (const e of [...s.enemies]) {
    if ((wide ? Math.abs(e.lane - d.lane) > 1 : e.lane !== d.lane) || !grounded(e) || isStructure(e) || isFlying(e) || Math.abs(e.x - x) > leap.radius) continue;
    hurtEnemy(s, e, leap.dmg * (fire ? fireMult(s) : 1), fire ? { fire: true } : { melee: true });
  }
  if (fire && s.field) fireOnTiles(s, d.lane, x, false);
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
  // Order & Chaos: a Surge melts a troop out of ice; Sandals of the Saint heal and cleanse it too.
  if ((d.iceUntil ?? 0) > s.tick) thaw(s, d);
  if (has(s, "sandals-of-the-saint") && !isFlat(d)) {
    const amount = d.maxHp - d.hp;
    d.hp = d.maxHp;
    d.poisonUntil = 0;
    d.cursedUntil = 0;
    d.stunnedUntil = 0;
    clearHex(s, d);
    if (amount > 0) s.events.push({ e: "heal", id: d.id, target: d.id, amount });
  }
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
    case "fan":
      // (A band's every member joins the storm.)
      d.surgeLeft = surge.shots * (surge.kind === "storm" ? d.members ?? 1 : 1);
      d.surgeAt = s.tick;
      return;
    case "freeze-lane":
      for (const e of [...s.enemies]) {
        if (e.lane !== d.lane || !shootable(s, e) || isStructure(e) || !onLawn(e)) continue;
        hurtEnemy(s, e, surge.dmg * p, { spell: true });
        if (!e.dead && canChill(e)) e.freezeUntil = Math.max(e.freezeUntil, s.tick + frost(s, surge.dur));
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
      if (s.weather) clearFog(s, s.cfg.lanes);
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
        if (!e.dead && canChill(e)) e.freezeUntil = Math.max(e.freezeUntil, s.tick + frost(s, surge.dur));
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
    // --- Order & Chaos content pass ---
    case "shockwave": {
      // A shield-charge: every foe ahead within reach, in its lane and both beside it, is hurled back and stunned.
      const lanes = [d.lane - 1, d.lane, d.lane + 1].filter((lane) => isActiveLane(s, lane));
      s.events.push({ e: "shockwave", id: d.id, lanes });
      for (const e of [...s.enemies]) {
        if (!lanes.includes(e.lane) || !grounded(e) || isStructure(e) || isFlying(e) || e.x - centre < -0.3 || e.x - centre > surge.reach || !onLawn(e)) continue;
        knockBack(s, e, surge.push);
        if (!e.dead && canSlow(e) && !ENEMIES[e.kind]!.stunImmune) e.stunUntil = Math.max(e.stunUntil, s.tick + surge.dur);
      }
      return;
    }
    case "hail":
      for (const t of bulkiestFoes(s, surge.count, (e) => !isFlying(e))) {
        lobAt(s, d, t, def.shot?.projectile === "boulder" ? "boulder" : "frost", surge.dmg * p, surge.dmg * p * 0.5, true, { chill: true, freeze: surge.freeze });
      }
      return;
    case "radiance":
      s.events.push({ e: "radiance", id: d.id });
      for (const e of foesOnField(s)) hurtEnemy(s, e, surge.dmg * p, { spell: true });
      for (const o of s.defenders) {
        if (o.dead || isFlat(o) || o.hp >= o.maxHp) continue;
        const amount = Math.min(Math.round(surge.heal * p), o.maxHp - o.hp);
        o.hp += amount;
        s.events.push({ e: "heal", id: d.id, target: o.id, amount });
      }
      return;
    case "miasma":
      s.events.push({ e: "gas", id: d.id, big: true });
      for (const e of s.enemies) {
        if (Math.abs(e.lane - d.lane) > surge.reach || !grounded(e) || isStructure(e) || isFlying(e) || Math.abs(e.x - centre) > surge.reach + 0.5 || !onLawn(e)) continue;
        e.poisonDps = e.poisonUntil > s.tick ? Math.max(e.poisonDps, surge.dps * p) : surge.dps * p;
        e.poisonUntil = s.tick + surge.dur;
      }
      return;
    case "embrace": {
      const maw = def.maw;
      if (!maw) return;
      const prey = s.enemies
        .filter((e) => Math.abs(e.lane - d.lane) <= 1 && grounded(e) && !isStructure(e) && !isFlying(e) && !ENEMIES[e.kind]!.boss && onLawn(e)
          && Math.abs(e.x - centre) <= surge.reach && bulk(e) <= maw.cap)
        .sort((a, b) => Math.abs(a.x - centre) + Math.abs(a.lane - d.lane) - (Math.abs(b.x - centre) + Math.abs(b.lane - d.lane)) || a.id - b.id)
        .slice(0, surge.count);
      for (const e of prey) {
        s.events.push({ e: "maw", id: d.id, target: e.id, whole: true, kind: e.kind, lane: e.lane, x: e.x });
        killEnemy(s, e, "devour");
      }
      // ...and she is open again at once.
      d.busyUntil = s.tick;
      return;
    }
    case "overclock":
      // The boiler vents over the 3x3 and the plating is made good.
      s.blasts.push({ id: s.nextId++, kind: "eruption", lane: d.lane, x: centre, at: s.tick, dmg: surge.dmg * p });
      d.hp = d.maxHp;
      return;
    case "stampede":
      releaseAllies(s, d, [d.lane, d.lane - 1, d.lane + 1].filter((lane) => isActiveLane(s, lane)), surge.count);
      return;
    case "iai": {
      s.events.push({ e: "dash", id: d.id, reach: surge.reach });
      for (const e of [...s.enemies]) {
        if (Math.abs(e.lane - d.lane) > 1 || !grounded(e) || isStructure(e) || isFlying(e) || e.x - centre < -0.3 || e.x - centre > surge.reach) continue;
        meleeBlow(s, d, e, surge.dmg * p);
      }
      return;
    }
  }
}

/** Knocks a foe heading for the gate back down the lane (not bosses, the anchored, smashers or anything mid-leap). */
function knockBack(s: GarrisonState, e: Enemy, push: number): void {
  const def = ENEMIES[e.kind]!;
  // (A creature bank's sleepers lie low against shoves as against gales: only a blow wakes them, then they can be thrown.)
  if (e.dead || e.charmed || e.guard || e.dir > 0 || def.boss || def.anchored || def.smash || def.structure || !onLawn(e)) return;
  if (e.state !== "walk" && e.state !== "eat" && e.state !== "cast" && e.state !== "plant" && e.state !== "raise" && e.state !== "idle") return;
  if (e.state === "raise") abortRaise(s, e, true);
  // (Never out of sight, where nothing could shoot it.)
  e.x = Math.max(e.x, Math.min(SIGHT_X - 0.05, e.x + push));
  e.px = e.x;
  if (e.state === "eat" || e.state === "cast" || e.state === "plant") setState(s, e, "walk");
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
    if (def.fireShield && dealt > 0) hurtDefender(s, d, dealt * def.fireShield, { atk: true, fire: true });
    if (e.dead) continue;
    if (m.stun && !def.boss && !def.stunImmune && rand(s) < m.stun.chance) e.stunUntil = s.tick + m.stun.dur;
    if (m.poison) {
      e.poisonDps = e.poisonUntil > s.tick ? Math.max(e.poisonDps, m.poison.dps) : m.poison.dps;
      e.poisonUntil = s.tick + m.poison.dur;
    }
    if (m.chill && canChill(e)) e.chillUntil = s.tick + frost(s, m.chill);
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
  // (Order & Chaos: ruins and a sandstorm cut a straight shot's reach.)
  const reachIn = (lane: number) => (shot.lob || (!s.field && !s.weather) ? shot.range : straightReach(s, lane, centre, shot.range));
  const sees = lanes.some((lane) => firstAhead(s, lane, centre, reachIn(lane), shot.lob === true, skip) !== undefined)
    || (shot.back === true && !shot.lob && foeBehind(s, d.lane, centre, shot.air === true) !== undefined);
  if (!sees) {
    d.cd = 0;
    return;
  }
  s.events.push({ e: "defShoot", id: d.id });
  d.shotAt = s.tick + Math.max(1, Math.round(shot.windup / Math.max(rate, 0.5)));
  // (Order & Chaos: every member of a band adds a shot.)
  d.shotsLeft = 1 + (shot.volley ?? 0) + (s.cfg.oc ? ammoAt(s, d) + (d.members ?? 1) - 1 : 0);
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
  hellfire: 0.3, cacoball: 0.26, baronball: 0.28, plasma: 0.42, rocket: 0.34, bullet: 0.9, soul: 0.22,
  hammer: 0.26, crescent: 0.3, ball: 0.24, kunai: 0.36
};

function newProjectile(s: GarrisonState, init: Partial<Projectile> & Pick<Projectile, "kind" | "side" | "lane" | "x" | "dir" | "dmg">): Projectile {
  return {
    id: s.nextId++, px: init.x, from: init.x, speed: 0, maxX: 10.4, pierce: 1, hit: [], chill: false, freeze: false, burn: false, burnSplash: 0,
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
    // Order & Chaos frost lobs (Great Shaman, Frost Giant): chill all they catch; every Nth freezes its target solid.
    const lobFreeze = shot.freezeEvery !== undefined && d.shots % shot.freezeEvery === 0;
    s.projectiles.push(newProjectile(s, {
      kind: shot.projectile, side: "def", lane: d.lane, x: centre + 0.2, dir: 1, dmg: shot.dmg * fire * crit, shatter: shot.shatter === true, cloud: shot.cloud === true, stun,
      chill: shot.chill === true, freeze: lobFreeze, freezeFor: lobFreeze ? sec(2) : undefined,
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
    // Order & Chaos: incendiary rounds scorch the foes beside the target; wind-arrows knock back; rune-hammers stun; a softball bounces on.
    burnSplash: shot.ignited ? shot.burnSplash ?? 0 : 0,
    push: shot.push, hop: shot.hop, stun: shot.stun ? { chance: 1, dur: shot.stun } : null,
  });
  // Order & Chaos Rearguard: the volley goes behind it when that is where the foes are.
  const behind = shot.back === true && foeBehind(s, d.lane, centre, shot.air === true) !== undefined;
  const reachIn = (lane: number) => (!s.field && !s.weather ? shot.range : straightReach(s, lane, centre, shot.range));
  const ahead = !behind || lanes.some((lane) => firstAhead(s, lane, centre, reachIn(lane), false, shot.air ? undefined : isFlying) !== undefined);
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
    let lo = Math.min(x0, p.x);
    let hi = Math.max(x0, p.x);
    // Order & Chaos ruins stop a straight shot: it can still strike a foe on this side of them.
    const wall = s.field ? ruinsCrossed(s, p.lane, x0, p.x) : null;
    if (wall !== null) {
      if (p.dir > 0) hi = wall;
      else lo = wall;
    }
    for (const d of s.defenders) {
      if (d.dead || d.lane !== p.lane || !DEFENDERS[d.kind]!.ignite || p.passed.includes(d.id) || !auraActive(s, d)) continue;
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
    if (wall !== null) {
      p.dead = true;
      s.events.push({ e: "shotBlocked", lane: p.lane, x: wall });
      continue;
    }
    // Order & Chaos sandstorm: a straight shot drops once it has flown FIELD.sandRange.
    if (s.weather?.kind === "sandstorm" && p.from !== undefined && Math.abs(p.x - p.from) > FIELD.sandRange && !(p.boomerang?.back)) {
      if (!turnBoomerang(p)) p.dead = true;
      continue;
    }
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
  const flames = p.burn && !def.fireImmune ? p.dmg * fireMult(s) : 0;
  dmg += flames;
  const fire = p.burn || FIRE_SHOTS.has(p.kind);
  const hitX = e.x;
  // A torpedo runs beneath the shield (it soaks none of it). (A shot set alight is fire only in its flames; a fireball is all fire.)
  const dealt = hurtEnemy(s, e, dmg, { straight: !p.underShield, fromDir: p.dir, fire, firePart: FIRE_SHOTS.has(p.kind) ? undefined : flames });
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
    if (p.chill) e.chillUntil = s.tick + frost(s, sec(10));
    if (p.freeze) e.freezeUntil = s.tick + frost(s, sec(2));
  }
  // Order & Chaos: a rune-hammer stuns what it smashes (a shield takes it); a wind-arrow knocks its foe back.
  if (p.stun && !e.dead && e.shield <= 0 && canSlow(e) && !def.stunImmune) e.stunUntil = Math.max(e.stunUntil, s.tick + p.stun.dur);
  if (p.push && !e.dead) knockBack(s, e, p.push);
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
    if (s.field && FIRE_SHOTS.has(p.kind)) fireOnTiles(s, p.lane, lob.col + 0.5, false);
    for (const d of s.defenders) {
      if (d.dead || isFlat(d)) continue;
      const inArea = lob.area ? Math.abs(d.lane - p.lane) <= 1 && Math.abs(d.col - lob.col) <= 1 : d.lane === p.lane && d.col === lob.col;
      if (!inArea) continue;
      // ...and the troops under a dome beside the blast are spared.
      if (lob.area && aegisOver(s, d.lane, d.col)) continue;
      hurtDefender(s, d, p.dmg, { atk: true, cloud: p.cloud, magic: p.cloud, fire: FIRE_SHOTS.has(p.kind) });
      // Order & Chaos hexes and webs.
      if (d.dead) continue;
      const steadfast = DEFENDERS[d.kind]!.steadfast === true;
      if (p.curse > 0 && !steadfast) d.cursedUntil = Math.max(d.cursedUntil, s.tick + p.curse);
      if (p.stun && rand(s) < p.stun.chance && !steadfast) {
        d.stunnedUntil = s.tick + stunFor(s, p.stun.dur);
        s.events.push({ e: "defStun", id: d.id });
      }
    }
    return;
  }
  // Order & Chaos Psychic Watcher: a lob coming down on its dome (or near it) bounces off.
  const dome = s.cfg.oc ? parasolOver(s, p.lane, p.x) : undefined;
  if (dome) {
    s.events.push({ e: "parasol", id: dome.id, lane: p.lane, x: p.x });
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
    // Order & Chaos frost lobs: the target is chilled (and now and then frozen solid).
    if (!target.dead && canChill(target)) {
      if (p.chill) target.chillUntil = Math.max(target.chillUntil, s.tick + frost(s, sec(10)));
      if (p.freeze) target.freezeUntil = Math.max(target.freezeUntil, s.tick + frost(s, p.freezeFor ?? sec(2)));
    }
  }
  if (lob.splash > 0) {
    for (const e of [...s.enemies]) {
      if (e === target || e.dead || e.charmed || isStructure(e) || isFlying(e) || e.state === "burrow" || e.state === "teleport" || Math.abs(e.lane - p.lane) > 1) continue;
      if (Math.abs(e.x - p.x) > 1) continue;
      if (p.cloud && cloudImmune(e)) holdUndead(s, e);
      else hurtEnemy(s, e, lob.splash, { fire });
      // ...and a frost lob chills every foe it splashes.
      if (p.chill && !e.dead && canChill(e)) e.chillUntil = Math.max(e.chillUntil, s.tick + frost(s, sec(10)));
    }
  }
}

/** Order & Chaos Psychic Watcher: the watcher whose dome covers this spot (its lane and both beside it, within reach), if any. */
function parasolOver(s: GarrisonState, lane: number, x: number): Enemy | undefined {
  for (const e of s.enemies) {
    const parasol = ENEMIES[e.kind]!.parasol;
    if (!parasol || e.dead || e.charmed || !onLawn(e) || e.state === "burrow" || e.state === "teleport") continue;
    if (Math.abs(e.lane - lane) <= parasol.reach && Math.abs(e.x - x) <= parasol.reach + 0.5) return e;
  }
  return undefined;
}

/** How long a Chaos stun, web, stone gaze or ice holds a troop (Order & Chaos Pendant of Second Sight: half as long). */
function stunFor(s: GarrisonState, ticks: number): number {
  return s.cfg.oc && has(s, "pendant-second-sight") ? Math.round(ticks / 2) : ticks;
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
  // Order & Chaos ruins stop the horde's straight shots too.
  const wall = s.field ? ruinsCrossed(s, p.lane, x0 + 0.2, p.x - 0.3) : null;
  if (wall !== null && (!hit || hit.col + 0.5 < wall)) {
    p.dead = true;
    s.events.push({ e: "shotBlocked", lane: p.lane, x: wall });
    return;
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
        hurtDefender(s, d, p.dmg * 0.5, { atk: true, fire: FIRE_SHOTS.has(p.kind) });
      }
    }
    hurtDefender(s, hit, p.dmg, { atk: true, fire: FIRE_SHOTS.has(p.kind) });
    const steadfast = DEFENDERS[hit.kind]!.steadfast === true;
    if (!hit.dead && p.stun && rand(s) < p.stun.chance && !steadfast) {
      hit.stunnedUntil = s.tick + stunFor(s, p.stun.dur);
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
  // Order & Chaos battlefield: a blizzard, wading through water, crawling through brambles.
  if (s.field || s.weather) rate *= fieldPace(s, e);
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
  const holdout = fieldMustClear(s);
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
    if (def.boss && !def.warboss) continue;
    if (e.kind === "tent") {
      e.cd -= 1;
      if (e.cd <= 0) {
        s.atk.might += TENT_INCOME.value;
        s.events.push({ e: "income", side: "atk", value: TENT_INCOME.value });
        e.cd = TENT_INCOME.every;
      }
      continue;
    }
    if (def.structure) {
      // Order & Chaos: a crypt lets the dead out now and then.
      if (def.crypt) cryptAct(s, e);
      continue;
    }
    // Order & Chaos: a Harpy Snatcher hovering over her prey.
    if (def.snatch && !e.charmed && snatchAct(s, e)) continue;
    if (second) {
      if (def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + def.regen);
      if (e.poisonUntil > s.tick) {
        hurtEnemy(s, e, e.poisonDps);
        if (e.dead) continue;
      }
      // Order & Chaos brambles cut whatever crawls through them.
      if (s.field && footed(e) && e.x >= 0 && e.x < GW_COLS && tileCode(s, e.lane, Math.floor(e.x)) === TILE.bramble) {
        hurtEnemy(s, e, FIELD.brambleDps);
        if (e.dead) continue;
      }
    }
    const rate = enemyRate(s, e, auraMap.get(e.id) ?? 0) * (def.warboss ? bossPace(e, def.warboss) : 1);
    // Order & Chaos world boss: its telegraphed moves (it stands while it winds one up).
    if (def.warboss && warbossAct(s, e, rate)) continue;

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
      && ((flee.loot !== undefined && e.loot >= flee.loot) || (flee.below !== undefined && e.hp < e.maxHp * flee.below)
        // (A Treasure Kobold turns back halfway, or as soon as something blocks it.)
        || (flee.at !== undefined && (e.x <= flee.at || e.state === "eat")))) {
      e.fleeing = true;
      e.dir = 1;
      setState(s, e, "walk");
      s.events.push({ e: "flee", id: e.id });
    }
    if (e.fleeing) {
      fleeAct(s, e, rate);
      continue;
    }
    // Order & Chaos: a thief walking past a treasure chest pockets it.
    if (def.steal && s.cfg.oc && e.state === "walk" && rate > 0) lootChest(s, e);

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
    // Order & Chaos Nightmare: its whinny puts the troop ahead to sleep.
    if (def.lull && rate > 0 && e.x <= SIGHT_X - 0.2 && (e.state === "walk" || e.state === "eat")) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) e.cd2 = lullAct(s, e) ? def.lull.every : sec(0.5);
    }
    // --- Order & Chaos content pass ---
    // Fire Messenger: frost, rain or standing water puts its fire out for good.
    if (def.torch && !e.doused && (e.chillUntil > s.tick || e.freezeUntil > s.tick || (s.weather !== undefined && wetWeather(s)) || (s.field !== undefined && inWater(s, e)))) {
      e.doused = true;
      s.events.push({ e: "douse", id: e.id });
    }
    // Tentacle Eater: drags a troop in; Warlord: knights an ally; Frostcaller: seals a troop in ice; Kitsune: blink-strikes the back line.
    if (def.grab && rate > 0 && e.x <= SIGHT_X - 0.2 && (e.state === "walk" || e.state === "eat")) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) e.cd2 = grabAct(s, e) ? def.grab.every : sec(0.5);
    }
    if (def.knight && rate > 0 && e.x <= SIGHT_X) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) e.cd2 = knightAct(s, e) ? def.knight.every : sec(1);
    }
    if (def.frostbite && rate > 0 && e.x <= SIGHT_X - 0.2 && (e.state === "walk" || e.state === "eat")) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) e.cd2 = frostbiteAct(s, e) ? def.frostbite.every : sec(0.5);
    }
    if (def.assassin && rate > 0 && e.x <= SIGHT_X - 0.2 && (e.state === "walk" || e.state === "eat")) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) e.cd2 = assassinAct(s, e) ? def.assassin.every : sec(0.5);
    }

    if (def.heal && rate > 0) {
      e.cd2 -= rate;
      if (e.cd2 <= 0) {
        let target: Enemy | undefined;
        for (const other of s.enemies) {
          // (Never a charmed foe or an Order ally such as Rin's cats: they fight for the other side.)
          if (other.dead || other.charmed || isStructure(other) || ENEMIES[other.kind]!.boss) continue;
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
      // Order & Chaos Stormbird Carrier: drops its passenger behind the front line, then flies off the field.
      if (def.carry) {
        if (e.carrying && e.dir < 0 && e.x <= def.carry.dropX) {
          dropPassenger(s, e);
          e.dir = 1;
        } else if (!e.carrying && e.dir > 0 && e.x >= SPAWN_X) {
          e.dead = true;
          s.events.push({ e: "escape", id: e.id, lane: e.lane, x: e.x, loot: 0 });
          continue;
        }
        if (!e.carrying) continue;
      }
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
    // (Forgetfulness: a ranged foe that has forgotten how to shoot walks in and bites instead.)
    if (def.ranged && !def.siege && !(def.poison && def.bite > 0 && blocker(s, e)) && !((e.forgetUntil ?? 0) > s.tick)) {
      // Order & Chaos stall-breaker: a shooter holding its ground while the battle waits on it runs out of ammunition.
      if (holdout && rate > 0 && e.state === "cast" && e.dir < 0 && !e.charmed && !e.unnerved) {
        e.standoff = (e.standoff ?? 0) + 1;
        if (e.standoff >= STANDOFF_NERVE) loseNerve(s, e);
      }
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
    // Order & Chaos Sledge Wolves: they race across ice.
    const sliding = def.slide !== undefined && s.field !== undefined && e.x >= 0 && e.x < GW_COLS && icedAt(s, e.lane, Math.floor(e.x));
    const speed = sliding ? def.slide!.speed : (def.vault && bounding ? def.vault.fastSpeed : def.speed) * (def.lastGasp && e.reborn ? 0.6 : 1);
    e.x += speed * rate * e.dir;
    if (e.dir > 0 && e.x >= 8.8) e.dir = -1;
    if (def.zigzag && rate > 0) zigzagStep(s, e, speed * rate);
    reachGate(s, e);
  }
}

// ---------------------------------------------------------------------------
// Order & Chaos world bosses: a giant that leads a level's last assault. It walks and
// bites like any foe; between bites it winds up a move, marking the tiles it will
// strike `warn` ticks ahead (it stands while it does, so the player can read it and
// move, shield or kill what is marked). Its phases (at falling health shares) bring
// new moves and a quicker pace. A lane's Champion strikes it hard and throws it back.

/** The share of its wave's usual strength that marches with a world boss. */
const BOSS_ESCORT = 0.6;
/** What a lane's Champion does to a world boss: this share of its health, and this far back. */
export const CHAMPION_BOSS_SHARE = 0.15;
const CHAMPION_BOSS_PUSH = 2.5;

function bossPace(e: Enemy, wb: WarbossDef): number {
  return wb.pace[Math.min(e.bossPhase ?? 0, wb.pace.length - 1)] ?? 1;
}

function championStrikesBoss(s: GarrisonState, c: Charger, e: Enemy): void {
  const hits = (c.hits ??= []);
  if (hits.includes(e.id)) return;
  hits.push(e.id);
  s.events.push({ e: "bossRepel", id: e.id, lane: c.lane });
  hurtEnemy(s, e, Math.round(e.maxHp * CHAMPION_BOSS_SHARE), { melee: true });
  if (e.dead) return;
  e.x = e.px = Math.min(SPAWN_X - 0.3, e.x + CHAMPION_BOSS_PUSH);
  e.cue = undefined;
  setState(s, e, "walk");
}

/** Marks a lawn tile of an active lane (once). */
function markTile(s: GarrisonState, marks: BossMark[], lane: number, col: number): void {
  if (!isActiveLane(s, lane) || col < 0 || col >= GW_COLS) return;
  if (!marks.some((m) => m.lane === lane && m.col === col)) marks.push({ lane, col });
}

function standingTroopAt(s: GarrisonState, m: BossMark): Defender | undefined {
  return s.defenders.find((d) => !d.dead && !isFlat(d) && d.lane === m.lane && d.col === m.col);
}

/** Runs the boss's phases and moves. True while it is busy winding up or landing a move (it neither walks nor bites then). */
function warbossAct(s: GarrisonState, e: Enemy, rate: number): boolean {
  const wb = ENEMIES[e.kind]!.warboss!;
  const share = e.hp / e.maxHp;
  let phase = 0;
  for (const at of wb.phases) if (share <= at) phase += 1;
  if (phase > (e.bossPhase ?? 0)) {
    e.bossPhase = phase;
    s.events.push({ e: "bossPhase", id: e.id, phase });
    // A new phase: its next move comes at once.
    if (!e.cue) e.cd2 = Math.min(e.cd2, sec(1));
  }
  if (e.cue) {
    e.cue.left -= rate;
    if (e.cue.left > 0) {
      if (e.state !== "cast") setState(s, e, "cast");
      return true;
    }
    const cue = e.cue;
    e.cue = undefined;
    e.cd2 = wb.every[Math.min(phase, wb.every.length - 1)]!;
    setState(s, e, "walk");
    landBossMove(s, e, wb.moves[cue.move]!, cue);
    return true;
  }
  // It only acts on the lawn, marching (not while gliding into another lane).
  if (rate <= 0 || e.x > SIGHT_X || e.dir > 0 || e.state === "glide") return false;
  e.cd2 -= rate;
  if (e.cd2 > 0) {
    // At its line it stands its ground (and bites only what stands in front of it).
    if (wb.hold !== undefined && e.x <= wb.hold && !blocker(s, e)) {
      if (e.state !== "idle") setState(s, e, "idle");
      return true;
    }
    return false;
  }
  const ready: BossCue[] = [];
  wb.moves.forEach((move, index) => {
    if ((move.from ?? 0) > phase) return;
    const cue = planBossMove(s, e, move, index, wb.warn);
    if (cue) ready.push(cue);
  });
  if (ready.length === 0) {
    e.cd2 = sec(1);
    return false;
  }
  // Not the same move twice running when it has another.
  const fresh = ready.length > 1 ? ready.filter((cue) => cue.move !== e.lastMove) : ready;
  const cue = fresh[randInt(s, 0, fresh.length - 1)]!;
  e.cue = cue;
  e.lastMove = cue.move;
  setState(s, e, "cast");
  s.events.push({ e: "bossCue", id: e.id, move: wb.moves[cue.move]!.kind, index: cue.move, marks: cue.marks.map((m) => ({ ...m })) });
  return true;
}

/** The move as it would go now (marked tiles and target), or null when it has nothing to strike. */
function planBossMove(s: GarrisonState, e: Enemy, move: WarbossMove, index: number, warn: number): BossCue | null {
  const marks: BossMark[] = [];
  const cue: BossCue = { move: index, left: warn, marks };
  const gapTo = (d: Defender) => e.x - (d.col + 0.5);
  switch (move.kind) {
    case "slam": {
      let target: Defender | undefined;
      for (const d of s.defenders) {
        if (d.dead || isFlat(d) || d.lane !== e.lane || gapTo(d) < -0.3 || gapTo(d) > move.reach) continue;
        if (!target || d.col > target.col) target = d;
      }
      if (!target) return null;
      for (let dl = -1; dl <= 1; dl += 1) for (let dc = -1; dc <= 1; dc += 1) markTile(s, marks, target.lane + dl, target.col + dc);
      return cue;
    }
    case "breath": {
      const front = Math.min(GW_COLS - 1, Math.floor(e.x - 0.35));
      for (const lane of move.wide ? [e.lane - 1, e.lane, e.lane + 1] : [e.lane]) {
        for (let col = front; col > front - move.len && col >= 0; col -= 1) markTile(s, marks, lane, col);
      }
      return marks.some((m) => standingTroopAt(s, m)) ? cue : null;
    }
    case "volley": {
      const picks = s.defenders.filter((d) => !d.dead && !isFlat(d) && !DEFENDERS[d.kind]!.veiled)
        .sort((a, b) => ocTroopValue(b.kind) - ocTroopValue(a.kind) || a.col - b.col || a.lane - b.lane || a.id - b.id);
      for (const d of picks.slice(0, move.count)) markTile(s, marks, d.lane, d.col);
      return marks.length ? cue : null;
    }
    case "summon": {
      const lanes = s.cfg.lanes.filter((lane) => !s.atk.raided.includes(lane));
      if (!ENEMIES[move.foe] || lanes.length === 0) return null;
      cue.lanes = [];
      for (let i = 0; i < move.count; i += 1) {
        const lane = lanes[randInt(s, 0, lanes.length - 1)]!;
        cue.lanes.push(lane);
        markTile(s, marks, lane, GW_COLS - 1);
      }
      return cue;
    }
    case "graves": {
      const open: BossMark[] = [];
      for (const lane of s.cfg.lanes) {
        for (let col = 3; col <= 7; col += 1) {
          if (defenderAt(s, lane, col) || (s.field && tileCode(s, lane, col) !== 0)) continue;
          if (s.enemies.some((o) => !o.dead && isStructure(o) && o.lane === lane && Math.floor(o.x) === col)) continue;
          open.push({ lane, col });
        }
      }
      for (let i = 0; i < move.count && open.length > 0; i += 1) marks.push(open.splice(randInt(s, 0, open.length - 1), 1)[0]!);
      return marks.length ? cue : null;
    }
    case "drums":
      return s.atk.hasteUntil > s.tick ? null : cue;
    case "stride": {
      const lanes = s.cfg.lanes.filter((lane) => lane !== e.lane && Math.abs(lane - e.lane) <= 2 && !s.atk.raided.includes(lane)
        && !s.defenders.some((d) => !d.dead && !isFlat(d) && d.lane === lane && Math.abs(d.col + 0.5 - e.x) < 0.8));
      if (lanes.length === 0) return null;
      cue.lane = lanes[randInt(s, 0, lanes.length - 1)]!;
      markTile(s, marks, cue.lane, Math.min(GW_COLS - 1, Math.floor(e.x)));
      return cue;
    }
    case "pounce": {
      // Over its wall onto the troop farthest back within reach.
      let target: Defender | undefined;
      for (const d of s.defenders) {
        if (d.dead || isFlat(d) || d.lane !== e.lane || gapTo(d) < 1.2 || gapTo(d) > move.reach) continue;
        if (!target || d.col < target.col) target = d;
      }
      if (!target) return null;
      cue.target = target.id;
      markTile(s, marks, target.lane, target.col);
      return cue;
    }
    case "roar": {
      for (const d of s.defenders) {
        if (d.dead || isFlat(d) || Math.abs(d.lane - e.lane) > 1 || Math.abs(d.col + 0.5 - e.x) > move.reach) continue;
        markTile(s, marks, d.lane, d.col);
      }
      return marks.length ? cue : null;
    }
  }
}

function stunTroop(s: GarrisonState, d: Defender, ticks: number): void {
  if (d.dead || ticks <= 0) return;
  d.stunnedUntil = Math.max(d.stunnedUntil, s.tick + stunFor(s, ticks));
  s.events.push({ e: "defStun", id: d.id });
}

/** The blow lands on what is on the marked tiles now (a troop moved or sold in time is spared). */
function landBossMove(s: GarrisonState, e: Enemy, move: WarbossMove, cue: BossCue): void {
  reveal(s, e);
  s.events.push({ e: "bossMove", id: e.id, move: move.kind, index: cue.move, marks: cue.marks, lane: e.lane, x: e.x });
  switch (move.kind) {
    case "slam":
      for (const m of cue.marks) {
        const d = standingTroopAt(s, m);
        if (!d) continue;
        hurtDefender(s, d, move.dmg, { atk: true });
        stunTroop(s, d, move.stun);
      }
      return;
    case "breath": {
      let dealt = 0;
      for (const m of cue.marks) {
        const d = standingTroopAt(s, m);
        if (!d) continue;
        const before = Math.max(0, d.hp) + d.shell;
        hurtDefender(s, d, move.dmg, { atk: true, magic: true, fire: move.fire === true });
        dealt += Math.max(0, before - Math.max(0, d.hp) - d.shell);
        if (!d.dead && move.freeze) {
          s.events.push({ e: "encase", id: e.id, target: d.id });
          if (warmAt(s, d)) {
            s.events.push({ e: "thaw", id: d.id });
          } else {
            d.iceUntil = s.tick + stunFor(s, move.freeze);
            d.shotAt = -1;
            d.shotsLeft = 0;
          }
        }
      }
      if (move.drain && dealt > 0) e.hp = Math.min(e.maxHp, e.hp + Math.round(dealt * move.drain));
      return;
    }
    case "volley":
      for (const m of cue.marks) {
        const d = standingTroopAt(s, m);
        if (!d) continue;
        // Bolts and boulders come down from above: an Aegis dome turns them aside.
        const dome = aegisOver(s, d.lane, d.col);
        if (dome) {
          s.events.push({ e: "aegis", id: dome.id, lane: d.lane, x: d.col + 0.5, kind: "sky" });
          continue;
        }
        hurtDefender(s, d, move.dmg, { atk: true });
        if (move.stun) stunTroop(s, d, move.stun);
      }
      return;
    case "summon":
      for (const lane of cue.lanes ?? []) {
        if (!isActiveLane(s, lane) || s.atk.raided.includes(lane)) continue;
        const called = spawnEnemy(s, move.foe, lane, SPAWN_X - 0.1 + rand(s) * 0.4, "wave", e.wave);
        s.events.push({ e: "enemyRise", id: called.id });
      }
      return;
    case "graves":
      for (const m of cue.marks) {
        if (defenderAt(s, m.lane, m.col) || !ENEMIES["oc-grave"]) continue;
        if (s.enemies.some((o) => !o.dead && isStructure(o) && o.lane === m.lane && Math.floor(o.x) === m.col)) continue;
        const grave = spawnEnemy(s, "oc-grave", m.lane, m.col + 0.5, "wave", e.wave);
        s.events.push({ e: "enemyRise", id: grave.id });
      }
      return;
    case "drums":
      s.atk.hasteUntil = Math.max(s.atk.hasteUntil, s.tick + move.dur);
      return;
    case "stride": {
      const lane = cue.lane;
      if (lane === undefined || !isActiveLane(s, lane) || s.atk.raided.includes(lane)) return;
      if (s.defenders.some((d) => !d.dead && !isFlat(d) && d.lane === lane && Math.abs(d.col + 0.5 - e.x) < 0.8)) return;
      e.from = e.lane;
      e.to = lane;
      e.lane = lane;
      setState(s, e, "glide", sec(0.6));
      return;
    }
    case "pounce": {
      const d = s.defenders.find((unit) => unit.id === cue.target && !unit.dead);
      if (!d || d.lane !== e.lane || d.col + 0.5 > e.x) return;
      hurtDefender(s, d, move.dmg, { atk: true });
      e.x = e.px = d.col + (d.dead ? 0.6 : 1.05);
      return;
    }
    case "roar":
      for (const m of cue.marks) {
        const d = standingTroopAt(s, m);
        if (d) stunTroop(s, d, move.stun);
      }
      return;
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
  // Order & Chaos Frost Mammoth: a trail of ice (nothing is planted there until it melts).
  const ice = def.roller!.ice;
  if (ice && s.cfg.oc && e.x <= SIGHT_X && e.x >= 0) markIce(s, e.lane, Math.min(GW_COLS - 1, Math.floor(e.x)), s.tick + ice);
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
  d.stunnedUntil = Math.max(d.stunnedUntil, s.tick + stunFor(s, shove.dur));
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
  hurtDefender(s, target, sky.dmg, { atk: true, magic: sky.kind !== "dive", fire: sky.kind === "breath" });
  if (!target.dead && sky.poison) {
    target.poisonDps = target.poisonUntil > s.tick ? Math.max(target.poisonDps, sky.poison.dps) : sky.poison.dps;
    target.poisonUntil = s.tick + sky.poison.dur;
  }
  if (sky.kind === "breath") {
    const ahead = defenderAt(s, e.lane, col + (e.dir < 0 ? -1 : 1));
    if (ahead && !isFlat(ahead) && !aegisOver(s, ahead.lane, ahead.col)) hurtDefender(s, ahead, sky.dmg, { atk: true, magic: true, fire: true });
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
    if (d.dead || isFlat(d) || d.invulnUntil > s.tick || claimed.has(d.id) || s.protectIds.includes(d.id) || !isActiveLane(s, d.lane) || DEFENDERS[d.kind]!.landmark) continue;
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
      // (Order & Chaos: not in water, ruins or brambles, nor where a crypt, chest or bank stands.)
      const code = tileCode(s, lane, col);
      if (!defenderAt(s, lane, col) && !tentAt(s, lane, col) && !lawnStructureAt(s, lane, col) && (code === 0 || code === TILE.clover) && !icedAt(s, lane, col) && !craterAt(s, lane, col)) spots.push([lane, col]);
    }
  }
  if (spots.length === 0) return;
  const [lane, col] = spots[randInt(s, 0, spots.length - 1)]!;
  spawnEnemy(s, "oc-grave", lane, col + 0.5, "wave", 0);
  s.events.push({ e: "enemyCast", id: e.id });
}

// ---------------------------------------------------------------------------
// Order & Chaos content pass: the new foes' tricks

/** Tentacle Eater: drags the nearest troop 1.2 to `range` tiles ahead in its lane a tile toward itself (when that tile is free). */
function grabAct(s: GarrisonState, e: Enemy): boolean {
  const grab = ENEMIES[e.kind]!.grab!;
  let target: Defender | undefined;
  let best = Number.MAX_VALUE;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== e.lane || isFlat(d) || d.invulnUntil > s.tick || s.protectIds.includes(d.id)) continue;
    const dd = DEFENDERS[d.kind]!;
    if (dd.tall || dd.steadfast || dd.landmark || dd.veiled) continue;
    const gap = (e.x - (d.col + 0.5)) * -e.dir;
    if (gap < 1.2 || gap > grab.range || gap >= best) continue;
    if (!canSummonAt(s, d.lane, d.col + (e.dir < 0 ? 1 : -1))) continue;
    target = d;
    best = gap;
  }
  if (!target) return false;
  const from = target.col;
  target.col = from + (e.dir < 0 ? 1 : -1);
  target.stunnedUntil = Math.max(target.stunnedUntil, s.tick + stunFor(s, grab.stun));
  target.shotAt = -1;
  target.shotsLeft = 0;
  reveal(s, e);
  s.events.push({ e: "grab", id: e.id, target: target.id, from, to: target.col, lane: target.lane });
  return true;
}

/** Warlord: knights the nearest unarmoured Chaos walker within reach (its lane and both beside it) with a suit of plate. */
function knightAct(s: GarrisonState, e: Enemy): boolean {
  const knight = ENEMIES[e.kind]!.knight!;
  let target: Enemy | undefined;
  let best = Number.MAX_VALUE;
  for (const o of s.enemies) {
    if (o === e || o.dead || o.charmed || o.armor > 0 || !onLawn(o) || Math.abs(o.lane - e.lane) > 1 || Math.abs(o.x - e.x) > knight.range) continue;
    if (o.state === "burrow" || o.state === "teleport" || o.state === "phase") continue;
    const od = ENEMIES[o.kind]!;
    if (od.structure || od.boss || od.flying || od.ally || od.knight) continue;
    const dist = Math.abs(o.x - e.x) + Math.abs(o.lane - e.lane);
    if (dist >= best) continue;
    target = o;
    best = dist;
  }
  if (!target) return false;
  target.armor = knight.armor;
  target.maxArmor = Math.max(target.maxArmor, knight.armor);
  s.events.push({ e: "knight", id: e.id, target: target.id });
  return true;
}

/** Order & Chaos: a fire troop (a burning aura, flames that set shots alight, a smouldering wall) stands in this troop's 3x3. */
function warmAt(s: GarrisonState, d: Defender): boolean {
  for (const o of s.defenders) {
    if (o.dead || Math.abs(o.lane - d.lane) > 1 || Math.abs(o.col - d.col) > 1 || !auraActive(s, o)) continue;
    const od = DEFENDERS[o.kind]!;
    if (od.burnAura || od.ignite || od.flame || od.warm) return true;
  }
  return false;
}

function thaw(s: GarrisonState, d: Defender): void {
  d.iceUntil = 0;
  s.events.push({ e: "thaw", id: d.id });
}

/** Jotunn Frostcaller: seals the nearest troop ahead in its lane in ice (a troop kept warm by fire just steams). */
function frostbiteAct(s: GarrisonState, e: Enemy): boolean {
  const fb = ENEMIES[e.kind]!.frostbite!;
  let target: Defender | undefined;
  let best = Number.MAX_VALUE;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== e.lane || isFlat(d) || d.invulnUntil > s.tick || (d.iceUntil ?? 0) > s.tick) continue;
    const dd = DEFENDERS[d.kind]!;
    if (dd.steadfast || dd.landmark || dd.veiled || dd.instant) continue;
    const gap = (e.x - (d.col + 0.5)) * -e.dir;
    if (gap < -0.3 || gap > fb.range || gap >= best) continue;
    target = d;
    best = gap;
  }
  if (!target) return false;
  reveal(s, e);
  s.events.push({ e: "encase", id: e.id, target: target.id });
  if (warmAt(s, target)) {
    s.events.push({ e: "thaw", id: target.id });
    return true;
  }
  target.iceUntil = s.tick + stunFor(s, fb.dur);
  target.shotAt = -1;
  target.shotsLeft = 0;
  return true;
}

/** Kitsune Assassin: blinks to the rearmost troop within reach ahead in its lane, cuts it and is back where it stood. */
function assassinAct(s: GarrisonState, e: Enemy): boolean {
  const assassin = ENEMIES[e.kind]!.assassin!;
  let target: Defender | undefined;
  let rear = -1;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== e.lane || isFlat(d) || d.invulnUntil > s.tick || DEFENDERS[d.kind]!.veiled) continue;
    const gap = (e.x - (d.col + 0.5)) * -e.dir;
    if (gap < 0.3 || gap > assassin.reach || gap <= rear) continue;
    target = d;
    rear = gap;
  }
  if (!target) return false;
  reveal(s, e);
  s.events.push({ e: "assassinate", id: e.id, target: target.id, lane: target.lane, col: target.col });
  hurtDefender(s, target, assassin.dmg, { atk: true });
  return true;
}

/** Stormbird Carrier: its passenger drops onto the lawn where it is. */
function dropPassenger(s: GarrisonState, e: Enemy): void {
  const carry = ENEMIES[e.kind]!.carry!;
  e.carrying = false;
  if (!ENEMIES[carry.kind]) return;
  const x = Math.max(0.4, Math.min(SPAWN_X, e.x));
  const passenger = spawnEnemy(s, carry.kind, e.lane, x, e.side, e.wave);
  passenger.from = x;
  passenger.to = x;
  setState(s, passenger, "flung", sec(0.5));
  s.events.push({ e: "drop", id: e.id, passenger: passenger.id });
}

function biteAct(s: GarrisonState, e: Enemy, block: Defender): void {
  const def = ENEMIES[e.kind]!;
  e.bites += 1;
  s.events.push({ e: "enemyBite", id: e.id, target: block.id });
  reveal(s, e);
  if (def.smash) {
    const { lane, col } = block;
    hurtDefender(s, block, 0, { crush: true, atk: true });
    // Order & Chaos Cyberbrute: the blow sends a shockwave through the troops around it.
    if (def.slam && s.cfg.oc) {
      s.events.push({ e: "foeSlam", id: e.id, lane, col });
      for (const d of s.defenders) {
        if (d === block || d.dead || isFlat(d) || Math.abs(d.lane - lane) > 1 || Math.abs(d.col - col) > 1) continue;
        hurtDefender(s, d, def.slam.dmg, { atk: true });
        if (!d.dead && !DEFENDERS[d.kind]!.steadfast) {
          d.stunnedUntil = Math.max(d.stunnedUntil, s.tick + stunFor(s, def.slam.stun));
          s.events.push({ e: "defStun", id: d.id });
        }
      }
    }
    return;
  }
  const blockDef = DEFENDERS[block.kind]!;
  // (A sheep, a sleeper, a troop sealed in ice or a stunned one does nothing but stand there: no trick, thorn or claw
  // answers the bite. Judged as the bite lands, before its own stun.)
  const reacts = canReact(s, block);
  // Order & Chaos Fire Messenger: until its fire is put out, the troop it bites burns to ashes (a tall one, or one
  // warded by a Ring of Sulfur, just takes a heavy burn).
  if (def.torch && !e.doused && s.cfg.oc) {
    if (blockDef.tall || blockDef.landmark || has(s, "ring-of-sulfur")) {
      hurtDefender(s, block, def.torch.tallDmg, { atk: true, fire: true });
    } else if (block.invulnUntil <= s.tick) {
      s.events.push({ e: "incinerate", id: e.id, target: block.id, lane: block.lane, col: block.col });
      hurtDefender(s, block, 0, { crush: true, atk: true, fire: true });
    }
    return;
  }
  // Order & Chaos Nix Warrior: a bash sends the biter reeling back down the lane before it lands its bite.
  const repel = blockDef.repel;
  if (repel && s.cfg.oc && reacts && !e.charmed && block.stacks < repel.charges && !def.boss && !def.anchored && !isFlying(e) && e.dir < 0) {
    const from = e.x;
    knockBack(s, e, repel.push);
    if (e.x !== from) {
      block.stacks += 1;
      if (block.cd2 <= 0) block.cd2 = repel.regrow;
      if (canSlow(e) && !def.stunImmune) e.stunUntil = Math.max(e.stunUntil, s.tick + repel.stun);
      s.events.push({ e: "bash", id: block.id, target: e.id, from, to: e.x, lane: e.lane });
      return;
    }
  }
  // Order & Chaos Iron Maiden: she snaps shut on her biter (a small enough one is gone for good).
  const maw = blockDef.maw;
  if (maw && s.cfg.oc && reacts && !e.charmed && block.busyUntil <= s.tick) {
    const whole = !def.boss && bulk(e) <= maw.cap;
    s.events.push({ e: "maw", id: block.id, target: e.id, whole, kind: e.kind, lane: e.lane, x: e.x });
    if (whole) killEnemy(s, e, "devour");
    else hurtEnemy(s, e, maw.bite, { melee: true });
    block.busyUntil = s.tick + maw.reset;
    return;
  }
  // Order & Chaos Cupi (and the Siren, three times): the biter falls in love and turns on the horde; then she is spent.
  const charm = blockDef.charm;
  if (charm && s.cfg.oc && !def.boss && !e.charmed && block.invulnUntil <= s.tick && reacts) {
    block.stacks += 1;
    if (block.stacks >= (charm.uses ?? 1)) {
      block.dead = true;
      s.events.push({ e: "dismiss", id: block.id });
    }
    charmFoe(s, e, block.id, charm.mult);
    return;
  }
  let dmg = def.bite;
  // (Order & Chaos Forgetfulness: a shooter that forgot how bites instead.)
  if (dmg <= 0 && (e.forgetUntil ?? 0) > s.tick) dmg = 25;
  if (def.deathBlow && e.bites % def.deathBlow === 0) dmg *= 3;
  if (def.joust && e.bites === 1) dmg *= def.joust;
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
  // Order & Chaos Mantis Reaper: every Nth stroke is a whirlwind through every troop in the 3x3 around her.
  if (def.whirl && s.cfg.oc && e.bites % def.whirl.every === 0) {
    const col = Math.floor(e.x);
    s.events.push({ e: "foeWhirl", id: e.id, lane: e.lane, col });
    for (const d of s.defenders) {
      if (d === block || d.dead || isFlat(d) || Math.abs(d.lane - e.lane) > 1 || Math.abs(d.col - col) > 1 || victims.includes(d)) continue;
      victims.push(d);
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
      v.stunnedUntil = s.tick + stunFor(s, def.stun.dur);
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
  if (blockDef.chillBiters && canSlow(e) && reacts) e.slowUntil = Math.max(e.slowUntil, s.tick + blockDef.chillBiters);
  // (Order & Chaos Counterstrike: every troop hits back at its biters for a while.)
  const thorns = (blockDef.thorns ?? 0) + ((s.def.counterUntil ?? 0) > s.tick ? COUNTERSTRIKE_DMG : 0);
  if (thorns > 0 && !e.dead && reacts) hurtEnemy(s, e, thorns * (has(s, "ogres-club") ? 1.5 : 1), { melee: true, fire: DEFENDERS[block.kind]!.ignite !== undefined });
  // Order & Chaos Yeti Warden: its biters are frozen solid.
  if (blockDef.freezeBiters && s.cfg.oc && reacts && !e.dead && canChill(e)) e.freezeUntil = Math.max(e.freezeUntil, s.tick + frost(s, blockDef.freezeBiters));
  // Order & Chaos Royal Griffin: unlimited retaliation — it claws whatever bites it or a troop beside it.
  if (s.cfg.oc && !e.dead) {
    for (const g of s.defenders) {
      const claws = DEFENDERS[g.kind]!.retaliate;
      // (Hexed, asleep, iced or stunned, it claws nothing.)
      if (!claws || g.dead || !(g === block ? reacts : canReact(s, g)) || Math.abs(g.lane - block.lane) > 1 || Math.abs(g.col - block.col) > 1) continue;
      s.events.push({ e: "defStrike", id: g.id, target: e.id });
      hurtEnemy(s, e, claws * (has(s, "ogres-club") ? 1.5 : 1), { melee: true });
      if (e.dead) break;
    }
  }
  // Order & Chaos: rams and trolls knock the defender back; a Nymph bewilders her biter into the next lane.
  if (def.shove && !block.dead && !e.dead && (def.shove.every === 0 ? e.bites === 1 : e.bites % def.shove.every === 0)) shoveDefender(s, e, block);
  if (blockDef.divert && s.cfg.oc && reacts && !e.dead && !e.charmed && !def.boss && !isFlying(e) && e.state === "eat") divertFoe(s, e, blockDef.divert.slow, block.id);
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
    hurtDefender(s, d, keg.dmg, { atk: true, fire: true });
  }
  const x = e.x;
  const lane = e.lane;
  // Order & Chaos: the blast burns the brambles around it away.
  if (s.field) fireOnTiles(s, lane, x, false);
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
  // Order & Chaos: a sandstorm shortens straight shots and gunfire; ruins stop them.
  const straightLine = !r.lob && !r.lightning;
  const range = straightLine ? carry(s, r.range) : r.range;
  const inRange = (d: Defender) => {
    const gap = (e.x - (d.col + 0.5)) * -e.dir;
    return gap >= -0.3 && gap <= range && !(straightLine && s.field && ruinsCrossed(s, e.lane, e.x, d.col + 0.5) !== null);
  };
  // It only stops to shoot once it is on the lawn, where the defenders can see it too.
  const onLawn = e.dir > 0 || e.x <= SIGHT_X - 0.25;
  const pickTarget = (): Defender | undefined => {
    if (!onLawn || e.unnerved) return undefined;
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
        // (Out of ammunition, it fights hand to hand at the pace it used to shoot.)
        e.cd += e.unnerved ? Math.max(sec(1), r.every) : sec(1);
        e.bites += 1;
        s.events.push({ e: "enemyBite", id: e.id, target: block.id });
        hurtDefender(s, block, r.dmg, { atk: true });
      }
      return;
    }
    if (e.state !== "walk") setState(s, e, "walk");
    e.x += ENEMIES[e.kind]!.speed * rate * e.dir * (e.unnerved ? STANDOFF_CHARGE_PACE : 1);
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

/**
 * Order & Chaos stall-breaker. A foe that stops short to shoot can outlast a defence
 * with nothing that reaches it (no shooters, healed walls), and a battle that waits
 * for a clear lawn would then never end. So once the battle is waiting on the field —
 * the last wave is out, or a blessing waits for a clear lawn — a foe that has held its
 * ground to shoot for STANDOFF_NERVE runs out of ammunition and charges (a bit
 * quicker than it walks) to fight hand to hand. Raids have their own rule (raidStalled);
 * duels are two players' own affair.
 */
export const STANDOFF_NERVE = sec(10);
const STANDOFF_CHARGE_PACE = 1.5;

function fieldMustClear(s: GarrisonState): boolean {
  if (!s.cfg.oc || s.cfg.mode === "raid" || s.cfg.mode === "versus" || s.cfg.boss) return false;
  return s.director.done || s.director.blessPending;
}

function loseNerve(s: GarrisonState, e: Enemy): void {
  e.unnerved = true;
  e.shotAt = -1;
  e.shotsLeft = 0;
  setState(s, e, "walk");
  s.events.push({ e: "unnerved", id: e.id, lane: e.lane, x: e.x });
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
    hurtDefender(s, target, r.dmg, { atk: true, magic: r.hitscan === "flame", fire: r.hitscan === "flame" });
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
        if (!e.dead && canChill(e) && (ENEMIES[e.kind]!.magicResist ?? 1) > 0) e.freezeUntil = s.tick + frost(s, sec(5));
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
      for (const d of s.defenders) if (!d.dead && !isFlat(d)) hurtDefender(s, d, 150, { magic: true, fire: true });
      if (s.field) for (const lane of s.cfg.lanes) fireOnTiles(s, lane, 0, true);
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
        shockEnemy(s, target, 350, { spell: true });
      }
      return;
    }
    case "ice-bolt": {
      const target = magicArrowTarget(s, lane, x);
      if (target) {
        hurtEnemy(s, target, 250, { spell: true });
        if (!target.dead && canChill(target) && (ENEMIES[target.kind]!.magicResist ?? 1) > 0) target.freezeUntil = Math.max(target.freezeUntil, s.tick + frost(s, sec(4)));
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
    // Order & Chaos content pass (after the Polish Balance Pack reprints).
    case "dispel":
      for (const e of [...s.enemies]) {
        if (!inArea(e) || isStructure(e) || (ENEMIES[e.kind]!.magicResist ?? 1) <= 0) continue;
        reveal(s, e);
        e.enraged = false;
        e.spinUntil = 0;
        if (e.shield > 0) {
          e.shield = 0;
          s.events.push({ e: "shieldBreak", id: e.id, kind: e.kind, lane: e.lane, x: e.x, dir: e.dir });
        }
        if (e.armor > 0) {
          e.armor = 0;
          s.events.push({ e: "armorBreak", id: e.id, kind: e.kind, lane: e.lane, x: e.x, dir: e.dir });
        }
      }
      return;
    case "forgetfulness":
      for (const e of s.enemies) {
        const edef = ENEMIES[e.kind]!;
        if (e.dead || e.charmed || !edef.ranged || edef.siege || edef.boss || !onLawn(e)) continue;
        e.forgetUntil = s.tick + FORGET_TICKS;
        e.shotAt = -1;
        e.shotsLeft = 0;
        if (e.state === "cast") setState(s, e, "walk");
      }
      return;
    case "slayer": {
      const target = magicArrowTarget(s, lane, x);
      if (!target) return;
      const tdef = ENEMIES[target.kind]!;
      const giant = tdef.boss === true || tdef.smash === true || target.maxHp >= 2400;
      hurtEnemy(s, target, giant ? 2500 : 600, { spell: true });
      return;
    }
    case "counterstrike":
      s.def.counterUntil = s.tick + sec(12);
      return;
  }
}

/** Order & Chaos Counterstrike: what every troop hits back with while it lasts. */
const COUNTERSTRIKE_DMG = 60;
/** Order & Chaos Forgetfulness: how long the horde's shooters forget how to shoot. */
const FORGET_TICKS = sec(10);

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
    // (Order & Chaos Thunder Helmet: a Storm Elemental's lightning strikes half again as hard.)
    const dmg = b.dmg * (fire ? fireMult(s) : 1) * (b.kind === "storm" && s.cfg.oc && has(s, "thunder-helmet") ? 1.5 : 1);
    // Order & Chaos: fire burns the brambles it sweeps over away.
    if (fire && s.field) fireOnTiles(s, b.lane, b.x, b.kind === "fire-wall");
    for (const e of [...s.enemies]) {
      // Charmed foes fight for Order: its blasts spare them.
      if (e.dead || e.charmed || e.state === "teleport" || e.state === "burrow") continue;
      const inside = b.kind === "fire-wall" || b.kind === "storm"
        ? e.lane === b.lane && e.x < 10
        : b.kind === "doom" ? Math.abs(e.lane - b.lane) <= 2 && Math.abs(e.x - b.x) <= 2.5
        : Math.abs(e.lane - b.lane) <= 1 && Math.abs(e.x - b.x) <= 1.5;
      if (!inside) continue;
      hurtEnemy(s, e, dmg, { spell: true, fire });
      if (b.kind === "frost-nova" && !e.dead && canChill(e)) e.freezeUntil = Math.max(e.freezeUntil, s.tick + frost(s, b.freeze ?? sec(5)));
    }
  }
}

function chargersAct(s: GarrisonState): void {
  for (const c of s.chargers) {
    c.px = c.x;
    if (c.state === "ready") {
      const breach = s.enemies.some((e) => !e.dead && e.lane === c.lane && !isStructure(e) && (!ENEMIES[e.kind]!.boss || ENEMIES[e.kind]!.warboss) && e.dir < 0 && e.x < 0.05
        && e.state !== "teleport" && e.state !== "burrow");
      if (breach) {
        c.state = "charging";
        s.events.push({ e: "charger", lane: c.lane });
      }
      continue;
    }
    if (c.state !== "charging") continue;
    // Order & Chaos Rolling Armadillo: wall-nut bowling.
    if (c.bowl) {
      bowlAct(s, c, c.bowl);
      continue;
    }
    c.x += CHARGE_SPEED;
    for (const e of s.enemies) {
      // Order & Chaos: a world boss is struck hard and thrown back, once per charge.
      if (c.dmg === undefined && ENEMIES[e.kind]!.warboss && !e.dead && e.lane === c.lane && Math.abs(e.x - c.x) <= 0.6) {
        championStrikesBoss(s, c, e);
        continue;
      }
      if (e.dead || e.lane !== c.lane || isStructure(e) || (ENEMIES[e.kind]!.boss && !ENEMIES[e.kind]!.warboss) || e.state === "teleport" || e.state === "burrow") continue;
      // A hero's Royal Charge rides past the charmed (they fight for Order); every Champion rides past Order's allies.
      if ((c.dmg !== undefined && e.charmed) || ENEMIES[e.kind]!.ally) continue;
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

/**
 * Order & Chaos Rolling Armadillo: rolls down the lane striking each foe once; with bounces left it
 * glances off the foe it hits into a neighbouring lane (zig-zagging, and off the edge of the lawn).
 */
function bowlAct(s: GarrisonState, c: Charger, b: NonNullable<Charger["bowl"]>): void {
  c.x += b.speed;
  const hits = (c.hits ??= []);
  for (const e of [...s.enemies]) {
    if (e.dead || e.lane !== c.lane || !grounded(e) || isStructure(e) || isFlying(e) || ENEMIES[e.kind]!.boss || hits.includes(e.id)) continue;
    if (Math.abs(e.x - c.x) > 0.5) continue;
    hits.push(e.id);
    s.events.push({ e: "bowl", lane: c.lane, x: e.x });
    hurtEnemy(s, e, c.dmg ?? 0, { melee: true });
    if (b.bounces > 0) {
      let next = c.lane + b.zig;
      if (!isActiveLane(s, next)) next = c.lane - b.zig;
      if (isActiveLane(s, next)) {
        b.fromLane = c.lane;
        b.laneAt = s.tick;
        b.zig = next > c.lane ? -1 : 1;
        c.lane = next;
      }
      b.bounces -= 1;
      break;
    }
  }
  if (c.x > 10.5) c.state = "gone";
}

// ---------------------------------------------------------------------------
// Order & Chaos: the battlefield (order-chaos/field.ts has the rules text and the numbers)

/** Lays out the level's tiles, landmarks, Chaos structures, creature banks and weather (createGarrison). */
function setupField(s: GarrisonState, oc: OcRules): void {
  const lanes = s.cfg.lanes;
  if (oc.tiles?.length) s.field = createFieldState(oc.tiles, lanes);
  for (const spot of oc.landmarks ?? []) {
    if (!lanes.includes(spot.lane) || !DEFENDERS[spot.kind]?.landmark || defenderAt(s, spot.lane, spot.col)) continue;
    addDefender(s, spot.kind, spot.lane, spot.col);
  }
  for (const spot of oc.structures ?? []) {
    if (!lanes.includes(spot.lane) || !ENEMIES[spot.kind]?.structure || defenderAt(s, spot.lane, spot.col) || lawnStructureAt(s, spot.lane, spot.col)) continue;
    const e = spawnEnemy(s, spot.kind, spot.lane, spot.col + 0.5, "wave", 0);
    const crypt = ENEMIES[spot.kind]!.crypt;
    if (crypt) e.cd = crypt.every;
  }
  for (const bank of oc.banks ?? []) {
    if (!lanes.includes(bank.lane) || !ENEMIES[bank.kind]?.bank || defenderAt(s, bank.lane, bank.col) || lawnStructureAt(s, bank.lane, bank.col)) continue;
    const b = spawnEnemy(s, bank.kind, bank.lane, bank.col + 0.5, "wave", 0);
    const spots = guardSpots(s, bank.lane, bank.col);
    bank.guards.forEach((kind, i) => {
      const at = spots[i % spots.length]!;
      if (!ENEMIES[kind] || ENEMIES[kind]!.structure) return;
      // Asleep beside the bank until something wakes them (never a wave of their own).
      const g = spawnEnemy(s, kind, at.lane, at.x + Math.floor(i / spots.length) * 0.35, "wave", 0);
      g.guard = b.id;
      setState(s, g, "idle");
      g.stateUntil = Number.MAX_SAFE_INTEGER;
    });
  }
  if (oc.weather?.length) {
    const step = weatherStepAt(oc.weather, 0);
    s.weather = { kind: step >= 0 ? oc.weather[step]!.kind : "clear", step, since: 0, strikeAt: FIELD.strikeMin, marks: [], clear: [0, 0, 0, 0, 0], lit: 0 };
    s.weather.lit = litLanes(s);
  }
}

/** The lawn state, made on first need (ice and craters can appear on any Order & Chaos lawn). */
function fieldOf(s: GarrisonState): FieldState {
  if (!s.field) s.field = createFieldState(undefined, s.cfg.lanes);
  return s.field;
}

/** Where a bank's sleepers lie: behind it in its lane, then beside it in the lanes next to it. */
function guardSpots(s: GarrisonState, lane: number, col: number): { lane: number; x: number }[] {
  const x = col + 0.5;
  const spots: { lane: number; x: number }[] = [];
  for (const dx of [0.8, 1.45]) if (x + dx <= SIGHT_X - 0.1) spots.push({ lane, x: x + dx });
  for (const l of [lane - 1, lane + 1]) if (isActiveLane(s, l)) spots.push({ lane: l, x: Math.min(SIGHT_X - 0.1, x + 0.35) });
  return spots.length ? spots : [{ lane, x: Math.min(SIGHT_X - 0.1, x + 0.6) }];
}

/** A lawn tile's TILE code (order-chaos/field.ts; 0: plain lawn, or off the lawn). */
export function tileCode(s: GarrisonState, lane: number, col: number): number {
  const f = s.field;
  if (!f || col < 0 || col >= GW_COLS || lane < 0) return 0;
  return f.grid[lane * GW_COLS + col] ?? 0;
}

/** Footing (a Raft, a Crate) laid on this tile. */
export function hasFooting(s: GarrisonState, lane: number, col: number): boolean {
  const f = s.field;
  return f !== undefined && col >= 0 && col < GW_COLS && f.footing[lane * GW_COLS + col] === 1;
}

/** Ice on this tile (a Frost Mammoth's trail, until it melts). */
export function icedAt(s: GarrisonState, lane: number, col: number): boolean {
  const f = s.field;
  return f !== undefined && col >= 0 && col < GW_COLS && (f.ice[lane * GW_COLS + col] ?? 0) > s.tick;
}

/** A crater on this tile (a Magma Elemental's eruption, until it fills in). */
export function craterAt(s: GarrisonState, lane: number, col: number): boolean {
  const f = s.field;
  return f !== undefined && col >= 0 && col < GW_COLS && (f.crater[lane * GW_COLS + col] ?? 0) > s.tick;
}

/** A foe with its feet on the lawn (not flying, burrowed, phasing, leaping, gliding, teleporting or swooping). */
function footed(e: Enemy): boolean {
  return !isFlying(e) && e.state !== "burrow" && e.state !== "teleport" && e.state !== "phase" && e.state !== "vault" && e.state !== "flung"
    && e.state !== "glide" && e.state !== "snatch";
}

/** A foe standing in open water (not on a bridge or a raft). */
export function inWater(s: GarrisonState, e: Enemy): boolean {
  if (!s.field || !footed(e) || e.x < 0 || e.x >= GW_COLS) return false;
  const i = e.lane * GW_COLS + Math.floor(e.x);
  return s.field.grid[i] === TILE.water && s.field.footing[i] !== 1;
}

function swims(e: Enemy): boolean {
  return ENEMIES[e.kind]?.swim === true || SWIMMERS.has(e.kind);
}

/** A swimmer under the water: nothing aims at it until it surfaces (to bite or cast) or leaves the water. */
export function submerged(s: GarrisonState, e: Enemy): boolean {
  return swims(e) && e.state === "walk" && inWater(s, e);
}

/** A troop that stands in open water without a raft. */
function aquatic(kind: DefKind): boolean {
  return DEFENDERS[kind]?.aquatic === true || AQUATIC.has(baseKind(kind));
}

/** Chaos structures that stand on a lawn tile: graves, crypts, treasure chests, creature banks. */
export function isLawnStructure(e: Enemy): boolean {
  const def = ENEMIES[e.kind];
  return def !== undefined && (def.grave !== undefined || def.crypt !== undefined || def.chest !== undefined || def.bank !== undefined);
}

export function lawnStructureAt(s: GarrisonState, lane: number, col: number): Enemy | undefined {
  return s.enemies.find((e) => !e.dead && e.lane === lane && Math.floor(e.x) === col && isLawnStructure(e));
}

/** A tomb a Rooting Boar can eat (a grave or a crypt). */
export function tombAt(s: GarrisonState, lane: number, col: number): Enemy | undefined {
  return s.enemies.find((e) => !e.dead && e.lane === lane && Math.floor(e.x) === col && (ENEMIES[e.kind]!.grave !== undefined || ENEMIES[e.kind]!.crypt !== undefined));
}

/** Why the field keeps a troop (of `kind`, when known) off this tile, or null. */
export function fieldBlocks(s: GarrisonState, lane: number, col: number, kind?: DefKind): string | null {
  const structure = lawnStructureAt(s, lane, col);
  if (structure) {
    const def = ENEMIES[structure.kind]!;
    return def.chest ? "A treasure chest stands there — break it open first." : `${def.grave ? "A grave" : `The ${def.name}`} stands there — destroy it first.`;
  }
  const f = s.field;
  if (!f || col < 0 || col >= GW_COLS) return null;
  const i = lane * GW_COLS + col;
  const code = f.grid[i] ?? 0;
  if (code === TILE.ruins) return "Ruins — nothing can stand there.";
  if (code === TILE.bramble) return "Brambles — burn them away with fire first.";
  if (code === TILE.water && f.footing[i] !== 1 && !(kind !== undefined && aquatic(kind))) return "Open water — lay a Raft first (only swimmers stand in water).";
  if ((code === TILE.roof || code === TILE.ridge) && f.footing[i] !== 1) return "The roof — set a Crate down first.";
  if ((f.ice[i] ?? 0) > s.tick) return "Ice — wait for it to melt, or melt it with fire.";
  if ((f.crater[i] ?? 0) > s.tick) return "A crater — it fills in after a while.";
  return null;
}

function wetWeather(s: GarrisonState): boolean {
  const kind = s.weather?.kind;
  return kind === "rain" || kind === "thunderstorm";
}

/** Fog: a foe past the fog line in a lane nothing lights (nothing aims at it). */
export function fogged(s: GarrisonState, e: Enemy): boolean {
  const w = s.weather;
  if (!w || w.kind !== "fog" || e.x <= FIELD.fogLine || e.charmed || isStructure(e)) return false;
  return (w.lit & (1 << e.lane)) === 0 && (w.clear[e.lane] ?? 0) <= s.tick;
}

/** The lanes lights shine on (Lamplighters, Pillars of Fire): a bit per lane. */
function litLanes(s: GarrisonState): number {
  let bits = 0;
  for (const d of s.defenders) {
    if (d.dead || !DEFENDERS[d.kind]!.light || !auraActive(s, d)) continue;
    for (const lane of [d.lane - 1, d.lane, d.lane + 1]) if (lane >= 0) bits |= 1 << lane;
  }
  return bits;
}

/** A Sylph's gale blows the fog out of these lanes for a while. */
function clearFog(s: GarrisonState, lanes: readonly number[]): void {
  const w = s.weather;
  if (!w || w.kind !== "fog") return;
  for (const lane of lanes) {
    w.clear[lane] = s.tick + FIELD.fogClear;
    s.events.push({ e: "fogClear", lane });
  }
}

/** Blizzard: chills and freezes last longer. */
function frost(s: GarrisonState, ticks: number): number {
  return s.weather?.kind === "blizzard" ? Math.round(ticks * FIELD.blizzardFrost) : ticks;
}

/** Sandstorm: how far a straight shot or gunfire of this range carries. */
function carry(s: GarrisonState, range: number): number {
  return s.weather?.kind === "sandstorm" ? Math.min(range, FIELD.sandRange) : range;
}

/** Order & Chaos: how the field slows a foe (a blizzard, wading through water, brambles). */
function fieldPace(s: GarrisonState, e: Enemy): number {
  let pace = s.weather?.kind === "blizzard" ? FIELD.blizzardFoes : 1;
  const f = s.field;
  if (f && e.x >= 0 && e.x < GW_COLS && footed(e)) {
    const i = e.lane * GW_COLS + Math.floor(e.x);
    const code = f.grid[i];
    if (code === TILE.water && f.footing[i] !== 1 && !swims(e)) pace *= FIELD.wade;
    else if (code === TILE.bramble) pace *= FIELD.bramble;
  }
  return pace;
}

/**
 * The centre of the first shot-stopping tile (ruins, the roof's ridge) a straight
 * shot crosses going from x0 to x1 in a lane (null: none). At most a column or two
 * per call on a projectile step.
 */
function ruinsCrossed(s: GarrisonState, lane: number, x0: number, x1: number): number | null {
  const f = s.field;
  if (!f) return null;
  const row = lane * GW_COLS;
  if (x1 >= x0) {
    for (let col = Math.max(0, Math.floor(x0 - 0.5) + 1); col <= Math.min(GW_COLS - 1, Math.floor(x1 - 0.5)); col += 1) {
      if (stopsShots(f.grid[row + col] ?? 0)) return col + 0.5;
    }
  } else {
    for (let col = Math.min(GW_COLS - 1, Math.ceil(x0 - 0.5) - 1); col >= Math.max(0, Math.ceil(x1 - 0.5)); col -= 1) {
      if (stopsShots(f.grid[row + col] ?? 0)) return col + 0.5;
    }
  }
  return null;
}

/** How far ahead of x a straight shot of `range` can reach in a lane (ruins and ridges stop it, a sandstorm shortens it). */
function straightReach(s: GarrisonState, lane: number, x: number, range: number): number {
  const r = carry(s, range);
  const wall = ruinsCrossed(s, lane, x, x + r);
  return wall === null ? r : Math.max(0, wall - x - 0.25);
}

/** Lightning on a foe; one wading in water jolts every other wader near it (those jolts don't spread again). */
function shockEnemy(s: GarrisonState, e: Enemy, amount: number, hit: EnemyHit = {}): number {
  // Order & Chaos Thunder Helmet: lightning strikes half again as hard.
  if (s.cfg.oc && has(s, "thunder-helmet")) amount *= 1.5;
  const wet = s.field !== undefined && !e.charmed && inWater(s, e);
  const x = e.x;
  const lane = e.lane;
  const dealt = hurtEnemy(s, e, amount, hit);
  if (!wet) return dealt;
  for (const o of [...s.enemies]) {
    if (o === e || o.dead || o.charmed || Math.abs(o.lane - lane) > 1 || Math.abs(o.x - x) > FIELD.conductReach || !inWater(s, o)) continue;
    s.events.push({ e: "zap", lane, x, toLane: o.lane, toX: o.x, tint: "lightning" });
    hurtEnemy(s, o, amount * FIELD.conduct, hit);
  }
  return dealt;
}

/** A Raft on open water or a Crate on the roof: footing a troop can stand on. */
function layFooting(s: GarrisonState, lane: number, col: number): void {
  const f = s.field;
  if (!f || col < 0 || col >= GW_COLS) return;
  const i = lane * GW_COLS + col;
  const code = f.grid[i] ?? 0;
  if (!needsFooting(code) || f.footing[i] === 1) return;
  f.footing[i] = 1;
  f.rev += 1;
  s.events.push({ e: code === TILE.water ? "raft" : "crate", lane, col });
}

/** Fire burns the brambles in its 3x3 (or down its whole lane) away for good, and melts the ice there. */
function fireOnTiles(s: GarrisonState, lane: number, x: number, wholeLane: boolean): void {
  const f = s.field;
  if (!f) return;
  const col = Math.floor(x);
  for (let l = Math.max(0, lane - (wholeLane ? 0 : 1)); l <= Math.min(4, lane + (wholeLane ? 0 : 1)); l += 1) {
    for (let c = wholeLane ? 0 : Math.max(0, col - 1); c <= (wholeLane ? GW_COLS - 1 : Math.min(GW_COLS - 1, col + 1)); c += 1) {
      const i = l * GW_COLS + c;
      if (f.grid[i] === TILE.bramble) {
        f.grid[i] = 0;
        f.rev += 1;
        s.events.push({ e: "burn", lane: l, col: c });
      }
      if ((f.ice[i] ?? 0) > s.tick) {
        f.ice[i] = 0;
        s.events.push({ e: "melt", lane: l, col: c });
      }
    }
  }
}

/** A Frost Mammoth's trail: the tile it rolls over freezes (not water, ruins, brambles, or under a troop still standing). */
function markIce(s: GarrisonState, lane: number, col: number, until: number): void {
  if (col < 0 || col >= GW_COLS) return;
  const f = fieldOf(s);
  const i = lane * GW_COLS + col;
  const code = f.grid[i] ?? 0;
  if (code === TILE.water || code === TILE.ruins || code === TILE.bramble) return;
  const troop = defenderAt(s, lane, col);
  if (troop && !isFlat(troop)) return;
  if ((f.ice[i] ?? 0) <= s.tick) s.events.push({ e: "iced", lane, col });
  f.ice[i] = Math.max(f.ice[i] ?? 0, until);
}

/** A Magma Elemental's eruption leaves a crater on its tile. */
function markCrater(s: GarrisonState, lane: number, col: number): void {
  if (col < 0 || col >= GW_COLS) return;
  fieldOf(s).crater[lane * GW_COLS + col] = s.tick + FIELD.crater;
  s.events.push({ e: "crater", lane, col });
}

/** The weather turns when the wave that brings it comes (spawnWave). */
function advanceWeather(s: GarrisonState, wave: number): void {
  const w = s.weather;
  const steps = s.cfg.oc?.weather;
  if (!w || !steps?.length) return;
  const step = weatherStepAt(steps, wave);
  if (step === w.step) return;
  w.step = step;
  const kind: WeatherKind = step >= 0 ? steps[step]!.kind : "clear";
  if (kind === w.kind) return;
  w.kind = kind;
  w.since = s.tick;
  if (kind === "thunderstorm") w.strikeAt = s.tick + FIELD.strikeMin;
  if (kind === "fog") w.lit = litLanes(s);
  s.events.push({ e: "weather", kind });
}

/** Every tick: which lanes the fog lifts from, and the thunderstorm's strikes (marked, then struck). */
function weatherAct(s: GarrisonState): void {
  const w = s.weather;
  if (!w) return;
  if (w.kind === "fog") w.lit = litLanes(s);
  if (w.kind === "thunderstorm" && s.tick >= w.strikeAt) {
    w.strikeAt = s.tick + randInt(s, FIELD.strikeMin, FIELD.strikeMax);
    markStrike(s, w);
  }
  if (w.marks.length) resolveStrikes(s, w);
}

/** Lightning picks a foe or a troop on the lawn and marks its tile. */
function markStrike(s: GarrisonState, w: WeatherState): void {
  const tiles: { lane: number; col: number }[] = [];
  for (const e of s.enemies) {
    if (e.dead || e.charmed || isStructure(e) || ENEMIES[e.kind]!.boss || e.state === "burrow" || e.state === "teleport" || e.x < 0 || e.x >= GW_COLS) continue;
    tiles.push({ lane: e.lane, col: Math.floor(e.x) });
  }
  for (const d of s.defenders) if (!d.dead && !isFlat(d)) tiles.push({ lane: d.lane, col: d.col });
  if (!tiles.length) return;
  const pick = tiles[randInt(s, 0, tiles.length - 1)]!;
  if (w.marks.some((m) => m.lane === pick.lane && m.col === pick.col)) return;
  w.marks.push({ lane: pick.lane, col: pick.col, at: s.tick + FIELD.strikeWarn });
  s.events.push({ e: "strikeMark", lane: pick.lane, col: pick.col });
}

function resolveStrikes(s: GarrisonState, w: WeatherState): void {
  const due = w.marks.filter((m) => m.at <= s.tick);
  if (!due.length) return;
  w.marks = w.marks.filter((m) => m.at > s.tick);
  for (const m of due) {
    s.events.push({ e: "strike", lane: m.lane, col: m.col });
    for (const e of [...s.enemies]) {
      if (e.dead || e.charmed || e.lane !== m.lane || Math.floor(e.x) !== m.col || isStructure(e) || ENEMIES[e.kind]!.boss || e.state === "burrow" || e.state === "teleport") continue;
      shockEnemy(s, e, FIELD.strikeFoe);
    }
    const d = defenderAt(s, m.lane, m.col);
    if (!d || isFlat(d)) continue;
    const dome = aegisOver(s, m.lane, m.col);
    if (dome) s.events.push({ e: "aegis", id: dome.id, lane: m.lane, x: m.col + 0.5, kind: "sky" });
    else hurtDefender(s, d, FIELD.strikeTroop, { magic: true });
  }
}

/** Whether (and which way) a foe of this wave comes in by one of the level's other ways onto the lawn. */
function pickOrigin(s: GarrisonState, kind: EnemyKind, wave: number): OriginKind | null {
  const def = ENEMIES[kind]!;
  if (def.flying || def.siege || def.roller || def.dig || def.burrow || def.teleport || def.structure || def.boss) return null;
  for (const o of s.cfg.oc?.origins ?? []) {
    if (wave < (o.from ?? 1)) continue;
    // Tunnels are for walkers of modest size; nothing that heavy is dropped from the sky.
    if (o.kind === "flank" && (def.ranged || def.cost >= 8)) continue;
    if (o.kind === "sky" && def.cost >= 9) continue;
    if (o.kind === "water" && !s.field?.grid.includes(TILE.water)) continue;
    if (rand(s) < o.share) return o.kind;
  }
  return null;
}

/** A wave foe comes onto the lawn out of the water, from the sky or out of a tunnel behind the lines (null: no room, use the road). */
function spawnFrom(s: GarrisonState, kind: EnemyKind, origin: OriginKind, wave: number): Enemy | null {
  let lane: number;
  let x: number;
  if (origin === "water") {
    const f = s.field;
    const pools: number[] = [];
    if (f) {
      for (let i = 0; i < f.grid.length; i += 1) {
        const l = Math.floor(i / GW_COLS);
        const c = i % GW_COLS;
        if (f.grid[i] === TILE.water && f.footing[i] !== 1 && c >= 2 && isActiveLane(s, l) && !defenderAt(s, l, c) && !s.atk.raided.includes(l)) pools.push(i);
      }
    }
    if (!pools.length) return null;
    const at = pools[randInt(s, 0, pools.length - 1)]!;
    lane = Math.floor(at / GW_COLS);
    x = (at % GW_COLS) + 0.5;
  } else if (origin === "sky") {
    lane = pickLane(s);
    x = 3.6 + rand(s) * 3.8;
    // Never dropped onto a troop: it lands just in front of it.
    const under = defenderAt(s, lane, Math.floor(x));
    if (under && !isFlat(under)) x = Math.min(SIGHT_X - 0.2, under.col + 1.3);
  } else {
    lane = pickLane(s);
    x = 0.35;
  }
  const e = spawnEnemy(s, kind, lane, x, "wave", wave);
  // Out of a tunnel it faces the troops' backs (like a Sandworm surfacing).
  if (origin === "flank") e.dir = 1;
  e.origin = origin;
  setState(s, e, "appear", origin === "sky" ? sec(0.7) : sec(0.9));
  s.events.push({ e: "emerge", id: e.id, origin });
  return e;
}

/** A crypt lets one of the dead out now and then (while the waves are still coming). */
function cryptAct(s: GarrisonState, e: Enemy): void {
  const d = s.director;
  const crypt = ENEMIES[e.kind]!.crypt!;
  if (d.wave < 1 || d.done || s.cfg.boss) return;
  e.cd -= 1;
  if (e.cd > 0) return;
  e.cd = crypt.every;
  cryptRaise(s, e, crypt.maxCost, 0);
}

/** One of the dead climbs out of a crypt door: a wave-pool foe of modest cost (a Shambler when there is none). */
function cryptRaise(s: GarrisonState, crypt: Enemy, maxCost: number, wave: number): Enemy {
  const pool = s.cfg.enemies.filter((kind) => {
    const def = ENEMIES[kind];
    return def !== undefined && def.cost > 0 && def.cost <= maxCost && !def.flying && !def.siege && !def.roller && !def.dig && !def.burrow && !def.teleport && !def.structure && !def.boss;
  });
  const kind = pool.length ? pool[randInt(s, 0, pool.length - 1)]! : "oc-shambler";
  const risen = spawnEnemy(s, kind, crypt.lane, Math.max(0.3, crypt.x - 0.35), "wave", wave);
  risen.origin = "crypt";
  setState(s, risen, "appear", sec(0.8));
  s.events.push({ e: "emerge", id: risen.id, origin: "crypt" });
  return risen;
}

/** The sleepers of one bank wake (it was struck, or one of them was). */
function wakeGuards(s: GarrisonState, bankId: number): void {
  for (const g of s.enemies) if (!g.dead && g.guard === bankId) wake(s, g);
}

function wake(s: GarrisonState, g: Enemy): void {
  g.guard = 0;
  if (g.state === "idle") setState(s, g, "walk");
  s.events.push({ e: "wake", id: g.id });
}

/** A Chaos structure came down: a chest spills its gold; a bank frees the troop it held. */
function structureDown(s: GarrisonState, e: Enemy, how: KillHow): void {
  const def = ENEMIES[e.kind]!;
  const x = Math.min(8.6, Math.max(0.4, e.x));
  if (def.chest && how !== "devour") {
    const coins = Math.max(1, Math.round(def.chest.gold / 25));
    for (let i = 0; i < coins; i += 1) dropCoin(s, Math.min(8.6, Math.max(0.4, x + (i - (coins - 1) / 2) * 0.3)), e.lane + 0.15, e.lane + 0.7, Math.round(def.chest.gold / coins));
    s.events.push({ e: "chestOpen", lane: e.lane, x, value: def.chest.gold });
  }
  const bank = def.bank;
  if (!bank) return;
  wakeGuards(s, e.id);
  if (bank.gold > 0) dropCoin(s, x, e.lane + 0.15, e.lane + 0.7, bank.gold);
  const col = Math.floor(e.x);
  if (s.cfg.mode === "raid" || !DEFENDERS[bank.troop] || !isActiveLane(s, e.lane) || defenderAt(s, e.lane, col) || fieldBlocks(s, e.lane, col, bank.troop)) return;
  const d = addDefender(s, bank.troop, e.lane, col);
  s.events.push({ e: "bankFreed", id: d.id, lane: d.lane, col, kind: d.kind });
  s.events.push({ e: "place", id: d.id, kind: d.kind, lane: d.lane, col });
}

/** A thief walking past a treasure chest pockets its gold (slay it to get the gold back). */
function lootChest(s: GarrisonState, e: Enemy): void {
  for (const c of s.enemies) {
    const chest = c.dead ? undefined : ENEMIES[c.kind]!.chest;
    if (!chest || c.lane !== e.lane || Math.abs(c.x - e.x) > 0.3) continue;
    c.dead = true;
    e.loot += chest.gold;
    reveal(s, e);
    s.events.push({ e: "loot", id: e.id, target: c.id, value: chest.gold, lane: c.lane, x: c.x });
    return;
  }
}

/** Rooting Boar: roots up the tomb it stands on and gobbles it, then trots home (not a lost troop). */
function eatTombAct(s: GarrisonState, d: Defender, eat: { grave: number; crypt: number }, rate: number): void {
  const tomb = tombAt(s, d.lane, d.col);
  if (!tomb) {
    // The tomb came down some other way: nothing left to eat.
    d.dead = true;
    s.events.push({ e: "tombEaten", id: d.id, lane: d.lane, col: d.col, kind: "" });
    return;
  }
  if (d.stacks === 0) {
    d.stacks = 1;
    d.cd = ENEMIES[tomb.kind]!.crypt ? eat.crypt : eat.grave;
    s.events.push({ e: "chew", id: d.id, target: tomb.id });
  }
  d.cd -= rate;
  if (d.cd > 0) return;
  killEnemy(s, tomb, "devour");
  dropCoin(s, d.col + 0.5, d.lane + 0.2, d.lane + 0.7, FIELD.graveGoods);
  d.dead = true;
  s.events.push({ e: "tombEaten", id: d.id, lane: d.lane, col: d.col, kind: tomb.kind });
}

/** Nightmare: puts the nearest troop up to `range` tiles ahead in its lane to sleep. Returns false when there is none. */
function lullAct(s: GarrisonState, e: Enemy): boolean {
  const lull = ENEMIES[e.kind]!.lull!;
  let target: Defender | undefined;
  let best = Number.MAX_VALUE;
  for (const d of s.defenders) {
    if (d.dead || d.lane !== e.lane || isFlat(d) || d.asleep || d.invulnUntil > s.tick) continue;
    const dd = DEFENDERS[d.kind]!;
    if (dd.steadfast || dd.instant || dd.veiled || dd.landmark) continue;
    const gap = (e.x - (d.col + 0.5)) * -e.dir;
    if (gap < -0.3 || gap > lull.range || gap >= best) continue;
    target = d;
    best = gap;
  }
  if (!target) return false;
  target.asleep = 2;
  target.shotAt = -1;
  target.shotsLeft = 0;
  reveal(s, e);
  s.events.push({ e: "lull", id: e.id, target: target.id });
  return true;
}

/** Wakes a sleeping troop (a Wake-Up Brew; the Cure spell and a Field Hospital wake only a lulled one). */
function wakeTroop(s: GarrisonState, d: Defender, brew: boolean): void {
  if (!d.asleep || (!brew && d.asleep !== 2)) return;
  d.asleep = 0;
  s.events.push({ e: "brew", id: d.id });
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
    if (isStructure(e) || (ENEMIES[e.kind]!.boss && !ENEMIES[e.kind]!.warboss)) continue;
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
  // Order & Chaos: a world boss's fall ends the battle at once (a spell still in the air doesn't hold the victory up).
  const warboss = s.warbossId !== undefined && cfg.oc?.warboss ? cfg.oc.warboss.kind : undefined;
  const bossFell = warboss !== undefined && !s.enemies.some((e) => e.id === s.warbossId && !e.dead);
  // (Order & Chaos allies — Rin's cats — are no foes to wait for.)
  if (s.director.done && !s.enemies.some((e) => !isStructure(e) && !ENEMIES[e.kind]!.ally) && (s.blasts.length === 0 || bossFell)) {
    finish(s, "def", bossFell ? `${ENEMIES[warboss ?? ""]?.name ?? "The world boss"} has fallen — the horde breaks.` : "The assault is broken.");
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
