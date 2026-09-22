"use client";

import { useEffect, useRef, useState } from "react";
import { assetUrl } from "@/lib/asset-url";

/**
 * Shared designer guard editor — level Ⅰ–Ⅶ (Neutrals OR Packs of those tiers),
 * or an exact army of random-tier Neutrals, random-pack/few-of-tier, named
 * Neutrals, and faction Packs / Fews. Optional packFaction locks every Pack/Few
 * body to one faction (or rolls one at fight time).
 *
 * Data model stays slot-based (`units: string[]` + level/levelArmy/packFaction)
 * so sanitize / fight resolve stay byte-compatible with legacy maps.
 */

import { coreUnitDefinitions } from "@/data/factions/units";
import {
  customGuardArmyDifficulty,
  groupGuardUnitEntries,
  guardUnitEntryLabel,
  isAnyFewGuardSlot,
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
  { tier: "bronze", slot: "random:bronze", label: "+ Random bronze creature" },
  { tier: "silver", slot: "random:silver", label: "+ Random silver creature" },
  { tier: "gold", slot: "random:gold", label: "+ Random gold creature" },
  { tier: "azure", slot: "random:azure", label: "+ Random azure creature" }
];

// Only tiers that actually HAVE Pack units are offered (no faction ships an
// azure Pack today, so "+ Pack IV" would mint a Neutral-fallback body — if a
// future azure Pack appears in the unit data the chip returns by itself).
const RANDOM_PACK_QUICK: { tier: RandomGuardTier; slot: string; label: string }[] = [
  { tier: "bronze" as const, slot: "random-pack:bronze", label: "+ Pack I" },
  { tier: "silver" as const, slot: "random-pack:silver", label: "+ Pack II" },
  { tier: "gold" as const, slot: "random-pack:gold", label: "+ Pack III" },
  { tier: "azure" as const, slot: "random-pack:azure", label: "+ Pack IV" }
].filter(({ tier }) => Object.values(coreUnitDefinitions).some((def) => def.pack && def.tier === tier));

// Same for Few (most recruitable units have a Few side; azure still rarely).
const RANDOM_FEW_QUICK: { tier: RandomGuardTier; slot: string; label: string }[] = [
  { tier: "bronze" as const, slot: "random-few:bronze", label: "+ Few I" },
  { tier: "silver" as const, slot: "random-few:silver", label: "+ Few II" },
  { tier: "gold" as const, slot: "random-few:gold", label: "+ Few III" },
  { tier: "azure" as const, slot: "random-few:azure", label: "+ Few IV" }
].filter(({ tier }) => Object.values(coreUnitDefinitions).some((def) => def.few && def.tier === tier));

const RANDOM_TOWN_RANKS_II_VI = [
  "town-rank:2:pack",
  "town-rank:3:pack",
  "town-rank:4:pack",
  "town-rank:5:pack",
  "town-rank:6:few"
] as const;

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

