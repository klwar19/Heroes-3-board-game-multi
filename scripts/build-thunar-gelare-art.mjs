#!/usr/bin/env node
// Thunar (Conflux Planeswalker, Magma Elementals) + Gelare (Conflux Wizard,
// Gold) — Archon's Conflux Stretch Goals preview heroes (2026-10-02):
//
//   node scripts/build-thunar-gelare-art.mjs [portraits|boards|cards|all] [thunar,gelare]
//
// Same house rule as scripts/build-specialty-card-faces.mjs (helpers in
// scripts/lib/printed-card-compositor.mjs): every printed component is a REAL
// scan composited in code; Codex painted only the two portraits
// (generated-session-art/conflux-thunar-gelare, gpt-6-sol, preview crops as
// reference).
//  * Boards: Thunar over Erdamon's scan (Planeswalker 3/1/1/1, Magma
//    Elementals specialty kept), Estates replaced by the real Tactics print
//    from Mutare's board; Gelare over Tarnum (Conflux)'s scan (Wizard 0/0/2/3,
//    Wisdom kept), the Enchanters slot replaced by the real printed Gold slot
//    from Octavia's board. Both grafts are colour-matched and feathered.
//  * Cards: template = Erdamon's Conflux scan of the SAME level (frame,
//    pink level painting, I/IV/VI medallion). Thunar keeps the printed Magma
//    Elementals window + title; only the rules area is re-laid (IV = Erdamon
//    I's printed rules, aligned and exposure-matched). Gelare's interior is
//    re-laid leather with the printed gold coins keyed off Octavia's card.
//    Rules text = Times New Roman with the official card glyphs
//    (scripts/card-glyphs; gold.svg = public/assets/glyphs/gold.svg).
//  * Footer: "CONFLUX nnn/080 CON" → "STRETCH GOALS" (cut from Octavia's
//    Stretch Goals scan) + the scan's own "CON"; the number is unknown, so
//    none is printed.
import { writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import {
  A, COL, read, raw, textAt, layoutText, patchOp, frameMask, paintThroughMask, debugMask,
  CARD_TXT, leatherPlate, PLATE, stats, feather, keyOffLeather, fitInto, PLATE_EXCLUDE,
} from "./lib/printed-card-compositor.mjs";

PLATE_EXCLUDE.add("thunar");
PLATE_EXCLUDE.add("gelare");
const GEN = "generated-session-art/conflux-thunar-gelare";
const MASTER = { thunar: `${GEN}/thunar-portrait.png`, gelare: `${GEN}/gelare-portrait.png` };
const CONFLUX_REFS = ["luna", "ciele", "monere", "pasis", "tarnum_conflux"];

// ─── portraits ───────────────────────────────────────────────────────────────
async function buildPortraits(heroes) {
  for (const h of heroes) {
    const out = `${A}/hero_boardart-${h}.webp`;
    writeFileSync(out, await sharp(read(MASTER[h])).resize(572, 582, { fit: "cover", position: "centre" }).removeAlpha().webp({ quality: 90 }).toBuffer());
    console.log("wrote", out);
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────
/** Colour-match `src` region of fileA to fileB's statistics on clean rects, feathered. */
async function graft(srcFile, src, dst, sampleSrc, sampleDst, tplBuf, r = 12) {
  const [sS, sT] = [await stats(read(srcFile), sampleSrc), await stats(tplBuf, sampleDst)];
  const { data, info } = await sharp(read(srcFile)).extract(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < info.width * info.height; p++) for (let c = 0; c < 3; c++) {
    const v = (data[p * 3 + c] - sS[c][0]) / sS[c][1] * sT[c][1] + sT[c][0];
    data[p * 3 + c] = Math.max(0, Math.min(255, Math.round(v)));
  }
  const input = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .ensureAlpha().composite([{ input: feather(src.width, src.height, r), blend: "dest-in" }]).png().toBuffer();
  return { input, left: dst.left, top: dst.top };
}
/** Offset (dx,dy) that best aligns `region` of fileA onto fileB (luminance). */
async function alignOffset(fileA, fileB, region, pad = 10) {
  const a = await raw(read(fileA), region);
  const b = await raw(read(fileB), { left: region.left - pad, top: region.top - pad, width: region.width + 2 * pad, height: region.height + 2 * pad });
  const lum = (d, i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  let best = [0, 0, Infinity];
  for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
    let s = 0;
    for (let y = 0; y < a.h; y += 2) for (let x = 0; x < a.w; x += 2) s += Math.abs(lum(a.data, (y * a.w + x) * 4) - lum(b.data, ((y + pad + dy) * b.w + x + pad + dx) * 4));
    if (s < best[2]) best = [dx, dy, s];
  }
  return { dx: best[0], dy: best[1] };
}
async function artCanvas(fm, file, crop) {
  const win = await sharp(read(file)).extract(crop)
    .resize(fm.rect.width + 4, fm.rect.height + 4, { fit: "cover", position: "centre" }).png().toBuffer();
  return sharp({ create: { width: fm.W, height: fm.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: win, left: fm.rect.left - fm.R.left - 2, top: fm.rect.top - fm.R.top - 2 }]).png().toBuffer();
}

// ─── boards ──────────────────────────────────────────────────────────────────
const BOARD_NAME = { size: 54, sx: 1.22, fill: COL.boardName };
const NAME_CX = 1104, NAME_BASE = { thunar: 130, gelare: 127 };
async function buildBoard(hero) {
  const isT = hero === "thunar";
  const template = isT ? `${A}/heroes-conflux-might-erdamon.webp` : `${A}/heroes-conflux-magic-tarnum_conflux.webp`;
  const others = ["might-erdamon", "might-monere", "might-pasis", "magic-luna", "magic-ciele", "magic-tarnum_conflux"]
    .map((n) => `${A}/heroes-conflux-${n}.webp`).filter((f) => f !== template);
  const tpl = read(template);
  // 1) erase the printed name (pink banner tiled from its own clear strip)
  let img = await sharp(tpl).composite([
    await patchOp(tpl, { left: 1275, top: 84, width: 60, height: 50 }, { left: 935, top: 82, width: 340, height: 58 }, 4),
  ]).png().toBuffer();
  const draw = [];
  const clean = [{ left: 1045, top: 340, width: 110, height: 280 }];
  if (isT) {
    // 2) Estates → the real Tactics print (label + picture) from Mutare's board
    const mut = `${A}/heroes-dungeon-might-mutare.webp`;
    const { dx, dy } = await alignOffset(template, mut, { left: 1205, top: 338, width: 180, height: 48 });
    const src = { left: 726 + dx, top: 332 + dy, width: 316, height: 330 };
    const cleanMut = [{ left: 1045 + dx, top: 340 + dy, width: 110, height: 280 }];
    draw.push(await graft(mut, src, { left: 726, top: 332 }, cleanMut, clean, tpl, 12));
  } else {
    // 2) Enchanters → the real printed Gold slot (recessed box, coins, label) from Octavia's board
    const oct = `${A}/heroes-inferno-might-octavia.webp`;
    const { dx, dy } = await alignOffset(template, oct, { left: 1205, top: 338, width: 180, height: 48 });
    const src = { left: 1170 + dx, top: 388 + dy, width: 256, height: 272 };
    const cleanOct = [{ left: 1045 + dx, top: 340 + dy, width: 110, height: 280 }, { left: 1420 + dx, top: 400 + dy, width: 80, height: 240 }];
    const cleanTpl = [...clean, { left: 1420, top: 400, width: 80, height: 240 }];
    draw.push(await graft(oct, src, { left: 1170, top: 388 }, cleanOct, cleanTpl, tpl, 10));
  }
  // 3) portrait through the consensus frame mask (scrollwork corners stay on top)
  const fm = await frameMask(template, others, { left: 34, top: 36, width: 676, height: 674 });
  await debugMask(`board-${hero}`, fm, template);
  const m = await sharp(read(MASTER[hero])).metadata();
  draw.push(await paintThroughMask(fm, await artCanvas(fm, MASTER[hero], { left: 0, top: 0, width: m.width, height: m.height })));
  // 4) name
  draw.push(await textAt(isT ? "Thunar" : "Gelare", BOARD_NAME, NAME_CX, NAME_BASE[hero]));
  img = await sharp(img).composite(draw).png().toBuffer();
  const out = `${A}/heroes-conflux-${isT ? "might" : "magic"}-${hero}.webp`;
  writeFileSync(out, await sharp(img).webp({ quality: 92 }).toBuffer());
  console.log("wrote", out);
}

// ─── cards ───────────────────────────────────────────────────────────────────
const ITALIC = { font: 'Times New Roman" font-style="italic' };
const CARDS = {
  thunar: {
    1: [["{instant}", "Remove 1 damage from"], ["your selected unit."], "GAP", ["The effect doubles for the Magma Elementals unit."]],
    4: "copy-erdamon-1",
    6: [["{instant}", "Choose two:"], ["Draw two cards then discard a card."], ["+2", "{power}"], ["Gain", "{morale_positive}"]],
  },
  gelare: {
    1: [["{instant}", "Roll the Attack die:"], ["“-1”: gain 3", "{gold}", ";"], ["“0”: gain 2", "{gold}", ";"], ["“+1”: gain 1", "{building_materials}", "."]],
    4: [["{permanent}", "After each Resource round ends, gain 5", "{gold}", "."], { italic: ["(Do not trigger if this card is replaced before then.)"] }],
    6: [["{map_effect}", "You can discard any number of cards from your hand. For each, gain 3", "{gold}", "."]],
  },
};
const CX = 371.5;
const BODY = { x: 92, width: 560, top: 462, bottom: 726 };
const BODY_PLATE = { left: 70, top: 458, width: 602, height: 284 };
const PORTRAIT_CROP = {
  thunar: { left: 110, top: 40, width: 1100, height: 1100 },
  gelare: { left: 150, top: 60, width: 1000, height: 1000 },
};

async function orDivider(top, lineH) {
  const o = { size: 22, sx: 1.1, fill: COL.subtitle, weight: "normal", shadow: 0.5 };
  const mid = Math.round(top + lineH * 0.5);
  const rules = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="6"><g stroke="#cdbd86" stroke-width="2" stroke-linecap="round" opacity=".9"><line x1="4" y1="3" x2="68" y2="3"/><line x1="132" y1="3" x2="196" y2="3"/></g></svg>`);
  return [{ input: rules, left: Math.round(CX - 100), top: mid - 3 }, await textAt("OR", o, CX, mid + 8)];
}
/**
 * Words are set ink-to-ink, and Times' narrow "1" then reads as glued to its
 * neighbours ("gain1", "1damage"): open a lone "1" by 2 px on each side.
 * layoutText emits exactly one op per word, in order.
 */
function openLoneOnes(tokens, ops) {
  const words = [];
  for (const t of tokens) {
    if (/^\{[a-z_]+\}$/.test(t)) words.push(t);
    else words.push(...t.split(/\s+/).filter(Boolean));
  }
  if (words.length !== ops.length) return ops;
  words.forEach((w, i) => {
    // the italic "f" of "if" has a tall overhang the ink trim counts: close it up
    if (w === "if") for (let j = i + 1; j < ops.length && Math.abs(ops[j].top - ops[i].top) < 15; j++) ops[j].left -= 4;
    if (w !== "1") return;
    for (let j = i; j < ops.length && Math.abs(ops[j].top - ops[i].top) < 15; j++) ops[j].left += j === i ? 2 : 4;
  });
  return ops;
}
/** Paragraph block vertically centred in BODY, shrinking the type to fit. */
async function bodyOps(paras, label) {
  for (const size of [31, 30, 29, 28, 27, 26]) {
    const base = { ...CARD_TXT.ashBody, size };
    const lineH = Math.round(size * 1.23 * 10) / 10;
    const blocks = [];
    let h = 0;
    for (const p of paras) {
      if (p === "OR") { blocks.push({ or: true, h: lineH * 0.95 }); h += lineH * 0.95; continue; }
      if (p === "GAP") { blocks.push({ gap: true, h: lineH * 0.5 }); h += lineH * 0.5; continue; }
      const o = p.italic ? { ...base, ...ITALIC } : base;
      const toks = p.italic ?? p;
      const t = await layoutText(toks, { x: BODY.x, width: BODY.width, first: 0, lineH, o });
      blocks.push({ p: toks, o, h: t.lines * lineH });
      h += t.lines * lineH;
    }
    if (h > BODY.bottom - BODY.top && size > 26) continue;
    if (h > BODY.bottom - BODY.top) throw new Error(`${label}: body does not fit (${Math.round(h)}px)`);
    const ops = [];
    let y = (BODY.top + BODY.bottom) / 2 - h / 2;
    for (const b of blocks) {
      if (b.or) ops.push(...(await orDivider(y, b.h)));
      else if (b.p) ops.push(...openLoneOnes(b.p, (await layoutText(b.p, { x: BODY.x, width: BODY.width, first: Math.round(y + lineH * 0.76), lineH, o: b.o })).ops));
      y += b.h;
    }
    console.log(`  ${label}: body ${size}px, ${Math.round(h)}px tall`);
    return ops;
  }
  throw new Error("unreachable");
}
/** The template's own leather (print removed) over `rect`, softly edged. */
async function plateOp(tplFile, rect) {
  const plate = await leatherPlate(tplFile);
  const piece = await sharp(plate).extract({ left: rect.left - PLATE.left, top: rect.top - PLATE.top, width: rect.width, height: rect.height }).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}"><defs><filter id="b"><feGaussianBlur stdDeviation="2.5"/></filter></defs><rect x="0" y="4" width="${rect.width}" height="${rect.height - 4}" fill="#fff" filter="url(#b)"/></svg>`);
  return { input: await sharp(piece).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer(), left: rect.left, top: rect.top };
}
/** Erdamon I's printed rules block, aligned + exposure-matched onto `tplFile`. */
async function copiedRules(tplFile) {
  const srcFile = `${A}/hero_specialties-erdamon-1.webp`;
  const strips = [{ left: 74, top: 130, width: 26, height: 560 }, { left: 642, top: 130, width: 26, height: 560 }];
  const { dx, dy } = await alignOffset(tplFile, srcFile, strips[0]);
  const rect = { left: 76, top: 462, width: 590, height: 270 };
  const src = { left: rect.left + dx, top: rect.top + dy, width: rect.width, height: rect.height };
  return graft(srcFile, src, rect, strips.map((r) => ({ ...r, left: r.left + dx, top: r.top + dy })), strips, read(tplFile), 8);
}
/** Footer: STRETCH GOALS (Octavia's scan of the same level) + the scan's CON, no number. */
async function footerOps(tpl, level) {
  const oct = read(`${A}/hero_specialties-octavia-${level}.webp`);
  const octRun = { 1: [49, 181], 4: [54, 186], 6: [57, 188] }[level];
  const sg = await sharp(oct).extract({ left: octRun[0] - 1, top: 999, width: octRun[1] - octRun[0] + 3, height: 22 }).png().toBuffer();
  const con = await sharp(tpl).extract({ left: 210, top: 999 /* CON ≈ x212..244 on every Erdamon scan */, width: 37, height: 22 }).png().toBuffer();
  const x0 = 52;
  return [
    await patchOp(tpl, { left: 252, top: 1000, width: 50, height: 21 }, { left: 46, top: 999, width: 258, height: 23 }, 1),
    // Octavia's footer ink sits 2-3 px higher than the Erdamon scans' (© line)
    { input: sg, left: x0 - 1, top: 999 + (level === 4 ? 2 : 3), blend: "lighten" },
    { input: con, left: x0 + octRun[1] - octRun[0] + 12, top: 999, blend: "lighten" },
  ];
}
async function buildCard(hero, level) {
  const tplFile = `${A}/hero_specialties-erdamon-${level}.webp`;
  const tpl = read(tplFile);
  const ops = [];
  if (hero === "thunar") {
    ops.push(await plateOp(tplFile, BODY_PLATE));
    if (CARDS.thunar[level] === "copy-erdamon-1") ops.push(await copiedRules(tplFile));
    else ops.push(...(await bodyOps(CARDS.thunar[level], `thunar ${level}`)));
  } else {
    ops.push(await plateOp(tplFile, { left: 70, top: 76, width: 602, height: 666 }));
    const coins = await keyOffLeather(`${A}/hero_specialties-octavia-${level}.webp`, { left: 236, top: 112, width: 270, height: 262 });
    ops.push(await fitInto(coins, { left: 236, top: 112, width: 270, height: 262 }, { shadow: { dx: 3, dy: 5, blur: 4, opacity: 0.45 } }));
    ops.push(await textAt("Gold", { ...CARD_TXT.title, size: 46.5 }, CX, 438));
    ops.push(...(await bodyOps(CARDS.gelare[level], `gelare ${level}`)));
  }
  const refs = CONFLUX_REFS.map((h) => `${A}/hero_specialties-${h}-${level}.webp`);
  const fm = await frameMask(tplFile, refs, { left: 36, top: 730, width: 290, height: 272 });
  await debugMask(`card-${hero}-${level}`, fm, tplFile);
  ops.push(await paintThroughMask(fm, await artCanvas(fm, MASTER[hero], PORTRAIT_CROP[hero])));
  ops.push(...(await footerOps(tpl, level)));
  const out = `${A}/hero_specialties-${hero}-${level}.webp`;
  writeFileSync(out, await sharp(tpl).composite(ops).webp({ quality: 90 }).toBuffer());
  console.log("wrote", out);
}

const only = process.argv[2] || "all";
const heroes = process.argv[3] ? process.argv[3].split(",") : ["thunar", "gelare"];
for (const h of heroes) {
  if (!MASTER[h]) throw new Error(`unknown hero ${h}`);
  if (!existsSync(MASTER[h])) throw new Error(`missing Codex master ${MASTER[h]}`);
}
if (only === "all" || only === "portraits") await buildPortraits(heroes);
if (only === "all" || only === "boards") for (const h of heroes) await buildBoard(h);
if (only === "all" || only === "cards") for (const h of heroes) for (const lv of [1, 4, 6]) await buildCard(h, lv);
