/**
 * Unit Experience rank rewards — each of the 4 ranks is normally stats OR one
 * ability (a signature rank may be a hybrid or explicitly add another grant).
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

import { CUSTOM_VETERANCY_OVERRIDES, NEUTRAL_SIDE_VETERANCY_OVERRIDES } from "./custom-experience-overrides";
import type { UnitTier } from "@/data/factions/types";
import { coreUnitDefinitions } from "@/data/factions/units";

export type RankStep =
  | { kind: "stats"; stats?: UnitRankStatBonus }
  | { kind: "ability"; choices: readonly string[]; grants?: readonly string[] }
  | { kind: "hybrid"; stats: UnitRankStatBonus; choices: readonly string[]; grants?: readonly string[] };

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
function G(choices: readonly string[], ...grants: string[]): RankStep {
  return { kind: "ability", choices, grants };
}

export function scheduleAbilityCount(schedule: RankSchedule): number {
  let n = 0;
  for (const r of [1, 2, 3, 4] as const) {
    const step = schedule[r];
    if (step.kind === "ability" || step.kind === "hybrid") n += 1 + (step.grants?.length ?? 0);
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
// gone now so that cannot recur. Custom-town overrides now live in
// custom-experience-overrides.ts; the old template-fill machinery stays retired.
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
  if (unitDefId === "factory.halflings") return S({ ...Z, health: 2 });
  if (unitDefId === "factory.automatons") return H({ ...Z, initiative: 3 }, "factory-automaton-reroll");
  if (unitDefId === "neutral.boars") return H({ ...Z, health: 1 }, "veteran-boar-regeneration");
  if (unitDefId === "rampart.centaurs") return H({ ...Z, health: 1 }, "veteran-centaur-retaliation");
  if (unitDefId === "wog.fire_messenger") return A("veteran-ranged-fire-shield");
  if (unitDefId === "wog.war_zealot") return H({ ...Z, initiative: 1 }, "veteran-retaliation-fury");
  if (unitDefId === "castle.halberdiers") return A("town-halberd-hunter");
  if (unitDefId === "tower.gremlins") return S({ ...Z, health: 1 });
  if (unitDefId === "tower.iron_golems") return A("town-golem-cap");
  if (unitDefId === "tower.titans") return A("town-titan-storm-cache");
  if (unitDefId === "rampart.dendroids") return A("bulwark-thick-hide");
  if (unitDefId === "rampart.unicorns") return H({ ...Z, initiative: 1 }, "veteran-mobility-1");
  if (unitDefId === "inferno.cerberi") return S({ ...Z, initiative: 2 });
  if (unitDefId === "inferno.pit_lords") return H({ ...Z, initiative: 1 }, "town-pit-demon-bond");
  if (unitDefId === "inferno.arch_devils") return H({ ...Z, initiative: 1 }, "town-devil-luck");
  if (unitDefId === "dungeon.manticores") return A("veteran-manticore-mend");
  if (unitDefId === "dungeon.minotaurs") return A("veteran-minotaur-hide");
  if (unitDefId === "dungeon.harpies") return H({ ...Z, initiative: 3 }, "veteran-harpy-haste");
  if (unitDefId === "dungeon.evil_eyes") return A("veteran-eye-splash");
  if (unitDefId === "necropolis.ghost_dragons") return A("veteran-dragon-dread");
  if (unitDefId === "neutral.crystal_dragons") return A("veteran-crystal-burst");
  if (unitDefId === "doom.arch_vile") return S({ ...Z, initiative: 2, health: 1 });
  if (unitDefId === "wog.dracolich") return A("veteran-dracolich-fear-aura");
  if (unitDefId === "neutral.rust_dragons") return A("veteran-blind-dust");
  if (unitDefId === "doom.spider_mastermind") return A("veteran-adjacent-pulse");
  if (unitDefId === "neutral.unicorns") return H({ ...Z, initiative: 1 }, "imperium-shock-assault");
  if (unitDefId === "neutral.wyverns") return A("veteran-flying-guard");
  if (unitDefId === "neutral.peasants") return A("veteran-peasant-bounty");
  if (unitDefId === "neutral.azure_dragons") return A("veteran-azure-fear-aura");
  if (unitDefId === "conflux.storm_elementals") return H({ ...Z, health: 1 }, "veteran-attack-when-attacking");
  if (unitDefId === "conflux.energy_elementals") return H({ ...Z, health: 1 }, "veteran-energy-delay");
  if (unitDefId === "conflux.magic_elementals") return A("veteran-magic-dispel");
  if (unitDefId === "conflux.magma_elementals") return A("veteran-magma-solidify");
  if (unitDefId === "neutral.ice_elementals" || unitDefId === "conflux.ice_elementals") return A("veteran-ice-bolt");
  if (unitDefId === "neutral.magic_elementals") return A("veteran-magic-splash");
  if (unitDefId === "neutral.sprites") return S({ ...Z, health: 1, initiative: 3 });
  if (unitDefId === "neutral.storm_elementals") return A("ignore-all-combat-penalties");
  if (unitDefId === "neutral.magma_elementals") return S({ ...Z, health: 1 });
  if (unitDefId === "neutral.phoenixes") return A("veteran-phoenix-breath");
  if (unitDefId === "fortress.hydras") return A("veteran-fear-aura");
  if (unitDefId === "fortress.dragon_flies") return S({ ...Z, initiative: 2 });
  if (unitDefId === "fortress.gorgons") return H({ ...Z, initiative: 1 }, "town-gorgon-stare-reroll");
  if (unitDefId === "cove.haspids") return A("town-haspid-toxic-hide");
  if (unitDefId === "bulwark.mountain_rams") return A("town-ram-spell-draw");
  if (unitDefId === "bulwark.jotunns") return A("town-jotunn-rune-hide");
  if (unitDefId === "bulwark.mammoths") return A("town-mammoth-rune-mend");
  // Kobolds keep their generated R1 Health step and gain +1 more Health (net +2 HP).
  if (unitDefId === "bulwark.kobolds") return S({ ...Z, health: 2 });
  if (unitDefId === "castle.champions") return A("veteran-moving-pierce");
  // Move the former generated R3 reward forward: veteran Sharpshooters begin
  // with the same low-roll extra shot that their old schedule granted at R3.
  if (unitDefId === "neutral.sharpshooters") return A("ranged-extra-shot-on-low-roll");
  return null;
}

/** Explicit unit-role overrides; the broad flavour fallback still serves other towns. */
const CUSTOM_VETERANCY_FACTIONS = new Set([
  "fuyuki", "azure_breeze", "hidden_leaf", "azur_lane", "heavenly_demon",
  "little_busters", "blue_archive", "mgq", "imperium"
]);

function customVeterancyStep(unitDefId: string, rank: 1 | 2 | 3 | 4): RankStep | null {
  return CUSTOM_VETERANCY_OVERRIDES[unitDefId]?.[rank] ?? null;
}
function rankOneStepFor(unitDefId: string): RankStep {
  const profile = rankOneProfileFor(unitDefId);
  if (["defense", "health", "initiative"].includes(profile)) return S();
  if (profile === "own-attack") return A("veteran-attack-when-attacking");
  if (profile === "retaliation") return A("veteran-retaliation-fury");
  return A("veteran-guarded-stance");
}

