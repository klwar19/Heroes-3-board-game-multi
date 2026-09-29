"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BattleAnim, BattleState, FxId, ProjectileId } from "../engine/types";
import { colRow, hexDistance } from "../engine/hex";
import { creatureWalkTime } from "@/data/battle-hex/creature-sprites";
import { unitSound } from "../data/unit-sounds";
import { playSound } from "./audio";
import { G } from "./sprites";
import { EXTRA_GROUP, SKILL_GROUP, type Clip, type Facing, type Motion } from "./battle-board";

export type Float = { id: number; uid: string; text: string; kind: "dmg" | "heal" | "crit" | "weak" | "miss" | "status" };
export type Burst = { id: number; fx: FxId; cell: number; size: number };
export type Shot = { id: number; sprite: ProjectileId; from: number; to: number; ms: number };

/** Pace of a walk (per hex), a flyer, a shove. */
const WALK_MS = 210;
const FLY_MS = 150;
const KNOCK_MS = 110;

/**
 * How a figure looks when it goes from one hex to another: across the row it
 * shows its side, up the board its back, down the board its front (and left
 * is the mirror of right). null = same hex.
 */
export function facingBetween(from: number, to: number): Facing | null {
  const a = colRow(from);
  const b = colRow(to);
  const dx = b.col + (b.row & 1) / 2 - (a.col + (a.row & 1) / 2);
  const dy = b.row - a.row;
  if (dx === 0 && dy === 0) return null;
  return { view: dy < 0 ? "back" : dy > 0 ? "front" : "side", flip: dx < 0 };
}

/** Heights the terrain changes in `anims` start from (the first change of each hex). */
export function terrainBefore(anims: BattleAnim[] | undefined): Record<number, number> {
  const out: Record<number, number> = {};
  for (const anim of anims ?? []) {
    if (anim.kind !== "terrain") continue;
    for (const change of anim.changes) if (out[change.cell] === undefined) out[change.cell] = change.from;
  }
  return out;
}

/**
 * Plays engine battle animations in order on one timeline; the board shows the
 * settled state once they finish. Figures glide along their paths (see
 * UnitSprite), strikes lunge, hits flash, big blows shake the field.
 */
