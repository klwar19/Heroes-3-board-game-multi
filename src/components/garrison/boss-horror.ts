/**
 * Boss dread (drawing only): while a world boss (or the Dracolich) lives, the
 * world changes at once — colors drain toward the boss's own tone, a fine film
 * grain settles over the lawn, the edges darken with a faint red heartbeat —
 * and it eases back to normal over several seconds once the boss falls. The
 * ground trembles under its footsteps, ghost wisps / bone chips ride its moves,
 * and rarely (every half minute or so, and on its arrival) the picture breaks
 * into heavy static for a moment, with a quiet hiss. Nothing here touches the
 * simulation. With reduced motion the static, the tremble, the grain's crawl
 * and the wisps' sway are skipped.
 */

import { ENEMIES } from "@/engine/garrison/content";
import type { Enemy, GarrisonState } from "@/engine/garrison/sim";
import { prefersReducedMotion } from "@/lib/display-preferences";
import { playStaticHiss } from "@/lib/sound";
import { BOARD, feetY, tileX } from "./renderer";
import { WORLD_W, burst, drawGlow, type Particle } from "./scene";

type Wisp = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; seed: number };
type Slice = { y: number; h: number; dx: number };

const MAX_WISPS = 18;
const SLICES = 5;
/** The battle counts as paused once the simulation tick has stood still this long. */
const STILL_MS = 300;
const STEP_MS = 2400;
const STEP_SHAKE_MS = 240;
const GLITCH_MIN_GAP_MS = 1200;
/** The dread comes on this fast (a sudden change)... */
const RISE_MS = 450;
/** ...and the world eases back to normal this slowly once the boss falls. */
const FALL_MS = 6000;
/** Heavy static: rare (this far apart, plus up to STATIC_JITTER_MS), and brief. */
const STATIC_GAP_MS = 28000;
const STATIC_JITTER_MS = 17000;
const GRAIN_PX = 128;
const GRAIN_FRAMES = 3;

/**
 * Each boss's own tone (the hue the world drains toward while it lives).
 * Unlisted bosses (the Dracolich) take a cold night blue.
 */
const BOSS_TONE: Record<string, string> = {
  "oc-boss-abomination": "#8a1616",
  "oc-boss-wyrm": "#2a5c92",
  "oc-boss-lich": "#3c6e34",
  "oc-boss-warchief": "#8a4a16",
  "oc-boss-arachne": "#5a2a82",
  "oc-boss-barrow-king": "#6e1438",
  "oc-boss-gnawbone": "#7a6038",
  "oc-boss-mastermind": "#6e2418",
  "oc-boss-sphinx": "#6a447e"
};
const DEFAULT_TONE = "#2c3a5c";
const BONE = ["#ece4cc", "#d8cdb0", "#bfb293", "#f6f0dc"] as const;

export type Horror = {
  /** A boss was alive (and the battle running) last frame. */
  on: boolean;
  /** 0..1: how far the dread has faded in. */
  level: number;
  /** The boss's phase (0 fresh, 1 wounded, 2 enraged). */
  phase: number;
  /** Where the boss stood last frame (board px, feet): its fall still knows the spot. */
  x: number;
  y: number;
  lastTick: number;
  tickAt: number;
  reduced: boolean;
  reducedAt: number;
  glitchStart: number;
  glitchEnd: number;
  /** The glitch running is heavy static (the rare one), not a short flicker. */
  glitchBig: boolean;
  nextGlitch: number;
  /** The tone of the boss that brought the dread (kept while it fades). */
  tone: string;
  grain: HTMLCanvasElement[];
  grainCtx: CanvasRenderingContext2D | null;
  grainPats: CanvasPattern[];
  slicesAt: number;
  stepAt: number;
  nextStep: number;
  wisps: Wisp[];
  slices: Slice[];
  buf: HTMLCanvasElement | null;
  red: HTMLCanvasElement | null;
  gradCtx: CanvasRenderingContext2D | null;
  shade: CanvasGradient | null;
  blood: CanvasGradient | null;
  scanCtx: CanvasRenderingContext2D | null;
  scan: CanvasPattern | null;
};

export function createHorror(): Horror {
  const slices: Slice[] = [];
  for (let i = 0; i < SLICES; i += 1) slices.push({ y: 0, h: 0, dx: 0 });
  return {
    on: false, level: 0, phase: 0, x: BOARD.W / 2, y: BOARD.H / 2, lastTick: -1, tickAt: 0, reduced: false, reducedAt: -1e9,
    glitchStart: 0, glitchEnd: 0, glitchBig: false, nextGlitch: 0, slicesAt: 0, stepAt: -1e9, nextStep: 0,
    tone: DEFAULT_TONE, grain: [], grainCtx: null, grainPats: [],
    wisps: [], slices, buf: null, red: null, gradCtx: null, shade: null, blood: null, scanCtx: null, scan: null
  };
}

