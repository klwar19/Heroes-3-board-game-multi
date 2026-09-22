"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { combatScriptsActiveForCombat, type GameState } from "@/engine";
import { denseFogThisRound } from "@/engine/battlefield-condition-fog";
import { getBattlefieldCondition, type BattlefieldConditionId } from "@/data/battlefield-conditions";
import { assetUrl } from "@/lib/asset-url";
import {
  atmosphereNoise, BATTLEFIELD_ATMOSPHERES, CONDITION_ATMOSPHERE, SCRIPT_ATMOSPHERE,
  type BattlefieldAtmosphereTheme
} from "@/lib/battlefield-atmosphere";
import { playBattlefieldEntrance } from "@/lib/battlefield-audio";
import styles from "./battlefield-environment.module.css";

/*
 * Whole-board weather, drawn procedurally on two canvases that bracket the
 * unit cards:
 *   ground — inside `.battlefield`, above the terrain art, below the cells.
 *            Wet mud, lava cracks, heat shimmer, settled ash, splash motifs.
 *   sky    — inside `.battlefieldFrame`, above everything. Fog, falling ash,
 *            embers, leaves, wisps, light shafts, colour grade.
 * Each condition stacks four kinds of layer (grade, scrolling noise texture,
 * particles with depth planes, one ground reaction) so nothing tiles or
 * repeats. The Codex 4x4 sheets are used only as LOCAL motifs: one or two
 * board cells at a time play a 16-frame loop (a mud bubble, a flame, a rock
 * fall), then the emitter rests and moves to another cell. Never a uniform
 * wallpaper of the same sprite.
 */

const FX = "/fx/battlefield";
const ATLAS = `${FX}/atmosphere-atlas.webp`;
/** Visual board: engine rows become columns (5 across), engine columns rows (4 down). */
const COLS = 5;
const ROWS = 4;
const NOISE_SIZE = 256;

type Layer = { theme: BattlefieldAtmosphereTheme; sheet?: string; condition?: BattlefieldConditionId };
type Plane = "ground" | "sky";

const observedIntros = new Set<string>();
const signed = (value: number) => value > 0 ? `+${value}` : String(value);

function wasIntroduced(key: string): boolean {
  if (observedIntros.has(key)) return true;
  try { return typeof window !== "undefined" && window.sessionStorage.getItem(`battlefield-intro:${key}`) === "1"; }
  catch { return false; }
}

/** Deterministic LCG so both seats and every re-render agree on motif cells. */
function seededRandom(seedText: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619) >>> 0;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

