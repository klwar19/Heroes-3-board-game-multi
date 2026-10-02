/**
 * Garrison Wars — a lane-defence mode (Plants vs. Zombies style) built on the
 * game's Heroes III creatures. Every faction has a GARRISON (units the
 * defender raises on the lawn) and a WARBAND (units that march down the lanes),
 * so any faction can defend or attack, and loadouts may mix factions.
 *
 * Pure data: every number the simulation (./sim.ts) reads lives here, so the
 * almanac, the card trays and the engine can never disagree. Time is in
 * simulation ticks (GW_TPS per second), distance in lawn tiles.
 */

import { GW_TPS, GW_TICK_MS, pace, sec } from "./clock";
import { OC_ALLIES, OC_BLESSINGS, OC_DEFENDERS, OC_ENEMIES, OC_FUSIONS } from "./order-chaos/roster";
import { OC_FIELD_CARDS, OC_FIELD_DEFENDERS, OC_FIELD_ENEMIES } from "./order-chaos/field-units";

export { GW_TPS, GW_TICK_MS, pace, sec };
export const GW_COLS = 9;
export const GW_LANES = 5;

/** Order & Chaos splits every creature into two sides instead of towns. */
export type OcSide = "lawful" | "chaos";

export type Faction = "castle" | "rampart" | "tower" | "inferno" | "necropolis" | "dungeon" | "stronghold" | "fortress" | "conflux" | "doom";
export type DefKind = string;
export type EnemyKind = string;
export type CardId = string;

export const FACTION_ORDER: readonly Faction[] = ["castle", "rampart", "tower", "inferno", "necropolis", "dungeon", "stronghold", "fortress", "conflux", "doom"];

export type FactionDef = {
  id: Faction;
  name: string;
  garrison: string;
  warband: string;
  /** UI accent and banner tint. */
  color: string;
  crest: string;
  /** Lane charger sprite (the "lawnmower") when this faction defends. */
  charger: string;
  chargerName: string;
};

export const FACTIONS: Record<Faction, FactionDef> = {
  castle: { id: "castle", name: "Castle", garrison: "Knights of Erathia", warband: "Erathian Crusade", color: "#3f7fe0", crest: "/assets/town-icon-castle.webp", charger: "cavalier", chargerName: "Cavalier" },
  rampart: { id: "rampart", name: "Rampart", garrison: "Wardens of AvLee", warband: "Wild Hunt", color: "#3fae4f", crest: "/assets/town-icon-rampart.webp", charger: "war-unicorn", chargerName: "War Unicorn" },
  tower: { id: "tower", name: "Tower", garrison: "Wizards of Bracada", warband: "Arcane Legion", color: "#9fd4f0", crest: "/assets/town-icon-tower.webp", charger: "stone-gargoyle", chargerName: "Gargoyle" },
  inferno: { id: "inferno", name: "Inferno", garrison: "Hellgate Keepers", warband: "Legions of Eeofol", color: "#e2542e", crest: "/assets/town-icon-inferno.webp", charger: "hell-hound", chargerName: "Hell Hound" },
  necropolis: { id: "necropolis", name: "Necropolis", garrison: "Deathwatch of Deyja", warband: "The Undead Tide", color: "#8a5bd0", crest: "/assets/town-icon-necropolis.webp", charger: "black-knight", chargerName: "Black Knight" },
  dungeon: { id: "dungeon", name: "Dungeon", garrison: "Warlocks of Nighon", warband: "Nighon Raiders", color: "#c04a7a", crest: "/assets/town-icon-dungeon.webp", charger: "minotaur", chargerName: "Minotaur" },
  stronghold: { id: "stronghold", name: "Stronghold", garrison: "Tribes of Krewlod", warband: "Barbarian Horde", color: "#d49a2a", crest: "/assets/town-icon-stronghold.webp", charger: "wolf-raider", chargerName: "Wolf Raider" },
  fortress: { id: "fortress", name: "Fortress", garrison: "Beastmasters of Tatalia", warband: "Swamp Brood", color: "#6f9a3a", crest: "/assets/town-icon-fortress.webp", charger: "mighty-gorgon", chargerName: "Mighty Gorgon" },
  conflux: { id: "conflux", name: "Conflux", garrison: "Elemental Wardens", warband: "Elemental Storm", color: "#48c6c0", crest: "/assets/town-icon-conflux.webp", charger: "air-elemental", chargerName: "Air Elemental" },
  // The demons of DOOM (the neutral Doom slice of the board game, rotoscoped hex sprites).
  doom: { id: "doom", name: "Doom", garrison: "Hell's Garrison", warband: "Hell on Earth", color: "#c8341c", crest: "/assets/garrison/ui/doom-crest.webp", charger: "doom-demon", chargerName: "Pinky Demon" }
};

export type ProjectileKind =
  | "arrow" | "stone" | "frost" | "bolt" | "holy" | "dark" | "axe" | "spear" | "gift" | "lightning"
  | "fireball" | "cloud" | "boulder"
  // DOOM: Imp / Mancubus hellfire, Cacodemon plasma balls, Hell Knight / Baron green balls,
  // Arachnotron plasma, rockets, hitscan bullets, and the Lost Souls a Pain Elemental spits.
  | "hellfire" | "cacoball" | "baronball" | "plasma" | "rocket" | "bullet" | "soul"
  // Order & Chaos: a spinning rune-hammer, a spirit crescent (a thrown chakram), a bouncing softball, kunai.
  | "hammer" | "crescent" | "ball" | "kunai";

/** Thrown weapons that tumble end over end in flight (drawn spinning). */
export const SPINNING: ReadonlySet<ProjectileKind> = new Set(["hammer", "crescent"]);

/** Projectiles made of fire (burn deaths, the Orb of Tempestuous Fire). */
export const FIRE_SHOTS: ReadonlySet<ProjectileKind> = new Set(["fireball", "hellfire", "rocket"]);

/** Lobbed projectiles arc over walls and shields. */
export const LOBBED: ReadonlySet<ProjectileKind> = new Set(["fireball", "cloud", "boulder"]);

export type ShotDef = {
  projectile: ProjectileKind;
  dmg: number;
  /** Ticks between volleys. */
  every: number;
  /** Ticks from the start of the shoot animation to the release. */
  windup: number;
  /** Tiles ahead it can see (the lawn is 9 tiles). */
  range: number;
  /** Extra shots in the volley, 5 ticks apart. */
  volley?: number;
  lob?: boolean;
  lanes?: 1 | 3;
  chill?: boolean;
  /** Every Nth shot freezes the target solid for 2 s. */
  freezeEvery?: number;
  /** Straight shots pass through this many foes. */
  pierce?: number;
  /** Lob splash to other foes within 1 tile in the 3 lanes around the hit (straight shots: the blast of the first hit). */
  splash?: number;
  /** Shot already burning (a Fire Elemental does not double it again). */
  ignited?: boolean;
  /** Lobs that smash shields outright. */
  shatter?: boolean;
  /** Death cloud: undead are immune. */
  cloud?: boolean;
  /** Hero mana gained per hit. */
  manaOnHit?: number;
  /** Order & Chaos: every `every`th shot deals `mult` times the damage. */
  crit?: { every: number; mult: number };
  /** A hit hops on to the nearest other foe within 1.6 tiles (`jumps` times, damage x`falloff` per hop). */
  chain?: { jumps: number; falloff: number };
  /** Straight shots that also strike flying foes. */
  air?: boolean;
  /** Lobs: every `every`th one stuns its target for `dur` ticks. */
  stunEvery?: { every: number; dur: number };
  /** Order & Chaos: also shoots behind it (straight shots) when a foe is there. */
  back?: boolean;
  /** Straight shots fly out to the end of their range and come back, striking again on the way home. */
  boomerang?: boolean;
  /** Double damage to the undead. */
  holy?: boolean;
  /** Straight shots that run beneath shields (a shield soaks none of it). */
  underShield?: boolean;
  /** Order & Chaos: straight shots knock the foe they strike this many tiles back (not bosses or the anchored). */
  push?: number;
  /** Order & Chaos: shots that leave already burning (`ignited`) also scorch the foes beside the target for this share. */
  burnSplash?: number;
  /** Order & Chaos: straight shots stun each foe they strike this many ticks (not the stun-immune or bosses). */
  stun?: number;
  /** Order & Chaos: a shot that bounces from foe to foe along the lane (drawn hopping; `pierce` sets how many it strikes). */
  hop?: boolean;
  /** Order & Chaos (Summoning Portal, Astral Spirit): straight shots leave each foe they strike Exposed this many ticks — it takes EXPOSE_MULT damage from everything (a shield takes it). */
  expose?: number;
};

/** Order & Chaos: an Exposed foe (Astral Spirit) takes this much damage from everything. */
export const EXPOSE_MULT = 1.25;
/** Order & Chaos: a troop Corroded by a Rust Dragon's acid takes this much damage from everything. */
export const CORRODE_MULT = 1.5;

/**
 * Order & Chaos: what a unit does when the player drops a Surge orb on it
 * (the mode's power-up). Every Lawful unit has its own.
 */
export type SurgeDef =
  | { kind: "gold"; coins: number; value: number }
  | { kind: "audit"; bonus: number }
  | { kind: "rainbow"; coins: number; value: number }
  | { kind: "mana" }
  | { kind: "storm"; shots: number; gap: number; dmg: number; lanes: 1 | 3; back?: boolean }
  | { kind: "freeze-lane"; dur: number; dmg: number }
  | { kind: "chain"; hops: number; dmg: number }
  | { kind: "rockfall"; count: number; dmg: number }
  | { kind: "headshot"; count: number; dmg: number }
  | { kind: "cluster"; count: number; dmg: number }
  | { kind: "smite"; dmg: number }
  | { kind: "bolts"; count: number; dmg: number }
  | { kind: "broadside"; dmg: number }
  | { kind: "beam" }
  | { kind: "plate"; amount: number }
  | { kind: "stomp"; dur: number; dmg: number }
  | { kind: "phalanx"; life: number }
  | { kind: "charge"; dmg: number }
  | { kind: "rampage"; dmg: number }
  | { kind: "sanctuary"; dur: number }
  | { kind: "mass-heal"; amount: number }
  | { kind: "mass-slow"; dur: number }
  | { kind: "resurrect-all" }
  | { kind: "stare"; bossDmg: number }
  | { kind: "meteors"; count: number; dmg: number }
  | { kind: "supernova"; dmg: number }
  | { kind: "tempest"; push: number }
  | { kind: "quake"; dmg: number }
  | { kind: "tide"; amount: number }
  | { kind: "fire-lane"; dmg: number }
  | { kind: "rearm" }
  | { kind: "hospital" }
  | { kind: "reload" }
  | { kind: "overload"; dmg: number }
  | { kind: "air-raid"; dmg: number }
  | { kind: "whirl"; dmg: number; dur: number }
  | { kind: "skyfall"; dmg: number }
  | { kind: "roots"; dur: number; reach: number }
  | { kind: "blizzard"; dur: number; dmg: number }
  | { kind: "minefield" }
  | { kind: "scatter"; dur: number }
  | { kind: "magnetize" }
  | { kind: "feast"; count: number; reach: number }
  | { kind: "charm"; count: number }
  | { kind: "dome"; dur: number }
  | { kind: "herd"; shell: number }
  | { kind: "war-party"; dmg: number }
  // Order & Chaos content pass.
  | { kind: "shockwave"; push: number; dur: number; reach: number }
  | { kind: "fan"; shots: number; dmg: number }
  | { kind: "hail"; count: number; dmg: number; freeze: number }
  | { kind: "radiance"; dmg: number; heal: number }
  | { kind: "miasma"; dps: number; dur: number; reach: number }
  | { kind: "embrace"; count: number; reach: number }
  | { kind: "overclock"; dmg: number }
  | { kind: "stampede"; count: number }
  | { kind: "iai"; dmg: number; reach: number };

export type MeleeDef = {
  dmg: number;
  every: number;
  reach: number;
  /** Only foes ahead (towards the enemy side). */
  front?: boolean;
  /** Also strikes the two neighbouring lanes. */
  lanes?: 1 | 3;
  /** Strikes only the nearest foe. */
  single?: boolean;
  stun?: { chance: number; dur: number };
  poison?: { dps: number; dur: number };
  /** Heals itself for this share of the damage. */
  drain?: number;
  /** Every Nth strike deals triple damage. */
  blow?: number;
  /** Strips shields and hastes. */
  dispel?: boolean;
  /** Chills the struck foe for this many ticks. */
  chill?: number;
  /** Double damage to cavalry (pikes). */
  antiCavalry?: boolean;
  /** Order & Chaos: also strikes flyers passing over its tile. */
  air?: boolean;
  /** How the strike reads on screen (the reach, lanes and `front` set what it hits): a sweeping arc over the tile ahead and its diagonals, a whirlwind over all eight tiles around, or a long thrust down the lane. */
  pattern?: "arc" | "whirl" | "line";
};

export type DefDef = {
  kind: DefKind;
  name: string;
  faction: Faction | "neutral" | OcSide;
  sprite: string;
  hp: number;
  blurb: string;
  /** Base units are cards; upgrades and fusions are not. */
  card?: { cost: number; recharge: number; stage: number };
  shot?: ShotDef;
  /** `value` 0 = mana only (no coin). `grow`: each payout is `step` larger than the last, up to `max`. `orb`: each payout drops an Order & Chaos Surge orb. */
  produce?: { value: number; every: number; first: [number, number]; luck?: number; mana?: number; grow?: { step: number; max: number }; orb?: boolean };
  upgrade?: { to: DefKind; cost: number };
  tall?: boolean;
  gaze?: { front: number; back: number; recover: number; bossDmg: number };
  melee?: MeleeDef;
  heal?: { amount: number; every: number };
  lightning?: { dmg: number; every: number };
  ignite?: { splash: number };
  stoneShot?: { every: number; range: number; bossDmg: number };
  deathBlast?: number;
  /** Damage dealt back to every biter. */
  thorns?: number;
  /** Biters are chilled for this many ticks. */
  chillBiters?: number;
  /** Neighbours (3x3) act this much faster. */
  aura?: number;
  /** Foes within `range` ahead in its lane are chilled while it stands. */
  fear?: { range: number };
  slowCast?: { every: number; count: number; lanes: 1 | 3; dur: number };
  resurrect?: { every: number };
  banish?: { every: number; range: number; dmg: number };
  /** Foes slain in its 3x3 rise as this defender (at most once per `every`). */
  raise?: { every: number; kind: DefKind };
  rebirth?: boolean;
  /** Multiplier on spell and death-cloud damage taken (0 = immune). */
  magicResist?: number;
  undead?: boolean;
  scale?: number;
  fusion?: boolean;
  /** Spectre: ranged attackers cannot see it (they walk past to shoot what stands behind; their shots pass through it). */
  veiled?: boolean;
  /** Pain Elemental: when destroyed, releases this many Lost Souls charging down its lane and the neighbouring ones. */
  deathSouls?: number;
  /** Arch-vile: every `every` ticks engulfs the healthiest foe within `range` ahead in its lane (ignores shields and armour). */
  flame?: { every: number; range: number; dmg: number };

  // --- Order & Chaos ----------------------------------------------------------
  /** What a Surge orb dropped on it does. */
  surge?: SurgeDef;
  /** A buried charge: arms after `arm` ticks, then the first foe on it sets off `dmg` within `radius` (lies flat like a Land Mine). `wide`: the blast reaches the lanes beside it too; `freeze`: every foe it catches is frozen solid that many ticks. */
  trap?: { arm: number; dmg: number; radius: number; wide?: boolean; freeze?: number };
  /** Ground spikes: never blocks and is never shot at; every `every` ticks hurts each foe walking over its tile (and wears down by the same). */
  spikes?: { dmg: number; every: number };
  /** Acts once `delay` ticks after it is placed, then is gone. */
  instant?: { kind: "immolate" | "storm" | "frost" | "doom"; delay: number; dmg: number; freeze?: number };
  /** Shoots the bulkiest foe in its lane, anywhere on the lawn (through armour, at flyers too). */
  snipe?: { dmg: number; every: number };
  /** Planes bomb a random foe anywhere on the lawn (flyers too); `splash` = share dealt to foes within a tile. */
  airstrike?: { dmg: number; every: number; splash: number };
  /** Charges while a foe is in its lane, then a beam hits every foe ahead in the lane. */
  beam?: { charge: number; dmg: number };
  /** Each foe its melee slays makes it strike `per` faster, up to `max` times. */
  zeal?: { per: number; max: number };
  /** Every `every` ticks leaps on the nearest foe within `range` ahead. */
  pounce?: { dmg: number; every: number; range: number };
  /** Defenders in its 3x3 (itself included) take this share less damage. */
  ward?: number;
  /** Heals every defender in its lane. */
  laneHeal?: { amount: number; every: number };
  /** Casts a random bolt (frost, fire or lightning) at the nearest foe in its lane. */
  caster?: { dmg: number; every: number };
  /** Burns every foe within `reach` in front of it. */
  burnAura?: { dmg: number; every: number; reach: number };
  /** Blows foes in its lane back `push` tiles; flying foes are blown off the field. */
  gust?: { every: number; push: number; range: number };
  /** Wraps an unshielded neighbour (3x3) in a shell of `amount`. */
  shellGift?: { amount: number; every: number };
  /** Shooters in its 3x3 fire this many extra shots per volley. */
  ammo?: number;
  /** Lightning that leaps from the nearest foe in its lane to `jumps` more nearby foes. */
  chainLightning?: { dmg: number; every: number; jumps: number };
  /** A foe slain in its lane or the neighbouring ones has `chance` to drop `value` gold. */
  luckyKills?: { chance: number; value: number };
  /** Order & Chaos Gold Golem: sheds a coin of `value` gold for every `every` damage it takes. */
  nuggets?: { every: number; value: number };
  /** Order & Chaos: lays a Land Mine on an empty tile up to `reach` tiles ahead (at most `max` of its own at once). */
  mineLayer?: { every: number; reach: number; max: number };
  /** Order & Chaos: cannot be stunned, cursed, webbed or turned to stone. */
  steadfast?: boolean;
  /** Order & Chaos: every foe that bites it is bewildered into a neighbouring lane (slowed for `slow` ticks). */
  divert?: { slow: number };
  /** Order & Chaos: every `every` ticks pulls the helm, armour or shield off the nearest armoured foe within `range` tiles (its lane and both beside it). */
  magnet?: { every: number; range: number };
  /** Order & Chaos: swallows the nearest foe within `reach` ahead whole (bulk up to `cap`), then digests for `digest` ticks; bigger foes and bosses take `bite`. */
  devour?: { reach: number; cap: number; digest: number; bite: number };
  /** Order & Chaos: the first foe to bite it is charmed and fights for Order (`mult`: its strikes, and it is healed in full when above 1). `uses`: how many biters it charms before it is spent (default 1). */
  charm?: { mult: number; uses?: number };
  /** Order & Chaos Psychic Elemental: every `every` ticks it hypnotizes the nearest foe ahead in its lane within `range` tiles costing at most `maxCost` (no boss, smasher, structure or flyer): it turns and fights for Order (as a charm). */
  hypnosis?: { every: number; range: number; maxCost: number };
  /** Order & Chaos: when a foe comes within `near` tiles in front, it falls back a tile (if free); `every` ticks between retreats. */
  kite?: { near: number; every: number };
  /** Order & Chaos umbrella: it and every troop within `reach` tiles (1 = its 3x3) are shielded from lobbed shots and from attacks out of the sky (dives, spits, breaths, snatches). */
  aegis?: { reach: number };
  /** Order & Chaos lure: Chaos walkers in the two neighbouring lanes that come within `reach` tiles (x) of it swerve into its lane to attack it. */
  lure?: { reach: number };
  /** Order & Chaos: once below `below` of its health it charges down its lane (`dmg` to every foe it tramples) and leaves the lawn. */
  lastCharge?: { below: number; dmg: number };
  /** Order & Chaos battlefield (order-chaos/field.ts): a landmark the level places (never dismissed, snatched, hexed or counted as a lost troop). */
  landmark?: string;
  /** Order & Chaos battlefield: planted on a grave or crypt, it eats it in this many ticks, then leaves (Rooting Boar). */
  eatTomb?: { grave: number; crypt: number };
  /** Order & Chaos battlefield: lights its lane and both beside it through fog. */
  light?: boolean;
  /** Order & Chaos battlefield: stands in open water without a raft (see also field.ts AQUATIC). */
  aquatic?: boolean;
  /** Order & Chaos: a night creature — awake in night battles; by day it sleeps (does nothing) until given a Wake-Up Brew. */
  nocturnal?: boolean;
  // --- Order & Chaos content pass ---------------------------------------------
  /** Stone Gargoyle (PvZ's Squash): waits on its tile until a foe comes within `reach` tiles ahead (or half a tile behind), drops on it — `dmg` to every foe within `radius` of where it lands (`radius` >= 1: the lanes beside too; `fire`: a fire blast) — and is gone. */
  leap?: { reach: number; dmg: number; radius: number; fire?: boolean };
  /** Nix Warrior (Chard Guard): shield-bashes the first `charges` foes that bite it `push` tiles back down the lane, stunned `stun` ticks; a spent bash comes back every `regrow` ticks. */
  repel?: { push: number; stun: number; charges: number; regrow: number };
  /** Gunslinger: every `every` ticks fans `shots` quick shots (`dmg` each) at the nearest foe in its lane or the two beside it — flyers too. */
  quickdraw?: { dmg: number; every: number; shots: number };
  /** Rafflesia (Gloom-shroom): every `every` ticks her stench hurts every foe within `reach` tiles of her, in her lane and both beside it, front and back. */
  gas?: { dmg: number; every: number; reach: number };
  /** Iron Maiden: the foe that bites her is shut inside (toughness up to `cap`: gone for good; bigger ones and bosses take `bite`); she opens again after `reset` ticks. */
  maw?: { cap: number; bite: number; reset: number };
  /** Rin: every `every` ticks while a foe is in her lane, lets loose `count` of `kind` (a Lawful ally that brawls the horde) down her lane. */
  allies?: { kind: EnemyKind; every: number; count: number };
  /** A band (Wood Elf Band): the same packet dropped on it adds a member, up to `max`; every member adds the unit's health and one more shot to each volley. Regrouping costs `step` gold more per member already there. */
  band?: { max: number; step: number };
  /** Yeti Warden: every foe that bites it is frozen solid this many ticks. */
  freezeBiters?: number;
  /** Keeps the troops in its 3x3 warm: a Jotunn Frostcaller's ice can't hold them (burning auras and fire-lit troops do too). */
  warm?: boolean;
  /** Royal Griffin (unlimited retaliation): every foe that bites it or a troop in its 3x3 is clawed for this much. */
  retaliate?: number;
  /** Rolling Armadillo (wall-nut bowling): rolls from its tile down the lane, `dmg` to each foe it hits; with `bounces` left it glances into a neighbouring lane after each hit. */
  bowl?: { dmg: number; bounces: number };
  /** A conveyor-only special: it only ever arrives on a caravan belt (never recruited). */
  conveyor?: boolean;
  /** Iai dash: every `every` ticks, when a foe is within `reach` tiles ahead in its lane, it dashes down the lane slashing every foe it passes (`dmg`), then dashes back to its tile. */
  dash?: { dmg: number; every: number; reach: number };
  /** Ground slam: every `every` ticks, when a foe is near, a shockwave hits every foe within `reach` tiles of it (its lane and both beside it, front and back) for `dmg` and stuns them `stun` ticks. */
  slam?: { dmg: number; every: number; reach: number; stun: number };
  // --- Order & Chaos Summoning Portal exclusives (./order-chaos/gacha-content.ts) ---
  /** Guardian Angel: when a troop in its 3×3 (itself too) takes a killing blow while this is ready, the blow is turned aside: the troop is left at `heal` of its health and can't be harmed for `ward` ticks; then it needs `every` ticks to be ready again (second timer). */
  guardian?: { every: number; heal: number; ward: number };
  /** Crystal Dragon: every `every` ticks seals the toughest foe within `range` tiles ahead (its lane and both beside it) in crystal for `dur` ticks — it cannot act — then the crystal shatters: `dmg` to it and `splash` of that to every other foe within a tile (second timer). Bosses aren't sealed: the shards strike them at once. */
  crystallize?: { every: number; range: number; dur: number; dmg: number; splash: number };
  /** Order & Chaos ascended form: the unit it reverts to when the Ascension ends. */
  ascendedFrom?: DefKind;
  /** Order & Chaos unit level (Barracks). `power` scales its Surge. */
  level?: number;
  power?: number;
};

