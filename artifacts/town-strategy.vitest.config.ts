import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Explicitly authorized town-strategy checks. Default runners stay disabled.
export default defineConfig({
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  plugins: [{ name: "town-strategy-mutations", enforce: "pre", transform(source, id) {
    const rules: Record<string, [string, string, string]> = {
      composition: ["development.ts", 'rampart: ["rampart.elves", "rampart.dwarves"]', 'rampart: ["rampart.elves", "rampart.centaurs"]'],
      first: ["army-strength.ts", 'openingBronzeCoreReady(state, playerId)) cap = 3;', 'openingBronzeCoreReady(state, playerId)) cap = 0;'],
      second: ["far-sweep.ts", 'const secured = securedFarTileIds(state, playerId);', 'return false; const secured = securedFarTileIds(state, playerId);'],
      silver: ["development.ts", 'if (state.players[playerId]?.factionId !== "necropolis" && securedFarTileIds(state, playerId).size > 0) return true;', 'if (state.players[playerId]?.factionId !== "necropolis") return false;'],
      retreat: ["necropolis-combat.ts", '!state.players[playerId] ||', 'state.players[playerId]?.factionId !== "necropolis" ||'],
      cards: ["card-planning.ts", 'if (!result && hero && state.round >= 2)', 'if (false && !result && hero && state.round >= 2)'],
      funding: ["map-navigation.ts", 'securedFarTileIds(state, hero.controllerId).size > 0', 'false'],
      gold: ["development.ts", 'return state.players[playerId]?.factionId !== "necropolis" &&', 'return false && state.players[playerId]?.factionId !== "necropolis" &&'],
      timing: ["map-navigation.ts", 'const remaining = timely.length > 0 ? timely : sweep;', 'const remaining = captures.length > 0 ? captures : sweep;'],
      goldprep: ["map-navigation.ts", 'committedGoldInvestment(state, hero.controllerId) &&', 'false && committedGoldInvestment(state, hero.controllerId) &&'],
      factory: ["development.ts", '!factoryGoldUnitConflict(player?.army ?? [], unitDefId)', 'true'],
      affordable: ["development.ts", 'if (affordable) return', 'if (false && affordable) return'],
    };
    const rule = rules[process.env.TOWN_STRATEGY_MUTATION ?? ""];
    if (rule && id.replaceAll("\\", "/").endsWith(`/computer/${rule[0]}`)) {
      if (!source.includes(rule[1])) throw Error(`Missing mutation anchor: ${rule[0]}`);
      return source.replace(rule[1], rule[2]);
    }
  } }],
  test: { environment: "node", include: ["src/engine/computer/town-strategy.test.ts"],
    maxWorkers: 1, fileParallelism: false, testTimeout: 180000 },
});
