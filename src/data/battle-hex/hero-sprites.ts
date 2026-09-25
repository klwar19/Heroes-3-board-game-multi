import atlases from "./hero-sprite-atlases.json";
import { coreHeroDefinitions } from "@/data/factions/core";
import type { HeroDefinition } from "@/data/factions/types";
import type { CreatureSpriteAtlas } from "./creature-sprites";

/**
 * Hex Battlefield HERO figures (PC-style): the Heroes 3 / HotA hero battle
 * sprites (CHxx.def, built by `scripts/build-hero-sprites.mjs`) and the
 * player-coloured battle flags. Codex-painted sheets for towns without a PC
 * sprite (Forge) are imported into the same atlas file with
 * `scripts/import-sprite-sheet.mjs --meta src/data/battle-hex/hero-sprite-atlases.json`.
 *
 * A hero whose town has no sprite (anime / wuxia / Warhammer towns, or a
 * Forge sheet not imported yet) gets NO figure — nothing is invented.
 */
export type HeroSpriteAtlas = CreatureSpriteAtlas & {
  /**
   * VCMI placement origin: the full 150x175 frame's centre in cell pixels (the
   * PC draws it centred on the 64x136 hero box). Absent on imported sheets.
   */
  originX?: number;
  originY?: number;
  /** Flag atlases: a luminance ramp tinted with the seat's player colour. */
  tint?: boolean;
};

type AtlasEntry = Omit<HeroSpriteAtlas, "slug">;
// Via unknown: entries differ in shape (flags carry `tint`, imported sheets no origin).
const ATLASES = atlases as unknown as Readonly<Record<string, AtlasEntry>>;

/** H3 hero battle animation groups (CHxx.def block ids). */
export const HERO_GROUP = {
  standing: 0,
  shuffle: 1,
  defeat: 2,
  victory: 3,
  cast: 4
} as const;

/** H3 plays hero animations at 10 fps (VCMI BattleHero::play). */
export const HERO_FRAME_MS = 100;
/**
 * The spell leaves the hero at this frame of the cast group (VCMI
 * HeroCastAnimation: "middle point of animation", frame 4 of 8).
 */
export const HERO_CAST_RELEASE_FRAME = 4;
export const HERO_CAST_RELEASE_MS = HERO_CAST_RELEASE_FRAME * HERO_FRAME_MS;

/**
 * Heroes whose battle sprite is the town's FEMALE one (H3 hero sex; HotA mod
 * `"female": true`). Everyone else uses the male sprite. Conflux and Forge
 * sprites go by class only.
 */
const FEMALE_HEROES: ReadonlySet<string> = new Set([
  // Castle
  "catherine", "adelaide", "valeska",
  // Necropolis
  "tamika", "isra", "vidomina", "septienna",
  // Rampart
  "gem", "mephala", "melodia",
  // Inferno
  "fiona", "ash", "octavia",
  // Stronghold
  "dessa", "gundula", "shiva",
  // Dungeon
  "mutare", "lorelei", "sephinroth",
  // Tower
  "iona", "josephine", "cyra",
  // Fortress
  "adrienne", "merist",
  // Cove (HotA)
  "astra", "cassiopeia", "miriam", "casmetra",
  // Factory (HotA)
  "henrietta", "sam", "celestine",
  // Bulwark (HotA)
  "creyle", "oidana"
]);

/** H3 towns: one male + one female sprite per town, shared by both classes. */
const GENDERED_TOWNS = new Set(["castle", "rampart", "tower", "inferno", "necropolis", "dungeon", "stronghold", "fortress"]);
/** HotA towns: a male + female sprite per class (might / magic). */
const CLASS_GENDERED_TOWNS = new Set(["cove", "factory", "bulwark"]);

/** Candidate atlas slugs for a hero, best first (none for towns without a PC hero). */
export function heroSpriteSlugs(hero: Pick<HeroDefinition, "id" | "faction" | "type">): string[] {
  const gender = FEMALE_HEROES.has(hero.id) ? "female" : "male";
  if (GENDERED_TOWNS.has(hero.faction)) return [`hero-${hero.faction}-${gender}`];
  if (hero.faction === "conflux") return [`hero-conflux-${hero.type}`];
  // HotA sprite first, then a class-only imported sheet if one was made.
  if (CLASS_GENDERED_TOWNS.has(hero.faction)) return [`hero-${hero.faction}-${hero.type}-${gender}`, `hero-${hero.faction}-${hero.type}`];
  if (hero.faction === "forge") return [`hero-forge-${hero.type}`];
  return [];
}

export function heroSpriteForSlug(slug: string): HeroSpriteAtlas | null {
  const atlas = ATLASES[slug];
  return atlas ? { slug, ...atlas } : null;
}

/** The battle sprite of a hero definition, or null (no figure is drawn). */
export function heroSpriteForHeroDef(heroDefId: string | null | undefined): HeroSpriteAtlas | null {
  const hero = heroDefId ? coreHeroDefinitions[heroDefId] : undefined;
  if (!hero) return null;
  for (const slug of heroSpriteSlugs(hero)) {
    const atlas = heroSpriteForSlug(slug);
    if (atlas) return atlas;
  }
  return null;
}

/** The PC battle flag: CMFLAGL for the left-hand hero, CMFLAGR for the right. */
export function heroFlagSprite(leftSide: boolean): HeroSpriteAtlas | null {
  return heroSpriteForSlug(leftSide ? "flag-left" : "flag-right");
}
