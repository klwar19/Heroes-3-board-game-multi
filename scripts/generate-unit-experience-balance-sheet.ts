import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { coreUnitDefinitions } from "../src/data/factions/units";
import { UNIT_RANK_THRESHOLDS } from "../src/data/units/experience";
import { unitAbilities } from "../src/data/units/abilities";
import { MGQ_JOB_LABELS, mgqJobsForUnit } from "../src/engine/mgq-jobs";
import type { MgqJob } from "../src/engine/state";
import {
  unitRankAbilityGainsAt,
  unitRankStatGainsAt,
  unitRankStep
} from "../src/engine/unit-experience";

const rankNumbers = [1, 2, 3, 4] as const;
const tierOrder = { bronze: 0, silver: 1, gold: 2, azure: 3 } as const;

function md(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function label(value: string): string {
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function sideStats(side: { attack: number; defense: number; health: number; initiative: number } | undefined): string {
  return side ? `${side.attack}/${side.defense}/${side.health}/${side.initiative}` : "—";
}

function reward(unitDefId: string, rank: number, job?: MgqJob): string {
  const def = coreUnitDefinitions[unitDefId]!;
  const stat = unitRankStatGainsAt(unitDefId, def.tier, rank, job);
  const statParts = [
    stat.attack ? `+${stat.attack} Attack` : "",
    stat.defense ? `+${stat.defense} Defense` : "",
    stat.health ? `+${stat.health} HP` : "",
    stat.initiative ? `+${stat.initiative} Initiative` : ""
  ].filter(Boolean);
  const abilityParts = unitRankAbilityGainsAt(unitDefId, rank, job).map((abilityId) => {
    const ability = unitAbilities[abilityId];
    return ability
      ? `**${md(ability.name)}** — ${md(ability.text)}`
      : `**Missing ability: ${md(abilityId)}**`;
  });
  const parts = [...statParts, ...abilityParts];
  const step = unitRankStep(unitDefId, rank, job);
  return parts.length > 0 ? parts.join("<br>") : `⚠ No new reward (${step?.kind ?? "missing"} step)`;
}

const units = Object.values(coreUnitDefinitions).sort((a, b) =>
  a.faction.localeCompare(b.faction) ||
  tierOrder[a.tier] - tierOrder[b.tier] ||
  a.name.localeCompare(b.name)
);
const lines: string[] = [
  "# Unit Experience Balance Sheet",
  "",
  "Generated from the live unit definitions and veterancy resolver. Stats are shown as **Attack/Defense/HP/Initiative**. Every R1–R4 cell is the exact reward currently granted at that rank, including engine-backed ability text.",
  "",
  "R1 rule: every unit receives exactly one small reward: +1 HP, +1 Initiative, +1 Attack while attacking, +1 Attack while retaliating, or +1 Defense while being attacked. The approved exception pool may receive permanent +1 Defense, but a unit with printed Defense 3 never gains additional permanent Defense and receives HP or Initiative instead.",
  "",
  "XP thresholds: Bronze 3/6/10/14; Silver 4/8/13/18; Gold and Azure 5/10/16/22.",
  "",
  `Total base unit definitions: **${units.length}**.`,
  ""
];

for (const faction of [...new Set(units.map((unit) => unit.faction))]) {
  lines.push(`## ${label(faction)}`, "");
  lines.push("| Unit | Tier | Printed Few → Pack/Neutral | R1 | R2 | R3 | R4 |");
  lines.push("|---|---:|---|---|---|---|---|");
  for (const unit of units.filter((candidate) => candidate.faction === faction)) {
    const second = unit.pack ?? unit.neutral;
    lines.push(
      `| ${md(unit.name)} \`${unit.id}\` | ${unit.tier} | ${sideStats(unit.few)} → ${sideStats(second)} | ${rankNumbers.map((rank) => reward(unit.id, rank)).join(" | ")} |`
    );
  }
  lines.push("");
}

const mgqUnits = units.filter((unit) => unit.faction === "mgq");
lines.push("## MGQ job-specific paths", "");
lines.push("MGQ units keep their unit-specific R1 and capstone identity while their selected Job can replace R3 with its signature. These are the exact resolved rewards for every offered unit/job combination.", "");
for (const unit of mgqUnits) {
  lines.push(`### ${md(unit.name)} \`${unit.id}\``, "");
  lines.push("| Job | R1 | R2 | R3 | R4 |");
  lines.push("|---|---|---|---|---|");
  for (const job of mgqJobsForUnit(unit.id)) {
    lines.push(`| ${MGQ_JOB_LABELS[job]} | ${rankNumbers.map((rank) => reward(unit.id, rank, job)).join(" | ")} |`);
  }
  lines.push("");
}

const output = resolve(process.cwd(), "docs", "unit-experience-balance-sheet.md");
writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${output} (${units.length} units, ${lines.length} lines)`);
