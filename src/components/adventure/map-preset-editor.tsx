"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Clock3, Copy, Plus, Trash2 } from "lucide-react";
import {
  defaultTimedEffect,
  defaultTimedEvent,
  describeCustomMapPresetEntries,
  describeTimedMapEffect,
  MAX_TIMED_EVENTS,
  MAP_PRESET_BUILDING_OPTIONS,
  MAP_PRESET_VICTORY_OPTIONS,
  TIMED_EFFECT_KIND_LABELS,
  TIMED_EFFECT_KINDS,
  type CustomMapPreset,
  type CustomMapStartingBonus,
  type CustomMapTimedEffect,
  type CustomMapTimedEvent,
  type CustomStartingUnit,
  type TimedEffectKind,
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
  const summary = describeCustomMapPresetEntries(value);
  // Collapsed by default on a fresh/plain map so the tile board stays the
  // page's focus; opens itself when a map WITH conditions is loaded (0 → some),
  // and never fights the designer's own toggle otherwise.
  const [open, setOpen] = useState(summary.length > 0);
  const hadConditions = useRef(summary.length > 0);
  useEffect(() => {
    if (summary.length > 0 && !hadConditions.current) {
      setOpen(true);
    }
    hadConditions.current = summary.length > 0;
  }, [summary.length]);

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

  const setTimed = (next: CustomMapTimedEvent[]) => {
    patch({ timedEvents: next });
  };

  const updateTimed = (index: number, next: CustomMapTimedEvent) => {
    setTimed(timed.map((entry, i) => (i === index ? next : entry)));
  };

  const appendTimed = (event: CustomMapTimedEvent) => {
    if (timed.length >= MAX_TIMED_EVENTS) {
      return;
    }
    setTimed([...timed, event]);
  };

  return (
    <details
      className="mapPresetEditor"
      aria-label="Map scenario conditions"
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      open={open}
    >
      <summary className="mapPresetSummaryBar">
        <span className="mapPresetSummaryChevron" aria-hidden="true">
          ▸
        </span>
        <strong>Map conditions</strong>
        <span className={`mapPresetCountBadge${summary.length > 0 ? " active" : ""}`}>
          {summary.length > 0
            ? `${summary.length} active`
            : "optional"}
        </span>
        <small>Mission-book style setup for this map only — players see it when the map is picked.</small>
      </summary>

      {summary.length > 0 ? (
        <div className="mapPresetSummary" role="status">
          <div className="mapPresetSummaryTitle">Active conditions</div>
          <ul className="mapPresetEntryList">
            {summary.map((entry) => (
              <li key={entry.text}>
                <span className="mapPresetEntryIcon" aria-hidden="true">
                  {entry.icon}
                </span>
                {entry.text}
              </li>
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
        <small className="mapPresetHint">
          Seeds the lobby when the map is picked — the host can still change it there (their choice wins), and
          switching maps restores the scenario default.
        </small>
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

      <section className="mapPresetSection mapPresetTimedSection" aria-label="Timed events">
        <div className="mapPresetTimedSectionHeading">
          <div>
            <div className="mapPresetSectionLabel">
              <Clock3 aria-hidden="true" size={14} /> Timed events
            </div>
            <small className="mapPresetHint">Which round → what happens</small>
          </div>
          <span className={`mapPresetTimedCount${timed.length >= MAX_TIMED_EVENTS ? " full" : ""}`}>
            {timed.length}/{MAX_TIMED_EVENTS}
          </span>
        </div>
        <small className="mapPresetHint">
          Mission-book style: pick any round (1–30) and any effect, then tweak the numbers. Multiple
          events can share a round. Fires at the start of that round for every player.
        </small>

        <div className="mapPresetTimedTools">
          <button
            className="mapPresetTimedAdd"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() => appendTimed(defaultTimedEvent(suggestNextRound(timed, value.roundLimit)))}
            type="button"
          >
            <Plus aria-hidden="true" size={13} /> Add event
          </button>
          {timed.length > 1 ? (
            <button
              className="mapPresetTimedSort"
              onClick={() =>
                setTimed(
                  timed
                    .map((event, index) => ({ event, index }))
                    .sort((a, b) => a.event.round - b.event.round || a.index - b.index)
                    .map(({ event }) => event)
                )
              }
              type="button"
            >
              <ArrowUpDown aria-hidden="true" size={12} /> Sort by round
            </button>
          ) : null}
        </div>
        <details className="mapPresetTemplates">
          <summary>Quick templates</summary>
          <div className="mapPresetChipRow">
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed(
                {
                  round: 6,
                  effect: {
                    kind: "clear_visitable_cubes",
                    locations: ["windmill", "water_wheel", "mystical_garden"]
                  }
                }
              )
            }
            type="button"
          >
            Template: re-open mills (r6)
          </button>
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed(
                { round: 4, effect: { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 } }
              )
            }
            type="button"
          >
            Template: +3 gold (r4)
          </button>
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed(
                { round: 8, effect: { kind: "search", deck: "artifacts", count: 1 } }
              )
            }
            type="button"
          >
            Template: Search Artifacts (r8)
          </button>
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed({ round: 4, effect: { kind: "movement", amount: 1 } })
            }
            type="button"
          >
            Template: +1 MP (r4)
          </button>
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed({ round: 4, effect: { kind: "treasure_roll", count: 1 } })
            }
            type="button"
          >
            Template: Treasure die (r4)
          </button>
          </div>
        </details>
        {timed.length >= MAX_TIMED_EVENTS ? (
          <small className="mapPresetTimedWarning" role="status">
            Event limit reached. Remove an event before adding another.
          </small>
        ) : null}

        {timed.length > 0 ? (
          <ul className="mapPresetTimedList">
            {timed.map((event, index) => (
              <li className="mapPresetTimedCard" key={`timed-${index}`}>
                <span className="mapPresetTimedRail" aria-hidden="true">
                  {event.round}
                </span>
                <div className="mapPresetTimedHeader">
                  <label className="mapPresetTimedRound">
                    Round
                    <input
                      aria-label={`Timed event ${index + 1} round`}
                      max={30}
                      min={1}
                      onChange={(e) => {
                        const round = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                        updateTimed(index, { ...event, round });
                      }}
                      type="number"
                      value={event.round}
                    />
                  </label>
                  <label className="mapPresetTimedKind">
                    What happens
                    <select
                      aria-label={`Timed event ${index + 1} effect type`}
                      onChange={(e) => {
                        const kind = e.target.value as TimedEffectKind;
                        updateTimed(index, {
                          round: event.round,
                          effect: defaultTimedEffect(kind)
                        });
                      }}
                      value={event.effect.kind}
                    >
                      {TIMED_EFFECT_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {TIMED_EFFECT_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    aria-label={`Duplicate timed event ${index + 1}`}
                    className="mapPresetTimedIconButton"
                    disabled={timed.length >= MAX_TIMED_EVENTS}
                    onClick={() => appendTimed(cloneTimedEvent(event))}
                    title="Duplicate this event"
                    type="button"
                  >
                    <Copy aria-hidden="true" size={13} />
                  </button>
                  <button
                    aria-label={`Remove timed event ${index + 1}`}
                    className="mapPresetTimedIconButton danger"
                    onClick={() => setTimed(timed.filter((_, i) => i !== index))}
                    title="Remove this event"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                  </button>
                </div>
                <TimedEffectFields
                  effect={event.effect}
                  index={index}
                  onChange={(effect) => updateTimed(index, { ...event, effect })}
                />
                <div className="mapPresetTimedPreview" aria-live="polite">
                  Round {event.round}: {describeTimedMapEffect(event.effect)}
                </div>
                {timedEventWarning(event, value.roundLimit) ? (
                  <small className="mapPresetTimedWarning" role="status">
                    {timedEventWarning(event, value.roundLimit)}
                  </small>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <small className="mapPresetEmpty">No timed events yet — add one or pick a template.</small>
        )}
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
    </details>
  );
}

const CUBE_LOCATION_OPTIONS: {
  id: "windmill" | "water_wheel" | "mystical_garden";
  label: string;
}[] = [
  { id: "windmill", label: "Windmill (+ Prospector)" },
  { id: "water_wheel", label: "Water Wheel (+ Derrick)" },
  { id: "mystical_garden", label: "Mystical Garden" }
];

function TimedEffectFields({
  effect,
  index,
  onChange
}: {
  effect: CustomMapTimedEffect;
  index: number;
  onChange: (effect: CustomMapTimedEffect) => void;
}) {
  if (effect.kind === "resources") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Gold"
          value={effect.gold ?? 0}
          onChange={(gold) => onChange({ ...effect, gold })}
        />
        <ResourceField
          label="Materials"
          value={effect.buildingMaterials ?? 0}
          onChange={(buildingMaterials) => onChange({ ...effect, buildingMaterials })}
        />
        <ResourceField
          label="Valuables"
          value={effect.valuables ?? 0}
          onChange={(valuables) => onChange({ ...effect, valuables })}
        />
      </div>
    );
  }
  if (effect.kind === "search") {
    return (
      <div className="mapPresetResourceRow">
        <label className="mapPresetResourceField">
          <span>Deck</span>
          <select
            aria-label={`Timed event ${index + 1} search deck`}
            onChange={(e) =>
              onChange({
                ...effect,
                deck: e.target.value as "artifacts" | "spells" | "abilities"
              })
            }
            value={effect.deck}
          >
            <option value="artifacts">Artifacts</option>
            <option value="spells">Spells</option>
            <option value="abilities">Abilities</option>
          </select>
        </label>
        <ResourceField
          label="Search size"
          max={5}
          min={1}
          value={effect.count}
          onChange={(count) => onChange({ ...effect, count: Math.max(1, count) })}
        />
      </div>
    );
  }
  if (effect.kind === "clear_visitable_cubes") {
    const selected = new Set(effect.locations);
    return (
      <div className="mapPresetChipRow" role="group" aria-label={`Timed event ${index + 1} locations`}>
        {CUBE_LOCATION_OPTIONS.map((opt) => {
          const on = selected.has(opt.id);
          return (
            <button
              aria-pressed={on}
              className={`mapPresetChip${on ? " active" : ""}`}
              key={opt.id}
              onClick={() => {
                const next = new Set(selected);
                if (on) {
                  // Keep at least one location so the event stays valid.
                  if (next.size <= 1) {
                    return;
                  }
                  next.delete(opt.id);
                } else {
                  next.add(opt.id);
                }
                onChange({
                  kind: "clear_visitable_cubes",
                  locations: [...next] as ("windmill" | "water_wheel" | "mystical_garden")[]
                });
              }}
              type="button"
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (effect.kind === "morale") {
    return (
      <div className="mapPresetChipRow" role="group" aria-label={`Timed event ${index + 1} morale`}>
        <button
          aria-pressed={effect.amount === 1}
          className={`mapPresetChip${effect.amount === 1 ? " active" : ""}`}
          onClick={() => onChange({ kind: "morale", amount: 1 })}
          type="button"
        >
          +1 morale
        </button>
        <button
          aria-pressed={effect.amount === -1}
          className={`mapPresetChip${effect.amount === -1 ? " active" : ""}`}
          onClick={() => onChange({ kind: "morale", amount: -1 })}
          type="button"
        >
          −1 morale
        </button>
      </div>
    );
  }
  if (effect.kind === "movement") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Movement +"
          max={5}
          min={1}
          value={effect.amount}
          onChange={(amount) => onChange({ kind: "movement", amount: Math.max(1, amount) })}
        />
      </div>
    );
  }
  if (effect.kind === "treasure_roll" || effect.kind === "resource_roll") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Dice"
          max={3}
          min={1}
          value={effect.count}
          onChange={(count) => onChange({ ...effect, count: Math.max(1, count) })}
        />
      </div>
    );
  }
  // note
  return (
    <textarea
      aria-label={`Timed event ${index + 1} announcement text`}
      className="mapPresetNotes mapPresetTimedNote"
      maxLength={200}
      onChange={(e) => onChange({ kind: "note", text: e.target.value })}
      placeholder="Announcement shown in the feed when this round starts…"
      rows={2}
      value={effect.text}
    />
  );
}

function ResourceField({
  label,
  value,
  onChange,
  min = 0,
  max = 99
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="mapPresetResourceField">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))
        }
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

/** Suggest a sensible next round when adding a blank timed event. */
function suggestNextRound(existing: CustomMapTimedEvent[], roundLimit?: number): number {
  if (existing.length === 0) {
    return Math.min(6, roundLimit ?? 30);
  }
  const max = Math.max(...existing.map((e) => e.round));
  return Math.min(roundLimit ?? 30, 30, max + 2);
}

function cloneTimedEvent(event: CustomMapTimedEvent): CustomMapTimedEvent {
  return {
    round: event.round,
    effect:
      event.effect.kind === "clear_visitable_cubes"
        ? { ...event.effect, locations: [...event.effect.locations] }
        : { ...event.effect }
  };
}

function timedEventWarning(event: CustomMapTimedEvent, roundLimit?: number): string | null {
  if (roundLimit && event.round > roundLimit) {
    return `This fires after the suggested ${roundLimit}-round map length.`;
  }
  if (
    event.effect.kind === "resources" &&
    !event.effect.gold &&
    !event.effect.buildingMaterials &&
    !event.effect.valuables
  ) {
    return "Set at least one resource above 0 or this event will be removed when saved.";
  }
  if (event.effect.kind === "note" && event.effect.text.trim().length === 0) {
    return "Write an announcement or this event will be removed when saved.";
  }
  return null;
}
