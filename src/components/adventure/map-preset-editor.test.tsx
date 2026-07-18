// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MapPresetEditor } from "./map-preset-editor";
import { MAX_TIMED_EVENTS, type CustomMapPreset } from "@/engine";

afterEach(cleanup);

/** The labelled control group for one Objectives knob (aria-label). */
const section = (label: string): HTMLElement => screen.getByRole("group", { name: label });

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
    // (The mode was renamed "Grail Hunt" -> "Holy Grail"; the designer label
    //  reuses VICTORY_MODE_LABELS so it can never drift from the options UI.)
    expect(screen.getByText("Victory: Holy Grail")).toBeTruthy();
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

  it("clear_tile_cubes event: group chips + skip-settlement checkbox write through onChange", () => {
    const onChange = vi.fn();
    const base: CustomMapPreset = {
      timedEvents: [{ round: 4, effect: { kind: "clear_tile_cubes", groups: ["far"] } }]
    };
    render(<MapPresetEditor preset={base} onChange={onChange} />);

    // The six player-facing Roman-band chips render, and the preview pins the
    // describe string (nothing else in the suite covers describeTimedMapEffect).
    const groups = section("Timed event 1 tile groups");
    expect(within(groups).getByRole("button", { name: "Ⅱ–Ⅲ" })).toBeTruthy();
    expect(within(groups).getByRole("button", { name: "Underground" })).toBeTruthy();
    // Rendered in both the summary and the live preview (describeTimedMapEffect).
    expect(screen.getAllByText(/clear black cubes on Ⅱ–Ⅲ Tiles/).length).toBeGreaterThan(0);

    // Toggle ON the Underground (subterranean) band — canonical group order kept.
    fireEvent.click(within(groups).getByRole("button", { name: "Underground" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [
          expect.objectContaining({
            effect: { kind: "clear_tile_cubes", groups: ["far", "subterranean"] }
          })
        ]
      })
    );

    // Toggle the skip-settlement checkbox (operating on the controlled base).
    onChange.mockClear();
    fireEvent.click(screen.getByLabelText("Timed event 1 skip settlement tiles"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [
          expect.objectContaining({
            effect: expect.objectContaining({
              kind: "clear_tile_cubes",
              excludeSettlementTiles: true
            })
          })
        ]
      })
    );
  });

  it("timed event: the repeat control writes repeatEveryRounds and the preview shows the schedule", () => {
    const onChange = vi.fn();
    const base: CustomMapPreset = {
      timedEvents: [{ round: 4, effect: { kind: "movement", amount: 1 } }]
    };
    const { rerender } = render(<MapPresetEditor preset={base} onChange={onChange} />);

    // A one-shot preview reads "Round 4: …" (no repeat clause).
    expect(screen.getAllByText(/Round 4: all heroes gain \+1 movement/).length).toBeGreaterThan(0);

    // Pick "Every 3 rounds" → repeatEveryRounds: 3.
    fireEvent.change(screen.getByLabelText("Timed event 1 repeat"), { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [expect.objectContaining({ round: 4, repeatEveryRounds: 3 })]
      })
    );

    // Re-render repeating: the preview + summary now spell the schedule out.
    rerender(
      <MapPresetEditor
        preset={{ timedEvents: [{ round: 4, repeatEveryRounds: 3, effect: { kind: "movement", amount: 1 } }] }}
        onChange={onChange}
      />
    );
    expect(screen.getAllByText(/Round 4, then every 3 rounds/).length).toBeGreaterThan(0);

    // Back to "Once" clears the field (one-shot again).
    fireEvent.change(screen.getByLabelText("Timed event 1 repeat"), { target: { value: "0" } });
    const last = onChange.mock.calls.at(-1)?.[0] as CustomMapPreset;
    expect(last.timedEvents![0].repeatEveryRounds).toBeUndefined();
  });

  it("timed resources: a negative amount reads as a LOSS in the live preview", () => {
    render(
      <MapPresetEditor
        preset={{
          timedEvents: [
            { round: 5, effect: { kind: "resources", gold: -5, buildingMaterials: 0, valuables: 0 } }
          ]
        }}
        onChange={() => {}}
      />
    );
    // The give-vs-take wording is unmistakable: "lose 5 gold", never "gain".
    expect(screen.getAllByText(/all players lose 5 gold/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/all players gain 5 gold/)).toBeNull();
  });

  it("timed events: the experience kind is selectable and writes its default effect", () => {
    const onChange = vi.fn();
    render(
      <MapPresetEditor
        preset={{ timedEvents: [{ round: 6, effect: { kind: "note", text: "x" } }] }}
        onChange={onChange}
      />
    );
    // The kind dropdown offers "experience".
    const kind = screen.getByLabelText("Timed event 1 effect type") as HTMLSelectElement;
    expect(Array.from(kind.options).some((o) => o.value === "experience")).toBe(true);

    fireEvent.change(kind, { target: { value: "experience" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [expect.objectContaining({ round: 6, effect: { kind: "experience", amount: 2 } })]
      })
    );
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

  it("Obelisks: selecting a role writes the preset; bonus controls show only for 'bonus'", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MapPresetEditor preset={undefined} onChange={onChange} />);

    // Default = Classic → no bonus controls, no obelisks config.
    expect(screen.queryByLabelText("Obelisk bonus kind")).toBeNull();

    // Monolith teleport → obelisks: { role: "monolith" }.
    fireEvent.click(screen.getByRole("button", { name: "Monolith teleport" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ obelisks: { role: "monolith" } })
    );

    // Fixed bonus → obelisks role "bonus" with the default +1 morale bonus.
    fireEvent.click(screen.getByRole("button", { name: "Fixed bonus" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ obelisks: { role: "bonus", bonus: { kind: "morale", amount: 1 } } })
    );

    // Re-render as a bonus preset: the kind dropdown appears and switching to
    // resources writes a resources bonus.
    rerender(
      <MapPresetEditor
        preset={{ obelisks: { role: "bonus", bonus: { kind: "morale", amount: 1 } } }}
        onChange={onChange}
      />
    );
    const kind = screen.getByLabelText("Obelisk bonus kind") as HTMLSelectElement;
    expect(kind).toBeTruthy();
    // The bonus row is tagged with the board glyph for the current kind (+1 morale).
    expect(
      document.querySelector('.mapPresetRowGlyph[src*="morale_positive"]'),
      "morale glyph on the bonus row"
    ).toBeTruthy();
    fireEvent.change(kind, { target: { value: "resources" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        obelisks: { role: "bonus", bonus: expect.objectContaining({ kind: "resources" }) }
      })
    );
  });

  it("Obelisks: choosing Classic removes the obelisks config", () => {
    const onChange = vi.fn();
    render(<MapPresetEditor preset={{ obelisks: { role: "monolith" } }} onChange={onChange} />);
    // The only condition was the obelisks role — clearing it collapses to undefined.
    fireEvent.click(screen.getByRole("button", { name: "Classic (locked die)" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("Obelisks: the role line shows in the active-conditions summary", () => {
    render(<MapPresetEditor preset={{ obelisks: { role: "monolith" } }} onChange={() => {}} />);
    expect(screen.getByText("Obelisks: Monolith teleport network")).toBeTruthy();
  });

  it("Objectives: the chips write the objectives block; a default clears its field", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MapPresetEditor preset={undefined} onChange={onChange} />);

    // Grail Obelisks → objectives.grailObelisksRequired.
    fireEvent.click(within(section("Grail Obelisks required")).getByRole("button", { name: "1" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ objectives: { grailObelisksRequired: 1 } })
    );

    // Utopia guards → objectives.utopiaGuards.
    rerender(<MapPresetEditor preset={{ objectives: { grailObelisksRequired: 1 } }} onChange={onChange} />);
    fireEvent.click(within(section("Dragon Utopia guards")).getByRole("button", { name: "Four dragons" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ objectives: { grailObelisksRequired: 1, utopiaGuards: "four" } })
    );

    // Utopia bonus search → objectives.utopiaBonusSearch.
    rerender(
      <MapPresetEditor
        preset={{ objectives: { grailObelisksRequired: 1, utopiaGuards: "four" } }}
        onChange={onChange}
      />
    );
    fireEvent.click(within(section("Dragon Utopia bonus search")).getByRole("button", { name: "Search(2)" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objectives: { grailObelisksRequired: 1, utopiaGuards: "four", utopiaBonusSearch: 2 }
      })
    );

    // Clearing the only-remaining field collapses the whole preset to undefined.
    rerender(<MapPresetEditor preset={{ objectives: { utopiaBonusSearch: 2 } }} onChange={onChange} />);
    fireEvent.click(within(section("Dragon Utopia bonus search")).getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("Objectives: lines show in the active-conditions summary", () => {
    render(
      <MapPresetEditor
        preset={{ objectives: { grailObelisksRequired: 1, utopiaGuards: "four", utopiaBonusSearch: 2 } }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Grail dig needs 1 Obelisk")).toBeTruthy();
    expect(screen.getByText("Dragon Utopia guards: always four dragons")).toBeTruthy();
    expect(screen.getByText("Dragon Utopia bonus: Search(2) Artifacts")).toBeTruthy();
  });

  it("Victory Points: the toggle writes the enabled block, adding/retyping an objective writes it, and off clears it", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MapPresetEditor preset={undefined} onChange={onChange} />);

    // Toggle VP on → the enabled block with the default completion VP.
    fireEvent.click(screen.getByLabelText("Victory Points scoring"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ victoryPoints: { enabled: true, victoryConditionVp: 3 } })
    );

    // Add an objective → the default control-towns objective.
    rerender(<MapPresetEditor preset={{ victoryPoints: { enabled: true, victoryConditionVp: 3 } }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add objective" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        victoryPoints: expect.objectContaining({
          enabled: true,
          objectives: [{ kind: "control-towns", vp: 3, count: 2 }]
        })
      })
    );

    // Retype the objective kind → keeps its VP, swaps the kind's params.
    rerender(
      <MapPresetEditor
        preset={{ victoryPoints: { enabled: true, victoryConditionVp: 3, objectives: [{ kind: "control-towns", vp: 3, count: 2 }] } }}
        onChange={onChange}
      />
    );
    // The objective row is tagged with the board glyph for its kind (Control
    // Towns → the materials/buildings glyph).
    expect(
      document.querySelector('.mapPresetVpObjectiveRow .mapPresetRowGlyph[src*="building_materials"]'),
      "objective glyph on the VP row"
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Objective 1 kind"), { target: { value: "hero-level" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        victoryPoints: expect.objectContaining({ objectives: [{ kind: "hero-level", vp: 3, level: 5 }] })
      })
    );

    // Toggling VP off (its only condition) collapses the whole preset.
    rerender(<MapPresetEditor preset={{ victoryPoints: { enabled: true, victoryConditionVp: 3 } }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Victory Points scoring"));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("Victory Points: the 🎖️ summary line + the hard round-limit relabel appear when on", () => {
    render(
      <MapPresetEditor
        preset={{ roundLimit: 8, victoryPoints: { enabled: true, victoryConditionVp: 4, objectives: [{ kind: "control-towns", vp: 2, count: 3 }] } }}
        onChange={() => {}}
      />
    );
    // Summary headline + objective line (describeVictoryPointsConfig).
    expect(screen.getByText(/most VPs wins \(completion \+4 VP\)/)).toBeTruthy();
    expect(screen.getByText("Objective: Control 3 Towns — +2 VP")).toBeTruthy();
    // The round-limit section relabels to the hard meaning.
    expect(screen.getByText("Round limit (hard end)")).toBeTruthy();
  });

  it("Custom win conditions: add / retype kind + param / remove; the cap disables Add", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MapPresetEditor preset={undefined} onChange={onChange} />);

    // Add a condition → the default control-towns condition.
    fireEvent.click(screen.getByRole("button", { name: "Add win condition" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ customWinConditions: [{ kind: "control-towns", count: 3 }] })
    );

    // Retype the kind → the new kind's default params.
    rerender(
      <MapPresetEditor preset={{ customWinConditions: [{ kind: "control-towns", count: 3 }] }} onChange={onChange} />
    );
    fireEvent.change(screen.getByLabelText("Condition 1 kind"), { target: { value: "gold" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ customWinConditions: [{ kind: "gold", amount: 100 }] })
    );

    // Edit the param (scoped to the win-condition group to avoid the resource "Gold" fields).
    rerender(<MapPresetEditor preset={{ customWinConditions: [{ kind: "gold", amount: 100 }] }} onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Custom win condition list" });
    fireEvent.change(within(group).getByRole("spinbutton"), { target: { value: "250" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ customWinConditions: [{ kind: "gold", amount: 250 }] })
    );

    // Remove the only condition → the whole preset collapses to undefined.
    rerender(<MapPresetEditor preset={{ customWinConditions: [{ kind: "gold", amount: 250 }] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove condition 1" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    // At the cap of 4, Add is disabled.
    rerender(
      <MapPresetEditor
        preset={{
          customWinConditions: [
            { kind: "control-towns", count: 3 },
            { kind: "flag-mines", count: 4 },
            { kind: "hero-level", level: 5 },
            { kind: "gold", amount: 100 }
          ]
        }}
        onChange={onChange}
      />
    );
    expect((screen.getByRole("button", { name: "Add win condition" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Custom win conditions: a 🏁 summary line renders per condition", () => {
    render(
      <MapPresetEditor
        preset={{ customWinConditions: [{ kind: "control-towns", count: 3 }] }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Custom win: control 3 Towns")).toBeTruthy();
  });

  it("Custom win conditions: the new buildings + obelisks kinds render their param band", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MapPresetEditor preset={{ customWinConditions: [{ kind: "buildings", count: 10 }] }} onChange={onChange} />
    );
    // buildings → count param clamped to the instant-win-safe 8-15 band.
    const buildingsInput = within(
      screen.getByRole("group", { name: "Custom win condition list" })
    ).getByRole("spinbutton") as HTMLInputElement;
    expect(buildingsInput.min).toBe("8");
    expect(buildingsInput.max).toBe("15");
    expect(buildingsInput.value).toBe("10");

    // Retype buildings → obelisks yields the obelisks default (count 2).
    fireEvent.change(screen.getByLabelText("Condition 1 kind"), { target: { value: "obelisks" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ customWinConditions: [{ kind: "obelisks", count: 2 }] })
    );

    // obelisks → count param clamped to the grail-knob 1-4 band.
    rerender(
      <MapPresetEditor preset={{ customWinConditions: [{ kind: "obelisks", count: 2 }] }} onChange={onChange} />
    );
    const obeliskInput = within(
      screen.getByRole("group", { name: "Custom win condition list" })
    ).getByRole("spinbutton") as HTMLInputElement;
    expect(obeliskInput.min).toBe("1");
    expect(obeliskInput.max).toBe("4");
    expect(obeliskInput.value).toBe("2");
  });

  it("Map settings: a difficulty chip writes the preset difficulty; re-clicking it clears back to undefined", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MapPresetEditor preset={undefined} onChange={onChange} />);
    fireEvent.click(within(section("Difficulty")).getByRole("button", { name: "Hard" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ difficulty: "hard" }));
    // Re-clicking the active chip clears the only condition → the preset collapses.
    rerender(<MapPresetEditor preset={{ difficulty: "hard" }} onChange={onChange} />);
    fireEvent.click(within(section("Difficulty")).getByRole("button", { name: "Hard" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("Map settings: far-tile opening + per-player chips write through onChange, a sibling field survives, and Off hides the count row", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MapPresetEditor preset={{ victoryMode: "grail" }} onChange={onChange} />);
    // Turn Ⅱ–Ⅲ opening OFF — the unrelated victoryMode must survive (no clobber).
    fireEvent.click(within(section("Additional Ⅱ–Ⅲ tile opening")).getByRole("button", { name: "Off" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ victoryMode: "grail", farTileOpening: false })
    );

    // With opening on, pick a per-player count.
    rerender(<MapPresetEditor preset={{ farTileOpening: true }} onChange={onChange} />);
    fireEvent.click(within(section("Ⅱ–Ⅲ tiles per player")).getByRole("button", { name: "3" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ farTileOpening: true, farTilesPerPlayer: 3 })
    );

    // CONTROL: with opening OFF the per-player row is hidden entirely.
    rerender(<MapPresetEditor preset={{ farTileOpening: false }} onChange={onChange} />);
    expect(screen.queryByRole("group", { name: "Ⅱ–Ⅲ tiles per player" })).toBeNull();
  });
});
