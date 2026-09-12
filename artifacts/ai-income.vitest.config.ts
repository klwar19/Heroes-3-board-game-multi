import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Explicitly authorized income/navigation regressions only; default runners stay disabled.
export default defineConfig({
  plugins: [{ name: "income-regression-mutations", enforce: "pre", transform(source, id) {
    const name = id.replaceAll("\\", "/").split("/").at(-1);
    const mutation = process.env.TASK_AI_MUTATION;
    if (mutation === "casualty" && name === "combat-policy.ts") {
      if (!source.includes("combatIsHopeless(observation, combat)")) throw new Error("Casualty mutation anchor missing");
      return source.replaceAll("combatIsHopeless(observation, combat)", "false");
    }
    if (mutation === "baseline" && ["map-navigation.ts", "map-policy.ts", "memory.ts", "policy.ts", "premium-approach.ts"].includes(name ?? "")) {
      return execFileSync("git", ["show", `HEAD:src/engine/computer/${name}`], { encoding: "utf8" });
    }
    const rules: Record<string, [string, string, string]> = {
      expansion: ["map-policy.ts", 'if ((action.type === "DISCOVER_TILE" || action.type === "PLACE_TILE") &&', 'if (false && (action.type === "DISCOVER_TILE" || action.type === "PLACE_TILE") &&'],
      commitment: ["map-navigation.ts", "if (committedIncome) return committedIncome;", "if (false && committedIncome) return committedIncome;"],
      home: ["map-navigation.ts", "if (state.round > 2) return false;", "if (false) return false;"],
      detour: ["premium-approach.ts", 'return { score: 200, policy: "map.premium-keep-commitment" };', "return null;"],
      history: ["memory.ts", "    player?.army,", "    player?.resources, player?.army, Object.values(state.adventure?.tiles ?? {}),"],
      cycle: ["policy.ts", "base.score > 300 && returnsTowardPayoff(observation, legal.action)", "base.score > 300"],
      frontier: ["map-navigation.ts", 'if (hero.kind === "main" && state.round >= 3 && !hasOpenedFarEconomy(state, hero.controllerId))', 'if (false && hero.kind === "main" && state.round >= 3 && !hasOpenedFarEconomy(state, hero.controllerId))'],
      budget: ["combat-movement.ts", "if (!isFieldGuarded(field)", "if (true || !isFieldGuarded(field)"],
    };
    const rule = mutation && rules[mutation];
    if (rule && name === rule[0]) {
      if (!source.includes(rule[1])) throw new Error(`Mutation anchor missing: ${mutation}`);
      return source.replace(rule[1], rule[2]);
    }
  } }],
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  test: { environment: "node", include: [
    "src/engine/computer/income-commitment.test.ts",
    "src/engine/computer/premium-approach.test.ts",
  ], testTimeout: 20000, restoreMocks: true },
});
