"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type WheelEvent as ReactWheelEvent } from "react";
import { HEX_IDLE_FIDGET_CHANCE, HEX_IDLE_FRAME_MS, creatureHasFidget, creatureIdleFrameMs } from "@/data/battle-hex/creature-sprites";
import type { BattleUnit, FxId, ProjectileId, SkillSprite } from "../engine/types";
import type { Biome } from "../data/battlefields";
import { colRow } from "../engine/hex";
import { cellsAt } from "../engine/footprint";
import { BATTLE_ICONS, FX_SHEET, HILL_TEXTURE, PROJECTILE_SHEET } from "./assets";
import { G, SpriteClip, atlasFor, footOf, preloadSheets, type Atlas } from "./sprites";
import s from "./restia.module.css";

/**
 * Battle board geometry and the pieces drawn on it: hills, unit figures with
 * path motion, projectiles, effects, pan/zoom. Board size follows the battle
 * (small 11x7 up to 19x11); the painted battlefield covers the whole field.
 */

export const HEX_W = 44;
export const HEX_H = 52;
export const ROW_STEP = 42;
export const FOOT = 12;
/** Pixels each level of ground height raises a hex (and whoever stands on it). */
export const LIFT = 20;
/** Size of the battlefield paintings. */
const ART_W = 800;
const ART_H = 556;

export type BoardLayout = {
  cols: number;
  rows: number;
  width: number;
  height: number;
  left: number;
  top: number;
  /** Where the painting sits (cover-fitted, ground aligned to the bottom). */
  art: { w: number; h: number; x: number; y: number };
};

export function boardLayout(cols: number, rows: number): BoardLayout {
  const gridW = cols * HEX_W + HEX_W / 2;
  const gridH = (rows - 1) * ROW_STEP + HEX_H;
  const top = 186;
  const width = Math.max(ART_W, gridW + 60);
  const height = Math.max(ART_H, top + gridH + 56);
  const k = Math.max(width / ART_W, height / ART_H);
  const w = ART_W * k;
  const h = ART_H * k;
  return { cols, rows, width, height, left: (width - gridW) / 2, top, art: { w, h, x: (width - w) / 2, y: height - h } };
}

export function hexCenter(L: BoardLayout, cell: number): { x: number; y: number } {
  const { col, row } = colRow(cell);
  return { x: L.left + col * HEX_W + (row & 1 ? HEX_W / 2 : 0) + HEX_W / 2, y: L.top + row * ROW_STEP + HEX_H / 2 };
}

export function hexPoints(L: BoardLayout, cell: number): string {
  const { x, y } = hexCenter(L, cell);
  const w = HEX_W / 2;
  return [
    [x, y - 26],
    [x + w, y - 16],
    [x + w, y + 16],
    [x, y + 26],
    [x - w, y + 16],
    [x - w, y - 16]
  ]
    .map(([px, py]) => `${px},${py}`)
    .join(" ");
}

/** Stacking order: each board row draws over the rows behind it (hill fronts hide what stands behind). */
export function rowZ(row: number): number {
  return 20 + row * 20;
}

/** Skill-sheet animation rows (main characters' "-sk" atlases). */
export const SKILL_GROUP: Record<SkillSprite, number> = { victory: 20, jump: 21, skillA: 22, skillB: 23 };

/** Cliff textures by biome (battle/terrain/<set>-side.webp) and tints while they load. */
const HILL_SET: Record<Biome, { set: string; top: string; side: string; lip: string }> = {
  meadow: { set: "grass", top: "#5d8f3e", side: "#6e4c2e", lip: "#4f7d2f" },
  frost: { set: "snow", top: "#dfe9f2", side: "#5f6f80", lip: "#eef4fa" },
  village: { set: "snow", top: "#dfe9f2", side: "#5f6f80", lip: "#eef4fa" },
  cellar: { set: "stone", top: "#77706a", side: "#56504b", lip: "#8a847d" },
  nave: { set: "stone", top: "#8a8a92", side: "#5d5d66", lip: "#a0a0a8" },
  cloister: { set: "stone", top: "#6f7a78", side: "#4e5856", lip: "#86918f" },
  ember: { set: "ash", top: "#3b3431", side: "#2a2220", lip: "#4a403c" },
  rift: { set: "rift", top: "#3d2c52", side: "#2a1d3b", lip: "#4b3764" }
};

