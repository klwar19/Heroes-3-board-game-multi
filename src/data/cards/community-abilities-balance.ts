import type { CardDefinition, CardLibrary } from "@/engine/state";

import { extraAbilityCards } from "./abilities-extra";
import { adventureCards } from "./adventure";
import { sampleCards } from "./sample";

/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * reprinted ABILITY cards.
 *
 * THE COMMITTED CARD FACE IS THE AUTHORITY (`public/assets/community-balance/
 * ability-<slug>.webp`), not this file's prose. Each entry is the PRINTED
 * definition with a replaced `effect` (plus `target` / `timing` / `phaseLimit`
 * where the reprint really changes them) and a trailing "Community pack: …"
 * `tags` line stating exactly what the engine runs — the
 * `polishBalanceAbilityCards` precedent.
 *
 * `communityBalanceCardLibrary` (`src/engine/community-balance-cards.ts`) swaps
 * these in ONLY while the house rule is on; with it off nothing here is
 * consulted and the classic ability plays its printed text byte-identically.
 * When BOTH balance packs are on the COMMUNITY definition wins (the community
 * swap is applied after the polish one at every seam).
 *
 * SCOPE — all TWELVE of the sheet's abilities are reprinted here and wired;
 * `COMMUNITY_BALANCE_NOT_IMPLEMENTED` (`src/data/cards/community-balance-art.ts`)
 * is EMPTY for this family. A reprint lands here only once the engine really
 * runs its new text.
 */

/** The printed definition a community reprint is cloned from. */
function printed(cardId: string): CardDefinition {
  const card = extraAbilityCards[cardId] ?? adventureCards[cardId] ?? sampleCards[cardId];
  if (!card) {
    throw new Error(`Community Balance Change: no printed ability ${cardId}`);
  }
  return card;
}

