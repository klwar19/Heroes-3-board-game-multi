// @vitest-environment jsdom
/**
 * runBurst — the construction / tile-reveal golden burst.
 *
 * These lock the FX mechanism the map redesign added: a "burst" cue anchored to
 * a `data-fx-anchor` builds a ring + flash + spark cluster over that element,
 * and a burst whose anchor is absent is consumed silently (self-heal). jsdom has
 * no Web Animations API, so element.animate is stubbed — left unresolved so the
 * burst stays mounted for assertion.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FxStage, type FxCue } from "./fx";

beforeEach(() => {
  (HTMLElement.prototype as unknown as { animate: () => unknown }).animate = () => ({
    onfinish: null,
    oncancel: null,
    cancel() {}
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as { animate?: () => unknown }).animate;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("runBurst — construction / tile-reveal FX", () => {
  it("builds a golden burst (ring + flash + sparks) over the matching fx anchor", async () => {
    const anchor = document.createElement("div");
    anchor.setAttribute("data-fx-anchor", "building:necro.city_hall");
    document.body.appendChild(anchor);

    const cue: FxCue = { kind: "burst", id: "b1", at: "building:necro.city_hall", tone: "build" };
    render(<FxStage cues={[cue]} onDone={() => {}} />);
    await flush();

    const burst = document.querySelector(".fxBurst.build");
    expect(burst, "a build-tone burst is created at the anchor").toBeTruthy();
    expect(burst!.querySelector(".fxBurstFlash")).toBeTruthy();
    expect(burst!.querySelectorAll(".fxBurstRing").length).toBe(2);
    expect(burst!.querySelectorAll(".fxBurstSpark").length).toBe(10);
    anchor.remove();
  });

  it("tags the tile burst with its own tone", async () => {
    const anchor = document.createElement("div");
    anchor.setAttribute("data-fx-anchor", "tile:t1");
    document.body.appendChild(anchor);

    render(<FxStage cues={[{ kind: "burst", id: "b2", at: "tile:t1", tone: "tile" }]} onDone={() => {}} />);
    await flush();

    expect(document.querySelector(".fxBurst.tile")).toBeTruthy();
    anchor.remove();
  });

  it("consumes the cue (no burst) but still reports done when the anchor is absent", async () => {
    const onDone = vi.fn();
    render(<FxStage cues={[{ kind: "burst", id: "b3", at: "building:missing", tone: "build" }]} onDone={onDone} />);
    await flush();

    expect(document.querySelector(".fxBurst")).toBeNull();
    expect(onDone).toHaveBeenCalledWith("b3");
  });
});
