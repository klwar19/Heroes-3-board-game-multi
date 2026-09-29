/**
 * Garrison Wars scenery and juice, drawing only: the painted field
 * (forecourt, lawn, road and the Tide's staging ground beyond the board), the
 * keep the player holds, the lawn overlay, particles, scorch marks and the
 * spinning gold coins. Nothing here reads or changes game rules, and nothing
 * here needs to be deterministic (the simulation never sees it).
 */

import { GW_COLS, GW_LANES, TERRAINS, type Terrain } from "@/engine/garrison/content";
import { image, ready } from "./art";

/** World width: the 1400 px board plus the staging ground the level intro pans over. */
export const WORLD_W = 1760;

/** Cut-outs from the Garrison props sheet (tmp/gen/garrison2/scene/props.png). */
export const PROP = {
  coin: "/assets/garrison/ui/coin.webp",
  spade: "/assets/garrison/ui/spade.webp",
  head: "/assets/garrison/ui/head.webp",
  flag: "/assets/garrison/ui/flag.webp",
  pot: "/assets/garrison/ui/pot.webp",
  helm: "/assets/garrison/ui/helm.webp",
  coffin: "/assets/garrison/ui/coffin.webp",
  tome: "/assets/garrison/ui/tome.webp"
} as const;

/** A keep painting and the tips of its two flagpoles (fractions of the trimmed image). */
export type KeepArt = { src: string; poles: readonly { x: number; y: number }[] };

export const KEEPS = {
  stone: { src: "/assets/garrison/keep.webp", poles: [{ x: 0.354, y: 0.004 }, { x: 0.848, y: 0.05 }] },
  // The flags hang just below the spiked finials.
  doom: { src: "/assets/garrison/keep-doom.webp", poles: [{ x: 0.407, y: 0.03 }, { x: 0.715, y: 0.03 }] }
} satisfies Record<string, KeepArt>;

export const KEEP_SRC = KEEPS.stone.src;

/** The keep a garrison holds: Doom's hell citadel once it has loaded, the stone keep otherwise. */
export function keepFor(town: string): KeepArt {
  return town === "doom" && ready(image(KEEPS.doom.src)) ? KEEPS.doom : KEEPS.stone;
}

export type Geometry = { W: number; H: number; LAWN_X: number; TILE: number; TOP: number; LANE_H: number };

// ---------------------------------------------------------------------------
// Static scenery: composed once per match (and again as images finish loading)

export type Scenery = { canvas: HTMLCanvasElement | null; key: string };

export function createScenery(): Scenery {
  return { canvas: null, key: "" };
}

