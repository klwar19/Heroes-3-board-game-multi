"use client";

/**
 * Shared designer guard editor — level Ⅰ–Ⅶ (Neutrals OR Packs of those tiers),
 * or an exact army of random-tier Neutrals, random-pack-of-tier, named Neutrals,
 * and faction Packs. Optional packFaction locks every Pack body to one faction
 * (or rolls one at fight time).
 *
 * Data model stays slot-based (`units: string[]` + level/levelArmy/packFaction)
 * so sanitize / fight resolve stay byte-compatible with legacy maps.
 */

import { coreUnitDefinitions } from "@/data/factions/units";
import {
  customGuardArmyDifficulty,
  describeGuardArmyGrouped,
  groupGuardUnitEntries,
  guardUnitEntryLabel,
  isAnyPackGuardSlot,
  MAX_CUSTOM_GUARD_UNITS,
  RANDOM_GUARD_TIERS,
  type CustomGuardSpec,
  type FactionId,
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
  bronze: "Bronze (Tier I)",
  silver: "Silver (Tier II)",
  gold: "Gold (Tier III)",
  azure: "Azure (Tier IV)"
};

const RANDOM_NEUTRAL_QUICK: { tier: RandomGuardTier; slot: string; label: string }[] = [
  { tier: "bronze", slot: "random:bronze", label: "+ Neutral I" },
  { tier: "silver", slot: "random:silver", label: "+ Neutral II" },
  { tier: "gold", slot: "random:gold", label: "+ Neutral III" },
  { tier: "azure", slot: "random:azure", label: "+ Neutral IV" }
];