let noiseTexture: HTMLCanvasElement | null = null;
/** One tileable value-noise texture shared by every fog/smoke/heat layer. */
function getNoiseTexture(): HTMLCanvasElement | null {
  if (noiseTexture) return noiseTexture;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = NOISE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(NOISE_SIZE, NOISE_SIZE);
  const grid = 8;
  const cells = NOISE_SIZE / grid;
  const lattice = Array.from({ length: grid * grid }, (_, i) => atmosphereNoise(i * 7.31 + 3));
  const smooth = (x: number) => x * x * (3 - 2 * x);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      let value = 0;
      let amplitude = .5;
      let frequency = 1;
      for (let octave = 0; octave < 3; octave++) {
        const gx = (x * frequency / cells) % grid;
        const gy = (y * frequency / cells) % grid;
        const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = (x0 + 1) % grid, y1 = (y0 + 1) % grid;
        const sx = smooth(gx - x0), sy = smooth(gy - y0);
        const a = lattice[y0 * grid + x0], b = lattice[y0 * grid + x1], c = lattice[y1 * grid + x0], d = lattice[y1 * grid + x1];
        value += amplitude * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
        amplitude *= .5;
        frequency *= 2;
      }
      const i = (y * NOISE_SIZE + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(value * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  noiseTexture = canvas;
  return canvas;
}


let veinTexture: HTMLCanvasElement | null = null;
/** Thin glowing veins where the noise crosses its midline: lava cracks. */
function getVeinTexture(): HTMLCanvasElement | null {
  if (veinTexture) return veinTexture;
  const noise = getNoiseTexture();
  if (!noise) return null;
  const source = noise.getContext("2d")?.getImageData(0, 0, NOISE_SIZE, NOISE_SIZE);
  if (!source) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = NOISE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(NOISE_SIZE, NOISE_SIZE);
  for (let i = 0; i < source.data.length; i += 4) {
    const value = source.data[i + 3] / 255;
    const vein = Math.max(0, 1 - Math.abs(value - .5) / .012);
    image.data[i] = 255; image.data[i + 1] = 150; image.data[i + 2] = 40;
    image.data[i + 3] = Math.round(Math.pow(vein, 1.5) * 255);
  }
  ctx.putImageData(image, 0, 0);
  veinTexture = canvas;
  return canvas;
}

const loaded = (image: HTMLImageElement | undefined): image is HTMLImageElement =>
  Boolean(image && image.complete && image.naturalWidth > 0);

export function BattlefieldEnvironment({ state, boardArtId, plane = "sky" }: {
  state: GameState;
  boardArtId?: string;
  /** Which canvas this instance paints. Mount one of each around the cells. */
  plane?: Plane;
}) {
  const combat = state.combat;
  const condition = combat?.battlefieldCondition;
  const conditionId = condition?.id;
  const scriptIds = combat ? combatScriptsActiveForCombat(state, combat).map((script) => script.id).join("|") : "";
  const layers = useMemo<Layer[]>(() => {
    const result: Layer[] = [];
    if (conditionId && CONDITION_ATMOSPHERE[conditionId]) {
      const sheet = ["sinking-mud", "scorching-earth", "rocky-terrain", "raining-ash", "dense-fog"].includes(conditionId)
        ? `${FX}/${conditionId}-sheet.webp` : undefined;
      result.push({ theme: CONDITION_ATMOSPHERE[conditionId], sheet, condition: conditionId });
    }
    for (const id of scriptIds.split("|").filter(Boolean)) {
      const theme = SCRIPT_ATMOSPHERE[id] ?? "void";
      if (!result.some((layer) => layer.theme === theme)) result.push({ theme });
    }
    // Snow decorates an enabled condition on a frozen board, never adds a rule.
    if (result.length > 0 && boardArtId === "frozen" && !result.some((layer) => layer.theme === "snow")) result.push({ theme: "snow" });
    return result;
  }, [conditionId, scriptIds, boardArtId]);
  // Dense Fog rolls in and lifts between rounds (engine-authoritative): the
  // heavy fog layers fade toward a thin haze on lifted rounds and back.
  const fogThick = conditionId !== "dense-fog" || denseFogThisRound(combat);
  const fogRef = useRef(fogThick ? 1 : 0.18);
  useEffect(() => { fogRef.current = fogThick ? 1 : 0.18; }, [fogThick]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const combatKey = combat ? `${state.id}:${combat.id}` : "";
  const finished = Boolean(combat?.outcome);
  const openingRound = (combat?.round ?? 0) <= 1;
  const rollDice = condition?.source === "dice";

  useEffect(() => {
    if (plane !== "sky" || !combatKey || !layers.length || finished || !openingRound) return;
    let stop = () => undefined as void;
    // Deferring the claim avoids React StrictMode's effect probe consuming it.
    const timer = window.setTimeout(() => {
      stop = playBattlefieldEntrance(combatKey, layers[0].theme, rollDice);
    }, 30);
    return () => { window.clearTimeout(timer); stop(); };
  }, [plane, combatKey, layers, finished, openingRound, rollDice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layers.length) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const noise = getNoiseTexture();
    const random = seededRandom(`${combatKey}#${plane}`);
    let width = 1;
    let height = 1;
    let frame = 0;
    let lastPaint = 0;
    let elapsed = 0;
    let previousTime = 0;
    let disposed = false;
    let inView = true;
    const atlas = new Image();
    const sheets = new Map<string, HTMLImageElement>();
    const images = [atlas];
    const density = () => width < 550 ? .6 : 1;

    // ---- shared primitives -------------------------------------------------
    const cellCenter = (col: number, row: number) => ({ x: (col + .5) / COLS * width, y: (row + .5) / ROWS * height });
    const cellSize = () => Math.min(width / COLS, height / ROWS);

    const drawNoise = (ox: number, oy: number, scale: number, alpha: number, composite: GlobalCompositeOperation = "source-over", tint?: string) => {
      if (!noise) return;
      const size = NOISE_SIZE * scale;
      const sx = ((ox % size) + size) % size;
      const sy = ((oy % size) + size) % size;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      for (let y = -sy; y < height; y += size) for (let x = -sx; x < width; x += size) ctx.drawImage(noise, x, y, size, size);
      if (tint) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    };

    const sprite = (image: HTMLImageElement | undefined, tile: number, x: number, y: number, size: number, angle: number, alpha: number, stretch = 1) => {
      if (!loaded(image)) return;
      const cellWidth = image.naturalWidth / 4;
      const cellHeight = image.naturalHeight / 4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(image, (tile % 4) * cellWidth, Math.floor(tile / 4) * cellHeight,
        cellWidth, cellHeight, -size / 2, -size * stretch / 2, size, size * stretch);
      ctx.restore();
    };

    const wash = (color: string, alpha: number, composite: GlobalCompositeOperation = "source-over") => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = composite;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    };

    const vignette = (color: string, alpha: number, inner = .35) => {
      const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * inner, width / 2, height / 2, Math.max(width, height) * .75);
      gradient.addColorStop(0, `${color}00`);
      gradient.addColorStop(1, color + Math.round(alpha * 255).toString(16).padStart(2, "0"));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    };

    /**
     * Local motif emitter: a 16-frame sheet loop at one board cell, then a
     * rest, then another cell. Two per condition so the field feels alive in
     * one or two places instead of everywhere at once.
     */
    type Emitter = { col: number; row: number; start: number; duration: number; rest: number; scale: number; flip: boolean };
    const emitters = new Map<string, Emitter[]>();
    const emitter = (key: string, index: number, time: number, duration: number, rest: number): Emitter => {
      const list = emitters.get(key) ?? [];
      emitters.set(key, list);
      let current = list[index];
      if (!current) {
        current = { col: 0, row: 0, start: -1, duration, rest, scale: 1, flip: false };
        list[index] = current;
        // The first emitter is mid-loop at combat start; siblings stagger.
        current.start = time - (index === 0 ? random() * duration * .5 : random() * (duration + rest));
        current.col = Math.floor(random() * COLS);
        current.row = Math.floor(random() * ROWS);
      }
      if (time - current.start > current.duration + current.rest) {
        // Move to a different cell than the sibling emitter is using.
        let col = current.col, row = current.row;
        for (let tries = 0; tries < 6; tries++) {
          col = Math.floor(random() * COLS);
          row = Math.floor(random() * ROWS);
          if (!list.some((other) => other !== current && other.col === col && other.row === row)) break;
        }
        current.col = col;
        current.row = row;
        current.start = time;
        current.scale = .85 + random() * .35;
        current.flip = random() < .5;
      }
      return current;
    };
    const motif = (image: HTMLImageElement | undefined, key: string, index: number, time: number, options: {
      duration: number; rest: number; fps: number; size: number; alpha: number; lift?: number; once?: boolean;
    }) => {
      const e = emitter(key, index, time, options.duration, options.rest);
      const age = time - e.start;
      if (age > e.duration || !loaded(image)) return;
      const progress = age / e.duration;
      const tile = options.once ? Math.min(15, Math.floor(progress * 16)) : Math.floor(age * options.fps) % 16;
      const fade = Math.min(1, progress * 6, (1 - progress) * 6);
      const { x, y } = cellCenter(e.col, e.row);
      ctx.save();
      if (e.flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      sprite(image, tile, x, y - (options.lift ?? 0) * cellSize(), cellSize() * options.size * e.scale, 0, options.alpha * fade);
      ctx.restore();
    };

    // ---- terrain access for the ground plane -------------------------------
    const terrain = () => {
      const image = canvas.parentElement?.querySelector<HTMLImageElement>("img.battlefieldTerrain");
      return loaded(image ?? undefined) ? image : null;
    };
    const mirrored = () => Boolean(canvas.closest(".boardFelt.flipped"));
    /** Redraw terrain strips with a sine offset: heat haze without WebGL. */
    const shimmer = (time: number, strength: number, fromY: number) => {
      const image = terrain();
      if (!image) return;
      const scaleY = height / image.naturalHeight;
      const step = Math.max(2, Math.round(height / 90));
      ctx.save();
      if (mirrored()) { ctx.translate(width, 0); ctx.scale(-1, 1); }
      ctx.globalAlpha = .7;
      for (let y = fromY; y < height; y += step) {
        const depth = (y - fromY) / (height - fromY);
        const offset = Math.sin(y * .07 + time * 5.5) * strength * cellSize() * .06 * depth;
        ctx.drawImage(image, 0, y / scaleY, image.naturalWidth, step / scaleY, offset, y, width, step);
      }
      ctx.restore();
    };

    // ---- particle pools -----------------------------------------------------
    type Particle = { x: number; y: number; z: number; phase: number; spin: number; life: number; kind: number };
    const pools = new Map<string, Particle[]>();
    const pool = (key: string, count: number, init?: (p: Particle, i: number) => void): Particle[] => {
      let list = pools.get(key);
      const wanted = Math.ceil(count * density());
      if (!list || list.length !== wanted) {
        list = Array.from({ length: wanted }, (_, i) => {
          const p: Particle = { x: random(), y: random(), z: random(), phase: random() * 6.283, spin: random() * 6.283, life: random(), kind: i };
          init?.(p, i);
          return p;
        });
        pools.set(key, list);
      }
      return list;
    };
    const ripples: { x: number; y: number; age: number; bubble: boolean }[] = [];
    let fogLevel = fogRef.current;
    let gust = 0;
    let gustTimer = 1.5;

    // ---- condition renderers -------------------------------------------------
    const renderers: Record<string, (time: number, dt: number, layer: Layer, k: number) => void> = {
      // Dense Fog: grade, three parallax noise planes, far-side fade, cloud motifs.
      fog(time, _dt, layer, k) {
        // Ease toward this round's engine-decided density; static paints snap.
        fogLevel = _dt > 0 ? fogLevel + (fogRef.current - fogLevel) * Math.min(1, _dt * .8) : fogRef.current;
        // Presentation only (user request 2026-09-23): while the engine says
        // the fog is thick, the banks still drift in and out on a slow cycle
        // (~22 s) so the units show through every so often. The ranged
        // disadvantage stays round-authoritative (denseFogThisRound); only the
        // paint breathes. Lifted rounds keep their thin haze untouched.
        const breath = .5 + .5 * Math.sin(time * (Math.PI * 2 / 22) - Math.PI / 2);
        const gap = Math.pow(breath, 3); // brief clear spells, long thick spells
        const thickShare = Math.max(0, Math.min(1, (fogLevel - .18) / .82));
        k *= fogLevel * (1 - thickShare * .78 * gap);
        if (plane === "ground") { wash("#9fb0b8", .12 * k, "source-over"); return; }
        wash("#c3ccd2", .14 * k);
        drawNoise(time * 14, time * 4, 2.6 * cellSize() / 90, .5 * k, "source-over", "#dfe7ec");
        drawNoise(-time * 26, time * 9, 1.5 * cellSize() / 90, .34 * k, "source-over", "#eef3f6");
        drawNoise(time * 44, -time * 7, .8 * cellSize() / 90, .2 * k, "screen");
        const sheet = layer.sheet ? sheets.get(layer.sheet) : undefined;
        for (const [i, p] of pool("fogClouds", 5).entries()) {
          const x = (((p.x + time * .012 * (.5 + p.z)) % 1.4) + 1.4) % 1.4 - .2;
          const y = p.y * .9 + Math.sin(time * .2 + p.phase) * .03;
          sprite(sheet, (i * 3 + Math.floor(time * 3)) % 16, x * width, y * height, cellSize() * (2.2 + p.z * 1.6), 0, .22 * k);
        }
        const far = ctx.createLinearGradient(0, 0, 0, height);
        far.addColorStop(0, `rgba(215,222,228,${.42 * k})`);
        far.addColorStop(.55, "rgba(215,222,228,0)");
        ctx.fillStyle = far;
        ctx.fillRect(0, 0, width, height);
      },
      // Raining Ash: warm horizon, smoke haze, three planes of flakes, embers, settled ash + ember motifs on the ground.
      ash(time, dt, layer, k) {
        const sheet = layer.sheet ? sheets.get(layer.sheet) : undefined;
        if (plane === "ground") {
          wash("#6b625c", .22 * k, "multiply");
          drawNoise(0, 0, 1.2 * cellSize() / 90, .18 * k, "multiply", "#4a4340");
          motif(sheet, "ashGlow", 0, time, { duration: 5, rest: 2, fps: 8, size: 1.1, alpha: .75 });
          motif(sheet, "ashGlow", 1, time, { duration: 4, rest: 3, fps: 8, size: .9, alpha: .65 });
          return;
        }
        const horizon = ctx.createLinearGradient(0, 0, 0, height);
        horizon.addColorStop(0, `rgba(255,120,40,${.16 * k})`);
        horizon.addColorStop(.6, "rgba(90,80,75,.1)");
        horizon.addColorStop(1, "rgba(60,60,60,.16)");
        ctx.fillStyle = horizon;
        ctx.fillRect(0, 0, width, height);
        drawNoise(-time * 10, time * 30, 2 * cellSize() / 90, .16 * k, "multiply", "#5a4f48");
        for (const p of pool("ash", 240)) {
          p.y += (.03 + p.z * .07) * k * dt;
          if (p.y > 1.02) { p.y = -.02; p.x = random(); }
          const drift = Math.sin(time * 1.3 + p.phase) * .012 * (1 - p.z);
          const size = cellSize() * (.004 + p.z * .012) * (.7 + (p.kind % 5) * .15);
          if (p.kind % 9 === 0) {
            const flicker = .5 + .5 * Math.sin(time * 9 + p.phase * 3);
            ctx.save();
            ctx.shadowColor = "#ff7a2a";
            ctx.shadowBlur = 8 * flicker;
            ctx.fillStyle = `rgba(255,${120 + 80 * flicker},40,${.5 + .5 * flicker})`;
            ctx.beginPath();
            ctx.arc((p.x + drift) * width, p.y * height, size * .7, 0, 7);
            ctx.fill();
            ctx.restore();
          } else {
            const grey = 150 + (p.kind % 7) * 12;
            ctx.fillStyle = `rgba(${grey},${grey - 4},${grey - 8},${.18 + p.z * .42})`;
            ctx.beginPath();
            ctx.ellipse((p.x + drift) * width, p.y * height, size, size * (1.3 + p.z), p.spin + time * (p.z - .5), 0, 7);
            ctx.fill();
          }
        }
      },
      // Scorching Earth: lava cracks and heat haze under the units, flames at one or two cells, embers above.
      heat(time, dt, layer, k) {
        const sheet = layer.sheet ? sheets.get(layer.sheet) : undefined;
        const pulse = .6 + .4 * Math.sin(time * 2.2);
        if (plane === "ground") {
          shimmer(time, .8 * k, height * .25);
          const veins = getVeinTexture();
          if (veins) {
            const size = NOISE_SIZE * 1.3 * cellSize() / 90;
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            for (const [blur, alpha] of [[5, .35], [0, .6]] as const) {
              ctx.filter = blur ? `blur(${blur}px)` : "none";
              ctx.globalAlpha = alpha * k * (.55 + .45 * pulse);
              for (let y = 0; y < height; y += size) for (let x = 0; x < width; x += size) ctx.drawImage(veins, x, y, size, size);
            }
            ctx.restore();
          }
          vignette("#a01e00", .38 * k, .3);
          motif(sheet, "flames", 0, time, { duration: 6, rest: 1.5, fps: 12, size: 1.25, alpha: .95, lift: .18 });
          motif(sheet, "flames", 1, time, { duration: 4.5, rest: 2.5, fps: 12, size: 1, alpha: .85, lift: .18 });
          return;
        }
        wash("#ff5a1a", .05 * k, "screen");
        for (const p of pool("embers", 110)) {
          p.y -= (.02 + p.z * .06) * k * dt;
          p.x += Math.sin(time * 2 + p.phase) * .01 * dt;
          if (p.y < -.02) { p.y = 1.02; p.x = random(); }
          const flicker = .5 + .5 * Math.sin(time * 8 + p.phase);
          ctx.fillStyle = `rgba(255,${100 + 100 * flicker},30,${.25 + .6 * p.z})`;
          ctx.beginPath();
          ctx.arc(p.x * width, p.y * height, cellSize() * (.006 + p.z * .02), 0, 7);
          ctx.fill();
        }
      },
      // Sinking Mud: wet dark ground, specular sweep, ripples and bubbles, mud-splash motifs. Nothing in the sky.
      mud(time, dt, layer, k) {
        if (plane !== "ground") return;
        const sheet = layer.sheet ? sheets.get(layer.sheet) : undefined;
        wash("#2a1d12", .42 * k, "multiply");
        drawNoise(time * 2, 0, 1.5 * cellSize() / 90, .22 * k, "multiply", "#3d2c1c");
        const sweep = ((time * .12) % 1.6) - .3;
        const sheen = ctx.createLinearGradient(sweep * width, 0, (sweep + .35) * width, height);
        sheen.addColorStop(0, "rgba(220,205,180,0)");
        sheen.addColorStop(.5, `rgba(220,205,180,${.1 * k})`);
        sheen.addColorStop(1, "rgba(220,205,180,0)");
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, width, height);
        if (random() < dt * 3.5 * k) {
          ripples.push({ x: (Math.floor(random() * COLS) + .2 + random() * .6) / COLS, y: (Math.floor(random() * ROWS) + .2 + random() * .6) / ROWS, age: 0, bubble: random() < .5 });
        }
        ctx.lineWidth = Math.max(1.5, cellSize() * .022);
        for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i];
          r.age += dt * 1.1;
          if (r.age > 1) { ripples.splice(i, 1); continue; }
          const radius = r.age * cellSize() * .28;
          const alpha = (1 - r.age) * .85 * k;
          const x = r.x * width, y = r.y * height;
          if (r.bubble && r.age < .4) {
            ctx.fillStyle = "rgba(70,52,34,.85)";
            ctx.beginPath();
            ctx.ellipse(x, y - r.age * 6, cellSize() * (.06 - r.age * .08), cellSize() * (.045 - r.age * .07), 0, 0, 7);
            ctx.fill();
          }
          ctx.strokeStyle = `rgba(190,168,132,${alpha})`;
          ctx.beginPath();
          ctx.ellipse(x, y, radius, radius * .45, 0, 0, 7);
          ctx.stroke();
          ctx.strokeStyle = `rgba(160,140,110,${alpha * .5})`;
          ctx.beginPath();
          ctx.ellipse(x, y, radius * .6, radius * .27, 0, 0, 7);
          ctx.stroke();
        }
        motif(sheet, "mudPop", 0, time, { duration: 2.4, rest: 2, fps: 7, size: .9, alpha: .9, once: true });
        motif(sheet, "mudPop", 1, time, { duration: 2.4, rest: 3.2, fps: 7, size: .75, alpha: .85, once: true });
      },
      // Rocky Terrain: cooler grade, rock-fall bursts at one or two cells, drifting dust above.
      rock(time, dt, layer, k) {
        const sheet = layer.sheet ? sheets.get(layer.sheet) : undefined;
        if (plane === "ground") {
          wash("#7d8797", .1 * k, "multiply");
          motif(sheet, "rockfall", 0, time, { duration: 2.2, rest: 1.6, fps: 8, size: 1.15, alpha: .95, once: true, lift: .1 });
          motif(sheet, "rockfall", 1, time, { duration: 2.2, rest: 2.8, fps: 8, size: .95, alpha: .9, once: true, lift: .1 });
          return;
        }
        for (const p of pool("dust", 22)) {
          p.life += dt * .45;
          if (p.life > 1) { p.life = 0; p.x = random(); p.y = .25 + random() * .75; }
          p.x += (.02 + p.z * .03) * dt;
          const alpha = Math.sin(p.life * Math.PI) * .16 * k;
          const radius = cellSize() * (.06 + p.life * .2);
          const puff = ctx.createRadialGradient(p.x * width, (p.y - p.life * .02) * height, 0, p.x * width, (p.y - p.life * .02) * height, radius);
          puff.addColorStop(0, `rgba(190,178,156,${alpha * .9})`);
          puff.addColorStop(1, "rgba(190,178,156,0)");
          ctx.fillStyle = puff;
          ctx.beginPath();
          ctx.arc(p.x * width, (p.y - p.life * .02) * height, radius, 0, 7);
          ctx.fill();
        }
      },
      // Fey Trickery: oscillating violet/green grade, glowing wandering cells, wisps with trails.
      fey(time, _dt, _layer, k) {
        const hue = Math.sin(time * .6) > 0 ? 280 : 130;
        const other = hue === 280 ? 130 : 280;
        if (plane === "ground") {
          wash(`hsl(${hue},60%,45%)`, .12 * k, "screen");
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.lineWidth = Math.max(1.5, cellSize() * .02);
          for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) {
            const wave = Math.sin(time * 1.4 + col * 1.7 + row * 2.3);
            if (wave < .55) continue;
            const alpha = (wave - .55) / .45 * .5 * k;
            ctx.strokeStyle = `hsla(${other},90%,70%,${alpha})`;
            ctx.strokeRect(col / COLS * width + 3, row / ROWS * height + 3, width / COLS - 6, height / ROWS - 6);
          }
          ctx.restore();
          return;
        }
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const p of pool("wisps", 22)) {
          const x = p.x + Math.sin(time * (.6 + p.z * .8) + p.phase) * .08;
          const y = p.y + Math.sin(time * (.5 + p.z * .6) + p.spin) * .06;
          const tone = p.kind % 2 ? 275 : 120;
          for (let t = 0; t < 10; t++) {
            const back = t * .07;
            const tx = p.x + Math.sin((time - back) * (.6 + p.z * .8) + p.phase) * .08;
            const ty = p.y + Math.sin((time - back) * (.5 + p.z * .6) + p.spin) * .06;
            const fade = 1 - t / 10;
            ctx.fillStyle = `hsla(${tone},95%,75%,${fade * .35 * k})`;
            ctx.beginPath();
            ctx.arc(tx * width, ty * height, cellSize() * (.006 + fade * .02), 0, 7);
            ctx.fill();
          }
          ctx.shadowColor = `hsl(${tone},95%,70%)`;
          ctx.shadowBlur = 12;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x * width, y * height, cellSize() * .016, 0, 7);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      },
      // Tail Wind: leaves and dust streaks with gusts, atlas wind swirls sweeping across.
      wind(time, dt, _layer, k) {
        if (plane === "ground") return;
        gustTimer -= dt;
        if (gustTimer < 0) { gustTimer = 2 + random() * 3; gust = 1; }
        gust = Math.max(0, gust - dt * .6);
        const dir = mirrored() ? -1 : 1;
        const speed = (.18 + gust * .35) * k;
        for (const p of pool("wind", 170)) {
          p.x += dir * speed * (.5 + p.z) * dt;
          p.y += Math.sin(time * 3 + p.phase) * .02 * dt - .004 * dt;
          p.spin += dt * 4;
          if (dir > 0 ? p.x > 1.03 : p.x < -.03) { p.x = dir > 0 ? -.03 : 1.03; p.y = random(); }
          if (p.kind % 4 === 0) {
            ctx.save();
            ctx.translate(p.x * width, p.y * height);
            ctx.rotate(p.spin);
            ctx.fillStyle = `rgba(${150 + p.z * 60},${120 + p.z * 30},40,${.55 + p.z * .4})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, cellSize() * (.035 + p.z * .025), cellSize() * (.016 + p.z * .01), 0, 0, 7);
            ctx.fill();
            ctx.restore();
          } else {
            ctx.strokeStyle = `rgba(215,205,175,${.1 + p.z * .25})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x * width, p.y * height);
            ctx.lineTo((p.x - dir * (.03 + gust * .06) * (.5 + p.z)) * width, p.y * height + 1);
            ctx.stroke();
          }
        }
        for (const p of pool("swirls", 3)) {
          const x = (((p.x + dir * time * .07 * (.6 + p.z)) % 1.6) + 1.6) % 1.6 - .3;
          ctx.save();
          if (dir < 0) { ctx.translate(x * width, 0); ctx.scale(-1, 1); ctx.translate(-x * width, 0); }
          sprite(atlas, 7, x * width, (p.y * .8 + .1) * height, cellSize() * 2.4, 0, .22 * k, .65);
          ctx.restore();
        }
      },
      // Perfect Conditions: rotating light shafts, bright motes, warm lifted highlights.
      clear(time, dt, _layer, k) {
        if (plane === "ground") { wash("#ffe6b0", .1 * k, "screen"); return; }
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(width * (mirrored() ? .2 : .8), -height * .2);
        for (let i = 0; i < 7; i++) {
          const angle = (mirrored() ? 1.05 : 1.9) + i * .13 + Math.sin(time * .3 + i) * .04;
          const length = height * 1.9;
          const ray = ctx.createLinearGradient(0, 0, Math.cos(angle) * length, Math.sin(angle) * length);
          ray.addColorStop(0, `rgba(255,240,200,${.13 * k})`);
          ray.addColorStop(1, "rgba(255,240,200,0)");
          ctx.fillStyle = ray;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle - .03) * length, Math.sin(angle - .03) * length);
          ctx.lineTo(Math.cos(angle + .03) * length, Math.sin(angle + .03) * length);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        for (const p of pool("motes", 70)) {
          p.y -= (.01 + p.z * .015) * dt;
          p.x += Math.sin(time + p.phase) * .008 * dt;
          if (p.y < -.02) { p.y = 1.02; p.x = random(); }
          const twinkle = .5 + .5 * Math.sin(time * 2 + p.phase);
          ctx.save();
          ctx.shadowColor = "#fff2c0";
          ctx.shadowBlur = 6;
          ctx.fillStyle = `rgba(255,245,210,${twinkle * .8})`;
          ctx.beginPath();
          ctx.arc(p.x * width, p.y * height, cellSize() * (.006 + p.z * .012), 0, 7);
          ctx.fill();
          ctx.restore();
        }
      },
      // Clear Skies: no rule, so barely anything — a calm handful of drifting motes.
      sun(time, dt, _layer, k) {
        if (plane === "ground") return;
        for (const p of pool("calm", 24)) {
          p.y -= (.006 + p.z * .01) * dt;
          p.x += Math.sin(time * .7 + p.phase) * .006 * dt;
          if (p.y < -.02) { p.y = 1.02; p.x = random(); }
          const twinkle = .4 + .6 * Math.sin(time * 1.5 + p.phase);
          ctx.fillStyle = `rgba(255,248,225,${twinkle * .55 * k})`;
          ctx.beginPath();
          ctx.arc(p.x * width, p.y * height, cellSize() * (.005 + p.z * .009), 0, 7);
          ctx.fill();
        }
      },
    };

    /** PvE script atmospheres and snow: atlas tiles drifting on depth planes. */
    const genericLayer = (time: number, layer: Layer, k: number) => {
      const profile = BATTLEFIELD_ATMOSPHERES[layer.theme];
      const groundThemes: BattlefieldAtmosphereTheme[] = ["water", "quake", "mud"];
      const onGround = groundThemes.includes(layer.theme);
      if ((plane === "ground") !== onGround) {
        if (plane === "sky") vignette(profile.tint, .14 * k, .4);
        return;
      }
      for (const [i, p] of pool(`generic:${layer.theme}`, profile.count).entries()) {
        const speed = .6 + p.z * .8;
        const age = (time * (.1 + p.z * .06) + p.life) % 1;
        const breath = Math.sin(age * Math.PI);
        const wrap = (value: number) => ((value % 1.3) + 1.3) % 1.3 - .15;
        const x = wrap(p.x * 1.3 + time * profile.drift[0] * speed);
        const y = wrap(p.y * 1.3 + time * profile.drift[1] * speed);
        let size = Math.min(width, height) * profile.size * (.65 + p.z * .9);
        let alpha = profile.alpha * k * (.35 + breath * .65);
        let angle = Math.sin(i) * .18;
        if (layer.theme === "snow" || layer.theme === "dust") angle += time * (p.z - .5) * .55;
        if (onGround) { size *= .5 + age; alpha *= Math.sin(age * Math.PI); }
        sprite(atlas, profile.tile, x * width, y * height, size, angle, alpha,
          layer.theme === "rain" ? 1.4 : 1);
      }
    };

    const paint = (dt: number) => {
      ctx.clearRect(0, 0, width, height);
      const time = elapsed / 1000;
      const k = 1 / Math.sqrt(layers.length);
      for (const layer of layers) {
        const renderer = layer.condition ? renderers[layer.theme] : undefined;
        if (renderer) renderer(time, dt, layer, k);
        else genericLayer(time, layer, k);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const active = () => !disposed && !document.hidden && inView && !reduced.matches && !finished;
    const tick = (now: number) => {
      frame = 0;
      if (!active()) { previousTime = 0; return; }
      const step = previousTime ? Math.min(now - previousTime, 70) : 0;
      elapsed += step;
      previousTime = now;
      if (now - lastPaint >= 1000 / 30) { paint(Math.min(.07, (now - lastPaint) / 1000)); lastPaint = now; }
      frame = window.requestAnimationFrame(tick);
    };
    const resume = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      if (disposed) return;
      paint(0);
      if (active()) frame = window.requestAnimationFrame(tick);
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1600 / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      paint(0);
    };
    atlas.onload = resume;
    atlas.src = assetUrl(ATLAS);
    for (const layer of layers) {
      if (!layer.sheet) continue;
      const image = new Image();
      image.onload = resume;
      image.src = assetUrl(layer.sheet);
      sheets.set(layer.sheet, image);
      images.push(image);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const intersection = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      resume();
    });
    intersection?.observe(canvas);
    reduced.addEventListener("change", resume);
    document.addEventListener("visibilitychange", resume);
    resize();
    resume();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      intersection?.disconnect();
      reduced.removeEventListener("change", resume);
      document.removeEventListener("visibilitychange", resume);
      for (const image of images) image.onload = null;
      ctx.clearRect(0, 0, width, height);
    };
  }, [layers, finished, plane, combatKey]);

  if (!combat || !layers.length) return null;
  return <canvas ref={canvasRef} aria-hidden="true"
    className={plane === "ground" ? styles.ground : styles.atmosphere}
    data-battlefield-atmosphere={layers.map((layer) => layer.theme).join(" ")}
    data-battlefield-plane={plane} />;
}

