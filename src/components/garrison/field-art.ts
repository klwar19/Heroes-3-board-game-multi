/**
 * Order & Chaos battlefield art, drawing only (the rules are in the simulation;
 * see engine/garrison/order-chaos/field.ts): the lawn's tiles (water, bridges,
 * the roof and its ridge, rafts and crates, ruins, brambles, clover) baked into
 * one cached layer that is redrawn only when the tiles change, the tile states
 * a battle makes (ice, craters, marked lightning strikes), the Lawful landmarks
 * and Chaos structures, foes wading, swimming and coming in by other ways, the
 * sleepers, and the weather overlays (rain, fog, blizzard, sandstorm, the
 * thunderstorm and the night) — a few cached sprites and gradients per frame.
 *
 * Painted props load from /assets/order-chaos/field/ (Codex art); every piece
 * has a drawn fallback until (or unless) its image is there.
 */

import { DEFENDERS, ENEMIES, GW_COLS, GW_LANES, type DefKind } from "@/engine/garrison/content";
import { FIELD, TILE, type FieldState } from "@/engine/garrison/order-chaos/field";
import { fogged, inWater, submerged, type Defender, type Enemy, type GarrisonConfig, type GarrisonEvent, type GarrisonState } from "@/engine/garrison/sim";
import { G, atlasFor, drawAtlas, fxSheet, groupFrames, image, ready } from "./art";
import { BOARD, feetY, laneTop, tileX, type View } from "./renderer";
import { WORLD_W, burst, drawGlow, spawnParticles } from "./scene";

const ART = (name: string) => `/assets/order-chaos/field/${name}.webp`;

/** The painted field art (keyed Codex props and textures). */
export const FIELD_ART = {
  crypt: ART("crypt"), chest: ART("chest"), bank: ART("bank"), windmill: ART("windmill"), well: ART("well"), shrine: ART("shrine"),
  pillar: ART("pillar"), ruins: ART("ruins"), bramble: ART("bramble"), crate: ART("crate"), raft: ART("raft"), bridge: ART("bridge"),
  clover: ART("clover"), roofTile: ART("roof-tile"), brew: ART("brew")
} as const;

/** Landmark props: art and drawn height (board px). */
const LANDMARK: Record<string, { src: string; h: number }> = {
  windmill: { src: FIELD_ART.windmill, h: 158 },
  well: { src: FIELD_ART.well, h: 100 },
  shrine: { src: FIELD_ART.shrine, h: 124 },
  pillar: { src: FIELD_ART.pillar, h: 160 }
};

// ---------------------------------------------------------------------------
// Per-view memory (drawing only)

type FieldFx = {
  layer: HTMLCanvasElement | null;
  layerKey: string;
  rain: HTMLCanvasElement | null;
  snow: HTMLCanvasElement | null;
  dust: HTMLCanvasElement | null;
  fog: HTMLCanvasElement | null;
  /** The fog bank, drawn at low resolution each frame and smoothed up (soft lane and fog-line edges). */
  fogLayer: HTMLCanvasElement | null;
  /** The fog's per-row density (a one-pixel-wide column stretched over the layer). */
  fogMask: HTMLCanvasElement | null;
  dark: HTMLCanvasElement | null;
  /** A flash of lightning (sheet lightning over the whole board). */
  flashAt: number;
  /** Boars trotting home after a meal (drawn for a moment after the sim removed them). */
  trots: { x: number; y: number; start: number }[];
};

const memory = new WeakMap<View, FieldFx>();

function fxOf(view: View): FieldFx {
  let m = memory.get(view);
  if (!m) {
    m = { layer: null, layerKey: "", rain: null, snow: null, dust: null, fog: null, fogLayer: null, fogMask: null, dark: null, flashAt: -1e9, trots: [] };
    memory.set(view, m);
  }
  return m;
}

function canvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Deterministic hash noise (the same decoration every redraw). */
function noise(i: number): number {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// ---------------------------------------------------------------------------
// The tile layer (baked when the tiles change)

// (Read when drawing, never at module load: this module and ./renderer import each other, so
// BOARD is not initialised yet while this module's top level runs.)
const lawnW = () => GW_COLS * BOARD.TILE;
const lawnH = () => GW_LANES * BOARD.LANE_H;

function codeAt(f: FieldState, lane: number, col: number): number {
  if (lane < 0 || lane >= GW_LANES || col < 0 || col >= GW_COLS) return -1;
  return f.grid[lane * GW_COLS + col] ?? 0;
}

function drawImageIn(ctx: CanvasRenderingContext2D, src: string, cx: number, cy: number, maxW: number, maxH: number): boolean {
  const img = image(src);
  if (!ready(img)) return false;
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  return true;
}

/** Water: a dark pond body; muddy banks along every edge that meets dry ground; lily pads and reeds. */
function paintWater(ctx: CanvasRenderingContext2D, f: FieldState, lane: number, col: number, x: number, y: number): void {
  const T = BOARD.TILE;
  const H = BOARD.LANE_H;
  const g = ctx.createLinearGradient(x, y, x, y + H);
  g.addColorStop(0, "rgba(22,58,70,0.92)");
  g.addColorStop(1, "rgba(34,78,86,0.92)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, T, H);
  const wet = (l: number, c: number) => {
    const code = codeAt(f, l, c);
    return code === TILE.water || code === TILE.bridge;
  };
  ctx.fillStyle = "rgba(74,60,34,0.55)";
  if (!wet(lane - 1, col)) ctx.fillRect(x, y, T, 7);
  if (!wet(lane + 1, col)) ctx.fillRect(x, y + H - 7, T, 7);
  if (!wet(lane, col - 1)) ctx.fillRect(x, y, 7, H);
  if (!wet(lane, col + 1)) ctx.fillRect(x + T - 7, y, 7, H);
  const seed = lane * 31 + col * 7;
  // A lily pad or two, and reeds by a bank.
  for (let k = 0; k < 2; k += 1) {
    if (noise(seed + k) < 0.45) continue;
    const px = x + 18 + noise(seed + k + 10) * (T - 36);
    const py = y + 20 + noise(seed + k + 20) * (H - 40);
    ctx.fillStyle = "rgba(70,130,60,0.85)";
    ctx.beginPath();
    ctx.ellipse(px, py, 9, 6, 0, 0.35, Math.PI * 2);
    ctx.lineTo(px, py);
    ctx.fill();
  }
  if (!wet(lane - 1, col) && noise(seed + 5) > 0.4) {
    ctx.strokeStyle = "rgba(120,140,70,0.8)";
    ctx.lineWidth = 2;
    for (let r = 0; r < 4; r += 1) {
      const rx = x + 10 + noise(seed + r + 40) * (T - 20);
      ctx.beginPath();
      ctx.moveTo(rx, y + 12);
      ctx.lineTo(rx + (noise(seed + r) - 0.5) * 6, y - 8);
      ctx.stroke();
    }
  }
}

/** The roof: slate shingles (the painted texture, or drawn rows), shaded by the slope toward the ridge. */
function paintRoof(ctx: CanvasRenderingContext2D, f: FieldState, lane: number, col: number, x: number, y: number): void {
  const T = BOARD.TILE;
  const H = BOARD.LANE_H;
  const tex = image(FIELD_ART.roofTile);
  if (ready(tex)) {
    const pattern = ctx.createPattern(tex, "repeat");
    if (pattern) {
      pattern.setTransform(new DOMMatrix().scale(T / tex.naturalWidth, T / tex.naturalWidth));
      ctx.fillStyle = pattern;
      ctx.fillRect(x, y, T, H);
    }
  } else {
    ctx.fillStyle = "rgb(84,94,108)";
    ctx.fillRect(x, y, T, H);
    ctx.strokeStyle = "rgba(30,34,44,0.55)";
    ctx.lineWidth = 1.5;
    for (let r = 0; r < 6; r += 1) {
      const ry = y + (r + 0.5) * (H / 6);
      ctx.beginPath();
      ctx.moveTo(x, ry);
      ctx.lineTo(x + T, ry);
      ctx.stroke();
      for (let k = 0; k < 5; k += 1) {
        const sx = x + ((k + (r % 2) * 0.5) * T) / 5;
        ctx.beginPath();
        ctx.moveTo(sx, ry);
        ctx.lineTo(sx, ry + H / 6);
        ctx.stroke();
      }
    }
  }
  // Slope shading: lit on the gate side of the ridge, shadowed beyond it.
  let ridge = -1;
  for (let c = 0; c < GW_COLS; c += 1) if (codeAt(f, lane, c) === TILE.ridge) ridge = c;
  if (ridge >= 0 && col !== ridge) {
    const beyond = col > ridge;
    ctx.fillStyle = beyond ? `rgba(10,14,24,${0.12 + 0.04 * Math.min(4, col - ridge)})` : `rgba(255,248,230,${0.03 * Math.min(4, ridge - col)})`;
    ctx.fillRect(x, y, T, H);
  }
}

/** The ridge: capstones down the middle of the column. */
function paintRidge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const T = BOARD.TILE;
  const H = BOARD.LANE_H;
  const cx = x + T / 2;
  const g = ctx.createLinearGradient(cx - 22, 0, cx + 22, 0);
  g.addColorStop(0, "rgb(150,140,125)");
  g.addColorStop(0.5, "rgb(196,186,168)");
  g.addColorStop(1, "rgb(92,86,78)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - 20, y, 40, H);
  ctx.strokeStyle = "rgba(40,34,28,0.7)";
  ctx.lineWidth = 2;
  for (let k = 0; k <= 4; k += 1) {
    ctx.beginPath();
    ctx.moveTo(cx - 20, y + (k * H) / 4);
    ctx.lineTo(cx + 20, y + (k * H) / 4);
    ctx.stroke();
  }
}

function tileLayer(s: GarrisonState, view: View, dpr: number): HTMLCanvasElement | null {
  const f = s.field;
  if (!f) return null;
  const m = fxOf(view);
  const srcs = [FIELD_ART.roofTile, FIELD_ART.ruins, FIELD_ART.bramble, FIELD_ART.clover, FIELD_ART.raft, FIELD_ART.crate, FIELD_ART.bridge];
  const key = `${f.rev}|${dpr}|${srcs.map((src) => (ready(image(src)) ? 1 : 0)).join("")}`;
  if (m.layer && m.layerKey === key) return m.layer;
  const LAWN_W = lawnW();
  const LAWN_H = lawnH();
  const c = m.layer ?? canvas(LAWN_W * dpr, LAWN_H * dpr);
  if (!c) return null;
  c.width = Math.round(LAWN_W * dpr);
  c.height = Math.round(LAWN_H * dpr);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, LAWN_W, LAWN_H);
  const T = BOARD.TILE;
  const H = BOARD.LANE_H;
  // Ground first (water, roof), then what stands on it.
  for (let lane = 0; lane < GW_LANES; lane += 1) {
    for (let col = 0; col < GW_COLS; col += 1) {
      const code = codeAt(f, lane, col);
      const x = col * T;
      const y = lane * H;
      if (code === TILE.water || code === TILE.bridge) paintWater(ctx, f, lane, col, x, y);
      else if (code === TILE.roof || code === TILE.ridge) paintRoof(ctx, f, lane, col, x, y);
    }
  }
  for (let lane = 0; lane < GW_LANES; lane += 1) {
    for (let col = 0; col < GW_COLS; col += 1) {
      const code = codeAt(f, lane, col);
      const footing = f.footing[lane * GW_COLS + col] === 1;
      const x = col * T;
      const y = lane * H;
      const cx = x + T / 2;
      const cy = y + H * 0.62;
      if (code === TILE.ridge) paintRidge(ctx, x, y);
      if (code === TILE.bridge && !drawImageIn(ctx, FIELD_ART.bridge, cx, y + H / 2, T + 6, H)) {
        ctx.fillStyle = "rgb(120,86,50)";
        for (let k = 0; k < 6; k += 1) ctx.fillRect(x + 2, y + 10 + k * 17, T - 4, 13);
      }
      if (code === TILE.water && footing && !drawImageIn(ctx, FIELD_ART.raft, cx, cy, T * 0.86, H * 0.78)) {
        ctx.fillStyle = "rgb(112,78,44)";
        for (let k = 0; k < 5; k += 1) ctx.fillRect(x + 14, y + 26 + k * 15, T - 28, 12);
      }
      if ((code === TILE.roof || code === TILE.ridge) && footing && !drawImageIn(ctx, FIELD_ART.crate, cx, cy + 6, T * 0.8, H * 0.62)) {
        ctx.fillStyle = "rgb(130,92,52)";
        ctx.fillRect(x + 18, y + 48, T - 36, 52);
        ctx.fillStyle = "rgb(60,42,26)";
        ctx.fillRect(x + 22, y + 50, T - 44, 12);
      }
      if (code === TILE.ruins && !drawImageIn(ctx, FIELD_ART.ruins, cx, cy - 10, T * 1.02, H * 0.95)) {
        ctx.fillStyle = "rgb(150,144,132)";
        ctx.fillRect(x + 30, y + 30, 26, 62);
        ctx.fillStyle = "rgb(118,112,102)";
        ctx.fillRect(x + 58, y + 70, 36, 24);
      }
      if (code === TILE.bramble && !drawImageIn(ctx, FIELD_ART.bramble, cx, cy - 4, T * 1.08, H * 0.9)) {
        ctx.strokeStyle = "rgb(40,60,26)";
        ctx.lineWidth = 3;
        for (let k = 0; k < 9; k += 1) {
          ctx.beginPath();
          ctx.arc(x + 12 + noise(lane * 50 + col * 9 + k) * (T - 24), y + 30 + noise(k + col) * 70, 12 + noise(k) * 10, 0, Math.PI * 1.4);
          ctx.stroke();
        }
      }
      if (code === TILE.clover && !drawImageIn(ctx, FIELD_ART.clover, cx, y + H / 2, T * 0.96, H * 0.9)) {
        for (let k = 0; k < 10; k += 1) {
          ctx.fillStyle = k % 4 === 0 ? "rgb(214,200,90)" : "rgb(70,150,60)";
          ctx.beginPath();
          ctx.arc(x + 14 + noise(col * 13 + k) * (T - 28), y + 20 + noise(lane * 7 + k) * (H - 40), 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  m.layer = c;
  m.layerKey = key;
  return c;
}

let iceCanvas: HTMLCanvasElement | null = null;

/** A sheet of ice for one tile (drawn once, then reused every frame). */
function iceSprite(): HTMLCanvasElement | null {
  if (iceCanvas) return iceCanvas;
  const T = BOARD.TILE - 6;
  const H = BOARD.LANE_H - 22;
  const c = canvas(T, H);
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return null;
  const g = ctx.createLinearGradient(0, 0, T, H);
  g.addColorStop(0, "rgba(220,244,255,0.75)");
  g.addColorStop(0.5, "rgba(170,215,240,0.6)");
  g.addColorStop(1, "rgba(215,240,255,0.75)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, T, H);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(17, 26);
  ctx.lineTo(47, 48);
  ctx.lineTo(41, 76);
  ctx.moveTo(67, 16);
  ctx.lineTo(83, 56);
  ctx.stroke();
  iceCanvas = c;
  return c;
}

/**
 * Under the units: the baked tile layer, a shimmer on the water, ice sheets,
 * craters and the thunderstorm's marked tiles.
 */
export function drawFieldGround(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, now: number, dpr: number): void {
  const f = s.field;
  if (f) {
    const layer = tileLayer(s, view, dpr);
    if (layer) ctx.drawImage(layer, BOARD.LAWN_X, BOARD.TOP, lawnW(), lawnH());
    const T = BOARD.TILE;
    const H = BOARD.LANE_H;
    ctx.save();
    // Water shimmer: two soft highlights drifting per open tile (one path, one stroke).
    ctx.strokeStyle = "rgba(190,235,240,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < f.grid.length; i += 1) {
      if (f.grid[i] !== TILE.water || f.footing[i] === 1) continue;
      const x = tileX(i % GW_COLS);
      const y = laneTop(Math.floor(i / GW_COLS));
      for (let k = 0; k < 2; k += 1) {
        const ph = now / 1400 + i * 0.7 + k * 2.1;
        const hx = x + 14 + ((Math.sin(ph) + 1) / 2) * (T - 50);
        const hy = y + 28 + k * 44 + Math.sin(ph * 1.7) * 6;
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(hx + 12, hy - 4, hx + 24, hy);
      }
    }
    ctx.stroke();
    // Ice (fading as it nears its melt) and craters.
    for (let i = 0; i < f.ice.length; i += 1) {
      const left = (f.ice[i] ?? 0) - s.tick;
      if (left > 0) {
        const x = tileX(i % GW_COLS);
        const y = laneTop(Math.floor(i / GW_COLS));
        ctx.globalAlpha = Math.min(1, left / (FIELD.iceMelt * 0.25));
        const sheet = iceSprite();
        if (sheet) ctx.drawImage(sheet, x + 3, y + 14, T - 6, H - 22);
        ctx.globalAlpha = 1;
      }
      const crater = (f.crater[i] ?? 0) - s.tick;
      if (crater > 0) {
        const cx = tileX((i % GW_COLS) + 0.5);
        const cy = feetY(Math.floor(i / GW_COLS)) - 6;
        ctx.globalAlpha = Math.min(1, crater / (FIELD.crater * 0.2));
        ctx.fillStyle = "rgba(30,18,10,0.85)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 46, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,120,40,0.55)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (Math.random() < 0.04) burst(view.particles, now, "smoke", cx + (Math.random() - 0.5) * 50, cy - 6, 1, { speed: 0.02, up: 0.05, life: 900, size: 6, colors: ["rgba(70,60,55,0.6)"] });
      }
    }
    ctx.restore();
  }
  // The thunderstorm's marks: a pulsing ring where lightning will strike.
  for (const m of s.weather?.marks ?? []) {
    const cx = tileX(m.col + 0.5);
    const cy = feetY(m.lane) - 6;
    const t = 1 - Math.max(0, m.at - s.tick) / FIELD.strikeWarn;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, "rgba(255,240,140,0.55)", cx, cy, 40 + 26 * t);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = `rgba(255,236,120,${0.5 + 0.5 * Math.abs(Math.sin(now / 90))})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 48, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Landmarks, structures, sleepers, waders, swimmers

function hpBarSmall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string): void {
  const f = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = "rgba(10,6,2,0.7)";
  ctx.fillRect(x - w / 2 - 1.5, y - 1.5, w + 3, 7);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * f, 4);
}

/** A Lawful landmark (Windmill, Magic Well, Shrine, Pillar of Fire). Returns false for any other troop. */
export function drawLandmark(ctx: CanvasRenderingContext2D, s: GarrisonState, d: Defender, now: number, selected: boolean): boolean {
  const def = DEFENDERS[d.kind];
  if (!def?.landmark) return false;
  const art = LANDMARK[def.landmark] ?? LANDMARK.shrine!;
  const x = tileX(d.col + 0.5);
  const y = feetY(d.lane) + 10;
  const img = image(art.src);
  ctx.save();
  if (selected) {
    ctx.shadowColor = "#ffe27a";
    ctx.shadowBlur = 18;
  }
  if (ready(img)) {
    const h = art.h;
    const w = (img.naturalWidth / img.naturalHeight) * h;
    ctx.drawImage(img, x - w / 2, y - h, w, h);
  } else {
    // Drawn stand-ins: a stone base and the landmark's shape.
    ctx.fillStyle = "rgb(120,112,100)";
    ctx.fillRect(x - 26, y - 40, 52, 40);
    ctx.fillStyle = def.landmark === "pillar" ? "rgb(150,140,120)" : def.landmark === "windmill" ? "rgb(220,214,200)" : "rgb(110,130,160)";
    ctx.fillRect(x - 16, y - art.h + 20, 32, art.h - 60);
    if (def.landmark === "windmill") {
      ctx.strokeStyle = "rgb(90,70,50)";
      ctx.lineWidth = 5;
      const a = now / 900;
      for (let k = 0; k < 4; k += 1) {
        ctx.beginPath();
        ctx.moveTo(x, y - art.h + 30);
        ctx.lineTo(x + Math.cos(a + (k * Math.PI) / 2) * 50, y - art.h + 30 + Math.sin(a + (k * Math.PI) / 2) * 50);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  // Light and magic about them.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (def.landmark === "pillar") drawGlow(ctx, "rgba(255,160,60,0.6)", x, y - art.h + 16, 46 + 6 * Math.sin(now / 90));
  else if (def.landmark === "well") drawGlow(ctx, "rgba(110,180,255,0.4)", x, y - 46, 34 + 4 * Math.sin(now / 300));
  else if (def.landmark === "shrine") drawGlow(ctx, "rgba(255,220,140,0.45)", x, y - art.h * 0.55, 30 + 5 * Math.sin(now / 200));
  ctx.restore();
  if (d.hp < d.maxHp) hpBarSmall(ctx, x, y + 2, 60, d.hp / d.maxHp, d.hp / d.maxHp > 0.4 ? "#6ad04a" : "#e0503a");
  return true;
}

/** A Chaos structure other than a grave (crypt, chest, creature bank). Returns false for anything else. */
export function drawFieldStructure(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number, now: number): boolean {
  const def = ENEMIES[e.kind];
  if (!def || (!def.crypt && !def.chest && !def.bank)) return false;
  const src = def.crypt ? FIELD_ART.crypt : def.chest ? FIELD_ART.chest : FIELD_ART.bank;
  const h = def.crypt ? 118 : def.chest ? 66 : 132;
  const img = image(src);
  if (ready(img)) {
    const w = (img.naturalWidth / img.naturalHeight) * h;
    ctx.drawImage(img, x - w / 2, y - h + 12, w, h);
  } else {
    ctx.fillStyle = def.chest ? "rgb(122,80,40)" : "rgb(112,108,100)";
    ctx.strokeStyle = "rgba(30,24,18,0.9)";
    ctx.lineWidth = 3;
    const w = def.chest ? 58 : 76;
    ctx.fillRect(x - w / 2, y - h + 22, w, h - 22);
    ctx.strokeRect(x - w / 2, y - h + 22, w, h - 22);
    if (def.bank) {
      ctx.strokeStyle = "rgb(40,40,44)";
      for (let k = 0; k < 5; k += 1) {
        ctx.beginPath();
        ctx.moveTo(x - 28 + k * 14, y - 64);
        ctx.lineTo(x - 28 + k * 14, y - 6);
        ctx.stroke();
      }
    }
  }
  if (def.crypt) {
    // The door breathes a sickly light.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, "rgba(140,255,150,0.35)", x, y - 40, 30 + 6 * Math.sin(now / 260 + e.id));
    ctx.restore();
  }
  if (def.bank && def.bank.troop) {
    // The captive, small, behind the bars (a portrait bubble above the cage).
    const troop = DEFENDERS[def.bank.troop];
    const atlas = troop ? atlasFor(troop.sprite) : null;
    if (atlas) {
      const by = y - h - 6 + 3 * Math.sin(now / 400 + e.id);
      ctx.save();
      ctx.fillStyle = "rgba(20,14,8,0.7)";
      ctx.strokeStyle = "rgba(255,214,90,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, by - 24, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, by - 24, 24, 0, Math.PI * 2);
      ctx.clip();
      drawAtlas(ctx, atlas, G.stand, 0, x, by + 10, 0.42, false);
      ctx.restore();
      ctx.strokeStyle = "rgba(60,60,64,0.9)";
      ctx.lineWidth = 2;
      for (let k = -2; k <= 2; k += 1) {
        ctx.beginPath();
        ctx.moveTo(x + k * 9, by - 46);
        ctx.lineTo(x + k * 9, by - 2);
        ctx.stroke();
      }
    }
  }
  if (e.hp < e.maxHp) hpBarSmall(ctx, x, y + 12, 56, e.hp / e.maxHp, "#b0a898");
  return true;
}

/** "Zzz" over a sleeper (a nocturnal troop by day, a lulled troop, a bank's guard). */
export function drawSleep(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number): void {
  ctx.save();
  ctx.font = "bold 16px Georgia, serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k += 1) {
    const t = ((now / 1300 + seed * 0.37 + k / 3) % 1 + 1) % 1;
    const zx = x + 8 + t * 22 + Math.sin(t * 6 + k) * 3;
    const zy = y - t * 34;
    ctx.globalAlpha = Math.sin(Math.PI * t);
    ctx.font = `bold ${12 + k * 3}px Georgia, serif`;
    ctx.strokeStyle = "rgba(20,20,50,0.8)";
    ctx.fillStyle = "#cfe0ff";
    ctx.strokeText("z", zx, zy);
    ctx.fillText("z", zx, zy);
  }
  ctx.restore();
}

/** A foe wading through open water: the water line over its feet and a ring of ripples. */
export function drawWading(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number): void {
  ctx.save();
  // (Solid fills, no per-frame gradients: a pool level can have a dozen waders.)
  ctx.fillStyle = "rgba(34,80,92,0.55)";
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 36, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(30,72,84,0.7)";
  ctx.beginPath();
  ctx.ellipse(x, y - 1, 30, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(200,240,245,${0.35 + 0.2 * Math.sin(now / 200 + seed)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y - 6, 30 + 4 * Math.sin(now / 300 + seed), 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A swimmer under the surface: only its wake and a trail of bubbles show. */
export function drawSwimmer(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number, dir: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(200,240,245,0.55)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k += 1) {
    const t = ((now / 900 + k / 3 + seed * 0.1) % 1 + 1) % 1;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.ellipse(x - dir * 18 * t, y - 8, 10 + 26 * t, 4 + 6 * t, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(220,250,255,0.8)";
  for (let k = 0; k < 3; k += 1) {
    const t = ((now / 700 + k * 0.33 + seed) % 1 + 1) % 1;
    ctx.beginPath();
    ctx.arc(x + dir * 6 + Math.sin(t * 7) * 3, y - 10 - t * 26, 2 + k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The foe comes onto the lawn by another way: rising out of water, a crypt or a tunnel, or dropping from the sky. */
export function fieldEntry(s: GarrisonState, e: Enemy, alpha: number, scale: number): { rise: number; drop: number } | null {
  if (e.state !== "appear" || !e.origin) return null;
  const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
  if (e.origin === "sky") return { rise: 0, drop: (1 - t) * (1 - t) * 420 };
  return { rise: (1 - t * (2 - t)) * 95 * scale, drop: 0 };
}

/** Whether a foe should be drawn as unseen (stealth, or hidden in the fog). */
export function foeInFog(s: GarrisonState, e: Enemy): boolean {
  return s.weather !== undefined && fogged(s, e);
}

/** Wading / swimming state for the renderer. */
export function foeInWater(s: GarrisonState, e: Enemy): "swim" | "wade" | null {
  if (!s.field) return null;
  if (submerged(s, e)) return "swim";
  return inWater(s, e) ? "wade" : null;
}

// ---------------------------------------------------------------------------
// Weather overlays (a few cached sprites a frame)

function rainTile(m: FieldFx): HTMLCanvasElement | null {
  if (m.rain) return m.rain;
  const c = canvas(256, 256);
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return null;
  ctx.strokeStyle = "rgba(200,220,255,0.5)";
  ctx.lineWidth = 1.3;
  for (let k = 0; k < 70; k += 1) {
    const x = noise(k) * 256;
    const y = noise(k + 100) * 256;
    const len = 12 + noise(k + 200) * 14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.3, y + len);
    ctx.stroke();
  }
  m.rain = c;
  return c;
}

function snowTile(m: FieldFx): HTMLCanvasElement | null {
  if (m.snow) return m.snow;
  const c = canvas(256, 256);
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return null;
  for (let k = 0; k < 90; k += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.55 + noise(k + 5) * 0.4})`;
    ctx.beginPath();
    ctx.arc(noise(k + 300) * 256, noise(k + 400) * 256, 1 + noise(k + 500) * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  m.snow = c;
  return c;
}

function dustTile(m: FieldFx): HTMLCanvasElement | null {
  if (m.dust) return m.dust;
  const c = canvas(256, 256);
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return null;
  ctx.strokeStyle = "rgba(210,170,110,0.35)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 40; k += 1) {
    const x = noise(k + 600) * 256;
    const y = noise(k + 700) * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 30 + noise(k) * 40, y + (noise(k + 1) - 0.5) * 6);
    ctx.stroke();
  }
  m.dust = c;
  return c;
}

function fogTile(m: FieldFx): HTMLCanvasElement | null {
  if (m.fog) return m.fog;
  const c = canvas(256, 256);
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return null;
  for (let k = 0; k < 14; k += 1) {
    const x = noise(k + 800) * 256;
    const y = noise(k + 900) * 256;
    const r = 50 + noise(k + 950) * 60;
    // Blobs wrap around the tile's edges so the texture repeats without seams.
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]] as const) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, "rgba(215,222,228,0.55)");
      g.addColorStop(1, "rgba(215,222,228,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  m.fog = c;
  return c;
}

/** A texture tiled over a rectangle, scrolled by (ox, oy). */
function tiled(ctx: CanvasRenderingContext2D, tex: HTMLCanvasElement, x0: number, y0: number, w: number, h: number, ox: number, oy: number, scale = 1): void {
  const size = 256 * scale;
  const sx = ((ox % size) + size) % size;
  const sy = ((oy % size) + size) % size;
  for (let y = y0 - size + sy; y < y0 + h; y += size) {
    for (let x = x0 - size + sx; x < x0 + w; x += size) ctx.drawImage(tex, x, y, size, size);
  }
}

/** Over the units: the weather, the night's darkness and the lightning's flash. */
export function drawWeather(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, now: number): void {
  const m = fxOf(view);
  const kind = s.weather?.kind ?? "clear";
  const W = WORLD_W;
  const Hh = BOARD.H;
  if (s.cfg.oc?.night) drawNight(ctx, s, m);
  if (kind === "rain" || kind === "thunderstorm") {
    ctx.save();
    ctx.fillStyle = kind === "thunderstorm" ? "rgba(20,26,44,0.22)" : "rgba(30,40,60,0.14)";
    ctx.fillRect(0, 0, W, Hh);
    const tex = rainTile(m);
    if (tex) {
      ctx.globalAlpha = 0.8;
      tiled(ctx, tex, 0, 0, W, Hh, -now * 0.12, now * 0.9);
      ctx.globalAlpha = 0.5;
      tiled(ctx, tex, 0, 0, W, Hh, -now * 0.09 + 90, now * 0.6 + 40, 1.4);
    }
    ctx.restore();
  } else if (kind === "blizzard") {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, Hh);
    g.addColorStop(0, "rgba(230,240,255,0.22)");
    g.addColorStop(1, "rgba(210,225,245,0.12)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Hh);
    const tex = snowTile(m);
    if (tex) {
      tiled(ctx, tex, 0, 0, W, Hh, -now * 0.35, now * 0.12);
      ctx.globalAlpha = 0.7;
      tiled(ctx, tex, 0, 0, W, Hh, -now * 0.55 + 70, now * 0.2 + 30, 1.6);
    }
    ctx.restore();
  } else if (kind === "sandstorm") {
    ctx.save();
    ctx.fillStyle = "rgba(170,120,60,0.2)";
    ctx.fillRect(0, 0, W, Hh);
    const tex = dustTile(m);
    if (tex) {
      tiled(ctx, tex, 0, 0, W, Hh, -now * 0.8, Math.sin(now / 900) * 20);
      ctx.globalAlpha = 0.6;
      tiled(ctx, tex, 0, 0, W, Hh, -now * 1.2 + 100, 60, 1.5);
    }
    ctx.restore();
  } else if (kind === "fog" && s.weather) {
    drawFog(ctx, s, m, now);
  }
  // A flash of lightning over everything.
  const flash = 1 - (now - m.flashAt) / 260;
  if (flash > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(235,240,255,${(0.4 * flash).toFixed(3)})`;
    ctx.fillRect(0, 0, W, Hh);
    ctx.restore();
  }
  // Boars trotting home after a meal.
  if (m.trots.length) drawTrots(ctx, m, now);
}

/** Fog in a lit or Sylph-cleared lane, as a share of the thick fog that hides the foes. */
const FOG_THIN = 0.28;
/** Share of a lane height over which one lane's fog blends into the next's (no seams between lanes). */
const FOG_BLEND = 0.18;
/** The fog bank's resolution divisor: drawn small and smoothed up, so every edge comes out soft. */
const FOG_K = 6;

/**
 * Fog over the lawn past the fog line: thick where it hides the foes, thin in lit or cleared lanes,
 * none off the lawn. One low-resolution layer per frame: drifting puffs over a base haze, shaped by
 * a smooth per-row density profile across the lanes and faded in over a tile and a half at the fog
 * line, then scaled up (about 110 one-pixel rows and a few texture blits a frame).
 */
function drawFog(ctx: CanvasRenderingContext2D, s: GarrisonState, m: FieldFx, now: number): void {
  const w = s.weather!;
  const tex = fogTile(m);
  if (!tex) return;
  const k = FOG_K;
  const c = m.fogLayer ?? canvas(Math.ceil(WORLD_W / k), Math.ceil(BOARD.H / k));
  if (!c) return;
  m.fogLayer = c;
  const f = c.getContext("2d");
  if (!f) return;
  f.save();
  f.globalCompositeOperation = "source-over";
  f.globalAlpha = 1;
  f.clearRect(0, 0, c.width, c.height);
  // Puffs drifting slowly up the lanes (two layers at different scales and speeds) over a base haze.
  tiled(f, tex, 0, 0, c.width, c.height, (now * 0.012) / k, 0, 1.3 / k);
  f.globalAlpha = 0.85;
  tiled(f, tex, 0, 0, c.width, c.height, (-now * 0.007 + 90) / k, 40 / k, 2.1 / k);
  f.globalAlpha = 1;
  f.fillStyle = "rgba(206,214,222,0.36)";
  f.fillRect(0, 0, c.width, c.height);
  // Shape it: each row keeps its lane's density (thick, thin when lit or cleared, none off the lawn),
  // blending into the neighbouring lane over the last FOG_BLEND of a lane.
  const dens = (lane: number): number => {
    if (!s.cfg.lanes.includes(lane)) return 0;
    return (w.lit & (1 << lane)) !== 0 || (w.clear[lane] ?? 0) > s.tick ? FOG_THIN : 1;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const mask = m.fogMask ?? canvas(1, c.height);
  const mk = mask?.getContext("2d");
  if (!mask || !mk) {
    f.restore();
    return;
  }
  m.fogMask = mask;
  mk.clearRect(0, 0, 1, mask.height);
  for (let row = 0; row < mask.height; row += 1) {
    const v = ((row + 0.5) * k - BOARD.TOP) / BOARD.LANE_H;
    const lane = Math.floor(v);
    const frac = v - lane;
    let d = dens(lane);
    if (frac < FOG_BLEND) {
      const t = smooth(0.5 + frac / (2 * FOG_BLEND));
      d = dens(lane - 1) * (1 - t) + d * t;
    } else if (frac > 1 - FOG_BLEND) {
      const t = smooth((frac - (1 - FOG_BLEND)) / (2 * FOG_BLEND));
      d = d * (1 - t) + dens(lane + 1) * t;
    }
    mk.fillStyle = `rgba(0,0,0,${d.toFixed(3)})`;
    mk.fillRect(0, row, 1, 1);
  }
  // (One destination-in blit: per-row fills would each clear every other row.)
  f.globalCompositeOperation = "destination-in";
  f.drawImage(mask, 0, 0, c.width, c.height);
  // The fog's leading edge fades in over a tile and a half at the fog line.
  const x0 = tileX(FIELD.fogLine) / k;
  const fade = BOARD.TILE / k;
  const edge = f.createLinearGradient(x0 - fade * 0.6, 0, x0 + fade * 0.9, 0);
  edge.addColorStop(0, "rgba(0,0,0,1)");
  edge.addColorStop(1, "rgba(0,0,0,0)");
  f.globalCompositeOperation = "destination-out";
  f.fillStyle = edge;
  f.fillRect(0, 0, x0 + fade * 0.9, c.height);
  f.restore();
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, c.width * k, c.height * k);
  ctx.restore();
}

/** Night: the board darkened, with pools of light around lamps, fires and the night folk (quarter resolution, smoothed up). */
function drawNight(ctx: CanvasRenderingContext2D, s: GarrisonState, m: FieldFx): void {
  const k = 4;
  const c = m.dark ?? canvas(WORLD_W / k, BOARD.H / k);
  if (!c) return;
  m.dark = c;
  const dctx = c.getContext("2d");
  if (!dctx) return;
  dctx.globalCompositeOperation = "source-over";
  dctx.clearRect(0, 0, c.width, c.height);
  dctx.fillStyle = "rgba(6,10,32,0.42)";
  dctx.fillRect(0, 0, c.width, c.height);
  dctx.globalCompositeOperation = "destination-out";
  const hole = (x: number, y: number, r: number) => drawGlow(dctx, "rgba(0,0,0,1)", x / k, y / k, r / k);
  for (const d of s.defenders) {
    const def = DEFENDERS[d.kind];
    if (!def || d.dead) continue;
    const x = tileX(d.col + 0.5);
    const y = feetY(d.lane) - 50;
    if (def.light) hole(x, y, 250);
    else if (def.landmark || def.ignite || def.burnAura || def.nocturnal) hole(x, y, 120);
  }
  for (const p of s.pickups) hole(tileX(p.x), BOARD.TOP + p.y * BOARD.LANE_H, 50);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, WORLD_W, BOARD.H);
  ctx.restore();
}

function drawTrots(ctx: CanvasRenderingContext2D, m: FieldFx, now: number): void {
  const atlas = atlasFor(DEFENDERS["oc-boar"]?.sprite ?? "boar");
  m.trots = m.trots.filter((t) => now - t.start < 1100);
  if (!atlas) return;
  const frames = Math.max(1, groupFrames(atlas, G.move));
  for (const t of m.trots) {
    const u = (now - t.start) / 1100;
    ctx.save();
    ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    drawAtlas(ctx, atlas, G.move, Math.floor((now - t.start) / 60) % frames, t.x - u * 260, t.y, 0.8, true);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Events -> presentation

function tileCentre(lane: number, col: number): { x: number; y: number } {
  return { x: tileX(col + 0.5), y: feetY(lane) };
}

/** A spell FX sheet (src/data/fx-manifest.json) played once at a point. */
function sheetFx(view: View, key: string, x: number, y: number, width: number, now: number, filter?: string): void {
  const sheet = fxSheet(key);
  if (sheet) view.fx.push({ t: "sheet", sheet, x, y, width, start: now, filter });
}

export function fieldEventFx(view: View, s: GarrisonState, ev: GarrisonEvent, now: number): void {
  const m = fxOf(view);
  switch (ev.e) {
    case "raft":
    case "crate": {
      const p = tileCentre(ev.lane, ev.col);
      burst(view.particles, now, ev.e === "raft" ? "chip" : "dust", p.x, p.y - 10, 10, { speed: 0.12, up: 0.1, life: 600, size: 5, colors: ev.e === "raft" ? ["#cfeef5", "#8ac6d8"] : ["rgba(120,90,50,0.8)"], ground: p.y });
      view.fx.push({ t: "ring", x: p.x, y: p.y - 8, color: ev.e === "raft" ? "#bfe8f0" : "#e0c080", start: now, radius: 55 });
      sheetFx(view, ev.e === "raft" ? "protect-water" : "protect-earth", p.x, p.y - 40, 90, now);
      break;
    }
    case "burn": {
      const p = tileCentre(ev.lane, ev.col);
      burst(view.particles, now, "ember", p.x, p.y - 30, 14, { speed: 0.18, up: 0.15, life: 700, size: 3, colors: ["#ffb040", "#ff6a20", "#ffe080"] });
      sheetFx(view, "fire-wall-b", p.x, p.y + 8, 100, now);
      burst(view.particles, now + 100, "smoke", p.x, p.y - 20, 6, { speed: 0.05, up: 0.06, life: 1200, size: 10, colors: ["rgba(60,50,45,0.6)"] });
      break;
    }
    case "melt": {
      const p = tileCentre(ev.lane, ev.col);
      burst(view.particles, now, "smoke", p.x, p.y - 14, 5, { speed: 0.04, up: 0.08, life: 900, size: 9, colors: ["rgba(235,245,255,0.6)"] });
      sheetFx(view, "protect-water", p.x, p.y - 30, 70, now);
      break;
    }
    case "iced": {
      const p = tileCentre(ev.lane, ev.col);
      if (Math.random() < 0.5) burst(view.particles, now, "glint", p.x, p.y - 20, 3, { speed: 0.08, life: 500, size: 2.2, colors: ["#e6f8ff", "#ffffff"] });
      if (Math.random() < 0.35) sheetFx(view, "ice-bolt-hit", p.x, p.y - 20, 70, now);
      break;
    }
    case "crater": {
      const p = tileCentre(ev.lane, ev.col);
      burst(view.particles, now + 200, "chip", p.x, p.y - 20, 18, { speed: 0.35, up: 0.3, g: 0.0015, life: 900, size: 5, colors: ["#3a2a1a", "#5a4028", "#ff8a3a"], ground: p.y });
      sheetFx(view, "quicksand", p.x, p.y - 6, 120, now + 300, "sepia(0.6) brightness(0.7)");
      break;
    }
    case "strike": {
      const p = tileCentre(ev.lane, ev.col);
      view.fx.push({ t: "bolt", x: p.x, top: 0, bottom: p.y, start: now });
      view.fx.push({ t: "ring", x: p.x, y: p.y - 6, color: "#fff4b0", start: now, radius: 70 });
      sheetFx(view, "lightning-crackle", p.x, p.y - 40, 110, now);
      burst(view.particles, now, "spark", p.x, p.y - 20, 12, { speed: 0.3, life: 350, size: 2.6, colors: ["#fffbe0", "#bcd8ff"] });
      m.flashAt = now;
      view.shakeUntil = Math.max(view.shakeUntil, now + 180);
      break;
    }
    case "weather":
      if (ev.kind === "thunderstorm") m.flashAt = now;
      break;
    case "emerge": {
      const e = s.enemies.find((unit) => unit.id === ev.id);
      if (!e) break;
      const x = tileX(e.x);
      const y = feetY(e.lane);
      if (ev.origin === "water") {
        burst(view.particles, now, "chip", x, y - 8, 14, { speed: 0.25, up: 0.3, g: 0.0014, life: 700, size: 3.5, colors: ["#cfeef5", "#7fb8c8", "#ffffff"], ground: y });
        view.fx.push({ t: "ring", x, y: y - 4, color: "#bfe8f0", start: now, radius: 60 });
        sheetFx(view, "protect-water", x, y - 36, 90, now);
      } else if (ev.origin === "sky") {
        burst(view.particles, now + 650, "dust", x, y - 4, 10, { speed: 0.12, life: 700, size: 9, colors: ["rgba(140,120,90,0.8)"] });
        view.fx.push({ t: "ring", x, y: y - 4, color: "#e8d8b0", start: now + 650, radius: 60 });
      } else if (ev.origin === "crypt") {
        burst(view.particles, now, "soul", x, y - 30, 4, { speed: 0.04, up: 0.05, life: 900, size: 10, colors: ["rgba(150,255,170,0.5)"] });
        sheetFx(view, "curse", x, y - 50, 80, now);
      } else {
        burst(view.particles, now, "chip", x, y - 8, 14, { speed: 0.3, up: 0.35, g: 0.0015, life: 800, size: 4.5, colors: ["#5a4028", "#7a5a38", "#3a2a16"], ground: y });
      }
      break;
    }
    case "chew": {
      const d = s.defenders.find((unit) => unit.id === ev.id);
      if (d) view.floats.push({ text: "Nom!", x: tileX(d.col + 0.5), y: feetY(d.lane) - 95, color: "#ffd9a0", start: now });
      break;
    }
    case "tombEaten": {
      const p = tileCentre(ev.lane, ev.col);
      if (ev.kind) {
        burst(view.particles, now, "chip", p.x, p.y - 30, 16, { speed: 0.3, up: 0.3, g: 0.0014, life: 800, size: 4, colors: ["#8a8478", "#6a645a", "#4a3a28"], ground: p.y });
        view.floats.push({ text: "Gulp!", x: p.x, y: p.y - 110, color: "#ffd9a0", start: now });
        sheetFx(view, "dispel", p.x, p.y - 45, 100, now);
      }
      m.trots.push({ x: p.x, y: p.y, start: now });
      break;
    }
    case "loot":
      view.floats.push({ text: `Pinched ${ev.value} g!`, x: tileX(ev.x), y: feetY(ev.lane) - 110, color: "#ffd65a", start: now });
      burst(view.particles, now, "coinbit", tileX(ev.x), feetY(ev.lane) - 30, 8, { speed: 0.2, up: 0.15, life: 500, size: 3, colors: ["#ffd65a", "#fff0a0"] });
      break;
    case "chestOpen":
      burst(view.particles, now, "coinbit", tileX(ev.x), feetY(ev.lane) - 30, 18, { speed: 0.3, up: 0.25, life: 700, size: 3.2, colors: ["#ffd65a", "#fff0a0", "#ffb030"] });
      view.floats.push({ text: `+${ev.value} gold`, x: tileX(ev.x), y: feetY(ev.lane) - 100, color: "#ffe27a", start: now });
      sheetFx(view, "fortune", tileX(ev.x), feetY(ev.lane) - 50, 90, now);
      break;
    case "bankFreed": {
      const p = tileCentre(ev.lane, ev.col);
      view.fx.push({ t: "pillar", x: p.x, y: p.y, rgb: "255,214,90", start: now });
      sheetFx(view, "bless", p.x, p.y - 50, 110, now);
      view.floats.push({ text: `${DEFENDERS[ev.kind as DefKind]?.name ?? "A troop"} joins you!`, x: p.x, y: p.y - 130, color: "#ffe27a", start: now });
      break;
    }
    case "wake": {
      const e = s.enemies.find((unit) => unit.id === ev.id);
      if (e) {
        view.floats.push({ text: "!", x: tileX(e.x), y: feetY(e.lane) - 110, color: "#ff8a6a", start: now });
        sheetFx(view, "berserk", tileX(e.x), feetY(e.lane) - 60, 70, now);
      }
      break;
    }
    case "shotBlocked":
      burst(view.particles, now, "chip", tileX(ev.x), feetY(ev.lane) - 48, 4, { speed: 0.15, up: 0.1, g: 0.001, life: 400, size: 2.6, colors: ["#b8b0a0", "#80786a"] });
      break;
    case "lull": {
      const d = s.defenders.find((unit) => unit.id === ev.target);
      if (!d) break;
      const x = tileX(d.col + 0.5);
      const y = feetY(d.lane);
      spawnParticles(view.particles, now, 10, (i) => ({
        kind: "soul", x: x + (Math.random() - 0.5) * 50, y: y - 40 - Math.random() * 40, vx: (Math.random() - 0.5) * 0.02, vy: -0.03,
        life: 900 + i * 40, size: 7, color: "rgba(190,160,255,0.55)"
      }));
      view.floats.push({ text: "Zzz…", x, y: y - 110, color: "#cdb8ff", start: now });
      sheetFx(view, "forgetfulness", x, y - 55, 90, now);
      break;
    }
    case "brew": {
      const d = s.defenders.find((unit) => unit.id === ev.id);
      if (!d) break;
      const x = tileX(d.col + 0.5);
      const y = feetY(d.lane);
      burst(view.particles, now, "smoke", x, y - 70, 6, { speed: 0.03, up: 0.07, life: 900, size: 8, colors: ["rgba(240,230,210,0.6)"] });
      view.floats.push({ text: "Awake!", x, y: y - 110, color: "#ffe9b0", start: now });
      sheetFx(view, "haste", x, y - 50, 90, now);
      break;
    }
    case "fogClear": {
      // A Sylph's gale tears the fog out of the lane: a gust of wind down it.
      const y = feetY(ev.lane) - 50;
      sheetFx(view, "protect-air", tileX(FIELD.fogLine + 0.5), y, 110, now);
      spawnParticles(view.particles, now, 12, (i) => ({
        kind: "smoke", x: tileX(FIELD.fogLine + (i % 6) * 0.7), y: y + (Math.random() - 0.5) * 60, vx: 0.35, vy: 0,
        life: 700, size: 14, color: "rgba(215,222,228,0.55)"
      }));
      break;
    }
    default:
      break;
  }
}

/** The painted field art this battle can show. */
export function preloadField(cfg: GarrisonConfig): void {
  const oc = cfg.oc;
  if (!oc) return;
  const kinds = new Set((oc.tiles ?? []).map((t) => t.kind));
  if (kinds.has("roof") || kinds.has("ridge")) {
    image(FIELD_ART.roofTile);
    image(FIELD_ART.crate);
  }
  if (kinds.has("water")) image(FIELD_ART.raft);
  if (kinds.has("bridge")) image(FIELD_ART.bridge);
  if (kinds.has("ruins")) image(FIELD_ART.ruins);
  if (kinds.has("bramble")) image(FIELD_ART.bramble);
  if (kinds.has("clover")) image(FIELD_ART.clover);
  for (const spot of oc.landmarks ?? []) {
    const art = LANDMARK[DEFENDERS[spot.kind]?.landmark ?? ""];
    if (art) image(art.src);
  }
  for (const spot of [...(oc.structures ?? []), ...(oc.banks ?? [])]) {
    const def = ENEMIES[spot.kind];
    if (def?.crypt) image(FIELD_ART.crypt);
    if (def?.chest) image(FIELD_ART.chest);
    if (def?.bank) image(FIELD_ART.bank);
  }
}
