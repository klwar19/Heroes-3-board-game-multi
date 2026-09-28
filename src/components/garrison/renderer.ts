/**
 * Garrison Wars canvas renderer. Reads the simulation state (never writes it)
 * plus the tick's events, and keeps its own presentation memory (animation
 * phases, corpses, FX) in a View. Board coordinates are a fixed logical
 * 1400 x 660 canvas; the component scales it to the screen.
 */

import siegeArt from "@/data/battle-hex/siege-art.json";
import type { FxSheet } from "@/data/fx";
import {
  CARDS, DEFENDERS, ENEMIES, FUSIONS, GW_COLS, GW_LANES, GW_TPS, LAND_MINE_ARM, LOBBED, TERRAINS, upgradeChain,
  type CardId, type DefKind
} from "@/engine/garrison/content";
import { isStructure, type Defender, type Enemy, type GarrisonConfig, type GarrisonEvent, type GarrisonState } from "@/engine/garrison/sim";
import { G, SHOT_SHEETS, atlasFor, drawAtlas, drawFx, drawShot, fxSheet, groupFrames, image, pickGroup, preloadSprites, ready, type ShotSheet } from "./art";
import {
  KEEPS, KEEP_SRC, PROP, WORLD_W, burst, createScenery, keepFor, drawCoin, drawDecals, drawGlow, drawKeepFlags, drawParticles, sceneryLayer, spawnParticles,
  type Decal, type Particle, type Scenery
} from "./scene";

export const BOARD = { W: 1400, H: 660, LAWN_X: 250, TILE: 110, TOP: 55, LANE_H: 120 } as const;
const SPRITE_SCALE = 0.95;
const CELL = 90;

export const tileX = (x: number): number => BOARD.LAWN_X + x * BOARD.TILE;
export const laneTop = (lane: number): number => BOARD.TOP + lane * BOARD.LANE_H;
export const laneMid = (lane: number): number => laneTop(lane) + BOARD.LANE_H / 2;
export const feetY = (lane: number): number => laneTop(lane) + BOARD.LANE_H * 0.8;

/** Screen point -> lawn cell (null outside the lanes). */
export function boardCell(px: number, py: number): { lane: number; col: number; x: number } | null {
  const lane = Math.floor((py - BOARD.TOP) / BOARD.LANE_H);
  if (lane < 0 || lane >= GW_LANES) return null;
  const x = (px - BOARD.LAWN_X) / BOARD.TILE;
  if (x < -0.2 || x > 10.2) return null;
  return { lane, col: Math.max(0, Math.min(GW_COLS - 1, Math.floor(x))), x };
}

type Anim = { group: number; start: number; frameMs: number; frames: number };
type Corpse = { sprite: string; x: number; y: number; flip: boolean; scale: number; how: string; start: number; kind: "mine" | "unit" };
type FxInstance =
  | { t: "sheet"; sheet: FxSheet; x: number; y: number; width: number; start: number; filter?: string }
  | { t: "impact"; sheet: ShotSheet; x: number; y: number; width: number; start: number; flip: boolean; cell0?: number }
  | { t: "bolt"; x: number; top: number; bottom: number; start: number }
  | { t: "ring"; x: number; y: number; color: string; start: number; radius: number }
  | { t: "pillar"; x: number; y: number; rgb: string; start: number }
  | { t: "tracer"; x0: number; y0: number; x1: number; y1: number; start: number; rgb: string };
type Float = { text: string; x: number; y: number; color: string; start: number };

export type View = {
  /** Painted field + lawn + keep, composed once. */
  scenery: Scenery;
  particles: Particle[];
  decals: Decal[];
  /** Attackers whose shield or armour came off (they wear their bare sprite). */
  stripped: Set<number>;
  /** Defenders just raised / upgraded / fused: when (drop-in squash). */
  pop: Map<number, number>;
  /** Camera offset into the world (the level intro pans over the staging ground). */
  camX: number;
  /** Intro: the foes waiting beyond the road (kinds), drawn while the camera is out there. */
  lineup: string[] | null;
  /** Banner colour of the defending garrison (the keep's pennants). */
  defColor: string;
  /** Where each gold pickup was drawn last frame (board px): a collected coin flies from there. */
  coinPos: Map<number, { x: number; y: number }>;
  /** Bullets whose muzzle flash has been shown. */
  muzzled: Set<number>;
  /** When pruneView last ran. */
  prunedAt: number;
  phase: Map<string, number>;
  anim: Map<string, Anim>;
  flash: Map<string, number>;
  swoop: Map<number, { dx: number; start: number; dur: number }>;
  corpses: Corpse[];
  fx: FxInstance[];
  floats: Float[];
  aim: { lane: number; x: number; until: number }[];
  shakeUntil: number;
  lastNow: number;
  town: string;
  castle: HTMLCanvasElement | null;
  castleReady: number;
  banners: Map<string, HTMLCanvasElement>;
};

export function createView(town: string, defColor = "#3f7fe0"): View {
  return {
    scenery: createScenery(), particles: [], decals: [], stripped: new Set(), pop: new Map(), camX: 0, lineup: null, defColor, coinPos: new Map(), muzzled: new Set(), prunedAt: 0,
    phase: new Map(), anim: new Map(), flash: new Map(), swoop: new Map(), corpses: [], fx: [], floats: [], aim: [],
    shakeUntil: 0, lastNow: 0, town, castle: null, castleReady: -1, banners: new Map()
  };
}

// ---------------------------------------------------------------------------
// Events -> presentation

function defSprite(kind: DefKind): string {
  return DEFENDERS[kind]?.sprite ?? "";
}

/** An attacker's sprite: its bare body once the shield or armour has come off. */
export function enemySpriteOf(view: View, e: Pick<Enemy, "id" | "kind">): string {
  const def = ENEMIES[e.kind]!;
  return def.stripped && view.stripped.has(e.id) ? def.stripped : def.sprite;
}

/**
 * The Arch-vile's flame eruption (a Codex sheet: 4x4, luminous on black, keyed to alpha);
 * before it is available the Heroes III fire wall stands in.
 */
const ARCHVILE_FLAME: FxSheet = {
  src: "/assets/garrison/fx/archvile-flame.webp", label: "Arch-vile flame", group: "garrison", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 256, frameHeight: 256, fps: 20, anchor: "bottom", sourceDef: "imagegen-garrison-archvile-flame"
};

function flameAt(view: View, x: number, y: number, now: number): void {
  if (ready(image(ARCHVILE_FLAME.src))) view.fx.push({ t: "sheet", sheet: ARCHVILE_FLAME, x, y: y + 10, width: 170, start: now });
  else addSheet(view, "fire-wall-b", x, y + 8, 120, now);
  burst(view.particles, now + 250, "ember", x, y - 60, 14, { speed: 0.3, up: 0.25, g: 0.0005, life: 900, size: 3, colors: ["#ffd070", "#ff8a28"] });
}

/** Gun and flame attacks that land at once: a tracer from the muzzle, sparks where it hits. */
function hitscanFx(view: View, from: { x: number; y: number }, to: { x: number; y: number }, now: number): void {
  const sheet = SHOT_SHEETS.bullet;
  // The sheet's launch cells (0-3) are the muzzle flash.
  view.fx.push({ t: "impact", sheet, x: from.x, y: from.y, width: 60, start: now, flip: from.x > to.x, cell0: 0 });
  view.fx.push({ t: "tracer", x0: from.x, y0: from.y, x1: to.x, y1: to.y, start: now, rgb: "255,226,150" });
  burst(view.particles, now + 40, "spark", to.x, to.y, 6, { speed: 0.3, life: 220, size: 2.2, colors: ["#fff4c8", "#ffc45a"] });
}

const PIECE_ART: Record<"pot" | "helm" | "coffin" | "tome", { src: string; size: number; dy: number; dx: number }> = {
  pot: { src: PROP.pot, size: 30, dy: 84, dx: 2 },
  helm: { src: PROP.helm, size: 34, dy: 84, dx: 2 },
  coffin: { src: PROP.coffin, size: 74, dy: 48, dx: -22 },
  tome: { src: PROP.tome, size: 30, dy: 64, dx: -18 }
};

