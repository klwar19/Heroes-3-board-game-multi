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
import { ASCEND_TICKS, ascendedKind, baseKind } from "@/engine/garrison/order-chaos/forms";
import { CLIMB_TICKS, hidden, isFlat, isSheep, isStructure, type Defender, type Enemy, type GarrisonConfig, type GarrisonEvent, type GarrisonState } from "@/engine/garrison/sim";
import { SHEEP_SRC, drawDome, drawLadder, drawScorch, drawSheep, drawWool } from "./oc-siege-art";
import { createAmbience, drawAmbientAir, drawAmbientGround, type Ambience } from "./ambient";
import { calmDown, createAntics, drawAngerMark, drawDizzy, motionPose, pruneAntics, restless, startMotion, type Antics } from "./antics";
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
  | { t: "tracer"; x0: number; y0: number; x1: number; y1: number; start: number; rgb: string }
  | { t: "beam"; x0: number; x1: number; y: number; start: number; rgb: string };
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
  /** Defenders knocked back or falling back a tile: they slide from where they stood. */
  slide: Map<number, { dx: number; start: number; dur: number }>;
  /** Flyers diving on the defender beneath them: when the dive began. */
  dive: Map<number, number>;
  /** When a unit last flinched from a blow. */
  flinch: Map<string, number>;
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
  /** Cloud shadows, mist and drifting air life (drawing only). */
  ambience: Ambience;
  /** Foes' little antics: reeling, guarding, fuming, swinging at the air (drawing only). */
  antics: Antics;
};