const shot =(projectile: ProjectileKind, dmg: number, every: number, extra: Partial<ShotDef> = {}): ShotDef => ({
  projectile, dmg, every: sec(every), windup: 7, range: 9.6, ...extra
});
const card = (cost: number, recharge: number, stage: number) => ({ cost, recharge: sec(recharge), stage });
const taxes = (value: number, every: number, extra: { luck?: number; mana?: number } = {}) => ({
  value, every: sec(every), first: [sec(5), sec(11)] as [number, number], ...extra
});

const DEFENDER_LIST: DefDef[] = [
  // --- Castle ---------------------------------------------------------------
  { kind: "peasant", name: "Peasant", faction: "castle", sprite: "peasant", hp: 300, card: card(50, 7.5, 0),
    produce: taxes(25, 24), blurb: "Pays 25 gold in taxes every 24 s." },
  { kind: "archer", name: "Archer", faction: "castle", sprite: "archer", hp: 300, card: card(100, 7.5, 0),
    shot: shot("arrow", 20, 1.5), upgrade: { to: "marksman", cost: 125 }, blurb: "An arrow down its lane every 1.5 s." },
  { kind: "marksman", name: "Marksman", faction: "castle", sprite: "marksman", hp: 300,
    shot: shot("arrow", 20, 1.5, { volley: 1 }), blurb: "Crossbow volley: two bolts every 1.5 s." },
  { kind: "pikeman", name: "Pikeman", faction: "castle", sprite: "pikeman", hp: 1200, card: card(75, 15, 1),
    melee: { dmg: 30, every: sec(1), reach: 1.05, antiCavalry: true }, upgrade: { to: "halberdier", cost: 75 },
    blurb: "Pike wall: stabs every foe within a tile, front or back. Double damage to cavalry." },
  { kind: "halberdier", name: "Halberdier", faction: "castle", sprite: "halberdier", hp: 1600,
    melee: { dmg: 45, every: sec(1), reach: 1.1, antiCavalry: true }, blurb: "Tougher pike wall; the halberd hits for 45." },
  { kind: "griffin", name: "Griffin", faction: "castle", sprite: "griffin", hp: 1500, card: card(100, 20, 3),
    thorns: 30, upgrade: { to: "royal-griffin", cost: 100 }, blurb: "Retaliates against every bite for 30." },
  { kind: "royal-griffin", name: "Royal Griffin", faction: "castle", sprite: "royal-griffin", hp: 2000,
    thorns: 50, blurb: "Unlimited retaliation: 50 against every bite." },
  { kind: "swordsman", name: "Swordsman", faction: "castle", sprite: "swordsman", hp: 1000, card: card(125, 10, 7),
    melee: { dmg: 60, every: sec(1.5), reach: 1.1, front: true }, upgrade: { to: "crusader", cost: 100 },
    blurb: "Armoured blade: 60 to foes in front every 1.5 s." },
  { kind: "crusader", name: "Crusader", faction: "castle", sprite: "crusader", hp: 1200,
    melee: { dmg: 60, every: sec(0.75), reach: 1.1, front: true }, blurb: "Strikes twice as often." },
  { kind: "monk", name: "Monk", faction: "castle", sprite: "monk", hp: 300, card: card(200, 7.5, 5),
    shot: shot("holy", 20, 1.5, { windup: 8 }), heal: { amount: 150, every: sec(6) }, upgrade: { to: "zealot", cost: 150 },
    blurb: "Holy orbs (20); every 6 s heals the most wounded defender around it (itself included) for 150." },
  { kind: "zealot", name: "Zealot", faction: "castle", sprite: "zealot", hp: 300,
    shot: shot("holy", 30, 1.5, { windup: 8 }), heal: { amount: 250, every: sec(6) }, blurb: "Orbs of 30 and heals of 250." },
  { kind: "angel", name: "Angel", faction: "castle", sprite: "angel", hp: 1500, card: card(400, 30, 9),
    melee: { dmg: 60, every: sec(1), reach: 1.1, front: true }, aura: 0.25, upgrade: { to: "archangel", cost: 300 },
    blurb: "Holy blade (60) and a morale aura: neighbours act 25% faster." },
  { kind: "archangel", name: "Archangel", faction: "castle", sprite: "archangel", hp: 2000,
    melee: { dmg: 90, every: sec(1), reach: 1.1, front: true }, aura: 0.25, resurrect: { every: sec(40) },
    blurb: "Every 40 s resurrects the last fallen defender nearby at half health." },

  // --- Rampart --------------------------------------------------------------
  { kind: "leprechaun", name: "Leprechaun", faction: "rampart", sprite: "leprechaun", hp: 300, card: card(75, 7.5, 0),
    produce: taxes(25, 24, { luck: 0.3 }), blurb: "25 gold every 24 s — and a 30% lucky chance of 50." },
  { kind: "wood-elf", name: "Wood Elf", faction: "rampart", sprite: "wood-elf", hp: 300, card: card(125, 7.5, 0),
    shot: shot("arrow", 20, 1.2), upgrade: { to: "grand-elf", cost: 125 }, blurb: "Quick bow: an arrow every 1.2 s." },
  { kind: "grand-elf", name: "Grand Elf", faction: "rampart", sprite: "grand-elf", hp: 300,
    shot: shot("arrow", 20, 1.2, { volley: 1 }), blurb: "Shoots twice every 1.2 s." },
  { kind: "dwarf", name: "Dwarf", faction: "rampart", sprite: "dwarf", hp: 2500, card: card(75, 30, 1), magicResist: 0.5,
    upgrade: { to: "battle-dwarf", cost: 100 }, blurb: "Stubborn wall; spells and death clouds deal half." },
  { kind: "battle-dwarf", name: "Battle Dwarf", faction: "rampart", sprite: "battle-dwarf", hp: 3500, magicResist: 0.5,
    melee: { dmg: 20, every: sec(1), reach: 1.05, front: true }, blurb: "Bigger wall that swings its axe (20)." },
  { kind: "snow-elf", name: "Snow Elf", faction: "rampart", sprite: "snow-elf", hp: 300, card: card(175, 7.5, 3),
    shot: shot("frost", 20, 1.5, { chill: true }), blurb: "Frost spears chill: the target moves and bites at half speed for 10 s." },
  { kind: "dendroid-guard", name: "Dendroid Guard", faction: "rampart", sprite: "dendroid-guard", hp: 3000, card: card(125, 30, 5),
    fear: { range: 1.3 }, upgrade: { to: "dendroid-soldier", cost: 100 }, blurb: "Wall whose roots chill every foe within 1.3 tiles in front." },
  { kind: "dendroid-soldier", name: "Dendroid Soldier", faction: "rampart", sprite: "dendroid-soldier", hp: 4000,
    fear: { range: 1.8 }, blurb: "Roots reach 1.8 tiles." },
  { kind: "unicorn", name: "Unicorn", faction: "rampart", sprite: "unicorn", hp: 1000, card: card(200, 7.5, 7),
    melee: { dmg: 80, every: sec(1.5), reach: 1.1, front: true, stun: { chance: 0.25, dur: sec(3) } }, upgrade: { to: "war-unicorn", cost: 150 },
    blurb: "Horn strike (80); 25% chance to blind the foe for 3 s." },
  { kind: "war-unicorn", name: "War Unicorn", faction: "rampart", sprite: "war-unicorn", hp: 1300,
    melee: { dmg: 110, every: sec(1.5), reach: 1.1, front: true, stun: { chance: 0.35, dur: sec(3) } }, blurb: "110 per strike, 35% blind." },
  { kind: "green-dragon", name: "Green Dragon", faction: "rampart", sprite: "green-dragon", hp: 2000, card: card(450, 30, 9), scale: 0.8,
    melee: { dmg: 90, every: sec(2), reach: 2.2, front: true }, upgrade: { to: "gold-dragon", cost: 300 },
    blurb: "Breathes acid on everything up to 2.2 tiles ahead (90)." },
  { kind: "gold-dragon", name: "Gold Dragon", faction: "rampart", sprite: "gold-dragon", hp: 2600, scale: 0.8, magicResist: 0,
    melee: { dmg: 150, every: sec(2), reach: 2.2, front: true }, blurb: "150 breath; immune to spells and death clouds." },

  // --- Tower ----------------------------------------------------------------
  { kind: "gold-golem", name: "Gold Golem", faction: "tower", sprite: "gold-golem", hp: 1000, card: card(100, 7.5, 0),
    produce: taxes(25, 24), blurb: "A sturdy treasury: 25 gold every 24 s, 1000 HP." },
  { kind: "gremlin", name: "Gremlin", faction: "tower", sprite: "gremlin", hp: 300, card: card(25, 7.5, 0),
    melee: { dmg: 20, every: sec(1), reach: 1.05, front: true }, upgrade: { to: "master-gremlin", cost: 50 },
    blurb: "Cheap scrapper (20). Upgrade to throw balls and chains." },
  { kind: "master-gremlin", name: "Master Gremlin", faction: "tower", sprite: "master-gremlin", hp: 300,
    shot: shot("stone", 20, 1.5, { range: 5.5, windup: 6 }), blurb: "Throws 20 up to 5.5 tiles." },
  { kind: "stone-golem", name: "Stone Golem", faction: "tower", sprite: "stone-golem", hp: 4000, card: card(50, 30, 1), magicResist: 0.5,
    upgrade: { to: "iron-golem", cost: 125 }, blurb: "A wall of stone; spells deal half." },
  { kind: "iron-golem", name: "Iron Golem", faction: "tower", sprite: "iron-golem", hp: 8000, tall: true, magicResist: 0.5,
    blurb: "Twice as big, and too tall to be leapt." },
  { kind: "genie", name: "Genie", faction: "tower", sprite: "genie", hp: 400, card: card(175, 7.5, 3),
    slowCast: { every: sec(6), count: 2, lanes: 1, dur: sec(8) }, upgrade: { to: "master-genie", cost: 150 },
    blurb: "Every 6 s casts Slow on the two nearest foes in its lane." },
  { kind: "master-genie", name: "Master Genie", faction: "tower", sprite: "master-genie", hp: 500,
    slowCast: { every: sec(6), count: 3, lanes: 3, dur: sec(8) }, blurb: "Slows three foes across three lanes." },
  { kind: "mage", name: "Mage", faction: "tower", sprite: "mage", hp: 300, card: card(325, 7.5, 5),
    shot: shot("bolt", 20, 1.5, { windup: 8, lanes: 3 }), upgrade: { to: "arch-mage", cost: 150 },
    blurb: "Magic bolts down its own lane and both neighbours." },
  { kind: "arch-mage", name: "Arch Mage", faction: "tower", sprite: "arch-mage", hp: 300,
    shot: shot("bolt", 20, 1.5, { windup: 8, lanes: 3, pierce: 3 }), blurb: "Three-lane bolts that pierce three foes." },
  { kind: "naga", name: "Naga", faction: "tower", sprite: "naga", hp: 2000, card: card(175, 15, 7),
    melee: { dmg: 50, every: sec(1), reach: 1.1, front: true }, upgrade: { to: "naga-queen", cost: 125 }, blurb: "Six-armed guardian (50 per second)." },
  { kind: "naga-queen", name: "Naga Queen", faction: "tower", sprite: "naga-queen", hp: 2500,
    melee: { dmg: 80, every: sec(1), reach: 1.1, front: true }, blurb: "80 per second." },
  { kind: "giant", name: "Giant", faction: "tower", sprite: "giant", hp: 1500, card: card(250, 30, 9),
    melee: { dmg: 80, every: sec(1.5), reach: 1.1, front: true }, upgrade: { to: "titan", cost: 250 },
    blurb: "Big fists (80). Upgrade to a Titan that calls lightning." },
  { kind: "titan", name: "Titan", faction: "tower", sprite: "titan", hp: 2000,
    lightning: { dmg: 150, every: sec(3) }, blurb: "Lightning (150) on the foe closest to the gate anywhere in its lane — even behind it." },

  // --- Inferno --------------------------------------------------------------
  { kind: "imp", name: "Imp", faction: "inferno", sprite: "imp", hp: 200, card: card(50, 7.5, 0),
    produce: taxes(15, 15), upgrade: { to: "familiar", cost: 50 }, blurb: "Skims 15 gold every 15 s." },
  { kind: "familiar", name: "Familiar", faction: "inferno", sprite: "familiar", hp: 250,
    produce: taxes(25, 15, { mana: 1 }), blurb: "25 gold every 15 s, and each coin channels 1 mana." },
  { kind: "gog", name: "Gog", faction: "inferno", sprite: "gog", hp: 300, card: card(150, 7.5, 0),
    shot: shot("fireball", 40, 3, { windup: 8, lob: true }), upgrade: { to: "magog", cost: 150 },
    blurb: "Lobs fireballs (40) over walls and shields." },
  { kind: "magog", name: "Magog", faction: "inferno", sprite: "magog", hp: 300,
    shot: shot("fireball", 60, 3, { windup: 8, lob: true, splash: 30 }), blurb: "Fireballs burst: 60, plus 30 around (3 lanes)." },
  { kind: "demon", name: "Demon", faction: "inferno", sprite: "demon", hp: 1500, card: card(75, 20, 1),
    melee: { dmg: 30, every: sec(1), reach: 1.05, front: true }, upgrade: { to: "horned-demon", cost: 75 }, blurb: "A wall with teeth (30)." },
  { kind: "horned-demon", name: "Horned Demon", faction: "inferno", sprite: "horned-demon", hp: 2000,
    melee: { dmg: 45, every: sec(1), reach: 1.05, front: true }, blurb: "2000 HP, 45 per bite." },
  { kind: "hell-hound", name: "Hell Hound", faction: "inferno", sprite: "hell-hound", hp: 1000, card: card(150, 10, 3),
    melee: { dmg: 40, every: sec(1), reach: 1.1, front: true, lanes: 3 }, upgrade: { to: "cerberus", cost: 100 },
    blurb: "Bites the foe ahead in its lane AND both neighbouring lanes." },
  { kind: "cerberus", name: "Cerberus", faction: "inferno", sprite: "cerberus", hp: 1200,
    melee: { dmg: 60, every: sec(1), reach: 1.1, front: true, lanes: 3 }, blurb: "Three heads, three lanes, 60 each." },
  { kind: "efreet", name: "Efreet", faction: "inferno", sprite: "efreet", hp: 400, card: card(175, 7.5, 5),
    ignite: { splash: 0 }, thorns: 20, upgrade: { to: "efreet-sultan", cost: 150 },
    blurb: "Shots passing through its flames burn for double damage; biters take 20." },
  { kind: "efreet-sultan", name: "Efreet Sultan", faction: "inferno", sprite: "efreet-sultan", hp: 500,
    ignite: { splash: 0.5 }, thorns: 40, blurb: "Burning shots also splash half; fire shield 40." },
  { kind: "pit-fiend", name: "Pit Fiend", faction: "inferno", sprite: "pit-fiend", hp: 1000, card: card(250, 15, 7),
    melee: { dmg: 50, every: sec(1), reach: 1.1, front: true }, upgrade: { to: "pit-lord", cost: 200 }, blurb: "Brutal claws (50)." },
  { kind: "pit-lord", name: "Pit Lord", faction: "inferno", sprite: "pit-lord", hp: 1200,
    melee: { dmg: 60, every: sec(1), reach: 1.1, front: true }, raise: { every: sec(15), kind: "demon" },
    blurb: "A foe slain in its 3×3 rises as a Demon on your side (every 15 s)." },
  { kind: "devil", name: "Devil", faction: "inferno", sprite: "devil", hp: 800, card: card(300, 30, 9),
    banish: { every: sec(15), range: 5, dmg: 0 }, upgrade: { to: "arch-devil", cost: 200 },
    blurb: "Every 15 s banishes the nearest foe within 5 tiles back to the far edge." },
  { kind: "arch-devil", name: "Arch Devil", faction: "inferno", sprite: "arch-devil", hp: 1000,
    banish: { every: sec(10), range: 6, dmg: 100 }, blurb: "Banishes every 10 s and burns the victim for 100." },

  // --- Necropolis -----------------------------------------------------------
  { kind: "mummy", name: "Mummy", faction: "necropolis", sprite: "mummy", hp: 600, card: card(50, 7.5, 0), undead: true,
    produce: taxes(25, 24), blurb: "Guards tomb gold: 25 every 24 s." },
  { kind: "wight", name: "Wight", faction: "necropolis", sprite: "wight", hp: 300, card: card(100, 7.5, 0), undead: true,
    shot: shot("dark", 25, 1.5), upgrade: { to: "wraith", cost: 100 }, blurb: "Hurls soul bolts (25)." },
  { kind: "wraith", name: "Wraith", faction: "necropolis", sprite: "wraith", hp: 300, undead: true,
    shot: shot("dark", 30, 1.5, { manaOnHit: 0.25 }), blurb: "30 per bolt; every 4 hits drain 1 mana for your hero." },
  { kind: "walking-dead", name: "Walking Dead", faction: "necropolis", sprite: "walking-dead", hp: 2500, card: card(50, 30, 1), undead: true,
    chillBiters: sec(3), upgrade: { to: "zombie", cost: 75 }, blurb: "Plague wall: whoever bites it is sickened (chilled 3 s)." },
  { kind: "zombie", name: "Zombie", faction: "necropolis", sprite: "zombie", hp: 3500, undead: true, chillBiters: sec(3), blurb: "3500 HP of rot." },
  { kind: "skeleton", name: "Skeleton", faction: "necropolis", sprite: "skeleton", hp: 800, card: card(50, 10, 3), undead: true,
    melee: { dmg: 25, every: sec(1), reach: 1.05, front: true }, upgrade: { to: "skeleton-warrior", cost: 50 }, blurb: "Cheap bony blocker (25)." },
  { kind: "skeleton-warrior", name: "Skeleton Warrior", faction: "necropolis", sprite: "skeleton-warrior", hp: 1200, undead: true,
    melee: { dmg: 35, every: sec(1), reach: 1.05, front: true }, blurb: "1200 HP, 35 per blow." },
  { kind: "lich", name: "Lich", faction: "necropolis", sprite: "lich", hp: 300, card: card(200, 7.5, 5), undead: true,
    shot: shot("cloud", 40, 3, { windup: 8, lob: true, splash: 40, cloud: true }), upgrade: { to: "power-lich", cost: 150 },
    blurb: "Death clouds: 40 to every foe in a 3×3 area. The undead are not hurt — they are held (chilled 4 s) instead." },
  { kind: "power-lich", name: "Power Lich", faction: "necropolis", sprite: "power-lich", hp: 300, undead: true,
    shot: shot("cloud", 60, 3, { windup: 8, lob: true, splash: 60, cloud: true }), blurb: "Clouds of 60 (the undead are held instead)." },
  { kind: "vampire", name: "Vampire", faction: "necropolis", sprite: "vampire", hp: 800, card: card(175, 10, 7), undead: true,
    melee: { dmg: 40, every: sec(1), reach: 1.1, front: true, drain: 0.5 }, upgrade: { to: "vampire-lord", cost: 150 },
    blurb: "Bites for 40 and heals itself half of it." },
  { kind: "vampire-lord", name: "Vampire Lord", faction: "necropolis", sprite: "vampire-lord", hp: 1000, undead: true,
    melee: { dmg: 60, every: sec(1), reach: 1.1, front: true, drain: 1 }, blurb: "Drains everything it bites (60)." },
  { kind: "bone-dragon", name: "Bone Dragon", faction: "necropolis", sprite: "bone-dragon", hp: 2500, card: card(400, 30, 9), undead: true, scale: 0.8,
    fear: { range: 2.5 }, upgrade: { to: "ghost-dragon", cost: 250 }, blurb: "Terror: every foe within 2.5 tiles ahead is chilled." },
  { kind: "ghost-dragon", name: "Ghost Dragon", faction: "necropolis", sprite: "ghost-dragon", hp: 3000, undead: true, scale: 0.8,
    fear: { range: 3 }, melee: { dmg: 80, every: sec(2), reach: 1.2, front: true }, blurb: "Terror to 3 tiles and a withering bite (80)." },

  // --- Dungeon --------------------------------------------------------------
  { kind: "troglodyte", name: "Troglodyte", faction: "dungeon", sprite: "troglodyte", hp: 300, card: card(50, 7.5, 0),
    produce: taxes(25, 24), upgrade: { to: "infernal-troglodyte", cost: 25 }, blurb: "Digs 25 gold every 24 s." },
  { kind: "infernal-troglodyte", name: "Infernal Troglodyte", faction: "dungeon", sprite: "infernal-troglodyte", hp: 400,
    produce: taxes(25, 20), blurb: "Digs faster: every 20 s." },
  { kind: "beholder", name: "Beholder", faction: "dungeon", sprite: "beholder", hp: 300, card: card(150, 7.5, 0),
    shot: shot("bolt", 20, 1.5, { pierce: 2 }), upgrade: { to: "evil-eye", cost: 100 }, blurb: "Gaze beams pierce two foes (20)." },
  { kind: "evil-eye", name: "Evil Eye", faction: "dungeon", sprite: "evil-eye", hp: 300,
    shot: shot("bolt", 30, 1.5, { pierce: 2 }), blurb: "30 per beam." },
  { kind: "harpy", name: "Harpy", faction: "dungeon", sprite: "harpy", hp: 400, card: card(100, 7.5, 1),
    melee: { dmg: 35, every: sec(2), reach: 3, front: true, single: true }, upgrade: { to: "harpy-hag", cost: 75 },
    blurb: "Swoops on the nearest foe up to 3 tiles ahead and flies back (35)." },
  { kind: "harpy-hag", name: "Harpy Hag", faction: "dungeon", sprite: "harpy-hag", hp: 450,
    melee: { dmg: 50, every: sec(2), reach: 3, front: true, single: true }, blurb: "50 per swoop." },
  { kind: "minotaur", name: "Minotaur", faction: "dungeon", sprite: "minotaur", hp: 1800, card: card(150, 20, 3),
    melee: { dmg: 60, every: sec(1.2), reach: 1.1, front: true }, upgrade: { to: "minotaur-king", cost: 100 }, blurb: "Axe wall (60)." },
  { kind: "minotaur-king", name: "Minotaur King", faction: "dungeon", sprite: "minotaur-king", hp: 2200,
    melee: { dmg: 60, every: sec(0.6), reach: 1.1, front: true }, blurb: "High morale: swings twice as often." },
  { kind: "medusa", name: "Medusa", faction: "dungeon", sprite: "medusa", hp: 300, card: card(175, 7.5, 5),
    shot: shot("arrow", 20, 1.5), stoneShot: { every: sec(15), range: 5, bossDmg: 300 }, upgrade: { to: "medusa-queen", cost: 125 },
    blurb: "Arrows (20) and every 15 s a petrifying shot within 5 tiles." },
  { kind: "medusa-queen", name: "Medusa Queen", faction: "dungeon", sprite: "medusa-queen", hp: 300,
    shot: shot("arrow", 25, 1.5), stoneShot: { every: sec(10), range: 7, bossDmg: 400 }, blurb: "Petrifies every 10 s within 7 tiles." },
  { kind: "manticore", name: "Manticore", faction: "dungeon", sprite: "manticore", hp: 1000, card: card(200, 10, 7),
    melee: { dmg: 50, every: sec(1.5), reach: 1.1, front: true }, upgrade: { to: "scorpicore", cost: 125 }, blurb: "Claws and tail (50)." },
  { kind: "scorpicore", name: "Scorpicore", faction: "dungeon", sprite: "scorpicore", hp: 1200,
    melee: { dmg: 60, every: sec(1.5), reach: 1.1, front: true, stun: { chance: 0.3, dur: sec(3) } }, blurb: "30% chance to paralyse for 3 s." },
  { kind: "red-dragon", name: "Red Dragon", faction: "dungeon", sprite: "red-dragon", hp: 2200, card: card(450, 30, 9), scale: 0.8,
    melee: { dmg: 100, every: sec(2), reach: 2.2, front: true }, upgrade: { to: "black-dragon", cost: 300 },
    blurb: "Fire breath on everything 2.2 tiles ahead (100)." },
  { kind: "black-dragon", name: "Black Dragon", faction: "dungeon", sprite: "black-dragon", hp: 2800, scale: 0.8, magicResist: 0,
    melee: { dmg: 150, every: sec(2), reach: 2.2, front: true }, blurb: "150 breath; immune to spells and death clouds." },

  // --- Stronghold -----------------------------------------------------------
  { kind: "goblin", name: "Goblin", faction: "stronghold", sprite: "goblin", hp: 150, card: card(25, 7.5, 0),
    produce: taxes(25, 24), upgrade: { to: "hobgoblin", cost: 25 }, blurb: "Loots 25 gold every 24 s. Dirt cheap, very fragile." },
  { kind: "hobgoblin", name: "Hobgoblin", faction: "stronghold", sprite: "hobgoblin", hp: 400, produce: taxes(25, 24), blurb: "A goblin that survives a bite or two." },
  { kind: "orc", name: "Orc", faction: "stronghold", sprite: "orc", hp: 300, card: card(125, 7.5, 0),
    shot: shot("axe", 25, 1.6), upgrade: { to: "orc-chieftain", cost: 100 }, blurb: "Throws axes (25)." },
  { kind: "orc-chieftain", name: "Orc Chieftain", faction: "stronghold", sprite: "orc-chieftain", hp: 350,
    shot: shot("axe", 35, 1.6), blurb: "35 per axe." },
  { kind: "ogre", name: "Ogre", faction: "stronghold", sprite: "ogre", hp: 2500, card: card(125, 30, 1),
    melee: { dmg: 40, every: sec(1.5), reach: 1.1, front: true }, upgrade: { to: "ogre-mage", cost: 150 }, blurb: "Club-swinging wall (40)." },
  { kind: "ogre-mage", name: "Ogre Mage", faction: "stronghold", sprite: "ogre-mage", hp: 2500, aura: 0.25,
    melee: { dmg: 40, every: sec(1.5), reach: 1.1, front: true }, blurb: "Bloodlust: neighbours act 25% faster." },
  { kind: "cyclops", name: "Cyclops", faction: "stronghold", sprite: "cyclops", hp: 400, card: card(250, 7.5, 3),
    shot: shot("boulder", 80, 4, { windup: 9, lob: true, shatter: true }), upgrade: { to: "cyclops-king", cost: 150 },
    blurb: "Lobs boulders (80) that smash shields outright." },
  { kind: "cyclops-king", name: "Cyclops King", faction: "stronghold", sprite: "cyclops-king", hp: 450,
    shot: shot("boulder", 120, 4, { windup: 9, lob: true, shatter: true, splash: 40 }), blurb: "120, plus 40 around the impact." },
  { kind: "roc", name: "Roc", faction: "stronghold", sprite: "roc", hp: 800, card: card(200, 7.5, 5), scale: 0.85,
    melee: { dmg: 60, every: sec(2), reach: 3, front: true, single: true }, upgrade: { to: "thunderbird", cost: 150 },
    blurb: "Swoops on the nearest foe up to 3 tiles ahead (60)." },
  { kind: "thunderbird", name: "Thunderbird", faction: "stronghold", sprite: "thunderbird", hp: 900, scale: 0.85,
    melee: { dmg: 80, every: sec(2), reach: 3, front: true, single: true, stun: { chance: 0.25, dur: sec(2) } }, blurb: "80 and a 25% thunderclap stun." },
  { kind: "wolf-rider", name: "Wolf Rider", faction: "stronghold", sprite: "wolf-rider", hp: 800, card: card(100, 10, 7),
    melee: { dmg: 30, every: sec(0.7), reach: 1.1, front: true }, upgrade: { to: "wolf-raider", cost: 75 }, blurb: "Snapping jaws (30, fast)." },
  { kind: "wolf-raider", name: "Wolf Raider", faction: "stronghold", sprite: "wolf-raider", hp: 900,
    melee: { dmg: 30, every: sec(0.35), reach: 1.1, front: true }, blurb: "Double attack: bites twice as often." },
  { kind: "behemoth", name: "Behemoth", faction: "stronghold", sprite: "behemoth", hp: 2500, card: card(350, 30, 9),
    melee: { dmg: 150, every: sec(2.5), reach: 1.15, front: true }, upgrade: { to: "ancient-behemoth", cost: 250 }, blurb: "Rends the foe in front (150)." },
  { kind: "ancient-behemoth", name: "Ancient Behemoth", faction: "stronghold", sprite: "ancient-behemoth", hp: 3200,
    melee: { dmg: 250, every: sec(2.5), reach: 1.15, front: true, dispel: true }, blurb: "250, and its claws tear shields apart." },

  // --- Fortress -------------------------------------------------------------
  { kind: "gnoll", name: "Gnoll", faction: "fortress", sprite: "gnoll", hp: 400, card: card(50, 7.5, 0),
    produce: taxes(25, 24), upgrade: { to: "gnoll-marauder", cost: 25 }, blurb: "Scavenges 25 gold every 24 s." },
  { kind: "gnoll-marauder", name: "Gnoll Marauder", faction: "fortress", sprite: "gnoll-marauder", hp: 700, produce: taxes(25, 24), blurb: "Tougher scavenger (700 HP)." },
  { kind: "lizardman", name: "Lizardman", faction: "fortress", sprite: "lizardman", hp: 300, card: card(125, 7.5, 0),
    shot: shot("arrow", 20, 1.4), upgrade: { to: "lizard-warrior", cost: 100 }, blurb: "Arrows every 1.4 s." },
  { kind: "lizard-warrior", name: "Lizard Warrior", faction: "fortress", sprite: "lizard-warrior", hp: 350,
    shot: shot("arrow", 30, 1.4), blurb: "30 per arrow." },
  { kind: "gorgon", name: "Gorgon", faction: "fortress", sprite: "gorgon", hp: 3000, card: card(100, 30, 1),
    melee: { dmg: 40, every: sec(1.5), reach: 1.1, front: true }, upgrade: { to: "mighty-gorgon", cost: 150 }, blurb: "Armoured bull wall (40)." },
  { kind: "mighty-gorgon", name: "Mighty Gorgon", faction: "fortress", sprite: "mighty-gorgon", hp: 3500,
    melee: { dmg: 40, every: sec(1.5), reach: 1.1, front: true }, stoneShot: { every: sec(12), range: 1.5, bossDmg: 300 },
    blurb: "Death Stare every 12 s kills the foe right in front." },
  { kind: "serpent-fly", name: "Serpent Fly", faction: "fortress", sprite: "serpent-fly", hp: 300, card: card(100, 7.5, 3),
    melee: { dmg: 15, every: sec(1.5), reach: 3, front: true, single: true, dispel: true }, upgrade: { to: "dragon-fly", cost: 75 },
    blurb: "Darts 3 tiles to sting (15) — the sting strips shields." },
  { kind: "dragon-fly", name: "Dragon Fly", faction: "fortress", sprite: "dragon-fly", hp: 350,
    melee: { dmg: 25, every: sec(1.5), reach: 3, front: true, single: true, dispel: true, chill: sec(6) }, blurb: "Also chills for 6 s." },
  { kind: "basilisk", name: "Basilisk", faction: "fortress", sprite: "basilisk", hp: 300, card: card(150, 7.5, 5),
    gaze: { front: 1.6, back: 0.8, recover: sec(30), bossDmg: 500 }, upgrade: { to: "greater-basilisk", cost: 100 },
    blurb: "Petrifying gaze kills the nearest foe within 1.6 tiles, then rests 30 s." },
  { kind: "greater-basilisk", name: "Greater Basilisk", faction: "fortress", sprite: "greater-basilisk", hp: 300,
    gaze: { front: 2.2, back: 1, recover: sec(18), bossDmg: 700 }, blurb: "Gaze to 2.2 tiles, rests only 18 s." },
  { kind: "wyvern", name: "Wyvern", faction: "fortress", sprite: "wyvern", hp: 1200, card: card(200, 10, 7),
    melee: { dmg: 50, every: sec(1.5), reach: 1.1, front: true }, upgrade: { to: "wyvern-monarch", cost: 125 }, blurb: "Tail and claws (50)." },
  { kind: "wyvern-monarch", name: "Wyvern Monarch", faction: "fortress", sprite: "wyvern-monarch", hp: 1400,
    melee: { dmg: 60, every: sec(1.5), reach: 1.1, front: true, poison: { dps: 15, dur: sec(8) } }, blurb: "Poison: 15 per second for 8 s." },
  { kind: "hydra", name: "Hydra", faction: "fortress", sprite: "hydra", hp: 2000, card: card(350, 30, 9),
    melee: { dmg: 60, every: sec(1.5), reach: 1.1, lanes: 3 }, upgrade: { to: "chaos-hydra", cost: 200 },
    blurb: "Every head bites: all foes within a tile, front or back, in three lanes (60)." },
  { kind: "chaos-hydra", name: "Chaos Hydra", faction: "fortress", sprite: "chaos-hydra", hp: 2600,
    melee: { dmg: 90, every: sec(1.5), reach: 1.1, lanes: 3 }, blurb: "90 per head." },

  // --- Conflux --------------------------------------------------------------
  { kind: "pixie", name: "Pixie", faction: "conflux", sprite: "pixie", hp: 200, card: card(50, 7.5, 0),
    produce: taxes(25, 24, { mana: 1 }), upgrade: { to: "sprite", cost: 50 }, blurb: "25 gold every 24 s; each coin also brings 1 mana." },
  { kind: "sprite", name: "Sprite", faction: "conflux", sprite: "sprite", hp: 250, produce: taxes(25, 18, { mana: 1 }), blurb: "Every 18 s." },
  { kind: "storm-elemental", name: "Storm Elemental", faction: "conflux", sprite: "storm-elemental", hp: 300, card: card(125, 7.5, 0),
    shot: shot("lightning", 20, 1.5, { pierce: 2 }), blurb: "Crackling bolts pierce two foes (20)." },
  { kind: "earth-elemental", name: "Earth Elemental", faction: "conflux", sprite: "earth-elemental", hp: 3500, card: card(50, 30, 1), magicResist: 0.5,
    upgrade: { to: "magma-elemental", cost: 150 }, blurb: "Living rock wall; spells deal half." },
  { kind: "magma-elemental", name: "Magma Elemental", faction: "conflux", sprite: "magma-elemental", hp: 5000, magicResist: 0.5,
    thorns: 30, blurb: "5000 HP of lava that burns biters (30)." },
  { kind: "ice-elemental", name: "Ice Elemental", faction: "conflux", sprite: "ice-elemental", hp: 300, card: card(200, 7.5, 3),
    shot: shot("frost", 20, 1.5, { chill: true, freezeEvery: 4 }), blurb: "Frost bolts chill; every 4th freezes solid for 2 s." },
  { kind: "fire-elemental", name: "Fire Elemental", faction: "conflux", sprite: "fire-elemental", hp: 300, card: card(175, 7.5, 5),
    ignite: { splash: 0 }, upgrade: { to: "energy-elemental", cost: 150 },
    blurb: "Arrows, stones and bolts passing through its flames burn for double damage. Frost is thawed." },
  { kind: "energy-elemental", name: "Energy Elemental", faction: "conflux", sprite: "energy-elemental", hp: 300,
    ignite: { splash: 0.5 }, blurb: "Burning shots also splash half their damage." },
  { kind: "psychic-elemental", name: "Psychic Elemental", faction: "conflux", sprite: "psychic-elemental", hp: 1200, card: card(300, 15, 7),
    melee: { dmg: 50, every: sec(1.5), reach: 1.1, lanes: 3 }, upgrade: { to: "magic-elemental", cost: 200 },
    blurb: "Mind blast hits every foe within a tile in three lanes (50)." },
  { kind: "magic-elemental", name: "Magic Elemental", faction: "conflux", sprite: "magic-elemental", hp: 1500, magicResist: 0,
    melee: { dmg: 80, every: sec(1.5), reach: 1.1, lanes: 3 }, blurb: "80, and immune to spells." },
  { kind: "firebird", name: "Firebird", faction: "conflux", sprite: "firebird", hp: 1200, card: card(350, 30, 9), scale: 0.8,
    melee: { dmg: 70, every: sec(2), reach: 2, front: true }, upgrade: { to: "phoenix", cost: 250 }, blurb: "Flame breath 2 tiles ahead (70)." },
  { kind: "phoenix", name: "Phoenix", faction: "conflux", sprite: "phoenix", hp: 1500, scale: 0.8,
    melee: { dmg: 100, every: sec(2), reach: 2, front: true }, rebirth: true, blurb: "100 breath, and rises once from its ashes." },

  // --- Doom: Hell's Garrison -------------------------------------------------
  // The gun line is a three-step chain (PvZ Peashooter -> Repeater -> Gatling):
  // Zombieman -> Shotgun Guy -> Chaingunner, gold-makers that learn to shoot.
  { kind: "zombieman", name: "Zombieman", faction: "doom", sprite: "doom-former-human", hp: 300, card: card(50, 7.5, 0), undead: true,
    produce: taxes(25, 24), upgrade: { to: "shotgun-guy", cost: 100 }, blurb: "A possessed trooper who loots the fallen: 25 gold every 24 s." },
  { kind: "shotgun-guy", name: "Shotgun Guy", faction: "doom", sprite: "doom-former-human-sergeant", hp: 400, undead: true,
    produce: taxes(25, 24), shot: shot("bullet", 12, 2.5, { windup: 6, volley: 1, range: 2.5 }), upgrade: { to: "chaingunner", cost: 150 },
    blurb: "Still 25 gold every 24 s, and buckshot (2 × 12) for anything within 2.5 tiles." },
  { kind: "chaingunner", name: "Chaingunner", faction: "doom", sprite: "doom-former-commando", hp: 500, undead: true,
    produce: taxes(25, 22), shot: shot("bullet", 8, 2.4, { windup: 5, volley: 3, range: 4 }),
    blurb: "25 gold every 22 s and a chaingun: bursts of four (8 each) out to 4 tiles." },
  { kind: "doom-imp", name: "Imp", faction: "doom", sprite: "doom-imp", hp: 350, card: card(125, 7.5, 0),
    shot: shot("hellfire", 25, 1.5, { windup: 8 }), blurb: "Hurls a ball of hellfire down its lane every 1.5 s (25)." },
  { kind: "pinky", name: "Pinky Demon", faction: "doom", sprite: "doom-demon", hp: 1800, card: card(75, 20, 1),
    melee: { dmg: 30, every: sec(1), reach: 1.05, front: true }, upgrade: { to: "spectre", cost: 100 }, blurb: "A charging wall of muscle and teeth (30)." },
  { kind: "spectre", name: "Spectre", faction: "doom", sprite: "doom-demon", hp: 2200, veiled: true,
    melee: { dmg: 40, every: sec(1), reach: 1.05, front: true },
    blurb: "A half-invisible Pinky: shooters cannot see it, so they walk up to it — and their shots pass through." },
  { kind: "cacodemon", name: "Cacodemon", faction: "doom", sprite: "doom-cacodemon", hp: 500, card: card(175, 10, 3),
    shot: shot("cacoball", 35, 2.4, { windup: 8, range: 6 }), melee: { dmg: 25, every: sec(1.5), reach: 1.05, front: true },
    upgrade: { to: "pain-elemental", cost: 150 }, blurb: "Spits plasma balls (35) up to 6 tiles and bites whatever reaches it (25)." },
  { kind: "pain-elemental", name: "Pain Elemental", faction: "doom", sprite: "doom-pain-elemental", hp: 600, deathSouls: 3,
    shot: shot("soul", 150, 7, { windup: 10 }),
    blurb: "Every 7 s spits a Lost Soul that charges down the lane into the first foe (150). Destroyed, it releases three." },
  { kind: "hell-knight", name: "Hell Knight", faction: "doom", sprite: "doom-hell-knight", hp: 700, card: card(250, 15, 5),
    shot: shot("baronball", 40, 2, { windup: 8 }), upgrade: { to: "baron", cost: 200 }, blurb: "A tough shooter (700 HP): green hellfire (40) every 2 s." },
  { kind: "baron", name: "Baron of Hell", faction: "doom", sprite: "doom-baron-of-hell", hp: 1100,
    shot: shot("baronball", 60, 2, { windup: 8 }), blurb: "1100 HP, green hellfire of 60." },
  { kind: "arachnotron", name: "Arachnotron", faction: "doom", sprite: "doom-arachnotron", hp: 900, card: card(275, 10, 7),
    shot: shot("plasma", 12, 0.5, { windup: 4, range: 7 }), upgrade: { to: "spider-mastermind", cost: 250 },
    blurb: "A plasma gun: a bolt (12) every half second, out to 7 tiles." },
  { kind: "spider-mastermind", name: "Spider Mastermind", faction: "doom", sprite: "doom-spider-mastermind", hp: 2500, scale: 0.9,
    shot: shot("bullet", 15, 0.35, { windup: 3 }), blurb: "A super chaingun: 15 every 0.35 s down the whole lane." },
  { kind: "mancubus", name: "Mancubus", faction: "doom", sprite: "doom-mancubus", hp: 1200, card: card(400, 30, 9),
    shot: shot("hellfire", 30, 5.5, { windup: 10, lanes: 3, volley: 2, range: 7 }), upgrade: { to: "cyberdemon", cost: 300 },
    blurb: "Twin flamethrowers: three volleys of fireballs down its lane and both neighbours (30 each), every 5.5 s." },
  { kind: "cyberdemon", name: "Cyberdemon", faction: "doom", sprite: "doom-cyberdemon", hp: 3000, magicResist: 0.5,
    shot: shot("rocket", 90, 5, { windup: 9, volley: 2, splash: 45 }),
    blurb: "Barrages of three rockets (90) that blow up everything around the hit (45). 3000 HP; spells deal half." },

  // --- Neutral ----------------------------------------------------------------
  { kind: "mine", name: "Land Mine", faction: "neutral", sprite: "", hp: 300, blurb: "Arms after 14 s, then blows up the first foe to step on it (1800)." },

  // --- Fusions (drop one card on a matching unit) ----------------------------
  { kind: "arctic-sharpshooter", name: "Arctic Sharpshooter", faction: "neutral", sprite: "wog-arctic-sharpshooter", hp: 300, fusion: true,
    shot: shot("frost", 20, 1.5, { volley: 1, chill: true }), blurb: "Bowman + frost: two chilling arrows per volley." },
  { kind: "lava-sharpshooter", name: "Lava Sharpshooter", faction: "neutral", sprite: "wog-lava-sharpshooter", hp: 300, fusion: true,
    shot: shot("arrow", 20, 1.5, { volley: 1, ignited: true }), blurb: "Bowman + flame: two burning arrows (40 each) per volley." },
  { kind: "santa-gremlin", name: "Santa Gremlin", faction: "neutral", sprite: "wog-santa-gremlin", hp: 300, fusion: true,
    shot: shot("gift", 20, 1.5, { range: 4.5, windup: 6 }), produce: { value: 25, every: sec(20), first: [sec(4), sec(8)] },
    blurb: "Gremlin + a gold-maker: throws gifts (20, 4.5 tiles) and pays 25 gold every 20 s." },
  { kind: "war-zealot", name: "War Zealot", faction: "neutral", sprite: "wog-war-zealot", hp: 1000, fusion: true,
    shot: shot("holy", 25, 1.5, { windup: 8 }), melee: { dmg: 40, every: sec(1), reach: 1.05, antiCavalry: true },
    blurb: "Monk + pike: holy orbs (25) and a halberd for anything that comes close (40)." },
  { kind: "sylvan-centaur", name: "Sylvan Centaur", faction: "neutral", sprite: "wog-sylvan-centaur", hp: 600, fusion: true,
    shot: shot("spear", 25, 1.3, { pierce: 2, chill: true }), blurb: "Elf + dendroid: thorn lances pierce two foes and entangle (chill)." },
  { kind: "gorynych", name: "Gorynych", faction: "neutral", sprite: "wog-gorynych", hp: 3000, fusion: true, scale: 0.8,
    melee: { dmg: 90, every: sec(2), reach: 2.2, front: true, lanes: 3 }, blurb: "Hydra + dragon: three heads breathe fire 2.2 tiles down three lanes (90)." },
  { kind: "diamond-golem", name: "Diamond Golem", faction: "neutral", sprite: "diamond-golem", hp: 6000, fusion: true, tall: true, magicResist: 0.5,
    deathBlast: 1800, blurb: "Wall + fire: 6000 HP, too tall to leap, and its crystal heart erupts (1800, 3×3) when shattered." },
  // Hell meets Antagarich.
  { kind: "revenant", name: "Revenant", faction: "neutral", sprite: "doom-revenant", hp: 1000, fusion: true, undead: true,
    shot: shot("rocket", 60, 2.2, { windup: 8, lob: true }), melee: { dmg: 50, every: sec(1.2), reach: 1.05, front: true },
    blurb: "Skeleton + Imp: shoulder rockets that home in over walls and shields (60), and a bony punch (50)." },
  { kind: "arch-vile", name: "Arch-vile", faction: "neutral", sprite: "doom-arch-vile", hp: 800, fusion: true,
    flame: { every: sec(8), range: 7, dmg: 350 }, resurrect: { every: sec(40) },
    blurb: "Monk + Imp: every 8 s the healthiest foe within 7 tiles erupts in flame (350, through shields and armour); every 40 s raises the last fallen defender nearby." }
];

