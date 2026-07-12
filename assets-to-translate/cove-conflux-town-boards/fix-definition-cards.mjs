#!/usr/bin/env node
import sharp from "sharp";
import { readFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const REPO = path.resolve(ROOT, "../..");
const GLYPHS = path.join(ROOT, "glyphs-ref");
const ENGLISH = path.join(ROOT, "english");
const FINAL = path.join(ROOT, "final");
const REVIEW = path.join(ROOT, "review");
const FONT = path.join(REPO, "public/fonts/LiberationSerif-Bold.ttf");
const FONT_REG = path.join(REPO, "public/fonts/LiberationSerif-Regular.ttf");

const boldB64 = readFileSync(FONT).toString("base64");
const regB64 = readFileSync(FONT_REG).toString("base64");
const fontCss = `
@font-face { font-family: 'LibSerif'; src: url('data:font/ttf;base64,${regB64}') format('truetype'); font-weight: 400; }
@font-face { font-family: 'LibSerif'; src: url('data:font/ttf;base64,${boldB64}') format('truetype'); font-weight: 700; }
`;

function gUri(name) {
  const p = path.join(GLYPHS, `${name}.png`);
  if (!existsSync(p)) return null;
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
}
function esc(s) {
  // Preserve every space as NBSP so librsvg/sharp never collapses them.
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/ /g, "\u00a0");
}

const t = (s) => ({ t: s });
const n = (v) => ({ n: v });
const g = (name) => ({ g: name });

