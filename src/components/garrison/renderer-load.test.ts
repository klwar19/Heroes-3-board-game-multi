/**
 * The Garrison board renderer and the Order & Chaos field art import each other.
 * Neither may read the other's values while the modules load (only when drawing),
 * or the whole game screen (Garrison Wars and Order & Chaos) fails to load.
 */
import { describe, expect, it } from "vitest";

describe("garrison renderer module graph", () => {
  it("loads the renderer (and the field art it imports) without reading an uninitialised export", async () => {
    const renderer = await import("./renderer");
    const fieldArt = await import("./field-art");
    expect(renderer.BOARD.TILE).toBeGreaterThan(0);
    expect(typeof fieldArt.drawFieldGround).toBe("function");
  });
});
