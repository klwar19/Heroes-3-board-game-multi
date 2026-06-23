import { describe, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import {
  createAdventureGameState,
  hexToPixel,
  tileFootprint,
} from "../src/engine/index";
import { getTileFootprintSpaceIds } from "../src/engine/adventure";
import { coreFactionDefinitions } from "@/data/factions/core";
import { scenarioDefinitions } from "@/data/map/scenarios";
import type { HexCoord } from "../src/engine/hex";

const OUT =
  process.env.MAP_OUT ||
  "/tmp/claude-0/-home-user-Heroes-3-board-game-multi/6d676c66-97b4-529a-a59d-a185250540e8/scratchpad/maps";
const SIZE = 16;
const PLAYER_COLORS = ["#d64545", "#3b7dd8", "#3fae5a", "#e0b020"];
const FACTIONS = [
  "castle",
  "rampart",
  "inferno",
  "stronghold",
  "necropolis",
  "dungeon",
  "tower",
  "fortress",
  "conflux",
  "cove",
];

function hexPath(c: HexCoord, size: number): string {
  const { x, y } = hexToPixel(c, size);
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const ang = (Math.PI / 180) * (60 * i - 90); // pointy-top: vertex up
    pts.push(
      `${(x + size * Math.cos(ang)).toFixed(1)},${(y + size * Math.sin(ang)).toFixed(1)}`,
    );
  }
  return pts.join(" ");
}

