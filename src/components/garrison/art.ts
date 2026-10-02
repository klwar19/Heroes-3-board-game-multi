/**
 * Garrison Wars art helpers: cached images (always through assetUrl, so the
 * CDN layout applies), Heroes III creature atlas frames and FX sheets drawn on
 * a 2D canvas. Drawing only — no game rules here.
 */

import { creatureSheet, creatureSpriteForSlug, spriteFrameOffset, type CreatureSpriteAtlas } from "@/data/battle-hex/creature-sprites";
import { getFxSheet, type FxSheet } from "@/data/fx";
import garrisonAtlases from "@/data/garrison/sprite-atlases.json";
import type { ProjectileKind } from "@/engine/garrison/content";
import { assetUrl } from "@/lib/asset-url";

const images = new Map<string, HTMLImageElement>();
/**
 * Images decoded off the main thread. Creature atlases are several megabytes;
 * drawing one before it is decoded makes the browser decode it synchronously
 * inside the frame (a visible hitch), so nothing is drawn until decode() ends.
 */
const decoded = new WeakSet<HTMLImageElement>();

/** A cached image for a public path; `ready` once loaded and decoded. */
export function image(path: string): HTMLImageElement {
  let img = images.get(path);
  if (!img) {
    const created = new Image();
    created.decoding = "async";
    created.src = assetUrl(path);
    images.set(path, created);
    const onLoad = () => decoded.add(created);
    if (typeof created.decode === "function") {
      // decode() can reject (busy decoder, memory pressure) even though the
      // image loads: then fall back to drawing it once it has loaded.
      created.decode().then(onLoad, () => {
        if (created.complete && created.naturalWidth > 0) onLoad();
        else created.addEventListener("load", onLoad, { once: true });
      });
    } else {
      created.addEventListener("load", onLoad, { once: true });
    }
    img = created;
  }
  return img;
}

export function ready(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return Boolean(img && decoded.has(img) && img.naturalWidth > 0);
}

/** The cached image for a path when something already asked for it (starts no request). */
export function peekImage(path: string): HTMLImageElement | undefined {
  return images.get(path);
}

/** Starts loading and decoding the atlases for these creature slugs. */
export function preloadSprites(slugs: Iterable<string>): void {
  for (const slug of slugs) {
    const atlas = atlasFor(slug);
    if (atlas) image(creatureSheet(atlas).image);
  }
}

const atlases = new Map<string, CreatureSpriteAtlas | null>();

/**
 * The Tide's own creatures (gw-*): rotoscoped from real Heroes III frames
 * (scripts/build-pose-guide.mjs -> Codex -> scripts/import-pose-guided-sheet.mjs),
 * kept apart from the hex battlefield's atlas table.
 */
const GARRISON_ATLASES = garrisonAtlases as unknown as Record<string, Omit<CreatureSpriteAtlas, "slug">>;

export function atlasFor(slug: string): CreatureSpriteAtlas | null {
  if (!slug) return null;
  if (!atlases.has(slug)) {
    const own = GARRISON_ATLASES[slug];
    atlases.set(slug, own ? { slug, ...own } : creatureSpriteForSlug(slug));
  }
  return atlases.get(slug) ?? null;
}

/** H3 creature animation groups used by the lawn. */
export const G = { move: 0, stand: 2, hit: 3, defend: 4, death: 5, attack: 12, shoot: 15, cast: 18, vanish: 20, appear: 21 } as const;

export function groupFrames(atlas: CreatureSpriteAtlas, group: number): number {
  return atlas.groups[String(group)]?.frames ?? 0;
}

/** The first of the preferred groups this atlas has. */
export function pickGroup(atlas: CreatureSpriteAtlas, ...preferred: number[]): number {
  for (const group of preferred) if (groupFrames(atlas, group) > 0) return group;
  return G.stand;
}

/**
 * Draws one atlas frame with its foot anchor at (x, y). `flip` mirrors it
 * (Heroes III creatures face right).
 */
