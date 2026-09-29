"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BattleAnim, BattleProp, BattleState, BattleUnit, DispatchResult, RestiaAction, RestiaState, SkillDef, TileKind } from "../engine/types";
import { SKILLS } from "../data/skills";
import { ITEMS, itemDef } from "../data/items";
import { MONSTERS } from "../data/monsters";
import { CHARACTERS } from "../data/characters";
import { JOBS } from "../data/jobs";
import { PASSIVES } from "../data/passives";
import { BOARD_SIZE_NAMES, CRAG_HELP, CRAG_NAME, HEIGHT_HELP, POINT_HELP, POINT_NAMES, PROP_NAMES, TILE_HELP, TILE_NAMES, WEATHER_TEXT, battlefieldOf } from "../data/battlefields";
import {
  CHARGE_CARRY,
  canCharge,
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
import { heightOf, isCrag, propAt } from "../engine/battle-field";
import { BOARD_CELLS, cellOf, colRow, hexDistance } from "../engine/hex";
import { cellsOf, distanceTo, occupies, unitDistance } from "../engine/footprint";
import { count } from "../engine/core";
import { SCENES } from "../engine/scenes";
import { A, BATTLEFIELD, OBJECTIVES_SHEET, PROPS_SHEET, TACHIE, tachieFor } from "./assets";
import { SpriteStill } from "./sprites";
import { ActionIcon, FOOT, FxBurst, HillColumn, ICON, LIFT, Projectile, SheetFrame, UnitSprite, boardLayout, footprintPoint, hexCenter, hexPoints, rowZ, usePanZoom } from "./battle-board";
import { terrainBefore, useAnimator } from "./battle-animator";
import s from "./restia.module.css";

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
  const shakeRef = useRef<HTMLDivElement>(null);
  const L = useMemo(() => boardLayout(battle.cols, battle.rows), [battle.cols, battle.rows]);
  const pz = usePanZoom(arenaRef, L.width, L.height);
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

  // Big blows shake the field a little.
  useLayoutEffect(() => {
    const element = shakeRef.current;
    if (!anim.shake || !element) return;
    const animation = element.animate(
      [{ transform: "translate(0, 0)" }, { transform: "translate(-4px, 2px)" }, { transform: "translate(4px, -2px)" }, { transform: "translate(-2px, 1px)" }, { transform: "translate(0, 0)" }],
      { duration: 240, easing: "ease-out" }
    );
    return () => animation.cancel();
  }, [anim.shake]);

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

  /** Every hex of this battle's board. */
  const boardCells = useMemo(() => Array.from({ length: BOARD_CELLS }, (_, cell) => cell).filter((cell) => battle.tiles[cell] !== "void"), [battle.tiles]);

  const reach = useMemo(
    () => (myTurn && unit && battle.turn.movePts > 0 ? reachable(battle, unit, battle.turn.movePts) : new Map<number, number[]>()),
    [battle, myTurn, unit]
  );

  /** Enemies and breakable props the active unit can basic-attack from where it stands. */
  const attackable = useMemo(() => {
    const map = new Map<number, string>();
    if (!myTurn || !unit || battle.turn.acted || unit.ap < 1) return map;
    for (const enemy of living(battle).filter((entry) => entry.side === "enemy")) if (!attackBlock(battle, unit, enemy)) for (const cell of cellsOf(enemy)) map.set(cell, enemy.uid);
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
        if (unitDistance(unit, enemy) <= 1) for (const cell of cellsOf(enemy)) set.add(cell);
      }
    } else if (mode.kind === "skill") {
      for (const cell of boardCells) {
        const result = skillTargets(state, battle, unit, mode.skill, cell);
        if (typeof result !== "string") set.add(cell);
      }
    } else if (mode.kind === "item") {
      const use = itemDef(mode.item).use;
      for (const cell of boardCells) {
        if (use?.bomb ? distanceTo(unit, cell) <= 3 : distanceTo(unit, cell) <= 1 && battle.units.some((entry) => occupies(entry, cell) && entry.side === "ally" && !entry.gone && (use?.revivePct ? entry.hp <= 0 : entry.hp > 0))) {
          set.add(cell);
        }
      }
    }
    return set;
  }, [attackable, battle, boardCells, mode, myTurn, state, unit]);

  /** Hexes the hovered aim would affect (area, line and bomb previews). */
  const areaPreview = useMemo(() => {
    const set = new Set<number>();
    if (hover === null || !unit || !myTurn || !targetCells.has(hover)) return set;
    if (mode.kind === "skill" && (mode.skill.target === "area" || mode.skill.target === "hex" || mode.skill.line || mode.skill.move === "dash")) {
      const hits = skillTargets(state, battle, unit, mode.skill, hover);
      if (typeof hits !== "string") for (const cell of [...hits.cells, ...(hits.path ?? [])]) set.add(cell);
    } else if (mode.kind === "item" && itemDef(mode.item).use?.bomb) {
      const radius = itemDef(mode.item).use!.bomb!.radius;
      for (const cell of boardCells) if (hexDistance(cell, hover) <= radius) set.add(cell);
    }
    return set;
  }, [battle, boardCells, hover, mode, myTurn, state, targetCells, unit]);

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
        // Walk to a hex it can strike from, then strike (H3-style click-to-attack).
        let best: { cell: number; length: number } | null = null;
        for (const [option, path] of reach) {
          if (!attackBlock(battle, unit, foe ?? { cell }, option) && (!best || path.length < best.length)) best = { cell: option, length: path.length };
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

  const hoverUnit = hover !== null ? battle.units.find((entry) => occupies(entry, hover) && !entry.gone && (entry.hp > 0 || anim.pendingDeaths.has(entry.uid))) : undefined;
  const hoverProp = hover !== null ? battle.props.find((prop) => prop.cell === hover && (prop.kind === "rock" || prop.hp > 0)) : undefined;
  const hoverTile = hover !== null ? battle.tiles[hover] ?? null : null;
  const hoverHeight = hover !== null ? heightOf(battle, hover) : 0;
  const hoverPoint = hover !== null ? (battle.points ?? []).find((entry) => entry.cell === hover) : undefined;
  const infoUnit = hoverUnit ?? (hoverProp || hoverTile || hoverHeight || hoverPoint ? null : unit) ?? null;
  /** Ground height as drawn right now (a terrain change may still be about to play). */
  const pendingTerrain = useMemo(() => terrainBefore(queue[0]), [queue]);
  const shownHeight = (cell: number) => anim.heights[cell] ?? (!anim.busy ? pendingTerrain[cell] : undefined) ?? heightOf(battle, cell);
  const lifted = (cell: number) => {
    const c = hexCenter(L, cell);
    return { x: c.x, y: c.y - shownHeight(cell) * LIFT };
  };
  /** Where a figure stands (two-hex bodies in the middle of their footprint), raised by the ground. */
  const point = (entry: BattleUnit, head: number) => footprintPoint(L, entry, head, shownHeight);
  const backdrop = BATTLEFIELD(battle.backdrop);
  const biome = battlefieldOf(battle.backdrop).biome;
  const celebrating = battle.phase === "victory" && !anim.busy && !queue.length;
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
        {battle.size && battle.size !== "small" ? <span className={s.battleChip}>{BOARD_SIZE_NAMES[battle.size]}</span> : null}
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
      <div className={s.battleArena} ref={arenaRef} {...pz.handlers}>
        <div
          className={s.battleField}
          style={{
            width: L.width,
            height: L.height,
            transform: pz.transform,
            backgroundImage: `url(${backdrop})`,
            backgroundSize: `${L.art.w}px ${L.art.h}px`,
            backgroundPosition: `${L.art.x}px ${L.art.y}px`
          }}
        >
          <div className={s.fieldShake} ref={shakeRef} style={{ width: L.width, height: L.height }}>
            {boardCells.map((cell) => {
              const tile = battle.tiles[cell];
              // Only raised ground (or ground about to rise or sink) gets a column.
              if (tile === "water" || (!shownHeight(cell) && !heightOf(battle, cell) && anim.heights[cell] === undefined)) return null;
              return <HillColumn L={L} backdrop={backdrop} biome={biome} cell={cell} height={shownHeight(cell)} key={`h${cell}`} />;
            })}
            {Array.from({ length: battle.rows }, (_, row) => (
              // One layer per row, stacked with the units: a raised hex in front hides what is behind it.
              <svg className={s.hexLayer} height={L.height} key={`row${row}`} style={{ zIndex: rowZ(row) + 2 }} viewBox={`0 0 ${L.width} ${L.height}`} width={L.width}>
                {Array.from({ length: battle.cols }, (_, col) => {
                  const cell = cellOf(col, row);
                  const tile = battle.tiles[cell];
                  if (tile === "void") return null;
                  const height = shownHeight(cell);
                  const classes = [s.hexCell];
                  if (tile && TILE_CLASS[tile]) classes.push(TILE_CLASS[tile]!);
                  if (height > 0) classes.push(s.hexHill);
                  if (propAt(battle, cell)) classes.push(s.hexBlocked);
                  if (areaPreview.has(cell)) classes.push(s.hexArea);
                  else if (targetCells.has(cell)) classes.push(s.hexTarget);
                  else if (mode.kind === "idle" && reach.has(cell)) classes.push(s.hexMove);
                  if (battle.warnings.includes(cell)) classes.push(s.hexWarning);
                  const objective = (battle.points ?? []).find((entry) => entry.cell === cell && !(entry.kind === "cache" && entry.used));
                  if (objective) classes.push(objective.owner === "ally" ? s.hexPointAlly : objective.owner === "enemy" ? s.hexPointEnemy : s.hexPoint);
                  if (unit && occupies(unit, cell) && battle.phase === "turn") classes.push(s.hexActive);
                  return (
                    <polygon
                      className={classes.join(" ")}
                      key={cell}
                      onClick={() => clickCell(cell)}
                      onMouseEnter={() => setHover(cell)}
                      onMouseLeave={() => setHover((current) => (current === cell ? null : current))}
                      points={hexPoints(L, cell)}
                      style={{ transform: `translateY(${-height * LIFT}px)` }}
                    />
                  );
                })}
              </svg>
            ))}
            {Object.entries(battle.tiles).map(([key, tile]) => {
              const cell = Number(key);
              const frame = tileFrame(tile, battle.backdrop);
              if (frame === null) return null;
              const c = lifted(cell);
              const size = tile === "cover" ? 58 : 50;
              return <SheetFrame frame={frame} key={`t${cell}`} sheet={PROPS_SHEET} size={size} style={{ left: c.x - size / 2, top: c.y - size * 0.62, zIndex: rowZ(colRow(cell).row) + 4, opacity: 0.95, transition: "top 0.45s ease-out" }} />;
            })}
            {visibleProps.map((prop) => {
              const c = lifted(prop.cell);
              const size = prop.kind === "barrel" ? 54 : 66;
              return (
                <span className={anim.pendingProps.has(prop.uid) && prop.hp <= 0 ? s.propBreaking : undefined} key={prop.uid} style={{ position: "absolute", left: 0, top: 0 }}>
                  <SheetFrame frame={propFrame(prop.kind, battle.backdrop)} sheet={PROPS_SHEET} size={size} style={{ left: c.x - size / 2, top: c.y - size * 0.8, zIndex: rowZ(colRow(prop.cell).row) + 6, transition: "top 0.45s ease-out" }} />
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
            {(battle.points ?? []).map((entry) => {
              const c = lifted(entry.cell);
              const size = entry.kind === "cache" ? 56 : 72;
              const frame =
                entry.kind === "cache" ? (entry.used ? 7 : 6) : (entry.kind === "banner" ? 0 : 3) + (entry.owner === "ally" ? 1 : entry.owner === "enemy" ? 2 : 0);
              return (
                <SheetFrame
                  cols={4}
                  frame={frame}
                  key={entry.id}
                  rows={2}
                  sheet={OBJECTIVES_SHEET}
                  size={size}
                  style={{ left: c.x - size / 2, top: c.y - size * 0.82, zIndex: rowZ(colRow(entry.cell).row) + 5, transition: "top 0.45s ease-out" }}
                />
              );
            })}
            {battle.warnings.map((cell) => {
              const c = lifted(cell);
              return (
                <span className={s.warnMark} key={`w${cell}`} style={{ left: c.x, top: c.y - 18, zIndex: 320 }}>
                  !
                </span>
              );
            })}
            {battle.units.map((entry) => {
              const head = anim.cells[entry.uid] ?? entry.cell;
              return (
                <UnitSprite
                  active={entry.uid === battle.active && battle.phase === "turn"}
                  badge={badgeOf(entry)}
                  celebrate={celebrating && entry.side === "ally" && entry.hp > 0}
                  clip={anim.clips[entry.uid]}
                  dead={entry.hp <= 0 && !anim.pendingDeaths.has(entry.uid)}
                  facing={anim.facings[entry.uid]}
                  flash={anim.flashes[entry.uid]}
                  head={head}
                  key={entry.uid}
                  motion={anim.motions[entry.uid]}
                  point={point}
                  unit={entry}
                />
              );
            })}
            {anim.shots.map((shot) => {
              const from = lifted(shot.from);
              const to = lifted(shot.to);
              return <Projectile from={from} key={shot.id} ms={shot.ms} sprite={shot.sprite} to={to} />;
            })}
            {anim.bursts.map((burst) => {
              const c = lifted(burst.cell);
              return <FxBurst fx={burst.fx} key={burst.id} size={burst.size} x={c.x} y={c.y - (burst.fx === "cast" ? 0 : 22)} />;
            })}
            {anim.floats.map((entry) => {
              const target = battle.units.find((candidate) => candidate.uid === entry.uid);
              const prop = target ? undefined : battle.props.find((candidate) => candidate.uid === entry.uid);
              if (!target && !prop) return null;
              const c = target ? point(target, anim.cells[entry.uid] ?? target.cell) : lifted(prop!.cell);
              const cls = entry.kind === "heal" ? s.floatHeal : entry.kind === "crit" ? s.floatCrit : entry.kind === "weak" ? s.floatWeak : entry.kind === "miss" ? s.floatMiss : entry.kind === "status" ? s.floatStatus : "";
              return (
                <span className={`${s.floatNum} ${cls}`} key={entry.id} style={{ left: c.x, top: c.y - 70, zIndex: 500 }}>
                  {entry.text}
                </span>
              );
            })}
          </div>
        </div>
        {anim.banner ? (
          <div className={s.battleBanner} key={anim.banner.id}>
            {anim.banner.text}
          </div>
        ) : null}
        <div className={s.zoomBar} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <button aria-label="Zoom in" className={s.zoomBtn} onClick={() => pz.zoomBy(1.3)} type="button">
            +
          </button>
          <button aria-label="Zoom out" className={s.zoomBtn} onClick={() => pz.zoomBy(1 / 1.3)} type="button">
            −
          </button>
          <button aria-label="Fit the whole battlefield" className={s.zoomBtn} disabled={pz.zoom <= 1} onClick={pz.reset} type="button">
            ⤢
          </button>
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
          ) : hoverPoint ? (
            <div>
              <b>{POINT_NAMES[hoverPoint.kind]}</b>
              {hoverPoint.kind === "cache"
                ? hoverPoint.used
                  ? hoverPoint.owner === "ally"
                    ? " · claimed"
                    : " · smashed"
                  : " · unopened"
                : hoverPoint.owner
                  ? ` · held by ${hoverPoint.owner === "ally" ? "your party" : "the enemy"}`
                  : " · unclaimed"}
              <div style={{ opacity: 0.85 }}>{POINT_HELP[hoverPoint.kind]}</div>
            </div>
          ) : hover !== null && isCrag(battle, hover) ? (
            <div>
              <b>{CRAG_NAME}</b>
              <div style={{ opacity: 0.85 }}>{CRAG_HELP}</div>
            </div>
          ) : hoverTile || hoverHeight ? (
            <div>
              {hoverTile && hoverTile !== "high" ? (
                <>
                  <b>{TILE_NAMES[hoverTile]}</b>
                  <div style={{ opacity: 0.85 }}>{TILE_HELP[hoverTile]}</div>
                </>
              ) : null}
              {hoverHeight ? (
                <>
                  <b>{hoverHeight >= 2 ? "Hilltop" : "Hillside"} · height {hoverHeight}</b>
                  <div style={{ opacity: 0.85 }}>{HEIGHT_HELP}</div>
                </>
              ) : null}
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
                  No valid target for {mode.skill.name}. {battle.turn.movePts > 0 ? "Go Back and move first (range and line of sight matter)." : "Pick another action."}
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
                    <ActionIcon icon={skill.move === "leap" || skill.move === "blink" ? ICON.leap : skill.move === "dash" ? ICON.dash : skill.pull ? ICON.hook : skill.shape ? ICON.terrain : skill.kind === "physical" ? ICON.attack : ICON.skills} size={18} /> <b>{skill.name}</b>{" "}
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
                <b>{unit!.name}</b> <ApPips ap={unit!.ap} /> <MovePips left={battle.turn.movePts} full={Math.max(battle.turn.movePts, moveRange(unit!) + (battle.turn.sprinted ? SPRINT_MOVE : 0))} />{" "}
                {moveRange(unit!) === 0 ? "rooted" : battle.turn.movePts > 0 ? "move (blue)" : "no movement left"}, {battle.turn.acted ? "acted — move on or end the turn" : "attack 1 AP (red)"}
                {mode.kind === "befriend" ? " · pick an adjacent monster to befriend" : ""}
              </span>
              <button className={`${s.btn} ${s.btnSmall} ${s.actionBtn}`} disabled={battle.turn.acted || !unit!.skills.length} onClick={() => setMenu("skills")} type="button">
                <ActionIcon icon={ICON.skills} /> Skills
              </button>
              <button className={`${s.btnGhost} ${s.btnSmall} ${s.actionBtn}`} disabled={battle.turn.acted || battle.turn.item} onClick={() => setMenu("items")} type="button">
                <ActionIcon icon={ICON.items} /> Items
              </button>
              <button
                className={`${s.btnGhost} ${s.btnSmall} ${s.actionBtn}`}
                disabled={battle.turn.acted || battle.turn.sprinted || unit!.ap < 1 || moveRange(unit!) === 0}
                onClick={() => act({ type: "bSprint" })}
                title={`Spend 1 AP: +${SPRINT_MOVE} movement this turn`}
                type="button"
              >
                <ActionIcon icon={ICON.sprint} /> Sprint
              </button>
              <button className={`${s.btnGhost} ${s.btnSmall} ${s.actionBtn}`} disabled={battle.turn.acted} onClick={() => act({ type: "bDefend" })} title={`D · DEF/RES x1.5, +10% MP, +${DEFEND_CARRY} AP next turn (ends the turn)`} type="button">
                <ActionIcon icon={ICON.defend} /> Defend
              </button>
              <button
                className={`${s.btnGhost} ${s.btnSmall}`}
                disabled={battle.turn.moved || battle.turn.acted || battle.turn.waited || battle.turn.sprinted || battle.turn.item || !battle.queue.length}
                onClick={() => act({ type: "bWait" })}
                title="W · act later this round"
                type="button"
              >
                <ActionIcon icon={ICON.wait} /> Wait
              </button>
              {state.town.levels.barn >= 1 ? (
                <button className={`${mode.kind === "befriend" ? s.btn : s.btnGhost} ${s.btnSmall} ${s.actionBtn}`} disabled={battle.turn.acted || unit!.ap < 1} onClick={() => setMode(mode.kind === "befriend" ? { kind: "idle" } : { kind: "befriend" })} type="button">
                  <ActionIcon icon={ICON.befriend} /> Befriend
                </button>
              ) : null}
              {rushReady(battle) ? (
                <button className={`${s.btn} ${s.btnSmall} ${s.actionBtn}`} disabled={battle.turn.acted || unit!.ap < 1} onClick={() => act({ type: "bRush" })} type="button">
                  <ActionIcon icon={ICON.rush} /> RUSH!
                </button>
              ) : null}
              {battle.canFlee ? (
                <button className={`${s.btnGhost} ${s.btnSmall} ${s.actionBtn}`} disabled={battle.turn.acted} onClick={() => act({ type: "bFlee" })} title={`${Math.round(fleeChance(state, battle) * 100)}%`} type="button">
                  <ActionIcon icon={ICON.flee} /> Flee
                </button>
              ) : null}
              <button className={`${canCharge(battle.turn) ? s.btnGhost : s.btn} ${s.btnSmall} ${s.actionBtn}`} onClick={() => act({ type: "bEndTurn" })} title={`Enter · ending without moving or acting carries +${CHARGE_CARRY} AP`} type="button">
                <ActionIcon icon={canCharge(battle.turn) ? ICON.charge : ICON.endTurn} /> {canCharge(battle.turn) ? `Charge (+${CHARGE_CARRY} AP)` : "End turn"}
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

/** Movement points left this turn (spent per hex; climbing and rough ground cost more). */
function MovePips({ left, full }: { left: number; full: number }) {
  return (
    <span className={s.movePips} title={`Movement ${left}/${full}`}>
      <ActionIcon icon={ICON.move} size={16} />
      {Array.from({ length: Math.min(full, 10) }, (_, index) => (
        <span className={index < left ? s.movePipOn : s.movePipOff} key={index} />
      ))}
    </span>
  );
}

/** The little word over a figure: down, guarding, or its first status. */
function badgeOf(unit: BattleUnit): string | null {
  return unit.down ? "DOWN" : unit.defending ? "Guard" : unit.statuses[0] ? STATUS_NAMES[unit.statuses[0].id] + (unit.statuses.length > 1 ? ` +${unit.statuses.length - 1}` : "") : null;
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

function UnitInfo({ state, unit, attacker }: { state: RestiaState; unit: BattleUnit; attacker: BattleUnit | null }) {
  const battle = state.battle!;
  const analyzed = unit.side === "ally" || unit.kind !== "monster" || !!state.bestiary[unit.ref]?.analyzed;
  const weak = Object.entries(unit.resist).filter(([, mult]) => (mult ?? 1) > 1).map(([element]) => element);
  const resist = Object.entries(unit.resist).filter(([, mult]) => (mult ?? 1) < 1).map(([element]) => element);
  const member = unit.kind === "member" ? state.members[unit.ref as keyof typeof state.members] : undefined;
  const title = unit.kind === "member" ? `${CHARACTERS[unit.ref as keyof typeof CHARACTERS]?.title}${member ? ` · ${JOBS[member.job]?.name ?? ""} Lv ${member.jobs[member.job]?.level ?? 1}` : ""}` : unit.kind === "monster" ? MONSTERS[unit.ref]?.desc : "";
  const distance = attacker ? unitDistance(attacker, unit) : 0;
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
        {heightOf(battle, unit.cell) ? ` · on a hill (height ${heightOf(battle, unit.cell)})` : ""}
        {battle.tiles[unit.cell] === "cover" ? " · in cover" : ""}
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
            {rewards.found && (rewards.found.gold || Object.keys(rewards.found.items).length) ? (
              <div>
                Supply caches: {[rewards.found.gold ? `${rewards.found.gold} gold` : "", ...Object.entries(rewards.found.items).map(([id, n]) => `${itemDef(id).name} x${n}`)].filter(Boolean).join(", ")} (included below)
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
