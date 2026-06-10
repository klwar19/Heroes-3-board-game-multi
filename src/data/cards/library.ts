import type { CardLibrary } from "@/engine/state";
import { adventureCards } from "./adventure";
import { sampleCards } from "./sample";

/** Every card the engine knows about: combat sandbox set + adventure set. */
export const cardLibrary: CardLibrary = {
  ...sampleCards,
  ...adventureCards
};
