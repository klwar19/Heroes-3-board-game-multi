#!/usr/bin/env node
// Printed-format hero-specialty card faces (and Jabarkas's hero board) for the
// preview heroes whose cards used to fall back to the native art-less renderer:
//
//   node scripts/build-specialty-card-faces.mjs [cards|board|portraits|icons|all] [hero,...]
//
// Same house rule and pipeline as scripts/build-ignatius-olema-art.mjs (shared
// helpers in scripts/lib/printed-card-compositor.mjs): every printed component
// is a REAL scan composited in code —
//  * template = a same-faction "Stretch Goals" specialty scan of the SAME level
//    (frame, faction band, level painting, I/IV/VI medallion, footer);
//  * its leather interior is re-laid from the stacked leather of every scan;
//  * the picture is either the unit's own square picture (cut from its real
//    unit card) in Sandro's printed dark window ring, or the spell / skill
//    SYMBOL: the official transparent Homm3BG symbol files (Stone Skin, Cure,
//    Sorcery, Necromancy — generated-session-art/specialty-symbols) or, for
//    Weakness, keyed off the real spells-weakness card;
//  * title + rules text in Times New Roman with the real card glyphs
//    (scripts/card-glyphs), the wording and timing glyph matching the engine;
//  * the portrait panel is swapped under the consensus frame mask so the
//    printed corner scrollwork stays on top;
//  * the footer's collector number is erased (only Jabarkas's 079-081/227
//    are known from the preview, so only those are printed).
// Codex paints only Jabarkas's portrait (generated-session-art/stronghold-jabarkas).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import {
  A, COL, read, raw, textAt, layoutText, patchOp, frameMask, paintThroughMask, debugMask,
  weaknessSymbol, fitInto, CARD_TXT, relaidLeather,
} from "./lib/printed-card-compositor.mjs";

const OUT_DEBUG = process.env.ART_DEBUG_DIR || "";

// ─── faction templates ───────────────────────────────────────────────────────
/** Stretch-Goals template hero + consensus-mask references per faction. */
const FACTION = {
  castle: { tpl: "valeska", refs: ["catherine", "adelaide", "ingham", "tarnum_castle"] },
  rampart: { tpl: "ivor", refs: ["gelu", "clancy", "melodia", "tarnum_rampart"] },
  necropolis: { tpl: "moandor", refs: ["sandro", "tamika", "septienna", "vidomina"] },
  dungeon: { tpl: "lorelei", refs: ["alamar", "mutare", "sephinroth", "tarnum_dungeon"] },
  fortress: { tpl: "merist", refs: ["bron", "adrienne", "gerwulf", "tarnum_fortress"] },
  stronghold: { tpl: "dessa", refs: ["crag_hack", "gundula", "shiva", "yog"] },
};

// ─── pictures ────────────────────────────────────────────────────────────────
const ICON = (f) => `${A}/specialty-card/${f}`;
/** Square unit pictures (cut from the real unit cards) shown in the window. */
const WINDOW_ART = {
  urftin: ICON("icon-urftin-dwarves.webp"),
  dace: ICON("icon-dace-minotaur.webp"),
  korbac: ICON("icon-korbac-dragon_flies.webp"),
  verdish: ICON("icon-verdish-first_aid_tent.webp"),
  jabarkas: ICON("icon-jabarkas-orcs.webp"),
};
const OFFICIAL_SYMBOLS = "generated-session-art/specialty-symbols";
const OFFICIAL_SYMBOL = {
  darkstorn: "stone_skin.png", // Stone Skin spell
  uland: "cure.png", // Cure spell
  kastore: "sorcery.png", // Sorcery skill
  isra: "necromancy.png", // Necromancy skill
};
const symbolCache = new Map();
/** Spell / skill symbols keyed off real printed cards (RGBA buffers). */
async function symbol(hero) {
  if (symbolCache.has(hero)) return symbolCache.get(hero);
  let buf;
  // The official transparent Homm3BG symbol files (Homm3BG-main assets/spells
  // + assets/skills, copied to OFFICIAL_SYMBOLS) — the exact printed symbols.
  // Weakness is not in that pack, so it stays keyed off the real spell card
  // (the same cut Olema's printed card carries).
  if (hero === "cuthbert") buf = await weaknessSymbol();
  else if (OFFICIAL_SYMBOL[hero]) buf = read(`${OFFICIAL_SYMBOLS}/${OFFICIAL_SYMBOL[hero]}`);
  else throw new Error(`no symbol for ${hero}`);
  buf = await sharp(buf).trim({ threshold: 1 }).png().toBuffer();
  if (OUT_DEBUG) await sharp(buf).png().toFile(`${OUT_DEBUG}/symbol-${hero}.png`);
  symbolCache.set(hero, buf);
  return buf;
}

