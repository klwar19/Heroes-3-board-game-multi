// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MapPresetEditor } from "./map-preset-editor";
import type { CustomMapPreset } from "@/engine";

afterEach(cleanup);

describe("MapPresetEditor (collapsible map-conditions panel)", () => {
  it("renders collapsed with an 'optional' badge when the map has no conditions", () => {
    const { container } = render(<MapPresetEditor preset={undefined} onChange={() => {}} />);
    const details = container.querySelector("details.mapPresetEditor");
    expect(details).toBeTruthy();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText("optional")).toBeTruthy();
    expect(screen.getByText(/No special conditions/)).toBeTruthy();
  });

  it("opens itself and shows an icon-tagged active-count summary when conditions exist", () => {
    const preset: CustomMapPreset = {
      victoryMode: "grail",
      startingResources: { gold: 17, buildingMaterials: 3, valuables: 2 }
    };
    const { container } = render(<MapPresetEditor preset={preset} onChange={() => {}} />);
    expect((container.querySelector("details.mapPresetEditor") as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText("2 active")).toBeTruthy();
    // Icon-tagged entries from describeCustomMapPresetEntries.
    expect(screen.getByText("Victory: Grail Hunt")).toBeTruthy();
    expect(screen.getByText(/17 gold, 3 materials, 2 valuables/)).toBeTruthy();
    expect(container.querySelectorAll(".mapPresetEntryIcon").length).toBeGreaterThanOrEqual(2);
  });

  it("a victory chip toggles the preset through onChange; Clear all resets to undefined", () => {
    const onChange = vi.fn();
    render(
      <MapPresetEditor preset={{ victoryMode: "grail" }} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Conquest" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ victoryMode: "conquest" }));

    fireEvent.click(screen.getByRole("button", { name: "Clear all conditions" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