/** The shield / armour of an attacker tumbles off (it keeps fighting in its bare sprite). */
function dropPiece(view: View, e: { id: number; kind: string; lane: number; x: number; dir: 1 | -1 }, now: number): void {
  // From the event itself: on a killing blow the attacker is already gone from the state.
  view.stripped.add(e.id);
  const def = ENEMIES[e.kind]!;
  const x = tileX(e.x);
  const y = feetY(e.lane);
  if (def.piece) {
    const art = PIECE_ART[def.piece];
    const back = -e.dir;
    spawnParticles(view.particles, now, 1, () => ({
      kind: "piece", img: art.src, size: art.size, x: x - art.dx * back, y: y - art.dy * SPRITE_SCALE,
      vx: back * (0.09 + Math.random() * 0.05), vy: -0.42, g: 0.0016, life: 1700, rot: 0, vr: back * 0.012, ground: y - 6, flip: e.dir > 0
    }));
  }
  burst(view.particles, now, "chip", x, y - 70, 7, { speed: 0.3, up: 0.25, g: 0.0014, life: 700, size: 4, colors: ["#6b5a48", "#8a7a62", "#3e3326"], ground: y - 2 });
  burst(view.particles, now, "spark", x - 8 * e.dir, y - 72, 6, { speed: 0.3, life: 250, size: 2.5, colors: ["#fff6d0", "#ffd070"] });
}

/** A scorch mark on the lawn that fades over a few seconds. */
function scorch(view: View, x: number, y: number, radius: number, now: number): void {
  view.decals.push({ x, y: y - 4, rx: radius, ry: radius * 0.38, born: now, life: 9000, color: "rgba(20,12,6,0.7)" });
  if (view.decals.length > 40) view.decals.shift();
}

function playOnce(view: View, key: string, sprite: string, preferred: number[], now: number, frameMs = 70): void {
  const atlas = atlasFor(sprite);
  if (!atlas) return;
  const group = pickGroup(atlas, ...preferred);
  view.anim.set(key, { group, start: now, frameMs, frames: groupFrames(atlas, group) });
}

function addSheet(view: View, key: string, x: number, y: number, width: number, now: number, filter?: string): void {
  const sheet = fxSheet(key);
  if (sheet) view.fx.push({ t: "sheet", sheet, x, y, width, start: now, filter });
}

function enemyPos(s: GarrisonState, id: number): { x: number; y: number } | null {
  const e = s.enemies.find((unit) => unit.id === id);
  return e ? { x: tileX(e.x), y: feetY(e.lane) } : null;
}

function defenderPos(s: GarrisonState, id: number): { x: number; y: number } | null {
  const d = s.defenders.find((unit) => unit.id === id);
  return d ? { x: tileX(d.col + 0.5), y: feetY(d.lane) } : null;
}