// ─── portraits (face-centred crops for the card's portrait panel) ────────────
const PORTRAIT = {
  cuthbert: { file: `${A}/hero_boardart-cuthbert.webp`, crop: { left: 150, top: 40, width: 960, height: 960 } },
  urftin: { file: `${A}/hero_boardart-urftin.webp`, crop: { left: 50, top: 10, width: 400, height: 400 } },
  uland: { file: `${A}/hero_boardart-uland.webp`, crop: { left: 60, top: 10, width: 400, height: 400 } },
  kastore: { file: "public/game-tokens/necropolis-heroes/hero_boardart-kastore.webp", crop: { left: 130, top: 40, width: 960, height: 960 } },
  isra: { file: "public/game-tokens/necropolis-heroes/hero_boardart-isra.webp", crop: { left: 150, top: 40, width: 960, height: 960 } },
  dace: { file: `${A}/hero_boardart-dace.webp`, crop: { left: 150, top: 60, width: 960, height: 960 } },
  darkstorn: { file: `${A}/hero_boardart-darkstorn.webp`, crop: { left: 190, top: 150, width: 870, height: 870 } },
  korbac: { file: `${A}/hero_boardart-korbac.webp`, crop: { left: 150, top: 60, width: 960, height: 960 } },
  verdish: { file: `${A}/hero_boardart-verdish.webp`, crop: { left: 150, top: 60, width: 960, height: 960 } },
  jabarkas: { file: "generated-session-art/stronghold-jabarkas/jabarkas-portrait.png", crop: { left: 90, top: 20, width: 850, height: 850 } },
};

