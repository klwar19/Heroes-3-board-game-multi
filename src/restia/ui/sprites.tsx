"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import creatureAtlases from "@/data/battle-hex/creature-sprite-atlases.json";
import partyAtlases from "../data/battle-atlases.json";
import type { Dir, IconRef } from "../engine/types";
import { CROPS } from "../data/crops";
import { ITEMS } from "../data/items";
import { A, SHEETS, SPRINKLER_SHEET } from "./assets";
import css from "./restia.module.css";

const breathe = css.breathe;

export type Atlas = {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  anchorX: number;
  anchorY: number;
  /** `foot`: this row's own ground line when it isn't drawn on anchorY (measured by the asset build). */
  groups: Record<string, { row: number; frames: number; start?: number; foot?: number }>;
};

const ATLASES: Record<string, Atlas> = { ...(creatureAtlases as Record<string, Atlas>), ...(partyAtlases as Record<string, Atlas>) };

export function atlasFor(slug: string): Atlas | null {
  return ATLASES[slug] ?? null;
}

/** H3 animation groups used by Restia battles. */
export const G = { move: 0, standing: 2, hit: 3, defend: 4, death: 5, attack: 12, shoot: 15, cast: 18 } as const;

export function groupFor(atlas: Atlas, wanted: number): number {
  if (atlas.groups[String(wanted)]) return wanted;
  const fallbacks: Record<number, number[]> = {
    [G.shoot]: [G.attack, 11, 13],
    [G.cast]: [G.attack, 17, 19, G.shoot],
    [G.attack]: [11, 13, G.shoot],
    [G.defend]: [G.hit, G.standing],
    [G.hit]: [G.standing],
    [G.move]: [G.standing],
    [G.death]: [G.hit]
  };
  for (const alt of fallbacks[wanted] ?? []) if (atlas.groups[String(alt)]) return alt;
  return Number(Object.keys(atlas.groups)[0] ?? 0);
}

/** Where the feet are in `group`'s frames (so every row stands on the same ground). */
export function footOf(atlas: Atlas, group: number): number {
  return atlas.groups[String(groupFor(atlas, group))]?.foot ?? atlas.anchorY;
}

const preloaded = new Set<string>();

/**
 * Fetch and decode a figure's other sheets (facing, skills, extra moves) ahead
 * of time, so turning or striking never shows an empty frame while one loads.
 */
export function preloadSheets(slug: string) {
  if (typeof Image === "undefined") return;
  for (const suffix of ["", "-front", "-back", "-x", "-sk"]) {
    const atlas = atlasFor(`${slug}${suffix}`);
    if (!atlas || preloaded.has(atlas.image)) continue;
    preloaded.add(atlas.image);
    const image = new Image();
    image.src = A(atlas.image);
    image.decode?.().catch(() => undefined);
  }
}

function sheetHeight(atlas: Atlas): number {
  let rows = 0;
  for (const info of Object.values(atlas.groups)) {
    const last = info.start === undefined ? info.row + 1 : Math.ceil((info.start + info.frames) / atlas.columns);
    rows = Math.max(rows, last);
  }
  return rows * atlas.frameHeight;
}

function frameOffset(atlas: Atlas, group: number, index: number): { x: number; y: number } {
  const info = atlas.groups[String(group)]!;
  const frame = Math.max(0, Math.min(index, info.frames - 1));
  if (info.start === undefined) return { x: frame * atlas.frameWidth, y: info.row * atlas.frameHeight };
  const cell = info.start + frame;
  return { x: (cell % atlas.columns) * atlas.frameWidth, y: Math.floor(cell / atlas.columns) * atlas.frameHeight };
}

/**
 * One animation group of an H3-format atlas. `clipKey` restarts the clip;
 * non-looping clips hold their last frame and report `onEnd` once. Frames are
 * stepped on requestAnimationFrame and written straight to the element (no
 * React render per frame), timed from the clip's start so they never drift.
 */
