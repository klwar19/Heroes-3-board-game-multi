"use client";

import {
  describeCustomMapPreset,
  MAP_PRESET_BUILDING_OPTIONS,
  MAP_PRESET_VICTORY_OPTIONS,
  type CustomMapPreset,
  type CustomMapStartingBonus,
  type CustomMapTimedEvent,
  type CustomStartingUnit,
  type UnitLevel,
  type VictoryMode
} from "@/engine";

/**
 * Map designer panel: mission-book style conditions (resources, army, buildings,
 * victory, timed events, notes). All map-only — applied when the map is picked.
 */
export function MapPresetEditor({
  preset,
  onChange
}: {
  preset: CustomMapPreset | undefined;
  onChange: (next: CustomMapPreset | undefined) => void;
}) {
  const value = preset ?? {};
  const summary = describeCustomMapPreset(value);

  const patch = (partial: Partial<CustomMapPreset> | null) => {
    if (partial === null) {
      onChange(undefined);
      return;
    }
    const next: CustomMapPreset = { ...value, ...partial };
    // Drop empty arrays / cleared optional bags.
    if (partial.startingBuildings && partial.startingBuildings.length === 0) {
      delete next.startingBuildings;
    }
    if (partial.startingUnits && partial.startingUnits.length === 0 && "startingUnits" in partial) {
      next.startingUnits = [];
    }
    if (partial.startingBonuses && partial.startingBonuses.length === 0) {
      delete next.startingBonuses;
    }
    if (partial.timedEvents && partial.timedEvents.length === 0) {
      delete next.timedEvents;
    }
    if (partial.notes === "") {
      delete next.notes;
    }
    if (partial.roundLimit === 0) {
      delete next.roundLimit;
    }
    // Collapse to undefined when nothing is set.
    const keys = Object.keys(next).filter((key) => {
      const v = next[key as keyof CustomMapPreset];
      if (v === undefined || v === null) {
        return false;
      }
      if (Array.isArray(v) && v.length === 0 && key !== "startingUnits") {
        return false;
      }
      return true;
    });
    onChange(keys.length === 0 ? undefined : next);
  };

  const resources = value.startingResources ?? { gold: 10, buildingMaterials: 0, valuables: 0 };
  const production = value.startingProduction ?? { gold: 10, buildingMaterials: 0, valuables: 0 };
  const buildings = new Set(value.startingBuildings ?? []);
  const units = value.startingUnits ?? null;
  const bonuses = value.startingBonuses ?? [];
  const timed = value.timedEvents ?? [];

  return (
    <div className="mapPresetEditor" aria-label="Map scenario conditions">
      <header className="mapPresetHeader">
        <strong>Map conditions</strong>
        <small>
          Mission-book style setup for this map only (resources, army, buildings, timed events). Players see a note
          when they pick the map.
        </small>
      </header>

      {summary.length > 0 ? (
        <div className="mapPresetSummary" role="status">
          <div className="mapPresetSummaryTitle">Active conditions</div>
          <ul>
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <button className="mapPresetClear" onClick={() => patch(null)} type="button">
            Clear all conditions
          </button>
        </div>
      ) : (
        <small className="mapPresetEmpty">No special conditions — pure tile layout.</small>
      )}

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Victory (preset)</div>
        <div className="mapPresetChipRow" role="group" aria-label="Victory mode">
          {MAP_PRESET_VICTORY_OPTIONS.map((opt) => (
            <button
              aria-pressed={value.victoryMode === opt.id}
              className={`mapPresetChip${value.victoryMode === opt.id ? " active" : ""}`}
              key={opt.id}
              onClick={() =>
                patch({
                  victoryMode: value.victoryMode === opt.id ? undefined : (opt.id as VictoryMode)
                })
              }
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <small className="mapPresetHint">Applied when the map is picked. Lobby victory control can still change later.</small>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Starting resources</div>
        <div className="mapPresetResourceRow">
          <ResourceField
            label="Gold"
            value={value.startingResources ? resources.gold : null}
            onChange={(gold) =>
              patch({
                startingResources: { ...resources, gold }
              })
            }
          />
          <ResourceField
            label="Materials"
            value={value.startingResources ? resources.buildingMaterials : null}
            onChange={(buildingMaterials) =>
              patch({
                startingResources: { ...resources, buildingMaterials }
              })
            }
          />
          <ResourceField
            label="Valuables"
            value={value.startingResources ? resources.valuables : null}
            onChange={(valuables) =>
              patch({
                startingResources: { ...resources, valuables }
              })
            }
          />
        </div>
        <button
          className="mapPresetLinkBtn"
          onClick={() => patch({ startingResources: undefined })}
          type="button"
          disabled={!value.startingResources}
        >
          Use scenario default resources
        </button>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Income (per Resource round)</div>
        <div className="mapPresetResourceRow">
          <ResourceField
            label="Gold"
            value={value.startingProduction ? production.gold : null}
            onChange={(gold) => patch({ startingProduction: { ...production, gold } })}
          />
          <ResourceField
            label="Materials"
            value={value.startingProduction ? production.buildingMaterials : null}
            onChange={(buildingMaterials) =>
              patch({ startingProduction: { ...production, buildingMaterials } })
            }
          />
          <ResourceField
            label="Valuables"
            value={value.startingProduction ? production.valuables : null}
            onChange={(valuables) => patch({ startingProduction: { ...production, valuables } })}
          />
        </div>
        <button
          className="mapPresetLinkBtn"
          disabled={!value.startingProduction}
          onClick={() => patch({ startingProduction: undefined })}
          type="button"
        >
          Use scenario default income
        </button>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Town buildings at start</div>
        <div className="mapPresetChipRow">
          {MAP_PRESET_BUILDING_OPTIONS.map((opt) => {
            const on = buildings.has(opt.id);
            return (
              <button
                aria-pressed={on}
                className={`mapPresetChip${on ? " active" : ""}`}
                key={opt.id}
                onClick={() => {
                  const next = new Set(buildings);
                  if (on) {
                    next.delete(opt.id);
                  } else {
                    next.add(opt.id);
                  }
                  patch({ startingBuildings: [...next] });
                }}
                type="button"
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Starting army (level 1–7)</div>
        <small className="mapPresetHint">Each player gets their own faction’s unit of that level.</small>
        <div className="mapPresetUnitGrid">
          {([1, 2, 3, 4, 5, 6, 7] as UnitLevel[]).map((level) => {
            const pick = units?.find((u) => u.level === level);
            return (
              <div className="mapPresetUnitRow" key={level}>
                <span>Lv {level}</span>
                <button
                  aria-pressed={!pick}
                  className={!pick ? "active" : ""}
                  onClick={() => {
                    const rest = (units ?? []).filter((u) => u.level !== level);
                    patch({ startingUnits: rest });
                  }}
                  type="button"
                >
                  —
                </button>
                <button
                  aria-pressed={pick?.side === "few"}
                  className={pick?.side === "few" ? "active" : ""}
                  onClick={() => setUnit(units, level, "few", patch)}
                  type="button"
                >
                  Few
                </button>
                <button
                  aria-pressed={pick?.side === "pack"}
                  className={pick?.side === "pack" ? "active" : ""}
                  onClick={() => setUnit(units, level, "pack", patch)}
                  type="button"
                >
                  Pack
                </button>
              </div>
            );
          })}
        </div>
        <button
          className="mapPresetLinkBtn"
          disabled={units === null}
          onClick={() => patch({ startingUnits: undefined })}
          type="button"
        >
          Use scenario default army
        </button>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Additional starting bonus</div>
        <div className="mapPresetChipRow">
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                startingBonuses: [
                  ...bonuses,
                  { kind: "resources", gold: 5, buildingMaterials: 0, valuables: 0 }
                ]
              })
            }
            type="button"
          >
            +5 gold
          </button>
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                startingBonuses: [...bonuses, { kind: "search", deck: "artifacts", count: 2 }]
              })
            }
            type="button"
          >
            Search(2) Artifacts
          </button>
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                startingBonuses: [...bonuses, { kind: "search", deck: "spells", count: 2 }]
              })
            }
            type="button"
          >
            Search(2) Spells
          </button>
          <button
            className="mapPresetChip"
            onClick={() => patch({ startingBonuses: [...bonuses, { kind: "morale", amount: 1 }] })}
            type="button"
          >
            +1 morale
          </button>
        </div>
        {bonuses.length > 0 ? (
          <ul className="mapPresetList">
            {bonuses.map((bonus, index) => (
              <li key={`${bonus.kind}-${index}`}>
                {describeBonusLine(bonus)}
                <button
                  onClick={() =>
                    patch({
                      startingBonuses: bonuses.filter((_, i) => i !== index)
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Timed events (which round → what happens)</div>
        <div className="mapPresetChipRow">
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                timedEvents: [
                  ...timed,
                  {
                    round: 6,
                    effect: {
                      kind: "clear_visitable_cubes",
                      locations: ["windmill", "water_wheel", "mystical_garden"]
                    }
                  }
                ]
              })
            }
            type="button"
          >
            + Round 6: clear Windmill/Water Wheel/Garden cubes
          </button>
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                timedEvents: [
                  ...timed,
                  { round: 4, effect: { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 } }
                ]
              })
            }
            type="button"
          >
            + Round 4: +3 gold each
          </button>
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                timedEvents: [
                  ...timed,
                  { round: 8, effect: { kind: "search", deck: "artifacts", count: 1 } }
                ]
              })
            }
            type="button"
          >
            + Round 8: Search(1) Artifacts
          </button>
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                timedEvents: [
                  ...timed,
                  { round: 10, effect: { kind: "note", text: "Boss phase begins — fight carefully!" } }
                ]
              })
            }
            type="button"
          >
            + Round 10: announcement
          </button>
        </div>
        {timed.length > 0 ? (
          <ul className="mapPresetList">
            {timed.map((event, index) => (
              <li key={`${event.round}-${index}`}>
                <label>
                  Round{" "}
                  <input
                    aria-label={`Timed event ${index + 1} round`}
                    max={30}
                    min={1}
                    onChange={(e) => {
                      const round = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                      const next = timed.map((entry, i) =>
                        i === index ? { ...entry, round } : entry
                      ) as CustomMapTimedEvent[];
                      patch({ timedEvents: next });
                    }}
                    type="number"
                    value={event.round}
                  />
                </label>
                <span>{describeTimedLine(event)}</span>
                <button
                  onClick={() => patch({ timedEvents: timed.filter((_, i) => i !== index) })}
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Suggested length (rounds)</div>
        <div className="mapPresetResourceRow">
          <ResourceField
            label="Rounds"
            value={value.roundLimit ?? null}
            onChange={(roundLimit) => patch({ roundLimit: roundLimit || undefined })}
          />
        </div>
        <small className="mapPresetHint">Display note for now — hard end is left for a later victory extension.</small>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Designer note (shown when map is picked)</div>
        <textarea
          aria-label="Map designer note"
          className="mapPresetNotes"
          maxLength={400}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="e.g. Cooperative feel — focus on expanding before round 8. Gold mines are secret on the outer ring."
          rows={3}
          value={value.notes ?? ""}
        />
      </section>
    </div>
  );
}

function ResourceField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mapPresetResourceField">
      <span>{label}</span>
      <input
        max={99}
        min={0}
        onChange={(e) => onChange(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
        type="number"
        value={value ?? ""}
        placeholder="—"
      />
    </label>
  );
}

function setUnit(
  units: CustomStartingUnit[] | null,
  level: UnitLevel,
  side: "few" | "pack",
  patch: (partial: Partial<CustomMapPreset>) => void
) {
  const rest = (units ?? []).filter((u) => u.level !== level);
  rest.push({ level, side });
  rest.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  patch({ startingUnits: rest });
}

function describeBonusLine(bonus: CustomMapStartingBonus): string {
  if (bonus.kind === "resources") {
    const parts: string[] = [];
    if (bonus.gold) {
      parts.push(`${bonus.gold} gold`);
    }
    if (bonus.buildingMaterials) {
      parts.push(`${bonus.buildingMaterials} materials`);
    }
    if (bonus.valuables) {
      parts.push(`${bonus.valuables} valuables`);
    }
    return `+${parts.join(", ") || "resources"}`;
  }
  if (bonus.kind === "search") {
    return `Search(${bonus.count}) ${bonus.deck}`;
  }
  return bonus.amount > 0 ? "+1 morale" : "−1 morale";
}

function describeTimedLine(event: CustomMapTimedEvent): string {
  const effect = event.effect;
  if (effect.kind === "resources") {
    return `all gain resources`;
  }
  if (effect.kind === "search") {
    return `Search(${effect.count}) ${effect.deck}`;
  }
  if (effect.kind === "clear_visitable_cubes") {
    return `clear cubes on ${effect.locations.join(", ")}`;
  }
  return effect.text;
}
