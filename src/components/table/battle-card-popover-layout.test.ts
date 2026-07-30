import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

describe("battle card action popover layout", () => {
  it("centres the menu in the viewport and scrolls before it can cross the screen edge", () => {
    const rule = css.match(/\.cardPopover\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rule).toContain("position: fixed");
    expect(rule).toContain("top: 50%");
    expect(rule).toContain("bottom: auto");
    expect(rule).toContain("transform: translate(-50%, -50%)");
    expect(rule).toContain("max-height: calc(100dvh - 24px)");
    expect(rule).toContain("overflow-y: auto");
  });
});
