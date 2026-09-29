/**
 * Restia mode — single-player life-sim RPG set in Haven (the Cosmic Jester
 * story): Bin, Peri's Jester, back in the frontier town of Frostbitten.
 *
 * The engine is pure TypeScript: `dispatch(state, action)` returns the next state
 * plus presentation events. Everything the player can do goes through one action
 * so saves stay authoritative and the UI never mutates game data directly.
 */

export type Season = "spring" | "summer" | "autumn" | "winter";
export type Weather = "sunny" | "cloudy" | "rain" | "storm" | "snow";
export type Dir = "down" | "left" | "right" | "up";
export type ZoneId = "farm" | "village" | "forest";
export type ItemId = string;
export type CropId = string;
export type MonsterId = string;
export type SkillId = string;
export type RecipeId = string;
export type QuestId = string;

export type CharId = "bin" | "mitia" | "bowy" | "garr" | "hilda" | "senna";
/** Everyone Bin can talk to in Frostbitten. Bin himself is never an NPC. */
export type NpcId = Exclude<CharId, "bin"> | "lysa" | "tilde" | "dain" | "mara" | "frida";
/** Scene-only speakers (Earth, the goddess, townsfolk without schedules). */
export type CastId =
  | "peri"
  | "lily"
  | "luna"
  | "leo"
  | "meilin"
  | "jake"
  | "chad"
  | "lingling"
  | "nurse"
  | "tessa"
  | "corvin"
  | "kael"
  | "twins"
  | "guard"
  | "host"
  | "tuli"
  | "rolf"
  | "stranger"
  | "frostSprite";
export type SpeakerId = NpcId | CastId | "bin" | "system" | "narrator";
/** Alternate standing-art expressions (Bin has the full set). */
export type Face = "happy" | "angry" | "sad";

export type Element = "phys" | "fire" | "ice" | "wind" | "earth" | "light" | "dark";
export type StatKey = "maxHp" | "maxMp" | "atk" | "def" | "mag" | "res" | "spd" | "luk";
export type Stats = Record<StatKey, number>;

export type ToolId = "hoe" | "can" | "axe" | "hammer" | "sickle";
export type LifeSkill = "farming" | "foraging" | "mining" | "forging" | "alchemy" | "cooking" | "taming";
export type BuildingId = "farmhouse" | "field" | "barn" | "shrine" | "smithy" | "atelier" | "inn" | "guild" | "store";
export type GuildRank = "F" | "E" | "D" | "C" | "B" | "A" | "S";
export type Station = "forge" | "alchemy" | "cooking";
export type WeaponType = "sword" | "spear" | "hammer" | "bow" | "staff";
export type ArmorType = "light" | "heavy" | "robe";

// ---------------------------------------------------------------------------
// Content definitions (src/restia/data)
// ---------------------------------------------------------------------------

export type IconRef = { sheet: "a" | "b" | "c"; index: number };

export type ItemCategory =
  | "crop"
  | "seed"
  | "forage"
  | "animal"
  | "material"
  | "ore"
  | "drop"
  | "weapon"
  | "armor"
  | "accessory"
  | "potion"
  | "bomb"
  | "food"
  | "farm"
  | "gift"
  | "special";

export type BuffDef = {
  id: string;
  label: string;
  /** Flat stat bonus for every party member until the buff ends. */
  stats?: Partial<Stats>;
  /** Extra max stamina for the day. */
  stamina?: number;
};

export type ItemUse = {
  stamina?: number;
  hp?: number;
  hpPct?: number;
  mp?: number;
  mpPct?: number;
  cure?: boolean;
  revivePct?: number;
  /** Lasts until the end of the day. */
  buff?: BuffDef;
  /** Thrown in battle: damage around the target hex. */
  bomb?: { power: number; element: Element; radius: number; status?: StatusId };
  /** Smoke: guaranteed escape from a non-boss battle. */
  escape?: boolean;
  /** Return scroll: leave the dungeon from any floor. */
  returnHome?: boolean;
  /** Fertilizer strength applied to a tilled plot. */
  fertilizer?: 1 | 2;
  /** Monster treat: raises Befriend chance when held. */
  treat?: boolean;
};

export type EquipDef = {
  slot: "weapon" | "armor" | "accessory";
  weaponType?: WeaponType;
  armorType?: ArmorType;
  stats: Partial<Stats>;
  /** Basic attacks with this weapon use the element. */
  element?: Element;
  /** Passive the wearer has in battle (data/passives.ts). */
  passive?: PassiveId;
};

