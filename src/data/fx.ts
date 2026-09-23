import manifest from "./fx-manifest.json";
import soundDurations from "../../public/sounds/durations.json";

/**
 * Battle-effect sprite sheets converted from the original Heroes III defs
 * (scripts/convert-h3-defs.py). The manifest carries frame geometry; this
 * module maps the game's cards and unit abilities onto those sheets plus the
 * matching sounds from /public/sounds.
 */
export type FxSheet = {
  src: string;
  label: string;
  group: string;
  role: "affect" | "hit" | "projectile";
  frames: number;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  /** Loop ordered frames for authored projectile animations. */
  sequentialFrames?: boolean;
  /** Optional authored playback order when an atlas contains unusable takes. */
  frameOrder?: number[];
  /** Authored charge, travelling frames and impact frames in one atlas. */
  projectilePhases?: {
    launch: [number, number];
    flight: [number, number];
    impact: [number, number];
    widthInCells: number;
    impactWidthInCells: number;
  };
  /** A 4x4 atlas whose full ray is stretched between live combat anchors. */
  beamFrames?: boolean;
  scaleMultiplier?: number;
  /** Luminous artwork authored on black uses screen blending. */
  blendMode?: "screen";
  /** "bottom": the sprite stands on the cell floor (columns of light, bolts). */
  anchor: "center" | "bottom";
  opacity?: number;
  /** Width of the effect relative to one battle cell (area spells > 1). */
  coverage?: number;
  looksLike?: string;
  sourceDef: string;
};

const sheets = manifest as Record<string, FxSheet>;

// Heroes III's native Regeneration presentation. SP12_ is the blue/white
// counterpart to the green SP06_ Vampire Life Drain: the orb stays compact
// around the healed unit instead of washing across the whole card.
sheets.regeneration = {
  ...sheets["sp12_"],
  label: "Regeneration",
  group: "ability",
  looksLike: "blue-white rotating regeneration orb (Wight, Wraith, Troll, First Aid)",
  scaleMultiplier: 0.86,
};
const customVeterancyFxKeys = ["muscle-reversal", "returning-edge", "covering-extraction", "meridian-exchange", "rule-unravel", "field-repair", "break-cover", "clear-mind", "rescue-step", "blood-price"] as const;
for (const key of customVeterancyFxKeys) {
  sheets[`ctv-${key}`] = {
    src: `/fx/custom-town/${key}.webp`, label: key.replaceAll("-", " "), group: "custom-town-veterancy", role: "affect",
    frames: 16, cols: 4, rows: 4, frameWidth: 256, frameHeight: 256, fps: 18,
    anchor: "center", coverage: 1.15, sourceDef: `imagegen-ctv-${key}`, sequentialFrames: true, blendMode: "screen",
  };
}
sheets["town-dwarf-backlash"] = {
  src: "/fx/town-dwarf-backlash.webp", label: "Runic Backlash", group: "town-veterancy", role: "affect",
  frames: 16, cols: 4, rows: 4, frameWidth: 256, frameHeight: 256, fps: 20,
  anchor: "center", coverage: 1.2, sourceDef: "imagegen-town-dwarf-backlash", sequentialFrames: true, blendMode: "screen",
};
sheets["neutral-sandstorm"] = {
  src: "/fx/neutral-sandstorm.webp", label: "Sandstorm", group: "neutral-veterancy", role: "affect",
  frames: 24, cols: 6, rows: 4, frameWidth: 256, frameHeight: 256, fps: 18,
  anchor: "center", coverage: 1.8, sourceDef: "imagegen-neutral-sandstorm", sequentialFrames: true,
};
sheets["town-ram-earth-spike"] = {
  src: "/fx/town-ram-earth-spike.webp", label: "Mountain Ram earth spike", group: "town-veterancy", role: "affect",
  frames: 16, cols: 4, rows: 4, frameWidth: 256, frameHeight: 256, fps: 28,
  anchor: "bottom", scaleMultiplier: 0.72, sourceDef: "imagegen-town-ram-earth-spike", sequentialFrames: true,
};
sheets["town-dragon-fly-venomous-landing"] = {
  src: "/fx/town-dragon-fly-venomous-landing.webp", label: "Dragon Fly venomous landing", group: "town-veterancy", role: "affect",
  frames: 16, cols: 4, rows: 4, frameWidth: 313.5, frameHeight: 313.5, fps: 24,
  anchor: "center", coverage: 1.35, sourceDef: "imagegen-town-dragon-fly-venomous-landing", sequentialFrames: true,
};
sheets["town-gnoll-gold-coin"] = {
  src: "/assets/anime/equipment/lucky_coin.webp", label: "Raiders' Pay gold coin", group: "town-veterancy", role: "affect",
  frames: 1, cols: 1, rows: 1, frameWidth: 192, frameHeight: 192, fps: 15,
  anchor: "center", coverage: 0.72, sourceDef: "existing-lucky-coin-art",
};
// Purpose-built, transparent physical projectiles for the three damaging war
// machines. These are code-shipped under /public/fx (rather than CDN media), so
// a combat snapshot can always render them even when the larger art pack is not
// installed locally. All point right; FxStage rotates/mirrors them to the live
// source/target geometry.
sheets["war-machine-ballista-projectile"] = {
  src: "/fx/war-machine-ballista-projectile.webp", label: "Ballista bolt", group: "war-machines", role: "projectile",
  frames: 1, cols: 1, rows: 1, frameWidth: 180, frameHeight: 60, fps: 15,
  anchor: "center", sourceDef: "imagegen-war-machine-ballista-projectile",
};
sheets["war-machine-catapult-projectile"] = {
  src: "/fx/war-machine-catapult-projectile.webp", label: "Catapult boulder", group: "war-machines", role: "projectile",
  frames: 1, cols: 1, rows: 1, frameWidth: 140, frameHeight: 70, fps: 15,
  anchor: "center", sourceDef: "imagegen-war-machine-catapult-projectile",
};
sheets["war-machine-cannon-projectile"] = {
  src: "/fx/war-machine-cannon-projectile.webp", label: "Cannonball", group: "war-machines", role: "projectile",
  frames: 1, cols: 1, rows: 1, frameWidth: 150, frameHeight: 75, fps: 15,
  anchor: "center", sourceDef: "imagegen-war-machine-cannon-projectile",
};

// Original transparent melee-contact atlas. FxStage mirrors it from the live
// attacker/defender geometry so the crescent follows either army's strike.
sheets["melee-crescent-slash"] = {
  src: "/fx/melee-crescent-slash-v2.webp", label: "Melee crescent slash", group: "melee-attacks", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 314, frameHeight: 314, fps: 40,
  anchor: "center", sourceDef: "imagegen-melee-crescent-slash-v2", sequentialFrames: true,
};
sheets["melee-starry-strike"] = {
  src: "/fx/melee-starry-strike.webp", label: "Melee starry strike", group: "melee-attacks", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 314, frameHeight: 314, fps: 40,
  anchor: "center", sourceDef: "imagegen-melee-starry-strike", sequentialFrames: true,
};
sheets["melee-thrust-impact"] = {
  src: "/fx/melee-thrust-forward.webp", label: "Forward melee thrust", group: "melee-attacks", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 384, frameHeight: 256, fps: 40,
  anchor: "center", sourceDef: "imagegen-melee-thrust-forward", sequentialFrames: true,
};
sheets["melee-claw-rake-animated"] = {
  src: "/fx/melee-claw-marks-animated.webp", label: "Creature claw marks", group: "melee-attacks", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 256, frameHeight: 256, fps: 32,
  anchor: "center", sourceDef: "imagegen-melee-claw-marks", sequentialFrames: true,
};
sheets["arch-devil-hellfire-slash"] = {
  src: "/fx/arch-devil-hellfire-slash.webp", label: "Arch Devil dark hellfire slash", group: "melee-attacks", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 313.5, frameHeight: 313.5, fps: 32,
  anchor: "center", sourceDef: "imagegen-arch-devil-hellfire-slash", sequentialFrames: true,
};
sheets["hydra-multi-bite"] = {
  src: "/fx/hydra-multi-bite.webp", label: "Hydra consecutive multi-bite", group: "melee-attacks", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 313.5, frameHeight: 313.5, fps: 24,
  anchor: "center", sourceDef: "imagegen-hydra-multi-bite", sequentialFrames: true,
};
sheets["haspid-poison-bite"] = {
  src: "/fx/haspid-poison-bite.webp", label: "Haspid poison bite", group: "melee-attacks", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 313.5, frameHeight: 313.5, fps: 28,
  anchor: "center", sourceDef: "imagegen-haspid-poison-bite", sequentialFrames: true,
};

// Compact original anime-town contact atlases. Every sheet is authored facing
// right; the renderer rotates and mirrors it from the live attacker anchor to
// the live target anchor, including opposite-side and flipped boards.
for (const [key, label] of [
  ["anime-naval-melee", "Point-blank naval barrage"],
  ["blue-archive-melee", "Kivotos tactical baton strike"],
  ["mgq-tentacle-lash", "Monster tentacle lash"],
  ["little-busters-warning-strike", "Disciplinary warning strike"],
  ["saya-multi-slash", "Saya multi-slash"],
  ["softball-melee-strike", "Softball Club bat strike"],
  ["haruka-marble-strike", "Haruka marble prank strike"],
  ["masato-muscle-punch", "Masato muscle punch"],
  ["mio-parasol-thrust", "Mio parasol thrust"],
  ["rins-cats-pounce", "Rin's Cats triple pounce"],
  ["sasami-softball-strike", "Sasami captain softball strike"],
  ["riki-team-heart-strike", "Riki Team Heart charge"],
  ["rin-catlike-combo", "Rin catlike combo"],
] as const) {
  sheets[key] = {
    src: key === "little-busters-warning-strike"
      ? "/fx/little-busters-warning-shot.webp"
      : `/fx/${key}.webp`,
    label, group: "anime-melee-attacks", role: "hit",
    frames: 16, cols: 4, rows: 4, frameWidth: 192, frameHeight: 192, fps: 32,
    anchor: "center", sourceDef: `imagegen-${key}`, sequentialFrames: true,
  };
}

export type MeleeFxKey = "melee-crescent-slash" | "melee-starry-strike" | "melee-thrust-impact"
  | "melee-claw-rake-animated" | "cyberbrute-claw-rake-animated" | "melee-bite-snap-animated" | "thunderbird-trident-zap-animated"
  | "phoenix-flame-flow-animated" | "dragon-fire-breath-animated" | "dragon-fierce-breath-animated" | "dragon-small-breath-animated" | "faerie-rainbow-breath-animated" | "azure-ice-breath-animated"
  | "crystal-red-strike-animated" | "rust-acid-breath-animated" | "arch-devil-hellfire-slash"
  | "hydra-multi-bite" | "haspid-poison-bite" | "town-ram-earth-spike"
  | "anime-naval-melee" | "blue-archive-melee" | "mgq-tentacle-lash"
  | "little-busters-warning-strike" | "saya-multi-slash" | "softball-melee-strike"
  | "haruka-marble-strike" | "masato-muscle-punch" | "mio-parasol-thrust"
  | "rins-cats-pounce" | "sasami-softball-strike" | "riki-team-heart-strike"
  | "rin-catlike-combo";

// Only unmistakable blade users receive the crescent. Point-first weapons,
// horns and charges use the close-range thrust. Explicit anatomy profiles below
// cover talons and jaws; fists, clubs, magic bodies and any custom unit without
// a specific profile use the compact contact burst.
const crescentSlashUnits = new Set([
  "assassins", "berserkers", "bounty_hunters", "crusaders",
  "dread_knights", "dwarves", "genin_squad", "hokage_vanguard",
  "inner_swordsmen", "minotaurs", "nagas", "nix", "nomads", "oceanids",
  "outer_disciples", "pit_lords", "rogues", "sabers", "seamen", "sect_protectors",
  "skeletons", "space_marines", "true_inheritors", "wolf_raiders",
]);
const thrustUnits = new Set([
  "boars", "centaurs", "champions", "dragon_flies", "halberdiers", "kobolds", "lancers",
  "mountain_rams", "pegasi", "troglodytes", "unicorns",
]);
// Creature anatomy profiles. These effects are full source-to-target atlases,
// so a left-side and right-side army get the same readable rake/snap after the
// live combat geometry rotates the authored right-facing frames.
const clawUnits = new Set([
  "ayssids", "behemoths", "griffins", "harpies", "manticores", "wyverns",
]);
const biteUnits = new Set([
  "basilisk_queen", "basilisks", "cerberi", "couatls", "floor_wyrm", "haspids",
  "hydras", "sandworms",
]);

