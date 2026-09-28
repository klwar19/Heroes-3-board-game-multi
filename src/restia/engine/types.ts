/**
 * Restia — single-player isekai life-sim RPG (Bin's Otherworld Chronicle spin-off).
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

export type CharId = "bin" | "hikari" | "mina" | "tove" | "seren" | "nell";
/** Everyone Bin can talk to. Bin himself is never an NPC. */
export type NpcId = Exclude<CharId, "bin"> | "guildGirl" | "pip" | "kaito";
export type SpeakerId = NpcId | "bin" | "system" | "narrator";

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
};

export type CropDef = {
  id: CropId;
  name: string;
  seed: ItemId;
  produce: ItemId;
  seasons: Season[];
  days: number;
  regrow?: number;
  /** Items per harvest [min, max]. */
  yield: [number, number];
  xp: number;
  /** Farm sprite sheet cells (6x6): growing and ripe. */
  sprite: { growing: number; ripe: number };
};

export type StatusId = "poison" | "burn" | "sleep" | "stun" | "slow" | "freeze";

export type SkillTarget = "enemy" | "ally" | "self" | "area" | "allEnemies" | "allAllies";

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
};

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
  desc: string;
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
  | { kind: "ap"; n: number };

export type SceneLine =
  | { who: SpeakerId; text: string; show?: SpeakerId[]; bg?: string }
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
};

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type Debris = "weed" | "stone" | "branch" | "stump" | "boulder" | "withered";

export type CropState = { id: CropId; growth: number; harvests: number };

export type Plot = {
  tilled: boolean;
  watered: boolean;
  fertilizer: 0 | 1 | 2;
  crop: CropState | null;
  debris: Debris | null;
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

export type StatusInst = { id: StatusId; turns: number };
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
};

export type BattleOrigin =
  | { kind: "dungeon"; monsterUid: string }
  | { kind: "field"; monsterUid: string }
  | { kind: "event"; encounter: string };

export type BattleRewards = {
  exp: number;
  gold: number;
  items: Record<ItemId, number>;
  levelUps: { who: string; level: number }[];
  befriended: string[];
};

export type BattleState = {
  cols: number;
  rows: number;
  backdrop: string;
  blocked: number[];
  units: BattleUnit[];
  round: number;
  queue: string[];
  active: string | null;
  turn: { moved: boolean; acted: boolean; waited: boolean };
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
  | { type: "bAiTurn" }
  | { type: "bFinish" }
  | { type: "tick"; seconds: number };

export type BattleAnim =
  | { kind: "move"; uid: string; path: number[] }
  | { kind: "attack"; uid: string; target: string; anim: "attack" | "cast" | "shoot" }
  | { kind: "hit"; uid: string; amount: number; crit: boolean; weak: boolean; resist: boolean; miss: boolean; heal: boolean }
  | { kind: "status"; uid: string; text: string }
  | { kind: "death"; uid: string }
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
