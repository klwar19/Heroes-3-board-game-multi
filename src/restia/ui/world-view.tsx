"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { BuildingId, Dir, DispatchResult, NpcId, RestiaAction, RestiaState, ToolId, ZoneId } from "../engine/types";
import { COLS, FIELD_RECTS, PAINTED_DEBRIS, ROWS, ZONES, inRect } from "../data/zones";
import { BUILDINGS } from "../data/buildings";
import { CROPS, FARM_SPRITE, cropStage } from "../data/crops";
import { ITEMS, itemDef } from "../data/items";
import { MONSTERS } from "../data/monsters";
import { NPCS, NPC_IDS } from "../data/npcs";
import { DIRS, isOpen, occupiedLots, walkable } from "../engine/world";
import { formatTime, weekday } from "../engine/core";
import { npcWhere } from "../engine/social";
import { plotAt, plotIndex } from "../engine/state";
import { SPRINKLER_AREA, isRipe, sprinklerCells, sprinklerItem, toolCost } from "../engine/farm";
import { A, BUILDING_ART, SHEETS, WALKER } from "./assets";
import { FarmSprite, IconSprite, ItemIcon, SpriteStill, SprinklerSprite, Walker } from "./sprites";
import s from "./restia.module.css";

export type Hot = { kind: "tool"; tool: ToolId } | { kind: "hand" } | { kind: "seed"; item: string } | { kind: "fert"; item: string } | { kind: "sprinkler"; item: string };

type Cell = { x: number; y: number };
type Opener = (panel: { kind: string; [key: string]: unknown }) => void;

const TOOL_ORDER: ToolId[] = ["hoe", "can", "axe", "hammer", "sickle"];
const TOOL_ICON: Record<ToolId, number> = { hoe: 26, can: 27, axe: 28, hammer: 29, sickle: 30 };
const TOOL_LABEL: Record<ToolId, string> = { hoe: "Hoe", can: "Watering Can", axe: "Axe", hammer: "Hammer", sickle: "Sickle" };
/** Height of an overworld figure (battle-atlas frame), in map cells. */
const FIGURE_CELLS = 1.9;
/** Size of a giant crop's sprite, in map cells (it covers its 3x3 block). */
const GIANT_CELLS = 3.4;
const TIER_MARK = ["", "I", "II", "III"];

function dirBetween(a: Cell, b: Cell): Dir {
  if (b.x > a.x) return "right";
  if (b.x < a.x) return "left";
  if (b.y > a.y) return "down";
  return "up";
}

/** 4-way BFS to the nearest of `goals`; never walks through exits or monsters unless they are the goal. */
function findPath(state: RestiaState, zone: ZoneId, start: Cell, goals: Cell[]): Dir[] | null {
  const key = (c: Cell) => c.y * COLS + c.x;
  const goalSet = new Set(goals.map(key));
  if (goalSet.has(key(start))) return [];
  const exits = ZONES[zone].exits;
  const monsters = new Set(state.fieldMonsters.filter((m) => m.zone === zone).map((m) => m.y * COLS + m.x));
  const prev = new Map<number, number>();
  const seen = new Set([key(start)]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const cell = queue.shift()!;
    for (const dir of ["up", "down", "left", "right"] as Dir[]) {
      const next = { x: cell.x + DIRS[dir].dx, y: cell.y + DIRS[dir].dy };
      const k = key(next);
      if (seen.has(k)) continue;
      const isGoal = goalSet.has(k);
      if (!walkable(state, zone, next.x, next.y)) continue;
      if (!isGoal && (monsters.has(k) || exits.some((exit) => inRect(exit.rect, next.x, next.y)))) continue;
      seen.add(k);
      prev.set(k, key(cell));
      if (isGoal) {
        const dirs: Dir[] = [];
        let at = k;
        while (at !== key(start)) {
          const from = prev.get(at)!;
          dirs.unshift(dirBetween({ x: from % COLS, y: Math.floor(from / COLS) }, { x: at % COLS, y: Math.floor(at / COLS) }));
          at = from;
        }
        return dirs;
      }
      queue.push(next);
    }
  }
  return null;
}

function around(cell: Cell, radius = 1): Cell[] {
  const out: Cell[] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) out.push({ x: cell.x + dx, y: cell.y + dy });
  return out;
}

type Target =
  | { kind: "npc"; npc: NpcId; cell: Cell }
  | { kind: "door"; building: BuildingId; door: Cell }
  | { kind: "bin"; cell: Cell }
  | { kind: "board"; cell: Cell }
  | { kind: "well"; cell: Cell }
  | { kind: "water"; cell: Cell }
  | { kind: "cave"; cell: Cell }
  | { kind: "forage"; index: number; cell: Cell }
  | { kind: "monster"; uid: string; cell: Cell }
  | { kind: "plot"; cell: Cell }
  | { kind: "exit"; cell: Cell }
  | { kind: "walk"; cell: Cell };