const animeMeleeFxByUnit: Record<string, MeleeFxKey> = {
  // Little Busters: every recruit/summon and every melee battlefield hero has
  // a distinct presentation. Kud and Komari are forced through their ranged
  // missile/heart plans below even when attacking an adjacent target.
  "little_busters.haruka": "haruka-marble-strike",
  "little_busters.rins_cats": "rins-cats-pounce",
  "little_busters.disciplinary_committee": "little-busters-warning-strike",
  "little_busters.masato": "masato-muscle-punch",
  "little_busters.softball_club": "softball-melee-strike",
  "little_busters.saya": "saya-multi-slash",
  "little_busters.mio": "mio-parasol-thrust",
  "little_busters.stray_cat": "melee-bite-snap-animated",
  "little_busters.alley_cat": "melee-claw-rake-animated",
  sasami_sasasegawa: "sasami-softball-strike",
  riki_naoe: "riki-team-heart-strike",
  rin_natsume: "rin-catlike-combo",
  yuiko_kurugaya: "melee-crescent-slash",

  // Monster Girl Quest Paradox anatomy/weapon profiles. Ranged cards use the
  // same profile when adjacency makes their attack melee.
  "mgq.spirit_sylph": "melee-starry-strike",
  "mgq.spirit_gnome": "melee-thrust-impact",
  "mgq.spirit_undine": "mgq-tentacle-lash",
  "mgq.spirit_salamander": "dragon-fire-breath-animated",
  "mgq.pochi": "melee-bite-snap-animated",
  "mgq.shesta": "melee-claw-rake-animated",
  "mgq.gigi": "melee-bite-snap-animated",
  "mgq.kamuro_kitsu": "melee-claw-rake-animated",
  "mgq.fleesia": "mgq-tentacle-lash",
  "mgq.sofia": "melee-bite-snap-animated",
  "mgq.miyabi": "mgq-tentacle-lash",
  "mgq.eater": "melee-bite-snap-animated",
  "mgq.hild": "melee-starry-strike",
  "mgq.chrome_frederica": "melee-claw-rake-animated",
  "mgq.shizuku": "melee-starry-strike",
  "mgq.regina": "melee-crescent-slash",
  "mgq.maiden": "melee-thrust-impact",
  "mgq.seraphy": "melee-bite-snap-animated",
  "mgq.lisa": "melee-starry-strike",
  "mgq.tama": "melee-claw-rake-animated",
  "mgq.maya": "mgq-tentacle-lash",
  "mgq.matis": "melee-claw-rake-animated",
  "mgq.ooma": "mgq-tentacle-lash",
  "mgq.jessie": "melee-thrust-impact",
  "mgq.aria": "mgq-tentacle-lash",
  "mgq.carmilla": "melee-bite-snap-animated",
  "mgq.giga": "dragon-fierce-breath-animated",
  "mgq.lucretia": "melee-claw-rake-animated",
  "mgq.cupi": "melee-starry-strike",
  "mgq.sphinx": "melee-bite-snap-animated",
  "mgq.lucifina_chan": "melee-starry-strike",
  "mgq.spider_princess": "melee-bite-snap-animated",
  "mgq.emily": "mgq-tentacle-lash",
};

export function unitMeleeFxKey(unitDefId: string | undefined): MeleeFxKey {
  if (unitDefId?.startsWith("azur_lane.")) return "anime-naval-melee";
  if (unitDefId === "blue_archive.mika") return "masato-muscle-punch";
  if (unitDefId === "blue_archive.seia") return "melee-starry-strike";
  if (unitDefId === "blue_archive.kei") return "thunderbird-trident-zap-animated";
  if (unitDefId === "blue_archive.miyo") return "melee-crescent-slash";
  if (unitDefId?.startsWith("blue_archive.")) return "blue-archive-melee";
  const animeProfile = unitDefId ? animeMeleeFxByUnit[unitDefId] : undefined;
  if (animeProfile) return animeProfile;
  const slug = unitDefId?.split(/[.:]/).at(-1)?.replaceAll("-", "_");
  if (slug === "arch_devils") return "arch-devil-hellfire-slash";
  // Forge: the Cyberbrute rakes like a Behemoth, only bigger; the Cyber
  // Zombie's chainsaw arm tears a flurry of cuts; the Jump Trooper rams in
  // on its jetpack.
  if (slug === "cyberbrutes") return "cyberbrute-claw-rake-animated";
  if (slug === "cyber_zombies") return "saya-multi-slash";
  if (slug === "jump_troopers") return "melee-thrust-impact";
  if (slug === "hydras") return "hydra-multi-bite";
  if (slug === "haspids") return "haspid-poison-bite";
  if (["earth_elementals", "magma_elementals"].includes(slug ?? "")) return "town-ram-earth-spike";
  if (["efreet", "fire_elementals"].includes(slug ?? "")) return "dragon-small-breath-animated";
  if (["faerie_dragon", "faerie_dragons"].includes(slug ?? "")) return "faerie-rainbow-breath-animated";
  if (["phoenix", "phoenixes"].includes(slug ?? "")) return "phoenix-flame-flow-animated";
  if (["azure_dragon", "azure_dragons"].includes(slug ?? "")) return "azure-ice-breath-animated";
  if (["crystal_dragon", "crystal_dragons"].includes(slug ?? "")) return "crystal-red-strike-animated";
  if (["rust_dragon", "rust_dragons"].includes(slug ?? "")) return "rust-acid-breath-animated";
  if (["black_dragon", "black_dragons"].includes(slug ?? "")) return "dragon-fierce-breath-animated";
  if (["gold_dragon", "gold_dragons"].includes(slug ?? "")) return "dragon-fire-breath-animated";
  if ([
    "green_dragon", "green_dragons", "red_dragon", "red_dragons",
    "hell_steed", "hell_steeds", "nightmare", "nightmares",
  ].includes(slug ?? "")) return "dragon-fire-breath-animated";
  // The Gorgon's attack is presented as the same directed breath stream as a
  // dragon, while retaining the Gorgon's own attack voice and Death Stare FX.
  if (["gorgon", "gorgons", "warden_gorgon_matron"].includes(slug ?? "")) return "dragon-fire-breath-animated";
  if (["air_elementals", "storm_elementals", "energy_elementals", "thunderbird", "thunderbirds"].includes(slug ?? "")) {
    return "thunderbird-trident-zap-animated";
  }
  if (slug && clawUnits.has(slug)) return "melee-claw-rake-animated";
  if (slug && biteUnits.has(slug)) return "melee-bite-snap-animated";
  if (slug && crescentSlashUnits.has(slug)) return "melee-crescent-slash";
  if (slug && thrustUnits.has(slug)) return "melee-thrust-impact";
  return "melee-starry-strike";
}

// Generated 4x4 phase atlases. Dimensions reflect the delivered 1254px images,
// not the requested generator size. CSS samples each quarter without recutting.
const rangedPhaseSizes: Record<string, [number, number]> = {
  titan: [0.95, 1.25],
  magi: [0.75, 1.05],
  "evil-eye": [0.7, 0.9],
  "azur-lane": [0.7, 1.3],
  "blue-archive": [0.5, 0.65],
  zealot: [0.7, 1.05],
  arrow: [0.6, 0.6],
  crossbow: [0.5, 0.55],
  axe: [0.5, 0.7],
  spear: [0.75, 0.65],
  stone: [0.35, 0.6],
  fireball: [0.7, 1.2],
  "death-cloud": [0.75, 1.25],
  ice: [0.65, 1],
  plasma: [0.55, 0.9],
  rocket: [0.65, 1.2],
  shotgun: [0.95, 1.2],
  kunai: [0.45, 0.55],
  baseball: [0.4, 0.55],
};
for (const [name, [widthInCells, impactWidthInCells]] of Object.entries(rangedPhaseSizes)) {
  sheets[`${name}-shot-phases`] = {
    src: `/fx/${name}-shot-phases-alpha.webp`, label: `${name} phased shot`,
    group: "ranged-attacks", role: "projectile",
    frames: 16, cols: 4, rows: 4, frameWidth: 313.5, frameHeight: 313.5,
    fps: 24, anchor: "center", sequentialFrames: true,
    sourceDef: `imagegen-${name}-shot-phases`,
    projectilePhases: {
      launch: [0, 4], flight: [4, 8], impact: [12, 4],
      widthInCells, impactWidthInCells,
    },
  };
}
// The shotgun atlas was exported at 1256px (4 x 314), not the shared 1254px.
Object.assign(sheets["shotgun-shot-phases"], { frameWidth: 314, frameHeight: 314 });

// These authored frames depict a growing, pulsing, then dissipating full ray.
// They are played across the whole shooter-to-target segment, not flown as an orb.
for (const name of ["evil-eye", "magi"] as const) {
  sheets[`${name}-shot-phases`] = {
    src: `/fx/${name}-beam-animated.webp`, label: `${name} animated beam`,
    group: "ranged-attacks", role: "projectile", frames: 16, cols: 4, rows: 4,
    frameWidth: name === "evil-eye" ? 444 : 384,
    frameHeight: name === "evil-eye" ? 222 : 256,
    fps: 24, anchor: "center", sequentialFrames: true, beamFrames: true,
    sourceDef: `imagegen-${name}-beam-animated`,
  };
}
sheets["factory-dreadnought-laser-beam"] = {
  src: "/fx/factory-dreadnought-laser-beam.webp", label: "Dreadnought laser beam",
  group: "factory", role: "projectile", frames: 16, cols: 4, rows: 4,
  frameWidth: 256, frameHeight: 256, fps: 24, anchor: "center", sequentialFrames: true,
  beamFrames: true, sourceDef: "imagegen-factory-dreadnought-laser-beam",
};
sheets["factory-couatl-momentum"] = {
  src: "/fx/factory-couatl-momentum.webp", label: "Couatl momentum heal",
  group: "factory", role: "affect", frames: 16, cols: 4, rows: 4,
  frameWidth: 256, frameHeight: 256, fps: 24, anchor: "center", coverage: 1.2,
  sequentialFrames: true, sourceDef: "imagegen-factory-couatl-momentum",
};
sheets["factory-bounty-hunter-mark"] = {
  src: "/fx/factory-bounty-hunter-mark.webp", label: "Bounty Hunter mark",
  group: "factory", role: "affect", frames: 16, cols: 4, rows: 4,
  frameWidth: 256, frameHeight: 256, fps: 24, anchor: "center", coverage: 1.15,
  sequentialFrames: true, sourceDef: "imagegen-factory-bounty-hunter-mark",
};
sheets["sea-dog-gunshot"] = {
  src: "/fx/sea-dog-gunshot-animated.webp", label: "Sea Dog animated gunshot",
  group: "ranged-attacks", role: "projectile", frames: 16, cols: 4, rows: 4,
  frameWidth: 362, frameHeight: 272, fps: 24, anchor: "center", sequentialFrames: true,
  sourceDef: "imagegen-sea-dog-gunshot-animated",
  projectilePhases: { launch: [0, 4], flight: [4, 8], impact: [12, 4], widthInCells: 0.95, impactWidthInCells: 1.2 },
};

const animatedAbilityAtlases: Record<string, [number, number, number, number]> = {
  // The dramatic sheets stay visible through the audible attack body. Long
  // reverberation tails may continue after the final sprite frame.
  "fear-aura-animated": [314, 314, 2, 10],
  "phoenix-scorch-animated": [314, 314, 1.5, 12],
  "energy-damage-delay-animated": [314, 314, 0.9, 10],
  "energy-feed-on-fire-animated": [314, 314, 1.5, 10],
  "magma-teleport-animated": [314, 314, 1.25, 24],
};
for (const [key, [frameWidth, frameHeight, scaleMultiplier, fps]] of Object.entries(animatedAbilityAtlases)) {
  sheets[key] = {
    src: `/fx/${key}.webp`, label: key.replaceAll("-", " "), group: "animated-abilities", role: "affect",
    frames: 16, cols: 4, rows: 4, frameWidth, frameHeight, fps,
    anchor: "center", sourceDef: `imagegen-${key}`, sequentialFrames: true, scaleMultiplier,
  };
}
const animatedLineAtlases: Record<string, [number, number, number]> = {
  "melee-bite-snap-animated": [296, 148, 32],
  "thunderbird-trident-zap-animated": [296, 148, 32],
  "bonus-extra-shot-animated": [384, 256, 32],
  "storm-link-animated": [362, 272, 12],
  "phoenix-flame-flow-animated": [418, 168, 32],
  "dragon-fire-breath-animated": [320, 160, 40],
  "dragon-fierce-breath-animated": [320, 160, 40],
  "dragon-small-breath-animated": [320, 160, 40],
  "faerie-rainbow-breath-animated": [320, 160, 40],
  "azure-ice-breath-animated": [496, 199, 32],
  "crystal-red-strike-animated": [496, 199, 32],
  "rust-acid-breath-animated": [542, 182, 32],
};
for (const [key, [frameWidth, frameHeight, fps]] of Object.entries(animatedLineAtlases)) {
  sheets[key] = {
    src: `/fx/${key}.webp`, label: key.replaceAll("-", " "), group: "animated-attacks", role: "projectile",
    frames: 16, cols: 4, rows: 4, frameWidth, frameHeight, fps,
    anchor: "center", sourceDef: `imagegen-${key}`, sequentialFrames: true,
  };
}
// One fire atlas serves the normal, fierce and compact geometry. Faerie Dragon
// uses the same frame silhouettes recolored from an image-generated rainbow edit.
for (const key of ["dragon-fire-breath-animated", "dragon-fierce-breath-animated", "dragon-small-breath-animated", "faerie-rainbow-breath-animated"]) {
  sheets[key].src = key === "faerie-rainbow-breath-animated"
    ? "/fx/faerie-rainbow-breath-32f.webp"
    : "/fx/dragon-fire-breath-32f.webp";
  sheets[key].frames = 32;
  sheets[key].rows = 8;
}
sheets["dragon-fierce-breath-animated"].sourceDef = "imagegen-dragon-fire-breath-shared";
// scripts/build-breath-fx.mjs interpolates the 16 phoenix keys to 32 frames;
// 64fps keeps the original half-second breath.
Object.assign(sheets["phoenix-flame-flow-animated"], { frames: 32, rows: 8, fps: 64 });
sheets["bonus-extra-shot-animated"].beamFrames = true;

// Original compact commander atlases. They use 256px cells so the two new
// WebP files stay materially smaller than the generator outputs.
for (const [name, label, widthInCells, impactWidthInCells] of [
  ["commander-holy-hammer", "Commander holy hammer shot", 0.9, 1.45],
  ["commander-spirit-blade", "Commander spirit blade shot", 1.05, 1.35],
] as const) {
  sheets[`${name}-shot-phases`] = {
    src: `/fx/${name}-shot-phases-alpha.webp`, label,
    group: "ranged-attacks", role: "projectile",
    frames: 16, cols: 4, rows: 4, frameWidth: 256, frameHeight: 256,
    fps: 24, anchor: "center", sequentialFrames: true,
    sourceDef: `imagegen-${name}-shot-phases`,
    projectilePhases: {
      launch: [0, 4], flight: [4, 8], impact: [12, 4],
      widthInCells, impactWidthInCells,
    },
  };
}

