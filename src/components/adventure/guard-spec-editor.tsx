"use client";

/**
 * Shared designer guard editor — level Ⅰ–Ⅶ or an exact army built from
 * random-tier slots (Random brown/silver/gold/azure, repeatable), named
 * Neutrals, and faction Packs. Grouped rows with +/− steppers so mixes like
 * "3× Random gold + Storm Elementals" are one glance.
 *
 * Data model is still a flat `units: string[]` (duplicates = count) so sanitize
 * / fight resolve stay slot-based and byte-compatible.
 */

import { coreUnitDefinitions } from "@/data/factions/units";
import {
  customGuardArmyDifficulty,
  describeGuardArmyGrouped,
  groupGuardUnitEntries,
  guardUnitEntryLabel,
  MAX_CUSTOM_GUARD_UNITS,
  RANDOM_GUARD_TIERS,
  type CustomGuardSpec,
  type RandomGuardTier
} from "@/engine";

const GUARD_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
const ROMAN_NUMERALS: Record<number, string> = {
  1: "Ⅰ",
  2: "Ⅱ",
  3: "Ⅲ",
  4: "Ⅳ",
  5: "Ⅴ",
  6: "Ⅵ",
  7: "Ⅶ"
};

const GUARD_TIER_ORDER = ["bronze", "silver", "gold", "azure"] as const;
const GUARD_TIER_LABELS: Record<(typeof GUARD_TIER_ORDER)[number], string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  azure: "Azure"
};

const RANDOM_QUICK: { tier: RandomGuardTier; slot: string; label: string }[] = [
  { tier: "bronze", slot: "random:bronze", label: "+ Brown" },
  { tier: "silver", slot: "random:silver", label: "+ Silver" },
  { tier: "gold", slot: "random:gold", label: "+ Gold" },
  { tier: "azure", slot: "random:azure", label: "+ Azure" }
];

/** Every Neutral-side unit a designer may field, grouped by tier. */
const GUARD_UNIT_OPTIONS: {
  tier: (typeof GUARD_TIER_ORDER)[number];
  units: { id: string; label: string }[];
}[] = GUARD_TIER_ORDER.map((tier) => ({
  tier,
  units: Object.values(coreUnitDefinitions)
    .filter((def) => def.neutral && def.tier === tier)
    .map((def) => ({ id: def.id, label: def.name }))
    .sort((a, b) => a.label.localeCompare(b.label))
})).filter((group) => group.units.length > 0);

