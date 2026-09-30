/**
 * Ambient life on the lane-defence field, drawing only (never seen by the
 * simulation, so it may use Math.random): drifting cloud shadows, the mist the
 * horde marches out of, and per-terrain air life — butterflies and pollen on
 * the meadows, snowfall, fireflies and graveyard wisps, Bracada's sparkles,
 * Eeofol's embers and ash — plus the odd flock of birds on a clear day. Kept
 * to a few dozen cached-sprite draws a frame.
 */

import type { Terrain } from "@/engine/garrison/content";
import { WORLD_W, drawGlow } from "./scene";

type MoteKind = "butterfly" | "pollen" | "snow" | "firefly" | "wisp" | "spark" | "ember" | "ash" | "dust";

type Mote = { kind: MoteKind; x: number; y: number; vx: number; vy: number; phase: number; size: number; color: string };

type Bird = { x: number; y: number; phase: number; size: number };

export type Ambience = {
  terrain: Terrain | null;
  motes: Mote[];
  flock: { birds: Bird[]; vx: number } | null;
  nextFlockAt: number;
};

type Theme = {
  /** Soft cloud shadows sliding over the lawn (clear-sky terrains). */
  clouds: number;
  /** Mist colour on the staging ground the horde comes out of. */
  mist: string;
  /** Low ground fog bands across the lawn (alpha), or 0. */
  fog: number;
  fogColor?: string;
  motes: { kind: MoteKind; count: number; colors: string[] }[];
  birds: boolean;
};

const THEMES: Record<Terrain, Theme> = {
  grass: { clouds: 0.13, mist: "rgba(70,60,50,0.55)", fog: 0, birds: true,
    motes: [{ kind: "butterfly", count: 5, colors: ["#ffe46a", "#ffffff", "#9fd4ff", "#ffb04a"] }, { kind: "pollen", count: 16, colors: ["rgba(255,250,200,0.8)"] }] },
  snow: { clouds: 0.08, mist: "rgba(180,200,230,0.5)", fog: 0, birds: false,
    motes: [{ kind: "snow", count: 70, colors: ["rgba(255,255,255,0.9)", "rgba(225,238,255,0.8)"] }] },
  swamp: { clouds: 0.07, mist: "rgba(60,80,55,0.6)", fog: 0.16, fogColor: "rgba(170,200,170,0.5)", birds: false,
    motes: [{ kind: "firefly", count: 14, colors: ["rgba(220,255,120,0.95)"] }, { kind: "dust", count: 8, colors: ["rgba(200,220,180,0.5)"] }] },
  magic: { clouds: 0.1, mist: "rgba(90,70,140,0.5)", fog: 0, birds: true,
    motes: [{ kind: "spark", count: 22, colors: ["rgba(200,170,255,0.95)", "rgba(150,230,255,0.95)", "rgba(255,240,180,0.95)"] }] },
  rough: { clouds: 0.11, mist: "rgba(120,90,60,0.5)", fog: 0, birds: true,
    motes: [{ kind: "dust", count: 18, colors: ["rgba(220,190,140,0.55)", "rgba(180,150,110,0.5)"] }] },
  night: { clouds: 0, mist: "rgba(20,25,40,0.6)", fog: 0.1, fogColor: "rgba(120,140,190,0.45)", birds: false,
    motes: [{ kind: "firefly", count: 12, colors: ["rgba(140,230,255,0.9)"] }, { kind: "dust", count: 10, colors: ["rgba(180,190,210,0.4)"] }] },
  graveyard: { clouds: 0, mist: "rgba(40,50,60,0.65)", fog: 0.18, fogColor: "rgba(170,190,200,0.5)", birds: false,
    motes: [{ kind: "wisp", count: 9, colors: ["rgba(170,255,210,0.9)", "rgba(200,220,255,0.9)"] }] },
  cursed: { clouds: 0, mist: "rgba(50,20,60,0.65)", fog: 0.14, fogColor: "rgba(150,90,190,0.45)", birds: false,
    motes: [{ kind: "spark", count: 16, colors: ["rgba(210,120,255,0.9)", "rgba(120,255,200,0.8)"] }, { kind: "ash", count: 10, colors: ["rgba(60,40,70,0.7)"] }] },
  hell: { clouds: 0, mist: "rgba(70,15,5,0.6)", fog: 0, birds: false,
    motes: [{ kind: "ember", count: 30, colors: ["rgba(255,170,60,0.95)", "rgba(255,110,40,0.95)", "rgba(255,220,120,0.9)"] }, { kind: "ash", count: 14, colors: ["rgba(50,40,36,0.75)"] }] },
  lava: { clouds: 0, mist: "rgba(70,20,5,0.6)", fog: 0, birds: false,
    motes: [{ kind: "ember", count: 28, colors: ["rgba(255,170,60,0.95)", "rgba(255,120,40,0.95)"] }, { kind: "ash", count: 10, colors: ["rgba(60,50,45,0.7)"] }] }
};

