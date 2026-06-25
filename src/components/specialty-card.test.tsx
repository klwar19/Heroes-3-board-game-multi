// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SpecialtyCard } from "./specialty-card";
import { canRenderSpecialtyCard, parseSpecialtyCardId, specialtyEffectText } from "./specialty-card-data";

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

  it("every unit-specialist level (I / IV / VI) has a description naming the doubled unit", () => {
    // Regression: the unit-specialist helpers (might / health / initiative) used
    // to carry no prose, so IV and VI printed blank. All three must now read.
    for (const id of ["specialty.dhuin.1", "specialty.dhuin.4", "specialty.dhuin.6"]) {
      const text = specialtyEffectText(id);
      expect(text.length, id).toBeGreaterThan(0);
      expect(text, id).toContain("Snow Elves");
    }
  });

  it("returns empty (no throw) for an unknown id", () => {
    expect(specialtyEffectText("__none__")).toBe("");
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
    // The icon box is always present (it reserves the picture's space so the
    // title + text sit below it even before the unit symbol is generated).
    expect(container.querySelector(".scIconBox")).toBeTruthy();
    // The unit symbol is the unit's own wiki creature portrait, not the card.
    expect((container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src")).toContain(
      "units-bulwark-snow_elves-portrait.webp"
    );
    expect((container.querySelector(".scDesc")?.textContent ?? "").length).toBeGreaterThan(0);
  });

  it("renders nothing for a card it cannot express (no broken output)", () => {
    const { container } = render(<SpecialtyCard cardId="spell.teleport" />);
    expect(container.querySelector(".scWrap")).toBeNull();
  });
});
