import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MENU_ART } from "./page";

/**
 * Main-menu media contract (art files, not path strings).
 *
 * Two things this guards that nothing else can:
 *
 *  1. EVERY button's label is BAKED INTO its art — there is no text node — so a
 *     missing or renamed webp is not a cosmetic gap, it is a blank unlabelled
 *     button. Iterating `MENU_ART` means a new entry is covered automatically.
 *
 *  2. WEIGHT. The generated masters shipped at 1536×1024 / 114-311KB each and the
 *     backdrop loop at 1920×1080 / 19.3MB — a ~22MB main menu on a cold visit.
 *     The buttons render at most ~310 CSS px wide (`.menuShellPanel.bare` is
 *     `clamp(230px, 24vw, 310px)` and `.menuNavArt` is `contain`-fitted inside
 *     it), so 768px is already ≥2× for a retina screen; the ceilings below stop a
 *     master being dropped back in by hand.
 *
 * The video's own ceiling is byte-level only: the loop-critical properties
 * (1920×1080, 24fps, 20.000s, 480 frames, first packet a keyframe) were verified
 * with ffprobe at encode time and are NOT re-checked here, because ffmpeg is not
 * a test dependency. Re-encode with:
 *   ffmpeg -i <src> -an -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p \
 *          -fps_mode passthrough -movflags +faststart <out>
 * and re-verify the frame count/duration against the source before committing —
 * a dropped or duplicated frame breaks the authored seamless loop.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const toFile = (url: string) => path.join(REPO_ROOT, "public", url.replace(/^\//, ""));

/** Widest the art is ever painted (see the CSS quoted above), doubled for DPR. */
const MAX_BUTTON_WIDTH = 768;
/** Per-button ceiling: the pre-compression masters were 114-311KB. */
const MAX_BUTTON_BYTES = 96 * 1024;
/** Whole-set ceiling — all 13 are eagerly preloaded on mount. */
const MAX_BUTTON_SET_BYTES = 900 * 1024;

const VIDEO_URL = "/assets/ui/menu/main-menu-loop-v5.mp4";
const MAX_VIDEO_BYTES = 6 * 1024 * 1024;

describe("main-menu button art", () => {
  it("ships a real webp for every MENU_ART entry, at display resolution", async () => {
    const entries = Object.entries(MENU_ART);
    expect(entries.length).toBeGreaterThanOrEqual(13);

    for (const [key, url] of entries) {
      const file = toFile(url);
      expect(existsSync(file), `missing main-menu button art for ${key}: ${file}`).toBe(true);
      const meta = await sharp(file).metadata();
      expect([key, meta.format]).toEqual([key, "webp"]);
      // Transparent plaques: the art is composited straight onto the video.
      expect(Boolean(meta.hasAlpha), `${key} lost its alpha channel`).toBe(true);
      expect(meta.width ?? 0, `${key} is wider than the menu ever paints it`).toBeLessThanOrEqual(
        MAX_BUTTON_WIDTH
      );
      // Still big enough to be the real plate, never a 1KB stub.
      expect(meta.width ?? 0, `${key} looks downscaled past the display size`).toBeGreaterThanOrEqual(512);
      expect(statSync(file).size, `${key} looks like a stub`).toBeGreaterThan(8 * 1024);
    }
  });

  it("keeps every button — and the whole preloaded set — light", () => {
    let total = 0;
    for (const [key, url] of Object.entries(MENU_ART)) {
      const bytes = statSync(toFile(url)).size;
      total += bytes;
      expect(bytes, `${key} is too heavy for a menu button (${Math.round(bytes / 1024)}KB)`).toBeLessThanOrEqual(
        MAX_BUTTON_BYTES
      );
    }
    expect(total, `the preloaded button set is ${Math.round(total / 1024)}KB`).toBeLessThanOrEqual(
      MAX_BUTTON_SET_BYTES
    );
  });
});

describe("main-menu backdrop loop", () => {
  it("ships a compressed, SILENT, fast-starting mp4", () => {
    const file = toFile(VIDEO_URL);
    expect(existsSync(file), `missing main-menu backdrop loop: ${file}`).toBe(true);

    const bytes = statSync(file).size;
    expect(bytes, `backdrop loop is ${Math.round(bytes / 1024 / 1024)}MB`).toBeLessThanOrEqual(MAX_VIDEO_BYTES);
    expect(bytes, "backdrop loop looks like a stub").toBeGreaterThan(256 * 1024);

    // Container inspection, no ffmpeg needed. `moov` before `mdat` is faststart
    // (the browser can begin playback without the whole file); an audio track
    // would show up as a `soun` handler / an `mp4a` sample-entry box. The menu
    // loop must be silent — it autoplays with no user gesture.
    const head = readFileSync(file).toString("latin1");
    const moov = head.indexOf("moov");
    const mdat = head.indexOf("mdat");
    expect(moov).toBeGreaterThan(-1);
    expect(mdat).toBeGreaterThan(-1);
    expect(moov, "moov must precede mdat (-movflags +faststart)").toBeLessThan(mdat);
    // Handler/sample-entry atoms live in `moov`, so scan only the header region.
    const header = head.slice(0, mdat);
    expect(header.includes("mp4a"), "backdrop loop still carries an audio track").toBe(false);
    expect(header.includes("soun"), "backdrop loop still carries an audio track").toBe(false);
    expect(header.includes("vide"), "backdrop loop has no video track?").toBe(true);
  });
});
