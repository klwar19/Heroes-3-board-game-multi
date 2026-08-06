/**
 * Player-facing WARNINGS for the restrictions that are currently suppressing or
 * tolling this player's Spell casting in the open combat.
 *
 * The problem this exists for: every restriction below is enforced by removing
 * the CAST_SPELL offers (and backstopped at resolution), so from the player's
 * seat a Faerie Dragons lock, a spent per-round limit and "no unit of yours is
 * active" all look identical — the cast button is simply not there.
 *
 * NON-DRIFT CONTRACT: every notice is derived from the EXACT predicate the real
 * gate reads (`isHandLockedInCombat`, `getSpellCastRestriction`,
 * `combatEnemySpellLockUnit`, `combatEnemyPowerTaxUnit`, `payablePowerCardIds`,
 * `combatEnemyHandTaxUnit`, `spellLimitFor`, `playerActivationSpellWindowOpen`,
 * `polishSpellBookEnabled` + `playerHasSpellTimingFreedom`). Nothing here
 * re-implements a gate; where the gate logic was inline it was extracted into a
 * shared helper first. A notice can therefore never claim a restriction the
 * engine is not applying, nor stay silent while one bites.
 */
import { getSpellCastRestriction, playerHasSpellTimingFreedom } from "./active-effects";
import { cardLibrary } from "@/data/cards/library";
import {
  combatEnemyHandTaxUnit,
  combatEnemyPowerTaxUnit,
  combatEnemySpellLockUnit,
  isCombatCardWindowOpen,
  isCombatParticipant,
  handCanPayPowerTax,
  isHandLockedInCombat,
  playerActivationSpellWindowOpen
} from "./legal-actions";
import { CAST_A_SPELL_CARD_ID, polishSpellBookEnabled } from "./polish-spell-book";
import { spellLimitFor } from "./ruleset";
import type { CardLibrary, GameState, PlayerId, PlayerState } from "./state";

export type SpellCastRestrictionNotice = {
  /** Stable key (React list key / test anchor). */
  id: string;
  /** One plain-English line: what is stopping or taxing the cast. */
  text: string;
  /** `true` = no Spell can be cast at all; `false` = casting still works, at a price. */
  blocking: boolean;
};

/**
 * The Spell sources this player holds, in the shape the Pegasi offer gate reads
 * them: `fromScroll` is what `addSpellActions` passes to `handCanPayPowerTax`
 * (true only for a Scroll — a Book cast passes false there too, and since a Book
 * Spell is not in hand nothing is excluded either way).
 */
function spellSourcesFor(player: PlayerState): { cardId: string; fromScroll: boolean }[] {
  return [
    ...player.hand.map((cardId) => ({ cardId, fromScroll: false })),
    ...(player.scrolls ?? []).flatMap((scroll) =>
      scroll.spellCardIds.map((cardId) => ({ cardId, fromScroll: true }))
    ),
    ...(player.spellBook ?? []).map((cardId) => ({ cardId, fromScroll: false }))
  ];
}

/**
 * Every restriction currently suppressing or tolling `playerId`'s Spell casts in
 * the open combat, hardest block first. Empty outside combat, for a non-
 * participant, and whenever nothing is in the player's way.
 */
