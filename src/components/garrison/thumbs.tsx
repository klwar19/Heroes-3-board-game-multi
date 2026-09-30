"use client";

/* eslint-disable @next/next/no-img-element */
import { spriteFrameOffset } from "@/data/battle-hex/creature-sprites";
import { CARDS, DEFENDERS, ENEMIES, type CardId, type DefKind, type EnemyKind } from "@/engine/garrison/content";
import { assetUrl } from "@/lib/asset-url";
import THUMB_BOUNDS from "@/data/garrison/thumb-bounds.json";
import { atlasFor, G } from "./art";
import styles from "./garrison.module.css";

/**
 * A creature portrait cut from its Heroes III battle atlas (standing frame),
 * framed on the foot anchor. Pure CSS background, so CDN images need no CORS.
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
  const scale = size / crop;
  return (
    <span
      aria-hidden="true"
      className={`${styles.thumb} ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${assetUrl(atlas.image)}")`,
        backgroundSize: `${atlas.columns * atlas.frameWidth * scale}px auto`,
        backgroundPosition: `${-left * scale}px ${-top * scale}px`,
        transform: flip ? "scaleX(-1)" : undefined,
        // A Spectre is half there.
        opacity: ghost ? 0.5 : undefined
      }}
    />
  );
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
