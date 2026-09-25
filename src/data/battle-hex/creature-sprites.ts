import atlases from "./creature-sprite-atlases.json";

/**
 * Hex Battlefield creature sprites (the PC-style board). Each atlas is built from
 * a Heroes 3 creature .def by `scripts/build-creature-sprites.mjs`: one row per
 * H3 animation group, every frame cropped to the same box so the foot anchor
 * (anchorX, anchorY) is constant. H3 creatures face RIGHT; the board mirrors a
 * sprite to face left.
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
  groups: Record<string, { row: number; frames: number }>;
};

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
  // Forge: Codex-drawn sprite sheets (scripts/import-sprite-sheet.mjs). A side
  // whose atlas is missing (or null) stands as its card token.
  "forge.grunts": ["forge-grunt", "forge-grunt-pack"],
  "forge.cyber_zombies": ["forge-cyber-zombie", "forge-cyber-zombie-pack"],
  "forge.watchers": ["forge-watcher", "forge-watcher-pack"],
  "forge.bruisers": ["forge-bruiser", "forge-bruiser-pack"],
  "forge.jump_troopers": ["forge-jump-trooper", "forge-jump-trooper-pack"],
  "forge.tanks": ["forge-tank", "forge-tank-pack"],
  "forge.cyberbrutes": ["forge-cyberbrute", "forge-cyberbrute-pack"]
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

/** WoG town Commanders, by commander slug. */
const COMMANDER_SPRITES: Readonly<Record<string, string>> = {
  paladin: "commander-paladin",
  hierophant: "commander-hierophant",
  temple_guardian: "commander-temple-guardian",
  succubus: "commander-succubus",
  soul_eater: "commander-soul-eater",
  brute: "commander-brute",
  ogre_leader: "commander-ogre-leader",
  shaman: "commander-shaman",
  astral_spirit: "commander-astral-spirit"
};

const ATLASES = atlases as Record<string, Omit<CreatureSpriteAtlas, "slug">>;

