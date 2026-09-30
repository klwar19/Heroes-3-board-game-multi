/**
 * Foe antics: the little bits of character a walking foe shows now and then, the
 * way PvZ zombies never just slide across the lawn. All of it answers something
 * real in the sim: a blow (it reels, sometimes wincing a second time a beat
 * later), fire (a hot-foot hop), sustained fire on a shielded or helmeted foe (it
 * raises its guard, sometimes twice), losing that shield or helm or flying into a
 * rage (it fumes), a troop just ahead (it swings at the air before it gets there),
 * the Revel troupe's moonwalk, a nervous step back. Kept occasional: every foe
 * gets a calm spell after each antic.
 *
 * Drawing only: nothing here is read by the sim, so it may use Math.random.
 */

export type MotionKind = "reel" | "shuffle" | "fume" | "hotfoot" | "moonwalk";

export type Motion = { kind: MotionKind; start: number; dur: number };

/** A clip queued for a moment later (a second wince, the guard raised again). */
export type QueuedClip = { id: number; at: number; clip: "hit" | "defend" };

export type Antics = {
  /** Body motion playing on a foe, by id. */
  motion: Map<number, Motion>;
  /** No new antic on this foe before this time. */
  calm: Map<number, number>;
  queued: QueuedClip[];
};

export function createAntics(): Antics {
  return { motion: new Map(), calm: new Map(), queued: [] };
}

const DURATION: Record<MotionKind, number> = { reel: 420, shuffle: 1150, fume: 1100, hotfoot: 720, moonwalk: 1500 };

export function startMotion(antics: Antics, id: number, kind: MotionKind, now: number): void {
  antics.motion.set(id, { kind, start: now, dur: DURATION[kind] });
}

/** Is this foe calm (no antic for a while)? */
export function restless(antics: Antics, id: number, now: number): boolean {
  return now >= (antics.calm.get(id) ?? 0);
}

/** After an antic the foe keeps to itself for `min`..`min + spread` ms. */
export function calmDown(antics: Antics, id: number, now: number, min = 2600, spread = 3000): void {
  antics.calm.set(id, now + min + Math.random() * spread);
}

export type Pose = {
  /** Offset from where the sim has it (px; + is to the right). */
  dx: number;
  /** Lift (px; + is up). */
  dy: number;
  /** Squash and stretch about the feet. */
  sx: number;
  sy: number;
  /** Faces the other way (the moonwalk). */
  turned: boolean;
  /** Walk frames run backwards (stepping back, moonwalking). */
  backwards: boolean;
  /** Draw the anger mark over its head. */
  angry: boolean;
};

const REST: Pose = { dx: 0, dy: 0, sx: 1, sy: 1, turned: false, backwards: false, angry: false };

/**
 * The body motion playing on a foe right now. `face` is the way it walks
 * (-1 = towards the keep); `walking` gates the steps that only make sense on the move.
 */
export function motionPose(antics: Antics, id: number, face: 1 | -1, walking: boolean, now: number): Pose {
  const m = antics.motion.get(id);
  if (!m) return REST;
  const t = (now - m.start) / m.dur;
  if (t >= 1) {
    antics.motion.delete(id);
    return REST;
  }
  if (t < 0) return REST;
  const back = -face;
  switch (m.kind) {
    case "reel": {
      // Knocked half a step back, then it leans in again.
      const k = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
      return { ...REST, dx: back * 13 * k, sx: 1 + 0.05 * k, sy: 1 - 0.06 * k };
    }
    case "shuffle": {
      if (!walking) return REST;
      // A nervous step back… and on again.
      const k = Math.sin(Math.PI * t);
      return { ...REST, dx: back * 18 * k, backwards: t < 0.5 };
    }
    case "fume": {
      // Shaking with rage: a fast tremble and a swell.
      const k = 1 - t;
      return { ...REST, dx: Math.sin(now / 21) * 3 * k, sx: 1 + 0.04 * k, sy: 1 + 0.05 * k * Math.abs(Math.sin(now / 90)), angry: true };
    }
    case "hotfoot": {
      // Two hops off the burning ground.
      const hop = Math.abs(Math.sin(t * Math.PI * 2));
      return { ...REST, dy: 16 * hop * (1 - t * 0.4), sx: 1 - 0.04 * hop, sy: 1 + 0.06 * hop };
    }
    case "moonwalk": {
      if (!walking) return REST;
      // Turned round, gliding on the way it was going with its steps running backwards.
      return { ...REST, turned: true, backwards: true, dy: 2 * Math.abs(Math.sin(now / 110)) };
    }
  }
}

/** Forget foes that are gone. */
export function pruneAntics(antics: Antics, live: ReadonlySet<number>): void {
  for (const id of antics.motion.keys()) if (!live.has(id)) antics.motion.delete(id);
  for (const id of antics.calm.keys()) if (!live.has(id)) antics.calm.delete(id);
  antics.queued = antics.queued.filter((q) => live.has(q.id));
}

/** The anger mark (the four red ticks of a throbbing vein) over a fuming head. */
export function drawAngerMark(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number): void {
  const pulse = 1 + 0.18 * Math.sin(now / 70 + seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.lineCap = "round";
  for (const [color, width] of [["rgba(60,0,0,0.85)", 6], ["#ff3b2f", 3.2]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let i = 0; i < 4; i += 1) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(3, -7);
      ctx.quadraticCurveTo(6, -3, 9, -6);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Dizzy stars circling a stunned head. */
export function drawDizzy(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number): void {
  ctx.save();
  for (let i = 0; i < 3; i += 1) {
    const a = now / 260 + seed + (i * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * 20;
    const sy = y + Math.sin(a) * 6;
    // The far side of the ring passes behind the head: dimmer and smaller.
    const near = Math.sin(a) > 0;
    ctx.globalAlpha = near ? 1 : 0.55;
    star(ctx, sx, sy, near ? 6 : 4.5);
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffe45a";
  ctx.strokeStyle = "rgba(90,60,0,0.9)";
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
}