// Kud's launcher and Akagi's carrier strike share this original right-facing
// rocket atlas. The standard projectile stage mirrors it from live geometry.
sheets["anime-rocket-shot-phases"] = {
  src: "/fx/anime-rocket-shot-phases.webp", label: "Anime rocket shot", group: "ranged-attacks", role: "projectile",
  frames: 16, cols: 4, rows: 4, frameWidth: 314, frameHeight: 314,
  fps: 24, anchor: "center", sequentialFrames: true,
  sourceDef: "imagegen-anime-rocket-shot-phases",
  projectilePhases: {
    launch: [0, 4], flight: [4, 8], impact: [12, 4],
    widthInCells: 0.85, impactWidthInCells: 1.35,
  },
};

for (const [key, src, label, widthInCells, impactWidthInCells] of [
  ["little-busters-warning-shot-phases", "/fx/little-busters-warning-shot.webp", "Flying Japanese warning slips", 0.78, 1.3],
  ["komari-heart-shot-phases", "/fx/komari-heart-shot.webp", "Komari heart strike", 0.7, 1.35],
] as const) {
  sheets[key] = {
    src, label, group: "ranged-attacks", role: "projectile",
    frames: 16, cols: 4, rows: 4, frameWidth: 192, frameHeight: 192,
    fps: 24, anchor: "center", sequentialFrames: true,
    sourceDef: `imagegen-${key}`,
    projectilePhases: {
      launch: [0, 4], flight: [4, 8], impact: [12, 4],
      widthInCells, impactWidthInCells,
    },
  };
}

// The same tumbling stone needs a substantially larger silhouette for Cyclopes.
sheets["boulder-shot-phases"] = {
  ...sheets["stone-shot-phases"], label: "Boulder phased shot",
  projectilePhases: { ...sheets["stone-shot-phases"].projectilePhases!, widthInCells: 0.85, impactWidthInCells: 1.2 },
};

// Liches need a heavier, more readable cloud than other death-cloud users.
sheets["lich-death-cloud-shot-phases"] = {
  ...sheets["death-cloud-shot-phases"], label: "Large Lich death-cloud shot",
  projectilePhases: {
    ...sheets["death-cloud-shot-phases"].projectilePhases!,
    widthInCells: 1.15,
    impactWidthInCells: 1.7,
  },
};

// Forge Cyberbrutes: the Behemoth's claw rake, scaled up for the cyber
// Ancient Behemoth (rendered by the same claw-swipe path, 3 rakes).
sheets["cyberbrute-claw-rake-animated"] = {
  ...sheets["melee-claw-rake-animated"],
  label: "Cyberbrute giant claw marks",
  scaleMultiplier: 1.4,
};

// Zeestral's Storm Circuit: the Chain Lightning bolt + crackle, THICKER — the
// same H3 sheets drawn larger — and a wider Titan lightning shot that carries
// the bolt from Zeestral's side to each struck unit.
sheets["storm-circuit-bolt"] = {
  ...sheets["lightning-bolt"],
  label: "Storm Circuit thick lightning bolt",
  scaleMultiplier: 1.7,
};
sheets["storm-circuit-crackle"] = {
  ...sheets["lightning-crackle"],
  label: "Storm Circuit thick lightning crackle",
  scaleMultiplier: 1.6,
};
sheets["storm-circuit-shot-phases"] = {
  ...sheets["titan-shot-phases"],
  label: "Storm Circuit thick lightning shot",
  projectilePhases: {
    ...sheets["titan-shot-phases"].projectilePhases!,
    widthInCells: 1.4,
    impactWidthInCells: 1.85,
  },
};

export function getFxSheet(key: string): FxSheet | undefined {
  return sheets[key];
}

export function listFxSheets(): Record<string, FxSheet> {
  return sheets;
}

/**
 * How a spell looks and sounds on the table. `affect` sprites play over the
 * target unit (in order, each entry delayed by `delayMs`); `projectile`
 * travels from the caster's seat to the target before `hit` explodes there.
 * `tint` washes the target's card (bloodlust has no sprite in the original
 * game either - the engine tinted the creature red).
 */
export type SpellFxPlan = {
  projectile?: string;
  /** Number of visual rounds in one rapid-fire attack (game damage is unchanged). */
  projectileCount?: number;
  /** Delay between visual rounds in a rapid-fire attack. */
  projectileIntervalMs?: number;
  hit?: string;
  affect?: { key: string; delayMs?: number }[];
  /** Render affect/hit art clipped across the complete battlefield frame. */
  battlefield?: boolean;
  /**
   * An untargeted cast whose affect sprite plays at once over EVERY unit the
   * cast damaged (the Death Ripple spell washing over each struck creature, as
   * in H3), instead of one centre-stage burst.
   */
  affectStruckUnits?: boolean;
  /** Stretch the authored frame sequence to this exact presentation length. */
  playbackMs?: number;
  /** Cap the blocking presentation gate while a longer sound tail continues. */
  presentationMs?: number;
  tint?: "bloodlust";
  /** /public/sounds manifest key, e.g. "spells/fireball". */
  sound?: string;
  hitSound?: string;
  /**
   * When the represented result should become visible after this plan starts.
   * Most effects resolve after their complete presentation. Regeneration heals
   * at SP12_'s bright midpoint while its closing frames and sound tail fade.
   */
  resultAtMs?: number;
  /**
   * Physical launcher whose in-play card this projectile leaves from (and, for
   * the ballistic machines, recoils).
   */
  warMachine?: "ballista" | "catapult" | "cannon" | "lightning_generator";
};

// SP12_ reaches its full, readable orb on frame 10 of 20 at 15 fps. The heal
// number and health bar land here; the remaining frames close the circle while
// REGENER.wav finishes underneath them.
function stormCircuitFlashPlan(): SpellFxPlan {
  return {
    affect: [{ key: "storm-circuit-bolt" }, { key: "storm-circuit-crackle", delayMs: 220 }],
    sound: "spells/chain-lightning",
  };
}

/** Zeestral's damage sides: a thick bolt flies from his seat to each struck unit. */
const stormCircuitBoltPlan: SpellFxPlan = {
  projectile: "storm-circuit-shot-phases",
  hit: "storm-circuit-bolt",
  sound: "spells/chain-lightning",
  hitSound: "spells/lightning-bolt",
};

const regenerationFxPlan: SpellFxPlan = {
  affect: [{ key: "regeneration" }],
  sound: "effects/regeneration",
  resultAtMs: Math.round((10 / 15) * 1000),
};

