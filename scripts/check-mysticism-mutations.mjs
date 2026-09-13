import fs from "node:fs";
import { spawnSync } from "node:child_process";
fs.mkdirSync("artifacts/mysticism-review", { recursive: true });
const results = [];
for (const mutation of ["late", "cancelled", "preserve", "mirror", "reshuffle", "map", "owner", "school", "book"]) {
  const outputFile = `artifacts/mysticism-review/mutation-${mutation}.json`;
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.mysticism.config.ts", "--reporter=json", `--outputFile=${outputFile}`], {
    env: { ...process.env, MYSTICISM_MUTATION: mutation }, encoding: "utf8", timeout: 120000,
  });
  const report = fs.existsSync(outputFile) ? JSON.parse(fs.readFileSync(outputFile, "utf8")) : null;
  const failures = report?.testResults?.flatMap((suite) => suite.assertionResults.filter((test) => test.status === "failed").map((test) => test.fullName)) ?? [];
  const killed = result.status === 1 && failures.length > 0;
  results.push({ mutation, killed, failures });
  console.log(JSON.stringify(results.at(-1)));
  if (!killed) console.log(result.stdout, result.stderr);
}
fs.writeFileSync("artifacts/mysticism-review/mutations.json", JSON.stringify(results, null, 2));
if (results.some((result) => !result.killed)) process.exitCode = 1;
