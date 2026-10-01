#!/usr/bin/env node
/**
 * Play the whole tutorial through the REAL app UI, exactly as a player would —
 * clicking only what Sandro's pointer targets — and film it into one short
 * "Watch how" clip per player move.
 *
 *   node scripts/tutorial/record-clips.mjs --layout computer|phone [--base http://localhost:3000]
 *                                          [--video [--resume]] [--from 0] [--to 99999] [--headed]
 *
 * Without --video it is a fast end-to-end check (animations skipped) that every
 * scripted move can be made through the pointer targets; it stops with a
 * screenshot at the first move it cannot make. With --video (animations on) it
 * captures each move from the browser screencast and encodes
 * public/assets/tutorial/clips/<layout>/s<N>.webm (+ lobby-<issue>.webm) with ffmpeg
 * as it goes, then updates src/data/tutorial/tutorial-clips.json. --resume keeps
 * existing clips and films only the missing ones (e.g. after a crash).
 * Needs a running app (npm run dev or next start) at --base. Publish the clips
 * with `npm run media:publish` afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const has = (name) => argv.includes(`--${name}`);

const layout = flag("layout", "computer");
const base = flag("base", "http://localhost:3000");
const video = has("video");
const from = Number(flag("from", "0"));
const to = Number(flag("to", "99999"));
// --resume: keep existing clips and only film moves that have none yet.
const resume = has("resume");
// Clips longer than this keep only their last part (the click + result).
const MAX_CLIP_MS = 8000;
const OUT = path.join(ROOT, "tmp", "tutorial-clips", layout);
const CLIP_DIR = path.join(ROOT, "public", "assets", "tutorial", "clips", layout);
const MANIFEST = path.join(ROOT, "src", "data", "tutorial", "tutorial-clips.json");
fs.mkdirSync(OUT, { recursive: true });

const viewport = layout === "phone" ? { width: 390, height: 844 } : { width: 1280, height: 720 };
const browser = await chromium.launch({ headless: !has("headed") });
const context = await browser.newContext({
  viewport,
  ...(layout === "phone" ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}),
});
await context.addInitScript(
  ({ layout, video }) => {
    try {
      localStorage.setItem("binh-ui-mode", layout);
      localStorage.setItem("binh-helper-coach", "off");
      localStorage.setItem("binh-welcome-dismissed", "1");
      localStorage.setItem("binh-tutorial-prompt", "off");
      localStorage.setItem("binh-skip-animations", video ? "0" : "1");
      if (!localStorage.getItem("homm3bg.displayName")) localStorage.setItem("homm3bg.displayName", "Apprentice");
      // Fresh tutorial on the first load of this run only.
      if (!sessionStorage.getItem("recorder-started")) {
        sessionStorage.setItem("recorder-started", "1");
        for (const key of ["binh-tutorial-progress", "binh-tutorial-checkpoint", "binh-tutorial-lessons-seen", "binh-tutorial-lesson-current"]) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore
    }
  },
  { layout, video },
);
const page = await context.newPage();
// Surface app errors (a tutorial run doubles as an end-to-end check).
page.on("pageerror", (error) => console.log(`PAGE ERROR: ${String(error).slice(0, 400)}`));
page.on("console", (message) => {
  if (message.type() === "error") console.log(`CONSOLE ERROR: ${message.text().slice(0, 400)}`);
});
const videoStart = Date.now();
const log = (line) => console.log(`[${((Date.now() - videoStart) / 1000).toFixed(1)}s] ${line}`);

// ---------------------------------------------------------------- filming
// Frames come from the browser's own screencast and are kept PER CLIP with
// their arrival times (a whole-session video drifts from the wall clock when
// the machine is busy, which put the wrong moment in clips). Sandro's panel
// is hidden while filming — the clip shows the controls and his hand.
const FRAMES = path.join(OUT, "frames");
let filming = null; // { key, dir, frames: [{ file, at }] }
let lastFrame = null; // most recent frame, to open a clip on the current screen
let frameSeq = 0;
if (video) {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  if (!resume) fs.rmSync(CLIP_DIR, { recursive: true, force: true });
  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", (event) => {
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => undefined);
    lastFrame = event.data;
    if (filming) {
      const file = path.join(filming.dir, `f${String(frameSeq++).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(event.data, "base64"));
      filming.frames.push({ file, at: Date.now() });
    }
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, everyNthFrame: 1 });
}

// Computer clips: crop a 16:9 window around everything clicked in the step
// (sharp, readable UI) instead of shrinking the whole screen. Phone clips
// keep the whole (small) screen.
function cropFor(boxes) {
  if (layout === "phone" || !boxes?.length) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  let w = Math.max(560, maxX - minX + 260);
  let h = Math.max(315, maxY - minY + 200);
  if (w / h > 16 / 9) h = (w * 9) / 16;
  else w = (h * 16) / 9;
  w = Math.min(viewport.width, Math.round(w / 2) * 2);
  h = Math.min(viewport.height, Math.round(h / 2) * 2);
  const x = Math.max(0, Math.min(viewport.width - w, Math.round((minX + maxX) / 2 - w / 2)));
  const y = Math.max(0, Math.min(viewport.height - h, Math.round((minY + maxY) / 2 - h / 2)));
  return `crop=${w}:${h}:${x}:${y},`;
}

/** Encode one clip from its frames (each frame stays up until the next arrived), then drop the frames. */
function encodeClip(clip) {
  const lines = [];
  clip.frames.forEach((frame, index) => {
    const next = clip.frames[index + 1]?.at ?? clip.end;
    const duration = Math.max(0.04, Math.min(4, (next - frame.at) / 1000));
    lines.push(`file '${frame.file.split(path.sep).join("/")}'`, `duration ${duration.toFixed(3)}`);
  });
  lines.push(`file '${clip.frames.at(-1).file.split(path.sep).join("/")}'`);
  const list = path.join(clip.dir, "list.txt");
  fs.writeFileSync(list, `${lines.join("\n")}\n`);
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  const target = path.join(CLIP_DIR, `${clip.key}.webm`);
  const scale = layout === "phone" ? "scale=270:-2" : "scale='min(640,iw)':-2";
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `${cropFor(clip.boxes) ?? ""}${scale},fps=15,format=yuv420p`,
    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-an", target,
  ]);
  fs.rmSync(clip.dir, { recursive: true, force: true });
}