export function createAmbience(): Ambience {
  return { terrain: null, motes: [], flock: null, nextFlockAt: 0 };
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function spawnMote(kind: MoteKind, colors: string[], h: number, anywhere: boolean): Mote {
  const color = colors[Math.floor(Math.random() * colors.length)] ?? "#fff";
  const x = rand(0, WORLD_W);
  switch (kind) {
    case "snow":
      return { kind, x, y: anywhere ? rand(-10, h) : -10, vx: rand(-8, 4), vy: rand(22, 48), phase: rand(0, 6.28), size: rand(1.4, 3.4), color };
    case "ember":
      return { kind, x, y: anywhere ? rand(0, h) : h + 10, vx: rand(-6, 10), vy: -rand(26, 60), phase: rand(0, 6.28), size: rand(1.2, 2.8), color };
    case "ash":
      return { kind, x, y: anywhere ? rand(-10, h) : -10, vx: rand(-10, 6), vy: rand(10, 22), phase: rand(0, 6.28), size: rand(1.5, 3), color };
    case "butterfly":
      return { kind, x, y: rand(80, h - 60), vx: rand(-22, 22), vy: 0, phase: rand(0, 6.28), size: rand(8, 11), color };
    case "dust":
      return { kind, x, y: rand(40, h - 20), vx: -rand(10, 26), vy: rand(-3, 3), phase: rand(0, 6.28), size: rand(1.2, 2.6), color };
    default:
      // pollen, fireflies, wisps, sparks: slow wanderers.
      return { kind, x, y: rand(50, h - 30), vx: rand(-8, 8), vy: rand(-5, 5), phase: rand(0, 6.28), size: kind === "wisp" ? rand(5, 8) : rand(1.5, 3), color };
  }
}

/** Rebuilds the motes when the terrain changes (a new level). */
function ensure(amb: Ambience, terrain: Terrain, h: number): Theme {
  const theme = THEMES[terrain] ?? THEMES.grass;
  if (amb.terrain !== terrain) {
    amb.terrain = terrain;
    amb.motes = theme.motes.flatMap((m) => Array.from({ length: m.count }, () => spawnMote(m.kind, m.colors, h, true)));
    amb.flock = null;
    amb.nextFlockAt = 0;
  }
  return theme;
}

/**
 * Under the units: cloud shadows over the lawn, low fog bands, and the mist
 * banked on the staging ground at the right edge.
 */
export function drawAmbientGround(ctx: CanvasRenderingContext2D, amb: Ambience, terrain: Terrain, w: number, h: number, now: number): void {
  const theme = ensure(amb, terrain, h);
  const t = now / 1000;
  if (theme.clouds > 0) {
    ctx.save();
    ctx.globalAlpha = theme.clouds;
    for (let i = 0; i < 3; i += 1) {
      const span = WORLD_W + 900;
      const cx = ((t * (9 + i * 3) + i * 710) % span) - 450;
      const cy = 140 + ((i * 197) % 380);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.55);
      drawGlow(ctx, "rgba(10,20,30,1)", 0, 0, 300 + i * 40);
      drawGlow(ctx, "rgba(10,20,30,1)", 170, 30, 190);
      ctx.restore();
    }
    ctx.restore();
  }
  if (theme.fog > 0 && theme.fogColor) {
    ctx.save();
    ctx.globalAlpha = theme.fog;
    for (let i = 0; i < 6; i += 1) {
      const span = WORLD_W + 800;
      const fx = ((t * (6 + (i % 3) * 3) + i * 330) % span) - 400;
      const fy = 90 + i * 100 + Math.sin(t * 0.3 + i) * 12;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(2.6, 0.45);
      drawGlow(ctx, theme.fogColor, 0, 0, 140);
      ctx.restore();
    }
    ctx.restore();
  }
  // The mist the horde marches out of, banked against the right edge of the view.
  ctx.save();
  for (let i = 0; i < 5; i += 1) {
    const my = 60 + i * 130 + Math.sin(t * 0.4 + i * 1.7) * 18;
    const mx = w - 40 + Math.sin(t * 0.25 + i) * 30;
    ctx.globalAlpha = 0.55 + 0.15 * Math.sin(t * 0.6 + i);
    ctx.save();
    ctx.translate(mx, my);
    ctx.scale(1.1, 0.8);
    drawGlow(ctx, theme.mist, 0, 0, 150);
    ctx.restore();
  }
  ctx.restore();
}

