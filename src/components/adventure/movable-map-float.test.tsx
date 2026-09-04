// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MovableMapFloat } from "./movable-map-float";

function renderFloat() {
  return render(
    <MovableMapFloat
      above
      boundsHeight={600}
      boundsWidth={800}
      initialHeight={148}
      initialWidth={300}
      left={250}
      top={180}
    >
      <div className="mapFloatCard">Gate exit</div>
    </MovableMapFloat>,
  );
}

describe("MovableMapFloat", () => {
  // An inline `transform` beats the phone-mode `.rotateFloat.above/.below`
  // nudges in globals.css (which carry no !important), so an undragged notice
  // must emit NO transform at all — otherwise `translate(0px, 0px)` overrode
  // them and the notice sat over the hex it describes.
  it("emits no inline transform until the player actually drags it", () => {
    const { container } = renderFloat();
    const float = container.firstElementChild as HTMLElement;
    expect(float.style.transform).toBe("");
    expect(float.getAttribute("style")).not.toContain("transform");

    const move = screen.getByRole("button", { name: "Move notice" });
    fireEvent.pointerDown(move, {
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 7,
    });
    fireEvent.pointerMove(move, { clientX: 40, clientY: 30, pointerId: 7 });
    fireEvent.pointerUp(move, { clientX: 40, clientY: 30, pointerId: 7 });
    expect((container.firstElementChild as HTMLElement).style.transform).toBe(
      "translate(20px, 10px)",
    );
  });

  it("moves from its safe map-anchored starting position", () => {
    const { container } = renderFloat();
    const move = screen.getByRole("button", { name: "Move notice" });
    fireEvent.pointerDown(move, {
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    });
    expect(container.firstElementChild?.classList.contains("dragging")).toBe(
      true,
    );
    fireEvent.pointerMove(move, { clientX: 95, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(move, { clientX: 95, clientY: 60, pointerId: 1 });

    expect((container.firstElementChild as HTMLElement).style.transform).toBe(
      "translate(75px, 40px)",
    );
    expect(container.firstElementChild?.classList.contains("dragging")).toBe(
      false,
    );
  });

  it("can be resized smaller without shrinking below usable controls", () => {
    const { container } = renderFloat();
    const resize = screen.getByRole("button", { name: "Resize notice" });
    fireEvent.pointerDown(resize, {
      button: 0,
      clientX: 300,
      clientY: 148,
      pointerId: 2,
    });
    fireEvent.pointerMove(resize, { clientX: 190, clientY: 88, pointerId: 2 });
    fireEvent.pointerUp(resize, { clientX: 190, clientY: 88, pointerId: 2 });

    const window = container.firstElementChild as HTMLElement;
    expect(window.style.width).toBe("190px");
    expect(window.style.height).toBe("88px");
  });

  it("minimizes and restores the notice body", () => {
    renderFloat();
    const minimize = screen.getByRole("button", { name: "Minimize notice" });
    fireEvent.click(minimize);
    expect(
      screen.getByText("Gate exit").parentElement?.hasAttribute("hidden"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Restore notice" }));
    expect(
      screen.getByText("Gate exit").parentElement?.hasAttribute("hidden"),
    ).toBe(false);
  });
});
