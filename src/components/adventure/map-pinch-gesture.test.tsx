// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { pinchCamera, type PinchViewBox } from "./map-pinch";
import { createAdventureGameState, getLegalActions, getPlayerView } from "@/engine";

afterEach(cleanup);

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

/**
 * Render the real map board and return its SVG plus the camera <g> (the first
 * group child — the one carrying `translate(x y) scale(s)`).
 */
function renderMap() {
  const state = createAdventureGameState({ seed: "pinch-ui", rollFirstPlayer: false });
  const { container } = render(
    <HexMapBoard
      legalActions={getLegalActions(state, "p1")}
      moveCue={null}
      onAction={vi.fn()}
      placement={null}
      state={state}
      view={getPlayerView(state, "p1")}
      viewerPlayerId="p1"
    />
  );
  const svg = container.querySelector<SVGSVGElement>(".hexMapSvg");
  expect(svg, "the map SVG").toBeTruthy();
  // jsdom has no layout and no pointer capture — pin the geometry the
  // component reads and stub the capture calls the gesture makes.
  svg!.getBoundingClientRect = () => RECT;
  (svg as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
  (svg as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = () => {};
  // The camera group is the SVG's only direct <g> child (defs is not a g).
  const cameraGroup = svg!.querySelector(":scope > g");
  expect(cameraGroup, "the camera group").toBeTruthy();
  return { svg: svg!, cameraGroup: cameraGroup! };
}

function viewBoxOf(svg: SVGSVGElement): PinchViewBox {
  const [minX, minY, width, height] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
  expect(Number.isFinite(minX) && Number.isFinite(width)).toBe(true);
  return { minX: minX!, minY: minY!, width: width!, height: height! };
}

describe("HexMapBoard two-finger pinch (touch zoom wiring)", () => {
  it("a second finger zooms the camera exactly as the pinch math prescribes", () => {
    const { svg, cameraGroup } = renderMap();
    expect(cameraGroup.getAttribute("transform")).toBe("translate(0 0) scale(1)");

    fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerDown(svg, { pointerId: 2, button: 0, clientX: 500, clientY: 300 });
    // Spread finger 2 from 200px to 400px apart → the camera must follow the
    // pure pinch math (the MATH itself is pinned by hand-computed numbers in
    // map-pinch.test.ts; this test pins that the board actually FEEDS it).
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 700, clientY: 300 });

    const expected = pinchCamera(
      { camera: { x: 0, y: 0, scale: 1 }, a: { x: 300, y: 300 }, b: { x: 500, y: 300 } },
      { x: 300, y: 300 },
      { x: 700, y: 300 },
      RECT,
      viewBoxOf(svg)
    );
    expect(expected.scale).toBeGreaterThan(1.9); // sanity: this IS a zoom-in
    expect(cameraGroup.getAttribute("transform")).toBe(
      `translate(${expected.x} ${expected.y}) scale(${expected.scale})`
    );
  });

  it("CONTROL: a single pointer still pans exactly as before (mouse/one-finger path untouched)", () => {
    const { svg, cameraGroup } = renderMap();

    fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 320, clientY: 340 });

    expect(cameraGroup.getAttribute("transform")).toBe("translate(20 40) scale(1)");
  });

  it("lifting one pinch finger ends the gesture — the surviving finger does NOT pan (no camera jump)", () => {
    const { svg, cameraGroup } = renderMap();

    fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerDown(svg, { pointerId: 2, button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 700, clientY: 300 });
    const pinched = cameraGroup.getAttribute("transform");

    fireEvent.pointerUp(svg, { pointerId: 2 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 260, clientY: 260 });

    expect(cameraGroup.getAttribute("transform")).toBe(pinched);

    // A FRESH press re-arms the normal one-finger pan.
    fireEvent.pointerUp(svg, { pointerId: 1 });
    fireEvent.pointerDown(svg, { pointerId: 3, button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: 310, clientY: 300 });
    expect(cameraGroup.getAttribute("transform")).not.toBe(pinched);
  });
});