/**
 * A raised hex: its own patch of the painted ground lifted by its height (so a
 * plateau reads as the ground itself, rising) over a shaded cliff with a turf
 * or snow lip. Crags (height 3+) are bare rock. Height changes slide.
 */
export function HillColumn({ L, cell, height, biome, backdrop }: { L: BoardLayout; cell: number; height: number; biome: Biome; backdrop: string }) {
  const c = hexCenter(L, cell);
  const lift = height * LIFT;
  const look = HILL_SET[biome];
  const left = c.x - HEX_W / 2;
  const top = c.y - HEX_H / 2;
  const crag = height >= 3;
  const side = HILL_TEXTURE(look.set, "side");
  return (
    <div aria-hidden className={s.hill} style={{ left, top: top - lift, height: HEX_H + lift, zIndex: rowZ(colRow(cell).row) + 1, opacity: height > 0 ? 1 : 0 }}>
      <div
        className={s.hillSide}
        style={{
          height: lift + 10,
          backgroundColor: look.side,
          backgroundImage: `linear-gradient(90deg, rgba(255, 244, 220, 0.14) 0 50%, rgba(0, 0, 0, 0.28) 50% 100%), linear-gradient(rgba(0, 0, 0, 0) 35%, rgba(0, 0, 0, 0.5)), url(${side})`,
          backgroundPosition: `0 0, 0 0, ${-left}px ${-top}px`
        }}
      />
      {crag ? null : <div className={s.hillLip} style={{ backgroundColor: look.lip }} />}
      <div
        className={s.hillTop}
        style={
          crag
            ? { backgroundColor: look.side, backgroundImage: `radial-gradient(circle at 40% 35%, rgba(255, 255, 255, 0.25), rgba(0, 0, 0, 0.35)), url(${side})`, backgroundSize: "100% 100%, 96px 96px" }
            : {
                backgroundColor: look.top,
                backgroundImage: `url(${backdrop})`,
                backgroundSize: `${L.art.w}px ${L.art.h}px`,
                // The ground that was under this hex, carried up with it.
                backgroundPosition: `${L.art.x - left}px ${L.art.y - top}px`,
                filter: `brightness(${1.04 + 0.05 * height}) saturate(1.05)`
              }
        }
      />
    </div>
  );
}

/** One frame of a 4x4 sheet. */
export function SheetFrame({ sheet, frame, size, style, cols = 4, rows = 4 }: { sheet: string; frame: number; size: number; style?: CSSProperties; cols?: number; rows?: number }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        width: size,
        height: size,
        backgroundImage: `url(${sheet})`,
        backgroundSize: `${size * cols}px ${size * rows}px`,
        backgroundPosition: `${-(frame % cols) * size}px ${-Math.floor(frame / cols) * size}px`,
        pointerEvents: "none",
        ...style
      }}
    />
  );
}

/** Action-bar icons (ui/battle-icons.webp, 4x4). */
export const ICON = {
  attack: 0,
  move: 1,
  skills: 2,
  items: 3,
  sprint: 4,
  defend: 5,
  wait: 6,
  flee: 7,
  charge: 8,
  befriend: 9,
  rush: 10,
  endTurn: 11,
  leap: 12,
  terrain: 13,
  dash: 14,
  hook: 15
} as const;