function explicitRankTwo(unitDefId: string): RankStep | null {
  if (unitDefId === "factory.mechanics") return A("factory-engineer-attack-support");
  if (unitDefId === "factory.armadillos") return A("reduce-spell-and-specialty-damage-1");
  if (unitDefId === "factory.sandworms") return A("factory-sandworm-burrow");
  if (unitDefId === "neutral.boars") return A("veteran-boar-armor-break");
  if (unitDefId === "neutral.nomads") return A("veteran-nomad-hardcap");
  if (unitDefId === "neutral.mummies") return H({ ...Z, health: 1 }, "veteran-mummy-attack-heal");
  if (unitDefId === "cove.ayssids") return A("veteran-ayssid-two-dice", "wog-no-negative-attack-roll");
  if (unitDefId === "dungeon.troglodytes") return A("veteran-troglodyte-three-dice", "wog-no-negative-attack-roll");
  if (unitDefId === "bulwark.yetis") return A("town-yeti-spell-specialty-aura");
  if (unitDefId === "stronghold.behemoths") return A("veteran-behemoth-odd-defense");
  const neutralTownR2: Record<string, string> = {
    "neutral.halberdiers": "ntv-set-the-spear", "neutral.centaurs": "ntv-skirmisher-step",
  };
  if (neutralTownR2[unitDefId]) return A(neutralTownR2[unitDefId]!);
  // Neutral Grenadiers: a grenade splash instead of the second Twin Attack Dice
  // (their printed own-attack Twin Dice already covers most of it), so they no
  // longer share Halflings' R2.
  if (unitDefId === "neutral.grenadiers") return A("ntv-scattering-flame");
  if (unitDefId === "neutral.air_elementals") return A("bulwark-air-shield");
  if (unitDefId === "neutral.earth_elementals") return A("veteran-earth-defense-token");
  if (unitDefId === "wog.lava_sharpshooter") return A("veteran-lava-ongoing-immunity");
  if (unitDefId === "wog.war_zealot") return A("veteran-defense-pierce");
  if (unitDefId === "wog.werewolf") return A("veteran-werewolf-astral-hunt");
  if (unitDefId === "fortress.gorgons") return A("town-gorgon-armored-prey");
  if (unitDefId === "fortress.hydras") return A("town-hydra-forced-reroll");
  if (unitDefId === "fortress.wyverns") return A("town-wyvern-reroll");
  if (unitDefId === "cove.nix") return A("town-nix-guarded");
  if (unitDefId === "cove.haspids") return A("town-haspid-aggressive-drill");
  if (unitDefId === "inferno.pit_lords") return A("reduce-spell-damage-2");
  if (unitDefId === "cove.oceanids") return S({ ...Z, defense: 1, initiative: 1 });
  if (unitDefId === "cove.seamen") return A("town-seaman-survival-gold");
  if (unitDefId === "cove.sorceresses") return A("town-sorceress-ranged-mend");
  // Sea Dogs keep their generated R2 ability CHOICE and ALSO gain +1 Health —
  // reproduce the exact rotated pool the generator would roll so the choice is
  // unchanged, then fold it into a hybrid that always adds the Health step.
  if (unitDefId === "cove.sea_dogs") return H({ ...Z, health: 1 }, ...rotatedChoices(unitDefId, 2, RANK_TWO_ABILITIES[inferFlavour(unitDefId)]));
  if (unitDefId === "bulwark.snow_elves") return A("town-snow-elf-rune-strike");
  // Mountain Rams keep their generated R2 ability CHOICE and ALSO gain +1 Health
  // (same hybrid pattern as cove.sea_dogs above).
  if (unitDefId === "bulwark.mountain_rams") return H({ ...Z, health: 1 }, ...rotatedChoices(unitDefId, 2, RANK_TWO_ABILITIES[inferFlavour(unitDefId)]));
  if (unitDefId === "bulwark.yetis") return A("town-yeti-specialty-aura");
  if (unitDefId === "castle.marksmen") return A("town-marksman-mark");
  if (unitDefId === "castle.crusaders") return A("town-crusader-undead");
  if (unitDefId === "tower.iron_golems") return A("town-golem-shield");
  if (unitDefId === "tower.nagas") return A("town-naga-mend");
  if (unitDefId === "dungeon.black_dragons") return A("town-black-dragon-guard");
  if (unitDefId === "rampart.dwarves") return A("town-dwarf-backlash");
  if (unitDefId === "rampart.gold_dragons") return A("town-dragon-snare");
  if (unitDefId === "rampart.unicorns") return A("town-unicorn-die");
  if (unitDefId === "inferno.familiars") return A("town-familiar-backlash");
  if (unitDefId === "inferno.magogs") return A("reduce-spell-and-specialty-damage-1");
  if (unitDefId === "inferno.demons") return A("town-demon-paralyze");
  if (unitDefId === "inferno.arch_devils") return A("reduce-spell-and-specialty-damage-1");
  if (unitDefId === "inferno.efreet") return A("wog-fire-shield-1");
  // Preserve R2 after replacing the earlier Guarded Stance that used to exclude it.
  if (unitDefId === "necropolis.ghost_dragons") return A("bulwark-air-shield");
  if (unitDefId === "dungeon.minotaurs") return A("veteran-minotaur-cleave");
  if (unitDefId === "dungeon.medusas") return A("veteran-medusa-mend");
  if (unitDefId === "necropolis.skeletons") return A("veteran-skeleton-retaliation");
  if (unitDefId === "necropolis.liches") return A("veteran-lich-pierce");
  if (unitDefId === "doom.cyberdemon") return A("veteran-adjacent-enfeeble");
  if (unitDefId === "neutral.faerie_dragons") return A("wog-war-zealot-mirror");
  if (unitDefId === "neutral.titans") return A("veteran-thunder-retaliation");
  if (unitDefId === "neutral.trolls") return A("veteran-troll-resilience");
  if (unitDefId === "neutral.unicorns") return A("veteran-unicorn-enfeeble");
  if (unitDefId === "neutral.peasants") return S({ ...Z, health: 2 });
  if (unitDefId === "neutral.azure_dragons") return H({ ...Z, health: 1 }, "veteran-azure-mending-scales");
  if (unitDefId === "neutral.sprites") return A("veteran-sprite-spell-block");
  if (unitDefId === "conflux.phoenixes") return A("veteran-phoenix-activation");
  if (unitDefId === "castle.champions") return S({ ...Z, health: 1 });
  if (unitDefId === "little_busters.rins_cats") return A("veteran-soul-feast");
  if (unitDefId === "neutral.sharpshooters") return A("veteran-sharpshooter-mastery");
  if (unitDefId === "neutral.ice_elementals") return A("veteran-attack-when-attacking");
  return null;
}

