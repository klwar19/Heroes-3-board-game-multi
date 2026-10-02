/**
 * Order & Chaos: the campaign (seven worlds), Chaos Raids, Endless Siege,
 * heroes, artifacts and unit levels — and `buildOcConfig`, which turns a
 * level plus the player's choices into the simulation's GarrisonConfig.
 *
 * Progress is derived from the cleared level ids, so an unlock can never be
 * out of step with the campaign.
 */

import {
  ATK_SPELL_ORDER, CARDS, DEFENDERS, ENEMIES, SPELLS, sec,
  type BlessingId, type CardId, type DefKind, type EnemyKind, type SpellId, type Terrain
} from "../content";
import type { GarrisonConfig, GarrisonMode } from "../sim";
import { OC_ULTIMATES } from "./roster";
import { baseKind, leveledKind } from "./forms";
import { OC_HERO_MAX_RANK, clampHeroRank, heroPassiveText, heroSpellText } from "./hero-ranks";
import { OC_GACHA_ARTIFACTS, OC_GACHA_HERO } from "./gacha-content";
import { itemPerMatch } from "./treasury";
import { pool, river, rooftop, tileBlock, type BankSpot, type FieldSpot, type FieldTile, type SpawnOrigin, type WeatherStep } from "./field";

export { OC_MAX_LEVEL, baseKind, leveledKind, levelPower } from "./forms";
export { OC_HERO_MAX_RANK, OC_RANK_COST, heroPassivePower, heroSpellPower } from "./hero-ranks";

// ---------------------------------------------------------------------------
// Heroes

export type OcHeroId = "catherine" | "gelu" | "solmyr" | "adelaide" | "tazar" | "sensei" | "dace" | "luna" | "melodia";

export type OcHero = {
  id: OcHeroId;
  name: string;
  title: string;
  portrait: string;
  /** In play from the first tick (a blessing effect). */
  passive: BlessingId;
  /** Signature spell, always in the spellbook. */
  spell: SpellId;
  blurb: string;
};

export const OC_HEROES: Record<OcHeroId, OcHero> = {
  catherine: { id: "catherine", name: "Catherine", title: "Queen of Erathia", portrait: "/assets/hero_boardart-catherine.webp",
    passive: "necklace-of-swiftness", spell: "royal-charge", blurb: "Leadership: your troops act 20% faster. Royal Charge sends a Champion down a lane." },
  gelu: { id: "gelu", name: "Gelu", title: "Ranger of AvLee", portrait: "/assets/hero_boardart-gelu.webp",
    passive: "elven-bow", spell: "rain-of-arrows", blurb: "Archery: arrows, spears and frost shots deal 30% more. Rain of Arrows strikes flyers too." },
  solmyr: { id: "solmyr", name: "Solmyr", title: "Djinn Wizard", portrait: "/assets/hero_boardart-solmyr.webp",
    passive: "orb-of-mana", spell: "chain-lightning", blurb: "Sorcery: mana regenerates twice as fast, +10 max mana. Chain Lightning leaps through a crowd." },
  adelaide: { id: "adelaide", name: "Adelaide", title: "Frost Cleric", portrait: "/assets/hero_boardart-adelaide.webp",
    passive: "vial-of-lifeblood", spell: "prayer", blurb: "First Aid: your troops regenerate 5 HP a second. Prayer heals everyone and hastens them." },
  tazar: { id: "tazar", name: "Tazar", title: "Warlord of Tatalia", portrait: "/assets/hero_boardart-tazar.webp",
    passive: "dragon-scale-shield", spell: "earthen-bulwark", blurb: "Armorer: the horde deals 25% less damage. Earthen Bulwark raises walls from the ground." },
  sensei: { id: "sensei", name: "Sensei", title: "Schale's Advisor", portrait: "/assets/town-icon-blue_archive.webp",
    passive: "estates", spell: "supply-drop", blurb: "Logistics: gold coins collect themselves. Supply Drop calls in a Surge orb." },
  dace: { id: "dace", name: "Dace", title: "Minotaur Warlord", portrait: "/assets/hero_boardart-dace.webp",
    passive: "crown-of-dragontooth", spell: "frenzy", blurb: "A Nighon warlord sworn to Order. Valor: Ascension crowns build 50% faster. Labyrinth Frenzy doubles melee damage." },
  luna: { id: "luna", name: "Luna", title: "Fire Elementalist", portrait: "/assets/hero_boardart-luna.webp",
    passive: "charm-of-mana", spell: "inferno", blurb: "Fire Magic: spells recover 40% faster. Inferno sweeps three lanes with walls of fire." },
  // The Summoning Portal's UR hero (./gacha-content): never a campaign reward.
  melodia: { id: "melodia", name: OC_GACHA_HERO.name, title: OC_GACHA_HERO.title, portrait: OC_GACHA_HERO.portrait,
    passive: OC_GACHA_HERO.passive, spell: OC_GACHA_HERO.spell, blurb: OC_GACHA_HERO.blurb }
};

/** Heroes only the Summoning Portal brings. */
export const OC_GACHA_HEROES: readonly OcHeroId[] = ["melodia"];

export const OC_HERO_ORDER: readonly OcHeroId[] = ["catherine", "gelu", "solmyr", "adelaide", "tazar", "sensei", "dace", "luna", "melodia"];

/** The rank a hero joins at (heroes recruited later in the campaign arrive seasoned). */
export const OC_HERO_JOIN_RANK: Readonly<Record<OcHeroId, number>> = {
  catherine: 1, gelu: 1, solmyr: 1, adelaide: 2, tazar: 2, sensei: 2, dace: 3, luna: 3, melodia: 2
};

/** The hero's rank: the one forged, never below the rank it joined at. */
export function heroRankOf(id: OcHeroId, forged: Readonly<Record<string, number>>): number {
  return clampHeroRank(Math.max(OC_HERO_JOIN_RANK[id] ?? 1, forged[id] ?? 1));
}

/** The highest rank the Forge can reach yet: one more after each of worlds 1–4 (the levels from world 5 on assume a full-strength hero). */
export function heroRankCap(cleared: readonly string[]): number {
  return Math.min(OC_HERO_MAX_RANK, 1 + [1, 2, 3, 4].filter((world) => worldCleared(world, cleared)).length);
}

/** The hero at a rank, in words: the passive, then the signature spell, with this rank's numbers. */
export function heroRankText(id: OcHeroId, rank: number): string {
  const hero = OC_HEROES[id];
  return `${heroPassiveText(hero.passive, rank)} ${SPELLS[hero.spell].name}: ${heroSpellText(hero.spell, rank)}`;
}

/** Artifacts the player can equip (the heroes' passives are theirs alone). */
export const OC_ARTIFACTS: readonly BlessingId[] = [
  "sack-of-gold", "surge-chalice", "golden-bow", "armor-of-wonder", "yawning-dead", "cards-of-prophecy", "shackles-of-war", "ogres-club", "orb-of-fire",
  "endless-purse", "ambassadors-sash", "spirit-of-oppression", "helm-of-enlightenment",
  // The content pass (after the Polish Balance Pack reprints).
  "pendant-second-sight", "ring-of-sulfur", "thunder-helmet", "blackshard", "dragon-wing-tabard", "sandals-of-the-saint", "dwarven-shield"
];

/** General spells, in unlock order (the hero's signature spell comes first in the book). */
export const OC_SPELLS: readonly SpellId[] = [
  "magic-arrow", "frost-ring", "haste", "meteor-shower", "armageddon", "lightning-bolt", "ice-bolt", "blind", "implosion", "cure", "death-ripple",
  "dispel", "forgetfulness", "slayer", "counterstrike"
];
/** General spells a hero carries into battle (the signature spell is extra). */
export const OC_SPELLBOOK_SIZE = 5;

// ---------------------------------------------------------------------------
// Levels

export type OcGoal = { kind: "lost"; max: number } | { kind: "spent"; max: number } | { kind: "chargers" };

/** `altar`: opens the Ascension Altar (units' ultimate forms). */
export type OcReward = { units?: DefKind[]; hero?: OcHeroId; artifact?: BlessingId; spell?: SpellId; altar?: boolean };

export type OcLevelKind = "battle" | "last-stand" | "conveyor" | "protect" | "boss" | "raid" | "endless";

export type OcLevel = {
  id: string;
  /** 1-7 for the campaign, 0 for Endless and the raids. */
  world: number;
  name: string;
  brief: string;
  kind: OcLevelKind;
  terrain: Terrain;
  lanes: number[];
  waves: number;
  enemies: EnemyKind[];
  featured?: EnemyKind;
  herald?: EnemyKind;
  /** The world boss that leads the last wave (its fall wins the battle). */
  warboss?: EnemyKind;
  difficulty: number;
  startGold: number;
  /** Chance a wave foe carries a Surge orb. */
  surgeChance: number;
  startSurges?: number;
  goals: OcGoal[];
  reward: OcReward;
  /** Pre-placed Lawful troops (protect levels: the ones that must survive; raids: the defence). */
  preset?: { kind: DefKind; lane: number; col: number; protect?: boolean }[];
  graves?: { lane: number; col: number }[];
  conveyorPool?: CardId[];
  boss?: "dracolich";
  /** Raids: the Chaos cards and starting Might. */
  atkCards?: EnemyKind[];
  startMight?: number;
  // --- The battlefield (order-chaos/field.ts: rules, numbers and the text the player is shown) ---
  /** Lawn tiles: water (the pool), bridges, the roof and its ridge, ruins, brambles, clover. */
  tiles?: FieldTile[];
  /** A night battle: no gold from the sky; nocturnal troops awake (by day they sleep until a Wake-Up Brew). */
  night?: boolean;
  /** The weather, from the start or turning at a wave. */
  weather?: WeatherStep[];
  /** Part of each wave comes out of the water, drops from the sky, or climbs out of tunnels behind the lines. */
  origins?: SpawnOrigin[];
  /** Lawful landmarks standing from the start (Windmill, Magic Well, Shrine of Magic, Pillar of Fire). */
  landmarks?: FieldSpot<DefKind>[];
  /** Chaos structures standing from the start (crypts, treasure chests). */
  structures?: FieldSpot<EnemyKind>[];
  /** Creature banks and the foes asleep around them. */
  banks?: BankSpot[];
  /** Packets the field hands out on top of the chosen hand (Raft, Crate, Rooting Boar, Wake-Up Brew). */
  fieldCards?: CardId[];
};

export type OcWorld = { id: number; name: string; terrain: Terrain; art: string; blurb: string; levels: OcLevel[] };

const ALL = [0, 1, 2, 3, 4];

const lost = (max: number): OcGoal => ({ kind: "lost", max });
const spent = (max: number): OcGoal => ({ kind: "spent", max });
const noCharge: OcGoal = { kind: "chargers" };

type LevelInput = Omit<OcLevel, "lanes" | "surgeChance" | "startGold" | "kind"> & Partial<Pick<OcLevel, "lanes" | "surgeChance" | "startGold" | "kind">>;
const lvl = (input: LevelInput): OcLevel => ({ lanes: ALL, surgeChance: 0.12, startGold: 150, kind: "battle", ...input });