const HAND: Hot = { kind: "hand" };

/** What sits on a map cell (pure: pass the state to read). */
function targetIn(state: RestiaState, x: number, y: number): Target {
  const here = ZONES[state.player.zone];
  const npc = NPC_IDS.find((id) => {
    const where = npcWhere(state, id);
    return where && "zone" in where && where.zone === here.id && where.x === x && where.y === y;
  });
  if (npc) return { kind: "npc", npc, cell: { x, y } };
  for (const [building, lot] of Object.entries(here.lots) as [BuildingId, NonNullable<(typeof here.lots)[BuildingId]>][]) {
    if ((lot.door.x === x && lot.door.y === y) || inRect(lot.rect, x, y)) {
      if (state.town.levels[building] >= 1 || inRect(lot.rect, x, y)) return { kind: "door", building, door: lot.door };
    }
  }
  for (const object of here.objects) {
    if (object.x !== x || object.y !== y) continue;
    if (object.kind === "shippingBin") return { kind: "bin", cell: { x, y } };
    if (object.kind === "board") return { kind: "board", cell: { x, y } };
    if (object.kind === "well") return { kind: "well", cell: { x, y } };
    if (object.kind === "cave") return { kind: "cave", cell: { x, y } };
  }
  if (here.water.some((rect) => inRect(rect, x, y))) return { kind: "water", cell: { x, y } };
  const forageIndex = state.forage.findIndex((spot) => spot.zone === here.id && spot.x === x && spot.y === y);
  if (forageIndex >= 0) return { kind: "forage", index: forageIndex, cell: { x, y } };
  const monster = state.fieldMonsters.find((m) => m.zone === here.id && m.x === x && m.y === y);
  if (monster) return { kind: "monster", uid: monster.uid, cell: { x, y } };
  if (here.id === "farm" && inRect(FIELD_RECTS[state.town.levels.field]!, x, y)) return { kind: "plot", cell: { x, y } };
  if (here.exits.some((exit) => inRect(exit.rect, x, y))) return { kind: "exit", cell: { x, y } };
  return { kind: "walk", cell: { x, y } };
}