/** Deterministic hash noise for the dirt speckles (same lawn every redraw). */
function noise(i: number): number {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * The field, the lawn overlay and the keep as one world-sized bitmap
 * (WORLD_W x H at `dpr`), rebuilt whenever an image becomes ready or the
 * inputs change. The keep's flags wave, so they are drawn every frame (drawKeepFlags).
 */
export function sceneryLayer(sc: Scenery, geo: Geometry, terrain: Terrain, lanes: readonly number[], dpr: number, keepArt: KeepArt = KEEPS.stone): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const t = TERRAINS[terrain];
  const field = image(t.field);
  const fallback = image(t.backdrop);
  const keep = image(keepArt.src);
  const key = [terrain, lanes.join(","), dpr, ready(field), ready(fallback), keepArt.src, ready(keep)].join("|");
  if (sc.canvas && sc.key === key) return sc.canvas;
  const canvas = sc.canvas ?? document.createElement("canvas");
  canvas.width = Math.round(WORLD_W * dpr);
  canvas.height = Math.round(geo.H * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#23301a";
  ctx.fillRect(0, 0, WORLD_W, geo.H);

  // The painting: its full width spans the world; anchored at the top so its hedge
  // row frames the first lane, the rest of the lawn running off the bottom edge.
  if (ready(field)) {
    const h = (WORLD_W * field.naturalHeight) / field.naturalWidth;
    ctx.drawImage(field, 0, t.fieldTop ?? 0, WORLD_W, h);
  } else if (ready(fallback)) {
    ctx.drawImage(fallback, 0, 150, 800, 406, 0, 0, WORLD_W, geo.H);
  }

  drawLawn(ctx, geo, lanes);

  // Soft vignette: the eye stays on the lawn.
  const vignette = ctx.createRadialGradient(geo.W * 0.55, geo.H * 0.5, geo.H * 0.45, geo.W * 0.55, geo.H * 0.5, WORLD_W * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD_W, geo.H);

  if (ready(keep)) drawKeep(ctx, geo, keep);
  sc.canvas = canvas;
  sc.key = key;
  return canvas;
}

/** PvZ-style mown checker on the active lanes; bare, unsodded earth on the closed ones. */
function drawLawn(ctx: CanvasRenderingContext2D, geo: Geometry, lanes: readonly number[]): void {
  const x0 = geo.LAWN_X;
  const x1 = geo.LAWN_X + GW_COLS * geo.TILE;
  for (let lane = 0; lane < GW_LANES; lane += 1) {
    const top = geo.TOP + lane * geo.LANE_H;
    if (!lanes.includes(lane)) {
      // Soft-edged bare earth (blurred once: this layer is composed a single time).
      ctx.save();
      ctx.filter = "blur(5px)";
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgb(150,112,74)";
      ctx.fillRect(x0 - 12, top + 6, x1 - x0 + 24, geo.LANE_H - 12);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(48,30,14,0.45)";
      ctx.fillRect(x0 - 12, top + 6, x1 - x0 + 24, geo.LANE_H - 12);
      ctx.restore();
      for (let i = 0; i < 260; i += 1) {
        const px = x0 - 8 + noise(lane * 1000 + i) * (x1 - x0 + 16);
        const py = top + 8 + noise(lane * 1000 + i + 500) * (geo.LANE_H - 16);
        ctx.fillStyle = i % 3 === 0 ? "rgba(190,150,100,0.35)" : "rgba(25,15,6,0.35)";
        ctx.fillRect(px, py, 2 + noise(i) * 3, 1.5 + noise(i + 7) * 2);
      }
      // Furrows.
      ctx.strokeStyle = "rgba(30,18,8,0.28)";
      ctx.lineWidth = 2;
      for (let k = 1; k < 4; k += 1) {
        ctx.beginPath();
        ctx.moveTo(x0 - 8, top + (geo.LANE_H * k) / 4);
        ctx.lineTo(x1 + 8, top + (geo.LANE_H * k) / 4 + (noise(lane + k) - 0.5) * 6);
        ctx.stroke();
      }
      continue;
    }
    for (let col = 0; col < GW_COLS; col += 1) {
      const light = (lane + col) % 2 === 0;
      ctx.fillStyle = light ? "rgba(255,255,215,0.075)" : "rgba(0,24,0,0.07)";
      ctx.fillRect(geo.LAWN_X + col * geo.TILE, top, geo.TILE, geo.LANE_H);
    }
  }
}

/** Where the keep stands: its gate faces the lawn, its right edge just short of column 0. */
export function keepRect(geo: Geometry, keep: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const h = geo.H + 20;
  const w = (keep.naturalWidth / keep.naturalHeight) * h;
  return { x: geo.LAWN_X - 14 - w, y: -8, w, h };
}

/** The defender's colours flying from the keep's flagpoles, rippling in the wind. */
export function drawKeepFlags(ctx: CanvasRenderingContext2D, geo: Geometry, now: number, color: string, keepArt: KeepArt = KEEPS.stone): void {
  const keep = image(keepArt.src);
  if (!ready(keep)) return;
  const r = keepRect(geo, keep);
  keepArt.poles.forEach((pole, i) => {
    const px = r.x + r.w * pole.x;
    const py = r.y + r.h * pole.y + 4;
    const len = 50;
    const hgt = 26;
    const phase = now / 260 + i * 1.7;
    const wave = (u: number) => Math.sin(phase + u * 5.2) * 4 * u;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let k = 1; k <= 10; k += 1) {
      const u = k / 10;
      ctx.lineTo(px + len * u, py + wave(u) + u * 3);
    }
    // Swallowtail end.
    ctx.lineTo(px + len * 0.84, py + hgt * 0.5 + wave(0.84) + 2);
    ctx.lineTo(px + len, py + hgt + wave(1) + 3);
    for (let k = 10; k >= 0; k -= 1) {
      const u = k / 10;
      ctx.lineTo(px + len * u, py + hgt + wave(u) + u * 3);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(px, py, px + len, py + hgt);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,226,140,0.85)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  });
}

