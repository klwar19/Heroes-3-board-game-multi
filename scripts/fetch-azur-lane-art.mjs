#!/usr/bin/env node

// Fetches REAL Azur Lane character art from the Fandom wiki (blhx.fandom.com)
// into scripts/anime-art/refs/azur-lane/<ref>.img — the input for the OFFLINE
// composite step (build-azur-lane-art.mjs). This refs/ tree is GITIGNORED
// (see .gitignore "scripts/anime-art/refs/"), so downloaded references never
// ship; only the composited public/assets outputs do.
//
// Network facts baked in (verified working in this sandbox):
//   * Fandom HTML pages 403, but the MediaWiki API works with a browser UA:
//       action=query&titles=File:<Name>&prop=imageinfo&iiprop=url|size&format=json
//   * Image URLs land on static.wikia.nocookie.net and download fine.
//   * Node's fetch does NOT honor the sandbox HTTPS proxy; curl DOES — so every
//     request shells out to curl via child_process.
//   * A downloaded "*.png" may actually carry WebP bytes; we keep the ".img"
//     ref extension and let sharp auto-detect format at build time.
//
// Idempotent: a ref already on disk (non-empty) is not re-downloaded. Prints a
// manifest (wiki file -> local ref) and writes it to manifest.json.
//
// Run: node scripts/fetch-azur-lane-art.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const refDir = path.join(root, "scripts", "anime-art", "refs", "azur-lane");
const manifestPath = path.join(refDir, "manifest.json");

const UA = "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0";
const API = "https://blhx.fandom.com/api.php";

// ref key -> candidate wiki "File:" names, in priority order (first that exists
// wins). `optional:true` targets may miss entirely (cached-only extras / icons).
const TARGETS = [
  // Heroes + commander (full-body standing art).
  { ref: "enterprise", candidates: ["Enterprise.png"] },
  { ref: "bismarck", candidates: ["Bismarck.png"] },
  { ref: "akashi", candidates: ["Akashi.png"] },
  { ref: "belfast", candidates: ["Belfast.png"] },
  // New hero portraits: Nagato ("Big Seven Flagship"), Sirius ("Royal Maid Gunner").
  { ref: "nagato", candidates: ["Nagato.png"] },
  { ref: "sirius", candidates: ["Sirius.png"] },

  // Named-shipgirl unit cards — ONE girl per card: FEW = base art, PACK = a
  // distinct alt/retrofit skin of the SAME girl.
  { ref: "laffey-few", candidates: ["Laffey.png"] },
  { ref: "laffey-pack", candidates: ["LaffeyRetrofit.png"] },
  // Javelin: base Javelin.png is too low-res, so FEW uses her Retrofit full-body;
  // PACK uses her Idol alt (distinct, high-res).
  { ref: "javelin-few", candidates: ["JavelinRetrofit.png", "JavelinWedding.png", "Javelin.png"] },
  { ref: "javelin-pack", candidates: ["JavelinIdol.png", "JavelinWedding.png", "JavelinSummer.png"] },
  { ref: "honolulu-few", candidates: ["Honolulu.png"] },
  { ref: "honolulu-pack", candidates: ["HonoluluSummer.png", "HonoluluChristmas.png", "HonoluluFestival.png"] },
  { ref: "unicorn-few", candidates: ["Unicorn.png"] },
  { ref: "unicorn-pack", candidates: ["UnicornCasual.png", "UnicornWedding.png"] },
  { ref: "yukikaze-few", candidates: ["Yukikaze.png"] },
  { ref: "yukikaze-pack", candidates: ["YukikazeOath.png", "YukikazeSpring.png", "YukikazeEvent.png"] },
  // Prinz Eugen: the live base title carries a SPACE; PACK is her Wedding alt.
  { ref: "prinz-eugen-few", candidates: ["Prinz Eugen.png", "Prinz_Eugen.png"] },
  { ref: "prinz-eugen-pack", candidates: ["Prinz EugenWedding.png", "Prinz EugenParty.png"] },
  { ref: "i-19-few", candidates: ["I-19.png"] },
  { ref: "i-19-pack", candidates: ["I-19 School.png", "I-19_School.png"] },

  // OPTIONAL per-character square icons (<Name>Icon.png, ~116px) — cached in refs
  // for possible later use. The town icon itself stays a panorama crop (repo
  // convention), so a miss here never matters.
  { ref: "icon-laffey", optional: true, candidates: ["LaffeyIcon.png"] },
  { ref: "icon-unicorn", optional: true, candidates: ["UnicornIcon.png"] },
  { ref: "icon-cleveland", optional: true, candidates: ["ClevelandIcon.png"] },
  { ref: "icon-prinz-eugen", optional: true, candidates: ["Prinz EugenIcon.png", "PrinzEugenIcon.png"] },
  { ref: "icon-u-47", optional: true, candidates: ["U-47Icon.png"] },
  { ref: "icon-hood", optional: true, candidates: ["HoodIcon.png"] },
  { ref: "icon-akagi", optional: true, candidates: ["AkagiIcon.png"] },
  { ref: "icon-enterprise", optional: true, candidates: ["EnterpriseIcon.png"] },
  { ref: "icon-enterprise-shipyard", optional: true, candidates: ["EnterpriseShipyardIcon.png"] },
  { ref: "icon-bismarck", optional: true, candidates: ["BismarckIcon.png", "Bismarck ✧Icon.png"] },
  { ref: "icon-akashi", optional: true, candidates: ["AkashiIcon.png"] },
  { ref: "icon-belfast", optional: true, candidates: ["BelfastIcon.png"] }
];

