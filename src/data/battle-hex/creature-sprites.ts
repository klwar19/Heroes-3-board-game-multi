import atlases from "./creature-sprite-atlases.json";
import animTimes from "./creature-anim-times.json";
import { getHexBattleSpeed } from "@/lib/hex-battle-speed";

/**
 * Hex Battlefield creature sprites (the PC-style board). Each atlas is built from
 * a Heroes 3 creature .def by `scripts/build-creature-sprites.mjs`: one row per
 * H3 animation group, every frame cropped to the same box so the foot anchor
 * (anchorX, anchorY) is constant. For a .def creature the anchor is the point
 * the PC stands on its hex (canvas 196,266 — 15 px below the hex centre — or
 * the middle of a two-hex creature's hexes), so flyers keep their PC hover; a
 * sheet-built sprite anchors on its measured feet. H3 creatures face RIGHT; the
 * board mirrors a sprite to face left.
 *
 * A unit with no sprite here is drawn as a token of its card art on the hex
 * board — it still walks the same routes, lunges and recoils on the same beats.
 */
export type CreatureSpriteAtlas = {
  slug: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  anchorX: number;
  anchorY: number;
  /**
   * `start` (dense-packed sheets, scripts/pack-creature-atlases.mjs): the
   * group's first cell, its frames following cell by cell across `columns`.
   * Without it a group is one sheet row (`row`), frame k in column k.
   */
  groups: Record<string, { row: number; frames: number; start?: number }>;
  /**
   * The standing row idles back and forth (0..n-1..1) instead of looping —
   * sheet-built sprites (scripts/refit-sheet-sprites.mjs), whose generated idle
   * row does not lead from its last frame back into its first as H3's do.
   */
  idlePingPong?: boolean;
};

/** Pixel offset of frame `index` of a group inside its atlas sheet (either layout). */
export function spriteFrameOffset(
  atlas: Pick<CreatureSpriteAtlas, "frameWidth" | "frameHeight" | "columns">,
  info: { row: number; frames: number; start?: number },
  index: number
): { x: number; y: number } {
  const frame = Math.max(0, Math.min(index, info.frames - 1));
  if (info.start === undefined) return { x: frame * atlas.frameWidth, y: info.row * atlas.frameHeight };
  const cell = info.start + frame;
  return {
    x: (cell % atlas.columns) * atlas.frameWidth,
    y: Math.floor(cell / atlas.columns) * atlas.frameHeight
  };
}

/** H3 creature animation group ids (CREATURE .def block ids). */
export const SPRITE_GROUP = {
  move: 0,
  mouseOver: 1,
  standing: 2,
  hit: 3,
  defend: 4,
  death: 5,
  turnLeft: 7,
  turnRight: 8,
  attackUp: 11,
  attackStraight: 12,
  attackDown: 13,
  shootUp: 14,
  shootStraight: 15,
  shootDown: 16,
  /** Spell-casting groups; only caster atlases keep them (build --cast). */
  castUp: 17,
  castStraight: 18,
  castDown: 19,
  startMove: 20,
  stopMove: 21
} as const;

/**
 * Unit card -> [Few side, Pack side] creature. A card's Few side is drawn as the
 * base H3 creature and its Pack side as the upgrade (Halberdiers: Pikeman /
 * Halberdier). Neutral cards always show the Few (base) creature; summon-only
 * cards show the same creature on both sides.
 */
