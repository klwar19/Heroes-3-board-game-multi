// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InspectPanel } from "./board";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState } from "@/engine";
import { placeCombatToken } from "@/engine/tokens";

afterEach(cleanup);

/**
 * Behavioural pin for the real combat-token art wiring: a unit carrying an
 * Attack (+2) and a Weakness (−1) token must render the real token DISC images
 * with the engine's LIVE signed amount — not the old emoji glyph, and not the
 * printed art number.
 */
describe("combat token art rendering", () => {
  it("draws the real token discs with the live amount (not an emoji glyph)", () => {
    const state = createInitialGameState("token-art-test");
    const unitId = Object.keys(state.combat!.units)[0];
    const unit = state.combat!.units[unitId];
    placeCombatToken(state, unit, "attack", 2, "Test");
    placeCombatToken(state, unit, "weakness", -1, "Test");

    const { container } = render(
      <CardZoomProvider>
        <InspectPanel state={state} unitId={unitId} />
      </CardZoomProvider>
    );

    const chips = container.querySelectorAll(".tokenChip");
    const arts = container.querySelectorAll("img.tokenChipArt");
    // Both tokens render as real disc art (not a text/emoji glyph).
    expect(chips.length).toBe(2);
    expect(arts.length).toBe(2);
    const srcs = Array.from(arts).map((i) => i.getAttribute("src") ?? "");
    expect(srcs.some((s) => s.includes("combat-attack.webp")), "attack token disc").toBe(true);
    expect(srcs.some((s) => s.includes("combat-weakness.webp")), "weakness token disc").toBe(true);

    // Live amounts from engine state, not the baked art number.
    expect(container.textContent).toContain("+2");
    expect(container.textContent).toContain("-1");
  });
});