export function ingestEvents(view: View, s: GarrisonState, events: readonly GarrisonEvent[], now: number): void {
  for (const ev of events) {
    switch (ev.e) {
      case "defShoot": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.shoot, G.attack], now, 65);
        break;
      }
      case "defStrike": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (!d) break;
        playOnce(view, `d${d.id}`, defSprite(d.kind), [G.attack], now, 65);
        const melee = DEFENDERS[d.kind]!.melee;
        const target = s.enemies.find((unit) => unit.id === ev.target);
        if (melee && melee.reach >= 2 && melee.single && target) {
          view.swoop.set(d.id, { dx: (target.x - (d.col + 0.5) - 0.45) * BOARD.TILE, start: now, dur: 650 });
        }
        if (target) burst(view.particles, now + 120, "spark", tileX(target.x), feetY(target.lane) - 48, 5, { speed: 0.28, life: 240, size: 2.4, colors: ["#fff4c8", "#ffc45a"] });
        break;
      }
      case "gaze":
      case "stoneShot": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), ev.e === "gaze" ? [G.attack] : [G.shoot, G.attack], now, 65);
        break;
      }
      case "heal": {
        const p = defenderPos(s, ev.target);
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.shoot, G.attack], now, 70);
        if (p) {
          addSheet(view, "cure", p.x, p.y - 40, 90, now);
          view.floats.push({ text: `+${ev.amount}`, x: p.x, y: p.y - 90, color: "#8ef08e", start: now });
        }
        break;
      }
      case "slowCast": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack], now, 70);
        for (const id of ev.targets) {
          const p = enemyPos(s, id);
          if (p) addSheet(view, "slow", p.x, p.y, 80, now);
        }
        break;
      }
      case "banish": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack], now, 70);
        addSheet(view, "dispel", tileX(ev.fromX), feetY(ev.lane) - 50, 130, now);
        addSheet(view, "dispel", tileX(8.9), feetY(ev.lane) - 50, 130, now + 150);
        break;
      }
      case "lightning": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.shoot, G.cast, G.attack], now, 65);
        view.fx.push({ t: "bolt", x: tileX(ev.x), top: laneTop(ev.lane) - 60, bottom: feetY(ev.lane), start: now + 150 });
        addSheet(view, "lightning-crackle", tileX(ev.x), feetY(ev.lane) - 40, 110, now + 150);
        break;
      }
      case "atkLightning": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.shoot, G.cast, G.attack], now, 65);
        view.fx.push({ t: "bolt", x: tileX(ev.col + 0.5), top: laneTop(ev.lane) - 60, bottom: feetY(ev.lane), start: now + 150 });
        addSheet(view, "lightning-crackle", tileX(ev.col + 0.5), feetY(ev.lane) - 40, 110, now + 150);
        break;
      }
      case "mine":
        addSheet(view, "land-mine-hit", tileX(ev.x), feetY(ev.lane) - 60, 170, now);
        scorch(view, tileX(ev.x), feetY(ev.lane), 46, now);
        burst(view.particles, now, "chip", tileX(ev.x), feetY(ev.lane) - 20, 12, { speed: 0.4, up: 0.35, g: 0.0015, life: 900, size: 4, colors: ["#5a4028", "#7a5a38", "#2e2014"], ground: feetY(ev.lane) });
        view.shakeUntil = now + 250;
        break;
      case "enemyBite": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (!e) break;
        const def = ENEMIES[e.kind]!;
        playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.attack], now, def.biteEvery < 10 || e.enraged ? 45 : 70);
        break;
      }
      case "enemyCast": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.shoot, G.cast, G.attack], now, 70);
        break;
      }
      case "enemyHeal": {
        const p = enemyPos(s, ev.target);
        if (p) addSheet(view, "cure", p.x, p.y - 40, 80, now);
        break;
      }
      case "enemyHurt":
        view.flash.set(`e${ev.id}`, now);
        break;
      case "defHurt":
        view.flash.set(`d${ev.id}`, now);
        break;
      case "defStun": {
        const p = defenderPos(s, ev.id);
        if (p) addSheet(view, "paralyze", p.x, p.y - 45, 80, now);
        break;
      }
      case "shieldBreak": {
        addSheet(view, "dispel", tileX(ev.x), feetY(ev.lane) - 50, 90, now);
        dropPiece(view, ev, now);
        break;
      }
      case "armorBreak":
        dropPiece(view, ev, now);
        break;
      case "enrage": {
        const p = enemyPos(s, ev.id);
        if (p) {
          burst(view.particles, now, "smoke", p.x, p.y - 80, 6, { speed: 0.06, up: 0.06, life: 900, size: 7, colors: ["rgba(255,90,60,0.9)", "rgba(200,40,30,0.9)"] });
          view.floats.push({ text: "RAGE!", x: p.x, y: p.y - 110, color: "#ff6a4a", start: now });
        }
        break;
      }
      case "kegLit": {
        const p = enemyPos(s, ev.id);
        if (p) burst(view.particles, now, "spark", p.x + 14, p.y - 96, 8, { speed: 0.2, up: 0.1, life: 400, size: 2.5, colors: ["#fff2a0", "#ff9a30"] });
        break;
      }
      case "keg": {
        const x = tileX(ev.x);
        const y = feetY(ev.lane);
        addSheet(view, "fireball", x, y - 50, 360, now);
        scorch(view, x, y, 120, now);
        burst(view.particles, now, "ember", x, y - 40, 22, { speed: 0.45, up: 0.2, g: 0.0006, life: 1100, size: 3, colors: ["#ffd070", "#ff7a28", "#ffb040"] });
        burst(view.particles, now, "chip", x, y - 30, 16, { speed: 0.5, up: 0.4, g: 0.0016, life: 1100, size: 5, colors: ["#6a4a2a", "#3a2a18", "#8a6a3a"], ground: y });
        burst(view.particles, now + 150, "smoke", x, y - 60, 10, { speed: 0.08, up: 0.05, life: 1500, size: 14, colors: ["rgba(60,50,45,0.9)", "rgba(90,80,70,0.9)"] });
        view.shakeUntil = now + 600;
        break;
      }
      case "stolen": {
        const p = enemyPos(s, ev.id);
        if (p) {
          view.floats.push({ text: `-${ev.value}`, x: p.x, y: p.y - 100, color: "#ffb04a", start: now });
          burst(view.particles, now, "coinbit", p.x - 20, p.y - 50, 5, { speed: 0.18, up: 0.15, g: 0.001, life: 500, size: 3, colors: ["#ffd65a"] });
        }
        break;
      }
      case "enemyDie": {
        const def = ENEMIES[ev.kind];
        if (!def) break;
        if (def.structure && ev.kind === "banner") {
          addSheet(view, "fireball", tileX(ev.x), feetY(ev.lane) - 60, 160, now);
          view.shakeUntil = now + 300;
          break;
        }
        view.corpses.push({ sprite: enemySpriteOf(view, { id: ev.id, kind: ev.kind }), x: tileX(ev.x), y: feetY(ev.lane), flip: ev.dir < 0, scale: SPRITE_SCALE * (def.scale ?? 1), how: ev.how, start: now, kind: "unit" });
        if (ev.how === "petrify") addSheet(view, "death-stare", tileX(ev.x), feetY(ev.lane) - 40, 70, now);
        if (def.undead && ev.how !== "petrify") {
          spawnParticles(view.particles, now + 350, 1, () => ({ kind: "soul", x: tileX(ev.x), y: feetY(ev.lane) - 50, vy: -0.05, life: 1300, size: 9, color: "rgba(170,255,210,0.55)" }));
        }
        burst(view.particles, now + 200, "dust", tileX(ev.x), feetY(ev.lane) - 4, 5, { speed: 0.05, life: 700, size: 7, colors: ["rgba(120,100,70,0.8)"] });
        view.stripped.delete(ev.id);
        view.anim.delete(`e${ev.id}`);
        view.phase.delete(`e${ev.id}`);
        view.flash.delete(`e${ev.id}`);
        break;
      }
      case "defDie": {
        const def = DEFENDERS[ev.kind];
        if (!def) break;
        if (def.sprite) view.corpses.push({ sprite: def.sprite, x: tileX(ev.col + 0.5), y: feetY(ev.lane), flip: false, scale: SPRITE_SCALE * (def.scale ?? 1), how: ev.crushed ? "crush" : "normal", start: now, kind: "unit" });
        if (ev.crushed) view.shakeUntil = now + 200;
        burst(view.particles, now, "dust", tileX(ev.col + 0.5), feetY(ev.lane) - 6, 7, { speed: 0.07, life: 800, size: 8, colors: ["rgba(120,100,70,0.8)"] });
        view.pop.delete(ev.id);
        view.anim.delete(`d${ev.id}`);
        view.phase.delete(`d${ev.id}`);
        view.flash.delete(`d${ev.id}`);
        view.swoop.delete(ev.id);
        break;
      }
      case "dismiss":
        view.anim.delete(`d${ev.id}`);
        view.phase.delete(`d${ev.id}`);
        view.flash.delete(`d${ev.id}`);
        break;
      case "defRise": {
        const p = defenderPos(s, ev.id);
        if (p) addSheet(view, ev.how === "rebirth" ? "fire-shield" : "resurrection", p.x, p.y - 45, ev.how === "rebirth" ? 130 : 100, now);
        break;
      }
      case "enemyRise": {
        const p = enemyPos(s, ev.id);
        if (p) addSheet(view, "fire-shield", p.x, p.y - 50, 140, now);
        break;
      }
      case "place":
      case "upgrade":
      case "fuse": {
        const p = defenderPos(s, ev.id);
        if (!p) break;
        view.pop.set(ev.id, now);
        view.fx.push({ t: "ring", x: p.x, y: p.y - 10, color: ev.e === "fuse" ? "#d68bff" : ev.e === "upgrade" ? "#ffd65a" : "#fff3c4", start: now, radius: 55 });
        if (ev.e !== "place") addSheet(view, ev.e === "fuse" ? "dispel" : "bless", p.x, p.y - 50, ev.e === "fuse" ? 140 : 60, now);
        if (ev.e === "place") {
          burst(view.particles, now + 60, "dust", p.x, p.y - 4, 8, { speed: 0.09, life: 650, size: 8, colors: ["rgba(150,130,90,0.8)", "rgba(110,95,70,0.8)"] });
        } else {
          // A pillar of gold (upgrade) or violet (fusion) light, sparks rising through it.
          view.fx.push({ t: "pillar", x: p.x, y: p.y, rgb: ev.e === "fuse" ? "214,139,255" : "255,214,90", start: now });
          spawnParticles(view.particles, now, 16, (i) => ({
            kind: i % 3 === 0 ? "glint" : "spark", x: p.x + (Math.random() - 0.5) * 50, y: p.y - Math.random() * 30,
            vx: (Math.random() - 0.5) * 0.03, vy: -0.12 - Math.random() * 0.12, life: 700 + Math.random() * 500, size: 2.5,
            color: ev.e === "fuse" ? "#e6b8ff" : "#ffe38a", rot: Math.random()
          }));
        }
        break;
      }
      case "shell": {
        const p = defenderPos(s, ev.id);
        if (p) addSheet(view, "stone-skin", p.x, p.y - 45, 110, now);
        break;
      }
      case "fireballAim":
        view.aim.push({ lane: ev.lane, x: ev.x, until: now + 600 });
        break;
      case "blast":
        blastFx(view, ev, now);
        break;
      case "spell":
        spellFx(view, s, ev, now);
        break;
      case "cloudHit": {
        const x = tileX(ev.x);
        const y = feetY(ev.lane) - 45;
        if (ev.kind === "cloud") addSheet(view, "death-cloud", x, y, 230, now);
        else if (ev.kind === "fireball") addSheet(view, "fireball", x, y, 120, now);
        else view.fx.push({ t: "impact", sheet: SHOT_SHEETS[ev.kind], x, y, width: SHOT_SHEETS[ev.kind].impact * CELL, start: now, flip: true });
        if (ev.kind === "rocket") scorch(view, x, feetY(ev.lane), 55, now);
        break;
      }
      case "projectileHit": {
        const sheet = SHOT_SHEETS[ev.kind];
        const x = tileX(ev.x);
        const y = feetY(ev.lane) - 45;
        view.fx.push({ t: "impact", sheet, x, y, width: sheet.impact * CELL, start: now, flip: false });
        if (ev.burn && !LOBBED.has(ev.kind)) addSheet(view, "fire-shield", x, y, 60, now);
        if (ev.kind === "rocket") {
          scorch(view, x, feetY(ev.lane), 60, now);
          burst(view.particles, now, "chip", x, feetY(ev.lane) - 20, 8, { speed: 0.35, up: 0.3, g: 0.0015, life: 800, size: 4, colors: ["#4a3a2a", "#6a5a48"], ground: feetY(ev.lane) });
          view.shakeUntil = Math.max(view.shakeUntil, now + 140);
        } else if (ev.kind === "bullet") {
          burst(view.particles, now, "spark", x, y, 4, { speed: 0.25, life: 200, size: 2, colors: ["#fff4c8", "#ffc45a"] });
        }
        break;
      }
      case "hitscan": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        const to = { x: tileX(ev.col + 0.5), y: feetY(ev.lane) - 45 };
        if (e) {
          playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.shoot, G.attack], now, 55);
          if (ev.kind === "bullet") hitscanFx(view, { x: tileX(e.x) - 30 * -e.dir, y: feetY(e.lane) - 52 }, to, now);
        }
        if (ev.kind === "flame") flameAt(view, to.x, feetY(ev.lane), now + 120);
        break;
      }
      case "flame": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.shoot, G.attack], now, 70);
        flameAt(view, tileX(ev.x), feetY(ev.lane), now + 150);
        break;
      }
      case "evade": {
        const p = enemyPos(s, ev.id);
        if (p) view.floats.push({ text: "miss", x: p.x, y: p.y - 95, color: "#c9d3ff", start: now });
        break;
      }
      case "collect":
        // The coin itself flies to the counter on the HUD overlay (garrison-game).
        burst(view.particles, now, "glint", tileX(ev.x), BOARD.TOP + ev.y * BOARD.LANE_H, 5, { speed: 0.12, life: 380, size: 2.6, colors: ["#fff3b0"] });
        break;
      case "surface": {
        const p = enemyPos(s, ev.id);
        if (p) {
          burst(view.particles, now, "chip", p.x, p.y - 8, 14, { speed: 0.3, up: 0.35, g: 0.0015, life: 800, size: 4.5, colors: ["#5a4028", "#7a5a38", "#3a2a16"], ground: p.y });
          burst(view.particles, now, "dust", p.x, p.y - 6, 6, { speed: 0.06, life: 900, size: 10, colors: ["rgba(120,95,60,0.85)"] });
        }
        break;
      }
      case "raided":
        view.floats.push({ text: "BROKEN!", x: tileX(0.3), y: laneMid(ev.lane), color: "#ff8a6a", start: now });
        break;
      default:
        break;
    }
  }
}