export function SpriteClip({
  atlas,
  group,
  loop,
  fps = 10,
  scale = 1,
  flip = false,
  clipKey,
  onEnd,
  onLoop,
  hold,
  phase = 0,
  since,
  className,
  style
}: {
  atlas: Atlas;
  group: number;
  loop: boolean;
  fps?: number;
  scale?: number;
  flip?: boolean;
  clipKey?: string | number;
  onEnd?: () => void;
  /** Called each time a looping clip wraps around (idle fidgets hook in here). */
  onLoop?: () => void;
  /** Show this one frame and don't animate (tweened idles). */
  hold?: number;
  /** Start this many ms into the clip (so a crowd doesn't move in lockstep). */
  phase?: number;
  /** When the clip started (performance.now()): a sheet swap mid-clip (a walker turning) carries on at the same frame. */
  since?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const resolved = groupFor(atlas, group);
  const frames = atlas.groups[String(resolved)]?.frames ?? 1;
  const clipId = `${atlas.image}|${resolved}|${clipKey ?? ""}|${loop}`;
  const ref = useRef<HTMLDivElement>(null);
  /** The frame on screen, so a re-render of the parent writes the same one back. */
  const shownRef = useRef<{ id: string; pos: string } | null>(null);
  const endRef = useRef(onEnd);
  const loopRef = useRef(onLoop);
  useEffect(() => {
    endRef.current = onEnd;
    loopRef.current = onLoop;
  });
  const position = (index: number) => {
    const offset = frameOffset(atlas, resolved, index);
    return `${-offset.x * scale}px ${-offset.y * scale}px`;
  };
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const start = since ?? performance.now() - phase;
    const stepAt = (now: number) => Math.max(0, Math.floor(((now - start) * fps) / 1000));
    const first = hold ?? (loop ? stepAt(performance.now()) % frames : Math.min(stepAt(performance.now()), frames - 1));
    element.style.backgroundPosition = position(first);
    shownRef.current = { id: clipId, pos: position(first) };
    if (hold !== undefined) return;
    let shown = first;
    let raf = 0;
    let laps = Math.floor(stepAt(performance.now()) / frames);
    const tick = (now: number) => {
      const step = stepAt(now);
      const ended = !loop && step >= frames - 1;
      const index = loop ? step % frames : Math.min(step, frames - 1);
      if (loop && Math.floor(step / frames) > laps) {
        laps = Math.floor(step / frames);
        loopRef.current?.();
      }
      if (index !== shown) {
        shown = index;
        const pos = position(index);
        element.style.backgroundPosition = pos;
        shownRef.current = { id: clipId, pos };
      }
      if (ended) {
        endRef.current?.();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
    // position() only depends on the values below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, frames, loop, fps, scale, hold, since]);
  return (
    <div
      aria-hidden
      className={className}
      ref={ref}
      style={{
        width: atlas.frameWidth * scale,
        height: atlas.frameHeight * scale,
        backgroundImage: `url(${A(atlas.image)})`,
        backgroundSize: `${atlas.columns * atlas.frameWidth * scale}px ${sheetHeight(atlas) * scale}px`,
        backgroundPosition: shownRef.current?.id === clipId ? shownRef.current.pos : position(hold ?? 0),
        backgroundRepeat: "no-repeat",
        transform: flip ? "scaleX(-1)" : undefined,
        ...style
      }}
    />
  );
}

/** Still frame (standing group, frame 0) — used for map symbols and portraits. */
export function SpriteStill({ slug, height, className }: { slug: string; height: number; className?: string }) {
  const atlas = atlasFor(slug);
  if (!atlas) return null;
  const group = groupFor(atlas, G.standing);
  const offset = frameOffset(atlas, group, 0);
  const scale = height / atlas.frameHeight;
  return (
    <div
      aria-hidden
      className={className}
      style={{
        width: atlas.frameWidth * scale,
        height,
        backgroundImage: `url(${A(atlas.image)})`,
        backgroundSize: `${atlas.columns * atlas.frameWidth * scale}px ${sheetHeight(atlas) * scale}px`,
        backgroundPosition: `${-offset.x * scale}px ${-offset.y * scale}px`,
        backgroundRepeat: "no-repeat"
      }}
    />
  );
}

function gridCell(sheet: string, cells: number, index: number, size: number | string, className?: string, style?: CSSProperties, rows = cells) {
  const col = index % cells;
  const row = Math.floor(index / cells);
  const pct = (n: number, count: number) => (count === 1 ? 0 : (n / (count - 1)) * 100);
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundImage: `url(${A(sheet)})`,
        backgroundSize: `${cells * 100}% ${rows * 100}%`,
        backgroundPosition: `${pct(col, cells)}% ${pct(row, rows)}%`,
        backgroundRepeat: "no-repeat",
        ...style
      }}
    />
  );
}