const CARD_SPRITES: Readonly<Record<string, readonly [few: string, pack: string | null]>> = {
  "castle.halberdiers": ["pikeman", "halberdier"],
  "castle.marksmen": ["archer", "marksman"],
  "castle.griffins": ["griffin", "royal-griffin"],
  "castle.crusaders": ["swordsman", "crusader"],
  "castle.zealots": ["monk", "zealot"],
  "castle.champions": ["cavalier", "champion"],
  "castle.archangels": ["angel", "archangel"],
  "necropolis.skeletons": ["skeleton", "skeleton-warrior"],
  "necropolis.zombies": ["walking-dead", "zombie"],
  "necropolis.wraiths": ["wight", "wraith"],
  "necropolis.vampires": ["vampire", "vampire-lord"],
  "necropolis.liches": ["lich", "power-lich"],
  "necropolis.dread_knights": ["black-knight", "dread-knight"],
  "necropolis.ghost_dragons": ["bone-dragon", "ghost-dragon"],
  "dungeon.troglodytes": ["troglodyte", "infernal-troglodyte"],
  "dungeon.harpies": ["harpy", "harpy-hag"],
  "dungeon.evil_eyes": ["beholder", "evil-eye"],
  "dungeon.medusas": ["medusa", "medusa-queen"],
  "dungeon.minotaurs": ["minotaur", "minotaur-king"],
  "dungeon.manticores": ["manticore", "scorpicore"],
  "dungeon.black_dragons": ["red-dragon", "black-dragon"],
  "rampart.centaurs": ["centaur", "centaur-captain"],
  "rampart.dwarves": ["dwarf", "battle-dwarf"],
  "rampart.elves": ["wood-elf", "grand-elf"],
  "rampart.pegasi": ["pegasus", "silver-pegasus"],
  "rampart.dendroids": ["dendroid-guard", "dendroid-soldier"],
  "rampart.unicorns": ["unicorn", "war-unicorn"],
  "rampart.gold_dragons": ["green-dragon", "gold-dragon"],
  "inferno.familiars": ["imp", "familiar"],
  "inferno.magogs": ["gog", "magog"],
  "inferno.cerberi": ["hell-hound", "cerberus"],
  "inferno.demons": ["demon", "horned-demon"],
  "inferno.pit_lords": ["pit-fiend", "pit-lord"],
  "inferno.efreet": ["efreet", "efreet-sultan"],
  "inferno.arch_devils": ["devil", "arch-devil"],
  "stronghold.goblins": ["goblin", "hobgoblin"],
  "stronghold.wolf_raiders": ["wolf-rider", "wolf-raider"],
  "stronghold.orcs": ["orc", "orc-chieftain"],
  "stronghold.ogres": ["ogre", "ogre-mage"],
  "stronghold.thunderbirds": ["roc", "thunderbird"],
  "stronghold.cyclopes": ["cyclops", "cyclops-king"],
  "stronghold.behemoths": ["behemoth", "ancient-behemoth"],
  "fortress.gnolls": ["gnoll", "gnoll-marauder"],
  "fortress.lizardmen": ["lizardman", "lizard-warrior"],
  "fortress.dragon_flies": ["serpent-fly", "dragon-fly"],
  "fortress.basilisks": ["basilisk", "greater-basilisk"],
  "fortress.gorgons": ["gorgon", "mighty-gorgon"],
  "fortress.wyverns": ["wyvern", "wyvern-monarch"],
  "fortress.hydras": ["hydra", "chaos-hydra"],
  "tower.gremlins": ["gremlin", "master-gremlin"],
  "tower.gargoyles": ["stone-gargoyle", "obsidian-gargoyle"],
  "tower.iron_golems": ["stone-golem", "iron-golem"],
  "tower.magi": ["mage", "arch-mage"],
  "tower.genies": ["genie", "master-genie"],
  "tower.nagas": ["naga", "naga-queen"],
  "tower.titans": ["giant", "titan"],
  "conflux.sprites": ["pixie", "sprite"],
  "conflux.storm_elementals": ["air-elemental", "storm-elemental"],
  "conflux.ice_elementals": ["water-elemental", "ice-elemental"],
  "conflux.energy_elementals": ["fire-elemental", "energy-elemental"],
  "conflux.magma_elementals": ["earth-elemental", "magma-elemental"],
  "conflux.magic_elementals": ["psychic-elemental", "magic-elemental"],
  "conflux.phoenixes": ["firebird", "phoenix"],
  "conflux.air_elementals": ["air-elemental", "air-elemental"],
  "conflux.earth_elementals": ["earth-elemental", "earth-elemental"],
  "conflux.fire_elementals": ["fire-elemental", "fire-elemental"],
  "conflux.water_elementals": ["water-elemental", "water-elemental"],
  // Horn of the Abyss towns (the HotA battle .defs, VCMI HotA mod)
  "cove.oceanids": ["nymph", "oceanid"],
  "cove.seamen": ["crew-mate", "seaman"],
  "cove.sea_dogs": ["pirate", "sea-dog"],
  "cove.ayssids": ["stormbird", "ayssid"],
  "cove.sorceresses": ["sea-witch", "sorceress"],
  "cove.nix": ["nix", "nix-warrior"],
  "cove.haspids": ["sea-serpent", "haspid"],
  "factory.halflings": ["halfling", "halfling-grenadier"],
  "factory.mechanics": ["mechanic", "engineer"],
  "factory.armadillos": ["armadillo", "bellwether-armadillo"],
  "factory.automatons": ["automaton", "sentinel-automaton"],
  "factory.sandworms": ["sandworm", "olgoi-khorkhoi"],
  "factory.couatls": ["couatl", "crimson-couatl"],
  "factory.dreadnoughts": ["dreadnought", "juggernaut"],
  "factory.gunslingers": ["gunslinger", "bounty-hunter"],
  "bulwark.kobolds": ["kobold", "kobold-foreman"],
  "bulwark.mountain_rams": ["mountain-ram", "argali"],
  "bulwark.snow_elves": ["snow-elf", "steel-elf"],
  "bulwark.yetis": ["yeti", "yeti-runemaster"],
  "bulwark.shamans": ["shaman", "great-shaman"],
  "bulwark.mammoths": ["mammoth", "war-mammoth"],
  "bulwark.jotunns": ["jotunn", "jotunn-warlord"],
  // Forge (no PC original): Codex repaints of real H3/HotA animations
  // (scripts/pose-sprite-manifest.json); the Tanks are an older Codex sheet
  // (scripts/import-sprite-sheet.mjs). A side whose atlas is missing (or null)
  // stands as its card token.
  "forge.grunts": ["forge-grunt", "forge-grunt-pack"],
  "forge.cyber_zombies": ["forge-cyber-zombie", "forge-cyber-zombie-pack"],
  "forge.watchers": ["forge-watcher", "forge-watcher-pack"],
  "forge.bruisers": ["forge-bruiser", "forge-bruiser-pack"],
  "forge.jump_troopers": ["forge-jump-trooper", "forge-jump-trooper-pack"],
  "forge.tanks": ["forge-tank", "forge-tank-pack"],
  "forge.cyberbrutes": ["forge-cyberbrute", "forge-cyberbrute-pack"],
  // Blue Archive (Kivotos): each student drawn from her official art over a real
  // H3/HotA animation (scripts/pose-sprite-manifest.json); one figure for both
  // card sides.
  "blue_archive.mika": ["ba-mika", "ba-mika"],
  "blue_archive.seia": ["ba-seia", "ba-seia"],
  "blue_archive.nagisa": ["ba-nagisa", "ba-nagisa"],
  "blue_archive.aris": ["ba-aris", "ba-aris"],
  "blue_archive.kei": ["ba-kei", "ba-kei"],
  "blue_archive.hoshino": ["ba-hoshino", "ba-hoshino"],
  "blue_archive.shiroko": ["ba-shiroko", "ba-shiroko"],
  "blue_archive.hina": ["ba-hina", "ba-hina"],
  "blue_archive.yuuka": ["ba-yuuka", "ba-yuuka"],
  "blue_archive.aru": ["ba-aru", "ba-aru"],
  "blue_archive.neru": ["ba-neru", "ba-neru"],
  "blue_archive.toki": ["ba-toki", "ba-toki"],
  "blue_archive.azusa": ["ba-azusa", "ba-azusa"],
  "blue_archive.wakamo": ["ba-wakamo", "ba-wakamo"],
  "blue_archive.saori": ["ba-saori", "ba-saori"],
  "blue_archive.iori": ["ba-iori", "ba-iori"],
  "blue_archive.mutsuki": ["ba-mutsuki", "ba-mutsuki"],
  "blue_archive.miyo": ["ba-miyo", "ba-miyo"],
  "blue_archive.hasumi": ["ba-hasumi", "ba-hasumi"],
  // Little Busters (no PC original): Codex repaints of real H3/HotA animations
  // as the card characters (scripts/pose-sprite-manifest.json); one character,
  // one sprite on both sides. Rin's Cat Corps summons are the same cat.
  "little_busters.haruka": ["lb-haruka", "lb-haruka"],
  "little_busters.rins_cats": ["lb-rins-cats", "lb-rins-cats"],
  "little_busters.stray_cat": ["lb-rins-cats", "lb-rins-cats"],
  "little_busters.alley_cat": ["lb-rins-cats", "lb-rins-cats"],
  "little_busters.disciplinary_committee": ["lb-kanata", "lb-kanata"],
  "little_busters.masato": ["lb-masato", "lb-masato"],
  "little_busters.softball_club": ["lb-softball", "lb-softball"],
  "little_busters.saya": ["lb-saya", "lb-saya"],
  "little_busters.mio": ["lb-mio", "lb-mio"],
  // Monster Girl Quest: Paradox: each girl drawn from her card art over the real
  // H3/HotA animation of the body she shares (lamia on the Medusa, mermaids on
  // the Water Elemental, taurs on the Centaurs, Queen Harpy on the Harpy Hag…;
  // scripts/pose-sprite-manifest.json); one figure for both card sides. Kamuro &
  // Kitsu are two rotoscoped girls merged into one figure
  // (scripts/merge-duo-sprite.mjs); the Four Spirits are the summoned spirit units.
  "mgq.pochi": ["mgq-pochi", "mgq-pochi"],
  "mgq.shesta": ["mgq-shesta", "mgq-shesta"],
  "mgq.gigi": ["mgq-gigi", "mgq-gigi"],
  "mgq.kamuro_kitsu": ["mgq-kamuro-kitsu", "mgq-kamuro-kitsu"],
  "mgq.fleesia": ["mgq-fleesia", "mgq-fleesia"],
  "mgq.sofia": ["mgq-sofia", "mgq-sofia"],
  "mgq.miyabi": ["mgq-miyabi", "mgq-miyabi"],
  "mgq.eater": ["mgq-eater", "mgq-eater"],
  "mgq.hild": ["mgq-hild", "mgq-hild"],
  "mgq.chrome_frederica": ["mgq-chrome-frederica", "mgq-chrome-frederica"],
  "mgq.shizuku": ["mgq-shizuku", "mgq-shizuku"],
  "mgq.regina": ["mgq-regina", "mgq-regina"],
  "mgq.maiden": ["mgq-maiden", "mgq-maiden"],
  "mgq.seraphy": ["mgq-seraphy", "mgq-seraphy"],
  "mgq.lisa": ["mgq-lisa", "mgq-lisa"],
  "mgq.tama": ["mgq-tama", "mgq-tama"],
  "mgq.maya": ["mgq-maya", "mgq-maya"],
  "mgq.matis": ["mgq-matis", "mgq-matis"],
  "mgq.ooma": ["mgq-ooma", "mgq-ooma"],
  "mgq.jessie": ["mgq-jessie", "mgq-jessie"],
  "mgq.aria": ["mgq-aria", "mgq-aria"],
  "mgq.carmilla": ["mgq-carmilla", "mgq-carmilla"],
  "mgq.giga": ["mgq-giga", "mgq-giga"],
  "mgq.lucretia": ["mgq-lucretia", "mgq-lucretia"],
  "mgq.cupi": ["mgq-cupi", "mgq-cupi"],
  "mgq.sphinx": ["mgq-sphinx", "mgq-sphinx"],
  "mgq.lucifina_chan": ["mgq-lucifina-chan", "mgq-lucifina-chan"],
  "mgq.spider_princess": ["mgq-spider-princess", "mgq-spider-princess"],
  "mgq.emily": ["mgq-emily", "mgq-emily"],
  "mgq.spirit_sylph": ["mgq-sylph", "mgq-sylph"],
  "mgq.spirit_gnome": ["mgq-gnome", "mgq-gnome"],
  "mgq.spirit_undine": ["mgq-undine", "mgq-undine"],
  "mgq.spirit_salamander": ["mgq-salamander", "mgq-salamander"],
  // Azur Lane: each shipgirl drawn from her official art (with her rigging) over
  // a real H3/HotA animation (scripts/pose-sprite-manifest.json); one figure for
  // both card sides.
  "azur_lane.laffey": ["al-laffey", "al-laffey"],
  "azur_lane.javelin": ["al-javelin", "al-javelin"],
  "azur_lane.honolulu": ["al-honolulu", "al-honolulu"],
  "azur_lane.unicorn": ["al-unicorn", "al-unicorn"],
  "azur_lane.yukikaze": ["al-yukikaze", "al-yukikaze"],
  "azur_lane.ayanami": ["al-ayanami", "al-ayanami"],
  "azur_lane.prinz_eugen": ["al-prinz-eugen", "al-prinz-eugen"],
  "azur_lane.i19": ["al-i-19", "al-i-19"],
  "azur_lane.akagi": ["al-akagi", "al-akagi"]
};

