/**
 * Unit Experience rank rewards — each of the 4 ranks is EITHER stats OR one
 * ability (a signature rank may be a hybrid of both).
 *
 * RESOLUTION (the whole design, `rankScheduleFor` below): per rank,
 *   (i)  an explicit per-unit OVERRIDE (the signature ranks), else
 *   (ii) the FLAVOUR GENERATOR — a diversified small R1, themed R2/R3 and a
 *        capstone R4 rotated per unit off `stableRankHash`.
 * There is no third tier. Gold units do NOT get a higher ability budget — only
 * slower XP thresholds.
 *
 * `docs/unit-experience-balance-sheet.md` is the DESIGN AUTHORITY: regenerate it
 * with `npx tsx scripts/generate-unit-experience-balance-sheet.ts` after any
 * change here and read the diff as the review.
 *
 * CLAUDE.md §2: every ability id is already-implemented.
 */

import type { UnitTier } from "@/data/factions/types";
import { coreUnitDefinitions } from "@/data/factions/units";

export type RankStep =
  | { kind: "stats"; stats?: UnitRankStatBonus }
  | { kind: "ability"; choices: readonly string[] }
  | { kind: "hybrid"; stats: UnitRankStatBonus; choices: readonly string[] };

export type RankSchedule = {
  readonly 1: RankStep;
  readonly 2: RankStep;
  readonly 3: RankStep;
  readonly 4: RankStep;
};

export type UnitRankStatBonus = {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
};

const Z: UnitRankStatBonus = { attack: 0, defense: 0, health: 0, initiative: 0 };

/** Same 3-step budget every tier — gold is Attack-first, not larger. */
export const UNIT_STAT_STEPS: Record<UnitTier, readonly UnitRankStatBonus[]> = {
  bronze: [
    { ...Z, defense: 1 },
    { ...Z, attack: 1 },
    { ...Z, health: 1, initiative: 1 }
  ],
  silver: [
    { ...Z, defense: 1 },
    { ...Z, attack: 1 },
    { ...Z, health: 1 }
  ],
  gold: [
    { ...Z, attack: 1 },
    { ...Z, defense: 1 },
    { ...Z, health: 1 }
  ],
  azure: [
    { ...Z, attack: 1 },
    { ...Z, defense: 1 },
    { ...Z, health: 1 }
  ]
};

function S(stats?: UnitRankStatBonus): RankStep {
  return stats ? { kind: "stats", stats } : { kind: "stats" };
}
function A(...choices: string[]): RankStep {
  return { kind: "ability", choices };
}
function H(stats: UnitRankStatBonus, ...choices: string[]): RankStep {
  return { kind: "hybrid", stats, choices };
}

