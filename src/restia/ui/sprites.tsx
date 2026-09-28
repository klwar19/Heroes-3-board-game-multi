"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import creatureAtlases from "@/data/battle-hex/creature-sprite-atlases.json";
import partyAtlases from "../data/battle-atlases.json";
import type { Dir, IconRef } from "../engine/types";
import { ITEMS } from "../data/items";
import { A, SHEETS } from "./assets";

export type Atlas = {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  anchorX: number;
  anchorY: number;
  groups: Record<string, { row: number; frames: number; start?: number }>;
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
 * non-looping clips hold their last frame and report `onEnd` once.
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
  className?: string;
  style?: CSSProperties;
}) {
  const resolved = groupFor(atlas, group);
  const frames = atlas.groups[String(resolved)]?.frames ?? 1;
  const clipId = `${atlas.image}|${resolved}|${clipKey ?? ""}|${loop}`;
  const [anim, setAnim] = useState({ id: clipId, frame: 0 });
  const endRef = useRef(onEnd);
  useEffect(() => {
    endRef.current = onEnd;
  });
  useEffect(() => {
    let index = 0;
    let done = false;
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= frames) {
        if (loop) index = 0;
        else {
          index = frames - 1;
          if (!done) {
            done = true;
            window.clearInterval(timer);
            endRef.current?.();
          }
        }
      }
      setAnim({ id: clipId, frame: index });
    }, 1000 / fps);
    return () => window.clearInterval(timer);
  }, [clipId, frames, loop, fps]);
  const offset = frameOffset(atlas, resolved, anim.id === clipId ? anim.frame : 0);
  return (
    <div
      aria-hidden
      className={className}
      style={{
        width: atlas.frameWidth * scale,
        height: atlas.frameHeight * scale,
        backgroundImage: `url(${A(atlas.image)})`,
        backgroundSize: `${atlas.columns * atlas.frameWidth * scale}px ${sheetHeight(atlas) * scale}px`,
        backgroundPosition: `${-offset.x * scale}px ${-offset.y * scale}px`,
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

function gridCell(sheet: string, cells: number, index: number, size: number | string, className?: string, style?: CSSProperties) {
  const col = index % cells;
  const row = Math.floor(index / cells);
  const pct = (n: number) => (cells === 1 ? 0 : (n / (cells - 1)) * 100);
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundImage: `url(${A(sheet)})`,
        backgroundSize: `${cells * 100}% ${cells * 100}%`,
        backgroundPosition: `${pct(col)}% ${pct(row)}%`,
        backgroundRepeat: "no-repeat",
        ...style
      }}
    />
  );
}

export function IconSprite({ icon, size = 40, className }: { icon: IconRef; size?: number | string; className?: string }) {
  return gridCell(SHEETS.icons[icon.sheet], 6, icon.index, size, className);
}

/** Item icon; seeds show a pouch with their crop badge. */
export function ItemIcon({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  const def = ITEMS[id];
  if (!def) return null;
  if (def.seedOf && ITEMS[def.seedOf]) {
    return (
      <span className={className} style={{ position: "relative", display: "inline-block", width: size, height: size }}>
        <IconSprite icon={def.icon} size={size} />
        <span style={{ position: "absolute", right: -2, bottom: -2 }}>
          <IconSprite icon={ITEMS[def.seedOf]!.icon} size={Math.round(size * 0.5)} />
        </span>
      </span>
    );
  }
  return <IconSprite icon={def.icon} size={size} className={className} />;
}

export function FarmSprite({ index, size, className, style }: { index: number; size: number | string; className?: string; style?: CSSProperties }) {
  return gridCell(SHEETS.farm, 6, index, size, className, style);
}

export function DungeonSprite({ index, size, className, style }: { index: number; size: number | string; className?: string; style?: CSSProperties }) {
  return gridCell(SHEETS.dungeon, 4, index, size, className, style);
}

const DIR_ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };

/** Chibi walker (4x4 sheet: rows down/left/right/up, 4-frame walk). */
export function Chibi({ sheet, dir, walking, size, className, style }: { sheet: string; dir: Dir; walking: boolean; size: number; className?: string; style?: CSSProperties }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!walking) return;
    const timer = window.setInterval(() => setTick((value) => (value + 1) % 4), 140);
    return () => window.clearInterval(timer);
  }, [walking]);
  const frame = walking ? tick : 0;
  const row = DIR_ROW[dir];
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
        backgroundImage: `url(${A(sheet)})`,
        backgroundSize: "400% 400%",
        backgroundPosition: `${(frame / 3) * 100}% ${(row / 3) * 100}%`,
        backgroundRepeat: "no-repeat",
        ...style
      }}
    />
  );
}