/**
 * Neutral-only creatures. Every other `neutral.<name>` card borrows the Few
 * creature of the town card with the same name (neutral.griffins -> Griffin).
 */
const NEUTRAL_SPRITES: Readonly<Record<string, string>> = {
  "neutral.boars": "boar",
  "neutral.halflings": "halfling",
  "neutral.peasants": "peasant",
  "neutral.rogues": "rogue",
  "neutral.mummies": "mummy",
  "neutral.nomads": "nomad",
  "neutral.sharpshooters": "sharpshooter",
  "neutral.gold_golems": "gold-golem",
  "neutral.diamond_golems": "diamond-golem",
  "neutral.enchanters": "enchanter",
  "neutral.trolls": "troll",
  "neutral.azure_dragons": "azure-dragon",
  "neutral.crystal_dragons": "crystal-dragon",
  "neutral.faerie_dragons": "faerie-dragon",
  "neutral.rust_dragons": "rust-dragon",
  // HotA neutrals; the neutral Grenadiers are the Factory card's Few (Halfling).
  "neutral.leprechaun": "leprechaun",
  "neutral.satyrs": "satyr",
  "neutral.fangarm": "fangarm",
  "neutral.steel_golems": "steel-golem",
  "neutral.grenadiers": "halfling"
};

/** Wake of Gods creatures (one creature on every side). */
const WOG_SPRITES: Readonly<Record<string, string>> = {
  "wog.ghost": "wog-ghost",
  "wog.fire_messenger": "wog-fire-messenger",
  "wog.earth_messenger": "wog-earth-messenger",
  "wog.air_messenger": "wog-air-messenger",
  "wog.water_messenger": "wog-water-messenger",
  "wog.gorynych": "wog-gorynych",
  "wog.war_zealot": "wog-war-zealot",
  "wog.arctic_sharpshooter": "wog-arctic-sharpshooter",
  "wog.lava_sharpshooter": "wog-lava-sharpshooter",
  "wog.nightmare": "wog-nightmare",
  "wog.santa_gremlin": "wog-santa-gremlin",
  "wog.sylvan_centaur": "wog-sylvan-centaur",
  "wog.werewolf": "wog-werewolf",
  "wog.hell_steed": "wog-hell-steed",
  "wog.dracolich": "wog-dracolich"
};