export function WorldView({
  state,
  act,
  locked,
  open,
  toast
}: {
  state: RestiaState;
  act: (action: RestiaAction) => DispatchResult;
  locked: boolean;
  open: Opener;
  toast: (text: string) => void;
}) {
  const zone = ZONES[state.player.zone];
  const stageRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [stage, setStage] = useState({ w: 1280, h: 640 });
  const [hover, setHover] = useState<Cell | null>(null);
  const [hot, setHot] = useState<Hot>({ kind: "hand" });
  const [walking, setWalking] = useState(false);
  const [menu, setMenu] = useState<{ kind: "npc"; npc: NpcId } | { kind: "closed"; building: BuildingId; opensAt: number } | { kind: "sprinkler"; cell: Cell } | null>(null);
  const walkToken = useRef(0);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setStage({ w: element.clientWidth, h: element.clientHeight }));
    observer.observe(element);
    setStage({ w: element.clientWidth, h: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Stop walking when the zone changes or something takes over the screen.
  useEffect(() => {
    // Cancels any queued walk; the walk loop itself clears `walking` when the zone changes.
    walkToken.current += 1;
  }, [state.player.zone, state.player.inside]);

  const contain = Math.min(stage.w / 1600, stage.h / 900);
  const scale = (1600 * contain) / COLS < 22 ? stage.h / 900 : contain;
  const mapW = 1600 * scale;
  const mapH = 900 * scale;
  const cell = mapW / COLS;
  const px = (state.player.x + 0.5) * cell;
  const py = (state.player.y + 0.5) * cell;
  const offsetX = mapW <= stage.w ? (stage.w - mapW) / 2 : Math.min(0, Math.max(stage.w - mapW, stage.w / 2 - px));
  const offsetY = mapH <= stage.h ? (stage.h - mapH) / 2 : Math.min(0, Math.max(stage.h - mapH, stage.h / 2 - py));

  const npcs = useMemo(
    () =>
      NPC_IDS.map((npc) => ({ npc, where: npcWhere(state, npc) })).filter(
        (entry): entry is { npc: NpcId; where: { zone: ZoneId; x: number; y: number } } => !!entry.where && "zone" in entry.where && entry.where.zone === zone.id
      ),
    [state, zone.id]
  );

  const seeds = useMemo(() => Object.keys(state.inventory).filter((id) => ITEMS[id]?.seedOf), [state.inventory]);
  const ferts = useMemo(() => Object.keys(state.inventory).filter((id) => ITEMS[id]?.use?.fertilizer), [state.inventory]);
  const sprinklers = useMemo(() => Object.keys(state.inventory).filter((id) => ITEMS[id]?.sprinkler).sort(), [state.inventory]);
  // Keep the selected seed/fertilizer/sprinkler valid (falls back to the hand).
  const activeHot: Hot = useMemo(() => {
    const valid =
      hot.kind === "seed" ? seeds.includes(hot.item) : hot.kind === "fert" ? ferts.includes(hot.item) : hot.kind === "sprinkler" ? sprinklers.includes(hot.item) : true;
    return valid ? hot : HAND;
  }, [ferts, hot, seeds, sprinklers]);

  const walkTo = useCallback(
    (goals: Cell[], then?: () => void) => {
      const plan = () => {
        const current = stateRef.current;
        return findPath(current, current.player.zone, { x: current.player.x, y: current.player.y }, goals);
      };
      let path = plan();
      if (!path) {
        toast("You can't reach that from here.");
        return;
      }
      const token = ++walkToken.current;
      setWalking(path.length > 0);
      let index = 0;
      let replans = 0;
      const tick = () => {
        if (token !== walkToken.current || !path) return;
        if (index >= path.length) {
          setWalking(false);
          then?.();
          return;
        }
        const before = stateRef.current;
        const result = act({ type: "step", dir: path[index]! });
        index += 1;
        const after = result.state;
        stateRef.current = after;
        if (after.player.zone !== before.player.zone || after.battle || after.scene) {
          setWalking(false);
          return;
        }
        if (after.player.x === before.player.x && after.player.y === before.player.y) {
          // Something moved into the way: plan a fresh route, at most twice.
          path = replans++ < 2 ? plan() : null;
          index = 0;
          if (!path) {
            setWalking(false);
            return;
          }
        }
        window.setTimeout(tick, 125);
      };
      if (path.length) window.setTimeout(tick, 10);
      else then?.();
    },
    [act, toast]
  );

  const actOnPlot = useCallback(
    (c: Cell) => {
      const current = stateRef.current;
      const plot = plotAt(current, c.x, c.y);
      if (plot && isRipe(plot)) {
        act({ type: "harvest", x: c.x, y: c.y });
        return;
      }
      if (plot?.sprinkler && activeHot.kind !== "tool") {
        setMenu({ kind: "sprinkler", cell: c });
        return;
      }
      switch (activeHot.kind) {
        case "tool":
          act({ type: "tool", tool: activeHot.tool, x: c.x, y: c.y });
          return;
        case "seed":
          act({ type: "plant", item: activeHot.item, x: c.x, y: c.y });
          return;
        case "fert":
          act({ type: "fertilize", item: activeHot.item, x: c.x, y: c.y });
          return;
        case "sprinkler":
          act({ type: "placeSprinkler", item: activeHot.item, x: c.x, y: c.y });
          return;
        default:
          if (plot?.debris) toast(plot.debris === "weed" || plot.debris === "withered" ? "Use the Sickle on weeds." : plot.debris === "stone" || plot.debris === "boulder" ? "Use the Hammer on rocks." : "Use the Axe on wood.");
          else if (plot && !plot.tilled) toast("Select the Hoe (1) to till, then plant seeds.");
          else if (plot?.crop) toast("Water it every day with the Watering Can (2).");
          else toast("Pick seeds from the hotbar to plant here.");
      }
    },
    [act, activeHot, toast]
  );

  const interact = useCallback(
    (target: Target, walk: boolean) => {
      setMenu(null);
      const go = (goals: Cell[], then: () => void) => (walk ? walkTo(goals, then) : then());
      switch (target.kind) {
        case "npc":
          return go(around(target.cell).filter((c) => c.x !== target.cell.x || c.y !== target.cell.y), () => setMenu({ kind: "npc", npc: target.npc }));
        case "door": {
          const level = stateRef.current.town.levels[target.building];
          if (level < 1) {
            toast(
              target.building === "shrine"
                ? "The snowed-in Weaver's Shrine. Restore it at the Outpost Board."
                : `The ruined lot of the ${BUILDINGS[target.building].name}. Rebuild it at the Outpost Board.`
            );
            return;
          }
          return go([target.door], () => {
            const current = stateRef.current;
            const def = BUILDINGS[target.building];
            // Closed now but opening later today: offer to wait for it.
            if (!isOpen(current, target.building) && def.hours && current.minute < def.hours[0] && (def.closedDay === undefined || weekday(current.day) !== def.closedDay)) {
              setMenu({ kind: "closed", building: target.building, opensAt: def.hours[0] });
              return;
            }
            act({ type: "enter", building: target.building });
          });
        }
        case "bin":
          return go(around(target.cell), () => open({ kind: "ship" }));
        case "board":
          return go(around(target.cell), () => open({ kind: "board" }));
        case "well":
          return go(around(target.cell, 2), () => act({ type: "refill" }));
        case "water":
          return go(around(target.cell), () => act({ type: "refill" }));
        case "cave":
          return go(around(target.cell), () => open({ kind: "dungeon" }));
        case "forage":
          return go(around(target.cell), () => act({ type: "forage", index: target.index }));
        case "monster":
          return go(
            around(target.cell).filter((c) => Math.abs(c.x - target.cell.x) + Math.abs(c.y - target.cell.y) === 1),
            () => {
              const current = stateRef.current;
              const monster = current.fieldMonsters.find((m) => m.uid === target.uid);
              if (!monster) return;
              act({ type: "step", dir: dirBetween({ x: current.player.x, y: current.player.y }, { x: monster.x, y: monster.y }) });
            }
          );
        case "plot":
          return go(around(target.cell), () => actOnPlot(target.cell));
        case "exit":
        case "walk":
          if (walk) walkTo([target.cell]);
          return;
      }
    },
    [act, open, toast, actOnPlot, walkTo]
  );

  // Keyboard: arrows/WASD move, E/Space interacts with the faced cell, 0-7 hotbar.
  useEffect(() => {
    if (locked) return;
    let last = 0;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const dirs: Record<string, Dir> = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
      const dir = dirs[event.key];
      if (dir) {
        event.preventDefault();
        const now = performance.now();
        if (now - last < 110) return;
        last = now;
        walkToken.current += 1;
        setMenu(null);
        act({ type: "step", dir });
        return;
      }
      if (event.key === "e" || event.key === "E" || event.key === " " || event.key === "Enter") {
        event.preventDefault();
        const current = stateRef.current;
        const { dx, dy } = DIRS[current.player.facing];
        const facing = { x: current.player.x + dx, y: current.player.y + dy };
        const target = targetIn(current, facing.x, facing.y);
        if (target.kind === "plot") actOnPlot(target.cell);
        else if (target.kind !== "walk") interact(target, false);
        else if (current.player.zone === "farm") actOnPlot({ x: current.player.x, y: current.player.y });
        return;
      }
      if (stateRef.current.player.zone === "farm") {
        const n = Number(event.key);
        if (n >= 1 && n <= 5) setHot({ kind: "tool", tool: TOOL_ORDER[n - 1]! });
        if (n === 6 && seeds.length) {
          const index = activeHot.kind === "seed" ? (seeds.indexOf(activeHot.item) + 1) % seeds.length : 0;
          setHot({ kind: "seed", item: seeds[index]! });
        }
        if (n === 7 && ferts.length) setHot({ kind: "fert", item: ferts[0]! });
        if (n === 8 && sprinklers.length) {
          const index = activeHot.kind === "sprinkler" ? (sprinklers.indexOf(activeHot.item) + 1) % sprinklers.length : 0;
          setHot({ kind: "sprinkler", item: sprinklers[index]! });
        }
        if (event.key === "0") setHot({ kind: "hand" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, activeHot, ferts, interact, locked, seeds, sprinklers, actOnPlot]);

  const cellFromEvent = (event: ReactMouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * COLS);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * ROWS);
    return { x: Math.max(0, Math.min(COLS - 1, x)), y: Math.max(0, Math.min(ROWS - 1, y)) };
  };

  const box = (x: number, y: number, w = 1, h = 1): CSSProperties => ({ left: x * cell, top: y * cell, width: w * cell, height: h * cell });
  const z = (y: number) => 10 + Math.round(y * 10);

  // ---------- Layers ----------
  const layers: ReactNode[] = [];

  if (zone.id === "farm") {
    const rect = FIELD_RECTS[state.town.levels.field]!;
    for (let y = rect[1]; y <= rect[3]; y++) {
      for (let x = rect[0]; x <= rect[2]; x++) {
        const plot = plotAt(state, x, y);
        if (!plot) continue;
        const key = `p${x},${y}`;
        const painted = PAINTED_DEBRIS.some((entry) => entry.x === x && entry.y === y);
        if (plot.tilled) {
          layers.push(<FarmSprite className={s.plotTile} index={plot.watered ? FARM_SPRITE.watered : FARM_SPRITE.tilled} key={`${key}t`} size={cell} style={{ ...box(x, y), zIndex: 2 }} />);
        } else if (painted && !plot.debris) {
          layers.push(<span className={s.plotTile} key={`${key}s`} style={{ ...box(x, y), zIndex: 2, backgroundImage: `url(${A(SHEETS.soil)})`, backgroundSize: "cover" }} />);
        }
        if (plot.fertilizer && plot.tilled) {
          layers.push(<span className={s.plotTile} key={`${key}f`} style={{ ...box(x + 0.72, y + 0.08, 0.22, 0.22), zIndex: 3, borderRadius: "50%", background: plot.fertilizer === 2 ? "#8fe36a" : "#c9a45a", opacity: 0.85 }} />);
        }
        if (plot.debris) {
          const big = plot.debris === "stump" || plot.debris === "boulder";
          layers.push(<FarmSprite className={s.plotTile} index={FARM_SPRITE.debris[plot.debris]} key={`${key}d`} size={cell * (big ? 1.25 : 0.95)} style={{ left: (x + (big ? -0.125 : 0.025)) * cell, top: (y + (big ? -0.3 : 0.02)) * cell, zIndex: z(y + 0.5) }} />);
        }
        if (plot.sprinkler) {
          // Sprinklers water at dawn: they spray through the first hour of the day.
          const spraying = state.minute < 7 * 60;
          const size = cell * (spraying ? 2.2 : 1.25);
          layers.push(
            <SprinklerSprite
              className={s.plotTile}
              key={`${key}k`}
              size={size}
              spraying={spraying}
              style={{ position: "absolute", left: (x + 0.5) * cell - size / 2, top: (y + 0.95) * cell - size, zIndex: z(y + 0.55), pointerEvents: "none" }}
              tier={plot.sprinkler}
            />
          );
        }
        if (plot.crop && plot.crop.giant !== undefined) {
          // A giant crop is drawn once, from its top-left cell, across its 3x3 block.
          if (plot.crop.giant === plotIndex(x, y)) {
            const def = CROPS[plot.crop.id]!;
            layers.push(
              <FarmSprite
                className={`${s.plotTile} ${s.glow}`}
                index={def.sprite.ripe}
                key={`${key}g`}
                size={cell * GIANT_CELLS}
                style={{ left: (x + 1.5 - GIANT_CELLS / 2) * cell, top: (y + 2.95 - GIANT_CELLS) * cell, zIndex: z(y + 2.6) }}
              />
            );
          }
        } else if (plot.crop) {
          const def = CROPS[plot.crop.id]!;
          const stage = cropStage(def, plot.crop.growth);
          const index = stage === 0 ? FARM_SPRITE.sprout : stage === 1 ? FARM_SPRITE.young : stage === 2 ? def.sprite.growing : def.sprite.ripe;
          const size = stage <= 1 ? 0.9 : 1.3;
          layers.push(
            <FarmSprite
              className={`${s.plotTile} ${stage === 3 ? s.glow : ""}`}
              index={index}
              key={`${key}c`}
              size={cell * size}
              style={{ left: (x + 0.5 - size / 2) * cell, top: (y + 0.95 - size) * cell, zIndex: z(y + 0.6) }}
            />
          );
        }
      }
    }
  }

  for (const [building, lot] of occupiedLots(state, zone.id)) {
    const level = state.town.levels[building];
    const underConstruction = state.town.project?.id === building;
    const art =
      building === "shrine" && level === 0 ? (underConstruction ? BUILDING_ART.construction : BUILDING_ART.shrineRuined) : level === 0 && underConstruction ? BUILDING_ART.construction : BUILDING_ART[building];
    const centerX = (lot.rect[0] + lot.rect[2] + 1) / 2;
    const bottom = lot.rect[3] + 1 + (lot.spriteDy ?? 0);
    const w = lot.spriteW;
    layers.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className={s.building}
        draggable={false}
        key={`b-${building}`}
        src={A(art!)}
        style={{ left: (centerX - w / 2) * cell, top: bottom * cell, width: w * cell, transform: "translateY(-100%)", zIndex: z(lot.rect[3] + 0.9) }}
      />
    );
    if (underConstruction && level > 0) {
      layers.push(
        <span className={s.nameTag} key={`bt-${building}`} style={{ left: centerX * cell, top: (lot.rect[1] - 0.2) * cell, bottom: "auto", zIndex: 400 }}>
          🔨 upgrading to Lv {state.town.project!.level}
        </span>
      );
    }
  }

  for (const object of zone.objects) {
    if (object.kind === "shippingBin" || object.kind === "board") {
      const w = object.kind === "board" ? 1.7 : 1.4;
      layers.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={s.building}
          draggable={false}
          key={`o-${object.kind}`}
          src={A(object.kind === "board" ? BUILDING_ART.board! : BUILDING_ART.shippingBin!)}
          style={{ left: (object.x + 0.5 - w / 2) * cell, top: (object.y + 1) * cell, width: w * cell, transform: "translateY(-100%)", zIndex: z(object.y + 0.9) }}
        />
      );
    }
  }

  state.forage.forEach((spot, index) => {
    if (spot.zone !== zone.id) return;
    layers.push(
      <span className={`${s.entity} ${s.bob} ${s.glow}`} key={`f${index}`} style={{ ...box(spot.x + 0.15, spot.y + 0.1, 0.7, 0.7), zIndex: z(spot.y + 0.5) }}>
        <ItemIcon id={spot.item} size={cell * 0.7} />
      </span>
    );
  });

  for (const monster of state.fieldMonsters) {
    if (monster.zone !== zone.id) continue;
    const def = MONSTERS[monster.symbol]!;
    const height = cell * 1.7;
    layers.push(
      <span className={s.entity} key={monster.uid} style={{ left: (monster.x + 0.5) * cell, top: (monster.y + 1) * cell, transform: "translate(-50%, -100%)", zIndex: z(monster.y + 0.8), transition: "left 0.12s linear, top 0.12s linear" }}>
        <SpriteStill height={height} slug={def.sprite} />
        {monster.group.length > 1 ? <span className={s.nameTag}>x{monster.group.length}</span> : null}
      </span>
    );
  }

  // Figures stand in a zero-size box at their feet; the atlas anchor lands there.
  const figure = cell * FIGURE_CELLS;
  for (const { npc, where } of npcs) {
    const fresh = state.social[npc].talkedDay !== state.day;
    layers.push(
      <span className={s.entity} key={`n-${npc}`} style={{ left: (where.x + 0.5) * cell, top: (where.y + 0.95) * cell, zIndex: z(where.y + 0.85) }}>
        <Walker dir={state.player.x < where.x ? "left" : "right"} height={figure} slug={WALKER[npc]} walking={false} />
        <span className={fresh ? s.talkBubble : s.nameTag} style={{ bottom: figure * 0.95 }}>
          {fresh ? `💬 ${NPCS[npc].name}` : NPCS[npc].name}
        </span>
      </span>
    );
  }

  layers.push(
    <span
      className={s.entity}
      key="player"
      style={{ left: (state.player.x + 0.5) * cell, top: (state.player.y + 0.95) * cell, zIndex: z(state.player.y + 0.9), transition: "left 0.12s linear, top 0.12s linear" }}
    >
      <Walker dir={state.player.facing} height={figure} slug={WALKER.bin} walking={walking} />
    </span>
  );

  for (const exit of zone.exits) {
    const cx = (exit.rect[0] + exit.rect[2] + 1) / 2;
    const cy = (exit.rect[1] + exit.rect[3] + 1) / 2;
    const arrow = exit.rect[0] === 0 ? "◀" : exit.rect[1] === 0 ? "▲" : exit.rect[3] === ROWS - 1 ? "▼" : "▶";
    layers.push(
      <span className={s.exitArrow} key={`x-${exit.to}`} style={{ left: Math.min(Math.max(cx * cell, 60), mapW - 60), top: Math.min(Math.max(cy * cell, 14), mapH - 14), zIndex: 500 }}>
        {arrow} {exit.label}
      </span>
    );
  }

  const hoverText = hover ? describe(state, targetIn(state, hover.x, hover.y), activeHot) : "";
  // Sprinkler reach: shown while placing one, or when pointing at a placed one.
  const hoverPlot = hover && zone.id === "farm" && inRect(FIELD_RECTS[state.town.levels.field]!, hover.x, hover.y) ? plotAt(state, hover.x, hover.y) : null;
  const reachTier = hoverPlot?.sprinkler ?? (hoverPlot && activeHot.kind === "sprinkler" ? ITEMS[activeHot.item]?.sprinkler : undefined);
  const reach = hover && reachTier ? sprinklerCells(reachTier, hover.x, hover.y).filter((c) => inRect(FIELD_RECTS[state.town.levels.field]!, c.x, c.y)) : [];

  return (
    <div className={s.world} ref={stageRef}>
      <div
        className={s.map}
        style={{ width: mapW, height: mapH, left: 0, top: 0, transform: `translate(${offsetX}px, ${offsetY}px)`, backgroundImage: `url(${A(zone.image)})` }}
      >
        {layers}
        <div
          className={s.cellHit}
          onClick={(event) => {
            if (locked) return;
            const c = cellFromEvent(event);
            interact(targetIn(stateRef.current, c.x, c.y), true);
          }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const c = cellFromEvent(event);
            if (!hover || hover.x !== c.x || hover.y !== c.y) setHover(c);
          }}
          style={{ left: 0, top: 0, width: mapW, height: mapH, zIndex: 600, background: "transparent", outline: "none" }}
        />
        {hover ? (
          <>
            <span className={s.pathDot} style={{ ...box(hover.x + 0.1, hover.y + 0.1, 0.8, 0.8), zIndex: 601, background: "rgba(255,255,255,0.18)", borderRadius: 6 }} />
            {reach.map((c) => (
              <span className={s.pathDot} key={`r${c.x},${c.y}`} style={{ ...box(c.x + 0.08, c.y + 0.08, 0.84, 0.84), zIndex: 601, background: "rgba(90,170,255,0.3)", borderRadius: 6 }} />
            ))}
            {hoverText ? (
              <span className={s.hoverLabel} style={{ left: (hover.x + 0.5) * cell, top: hover.y * cell, zIndex: 602 }}>
                {hoverText}
              </span>
            ) : null}
          </>
        ) : null}
        {menu?.kind === "closed" ? (
          <div className={s.contextMenu} style={{ left: (state.player.x + 1.2) * cell, top: Math.max(0, (state.player.y - 2) * cell), zIndex: 700 }}>
            <div className={s.contextTitle}>
              {BUILDINGS[menu.building].name} opens at {formatTime(menu.opensAt)}.
            </div>
            <button
              className={s.btn}
              onClick={() => {
                const wait = menu.opensAt - stateRef.current.minute;
                setMenu(null);
                if (wait > 0) act({ type: "wait", minutes: Math.max(10, wait) });
                act({ type: "enter", building: menu.building });
              }}
              type="button"
            >
              Wait until then
            </button>
            <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => setMenu(null)} type="button">
              Never mind
            </button>
          </div>
        ) : null}
        {menu?.kind === "sprinkler" ? (
          <SprinklerMenu
            cell={menu.cell}
            onClose={() => setMenu(null)}
            onTake={() => {
              setMenu(null);
              act({ type: "takeSprinkler", x: menu.cell.x, y: menu.cell.y });
            }}
            state={state}
            style={{ left: (state.player.x + 1.2) * cell, top: Math.max(0, (state.player.y - 2) * cell), zIndex: 700 }}
          />
        ) : null}
        {menu?.kind === "npc" ? (
          <NpcMenu
            npc={menu.npc}
            onClose={() => setMenu(null)}
            onGift={() => {
              setMenu(null);
              open({ kind: "gift", npc: menu.npc });
            }}
            onTalk={() => {
              setMenu(null);
              act({ type: "talk", npc: menu.npc });
            }}
            style={{ left: (state.player.x + 1.2) * cell, top: Math.max(0, (state.player.y - 2) * cell), zIndex: 700 }}
          />
        ) : null}
      </div>
      {zone.id === "farm" ? <Hotbar hot={activeHot} onPick={setHot} ferts={ferts} seeds={seeds} sprinklers={sprinklers} state={state} /> : null}
    </div>
  );
}