function curlText(url) {
  return execFileSync("curl", ["-sS", "--max-time", "90", "-A", UA, url], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
}

function curlDownload(url, dest) {
  execFileSync("curl", ["-fsSL", "--max-time", "180", "-A", UA, "-o", dest, url], {
    stdio: ["ignore", "ignore", "inherit"]
  });
}

// Normalize a title for matching: drop the File: prefix, lowercase, collapse
// spaces/underscores (MediaWiki treats "Prinz Eugen" == "Prinz_Eugen").
const norm = (t) => String(t).replace(/^file:/i, "").toLowerCase().replace(/[\s_]+/g, "");

// Resolve the first existing candidate to { wikiFile, url, width, height }.
function resolveCandidates(candidates) {
  const titles = candidates.map((c) => "File:" + c).join("|");
  const url = `${API}?action=query&format=json&prop=imageinfo&iiprop=${encodeURIComponent(
    "url|size"
  )}&titles=${encodeURIComponent(titles)}`;
  let data;
  try {
    data = JSON.parse(curlText(url));
  } catch (err) {
    return null;
  }
  const pages = (data.query && data.query.pages) || {};
  const byNorm = new Map();
  for (const key of Object.keys(pages)) {
    const page = pages[key];
    if (page.missing !== undefined) continue;
    const info = (page.imageinfo || [])[0];
    if (!info || !info.url) continue;
    byNorm.set(norm(page.title), {
      wikiFile: page.title.replace(/^File:/i, ""),
      url: info.url,
      width: info.width,
      height: info.height
    });
  }
  for (const c of candidates) {
    const hit = byNorm.get(norm("File:" + c));
    if (hit) return hit;
  }
  return null;
}

function main() {
  mkdirSync(refDir, { recursive: true });

  let prior = {};
  if (existsSync(manifestPath)) {
    try {
      prior = JSON.parse(readFileSync(manifestPath, "utf8")).refs || {};
    } catch {
      prior = {};
    }
  }

  const manifest = {};
  const rows = [];

  for (const target of TARGETS) {
    const dest = path.join(refDir, `${target.ref}.img`);
    const have = existsSync(dest) && statSync(dest).size > 0;

    let resolved = resolveCandidates(target.candidates);
    if (!resolved && have && prior[target.ref]) resolved = prior[target.ref];

    if (!resolved) {
      if (target.optional) {
        rows.push([target.ref, "(none found — derive from few)", "-", "-"]);
        continue;
      }
      throw new Error(
        `Could not resolve required art for "${target.ref}" (tried: ${target.candidates.join(", ")})`
      );
    }

    if (!have) {
      process.stdout.write(`  downloading ${target.ref} <- ${resolved.wikiFile} ... `);
      curlDownload(resolved.url, dest);
      process.stdout.write("done\n");
    }

    const bytes = statSync(dest).size;
    manifest[target.ref] = {
      wikiFile: resolved.wikiFile,
      width: resolved.width,
      height: resolved.height,
      bytes,
      cached: have
    };
    rows.push([target.ref, resolved.wikiFile, `${resolved.width}x${resolved.height}`, `${bytes}${have ? " (cached)" : ""}`]);
  }

  writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), refs: manifest }, null, 2));

  console.log("\nAzur Lane art refs (ref -> wiki file):");
  for (const r of rows) {
    console.log("  " + r[0].padEnd(28) + r[1].padEnd(30) + r[2].padEnd(12) + r[3]);
  }
  console.log(`\nWrote ${Object.keys(manifest).length} refs. Manifest: ${path.relative(root, manifestPath)}`);
}

main();
