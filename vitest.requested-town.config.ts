import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/** Explicitly requested town-unit behavior checks; the default runner stays disabled. */
export default defineConfig({
  plugins: [{
    name: "requested-town-mutation-check",
    enforce: "pre",
    transform(source, id) {
      const mutation = process.env.REQUESTED_TOWN_MUTATION;
      if (!mutation) return;
      const changes: Record<string, [string, string, string]> = {
        hydra: ["/engine/reducer.ts", "if (replacementStillPlusOne && isUnitAlive(attacker)) {", "if (false && replacementStillPlusOne && isUnitAlive(attacker)) {"],
        basilisk: ["/engine/reducer.ts", "if (townVeterancy(defender, \"basilisk-lower-roll\")) {", "if (false && townVeterancy(defender, \"basilisk-lower-roll\")) {"],
        gnoll: ["/engine/town-veterancy.ts", "if (townVeterancy(attacker, \"gnoll-gold\") && (attacker.townVeterancy?.goldEarned ?? 0) < 3) {", "if (false && townVeterancy(attacker, \"gnoll-gold\")) {"],
        dragonFly: ["/engine/town-veterancy.ts", "if (townVeterancy(unit, \"dragon-fly-landing\")) {", "if (false && townVeterancy(unit, \"dragon-fly-landing\")) {"],
        titan: ["/engine/reducer.ts", "candidate.rolls.length >= 2 &&\n    !candidate.rolls.includes(1)", "false && candidate.rolls.length >= 2 &&\n    !candidate.rolls.includes(1)"],
        nix: ["/engine/town-veterancy.ts", "townVeterancy(defender, \"nix-guarded\") ||", "false ||"],
        wyvern: ["/engine/reducer.ts", "source.healIfRerollResult !== undefined &&\n    candidate.roll === source.healIfRerollResult", "false && source.healIfRerollResult !== undefined &&\n    candidate.roll === source.healIfRerollResult"],
        pitBond: ["/engine/town-veterancy.ts", "townVeterancy(attacker, \"pit-demon-bond\") &&", "false && townVeterancy(attacker, \"pit-demon-bond\") &&"],
        pitSpell: ["/data/units/abilities.ts", "effect: { type: \"REDUCE_SPELL_DAMAGE\", amount: 2 },", "effect: { type: \"REDUCE_SPELL_DAMAGE\", amount: 0 },"],
        haspid: ["/engine/town-veterancy.ts", "!retaliation && townVeterancy(attacker, \"haspid-aggressive-drill\") ? 1 : 0", "false ? 1 : 0"],
        gorgon: ["/engine/reducer.ts", "context?.kind === \"death-stare\" && townVeterancy(roller, \"gorgon-stare-reroll\")", "false && context?.kind === \"death-stare\" && townVeterancy(roller, \"gorgon-stare-reroll\")"],
        fear: ["/engine/reducer.ts", "const slows =\n        candidate.roll === 1 &&", "const slows =\n        false && candidate.roll === 1 &&"],
      };
      const change = changes[mutation];
      if (!change) throw new Error(`Unknown mutation ${mutation}`);
      if (!id.replaceAll("\\", "/").endsWith(change[0])) return;
      const normalized = source.replaceAll("\r\n", "\n");
      if (!normalized.includes(change[1])) throw new Error(`Mutation target missing: ${mutation}`);
      return normalized.replace(change[1], change[2]);
    },
  }],
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  test: {
    environment: "node",
    include: [
      "src/engine/requested-town-unit-abilities.test.ts",
      "src/engine/unit-ability-interactions.test.ts",
    ],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
