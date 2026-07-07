import type { CardLibrary } from "@/engine/state";
import { extraAbilityCards } from "./abilities-extra";
import { adventureCards } from "./adventure";
import { artifactCards } from "./artifacts";
import { moraleCardDefinitions } from "./morale";
import { pandoraCards } from "./pandora";
import { permanentCards } from "./permanents";
import { sampleCards } from "./sample";
import { spellCards } from "./spells";

/** Every card the engine knows about: combat set + adventure + full decks. */
export const cardLibrary: CardLibrary = {
  ...sampleCards,
  ...adventureCards,
  ...spellCards,
  ...artifactCards,
  ...extraAbilityCards,
  ...permanentCards,
  ...moraleCardDefinitions,
  ...pandoraCards
};

export { WAR_MACHINE_CARD_IDS } from "./permanents";
export { pandoraDeckCardIds } from "./pandora";
export { moraleNegativeDeckCardIds, moralePositiveDeckCardIds } from "./morale";