export const OC_WORLDS: readonly OcWorld[] = [
  { id: 1, name: "Erathian Meadows", terrain: "grass", art: "/assets/order-chaos/worlds/meadows.webp",
    blurb: "The dead of Deyja cross the border. Hold the farmland roads.",
    levels: [
      lvl({ id: "w1-1", world: 1, name: "The Road to Erathia", lanes: [1, 2, 3], waves: 6, terrain: "grass", difficulty: 0.6,
        brief: "Raise Peasants to fill the treasury, then Longbowmen to hold the road. A glowing foe drops a Surge orb: collect it, then click the orb button (or press G) and a unit to unleash its Surge.",
        enemies: ["oc-shambler"], surgeChance: 0.2, startSurges: 1, goals: [lost(0), spent(900)], reward: { units: ["oc-dwarf"] } }),
      lvl({ id: "w1-2", world: 1, name: "Helms of the Fallen", lanes: [1, 2, 3], waves: 8, terrain: "grass", difficulty: 0.8,
        brief: "Troglodytes wear plundered helms that soak 450 damage. Dwarves hold them while your archers work. A TREASURE CHEST lies on the middle road: shoot it open for 100 gold.",
        enemies: ["oc-shambler", "oc-trog-helm"], featured: "oc-trog-helm", goals: [lost(1), noCharge], reward: { units: ["oc-sapper"], spell: "magic-arrow" },
        structures: [{ kind: "oc-chest", lane: 2, col: 7 }] }),
      lvl({ id: "w1-3", world: 1, name: "Shields of Bone", waves: 10, terrain: "grass", difficulty: 0.9,
        brief: "All five roads. Skeleton Shieldbearers block arrows from the front — a Gremlin Sapper's charge goes under the shield.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer"], featured: "oc-shieldbearer", goals: [lost(2), spent(2200)], reward: { units: ["oc-snow-elf", "oc-gargoyle"] } }),
      lvl({ id: "w1-4", world: 1, kind: "last-stand", name: "Last Stand at the Mill", waves: 8, terrain: "grass", difficulty: 0.95, startGold: 1500,
        brief: "LAST STAND: no gold from the sky. Spend your 1500 on a defence (no recharge while you plan), then sound the horn. Imp Runners sprint. The MILL on the middle road pays 25 gold every 12 s while it stands: the only gold you'll see.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-imp"], featured: "oc-imp", surgeChance: 0.15, goals: [lost(3), noCharge],
        reward: { units: ["oc-immolate"], artifact: "sack-of-gold" },
        landmarks: [{ kind: "oc-windmill", lane: 2, col: 1 }] }),
      lvl({ id: "w1-5", world: 1, kind: "boss", name: "The Hound Pack", waves: 12, terrain: "grass", difficulty: 1,
        brief: "Hell Hounds race in and leap your first defender. Put something worth biting behind it. BOSS: the Kennel Abomination leads the last assault. Red marks show where its next blow will land; a lane's Champion throws it back, and its fall wins the battle.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-imp", "oc-hellhound"], featured: "oc-hellhound", herald: "oc-hellhound", warboss: "oc-boss-abomination",
        goals: [lost(3), spent(3000)], reward: { units: ["oc-sylph"], hero: "gelu" } })
    ] },
  { id: 2, name: "Frozen Vori", terrain: "snow", art: "/assets/order-chaos/worlds/snow.webp",
    blurb: "Chaos swarms over the glaciers. Some of it flies, and some of it leaves the road iced behind it.",
    levels: [
      lvl({ id: "w2-1", world: 2, name: "Wings over the Ice", waves: 10, terrain: "snow", difficulty: 0.9,
        brief: "FLYING Dragon Flies skim over every defender. A Sylph's gale blows flyers off the field — raise one in each lane. A WINDMILL on the middle road pays 25 gold every 12 s while it stands; the horde will try to wreck it.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-imp", "oc-dragonfly"], featured: "oc-dragonfly", goals: [lost(2), noCharge], reward: { units: ["oc-yuuka", "oc-elf-band"] },
        landmarks: [{ kind: "oc-windmill", lane: 2, col: 2 }] }),
      lvl({ id: "w2-2", world: 2, name: "Cutpurses", waves: 12, terrain: "snow", difficulty: 0.95,
        brief: "Kobolds pocket your gold with every strike. Slay them to get it back. Three TREASURE CHESTS lie on the lawn: shoot them open for 100 gold each — a Kobold that walks up to one pockets it.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-kobold", "oc-dragonfly", "oc-treasure"], featured: "oc-kobold", goals: [lost(2), spent(3000)],
        reward: { units: ["oc-cyclops"], artifact: "surge-chalice" },
        structures: [{ kind: "oc-chest", lane: 0, col: 6 }, { kind: "oc-chest", lane: 2, col: 7 }, { kind: "oc-chest", lane: 4, col: 6 }] }),
      lvl({ id: "w2-3", world: 2, kind: "conveyor", name: "The Frost Caravan", waves: 12, terrain: "snow", difficulty: 1, startGold: 0,
        brief: "CONVEYOR: no gold — a caravan hands you troops. Place them before the belt fills. From wave 5 a BLIZZARD blows: the horde slows by a quarter, your troops by 15%, and every chill and freeze lasts twice as long. Jotunn Frostcallers seal a troop in ice every 9 s: a Brimstone Dwarf (Dwarf + Immolate) keeps the troops around it warm.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-imp", "oc-hellhound", "oc-dragonfly", "oc-frostcaller"], featured: "oc-frostcaller",
        conveyorPool: ["oc-longbow", "oc-longbow", "oc-snow-elf", "oc-dwarf", "oc-sapper", "oc-sylph", "oc-cyclops", "oc-immolate", "oc-armadillo"],
        goals: [lost(3), noCharge], reward: { units: ["oc-iron-golem", "oc-automaton"], spell: "frost-ring" },
        weather: [{ kind: "clear" }, { kind: "blizzard", wave: 5 }] }),
      lvl({ id: "w2-4", world: 2, name: "Revellers", waves: 12, terrain: "snow", difficulty: 1,
        brief: "Satyrs bound over every defender in their way, and Frost Mammoths roll over them, leaving ICE that nothing can be planted on until it melts (fire melts it at once). Only something tall — an Iron Golem — stops them both. A CYCLOPS STOCKPILE stands mid-lawn with its guards asleep: break it open and the Cyclops inside fights for you.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-kobold", "oc-satyr", "oc-dragonfly", "oc-mammoth"], featured: "oc-satyr", goals: [lost(2), spent(3200)],
        reward: { units: ["oc-pikeman", "oc-lizard"], artifact: "golden-bow" },
        banks: [{ kind: "oc-bank-cyclops", lane: 2, col: 6, guards: ["oc-satyr", "oc-shieldbearer"] }] }),
      lvl({ id: "w2-5", world: 2, kind: "boss", name: "Death Riders", waves: 15, terrain: "snow", difficulty: 1.05,
        brief: "Armoured Death Riders gallop in; pikes deal double to cavalry. Frost Mammoths ice the road and Sledge Wolves race across the ice at three times the pace. A blizzard sets in at wave 8. BOSS: the Frost Wyrm leads the last assault; its breath seals troops in ice.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-kobold", "oc-satyr", "oc-death-rider", "oc-mammoth", "oc-sledders"], featured: "oc-death-rider", herald: "oc-death-rider", warboss: "oc-boss-wyrm",
        goals: [lost(3), noCharge], reward: { units: ["oc-storm"], hero: "solmyr", altar: true },
        weather: [{ kind: "clear" }, { kind: "blizzard", wave: 8 }] })
    ] },
  { id: 3, name: "Tatalian Mire", terrain: "swamp", art: "/assets/order-chaos/worlds/swamp.webp",
    blurb: "In the swamps the dead do not stay buried, and the roads run under water.",
    levels: [
      lvl({ id: "w3-1", world: 3, name: "Powder in the Reeds", waves: 12, terrain: "swamp", difficulty: 1,
        brief: "The middle road is a flooded channel: a troop needs a RAFT under it (a field packet, 25 gold) to stand in the water, and the horde wades through at 75% pace. Goblin Sappers light a keg at your line: 2.5 s later the 3×3 goes up. Frost and stuns hold the fuse.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-imp", "oc-goblin", "oc-dragonfly"], featured: "oc-goblin", goals: [lost(2), spent(3000)], reward: { units: ["oc-sharpshooter", "oc-couatl"] },
        tiles: pool([2]), fieldCards: ["oc-raft"] }),
      lvl({ id: "w3-2", world: 3, kind: "protect", name: "The Enchanted Grove", waves: 12, terrain: "swamp", difficulty: 1,
        brief: "PROTECT: the two Enchanters in the grove must survive. BRAMBLES ring the grove: foes crawl through them at half pace and take 20 a second; nothing can be planted in them, and fire — a Goblin's keg too — burns them away. Ladder Hobgoblins plant ladders on the first big wall they meet, and then the whole lane climbs over it. Slay them before they plant.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-goblin", "oc-kobold", "oc-hobgoblin"], featured: "oc-hobgoblin",
        preset: [{ kind: "oc-enchanter", lane: 1, col: 4, protect: true }, { kind: "oc-enchanter", lane: 3, col: 4, protect: true }],
        goals: [lost(2), noCharge], reward: { units: ["oc-gnome"], artifact: "armor-of-wonder" },
        tiles: [...tileBlock("bramble", [0, 1, 2, 3, 4], [6]), ...tileBlock("bramble", [1, 3], [7])] }),
      lvl({ id: "w3-3", world: 3, name: "Blood Rage", waves: 14, terrain: "swamp", difficulty: 1.05,
        brief: "Orc Berserkers strike twice as fast once wounded below half. Burst them down. It's RAINING: fire deals half (theirs too) and lightning leaps one foe further. Two roads are flooded — Rafts first. A DWARVEN TREASURY stands on the dry middle road with its guards asleep: break it and the Dwarf inside joins you.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-goblin", "oc-berserker", "oc-satyr", "oc-hexmaster", "oc-treasure"], featured: "oc-berserker", goals: [lost(3), spent(3600)],
        reward: { units: ["oc-undine"], spell: "haste" },
        tiles: pool([1, 3]), weather: [{ kind: "rain" }], fieldCards: ["oc-raft"],
        banks: [{ kind: "oc-bank-dwarf", lane: 2, col: 6, guards: ["oc-berserker", "oc-shieldbearer"] }] }),
      lvl({ id: "w3-4", world: 3, name: "The Drowned Graves", waves: 14, terrain: "swamp", difficulty: 1,
        brief: "GRAVES stand on the lawn: they block planting, soak shots, and the dead climb out of them at every great assault — plant a ROOTING BOAR on one and it eats it. DROWNED DEAD swim under the flooded roads where nothing can aim at them, and some of the horde surfaces from the water mid-lawn.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-goblin", "oc-death-rider", "oc-dragonfly", "oc-drowned"], featured: "oc-drowned",
        graves: [{ lane: 0, col: 6 }, { lane: 0, col: 4 }, { lane: 2, col: 7 }, { lane: 2, col: 5 }, { lane: 4, col: 6 }, { lane: 4, col: 4 }],
        goals: [lost(3), noCharge], reward: { units: ["oc-halfling", "oc-javelin"], artifact: "yawning-dead" },
        tiles: pool([1, 3], 3), origins: [{ kind: "water", share: 0.2, from: 3 }], fieldCards: ["oc-boar", "oc-raft"] }),
      lvl({ id: "w3-5", world: 3, kind: "boss", name: "The Necromancer's Mire", waves: 16, terrain: "swamp", difficulty: 1.05,
        brief: "Necromancers raise graves as they walk; Sharpshooters and Halflings clear them, and Rooting Boars eat them. A CRYPT stands on the middle road: every 20 s one of the dead climbs out — smash it (2000) or feed it to a Boar (10 s). Rain from wave 8. BOSS: the Mire Lich leads the last assault: death bolts at your costliest troops, and graves raised on open ground.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-berserker", "oc-goblin", "oc-hobgoblin", "oc-necromancer", "oc-drowned"], featured: "oc-necromancer", herald: "oc-necromancer", warboss: "oc-boss-lich",
        goals: [lost(3), spent(4200)], reward: { units: ["oc-ice"], hero: "adelaide" },
        tiles: pool([0, 4], 4), structures: [{ kind: "oc-crypt", lane: 2, col: 7 }], weather: [{ kind: "clear" }, { kind: "rain", wave: 8 }], fieldCards: ["oc-boar", "oc-raft"] })
    ] },
  { id: 4, name: "Bracada Heights", terrain: "magic", art: "/assets/order-chaos/worlds/magic.webp",
    blurb: "Chaos sorcery over the cloud towers: gazes, hexes, snatching claws — and a fight on the rooftops.",
    levels: [
      lvl({ id: "w4-1", world: 4, name: "Stone Gaze", waves: 14, terrain: "magic", difficulty: 1,
        brief: "Medusa Queens stop out of reach and turn your troops to stone for 4 s. A MAGIC WELL behind your line gives your hero 2 mana every 8 s while it stands.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-kobold", "oc-medusa", "oc-dragonfly"], featured: "oc-medusa", goals: [lost(3), noCharge],
        reward: { units: ["oc-enchanter", "oc-shaman"], artifact: "pendant-second-sight" },
        landmarks: [{ kind: "oc-well", lane: 2, col: 1 }] }),
      lvl({ id: "w4-2", world: 4, name: "Harpies!", waves: 14, terrain: "magic", difficulty: 1,
        brief: "Harpy Snatchers drop onto your costliest troop and carry it off after 4 s — slay them first, or blow them away with a Sylph. From wave 3, winged beasts DROP part of each wave straight onto the middle of the lawn. Stormbirds fly a Troglodyte over your walls and drop it behind your front line: shoot them down early.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-goblin", "oc-satyr", "oc-hobgoblin", "oc-harpy", "oc-stormbird"], featured: "oc-harpy", goals: [lost(3), spent(3800)],
        reward: { units: ["oc-arch-mage", "oc-aegis"], artifact: "cards-of-prophecy" },
        origins: [{ kind: "sky", share: 0.2, from: 3 }] }),
      lvl({ id: "w4-3", world: 4, kind: "last-stand", name: "The Tower Holds", waves: 12, terrain: "magic", difficulty: 1.05, startGold: 3500,
        brief: "LAST STAND on the tower ROOF: 3500 gold and no more. Every troop needs a CRATE under it (a field packet, 25 gold), and straight shots fired from behind the ridge (the middle column) hit the slope — boulders and grenades fly over it. Goblin Siege Catapults lob boulders at your REARMOST troops; Aegis domes turn them aside. Plan the whole defence, then sound the horn.",
        enemies: ["oc-shieldbearer", "oc-trog-helm", "oc-berserker", "oc-satyr", "oc-medusa", "oc-death-rider", "oc-catapult"], featured: "oc-catapult", surgeChance: 0.18, startSurges: 1,
        goals: [lost(4), noCharge], reward: { units: ["oc-genie", "oc-psychic"], spell: "meteor-shower" },
        tiles: rooftop(ALL, 4), fieldCards: ["oc-crate"] }),
      lvl({ id: "w4-4", world: 4, name: "Evil Eyes", waves: 15, terrain: "magic", difficulty: 1.05,
        brief: "On the rooftops again (Crates first; the ridge is the sixth column). Evil Eyes stare past walls to burn what stands behind them; Psychic Watchers' domes turn lobbed shots aside (arrows, blades and lightning go straight through). A SHRINE OF MAGIC drops a Surge orb every 40 s while it stands.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-goblin", "oc-evil-eye", "oc-harpy", "oc-watcher"], featured: "oc-evil-eye", goals: [lost(3), spent(4200)],
        reward: { units: ["oc-cleric", "oc-gunslinger"], artifact: "shackles-of-war" },
        tiles: rooftop(ALL, 5), landmarks: [{ kind: "oc-shrine", lane: 2, col: 0 }], fieldCards: ["oc-crate"] }),
      lvl({ id: "w4-5", world: 4, kind: "boss", name: "Bloodlust Drums", waves: 16, terrain: "magic", difficulty: 1,
        brief: "Ogre Shamans drum the horde into a frenzy around them — kill the drummers first. The drums call a THUNDERSTORM at wave 6: lightning strikes marked tiles, foes and troops alike (Aegis domes shield your troops). On the roof: Crates first. BOSS: Grogg the Warchief leads the last assault: war drums, hurled boulders and a slam.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-berserker", "oc-medusa", "oc-ogre-shaman", "oc-catapult", "oc-dragonfly", "oc-hexmaster"], featured: "oc-ogre-shaman", herald: "oc-ogre-shaman", warboss: "oc-boss-warchief",
        goals: [lost(4), noCharge], reward: { units: ["oc-pixie", "oc-moon-sprite"], hero: "tazar" },
        tiles: rooftop(ALL, 4), weather: [{ kind: "clear" }, { kind: "thunderstorm", wave: 6 }], fieldCards: ["oc-crate"] })
    ] },
  { id: 5, name: "Nighon Depths", terrain: "night", art: "/assets/order-chaos/worlds/depths.webp",
    blurb: "Night under the earth: no gold falls at all, the night folk wake — and things come up from below.",
    levels: [
      lvl({ id: "w5-1", world: 5, name: "Tunnels", waves: 14, terrain: "night", difficulty: 1, startGold: 250, night: true,
        brief: "NIGHT: no gold falls — every coin comes from your gold-makers, and the night folk (Pixies, Moon Sprites) are wide awake. Sandworms tunnel under the whole lawn and burst out behind your lines, and from wave 3 some of the horde climbs out of TUNNELS right at your gate. Keep something in the back. Mantis Reapers spin every third stroke and cut every troop around them.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-kobold", "oc-sandworm", "oc-goblin", "oc-mantis"], featured: "oc-sandworm", goals: [lost(3), spent(3600)],
        reward: { units: ["oc-ballista", "oc-faerie"], spell: "dispel" },
        origins: [{ kind: "flank", share: 0.12, from: 3 }] }),
      lvl({ id: "w5-2", world: 5, name: "Monarchs of the Air", waves: 15, terrain: "night", difficulty: 1, startGold: 250, night: true,
        brief: "Wyvern Monarchs: FLYING and 1100 HP. Ballistae, Sharpshooters, lightning and Sylphs bring them down. A DWARVEN TREASURY stands mid-lawn with its guards asleep beside it: they wake when struck or at the first great assault. Break it open and the Dwarf inside joins you.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-dragonfly", "oc-wyvern", "oc-sandworm"], featured: "oc-wyvern", goals: [lost(3), noCharge],
        reward: { units: ["oc-aris", "oc-magic-el"], artifact: "dragon-wing-tabard" },
        banks: [{ kind: "oc-bank-dwarf", lane: 2, col: 5, guards: ["oc-trog-helm", "oc-shieldbearer", "oc-kobold"] }] }),
      lvl({ id: "w5-3", world: 5, kind: "conveyor", name: "The Deep Mine Cart", waves: 15, terrain: "night", difficulty: 1.05, startGold: 0, night: true,
        brief: "CONVEYOR: the mine cart brings war machines, the night folk, Rafts and Wake-Up Brews. An underground river crosses the lawn with two BRIDGES. NIGHTMARES' whinnies put your troops to SLEEP — pour a Brew on a sleeper to wake it.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-berserker", "oc-sandworm", "oc-wyvern", "oc-goblin", "oc-medusa", "oc-nightmare"], featured: "oc-nightmare",
        conveyorPool: ["oc-longbow", "oc-ballista", "oc-iron-golem", "oc-cyclops", "oc-halfling", "oc-sylph", "oc-storm", "oc-ice", "oc-sharpshooter", "oc-arch-mage", "oc-pixie", "oc-magic-el", "oc-armadillo", "oc-big-armadillo"],
        goals: [lost(3), noCharge], reward: { units: ["oc-leprechaun", "oc-steel-elf"], artifact: "ogres-club" },
        tiles: river(5, ALL, [1, 3]), fieldCards: ["oc-raft", "oc-brew"] }),
      lvl({ id: "w5-4", world: 5, name: "Sultans of Flame", waves: 16, terrain: "night", difficulty: 1.05, startGold: 250, night: true,
        brief: "Efreet Sultans shrug off burning shots and scorch the melee that strikes them. GRAVES dot the cavern floor: the dead climb out at every great assault — plant a Rooting Boar on one to eat it.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-kobold", "oc-sandworm", "oc-efreet", "oc-evil-eye", "oc-fire-messenger"], featured: "oc-efreet", goals: [lost(3), spent(4500)],
        reward: { units: ["oc-crusader", "oc-magma"], artifact: "ring-of-sulfur" },
        graves: [{ lane: 0, col: 5 }, { lane: 1, col: 7 }, { lane: 2, col: 6 }, { lane: 3, col: 5 }, { lane: 4, col: 7 }, { lane: 2, col: 4 }], fieldCards: ["oc-boar"] }),
      lvl({ id: "w5-5", world: 5, kind: "boss", name: "The Spider's Web", waves: 16, terrain: "night", difficulty: 0.9, startGold: 250, night: true,
        brief: "Cave Trolls regenerate: burst damage wins here. BOSS: Arachne, the Web Queen, leads the last assault: she webs your costliest troops and sends her Spider Princesses in. A CRYPT door opens on the middle road, and from wave 5 some of the horde climbs out of tunnels at your gate.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-berserker", "oc-troll", "oc-wyvern", "oc-sandworm", "oc-mantis"], featured: "oc-troll", warboss: "oc-boss-arachne",
        goals: [lost(4), noCharge], reward: { units: ["oc-ammo", "oc-lamplighter"], hero: "sensei" },
        structures: [{ kind: "oc-crypt", lane: 2, col: 7 }], origins: [{ kind: "flank", share: 0.08, from: 5 }], fieldCards: ["oc-boar"] })
    ] },
  { id: 6, name: "Deyja Barrows", terrain: "graveyard", art: "/assets/order-chaos/worlds/barrows.webp",
    blurb: "The heart of the undead, wrapped in night and fog: the vampire queen and her court.",
    levels: [
      lvl({ id: "w6-1", world: 6, name: "Carmilla's Court", waves: 16, terrain: "graveyard", difficulty: 1, startGold: 250, night: true,
        brief: "Carmilla heals for everything she bites and rises once when slain: hit her twice as hard. FOG: foes more than 5 tiles out are hidden and nothing aims at them, except in lanes a Lamplighter or the PILLAR OF FIRE lights; a Sylph's gale clears its lane for 12 s. The middle road is flooded.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-death-rider", "oc-carmilla", "oc-harpy", "oc-drowned", "oc-kitsune"], featured: "oc-carmilla", goals: [lost(3), spent(4500)],
        reward: { units: ["oc-hina"], artifact: "sandals-of-the-saint" },
        tiles: pool([2]), weather: [{ kind: "fog" }], landmarks: [{ kind: "oc-pillar", lane: 1, col: 1 }], fieldCards: ["oc-raft"] }),
      lvl({ id: "w6-2", world: 6, name: "Field of Stones", waves: 16, terrain: "graveyard", difficulty: 1.05, startGold: 250, night: true,
        brief: "Graves everywhere, Necromancers raising more, and two CRYPTS letting the dead out. Rooting Boars eat graves and crypts alike. The fog rolls in at wave 10. Tentacle Eaters drag a troop toward them every 8 s (tall troops won't budge); Sea Witches stop short and hex your troops to half speed.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-necromancer", "oc-berserker", "oc-sea-witch", "oc-dragonfly", "oc-eater"], featured: "oc-eater",
        graves: [{ lane: 0, col: 5 }, { lane: 0, col: 7 }, { lane: 1, col: 6 }, { lane: 2, col: 5 }, { lane: 3, col: 6 }, { lane: 4, col: 5 }, { lane: 4, col: 7 }],
        goals: [lost(3), noCharge], reward: { units: ["oc-salamander", "oc-rafflesia"] },
        structures: [{ kind: "oc-crypt", lane: 1, col: 8 }, { kind: "oc-crypt", lane: 3, col: 8 }], weather: [{ kind: "clear" }, { kind: "fog", wave: 10 }], fieldCards: ["oc-boar"] }),
      lvl({ id: "w6-3", world: 6, kind: "protect", name: "The Last Chapel", waves: 16, terrain: "graveyard", difficulty: 1.05, startGold: 250, night: true,
        brief: "PROTECT: three Zealot Clerics hold the chapel. None may fall. Hexing Sorceresses turn your guards into sheep — a hexed troop still blocks, but cannot fight. The chapel's CLOVER makes the troop on it act 25% faster. Fog from wave 6: light the lanes.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-carmilla", "oc-medusa", "oc-evil-eye", "oc-harpy", "oc-death-rider", "oc-sorceress", "oc-mantis"], featured: "oc-sorceress",
        preset: [{ kind: "oc-cleric", lane: 0, col: 2, protect: true }, { kind: "oc-cleric", lane: 2, col: 2, protect: true }, { kind: "oc-cleric", lane: 4, col: 2, protect: true }],
        goals: [lost(3), spent(4800)], reward: { units: ["oc-phoenix"], artifact: "orb-of-fire" },
        tiles: [{ lane: 1, col: 3, kind: "clover" }, { lane: 3, col: 3, kind: "clover" }, { lane: 0, col: 1, kind: "clover" }, { lane: 4, col: 1, kind: "clover" }],
        weather: [{ kind: "clear" }, { kind: "fog", wave: 6 }] }),
      lvl({ id: "w6-4", world: 6, name: "Dread Cavalry", waves: 18, terrain: "graveyard", difficulty: 1.05, startGold: 250, night: true,
        brief: "Dread Knights: 1100 armour and a Death Blow every third strike. A barrow MOAT crosses the lawn with one bridge in the middle; the cavalry wades through it at 75% pace. Rain from wave 10.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-death-rider", "oc-dread-knight", "oc-necromancer", "oc-wyvern", "oc-nightmare", "oc-warlord"], featured: "oc-dread-knight", goals: [lost(4), noCharge],
        reward: { units: ["oc-first-aid", "oc-maiden"], artifact: "blackshard" },
        tiles: river(6, ALL, [2]), weather: [{ kind: "clear" }, { kind: "rain", wave: 10 }], fieldCards: ["oc-raft", "oc-brew"] }),
      lvl({ id: "w6-5", world: 6, kind: "boss", name: "The Pit Lord's Harvest", waves: 18, terrain: "graveyard", difficulty: 0.95, startGold: 250, night: true,
        brief: "Pit Lords raise the fallen Chaos over and over. Kill the Pit Lord and the harvest ends. Two CRYPTS, a flooded middle road, fog — and a THUNDERSTORM from wave 14. BOSS: the Barrow King leads the last assault; his blood drain heals him.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-carmilla", "oc-dread-knight", "oc-pit-lord", "oc-drowned", "oc-hexmaster"], featured: "oc-pit-lord", herald: "oc-pit-lord", warboss: "oc-boss-barrow-king",
        goals: [lost(4), spent(5500)], reward: { units: ["oc-akagi"], spell: "armageddon" },
        tiles: pool([2], 3), structures: [{ kind: "oc-crypt", lane: 0, col: 7 }, { kind: "oc-crypt", lane: 4, col: 7 }],
        weather: [{ kind: "fog" }, { kind: "thunderstorm", wave: 14 }], landmarks: [{ kind: "oc-pillar", lane: 2, col: 0 }], fieldCards: ["oc-boar", "oc-raft"] })
    ] },
  { id: 7, name: "Eeofol Hellgate", terrain: "hell", art: "/assets/order-chaos/worlds/hellgate.webp",
    blurb: "The source of the horde. Close the gate.",
    levels: [
      lvl({ id: "w7-1", world: 7, name: "Lucifina's Call", waves: 18, terrain: "lava", difficulty: 1.05,
        brief: "Lucifina calls Imp Runners into three lanes every 10 s, and from wave 4 imps carry part of each wave over your walls and DROP it mid-lawn. Two RUINS stop straight shots in their lanes.",
        enemies: ["oc-imp", "oc-trog-helm", "oc-shieldbearer", "oc-efreet", "oc-lucifina", "oc-goblin", "oc-fire-messenger"], featured: "oc-lucifina", goals: [lost(3), noCharge],
        reward: { units: ["oc-unicorn", "oc-ayanami"] },
        tiles: [{ lane: 1, col: 5, kind: "ruins" }, { lane: 3, col: 5, kind: "ruins" }], origins: [{ kind: "sky", share: 0.15, from: 4 }] }),
      lvl({ id: "w7-2", world: 7, name: "Cacodemons", waves: 18, terrain: "hell", difficulty: 0.95,
        brief: "Cacodemons drift over your lines: 1600 HP of FLYING hell-ball. A hellish THUNDERSTORM rages all battle (lightning strikes marked tiles, foes and troops alike). A WINDMILL pays while it stands.",
        enemies: ["oc-imp", "oc-shieldbearer", "oc-berserker", "oc-cacodemon", "oc-wyvern", "oc-efreet"], featured: "oc-cacodemon", goals: [lost(4), spent(5500)],
        reward: { units: ["oc-behemoth"], spell: "slayer" },
        weather: [{ kind: "thunderstorm" }], landmarks: [{ kind: "oc-windmill", lane: 2, col: 2 }] }),
      lvl({ id: "w7-3", world: 7, kind: "last-stand", name: "Hold the Breach", waves: 15, terrain: "hell", difficulty: 1.05, startGold: 4500,
        brief: "LAST STAND at the breach: 4500 gold, no more. Hydras bite three lanes. Ruins stop straight shots; a SHRINE OF MAGIC drops Surge orbs while it stands; and a CYCLOPS STOCKPILE mid-lawn holds a Cyclops Hurler — break it and he fights for you.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-death-rider", "oc-efreet", "oc-hydra", "oc-medusa", "oc-harpy"], surgeChance: 0.2, startSurges: 2,
        goals: [lost(4), noCharge], reward: { units: ["oc-cannon", "oc-runemaster"], artifact: "dwarven-shield" },
        tiles: [{ lane: 0, col: 5, kind: "ruins" }, { lane: 4, col: 5, kind: "ruins" }], landmarks: [{ kind: "oc-shrine", lane: 2, col: 1 }],
        banks: [{ kind: "oc-bank-cyclops", lane: 2, col: 6, guards: ["oc-efreet", "oc-medusa"] }] }),
      lvl({ id: "w7-4", world: 7, name: "Heads of Chaos", waves: 20, terrain: "hell", difficulty: 1.05,
        brief: "Chaos Hydras regenerate and bite three lanes at once; Jotunn Warlords flatten anything. Brimstone BRAMBLES choke four roads; foes climb out of TUNNELS at your gate and DROP from the sky.",
        enemies: ["oc-imp", "oc-shieldbearer", "oc-dread-knight", "oc-hydra", "oc-jotunn", "oc-lucifina", "oc-cacodemon", "oc-hydra-spawn"], featured: "oc-jotunn", goals: [lost(4), spent(6500)],
        reward: { units: ["oc-lightning"], artifact: "thunder-helmet" },
        tiles: tileBlock("bramble", [0, 1, 3, 4], [6]), origins: [{ kind: "flank", share: 0.08, from: 4 }, { kind: "sky", share: 0.1, from: 6 }] }),
      lvl({ id: "w7-5", world: 7, name: "The Cyberdemon", waves: 20, terrain: "hell", difficulty: 1,
        brief: "Rockets from five tiles away. Everything Chaos has, and the Cyberdemon leading it. From wave 8 the smoke turns to FOG: a Pillar of Fire lights three lanes; light the rest yourself.",
        enemies: ["oc-imp", "oc-trog-helm", "oc-shieldbearer", "oc-carmilla", "oc-pit-lord", "oc-hydra", "oc-jotunn", "oc-cacodemon", "oc-cyberdemon"],
        featured: "oc-cyberdemon", herald: "oc-cyberdemon", goals: [lost(5), noCharge], reward: { units: ["oc-gorgon"], spell: "forgetfulness" },
        weather: [{ kind: "clear" }, { kind: "fog", wave: 8 }], landmarks: [{ kind: "oc-pillar", lane: 2, col: 1 }] }),
      lvl({ id: "w7-6", world: 7, kind: "boss", name: "The Lord of the Hellgate", waves: 0, terrain: "hell", difficulty: 1, startGold: 300, surgeChance: 0,
        brief: "BOSS: the Dracolich hovers at the far edge of one lane at a time, summoning Chaos. Only attacks that reach it — and spells — can hurt it. At two thirds and one third of its health it halts and cannot be harmed for 4 s, then unleashes a set piece: first a foe in every lane and two dragons, then death breath down every lane (150).",
        enemies: [], boss: "dracolich", startSurges: 3, goals: [lost(6), noCharge], reward: { units: ["oc-titan", "oc-archangel"] } })
    ] },
  { id: 8, name: "Krewlod Badlands", terrain: "rough", art: "/assets/order-chaos/worlds/badlands.webp",
    blurb: "The Hellgate is shut, but Chaos gold still buys swords: mercenaries of every town ride for the horde, through sand and canyon.",
    levels: [
      lvl({ id: "w8-1", world: 8, name: "Sellswords", waves: 16, terrain: "rough", difficulty: 1.05, startGold: 200,
        brief: "Chaos pays well: Erathian Sellswords and Sea Dogs march for coin. Slay them and their pay drops on the lawn. Two WINDMILLS pay while they stand, a patch of CLOVER speeds whoever stands on it, and two treasure chests wait to be shot open — before the Kobolds get to them.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-sellsword", "oc-seadog", "oc-kobold", "oc-goblin"], featured: "oc-sellsword", goals: [lost(3), spent(4500)],
        reward: { units: ["oc-santa"], spell: "lightning-bolt" },
        landmarks: [{ kind: "oc-windmill", lane: 1, col: 2 }, { kind: "oc-windmill", lane: 3, col: 2 }], tiles: [{ lane: 2, col: 1, kind: "clover" }],
        structures: [{ kind: "oc-chest", lane: 0, col: 7 }, { kind: "oc-chest", lane: 4, col: 7 }] }),
      lvl({ id: "w8-2", world: 8, name: "Wolves of Krewlod", waves: 16, terrain: "rough", difficulty: 1.05, startGold: 200,
        brief: "Wolf Raiders race in and bite twice as often; pikes deal double to cavalry. A GRIFFIN CONSERVATORY holds a Royal Griffin caged mid-lawn, its guards asleep: break it and the Griffin fights for you. Canyon RUINS stop straight shots in the outer roads.",
        enemies: ["oc-imp", "oc-sellsword", "oc-wolf", "oc-berserker", "oc-hellhound", "oc-dragonfly", "oc-reaver"], featured: "oc-wolf", goals: [lost(3), noCharge],
        reward: { units: ["oc-griffin", "oc-rin"] },
        tiles: [{ lane: 0, col: 5, kind: "ruins" }, { lane: 4, col: 5, kind: "ruins" }],
        banks: [{ kind: "oc-bank-griffin", lane: 2, col: 6, guards: ["oc-wolf", "oc-wolf", "oc-sellsword", "oc-sellsword"] }] }),
      lvl({ id: "w8-3", world: 8, kind: "conveyor", name: "The Caravan Road", waves: 16, terrain: "rough", difficulty: 1.05, startGold: 0,
        brief: "CONVEYOR: the caravan hands you troops. Nomad Outriders swerve round the first defender they meet — guard the neighbouring lanes too. A SANDSTORM from wave 5: straight shots and gunfire carry only 4.5 tiles, both ways.",
        enemies: ["oc-sellsword", "oc-wolf", "oc-nomad", "oc-seadog", "oc-satyr", "oc-goblin"], featured: "oc-nomad",
        conveyorPool: ["oc-longbow", "oc-pikeman", "oc-pikeman", "oc-dwarf", "oc-griffin", "oc-cyclops", "oc-santa", "oc-sylph", "oc-crusader", "oc-ice", "oc-armadillo", "oc-big-armadillo"],
        goals: [lost(3), noCharge], reward: { units: ["oc-centaur"], artifact: "endless-purse" },
        weather: [{ kind: "clear" }, { kind: "sandstorm", wave: 5 }] }),
      lvl({ id: "w8-4", world: 8, name: "Cutthroats in the Dust", waves: 18, terrain: "rough", difficulty: 1.05, startGold: 200,
        brief: "Rogues cannot be seen until they come within 5 tiles of your gate, strike, or are caught in a blast; they pocket treasure chests they pass. Bounty Hunters gun down your costliest troop. A SANDSTORM blows all battle: straight shots and gunfire carry 4.5 tiles.",
        enemies: ["oc-shambler", "oc-sellsword", "oc-rogue", "oc-bounty", "oc-nomad", "oc-kobold", "oc-kitsune", "oc-treasure"], featured: "oc-rogue", goals: [lost(3), spent(5000)],
        reward: { units: ["oc-mage", "oc-softball"], spell: "ice-bolt" },
        weather: [{ kind: "sandstorm" }], structures: [{ kind: "oc-chest", lane: 0, col: 6 }, { kind: "oc-chest", lane: 2, col: 7 }, { kind: "oc-chest", lane: 4, col: 6 }] }),
      lvl({ id: "w8-5", world: 8, kind: "boss", name: "Hounds of the Pit", waves: 20, terrain: "rough", difficulty: 1.05, startGold: 200,
        brief: "Cerberi savage two defenders with every bite, and the whole mercenary warband rides behind them. The sandstorm breaks into a THUNDERSTORM at wave 10. A NAGA BANK holds a Naga Queen — free her. BOSS: Old Gnawbone leads the last assault; it pounces over your walls onto the troops behind.",
        enemies: ["oc-sellsword", "oc-wolf", "oc-nomad", "oc-rogue", "oc-bounty", "oc-cerberus", "oc-ogre-shaman", "oc-berserker"], featured: "oc-cerberus", herald: "oc-cerberus", warboss: "oc-boss-gnawbone",
        goals: [lost(4), noCharge], reward: { hero: "dace", artifact: "ambassadors-sash" },
        weather: [{ kind: "sandstorm" }, { kind: "thunderstorm", wave: 10 }],
        banks: [{ kind: "oc-bank-naga", lane: 2, col: 6, guards: ["oc-cerberus", "oc-nomad", "oc-nomad"] }] })
    ] },
  { id: 9, name: "The Void Rift", terrain: "cursed", art: "/assets/order-chaos/worlds/rift.webp",
    blurb: "Reality tears open over the elemental planes. What comes through is worse than Eeofol.",
    levels: [
      lvl({ id: "w9-1", world: 9, name: "Pale Riders", waves: 18, terrain: "cursed", difficulty: 1.05, startGold: 250, night: true,
        brief: "Wraiths drain your hero's mana with every strike; Mummies curse your troops to half speed. NIGHT and FOG: a Pillar of Fire lights the middle lanes, and two CRYPTS let the dead out.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-wraith", "oc-mummy", "oc-death-rider", "oc-necromancer"], featured: "oc-wraith", goals: [lost(3), spent(5000)],
        reward: { units: ["oc-dendroid", "oc-guardian"], spell: "blind" },
        weather: [{ kind: "fog" }], landmarks: [{ kind: "oc-pillar", lane: 2, col: 1 }],
        structures: [{ kind: "oc-crypt", lane: 1, col: 7 }, { kind: "oc-crypt", lane: 3, col: 7 }], fieldCards: ["oc-boar"] }),
      lvl({ id: "w9-2", world: 9, name: "Devils at the Door", waves: 18, terrain: "cursed", difficulty: 1.05, startGold: 200,
        brief: "Arch Devils vanish and reappear behind your lines; foes climb out of TUNNELS at your gate and DROP from the sky too. Keep something tough at the back; Magogs lob fire over your walls. Ruins stop straight shots.",
        enemies: ["oc-imp", "oc-trog-helm", "oc-mummy", "oc-arch-devil", "oc-magog", "oc-efreet", "oc-cyber-zombie"], featured: "oc-arch-devil", goals: [lost(4), noCharge],
        reward: { units: ["oc-azusa"], artifact: "spirit-of-oppression" },
        tiles: [{ lane: 2, col: 5, kind: "ruins" }, { lane: 0, col: 6, kind: "ruins" }, { lane: 4, col: 6, kind: "ruins" }],
        origins: [{ kind: "flank", share: 0.1, from: 3 }, { kind: "sky", share: 0.1, from: 5 }] }),
      lvl({ id: "w9-3", world: 9, kind: "last-stand", name: "Pain and Souls", waves: 15, terrain: "cursed", difficulty: 1.05, startGold: 4000,
        brief: "LAST STAND: 4000 gold and no more. Pain Elementals drift over your lines and burst into Lost Souls; Power Liches cloud your troops. A THUNDERSTORM rages; the outer roads are flooded from the fourth column (Rafts); a SHRINE drops Surge orbs while it stands.",
        enemies: ["oc-imp", "oc-shieldbearer", "oc-pain", "oc-lich", "oc-scorpicore", "oc-wraith", "oc-harpy"], featured: "oc-pain", surgeChance: 0.2, startSurges: 2,
        goals: [lost(4), noCharge], reward: { units: ["oc-pegasus"], hero: "luna" },
        tiles: pool([0, 4], 3), weather: [{ kind: "thunderstorm" }], landmarks: [{ kind: "oc-shrine", lane: 2, col: 0 }], fieldCards: ["oc-raft"] }),
      lvl({ id: "w9-4", world: 9, name: "Calamity", waves: 20, terrain: "cursed", difficulty: 1.05, startGold: 200,
        brief: "On a shattered ROOF over the Rift (Crates first; the ridge is the fifth column). Wakamo stalks unseen and snipes from afar; Mancubi scorch whatever stands close; Prism Elementals reflect straight shots. FOG hides the far roof until wave 10 — then a THUNDERSTORM.",
        enemies: ["oc-sellsword", "oc-rogue", "oc-wakamo", "oc-mancubus", "oc-scorpicore", "oc-magog", "oc-prism", "oc-cacodemon", "oc-watcher"], featured: "oc-wakamo", goals: [lost(4), spent(6500)],
        reward: { units: ["oc-laffey"], spell: "implosion" },
        tiles: rooftop(ALL, 4), weather: [{ kind: "fog" }, { kind: "thunderstorm", wave: 10 }], fieldCards: ["oc-crate"] }),
      lvl({ id: "w9-5", world: 9, kind: "boss", name: "Wings of the Rift", waves: 22, terrain: "cursed", difficulty: 1.05, startGold: 200,
        brief: "The Black Dragon flies in with the great assaults: flying, immune to spells and too heavy for any gale. Only attacks that reach flyers bring it down. Rain from wave 5, a THUNDERSTORM from wave 12, foes DROPPED from the sky from wave 6 — and two lucky clover patches. BOSS: the Spider Mastermind leads the last assault: a chaingun down its lane and plasma on your costliest troops.",
        enemies: ["oc-imp", "oc-sellsword", "oc-arch-devil", "oc-mancubus", "oc-pain", "oc-lich", "oc-hydra", "oc-black-dragon", "oc-hydra-spawn"], featured: "oc-black-dragon", warboss: "oc-boss-mastermind",
        goals: [lost(5), noCharge], reward: { units: ["oc-belfast"], spell: "cure" },
        tiles: [{ lane: 1, col: 1, kind: "clover" }, { lane: 3, col: 1, kind: "clover" }],
        weather: [{ kind: "clear" }, { kind: "rain", wave: 5 }, { kind: "thunderstorm", wave: 12 }], origins: [{ kind: "sky", share: 0.12, from: 6 }] })
    ] },
  { id: 10, name: "The Carnival of Masks", terrain: "graveyard", art: "/assets/garrison/fields/night.webp",
    blurb: "Beyond the Rift, Chaos holds a masquerade under the moon: phantoms, dancers and beasts that never walk a straight line.",
    levels: [
      lvl({ id: "w10-1", world: 10, name: "Masks at Moonrise", waves: 18, terrain: "graveyard", difficulty: 1.1, startGold: 250, night: true,
        brief: "NIGHT: no gold falls. Phantoms drift straight through your troops, untouchable while they phase — then must gather themselves for 8 s. Keep a second line behind the first. Three CLOVER patches and a WINDMILL help pay the bills. Kamuro stops short and throws kunai at your first troop.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-imp", "oc-shieldbearer", "oc-kobold", "oc-phantom", "oc-kunoichi"], featured: "oc-phantom", goals: [lost(3), spent(5000)],
        reward: { units: ["oc-rearguard"], spell: "counterstrike" },
        tiles: [{ lane: 0, col: 2, kind: "clover" }, { lane: 2, col: 2, kind: "clover" }, { lane: 4, col: 2, kind: "clover" }], landmarks: [{ kind: "oc-windmill", lane: 2, col: 4 }] }),
      lvl({ id: "w10-2", world: 10, name: "Stalkers in the Mist", waves: 18, terrain: "graveyard", difficulty: 1.1, startGold: 250, night: true,
        brief: "Werewolf Stalkers bound from lane to lane every couple of tiles. Cover the neighbouring lanes, not just the one they start in. FOG: the Pillar of Fire lights the middle three lanes. Brambles in the mist slow whatever crosses them.",
        enemies: ["oc-imp", "oc-sellsword", "oc-wolf", "oc-hellhound", "oc-dragonfly", "oc-werewolf", "oc-phantom", "oc-nightmare", "oc-kitsune"], featured: "oc-werewolf", goals: [lost(3), noCharge],
        reward: { units: ["oc-nymph"] },
        tiles: [{ lane: 1, col: 6, kind: "bramble" }, { lane: 3, col: 6, kind: "bramble" }, { lane: 0, col: 7, kind: "bramble" }, { lane: 4, col: 7, kind: "bramble" }],
        weather: [{ kind: "fog" }], landmarks: [{ kind: "oc-pillar", lane: 2, col: 2 }], fieldCards: ["oc-brew"] }),
      lvl({ id: "w10-3", world: 10, name: "The Revel", waves: 20, terrain: "graveyard", difficulty: 1.1, startGold: 250, night: true,
        brief: "The Revel Queen stops to dance and calls four Revellers around her — above, below, ahead and behind. Break the ring before she calls them back. From wave 3, confetti cannons shoot part of each wave over your walls to DROP mid-lawn; two treasure chests are the carnival's prizes.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-satyr", "oc-goblin", "oc-werewolf", "oc-revel-queen", "oc-kobold"], featured: "oc-revel-queen", herald: "oc-revel-queen",
        goals: [lost(3), spent(5500)], reward: { units: ["oc-mechanic"] },
        origins: [{ kind: "sky", share: 0.15, from: 3 }], structures: [{ kind: "oc-chest", lane: 0, col: 6 }, { kind: "oc-chest", lane: 4, col: 6 }] }),
      lvl({ id: "w10-4", world: 10, kind: "last-stand", name: "Rams at the Gate", waves: 15, terrain: "graveyard", difficulty: 1.1, startGold: 4500,
        brief: "LAST STAND: 4500 gold and no more. Battering Rams butt your front line back a tile; Juggernauts and Frost Mammoths roll over all but tall troops — spikes and mines pop them. A moat crosses the lawn with two bridges; ruins stop straight shots in the outer roads.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-sellsword", "oc-death-rider", "oc-goblin", "oc-ram", "oc-juggernaut", "oc-mammoth", "oc-cyberbrute", "oc-cyber-zombie"], featured: "oc-juggernaut", surgeChance: 0.18, startSurges: 2,
        goals: [lost(4), noCharge], reward: { units: ["oc-axe-dwarf"] },
        tiles: [...river(6, ALL, [1, 3]), { lane: 0, col: 4, kind: "ruins" }, { lane: 4, col: 4, kind: "ruins" }], fieldCards: ["oc-raft"] }),
      lvl({ id: "w10-5", world: 10, kind: "boss", name: "The Vile Carnival", waves: 22, terrain: "graveyard", difficulty: 1.1, startGold: 250, night: true,
        brief: "Arch-viles lead the great assaults and raise the fallen where they lie — stun, freeze or blow them back to break the spell, or slay them first. NIGHT, FOG until wave 14 then a THUNDERSTORM; two CRYPTS, a flooded middle road, and tunnels at your gate. BOSS: the Masked Sphinx leads the last assault.",
        enemies: ["oc-phantom", "oc-werewolf", "oc-revel-queen", "oc-ram", "oc-juggernaut", "oc-carmilla", "oc-mummy", "oc-prism", "oc-arch-vile", "oc-drowned"], featured: "oc-arch-vile", herald: "oc-arch-vile", warboss: "oc-boss-sphinx",
        goals: [lost(5), noCharge], reward: { units: ["oc-serpent", "oc-cupi"] },
        tiles: pool([2], 4), structures: [{ kind: "oc-crypt", lane: 1, col: 7 }, { kind: "oc-crypt", lane: 3, col: 7 }],
        weather: [{ kind: "fog" }, { kind: "thunderstorm", wave: 14 }], origins: [{ kind: "flank", share: 0.08, from: 6 }],
        landmarks: [{ kind: "oc-pillar", lane: 2, col: 1 }], fieldCards: ["oc-boar", "oc-raft"] })
    ] }
];