export const spellFxPlans: Record<string, SpellFxPlan> = {
  "commander.ibuki.executive": { affect: [{ key: "counterstrike" }], sound: "blue-archive/voices/ibuki/executive-order" },
  "spell.magic_arrow": {
    // projectile-0 is the horizontal arrow; the stage rotates it in flight.
    projectile: "magic-arrow-projectile-0",
    hit: "magic-arrow-hit",
    sound: "spells/magic-arrow"
  },
  "spell.lightning_bolt": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/lightning-bolt"
  },
  "spell.fireball": {
    hit: "fireball",
    sound: "spells/fireball",
    hitSound: "spells/fireball-hit"
  },
  "spell.stone_skin": {
    affect: [{ key: "stone-skin" }],
    sound: "spells/stone-skin"
  },
  "spell.bloodlust": {
    tint: "bloodlust",
    sound: "spells/bloodlust"
  },
  "spell.cure": {
    affect: [{ key: "cure" }],
    sound: "spells/cure"
  },
  "commander.factory.repair": {
    affect: [{ key: "ctv-field-repair" }],
    sound: "spells/repair"
  },
  "commander.lion-slash": {
    affect: [{ key: "arch-devil-hellfire-slash" }],
    sound: "units/arch-devil-attack"
  },
  "spell.fortune": {
    affect: [{ key: "fortune" }],
    sound: "spells/fortune"
  },
  "spell.bless": { affect: [{ key: "bless" }], sound: "spells/bless" },
  "spell.prayer": { affect: [{ key: "prayer" }], sound: "spells/prayer" },
  "spell.haste": { affect: [{ key: "haste" }], sound: "spells/haste" },
  "spell.slow": { affect: [{ key: "slow" }], sound: "spells/slow" },
  "spell.precision": { affect: [{ key: "precision" }], sound: "spells/precision" },
  "spell.curse": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "spell.dispel": { affect: [{ key: "dispel" }], sound: "spells/dispel" },
  // Chain Lightning forks lightning from the first struck unit (reuses the
  // bolt + crackle pair, like Lightning Bolt). Inferno's plan is defined below.
  "spell.chain_lightning": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/chain-lightning"
  },
  "spell.death_ripple": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple", affectStruckUnits: true },
  // Blind drops the paralyze sprite on the target with the Blind cast cue — both
  // the paralyze sheet and blind.mp3 were converted but had never been wired.
  "spell.blind": { affect: [{ key: "paralyze" }], sound: "spells/blind" },
  // Berserk: the H3 berserk glyph flares over the unit it seizes, with the cast
  // roar — both the converted sheet and berserk.mp3 had never been wired.
  "spell.berserk": { affect: [{ key: "berserk" }], sound: "spells/berserk" },
  // Teleport has no converted sprite sheet — the unit blinking to its new space
  // (its card-glide) is the visual. The cast carries the H3 teleport sound on the
  // chosen unit; queueBoardFx plays a sound-only plan over the target.
  "spell.teleport": { sound: "spells/teleport" },
  // Clone has no converted sprite sheet — the new Clone Token appearing on the
  // board (its entrance pop) is the visual. The H3 clone cast cue plays on the
  // cloned unit at SPELL_CAST_RESOLVED (a unit target); the follow-up choice then
  // drops the token. queueBoardFx plays this sound-only plan over the target.
  "spell.clone": { sound: "spells/clone" },
  // Combat buffs / debuffs / reactions: each has its converted sheet and sound.
  // The ones cast on a chosen unit (Weakness, Anti-Magic, Fire Shield,
  // Counterstrike, Forgetfulness) shimmer over that unit; the player-scoped or
  // reaction ones (Mirth, Sorrow, Slayer, Magic Mirror) resolve with no single
  // unit to anchor on, so their cast sound carries the cue (see page.tsx).
  "spell.weakness": { affect: [{ key: "weakness" }], sound: "spells/weakness" },
  "spell.anti_magic": { affect: [{ key: "anti-magic" }], sound: "spells/anti-magic" },
  "spell.fire_shield": { affect: [{ key: "fire-shield" }], sound: "spells/fire-shield" },
  "spell.counterstrike": { affect: [{ key: "counterstrike" }], sound: "spells/counterstrike" },
  "spell.forgetfulness": { affect: [{ key: "forgetfulness" }], sound: "spells/forgetfulness" },
  "spell.mirth": { affect: [{ key: "mirth" }], sound: "spells/mirth" },
  "spell.sorrow": { affect: [{ key: "sorrow" }], sound: "spells/sorrow" },
  "spell.slayer": { affect: [{ key: "slayer" }], sound: "spells/slayer" },
  "spell.magic_mirror": { affect: [{ key: "magic-mirror" }], sound: "spells/magic-mirror" },
  // Misfortune: a hex shimmers over the attacker whose Attack die it negates,
  // with the H3 misfortune cast cue (its converted sheet + sound were already on
  // disk). Played as an instant on the declared attack, like Weakness.
  "spell.misfortune": { affect: [{ key: "misfortune" }], sound: "spells/misfortune" },
  // Shield / Air Shield: a warding shimmer over the buffed unit with the H3 cast
  // cue (their sprite sheets + sounds were converted but never wired).
  "spell.shield": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "spell.air_shield": { affect: [{ key: "air-shield" }], sound: "spells/air-shield" },
  // Protection from Air/Earth/Fire/Water: these resolve by cancelling the enemy
  // Spell, so their sprite + sound play off the SPELL_CAST_CANCELLED cue (keyed
  // by the cancelling card in page.tsx) rather than a SPELL_CAST_RESOLVED.
  "spell.protection_from_air": { affect: [{ key: "protect-air" }], sound: "spells/protect-air" },
  "spell.protection_from_earth": { affect: [{ key: "protect-earth" }], sound: "spells/protect-earth" },
  "spell.protection_from_fire": { affect: [{ key: "protect-fire" }], sound: "spells/protect-fire" },
  "spell.protection_from_water": { affect: [{ key: "protect-water" }], sound: "spells/protect-water" },
  // Map spells resolve on the adventure map (no battle board to anchor sprites
  // on), so only a cast sound is wired; page.tsx plays it off the CARD_PLAYED
  // cue for map-timed cards. Town Portal and Dimension Door share the H3
  // teleport cue; Fly / Water Walk / Visions have their own clips.
  "spell.town_portal": { sound: "spells/teleport" },
  "spell.dimension_door": { sound: "spells/teleport" },
  "spell.fly": { sound: "spells/fly" },
  "spell.water_walk": { sound: "spells/water-walk" },
  "spell.visions": { sound: "spells/visions" },
  // Summon Elemental: resolves on an empty space (no unit to anchor a sprite
  // on), so only a cast sound is wired — the new unit appearing is the visual.
  // Air has its own H3 summon clip; the others use the element's own voice.
  "spell.summon_air_elemental": { sound: "spells/air-elemental" },
  "spell.summon_earth_elemental": { sound: "units/earth-elemental-attack" },
  "spell.summon_fire_elemental": { sound: "units/fire-elemental-attack" },
  "spell.summon_water_elemental": { sound: "units/water-elemental-attack" },
  // Inferno: the dice (rolled out first under the cast roar, see SPELL_DICE_ROLLED)
  // settle, then this fire sheet erupts over the chosen space with the fire-storm
  // impact before the per-unit damage floats. `sound` rides under the dice; the
  // `hit` burst + `hitSound` land on the space once the roll has read out.
  "spell.inferno": { hit: "inferno", sound: "spells/inferno", hitSound: "effects/fire-storm" },
  // Frost Ring: select a space — the ring of frost bursts over that cell (the
  // space-target path in page.tsx anchors it to the cell, like Inferno) and the
  // adjacent units' damage floats after. No dice, so the impact sound rides on
  // the burst itself.
  "spell.frost_ring": { hit: "frost-ring", sound: "spells/frost-ring", hitSound: "spells/frost-ring" },
  "spell.meteor_shower": { hit: "meteor-shower", sound: "spells/meteor-shower", hitSound: "spells/meteor-shower" },
  // Implosion: the converted implosion sheet caves in over the struck enemy with
  // the H3 cast roar; the damage number is held behind it (it had been resolving
  // silently). Anchored on the target unit by the SPELL_CAST_RESOLVED path.
  "spell.implosion": { affect: [{ key: "implosion" }], sound: "spells/implosion" },
  // Disrupting Ray: the H3 projectile flies caster→target, then the ray sheet
  // shimmers over the unit whose Defense it strips (same two-def pair as PC).
  "spell.disrupting_ray": {
    projectile: "disrupting-ray-projectile",
    affect: [{ key: "disrupting-ray" }],
    sound: "spells/disrupting-ray"
  },
  // Frenzy: an Instant on your own attack (no board target of its own), so its
  // glyph flares at centre stage over the played card with the cast cue — the
  // same CARD_PLAYED path as Weakness / Slayer.
  "spell.frenzy": { affect: [{ key: "frenzy" }], sound: "spells/frenzy" },
  // Sacrifice shares the H3 Resurrection/Animate Dead sheet (C01SPE0 — same
  // def as Resurrection in the converted library) over the healed unit, with
  // its own sacrifice cast cue.
  "spell.sacrifice": { affect: [{ key: "resurrection" }], sound: "spells/sacrifice" },
  // Resurrection spell cast (lethal-save reaction): the real Resurrection
  // sheet + cast cue. The killing-blow cancel also fires the ability-id
  // "resurrection" plan below (same sheet) when the blow is actually stopped.
  "spell.resurrection": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  // Animate Dead: same H3 resurrection/reanimation sheet (C01SPE0), with the
  // Animate Dead cast sound. Also what the Soul Eater commander cast reuses.
  "spell.animate_dead": { affect: [{ key: "resurrection" }], sound: "spells/animate-dead" },
  // Earthquake: a siege-only blast with no single unit to anchor on, so it
  // carries just the H3 earthquake rumble (Walls coming down animate off
  // FORTIFICATION_DESTROYED). Plays at centre stage off SPELL_CAST_RESOLVED.
  "spell.earthquake": { sound: "spells/earthquake" },
  // Remove Obstacle: an Instant cast that opens the obstacle-removal choice; the
  // H3 remove-obstacle cue plays as it is cast, and each cleared marker chimes
  // again off COMBAT_OBSTACLE_REMOVED (Walls/Gate off FORTIFICATION_DESTROYED).
  "spell.remove_obstacle": { sound: "spells/remove-obstacle" },
  // View Air / View Earth: map-board economy spells (gain resources / capture a
  // Mine) with no battle board, so they carry only the H3 view cast cue, played
  // off the CARD_PLAYED cue like the other map spells.
  "spell.view_air": { sound: "spells/view" },
  "spell.view_earth": { sound: "spells/view" },
  // Hero-specialty area blasts resolve through a card PLAY (CARD_PLAYED), which
  // anchors their `affect` sprite at centre stage with the cast sound. Xyron's
  // Inferno roars with the fire sheet; Deemer's Meteor Shower I/VI rain rock.
  "specialty.xyron.1": { affect: [{ key: "inferno" }], sound: "spells/inferno" },
  "specialty.xyron.4": { affect: [{ key: "inferno" }], sound: "spells/inferno" },
  "specialty.xyron.6": { affect: [{ key: "inferno" }], sound: "spells/inferno" },
  "specialty.deemer.1": { affect: [{ key: "meteor-shower" }], sound: "spells/meteor-shower" },
  "specialty.deemer.6": { affect: [{ key: "meteor-shower" }], sound: "spells/meteor-shower" },
  // Kud's Deemer-derived damage faces keep the same real area-damage engine,
  // but present as her Rocket Launcher: a board-filling flame burst with the
  // supplied BAZOOKA.oggpak explosion. IV is utility/Power, so it does not fake
  // a launcher shot.
  "specialty.kudryavka_noumi.1": {
    projectile: "anime-rocket-shot-phases", hit: "inferno",
    sound: "doom/dsrlaunc", hitSound: "custom-ability/kud-impact"
  },
  "specialty.kudryavka_noumi.6": {
    projectile: "anime-rocket-shot-phases", hit: "inferno",
    sound: "doom/dsrlaunc", hitSound: "custom-ability/kud-impact"
  },
  "specialty.alice.1": { affect: [{ key: "fear" }], sound: "effects/fear" },
  // Septienna's Death Ripple sweep (every level's damage side), Melodia's Fortune
  // luck wash and Glacius's Frost Ring (I/VI area damage) all resolve through a
  // card PLAY with no single board target, so their sprite bursts at centre stage
  // with the cast sound — exactly like Xyron/Deemer. Glacius IV is a card-economy
  // instant that casts no ring, so it gets no FX. The "+N Power" side of these
  // CHOOSE_ONE cards plays no board effect, so the CARD_PLAYED handler skips its
  // sprite (it guards every "+N Power" optionLabel).
  "specialty.septienna.1": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  "specialty.septienna.4": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  "specialty.septienna.6": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  // Miku Voice of Angel — I slows the army (slow sheet), IV is ongoing heal
  // (cure/regeneration fire from DAMAGE_HEALED triggers), VI song-burst damage.
  "specialty.miku.1": { affect: [{ key: "slow" }], sound: "spells/slow" },
  "specialty.miku.4": { affect: [{ key: "cure" }], sound: "spells/prayer" },
  "specialty.miku.6": { affect: [{ key: "mirth" }, { key: "prayer", delayMs: 180 }], sound: "spells/mirth" },
  // Enterprise's Lucky E is a die-control specialty with no board target. Its
  // original Japanese Skill Activation line plays off the CARD_PLAYED cue —
  // page.tsx plays spellFxPlans[event.cardId].sound for any non-"+N Power"
  // play. BOTH spend paths emit that CARD_PLAYED for specialty.enterprise.<lvl>
  // and so voice: the proactive stat half (a plain reaction play) AND the
  // held die-window half (reroll / set-die), which emits CARD_PLAYED from
  // rerollPendingChoice in reducer.ts (optionLabel "Reroll a die" / "Set a die
  // to the +1 side" — neither is a Power-boost, so the FX loop never skips it).
  // The die-window voice seam is pinned in kansen-abilities.test.ts.
  "specialty.enterprise.1": { sound: "azur-lane/voices/enterprise/ability" },
  "specialty.enterprise.4": { sound: "azur-lane/voices/enterprise/ability" },
  "specialty.enterprise.6": { sound: "azur-lane/voices/enterprise/ability" },
  // Zeestral's Storm Circuit: every play — damage, ranged buff, draw —
  // flashes the THICK chain-lightning bolt + crackle with the Chain Lightning
  // cast (over the buffed unit, or centre stage over the card for a draw).
  // The damage sides present per struck unit via cardSpellFxPlans instead.
  "specialty.zeestral.1": stormCircuitFlashPlan(),
  "specialty.zeestral.4": stormCircuitFlashPlan(),
  "specialty.zeestral.6": stormCircuitFlashPlan(),
  // Storm Engineer's Arc Discharge: repeated lightning strikes on the target
  // (chain-lightning style, three bolts) under the Titan's ranged-shot report.
  "commander.forge.arc-discharge": {
    affect: [
      { key: "lightning-bolt" },
      { key: "lightning-crackle", delayMs: 200 },
      { key: "lightning-bolt", delayMs: 380 },
      { key: "lightning-sparks", delayMs: 520 },
      { key: "lightning-bolt", delayMs: 760 },
      { key: "lightning-crackle", delayMs: 900 },
    ],
    sound: "units/titan-shoot",
  },
  "specialty.melodia.1": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "specialty.melodia.4": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "specialty.melodia.6": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "specialty.glacius.1": { affect: [{ key: "frost-ring" }], sound: "spells/frost-ring" },
  "specialty.glacius.6": { affect: [{ key: "frost-ring" }], sound: "spells/frost-ring" },
  // Ash's Bloodlust has no sprite in the original game (the engine tinted the unit
  // red). On a card play there is no board unit to tint, so the CARD_PLAYED handler
  // flashes the red battle-rage wash at centre stage with the bloodlust cast roar.
  "specialty.ash.1": { tint: "bloodlust", sound: "spells/bloodlust" },
  "specialty.ash.4": { tint: "bloodlust", sound: "spells/bloodlust" },
  "specialty.ash.6": { tint: "bloodlust", sound: "spells/bloodlust" }
};

/** Played at center stage when a spell is countered. */
export const cancelFx = { key: "dispel", sound: "spells/dispel" };

/** Unit abilities that have a matching original effect. */
const blueArchiveAbilityVoiceSources: readonly (readonly [string, readonly string[]])[] = [
  ["mika", ["kivotos-piercing-judgment", "kivotos-kyrie-eleison"]],
  ["seia", ["kivotos-prophetic-dream", "kivotos-future-sight"]],
  ["nagisa", ["kivotos-tea-party-order", "kivotos-royal-artillery"]],
  ["aris", ["kivotos-railgun-charge", "kivotos-hero-mode"]],
  ["kei", ["kivotos-system-intrusion", "kivotos-key-authority"]],
  ["hoshino", ["kivotos-iron-horus", "kivotos-abyssal-shield"]],
  ["shiroko", ["kivotos-cycle-scout", "kivotos-drone-support"]],
  ["hina", ["kivotos-prefect-barrage", "kivotos-end-of-vacation"]],
  ["yuuka", ["kivotos-calculated-cover", "kivotos-perfect-balance"]],
  ["aru", ["kivotos-outlaw-shot", "kivotos-hardboiled-boss"]],
  ["neru", ["kivotos-cleaner-rush", "kivotos-cqc-overdrive"]],
  ["toki", ["kivotos-abi-eshuh", "kivotos-mode-change"]],
  ["azusa", ["kivotos-silent-faith", "kivotos-sagitta-mortis"]],
  ["wakamo", ["kivotos-foxfire-mark", "kivotos-crimson-calamity"]],
  ["saori", ["kivotos-arius-ambush", "kivotos-vanitas"]],
  ["iori", ["kivotos-prefect-snipe", "kivotos-rapid-reposition"]],
  ["mutsuki", ["kivotos-trick-mine", "kivotos-explosive-prank"]],
  ["miyo", ["kivotos-survey-route", "kivotos-cartographers-plan"]],
  ["hasumi", ["kivotos-eagle-eye", "kivotos-winged-pursuit"]]
];
const blueArchiveAbilityVoicePlans: Record<string, SpellFxPlan> = Object.fromEntries(
  blueArchiveAbilityVoiceSources.flatMap(([slug, ids]) => ids.map((id) => [id, { sound: `blue-archive/voices/${slug}/ability` }]))
);
const neutralTownAbilityFxPlans: Record<string, SpellFxPlan> = Object.fromEntries([
  ...["consecrated-shot","moonlit-aid","stolen-spark","blood-tribute","marsh-scavenger"].map(id => [`ntv-${id}`, { affect: [{ key: "cure" }], sound: "spells/cure" }]),
  ...["guardian-angel","cowards-luck"].map(id => [`ntv-${id}`, { affect: [{ key: "resurrection" }], sound: "spells/resurrection" }]),
  ...["putrid-grasp","suppressing-shot","venom-arrow","ageing-breath","disorienting-landing"].map(id => [`ntv-${id}`, { affect: [{ key: "slow" }], sound: "spells/slow" }]),
  ...["petrifying-aim","heavy-gaze"].map(id => [`ntv-${id}`, { affect: [{ key: "paralyze" }], sound: "spells/paralyze" }]),
  ...["scattering-flame","chain-lightning","spell-channel"].map(id => [`ntv-${id}`, { affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }], sound: "spells/lightning-bolt" }]),
  ...["potent-venom","toxic-counter"].map(id => [`ntv-${id}`, { affect: [{ key: "poison" }], sound: "spells/poison" }]),
  ...["winged-riposte","skirmisher-step","ethereal-escape","strike-and-return","flowing-assault","infernal-command"].map(id => [`ntv-${id}`, { affect: [{ key: "teleport" }], sound: "spells/teleport" }]),
] as Array<[string, SpellFxPlan]>);