function layoutCard({ title, icon, lines, w = 480, h = 320 }) {
  const fs = 17;
  const iconSz = 22;
  const lineH = 26;
  const padX = 18;
  const bodyTop = 58;
  let body = "";
  let y = bodyTop;
  for (const line of lines) {
    let x = padX;
    for (const tok of line) {
      if (tok.t != null) {
        body += `<text xml:space="preserve" x="${x}" y="${y}" font-family="LibSerif" font-weight="400" font-size="${fs}" fill="#e8dcc0">${esc(tok.t)}</text>`;
        // Liberation Serif ~0.52em average; overshoot slightly so glyphs never cover trailing digits.
        x += Math.ceil(tok.t.length * fs * 0.56) + 4;
      } else if (tok.n != null) {
        body += `<text xml:space="preserve" x="${x}" y="${y}" font-family="LibSerif" font-weight="700" font-size="${fs}" fill="#f5e6c8">${tok.n}</text>`;
        x += Math.ceil(String(tok.n).length * fs * 0.62) + 4;
      } else if (tok.g) {
        const href = gUri(tok.g);
        if (href) {
          body += `<image href="${href}" x="${x}" y="${y - iconSz + 5}" width="${iconSz}" height="${iconSz}"/>`;
          x += iconSz + 8;
        }
      }
    }
    y += lineH;
  }
  const titleIcon = gUri(icon);
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs><style>${fontCss}</style>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3d5a32"/><stop offset="100%" stop-color="#2a4024"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="8" fill="#1a1510" stroke="#8a7350" stroke-width="3"/>
  <rect x="8" y="8" width="${w - 16}" height="36" rx="4" fill="url(#bg)" stroke="#b8a478" stroke-width="1"/>
  ${titleIcon ? `<image href="${titleIcon}" x="14" y="12" width="28" height="28"/>` : ""}
  <text x="${titleIcon ? 48 : 16}" y="32" font-family="LibSerif" font-weight="700" font-size="18" fill="#f4ecd4">${esc(title)}</text>
  ${body}
</svg>`);
}

// Prefer single text runs; only split when a glyph must sit inline.
// Leading/trailing pads on glyph neighbors avoid tight joins.
const CARDS = {
  cove: [
    {
      id: "city_hall",
      title: "City Hall",
      icon: "building_city_hall",
      lines: [
        [t("At the beginning of each Resource round,")],
        [t("choose: 4"), g("gold"), t("  — OR —  Remove 1"), g("artifact")],
        [t("from your hand to gain 1"), g("experience"), t(".")]
      ]
    },
    {
      id: "citadel",
      title: "Citadel",
      icon: "building_citadel",
      lines: [
        [t("Unlocks Reinforcing units. When the")],
        [t("town is under siege, place 3 Wall cards,")],
        [t("a Gate card and an Arrow Tower card")],
        [t("on the Combat board.")]
      ]
    },
    {
      id: "mage_guild",
      title: "Mage Guild",
      icon: "building_mage_guild",
      lines: [
        [t("Building round: twice Search(2)"), g("spell"), t(".")],
        [t("Later rounds: once per round pay 5"), g("gold")],
        [t("to Search(2)"), g("spell"), t(".")]
      ]
    },
    {
      id: "thieves_guild",
      title: "Thieves' Guild",
      icon: "hand",
      lines: [
        [t("Once during your turn, choose any deck")],
        [t("(including another player's M&M deck),")],
        [t("look at its top 2 cards, put one on its")],
        [t("discard pile and the other back on top.")]
      ]
    },
    {
      id: "pub",
      title: "Pub",
      icon: "recruit",
      lines: [
        [t("During each Astrologers' round, while")],
        [t("Reinforcing units you may reduce one")],
        [t("reinforcement's cost by 3"), g("gold")],
        [t("(to a minimum of 0).")]
      ]
    }
  ],
  conflux: [
    {
      id: "city_hall",
      title: "City Hall",
      icon: "building_city_hall",
      lines: [
        [t("At the beginning of each Resource round,")],
        [t("choose: 4"), g("gold"), t("  — OR —  Search(3)"), g("spell"), t(".")]
      ]
    },
    {
      id: "citadel",
      title: "Citadel",
      icon: "building_citadel",
      lines: [
        [t("Unlocks Reinforcing units. When the")],
        [t("town is under siege, place 3 Wall cards,")],
        [t("a Gate card and an Arrow Tower card")],
        [t("on the Combat board.")]
      ]
    },
    {
      id: "mage_guild",
      title: "Mage Guild",
      icon: "building_mage_guild",
      lines: [
        [t("Building round: twice Search(2)"), g("spell"), t(".")],
        [t("Later rounds: once per round pay 5"), g("gold")],
        [t("to Search(2)"), g("spell"), t(".")]
      ]
    },
    {
      id: "magic_university",
      title: "Magic University",
      icon: "magic",
      lines: [
        [t("Once per round, instead of Searching")],
        [t("the Spell deck, choose a School of Magic")],
        [t("and discard cards from the top of your")],
        [t("deck until you reveal a Spell of that")],
        [t("school, then take it to hand.")]
      ]
    },
    {
      id: "garden_of_life",
      title: "Garden of Life",
      icon: "recruit",
      lines: [
        [t("At the beginning of each round,")],
        [t("Recruit or Reinforce Sprites for free.")]
      ]
    }
  ]
};

async function contactSheet(files, outPath, cols, tw, th) {
  const thumbs = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    thumbs.push(
      await sharp(f)
        .resize(tw, th, { fit: "contain", background: { r: 30, g: 24, b: 18 } })
        .png()
        .toBuffer()
    );
  }
  const rows = Math.ceil(thumbs.length / cols);
  const comps = thumbs.map((buf, i) => ({
    input: buf,
    left: 8 + (i % cols) * (tw + 8),
    top: 8 + Math.floor(i / cols) * (th + 8)
  }));
  await sharp({
    create: {
      width: cols * tw + (cols + 1) * 8,
      height: rows * th + (rows + 1) * 8,
      channels: 3,
      background: { r: 30, g: 24, b: 18 }
    }
  })
    .composite(comps)
    .webp({ quality: 92 })
    .toFile(outPath);
}

const defFiles = { cove: [], conflux: [] };
for (const [faction, cards] of Object.entries(CARDS)) {
  for (const c of cards) {
    const buf = layoutCard(c);
    const p = path.join(ENGLISH, `${faction}-def-${c.id}.webp`);
    await sharp(buf).webp({ quality: 93 }).toFile(p);
    copyFileSync(p, path.join(FINAL, path.basename(p)));
    defFiles[faction].push(p);
    console.log("ok", path.basename(p));
  }
}
await contactSheet(defFiles.cove, path.join(REVIEW, "cove-definition-cards.webp"), 3, 300, 200);
await contactSheet(defFiles.conflux, path.join(REVIEW, "conflux-definition-cards.webp"), 3, 300, 200);
console.log("defs fixed");