function explicitRankThree(unitDefId: string): RankStep | null {
  if (unitDefId === "factory.halflings") return A("factory-grenadier-guard-heal");
  if (unitDefId === "factory.armadillos") return A("factory-armadillo-momentum");
  // Forge: the Cyber Zombie shields its neighbours; the Jump Troopers' jet
  // packs carry them one extra space.
  if (unitDefId === "forge.jump_troopers") return A("veteran-mobility-1");
  if (unitDefId === "factory.automatons") return A("factory-automaton-round-blast");
  if (unitDefId === "factory.gunslingers") return H({ ...Z, health: 1 }, "factory-bounty-hunter-cover");
  if (unitDefId === "factory.couatls") return H({ ...Z, initiative: 5 }, "factory-couatl-momentum");
  if (unitDefId === "factory.dreadnoughts") return A("factory-dreadnought-speed-hunter");
  if (unitDefId === "neutral.boars") return H({ ...Z, defense: 1 }, "veteran-boar-brace");
  if (unitDefId === "wog.dracolich") return H({ ...Z, health: 1 }, "veteran-dracolich-death-heal");
  if (unitDefId === "tower.gargoyles") return H({ ...Z, health: 2 }, "veteran-earth-defense-token");
  if (unitDefId === "tower.titans") return A("veteran-earth-defense-token");
  if (unitDefId === "necropolis.skeletons") return S({ ...Z, health: 2 });
  if (unitDefId === "conflux.magma_elementals") return A("veteran-magma-teleport-strike", "veteran-magma-attack-after-move");
  const neutralTownR3: Record<string, string> = {
    "neutral.marksmen":"ntv-marked-volley", "neutral.crusaders":"ntv-righteous-pursuit", "neutral.zealots":"ntv-consecrated-shot",
    "neutral.dwarves":"ntv-runic-backlash", "neutral.elves":"ntv-first-volley", "neutral.pegasi":"ntv-mana-turbulence",
    "neutral.gremlins":"ntv-improvised-ammunition", "neutral.gargoyles":"ntv-stone-landing", "neutral.iron_golems":"ntv-arcane-plating", "neutral.magi":"ntv-spell-channel", "neutral.genies":"ntv-unstable-wish",
    "neutral.familiars":"ntv-stolen-spark", "neutral.magogs":"ntv-scattering-flame", "neutral.cerberi":"ntv-threefold-threat", "neutral.demons":"ntv-hellish-endurance",
    "neutral.skeletons":"ntv-bone-wall", "neutral.zombies":"ntv-putrid-grasp", "neutral.wraiths":"ntv-ethereal-escape", "neutral.vampires":"ntv-blood-tribute", "neutral.liches":"ntv-death-cloud", "neutral.ghost_dragons":"ntv-ageing-breath",
    "neutral.troglodytes":"ntv-blind-instinct", "neutral.harpies":"ntv-strike-and-return", "neutral.evil_eyes":"ntv-disrupting-gaze", "neutral.medusas":"ntv-petrifying-aim", "neutral.minotaurs":"ntv-labyrinth-cleave",
    "neutral.goblins":"ntv-cowards-luck", "neutral.wolf_raiders":"ntv-pack-rush", "neutral.orcs":"ntv-suppressing-shot", "neutral.ogres":"ntv-bodyguard", "neutral.thunderbirds":"ntv-chain-lightning",
    "neutral.gnolls":"ntv-marsh-scavenger", "neutral.lizardmen":"ntv-venom-arrow", "neutral.dragon_flies":"ntv-disorienting-landing", "neutral.basilisks":"ntv-heavy-gaze", "neutral.gorgons":"ntv-armoured-prey",
    "neutral.oceanids":"ntv-flowing-assault", "neutral.seamen":"ntv-boarding-formation", "neutral.sea_dogs":"ntv-return-fire", "neutral.ayssids":"ntv-raking-dive", "neutral.sorceresses":"ntv-bewitching-bolt",
    "neutral.halflings":"ntv-lucky-ricochet",
    // Neutral Grenadiers: the Factory Grenadier's Perfect Trajectory (+3 Attack on a "+1").
    "neutral.grenadiers":"factory-grenadier-high-roll",
  };
  if (neutralTownR3[unitDefId]) return A(neutralTownR3[unitDefId]!);
  if (unitDefId === "neutral.air_elementals") return A("veteran-air-chain-lightning");
  if (unitDefId === "neutral.fire_elementals") return A("veteran-fire-damage-cap");
  if (unitDefId === "neutral.water_elementals") return S({ ...Z, health: 4 });
  if (unitDefId === "neutral.earth_elementals") return A("veteran-earth-low-defense");
  if (unitDefId === "wog.arctic_sharpshooter") return A("veteran-arctic-harden");
  if (unitDefId === "wog.lava_sharpshooter") return A("veteran-lava-burst");
  if (unitDefId === "wog.war_zealot") return A("veteran-minotaur-hide");
  if (unitDefId === "wog.werewolf") return A("veteran-werewolf-pack-call");
  if (unitDefId === "fortress.gnolls") return A("town-gnoll-gold");
  if (unitDefId === "fortress.gorgons") return A("veteran-minotaur-hide");
  if (unitDefId === "cove.oceanids") return A("veteran-double-attack");
  if (unitDefId === "cove.sea_dogs") return A("town-sea-dog-ranged-retaliation");
  if (unitDefId === "cove.sorceresses") return A("town-sorceress-artifact-tax");
  if (unitDefId === "cove.haspids") return A("reduce-spell-and-specialty-damage-1");
  if (unitDefId === "bulwark.yetis") return A("bulwark-thick-hide");
  if (unitDefId === "bulwark.jotunns") return A("town-jotunn-rune-bolt");
  if (unitDefId === "bulwark.mammoths") return A("town-mammoth-hunter");
  // Preserve the previous R3 stat reward after R1 became a hybrid.
  if (unitDefId === "inferno.arch_devils") return S({ ...Z, attack: 1 });
  if (unitDefId === "castle.halberdiers") return A("town-halberd-aura");
  if (unitDefId === "castle.crusaders") return H({ ...Z, initiative: 1 }, "reduce-spell-damage-1");
  if (unitDefId === "castle.zealots") return A("veteran-zealot-spell-sunder");
  if (unitDefId === "tower.gremlins") return H({ ...Z, attack: 1 }, "town-gremlin-die");
  if (unitDefId === "tower.magi") return A("town-magi-recover");
  if (unitDefId === "tower.nagas") return A("town-naga-pierce");
  if (unitDefId === "stronghold.wolf_raiders") return S({ ...Z, attack: 1, initiative: 2 });
  if (unitDefId === "stronghold.ogres") return A("town-ogre-guard");
  if (unitDefId === "stronghold.thunderbirds") return A("town-bird-lightning");
  if (unitDefId === "stronghold.cyclopes") return A("town-cyclops-siegebreaker-focus");
  if (unitDefId === "rampart.centaurs") return H({ ...Z, health: 1 }, "imperium-shock-assault");
  if (unitDefId === "rampart.elves") return A("town-elf-guard");
  if (unitDefId === "rampart.pegasi") return A("town-pegasus-guard");
  if (unitDefId === "rampart.gold_dragons") return A("town-gold-dragon-dominion");
  if (unitDefId === "rampart.unicorns") return A("titan-ignore-ongoing");
  if (unitDefId === "inferno.pit_lords") return H({ ...Z, health: 1 }, "town-pit-mend");
  if (unitDefId === "inferno.efreet") return A("town-efreet-mend");
  if (unitDefId === "dungeon.medusas") return A("veteran-medusa-execution");
  if (unitDefId === "dungeon.harpies") return A("veteran-harpy-vitality");
  if (unitDefId === "necropolis.wraiths") return A("veteran-wraith-escape");
  if (unitDefId === "necropolis.zombies") return A("veteran-zombie-intercept");
  if (unitDefId === "necropolis.vampires") return A("veteran-vampire-tribute");
  if (unitDefId === "neutral.crystal_dragons") return A("veteran-crystal-immunity");
  if (unitDefId === "doom.cyberdemon") return A("veteran-cyber-splash");
  if (unitDefId === "neutral.rust_dragons" || unitDefId === "neutral.trolls") return S({ ...Z, health: 2 });
  if (unitDefId === "doom.spider_mastermind") return S({ ...Z, initiative: 1, health: 1, defense: 1 });
  if (unitDefId === "neutral.unicorns") return S({ ...Z, health: 1 });
  if (unitDefId === "doom.pain_elemental") return S({ ...Z, health: 1, initiative: 1 });
  if (unitDefId === "neutral.azure_dragons") return A("veteran-azure-line-attack");
  if (unitDefId === "conflux.storm_elementals") return H({ ...Z, initiative: 3 }, "veteran-storm-speed");
  if (unitDefId === "conflux.energy_elementals") return A("veteran-energy-fire-heal");
  if (unitDefId === "neutral.sprites") return A("veteran-sprite-landing");
  if (unitDefId === "conflux.sprites") return A("veteran-sprite-obstacle");
  if (unitDefId === "neutral.storm_elementals") return A("veteran-distant-storm");
  if (unitDefId === "neutral.magma_elementals") return A("veteran-magma-hunter");
  if (unitDefId === "neutral.energy_elementals") return A("veteran-energy-drain");
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
  if (unitDefId === "neutral.sharpshooters") return A("veteran-double-attack");
  // Preserve Ice Elementals' former R2 Guarded Stance after moving it to R3.
  if (unitDefId === "neutral.ice_elementals") return A("veteran-guarded-stance");
  return null;
}