export const abilityFxPlans: Record<string, SpellFxPlan> = {
  "ctv-mountain-break": { affect: [{ key: "ctv-break-cover" }], sound: "custom-veterancy/break-cover" },
  "ctv-mountain-break-heal": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "ntv-mountain-stillness": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "ntv-core-suppression": { affect: [{ key: "slow" }, { key: "curse", delayMs: 120 }], sound: "spells/slow" },
  "ntv-victory-command": { tint: "bloodlust", sound: "spells/bloodlust" },
  "ntv-victory-command-move": { affect: [{ key: "teleport" }], sound: "spells/teleport" },
  "veteran-phoenix-rising-nest": { affect: [{ key: "phoenix-scorch-animated" }], sound: "custom-ability/fire-impact" },
  "veteran-phoenix-rising-nest-return": { tint: "bloodlust" },
  ...Object.fromEntries(customVeterancyFxKeys.map(key => [`ctv-${key}`, { affect: [{ key: `ctv-${key}` }], sound: `custom-veterancy/${key}` }])),
  "ntv-marked-volley": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  "ntv-stone-landing": { affect: [{ key: "stone-skin" }], sound: "spells/stone-skin" },
  "ntv-bewitching-bolt": { affect: [{ key: "dispel" }], sound: "spells/dispel" },
  "ntv-disrupting-gaze": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "ntv-searing-passage": { affect: [{ key: "fire-shield" }], sound: "spells/fire-wall" },
  "ntv-death-cloud": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  "ntv-boulder-crash": { affect: [{ key: "magic-arrow-hit" }], sound: "spells/magic-arrow" },
  "ntv-summoned-torment": { tint: "bloodlust", sound: "spells/bloodlust" },
  "ntv-scaled-intercept": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "ntv-predators-mark": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "ntv-mana-turbulence": { affect: [{ key: "dispel" }], sound: "spells/dispel" },
  "ntv-return-fire": { affect: [{ key: "counterstrike" }], sound: "spells/counterstrike" },
  "ntv-lucky-ricochet": { affect: [{ key: "magic-arrow-hit" }], sound: "spells/magic-arrow" },
  "ntv-labyrinth-cleave": { affect: [{ key: "counterstrike" }], sound: "spells/counterstrike" },
  "ntv-bodyguard": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "ntv-hellish-endurance": { affect: [{ key: "stone-skin" }], sound: "spells/stone-skin" },
  "town-gremlin-recover": { affect: [{ key: "prayer" }], sound: "spells/prayer" },
  "town-magi-recover": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "town-devil-draw": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  "town-sorceress-ranged-mend": { affect: [{ key: "cure" }], sound: "spells/cure" },
  // Shared veterancy rewards used by the custom-town distributions. These
  // plans attach to the real UNIT_ABILITY_TRIGGERED events emitted by the
  // engine; passive arithmetic remains quiet until it changes an outcome.
  "veteran-soul-feast": { affect: [{ key: "cure" }], sound: "effects/drain-life" },
  "veteran-rebirth": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  "veteran-low-roll-insight": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "veteran-spell-sunder": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "veteran-magi-spell-sunder": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "veteran-elf-spell-sunder": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "veteran-zealot-spell-sunder": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "wog-no-negative-attack-roll": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "veteran-air-chain-lightning": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/chain-lightning",
  },
  "veteran-hell-steed-last-stand": {
    affect: [{ key: "resurrection" }, { key: "inferno", delayMs: 180 }],
    sound: "spells/fire-wall",
  },
  "town-gorgon-stare-reroll": { affect: [{ key: "death-stare" }], sound: "spells/death-stare" },
  "veteran-nightmare-death-stare-reroll": { affect: [{ key: "death-stare" }], sound: "spells/death-stare" },
  "veteran-arctic-harden": { affect: [{ key: "stone-skin" }], sound: "spells/stone-skin" },
  "veteran-arctic-slow-shot": { affect: [{ key: "slow" }], sound: "spells/slow" },
  "veteran-lava-burst": { hit: "fireball", sound: "spells/fireball", hitSound: "spells/fireball-hit" },
  "veteran-lava-burn": { affect: [{ key: "fire-shield" }], sound: "spells/fire-wall" },
  ...neutralTownAbilityFxPlans,
  "town-dragon-fly-landing": { affect: [{ key: "town-dragon-fly-venomous-landing" }], sound: "spells/poison" },
  "town-gnoll-gold": { affect: [{ key: "town-gnoll-gold-coin" }], sound: "ambient/warehouse-gold" },
  "town-hydra-forced-reroll-bite": { affect: [{ key: "hydra-multi-bite" }], sound: "units/hydra-attack" },
  "town-titan-storm-cache": { affect: [{ key: "lightning-bolt" }], sound: "spells/chain-lightning" },
  "town-nix-guarded": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "town-basilisk-lower-roll": { affect: [{ key: "fear" }], sound: "effects/fear" },
  "town-pit-demon-bond": { affect: [{ key: "frenzy" }], sound: "spells/frenzy" },
  "town-wyvern-reroll": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "town-haspid-aggressive-drill": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "town-haspid-toxic-hide": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "town-jotunn-rune-bolt": {
    projectile: "magic-arrow-projectile-0",
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "effects/rune"
  },
  "town-mammoth-rune-mend": { affect: [{ key: "cure" }], sound: "effects/rune" },
  "town-dwarf-backlash": { affect: [{ key: "town-dwarf-backlash" }], sound: "spells/magic-arrow" },
  "town-titan-bolt": { projectile: "titan-shot-phases", sound: "units/titan-shoot" },
  // Forge Scrap Feast (Cyberbrutes' kill-heal): the Regeneration orb over the
  // healed brute.
  "forge-cyberbrute-feast": { affect: [{ key: "regeneration" }], sound: "effects/regeneration" },
  "town-demon-paralyze": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "town-pit-mend": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "town-efreet-mend": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "town-naga-mend": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "town-dragon-snare": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "town-devil-slow": { affect: [{ key: "slow" }], sound: "spells/slow" },
  "town-devil-luck": { affect: [{ key: "misfortune" }], sound: "spells/misfortune" },
  "town-goblin-save": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  ...blueArchiveAbilityVoicePlans,
  "ranged-extra-shot-on-low-roll": {
    projectile: "bonus-extra-shot-animated"
  },
  // Mutsuki's mines use her own playful bomb silhouette before the damage
  // number lands. These override the voice-only defaults above.
  "kivotos-trick-mine": {
    affect: [{ key: "mutsuki-prank-bomb" }],
    sound: "blue-archive/voices/mutsuki/ability"
  },
  "kivotos-explosive-prank": {
    affect: [{ key: "mutsuki-prank-bomb" }],
    sound: "blue-archive/voices/mutsuki/ability"
  },
  // Ibuki's Sniper Shot flies its own bullet tracer and spark-burst impact
  // (sniper-shot-* sheets, built by scripts/build-sniper-shot-fx.mjs) — it used
  // to borrow the Magic Arrow flight/hit (USER REQUEST 2026-09-04).
  "commander-ibuki-sniper-shot": { projectile: "sniper-shot-projectile", hit: "sniper-shot-hit", sound: "blue-archive/voices/ibuki/sniper-shot" },
  "commander-ibuki-up-to-mischief": { affect: [{ key: "misfortune" }], sound: "blue-archive/voices/ibuki/up-to-mischief" },
  "commander-ibuki-gadabout": { affect: [{ key: "haste" }], sound: "blue-archive/voices/ibuki/gadabout" },
  "commander-ibuki-gadabout-landing-damage": { hit: "frost-ring", hitSound: "spells/frost-ring" },
  // Little Busters Kyousuke's AP skills reuse shipped spell sheets: the rally
  // is Bloodlust's battle-rage tint, the Defense/Initiative break is the
  // Disrupting Ray, and the huddle is the Visions cue (sound only).
  "commander-kyousuke-mission-start": { tint: "bloodlust", sound: "spells/bloodlust" },
  "commander-kyousuke-gutsy-play": { projectile: "disrupting-ray-projectile", affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  "commander-kyousuke-strategy-meeting": { sound: "spells/visions" },
  // MGQ Mage Job uses the original Magic Arrow flight, impact and sound.
  "mgq-mage-magic-arrow": {
    projectile: "magic-arrow-projectile-0",
    hit: "magic-arrow-hit",
    sound: "spells/magic-arrow"
  },
  // Fire Shield's burn: when an adjacent attacker strikes a shielded unit, the
  // engine fires a "fire-shield" ability event on the attacker (the unit that
  // takes the burn). The fire sheet flares over it with the dedicated
  // fire-shield-hit impact — distinct from the cast shimmer (spells/fire-shield)
  // that plays when the shield is first placed. Shared by the Fire Shield spell
  // and Rashka's Demoniac specialty (both raise the same FIRE_SHIELD effect).
  "fire-shield": { affect: [{ key: "fire-shield" }], sound: "effects/fire-shield-hit" },
  // WOG War Zealot's innate Magic Mirror: applyUnitMagicMirror fires a
  // UNIT_ABILITY_TRIGGERED("wog-war-zealot-mirror") the instant it reflects, so
  // the mirror glass flares over the Zealot with the same sprite + cue the Magic
  // Mirror spell plays — the free innate reflect is now seen AND heard, exactly
  // like the card. (The card-based Magic Mirror fires its own CARD_PLAYED cue, so
  // this never double-plays with it.)
  "wog-war-zealot-mirror": { affect: [{ key: "magic-mirror" }], sound: "spells/magic-mirror" },
  // WOG Dracolich's Necrotic Armor: when its "-1" armor die soaks an incoming
  // blow, the engine fires UNIT_ABILITY_TRIGGERED("wog-dracolich-armor"). The
  // spell-resistance (anti-magic) shimmer wards over the Dracolich; page.tsx pins
  // it to the blow it blocked and layers the unit's own DEFEND cry under it (its
  // per-unit voice, which a fixed library `sound` here could not express).
  "wog-dracolich-armor": { affect: [{ key: "anti-magic" }] },
  "magog-fireball-splash": { hit: "fireball", hitSound: "spells/fireball-hit" },
  "kansen-full-barrage": { hit: "akagi-full-barrage", hitSound: "spells/fireball-hit" },
  "lich-death-cloud": { hit: "death-cloud", hitSound: "spells/death-cloud" },
  // WOG Dracolich's spread attack (Necrotic Death Cloud) is the Lich's Death
  // Cloud by another name — a full second attack on a unit adjacent to the
  // target. It emits UNIT_ABILITY_TRIGGERED("wog-dracolich-death-cloud") just
  // like the Lich fires "lich-death-cloud", so it gets the SAME death-cloud burst
  // + sound (parity with the Lich; without this its spread landed silently).
  "wog-dracolich-death-cloud": { hit: "death-cloud", hitSound: "spells/death-cloud" },
  // Faerie Dragons' activation damage-spell flies as an Ice Bolt from the
  // dragon to the chosen unit, then explodes on the hit.
  "faerie-dragon-spell": {
    projectile: "ice-bolt-projectile-0",
    hit: "ice-bolt-hit",
    sound: "spells/ice-bolt",
    hitSound: "spells/ice-bolt-hit"
  },
  "veteran-ice-bolt": { projectile: "ice-bolt-projectile-0", hit: "ice-bolt-hit", sound: "spells/ice-bolt", hitSound: "spells/ice-bolt-hit" },
  "veteran-magic-splash": { hit: "death-cloud", hitSound: "spells/death-cloud" },
  "veteran-energy-drain": { affect: [{ key: "vampire-life-drain" }], sound: "effects/drain-life" },
  "veteran-energy-fire-heal": { affect: [{ key: "energy-feed-on-fire-animated" }], sound: "custom-ability/fire-impact" },
  "veteran-energy-delay": { affect: [{ key: "energy-damage-delay-animated" }], sound: "custom-ability/electric-impact" },
  "veteran-magic-dispel": { affect: [{ key: "dispel" }], sound: "spells/dispel" },
  "veteran-sprite-obstacle": { affect: [{ key: "stone-skin" }], sound: "spells/earthquake" },
  "veteran-magma-solidify": { affect: [{ key: "stone-skin" }], sound: "spells/stone-skin" },
  "veteran-sprite-spell-block": { affect: [{ key: "magic-mirror" }], sound: "spells/magic-mirror" },
  "veteran-arcane-echo": { hit: "death-cloud", hitSound: "spells/death-cloud" },
  "veteran-storm-link": { sound: "spells/lightning-bolt" },
  "veteran-storm-link-2": { sound: "custom-ability/electric-impact" },
  "veteran-phoenix-activation": { affect: [{ key: "phoenix-scorch-animated" }], sound: "custom-ability/fire-impact" },
  "veteran-phoenix-nest": { affect: [{ key: "phoenix-scorch-animated" }], sound: "custom-ability/fire-impact" },
  // Lethal-save sources (Alamar's specialty, the Resurrection spell and the
  // Archangels' once-per-combat cancel) all emit the "resurrection" ability
  // event when the killing blow is cancelled, so one plan covers all three.
  // MUST use the dedicated Resurrection sheet (C01SPE0) — never the Prayer
  // column (C10SPW), which is a different spell.
  resurrection: { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  // Phoenixes' Rebirth reuses the same Resurrection sheet when the killing blow
  // is shrugged off and the bird clings to life at 1 Health.
  "phoenix-rebirth": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  "commander-artifact-phoenix-plate": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  "commander-artifact-power-overflow": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/lightning-bolt"
  },
  "commander-artifact-thorn-aura": { affect: [{ key: "fire-shield" }], sound: "effects/fire-shield-hit" },
  "commander-artifact-plague-censer": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "commander-artifact-corrosion": { hit: "acid-breath", hitSound: "effects/acid-breath" },
  "commander-artifact-enfeeble": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "commander-artifact-slow": { affect: [{ key: "slow" }], sound: "spells/slow" },
  "commander-artifact-vampiric-fang": { affect: [{ key: "vampire-life-drain" }], sound: "effects/drain-life" },
  "commander-artifact-travelers-salve": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "commander-artifact-bastion-heart": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "commander-artifact-stormcleaver": { hit: "death-cloud", hitSound: "spells/death-cloud" },
  "commander-artifact-regenerators-mail": regenerationFxPlan,
  "commander-artifact-chalice-renewal": regenerationFxPlan,
  "commander-artifact-temporal-cuirass": { affect: [{ key: "energy-damage-delay-animated" }], sound: "custom-ability/electric-impact" },
  "commander-artifact-executioners-edge": { affect: [{ key: "meteor-shower" }], sound: "spells/meteor-shower" },
  "commander-artifact-eye-of-misfortune": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "commander-artifact-lanternroot-crook": { affect: [{ key: "resurrection" }], sound: "spells/air-elemental" },
  "commander-artifact-widows-courtesy": { hit: "magic-arrow-hit", hitSound: "spells/magic-arrow" },
  "commander-artifact-counterfeit-cataclysm": {
    affect: [{ key: "armageddon" }],
    sound: "spells/armageddon",
    battlefield: true,
    // Run the expensive full-board atlas as a compact burst. The authentic
    // Armageddon sound may finish its tail without blocking combat for 5.59s.
    playbackMs: 1600,
    presentationMs: 1800,
  },
  "lion-round-barrage": {
    affect: [{ key: "arch-devil-hellfire-slash" }],
    sound: "units/arch-devil-attack"
  },
  "factory-war-machine-switch": { sound: "units/automaton-move" },
  "commander-artifact-sealed-horizon": { affect: [{ key: "force-field" }], sound: "spells/force-field" },
  "commander-artifact-amulet-of-recoil": { affect: [{ key: "implosion" }], sound: "spells/implosion" },
  // Jotunn Warlord's start-of-activation Teleport: a sound-only plan, exactly
  // like the Teleport Spell (spell.teleport) — the relocated unit's card-glide
  // (UNIT_MOVED) is the visual, and this carries the same H3 teleport sound,
  // emitted on the UNIT_ABILITY_TRIGGERED event in resolveTeleportChoice.
  "bulwark-jotunn-teleport": { sound: "spells/teleport" },
  // Printed unit abilities wired with their original H3 effect + sound.
  "wyvern-sting": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "rust-dragon-acid": { hit: "acid-breath", hitSound: "effects/acid-breath" },
  "gorgon-death-stare": { affect: [{ key: "death-stare" }], sound: "spells/death-stare" },
  // Fortress Gorgons (Pack) carry the SAME Death Stare under their own ability id
  // (the engine emits `followUp.abilityId`), so the faction Pack needs its own
  // plan or its stare lands silently while the neutral guard's animates. Parity
  // with the neutral `gorgon-death-stare` above.
  "fortress-gorgon-death-stare": { affect: [{ key: "death-stare" }], sound: "spells/death-stare" },
  // Paralysis / Stone Gaze / Paralyzing Gaze: the H3 "paralyze" freeze glyph +
  // paralyze sound flash over the unit that gains the Paralysis token (the same
  // sheet the Blind spell uses). Every id below is emitted ONLY when the token
  // actually lands — own-die variants (Azure Dragon, Fortress Basilisk, the
  // commander's Fearsome) fire once on a matching attack face; automatic
  // retaliation gazes (Medusa Pack/Neutral, Unicorn) fire on the land event;
  // extra-die variants (neutral Basilisk Stone Gaze, Medusa Few die gaze, the
  // commander's Paralyzing Touch) use the Death-Stare id split in reducer.ts
  // (bare id on land, `${id}-roll` on a miss — left unmapped below). The
  // Stacked Medusa Stores bank guard fires on its melee attack.
  "azure-dragon-paralysis": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "veteran-azure-fear-aura": { sound: "custom-ability/fear-aura" },
  "veteran-dracolich-fear-aura": { sound: "custom-ability/fear-aura" },
  "veteran-fear-aura": { sound: "custom-ability/fear-aura" },
  "veteran-crystal-burst": { projectile: "magic-arrow-projectile-0", hit: "magic-arrow-hit", sound: "spells/magic-arrow", hitSound: "spells/lightning-bolt" },
  "veteran-adjacent-pulse": { hit: "fireball", sound: "spells/fireball-hit" },
  "veteran-cyber-splash": { hit: "fireball", sound: "spells/fireball-hit" },
  "veteran-blind-dust": { affect: [{ key: "neutral-sandstorm" }], sound: "spells/slow" },
  "veteran-sandstorm": { affect: [{ key: "neutral-sandstorm" }], sound: "spells/earthquake" },
  "veteran-thunder-retaliation": { affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }], sound: "spells/lightning-bolt" },
  "veteran-troll-snare": { affect: [{ key: "slow" }], sound: "spells/slow" },
  "veteran-pain-resistance": { affect: [{ key: "anti-magic" }], sound: "spells/magic-mirror" },
  "veteran-adjacent-enfeeble": { affect: [{ key: "weakness" }], sound: "spells/weakness" },
  "veteran-unicorn-enfeeble": { affect: [{ key: "weakness" }], sound: "spells/weakness" },
  "veteran-azure-super-charge-paralysis": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "veteran-azure-mending-scales": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "veteran-dragon-mark": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "veteran-manticore-mend": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "veteran-manticore-revenge": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "veteran-medusa-mend": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "veteran-skeleton-rebirth": { affect: [{ key: "resurrection" }], sound: "spells/animate-dead" },
  "veteran-wraith-escape": { affect: [{ key: "resurrection" }], sound: "spells/teleport" },
  "veteran-wraith-magic": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "veteran-zombie-intercept": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "veteran-vampire-tribute": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  "veteran-vampire-ward": { affect: [{ key: "anti-magic" }], sound: "effects/magic-resist" },
  "veteran-dragon-dread": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  "veteran-lich-mend": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "veteran-dragon-feast": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "veteran-troglodyte-rebirth": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  "fortress-basilisk-paralysis": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "basilisk-paralysis": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "medusa-paralyze-retaliation": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "medusa-paralyze-retaliation-die": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "unicorn-paralyze-retaliation": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "bank-medusa-paralyze-stacked": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "commander-fearsome": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "commander-paralyze": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  // A unit that shrugs off Paralysis (ignore-paralysis / Soul Eater undead…)
  // wards with the same anti-magic shimmer the resistance roll uses.
  "ignore-paralysis": { affect: [{ key: "anti-magic" }], sound: "effects/magic-resist" },
  "dread-knight-death-blow": { affect: [{ key: "death-ripple" }], sound: "effects/death-blow" },
  // Fortress Wyverns' poison cubes: the poison cloud both when the cubes are
  // planted (on the attack) and when one bleeds the unit at its activation.
  "wyvern-poison-cube-few": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "wyvern-poison-cube-pack": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "wyvern-poison-cube": { affect: [{ key: "poison" }], sound: "spells/poison" },
  // Rampart Dendroids' Bind: roots lash out as the Dendroid attacks.
  "dendroid-bind": { affect: [{ key: "bind" }], sound: "effects/bind" },
  // Rampart Dwarves' Magic Resistance: a warding shimmer when a Spell/Specialty
  // is rolled against (the "magic resist" cue from the original game).
  "dwarf-magic-resistance": { affect: [{ key: "anti-magic" }], sound: "effects/magic-resist" },
  // Tower Genies' Wish: a sparkle of fortune as a Spell is conjured to hand.
  "genie-spell-draw-few": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "genie-spell-draw-pack": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  // Slayer Spell: after its dice read out (they ride the attack-die overlay), the
  // slayer glyph flares over the gold target as the empowered blow lands.
  slayer: { affect: [{ key: "slayer" }], sound: "spells/slayer" },
  // --- Stronghold expansion creature abilities -----------------------------
  // Thunderbirds' Lightning Strike: the engine rolls one extra Attack die after
  // the bird's blow (reducer.ts applyAttackDieDamageFollowUps) and emits a
  // UNIT_ABILITY_TRIGGERED on the target. It crackles with the SAME lightning
  // bolt + thunder-crack the Lightning Bolt spell uses, so the strike both LOOKS
  // and SOUNDS like a thunderclap (its sibling Wyvern sting already animates this
  // way). The 1-damage hit, when the die lands on "0"/"+1", floats after the bolt.
  "thunderbirds-lightning": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/lightning-bolt"
  },
  // Ogres' "Bloodlust Token" (few +1 / pack +2 Attack): a chosen friendly unit is
  // whipped into a battle frenzy. It reuses the Bloodlust spell's presentation —
  // the red battle-rage wash over the buffed unit + the H3 bloodlust cry — since
  // the token IS a Bloodlust buff by another name.
  "ogres-attack-token-few": { tint: "bloodlust", sound: "spells/bloodlust" },
  "ogres-attack-token-pack": { tint: "bloodlust", sound: "spells/bloodlust" },
  // Behemoths' Corrosion (pack): after the crushing blow, an acid token eats the
  // target's armour. It splashes with the same acid burst the Rust Dragon's Acid
  // Breath uses (the two share the Corrosion-token mechanic).
  "behemoth-corrosion": { hit: "acid-breath", hitSound: "effects/acid-breath" },
  // Vampires' Life Drain: after the bite, the unit heals (vampire-heal-on-attack
  // few/pack, and the Crypt-bank "remove all damage" bank-vampire-life-drain).
  // Both fire a UNIT_ABILITY_TRIGGERED under their own id (heal.abilityId) — they
  // This is NOT Cure: it is the exact user-supplied Vampire heal .def, converted
  // losslessly into the same sprite-sheet pipeline as the original H3 effects.
  "vampire-heal-on-attack": { affect: [{ key: "vampire-life-drain" }], sound: "effects/drain-life" },
  "bank-vampire-life-drain": { affect: [{ key: "vampire-life-drain" }], sound: "effects/drain-life" },
  // MGQ Carmilla's Vampire Life-Drain heals her by the damage she deals; fire the
  // same Vampire drain frames + drain-life chime the other vampire heals use.
  "mgq-carmilla-life-drain": { affect: [{ key: "vampire-life-drain" }], sound: "effects/drain-life" },
  // MGQ Pochi's Pack Dig: she claws an obstacle into an adjacent cell. There is
  // no sprite over Pochi herself — the placed obstacle art IS the visual — so the
  // cue is the earthy "digging into the ground" shift the Quicksand spell uses.
  "mgq-pack-dig": { sound: "spells/quicksand" },
  // Dragon Flies' Dispel: stripping the enemy's own buffs off the target fires a
  // UNIT_ABILITY_TRIGGERED("dragon-fly-dispel"); reuse the same dispel shimmer +
  // sound the spell-counter cue uses (cancelFx) so the cleanse is seen and heard.
  "dragon-fly-dispel": { affect: [{ key: "dispel" }], sound: "spells/dispel" },
  // Every true start-of-activation Regeneration uses the original Heroes III
  // SP12_ orb + REGENER cue. These are all implemented ON_ACTIVATION_HEAL_SELF
  // ability ids: printed Wraith/Troll, commander, MGQ and unit-experience ranks.
  "wraith-heal-1": regenerationFxPlan,
  "wraith-heal-2": regenerationFxPlan,
  "troll-heal-3": regenerationFxPlan,
  "commander-regeneration": regenerationFxPlan,
  "veteran-boar-regeneration": regenerationFxPlan,
  "veteran-regeneration-2": regenerationFxPlan,
  "mgq-giga-regeneration": regenerationFxPlan,
  // --- Factory (expansion) gold / cube abilities -----------------------------
  // Couatls' activated invulnerability ("Ethereal Coil"): a protective barrier
  // shimmers over the unit — when it goes up (on the couatl, endsActivation), when
  // it shrugs off an attack (the ward.abilityId event in applyAttackDamageFrom-
  // Candidate) and as it fades. The Shield spell's barrier + chime read as
  // "ignore all damage & spell effects".
  "couatl-invulnerability-few": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "couatl-invulnerability-pack": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "couatl-invulnerability": { affect: [{ key: "shield" }], sound: "spells/shield" },
  // Dreadnoughts' (Juggernaut) splash allocation ("Concussive Slam"): a shockwave
  // ripples over each struck adjacent unit as the Juggernaut's cannon reports. The
  // event fires per target (targetUnitId), so each pick gets its own burst — the
  // same per-target pattern as the Magog fireball splash.
  "dreadnought-splash-1": { affect: [{ key: "death-ripple" }], sound: "units/dreadnought-shoot" },
  "dreadnought-splash-2": { affect: [{ key: "death-ripple" }], sound: "units/dreadnought-shoot" },
  "dreadnought-splash-neutral": { affect: [{ key: "death-ripple" }], sound: "units/dreadnought-shoot" },
  "factory-dreadnought-speed-hunter": { projectile: "factory-dreadnought-laser-beam", sound: "units/dreadnought-laser" },
  "factory-couatl-momentum": { affect: [{ key: "factory-couatl-momentum" }], sound: "spells/cure" },
  "factory-bounty-hunter-cover": { affect: [{ key: "factory-bounty-hunter-mark" }], sound: "units/gunslinger-special" },
  // Artificer's immediate and delayed Field Repair use the Factory repair art
  // and the native REPAIR clip, rather than the generic Cure presentation.
  "commander-cast-factory": { affect: [{ key: "ctv-field-repair" }], sound: "spells/repair" },
  // Automaton (Few) faction cube: a mechanical whir as a cube is armed onto the
  // unit ("Overcharge"), then the DETONATE explosion — a fireball burst + the
  // Automaton's signature blast. The fixed-amount Detonates (the boxed
  // automaton-detonate and the neutral automaton-detonate-1) share the same blast.
  "automaton-place-cube": { sound: "units/automaton-move" },
  "automaton-detonate-cubes": { affect: [{ key: "fireball" }], sound: "units/automaton-special" },
  "automaton-detonate": { affect: [{ key: "fireball" }], sound: "units/automaton-special" },
  "automaton-detonate-1": { affect: [{ key: "fireball" }], sound: "units/automaton-special" },
  // Sandworm (Pack) faction cube: it "Devours" the unit it removed (a life-drain
  // over the corpse, banking a cube on the kill) and, when it spends a cube to
  // strike again, a "Feeding Frenzy" washes over it.
  "sandworm-cube-gain": { affect: [{ key: "vampire-life-drain" }], sound: "units/sandworm-special" },
  "sandworm-cube-attack": { affect: [{ key: "frenzy" }], sound: "spells/frenzy" },
  // Bounty Hunters (Neutral) "Preemptive Shot": a Counterstrike-style readiness
  // shimmer over the guard as it fires back FIRST (the retaliation attack itself
  // is the shot animation/sound; this cues the special pre-emptive timing).
  "bounty-hunter-preemptive": { affect: [{ key: "counterstrike" }], sound: "units/gunslinger-special" },
  // --- Additional monster ability cues (only ids that fire on the real effect) -
  // Cove Sorceresses' Weakness token (activation place OR on-attack): the same
  // Weakness glyph + cry the Weakness spell uses.
  "sorceress-weakness-few": { affect: [{ key: "weakness" }], sound: "spells/weakness" },
  "sorceress-weakness-on-attack": { affect: [{ key: "weakness" }], sound: "spells/weakness" },
  // Bulwark Freezing Shot: Initiative debuff after the attack — the Slow wash
  // is the closest H3 "you're slowed" presentation (no dedicated freeze sheet
  // for unit abilities; spells/freeze is an uncertain identification).
  "bulwark-freezing-shot": { affect: [{ key: "slow" }], sound: "spells/slow" },
  // Behemoths' Crushing Blow / Corrosive Crush (and the WOG commander twin):
  // Defense is shredded for this attack — Disrupting Ray's beam is the H3
  // "armor stripped" cue.
  "behemoth-defense-crush-few": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  "behemoth-defense-crush-pack": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  "commander-defense-crush": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  // Manticore Piercing Strike: ignore the target's printed Defense — same
  // "armor stripped" read as the Behemoth crush.
  "manticore-ignore-defense": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  // Ghost Dragon Knock Back: the shove itself (applyKnockback) fires the bare
  // ability id — the roll announce is `${id}-roll` and stays unmapped. Fear is
  // the H3 "shoved by terror" glyph.
  "ghost-dragon-knockback": { affect: [{ key: "fear" }], sound: "effects/fear" },
  // Ghost Dragon Aging (activation morale drain): the dedicated Age sheet.
  "ghost-dragon-morale-drain": { affect: [{ key: "age" }], sound: "effects/age" },
  // Factory Mechanics' Repair: mend an adjacent mechanical unit — the H3 repair
  // chime + the green Cure shimmer (same heal presentation as Enchanters).
  "mechanics-repair-1": { affect: [{ key: "cure" }], sound: "spells/repair" },
  "mechanics-repair-2": { affect: [{ key: "cure" }], sound: "spells/repair" },
  // Enchanters' activation heal. The +Attack fallback announces under
  // `${id}-buff` (unmapped) so this Cure shimmer only plays on a real heal.
  "enchanter-heal-or-buff": { affect: [{ key: "cure" }], sound: "spells/cure" },
  // Archangel lethal-save readiness: the real Resurrection sheet (not Prayer)
  // when the Archangel commits to cancel a killing blow. The cancel itself
  // also fires the shared "resurrection" ability plan with the same sheet.
  "archangel-lethal-save": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  // Future abilities (cards not implemented yet, assets ready):
  poison: { affect: [{ key: "poison" }], sound: "spells/poison" },
  paralyze: { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  age: { affect: [{ key: "age" }], sound: "effects/age" },
  disease: { affect: [{ key: "disease" }], sound: "spells/disease" },
  bind: { affect: [{ key: "bind" }], sound: "effects/bind" },
  fear: { affect: [{ key: "fear" }], sound: "effects/fear" },
  "acid-breath": { hit: "acid-breath", hitSound: "effects/acid-breath" }
};

