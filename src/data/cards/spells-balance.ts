import type { CardDefinition, CardLibrary } from "@/engine/state";

import { spellCards } from "./spells";
import { sampleCards } from "./sample";

/**
 * Polish Balance Pack (`polish-card-balance`) — the 21 reprinted SPELL cards.
 *
 * THE COMMITTED CARD FACE IS THE AUTHORITY (the pack's own graphics folder), not
 * the balance spreadsheet: every ladder below was read off
 * `public/assets/polish-balance/spell-<slug>.webp` and several print a FULL
 * three-rung Power ladder where the sheet carried only two values. Face-vs-sheet
 * divergences are called out per card.
 *
 * Each entry is the PRINTED card with a replaced `effect` (and, where the
 * reprint changes when the card may be played, a replaced timing/target), so
 * everything the engine reads off a card — kind, schools, level, deck
 * membership, uniqueness, art — is untouched. `polishBalanceSpellLibrary` in
 * `src/engine/polish-balance-spells.ts` swaps these definitions in ONLY while
 * the house rule is on; with it off nothing here is consulted and every card
 * plays its printed text.
 *
 * `tags`' last entry is the human-readable "Balance pack: …" text (the
 * `initiative-specialty-draw` precedent) so a reader of the definition sees
 * exactly what the engine runs under the rule.
 *
 * DELIBERATE READINGS / LIMITS, stated up front (CLAUDE.md #4):
 *  - PRAYER's printed duration is "until its activation in the next combat
 *    round". The closest existing duration is `next-activation`, which ends when
 *    that unit's next activation ENDS — one activation's worth longer than the
 *    printed wording. No new duration was invented for the half-step.
 *  - ANTI-MAGIC's "takes no damage from Spells" is a very large
 *    SPELL_DAMAGE_REDUCTION, not a separate immunity flag, so the Orb of
 *    Vulnerability (which switches every spell-damage reduction off) also
 *    switches this half off. The targeting ward and the Specialty half are
 *    unaffected.
 *  - DISPEL's Power-2 "ALL effects in the combat" clears every REMOVABLE ongoing
 *    effect on BOTH sides, the caster's own buffs included — it is the printed
 *    "all", not "all the enemy's".
 *  - BLESS at Power 3 lays ONE unit-scoped effect per ground/flying unit, so a
 *    Dispel lifts it from one unit at a time rather than all at once.
 */

/** The printed definition a balance reprint is cloned from. */
function printed(cardId: string): CardDefinition {
  const card = spellCards[cardId] ?? sampleCards[cardId];
  if (!card) {
    throw new Error(`Polish Balance Pack: no printed spell ${cardId}`);
  }
  return card;
}

/**
 * Clone `cardId`'s printed definition with `patch` applied. Keys explicitly set
 * to `undefined` in `patch` are DELETED (Bless drops its reaction `trigger`,
 * Misfortune drops nothing but gains one) — a plain spread would keep them.
 */
function reprint(cardId: string, patch: Partial<CardDefinition>): CardDefinition {
  const next = { ...printed(cardId), ...patch } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    }
  }
  return next as CardDefinition;
}

function tags(cardId: string, balanceText: string): string[] {
  const base = printed(cardId).tags ?? [];
  // Drop the printed rules line (always the last tag) — it would promise the
  // classic numbers — and state the reprint instead.
  const keep = base.slice(0, Math.max(0, base.length - 1)).filter((tag) => !tag.startsWith("Instant:") && !tag.startsWith("Ongoing:") && !tag.startsWith("Activation:"));
  return [...keep, `Balance pack: ${balanceText}`];
}

