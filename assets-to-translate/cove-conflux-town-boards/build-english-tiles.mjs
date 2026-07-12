#!/usr/bin/env node
/**
 * Cove / Conflux town-board art pipeline
 *
 * 1. Clean crops of the printed building portrait tiles (top strip of the scan)
 * 2. English UNBUILT plaques — exact names + costs + Homm3BG resource glyphs
 *    (code-composited, no AI text, no white boxes)
 * 3. English definition cards — exact rules text + legend glyphs
 * 4. REVIEW pack under review/
 *
 * Glyphs: https://github.com/Heegu-sama/Homm3BG/tree/main/assets/glyphs
 *         (mirrored in glyphs-ref/)
 */
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const REPO = path.resolve(ROOT, "../..");
const SOURCE = path.join(ROOT, "source");
const CROPPED = path.join(ROOT, "cropped");
const ENGLISH = path.join(ROOT, "english");
const FINAL = path.join(ROOT, "final");
const REVIEW = path.join(ROOT, "review");
const GLYPHS = path.join(ROOT, "glyphs-ref");
const FONT = path.join(REPO, "public/fonts/LiberationSerif-Bold.ttf");
const FONT_REG = path.join(REPO, "public/fonts/LiberationSerif-Regular.ttf");

const TILE_W = 385;
const TILE_H = 813;

/** Top-row portrait tiles as printed L→R on the scan. */
const COVE_TOP = [
  { id: "thieves_guild", name: "Thieves' Guild", cost: { gold: 4, buildingMaterials: 2, valuables: 1 } },
  { id: "city_hall", name: "City Hall", cost: { gold: 10, buildingMaterials: 4, valuables: 0 } },
  { id: "dwelling_bronze", name: "Bay", cost: { gold: 4, buildingMaterials: 3, valuables: 1 } },
  { id: "mage_guild", name: "Mage Guild", cost: { gold: 4, buildingMaterials: 2, valuables: 1 } },
  { id: "dwelling_gold", name: "Redoubled Vortex", cost: { gold: 10, buildingMaterials: 8, valuables: 4 } },
  { id: "citadel", name: "Citadel", cost: { gold: 8, buildingMaterials: 4, valuables: 1 } },
  { id: "dwelling_silver", name: "Nests Towering the Seas", cost: { gold: 8, buildingMaterials: 6, valuables: 3 } }
];
/** Shared-bar partner with no separate top-row art on this photo. */
const COVE_EXTRA = [
  { id: "pub", name: "Pub", cost: { gold: 3, buildingMaterials: 2, valuables: 0 } }
];

const CONFLUX_TOP = [
  { id: "city_hall", name: "City Hall", cost: { gold: 10, buildingMaterials: 3, valuables: 0 } },
  { id: "magic_university", name: "Magic University", cost: { gold: 6, buildingMaterials: 3, valuables: 0 } },
  { id: "mage_guild", name: "Mage Guild", cost: { gold: 4, buildingMaterials: 2, valuables: 1 } },
  { id: "dwelling_silver", name: "Altars of Fire and Earth", cost: { gold: 8, buildingMaterials: 6, valuables: 3 } },
  { id: "dwelling_gold", name: "Magical Pyre", cost: { gold: 9, buildingMaterials: 8, valuables: 4 } },
  { id: "citadel", name: "Citadel", cost: { gold: 8, buildingMaterials: 4, valuables: 1 } },
  { id: "dwelling_bronze", name: "Altars of Air and Water", cost: { gold: 4, buildingMaterials: 3, valuables: 1 } }
];
const CONFLUX_EXTRA = [
  { id: "garden_of_life", name: "Garden of Life", cost: { gold: 2, buildingMaterials: 1, valuables: 1 } }
];

/** Crop boxes measured on source scans (x0,y0,x1,y1 inclusive search), refined by content. */
const CROP_SPECS = {
  cove: {
    file: "cove.webp",
    boardTop: 262,
    ty0: 6,
    seams: [
      [457, 576],
      [578, 687],
      [689, 806],
      [808, 920],
      [922, 1031],
      [1033, 1144],
      [1146, 1256]
    ]
  },
  conflux: {
    file: "conflux.webp",
    boardTop: 288,
    ty0: 29,
    seams: [
      [443, 554],
      [556, 667],
      [669, 782],
      [784, 908],
      [910, 1023],
      [1025, 1138],
      [1140, 1256]
    ]
  }
};

