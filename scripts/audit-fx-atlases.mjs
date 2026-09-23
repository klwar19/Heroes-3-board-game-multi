#!/usr/bin/env node
/**
 * Read-only audit of every sprite atlas declared in src/data/fx.ts.
 *
 * Reports the defects that make ImageGen atlases look unnatural in motion:
 *   grid      atlas size is not cols*frameWidth x rows*frameHeight, or frame
 *             sizes are fractional (edges blur / neighbour slivers show);
 *   edge      artwork touches the cell border (clipped flat, or bleeding in
 *             from the neighbouring frame);
 *   jitter    the artwork's anchor jumps between consecutive frames;
 *   pop       coverage jumps abruptly between consecutive frames.
 * Nothing is modified. Fix candidates with a dedicated builder (for breaths:
 * scripts/build-breath-fx.mjs).
 *
 * Usage: node scripts/audit-fx-atlases.mjs [--all] [--json]
 *   --all  also audit the original Heroes III sheets and list clean atlases
 */
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), "utf8")};` };
    if (url.endsWith(".ts")) {
      const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
      return { format: "module", shortCircuit: true, source: outputText };
    }
    return nextLoad(url, context);
  },
});
const { listFxSheets } = await import(pathToFileURL(path.join(root, "src", "data", "fx.ts")).href);

const showAll = process.argv.includes("--all");
const asJson = process.argv.includes("--json");
const bySource = new Map();
for (const [key, sheet] of Object.entries(listFxSheets())) {
  const entry = bySource.get(sheet.src) ?? { keys: [], sheet };
  entry.keys.push(key);
  bySource.set(sheet.src, entry);
}

const results = [];
for (const [src, { keys, sheet }] of bySource) {
  // Original Heroes III sheets (/assets/fx) are authoritative; audit them only on request.
  if (!showAll && !src.startsWith("/fx/")) continue;
  const file = path.join(root, "public", src.replace(/^\//, ""));
  if (!existsSync(file)) { results.push({ src, keys, issues: ["missing file"], score: 100 }); continue; }
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const issues = [];
  let score = 0;
  const { cols, rows, frameWidth, frameHeight, frames } = sheet;
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) { issues.push(`fractional frame ${frameWidth}x${frameHeight}`); score += 20; }
  const expectedW = cols * frameWidth, expectedH = rows * frameHeight;
  if (Math.abs(expectedW - info.width) > 1 || Math.abs(expectedH - info.height) > 1) {
    issues.push(`atlas ${info.width}x${info.height} but grid declares ${expectedW}x${expectedH}`); score += 15;
  }
  // Measure in the atlas's own pixel grid (the runtime scales the whole atlas).
  const cellW = info.width / cols, cellH = info.height / rows;
  const stats = [];
  let edgeFrames = 0;
  for (let f = 0; f < frames; f++) {
    const x0 = Math.round((f % cols) * cellW), y0 = Math.round(Math.floor(f / cols) * cellH);
    const x1 = Math.round((f % cols + 1) * cellW) - 1, y1 = Math.round((Math.floor(f / cols) + 1) * cellH) - 1;
    let mass = 0, sx = 0, sy = 0, border = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const a = data[(y * info.width + x) * 4 + 3] / 255;
      if (a < 0.08) continue;
      mass += a; sx += x * a; sy += y * a;
      if (a > 0.35 && (x === x0 || x === x1 || y === y0 || y === y1)) border++;
    }
    const perimeter = 2 * (x1 - x0 + y1 - y0);
    if (border > perimeter * 0.03) edgeFrames++;
    stats.push({ mass, cx: mass ? sx / mass - x0 : cellW / 2, cy: mass ? sy / mass - y0 : cellH / 2 });
  }
  if (edgeFrames >= Math.max(2, frames * 0.2)) { issues.push(`${edgeFrames}/${frames} frames touch the cell border`); score += Math.round(edgeFrames / frames * 30); }
  if (sheet.sequentialFrames && frames > 1) {
    let worstJump = 0, worstPop = 1;
    // Launch/flight/impact boundaries of phased projectiles legitimately cut;
    // fades legitimately change coverage, so compare only well-formed neighbours.
    const order = sheet.frameOrder ?? Array.from({ length: frames }, (_, index) => index);
    const phaseStarts = new Set(Object.values(sheet.projectilePhases ?? {}).filter(Array.isArray).map(([start]) => start));
    const peak = Math.max(...stats.map((stat) => stat.mass));
    for (let step = 1; step < order.length; step++) {
      if (phaseStarts.has(step)) continue;
      const a = stats[order[step - 1]], b = stats[order[step]];
      if (!a || !b || a.mass < peak * 0.25 || b.mass < peak * 0.25) continue;
      worstJump = Math.max(worstJump, Math.hypot((b.cx - a.cx) / cellW, (b.cy - a.cy) / cellH));
      worstPop = Math.max(worstPop, Math.max(a.mass, b.mass) / Math.min(a.mass, b.mass));
    }
    if (worstJump > 0.12) { issues.push(`anchor jumps ${(worstJump * 100).toFixed(0)}% of a cell between frames`); score += Math.round(worstJump * 100); }
    if (worstPop > 2.5) { issues.push(`coverage pops ${worstPop.toFixed(1)}x between frames`); score += Math.round((worstPop - 1) * 10); }
  }
  results.push({ src, keys, issues, score });
}

results.sort((a, b) => b.score - a.score);
const shown = showAll ? results : results.filter((result) => result.issues.length);
if (asJson) process.stdout.write(`${JSON.stringify(shown, null, 2)}\n`);
else {
  for (const result of shown) {
    process.stdout.write(`${String(result.score).padStart(3)}  ${result.src}  [${result.keys.slice(0, 3).join(", ")}${result.keys.length > 3 ? ", …" : ""}]\n`);
    for (const issue of result.issues) process.stdout.write(`       - ${issue}\n`);
  }
  process.stdout.write(`${shown.length} of ${results.length} atlases flagged\n`);
}