/**
 * The classic Doom monsters (neutral-only): each is its original DOOM / DOOM II
 * sprite design repainted over a real H3 creature's animation
 * (scripts/pose-sprite-manifest.json).
 */
const DOOM_SPRITES: Readonly<Record<string, string>> = {
  "doom.demon": "doom-demon",
  "doom.former_human": "doom-former-human",
  "doom.former_human_sergeant": "doom-former-human-sergeant",
  "doom.imp": "doom-imp",
  "doom.lost_soul": "doom-lost-soul",
  "doom.cacodemon": "doom-cacodemon",
  "doom.hell_knight": "doom-hell-knight",
  "doom.arachnotron": "doom-arachnotron",
  "doom.former_commando": "doom-former-commando",
  "doom.baron_of_hell": "doom-baron-of-hell",
  "doom.revenant": "doom-revenant",
  "doom.mancubus": "doom-mancubus",
  "doom.pain_elemental": "doom-pain-elemental",
  "doom.arch_vile": "doom-arch-vile",
  "doom.spider_mastermind": "doom-spider-mastermind",
  "doom.cyberdemon": "doom-cyberdemon"
};

/** WoG town Commanders (and the Forge's Mech Princess, Blue Archive's Ibuki), by commander slug. */
const COMMANDER_SPRITES: Readonly<Record<string, string>> = {
  paladin: "commander-paladin",
  hierophant: "commander-hierophant",
  temple_guardian: "commander-temple-guardian",
  succubus: "commander-succubus",
  soul_eater: "commander-soul-eater",
  brute: "commander-brute",
  ogre_leader: "commander-ogre-leader",
  shaman: "commander-shaman",
  astral_spirit: "commander-astral-spirit",
  // Mech Princess: Codex repaint of the Sorceress's H3 animation as her card art
  // (scripts/pose-sprite-manifest.json).
  forge: "commander-forge",
  // Ibuki (Blue Archive): her official art over the Sorceress's animation.
  ibuki: "ba-ibuki",
  // Kyousuke (Little Busters): his card art over the Swordsman's animation.
  kyousuke_natsume: "lb-kyousuke",
  // Sea Marshal / Artificer / Rune Keeper: card art over the Sea Dog's, Swordsman's and Minotaur King's animations.
  corsair: "commander-corsair",
  factory: "commander-factory",
  bulwark: "commander-bulwark",
  // Sonya (MGQ) and Belfast (Azur Lane): their card art over the Crusader's and
  // the Sea Witch's animations.
  sonya: "mgq-sonya",
  belfast: "al-belfast"
};

