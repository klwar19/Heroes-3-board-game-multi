/**
 * Event cards (Fortress expansion) — the OPTIONAL Event deck, distinct from the
 * Astrologers Proclaim deck. Rulebook (community rewrite, main_en.pdf p.15-16):
 *
 *   - Event cards may be used in MULTIPLAYER games only.
 *   - Shuffle the Event Deck during setup.
 *   - At the start of each Resource Round (odd rounds after the first), draw
 *     and read the next Event card AFTER receiving Resources.
 *   - The starting player draws first; the drawing player rotates clockwise
 *     with every new Event.
 *   - Effects resolve in clockwise order starting with the drawer.
 *   - Cards revealed while resolving an Event are shuffled back into their
 *     respective decks (unless the Event card itself says otherwise, e.g.
 *     Shrine of the Magic Thought sends leftovers to the Spell discard pile).
 *
 * Card texts are transcribed from the REAL card scans (en.homm3bg.wiki
 * publishes full scans; every card here ships its scan in `image`), with the
 * printed icons spelled out in words. The `effect` field is the single source
 * of truth for what the engine runs — resolveEventCard / buildEventPlayerSteps
 * in src/engine/adventure.ts switch on it, and src/engine/event-cards.test.ts
 * exercises every card. There are NO display-only cards in the deck; a future
 * card that cannot be engine-enforced must go to EVENTS_NOT_IMPLEMENTED (kept
 * OUT of the deck), never shipped as inert text (CLAUDE.md #1/#2).
 */

