// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MapPresetEditor } from "./map-preset-editor";
import { MAX_TIMED_EVENTS, type CustomMapPreset, type CustomMapTilePlan } from "@/engine";
import { STORY_SCENE_IDS } from "@/data/story/scenes";

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

  it("authors an explicit all-enemy bonus labelled single-player-only", () => {
    const onChange = vi.fn();
    render(<MapPresetEditor preset={undefined} onChange={onChange} />);
    const aiBonus = screen.getByRole("region", { name: "Single-player AI base bonus" });
    const gold = within(within(aiBonus).getByText("Gold").closest("label") as HTMLElement).getByRole("spinbutton");
    fireEvent.change(gold, { target: { value: "6" } });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        computerStartingBonus: { gold: 6, buildingMaterials: 0, valuables: 0 }
      })
    );
    expect(aiBonus.textContent).toContain("single-player game only");
    expect(aiBonus.textContent).toContain("Neither bonus applies in multiplayer");
  });

  it("Waves & Raid bosses: the cadence chip, a wave-army override, and a custom boss all dispatch through onChange", () => {
    const onChange = vi.fn();
    render(<MapPresetEditor preset={undefined} onChange={onChange} />);

    // Cadence chip writes monsterWaves.cadence.
    fireEvent.click(within(section("Wave cadence (map)")).getByRole("button", { name: "Every 5th round" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ monsterWaves: expect.objectContaining({ cadence: 5 }) })
    );

    // Adding a wave-army override seeds wave 1 with a level guard spec.
    fireEvent.click(screen.getByRole("button", { name: /Override a wave's army/i }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        monsterWaves: expect.objectContaining({ waves: { 1: { level: 2 } } })
      })
    );

    // Adding a custom boss seeds the full editable statline.
    fireEvent.click(screen.getByRole("button", { name: /Add a custom boss/i }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        raidBosses: expect.objectContaining({
          bosses: [
            expect.objectContaining({
              id: "custom_boss_1",
              name: "Custom Boss 1",
              layers: 3,
              abilities: ["boss-enrage"]
            })
          ]
        })
      })
    );
  });

  it("PvE director lets a map author the theme, wave stakes, and Dungeon campaign", () => {
    const onChange = vi.fn();
    render(<MapPresetEditor preset={undefined} onChange={onChange} />);

    fireEvent.click(within(section("PvE theme override")).getByRole("button", { name: "Doom" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pveTheme: "doom" }));

    fireEvent.click(within(section("Wave pressure (map)")).getByRole("button", { name: "Brutal" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ monsterWaves: expect.objectContaining({ pressure: "brutal" }) })
    );

    fireEvent.click(
      within(section("Dungeon campaign length (map)")).getByRole("button", { name: "5-floor expedition" })
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dungeon: expect.objectContaining({ maxFloor: 5 }) })
    );

    fireEvent.click(within(section("Dungeon descent cost (map)")).getByRole("button", { name: "Free descent" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dungeon: expect.objectContaining({ descentCost: 0 }) })
    );
  });

  it("Dungeon wardens may be chosen from built-ins or this map's custom bosses", () => {
    const onChange = vi.fn();
    render(
      <MapPresetEditor
        preset={{
          dungeon: { maxFloor: 10 },
          raidBosses: {
            bosses: [
              {
                id: "gloomfang",
                name: "Gloomfang",
                attack: 5,
                defense: 1,
                health: 3,
                initiative: 6,
                layers: 3
              }
            ]
          }
        }}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText("Dungeon floor 5 boss"), {
      target: { value: "gloomfang" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dungeon: expect.objectContaining({ floorBosses: { 5: "gloomfang" } })
      })
    );
  });

  it("Waves & Raid bosses: a rendered boss card edits stats and toggles whitelist abilities", () => {
    const onChange = vi.fn();
    const preset: CustomMapPreset = {
      raidBosses: {
        bosses: [
          {
            id: "custom_boss_1",
            name: "Gloomfang",
            attack: 5,
            defense: 1,
            health: 3,
            initiative: 6,
            layers: 3,
            abilities: ["boss-enrage"]
          }
        ]
      }
    };
    render(<MapPresetEditor preset={preset} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Boss Gloomfang Attack"), { target: { value: "99" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        raidBosses: expect.objectContaining({
          bosses: [expect.objectContaining({ attack: 15 })] // clamped to the rail
        })
      })
    );

    // Toggling a whitelist ability chip adds it beside Enrage.
    const abilityRow = section("Boss Gloomfang abilities");
    fireEvent.click(within(abilityRow).getByRole("button", { name: "Devour" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        raidBosses: expect.objectContaining({
          bosses: [expect.objectContaining({ abilities: ["boss-enrage", "boss-devour"] })]
        })
      })
    );
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

  it("timed events expose editable multi-reward choices", () => {
    const onChange = vi.fn();
    const base: CustomMapPreset = {
      timedEvents: [{ round: 4, effect: { kind: "note", text: "Choose" } }]
    };
    const { rerender } = render(<MapPresetEditor preset={base} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Timed event 1 effect type"), {
      target: { value: "choice" }
    });
    const changed = onChange.mock.calls.at(-1)?.[0] as CustomMapPreset;
    expect(changed.timedEvents?.[0].effect).toEqual({
      kind: "choice",
      prompt: "Choose one reward",
      options: [
        { kind: "resources", gold: 0, buildingMaterials: 0, valuables: 1 },
        { kind: "resources", gold: 0, buildingMaterials: 2, valuables: 0 }
      ]
    });

    rerender(<MapPresetEditor preset={changed} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Timed event 1 choice prompt"), {
      target: { value: "Astrologers offer a boon" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [
          expect.objectContaining({
            effect: expect.objectContaining({
              kind: "choice",
              prompt: "Astrologers offer a boon"
            })
          })
        ]
      })
    );
    expect(screen.getByLabelText("Timed event 1 reward 1 kind")).toBeTruthy();
    expect(screen.getByLabelText("Timed event 1 reward 2 kind")).toBeTruthy();
  });

  it("writes the two scenario-wide house-rule defaults", () => {
    const onChange = vi.fn();
    render(<MapPresetEditor preset={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(onChange).toHaveBeenLastCalledWith({
      houseRules: { "no-secondary-heroes": true }
    });

    fireEvent.click(screen.getByRole("button", { name: "Free" }));
    expect(onChange).toHaveBeenLastCalledWith({
      houseRules: { "free-neutral-combat-extend": true }
    });
  });

  it("round field is clearable to blank and accepts a single-digit value (regression: sticky leading '1')", () => {
    const onChange = vi.fn();
    const base: CustomMapPreset = {
      timedEvents: [{ round: 16, effect: { kind: "note", text: "hi" } }]
    };
    render(<MapPresetEditor preset={base} onChange={onChange} />);
    const roundInput = screen.getByLabelText("Timed event 1 round") as HTMLInputElement;
    // Clearing must leave the field BLANK. The old idiom snapped it straight
    // back to the floor "1", so the leading digit could never be removed and no
    // round below 10 could be typed.
    fireEvent.change(roundInput, { target: { value: "" } });
    expect(roundInput.value).toBe("");
    // And a fresh single-digit value commits as-is (not stuck at 1x).
    fireEvent.change(roundInput, { target: { value: "5" } });
    expect(roundInput.value).toBe("5");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ timedEvents: [expect.objectContaining({ round: 5 })] })
    );
  });

  it("offers a 'story' timed-event effect and stores the chosen sceneId", () => {
    const onChange = vi.fn();
    const base: CustomMapPreset = {
      timedEvents: [{ round: 3, effect: { kind: "note", text: "x" } }]
    };
    const { rerender } = render(<MapPresetEditor preset={base} onChange={onChange} />);

    // The effect-type dropdown offers "story"; picking it defaults to a real scene.
    fireEvent.change(screen.getByLabelText("Timed event 1 effect type"), {
      target: { value: "story" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [
          expect.objectContaining({ effect: { kind: "story", sceneId: STORY_SCENE_IDS[0] } })
        ]
      })
    );

    // The per-kind param UI is a scene select over the registry; it stores the pick.
    const withStory: CustomMapPreset = {
      timedEvents: [{ round: 3, effect: { kind: "story", sceneId: STORY_SCENE_IDS[0] } }]
    };
    rerender(<MapPresetEditor preset={withStory} onChange={onChange} />);
    const sceneSelect = screen.getByLabelText("Timed event 1 story scene");
    const other = STORY_SCENE_IDS[1] ?? STORY_SCENE_IDS[0];
    fireEvent.change(sceneSelect, { target: { value: other } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timedEvents: [expect.objectContaining({ effect: { kind: "story", sceneId: other } })]
      })
    );
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
    expect(screen.queryByLabelText("Obelisk reward 1 kind")).toBeNull();

    // Monolith teleport → obelisks: { role: "monolith" }.
    fireEvent.click(screen.getByRole("button", { name: "Monolith teleport" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ obelisks: { role: "monolith" } })
    );

    // Fixed bonus → obelisks role "bonus" with the default +1 morale award
    // (the editor now always writes the multi-award `bonuses` form).
    fireEvent.click(screen.getByRole("button", { name: "Fixed bonus" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ obelisks: { role: "bonus", bonuses: [{ kind: "morale", amount: 1 }] } })
    );

    // Re-render as a bonus preset: the kind dropdown appears and switching to
    // resources writes a resources award.
    rerender(
      <MapPresetEditor
        preset={{ obelisks: { role: "bonus", bonuses: [{ kind: "morale", amount: 1 }] } }}
        onChange={onChange}
      />
    );
    const kind = screen.getByLabelText("Obelisk reward 1 kind") as HTMLSelectElement;
    expect(kind).toBeTruthy();
    // The reward row is tagged with the board glyph for the current kind (+1 morale).
    expect(
      document.querySelector('.mapPresetRowGlyph[src*="morale_positive"]'),
      "morale glyph on the reward row"
    ).toBeTruthy();
    fireEvent.change(kind, { target: { value: "resources" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        obelisks: { role: "bonus", bonuses: [expect.objectContaining({ kind: "resources" })] }
      })
    );
  });

  it("Obelisks: add a second reward and switch to 'player picks one' (AND/OR)", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MapPresetEditor
        preset={{ obelisks: { role: "bonus", bonuses: [{ kind: "morale", amount: 1 }] } }}
        onChange={onChange}
      />
    );
    // Add reward → a second default award appended.
    fireEvent.click(screen.getByRole("button", { name: "Add reward" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        obelisks: expect.objectContaining({
          role: "bonus",
          bonuses: [
            { kind: "morale", amount: 1 },
            { kind: "morale", amount: 1 }
          ]
        })
      })
    );

    // With 2+ awards, the mode toggle appears; "Player picks one" writes bonusMode.
    rerender(
      <MapPresetEditor
        preset={{
          obelisks: {
            role: "bonus",
            bonuses: [
              { kind: "morale", amount: 1 },
              { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 }
            ]
          }
        }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Player picks one" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        obelisks: expect.objectContaining({ role: "bonus", bonusMode: "choose" })
      })
    );
  });

  it("Obelisks / Settlements: a guard level and settlement VP write the config", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MapPresetEditor preset={{ obelisks: { role: "monolith" } }} onChange={onChange} />
    );
    // Obelisk guard: pick level Ⅲ.
    fireEvent.click(within(section("Obelisk guard")).getByRole("button", { name: "Ⅲ" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ obelisks: { role: "monolith", guard: { level: 3 } } })
    );

    // Settlement guard: pick level Ⅱ.
    rerender(<MapPresetEditor preset={undefined} onChange={onChange} />);
    fireEvent.click(within(section("Settlement guard")).getByRole("button", { name: "Ⅱ" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ settlements: { guard: { level: 2 } } })
    );

    // Settlement bonus VP.
    rerender(<MapPresetEditor preset={{ settlements: { guard: { level: 2 } } }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Bonus VP each"), { target: { value: "5" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ settlements: expect.objectContaining({ vp: 5 }) })
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

  it("Objectives: the tuning is CONTEXTUAL to the chosen Win condition", () => {
    // Conquest / no mode: the Grail + Dragon tuning is hidden (only a hint shows).
    const { rerender } = render(<MapPresetEditor preset={{ victoryMode: "conquest" }} onChange={() => {}} />);
    expect(screen.queryByRole("group", { name: "Grail Obelisks required" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Dragon Utopia guards" })).toBeNull();

    // Holy Grail: the Grail dig tuning appears; the Dragon rows stay hidden.
    rerender(<MapPresetEditor preset={{ victoryMode: "grail" }} onChange={() => {}} />);
    expect(section("Grail Obelisks required")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Dragon Utopia guards" })).toBeNull();

    // Dragon Conqueror: the Dragon Utopia tuning appears; the Grail row hides.
    rerender(<MapPresetEditor preset={{ victoryMode: "dragon-conqueror" }} onChange={() => {}} />);
    expect(section("Dragon Utopia guards")).toBeTruthy();
    expect(section("Dragon Utopia bonus search")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Grail Obelisks required" })).toBeNull();
  });

  it("Objectives: the chips write the objectives block; a default clears its field", () => {
    const onChange = vi.fn();
    // Grail Obelisks → objectives.grailObelisksRequired (Holy Grail win condition).
    const { rerender } = render(<MapPresetEditor preset={{ victoryMode: "grail" }} onChange={onChange} />);
    fireEvent.click(within(section("Grail Obelisks required")).getByRole("button", { name: "1" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ objectives: { grailObelisksRequired: 1 } })
    );

    // Utopia guards → objectives.utopiaGuards (a Dragon win condition).
    rerender(<MapPresetEditor preset={{ victoryMode: "dragon-conqueror" }} onChange={onChange} />);
    fireEvent.click(within(section("Dragon Utopia guards")).getByRole("button", { name: "Four dragons" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ objectives: { utopiaGuards: "four" } })
    );

    // Utopia bonus search → objectives.utopiaBonusSearch.
    rerender(
      <MapPresetEditor
        preset={{ victoryMode: "dragon-conqueror", objectives: { utopiaGuards: "four" } }}
        onChange={onChange}
      />
    );
    fireEvent.click(within(section("Dragon Utopia bonus search")).getByRole("button", { name: "Search(2)" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objectives: { utopiaGuards: "four", utopiaBonusSearch: 2 }
      })
    );

    // Clearing the field drops it from the objectives block (the mode remains).
    rerender(
      <MapPresetEditor
        preset={{ victoryMode: "dragon-conqueror", objectives: { utopiaBonusSearch: 2 } }}
        onChange={onChange}
      />
    );
    fireEvent.click(within(section("Dragon Utopia bonus search")).getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenLastCalledWith({ victoryMode: "dragon-conqueror" });
  });

  it("offers the hidden Grail/Utopia package directly in the Map Editor", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MapPresetEditor preset={undefined} onChange={onChange} />);
    const toggle = screen.getByLabelText("Use hidden Grail and Dragon Utopia rules");

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith({ objectives: { hiddenGrailUtopia: true } });

    rerender(
      <MapPresetEditor
        preset={{ objectives: { hiddenGrailUtopia: true } }}
        onChange={onChange}
      />
    );
    expect(screen.getByText(/4 fields = 2 \+ 2/)).toBeTruthy();
    // The hint must quote the CURRENT Ⅶ-FIELD payout (20 gold + two Search(3)),
    // and must NOT quote the richer Creature-Bank ladder — this assertion pinned
    // the old "Search(3), Search(5) and Search(5)" wording in place through the
    // 2026-08-13 reward change, which is how that rot survived.
    expect(screen.getByText(/two Search\(3\)\s+rewards from the Artifact deck/)).toBeTruthy();
    expect(screen.queryByText(/Search\(3\), Search\(5\) and\s+Search\(5\)/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Use hidden Grail and Dragon Utopia rules"));
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

    // Add a condition → the first OFFERED kind's default (control-towns and
    // obelisks moved to Map objects as per-object win ticks and are no longer
    // offered; flag-mines — control X Mines/Settlements — stays offered).
    fireEvent.click(screen.getByRole("button", { name: "Add win condition" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ customWinConditions: [{ kind: "flag-mines", count: 4 }] })
    );

    // Retype the kind → the new kind's default params. A LEGACY object-scoped
    // condition still renders (its own kind joins the select) — retyping works.
    rerender(
      <MapPresetEditor preset={{ customWinConditions: [{ kind: "control-towns", count: 3 }] }} onChange={onChange} />
    );
    expect(
      Array.from((screen.getByLabelText("Condition 1 kind") as HTMLSelectElement).options).some(
        (option) => option.value === "control-towns"
      ),
      "the legacy row's own kind stays selectable"
    ).toBe(true);
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

  it("Custom win conditions: the buildings kind renders its param band; legacy obelisks still renders but is not OFFERED", () => {
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

    // control-towns / obelisks moved to Map objects, and defeat-dragon-utopia
    // moved into the 🐉 Dragon Utopia section's inline "instant win" knob — a
    // fresh row's select offers NONE of them. flag-mines (an aggregate count of
    // controlled Mines/Settlements) has no per-object/section home, so it STAYS.
    const freshSelect = screen.getByLabelText("Condition 1 kind");
    for (const gone of ["obelisks", "control-towns", "defeat-dragon-utopia"]) {
      expect(
        Array.from((freshSelect as HTMLSelectElement).options).some((option) => option.value === gone),
        `${gone} not offered`
      ).toBe(false);
    }
    expect(
      Array.from((freshSelect as HTMLSelectElement).options).some((option) => option.value === "flag-mines"),
      "flag-mines offered"
    ).toBe(true);

    // A LEGACY obelisks condition (saved map) still renders its 1-4 band.
    rerender(
      <MapPresetEditor preset={{ customWinConditions: [{ kind: "obelisks", count: 2 }] }} onChange={onChange} />
    );
    const obeliskInput = within(
      screen.getByRole("group", { name: "Custom win condition list" })
    ).getByRole("spinbutton") as HTMLInputElement;
    expect(obeliskInput.min).toBe("1");
    expect(obeliskInput.max).toBe("4");
    expect(obeliskInput.value).toBe("2");
    // Its own kind joins the select so the row is editable, not stuck.
    const legacySelect = screen.getByLabelText("Condition 1 kind") as HTMLSelectElement;
    expect(Array.from(legacySelect.options).some((option) => option.value === "obelisks")).toBe(true);
  });

  it("Dragon Utopia section appears in conquest mode when a Utopia tile is placed (CONTROL: absent without it)", () => {
    const { rerender } = render(
      <MapPresetEditor
        preset={{ victoryMode: "conquest" }}
        tiles={[{ row: 9, col: 4, group: "center", faceDown: true, viiField: "dragon_utopia" }]}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("group", { name: "Dragon Utopia guards" })).toBeTruthy();
    // CONTROL: conquest with no Utopia placed anywhere → the section stays hidden.
    rerender(<MapPresetEditor preset={{ victoryMode: "conquest" }} tiles={[]} onChange={() => {}} />);
    expect(screen.queryByRole("group", { name: "Dragon Utopia guards" })).toBeNull();
  });

  it("Dragon Utopia: the inline VP knob upserts/removes the defeat-dragon-utopia VP objective", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MapPresetEditor
        preset={{ victoryMode: "dragon-conqueror", victoryPoints: { enabled: true, victoryConditionVp: 3 } }}
        onChange={onChange}
      />
    );
    const group = screen.getByRole("group", { name: "Dragon Utopia defeat VP" });
    fireEvent.change(within(group).getByRole("spinbutton"), { target: { value: "4" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        victoryPoints: expect.objectContaining({ objectives: [{ kind: "defeat-dragon-utopia", vp: 4 }] })
      })
    );
    // Back to 0 removes the objective (VP block keeps only its base fields).
    rerender(
      <MapPresetEditor
        preset={{
          victoryMode: "dragon-conqueror",
          victoryPoints: { enabled: true, victoryConditionVp: 3, objectives: [{ kind: "defeat-dragon-utopia", vp: 4 }] }
        }}
        onChange={onChange}
      />
    );
    fireEvent.change(
      within(screen.getByRole("group", { name: "Dragon Utopia defeat VP" })).getByRole("spinbutton"),
      { target: { value: "0" } }
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ victoryPoints: { enabled: true, victoryConditionVp: 3 } })
    );
  });

  it("Dragon Utopia: the inline instant-win knob upserts the defeat-dragon-utopia win condition", () => {
    const onChange = vi.fn();
    render(<MapPresetEditor preset={{ victoryMode: "dragon-conqueror" }} onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Dragon Utopia instant win" });
    fireEvent.change(within(group).getByRole("spinbutton"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ customWinConditions: [{ kind: "defeat-dragon-utopia", count: 2 }] })
    );
  });

  it("VP objective dropdown drops defeat-dragon-utopia for new rows but a legacy row keeps it selectable", () => {
    // Legacy row of the moved kind still renders + its kind stays selectable.
    const { rerender } = render(
      <MapPresetEditor
        preset={{ victoryPoints: { enabled: true, victoryConditionVp: 3, objectives: [{ kind: "defeat-dragon-utopia", vp: 5 }] } }}
        onChange={() => {}}
      />
    );
    const legacy = screen.getByLabelText("Objective 1 kind") as HTMLSelectElement;
    expect(legacy.value).toBe("defeat-dragon-utopia");
    expect(Array.from(legacy.options).some((o) => o.value === "defeat-dragon-utopia")).toBe(true);
    // CONTROL: a normal control-towns row's select does NOT offer the moved kind.
    rerender(
      <MapPresetEditor
        preset={{ victoryPoints: { enabled: true, victoryConditionVp: 3, objectives: [{ kind: "control-towns", vp: 3, count: 2 }] } }}
        onChange={() => {}}
      />
    );
    const fresh = screen.getByLabelText("Objective 1 kind") as HTMLSelectElement;
    expect(Array.from(fresh.options).some((o) => o.value === "defeat-dragon-utopia")).toBe(false);
  });

  it("under the hidden Grail/Utopia package, Grail shows only the honored knobs + the forced-values note", () => {
    render(<MapPresetEditor preset={{ objectives: { hiddenGrailUtopia: true } }} onChange={() => {}} />);
    // The two engine-honored knobs are shown…
    expect(screen.getByRole("group", { name: "Grail Obelisks required" })).toBeTruthy();
    expect(screen.getByText(/Hidden rules fix the rest/)).toBeTruthy();
    // …and the full-editor-only knobs (fixed by the engine under hidden rules) are NOT.
    expect(screen.queryByRole("group", { name: "Grail dig movement cost" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Grail possession VP" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Build Grail at" })).toBeNull();
  });

  it("Hero-defeat bounty: the gold field writes preset.heroDefeatGold", () => {
    const onChange = vi.fn();
    render(<MapPresetEditor preset={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Gold on hero defeat" }), {
      target: { value: "30" }
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ heroDefeatGold: 30 }));
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
    expect(screen.queryByRole("group", { name: "Ⅱ–Ⅲ Settlement reroll map preset" })).toBeNull();
  });

  it("Map settings: the Ⅱ–Ⅲ tile type-choice chips write the toggle and the allowed-kind list", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MapPresetEditor preset={{ victoryMode: "grail" }} onChange={onChange} />);
    // Turn the rule ON — the unrelated victoryMode must survive (no clobber).
    fireEvent.click(within(section("Ⅱ–Ⅲ tile type choice")).getByRole("button", { name: "On" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ victoryMode: "grail", farTileTypeChoice: true })
    );

    // Restricting the menu: pick two kinds ("crystal or gold").
    rerender(<MapPresetEditor preset={{ farTileTypeChoices: ["gold"] }} onChange={onChange} />);
    fireEvent.click(
      within(section("Allowed Ⅱ–Ⅲ tile kinds")).getByRole("button", { name: "CRYSTAL (valuables) mine" })
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ farTileTypeChoices: ["gold", "valuables"] })
    );

    // Un-picking the last kind DROPS the field (absent = every kind allowed);
    // with nothing else set, the whole preset collapses to "no conditions".
    rerender(<MapPresetEditor preset={{ farTileTypeChoices: ["gold"] }} onChange={onChange} />);
    fireEvent.click(within(section("Allowed Ⅱ–Ⅲ tile kinds")).getByRole("button", { name: "GOLD mine" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    // …and with a sibling field present, only the kind list goes.
    rerender(
      <MapPresetEditor preset={{ victoryMode: "grail", farTileTypeChoices: ["gold"] }} onChange={onChange} />
    );
    fireEvent.click(within(section("Allowed Ⅱ–Ⅲ tile kinds")).getByRole("button", { name: "GOLD mine" }));
    expect(onChange).toHaveBeenLastCalledWith({ victoryMode: "grail" });

    // CONTROL: with the rule explicitly OFF the kind row is hidden entirely.
    rerender(<MapPresetEditor preset={{ farTileTypeChoice: false }} onChange={onChange} />);
    expect(screen.queryByRole("group", { name: "Allowed Ⅱ–Ⅲ tile kinds" })).toBeNull();
  });

  // The collapsible section GROUPS (re-parented ordering layer over the leaf
  // sections). `groupByTitle` reads the visible title span rather than the
  // group's role/name, because the inner "Timed events" section label shares
  // that string.
  const groupByTitle = (title: string): HTMLDetailsElement => {
    const el = Array.from(document.querySelectorAll("details.mapPresetGroup")).find(
      (g) => (g.querySelector(".mapPresetGroupTitle") as HTMLElement | null)?.textContent === title
    );
    if (!el) {
      throw new Error(`condition group not found: ${title}`);
    }
    return el as HTMLDetailsElement;
  };

  it("groups the conditions into eight ordered, separated collapsible groups", () => {
    render(<MapPresetEditor preset={undefined} onChange={() => {}} />);
    const groups = Array.from(document.querySelectorAll("details.mapPresetGroup"));
    expect(groups.length).toBe(8);
    const order = groups.map(
      (g) => (g.querySelector(".mapPresetGroupTitle") as HTMLElement).textContent
    );
    expect(order).toEqual([
      "Match setup",
      "Single-player opponents",
      "Starting position",
      "Victory & scoring",
      "Map objects",
      "Timed events",
      "PvE encounter director",
      "Designer note"
    ]);
  });

  it("shows an active-count badge only on the groups that own set entries", () => {
    render(
      <MapPresetEditor
        preset={{
          difficulty: "hard",
          timedEvents: [{ round: 4, effect: { kind: "movement", amount: 1 } }]
        }}
        onChange={() => {}}
      />
    );
    // Match setup owns the difficulty entry (1); Timed events owns the one event (1).
    expect(within(groupByTitle("Match setup")).getByText("1 active")).toBeTruthy();
    expect(within(groupByTitle("Timed events")).getByText("1 active")).toBeTruthy();
    // The four groups with nothing set carry NO count badge (absent, not "0").
    for (const title of ["Single-player opponents", "Starting position", "Victory & scoring", "Map objects", "Designer note"]) {
      expect(groupByTitle(title).querySelector(".mapPresetGroupCount")).toBeNull();
    }
  });

  it("opens groups that own set entries and collapses empty ones by default", () => {
    render(<MapPresetEditor preset={{ difficulty: "hard" }} onChange={() => {}} />);
    // The group owning the difficulty entry starts OPEN…
    expect(groupByTitle("Match setup").open).toBe(true);
    // …every empty group starts collapsed.
    expect(groupByTitle("Starting position").open).toBe(false);
    expect(groupByTitle("Victory & scoring").open).toBe(false);
    expect(groupByTitle("Timed events").open).toBe(false);
    expect(groupByTitle("Designer note").open).toBe(false);
  });

  it("a leaf control inside a collapsed group still fires onChange once the group is expanded", () => {
    const onChange = vi.fn();
    render(<MapPresetEditor preset={undefined} onChange={onChange} />);
    const group = groupByTitle("Starting position");
    // Empty → collapsed by default.
    expect(group.open).toBe(false);
    // Expand it via the native summary disclosure, then use a leaf control.
    fireEvent.click(group.querySelector("summary") as HTMLElement);
    expect(group.open).toBe(true);
    fireEvent.click(within(group).getByRole("button", { name: "+5 gold" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startingBonuses: [{ kind: "resources", gold: 5, buildingMaterials: 0, valuables: 0 }]
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Map objects — Global | Specific tabs, specific lists, hex events (2026-07).
// ---------------------------------------------------------------------------
describe("MapPresetEditor — Global | Specific object modes", () => {
  const tilesWithMine: CustomMapTilePlan[] = [
    { row: 8, col: 2, group: "starting", faceDown: false },
    { row: 12, col: 6, group: "near", faceDown: false, tileDefId: "N15" }
  ];

  it("shows the mode tabs only when tiles + onPickOnMap are wired (standalone editor stays global-only)", () => {
    render(<MapPresetEditor preset={undefined} onChange={() => {}} />);
    expect(screen.queryAllByRole("group", { name: "Global or specific" })).toHaveLength(0);
    cleanup();
    render(
      <MapPresetEditor
        onChange={() => {}}
        onPickOnMap={() => {}}
        preset={undefined}
        tiles={tilesWithMine}
      />
    );
    expect(screen.getAllByRole("group", { name: "Global or specific" }).length).toBeGreaterThanOrEqual(4);
  });

  it("Specific mode lists per-tile plans, arms the on-map pick, and warns when no tile is eligible", () => {
    const onPickOnMap = vi.fn();
    render(
      <MapPresetEditor
        onChange={() => {}}
        onPickOnMap={onPickOnMap}
        preset={undefined}
        tiles={[
          ...tilesWithMine,
          {
            row: 14,
            col: 9,
            group: "near",
            faceDown: false,
            tileDefId: "N15",
            objectPlans: { mine: { guard: { level: 4 }, winCondition: true } }
          }
        ]}
      />
    );
    const minesSection = screen.getByRole("region", { name: "Mines" });
    fireEvent.click(within(minesSection).getByRole("button", { name: /Specific/ }));
    // The list shows the tile + a plain-words summary.
    expect(within(minesSection).getByText(/@14,9/)).toBeTruthy();
    expect(within(minesSection).getByText(/guard level 4/)).toBeTruthy();
    expect(within(minesSection).getByText(/first clear WINS/)).toBeTruthy();
    // The pick button arms the on-map flow.
    fireEvent.click(within(minesSection).getByRole("button", { name: /Pick a tile on the map/ }));
    expect(onPickOnMap).toHaveBeenCalledWith({ kind: "object-plan", objectKind: "mine" });

    cleanup();
    // CONTROL: with NO eligible tile the pick button is replaced by a warning.
    render(
      <MapPresetEditor
        onChange={() => {}}
        onPickOnMap={onPickOnMap}
        preset={undefined}
        tiles={[{ row: 8, col: 2, group: "starting", faceDown: false }]}
      />
    );
    const bare = screen.getByRole("region", { name: "Mines" });
    fireEvent.click(within(bare).getByRole("button", { name: /Specific/ }));
    expect(within(bare).queryByRole("button", { name: /Pick a tile on the map/ })).toBeNull();
    expect(within(bare).getByText(/No placed tile carries a Mine yet/)).toBeTruthy();
  });

  it("hex events: the editor carries only a count note pointing at the board palette (no cards, no pick button)", () => {
    const onChange = vi.fn();
    const onPickOnMap = vi.fn();
    render(
      <MapPresetEditor
        onChange={onChange}
        onPickOnMap={onPickOnMap}
        preset={{
          hexEvents: [{ id: "e1", placement: { row: 9, col: 4 }, message: "Boo!", reward: { gold: 3 } }]
        }}
        tiles={tilesWithMine}
      />
    );
    // The old per-event editing section is REMOVED — the board (Objects palette
    // + marker editor) is the single surface. Only the lean count note remains.
    expect(screen.queryByRole("region", { name: "Hidden hex events" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Place an event on the map/ })).toBeNull();
    const note = screen.getByLabelText("Hidden hex events note");
    expect(note.textContent).toContain("1/24");
    expect(note.textContent).toContain("Hidden event");
    expect(note.textContent).toContain("board");
  });
});
