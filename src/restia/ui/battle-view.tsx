"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BattleAnim, BattleProp, BattleState, BattleUnit, DispatchResult, FxId, ProjectileId, RestiaAction, RestiaState, SkillDef, TileKind } from "../engine/types";
import { SKILLS } from "../data/skills";
import { ITEMS, itemDef } from "../data/items";
import { MONSTERS } from "../data/monsters";
import { CHARACTERS } from "../data/characters";
import { JOBS } from "../data/jobs";
import { PASSIVES } from "../data/passives";
import { PROP_NAMES, TILE_HELP, TILE_NAMES, WEATHER_TEXT, battlefieldOf } from "../data/battlefields";
import { unitSound } from "../data/unit-sounds";
import {
  CHARGE_CARRY,
  DEFEND_CARRY,
  SPRINT_MOVE,
  activeUnit,
  attackBlock,
  befriendChance,
  eff,
  expectedDamage,
  fleeChance,
  living,
  moveRange,
  reachable,
  rushReady,
  skillAp,
  skillBlock,
  skillMp,
  skillTargets,
  unitAt,
  STATUS_NAMES
} from "../engine/battle";
import { heightOf, propAt } from "../engine/battle-field";
import { BOARD_COLS, BOARD_ROWS, colRow, hexDistance } from "../engine/hex";
import { count } from "../engine/core";
import { SCENES } from "../engine/scenes";
import { A, BATTLEFIELD, FX_SHEET, PROJECTILE_SHEET, PROPS_SHEET, TACHIE, tachieFor } from "./assets";
import { playSound } from "./audio";
import { G, SpriteClip, SpriteStill, atlasFor, type Atlas } from "./sprites";
import s from "./restia.module.css";

const FIELD_W = 800;
const FIELD_H = 556;
const HEX_W = 44;
const HEX_H = 52;
const ROW_STEP = 42;
const LEFT = (FIELD_W - (BOARD_COLS * HEX_W + HEX_W / 2)) / 2;
const TOP = 186;
const FOOT = 12;
/** Pixels a high-ground hex (and whoever stands on it) is raised. */
const LIFT = 10;

function center(cell: number): { x: number; y: number } {
  const { col, row } = colRow(cell);
  return { x: LEFT + col * HEX_W + (row & 1 ? HEX_W / 2 : 0) + HEX_W / 2, y: TOP + row * ROW_STEP + HEX_H / 2 };
}

function hexPoints(cell: number, lift = 0): string {
  const { x, y: base } = center(cell);
  const y = base - lift;
  const w = HEX_W / 2;
  return [
    [x, y - 26],
    [x + w, y - 16],
    [x + w, y + 16],
    [x, y + 26],
    [x - w, y + 16],
    [x - w, y - 16]
  ]
    .map(([px, py]) => `${px},${py}`)
    .join(" ");
}

/** The cliff face under a raised hex. */
function sidePoints(cell: number): string {
  const { x, y } = center(cell);
  const w = HEX_W / 2;
  return [
    [x - w, y + 16 - LIFT],
    [x, y + 26 - LIFT],
    [x + w, y + 16 - LIFT],
    [x + w, y + 16],
    [x, y + 26],
    [x - w, y + 16]
  ]
    .map(([px, py]) => `${px},${py}`)
    .join(" ");
}

/** Frames in the props sheet (hv7-props, 4x4). */
function propFrame(kind: BattleProp["kind"], backdrop: string): number {
  const biome = battlefieldOf(backdrop).biome;
  switch (kind) {
    case "rock":
      return biome === "nave" || biome === "rift" || biome === "cloister" ? 9 : 0;
    case "pillar":
      return 1;
    case "crates":
      return 2;
    case "barrel":
      return 4;
    case "totem":
      return 12;
  }
}

function tileFrame(tile: TileKind, backdrop: string): number | null {
  const biome = battlefieldOf(backdrop).biome;
  switch (tile) {
    case "spring":
      return 5;
    case "crystal":
      return 6;
    case "thorns":
      return 7;
    case "fire":
      return 8;
    case "mud":
      return 13;
    case "ice":
      return 14;
    case "cover":
      return biome === "frost" || biome === "village" || biome === "nave" ? 15 : 3;
    default:
      return null;
  }
}

const TILE_CLASS: Partial<Record<TileKind, string>> = {
  ice: s.tileIce,
  mud: s.tileMud,
  water: s.tileWater,
  fire: s.tileFire,
  thorns: s.tileThorns,
  spring: s.tileSpring,
  crystal: s.tileCrystal,
  cover: s.tileCover
};

/** One frame of a 4x4 sheet. */
function SheetFrame({ sheet, frame, size, style }: { sheet: string; frame: number; size: number; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        width: size,
        height: size,
        backgroundImage: `url(${sheet})`,
        backgroundSize: `${size * 4}px ${size * 4}px`,
        backgroundPosition: `${-(frame % 4) * size}px ${-Math.floor(frame / 4) * size}px`,
        pointerEvents: "none",
        ...style
      }}
    />
  );
}

/** Plays a 16-frame additive effect once. */
function FxBurst({ fx, x, y, size }: { fx: FxId; x: number; y: number; size: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      if (current >= 16) window.clearInterval(timer);
      else setFrame(current);
    }, 34);
    return () => window.clearInterval(timer);
  }, []);
  return <SheetFrame frame={frame} sheet={FX_SHEET(fx)} size={size} style={{ left: x - size / 2, top: y - size / 2, mixBlendMode: "screen", zIndex: 420 }} />;
}