/** Icon sheets are 6 columns; sheet d has 3 rows, the others 6. */
const ICON_ROWS: Record<IconRef["sheet"], number> = { a: 6, b: 6, c: 6, d: 3 };

export function IconSprite({ icon, size = 40, className }: { icon: IconRef; size?: number | string; className?: string }) {
  return gridCell(SHEETS.icons[icon.sheet], 6, icon.index, size, className, undefined, ICON_ROWS[icon.sheet]);
}

/** A sprinkler of tier 1-3, standing (or spraying) on its patch of soil. */
export function SprinklerSprite({ tier, size, spraying = false, className, style }: { tier: number; size: number; spraying?: boolean; className?: string; style?: CSSProperties }) {
  const col = Math.max(0, Math.min(2, tier - 1));
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundImage: `url(${SPRINKLER_SHEET})`,
        backgroundSize: `${size * 3}px ${size * 2}px`,
        backgroundPosition: `${-col * size}px ${spraying ? -size : 0}px`,
        backgroundRepeat: "no-repeat",
        ...style
      }}
    />
  );
}

/** Item icon; seeds show a pouch with their harvest's badge (a crystal bloom shows its crystal). */
export function ItemIcon({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  const def = ITEMS[id];
  if (!def) return null;
  if (def.sprinkler) return <SprinklerSprite className={className} size={size} tier={def.sprinkler} />;
  const harvest = def.seedOf ? ITEMS[CROPS[def.seedOf]?.produce ?? def.seedOf] : undefined;
  if (harvest) {
    return (
      <span className={className} style={{ position: "relative", display: "inline-block", width: size, height: size }}>
        <IconSprite icon={def.icon} size={size} />
        <span style={{ position: "absolute", right: -2, bottom: -2 }}>
          <IconSprite icon={harvest.icon} size={Math.round(size * 0.5)} />
        </span>
      </span>
    );
  }
  return <IconSprite icon={def.icon} size={size} className={className} />;
}

/** Farm cell 0-35 on the first sheet, 36-71 on the second. */
export function FarmSprite({ index, size, className, style }: { index: number; size: number | string; className?: string; style?: CSSProperties }) {
  return gridCell(index < 36 ? SHEETS.farm : SHEETS.farm2, 6, index % 36, size, className, style);
}

export function DungeonSprite({ index, size, className, style }: { index: number; size: number | string; className?: string; style?: CSSProperties }) {
  return gridCell(SHEETS.dungeon, 4, index, size, className, style);
}

/**
 * Overworld figure drawn with the character's battle atlas: the walk clip while
 * moving, the standing loop otherwise. Atlases face right; walking left mirrors
 * them and walking up/down keeps the last side. Render it inside a zero-size box
 * at the character's feet: the atlas anchor lands on that point.
 */
/**
 * A figure walking the overworld: its side view for left/right, its back view
 * walking up and its front view walking down (when it has those sheets). All
 * views share one body scale. Standing, a Restia-drawn figure breathes on one
 * clean frame; Heroes 3 creatures loop their standing row.
 */
export function Walker({ slug, dir, walking, height }: { slug: string; dir: Dir; walking: boolean; height: number }) {
  const [side, setSide] = useState<"left" | "right">(dir === "left" ? "left" : "right");
  if ((dir === "left" || dir === "right") && dir !== side) setSide(dir);
  useEffect(() => preloadSheets(slug), [slug]);
  const base = atlasFor(slug);
  if (!base) return null;
  const view = dir === "up" ? atlasFor(`${slug}-back`) : dir === "down" ? atlasFor(`${slug}-front`) : null;
  const atlas = view ?? base;
  // Every sheet is normalised to the same body height, so the side sheet's frame sets the scale.
  const scale = height / base.frameHeight;
  const flip = side === "left";
  const anchorX = flip ? atlas.frameWidth - atlas.anchorX : atlas.anchorX;
  const tweened = slug.startsWith("restia-") && !walking;
  return (
    <div className={tweened ? breathe : undefined} style={{ position: "absolute", left: -anchorX * scale, top: -footOf(atlas, walking ? G.move : G.standing) * scale }}>
      <SpriteClip atlas={atlas} flip={flip} fps={walking ? 12 : 6} group={walking ? G.move : G.standing} hold={tweened ? 0 : undefined} loop scale={scale} />
    </div>
  );
}
