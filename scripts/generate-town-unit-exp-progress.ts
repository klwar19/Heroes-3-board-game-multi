import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { animeTownUnitDefinitions } from "../src/data/anime/towns";
import { mgqUnitDefinitions } from "../src/data/anime/mgq";
import { coreUnitDefinitions } from "../src/data/factions/units";
import type { UnitSideDefinition } from "../src/data/factions/types";
import { unitAbilities } from "../src/data/units/abilities";
import { UNIT_RANK_THRESHOLDS } from "../src/data/units/experience";
import {
  unitRankAbilityGainsAt,
  unitRankStatGainsAt,
} from "../src/engine/unit-experience";

const tierOrder = { bronze: 0, silver: 1, gold: 2, azure: 3 } as const;
const excludedIds = new Set([
  ...Object.keys(animeTownUnitDefinitions),
  ...Object.keys(mgqUnitDefinitions),
]);

function md(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function label(value: string): string {
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function stats(side: UnitSideDefinition | undefined): string {
  return side
    ? `Attack ${side.attack}, Defense ${side.defense}, Health ${side.health}, Initiative ${side.initiative}`
    : "Not available";
}

function printedAbilities(side: UnitSideDefinition | undefined): string {
  if (!side) return "Not available";
  if (side.abilities.length === 0) return side.abilityText ? md(side.abilityText) : "None";
  return side.abilities.map((abilityId) => {
    const ability = unitAbilities[abilityId];
    return ability
      ? `**${md(ability.name)}** — ${md(ability.text)}`
      : `**${md(label(abilityId))}** — ${md(side.abilityText ?? "No rules text is registered.")}`;
  }).join("<br>");
}

function rankReward(unitId: string, tier: keyof typeof tierOrder, rank: 1 | 2 | 3 | 4): string {
  const gain = unitRankStatGainsAt(unitId, tier, rank);
  const rewards = [
    gain.attack ? `+${gain.attack} Attack` : "",
    gain.defense ? `+${gain.defense} Defense` : "",
    gain.health ? `+${gain.health} Health` : "",
    gain.initiative ? `+${gain.initiative} Initiative` : "",
  ].filter(Boolean);
  for (const abilityId of unitRankAbilityGainsAt(unitId, rank)) {
    const ability = unitAbilities[abilityId];
    rewards.push(ability
      ? `**${md(ability.name)}** — ${md(ability.text)}`
      : `**${md(label(abilityId))}** — No rules text is registered.`);
  }
  return rewards.join("<br>") || "No new reward";
}

const units = Object.values(coreUnitDefinitions)
  .filter((unit) => unit.faction !== "neutral" && !excludedIds.has(unit.id))
  .sort((a, b) => a.faction.localeCompare(b.faction)
    || tierOrder[a.tier] - tierOrder[b.tier]
    || a.name.localeCompare(b.name));

const factions = [...new Set(units.map((unit) => unit.faction))];
const lines = [
  "# All town-unit experience progressions (anime and wuxia excluded)",
  "",
  "Generated from the current unit definitions and live veterancy resolver. Neutral creatures, anime-town units, and MGQ/wuxia units are excluded. Stats and ability effects are written out in full rather than listed only by name.",
  "",
  "## Experience thresholds",
  "",
  `- Bronze: Seasoned ${UNIT_RANK_THRESHOLDS.bronze[0]} XP; Veteran ${UNIT_RANK_THRESHOLDS.bronze[1]} XP; Elite ${UNIT_RANK_THRESHOLDS.bronze[2]} XP; Legend ${UNIT_RANK_THRESHOLDS.bronze[3]} XP.`,
  `- Silver: Seasoned ${UNIT_RANK_THRESHOLDS.silver[0]} XP; Veteran ${UNIT_RANK_THRESHOLDS.silver[1]} XP; Elite ${UNIT_RANK_THRESHOLDS.silver[2]} XP; Legend ${UNIT_RANK_THRESHOLDS.silver[3]} XP.`,
  `- Gold/Azure: Seasoned ${UNIT_RANK_THRESHOLDS.gold[0]} XP; Veteran ${UNIT_RANK_THRESHOLDS.gold[1]} XP; Elite ${UNIT_RANK_THRESHOLDS.gold[2]} XP; Legend ${UNIT_RANK_THRESHOLDS.gold[3]} XP.`,
  "",
  `Included: **${units.length} units across ${factions.length} towns** (${factions.map(label).join(", ")}).`,
  "",
];

for (const faction of factions) {
  lines.push(`## ${label(faction)}`, "");
  for (const unit of units.filter((candidate) => candidate.faction === faction)) {
    const thresholds = UNIT_RANK_THRESHOLDS[unit.tier];
    lines.push(`### ${md(unit.name)} (${label(unit.tier)})`, "");
    lines.push(`- **Few stats:** ${stats(unit.few)}`);
    lines.push(`- **Few printed abilities:** ${printedAbilities(unit.few)}`);
    lines.push(`- **Pack stats:** ${stats(unit.pack)}`);
    lines.push(`- **Pack printed abilities:** ${printedAbilities(unit.pack)}`);
    lines.push(`- **Rank 1 — Seasoned (${thresholds[0]} XP):** ${rankReward(unit.id, unit.tier, 1)}`);
    lines.push(`- **Rank 2 — Veteran (${thresholds[1]} XP):** ${rankReward(unit.id, unit.tier, 2)}`);
    lines.push(`- **Rank 3 — Elite (${thresholds[2]} XP):** ${rankReward(unit.id, unit.tier, 3)}`);
    lines.push(`- **Rank 4 — Legend (${thresholds[3]} XP):** ${rankReward(unit.id, unit.tier, 4)}`);
    lines.push("");
  }
}

const output = resolve(process.cwd(), "artifacts", "town-unit-exp-progress.md");
writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} (${units.length} units, ${factions.length} towns)`);
