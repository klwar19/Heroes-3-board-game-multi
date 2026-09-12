import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "artifacts/ai-income.vitest.config.ts", "src/engine/computer/premium-approach.test.ts", "-t", "allows a purposeful return"], {
  encoding: "utf8", timeout: 120000, env: { ...process.env, TASK_AI_MUTATION: "baseline" },
});
process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
console.log("Baseline exit", result.status);
