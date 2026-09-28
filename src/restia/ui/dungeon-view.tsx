"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dir, DispatchResult, DungeonState, RestiaAction, RestiaState } from "../engine/types";
import { themeForFloor } from "../data/dungeon";
import { MONSTERS } from "../data/monsters";
import { tileAt } from "../engine/dungeon";
import { hashString } from "../engine/core";
import { A, CHIBI, SHEETS } from "./assets";
import { Chibi, DungeonSprite, SpriteStill } from "./sprites";
import s from "./restia.module.css";

const VIEW_COLS = 17;
const VIEW_ROWS = 11;
const TILE = 96;

const TILES = { floor: [0, 1, 2], dirt: 3, wallTop: 4, wallFront: 5, down: 6, up: 7, chest: 8, chestOpen: 9, ore: 10, herb: 11 } as const;

function useSheet(): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = A(SHEETS.dungeon);
  }, []);
  return image;
}

function drawTile(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement, index: number, x: number, y: number, size: number): void {
  const sx = (index % 4) * TILE;
  const sy = Math.floor(index / 4) * TILE;
  ctx.drawImage(sheet, sx, sy, TILE, TILE, x * size, y * size, size + 0.5, size + 0.5);
}

function draw(canvas: HTMLCanvasElement, sheet: HTMLImageElement, dungeon: DungeonState, size: number): void {
  canvas.width = dungeon.w * size;
  canvas.height = dungeon.h * size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#050403";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < dungeon.h; y++) {
    for (let x = 0; x < dungeon.w; x++) {
      if (dungeon.seen[y * dungeon.w + x] !== "1") continue;
      const tile = tileAt(dungeon, x, y);
      if (tile === "#") {
        const below = tileAt(dungeon, x, y + 1);
        drawTile(ctx, sheet, below !== "#" ? TILES.wallFront : TILES.wallTop, x, y, size);
        continue;
      }
      drawTile(ctx, sheet, TILES.floor[hashString(`${dungeon.floor}:${x}:${y}`) % 3]!, x, y, size);
      if (tile === ">") drawTile(ctx, sheet, TILES.down, x, y, size);
      if (tile === "<") drawTile(ctx, sheet, TILES.up, x, y, size);
    }
  }
}