/** Above the units: drifting motes and, now and then, a flock crossing a clear sky. */
export function drawAmbientAir(ctx: CanvasRenderingContext2D, amb: Ambience, terrain: Terrain, w: number, h: number, now: number, dt: number): void {
  const theme = ensure(amb, terrain, h);
  const t = now / 1000;
  const step = Math.min(0.1, dt / 1000);
  ctx.save();
  for (let i = 0; i < amb.motes.length; i += 1) {
    const m = amb.motes[i]!;
    m.x += m.vx * step;
    m.y += m.vy * step;
    const wiggle = Math.sin(t * 1.6 + m.phase);
    switch (m.kind) {
      case "butterfly": {
        // Flits: speed wanders, it bobs, and turns back at the lawn's ends.
        m.vx += Math.sin(t * 0.7 + m.phase) * 6 * step;
        m.vx = Math.max(-30, Math.min(30, m.vx));
        m.y += Math.sin(t * 3 + m.phase) * 18 * step;
        if (m.x < 260 || m.x > w - 60) m.vx = Math.abs(m.vx) * (m.x < 260 ? 1 : -1);
        m.y = Math.max(70, Math.min(h - 40, m.y));
        const flap = Math.abs(Math.sin(t * 14 + m.phase));
        const dir = m.vx < 0 ? -1 : 1;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = m.color;
        ctx.strokeStyle = "rgba(40,25,10,0.55)";
        ctx.lineWidth = 0.8;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(m.x - dir * 1.5, m.y + side * m.size * 0.55 * flap, m.size * 0.75, Math.max(0.6, m.size * 0.7 * flap), side * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(40,25,10,0.9)";
        ctx.fillRect(m.x - m.size * 0.6, m.y - 0.8, m.size * 1.2, 1.6);
        continue;
      }
      case "snow":
      case "ash":
        m.x += wiggle * 10 * step;
        if (m.y > h + 10) Object.assign(m, spawnMote(m.kind, [m.color], h, false));
        break;
      case "ember":
        m.x += wiggle * 14 * step;
        if (m.y < -10) Object.assign(m, spawnMote(m.kind, [m.color], h, false));
        break;
      case "dust":
        if (m.x < -10) Object.assign(m, spawnMote(m.kind, [m.color], h, false), { x: WORLD_W + 10 });
        break;
      default:
        m.vx += Math.sin(t * 0.9 + m.phase * 3) * 4 * step;
        m.vy += Math.cos(t * 0.8 + m.phase * 2) * 4 * step;
        m.vx = Math.max(-12, Math.min(12, m.vx));
        m.vy = Math.max(-8, Math.min(8, m.vy));
        if (m.y < 40 || m.y > h - 20) m.vy = -m.vy;
    }
    if (m.x < -20) m.x = WORLD_W + 10;
    if (m.x > WORLD_W + 20) m.x = -10;
    if (m.kind === "firefly" || m.kind === "wisp" || m.kind === "spark" || m.kind === "ember") {
      const pulse = m.kind === "ember" ? 0.8 + 0.2 * wiggle : 0.35 + 0.65 * Math.max(0, Math.sin(t * (m.kind === "spark" ? 3.1 : 1.3) + m.phase));
      ctx.globalAlpha = pulse;
      ctx.globalCompositeOperation = "lighter";
      drawGlow(ctx, m.color, m.x, m.y, m.size * (m.kind === "wisp" ? 3.2 : 4));
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.globalAlpha = m.kind === "pollen" ? 0.5 + 0.3 * wiggle : 0.85;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  if (!theme.birds) return;
  if (!amb.flock && now > amb.nextFlockAt) {
    if (amb.nextFlockAt > 0) {
      const count = 3 + Math.floor(Math.random() * 4);
      const y0 = rand(18, 70);
      amb.flock = {
        vx: rand(70, 110),
        birds: Array.from({ length: count }, (_, i) => ({ x: -40 - i * 26 - Math.random() * 10, y: y0 + (i % 2 === 0 ? i : -i) * 5, phase: Math.random() * 6.28, size: rand(5, 8) }))
      };
    }
    amb.nextFlockAt = now + rand(14000, 30000);
  }
  if (amb.flock) {
    ctx.save();
    ctx.strokeStyle = "rgba(30,25,20,0.7)";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    let gone = true;
    for (const b of amb.flock.birds) {
      b.x += amb.flock.vx * step;
      if (b.x < w + 40) gone = false;
      const flap = Math.sin(t * 9 + b.phase) * b.size * 0.6;
      ctx.beginPath();
      ctx.moveTo(b.x - b.size, b.y - flap);
      ctx.quadraticCurveTo(b.x - b.size * 0.4, b.y - flap * 0.2, b.x, b.y);
      ctx.quadraticCurveTo(b.x + b.size * 0.4, b.y - flap * 0.2, b.x + b.size, b.y - flap);
      ctx.stroke();
    }
    ctx.restore();
    if (gone) amb.flock = null;
  }
}
