import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Regression guard for the unreadable-initiative bug: the HP plate on a board
// unit card (`.boardCardHud`) used to sit at the card BOTTOM and stretch to
// `max-width: 100%`, so a long card name ("Neutral Iron Golems") grew it across
// the printed stat rail's bottom entry — INITIATIVE — on the card's LEFT edge.
//
// The 2026-07-29 redesign removed the unbounded NAME from the plate (the root
// cause) and moved it to a compact TOP-right pill (HP + per-stat change
// chevrons). The contract that keeps the printed rail readable is therefore:
// the pill stays anchored to the TOP-RIGHT corner (never the bottom, never
// pinned left) and keeps a hard width cap as a backstop.
//
// jsdom cannot compute layout, so this pins the CSS contract directly.
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

describe("board unit card: the HP pill never covers the printed initiative", () => {
  const body = ruleBody(".boardCardHud");

  it("anchors the pill to the TOP-right corner — away from the rail's bottom initiative entry", () => {
    expect(body).toMatch(/position:\s*absolute/u);
    expect(body).toMatch(/right:\s*\d/u);
    expect(body).toMatch(/top:\s*\d/u);
    // It must NOT be pinned to the bottom (where the printed initiative lives)
    // nor to the left edge (which would span the whole rail).
    expect(body).not.toMatch(/(^|[\s;])bottom:\s*\d/u);
    expect(body).not.toMatch(/(^|[\s;])left:\s*\d/u);
  });

  it("caps its width so even a wide HP + chevron row cannot reach the left stat rail", () => {
    const match = /max-width:\s*(\d+)%/u.exec(body);
    expect(match, ".boardCardHud must cap its max-width in %").toBeTruthy();
    const maxWidth = Number(match![1]);
    // 100% was the original bug; the rail needs roughly the left fifth.
    expect(maxWidth).toBeLessThanOrEqual(80);
    expect(maxWidth).toBeGreaterThanOrEqual(60); // still wide enough to read
    expect(body).toMatch(/overflow:\s*hidden/u);
  });

  it("the unbounded card NAME stays out of the pill (the original bug's cause)", () => {
    // The redesign removed `<strong>{cardName}</strong>` from the HUD; only the
    // bounded HP text and the fixed-size chevron chips remain. A name rule
    // reappearing here would mean the unbounded content is back.
    expect(css).not.toMatch(/\.boardCardHud\s+strong/u);
    // The HP text itself stays one bounded line.
    expect(ruleBody(".boardCardHp")).toMatch(/white-space:\s*nowrap/u);
  });
});
