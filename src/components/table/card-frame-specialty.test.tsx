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
  it("draws the native SpecialtyCard (not the text fallback) for a Bulwark specialty", () => {
    const { container } = render(<CardFrame cardId="specialty.kriv.6" className="fanCardImage" />);
    // The native card frame is present...
    expect(container.querySelector(".scWrap")).toBeTruthy();
    // ...and its title/effect read, proving it is the real card, not a stub.
    expect(container.textContent ?? "").toContain("Runes VI");
    // It must NOT be the plain dashed text fallback that caused the bug.
    expect(container.querySelector(".cardFaceFallback")).toBeNull();
  });

  it("draws the native card (with its symbol) for an art-less hero whose scan is absent (Torosar)", () => {
    // Torosar has no printed scan, but is given the Ballista war-machine icon
    // (Ballista specialist) — the same dedicated icon specialty-card.test.tsx
    // pins, NOT the generic Artillery emblem.
    expect(cardLibrary["specialty.torosar.6"]?.assets?.cardImage).toBeUndefined();
    const { container } = render(<CardFrame cardId="specialty.torosar.6" className="fanCardImage" />);
    expect(container.querySelector(".scWrap")).toBeTruthy();
    expect(container.querySelector(".cardFaceFallback")).toBeNull();
    expect(container.querySelector(".scIconBox")).toBeTruthy();
    const iconSrc = (container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src") ?? "";
    expect(iconSrc).toContain("icon-ballista.webp");
    expect(iconSrc).not.toContain("abilities-artillery");
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
    expect(iconSrc).toContain("icon-first_aid.webp");
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
