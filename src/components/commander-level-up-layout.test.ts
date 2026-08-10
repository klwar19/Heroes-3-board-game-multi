import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// jsdom cannot compute CSS, so the DOM half of the commander level-up popup is
// pinned in commander-card.test.tsx and the DECLARATIONS that make it reachable
// are pinned here, statically — the `battle-card-popover-layout` /
// `main-menu-video-motion` precedent. Reported bug: on the desktop HUD (and in
// phone mode) the popup's last stat option — Speed — could not be reached and
// there was nothing to scroll.
const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("commander level-up popup layout", () => {
  it("caps the modal to the viewport and pins banner + escape around ONE scrolling row", () => {
    const modal = ruleFor(".commanderLevelUpModal");

    // Three rows: banner (auto) · the scroller (may shrink to 0) · the
    // Done/"Spend later" button (auto). The minmax(0, 1fr) is what lets the
    // middle row shrink so its own overflow scrolls.
    expect(modal).toMatch(/grid-template-rows:\s*auto minmax\(0, ?1fr\) auto/);
    // dvh is the fix for a phone's URL-bar-inflated 100vh; the vh line stays as
    // the old-browser fallback and MUST be declared first.
    expect(modal).toContain("max-height: 92vh");
    expect(modal).toContain("max-height: 92dvh");
    expect(modal.indexOf("max-height: 92vh")).toBeLessThan(modal.indexOf("max-height: 92dvh"));
    // The slam-in celebration is preserved.
    expect(modal).toContain("animation: commanderLevelUpSlamIn");
  });

  it("makes the option list itself the scroller", () => {
    const scroll = ruleFor(".commanderLevelUpScroll");

    expect(scroll).toContain("overflow-y: auto");
    // Without min-height: 0 a grid row is sized by its content and never
    // scrolls — this is the load-bearing declaration.
    expect(scroll).toContain("min-height: 0");
  });

  it("keeps the portaled backdrop above the chat dock / hero-info / mod-window band", () => {
    const backdrop = ruleFor(".commanderLevelUpBackdrop");
    const zIndex = Number(backdrop.match(/z-index:\s*(\d+)/)?.[1]);

    expect(backdrop).toContain("position: fixed");
    // Documented band: chat dock 200, setup hub 210, hero info 220, mod windows
    // 230, commander equipment window 240/245. The popup portals to <body>, so
    // this value is finally meaningful.
    expect(zIndex).toBeGreaterThan(230);
    expect(zIndex).toBeLessThan(240);

    // CONTROL for the fix: the rail-expanded lift list must NOT re-state this
    // backdrop — at 230 it would LOWER it while the rail is open.
    const railLifts = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)]
      .filter((match) => match[1].includes("body:has(.leftRailExpanded)"))
      .map((match) => match[1]);
    expect(railLifts.length).toBeGreaterThan(0);
    for (const selector of railLifts) {
      expect(selector).not.toContain("commanderLevelUpBackdrop");
    }
  });

  it("uses the phone's real viewport and the bottom safe area (the popup portals outside <main>)", () => {
    const phoneModal = ruleFor("body:has(main.phoneMode) .commanderLevelUpModal");
    const phoneBackdrop = ruleFor("body:has(main.phoneMode) .commanderLevelUpBackdrop");

    // `.phoneMode .commanderLevelUpModal` could never match: the overlay is
    // portaled to <body>, outside the <main class="phoneMode"> subtree.
    expect(css).not.toMatch(/\.phoneMode \.commanderLevelUpModal\s*\{/);
    expect(phoneModal).toContain("dvh");
    expect(phoneModal).toContain("env(safe-area-inset-bottom");
    expect(phoneBackdrop).toContain("env(safe-area-inset-bottom");
  });
});
