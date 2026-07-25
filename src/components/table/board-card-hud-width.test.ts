import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Regression guard for the unreadable-initiative bug: the name + HP plate on a
// board unit card (`.boardCardHud`) is absolutely positioned bottom-right and
// used to stretch to `max-width: 100%`. Every printed card face carries its stat
// rail down the LEFT edge with INITIATIVE as the bottom entry, so a long card
// name ("Neutral Iron Golems") grew the plate across the whole card bottom and
// hid that number.
//
// jsdom cannot compute layout, so this pins the CSS contract that makes the
// overlap impossible: the plate stays right-anchored and must never be allowed to
// reach the left rail.
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

describe("board unit card: the name/HP plate never covers the printed initiative", () => {
  const body = ruleBody(".boardCardHud");

  it("keeps the plate right-anchored at the bottom of the card", () => {
    expect(body).toMatch(/position:\s*absolute/u);
    expect(body).toMatch(/right:\s*0/u);
    expect(body).toMatch(/bottom:\s*0/u);
    // It must NOT also be pinned to the left edge — that would span the rail
    // whatever the max-width says.
    expect(body).not.toMatch(/(^|[\s;])left:\s*0/u);
  });

  it("caps its width so the left stat rail (initiative at the bottom) stays clear", () => {
    const match = /max-width:\s*(\d+)%/u.exec(body);
    expect(match, ".boardCardHud must cap its max-width in %").toBeTruthy();
    const maxWidth = Number(match![1]);
    // 100% was the bug; the rail needs roughly the left fifth of the card.
    expect(maxWidth).toBeLessThanOrEqual(80);
    expect(maxWidth).toBeGreaterThanOrEqual(60); // still wide enough to read
  });

  it("still ellipsizes a long name inside the narrower plate", () => {
    // The text rule is a grouped selector, so match it directly in the sheet.
    const grouped = /\.boardCardHud strong,\s*\.boardCardHud span\s*\{([^}]*)\}/u.exec(css);
    expect(grouped, "the .boardCardHud text rule").toBeTruthy();
    expect(grouped![1]).toMatch(/overflow:\s*hidden/u);
    expect(grouped![1]).toMatch(/text-overflow:\s*ellipsis/u);
  });
});