export const OC_LEVELS: readonly OcLevel[] = OC_WORLDS.flatMap((world) => world.levels);

/** Chaos Raids: lead the horde against a prepared Lawful line. Raid N opens after world N. */
export const OC_RAIDS: readonly (OcLevel & { unlockWorld: number })[] = [
  { id: "r1", world: 0, unlockWorld: 1, kind: "raid", name: "Break the Meadow", terrain: "grass", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Lead Chaos against a farmstead. Break through the end of every lane. Slain gold-makers give 75 Might.",
    startMight: 300, atkCards: ["oc-shambler", "oc-imp", "oc-trog-helm", "oc-shieldbearer", "oc-hellhound"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-peasant", lane, col: 0 })),
      { kind: "oc-longbow", lane: 0, col: 1 }, { kind: "oc-dwarf", lane: 0, col: 4 },
      { kind: "oc-longbow", lane: 1, col: 2 }, { kind: "oc-snow-elf", lane: 2, col: 1 }, { kind: "oc-sapper", lane: 2, col: 5 },
      { kind: "oc-longbow", lane: 3, col: 1 }, { kind: "oc-dwarf", lane: 3, col: 3 }, { kind: "oc-longbow", lane: 4, col: 2 },
      { kind: "oc-gargoyle", lane: 1, col: 4 }
    ] },
  { id: "r2", world: 0, unlockWorld: 2, kind: "raid", name: "The Frozen Bastion", terrain: "snow", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Sylphs blow your flyers away and Iron Golems stop your Satyrs. Pick your lanes.",
    startMight: 400, atkCards: ["oc-imp", "oc-dragonfly", "oc-kobold", "oc-satyr", "oc-death-rider", "oc-goblin", "oc-frostcaller", "oc-sledders"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-peasant", lane, col: 0 })),
      { kind: "oc-sylph", lane: 0, col: 1 }, { kind: "oc-snow-elf", lane: 0, col: 2 },
      { kind: "oc-longbow", lane: 1, col: 1 }, { kind: "oc-iron-golem", lane: 1, col: 4 },
      { kind: "oc-cyclops", lane: 2, col: 1 }, { kind: "oc-pikeman", lane: 2, col: 4 },
      { kind: "oc-longbow", lane: 3, col: 2 }, { kind: "oc-sapper", lane: 3, col: 5 },
      { kind: "oc-sylph", lane: 4, col: 1 }, { kind: "oc-dwarf", lane: 4, col: 3 },
      { kind: "oc-elf-band", lane: 2, col: 2 }, { kind: "oc-automaton", lane: 0, col: 4 }
    ] },
  { id: "r3", world: 0, unlockWorld: 3, kind: "raid", name: "Mire Watch", terrain: "swamp", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Spikes, water shells and a Sharpshooter. Necromancers' graves soak their shots.",
    startMight: 450, atkCards: ["oc-shieldbearer", "oc-goblin", "oc-berserker", "oc-hobgoblin", "oc-necromancer", "oc-hexmaster", "oc-drowned", "oc-dragonfly"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-yuuka", lane, col: 0 })),
      { kind: "oc-sharpshooter", lane: 0, col: 1 }, { kind: "oc-gnome", lane: 0, col: 5 },
      { kind: "oc-halfling", lane: 1, col: 1 }, { kind: "oc-undine", lane: 1, col: 2 }, { kind: "oc-dwarf", lane: 1, col: 3 },
      { kind: "oc-cyclops", lane: 2, col: 1 }, { kind: "oc-javelin", lane: 2, col: 3 }, { kind: "oc-gnome", lane: 2, col: 4 },
      { kind: "oc-longbow", lane: 3, col: 1 }, { kind: "oc-pikeman", lane: 3, col: 3 },
      { kind: "oc-sylph", lane: 4, col: 1 }, { kind: "oc-snow-elf", lane: 4, col: 2 }
    ] },
  { id: "r4", world: 0, unlockWorld: 4, kind: "raid", name: "Arcane Walls", terrain: "magic", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Genies slow you, Arch Mages chain their bolts, Clerics heal the line.",
    startMight: 500, atkCards: ["oc-trog-helm", "oc-medusa", "oc-evil-eye", "oc-watcher", "oc-stormbird", "oc-catapult", "oc-ogre-shaman", "oc-harpy", "oc-hexmaster"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-enchanter", lane, col: 0 })),
      { kind: "oc-genie", lane: 0, col: 1 }, { kind: "oc-iron-golem", lane: 0, col: 4 },
      { kind: "oc-arch-mage", lane: 1, col: 1 }, { kind: "oc-cleric", lane: 1, col: 2 },
      { kind: "oc-shaman", lane: 2, col: 1 }, { kind: "oc-aegis", lane: 2, col: 2 }, { kind: "oc-dwarf", lane: 2, col: 4 },
      { kind: "oc-arch-mage", lane: 3, col: 1 }, { kind: "oc-cleric", lane: 3, col: 2 },
      { kind: "oc-sylph", lane: 4, col: 1 }, { kind: "oc-sharpshooter", lane: 4, col: 2 }, { kind: "oc-gunslinger", lane: 0, col: 2 }
    ] },
  { id: "r5", world: 0, unlockWorld: 5, kind: "raid", name: "Depth Charges", terrain: "night", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Ballistae pierce your lanes and Aris charges her cannon. Tunnel under them.",
    startMight: 550, atkCards: ["oc-kobold", "oc-sandworm", "oc-mantis", "oc-efreet", "oc-fire-messenger", "oc-troll", "oc-spider", "oc-wyvern", "oc-nightmare"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-leprechaun", lane, col: 0 })),
      { kind: "oc-ballista", lane: 0, col: 1 }, { kind: "oc-crusader", lane: 0, col: 4 },
      { kind: "oc-aris", lane: 1, col: 1 }, { kind: "oc-ammo", lane: 1, col: 2 }, { kind: "oc-longbow", lane: 1, col: 3 },
      { kind: "oc-steel-elf", lane: 2, col: 1 }, { kind: "oc-ballista", lane: 2, col: 2 }, { kind: "oc-iron-golem", lane: 2, col: 5 },
      { kind: "oc-halfling", lane: 3, col: 1 }, { kind: "oc-crusader", lane: 3, col: 4 },
      { kind: "oc-aris", lane: 4, col: 1 }, { kind: "oc-gnome", lane: 4, col: 5 }
    ] },
  { id: "r6", world: 0, unlockWorld: 6, kind: "raid", name: "The Last Citadel", terrain: "hell", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Phoenixes, Unicorn wards, a First Aid Tent in every lane. Everything Chaos has is yours.",
    startMight: 750, atkCards: ["oc-imp", "oc-carmilla", "oc-kitsune", "oc-warlord", "oc-pit-lord", "oc-dread-knight", "oc-hydra", "oc-jotunn", "oc-lucifina", "oc-cyberdemon"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-first-aid", lane, col: 0 })),
      { kind: "oc-phoenix", lane: 0, col: 3 }, { kind: "oc-hina", lane: 0, col: 1 },
      { kind: "oc-unicorn", lane: 1, col: 3 }, { kind: "oc-akagi", lane: 1, col: 1 }, { kind: "oc-maiden", lane: 1, col: 4 },
      { kind: "oc-salamander", lane: 2, col: 2 }, { kind: "oc-longbow", lane: 2, col: 1 }, { kind: "oc-behemoth", lane: 2, col: 4 },
      { kind: "oc-unicorn", lane: 3, col: 3 }, { kind: "oc-hina", lane: 3, col: 1 }, { kind: "oc-rafflesia", lane: 3, col: 2 },
      { kind: "oc-phoenix", lane: 4, col: 3 }, { kind: "oc-titan", lane: 4, col: 1 }
    ] },
  { id: "r7", world: 0, unlockWorld: 8, kind: "raid", name: "Mercenary Payday", terrain: "rough", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Griffins bite back and Centaurs lance two at a time. Your Nomads swerve round the first wall; Rogues slip in unseen.",
    startMight: 650, atkCards: ["oc-sellsword", "oc-wolf", "oc-nomad", "oc-rogue", "oc-bounty", "oc-cerberus", "oc-seadog", "oc-reaver", "oc-hydra-spawn"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-santa", lane, col: 0 })),
      { kind: "oc-centaur", lane: 0, col: 1 }, { kind: "oc-griffin", lane: 0, col: 4 },
      { kind: "oc-mage", lane: 1, col: 1 }, { kind: "oc-rin", lane: 1, col: 2 }, { kind: "oc-pikeman", lane: 1, col: 3 },
      { kind: "oc-centaur", lane: 2, col: 1 }, { kind: "oc-minotaur", lane: 2, col: 4 },
      { kind: "oc-softball", lane: 3, col: 1 }, { kind: "oc-longbow", lane: 3, col: 2 }, { kind: "oc-griffin", lane: 3, col: 4 },
      { kind: "oc-beholder", lane: 4, col: 1 }, { kind: "oc-naga", lane: 4, col: 4 }
    ] },
  { id: "r8", world: 0, unlockWorld: 9, kind: "raid", name: "Through the Rift", terrain: "cursed", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Azure Dragons, Gold Golems and mined lanes. Your Arch Devils teleport behind them; the Black Dragon laughs at gales.",
    startMight: 850, atkCards: ["oc-wraith", "oc-mummy", "oc-arch-devil", "oc-magog", "oc-lich", "oc-pain", "oc-mancubus", "oc-prism", "oc-cyber-zombie", "oc-black-dragon"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-belfast", lane, col: 0 })),
      { kind: "oc-azure", lane: 0, col: 3 }, { kind: "oc-laffey", lane: 0, col: 1 },
      { kind: "oc-gold-golem", lane: 1, col: 5 }, { kind: "oc-azusa", lane: 1, col: 1 }, { kind: "mine", lane: 1, col: 4 },
      { kind: "oc-pegasus", lane: 2, col: 3 }, { kind: "oc-guardian", lane: 2, col: 2 }, { kind: "oc-titan", lane: 2, col: 1 },
      { kind: "oc-dendroid", lane: 3, col: 5 }, { kind: "oc-laffey", lane: 3, col: 1 }, { kind: "mine", lane: 3, col: 3 },
      { kind: "oc-azure", lane: 4, col: 3 }, { kind: "oc-runemaster", lane: 4, col: 2 }, { kind: "oc-centaur", lane: 4, col: 1 }
    ] }
];

