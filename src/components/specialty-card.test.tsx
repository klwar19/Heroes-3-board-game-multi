// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SpecialtyCard, canRenderSpecialtyCard, parseSpecialtyCardId, specialtyEffectText } from "./specialty-card";

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
  it("is true only for an art-less hero we have a picture mapping for", () => {
    expect(canRenderSpecialtyCard("specialty.kriv.1")).toBe(true); // Bulwark rune specialist
    expect(canRenderSpecialtyCard("specialty.dhuin.4")).toBe(true); // Bulwark unit specialist
    expect(canRenderSpecialtyCard("specialty.sandro.1")).toBe(false); // a hero with no native picture mapping
    expect(canRenderSpecialtyCard("spell.teleport")).toBe(false);
    expect(canRenderSpecialtyCard(undefined)).toBe(false);
  });
});

describe("specialtyEffectText", () => {
  it("uses the prose tag when present (Kriv carries one)", () => {
    expect(specialtyEffectText("specialty.kriv.6")).toContain("4 Runes");
  });

  it("derives text from CHOOSE_ONE option labels when there is no prose tag", () => {
    // Regression: the unit-specialist helper carries NO prose tag, so this card
    // printed blank before. It must now read its effect from the option labels.
    const text = specialtyEffectText("specialty.dhuin.1");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("Snow Elves"); // "+1 attack (x2 for Snow Elves)"
  });
});

describe("SpecialtyCard", () => {
  it("draws Kriv's Runes VI: title, numeral, rune emblem, portrait, frame, effect", () => {
    const { container, getByText } = render(<SpecialtyCard cardId="specialty.kriv.6" />);

    expect(getByText("Runes VI")).toBeTruthy();
    expect(container.querySelector(".scLevelBadge")?.textContent).toBe("VI");
    expect((container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src")).toContain(
      "runes-emblem.webp"
    );
    expect(container.querySelector(".scPortrait")?.getAttribute("style")).toContain("hero_portraits-kriv");
    const wrap = container.querySelector(".scWrap");
    expect(wrap?.getAttribute("data-level")).toBe("6");
    expect(wrap?.getAttribute("style")).toContain("border-6.webp");
    expect(container.querySelector(".scDesc")?.textContent ?? "").toContain("4 Runes");
  });

  it("a unit specialist (Dhuin → Snow Elves I) shows its symbol slot + non-empty text", () => {
    const { container, getByText } = render(<SpecialtyCard cardId="specialty.dhuin.1" />);
    expect(getByText("Snow Elves I")).toBeTruthy();
    expect(container.querySelector(".scLevelBadge")?.textContent).toBe("I");
    // The unit symbol is its own transparent picture (Gemini-supplied), not the card.
    expect((container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src")).toContain(
      "icon-dhuin.webp"
    );
    expect((container.querySelector(".scDesc")?.textContent ?? "").length).toBeGreaterThan(0);
  });

  it("renders nothing for a card it cannot express (no broken output)", () => {
    const { container } = render(<SpecialtyCard cardId="spell.teleport" />);
    expect(container.querySelector(".scWrap")).toBeNull();
  });
});