export const communityBalanceAbilityCards: CardLibrary = {
  // -----------------------------------------------------------------------
  // ESTATES — "Gain 2 gold. Expert: Gain 4 gold." (was 3 / 6)
  // -----------------------------------------------------------------------
  "ability.estates": {
    ...printed("ability.estates"),
    tags: [
      "ability",
      "instant",
      "gold",
      "Basic: Gain 2 gold. Expert: Gain 4 gold.",
      "Community pack: the printed 3 / 6 gold becomes 2 / 4. Nothing else about the card moves — same timing, same class, same one-shot play. An EMPOWERED Estates plays the 4-gold expert side with no crown, exactly as before."
    ],
    effect: {
      type: "GAIN_RESOURCES",
      gain: { gold: 2 },
      expertGain: { gold: 4 }
    }
  },

  // -----------------------------------------------------------------------
  // LEADERSHIP — Expert: "Draw 2 cards." (the morale token is GONE)
  // -----------------------------------------------------------------------
  "ability.leadership": {
    ...printed("ability.leadership"),
    tags: [
      "ability",
      "instant",
      "morale",
      "Basic: gain a positive Morale token. Expert: Draw 2 cards.",
      "Community pack: the EXPERT side no longer also grants the Morale token — it is the two cards and nothing else (`expertAmount: 0`, read by `gainMoraleAmount` in reducer.ts). The BASIC side is untouched: it still gains 1 Morale."
    ],
    effect: {
      type: "GAIN_MORALE",
      amount: 1,
      // The reprint's expert side prints no <positive_morale> icon at all.
      expertAmount: 0,
      expertDrawCards: 2
    }
  },

  // -----------------------------------------------------------------------
  // SCOUTING — Basic Search (4); Expert Search (5), then REMOVE this card
  // -----------------------------------------------------------------------
  "ability.scouting": {
    ...printed("ability.scouting"),
    tags: [
      "ability",
      "search",
      "Basic: Play this card before taking a Search action, then do Search (4) instead. Expert: Search (5) instead, then Remove this card.",
      "Community pack: the basic Search rises 3 → 4 and the EXPERT side keeps Search (5) but now REMOVES the card from the game instead of discarding it. Both sides are FLAT counts again — the Polish pack's relative Search (X+2) and its \"widens every Search until end of turn\" persistence are NOT on this printing, so with both packs on you get the flat community numbers, consumed by the next Search. Scouting is never played through PLAY_CARD: the engine offers it in the pre-Search pop-up (`scoutingPromptFor` / `playScoutingCard`, adventure-reducer.ts), which reads the same counts, so the button label and the reveal can never disagree. An EMPOWERED Scouting is offered BOTH buttons with no crown — the two-option choice the Empowered face prints."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Scouting",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 4 }]
      },
      expertEffect: {
        name: "Expert Scouting",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 5 }]
      }
    }
  },

  // -----------------------------------------------------------------------
  // LUCK — "This turn, you may reroll each treasure or resource die once."
  // Expert: "This turn, you may reroll each die once."
  // -----------------------------------------------------------------------
  "ability.luck": {
    ...printed("ability.luck"),
    tags: [
      "ability",
      "ongoing",
      "reroll",
      "Basic (this turn): you may reroll each Treasure or Resource die once. Expert (this turn): you may reroll each die once.",
      "Community pack: two real changes. (1) DURATION — \"this turn\" replaces the printed \"current game round\". The card is spent the moment the holder's turn ENDS (`expireCommunityLuckAtTurnEnd`, called at the TURN_ENDED / PARALLEL_TURN_ENDED seam in adventure-reducer.ts), NOT at their next turn's start like every other `current-turn` effect: a die rolled between turns — a round-start Astrologers roll such as Fluffy Rabbit's — must not be rerollable, which was the reported bug. The scoping is by DATA (`perDie` below rides these two sides alone), so the printed round-scoped card is untouched. (2) PER DIE — the reroll budget for a die kind is the NUMBER OF DICE ROLLED (`perDie`), not one per die kind for the whole round: a two-die Resource roll may be rerolled twice, and a die kind you already rerolled is offered again on a LATER roll this turn. The expert side keeps its Attack-die reroll (once per roll, never consumed) on top — and, as on the printed card, it only ever reaches dice THIS PLAYER's own units roll (`effectAppliesToUnit`'s player scope), never the neutral side's or an opponent's."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Luck",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [
          { type: "ADVENTURE_DIE_REROLL", dice: "treasure", perDie: true },
          { type: "ADVENTURE_DIE_REROLL", dice: "resource", perDie: true }
        ]
      },
      expertEffect: {
        name: "Expert Luck",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [
          { type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 1, consumeEffectOnUse: false },
          { type: "ADVENTURE_DIE_REROLL", dice: "any", perDie: true }
        ]
      }
    }
  },

  // -----------------------------------------------------------------------
  // MYSTICISM — Basic also takes back 1 card played alongside the Spell.
  // -----------------------------------------------------------------------
  "ability.mysticism": {
    ...printed("ability.mysticism"),
    tags: [
      "ability",
      "spell-recall",
      "Basic: Play immediately after casting a spell. Instead of discarding the Spell card, take it back into your hand as well as 1 card played alongside it.",
      "Community pack: the BASIC recall now also returns ONE of the cards played alongside the Spell (the Power / cost cards spent into that cast), on the MAP as well as in combat — the map recall offer and its resolution used to read the RAW printed library and could not see this side at all. The Expert side is unchanged — it still returns every card played alongside. WHICH card comes back: on the MAP the offer lists one option per candidate, so the player really chooses (`offerMapSpellKnowledgeRecall`). LIMIT (a deliberate engine reading, not a printed clause): the COMBAT recall resolves AFTER the Spell, with no player-facing window, so there the engine still returns the FIRST card played into the cast rather than opening a pick."
    ],
    effect: {
      type: "RECALL_SPELL",
      // The reprint's basic side recalls the Spell plus exactly one alongside card.
      basicRecallPlayedCards: 1,
      expertRecallPlayedCards: true
    }
  },

  // -----------------------------------------------------------------------
  // TACTICS — Basic takes the old Expert timing (crown-free); Expert becomes an
  // interrupt played when ANY unit is about to activate.
  // -----------------------------------------------------------------------
  "ability.tactics": {
    ...printed("ability.tactics"),
    tags: [
      "ability",
      "combat",
      "Basic: During Combat, you can switch the position of any 2 of your units. Expert: play when a unit is about to activate — switch the position of any 2 of your units.",
      "Community pack: the start-of-Combat setup window is GONE. BASIC is the old Expert timing and costs NO crown — on your own turn, before your active unit has moved or attacked, switch any 2 of your units. EXPERT (spend a crown) widens the moment: the unit about to activate may be ANY unit on the board, including an enemy's or a neutral's, as long as it has not yet moved or attacked — so you may reposition in answer to whoever is coming up. Which side a swap uses is derived from the board by the ONE shared read `tacticsCombatOfferIsExpert` (own active unit = basic and free; someone else's = expert and a crown) — the same predicate that labels the offer AND the board's Tactics banner, so a crown-free basic swap can never be captioned \"Tactics (expert)\" again. No new action shape was needed. In a NEUTRAL fight the guard's whole activation resolves inside the acting player's own action, so the expert side is surfaced in the `pendingNeutralStep` \"pre-activation\" pause (legal-actions.ts) — the only interruptible moment there; it opens no new window, so no seat can stall on it (the ordinary \"Let the unit act\" exit is untouched). The Polish \"or move one of your units 1 space\" arm is not on this printing."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "During Combat (your active unit has not moved): switch the position of any 2 of your units",
          combatOnly: true,
          effect: { type: "TACTICS_SWAP" }
        },
        {
          label: "Expert (spend a crown): when ANY unit is about to activate, switch the position of any 2 of your units",
          combatOnly: true,
          expertOnly: true,
          effect: { type: "TACTICS_SWAP" }
        }
      ]
    }
  },

  // -----------------------------------------------------------------------
  // ARTILLERY — Basic: 1 damage to ANY enemy unit. Expert: the Ballista
  // triple-volley, and YOU pick its target.
  // -----------------------------------------------------------------------
  "ability.artillery": {
    ...printed("ability.artillery"),
    // The printed card restricts every target to the slowest enemy; the reprint
    // drops that filter entirely, so the CARD-level target must go too (it is
    // the gate legal-actions reads when an option carries none).
    target: { type: "enemy-unit" },
    tags: [
      "ability",
      "instant",
      "war-machine",
      "Basic (during Combat): Deal 1 damage to an enemy unit. Expert: when using the Ballista card, resolve its effect against the same target 3 times — you may select the target.",
      "Community pack: the BASIC side loses the lowest-initiative restriction — it is a plain 1 effect damage to ANY enemy unit you choose, played on your own Combat activation (the sheet's ➡️ icon), so it is NOT offered as an instant inside an attack window any more (the classic/Polish instant reaction is withheld while this rule is on). The EXPERT volley is unchanged at 3 shots, but it now also grants the BALLISTA_CHOOSE_TARGET aim the moment it is played, so the volley picks ANY living enemy instead of only the slowest (a tie-break becomes a free choice). Unlike the Polish printing, the basic side grants NO aim."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Deal 1 damage to an enemy unit",
          combatOnly: true,
          target: { type: "enemy-unit" },
          effect: { type: "DEAL_DAMAGE", amount: 1, damageKind: "effect" }
        },
        {
          // Never played from hand (PLAY_CARD throws). Offered when this
          // player's Ballista fires at the start of a combat round; the engine
          // reads `shots` off the PRINTED card, so keeping 3 here keeps the two
          // printings in step.
          label: "When your Ballista fires: resolve it against the same target 3× (you pick the target)",
          expertOnly: true,
          effect: { type: "ARTILLERY_BALLISTA_VOLLEY", shots: 3 }
        }
      ]
    }
  },

  // -----------------------------------------------------------------------
  // BALLISTICS — Basic: pay 1 building material, 2 adjacent targets take 1
  // damage each. Expert: fire the Catapult twice, free.
  // -----------------------------------------------------------------------
  "ability.ballistics": {
    ...printed("ability.ballistics"),
    tags: [
      "ability",
      "instant",
      "siege",
      "Basic (during Combat): Pay 1 building material. Choose 2 adjacent targets (any combination of units, Walls and the Gate) and deal 1 damage to each. Expert: when using the Catapult, resolve its effect twice, ignoring the building-material cost.",
      "Community pack: the reprint WINS over both the classic siege demolitions and the Polish reprint. The BASIC side is the Catapult's own two-adjacent-target picker (units, Walls or the Gate — `BALLISTICS_OPENING_BOMBARD`) for 1 building material, and unlike the Polish printing it is NOT restricted to the start of Combat: it is playable on your own Combat activation at any point (the sheet's ➡️ icon). The EXPERT side is never played from hand — holding the card with a crown adds a third button to your own Catapult's round-start prompt that fires it TWICE on the same two targets and pays no building material."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Pay 1 building material: 1 damage to each of 2 adjacent targets (units, Walls or the Gate)",
          combatOnly: true,
          cost: { resources: { buildingMaterials: 1 } },
          effect: { type: "BALLISTICS_OPENING_BOMBARD", amount: 1 }
        }
        // The expert clause has NO hand play by design: it is resolved at the
        // Catapult's own round-start offer (playerCanUseBallisticsCatapultDouble
        // / spendBallisticsExpert in permanents.ts), keyed off holding this card
        // plus a free crown — the same shape Artillery's expert volley uses.
      ]
    }
  },

  // -----------------------------------------------------------------------
  // FIRST AID — Basic: heal 1 AND draw a card. Expert: the Tent triple-volley
  // AND draw a card.
  // -----------------------------------------------------------------------
  "ability.first_aid": {
    ...printed("ability.first_aid"),
    tags: [
      "ability",
      "instant",
      "heal",
      "Basic: Remove 1 damage from the selected unit. Draw a card. Expert: when using the First Aid Tent card, resolve its effect against the same target 3 times. Draw a card.",
      "Community pack: BOTH sides gain \"Draw a card.\" The basic heal keeps its 1 damage and its printed `damagedOnly` target and now draws 1 (the shared `HEAL_DAMAGE.drawCards` rider, so it also joins attack windows and the map draw-only play like every other medic rider). The expert Tent volley stays 3 heals, still costs a CROWN (the Polish printing's crown-free basic reading is overridden — community wins), and draws 1 as it is played. The Polish +2-Health arm is not on this printing."
    ],
    target: { type: "friendly-unit", damagedOnly: true },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove 1 damage from one of your units, then draw a card",
          combatOnly: true,
          effect: { type: "HEAL_DAMAGE", amount: 1, drawCards: 1 }
        },
        {
          // Never played from hand: offered when this player's First Aid Tent
          // heals (permanents.ts). `heals` is read off the PRINTED card;
          // `drawCards` is read off the ACTIVE (balanced) card, so it fires only
          // under this reprint.
          label: "When using your First Aid Tent: resolve its heal against the same target 3×, then draw a card",
          expertOnly: true,
          effect: { type: "FIRST_AID_TENT_VOLLEY", heals: 3, drawCards: 1 }
        }
      ]
    }
  },

  // -----------------------------------------------------------------------
  // INTELLIGENCE — "Play a spell from your discard pile." Expert also: it does
  // not count toward your Spell limit per Combat round.
  // -----------------------------------------------------------------------
  "ability.intelligence": {
    ...printed("ability.intelligence"),
    tags: [
      "ability",
      "magic",
      "spell-recast",
      "Basic (Instant, Combat): Play a spell from your discard pile. Expert: the same, and this spell does not count toward your Spell limit per Combat round.",
      "Community pack: Intelligence stops granting a timing FREEDOM (the classic combat-long SPELL_CAST_ANYTIME and the Polish start-of-combat window are both gone — with this pack on, the polish hand readings go dark via `polishIntelligenceHandReadingActive`). It is now a cast enabler: the offer layer lists EVERY implemented Spell card sitting in your OWN discard pile as a `fromOwnDiscard` CAST_SPELL naming this card (`anySpell`), and the cast runs the ORDINARY spell pipeline — full Power, Power sources, tier gates, targeting, the SPELL_CAST_STARTED reaction window. It is never played from hand as a PLAY_CARD (both sides are CAST_FROM_SPELL_DISCARD markers, which `isOptionEffectPlayable` refuses), and the card is DISCARDED by the cast. The printed ⚡ is wired as: playable on your own activation AND off-turn while an opponent's unit is active, and exempt from the \"one of your own units must be active\" gate an activation-timing Spell normally has. LIMIT (deliberate, not printed): a cast is NOT offered while a reaction window is already open — `isCombatCardWindowOpen` refuses every CAST_SPELL there, for Scrolls, the Helm and Ciele alike, and nesting a whole spell cast inside an open window is not a surface this engine has. BASIC counts toward the one-Spell-per-Combat-round limit (so it is withheld once the limit is spent); EXPERT does not and spends a crown, waived while the ability is EMPOWERED. LIMIT: with `polish-spell-book` on, \"your discard pile\" is read PLAINLY — the caster's own discard pile, never the Spell Book (a Book Spell is refreshed/used, not discarded, so it is a different zone)."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          // Never played from hand (isOptionEffectPlayable refuses
          // CAST_FROM_SPELL_DISCARD, and playCard throws). Surfaced by
          // addSpellActions as a `fromOwnDiscard` CAST_SPELL per castable spell
          // in the caster's discard pile.
          label: "Play a spell from your discard pile",
          combatOnly: true,
          effect: {
            type: "CAST_FROM_SPELL_DISCARD",
            ownDiscard: true,
            anySpell: true,
            // The basic side prints no "does not count" clause.
            countsTowardSpellLimit: true
          }
        },
        {
          label: "Expert: play a spell from your discard pile — it does not count toward your Spell limit per Combat round",
          combatOnly: true,
          expertOnly: true,
          effect: { type: "CAST_FROM_SPELL_DISCARD", ownDiscard: true, anySpell: true }
        }
      ]
    }
  },

  // -----------------------------------------------------------------------
  // NECROMANCY — Recruit OR Reinforce a unit you have the Dwelling for, at
  // half the gold cost (rounded down). Expert: any unit.
  // -----------------------------------------------------------------------
  "ability.necromancy": {
    ...printed("ability.necromancy"),
    tags: [
      "ability",
      "map",
      "necropolis-only",
      "Basic: Play after winning Combat other than Quick Combat. You can Recruit or Reinforce a bronze or silver unit that you have the corresponding Dwelling for, paying half the gold cost (rounded down). Expert: any unit.",
      "Community pack: two real changes to the after-combat window, both inside `queueNecromancyReinforce` (adventure.ts) keyed off the house rule. (1) A RECRUIT arm: every unit on your own faction roster whose Dwelling you have BUILT (any of your towns — `unlockedRecruitTiers`), in the mode's tiers, not already in your army, is offered as a new Few at HALF its printed gold ROUNDED DOWN (other resources unchanged), then every standing recruit discount. It runs the normal recruit gate (`playerCanRecruitFewNow`: faction roster, Dwelling tier, the one-card-per-unit rule, the Factory Couatls/Juggernauts conflict, the MGQ Gold Contract) at BOTH offer and resolve time, so nothing illegal can be minted. (2) The REINFORCE arm is now DWELLING-GATED too — the printed \"needs no Citadel, Dwelling or Population token\" is gone; a Few whose tier you have no Dwelling for is not offered. NOT ELIGIBLE, and that IS the printed gate: recruited Neutrals and won Creature-Bank cards, which are on no faction roster and have no Dwelling. LIMIT (deliberate): the community Necromancy always resolves INSIDE the after-combat window and never BANKS a discount — `REDEEM_REINFORCEMENT_DISCOUNT` carries an owned armyUnitId and cannot express a roster recruit, so the `immediate-reinforcement-prompts` house rule is IGNORED while this pack is on (the classic card still banks with the pack off). The card is spent only if you really Recruit / Reinforce / buy a Stack; Skip keeps it. Polish Unit Stacks keep their half-gold Stack arm, likewise dwelling-gated now."
    ],
    // Same engine marker as the printed card — the reprint's new behaviour lives
    // in queueNecromancyReinforce's community branch, which reads the house rule.
    effect: { type: "NECROMANCY_REINFORCE" }
  },

  // -----------------------------------------------------------------------
  // WISDOM — "+1 Power (Expert +2). The next Spell you cast does not count
  // toward the limit."
  // -----------------------------------------------------------------------
  "ability.wisdom": {
    ...printed("ability.wisdom"),
    // The printed card is a TOWN marker riding the Spell Book token. The
    // reprint is a real Combat instant played into a Spell cast, so the timing
    // and phase gate move with it.
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
    tags: [
      "ability",
      "magic",
      "spell-power",
      "Basic: +1 Power. The next Spell you cast does not count toward the limit. Expert: +2 Power instead.",
      "Community pack: Wisdom stops being a Town card entirely — it is an instant played into your own Spell cast for +1 Power (Expert, spend a crown: +2). \"Does not count toward the limit\" is implemented as +1 to THIS Combat round's Spell limit (`spellLimitBonus`, the same arm the Polish Wisdom expert uses): applied as the cast starts, it lets that very cast through for free and, if you had not cast yet, leaves the round's allowance intact for one more Spell. The printed −2 gold Mage-Guild discount and its widened Spell Search are NOT on this printing."
    ],
    effect: {
      type: "ADD_SPELL_POWER",
      amount: 1,
      expertAmount: 2,
      spellLimitBonus: 1
    }
  }
};

/** Every ability card id the Community Balance Change REPRINTS as a whole definition. */
export const COMMUNITY_BALANCE_ABILITY_IDS: readonly string[] = Object.keys(communityBalanceAbilityCards);