// ─── the cards ───────────────────────────────────────────────────────────────
// Body = paragraphs of tokens ("{glyph}" = card glyph); "OR" = the printed
// "— OR —" divider; "GAP" = a paragraph break. Wording/timing = the engine card.
const DOUBLES = (unit) => ["GAP", [`The effect doubles for the ${unit} unit.`]];
const HEROES = {
  cuthbert: {
    faction: "castle", title: "Weakness", pic: "symbol",
    1: [["{instant}", "The selected attacking unit gets -2", "{attack}", "(to a minimum of 0)."]],
    4: [["{ongoing}", "Until the end of Combat, the selected enemy unit gets -1", "{attack}", "(to a minimum of 0)."]],
    6: [["{ongoing}", "For this Combat round, all enemy units suffer -1", "{attack}", "during retaliation (to a minimum of 0)."]],
  },
  urftin: {
    faction: "rampart", title: "Dwarves", pic: "window",
    1: [["{instant}", "Your selected unit gains +1", "{attack}", "."], "OR", ["{instant}", "Your selected unit gains +1", "{defense}", "."], ...DOUBLES("Dwarves")],
    4: [["{ongoing}", "For this Combat, your selected unit's", "{health_points}", "is increased by 1."], ...DOUBLES("Dwarves")],
    6: [["{ongoing}", "This Combat, each time your Dwarves remove an enemy unit from Combat, place a faction cube on this card. Your Dwarves gain +1", "{attack}", ", +1", "{defense}", "and +1 Initiative for each cube."]],
  },
  uland: {
    faction: "rampart", title: "Cure", pic: "symbol",
    1: [["{instant}", "Remove 1 damage from your selected unit."]],
    4: [["{instant}", "Select any 2 units. Remove 1 damage and", "{paralysis}", "from each."]],
    6: [["{ongoing}", "Select your unit. At the end of each Combat round this Combat, you may remove up to 2 damage from it."]],
  },
  kastore: {
    faction: "necropolis", title: "Sorcery", pic: "symbol",
    1: [["{instant}", "+1", "{power}", "and draw 1 card."]],
    4: [["{ongoing}", "For this Combat, draw 1 card after each", "{spell}", "you play (maximum 3 cards)."]],
    6: [["{instant}", "+4", "{power}", "."]],
  },
  isra: {
    faction: "necropolis", title: "Necromancy", pic: "symbol",
    1: [["{instant}", "Choose an Ability or Specialty card from your deck or discard pile and put it into your hand."]],
    4: [["{activation}", "Return your units removed during this Combat to empty spaces (except Pack,", "{golden}", "and Neutral units)."]],
    6: [["{ongoing}", "For this Combat, your selected unit gains a special ability:"], "GAP", ["{unit_passive}", "Once per Combat. When this unit's", "{health_points}", "drops to 0 or when it would be flipped, set its", "{health_points}", "to 1 instead."]],
  },
  dace: {
    faction: "dungeon", title: "Minotaurs", pic: "window",
    1: [["{ongoing}", "For this Combat, your selected unit's", "{health_points}", "is increased by 1."], ...DOUBLES("Minotaurs")],
    4: [["{ongoing}", "For this Combat, whenever your attack brings an enemy unit's", "{health_points}", "to 0, deal 1 damage to an enemy unit you choose."], "OR", ["{instant}", "Draw 1 card."]],
    6: [["{ongoing}", "For this Combat, your Minotaurs gain +2", "{attack}", ". They draw 1 card on a 0 Attack die result, and 2 cards on a -1."]],
  },
  darkstorn: {
    faction: "dungeon", title: "Stone Skin", pic: "symbol",
    1: [["{ongoing}", "Select a friendly unit. For this Combat, attacks against it roll at disadvantage."]],
    4: [["{ongoing}", "For this Combat round, all your units gain a Defense token and +1", "{defense}", "when the enemy rolls +1."]],
    6: [["{ongoing}", "For this Combat, the selected friendly unit gains +1", "{defense}", "."]],
  },
  korbac: {
    faction: "fortress", title: "Dragon Flies", pic: "window",
    1: [["{instant}", "Your selected unit gains +1", "{attack}", "."], "OR", ["{instant}", "Your selected unit gains +1", "{defense}", "."], ...DOUBLES("Dragon Flies")],
    4: [["{permanent}", "After your unit attacks and the enemy unit survives, your Dragon Flies immediately start a turn, even if they already acted this round."]],
    6: [["{instant}", "Your selected unit gains +2", "{attack}", "."], "OR", ["{instant}", "Your selected unit gains +2", "{defense}", "."], ...DOUBLES("Dragon Flies")],
  },
  verdish: {
    faction: "fortress", title: "First Aid", pic: "window",
    1: [["{ongoing}", "Select one of your units. At the start of each Combat round, remove 1 damage from it."]],
    4: [["{activation}", "Move up to 3 damage from one of your units to another of your units."]],
    6: [["{ongoing}", "For this Combat, when one of your units brings an enemy unit's", "{health_points}", "to 0, remove 1 damage from that unit."]],
  },
  jabarkas: {
    faction: "stronghold", title: "Orcs", pic: "window", footer: { 1: "079/227", 4: "080/227", 6: "081/227" },
    1: [["{ongoing}", "For this Combat, your Orcs units ignore combat penalty and +1", "{attack}", "if the target of attack is adjacent."]],
    4: [["{ongoing}", "For this Combat, your selected unit's", "{health_points}", "is increased by 1."], ...DOUBLES("Orcs")],
    6: [["{ongoing}", "For this Combat, your Orcs units ignore enemy", "{defense}", "if the target of attack is adjacent."]],
  },
};