export type EventCardEffect =
  /**
   * A Shady Auction: `lots` times, reveal the top Artifact card; every player
   * secretly bids gold (sequential hidden bids in this build — bids live in
   * adventure.events.auction and are masked in other players' views until the
   * reveal); the single highest bid pays and takes the card, a tie or an
   * all-zero round discards it to the Artifact discard pile.
   */
  | { type: "SHADY_AUCTION"; lots: number }
  /**
   * Artifact Merchant: the drawer reveals `draw` Artifact cards into a shared
   * pool; starting with the drawer, each player once may buy ANY NUMBER of
   * pool cards (minor 3 / major 5 / relic 7 gold) or a face-up top card of an
   * Artifact discard pile, then passes the pool left. Unsold cards shuffle
   * back after one full cycle.
   */
  | { type: "ARTIFACT_MERCHANT"; draw: number }
  /**
   * Crypt — each player chooses one: gain negative morale then roll 2 Treasure
   * dice, any "experience" face voids the roll, otherwise resolve one result;
   * OR gain positive morale; OR (Necropolis only) reinforce one bronze/silver
   * Few unit at half cost.
   */
  | { type: "CRYPT" }
  /**
   * Cursed Swamp — each player chooses one: gain negative morale then roll 2
   * Treasure dice and resolve one; OR remove 1+ Spells from hand and, if 2+
   * were removed, Search (3) the Artifact deck; OR discard the cheapest army
   * unit; OR (Necropolis only) reinforce one bronze/silver Few unit for free.
   */
  | { type: "CURSED_SWAMP" }
  /**
   * Den of Thieves — the DRAWER only (the printed "you", like Artifact
   * Merchant's): take the top 2 cards of one Neutral Unit deck, optionally buy
   * one at its printed cost, then place the remaining card(s) on the top or
   * the bottom of that deck.
   */
  | { type: "DEN_OF_THIEVES" }
  /**
   * Garden of Revelation — each player may: draw 4 cards from their own deck
   * OR their own discard pile; then remove any number of Spell/Ability cards
   * from hand, gaining one Search (2) of the Spell or Ability deck per two
   * removed; then discard the whole hand and draw up to the hand limit. Or
   * leave and gain nothing.
   */
  | { type: "GARDEN_OF_REVELATION" }
  /**
   * Spell market pool (Library of Enlightenment / Mage Laboratory / Shrine of
   * the Magic Thought): reveal 2 Spell cards per player into a shared pool;
   * each player may buy one for `gold` gold or `valuables` valuables.
   * `buyToDeck` (Mage Laboratory) shuffles the bought card into the buyer's
   * deck + discard pile instead of the hand. `dieAlternative` (Shrine) offers
   * rolling 1 Resource die instead of buying. `leftovers` says where unsold
   * pool cards go when the Event ends.
   */
  | {
      type: "SPELL_MARKET";
      gold: number;
      valuables: number;
      buyToDeck?: boolean;
      dieAlternative?: boolean;
      leftovers: "shuffle-into-deck" | "discard-pile";
    }
  /**
   * Magical Forest — each player must add one face-down card to a shared pool:
   * a Spell/Artifact/Ability card from hand, or a drawn-and-viewed top card of
   * the Spell/Artifact/Ability deck. Then each player either takes one RANDOM
   * card from the (shuffled) pool or gains `goldAlternative` gold. Leftovers
   * shuffle back into their decks.
   */
  | { type: "MAGICAL_FOREST"; goldAlternative: number }
  /**
   * Market of Time / School of Magic and School of War — each player may run
   * the printed sequence (discard any number of cards, draw back up to hand
   * limit + `drawBonus`; then remove any number of Ability/Spell cards from
   * hand, gaining one Search (`searchCount`) per `per` removed, of the deck(s)
   * in `searchDecks`) or leave and gain nothing.
   */
  | {
      type: "DISCARD_DRAW_REMOVE_SEARCH";
      drawBonus: number;
      per: number;
      searchCount: number;
      searchDecks: ("artifacts" | "spells" | "abilities")[];
    }
  /**
   * Marketplace — each player chooses one: roll 1 Resource die; OR trade
   * resources at Trading Post rates (trading only — no card sale / war
   * machine); OR propose ONE 1-for-1 resource exchange that the other players
   * (clockwise) may accept first-come.
   */
  | { type: "MARKETPLACE" }
  /**
   * Mercenary Camp — each player may draw up to 2 cards from ONE Neutral Unit
   * deck of their choice into a shared face-up pool; then each player may
   * Recruit one pool card at its printed cost. Leftovers return to their tier
   * decks' discard piles.
   */
  | { type: "MERCENARY_CAMP" }
  /**
   * Messenger with Supplies — each player draws the top 2 Artifact cards, then
   * either buys one (minor 3 / major 5 / relic 7 gold; the other card returns
   * to the deck) or puts both on the Artifact discard pile to roll 2 Resource
   * dice and resolve one of them.
   */
  | { type: "MESSENGER_WITH_SUPPLIES" }
  /**
   * Mischievous Leprechaun — pool 2 rolled Treasure dice + 2 rolled Resource
   * dice; starting with the drawer each player rolls 1 Treasure + 1 Resource
   * die and, on matching any die still in the pool, may take one matching die
   * and resolve it.
   */
  | { type: "MISCHIEVOUS_LEPRECHAUN" }
  /**
   * Prison — the drawer draws 2 Neutral Unit cards (any decks except Azure);
   * each player in turn buys one at its printed cost OR discards one for
   * `discardGold` gold, then passes the remaining card on; the next player
   * draws 1 more (except Azure) and repeats. The last leftover card returns to
   * its tier deck's discard pile.
   */
  | { type: "PRISON"; discardGold: number }
  /**
   * Stables — each player chooses one: their Main hero gains +1 movement, OR
   * pay 1 movement from any of their heroes to roll 1 Resource die.
   */
  | { type: "STABLES" }
  /**
   * The Villagers' Plea — each player must pick one they can afford: remove an
   * Artifact or Spell card from hand; pay 1 building material; pay 5 gold; or
   * pay 1 movement from any of their heroes. A player who can do none of these
   * is spared (nothing happens).
   */
  | { type: "VILLAGERS_PLEA" }
  /**
   * Withered Hermit — each player chooses one: name a resource, roll 3
   * Resource dice — if the named resource shows on none of them resolve one
   * die, otherwise choose one die and LOSE its resources; OR roll 1 Resource
   * die and optionally pay the shown resources to Search (2) the Artifact
   * deck; OR leave and gain nothing.
   */
  | { type: "WITHERED_HERMIT" };

