"use client";

/* eslint-disable @next/next/no-img-element -- battlefield figures, not content images */

// ---------------------------------------------------------------------------
// Hex Battlefield creature figures (PC-style).
//
// Figures live on their OWN layer keyed by unit id — never inside a hex cell —
// so a unit that moves keeps the same figure (and its running animation) while
// the cells under it re-render. A figure whose unit just changed hex holds on
// the hex it left until its move cue plays, then walks the real route hex by
// hex; it never jumps to the destination first.
//
// Sprites render at their atlas's native pixel size and are scaled by the GPU
// (`--hex-scale`, set from the board's width), so stepping a frame is a cheap
// background-position change. Every figure animates off ONE shared
// requestAnimationFrame clock that only runs while something is moving.
// ---------------------------------------------------------------------------

import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, User, Users } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { getBattlefieldCoordinates, getBattlefieldDistance, isHexPosition } from "@/engine/battlefield";
import { unitAtCell, unitCells, unitIsDoubleWide, unitTailOffset } from "@/engine/hex-footprint";
import { getPermanentCardIds, isWarMachineCard } from "@/engine/permanents";
import type { CombatState, CombatUnitState, GameState, PlayerId } from "@/engine";
import { cardLibrary } from "@/data/cards/library";
import {
  HEX_ACTION_FRAME_MS,
  HEX_CAST_RELEASE_MS,
  HEX_DEATH_FRAME_MS,
  HEX_HIT_FRAME_MS,
  HEX_IDLE_FRAME_MS,
  HEX_RANGED_RELEASE_MS,
  HEX_TURN_FRAME_MS,
  SPRITE_GROUP,
  creatureSpriteForSlug,
  hexAnimationTempo,
  hexMovePlan,
  spriteGroupFrames,
  spriteTeleports,
  unitCreatureSprite,
  type CreatureSpriteAtlas
} from "@/data/battle-hex/creature-sprites";
import {
  HEX_BOARD_HEIGHT,
  HEX_BOARD_WIDTH,
  HEX_SPRITE_SCALE,
  HEX_UNIT_CUE_EVENT,
  HEX_UNIT_PENDING_MOVE_EVENT,
  hexBoardMetrics,
  hexCellCenter,
  parseCellAnchor,
  type HexUnitCueDetail
} from "./hex-battlefield";

const { hexWidth: HEX_WIDTH, hexRadius: HEX_RADIUS, rowStep: HEX_ROW_STEP, gridTop: GRID_TOP } = hexBoardMetrics;

/** Creature art scale on this board (see HEX_SPRITE_SCALE). */
const SPRITE_SCALE = HEX_SPRITE_SCALE;
/** Feet stand a little below the hex centre, as in the PC game. */
const FOOT_DROP = HEX_RADIUS * 0.38;

/** ATTACK_IMPACT_MS / ATTACK_ANIM_MS mirrored from fx.tsx (fx.tsx imports this module chain). */
const IMPACT_MS = 500;
const STRIKE_MS = 900;
/** A cast's release beat (the spell leaves the caster; shared with fx.tsx) and its whole clip. */
const CAST_RELEASE_MS = HEX_CAST_RELEASE_MS;
const CAST_MS = 900;
/** At most this share of an attack's wind-up is spent turning toward the target. */
const TURN_SHARE_OF_BEAT = 0.45;
/** How long a moved unit waits on its old hex for its move cue before snapping. */
const MOVE_HOLD_GRACE_MS = 400;

type Point = { x: number; y: number };

// ---------------------------------------------------------------------------
// One shared animation clock
// ---------------------------------------------------------------------------

type Tick = (now: number) => boolean;
const ticks = new Set<Tick>();
let clockId = 0;

function runClock(now: number) {
  for (const tick of Array.from(ticks)) {
    let keep = false;
    try {
      keep = tick(now);
    } catch {
      keep = false;
    }
    if (!keep) ticks.delete(tick);
  }
  clockId = ticks.size > 0 ? requestAnimationFrame(runClock) : 0;
}