/**
 * Units whose ordinary ranged SHOT is a spell bolt rather than a plain arrow:
 * the table flies this projectile + hit sprite (with the spell's sound) instead
 * of the generic "bolt" cue. Keyed by the unit's bare name (the id without its
 * faction prefix), like the creature voices in unit-sounds.ts. The Santa Gremlin
 * "attacks with Ice Bolt" (its wog-santa-ice-bolt elemental attack), so its shot
 * IS the Ice Bolt — the same projectile/burst/sound the Ice Bolt spell and the
 * Faerie Dragon fire.
 */
export const unitShotFxPlans: Record<string, SpellFxPlan> = {
  marksmen: { projectile: "crossbow-shot-phases" },
  elves: { projectile: "arrow-shot-phases" },
  medusas: { projectile: "arrow-shot-phases" },
  snow_elves: { projectile: "spear-shot-phases" },
  sharpshooters: { projectile: "arrow-shot-phases" },
  arctic_sharpshooter: { projectile: "arrow-shot-phases" },
  lava_sharpshooter: { projectile: "arrow-shot-phases" },
  sylvan_centaur: { projectile: "arrow-shot-phases" },
  orcs: { projectile: "axe-shot-phases" },
  lizardmen: { projectile: "spear-shot-phases" },
  halflings: { projectile: "stone-shot-phases" },
  grenadiers: { projectile: "stone-shot-phases" }, // neutral Grenadiers lob the same sling stone
  gremlins: { projectile: "stone-shot-phases" },
  cyclopes: { projectile: "boulder-shot-phases" },
  magogs: { projectile: "fireball-shot-phases" },
  liches: { projectile: "lich-death-cloud-shot-phases" },
  dracolich: {
    projectile: "lich-death-cloud-shot-phases",
    hitSound: "spells/death-cloud",
  },
  storm_elementals: { projectile: "titan-shot-phases" },
  ice_elementals: { projectile: "ice-shot-phases" },
  shamans: { projectile: "ice-shot-phases" },
  sorceresses: { projectile: "magi-shot-phases" },
  enchanters: { projectile: "magi-shot-phases" },
  sea_dogs: { projectile: "sea-dog-gunshot" },
  gunslingers: { projectile: "blue-archive-shot-phases" },
  titans: { projectile: "titan-shot-phases" },
  titan: { projectile: "titan-shot-phases" },
  magi: { projectile: "magi-shot-phases" },
  evil_eyes: { projectile: "evil-eye-shot-phases" },
  zealots: { projectile: "zealot-shot-phases" },
  war_zealot: { projectile: "zealot-shot-phases" },
  wog_war_zealot: { projectile: "zealot-shot-phases" },
  hild: { projectile: "evil-eye-shot-phases" },
  maya: { projectile: "ice-shot-phases" },
  cupi: { projectile: "arrow-shot-phases" },
  disciplinary_committee: { projectile: "little-busters-warning-shot-phases" },
  mio: { projectile: "magi-shot-phases" },
  spider_overmind: { projectile: "plasma-shot-phases" },
  // Forge shooters (the creature's own voice rides the "shoot" action in
  // unit-sounds.ts; the weapon report is the plan's sound):
  //  Grunts   — DOOM plasma rifle bolt (Arachnotron plasma).
  //  Watchers — the Evil Eye's psionic beam, a mind-blast (Forgetfulness) on impact.
  //  Bruisers — DOOM rocket launch, rocket, and a fireball blast on impact.
  //  Tanks    — cannon shell with the cannon report and a DOOM barrel blast.
  grunts: { projectile: "plasma-shot-phases", sound: "doom/dsplasma" },
  watchers: { projectile: "evil-eye-shot-phases", hit: "forgetfulness", hitSound: "spells/forgetfulness" },
  bruisers: { projectile: "rocket-shot-phases", hit: "fireball", sound: "doom/dsrlaunc", hitSound: "doom/dsbarexp" },
  tanks: { projectile: "war-machine-cannon-projectile", hit: "land-mine-hit", sound: "units/cannon-shoot", hitSound: "doom/dsbarexp" },
  santa_gremlin: {
    projectile: "ice-shot-phases",
    sound: "spells/ice-bolt",
    hitSound: "spells/ice-bolt-hit"
  }
};