const hasClip = (key) => fs.existsSync(path.join(CLIP_DIR, `${key}.webm`));

function startClip(key) {
  if (!video) return;
  if (resume && hasClip(key)) return;
  const dir = path.join(FRAMES, key);
  fs.mkdirSync(dir, { recursive: true });
  filming = { key, dir, frames: [] };
  // The screencast only sends changed frames: open the clip on the screen as it is now.
  if (lastFrame) {
    const file = path.join(dir, `f${String(frameSeq++).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(lastFrame, "base64"));
    filming.frames.push({ file, at: Date.now() });
  }
}

const finished = []; // keys of clips encoded in this run

async function endClip(boxes) {
  if (!video || !filming) return;
  await sleep(900); // let the result of the move show
  const clip = { ...filming, boxes, end: Date.now() };
  filming = null;
  // Start just before the first click that landed (skip any wait behind an
  // animation), and never run longer than MAX_CLIP_MS.
  const from = Math.max((clip.firstClickAt ?? clip.end) - 900, clip.end - MAX_CLIP_MS);
  const opening = clip.frames.filter((frame) => frame.at <= from).at(-1);
  clip.frames = [...(opening ? [{ ...opening, at: from }] : []), ...clip.frames.filter((frame) => frame.at > from)];
  if (!clip.frames.length) return;
  // Encode now: a crash later in the walk never loses finished clips.
  encodeClip(clip);
  finished.push(clip.key);
}

const probe = () =>
  page.evaluate(() => {
    const handle = window.__binhTutorial;
    if (!handle) return null;
    const status = handle.status();
    return {
      mode: status.mode,
      step: status.step,
      total: status.totalSteps,
      thinking: status.computerThinking,
      expected: status.expected ? status.expected.action.type : null,
      lobbyIssues: status.lobbyIssues,
      divergence: status.divergence,
      target: handle.target,
    };
  });

/**
 * Click exactly what the pointer is on: the page's own picker (first
 * uncovered match, falling back to closing a covering panel).
 */
/** Click rectangles of the current clip (for cropping the video around them). */
let clickBoxes = [];

async function clickTarget() {
  const picked = await page.evaluate(() => window.__binhTutorial?.pick?.() ?? null);
  if (!picked) return null;
  try {
    const element = page.locator(picked.selector).nth(picked.index);
    const box = await element.boundingBox().catch(() => null);
    // Filming: let the pointer settle on the control before the click.
    const aimedAt = Date.now();
    if (video) await sleep(650);
    // Click exactly where Sandro's hand points (a part of the control that
    // really takes the click, even when something overlaps the rest of it).
    const position = box ? { x: Math.max(1, picked.x - box.x), y: Math.max(1, picked.y - box.y) } : undefined;
    await element.click({ timeout: 4000, ...(position ? { position } : {}) });
    if (box) clickBoxes.push(box);
    if (filming) filming.firstClickAt ??= aimedAt;
    if (video) await sleep(250);
    return picked.selector;
  } catch {
    // Still animating: retry on the next round.
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stuck(reason, info) {
  const shot = path.join(OUT, `stuck-${Date.now()}.png`);
  await page.screenshot({ path: shot }).catch(() => undefined);
  console.error(`STUCK: ${reason}\n${JSON.stringify(info, null, 1)}\nscreenshot: ${shot}`);
  await context.close();
  await browser.close();
  process.exit(1);
}

await page.goto(`${base}/?room=tutorial-sandro`, { waitUntil: "domcontentloaded", timeout: 180000 });
if (video) {
  // Sandro's panel stays out of the films (his pointing hand stays in).
  await page.addStyleTag({ content: "[data-tutorial-coach]{opacity:0!important;pointer-events:none!important}" });
}
let info = null;
for (let tries = 0; tries < 240 && !(info = await probe())?.mode?.match(/lobby|script/); tries += 1) await sleep(500);
if (!info) await stuck("tutorial room never loaded", {});
log(`loaded: ${info.mode}`);


// ------------------------------------------------------------------ lobby
// Choose "Teach me the setup" on Sandro's welcome, so the lobby is played (and filmed).
await page.locator("[data-tutorial-learn-setup]").first().click({ timeout: 8000 }).catch(() => undefined);
let lobbyGuard = 0;
while ((info = await probe())?.mode === "lobby") {
  if (++lobbyGuard > 60) await stuck("lobby did not finish", info);
  const issue = info.lobbyIssues[0] ?? "start";
  if (!info.target?.selectors?.length) {
    await sleep(400);
    continue;
  }
  if (!filming || filming.key !== `lobby-${issue}`) {
    clickBoxes = [];
    startClip(`lobby-${issue}`);
  }
  const clicked = await clickTarget();
  log(`lobby ${issue}: ${clicked ?? "(nothing clickable yet)"}`);
  await sleep(700);
  const after = await probe();
  if (after?.lobbyIssues?.[0] !== info.lobbyIssues[0] || after?.mode !== "lobby") {
    await endClip(clickBoxes);
  }
}

// ----------------------------------------------------------------- script
let idleSince = Date.now();
let lastStep = -1;
while (true) {
  info = await probe();
  if (!info) await stuck("probe lost", {});
  if (info.mode === "done") {
    log("tutorial won");
    break;
  }
  if (info.mode === "free") await stuck(`left the script: ${info.divergence}`, info);
  if (info.step !== lastStep) {
    lastStep = info.step;
    idleSince = Date.now();
  }
  if (Date.now() - idleSince > 120000) await stuck("no progress for 2 minutes", info);
  if (info.thinking || !info.expected || !info.target?.selectors?.length) {
    await sleep(250);
    continue;
  }
  if (info.step > to) break;
  const step = info.step;
  clickBoxes = [];
  if (step >= from) startClip(`s${step}`);
  let advanced = false;
  for (let attempt = 0; attempt < 12 && !advanced; attempt += 1) {
    const current = await probe();
    if (current.step !== step) {
      advanced = true;
      break;
    }
    const clicked = current.target?.selectors?.length ? await clickTarget() : null;
    for (let wait = 0; wait < 10; wait += 1) {
      await sleep(150);
      if ((await probe()).step !== step) {
        advanced = true;
        break;
      }
    }
    if (!advanced && !clicked) await sleep(600);
  }
  if (!advanced) await stuck(`could not make step ${step} (${info.expected})`, info);
  log(`step ${step} ${info.expected} ✓ ${info.target.hint}`);
  if (step >= from) await endClip(clickBoxes);
}

await context.close();
await browser.close();

if (video) {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  // The manifest lists what is really on disk (so --resume runs add up).
  const files = fs.existsSync(CLIP_DIR) ? fs.readdirSync(CLIP_DIR).filter((file) => file.endsWith(".webm")) : [];
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "tutorial", "tutorial-script.json"), "utf8"));
  manifest.scriptId = script.id;
  manifest[layout] = files
    .filter((file) => /^s\d+\.webm$/.test(file))
    .map((file) => Number(file.slice(1, -5)))
    .sort((left, right) => left - right);
  manifest.lobby = { ...(manifest.lobby ?? {}), [layout]: files.filter((file) => file.startsWith("lobby-")).map((file) => file.slice(0, -5)) };
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  const bytes = files.reduce((sum, file) => sum + fs.statSync(path.join(CLIP_DIR, file)).size, 0);
  console.log(`${finished.length} clips filmed this run; ${files.length} clips → ${path.relative(ROOT, CLIP_DIR)} (${(bytes / 1048576).toFixed(1)} MB total)`);
}
console.log("done");