export type EventCardDefinition = {
  id: string;
  name: string;
  /** Rules text as printed on the card scan, icons spelled out in words. */
  text: string;
  effect: EventCardEffect;
  expansion: "Fortress Expansion";
  /** Real card scan, fetched by scripts/fetch-events-art.py. */
  image: string;
  source: { product: string; credit: string; url: string };
};

function source(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
    credit: "Card scan and text from the fan wiki; timing per the community rulebook rewrite (p.15-16).",
    url: `https://en.homm3bg.wiki/events/${slug}/`
  };
}

/** Local scan path for an Event slug (fetched by scripts/fetch-events-art.py). */
function image(slug: string): string {
  return `/assets/events-${slug}.webp`;
}

export const eventCardDefinitions: Record<string, EventCardDefinition> = {
  "event.a_shady_auction": {
    id: "event.a_shady_auction",
    name: "A Shady Auction",
    text: "Repeat 3 times: Reveal the top card from the Artifact deck. In secret, each player takes as much gold in their hand as they are willing to pay for it. Then reveal your bets at the same time. The one with the highest proposal discards the gold and claims the card. If there are no bets or there is a tie, discard the card.",
    effect: { type: "SHADY_AUCTION", lots: 3 },
    expansion: "Fortress Expansion",
    image: image("a_shady_auction"),
    source: source("a_shady_auction")
  },
  "event.artifact_merchant": {
    id: "event.artifact_merchant",
    name: "Artifact Merchant",
    text: "Draw 5 artifacts. You can buy either any number of them or the face-up card from the Artifact discard pile. After finishing, give the rest of the cards to the player on the left. The exchange goes on until the last card is bought or the cards return to the one who drew them. Minor Artifacts cost 3 gold, Major 5 gold, Relic 7 gold.",
    effect: { type: "ARTIFACT_MERCHANT", draw: 5 },
    expansion: "Fortress Expansion",
    image: image("artifact_merchant"),
    source: source("artifact_merchant")
  },
  "event.crypt": {
    id: "event.crypt",
    name: "Crypt",
    text: "Each player chooses one option: Gain Negative Morale. Then roll 2 treasure dice. If any of them shows experience, you gain nothing. Otherwise, resolve one result. — OR — Gain Positive Morale. — OR — Only for Necropolis. Reinforce one of your bronze or silver for half the cost.",
    effect: { type: "CRYPT" },
    expansion: "Fortress Expansion",
    image: image("crypt"),
    source: source("crypt")
  },
  "event.cursed_swamp": {
    id: "event.cursed_swamp",
    name: "Cursed Swamp",
    text: "Each player chooses one option: Gain Negative Morale. Then roll 2 treasure dice and choose one result. — OR — Remove one or more Spells from your hand; if you remove at least 2, Search (3) the Artifact deck. — OR — Discard your cheapest unit. — OR — Only for Necropolis. Reinforce one of your bronze or silver for free.",
    effect: { type: "CURSED_SWAMP" },
    expansion: "Fortress Expansion",
    image: image("cursed_swamp"),
    source: source("cursed_swamp")
  },
  "event.den_of_thieves": {
    id: "event.den_of_thieves",
    name: "Den of Thieves",
    text: "Take the top 2 cards from a Neutral Unit deck of your choice. You may buy one of them. Then decide what to do with the remaining card(s) — you may place them at the bottom or top of the respective Neutral Unit deck.",
    effect: { type: "DEN_OF_THIEVES" },
    expansion: "Fortress Expansion",
    image: image("den_of_thieves"),
    source: source("den_of_thieves")
  },
  "event.garden_of_revelation": {
    id: "event.garden_of_revelation",
    name: "Garden of Revelation",
    text: "Each player chooses one option: Draw 4 cards either from your discard pile or your deck. Then Remove any number of Spell or Ability cards from your hand. For every two cards removed this way, you can perform Search (2) the Spell deck or the Ability deck. After that, discard all cards from hand and draw up to your hand limit. — OR — Leave and gain nothing.",
    effect: { type: "GARDEN_OF_REVELATION" },
    expansion: "Fortress Expansion",
    image: image("garden_of_revelation"),
    source: source("garden_of_revelation")
  },
  "event.library_of_enlightenment": {
    id: "event.library_of_enlightenment",
    name: "Library of Enlightenment",
    text: "For every player in the game, draw the top two Spell cards and put them face-up within all players' reach. Each player can buy one of these spells for 6 gold or 2 valuables.",
    effect: { type: "SPELL_MARKET", gold: 6, valuables: 2, leftovers: "shuffle-into-deck" },
    expansion: "Fortress Expansion",
    image: image("library_of_enlightenment"),
    source: source("library_of_enlightenment")
  },
  "event.mage_laboratory": {
    id: "event.mage_laboratory",
    name: "Mage Laboratory",
    text: "For every player in the game, draw two Spell cards and place them face-up within all players' reach. Each player can buy one of these spells for 4 gold or 1 valuables. If a player buys a card, they immediately shuffle their deck and discard pile along with the newly bought card.",
    effect: { type: "SPELL_MARKET", gold: 4, valuables: 1, buyToDeck: true, leftovers: "shuffle-into-deck" },
    expansion: "Fortress Expansion",
    image: image("mage_laboratory"),
    source: source("mage_laboratory")
  },
  "event.magical_forest": {
    id: "event.magical_forest",
    name: "Magical Forest",
    text: "Choose 1 Spell, Artifact, or Ability card from your hand and put it face-down on the table. — OR — Draw and view 1 card from the Spell, Artifact, or Ability deck and put it face-down on the table. When all players have added a card to the pool, shuffle it. Each player can now either take a card from the pool or gain 4 gold.",
    effect: { type: "MAGICAL_FOREST", goldAlternative: 4 },
    expansion: "Fortress Expansion",
    image: image("magical_forest"),
    source: source("magical_forest")
  },
  "event.market_of_time": {
    id: "event.market_of_time",
    name: "Market of Time",
    text: "Each player chooses one option: Discard as many cards as you want, then draw new cards up to your hand limit +2. Remove any number of Ability or Spell cards from your hand. For every two cards removed this way, you can perform Search (2) the Artifact deck. — OR — Leave and gain nothing.",
    effect: { type: "DISCARD_DRAW_REMOVE_SEARCH", drawBonus: 2, per: 2, searchCount: 2, searchDecks: ["artifacts"] },
    expansion: "Fortress Expansion",
    image: image("market_of_time"),
    source: source("market_of_time")
  },
  "event.marketplace": {
    id: "event.marketplace",
    name: "Marketplace",
    text: "Each player chooses one option: Roll 1 resource die and resolve its effects. — OR — Trade resources using Trading Post rules. — OR — Propose an exchange of resources with other players — one type of resource for one type of resource. Each player can propose one deal.",
    effect: { type: "MARKETPLACE" },
    expansion: "Fortress Expansion",
    image: image("marketplace"),
    source: source("marketplace")
  },
  "event.mercenary_camp": {
    id: "event.mercenary_camp",
    name: "Mercenary Camp",
    text: "Each player can draw up to 2 Neutral Unit cards from one of the chosen decks. Then they are spread on the table, and each player can Recruit one of them.",
    effect: { type: "MERCENARY_CAMP" },
    expansion: "Fortress Expansion",
    image: image("mercenary_camp"),
    source: source("mercenary_camp")
  },
  "event.messenger_with_supplies": {
    id: "event.messenger_with_supplies",
    name: "Messenger with Supplies",
    text: "Each player draws the 2 top cards from the Artifact deck and then chooses one option: Buy one of the cards. Minor Artifacts cards cost 3 gold, Major 5 gold, Relic 7 gold. — OR — Put them both on the Artifact discard pile to roll 2 resource dice and resolve one of them.",
    effect: { type: "MESSENGER_WITH_SUPPLIES" },
    expansion: "Fortress Expansion",
    image: image("messenger_with_supplies"),
    source: source("messenger_with_supplies")
  },
  "event.mischievous_leprechaun": {
    id: "event.mischievous_leprechaun",
    name: "Mischievous Leprechaun",
    text: "Pool 2 treasure dice and 2 resource dice, roll them, and put them within all players' reach. Starting from the player who drew this event, each player rolls 1 treasure die and 1 resource die. If they can match any of the pool's rolls, they may take one matching die from the pool and resolve its effects.",
    effect: { type: "MISCHIEVOUS_LEPRECHAUN" },
    expansion: "Fortress Expansion",
    image: image("mischievous_leprechaun"),
    source: source("mischievous_leprechaun")
  },
  "event.prison": {
    id: "event.prison",
    name: "Prison",
    text: "Draw 2 Neutral Unit cards from any deck (except for Azure). You can buy one of them or discard it to gain 3 gold. After that, pass the remaining card to the next player. That player also draws a Neutral Unit card from any deck (except for Azure) and repeats the rest of the process. The exchange goes on till every player has a chance to choose something.",
    effect: { type: "PRISON", discardGold: 3 },
    expansion: "Fortress Expansion",
    image: image("prison"),
    source: source("prison")
  },
  "event.school_of_magic_and_school_of_war": {
    id: "event.school_of_magic_and_school_of_war",
    name: "School of Magic and School of War",
    text: "Each player chooses one option: Discard as many cards as you want, then draw new cards up to your hand limit +2. Remove any number of Ability or Spell cards from your hand. For every two cards removed this way, you can perform Search (2) the Ability deck or the Spell deck. — OR — Leave and gain nothing.",
    effect: {
      type: "DISCARD_DRAW_REMOVE_SEARCH",
      drawBonus: 2,
      per: 2,
      searchCount: 2,
      searchDecks: ["abilities", "spells"]
    },
    expansion: "Fortress Expansion",
    image: image("school_of_magic_and_school_of_war"),
    source: source("school_of_magic_and_school_of_war")
  },
  "event.shrine_of_the_magic_thought": {
    id: "event.shrine_of_the_magic_thought",
    name: "Shrine of the Magic Thought",
    text: "For every player in the game, draw two random Spell cards and place them face-up within all players' reach. Each player can either buy one of these spells for 6 gold or 2 valuables or roll and resolve 1 resource die. Place the remaining, not bought, cards in the Spell discard pile.",
    effect: { type: "SPELL_MARKET", gold: 6, valuables: 2, dieAlternative: true, leftovers: "discard-pile" },
    expansion: "Fortress Expansion",
    image: image("shrine_of_the_magic_thought"),
    source: source("shrine_of_the_magic_thought")
  },
  "event.stables": {
    id: "event.stables",
    name: "Stables",
    text: "Each player chooses one option: Your Main hero gains 1 movement. — OR — Pay 1 movement from any of your heroes to roll 1 resource die.",
    effect: { type: "STABLES" },
    expansion: "Fortress Expansion",
    image: image("stables"),
    source: source("stables")
  },
  "event.the_villagers_plea": {
    id: "event.the_villagers_plea",
    name: "The Villagers' Plea",
    text: "Each player chooses one option: Remove an Artifact or Spell card from your hand. — OR — Pay 1 building materials. — OR — Pay 5 gold. — OR — Pay 1 movement from any of your heroes.",
    effect: { type: "VILLAGERS_PLEA" },
    expansion: "Fortress Expansion",
    image: image("the_villagers_plea"),
    source: source("the_villagers_plea")
  },
  "event.withered_hermit": {
    id: "event.withered_hermit",
    name: "Withered Hermit",
    text: "Each player chooses one option: Name a resource that will not show on any of the dice, then roll 3 resource dice. If you are correct, resolve one of the dice. If you are wrong, choose one result and subtract it from your resources. — OR — Roll 1 resource die. You may pay the indicated resources to Search (2) the Artifact deck. — OR — Leave and gain nothing.",
    effect: { type: "WITHERED_HERMIT" },
    expansion: "Fortress Expansion",
    image: image("withered_hermit"),
    source: source("withered_hermit")
  }
};

/** Every card above is engine-wired; the deck deals all of them. */
export const eventsDeckCardIds: string[] = Object.keys(eventCardDefinitions);

/**
 * Event cards that exist in some product but are deliberately NOT in the deck
 * because they would need an engine subsystem this game does not have. Empty
 * today — every published Fortress Event is implemented. This registry is the
 * only legal home for a future not-yet-implementable Event (CLAUDE.md #2);
 * never ship one as inert text.
 */
export const EVENTS_NOT_IMPLEMENTED: { name: string; expansion: string; needs: string }[] = [];