function explicitRankFour(unitDefId: string): RankStep | null {
  if (unitDefId === "factory.halflings") return A("factory-grenadier-high-roll");
  // Forge signature capstones (all already-implemented, iconned rank abilities):
  // gunners sight their mark, the chainsaw shreds armour, rockets splash, the
  // naga tank's coils pierce, and the Cyberbrute's lightning arcs on a low roll.
  if (unitDefId === "forge.grunts") return A("town-marksman-mark");
  if (unitDefId === "factory.automatons") return A("factory-automaton-detonation-repair");
  if (unitDefId === "factory.dreadnoughts") return A("factory-dreadnought-guarded");
  if (unitDefId === "rampart.elves") {
    return A(...rotatedChoices(unitDefId, 4, RANK_FOUR_ABILITIES.ranged).map(
      (abilityId) => abilityId === "veteran-spell-sunder" ? "veteran-elf-spell-sunder" : abilityId,
    ));
  }
  if (unitDefId === "neutral.boars") return A("veteran-boar-pierce");
  // Neutral Grenadiers' capstone is an incendiary shot (works for any owner),
  // not the card draw Halflings keep.
  if (unitDefId === "neutral.grenadiers") return A("veteran-lava-burn");
  if (unitDefId === "neutral.nomads") return A("veteran-nomad-aura");
  if (unitDefId === "neutral.mummies") return A("veteran-mummy-last-stand");
  if (unitDefId === "tower.gargoyles") return A("veteran-defense-pierce-2");
  if (unitDefId === "conflux.phoenixes") return A("veteran-phoenix-rising-nest-heal");
  if (unitDefId === "conflux.magma_elementals") return A("veteran-magma-overflow");
  if (unitDefId === "bulwark.shamans") return A("town-shaman-teleport-charge", "veteran-magma-attack-after-move");
  if (unitDefId === "dungeon.minotaurs") return A("veteran-minotaur-last-stand");
  if (unitDefId === "necropolis.skeletons") return A("veteran-skeleton-last-stand");
  const neutralTownR4: Record<string, string> = {
    "neutral.griffins":"ntv-winged-riposte", "neutral.champions":"ntv-full-gallop", "neutral.archangels":"ntv-guardian-angel",
    "neutral.dendroids":"ntv-deep-roots", "neutral.unicorns":"ntv-moonlit-aid", "neutral.nagas":"ntv-measured-blades",
    "neutral.pit_lords":"ntv-summoned-torment", "neutral.efreet":"ntv-searing-passage", "neutral.arch_devils":"ntv-infernal-command",
    "neutral.dread_knights":"ntv-dread-charge", "neutral.manticores":"ntv-barbed-revenge", "neutral.black_dragons":"ntv-predators-mark",
    "neutral.cyclopes":"ntv-boulder-crash", "neutral.behemoths":"ntv-crushing-claws", "neutral.wyverns":"ntv-potent-venom",
    "neutral.nix":"ntv-scaled-intercept", "neutral.haspids":"ntv-toxic-counter",
  };
  if (neutralTownR4[unitDefId]) return A(neutralTownR4[unitDefId]!);
  if (unitDefId === "neutral.water_elementals") return A("veteran-water-spell-power");
  if (unitDefId === "neutral.earth_elementals") return A("veteran-earth-spell-power");
  if (unitDefId === "wog.hell_steed") return A("veteran-hell-steed-last-stand");
  if (unitDefId === "wog.nightmare") return A("veteran-nightmare-death-stare-reroll");
  if (unitDefId === "wog.arctic_sharpshooter") return A("veteran-arctic-slow-shot");
  if (unitDefId === "wog.lava_sharpshooter") return A("veteran-lava-burn");
  if (unitDefId === "fortress.dragon_flies") return A("town-dragon-fly-landing");
  if (unitDefId === "fortress.basilisks") return A("town-basilisk-lower-roll");
  if (unitDefId === "fortress.lizardmen") return A("town-lizard-spell-draw");
  if (unitDefId === "fortress.hydras") return A("town-hydra-round-mend");
  if (unitDefId === "fortress.wyverns") return A("town-wyvern-potent-poison");
  if (unitDefId === "cove.ayssids") return H({ ...Z, initiative: 2 }, "town-ayssid-slow");
  if (unitDefId === "cove.haspids") return A("town-haspid-unstoppable-counter");
  if (unitDefId === "cove.nix") return A("town-nix-intercept");
  // Requested additions: keep the old R4 reward and grant the new rule too.
  if (unitDefId === "bulwark.kobolds") return G(["town-kobold-rune-step"], "town-kobold-armored-prey");
  if (unitDefId === "bulwark.mountain_rams") return G(
    rotatedChoices(unitDefId, 4, RANK_FOUR_ABILITIES[inferFlavour(unitDefId)]),
    "town-ram-trample"
  );
  if (unitDefId === "bulwark.mammoths") return A("town-mammoth-last-stand");
  if (unitDefId === "castle.griffins") return A("town-griffin-counter");
  if (unitDefId === "castle.marksmen") return A("town-marksman-survival");
  if (unitDefId === "castle.zealots") return A("town-zealot-loss");
  if (unitDefId === "castle.archangels") return A("town-angel-safe");
  if (unitDefId === "castle.champions") return A("town-champion-two-space-safe");
  if (unitDefId === "rampart.gold_dragons" || unitDefId === "stronghold.behemoths") return A("veteran-regeneration-1");
  if (unitDefId === "tower.gremlins") return A("town-gremlin-recover");
  if (unitDefId === "tower.titans") return A("town-titan-bolt");
  if (unitDefId === "stronghold.goblins") return A("town-goblin-save");
  if (unitDefId === "stronghold.orcs") return A("town-orc-double-attack");
  if (unitDefId === "stronghold.wolf_raiders") return A("dragon-fly-retaliation-penalty-2");
  if (unitDefId === "stronghold.thunderbirds") return A("veteran-dragon-feast");
  if (unitDefId === "stronghold.cyclopes") return A("town-cyclops-splash");
  if (unitDefId === "inferno.familiars") return A("town-familiar-pierce");
  if (unitDefId === "inferno.arch_devils") return A("town-devil-draw");
  if (unitDefId === "inferno.efreet") return A("town-efreet-second");
  if (unitDefId === "dungeon.black_dragons") return A("veteran-dragon-mark");
  if (unitDefId === "dungeon.manticores") return A("veteran-manticore-revenge");
  if (unitDefId === "dungeon.troglodytes") return A("veteran-troglodyte-rebirth");
  if (unitDefId === "dungeon.evil_eyes") return A("veteran-eye-immunity");
  if (unitDefId === "necropolis.skeletons") return A("veteran-skeleton-rebirth");
  if (unitDefId === "necropolis.wraiths") return A("veteran-wraith-magic");
  if (unitDefId === "necropolis.zombies") return H({ ...Z, health: 1 }, "veteran-zombie-rest");
  if (unitDefId === "necropolis.liches") return A("veteran-lich-mend");
  if (unitDefId === "necropolis.vampires") return A("veteran-vampire-ward");
  if (unitDefId === "necropolis.ghost_dragons") return A("veteran-dragon-feast");
  if (unitDefId === "neutral.gold_dragons") return A("veteran-adjacent-pulse");
  if (unitDefId === "neutral.rust_dragons") return A("veteran-sandstorm");
  if (unitDefId === "neutral.trolls") return A("veteran-troll-snare");
  if (unitDefId === "doom.pain_elemental") return A("veteran-pain-resistance");
  if (unitDefId === "neutral.azure_dragons") return A("veteran-azure-super-charge");
  if (unitDefId === "neutral.magma_elementals") return A("veteran-magma-guard");
  if (unitDefId === "conflux.ice_elementals") return A("veteran-water-damper");
  if (unitDefId === "conflux.magic_elementals") return A("veteran-magic-copy");
  if (unitDefId === "neutral.magic_elementals") return A("veteran-arcane-echo");
  if (unitDefId === "conflux.storm_elementals") return A("veteran-storm-link-2");
  if (unitDefId === "conflux.phoenixes") return A("veteran-phoenix-rising-nest");
  if (unitDefId === "neutral.ice_elementals") return A("veteran-frozen-guard");
  if (unitDefId === "neutral.storm_elementals") return A("veteran-storm-guard");
  if (unitDefId === "neutral.phoenixes") return H({ ...Z, health: 1 }, "veteran-renewed-rebirth");
  if (unitDefId === "conflux.magma_elementals") return A("veteran-earth-shield");
  if (unitDefId === "neutral.energy_elementals") return H({ ...Z, initiative: 5 }, "teleport-move");
  if (unitDefId === "castle.crusaders") return A("veteran-double-attack");
  if (unitDefId === "inferno.pit_lords") return A("veteran-defense-pierce");
  if (unitDefId === "inferno.magogs") return S({ ...Z, health: 2 });
  if (unitDefId === "necropolis.dread_knights") return A("reduce-spell-and-specialty-damage-2");
  if (unitDefId === "conflux.sprites") return A("veteran-sprite-landing");
  if (unitDefId.endsWith(".skeletons")) return A("veteran-rebirth");
  if (unitDefId === "tower.magi") return A("veteran-magi-spell-sunder");
  if (unitDefId.endsWith(".magi")) return A("veteran-spell-sunder");
  if (unitDefId.endsWith(".unicorns")) return A("veteran-low-roll-insight");
  if (unitDefId.endsWith(".zealots")) return A("veteran-defense-pierce");
  if (unitDefId.endsWith(".ghost_dragons")) return A("veteran-soul-feast");
  if (unitDefId === "neutral.sharpshooters") return A("veteran-defense-pierce");
  return null;
}

/**
 * Resolved schedule: an explicit per-unit override wins that rank, otherwise the
 * flavour generator fills it (diversified small R1, themed R2/R3, capstone R4).
 * There is NO third tier — see the deletion note above.
 */
const RANK_SCHEDULE_CACHE = new Map<string, RankSchedule>();

/**
 * Which veteran track a stack follows. "neutral" is used for a stack fighting
 * on its printed Neutral side or owned by the Neutral guard player; it only
 * differs from "faction" for units that own a NEUTRAL_SIDE_VETERANCY_OVERRIDES
 * entry (Bulwark / Factory / Forge Neutral sides).
 */
export type RankScheduleSide = "faction" | "neutral";

/** True when this unit's Neutral side has its own veteran track. */
export function hasNeutralSideRankSchedule(unitDefId: string): boolean {
  return Object.prototype.hasOwnProperty.call(NEUTRAL_SIDE_VETERANCY_OVERRIDES, unitDefId);
}

/**
 * The track that actually resolves for (unit, side): "neutral" only when the
 * unit owns a Neutral-side track, so callers can key caches on the result.
 */
export function effectiveRankScheduleSide(unitDefId: string, side: RankScheduleSide | undefined): RankScheduleSide {
  return side === "neutral" && hasNeutralSideRankSchedule(unitDefId) ? "neutral" : "faction";
}

/**
 * Memoized: the schedule is a pure function of the unit definition and the
 * static override tables, yet it was recomputed (flavour inference included)
 * for every unit on every army-strength read — measured at ~50% of all AI
 * CPU on a live table. Callers treat the schedule as read-only data.
 *
 * `side` selects the Neutral-side track when the unit has one; every other
 * unit (and every faction-side stack) resolves exactly as before.
 */
export function rankScheduleFor(unitDefId: string, side: RankScheduleSide = "faction"): RankSchedule {
  if (effectiveRankScheduleSide(unitDefId, side) === "neutral") {
    return NEUTRAL_SIDE_VETERANCY_OVERRIDES[unitDefId]!;
  }
  const cached = RANK_SCHEDULE_CACHE.get(unitDefId);
  if (cached) return cached;
  const schedule = computeRankSchedule(unitDefId);
  RANK_SCHEDULE_CACHE.set(unitDefId, schedule);
  return schedule;
}

