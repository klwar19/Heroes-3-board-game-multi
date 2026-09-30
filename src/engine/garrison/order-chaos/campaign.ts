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

export { OC_MAX_LEVEL, baseKind, leveledKind, levelPower } from "./forms";

// ---------------------------------------------------------------------------
// Heroes

export type OcHeroId = "catherine" | "gelu" | "solmyr" | "adelaide" | "tazar" | "sensei" | "dace" | "luna";

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
    passive: "charm-of-mana", spell: "inferno", blurb: "Fire Magic: spells recover 40% faster. Inferno sweeps three lanes with walls of fire." }
};

export const OC_HERO_ORDER: readonly OcHeroId[] = ["catherine", "gelu", "solmyr", "adelaide", "tazar", "sensei", "dace", "luna"];

/** Artifacts the player can equip (the heroes' passives are theirs alone). */
export const OC_ARTIFACTS: readonly BlessingId[] = [
  "sack-of-gold", "surge-chalice", "golden-bow", "armor-of-wonder", "yawning-dead", "cards-of-prophecy", "shackles-of-war", "ogres-club", "orb-of-fire",
  "endless-purse", "ambassadors-sash", "spirit-of-oppression", "helm-of-enlightenment"
];

/** General spells, in unlock order (the hero's signature spell comes first in the book). */
export const OC_SPELLS: readonly SpellId[] = [
  "magic-arrow", "frost-ring", "haste", "meteor-shower", "armageddon", "lightning-bolt", "ice-bolt", "blind", "implosion", "cure", "death-ripple"
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
        brief: "Troglodytes wear plundered helms that soak 450 damage. Dwarves hold them while your archers work.",
        enemies: ["oc-shambler", "oc-trog-helm"], featured: "oc-trog-helm", goals: [lost(1), noCharge], reward: { units: ["oc-sapper"], spell: "magic-arrow" } }),
      lvl({ id: "w1-3", world: 1, name: "Shields of Bone", waves: 10, terrain: "grass", difficulty: 0.9,
        brief: "All five roads. Skeleton Shieldbearers block arrows from the front — a Gremlin Sapper's charge goes under the shield.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer"], featured: "oc-shieldbearer", goals: [lost(2), spent(2200)], reward: { units: ["oc-snow-elf"] } }),
      lvl({ id: "w1-4", world: 1, kind: "last-stand", name: "Last Stand at the Mill", waves: 8, terrain: "grass", difficulty: 0.95, startGold: 1500,
        brief: "LAST STAND: no gold from the sky. Spend your 1500 on a defence (no recharge while you plan), then sound the horn. Imp Runners sprint.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-imp"], featured: "oc-imp", surgeChance: 0.15, goals: [lost(3), noCharge],
        reward: { units: ["oc-immolate"], artifact: "sack-of-gold" } }),
      lvl({ id: "w1-5", world: 1, kind: "boss", name: "The Hound Pack", waves: 12, terrain: "grass", difficulty: 1,
        brief: "Hell Hounds race in and leap your first defender. Put something worth biting behind it.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-imp", "oc-hellhound"], featured: "oc-hellhound", herald: "oc-hellhound",
        goals: [lost(3), spent(3000)], reward: { units: ["oc-sylph"], hero: "gelu" } })
    ] },
  { id: 2, name: "Frozen Vori", terrain: "snow", art: "/assets/order-chaos/worlds/snow.webp",
    blurb: "Chaos swarms over the glaciers. Some of it flies.",
    levels: [
      lvl({ id: "w2-1", world: 2, name: "Wings over the Ice", waves: 10, terrain: "snow", difficulty: 0.9,
        brief: "FLYING Dragon Flies skim over every defender. A Sylph's gale blows flyers off the field — raise one in each lane.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-imp", "oc-dragonfly"], featured: "oc-dragonfly", goals: [lost(2), noCharge], reward: { units: ["oc-yuuka"] } }),
      lvl({ id: "w2-2", world: 2, name: "Cutpurses", waves: 12, terrain: "snow", difficulty: 0.95,
        brief: "Kobolds pocket your gold with every strike. Slay them to get it back.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-kobold", "oc-dragonfly"], featured: "oc-kobold", goals: [lost(2), spent(3000)],
        reward: { units: ["oc-cyclops"], artifact: "surge-chalice" } }),
      lvl({ id: "w2-3", world: 2, kind: "conveyor", name: "The Frost Caravan", waves: 12, terrain: "snow", difficulty: 1, startGold: 0,
        brief: "CONVEYOR: no gold — a caravan hands you troops. Place them before the belt fills.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-imp", "oc-hellhound", "oc-dragonfly"],
        conveyorPool: ["oc-longbow", "oc-longbow", "oc-snow-elf", "oc-dwarf", "oc-sapper", "oc-sylph", "oc-cyclops", "oc-immolate"],
        goals: [lost(3), noCharge], reward: { units: ["oc-iron-golem"], spell: "frost-ring" } }),
      lvl({ id: "w2-4", world: 2, name: "Revellers", waves: 12, terrain: "snow", difficulty: 1,
        brief: "Satyrs bound over every defender in their way. Only something tall — an Iron Golem — stops them for good.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-kobold", "oc-satyr", "oc-dragonfly"], featured: "oc-satyr", goals: [lost(2), spent(3200)],
        reward: { units: ["oc-pikeman", "oc-lizard"], artifact: "golden-bow" } }),
      lvl({ id: "w2-5", world: 2, kind: "boss", name: "Death Riders", waves: 15, terrain: "snow", difficulty: 1.05,
        brief: "Armoured Death Riders gallop in. Pikes deal double to cavalry.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-kobold", "oc-satyr", "oc-death-rider"], featured: "oc-death-rider", herald: "oc-death-rider",
        goals: [lost(3), noCharge], reward: { units: ["oc-storm"], hero: "solmyr", altar: true } })
    ] },
  { id: 3, name: "Tatalian Mire", terrain: "swamp", art: "/assets/order-chaos/worlds/swamp.webp",
    blurb: "In the swamps the dead do not stay buried.",
    levels: [
      lvl({ id: "w3-1", world: 3, name: "Powder in the Reeds", waves: 12, terrain: "swamp", difficulty: 1,
        brief: "Goblin Sappers light a keg at your line: 2.5 s later the 3×3 goes up. Frost and stuns hold the fuse.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-imp", "oc-goblin", "oc-dragonfly"], featured: "oc-goblin", goals: [lost(2), spent(3000)], reward: { units: ["oc-sharpshooter"] } }),
      lvl({ id: "w3-2", world: 3, kind: "protect", name: "The Enchanted Grove", waves: 12, terrain: "swamp", difficulty: 1,
        brief: "PROTECT: the two Enchanters in the grove must survive. Wall them in — but Ladder Hobgoblins plant ladders on the first big wall they meet, and then the whole lane climbs over it. Slay them before they plant.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-goblin", "oc-kobold", "oc-hobgoblin"], featured: "oc-hobgoblin",
        preset: [{ kind: "oc-enchanter", lane: 1, col: 4, protect: true }, { kind: "oc-enchanter", lane: 3, col: 4, protect: true }],
        goals: [lost(2), noCharge], reward: { units: ["oc-gnome"], artifact: "armor-of-wonder" } }),
      lvl({ id: "w3-3", world: 3, name: "Blood Rage", waves: 14, terrain: "swamp", difficulty: 1.05,
        brief: "Orc Berserkers strike twice as fast once wounded below half. Burst them down.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-goblin", "oc-berserker", "oc-satyr"], featured: "oc-berserker", goals: [lost(3), spent(3600)],
        reward: { units: ["oc-undine"], spell: "haste" } }),
      lvl({ id: "w3-4", world: 3, name: "The Drowned Graves", waves: 14, terrain: "swamp", difficulty: 1,
        brief: "GRAVES stand on the lawn: they block planting, soak shots, and the dead climb out of them at every great assault.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-goblin", "oc-death-rider", "oc-dragonfly"],
        graves: [{ lane: 0, col: 6 }, { lane: 1, col: 5 }, { lane: 2, col: 7 }, { lane: 3, col: 5 }, { lane: 4, col: 6 }, { lane: 2, col: 4 }],
        goals: [lost(3), noCharge], reward: { units: ["oc-halfling"], artifact: "yawning-dead" } }),
      lvl({ id: "w3-5", world: 3, kind: "boss", name: "The Necromancer's Mire", waves: 16, terrain: "swamp", difficulty: 1.05,
        brief: "Necromancers raise graves as they walk. Sharpshooters and Halflings clear them.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-berserker", "oc-goblin", "oc-hobgoblin", "oc-necromancer"], featured: "oc-necromancer", herald: "oc-necromancer",
        goals: [lost(3), spent(4200)], reward: { units: ["oc-ice"], hero: "adelaide" } })
    ] },
  { id: 4, name: "Bracada Heights", terrain: "magic", art: "/assets/order-chaos/worlds/magic.webp",
    blurb: "Chaos sorcery over the cloud towers: gazes, hexes and snatching claws.",
    levels: [
      lvl({ id: "w4-1", world: 4, name: "Stone Gaze", waves: 14, terrain: "magic", difficulty: 1,
        brief: "Medusa Queens stop out of reach and turn your troops to stone for 4 s.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-kobold", "oc-medusa", "oc-dragonfly"], featured: "oc-medusa", goals: [lost(3), noCharge],
        reward: { units: ["oc-enchanter"] } }),
      lvl({ id: "w4-2", world: 4, name: "Harpies!", waves: 14, terrain: "magic", difficulty: 1,
        brief: "Harpy Snatchers drop onto your costliest troop and carry it off after 4 s — slay them first, or blow them away with a Sylph.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-goblin", "oc-satyr", "oc-hobgoblin", "oc-harpy"], featured: "oc-harpy", goals: [lost(3), spent(3800)],
        reward: { units: ["oc-arch-mage", "oc-aegis"], artifact: "cards-of-prophecy" } }),
      lvl({ id: "w4-3", world: 4, kind: "last-stand", name: "The Tower Holds", waves: 12, terrain: "magic", difficulty: 1.05, startGold: 3000,
        brief: "LAST STAND: 3000 gold and no more. Goblin Siege Catapults roll onto the lawn and lob boulders at your REARMOST troops — Aegis Bearers' domes turn them aside. Plan the whole defence, then sound the horn.",
        enemies: ["oc-shieldbearer", "oc-trog-helm", "oc-berserker", "oc-satyr", "oc-medusa", "oc-death-rider", "oc-catapult"], featured: "oc-catapult", surgeChance: 0.18, startSurges: 1,
        goals: [lost(4), noCharge], reward: { units: ["oc-genie"], spell: "meteor-shower" } }),
      lvl({ id: "w4-4", world: 4, name: "Evil Eyes", waves: 15, terrain: "magic", difficulty: 1.05,
        brief: "Evil Eyes stare past walls to burn what stands behind them. Sea Witches hex your troops to half speed, and Hexing Sorceresses turn them into sheep for 8 s.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-goblin", "oc-evil-eye", "oc-sea-witch", "oc-sorceress", "oc-harpy"], featured: "oc-evil-eye", goals: [lost(3), spent(4200)],
        reward: { units: ["oc-cleric"], artifact: "shackles-of-war" } }),
      lvl({ id: "w4-5", world: 4, kind: "boss", name: "Bloodlust Drums", waves: 16, terrain: "magic", difficulty: 1.05,
        brief: "Ogre Shamans drum the horde into a frenzy around them. Kill the drummers first.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-berserker", "oc-medusa", "oc-sea-witch", "oc-ogre-shaman", "oc-catapult", "oc-dragonfly"], featured: "oc-ogre-shaman", herald: "oc-ogre-shaman",
        goals: [lost(4), noCharge], reward: { units: ["oc-faerie"], hero: "tazar" } })
    ] },
  { id: 5, name: "Nighon Depths", terrain: "night", art: "/assets/order-chaos/worlds/depths.webp",
    blurb: "Underground, gold falls half as often — and things come up from below.",
    levels: [
      lvl({ id: "w5-1", world: 5, name: "Tunnels", waves: 14, terrain: "night", difficulty: 1, startGold: 200,
        brief: "Sandworms tunnel under the whole lawn and burst out behind your lines. Keep something in the back.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-kobold", "oc-sandworm", "oc-goblin"], featured: "oc-sandworm", goals: [lost(3), spent(3600)],
        reward: { units: ["oc-ballista"] } }),
      lvl({ id: "w5-2", world: 5, name: "Monarchs of the Air", waves: 15, terrain: "night", difficulty: 1, startGold: 200,
        brief: "Wyvern Monarchs: FLYING and 1100 HP. Ballistae, Sharpshooters, lightning and Sylphs bring them down.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-dragonfly", "oc-wyvern", "oc-sandworm"], featured: "oc-wyvern", goals: [lost(3), noCharge],
        reward: { units: ["oc-aris"] } }),
      lvl({ id: "w5-3", world: 5, kind: "conveyor", name: "The Deep Mine Cart", waves: 15, terrain: "night", difficulty: 1.05, startGold: 0,
        brief: "CONVEYOR: the mine cart brings war machines and heavy hitters. Use them well.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-berserker", "oc-sandworm", "oc-wyvern", "oc-goblin", "oc-medusa"],
        conveyorPool: ["oc-longbow", "oc-ballista", "oc-iron-golem", "oc-cyclops", "oc-halfling", "oc-sylph", "oc-storm", "oc-ice", "oc-sharpshooter", "oc-arch-mage"],
        goals: [lost(3), noCharge], reward: { units: ["oc-leprechaun"], artifact: "ogres-club" } }),
      lvl({ id: "w5-4", world: 5, name: "Sultans of Flame", waves: 16, terrain: "night", difficulty: 1.05, startGold: 200,
        brief: "Efreet Sultans shrug off burning shots and scorch the melee that strikes them.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-kobold", "oc-sandworm", "oc-efreet", "oc-evil-eye"], featured: "oc-efreet", goals: [lost(3), spent(4500)],
        reward: { units: ["oc-crusader"] } }),
      lvl({ id: "w5-5", world: 5, kind: "boss", name: "The Spider's Web", waves: 18, terrain: "night", difficulty: 1.05, startGold: 200,
        brief: "The Spider Princess webs your troops; Cave Trolls regenerate. Burst damage wins here.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-berserker", "oc-troll", "oc-spider", "oc-wyvern", "oc-sandworm"], featured: "oc-spider", herald: "oc-troll",
        goals: [lost(4), noCharge], reward: { units: ["oc-ammo"], hero: "sensei" } })
    ] },
  { id: 6, name: "Deyja Barrows", terrain: "graveyard", art: "/assets/order-chaos/worlds/barrows.webp",
    blurb: "The heart of the undead: the vampire queen and her court.",
    levels: [
      lvl({ id: "w6-1", world: 6, name: "Carmilla's Court", waves: 16, terrain: "graveyard", difficulty: 1, startGold: 200,
        brief: "Carmilla heals for everything she bites and rises once when slain. Hit her twice as hard.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-death-rider", "oc-carmilla", "oc-harpy"], featured: "oc-carmilla", goals: [lost(3), spent(4500)],
        reward: { units: ["oc-hina"] } }),
      lvl({ id: "w6-2", world: 6, name: "Field of Stones", waves: 16, terrain: "graveyard", difficulty: 1.05, startGold: 200,
        brief: "Graves everywhere, and Necromancers raising more.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-necromancer", "oc-berserker", "oc-sea-witch", "oc-dragonfly"],
        graves: [{ lane: 0, col: 5 }, { lane: 0, col: 7 }, { lane: 1, col: 6 }, { lane: 2, col: 5 }, { lane: 2, col: 8 }, { lane: 3, col: 6 }, { lane: 4, col: 5 }, { lane: 4, col: 7 }],
        goals: [lost(3), noCharge], reward: { units: ["oc-salamander"] } }),
      lvl({ id: "w6-3", world: 6, kind: "protect", name: "The Last Chapel", waves: 16, terrain: "graveyard", difficulty: 1.05, startGold: 250,
        brief: "PROTECT: three Zealot Clerics hold the chapel. None may fall. Hexing Sorceresses turn your guards into sheep — a hexed troop still blocks, but cannot fight.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-carmilla", "oc-medusa", "oc-evil-eye", "oc-harpy", "oc-death-rider", "oc-sorceress"], featured: "oc-sorceress",
        preset: [{ kind: "oc-cleric", lane: 0, col: 3, protect: true }, { kind: "oc-cleric", lane: 2, col: 3, protect: true }, { kind: "oc-cleric", lane: 4, col: 3, protect: true }],
        goals: [lost(3), spent(4800)], reward: { units: ["oc-phoenix"], artifact: "orb-of-fire" } }),
      lvl({ id: "w6-4", world: 6, name: "Dread Cavalry", waves: 18, terrain: "graveyard", difficulty: 1.05, startGold: 200,
        brief: "Dread Knights: 1100 armour and a Death Blow every third strike.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-death-rider", "oc-dread-knight", "oc-necromancer", "oc-wyvern"], featured: "oc-dread-knight", goals: [lost(4), noCharge],
        reward: { units: ["oc-first-aid"] } }),
      lvl({ id: "w6-5", world: 6, kind: "boss", name: "The Pit Lord's Harvest", waves: 20, terrain: "graveyard", difficulty: 1.05, startGold: 200,
        brief: "Pit Lords raise the fallen Chaos over and over. Kill the Pit Lord and the harvest ends.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-carmilla", "oc-dread-knight", "oc-troll", "oc-pit-lord", "oc-harpy"], featured: "oc-pit-lord", herald: "oc-pit-lord",
        goals: [lost(4), spent(5500)], reward: { units: ["oc-akagi"], spell: "armageddon" } })
    ] },
  { id: 7, name: "Eeofol Hellgate", terrain: "hell", art: "/assets/order-chaos/worlds/hellgate.webp",
    blurb: "The source of the horde. Close the gate.",
    levels: [
      lvl({ id: "w7-1", world: 7, name: "Lucifina's Call", waves: 18, terrain: "lava", difficulty: 1.05,
        brief: "Lucifina calls Imp Runners into three lanes every 10 s.",
        enemies: ["oc-imp", "oc-trog-helm", "oc-shieldbearer", "oc-efreet", "oc-lucifina", "oc-goblin"], featured: "oc-lucifina", goals: [lost(3), noCharge],
        reward: { units: ["oc-unicorn"] } }),
      lvl({ id: "w7-2", world: 7, name: "Cacodemons", waves: 18, terrain: "hell", difficulty: 1.05,
        brief: "Cacodemons drift over your lines: 1600 HP of FLYING hell-ball.",
        enemies: ["oc-imp", "oc-shieldbearer", "oc-berserker", "oc-cacodemon", "oc-wyvern", "oc-efreet"], featured: "oc-cacodemon", goals: [lost(4), spent(5500)],
        reward: { units: ["oc-behemoth"] } }),
      lvl({ id: "w7-3", world: 7, kind: "last-stand", name: "Hold the Breach", waves: 15, terrain: "hell", difficulty: 1.05, startGold: 4500,
        brief: "LAST STAND at the breach: 4500 gold, no more. Hydras bite three lanes.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-death-rider", "oc-efreet", "oc-hydra", "oc-medusa", "oc-harpy"], surgeChance: 0.2, startSurges: 2,
        goals: [lost(4), noCharge], reward: { units: ["oc-cannon"] } }),
      lvl({ id: "w7-4", world: 7, name: "Heads of Chaos", waves: 20, terrain: "hell", difficulty: 1.05,
        brief: "Chaos Hydras regenerate and bite three lanes at once. Jotunn Warlords flatten anything.",
        enemies: ["oc-imp", "oc-shieldbearer", "oc-dread-knight", "oc-hydra", "oc-jotunn", "oc-lucifina", "oc-cacodemon"], featured: "oc-jotunn", goals: [lost(4), spent(6500)],
        reward: { units: ["oc-lightning"] } }),
      lvl({ id: "w7-5", world: 7, name: "The Cyberdemon", waves: 22, terrain: "hell", difficulty: 1.05,
        brief: "Rockets from five tiles away. Everything Chaos has, and the Cyberdemon leading it.",
        enemies: ["oc-imp", "oc-trog-helm", "oc-shieldbearer", "oc-carmilla", "oc-pit-lord", "oc-hydra", "oc-jotunn", "oc-cacodemon", "oc-cyberdemon"],
        featured: "oc-cyberdemon", herald: "oc-cyberdemon", goals: [lost(5), noCharge], reward: { units: ["oc-gorgon"] } }),
      lvl({ id: "w7-6", world: 7, kind: "boss", name: "The Lord of the Hellgate", waves: 0, terrain: "hell", difficulty: 1, startGold: 300, surgeChance: 0,
        brief: "BOSS: the Dracolich hovers at the far edge of one lane at a time, summoning Chaos. Only attacks that reach it — and spells — can hurt it.",
        enemies: [], boss: "dracolich", startSurges: 3, goals: [lost(6), noCharge], reward: { units: ["oc-titan", "oc-archangel"] } })
    ] },
  { id: 8, name: "Krewlod Badlands", terrain: "rough", art: "/assets/order-chaos/worlds/badlands.webp",
    blurb: "The Hellgate is shut, but Chaos gold still buys swords: mercenaries of every town ride for the horde.",
    levels: [
      lvl({ id: "w8-1", world: 8, name: "Sellswords", waves: 16, terrain: "rough", difficulty: 1.05, startGold: 200,
        brief: "Chaos pays well: Erathian Sellswords and Sea Dogs march for coin. Slay them and their pay drops on the lawn.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-sellsword", "oc-seadog", "oc-kobold", "oc-goblin"], featured: "oc-sellsword", goals: [lost(3), spent(4500)],
        reward: { units: ["oc-santa"], spell: "lightning-bolt" } }),
      lvl({ id: "w8-2", world: 8, name: "Wolves of Krewlod", waves: 16, terrain: "rough", difficulty: 1.05, startGold: 200,
        brief: "Wolf Raiders race in and bite twice as often. Pikes deal double to cavalry.",
        enemies: ["oc-imp", "oc-sellsword", "oc-wolf", "oc-berserker", "oc-hellhound", "oc-dragonfly"], featured: "oc-wolf", goals: [lost(3), noCharge],
        reward: { units: ["oc-griffin"] } }),
      lvl({ id: "w8-3", world: 8, kind: "conveyor", name: "The Caravan Road", waves: 16, terrain: "rough", difficulty: 1.05, startGold: 0,
        brief: "CONVEYOR: the caravan hands you troops. Nomad Outriders swerve round the first defender they meet — guard the neighbouring lanes too.",
        enemies: ["oc-sellsword", "oc-wolf", "oc-nomad", "oc-seadog", "oc-satyr", "oc-goblin"], featured: "oc-nomad",
        conveyorPool: ["oc-longbow", "oc-pikeman", "oc-pikeman", "oc-dwarf", "oc-griffin", "oc-cyclops", "oc-santa", "oc-sylph", "oc-crusader", "oc-ice"],
        goals: [lost(3), noCharge], reward: { units: ["oc-centaur"], artifact: "endless-purse" } }),
      lvl({ id: "w8-4", world: 8, name: "Cutthroats in the Dust", waves: 18, terrain: "rough", difficulty: 1.05, startGold: 200,
        brief: "Rogues cannot be seen until they come within 5 tiles of your gate, strike, or are caught in a blast. Bounty Hunters gun down your front line.",
        enemies: ["oc-shambler", "oc-sellsword", "oc-rogue", "oc-bounty", "oc-nomad", "oc-kobold", "oc-wyvern"], featured: "oc-rogue", goals: [lost(3), spent(5000)],
        reward: { units: ["oc-mage"], spell: "ice-bolt" } }),
      lvl({ id: "w8-5", world: 8, kind: "boss", name: "Hounds of the Pit", waves: 20, terrain: "rough", difficulty: 1.05, startGold: 200,
        brief: "Cerberi savage two defenders with every bite, and the whole mercenary warband rides behind them.",
        enemies: ["oc-sellsword", "oc-wolf", "oc-nomad", "oc-rogue", "oc-bounty", "oc-cerberus", "oc-ogre-shaman", "oc-berserker"], featured: "oc-cerberus", herald: "oc-cerberus",
        goals: [lost(4), noCharge], reward: { hero: "dace", artifact: "ambassadors-sash" } })
    ] },
  { id: 9, name: "The Void Rift", terrain: "cursed", art: "/assets/order-chaos/worlds/rift.webp",
    blurb: "Reality tears open over the elemental planes. What comes through is worse than Eeofol.",
    levels: [
      lvl({ id: "w9-1", world: 9, name: "Pale Riders", waves: 18, terrain: "cursed", difficulty: 1.05, startGold: 200,
        brief: "Wraiths drain your hero's mana with every strike; Mummies curse your troops to half speed.",
        enemies: ["oc-shambler", "oc-shieldbearer", "oc-wraith", "oc-mummy", "oc-death-rider", "oc-necromancer"], featured: "oc-wraith", goals: [lost(3), spent(5000)],
        reward: { units: ["oc-dendroid"], spell: "blind" } }),
      lvl({ id: "w9-2", world: 9, name: "Devils at the Door", waves: 18, terrain: "cursed", difficulty: 1.05, startGold: 200,
        brief: "Arch Devils vanish and reappear behind your lines. Keep something tough at the back; Magogs lob fire over your walls.",
        enemies: ["oc-imp", "oc-trog-helm", "oc-mummy", "oc-arch-devil", "oc-magog", "oc-efreet"], featured: "oc-arch-devil", goals: [lost(4), noCharge],
        reward: { units: ["oc-azusa"], artifact: "spirit-of-oppression" } }),
      lvl({ id: "w9-3", world: 9, kind: "last-stand", name: "Pain and Souls", waves: 15, terrain: "cursed", difficulty: 1.05, startGold: 4000,
        brief: "LAST STAND: 4000 gold and no more. Pain Elementals drift over your lines and burst into Lost Souls; Power Liches cloud your troops.",
        enemies: ["oc-imp", "oc-shieldbearer", "oc-pain", "oc-lich", "oc-scorpicore", "oc-wraith", "oc-harpy"], featured: "oc-pain", surgeChance: 0.2, startSurges: 2,
        goals: [lost(4), noCharge], reward: { units: ["oc-pegasus"], hero: "luna" } }),
      lvl({ id: "w9-4", world: 9, name: "Calamity", waves: 20, terrain: "cursed", difficulty: 1.05, startGold: 200,
        brief: "Wakamo stalks unseen and snipes from afar; Mancubi scorch whatever stands close. Prism Elementals spin now and then — straight shots that strike a spinning prism fly back at your line.",
        enemies: ["oc-sellsword", "oc-rogue", "oc-wakamo", "oc-mancubus", "oc-scorpicore", "oc-magog", "oc-prism", "oc-cacodemon"], featured: "oc-wakamo", goals: [lost(4), spent(6500)],
        reward: { units: ["oc-laffey"], spell: "implosion" } }),
      lvl({ id: "w9-5", world: 9, kind: "boss", name: "Wings of the Rift", waves: 22, terrain: "cursed", difficulty: 1.05, startGold: 200,
        brief: "The Black Dragon leads the great assaults: flying, immune to spells and too heavy for any gale. Only attacks that reach flyers bring it down.",
        enemies: ["oc-imp", "oc-sellsword", "oc-arch-devil", "oc-mancubus", "oc-pain", "oc-lich", "oc-hydra", "oc-black-dragon"], featured: "oc-black-dragon", herald: "oc-black-dragon",
        goals: [lost(5), noCharge], reward: { units: ["oc-belfast"], spell: "cure" } })
    ] },
  { id: 10, name: "The Carnival of Masks", terrain: "graveyard", art: "/assets/garrison/fields/night.webp",
    blurb: "Beyond the Rift, Chaos holds a masquerade under the moon: phantoms, dancers and beasts that never walk a straight line.",
    levels: [
      lvl({ id: "w10-1", world: 10, name: "Masks at Moonrise", waves: 18, terrain: "graveyard", difficulty: 1.1, startGold: 200,
        brief: "Phantoms drift straight through your troops, untouchable while they phase — then must gather themselves for 8 s. Keep a second line behind the first.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-imp", "oc-shieldbearer", "oc-kobold", "oc-phantom"], featured: "oc-phantom", goals: [lost(3), spent(5000)],
        reward: { units: ["oc-rearguard"] } }),
      lvl({ id: "w10-2", world: 10, name: "Stalkers in the Mist", waves: 18, terrain: "graveyard", difficulty: 1.1, startGold: 200,
        brief: "Werewolf Stalkers bound from lane to lane every couple of tiles. Cover the neighbouring lanes, not just the one they start in.",
        enemies: ["oc-imp", "oc-sellsword", "oc-wolf", "oc-hellhound", "oc-dragonfly", "oc-werewolf", "oc-phantom"], featured: "oc-werewolf", goals: [lost(3), noCharge],
        reward: { units: ["oc-nymph"] } }),
      lvl({ id: "w10-3", world: 10, name: "The Revel", waves: 20, terrain: "graveyard", difficulty: 1.1, startGold: 200,
        brief: "The Revel Queen stops to dance and calls four Revellers around her — above, below, ahead and behind. Break the ring before she calls them back.",
        enemies: ["oc-shambler", "oc-trog-helm", "oc-satyr", "oc-goblin", "oc-werewolf", "oc-revel-queen"], featured: "oc-revel-queen", herald: "oc-revel-queen",
        goals: [lost(3), spent(5500)], reward: { units: ["oc-mechanic"] } }),
      lvl({ id: "w10-4", world: 10, kind: "last-stand", name: "Rams at the Gate", waves: 15, terrain: "graveyard", difficulty: 1.1, startGold: 4500,
        brief: "LAST STAND: 4500 gold and no more. Battering Rams butt your front line back a tile; Juggernauts roll over all but tall troops — spikes and mines pop them.",
        enemies: ["oc-trog-helm", "oc-shieldbearer", "oc-sellsword", "oc-death-rider", "oc-goblin", "oc-ram", "oc-juggernaut"], featured: "oc-juggernaut", surgeChance: 0.18, startSurges: 2,
        goals: [lost(4), noCharge], reward: { units: ["oc-axe-dwarf"] } }),
      lvl({ id: "w10-5", world: 10, kind: "boss", name: "The Vile Carnival", waves: 22, terrain: "graveyard", difficulty: 1.1, startGold: 200,
        brief: "Arch-viles lead the great assaults and raise the fallen where they lie. Stun, freeze or blow them back to break the spell — or slay them first.",
        enemies: ["oc-phantom", "oc-werewolf", "oc-revel-queen", "oc-ram", "oc-juggernaut", "oc-carmilla", "oc-mummy", "oc-prism", "oc-arch-vile"], featured: "oc-arch-vile", herald: "oc-arch-vile",
        goals: [lost(5), noCharge], reward: { units: ["oc-serpent", "oc-cupi"] } })
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
      { kind: "oc-longbow", lane: 3, col: 1 }, { kind: "oc-dwarf", lane: 3, col: 3 }, { kind: "oc-longbow", lane: 4, col: 2 }
    ] },
  { id: "r2", world: 0, unlockWorld: 2, kind: "raid", name: "The Frozen Bastion", terrain: "snow", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Sylphs blow your flyers away and Iron Golems stop your Satyrs. Pick your lanes.",
    startMight: 400, atkCards: ["oc-imp", "oc-dragonfly", "oc-kobold", "oc-satyr", "oc-death-rider", "oc-goblin"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-peasant", lane, col: 0 })),
      { kind: "oc-sylph", lane: 0, col: 1 }, { kind: "oc-snow-elf", lane: 0, col: 2 },
      { kind: "oc-longbow", lane: 1, col: 1 }, { kind: "oc-iron-golem", lane: 1, col: 4 },
      { kind: "oc-cyclops", lane: 2, col: 1 }, { kind: "oc-pikeman", lane: 2, col: 4 },
      { kind: "oc-longbow", lane: 3, col: 2 }, { kind: "oc-sapper", lane: 3, col: 5 },
      { kind: "oc-sylph", lane: 4, col: 1 }, { kind: "oc-dwarf", lane: 4, col: 3 }
    ] },
  { id: "r3", world: 0, unlockWorld: 3, kind: "raid", name: "Mire Watch", terrain: "swamp", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Spikes, water shells and a Sharpshooter. Necromancers' graves soak their shots.",
    startMight: 450, atkCards: ["oc-shieldbearer", "oc-goblin", "oc-berserker", "oc-hobgoblin", "oc-necromancer", "oc-harpy", "oc-dragonfly"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-yuuka", lane, col: 0 })),
      { kind: "oc-sharpshooter", lane: 0, col: 1 }, { kind: "oc-gnome", lane: 0, col: 5 },
      { kind: "oc-halfling", lane: 1, col: 1 }, { kind: "oc-undine", lane: 1, col: 2 }, { kind: "oc-dwarf", lane: 1, col: 3 },
      { kind: "oc-cyclops", lane: 2, col: 1 }, { kind: "oc-gnome", lane: 2, col: 4 },
      { kind: "oc-longbow", lane: 3, col: 1 }, { kind: "oc-pikeman", lane: 3, col: 3 },
      { kind: "oc-sylph", lane: 4, col: 1 }, { kind: "oc-snow-elf", lane: 4, col: 2 }
    ] },
  { id: "r4", world: 0, unlockWorld: 4, kind: "raid", name: "Arcane Walls", terrain: "magic", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Genies slow you, Arch Mages chain their bolts, Clerics heal the line.",
    startMight: 500, atkCards: ["oc-trog-helm", "oc-medusa", "oc-evil-eye", "oc-sea-witch", "oc-sorceress", "oc-catapult", "oc-ogre-shaman", "oc-harpy", "oc-wyvern"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-enchanter", lane, col: 0 })),
      { kind: "oc-genie", lane: 0, col: 1 }, { kind: "oc-iron-golem", lane: 0, col: 4 },
      { kind: "oc-arch-mage", lane: 1, col: 1 }, { kind: "oc-cleric", lane: 1, col: 2 },
      { kind: "oc-faerie", lane: 2, col: 2 }, { kind: "oc-dwarf", lane: 2, col: 4 },
      { kind: "oc-arch-mage", lane: 3, col: 1 }, { kind: "oc-cleric", lane: 3, col: 2 },
      { kind: "oc-sylph", lane: 4, col: 1 }, { kind: "oc-sharpshooter", lane: 4, col: 2 }
    ] },
  { id: "r5", world: 0, unlockWorld: 5, kind: "raid", name: "Depth Charges", terrain: "night", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Ballistae pierce your lanes and Aris charges her cannon. Tunnel under them.",
    startMight: 550, atkCards: ["oc-kobold", "oc-sandworm", "oc-efreet", "oc-troll", "oc-spider", "oc-wyvern", "oc-cacodemon"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-leprechaun", lane, col: 0 })),
      { kind: "oc-ballista", lane: 0, col: 1 }, { kind: "oc-crusader", lane: 0, col: 4 },
      { kind: "oc-aris", lane: 1, col: 1 }, { kind: "oc-ammo", lane: 1, col: 2 }, { kind: "oc-longbow", lane: 1, col: 3 },
      { kind: "oc-ballista", lane: 2, col: 2 }, { kind: "oc-iron-golem", lane: 2, col: 5 },
      { kind: "oc-halfling", lane: 3, col: 1 }, { kind: "oc-crusader", lane: 3, col: 4 },
      { kind: "oc-aris", lane: 4, col: 1 }, { kind: "oc-gnome", lane: 4, col: 5 }
    ] },
  { id: "r6", world: 0, unlockWorld: 6, kind: "raid", name: "The Last Citadel", terrain: "hell", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Phoenixes, Unicorn wards, a First Aid Tent in every lane. Everything Chaos has is yours.",
    startMight: 750, atkCards: ["oc-imp", "oc-carmilla", "oc-pit-lord", "oc-dread-knight", "oc-hydra", "oc-jotunn", "oc-lucifina", "oc-cyberdemon"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-first-aid", lane, col: 0 })),
      { kind: "oc-phoenix", lane: 0, col: 3 }, { kind: "oc-hina", lane: 0, col: 1 },
      { kind: "oc-unicorn", lane: 1, col: 3 }, { kind: "oc-akagi", lane: 1, col: 1 },
      { kind: "oc-salamander", lane: 2, col: 2 }, { kind: "oc-longbow", lane: 2, col: 1 }, { kind: "oc-behemoth", lane: 2, col: 4 },
      { kind: "oc-unicorn", lane: 3, col: 3 }, { kind: "oc-hina", lane: 3, col: 1 },
      { kind: "oc-phoenix", lane: 4, col: 3 }, { kind: "oc-titan", lane: 4, col: 1 }
    ] },
  { id: "r7", world: 0, unlockWorld: 8, kind: "raid", name: "Mercenary Payday", terrain: "rough", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Griffins bite back and Centaurs lance two at a time. Your Nomads swerve round the first wall; Rogues slip in unseen.",
    startMight: 650, atkCards: ["oc-sellsword", "oc-wolf", "oc-nomad", "oc-rogue", "oc-bounty", "oc-cerberus", "oc-seadog"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-santa", lane, col: 0 })),
      { kind: "oc-centaur", lane: 0, col: 1 }, { kind: "oc-griffin", lane: 0, col: 4 },
      { kind: "oc-mage", lane: 1, col: 1 }, { kind: "oc-pikeman", lane: 1, col: 3 },
      { kind: "oc-centaur", lane: 2, col: 1 }, { kind: "oc-minotaur", lane: 2, col: 4 },
      { kind: "oc-longbow", lane: 3, col: 2 }, { kind: "oc-griffin", lane: 3, col: 4 },
      { kind: "oc-beholder", lane: 4, col: 1 }, { kind: "oc-naga", lane: 4, col: 4 }
    ] },
  { id: "r8", world: 0, unlockWorld: 9, kind: "raid", name: "Through the Rift", terrain: "cursed", lanes: ALL, waves: 0, enemies: [], difficulty: 1, startGold: 0, surgeChance: 0,
    brief: "Azure Dragons, Gold Golems and mined lanes. Your Arch Devils teleport behind them; the Black Dragon laughs at gales.",
    startMight: 850, atkCards: ["oc-wraith", "oc-mummy", "oc-arch-devil", "oc-magog", "oc-lich", "oc-pain", "oc-mancubus", "oc-prism", "oc-black-dragon"], goals: [], reward: {},
    preset: [
      ...ALL.map((lane) => ({ kind: "oc-belfast", lane, col: 0 })),
      { kind: "oc-azure", lane: 0, col: 3 }, { kind: "oc-laffey", lane: 0, col: 1 },
      { kind: "oc-gold-golem", lane: 1, col: 5 }, { kind: "oc-azusa", lane: 1, col: 1 }, { kind: "mine", lane: 1, col: 4 },
      { kind: "oc-pegasus", lane: 2, col: 3 }, { kind: "oc-titan", lane: 2, col: 1 },
      { kind: "oc-dendroid", lane: 3, col: 5 }, { kind: "oc-laffey", lane: 3, col: 1 }, { kind: "mine", lane: 3, col: 3 },
      { kind: "oc-azure", lane: 4, col: 3 }, { kind: "oc-centaur", lane: 4, col: 1 }
    ] }
];