export type ItemDef = {
  id: ItemId;
  name: string;
  category: ItemCategory;
  /** Base value: shipping/selling price. Shops sell at `buy` (default 2x). */
  price: number;
  buy?: number;
  icon: IconRef;
  tags?: string[];
  desc: string;
  use?: ItemUse;
  equip?: EquipDef;
  seedOf?: CropId;
  /** Farm sprinkler tier: placed on an empty plot, waters its pattern every morning (engine/farm.ts). */
  sprinkler?: 1 | 2 | 3;
};

export type CropDef = {
  id: CropId;
  name: string;
  seed: ItemId;
  produce: ItemId;
  seasons: Season[];
  days: number;
  regrow?: number;
  /** Nine ripe plants in a 3x3 block may fuse into one giant crop overnight. */
  giant?: boolean;
  /** Items per harvest [min, max]. */
  yield: [number, number];
  xp: number;
  /** Farm sprite sheet cells (6x6): growing and ripe. */
  sprite: { growing: number; ripe: number };
};

export type StatusId =
  | "poison"
  | "burn"
  | "sleep"
  | "stun"
  | "slow"
  | "freeze"
  /** Loses HP each time it moves. */
  | "bleed"
  /** Can't use skills. */
  | "silence"
  /** Physical attacks miss far more often. */
  | "blind"
  /** Can't move. */
  | "root"
  /** Takes +25% damage. */
  | "mark"
  /** Must attack the unit that taunted it (StatusInst.source). */
  | "taunt"
  /** Heals 8% max HP at turn start. */
  | "regen"
  /** +1 move, +25% SPD. */
  | "haste";

/** Impact effect sheets (public/assets/restia/fx/<id>.webp, 4x4 frames, additive). */
export type FxId =
  | "slash"
  | "smash"
  | "pierce"
  | "claw"
  | "bite"
  | "fire"
  | "ice"
  | "wind"
  | "earth"
  | "light"
  | "dark"
  | "heal"
  | "buff"
  | "debuff"
  | "poison"
  | "explosion"
  | "shield"
  | "jester"
  | "drain"
  | "roar"
  | "cast";

/** Projectile sheets (public/assets/restia/fx/proj-<id>.webp, 4x4 looping frames, flying right). */
export type ProjectileId = "arrow" | "fireball" | "ice" | "dark" | "light" | "wind" | "card" | "rock" | "poison";

export type PassiveId = string;
export type JobId = string;

/** `hex`: any board hex in range (leaps land on an empty one; terrain skills shape it). */
export type SkillTarget = "enemy" | "ally" | "self" | "area" | "allEnemies" | "allAllies" | "hex";

/** Extra animation rows the main characters have (skill sheets); others fall back to attack/cast. */
export type SkillSprite = "victory" | "jump" | "skillA" | "skillB";

export type SkillDef = {
  id: SkillId;
  name: string;
  desc: string;
  mp: number;
  target: SkillTarget;
  /** Hexes from the caster (0 = self). */
  range: number;
  /** Area radius around the target hex (area skills). */
  radius?: number;
  kind: "physical" | "magic" | "heal" | "buff" | "debuff" | "analyze" | "revive";
  element?: Element;
  power?: number;
  status?: { id: StatusId; chance: number; turns: number };
  mods?: { stat: StatKey; pct: number; turns: number }[];
  /** Also usable from the field menu (healing). */
  field?: boolean;
  anim?: "attack" | "cast";
  /** Heals the attacker for this fraction of the damage dealt. */
  drain?: number;
  /** Removes negative statuses from the targets. */
  cure?: boolean;
  /** Action points (default 2). A turn starts with 3 (+ carried AP). */
  ap?: number;
  /** Hits this many times (each hit rolls separately). */
  hits?: number;
  /** Pushes each target this many hexes away from the caster. */
  knockback?: number;
  /** Hits every unit on the straight line from the caster up to `range`. */
  line?: boolean;
  /** Absorb shield on each target: power x (MAG + 2 x level). */
  shield?: number;
  /** Nearby foes (radius 2 of the caster) must attack the caster for this many turns. */
  taunt?: number;
  /** Leaves this terrain on every hex of the area (fire patches, ice, spring...). */
  terrain?: TileKind;
  /** Extra critical-hit chance (0-1). */
  crit?: number;
  /** Stat changes on the caster itself (drawbacks, self buffs on attacks). */
  selfMods?: { stat: StatKey; pct: number; turns: number }[];
  /**
   * Movement: `leap` jumps to the chosen empty hex (any height, over units and
   * cliffs) and then hits foes within `radius` of the landing; `dash` charges in
   * a straight line to the target foe (+15% power per hex travelled; flyers swoop
   * over units); `blink` teleports to the chosen empty hex (ignores height and
   * whatever is in between) and then hits foes within `radius` of the arrival.
   * Two-hex bodies need their whole footprint free, standable and level.
   */
  move?: "leap" | "dash" | "blink";
  /** Raises (+) or lowers (-) the ground of every affected hex, within heights 0-2. */
  shape?: number;
  /** Drags each target this many hexes toward the caster. */
  pull?: number;
  /** Extra power per level the caster stood above the target when the skill began. */
  heightPower?: number;
  /** Arcing shot: ignores line of sight and cover. */
  indirect?: boolean;
  /** Presentation: impact effect, projectile and sound (sounds manifest key). */
  fx?: FxId;
  projectile?: ProjectileId;
  sfx?: string;
  /** Presentation: a skill-sheet animation row (main characters). */
  sprite?: SkillSprite;
};