function computeRankSchedule(unitDefId: string): RankSchedule {
  const flavour = inferFlavour(unitDefId);
  const customRankThree = customVeterancyStep(unitDefId, 3);
  const rankThree = customRankThree ?? explicitRankThree(unitDefId) ??
    (stableRankHash(unitDefId, 3) % 3 === 0
      ? A(...rotatedChoices(unitDefId, 3, RANK_THREE_ABILITIES[flavour]))
      : S());
  return {
    1: customVeterancyStep(unitDefId, 1) ?? explicitRankOne(unitDefId) ?? rankOneStepFor(unitDefId),
    2: customVeterancyStep(unitDefId, 2) ?? explicitRankTwo(unitDefId) ?? A(...rotatedChoices(unitDefId, 2, RANK_TWO_ABILITIES[flavour])),
    3: rankThree,
    4: customVeterancyStep(unitDefId, 4) ?? explicitRankFour(unitDefId) ?? A(...rotatedChoices(unitDefId, 4, RANK_FOUR_ABILITIES[flavour]))
  };
}

/**
 * Whether ANY of this unit's four ranks is an explicit per-unit override rather
 * than the generator's roll. Honest under the redesign: it is exactly "does a
 * signature rank exist for this unit", not "is this unit in some table".
 */
export function hasUniqueRankSchedule(unitDefId: string): boolean {
  if (customVeterancyStep(unitDefId, 1)) return true;
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

export function rankAbilityTrackFor(unitDefId: string, side: RankScheduleSide = "faction"): string {
  if (effectiveRankScheduleSide(unitDefId, side) === "neutral") return "neutral-veterancy";
  const faction = unitDefId.split(".")[0] ?? "";
  if (CUSTOM_VETERANCY_FACTIONS.has(faction)) return `${faction}-veterancy`;
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
  "fuyuki-veterancy": "Heroic spirit",
  "azure_breeze-veterancy": "Sect inheritance",
  "hidden_leaf-veterancy": "Shinobi way",
  "azur_lane-veterancy": "Fleet doctrine",
  "heavenly_demon-veterancy": "Demonic path",
  "little_busters-veterancy": "Team spirit",
  "blue_archive-veterancy": "Academy training",
  "mgq-veterancy": "Adventurer growth",
  "imperium-veterancy": "Battle honours",
  "neutral-veterancy": "Wild veteran",
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

const NEUTRAL_TOWN_ICON_SLUGS: Record<string, readonly string[]> = {
  castle: ["set-the-spear","marked-volley","winged-riposte","righteous-pursuit","consecrated-shot","full-gallop","guardian-angel"],
  rampart: ["skirmisher-step","runic-backlash","first-volley","mana-turbulence","deep-roots","moonlit-aid"],
  tower: ["improvised-ammunition","stone-landing","arcane-plating","spell-channel","unstable-wish","measured-blades"],
  inferno: ["stolen-spark","scattering-flame","threefold-threat","hellish-endurance","summoned-torment","searing-passage","infernal-command"],
  necropolis: ["bone-wall","putrid-grasp","ethereal-escape","blood-tribute","death-cloud","dread-charge","ageing-breath"],
  dungeon: ["blind-instinct","strike-and-return","disrupting-gaze","petrifying-aim","labyrinth-cleave","barbed-revenge","predators-mark"],
  stronghold: ["cowards-luck","pack-rush","suppressing-shot","bodyguard","chain-lightning","boulder-crash","crushing-claws"],
  fortress: ["marsh-scavenger","venom-arrow","disorienting-landing","heavy-gaze","armoured-prey","potent-venom"],
  cove: ["flowing-assault","boarding-formation","return-fire","raking-dive","bewitching-bolt","scaled-intercept","toxic-counter"],
  factory: ["lucky-ricochet"],
};
const NEUTRAL_TOWN_ICONS = Object.fromEntries(Object.entries(NEUTRAL_TOWN_ICON_SLUGS).flatMap(([faction, slugs]) => slugs.map(slug => [`ntv-${slug}`, `/game-tokens/rank-ability/neutral-town/${faction}-${slug}.webp`] as const)));

export const UNIT_RANK_ABILITY_ICONS: Record<string, string> = {
  "forge-vet-cyberbrute-mend": "/game-tokens/rank-ability/forge/forge-vet-cyberbrute-mend.webp",
  "forge-vet-open-wound": "/game-tokens/rank-ability/forge/forge-vet-open-wound.webp",
  "forge-vet-tank-reposition": "/game-tokens/rank-ability/forge/forge-vet-tank-reposition.webp",
  "forge-vet-tank-death-burst": "/game-tokens/rank-ability/forge/forge-vet-tank-death-burst.webp",
  "forge-vet-jump-guard": "/game-tokens/rank-ability/forge/forge-vet-jump-guard.webp",
  "forge-vet-bruiser-guard": "/game-tokens/rank-ability/forge/forge-vet-bruiser-guard.webp",
  "forge-vet-bruiser-break": "/game-tokens/rank-ability/forge/forge-vet-bruiser-break.webp",
  "forge-vet-zombie-repair": "/game-tokens/rank-ability/forge/forge-vet-zombie-repair.webp",
  "forge-vet-grunt-tempo": "/game-tokens/rank-ability/forge/forge-vet-grunt-tempo.webp",
  "forge-vet-grunt-cover": "/game-tokens/rank-ability/forge/forge-vet-grunt-cover.webp",
  "forge-vet-grunt-mark": "/game-tokens/rank-ability/forge/forge-vet-grunt-mark.webp",
  "veteran-air-chain-lightning": "/game-tokens/rank-ability/neutral-revisions/air-chain-lightning.webp",
  "veteran-fire-damage-cap": "/game-tokens/rank-ability/neutral-revisions/fire-damage-cap.webp",
  "veteran-ranged-fire-shield": "/game-tokens/rank-ability/neutral-revisions/ranged-fire-shield.webp",
  "veteran-water-spell-power": "/game-tokens/rank-ability/neutral-revisions/water-spell-power.webp",
  "veteran-earth-spell-power": "/game-tokens/rank-ability/neutral-revisions/earth-spell-power.webp",
  "veteran-hell-steed-last-stand": "/game-tokens/rank-ability/neutral-revisions/hell-steed-last-stand.webp",
  "veteran-nightmare-death-stare-reroll": "/game-tokens/rank-ability/neutral-revisions/nightmare-death-stare-reroll.webp",
  "veteran-arctic-harden": "/game-tokens/rank-ability/neutral-revisions/arctic-harden.webp",
  "veteran-arctic-slow-shot": "/game-tokens/rank-ability/neutral-revisions/arctic-slow-shot.webp",
  "veteran-lava-ongoing-immunity": "/game-tokens/rank-ability/neutral-revisions/lava-ongoing-immunity.webp",
  "veteran-lava-burst": "/game-tokens/rank-ability/neutral-revisions/lava-burst.webp",
  "veteran-lava-burn": "/game-tokens/rank-ability/neutral-revisions/lava-burn.webp",
  "veteran-werewolf-astral-hunt": "/game-tokens/rank-ability/neutral-revisions/werewolf-astral-hunt.webp",
  "veteran-werewolf-pack-call": "/game-tokens/rank-ability/neutral-revisions/werewolf-pack-call.webp",
  ...NEUTRAL_TOWN_ICONS,
  "town-dragon-fly-landing": "/game-tokens/rank-ability/town-revisions/dragon-fly-landing.webp",
  "town-gnoll-gold": "/game-tokens/rank-ability/town-revisions/gnoll-raiders-pay.webp",
  "town-lizard-spell-draw": "/game-tokens/rank-ability/town-revisions/lizard-spell-draw.webp",
  "town-gorgon-stare-reroll": "/game-tokens/rank-ability/town-revisions/gorgon-stare-reroll.webp",
  "town-gorgon-armored-prey": "/game-tokens/rank-ability/town-revisions/gorgon-armored-prey.webp",
  "town-kobold-armored-prey": "/game-tokens/rank-ability/town-revisions/gorgon-armored-prey.webp",
  "town-wyvern-potent-poison": "/game-tokens/rank-ability/town-revisions/wyvern-potent-poison.webp",
  "town-sea-dog-ranged-retaliation": "/game-tokens/rank-ability/town-revisions/sea-dog-ranged-retaliation.webp",
  "town-seaman-survival-gold": "/game-tokens/rank-ability/town-revisions/seaman-survival-gold.webp",
  "town-sorceress-ranged-mend": "/game-tokens/rank-ability/town-revisions/sorceress-ranged-mend.webp",
  "town-sorceress-artifact-tax": "/game-tokens/rank-ability/town-revisions/sorceress-artifact-tax.webp",
  "town-haspid-toxic-hide": "/game-tokens/rank-ability/town-revisions/haspid-toxic-hide.webp",
  "town-nix-intercept": "/game-tokens/rank-ability/town-revisions/nix-intercept.webp",
  "town-yeti-specialty-aura": "/game-tokens/rank-ability/town-revisions/yeti-specialty-aura.webp",
  "town-ram-trample": "/assets/ui/rank-ability/charge.webp",
  "town-shaman-teleport-charge": "/game-tokens/rank-ability/veterancy/veteran-magma-teleport-strike.webp",
  "town-jotunn-rune-bolt": "/game-tokens/rank-ability/town-revisions/jotunn-rune-bolt.webp",
  "town-mammoth-rune-mend": "/game-tokens/rank-ability/town-revisions/mammoth-rune-mend.webp",
  "town-marksman-mark": "/assets/ui/rank-ability/precision.webp",
  "town-angel-safe": "/game-tokens/rank-ability/veterancy/dragon-fly-retaliation-penalty-2.webp",
  "town-champion-safe": "/assets/ui/rank-ability/charge.webp",
  "town-champion-two-space-safe": "/assets/ui/rank-ability/charge.webp",
  "town-gremlin-recover": "/assets/ui/rank-ability/low-roll-insight.webp",
  "town-gremlin-die": "/assets/ui/rank-ability/sure-shot.webp",
  "town-golem-shield": "/assets/ui/rank-ability/guarded.webp",
  "town-magi-recover": "/assets/ui/rank-ability/low-roll-insight.webp",
  "town-naga-mend": "/assets/ui/rank-ability/regeneration-2.webp",
  "town-black-dragon-guard": "/assets/ui/rank-ability/guarded-stance.webp",
  "town-cyclops-splash": "/assets/ui/rank-ability/double-strike.webp",
  "town-elf-guard": "/assets/ui/rank-ability/air-shield.webp",
  "town-pegasus-guard": "/assets/ui/rank-ability/guarded.webp",
  "town-dragon-hunter": "/assets/ui/rank-ability/speed-hunter.webp",
  "town-gold-dragon-dominion": "/assets/ui/rank-ability/speed-hunter.webp",
  "town-unicorn-die": "/assets/ui/rank-ability/sure-shot.webp",
  "town-familiar-backlash": "/assets/ui/rank-ability/spell-sunder.webp",
  "town-familiar-pierce": "/assets/ui/rank-ability/defense-pierce.webp",
  "town-devil-draw": "/assets/ui/rank-ability/layer-triumph.webp",
  "town-efreet-second": "/game-tokens/rank-ability/town-revisions/efreet-mend.webp",
  "town-griffin-counter": "/game-tokens/rank-ability/town-revisions/griffin-counter.webp",
  "town-halberd-hunter": "/game-tokens/rank-ability/town-revisions/halberd-hunter.webp",
  "town-halberd-aura": "/game-tokens/rank-ability/town-revisions/halberd-aura.webp",
  "town-marksman-survival": "/game-tokens/rank-ability/town-revisions/marksman-survival.webp",
  "town-crusader-undead": "/game-tokens/rank-ability/town-revisions/crusader-undead.webp",
  "town-zealot-loss": "/game-tokens/rank-ability/town-revisions/zealot-loss.webp",
  "veteran-zealot-spell-sunder": "/assets/ui/rank-ability/spell-sunder.webp",
  "town-golem-cap": "/game-tokens/rank-ability/town-revisions/golem-cap.webp",
  "town-naga-pierce": "/game-tokens/rank-ability/town-revisions/naga-pierce.webp",
  "town-titan-bolt": "/game-tokens/rank-ability/town-revisions/titan-bolt.webp",
  "town-goblin-save": "/game-tokens/rank-ability/town-revisions/goblin-save.webp",
  "town-orc-discard": "/game-tokens/rank-ability/town-revisions/orc-discard.webp",
  "town-orc-double-attack": "/assets/ui/rank-ability/double-strike.webp",
  "town-ogre-guard": "/game-tokens/rank-ability/town-revisions/ogre-guard.webp",
  "town-bird-lightning": "/game-tokens/rank-ability/town-revisions/bird-lightning.webp",
  "town-cyclops-siegebreaker-focus": "/assets/ui/rank-ability/precision.webp",
  "town-dwarf-backlash": "/game-tokens/rank-ability/town-revisions/dwarf-backlash.webp",
  "town-dragon-snare": "/game-tokens/rank-ability/town-revisions/dragon-snare.webp",
  "town-demon-paralyze": "/game-tokens/rank-ability/town-revisions/demon-paralyze.webp",
  "town-pit-mend": "/game-tokens/rank-ability/town-revisions/pit-mend.webp",
  "town-devil-slow": "/game-tokens/rank-ability/town-revisions/devil-slow.webp",
  "town-devil-luck": "/game-tokens/rank-ability/town-revisions/devil-luck.webp",
  "town-efreet-mend": "/game-tokens/rank-ability/town-revisions/efreet-mend.webp",
  "veteran-crystal-burst": "/game-tokens/rank-ability/neutral/crystal-burst.webp",
  "veteran-blind-dust": "/game-tokens/rank-ability/neutral/blind-dust.webp",
  "veteran-sandstorm": "/game-tokens/rank-ability/neutral/sandstorm.webp",
  "veteran-thunder-retaliation": "/game-tokens/rank-ability/neutral/thunder-retaliation.webp",
  "veteran-troll-resilience": "/game-tokens/rank-ability/neutral/troll-resilience.webp",
  "veteran-troll-snare": "/game-tokens/rank-ability/neutral/troll-snare.webp",
  "veteran-boar-regeneration": "/assets/ui/rank-ability/regeneration-2.webp",
  "veteran-boar-armor-break": "/assets/ui/rank-ability/defense-pierce.webp",
  "veteran-boar-brace": "/assets/ui/rank-ability/guarded-stance.webp",
  "veteran-boar-pierce": "/assets/ui/rank-ability/defense-pierce.webp",
  "veteran-dracolich-death-heal": "/assets/ui/rank-ability/soul-feast.webp",
  "veteran-nomad-hardcap": "/assets/ui/rank-ability/thick-hide.webp",
  "veteran-nomad-aura": "/assets/ui/rank-ability/fear-aura.webp",
  "veteran-mummy-attack-heal": "/assets/ui/rank-ability/soul-mend.webp",
  "veteran-mummy-last-stand": "/assets/ui/rank-ability/rebirth.webp",
  "veteran-flying-guard": "/game-tokens/rank-ability/neutral/flying-guard.webp",
  "veteran-pain-resistance": "/game-tokens/rank-ability/neutral/pain-resistance.webp",
  "veteran-peasant-bounty": "/game-tokens/rank-ability/neutral/peasant-bounty.webp",
  "veteran-dracolich-fear-aura": "/assets/ui/rank-ability/fear-aura.webp",
  "veteran-crystal-immunity": "/assets/ui/rank-ability/spell-ward.webp",
  "veteran-dragon-mark": "/game-tokens/rank-ability/dungeon-necropolis/dragon-mark.webp",
  "veteran-manticore-revenge": "/game-tokens/rank-ability/dungeon-necropolis/manticore-revenge.webp",
  "veteran-minotaur-hide": "/assets/ui/rank-ability/thick-hide.webp",
  "veteran-minotaur-cleave": "/game-tokens/rank-ability/dungeon-necropolis/minotaur-cleave.webp",
  "veteran-medusa-mend": "/game-tokens/rank-ability/dungeon-necropolis/medusa-mend.webp",
  "veteran-medusa-execution": "/game-tokens/rank-ability/dungeon-necropolis/medusa-execution.webp",
  "veteran-troglodyte-rebirth": "/assets/ui/rank-ability/rebirth.webp",
  "veteran-harpy-haste": "/assets/ui/rank-ability/flying-movement.webp",
  "veteran-harpy-vitality": "/game-tokens/rank-ability/dungeon-necropolis/harpy-vitality.webp",
  "veteran-eye-immunity": "/assets/ui/rank-ability/precision.webp",
  "veteran-skeleton-rebirth": "/game-tokens/rank-ability/dungeon-necropolis/skeleton-rebirth.webp",
  "veteran-wraith-escape": "/game-tokens/rank-ability/dungeon-necropolis/wraith-escape.webp",
  "veteran-wraith-magic": "/game-tokens/rank-ability/dungeon-necropolis/wraith-magic.webp",
  "veteran-zombie-intercept": "/game-tokens/rank-ability/dungeon-necropolis/zombie-intercept.webp",
  "veteran-zombie-rest": "/assets/ui/rank-ability/soul-mend.webp",
  "veteran-lich-pierce": "/game-tokens/rank-ability/dungeon-necropolis/lich-pierce.webp",
  "veteran-lich-mend": "/assets/ui/rank-ability/soul-mend.webp",
  "veteran-vampire-tribute": "/game-tokens/rank-ability/dungeon-necropolis/vampire-tribute.webp",
  "veteran-vampire-ward": "/game-tokens/rank-ability/dungeon-necropolis/vampire-ward.webp",
  "veteran-dragon-dread": "/game-tokens/rank-ability/dungeon-necropolis/dragon-dread.webp",
  "veteran-manticore-mend": "/assets/ui/rank-ability/regeneration-2.webp",
  "veteran-eye-splash": "/assets/ui/rank-ability/double-strike.webp",
  "veteran-skeleton-retaliation": "/assets/ui/rank-ability/retaliation-fury.webp",
  "veteran-dragon-feast": "/assets/ui/rank-ability/soul-feast.webp",
  "veteran-ice-bolt": "/game-tokens/rank-ability/conflux/veteran-ice-bolt.webp",
  "veteran-water-damper": "/game-tokens/rank-ability/conflux/veteran-water-damper.webp",
  "veteran-sprite-obstacle": "/game-tokens/rank-ability/conflux/veteran-sprite-obstacle.webp",
  "veteran-sprite-landing": "/game-tokens/rank-ability/conflux/veteran-sprite-landing.webp",
  "veteran-storm-speed": "/game-tokens/rank-ability/conflux/veteran-storm-speed.webp",
  "veteran-storm-link": "/game-tokens/rank-ability/conflux/veteran-storm-link.webp",
  "veteran-storm-link-2": "/game-tokens/rank-ability/conflux/veteran-storm-link.webp",
  "veteran-energy-delay": "/game-tokens/rank-ability/conflux/veteran-energy-delay.webp",
  "veteran-energy-fire-heal": "/game-tokens/rank-ability/conflux/veteran-energy-fire-heal.webp",
  "veteran-magma-solidify": "/game-tokens/rank-ability/conflux/veteran-magma-solidify.webp",
  "veteran-earth-shield": "/game-tokens/rank-ability/conflux/veteran-earth-shield.webp",
  "veteran-magic-dispel": "/game-tokens/rank-ability/conflux/veteran-magic-dispel.webp",
  "veteran-magic-copy": "/game-tokens/rank-ability/conflux/veteran-magic-copy.webp",
  "veteran-phoenix-activation": "/game-tokens/rank-ability/conflux/veteran-phoenix-activation.webp",
  "veteran-phoenix-nest": "/game-tokens/rank-ability/conflux/veteran-phoenix-nest.webp",
  // 2026-09-12 fill: every rank reward that still showed the Slayer fallback
  // (Phoenix, Gargoyle, Magma/Energy/Earth/Storm/Magic/Ice Elementals, Bulwark,
  // Cove, Fortress, Hydra, Doom and other rerolled lines) — Codex-painted icons
  // (scripts/veterancy-icon-gen).
  "dragon-fly-retaliation-penalty-2": "/game-tokens/rank-ability/veterancy/dragon-fly-retaliation-penalty-2.webp",
  "imperium-shock-assault": "/game-tokens/rank-ability/veterancy/imperium-shock-assault.webp",
  "reduce-spell-and-specialty-damage-1": "/game-tokens/rank-ability/veterancy/reduce-spell-and-specialty-damage-1.webp",
  "titan-ignore-ongoing": "/game-tokens/rank-ability/veterancy/titan-ignore-ongoing.webp",
  "town-ayssid-slow": "/game-tokens/rank-ability/veterancy/town-ayssid-slow.webp",
  "town-haspid-unstoppable-counter": "/game-tokens/rank-ability/veterancy/town-haspid-unstoppable-counter.webp",
  "town-hydra-forced-reroll": "/game-tokens/rank-ability/veterancy/town-hydra-forced-reroll.webp",
  "town-hydra-round-mend": "/game-tokens/rank-ability/veterancy/town-hydra-round-mend.webp",
  "town-jotunn-rune-hide": "/game-tokens/rank-ability/veterancy/town-jotunn-rune-hide.webp",
  "town-kobold-rune-step": "/game-tokens/rank-ability/veterancy/town-kobold-rune-step.webp",
  "town-mammoth-hunter": "/game-tokens/rank-ability/veterancy/town-mammoth-hunter.webp",
  "town-mammoth-last-stand": "/game-tokens/rank-ability/veterancy/town-mammoth-last-stand.webp",
  "town-ram-spell-draw": "/game-tokens/rank-ability/veterancy/town-ram-spell-draw.webp",
  "town-snow-elf-rune-strike": "/game-tokens/rank-ability/veterancy/town-snow-elf-rune-strike.webp",
  "town-wyvern-reroll": "/game-tokens/rank-ability/veterancy/town-wyvern-reroll.webp",
  "town-yeti-spell-specialty-aura": "/game-tokens/rank-ability/veterancy/town-yeti-spell-specialty-aura.webp",
  "veteran-adjacent-enfeeble": "/game-tokens/rank-ability/veterancy/veteran-adjacent-enfeeble.webp",
  "veteran-adjacent-pulse": "/game-tokens/rank-ability/veterancy/veteran-adjacent-pulse.webp",
  "veteran-arcane-echo": "/game-tokens/rank-ability/veterancy/veteran-arcane-echo.webp",
  "veteran-ayssid-two-dice": "/game-tokens/rank-ability/veterancy/veteran-ayssid-two-dice.webp",
  "veteran-behemoth-odd-defense": "/game-tokens/rank-ability/veterancy/veteran-behemoth-odd-defense.webp",
  "veteran-centaur-retaliation": "/game-tokens/rank-ability/veterancy/veteran-centaur-retaliation.webp",
  "veteran-cyber-splash": "/game-tokens/rank-ability/veterancy/veteran-cyber-splash.webp",
  "veteran-defense-pierce-2": "/game-tokens/rank-ability/veterancy/veteran-defense-pierce-2.webp",
  "veteran-distant-storm": "/game-tokens/rank-ability/veterancy/veteran-distant-storm.webp",
  "veteran-earth-defense-token": "/game-tokens/rank-ability/veterancy/veteran-earth-defense-token.webp",
  "veteran-earth-low-defense": "/game-tokens/rank-ability/veterancy/veteran-earth-low-defense.webp",
  "veteran-energy-drain": "/game-tokens/rank-ability/veterancy/veteran-energy-drain.webp",
  "veteran-frozen-guard": "/game-tokens/rank-ability/veterancy/veteran-frozen-guard.webp",
  "veteran-magic-splash": "/game-tokens/rank-ability/veterancy/veteran-magic-splash.webp",
  "veteran-magma-attack-after-move": "/game-tokens/rank-ability/veterancy/veteran-magma-attack-after-move.webp",
  "veteran-magma-guard": "/game-tokens/rank-ability/veterancy/veteran-magma-guard.webp",
  "veteran-magma-hunter": "/game-tokens/rank-ability/veterancy/veteran-magma-hunter.webp",
  "veteran-magma-overflow": "/game-tokens/rank-ability/veterancy/veteran-magma-overflow.webp",
  "veteran-magma-teleport-strike": "/game-tokens/rank-ability/veterancy/veteran-magma-teleport-strike.webp",
  "veteran-minotaur-last-stand": "/game-tokens/rank-ability/veterancy/veteran-minotaur-last-stand.webp",
  "veteran-phoenix-breath": "/game-tokens/rank-ability/veterancy/veteran-phoenix-breath.webp",
  "veteran-phoenix-rising-nest-heal": "/game-tokens/rank-ability/veterancy/veteran-phoenix-rising-nest-heal.webp",
  "veteran-renewed-rebirth": "/game-tokens/rank-ability/veterancy/veteran-renewed-rebirth.webp",
  "veteran-skeleton-last-stand": "/game-tokens/rank-ability/veterancy/veteran-skeleton-last-stand.webp",
  "veteran-sprite-spell-block": "/game-tokens/rank-ability/veterancy/veteran-sprite-spell-block.webp",
  "veteran-storm-guard": "/game-tokens/rank-ability/veterancy/veteran-storm-guard.webp",
  "veteran-troglodyte-three-dice": "/game-tokens/rank-ability/veterancy/veteran-troglodyte-three-dice.webp",
  "veteran-unicorn-enfeeble": "/game-tokens/rank-ability/veterancy/veteran-unicorn-enfeeble.webp",
  "wog-war-zealot-mirror": "/game-tokens/rank-ability/veterancy/wog-war-zealot-mirror.webp",
  "factory-armadillo-momentum": "/game-tokens/rank-ability/veterancy/factory-armadillo-momentum.webp",
  "factory-automaton-reroll": "/game-tokens/rank-ability/veterancy/factory-automaton-reroll.webp",
  "factory-automaton-round-blast": "/game-tokens/rank-ability/veterancy/factory-automaton-round-blast.webp",
  "factory-automaton-detonation-repair": "/game-tokens/rank-ability/veterancy/factory-automaton-detonation-repair.webp",
  "factory-bounty-hunter-cover": "/game-tokens/rank-ability/veterancy/factory-bounty-hunter-cover.webp",
  "factory-couatl-momentum": "/game-tokens/rank-ability/veterancy/factory-couatl-momentum.webp",
  "factory-dreadnought-speed-hunter": "/game-tokens/rank-ability/veterancy/factory-dreadnought-speed-hunter.webp",
  "factory-dreadnought-guarded": "/game-tokens/rank-ability/veterancy/factory-dreadnought-guarded.webp",
  "factory-engineer-attack-support": "/game-tokens/rank-ability/veterancy/factory-engineer-attack-support.webp",
  "factory-grenadier-guard-heal": "/game-tokens/rank-ability/forge/forge-vet-bruiser-guard.webp",
  "factory-grenadier-high-roll": "/game-tokens/rank-ability/veterancy/factory-grenadier-high-roll.webp",
  "factory-sandworm-burrow": "/game-tokens/rank-ability/veterancy/factory-sandworm-burrow.webp",
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
  "veteran-magi-spell-sunder": "/assets/ui/rank-ability/spell-sunder.webp",
  "veteran-elf-spell-sunder": "/assets/ui/rank-ability/spell-sunder.webp",
  "veteran-low-roll-insight": "/assets/ui/rank-ability/low-roll-insight.webp",
  "veteran-defense-pierce": "/assets/ui/rank-ability/defense-pierce.webp",
  "veteran-soul-feast": "/assets/ui/rank-ability/soul-feast.webp",
  "veteran-speed-hunter": "/assets/ui/rank-ability/speed-hunter.webp",
  "veteran-regeneration-2": "/assets/ui/rank-ability/regeneration-2.webp",
  "veteran-regeneration-1": "/assets/ui/rank-ability/regeneration-2.webp",
  "veteran-flying-movement": "/assets/ui/rank-ability/flying-movement.webp",
  "veteran-fear-aura": "/assets/ui/rank-ability/fear-aura.webp",
  "veteran-azure-fear-aura": "/assets/ui/rank-ability/fear-aura.webp",
  "veteran-azure-mending-scales": "/assets/ui/rank-ability/regeneration-2.webp",
  "veteran-azure-line-attack": "/game-tokens/rank-ability/azure-super-charge.webp",
  "veteran-azure-super-charge": "/game-tokens/rank-ability/azure-super-charge.webp",
  "veteran-layer-draw": "/assets/ui/rank-ability/layer-triumph.webp",
  "veteran-moving-pierce": "/assets/ui/rank-ability/moving-pierce.webp",
  "veteran-mobility-1": "/assets/ui/rank-ability/mobility.webp",
  "veteran-double-attack": "/assets/ui/rank-ability/double-strike.webp",
  "veteran-sharpshooter-mastery": "/assets/ui/rank-ability/precision.webp",
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
  // The roster-wide convention (see I-19): `commander-max-damage` always shows
  // the plain SHIP emblem, so the "every unit's XP board icon" sweep in
  // azur-lane-content.test.ts holds for the new ships too.
  "azur_lane.ayanami:commander-max-damage": "/assets/anime/icons/azur-lane/rank-ability-ayanami.webp",

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
  "wraith-heal-1": "/assets/anime/icons/mgq/rank-job-healer.webp",
  "veteran-attack-when-attacking": "/assets/anime/icons/mgq/rank-job-martial-artist.webp",
  "veteran-retaliation-fury": "/assets/anime/icons/mgq/rank-job-warrior.webp",
  "veteran-guarded-stance": "/assets/anime/icons/mgq/rank-job-guard.webp",
  "veteran-steady-aim": "/assets/anime/icons/mgq/rank-job-hunter.webp",
  "veteran-soul-feast": "/assets/anime/icons/mgq/rank-job-spiritualist.webp",
  "commander-charge": "/assets/anime/icons/mgq/rank-job-thief.webp",
  "reduce-spell-damage-1": "/assets/anime/icons/mgq/rank-job-mage.webp",
  "wog-no-negative-attack-roll": "/assets/anime/icons/mgq/rank-job-hunter.webp",
  "veteran-defense-pierce": "/assets/anime/icons/mgq/rank-job-martial-artist.webp",
  "veteran-rebirth": "/assets/anime/icons/mgq/rank-job-hero.webp",
  "veteran-low-roll-insight": "/assets/anime/icons/mgq/rank-job-gadabout.webp"
};

const RANK_ABILITY_ICON_FALLBACK = "/assets/spell-icons/slayer.png";
export const BLUE_ARCHIVE_RANK_ABILITY_ICON = "/assets/anime/icons/blue-archive/unit-experience/precision.webp";

const BLUE_ARCHIVE_RANK_ABILITY_ICONS: Record<string, string> = {
  "veteran-steady-aim": "/assets/anime/icons/blue-archive/unit-experience/precision.webp",
  "veteran-attack-when-attacking": "/assets/anime/icons/blue-archive/unit-experience/precision.webp",
  "veteran-low-roll-insight": "/assets/anime/icons/blue-archive/unit-experience/precision.webp",
  "veteran-defense-pierce": "/assets/anime/icons/blue-archive/unit-experience/precision.webp",
  "wog-no-negative-attack-roll": "/assets/anime/icons/blue-archive/unit-experience/precision.webp",
  "veteran-guarded-stance": "/assets/anime/icons/blue-archive/unit-experience/guard.webp",
  "veteran-retaliation-fury": "/assets/anime/icons/blue-archive/unit-experience/guard.webp",
  "commander-defense-token": "/assets/anime/icons/blue-archive/unit-experience/guard.webp",
  "bulwark-air-shield": "/assets/anime/icons/blue-archive/unit-experience/guard.webp",
  "commander-charge": "/assets/anime/icons/blue-archive/unit-experience/mobility.webp",
  "veteran-speed-hunter": "/assets/anime/icons/blue-archive/unit-experience/mobility.webp",
  "veteran-soul-feast": "/assets/anime/icons/blue-archive/unit-experience/recovery.webp"
};

const IMPERIUM_RANK_ABILITY_ICONS: Record<string, string> = {
  "imperium.astra_militarum": "/assets/warhammer/icons/unit-experience/astra-militarum.webp",
  "imperium.apothecary": "/assets/warhammer/icons/unit-experience/apothecary.webp",
  "imperium.space_marines": "/assets/warhammer/icons/unit-experience/assault-marines.webp",
  "imperium.rhino": "/assets/warhammer/icons/unit-experience/rhino.webp",
  "imperium.terminators": "/assets/warhammer/icons/unit-experience/terminators.webp",
  "imperium.dreadnought": "/assets/warhammer/icons/unit-experience/dreadnought.webp",
  "imperium.titan": "/assets/warhammer/icons/unit-experience/titan.webp"
};

export function unitRankAbilityIcon(abilityId: string, unitDefId?: string, mgqJob?: string): string {
  const revisedIconSources: Record<string, string> = {
    "ctv-mountain-break": "ctv-break-cover", "ntv-mountain-stillness": "veteran-troll-snare",
    "ntv-core-suppression": "ctv-meridian-exchange", "ntv-victory-command": "ntv-infernal-command",
    "ntv-ally-blind-instinct": "ctv-clear-mind", "ntv-water-air-damper": "veteran-water-damper",
    "veteran-phoenix-rising-nest": "veteran-phoenix-nest",
    "forge-vet-zombie-full-rebirth": "veteran-rebirth",
    "forge-vet-watcher-ground-air-guard": "town-elf-guard",
    "forge-vet-bruiser-die-reward": "veteran-low-roll-insight",
    "forge-vet-cyberbrute-odd-guard": "veteran-behemoth-odd-defense",
    "forge-vet-cyberbrute-shock": "veteran-cyber-splash",
    "forge-vet-tank-ground-air-guard": "town-elf-guard",
    "forge-vet-jump-round-die": "forge-vet-jump-guard",
  };
  if (revisedIconSources[abilityId]) return unitRankAbilityIcon(revisedIconSources[abilityId]!, unitDefId, mgqJob);
  // These are ability-specific images. Old faction portraits must not mask the
  // actual learned rule (notably Kivotos and Imperium's former single icons).
  if (abilityId.startsWith("ctv-")) return `/game-tokens/rank-ability/custom-town/${abilityId.slice(4)}.webp`;
  if (NEUTRAL_TOWN_ICONS[abilityId]) return NEUTRAL_TOWN_ICONS[abilityId];
  if (unitDefId && CUSTOM_VETERANCY_OVERRIDES[unitDefId] && UNIT_RANK_ABILITY_ICONS[abilityId]) {
    // MGQ's job-specific rewards keep their existing job artwork.
    if ((unitDefId.startsWith("mgq.") || mgqJob) && MGQ_JOB_RANK_ABILITY_ICONS[abilityId]) return MGQ_JOB_RANK_ABILITY_ICONS[abilityId];
    return UNIT_RANK_ABILITY_ICONS[abilityId];
  }
  if (unitDefId?.startsWith("blue_archive.")) {
    return BLUE_ARCHIVE_RANK_ABILITY_ICONS[abilityId] ?? BLUE_ARCHIVE_RANK_ABILITY_ICON;
  }
  if (unitDefId?.startsWith("imperium.")) {
    return IMPERIUM_RANK_ABILITY_ICONS[unitDefId] ?? RANK_ABILITY_ICON_FALLBACK;
  }
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

export function rankAbilityScheduleFor(unitDefId: string, side: RankScheduleSide = "faction"): RankSchedule {
  return rankScheduleFor(unitDefId, side);
}
export function inferRankAbilityTrack(unitDefId: string): string {
  return rankAbilityTrackFor(unitDefId);
}