export function createView(town: string, defColor = "#3f7fe0"): View {
  return {
    scenery: createScenery(), particles: [], decals: [], stripped: new Set(), pop: new Map(), camX: 0, lineup: null, defColor, coinPos: new Map(), muzzled: new Set(), prunedAt: 0,
    phase: new Map(), anim: new Map(), flash: new Map(), swoop: new Map(), slide: new Map(), dive: new Map(), flinch: new Map(), corpses: [], fx: [], floats: [], aim: [],
    shakeUntil: 0, lastNow: 0, town, castle: null, castleReady: -1, banners: new Map(), ambience: createAmbience(), antics: createAntics()
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

/** Order & Chaos art. */
const SURGE_SRC = "/assets/order-chaos/icons/surge.webp";
const GRAVE_SRC = "/assets/order-chaos/props/grave.webp";
const VALOR_SRC = "/assets/order-chaos/icons/valor.webp";
/** The Ascension burst (a Codex-drawn 4x4 sheet, luminous on transparent); the Prayer sheet stands in until it loads. */
const ASCEND_BURST: FxSheet = {
  src: "/assets/order-chaos/fx/ascend-burst.webp", label: "Ascension burst", group: "garrison", role: "hit",
  frames: 16, cols: 4, rows: 4, frameWidth: 256, frameHeight: 256, fps: 18, anchor: "bottom", sourceDef: "imagegen-order-chaos-ascend-burst"
};

/** Golden motes rising around a unit (Ascension). */
function goldMotes(view: View, x: number, y: number, count: number, now: number): void {
  spawnParticles(view.particles, now, count, (i) => ({
    kind: i % 3 === 0 ? "spark" : "glint", x: x + (Math.random() - 0.5) * 90, y: y - Math.random() * 60,
    vx: (Math.random() - 0.5) * 0.06, vy: -0.16 - Math.random() * 0.18, life: 900 + Math.random() * 700, size: 2.2 + Math.random() * 1.6,
    color: i % 2 === 0 ? "#ffe9a0" : "#fff6d8", rot: Math.random()
  }));
}

/** Hearts or music notes rising from a point (charms, dances). */
function rising(view: View, kind: "heart" | "note", x: number, y: number, count: number, colors: readonly string[], now: number): void {
  spawnParticles(view.particles, now, count, (i) => ({
    kind, x: x + (Math.random() - 0.5) * 60, y: y - Math.random() * 24, vx: (Math.random() - 0.5) * 0.04, vy: -0.06 - Math.random() * 0.07,
    life: 900 + Math.random() * 700, size: 4 + Math.random() * 3, color: colors[i % colors.length]!, rot: Math.random()
  }));
}

/** A piece (a helm, iron filings) pulled along an arc from one point to another over `dur` ms. */
function flingPiece(view: View, from: { x: number; y: number }, to: { x: number; y: number }, art: { src: string; size: number } | null, now: number, dur = 650): void {
  const g = 0.0012;
  const vx = (to.x - from.x) / dur;
  const vy = (to.y - from.y - 0.5 * g * dur * dur) / dur;
  if (art) {
    spawnParticles(view.particles, now, 1, () => ({ kind: "piece", img: art.src, size: art.size, x: from.x, y: from.y, vx, vy, g, life: dur, rot: 0, vr: 0.02 }));
    return;
  }
  spawnParticles(view.particles, now, 9, () => ({
    kind: "chip", x: from.x + (Math.random() - 0.5) * 20, y: from.y + (Math.random() - 0.5) * 20, vx: vx * (0.92 + Math.random() * 0.16), vy, g, life: dur,
    size: 4 + Math.random() * 3, color: Math.random() < 0.5 ? "#cfd9e2" : "#8f9aa6", rot: Math.random() * 3, vr: 0.02
  }));
}

/** A unit flinches from a blow (its atlas' hit reaction), at most every `gap` ms. */
function flinch(view: View, key: string, sprite: string, now: number, gap: number): void {
  if (view.anim.has(key) || now - (view.flinch.get(key) ?? -1e9) < gap) return;
  const atlas = atlasFor(sprite);
  const frames = atlas ? groupFrames(atlas, G.hit) : 0;
  if (frames === 0) return;
  view.anim.set(key, { group: G.hit, start: now, frameMs: 55, frames });
  view.flinch.set(key, now);
}

// ---------------------------------------------------------------------------
// Foe antics (see ./antics.ts): what triggers them.

/** Can this foe put on an antic? On its own feet, seen, not a structure, boss or flyer, not held fast. */
function freeToAct(s: GarrisonState, e: Enemy): boolean {
  const def = ENEMIES[e.kind];
  if (!def || e.dead || def.boss || def.structure || def.grave || def.flying || def.siege || e.kind === "banner" || e.kind === "tent") return false;
  return !hidden(e) && e.freezeUntil <= s.tick && e.stunUntil <= s.tick;
}

/** Plays one pass of an atlas group on a foe; returns how long it lasts (0 = the atlas lacks it). */
function foeClip(view: View, e: Enemy, group: number, frameMs: number, now: number): number {
  const atlas = atlasFor(enemySpriteOf(view, e));
  const frames = atlas ? groupFrames(atlas, group) : 0;
  if (frames === 0) return 0;
  view.anim.set(`e${e.id}`, { group, start: now, frameMs, frames });
  return frames * frameMs;
}

/**
 * A walking foe takes a blow. Now and then it reacts: fire makes it hop off the
 * ground; a foe behind a shield or helm tends to raise its guard (sometimes
 * lowering and raising it again); others reel half a step back, and some wince a
 * second time a beat later.
 */
function hurtAntic(view: View, s: GarrisonState, e: Enemy, burn: boolean, now: number): void {
  if (e.state !== "walk" || !freeToAct(s, e) || !restless(view.antics, e.id, now) || view.anim.has(`e${e.id}`)) return;
  const x = tileX(e.x);
  const y = feetY(e.lane);
  if (burn) {
    if (Math.random() >= 0.5) return;
    startMotion(view.antics, e.id, "hotfoot", now);
    burst(view.particles, now, "smoke", x, y - 95, 3, { speed: 0.05, up: 0.08, life: 800, size: 7, colors: ["rgba(60,52,48,0.8)", "rgba(90,80,72,0.7)"] });
    burst(view.particles, now, "ember", x, y - 6, 5, { speed: 0.16, up: 0.12, g: 0.0008, life: 500, size: 2.6, colors: ["#ffcf6a", "#ff8a3a"] });
    calmDown(view.antics, e.id, now);
    return;
  }
  if (Math.random() >= 0.4) return;
  const atlas = atlasFor(enemySpriteOf(view, e));
  if (!atlas) return;
  const canGuard = groupFrames(atlas, G.defend) > 0;
  const canReel = groupFrames(atlas, G.hit) > 0;
  const guarded = e.shield > 0 || e.armor > 0;
  if (canGuard && (guarded ? Math.random() < 0.75 : !canReel || Math.random() < 0.3)) {
    const ms = foeClip(view, e, G.defend, 70, now);
    if (Math.random() < 0.35) view.antics.queued.push({ id: e.id, at: now + ms + 160, clip: "defend" });
  } else if (canReel) {
    foeClip(view, e, G.hit, 55, now);
    startMotion(view.antics, e.id, "reel", now);
    // Hurt… fine… hurt again.
    if (Math.random() < 0.3) view.antics.queued.push({ id: e.id, at: now + 480 + Math.random() * 260, clip: "hit" });
  } else {
    return;
  }
  calmDown(view.antics, e.id, now);
}

/** Its shield or helm knocked off, or flown into a rage: it shakes with fury and shakes a fist. */
function fume(view: View, s: GarrisonState, id: number, now: number): void {
  const e = s.enemies.find((unit) => unit.id === id);
  if (!e || (e.state !== "walk" && e.state !== "eat") || !freeToAct(s, e)) return;
  startMotion(view.antics, e.id, "fume", now);
  if (!view.anim.has(`e${e.id}`)) foeClip(view, e, G.attack, 40, now);
  burst(view.particles, now + 80, "smoke", tileX(e.x), feetY(e.lane) - 100, 4, { speed: 0.07, up: 0.09, life: 700, size: 6, colors: ["rgba(255,110,80,0.75)", "rgba(210,70,50,0.7)"] });
  calmDown(view.antics, e.id, now, 1800, 1500);
}

/** The second wince and the guard raised again, when their moment comes. */
function playQueuedAntics(view: View, s: GarrisonState, now: number): void {
  if (view.antics.queued.length === 0) return;
  const keep: typeof view.antics.queued = [];
  for (const q of view.antics.queued) {
    if (q.at > now) {
      keep.push(q);
      continue;
    }
    const e = s.enemies.find((unit) => unit.id === q.id);
    if (!e || e.state !== "walk" || !freeToAct(s, e) || view.anim.has(`e${e.id}`)) continue;
    if (q.clip === "hit" && foeClip(view, e, G.hit, 55, now) > 0) startMotion(view.antics, e.id, "reel", now);
    else if (q.clip === "defend") foeClip(view, e, G.defend, 70, now);
  }
  view.antics.queued = keep;
}

/**
 * Now and then, on the move: the Revel troupe moonwalks; an enraged foe fumes; a
 * melee foe with a troop a tile or two ahead starts swinging at the air before it
 * gets there; others take a nervous step back. Only while the sim is moving it.
 */
function walkAntic(view: View, s: GarrisonState, e: Enemy, now: number, dt: number): void {
  if (e.state !== "walk" || e.x === e.px || !freeToAct(s, e) || !restless(view.antics, e.id, now) || view.antics.motion.has(e.id) || view.anim.has(`e${e.id}`)) return;
  if (Math.random() >= dt / 7000) return;
  const def = ENEMIES[e.kind]!;
  if (def.troupe || e.leader > 0) {
    startMotion(view.antics, e.id, "moonwalk", now);
    calmDown(view.antics, e.id, now, 3500, 3000);
    return;
  }
  if (e.enraged) {
    fume(view, s, e.id, now);
    return;
  }
  const ahead = def.bite > 0 && !def.ranged && s.defenders.some((d) => {
    if (d.dead || d.lane !== e.lane || isFlat(d)) return false;
    const gap = (d.col + 0.5 - e.x) * e.dir;
    return gap > 1.1 && gap < 2.4;
  });
  if (ahead && foeClip(view, e, G.attack, 75, now) > 0) {
    // Swinging at thin air: a puff where the blow lands on nothing.
    burst(view.particles, now + 220, "dust", tileX(e.x) + e.dir * 40, feetY(e.lane) - 55, 3, { speed: 0.05, life: 450, size: 5, colors: ["rgba(235,225,200,0.55)"] });
  } else if (Math.random() < 0.55) {
    startMotion(view.antics, e.id, "shuffle", now);
  }
  calmDown(view.antics, e.id, now, 4000, 5000);
}

/** A backup dancer whose Revel Queen is dancing right now (her routine is theirs). */
function troupeDancing(s: GarrisonState, e: Enemy): boolean {
  if (ENEMIES[e.kind]!.troupe) return e.state === "idle" && !e.charmed;
  if (e.leader <= 0) return false;
  const lead = s.enemies.find((o) => o.id === e.leader);
  return lead !== undefined && !lead.dead && !lead.charmed && lead.freezeUntil <= s.tick && lead.stunUntil <= s.tick && lead.state === "idle" && ENEMIES[lead.kind]!.troupe !== undefined;
}

const ZAP_RGB: Record<"lightning" | "frost" | "fire" | "bolt", string> = {
  lightning: "190,220,255", frost: "170,230,255", fire: "255,160,70", bolt: "210,170,255"
};
const ZAP_HIT: Record<"lightning" | "frost" | "fire" | "bolt", { key: string; width: number }> = {
  lightning: { key: "lightning-crackle", width: 90 }, frost: { key: "ice-bolt-hit", width: 90 },
  fire: { key: "fireball", width: 120 }, bolt: { key: "magic-arrow-hit", width: 80 }
};

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
      case "enemyHurt": {
        view.flash.set(`e${ev.id}`, now);
        // A heavy blow on a foe standing its ground makes it reel (walkers keep walking).
        const e = ev.amount >= 40 ? s.enemies.find((unit) => unit.id === ev.id) : undefined;
        if (e && (e.state === "eat" || e.state === "cast" || e.state === "raise") && e.freezeUntil <= s.tick && e.stunUntil <= s.tick) {
          flinch(view, `e${e.id}`, enemySpriteOf(view, e), now, 1200);
        } else if (ev.amount > 0) {
          const walker = s.enemies.find((unit) => unit.id === ev.id);
          if (walker) hurtAntic(view, s, walker, ev.burn, now);
        }
        break;
      }
      case "defHurt": {
        view.flash.set(`d${ev.id}`, now);
        const d = s.defenders.find((unit) => unit.id === ev.id);
        // (A Bellwether curls into its ball instead: drawDefender holds the pose while it is bitten.)
        if (d && !isFlat(d) && d.stunnedUntil <= s.tick && !DEFENDERS[d.kind]!.lure) flinch(view, `d${d.id}`, defSprite(d.kind), now, 1500);
        break;
      }
      case "defStun": {
        const p = defenderPos(s, ev.id);
        if (p) addSheet(view, "paralyze", p.x, p.y - 45, 80, now);
        break;
      }
      case "shieldBreak": {
        addSheet(view, "dispel", tileX(ev.x), feetY(ev.lane) - 50, 90, now);
        dropPiece(view, ev, now);
        fume(view, s, ev.id, now);
        break;
      }
      case "armorBreak":
        dropPiece(view, ev, now);
        fume(view, s, ev.id, now);
        break;
      case "enrage": {
        const p = enemyPos(s, ev.id);
        if (p) {
          burst(view.particles, now, "smoke", p.x, p.y - 80, 6, { speed: 0.06, up: 0.06, life: 900, size: 7, colors: ["rgba(255,90,60,0.9)", "rgba(200,40,30,0.9)"] });
          view.floats.push({ text: "RAGE!", x: p.x, y: p.y - 110, color: "#ff6a4a", start: now });
        }
        fume(view, s, ev.id, now);
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
        // A swallowed foe leaves no body.
        if (ev.how !== "devour") view.corpses.push({ sprite: enemySpriteOf(view, { id: ev.id, kind: ev.kind }), x: tileX(ev.x), y: feetY(ev.lane), flip: ev.dir < 0, scale: SPRITE_SCALE * (def.scale ?? 1), how: ev.how, start: now, kind: "unit" });
        if (ev.how === "petrify") addSheet(view, "death-stare", tileX(ev.x), feetY(ev.lane) - 40, 70, now);
        if (def.undead && ev.how !== "petrify") {
          spawnParticles(view.particles, now + 350, 1, () => ({ kind: "soul", x: tileX(ev.x), y: feetY(ev.lane) - 50, vy: -0.05, life: 1300, size: 9, color: "rgba(170,255,210,0.55)" }));
        }
        if (ev.how !== "devour") burst(view.particles, now + 200, "dust", tileX(ev.x), feetY(ev.lane) - 4, 5, { speed: 0.05, life: 700, size: 7, colors: ["rgba(120,100,70,0.8)"] });
        view.stripped.delete(ev.id);
        view.dive.delete(ev.id);
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
        // It climbs back up (its atlas' appear clip, where it has one).
        const e = s.enemies.find((unit) => unit.id === ev.id);
        const atlas = e ? atlasFor(enemySpriteOf(view, e)) : null;
        if (e && atlas && groupFrames(atlas, G.appear) > 0) playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.appear], now, 70);
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
      // --- Order & Chaos ------------------------------------------------------
      case "surge": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (!d) break;
        const p = { x: tileX(d.col + 0.5), y: feetY(d.lane) };
        playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.shoot, G.attack], now, 60);
        view.fx.push({ t: "pillar", x: p.x, y: p.y, rgb: "255,236,160", start: now });
        view.fx.push({ t: "ring", x: p.x, y: p.y - 10, color: "#fff1a8", start: now, radius: 80 });
        addSheet(view, "bless", p.x, p.y - 50, 90, now);
        view.floats.push({ text: "SURGE!", x: p.x, y: p.y - 115, color: "#ffe27a", start: now });
        spawnParticles(view.particles, now, 18, () => ({
          kind: "glint", x: p.x + (Math.random() - 0.5) * 60, y: p.y - Math.random() * 40,
          vx: (Math.random() - 0.5) * 0.05, vy: -0.14 - Math.random() * 0.14, life: 800 + Math.random() * 500, size: 2.8, color: "#fff2b0", rot: Math.random()
        }));
        break;
      }
      case "zap": {
        const tint = ev.tint ?? "lightning";
        const from = { x: tileX(ev.x), y: feetY(ev.lane) - 50 };
        const to = { x: tileX(ev.toX), y: feetY(ev.toLane) - 50 };
        view.fx.push({ t: "tracer", x0: from.x, y0: from.y, x1: to.x, y1: to.y, start: now, rgb: ZAP_RGB[tint] });
        addSheet(view, ZAP_HIT[tint].key, to.x, to.y + 5, ZAP_HIT[tint].width, now);
        break;
      }
      case "snipe": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.shoot, G.attack], now, 60);
        const from = d ? { x: tileX(d.col + 0.5) + 30, y: feetY(d.lane) - 55 } : { x: tileX(0), y: feetY(ev.lane) - 55 };
        const to = { x: tileX(ev.x), y: feetY(ev.lane) - 50 };
        view.fx.push({ t: "tracer", x0: from.x, y0: from.y, x1: to.x, y1: to.y, start: now + 80, rgb: "255,240,200" });
        addSheet(view, "sniper-shot-hit", to.x, to.y, 90, now + 80);
        break;
      }
      case "bomb": {
        const x = tileX(ev.x);
        const y = feetY(ev.lane);
        addSheet(view, "fireball", x, y - 45, 150, now);
        scorch(view, x, y, 50, now + 100);
        view.shakeUntil = Math.max(view.shakeUntil, now + 150);
        break;
      }
      case "beam": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (!d) break;
        playOnce(view, `d${d.id}`, defSprite(d.kind), [G.shoot, G.attack], now, 55);
        for (const lane of ev.lanes) view.fx.push({ t: "beam", x0: tileX(d.col + 0.8), x1: tileX(10.2), y: feetY(lane) - 52, start: now + 120, rgb: "150,220,255" });
        view.shakeUntil = Math.max(view.shakeUntil, now + 250);
        break;
      }
      case "gust": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack], now, 60);
        for (const lane of ev.lanes) {
          const x0 = d && ev.lanes.length === 1 ? tileX(d.col + 0.5) : tileX(0);
          spawnParticles(view.particles, now, 14, () => ({
            kind: "smoke", x: x0 + Math.random() * 120, y: feetY(lane) - 20 - Math.random() * 70,
            vx: 0.5 + Math.random() * 0.4, vy: (Math.random() - 0.5) * 0.03, life: 700 + Math.random() * 300, size: 8, color: "rgba(225,245,255,0.55)"
          }));
        }
        break;
      }
      case "pounce": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        const target = s.enemies.find((unit) => unit.id === ev.target);
        if (!d) break;
        playOnce(view, `d${d.id}`, defSprite(d.kind), [G.attack], now, 55);
        if (target) {
          view.swoop.set(d.id, { dx: (target.x - (d.col + 0.5) - 0.4) * BOARD.TILE, start: now, dur: 600 });
          burst(view.particles, now + 250, "chip", tileX(target.x), feetY(target.lane) - 10, 10, { speed: 0.35, up: 0.3, g: 0.0015, life: 700, size: 4, colors: ["#6b5a48", "#8a7a62"], ground: feetY(target.lane) });
          view.shakeUntil = Math.max(view.shakeUntil, now + 300);
        }
        break;
      }
      case "shellGift": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack], now, 70);
        const p = defenderPos(s, ev.target);
        if (p) addSheet(view, "protect-water", p.x, p.y - 45, 100, now);
        break;
      }
      case "sweep": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (!d) break;
        playOnce(view, `d${d.id}`, defSprite(d.kind), [G.attack], now, 50);
        for (let col = d.col; col < GW_COLS; col += 1) addSheet(view, "death-ripple", tileX(col + 0.5), feetY(ev.lane) - 30, 100, now + (col - d.col) * 55);
        view.shakeUntil = Math.max(view.shakeUntil, now + 400);
        break;
      }
      case "snatchDrop": {
        const p = defenderPos(s, ev.target);
        if (p) view.floats.push({ text: "SNATCH!", x: p.x, y: p.y - 120, color: "#ff8a6a", start: now });
        break;
      }
      case "snatched": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        const x = e ? tileX(e.x) : tileX(4.5);
        const y = e ? feetY(e.lane) : laneMid(2);
        if (ev.target >= 0) {
          view.floats.push({ text: "Carried off!", x, y: y - 130, color: "#ff8a6a", start: now });
          view.anim.delete(`d${ev.target}`);
          view.phase.delete(`d${ev.target}`);
          view.flash.delete(`d${ev.target}`);
        }
        burst(view.particles, now, "dust", x, y - 6, 6, { speed: 0.07, life: 700, size: 8, colors: ["rgba(150,130,100,0.8)"] });
        break;
      }
      case "blownAway": {
        const p = enemyPos(s, ev.id);
        if (p) view.floats.push({ text: "Blown away!", x: p.x, y: p.y - 110, color: "#cfefff", start: now });
        break;
      }
      case "ascend": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (!d) break;
        const p = { x: tileX(d.col + 0.5), y: feetY(d.lane) };
        view.anim.delete(`d${d.id}`);
        view.phase.delete(`d${d.id}`);
        view.pop.set(d.id, now + 250);
        playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack, G.shoot], now + 250, 60);
        if (ready(image(ASCEND_BURST.src))) view.fx.push({ t: "sheet", sheet: ASCEND_BURST, x: p.x, y: p.y + 14, width: 270, start: now });
        else addSheet(view, "prayer", p.x, p.y - 50, 150, now);
        view.fx.push({ t: "pillar", x: p.x, y: p.y, rgb: "255,214,110", start: now });
        view.fx.push({ t: "ring", x: p.x, y: p.y - 6, color: "#fff1a8", start: now + 120, radius: 110 });
        view.fx.push({ t: "ring", x: p.x, y: p.y - 6, color: "#ffc94a", start: now + 300, radius: 170 });
        view.floats.push({ text: `♛ ${DEFENDERS[d.kind]?.name ?? "Ascended"}`, x: p.x, y: p.y - 140, color: "#ffe08a", start: now + 200 });
        goldMotes(view, p.x, p.y, 34, now);
        view.shakeUntil = Math.max(view.shakeUntil, now + 260);
        break;
      }
      case "descend": {
        const p = defenderPos(s, ev.id);
        if (!p) break;
        view.fx.push({ t: "ring", x: p.x, y: p.y - 6, color: "rgba(255,225,150,0.7)", start: now, radius: 70 });
        burst(view.particles, now, "glint", p.x, p.y - 50, 10, { speed: 0.12, up: 0.1, life: 700, size: 2, colors: ["#fff0c0", "#d8c080"] });
        break;
      }
      case "crown":
        view.floats.push({ text: "♛ Valor crown ready — press U", x: tileX(4.5), y: BOARD.TOP + 34, color: "#ffe08a", start: now });
        break;
      case "mineLaid": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack, G.shoot], now, 60);
        const x = tileX(ev.col + 0.5);
        const y = feetY(ev.lane);
        burst(view.particles, now, "dust", x, y - 6, 8, { speed: 0.12, up: 0.1, life: 700, size: 7, colors: ["rgba(140,112,80,0.8)", "rgba(110,86,60,0.7)"] });
        burst(view.particles, now, "chip", x, y - 10, 6, { speed: 0.25, up: 0.3, g: 0.0015, life: 600, size: 3, colors: ["#5a4028", "#7a5a38"], ground: y });
        break;
      }
      case "swerve": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (!e) break;
        const x = tileX(e.x);
        burst(view.particles, now, "dust", x, feetY(e.from), 10, { speed: 0.16, up: 0.08, life: 700, size: 8, colors: ["rgba(170,140,100,0.75)"] });
        view.floats.push({ text: "Swerve!", x, y: feetY(e.to) - 110, color: "#ffcf9a", start: now });
        break;
      }
      case "reveal": {
        const p = enemyPos(s, ev.id);
        if (!p) break;
        view.floats.push({ text: "Spotted!", x: p.x, y: p.y - 115, color: "#ffb4a6", start: now });
        burst(view.particles, now, "smoke", p.x, p.y - 50, 8, { speed: 0.1, up: 0.06, life: 800, size: 9, colors: ["rgba(60,50,70,0.55)"] });
        break;
      }
      case "whirl": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (!d) break;
        const p = { x: tileX(d.col + 0.5), y: feetY(d.lane) };
        playOnce(view, `d${d.id}`, defSprite(d.kind), [G.attack], now, 45);
        view.fx.push({ t: "ring", x: p.x, y: p.y - 20, color: "#e8eef8", start: now, radius: 130 });
        view.fx.push({ t: "ring", x: p.x, y: p.y - 20, color: "#b8c6dc", start: now + 140, radius: 190 });
        spawnParticles(view.particles, now, 24, (i) => {
          const a = (i / 24) * Math.PI * 2;
          return { kind: "spark", x: p.x + Math.cos(a) * 30, y: p.y - 40 + Math.sin(a) * 12, vx: Math.cos(a) * 0.35, vy: Math.sin(a) * 0.12, life: 380, size: 2.4, color: "#f4f8ff" };
        });
        view.shakeUntil = Math.max(view.shakeUntil, now + 300);
        break;
      }
      case "roots": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack], now, 70);
        for (const id of ev.targets) {
          const p = enemyPos(s, id);
          if (!p) continue;
          addSheet(view, "slow", p.x, p.y - 30, 100, now);
          burst(view.particles, now, "chip", p.x, p.y - 4, 7, { speed: 0.12, up: 0.3, g: 0.0012, life: 800, size: 3.5, colors: ["#3f6a2a", "#5d8a36", "#7a5a38"], ground: p.y });
        }
        break;
      }
      case "blizzard": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.attack, G.cast], now, 55);
        for (const lane of ev.lanes) {
          spawnParticles(view.particles, now, 26, () => ({
            kind: "glint", x: tileX(Math.random() * GW_COLS), y: laneTop(lane) + Math.random() * 40,
            vx: -0.08 - Math.random() * 0.1, vy: 0.08 + Math.random() * 0.08, life: 900 + Math.random() * 500, size: 2.6, color: "#eaf6ff", rot: Math.random()
          }));
          for (let col = 1; col < GW_COLS; col += 2) addSheet(view, "ice-bolt-hit", tileX(col + 0.5), feetY(lane) - 35, 110, now + col * 40);
        }
        view.shakeUntil = Math.max(view.shakeUntil, now + 300);
        break;
      }
      // --- Order & Chaos: the new movers and their tricks -----------------------
      case "phase": {
        const p = enemyPos(s, ev.id);
        if (!p) break;
        spawnParticles(view.particles, now, 10, () => ({
          kind: "soul", x: p.x + (Math.random() - 0.5) * 50, y: p.y - 30 - Math.random() * 60, vx: -0.05 - Math.random() * 0.05, vy: -0.03,
          life: 700 + Math.random() * 400, size: 8, color: "rgba(170,210,255,0.55)"
        }));
        if (ev.on) view.floats.push({ text: "Phase!", x: p.x, y: p.y - 110, color: "#c4dcff", start: now });
        else view.fx.push({ t: "ring", x: p.x, y: p.y - 10, color: "#cfe0ff", start: now, radius: 50 });
        break;
      }
      case "zig": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (!e) break;
        const x = tileX(e.x);
        if (ENEMIES[e.kind]!.flying) {
          burst(view.particles, now, "glint", x, feetY(e.from) - 80, 5, { speed: 0.12, life: 400, size: 2, colors: ["#d8f6ff"] });
        } else {
          burst(view.particles, now, "dust", x, feetY(e.from) - 4, 8, { speed: 0.14, up: 0.05, life: 600, size: 7, colors: ["rgba(150,130,100,0.75)"] });
          playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.attack, G.move], now, 45);
        }
        break;
      }
      case "dance": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (!e) break;
        const x = tileX(e.x);
        const y = feetY(e.lane);
        const danceMs = ((ENEMIES[e.kind]!.troupe?.dance ?? GW_TPS) / GW_TPS) * 1000;
        // The queen and every dancer in her ring strike a pose for the length of the dance.
        const pose = (unit: Enemy) => {
          const atlas = atlasFor(enemySpriteOf(view, unit));
          if (!atlas) return;
          const group = pickGroup(atlas, G.cast, G.attack, G.shoot);
          const frames = Math.max(1, groupFrames(atlas, group));
          view.anim.set(`e${unit.id}`, { group, start: now, frameMs: Math.max(45, danceMs / frames), frames });
        };
        pose(e);
        for (const id of ev.dancers) {
          const unit = s.enemies.find((o) => o.id === id);
          if (!unit) continue;
          pose(unit);
          const p = { x: tileX(unit.x), y: feetY(unit.lane) };
          view.fx.push({ t: "ring", x: p.x, y: p.y - 6, color: "#ffb0ea", start: now + 120, radius: 45 });
          burst(view.particles, now + 120, "glint", p.x, p.y - 50, 5, { speed: 0.12, life: 500, size: 2.4, colors: ["#ffd2f4", "#fff2a8"] });
        }
        addSheet(view, "mirth", x, y - 50, 140, now);
        view.fx.push({ t: "ring", x, y: y - 6, color: "#ff7ad9", start: now, radius: 90 });
        view.fx.push({ t: "ring", x, y: y - 6, color: "#ffd35a", start: now + 180, radius: 140 });
        view.fx.push({ t: "pillar", x, y, rgb: "255,140,220", start: now });
        rising(view, "note", x, y - 70, 10, ["#ff9ae3", "#ffe07a", "#9ad8ff"], now);
        view.floats.push({ text: "Dance!", x, y: y - 130, color: "#ff9ae3", start: now });
        break;
      }
      case "raiseStart": {
        const x = tileX(ev.x);
        const y = feetY(ev.lane);
        view.fx.push({ t: "ring", x, y: y - 4, color: "#9bff7a", start: now, radius: 60 });
        addSheet(view, "curse", x, y - 40, 100, now);
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) view.floats.push({ text: "Rise…", x: tileX(e.x), y: feetY(e.lane) - 125, color: "#ffb070", start: now });
        break;
      }
      case "raiseDone": {
        const x = tileX(ev.x);
        const y = feetY(ev.lane);
        addSheet(view, "resurrection", x, y - 45, 120, now);
        flameAt(view, x, y, now);
        view.fx.push({ t: "pillar", x, y, rgb: "255,150,60", start: now });
        view.floats.push({ text: "Risen!", x, y: y - 120, color: "#ffb070", start: now });
        break;
      }
      case "raiseFail": {
        const p = enemyPos(s, ev.id);
        if (!p) break;
        burst(view.particles, now, "smoke", p.x, p.y - 80, 6, { speed: 0.06, up: 0.05, life: 800, size: 8, colors: ["rgba(90,110,80,0.7)"] });
        view.floats.push({ text: "Spell broken!", x: p.x, y: p.y - 125, color: "#d8e0c8", start: now });
        break;
      }
      case "crush": {
        const p = defenderPos(s, ev.target);
        if (!p) break;
        burst(view.particles, now, "chip", p.x, p.y - 20, 12, { speed: 0.35, up: 0.3, g: 0.0015, life: 800, size: 4.5, colors: ["#6b5a48", "#8a7a62", "#3e3326"], ground: p.y });
        burst(view.particles, now, "dust", p.x, p.y - 6, 8, { speed: 0.09, life: 800, size: 9, colors: ["rgba(130,110,80,0.8)"] });
        view.floats.push({ text: "Crushed!", x: p.x, y: p.y - 115, color: "#ffb080", start: now });
        view.shakeUntil = Math.max(view.shakeUntil, now + 220);
        break;
      }
      case "pop": {
        const x = tileX(ev.x);
        const y = feetY(ev.lane);
        addSheet(view, "fireball", x, y - 45, 150, now);
        burst(view.particles, now, "spark", x, y - 50, 16, { speed: 0.4, life: 400, size: 2.6, colors: ["#fff4c8", "#ffc45a"] });
        burst(view.particles, now + 80, "smoke", x, y - 40, 8, { speed: 0.07, up: 0.05, life: 1200, size: 11, colors: ["rgba(70,60,55,0.85)"] });
        view.floats.push({ text: "POP!", x, y: y - 120, color: "#ffe07a", start: now });
        view.shakeUntil = Math.max(view.shakeUntil, now + 300);
        break;
      }
      case "shove": {
        const e = s.enemies.find((unit) => unit.id === ev.by);
        if (e) playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.attack], now, 45);
        const moved = ev.from !== ev.to;
        if (moved) view.slide.set(ev.id, { dx: (ev.from - ev.to) * BOARD.TILE, start: now, dur: 380 });
        const x = tileX(ev.from + 0.5);
        const y = feetY(ev.lane);
        burst(view.particles, now, "spark", x + 30, y - 55, 10, { speed: 0.3, life: 300, size: 2.4, colors: ["#fff4c8", "#ffd070"] });
        burst(view.particles, now, "dust", x, y - 6, 7, { speed: 0.1, life: 700, size: 8, colors: ["rgba(140,120,90,0.8)"] });
        if (moved) view.floats.push({ text: "Knocked back!", x, y: y - 118, color: "#ffc27a", start: now });
        view.shakeUntil = Math.max(view.shakeUntil, now + 200);
        break;
      }
      case "blink": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (!e) break;
        const x = tileX(ev.fromX);
        const y = feetY(e.lane);
        burst(view.particles, now, "glint", x, y - 50, 8, { speed: 0.18, life: 450, size: 2.4, colors: ["#e2b8ff", "#fff0ff"] });
        burst(view.particles, now, "smoke", x, y - 45, 5, { speed: 0.05, life: 600, size: 7, colors: ["rgba(150,90,200,0.55)"] });
        break;
      }
      case "gasp": {
        const p = enemyPos(s, ev.id);
        if (!p) break;
        burst(view.particles, now, "dust", p.x, p.y - 6, 6, { speed: 0.08, life: 700, size: 8, colors: ["rgba(120,100,70,0.8)"] });
        view.floats.push({ text: "…still hungry", x: p.x, y: p.y - 100, color: "#b8d9a0", start: now });
        break;
      }
      case "daze": {
        const p = enemyPos(s, ev.id);
        if (!p) break;
        addSheet(view, "blind", p.x, p.y - 70, 80, now);
        view.floats.push({ text: "Dazed", x: p.x, y: p.y - 115, color: "#fff0a0", start: now });
        break;
      }
      case "flee": {
        const p = enemyPos(s, ev.id);
        if (!p) break;
        burst(view.particles, now, "dust", p.x - 10, p.y - 6, 8, { speed: 0.12, life: 600, size: 7, colors: ["rgba(160,140,100,0.8)"] });
        view.floats.push({ text: "Runs for it!", x: p.x, y: p.y - 118, color: "#ffcf7a", start: now });
        break;
      }
      case "escape": {
        const x = tileX(Math.min(9.1, ev.x));
        const y = feetY(ev.lane);
        burst(view.particles, now, "smoke", x, y - 40, 6, { speed: 0.06, life: 700, size: 9, colors: ["rgba(120,110,100,0.6)"] });
        if (ev.loot > 0) view.floats.push({ text: `-${ev.loot} gold got away`, x: x - 30, y: y - 100, color: "#ffb04a", start: now });
        break;
      }
      case "skyAttack": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        const to = { x: tileX(ev.col + 0.5), y: feetY(ev.lane) - 45 };
        if (e) {
          playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.attack, G.shoot], now, 55);
          if (ev.kind === "dive") view.dive.set(e.id, now);
        }
        if (ev.kind === "dive") {
          burst(view.particles, now + 250, "spark", to.x, to.y - 10, 8, { speed: 0.3, life: 300, size: 2.4, colors: ["#fff4c8", "#c8ff9a"] });
          burst(view.particles, now + 300, "smoke", to.x, to.y, 5, { speed: 0.05, life: 900, size: 8, colors: ["rgba(120,200,80,0.55)"] });
        } else if (ev.kind === "spit") {
          const from = e ? { x: tileX(e.x), y: feetY(e.lane) - 120 } : { x: to.x, y: to.y - 80 };
          view.fx.push({ t: "tracer", x0: from.x, y0: from.y, x1: to.x, y1: to.y, start: now + 80, rgb: "200,160,255" });
          addSheet(view, "lightning-crackle", to.x, to.y + 5, 90, now + 80);
        } else {
          flameAt(view, to.x, feetY(ev.lane), now + 100);
          flameAt(view, tileX(ev.col + 0.5 + (e && e.dir > 0 ? 1 : -1)), feetY(ev.lane), now + 220);
          view.shakeUntil = Math.max(view.shakeUntil, now + 250);
        }
        break;
      }
      case "divert": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack], now, 65);
        const e = s.enemies.find((unit) => unit.id === ev.target);
        if (!e) break;
        const x = tileX(e.x);
        const y0 = feetY(e.from);
        addSheet(view, "forgetfulness", x, y0 - 55, 90, now);
        burst(view.particles, now, "smoke", x, y0 - 50, 7, { speed: 0.06, life: 900, size: 9, colors: ["rgba(230,180,255,0.55)", "rgba(200,230,255,0.5)"] });
        view.floats.push({ text: "Bewildered!", x, y: y0 - 115, color: "#e7b6ff", start: now });
        break;
      }
      case "magnet": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.shoot, G.attack], now, 60);
        const from = { x: tileX(ev.x), y: feetY(ev.lane) - 80 };
        const to = d ? { x: tileX(d.col + 0.5), y: feetY(d.lane) - 60 } : from;
        view.fx.push({ t: "tracer", x0: to.x, y0: to.y, x1: from.x, y1: from.y, start: now, rgb: "140,190,255" });
        addSheet(view, "disrupting-ray", from.x, from.y + 30, 90, now);
        // Armour: the foe fights on in its bare sprite.
        if (ev.piece === "armor") view.stripped.add(ev.target);
        const piece = ev.piece === "armor" ? ENEMIES[ev.kind]?.piece : undefined;
        flingPiece(view, from, to, piece ? PIECE_ART[piece] : null, now);
        view.floats.push({ text: ev.piece === "armor" ? "Helm pulled!" : "Shield pulled!", x: from.x, y: from.y - 40, color: "#bcd6ff", start: now });
        break;
      }
      case "devour": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) {
          playOnce(view, `d${d.id}`, defSprite(d.kind), [G.attack], now, 50);
          view.swoop.set(d.id, { dx: (ev.x - (d.col + 0.5) - 0.3) * BOARD.TILE, start: now, dur: 520 });
        }
        const x = tileX(ev.x);
        const y = feetY(ev.lane);
        if (ev.whole) {
          view.anim.delete(`e${ev.target}`);
          burst(view.particles, now + 200, "chip", x, y - 40, 12, { speed: 0.3, up: 0.25, g: 0.0014, life: 700, size: 4, colors: ["#3a6a8a", "#7ab0d0", "#cfeaff"], ground: y });
          view.floats.push({ text: "Gulp!", x, y: y - 110, color: "#9ad8ff", start: now + 200 });
        } else {
          burst(view.particles, now + 200, "spark", x, y - 50, 8, { speed: 0.3, life: 300, size: 2.4, colors: ["#fff4c8", "#ff9a7a"] });
        }
        break;
      }
      case "charm": {
        const p = enemyPos(s, ev.id);
        if (!p) break;
        addSheet(view, "hypnotize", p.x, p.y - 55, 100, now);
        rising(view, "heart", p.x, p.y - 70, 12, ["#ff6fa8", "#ffb3d1", "#ff3d7f"], now);
        view.fx.push({ t: "ring", x: p.x, y: p.y - 8, color: "#ff8fc0", start: now, radius: 70 });
        view.floats.push({ text: "♥ Charmed!", x: p.x, y: p.y - 125, color: "#ff8fc0", start: now });
        break;
      }
      case "kite": {
        view.slide.set(ev.id, { dx: (ev.from - ev.to) * BOARD.TILE, start: now, dur: 420 });
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) playOnce(view, `d${d.id}`, defSprite(d.kind), [G.move, G.attack], now, 45);
        if (d) burst(view.particles, now, "dust", tileX(ev.from + 0.5), feetY(d.lane) - 6, 8, { speed: 0.12, life: 600, size: 7, colors: ["rgba(150,130,100,0.75)"] });
        break;
      }
      default:
        siegeEventFx(view, s, ev, now);
        break;
    }
  }
}