export const DEFENDERS: Record<DefKind, DefDef> = Object.fromEntries([...DEFENDER_LIST, ...OC_DEFENDERS, ...OC_FIELD_DEFENDERS].map((def) => [def.kind, def]));

/** Base (card) unit of an upgraded unit. */
const FAMILY: Record<DefKind, DefKind> = {};
for (const def of DEFENDER_LIST) {
  if (def.upgrade) FAMILY[def.upgrade.to] = def.kind;
}
/** The base card a defender was raised as (follows an upgrade chain of any length). */
export function defFamily(kind: DefKind): DefKind {
  let base = kind;
  for (let guard = 0; FAMILY[base] && guard < 8; guard += 1) base = FAMILY[base]!;
  return base;
}

/** A defender's upgrade chain from its base card: [base, first upgrade, ...]. */
export function upgradeChain(kind: DefKind): DefKind[] {
  const chain = [defFamily(kind)];
  for (let guard = 0; guard < 8; guard += 1) {
    const up = DEFENDERS[chain[chain.length - 1]!]?.upgrade;
    if (!up) break;
    chain.push(up.to);
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Cards

export type CardDef = {
  id: CardId;
  name: string;
  faction: Faction | "neutral" | OcSide;
  cost: number;
  recharge: number;
  /** Adventure stage (levels cleared) that unlocks it. */
  stage: number;
  places?: DefKind;
  /** `raft`: Order & Chaos field packet — turns a tile of open water into a raft troops can stand on. */
  spell?: "fireball" | "fire-wall" | "stone-skin" | "raft" | "crate" | "wake";
  icon?: string;
  blurb: string;
};

const SPELL_CARDS: CardDef[] = [
  { id: "land-mine", name: "Land Mine", faction: "neutral", cost: 25, recharge: sec(30), stage: 4, places: "mine",
    icon: "/assets/spells-land_mine.webp", blurb: "Arms after 14 s, then blows up the first foe to step on it (1800)." },
  { id: "fireball", name: "Fireball", faction: "neutral", cost: 150, recharge: sec(50), stage: 2, spell: "fireball",
    icon: "/assets/spells-fireball.webp", blurb: "After a moment, 1800 fire damage to every foe in a 3×3 area." },
  { id: "fire-wall", name: "Fire Wall", faction: "neutral", cost: 125, recharge: sec(50), stage: 8, spell: "fire-wall",
    icon: "/assets/spells-fire_wall.webp", blurb: "A wall of flame sweeps the whole lane: 1800 fire damage to every foe in it." },
  { id: "stone-skin", name: "Stone Skin", faction: "neutral", cost: 125, recharge: sec(30), stage: 11, spell: "stone-skin",
    icon: "/assets/spells-stone_skin.webp", blurb: "Cast on a defender: a 4000 HP stone shell takes the hits first (smashers crush both)." }
];

export const CARDS: Record<CardId, CardDef> = Object.fromEntries([
  ...[...DEFENDER_LIST, ...OC_DEFENDERS, ...OC_FIELD_DEFENDERS].filter((def) => def.card).map((def): [CardId, CardDef] => [def.kind, {
    id: def.kind, name: def.name, faction: def.faction, cost: def.card!.cost, recharge: def.card!.recharge,
    stage: def.card!.stage, places: def.kind, blurb: def.blurb
  }]),
  ...SPELL_CARDS.map((c): [CardId, CardDef] => [c.id, c]),
  // Order & Chaos field packets that place no unit (the Raft).
  ...OC_FIELD_CARDS.map((c): [CardId, CardDef] => [c.id, c])
]);

export const SPELL_CARD_IDS: readonly CardId[] = SPELL_CARDS.map((c) => c.id);

/** A faction's garrison cards in unlock order. */
export function factionCards(faction: Faction): CardId[] {
  return DEFENDER_LIST.filter((def) => def.faction === faction && def.card)
    .sort((a, b) => a.card!.stage - b.card!.stage)
    .map((def) => def.kind);
}

export const LAND_MINE_ARM = sec(14);
export const LAND_MINE_DMG = 1800;
export const FIREBALL_DMG = 1800;
export const FIREBALL_DELAY = sec(0.6);
export const FIRE_WALL_DMG = 1800;
export const FIRE_WALL_DELAY = sec(0.5);
export const STONE_SKIN_HP = 4000;

// ---------------------------------------------------------------------------
// Fusions (the PvZ "Fusion"/"Hybrid" mods): drop a card on a placed unit of
// the other half (either order). Cross-faction by design — mix your banners.

export type FusionRecipe = { a: readonly CardId[]; b: readonly CardId[]; result: DefKind };

const ECON_CARDS = DEFENDER_LIST.filter((def) => def.card && def.produce).map((def) => def.kind);

export const FUSIONS: readonly FusionRecipe[] = [
  { a: ["archer", "wood-elf", "lizardman"], b: ["snow-elf", "ice-elemental"], result: "arctic-sharpshooter" },
  { a: ["archer", "wood-elf", "lizardman"], b: ["fire-elemental", "efreet"], result: "lava-sharpshooter" },
  { a: ["gremlin"], b: ECON_CARDS, result: "santa-gremlin" },
  { a: ["monk"], b: ["pikeman", "swordsman"], result: "war-zealot" },
  { a: ["wood-elf"], b: ["dendroid-guard"], result: "sylvan-centaur" },
  { a: ["hydra"], b: ["green-dragon", "red-dragon", "firebird"], result: "gorynych" },
  { a: ["stone-golem", "earth-elemental", "dwarf"], b: ["fireball"], result: "diamond-golem" },
  { a: ["skeleton"], b: ["doom-imp"], result: "revenant" },
  { a: ["monk"], b: ["doom-imp"], result: "arch-vile" },
  // Order & Chaos hybrids.
  ...OC_FUSIONS
];

/** A card or unit id without its Order & Chaos level (`@2`) or Ascension (`^`) suffix. */
function plainKind(kind: string): string {
  const cut = kind.search(/[@^]/);
  return cut >= 0 ? kind.slice(0, cut) : kind;
}

/** The fused unit when `card` is dropped on a placed `placed` unit, or null. */
export function fusionFor(placed: DefKind, cardId: CardId): DefKind | null {
  if (DEFENDERS[placed]?.fusion || DEFENDERS[placed]?.ascendedFrom || placed === "mine") return null;
  const family = defFamily(plainKind(placed));
  const card = plainKind(cardId);
  for (const recipe of FUSIONS) {
    if (recipe.a.includes(family) && recipe.b.includes(card)) return recipe.result;
    if (CARDS[cardId]?.places && recipe.b.includes(family) && recipe.a.includes(card)) return recipe.result;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Warbands (the attackers)

export type RangedDef = {
  range: number;
  every: number;
  dmg: number;
  projectile: ProjectileKind;
  lob?: boolean;
  /** Lob hits the 3x3 around the target tile. */
  splash?: boolean;
  volley?: number;
  /** Magic that passes over defenders with no attack of their own (walls). */
  skipWalls?: boolean;
  /** Instant bolt instead of a projectile. */
  lightning?: boolean;
  /** Death cloud: undead defenders are immune. */
  cloud?: boolean;
  stun?: { chance: number; dur: number };
  /** Instant hit instead of a projectile: gunfire tracers ("bullet") or an Arch-vile's flame eruption ("flame"). */
  hitscan?: "bullet" | "flame";
  /** Mancubus: each volley fans two shots across its lane and a neighbour (left+centre, centre+right, left+right). */
  spread?: boolean;
  /** Order & Chaos: the defender it hits acts at half speed for this many ticks. */
  curse?: number;
  /** A straight shot that blows up on impact: the defenders around the one it hits take half. */
  blast?: boolean;
};

export type EnemyDef = {
  kind: EnemyKind;
  name: string;
  faction: Faction | "neutral" | OcSide;
  sprite: string;
  hp: number;
  /** Tiles per tick while walking. */
  speed: number;
  bite: number;
  /** Ticks between bites. */
  biteEvery: number;
  /** Wave director point cost (0 = never drafted by waves). */
  cost: number;
  /** Versus: Might to muster one. */
  might: number;
  /** Versus card recharge. */
  recharge: number;
  blurb: string;
  shield?: number;
  vault?: { fastSpeed: number };
  burrow?: { speed: number };
  ranged?: RangedDef;
  drain?: number;
  curse?: number;
  stun?: { every: number; dur: number };
  poison?: { dps: number; dur: number };
  cavalry?: boolean;
  /** First bite multiplier (jousting charge). */
  joust?: number;
  deathBlow?: number;
  smash?: boolean;
  fling?: boolean;
  /** Bites also hit the defender behind ("line") or in the neighbouring lanes ("lanes"). */
  cleave?: "line" | "lanes";
  fireImmune?: boolean;
  frostImmune?: boolean;
  /** Multiplier on spell damage (0 = immune). */
  magicResist?: number;
  teleport?: boolean;
  summon?: { kind: EnemyKind; every: number };
  heal?: { amount: number; every: number; range: number };
  /** Allies within 1.5 tiles in its lane march and bite this much faster. */
  aura?: number;
  manaDrain?: number;
  rebirth?: boolean;
  /** Bites strip stone-skin shells. */
  dispel?: boolean;
  /** HP regenerated per second. */
  regen?: number;
  /** Blind creatures cannot be blinded, paralysed or stunned. */
  stunImmune?: boolean;
  /**
   * Headgear (or a held book) that takes every kind of damage before the body
   * does; the overflow of the breaking blow reaches the body.
   */
  armor?: number;
  /** Sprite once the shield or armour is gone (the bare creature underneath). */
  stripped?: string;
  /** The piece of gear that tumbles off when the shield or armour breaks (presentation). */
  piece?: "pot" | "helm" | "coffin" | "tome" | "trog-helm" | "tower-shield" | "rider-helm" | "dread-helm" | "merc-helm";
  /** Enraged: marches and strikes this much faster once its shield/armour breaks ("break") or it drops below half health ("half"). */
  enrage?: { mult: number; at: "break" | "half" };
  /** Digs in at the edge of the lawn, tunnels untouchable to your gate and climbs out behind your lines, facing them. */
  dig?: { speed: number };
  /** Lights its fuse on reaching a defender; when it burns down (paused while frozen or stunned) everything in the 3x3 takes `dmg` and so does the carrier. */
  keg?: { dmg: number; fuse: number };
  /** What a `fling` creature hurls (default: a Skeleton). */
  flingKind?: EnemyKind;
  /** Summons one in each neighbouring lane and one ahead in its own lane, instead of one at its side. */
  summonSpread?: boolean;
  /** Each strike pockets this much of the defender's gold; it drops everything it carries when slain. */
  steal?: number;
  /** Marches at the head of every great assault (spawned by the wave director, never drafted). */
  herald?: boolean;
  /** Spectre: every Nth straight shot passes through it. */
  evade?: number;
  /** Pain Elemental: when slain, releases these around it. */
  deathSpawn?: { kind: EnemyKind; count: number };
  /** Arch-vile: every `every` ticks (once on the lawn) raises the last fallen attacker at its side. */
  revive?: { every: number };
  /** Share of melee damage reflected onto the striker. */
  fireShield?: number;
  /** Order & Chaos: flies over every defender to the gate; only anti-air shots, gusts, lightning and spells reach it. */
  flying?: boolean;
  /** Bounds over every defender that is not tall (a tall one stops it for good). */
  pogo?: boolean;
  /** Once on the lawn, raises a grave on an empty tile near it every `every` ticks. */
  graves?: { every: number };
  /** A grave (structure): blocks planting and soaks shots; every great assault raises `raise` out of it. */
  grave?: { raise: EnemyKind };
  /** Drops from the sky onto your costliest defender and carries it off after `delay` ticks unless slain. */
  snatch?: { delay: number };
  undead?: boolean;
  boss?: boolean;
  structure?: boolean;
  scale?: number;
  /** Hit radius in tiles. */
  radius?: number;
  /** Order & Chaos mercenary: drops this much gold (its pay) when slain. */
  purse?: number;
  /** Order & Chaos: unseen (no shot, spell or ability can single it out) while beyond this x, until it takes damage. */
  stealth?: number;
  /** Order & Chaos: sidesteps into a free neighbouring lane the first time a defender blocks it. */
  swerve?: boolean;
  /** Order & Chaos flyer too heavy for a gale: pushed back instead of blown off the field. */
  anchored?: boolean;
  /** Order & Chaos: drifts through the defenders in its way untouchable (only blasts and spells reach it), then must wait `every` ticks to phase again. */
  phase?: { every: number; speed: number };
  /** Order & Chaos: every `every` tiles it leaps diagonally into a neighbouring lane (flyers flit). */
  zigzag?: { every: number };
  /** Order & Chaos: on the lawn it stops to dance (`dance` ticks) and calls backup dancers into the four tiles around it; it calls the missing ones again every `every` ticks, and they hold while it dances. */
  troupe?: { kind: EnemyKind; every: number; dance: number };
  /** Order & Chaos: channels over an ally that fell within `range` tiles (its lane and both beside it) in the last `fresh` ticks and raises it where it fell after `channel` ticks, unless stunned, frozen, blown back or slain first; `every` ticks between raisings. */
  raiseDead?: { range: number; channel: number; every: number; fresh: number };
  /** Order & Chaos: rolls over the defenders in its lane (`dmg` to each); a tall one stops it, spikes pop it. `scorch`: the tiles it rolls over burn for that many ticks (nothing can be placed there). */
  roller?: { dmg: number; scorch?: number; ice?: number };
  /** Order & Chaos: carries a ladder; at the first wall it meets (tall, or at least `wallHp` health) it spends `plant` ticks planting it, and from then on every Chaos walker in the lane climbs over that defender. */
  ladder?: { plant: number; wallHp: number };
  /** Order & Chaos siege engine: halts at `stopX` (or where it is blocked) and lobs its `ranged` shot at the rearmost troop in its lane, `ammo` times; then it rolls on as a roller. */
  siege?: { stopX: number; ammo: number };
  /** Order & Chaos: every `every` ticks turns the nearest troop within `range` tiles ahead in its lane into a sheep for `dur` ticks (it cannot act; walls still block). */
  hex?: { every: number; range: number; dur: number };
  /** Order & Chaos: every `every` ticks spins for `spin` ticks, reflecting straight shots back down the lane at `share` of their damage. */
  prism?: { every: number; spin: number; share: number };
  /** Order & Chaos: knocks the defender it strikes a tile back (if the tile is free) and stuns it `dur` ticks, `dmg` extra; `every` 0 = its first strike only, else every Nth strike. */
  shove?: { every: number; dur: number; dmg: number };
  /** Order & Chaos: once, a killing blow (not fire, not a blast) leaves it going on at this share of its health. */
  lastGasp?: number;
  /** Order & Chaos: blinks past the first defender it meets (not a tall one). */
  blink?: boolean;
  /** Order & Chaos: dazed this many ticks when its helm or armour is knocked off. */
  daze?: number;
  /** Order & Chaos: turns and runs off the field once it carries `loot` stolen gold, when below `below` of its health (escaping with its pay), or once it has come as far as x `at`. */
  flee?: { loot?: number; below?: number; at?: number };
  /** Order & Chaos flyers: every `every` ticks strike the defender beneath them (`dmg`; a breath also scorches the tile ahead; a dive may poison). `acid` (Rust Dragon): each troop struck loses its shell and is Corroded this many ticks — it takes CORRODE_MULT damage from everything. */
  skyAttack?: { kind: "dive" | "spit" | "breath"; dmg: number; every: number; poison?: { dps: number; dur: number }; acid?: number };
  /** Order & Chaos: its ranged attack picks the costliest defender in range, not the nearest. */
  costliest?: boolean;
  /** Order & Chaos battlefield (order-chaos/field.ts): dives through open water (unaimable while it swims, not slowed). See also field.ts SWIMMERS. */
  swim?: boolean;
  /** Order & Chaos crypt: every `every` ticks one of the dead (wave-pool foes up to `maxCost`) climbs out, `flag` more at each great assault. */
  crypt?: { every: number; maxCost: number; flag: number };
  /** Order & Chaos treasure chest: drops `gold` when broken open (a thief walking past pockets it). */
  chest?: { gold: number };
  /** Order & Chaos creature bank: when broken, `troop` joins the player on its tile and `gold` spills out. */
  bank?: { troop: DefKind; gold: number };
  /** Order & Chaos battlefield: races across ice at this pace (Sledge Wolves). */
  slide?: { speed: number };
  /** Order & Chaos: every `every` ticks puts the nearest troop up to `range` tiles ahead in its lane to sleep (until a Wake-Up Brew, a Cure or a Field Hospital wakes it). */
  lull?: { every: number; range: number };
  // --- Order & Chaos content pass ---------------------------------------------
  /** Tentacle Eater: every `every` ticks grabs the nearest troop 1.2 to `range` tiles ahead in its lane and drags it a tile toward itself (when that tile is free), stunned `stun` ticks. */
  grab?: { every: number; range: number; stun: number };
  /** Fire Messenger: every troop it bites burns to ashes at once (a tall troop takes `tallDmg`) — until frost, rain or water puts its fire out. */
  torch?: { tallDmg: number };
  /** Warlord: every `every` ticks knights the nearest unarmoured Chaos walker within `range` tiles (its lane and both beside it): `armor` of plate. */
  knight?: { every: number; range: number; armor: number };
  /** Psychic Watcher: lobbed shots aimed at it or at any foe within `reach` tiles of it (its lane and both beside it) bounce off its dome. */
  parasol?: { reach: number };
  /** Stormbird Carrier: flies in carrying a `kind` and drops it once past x `dropX`, then flies off; slain or blown away first, its passenger falls where it is. */
  carry?: { kind: EnemyKind; dropX: number };
  /** Jotunn Frostcaller: every `every` ticks encases the nearest troop up to `range` tiles ahead in its lane in ice for `dur` ticks (a troop beside a fire troop stays warm). */
  frostbite?: { every: number; range: number; dur: number };
  /** Treasure Kobold: `loot` gold on its back from the start (dropped when slain, gone if it escapes); drafted into waves this much less often. */
  treasure?: { loot: number; rare: number };
  /** A Lawful ally walker (Rin's cats): fights the horde and is never counted as a foe. */
  ally?: boolean;
  /** Mantis Reaper: every `every`th strike is a whirlwind that hits every troop in the 3x3 around it. */
  whirl?: { every: number };
  /** Kitsune Assassin: every `every` ticks blinks to the rearmost troop up to `reach` tiles ahead in its lane (past the one in front), strikes it for `dmg` and blinks back. */
  assassin?: { every: number; reach: number; dmg: number };
  /** A smasher's blow sends out a shockwave: the troops around the one it crushes take `dmg` and are stunned `stun` ticks. */
  slam?: { dmg: number; stun: number };
  /** Order & Chaos world boss (with `boss: true`): leads a level's last assault, walks and bites like any foe, and between bites makes telegraphed moves. */
  warboss?: WarbossDef;
  /** WoG Ghost's Soul Harvest: a troop (not undead) it slays heals it fully and, up to `max` times, adds `grow` of its base health for good. */
  soulHarvest?: { grow: number; max: number };
};

/**
 * An Order & Chaos world boss's move. Each is telegraphed: the tiles it will strike are
 * marked `warn` ticks before it lands (the boss stands and winds up meanwhile). `from`:
 * the phase it is first used in (0: from the start).
 */
export type WarbossMove = {
  /** What the player is shown as it winds the move up ("Frost Breath"), and the FX sheet its blow lands with. */
  name?: string;
  fx?: string;
  /**
   * A set piece: the move it makes on entering phase `interlude` (1, 2, ...), never part of its rotation.
   * It halts and nothing can harm it while it winds the move up (WarbossDef.pause), then the move lands.
   */
  interlude?: number;
} & (
  /** Smashes the 3x3 around the nearest troop up to `reach` tiles ahead in its lane: `dmg` to each troop there, stunned `stun` ticks. */
  | { kind: "slam"; dmg: number; stun: number; reach: number; from?: number }
  /** Breathes down the `len` tiles ahead of it (its lane; `wide`: and both beside): `dmg` to each troop there; `freeze` seals them in ice that long, `fire` burns, `drain` heals it by that share of the harm. */
  | { kind: "breath"; dmg: number; len: number; wide?: boolean; freeze?: number; fire?: boolean; drain?: number; from?: number }
  /** Hurls `count` bolts or boulders at the costliest troops on the lawn: `dmg` each (and stunned `stun` ticks). */
  | { kind: "volley"; dmg: number; count: number; stun?: number; from?: number }
  /** Calls `count` foes of a kind out of the far edge of the marked lanes. */
  | { kind: "summon"; foe: EnemyKind; count: number; from?: number }
  /** Raises `count` graves on marked open tiles. */
  | { kind: "graves"; count: number; from?: number }
  /** Beats the war drums: the whole horde acts half as fast again for `dur` ticks. */
  | { kind: "drums"; dur: number; from?: number }
  /** Strides into another lane (the tile it lands on is marked). */
  | { kind: "stride"; from?: number }
  /** Pounces on the nearest troop up to `reach` tiles ahead: `dmg` to it, and lands in front of it. */
  | { kind: "pounce"; dmg: number; reach: number; from?: number }
  /** Roars: every troop within `reach` tiles of it (its lane and both beside) is stunned `stun` ticks. */
  | { kind: "roar"; stun: number; reach: number; from?: number }
  /**
   * A banshee's wail: every troop on the lawn is sealed in ice for `freeze` ticks (a troop kept warm by
   * fire only steams; steadfast troops and landmarks are spared). Never again within `rest` ticks.
   */
  | { kind: "wail"; freeze: number; rest: number; from?: number }
);

export type WarbossDef = {
  /** Health shares (falling) at which it enters its next phase: [0.6, 0.3] gives three phases. */
  phases: number[];
  /** Ticks between moves, per phase (the last entry holds for later phases). */
  every: number[];
  /** Pace per phase (it walks, bites and winds up this much faster). */
  pace: number[];
  /** Ticks between the telegraph and the blow. */
  warn: number;
  moves: WarbossMove[];
  /** It marches no nearer the gate than this (x): there it stands and fights, biting only what is in front of it. */
  hold?: number;
  /** Ticks a phase's set piece (WarbossMove.interlude) is wound up for (default 4 s). */
  pause?: number;
  /**
   * Spirits circle it from the moment it is on the lawn. Every `every` ticks (not while it winds up a set
   * piece) one breaks away and flies into a lane as a `foe`, while fewer than `max` it sent are still about;
   * it is always circled by `count` minus those.
   */
  spirits?: { count: number; every: number; foe: EnemyKind; max: number };
};

type EnemyInput = Omit<EnemyDef, "might" | "recharge" | "biteEvery" | "sprite"> & { biteEvery?: number; sprite?: string; might?: number; recharge?: number };

const e = (input: EnemyInput): EnemyDef => ({
  ...input,
  sprite: input.sprite ?? input.kind,
  biteEvery: input.biteEvery ?? 10,
  might: input.might ?? 25 * (input.cost + 1),
  recharge: input.recharge ?? sec(3 + input.cost * 2.5)
});

const WALK = pace(4.7);
const SLOW = pace(6);
const FAST = pace(3);
const RUSH = pace(2.2);
const ranged = (dmg: number, every: number, range: number, projectile: ProjectileKind, extra: Partial<RangedDef> = {}): RangedDef => ({
  dmg, every: sec(every), range, projectile, ...extra
});

const ENEMY_LIST: EnemyDef[] = [
  // --- Necropolis: The Undead Tide ------------------------------------------
  e({ kind: "walking-dead", name: "Walking Dead", faction: "necropolis", hp: 270, speed: WALK, bite: 50, cost: 1, undead: true, blurb: "Slow, relentless and hungry." }),
  e({ kind: "zombie", name: "Zombie", faction: "necropolis", hp: 640, speed: WALK, bite: 50, cost: 2, undead: true, blurb: "Rusted armour: more than twice as tough." }),
  e({ kind: "skeleton", name: "Skeleton", faction: "necropolis", hp: 200, speed: pace(3.2), bite: 50, cost: 1, undead: true, blurb: "Fragile but quick." }),
  e({ kind: "skeleton-warrior", name: "Skeleton Warrior", faction: "necropolis", hp: 270, shield: 1100, speed: WALK, bite: 50, cost: 4, undead: true,
    blurb: "Its shield soaks 1100 from straight shots. Lobs, lightning, melee and spells go around it." }),
  e({ kind: "vampire", name: "Vampire", faction: "necropolis", hp: 500, speed: WALK, vault: { fastSpeed: pace(2.4) }, drain: 0.5, bite: 50, cost: 3, undead: true,
    blurb: "Rushes in and flutters over the first defender (not a tall one). Bites heal it." }),
  e({ kind: "wight", name: "Wight", faction: "necropolis", hp: 400, speed: FAST, regen: 15, bite: 40, cost: 3, undead: true, blurb: "Regenerates 15 HP every second." }),
  e({ kind: "mummy", name: "Mummy", faction: "neutral", hp: 800, speed: pace(5.5), curse: sec(8), bite: 50, cost: 3, undead: true,
    blurb: "Its bite curses: the defender acts at half speed for 8 s." }),
  e({ kind: "lich", name: "Lich", faction: "necropolis", hp: 450, speed: WALK, bite: 0, cost: 4, undead: true,
    ranged: ranged(60, 4, 4, "cloud", { lob: true, splash: true, cloud: true }),
    blurb: "Stops 4 tiles away and lobs death clouds (60, 3×3). Undead defenders are immune." }),
  e({ kind: "black-knight", name: "Black Knight", faction: "necropolis", hp: 1400, speed: RUSH, bite: 75, cost: 7, cavalry: true, undead: true,
    blurb: "A fast, heavy rider. Pikes deal double damage to it." }),
  e({ kind: "dread-knight", name: "Dread Knight", faction: "necropolis", hp: 1800, speed: RUSH, bite: 75, cost: 9, cavalry: true, deathBlow: 3, undead: true,
    blurb: "Every third strike is a Death Blow for triple damage." }),
  e({ kind: "bone-dragon", name: "Bone Dragon", faction: "necropolis", hp: 3000, speed: SLOW, bite: 0, biteEvery: sec(2.5), cost: 10, smash: true, fling: true, undead: true,
    scale: 0.8, radius: 0.55, blurb: "Crushes any defender in one blow. Wounded, it hurls a Skeleton deep behind your lines." }),
  e({ kind: "ghost-dragon", name: "Ghost Dragon", faction: "necropolis", hp: 4500, speed: SLOW, bite: 0, biteEvery: sec(2.2), cost: 14, smash: true, fling: true, undead: true,
    scale: 0.8, radius: 0.55, blurb: "A Bone Dragon with half again the bones." }),
  // The Tide's own breed (rotoscoped from the Zombie, the Walking Dead, the Ogre and the Lich).
  e({ kind: "tide-herald", name: "Tide Standard-Bearer", faction: "necropolis", sprite: "gw-herald", hp: 270, speed: pace(3.6), bite: 50, cost: 0, herald: true, undead: true,
    blurb: "Carries the banner at the head of every great assault." }),
  e({ kind: "pot-helm-zombie", name: "Kettle-Helm Zombie", faction: "necropolis", sprite: "gw-pot-helm", hp: 640, armor: 400, stripped: "zombie", piece: "pot", speed: WALK, bite: 50, cost: 3, undead: true,
    blurb: "An iron pot on its head takes the first 400 damage of any kind." }),
  e({ kind: "great-helm-zombie", name: "Great-Helm Zombie", faction: "necropolis", sprite: "gw-great-helm", hp: 640, armor: 1100, stripped: "zombie", piece: "helm", speed: WALK, bite: 50, cost: 5, undead: true,
    blurb: "A knight's great helm takes the first 1100 damage of any kind. Knock it off and it is only a Zombie." }),
  e({ kind: "coffin-zombie", name: "Coffin-Lid Zombie", faction: "necropolis", sprite: "gw-coffin", hp: 270, shield: 1200, stripped: "walking-dead", piece: "coffin", speed: WALK, bite: 50, cost: 4, undead: true,
    blurb: "Holds a coffin lid before it: straight shots from the front hit the lid (1200). Lobs, lightning, melee, mines and spells go around it." }),
  e({ kind: "tome-zombie", name: "Tome-Reading Zombie", faction: "necropolis", sprite: "gw-tome", hp: 270, armor: 300, stripped: "walking-dead", piece: "tome", enrage: { mult: 2.2, at: "break" },
    speed: WALK, bite: 50, cost: 2, undead: true, blurb: "Reads as it shambles; the book takes the first 300. Destroy it and the Zombie flies into a rage: more than twice as fast, biting twice as often." }),
  e({ kind: "gravedigger", name: "Gravedigger", faction: "necropolis", sprite: "gw-gravedigger", hp: 640, dig: { speed: pace(1.6) }, speed: WALK, bite: 50, cost: 4, undead: true,
    blurb: "Digs in at the edge of the lawn, tunnels to your gate untouched and climbs out behind your lines, eating them from the back. Pikes, gazes, lightning, mines and spells reach behind." }),
  e({ kind: "keg-ghoul", name: "Powder-Keg Ghoul", faction: "necropolis", sprite: "gw-keg", hp: 640, keg: { dmg: 1800, fuse: sec(2.5) }, speed: pace(3.8), bite: 40, cost: 4, undead: true,
    blurb: "Reaching a defender lights the fuse: 2.5 s later the keg blows up everything in the 3x3 (1800). Freezing or stunning it holds the fuse; kill it first." }),
  e({ kind: "abomination", name: "Plague Abomination", faction: "necropolis", sprite: "gw-abomination", hp: 3400, speed: SLOW, bite: 0, biteEvery: sec(2.5), cost: 13, smash: true, fling: true,
    flingKind: "ghoul-runt", undead: true, scale: 1.05, radius: 0.5, blurb: "A stitched giant: its gravestone flattens any defender in one blow. Wounded, it hurls the ghoul on its back deep behind your lines." }),
  e({ kind: "ghoul-runt", name: "Ghoul Runt", faction: "necropolis", sprite: "walking-dead", hp: 180, speed: pace(2.6), bite: 30, cost: 0, undead: true, scale: 0.72,
    blurb: "The little ghoul an Abomination throws." }),
  e({ kind: "necromancer", name: "Necromancer", faction: "necropolis", sprite: "gw-necromancer", hp: 800, speed: WALK, bite: 40, cost: 6, summon: { kind: "skeleton", every: sec(14) }, summonSpread: true,
    blurb: "Once on the lawn, every 14 s raises a Skeleton in each neighbouring lane and one ahead of itself." }),
  e({ kind: "wraith", name: "Wraith", faction: "necropolis", hp: 500, speed: FAST, regen: 20, manaDrain: 2, bite: 45, cost: 4, undead: true,
    blurb: "Regenerates 20 HP a second; each strike drains 2 mana from the defending hero." }),
  e({ kind: "vampire-lord", name: "Vampire Lord", faction: "necropolis", hp: 700, speed: WALK, vault: { fastSpeed: pace(2.2) }, drain: 1, bite: 55, cost: 5, undead: true,
    blurb: "Flutters over the first defender (not a tall one); every bite heals it for all the damage dealt." }),
  e({ kind: "power-lich", name: "Power Lich", faction: "necropolis", hp: 650, speed: WALK, bite: 0, cost: 6, undead: true,
    ranged: ranged(90, 4, 4.5, "cloud", { lob: true, splash: true, cloud: true }), blurb: "Stops 4.5 tiles away and lobs heavy death clouds (90, 3×3). Undead defenders are immune." }),

  // --- Neutrals and sellswords who march with the Tide ----------------------
  e({ kind: "ghost", name: "Ghost", faction: "neutral", sprite: "wog-ghost", hp: 450, speed: WALK, vault: { fastSpeed: pace(2) }, frostImmune: true, bite: 45, cost: 3, undead: true,
    blurb: "Drifts over the first defender (not a tall one); frost cannot slow it." }),
  e({ kind: "werewolf", name: "Werewolf", faction: "neutral", sprite: "wog-werewolf", hp: 800, speed: FAST, bite: 60, cost: 5, enrage: { mult: 1.6, at: "half" },
    blurb: "Wounded below half health, it goes berserk: 60% faster in stride and bite." }),
  e({ kind: "rogue", name: "Rogue", faction: "neutral", hp: 350, speed: FAST, bite: 30, cost: 2, steal: 15,
    blurb: "A sellsword cutpurse: every strike pockets 15 of your gold. Slain, it drops everything it stole." }),
  e({ kind: "nomad", name: "Nomad", faction: "neutral", hp: 750, speed: RUSH, bite: 55, cost: 4, cavalry: true, blurb: "A hired desert rider. Pikes deal double damage to it." }),
  e({ kind: "sharpshooter", name: "Sharpshooter", faction: "neutral", hp: 350, speed: WALK, bite: 0, cost: 5, ranged: ranged(40, 2.5, 5.5, "arrow"),
    blurb: "A mercenary marksman: stops 5.5 tiles away and shoots (40)." }),
  e({ kind: "troll", name: "Troll", faction: "neutral", hp: 1000, speed: pace(5.5), regen: 20, bite: 70, biteEvery: 14, cost: 5,
    blurb: "Regenerates 20 HP every second. Burst it down." }),
  e({ kind: "pirate", name: "Pirate", faction: "neutral", hp: 450, speed: pace(4), bite: 55, cost: 2, blurb: "A Cove cutthroat who signed on for the plunder." }),

  // --- Stronghold: Barbarian Horde ------------------------------------------
  e({ kind: "goblin", name: "Goblin", faction: "stronghold", hp: 200, speed: FAST, bite: 40, cost: 1, blurb: "Quick and cheap." }),
  e({ kind: "hobgoblin", name: "Hobgoblin", faction: "stronghold", hp: 450, speed: FAST, bite: 45, cost: 2, blurb: "Quick and less cheap." }),
  e({ kind: "wolf-rider", name: "Wolf Rider", faction: "stronghold", hp: 500, speed: RUSH, bite: 40, biteEvery: 7, cost: 3, cavalry: true, blurb: "Fast rider; wolf and goblin both bite." }),
  e({ kind: "wolf-raider", name: "Wolf Raider", faction: "stronghold", hp: 650, speed: RUSH, bite: 40, biteEvery: 3.5, cost: 4, cavalry: true, blurb: "Double attack: bites twice as often as a Wolf Rider." }),
  e({ kind: "orc", name: "Orc", faction: "stronghold", hp: 350, speed: WALK, bite: 0, cost: 3, ranged: ranged(20, 2, 4, "axe"), blurb: "Stops 4 tiles away and throws axes (20)." }),
  e({ kind: "orc-chieftain", name: "Orc Chieftain", faction: "stronghold", hp: 450, speed: WALK, bite: 0, cost: 5, ranged: ranged(30, 2, 4.5, "axe"), blurb: "Heavier axes (30)." }),
  e({ kind: "ogre", name: "Ogre", faction: "stronghold", hp: 1400, speed: pace(5.5), bite: 80, biteEvery: 14, cost: 4, blurb: "A walking wall with a club." }),
  e({ kind: "ogre-mage", name: "Ogre Mage", faction: "stronghold", hp: 1200, speed: pace(5.5), bite: 80, biteEvery: 14, cost: 6, aura: 0.3,
    blurb: "Bloodlust: allies within 1.5 tiles in its lane march and bite 30% faster." }),
  e({ kind: "roc", name: "Roc", faction: "stronghold", hp: 900, speed: WALK, vault: { fastSpeed: pace(2.2) }, bite: 60, cost: 5, scale: 0.85,
    blurb: "Soars over the first defender." }),
  e({ kind: "thunderbird", name: "Thunderbird", faction: "stronghold", hp: 1100, speed: WALK, vault: { fastSpeed: pace(2) }, bite: 70, cost: 7, scale: 0.85,
    stun: { every: 3, dur: sec(2) }, blurb: "Soars over the first defender; every third strike stuns for 2 s." }),
  e({ kind: "cyclops", name: "Cyclops", faction: "stronghold", hp: 900, speed: SLOW, bite: 0, cost: 6, ranged: ranged(90, 4, 5, "boulder", { lob: true }),
    blurb: "Lobs boulders (90) from 5 tiles away." }),
  e({ kind: "behemoth", name: "Behemoth", faction: "stronghold", hp: 3200, speed: SLOW, bite: 0, biteEvery: sec(2.5), cost: 10, smash: true, scale: 0.9, radius: 0.5,
    blurb: "Tears any defender apart in one blow." }),
  e({ kind: "ancient-behemoth", name: "Ancient Behemoth", faction: "stronghold", hp: 4500, speed: SLOW, bite: 0, biteEvery: sec(2.2), cost: 14, smash: true, scale: 0.9, radius: 0.5,
    blurb: "Even bigger, even angrier." }),

  // --- Dungeon: Nighon Raiders ----------------------------------------------
  e({ kind: "troglodyte", name: "Troglodyte", faction: "dungeon", hp: 300, speed: WALK, bite: 50, cost: 1, stunImmune: true, blurb: "Blind, so nothing can blind, paralyse or stun it." }),
  e({ kind: "infernal-troglodyte", name: "Infernal Troglodyte", faction: "dungeon", hp: 500, speed: WALK, bite: 55, cost: 2, stunImmune: true, blurb: "A tougher cave-dweller; just as impossible to blind." }),
  e({ kind: "harpy", name: "Harpy", faction: "dungeon", hp: 350, speed: WALK, vault: { fastSpeed: pace(2.2) }, bite: 45, cost: 2, blurb: "Flutters over the first defender." }),
  e({ kind: "harpy-hag", name: "Harpy Hag", faction: "dungeon", hp: 450, speed: WALK, vault: { fastSpeed: pace(1.9) }, bite: 55, cost: 3, blurb: "Faster and meaner." }),
  e({ kind: "beholder", name: "Beholder", faction: "dungeon", hp: 400, speed: WALK, bite: 0, cost: 4, ranged: ranged(20, 1.5, 4.5, "bolt"), blurb: "Stops at range and fires gaze beams (20)." }),
  e({ kind: "evil-eye", name: "Evil Eye", faction: "dungeon", hp: 500, speed: WALK, bite: 0, cost: 5, ranged: ranged(30, 1.5, 4.5, "bolt"), blurb: "Beams of 30." }),
  e({ kind: "medusa", name: "Medusa", faction: "dungeon", hp: 450, speed: WALK, bite: 0, cost: 5, ranged: ranged(20, 2, 4.5, "arrow", { stun: { chance: 0.25, dur: sec(3) } }),
    blurb: "Arrows at range; a quarter of them turn the target to stone for 3 s." }),
  e({ kind: "minotaur", name: "Minotaur", faction: "dungeon", hp: 1200, speed: pace(3.5), bite: 70, cost: 5, blurb: "Charging axe-bull." }),
  e({ kind: "minotaur-king", name: "Minotaur King", faction: "dungeon", hp: 1500, speed: pace(3.5), bite: 70, biteEvery: 5, cost: 7, blurb: "Swings twice as often." }),
  e({ kind: "manticore", name: "Manticore", faction: "dungeon", hp: 1000, speed: WALK, vault: { fastSpeed: pace(2.2) }, bite: 60, cost: 6, blurb: "Leaps the first defender." }),
  e({ kind: "scorpicore", name: "Scorpicore", faction: "dungeon", hp: 1200, speed: WALK, vault: { fastSpeed: pace(2) }, bite: 60, cost: 8, stun: { every: 3, dur: sec(3) },
    blurb: "Leaps in; every third sting paralyses for 3 s." }),
  e({ kind: "red-dragon", name: "Red Dragon", faction: "dungeon", hp: 3000, speed: SLOW, vault: { fastSpeed: pace(3) }, bite: 100, biteEvery: 20, cost: 11, cleave: "line",
    scale: 0.8, radius: 0.55, blurb: "Flies over the first defender; its breath burns the defender behind too." }),
  e({ kind: "black-dragon", name: "Black Dragon", faction: "dungeon", hp: 3800, speed: SLOW, vault: { fastSpeed: pace(3) }, bite: 130, biteEvery: 20, cost: 15, cleave: "line", magicResist: 0,
    scale: 0.8, radius: 0.55, blurb: "Immune to spells." }),

  // --- Castle: Erathian Crusade ---------------------------------------------
  e({ kind: "pikeman", name: "Pikeman", faction: "castle", hp: 350, speed: WALK, bite: 50, cost: 1, blurb: "A levy with a long spear." }),
  e({ kind: "halberdier", name: "Halberdier", faction: "castle", hp: 550, speed: WALK, bite: 60, cost: 2, blurb: "Better armoured levy." }),
  e({ kind: "archer", name: "Archer", faction: "castle", hp: 300, speed: WALK, bite: 0, cost: 3, ranged: ranged(20, 1.8, 4, "arrow"), blurb: "Stops 4 tiles away and shoots (20)." }),
  e({ kind: "marksman", name: "Marksman", faction: "castle", hp: 350, speed: WALK, bite: 0, cost: 5, ranged: ranged(20, 1.8, 4.5, "arrow", { volley: 1 }), blurb: "Shoots twice." }),
  e({ kind: "swordsman", name: "Swordsman", faction: "castle", hp: 400, shield: 600, speed: WALK, bite: 60, cost: 4, blurb: "A shield soaks 600 from straight shots." }),
  e({ kind: "crusader", name: "Crusader", faction: "castle", hp: 500, shield: 900, speed: WALK, bite: 60, biteEvery: 5, cost: 6, blurb: "Shield of 900; strikes twice as often." }),
  e({ kind: "griffin", name: "Griffin", faction: "castle", hp: 500, speed: WALK, vault: { fastSpeed: pace(2.2) }, bite: 50, cost: 3, blurb: "Swoops over the first defender." }),
  e({ kind: "royal-griffin", name: "Royal Griffin", faction: "castle", hp: 650, speed: WALK, vault: { fastSpeed: pace(2) }, bite: 60, cost: 4, blurb: "A faster swoop." }),
  e({ kind: "monk", name: "Monk", faction: "castle", hp: 400, speed: WALK, bite: 0, cost: 5, ranged: ranged(25, 2.5, 4, "holy"), heal: { amount: 100, every: sec(5), range: 1.5 },
    blurb: "Holy orbs at range; every 5 s heals a wounded ally nearby (100)." }),
  e({ kind: "cavalier", name: "Cavalier", faction: "castle", hp: 1300, speed: RUSH, bite: 70, cost: 7, cavalry: true, joust: 3, blurb: "Jousting charge: its first strike deals triple." }),
  e({ kind: "champion", name: "Champion", faction: "castle", hp: 1700, speed: RUSH, bite: 80, cost: 10, cavalry: true, joust: 3, blurb: "A heavier lance." }),
  e({ kind: "angel", name: "Angel", faction: "castle", hp: 2400, speed: WALK, vault: { fastSpeed: pace(2.5) }, bite: 150, biteEvery: 16, cost: 12, regen: 20,
    blurb: "Flies over the first defender and heals 20 HP a second." }),

  // --- Tower: Arcane Legion -------------------------------------------------
  e({ kind: "gremlin", name: "Gremlin", faction: "tower", hp: 200, speed: FAST, bite: 35, cost: 1, blurb: "Scurries in fast." }),
  e({ kind: "master-gremlin", name: "Master Gremlin", faction: "tower", hp: 300, speed: FAST, bite: 0, cost: 3, ranged: ranged(15, 1.5, 3, "stone"), blurb: "Throws balls and chains from 3 tiles." }),
  e({ kind: "stone-gargoyle", name: "Stone Gargoyle", faction: "tower", hp: 500, speed: WALK, vault: { fastSpeed: pace(2.2) }, bite: 50, cost: 3, frostImmune: true,
    blurb: "Stone wings clear the first defender; frost cannot slow it." }),
  e({ kind: "obsidian-gargoyle", name: "Obsidian Gargoyle", faction: "tower", hp: 650, speed: WALK, vault: { fastSpeed: pace(1.9) }, bite: 55, cost: 4, frostImmune: true,
    blurb: "Faster, and frost-proof." }),
  e({ kind: "stone-golem", name: "Stone Golem", faction: "tower", hp: 1800, speed: SLOW, bite: 60, cost: 4, magicResist: 0.5, blurb: "Plodding tank; spells deal half." }),
  e({ kind: "iron-golem", name: "Iron Golem", faction: "tower", hp: 3200, speed: SLOW, bite: 80, cost: 7, magicResist: 0.25, blurb: "Spells deal a quarter." }),
  e({ kind: "mage", name: "Mage", faction: "tower", hp: 400, speed: WALK, bite: 0, cost: 5, ranged: ranged(25, 2, 5, "bolt", { skipWalls: true }),
    blurb: "Magic bolts sail past walls to strike what hides behind them." }),
  e({ kind: "arch-mage", name: "Arch Mage", faction: "tower", hp: 500, speed: WALK, bite: 0, cost: 7, ranged: ranged(35, 2, 5.5, "bolt", { skipWalls: true }), blurb: "Stronger bolts (35)." }),
  e({ kind: "genie", name: "Genie", faction: "tower", hp: 700, speed: WALK, bite: 50, cost: 5, heal: { amount: 80, every: sec(4), range: 1.5 },
    blurb: "Every 4 s heals a nearby ally for 80 and breaks its chill." }),
  e({ kind: "naga", name: "Naga", faction: "tower", hp: 1500, speed: pace(5), bite: 100, biteEvery: 12, cost: 6, blurb: "Six blades, no mercy." }),
  e({ kind: "giant", name: "Giant", faction: "tower", hp: 3000, speed: SLOW, bite: 120, biteEvery: 14, cost: 9, scale: 0.9, blurb: "Enormous and patient." }),
  e({ kind: "titan", name: "Titan", faction: "tower", hp: 4000, speed: SLOW, bite: 0, cost: 14, scale: 0.9, ranged: ranged(120, 3, 5, "lightning", { lightning: true }),
    blurb: "Calls lightning (120) on the nearest defender within 5 tiles." }),

  // --- Inferno: Legions of Eeofol -------------------------------------------
  e({ kind: "imp", name: "Imp", faction: "inferno", hp: 180, speed: pace(2), bite: 30, cost: 1, blurb: "Tiny, fast, annoying." }),
  e({ kind: "familiar", name: "Familiar", faction: "inferno", hp: 250, speed: pace(2), bite: 30, cost: 2, manaDrain: 1, blurb: "Each bite drains 1 mana from the defending hero." }),
  e({ kind: "gog", name: "Gog", faction: "inferno", hp: 400, speed: WALK, bite: 0, cost: 3, ranged: ranged(50, 3.5, 5, "fireball", { lob: true }), blurb: "Lobs fireballs (50) from 5 tiles." }),
  e({ kind: "magog", name: "Magog", faction: "inferno", hp: 450, speed: WALK, bite: 0, cost: 5, ranged: ranged(40, 3.5, 5, "fireball", { lob: true, splash: true }), blurb: "Fireballs that burst over a 3×3 area (40)." }),
  e({ kind: "demon", name: "Demon", faction: "inferno", hp: 640, speed: pace(4.2), bite: 60, cost: 2, blurb: "Tough brawler." }),
  e({ kind: "horned-demon", name: "Horned Demon", faction: "inferno", hp: 900, speed: pace(4.2), bite: 65, cost: 3, blurb: "Tougher brawler." }),
  e({ kind: "hell-hound", name: "Hell Hound", faction: "inferno", hp: 700, speed: pace(2.5), bite: 50, cost: 3, cleave: "lanes", blurb: "Bites the defenders in the neighbouring lanes too." }),
  e({ kind: "cerberus", name: "Cerberus", faction: "inferno", hp: 900, speed: pace(2.5), bite: 60, cost: 5, cleave: "lanes", blurb: "Three heads, three lanes." }),
  e({ kind: "efreet", name: "Efreet", faction: "inferno", hp: 900, speed: FAST, bite: 60, cost: 4, fireImmune: true, blurb: "Ignores burning shots' bonus; fire spells deal half." }),
  e({ kind: "efreet-sultan", name: "Efreet Sultan", faction: "inferno", hp: 1100, speed: FAST, bite: 70, cost: 6, fireImmune: true, fireShield: 0.3,
    blurb: "Fire shield: melee attackers take 30% of their blow back." }),
  e({ kind: "pit-lord", name: "Pit Lord", faction: "inferno", hp: 1400, speed: SLOW, bite: 80, cost: 8, summon: { kind: "demon", every: sec(10) },
    blurb: "Every 10 s raises a Demon at its side." }),
  e({ kind: "devil", name: "Devil", faction: "inferno", hp: 700, speed: pace(4.2), bite: 60, cost: 5, teleport: true,
    blurb: "Teleports to your gate and eats its way back out. Pikes, gazes, hydras, lightning, mines and spells reach behind." }),
  e({ kind: "arch-devil", name: "Arch Devil", faction: "inferno", hp: 1100, speed: pace(4.2), bite: 90, cost: 8, teleport: true, blurb: "A deadlier Devil." }),

  // --- Fortress: Swamp Brood ------------------------------------------------
  e({ kind: "gnoll", name: "Gnoll", faction: "fortress", hp: 300, speed: WALK, bite: 50, cost: 1, blurb: "Swamp rabble." }),
  e({ kind: "gnoll-marauder", name: "Gnoll Marauder", faction: "fortress", hp: 500, speed: WALK, bite: 55, cost: 2, blurb: "Better-armed rabble." }),
  e({ kind: "lizardman", name: "Lizardman", faction: "fortress", hp: 350, speed: WALK, bite: 0, cost: 3, ranged: ranged(20, 1.8, 4, "arrow"), blurb: "Stops 4 tiles away and shoots (20)." }),
  e({ kind: "lizard-warrior", name: "Lizard Warrior", faction: "fortress", hp: 450, speed: WALK, bite: 0, cost: 4, ranged: ranged(30, 1.8, 4, "arrow"), blurb: "Arrows of 30." }),
  e({ kind: "serpent-fly", name: "Serpent Fly", faction: "fortress", hp: 250, speed: FAST, vault: { fastSpeed: pace(1.8) }, bite: 30, cost: 2, dispel: true,
    blurb: "Darts over the first defender; its sting dissolves stone-skin shells." }),
  e({ kind: "dragon-fly", name: "Dragon Fly", faction: "fortress", hp: 350, speed: FAST, vault: { fastSpeed: pace(1.6) }, bite: 35, cost: 3, dispel: true, blurb: "A faster dart." }),
  e({ kind: "basilisk", name: "Basilisk", faction: "fortress", hp: 1000, speed: WALK, bite: 60, cost: 5, stun: { every: 2, dur: sec(3) },
    blurb: "Every second bite petrifies the defender for 3 s." }),
  e({ kind: "gorgon", name: "Gorgon", faction: "fortress", hp: 1600, speed: SLOW, bite: 70, cost: 5, blurb: "An armoured bull." }),
  e({ kind: "wyvern", name: "Wyvern", faction: "fortress", hp: 900, speed: WALK, vault: { fastSpeed: pace(2.2) }, bite: 50, cost: 5, poison: { dps: 10, dur: sec(8) },
    blurb: "Flies over the first defender; bites poison (10 per second for 8 s)." }),
  e({ kind: "wyvern-monarch", name: "Wyvern Monarch", faction: "fortress", hp: 1100, speed: WALK, vault: { fastSpeed: pace(2) }, bite: 60, cost: 7, poison: { dps: 20, dur: sec(8) },
    blurb: "Stronger poison (20 per second)." }),
  e({ kind: "hydra", name: "Hydra", faction: "fortress", hp: 2600, speed: SLOW, bite: 90, biteEvery: 16, cost: 10, cleave: "lanes", scale: 0.85, radius: 0.5,
    blurb: "Every head bites: defenders in the neighbouring lanes are hit too." }),
  e({ kind: "chaos-hydra", name: "Chaos Hydra", faction: "fortress", hp: 3600, speed: SLOW, bite: 120, biteEvery: 16, cost: 14, cleave: "lanes", scale: 0.85, radius: 0.5,
    blurb: "More heads." }),

  // --- Rampart: Wild Hunt ---------------------------------------------------
  e({ kind: "centaur", name: "Centaur", faction: "rampart", hp: 450, speed: FAST, bite: 50, cost: 2, blurb: "Galloping spear." }),
  e({ kind: "centaur-captain", name: "Centaur Captain", faction: "rampart", hp: 550, speed: pace(2.5), bite: 60, cost: 3, blurb: "Faster to the fight." }),
  e({ kind: "dwarf", name: "Dwarf", faction: "rampart", hp: 1100, speed: SLOW, bite: 60, cost: 3, magicResist: 0.5, blurb: "Stubborn; spells deal half." }),
  e({ kind: "battle-dwarf", name: "Battle Dwarf", faction: "rampart", hp: 1500, speed: SLOW, bite: 70, cost: 5, magicResist: 0.5, blurb: "Even more stubborn." }),
  e({ kind: "wood-elf", name: "Wood Elf", faction: "rampart", hp: 300, speed: WALK, bite: 0, cost: 3, ranged: ranged(20, 1.5, 4.5, "arrow"), blurb: "Shoots from 4.5 tiles (20)." }),
  e({ kind: "grand-elf", name: "Grand Elf", faction: "rampart", hp: 350, speed: WALK, bite: 0, cost: 5, ranged: ranged(20, 1.5, 4.5, "arrow", { volley: 1 }), blurb: "Shoots twice." }),
  e({ kind: "pegasus", name: "Pegasus", faction: "rampart", hp: 550, speed: WALK, vault: { fastSpeed: pace(2) }, bite: 50, cost: 3, blurb: "Glides over the first defender." }),
  e({ kind: "dendroid-soldier", name: "Dendroid Soldier", faction: "rampart", hp: 2800, speed: pace(7), bite: 80, biteEvery: 14, cost: 7, blurb: "A walking fortress of bark." }),
  e({ kind: "unicorn", name: "Unicorn", faction: "rampart", hp: 1300, speed: pace(3.5), bite: 70, cost: 6, stun: { every: 3, dur: sec(3) }, blurb: "Every third strike blinds the defender for 3 s." }),
  e({ kind: "green-dragon", name: "Green Dragon", faction: "rampart", hp: 3000, speed: SLOW, vault: { fastSpeed: pace(3) }, bite: 100, biteEvery: 20, cost: 11, cleave: "line",
    scale: 0.8, radius: 0.55, blurb: "Flies over the first defender; its breath hits the defender behind too." }),
  e({ kind: "gold-dragon", name: "Gold Dragon", faction: "rampart", hp: 3800, speed: SLOW, vault: { fastSpeed: pace(3) }, bite: 140, biteEvery: 20, cost: 15, cleave: "line", magicResist: 0,
    scale: 0.8, radius: 0.55, blurb: "Immune to spells." }),

  // --- Conflux: Elemental Storm ---------------------------------------------
  e({ kind: "pixie", name: "Pixie", faction: "conflux", hp: 150, speed: pace(2), vault: { fastSpeed: pace(1.6) }, bite: 25, cost: 1, blurb: "Tiny, flits over the first defender." }),
  e({ kind: "air-elemental", name: "Air Elemental", faction: "conflux", hp: 500, speed: RUSH, bite: 45, cost: 3, blurb: "Gusts in fast." }),
  e({ kind: "storm-elemental", name: "Storm Elemental", faction: "conflux", hp: 550, speed: FAST, bite: 0, cost: 5, ranged: ranged(25, 1.8, 4, "lightning"), blurb: "Crackling bolts from 4 tiles (25)." }),
  e({ kind: "water-elemental", name: "Water Elemental", faction: "conflux", hp: 1000, speed: WALK, bite: 60, cost: 3, frostImmune: true, blurb: "Cannot be chilled or frozen." }),
  e({ kind: "ice-elemental", name: "Ice Elemental", faction: "conflux", hp: 700, speed: WALK, bite: 0, cost: 5, frostImmune: true, ranged: ranged(20, 1.8, 4, "frost"), blurb: "Frost bolts at range." }),
  e({ kind: "fire-elemental", name: "Fire Elemental", faction: "conflux", hp: 700, speed: FAST, bite: 60, cost: 4, fireImmune: true, blurb: "Fire-proof." }),
  e({ kind: "energy-elemental", name: "Energy Elemental", faction: "conflux", hp: 900, speed: FAST, bite: 70, cost: 6, fireImmune: true, fireShield: 0.3, blurb: "Burns whoever strikes it (30%)." }),
  e({ kind: "earth-elemental", name: "Earth Elemental", faction: "conflux", hp: 1300, speed: SLOW, burrow: { speed: pace(2.5) }, bite: 70, cost: 5, magicResist: 0.5,
    blurb: "Travels underground — untouchable — until it has passed under a defender, then surfaces behind it." }),
  e({ kind: "magma-elemental", name: "Magma Elemental", faction: "conflux", hp: 1800, speed: SLOW, burrow: { speed: pace(2.2) }, bite: 90, cost: 7, magicResist: 0.5, fireShield: 0.3,
    blurb: "Burrows too, and burns whoever strikes it." }),
  e({ kind: "psychic-elemental", name: "Psychic Elemental", faction: "conflux", hp: 1300, speed: WALK, bite: 60, cost: 6, cleave: "lanes", blurb: "Its mind blast hits three lanes." }),
  e({ kind: "firebird", name: "Firebird", faction: "conflux", hp: 1500, speed: WALK, vault: { fastSpeed: pace(1.8) }, bite: 90, biteEvery: 16, cost: 8, fireImmune: true, scale: 0.8,
    blurb: "Flies over the first defender; fire-proof." }),
  e({ kind: "phoenix", name: "Phoenix", faction: "conflux", hp: 2000, speed: WALK, vault: { fastSpeed: pace(1.6) }, bite: 110, biteEvery: 16, cost: 12, fireImmune: true, rebirth: true, scale: 0.8,
    blurb: "Rises once from its ashes." }),

  // --- Doom: Hell on Earth ----------------------------------------------------
  // Classic DOOM monsters, rotoscoped hex sprites; attacks after the originals: hitscan gunners,
  // straight fireballs and plasma, the Revenant's homing rockets, the Mancubus's fanned volleys.
  e({ kind: "zombieman", name: "Zombieman", faction: "doom", sprite: "doom-former-human", hp: 250, speed: WALK, bite: 0, cost: 1, undead: true,
    ranged: ranged(15, 2, 4, "bullet", { hitscan: "bullet" }), blurb: "A possessed trooper: stops 4 tiles out and fires his pistol (15, instant)." }),
  e({ kind: "shotgun-guy", name: "Shotgun Guy", faction: "doom", sprite: "doom-former-human-sergeant", hp: 350, speed: WALK, bite: 0, cost: 2, undead: true,
    ranged: ranged(30, 2.8, 3, "bullet", { hitscan: "bullet" }), blurb: "Closes to 3 tiles and blasts buckshot (30, instant)." }),
  e({ kind: "chaingunner", name: "Chaingunner", faction: "doom", sprite: "doom-former-commando", hp: 500, speed: WALK, bite: 0, cost: 4, undead: true,
    ranged: ranged(10, 2, 4.5, "bullet", { hitscan: "bullet", volley: 2 }), blurb: "Chaingun bursts of three (10 each, instant) from 4.5 tiles." }),
  e({ kind: "doom-imp", name: "Imp", faction: "doom", sprite: "doom-imp", hp: 400, speed: WALK, bite: 0, cost: 2,
    ranged: ranged(25, 2.2, 5, "hellfire"), blurb: "Hurls hellfire balls (25) from 5 tiles; they burst on the first defender in the way." }),
  e({ kind: "pinky", name: "Pinky Demon", faction: "doom", sprite: "doom-demon", hp: 800, speed: pace(3), bite: 60, cost: 3, blurb: "A charging bundle of muscle and teeth." }),
  e({ kind: "spectre", name: "Spectre", faction: "doom", sprite: "doom-demon", hp: 800, speed: pace(3), bite: 60, cost: 4, evade: 2,
    blurb: "A half-invisible Pinky: every other straight shot passes right through it." }),
  e({ kind: "lost-soul", name: "Lost Soul", faction: "doom", sprite: "doom-lost-soul", hp: 180, speed: pace(2.4), vault: { fastSpeed: pace(1.4) }, bite: 35, cost: 1, undead: true,
    blurb: "A burning skull: screams in over the first defender." }),
  e({ kind: "cacodemon", name: "Cacodemon", faction: "doom", sprite: "doom-cacodemon", hp: 1000, speed: pace(5.5), bite: 0, cost: 5,
    ranged: ranged(40, 2.5, 5, "cacoball"), blurb: "Floats to 5 tiles and spits balls of plasma (40)." }),
  e({ kind: "pain-elemental", name: "Pain Elemental", faction: "doom", sprite: "doom-pain-elemental", hp: 900, speed: SLOW, bite: 40, cost: 7,
    summon: { kind: "lost-soul", every: sec(8) }, deathSpawn: { kind: "lost-soul", count: 3 },
    blurb: "Spits a Lost Soul every 8 s; slain, it bursts and releases three more." }),
  e({ kind: "hell-knight", name: "Hell Knight", faction: "doom", sprite: "doom-hell-knight", hp: 1500, speed: SLOW, bite: 0, cost: 6,
    ranged: ranged(50, 2.5, 5, "baronball"), blurb: "Hurls green hellfire (50) from 5 tiles." }),
  e({ kind: "baron", name: "Baron of Hell", faction: "doom", sprite: "doom-baron-of-hell", hp: 2600, speed: SLOW, bite: 0, cost: 10,
    ranged: ranged(80, 2.5, 5, "baronball"), blurb: "The Hell Knight's lord: 2600 HP, green hellfire of 80." }),
  e({ kind: "arachnotron", name: "Arachnotron", faction: "doom", sprite: "doom-arachnotron", hp: 1200, speed: WALK, bite: 0, cost: 7,
    ranged: ranged(14, 0.6, 6, "plasma"), blurb: "A brain on legs with a plasma gun: a bolt (14) every 0.6 s from 6 tiles." }),
  e({ kind: "revenant", name: "Revenant", faction: "doom", sprite: "doom-revenant", hp: 900, speed: FAST, bite: 0, cost: 6, undead: true,
    ranged: ranged(50, 3, 6, "rocket", { lob: true, skipWalls: true }), blurb: "Homing shoulder rockets (50) arc over walls onto whatever hides behind them." }),
  e({ kind: "mancubus", name: "Mancubus", faction: "doom", sprite: "doom-mancubus", hp: 2200, speed: SLOW, bite: 0, cost: 10,
    ranged: ranged(40, 6, 5, "hellfire", { spread: true, volley: 2 }),
    blurb: "Twin flamethrowers: three volleys of paired fireballs (40) fanned across its lane and both neighbours." }),
  e({ kind: "arch-vile", name: "Arch-vile", faction: "doom", sprite: "doom-arch-vile", hp: 1400, speed: FAST, bite: 0, cost: 11, revive: { every: sec(12) },
    ranged: ranged(150, 5, 6, "fireball", { hitscan: "flame" }),
    blurb: "Sets a defender ablaze from 6 tiles (150, instant), and every 12 s raises the last fallen attacker." }),
  e({ kind: "spider-mastermind", name: "Spider Mastermind", faction: "doom", sprite: "doom-spider-mastermind", hp: 4000, speed: SLOW, bite: 0, cost: 14,
    scale: 0.9, radius: 0.55, ranged: ranged(25, 0.5, 6, "bullet", { hitscan: "bullet" }), blurb: "A super chaingun on a spider chassis: 25 every half second." }),
  e({ kind: "cyberdemon", name: "Cyberdemon", faction: "doom", sprite: "doom-cyberdemon", hp: 5000, speed: SLOW, bite: 0, cost: 16, magicResist: 0.5,
    scale: 0.95, radius: 0.55, ranged: ranged(110, 5, 6, "rocket", { volley: 2, blast: true }),
    blurb: "Barrages of three rockets (110) that blow apart the defenders around each hit. Spells deal half." }),

  // --- Boss and versus structures -------------------------------------------
  e({ kind: "dracolich", name: "Dracolich", faction: "necropolis", sprite: "wog-dracolich", hp: 14000, speed: 0, bite: 0, cost: 0, might: 0, recharge: 0, boss: true, undead: true,
    scale: 0.8, radius: 0.7, blurb: "The tide's master. Hovers at the edge of one lane, raises the dead, breathes death and hurls dragons." }),
  e({ kind: "tent", name: "Supply Tent", faction: "neutral", sprite: "war-first-aid-tent", hp: 1000, speed: 0, bite: 0, cost: 0, might: 75, recharge: sec(10), structure: true, radius: 0.45,
    blurb: "Versus: brings 25 Might every 20 s. Blocks shots." }),
  e({ kind: "banner", name: "War Banner", faction: "neutral", sprite: "", hp: 2500, speed: 0, bite: 0, cost: 0, might: 0, recharge: 0, structure: true, radius: 0.35,
    blurb: "Versus: the defender wins by toppling three." })
];

export const ENEMIES: Record<EnemyKind, EnemyDef> = Object.fromEntries([...ENEMY_LIST, ...OC_ENEMIES, ...OC_FIELD_ENEMIES, ...OC_ALLIES].map((def) => [def.kind, def]));

/** A faction's warband, cheapest first. */
export function factionWarband(faction: Faction): EnemyKind[] {
  return ENEMY_LIST.filter((def) => (def.faction === faction || (faction === "necropolis" && def.kind === "mummy")) && def.cost > 0)
    .sort((a, b) => a.cost - b.cost)
    .map((def) => def.kind);
}

export const TENT_INCOME = { value: 25, every: sec(20) };
export const PASSIVE_MIGHT = { value: 25, every: sec(6) };

// ---------------------------------------------------------------------------
// Hero spells

export type SpellId =
  | "magic-arrow" | "frost-ring" | "haste" | "meteor-shower" | "armageddon"
  | "earthquake" | "war-cry" | "resurrection"
  // Order & Chaos heroes' signature spells.
  | "royal-charge" | "rain-of-arrows" | "chain-lightning" | "prayer" | "earthen-bulwark" | "supply-drop"
  | "frenzy" | "inferno"
  // Order & Chaos general spells (found in the campaign).
  | "lightning-bolt" | "ice-bolt" | "blind" | "implosion" | "cure" | "death-ripple"
  // Order & Chaos content pass (after the Polish Balance Pack reprints).
  | "dispel" | "forgetfulness" | "slayer" | "counterstrike"
  // Order & Chaos Summoning Portal hero's signature spell (./order-chaos/gacha-content.ts).
  | "fortune";

export type SpellDef = {
  id: SpellId;
  name: string;
  side: "def" | "atk";
  mana: number;
  cooldown: number;
  target: "enemy" | "area" | "none";
  icon: string;
  blurb: string;
  /** Adventure stage that unlocks it (defender spells). */
  stage: number;
};

export const SPELLS: Record<SpellId, SpellDef> = {
  "magic-arrow": { id: "magic-arrow", name: "Magic Arrow", side: "def", mana: 5, cooldown: sec(2), target: "enemy", stage: 2,
    icon: "/assets/spells-magic_arrow.webp", blurb: "150 damage to one foe." },
  "frost-ring": { id: "frost-ring", name: "Frost Ring", side: "def", mana: 10, cooldown: sec(4), target: "area", stage: 5,
    icon: "/assets/spells-frost_ring.webp", blurb: "Freezes foes in a 3×3 area for 5 s (40 damage)." },
  haste: { id: "haste", name: "Haste", side: "def", mana: 8, cooldown: sec(12), target: "none", stage: 7,
    icon: "/assets/spells-haste.webp", blurb: "All defenders act 50% faster for 10 s." },
  "meteor-shower": { id: "meteor-shower", name: "Meteor Shower", side: "def", mana: 15, cooldown: sec(6), target: "area", stage: 10,
    icon: "/assets/spells-meteor_shower.webp", blurb: "500 damage to foes in a 3×3 area." },
  armageddon: { id: "armageddon", name: "Armageddon", side: "def", mana: 25, cooldown: sec(20), target: "none", stage: 12,
    icon: "/assets/tide/spell-armageddon.webp", blurb: "800 fire damage to every foe — and 150 to every defender." },
  earthquake: { id: "earthquake", name: "Earthquake", side: "atk", mana: 12, cooldown: sec(8), target: "none", stage: 0,
    icon: "/assets/spells-earthquake.webp", blurb: "The ground heaves: 60 damage to every defender." },
  "war-cry": { id: "war-cry", name: "War Cry", side: "atk", mana: 8, cooldown: sec(12), target: "none", stage: 0,
    icon: "/assets/spells-bloodlust.webp", blurb: "All attackers march and strike 50% faster for 8 s." },
  resurrection: { id: "resurrection", name: "Resurrection", side: "atk", mana: 15, cooldown: sec(10), target: "none", stage: 0,
    icon: "/assets/spell-icons/resurrection.png", blurb: "The last three fallen attackers rise at the edge of their lanes." },
  "royal-charge": { id: "royal-charge", name: "Royal Charge", side: "def", mana: 12, cooldown: sec(25), target: "area", stage: 99,
    icon: "/assets/spells-bless.webp", blurb: "A Champion thunders down the chosen lane: 1200 to every foe in it." },
  "rain-of-arrows": { id: "rain-of-arrows", name: "Rain of Arrows", side: "def", mana: 10, cooldown: sec(8), target: "area", stage: 99,
    icon: "/assets/spells-precision.webp", blurb: "Five volleys of 90 over 2.5 s on a 3×3 area — flyers too." },
  "chain-lightning": { id: "chain-lightning", name: "Chain Lightning", side: "def", mana: 12, cooldown: sec(6), target: "enemy", stage: 99,
    icon: "/assets/spells-chain_lightning.webp", blurb: "600 to one foe, then leaps to four more nearby, halving each time." },
  prayer: { id: "prayer", name: "Prayer", side: "def", mana: 14, cooldown: sec(20), target: "none", stage: 99,
    icon: "/assets/spells-prayer.webp", blurb: "Heals every defender for 300 and hastens them by 30% for 10 s." },
  "earthen-bulwark": { id: "earthen-bulwark", name: "Earthen Bulwark", side: "def", mana: 12, cooldown: sec(25), target: "area", stage: 99,
    icon: "/assets/spells-stone_skin.webp", blurb: "Raises stone walls (2500 HP, 30 s) on the empty tiles of the chosen column in three lanes." },
  "supply-drop": { id: "supply-drop", name: "Supply Drop", side: "def", mana: 18, cooldown: sec(40), target: "none", stage: 99,
    icon: "/assets/order-chaos/icons/surge.webp", blurb: "A crate falls from the sky: one Surge orb." },
  frenzy: { id: "frenzy", name: "Labyrinth Frenzy", side: "def", mana: 12, cooldown: sec(25), target: "none", stage: 99,
    icon: "/assets/spells-frenzy.webp", blurb: "Every melee troop strikes twice as hard for 10 s." },
  inferno: { id: "inferno", name: "Inferno", side: "def", mana: 20, cooldown: sec(30), target: "area", stage: 99,
    icon: "/assets/spells-inferno.webp", blurb: "Walls of fire sweep the chosen lane and both beside it: 700 to every foe in them." },
  "lightning-bolt": { id: "lightning-bolt", name: "Lightning Bolt", side: "def", mana: 8, cooldown: sec(3), target: "enemy", stage: 99,
    icon: "/assets/spells-lightning_bolt.webp", blurb: "350 to one foe — flyers too." },
  "ice-bolt": { id: "ice-bolt", name: "Ice Bolt", side: "def", mana: 9, cooldown: sec(5), target: "enemy", stage: 99,
    icon: "/assets/order-chaos/icons/ice-bolt.webp", blurb: "250 to one foe and freezes it solid for 4 s." },
  blind: { id: "blind", name: "Blind", side: "def", mana: 10, cooldown: sec(10), target: "enemy", stage: 99,
    icon: "/assets/spells-blind.webp", blurb: "One foe (not a boss) stands blinded for 8 s — no marching, biting or shooting." },
  implosion: { id: "implosion", name: "Implosion", side: "def", mana: 22, cooldown: sec(15), target: "enemy", stage: 99,
    icon: "/assets/spells-implosion.webp", blurb: "1500 to one foe, through armour." },
  cure: { id: "cure", name: "Cure", side: "def", mana: 8, cooldown: sec(12), target: "none", stage: 99,
    icon: "/assets/spells-cure.webp", blurb: "Every troop is cured of poison, curses, webs and stuns, and heals 150." },
  "death-ripple": { id: "death-ripple", name: "Death Ripple", side: "def", mana: 14, cooldown: sec(12), target: "none", stage: 99,
    icon: "/assets/spells-death_ripple.webp", blurb: "A ripple of death: 200 to every living foe on the field (the undead are untouched)." },
  dispel: { id: "dispel", name: "Dispel", side: "def", mana: 12, cooldown: sec(10), target: "area", stage: 99,
    icon: "/assets/spells-dispel.webp", blurb: "Tears the shields, helms and armour off every foe in a 3×3 area, reveals the unseen there and calms the enraged." },
  forgetfulness: { id: "forgetfulness", name: "Forgetfulness", side: "def", mana: 12, cooldown: sec(25), target: "none", stage: 99,
    icon: "/assets/spells-forgetfulness.webp", blurb: "For 10 s every ranged foe on the field forgets how to shoot: it walks in and bites instead (siege engines excepted)." },
  slayer: { id: "slayer", name: "Slayer", side: "def", mana: 14, cooldown: sec(12), target: "enemy", stage: 99,
    icon: "/assets/spells-slayer.webp", blurb: "600 to one foe — 2500 if it's a giant (a boss, a smasher, or anything of 2400 HP or more)." },
  counterstrike: { id: "counterstrike", name: "Counterstrike", side: "def", mana: 10, cooldown: sec(20), target: "none", stage: 99,
    icon: "/assets/spells-counterstrike.webp", blurb: "For 12 s every troop strikes back at each foe that bites it (60)." },
  fortune: { id: "fortune", name: "Fortune", side: "def", mana: 18, cooldown: sec(35), target: "none", stage: 99,
    icon: "/assets/spells-fortune.webp", blurb: "For 8 s every attack your troops make (a shot, a melee strike, a lightning bolt, a beam, a bomb, a dash or a slam) is lucky (double damage), and every foe slain drops 10 gold." }
};

/** Fortune: gold each foe slain while it lasts drops. */
export const FORTUNE_GOLD = 10;
/** Luck (the Summoning Portal hero's passive): the chance at full rank that a troop's attack (shot, melee strike, lightning, beam, bomb, dash, slam) is lucky (double damage). */
export const LUCK_CHANCE = 0.2;

export const DEF_SPELL_ORDER: readonly SpellId[] = ["magic-arrow", "frost-ring", "haste", "meteor-shower", "armageddon"];
export const ATK_SPELL_ORDER: readonly SpellId[] = ["earthquake", "war-cry", "resurrection"];
export const MANA_MAX = 30;
export const MANA_REGEN_EVERY = sec(2);

// ---------------------------------------------------------------------------
// Endless blessings (roguelike "entries" picked after every flag)

export type BlessingId =
  | "elven-bow" | "golden-bow" | "orb-of-fire" | "sack-of-gold" | "estates" | "cards-of-prophecy"
  | "armor-of-wonder" | "vial-of-lifeblood" | "orb-of-mana" | "necklace-of-swiftness"
  | "lions-shield" | "shackles-of-war" | "yawning-dead" | "ogres-club" | "dragon-scale-shield"
  // Order & Chaos only.
  | "surge-chalice" | "crown-of-dragontooth" | "helm-of-enlightenment" | "ambassadors-sash" | "charm-of-mana" | "endless-purse"
  | "spirit-of-oppression"
  | "pendant-second-sight" | "ring-of-sulfur" | "thunder-helmet" | "blackshard" | "dragon-wing-tabard" | "sandals-of-the-saint" | "dwarven-shield"
  // Order & Chaos Summoning Portal exclusives: the UR hero's passive and two artifacts (./order-chaos/gacha-content.ts).
  | "luck" | "orb-of-vulnerability" | "tome-of-water";

export type BlessingDef = { id: BlessingId; name: string; icon: string; blurb: string; repeatable?: boolean };

export const BLESSINGS: Record<BlessingId, BlessingDef> = {
  "elven-bow": { id: "elven-bow", name: "Bowstring of the Unicorn's Mane", icon: "/assets/artifacts_minor-bowstring_of_the_unicorns_mane.webp", blurb: "Arrows, spears and frost shots deal 30% more." },
  "golden-bow": { id: "golden-bow", name: "Golden Bow", icon: "/assets/artifacts_major-golden_bow.webp", blurb: "Straight shots pass through one more foe." },
  "orb-of-fire": { id: "orb-of-fire", name: "Orb of Tempestuous Fire", icon: "/assets/artifacts_major-orb_of_tempestuous_fire.webp", blurb: "Fire damage +50% (fireballs, Fire Wall, burning shots, eruptions, Armageddon)." },
  "sack-of-gold": { id: "sack-of-gold", name: "Endless Sack of Gold", icon: "/assets/artifacts_relic-endless_sack_of_gold.webp", blurb: "+25 gold every 15 s." },
  estates: { id: "estates", name: "Estates", icon: "/assets/abilities-estates.webp", blurb: "Gold coins collect themselves." },
  "cards-of-prophecy": { id: "cards-of-prophecy", name: "Cards of Prophecy", icon: "/assets/artifacts_major-cards_of_prophecy.webp", blurb: "Cards recharge 30% faster." },
  "armor-of-wonder": { id: "armor-of-wonder", name: "Armor of Wonder", icon: "/assets/artifacts_minor-armor_of_wonder.webp", blurb: "Defenders have 30% more HP." },
  "vial-of-lifeblood": { id: "vial-of-lifeblood", name: "Vial of Lifeblood", icon: "/assets/artifacts_major-vial_of_lifeblood.webp", blurb: "Defenders regenerate 5 HP per second." },
  "orb-of-mana": { id: "orb-of-mana", name: "Mystic Orb of Mana", icon: "/assets/artifacts_major-mystic_orb_of_mana.webp", blurb: "Mana regenerates twice as fast; +10 max mana." },
  "necklace-of-swiftness": { id: "necklace-of-swiftness", name: "Necklace of Swiftness", icon: "/assets/artifacts_minor-necklace_of_swiftness.webp", blurb: "Defenders act 20% faster." },
  "lions-shield": { id: "lions-shield", name: "Lion's Shield of Courage", icon: "/assets/artifacts_relic-lions_shield_of_courage.webp", blurb: "Every spent lane charger returns to the gate.", repeatable: true },
  "shackles-of-war": { id: "shackles-of-war", name: "Shackles of War", icon: "/assets/artifacts_major-shackles_of_war.webp", blurb: "Attackers march 15% slower." },
  "yawning-dead": { id: "yawning-dead", name: "Shield of the Yawning Dead", icon: "/assets/artifacts_minor-shield_of_the_yawning_dead.webp", blurb: "One slain foe in five drops 15 gold." },
  "ogres-club": { id: "ogres-club", name: "Ogre's Club of Havoc", icon: "/assets/artifacts_major-ogres_club_of_havoc.webp", blurb: "Melee, gazes and lightning hit 50% harder." },
  "dragon-scale-shield": { id: "dragon-scale-shield", name: "Dragon Scale Shield", icon: "/assets/artifacts_major-dragon_scale_shield.webp", blurb: "Defenders take 25% less damage from attackers." },
  ...OC_BLESSINGS
};

/** Garrison Wars' Endless offers (Order & Chaos passes its own pool in the config). */
export const BLESSING_ORDER = (Object.keys(BLESSINGS) as BlessingId[]).filter((id) => !(id in OC_BLESSINGS));

// ---------------------------------------------------------------------------
// Terrain

export type Terrain = "grass" | "night" | "graveyard" | "lava" | "cursed" | "snow" | "swamp" | "rough" | "magic" | "hell";

/**
 * `field`: the painted lane-defence field (forecourt, lawn, road and the
 * enemy staging ground beyond it; `fieldTop` shifts it up so its top border
 * frames the first lane); `backdrop`: the Heroes III battlefield it falls back
 * to while the painting loads or if it is missing. `skyRate`: gold falls from
 * the sky that many times less often (night, underground).
 */
export const TERRAINS: Record<Terrain, { name: string; backdrop: string; field: string; skyGold: boolean; ambient?: string; fieldTop?: number; skyRate?: number }> = {
  grass: { name: "Grasslands", backdrop: "/assets/battle-hex/battlefields/grtr.webp", field: "/assets/garrison/fields/meadow.webp", skyGold: true, ambient: "ambient/birds" },
  night: { name: "Subterranean", backdrop: "/assets/battle-hex/battlefields/sub.webp", field: "/assets/garrison/fields/cavern.webp", skyGold: true, skyRate: 2, ambient: "ambient/cave" },
  graveyard: { name: "Moonlit Graveyard", backdrop: "/assets/battle-hex/battlefields/cur.webp", field: "/assets/garrison/fields/night.webp", skyGold: true, skyRate: 2, ambient: "ambient/cursed-ground" },
  lava: { name: "Lava Fields", backdrop: "/assets/battle-hex/battlefields/lava.webp", field: "/assets/garrison/fields/lava.webp", skyGold: true, ambient: "ambient/fire-vents" },
  cursed: { name: "Cursed Ground", backdrop: "/assets/battle-hex/battlefields/cur.webp", field: "/assets/garrison/fields/cursed.webp", skyGold: true, ambient: "ambient/cursed-ground" },
  snow: { name: "Snow Fields", backdrop: "/assets/battle-hex/battlefields/sntr.webp", field: "/assets/garrison/fields/snow.webp", skyGold: true },
  swamp: { name: "Swamp", backdrop: "/assets/battle-hex/battlefields/swmp.webp", field: "/assets/garrison/fields/swamp.webp", skyGold: true, ambient: "ambient/frogs-1" },
  rough: { name: "Rough Lands", backdrop: "/assets/battle-hex/battlefields/rgh.webp", field: "/assets/garrison/fields/rough.webp", skyGold: true },
  magic: { name: "Magic Plains", backdrop: "/assets/battle-hex/battlefields/mag.webp", field: "/assets/garrison/fields/magic.webp", skyGold: true, ambient: "ambient/magic" },
  hell: { name: "Hell", backdrop: "/assets/battle-hex/battlefields/lava.webp", field: "/assets/garrison/fields/hell.webp", skyGold: true, ambient: "ambient/fire-vents", fieldTop: -40 }
};
