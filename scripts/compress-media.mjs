#!/usr/bin/env node
// Recompress recently-added public/ media with no visible quality loss and zero
// functional regression. See docs at bottom for the rules this enforces.
//
//   node scripts/compress-media.mjs            # rewrite in place
//   DRY_RUN=1 node scripts/compress-media.mjs  # report only, write nothing
//
// Guarantees per rewrite:
//   * image dimensions unchanged, alpha channel presence unchanged
//   * audio duration within ~50ms
//   * new file <= 85% of the original AND original >= 50KB  (images + normal mp3)
//   * a file is only ever replaced by a SMALLER file; never deleted (except the
//     two allowed path changes: doom .wav -> .mp3, and the two orphan town PNGs
//     -> .webp)
//
// Excluded (untouched):
//   * curated unit-voice packs: sounds/units, sounds/fuyuki, sounds/azur-lane
//   * mp3 outside music/ambient/effects/adventure
//   * classic card-face families pinned to a deliberate q94 size-band by tests
//     (units-neutral-*, conflux elemental faces, units-elemental-art-*,
//     war_machines-*, doom/units/*) — recompressing them would break those pins
//   * ogg (voice packs only)

import { readdir, stat, readFile, writeFile, rm, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileP = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const DRY_RUN = process.env.DRY_RUN === "1";
// Low concurrency: on Windows under AppData, real-time AV scanning of each
// freshly-written temp file causes transient EPERM/UNKNOWN on rename when many
// files are touched at once.
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const MIN_SIZE = 50 * 1024; // 50KB
const RATIO = 0.85;
const KB = (n) => (n / 1024).toFixed(1) + "KB";
const MB = (n) => (n / 1048576).toFixed(2) + "MB";

// ---- path helpers ---------------------------------------------------------
const rel = (abs) => path.relative(PUBLIC, abs).split(path.sep).join("/");

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// Windows (esp. under AppData with AV scanning) throws transient
// UNKNOWN/EPERM/EBUSY on open/rename/unlink; retry a few times.
const TRANSIENT = new Set(["UNKNOWN", "EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);
async function retry(fn, tries = 12) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!TRANSIENT.has(e.code)) throw e;
      await new Promise((r) => setTimeout(r, Math.min(200 * (i + 1), 2000)));
    }
  }
  throw last;
}
// Atomic in-place replace: write sibling temp then rename over the original.
async function writeAtomic(abs, buf) {
  const tmp = abs + ".ctmp";
  await retry(() => writeFile(tmp, buf));
  await retry(() => rename(tmp, abs));
}

// Simple concurrency pool.
async function pool(items, worker, limit = CONCURRENCY) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---- classification -------------------------------------------------------
// Classic card-face families pinned to a deliberate q94 size-band by tests
// (a lower AND upper byte floor). Recompressing them below the floor would
// break those pins, so they are left at the repo's committed q94 encoding.
const EXCLUDE_IMAGE = [
  /^assets\/units-neutral-/,          // wog-mod, placeholder-neutral, elemental (neutral)
  /^assets\/units-creature-bank-/,    // creature-bank-unit-card-images (>100KB floor)
  /^assets\/units-conflux-bronze-[a-z]+_elementals/, // elemental (conflux)
  /^assets\/units-elemental-art-/,    // elemental (art panels)
  /^assets\/war_machines-/,           // war-machine-card-images (>150KB floor)
  /^assets\/doom\/units\//            // doom-mod (>40KB floor)
];

// The two orphan town PNGs allowed to convert to webp.
const TOWN_PNG_TO_WEBP = new Set([
  "assets/anime/towns/azure-breeze-sect.png",
  "assets/anime/towns/fuyuki-city.png"
]);