function pathTo(dungeon: DungeonState, goal: { x: number; y: number }): Dir[] | null {
  const key = (x: number, y: number) => y * dungeon.w + x;
  const blocked = new Set([
    ...dungeon.monsters.map((m) => key(m.x, m.y)),
    ...dungeon.chests.filter((c) => !c.opened).map((c) => key(c.x, c.y)),
    ...dungeon.nodes.filter((n) => !n.used).map((n) => key(n.x, n.y))
  ]);
  const prev = new Map<number, [number, Dir]>();
  const start = key(dungeon.x, dungeon.y);
  const seen = new Set([start]);
  const queue = [{ x: dungeon.x, y: dungeon.y }];
  const dirs: [Dir, number, number][] = [
    ["up", 0, -1],
    ["down", 0, 1],
    ["left", -1, 0],
    ["right", 1, 0]
  ];
  while (queue.length) {
    const cell = queue.shift()!;
    if (cell.x === goal.x && cell.y === goal.y) {
      const out: Dir[] = [];
      let at = key(cell.x, cell.y);
      while (at !== start) {
        const [from, dir] = prev.get(at)!;
        out.unshift(dir);
        at = from;
      }
      return out;
    }
    for (const [dir, dx, dy] of dirs) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || tileAt(dungeon, nx, ny) === "#" || dungeon.seen[k] !== "1") continue;
      if (blocked.has(k) && !(nx === goal.x && ny === goal.y)) continue;
      seen.add(k);
      prev.set(k, [key(cell.x, cell.y), dir]);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

export function DungeonView({ state, act, locked }: { state: RestiaState; act: (action: RestiaAction) => DispatchResult; locked: boolean }) {
  const dungeon = state.dungeon!;
  const theme = themeForFloor(dungeon.floor);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const sheet = useSheet();
  const [stage, setStage] = useState({ w: 1000, h: 600 });
  const [walking, setWalking] = useState(false);
  const walkToken = useRef(0);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setStage({ w: element.clientWidth, h: element.clientHeight }));
    observer.observe(element);
    setStage({ w: element.clientWidth, h: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  const size = Math.max(28, Math.floor(Math.min(stage.w / VIEW_COLS, stage.h / VIEW_ROWS)));

  useEffect(() => {
    if (canvasRef.current && sheet) draw(canvasRef.current, sheet, dungeon, size);
  }, [dungeon, sheet, size]);

  const step = useCallback((dir: Dir) => act({ type: "dStep", dir }), [act]);

  const walk = useCallback(
    (goal: { x: number; y: number }) => {
      const current = stateRef.current.dungeon;
      if (!current) return;
      const path = pathTo(current, goal);
      if (!path || !path.length) return;
      const token = ++walkToken.current;
      setWalking(true);
      let index = 0;
      const tick = () => {
        if (token !== walkToken.current) return;
        const before = stateRef.current;
        if (index >= path.length || !before.dungeon || before.battle || before.scene) {
          setWalking(false);
          return;
        }
        const result = act({ type: "dStep", dir: path[index]! });
        stateRef.current = result.state;
        index += 1;
        const after = result.state.dungeon;
        if (!after || result.state.battle || after.floor !== before.dungeon.floor || (after.x === before.dungeon.x && after.y === before.dungeon.y)) {
          setWalking(false);
          return;
        }
        window.setTimeout(tick, 120);
      };
      tick();
    },
    [act]
  );

  useEffect(() => {
    if (locked) return;
    let last = 0;
    const onKey = (event: KeyboardEvent) => {
      const dirs: Record<string, Dir> = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
      const dir = dirs[event.key];
      if (dir) {
        event.preventDefault();
        const now = performance.now();
        if (now - last < 100) return;
        last = now;
        walkToken.current += 1;
        step(dir);
      } else if (event.key === "e" || event.key === "E" || event.key === " " || event.key === "Enter") {
        event.preventDefault();
        act({ type: "dInteract" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, locked, step]);

  const camX = Math.min(0, Math.max(stage.w - dungeon.w * size, stage.w / 2 - (dungeon.x + 0.5) * size));
  const camY = Math.min(0, Math.max(stage.h - dungeon.h * size, stage.h / 2 - (dungeon.y + 0.5) * size));
  const seen = (x: number, y: number) => dungeon.seen[y * dungeon.w + x] === "1";
  const here = tileAt(dungeon, dungeon.x, dungeon.y);
  const adjacentThing =
    dungeon.chests.some((c) => !c.opened && Math.abs(c.x - dungeon.x) + Math.abs(c.y - dungeon.y) === 1) ||
    dungeon.nodes.some((n) => !n.used && Math.abs(n.x - dungeon.x) + Math.abs(n.y - dungeon.y) === 1);

  return (
    <div className={s.dungeon} ref={stageRef}>
      <div className={s.dungeonLayer} style={{ width: dungeon.w * size, height: dungeon.h * size, transform: `translate(${camX}px, ${camY}px)` }}>
        <canvas ref={canvasRef} style={{ position: "absolute", left: 0, top: 0, filter: theme.tint === "none" ? undefined : theme.tint }} />
        {dungeon.chests.map((chest) =>
          seen(chest.x, chest.y) ? (
            <DungeonSprite index={chest.opened ? TILES.chestOpen : TILES.chest} key={`c${chest.x},${chest.y}`} size={size} style={{ position: "absolute", left: chest.x * size, top: chest.y * size, zIndex: 2 }} />
          ) : null
        )}
        {dungeon.nodes.map((node) =>
          seen(node.x, node.y) && !node.used ? (
            <DungeonSprite className={s.glow} index={node.kind === "ore" ? TILES.ore : TILES.herb} key={`n${node.x},${node.y}`} size={size} style={{ position: "absolute", left: node.x * size, top: node.y * size, zIndex: 2 }} />
          ) : null
        )}
        {dungeon.monsters.map((monster) =>
          seen(monster.x, monster.y) ? (
            <span
              key={monster.uid}
              style={{ position: "absolute", left: (monster.x + 0.5) * size, top: (monster.y + 1) * size, transform: "translate(-50%, -100%)", zIndex: 3 + monster.y, transition: "left 0.12s linear, top 0.12s linear", filter: monster.frozen ? "grayscale(1) opacity(0.6)" : undefined }}
            >
              <SpriteStill height={size * (monster.boss ? 2.4 : 1.5)} slug={MONSTERS[monster.symbol]!.sprite} />
              {monster.group.length > 1 ? <span className={s.nameTag}>x{monster.group.length}</span> : null}
            </span>
          ) : null
        )}
        <span style={{ position: "absolute", left: (dungeon.x + 0.5) * size - size * 0.9, top: (dungeon.y + 1) * size - size * 1.8, zIndex: 4 + dungeon.y, transition: "left 0.12s linear, top 0.12s linear" }}>
          <Chibi dir={dungeon.facing} sheet={A(CHIBI.bin!)} size={size * 1.8} walking={walking} />
        </span>
        <div
          onClick={(event) => {
            if (locked) return;
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const x = Math.floor((event.clientX - rect.left) / size);
            const y = Math.floor((event.clientY - rect.top) / size);
            const distance = Math.abs(x - dungeon.x) + Math.abs(y - dungeon.y);
            if (distance === 0) act({ type: "dInteract" });
            else if (distance === 1) {
              const isThing = dungeon.chests.some((c) => !c.opened && c.x === x && c.y === y) || dungeon.nodes.some((n) => !n.used && n.x === x && n.y === y);
              if (isThing) act({ type: "dInteract" });
              else step(x > dungeon.x ? "right" : x < dungeon.x ? "left" : y > dungeon.y ? "down" : "up");
            } else walk({ x, y });
          }}
          style={{ position: "absolute", inset: 0, zIndex: 50, cursor: "pointer" }}
        />
      </div>
      <div className={s.dungeonHud}>
        <b>
          {theme.name} · B{dungeon.floor}
        </b>
        {here === ">" ? (
          <button className={`${s.btn} ${s.btnSmall}`} onClick={() => act({ type: "dInteract" })} type="button">
            Descend ▼
          </button>
        ) : null}
        {here === "<" ? (
          <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "leaveDungeon" })} type="button">
            Leave ▲
          </button>
        ) : null}
        {adjacentThing ? (
          <button className={`${s.btn} ${s.btnSmall}`} onClick={() => act({ type: "dInteract" })} type="button">
            Open / Gather (E)
          </button>
        ) : null}
        {(state.inventory.returnScroll ?? 0) > 0 ? (
          <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "useItem", item: "returnScroll", target: "bin" })} type="button">
            Return Scroll ({state.inventory.returnScroll})
          </button>
        ) : null}
      </div>
      <div className={s.pad}>
        <span />
        <button onClick={() => step("up")} type="button">
          ▲
        </button>
        <span />
        <button onClick={() => step("left")} type="button">
          ◀
        </button>
        <button onClick={() => act({ type: "dInteract" })} type="button">
          E
        </button>
        <button onClick={() => step("right")} type="button">
          ▶
        </button>
        <span />
        <button onClick={() => step("down")} type="button">
          ▼
        </button>
        <span />
      </div>
    </div>
  );
}
