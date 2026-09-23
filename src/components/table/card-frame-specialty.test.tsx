// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CardFrame } from "./seats";
import { cardLibrary } from "@/data/cards/library";

afterEach(cleanup);

// Regression: art-less hero specialties (Bulwark/Conflux/Cove and every other
// hero with no printed scan) used to render in the ZOOM view only — in the hand
// fan / trays / piles CardFrame fell straight through to the plain text
// fallback, so the card "only showed when zoomed". CardFrame must now draw the
// native SpecialtyCard in-slot for those, exactly like zoom.tsx.
describe("CardFrame — art-less specialties render the native card in the tray", () => {
  it("draws the native SpecialtyCard (not the text fallback) for an art-less Bulwark specialty", () => {
    // Kriv used to stand in here; his Runes cards now ship printed scans, so the
    // art-less Bulwark example is Dhuin's Snow Elves specialist.
    expect(cardLibrary["specialty.dhuin.6"]?.assets?.cardImage).toBeUndefined();
    const { container } = render(<CardFrame cardId="specialty.dhuin.6" className="fanCardImage" />);
    // The native card frame is present...
    expect(container.querySelector(".scWrap")).toBeTruthy();
    // ...and its title/effect read, proving it is the real card, not a stub.
    expect(container.textContent ?? "").toContain("Snow Elves VI");
    // It must NOT be the plain dashed text fallback that caused the bug.
    expect(container.querySelector(".cardFaceFallback")).toBeNull();
  });

  it("renders Kriv's printed Runes VI scan in-slot now that the card ships one", () => {
    expect(cardLibrary["specialty.kriv.6"]?.assets?.cardImage).toBe("/assets/hero_specialties-kriv-6.webp");
    const { container } = render(<CardFrame cardId="specialty.kriv.6" className="fanCardImage" />);
    const image = container.querySelector("img");
    expect(image?.getAttribute("src") ?? "").toContain("hero_specialties-kriv-6");
    // The scan replaces the native renderer — and is never the text fallback.
    expect(container.querySelector(".scWrap")).toBeNull();
    expect(container.querySelector(".cardFaceFallback")).toBeNull();
  });

  it("draws the native card (with its symbol) for an art-less hero whose scan is absent (Glacius)", () => {
    // Torosar used to stand in here; the 2026-08 wiki art refresh gave him (and the
    // whole Regular-Stretch-Goals group) a printed face, so the art-less case is now
    // a Bulwark hero: Glacius has no board-game scan and carries the Frost Ring icon.
    expect(cardLibrary["specialty.torosar.6"]?.assets?.cardImage).toBe("/assets/hero_specialties-torosar-6.webp");
    expect(cardLibrary["specialty.glacius.6"]?.assets?.cardImage).toBeUndefined();
    const { container } = render(<CardFrame cardId="specialty.glacius.6" className="fanCardImage" />);
    expect(container.querySelector(".scWrap")).toBeTruthy();
    expect(container.querySelector(".cardFaceFallback")).toBeNull();
    expect(container.querySelector(".scIconBox")).toBeTruthy();
    const iconSrc = (container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src") ?? "";
    expect(iconSrc).toContain("icon-frost_ring.webp");
  });

  it("still renders the scanned <img> for a baked-art specialty (Sandro)", () => {
    const src = cardLibrary["specialty.sandro.1"]?.assets?.cardImage;
    expect(src).toBeTruthy();
    const { container } = render(<CardFrame cardId="specialty.sandro.1" className="fanCardImage" />);
    expect(container.querySelector("img")).toBeTruthy();
    expect(container.querySelector(".scWrap")).toBeNull();
  });

  it("draws Lingxi's Healing Arts natively in the tray (not Gem's baked First Aid scan)", () => {
    expect(cardLibrary["specialty.lingxi.1"]?.assets?.cardImage).toBeUndefined();
    const { container } = render(<CardFrame cardId="specialty.lingxi.1" className="fanCardImage" />);
    expect(container.querySelector(".scWrap")).toBeTruthy();
    expect(container.querySelector(".cardFaceFallback")).toBeNull();
    expect(container.textContent ?? "").toContain("Healing Arts I");
    const iconSrc = (container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src") ?? "";
    expect(iconSrc).toContain("specialty-lingxi-healing-arts.webp");
    expect(iconSrc).not.toContain("abilities-first_aid");
    expect(iconSrc).not.toContain("hero_specialties-gem");
  });

  it("draws every Azur Lane specialty card natively with the ship skill emblem", () => {
    expect(cardLibrary["specialty.enterprise.1"]?.assets?.cardImage).toBeUndefined();
    const { container } = render(<CardFrame cardId="specialty.enterprise.1" className="fanCardImage" />);
    expect(container.querySelector(".scWrap")).toBeTruthy();
    expect(container.querySelector(".cardFaceFallback")).toBeNull();
    expect(container.textContent ?? "").toContain("Lucky E I");
    const iconSrc = (container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src") ?? "";
    expect(iconSrc).toContain("specialty-enterprise.webp");
  });
});