function spriteSlugFor(unitDefId: string, variant: "few" | "pack" | "neutral" | undefined): string | undefined {
  if (WOG_SPRITES[unitDefId]) {
    return WOG_SPRITES[unitDefId];
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

/** The creature for a combat unit: its Commander figure, else its card's current side. */
export function unitCreatureSprite(unit: {
  unitDefId?: string;
  variant?: "few" | "pack" | "neutral";
  commanderSlug?: string;
}): CreatureSpriteAtlas | null {
  const commander = unit.commanderSlug ? COMMANDER_SPRITES[unit.commanderSlug] : undefined;
  if (commander) {
    return creatureSpriteForSlug(commander);
  }
  return creatureSpriteFor(unit.unitDefId, unit.variant);
}

/** An atlas by its slug (war machines are keyed by card, not unit definition). */
export function creatureSpriteForSlug(slug: string): CreatureSpriteAtlas | null {
  const atlas = ATLASES[slug];
  return atlas ? { slug, ...atlas } : null;
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
 * Hex board shot release: a shooter's arrow/bolt leaves on this beat after its
 * shoot animation starts (the bow is drawn first), still landing on the shared
 * impact beat. The card boards keep fx.tsx's quicker RANGED_RELEASE_MS kick.
 */
export const HEX_RANGED_RELEASE_MS = 300;

/**
 * Hex board cast release: a casting creature's spell leaves it this long after
 * its cast cue starts (the figure's wind-up). The figure and the FX timeline
 * both read this one value.
 */
export const HEX_CAST_RELEASE_MS = 450;

/**
 * Hex board pace, PC style: every creature has its own speed. H3 drives it from
 * each creature's animation times (CRANIM.TXT, not shipped with the open
 * data), so here the card's printed Initiative sets it — a Zombie shambles, a
 * Wolf Rider runs — and flyers glide across the field much faster than any
 * walker (an Archangel crosses it in well under a second). One full walk cycle
 * plays per hex entered.
 */
export function hexWalkStepMs(initiative: number): number {
  return Math.round(Math.min(185, Math.max(110, 205 - 9 * initiative)));
}

/** Flight pace: ms per hex of straight-line distance. */
export function hexFlyStepMs(initiative: number): number {
  return Math.round(Math.min(100, Math.max(50, 118 - 6 * initiative)));
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

/** Teleport vanish/appear frame duration. */
export const HEX_TELEPORT_FRAME_MS = 45;
/** Turn-around frame duration (H3 turn-left group, flip, turn-right group). */
export const HEX_TURN_FRAME_MS = 50;
/** Start-moving / stop-moving frame duration (a walk's first and last beats). */
export const HEX_MOVE_EDGE_FRAME_MS = 45;
/**
 * Melee / shoot / cast frame duration at normal tempo (the PC's "fast" combat
 * speed is 20 frames a second; a touch slower keeps the blow readable).
 */
export const HEX_ACTION_FRAME_MS = 70;
/** Hit (hurt) and defend frame durations. */
export const HEX_HIT_FRAME_MS = 60;
/** Death frames (the fall, then the corpse holds its last frame). */
export const HEX_DEATH_FRAME_MS = 80;
/** Idle (standing) flourish frames. */
export const HEX_IDLE_FRAME_MS = 110;

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

/** The shortest any hex move may play (one quick hop still reads as a move). */
const HEX_MOVE_MIN_MS = 300;

export type HexMoveOptions = {
  unitDefId?: string;
  variant?: "few" | "pack" | "neutral";
  commanderSlug?: string;
  /** The unit's printed Initiative (its pace). */
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
 * `legsMs` is the whole travel time (split evenly over the route's legs).
 */
export function hexMovePlan(options: HexMoveOptions): {
  totalMs: number;
  legsMs: number;
  turnFrameMs: number;
  edgeFrameMs: number;
  teleportFrameMs: number;
} {
  const atlas = unitCreatureSprite(options);
  const tempo = hexAnimationTempo(options.initiativeDelta ?? 0);
  const initiative = options.initiative ?? 5;
  const turnFrameMs = HEX_TURN_FRAME_MS / tempo;
  const edgeFrameMs = HEX_MOVE_EDGE_FRAME_MS / tempo;
  const teleportFrameMs = HEX_TELEPORT_FRAME_MS / tempo;
  if (atlas && (options.teleport || spriteTeleports(atlas))) {
    const frames = spriteMoveEdgeFrames(atlas);
    return {
      totalMs: Math.round(Math.max(HEX_MOVE_MIN_MS, frames * teleportFrameMs)),
      legsMs: 0,
      turnFrameMs,
      edgeFrameMs,
      teleportFrameMs: frames > 0 ? Math.max(HEX_MOVE_MIN_MS, frames * teleportFrameMs) / frames : teleportFrameMs
    };
  }
  if (options.teleport) {
    return { totalMs: HEX_MOVE_MIN_MS, legsMs: 0, turnFrameMs, edgeFrameMs, teleportFrameMs };
  }
  const flyer = options.flyer ?? options.flying;
  const hexes = options.flying ? options.distance : options.steps;
  const stepMs = flyer ? hexFlyStepMs(initiative) : hexWalkStepMs(initiative);
  const legsMs = Math.max(HEX_MOVE_MIN_MS, (hexes * stepMs) / tempo);
  const totalMs = legsMs + (options.turns ?? 0) * spriteTurnFrames(atlas) * turnFrameMs +
    spriteMoveEdgeFrames(atlas) * edgeFrameMs;
  return { totalMs: Math.round(totalMs), legsMs, turnFrameMs, edgeFrameMs, teleportFrameMs };
}

/** How long a unit's move plays on the hex board (see hexMovePlan). */
export function hexMoveDurationMs(options: HexMoveOptions): number {
  return hexMovePlan(options).totalMs;
}
