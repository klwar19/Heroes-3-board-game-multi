// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CardFrame } from "./seats";
import { cardLibrary } from "@/data/cards/library";

afterEach(cleanup);

/**
 * A card <img> is draggable by default, so a click that drifts a pixel starts a
 * native image-drag instead of a click — which made card art impossible to
 * "pick" while a text-fallback frame (a <div>) selected fine. Every rendered
 * card image must therefore be non-draggable.
 */
describe("CardFrame card art is not draggable (picks on click)", () => {
  it("renders the card image with draggable disabled", () => {
    const cardId = Object.keys(cardLibrary).find((id) => cardLibrary[id]?.assets?.cardImage);
    expect(cardId, "a card with art exists").toBeTruthy();
    const { container } = render(<CardFrame cardId={cardId} className="handCardImage" />);
    const img = container.querySelector("img.handCardImage") as HTMLImageElement | null;
    expect(img, "the card art renders as an <img>").toBeTruthy();
    // The native drag is disabled so a stray-pixel click still selects the card.
    expect(img!.draggable).toBe(false);
    expect(img!.getAttribute("draggable")).toBe("false");
  });
});