/** Chaos Raids: each Chaos spell may be cast only so often per battle (no waiting to spam them). */
export const OC_RAID_CHARGES: Readonly<Partial<Record<SpellId, number>>> = { earthquake: 3, "war-cry": 3, resurrection: 2 };

/** Endless Siege: every Chaos creature the player has met, wave after wave. */
export const OC_ENDLESS: OcLevel = {
  id: "oc-endless", world: 0, kind: "endless", name: "Endless Siege", terrain: "grass", lanes: ALL, waves: 0, enemies: [],
  difficulty: 1, startGold: 150, surgeChance: 0.12, startSurges: 1, goals: [], reward: {},
  brief: "The horde never ends. After every great assault, choose one of three artifacts. How long can you hold?"
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
  { kind: "oc-bellwether", seals: 10 }
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

export type OcMilestone = { stars: number; label: string; artifact?: BlessingId; spell?: SpellId; seedSlot?: boolean; artifactSlot?: boolean; crown?: boolean };

export const OC_STAR_MILESTONES: readonly OcMilestone[] = [
  { stars: 12, label: "Helm of Heavenly Enlightenment", artifact: "helm-of-enlightenment" },
  { stars: 24, label: "+1 seed packet slot", seedSlot: true },
  { stars: 40, label: "Spell: Death Ripple", spell: "death-ripple" },
  { stars: 60, label: "Carry two Valor crowns", crown: true },
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
      // A troupe's backup dancers are met with their leader.
      const troupe = ENEMIES[kind]?.troupe;
      if (troupe && !met.includes(troupe.kind)) met.push(troupe.kind);
    }
    if (level.graves?.length && !met.includes("oc-grave")) met.push("oc-grave");
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
  if (goal.kind === "lost") return goal.max === 0 ? "Lose no troops" : `Lose no more than ${goal.max} troops`;
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
};

