// Focused opt-in mutation check; changes module source in this child only.
import { register } from "node:module";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
if (process.argv.includes("--child")) {
  const lowDie = process.argv.includes("--low-die");
  const hook = `
    import { readFile } from 'node:fs/promises';
    export async function load(url, context, next) {
      if (url.endsWith('/computer/card-policy.ts')) {
        const source = await readFile(new URL(url), 'utf8');
        const needle = ${JSON.stringify(lowDie ? 'Number.isFinite(cap) && currentDamage - 1 >= cap' : 'export function knowledgeExtraCastUseful(observation: ComputerObservation): boolean {')};
        if (!source.includes(needle)) throw new Error('Mutation target missing');
        return { format: 'module-typescript', shortCircuit: true,
          source: source.replace(needle, ${lowDie ? JSON.stringify('Number.isFinite(cap) && currentDamage >= cap') : "needle + '\\n return false;'"}) };
      }
      return next(url, context);
    }`;
  register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);
  await import(lowDie ? "./check-ai-low-die.mjs" : "./check-ai-knowledge.mjs");
} else {
  for (const extra of [[], ["--low-die"]]) {
  const result = spawnSync(process.execPath, ["scripts/check-ai-mutations.mjs", "--child", ...extra], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "removing useful expert Knowledge must fail the outcome check");
  assert.match(result.stderr, /AssertionError/, "mutation must fail an assertion, not loading");
  }
  console.log("PASS: removing expert Knowledge planning or -1 die allowance fails the real-engine assertions; source files unchanged.");
}