function blastFx(view: View, ev: Extract<GarrisonEvent, { e: "blast" }>, now: number): void {
  const x = tileX(ev.x);
  const y = feetY(ev.lane) - 50;
  if (ev.kind === "fireball" || ev.kind === "eruption") {
    addSheet(view, "fireball", x, y, 330, now);
    scorch(view, x, feetY(ev.lane), 110, now + 150);
    view.shakeUntil = now + 350;
  } else if (ev.kind === "fire-wall") {
    for (let col = 0; col <= GW_COLS; col += 1) {
      const sheet = fxSheet("fire-wall-b");
      if (sheet) view.fx.push({ t: "sheet", sheet, x: tileX(col + 0.5), y: feetY(ev.lane) + 8, width: 105, start: now + col * 40 });
    }
    view.shakeUntil = now + 300;
  } else {
    for (let col = 0; col < GW_COLS; col += 1) addSheet(view, "death-cloud", tileX(col + 0.5), y, 170, now + (GW_COLS - col) * 50);
    view.shakeUntil = now + 400;
  }
}

function spellFx(view: View, s: GarrisonState, ev: Extract<GarrisonEvent, { e: "spell" }>, now: number): void {
  const x = tileX(ev.x);
  const y = feetY(ev.lane) - 50;
  switch (ev.spell) {
    case "magic-arrow":
      addSheet(view, "magic-arrow-hit", x, y, 120, now);
      break;
    case "frost-ring":
      addSheet(view, "frost-ring", x, y, 360, now);
      break;
    case "meteor-shower":
      addSheet(view, "meteor-shower", x, y, 380, now);
      scorch(view, x, feetY(ev.lane), 120, now + 300);
      view.shakeUntil = now + 500;
      break;
    case "armageddon":
      for (let i = 0; i < 14; i += 1) {
        addSheet(view, "armageddon", BOARD.LAWN_X + Math.random() * 1000, BOARD.TOP + Math.random() * 560, 220, now + i * 90);
      }
      view.shakeUntil = now + 1400;
      break;
    case "haste":
      for (const d of s.defenders) if (d.kind !== "mine") addSheet(view, "haste", tileX(d.col + 0.5), feetY(d.lane) - 40, 80, now);
      break;
    case "earthquake":
      for (const d of s.defenders) addSheet(view, "death-ripple", tileX(d.col + 0.5), feetY(d.lane) - 30, 90, now);
      view.shakeUntil = now + 900;
      break;
    case "war-cry":
      // No Bloodlust sheet exists (the card game tints instead); Frenzy is the red rage burst.
      for (const e of s.enemies) if (!isStructure(e)) addSheet(view, "frenzy", tileX(e.x), feetY(e.lane) - 50, 90, now);
      break;
    case "resurrection":
      for (const e of s.enemies) if (!isStructure(e) && e.x > 9) addSheet(view, "resurrection", tileX(e.x), feetY(e.lane) - 45, 100, now);
      break;
  }
}

// ---------------------------------------------------------------------------
// Drawing

export type Ghost =
  | { t: "unit"; lane: number; col: number; sprite: string; ok: boolean; label?: string }
  | { t: "area"; lane: number; x: number; ok: boolean }
  | { t: "lane"; lane: number; ok: boolean }
  | { t: "tile"; lane: number; col: number; ok: boolean }
  | null;

export type Overlay = {
  ghost: Ghost;
  /** Device pixel ratio of the board canvas (the scenery layer is composed at it). */
  dpr: number;
  /** The local defender's gold, to flag the upgrades it can pay for (null: not the local defender). */
  upgradeGold: number | null;
  selected: number | null;
  /** Hot-seat attacker's lane cursor. */
  atkLane: number | null;
  /** Columns the local defender may build on (versus shading). */
  defCols: [number, number];
};

type SiegePieces = Record<string, { x: number; y: number; width: number; height: number }>;
const SIEGE = siegeArt as unknown as Record<string, { pieces: SiegePieces }>;
const CASTLE_ORDER = [
  "background-wall", "tower-upper", "tower-upper-battlement", "wall-upper", "static-top", "wall-over-gate", "gate-arch", "gate",
  "wall-below-gate", "static-bottom", "wall-bottom", "tower-bottom", "tower-bottom-battlement"
];

function castleComposite(view: View): HTMLCanvasElement | null {
  const town = SIEGE[view.town] ? view.town : "castle";
  const pieces = SIEGE[town]!.pieces;
  const imgs = CASTLE_ORDER.filter((name) => pieces[name]).map((name) => ({ name, img: image(`/assets/battle-hex/siege/${town}/${name}.webp`) }));
  const loaded = imgs.filter((entry) => ready(entry.img)).length;
  if (loaded === view.castleReady) return view.castle;
  if (typeof document === "undefined") return null;
  const canvas = view.castle ?? document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 556;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 800, 556);
  for (const { name, img } of imgs) {
    const p = pieces[name]!;
    if (ready(img)) ctx.drawImage(img, p.x, p.y, p.width, p.height);
  }
  view.castle = canvas;
  view.castleReady = loaded;
  return canvas;
}

function tintedBanner(view: View, color: string): HTMLCanvasElement | null {
  const img = image("/assets/tide/war-banner.webp");
  if (!ready(img)) return null;
  const cached = view.banners.get(color);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);
  view.banners.set(color, canvas);
  return canvas;
}

function frameOf(view: View, key: string, frames: number, frameMs: number, dt: number, frozen: boolean): number {
  let phase = view.phase.get(key) ?? Math.random() * frames;
  if (!frozen) phase += dt / Math.max(16, frameMs);
  view.phase.set(key, phase % (frames * 1000));
  return Math.floor(phase) % Math.max(1, frames);
}

/** A one-shot clip still playing on this entity, or null. */
function activeClip(view: View, key: string, now: number): { group: number; frame: number } | null {
  const anim = view.anim.get(key);
  if (!anim) return null;
  const frame = Math.floor((now - anim.start) / anim.frameMs);
  if (frame >= anim.frames) {
    view.anim.delete(key);
    return null;
  }
  return { group: anim.group, frame };
}

