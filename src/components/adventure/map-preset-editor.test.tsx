// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MapPresetEditor } from "./map-preset-editor";
import { MAX_TIMED_EVENTS, type CustomMapPreset } from "@/engine";

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

  it("timed events let the designer free-edit round, effect kind, and numeric params", () => {
    const onChange = vi.fn();
    const base: CustomMapPreset = {
      timedEvents: [
        {
          round: 6,
          effect: {
            kind: "clear_visitable_cubes",
            locations: ["windmill", "water_wheel", "mystical_garden"]
          }
        }
      ]
    };
    const { rerender } = render(<MapPresetEditor preset={base} onChange={onChange} />);

    // Round number is free-form.
    fireEvent.change(screen.getByLabelText("Timed event 1 round"), { target: { value: "12" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [expect.objectContaining({ round: 12 })]
      })
    );

    // Controlled component — re-render with the new round, then change kind.
    const afterRound: CustomMapPreset = {
      timedEvents: [{ round: 12, effect: base.timedEvents![0].effect }]
    };
    rerender(<MapPresetEditor preset={afterRound} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Timed event 1 effect type"), {
      target: { value: "resources" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [
          expect.objectContaining({
            round: 12,
            effect: expect.objectContaining({ kind: "resources", gold: 3 })
          })
        ]
      })
    );

    // Re-render with resources so the gold amount can be edited.
    onChange.mockClear();
    const withResources: CustomMapPreset = {
      timedEvents: [
        { round: 12, effect: { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 } }
      ]
    };
    rerender(<MapPresetEditor preset={withResources} onChange={onChange} />);
    // Several "Gold" labels exist (start resources / income / timed); the timed
    // one is prefilled with the event's amount (3).
    const goldInput = screen
      .getAllByLabelText("Gold")
      .find((el) => (el as HTMLInputElement).value === "3") as HTMLInputElement;
    expect(goldInput, "timed-event gold input").toBeTruthy();
    fireEvent.change(goldInput, { target: { value: "9" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [
          expect.objectContaining({
            effect: expect.objectContaining({ kind: "resources", gold: 9 })
          })
        ]
      })
    );

    // Add-event creates a freeform card (not a fixed template).
    fireEvent.click(screen.getByRole("button", { name: "Add event" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: expect.arrayContaining([
          expect.objectContaining({ round: expect.any(Number), effect: expect.any(Object) })
        ])
      })
    );
    const last = onChange.mock.calls.at(-1)?.[0] as CustomMapPreset;
    expect(last.timedEvents!.length).toBe(2);
  });

  it("exposes the storage cap instead of silently adding events that will be discarded", () => {
    const timedEvents: NonNullable<CustomMapPreset["timedEvents"]> = Array.from(
      { length: MAX_TIMED_EVENTS },
      (_, index) => ({
        round: (index % 30) + 1,
        effect: { kind: "note", text: `Event ${index + 1}` }
      })
    );
    const onChange = vi.fn();
    render(<MapPresetEditor preset={{ timedEvents }} onChange={onChange} />);

    expect(screen.getByText(`${MAX_TIMED_EVENTS}/${MAX_TIMED_EVENTS}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add event" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Event limit reached/)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /Duplicate timed event/ })[0]?.hasAttribute("disabled")
    ).toBe(true);
  });

  it("warns when an event falls after the map's suggested length", () => {
    render(
      <MapPresetEditor
        preset={{
          roundLimit: 6,
          timedEvents: [{ round: 8, effect: { kind: "movement", amount: 1 } }]
        }}
        onChange={() => {}}
      />
    );

    expect(screen.getByText(/fires after the suggested 6-round map length/)).toBeTruthy();
  });
});