/** Factions that have at least one Pack or Few unit (for the faction lock chips). */
const PACK_FACTIONS: { id: FactionId; label: string }[] = (() => {
  const seen = new Map<string, string>();
  for (const def of Object.values(coreUnitDefinitions)) {
    if ((!def.pack && !def.few) || seen.has(def.faction)) continue;
    // Prefer a readable faction name from the first pack/few unit's faction id.
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

function fewUnitOptions(factionFilter: FactionId | "random" | undefined): {
  tier: (typeof GUARD_TIER_ORDER)[number];
  units: { id: string; label: string }[];
}[] {
  const concrete = factionFilter && factionFilter !== "random" ? factionFilter : null;
  return GUARD_TIER_ORDER.map((tier) => ({
    tier,
    units: Object.values(coreUnitDefinitions)
      .filter((def) => def.few && def.tier === tier && (!concrete || def.faction === concrete))
      .map((def) => ({ id: `few:${def.id}`, label: `Few of ${def.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })).filter((group) => group.units.length > 0);
}

function armyUsesPacks(units: string[]): boolean {
  return units.some((id) => isAnyPackGuardSlot(id) || isAnyFewGuardSlot(id));
}

function grailDefenderArt(id: string): string | undefined {
  const side: "pack" | "few" | "neutral" = id.startsWith("pack:") ? "pack" : id.startsWith("few:") ? "few" : "neutral";
  const unitId = side === "neutral" ? id : id.slice(side.length + 1);
  return coreUnitDefinitions[unitId]?.[side]?.cardImage;
}

const GRAIL_UNIT_OPTIONS = [
  ...RANDOM_NEUTRAL_QUICK.map(({ slot, tier }) => ({ id: slot, label: `Random ${tier} Neutral`, group: "Random Neutrals" })),
  ...RANDOM_PACK_QUICK.map(({ slot, tier }) => ({ id: slot, label: `Pack of random ${tier} unit`, group: "Faction units" })),
  ...RANDOM_FEW_QUICK.map(({ slot, tier }) => ({ id: slot, label: `Few of random ${tier} unit`, group: "Faction units" })),
  ...GUARD_LEVELS.flatMap((rank) => (["pack", "few"] as const).map((side) => {
    const id = `town-rank:${rank}:${side}`;
    return { id, label: guardUnitEntryLabel(id), group: "One random Town faction" };
  })),
  ...GUARD_UNIT_OPTIONS.flatMap(({ tier, units }) => units.map(({ id, label }) => ({ id, label, group: `Neutral · ${GUARD_TIER_LABELS[tier]}` }))),
  ...fewUnitOptions(undefined).flatMap(({ tier, units }) => units.map(({ id, label }) => ({ id, label, group: `Named Few · ${GUARD_TIER_LABELS[tier]}` }))),
  ...packUnitOptions(undefined).flatMap(({ tier, units }) => units.map(({ id, label }) => ({ id, label, group: `Named Packs · ${GUARD_TIER_LABELS[tier]}` })))
];

function GuardUnitPicker({ value, onPick, faction, label }: {
  value?: string;
  onPick: (id: string) => void;
  faction?: FactionId | "random";
  label: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDetailsElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        pickerRef.current.open = false;
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const categories = [...new Set(GRAIL_UNIT_OPTIONS.map((option) => option.group))];
  const query = search.trim().toLocaleLowerCase();
  const options = GRAIL_UNIT_OPTIONS.filter((option) => {
    if (category !== "all" && option.group !== category) return false;
    const unitId = option.id.startsWith("pack:") || option.id.startsWith("few:")
      ? option.id.slice(option.id.indexOf(":") + 1) : option.id;
    const unitFaction = coreUnitDefinitions[unitId]?.faction ?? "";
    if (query && !`${option.label} ${option.group} ${unitFaction}`.toLocaleLowerCase().includes(query)) return false;
    if (faction && faction !== "random" && (option.id.startsWith("pack:") || option.id.startsWith("few:"))) {
      const def = coreUnitDefinitions[option.id.slice(option.id.indexOf(":") + 1)];
      if (def?.faction !== faction && option.id !== value) return false;
    }
    return true;
  });
  const selectedLabel = value ? GRAIL_UNIT_OPTIONS.find((option) => option.id === value)?.label ?? guardUnitEntryLabel(value) : label;
  const selectedArt = value ? grailDefenderArt(value) : undefined;
  return (
    <details className="guardUnitPicker" ref={pickerRef} onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (pickerRef.current) pickerRef.current.open = false;
        setOpen(false);
        pickerRef.current?.querySelector("summary")?.focus();
      }
    }} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary aria-label={label}>
        {selectedArt ? <img alt="" height={27} src={assetUrl(selectedArt)} width={25} /> : <span aria-hidden="true">{value?.startsWith("town-rank:") ? "🏰" : "⚔"}</span>}
        <span className="guardUnitPickerLabel">{selectedLabel}</span><span aria-hidden="true">⌄</span>
      </summary>
      <div className="guardUnitPickerMenu">
        <input aria-label="Find guard unit" onChange={(event) => setSearch(event.target.value)} placeholder="Find unit, tier, or faction…" ref={searchRef} type="search" value={search} />
        <select aria-label="Filter guard units" onChange={(event) => setCategory(event.target.value)} value={category}>
          <option value="all">All kinds</option>
          {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </select>
        <div className="guardUnitPickerChoices">
          {options.length ? options.map((option) => {
            const art = grailDefenderArt(option.id);
            const unitId = option.id.startsWith("pack:") || option.id.startsWith("few:")
              ? option.id.slice(option.id.indexOf(":") + 1) : option.id;
            const unitFaction = coreUnitDefinitions[unitId]?.faction;
            return <button key={option.id} onClick={() => {
              onPick(option.id);
              if (pickerRef.current) pickerRef.current.open = false;
              setOpen(false);
              setSearch("");
            }} type="button">
              {art ? <img alt="" height={28} src={assetUrl(art)} width={25} /> : <span aria-hidden="true">{option.id.startsWith("town-rank:") ? "🏰" : "⚔"}</span>}
              <span>{option.label}<small>{option.group}{unitFaction ? ` · ${unitFaction.replaceAll("_", " ")}` : ""}</small></span>
            </button>;
          }) : <small className="popoverHint">No matching units.</small>}
        </div>
      </div>
    </details>
  );
}

function GuardArmyTable({ guard, onChange, emptyMeansDefault = false }: {
  guard: CustomGuardSpec;
  onChange: (guard: CustomGuardSpec | undefined) => void;
  emptyMeansDefault?: boolean;
}) {
  const units = guard.units ?? [];
  const groups = groupGuardUnitEntries(units);
  const maxUnits = units.every((id) => /^town-rank:[1-7]:(few|pack)$/.test(id)) && units.length > 0 ? 7 : MAX_CUSTOM_GUARD_UNITS;
  const changeUnits = (next: string[], faction = guard.packFaction) => {
    if (!next.length && emptyMeansDefault) return onChange(undefined);
    const cap = next.length > 0 && next.every((id) => /^town-rank:[1-7]:(few|pack)$/.test(id)) ? 7 : MAX_CUSTOM_GUARD_UNITS;
    onChange({ units: next.slice(0, cap), ...(faction ? { packFaction: faction } : {}) });
  };
  const changeGroup = (index: number, id: string, count: number) => changeUnits(groups.flatMap((group, groupIndex) =>
    Array.from({ length: groupIndex === index ? count : group.count }, () => groupIndex === index ? id : group.id)
  ));
  return <div className="guardArmyTable" role="group" aria-label="Exact guard army">
    <div className="guardArmyTableRows" role="list" aria-label="Defenders">
      {groups.map(({ id, count }, index) => <div className="guardArmyTableRow" key={`${id}-${index}`} role="listitem">
        <GuardUnitPicker faction={guard.packFaction} label={`Defender ${index + 1}`} onPick={(nextId) => changeGroup(index, nextId, count)} value={id} />
        <label className="guardArmyTableCount"><span>×</span><select aria-label={`${guardUnitEntryLabel(id)} count`} onChange={(event) => changeGroup(index, id, Number(event.target.value))} value={count}>
          {Array.from({ length: maxUnits - units.length + count }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select></label>
        <button aria-label={`Remove ${guardUnitEntryLabel(id)}`} className="guardArmyTableRemove" onClick={() => changeGroup(index, id, 0)} type="button">×</button>
      </div>)}
    </div>
    {units.length < maxUnits ? <GuardUnitPicker faction={guard.packFaction} label="Add defender" onPick={(id) => changeUnits([...units, id])} /> : null}
    {!units.length ? <small className="popoverHint">Choose a defender to start the army.</small> :
      <small className="popoverHint">{units.length}/{maxUnits} defenders · difficulty {ROMAN_NUMERALS[customGuardArmyDifficulty(units)]} for experience</small>}
    {armyUsesPacks(units) ? <label className="guardArmyTableFaction"><span>Pack/Few faction</span><select aria-label="Guard army faction" onChange={(event) => {
      const faction = event.target.value === "any" ? undefined : event.target.value as FactionId | "random";
      const next = faction && faction !== "random" ? units.map((id) => {
        const side = id.startsWith("pack:") ? "pack" : id.startsWith("few:") ? "few" : null;
        if (!side) return id;
        const def = coreUnitDefinitions[id.slice(side.length + 1)];
        return def && def.faction !== faction ? `random-${side}:${def.tier}` : id;
      }) : units;
      onChange({ units: next, ...(faction ? { packFaction: faction } : {}) });
    }} value={guard.packFaction ?? "any"}>
      <option value="any">Any faction</option><option value="random">One random faction</option>
      {PACK_FACTIONS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
    </select></label> : null}
  </div>;
}

/** The hidden Grail rule needs one direct army control, not the full map-object toolbox. */
export function GrailGuardEditor({ guard, onChange }: {
  guard: CustomGuardSpec | undefined;
  onChange: (guard: CustomGuardSpec | undefined) => void;
}) {
  const mode = guard?.units ? "army" : guard?.level ? "level" : "default";
  return (
    <div className="grailGuardEditor" role="group" aria-label="Grail and Utopia guards">
      <label className="grailGuardField">
        <span>Guard</span>
        <select aria-label="Grail guard mode" value={mode} onChange={(event) => {
          if (event.target.value === "default") onChange(undefined);
          else if (event.target.value === "level") onChange({ level: 7 });
          else if (event.target.value === "town") onChange({ units: [...RANDOM_TOWN_RANKS_II_VI], packFaction: "random" });
          else onChange({ units: guard?.units?.length ? guard.units : ["neutral.black_dragons", "random:azure", "random:azure"] });
        }}>
          <option value="default">Default · Black Dragon + 2 Azure</option>
          <option value="level">Field Difficulty level</option>
          <option value="army">Custom defenders</option>
          <option value="town">Use Random Town ranks II–VI</option>
        </select>
      </label>
      {mode === "level" ? (
        <div className="grailGuardLine">
          <label className="grailGuardField"><span>Difficulty</span>
            <select aria-label="Grail guard difficulty" value={guard!.level} onChange={(event) => onChange({ ...guard, level: Number(event.target.value) })}>
              {GUARD_LEVELS.map((level) => <option key={level} value={level}>{ROMAN_NUMERALS[level]}</option>)}
            </select>
          </label>
          <label className="grailGuardField"><span>Army</span>
            <select aria-label="Grail level army type" value={guard?.levelArmy === "packs" ? "packs" : "neutrals"} onChange={(event) => onChange({ level: guard!.level, ...(event.target.value === "packs" ? { levelArmy: "packs", ...(guard?.packFaction ? { packFaction: guard.packFaction } : {}) } : {}) })}>
              <option value="neutrals">Neutrals</option><option value="packs">Faction Packs</option>
            </select>
          </label>
        </div>
      ) : null}
      {mode === "army" && guard ? <GuardArmyTable emptyMeansDefault guard={guard} onChange={onChange} /> : null}
      {mode === "level" && guard?.levelArmy === "packs" ? (
        <label className="grailGuardField"><span>Pack/Few faction</span>
          <select aria-label="Grail guard faction" value={guard?.packFaction ?? "any"} onChange={(event) => {
            const faction = event.target.value === "any" ? undefined : event.target.value as FactionId | "random";
            onChange({ level: guard!.level, levelArmy: "packs", ...(faction ? { packFaction: faction } : {}) });
          }}>
            <option value="any">Any faction</option><option value="random">One random faction</option>
            {PACK_FACTIONS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
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
  const packFaction = guard?.packFaction;
  const levelArmyPacks = guard?.levelArmy === "packs";

  const setLevel = (level: number, asPacks: boolean, faction?: FactionId | "random") => {
    onChange({
      level,
      ...(asPacks ? { levelArmy: "packs" as const } : {}),
      ...(asPacks && faction ? { packFaction: faction } : {})
    });
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

      {armyMode && guard ? <GuardArmyTable guard={guard} onChange={onChange} /> : null}

      {levelMode && levelArmyPacks ? <label className="guardArmyTableFaction"><span>Pack faction</span>
        <select aria-label="Level guard faction" onChange={(event) => {
          const faction = event.target.value === "any" ? undefined : event.target.value as FactionId | "random";
          setLevel(guard!.level!, true, faction);
        }} value={packFaction ?? "any"}>
          <option value="any">Any faction</option><option value="random">One random faction</option>
          {PACK_FACTIONS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label> : null}
    </div>
  );
}

void RANDOM_GUARD_TIERS;