/** Chaos Raids: each Chaos spell may be cast only so often per battle (no waiting to spam them). */
export const OC_RAID_CHARGES: Readonly<Partial<Record<SpellId, number>>> = { earthquake: 3, "war-cry": 3, resurrection: 2 };

/** Endless Siege: every Chaos creature the player has met, wave after wave. */
export const OC_ENDLESS: OcLevel = {
  id: "oc-endless", world: 0, kind: "endless", name: "Endless Siege", terrain: "grass", lanes: ALL, waves: 0, enemies: [],
  difficulty: 1, startGold: 150, surgeChance: 0.12, startSurges: 1, goals: [], reward: {},
  brief: "The horde never ends. After every great assault, choose one of three artifacts. Every tenth wave, a world boss you have beaten leads the horde again (half as tough again each time they have all had a turn); its fall routs the lawn, but the waves march on. How long can you hold?"
};

// ---------------------------------------------------------------------------
// Progress (derived from the cleared level ids)

export const OC_START_UNITS: readonly DefKind[] = ["oc-peasant", "oc-longbow"];

/** The Mercenary Camp: units hired with Seals instead of won in the campaign. */
export const OC_MERCENARIES: readonly { kind: DefKind; seals: number }[] = [
  { kind: "oc-minotaur", seals: 8 },
  { kind: "oc-beholder", seals: 8 },
  { kind: "oc-naga", seals: 12 },
  { kind: "oc-gold-golem", seals: 12 },
  { kind: "oc-azure", seals: 25 },
  { kind: "oc-bellwether", seals: 10 },
  // The content pass: a Cove shield-basher, a dwarven thane from the Bulwark and a war mammoth.
  { kind: "oc-nix", seals: 8 },
  { kind: "oc-thane", seals: 12 },
  { kind: "oc-war-mammoth", seals: 20 }
];