/**
 * Battle passives (jobs, characters, monsters, equipment). Pure data: the battle
 * engine reads these fields at the matching moment. Percentages are whole numbers.
 */
export type PassiveDef = {
  id: PassiveId;
  name: string;
  desc: string;
  /** Always-on stat bonus (%). */
  stats?: Partial<Record<StatKey, number>>;
  /** Extra stat bonus (%) while HP is below `below` (fraction of max). */
  lowHp?: { below: number; stats: Partial<Record<StatKey, number>> };
  /** Extra AP every turn. */
  ap?: number;
  /** Extra movement. */
  move?: number;
  /** Extra range for ranged basic attacks. */
  range?: number;
  /** Heals this fraction of max HP / MP at turn start. */
  regen?: number;
  mpRegen?: number;
  /** Basic attacks and physical skills may inflict a status. */
  onHit?: { status: StatusId; chance: number; turns: number };
  /** Heals this fraction of damage dealt. */
  lifesteal?: number;
  /** Returns this fraction of melee damage taken to the attacker. */
  thorns?: number;
  /** Retaliation power (default 0.5 of a basic attack). */
  counter?: number;
  /** Strikes back before the attacker's blow lands (melee). */
  firstStrike?: boolean;
  /** Foes can't retaliate against this unit's melee attacks. */
  noRetaliation?: boolean;
  /** +% damage for each other ally adjacent to the target. */
  pack?: number;
  /** +% damage when striking a foe from behind (it faces away). */
  backstab?: number;
  /** +% damage with one element. */
  elementBoost?: { element: Element; pct: number };
  /** Can't receive these statuses. */
  immune?: StatusId[];
  /** Extra chance to dodge physical attacks (0-1). */
  evasion?: number;
  /** Extra crit chance (0-1) and crit damage (+x to the 1.5 multiplier). */
  crit?: number;
  critDamage?: number;
  /** Starts every battle with a shield of this fraction of max HP. */
  shieldStart?: number;
  /** Explodes on death around its hex. */
  deathBurst?: { power: number; element: Element; radius: number; status?: StatusId };
  /** Survives the first lethal blow of the battle at 1 HP. */
  undying?: boolean;
  /** Extra % damage while standing higher than the target. */
  highGround?: number;
  /** +% healing done. */
  healBoost?: number;
  /** -% MP cost of skills. */
  mpSave?: number;
  /** Allies (not itself) within 2 hexes get this % bonus. */
  aura?: Partial<Record<StatKey, number>>;
  /** Ignores terrain move costs and hazard tiles. */
  sureFooted?: boolean;
};

/** One job level: permanent stat gain plus the skill/passive it teaches. */
export type JobLevel = { stats: Partial<Stats>; skill?: SkillId; passive?: PassiveId };

export type JobDef = {
  id: JobId;
  name: string;
  tier: 1 | 2;
  desc: string;
  /** Needs this job at this level (same character). */
  requires?: { job: JobId; level: number };
  /** Only these characters can take the job. */
  only?: CharId[];
  /** Exactly five levels. */
  levels: JobLevel[];
};