/**
 * Heroes fighting as battlefield units (the Little Busters heroes' heroUnit
 * bodies), by hero definition: their portrait characters over real H3
 * animations (scripts/pose-sprite-manifest.json).
 */
const HERO_UNIT_SPRITES: Readonly<Record<string, string>> = {
  sasami_sasasegawa: "lb-sasami",
  riki_naoe: "lb-riki",
  rin_natsume: "lb-rin",
  yuiko_kurugaya: "lb-yuiko",
  kudryavka_noumi: "lb-kud",
  komari_kamikita: "lb-komari"
};

const ATLASES = atlases as Record<string, Omit<CreatureSpriteAtlas, "slug">>;

function spriteSlugFor(unitDefId: string, variant: "few" | "pack" | "neutral" | undefined): string | undefined {
  if (WOG_SPRITES[unitDefId]) {
    return WOG_SPRITES[unitDefId];
  }
  if (DOOM_SPRITES[unitDefId]) {
    return DOOM_SPRITES[unitDefId];
  }
  if (unitDefId.startsWith("neutral.")) {
    const own = NEUTRAL_SPRITES[unitDefId];
    if (own) return own;
    const suffix = unitDefId.slice("neutral.".length);
    const townCard = Object.keys(CARD_SPRITES).find((id) => id.endsWith(`.${suffix}`));
    return townCard ? CARD_SPRITES[townCard][0] : undefined;
  }
  const pair = CARD_SPRITES[unitDefId];
  return pair ? (pair[variant === "pack" ? 1 : 0] ?? undefined) : undefined;
}

/** The creature drawn for a unit card's current side, or null (card token). */
export function creatureSpriteFor(
  unitDefId: string | undefined,
  variant?: "few" | "pack" | "neutral"
): CreatureSpriteAtlas | null {
  const slug = unitDefId ? spriteSlugFor(unitDefId, variant) : undefined;
  const atlas = slug ? ATLASES[slug] : undefined;
  return slug && atlas ? { slug, ...atlas } : null;
}

/**
 * The creature for a combat unit: its Commander figure, a battlefield hero's
 * own figure, else its card's current side.
 */
export function unitCreatureSprite(unit: {
  unitDefId?: string;
  variant?: "few" | "pack" | "neutral";
  commanderSlug?: string;
  heroDefId?: string;
}): CreatureSpriteAtlas | null {
  const commander = unit.commanderSlug ? COMMANDER_SPRITES[unit.commanderSlug] : undefined;
  if (commander) {
    return creatureSpriteForSlug(commander);
  }
  const hero = unit.heroDefId ? HERO_UNIT_SPRITES[unit.heroDefId] : undefined;
  if (hero) {
    return creatureSpriteForSlug(hero);
  }
  return creatureSpriteFor(unit.unitDefId, unit.variant);
}

/** An atlas by its slug (war machines are keyed by card, not unit definition). */
export function creatureSpriteForSlug(slug: string): CreatureSpriteAtlas | null {
  const atlas = ATLASES[slug];
  return atlas ? { slug, ...atlas } : null;
}

/**
 * War machine cards -> their battlefield machine. The PC's own machines come
 * from their H3 .defs (SMBAL, SMCATA, SMTENT, SMCART) and the Cove Cannon from
 * the HotA one (SMCANNON, the VCMI HotA mod), anchored on the PC canvas point
 * like the creatures (two-hex for the Ballista, Catapult, First Aid Tent and
 * Cannon, VCMI `doubleWide`). The Forge Lightning Generator has no PC
 * original: a Codex sheet drawn from its card art.
 */
const WAR_MACHINE_SPRITES: Readonly<Record<string, string>> = {
  "war_machine.ballista": "war-ballista",
  "war_machine.catapult": "war-catapult",
  "war_machine.ammo_cart": "war-ammo-cart",
  "war_machine.first_aid_tent": "war-first-aid-tent",
  "war_machine.lightning_generator": "war-lightning-generator",
  "war_machine.cannon": "war-cannon"
};

/** The machine drawn for a war machine card, or null (card token). */
export function warMachineSprite(cardId: string): CreatureSpriteAtlas | null {
  const slug = WAR_MACHINE_SPRITES[cardId];
  return slug ? creatureSpriteForSlug(slug) : null;
}

/**
 * Hex board: how long a war machine winds up before its shot leaves — its
 * straight firing row at its PC pace up to its CRANIM climax frame (a Ballista
 * 4 frames, 320 ms). The page starts the machine's firing row this much ahead
 * of the shot. 0 for a machine drawn as a card token.
 */
export function warMachineShotLeadMs(cardId: string): number {
  return Math.round(creatureShotDrawMs(warMachineSprite(cardId)));
}

export function spriteGroupFrames(atlas: CreatureSpriteAtlas, group: number): number {
  return atlas.groups[String(group)]?.frames ?? 0;
}

/**
 * An H3 "teleporter" (Devils): its move group is a single frame and its
 * start/stop-moving groups are the vanish / appear bursts, so it never walks —
 * it blinks out on its hex and in on the destination.
 */