export function mercCampOpen(cleared: readonly string[]): boolean {
  return worldCleared(2, cleared);
}

export function unlockedUnits(cleared: readonly string[], hired: readonly string[] = []): DefKind[] {
  const units = [...OC_START_UNITS];
  for (const level of OC_LEVELS) if (cleared.includes(level.id)) units.push(...(level.reward.units ?? []));
  for (const merc of OC_MERCENARIES) if (hired.includes(merc.kind)) units.push(merc.kind);
  return units.filter((kind, i) => DEFENDERS[kind] && units.indexOf(kind) === i);
}

// ---------------------------------------------------------------------------
// Star milestones (like PvZ2's star gates): rewards for the stars earned so far.

export type OcMilestone = { stars: number; label: string; artifact?: BlessingId; spell?: SpellId; seedSlot?: boolean; artifactSlot?: boolean; crown?: boolean; surgeSlot?: boolean };

export const OC_STAR_MILESTONES: readonly OcMilestone[] = [
  { stars: 12, label: "Helm of Heavenly Enlightenment", artifact: "helm-of-enlightenment" },
  { stars: 24, label: "+1 seed packet slot", seedSlot: true },
  { stars: 30, label: "+1 Surge orb slot", surgeSlot: true },
  { stars: 40, label: "Spell: Death Ripple", spell: "death-ripple" },
  { stars: 60, label: "Carry two Valor crowns", crown: true },
  { stars: 70, label: "+1 Surge orb slot", surgeSlot: true },
  { stars: 80, label: "+1 artifact slot", artifactSlot: true },
  { stars: 100, label: "+1 seed packet slot", seedSlot: true }
];