function statusFilter(tick: number, e: { chillUntil?: number; slowUntil?: number; freezeUntil?: number; stunUntil?: number; poisonUntil?: number }, flash: boolean): string {
  const parts: string[] = [];
  if ((e.freezeUntil ?? 0) > tick) parts.push("grayscale(0.5) sepia(0.4) hue-rotate(160deg) saturate(2.2) brightness(1.35)");
  else if ((e.stunUntil ?? 0) > tick) parts.push("grayscale(0.85) brightness(0.95)");
  else if ((e.chillUntil ?? 0) > tick) parts.push("sepia(0.45) hue-rotate(165deg) saturate(1.8)");
  else if ((e.slowUntil ?? 0) > tick) parts.push("sepia(0.35) hue-rotate(225deg) saturate(1.4)");
  if ((e.poisonUntil ?? 0) > tick) parts.push("sepia(0.3) hue-rotate(50deg) saturate(1.6)");
  if (flash) parts.push("brightness(1.9)");
  return parts.length ? parts.join(" ") : "none";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A small rounded health bar; `shield` (0..1) adds a steel bar above it. */
function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string, shield = 0): void {
  const f = Math.max(0, Math.min(1, frac));
  ctx.save();
  ctx.fillStyle = "rgba(10,6,2,0.7)";
  roundRect(ctx, x - w / 2 - 1.5, y - 1.5, w + 3, 7, 3);
  ctx.fill();
  if (f > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x - w / 2, y, Math.max(2, w * f), 4, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(x - w / 2 + 1, y + 0.5, Math.max(0, w * f - 2), 1);
  }
  if (shield > 0) {
    ctx.fillStyle = "rgba(10,6,2,0.7)";
    roundRect(ctx, x - w / 2 - 1.5, y - 6.5, w + 3, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = "#cfd9e2";
    roundRect(ctx, x - w / 2, y - 5.5, Math.max(2, w * Math.min(1, shield)), 3, 1.5);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Forgets the presentation state of units that left without a death event
 * (raiders through the gate, dismissed defenders, spent Lost Souls), every
 * couple of seconds, so long games do not accumulate it.
 */
function pruneView(view: View, s: GarrisonState, now: number): void {
  if (now - view.prunedAt < 2000) return;
  view.prunedAt = now;
  const live = new Set<string>();
  for (const e of s.enemies) live.add(`e${e.id}`);
  for (const d of s.defenders) live.add(`d${d.id}`);
  for (const p of s.projectiles) live.add(`soul${p.id}`);
  for (const map of [view.phase, view.anim, view.flash]) {
    for (const key of map.keys()) if (/^(e|d|soul)\d+$/.test(key) && !live.has(key)) map.delete(key);
  }
  for (const id of view.stripped) if (!live.has(`e${id}`)) view.stripped.delete(id);
  for (const id of view.pop.keys()) if (!live.has(`d${id}`)) view.pop.delete(id);
  for (const id of view.swoop.keys()) if (!live.has(`d${id}`)) view.swoop.delete(id);
}

export function drawBoard(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, now: number, alpha: number, overlay: Overlay): void {
  const dt = view.lastNow ? Math.min(100, now - view.lastNow) : 16;
  view.lastNow = now;
  pruneView(view, s, now);
  const tick = s.tick;
  const lerp = (a: number, b: number) => a + (b - a) * alpha;

  ctx.save();
  if (now < view.shakeUntil) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
  if (view.camX) ctx.translate(-view.camX, 0);

  // The painted field, the lawn and the keep: one pre-composed layer.
  const keepArt = keepFor(view.town);
  const scenery = sceneryLayer(view.scenery, BOARD, s.cfg.terrain, s.cfg.lanes, overlay.dpr, keepArt);
  if (scenery) ctx.drawImage(scenery, 0, 0, WORLD_W, BOARD.H);
  else {
    ctx.fillStyle = "#2b3a1c";
    ctx.fillRect(-10, -10, WORLD_W + 20, BOARD.H + 20);
  }
  drawKeepFlags(ctx, BOARD, now, view.defColor, keepArt);
  if (s.cfg.mode === "versus") {
    const [, maxCol] = overlay.defCols;
    ctx.fillStyle = "rgba(120,20,20,0.18)";
    for (const lane of s.cfg.lanes) ctx.fillRect(tileX(maxCol + 1), laneTop(lane), tileX(GW_COLS) - tileX(maxCol + 1), BOARD.LANE_H);
  }
  view.decals = drawDecals(ctx, view.decals, now);
  if (s.cfg.mode === "versus") {
    const edge = tileX(overlay.defCols[1] + 1);
    ctx.strokeStyle = "rgba(235,70,45,0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(edge, BOARD.TOP);
    ctx.lineTo(edge, BOARD.TOP + GW_LANES * BOARD.LANE_H);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (s.cfg.mode === "raid" && s.cfg.atkMinX !== undefined) {
    const edge = tileX(s.cfg.atkMinX);
    ctx.strokeStyle = "rgba(220,60,40,0.7)";
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(edge, BOARD.TOP);
    ctx.lineTo(edge, BOARD.TOP + GW_LANES * BOARD.LANE_H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Until the keep painting is available: the defending town's wall (the PC siege pieces, mirrored).
  const castle = ready(image(KEEP_SRC)) ? null : castleComposite(view);
  if (castle) {
    // Source x 470..700 (wall to keep-side) mirrored so the wall's face meets the lawn.
    const k = (GW_LANES * BOARD.LANE_H) / 556;
    const originX = BOARD.LAWN_X - (700 - 470) * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, BOARD.LAWN_X + 20, BOARD.H);
    ctx.clip();
    ctx.translate(originX + 700 * k, BOARD.TOP - 6);
    ctx.scale(-k, k);
    ctx.drawImage(castle, 0, 0);
    ctx.restore();
  }

  // Placement ghost / lane cursor.
  drawGhost(ctx, overlay, now);
  if (overlay.atkLane !== null) {
    ctx.fillStyle = "rgba(255,90,60,0.14)";
    ctx.fillRect(tileX(0), laneTop(overlay.atkLane), tileX(10.2) - tileX(0), BOARD.LANE_H);
    ctx.strokeStyle = "rgba(255,120,80,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(tileX(0), laneTop(overlay.atkLane) + 1, tileX(10.2) - tileX(0), BOARD.LANE_H - 2);
  }
  for (const aim of view.aim) {
    if (aim.until < now) continue;
    ctx.strokeStyle = "rgba(255,120,40,0.9)";
    ctx.lineWidth = 3;
    ctx.strokeRect(tileX(aim.x - 1.5), laneTop(Math.max(0, aim.lane - 1)), BOARD.TILE * 3, BOARD.LANE_H * (Math.min(GW_LANES - 1, aim.lane + 1) - Math.max(0, aim.lane - 1) + 1));
  }
  view.aim = view.aim.filter((aim) => aim.until >= now);

  // Level intro: the foes wait on the staging ground beyond the road.
  if (view.lineup && view.camX > 0) drawLineup(ctx, view, s, now, dt);

  // Units, lane by lane (lower lanes overlap the ones above).
  for (let lane = 0; lane < GW_LANES; lane += 1) {
    for (const c of s.chargers) if (c.lane === lane) drawCharger(ctx, s, view, c.state, lerp(c.px, c.x), lane, dt);
    const defenders = s.defenders.filter((d) => d.lane === lane).sort((a, b) => a.col - b.col);
    for (const d of defenders) drawDefender(ctx, s, view, d, now, dt, overlay.selected === d.id);
    drawCorpses(ctx, view, now, lane);
    const enemies = s.enemies.filter((e) => Math.round(e.state === "glide" ? e.to : e.lane) === lane).sort((a, b) => b.x - a.x);
    for (const e of enemies) drawEnemy(ctx, s, view, e, now, dt, alpha);
  }
  // Upgrades the purse can pay for now: a bobbing golden chevron.
  if (overlay.upgradeGold !== null) {
    for (const d of s.defenders) {
      const up = DEFENDERS[d.kind]!.upgrade;
      if (up && up.cost <= overlay.upgradeGold && overlay.selected !== d.id) drawUpgradeHint(ctx, tileX(d.col + 0.5), feetY(d.lane), now + d.id * 97);
    }
  }
  for (const p of s.projectiles) {
    const x = tileX(lerp(p.px, p.x));
    const sheet = SHOT_SHEETS[p.kind];
    let y = feetY(p.lane) - 48;
    if (p.lob) {
      const t = Math.max(0, Math.min(1, (tick + alpha - p.lob.t0) / p.lob.dur));
      const dist = Math.abs(p.lob.toX - p.lob.fromX);
      y -= 4 * t * (1 - t) * (60 + dist * 14);
    }
    const cell = 4 + (Math.floor(now / 45) % 8);
    if (p.kind === "bullet") {
      drawBullet(ctx, view, p, x, y, now);
      continue;
    }
    if (p.kind === "soul" && drawSoul(ctx, view, p, x, y, dt)) continue;
    if (p.lob && p.kind === "rocket") {
      // A homing rocket noses along its arc.
      const t = Math.max(0, Math.min(1, (tick + alpha - p.lob.t0) / p.lob.dur));
      const dist = Math.abs(p.lob.toX - p.lob.fromX);
      const run = (p.lob.toX - p.lob.fromX) * BOARD.TILE;
      const slope = (-4 * (1 - 2 * t) * (60 + dist * 14)) / (Math.abs(run) < 1 ? (run < 0 ? -1 : 1) : run);
      ctx.save();
      ctx.translate(x, y);
      // (slope is dy/dx on screen; leftward rockets are mirrored after the turn.)
      ctx.rotate(Math.atan(slope));
      drawShot(ctx, sheet, cell, 0, 0, sheet.width * CELL, p.lob.toX < p.lob.fromX);
      ctx.restore();
    } else {
      drawShot(ctx, sheet, cell, x, y, sheet.width * CELL, p.dir < 0);
    }
    if (p.kind === "rocket" && Math.random() < dt / 45) {
      burst(view.particles, now, "smoke", x - 26 * p.dir, y, 1, { speed: 0.02, life: 650, size: 5, colors: ["rgba(90,85,80,0.9)"] });
    }
    if (p.burn && !p.lob) drawGlow(ctx, "rgba(255,190,80,0.85)", x, y, 22);
  }
  drawFxLayer(ctx, view, now);
  view.particles = drawParticles(ctx, view.particles, now);
  drawPickups(ctx, s, view, now, alpha);
  drawFloats(ctx, view, now);
  drawBossBar(ctx, s);
  ctx.restore();
}

/** A bullet: a short bright tracer (hitscan fire in the originals), the muzzle flashing once. */
function drawBullet(ctx: CanvasRenderingContext2D, view: View, p: GarrisonState["projectiles"][number], x: number, y: number, now: number): void {
  if (!view.muzzled.has(p.id)) {
    view.muzzled.add(p.id);
    if (view.muzzled.size > 400) view.muzzled.clear();
    view.fx.push({ t: "impact", sheet: SHOT_SHEETS.bullet, x: tileX(p.px) + 6 * p.dir, y, width: 56, start: now, flip: p.dir < 0, cell0: 0 });
  }
  const tail = 70;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(x - tail * p.dir, y, x, y);
  g.addColorStop(0, "rgba(255,210,120,0)");
  g.addColorStop(1, "rgba(255,246,200,0.95)");
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x - tail * p.dir, y);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

/** A Lost Soul spat by a Pain Elemental: the burning skull itself, charging. */
function drawSoul(ctx: CanvasRenderingContext2D, view: View, p: GarrisonState["projectiles"][number], x: number, y: number, dt: number): boolean {
  const atlas = atlasFor("doom-lost-soul");
  if (!atlas) return false;
  const group = pickGroup(atlas, G.move, G.stand);
  const frame = frameOf(view, `soul${p.id}`, Math.max(1, groupFrames(atlas, group)), 60, dt, false);
  drawGlow(ctx, "rgba(255,170,60,0.55)", x - 20 * p.dir, y + 8, 30);
  return drawAtlas(ctx, atlas, group, frame, x, y + 34, SPRITE_SCALE * 0.85, p.dir < 0);
}

/** A bobbing golden chevron over a defender whose upgrade the purse can pay for. */
function drawUpgradeHint(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  const bob = Math.sin(now / 260) * 4;
  const cx = x + 30;
  const cy = y - 100 + bob;
  ctx.save();
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now / 200);
  ctx.shadowColor = "rgba(255,200,60,0.9)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#ffd65a";
  ctx.strokeStyle = "#6a4a10";
  ctx.lineWidth = 1.5;
  for (const dy of [0, 7]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy - 7);
    ctx.lineTo(cx + 8, cy + dy + 1);
    ctx.lineTo(cx + 4, cy + dy + 1);
    ctx.lineTo(cx, cy + dy - 3);
    ctx.lineTo(cx - 4, cy + dy + 1);
    ctx.lineTo(cx - 8, cy + dy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** The level's foes standing on the staging ground (shown while the intro camera is out there). */
function drawLineup(ctx: CanvasRenderingContext2D, view: View, s: GarrisonState, now: number, dt: number): void {
  const kinds = view.lineup!;
  const lanes = s.cfg.lanes;
  kinds.forEach((kind, i) => {
    const def = ENEMIES[kind];
    const atlas = def ? atlasFor(def.sprite) : null;
    if (!def || !atlas) return;
    const lane = lanes[i % lanes.length]!;
    const x = 1455 + ((i * 67) % 250) + (Math.floor(i / lanes.length) % 2) * 30;
    const frames = Math.max(1, groupFrames(atlas, G.stand));
    const frame = frameOf(view, `lineup${i}`, frames, 140, dt, false);
    drawAtlas(ctx, atlas, G.stand, frame, x, feetY(lane) - 6 + ((i * 13) % 20), SPRITE_SCALE * (def.scale ?? 1), true);
  });
}

function drawGhost(ctx: CanvasRenderingContext2D, overlay: Overlay, now: number): void {
  const g = overlay.ghost;
  if (!g) return;
  const good = "rgba(140,255,140,0.22)";
  const bad = "rgba(255,80,60,0.22)";
  ctx.save();
  if (g.t === "unit" || g.t === "tile") {
    ctx.fillStyle = g.ok ? good : bad;
    ctx.fillRect(tileX(g.col), laneTop(g.lane), BOARD.TILE, BOARD.LANE_H);
    if (g.t === "unit" && g.sprite) {
      const atlas = atlasFor(g.sprite);
      if (atlas) {
        ctx.globalAlpha = 0.55;
        if (!g.ok) ctx.filter = "grayscale(1) brightness(0.8)";
        drawAtlas(ctx, atlas, G.stand, Math.floor(now / 110) % Math.max(1, groupFrames(atlas, G.stand)), tileX(g.col + 0.5), feetY(g.lane), SPRITE_SCALE, false);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
      }
    }
    if (g.t === "unit" && g.label) {
      ctx.font = "bold 15px Georgia, serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(g.label, tileX(g.col + 0.5), laneTop(g.lane) + 16);
      ctx.fillStyle = "#e9c2ff";
      ctx.fillText(g.label, tileX(g.col + 0.5), laneTop(g.lane) + 16);
    }
  } else if (g.t === "area") {
    const lo = Math.max(0, g.lane - 1);
    const hi = Math.min(GW_LANES - 1, g.lane + 1);
    ctx.fillStyle = g.ok ? "rgba(255,170,60,0.22)" : bad;
    ctx.fillRect(tileX(g.x - 1.5), laneTop(lo), BOARD.TILE * 3, BOARD.LANE_H * (hi - lo + 1));
    ctx.strokeStyle = g.ok ? "rgba(255,200,90,0.9)" : "rgba(255,90,70,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(tileX(g.x - 1.5), laneTop(lo), BOARD.TILE * 3, BOARD.LANE_H * (hi - lo + 1));
  } else if (g.t === "lane") {
    ctx.fillStyle = g.ok ? "rgba(255,150,60,0.2)" : bad;
    ctx.fillRect(tileX(0), laneTop(g.lane), tileX(GW_COLS) - tileX(0), BOARD.LANE_H);
  }
  ctx.restore();
}

function drawCharger(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, state: string, x: number, lane: number, dt: number): void {
  if (state === "gone") return;
  const atlas = atlasFor(s.cfg.chargerSprite);
  if (!atlas) return;
  const charging = state === "charging";
  const group = charging ? pickGroup(atlas, G.move) : G.stand;
  const frames = Math.max(1, groupFrames(atlas, group));
  const frame = frameOf(view, `c${lane}${charging ? "m" : "s"}`, frames, charging ? 55 : 150, dt, false);
  drawAtlas(ctx, atlas, group, frame, tileX(x), feetY(lane) + 4, SPRITE_SCALE * 0.9, false);
}

function drawDefender(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, d: Defender, now: number, dt: number, selected: boolean): void {
  const def = DEFENDERS[d.kind]!;
  const x = tileX(d.col + 0.5);
  const y = feetY(d.lane);
  if (d.kind === "mine") {
    const armed = s.tick >= d.armedAt;
    const sheet = fxSheet(armed ? "land-mine-a" : "land-mine-b");
    if (sheet) drawFx(ctx, sheet, armed ? (now / 70) % sheet.frames : 0, x, y - 8, 64, armed ? 1 : 0.55);
    if (!armed) {
      const frac = 1 - (d.armedAt - s.tick) / LAND_MINE_ARM;
      hpBar(ctx, x, y + 8, 40, frac, "#e0b040");
    }
    return;
  }
  const atlas = atlasFor(def.sprite);
  if (!atlas) return;
  const key = `d${d.id}`;
  const stunned = d.stunnedUntil > s.tick;
  const clip = stunned ? null : activeClip(view, key, now);
  const resting = d.busyUntil > s.tick;
  let group = clip?.group ?? G.stand;
  let frame = clip?.frame ?? 0;
  if (!clip) {
    group = resting ? pickGroup(atlas, G.defend, G.stand) : G.stand;
    const frames = Math.max(1, groupFrames(atlas, group));
    frame = resting ? Math.min(frames - 1, 2) : frameOf(view, key, frames, 130, dt, stunned);
  }
  let dx = 0;
  const swoop = view.swoop.get(d.id);
  if (swoop) {
    const t = (now - swoop.start) / swoop.dur;
    if (t >= 1) view.swoop.delete(d.id);
    else dx = swoop.dx * Math.sin(Math.PI * t);
  }
  // Raised, upgraded or fused: it drops in and settles with a squash (PvZ "plop").
  let stretch: { x: number; y: number } | undefined;
  let drop = 0;
  const popAt = view.pop.get(d.id);
  if (popAt !== undefined) {
    const t = now - popAt;
    if (t > 420) view.pop.delete(d.id);
    else if (t >= 0) {
      const wobble = 0.24 * Math.exp(-t / 110) * Math.cos(t / 45);
      stretch = { x: 1 - wobble * 0.6, y: 1 + wobble };
      drop = t < 110 ? -22 * (1 - t / 110) * (1 - t / 110) : 0;
    }
  }
  const flashAt = view.flash.get(key) ?? 0;
  ctx.filter = statusFilter(s.tick, { stunUntil: d.stunnedUntil, poisonUntil: d.poisonUntil }, now - flashAt < 90);
  if (resting) ctx.filter = ctx.filter === "none" ? "brightness(0.7) saturate(0.6)" : `${ctx.filter} brightness(0.7)`;
  if (selected) {
    ctx.save();
    ctx.shadowColor = "#ffe27a";
    ctx.shadowBlur = 18;
  }
  // A Spectre is half there, shimmering.
  if (def.veiled) ctx.globalAlpha = 0.42 + 0.1 * Math.sin(now / 170 + d.id);
  drawAtlas(ctx, atlas, group, frame, x + dx, y + drop, SPRITE_SCALE * (def.scale ?? 1), false, stretch);
  ctx.globalAlpha = 1;
  if (selected) ctx.restore();
  ctx.filter = "none";
  if (d.shell > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(190,190,175,${0.35 + 0.4 * (d.shell / 4000)})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(x, y - 38, 42, 52, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (d.cursedUntil > s.tick) {
    ctx.fillStyle = "rgba(120,60,160,0.8)";
    ctx.beginPath();
    ctx.arc(x - 30, y - 90, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.hp < d.maxHp) hpBar(ctx, x, y + 6, 54, d.hp / d.maxHp, d.hp / d.maxHp > 0.4 ? "#6ad04a" : "#e0503a");
  // Upgrades taken: one small gold chevron per step up the chain.
  const tier = def.card === undefined && !def.fusion ? upgradeChain(d.kind).indexOf(d.kind) : 0;
  for (let i = 0; i < tier; i += 1) {
    ctx.fillStyle = "#ffd65a";
    ctx.strokeStyle = "rgba(60,40,5,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 26, y - 97 + i * 7);
    ctx.lineTo(x + 34, y - 89 + i * 7);
    ctx.lineTo(x + 18, y - 89 + i * 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (def.fusion) {
    ctx.fillStyle = "#d68bff";
    ctx.beginPath();
    ctx.arc(x + 28, y - 92, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, e: Enemy, now: number, dt: number, alpha: number): void {
  const def = ENEMIES[e.kind]!;
  const lerpX = e.px + (e.x - e.px) * alpha;
  const x = tileX(lerpX);
  let y = feetY(e.lane);
  if (e.state === "glide") {
    const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
    y = feetY(e.from) + (feetY(e.to) - feetY(e.from)) * t;
  }
  if (e.kind === "banner") {
    drawBanner(ctx, view, s.cfg.bannerColor, x, y, e.hp / e.maxHp);
    return;
  }
  if (e.state === "burrow") {
    ctx.fillStyle = "rgba(92,64,34,0.9)";
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 34, 11, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(140,104,60,0.8)";
    for (let i = 0; i < 4; i += 1) {
      const a = now / 120 + i * 1.7;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 24, y - 10 - Math.abs(Math.sin(a)) * 12, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // A furrow of thrown-up earth behind a digger.
    if (Math.random() < dt / 90) {
      burst(view.particles, now, "chip", x + 16, y - 8, 1, { speed: 0.15, up: 0.2, g: 0.0012, life: 500, size: 3.5, colors: ["#5a4028", "#7a5a38"], ground: y });
    }
    return;
  }
  const atlas = atlasFor(enemySpriteOf(view, e));
  if (!atlas) return;
  const key = `e${e.id}`;
  const frozen = e.freezeUntil > s.tick || e.stunUntil > s.tick;
  const clip = frozen ? null : activeClip(view, key, now);
  let group = clip?.group ?? G.stand;
  let frame = clip?.frame ?? 0;
  let lift = 0;
  let fade = 1;
  if (!clip) {
    if (e.state === "walk" || e.state === "vault" || e.state === "flung") {
      group = pickGroup(atlas, G.move, G.stand);
      const speedPx = (def.vault && !e.vaulted ? def.vault.fastSpeed : def.speed) * GW_TPS * BOARD.TILE;
      const chilled = e.chillUntil > s.tick || e.slowUntil > s.tick;
      const stride = speedPx > 0 ? (42 / speedPx) * 1000 : 800;
      const frames = Math.max(1, groupFrames(atlas, group));
      const frameMs = e.state === "walk" ? Math.max(55, Math.min(260, stride / frames)) * (chilled ? 2 : 1) : 55;
      frame = frameOf(view, key, frames, frameMs, dt, frozen);
    } else if (e.state === "teleport" || e.state === "appear") {
      const vanish = e.state === "teleport";
      group = pickGroup(atlas, vanish ? G.vanish : G.appear, G.stand);
      const frames = Math.max(1, groupFrames(atlas, group));
      const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
      frame = Math.min(frames - 1, Math.floor(t * frames));
      if (group === G.stand) fade = vanish ? 1 - t : t;
    } else {
      const frames = Math.max(1, groupFrames(atlas, G.stand));
      frame = frameOf(view, key, frames, 130, dt, frozen);
    }
  }
  if (e.state === "vault" || e.state === "flung") {
    const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
    lift = 4 * t * (1 - t) * (e.state === "flung" ? 120 : 75);
  }
  const flashAt = view.flash.get(key) ?? 0;
  const scale = SPRITE_SCALE * (def.scale ?? 1) * (def.boss ? 1.7 : 1);
  // A gravedigger climbs out of its hole (rises through the ground line).
  let rise = 0;
  if (e.state === "appear" && def.dig) {
    const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
    rise = (1 - t * (2 - t)) * 95 * scale;
    fade = 1;
    group = G.stand;
    frame = 0;
  }
  ctx.save();
  ctx.globalAlpha = fade * (def.evade ? 0.5 + 0.08 * Math.sin(now / 150 + e.id) : 1);
  let filter = statusFilter(s.tick, e, now - flashAt < 80);
  if (e.enraged) filter = `${filter === "none" ? "" : `${filter} `}sepia(0.35) saturate(2.3) hue-rotate(-25deg)`;
  const kegLeft = def.keg && e.fuse > 0 ? e.fuse / def.keg.fuse : -1;
  if (kegLeft >= 0 && kegLeft < 0.45 && Math.floor(now / (60 + kegLeft * 300)) % 2 === 0) {
    filter = `${filter === "none" ? "" : `${filter} `}brightness(1.5) sepia(0.6) hue-rotate(-30deg) saturate(3)`;
  }
  ctx.filter = filter;
  if (lift > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (rise > 0) {
    ctx.beginPath();
    ctx.rect(x - 120, y - 260, 240, 262);
    ctx.clip();
  }
  drawAtlas(ctx, atlas, group, frame, x, y - lift + rise, scale, e.dir < 0);
  ctx.restore();
  if (kegLeft >= 0) {
    // The lit fuse on the keg: a spitting spark, faster as it burns down.
    const fx = x + (e.dir < 0 ? 12 : -12);
    const fy = y - 100 * scale;
    const r = 7 + 4 * Math.sin(now / (40 + kegLeft * 80));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, "rgba(255,150,40,0.8)", fx, fy, r * 2.2);
    drawGlow(ctx, "rgba(255,245,180,0.95)", fx, fy, r * 0.9);
    ctx.restore();
    if (Math.random() < dt / 70) burst(view.particles, now, "spark", fx, fy, 2, { speed: 0.18, up: 0.08, life: 300, size: 2, colors: ["#fff2a0", "#ff9a30"] });
  }
  if (e.kind === "tent") {
    hpBar(ctx, x, y + 8, 60, e.hp / e.maxHp, "#d6a040");
    return;
  }
  const guard = e.maxArmor > 0 ? e.armor / e.maxArmor : e.maxShield > 0 ? e.shield / e.maxShield : 0;
  if (!def.boss && rise === 0 && (e.hp < e.maxHp || e.shield < e.maxShield || e.armor < e.maxArmor)) {
    hpBar(ctx, x, y - 112 * scale, 46, e.hp / e.maxHp, "#e0503a", guard);
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, view: View, color: string, x: number, y: number, frac: number): void {
  const tinted = tintedBanner(view, color);
  if (tinted) {
    const h = 150;
    const w = (tinted.width / tinted.height) * h;
    ctx.drawImage(tinted, x - w / 2, y - h + 8, w, h);
  } else {
    ctx.fillStyle = "#5b3b1c";
    ctx.fillRect(x - 3, y - 140, 6, 146);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 136);
    ctx.lineTo(x + 58, y - 124);
    ctx.lineTo(x + 44, y - 104);
    ctx.lineTo(x + 58, y - 84);
    ctx.lineTo(x + 3, y - 90);
    ctx.closePath();
    ctx.fill();
  }
  hpBar(ctx, x, y + 10, 60, frac, color);
}

function drawCorpses(ctx: CanvasRenderingContext2D, view: View, now: number, lane: number): void {
  const laneY = feetY(lane);
  for (const c of view.corpses) {
    if (Math.abs(c.y - laneY) > 1) continue;
    const atlas = atlasFor(c.sprite);
    if (!atlas) continue;
    const frames = Math.max(1, groupFrames(atlas, G.death));
    const elapsed = now - c.start;
    const frame = Math.min(frames - 1, Math.floor(elapsed / 85));
    const hold = frames * 85 + 1100;
    const fade = elapsed > hold ? Math.max(0, 1 - (elapsed - hold) / 700) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    if (c.how === "petrify") ctx.filter = "grayscale(1) brightness(1.1) contrast(1.1)";
    else if (c.how === "burn") ctx.filter = "sepia(0.6) brightness(0.6)";
    else if (c.how === "charge") ctx.filter = "brightness(0.85)";
    const group = c.how === "petrify" ? G.stand : pickGroup(atlas, G.death, G.stand);
    drawAtlas(ctx, atlas, group, c.how === "petrify" ? 0 : frame, c.x, c.y, c.scale, c.flip);
    ctx.restore();
  }
}

function drawFxLayer(ctx: CanvasRenderingContext2D, view: View, now: number): void {
  const keep: FxInstance[] = [];
  for (const fx of view.fx) {
    const elapsed = now - fx.start;
    if (elapsed < 0) {
      keep.push(fx);
      continue;
    }
    if (fx.t === "sheet") {
      const frame = (elapsed * fx.sheet.fps) / 1000;
      if (frame >= fx.sheet.frames) continue;
      if (fx.filter) ctx.filter = fx.filter;
      drawFx(ctx, fx.sheet, frame, fx.x, fx.y, fx.width * (fx.sheet.scaleMultiplier ?? 1));
      ctx.filter = "none";
      keep.push(fx);
    } else if (fx.t === "impact") {
      const first = fx.cell0 ?? 12;
      const cell = first + Math.floor(elapsed / 45);
      if (cell > first + 3) continue;
      drawShot(ctx, fx.sheet, cell, fx.x, fx.y, fx.width, fx.flip);
      keep.push(fx);
    } else if (fx.t === "bolt") {
      if (elapsed > 260) continue;
      const sheet = fxSheet("lightning-bolt");
      if (sheet) drawFx(ctx, sheet, 0, fx.x, fx.bottom, 70, 1 - elapsed / 300);
      keep.push(fx);
    } else if (fx.t === "tracer") {
      if (elapsed > 130) continue;
      const a = 1 - elapsed / 130;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(${fx.rgb},${(0.85 * a).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx.x0, fx.y0);
      ctx.lineTo(fx.x1, fx.y1);
      ctx.stroke();
      ctx.restore();
      keep.push(fx);
    } else if (fx.t === "pillar") {
      if (elapsed > 900) continue;
      const t = elapsed / 900;
      const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      const w = 34 + 20 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(fx.x - w, 0, fx.x + w, 0);
      g.addColorStop(0, `rgba(${fx.rgb},0)`);
      g.addColorStop(0.5, `rgba(${fx.rgb},${(0.55 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(${fx.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(fx.x - w, fx.y - 200, w * 2, 206);
      const base = ctx.createRadialGradient(fx.x, fx.y - 4, 0, fx.x, fx.y - 4, 60);
      base.addColorStop(0, `rgba(${fx.rgb},${(0.6 * a).toFixed(3)})`);
      base.addColorStop(1, `rgba(${fx.rgb},0)`);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.ellipse(fx.x, fx.y - 4, 60, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      keep.push(fx);
    } else {
      if (elapsed > 450) continue;
      const t = elapsed / 450;
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(fx.x, fx.y, fx.radius * (0.4 + t), fx.radius * 0.35 * (0.4 + t), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      keep.push(fx);
    }
  }
  view.fx = keep;
  view.corpses = view.corpses.filter((c) => now - c.start < 4000);
}

/** Pixel size of a gold pickup of this value. */
export function coinSize(value: number): number {
  return value >= 50 ? 62 : value >= 25 ? 50 : 40;
}

function drawPickups(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, now: number, alpha: number): void {
  view.coinPos.clear();
  for (const p of s.pickups) {
    const t = Math.max(0, Math.min(1, (s.tick + alpha - p.bornAt) / Math.max(1, p.landAt - p.bornAt)));
    const yLanes = p.y0 + (p.y - p.y0) * t;
    const landed = t >= 1;
    // Falling from the sky it sways like a leaf; landed, it bobs.
    const sway = landed ? 0 : Math.sin(now / 240 + p.id) * 6 * (1 - t);
    const bob = landed ? Math.sin(now / 280 + p.id) * 3 : 0;
    const x = tileX(p.x) + sway;
    const y = BOARD.TOP + yLanes * BOARD.LANE_H + bob;
    const left = p.expireAt - s.tick;
    const blink = left < 60 && Math.floor(now / 150) % 2 === 0;
    if (landed) {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(tileX(p.x), BOARD.TOP + p.y * BOARD.LANE_H + 22, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawCoin(ctx, x, y, coinSize(p.value), now, p.id * 0.7, blink ? 0.4 : 1);
    view.coinPos.set(p.id, { x, y });
  }
}

function drawFloats(ctx: CanvasRenderingContext2D, view: View, now: number): void {
  view.floats = view.floats.filter((f) => now - f.start < 1100);
  ctx.font = "bold 20px Georgia, serif";
  ctx.textAlign = "center";
  for (const f of view.floats) {
    const t = (now - f.start) / 1100;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(f.text, f.x, f.y - t * 40);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - t * 40);
  }
  ctx.globalAlpha = 1;
}

function drawBossBar(ctx: CanvasRenderingContext2D, s: GarrisonState): void {
  if (!s.boss) return;
  const boss = s.enemies.find((e) => e.id === s.boss!.id);
  if (!boss) return;
  const w = 520;
  const x = BOARD.W / 2 - w / 2;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(x - 4, 12, w + 8, 22);
  ctx.fillStyle = boss.hp < boss.maxHp / 2 ? "#c0392b" : "#7d3cc0";
  ctx.fillRect(x, 16, w * (boss.hp / boss.maxHp), 14);
  ctx.font = "bold 14px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#f3e6c8";
  ctx.fillText(`${ENEMIES[boss.kind]!.name} — ${Math.max(0, Math.round(boss.hp))} / ${boss.maxHp}`, BOARD.W / 2, 28);
}

/**
 * Starts decoding the art this match can show (its cards, their upgrades and
 * fusions, its attackers, the charger, projectiles). A pool too large to hold
 * decoded at once (Endless: every warband) is left to load on first sight.
 */
export function preloadForConfig(cfg: GarrisonConfig): void {
  const slugs = new Set<string>([cfg.chargerSprite]);
  const shots = new Set<keyof typeof SHOT_SHEETS>();
  const addDefender = (kind: DefKind) => {
    const def = DEFENDERS[kind];
    if (!def) return;
    if (def.sprite) slugs.add(def.sprite);
    if (def.shot) shots.add(def.shot.projectile);
    if (def.upgrade) addDefender(def.upgrade.to);
  };
  const cards = [...cfg.cards, ...(cfg.conveyorPool ?? [])];
  for (const id of cards) {
    const kind = CARDS[id]?.places;
    if (kind) addDefender(kind);
  }
  for (const unit of cfg.preset ?? []) addDefender(unit.kind);
  for (const recipe of FUSIONS) {
    if (cards.some((id) => recipe.a.includes(id)) && cards.some((id) => recipe.b.includes(id))) addDefender(recipe.result);
  }
  const attackers = new Set([...cfg.enemies, ...cfg.atkCards]);
  if (cfg.boss) ["dracolich", "bone-dragon", "walking-dead", "skeleton", "zombie", "vampire"].forEach((kind) => attackers.add(kind));
  if (cfg.herald) attackers.add(cfg.herald);
  if (attackers.size <= 30) {
    for (const kind of attackers) {
      const def = ENEMIES[kind];
      if (!def) continue;
      if (def.sprite) slugs.add(def.sprite);
      if (def.ranged) shots.add(def.ranged.projectile);
      if (def.fling) slugs.add(ENEMIES[def.flingKind ?? "skeleton"]?.sprite ?? "skeleton");
      if (def.stripped) slugs.add(def.stripped);
      if (def.summon && ENEMIES[def.summon.kind]) slugs.add(ENEMIES[def.summon.kind]!.sprite);
    }
  }
  preloadSprites(slugs);
  for (const kind of shots) image(SHOT_SHEETS[kind].src);
  image(TERRAINS[cfg.terrain].field);
  image(TERRAINS[cfg.terrain].backdrop);
  image(KEEP_SRC);
  image(KEEPS.doom.src);
  for (const src of Object.values(PROP)) image(src);
  image("/assets/icons/resource-gold.webp");
}

/** Card art for a card id: a creature sprite, or a spell icon. */
export function cardSprite(card: CardId): string | null {
  const def = CARDS[card];
  return def?.places && def.places !== "mine" ? DEFENDERS[def.places]!.sprite : null;
}
