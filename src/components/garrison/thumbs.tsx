"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useRef } from "react";
import { spriteFrameOffset } from "@/data/battle-hex/creature-sprites";
import { CARDS, DEFENDERS, ENEMIES, type CardId, type DefKind, type EnemyKind } from "@/engine/garrison/content";
import { assetUrl } from "@/lib/asset-url";
import THUMB_BOUNDS from "@/data/garrison/thumb-bounds.json";
import { atlasFor, G, peekImage, ready } from "./art";
import styles from "./garrison.module.css";

/**
 * A creature portrait cut from its Heroes III battle atlas (standing frame),
 * framed on the foot anchor. Drawn on a small canvas that is only displayed
 * (never read back), so CDN images need no CORS.
 */
export function SpriteThumb({ slug, size = 64, flip = false, className, ghost = false }: { slug: string; size?: number; flip?: boolean; className?: string; ghost?: boolean }) {
  const atlas = atlasFor(slug);
  if (!atlas) return <span className={`${styles.thumb} ${className ?? ""}`} style={{ width: size, height: size }} />;
  const info = atlas.groups[String(G.stand)] ?? Object.values(atlas.groups)[0]!;
  const { x, y } = spriteFrameOffset(atlas, info, 0);
  // H3 frames carry a lot of empty canvas around the body: frame the body. With its
  // measured bounds (scripts/build-garrison-thumb-bounds.mjs) the whole creature fits,
  // heads, horns and wings included, feet near the bottom; otherwise a guess from the frame.
  const body = (THUMB_BOUNDS as Record<string, readonly number[] | undefined>)[slug];
  let crop: number;
  let left: number;
  let top: number;
  if (body && body.length === 4) {
    const [l, t, r, b] = body as [number, number, number, number];
    crop = Math.max(40, Math.max(r - l, b - t) * 1.04 + 2);
    left = x + (l + r) / 2 - crop / 2;
    top = y + b + crop * 0.05 - crop;
  } else {
    crop = Math.max(62, Math.min(150, atlas.frameHeight * 0.66));
    left = x + atlas.anchorX - crop / 2;
    top = y + atlas.anchorY - crop * 0.96;
  }
  return (
    <span
      aria-hidden="true"
      className={`${styles.thumb} ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        transform: flip ? "scaleX(-1)" : undefined,
        // A Spectre is half there.
        opacity: ghost ? 0.5 : undefined
      }}
    >
      <ThumbCanvas crop={crop} left={left} size={size} src={atlas.image} top={top} />
    </span>
  );
}

/**
 * The portrait itself: the crop is cut out of the atlas once (decoded and cropped
 * off the main thread) and kept as a small bitmap, so a screen of thumbnails never
 * paints, scales or holds whole multi-megapixel atlases (opening the prep screen
 * or the Almanac used to stall on exactly that).
 */
function ThumbCanvas({ src, left, top, crop, size }: { src: string; left: number; top: number; crop: number; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useIsoLayoutEffect(() => {
    let live = true;
    const key = `${src}|${left}|${top}|${crop}`;
    const paint = (cut: ThumbCut | null) => {
      const canvas = ref.current;
      if (!live || !cut || !canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.max(1, Math.round(size * dpr));
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const k = px / crop;
      ctx.drawImage(cut.image, cut.dx * k, cut.dy * k, cut.w * k, cut.h * k);
    };
    const done = thumbCuts.get(key);
    if (done !== undefined) paint(done);
    else void cutThumb(key, src, left, top, crop).then(paint);
    return () => {
      live = false;
    };
  }, [src, left, top, crop, size]);
  return <canvas aria-hidden="true" ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A cut-out crop: the bitmap and where it sits inside the crop square (atlas px). */
type ThumbCut = { image: CanvasImageSource; dx: number; dy: number; w: number; h: number };

/** Finished crops by atlas + rectangle (a failed load is not kept: the next mount retries). */
const thumbCuts = new Map<string, ThumbCut>();
const thumbJobs = new Map<string, Promise<ThumbCut | null>>();
/** Atlases decoded at once while cutting (each is several megabytes decoded). */
const CUT_PARALLEL = 4;
let cutting = 0;
const cutQueue: (() => void)[] = [];

function cutThumb(key: string, src: string, left: number, top: number, crop: number): Promise<ThumbCut | null> {
  let job = thumbJobs.get(key);
  if (!job) {
    job = new Promise<ThumbCut | null>((resolve) => {
      const run = () => {
        cutting += 1;
        cutFrom(src, left, top, crop)
          .catch(() => null)
          .then((cut) => {
            if (cut) thumbCuts.set(key, cut);
            thumbJobs.delete(key);
            resolve(cut);
          })
          .finally(() => {
            cutting -= 1;
            cutQueue.shift()?.();
          });
      };
      if (cutting < CUT_PARALLEL) run();
      else cutQueue.push(run);
    });
    thumbJobs.set(key, job);
  }
  return job;
}

async function cutFrom(src: string, left: number, top: number, crop: number): Promise<ThumbCut | null> {
  // The battle's own decoded atlas when it has one; otherwise a throwaway image
  // (the browser's HTTP cache still serves the bytes to the battle later).
  const shared = peekImage(src);
  let img: HTMLImageElement;
  if (shared && ready(shared)) {
    img = shared;
  } else {
    img = new Image();
    img.decoding = "async";
    img.src = assetUrl(src);
    try {
      await img.decode();
    } catch {
      if (!img.complete) await new Promise((done) => { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); });
    }
    if (!img.naturalWidth) return null;
  }
  // Whole atlas pixels around the (fractional) crop square, so it keeps its exact framing.
  const x0 = Math.floor(left);
  const y0 = Math.floor(top);
  const w = Math.max(1, Math.ceil(left + crop) - x0);
  const h = Math.max(1, Math.ceil(top + crop) - y0);
  const at = { dx: x0 - left, dy: y0 - top, w, h };
  if (typeof createImageBitmap === "function") {
    try {
      return { image: await createImageBitmap(img, x0, y0, w, h), ...at };
    } catch {
      // Fall back to a canvas copy below.
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, -x0, -y0);
  return { image: canvas, ...at };
}

export function CardArt({ card, size = 64 }: { card: CardId; size?: number }) {
  const def = CARDS[card];
  if (!def) return null;
  if (def.places && def.places !== "mine") return <SpriteThumb ghost={DEFENDERS[def.places]!.veiled} size={size} slug={DEFENDERS[def.places]!.sprite} />;
  return <img alt="" className={styles.iconArt} draggable={false} src={assetUrl(def.icon ?? "/assets/spells-land_mine.webp")} style={{ width: size, height: size }} />;
}

export function DefenderArt({ kind, size = 64 }: { kind: DefKind; size?: number }) {
  const def = DEFENDERS[kind];
  if (!def) return null;
  if (!def.sprite) return <img alt="" className={styles.iconArt} src={assetUrl("/assets/spells-land_mine.webp")} style={{ width: size, height: size }} />;
  return <SpriteThumb ghost={def.veiled} size={size} slug={def.sprite} />;
}

export function AttackerArt({ kind, size = 64 }: { kind: EnemyKind; size?: number }) {
  const def = ENEMIES[kind];
  if (!def) return null;
  if (kind === "banner") return <img alt="" className={styles.iconArt} src={assetUrl("/assets/tide/war-banner.webp")} style={{ width: size, height: size, objectFit: "contain" }} />;
  return <SpriteThumb flip ghost={def.evade !== undefined} size={size} slug={def.sprite} />;
}

/** The painted backdrop behind a unit on its card, chosen by what the unit does. */
export type CardScene = "day" | "gold" | "stone" | "arcane" | "ember" | "frost" | "grove";

export const CARD_SCENES: readonly CardScene[] = ["day", "gold", "stone", "arcane", "ember", "frost", "grove"];

/** "/assets/order-chaos/ui/scene-gold.webp" for a scene. */
export const cardSceneSrc = (scene: CardScene): string => `/assets/order-chaos/ui/scene-${scene}.webp`;

export function cardScene(kind: DefKind): CardScene {
  const def = DEFENDERS[kind];
  if (!def) return "day";
  if (def.produce || def.luckyKills || def.nuggets) return "gold";
  if (def.instant?.kind === "frost" || def.shot?.chill || def.chillBiters) return "frost";
  if (def.ignite || def.burnAura || def.flame || def.instant?.kind === "immolate" || def.shot?.projectile === "fireball") return "ember";
  if (def.caster || def.chainLightning || def.lightning || def.slowCast || def.heal || def.laneHeal || def.ward || def.shellGift || def.charm || def.beam || def.instant) return "arcane";
  if (def.shot || def.snipe || def.airstrike) return "day";
  if (def.melee || def.pounce || def.devour) return "grove";
  return "stone";
}