/** Monster AI: rules are tried top-down; a rule that fires picks the action, scoring picks where/whom. */
export type AiCondition =
  | { kind: "hpBelow"; value: number }
  | { kind: "hpAbove"; value: number }
  | { kind: "allyHurt"; value: number }
  | { kind: "foesInRange"; range: number; count: number }
  | { kind: "adjacentFoe" }
  | { kind: "noAdjacentFoe" }
  | { kind: "round"; from: number }
  | { kind: "firstTurn" }
  | { kind: "alone" }
  | { kind: "outnumbered" }
  | { kind: "selfLacks"; status: StatusId }
  | { kind: "chance"; value: number };

export type AiRule = {
  when: AiCondition[];
  /** Skill id, or a basic behaviour. */
  do: SkillId | "attack" | "defend" | "charge" | "retreat";
};

export type AiStyle = "aggressive" | "sniper" | "support" | "tank" | "swarmer" | "coward" | "caster" | "boss";

export type MonsterAi = { style: AiStyle; rules?: AiRule[] };

export type MonsterDef = {
  id: MonsterId;
  name: string;
  /** H3 creature atlas slug (src/data/battle-hex/creature-sprite-atlases.json). */
  sprite: string;
  base: Stats;
  growth: Stats;
  move: number;
  range: number;
  flying?: boolean;
  /** Basic attacks use MAG vs RES instead of ATK vs DEF. */
  magic?: boolean;
  element: Element;
  resist: Partial<Record<Element, number>>;
  skills: SkillId[];
  exp: number;
  gold: number;
  drops: { item: ItemId; chance: number }[];
  /** 0 = cannot be befriended. */
  tame: number;
  /** Barn work when befriended. */
  farmJob?: "water" | "harvest" | "clear" | "produce";
  produce?: ItemId;
  boss?: boolean;
  /** Sprite scale on the battle board (big bosses). */
  scale?: number;
  /** Occupies two hexes (H3 double-wide creatures): needs two level hexes to stand. */
  wide?: boolean;
  desc: string;
  passives?: PassiveId[];
  ai?: MonsterAi;
};

export type CharacterDef = {
  id: CharId;
  name: string;
  title: string;
  base: Stats;
  growth: Stats;
  move: number;
  range: number;
  weapon: WeaponType;
  armor: ArmorType[];
  element: Element;
  resist: Partial<Record<Element, number>>;
  /** Learned at level. */
  skills: { level: number; skill: SkillId }[];
  /** Unlocked by bond hearts (companions only). */
  bondSkills?: { hearts: number; skill: SkillId }[];
  startEquip: { weapon: ItemId | null; armor: ItemId | null; accessory: ItemId | null };
  /** Innate battle passive. */
  passive?: PassiveId;
  /** Job at recruitment. */
  job: JobId;
};

export type Condition =
  | { kind: "flag"; key: string; value?: boolean | number }
  | { kind: "noFlag"; key: string }
  | { kind: "hearts"; npc: NpcId; min: number }
  | { kind: "item"; id: ItemId; n: number }
  | { kind: "building"; id: BuildingId; level: number }
  | { kind: "rank"; rank: GuildRank }
  | { kind: "season"; season: Season }
  | { kind: "floor"; n: number }
  | { kind: "day"; min: number }
  | { kind: "questDone"; id: QuestId }
  | { kind: "status"; npc: NpcId; status: "dating" | "married" }
  | { kind: "recruited"; id: CharId }
  | { kind: "time"; from: number; to: number }
  | { kind: "weather"; weather: Weather[] }
  | { kind: "shipped"; n: number; item?: ItemId }
  | { kind: "defeated"; n: number; monster?: MonsterId }
  | { kind: "level"; n: number }
  | { kind: "gold"; n: number }
  | { kind: "tamed"; n: number }
  | { kind: "counter"; key: string; n: number }
  | { kind: "any"; of: Condition[] }
  | { kind: "all"; of: Condition[] };

export type Effect =
  | { kind: "points"; npc: NpcId; n: number }
  | { kind: "flag"; key: string; value: boolean | number }
  | { kind: "item"; id: ItemId; n: number }
  | { kind: "gold"; n: number }
  | { kind: "recruit"; id: CharId }
  | { kind: "quest"; id: QuestId }
  | { kind: "battle"; encounter: string }
  | { kind: "time"; minutes: number }
  | { kind: "faith"; n: number }
  | { kind: "relationship"; npc: NpcId; status: "dating" | "married" }
  | { kind: "gp"; n: number }
  | { kind: "rankUp" }
  | { kind: "heal" }
  | { kind: "meet"; npc: NpcId }
  | { kind: "stamina"; n: number }
  | { kind: "ap"; n: number }
  /** Adds to a lifetime counter (story tallies such as coins found). */
  | { kind: "count"; key: string; n: number }
  /** Stores today's day number in a flag ("not again today" gates). */
  | { kind: "flagDay"; key: string };