export function ActionIcon({ icon, size = 22 }: { icon: number; size?: number }) {
  return (
    <span
      aria-hidden
      className={s.actionIcon}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${BATTLE_ICONS})`,
        backgroundSize: `${size * 4}px ${size * 4}px`,
        backgroundPosition: `${-(icon % 4) * size}px ${-Math.floor(icon / 4) * size}px`
      }}
    />
  );
}

/** Plays a 16-frame additive effect once (frames stepped on requestAnimationFrame). */
export function FxBurst({ fx, x, y, size }: { fx: FxId; x: number; y: number; size: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const frame = Math.min(15, Math.floor((now - start) / 34));
      element.style.backgroundPosition = `${-(frame % 4) * size}px ${-Math.floor(frame / 4) * size}px`;
      element.style.opacity = frame >= 15 ? "0" : "1";
      if (frame < 15) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [size]);
  return (
    <span
      aria-hidden
      ref={ref}
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        backgroundImage: `url(${FX_SHEET(fx)})`,
        backgroundSize: `${size * 4}px ${size * 4}px`,
        mixBlendMode: "screen",
        zIndex: 420,
        pointerEvents: "none"
      }}
    />
  );
}

/** A projectile flying between two points: bolts and rocks arc, magic flies straight. */
export function Projectile({ sprite, from, to, ms }: { sprite: ProjectileId; from: { x: number; y: number }; to: { x: number; y: number }; ms: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const size = 72;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const arc = sprite === "arrow" || sprite === "rock" || sprite === "card" ? Math.min(90, Math.hypot(dx, dy) * 0.22) : 0;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = dx * t;
      const y = dy * t - 4 * arc * t * (1 - t);
      // Point along the tangent of the arc.
      const angle = Math.atan2(dy - 4 * arc * (1 - 2 * t), dx);
      frames.push({ transform: `translate(${x}px, ${y}px) rotate(${angle}rad)`, offset: t });
    }
    const animation = element.animate(frames, { duration: ms, easing: "linear", fill: "forwards" });
    let frame = 0;
    const timer = window.setInterval(() => {
      frame = (frame + 1) % 16;
      const inner = element.firstElementChild as HTMLElement | null;
      if (inner) inner.style.backgroundPosition = `${-(frame % 4) * size}px ${-Math.floor(frame / 4) * size}px`;
    }, 40);
    return () => {
      animation.cancel();
      window.clearInterval(timer);
    };
  }, [from.x, from.y, to.x, to.y, ms, sprite]);
  return (
    <span ref={ref} style={{ position: "absolute", left: from.x, top: from.y - 26, width: 0, height: 0, zIndex: 430, pointerEvents: "none", mixBlendMode: "screen" }}>
      <span style={{ position: "absolute", left: -size / 2, top: -size / 2, width: size, height: size, backgroundImage: `url(${PROJECTILE_SHEET(sprite)})`, backgroundSize: `${size * 4}px ${size * 4}px` }} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Unit figures
// ---------------------------------------------------------------------------

/**
 * `fallback`: the group to play when the unit has no skill sheet for `group`.
 * `at`: when it started (performance.now()), so turning mid-walk keeps the stride.
 */
export type Clip = { group: number; key: number; loop: boolean; fallback?: number; fps?: number; at?: number };

/**
 * A figure's movement: a walk or shove along hexes, a leap through the air, or a
 * lunge toward a hex and back. Drawn with the Web Animations API from the
 * figure's settled spot, so it glides at a steady pace with no per-hex stops.
 */
export type Motion = { key: number; kind: "walk" | "knock" | "leap" | "lunge" | "recoil" | "blink"; cells: number[]; ms: number };

/** Where a unit's figure stands with its head on `head`: the middle of its footprint, raised by the ground. */
export type PointOf = (unit: BattleUnit, head: number) => { x: number; y: number; row: number };

export function footprintPoint(L: BoardLayout, unit: BattleUnit, head: number, height: (cell: number) => number): { x: number; y: number; row: number } {
  const cells = cellsAt(unit, head);
  let x = 0;
  let y = 0;
  for (const cell of cells) {
    const c = hexCenter(L, cell);
    x += c.x;
    y += c.y;
  }
  return { x: x / cells.length, y: y / cells.length - height(head) * LIFT, row: colRow(head).row };
}

/** `body`: arcs with hops and leaps; `stack`: also re-stacks by row as it goes (the figure itself). */
function motionFrames(motion: Motion, unit: BattleUnit, point: PointOf, end: { x: number; y: number }, body: boolean, stack: boolean): { frames: Keyframe[]; easing: string } {
  const at = (cell: number) => {
    const p = point(unit, cell);
    return { x: p.x - end.x, y: p.y - end.y, z: rowZ(p.row) + 15 };
  };
  const frames: Keyframe[] = [];
  const move = (x: number, y: number, z: number, offset: number, easing?: string): Keyframe => ({
    transform: `translate(${x}px, ${y}px)`,
    ...(stack ? { zIndex: String(z) } : {}),
    offset,
    ...(easing ? { easing } : {})
  });
  if (motion.kind === "leap") {
    const a = at(motion.cells[0]!);
    const b = at(motion.cells[motion.cells.length - 1]!);
    const apex = Math.min(a.y, b.y) - 60 - Math.abs(a.x - b.x) * 0.12;
    frames.push(move(a.x, a.y, a.z, 0, "cubic-bezier(0.2, 0.6, 0.4, 1)"));
    frames.push(move((a.x + b.x) / 2, body ? apex : (a.y + b.y) / 2, Math.max(a.z, b.z), 0.5, "cubic-bezier(0.6, 0, 0.8, 0.4)"));
    frames.push(move(b.x, b.y, b.z, 1));
    return { frames, easing: "linear" };
  }
  if (motion.kind === "blink") {
    // Vanish where it stood, appear where it lands.
    const a = at(motion.cells[0]!);
    const b = at(motion.cells[motion.cells.length - 1]!);
    frames.push({ ...move(a.x, a.y, a.z, 0), opacity: 1 });
    frames.push({ ...move(a.x, a.y - 6, a.z, 0.42), opacity: 0 });
    frames.push({ ...move(b.x, b.y - 6, b.z, 0.58), opacity: 0 });
    frames.push({ ...move(b.x, b.y, b.z, 1), opacity: 1 });
    return { frames, easing: "ease-in-out" };
  }
  if (motion.kind === "lunge" || motion.kind === "recoil") {
    const home = at(motion.cells[0]!);
    const toward = at(motion.cells[1] ?? motion.cells[0]!);
    const length = Math.hypot(toward.x - home.x, toward.y - home.y) || 1;
    // A lunge leans in at the target; a recoil or dodge leans away from the attacker.
    const push = motion.kind === "recoil" ? (body ? -9 : -5) : body ? 16 : 10;
    const lx = home.x + ((toward.x - home.x) / length) * push;
    const ly = home.y + ((toward.y - home.y) / length) * push;
    frames.push(move(home.x, home.y, home.z, 0, "cubic-bezier(0.3, 0, 0.2, 1)"));
    frames.push(move(lx, ly, home.z, 0.4, "cubic-bezier(0.4, 0, 0.6, 1)"));
    frames.push(move(home.x, home.y, home.z, 1));
    return { frames, easing: "linear" };
  }
  const steps = motion.cells.length - 1;
  motion.cells.forEach((cell, index) => {
    const p = at(cell);
    frames.push(move(p.x, p.y, p.z, index / Math.max(1, steps)));
    const next = motion.cells[index + 1];
    if (next === undefined || !body || motion.kind !== "walk") return;
    // Stepping up or down a level is a little hop.
    const q = at(next);
    if (Math.abs(q.y - p.y) > LIFT / 2) frames.push(move((p.x + q.x) / 2, Math.min(p.y, q.y) - 14, Math.max(p.z, q.z), (index + 0.5) / steps));
  });
  return { frames, easing: "linear" };
}

/** Which way a figure is drawn: side view (mirrored for left), front three-quarter, or back three-quarter. */
export type Facing = { view: "side" | "front" | "back"; flip: boolean };

/** Extra-move rows of the main characters ("<atlas>-x"). */
export const EXTRA_GROUP = { fidget: 30, dodge: 31, getUp: 32, crit: 33, charge: 34, item: 35 } as const;

/** A small stable number per unit, so idles start out of step with each other. */
function spread(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return hash;
}

/** The atlas that draws `group` for this unit and view (skill, extra and facing sheets), or null to use the fallback. */
function sheetFor(unit: BattleUnit, group: number, view: Facing["view"]): Atlas | null {
  const has = (atlas: Atlas | null) => (atlas?.groups[String(group)] ? atlas : null);
  if (group >= EXTRA_GROUP.fidget) return has(atlasFor(`${unit.sprite}-x`));
  if (group >= SKILL_GROUP.victory) return has(atlasFor(`${unit.sprite}-sk`));
  if (view !== "side") return has(atlasFor(`${unit.sprite}-${view}`));
  return atlasFor(unit.sprite);
}

export function UnitSprite({
  unit,
  head,
  point,
  clip,
  motion,
  flash,
  facing,
  dead,
  active,
  celebrate,
  badge
}: {
  unit: BattleUnit;
  head: number;
  point: PointOf;
  clip?: Clip;
  motion?: Motion;
  flash?: number;
  facing?: Facing;
  dead: boolean;
  active: boolean;
  celebrate: boolean;
  badge: string | null;
}) {
  const bodyRef = useRef<HTMLSpanElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const barsRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const spriteRef = useRef<HTMLSpanElement>(null);
  const breathRef = useRef<HTMLSpanElement>(null);
  const spot = point(unit, head);
  const pointRef = useRef(point);
  pointRef.current = point;
  const offset = spread(unit.uid);
  // Codex-drawn sheets (the Restia cast) idle on one clean frame with a breathing
  // tween; Heroes 3 creatures loop their standing row at their own PC pace.
  const tweened = unit.sprite.startsWith("restia-");
  const side = atlasFor(unit.sprite);
  const idleMs = creatureIdleFrameMs({ slug: unit.sprite });
  const [idleClip, setIdleClip] = useState<{ group: number; key: number } | null>(null);
  const busyRef = useRef(false);
  busyRef.current = !!clip || !!motion || dead || !!idleClip;
  useEffect(() => preloadSheets(unit.sprite), [unit.sprite]);

  // Getting back up after being knocked DOWN.
  const wasDown = useRef(unit.down);
  useEffect(() => {
    if (wasDown.current && !unit.down && !dead && sheetFor(unit, EXTRA_GROUP.getUp, "side")) setIdleClip({ group: EXTRA_GROUP.getUp, key: Date.now() });
    wasDown.current = unit.down;
  }, [unit, unit.down, dead]);

  // Now and then an idle character fidgets.
  const canFidget = tweened && !!sheetFor(unit, EXTRA_GROUP.fidget, "side");
  useEffect(() => {
    if (!canFidget) return;
    let timer = 0;
    const plan = () => {
      timer = window.setTimeout(() => {
        if (!busyRef.current) setIdleClip({ group: EXTRA_GROUP.fidget, key: Date.now() });
        plan();
      }, 7000 + ((offset % 7000) + Math.random() * 6000));
    };
    plan();
    return () => window.clearTimeout(timer);
  }, [canFidget, offset]);
  // A creature's own fidget row, sometimes, when its standing loop comes round.
  const creatureFidget = !tweened && !!side?.groups["1"] && creatureHasFidget({ slug: unit.sprite });
  const onIdleLoop = creatureFidget
    ? () => {
        if (!busyRef.current && Math.random() < HEX_IDLE_FIDGET_CHANCE) setIdleClip({ group: 1, key: Date.now() });
      }
    : undefined;

  useLayoutEffect(() => {
    if (!motion) return;
    const end = pointRef.current(unit, head);
    const running: Animation[] = [];
    for (const [ref, body, stack] of [
      [bodyRef, true, true],
      [barsRef, true, false],
      [badgeRef, true, false],
      [shadowRef, false, false]
    ] as const) {
      const element = ref.current;
      if (!element) continue;
      const { frames, easing } = motionFrames(motion, unit, pointRef.current, end, body, stack);
      running.push(element.animate(frames, { duration: motion.ms, easing }));
    }
    return () => running.forEach((animation) => animation.cancel());
    // A motion plays once per key; the settled spot is read when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion?.key]);

  useLayoutEffect(() => {
    const element = spriteRef.current;
    if (!flash || !element) return;
    const animation = element.animate([{ filter: "brightness(1)" }, { filter: "brightness(2.3) saturate(0.4)", offset: 0.25 }, { filter: "brightness(1)" }], { duration: 300, easing: "ease-out" });
    return () => animation.cancel();
  }, [flash]);

  if (unit.gone) return null;
  const view = facing?.view ?? "side";
  const flip = facing ? facing.flip : unit.facing === "left";
  const scale = unit.scale;
  const cheer = celebrate && !dead && !clip && !!sheetFor(unit, SKILL_GROUP.victory, "side");
  const lying = !dead && !clip && !idleClip && unit.down && !!sheetFor(unit, EXTRA_GROUP.getUp, "side");
  let group: number = G.standing;
  let loop = true;
  let hold: number | undefined;
  let fps = 1000 / idleMs;
  let key: string | number = "idle";
  let onEnd: (() => void) | undefined;
  if (dead) {
    group = G.death;
    loop = false;
    fps = 12;
    key = "dead";
  } else if (clip) {
    group = clip.group;
    loop = clip.loop;
    fps = clip.fps ?? 10;
    key = clip.key;
  } else if (idleClip) {
    group = idleClip.group;
    loop = false;
    fps = idleClip.group === 1 ? 1000 / HEX_IDLE_FRAME_MS : 10;
    key = `i${idleClip.key}`;
    onEnd = () => window.setTimeout(() => setIdleClip((current) => (current?.key === idleClip.key ? null : current)), 120);
  } else if (lying) {
    group = EXTRA_GROUP.getUp;
    hold = 0;
    key = "down";
  } else if (cheer) {
    group = SKILL_GROUP.victory;
    loop = false;
    fps = 10;
    key = "victory";
  } else if (tweened) {
    hold = 0;
  }
  // Pick the sheet; rows it lacks fall back (skill and extra rows to their H3 group, facing sheets to side view).
  let atlas = sheetFor(unit, group, dead ? "side" : view);
  if (!atlas) {
    if (group >= EXTRA_GROUP.fidget) group = group === EXTRA_GROUP.dodge ? G.defend : group === EXTRA_GROUP.crit ? G.attack : group === EXTRA_GROUP.charge || group === EXTRA_GROUP.item ? G.cast : G.standing;
    else if (group >= SKILL_GROUP.victory) group = clip?.fallback ?? G.standing;
    atlas = view !== "side" && !dead ? sheetFor(unit, group, view) ?? side : side;
  }
  const breathing = !dead && !clip && !idleClip && !lying && !cheer && tweened;
  const z = rowZ(spot.row) + (dead ? 10 : 15);
  const wide = !!unit.wide;
  const shadowW = (wide ? 70 : 40) * scale;
  const maxHp = unit.stats.maxHp;
  const left = atlas ? spot.x - (flip ? atlas.frameWidth - atlas.anchorX : atlas.anchorX) * scale : spot.x - 20;
  // Each row stands on its own measured ground line, so no pose floats above the hex.
  const top = atlas ? spot.y + FOOT - footOf(atlas, group) * scale : spot.y - 40;
  return (
    <>
      <span className={s.unitShadow} ref={shadowRef} style={{ left: spot.x - shadowW / 2, top: spot.y + FOOT - 6, width: shadowW, height: 12, zIndex: z - 1 }} />
      <span className={s.unit} ref={bodyRef} style={{ left, top, zIndex: z, filter: active ? "drop-shadow(0 0 4px #ffd36a)" : unit.shield > 0 && !dead ? "drop-shadow(0 0 3px #6fe3ff)" : undefined }}>
        <span ref={spriteRef} style={{ display: "block" }}>
          <Breath active={breathing} period={1900 + (offset % 700)} spanRef={breathRef}>
            {atlas ? (
              <SpriteClip
                atlas={atlas}
                clipKey={key}
                flip={flip}
                fps={fps}
                group={group}
                hold={hold}
                loop={loop}
                onEnd={onEnd}
                onLoop={onIdleLoop}
                phase={key === "idle" ? offset % 2000 : 0}
                scale={scale}
                since={clip ? clip.at : undefined}
              />
            ) : null}
          </Breath>
        </span>
      </span>
      {!dead ? (
        <span className={s.unitBars} ref={barsRef} style={{ left: spot.x, top: spot.y + FOOT + 2, zIndex: 300 }}>
          <span className={s.barTrack}>
            <span className={unit.side === "ally" ? s.barFill : `${s.barFill} ${s.barHp}`} style={{ display: "block", width: `${(100 * unit.hp) / Math.max(1, maxHp)}%` }} />
          </span>
          {unit.shield > 0 ? (
            <span className={s.barTrack}>
              <span className={`${s.barFill} ${s.barShield}`} style={{ display: "block", width: `${Math.min(100, (100 * unit.shield) / Math.max(1, maxHp))}%` }} />
            </span>
          ) : null}
          {unit.side === "ally" && unit.stats.maxMp > 0 ? (
            <span className={s.barTrack}>
              <span className={`${s.barFill} ${s.barMp}`} style={{ display: "block", width: `${(100 * unit.mp) / Math.max(1, unit.stats.maxMp)}%` }} />
            </span>
          ) : null}
        </span>
      ) : null}
      {!dead && badge ? (
        <span className={`${s.unitBadge} ${unit.down ? s.badgeDown : s.badgeStatus}`} ref={badgeRef} style={{ left: spot.x, top: spot.y - 64 * scale, zIndex: 310 }}>
          {badge}
        </span>
      ) : null}
    </>
  );
}

/**
 * A soft, endless breathing tween (a hair taller and narrower, from the feet up)
 * for figures that idle on one clean frame. Runs on the compositor.
 */
function Breath({ active, period, spanRef, children }: { active: boolean; period: number; spanRef: RefObject<HTMLSpanElement | null>; children: ReactNode }) {
  useLayoutEffect(() => {
    const element = spanRef.current;
    if (!active || !element) return;
    const animation = element.animate([{ transform: "scale(1, 1)" }, { transform: "scale(0.994, 1.018)" }], {
      duration: period,
      iterations: Infinity,
      direction: "alternate",
      easing: "ease-in-out",
      delay: -(period * 0.37)
    });
    return () => animation.cancel();
  }, [active, period, spanRef]);
  return (
    <span ref={spanRef} style={{ display: "block", transformOrigin: "50% 100%" }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pan and zoom (mouse wheel, drag, pinch, buttons)
// ---------------------------------------------------------------------------

export type PanZoom = {
  transform: string;
  scale: number;
  zoom: number;
  zoomBy: (factor: number) => void;
  reset: () => void;
  /** Keep a board point in view (used to follow the acting unit when zoomed in). */
  follow: (x: number, y: number) => void;
  handlers: {
    onWheel: (event: ReactWheelEvent) => void;
    onPointerDown: (event: ReactPointerEvent) => void;
    onPointerMove: (event: ReactPointerEvent) => void;
    onPointerUp: (event: ReactPointerEvent) => void;
    onPointerCancel: (event: ReactPointerEvent) => void;
    onClickCapture: (event: ReactMouseEvent) => void;
  };
};

const MAX_ZOOM = 3;

/**
 * The field is fitted to the arena (zoom 1) and can be zoomed up to 3x and
 * dragged. A drag longer than a few pixels doesn't click the hex under it.
 */
export function usePanZoom(arenaRef: RefObject<HTMLDivElement | null>, width: number, height: number): PanZoom {
  const [box, setBox] = useState({ w: width, h: height });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; pinch: number | null; last: { x: number; y: number } | null }>({ moved: 0, pinch: null, last: null });
  /** Until when (performance.now) a click is the end of a drag or pinch, not a tap. */
  const suppressClick = useRef(0);

  useEffect(() => {
    const element = arenaRef.current;
    if (!element) return;
    // ResizeObserver reports the initial size too.
    const observer = new ResizeObserver(() => setBox({ w: element.clientWidth, h: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [arenaRef]);

  const fit = Math.min(box.w / width, box.h / height) || 1;
  const clampView = useCallback(
    (next: { zoom: number; x: number; y: number }) => {
      const zoom = Math.max(1, Math.min(MAX_ZOOM, next.zoom));
      const w = width * fit * zoom;
      const h = height * fit * zoom;
      const x = w <= box.w ? (box.w - w) / 2 : Math.min(0, Math.max(box.w - w, next.x));
      const y = h <= box.h ? (box.h - h) / 2 : Math.min(0, Math.max(box.h - h, next.y));
      return { zoom, x, y };
    },
    [box.h, box.w, fit, height, width]
  );
  const shown = clampView(view);

  /** Zoom by `factor` keeping the arena point (px, py) still. */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      setView((current) => {
        const base = clampView(current);
        const zoom = Math.max(1, Math.min(MAX_ZOOM, base.zoom * factor));
        const k = zoom / base.zoom;
        return clampView({ zoom, x: px - (px - base.x) * k, y: py - (py - base.y) * k });
      });
    },
    [clampView]
  );

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = arenaRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const handlers: PanZoom["handlers"] = {
    onWheel: (event) => {
      const p = local(event);
      zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    },
    onPointerDown: (event) => {
      pointers.current.set(event.pointerId, local(event));
      if (pointers.current.size === 1) gesture.current = { moved: 0, pinch: null, last: local(event) };
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    },
    onPointerMove: (event) => {
      if (!pointers.current.has(event.pointerId)) return;
      const p = local(event);
      pointers.current.set(event.pointerId, p);
      const g = gesture.current;
      if (pointers.current.size >= 2 && g.pinch) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        zoomAt(distance / g.pinch, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        g.pinch = distance;
        g.moved += 10;
        return;
      }
      if (!g.last) return;
      const dx = p.x - g.last.x;
      const dy = p.y - g.last.y;
      g.last = p;
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (g.moved > 6) {
        if (!arenaRef.current?.hasPointerCapture(event.pointerId)) arenaRef.current?.setPointerCapture(event.pointerId);
        setView((current) => clampView({ ...clampView(current), x: clampView(current).x + dx, y: clampView(current).y + dy }));
      }
    },
    onPointerUp: (event) => {
      pointers.current.delete(event.pointerId);
      // A mouse drag ends in a click right away; a touch drag or pinch ends in none.
      if (gesture.current.moved > 6) suppressClick.current = performance.now() + 400;
      if (pointers.current.size < 2) gesture.current.pinch = null;
      if (!pointers.current.size) gesture.current.last = null;
    },
    onPointerCancel: (event) => {
      pointers.current.delete(event.pointerId);
      gesture.current = { moved: 0, pinch: null, last: null };
    },
    onClickCapture: (event) => {
      // The click that ends a drag or pinch doesn't pick a hex.
      if (performance.now() > suppressClick.current) return;
      suppressClick.current = 0;
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const follow = useCallback(
    (x: number, y: number) => {
      setView((current) => {
        const base = clampView(current);
        if (base.zoom <= 1) return base;
        const scale = fit * base.zoom;
        const sx = base.x + x * scale;
        const sy = base.y + y * scale;
        const margin = 80;
        if (sx > margin && sx < box.w - margin && sy > margin && sy < box.h - margin) return base;
        return clampView({ ...base, x: box.w / 2 - x * scale, y: box.h / 2 - y * scale });
      });
    },
    [box.h, box.w, clampView, fit]
  );

  return {
    transform: `translate(${shown.x}px, ${shown.y}px) scale(${fit * shown.zoom})`,
    scale: fit * shown.zoom,
    zoom: shown.zoom,
    zoomBy: (factor) => zoomAt(factor, box.w / 2, box.h / 2),
    reset: () => setView({ zoom: 1, x: 0, y: 0 }),
    follow,
    handlers
  };
}

