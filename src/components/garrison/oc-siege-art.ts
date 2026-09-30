/**
 * Order & Chaos siegecraft art, drawn in code on the lawn canvas: ladders (carried,
 * planted, leaning on a troop), the Aegis dome, scorched tiles a Juggernaut leaves,
 * a hexed troop's sheep and the Prism Elemental's spin. Drawing only — the rules
 * live in the simulation; the renderer passes board pixels in.
 */

import { drawGlow } from "./scene";
import { image, ready } from "./art";

/** The sheep a Sorceress turns a troop into (painted prop; drawn in code until it loads). */
export const SHEEP_SRC = "/assets/order-chaos/props/sheep.webp";

/**
 * A ladder from its foot (x0, y0) to its top (x1, y1): two wooden rails and rungs.
 * `alpha` fades it (a ladder lost with its carrier).
 */
export function drawLadder(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width = 16, alpha = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  // Unit normal to the ladder: the rails sit half a width either side.
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  // Dark outline first, then the wood.
  for (const [color, w] of [["rgba(40,24,10,0.9)", 5.5], ["#9a6a3a", 3]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0 + nx, y0 + ny);
    ctx.lineTo(x1 + nx, y1 + ny);
    ctx.moveTo(x0 - nx, y0 - ny);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.stroke();
  }
  const rungs = Math.max(3, Math.floor(len / 17));
  ctx.strokeStyle = "#c08a50";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 1; i < rungs; i += 1) {
    const t = i / rungs;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;
    ctx.moveTo(cx + nx * 0.9, cy + ny * 0.9);
    ctx.lineTo(cx - nx * 0.9, cy - ny * 0.9);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The Aegis dome over the tiles it guards: a faint shell with a bright rim and a slow
 * shimmer; `flash` (0..1) lights it up when a shot bounces off.
 */
export function drawDome(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, now: number, flash: number, widened: boolean): void {
  const pulse = 0.5 + 0.5 * Math.sin(now / 420 + x * 0.01);
  const rgb = widened ? "255,226,140" : "150,210,255";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, ry * 0.2, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(0.75, `rgba(${rgb},${0.04 + 0.03 * pulse + 0.18 * flash})`);
  g.addColorStop(1, `rgba(${rgb},${0.1 + 0.05 * pulse + 0.35 * flash})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // The rim: bright along the top of the bubble, faint where it meets the lawn.
  ctx.strokeStyle = `rgba(${rgb},${0.12 + 0.1 * pulse + 0.3 * flash})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb},${0.35 + 0.2 * pulse + 0.45 * flash})`;
  ctx.lineWidth = 2 + 2 * flash;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  // Hex-panel shimmer: a few meridians over the shell.
  ctx.strokeStyle = `rgba(255,255,255,${0.08 + 0.25 * flash})`;
  ctx.lineWidth = 1.2;
  for (let i = 1; i <= 3; i += 1) {
    const k = i / 4;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * k, ry, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  const sweep = ((now / 1600) % 1) * Math.PI;
  ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.3 * flash})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.96, ry * 0.96, 0, Math.PI + sweep, Math.PI + sweep + 0.35);
  ctx.stroke();
  ctx.restore();
}

/** A scorched tile: charred earth that smoulders, embers dying as it cools (`heat` 1 -> 0). */
export function drawScorch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, heat: number, now: number, seed: number): void {
  const cx = x + w / 2;
  const cy = y + h * 0.72;
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.5 * heat;
  ctx.fillStyle = "rgba(24,14,8,0.85)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.46, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(60,30,14,0.6)";
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.08, cy - 2, w * 0.3, h * 0.12, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (heat <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Glowing cracks and embers, fewer and dimmer as the ground cools.
  const embers = Math.ceil(7 * heat);
  for (let i = 0; i < embers; i += 1) {
    const a = seed * 1.7 + i * 2.39;
    const ex = cx + Math.cos(a) * w * 0.34 * ((i % 3) + 1) / 3;
    const ey = cy + Math.sin(a) * h * 0.14;
    const flicker = 0.55 + 0.45 * Math.sin(now / (90 + i * 23) + a);
    // Fixed colours (glow sprites are cached per colour string); flicker and heat ride on the alpha.
    ctx.globalAlpha = (0.35 + 0.4 * flicker) * heat;
    drawGlow(ctx, EMBER_GLOWS[i % 3]!, ex, ey, 6 + 5 * flicker * heat);
  }
  // A rising spark now and then, drifting up off the hot ground.
  const t = ((now / 900 + seed * 0.37) % 1);
  ctx.globalAlpha = 0.6 * heat * (1 - t);
  drawGlow(ctx, "rgba(255,190,90,1)", cx + Math.sin(seed + now / 700) * w * 0.2, cy - t * h * 0.7, 4);
  ctx.restore();
}

const EMBER_GLOWS = ["rgba(255,120,40,1)", "rgba(255,150,40,1)", "rgba(255,180,40,1)"] as const;

/**
 * A troop turned into a sheep: the painted sheep bobbing and bleating (once loaded);
 * returns false when it is not ready (the renderer then draws the troop greyed, with wool).
 */
export function drawSheep(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number, size = 78): boolean {
  const img = image(SHEEP_SRC);
  const bob = Math.abs(Math.sin(now / 260 + seed)) * 5;
  const tilt = Math.sin(now / 520 + seed) * 0.05;
  // A bleat: a quick squash every few seconds.
  const bleat = (now / 1000 + seed * 0.61) % 3.2 < 0.25 ? 1 : 0;
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, size * 0.36, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (!ready(img)) return false;
  const h = (size * img.naturalHeight) / Math.max(1, img.naturalWidth);
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.rotate(tilt);
  ctx.scale(1 + 0.05 * bleat, 1 - 0.06 * bleat);
  // The painted sheep faces left (towards the horde's side it was hexed from, like the troop).
  ctx.drawImage(img, -size / 2, -h, size, h);
  ctx.restore();
  return true;
}

/** Wool puffs over a greyed troop (the fallback sheep). */
export function drawWool(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number): void {
  const bob = Math.abs(Math.sin(now / 260 + seed)) * 4;
  ctx.save();
  ctx.fillStyle = "rgba(246,244,236,0.92)";
  ctx.strokeStyle = "rgba(120,110,100,0.7)";
  ctx.lineWidth = 1.2;
  const puffs = [[-18, -44, 14], [0, -52, 16], [18, -44, 14], [-9, -32, 13], [10, -32, 13], [0, -66, 11]] as const;
  for (const [dx, dy, r] of puffs) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy - bob, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Ears and a face.
  ctx.fillStyle = "#4a4038";
  ctx.beginPath();
  ctx.ellipse(x - 26, y - 56 - bob, 8, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - 28, y - 58 - bob, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