export type SceneLine =
  | { who: SpeakerId; text: string; show?: SpeakerId[]; bg?: string; face?: Face }
  | { choice: { text: string; effects?: Effect[]; goto?: string }[]; who?: SpeakerId; text?: string; show?: SpeakerId[] }
  | { label: string }
  | { effects: Effect[] }
  | { goto: string }
  | { if: Condition; goto: string };

export type SceneDef = {
  id: string;
  bg: string;
  lines: SceneLine[];
  /** Played once at most (heart events, story beats). */
  once?: boolean;
  /** Music track (public/sounds/music/<name>.mp3) while the scene plays. */
  music?: string;
  /** Bin's clothes in this scene; default is his Haven gear. */
  outfit?: "earth";
};

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type Debris = "weed" | "stone" | "branch" | "stump" | "boulder" | "withered";

/** `giant` = plot index of the top-left cell of the 3x3 giant crop this plant belongs to. */
export type CropState = { id: CropId; growth: number; harvests: number; giant?: number };

export type Plot = {
  tilled: boolean;
  watered: boolean;
  fertilizer: 0 | 1 | 2;
  crop: CropState | null;
  debris: Debris | null;
  /** Sprinkler standing on this (untilled, empty) plot. Missing in older saves = none. */
  sprinkler?: 1 | 2 | 3;
};

export type Relationship = {
  points: number;
  met: boolean;
  talkedDay: number;
  giftDay: number;
  giftsWeek: number;
  giftWeek: number;
  events: string[];
  status: "none" | "dating" | "married";
};

export type MemberState = {
  id: CharId;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  equip: { weapon: ItemId | null; armor: ItemId | null; accessory: ItemId | null };
  /** Current job; job EXP only goes here. */
  job: JobId;
  /** Every job this member has tried: level 1-5 and EXP toward the next level. */
  jobs: Record<JobId, { level: number; exp: number }>;
};

export type PetState = {
  uid: string;
  species: MonsterId;
  name: string;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  farmJob: boolean;
};

export type RequestKind = "gather" | "deliver" | "hunt" | "craft" | "explore";

export type RequestState = {
  uid: string;
  kind: RequestKind;
  target: string;
  amount: number;
  /** Hunt kills counted since acceptance. */
  progress: number;
  gold: number;
  gp: number;
  client: NpcId;
  expires: number;
  accepted: boolean;
  rank: GuildRank;
};

export type MissionState = { id: string; target: number; progress: number; done: boolean; ap: number };

export type StatusInst = { id: StatusId; turns: number; /** Taunt: who it must attack. */ source?: string };
/** `skip`: applied during the holder's own turn, so that turn's end does not count down. */
export type StatMod = { stat: StatKey; pct: number; turns: number; skip?: boolean };

export type BattleSide = "ally" | "enemy";

export type BattleUnit = {
  uid: string;
  side: BattleSide;
  kind: "member" | "pet" | "monster" | "guest";
  /** CharId for members, species for monsters/pets. */
  ref: string;
  name: string;
  level: number;
  stats: Stats;
  move: number;
  range: number;
  flying: boolean;
  hp: number;
  mp: number;
  cell: number;
  facing: "left" | "right";
  element: Element;
  resist: Partial<Record<Element, number>>;
  skills: SkillId[];
  statuses: StatusInst[];
  mods: StatMod[];
  retaliated: boolean;
  defending: boolean;
  down: boolean;
  boss: boolean;
  tame: number;
  exp: number;
  gold: number;
  drops: { item: ItemId; chance: number }[];
  sprite: string;
  scale: number;
  petUid?: string;
  /** Basic attacks use MAG vs RES. */
  magic: boolean;
  /** Left the battlefield (befriended): not drawn, not targetable. */
  gone?: boolean;
  /** Action points for the current turn, and AP carried into the next one. */
  ap: number;
  apCarry: number;
  passives: PassiveId[];
  /** Absorbs damage before HP. */
  shield: number;
  /** Undying already used this battle. */
  spent?: boolean;
  /** Two-hex creature (engine/footprint.ts): `cell` is the head, the tail is behind it. */
  wide?: boolean;
};

