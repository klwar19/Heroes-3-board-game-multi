import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  plugins: [
    {
      name: "necropolis-behavior-mutations",
      enforce: "pre",
      transform(source, id) {
        const rules: Record<string, [string, string, string]> = {
          human: [
            "map-policy.ts",
            "!neutralsArePlayerControlled(state, observation.playerId)",
            "true",
          ],
          arming: [
            "adventure-reducer.ts",
            '(state.controllers?.[action.playerId]?.kind !== "computer" || hasNecromancyPlan(state, action.playerId))',
            '(state.controllers?.[action.playerId]?.kind !== "computer")',
          ],
          progression: [
            "development.ts",
            "!state.computerMemory?.[playerId]?.necromancyVampirePackEarned &&",
            "true &&",
          ],
          formation: [
            "combat-policy.ts",
            "const front = isFrontlineCell(combat, playerId, position);",
            "return 0; const front = isFrontlineCell(combat, playerId, position);",
          ],
          gold: [
            "development.ts",
            'if (tier === "gold" || tier === "azure") return 8;',
            'if (tier === "gold" || tier === "azure") return 0;',
          ],
          crown: [
            "card-policy.ts",
            "return goldUpgrade ? 45 : -30;",
            "return -30;",
          ],
          removal: [
            "map-policy.ts",
            'inner.type === "REMOVE_CARD_FROM_PILE" && (inner.cardId',
            'false && inner.type === "REMOVE_CARD_FROM_PILE" && (inner.cardId',
          ],
          movement: [
            "combat-policy.ts",
            "score += 110 + Math.min(60,best - ATTACK_FLOOR)",
            "score += 0",
          ],
          retreat: [
            "necropolis-combat.ts",
            "  const own = Object.values(combat.units)",
            "  return false; const own = Object.values(combat.units)",
          ],
          mulligan: [
            "policy.ts",
            "const openingNecromancyHunt = wantsOpeningNecromancy(observation)",
            "const openingNecromancyHunt = false",
          ],
          arrow: ["policy.ts", 'entry.cardId === "spell.magic_arrow" ||', "false ||"],
          necromancy: [
            "map-policy.ts",
            'score: action.kind === "reinforce" ? 1_135 +',
            'score: action.kind === "reinforce" ? 200 +',
          ],
          expansion: [
            "premium-approach.ts",
            'primary && primary.kind !== "explore" && field',
            "primary && field",
          ],
        };
        const rule = rules[process.env.NECRO_MUTATION ?? ""];
        if (rule && id.replaceAll("\\", "/").endsWith(`/${rule[0]}`)) {
          if (!source.includes(rule[1]))
            throw Error(`Missing mutation anchor ${rule[0]}`);
          return source.replace(rule[1], rule[2]);
        }
      },
    },
  ],
  test: {
    environment: "node",
    include: ["src/engine/computer/necropolis-strategy.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 180000,
  },
});