function renderScenario(id: string): { svg: string; w: number; h: number } {
  const s = scenarioDefinitions[id];
  const n = s.minPlayers;
  const state = createAdventureGameState({
    seed: `pic-${id}`,
    scenarioId: id,
    rollFirstPlayer: false,
    creatureBanks: false,
    players: Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`,
      name: FACTIONS[i],
      factionId: FACTIONS[i] as never,
      heroDefId: coreFactionDefinitions[FACTIONS[i]].heroes[0],
    })),
  });
  const adv = state.adventure!;
  const tiles = Object.values(adv.tiles);
  const seatIndexByTile = new Map<string, number>();
  Object.values(state.towns).forEach((t) => {
    const tile = tiles.find((ti) =>
      getTileFootprintSpaceIds(ti).includes(t.fieldId!),
    );
    if (tile)
      seatIndexByTile.set(tile.id, Number(t.controllerId.replace("p", "")) - 1);
  });

  // bounds
  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  for (const t of tiles) {
    for (const c of tileFootprint(
      { row: t.centerRow, col: t.centerCol },
      t.rotation,
    )) {
      const { x, y } = hexToPixel(c, SIZE);
      minX = Math.min(minX, x - SIZE);
      minY = Math.min(minY, y - SIZE);
      maxX = Math.max(maxX, x + SIZE);
      maxY = Math.max(maxY, y + SIZE);
    }
  }
  const pad = 18,
    titleH = 54;
  const w = Math.max(maxX - minX + pad * 2, 430); // fit the subtitle line
  const h = maxY - minY + pad * 2 + titleH;
  const tx = -minX + pad,
    ty = -minY + pad + titleH;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#11151c"/>`);

  const terrain = id.split("-")[0];
  const fillFor = (
    t: (typeof tiles)[number],
  ): { fill: string; back: string } => {
    if (!t.faceDown) return { fill: "#26331f", back: "#3a4a2c" };
    if (t.group === "sea") {
      const band = (t as { band?: string }).band;
      return band === "vi-vii"
        ? { fill: "#14476b", back: "#1b5e8c" }
        : { fill: "#1f6ea8", back: "#2a86c4" };
    }
    if (t.group === "subterranean") return { fill: "#3c2a5e", back: "#553c84" };
    if (t.group === "center") return { fill: "#7a5c12", back: "#b8860b" }; // Ⅵ–Ⅶ hub
    if (t.group === "far") return { fill: "#6b4a1f", back: "#8a6326" }; // Ⅱ–Ⅲ outer
    return { fill: "#2f5d2f", back: "#3f7d3f" }; // Ⅳ–Ⅴ near
  };

  for (const t of tiles) {
    const foot = tileFootprint(
      { row: t.centerRow, col: t.centerCol },
      t.rotation,
    );
    const seatIdx = seatIndexByTile.get(t.id);
    const colors = fillFor(t);
    foot.forEach((c, slot) => {
      const field = adv.fields[`h:${c.row}:${c.col}`];
      let fill = colors.fill;
      const stroke = "#0c0f14";
      if (seatIdx !== undefined) {
        fill = "#202a36";
        if (slot === 0) fill = PLAYER_COLORS[seatIdx];
        if (field?.location === "subterranean_gate") fill = "#d4af37";
      }
      parts.push(
        `<polygon points="${hexPath(c, SIZE - 1)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
      );
    });
    // back / label on the tile centre
    const ctr = hexToPixel({ row: t.centerRow, col: t.centerCol }, SIZE);
    if (seatIdx !== undefined) {
      parts.push(
        `<text x="${ctr.x.toFixed(1)}" y="${(ctr.y + 4).toFixed(1)}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#fff" text-anchor="middle">P${seatIdx + 1}</text>`,
      );
    } else {
      const label =
        t.group === "center"
          ? "Ⅵ–Ⅶ"
          : t.group === "sea"
            ? ((t as { band?: string }).band === "vi-vii" ? "Ⅵ–Ⅶ" : "Ⅳ–Ⅴ")
            : t.group === "subterranean"
              ? "⛰"
              : t.group === "far"
                ? "Ⅱ–Ⅲ"
                : "Ⅳ–Ⅴ";
      const fs = label.length > 2 ? 9 : 13;
      parts.push(
        `<text x="${ctr.x.toFixed(1)}" y="${(ctr.y + 4).toFixed(1)}" font-family="sans-serif" font-size="${fs}" fill="#e8e8e8" text-anchor="middle" opacity="0.9">${label}</text>`,
      );
    }
  }
  const sym =
    n === 2
      ? "180° rotational (C2)"
      : n === 3
        ? "120° rotational (C3)"
        : "180° + mirror (D2)";
  const title = `${s.name}`;
  const sub = `${n} players · ${terrain} · symmetric: ${sym}`;
  const head =
    `<text x="${pad}" y="24" font-family="sans-serif" font-size="18" font-weight="bold" fill="#fff">${title}</text>` +
    `<text x="${pad}" y="44" font-family="sans-serif" font-size="13" fill="#9fb3c8">${sub}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">${head}<g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)})">${parts.join("")}</g></svg>`;
  return { svg, w, h };
}

const IDS = ["land-2p", "sea-2p", "underground-2p"];

describe("render maps", () => {
  it("writes SVG + PNG for each symmetric scenario and a combined overview", async () => {
    mkdirSync(OUT, { recursive: true });
    const cells: { id: string; svg: string; w: number; h: number }[] = [];
    for (const id of IDS) {
      const r = renderScenario(id);
      writeFileSync(`${OUT}/${id}.svg`, r.svg);
      await sharp(Buffer.from(r.svg)).png().toFile(`${OUT}/${id}.png`);
      cells.push({ id, ...r });
    }
    // Combined row of the three terrains (land · sea · underground), 2 players.
    const order = IDS;
    const cellW = Math.max(...cells.map((c) => c.w));
    const cellH = Math.max(...cells.map((c) => c.h));
    const cols = order.length,
      rows = 1,
      gap = 10;
    const W = cols * cellW + (cols + 1) * gap;
    const H = rows * cellH + (rows + 1) * gap;
    const inner = order
      .map((id, i) => {
        const c = cells.find((x) => x.id === id)!;
        const cx = gap + (i % cols) * (cellW + gap);
        const cy = gap + Math.floor(i / cols) * (cellH + gap);
        const body = c.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
        return `<svg x="${cx}" y="${cy}" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w.toFixed(0)} ${c.h.toFixed(0)}"><rect width="${c.w}" height="${c.h}" fill="#11151c" stroke="#2a3340"/>${body}</svg>`;
      })
      .join("");
    const grid = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}"><rect width="${W}" height="${H}" fill="#070a0e"/>${inner}</svg>`;
    writeFileSync(`${OUT}/_overview.svg`, grid);
    await sharp(Buffer.from(grid)).png().toFile(`${OUT}/_overview.png`);
    console.log("wrote maps to", OUT);
  });
});
