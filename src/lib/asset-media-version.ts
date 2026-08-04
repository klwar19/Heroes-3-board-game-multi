/**
 * Build-time media VERSION for CDN cache-busting — imported by next.config.ts
 * ONLY (it uses node:fs, so it must never reach a client bundle; the runtime
 * consumer, asset-url.ts, reads the resulting NEXT_PUBLIC_ASSET_VERSION env
 * instead).
 *
 * WHY: replaced media keeps its URL, and without the Cloudflare purge secrets
 * the edge cache serves the OLD bytes for up to the 7-day TTL (this bit us
 * 2026-08-04: refreshed wiki spell scans stayed invisible while OTHER files —
 * whichever URLs happened not to be edge-cached at upload time — looked fine,
 * making the sync seem randomly broken). Appending a version that changes
 * whenever ANY media file changes gives every asset a brand-new cache key on
 * the next deploy, so art updates are visible immediately and automatically —
 * no purge token, no manual step. Cloudflare caches query-string URLs normally
 * (verified: MISS on first fetch, HIT after), so edge caching is preserved.
 *
 * The version is a hash of every media file's RELATIVE PATH + BYTE SIZE (not
 * content): stat-ing ~4k files costs well under a second per build, while
 * content-hashing 200+ MB would add real build time. DELIBERATE LIMIT: a
 * replacement whose bytes differ but whose size is IDENTICAL does not move the
 * version — practically nil for compressed webp/mp3 output, and the old
 * TTL-expiry behaviour remains the backstop. Code-only deploys leave the
 * version unchanged, so they never invalidate anyone's cache.
 */

import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Directories under the repo root whose files feed the version. */
const MEDIA_DIRS = ["public/assets", "public/sounds", "public/fonts"];

function walk(dir: string, relPrefix: string, lines: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // missing dir (partial checkout) — contributes nothing
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(abs, rel, lines);
    } else if (entry.isFile()) {
      let size = 0;
      try {
        size = statSync(abs).size;
      } catch {
        // unreadable file — still record the path so its presence counts
      }
      lines.push(`${rel}:${size}`);
    }
  }
}

/**
 * Stable 10-hex-char version of the media tree (path+size of every file under
 * public/assets|sounds|fonts). Returns "" when no media exists (CI without
 * media, unit tests) so consumers can treat it as "unversioned".
 */
export function computeMediaVersion(rootDir: string = process.cwd()): string {
  const lines: string[] = [];
  for (const dir of MEDIA_DIRS) {
    walk(join(rootDir, dir), dir, lines);
  }
  if (lines.length === 0) {
    return "";
  }
  // Sort so the version is independent of directory-listing order.
  lines.sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex").slice(0, 10);
}
