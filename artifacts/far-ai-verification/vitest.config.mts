import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
const root = process.cwd();
const variant = process.env.AI_POLICY_VARIANT ?? "current";
export default defineConfig({
  resolve: { alias: { "@": resolve(root, "src") } },
  plugins: [{
    name: "requested-ai-policy-control", enforce: "pre",
    load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (variant === "no-silver-reserve" && normalized.endsWith("/src/engine/computer/map-policy.ts")) {
        const source = readFileSync(id, "utf8");
        return source.replace('if (action.purchases.some(\n    purchase => coreUnitDefinitions[purchase.unitDefId]?.tier === "silver",',
          'if (false && action.purchases.some(\n    purchase => coreUnitDefinitions[purchase.unitDefId]?.tier === "silver",');
      }
      if (variant === "no-secondary-capture" && normalized.endsWith("/src/engine/computer/secondary-plan.ts")) {
        const source = readFileSync(id, "utf8");
        return source.replace('!hasOpenedFarEconomy(state, playerId) ||', '');
      }
      if (variant === "no-far-deadline" && normalized.endsWith("/src/engine/computer/map-navigation.ts")) {
        const source = readFileSync(id, "utf8");
        return source.replace('const fullBronzeOpening = state.round >= 3', 'const fullBronzeOpening = false && state.round >= 3');
      }
      if (variant === "no-stable-pickup" && normalized.endsWith("/src/engine/computer/map-navigation.ts")) {
        const source = readFileSync(id, "utf8");
        const target = 'if (stickyIsFree) return freeNow.find(objective => objective.spaceId === stickySpaceId)!;';
        if (!source.includes(target)) throw new Error("Sticky mutation target missing");
        return source.replace(target, '');
      }
      if (variant === "no-peaceful-route" && normalized.endsWith("/src/engine/computer/map-navigation.ts")) {
        const source = readFileSync(id, "utf8");
        return source.replace('const peacefulVisit = resolvePeacefulVisits', 'const peacefulVisit = false && resolvePeacefulVisits');
      }
      if (variant === "no-spell-reserve" && normalized.endsWith("/src/engine/computer/map-policy.ts")) {
        const source = readFileSync(id, "utf8");
        const target = 'playerGold(state, observation.playerId) - cost >= target.gold';
        if (!source.includes(target)) throw new Error("Spell reserve mutation target missing");
        return source.replace(target, 'true');
      }
      if (variant === "no-impossible-reserve" && normalized.endsWith("/src/engine/computer/combat-movement.ts")) {
        const source = readFileSync(id, "utf8");
        if (!source.includes('impossibleEconomy ? 2 :')) throw new Error("Impossible reserve mutation target missing");
        return source.replace('impossibleEconomy ? 2 :', '');
      }
      if (variant === "no-impossible-rush" && normalized.endsWith("/src/engine/computer/army-strength.ts")) {
        const source = readFileSync(id, "utf8");
        if (!source.includes('farEconomy || counts.silver')) throw new Error("Impossible rush mutation target missing");
        return source.replace('farEconomy || counts.silver', 'counts.silver');
      }
      if (variant === "no-priority" && normalized.endsWith("/src/engine/computer/map-navigation.ts")) {
        const source = readFileSync(id, "utf8");
        const start = source.indexOf("  // FAR II–III income is the opening objective");
        const end = source.indexOf('  // "Can we fight anything at all?"', start);
        if (start < 0 || end < 0) throw new Error("Priority mutation target missing");
        return source.slice(0, start) + source.slice(end);
      }
      if (variant === "old-reserve" && normalized.endsWith("/src/engine/computer/combat-movement.ts")) {
        const source = readFileSync(id, "utf8");
        const target = '(field.difficulty ?? 0) >= 4 ? 2 : 1';
        if (!source.includes(target)) throw new Error("Reserve mutation target missing");
        return source.replace(target, '(field.difficulty ?? 0) >= 2 ? 2 : 1');
      }
      if (variant === "no-bank-reserve" && normalized.endsWith("/src/engine/computer/combat-movement.ts")) {
        const source = readFileSync(id, "utf8");
        return source.replace('const bankId = fieldCreatureBankId(field);', 'const bankId = fieldCreatureBankId(field); if (bankId) return 0;');
      }
      if (variant === "no-early-market" && normalized.endsWith("/src/engine/computer/map-policy.ts")) {
        const source = readFileSync(id, "utf8");
        return source.replace('if ((state.round ?? 0) < MARKET_MIN_ROUND && !earlyTentVisit && !dwellingRush)',
          'if ((state.round ?? 0) < MARKET_MIN_ROUND && !earlyTentVisit)');
      }
      if (variant !== "before" || !id.replaceAll("\\", "/").includes("/src/engine/computer/")) return;
      const file = resolve(root, "artifacts/far-ai-verification/before", id.replaceAll("\\", "/").split("/").at(-1)! + ".txt");
      if (existsSync(file)) return readFileSync(file, "utf8");
    },
  }],
  test: {
    environment: "node", include: ["artifacts/far-ai-verification/*.test.ts"],
    fileParallelism: false, maxWorkers: 1, testTimeout: 600_000,
  },
});