function NpcMenu({ npc, onTalk, onGift, onClose, style }: { npc: NpcId; onTalk: () => void; onGift: () => void; onClose: () => void; style: CSSProperties }) {
  return (
    <div className={s.contextMenu} style={style}>
      <div className={s.contextTitle}>{NPCS[npc].name}</div>
      <button className={s.btn} onClick={onTalk} type="button">
        Talk
      </button>
      <button className={s.btnGhost} onClick={onGift} type="button">
        Give a gift…
      </button>
      <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={onClose} type="button">
        Close
      </button>
    </div>
  );
}

function SprinklerMenu({ state, cell, onTake, onClose, style }: { state: RestiaState; cell: Cell; onTake: () => void; onClose: () => void; style: CSSProperties }) {
  const tier = plotAt(state, cell.x, cell.y)?.sprinkler;
  if (!tier) return null;
  return (
    <div className={s.contextMenu} style={style}>
      <div className={s.contextTitle}>{itemDef(sprinklerItem(tier)).name}</div>
      <div className={s.muted}>Waters {SPRINKLER_AREA[tier]} every morning.</div>
      <button className={s.btn} onClick={onTake} type="button">
        Pick up
      </button>
      <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={onClose} type="button">
        Close
      </button>
    </div>
  );
}

function describe(state: RestiaState, target: Target, hot: Hot): string {
  switch (target.kind) {
    case "npc":
      return `${NPCS[target.npc].name} — talk / gift`;
    case "door": {
      const def = BUILDINGS[target.building];
      const level = state.town.levels[target.building];
      if (level < 1) return target.building === "shrine" ? "Snowed-in Weaver's Shrine" : `Ruined lot (${def.name})`;
      return `${def.name}${isOpen(state, target.building) ? "" : " (closed)"}`;
    }
    case "bin":
      return "Shipping Bin — sells overnight";
    case "board":
      return "Outpost Board — build & upgrade";
    case "well":
    case "water":
      return "Refill watering can";
    case "cave":
      return state.flags.catacombsOpen ? "The Old Temple Ruins" : "A sealed temple doorway (Guild rank E needed)";
    case "forage":
      return `Gather ${itemDef(state.forage[target.index]!.item).name}`;
    case "monster": {
      const monster = state.fieldMonsters.find((m) => m.uid === target.uid);
      return monster ? `${MONSTERS[monster.symbol]!.name}${monster.group.length > 1 ? ` +${monster.group.length - 1}` : ""} (Lv ${monster.group[0]!.level}) — fight` : "";
    }
    case "plot": {
      const plot = plotAt(state, target.cell.x, target.cell.y);
      if (!plot) return "";
      if (plot.sprinkler) return `${itemDef(sprinklerItem(plot.sprinkler)).name} — waters ${SPRINKLER_AREA[plot.sprinkler]} each morning${hot.kind === "tool" ? "" : " · click to pick up"}`;
      if (plot.crop) {
        const def = CROPS[plot.crop.id]!;
        if (plot.crop.giant !== undefined) return `Giant ${def.name} — click to harvest`;
        if (isRipe(plot)) return `${def.name} — ripe! Click to harvest`;
        return `${def.name}: ${def.days - plot.crop.growth} day(s) to go${plot.watered ? " · watered" : " · needs water"}`;
      }
      if (plot.debris) return plot.debris === "withered" ? "Withered crop" : plot.debris[0]!.toUpperCase() + plot.debris.slice(1);
      const tool =
        hot.kind === "tool"
          ? ` · ${TOOL_LABEL[hot.tool]} (${toolCost(state, hot.tool)} stamina)`
          : hot.kind === "sprinkler" && !plot.tilled
            ? ` · place ${itemDef(hot.item).name}`
            : "";
      return `${plot.tilled ? (plot.watered ? "Watered soil" : "Tilled soil") : "Soil"}${tool}`;
    }
    case "exit":
      return ZONES[state.player.zone].exits.find((exit) => inRect(exit.rect, target.cell.x, target.cell.y))?.label ?? "";
    case "walk":
      return "";
  }
}