export function totalStars(cleared: readonly string[], stars: Readonly<Record<string, readonly number[]>>): number {
  return OC_LEVELS.reduce((sum, level) => sum + (cleared.includes(level.id) ? 1 : 0) + (stars[level.id]?.length ?? 0), 0);
}

export function reachedMilestones(starCount: number): OcMilestone[] {
  return OC_STAR_MILESTONES.filter((m) => starCount >= m.stars);
}

// ---------------------------------------------------------------------------
// Ascension (the Altar opens in world 2; each unit needs Barracks level 3)

export const OC_ULT_LEVEL = 3;

export function altarOpen(cleared: readonly string[]): boolean {
  return OC_LEVELS.some((level) => level.reward.altar && cleared.includes(level.id));
}

/** Units whose Ascended form is unlocked (`all`: the testing unlock). */
export function unlockedUltimates(cleared: readonly string[], units: readonly DefKind[], levels: Readonly<Record<string, number>>, all = false): DefKind[] {
  if (!all && !altarOpen(cleared)) return [];
  return units.filter((kind) => OC_ULTIMATES[kind] && (all || (levels[kind] ?? 1) >= OC_ULT_LEVEL));
}

// ---------------------------------------------------------------------------
// Testing: everything unlocked (password-gated in the menu; remove later).

