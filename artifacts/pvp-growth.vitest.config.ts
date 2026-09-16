import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
export default defineConfig({
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  plugins: [{ name: "requested-pvp-growth-mutations", enforce: "pre", transform(source, id) {
    const file = id.replaceAll("\\", "/").split("/").at(-1)!;
    const mutation = process.env.PVP_GROWTH_MUTATION;
    if (mutation === "before" && ["combat-policy.ts", "map-navigation.ts", "map-policy.ts"].includes(file)) {
      return execFileSync("git", ["show", `HEAD:src/engine/computer/${file}`], { encoding: "utf8" });
    }
    const rules: Record<string, [string, string, string]> = {
      frontier: ["policy.ts", 'if (!primary) return false;', 'if (!primary || primary.kind === "explore") return false;'],
      quick: ["choice-policy.ts", 'if (hero?.kind === "main" && hero.level < 7 && field && !field.noExperience &&', 'if (false && hero?.kind === "main" && hero.level < 7 && field && !field.noExperience &&'],
      formation: ["combat-policy.ts", 'if (reserve && role === "flying")', 'if (reserve && role !== "ranged")'],
      lanes: ["combat-policy.ts", "laneGain += Math.max(-180, Math.min(180, gain * 35));", "laneGain += 0;"],
      landing: ["combat-policy.ts", "if (best >= ATTACK_FLOOR) score = Math.max(score, best - 1);", "if (false) score = Math.max(score, best - 1);"],
      pack: ["combat-policy.ts", "damage / Math.max(1, unitRemovalHealth(defender)) < 0.5", "damageFraction < 0.5"],
      growth: ["map-navigation.ts", 'if (heroReadyForGrowth(state, hero) && homeRemaining.length === 0)', 'if (false && heroReadyForGrowth(state, hero) && homeRemaining.length === 0)'],
      doorway: ["map-navigation.ts", 'if (tileBandOffersGrowth(hero, tile.group)) opensGrowthTile = true;', 'if (false) opensGrowthTile = true;'],
      discovery: ["map-policy.ts", 'if (hero && tile && heroReadyForGrowth(state, hero) && tileBandOffersGrowth(hero, tile.group) &&', 'if (false && hero && tile && heroReadyForGrowth(state, hero) && tileBandOffersGrowth(hero, tile.group) &&'],
    };
    const rule = rules[mutation ?? ""];
    if (rule && file === rule[0]) {
      if (!source.includes(rule[1])) throw Error(`Missing mutation: ${mutation}`);
      return source.replace(rule[1], rule[2]);
    }
  } }],
  test: { environment: "node", include: ["src/engine/computer/pvp-growth.test.ts", "src/engine/computer/formation-tactics.test.ts", "src/engine/computer/combat-policy.test.ts", "src/engine/computer/map-navigation.test.ts", "src/engine/computer/town-strategy.test.ts", "artifacts/pvp-growth-progression.test.ts"], maxWorkers: 1, fileParallelism: false, testTimeout: 180000 },
});