// ─── layout ──────────────────────────────────────────────────────────────────
const CX = 371.5;
const TITLE_BASE = 435;
const BODY = { x: 92, width: 560, top: 455, bottom: 714 };
const WINDOW = { ring: { left: 234, top: 82, width: 273, height: 267 }, art: { left: 244, top: 92, width: 253, height: 247 } };
const SYMBOL_BOX = { left: 182, top: 112, width: 380, height: 262 };

/** The "— OR —" divider: small caps OR between two short rules. */
async function orDivider(top, lineH) {
  const o = { size: 22, sx: 1.1, fill: COL.subtitle, weight: "normal", shadow: 0.5 };
  const mid = Math.round(top + lineH * 0.5);
  const rules = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="6"><g stroke="#cdbd86" stroke-width="2" stroke-linecap="round" opacity=".9"><line x1="4" y1="3" x2="68" y2="3"/><line x1="132" y1="3" x2="196" y2="3"/></g></svg>`,
  );
  return [
    { input: rules, left: Math.round(CX - 100), top: mid - 3 },
    await textAt("OR", o, CX, mid + 8),
  ];
}

/** Paragraph block, vertically centred in BODY, shrinking the type to fit. */
async function bodyOps(paras, label) {
  for (const size of [30.5, 29.5, 28.5, 27.5, 26.5, 25.5]) {
    const o = { ...CARD_TXT.ashBody, size };
    const lineH = Math.round(size * 1.23 * 10) / 10;
    const blocks = [];
    let h = 0;
    for (const p of paras) {
      if (p === "OR") { blocks.push({ or: true, h: lineH * 0.95 }); h += lineH * 0.95; continue; }
      if (p === "GAP") { blocks.push({ gap: true, h: lineH * 0.5 }); h += lineH * 0.5; continue; }
      const t = await layoutText(p, { x: BODY.x, width: BODY.width, first: 0, lineH, o });
      blocks.push({ p, h: t.lines * lineH });
      h += t.lines * lineH;
    }
    if (h > BODY.bottom - BODY.top && size > 25.5) continue;
    if (h > BODY.bottom - BODY.top) throw new Error(`${label}: body does not fit (${Math.round(h)}px)`);
    const ops = [];
    let y = (BODY.top + BODY.bottom) / 2 - h / 2;
    for (const b of blocks) {
      if (b.or) ops.push(...(await orDivider(y, b.h)));
      else if (b.p) ops.push(...(await layoutText(b.p, { x: BODY.x, width: BODY.width, first: Math.round(y + lineH * 0.76), lineH, o })).ops);
      y += b.h;
    }
    return ops;
  }
  throw new Error("unreachable");
}

/** Cover-crop a portrait buffer into the mask's painting window. */
async function artForWindow(fm, file, crop) {
  const win = await sharp(read(file)).extract(crop)
    .resize(fm.rect.width + 4, fm.rect.height + 4, { fit: "cover", position: "centre" }).png().toBuffer();
  return sharp({ create: { width: fm.W, height: fm.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: win, left: fm.rect.left - fm.R.left - 2, top: fm.rect.top - fm.R.top - 2 }]).png().toBuffer();
}

/**
 * The footer's collector number ("STRETCH GOALS 013/197 CAS"): the third ink
 * run of the footer line (STRETCH | GOALS | number | faction). Returns its
 * x-extent, found from the scan itself so every template works.
 */
async function footerNumberRun(tplFile) {
  const R = { left: 110, top: 1001, width: 330, height: 15 };
  const { data, w, h } = await raw(read(tplFile), R);
  const ink = [];
  for (let x = 0; x < w; x++) {
    let on = false;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 > 105) { on = true; break; }
    }
    ink.push(on);
  }
  const runs = [];
  let start = -1, gap = 0;
  for (let x = 0; x <= w; x++) {
    if (x < w && ink[x]) { if (start < 0) start = x; gap = 0; continue; }
    if (start >= 0 && (++gap >= 6 || x === w)) { runs.push([start, x - gap]); start = -1; gap = 0; }
  }
  if (runs.length < 4) throw new Error(`${tplFile}: footer runs ${JSON.stringify(runs)}`);
  return { gap: R.left + runs[1][1] + 2, x0: R.left + runs[2][0], x1: R.left + runs[2][1] };
}
async function footerOps(tpl, tplFile, number) {
  const { gap, x0, x1 } = await footerNumberRun(tplFile);
  // tile the clean black gap between "GOALS" and the number over the number
  const ops = [await patchOp(tpl, { left: gap, top: 997, width: 5, height: 23 }, { left: x0 - 3, top: 997, width: x1 - x0 + 7, height: 23 }, 1)];
  if (number) ops.push(await textAt(number, CARD_TXT.footer, x0 + 1, 1015, "left"));
  return ops;
}

async function buildCard(hero, level) {
  const spec = HEROES[hero];
  const fac = FACTION[spec.faction];
  const tplFile = `${A}/hero_specialties-${fac.tpl}-${level}.webp`;
  const tpl = read(tplFile);
  const ops = await relaidLeather(tplFile);
  if (spec.pic === "window") {
    // Sandro's printed dark window ring, the unit's own picture inside
    const sandro = read(`${A}/hero_specialties-sandro-${level}.webp`);
    const { ring, art } = WINDOW;
    const ringImg = await sharp(sandro).extract(ring).png().toBuffer();
    const ringMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ring.width}" height="${ring.height}"><defs><filter id="b"><feGaussianBlur stdDeviation="1.5"/></filter></defs><rect x="3" y="3" width="${ring.width - 6}" height="${ring.height - 6}" fill="#fff" filter="url(#b)"/></svg>`);
    ops.push({ input: await sharp(ringImg).composite([{ input: ringMask, blend: "dest-in" }]).png().toBuffer(), left: ring.left, top: ring.top });
    ops.push({ input: await sharp(read(WINDOW_ART[hero])).resize(art.width, art.height, { fit: "cover" }).png().toBuffer(), left: art.left, top: art.top });
  } else {
    ops.push(await fitInto(await symbol(hero), SYMBOL_BOX, { shadow: { dx: 3, dy: 5, blur: 4, opacity: 0.45 } }));
  }
  ops.push(await textAt(spec.title, CARD_TXT.title, CX, TITLE_BASE));
  ops.push(...(await bodyOps(spec[level], `${hero} ${level}`)));
  // portrait panel under the consensus frame mask
  const refs = fac.refs.map((h) => `${A}/hero_specialties-${h}-${level}.webp`);
  const fm = await frameMask(tplFile, refs, { left: 36, top: 730, width: 290, height: 272 });
  await debugMask(`card-${hero}-${level}`, fm, tplFile);
  const p = PORTRAIT[hero];
  ops.push(await paintThroughMask(fm, await artForWindow(fm, p.file, p.crop)));
  ops.push(...(await footerOps(tpl, tplFile, spec.footer?.[level])));
  const out = `${A}/hero_specialties-${hero}-${level}.webp`;
  writeFileSync(out, await sharp(tpl).composite(ops).webp({ quality: 90 }).toBuffer());
  console.log("wrote", out);
}