export const OC_ALL_CLEARED: readonly string[] = [...OC_LEVELS.map((level) => level.id)];
export const OC_ALL_HIRED: readonly string[] = OC_MERCENARIES.map((merc) => merc.kind);

export function unlockedHeroes(cleared: readonly string[]): OcHeroId[] {
  const heroes: OcHeroId[] = ["catherine"];
  for (const level of OC_LEVELS) if (cleared.includes(level.id) && level.reward.hero) heroes.push(level.reward.hero);
  return OC_HERO_ORDER.filter((id) => heroes.includes(id));
}

export function unlockedArtifacts(cleared: readonly string[], starCount = 0): BlessingId[] {
  const found = new Set<BlessingId>();
  for (const level of OC_LEVELS) if (cleared.includes(level.id) && level.reward.artifact) found.add(level.reward.artifact);
  for (const m of reachedMilestones(starCount)) if (m.artifact) found.add(m.artifact);
  return OC_ARTIFACTS.filter((id) => found.has(id));
}

export function unlockedSpells(cleared: readonly string[], starCount = 0): SpellId[] {
  const found = new Set<SpellId>();
  for (const level of OC_LEVELS) if (cleared.includes(level.id) && level.reward.spell) found.add(level.reward.spell);
  for (const m of reachedMilestones(starCount)) if (m.spell) found.add(m.spell);
  return OC_SPELLS.filter((id) => found.has(id));
}

/** Chaos creatures met so far (the Almanac's horde pages, Endless' pool). */
export function metEnemies(cleared: readonly string[]): EnemyKind[] {
  const met: EnemyKind[] = [];
  for (const level of OC_LEVELS) {
    if (!cleared.includes(level.id)) continue;
    for (const kind of level.enemies) {
      if (!met.includes(kind)) met.push(kind);
      // A troupe's backup dancers are met with their leader (and what bursts out of a foe, rides on it or is flung by it, with it).
      const def = ENEMIES[kind];
      for (const also of [def?.troupe?.kind, def?.deathSpawn?.kind, def?.flingKind, def?.carry?.kind]) {
        if (also && ENEMIES[also] && !ENEMIES[also]!.ally && !met.includes(also)) met.push(also);
      }
    }
    if (level.graves?.length && !met.includes("oc-grave")) met.push("oc-grave");
    if (level.warboss && !met.includes(level.warboss)) met.push(level.warboss);
  }
  return met;
}

/** World bosses met so far (their world's last level cleared), in campaign order. */
export function metWarbosses(cleared: readonly string[]): EnemyKind[] {
  const met: EnemyKind[] = [];
  for (const level of OC_LEVELS) {
    if (cleared.includes(level.id) && level.warboss && ENEMIES[level.warboss]?.warboss && !met.includes(level.warboss)) met.push(level.warboss);
  }
  return met;
}

/** A level is open once the one before it (in campaign order) is cleared. */
export function isLevelOpen(id: string, cleared: readonly string[]): boolean {
  const index = OC_LEVELS.findIndex((level) => level.id === id);
  return index === 0 || (index > 0 && cleared.includes(OC_LEVELS[index - 1]!.id));
}