export function drawAtlas(
  ctx: CanvasRenderingContext2D,
  atlas: CreatureSpriteAtlas,
  group: number,
  frame: number,
  x: number,
  y: number,
  scale: number,
  flip: boolean,
  /** Squash and stretch about the feet (1 = none). */
  stretch?: { x: number; y: number }
): boolean {
  const info = atlas.groups[String(group)] ?? atlas.groups[String(G.stand)];
  // The 2x HD sheet when there is one: its cells are the original's at twice the size.
  let sheet = creatureSheet(atlas);
  let img = image(sheet.image);
  if (!hdSprites && sheet.scale !== 1) {
    // Slow frames: the original sheet (a quarter of the texture memory) once it has
    // loaded; the HD sheet keeps drawing until then, so nothing blinks out.
    const plain = image(atlas.image);
    if (ready(plain)) {
      sheet = { image: atlas.image, scale: 1 };
      img = plain;
    }
  }
  if (!ready(img) || !info) return false;
  const k = sheet.scale;
  const offset = spriteFrameOffset(atlas, info, frame);
  const sx = offset.x * k;
  const sy = offset.y * k;
  // A status tint (chill, poison, a hit flash...) comes from a small cache of
  // pre-filtered frames: a canvas filter on every draw is the costliest thing a
  // crowded lawn does (a filtered layer per sprite per frame).
  const filter = ctx.filter;
  const tinted = filter && filter !== "none" && !SPATIAL_FILTER.test(filter) ? tintedFrame(img, atlas, k, sx, sy, filter) : null;
  ctx.save();
  // Only the creature frames resample at "high" (they are drawn enlarged); the
  // board's soft layers keep the cheaper default.
  ctx.imageSmoothingQuality = "high";
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale((flip ? -scale : scale) * (stretch?.x ?? 1), scale * (stretch?.y ?? 1));
  if (tinted) {
    ctx.filter = "none";
    ctx.drawImage(tinted, -atlas.anchorX, -atlas.anchorY, atlas.frameWidth, atlas.frameHeight);
  } else {
    ctx.drawImage(img, sx, sy, atlas.frameWidth * k, atlas.frameHeight * k, -atlas.anchorX, -atlas.anchorY, atlas.frameWidth, atlas.frameHeight);
  }
  ctx.restore();
  return true;
}

/** False while a battle's frames run slow: creatures then draw from their original sheets. */
let hdSprites = true;

export function setHdSprites(on: boolean): void {
  hdSprites = on;
}