// ─── Jabarkas: hero board over Crag Hack's (Barbarian 4/0/1/1, Offense) ──────
const BOARD_TXT = {
  name: { size: 54, sx: 1.22, fill: "#e8cc92" },
  spec: { size: 34, sx: 1.2, fill: "#ece4dc" },
};
async function buildJabarkasBoard() {
  const template = `${A}/heroes-stronghold-might-crag_hack.webp`;
  const others = ["magic-dessa", "magic-gundula", "might-shiva", "might-tarnum_stronghold", "might-yog"].map((n) => `${A}/heroes-stronghold-${n}.webp`);
  const tpl = read(template);
  // 1) erase the name and the specialty picture + label (class line, stats,
  //    Offense ability, frame and level track stay the scan's own)
  const specInner = { left: 1208, top: 406, width: 167, height: 146 };
  const erase = [
    await patchOp(tpl, { left: 1275, top: 84, width: 60, height: 50 }, { left: 925, top: 80, width: 350, height: 58 }, 4),
    await patchOp(tpl, { left: 1400, top: 598, width: 50, height: 48 }, { left: 1205, top: 596, width: 180, height: 50 }, 6),
  ];
  let img = await sharp(tpl).composite(erase).png().toBuffer();
  const draw = [];
  // 2) portrait through the frame mask (keeps the scrollwork corner on top)
  const fm = await frameMask(template, others, { left: 34, top: 36, width: 676, height: 674 });
  await debugMask("board-jabarkas", fm, template);
  draw.push(await paintThroughMask(fm, await artForWindow(fm, PORTRAIT.jabarkas.file, { left: 0, top: 0, width: 1024, height: 1024 })));
  // 3) name
  draw.push(await textAt("Jabarkas", BOARD_TXT.name, 1101, 127));
  // 4) specialty: the Orcs picture in the printed recessed slot + label
  const art = await sharp(read(WINDOW_ART.jabarkas)).resize(specInner.width, specInner.height, { fit: "cover" }).png().toBuffer();
  const shade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${specInner.width}" height="${specInner.height}"><defs><filter id="b"><feGaussianBlur stdDeviation="3"/></filter></defs><rect x="0" y="0" width="100%" height="100%" fill="none" stroke="#000" stroke-width="7" stroke-opacity=".55" filter="url(#b)"/></svg>`);
  draw.push({ input: await sharp(art).composite([{ input: shade }]).png().toBuffer(), left: specInner.left, top: specInner.top });
  draw.push(await textAt("Orcs", BOARD_TXT.spec, 1291.5, 634));
  img = await sharp(img).composite(draw).png().toBuffer();
  const out = `${A}/heroes-stronghold-might-jabarkas.webp`;
  writeFileSync(out, await sharp(img).webp({ quality: 92 }).toBuffer());
  console.log("wrote", out);
}
async function buildJabarkasPortraits() {
  const master = PORTRAIT.jabarkas.file;
  const boardart = `${A}/hero_boardart-jabarkas.webp`;
  writeFileSync(boardart, await sharp(read(master)).resize(572, 582, { fit: "cover", position: "centre" }).removeAlpha().webp({ quality: 90 }).toBuffer());
  const portrait = `${A}/hero_portraits-jabarkas.webp`;
  writeFileSync(portrait, await sharp(read(master)).extract({ left: 112, top: 20, width: 800, height: 883 }).resize(464, 512, { fit: "cover" }).removeAlpha().webp({ quality: 90 }).toBuffer());
  console.log("wrote", boardart, portrait);
}

