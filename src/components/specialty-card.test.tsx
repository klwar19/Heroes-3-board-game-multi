// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SpecialtyCard, canRenderSpecialtyCard, parseSpecialtyCardId } from "./specialty-card";

afterEach(cleanup);

describe("parseSpecialtyCardId", () => {
  it("splits a specialty id into hero slug + I/IV/VI level", () => {
    expect(parseSpecialtyCardId("specialty.kriv.6")).toEqual({ slug: "kriv", level: 6 });
    expect(parseSpecialtyCardId("specialty.tarnum_conflux.4")).toEqual({ slug: "tarnum_conflux", level: 4 });
    expect(parseSpecialtyCardId("spell.teleport")).toBeNull();
    expect(parseSpecialtyCardId("specialty.kriv.2")).toBeNull(); // only 1/4/6 are real levels
  });
});

describe("canRenderSpecialtyCard", () => {
  it("is true only for an art-less hero we have a picture for", () => {
    expect(canRenderSpecialtyCard("specialty.kriv.1")).toBe(true); // Bulwark rune specialist
    expect(canRenderSpecialtyCard("specialty.dhuin.4")).toBe(true); // Bulwark unit specialist
    expect(canRenderSpecialtyCard("specialty.sandro.1")).toBe(false); // a hero with no native picture mapping
    expect(canRenderSpecialtyCard("spell.teleport")).toBe(false);
    expect(canRenderSpecialtyCard(undefined)).toBe(false);
  });
});

describe("SpecialtyCard", () => {
  it("draws Kriv's Runes VI from game data: title, numeral, rune emblem, portrait, effect", () => {
    const { container, getByText } = render(<SpecialtyCard cardId="specialty.kriv.6" />);

    // The printed title is the card's own name.
    expect(getByText("Runes VI")).toBeTruthy();
    // The level badge shows the Roman numeral for level 6.
    expect(container.querySelector(".scLevelBadge")?.textContent).toBe("VI");
    // The specialty picture is the dedicated rune emblem, drawn "contain".
    const icon = container.querySelector(".scIcon") as HTMLImageElement | null;
    expect(icon?.getAttribute("src")).toContain("runes-emblem.webp");
    expect(icon?.style.objectFit).toBe("contain");
    // The hero portrait fills the portrait panel.
    expect(container.querySelector(".scPortrait")?.getAttribute("style")).toContain("hero_portraits-kriv");
    // The level-6 frame texture is wired through the CSS var.
    const wrap = container.querySelector(".scWrap");
    expect(wrap?.getAttribute("data-level")).toBe("6");
    expect(wrap?.getAttribute("style")).toContain("border-6.webp");
    // The effect text is the real rules prose (Runes VI grants 4 Runes).
    expect(container.querySelector(".scDesc")?.textContent ?? "").toContain("4 Runes");
  });

  it("crops a unit specialist's creature art (Dhuin → Snow Elves), numeral I", () => {
    const { container, getByText } = render(<SpecialtyCard cardId="specialty.dhuin.1" />);
    expect(getByText("Snow Elves I")).toBeTruthy();
    expect(container.querySelector(".scLevelBadge")?.textContent).toBe("I");
    const icon = container.querySelector(".scIcon") as HTMLImageElement | null;
    expect(icon?.getAttribute("src")).toContain("snow_elves");
    // A unit card is cropped (cover) to show the creature, not letterboxed.
    expect(icon?.style.objectFit).toBe("cover");
  });

  it("renders nothing for a card it cannot express (no broken output)", () => {
    const { container } = render(<SpecialtyCard cardId="spell.teleport" />);
    expect(container.querySelector(".scWrap")).toBeNull();
  });
});