/** Filters that spread pixels (they must see the scaled draw, so they stay live). */
const SPATIAL_FILTER = /blur|drop-shadow|url\(/;

/**
 * Pre-filtered atlas frames, least recently used first (bounded; a typical frame is about 90 KB).
 * The bound is in original-size frames: a frame cut from a 2x HD sheet counts as four.
 */
const tintedFrames = new Map<string, { canvas: HTMLCanvasElement; weight: number }>();
const TINTED_MAX = 512;
let tintedWeight = 0;

/**
 * One atlas frame with a canvas filter baked in. The filters the lawn uses are
 * per-pixel colour operations (sepia, hue-rotate, saturate, brightness,
 * grayscale, contrast), so filtering the frame once and scaling it afterwards
 * looks the same as filtering every scaled draw.
 */
function tintedFrame(img: HTMLImageElement, atlas: CreatureSpriteAtlas, k: number, sx: number, sy: number, filter: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${img.src}|${sx}|${sy}|${filter}`;
  const hit = tintedFrames.get(key);
  if (hit) {
    tintedFrames.delete(key);
    tintedFrames.set(key, hit);
    return hit.canvas;
  }
  const weight = k * k;
  let canvas: HTMLCanvasElement | undefined;
  while (tintedFrames.size && tintedWeight + weight > TINTED_MAX) {
    const oldest = tintedFrames.keys().next().value as string;
    const gone = tintedFrames.get(oldest)!;
    canvas = gone.canvas;
    tintedWeight -= gone.weight;
    tintedFrames.delete(oldest);
  }
  canvas ??= document.createElement("canvas");
  // (Setting the size also clears the canvas and resets its context.)
  canvas.width = atlas.frameWidth * k;
  canvas.height = atlas.frameHeight * k;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.filter = filter;
  ctx.drawImage(img, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  tintedFrames.set(key, { canvas, weight });
  tintedWeight += weight;
  return canvas;
}

// ---------------------------------------------------------------------------
// FX sheets

export function fxSheet(key: string): FxSheet | undefined {
  return getFxSheet(key);
}

/** Draws frame `frame` of an FX sheet centred (or bottom-anchored) at (x, y), `width` px wide. */
export function drawFx(ctx: CanvasRenderingContext2D, sheet: FxSheet, frame: number, x: number, y: number, width: number, alpha = 1): void {
  const img = image(sheet.src);
  if (!ready(img)) return;
  const index = Math.max(0, Math.min(sheet.frames - 1, Math.floor(frame)));
  const ordered = sheet.frameOrder?.[index] ?? index;
  const col = ordered % sheet.cols;
  const row = Math.floor(ordered / sheet.cols);
  const height = (width * sheet.frameHeight) / sheet.frameWidth;
  const top = sheet.anchor === "bottom" ? y - height : y - height / 2;
  ctx.save();
  ctx.globalAlpha = alpha * (sheet.opacity ?? 1);
  if (sheet.blendMode === "screen") ctx.globalCompositeOperation = "screen";
  ctx.drawImage(img, col * sheet.frameWidth, row * sheet.frameHeight, sheet.frameWidth, sheet.frameHeight, x - width / 2, top, width, height);
  ctx.restore();
}

/** Phased projectile atlases (4x4: launch 0-3, flight 4-11, impact 12-15). */
export type ShotSheet = { src: string; width: number; impact: number; filter?: string };

const phased = (name: string, width: number, impact: number, filter?: string): ShotSheet => ({
  src: `/fx/${name}-shot-phases-alpha.webp`, width, impact, filter
});

export const SHOT_SHEETS: Record<ProjectileKind, ShotSheet> = {
  arrow: phased("arrow", 0.6, 0.6),
  stone: phased("stone", 0.35, 0.6),
  gift: phased("stone", 0.35, 0.6, "hue-rotate(300deg) saturate(2)"),
  frost: phased("ice", 0.65, 1),
  bolt: phased("magi", 0.75, 1.05),
  holy: phased("zealot", 0.7, 1.05),
  dark: phased("evil-eye", 0.7, 0.9),
  axe: phased("axe", 0.5, 0.7),
  spear: phased("spear", 0.75, 0.65),
  lightning: phased("titan", 0.7, 1),
  fireball: phased("fireball", 0.7, 1.2),
  cloud: phased("death-cloud", 0.75, 1.25),
  boulder: phased("stone", 0.85, 1.2),
  // DOOM (the two recoloured sheets are baked, not filtered per frame).
  hellfire: phased("fireball", 0.72, 1.15),
  cacoball: { src: "/assets/garrison/fx/cacoball-shot-phases.webp", width: 0.8, impact: 1.15 },
  baronball: phased("plasma", 0.8, 1.15),
  plasma: { src: "/assets/garrison/fx/plasma-cyan-shot-phases.webp", width: 0.55, impact: 0.8 },
  rocket: phased("rocket", 0.85, 1.4),
  // Bullets are drawn as tracers; the sheet gives the muzzle flash and the puff where they land.
  bullet: phased("shotgun", 0.55, 0.55),
  // A Lost Soul is drawn from its creature atlas; the sheet is its burst on impact.
  soul: phased("fireball", 0.6, 1),
  // Order & Chaos: a Runemaster Yeti's rune-hammer and a Temple Guardian's spirit crescent (both drawn spinning),
  // a Softball Ace's softball (drawn hopping), a Shadow Fox's kunai.
  hammer: phased("commander-holy-hammer", 0.62, 0.9),
  crescent: phased("commander-spirit-blade", 0.8, 1),
  ball: phased("baseball", 0.36, 0.7),
  kunai: phased("kunai", 0.5, 0.6)
};

const PHASE_CELL = 313.5;

/** Draws cell `cell` (0-15) of a phased projectile sheet centred at (x, y). */
export function drawShot(ctx: CanvasRenderingContext2D, sheet: ShotSheet, cell: number, x: number, y: number, width: number, flip: boolean, alpha = 1): void {
  const img = image(sheet.src);
  if (!ready(img)) return;
  const index = Math.max(0, Math.min(15, Math.floor(cell)));
  const cellSize = img.naturalWidth > 0 ? img.naturalWidth / 4 : PHASE_CELL;
  // A recoloured sheet (the gift) draws its cells pre-filtered, like the creature tints.
  const tinted = sheet.filter ? tintedCell(img, sheet.src, index, cellSize, sheet.filter) : null;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (sheet.filter && !tinted) ctx.filter = sheet.filter;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  if (tinted) ctx.drawImage(tinted, -width / 2, -width / 2, width, width);
  else ctx.drawImage(img, (index % 4) * cellSize, Math.floor(index / 4) * cellSize, cellSize, cellSize, -width / 2, -width / 2, width, width);
  ctx.restore();
}

/** Pre-filtered projectile cells (only filtered sheets: at most 16 cells each). */
const tintedCells = new Map<string, HTMLCanvasElement>();

function tintedCell(img: HTMLImageElement, src: string, index: number, cellSize: number, filter: string): HTMLCanvasElement | null {
  const key = `${src}|${index}|${filter}`;
  const hit = tintedCells.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cellSize);
  canvas.height = Math.round(cellSize);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.filter = filter;
  ctx.drawImage(img, (index % 4) * cellSize, Math.floor(index / 4) * cellSize, cellSize, cellSize, 0, 0, canvas.width, canvas.height);
  tintedCells.set(key, canvas);
  return canvas;
}