function drawKeep(ctx: CanvasRenderingContext2D, geo: Geometry, keep: HTMLImageElement): void {
  const r = keepRect(geo, keep);
  // Its shadow falls across the forecourt toward the lawn (light from the upper left).
  const shade = ctx.createLinearGradient(r.x + r.w - 10, 0, r.x + r.w + 70, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.32)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(r.x + r.w - 10, geo.TOP, 80, geo.H - geo.TOP);
  ctx.drawImage(keep, r.x, r.y, r.w, r.h);
}

// ---------------------------------------------------------------------------
// Cached sprites: a radial gradient built once per colour and drawn as an image
// (building gradients per particle per frame is what makes a busy lawn stutter).

const glows = new Map<string, HTMLCanvasElement>();

/** A soft round glow of `color` fading to nothing (64 x 64), cached. */
export function glowSprite(color: string): HTMLCanvasElement | null {
  const cached = glows.get(color);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glows.set(color, canvas);
  return canvas;
}

/** Draws a cached glow centred at (x, y) with radius r. */
export function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number): void {
  const sprite = glowSprite(color);
  if (sprite) ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
}

let raySprite: HTMLCanvasElement | null = null;

/** The coin's halo: eight soft rays around a warm core (256 x 256, drawn scaled and turned). */
function coinRays(): HTMLCanvasElement | null {
  if (raySprite || typeof document === "undefined") return raySprite;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(128, 128);
  const glow = ctx.createRadialGradient(0, 0, 128 * 0.13, 0, 0, 128);
  glow.addColorStop(0, "rgba(255,226,120,0.55)");
  glow.addColorStop(0.55, "rgba(255,190,60,0.16)");
  glow.addColorStop(1, "rgba(255,170,40,0)");
  ctx.fillStyle = glow;
  for (let k = 0; k < 8; k += 1) {
    const a = (k * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 128, a - 0.13, a + 0.13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 128 * 0.54, 0, Math.PI * 2);
  ctx.fill();
  raySprite = canvas;
  return canvas;
}

let scorchSprite: HTMLCanvasElement | null = null;

function scorchImage(): HTMLCanvasElement | null {
  if (scorchSprite || typeof document === "undefined") return scorchSprite;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(20,12,6,0.7)");
  g.addColorStop(0.6, "rgba(20,12,6,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  scorchSprite = canvas;
  return canvas;
}

// ---------------------------------------------------------------------------
// Particles and decals

export type ParticleKind = "spark" | "dust" | "ember" | "glint" | "soul" | "piece" | "chip" | "smoke" | "coinbit" | "heart" | "note";

export type Particle = {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity, px / ms². */
  g: number;
  born: number;
  life: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  /** Prop image (a tumbling helmet / lid / book). */
  img?: string;
  flip?: boolean;
  /** Ground line it bounces on. */
  ground?: number;
  bounces: number;
  last: number;
};

export type Decal = { x: number; y: number; rx: number; ry: number; born: number; life: number; color: string };

const MAX_PARTICLES = 520;

export function spawnParticles(list: Particle[], now: number, count: number, make: (i: number) => Partial<Particle> & Pick<Particle, "kind" | "x" | "y">): void {
  for (let i = 0; i < count && list.length < MAX_PARTICLES; i += 1) {
    const p = make(i);
    list.push({ vx: 0, vy: 0, g: 0, life: 600, size: 3, color: "#fff", rot: 0, vr: 0, bounces: 0, born: now, last: now, ...p });
  }
}

/** A burst: `count` particles flung outward from (x, y). */
export function burst(list: Particle[], now: number, kind: ParticleKind, x: number, y: number, count: number, opts: {
  speed?: number; spread?: number; up?: number; g?: number; life?: number; size?: number; colors?: readonly string[]; ground?: number;
} = {}): void {
  const colors = opts.colors ?? ["#ffe9a8"];
  const speed = opts.speed ?? 0.25;
  spawnParticles(list, now, count, (i) => {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    return {
      kind, x: x + (Math.random() - 0.5) * (opts.spread ?? 10), y: y + (Math.random() - 0.5) * (opts.spread ?? 10) * 0.5,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - (opts.up ?? 0), g: opts.g ?? 0,
      life: (opts.life ?? 600) * (0.6 + Math.random() * 0.6), size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8),
      color: colors[i % colors.length]!, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.02, ground: opts.ground
    };
  });
}

/** Steps and draws the particles; returns the ones still alive. */
export function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[], now: number): Particle[] {
  const keep: Particle[] = [];
  for (const p of list) {
    const age = now - p.born;
    if (age >= p.life) continue;
    // A delayed burst waits, unseen and unmoving, until its moment comes.
    if (age < 0) {
      p.last = now;
      keep.push(p);
      continue;
    }
    const dt = Math.min(50, Math.max(0, now - p.last));
    p.last = now;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.ground !== undefined && p.y > p.ground && p.vy > 0) {
      p.y = p.ground;
      if (p.bounces < 2) {
        p.vy *= -0.35;
        p.vx *= 0.55;
        p.vr *= 0.5;
        p.bounces += 1;
      } else {
        p.vy = 0;
        p.vx *= 0.8;
        p.vr = 0;
        p.g = 0;
      }
    }
    const t = age / p.life;
    const fade = p.kind === "piece" ? (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1) : 1 - t;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    switch (p.kind) {
      case "piece": {
        const img = p.img ? image(p.img) : null;
        if (img && ready(img)) {
          const h = p.size;
          const w = (img.naturalWidth / img.naturalHeight) * h;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          if (p.flip) ctx.scale(-1, 1);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        }
        break;
      }
      case "spark":
      case "ember":
      case "glint":
      case "coinbit": {
        ctx.globalCompositeOperation = "lighter";
        const r = p.size * (p.kind === "glint" ? 1 + Math.sin(t * Math.PI) : 1 - t * 0.5);
        if (p.kind === "glint") {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          for (let k = 0; k < 4; k += 1) {
            const a = (k * Math.PI) / 2;
            ctx.lineTo(Math.cos(a) * r * 2.4, Math.sin(a) * r * 2.4);
            ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.45, Math.sin(a + Math.PI / 4) * r * 0.45);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          drawGlow(ctx, p.color, p.x, p.y, r * 2.2);
        }
        break;
      }
      case "soul": {
        ctx.globalCompositeOperation = "lighter";
        const r = p.size * (1 + t);
        drawGlow(ctx, p.color, p.x + Math.sin(age / 160) * 4, p.y, r);
        break;
      }
      case "dust":
      case "smoke": {
        const r = p.size * (1 + t * (p.kind === "smoke" ? 2.2 : 1.4));
        ctx.globalAlpha = Math.max(0, fade) * (p.kind === "smoke" ? 0.45 : 0.55);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "chip": {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        break;
      }
      case "heart": {
        // A little heart that swells as it rises (charms, love).
        const r = p.size * (0.8 + 0.4 * Math.sin(t * Math.PI));
        ctx.translate(p.x + Math.sin(age / 180 + p.rot * 6) * 3, p.y);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, r * 0.9);
        ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.35);
        ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.9);
        ctx.fill();
        break;
      }
      case "note": {
        // A music note bobbing up from a dance.
        ctx.translate(p.x + Math.sin(age / 140 + p.rot * 6) * 5, p.y);
        ctx.rotate(Math.sin(age / 200) * 0.3);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = "rgba(20,10,30,0.6)";
        ctx.lineWidth = 1;
        ctx.font = `bold ${Math.round(p.size * 4)}px Georgia, serif`;
        ctx.textAlign = "center";
        ctx.strokeText(p.rot > 0.5 ? "♪" : "♫", 0, 0);
        ctx.fillText(p.rot > 0.5 ? "♪" : "♫", 0, 0);
        break;
      }
    }
    ctx.restore();
    keep.push(p);
  }
  return keep;
}