/** Faction Pack sides (`pack:<id>`). */
const GUARD_PACK_UNIT_OPTIONS: {
  tier: (typeof GUARD_TIER_ORDER)[number];
  units: { id: string; label: string }[];
}[] = GUARD_TIER_ORDER.map((tier) => ({
  tier,
  units: Object.values(coreUnitDefinitions)
    .filter((def) => def.pack && def.tier === tier)
    .map((def) => ({ id: `pack:${def.id}`, label: `Pack of ${def.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label))
})).filter((group) => group.units.length > 0);

function setUnitCount(units: string[], id: string, count: number): string[] {
  const without = units.filter((u) => u !== id);
  const n = Math.max(0, Math.min(MAX_CUSTOM_GUARD_UNITS - without.length, Math.floor(count)));
  return [...without, ...Array.from({ length: n }, () => id)];
}

export function GuardSpecEditor({
  guard,
  noneLabel,
  onChange,
  compact
}: {
  guard: CustomGuardSpec | undefined;
  /** Label of the "no designed guard" chip — "Printed" where a printed guard exists, else "None". */
  noneLabel: string;
  onChange: (guard: CustomGuardSpec | undefined) => void;
  /** Tighter layout for map-preset rows. */
  compact?: boolean;
}) {
  const armyMode = Boolean(guard?.units);
  const units = guard?.units ?? [];
  const groups = groupGuardUnitEntries(units);
  const atCap = units.length >= MAX_CUSTOM_GUARD_UNITS;
  const remaining = MAX_CUSTOM_GUARD_UNITS - units.length;

  const setUnits = (next: string[]) => {
    if (next.length === 0) {
      // Stay in army mode with an empty list so the designer can keep editing
      // until they pick Printed/None or a level chip.
      onChange({ units: [] });
      return;
    }
    onChange({ units: next.slice(0, MAX_CUSTOM_GUARD_UNITS) });
  };

  return (
    <div className={`popoverGuardEditor${compact ? " popoverGuardEditorCompact" : ""}`}>
      <div className="popoverGuardRow" role="group" aria-label="Guard">
        <button
          aria-pressed={!guard}
          className={`popoverGuardChip${!guard ? " active" : ""}`}
          onClick={() => onChange(undefined)}
          title="No designed guard (keep the printed guard, if any)."
          type="button"
        >
          {noneLabel}
        </button>
        {GUARD_LEVELS.map((level) => {
          const active = !armyMode && guard?.level === level;
          return (
            <button
              aria-pressed={active}
              className={`popoverGuardChip${active ? " active" : ""}`}
              key={level}
              onClick={() => onChange({ level })}
              title={`Neutral guard of Field Difficulty ${ROMAN_NUMERALS[level]}.`}
              type="button"
            >
              {ROMAN_NUMERALS[level]}
            </button>
          );
        })}
        <button
          aria-pressed={armyMode}
          className={`popoverGuardChip popoverGuardArmyChip${armyMode ? " active" : ""}`}
          onClick={() => {
            if (!armyMode) {
              onChange({ units: [] });
            }
          }}
          title="Field an exact army: random-tier slots and/or specific Neutral unit cards."
          type="button"
        >
          Exact army
        </button>
      </div>

      {armyMode ? (
        <div className="popoverGuardArmy">
          <div className="popoverGuardQuickRow" role="group" aria-label="Add random-tier unit">
            {RANDOM_QUICK.map(({ slot, label, tier }) => (
              <button
                className="popoverGuardChip popoverGuardQuickChip"
                disabled={atCap}
                key={slot}
                onClick={() => {
                  if (atCap) return;
                  setUnits([...units, slot]);
                }}
                title={`Add a random ${tier === "bronze" ? "brown" : tier} Neutral (rolled at fight time). ${units.length}/${MAX_CUSTOM_GUARD_UNITS} filled.`}
                type="button"
              >
                {label}
              </button>
            ))}
            <span className="popoverGuardCapHint" aria-live="polite">
              {units.length}/{MAX_CUSTOM_GUARD_UNITS}
            </span>
          </div>

          {groups.length > 0 ? (
            <div className="popoverGuardArmyGroups" role="list" aria-label="Exact army units">
              {groups.map(({ id, count }) => (
                <div className="popoverGuardArmyGroup" key={id} role="listitem">
                  <span className="popoverGuardArmyGroupLabel" title={guardUnitEntryLabel(id)}>
                    <span className="popoverGuardArmyCount">×{count}</span> {guardUnitEntryLabel(id)}
                  </span>
                  <div className="popoverGuardArmySteppers">
                    <button
                      aria-label={`Remove one ${guardUnitEntryLabel(id)}`}
                      className="popoverGuardStepBtn"
                      onClick={() => setUnits(setUnitCount(units, id, count - 1))}
                      type="button"
                    >
                      −
                    </button>
                    <button
                      aria-label={`Add one ${guardUnitEntryLabel(id)}`}
                      className="popoverGuardStepBtn"
                      disabled={atCap}
                      onClick={() => setUnits(setUnitCount(units, id, count + 1))}
                      type="button"
                    >
                      +
                    </button>
                    <button
                      aria-label={`Remove all ${guardUnitEntryLabel(id)}`}
                      className="popoverGuardStepBtn popoverGuardRemoveAll"
                      onClick={() => setUnits(units.filter((u) => u !== id))}
                      title="Remove all of this entry"
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <small className="popoverHint">
              No units yet — use +Brown/+Silver/+Gold/+Azure or add a named unit below (up to{" "}
              {MAX_CUSTOM_GUARD_UNITS}).
            </small>
          )}

          {remaining > 0 ? (
            <select
              aria-label="Add a named guard unit"
              className="popoverSelect popoverGuardUnitSelect"
              onChange={(event) => {
                const unitId = event.target.value;
                if (unitId) {
                  setUnits([...units, unitId]);
                }
                event.target.value = "";
              }}
              value=""
            >
              <option value="">+ Add named unit…</option>
              {GUARD_UNIT_OPTIONS.map((group) => (
                <optgroup key={group.tier} label={`Neutral · ${GUARD_TIER_LABELS[group.tier]}`}>
                  {group.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              {GUARD_PACK_UNIT_OPTIONS.map((group) => (
                <optgroup key={`pack-${group.tier}`} label={`Faction Pack · ${GUARD_TIER_LABELS[group.tier]}`}>
                  {group.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : null}

          {units.length > 0 ? (
            <small className="popoverHint popoverGuardArmyNote">
              {describeGuardArmyGrouped(units)} · counts as difficulty{" "}
              {ROMAN_NUMERALS[customGuardArmyDifficulty(units)]} (experience); Quick Combat never skips an exact
              army.
            </small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Suppress unused-tier lint if RANDOM_GUARD_TIERS is only for typing exports. */
void RANDOM_GUARD_TIERS;