export function spellCastRestrictionNotices(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary
): SpellCastRestrictionNotice[] {
  const combat = state.combat;
  const player = state.players[playerId];
  if (!combat || combat.outcome || combat.setup || !player || !isCombatParticipant(state, playerId)) {
    return [];
  }

  const notices: SpellCastRestrictionNotice[] = [];
  const push = (id: string, text: string, blocking: boolean) => notices.push({ id, text, blocking });

  // 1. No hero in this fight — the whole deck is locked, Spells included.
  if (isHandLockedInCombat(state, playerId)) {
    push(
      "hand-locked",
      "No Hero of yours leads this fight, so you cannot use your Deck during this Combat — no Spells, no cards.",
      true
    );
    // Every other card-based restriction is moot while the deck is locked.
    return notices;
  }

  // 2. Recanter's Cloak. `lockAll` removes every cast offer; `minPower` lets the
  //    cast happen but nullifies it below the floor (enforced at resolution).
  const restriction = getSpellCastRestriction(state);
  if (restriction.lockAll) {
    push("recanter-lock", "Recanter's Cloak: no Hero can use Spells in this Combat.", true);
  } else if (restriction.minPower > 0) {
    push(
      "recanter-min-power",
      `Recanter's Cloak: a Spell resolving below Power ${restriction.minPower} does nothing — you can still cast, but pay enough Power.`,
      false
    );
  }

  // 3. Faerie Dragons (Creature Bank, while Stacked): a total lock while it lives.
  const spellLock = combatEnemySpellLockUnit(state, playerId);
  if (spellLock) {
    push(
      "enemy-spell-lock",
      `${spellLock.cardName} (Stacked) prevents you from casting any Spell while it lives.`,
      true
    );
  }

  // 4. Pegasi "Mystic Toll": every cast also discards a card with Power. The
  //    offer gate asks `handCanPayPowerTax(hand, cards, cardId, fromScroll)` per
  //    candidate; we ask THAT SAME question over the spell sources the player
  //    holds (hand / Scrolls / Spell Book) and only claim a hard block when none
  //    of them can pay. LIMIT: the two discard-pile casts (Helm of the Alabaster
  //    Unicorn, Ciele IV) are not enumerated here, so a player whose ONLY payable
  //    cast is one of those still sees the block wording.
  const powerTax = combatEnemyPowerTaxUnit(state, playerId);
  if (powerTax) {
    const anyPayable = spellSourcesFor(player).some(
      (source) =>
        cards[source.cardId]?.kind === "spell" &&
        handCanPayPowerTax(player.hand, cards, source.cardId, source.fromScroll)
    );
    if (!anyPayable) {
      push(
        "enemy-power-tax-unpayable",
        `${powerTax.cardName}'s Mystic Toll: each Spell costs an extra card with Power — you hold none, so you cannot cast at all.`,
        true
      );
    } else {
      push(
        "enemy-power-tax",
        `${powerTax.cardName}'s Mystic Toll: casting a Spell also discards one of your cards with Power.`,
        false
      );
    }
  }

  // 5. Familiars "Mana Leech": a chosen extra hand discard per hand cast. Never a
  //    hard block (with nothing else in hand the toll is simply skipped).
  const handTax = combatEnemyHandTaxUnit(state, playerId);
  if (handTax) {
    push(
      "enemy-hand-tax",
      `${handTax.cardName}'s Mana Leech: casting a Spell from hand also discards another card of your choice.`,
      false
    );
  }

  // 6. The per-combat-round Spell limit. Least-noisy honest reading: shown only
  //    once the limit is actually spent (we do not try to guess whether the
  //    player was about to cast). Scroll / Helm / Tarnum bonus casts stay legal,
  //    so the text says "hand and Spell Book casts".
  const limit = spellLimitFor(state, player);
  if (player.combatStats.spellsCastThisRound >= limit) {
    push(
      "spell-limit",
      `Spell limit spent for this combat round (${player.combatStats.spellsCastThisRound}/${limit}) — hand and Spell Book casts wait for the next round.`,
      true
    );
  }

  // 7. Activation timing. Only meaningful while the card window is genuinely
  //    open — during an attack, a reaction window or a pending choice nothing is
  //    offered for unrelated reasons, and claiming a timing block would be a lie.
  if (isCombatCardWindowOpen(state) && !playerActivationSpellWindowOpen(state, playerId)) {
    push(
      "no-activation-window",
      "No unit of yours is active, so activation Spells (Magic Arrow, Fireball, Haste…) cannot be cast right now — Intelligence would let you cast at any time.",
      false
    );
  }

  // 8. Polish Spell Book: a Book Spell needs a "Cast a Spell" card in hand
  //    (Intelligence stands in for it). Only shown when the Book actually holds
  //    something to cast.
  if (
    polishSpellBookEnabled(state) &&
    (player.spellBook ?? []).length > 0 &&
    !player.hand.includes(CAST_A_SPELL_CARD_ID) &&
    !playerHasSpellTimingFreedom(state, playerId)
  ) {
    push(
      "polish-no-cast-enabler",
      "Spell Book: casting needs a “Cast a Spell” card in hand (or Intelligence) — you hold neither.",
      true
    );
  }

  return notices;
}
