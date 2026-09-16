import { register } from "node:module";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const mode = process.argv[2];
if (mode) {
  const hook = `
    import { readFile } from 'node:fs/promises';
    export async function load(url, context, next) {
      if (url.endsWith('/computer/${mode === "retreat" ? "policy" : ["necromancy", "arrow-chain"].includes(mode) ? "card-policy" : "combat-policy"}.ts')) {
        let source = await readFile(new URL(url), 'utf8');
        ${mode === "retreat" ? `source = source.replace('observation.playerId, observation.state.combat) === "retreat"', 'observation.playerId, observation.state.combat) === "mutation.disabled"');` : mode === "arrow-chain" ?
          `source = source.replace('export function knowledgeExtraCastUseful(observation: ComputerObservation): boolean {', 'export function knowledgeExtraCastUseful(observation: ComputerObservation): boolean { return false;');` : mode === "necromancy" ?
          `source = source.replace('return 1_140;', 'return 180;');` :
          `source = source.replaceAll('=== "stronghold.orcs"', '=== "mutation.disabled_orcs"');`}
        return { format: 'module-typescript', shortCircuit: true, source };
      }
      return next(url, context);
    }`;
  register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);
  await import("./check-ai-impossible.mjs");
} else {
  for (const mutation of ["retreat", "formation", "necromancy", "arrow-chain"]) {
    const result = spawnSync(process.execPath, ["scripts/check-ai-impossible-mutations.mjs", mutation], { encoding: "utf8" });
    assert.notEqual(result.status, 0, `${mutation} mutation must fail`);
    assert.match(result.stderr, /AssertionError/, "fail on observable behavior, not loading");
  }
  console.log("PASS: disabling immediate retreat, Orc frontline policy, post-victory Necromancy, or Arrow recall planning fails the engine checks; source files unchanged.");
}