/** A Prism Elemental's colours (a fixed few, so the cached glow sprites stay few). */
const PRISM_GLOWS = ["rgba(255,140,220,0.75)", "rgba(150,210,255,0.75)", "rgba(255,236,140,0.75)", "rgba(170,255,190,0.75)", "rgba(210,160,255,0.75)"] as const;

/** A puff of smoke and wool: a troop turned into a sheep, or back. */
function sheepPoof(view: View, x: number, y: number, now: number): void {
  burst(view.particles, now, "smoke", x, y - 45, 12, { speed: 0.12, up: 0.05, life: 750, size: 12, colors: ["rgba(220,190,255,0.75)", "rgba(245,240,250,0.85)"] });
  burst(view.particles, now, "glint", x, y - 55, 10, { speed: 0.2, life: 500, size: 2.6, colors: ["#f2d8ff", "#ffffff"] });
  view.fx.push({ t: "ring", x, y: y - 8, color: "#d9b4ff", start: now, radius: 60 });
}

/** Order & Chaos siegecraft events: hexes, prisms, ladders, the Aegis dome, lures and a Lizard Warrior's charge. */
function siegeEventFx(view: View, s: GarrisonState, ev: GarrisonEvent, now: number): void {
  switch (ev.e) {
    case "hex": {
      const e = s.enemies.find((unit) => unit.id === ev.id);
      if (e) playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.cast, G.shoot, G.attack], now, 60);
      const p = defenderPos(s, ev.target);
      if (!p) break;
      if (e) view.fx.push({ t: "tracer", x0: tileX(e.x), y0: feetY(e.lane) - 70, x1: p.x, y1: p.y - 50, start: now, rgb: "220,150,255" });
      sheepPoof(view, p.x, p.y, now + 120);
      view.anim.delete(`d${ev.target}`);
      view.floats.push({ text: "Baa!", x: p.x, y: p.y - 110, color: "#f0e0ff", start: now + 150 });
      break;
    }
    case "unhex": {
      const p = defenderPos(s, ev.id);
      if (p) sheepPoof(view, p.x, p.y, now);
      view.pop.set(ev.id, now);
      break;
    }
    case "spin": {
      const p = enemyPos(s, ev.id);
      if (p) {
        view.fx.push({ t: "ring", x: p.x, y: p.y - 60, color: "#d8b8ff", start: now, radius: 55 });
        burst(view.particles, now, "glint", p.x, p.y - 70, 10, { speed: 0.22, life: 500, size: 2.4, colors: ["#ffd0f0", "#c8f0ff", "#fff6b0"] });
      }
      break;
    }
    case "reflect": {
      const x = tileX(ev.x);
      const y = feetY(ev.lane) - 48;
      view.flash.set(`e${ev.id}`, now);
      view.fx.push({ t: "ring", x: x - 20, y, color: "#fff4ff", start: now, radius: 38 });
      burst(view.particles, now, "glint", x - 20, y, 12, { speed: 0.3, life: 420, size: 2.6, colors: ["#ffffff", "#ffc8f4", "#bff4ff", "#fff1a0"] });
      view.floats.push({ text: "Reflected!", x, y: y - 70, color: "#f4d0ff", start: now });
      break;
    }
    case "ladderPlant": {
      const e = s.enemies.find((unit) => unit.id === ev.id);
      if (e) view.floats.push({ text: "Ladder!", x: tileX(e.x), y: feetY(e.lane) - 120, color: "#ffcf8a", start: now });
      break;
    }
    case "ladder": {
      const p = defenderPos(s, ev.target);
      if (!p) break;
      burst(view.particles, now, "chip", p.x + 40, p.y - 6, 8, { speed: 0.2, up: 0.25, g: 0.0014, life: 600, size: 3.5, colors: ["#8a5a2a", "#b07a44"], ground: p.y });
      burst(view.particles, now, "dust", p.x + 40, p.y - 4, 5, { speed: 0.06, life: 700, size: 8, colors: ["rgba(140,115,80,0.8)"] });
      break;
    }
    case "climb": {
      const e = s.enemies.find((unit) => unit.id === ev.id);
      if (e) playOnce(view, `e${e.id}`, enemySpriteOf(view, e), [G.move, G.attack], now, 55);
      break;
    }
    case "aegis": {
      const x = tileX(ev.x);
      const y = feetY(ev.lane);
      view.flash.set(`dome${ev.id}`, now);
      view.fx.push({ t: "ring", x, y: y - 70, color: "#bfe4ff", start: now, radius: 48 });
      // The blow glances off the shell and tumbles away.
      const bits = ev.kind === "boulder" ? ["#8a8070", "#6a6256", "#b0a690"] : ev.kind === "fireball" || ev.kind === "hellfire" ? ["#ffc060", "#ff8030"] : ["#d8f0ff", "#ffffff"];
      burst(view.particles, now, "chip", x, y - 95, ev.kind === "boulder" ? 10 : 6, { speed: 0.35, up: 0.35, g: 0.0015, life: 800, size: ev.kind === "boulder" ? 5 : 3, colors: bits, ground: y });
      burst(view.particles, now, "spark", x, y - 95, 10, { speed: 0.3, life: 320, size: 2.4, colors: ["#e8f6ff", "#bfe4ff"] });
      view.floats.push({ text: ev.kind === "snatch" ? "Warded!" : "Blocked!", x, y: y - 130, color: "#bfe4ff", start: now });
      break;
    }
    case "lure": {
      const d = s.defenders.find((unit) => unit.id === ev.id);
      if (d) {
        playOnce(view, `d${d.id}`, defSprite(d.kind), [G.cast, G.attack, G.shoot], now, 60);
        view.fx.push({ t: "ring", x: tileX(d.col + 0.5), y: feetY(d.lane) - 60, color: "#ffe6a0", start: now, radius: 70 });
      }
      const p = enemyPos(s, ev.target);
      if (p) {
        view.floats.push({ text: "Lured!", x: p.x, y: p.y - 115, color: "#ffe6a0", start: now });
        rising(view, "note", p.x, p.y - 70, 3, ["#ffe6a0", "#fff6d0"], now);
      }
      break;
    }
    case "lizardCharge": {
      const x = tileX(ev.col + 0.5);
      const y = feetY(ev.lane);
      view.anim.delete(`d${ev.id}`);
      view.phase.delete(`d${ev.id}`);
      view.flash.delete(`d${ev.id}`);
      view.pop.delete(ev.id);
      burst(view.particles, now, "dust", x, y - 6, 12, { speed: 0.2, up: 0.05, life: 800, size: 10, colors: ["rgba(150,130,100,0.8)"] });
      view.floats.push({ text: "CHARGE!", x, y: y - 120, color: "#9af07a", start: now });
      view.shakeUntil = Math.max(view.shakeUntil, now + 200);
      break;
    }
    default:
      break;
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
  } else if (ev.kind === "storm") {
    // Lightning races down the lane.
    for (let col = 0; col < GW_COLS; col += 1) {
      view.fx.push({ t: "bolt", x: tileX(col + 0.5), top: laneTop(ev.lane) - 60, bottom: feetY(ev.lane), start: now + col * 45 });
      addSheet(view, "lightning-crackle", tileX(col + 0.5), feetY(ev.lane) - 40, 110, now + col * 45);
    }
    view.shakeUntil = now + 450;
  } else if (ev.kind === "frost-nova") {
    addSheet(view, "frost-ring", x, y, 380, now);
  } else if (ev.kind === "arrows") {
    for (let i = 0; i < 6; i += 1) {
      const sheet = SHOT_SHEETS.arrow;
      view.fx.push({ t: "impact", sheet, x: x + (Math.random() - 0.5) * 260, y: y + (Math.random() - 0.5) * 200, width: sheet.impact * CELL, start: now + i * 25, flip: false });
    }
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
    // Order & Chaos general and signature spells.
    case "lightning-bolt":
      view.fx.push({ t: "bolt", x, top: laneTop(ev.lane) - 60, bottom: feetY(ev.lane), start: now });
      addSheet(view, "lightning-bolt", x, y + 10, 150, now);
      view.shakeUntil = Math.max(view.shakeUntil, now + 180);
      break;
    case "ice-bolt":
      addSheet(view, "ice-bolt-hit", x, y, 150, now);
      break;
    case "blind":
      addSheet(view, "blind", x, y, 120, now);
      break;
    case "implosion":
      addSheet(view, "implosion", x, y, 200, now);
      view.shakeUntil = Math.max(view.shakeUntil, now + 450);
      break;
    case "cure":
      for (const d of s.defenders) if (d.kind !== "mine") addSheet(view, "cure", tileX(d.col + 0.5), feetY(d.lane) - 40, 90, now);
      break;
    case "death-ripple":
      for (const e of s.enemies) if (!isStructure(e) && !ENEMIES[e.kind]?.undead) addSheet(view, "death-ripple", tileX(e.x), feetY(e.lane) - 30, 110, now);
      view.shakeUntil = Math.max(view.shakeUntil, now + 600);
      break;
    case "frenzy":
      for (const d of s.defenders) if (DEFENDERS[d.kind]?.melee) addSheet(view, "frenzy", tileX(d.col + 0.5), feetY(d.lane) - 45, 90, now);
      break;
    case "inferno":
      addSheet(view, "inferno", x, y, 320, now);
      view.shakeUntil = Math.max(view.shakeUntil, now + 500);
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
  for (const map of [view.phase, view.anim, view.flash, view.flinch]) {
    for (const key of map.keys()) {
      if (/^(e|d|soul)\d+$/.test(key) && !live.has(key)) map.delete(key);
      // An Aegis dome's block flash, keyed by its bearer.
      else if (/^dome\d+$/.test(key) && !live.has(`d${key.slice(4)}`)) map.delete(key);
    }
  }
  for (const id of view.stripped) if (!live.has(`e${id}`)) view.stripped.delete(id);
  for (const id of view.pop.keys()) if (!live.has(`d${id}`)) view.pop.delete(id);
  for (const id of view.swoop.keys()) if (!live.has(`d${id}`)) view.swoop.delete(id);
  for (const id of view.slide.keys()) if (!live.has(`d${id}`)) view.slide.delete(id);
  for (const id of view.dive.keys()) if (!live.has(`e${id}`)) view.dive.delete(id);
  pruneAntics(view.antics, new Set(s.enemies.map((e) => e.id)));
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
  drawAmbientGround(ctx, view.ambience, s.cfg.terrain, BOARD.W, BOARD.H, now);
  if (s.cfg.mode === "versus") {
    const [, maxCol] = overlay.defCols;
    ctx.fillStyle = "rgba(120,20,20,0.18)";
    for (const lane of s.cfg.lanes) ctx.fillRect(tileX(maxCol + 1), laneTop(lane), tileX(GW_COLS) - tileX(maxCol + 1), BOARD.LANE_H);
  }
  view.decals = drawDecals(ctx, view.decals, now);
  // Order & Chaos: ground a Juggernaut left burning (nothing can be placed there until it cools).
  for (const t of s.scorched ?? []) {
    const heat = Math.max(0, Math.min(1, (t.until - tick) / (15 * GW_TPS)));
    drawScorch(ctx, tileX(t.col), laneTop(t.lane), BOARD.TILE, BOARD.LANE_H, heat, now, t.lane * 9 + t.col);
  }
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

  playQueuedAntics(view, s, now);

  // Units, lane by lane (lower lanes overlap the ones above).
  for (let lane = 0; lane < GW_LANES; lane += 1) {
    for (const c of s.chargers) if (c.lane === lane) drawCharger(ctx, s, view, c.state, lerp(c.px, c.x), lane, dt, c.sprite);
    const defenders = s.defenders.filter((d) => d.lane === lane).sort((a, b) => a.col - b.col);
    for (const d of defenders) drawDefender(ctx, s, view, d, now, dt, overlay.selected === d.id);
    drawCorpses(ctx, view, now, lane);
    const enemies = s.enemies.filter((e) => Math.round(e.state === "glide" ? e.to : e.lane) === lane).sort((a, b) => b.x - a.x);
    for (const e of enemies) drawEnemy(ctx, s, view, e, now, dt, alpha);
  }
  if (s.cfg.oc) drawAegisDomes(ctx, s, view, now);
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
    } else if (p.lob && (p.kind === "boulder" || p.kind === "stone" || p.kind === "gift")) {
      // A lobbed rock (or gift) tumbles end over end on its way down.
      const t = Math.max(0, Math.min(1, (tick + alpha - p.lob.t0) / p.lob.dur));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * Math.PI * 3 * (p.lob.toX < p.lob.fromX ? -1 : 1));
      drawShot(ctx, sheet, cell, 0, 0, sheet.width * CELL, p.dir < 0);
      ctx.restore();
    } else {
      drawShot(ctx, sheet, cell, x, y, sheet.width * CELL, p.dir < 0);
    }
    if (p.kind === "rocket" && Math.random() < dt / 45) {
      burst(view.particles, now, "smoke", x - 26 * p.dir, y, 1, { speed: 0.02, life: 650, size: 5, colors: ["rgba(90,85,80,0.9)"] });
    }
    if (p.burn && !p.lob) {
      drawGlow(ctx, "rgba(255,190,80,0.85)", x, y, 22);
      // Set alight by a Salamander (or an Efreet): it trails embers.
      if (Math.random() < dt / 35) burst(view.particles, now, "ember", x - 14 * p.dir, y, 1, { speed: 0.04, up: 0.05, life: 420, size: 3, colors: ["#ffcf6a", "#ff8a3a"] });
    }
    // Turned back by a Prism Elemental: it glints in prism colours on its way home.
    if (p.reflected) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      drawGlow(ctx, PRISM_GLOWS[Math.floor(now / 90) % PRISM_GLOWS.length]!, x, y, 20);
      ctx.restore();
      if (Math.random() < dt / 40) burst(view.particles, now, "glint", x + 12, y, 1, { speed: 0.05, life: 320, size: 2.2, colors: ["#ffd8f6", "#c8f4ff", "#fff4b0"] });
    }
  }
  drawFxLayer(ctx, view, now);
  view.particles = drawParticles(ctx, view.particles, now);
  drawAmbientAir(ctx, view.ambience, s.cfg.terrain, BOARD.W, BOARD.H, now, dt);
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