/** The reduced-motion preference, re-read about once a second (it builds a media query each time). */
function reduced(h: Horror, now: number): boolean {
  if (now - h.reducedAt > 1000 || now < h.reducedAt) {
    h.reducedAt = now;
    h.reduced = prefersReducedMotion();
  }
  return h.reduced;
}

/** The living boss of a running battle (never in the versus mode), or undefined. */
function liveBoss(s: GarrisonState): Enemy | undefined {
  if (s.cfg.mode === "versus" || s.outcome) return undefined;
  const id = s.warbossId ?? s.boss?.id;
  if (id === undefined) return undefined;
  for (const e of s.enemies) if (e.id === id) return e.dead ? undefined : e;
  return undefined;
}

/** Per frame, before drawing: fades the dread, keeps the boss's spot, times footsteps and glitches. */
export function updateHorror(h: Horror, s: GarrisonState, now: number, dt: number, shakeUntil: number, particles: Particle[]): void {
  if (s.tick !== h.lastTick) {
    h.lastTick = s.tick;
    h.tickAt = now;
  }
  const still = now - h.tickAt > STILL_MS;
  const boss = liveBoss(s);
  const calm = reduced(h, now);
  if (boss && !h.on) {
    h.nextGlitch = now + STATIC_GAP_MS + Math.random() * STATIC_JITTER_MS;
    h.nextStep = now + 1200;
  }
  h.on = !!boss;
  h.level = Math.max(0, Math.min(1, h.level + (boss ? dt / RISE_MS : -dt / FALL_MS)));
  if (!boss) return;
  h.tone = BOSS_TONE[boss.kind] ?? DEFAULT_TONE;
  h.x = tileX(boss.x);
  h.y = feetY(boss.lane);
  if (still) {
    // Paused (or held): nothing new comes due; the timers wait with the battle.
    h.nextGlitch += dt;
    h.nextStep += dt;
    return;
  }
  // Footsteps: only while it actually strides forward (not standing at its hold line, not flying).
  const walking = boss.state === "walk" && boss.x !== boss.px && !ENEMIES[boss.kind]?.flying;
  if (!walking) h.nextStep = Math.max(h.nextStep, now + 500);
  else if (now >= h.nextStep) {
    h.nextStep = now + STEP_MS;
    // A heavier shake already running is the step (one effect at a time).
    if (now >= shakeUntil) {
      if (!calm) h.stepAt = now;
      burst(particles, now, "dust", h.x - 10, h.y - 4, 3, { speed: 0.09, life: 750, size: 10, spread: 40, colors: ["rgba(120,105,85,0.7)", "rgba(90,80,70,0.6)"] });
    }
  }
  if (!calm && now >= h.nextGlitch && now >= h.glitchEnd) {
    if (now < shakeUntil || now - h.stepAt < STEP_SHAKE_MS) h.nextGlitch = now + 1500;
    else startGlitch(h, now, true);
  }
}

function startGlitch(h: Horror, now: number, big: boolean): void {
  h.glitchStart = now;
  h.glitchBig = big;
  h.glitchEnd = now + (big ? 480 + Math.random() * 240 : 120 + Math.random() * 100);
  h.slicesAt = -1e9;
  h.nextGlitch = h.glitchEnd + STATIC_GAP_MS + Math.random() * STATIC_JITTER_MS;
  if (big) playStaticHiss(h.glitchEnd - now);
}

/**
 * A glitch on cue: a short flicker (a phase's set piece), or the heavy static
 * (the boss arrives). Never overlapping, never back to back, and the rare
 * timed static waits its full gap again afterwards.
 */
export function horrorGlitch(h: Horror, now: number, big = false): void {
  if (reduced(h, now) || now < h.glitchEnd + GLITCH_MIN_GAP_MS) return;
  startGlitch(h, now, big);
}

/** The ground's tremble under a footstep (board px, vertical), 0 when still. */
export function horrorTremble(h: Horror, now: number): number {
  const t = (now - h.stepAt) / STEP_SHAKE_MS;
  if (t < 0 || t >= 1 || h.reduced) return 0;
  return (h.phase >= 2 ? 2.6 : 2) * (1 - t) * Math.sin(t * Math.PI * 5);
}