const factionShotProjectiles: Record<string, string> = {
  "doom.former_human": "blue-archive",
  "doom.former_human_sergeant": "shotgun",
  "doom.former_commando": "blue-archive",
  "doom.spider_mastermind": "blue-archive",
  "doom.imp": "fireball",
  "doom.mancubus": "fireball",
  "doom.arachnotron": "plasma",
  "doom.arch_vile": "fireball",
  "doom.cyberdemon": "rocket",
  "imperium.astra_militarum": "plasma",
  "imperium.dreadnought": "azur-lane",
  "fuyuki.archers": "arrow",
  "fuyuki.casters": "magi",
  "azure_breeze.core_master": "zealot",
  "hidden_leaf.anbu": "kunai",
  "hidden_leaf.jonin": "kunai",
  "heavenly_demon.gu_witches": "death-cloud",
  "heavenly_demon.ghost_king": "death-cloud",
  "little_busters.softball_club": "baseball",
  "little_busters.disciplinary_committee": "little-busters-warning",
};

const rapidFireShots: Record<string, number> = {
  "doom.former_human": 3,
  "doom.former_commando": 4,
  "doom.spider_mastermind": 4,
  "doom.arachnotron": 4,
};

/** Every commander can unlock Can Shoot, so every slug needs a real weapon. */
const commanderShotFxPlans: Record<string, SpellFxPlan> = {
  "commander:paladin": { projectile: "commander-holy-hammer-shot-phases" },
  "commander:hierophant": { projectile: "magi-shot-phases" },
  "commander:temple_guardian": { projectile: "titan-shot-phases" },
  "commander:succubus": { projectile: "fireball-shot-phases" },
  "commander:brute": { projectile: "boulder-shot-phases" },
  "commander:soul_eater": { projectile: "death-cloud-shot-phases" },
  "commander:ogre_leader": { projectile: "axe-shot-phases" },
  "commander:shaman": { projectile: "ice-shot-phases" },
  "commander:astral_spirit": { projectile: "titan-shot-phases" },
  "commander:corsair": { projectile: "azur-lane-shot-phases", sound: "units/cannon-shoot" },
  "commander:factory": { projectile: "plasma-shot-phases" },
  "commander:bulwark": { projectile: "ice-shot-phases" },
  "commander:ruler": { projectile: "magi-shot-phases" },
  "commander:sword_saint": { projectile: "commander-spirit-blade-shot-phases" },
  "commander:might_guy": { projectile: "kunai-shot-phases" },
  "commander:belfast": { projectile: "azur-lane-shot-phases", sound: "units/cannon-shoot" },
  "commander:demon_ancestor": { projectile: "death-cloud-shot-phases" },
  "commander:kyousuke_natsume": { projectile: "baseball-shot-phases" },
  "commander:ibuki": {
    projectile: "blue-archive-shot-phases",
    projectileCount: 4,
    projectileIntervalMs: 55,
    sound: "mgq/effects/gun2",
  },
  "commander:lion_el_jonson": { projectile: "commander-spirit-blade-shot-phases" },
  "commander:sonya": { projectile: "magi-shot-phases" },
  // Forge Storm Engineer: the Titan's lightning bolt.
  "commander:forge": { projectile: "titan-shot-phases" },
};

const groundFirearmVisualUnits = new Set([
  "doom.former_human_sergeant",
  "doom.spider_mastermind",
]);

const blueArchiveFirearmVisualUnits = new Set([
  "blue_archive.nagisa", "blue_archive.aris", "blue_archive.shiroko",
  "blue_archive.hina", "blue_archive.hoshino", "blue_archive.yuuka",
  "blue_archive.aru", "blue_archive.toki", "blue_archive.saori",
  "blue_archive.azusa", "blue_archive.wakamo", "blue_archive.iori",
  "blue_archive.mutsuki", "blue_archive.hasumi",
]);

const blueArchiveShotFxPlans: Record<string, SpellFxPlan> = {
  "blue_archive.nagisa": { projectile: "anime-rocket-shot-phases", projectileCount: 2, projectileIntervalMs: 80, sound: "units/cannon-shoot" },
  "blue_archive.aris": { projectile: "plasma-shot-phases", sound: "mgq/effects/laser" },
  "blue_archive.hoshino": { projectile: "shotgun-shot-phases" },
  "blue_archive.shiroko": { projectile: "blue-archive-shot-phases", projectileCount: 3, projectileIntervalMs: 58 },
  "blue_archive.hina": { projectile: "blue-archive-shot-phases", projectileCount: 4, projectileIntervalMs: 48 },
  "blue_archive.yuuka": { projectile: "blue-archive-shot-phases", projectileCount: 2, projectileIntervalMs: 70 },
  "blue_archive.aru": { projectile: "rocket-shot-phases", sound: "units/cannon-shoot" },
  "blue_archive.toki": { projectile: "plasma-shot-phases", projectileCount: 2, projectileIntervalMs: 76, sound: "mgq/effects/laser" },
  "blue_archive.azusa": { projectile: "blue-archive-shot-phases" },
  "blue_archive.wakamo": { projectile: "fireball-shot-phases", sound: "mgq/effects/fire8" },
  "blue_archive.saori": { projectile: "blue-archive-shot-phases", projectileCount: 3, projectileIntervalMs: 62 },
  "blue_archive.iori": { projectile: "blue-archive-shot-phases" },
  "blue_archive.mutsuki": { projectile: "rocket-shot-phases", projectileCount: 2, projectileIntervalMs: 90, sound: "units/cannon-shoot" },
  "blue_archive.hasumi": { projectile: "crossbow-shot-phases" },
};

const alwaysProjectilePresentationUnits = new Set([
  "kudryavka_noumi",
  "komari_kamikita",
  "wog.dracolich",
]);

/** Shooter presentation without changing the unit's engine attack type. */
export function unitUsesProjectilePresentation(unitDefId: string | undefined): boolean {
  return Boolean(
    unitDefId &&
    (blueArchiveFirearmVisualUnits.has(unitDefId)
      || groundFirearmVisualUnits.has(unitDefId)
      || alwaysProjectilePresentationUnits.has(unitDefId))
  );
}

/** Ranged battlefield heroes keep their signature weapon even on Retaliation. */
export function unitAlwaysUsesProjectilePresentation(unitDefId: string | undefined): boolean {
  return Boolean(unitDefId && alwaysProjectilePresentationUnits.has(unitDefId));
}

/** Select the weapon before falling back to the phased ordinary arrow. */
export function unitShotFxPlan(unitDefId: string | undefined): SpellFxPlan | undefined {
  if (!unitDefId) {
    return undefined;
  }
  const commanderPlan = commanderShotFxPlans[unitDefId];
  if (commanderPlan) {
    return commanderPlan;
  }
  if (unitDefId === "kudryavka_noumi") {
    return { projectile: "anime-rocket-shot-phases" };
  }
  if (unitDefId === "komari_kamikita") {
    return { projectile: "komari-heart-shot-phases" };
  }
  const blueArchivePlan = blueArchiveShotFxPlans[unitDefId];
  if (blueArchivePlan) {
    return { sound: "mgq/effects/gun2", ...blueArchivePlan };
  }
  const bareName = unitDefId.split(/[.:]/).at(-1) ?? unitDefId;
  const normalizedBareName = bareName.replace(/-/g, "_");
  const factionProjectile = factionShotProjectiles[unitDefId];
  if (factionProjectile) {
    const projectileCount = rapidFireShots[unitDefId];
    return {
      projectile: `${factionProjectile}-shot-phases`,
      ...(projectileCount ? { projectileCount, projectileIntervalMs: 58 } : {}),
    };
  }
  if (unitDefId === "azur_lane.akagi") {
    return { projectile: "anime-rocket-shot-phases", sound: "units/cannon-shoot" };
  }
  if (unitDefId.startsWith("azur_lane.")) {
    return { projectile: "azur-lane-shot-phases", sound: "units/cannon-shoot" };
  }
  if (unitDefId.startsWith("blue_archive.")) {
    return {
      projectile: "blue-archive-shot-phases",
      projectileCount: 4,
      projectileIntervalMs: 55,
      sound: "mgq/effects/gun2",
    };
  }
  if (unitDefId === "guardian:stockpile-cyclopes" || unitDefId.startsWith("reward:cyclopes:")) {
    return { projectile: "boulder-shot-phases" };
  }
  return unitShotFxPlans[normalizedBareName]
    ?? unitShotFxPlans[normalizedBareName.replace(/^wog_/, "")]
    ?? { projectile: "arrow-shot-phases" };
}