function drawCharger(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, state: string, x: number, lane: number, dt: number, sprite?: string): void {
  if (state === "gone") return;
  // A Lizard Warrior's last charge (or its war party) rides its own sprite.
  const atlas = atlasFor(sprite ?? s.cfg.chargerSprite);
  if (!atlas) return;
  const charging = state === "charging";
  const group = charging ? pickGroup(atlas, G.move) : G.stand;
  const frames = Math.max(1, groupFrames(atlas, group));
  const frame = frameOf(view, `c${lane}${sprite ?? ""}${charging ? "m" : "s"}`, frames, charging ? 55 : 150, dt, false);
  if (sprite && charging && Math.random() < dt / 50) {
    burst(view.particles, view.lastNow, "dust", tileX(x) - 30, feetY(lane) - 4, 1, { speed: 0.06, life: 600, size: 9, colors: ["rgba(140,120,90,0.75)"] });
  }
  // Grounded on the gate apron (and on the lawn once it rides out), like every other unit.
  drawContactShadow(ctx, tileX(x), feetY(lane) + 4, 40);
  drawAtlas(ctx, atlas, group, frame, tileX(x), feetY(lane) + 4, SPRITE_SCALE * 0.9, false);
}

/** Order & Chaos: every Aegis Bearer's dome over the tiles it guards (brightening when a blow glances off it). */
function drawAegisDomes(ctx: CanvasRenderingContext2D, s: GarrisonState, view: View, now: number): void {
  for (const d of s.defenders) {
    const aegis = DEFENDERS[d.kind]!.aegis;
    if (!aegis || d.dead) continue;
    const key = `dome${d.id}`;
    const hitAt = view.flash.get(key);
    if (hitAt !== undefined && now - hitAt > 450) view.flash.delete(key);
    // A hexed bearer drops its shield.
    if (isSheep(s, d)) continue;
    const widened = d.domeUntil > s.tick;
    const reach = aegis.reach + (widened ? 1 : 0);
    const flash = hitAt !== undefined ? Math.max(0, 1 - (now - hitAt) / 450) : 0;
    // A bubble over the 3x3 (5x5 widened) it guards.
    drawDome(ctx, tileX(d.col + 0.5), laneMid(d.lane) + 8, (reach + 0.5) * BOARD.TILE, (reach + 0.5) * BOARD.LANE_H, now, flash, widened);
  }
}