export function worldCleared(world: number, cleared: readonly string[]): boolean {
  const w = OC_WORLDS.find((entry) => entry.id === world);
  return w !== undefined && w.levels.every((level) => cleared.includes(level.id));
}

/** Seed slots grow with the campaign. */
export function seedSlots(cleared: readonly string[], starCount = 0): number {
  let slots = 5;
  if (cleared.includes("w1-3")) slots += 1;
  if (cleared.includes("w2-5")) slots += 1;
  if (cleared.includes("w4-5")) slots += 1;
  slots += reachedMilestones(starCount).filter((m) => m.seedSlot).length;
  return Math.min(10, slots);
}

export function artifactSlots(cleared: readonly string[], starCount = 0): number {
  const bonus = reachedMilestones(starCount).filter((m) => m.artifactSlot).length;
  if (cleared.includes("w5-5")) return 3 + bonus;
  if (cleared.includes("w3-5")) return 2 + bonus;
  if (cleared.includes("w1-4")) return 1 + bonus;
  return 0;
}

/** Surge orbs the hero can carry: two at first, one more at each Surge milestone. */
export const OC_SURGE_SLOTS = 2;

export function surgeSlots(starCount: number): number {
  return OC_SURGE_SLOTS + reachedMilestones(starCount).filter((m) => m.surgeSlot).length;
}

export function crownSlots(starCount: number): number {
  return 1 + reachedMilestones(starCount).filter((m) => m.crown).length;
}

export function raidOpen(raid: { unlockWorld: number }, cleared: readonly string[]): boolean {
  return worldCleared(raid.unlockWorld, cleared);
}

export function endlessOpen(cleared: readonly string[]): boolean {
  return worldCleared(1, cleared);
}

/** Did the finished battle meet a goal? */
export function goalMet(goal: OcGoal, stats: { lost: number; goldSpent: number; chargersUsed: number }): boolean {
  if (goal.kind === "lost") return stats.lost <= goal.max;
  if (goal.kind === "spent") return stats.goldSpent <= goal.max;
  return stats.chargersUsed === 0;
}

export function goalText(goal: OcGoal): string {
  if (goal.kind === "lost") return goal.max === 0 ? "Lose no troops" : `Lose no more than ${goal.max} troop${goal.max === 1 ? "" : "s"}`;
  if (goal.kind === "spent") return `Spend no more than ${goal.max} gold`;
  return "Never let a lane's Champion charge";
}

// ---------------------------------------------------------------------------
// Unit levels (the Barracks): +15% health and power per level.

/** Seals to reach level 2, 3, 4 (levels and their scaling live in ./forms). */
export const OC_LEVEL_COST: readonly number[] = [0, 0, 3, 6, 10];

// ---------------------------------------------------------------------------
// Config

export const OC_CHAOS_COLOR = "#b3261e";
export const OC_LAWFUL_COLOR = "#e0b54a";

export type OcBuildOptions = {
  seed: number;
  /** Chosen seed packets (base kinds). */
  cards: DefKind[];
  hero: OcHeroId;
  artifacts: BlessingId[];
  /** Barracks levels by base kind. */
  levels: Record<string, number>;
  /** Cleared level ids (the Endless pool). */
  cleared: readonly string[];
  /** The general spells packed into the spellbook (the hero's signature spell comes on top). */
  spells: readonly SpellId[];
  /** Units (base kinds) whose Ascension is unlocked. */
  ultimates: readonly DefKind[];
  /** Valor crowns the hero can carry. */
  crowns: number;
  /** Surge orbs the hero can carry (surgeSlots). */
  surges: number;
  /** The hero's rank (heroRankOf); unset: full strength. */
  heroRank?: number;
  /** Satchel items packed for this battle and their uses there (treasury.ts satchelFor): used during the battle (sim.ts checkItem). Not in raids. */
  satchel?: readonly { id: string; uses: number }[];
  /** Raids: Chaos units won at the Summoning Portal join the raid's hand. */
  chaos?: readonly EnemyKind[];
};

export function buildOcConfig(level: OcLevel, options: OcBuildOptions): GarrisonConfig {
  const raid = level.kind === "raid";
  const endless = level.kind === "endless";
  const conveyor = level.kind === "conveyor";
  const mode: GarrisonMode = raid ? "raid" : endless ? "endless" : conveyor ? "conveyor" : "adventure";
  const hero = OC_HEROES[options.hero] ?? OC_HEROES.catherine;
  const lvlOf = (kind: DefKind) => options.levels[kind] ?? 1;
  const artifacts = options.artifacts.filter((id) => (OC_ARTIFACTS.includes(id) || OC_GACHA_ARTIFACTS.some((a) => a.id === id)) && id !== hero.passive);
  const general = options.spells.filter((id) => OC_SPELLS.includes(id) && id !== hero.spell).slice(0, OC_SPELLBOOK_SIZE);
  const spells: SpellId[] = [hero.spell, ...general].filter((id, i, all) => SPELLS[id] && all.indexOf(id) === i);
  // The packed Satchel: boost items only, each once, its uses never above its perMatch (none in raids).
  const satchel = raid ? [] : (options.satchel ?? [])
    .map((slot) => ({ id: slot.id, uses: Math.min(itemPerMatch(slot.id), Math.max(0, Math.floor(slot.uses))) }))
    .filter((slot, i, all) => slot.uses > 0 && all.findIndex((other) => other.id === slot.id) === i);
  const enemies = endless ? metEnemies(options.cleared).filter((kind) => ENEMIES[kind] && ENEMIES[kind]!.cost > 0) : [...level.enemies];
  // (Endless marches every foe met, not the level card's own list: a met Nightmare brings Wake-Up Brews there too.)
  const field = raid ? [] : fieldCardsFor({ ...level, enemies: [...level.enemies, ...enemies] }, options.cards);
  return {
    mode,
    levelId: level.id,
    title: level.name,
    seed: options.seed,
    lanes: [...level.lanes],
    terrain: level.terrain,
    cards: raid || conveyor ? [] : [...options.cards.filter((kind) => CARDS[kind]).map((kind) => leveledKind(kind, lvlOf(kind))), ...field],
    spells: raid ? [] : spells,
    atkCards: raid ? [...(level.atkCards ?? []), ...(options.chaos ?? [])].filter((kind, i, all) => ENEMIES[kind] && all.indexOf(kind) === i) : [],
    atkSpells: raid ? [...ATK_SPELL_ORDER] : [],
    enemies: enemies.length > 0 ? enemies : ["oc-shambler"],
    featured: level.featured,
    waves: level.waves,
    endless,
    difficulty: level.difficulty,
    startGold: level.startGold,
    startMight: level.startMight ?? 0,
    startMana: endless ? 10 : 5,
    firstWaveAt: conveyor ? sec(12) : sec(20),
    boss: level.boss,
    herald: level.herald,
    preset: level.preset?.map((unit) => ({ kind: raid ? unit.kind : leveledKind(unit.kind, lvlOf(unit.kind)), lane: unit.lane, col: unit.col })),
    chargers: !raid,
    chargerSprite: "champion",
    bannerColor: OC_CHAOS_COLOR,
    defCols: [0, 8],
    conveyorPool: conveyor ? [...(level.conveyorPool ?? []).map((kind) => leveledKind(kind, lvlOf(kind))), ...field] : undefined,
    atkMinX: raid ? 6 : undefined,
    ai: { def: false, atk: false },
    oc: {
      surgeChance: raid ? 0 : level.surgeChance,
      startSurges: raid ? 0 : level.startSurges ?? 0,
      blessings: raid ? [] : [hero.passive, ...artifacts],
      satchel: satchel.length ? satchel : undefined,
      // (The Portal's exclusive passive and artifacts never turn up in an Endless chest.)
      blessingPool: [...OC_ARTIFACTS, ...OC_HERO_ORDER.filter((id) => !OC_GACHA_HEROES.includes(id)).map((id) => OC_HEROES[id].passive), "lions-shield"],
      lastStand: level.kind === "last-stand",
      protect: level.preset?.filter((unit) => unit.protect).map((unit) => ({ lane: unit.lane, col: unit.col })),
      graves: level.graves?.map((spot) => ({ ...spot })),
      bossSummons: level.boss ? ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-death-rider", "oc-carmilla", "oc-dread-knight", "oc-hydra", "oc-jotunn"] : undefined,
      warboss: !raid && !endless && level.warboss && ENEMIES[level.warboss]?.warboss ? { kind: level.warboss, wave: level.waves } : undefined,
      // The Endless Siege: the world bosses met so far take turns leading every tenth wave.
      endlessBosses: endless ? metWarbosses(options.cleared) : undefined,
      bossDragon: level.boss ? "oc-cacodemon" : undefined,
      ultimates: raid ? [] : options.ultimates.map(baseKind).filter((kind) => OC_ULTIMATES[kind]),
      crownMax: Math.max(1, Math.floor(options.crowns)),
      surgeMax: Number.isFinite(options.surges) ? Math.max(1, Math.floor(options.surges)) : undefined,
      atkCharges: raid ? { ...OC_RAID_CHARGES } : undefined,
      // The battlefield (order-chaos/field.ts).
      tiles: raid ? undefined : level.tiles?.map((tile) => ({ ...tile })),
      night: !raid && level.night === true,
      weather: raid ? undefined : level.weather?.map((step) => ({ ...step })),
      origins: raid ? undefined : level.origins?.map((origin) => ({ ...origin })),
      landmarks: raid ? undefined : level.landmarks?.map((spot) => ({ ...spot })),
      structures: raid ? undefined : level.structures?.map((spot) => ({ ...spot })),
      banks: raid ? undefined : level.banks?.map((bank) => ({ ...bank, guards: [...bank.guards] })),
      fieldCards: field.length ? field : undefined,
      hero: raid || options.heroRank === undefined ? undefined : { passive: hero.passive, spell: hero.spell, rank: clampHeroRank(options.heroRank) }
    }
  };
}

/** Foes whose tricks put troops to sleep (the field then hands out Wake-Up Brews). */
const LULLERS: ReadonlySet<EnemyKind> = new Set(Object.values(ENEMIES).filter((def) => def.lull).map((def) => def.kind));

/**
 * The packets a level's field hands out on top of the chosen hand: its own
 * (Raft, Crate, Rooting Boar), plus Wake-Up Brews when the hand holds a night
 * creature in a day battle or the horde brings foes that lull troops to sleep.
 */
export function fieldCardsFor(level: OcLevel, hand: readonly DefKind[]): CardId[] {
  const cards = [...(level.fieldCards ?? [])];
  const sleepy = (!level.night && hand.some((kind) => DEFENDERS[baseKind(kind)]?.nocturnal)) || level.enemies.some((kind) => LULLERS.has(kind));
  if (sleepy) cards.push("oc-brew");
  return cards.filter((id, i) => CARDS[id] && cards.indexOf(id) === i && !hand.includes(id));
}

export function findOcLevel(id: string): OcLevel | undefined {
  if (id === OC_ENDLESS.id) return OC_ENDLESS;
  return OC_LEVELS.find((level) => level.id === id) ?? OC_RAIDS.find((level) => level.id === id);
}