/** Ground under a hex. `void` is not part of the board; `water` can't be entered. */
export type TileKind = "high" | "cover" | "ice" | "mud" | "thorns" | "fire" | "spring" | "crystal" | "water" | "void";

/** Objects standing on a hex: they block movement; most can be destroyed. */
export type PropKind = "rock" | "pillar" | "crates" | "barrel" | "totem";

export type BattleProp = { uid: string; kind: PropKind; cell: number; hp: number; maxHp: number; /** Totems: whose side they empower. */ side?: BattleSide };

/** Board size of a battle: small 11x7, medium 15x9, large 19x11 (engine/battle-field.ts BOARD_SIZES). */
export type BoardSize = "small" | "medium" | "large";

/**
 * A battlefield objective. Shrines and banners are captured by whoever ENDS a
 * turn on them (any hex of its footprint); a cache is opened by the first ally
 * to enter its hex (bonus loot) or smashed by the first enemy (loot lost).
 */
export type BattlePoint = {
  id: string;
  kind: "shrine" | "banner" | "cache";
  cell: number;
  /** Shrines/banners: the side holding it. Caches: who opened or smashed it. */
  owner: BattleSide | null;
  /** Caches: already opened or smashed. */
  used?: boolean;
  /** Caches: what an ally finds inside (rolled when the board is built). */
  reward?: { gold: number; item?: ItemId };
};

export type BattleWeather = "clear" | "snow" | "blizzard" | "rain" | "storm" | "heat" | "gloom";

/** The Jester System's audience challenge for this fight (Jester Points on success). */
export type BattleChallenge = {
  id: "fast" | "weakness" | "crit" | "untouched" | "boom" | "highGround" | "points";
  text: string;
  target: number;
  progress: number;
  failed: boolean;
  jp: number;
};

export type BattleOrigin =
  | { kind: "dungeon"; monsterUid: string }
  | { kind: "field"; monsterUid: string }
  | { kind: "event"; encounter: string };

export type BattleRewards = {
  /** Bin's EXP (each member's share is scaled by level gap and today's repeats). */
  exp: number;
  gold: number;
  items: Record<ItemId, number>;
  levelUps: { who: string; level: number }[];
  jobUps: { who: string; job: string; level: number }[];
  befriended: string[];
  /** Why EXP was reduced, if it was (anti-grind note). */
  expNote?: string;
  challenge?: { text: string; ok: boolean; jp: number };
  /** Loot from supply caches opened during the fight (already included in `gold` and `items`). */
  found?: { gold: number; items: Record<ItemId, number> };
};

export type BattleState = {
  /** Board size (hexes outside cols x rows are `void`). Absent: small. */
  size?: BoardSize;
  cols: number;
  rows: number;
  backdrop: string;
  /** Ground by hex (plain ground is absent). */
  tiles: Record<number, TileKind>;
  /**
   * Ground height by hex, 1-2 (level ground is absent). Battles saved before
   * heights existed use the old one-level `high` tile instead.
   */
  heights?: Record<number, number>;
  /** Rounds left for temporary tiles made by skills (fire, ice...). */
  tileTimers: Record<number, number>;
  props: BattleProp[];
  weather: BattleWeather;
  /** Hexes marked for next round's falling rocks/icicles. */
  warnings: number[];
  /** Round at which hazards start (0 = none). */
  hazard: { kind: "rockfall" | "icicles"; from: number } | null;
  /** Enemies that join at a round. */
  reinforce: { round: number; enemies: { species: MonsterId; level: number }[] } | null;
  challenge: BattleChallenge | null;
  units: BattleUnit[];
  round: number;
  queue: string[];
  active: string | null;
  /** `movePts`: movement left this turn (spent per hex by terrain and climbing; can be split around the action). */
  turn: { moved: boolean; acted: boolean; waited: boolean; sprinted: boolean; item: boolean; movePts: number };
  /** Units that already used Wait this round. */
  waited: string[];
  phase: "turn" | "victory" | "defeat" | "fled";
  origin: BattleOrigin;
  canFlee: boolean;
  boss: boolean;
  initiative: "normal" | "preemptive" | "ambushed";
  rewards: BattleRewards | null;
  log: string[];
  /** Scene played after a won event battle. */
  winScene?: string;
  loseScene?: string;
  /** Losing an event battle (spar/exam) does not KO the day. */
  soft?: boolean;
  /** Objectives on the board (shrines, banners, supply caches). */
  points?: BattlePoint[];
  /** Supply-cache loot claimed so far; paid out with the victory rewards (lost on defeat or flight). */
  loot?: { gold: number; items: Record<ItemId, number> };
};