export function buildOcConfig(level: OcLevel, options: OcBuildOptions): GarrisonConfig {
  const raid = level.kind === "raid";
  const endless = level.kind === "endless";
  const conveyor = level.kind === "conveyor";
  const mode: GarrisonMode = raid ? "raid" : endless ? "endless" : conveyor ? "conveyor" : "adventure";
  const hero = OC_HEROES[options.hero] ?? OC_HEROES.catherine;
  const lvlOf = (kind: DefKind) => options.levels[kind] ?? 1;
  const artifacts = options.artifacts.filter((id) => OC_ARTIFACTS.includes(id) && id !== hero.passive);
  const general = options.spells.filter((id) => OC_SPELLS.includes(id) && id !== hero.spell).slice(0, OC_SPELLBOOK_SIZE);
  const spells: SpellId[] = [hero.spell, ...general].filter((id, i, all) => SPELLS[id] && all.indexOf(id) === i);
  const enemies = endless ? metEnemies(options.cleared).filter((kind) => ENEMIES[kind] && ENEMIES[kind]!.cost > 0) : [...level.enemies];
  return {
    mode,
    levelId: level.id,
    title: level.name,
    seed: options.seed,
    lanes: [...level.lanes],
    terrain: level.terrain,
    cards: raid || conveyor ? [] : options.cards.filter((kind) => CARDS[kind]).map((kind) => leveledKind(kind, lvlOf(kind))),
    spells: raid ? [] : spells,
    atkCards: raid ? (level.atkCards ?? []).filter((kind) => ENEMIES[kind]) : [],
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
    conveyorPool: conveyor ? (level.conveyorPool ?? []).map((kind) => leveledKind(kind, lvlOf(kind))) : undefined,
    atkMinX: raid ? 6 : undefined,
    ai: { def: false, atk: false },
    oc: {
      surgeChance: raid ? 0 : level.surgeChance,
      startSurges: raid ? 0 : level.startSurges ?? 0,
      blessings: raid ? [] : [hero.passive, ...artifacts],
      blessingPool: [...OC_ARTIFACTS, ...OC_HERO_ORDER.map((id) => OC_HEROES[id].passive), "lions-shield"],
      lastStand: level.kind === "last-stand",
      protect: level.preset?.filter((unit) => unit.protect).map((unit) => ({ lane: unit.lane, col: unit.col })),
      graves: level.graves?.map((spot) => ({ ...spot })),
      bossSummons: level.boss ? ["oc-shambler", "oc-trog-helm", "oc-shieldbearer", "oc-death-rider", "oc-carmilla", "oc-dread-knight", "oc-hydra", "oc-jotunn"] : undefined,
      bossDragon: level.boss ? "oc-cacodemon" : undefined,
      ultimates: raid ? [] : options.ultimates.map(baseKind).filter((kind) => OC_ULTIMATES[kind]),
      crownMax: Math.max(1, Math.floor(options.crowns)),
      atkCharges: raid ? { ...OC_RAID_CHARGES } : undefined
    }
  };
}

export function findOcLevel(id: string): OcLevel | undefined {
  if (id === OC_ENDLESS.id) return OC_ENDLESS;
  return OC_LEVELS.find((level) => level.id === id) ?? OC_RAIDS.find((level) => level.id === id);
}