/** Low Roll Extra Shot keeps a known unit's actual weapon; unknown shooters use the neutral bonus tracer. */
export function unitExtraShotFxPlan(unitDefId: string | undefined): SpellFxPlan {
  if (!unitDefId) return abilityFxPlans["ranged-extra-shot-on-low-roll"];
  const bareName = unitDefId.split(/[.:]/).at(-1) ?? unitDefId;
  const normalizedBareName = bareName.replace(/-/g, "_");
  const hasSpecificWeapon = Boolean(
    commanderShotFxPlans[unitDefId]
    || blueArchiveShotFxPlans[unitDefId]
    || alwaysProjectilePresentationUnits.has(unitDefId)
    || factionShotProjectiles[unitDefId]
    || unitDefId === "azur_lane.akagi"
    || unitDefId.startsWith("azur_lane.")
    || unitDefId.startsWith("blue_archive.")
    || unitDefId === "guardian:stockpile-cyclopes"
    || unitDefId.startsWith("reward:cyclopes:")
    || unitShotFxPlans[normalizedBareName]
    || unitShotFxPlans[normalizedBareName.replace(/^wog_/, "")]
  );
  return hasSpecificWeapon
    ? (unitShotFxPlan(unitDefId) ?? abilityFxPlans["ranged-extra-shot-on-low-roll"])
    : abilityFxPlans["ranged-extra-shot-on-low-roll"];
}

/**
 * Heals that are NOT cast as spells and so have no SPELL_CAST_RESOLVED to carry
 * a sprite + sound — keyed by the source card. The First Aid Tent is the one in
 * play today: its per-round heal otherwise floated a bare "+N" with no effect.
 * Spell heals (Cure) are intentionally absent: they animate through their spell
 * cast, and adding them here would play the cure twice.
 */
export const healFxPlans: Record<string, SpellFxPlan> = {
  // The Tent and its First Aid ability use the same original regeneration orb
  // and REGENER cue as Wights/Wraiths/Trolls — never the Cure spell effect.
  "war_machine.first_aid_tent": regenerationFxPlan,
  // The First Aid ability card (basic side) removes 1 damage from a chosen
  // unit. It heals outside the spell flow too — its DAMAGE_HEALED carries the
  // card id as the source — so it would otherwise float a bare "+1" in silence.
  "ability.first_aid": regenerationFxPlan
};

/**
 * War machines that FIRE a shot in combat — the Ballista, Catapult and Cannon —
 * play their own Heroes III shot at the WAR_MACHINE_TRIGGERED cue (see page.tsx),
 * just before the struck unit's hurt cry lands on the DAMAGE_ASSIGNED that
 * follows. Each plan combines a generated transparent physical projectile,
 * impact sprite, and its measured Heroes III shot clip. The First Aid Tent is
 * deliberately absent — it heals rather than
 * fires and carries its cue through `healFxPlans` — and the Ammo Cart is a
 * passive ranged buff that never fires a shot of its own.
 */
export const warMachineFxPlans: Record<string, SpellFxPlan> = {
  "war_machine.ballista": {
    projectile: "war-machine-ballista-projectile", hit: "sniper-shot-hit",
    sound: "units/ballista-shoot", hitSound: "effects/siege-wall-hit", warMachine: "ballista"
  },
  "war_machine.catapult": {
    projectile: "war-machine-catapult-projectile", hit: "land-mine-hit",
    sound: "units/catapult-shoot", hitSound: "effects/siege-wall-hit", warMachine: "catapult"
  },
  "war_machine.cannon": {
    projectile: "war-machine-cannon-projectile", hit: "land-mine-hit",
    sound: "units/cannon-shoot", hitSound: "effects/siege-wall-hit", warMachine: "cannon"
  },
  // Forge Lightning Generator: the Titan's lightning shot leaves the in-play
  // generator card and travels to the struck unit, where a bolt lands. The
  // crackle is the Energy Elemental rank-I ability's sound (Delayed Impact,
  // "veteran-energy-delay" → custom-ability/electric-impact). Its long electric
  // tail keeps ringing while combat resumes (presentationMs gate).
  "war_machine.lightning_generator": {
    projectile: "titan-shot-phases", hit: "lightning-bolt",
    sound: "custom-ability/electric-impact", warMachine: "lightning_generator",
    presentationMs: 1500
  }
};

// Direct specialty damage has no SPELL_CAST_RESOLVED event. Present the
// specialty's spell on its damage event, without animating its Power option.
export const cardSpellFxPlans: Record<string, SpellFxPlan> = {
  "specialty.ciele.6": spellFxPlans["spell.magic_arrow"],
  "specialty.zeestral.1": stormCircuitBoltPlan,
  "specialty.zeestral.4": stormCircuitBoltPlan,
  "specialty.zeestral.6": stormCircuitBoltPlan,
};

/**
 * Ability/permanent cards that deal damage as a fired SHOT rather than a Spell:
 * the Artillery ability directs a Ballista-style volley at the lowest-initiative
 * enemy. Its DAMAGE_ASSIGNED (source = the card) carries the shot sound — the
 * same H3 Ballista report the war-machine Ballista uses — played just before the
 * struck unit's hurt cry + damage number (see page.tsx), so the shot is heard
 * first. Each shot carries its physical projectile, launcher recoil and impact
 * effect. Keyed by source card id, mirroring `healFxPlans`.
 */
export const cardShotFxPlans: Record<string, SpellFxPlan> = {
  "ability.artillery": {
    projectile: "war-machine-ballista-projectile", hit: "sniper-shot-hit",
    sound: "units/ballista-shoot", hitSound: "effects/siege-wall-hit", warMachine: "ballista"
  },
  // Ballistics' expert bombardment fires the siege Catapult's report on each
  // hit (primary + the adjacent splash), both logged as card-sourced
  // DAMAGE_ASSIGNED events keyed to this card id.
  "ability.ballistics": {
    projectile: "war-machine-catapult-projectile", hit: "land-mine-hit",
    sound: "units/catapult-shoot", hitSound: "effects/siege-wall-hit", warMachine: "catapult"
  },
  // Specialty damage clauses that are physical shots but retain the specialty
  // card as DAMAGE_ASSIGNED's rules source. Grant/activate clauses already flow
  // through WAR_MACHINE_TRIGGERED and therefore must not be duplicated here.
  "specialty.tarnum_castle.6": {
    projectile: "war-machine-ballista-projectile", hit: "sniper-shot-hit",
    sound: "units/ballista-shoot", hitSound: "effects/siege-wall-hit", warMachine: "ballista"
  },
  "specialty.gerwulf.4": {
    projectile: "war-machine-ballista-projectile", hit: "sniper-shot-hit",
    sound: "units/ballista-shoot", hitSound: "effects/siege-wall-hit", warMachine: "ballista"
  },
  "specialty.jeremy.1": {
    projectile: "war-machine-cannon-projectile", hit: "land-mine-hit",
    sound: "units/cannon-shoot", hitSound: "effects/siege-wall-hit", warMachine: "cannon"
  },
  "specialty.jeremy.4": {
    projectile: "war-machine-cannon-projectile", hit: "land-mine-hit",
    sound: "units/cannon-shoot", hitSound: "effects/siege-wall-hit", warMachine: "cannon"
  },
  "specialty.jeremy.6": {
    projectile: "war-machine-cannon-projectile", hit: "land-mine-hit",
    sound: "units/cannon-shoot", hitSound: "effects/siege-wall-hit", warMachine: "cannon"
  }
};

// ---------------------------------------------------------------------------
// Presentation timing: how long a spell/ability's animation AND sound take, so
// the damage / death / heal it causes can be held back until both have fully
// played. The numbers come straight from the converted assets (sprite frame
// counts, measured MP3 lengths) so they can never drift out of sync with what
// the player actually sees and hears.
// ---------------------------------------------------------------------------

const SOUND_MS = soundDurations as Record<string, number>;

/** Playback length of a converted sound in ms (0 when unknown/missing). */
export function soundDurationMs(key: string | undefined): number {
  if (!key) {
    return 0;
  }
  return SOUND_MS[key] ?? 0;
}

/**
 * A single-frame sheet (e.g. the lightning bolt still) is flashed with a fade
 * rather than shown for one fps tick — see runSprite in components/table/fx.tsx.
 */
export const SINGLE_FRAME_FLASH_MS = 480;

/**
 * Upper bound on a projectile's flight. runProjectile scales the flight by
 * distance but caps it here, so using the cap keeps the damage gate safe (it
 * can only ever wait a touch too long, never resolve before the bolt lands).
 */
export const MAX_PROJECTILE_FLIGHT_MS = 560;

/**
 * Safety bound on the whole gate so a freak overlong clip can never stall the
 * table. It sits above every real spell/ability cue today — the longest damage
 * presentation (the Faerie Dragon's Ice Bolt) lands near 2.0s, and the very
 * longest sound of any kind (Azure Dragon's Fear, a no-damage debuff) is ~3.4s
 * — so it never trims one in practice.
 */
// Long voiced ability lines (notably the sourced Blue Archive EX lines) need
// enough room to finish before their queued damage/heal presentation lands.
export const MAX_PRESENTATION_MS = 6000;

/** How long a sprite sheet plays on screen, in ms. */
export function spriteDurationMs(key: string | undefined): number {
  if (!key) {
    return 0;
  }
  const sheet = getFxSheet(key);
  if (!sheet) {
    return 0;
  }
  return sheet.frames <= 1 ? SINGLE_FRAME_FLASH_MS : Math.round((sheet.frames / sheet.fps) * 1000);
}

/**
 * The four presentation segments a plan can contribute, mirroring exactly how
 * queueBoardFx / the ability cue builder schedule them (projectile XOR hit,
 * then affect, then tint). Each segment lasts until BOTH its sprite work and
 * the sound playing under it have finished.
 */
function projectileSegmentMs(plan: SpellFxPlan): number {
  const sheet = plan.projectile ? getFxSheet(plan.projectile) : undefined;
  // Phased atlases include a 120ms launch and 300ms embedded contact phase in
  // addition to travel. A separate hit sprite (Kud's Inferno) starts after all
  // three, so the state reveal must remain gated through the complete sequence.
  const flight = sheet?.projectilePhases
    ? 120 + MAX_PROJECTILE_FLIGHT_MS + 300
    : MAX_PROJECTILE_FLIGHT_MS;
  const volleyTail = Math.max(0, (plan.projectileCount ?? 1) - 1) * (plan.projectileIntervalMs ?? 60);
  // The cast sound fires as the bolt launches; the hit sprite + hit sound land
  // when it arrives (after the flight).
  return volleyTail + Math.max(
    flight + spriteDurationMs(plan.hit),
    soundDurationMs(plan.sound),
    flight + soundDurationMs(plan.hitSound)
  );
}

function hitSegmentMs(plan: SpellFxPlan): number {
  // queueBoardFx plays hitSound ?? sound under a bare hit sprite.
  return Math.max(spriteDurationMs(plan.hit), soundDurationMs(plan.hitSound ?? plan.sound));
}

function affectSegmentMs(plan: SpellFxPlan): number {
  if (!plan.affect || plan.affect.length === 0) {
    return 0;
  }
  const spriteEnd = Math.max(
    ...plan.affect.map((entry) => (entry.delayMs ?? 0) + (plan.playbackMs ?? spriteDurationMs(entry.key)))
  );
  // The cast sound plays under the first affect sprite.
  const soundEnd = (plan.affect[0].delayMs ?? 0) + soundDurationMs(plan.sound);
  return Math.max(spriteEnd, soundEnd);
}

/** Bloodlust-style tints have no sprite; the wash holds this long. */
export const TINT_HOLD_MS = 900;

function tintSegmentMs(plan: SpellFxPlan): number {
  if (!plan.tint) {
    return 0;
  }
  return Math.max(TINT_HOLD_MS, soundDurationMs(plan.sound));
}

/**
 * Total time a spell/ability's board presentation (sprites + the sounds layered
 * under them) takes, from the moment it begins. This gates the following action.
 * A plan may expose its own earlier `resultAtMs` climax for the represented
 * result while its closing frames/audio continue inside this full duration.
 */
export function spellPresentationMs(plan: SpellFxPlan | undefined): number {
  if (!plan) {
    return 0;
  }
  if (plan.presentationMs !== undefined) {
    return Math.min(MAX_PRESENTATION_MS, Math.max(0, plan.presentationMs));
  }
  if (plan.projectile && getFxSheet(plan.projectile)?.projectilePhases) {
    return Math.max(800, 120 + soundDurationMs(plan.sound), 500 + soundDurationMs(plan.hitSound));
  }
  let total = 0;
  if (plan.projectile) {
    total += projectileSegmentMs(plan);
  } else if (plan.hit) {
    total += hitSegmentMs(plan);
  }
  total += affectSegmentMs(plan);
  total += tintSegmentMs(plan);
  // A sound-only plan (e.g. Summon Elemental) still has a presentation: the
  // cast sound. Floor the gate at it so it is never reported as instantaneous.
  if (total === 0) {
    total = soundDurationMs(plan.sound);
  }
  return Math.min(MAX_PRESENTATION_MS, total);
}