/** A few ghost wisps rising from around (x, y). */
export function spawnWisps(h: Horror, now: number, x: number, y: number, count: number, spread: number, flee = false): void {
  for (let i = 0; i < count && h.wisps.length < MAX_WISPS; i += 1) {
    const side = Math.random() - 0.5;
    h.wisps.push({
      x: x + side * spread, y: y - Math.random() * 20,
      vx: flee ? side * 0.12 : side * 0.02, vy: -(flee ? 0.07 + Math.random() * 0.05 : 0.035 + Math.random() * 0.03),
      born: now + i * (flee ? 60 : 140), life: 1500 + Math.random() * 900, size: 8 + Math.random() * 5, seed: Math.random() * 6.28
    });
  }
}

/** Pale bone chips flung from (x, y) (feet at `ground`). */
export function boneChips(h: Horror, particles: Particle[], now: number, x: number, y: number, ground: number, count = 9): void {
  const calm = h.reduced;
  burst(particles, now, "chip", x, y, calm ? Math.ceil(count / 2) : count, {
    speed: calm ? 0.18 : 0.42, up: calm ? 0.1 : 0.3, g: 0.0015, life: 850, size: 4.2, spread: 26, colors: BONE, ground
  });
}

/** The boss's wisps (after the particles and the dread, so they glow over the dark). */
export function drawWisps(ctx: CanvasRenderingContext2D, h: Horror, now: number): void {
  const list = h.wisps;
  if (!list.length) return;
  let keep = 0;
  ctx.save();
  for (let i = 0; i < list.length; i += 1) {
    const w = list[i]!;
    const age = now - w.born;
    if (age >= w.life) continue;
    list[keep] = w;
    keep += 1;
    if (age < 0) continue;
    const t = age / w.life;
    const a = Math.sin(Math.PI * t) * 0.5;
    const r = w.size * (0.85 + 0.3 * t);
    const sway = h.reduced ? 0 : Math.sin(age / 260 + w.seed) * 9;
    const x = w.x + w.vx * age + sway;
    const y = w.y + w.vy * age;
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, "rgba(160,215,255,0.85)", x, y + r * 0.6, r * 2.4);
    ctx.globalCompositeOperation = "source-over";
    // A shroud: round head, a wavering tail trailing below.
    const tail = h.reduced ? 0 : Math.sin(age / 170 + w.seed) * r * 0.9;
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = "#dceef6";
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0);
    ctx.quadraticCurveTo(x + r * 1.1, y + r * 1.7, x + tail, y + r * 3.3);
    ctx.quadraticCurveTo(x - r * 1.1, y + r * 1.7, x - r, y);
    ctx.fill();
    // Hollow eyes and a moaning mouth.
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = "#1c1424";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.36, y - r * 0.05, r * 0.17, r * 0.27, 0, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.36, y - r * 0.05, r * 0.17, r * 0.27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.6, r * 0.17, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  list.length = keep;
  ctx.restore();
}

/** The dread: dark edges and a faint red heartbeat (stronger when enraged), fading with the boss. */
export function drawDread(ctx: CanvasRenderingContext2D, h: Horror, now: number, camX: number): void {
  if (h.level <= 0.01) return;
  if (h.gradCtx !== ctx || !h.shade || !h.blood) {
    // Built once per context, around the origin; drawn squashed into an ellipse.
    h.gradCtx = ctx;
    h.shade = ctx.createRadialGradient(0, 0, 540, 0, 0, 840);
    h.shade.addColorStop(0, "rgba(6,0,8,0)");
    h.shade.addColorStop(0.55, "rgba(6,0,8,0.22)");
    h.shade.addColorStop(1, "rgba(6,0,8,0.55)");
    h.blood = ctx.createRadialGradient(0, 0, 600, 0, 0, 840);
    h.blood.addColorStop(0, "rgba(150,8,16,0)");
    h.blood.addColorStop(1, "rgba(160,10,20,0.4)");
  }
  const squash = 0.62;
  ctx.save();
  ctx.translate(camX + BOARD.W / 2, BOARD.H / 2);
  ctx.scale(1, squash);
  const hw = BOARD.W / 2 + 20;
  const hh = (BOARD.H / 2 + 20) / squash;
  ctx.globalAlpha = h.level * (h.phase >= 2 ? 1 : 0.85);
  ctx.fillStyle = h.shade;
  ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
  const beat = h.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / (h.phase >= 2 ? 330 : h.phase >= 1 ? 480 : 640));
  ctx.globalAlpha = h.level * (0.2 + 0.18 * Math.min(2, h.phase)) * beat;
  ctx.fillStyle = h.blood;
  ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
  ctx.restore();
}