export type DungeonMonster = {
  uid: string;
  x: number;
  y: number;
  symbol: MonsterId;
  group: { species: MonsterId; level: number }[];
  boss: boolean;
  /** Steps it stays frozen (after the party fled). */
  frozen: number;
};

export type DungeonState = {
  floor: number;
  theme: string;
  w: number;
  h: number;
  /** Row-major: '#' wall, '.' floor, '>' stairs down, '<' stairs up. */
  tiles: string;
  /** Row-major '0'/'1' explored flags. */
  seen: string;
  x: number;
  y: number;
  facing: Dir;
  monsters: DungeonMonster[];
  chests: { x: number; y: number; opened: boolean; item: ItemId; n: number }[];
  nodes: { x: number; y: number; kind: "ore" | "herb"; used: boolean }[];
  bossFloor: boolean;
  stepCount: number;
};

export type FieldMonster = DungeonMonster & { zone: ZoneId };

export type SceneState = { id: string; index: number };

export type TownState = {
  levels: Record<BuildingId, number>;
  project: { id: BuildingId; level: number; daysLeft: number } | null;
};

export type RestiaState = {
  version: number;
  rng: number;
  day: number;
  minute: number;
  weather: Weather;
  tomorrow: Weather;
  gold: number;
  stamina: number;
  player: { zone: ZoneId; x: number; y: number; facing: Dir; inside: BuildingId | null };
  inventory: Record<ItemId, number>;
  storage: Record<ItemId, number>;
  tools: Record<ToolId, number>;
  water: number;
  plots: Plot[];
  shipping: Record<ItemId, number>;
  members: Partial<Record<CharId, MemberState>>;
  pets: PetState[];
  /** "bin" / CharIds / "pet:<uid>" in battle order. */
  active: string[];
  social: Record<NpcId, Relationship>;
  flags: Record<string, boolean | number>;
  quests: { active: QuestId[]; done: QuestId[] };
  requests: RequestState[];
  requestDay: number;
  guild: { rank: GuildRank; gp: number; examReady: boolean };
  missions: { day: number; list: MissionState[] };
  admin: { ap: number; perks: string[] };
  faith: number;
  town: TownState;
  skills: Record<LifeSkill, number>;
  recipes: RecipeId[];
  buffs: BuffDef[];
  bestiary: Record<MonsterId, { seen: number; defeated: number; analyzed: boolean }>;
  stats: {
    shipped: Record<ItemId, number>;
    shippedTotal: number;
    defeated: Record<MonsterId, number>;
    defeatedTotal: number;
    deepest: number;
    crafted: number;
    befriended: number;
    /** Resets every morning (System missions). */
    today: Record<string, number>;
    /** Lifetime tallies (quests): planted, harvested, watered, foraged, talks, gifts... */
    counters: Record<string, number>;
  };
  fieldMonsters: FieldMonster[];
  forage: { zone: ZoneId; x: number; y: number; item: ItemId }[];
  dungeon: DungeonState | null;
  battle: BattleState | null;
  scene: SceneState | null;
  /** Scenes queued after the current one (story chains, heart events). */
  sceneQueue: string[];
  seenScenes: string[];
  playSeconds: number;
  blessingDay: number;
};

// ---------------------------------------------------------------------------
// Actions & events
// ---------------------------------------------------------------------------