export const polishBalanceSpellCards: CardLibrary = {
  // Anti-Magic — the ward now blocks Spell/Specialty DAMAGE too, and the top
  // rung reads "ANY except azure" (= gold) at Power 2 instead of Power 4.
  "spell.anti_magic": reprint("spell.anti_magic", {
    tags: tags(
      "spell.anti_magic",
      "Ongoing: until the end of the Combat the selected unit cannot be targeted by Spells and takes no damage from Spells or Specialties: Power 0: bronze; Power 1: bronze or silver; Power 2: any except azure."
    ),
    effect: {
      type: "CREATE_SPELL_IMMUNITY",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" },
      duration: { type: "combat" },
      blocksSpellAndSpecialtyDamage: true
    }
  }),

  // Bless — was a one-attack instant; the reprint is a 1-combat-round buff on a
  // ground/flying unit (it ignores its Attack die), and at Power 3 it lands on
  // EVERY ground/flying unit you control. FACE vs SHEET: the face prints the
  // full 0 / 1 / 3 ladder (rung 0 grants no attack, only the die skip).
  "spell.bless": reprint("spell.bless", {
    timing: "combat",
    phaseLimit: ["combat"],
    trigger: undefined,
    target: { type: "friendly-unit", unitTypes: ["ground", "flying"] },
    tags: tags(
      "spell.bless",
      "Ongoing: for 1 combat round the selected ground or flying unit ignores the Attack die roll and gains: Power 0: nothing; Power 1: +1 attack; Power 3: all your ground/flying units +1 attack."
    ),
    effect: {
      type: "CREATE_ATTACK_BUFF",
      name: "Bless",
      amountByPower: { 0: 0, 1: 1, 3: 1 },
      duration: { type: "current-combat-round" },
      polarity: "positive",
      removable: true,
      ignoreAttackDie: true,
      allGroundFlyingAtPower: 3
    }
  }),

  // Blind — the top rung is "ANY" (azure included), not gold.
  "spell.blind": reprint("spell.blind", {
    tags: tags(
      "spell.blind",
      "Activation: place a paralysis token on the selected unit: Power 0: bronze; Power 1: bronze or silver; Power 2: any tier."
    ),
    effect: { type: "PLACE_PARALYSIS", gradeByPower: { 0: "bronze", 1: "silver", 2: "azure" } }
  }),

  // Counterstrike — the same tiers, reachable at Power 0 / 1 / 3 (was 0 / 2 / 4).
  "spell.counterstrike": reprint("spell.counterstrike", {
    tags: tags(
      "spell.counterstrike",
      "Instant: remove the Black cube from the selected unit card — it may perform a Retaliation Attack again: Power 0: bronze; Power 1: bronze or silver; Power 3: bronze, silver or gold."
    ),
    effect: { type: "CLEAR_RETALIATION", gradeByPower: { 0: "bronze", 1: "silver", 3: "gold" } }
  }),

  // Dispel — the top rung is "ANY unit or ALL effects": at Power 2 the caster
  // picks between the printed unit/space cleanse and wiping every ongoing
  // effect in the Combat.
  "spell.dispel": reprint("spell.dispel", {
    tags: tags(
      "spell.dispel",
      "Instant: remove all ongoing effects from a space, or a unit and the space it occupies: Power 0: bronze; Power 1: bronze or silver; Power 2: any unit — OR all ongoing effects in the Combat."
    ),
    effect: {
      type: "DISPEL_EFFECTS",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "azure" },
      allInCombatAtPower: 2
    }
  }),

  // Disrupting Ray — top rung "ANY", and the caster picks ability-suppression
  // OR a lasting -1 Defense.
  "spell.disrupting_ray": reprint("spell.disrupting_ray", {
    tags: tags(
      "spell.disrupting_ray",
      "Ongoing: until the end of the Combat the selected unit cannot use their special ability OR suffers -1 Defense (the caster picks): Power 0: bronze; Power 1: bronze or silver; Power 2: any tier."
    ),
    effect: {
      type: "DISRUPTING_RAY",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "azure" },
      defenseChoice: 1
    }
  }),

  // Fire Shield — same damage ladder, but it burns "during this AND next Combat
  // round" instead of only the current one.
  "spell.fire_shield": reprint("spell.fire_shield", {
    tags: tags(
      "spell.fire_shield",
      "Ongoing: when the targeted unit is attacked by an adjacent unit during this AND the next Combat round, the attacker takes: Power 0: 1 damage; Power 2: 2 damage; Power 4: 3 damage."
    ),
    effect: {
      type: "CREATE_FIRE_SHIELD",
      amountByPower: { 0: 1, 2: 2, 4: 3 },
      duration: { type: "combat-rounds", rounds: 2 }
    }
  }),

  // Fire Wall — same damage, reachable at Power 0 / 1 / 2 (was 0 / 2 / 4).
  "spell.fire_wall": reprint("spell.fire_wall", {
    tags: tags(
      "spell.fire_wall",
      "Ongoing: for this Combat, place this card on an empty space; any unit stopping there and any ground or ranged unit passing through takes: Power 0: 1 damage; Power 1: 2 damage; Power 2: 3 damage."
    ),
    effect: { type: "PLACE_FIRE_WALL", damageByPower: { 0: 1, 1: 2, 2: 3 } }
  }),

  // Forgetfulness — no tier gate at all (any ranged unit), and the ladder is
  // about ACTIVATIONS: Power 0 halves its ranged attack for 1 activation,
  // Power 1 blocks its ranged attack for 1, Power 2 for 2. Melee is untouched
  // at every rung (the classic wiring blocked EVERY attack).
  "spell.forgetfulness": reprint("spell.forgetfulness", {
    tags: tags(
      "spell.forgetfulness",
      "Ongoing: select a ranged unit of any tier. Power 0: for 1 activation its ranged attack is halved (rounded up); Power 1: for 1 activation it cannot make a ranged attack; Power 2: for 2 activations it cannot make a ranged attack."
    ),
    effect: {
      type: "FORGETFULNESS",
      gradeByPower: { 0: "azure" },
      activationsByPower: { 0: 1, 1: 1, 2: 2 },
      rangedModeByPower: { 0: "halve", 1: "block", 2: "block" }
    }
  }),

  // Fortune — 2 / 3 / 4 rerolls (was 1 / 2 / 3).
  "spell.fortune": reprint("spell.fortune", {
    tags: tags(
      "spell.fortune",
      "Instant: reroll one Treasure, Resource or Attack die X times and resolve the result of your choice: Power 0: twice; Power 1: 3 times; Power 2: 4 times."
    ),
    effect: {
      type: "CREATE_ATTACK_DIE_REROLL",
      name: "Fortune",
      basicRerolls: 2,
      rerollsByPower: { 0: 2, 1: 3, 2: 4 },
      adventureDice: true,
      duration: { type: "current-turn" },
      consumeEffectOnUse: true
    }
  }),

  // Frenzy — "ANY except azure" (= gold) at Power 3, reachable at 0 / 1 / 3.
  "spell.frenzy": reprint("spell.frenzy", {
    tags: tags(
      "spell.frenzy",
      "Instant: this unit ignores the Defense of the attacked unit: Power 0: bronze; Power 1: bronze or silver; Power 3: any except azure."
    ),
    effect: { type: "IGNORE_DEFENSE", gradeByPower: { 0: "bronze", 1: "silver", 3: "gold" } }
  }),

  // Haste — 3 combat rounds, +2/+4/+6 initiative AND +1/+2/+3 Combat movement.
  // The movement half is printed on the card, so it applies whatever the
  // `combat-move-initiative` house rule says (see getUnitMoveRange).
  "spell.haste": reprint("spell.haste", {
    tags: tags(
      "spell.haste",
      "Ongoing: for 3 combat rounds the selected unit gains Power 0: +2 initiative / +1 space; Power 1: +4 / +2 spaces; Power 2: +6 / +3 spaces."
    ),
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: "Haste",
      amountByPower: { 0: 2, 1: 4, 2: 6 },
      duration: { type: "combat-rounds", rounds: 3 },
      polarity: "positive",
      removable: true,
      movementBonus: 1,
      movementBonusByPower: { 0: 1, 1: 2, 2: 3 }
    }
  }),

  // Mirth — the same reroll, reachable at Power 0 / 1 / 3 (was 0 / 2 / 4).
  "spell.mirth": reprint("spell.mirth", {
    tags: tags(
      "spell.mirth",
      "Ongoing: you can reroll each of your Attack dice once, during Power 0: this Activation; Power 1: this Combat round; Power 3: this Combat."
    ),
    effect: {
      type: "CREATE_ATTACK_DIE_REROLL",
      name: "Mirth",
      basicRerolls: 1,
      duration: { type: "current-activation" },
      durationByPower: {
        0: { type: "current-activation" },
        1: { type: "current-combat-round" },
        3: { type: "combat" }
      },
      consumeEffectOnUse: false
    }
  }),

  // Misfortune — no tier gate; the printed "negate an additional Attack from any
  // card" rider is always on and the DIE half scales with Power.
  "spell.misfortune": reprint("spell.misfortune", {
    tags: tags(
      "spell.misfortune",
      "Instant: play when the selected enemy unit is attacking (ANY tier — the reprint drops the tier gate) — it cannot increase its attack from any card, and Power 0: its Attack die is negated; Power 1: it rolls 2 dice and resolves the lower result; Power 2: it rolls 4 dice, rerolls every '+1' once and resolves all of them."
    ),
    effect: {
      type: "NEGATE_ATTACK",
      dieModeByPower: { 0: "negate", 1: "lower-of-two", 2: "four-reroll-plus" }
    }
  }),

  // Prayer — was a one-attack rider; the reprint is a lasting buff on the
  // selected unit ("until its activation in the next combat round").
  "spell.prayer": reprint("spell.prayer", {
    timing: "combat",
    phaseLimit: ["combat"],
    target: { type: "friendly-unit" },
    tags: tags(
      "spell.prayer",
      "Ongoing: until its activation in the next combat round the selected unit gains attack, defense AND initiative: Power 0: +1; Power 2: +2; Power 4: +3."
    ),
    effect: {
      type: "CREATE_PRAYER_BUFF",
      name: "Prayer",
      amountByPower: { 0: 1, 2: 2, 4: 3 },
      duration: { type: "next-activation" },
      polarity: "positive",
      removable: true
    }
  }),

  // Remove Obstacle — 2 / 3 / 4 obstacles (was 1 / 2 / 3).
  "spell.remove_obstacle": reprint("spell.remove_obstacle", {
    tags: tags(
      "spell.remove_obstacle",
      "Instant: remove obstacles (except units) from the Combat board: Power 0: 2; Power 1: 3; Power 2: 4."
    ),
    effect: { type: "REMOVE_OBSTACLE", countByPower: { 0: 2, 1: 3, 2: 4 } }
  }),

  // Shield — Power 2 replaces the Defense bonus with a hard "takes up to 3
  // damage" cap on the attack it answers.
  "spell.shield": reprint("spell.shield", {
    tags: tags(
      "spell.shield",
      "Instant: when the defending unit is attacked by a ground or flying unit it gains Power 0: +1 defense; Power 1: +2 defense; Power 2: it takes at most 3 damage from that attack."
    ),
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 1,
      amountByPower: { 0: 1, 1: 2 },
      damageCapByPower: { 2: 3 },
      vsAttackerType: "ground-or-flying"
    }
  }),

  // Slayer — 3 / 5 / 7 dice (was 2 / 4 / 6) and it now also answers an AZURE
  // target, not gold alone.
  "spell.slayer": reprint("spell.slayer", {
    tags: tags(
      "spell.slayer",
      "Instant: when attacking a gold OR azure unit, roll an Attack die X times and apply all the results except a '-1'; after resolving the attack, draw 1 card: Power 0: 3 dice; Power 2: 5; Power 4: 7."
    ),
    effect: {
      type: "SLAYER_ATTACK",
      rollsByPower: { 0: 3, 2: 5, 4: 7 },
      targetGrades: ["gold", "azure"]
    }
  }),

  // Slow — the mirror of Haste: 3 combat rounds, -1/-2/-3 initiative AND
  // Combat movement (floored at 1 by getUnitMoveRange).
  "spell.slow": reprint("spell.slow", {
    tags: tags(
      "spell.slow",
      "Ongoing: for 3 combat rounds the selected unit suffers Power 0: -1 initiative / -1 space; Power 1: -2 / -2 spaces; Power 2: -3 / -3 spaces (movement to a minimum of 1)."
    ),
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: "Slow",
      amountByPower: { 0: -1, 1: -2, 2: -3 },
      duration: { type: "combat-rounds", rounds: 3 },
      polarity: "negative",
      removable: true,
      movementBonus: -1,
      movementBonusByPower: { 0: -1, 1: -2, 2: -3 }
    }
  }),

  // Sorrow — the same skip, reachable at Power 0 / 1 / 3 (was 0 / 2 / 4); the
  // top rung is "ANY except azure" (= gold), which is what it always paid for.
  "spell.sorrow": reprint("spell.sorrow", {
    tags: tags(
      "spell.sorrow",
      "Instant: when a unit is about to activate, skip its activation: Power 0: bronze; Power 1: bronze or silver; Power 3: any except azure."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Skip a bronze unit's activation",
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "opponent" },
          effect: { type: "SKIP_ACTIVATION", grade: "bronze" }
        },
        {
          label: "Skip a silver unit (pay 1 Power)",
          cost: { powerCost: 1, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "opponent" },
          effect: { type: "SKIP_ACTIVATION", grade: "silver" }
        },
        {
          label: "Skip a gold unit (pay 3 Power)",
          cost: { powerCost: 3, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "opponent" },
          effect: { type: "SKIP_ACTIVATION", grade: "gold" }
        }
      ]
    }
  }),

  // Visions — 2 / 4 / 6 cards scryed (was 1 / 2 / 3).
  "spell.visions": reprint("spell.visions", {
    tags: tags(
      "spell.visions",
      "Instant (map): draw X cards from any Neutral Unit deck, discard any of them and return the rest in any order: Power 0: 2 cards; Power 1: 4; Power 2: 6."
    ),
    effect: { type: "VISIONS_SCRY", cardsByPower: { 0: 2, 1: 4, 2: 6 } }
  })
};

/** Every spell id the Balance Pack reprints. */
export const POLISH_BALANCE_SPELL_IDS: readonly string[] = Object.keys(polishBalanceSpellCards);
