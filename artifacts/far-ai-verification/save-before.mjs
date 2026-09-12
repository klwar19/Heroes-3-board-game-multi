import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const folder = "artifacts/far-ai-verification/before";
mkdirSync(folder, { recursive: true });
for (const file of ["army-strength.ts", "development.ts", "map-navigation.ts", "map-policy.ts", "market-trades.ts", "premium-approach.ts"]) {
  writeFileSync(`${folder}/${file}.txt`, execFileSync("git", ["show", `HEAD:src/engine/computer/${file}`]));
}
