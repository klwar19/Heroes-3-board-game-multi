#!/usr/bin/env node
/**
 * Tutorial art masters (Sandro mentor poses, welcome banner, menu icons) via
 * the Codex CLI image_gen tool — sequential, resumable, read-only sandbox.
 *
 *   node scripts/tutorial/codex-gen-tutorial.mjs [keyGlob]
 *
 * Prompts: scripts/tutorial/codex-jobs.json. Masters land in the git-ignored
 * tmp/gen/tutorial/raw/<key>.png; scripts/tutorial/build-tutorial-art.mjs turns
 * them into runtime webps. Same session-folder copy recipe as the Restia runner.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const JOBS = path.join(ROOT, "scripts", "tutorial", "codex-jobs.json");
const GEN_DIR = path.join(ROOT, "tmp", "gen", "tutorial");
const RAW_DIR = path.join(GEN_DIR, "raw");
const REF_DIR = path.join(GEN_DIR, "refs");
const LOG = path.join(GEN_DIR, "batch.log");
const IMAGES = path.join(os.homedir(), ".codex", "generated_images");
const MODEL = process.env.CODEX_MODEL ?? "gpt-6-luna";

function findCodex() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const base = path.join(os.homedir(), "AppData", "Local", "OpenAI", "Codex", "bin");
  const candidates = fs.existsSync(base)
    ? fs
        .readdirSync(base, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(base, entry.name, "codex.exe"))
        .filter((file) => fs.existsSync(file))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  if (!candidates.length) throw new Error("Codex CLI not found; set CODEX_BIN.");
  return candidates[0];
}

/** Sandro's printed board art + the painted campaign sprite as references. */
async function prepareRefs() {
  const sharp = require("sharp");
  fs.mkdirSync(REF_DIR, { recursive: true });
  const refs = {
    "sandro-board": "hero_boardart-sandro.webp",
    "sandro-painted": "story/sprites/sandro-generated.webp",
  };
  for (const [name, file] of Object.entries(refs)) {
    const target = path.join(REF_DIR, `${name}.png`);
    if (fs.existsSync(target)) continue;
    await sharp(path.join(ROOT, "public", "assets", file)).flatten({ background: "#000000" }).png().toFile(target);
  }
}

const only = process.argv[2] ?? "";
const pattern = only ? new RegExp("^" + only.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$") : null;
fs.mkdirSync(RAW_DIR, { recursive: true });
const log = (line) => {
  fs.appendFileSync(LOG, `${line}\n`);
  console.log(line);
};
const stamp = () => new Date().toTimeString().slice(0, 8);

function runCodex(codex, args, input, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(codex, args, { cwd: GEN_DIR, windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
    child.stdin.end(input);
  });
}

await prepareRefs();
const codex = findCodex();
const jobs = JSON.parse(fs.readFileSync(JOBS, "utf8"));
for (const job of jobs) {
  if (pattern && !pattern.test(job.key)) continue;
  const target = path.join(RAW_DIR, `${job.key}.png`);
  if (fs.existsSync(target) && fs.statSync(target).size > 8000) {
    log(`SKIP ${job.key}`);
    continue;
  }
  const refs = (job.refs ?? []).map((ref) => path.join(GEN_DIR, ref));
  const missing = refs.filter((ref) => !fs.existsSync(ref));
  if (missing.length) {
    log(`FAIL ${job.key} missing reference ${missing.join(", ")}`);
    continue;
  }
  const prompt = [
    "Use the built-in image_gen tool exactly once to create the image described below.",
    "Do not run any shell commands and do not create or edit any files; just generate the image and reply 'done'.",
    refs.length ? "The attached reference image(s) show the character design / art style to follow." : "",
    "",
    job.prompt
  ].join("\n");
  log(`START ${job.key} ${stamp()}`);
  const { code, out } = await runCodex(
    codex,
    ["exec", ...refs.flatMap((ref) => ["-i", ref]), "-m", MODEL, "-s", "read-only", "--skip-git-repo-check", "-C", GEN_DIR, "-"],
    prompt,
    10 * 60 * 1000
  );
  const sid = out.match(/session id:\s*([0-9a-f-]{36})/)?.[1];
  const dir = sid ? path.join(IMAGES, sid) : null;
  const image =
    dir && fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
          .map((file) => path.join(dir, file))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
      : null;
  if (image) {
    fs.copyFileSync(image, target);
    log(`OK ${job.key} size=${fs.statSync(target).size} ${stamp()}`);
  } else {
    log(`FAIL ${job.key} exit=${code} ${stamp()}\n${out.slice(-1500)}`);
    if (/usage limit|rate limit|quota/i.test(out)) {
      log("STOP usage limit");
      break;
    }
  }
}
log(`BATCH DONE ${stamp()}`);
