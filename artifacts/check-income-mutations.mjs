import { spawnSync } from "node:child_process";
let survivors = 0;
const requested = process.argv.slice(2);
for (const mutation of requested.length ? requested : ["expansion", "commitment", "home", "detour", "history", "cycle", "frontier", "budget", "casualty"]) {
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "artifacts/ai-income.vitest.config.ts", "src/engine/computer/income-commitment.test.ts", "-t", mutation === "frontier" ? "authoritative computer runner" : "income commitment regressions"], {
    encoding: "utf8", timeout: 120000, env: { ...process.env, TASK_AI_MUTATION: mutation },
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  const killed = result.status === 1 && output.includes("AssertionError");
  console.log(`${mutation}: ${killed ? "CAUGHT" : "NOT CAUGHT"}`);
  console.log(output.split("\n").filter(line => /×|Test Files|Tests |AssertionError/.test(line)).join("\n"));
  if (!killed) { survivors++; console.log(output); }
}
process.exitCode = survivors ? 1 : 0;