function webpQualityFor(r) {
  // q85 — text-bearing card faces
  if (/^assets\/anime\/units\//.test(r)) return 85;
  if (/^assets\/anime\/equipment\/cards\//.test(r)) return 85;
  if (/^assets\/anime\/artifacts\//.test(r)) return 85;
  if (/^assets\/units-commander-/.test(r)) return 85;
  if (/^assets\/units-/.test(r)) return 85; // faction unit card faces
  if (/^assets\/statistics-/.test(r)) return 85;
  if (/^assets\/specialty-card\//.test(r)) return 85;
  if (/^assets\/story\/covers\//.test(r)) return 85;
  if (/^assets\/wog\/artifacts\//.test(r)) return 85;
  if (/^assets\/set-artifacts\//.test(r)) return 85; // Polish set card faces + icons
  if (/^assets\/polish-balance\//.test(r)) return 85; // Polish Balance Pack reprinted card faces
  // q80 — scenery / panorama / board / portrait / background
  if (/^assets\/board\//.test(r)) return 80;
  if (/^assets\/town-board\//.test(r)) return 80;
  if (/^assets\/fx\//.test(r)) return 80;
  if (/^assets\/pandora\//.test(r)) return 80;
  if (/^assets\/story\/(backgrounds|sprites)\//.test(r)) return 80;
  if (/^assets\/anime\/(towns|tiles|heroes|field-overrides)\//.test(r)) return 80;
  if (/^assets\/(towns-|hero_board|heroes-)/.test(r)) return 80;
  // default
  return 82;
}

// ---- image pass -----------------------------------------------------------
const dirStats = new Map(); // rel-dir -> {before, after, rewritten, skipped}
function tally(r, before, after, rewritten) {
  const d = r.includes("/") ? r.slice(0, r.lastIndexOf("/")) : ".";
  const s = dirStats.get(d) || { before: 0, after: 0, rewritten: 0, skipped: 0 };
  s.before += before;
  s.after += after;
  if (rewritten) s.rewritten++;
  else s.skipped++;
  dirStats.set(d, s);
}

async function processImage(abs) {
  const r = rel(abs);
  const ext = path.extname(abs).toLowerCase();
  const orig = await stat(abs);
  const oldSize = orig.size;

  // Two orphan town PNGs -> webp (allowed path change, no size floor).
  if (TOWN_PNG_TO_WEBP.has(r)) {
    const input = await retry(() => readFile(abs));
    const meta = await sharp(input).metadata();
    const buf = await sharp(input).webp({ quality: 82, effort: 6, smartSubsample: true }).toBuffer();
    const nm = await sharp(buf).metadata();
    if (nm.width !== meta.width || nm.height !== meta.height) throw new Error(`DIM DRIFT ${r}`);
    if (Boolean(nm.hasAlpha) !== Boolean(meta.hasAlpha)) throw new Error(`ALPHA DRIFT ${r}`);
    const out = abs.replace(/\.png$/i, ".webp");
    if (buf.length <= oldSize * RATIO) {
      if (!DRY_RUN) {
        await retry(() => writeFile(out, buf));
        await retry(() => rm(abs));
      }
      tally(r, oldSize, buf.length, true);
      return { r, action: "PNG→WEBP", oldSize, newSize: buf.length };
    }
    tally(r, oldSize, oldSize, false);
    return { r, action: "skip(ratio)", oldSize, newSize: oldSize };
  }

  if (EXCLUDE_IMAGE.some((re) => re.test(r))) {
    tally(r, oldSize, oldSize, false);
    return { r, action: "skip(excluded)", oldSize, newSize: oldSize };
  }
  if (oldSize < MIN_SIZE) {
    tally(r, oldSize, oldSize, false);
    return { r, action: "skip(<50KB)", oldSize, newSize: oldSize };
  }

  // Read the source into memory FIRST so sharp never holds a handle/mmap on the
  // file we are about to replace (the source == the rename target). This is
  // what makes the in-place rewrite reliable on Windows under AV.
  const input = await retry(() => readFile(abs));
  const meta = await sharp(input).metadata();
  let pipeline;
  if (ext === ".webp") {
    const q = webpQualityFor(r);
    // effort 6 for the q85 text card faces (as specified); effort 4 for the
    // bulk scenery/default — near-identical output size, far faster to encode.
    pipeline = sharp(input).webp({ quality: q, effort: q >= 85 ? 6 : 4, smartSubsample: true });
  } else if (ext === ".png") {
    // keep format, lossless re-encode only (no palette — avoid posterizing art)
    pipeline = sharp(input).png({ compressionLevel: 9, adaptiveFiltering: true });
  } else if (ext === ".jpg" || ext === ".jpeg") {
    pipeline = sharp(input).jpeg({ quality: 80, mozjpeg: true });
  } else {
    tally(r, oldSize, oldSize, false);
    return { r, action: "skip(ext)", oldSize, newSize: oldSize };
  }

  const buf = await pipeline.toBuffer();
  const nm = await sharp(buf).metadata();
  if (nm.width !== meta.width || nm.height !== meta.height) throw new Error(`DIM DRIFT ${r} ${meta.width}x${meta.height} -> ${nm.width}x${nm.height}`);
  if (Boolean(nm.hasAlpha) !== Boolean(meta.hasAlpha)) throw new Error(`ALPHA DRIFT ${r} ${meta.hasAlpha} -> ${nm.hasAlpha}`);

  if (buf.length <= oldSize * RATIO) {
    if (!DRY_RUN) await writeAtomic(abs, buf);
    tally(r, oldSize, buf.length, true);
    return { r, action: "rewrite", oldSize, newSize: buf.length };
  }
  tally(r, oldSize, oldSize, false);
  return { r, action: "skip(ratio)", oldSize, newSize: oldSize };
}

// ---- audio pass (music/ambient/effects/adventure mp3) ---------------------
const AUDIO_DIRS = ["sounds/music", "sounds/ambient", "sounds/effects", "sounds/adventure"];

async function probe(abs) {
  const { stdout } = await execFileP("ffprobe", [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=bit_rate:format=duration,bit_rate",
    "-of", "json", abs
  ]);
  const j = JSON.parse(stdout);
  const dur = parseFloat(j.format?.duration ?? "0");
  const br = parseInt(j.streams?.[0]?.bit_rate ?? j.format?.bit_rate ?? "0", 10);
  return { dur, br };
}

async function processMp3(abs) {
  const r = rel(abs);
  const orig = await stat(abs);
  const oldSize = orig.size;
  if (oldSize < MIN_SIZE) {
    tally(r, oldSize, oldSize, false);
    return { r, action: "skip(<50KB)", oldSize, newSize: oldSize };
  }
  const { dur, br } = await probe(abs);
  if (br < 160000) {
    tally(r, oldSize, oldSize, false);
    return { r, action: `skip(<160k br=${Math.round(br / 1000)}k)`, oldSize, newSize: oldSize };
  }
  const tmp = abs + ".tmp.mp3";
  await execFileP("ffmpeg", ["-y", "-i", abs, "-codec:a", "libmp3lame", "-q:a", "5", "-map_metadata", "-1", tmp]);
  const nt = await stat(tmp);
  const { dur: ndur } = await probe(tmp);
  if (Math.abs(ndur - dur) > 0.05) {
    await rm(tmp);
    throw new Error(`DURATION DRIFT ${r} ${dur} -> ${ndur}`);
  }
  if (nt.size <= oldSize * RATIO) {
    if (!DRY_RUN) await retry(() => rename(tmp, abs));
    else await rm(tmp);
    tally(r, oldSize, nt.size, true);
    return { r, action: "rewrite", oldSize, newSize: nt.size };
  }
  await rm(tmp);
  tally(r, oldSize, oldSize, false);
  return { r, action: "skip(ratio)", oldSize, newSize: oldSize };
}

// ---- doom wav -> mp3 (path change) ----------------------------------------
async function processDoom() {
  const dir = path.join(PUBLIC, "sounds/doom");
  if (!existsSync(dir)) return { converted: 0, before: 0, after: 0 };
  const wavs = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".wav"));
  let before = 0, after = 0, converted = 0;
  await pool(wavs, async (name) => {
    const abs = path.join(dir, name);
    const mp3 = abs.replace(/\.wav$/i, ".mp3");
    const st = await stat(abs);
    before += st.size;
    const { dur } = await probe(abs);
    if (DRY_RUN) {
      after += st.size; // unknown; placeholder
      converted++;
      return;
    }
    await execFileP("ffmpeg", ["-y", "-i", abs, "-ac", "1", "-codec:a", "libmp3lame", "-q:a", "6", mp3]);
    const { dur: ndur } = await probe(mp3);
    if (Math.abs(ndur - dur) > 0.05) throw new Error(`DOOM DURATION DRIFT ${name} ${dur} -> ${ndur}`);
    const nst = await stat(mp3);
    after += nst.size;
    await retry(() => rm(abs));
    converted++;
  });

  // Rewrite manifest: /sounds/doom/<name>.wav -> .mp3 (src paths only; the
  // literal "DECAY.wav" note is not a /sounds/doom/ path and is left alone).
  const manifestPath = path.join(PUBLIC, "sounds/manifest.json");
  const before_m = await readFile(manifestPath, "utf8");
  const after_m = before_m.replace(/(\/sounds\/doom\/[A-Za-z0-9_-]+)\.wav/g, "$1.mp3");
  if (after_m !== before_m && !DRY_RUN) await writeFile(manifestPath, after_m);
  return { converted, before, after, manifestChanged: after_m !== before_m };
}

// ---- run ------------------------------------------------------------------
(async () => {
  console.log(`compress-media ${DRY_RUN ? "(DRY RUN)" : ""} root=${ROOT}`);
  const failures = [];
  // Transient FS errors (AV locks) skip-and-continue so one flaky file cannot
  // abort the run; a re-run picks up stragglers (and doubles as the idempotence
  // check). A DIM/ALPHA drift is a real bug and still aborts.
  const guard = (worker) => async (abs) => {
    try {
      return await worker(abs);
    } catch (e) {
      if (/DRIFT/.test(String(e.message))) throw e;
      failures.push(`${rel(abs)} [${e.code || e.message}]`);
      try { await rm(abs + ".ctmp"); } catch {}
      try { await rm(abs + ".tmp.mp3"); } catch {}
      return null;
    }
  };

  const all = await walk(path.join(PUBLIC, "assets"));
  const images = all.filter((p) => /\.(webp|png|jpe?g)$/i.test(p));
  console.log(`\n== IMAGES (${images.length}) ==`);
  await pool(images, guard(processImage));

  console.log(`\n== AUDIO mp3 (music/ambient/effects/adventure) ==`);
  let audio = [];
  for (const d of AUDIO_DIRS) {
    const abs = path.join(PUBLIC, d);
    if (existsSync(abs)) audio.push(...(await walk(abs)).filter((p) => p.toLowerCase().endsWith(".mp3")));
  }
  await pool(audio, guard(processMp3));

  console.log(`\n== DOOM wav -> mp3 ==`);
  const doom = await processDoom();
  console.log(`  converted ${doom.converted} wav->mp3, ${MB(doom.before)} -> ${MB(doom.after)}, manifest changed=${doom.manifestChanged ?? false}`);

  // ---- per-directory summary ----
  console.log(`\n== PER-DIRECTORY SUMMARY (rewritten only shown when >0) ==`);
  const dirs = [...dirStats.keys()].sort();
  let tBefore = 0, tAfter = 0, tRw = 0, tSk = 0;
  for (const d of dirs) {
    const s = dirStats.get(d);
    tBefore += s.before; tAfter += s.after; tRw += s.rewritten; tSk += s.skipped;
    if (s.rewritten > 0) {
      const saved = s.before - s.after;
      console.log(`  ${d.padEnd(38)} rw=${String(s.rewritten).padStart(3)} sk=${String(s.skipped).padStart(3)}  ${MB(s.before)} -> ${MB(s.after)}  (-${MB(saved)})`);
    }
  }
  console.log(`\n== TOTAL (images) ==`);
  console.log(`  rewritten=${tRw} skipped=${tSk}  ${MB(tBefore)} -> ${MB(tAfter)}  saved ${MB(tBefore - tAfter)}`);
  if (failures.length) {
    console.log(`\n== ${failures.length} TRANSIENT FAILURES (re-run to retry) ==`);
    for (const f of failures) console.log(`  ${f}`);
  } else {
    console.log(`\n== 0 transient failures ==`);
  }
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