export function useAnimator(queue: BattleAnim[][], onDone: () => void, lookup: () => BattleState | null) {
  const [cells, setCells] = useState<Record<string, number>>({});
  const [clips, setClips] = useState<Record<string, Clip>>({});
  const [motions, setMotions] = useState<Record<string, Motion>>({});
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  /** How each figure is turned (kept between turns: the last way it moved or struck). */
  const [facings, setFacings] = useState<Record<string, Facing>>({});
  const [shake, setShake] = useState(0);
  const [floats, setFloats] = useState<Float[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [pendingDeaths, setPendingDeaths] = useState<Set<string>>(new Set());
  const [pendingProps, setPendingProps] = useState<Set<string>>(new Set());
  /** Ground heights shown before a terrain change plays (cell -> height). */
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);
  const running = useRef(false);
  const timers = useRef<number[]>([]);
  const doneRef = useRef(onDone);
  const lookupRef = useRef(lookup);
  useEffect(() => {
    doneRef.current = onDone;
    lookupRef.current = lookup;
  });
  // Timers belong to the animator, not to a render: only unmounting cancels them.
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  // A layout effect: movers are put back on their start hexes before the browser
  // paints the new state (no one-frame flash at the destination).
  useLayoutEffect(() => {
    if (!queue.length || running.current) return;
    const anims = queue[0]!;
    running.current = true;
    setBusy(true);
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    /** Play a row; returns its key, so only that same clip is ended later. */
    const clip = (uid: string, group: number, loop: boolean, fallback?: number, fps?: number) => {
      const key = ++counter.current;
      setClips((current) => ({ ...current, [uid]: { group, loop, key, at: performance.now(), ...(fallback !== undefined ? { fallback } : {}), ...(fps ? { fps } : {}) } }));
      return key;
    };
    /** Back to standing, unless a newer clip (the unit walking on after a strike) took over. */
    const idle = (uid: string, key: number) =>
      setClips((current) => {
        if (current[uid]?.key !== key) return current;
        const next = { ...current };
        delete next[uid];
        return next;
      });
    const glide = (uid: string, kind: Motion["kind"], path: number[], ms: number) => setMotions((current) => ({ ...current, [uid]: { key: ++counter.current, kind, cells: path, ms } }));
    const turn = (uid: string, from: number | undefined, to: number | undefined) => {
      if (from === undefined || to === undefined) return;
      const facing = facingBetween(from, to);
      if (facing) setFacings((current) => ({ ...current, [uid]: facing }));
    };
    const float = (uid: string, text: string, kind: Float["kind"]) => {
      const id = ++counter.current;
      setFloats((current) => [...current, { id, uid, text, kind }]);
      at(1100, () => setFloats((current) => current.filter((entry) => entry.id !== id)));
    };
    const sound = (key: string | undefined) => {
      if (key) playSound(key);
    };
    const unitOf = (uid: string) => lookupRef.current()?.units.find((entry) => entry.uid === uid);
    /**
     * Done moving or striking, a figure turns back to its side view (H3 style),
     * facing the nearest foe across the board, else the way it last faced.
     */
    const settle = (uid: string, cell: number) => {
      const state = lookupRef.current();
      const me = state?.units.find((entry) => entry.uid === uid);
      if (!state || !me) return;
      const x = (at: number) => colRow(at).col + (colRow(at).row & 1) / 2;
      let foe: number | null = null;
      for (const other of state.units) {
        if (other.side === me.side || other.hp <= 0 || other.gone) continue;
        if (foe === null || hexDistance(cell, other.cell) < hexDistance(cell, foe)) foe = other.cell;
      }
      setFacings((current) => {
        const dx = foe === null ? 0 : x(foe) - x(cell);
        const flip = Math.abs(dx) >= 0.5 ? dx < 0 : current[uid]?.flip ?? me.facing === "left";
        return { ...current, [uid]: { view: "side", flip } };
      });
    };
    /** Whether `uid` moves again later in this batch (then it keeps its walking facing). */
    const movesLater = (index: number, uid: string) =>
      anims.slice(index + 1).some((next) => (next.kind === "move" || next.kind === "leap" || next.kind === "blink") && next.uid === uid);
    // Units that start a move are drawn where the move starts until it plays.
    const starts: Record<string, number> = {};
    const dying = new Set<string>();
    const breaking = new Set<string>();
    for (const anim of anims) {
      if ((anim.kind === "move" || anim.kind === "knock") && starts[anim.uid] === undefined) starts[anim.uid] = anim.path[0]!;
      if ((anim.kind === "leap" || anim.kind === "blink") && starts[anim.uid] === undefined) starts[anim.uid] = anim.from;
      if (anim.kind === "death") dying.add(anim.uid);
      if (anim.kind === "prop" && anim.destroyed) breaking.add(anim.uid);
    }
    // Where each figure is at this point of the playback (lunges aim from there).
    const place: Record<string, number> = { ...starts };
    const placeOf = (uid: string) => place[uid] ?? unitOf(uid)?.cell;
    setCells(starts);
    setPendingDeaths(dying);
    setPendingProps(breaking);
    setHeights(terrainBefore(anims));
    let t = 0;
    let striker: string | null = null;
    for (let index = 0; index < anims.length; index++) {
      const anim = anims[index]!;
      switch (anim.kind) {
        case "move":
        case "knock": {
          const mover = unitOf(anim.uid);
          // Each creature keeps its own PC pace (H3 walk time); the Restia cast walks at 1.
          const pace = mover && !mover.sprite.startsWith("restia-") ? creatureWalkTime({ slug: mover.sprite }) : 1;
          const step = anim.kind === "knock" ? KNOCK_MS : (mover?.flying ? FLY_MS : WALK_MS) * pace;
          const ms = Math.max(1, anim.path.length - 1) * step;
          const last = anim.path[anim.path.length - 1]!;
          place[anim.uid] = last;
          let key = 0;
          at(t, () => {
            if (anim.kind === "move") key = clip(anim.uid, G.move, true, undefined, Math.round(10 / pace));
            setCells((current) => ({ ...current, [anim.uid]: last }));
            glide(anim.uid, anim.kind === "move" ? "walk" : "knock", anim.path, ms);
          });
          // Walkers turn to face each step (side, front or back).
          if (anim.kind === "move") anim.path.slice(1).forEach((cell, i) => at(t + i * step, () => turn(anim.uid, anim.path[i], cell)));
          t += ms + 40;
          if (anim.kind === "move") {
            const again = movesLater(index, anim.uid);
            at(t, () => {
              idle(anim.uid, key);
              if (!again) settle(anim.uid, last);
            });
          }
          break;
        }
        case "leap": {
          const ms = 420 + 70 * hexDistance(anim.from, anim.to);
          place[anim.uid] = anim.to;
          let key = 0;
          at(t, () => {
            turn(anim.uid, anim.from, anim.to);
            key = clip(anim.uid, SKILL_GROUP[anim.sprite], false, G.move, Math.max(8, Math.round(8000 / ms)));
            setCells((current) => ({ ...current, [anim.uid]: anim.to }));
            glide(anim.uid, "leap", [anim.from, anim.to], ms);
          });
          const again = movesLater(index, anim.uid);
          at(t + ms + 60, () => {
            idle(anim.uid, key);
            if (!again) settle(anim.uid, anim.to);
          });
          t += ms + 60;
          break;
        }
        case "blink": {
          // Vanish in a flash, reappear in another.
          const ms = 560;
          place[anim.uid] = anim.to;
          const again = movesLater(index, anim.uid);
          at(t, () => {
            turn(anim.uid, anim.from, anim.to);
            setCells((current) => ({ ...current, [anim.uid]: anim.to }));
            glide(anim.uid, "blink", [anim.from, anim.to], ms);
            if (!again) at(ms, () => settle(anim.uid, anim.to));
            for (const cell of [anim.from, anim.to]) {
              const id = ++counter.current;
              setBursts((current) => [...current, { id, fx: "cast", cell, size: 130 }]);
              at(620, () => setBursts((current) => current.filter((entry) => entry.id !== id)));
            }
            sound("spells/teleport");
          });
          t += ms + 40;
          break;
        }
        case "pose": {
          // Powering up (Charge) or drinking a potion (items); others use their cast row.
          let key = 0;
          at(t, () => {
            key = clip(anim.uid, anim.pose === "charge" ? EXTRA_GROUP.charge : EXTRA_GROUP.item, false, G.cast);
          });
          at(t + 760, () => idle(anim.uid, key));
          t += 460;
          break;
        }
        case "attack": {
          const group = anim.anim === "shoot" ? G.shoot : anim.anim === "cast" ? G.cast : G.attack;
          const from = placeOf(anim.uid);
          const to = placeOf(anim.target);
          // Melee blows lunge at the target; skill-sheet rows play a little longer.
          const lunge = anim.anim === "attack" && anim.target !== anim.uid && from !== undefined && to !== undefined;
          // A plain blow that lands as a critical hit plays the critical-strike row.
          const landed = anims.slice(index + 1).find((next) => next.kind === "hit" && next.uid === anim.target);
          const crit = !anim.sprite && anim.anim === "attack" && landed?.kind === "hit" && landed.crit;
          striker = anim.uid;
          let key = 0;
          at(t, () => {
            if (anim.target !== anim.uid) turn(anim.uid, from, to);
            key = clip(anim.uid, anim.sprite ? SKILL_GROUP[anim.sprite] : crit ? EXTRA_GROUP.crit : group, false, group);
            if (lunge) glide(anim.uid, "lunge", [from!, to!], 360);
            sound(anim.sound);
          });
          const again = movesLater(index, anim.uid);
          at(t + (anim.sprite ? 860 : 700), () => {
            idle(anim.uid, key);
            if (!again && from !== undefined && anim.target !== anim.uid) settle(anim.uid, from);
          });
          t += anim.sprite ? 480 : 380;
          break;
        }
        case "projectile": {
          const id = ++counter.current;
          const ms = Math.min(520, Math.max(240, hexDistance(anim.from, anim.to) * 80));
          at(t, () => {
            setShots((current) => [...current, { id, sprite: anim.sprite, from: anim.from, to: anim.to, ms }]);
            sound(anim.sound);
          });
          at(t + ms + 30, () => setShots((current) => current.filter((entry) => entry.id !== id)));
          t += ms;
          break;
        }
        case "fx": {
          const id = ++counter.current;
          const size = anim.fx === "explosion" || anim.fx === "cast" ? 150 : 124;
          at(t, () => {
            setBursts((current) => [...current, { id, fx: anim.fx, cell: anim.cell, size }]);
            sound(anim.sound);
            if (anim.fx === "explosion" || anim.fx === "earth") setShake(++counter.current);
          });
          at(t + 620, () => setBursts((current) => current.filter((entry) => entry.id !== id)));
          t += anim.fx === "cast" ? 260 : 170;
          break;
        }
        case "terrain":
          at(t, () =>
            setHeights((current) => {
              const next = { ...current };
              for (const change of anim.changes) delete next[change.cell];
              return next;
            })
          );
          t += 520;
          break;
        case "sound":
          at(t, () => sound(anim.id));
          break;
        case "banner": {
          const id = ++counter.current;
          at(t, () => setBanner({ id, text: anim.text }));
          at(t + 1900, () => setBanner((current) => (current?.id === id ? null : current)));
          t += 600;
          break;
        }
        case "prop":
          at(t, () =>
            setPendingProps((current) => {
              const next = new Set(current);
              next.delete(anim.uid);
              return next;
            })
          );
          t += 120;
          break;
        case "hit": {
          const text = anim.miss ? "Miss" : anim.heal ? `+${anim.amount}` : anim.resist && anim.amount === 0 ? "Immune" : `${anim.amount}${anim.shielded ? ` (${anim.shielded} shield)` : ""}`;
          const kind: Float["kind"] = anim.miss ? "miss" : anim.heal ? "heal" : anim.crit ? "crit" : anim.weak ? "weak" : "dmg";
          const by = striker;
          at(t, () => {
            float(anim.uid, anim.weak && !anim.heal ? `${text} WEAK` : anim.crit ? `${text}!` : text, kind);
            const here = placeOf(anim.uid);
            const there = by ? placeOf(by) : undefined;
            if (anim.miss && !anim.uid.startsWith("prop-")) {
              // A miss is a dodge: hop away from the blow.
              const key = clip(anim.uid, EXTRA_GROUP.dodge, false, G.defend);
              if (here !== undefined && there !== undefined && here !== there) glide(anim.uid, "recoil", [here, there], 300);
              at(460, () => idle(anim.uid, key));
            }
            if (!anim.heal && !anim.miss && anim.amount > 0 && !anim.uid.startsWith("prop-")) {
              const key = clip(anim.uid, G.hit, false);
              if (here !== undefined && there !== undefined && here !== there) glide(anim.uid, "recoil", [here, there], 240);
              setFlashes((current) => ({ ...current, [anim.uid]: ++counter.current }));
              if (anim.crit) setShake(++counter.current);
              at(420, () => idle(anim.uid, key));
              const unit = unitOf(anim.uid);
              if (unit && (unit.kind === "monster" || unit.kind === "pet")) sound(unitSound(unit.sprite, "hurt"));
            }
          });
          t += 110;
          break;
        }
        case "death":
          at(t, () => {
            setPendingDeaths((current) => {
              const next = new Set(current);
              next.delete(anim.uid);
              return next;
            });
            clip(anim.uid, G.death, false);
            sound(anim.sound);
          });
          t += 260;
          break;
        case "status":
          at(t, () => float(anim.uid, anim.text, "status"));
          t += 200;
          break;
        case "befriend":
          at(t, () => float(anim.uid, anim.ok ? "Befriended! ♥" : "Refused", anim.ok ? "heal" : "miss"));
          t += 700;
          break;
      }
    }
    at(t + 450, () => {
      timers.current = [];
      setCells({});
      setHeights({});
      setMotions({});
      setPendingDeaths(new Set());
      setPendingProps(new Set());
      running.current = false;
      setBusy(false);
      doneRef.current();
    });
  }, [queue]);

  return { cells, clips, motions, flashes, facings, shake, floats, bursts, shots, banner, pendingDeaths, pendingProps, heights, busy };
}