export function spriteTeleports(atlas: CreatureSpriteAtlas): boolean {
  return spriteGroupFrames(atlas, SPRITE_GROUP.move) <= 1 &&
    spriteGroupFrames(atlas, SPRITE_GROUP.startMove) > 1 &&
    spriteGroupFrames(atlas, SPRITE_GROUP.stopMove) > 1;
}

/**
 * Hex board animation pace. Every clip runs at VCMI's battle "speedFactor"
 * (1 = the PC's slow combat speed, H3 10 frames a second; 2 normal; 3 fast):
 * 10·speed frames a second (client/battle/CreatureAnimation.cpp). The player
 * sets one speed per channel in the battle bar's Options
 * (src/lib/hex-battle-speed.ts):
 *  - move: the walk or flight, its start- and stop-moving frames, the turns
 *    inside it and a teleport's vanish / appear (VCMI paces MOVING,
 *    MOVE_START / MOVE_END, TURN_L / TURN_R and TELEPORT_START / TELEPORT_END
 *    by the one factor); default 3, the PC's fast setting
 *  - attack: melee, shoot and cast clips and the beats they land on; default 1.25
 *  - reaction: hit, defend, death / rise and turning to face; default 1.25
 * Every function below reads the live setting, so a change applies from the
 * next action on.
 */
function moveFrameMs(): number {
  return 100 / getHexBattleSpeed().move;
}

function actionFrameMs(): number {
  return 100 / getHexBattleSpeed().attack;
}

/**
 * The attack speed the hex strike beats (impact, shot release, cast release,
 * projectile flight, a shooter's early draw, the aim turn) are authored at:
 * the attack channel's default. At that speed every beat is its authored value.
 */
export const HEX_ANIMATION_SPEED = 1.25;

/**
 * A strike-sequence beat authored at HEX_ANIMATION_SPEED, at the player's
 * attack speed: a faster setting shortens the blow's wind-up, the shot's draw
 * and flight and the cast's wind-up together, so the figure, its projectile,
 * the damage number and the cry stay on one shared beat.
 */
export function hexActionBeatMs(ms: number): number {
  return (ms * HEX_ANIMATION_SPEED) / getHexBattleSpeed().attack;
}

/**
 * Hex board shot release: a shooter's arrow/bolt leaves on this beat after its
 * shoot animation starts (the bow is drawn first), still landing on the shared
 * impact beat (300 ms at the default attack speed). The card boards keep
 * fx.tsx's quicker RANGED_RELEASE_MS kick.
 */
export function hexRangedReleaseMs(): number {
  return hexActionBeatMs(300);
}

/**
 * Hex board cast release: a casting creature's spell leaves it this long after
 * its cast cue starts (the figure's wind-up; 450 ms at the default attack
 * speed). The figure and the FX timeline both read this one value.
 */
export function hexCastReleaseMs(): number {
  return hexActionBeatMs(450);
}

/** A shot's launch point per direction: PC pixels from the feet, facing right. */
export type MissileOffsets = { up: [number, number]; straight: [number, number]; down: [number, number] };
type CreatureAnimTimes = {
  walk?: number;
  attack?: number;
  /** 1-based shoot frame the projectile leaves on (CRANIM "Attack Climax Frame"). */
  climax?: number;
  missile?: MissileOffsets;
  /** Standing-loop frame time, ms (scripts/build-creature-anim-times.mjs idleFrameMs). */
  idle?: number;
  /** A rotoscoped sprite's footstep clip: its H3 donor's move sound. */
  gait?: string;
  /** false: the mouse-over row only copies the standing loop (no real fidget). */
  fidget?: boolean;
};
// Via unknown: JSON arrays type as number[], not the [x, y] pairs they hold.
const ANIM_TIMES = animTimes as unknown as Readonly<Record<string, CreatureAnimTimes>>;

/**
 * A creature's PC "Walk Animation Time" (H3 CRANIM.TXT; the HotA / WoG
 * creatures' VCMI animationTime; a rotoscoped sprite takes its donor's — see
 * scripts/build-creature-anim-times.mjs). Higher = slower: a Zombie 1.30, a
 * Pikeman 1.15, a Wolf Rider 0.93, an Archangel 0.82. Card-art tokens and
 * sheet-built war machines take the common 1.0.
 */
export function creatureWalkTime(atlas: Pick<CreatureSpriteAtlas, "slug"> | null): number {
  const walk = atlas ? ANIM_TIMES[atlas.slug]?.walk : undefined;
  return walk && Number.isFinite(walk) && walk > 0 ? walk : 1;
}

/**
 * Hex board pace, PC style: every creature has its own speed, its PC walk
 * time. VCMI moves a walker 2·speed / walk hexes a second and a flyer
 * 250·speed / walk PC pixels a second (one hex = 44 PC px), and plays the move
 * frames at 10·speed / walk frames a second — the legs keep the stride the
 * artists drew for that ground speed, the cycle running on across hexes.
 * `speed` here is the move channel.
 */
export function hexWalkStepMs(walkTime: number): number {
  return (1000 * walkTime) / (2 * getHexBattleSpeed().move);
}

/** Flight pace: ms per hex of straight-line (or routed) distance. */
export function hexFlyStepMs(walkTime: number): number {
  return (44 * 1000 * walkTime) / (250 * getHexBattleSpeed().move);
}

/** Move-group (walk / flight) frame duration. */
export function hexWalkFrameMs(walkTime: number): number {
  return moveFrameMs() * walkTime;
}

