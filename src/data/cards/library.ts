import type { CardLibrary } from "@/engine/state";
import { animeArtifactCards } from "@/data/anime/artifacts";
import { animeHeroGradeCards } from "@/data/anime/hero-grades";
import { wogArtifactCards } from "@/data/wog/artifacts";
import { extraAbilityCards } from "./abilities-extra";
import { adventureCards } from "./adventure";
import { artifactCards } from "./artifacts";
import { moraleCardDefinitions } from "./morale";
import { pandoraCards } from "./pandora";
import { permanentCards } from "./permanents";
import { sampleCards } from "./sample";
import { spellCards } from "./spells";

/**
 * Every card the engine knows about: combat set + adventure + full decks.
 *
 * Anime module cards (Pháp Bảo artifacts) and WOG module cards (Wake of Gods
 * artifacts) are ALWAYS registered so hidden-info and card-lookup paths resolve
 * their definitions — they only DECK-JOIN when their module is on (see
 * `makeSharedDecks`). The Hero Grades Training Manual is ALWAYS registered too
 * but joins NO deck (bought at a shop) — see `animeNeverDeckedCardIds`.
 */
export const cardLibrary: CardLibrary = {
  ...sampleCards,
  ...adventureCards,
  ...spellCards,
  ...artifactCards,
  ...animeArtifactCards,
  ...wogArtifactCards,
  ...animeHeroGradeCards,
  ...extraAbilityCards,
  ...permanentCards,
  ...moraleCardDefinitions,
  ...pandoraCards
};

export { WAR_MACHINE_CARD_IDS } from "./permanents";
export { pandoraDeckCardIds } from "./pandora";
export { moraleNegativeDeckCardIds, moralePositiveDeckCardIds } from "./morale";