export type RestiaAction =
  | { type: "step"; dir: Dir }
  | { type: "enter"; building: BuildingId }
  | { type: "leave" }
  | { type: "tool"; tool: ToolId; x: number; y: number }
  | { type: "plant"; item: ItemId; x: number; y: number }
  | { type: "fertilize"; item: ItemId; x: number; y: number }
  | { type: "harvest"; x: number; y: number }
  | { type: "placeSprinkler"; item: ItemId; x: number; y: number }
  | { type: "takeSprinkler"; x: number; y: number }
  | { type: "refill" }
  | { type: "ship"; item: ItemId; n: number }
  | { type: "unship"; item: ItemId; n: number }
  | { type: "forage"; index: number }
  | { type: "talk"; npc: NpcId }
  | { type: "gift"; npc: NpcId; item: ItemId }
  | { type: "buy"; item: ItemId; n: number }
  | { type: "sell"; item: ItemId; n: number }
  | { type: "craft"; recipe: RecipeId; n: number }
  | { type: "build"; building: BuildingId }
  | { type: "sleep" }
  | { type: "wait"; minutes: number }
  | { type: "useItem"; item: ItemId; target: string }
  | { type: "fieldSkill"; caster: CharId; skill: SkillId; target: string }
  | { type: "equip"; member: CharId; item: ItemId | null; slot: "weapon" | "armor" | "accessory" }
  | { type: "setJob"; member: CharId; job: JobId }
  | { type: "setActive"; active: string[] }
  | { type: "store"; item: ItemId; n: number }
  | { type: "retrieve"; item: ItemId; n: number }
  | { type: "sceneNext" }
  | { type: "sceneChoose"; index: number }
  | { type: "acceptRequest"; uid: string }
  | { type: "turnIn"; uid: string }
  | { type: "abandonRequest"; uid: string }
  | { type: "rankExam" }
  | { type: "buyPerk"; perk: string }
  | { type: "pray"; blessing: string }
  | { type: "petJob"; uid: string; on: boolean }
  | { type: "releasePet"; uid: string }
  | { type: "enterDungeon"; floor: number }
  | { type: "dStep"; dir: Dir }
  | { type: "dInteract" }
  | { type: "leaveDungeon" }
  | { type: "bMove"; cell: number }
  | { type: "bAttack"; target: string }
  | { type: "bSkill"; skill: SkillId; cell: number }
  | { type: "bItem"; item: ItemId; cell: number }
  | { type: "bDefend" }
  | { type: "bWait" }
  | { type: "bBefriend"; target: string }
  | { type: "bFlee" }
  | { type: "bRush" }
  | { type: "bEndTurn" }
  | { type: "bSprint" }
  | { type: "bAiTurn" }
  | { type: "bFinish" }
  | { type: "tick"; seconds: number };

export type BattleAnim =
  | { kind: "move"; uid: string; path: number[] }
  | { kind: "attack"; uid: string; target: string; anim: "attack" | "cast" | "shoot"; sprite?: SkillSprite; sound?: string }
  /** Jump through the air from one hex to another (skill leaps). */
  | { kind: "leap"; uid: string; from: number; to: number; sprite: SkillSprite }
  /** Teleport (blink skills): vanish from `from`, appear on `to` (head hexes). */
  | { kind: "blink"; uid: string; from: number; to: number }
  /** A stance with no target: gathering power (Charge: AP carried over) or using an item. */
  | { kind: "pose"; uid: string; pose: "charge" | "item" }
  /** The ground of these hexes rises or sinks (heights before and after). */
  | { kind: "terrain"; changes: { cell: number; from: number; to: number }[] }
  | { kind: "projectile"; from: number; to: number; sprite: ProjectileId; sound?: string }
  | { kind: "fx"; cell: number; fx: FxId; sound?: string }
  | { kind: "sound"; id: string }
  | { kind: "banner"; text: string }
  | { kind: "prop"; uid: string; destroyed: boolean }
  | { kind: "knock"; uid: string; path: number[] }
  | { kind: "hit"; uid: string; amount: number; crit: boolean; weak: boolean; resist: boolean; miss: boolean; heal: boolean; shielded?: number }
  | { kind: "status"; uid: string; text: string }
  | { kind: "death"; uid: string; sound?: string }
  | { kind: "befriend"; uid: string; ok: boolean }
  | { kind: "area"; cell: number; radius: number; element: Element };

export type RestiaEvent =
  | { kind: "toast"; text: string; tone?: "info" | "good" | "bad" | "system" | "love" }
  | { kind: "sound"; id: string }
  | { kind: "battle"; anims: BattleAnim[] }
  | { kind: "levelUp"; who: string; level: number }
  | { kind: "hearts"; npc: NpcId; hearts: number }
  | { kind: "dayEnd"; summary: DaySummary }
  | { kind: "zone"; zone: ZoneId }
  /** A one-off line of dialogue (daily talk, gift reactions). */
  | { kind: "say"; npc: NpcId; text: string };

export type DaySummary = {
  day: number;
  shippedGold: number;
  shippedItems: Record<ItemId, number>;
  passedOut: boolean;
  goldLost: number;
  grown: number;
  petWork: string[];
  built: string | null;
  faithGain: number;
  notes: string[];
};

export type DispatchResult = { state: RestiaState; events: RestiaEvent[] };
