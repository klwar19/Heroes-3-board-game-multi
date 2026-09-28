"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BattleAnim, BattleUnit, DispatchResult, RestiaAction, RestiaState, SkillDef } from "../engine/types";
import { SKILLS } from "../data/skills";
import { ITEMS, itemDef } from "../data/items";
import { MONSTERS } from "../data/monsters";
import { CHARACTERS } from "../data/characters";
import {
  activeUnit,
  befriendChance,
  eff,
  expectedDamage,
  fleeChance,
  living,
  reachable,
  rushReady,
  skillTargets,
  unitAt,
  STATUS_NAMES
} from "../engine/battle";
import { BOARD_COLS, BOARD_ROWS, colRow, hexDistance } from "../engine/hex";
import { count } from "../engine/core";
import { A, BATTLEFIELD, OBSTACLE, TACHIE } from "./assets";
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

function center(cell: number): { x: number; y: number } {
  const { col, row } = colRow(cell);
  return { x: LEFT + col * HEX_W + (row & 1 ? HEX_W / 2 : 0) + HEX_W / 2, y: TOP + row * ROW_STEP + HEX_H / 2 };
}

function hexPoints(cell: number): string {
  const { x, y } = center(cell);
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

type Clip = { group: number; key: number; loop: boolean };
type Float = { id: number; uid: string; text: string; kind: "dmg" | "heal" | "crit" | "weak" | "miss" | "status" };
type Flash = { id: number; cell: number; radius: number; color: string };

const ELEMENT_COLOR: Record<string, string> = {
  phys: "rgba(255,255,255,0.6)",
  fire: "rgba(255,110,40,0.7)",
  ice: "rgba(120,200,255,0.7)",
  wind: "rgba(140,255,160,0.7)",
  earth: "rgba(200,150,80,0.7)",
  light: "rgba(255,240,140,0.8)",
  dark: "rgba(150,80,220,0.7)"
};

/** Plays engine battle animations in order; the board shows the settled state once they finish. */
function useAnimator(queue: BattleAnim[][], onDone: () => void) {
  const [cells, setCells] = useState<Record<string, number>>({});
  const [clips, setClips] = useState<Record<string, Clip>>({});
  const [floats, setFloats] = useState<Float[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [pendingDeaths, setPendingDeaths] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);
  const running = useRef(false);
  const timers = useRef<number[]>([]);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  // Timers belong to the animator, not to a render: only unmounting cancels them.
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    if (!queue.length || running.current) return;
    const anims = queue[0]!;
    running.current = true;
    setBusy(true);
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const clip = (uid: string, group: number, loop: boolean) =>
      setClips((current) => ({ ...current, [uid]: { group, loop, key: ++counter.current } }));
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
    // Units that start a move are drawn at the move's first cell until it plays.
    const starts: Record<string, number> = {};
    const dying = new Set<string>();
    for (const anim of anims) {
      if (anim.kind === "move" && starts[anim.uid] === undefined) starts[anim.uid] = anim.path[0]!;
      if (anim.kind === "death") dying.add(anim.uid);
    }
    setCells(starts);
    setPendingDeaths(dying);
    let t = 0;
    for (const anim of anims) {
      switch (anim.kind) {
        case "move": {
          const steps = anim.path.slice(1);
          at(t, () => clip(anim.uid, G.move, true));
          steps.forEach((cell, index) => at(t + index * 170, () => setCells((current) => ({ ...current, [anim.uid]: cell }))));
          t += steps.length * 170 + 80;
          at(t, () => idle(anim.uid));
          break;
        }
        case "attack": {
          const group = anim.anim === "shoot" ? G.shoot : anim.anim === "cast" ? G.cast : G.attack;
          at(t, () => clip(anim.uid, group, false));
          at(t + 700, () => idle(anim.uid));
          t += 380;
          break;
        }
        case "hit": {
          const text = anim.miss ? "Miss" : anim.heal ? `+${anim.amount}` : anim.resist && anim.amount === 0 ? "Immune" : `${anim.amount}`;
          const kind: Float["kind"] = anim.miss ? "miss" : anim.heal ? "heal" : anim.crit ? "crit" : anim.weak ? "weak" : "dmg";
          at(t, () => {
            float(anim.uid, anim.weak && !anim.heal ? `${text} WEAK` : anim.crit ? `${text}!` : text, kind);
            if (!anim.heal && !anim.miss && anim.amount > 0) {
              clip(anim.uid, G.hit, false);
              at(420, () => idle(anim.uid));
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
        case "area": {
          const id = ++counter.current;
          at(t, () => setFlashes((current) => [...current, { id, cell: anim.cell, radius: anim.radius, color: ELEMENT_COLOR[anim.element] ?? ELEMENT_COLOR.phys! }]));
          at(t + 650, () => setFlashes((current) => current.filter((entry) => entry.id !== id)));
          t += 80;
          break;
        }
      }
    }
    at(t + 450, () => {
      timers.current = [];
      setCells({});
      setPendingDeaths(new Set());
      running.current = false;
      setBusy(false);
      doneRef.current();
    });
  }, [queue]);

  return { cells, clips, floats, flashes, pendingDeaths, busy };
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
  const pendingAttack = useRef<string | null>(null);
  const anim = useAnimator(queue, onAnimsDone);
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
    const target = pendingAttack.current;
    pendingAttack.current = null;
    act({ type: "bAttack", target });
  }, [act, myTurn]);

  const reach = useMemo(() => (myTurn && unit && !battle.turn.moved && !battle.turn.acted ? reachable(battle, unit) : new Map<number, number[]>()), [battle, myTurn, unit]);

  const targetCells = useMemo(() => {
    const set = new Set<number>();
    if (!myTurn || !unit || battle.turn.acted) return set;
    if (mode.kind === "idle") {
      for (const enemy of living(battle).filter((entry) => entry.side === "enemy")) {
        if (hexDistance(unit.cell, enemy.cell) <= unit.range) set.add(enemy.cell);
      }
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
        if (use?.bomb ? hexDistance(unit.cell, cell) <= 3 : hexDistance(unit.cell, cell) <= 1 && battle.units.some((entry) => entry.cell === cell && entry.side === "ally" && !entry.gone && (use?.revivePct ? entry.hp <= 0 : entry.hp > 0))) {
          set.add(cell);
        }
      }
    }
    return set;
  }, [battle, mode, myTurn, state, unit]);

  const areaPreview = useMemo(() => {
    const set = new Set<number>();
    if (hover === null || !unit || !myTurn) return set;
    const radius = mode.kind === "skill" && mode.skill.target === "area" ? mode.skill.radius ?? 0 : mode.kind === "item" && itemDef(mode.item).use?.bomb ? itemDef(mode.item).use!.bomb!.radius : -1;
    if (radius < 0 || !targetCells.has(hover)) return set;
    const centerCell = mode.kind === "skill" && mode.skill.range === 0 ? unit.cell : hover;
    for (let cell = 0; cell < BOARD_COLS * BOARD_ROWS; cell++) if (hexDistance(cell, centerCell) <= radius) set.add(cell);
    return set;
  }, [hover, mode, myTurn, targetCells, unit]);

  const clickCell = useCallback(
    (cell: number) => {
      if (!myTurn || !unit) return;
      const occupant = unitAt(battle, cell);
      if (mode.kind === "skill") {
        if (targetCells.has(cell)) act({ type: "bSkill", skill: mode.skill.id, cell });
        return;
      }
      if (mode.kind === "item") {
        if (targetCells.has(cell)) act({ type: "bItem", item: mode.item, cell });
        return;
      }
      if (mode.kind === "befriend") {
        if (occupant && targetCells.has(cell)) act({ type: "bBefriend", target: occupant.uid });
        return;
      }
      if (occupant && occupant.side === "enemy") {
        if (battle.turn.acted) return;
        if (hexDistance(unit.cell, cell) <= unit.range) {
          act({ type: "bAttack", target: occupant.uid });
          return;
        }
        if (battle.turn.moved) return;
        // Walk into range, then strike (H3-style click-to-attack).
        let best: { cell: number; length: number } | null = null;
        for (const [option, path] of reach) {
          if (hexDistance(option, cell) <= unit.range && (!best || path.length < best.length)) best = { cell: option, length: path.length };
        }
        if (best) {
          pendingAttack.current = occupant.uid;
          act({ type: "bMove", cell: best.cell });
        }
        return;
      }
      if (reach.has(cell)) act({ type: "bMove", cell });
    },
    [act, battle, mode, myTurn, reach, targetCells, unit]
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
  const infoUnit = hoverUnit ?? unit ?? null;
  const battleItems = Object.keys(state.inventory).filter((id) => {
    const use = ITEMS[id]?.use;
    return !!use && (use.hp || use.hpPct || use.mp || use.mpPct || use.revivePct || use.cure || use.bomb || use.escape);
  });

  const order = [battle.active, ...battle.queue].filter((uid): uid is string => !!uid).slice(0, 12);

  return (
    <div className={s.battle}>
      <div className={s.battleTop}>
        <b>Round {battle.round}</b>
        {order.map((uid, index) => {
          const entry = battle.units.find((candidate) => candidate.uid === uid);
          if (!entry || entry.hp <= 0 || entry.gone) return null;
          return (
            <span
              className={`${s.turnChip} ${entry.side === "ally" ? s.turnChipAlly : s.turnChipEnemy} ${index === 0 ? s.turnChipActive : ""}`}
              key={`${uid}-${index}`}
              title={entry.name}
            >
              <Portrait unit={entry} size={38} />
            </span>
          );
        })}
      </div>
      <div className={s.battleArena} ref={arenaRef}>
        <div className={s.battleField} style={{ width: FIELD_W, height: FIELD_H, transform: `scale(${fit})`, backgroundImage: `url(${BATTLEFIELD(battle.backdrop)})` }}>
          <svg className={s.hexLayer} height={FIELD_H} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} width={FIELD_W}>
            {Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, cell) => {
              const classes = [s.hexCell];
              if (battle.blocked.includes(cell)) classes.push(s.hexBlocked);
              else if (areaPreview.has(cell)) classes.push(s.hexArea);
              else if (targetCells.has(cell)) classes.push(s.hexTarget);
              else if (mode.kind === "idle" && reach.has(cell)) classes.push(s.hexMove);
              if (unit && cell === unit.cell && battle.phase === "turn") classes.push(s.hexActive);
              return (
                <polygon
                  className={classes.join(" ")}
                  key={cell}
                  onClick={() => clickCell(cell)}
                  onMouseEnter={() => setHover(cell)}
                  onMouseLeave={() => setHover((current) => (current === cell ? null : current))}
                  points={hexPoints(cell)}
                />
              );
            })}
          </svg>
          {battle.blocked.map((cell) => {
            const c = center(cell);
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" draggable={false} key={`o${cell}`} src={OBSTACLE} style={{ position: "absolute", left: c.x - 30, top: c.y - 34, width: 60, pointerEvents: "none", zIndex: 5 + Math.floor(cell / BOARD_COLS) * 10 }} />
            );
          })}
          {[...battle.units]
            .sort((a, b) => (anim.cells[a.uid] ?? a.cell) - (anim.cells[b.uid] ?? b.cell))
            .map((entry) => (
              <UnitSprite
                active={entry.uid === battle.active && battle.phase === "turn"}
                cell={anim.cells[entry.uid] ?? entry.cell}
                clip={anim.clips[entry.uid]}
                dead={entry.hp <= 0 && !anim.pendingDeaths.has(entry.uid)}
                key={entry.uid}
                unit={entry}
              />
            ))}
          {anim.flashes.map((flash) => {
            const c = center(flash.cell);
            const size = (flash.radius * 2 + 1) * HEX_W * 1.1;
            return <span className={s.areaFlash} key={flash.id} style={{ left: c.x, top: c.y, width: size, height: size * 0.8, background: `radial-gradient(${flash.color}, transparent 70%)`, zIndex: 400 }} />;
          })}
          {anim.floats.map((entry) => {
            const target = battle.units.find((candidate) => candidate.uid === entry.uid);
            if (!target) return null;
            const c = center(anim.cells[entry.uid] ?? target.cell);
            const cls = entry.kind === "heal" ? s.floatHeal : entry.kind === "crit" ? s.floatCrit : entry.kind === "weak" ? s.floatWeak : entry.kind === "miss" ? s.floatMiss : entry.kind === "status" ? s.floatStatus : "";
            return (
              <span className={`${s.floatNum} ${cls}`} key={entry.id} style={{ left: c.x, top: c.y - 70, zIndex: 500 }}>
                {entry.text}
              </span>
            );
          })}
        </div>
        {battle.phase !== "turn" && !anim.busy && !queue.length ? <Results act={act} state={state} /> : null}
      </div>
      <div className={s.battleBottom}>
        <div className={s.battleInfo}>
          {infoUnit ? <UnitInfo state={state} unit={infoUnit} attacker={unit && unit.side === "ally" && infoUnit.side === "enemy" ? unit : null} /> : null}
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
                  No target in range for {mode.skill.name}. {battle.turn.moved ? "Pick another action." : "Go Back and move closer first."}
                </span>
              ) : null}
              {unit!.skills.map((id) => {
                const skill = SKILLS[id]!;
                const active = mode.kind === "skill" && mode.skill.id === id;
                return (
                  <button
                    className={active ? s.skillBtnActive : s.skillBtn}
                    disabled={unit!.mp < skill.mp || battle.turn.acted}
                    key={id}
                    onClick={() => {
                      if (skill.target === "self" || skill.target === "allAllies" || skill.target === "allEnemies" || (skill.target === "area" && skill.range === 0)) {
                        act({ type: "bSkill", skill: id, cell: unit!.cell });
                      } else setMode({ kind: "skill", skill });
                    }}
                    title={skill.desc}
                    type="button"
                  >
                    <b>{skill.name}</b> <span style={{ opacity: 0.8 }}>{skill.mp} MP</span>
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
              {battleItems.length ? null : <span className={s.muted}>No usable items.</span>}
              {battleItems.map((id) => (
                <button
                  className={mode.kind === "item" && mode.item === id ? s.skillBtnActive : s.skillBtn}
                  disabled={battle.turn.acted}
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
                <b>{unit!.name}</b>{"'s turn — "}{battle.turn.moved ? "moved" : "click a blue hex to move"}, {battle.turn.acted ? "acted" : "click a red enemy to attack"}
                {mode.kind === "befriend" ? " · pick an adjacent monster to befriend" : ""}
              </span>
              <button className={`${s.btn} ${s.btnSmall}`} disabled={battle.turn.acted || !unit!.skills.length} onClick={() => setMenu("skills")} type="button">
                Skills
              </button>
              <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.acted} onClick={() => setMenu("items")} type="button">
                Items
              </button>
              <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.acted} onClick={() => act({ type: "bDefend" })} title="D" type="button">
                Defend
              </button>
              <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.moved || battle.turn.acted || battle.turn.waited || !battle.queue.length} onClick={() => act({ type: "bWait" })} title="W" type="button">
                Wait
              </button>
              {state.town.levels.barn >= 1 ? (
                <button className={mode.kind === "befriend" ? `${s.btn} ${s.btnSmall}` : `${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.acted} onClick={() => setMode(mode.kind === "befriend" ? { kind: "idle" } : { kind: "befriend" })} type="button">
                  Befriend
                </button>
              ) : null}
              {rushReady(battle) ? (
                <button className={`${s.btn} ${s.btnSmall}`} disabled={battle.turn.acted} onClick={() => act({ type: "bRush" })} type="button">
                  ⚡ RUSH!
                </button>
              ) : null}
              {battle.canFlee ? (
                <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={battle.turn.acted} onClick={() => act({ type: "bFlee" })} title={`${Math.round(fleeChance(state, battle) * 100)}%`} type="button">
                  Flee
                </button>
              ) : null}
              <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "bEndTurn" })} title="Enter" type="button">
                End turn
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

function Portrait({ unit, size }: { unit: BattleUnit; size: number }) {
  if (unit.kind === "member" || unit.ref === "kaito") {
    const src = TACHIE[unit.ref as keyof typeof TACHIE];
    return <span className={s.portrait} style={{ width: size, height: size, border: "none", backgroundImage: src ? `url(${A(src)})` : undefined }} />;
  }
  return <SpriteStill height={size} slug={unit.sprite} />;
}

function UnitSprite({ unit, cell, clip, dead, active }: { unit: BattleUnit; cell: number; clip?: Clip; dead: boolean; active: boolean }) {
  if (unit.gone) return null;
  const atlas: Atlas | null = atlasFor(unit.sprite);
  const c = center(cell);
  const flip = unit.facing === "left";
  const scale = unit.scale;
  const group = dead ? G.death : clip ? clip.group : G.standing;
  const loop = dead ? false : clip ? clip.loop : true;
  const z = 10 + Math.floor(cell / BOARD_COLS) * 10 + (dead ? 0 : 5);
  if (!atlas) {
    return (
      <span className={s.unit} style={{ left: c.x - 20, top: c.y - 40, zIndex: z }}>
        <Portrait size={40} unit={unit} />
      </span>
    );
  }
  const left = c.x - (flip ? atlas.frameWidth - atlas.anchorX : atlas.anchorX) * scale;
  const top = c.y + FOOT - atlas.anchorY * scale;
  const maxHp = unit.stats.maxHp;
  return (
    <>
      <span className={s.unitShadow} style={{ left: c.x - 20 * scale, top: c.y + FOOT - 6, width: 40 * scale, height: 12, zIndex: z - 1 }} />
      <span className={s.unit} style={{ left, top, zIndex: z, transition: "left 0.17s linear, top 0.17s linear", filter: active ? "drop-shadow(0 0 4px #ffd36a)" : undefined }}>
        <SpriteClip atlas={atlas} clipKey={dead ? "dead" : clip?.key ?? "idle"} flip={flip} fps={dead ? 12 : 10} group={group} loop={loop} scale={scale} />
      </span>
      {!dead ? (
        <span className={s.unitBars} style={{ left: c.x, top: c.y + FOOT + 2, zIndex: 300 }}>
          <span className={s.barTrack}>
            <span className={unit.side === "ally" ? s.barFill : `${s.barFill} ${s.barHp}`} style={{ display: "block", width: `${(100 * unit.hp) / Math.max(1, maxHp)}%` }} />
          </span>
          {unit.side === "ally" && unit.stats.maxMp > 0 ? (
            <span className={s.barTrack}>
              <span className={`${s.barFill} ${s.barMp}`} style={{ display: "block", width: `${(100 * unit.mp) / Math.max(1, unit.stats.maxMp)}%` }} />
            </span>
          ) : null}
        </span>
      ) : null}
      {!dead && (unit.down || unit.statuses.length || unit.defending) ? (
        <span className={`${s.unitBadge} ${unit.down ? s.badgeDown : s.badgeStatus}`} style={{ left: c.x, top: c.y - 64 * scale, zIndex: 310 }}>
          {unit.down ? "DOWN" : unit.defending ? "Guard" : STATUS_NAMES[unit.statuses[0]!.id]}
        </span>
      ) : null}
    </>
  );
}

function UnitInfo({ state, unit, attacker }: { state: RestiaState; unit: BattleUnit; attacker: BattleUnit | null }) {
  const analyzed = unit.side === "ally" || unit.kind !== "monster" || !!state.bestiary[unit.ref]?.analyzed;
  const weak = Object.entries(unit.resist).filter(([, mult]) => (mult ?? 1) > 1).map(([element]) => element);
  const resist = Object.entries(unit.resist).filter(([, mult]) => (mult ?? 1) < 1).map(([element]) => element);
  const title = unit.kind === "member" ? CHARACTERS[unit.ref as keyof typeof CHARACTERS]?.title : unit.kind === "monster" ? MONSTERS[unit.ref]?.desc : "";
  const preview = attacker && unit.hp > 0 ? Math.round(expectedDamage(state, attacker, unit, 1, attacker.element, !attacker.magic, attacker.range > 1 && hexDistance(attacker.cell, unit.cell) === 1)) : null;
  return (
    <div>
      <b>{unit.name}</b> Lv {unit.level} · HP {unit.hp}/{unit.stats.maxHp} · MP {unit.mp}/{unit.stats.maxMp}
      {unit.boss ? " · BOSS" : ""}
      <div style={{ opacity: 0.85 }}>
        ATK {Math.round(eff(state, unit, "atk"))} DEF {Math.round(eff(state, unit, "def"))} MAG {Math.round(eff(state, unit, "mag"))} RES {Math.round(eff(state, unit, "res"))} SPD {Math.round(eff(state, unit, "spd"))} · Move {unit.move} · Range {unit.range}
      </div>
      <div>
        {analyzed ? (
          <>
            Weak: <span className={s.weakTag}>{weak.join(", ") || "—"}</span> · Resists: {resist.join(", ") || "—"}
          </>
        ) : (
          <span style={{ opacity: 0.75 }}>Weaknesses unknown — use Bin&apos;s Analyze.</span>
        )}
        {preview !== null ? ` · Attack ≈ ${preview} dmg` : ""}
        {unit.side === "enemy" && unit.kind === "monster" && unit.tame > 0 && !unit.boss && state.town.levels.barn >= 1 ? ` · Befriend ${Math.round(befriendChance(state, unit) * 100)}%` : ""}
      </div>
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
            {Object.keys(rewards.items).length ? <div>Loot: {Object.entries(rewards.items).map(([id, n]) => `${itemDef(id).name} x${n}`).join(", ")}</div> : null}
            {rewards.befriended.length ? <div className={s.good}>Befriended: {rewards.befriended.join(", ")} (sent to the barn)</div> : null}
            {rewards.levelUps.map((entry) => (
              <div className={s.good} key={`${entry.who}-${entry.level}`}>
                {entry.who} reached level {entry.level}!
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
