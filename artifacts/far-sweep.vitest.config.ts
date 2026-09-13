import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// User-authorized Far-economy behavior checks only; default runners stay disabled.
export default defineConfig({
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  plugins: [{ name: "far-sweep-mutations", enforce: "pre", transform(source, id) {
    const rules: Record<string, [string, string, string]> = {
      sweep: ["far-sweep.ts", "if ((state.players", "return false; if ((state.players"],
      refresh: ["policy.ts", "Boolean(upcomingFight(observation))", "Boolean(false && upcomingFight(observation))"],
      losses: ["memory.ts", "Math.min(2, (mem.settlementLossStreak ?? 0) + 1)", "0"],
      silver: ["development.ts", "const profile = armyDevelopmentProfile(state, playerId);", "return false; const profile = armyDevelopmentProfile(state, playerId);"],
      hire: ["secondary-plan.ts", "!hasGoldArmy(state, playerId) ||", "false ||"],
      budget: ["combat-movement.ts", "impossibleEconomy ? 2 :", "impossibleEconomy ? 1 :"],
      collector: ["map-navigation.ts", 'if (hero.kind === "secondary" && hasGoldArmy(state, hero.controllerId))', 'if (false && hero.kind === "secondary" && hasGoldArmy(state, hero.controllerId))'],
    };
    const rule = rules[process.env.FAR_SWEEP_MUTATION ?? ""];
    if (rule && id.replaceAll("\\", "/").endsWith(`/computer/${rule[0]}`)) {
      if (!source.includes(rule[1])) throw new Error(`Missing mutation anchor: ${rule[0]}`);
      return source.replace(rule[1], rule[2]);
    }
  } }],
  test: { environment: "node", include: ["src/engine/computer/far-sweep.test.ts"],
    maxWorkers: 1, fileParallelism: false, testTimeout: 120000 },
});
