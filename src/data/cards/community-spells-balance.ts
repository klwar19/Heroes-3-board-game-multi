import type { CardDefinition, CardLibrary } from "@/engine/state";

import { sampleCards } from "./sample";
import { spellCards } from "./spells";

/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * 26 reprinted SPELL cards.
 *
 * THE COMMITTED CARD FACE IS THE AUTHORITY (`public/assets/community-balance/
 * spell-<slug>.webp`, built from the sheet's own masters), not this file's
 * prose. Each entry is the PRINTED definition with a replaced `effect` (plus
 * `timing` / `phaseLimit` / `target` / `trigger` where the reprint really moves
 * them), so everything else the engine reads off a card — kind, schools, level,
 * deck membership, uniqueness — is untouched. The trailing `tags` line is the
 * human "Community balance: …" statement of exactly what the engine runs.
 *
 * `communityBalanceCardLibrary` (`src/engine/community-balance-cards.ts`) swaps
 * these in ONLY while the house rule is on; with it off nothing here is
 * consulted and every spell plays its printed text byte-identically. When BOTH
 * balance packs are on the COMMUNITY definition wins (the community swap is
 * applied after the polish one at every seam).
 *
 * DELIBERATE READINGS / LIMITS, stated up front (CLAUDE.md #4):
 *  - FORTUNE's "you may choose the resultant die side" is wired for the ATTACK
 *    die only. The Attack die has three faces (-1 / 0 / +1) and the roller
 *    always wants the highest, so the engine SETS one die to "+1" (the
 *    Positive-Morale set-die machinery) rather than opening a face picker. The
 *    ADVENTURE (Treasure / Resource) half still REROLLS as printed — there is no
 *    set-die path for the map dice. The 1/2/3 uses are the budget inside the ONE
 *    die window the card is spent on (`consumeEffectOnUse`), exactly like the
 *    printed Fortune's rerolls; there is no cross-roll "this turn" ledger.
 *  - MISFORTUNE's "choose an attack die roll result" is likewise resolved as the
 *    caster's best pick — one die of each of the next N ENEMY attack rolls is
 *    SET to "-1" (`SET_ENEMY_ATTACK_DIE`, `applyEnemyDieSetCurses`). It fires on
 *    the INITIAL roll of an enemy attack; a reroll the enemy then buys is their
 *    own answer and spends no further charge.
 *  - SLAYER's "a unit of a higher tier" is `gradeRankOfUnit(defender) >
 *    gradeRankOfUnit(attacker)`. A gradeless Creature-Bank / boss defender ranks
 *    above every graded unit, so it always counts as higher tier; a gradeless
 *    ATTACKER can never satisfy the clause.
 *  - ANTI-MAGIC's new wording ("ignores Spell effects") is run as the printed
 *    CREATE_SPELL_IMMUNITY ward — the reprint's real change here is the
 *    breakpoint move 0/2/4 → 0/1/2. It does NOT gain the Polish reprint's
 *    spell-DAMAGE reduction.
 *  - PRAYER's printed duration is "until its activation next combat round". The
 *    engine duration is `next-activation`, which ends when that unit's next
 *    activation ENDS — half a step longer than the wording (the same reading the
 *    Polish Prayer reprint documents; no new duration was invented).
 *  - CURE's only printed change is the word "friendly". The engine ALREADY
 *    restricted it to a friendly unit (`target: { type: "friendly-unit" }`), so
 *    this reprint changes NO behaviour — it ships so the face a player reads
 *    matches the rule the engine runs.
 *  - VISIONS' bottom picks are unshifted onto the draw pile as they are made, so
 *    the first card sent to the bottom sits nearest the rest of the deck and the
 *    last one deepest ("in any order" is not a free arrangement of the bottom).
 */

/** The printed definition a community reprint is cloned from. */
function printed(cardId: string): CardDefinition {
  const card = spellCards[cardId] ?? sampleCards[cardId];
  if (!card) {
    throw new Error(`Community Balance Change: no printed spell ${cardId}`);
  }
  return card;
}

/**
 * Clone `cardId`'s printed definition with `patch` applied. Keys explicitly set
 * to `undefined` in `patch` are DELETED (Misfortune / Bless / Dispel drop their
 * reaction `trigger`, Dispel its `target`) — a plain spread would keep them.
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

function tags(cardId: string, printedText: string, communityText: string): string[] {
  const base = printed(cardId).tags ?? [];
  // Drop the printed rules line (always the last tag) — it would promise the
  // classic numbers — and state the reprint instead.
  const keep = base
    .slice(0, Math.max(0, base.length - 1))
    .filter(
      (tag) =>
        !tag.startsWith("Instant:") &&
        !tag.startsWith("Ongoing:") &&
        !tag.startsWith("Activation:") &&
        !tag.startsWith("Map effect:")
    );
  return [...keep, printedText, `Community balance: ${communityText}`];
}

export const communityBalanceSpellCards: CardLibrary = {
  // =========================================================================
  // AIR
  // =========================================================================

  // Haste — the reprint is an INSTANT (⚡) whose Initiative ladder triples to
  // +3/+6/+9, plus a 🔄 "moves 1 more space until the end of the Combat" half.
  "spell.haste": reprint("spell.haste", {
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    target: { type: "friendly-unit" },
    tags: tags(
      "spell.haste",
      "Instant: the selected unit gains Power 0: +3 initiative; Power 1: +6; Power 2: +9. Ongoing: until the end of the Combat it also moves 1 more space.",
      "the printed +1/+2/+3 initiative becomes +3/+6/+9 and the card is played as an INSTANT (it may join an open attack window, not only your own activation). The +1 Combat-movement half is PRINTED on the reprint, so it applies whatever the classic `combat-move-initiative` house rule says (COMMUNITY_BALANCE_PRINTED_MOVEMENT_IDS, read in getUnitMoveRange). Both halves last until the end of the Combat."
    ),
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: "Haste",
      amountByPower: { 0: 3, 1: 6, 2: 9 },
      duration: { type: "combat" },
      polarity: "positive",
      removable: true,
      // Printed on the reprint: a flat +1 space at every rung (unlike the Polish
      // reprint, whose movement scales with Power).
      movementBonus: 1
    }
  }),

  // Fortune — the reroll becomes "choose the resultant die side".
  "spell.fortune": reprint("spell.fortune", {
    tags: tags(
      "spell.fortune",
      "Ongoing: you may choose the resultant die side this turn: Power 0: once; Power 1: twice; Power 2: thrice.",
      "instead of rerolling, spending a use SETS one die of the Attack roll to the \"+1\" side — its own button in the die window (`setDieFace`, the Positive-Morale set-die path), so it never competes with a real reroll. Uses: 1/2/3 by Power, spent inside the one die window the card is played into. The ADVENTURE (Treasure / Resource) half still REROLLS as printed — the map dice have no set-die path."
    ),
    effect: {
      type: "CREATE_ATTACK_DIE_REROLL",
      name: "Fortune",
      basicRerolls: 1,
      rerollsByPower: { 0: 1, 1: 2, 2: 3 },
      // "Choose the resultant die side": the use SETS the die rather than
      // rerolling it.
      setDieFace: 1,
      adventureDice: true,
      duration: { type: "current-turn" },
      consumeEffectOnUse: true
    }
  }),

  // Precision — +2/+3/+4 attack (was +1/+2/+3).
  "spell.precision": reprint("spell.precision", {
    tags: tags(
      "spell.precision",
      "Instant: when attacking a non-adjacent unit, the selected ranged unit ignores the combat penalties and gains: Power 0: +2 attack; Power 1: +3; Power 2: +4.",
      "the attack ladder rises +1/+2/+3 → +2/+3/+4. Everything else is the printed card: ranged unit only, non-adjacent shot only, and it still ignores the ranged combat penalty."
    ),
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 2,
      amountByPower: { 0: 2, 1: 3, 2: 4 },
      unitTypes: ["ranged"],
      ignoreRangedPenalty: true
    }
  }),

  // View Air — the Power-0 rung is a Speculum-style tile discovery, not 3 gold.
  "spell.view_air": reprint("spell.view_air", {
    tags: tags(
      "spell.view_air",
      "Map effect: Gain — Power 0: discover any Map tile adjacent to the Map tile your Hero is on; Power 1: 2 Building Materials; Power 2: 1 Valuables. — OR — Instant: +1 Power.",
      "the Power-0 rung stops paying 3 gold and instead runs the Speculum's DISCOVER_TILE_CARD arm (discover a face-down tile adjacent to your Hero's tile). The Power-1 and Power-2 rungs are the printed ones, unchanged."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discover an adjacent map tile",
          mapOnly: true,
          effect: { type: "DISCOVER_TILE_CARD" }
        },
        {
          label: "Gain 2 Building Materials (pay 1 Power)",
          mapOnly: true,
          cost: { powerCost: 1, costCardFilter: "power-source" },
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 2 } }
        },
        {
          label: "Gain 1 Valuables (pay 2 Power)",
          mapOnly: true,
          cost: { powerCost: 2, costCardFilter: "power-source" },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        }
      ]
    }
  }),

  // Counterstrike — same tiers, reachable at Power 0 / 1 / 2 (was 0 / 2 / 4).
  "spell.counterstrike": reprint("spell.counterstrike", {
    tags: tags(
      "spell.counterstrike",
      "Instant: Remove the Black cube from the selected unit card — that unit may perform a Retaliation Attack again: Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver or gold.",
      "the printed text is unchanged; the LADDER BREAKPOINTS move 0/2/4 → 0/1/2, so 1 Power now reaches a silver unit and 2 Power a gold one."
    ),
    effect: { type: "CLEAR_RETALIATION", gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" } }
  }),

  // Chain Lightning — the Power-0 rung leaves the third target untouched.
  "spell.chain_lightning": reprint("spell.chain_lightning", {
    tags: tags(
      "spell.chain_lightning",
      "Activation: Select a unit and another 2 units closest to it. Allocate damage, starting with the first selected unit: Power 0: 1/1/0; Power 2: 2/1/1; Power 4: 3/2/1.",
      "the Power-0 rung drops from 1/1/1 to 1/1/0 — the third unit in the chain takes NO damage at Power 0. The Power-2 and Power-4 rungs are the printed ones."
    ),
    effect: {
      type: "CHAIN_LIGHTNING",
      damagesByPower: { 0: [1, 1, 0], 2: [2, 1, 1], 4: [3, 2, 1] }
    }
  }),

  // =========================================================================
  // EARTH
  // =========================================================================

  // Slow — the Initiative ladder is unchanged; the reprint PRINTS the movement
  // half, and it scales (-1 / -2 / -3 spaces, floored at 1 by getUnitMoveRange).
  "spell.slow": reprint("spell.slow", {
    tags: tags(
      "spell.slow",
      "Ongoing: until the end of the Combat the selected unit suffers Power 0: -1 initiative and moves 1 fewer space; Power 1: -2 and 2 fewer; Power 2: -3 and 3 fewer (to a minimum of 1).",
      "the initiative ladder is the printed -1/-2/-3, but the \"moves N fewer spaces\" half is now PRINTED and scales with Power, so it applies whatever the classic `combat-move-initiative` house rule says (COMMUNITY_BALANCE_PRINTED_MOVEMENT_IDS). getUnitMoveRange floors any unit's range at 1 space."
    ),
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: "Slow",
      amountByPower: { 0: -1, 1: -2, 2: -3 },
      duration: { type: "combat" },
      polarity: "negative",
      removable: true,
      movementBonus: -1,
      movementBonusByPower: { 0: -1, 1: -2, 2: -3 }
    }
  }),

  // Shield — +2/+3/+4 defense (was +1/+2/+3).
  "spell.shield": reprint("spell.shield", {
    tags: tags(
      "spell.shield",
      "Instant: the defending unit gains, when it is attacked by a ground or flying unit: Power 0: +2 defense; Power 1: +3; Power 2: +4.",
      "the defense ladder rises +1/+2/+3 → +2/+3/+4. The ground-or-flying attacker gate is the printed one and is unchanged (a ranged shot still slips past)."
    ),
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 2,
      amountByPower: { 0: 2, 1: 3, 2: 4 },
      vsAttackerType: "ground-or-flying"
    }
  }),

  // Stone Skin — +2/+3/+4 defense (was +1/+2/+3).
  "spell.stone_skin": reprint("spell.stone_skin", {
    tags: tags(
      "spell.stone_skin",
      "Instant: the selected unit gains: Power 0: +2 defense; Power 1: +3; Power 2: +4.",
      "the defense ladder rises +1/+2/+3 → +2/+3/+4. Nothing else about the card moves."
    ),
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 2,
      amountByPower: { 0: 2, 1: 3, 2: 4 }
    }
  }),

  // Anti-Magic — same ward, reachable at Power 0 / 1 / 2 (was 0 / 2 / 4).
  "spell.anti_magic": reprint("spell.anti_magic", {
    tags: tags(
      "spell.anti_magic",
      "Ongoing: until the end of the Combat the selected unit ignores Spell effects: Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver or gold.",
      "the LADDER BREAKPOINTS move 0/2/4 → 0/1/2, so 1 Power now wards a silver unit and 2 Power a gold one. The ward itself is the printed CREATE_SPELL_IMMUNITY (the unit cannot be affected by Spells) — the reprint does NOT add the Polish pack's separate spell-DAMAGE reduction."
    ),
    effect: {
      type: "CREATE_SPELL_IMMUNITY",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" },
      duration: { type: "combat" }
    }
  }),

  // Town Portal — same teleport, the movement riders cost 1 / 2 Power (was 2 / 4).
  "spell.town_portal": reprint("spell.town_portal", {
    tags: tags(
      "spell.town_portal",
      "Map effect: Move your Hero to a selected Town or Settlement in your control, and: Power 0: no additional effect; Power 1: +1 movement; Power 2: +2 movement. — OR — Instant: +1 Power.",
      "the LADDER BREAKPOINTS move 0/2/4 → 0/1/2 — the +1/+2 movement riders now cost 1 / 2 Power instead of 2 / 4. The teleport itself is unchanged."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Teleport to a town or settlement",
          mapOnly: true,
          effect: { type: "TELEPORT_HERO_TO_TOWN" }
        },
        {
          label: "Teleport and +1 movement (pay 1 Power)",
          mapOnly: true,
          cost: { powerCost: 1, costCardFilter: "power-source" },
          effect: { type: "TELEPORT_HERO_TO_TOWN", movementBonus: 1 }
        },
        {
          label: "Teleport and +2 movement (pay 2 Power)",
          mapOnly: true,
          cost: { powerCost: 2, costCardFilter: "power-source" },
          effect: { type: "TELEPORT_HERO_TO_TOWN", movementBonus: 2 }
        }
      ]
    }
  }),

  // =========================================================================
  // FIRE
  // =========================================================================

  // Visions — 2/4/6 cards, and NOTHING is discarded: each goes back on the top
  // or the bottom of the same Neutral deck.
  "spell.visions": reprint("spell.visions", {
    tags: tags(
      "spell.visions",
      "Instant (map): Draw cards from any Neutral Unit deck, then place each of them on the top or the bottom of that deck: Power 0: 2 cards; Power 1: 4; Power 2: 6.",
      "the scry doubles to 2/4/6 cards AND the discard option is REPLACED by \"put on the bottom\" — no card ever leaves the Neutral deck. Kept-on-top cards stack in pick order (the first kept is drawn next); bottom picks stack in pick order too, the first sent down sitting nearest the rest of the deck."
    ),
    effect: { type: "VISIONS_SCRY", cardsByPower: { 0: 2, 1: 4, 2: 6 }, placement: "top-or-bottom" }
  }),

  // Fire Wall — same damage, reachable at Power 0 / 1 / 2, and it now also
  // burns a unit that STARTS its activation on the wall.
  "spell.fire_wall": reprint("spell.fire_wall", {
    tags: tags(
      "spell.fire_wall",
      "Ongoing: for this Combat, place this card on an empty space. Deal damage to any unit STARTING THEIR ACTIVATION or stopping here, and to any ground or ranged unit passing through: Power 0: 1 damage; Power 1: 2; Power 2: 3.",
      "two changes. The LADDER BREAKPOINTS move 0/2/4 → 0/1/2, and the placed token now carries `burnsAtActivation` (the Luna / Hell-Steed flag), so a unit that BEGINS its activation standing on the wall takes the damage too — flyers included, exactly like the stop-here bite."
    ),
    effect: { type: "PLACE_FIRE_WALL", damageByPower: { 0: 1, 1: 2, 2: 3 }, burnsAtActivation: true }
  }),

  // Misfortune — complete rework: an ongoing that dictates the ENEMY's next
  // 1/2/3 attack die results instead of a one-shot negate reaction.
  "spell.misfortune": reprint("spell.misfortune", {
    timing: "combat",
    phaseLimit: ["combat"],
    trigger: undefined,
    target: undefined,
    tags: tags(
      "spell.misfortune",
      "Ongoing: choose an attack die roll result for the next N enemy attack rolls: Power 0: 1 roll; Power 1: 2; Power 2: 3.",
      "the printed play-when-attacked negate is GONE. The reprint is an ongoing cast on your own activation: for the next 1/2/3 ENEMY Attack rolls one die is SET to the result you choose. With the three-face Attack die (-1 / 0 / +1) the caster always wants the worst, so the engine sets the die whose flip lowers the enemy's outcome the most (`SET_ENEMY_ATTACK_DIE`, applyEnemyDieSetCurses). It bites on the INITIAL roll of each enemy attack; a reroll the enemy then buys is their own answer and costs no further charge. There is no tier gate at any rung."
    ),
    effect: {
      type: "CREATE_ENEMY_DIE_SET",
      name: "Misfortune",
      face: -1,
      rollsByPower: { 0: 1, 1: 2, 2: 3 },
      duration: { type: "combat" }
    }
  }),

  // Bloodlust — +2/+3/+4 attack (was +1/+2/+3).
  "spell.bloodlust": reprint("spell.bloodlust", {
    tags: tags(
      "spell.bloodlust",
      "Instant: the selected ground or flying unit gains: Power 0: +2 attack; Power 1: +3; Power 2: +4.",
      "the attack ladder rises +1/+2/+3 → +2/+3/+4. The ground/flying restriction is the printed one and stays."
    ),
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 2,
      amountByPower: { 0: 2, 1: 3, 2: 4 },
      unitTypes: ["ground", "flying"]
    }
  }),

  // Curse — -2/-3/-4 defense (was -1/-2/-3).
  "spell.curse": reprint("spell.curse", {
    tags: tags(
      "spell.curse",
      "Instant: the selected unit suffers (to a minimum of 0): Power 0: -2 defense; Power 1: -3; Power 2: -4.",
      "the defense penalty deepens -1/-2/-3 → -2/-3/-4. Nothing else about the card moves; the engine still floors the target's effective Defense at 0."
    ),
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: -2,
      amountByPower: { 0: -2, 1: -3, 2: -4 }
    }
  }),

  // Inferno — a guaranteed 1 damage on the chosen space before the dice, and
  // the top rung rolls 3 times instead of 4.
  "spell.inferno": reprint("spell.inferno", {
    tags: tags(
      "spell.inferno",
      "Activation: Select a space. Deal 1 damage to a unit on that space. Now roll an Attack die: Power 0: once; Power 1: twice; Power 2: 3 times. All units on this and the adjacent spaces take 1 damage for every \"+1\" rolled.",
      "two changes. A flat 1 damage now lands on whatever unit occupies the SELECTED space BEFORE any die is rolled (it resolves even when every die whiffs, and never touches the adjacent ring). The top rung drops from 4 rolls to 3."
    ),
    effect: { type: "INFERNO", rollsByPower: { 0: 1, 1: 2, 2: 3 }, preDamageOnSpace: 1 }
  }),

  // Slayer — complete rework: a flat attack bonus against a higher-tier unit,
  // not a multi-die roll against a gold one.
  "spell.slayer": reprint("spell.slayer", {
    tags: tags(
      "spell.slayer",
      "Instant: when attacking a unit of a higher tier, the selected unit gains: Power 0: +2 attack; Power 2: +4; Power 4: +6.",
      "the printed multi-die roll and its \"draw 1 card\" rider are GONE. The reprint is a flat +2/+4/+6 attack bonus, offered and paid ONLY while the attacked unit's tier is strictly above the attacker's (`requiresDefenderHigherTier`, compared with gradeRankOfUnit). A gradeless Creature-Bank / boss defender outranks every graded unit and so always qualifies; a gradeless ATTACKER never does."
    ),
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 2,
      amountByPower: { 0: 2, 2: 4, 4: 6 },
      requiresDefenderHigherTier: true
    }
  }),

  // Frenzy — same pierce, reachable at Power 0 / 1 / 2 (was 0 / 2 / 4).
  "spell.frenzy": reprint("spell.frenzy", {
    tags: tags(
      "spell.frenzy",
      "Instant: this unit ignores the Defense of the attacked unit: Power 0: bronze; Power 1: silver; Power 2: gold.",
      "the printed text is unchanged; the LADDER BREAKPOINTS move 0/2/4 → 0/1/2, so 1 Power pierces a silver unit and 2 Power a gold one."
    ),
    effect: {
      type: "IGNORE_DEFENSE",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" }
    }
  }),

  // =========================================================================
  // WATER
  // =========================================================================

  // Forgetfulness — no tier gate; the ranged unit cannot shoot at a
  // NON-ADJACENT unit for its next 1/2/3 activations (breakpoints 0/2/4).
  "spell.forgetfulness": reprint("spell.forgetfulness", {
    tags: tags(
      "spell.forgetfulness",
      "Ongoing: the selected ranged unit cannot attack non-adjacent units during: Power 0: its next activation; Power 2: its next 2 activations; Power 4: its next 3 activations.",
      "the printed tier gate is GONE (any ranged unit, at any Power) and the ladder is now about ACTIVATIONS at breakpoints 0/2/4. The block is on the RANGED attack only — the unit may still attack an adjacent unit in melee, which the printed \"cannot Attack\" forbade."
    ),
    effect: {
      type: "FORGETFULNESS",
      gradeByPower: { 0: "azure" },
      activationsByPower: { 0: 1, 2: 2, 4: 3 },
      rangedModeByPower: { 0: "block" }
    }
  }),

  // Bless — the reprint is a whole-COMBAT ongoing on ANY unit (the printed
  // ground/flying restriction is dropped) at breakpoints 0/2/4.
  "spell.bless": reprint("spell.bless", {
    timing: "combat",
    phaseLimit: ["combat"],
    trigger: undefined,
    target: { type: "friendly-unit" },
    tags: tags(
      "spell.bless",
      "Ongoing: during this Combat the selected unit ignores the Attack die roll, and: Power 0: nothing more; Power 2: +1 attack; Power 4: +2 attack.",
      "three changes. It is no longer a one-attack instant — the die skip and the attack bonus last the WHOLE Combat; the printed ground-or-flying restriction is dropped (any friendly unit); and the ladder breakpoints move 0/1/2 → 0/2/4, so +1 attack now costs 2 Power and +2 costs 4."
    ),
    effect: {
      type: "CREATE_ATTACK_BUFF",
      name: "Bless",
      amountByPower: { 0: 0, 2: 1, 4: 2 },
      duration: { type: "combat" },
      polarity: "positive",
      removable: true,
      ignoreAttackDie: true
    }
  }),

  // Weakness — -2/-3/-4 attack (was -1/-2/-3).
  "spell.weakness": reprint("spell.weakness", {
    tags: tags(
      "spell.weakness",
      "Instant: the selected unit suffers (to a minimum of 0): Power 0: -2 attack; Power 1: -3; Power 2: -4.",
      "the attack penalty deepens -1/-2/-3 → -2/-3/-4. Nothing else about the card moves."
    ),
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: -2,
      amountByPower: { 0: -2, 1: -3, 2: -4 }
    }
  }),

  // Dispel — complete rework: discard N ongoing effects / Paralysis tokens of
  // your choice, from ANY owner, instead of cleansing one unit or space.
  "spell.dispel": reprint("spell.dispel", {
    timing: "combat",
    phaseLimit: ["combat"],
    trigger: undefined,
    target: undefined,
    tags: tags(
      "spell.dispel",
      "Activation: discard active ongoing effects or Paralysis tokens, in any mix: Power 0: 1; Power 1: 2; Power 2: 3.",
      "the printed unit/space cleanse and its tier gate are GONE. The cast opens a repeated pick listing EVERY removable ongoing effect in play (both sides, the caster's own buffs included) and every Paralysis token on the board, plus \"Stop discarding\"; each answer removes exactly one and re-opens until the 1/2/3 budget runs out. Battlefield obstacle tokens (Fire Wall, Quicksand…) are NOT in the list — they are not ongoing EFFECTS; Remove Obstacle is their spell."
    ),
    effect: {
      type: "DISPEL_EFFECTS",
      // Unused while `discardCountByPower` is set (the reprint has no tier
      // gate), but the effect type requires the table.
      gradeByPower: { 0: "azure" },
      discardCountByPower: { 0: 1, 1: 2, 2: 3 }
    }
  }),

  // Cure — the printed text gains the word "friendly"; the engine ALREADY only
  // ever offered it on a friendly unit, so nothing about the play changes.
  "spell.cure": reprint("spell.cure", {
    tags: tags(
      "spell.cure",
      "Instant: remove any effect or Paralysis from the selected FRIENDLY unit, and remove from it up to: Power 0: 1 damage; Power 1: 2; Power 2: 3. — OR — Instant: +1 Power.",
      "NO behaviour change. The reprint only writes \"friendly\" into the printed text; the engine's target has always been `friendly-unit`, so the heal, the effect/Paralysis cleanse and the 1/2/3 ladder are byte-identical to the printed card. The reprint ships so the face a player reads matches the rule the engine runs."
    ),
    effect: {
      type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
      amountByPower: { 0: 1, 1: 2, 2: 3 },
      removePolarity: "negative",
      removeParalysis: true
    }
  }),

  // Mirth — the same reroll, reachable at Power 0 / 1 / 2 (was 0 / 2 / 4).
  "spell.mirth": reprint("spell.mirth", {
    tags: tags(
      "spell.mirth",
      "Ongoing: you can reroll each of your Attack dice once, during: Power 0: this Activation; Power 1: this Combat round; Power 2: this Combat.",
      "the printed text is unchanged; the LADDER BREAKPOINTS move 0/2/4 → 0/1/2, so 1 Power stretches the reroll to the whole Combat round and 2 Power to the whole Combat."
    ),
    effect: {
      type: "CREATE_ATTACK_DIE_REROLL",
      name: "Mirth",
      basicRerolls: 1,
      duration: { type: "current-activation" },
      durationByPower: {
        0: { type: "current-activation" },
        1: { type: "current-combat-round" },
        2: { type: "combat" }
      },
      consumeEffectOnUse: false
    }
  }),

  // Prayer — was a one-attack rider on ONE chosen stat; the reprint is a lasting
  // buff to attack AND defense AND initiative together.
  "spell.prayer": reprint("spell.prayer", {
    timing: "combat",
    phaseLimit: ["combat"],
    target: { type: "friendly-unit" },
    tags: tags(
      "spell.prayer",
      "Ongoing: until its activation next combat round the selected unit gains attack, defense AND initiative: Power 0: +1; Power 2: +2; Power 4: +3.",
      "the printed \"pick ONE of attack / defense / initiative for one attack\" becomes a lasting buff to ALL THREE at once. The ladder values and breakpoints (0/2/4 → +1/+2/+3) are the printed ones. Engine duration is `next-activation`, which ends when that unit's next activation ENDS — half a step longer than the printed wording (the documented Polish-Prayer reading; no new duration was invented)."
    ),
    effect: {
      type: "CREATE_PRAYER_BUFF",
      name: "Prayer",
      amountByPower: { 0: 1, 2: 2, 4: 3 },
      duration: { type: "next-activation" },
      polarity: "positive",
      removable: true
    }
  })
};

/** Every spell id the Community Balance Change reprints. */
export const COMMUNITY_BALANCE_SPELL_IDS: readonly string[] = Object.keys(communityBalanceSpellCards);

/**
 * The community reprints whose PRINTED text carries a Combat-movement half
 * (Haste's "+1 space", Slow's "N fewer spaces"). `getUnitMoveRange` applies
 * THEIR movement whatever the classic `combat-move-initiative` house rule says,
 * because the card prints it; every other MOVEMENT_BONUS stays gated on that
 * rule. The Polish twin is `POLISH_BALANCE_PRINTED_MOVEMENT_IDS`.
 */
export const COMMUNITY_BALANCE_PRINTED_MOVEMENT_IDS: readonly string[] = ["spell.haste", "spell.slow"];