function Hotbar({ state, hot, onPick, seeds, ferts, sprinklers }: { state: RestiaState; hot: Hot; onPick: (hot: Hot) => void; seeds: string[]; ferts: string[]; sprinklers: string[] }) {
  const shownSprinkler = hot.kind === "sprinkler" ? hot.item : sprinklers[0];
  const seedIndex = hot.kind === "seed" ? seeds.indexOf(hot.item) : -1;
  const nextSeed = seeds.length ? seeds[(seedIndex + 1) % seeds.length]! : null;
  return (
    <div className={s.hotbar} onClick={(event) => event.stopPropagation()}>
      <button className={hot.kind === "hand" ? s.hotSlotActive : s.hotSlot} onClick={() => onPick({ kind: "hand" })} title="Hand: harvest / inspect (0)" type="button">
        <span className={s.hotKey}>0</span>✋
      </button>
      {TOOL_ORDER.map((tool, index) => (
        <button
          className={hot.kind === "tool" && hot.tool === tool ? s.hotSlotActive : s.hotSlot}
          key={tool}
          onClick={() => onPick({ kind: "tool", tool })}
          title={`${TOOL_LABEL[tool]} Lv ${state.tools[tool]} (${index + 1})`}
          type="button"
        >
          <span className={s.hotKey}>{index + 1}</span>
          <IconSprite icon={{ sheet: "a", index: TOOL_ICON[tool] }} size={40} />
          <span className={s.hotLevel}>{tool === "can" ? `${state.water}` : `Lv${state.tools[tool]}`}</span>
        </button>
      ))}
      <button
        className={hot.kind === "seed" ? s.hotSlotActive : s.hotSlot}
        disabled={!seeds.length}
        onClick={() => nextSeed && onPick({ kind: "seed", item: hot.kind === "seed" ? nextSeed : seeds[0]! })}
        title={hot.kind === "seed" ? `${itemDef(hot.item).name} x${state.inventory[hot.item] ?? 0} (6 = next seed)` : "Seeds (6)"}
        type="button"
      >
        <span className={s.hotKey}>6</span>
        {hot.kind === "seed" ? <ItemIcon id={hot.item} size={40} /> : seeds[0] ? <ItemIcon id={seeds[0]} size={40} /> : "🌱"}
        {hot.kind === "seed" ? <span className={s.hotLevel}>{state.inventory[hot.item] ?? 0}</span> : null}
      </button>
      <button
        className={hot.kind === "fert" ? s.hotSlotActive : s.hotSlot}
        disabled={!ferts.length}
        onClick={() => ferts[0] && onPick({ kind: "fert", item: hot.kind === "fert" ? ferts[(ferts.indexOf(hot.item) + 1) % ferts.length]! : ferts[0] })}
        title="Fertilizer (7)"
        type="button"
      >
        <span className={s.hotKey}>7</span>
        {ferts[0] ? <ItemIcon id={hot.kind === "fert" ? hot.item : ferts[0]} size={40} /> : "🧪"}
      </button>
      <button
        className={`${hot.kind === "sprinkler" ? s.hotSlotActive : s.hotSlot} ${s.sprinklerSlot} ${shownSprinkler ? s[`sprinklerTier${ITEMS[shownSprinkler]!.sprinkler}`] ?? "" : ""}`}
        disabled={!sprinklers.length}
        onClick={() => sprinklers[0] && onPick({ kind: "sprinkler", item: hot.kind === "sprinkler" ? sprinklers[(sprinklers.indexOf(hot.item) + 1) % sprinklers.length]! : sprinklers[0] })}
        title={shownSprinkler ? `${itemDef(shownSprinkler).name} x${state.inventory[shownSprinkler] ?? 0}: click an untilled field plot (8 = next sprinkler)` : "Sprinklers (8): forge them at the Smithy"}
        type="button"
      >
        <span className={s.hotKey}>8</span>
        {shownSprinkler ? (
          <>
            <SprinklerSprite size={46} tier={ITEMS[shownSprinkler]!.sprinkler!} />
            <span className={s.sprinklerLabel}>
              <b>{TIER_MARK[ITEMS[shownSprinkler]!.sprinkler!]}</b> x{state.inventory[shownSprinkler] ?? 0}
            </span>
          </>
        ) : (
          <span className={s.sprinklerEmpty}>Sprinkler</span>
        )}
      </button>
    </div>
  );
}

