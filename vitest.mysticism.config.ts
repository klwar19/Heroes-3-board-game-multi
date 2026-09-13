import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Explicitly requested Mysticism checks only; the default runners stay disabled.
export default defineConfig({
  plugins: [{
    name: "mysticism-requested-mutation-check",
    enforce: "pre",
    transform(source, id) {
      const mutation = process.env.MYSTICISM_MUTATION;
      if (!mutation) return;
      const changes: Record<string, [string, string, string]> = {
        late: ["/engine/reducer.ts", "recallPlayedCardIdsForPlayer(stackItem, playerId), undefined, excluded,", "recallPlayedCardIdsForPlayer(stackItem, playerId).slice(0, recallPlayedCardIdsForPlayer(stackItem, playerId).indexOf(recalls[0].sourceCardId)), undefined, excluded,"],
        cancelled: ["/engine/reducer.ts", "if (cancelledRecall?.recallPlayedCards && cancelledRecall.recallPlayedCardLimit === undefined)", "if (false && cancelledRecall?.recallPlayedCards && cancelledRecall.recallPlayedCardLimit === undefined)"],
        preserve: ["/engine/reducer.ts", "Boolean(previousRecall?.recallPlayedCards && previousRecall.recallPlayedCardLimit === undefined)", "false"],
        mirror: ["/engine/reducer.ts", "const bookCards = [...(recall.powerBookCardIds ?? [])];\n      for (const powerCardId of recall.powerCardIds ?? [])", "const bookCards = [...(recall.powerBookCardIds ?? [])];\n      for (const powerCardId of [])"],
        reshuffle: ["/engine/decks.ts", "for (const item of state.stack)", "for (const item of [])"],
        map: ["/engine/adventure.ts", "for (const cardId of step.recallPlayedCardIds ?? [])", "for (const cardId of [])"],
        owner: ["/engine/reducer.ts", "return [...(owned ?? stackItem.modifiers.playedCardIds)];", "return [...stackItem.modifiers.playedCardIds];"],
        school: ["/engine/reducer.ts", "paidCards?.push({ cardId: sourceCardId, fromBook: false });", "/* mutation: consumed school source omitted */"],
        book: ["/engine/reducer.ts", "function takeRecallBookSource(bookCardIds: CardId[], cardId: CardId): boolean {", "function takeRecallBookSource(bookCardIds: CardId[], cardId: CardId): boolean { return false;"],
      };
      const change = changes[mutation];
      if (!change) throw Error(`Unknown mutation ${mutation}`);
      if (!id.replaceAll("\\", "/").endsWith(change[0])) return;
      const normalized = source.replaceAll("\r\n", "\n");
      if (!normalized.includes(change[1])) throw Error(`Mutation target missing: ${mutation}`);
      return normalized.replaceAll(change[1], change[2]);
    },
  }],
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  test: {
    environment: "node",
    include: ["src/engine/mysticism-recall-regression.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