/** A few frames of fine monochrome noise (built once), as patterns for this context. */
function grainPatterns(ctx: CanvasRenderingContext2D, h: Horror): CanvasPattern[] {
  if (h.grainCtx === ctx && h.grainPats.length === GRAIN_FRAMES) return h.grainPats;
  if (!h.grain.length && typeof document !== "undefined") {
    for (let f = 0; f < GRAIN_FRAMES; f += 1) {
      const c = document.createElement("canvas");
      c.width = GRAIN_PX;
      c.height = GRAIN_PX;
      const gctx = c.getContext("2d");
      if (!gctx) return [];
      const img = gctx.createImageData(GRAIN_PX, GRAIN_PX);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(Math.random() * 256);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      gctx.putImageData(img, 0, 0);
      h.grain.push(c);
    }
  }
  h.grainCtx = ctx;
  h.grainPats = [];
  for (const c of h.grain) {
    const pat = ctx.createPattern(c, "repeat");
    if (pat) h.grainPats.push(pat);
  }
  return h.grainPats;
}

/**
 * The atmosphere while a boss lives (world space, under the coins, floats and
 * boss bar so those stay crisp): the colors drain and lean toward the boss's
 * tone, the light dims a little, and a fine grain crawls over it all.
 */
export function drawGrade(ctx: CanvasRenderingContext2D, h: Horror, now: number, camX: number): void {
  const k = h.level;
  if (k <= 0.01) return;
  // Exactly the painted field in view (blend fills would tint any bare canvas a shake uncovers).
  const x = Math.max(0, camX);
  const y = 0;
  const w = Math.min(WORLD_W, camX + BOARD.W) - x;
  const hh = BOARD.H;
  if (w <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "saturation";
  ctx.globalAlpha = 0.45 * k;
  ctx.fillStyle = "#808080";
  ctx.fillRect(x, y, w, hh);
  ctx.globalCompositeOperation = "color";
  ctx.globalAlpha = 0.2 * k;
  ctx.fillStyle = h.tone;
  ctx.fillRect(x, y, w, hh);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.3 * k;
  ctx.fillStyle = "#7c7a86";
  ctx.fillRect(x, y, w, hh);
  const pats = grainPatterns(ctx, h);
  if (pats.length) {
    const frame = h.reduced ? 0 : Math.floor(now / 70) % pats.length;
    const ox = h.reduced ? 0 : Math.floor((now / 70) * 37) % GRAIN_PX;
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.07 * k;
    ctx.fillStyle = pats[frame]!;
    ctx.translate(x - ox, y);
    ctx.fillRect(ox, 0, w, hh);
  }
  ctx.restore();
}

function sized(canvas: HTMLCanvasElement | null, w: number, hgt: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = canvas ?? document.createElement("canvas");
  if (c.width !== w) c.width = w;
  if (c.height !== hgt) c.height = hgt;
  return c;
}

/**
 * The glitch, over the finished frame (device pixels): a few horizontal slices
 * knocked sideways with their red channel split off, scanlines and a little
 * static. Only during its ~0.2 s, and only then is the frame copied.
 */
export function drawGlitch(ctx: CanvasRenderingContext2D, h: Horror, now: number): void {
  if (now >= h.glitchEnd || now < h.glitchStart || h.reduced) return;
  const canvas = ctx.canvas;
  const cw = canvas.width;
  const ch = canvas.height;
  if (!cw || !ch) return;
  h.buf = sized(h.buf, cw, ch);
  h.red = sized(h.red, cw, ch);
  const bctx = h.buf?.getContext("2d");
  const rctx = h.red?.getContext("2d");
  if (!h.buf || !h.red || !bctx || !rctx) return;
  bctx.globalCompositeOperation = "copy";
  bctx.drawImage(canvas, 0, 0);
  rctx.globalCompositeOperation = "copy";
  rctx.drawImage(canvas, 0, 0);
  rctx.globalCompositeOperation = "multiply";
  rctx.fillStyle = "#ff0000";
  rctx.fillRect(0, 0, cw, ch);
  if (now - h.slicesAt > 45) {
    h.slicesAt = now;
    for (const sl of h.slices) {
      sl.y = Math.floor(Math.random() * ch * 0.95);
      sl.h = Math.max(2, Math.min(ch - sl.y, Math.floor(ch * (0.015 + Math.random() * 0.07))));
      sl.dx = Math.round((Math.random() - 0.5) * cw * 0.04);
    }
  }
  const t = (now - h.glitchStart) / Math.max(1, h.glitchEnd - h.glitchStart);
  const env = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  const split = Math.max(2, Math.round(cw * 0.004 * (0.6 + env)));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  for (const sl of h.slices) {
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(h.buf, 0, sl.y, cw, sl.h, sl.dx, sl.y, cw, sl.h);
    // Strip the band's red, then lay the red back a few pixels off: a red/cyan split.
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#00ffff";
    ctx.fillRect(0, sl.y, cw, sl.h);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(h.red, 0, sl.y, cw, sl.h, sl.dx + split, sl.y, cw, sl.h);
  }
  ctx.globalCompositeOperation = "source-over";
  if (h.scanCtx !== ctx || !h.scan) {
    const tile = sized(null, 1, 3);
    const tctx = tile?.getContext("2d");
    if (tile && tctx) {
      tctx.fillStyle = "rgba(0,0,0,1)";
      tctx.fillRect(0, 0, 1, 1);
      h.scan = ctx.createPattern(tile, "repeat");
      h.scanCtx = ctx;
    }
  }
  if (h.scan) {
    ctx.globalAlpha = 0.16 * env;
    ctx.fillStyle = h.scan;
    ctx.fillRect(0, 0, cw, ch);
  }
  // A little static.
  ctx.globalAlpha = 0.22 * env;
  ctx.fillStyle = "#e8e8f0";
  for (let i = 0; i < 7; i += 1) {
    ctx.fillRect(Math.random() * cw, Math.random() * ch, cw * (0.01 + Math.random() * 0.04), Math.max(1, ch * 0.003));
  }
  if (h.glitchBig) {
    // Heavy static: the picture dims under a full field of snow, and a dark band rolls down it.
    ctx.globalAlpha = 0.28 * env;
    ctx.fillStyle = "#06040a";
    ctx.fillRect(0, 0, cw, ch);
    const pats = grainPatterns(ctx, h);
    if (pats.length) {
      ctx.globalAlpha = 0.42 * env;
      ctx.fillStyle = pats[Math.floor(Math.random() * pats.length)]!;
      const scale = Math.max(1, Math.round(cw / 900));
      ctx.translate(-Math.random() * GRAIN_PX, -Math.random() * GRAIN_PX);
      ctx.scale(scale, scale);
      ctx.fillRect(0, 0, cw / scale + GRAIN_PX, ch / scale + GRAIN_PX);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const band = ch * 0.12;
    const by = ((t * 1.6) % 1) * (ch + band) - band;
    ctx.globalAlpha = 0.35 * env;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, by, cw, band);
  }
  ctx.restore();
}

/** The boss's set-piece tremor (its interlude begins): one small footstep-sized shudder. */
export function horrorTremor(h: Horror, now: number): void {
  if (!reduced(h, now)) h.stepAt = now;
}

/**
 * A world boss winding up a phase's set piece can't be harmed: a slow dark-red
 * rune circle at its feet and a faint shimmering ward around its body.
 */
export function drawWard(ctx: CanvasRenderingContext2D, s: GarrisonState, h: Horror, now: number): void {
  const boss = liveBoss(s);
  if (!boss || !boss.interlude) return;
  const x = tileX(boss.x);
  const y = feetY(boss.lane);
  const calm = h.reduced;
  const pulse = calm ? 0.6 : 0.5 + 0.5 * Math.sin(now / 210);
  const spin = calm ? 0 : now / 2600;
  ctx.save();
  // The rune circle on the ground.
  ctx.translate(x, y - 4);
  ctx.scale(1, 0.32);
  ctx.globalAlpha = 0.55 + 0.3 * pulse;
  ctx.strokeStyle = "#b0182a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 10]);
  ctx.lineDashOffset = -spin * 160;
  ctx.beginPath();
  ctx.arc(0, 0, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // Runes: short spokes turning slowly round the ring.
  ctx.strokeStyle = "#ff5a48";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = spin + (i * Math.PI) / 4;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    ctx.moveTo(c * 100, sn * 100);
    ctx.lineTo(c * 110, sn * 110);
    ctx.moveTo(c * 104 - sn * 6, sn * 104 + c * 6);
    ctx.lineTo(c * 104 + sn * 6, sn * 104 - c * 6);
  }
  ctx.stroke();
  ctx.restore();
  // The ward: a faint red shell around the body, its rim shimmering.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.1 + 0.08 * pulse;
  ctx.fillStyle = "#c0203a";
  ctx.beginPath();
  ctx.ellipse(x, y - 95, 92, 118, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35 + 0.35 * pulse;
  ctx.strokeStyle = "#ff7a6a";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([22, 14]);
  ctx.lineDashOffset = spin * 90;
  ctx.beginPath();
  ctx.ellipse(x, y - 95, 92, 118, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