/** A soft oval shadow under a unit's feet: it stands on the lawn instead of floating over it. */
function drawContactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.translate(x, y + 2);
  ctx.scale(1, 0.26);
  drawGlow(ctx, "rgba(0,0,0,1)", 0, 0, r);
  ctx.restore();
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
  // Order & Chaos: an armed buried charge lies flat like a mine.
  if (def.trap && s.tick >= d.armedAt) {
    const sheet = fxSheet("land-mine-a");
    if (sheet) drawFx(ctx, sheet, (now / 70) % sheet.frames, x, y - 8, 64, 1);
    return;
  }
  if (def.spikes) {
    ctx.fillStyle = "#8f8676";
    ctx.strokeStyle = "rgba(40,32,24,0.8)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i += 1) {
      const sx = x - 45 + i * 18;
      const sy = y + 2 + (i % 2) * 4;
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy + 4);
      ctx.lineTo(sx, sy - 14);
      ctx.lineTo(sx + 6, sy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  if (def.instant) {
    const color = def.instant.kind === "frost" ? "rgba(150,220,255,0.7)" : def.instant.kind === "storm" ? "rgba(190,210,255,0.7)" : "rgba(255,150,60,0.75)";
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, color, x, y - 45, 50 + 12 * Math.sin(now / 60));
    ctx.restore();
  }
  // Order & Chaos Cupi: a soft pink glow of love.
  if (def.charm) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, "rgba(255,110,170,0.4)", x, y - 50, 46 + 6 * Math.sin(now / 220 + d.id));
    ctx.restore();
  }
  if (d.invulnUntil > s.tick || d.surgeLeft > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, d.invulnUntil > s.tick ? "rgba(255,230,140,0.55)" : "rgba(255,240,170,0.45)", x, y - 45, 64 + 6 * Math.sin(now / 120));
    ctx.restore();
  }
  if (s.protectIds.includes(d.id)) {
    ctx.save();
    ctx.strokeStyle = `rgba(255,214,90,${0.55 + 0.25 * Math.sin(now / 300)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 44, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Order & Chaos Ascension: a radiant golden aura behind the form.
  const ascended = def.ascendedFrom !== undefined;
  if (ascended) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pulse = Math.sin(now / 170 + d.id);
    drawGlow(ctx, "rgba(255,206,90,0.55)", x, y - 50, 86 + 8 * pulse);
    drawGlow(ctx, "rgba(255,244,200,0.35)", x, y - 60, 44 + 4 * pulse);
    ctx.strokeStyle = "rgba(255,222,130,0.35)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i += 1) {
      const a = now / 900 + (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 30, y - 55 + Math.sin(a) * 30);
      ctx.lineTo(x + Math.cos(a) * (72 + 6 * pulse), y - 55 + Math.sin(a) * (72 + 6 * pulse));
      ctx.stroke();
    }
    ctx.restore();
    if (Math.random() < dt / 140) goldMotes(view, x, y, 1, now);
  }
  const atlas = atlasFor(def.sprite);
  if (!atlas) return;
  const key = `d${d.id}`;
  const stunned = d.stunnedUntil > s.tick;
  const clip = stunned ? null : activeClip(view, key, now);
  // A Sea Serpent digesting chews contentedly instead of resting like a spent gazer.
  const digesting = def.devour !== undefined && d.busyUntil > s.tick;
  const resting = d.busyUntil > s.tick && !digesting;
  let group = clip?.group ?? G.stand;
  let frame = clip?.frame ?? 0;
  if (!clip) {
    group = resting ? pickGroup(atlas, G.defend, G.stand) : G.stand;
    const frames = Math.max(1, groupFrames(atlas, group));
    frame = resting ? Math.min(frames - 1, 2) : frameOf(view, key, frames, 130, dt, stunned);
  }
  // Order & Chaos Bellwether: curled up in its ball while something is biting it.
  const balled = def.lure !== undefined && !clip && s.enemies.some((e) => !e.dead && e.state === "eat" && e.target === d.id);
  if (balled) {
    group = pickGroup(atlas, G.defend, G.stand);
    frame = Math.floor(Math.max(1, groupFrames(atlas, group)) / 2);
  }
  const sheep = isSheep(s, d);
  let dx = 0;
  const swoop = view.swoop.get(d.id);
  if (swoop) {
    const t = (now - swoop.start) / swoop.dur;
    if (t >= 1) view.swoop.delete(d.id);
    else dx = swoop.dx * Math.sin(Math.PI * t);
  }
  // Knocked back / fallen back a tile: it slides from where it stood.
  const slide = view.slide.get(d.id);
  if (slide) {
    const t = (now - slide.start) / slide.dur;
    if (t >= 1) view.slide.delete(d.id);
    else if (t > 0) dx += slide.dx * (1 - t) * (1 - t);
    else dx += slide.dx;
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
  // Idle troops breathe (PvZ plants never stand perfectly still).
  if (!stretch && !clip && !resting && !stunned && !def.instant) {
    const b = Math.sin(now / 520 + d.id * 1.3);
    stretch = { x: 1 - 0.012 * b, y: 1 + 0.02 * b };
  }
  if (digesting && !stretch) {
    const chew = Math.sin(now / 110 + d.id);
    stretch = { x: 1 + 0.05 * chew, y: 1 - 0.05 * chew };
    if (Math.random() < dt / 260) burst(view.particles, now, "glint", x + 10, y - 70, 1, { speed: 0.05, up: 0.08, life: 700, size: 2, colors: ["#bfe8ff"] });
  }
  drawContactShadow(ctx, x + dx, y, 36 * (def.scale ?? 1));
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
  // Summoned troops fade as their time runs out.
  if (d.expireAt > 0 && d.expireAt - s.tick < 3 * GW_TPS) ctx.globalAlpha = Math.floor(now / 160) % 2 === 0 ? 0.45 : 0.8;
  if (ascended) ctx.filter = ctx.filter === "none" ? "saturate(1.25) brightness(1.08)" : `${ctx.filter} saturate(1.25) brightness(1.08)`;
  if (!sheep) drawAtlas(ctx, atlas, group, frame, x + dx, y + drop, SPRITE_SCALE * (def.scale ?? 1) * (ascended ? 1.14 : 1), false, stretch);
  else if (!drawSheep(ctx, x + dx, y + drop, now, d.id)) {
    // Hexed: a sheep (the troop greyed under a woolly fleece until the sheep art is in).
    ctx.filter = "grayscale(1) brightness(1.25) contrast(0.8)";
    drawAtlas(ctx, atlas, G.stand, 0, x + dx, y + drop + 6, SPRITE_SCALE * (def.scale ?? 1) * 0.8, false, { x: 1.15, y: 0.72 });
    ctx.filter = "none";
    drawWool(ctx, x + dx, y + drop, now, d.id);
  }
  ctx.globalAlpha = 1;
  if (selected) ctx.restore();
  ctx.filter = "none";
  if (sheep && Math.random() < dt / 2600) view.floats.push({ text: "Baa!", x: x + dx - 20, y: y - 95, color: "#f0e0ff", start: now });
  // Order & Chaos: a Ladder Hobgoblin's ladder leans on this troop (the horde climbs over it).
  if (d.laddered) {
    const top = def.tall ? 150 : 118;
    drawLadder(ctx, x + dx + 58, y + 2, x + dx + 14, y - top * (def.scale ?? 1), 17);
  }
  if (ascended && d.ascendUntil > s.tick) {
    // The crown and how much of the Ascension is left.
    const full = ASCEND_TICKS * (s.def.blessings.includes("helm-of-enlightenment") ? 1.5 : 1);
    const left = Math.max(0, Math.min(1, (d.ascendUntil - s.tick) / full));
    const cy = y - 118 - 3 * Math.sin(now / 260 + d.id);
    ctx.save();
    ctx.strokeStyle = "rgba(40,24,4,0.7)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, cy, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#ffd65a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, cy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
    const crown = image(VALOR_SRC);
    if (ready(crown)) ctx.drawImage(crown, x - 11, cy - 11, 22, 22);
    else {
      ctx.fillStyle = "#ffd65a";
      ctx.font = "bold 18px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("♛", x, cy + 6);
    }
    ctx.restore();
  }
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
  if (def.trap) {
    // Still digging in: how far the charge is from armed.
    hpBar(ctx, x, y + 8, 40, 1 - (d.armedAt - s.tick) / def.trap.arm, "#e0b040");
  } else if (d.hp < d.maxHp) {
    hpBar(ctx, x, y + 6, 54, d.hp / d.maxHp, d.hp / d.maxHp > 0.4 ? "#6ad04a" : "#e0503a");
  }
  // Barracks level: one gold pip per level above the first.
  for (let i = 1; i < (def.level ?? 1); i += 1) {
    ctx.fillStyle = "#ffd65a";
    ctx.strokeStyle = "rgba(60,40,5,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - 34 + (i - 1) * 9, y + 16, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (s.protectIds.includes(d.id)) {
    ctx.fillStyle = "#ffd65a";
    ctx.strokeStyle = "rgba(60,40,5,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 128);
    ctx.lineTo(x + 9, y - 116);
    ctx.lineTo(x, y - 104);
    ctx.lineTo(x - 9, y - 116);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
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
  let x = tileX(lerpX);
  let y = feetY(e.lane);
  if (e.state === "glide") {
    const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
    y = feetY(e.from) + (feetY(e.to) - feetY(e.from)) * t;
  }
  if (e.kind === "banner") {
    drawBanner(ctx, view, s.cfg.bannerColor, x, y, e.hp / e.maxHp);
    return;
  }
  if (def.grave) {
    drawGrave(ctx, x, y, e);
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
  if (!frozen) walkAntic(view, s, e, now, dt);
  const clip = frozen ? null : activeClip(view, key, now);
  let group = clip?.group ?? G.stand;
  let frame = clip?.frame ?? 0;
  let lift = 0;
  let fade = 1;
  if (!clip) {
    if (e.state === "walk" || e.state === "vault" || e.state === "flung" || e.state === "phase" || (e.state === "glide" && def.zigzag)) {
      group = pickGroup(atlas, G.move, G.stand);
      const speedPx = (def.vault && !e.vaulted ? def.vault.fastSpeed : def.speed) * GW_TPS * BOARD.TILE;
      const chilled = e.chillUntil > s.tick || e.slowUntil > s.tick;
      const stride = speedPx > 0 ? (42 / speedPx) * 1000 : 800;
      const frames = Math.max(1, groupFrames(atlas, group));
      const frameMs = e.state === "walk" ? Math.max(55, Math.min(260, stride / frames)) * (chilled ? 2 : 1) : 55;
      frame = frameOf(view, key, frames, frameMs, dt, frozen);
      // Stepping back or moonwalking: the stride runs backwards.
      if (e.state === "walk" && motionPose(view.antics, e.id, e.dir, true, now).backwards) frame = frames - 1 - frame;
    } else if (e.state === "raise") {
      // An Arch-vile's hands raised over the corpse.
      group = pickGroup(atlas, G.cast, G.attack, G.shoot);
      frame = frameOf(view, key, Math.max(1, groupFrames(atlas, group)), 90, dt, frozen);
    } else if (e.state === "plant") {
      // A Ladder Hobgoblin hammering its ladder into the ground.
      group = pickGroup(atlas, G.attack, G.cast, G.stand);
      frame = frameOf(view, key, Math.max(1, groupFrames(atlas, group)), 70, dt, frozen);
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
    // Order & Chaos: climbing a ladder over a troop — up the rungs, over the top, down the far side.
    const climbing = e.state === "vault" && e.stateUntil - e.stateAt === CLIMB_TICKS && s.defenders.some((d) => d.laddered && d.lane === e.lane && d.col + 0.5 < e.from && d.col + 0.5 > e.to);
    if (climbing) lift = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 135;
    // An Imp's blink: gone in a flash, back a moment later past the defender.
    else if (e.state === "vault" && def.blink) {
      lift = 0;
      fade = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;
    }
  }
  // A zig-zagger's diagonal leap arcs over the lane line.
  if (e.state === "glide" && def.zigzag && !def.flying) {
    const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
    lift = 4 * t * (1 - t) * 60;
  }
  // Order & Chaos: flyers ride high (diving at a defender for a moment); a Snatcher swoops down and hovers over her prey.
  if (def.flying) {
    lift = 70 + 6 * Math.sin(now / 300 + e.id);
    const diveAt = view.dive.get(e.id);
    if (diveAt !== undefined) {
      const t = (now - diveAt) / 600;
      if (t >= 1) view.dive.delete(e.id);
      else if (t > 0) lift *= 1 - 0.75 * Math.sin(Math.PI * t);
    }
  }
  if (e.state === "snatch") {
    const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / 12));
    lift = 55 + (1 - t) * (1 - t) * 260 + 5 * Math.sin(now / 200 + e.id);
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
  // Its antic of the moment (./antics.ts), a shiver when chilled, the Revel troupe's routine.
  const pose = frozen ? null : motionPose(view.antics, e.id, e.dir, e.state === "walk", now);
  let sx = pose?.sx ?? 1;
  let sy = pose?.sy ?? 1;
  if (pose) {
    x += pose.dx;
    lift += pose.dy;
  }
  if (e.chillUntil > s.tick && freeToAct(s, e)) x += Math.floor(now / 45 + e.id) % 2 === 0 ? 0.9 : -0.9;
  if (!frozen && troupeDancing(s, e)) {
    // Hop, spin, hop, sway — on a 400 ms beat every dancer shares.
    const bt = (now % 400) / 400;
    const move = Math.floor(now / 400) % 4;
    if (move === 1) sx *= Math.cos(bt * Math.PI * 2);
    else if (move === 3) x += 9 * Math.sin(bt * Math.PI * 2);
    else lift += 12 * Math.sin(Math.PI * bt);
    if (Math.random() < dt / 700) rising(view, "note", x, y - 90, 1, ["#ff9ae3", "#ffe07a", "#9ad8ff"], now);
  }
  // A foe carrying a Surge orb glows (not while it is unseen).
  const unseen = hidden(e);
  if (e.carrier && !unseen) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, "rgba(255,226,120,0.5)", x, y - lift - 50 * scale, 62 + 8 * Math.sin(now / 150 + e.id));
    ctx.restore();
  }
  if (lift === 0 && rise === 0 && !unseen) drawContactShadow(ctx, x, y, 32 * (scale / SPRITE_SCALE));
  ctx.save();
  const phasing = e.state === "phase";
  ctx.globalAlpha = fade * (def.evade ? 0.5 + 0.08 * Math.sin(now / 150 + e.id) : 1) * (unseen ? 0.22 + 0.06 * Math.sin(now / 120 + e.id) : 1)
    * (phasing ? 0.36 + 0.08 * Math.sin(now / 90 + e.id) : 1);
  let filter = statusFilter(s.tick, e, now - flashAt < 80);
  if (e.enraged) filter = `${filter === "none" ? "" : `${filter} `}sepia(0.35) saturate(2.3) hue-rotate(-25deg)`;
  // Order & Chaos: a charmed foe blushes pink; a phasing Phantom turns to pale mist.
  if (e.charmed) filter = `${filter === "none" ? "" : `${filter} `}sepia(0.45) hue-rotate(285deg) saturate(2.2) brightness(1.08)`;
  if (phasing) filter = `${filter === "none" ? "" : `${filter} `}brightness(1.4) hue-rotate(185deg) saturate(0.6)`;
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
  // Backup dancers (and their queen) sway to the beat; a Shambler on its last gasp crawls low.
  const sway = e.leader || def.troupe ? Math.sin(now / 170 + e.id) * 4 : 0;
  const crawl = def.lastGasp !== undefined && e.reborn ? { x: 1.12, y: 0.7 } : undefined;
  const face = e.dir < 0 ? -1 : 1;
  const flipped = (e.dir < 0) !== (pose?.turned === true);
  // Order & Chaos: a ladder slung over a Ladder Hobgoblin's back (behind the body).
  if (def.ladder && e.ladder && e.state !== "plant" && !unseen) {
    const bob = Math.sin(now / 140 + e.id) * 2;
    drawLadder(ctx, x - face * 44 * scale, y - lift - 28 * scale + bob, x + face * 26 * scale, y - lift - 112 * scale + bob, 14);
  }
  // A siege catapult's goblin crew shoves it along (and works the winch when it throws).
  let rumble = 0;
  if (def.siege) {
    const crew = atlasFor("goblin");
    const moving = e.state === "walk" && !frozen;
    rumble = moving ? Math.abs(Math.sin(now / 85 + e.id)) * 2.5 : 0;
    if (crew) {
      const cg = clip ? pickGroup(crew, G.attack, G.stand) : moving ? pickGroup(crew, G.move, G.stand) : G.stand;
      const cf = Math.max(1, groupFrames(crew, cg));
      const cFrame = clip ? Math.min(cf - 1, clip.frame) : frozen ? 0 : Math.floor(now / (moving ? 80 : 150) + e.id) % cf;
      drawAtlas(ctx, crew, cg, cFrame, x - face * 64 * scale, y - lift, scale * 0.78, e.dir < 0);
    }
    if (moving && Math.random() < dt / 90) burst(view.particles, now, "dust", x - face * 30, y - 4, 1, { speed: 0.04, life: 600, size: 8, colors: ["rgba(140,120,90,0.7)"] });
  }
  // A Prism Elemental spinning: it whirls (mirroring as it turns) in a prismatic halo.
  const spinning = def.prism !== undefined && e.spinUntil > s.tick && !frozen;
  if (spinning) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, PRISM_GLOWS[Math.floor(now / 110) % PRISM_GLOWS.length]!, x, y - lift - 60 * scale, 70 + 8 * Math.sin(now / 70));
    ctx.restore();
    if (Math.random() < dt / 45) burst(view.particles, now, "glint", x + (Math.random() - 0.5) * 60, y - 40 - Math.random() * 80, 1, { speed: 0.12, life: 380, size: 2.4, colors: ["#ffd8f6", "#c8f4ff", "#fff4b0"] });
  }
  const spin = spinning ? { x: Math.cos(now / 55 + e.id), y: 1 } : undefined;
  const body = crawl ?? spin;
  const stretch = body ? { x: body.x * sx, y: body.y * sy } : sx !== 1 || sy !== 1 ? { x: sx, y: sy } : undefined;
  drawAtlas(ctx, atlas, group, frame, x + sway, y - lift + rise - rumble, scale, flipped, stretch);
  ctx.restore();
  if (!unseen && rise === 0 && !phasing && !def.boss && !def.structure && !def.siege) {
    const head = y - lift - 100 * scale;
    // Stunned (a stone to the head, a lightning jolt): stars circle it.
    if (e.stunUntil > s.tick && e.freezeUntil <= s.tick) drawDizzy(ctx, x, head - 8, now, e.id);
    // Fuming, or in a rage: the throbbing vein (on and off while the rage lasts), and steam.
    if (pose?.angry || (e.enraged && !frozen && Math.floor(now / 700 + e.id) % 3 === 0)) drawAngerMark(ctx, x - face * 16 * scale, head, now, e.id);
    if (e.enraged && !frozen && Math.random() < dt / 450) {
      burst(view.particles, now, "smoke", x - face * 10, head, 1, { speed: 0.03, up: 0.07, life: 600, size: 5, colors: ["rgba(255,120,90,0.6)", "rgba(230,230,230,0.5)"] });
    }
    // Chilled: its breath fogs.
    if (!frozen && e.chillUntil > s.tick && Math.random() < dt / 1100) {
      burst(view.particles, now, "smoke", x + face * 22 * scale, head + 14, 1, { speed: 0.02, up: 0.03, life: 700, size: 4, colors: ["rgba(225,240,255,0.6)"] });
    }
  }
  // Planting: the ladder swings up off its back and comes to lean on the wall.
  if (def.ladder && e.state === "plant" && !unseen) {
    const wall = s.defenders.find((d) => d.id === e.target);
    if (wall) {
      const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
      const ease = t * t * (3 - 2 * t);
      const wx = tileX(wall.col + 0.5);
      const top = (DEFENDERS[wall.kind]!.tall ? 150 : 118) * (DEFENDERS[wall.kind]!.scale ?? 1);
      const fx0 = x - face * 44 * scale;
      const fy0 = y - 28 * scale;
      const tx0 = x + face * 26 * scale;
      const ty0 = y - 112 * scale;
      drawLadder(ctx, fx0 + (wx + 58 - fx0) * ease, fy0 + (y + 2 - fy0) * ease, tx0 + (wx + 14 - tx0) * ease, ty0 + (y - top - ty0) * ease, 15 + 2 * ease);
    }
  }
  // Order & Chaos Jotunn: the Imp it will hurl rides on its shoulder until then.
  if (def.fling && def.faction === "chaos" && !e.flung && !unseen) {
    const rider = atlasFor(ENEMIES[def.flingKind ?? "skeleton"]?.sprite ?? "");
    if (rider) {
      const rf = Math.max(1, groupFrames(rider, G.stand));
      const hop = Math.abs(Math.sin(now / 240 + e.id)) * 3;
      drawAtlas(ctx, rider, G.stand, Math.floor(now / 150 + e.id) % rf, x - face * 20 * scale, y - lift - 84 * scale - hop, scale * 0.42, e.dir < 0);
    }
  }
  if (e.state === "raise") drawRaiseBeam(ctx, s, e, x, y, now, alpha);
  if (phasing && Math.random() < dt / 60) {
    spawnParticles(view.particles, now, 1, () => ({
      kind: "soul", x: x + (Math.random() - 0.5) * 40, y: y - 40 - Math.random() * 50, vx: 0.04, vy: -0.03, life: 700, size: 7, color: "rgba(170,210,255,0.5)"
    }));
  }
  // A rolling Juggernaut throws up dust behind it.
  if (def.roller && !e.stopped && e.state === "walk" && Math.random() < dt / 70) {
    burst(view.particles, now, "dust", x + 30 * -e.dir, y - 4, 1, { speed: 0.05, life: 700, size: 9, colors: ["rgba(130,110,80,0.7)"] });
  }
  if (e.charmed && !unseen) {
    ctx.save();
    ctx.fillStyle = "#ff5f9e";
    ctx.strokeStyle = "rgba(60,10,30,0.8)";
    ctx.lineWidth = 3;
    ctx.font = "bold 22px Georgia, serif";
    ctx.textAlign = "center";
    const hy = y - lift - 128 * scale + 3 * Math.sin(now / 200 + e.id);
    ctx.strokeText("♥", x, hy);
    ctx.fillText("♥", x, hy);
    ctx.restore();
  }
  // A thief's sack: the gold it carries.
  if (e.loot > 0 && !unseen) {
    ctx.save();
    ctx.fillStyle = "#ffd65a";
    ctx.strokeStyle = "rgba(60,40,5,0.9)";
    ctx.lineWidth = 3;
    ctx.font = "bold 14px Georgia, serif";
    ctx.textAlign = "center";
    const ty = y - lift - 140 * scale;
    ctx.strokeText(`${e.loot} g`, x, ty);
    ctx.fillText(`${e.loot} g`, x, ty);
    ctx.restore();
  }
  if (kegLeft >= 0 && !unseen) {
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
  if (e.carrier && !unseen) drawOrb(ctx, x, y - lift - 128 * scale, 24, now, e.id, 1);
  const guard = e.maxArmor > 0 ? e.armor / e.maxArmor : e.maxShield > 0 ? e.shield / e.maxShield : 0;
  if (!def.boss && rise === 0 && (e.hp < e.maxHp || e.shield < e.maxShield || e.armor < e.maxArmor)) {
    hpBar(ctx, x, y - lift - 112 * scale, 46, e.hp / e.maxHp, "#e0503a", guard);
  }
}

/** An Arch-vile's raising: a rune circle on the corpse and a beam of hellfire from its hands, brightening as the spell nears its end. */
function drawRaiseBeam(ctx: CanvasRenderingContext2D, s: GarrisonState, e: Enemy, x: number, y: number, now: number, alpha: number): void {
  const t = Math.max(0, Math.min(1, (s.tick + alpha - e.stateAt) / Math.max(1, e.stateUntil - e.stateAt)));
  const cx = tileX(e.from);
  const cy = feetY(e.to);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(150,255,120,${0.35 + 0.4 * t})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 2, 26 + 22 * t, 8 + 6 * t, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(190,255,160,0.8)";
  for (let i = 0; i < 6; i += 1) {
    const a = now / 400 + (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (30 + 20 * t), cy - 2 + Math.sin(a) * (9 + 6 * t), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const hx = x + (e.dir < 0 ? -14 : 14);
  const hy = y - 95;
  ctx.strokeStyle = `rgba(255,170,80,${0.4 + 0.3 * Math.sin(now / 60)})`;
  ctx.lineWidth = 4 + 3 * t;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.quadraticCurveTo((hx + cx) / 2, Math.min(hy, cy) - 60, cx, cy - 20);
  ctx.stroke();
  drawGlow(ctx, "rgba(255,160,70,0.7)", hx, hy, 22 + 6 * Math.sin(now / 80));
  drawGlow(ctx, "rgba(150,255,120,0.5)", cx, cy - 25, 30 + 30 * t);
  ctx.restore();
}

/** A Surge orb: the painted icon (a glowing sphere until it has loaded). */
function drawOrb(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, now: number, seed: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, "rgba(255,236,170,0.6)", x, y, size * (1.1 + 0.15 * Math.sin(now / 180 + seed)));
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  const img = image(SURGE_SRC);
  if (ready(img)) {
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  } else {
    const g = ctx.createRadialGradient(x - size * 0.15, y - size * 0.15, 1, x, y, size / 2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, "#ffe58a");
    g.addColorStop(1, "rgba(160,90,220,0.9)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A grave on the lawn: the tombstone art (a stone slab until it has loaded), with its health. */
function drawGrave(ctx: CanvasRenderingContext2D, x: number, y: number, e: Enemy): void {
  const img = image(GRAVE_SRC);
  if (ready(img)) {
    const w = 84;
    const h = (img.naturalHeight / img.naturalWidth) * w;
    ctx.drawImage(img, x - w / 2, y - h + 10, w, h);
  } else {
    ctx.fillStyle = "#6f6a62";
    ctx.strokeStyle = "#3a3630";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 24, y);
    ctx.lineTo(x - 24, y - 56);
    ctx.arc(x, y - 56, 24, Math.PI, 0);
    ctx.lineTo(x + 24, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4a3624";
    ctx.beginPath();
    ctx.ellipse(x, y, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.hp < e.maxHp) hpBar(ctx, x, y + 10, 50, e.hp / e.maxHp, "#b0a898");
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
    } else if (fx.t === "beam") {
      if (elapsed > 520) continue;
      const a = elapsed < 80 ? elapsed / 80 : 1 - (elapsed - 80) / 440;
      const h = 30 * (0.6 + 0.4 * a);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(0, fx.y - h, 0, fx.y + h);
      g.addColorStop(0, `rgba(${fx.rgb},0)`);
      g.addColorStop(0.5, `rgba(${fx.rgb},${(0.9 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(${fx.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(fx.x0, fx.y - h, fx.x1 - fx.x0, h * 2);
      ctx.fillStyle = `rgba(255,255,255,${(0.85 * a).toFixed(3)})`;
      ctx.fillRect(fx.x0, fx.y - 3, fx.x1 - fx.x0, 6);
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
    if (p.kind === "surge") drawOrb(ctx, x, y, 52, now, p.id, blink ? 0.4 : 1);
    else drawCoin(ctx, x, y, coinSize(p.value), now, p.id * 0.7, blink ? 0.4 : 1);
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
    // Order & Chaos: the Ascended form the unit may take.
    if (kind && cfg.oc?.ultimates?.includes(baseKind(kind))) {
      const form = ascendedKind(kind);
      if (form) addDefender(form);
    }
  }
  for (const unit of cfg.preset ?? []) addDefender(unit.kind);
  // Order & Chaos packets carry their level (`oc-longbow@3`); recipes name the base unit.
  const plainCards = cards.map(baseKind);
  for (const recipe of FUSIONS) {
    if (plainCards.some((id) => recipe.a.includes(id)) && plainCards.some((id) => recipe.b.includes(id))) addDefender(recipe.result);
  }
  if (cfg.oc?.ultimates?.length) image(VALOR_SRC);
  if (cfg.oc?.ultimates?.length) image(ASCEND_BURST.src);
  const attackers = new Set([...cfg.enemies, ...cfg.atkCards]);
  if (cfg.boss) ["dracolich", "bone-dragon", "walking-dead", "skeleton", "zombie", "vampire"].forEach((kind) => attackers.add(kind));
  if (cfg.herald) attackers.add(cfg.herald);
  if (cfg.oc) {
    for (const kind of cfg.oc.bossSummons ?? []) attackers.add(kind);
    if (cfg.oc.bossDragon) attackers.add(cfg.oc.bossDragon);
    for (const kind of cfg.enemies) {
      const grave = ENEMIES[kind]?.grave;
      if (grave) attackers.add(grave.raise);
    }
    if (cfg.oc.graves?.length) attackers.add("oc-shambler");
    image(SURGE_SRC);
    image(GRAVE_SRC);
  }
  if (attackers.size <= 30) {
    for (const kind of attackers) {
      const def = ENEMIES[kind];
      if (!def) continue;
      if (def.sprite) slugs.add(def.sprite);
      if (def.ranged) shots.add(def.ranged.projectile);
      if (def.fling) slugs.add(ENEMIES[def.flingKind ?? "skeleton"]?.sprite ?? "skeleton");
      if (def.stripped) slugs.add(def.stripped);
      if (def.summon && ENEMIES[def.summon.kind]) slugs.add(ENEMIES[def.summon.kind]!.sprite);
      if (def.troupe && ENEMIES[def.troupe.kind]) slugs.add(ENEMIES[def.troupe.kind]!.sprite);
      // Order & Chaos: a catapult's goblin crew; the sheep a Sorceress hexes troops into.
      if (def.siege) slugs.add("goblin");
      if (def.hex) image(SHEEP_SRC);
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
