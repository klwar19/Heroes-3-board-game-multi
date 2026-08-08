import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Regression guard for a CSS self-contradiction the cinematic main menu shipped
// with: the menu CSS declared
//
//   @media (prefers-reduced-motion: reduce) {
//     .mainMenuShell .menuShellBackdropVideo { display: none; }
//   }
//
// near the TOP of globals.css, and then — ~37 000 lines later, in the second
// `.mainMenuShell` block — `display: block !important` on the SAME selector. A
// media query carries NO specificity, so the later `!important` won outright and
// the 20-second looping backdrop kept playing for a reader who has asked the OS
// for reduced motion.
//
// The contract, and why it needs a CSS-text test: jsdom cannot compute CSS, so
// nothing else in the suite can see which of two equally-specific declarations
// wins. Both halves matter —
//   1. no `display` declaration on the video may carry `!important` (that is
//      what silently defeated the media query), and
//   2. the reduced-motion rule must come LAST in source order among the
//      `display` declarations on that selector, because source order is the only
//      tie-break left.
// The visible other half (the still poster art showing through once the video is
// hidden) is pinned in page.test.tsx, which asserts the still <img> stays
// mounted UNDER the video.
// ---------------------------------------------------------------------------

const CSS_PATH = join(process.cwd(), "src", "app", "globals.css");
const VIDEO_SELECTOR = ".mainMenuShell .menuShellBackdropVideo";

/** globals.css with comments stripped, so a `}` boundary is never hidden. */
const css = readFileSync(CSS_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");

/** Every rule body for the video selector, in source order, with its index. */
function videoRules(): { index: number; body: string }[] {
  const esc = VIDEO_SELECTOR.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const re = new RegExp(`(?:^|\\}|\\{)\\s*${esc}\\s*\\{([^}]*)\\}`, "gu");
  const out: { index: number; body: string }[] = [];
  for (let m = re.exec(css); m; m = re.exec(css)) {
    out.push({ index: m.index, body: m[1] });
  }
  return out;
}

describe("main-menu video backdrop honours prefers-reduced-motion", () => {
  it("finds the video-backdrop rules at all (guards the selector itself)", () => {
    expect(videoRules().length).toBeGreaterThanOrEqual(2);
  });

  it("never forces the video visible with !important", () => {
    for (const { body } of videoRules()) {
      const display = /display\s*:\s*([^;]+);?/iu.exec(body)?.[1] ?? "";
      expect(display.toLowerCase()).not.toContain("!important");
    }
  });

  it("hides the video under reduced motion, and that rule wins on source order", () => {
    const hiding = videoRules().filter(({ body }) => /display\s*:\s*none/iu.test(body));
    expect(hiding.length).toBeGreaterThanOrEqual(1);

    // The hiding rule really is inside a prefers-reduced-motion query: the
    // nearest @media before it must be that one.
    const last = hiding[hiding.length - 1];
    const before = css.slice(0, last.index);
    const lastMedia = before.lastIndexOf("@media");
    expect(lastMedia).toBeGreaterThan(-1);
    expect(css.slice(lastMedia, last.index)).toMatch(/prefers-reduced-motion\s*:\s*reduce/iu);

    // Nothing later re-declares `display` on the video (which, at equal
    // specificity, would beat the media query again).
    for (const { index, body } of videoRules()) {
      if (index > last.index) {
        expect(body).not.toMatch(/display\s*:/iu);
      }
    }
  });
});