function isBg(data, w, x, y) {
  const i = (y * w + x) * 4;
  const r = data[i],
    g = data[i + 1],
    b = data[i + 2];
  return r > 200 && g > 200 && b > 200 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20;
}

function contentBBox(data, w, h, x0, y0, x1, y1) {
  let minX = x1,
    maxX = x0,
    minY = y1,
    maxY = y0,
    found = false;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!isBg(data, w, x, y)) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return null;
  // Drop the thin board-frame bleed at the bottom of the portrait tiles.
  const trimBottom = 6;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: Math.max(40, maxY - minY + 1 - trimBottom)
  };
}

async function loadRaw(file) {
  const { data, info } = await sharp(file).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function fontFaceCss() {
  const bold = readFileSync(FONT).toString("base64");
  const reg = readFileSync(FONT_REG).toString("base64");
  return `
    @font-face { font-family: 'LibSerif'; src: url('data:font/ttf;base64,${reg}') format('truetype'); font-weight: 400; }
    @font-face { font-family: 'LibSerif'; src: url('data:font/ttf;base64,${bold}') format('truetype'); font-weight: 700; }
  `;
}

function glyphDataUri(name, size = 28) {
  const p = path.join(GLYPHS, `${name}.png`);
  if (!existsSync(p)) return null;
  const b64 = readFileSync(p).toString("base64");
  return { href: `data:image/png;base64,${b64}`, size };
}

/** Cost row: N + gold / materials / valuables glyphs (Homm3BG legend). */
function costRowSvg(cost, opts = {}) {
  const { fontSize = 22, icon = 26, gap = 10, x = 0, y = 0 } = opts;
  const parts = [];
  let cx = x;
  const add = (n, glyph) => {
    const g = glyphDataUri(glyph, icon);
    parts.push(`<text x="${cx}" y="${y}" font-family="LibSerif" font-weight="700" font-size="${fontSize}" fill="#f5e6c8" dominant-baseline="middle">${n}</text>`);
    cx += String(n).length * fontSize * 0.55 + 4;
    if (g) {
      parts.push(`<image href="${g.href}" x="${cx}" y="${y - icon / 2}" width="${icon}" height="${icon}" />`);
      cx += icon + gap;
    } else {
      cx += gap;
    }
  };
  add(cost.gold ?? 0, "gold");
  add(cost.buildingMaterials ?? 0, "building_materials");
  add(cost.valuables ?? 0, "valuables");
  return { svg: parts.join("\n"), width: cx - x };
}

async function makeUnbuiltPlaque(building, outPath) {
  // Match Factory unbuilt: tall wood tile, green name banner, brown cost bar.
  const woodPath = path.join(GLYPHS, "wood-bg.webp");
  const wood = existsSync(woodPath)
    ? await sharp(woodPath).resize(TILE_W, TILE_H, { fit: "fill" }).toBuffer()
    : await sharp({
        create: { width: TILE_W, height: TILE_H, channels: 3, background: { r: 72, g: 48, b: 28 } }
      })
        .png()
        .toBuffer();

  const name = building.name;
  // Two-line names when long
  const words = name.split(" ");
  let line1 = name;
  let line2 = "";
  if (name.length > 14 && words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    line1 = words.slice(0, mid).join(" ");
    line2 = words.slice(mid).join(" ");
  }
  const titleSize = name.length > 18 ? 28 : name.length > 12 ? 32 : 36;
  const cost = costRowSvg(building.cost, { fontSize: 28, icon: 32, gap: 14 });
  const costX = Math.round((TILE_W - cost.width) / 2);

  const plaqueH = line2 ? 168 : 140;
  const plaqueTop = Math.round((TILE_H - plaqueH) / 2) - 20;

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${TILE_W}" height="${TILE_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>${fontFaceCss()}
      .title { font-family: LibSerif; font-weight: 700; fill: #f4ecd4; text-anchor: middle; }
    </style>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a6b3a"/>
      <stop offset="100%" stop-color="#2f4a28"/>
    </linearGradient>
  </defs>
  <!-- name banner -->
  <rect x="42" y="${plaqueTop}" width="${TILE_W - 84}" height="${line2 ? 92 : 64}" rx="4" fill="url(#g)" stroke="#c9b896" stroke-width="2"/>
  <text class="title" x="${TILE_W / 2}" y="${plaqueTop + (line2 ? 38 : 42)}" font-size="${titleSize}">${escapeXml(line1)}</text>
  ${line2 ? `<text class="title" x="${TILE_W / 2}" y="${plaqueTop + 72}" font-size="${titleSize}">${escapeXml(line2)}</text>` : ""}
  <!-- cost bar -->
  <rect x="42" y="${plaqueTop + (line2 ? 92 : 64)}" width="${TILE_W - 84}" height="48" rx="0" fill="#3a2a1c" stroke="#c9b896" stroke-width="2"/>
  <g transform="translate(0, ${plaqueTop + (line2 ? 92 : 64) + 24})">
    ${cost.svg.replace(/x="/g, (m) => m).replace(/x="(\d+)"/g, (_, n) => `x="${Number(n) + costX}"`)}
  </g>
</svg>`);

  // Rebuild cost row with centered positions more carefully
  const costCentered = costRowSvg(building.cost, {
    fontSize: 28,
    icon: 32,
    gap: 14,
    x: costX,
    y: plaqueTop + (line2 ? 92 : 64) + 24
  });

  const svg2 = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${TILE_W}" height="${TILE_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>${fontFaceCss()}
      .title { font-family: LibSerif; font-weight: 700; fill: #f4ecd4; text-anchor: middle; }
    </style>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a6b3a"/>
      <stop offset="100%" stop-color="#2f4a28"/>
    </linearGradient>
  </defs>
  <rect x="42" y="${plaqueTop}" width="${TILE_W - 84}" height="${line2 ? 92 : 64}" rx="4" fill="url(#g)" stroke="#c9b896" stroke-width="2"/>
  <text class="title" x="${TILE_W / 2}" y="${plaqueTop + (line2 ? 38 : 42)}" font-size="${titleSize}">${escapeXml(line1)}</text>
  ${line2 ? `<text class="title" x="${TILE_W / 2}" y="${plaqueTop + 72}" font-size="${titleSize}">${escapeXml(line2)}</text>` : ""}
  <rect x="42" y="${plaqueTop + (line2 ? 92 : 64)}" width="${TILE_W - 84}" height="48" fill="#3a2a1c" stroke="#c9b896" stroke-width="2"/>
  ${costCentered.svg}
</svg>`);

  await sharp(wood)
    .composite([{ input: await sharp(svg2).png().toBuffer(), top: 0, left: 0 }])
    .webp({ quality: 90 })
    .toFile(outPath);
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Definition card: dark leather panel + green title bar + body text with inline glyphs.
 * bodyLines: array of segments: string | {g: glyphName} | {n: number}
 */
async function makeDefinitionCard({ title, iconGlyph, body, outPath, width = 420, height = 280 }) {
  const titleIcon = glyphDataUri(iconGlyph || "building_city_hall", 28);
  const lines = wrapBody(body, 46);
  const lineH = 22;
  const bodyTop = 58;
  let bodySvg = "";
  let y = bodyTop;
  for (const line of lines) {
    bodySvg += renderInlineLine(line, 18, y, 16) + "\n";
    y += lineH;
  }

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>${fontFaceCss()}
      .t { font-family: LibSerif; font-weight: 700; fill: #f4ecd4; }
      .b { font-family: LibSerif; font-weight: 400; fill: #e8dcc0; }
    </style>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3d5a32"/>
      <stop offset="100%" stop-color="#2a4024"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="8" fill="#1a1510" stroke="#8a7350" stroke-width="3"/>
  <rect x="8" y="8" width="${width - 16}" height="36" rx="4" fill="url(#g)" stroke="#b8a478" stroke-width="1"/>
  ${titleIcon ? `<image href="${titleIcon.href}" x="16" y="12" width="28" height="28"/>` : ""}
  <text class="t" x="${titleIcon ? 50 : 18}" y="32" font-size="18">${escapeXml(title)}</text>
  ${bodySvg}
</svg>`);

  await sharp(svg).webp({ quality: 92 }).toFile(outPath);
}

/** Tokenize body into strings and glyph tokens: "text {gold} text {experience}" */
function tokenize(body) {
  const re = /\{([a-z0-9_]+)\}|(\d+)|([^{}\d]+)/gi;
  const out = [];
  let m;
  while ((m = re.exec(body))) {
    if (m[1]) out.push({ g: m[1] });
    else if (m[2]) out.push({ n: m[2] });
    else if (m[3]) out.push({ t: m[3] });
  }
  return out;
}

function wrapBody(body, maxChars) {
  // Simple wrap on spaces, keeping glyph tokens attached.
  const tokens = tokenize(body);
  const lines = [];
  let cur = [];
  let len = 0;
  for (const tok of tokens) {
    const piece = tok.t ? tok.t : tok.n ? tok.n : "@@";
    const add = piece.length;
    if (len + add > maxChars && cur.length) {
      lines.push(cur);
      cur = [];
      len = 0;
      if (tok.t) {
        const trimmed = { t: tok.t.replace(/^\s+/, "") };
        if (trimmed.t) {
          cur.push(trimmed);
          len += trimmed.t.length;
        }
        continue;
      }
    }
    cur.push(tok);
    len += add;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function renderInlineLine(tokens, x, y, fontSize) {
  let cx = x;
  let s = "";
  const icon = fontSize + 4;
  for (const tok of tokens) {
    if (tok.t) {
      s += `<text class="b" x="${cx}" y="${y}" font-size="${fontSize}">${escapeXml(tok.t)}</text>`;
      cx += tok.t.length * fontSize * 0.48;
    } else if (tok.n) {
      s += `<text class="t" x="${cx}" y="${y}" font-size="${fontSize}">${tok.n}</text>`;
      cx += tok.n.length * fontSize * 0.55;
    } else if (tok.g) {
      const g = glyphDataUri(tok.g, icon);
      if (g) {
        s += `<image href="${g.href}" x="${cx}" y="${y - icon + 4}" width="${icon}" height="${icon}"/>`;
        cx += icon + 2;
      } else {
        s += `<text class="b" x="${cx}" y="${y}" font-size="${fontSize - 2}">[${tok.g}]</text>`;
        cx += (tok.g.length + 2) * fontSize * 0.4;
      }
    }
  }
  return s;
}

const DEFS = {
  cove: [
    {
      id: "city_hall",
      title: "City Hall",
      icon: "building_city_hall",
      body: "At the beginning of each Resource round, choose: {gold}4  — OR — Remove 1 {artifact} from your hand to gain 1 {experience}."
    },
    {
      id: "citadel",
      title: "Citadel",
      icon: "building_citadel",
      body: "Unlocks Reinforcing units. When the town is under siege, place 3 Wall cards, a Gate card and an Arrow Tower card on the Combat board."
    },
    {
      id: "mage_guild",
      title: "Mage Guild",
      icon: "building_mage_guild",
      body: "During the building round: twice Search(2) {spell}. During later rounds: once per round pay {gold}5 to Search(2) {spell}."
    },
    {
      id: "thieves_guild",
      title: "Thieves' Guild",
      icon: "hand",
      body: "Once during your turn, choose any deck (including another player's M&M deck), look at its top 2 cards, put one on its discard pile and the other back on top of that deck."
    },
    {
      id: "pub",
      title: "Pub",
      icon: "recruit",
      body: "During each Astrologers' round, while Reinforcing units you may reduce one reinforcement's cost by {gold}3 (to a minimum of 0)."
    }
  ],
  conflux: [
    {
      id: "city_hall",
      title: "City Hall",
      icon: "building_city_hall",
      body: "At the beginning of each Resource round, choose: {gold}4  — OR — Search(3) {spell}."
    },
    {
      id: "citadel",
      title: "Citadel",
      icon: "building_citadel",
      body: "Unlocks Reinforcing units. When the town is under siege, place 3 Wall cards, a Gate card and an Arrow Tower card on the Combat board."
    },
    {
      id: "mage_guild",
      title: "Mage Guild",
      icon: "building_mage_guild",
      body: "During the building round: twice Search(2) {spell}. During later rounds: once per round pay {gold}5 to Search(2) {spell}."
    },
    {
      id: "magic_university",
      title: "Magic University",
      icon: "magic",
      body: "Once per round, instead of Searching the Spell deck, choose a School of Magic and discard cards from the top of your deck until you reveal a Spell of that school, then take it to hand."
    },
    {
      id: "garden_of_life",
      title: "Garden of Life",
      icon: "recruit",
      body: "At the beginning of each round, Recruit or Reinforce Sprites for free."
    }
  ]
};

async function cropBuiltTiles(faction, buildings) {
  const spec = CROP_SPECS[faction];
  const srcPath = path.join(SOURCE, spec.file);
  const { data, w, h } = await loadRaw(srcPath);
  const outs = [];
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const [sx0, sx1] = spec.seams[i];
    const box = contentBBox(data, w, h, sx0, spec.ty0, Math.min(w - 1, sx1), spec.boardTop);
    if (!box) {
      console.warn("no content for", faction, b.id);
      continue;
    }
    const rawPath = path.join(CROPPED, `${faction}-${b.id}.webp`);
    await sharp(srcPath).extract(box).webp({ quality: 95 }).toFile(rawPath);

    // Upscale to factory tile size, cover, slight sharpen
    const enPath = path.join(ENGLISH, `${faction}-${b.id}.webp`);
    await sharp(rawPath)
      .resize(TILE_W, TILE_H, { fit: "cover", position: "centre" })
      .sharpen({ sigma: 0.6 })
      .webp({ quality: 92 })
      .toFile(enPath);

    const finPath = path.join(FINAL, `${faction}-${b.id}.webp`);
    await copyFile(enPath, finPath);
    outs.push(finPath);
    console.log(`built ${faction}-${b.id}  crop ${box.width}x${box.height} → ${TILE_W}x${TILE_H}`);
  }
  return outs;
}

async function contactSheet(files, outPath, cols = 7) {
  if (!files.length) return;
  const thumbs = [];
  const tw = 140;
  const th = 296;
  for (const f of files) {
    if (!existsSync(f)) continue;
    thumbs.push(await sharp(f).resize(tw, th, { fit: "cover" }).png().toBuffer());
  }
  const rows = Math.ceil(thumbs.length / cols);
  const sheet = sharp({
    create: {
      width: cols * tw + (cols + 1) * 8,
      height: rows * th + (rows + 1) * 8,
      channels: 3,
      background: { r: 30, g: 24, b: 18 }
    }
  });
  const comps = thumbs.map((buf, i) => ({
    input: buf,
    left: 8 + (i % cols) * (tw + 8),
    top: 8 + Math.floor(i / cols) * (th + 8)
  }));
  await sheet.composite(comps).webp({ quality: 90 }).toFile(outPath);
}

async function main() {
  for (const d of [CROPPED, ENGLISH, FINAL, REVIEW]) await mkdir(d, { recursive: true });

  console.log("=== Built portrait tiles ===");
  await cropBuiltTiles("cove", COVE_TOP);
  await cropBuiltTiles("conflux", CONFLUX_TOP);

  console.log("=== Unbuilt English plaques ===");
  for (const b of [...COVE_TOP, ...COVE_EXTRA]) {
    const p = path.join(ENGLISH, `cove-${b.id}-unbuilt.webp`);
    await makeUnbuiltPlaque(b, p);
    await copyFile(p, path.join(FINAL, `cove-${b.id}-unbuilt.webp`));
    console.log("unbuilt", path.basename(p));
  }
  for (const b of [...CONFLUX_TOP, ...CONFLUX_EXTRA]) {
    const p = path.join(ENGLISH, `conflux-${b.id}-unbuilt.webp`);
    await makeUnbuiltPlaque(b, p);
    await copyFile(p, path.join(FINAL, `conflux-${b.id}-unbuilt.webp`));
    console.log("unbuilt", path.basename(p));
  }

  console.log("=== Definition cards (English + glyphs) ===");
  // Precise layout lives in fix-definition-cards.mjs (inline glyph spacing).
  const { spawnSync } = await import("node:child_process");
  const fix = spawnSync(process.execPath, [path.join(ROOT, "fix-definition-cards.mjs")], {
    stdio: "inherit"
  });
  if (fix.status !== 0) throw new Error("fix-definition-cards failed");

  console.log("=== Review pack ===");
  const coveBuilt = COVE_TOP.map((b) => path.join(FINAL, `cove-${b.id}.webp`));
  const confluxBuilt = CONFLUX_TOP.map((b) => path.join(FINAL, `conflux-${b.id}.webp`));
  const coveUnbuilt = [...COVE_TOP, ...COVE_EXTRA].map((b) => path.join(FINAL, `cove-${b.id}-unbuilt.webp`));
  const confluxUnbuilt = [...CONFLUX_TOP, ...CONFLUX_EXTRA].map((b) =>
    path.join(FINAL, `conflux-${b.id}-unbuilt.webp`)
  );

  await contactSheet(coveBuilt, path.join(REVIEW, "cove-built-tiles.webp"), 7);
  await contactSheet(confluxBuilt, path.join(REVIEW, "conflux-built-tiles.webp"), 7);
  await contactSheet(coveUnbuilt, path.join(REVIEW, "cove-unbuilt-plaques.webp"), 4);
  await contactSheet(confluxUnbuilt, path.join(REVIEW, "conflux-unbuilt-plaques.webp"), 4);

  const coveDefs = DEFS.cove.map((c) => path.join(FINAL, `cove-def-${c.id}.webp`));
  const confluxDefs = DEFS.conflux.map((c) => path.join(FINAL, `conflux-def-${c.id}.webp`));
  await contactSheet(coveDefs, path.join(REVIEW, "cove-definition-cards.webp"), 3);
  await contactSheet(confluxDefs, path.join(REVIEW, "conflux-definition-cards.webp"), 3);

  // Copy sources for side-by-side
  await copyFile(path.join(SOURCE, "cove.webp"), path.join(REVIEW, "00-source-cove-polish.webp"));
  await copyFile(path.join(SOURCE, "conflux.webp"), path.join(REVIEW, "00-source-conflux-polish.webp"));

  // Index
  const index = `# Cove / Conflux town-board art — REVIEW

Open this folder to check every piece before shipping into \`public/assets/town-board/\`.

## Folder

\`\`\`
assets-to-translate/cove-conflux-town-boards/review/
\`\`\`

## Contact sheets (start here)

| File | What |
|------|------|
| \`00-source-cove-polish.webp\` | Your uploaded Polish Cove board |
| \`00-source-conflux-polish.webp\` | Your uploaded Polish Conflux board |
| \`cove-built-tiles.webp\` | 7 built portrait tiles (cropped from scan) |
| \`conflux-built-tiles.webp\` | 7 built portrait tiles |
| \`cove-unbuilt-plaques.webp\` | English name + cost plaques (Homm3BG glyphs) |
| \`conflux-unbuilt-plaques.webp\` | English name + cost plaques |
| \`cove-definition-cards.webp\` | English effect cards with legend glyphs |
| \`conflux-definition-cards.webp\` | English effect cards |

## Individual finals

All files also live in \`../final/\` as:

- \`cove-<building>.webp\` / \`conflux-<building>.webp\` — built art
- \`cove-<building>-unbuilt.webp\` / \`conflux-<building>-unbuilt.webp\` — English plaques
- \`cove-def-*.webp\` / \`conflux-def-*.webp\` — definition cards

## Notes / honesty

1. **Built tiles** are clean crops of the printed portraits (no Polish text on those faces — only type icons). Upscaled to 385×813 to match Factory tiles.
2. **Pub** (Cove) and **Garden of Life** (Conflux) have **no separate portrait tile** on the uploaded photo (only nameplates on the board). Unbuilt English plaques exist; built art for those two is not invented.
3. **Unbuilt plaques + definition cards** are **code-composited** with Liberation Serif + Homm3BG glyphs (\`glyphs-ref/\` from https://github.com/Heegu-sama/Homm3BG/tree/main/assets/glyphs) so costs, names and legend icons are exact — not messy AI text boxes.
4. English rules text matches the printed Polish board + engine definitions in \`src/data/factions/core.ts\`.

## Costs (verified against scan)

### Cove
| Building | Gold | Mat | Val |
|----------|------|-----|-----|
| Thieves' Guild | 4 | 2 | 1 |
| City Hall | 10 | 4 | 0 |
| Bay | 4 | 3 | 1 |
| Mage Guild | 4 | 2 | 1 |
| Redoubled Vortex | 10 | 8 | 4 |
| Citadel | 8 | 4 | 1 |
| Nests Towering the Seas | 8 | 6 | 3 |
| Pub | 3 | 2 | 0 |

### Conflux
| Building | Gold | Mat | Val |
|----------|------|-----|-----|
| City Hall | 10 | 3 | 0 |
| Magic University | 6 | 3 | 0 |
| Mage Guild | 4 | 2 | 1 |
| Altars of Fire and Earth | 8 | 6 | 3 |
| Magical Pyre | 9 | 8 | 4 |
| Citadel | 8 | 4 | 1 |
| Altars of Air and Water | 4 | 3 | 1 |
| Garden of Life | 2 | 1 | 1 |
`;

  await writeFile(path.join(REVIEW, "README.md"), index, "utf8");
  console.log("\nREVIEW ready:", REVIEW);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
