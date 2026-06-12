import type { CardLibrary } from "@/engine/state";
import { extraAbilityCards } from "./abilities-extra";
import { adventureCards } from "./adventure";
import { artifactCards } from "./artifacts";
import { sampleCards } from "./sample";
import { spellCards } from "./spells";

/** Every card the engine knows about: combat set + adventure + full decks. */
export const cardLibrary: CardLibrary = {
  ...sampleCards,
  ...adventureCards,
  ...spellCards,
  ...artifactCards,
  ...extraAbilityCards
};