const RANDOM_PACK_QUICK: { tier: RandomGuardTier; slot: string; label: string }[] = [
  { tier: "bronze", slot: "random-pack:bronze", label: "+ Pack I" },
  { tier: "silver", slot: "random-pack:silver", label: "+ Pack II" },
  { tier: "gold", slot: "random-pack:gold", label: "+ Pack III" },
  { tier: "azure", slot: "random-pack:azure", label: "+ Pack IV" }
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

/** Factions that have at least one Pack unit (for the faction lock chips). */
const PACK_FACTIONS: { id: FactionId; label: string }[] = (() => {
  const seen = new Map<string, string>();
  for (const def of Object.values(coreUnitDefinitions)) {
    if (!def.pack || seen.has(def.faction)) continue;
    // Prefer a readable faction name from the first pack unit's faction id.
    const label = def.faction
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    seen.set(def.faction, label);
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id: id as FactionId, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
})();

function packUnitOptions(factionFilter: FactionId | "random" | undefined): {
  tier: (typeof GUARD_TIER_ORDER)[number];
  units: { id: string; label: string }[];
}[] {
  const concrete = factionFilter && factionFilter !== "random" ? factionFilter : null;
  return GUARD_TIER_ORDER.map((tier) => ({
    tier,
    units: Object.values(coreUnitDefinitions)
      .filter((def) => def.pack && def.tier === tier && (!concrete || def.faction === concrete))
      .map((def) => ({ id: `pack:${def.id}`, label: `Pack of ${def.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })).filter((group) => group.units.length > 0);
}

function setUnitCount(units: string[], id: string, count: number): string[] {
  const without = units.filter((u) => u !== id);
  const n = Math.max(0, Math.min(MAX_CUSTOM_GUARD_UNITS - without.length, Math.floor(count)));
  return [...without, ...Array.from({ length: n }, () => id)];
}

function armyUsesPacks(units: string[]): boolean {
  return units.some((id) => isAnyPackGuardSlot(id));
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
  const levelMode = Boolean(guard?.level && !armyMode);
  const units = guard?.units ?? [];
  const groups = groupGuardUnitEntries(units);
  const atCap = units.length >= MAX_CUSTOM_GUARD_UNITS;
  const remaining = MAX_CUSTOM_GUARD_UNITS - units.length;
  const packFaction = guard?.packFaction;
  const levelArmyPacks = guard?.levelArmy === "packs";
  const showFactionRow =
    (armyMode && (armyUsesPacks(units) || units.length === 0)) || (levelMode && levelArmyPacks);
  const packOptions = packUnitOptions(packFaction);

  const setUnits = (next: string[], nextFaction = packFaction) => {
    if (next.length === 0) {
      onChange({
        units: [],
        ...(nextFaction ? { packFaction: nextFaction } : {})
      });
      return;
    }
    onChange({
      units: next.slice(0, MAX_CUSTOM_GUARD_UNITS),
      ...(nextFaction ? { packFaction: nextFaction } : {})
    });
  };

  const setLevel = (level: number, asPacks: boolean, faction?: FactionId | "random") => {
    onChange({
      level,
      ...(asPacks ? { levelArmy: "packs" as const } : {}),
      ...(asPacks && faction ? { packFaction: faction } : {})
    });
  };

  const setPackFaction = (next: FactionId | "random" | undefined) => {
    if (armyMode) {
      setUnits(units, next);
      return;
    }
    if (levelMode && guard?.level) {
      setLevel(guard.level, levelArmyPacks, next);
    }
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
          const active = levelMode && guard?.level === level;
          return (
            <button
              aria-pressed={active}
              className={`popoverGuardChip${active ? " active" : ""}`}
              key={level}
              onClick={() => setLevel(level, levelArmyPacks, packFaction)}
              title={`Field Difficulty ${ROMAN_NUMERALS[level]} — table composition of Neutrals or Packs.`}
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
              onChange({ units: [], ...(packFaction ? { packFaction } : {}) });
            }
          }}
          title="Field an exact army: Neutrals, Pack of Tier N, and/or named units."
          type="button"
        >
          Exact army
        </button>
      </div>

      {levelMode ? (
        <div className="popoverGuardArmy" role="group" aria-label="Level army type">
          <div className="popoverSectionLabel" style={{ marginTop: 4 }}>
            Level {ROMAN_NUMERALS[guard!.level!]} mints as
          </div>
          <div className="popoverGuardQuickRow">
            <button
              aria-pressed={!levelArmyPacks}
              className={`popoverGuardChip${!levelArmyPacks ? " active" : ""}`}
              onClick={() => setLevel(guard!.level!, false)}
              title="Classic: draw Neutrals from the Field Difficulty table."
              type="button"
            >
              Neutrals
            </button>
            <button
              aria-pressed={levelArmyPacks}
              className={`popoverGuardChip${levelArmyPacks ? " active" : ""}`}
              onClick={() => setLevel(guard!.level!, true, packFaction)}
              title="Real Pack units of those tiers (table body counts), not Neutrals."
              type="button"
            >
              Packs of those tiers
            </button>
          </div>
          <small className="popoverHint">
            {levelArmyPacks
              ? "Fight mints real faction Pack cards matching the difficulty table counts (units, not Neutrals)."
              : "Classic Neutral deck draw for this Field Difficulty."}
          </small>
        </div>
      ) : null}

      {armyMode ? (
        <div className="popoverGuardArmy">
          <div className="popoverGuardQuickRow" role="group" aria-label="Add random Neutral of tier">
            {RANDOM_NEUTRAL_QUICK.map(({ slot, label, tier }) => (
              <button
                className="popoverGuardChip popoverGuardQuickChip"
                disabled={atCap}
                key={slot}
                onClick={() => {
                  if (atCap) return;
                  setUnits([...units, slot]);
                }}
                title={`Add a random ${tier} Neutral (rolled at fight time).`}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="popoverGuardQuickRow" role="group" aria-label="Add Pack of tier">
            {RANDOM_PACK_QUICK.map(({ slot, label, tier }) => (
              <button
                className="popoverGuardChip popoverGuardQuickChip"
                disabled={atCap}
                key={slot}
                onClick={() => {
                  if (atCap) return;
                  setUnits([...units, slot]);
                }}
                title={`Add a random Pack of Tier ${tier} (faction unit card, rolled at fight time).`}
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
              No units yet — add Pack of Tier I–IV, random Neutrals, or a named unit (up to{" "}
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
              {packOptions.map((group) => (
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
              {describeGuardArmyGrouped(units)}
              {packFaction === "random"
                ? " · random faction packs"
                : packFaction
                  ? ` · ${packFaction} packs`
                  : ""}{" "}
              · counts as difficulty {ROMAN_NUMERALS[customGuardArmyDifficulty(units)]} (experience); Quick
              Combat never skips an exact army.
            </small>
          ) : null}
        </div>
      ) : null}

      {showFactionRow ? (
        <div className="popoverGuardArmy" role="group" aria-label="Pack faction">
          <div className="popoverSectionLabel">Pack faction</div>
          <div className="popoverGuardQuickRow" style={{ flexWrap: "wrap" }}>
            <button
              aria-pressed={!packFaction}
              className={`popoverGuardChip${!packFaction ? " active" : ""}`}
              onClick={() => setPackFaction(undefined)}
              title="Packs may mix factions freely."
              type="button"
            >
              Any
            </button>
            <button
              aria-pressed={packFaction === "random"}
              className={`popoverGuardChip${packFaction === "random" ? " active" : ""}`}
              onClick={() => setPackFaction("random")}
              title="Roll one playable faction once per fight; all Packs share it."
              type="button"
            >
              Random faction
            </button>
            {PACK_FACTIONS.map(({ id, label }) => (
              <button
                aria-pressed={packFaction === id}
                className={`popoverGuardChip${packFaction === id ? " active" : ""}`}
                key={id}
                onClick={() => setPackFaction(id)}
                title={`All Packs are ${label} units.`}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <small className="popoverHint">
            All Packs share one faction (or roll one at fight). Neutrals stay free.
          </small>
        </div>
      ) : null}
    </div>
  );
}

void RANDOM_GUARD_TIERS;