export function BattlefieldConditionNotice({ state }: { state: GameState }) {
  const combat = state.combat;
  const condition = combat?.battlefieldCondition;
  if (!combat || !condition) return null;
  const definition = getBattlefieldCondition(condition.id);
  if (!definition) return null;
  return <ConditionNotice key={`${state.id}:${combat.id}`} combatKey={`${state.id}:${combat.id}`}
    condition={condition} name={definition.name} summary={definition.summary}
    fogThick={condition.id === "dense-fog" ? denseFogThisRound(combat) : null}
    opening={(combat.round ?? 0) <= 1 && !combat.outcome} />;
}

function ConditionNotice({ combatKey, condition, name, summary, opening, fogThick }: {
  combatKey: string;
  condition: NonNullable<NonNullable<GameState["combat"]>["battlefieldCondition"]>;
  name: string;
  summary: string;
  opening: boolean;
  /** Dense Fog only: is the fog thick THIS round? null for every other condition. */
  fogThick: boolean | null;
}) {
  const [animate] = useState(() => opening && !wasIntroduced(combatKey));
  const theme = CONDITION_ATMOSPHERE[condition.id] ?? "clear";
  const profile = BATTLEFIELD_ATMOSPHERES[theme];
  useEffect(() => {
    observedIntros.add(combatKey);
    try { window.sessionStorage.setItem(`battlefield-intro:${combatKey}`, "1"); } catch { /* Optional persistence. */ }
  }, [combatKey]);
  return (
    <details className={styles.notice} style={{ "--atmosphere-accent": profile.tint } as CSSProperties}>
      <summary className={styles.summary}>
        <span className={styles.ruleMarker} aria-hidden="true" />
        <span className={styles.heading}>
          <span className={styles.eyebrow}>Battlefield condition</span>
          <strong>{name}</strong>
        </span>
        {fogThick !== null ? (
          <span className={`${styles.fogState} ${fogThick ? styles.fogOn : styles.fogOff}`} role="status">
            {fogThick ? "Fog is thick" : "Fog has lifted"}
          </span>
        ) : null}
        {condition.source === "dice" ? (
          <span className={`${styles.dice} ${animate ? styles.roll : ""}`} aria-label={`First die ${signed(condition.dice[0])}, second die ${signed(condition.dice[1])}`}>
            {condition.dice.map((die, index) => (
              <span className={styles.die} key={index} aria-hidden="true" style={{ "--die-order": index } as CSSProperties}>
                <span>{signed(die)}</span><small>{index === 0 ? "I" : "II"}</small>
              </span>
            ))}
          </span>
        ) : <span className={styles.preset}>Scenario condition</span>}
        <span className={styles.disclosure} aria-hidden="true">⌄</span>
      </summary>
      <div className={styles.rule}>
        <p>{summary}</p>
        {fogThick !== null ? (
          <small>
            {fogThick
              ? "This round the fog is thick: ranged attacks roll with disadvantage."
              : "This round the fog has lifted: ranged attacks roll normally until it returns."}
          </small>
        ) : null}
        {condition.source === "dice" ? <small>Two ordered dice: {signed(condition.dice[0])} / {signed(condition.dice[1])}. {fogThick !== null ? "The fog rolls in and lifts round by round." : "This condition lasts for the battle."}</small> : null}
      </div>
    </details>
  );
}