export function scheduleAbilityCount(schedule: RankSchedule): number {
  let n = 0;
  for (const r of [1, 2, 3, 4] as const) {
    if (schedule[r].kind === "ability" || schedule[r].kind === "hybrid") n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// The flavour generator — the ONLY fallback under the redesign
//
// DELETED HERE (2026-08-15), deliberately and for good: the hand-authored
// `UNIT_RANK_SCHEDULES` table (127 lore-keyed entries), the `RANK_TEMPLATES` /
// `RANK_TEMPLATE_LABELS` / `buildScheduleFromTemplate` / `scheduleTemplateId`
// machinery that filled it, and the older `FLAVOUR_ABILITIES` template-fill map.
// The redesign in commit 26f6e37f / 2d2da234 REPLACED all of it with
// "explicit per-unit override > flavour generator", and
// `docs/unit-experience-balance-sheet.md` is the design authority for what every
// unit's four ranks pay. A later audit mistook the table for live data and
// re-plugged it into the resolver, silently changing 127 units' rewards; it is
// gone now so that cannot recur. Do NOT reintroduce a bespoke schedule table —
// a unit that needs a signature rank gets an explicit override below.
// ---------------------------------------------------------------------------

type Flavour =
  | "melee"
  | "ranged"
  | "flying"
  | "cavalry"
  | "undead"
  | "fire"
  | "beast"
  | "dragon"
  | "elemental"
  | "machine"
  | "mystic"
  | "assassin"
  | "warden";

export function inferFlavour(unitDefId: string): Flavour {
  const def = coreUnitDefinitions[unitDefId];
  if (!def) return "melee";
  const faction = unitDefId.split(".")[0] ?? "";
  const name = def.name.toLowerCase();
  const type = def.type;
  if (name.includes("dragon")) return "dragon";
  // Imperium roles need explicit advancement identities. Without these names,
  // support infantry and armoured vehicles fall through to the generic melee
  // track even though their printed battlefield roles are very different.
  if (name.includes("apothecary")) return "mystic";
  if (name.includes("rhino") || name.includes("titan")) return "machine";
  if (name.includes("terminator")) return "warden";
  if (faction === "necropolis" || name.includes("skeleton") || name.includes("zombie") || name.includes("wraith") || name.includes("vampire") || name.includes("lich") || name.includes("mummy")) {
    return "undead";
  }
  if (faction === "inferno" || name.includes("efreet") || name.includes("devil") || name.includes("demon") || name.includes("magog") || name.includes("familiar") || name.includes("cerber")) {
    return "fire";
  }
  if (name.includes("golem") || name.includes("automaton") || name.includes("dreadnought") || name.includes("gargoyle")) {
    return "machine";
  }
  if (name.includes("elemental") || faction === "conflux") return "elemental";
  if (name.includes("assassin") || name.includes("harpy") || name.includes("rogue") || name.includes("ayssid")) {
    return "assassin";
  }
  if (
    name.includes("champion") ||
    name.includes("cavalier") ||
    name.includes("rider") ||
    name.includes("crusader") ||
    name.includes("wolf") ||
    name.includes("unicorn") ||
    name.includes("saber")
  ) {
    return "cavalry";
  }
  if (
    name.includes("behemoth") ||
    name.includes("hydra") ||
    name.includes("basilisk") ||
    name.includes("gorgon") ||
    name.includes("wyvern") ||
    name.includes("manticore") ||
    name.includes("mammoth") ||
    name.includes("berserker") ||
    name.includes("troll") ||
    name.includes("boar")
  ) {
    return "beast";
  }
  if (
    name.includes("mage") ||
    name.includes("magi") ||
    name.includes("genie") ||
    name.includes("zealot") ||
    name.includes("shaman") ||
    name.includes("caster") ||
    name.includes("sorcer") ||
    name.includes("enchanter") ||
    name.includes("master")
  ) {
    return "mystic";
  }
  if (
    name.includes("dendroid") ||
    name.includes("dwarf") ||
    name.includes("ogre") ||
    name.includes("protector") ||
    name.includes("guardian") ||
    name.includes("armadillo") ||
    name.includes("nix")
  ) {
    return "warden";
  }
  if (type === "ranged") return "ranged";
  if (type === "flying") return "flying";
  return "melee";
}

type RankOneProfile = "defense" | "health" | "initiative" | "own-attack" | "retaliation" | "guarded";

const FLAT_DEFENSE_RANK_ONE_UNITS = new Set([
  "stronghold.wolf_raiders",
  "fuyuki.riders",
  "azure_breeze.spirit_crane",
  "hidden_leaf.anbu",
  "azur_lane.javelin",
  "heavenly_demon.bone_reavers",
  "little_busters.haruka",
  "mgq.miyabi",
  "mgq.hild",
  "mgq.pochi",
  "conflux.ice_elementals",
  "dungeon.minotaurs",
  "necropolis.wraiths",
  "inferno.demons",
  "tower.genies",
  "rampart.dendroids",
  "castle.marksmen",
  "fortress.gnolls",
  "wog.ghost",
  "doom.former_human",
  "doom.cacodemon"
]);

function stableRankHash(value: string, salt = 0): number {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const RANK_ONE_PROFILES: Record<Flavour, readonly RankOneProfile[]> = {
  melee: ["health", "own-attack", "retaliation", "guarded"],
  ranged: ["initiative", "own-attack", "health", "guarded"],
  flying: ["initiative", "own-attack", "health", "retaliation"],
  cavalry: ["initiative", "own-attack", "retaliation", "health"],
  undead: ["health", "retaliation", "guarded", "own-attack"],
  fire: ["own-attack", "health", "retaliation", "initiative"],
  beast: ["health", "guarded", "retaliation", "own-attack"],
  dragon: ["health", "initiative", "guarded", "own-attack"],
  elemental: ["health", "initiative", "guarded", "own-attack"],
  machine: ["health", "guarded", "retaliation", "initiative"],
  mystic: ["initiative", "health", "own-attack", "guarded"],
  assassin: ["initiative", "own-attack", "retaliation", "health"],
  warden: ["health", "guarded", "retaliation", "initiative"]
};

export function rankOneProfileFor(unitDefId: string): RankOneProfile {
  if (unitDefId === "fortress.gorgons") return "initiative";
  if (FLAT_DEFENSE_RANK_ONE_UNITS.has(unitDefId)) return "defense";
  const profiles = RANK_ONE_PROFILES[inferFlavour(unitDefId)];
  return profiles[stableRankHash(unitDefId, 1) % profiles.length]!;
}

/** Unit-aware, one-point stat packages. Defense 3 is never increased. */
export function unitStatStepsFor(
  unitDefId: string,
  tier: UnitTier
): readonly UnitRankStatBonus[] {
  const def = coreUnitDefinitions[unitDefId];
  const printedDefense = Math.max(
    def?.few?.defense ?? 0,
    def?.pack?.defense ?? 0,
    def?.neutral?.defense ?? 0
  );
  const profile = rankOneProfileFor(unitDefId);
  const flavour = inferFlavour(unitDefId);
  const logicalDefault: Record<Flavour, keyof UnitRankStatBonus> = {
    melee: "attack", ranged: "attack", flying: "initiative", cavalry: "initiative",
    undead: "health", fire: "attack", beast: "health", dragon: "health",
    elemental: "initiative", machine: "health", mystic: "initiative",
    assassin: "initiative", warden: "health"
  };
  const defenseCapFallback: keyof UnitRankStatBonus =
    ["flying", "cavalry", "assassin", "mystic"].includes(flavour) ? "initiative" : "health";
  const first = profile === "defense" && printedDefense >= 3
    ? defenseCapFallback
    : ["defense", "health", "initiative"].includes(profile)
    ? (profile as keyof UnitRankStatBonus)
    : logicalDefault[flavour];
  const tierOrder: Record<UnitTier, readonly (keyof UnitRankStatBonus)[]> = {
    bronze: ["defense", "attack", "health", "initiative"],
    silver: ["defense", "attack", "health", "initiative"],
    gold: ["attack", "health", "initiative", "defense"],
    azure: ["attack", "health", "initiative", "defense"]
  };
  const order = [first, ...tierOrder[tier]]
    .filter((stat, index, all) => all.indexOf(stat) === index)
    .filter((stat) => stat !== "defense" || printedDefense < 3)
    .slice(0, 3);
  return order.map((stat) => ({ ...Z, [stat]: 1 }));
}

const RANK_TWO_ABILITIES: Record<Flavour, readonly string[]> = {
  melee: ["veteran-attack-when-attacking", "veteran-guarded-stance", "commander-charge", "wog-no-negative-attack-roll"],
  ranged: ["veteran-steady-aim", "bulwark-air-shield", "attack-roll-advantage-passive", "ranged-extra-shot-on-low-roll"],
  flying: ["bulwark-air-shield", "veteran-attack-when-attacking", "reduce-spell-damage-1", "commander-charge"],
  cavalry: ["commander-charge", "veteran-retaliation-fury", "veteran-attack-when-attacking", "wog-no-negative-attack-roll"],
  undead: ["zombie-resilience-weak", "veteran-retaliation-fury", "wraith-heal-1", "veteran-guarded-stance"],
  fire: ["wog-fire-shield-1", "veteran-attack-when-attacking", "reduce-spell-damage-1", "wog-no-negative-attack-roll"],
  beast: ["veteran-guarded-stance", "wog-no-negative-attack-roll", "commander-charge", "wog-nightmare-fear"],
  dragon: ["reduce-spell-damage-1", "veteran-guarded-stance", "bulwark-air-shield", "wog-fire-shield-1"],
  elemental: ["reduce-spell-damage-1", "bulwark-air-shield", "veteran-guarded-stance", "wog-fire-shield-1"],
  machine: ["veteran-guarded-stance", "reduce-spell-damage-1", "commander-defense-token", "veteran-retaliation-fury"],
  mystic: ["reduce-spell-damage-1", "bulwark-air-shield", "veteran-steady-aim", "wraith-heal-1"],
  assassin: ["veteran-steady-aim", "commander-charge", "ignores-retaliation", "veteran-attack-when-attacking"],
  warden: ["veteran-guarded-stance", "commander-defense-token", "veteran-retaliation-fury", "reduce-spell-damage-1"]
};

// NOTE (2026-08-15): the ranged-gated `double-attack` / `double-attack-low-roll`
// arms are NEVER offered to a non-shooter — a DOUBLE_ATTACK without `anyRange`
// is refused by maybeDeclareDoubleAttack unless the attack is ranged, so it paid
// a whole rank for nothing. The veteran twins
// (`veteran-double-attack`, `veteran-double-attack-low-roll`) carry anyRange.
// Invariant pinned in unit-experience.test.ts.
const RANK_THREE_ABILITIES: Record<Flavour, readonly string[]> = {
  melee: ["veteran-defense-pierce", "commander-max-damage", "unlimited-retaliation", "ignores-retaliation"],
  ranged: ["ignore-all-combat-penalties", "veteran-low-roll-insight", "ranged-extra-shot-on-low-roll", "veteran-defense-pierce"],
  flying: ["veteran-speed-hunter", "teleport-move", "ignores-retaliation", "veteran-soul-feast"],
  cavalry: ["veteran-speed-hunter", "commander-max-damage", "ignores-retaliation", "veteran-double-attack-low-roll"],
  undead: ["veteran-rebirth", "veteran-soul-feast", "wraith-heal-2", "wraith-enemy-discard"],
  fire: ["wog-fire-shield-1", "commander-max-damage", "ignores-retaliation", "veteran-double-attack-low-roll"],
  beast: ["wog-nightmare-fear", "wraith-heal-2", "veteran-defense-pierce", "veteran-rebirth"],
  dragon: ["veteran-speed-hunter", "wraith-heal-2", "wog-fire-shield-1", "veteran-soul-feast"],
  elemental: ["veteran-spell-sunder", "teleport-move", "wog-fire-shield-1", "reduce-spell-damage-1"],
  machine: ["commander-defense-token", "unlimited-retaliation", "veteran-defense-pierce", "reduce-spell-damage-1"],
  mystic: ["veteran-spell-sunder", "veteran-low-roll-insight", "teleport-move", "wraith-heal-2"],
  assassin: ["ignores-retaliation", "veteran-low-roll-insight", "veteran-double-attack-low-roll", "teleport-move"],
  warden: ["unlimited-retaliation", "wraith-heal-2", "veteran-defense-pierce", "commander-defense-token"]
};

const RANK_FOUR_ABILITIES: Record<Flavour, readonly string[]> = {
  melee: ["veteran-defense-pierce", "veteran-rebirth", "unlimited-retaliation", "commander-max-damage"],
  ranged: ["veteran-low-roll-insight", "veteran-spell-sunder", "ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"],
  flying: ["veteran-speed-hunter", "veteran-soul-feast", "teleport-move", "ignores-retaliation"],
  cavalry: ["veteran-speed-hunter", "veteran-double-attack-low-roll", "commander-max-damage", "ignores-retaliation"],
  undead: ["veteran-rebirth", "veteran-soul-feast", "wraith-heal-2", "wraith-enemy-discard"],
  fire: ["wog-fire-shield-1", "veteran-double-attack-low-roll", "commander-max-damage", "veteran-rebirth"],
  beast: ["wog-nightmare-fear", "veteran-rebirth", "wraith-heal-2", "veteran-defense-pierce"],
  dragon: ["veteran-speed-hunter", "wraith-heal-2", "veteran-soul-feast", "wog-fire-shield-1"],
  elemental: ["veteran-spell-sunder", "teleport-move", "wog-fire-shield-1", "veteran-low-roll-insight"],
  machine: ["unlimited-retaliation", "commander-defense-token", "veteran-defense-pierce", "reduce-spell-damage-1"],
  mystic: ["veteran-spell-sunder", "veteran-low-roll-insight", "wraith-heal-2", "teleport-move"],
  assassin: ["ignores-retaliation", "veteran-double-attack-low-roll", "veteran-low-roll-insight", "teleport-move"],
  warden: ["unlimited-retaliation", "wraith-heal-2", "veteran-defense-pierce", "commander-defense-token"]
};

function rotatedChoices(unitDefId: string, rank: number, pool: readonly string[]): string[] {
  const start = stableRankHash(unitDefId, rank) % pool.length;
  return pool.map((_, index) => pool[(start + index) % pool.length]!);
}

function explicitRankOne(unitDefId: string): RankStep | null {
  if (unitDefId === "fortress.hydras") return A("veteran-fear-aura");
  if (unitDefId === "castle.champions") return A("veteran-moving-pierce");
  return null;
}

function rankOneStepFor(unitDefId: string): RankStep {
  const profile = rankOneProfileFor(unitDefId);
  if (["defense", "health", "initiative"].includes(profile)) return S();
  if (profile === "own-attack") return A("veteran-attack-when-attacking");
  if (profile === "retaliation") return A("veteran-retaliation-fury");
  return A("veteran-guarded-stance");
}

function explicitRankTwo(unitDefId: string): RankStep | null {
  if (unitDefId === "castle.champions") return S({ ...Z, health: 1 });
  if (unitDefId === "little_busters.rins_cats") return A("veteran-soul-feast");
  return null;
}

function explicitRankThree(unitDefId: string): RankStep | null {
  if (unitDefId === "castle.archangels") return A("veteran-layer-draw");
  if (unitDefId === "castle.champions") {
    return H({ ...Z, initiative: 2 }, "veteran-mobility-1");
  }
  if (unitDefId === "stronghold.behemoths") return A("veteran-flying-movement");
  if (unitDefId.endsWith(".black_dragons")) {
    return H({ ...Z, initiative: 2 }, "veteran-speed-hunter");
  }
  if (unitDefId.endsWith(".phoenixes")) return A("veteran-regeneration-2");
  // Reserve Soul Feast for the requested Ghost Dragon capstone instead of
  // accidentally consuming it from the generic dragon pool one rank early.
  if (unitDefId.endsWith(".ghost_dragons")) return S();
  return null;
}

function explicitRankFour(unitDefId: string): RankStep | null {
  if (unitDefId === "castle.crusaders") return A("veteran-double-attack");
  if (unitDefId === "inferno.pit_lords") return A("veteran-defense-pierce");
  if (unitDefId === "inferno.magogs") return S({ ...Z, health: 2 });
  if (unitDefId === "necropolis.dread_knights") return A("reduce-spell-and-specialty-damage-2");
  if (unitDefId === "conflux.sprites") return A("pegasi-magic-damper");
  if (unitDefId.endsWith(".skeletons")) return A("veteran-rebirth");
  if (unitDefId.endsWith(".magi")) return A("veteran-spell-sunder");
  if (unitDefId.endsWith(".unicorns")) return A("veteran-low-roll-insight");
  if (unitDefId.endsWith(".zealots")) return A("veteran-defense-pierce");
  if (unitDefId.endsWith(".ghost_dragons")) return A("veteran-soul-feast");
  return null;
}

/**
 * Resolved schedule: an explicit per-unit override wins that rank, otherwise the
 * flavour generator fills it (diversified small R1, themed R2/R3, capstone R4).
 * There is NO third tier — see the deletion note above.
 */
export function rankScheduleFor(unitDefId: string): RankSchedule {
  const flavour = inferFlavour(unitDefId);
  const rankThree = explicitRankThree(unitDefId) ??
    (stableRankHash(unitDefId, 3) % 3 === 0
      ? A(...rotatedChoices(unitDefId, 3, RANK_THREE_ABILITIES[flavour]))
      : S());
  return {
    1: explicitRankOne(unitDefId) ?? rankOneStepFor(unitDefId),
    2: explicitRankTwo(unitDefId) ?? A(...rotatedChoices(unitDefId, 2, RANK_TWO_ABILITIES[flavour])),
    3: rankThree,
    4: explicitRankFour(unitDefId) ?? A(...rotatedChoices(unitDefId, 4, RANK_FOUR_ABILITIES[flavour]))
  };
}

/**
 * Whether ANY of this unit's four ranks is an explicit per-unit override rather
 * than the generator's roll. Honest under the redesign: it is exactly "does a
 * signature rank exist for this unit", not "is this unit in some table".
 */
export function hasUniqueRankSchedule(unitDefId: string): boolean {
  return Boolean(
    explicitRankOne(unitDefId) ??
      explicitRankTwo(unitDefId) ??
      explicitRankThree(unitDefId) ??
      explicitRankFour(unitDefId)
  );
}

// ---------------------------------------------------------------------------
// UI labels / icons (legacy track ids map to flavour for display)
// ---------------------------------------------------------------------------

export type RankAbilityTrackId = Flavour;

export function rankAbilityTrackFor(unitDefId: string): string {
  return inferFlavour(unitDefId);
}

export const RANK_ABILITY_TRACK_LABELS: Record<string, string> = {
  melee: "Shield wall",
  ranged: "Sharpshooter",
  flying: "Skyrider",
  cavalry: "Shock cavalry",
  undead: "Unholy host",
  fire: "Infernal breed",
  beast: "Apex predator",
  dragon: "Dragon blood",
  elemental: "Elemental core",
  machine: "War machine",
  mystic: "Arcane disciple",
  assassin: "Silent blade",
  warden: "Bulwark",
  // legacy aliases
  melee_line: "Shield wall",
  ranged_line: "Sharpshooter",
  flying_line: "Skyrider",
  cavalry_line: "Shock cavalry",
  undead_line: "Unholy host",
  infernal_line: "Infernal breed",
  beast_line: "Apex predator",
  dragon_line: "Dragon blood",
  elemental_line: "Elemental core",
  mechanical_line: "War machine",
  aquatic_line: "Sea hunter",
  mystic_line: "Arcane disciple",
  assassin_line: "Silent blade",
  warden_line: "Bulwark"
};

export const UNIT_RANK_ABILITY_ICONS: Record<string, string> = {
  "bulwark-thick-hide": "/assets/ui/rank-ability/thick-hide.webp",
  "bulwark-air-shield": "/assets/ui/rank-ability/air-shield.webp",
  "wog-no-negative-attack-roll": "/assets/ui/rank-ability/sure-shot.webp",
  "reduce-spell-damage-1": "/assets/ui/rank-ability/spell-ward.webp",
  "ignore-paralysis": "/assets/ui/rank-ability/unshackled.webp",
  "commander-defense-token": "/assets/ui/rank-ability/guarded.webp",
  "wog-fire-shield-1": "/assets/ui/rank-ability/fire-shield.webp",
  "ignore-all-combat-penalties": "/assets/ui/rank-ability/precision.webp",
  "ignore-combat-penalties": "/assets/ui/rank-ability/precision.webp",
  "ranged-extra-shot-on-low-roll": "/assets/ui/rank-ability/extra-shot.webp",
  "attack-roll-advantage-passive": "/assets/ui/rank-ability/advantage.webp",
  "attack-roll-advantage": "/assets/ui/rank-ability/advantage.webp",
  "commander-charge": "/assets/ui/rank-ability/charge.webp",
  "commander-max-damage": "/assets/ui/rank-ability/max-damage.webp",
  "ignores-retaliation": "/assets/ui/rank-ability/no-retaliation.webp",
  "unlimited-retaliation": "/assets/ui/rank-ability/counterstrike.webp",
  "double-attack": "/assets/ui/rank-ability/double-strike.webp",
  "double-attack-low-roll": "/assets/ui/rank-ability/double-strike.webp",
  "veteran-double-attack-low-roll": "/assets/ui/rank-ability/double-strike.webp",
  "sandworm-strike-again": "/assets/ui/rank-ability/double-strike.webp",
  // Azur Lane bespoke arms (2026-07 upgrade) — Codex-painted naval icons.
  "kansen-full-barrage": "/assets/ui/rank-ability/full-barrage.webp",
  "kansen-fleet-formation": "/assets/ui/rank-ability/fleet-formation.webp",
  "zombie-resilience-weak": "/assets/ui/rank-ability/resilience.webp",
  "zombie-resilience": "/assets/ui/rank-ability/resilience.webp",
  "wraith-heal-1": "/assets/ui/rank-ability/soul-mend.webp",
  "wraith-heal-2": "/assets/ui/rank-ability/regeneration-2.webp",
  "wraith-enemy-discard": "/assets/ui/rank-ability/spell-sunder.webp",
  "wog-nightmare-fear": "/assets/ui/rank-ability/fear.webp",
  "unicorn-paralyze-retaliation": "/assets/ui/rank-ability/paralyzing-gaze.webp",
  "gorgon-death-stare": "/assets/ui/rank-ability/death-stare.webp",
  "gargoyle-spell-ward": "/assets/ui/rank-ability/spell-ward.webp",
  "teleport-move": "/assets/ui/rank-ability/teleport.webp",
  "veteran-attack-when-attacking": "/assets/ui/rank-ability/own-attack.webp",
  "veteran-retaliation-fury": "/assets/ui/rank-ability/retaliation-fury.webp",
  "veteran-guarded-stance": "/assets/ui/rank-ability/guarded-stance.webp",
  "veteran-steady-aim": "/assets/ui/rank-ability/steady-aim.webp",
  "veteran-rebirth": "/assets/ui/rank-ability/rebirth.webp",
  "veteran-spell-sunder": "/assets/ui/rank-ability/spell-sunder.webp",
  "veteran-low-roll-insight": "/assets/ui/rank-ability/low-roll-insight.webp",
  "veteran-defense-pierce": "/assets/ui/rank-ability/defense-pierce.webp",
  "veteran-soul-feast": "/assets/ui/rank-ability/soul-feast.webp",
  "veteran-speed-hunter": "/assets/ui/rank-ability/speed-hunter.webp",
  "veteran-regeneration-2": "/assets/ui/rank-ability/regeneration-2.webp",
  "veteran-flying-movement": "/assets/ui/rank-ability/flying-movement.webp",
  "veteran-fear-aura": "/assets/ui/rank-ability/fear-aura.webp",
  "veteran-layer-draw": "/assets/ui/rank-ability/layer-triumph.webp",
  "veteran-moving-pierce": "/assets/ui/rank-ability/moving-pierce.webp",
  "veteran-mobility-1": "/assets/ui/rank-ability/mobility.webp",
  "veteran-double-attack": "/assets/ui/rank-ability/double-strike.webp",
  "reduce-spell-and-specialty-damage-2": "/assets/ui/rank-ability/arcane-aegis.webp",
  "pegasi-magic-damper": "/assets/ui/rank-ability/spell-dampening.webp"
};

/**
 * Azur Lane's veterancy choices use the shipgirl's own skill emblem. This is
 * keyed by unit definition, not by shared engine ability id: the same rank
 * mechanic can be offered to several ships, but the XP board still shows the
 * correct in-game art for the ship being trained.
 *
 * This unit-level map is the signature/default emblem. The choice-level map
 * below is the authoritative lookup when a schedule offers a specific skill.
 */
export const AZUR_LANE_RANK_ABILITY_ICONS: Record<string, string> = {
  "azur_lane.laffey": "/assets/anime/icons/azur-lane/rank-ability-laffey.webp",
  "azur_lane.javelin": "/assets/anime/icons/azur-lane/rank-ability-javelin.webp",
  "azur_lane.honolulu": "/assets/anime/icons/azur-lane/rank-ability-honolulu.webp",
  "azur_lane.unicorn": "/assets/anime/icons/azur-lane/rank-ability-unicorn.webp",
  "azur_lane.yukikaze": "/assets/anime/icons/azur-lane/rank-ability-yukikaze.webp",
  "azur_lane.prinz_eugen": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen.webp",
  "azur_lane.i19": "/assets/anime/icons/azur-lane/rank-ability-i19.webp",
  "azur_lane.ayanami": "/assets/anime/icons/azur-lane/rank-ability-ayanami.webp",
  "azur_lane.akagi": "/assets/anime/icons/azur-lane/rank-ability-akagi.webp"
};

/**
 * Explicit XP-board art for every Azur Lane schedule choice. The engine ids
 * are intentionally shared with the regular HoMM3-style rank abilities, so a
 * lookup by ability id alone would make (for example) every `commander-charge`
 * choice show the same generic Haste art. Pairing the id with the ship keeps
 * normal card ability art untouched while assigning the actual in-game ship
 * skill emblem to every Azur Lane choice.
 */
export const AZUR_LANE_RANK_ABILITY_ICON_BY_CHOICE: Record<string, string> = {
  "azur_lane.laffey:kansen-full-barrage": "/assets/anime/icons/azur-lane/rank-ability-laffey.webp",
  "azur_lane.laffey:sandworm-strike-again": "/assets/anime/icons/azur-lane/rank-ability-laffey-assault.webp",

  "azur_lane.javelin:commander-max-damage": "/assets/anime/icons/azur-lane/rank-ability-javelin.webp",
  "azur_lane.javelin:bulwark-air-shield": "/assets/anime/icons/azur-lane/rank-ability-javelin-assault.webp",

  "azur_lane.honolulu:ranged-extra-shot-on-low-roll": "/assets/anime/icons/azur-lane/rank-ability-honolulu.webp",
  "azur_lane.honolulu:bulwark-air-shield": "/assets/anime/icons/azur-lane/rank-ability-honolulu-barrage.webp",

  "azur_lane.unicorn:wraith-heal-1": "/assets/anime/icons/azur-lane/rank-ability-unicorn.webp",
  "azur_lane.unicorn:commander-defense-token": "/assets/anime/icons/azur-lane/rank-ability-unicorn-aid.webp",
  "azur_lane.unicorn:kansen-fleet-formation": "/assets/anime/icons/azur-lane/rank-ability-unicorn.webp",
  "azur_lane.unicorn:bulwark-air-shield": "/assets/anime/icons/azur-lane/rank-ability-unicorn-aid.webp",

  "azur_lane.yukikaze:attack-roll-advantage-passive": "/assets/anime/icons/azur-lane/rank-ability-yukikaze.webp",
  "azur_lane.yukikaze:wog-no-negative-attack-roll": "/assets/anime/icons/azur-lane/rank-ability-yukikaze-lucky.webp",
  "azur_lane.yukikaze:commander-charge": "/assets/anime/icons/azur-lane/rank-ability-yukikaze.webp",
  "azur_lane.yukikaze:commander-max-damage": "/assets/anime/icons/azur-lane/rank-ability-yukikaze.webp",

  "azur_lane.prinz_eugen:zombie-resilience": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen.webp",
  "azur_lane.prinz_eugen:reduce-spell-damage-1": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen-shield.webp",
  "azur_lane.prinz_eugen:wog-fire-shield-1": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen.webp",
  "azur_lane.prinz_eugen:ignore-paralysis": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen-shield.webp",

  "azur_lane.i19:commander-max-damage": "/assets/anime/icons/azur-lane/rank-ability-i19.webp",
  "azur_lane.i19:commander-charge": "/assets/anime/icons/azur-lane/rank-ability-i19-torpedoes.webp",
  "azur_lane.i19:wog-nightmare-fear": "/assets/anime/icons/azur-lane/rank-ability-i19.webp",
  "azur_lane.i19:wog-no-negative-attack-roll": "/assets/anime/icons/azur-lane/rank-ability-i19-torpedoes.webp",

  // 2026-09-05 roster expansion. Every choice the resolver offers these two is
  // named explicitly (the ship emblem for the defensive/utility rungs, the
  // signature-skill emblem for the aggressive ones), so nothing falls through
  // to the generic HoMM3 card art on the XP board.
  "azur_lane.ayanami:veteran-guarded-stance": "/assets/anime/icons/azur-lane/rank-ability-ayanami.webp",
  "azur_lane.ayanami:commander-charge": "/assets/anime/icons/azur-lane/rank-ability-ayanami-blade.webp",
  "azur_lane.ayanami:wog-no-negative-attack-roll": "/assets/anime/icons/azur-lane/rank-ability-ayanami.webp",
  "azur_lane.ayanami:veteran-attack-when-attacking": "/assets/anime/icons/azur-lane/rank-ability-ayanami-blade.webp",
  "azur_lane.ayanami:veteran-defense-pierce": "/assets/anime/icons/azur-lane/rank-ability-ayanami-blade.webp",
  "azur_lane.ayanami:veteran-rebirth": "/assets/anime/icons/azur-lane/rank-ability-ayanami.webp",
  "azur_lane.ayanami:unlimited-retaliation": "/assets/anime/icons/azur-lane/rank-ability-ayanami-blade.webp",
  "azur_lane.ayanami:commander-max-damage": "/assets/anime/icons/azur-lane/rank-ability-ayanami-blade.webp",

  "azur_lane.akagi:ranged-extra-shot-on-low-roll": "/assets/anime/icons/azur-lane/rank-ability-akagi-fire.webp",
  "azur_lane.akagi:veteran-steady-aim": "/assets/anime/icons/azur-lane/rank-ability-akagi.webp",
  "azur_lane.akagi:bulwark-air-shield": "/assets/anime/icons/azur-lane/rank-ability-akagi.webp",
  "azur_lane.akagi:attack-roll-advantage-passive": "/assets/anime/icons/azur-lane/rank-ability-akagi.webp",
  "azur_lane.akagi:veteran-spell-sunder": "/assets/anime/icons/azur-lane/rank-ability-akagi-fire.webp",
  "azur_lane.akagi:ignore-all-combat-penalties": "/assets/anime/icons/azur-lane/rank-ability-akagi.webp",
  "azur_lane.akagi:veteran-low-roll-insight": "/assets/anime/icons/azur-lane/rank-ability-akagi-fire.webp"
};

/** Little Busters bespoke veterancy emblems (one researched emblem per line). */
export const LITTLE_BUSTERS_RANK_ABILITY_ICONS: Record<string, string> = {
  "little_busters.haruka": "/assets/anime/icons/little-busters/rank-haruka.webp",
  "little_busters.rins_cats": "/assets/anime/icons/little-busters/rank-rins-cats.webp",
  "little_busters.disciplinary_committee": "/assets/anime/icons/little-busters/rank-disciplinary-committee.webp",
  "little_busters.masato": "/assets/anime/icons/little-busters/rank-masato.webp",
  "little_busters.softball_club": "/assets/anime/icons/little-busters/rank-softball-club.webp",
  "little_busters.saya": "/assets/anime/icons/little-busters/rank-saya.webp",
  "little_busters.mio": "/assets/anime/icons/little-busters/rank-mio.webp"
};

export const LITTLE_BUSTERS_RANK_ABILITY_ICON_BY_CHOICE: Record<string, string> = {
  "little_busters.haruka:attack-roll-advantage": "/assets/anime/icons/little-busters/rank-haruka.webp",
  "little_busters.rins_cats:sandworm-strike-again": "/assets/anime/icons/little-busters/rank-rins-cats.webp",
  "little_busters.rins_cats:veteran-soul-feast": "/assets/anime/icons/little-busters/rank-rins-cats-heal.webp",
  "little_busters.disciplinary_committee:ignore-all-combat-penalties": "/assets/anime/icons/little-busters/rank-disciplinary-committee.webp",
  "little_busters.masato:unlimited-retaliation": "/assets/anime/icons/little-busters/rank-masato.webp",
  "little_busters.softball_club:attack-roll-advantage-passive": "/assets/anime/icons/little-busters/rank-softball-club.webp",
  "little_busters.saya:saya-armor-break": "/assets/anime/icons/little-busters/rank-saya.webp",
  "little_busters.mio:gargoyle-spell-ward": "/assets/anime/icons/little-busters/rank-mio.webp"
};

/** Fuyuki veterancy — one bespoke Servant-relic emblem per unit line (Codex imagegen). */
export const FUYUKI_RANK_ABILITY_ICONS: Record<string, string> = {
  "fuyuki.assassins": "/assets/anime/icons/fuyuki/rank-assassins.webp",
  "fuyuki.riders": "/assets/anime/icons/fuyuki/rank-riders.webp",
  "fuyuki.lancers": "/assets/anime/icons/fuyuki/rank-lancers.webp",
  "fuyuki.archers": "/assets/anime/icons/fuyuki/rank-archers.webp",
  "fuyuki.casters": "/assets/anime/icons/fuyuki/rank-casters.webp",
  "fuyuki.sabers": "/assets/anime/icons/fuyuki/rank-sabers.webp",
  "fuyuki.berserkers": "/assets/anime/icons/fuyuki/rank-berserkers.webp"
};

/** Hidden Leaf veterancy — one bespoke shinobi emblem per unit line (Codex imagegen). */
export const HIDDEN_LEAF_RANK_ABILITY_ICONS: Record<string, string> = {
  "hidden_leaf.genin_squad": "/assets/anime/icons/hidden-leaf/rank-genin-squad.webp",
  "hidden_leaf.medical_nin": "/assets/anime/icons/hidden-leaf/rank-medical-nin.webp",
  "hidden_leaf.anbu": "/assets/anime/icons/hidden-leaf/rank-anbu.webp",
  "hidden_leaf.jonin": "/assets/anime/icons/hidden-leaf/rank-jonin.webp",
  "hidden_leaf.giant_toad": "/assets/anime/icons/hidden-leaf/rank-giant-toad.webp",
  "hidden_leaf.jinchuriki": "/assets/anime/icons/hidden-leaf/rank-jinchuriki.webp",
  "hidden_leaf.susanoo": "/assets/anime/icons/hidden-leaf/rank-susanoo.webp",
  "hidden_leaf.hokage_vanguard": "/assets/anime/icons/hidden-leaf/rank-hokage-vanguard.webp"
};

/** Xianxia town veterancy uses one bespoke emblem per cultivation unit line. */
export const WUXIA_RANK_ABILITY_ICONS: Record<string, string> = {
  "azure_breeze.outer_disciples": "/assets/anime/icons/cultivation/rank-outer-sect-disciples.webp",
  "azure_breeze.inner_swordsmen": "/assets/anime/icons/cultivation/rank-inner-sect-swordsmen.webp",
  "azure_breeze.spirit_crane": "/assets/anime/icons/cultivation/rank-spirit-crane.webp",
  "azure_breeze.sect_protectors": "/assets/anime/icons/cultivation/rank-sect-formation-wardens.webp",
  "azure_breeze.true_inheritors": "/assets/anime/icons/cultivation/rank-true-inheritors.webp",
  "azure_breeze.core_master": "/assets/anime/icons/cultivation/rank-golden-core-elders.webp",
  "azure_breeze.mountain_guardian": "/assets/anime/icons/cultivation/rank-mountain-guardian.webp",
  "heavenly_demon.blood_disciples": "/assets/anime/icons/cultivation/rank-blood-disciples.webp",
  "heavenly_demon.gu_witches": "/assets/anime/icons/cultivation/rank-gu-witches.webp",
  "heavenly_demon.shadow_wraiths": "/assets/anime/icons/cultivation/rank-shadow-sabre-disciples.webp",
  "heavenly_demon.corpse_puppets": "/assets/anime/icons/cultivation/rank-corpse-puppets.webp",
  "heavenly_demon.bone_reavers": "/assets/anime/icons/cultivation/rank-bone-reavers.webp",
  "heavenly_demon.ghost_king": "/assets/anime/icons/cultivation/rank-ghost-king.webp",
  "heavenly_demon.demon_avatar": "/assets/anime/icons/cultivation/rank-heavenly-demon-avatar.webp"
};

/** MGQ's rank-3 emblem follows the card's current Job, including sealed Neutrals. */
export const MGQ_JOB_RANK_ABILITY_ICONS: Record<string, string> = {
  "ignores-retaliation": "/assets/anime/icons/mgq/rank-job-warrior.webp",
  "unlimited-retaliation": "/assets/anime/icons/mgq/rank-job-guard.webp",
  "titan-ignore-ongoing": "/assets/anime/icons/mgq/rank-job-mage.webp",
  "wraith-heal-1": "/assets/anime/icons/mgq/rank-job-healer.webp"
};

const RANK_ABILITY_ICON_FALLBACK = "/assets/spell-icons/slayer.png";
export const BLUE_ARCHIVE_RANK_ABILITY_ICON = "/assets/anime/icons/blue-archive/rank-shared.webp";

export function unitRankAbilityIcon(abilityId: string, unitDefId?: string, mgqJob?: string): string {
  if (unitDefId?.startsWith("blue_archive.")) return BLUE_ARCHIVE_RANK_ABILITY_ICON;
  if (unitDefId?.startsWith("mgq.") || mgqJob) {
    const jobIcon = MGQ_JOB_RANK_ABILITY_ICONS[abilityId];
    if (jobIcon) return jobIcon;
  }
  if (unitDefId?.startsWith("azur_lane.")) {
    const choiceIcon = AZUR_LANE_RANK_ABILITY_ICON_BY_CHOICE[`${unitDefId}:${abilityId}`];
    if (choiceIcon) return choiceIcon;
    if (AZUR_LANE_RANK_ABILITY_ICONS[unitDefId]) return AZUR_LANE_RANK_ABILITY_ICONS[unitDefId];
  }
  if (unitDefId?.startsWith("little_busters.")) {
    const choiceIcon = LITTLE_BUSTERS_RANK_ABILITY_ICON_BY_CHOICE[`${unitDefId}:${abilityId}`];
    if (choiceIcon) return choiceIcon;
    if (LITTLE_BUSTERS_RANK_ABILITY_ICONS[unitDefId]) return LITTLE_BUSTERS_RANK_ABILITY_ICONS[unitDefId];
  }
  if (unitDefId && WUXIA_RANK_ABILITY_ICONS[unitDefId]) {
    return WUXIA_RANK_ABILITY_ICONS[unitDefId];
  }
  if (unitDefId && FUYUKI_RANK_ABILITY_ICONS[unitDefId]) {
    return FUYUKI_RANK_ABILITY_ICONS[unitDefId];
  }
  if (unitDefId && HIDDEN_LEAF_RANK_ABILITY_ICONS[unitDefId]) {
    return HIDDEN_LEAF_RANK_ABILITY_ICONS[unitDefId];
  }
  return UNIT_RANK_ABILITY_ICONS[abilityId] ?? RANK_ABILITY_ICON_FALLBACK;
}

// Compatibility exports for older imports / tests
export const ELITE_UNIT_RANK_ABILITIES: Record<string, string> = {};
export const LEGEND_UNIT_RANK_ABILITIES: Record<string, string> = {};
export const UNIT_RANK_TRACK_OVERRIDES: Record<string, string> = {};

export function rankAbilityScheduleFor(unitDefId: string): RankSchedule {
  return rankScheduleFor(unitDefId);
}
export function inferRankAbilityTrack(unitDefId: string): string {
  return rankAbilityTrackFor(unitDefId);
}