/**
 * Animation tempo from a unit's live Initiative swing (Haste, Slow, auras…):
 * every point speeds up (or slows down) ALL of its animations by 18%, from half
 * speed to 1.8× — so a Hasted stack visibly hurries and a Slowed one crawls.
 */
export function hexAnimationTempo(initiativeDelta: number): number {
  if (!Number.isFinite(initiativeDelta) || initiativeDelta === 0) return 1;
  return Math.min(1.8, Math.max(0.5, 1 + 0.18 * initiativeDelta));
}

/**
 * Melee / shoot / cast frame duration at normal tempo (the attack channel).
 * VCMI plays melee attacks at the one common rate so every blow lasts alike;
 * the wind-up still fits the shared impact beat (hex-figures playActionClip).
 */
export function hexActionFrameMs(): number {
  return actionFrameMs();
}

/**
 * Reaction frame duration (the reaction channel): the hit (hurt) and defend
 * clips, the death fall (and a resurrected stack rising), and the turn-around
 * (H3 turn-left group, flip, turn-right group) a figure plays to face or aim.
 * The turns inside a move play at the move pace (hexMovePlan).
 */
export function hexReactionFrameMs(): number {
  return 100 / getHexBattleSpeed().reaction;
}
/**
 * Idle frames: the standing loop (H3 HOLDING) and the mouse-over row both play
 * at the PC's 10 frames a second whatever the speed setting (VCMI: HOLDING
 * speed = creature idle time 10, MOUSEON = the 10 fps base speed).
 */
export const HEX_IDLE_FRAME_MS = 100;
/**
 * Chance that an idle creature fidgets (plays its mouse-over row once) after a
 * standing loop — VCMI rolls nextDouble(99) < timeBetweenFidgets·10, and H3 /
 * HotA creatures carry timeBetweenFidgets 1.
 */
export const HEX_IDLE_FIDGET_CHANCE = 0.1;

/**
 * A creature's standing-loop frame time. The PC loops every idle at 10 fps,
 * which on this big board makes the many creatures whose idle is a slight
 * breath (a Snow Elf, a Pikeman) tremble; the pace table measures each idle's
 * motion and slows a breath to about 2.2 s a cycle, a bigger motion to 1.5 s,
 * and keeps lively idles (flames, wings, elementals) at the PC's 10 fps.
 */
export function creatureIdleFrameMs(atlas: Pick<CreatureSpriteAtlas, "slug"> | null): number {
  const idle = atlas ? ANIM_TIMES[atlas.slug]?.idle : undefined;
  return idle && Number.isFinite(idle) && idle > 0 ? idle : HEX_IDLE_FRAME_MS;
}

/**
 * Whether a creature's mouse-over row is a real fidget. A rotoscoped sprite's
 * is only a copy of its standing loop: played as a fidget (or on mouse-over)
 * it would run the same breath at 10 fps, a sudden twitch.
 */
export function creatureHasFidget(atlas: Pick<CreatureSpriteAtlas, "slug"> | null): boolean {
  return !atlas || ANIM_TIMES[atlas.slug]?.fidget !== false;
}

/**
 * Shoot / cast frame duration (VCMI: 10·speed / attackAnimationTime frames a
 * second — a Gunslinger's 1.5 draws slower than an Archer's 1.0).
 */
export function creatureShootFrameMs(atlas: Pick<CreatureSpriteAtlas, "slug"> | null): number {
  const attack = atlas ? ANIM_TIMES[atlas.slug]?.attack : undefined;
  return actionFrameMs() * (attack && Number.isFinite(attack) && attack > 0 ? attack : 1);
}

/**
 * The 0-based frame of a shoot group on which the projectile leaves (VCMI
 * ShootingAnimation: CRANIM climax, 1-based, clamped to the group), or null
 * when the creature has no PC shot data.
 */
export function creatureShotClimaxFrame(atlas: CreatureSpriteAtlas | null, group: number): number | null {
  const climax = atlas ? ANIM_TIMES[atlas.slug]?.climax : undefined;
  const count = atlas ? spriteGroupFrames(atlas, group) : 0;
  if (!climax || !Number.isFinite(climax) || count === 0) return null;
  return Math.min(count, Math.max(1, Math.round(climax))) - 1;
}

/**
 * How long a creature draws before its shot leaves at normal tempo: its
 * straight shoot row played at its own pace up to the climax frame. The page
 * starts a hex shooter's clip this much before the shot's release beat (less
 * the shared hexRangedReleaseMs()), so the draw is never squeezed.
 */
export function creatureShotDrawMs(atlas: CreatureSpriteAtlas | null): number {
  if (!atlas) return 0;
  const group = spriteGroupFrames(atlas, SPRITE_GROUP.shootStraight) > 0 ? SPRITE_GROUP.shootStraight : SPRITE_GROUP.attackStraight;
  const count = spriteGroupFrames(atlas, group);
  if (count === 0) return 0;
  const climax = creatureShotClimaxFrame(atlas, group) ?? Math.max(1, Math.ceil(count / 2));
  return climax * creatureShootFrameMs(atlas);
}

/**
 * The footsteps of a rotoscoped figure's walk (its H3 donor's move clip), for
 * units whose own move sound is a spoken line; null for everyone else.
 */
export function creatureGaitSound(atlas: Pick<CreatureSpriteAtlas, "slug"> | null): string | null {
  return (atlas ? ANIM_TIMES[atlas.slug]?.gait : undefined) ?? null;
}