export function drawDecals(ctx: CanvasRenderingContext2D, list: Decal[], now: number): Decal[] {
  const keep: Decal[] = [];
  for (const d of list) {
    const age = now - d.born;
    if (age >= d.life) continue;
    const fade = age > d.life - 1500 ? (d.life - age) / 1500 : 1;
    const sprite = scorchImage();
    if (sprite) {
      ctx.globalAlpha = fade;
      ctx.drawImage(sprite, d.x - d.rx, d.y - d.ry, d.rx * 2, d.ry * 2);
      ctx.globalAlpha = 1;
    }
    keep.push(d);
  }
  return keep;
}

// ---------------------------------------------------------------------------
// Gold coins

/** A spinning gold coin with a halo of slowly turning light rays. */
export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, now: number, seed: number, alpha = 1, rays = true): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (rays) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y);
    ctx.rotate(now / 2400 + seed);
    const reach = size * 1.15;
    const rays = coinRays();
    if (rays) ctx.drawImage(rays, -reach, -reach, reach * 2, reach * 2);
    ctx.restore();
  }
  const img = image(PROP.coin);
  const spin = Math.cos(now / 330 + seed * 2.1);
  const sx = 0.22 + 0.78 * Math.abs(spin);
  ctx.translate(x, y);
  ctx.scale(sx, 1);
  if (ready(img)) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    // Edge-on it darkens (a translucent disc over the round coin; a canvas filter per coin per frame costs too much).
    const shade = 0.32 * (1 - Math.abs(spin));
    if (shade > 0.02) {
      ctx.fillStyle = `rgba(40,20,0,${shade.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.47, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const fallback = image("/assets/icons/resource-gold.webp");
    if (ready(fallback)) ctx.drawImage(fallback, -size / 2, -size / 2, size, size);
    else {
      ctx.fillStyle = "#f0c040";
      ctx.beginPath();
      ctx.arc(0, 0, size / 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A coin on its way to the gold counter (drawn on the HUD overlay, in overlay pixels). */
export type CoinFlight = { x0: number; y0: number; x1: number; y1: number; start: number; dur: number; value: number; size: number; seed: number; trail: { x: number; y: number; t: number }[] };

export function coinFlightPos(f: CoinFlight, now: number): { x: number; y: number; t: number } {
  const t = Math.max(0, Math.min(1, (now - f.start) / f.dur));
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  // Up and over: the control point rises above the straight line.
  const cx = (f.x0 + f.x1) / 2 + (f.x0 - f.x1) * 0.15;
  const cy = Math.min(f.y0, f.y1) - 120;
  const u = 1 - e;
  return { x: u * u * f.x0 + 2 * u * e * cx + e * e * f.x1, y: u * u * f.y0 + 2 * u * e * cy + e * e * f.y1, t };
}

/** Draws the flights; returns the ones that landed this frame and the ones still flying. */
export function drawCoinFlights(ctx: CanvasRenderingContext2D, flights: CoinFlight[], now: number): { flying: CoinFlight[]; landed: CoinFlight[] } {
  const flying: CoinFlight[] = [];
  const landed: CoinFlight[] = [];
  for (const f of flights) {
    const p = coinFlightPos(f, now);
    if (p.t >= 1) {
      landed.push(f);
      continue;
    }
    f.trail.push({ x: p.x, y: p.y, t: now });
    while (f.trail.length && now - f.trail[0]!.t > 180) f.trail.shift();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const q of f.trail) {
      const a = 1 - (now - q.t) / 180;
      const r = f.size * 0.3 * a;
      ctx.globalAlpha = 0.5 * a;
      drawGlow(ctx, "rgba(255,220,110,1)", q.x, q.y, r * 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawCoin(ctx, p.x, p.y, f.size * (1 - p.t * 0.45), now, f.seed, 1, false);
    flying.push(f);
  }
  return { flying, landed };
}
