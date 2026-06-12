import type { CardLibrary } from "@/engine/state";
import { adventureCards } from "./adventure";
import { permanentCards } from "./permanents";
import { sampleCards } from "./sample";

/** Every card the engine knows about: combat sandbox set + adventure set. */
export const cardLibrary: CardLibrary = {
  ...sampleCards,
  ...adventureCards,
  ...permanentCards
};

export { WAR_MACHINE_CARD_IDS } from "./permanents";