// ─── specialty symbols for the board slot / hero panel (SPECIALTY_ICON_BY_HERO)
/** The printed symbol alone (no spell-card cartouche), transparent 512². */
const ICON_OUT = {
  cuthbert: "icon-weakness-symbol.webp", // shared with Olema (same Weakness symbol)
  darkstorn: "icon-darkstorn-stone_skin.webp",
  uland: "icon-uland-cure.webp",
  kastore: "icon-kastore-sorcery.webp",
  isra: "icon-isra-necromancy.webp",
};
async function buildIcons(list) {
  for (const hero of list.filter((h) => ICON_OUT[h])) {
    const sym = await symbol(hero);
    const box = { left: 28, top: 28, width: 456, height: 456 };
    const placed = await fitInto(sym, box);
    const out = ICON(ICON_OUT[hero]);
    await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([placed]).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(out);
    console.log("wrote", out);
  }
}

const only = process.argv[2] || "all";
const heroes = process.argv[3] ? process.argv[3].split(",") : Object.keys(HEROES);
for (const h of heroes) if (!HEROES[h]) throw new Error(`unknown hero ${h}`);
if (!existsSync(PORTRAIT.jabarkas.file)) throw new Error(`missing Codex master ${PORTRAIT.jabarkas.file}`);
if (only === "all" || only === "portraits") await buildJabarkasPortraits();
if (only === "all" || only === "board") await buildJabarkasBoard();
if (only === "all" || only === "cards") for (const h of heroes) for (const lv of [1, 4, 6]) await buildCard(h, lv);
if (only === "all" || only === "icons") await buildIcons(heroes);