/** A looping projectile flying from one hex to another. */
function Projectile({ sprite, from, to, ms }: { sprite: ProjectileId; from: { x: number; y: number }; to: { x: number; y: number }; ms: number }) {
  const [frame, setFrame] = useState(0);
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setArrived(true));
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % 16), 40);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(timer);
    };
  }, []);
  const size = 72;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const at = arrived ? to : from;
  return (
    <span style={{ position: "absolute", left: at.x, top: at.y - 26, width: 0, height: 0, transition: `left ${ms}ms linear, top ${ms}ms linear`, zIndex: 430, pointerEvents: "none", mixBlendMode: "screen" }}>
      <SheetFrame frame={frame} sheet={PROJECTILE_SHEET(sprite)} size={size} style={{ left: -size / 2, top: -size / 2, transform: `rotate(${angle}rad)` }} />
    </span>
  );
}

type Clip = { group: number; key: number; loop: boolean };
type Float = { id: number; uid: string; text: string; kind: "dmg" | "heal" | "crit" | "weak" | "miss" | "status" };
type Burst = { id: number; fx: FxId; cell: number; size: number };
type Shot = { id: number; sprite: ProjectileId; from: number; to: number; ms: number };

/** Plays engine battle animations in order; the board shows the settled state once they finish. */
function useAnimator(queue: BattleAnim[][], onDone: () => void, lookup: () => BattleState | null) {
  const [cells, setCells] = useState<Record<string, number>>({});
  const [clips, setClips] = useState<Record<string, Clip>>({});
  const [floats, setFloats] = useState<Float[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [pendingDeaths, setPendingDeaths] = useState<Set<string>>(new Set());
  const [pendingProps, setPendingProps] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    if (!queue.length || running.current) return;
    const anims = queue[0]!;
    running.current = true;
    setBusy(true);
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const clip = (uid: string, group: number, loop: boolean) => setClips((current) => ({ ...current, [uid]: { group, loop, key: ++counter.current } }));
    const idle = (uid: string) =>
      setClips((current) => {
        const next = { ...current };
        delete next[uid];
        return next;
      });
    const float = (uid: string, text: string, kind: Float["kind"]) => {
      const id = ++counter.current;
      setFloats((current) => [...current, { id, uid, text, kind }]);
      at(1100, () => setFloats((current) => current.filter((entry) => entry.id !== id)));
    };
    const sound = (key: string | undefined) => {
      if (key) playSound(key);
    };
    const unitOf = (uid: string) => lookupRef.current()?.units.find((entry) => entry.uid === uid);
    // Units that start a move are drawn at the move's first cell until it plays.
    const starts: Record<string, number> = {};
    const dying = new Set<string>();
    const breaking = new Set<string>();
    for (const anim of anims) {
      if ((anim.kind === "move" || anim.kind === "knock") && starts[anim.uid] === undefined) starts[anim.uid] = anim.path[0]!;
      if (anim.kind === "death") dying.add(anim.uid);
      if (anim.kind === "prop" && anim.destroyed) breaking.add(anim.uid);
    }
    setCells(starts);
    setPendingDeaths(dying);
    setPendingProps(breaking);
    let t = 0;
    for (const anim of anims) {
      switch (anim.kind) {
        case "move":
        case "knock": {
          const steps = anim.path.slice(1);
          const step = anim.kind === "knock" ? 90 : 170;
          if (anim.kind === "move") at(t, () => clip(anim.uid, G.move, true));
          steps.forEach((cell, index) => at(t + index * step, () => setCells((current) => ({ ...current, [anim.uid]: cell }))));
          t += steps.length * step + 80;
          if (anim.kind === "move") at(t, () => idle(anim.uid));
          break;
        }
        case "attack": {
          const group = anim.anim === "shoot" ? G.shoot : anim.anim === "cast" ? G.cast : G.attack;
          at(t, () => {
            clip(anim.uid, group, false);
            sound(anim.sound);
          });
          at(t + 700, () => idle(anim.uid));
          t += 380;
          break;
        }
        case "projectile": {
          const id = ++counter.current;
          const ms = Math.min(460, Math.max(200, hexDistance(anim.from, anim.to) * 70));
          at(t, () => {
            setShots((current) => [...current, { id, sprite: anim.sprite, from: anim.from, to: anim.to, ms }]);
            sound(anim.sound);
          });
          at(t + ms + 40, () => setShots((current) => current.filter((entry) => entry.id !== id)));
          t += ms;
          break;
        }
        case "fx": {
          const id = ++counter.current;
          const size = anim.fx === "explosion" || anim.fx === "cast" ? 150 : 124;
          at(t, () => {
            setBursts((current) => [...current, { id, fx: anim.fx, cell: anim.cell, size }]);
            sound(anim.sound);
          });
          at(t + 620, () => setBursts((current) => current.filter((entry) => entry.id !== id)));
          t += anim.fx === "cast" ? 260 : 170;
          break;
        }
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
          at(t, () => {
            float(anim.uid, anim.weak && !anim.heal ? `${text} WEAK` : anim.crit ? `${text}!` : text, kind);
            if (!anim.heal && !anim.miss && anim.amount > 0 && !anim.uid.startsWith("prop-")) {
              clip(anim.uid, G.hit, false);
              at(420, () => idle(anim.uid));
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
      setPendingDeaths(new Set());
      setPendingProps(new Set());
      running.current = false;
      setBusy(false);
      doneRef.current();
    });
  }, [queue]);

  return { cells, clips, floats, bursts, shots, banner, pendingDeaths, pendingProps, busy };
}

type Mode = { kind: "idle" } | { kind: "skill"; skill: SkillDef } | { kind: "item"; item: string } | { kind: "befriend" };
const IDLE: Mode = { kind: "idle" };

export function BattleView({
  state,
  act,
  queue,
  onAnimsDone
}: {
  state: RestiaState;
  act: (action: RestiaAction) => DispatchResult;
  queue: BattleAnim[][];
  onAnimsDone: () => void;
}) {
  const battle = state.battle!;
  // Event battles inside Earth-outfit story (the Eos trial) show Bin in his Earth clothes.
  const earth = !!battle.winScene && SCENES[battle.winScene]?.outfit === "earth";
  const arenaRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  // Targeting mode and sub-menu belong to the current turn: they reset by
  // themselves when a new turn starts (also for the same unit a round later).
  const activeUid = battle.active;
  const turnKey = `${battle.round}|${activeUid}|${battle.turn.waited ? 1 : 0}`;
  const [modeState, setModeState] = useState<{ uid: string | null; mode: Mode }>({ uid: null, mode: IDLE });
  const [menuState, setMenuState] = useState<{ uid: string | null; menu: "main" | "skills" | "items" }>({ uid: null, menu: "main" });
  const mode: Mode = modeState.uid === turnKey ? modeState.mode : IDLE;
  const menu = menuState.uid === turnKey ? menuState.menu : "main";
  const setMode = useCallback((next: Mode) => setModeState({ uid: turnKey, mode: next }), [turnKey]);
  const setMenu = useCallback((next: "main" | "skills" | "items") => setMenuState({ uid: turnKey, menu: next }), [turnKey]);
  // Who queued the strike: it only fires for that same unit (not the next one, if the walk ended its turn).
  const pendingAttack = useRef<{ uid: string; target: string } | null>(null);
  const battleRef = useRef<BattleState | null>(battle);
  useEffect(() => {
    battleRef.current = state.battle;
  });
  const anim = useAnimator(queue, onAnimsDone, () => battleRef.current);
  const unit = activeUnit(battle);
  const myTurn = !!unit && unit.side === "ally" && battle.phase === "turn" && !anim.busy && !queue.length;

  useEffect(() => {
    const element = arenaRef.current;
    if (!element) return;
    // ResizeObserver reports the initial size too.
    const observer = new ResizeObserver(() => setFit(Math.min(element.clientWidth / FIELD_W, element.clientHeight / FIELD_H)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Enemy turns run automatically once the previous animation finished.
  // (Not while a boss intro scene is still being read over the board.)
  const sceneOpen = !!state.scene;
  useEffect(() => {
    if (sceneOpen || battle.phase !== "turn" || !unit || unit.side !== "enemy" || anim.busy || queue.length) return;
    const timer = window.setTimeout(() => act({ type: "bAiTurn" }), 380);
    return () => window.clearTimeout(timer);
  }, [act, anim.busy, battle.phase, queue.length, unit, battle.round, activeUid, sceneOpen]);

  // A queued "move then attack" fires after the move animation.
  useEffect(() => {
    if (!myTurn || !pendingAttack.current) return;
    const pending = pendingAttack.current;
    pendingAttack.current = null;
    if (pending.uid === activeUid) act({ type: "bAttack", target: pending.target });
  }, [act, activeUid, myTurn]);

  const reach = useMemo(
    () => (myTurn && unit && !battle.turn.moved && !battle.turn.acted ? reachable(battle, unit, battle.turn.sprinted ? SPRINT_MOVE : 0) : new Map<number, number[]>()),
    [battle, myTurn, unit]
  );

  /** Enemies and breakable props the active unit can basic-attack from where it stands. */
  const attackable = useMemo(() => {
    const map = new Map<number, string>();
    if (!myTurn || !unit || battle.turn.acted || unit.ap < 1) return map;
    for (const enemy of living(battle).filter((entry) => entry.side === "enemy")) if (!attackBlock(battle, unit, enemy)) map.set(enemy.cell, enemy.uid);
    for (const prop of battle.props) if (prop.hp > 0 && prop.kind !== "rock" && !attackBlock(battle, unit, prop)) map.set(prop.cell, prop.uid);
    return map;
  }, [battle, myTurn, unit]);

  const targetCells = useMemo(() => {
    const set = new Set<number>();
    if (!myTurn || !unit || battle.turn.acted) return set;
    if (mode.kind === "idle") {
      for (const cell of attackable.keys()) set.add(cell);
    } else if (mode.kind === "befriend") {
      for (const enemy of living(battle).filter((entry) => entry.side === "enemy" && entry.kind === "monster" && entry.tame > 0 && !entry.boss)) {
        if (hexDistance(unit.cell, enemy.cell) <= 1) set.add(enemy.cell);
      }
    } else if (mode.kind === "skill") {
      for (let cell = 0; cell < BOARD_COLS * BOARD_ROWS; cell++) {
        const result = skillTargets(state, battle, unit, mode.skill, cell);
        if (typeof result !== "string") set.add(cell);
      }
    } else if (mode.kind === "item") {
      const use = itemDef(mode.item).use;
      for (let cell = 0; cell < BOARD_COLS * BOARD_ROWS; cell++) {
        if (battle.tiles[cell] === "void") continue;
        if (use?.bomb ? hexDistance(unit.cell, cell) <= 3 : hexDistance(unit.cell, cell) <= 1 && battle.units.some((entry) => entry.cell === cell && entry.side === "ally" && !entry.gone && (use?.revivePct ? entry.hp <= 0 : entry.hp > 0))) {
          set.add(cell);
        }
      }
    }
    return set;
  }, [attackable, battle, mode, myTurn, state, unit]);

  /** Hexes the hovered aim would affect (area, line and bomb previews). */
  const areaPreview = useMemo(() => {
    const set = new Set<number>();
    if (hover === null || !unit || !myTurn || !targetCells.has(hover)) return set;
    if (mode.kind === "skill" && (mode.skill.target === "area" || mode.skill.line)) {
      const hits = skillTargets(state, battle, unit, mode.skill, hover);
      if (typeof hits !== "string") for (const cell of hits.cells) set.add(cell);
    } else if (mode.kind === "item" && itemDef(mode.item).use?.bomb) {
      const radius = itemDef(mode.item).use!.bomb!.radius;
      for (let cell = 0; cell < BOARD_COLS * BOARD_ROWS; cell++) if (hexDistance(cell, hover) <= radius) set.add(cell);
    }
    return set;
  }, [battle, hover, mode, myTurn, state, targetCells, unit]);

  const clickCell = useCallback(
    (cell: number) => {
      if (!myTurn || !unit) return;
      const occupant = unitAt(battle, cell);
      if (mode.kind === "skill") {
        if (targetCells.has(cell)) act({ type: "bSkill", skill: mode.skill.id, cell });
        return;
      }
      if (mode.kind === "item") {
        if (targetCells.has(cell)) {
          act({ type: "bItem", item: mode.item, cell });
          setMode({ kind: "idle" });
          setMenu("main");
        }
        return;
      }
      if (mode.kind === "befriend") {
        if (occupant && targetCells.has(cell)) act({ type: "bBefriend", target: occupant.uid });
        return;
      }
      const prop = propAt(battle, cell);
      const foe = occupant && occupant.side === "enemy" ? occupant : null;
      const targetUid = foe?.uid ?? (prop && prop.kind !== "rock" && prop.hp > 0 ? prop.uid : null);
      if (targetUid) {
        if (battle.turn.acted || unit.ap < 1) return;
        if (attackable.has(cell)) {
          act({ type: "bAttack", target: targetUid });
          return;
        }
        if (battle.turn.moved) return;
        // Walk to a hex it can strike from, then strike (H3-style click-to-attack).
        let best: { cell: number; length: number } | null = null;
        for (const [option, path] of reach) {
          if (!attackBlock(battle, unit, { cell }, option) && (!best || path.length < best.length)) best = { cell: option, length: path.length };
        }
        if (best) {
          pendingAttack.current = { uid: unit.uid, target: targetUid };
          // A refused move leaves nothing to follow up.
          if (act({ type: "bMove", cell: best.cell }).state.battle === battle) pendingAttack.current = null;
        }
        return;
      }
      if (reach.has(cell)) act({ type: "bMove", cell });
    },
    [act, attackable, battle, mode, myTurn, reach, setMenu, setMode, targetCells, unit]
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!myTurn) return;
      if (event.key === "Escape") setMode({ kind: "idle" });
      if (event.key === "d" || event.key === "D") act({ type: "bDefend" });
      if (event.key === "w" || event.key === "W") act({ type: "bWait" });
      if (event.key === "Enter") act({ type: "bEndTurn" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, myTurn, setMode]);

  const hoverUnit = hover !== null ? battle.units.find((entry) => entry.cell === hover && !entry.gone && (entry.hp > 0 || anim.pendingDeaths.has(entry.uid))) : undefined;
  const hoverProp = hover !== null ? battle.props.find((prop) => prop.cell === hover && (prop.kind === "rock" || prop.hp > 0)) : undefined;
  const hoverTile = hover !== null ? battle.tiles[hover] ?? null : null;
  const infoUnit = hoverUnit ?? (hoverProp || hoverTile ? null : unit) ?? null;
  const battleItems = Object.keys(state.inventory).filter((id) => {
    const use = ITEMS[id]?.use;
    return !!use && (use.hp || use.hpPct || use.mp || use.mpPct || use.revivePct || use.cure || use.bomb || use.escape);
  });

  const order = [battle.active, ...battle.queue].filter((uid): uid is string => !!uid).slice(0, 12);
  const challenge = battle.challenge;
  const visibleProps = battle.props.filter((prop) => prop.kind === "rock" || prop.hp > 0 || anim.pendingProps.has(prop.uid));

  return (
    <div className={s.battle}>
      <div className={s.battleTop}>
        <b>Round {battle.round}</b>
        {battle.weather !== "clear" ? <span className={s.battleChip} title={WEATHER_TEXT[battle.weather]}>{WEATHER_TEXT[battle.weather].split(":")[0]}</span> : null}
        {challenge ? (
          <span className={s.battleChip} style={{ borderColor: challenge.failed ? "#c0463b" : "#ffd36a" }} title="Jester System audience challenge">
            🎭 {challenge.text}
            {challenge.id === "fast" ? "" : challenge.id === "untouched" ? (challenge.failed ? " ✗" : "") : ` ${Math.min(challenge.progress, challenge.target)}/${challenge.target}`} (+{challenge.jp} JP)
          </span>
        ) : null}
        {order.map((uid, index) => {
          const entry = battle.units.find((candidate) => candidate.uid === uid);
          if (!entry || entry.hp <= 0 || entry.gone) return null;
          return (
            <span className={`${s.turnChip} ${entry.side === "ally" ? s.turnChipAlly : s.turnChipEnemy} ${index === 0 ? s.turnChipActive : ""}`} key={`${uid}-${index}`} title={entry.name}>
              <Portrait earth={earth} unit={entry} size={38} />
            </span>
          );
        })}
      </div>
      <div className={s.battleArena} ref={arenaRef}>
        <div className={s.battleField} style={{ width: FIELD_W, height: FIELD_H, transform: `scale(${fit})`, backgroundImage: `url(${BATTLEFIELD(battle.backdrop)})` }}>
          <svg className={s.hexLayer} height={FIELD_H} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} width={FIELD_W}>
            {Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, cell) => {
              const tile = battle.tiles[cell];
              if (tile === "void") return null;
              const high = tile === "high";
              const classes = [s.hexCell];
              if (tile && TILE_CLASS[tile]) classes.push(TILE_CLASS[tile]!);
              if (high) classes.push(s.tileHigh);
              if (propAt(battle, cell)) classes.push(s.hexBlocked);
              if (areaPreview.has(cell)) classes.push(s.hexArea);
              else if (targetCells.has(cell)) classes.push(s.hexTarget);
              else if (mode.kind === "idle" && reach.has(cell)) classes.push(s.hexMove);
              if (battle.warnings.includes(cell)) classes.push(s.hexWarning);
              if (unit && cell === unit.cell && battle.phase === "turn") classes.push(s.hexActive);
              return (
                <g key={cell}>
                  {high ? <polygon className={s.hexCliff} points={sidePoints(cell)} /> : null}
                  <polygon
                    className={classes.join(" ")}
                    onClick={() => clickCell(cell)}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() => setHover((current) => (current === cell ? null : current))}
                    points={hexPoints(cell, high ? LIFT : 0)}
                  />
                </g>
              );
            })}
          </svg>
          {Object.entries(battle.tiles).map(([key, tile]) => {
            const cell = Number(key);
            const frame = tileFrame(tile, battle.backdrop);
            if (frame === null) return null;
            const c = center(cell);
            const size = tile === "cover" ? 58 : 50;
            return <SheetFrame frame={frame} key={`t${cell}`} sheet={PROPS_SHEET} size={size} style={{ left: c.x - size / 2, top: c.y - size * 0.62, zIndex: 4 + colRow(cell).row * 10, opacity: 0.95 }} />;
          })}
          {visibleProps.map((prop) => {
            const c = center(prop.cell);
            const size = prop.kind === "barrel" ? 54 : 66;
            const lift = heightOf(battle, prop.cell) ? LIFT : 0;
            return (
              <span className={anim.pendingProps.has(prop.uid) && prop.hp <= 0 ? s.propBreaking : undefined} key={prop.uid} style={{ position: "absolute", left: 0, top: 0 }}>
                <SheetFrame frame={propFrame(prop.kind, battle.backdrop)} sheet={PROPS_SHEET} size={size} style={{ left: c.x - size / 2, top: c.y - size * 0.8 - lift, zIndex: 6 + colRow(prop.cell).row * 10 }} />
                {prop.kind !== "rock" && prop.hp > 0 && prop.hp < prop.maxHp ? (
                  <span className={s.unitBars} style={{ left: c.x, top: c.y + FOOT - 2, zIndex: 300 }}>
                    <span className={s.barTrack}>
                      <span className={`${s.barFill} ${s.barHp}`} style={{ display: "block", width: `${(100 * prop.hp) / Math.max(1, prop.maxHp)}%` }} />
                    </span>
                  </span>
                ) : null}
              </span>
            );
          })}
          {battle.warnings.map((cell) => {
            const c = center(cell);
            return (
              <span className={s.warnMark} key={`w${cell}`} style={{ left: c.x, top: c.y - 18 }}>
                !
              </span>
            );
          })}
          {[...battle.units]
            .sort((a, b) => (anim.cells[a.uid] ?? a.cell) - (anim.cells[b.uid] ?? b.cell))
            .map((entry) => {
              const cell = anim.cells[entry.uid] ?? entry.cell;
              return (
                <UnitSprite
                  active={entry.uid === battle.active && battle.phase === "turn"}
                  cell={cell}
                  clip={anim.clips[entry.uid]}
                  dead={entry.hp <= 0 && !anim.pendingDeaths.has(entry.uid)}
                  key={entry.uid}
                  lift={heightOf(battle, cell) ? LIFT : 0}
                  unit={entry}
                />
              );
            })}
          {anim.shots.map((shot) => {
            const from = center(shot.from);
            const to = center(shot.to);
            return <Projectile from={from} key={shot.id} ms={shot.ms} sprite={shot.sprite} to={to} />;
          })}
          {anim.bursts.map((burst) => {
            const c = center(burst.cell);
            return <FxBurst fx={burst.fx} key={burst.id} size={burst.size} x={c.x} y={c.y - (burst.fx === "cast" ? 0 : 22)} />;
          })}
          {anim.floats.map((entry) => {
            const target = battle.units.find((candidate) => candidate.uid === entry.uid);
            const prop = target ? undefined : battle.props.find((candidate) => candidate.uid === entry.uid);
            if (!target && !prop) return null;
            const c = center(target ? anim.cells[entry.uid] ?? target.cell : prop!.cell);
            const cls = entry.kind === "heal" ? s.floatHeal : entry.kind === "crit" ? s.floatCrit : entry.kind === "weak" ? s.floatWeak : entry.kind === "miss" ? s.floatMiss : entry.kind === "status" ? s.floatStatus : "";
            return (
              <span className={`${s.floatNum} ${cls}`} key={entry.id} style={{ left: c.x, top: c.y - 70, zIndex: 500 }}>
                {entry.text}
              </span>
            );
          })}
          {anim.banner ? (
            <div className={s.battleBanner} key={anim.banner.id}>
              {anim.banner.text}
            </div>
          ) : null}
        </div>
        {battle.phase !== "turn" && !anim.busy && !queue.length ? <Results act={act} state={state} /> : null}
      </div>
      <div className={s.battleBottom}>
        <div className={s.battleInfo}>
          {infoUnit ? (
            <UnitInfo attacker={unit && unit.side === "ally" && infoUnit.side === "enemy" ? unit : null} state={state} unit={infoUnit} />
          ) : hoverProp ? (
            <div>
              <b>{PROP_NAMES[hoverProp.kind]}</b>
              {hoverProp.kind === "rock" ? " · blocks movement and line of sight" : ` · HP ${hoverProp.hp}/${hoverProp.maxHp}`}
              <div style={{ opacity: 0.85 }}>
                {hoverProp.kind === "barrel"
                  ? "Explodes when hit (fire damage around it). Fire sets it off too."
                  : hoverProp.kind === "totem"
                    ? "Enemies within 3 hexes: DEF and RES +20%. Break it!"
                    : hoverProp.kind === "pillar"
                      ? "Blocks line of sight until broken."
                      : hoverProp.kind === "crates"
                        ? "Blocks the way; arrows fly over it. Can be smashed."
                        : ""}
              </div>
            </div>
          ) : hoverTile ? (
            <div>
              <b>{TILE_NAMES[hoverTile]}</b>
              <div style={{ opacity: 0.85 }}>{TILE_HELP[hoverTile]}</div>
            </div>
          ) : null}
          <div className={s.battleLog}>
            {battle.log.slice(-4).map((line, index) => (
              <div key={`${index}-${line}`}>{line}</div>
            ))}
          </div>
        </div>
        <div className={s.battleMenu}>
          {!myTurn ? (
            <span className={s.muted} style={{ color: "#e9d3a4" }}>
              {battle.phase === "turn" ? (unit?.side === "enemy" ? `${unit.name} is acting…` : "…") : ""}
            </span>
          ) : menu === "skills" ? (
            <div className={s.skillList}>
              {mode.kind === "skill" && !targetCells.size ? (
                <span style={{ gridColumn: "1 / -1", color: "#ffcf8a" }}>
                  No valid target for {mode.skill.name}. {battle.turn.moved ? "Pick another action." : "Go Back and move first (range and line of sight matter)."}
                </span>
              ) : null}
              {unit!.skills.map((id) => {
                const skill = SKILLS[id]!;
                const active = mode.kind === "skill" && mode.skill.id === id;
                const block = battle.turn.acted ? "Already acted." : skillBlock(battle, unit!, skill);
                return (
                  <button
                    className={active ? s.skillBtnActive : s.skillBtn}
                    disabled={!!block}
                    key={id}
                    onClick={() => {
                      if (skill.target === "self" || skill.target === "allAllies" || skill.target === "allEnemies" || (skill.target === "area" && skill.range === 0)) {
                        act({ type: "bSkill", skill: id, cell: unit!.cell });
                      } else setMode({ kind: "skill", skill });
                    }}
                    title={block ? `${skill.desc} — ${block}` : skill.desc}
                    type="button"
                  >
                    <b>{skill.name}</b>{" "}
                    <span className={s.apTag}>{skillAp(skill)} AP</span> <span style={{ opacity: 0.8 }}>{skillMp(unit!, skill)} MP</span>
                    <br />
                    <span style={{ fontSize: 11, opacity: 0.8 }}>{skill.desc}</span>
                  </button>
                );
              })}
              <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => { setMenu("main"); setMode({ kind: "idle" }); }} type="button">
                ◀ Back
              </button>
            </div>
          ) : menu === "items" ? (
            <div className={s.skillList}>
              <span style={{ gridColumn: "1 / -1", opacity: 0.85 }}>Items are a quick action: 1 AP, one per turn, and the turn goes on.</span>
              {battleItems.length ? null : <span className={s.muted}>No usable items.</span>}
              {battleItems.map((id) => (
                <button
                  className={mode.kind === "item" && mode.item === id ? s.skillBtnActive : s.skillBtn}
                  disabled={battle.turn.acted || battle.turn.item || (!itemDef(id).use?.escape && unit!.ap < 1)}
                  key={id}
                  onClick={() => (itemDef(id).use?.escape ? act({ type: "bItem", item: id, cell: unit!.cell }) : setMode({ kind: "item", item: id }))}
                  title={itemDef(id).desc}
                  type="button"
                >
                  <b>{itemDef(id).name}</b> x{count(state, id)}
                  <br />
                  <span style={{ fontSize: 11, opacity: 0.8 }}>{itemDef(id).desc}</span>
                </button>
              ))}
              <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => { setMenu("main"); setMode({ kind: "idle" }); }} type="button">
                ◀ Back
              </button>
            </div>
          ) : (
            <>
              <span style={{ width: "100%", color: "#ffe6a8" }}>
                <b>{unit!.name}</b> <ApPips ap={unit!.ap} />{" "}
                {battle.turn.moved ? "moved" : moveRange(unit!) === 0 ? "rooted" : `move ${moveRange(unit!) + (battle.turn.sprinted ? SPRINT_MOVE : 0)} (blue)`}, {battle.turn.acted ? "acted" : "attack 1 AP (red)"}
                {mode.kind === "befriend" ? " · pick an adjacent monster to befriend" : ""}
              </span>
              <button className={`${s.btn} ${s.btnSmall}`} disabled={battle.turn.acted || !unit!.skills.length} onClick={() => setMenu("skills")} type="button">
                Skills
              </button>
              <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.acted || battle.turn.item} onClick={() => setMenu("items")} type="button">
                Items
              </button>
              <button
                className={`${s.btnGhost} ${s.btnSmall}`}
                disabled={battle.turn.moved || battle.turn.acted || battle.turn.sprinted || unit!.ap < 1 || moveRange(unit!) === 0}
                onClick={() => act({ type: "bSprint" })}
                title={`Spend 1 AP: +${SPRINT_MOVE} move this turn`}
                type="button"
              >
                Sprint
              </button>
              <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.acted} onClick={() => act({ type: "bDefend" })} title={`D · DEF/RES x1.5, +10% MP, +${DEFEND_CARRY} AP next turn`} type="button">
                Defend
              </button>
              <button
                className={`${s.btnGhost} ${s.btnSmall}`}
                disabled={battle.turn.moved || battle.turn.acted || battle.turn.waited || battle.turn.sprinted || battle.turn.item || !battle.queue.length}
                onClick={() => act({ type: "bWait" })}
                title="W · act later this round"
                type="button"
              >
                Wait
              </button>
              {state.town.levels.barn >= 1 ? (
                <button className={mode.kind === "befriend" ? `${s.btn} ${s.btnSmall}` : `${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.acted || unit!.ap < 1} onClick={() => setMode(mode.kind === "befriend" ? { kind: "idle" } : { kind: "befriend" })} type="button">
                  Befriend
                </button>
              ) : null}
              {rushReady(battle) ? (
                <button className={`${s.btn} ${s.btnSmall}`} disabled={battle.turn.acted || unit!.ap < 1} onClick={() => act({ type: "bRush" })} type="button">
                  ⚡ RUSH!
                </button>
              ) : null}
              {battle.canFlee ? (
                <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.acted} onClick={() => act({ type: "bFlee" })} title={`${Math.round(fleeChance(state, battle) * 100)}%`} type="button">
                  Flee
                </button>
              ) : null}
              <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "bEndTurn" })} title={`Enter · ending without acting carries +${CHARGE_CARRY} AP`} type="button">
                {battle.turn.acted ? "End turn" : `Charge (+${CHARGE_CARRY} AP)`}
              </button>
              {mode.kind !== "idle" ? (
                <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => setMode({ kind: "idle" })} type="button">
                  Cancel
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ApPips({ ap }: { ap: number }) {
  return (
    <span className={s.apPips} title={`${ap} AP`}>
      {Array.from({ length: Math.max(ap, 3) }, (_, index) => (
        <span className={index < ap ? s.apPipOn : s.apPip} key={index} />
      ))}
    </span>
  );
}

function Portrait({ unit, size, earth = false }: { unit: BattleUnit; size: number; earth?: boolean }) {
  if (unit.kind === "member" || unit.ref === "dain") {
    const src = unit.ref === "bin" ? tachieFor("bin", null, earth ? "earth" : undefined) : TACHIE[unit.ref as keyof typeof TACHIE];
    return <span className={s.portrait} style={{ width: size, height: size, border: "none", backgroundImage: src ? `url(${A(src)})` : undefined }} />;
  }
  return <SpriteStill height={size} slug={unit.sprite} />;
}

function UnitSprite({ unit, cell, clip, dead, active, lift }: { unit: BattleUnit; cell: number; clip?: Clip; dead: boolean; active: boolean; lift: number }) {
  if (unit.gone) return null;
  const atlas: Atlas | null = atlasFor(unit.sprite);
  const c = center(cell);
  const y = c.y - lift;
  const flip = unit.facing === "left";
  const scale = unit.scale;
  const group = dead ? G.death : clip ? clip.group : G.standing;
  const loop = dead ? false : clip ? clip.loop : true;
  const z = 10 + Math.floor(cell / BOARD_COLS) * 10 + (dead ? 0 : 5);
  if (!atlas) {
    return (
      <span className={s.unit} style={{ left: c.x - 20, top: y - 40, zIndex: z }}>
        <Portrait size={40} unit={unit} />
      </span>
    );
  }
  const left = c.x - (flip ? atlas.frameWidth - atlas.anchorX : atlas.anchorX) * scale;
  const top = y + FOOT - atlas.anchorY * scale;
  const maxHp = unit.stats.maxHp;
  const badge = unit.down ? "DOWN" : unit.defending ? "Guard" : unit.statuses[0] ? STATUS_NAMES[unit.statuses[0].id] + (unit.statuses.length > 1 ? ` +${unit.statuses.length - 1}` : "") : null;
  return (
    <>
      <span className={s.unitShadow} style={{ left: c.x - 20 * scale, top: y + FOOT - 6, width: 40 * scale, height: 12, zIndex: z - 1 }} />
      <span className={s.unit} style={{ left, top, zIndex: z, transition: "left 0.17s linear, top 0.17s linear", filter: active ? "drop-shadow(0 0 4px #ffd36a)" : unit.shield > 0 && !dead ? "drop-shadow(0 0 3px #6fe3ff)" : undefined }}>
        <SpriteClip atlas={atlas} clipKey={dead ? "dead" : clip?.key ?? "idle"} flip={flip} fps={dead ? 12 : 10} group={group} loop={loop} scale={scale} />
      </span>
      {!dead ? (
        <span className={s.unitBars} style={{ left: c.x, top: y + FOOT + 2, zIndex: 300 }}>
          <span className={s.barTrack}>
            <span className={unit.side === "ally" ? s.barFill : `${s.barFill} ${s.barHp}`} style={{ display: "block", width: `${(100 * unit.hp) / Math.max(1, maxHp)}%` }} />
          </span>
          {unit.shield > 0 ? (
            <span className={s.barTrack}>
              <span className={`${s.barFill} ${s.barShield}`} style={{ display: "block", width: `${Math.min(100, (100 * unit.shield) / Math.max(1, maxHp))}%` }} />
            </span>
          ) : null}
          {unit.side === "ally" && unit.stats.maxMp > 0 ? (
            <span className={s.barTrack}>
              <span className={`${s.barFill} ${s.barMp}`} style={{ display: "block", width: `${(100 * unit.mp) / Math.max(1, unit.stats.maxMp)}%` }} />
            </span>
          ) : null}
        </span>
      ) : null}
      {!dead && badge ? (
        <span className={`${s.unitBadge} ${unit.down ? s.badgeDown : s.badgeStatus}`} style={{ left: c.x, top: y - 64 * scale, zIndex: 310 }}>
          {badge}
        </span>
      ) : null}
    </>
  );
}

function UnitInfo({ state, unit, attacker }: { state: RestiaState; unit: BattleUnit; attacker: BattleUnit | null }) {
  const battle = state.battle!;
  const analyzed = unit.side === "ally" || unit.kind !== "monster" || !!state.bestiary[unit.ref]?.analyzed;
  const weak = Object.entries(unit.resist).filter(([, mult]) => (mult ?? 1) > 1).map(([element]) => element);
  const resist = Object.entries(unit.resist).filter(([, mult]) => (mult ?? 1) < 1).map(([element]) => element);
  const member = unit.kind === "member" ? state.members[unit.ref as keyof typeof state.members] : undefined;
  const title = unit.kind === "member" ? `${CHARACTERS[unit.ref as keyof typeof CHARACTERS]?.title}${member ? ` · ${JOBS[member.job]?.name ?? ""} Lv ${member.jobs[member.job]?.level ?? 1}` : ""}` : unit.kind === "monster" ? MONSTERS[unit.ref]?.desc : "";
  const distance = attacker ? hexDistance(attacker.cell, unit.cell) : 0;
  const block = attacker && unit.hp > 0 ? attackBlock(battle, attacker, unit) : null;
  const preview =
    attacker && unit.hp > 0 ? Math.round(expectedDamage(state, attacker, unit, 1, attacker.element, !attacker.magic, attacker.range > 1 && distance === 1, attacker.range > 1 && distance > 1)) : null;
  const passives = unit.passives.map((id) => PASSIVES[id]).filter((def) => !!def);
  return (
    <div>
      <b>{unit.name}</b> Lv {unit.level} · HP {unit.hp}/{unit.stats.maxHp}
      {unit.shield > 0 ? ` (+${unit.shield} shield)` : ""} · MP {unit.mp}/{unit.stats.maxMp}
      {unit.uid === battle.active ? ` · AP ${unit.ap}` : unit.apCarry > 0 ? ` · +${unit.apCarry} AP next turn` : ""}
      {unit.boss ? " · BOSS" : ""}
      <div style={{ opacity: 0.85 }}>
        ATK {Math.round(eff(state, unit, "atk"))} DEF {Math.round(eff(state, unit, "def"))} MAG {Math.round(eff(state, unit, "mag"))} RES {Math.round(eff(state, unit, "res"))} SPD {Math.round(eff(state, unit, "spd"))} · Move {moveRange(unit)} · Range {unit.range}
        {heightOf(battle, unit.cell) ? " · on high ground" : battle.tiles[unit.cell] === "cover" ? " · in cover" : ""}
      </div>
      <div>
        {analyzed ? (
          <>
            Weak: <span className={s.weakTag}>{weak.join(", ") || "—"}</span> · Resists: {resist.join(", ") || "—"}
          </>
        ) : (
          <span style={{ opacity: 0.75 }}>Weaknesses unknown — use Bin&apos;s Analyze.</span>
        )}
        {preview !== null ? (block ? ` · ${block}` : ` · Attack ≈ ${preview} dmg`) : ""}
        {unit.side === "enemy" && unit.kind === "monster" && unit.tame > 0 && !unit.boss && state.town.levels.barn >= 1 ? ` · Befriend ${Math.round(befriendChance(state, unit) * 100)}%` : ""}
      </div>
      {unit.statuses.length ? <div style={{ fontSize: 12 }}>Status: {unit.statuses.map((status) => `${STATUS_NAMES[status.id]} (${status.turns})`).join(", ")}</div> : null}
      {analyzed && passives.length ? (
        <div style={{ fontSize: 12, opacity: 0.85 }} title={passives.map((def) => `${def.name}: ${def.desc}`).join("\n")}>
          Passives: {passives.map((def) => def.name).join(", ")}
        </div>
      ) : null}
      {title ? <div style={{ opacity: 0.7, fontSize: 12 }}>{title}</div> : null}
    </div>
  );
}

function Results({ state, act }: { state: RestiaState; act: (action: RestiaAction) => DispatchResult }) {
  const battle = state.battle!;
  const rewards = battle.rewards;
  const title = battle.phase === "victory" ? "Victory!" : battle.phase === "fled" ? "Escaped" : battle.soft ? "Defeated…" : "Wiped out…";
  return (
    <div className={s.panelBackdrop} style={{ position: "absolute" }}>
      <div className={s.resultBox}>
        <h2 className={s.resultTitle}>{title}</h2>
        {rewards ? (
          <div className={s.list} style={{ textAlign: "left" }}>
            <div>
              EXP +{rewards.exp} · Gold +{rewards.gold}
            </div>
            {rewards.expNote ? <div style={{ opacity: 0.8, fontSize: 12 }}>{rewards.expNote}</div> : null}
            {rewards.challenge ? (
              <div className={rewards.challenge.ok ? s.good : undefined}>
                🎭 {rewards.challenge.text}: {rewards.challenge.ok ? `the audience loved it (+${rewards.challenge.jp} JP)` : "missed"}
              </div>
            ) : null}
            {Object.keys(rewards.items).length ? <div>Loot: {Object.entries(rewards.items).map(([id, n]) => `${itemDef(id).name} x${n}`).join(", ")}</div> : null}
            {rewards.befriended.length ? <div className={s.good}>Befriended: {rewards.befriended.join(", ")} (sent to the barn)</div> : null}
            {rewards.levelUps.map((entry) => (
              <div className={s.good} key={`${entry.who}-${entry.level}`}>
                {entry.who} reached level {entry.level}!
              </div>
            ))}
            {rewards.jobUps.map((entry) => (
              <div className={s.good} key={`${entry.who}-${entry.job}`}>
                {entry.who}: {JOBS[entry.job]?.name ?? entry.job} Lv {entry.level}
              </div>
            ))}
          </div>
        ) : battle.phase === "defeat" ? (
          <p>{battle.soft ? "The match is over. You can try again later." : "Everything goes dark… you'll wake up at home, a little poorer."}</p>
        ) : (
          <p>You got away safely.</p>
        )}
        <button className={s.btn} onClick={() => act({ type: "bFinish" })} type="button">
          Continue
        </button>
      </div>
    </div>
  );
}
