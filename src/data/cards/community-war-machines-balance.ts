import type { CardLibrary } from "@/engine/state";

import { permanentCards } from "./permanents";

/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * reprinted WAR MACHINE cards (the sheet's War Machines tab, 3 cards).
 *
 * The reprint changes NOTHING but the two shop prices on each card, so each
 * entry is the printed definition with a replaced `warMachineCosts` and a
 * trailing "Community pack: …" tag stating exactly what runs. The machines'
 * combat behaviour (the Ammo Cart's ranged waiver + initiative, the Ballista's
 * round-start shot, the Tent's heal) is UNTOUCHED.
 *
 *   Ammo Cart      5 → 3 gold at the Blacksmith,  8 → 5 at the Trading Post
 *   Ballista       7 → 4 gold at the Blacksmith, 10 → 6 at the Trading Post
 *   First Aid Tent 3 → 5 gold at the Blacksmith (a PRICE RISE), 6 → 7 at the Post
 *
 * NOT on the sheet and deliberately untouched: the CATAPULT (8/12) and the
 * CANNON (10/14), and every 5-gold `GAIN_WAR_MACHINE` specialty grant (those
 * pay a printed card cost, not a shop price).
 *
 * "Blacksmith" on the sheet is this engine's `warMachineCosts.factory` rung —
 * the town War Machine Factory / Blacksmith shop (`WAR_MACHINE_SHOP`); "Trade
 * Post" is `warMachineCosts.tradingPost`, read by the Trading Post visit and by
 * the Wandering Merchant's discount offer (which subtracts its discount from
 * this new base).
 *
 * `balanceCardLibrary` swaps these in ONLY while the house rule is on; with it
 * off nothing here is consulted and every shop charges the printed price.
 */
const reprint = (
  cardId: string,
  factoryGold: number,
  tradingPostGold: number,
  note: string
): CardLibrary[string] => {
  const printed = permanentCards[cardId];
  if (!printed) {
    throw new Error(`community war-machine reprint for a card that does not exist: ${cardId}`);
  }
  return {
    ...printed,
    warMachineCosts: { factory: { gold: factoryGold }, tradingPost: { gold: tradingPostGold } },
    tags: [...(printed.tags ?? []), `Community pack: ${note}`]
  };
};

export const communityBalanceWarMachineCards: CardLibrary = {
  "war_machine.ammo_cart": reprint(
    "war_machine.ammo_cart",
    3,
    5,
    "costs 3 gold at the Blacksmith / War Machine Factory and 5 at the Trading Post (printed 5 / 8)."
  ),
  "war_machine.ballista": reprint(
    "war_machine.ballista",
    4,
    6,
    "costs 4 gold at the Blacksmith / War Machine Factory and 6 at the Trading Post (printed 7 / 10)."
  ),
  "war_machine.first_aid_tent": reprint(
    "war_machine.first_aid_tent",
    5,
    7,
    "costs 5 gold at the Blacksmith / War Machine Factory and 7 at the Trading Post (printed 3 / 6) — a price RISE."
  )
};

export const COMMUNITY_BALANCE_WAR_MACHINE_IDS = Object.keys(communityBalanceWarMachineCards);
