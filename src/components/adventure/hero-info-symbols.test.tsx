// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { createAdventureLobbyState } from "@/engine";
import { HERO_INFO_STAT_ICONS, abilitySymbolIcon } from "@/data/assets/homm-assets";

afterEach(cleanup);

/**
 * The hero-selection info board must show the REAL printed iconography, not
 * generic glyphs: the four statistic symbols, the starting ability's actual
 * secondary-skill emblem, and each specialty's own symbol. These render tests
 * fail if any of that wiring is dropped back to a lucide icon / text-only entry.
 */
function openHeroInfo(heroName: RegExp) {
  const state = createAdventureLobbyState({ seed: "ui-hero-info" });
  render(<SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
  // The hero pick grid lives in the Heroes & Draft hub window.
  fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));
  fireEvent.click(screen.getByTitle(new RegExp(`${heroName.source}: specialty`)));
  return screen.getByRole("dialog", { name: "Hero details" });
}

function imgSrcs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? "");
}

describe("Hero info board — printed statistic / ability / specialty symbols", () => {
  it("shows the four printed statistic symbols in the stats row", () => {
    const dialog = openHeroInfo(/Tamika/);
    const stats = within(dialog).getByLabelText("Starting statistics");
    const srcs = imgSrcs(stats);
    for (const stat of ["attack", "defense", "power", "knowledge"] as const) {
      expect(srcs, stat).toContain(HERO_INFO_STAT_ICONS[stat]);
    }
  });

  it("shows the starting ability's real secondary-skill emblem (offense → Attack)", () => {
    const dialog = openHeroInfo(/Tamika/); // Tamika starts with Offense
    const expected = abilitySymbolIcon("ability.offense");
    expect(expected).toBe("/assets/ability-symbols/attack.webp");
    expect(imgSrcs(dialog)).toContain(expected);
  });

  it("shows each specialty's own symbol — a card scan cropped to its top art", () => {
    const dialog = openHeroInfo(/Tamika/);
    const srcs = imgSrcs(dialog);
    // Tamika's three specialties have printed card scans; the chip shows each.
    for (const level of [1, 4, 6]) {
      expect(srcs, `specialty ${level}`).toContain(`/assets/hero_specialties-tamika-${level}.webp`);
    }
  });

  it("shows an art-less hero's transparent specialty symbol (Moandor → Liches)", () => {
    const dialog = openHeroInfo(/Moandor/);
    // Moandor has no specialty card scans, so the chip falls back to the native
    // specialty symbol (the Lich portrait) instead of a blank slot.
    expect(imgSrcs(dialog)).toContain("/assets/units-lich-portrait.webp");
  });
});
