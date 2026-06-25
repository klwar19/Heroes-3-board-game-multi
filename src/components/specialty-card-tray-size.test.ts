import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Regression guard for the card-tray sizing bug: a native SpecialtyCard shown
// in a slot that fixes ONLY its width (e.g. `.permanentCardImage`, which sets no
// aspect-ratio and no height) used to collapse to its text height — visibly
// SMALLER than a scanned card of the same width sitting next to it.
//
// The cause was `.specialtyCardFrame > .scWrap { height: 100%; aspect-ratio:
// auto }`: with the slot giving no definite height, `height: 100%` resolved to
// auto and, with the intrinsic 625/879 ratio cleared, .scWrap shrank to its
// content. The fix is to let .scWrap keep its own 625/879 ratio so its height is
// always definite from the width the slot gives it.
//
// CI (vitest) cannot run browser layout, so this asserts the CSS contract that
// makes the collapse impossible. The real measured-pixel proof lives in the
// Playwright spec tests/e2e/specialty-card-tray-size.spec.ts (run: npm run
// test:e2e), which renders both card kinds and checks equal height.
// ---------------------------------------------------------------------------

// Strip comments so a rule's preceding `}` boundary isn't hidden behind a
// comment block (which sits between most rules in globals.css).
const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//gu,
  ""
);

/** The body `{ ... }` of the LAST rule whose selector exactly matches. */
function ruleBody(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "gu");
  let body: string | null = null;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    body = m[1];
  }
  if (body === null) {
    throw new Error(`no CSS rule found for selector: ${selector}`);
  }
  return body;
}

describe("native specialty card sizing in card slots", () => {
  it(".scWrap carries the card's intrinsic 625/879 aspect-ratio", () => {
    // This is what gives the card a definite height from its width in ANY slot.
    expect(ruleBody(".scWrap")).toMatch(/aspect-ratio:\s*625\s*\/\s*879/u);
  });

  it("the slot wrapper does NOT pin .scWrap to height:100% or clear its ratio", () => {
    // Re-introducing either of these brings back the collapse in a slot that
    // gives no definite height (the permanents row).
    const body = ruleBody(".specialtyCardFrame > .scWrap");
    expect(body, "scWrap must not be pinned to the slot height").not.toMatch(/height:\s*100%/u);
    expect(body, "scWrap must keep its intrinsic aspect-ratio").not.toMatch(/aspect-ratio:\s*auto/u);
    expect(body, "scWrap should still fill the slot width").toMatch(/width:\s*100%/u);
  });

  it("the frame uses the card's own ratio, not the slot's box", () => {
    // `aspect-ratio: auto` lets the frame height follow .scWrap rather than the
    // slot's 5/7, so it matches the native card exactly (no clip / no collapse).
    expect(ruleBody(".specialtyCardFrame")).toMatch(/aspect-ratio:\s*auto/u);
  });
});