/** Runs `tick` every frame until it returns false or the returned stop is called (shared with hex-heroes.tsx). */
export function onClock(tick: Tick): () => void {
  ticks.add(tick);
  if (!clockId) clockId = requestAnimationFrame(runClock);
  return () => {
    ticks.delete(tick);
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function unitIsAttackerSide(combat: CombatState, unit: CombatUnitState): boolean {
  return unit.controllerId === combat.attackerPlayerId;
}

/**
 * Where a figure's feet stand (board units): its hex, or — for a two-hex
 * creature — the middle of its head and tail hexes (the tail is behind it).
 */
function footPoint(combat: CombatState, unit: CombatUnitState, head: number, flipped: boolean): Point {
  const a = hexCellCenter(head, flipped);
  const tailStep = unitTailOffset(combat, unit);
  const x = tailStep === 0 ? a.x : a.x + (HEX_WIDTH / 2) * tailStep * (flipped ? -1 : 1);
  return { x, y: a.y + FOOT_DROP };
}

/** The foot point of a single hex (no two-hex shift) — where a target stands. */
function cellFootPoint(position: number, flipped: boolean): Point {
  const center = hexCellCenter(position, flipped);
  return { x: center.x, y: center.y + FOOT_DROP };
}

/** A creature faces the enemy side by default (the attacker faces right unless mirrored). */
function facesRightByDefault(combat: CombatState, unit: CombatUnitState, flipped: boolean): boolean {
  return unitIsAttackerSide(combat, unit) !== flipped;
}

const px = (value: number) => `calc(var(--hex-scale, 1) * ${value.toFixed(2)}px)`;

function pointStyle(point: Point, zIndex: number): CSSProperties {
  return {
    left: `${(point.x / HEX_BOARD_WIDTH) * 100}%`,
    top: `${(point.y / HEX_BOARD_HEIGHT) * 100}%`,
    zIndex
  };
}

// ---------------------------------------------------------------------------
// Sprite element + animation controller
// ---------------------------------------------------------------------------

function spriteStyle(atlas: CreatureSpriteAtlas): CSSProperties {
  return {
    width: `${atlas.frameWidth}px`,
    height: `${atlas.frameHeight}px`,
    marginLeft: `${-atlas.anchorX}px`,
    marginTop: `${-atlas.anchorY}px`,
    backgroundImage: `url("${assetUrl(atlas.image)}")`,
    transformOrigin: `${atlas.anchorX}px ${atlas.anchorY}px`,
    transform: `scale(calc(var(--hex-scale, 1) * ${SPRITE_SCALE} * var(--face, 1)), calc(var(--hex-scale, 1) * ${SPRITE_SCALE}))`
  };
}

type Controller = {
  handle: (event: Event) => void;
  pending: (event: Event) => void;
  /** The unit changed hex: hold on the old one until its move cue plays. */
  holdAt: (from: number) => void;
  dispose: () => void;
};

type ControllerOptions = {
  figure: HTMLElement;
  sprite: HTMLElement | null;
  atlas: CreatureSpriteAtlas | null;
  unitType: CombatUnitState["type"];
  facesRight: () => boolean;
  /** Board point of the figure's resting spot (its current state position). */
  restPoint: () => Point | null;
  /** Board point for a hex this figure could stand on (moves, holds). */
  pointFor: (position: number) => Point;
  /** The plain foot point of one hex (a target, never shifted by this figure's tail). */
  cellPoint: (position: number) => Point;
  /** The hexes this figure covers now (head, and a two-hex creature's tail). */
  ownCells: () => number[];
  /** Every hex of the unit standing on `position` (just `position` when empty). */
  targetCells: (position: number) => number[];
  /** This figure's move timing (the same plan the cue timeline used). */
  movePlan: (route: number[], flying: boolean, teleport: boolean, turns: number) => ReturnType<typeof hexMovePlan>;
  /** Live animation tempo (Haste / Slow): every clip's frames run this much faster. */
  tempo: () => number;
  idle: boolean;
};

function createController(options: ControllerOptions): Controller {
  const { figure, sprite, atlas } = options;
  let facing = options.facesRight();
  let offset: Point = { x: 0, y: 0 };
  let stopClip: (() => void) | null = null;
  let stopMove: (() => void) | null = null;
  let holdTimer = 0;
  let idleTimer = 0;
  let busy = 0;
  let disposed = false;
  /** Bumped by every new cue, so a turn-back never fights a newer cue. */
  let generation = 0;
  // Last values written to the DOM: a frame or position that did not change
  // is never written again (no per-frame style invalidation while holding).
  let shownFrame = "";
  // Read from the DOM: a rebuilt controller must not assume the figure is home.
  let shownTranslate = figure.style.translate;
  let shownZ = "";

  const setFacing = (right: boolean) => {
    facing = right;
    if (sprite) sprite.style.setProperty("--face", right ? "1" : "-1");
  };

  const setOffset = (point: Point) => {
    offset = point;
    const translate = point.x === 0 && point.y === 0 ? "" : `${px(point.x)} ${px(point.y)}`;
    if (translate !== shownTranslate) {
      shownTranslate = translate;
      figure.style.translate = translate;
    }
  };

  const setZ = (z: string) => {
    if (z !== shownZ) {
      shownZ = z;
      figure.style.zIndex = z;
    }
  };

  const showFrame = (group: number, index: number) => {
    if (!sprite || !atlas) return;
    const info = atlas.groups[String(group)] ?? atlas.groups[String(SPRITE_GROUP.standing)];
    if (!info) return;
    const column = Math.min(index, info.frames - 1);
    const position = `${-column * atlas.frameWidth}px ${-info.row * atlas.frameHeight}px`;
    if (position !== shownFrame) {
      shownFrame = position;
      sprite.style.backgroundPosition = position;
    }
  };

  /** A frame duration at this unit's live tempo. */
  const paced = (ms: number) => ms / options.tempo();

  const frames = (group: number) => (atlas ? spriteGroupFrames(atlas, group) : 0);

  /** Plays one group once (durations per frame); resolves after the last frame. */
  const playClip = (group: number, durations: number[], hold = false): Promise<void> =>
    new Promise((resolve) => {
      stopClip?.();
      if (!atlas || durations.length === 0) {
        resolve();
        return;
      }
      const total = durations.reduce((sum, ms) => sum + ms, 0);
      let start = -1;
      const stop = onClock((now) => {
        if (disposed) {
          resolve();
          return false;
        }
        if (start < 0) start = now;
        const elapsed = now - start;
        if (elapsed >= total) {
          if (hold) showFrame(group, durations.length - 1);
          else showFrame(SPRITE_GROUP.standing, 0);
          resolve();
          return false;
        }
        let acc = 0;
        let index = 0;
        while (index < durations.length - 1 && acc + durations[index] <= elapsed) {
          acc += durations[index];
          index += 1;
        }
        showFrame(group, index);
        return true;
      });
      stopClip = () => {
        stop();
        resolve();
      };
    });

  const even = (group: number, ms: number) => Array.from({ length: frames(group) }, () => ms);

  const turnFrames = () => (atlas ? frames(SPRITE_GROUP.turnLeft) + frames(SPRITE_GROUP.turnRight) : 0);

  /**
   * H3 turn-around: turn-left frames, flip, turn-right frames. A newer cue
   * (another figure clip) cuts it short with the flip already applied.
   */
  const turnTo = async (right: boolean, frameMs = paced(HEX_TURN_FRAME_MS)) => {
    if (facing === right) return;
    const gen = generation;
    if (atlas && frameMs > 0 && frames(SPRITE_GROUP.turnLeft) > 0 && frames(SPRITE_GROUP.turnRight) > 0) {
      await playClip(SPRITE_GROUP.turnLeft, even(SPRITE_GROUP.turnLeft, frameMs), true);
      setFacing(right);
      if (gen !== generation || disposed) return;
      await playClip(SPRITE_GROUP.turnRight, even(SPRITE_GROUP.turnRight, frameMs));
    } else {
      setFacing(right);
    }
  };

  /**
   * Turn toward a target inside an action's wind-up: the turn uses at most
   * TURN_SHARE_OF_BEAT of `beat`, and the time it took is returned so the blow /
   * release still lands on the shared beat (damage numbers and sounds wait on it).
   */
  const quickTurn = async (right: boolean, beat: number): Promise<number> => {
    if (facing === right) return 0;
    const count = turnFrames();
    if (count === 0 || beat <= 0) {
      setFacing(right);
      return 0;
    }
    const frameMs = Math.max(16, Math.min(paced(HEX_TURN_FRAME_MS), (beat * TURN_SHARE_OF_BEAT) / count));
    await turnTo(right, frameMs);
    return frameMs * count;
  };

  /** This figure's hex nearest a board point (a two-hex creature strikes with its near end). */
  const nearestOwnPoint = (target: Point): Point => {
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (const cell of options.ownCells()) {
      if (!isHexPosition(cell)) continue;
      const point = options.cellPoint(cell);
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    const rest = options.restPoint();
    return best ?? (rest ? { x: rest.x + offset.x, y: rest.y + offset.y } : target);
  };

  /**
   * The point to face / strike at for a target cell: a two-hex target is
   * struck at whichever of its hexes is nearer this figure.
   */
  const targetPoint = (target: number): Point => {
    const cells = options.targetCells(target).filter(isHexPosition);
    const rest = options.restPoint();
    const from = rest ? { x: rest.x + offset.x, y: rest.y + offset.y } : options.cellPoint(target);
    let best = options.cellPoint(target);
    let bestDistance = Infinity;
    for (const cell of cells) {
      const point = options.cellPoint(cell);
      const distance = Math.hypot(point.x - from.x, point.y - from.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    return best;
  };

  /** Up / straight / down reading of the line from `a` to `b` (H3's three attack rows). */
  const lineDirection = (a: Point, b: Point): "up" | "straight" | "down" => {
    const slope = (b.y - a.y) / Math.max(1, Math.abs(b.x - a.x));
    return slope < -0.5 ? "up" : slope > 0.5 ? "down" : "straight";
  };

  /**
   * Moves the figure through board points (offsets from its rest point), one
   * equal leg per step, looping the walk cycle once per hex.
   */
  const walk = (points: Point[], legMs: number): Promise<void> =>
    new Promise((resolve) => {
      stopMove?.();
      const rest = options.restPoint();
      if (!rest || points.length < 2) {
        resolve();
        return;
      }
      const legs = points.length - 1;
      const total = legs * legMs;
      const walkFrames = Math.max(1, frames(SPRITE_GROUP.move));
      let start = -1;
      const stop = onClock((now) => {
        if (disposed) {
          resolve();
          return false;
        }
        if (start < 0) start = now;
        const elapsed = Math.min(total, now - start);
        const legFloat = elapsed / legMs;
        const leg = Math.min(legs - 1, Math.floor(legFloat));
        const local = Math.min(1, legFloat - leg);
        const a = points[leg];
        const b = points[leg + 1];
        if (b.x !== a.x && (b.x > a.x) !== facing) setFacing(b.x > a.x);
        setOffset({ x: a.x + (b.x - a.x) * local - rest.x, y: a.y + (b.y - a.y) * local - rest.y });
        // Nearer rows stand in front while walking too.
        setZ(String(10 + Math.round((a.y + (b.y - a.y) * local - GRID_TOP) / HEX_ROW_STEP)));
        if (atlas) showFrame(SPRITE_GROUP.move, Math.floor((elapsed / legMs) * walkFrames) % walkFrames);
        if (elapsed >= total) {
          resolve();
          return false;
        }
        return true;
      });
      stopMove = () => {
        stop();
        resolve();
      };
    });

  const settle = () => {
    const rest = options.restPoint();
    setZ(rest ? String(10 + Math.round((rest.y - FOOT_DROP - GRID_TOP - HEX_RADIUS) / HEX_ROW_STEP)) : "");
    showFrame(SPRITE_GROUP.standing, 0);
  };

  const runMove = async (cue: Extract<HexUnitCueDetail["cue"], { kind: "move" }>) => {
    window.clearTimeout(holdTimer);
    const from = parseCellAnchor(cue.from);
    const rest = options.restPoint();
    if (from === null || !isHexPosition(from) || !rest) {
      setOffset({ x: 0, y: 0 });
      return;
    }
    const to = cue.toPosition !== undefined && isHexPosition(cue.toPosition) ? cue.toPosition : null;
    const destinationPoint = to !== null ? options.pointFor(to) : rest;
    const route = cue.path && cue.path.length > 0 ? [from, ...cue.path] : [from, ...(to !== null ? [to] : [])];
    const flying = options.unitType === "flying" && !(cue.path && cue.path.length > 0);
    const points = route.length > 1 ? route.map(options.pointFor) : [options.pointFor(from), destinationPoint];
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const teleport = Boolean(cue.teleport) || Boolean(atlas && spriteTeleports(atlas));
    if (cue.holdMs && cue.holdMs > 0) {
      setOffset({ x: startPoint.x - rest.x, y: startPoint.y - rest.y });
      await new Promise((resolve) => window.setTimeout(resolve, cue.holdMs));
      if (disposed) return;
    }
    // The move's own plan, stretched to fill the cue timeline's slot exactly
    // (the strike / damage / sounds after the move are timed to that slot).
    const plan = options.movePlan(route, flying, teleport, teleport ? 0 : walkTurnsOf(points));
    const fit = cue.durationMs && cue.durationMs > 0 && plan.totalMs > 0 ? cue.durationMs / plan.totalMs : 1;
    if (teleport) {
      const out = frames(SPRITE_GROUP.startMove);
      const into = frames(SPRITE_GROUP.stopMove);
      const duration = plan.totalMs * fit;
      setOffset({ x: startPoint.x - rest.x, y: startPoint.y - rest.y });
      if (atlas && out > 0 && into > 0) {
        const frameMs = duration / (out + into);
        await playClip(SPRITE_GROUP.startMove, Array.from({ length: out }, () => frameMs), true);
        setOffset({ x: endPoint.x - rest.x, y: endPoint.y - rest.y });
        await playClip(SPRITE_GROUP.stopMove, Array.from({ length: into }, () => frameMs));
      } else {
        await figure.animate([{ opacity: 1 }, { opacity: 0, offset: 0.45 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], {
          duration
        }).finished.catch(() => undefined);
        setOffset({ x: endPoint.x - rest.x, y: endPoint.y - rest.y });
      }
      settle();
      return;
    }
    const home = options.facesRight();
    setOffset({ x: startPoint.x - rest.x, y: startPoint.y - rest.y });
    const legMs = (plan.legsMs * fit) / Math.max(1, points.length - 1);
    const turnFrameMs = plan.turnFrameMs * fit;
    const edgeFrameMs = plan.edgeFrameMs * fit;
    // Walk the route in stretches of one heading: before each stretch the
    // figure plays the H3 turn-around (setting off backwards, or where the path
    // doubles back), so it never snaps round mid-stride. hexWalkTurns counts
    // exactly these turns for the cue timeline.
    let index = 0;
    let started = false;
    while (index < points.length - 1) {
      const right = points[index + 1].x === points[index].x ? facing : points[index + 1].x > points[index].x;
      let end = index + 1;
      while (end < points.length - 1 && (points[end + 1].x === points[end].x || (points[end + 1].x > points[end].x) === right)) {
        end += 1;
      }
      await turnTo(right, turnFrameMs);
      if (disposed) return;
      if (!started) {
        // H3 start-moving frames (take-off for flyers), held into the stride.
        started = true;
        if (frames(SPRITE_GROUP.startMove) > 0) {
          await playClip(SPRITE_GROUP.startMove, even(SPRITE_GROUP.startMove, edgeFrameMs), true);
        }
      }
      await walk(points.slice(index, end + 1), legMs);
      index = end;
    }
    setOffset({ x: endPoint.x - rest.x, y: endPoint.y - rest.y });
    // H3 stop-moving frames (landing for flyers) on arrival.
    if (frames(SPRITE_GROUP.stopMove) > 0) {
      await playClip(SPRITE_GROUP.stopMove, even(SPRITE_GROUP.stopMove, edgeFrameMs));
    }
    // Face the enemy again once arrived (the PC game turns back too).
    await turnTo(home, turnFrameMs);
    settle();
  };

  /**
   * The turn-arounds this walk plays (hexWalkTurns' rule on the figure's own
   * points): setting off away from its facing, each heading flip, and turning
   * back to face the enemy on arrival.
   */
  const walkTurnsOf = (points: Point[]): number => {
    const headings: boolean[] = [];
    for (let index = 1; index < points.length; index += 1) {
      const dx = points[index].x - points[index - 1].x;
      if (dx !== 0) headings.push(dx > 0);
    }
    if (headings.length === 0) return 0;
    const home = options.facesRight();
    let turns = headings[0] !== facing ? 1 : 0;
    for (let index = 1; index < headings.length; index += 1) {
      if (headings[index] !== headings[index - 1]) turns += 1;
    }
    return turns + (headings[headings.length - 1] !== home ? 1 : 0);
  };

  /**
   * An attack / shoot / cast group played at the unit's own pace (the PC
   * plays it at a fixed frame rate, sped up by Haste, slowed by Slow), timed so
   * its contact frame lands exactly `beat` ms in — the shared impact / release
   * beat the damage number and sound wait on. A quick unit holds its stance a
   * moment and then swings; the swing is never stretched into slow motion, and
   * only a beat too short for the wind-up compresses it. The follow-through
   * plays at the same pace.
   */
  const playActionClip = (group: number, beat: number): Promise<void> => {
    const count = frames(group);
    if (count === 0) return Promise.resolve();
    const frameMs = paced(HEX_ACTION_FRAME_MS);
    if (beat <= 0) return playClip(group, even(group, frameMs));
    // H3 attack groups connect a little past their middle frame.
    const hitIndex = Math.min(count - 1, Math.max(1, Math.round(count * 0.55)));
    const windUpMs = Math.min(beat / hitIndex, frameMs);
    const holdMs = beat - windUpMs * hitIndex;
    const durations = Array.from({ length: count }, (_, index) => (index < hitIndex ? windUpMs : frameMs));
    // The hold is the standing frame, then the swing; a newer cue arriving
    // during the hold cancels the swing (it never cuts the newer clip).
    const gen = generation;
    return holdMs > 1
      ? playClip(SPRITE_GROUP.standing, [holdMs], true).then(() =>
          disposed || gen !== generation ? undefined : playClip(group, durations))
      : playClip(group, durations);
  };

  const runLunge = async (cue: Extract<HexUnitCueDetail["cue"], { kind: "lunge" }>) => {
    const rest = options.restPoint();
    const target = parseCellAnchor(cue.to);
    if (!rest || target === null || !isHexPosition(target)) return;
    const b = targetPoint(target);
    const a = nearestOwnPoint(b);
    const ranged = cue.attackKind === "ranged";
    // Face the target with a (quick) H3 turn inside the wind-up; the figure
    // turns back to face the enemy once it is idle again (see handle).
    const turnedMs = b.x !== a.x ? await quickTurn(b.x > a.x, cue.releaseMs ?? (ranged ? HEX_RANGED_RELEASE_MS : IMPACT_MS)) : 0;
    if (disposed) return;
    const direction = lineDirection(a, b);
    if (atlas) {
      const shoot = { up: SPRITE_GROUP.shootUp, straight: SPRITE_GROUP.shootStraight, down: SPRITE_GROUP.shootDown }[direction];
      const strike = { up: SPRITE_GROUP.attackUp, straight: SPRITE_GROUP.attackStraight, down: SPRITE_GROUP.attackDown }[direction];
      const group = ranged && frames(shoot) > 0 ? shoot : frames(strike) > 0 ? strike : SPRITE_GROUP.attackStraight;
      const fullBeat = cue.releaseMs ?? (ranged ? HEX_RANGED_RELEASE_MS : IMPACT_MS);
      const beat = fullBeat <= 0 ? fullBeat : Math.max(1, fullBeat - turnedMs);
      await playActionClip(group, beat);
    } else {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const reach = cue.attackKind === "ranged" ? -0.12 : 0.42;
      const base = offset;
      await new Promise<void>((resolve) => {
        const duration = cue.attackKind === "ranged" ? 440 : 820;
        let start = -1;
        onClock((now) => {
          if (disposed) {
            resolve();
            return false;
          }
          if (start < 0) start = now;
          const t = Math.min(1, (now - start) / duration);
          const peak = IMPACT_MS / STRIKE_MS;
          const k = t < peak ? t / peak : 1 - (t - peak) / (1 - peak);
          setOffset({ x: base.x + dx * reach * k, y: base.y + dy * reach * k });
          if (t >= 1) {
            setOffset(base);
            resolve();
            return false;
          }
          return true;
        });
      });
    }
  };

  /**
   * A cast: face the target (quick turn inside the wind-up), then the H3
   * spell-casting row for its direction (17/18/19). A creature without cast
   * frames plays its straight attack; a card token pulses.
   */
  const runCast = async (cue: Extract<HexUnitCueDetail["cue"], { kind: "cast" }>) => {
    const target = cue.to ? parseCellAnchor(cue.to) : null;
    const fullBeat = cue.releaseMs ?? CAST_RELEASE_MS;
    let beat = fullBeat;
    let direction: "up" | "straight" | "down" = "straight";
    if (target !== null && isHexPosition(target) && !options.ownCells().includes(target)) {
      const b = targetPoint(target);
      const a = nearestOwnPoint(b);
      if (b.x !== a.x) beat = Math.max(1, fullBeat - (await quickTurn(b.x > a.x, fullBeat)));
      if (disposed) return;
      direction = lineDirection(a, b);
    }
    const cast = { up: SPRITE_GROUP.castUp, straight: SPRITE_GROUP.castStraight, down: SPRITE_GROUP.castDown }[direction];
    const group = frames(cast) > 0
      ? cast
      : frames(SPRITE_GROUP.castStraight) > 0
        ? SPRITE_GROUP.castStraight
        : SPRITE_GROUP.attackStraight;
    if (atlas && frames(group) > 0) {
      await playActionClip(group, beat);
      return;
    }
    await figure
      .animate([{ scale: "1" }, { scale: "1.08", offset: 0.5 }, { scale: "1" }], { duration: CAST_MS })
      .finished.catch(() => undefined);
  };

  const runShake = async () => {
    if (atlas && frames(SPRITE_GROUP.hit) > 0) {
      await playClip(SPRITE_GROUP.hit, even(SPRITE_GROUP.hit, paced(HEX_HIT_FRAME_MS)));
      return;
    }
    await figure
      .animate([{ scale: "1" }, { scale: "1.06" }, { scale: "0.97" }, { scale: "1" }], { duration: 360 })
      .finished.catch(() => undefined);
  };

  const runPose = async () => {
    if (atlas && frames(SPRITE_GROUP.defend) > 0) {
      await playClip(SPRITE_GROUP.defend, even(SPRITE_GROUP.defend, paced(HEX_HIT_FRAME_MS)));
    }
  };

  const scheduleIdle = () => {
    if (!atlas || disposed || !options.idle) return;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(async () => {
      if (disposed) return;
      // Skipped while the tab is hidden (no frames would draw anyway).
      if (busy === 0 && !document.hidden) {
        await playClip(SPRITE_GROUP.standing, even(SPRITE_GROUP.standing, paced(HEX_IDLE_FRAME_MS)));
      }
      scheduleIdle();
      // A Hasted unit fidgets more often, a Slowed one less.
    }, (3500 + Math.random() * 5000) / options.tempo());
  };

  const handle = (event: Event) => {
    const detail = (event as CustomEvent<HexUnitCueDetail>).detail;
    if (!detail || detail.accepted) return;
    detail.accepted = true;
    event.stopPropagation();
    busy += 1;
    generation += 1;
    const run =
      detail.cue.kind === "move" ? runMove(detail.cue)
        : detail.cue.kind === "lunge" ? runLunge(detail.cue)
          : detail.cue.kind === "cast" ? runCast(detail.cue)
            : detail.cue.kind === "shake" ? runShake()
              : runPose();
    run
      .catch(() => undefined)
      .finally(() => {
        busy = Math.max(0, busy - 1);
        detail.done();
        // Idle again after striking / casting to one side: turn back to face
        // the enemy with the H3 turn (a newer cue cuts this short).
        if (busy === 0 && !disposed && facing !== options.facesRight()) {
          void turnTo(options.facesRight());
        }
      });
  };

  const snap = () => {
    if (busy === 0) {
      setOffset({ x: 0, y: 0 });
      settle();
    }
  };

  /** A move cue for this unit is queued: keep holding until it plays. */
  const pending = (event: Event) => {
    const delayMs = (event as CustomEvent<{ delayMs?: number }>).detail?.delayMs ?? 0;
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(snap, delayMs + 3000);
  };

  const holdAt = (from: number) => {
    const rest = options.restPoint();
    if (!rest || busy > 0) return;
    const point = options.pointFor(from);
    setOffset({ x: point.x - rest.x, y: point.y - rest.y });
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(snap, MOVE_HOLD_GRACE_MS);
  };

  setFacing(facing);
  showFrame(SPRITE_GROUP.standing, 0);
  scheduleIdle();

  return {
    handle,
    pending,
    holdAt,
    dispose: () => {
      disposed = true;
      stopClip?.();
      stopMove?.();
      window.clearTimeout(holdTimer);
      window.clearTimeout(idleTimer);
      // Never leave the figure parked on a hold/walk offset for the next controller.
      figure.style.translate = "";
    }
  };
}

// ---------------------------------------------------------------------------
// Units layer
// ---------------------------------------------------------------------------

/** Live stat swings drawn as tiny chevrons on the stack plate (0 = none). */
export type HexStatDeltas = { attack: number; defense: number; initiative: number };

/** Live combat data the figures read (one stable ref, refreshed every layer render). */
type LiveBoard = {
  combat: CombatState;
  flipped: boolean;
  units: Map<string, CombatUnitState>;
  /** Live Initiative swing per unit (Haste / Slow): its animation tempo input. */
  initiativeDelta: Map<string, number>;
};

type FigureProps = {
  live: { current: LiveBoard };
  unitId: string;
  /** Everything the figure draws, as primitives, so memo skips untouched figures. */
  position: number;
  spriteKey: string;
  unitType: CombatUnitState["type"];
  attackerSide: boolean;
  doubleWide: boolean;
  tailStep: number;
  variant: CombatUnitState["variant"];
  cardImage: string | undefined;
  name: string;
  flipped: boolean;
  active: boolean;
  health: number;
  attackDelta: number;
  defenseDelta: number;
  initiativeDelta: number;
};

const HexUnitFigure = memo(function HexUnitFigure({
  live,
  unitId,
  position,
  spriteKey,
  unitType,
  attackerSide,
  doubleWide,
  tailStep,
  variant,
  cardImage,
  name,
  flipped,
  active,
  health,
  attackDelta,
  defenseDelta,
  initiativeDelta
}: FigureProps) {
  const liveUnit = (): CombatUnitState | undefined =>
    live.current.units.get(unitId) ?? live.current.combat.units[unitId];
  const unit = liveUnit();
  const atlas = unit ? unitCreatureSprite(unit) : null;
  const figureRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<Controller | null>(null);
  const previousPosition = useRef(position);

  // Layout effect, declared before the hold effect below: a frame that changes
  // both the art and the hex must hand the hold to the NEW controller.
  useLayoutEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const controller = createController({
      figure,
      sprite: spriteRef.current,
      atlas,
      unitType,
      idle: true,
      facesRight: () => {
        const now = liveUnit();
        return now ? facesRightByDefault(live.current.combat, now, live.current.flipped) : true;
      },
      restPoint: () => {
        const now = liveUnit();
        return now && isHexPosition(now.position)
          ? footPoint(live.current.combat, now, now.position, live.current.flipped)
          : null;
      },
      pointFor: (cell) => {
        const now = liveUnit();
        return now ? footPoint(live.current.combat, now, cell, live.current.flipped) : cellFootPoint(cell, live.current.flipped);
      },
      cellPoint: (cell) => cellFootPoint(cell, live.current.flipped),
      ownCells: () => {
        const now = liveUnit();
        return now ? unitCells(live.current.combat, now) : [];
      },
      targetCells: (cell) => {
        const combat = live.current.combat;
        const standing = unitAtCell(
          combat,
          cell,
          Object.values(combat.units).filter((other) => other.damage < other.maxHealth)
        );
        return standing ? unitCells(combat, standing) : [cell];
      },
      tempo: () => hexAnimationTempo(live.current.initiativeDelta.get(unitId) ?? 0),
      movePlan: (route, flying, teleport, turns) => {
        const now = liveUnit();
        return hexMovePlan({
          unitDefId: now?.unitDefId,
          variant: now?.variant,
          commanderSlug: now?.commanderSlug,
          initiative: now?.initiative,
          initiativeDelta: live.current.initiativeDelta.get(unitId) ?? 0,
          flyer: now?.type === "flying",
          steps: route.length - 1,
          distance: route.length > 1 ? getBattlefieldDistance(route[0], route[route.length - 1]) : 0,
          flying,
          teleport,
          turns
        });
      }
    });
    controllerRef.current = controller;
    figure.addEventListener(HEX_UNIT_CUE_EVENT, controller.handle);
    figure.addEventListener(HEX_UNIT_PENDING_MOVE_EVENT, controller.pending);
    return () => {
      figure.removeEventListener(HEX_UNIT_CUE_EVENT, controller.handle);
      figure.removeEventListener(HEX_UNIT_PENDING_MOVE_EVENT, controller.pending);
      controller.dispose();
      controllerRef.current = null;
    };
    // The controller reads position/facing/tempo live; rebuild only for new art or orientation.
  }, [spriteKey, flipped, unitType]);

  // The unit changed hex: stay on the old hex until the move cue walks it over.
  useLayoutEffect(() => {
    const from = previousPosition.current;
    previousPosition.current = position;
    if (from !== position && isHexPosition(from) && isHexPosition(position)) {
      controllerRef.current?.holdAt(from);
    }
  }, [position]);

  const center = isHexPosition(position) ? hexCellCenter(position, flipped) : { x: 0, y: -FOOT_DROP };
  // footPoint's rule: a two-hex creature stands between its head and tail.
  const foot = {
    x: tailStep === 0 ? center.x : center.x + (HEX_WIDTH / 2) * tailStep * (flipped ? -1 : 1),
    y: center.y + FOOT_DROP
  };
  const row = isHexPosition(position) ? getBattlefieldCoordinates(position).row : 0;
  const side = attackerSide ? "attackerSide" : "defenderSide";
  const bodyLift = atlas ? atlas.anchorY * SPRITE_SCALE * 0.42 : HEX_RADIUS * 0.9;
  return (
    <div
      className={`hexFigure ${side}${active ? " active" : ""}${atlas ? "" : " token"}`}
      data-hex-unit={unitId}
      ref={figureRef}
      style={pointStyle(foot, 10 + row)}
    >
      {atlas ? (
        <div className="hexSprite" ref={spriteRef} style={spriteStyle(atlas)} />
      ) : (
        <div className="hexToken" style={{ left: px(-20), top: px(-66), width: px(40), height: px(58) }}>
          {cardImage ? (
            <img alt="" draggable={false} src={assetUrl(cardImage)} />
          ) : (
            <span>{name.slice(0, 2)}</span>
          )}
        </div>
      )}
      {/* Effects (spells, arrows, damage numbers) aim at the creature's body, not the floor. */}
      <span
        aria-hidden="true"
        className="hexUnitBody"
        data-fx-body=""
        style={{ left: px(-22), top: px(-bodyLift - 26), width: px(44), height: px(52) }}
      />
      {/* The PC stack plate at the feet: a Few / Pack glyph, the health left,
          and — only while a stat is buffed or debuffed — tiny chevrons on top
          of it. Kept at the feet so they never cover the creature. */}
      <span
        className="hexUnitPlate"
        style={{ left: px(doubleWide ? 30 : 8), top: px(-4), fontSize: px(11) }}
      >
        {variant === "pack" ? (
          <Users aria-hidden="true" className="hexPlateSide" />
        ) : variant === "few" ? (
          <User aria-hidden="true" className="hexPlateSide" />
        ) : null}
        {health}
        {attackDelta || defenseDelta || initiativeDelta ? (
          <span className="hexPlateStats">
            {([["attack", attackDelta], ["defense", defenseDelta], ["speed", initiativeDelta]] as const).map(([stat, delta]) =>
              delta ? (
                <span className={`hexPlateStat ${stat} ${delta > 0 ? "up" : "down"}`} key={stat}>
                  {delta > 0 ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                </span>
              ) : null
            )}
          </span>
        ) : null}
      </span>
    </div>
  );
});

/** Every creature, war machine and corpse on the hex board. */
export function HexUnitsLayer({
  state,
  combat,
  flipped,
  units,
  healthOf,
  statDeltasOf
}: {
  state: GameState;
  combat: CombatState;
  flipped: boolean;
  /** Units drawn alive on the board (shown health above zero). */
  units: readonly CombatUnitState[];
  healthOf: (unit: CombatUnitState) => number;
  /** Live Attack / Defense / Initiative minus the printed values. */
  statDeltasOf: (unit: CombatUnitState) => HexStatDeltas;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const apply = () => {
      const width = layer.getBoundingClientRect().width;
      if (width > 0) layer.style.setProperty("--hex-scale", String(width / HEX_BOARD_WIDTH));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);
  const deltas = new Map(units.map((unit) => [unit.id, statDeltasOf(unit)]));
  // One stable holder: figures read the newest combat / units / tempo through it.
  const live = useRef<LiveBoard>({ combat, flipped, units: new Map(), initiativeDelta: new Map() });
  live.current = {
    combat,
    flipped,
    units: new Map(units.map((unit) => [unit.id, unit])),
    initiativeDelta: new Map(units.map((unit) => [unit.id, deltas.get(unit.id)?.initiative ?? 0]))
  };
  const shownAlive = new Map(units.map((unit) => [unit.id, unit.position]));
  return (
    <div aria-hidden="true" className="hexUnitsLayer" ref={layerRef}>
      <HexFallen combat={combat} flipped={flipped} shownAlive={shownAlive} />
      {units
        .filter((unit) => isHexPosition(unit.position))
        .map((unit) => {
          const unitDeltas = deltas.get(unit.id) ?? { attack: 0, defense: 0, initiative: 0 };
          return (
            <HexUnitFigure
              active={combat.activeUnitId === unit.id}
              attackDelta={unitDeltas.attack}
              attackerSide={unitIsAttackerSide(combat, unit)}
              cardImage={unit.assets?.cardImage}
              defenseDelta={unitDeltas.defense}
              doubleWide={unitIsDoubleWide(combat, unit)}
              flipped={flipped}
              health={healthOf(unit)}
              initiativeDelta={unitDeltas.initiative}
              key={unit.id}
              live={live}
              name={unit.name}
              position={unit.position}
              spriteKey={unitCreatureSprite(unit)?.slug ?? ""}
              tailStep={unitTailOffset(combat, unit)}
              unitId={unit.id}
              unitType={unit.type}
              variant={unit.variant}
            />
          );
        })}
      <HexWarMachines combat={combat} flipped={flipped} state={state} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// War machines: the in-play machine cards stand at their army's edge
// ---------------------------------------------------------------------------

const WAR_MACHINE_SPRITES: Readonly<Record<string, string>> = {
  "war_machine.ballista": "war-ballista",
  "war_machine.catapult": "war-catapult",
  "war_machine.ammo_cart": "war-ammo-cart",
  "war_machine.first_aid_tent": "war-first-aid-tent"
};

/** Row each machine type stands beside (PC: ballista high, cart and tent low). */
const WAR_MACHINE_ROWS: Readonly<Record<string, number>> = {
  "war_machine.ballista": 1,
  "war_machine.cannon": 1,
  "war_machine.lightning_generator": 2,
  "war_machine.catapult": 4,
  "war_machine.ammo_cart": 6,
  "war_machine.first_aid_tent": 8
};

function HexWarMachines({ state, combat, flipped }: { state: GameState; combat: CombatState; flipped: boolean }) {
  const figures: Array<{ playerId: PlayerId; cardId: string; attacker: boolean; row: number }> = [];
  for (const [playerId, attacker] of [[combat.attackerPlayerId, true], [combat.defenderPlayerId, false]] as const) {
    if (!state.players[playerId]) continue;
    const taken = new Set<number>();
    for (const cardId of getPermanentCardIds(state, playerId).filter(isWarMachineCard)) {
      let row = WAR_MACHINE_ROWS[cardId] ?? 3;
      while (taken.has(row) && row < 8) row += 1;
      taken.add(row);
      figures.push({ playerId, cardId, attacker, row });
    }
  }
  return (
    <>
      {figures.map((figure) => (
        <HexWarMachineFigure flipped={flipped} key={`${figure.playerId}:${figure.cardId}`} {...figure} />
      ))}
    </>
  );
}

function HexWarMachineFigure({
  playerId,
  cardId,
  attacker,
  row,
  flipped
}: {
  playerId: PlayerId;
  cardId: string;
  attacker: boolean;
  row: number;
  flipped: boolean;
}) {
  const slug = WAR_MACHINE_SPRITES[cardId];
  const atlas = slug ? creatureSpriteForSlug(slug) : null;
  const leftSide = attacker !== flipped;
  const point = { x: leftSide ? 20 : HEX_BOARD_WIDTH - 20, y: GRID_TOP + HEX_RADIUS + row * HEX_ROW_STEP + FOOT_DROP };
  const figureRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const controller = createController({
      figure,
      sprite: spriteRef.current,
      atlas,
      unitType: "ranged",
      idle: false,
      facesRight: () => leftSide,
      restPoint: () => point,
      pointFor: (position) => hexCellCenter(position, flipped),
      cellPoint: (position) => cellFootPoint(position, flipped),
      ownCells: () => [],
      targetCells: (position) => [position],
      // War machines never walk and have no Haste/Slow tempo.
      movePlan: () => ({ totalMs: 0, legsMs: 0, turnFrameMs: 0, edgeFrameMs: 0, teleportFrameMs: 0 }),
      tempo: () => 1
    });
    figure.addEventListener(HEX_UNIT_CUE_EVENT, controller.handle);
    return () => {
      figure.removeEventListener(HEX_UNIT_CUE_EVENT, controller.handle);
      controller.dispose();
    };
    // point is derived from these.
  }, [atlas?.slug, flipped, leftSide, row]);
  return (
    <div
      className="hexFigure hexWarMachine"
      data-fx-anchor={`war-machine:${playerId}:${cardId}`}
      data-hex-war-machine=""
      ref={figureRef}
      style={pointStyle(point, 10 + row)}
    >
      {atlas ? (
        <div className="hexSprite" ref={spriteRef} style={{ ...spriteStyle(atlas), ["--face" as string]: leftSide ? "1" : "-1" }} />
      ) : (
        <div className="hexToken" style={{ left: px(-20), top: px(-60), width: px(40), height: px(56) }}>
          {cardLibrary[cardId]?.assets?.cardImage ? <img alt="" src={assetUrl(cardLibrary[cardId]!.assets!.cardImage!)} /> : null}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fallen units: H3 leaves its dead on the field
// ---------------------------------------------------------------------------

type FallenEntry = {
  id: string;
  unit: CombatUnitState;
  position: number;
  /** When it fell (performance.now()): the death clip plays ONCE from here. */
  diedAt: number;
  /** Frozen at death: which way it faced and where its two-hex tail lay. */
  attackerSide: boolean;
  tailStep: number;
};

function HexFallen({
  combat,
  flipped,
  shownAlive
}: {
  combat: CombatState;
  flipped: boolean;
  shownAlive: ReadonlyMap<string, number>;
}) {
  const previous = useRef<{ combatId: string; alive: Map<string, number> }>({ combatId: combat.id, alive: new Map() });
  const [fallen, setFallen] = useState<FallenEntry[]>([]);
  const aliveKey = Array.from(shownAlive, ([id, position]) => `${id}@${position}`).join("|");
  // Layout effect: the corpse mounts in the same paint the live figure leaves.
  useLayoutEffect(() => {
    const last = previous.current;
    if (last.combatId !== combat.id) {
      previous.current = { combatId: combat.id, alive: new Map(shownAlive) };
      setFallen([]);
      return;
    }
    const newlyFallen: FallenEntry[] = [];
    const diedAt = performance.now();
    for (const [id, position] of last.alive) {
      if (shownAlive.has(id)) continue;
      const unit = combat.units[id];
      // Only a listed unit that took lethal damage died here; one that left
      // the field (retreat, flee, recall) just disappears.
      if (!unit || unit.damage < unit.maxHealth || !isHexPosition(position)) continue;
      newlyFallen.push({
        id,
        unit,
        position,
        diedAt,
        attackerSide: unitIsAttackerSide(combat, unit),
        tailStep: unitTailOffset(combat, unit)
      });
    }
    previous.current = { combatId: combat.id, alive: new Map(shownAlive) };
    setFallen((current) => {
      const kept = current.filter((entry) => !shownAlive.has(entry.id));
      return newlyFallen.length > 0 ? [...kept, ...newlyFallen] : kept.length === current.length ? current : kept;
    });
    // aliveKey summarises shownAlive.
  }, [combat.id, aliveKey]);
  return (
    <>
      {fallen.map((entry) => (
        <HexFallenFigure entry={entry} flipped={flipped} key={entry.id} />
      ))}
    </>
  );
}

/** The death group's frame `elapsed` ms after the fall (the last frame — the corpse — holds). */
function deathFrameAt(atlas: CreatureSpriteAtlas, elapsed: number): string | null {
  const info = atlas.groups[String(SPRITE_GROUP.death)];
  if (!info || info.frames < 1) return null;
  const index = Math.min(info.frames - 1, Math.max(0, Math.floor(elapsed / HEX_DEATH_FRAME_MS)));
  return `${-index * atlas.frameWidth}px ${-info.row * atlas.frameHeight}px`;
}

/**
 * A fallen stack: its H3 death clip plays exactly once from the moment it fell
 * and the corpse then lies on its last frame for the rest of the combat. Board
 * re-renders never restart it (the clip is keyed to `diedAt`, not to renders).
 */
const HexFallenFigure = memo(function HexFallenFigure({ entry, flipped }: { entry: FallenEntry; flipped: boolean }) {
  const atlas = unitCreatureSprite(entry.unit);
  const slug = atlas?.slug ?? "";
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const sprite = spriteRef.current;
    if (!atlas || !sprite) {
      // A card token has no death frames: it fades out where it fell.
      const timer = window.setTimeout(() => setGone(true), 700);
      return () => window.clearTimeout(timer);
    }
    const info = atlas.groups[String(SPRITE_GROUP.death)];
    if (!info) return;
    let shown = sprite.style.backgroundPosition;
    return onClock((now) => {
      const elapsed = now - entry.diedAt;
      const frame = deathFrameAt(atlas, elapsed);
      if (frame && frame !== shown) {
        shown = frame;
        sprite.style.backgroundPosition = frame;
      }
      return elapsed < info.frames * HEX_DEATH_FRAME_MS;
    });
    // One clip per fall: keyed to the art and the moment of death only.
  }, [slug, entry.diedAt]);
  if (gone) return null;
  const center = hexCellCenter(entry.position, flipped);
  const foot = {
    x: entry.tailStep === 0 ? center.x : center.x + (HEX_WIDTH / 2) * entry.tailStep * (flipped ? -1 : 1),
    y: center.y + FOOT_DROP
  };
  const facesRight = entry.attackerSide !== flipped;
  return (
    <div className={`hexFigure hexFallen${atlas ? "" : " token"}`} style={pointStyle(foot, 9)}>
      {atlas ? (
        <div
          className="hexSprite"
          ref={spriteRef}
          style={{
            ...spriteStyle(atlas),
            // Mount straight onto the right death frame (never a standing flash).
            backgroundPosition: deathFrameAt(atlas, performance.now() - entry.diedAt) ?? undefined,
            ["--face" as string]: facesRight ? "1" : "-1"
          }}
        />
      ) : (
        <div className="hexToken" style={{ left: px(-20), top: px(-66), width: px(40), height: px(58) }}>
          {entry.unit.assets?.cardImage ? <img alt="" src={assetUrl(entry.unit.assets.cardImage)} /> : null}
        </div>
      )}
    </div>
  );
});
