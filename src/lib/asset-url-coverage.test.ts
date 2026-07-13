import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CDN-coverage guard: every point where an "/assets/…" or "/sounds/…" path
 * becomes a network request must go through assetUrl() (src/lib/asset-url.ts),
 * so that NEXT_PUBLIC_ASSET_BASE_URL redirects ALL art/audio to the CDN
 * (docs/cloudflare-custom-domain-cdn-plan.md). A raw literal in a consumption
 * position silently keeps that one file on the app origin — invisible in dev,
 * a real gap in production.
 *
 * Only CONSUMPTION forms are forbidden. Data tables holding plain
 * "/assets/…" strings (units.ts, homm-assets.ts, …) are fine: their values
 * are wrapped at the render site.
 *
 * src/app/globals.css is deliberately exempt (not scanned): CSS cannot call
 * JS, so its url() references stay same-origin by design — see the plan doc.
 */

const SRC_ROOT = join(__dirname, "..");

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  {
    // <img src="/assets/…"> / <img src={"/sounds/…"}> JSX attribute literals
    pattern: /src=\{?["'`]\/(assets|sounds)\//,
    why: 'raw src="/assets|/sounds" literal — wrap the path in assetUrl(...)'
  },
  {
    // new Audio("/sounds/…") bypassing the sound pipeline
    pattern: /new Audio\(["'`]\//,
    why: "raw new Audio(\"/…\") — pass the path through assetUrl(...)"
  },
  {
    // CSS-in-JS url(/assets/…) in inline styles / style assignments
    pattern: /url\(["'`]?\/(assets|sounds|fonts)\//,
    why: "raw url(/assets|/sounds|/fonts) in TS/TSX — build it as url(${assetUrl(...)})"
  }
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

describe("assetUrl() CDN coverage", () => {
  it("has no raw /assets or /sounds literal in a consumption position (img src, new Audio, CSS-in-JS url())", () => {
    const violations: string[] = [];
    for (const file of listSourceFiles(SRC_ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(line)) {
            violations.push(`${file.slice(SRC_ROOT.length + 1)}:${i + 1} — ${why}\n    ${line.trim()}`);
          }
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