/** The creature's PC shot launch points (CRANIM missile offsets), or null. */
export function creatureMissileOffsets(atlas: Pick<CreatureSpriteAtlas, "slug"> | null): MissileOffsets | null {
  return (atlas ? ANIM_TIMES[atlas.slug]?.missile : undefined) ?? null;
}

/** The start-moving + stop-moving frames a (non-teleporting) move plays. */
export function spriteMoveEdgeFrames(atlas: CreatureSpriteAtlas | null): number {
  if (!atlas) return 0;
  return spriteGroupFrames(atlas, SPRITE_GROUP.startMove) + spriteGroupFrames(atlas, SPRITE_GROUP.stopMove);
}

/** Frames of one full turn-around for a creature (0 when it has no turn frames). */
export function spriteTurnFrames(atlas: CreatureSpriteAtlas | null): number {
  if (!atlas) return 0;
  return spriteGroupFrames(atlas, SPRITE_GROUP.turnLeft) + spriteGroupFrames(atlas, SPRITE_GROUP.turnRight);
}

/**
 * The shortest a walk or flight may travel: one hex at the common walk time
 * (1.0), so a one-hex flight still reads as a move without dragging a short
 * hop to a slower pace than a long run.
 */
function hexMoveMinMs(): number {
  return hexWalkStepMs(1);
}

/**
 * The shortest a teleport may play, so a blink out and in still reads: 400 ms
 * at the default move speed (3), longer or shorter with the move channel.
 */
function hexTeleportMinMs(): number {
  return (400 * 3) / getHexBattleSpeed().move;
}

export type HexMoveOptions = {
  unitDefId?: string;
  variant?: "few" | "pack" | "neutral";
  commanderSlug?: string;
  /** A battlefield hero's definition (its own figure's pace). */
  heroDefId?: string;
  /** The unit's printed Initiative (kept for callers; the pace is the creature's PC walk time). */
  initiative?: number;
  /** Live Initiative minus printed (Haste / Slow …): the animation tempo. */
  initiativeDelta?: number;
  /** A flying creature (flight pace), whether it glides straight or follows a route. */
  flyer?: boolean;
  steps: number;
  distance: number;
  /** Glides straight over `distance` hexes (a flyer with no walked route). */
  flying: boolean;
  teleport: boolean;
  /** Turn-arounds the walk needs (0-2: before setting off backwards, after arriving). */
  turns?: number;
};

/**
 * One hex move's timing, shared by the cue timeline (page.tsx) and the figure
 * (hex-figures.tsx) so the strike, damage number and sounds that follow a move
 * always wait for the unit to actually arrive:
 *  - walkers step hex by hex along `steps` (the route length) at their pace,
 *  - flyers glide straight over `distance` hexes (or follow a route) at flight pace,
 *  - teleporters (sprite Devils, teleport cues) blink out and in.
 * `legsMs` is the whole travel time (split evenly over the route's legs);
 * `walkFrameMs` the move group's frame duration (the cycle runs on across hexes).
 */
export function hexMovePlan(options: HexMoveOptions): {
  totalMs: number;
  legsMs: number;
  turnFrameMs: number;
  edgeFrameMs: number;
  teleportFrameMs: number;
  walkFrameMs: number;
} {
  const atlas = unitCreatureSprite(options);
  const tempo = hexAnimationTempo(options.initiativeDelta ?? 0);
  const walkTime = creatureWalkTime(atlas);
  const walkFrameMs = hexWalkFrameMs(walkTime) / tempo;
  // A move's own turns, start / stop frames and teleport blink all play at
  // the move pace (VCMI TURN_L/R, MOVE_START/END, TELEPORT_START/END).
  const moveFrame = moveFrameMs() / tempo;
  const turnFrameMs = moveFrame;
  const edgeFrameMs = moveFrame;
  const teleportFrameMs = moveFrame;
  const teleportMinMs = hexTeleportMinMs();
  if (atlas && (options.teleport || spriteTeleports(atlas))) {
    const frames = spriteMoveEdgeFrames(atlas);
    return {
      totalMs: Math.round(Math.max(teleportMinMs, frames * teleportFrameMs)),
      legsMs: 0,
      turnFrameMs,
      edgeFrameMs,
      teleportFrameMs: frames > 0 ? Math.max(teleportMinMs, frames * teleportFrameMs) / frames : teleportFrameMs,
      walkFrameMs
    };
  }
  if (options.teleport) {
    return { totalMs: Math.round(teleportMinMs), legsMs: 0, turnFrameMs, edgeFrameMs, teleportFrameMs, walkFrameMs };
  }
  const flyer = options.flyer ?? options.flying;
  const hexes = options.flying ? options.distance : options.steps;
  const stepMs = flyer ? hexFlyStepMs(walkTime) : hexWalkStepMs(walkTime);
  const legsMs = Math.max(hexMoveMinMs(), (hexes * stepMs) / tempo);
  const totalMs = legsMs + (options.turns ?? 0) * spriteTurnFrames(atlas) * turnFrameMs +
    spriteMoveEdgeFrames(atlas) * edgeFrameMs;
  return { totalMs: Math.round(totalMs), legsMs, turnFrameMs, edgeFrameMs, teleportFrameMs, walkFrameMs };
}

/** How long a unit's move plays on the hex board (see hexMovePlan). */
export function hexMoveDurationMs(options: HexMoveOptions): number {
  return hexMovePlan(options).totalMs;
}
