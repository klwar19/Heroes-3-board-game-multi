import type { CombatTokenKind, EffectDurationDefinition, SpellSchool, UnitType } from "@/engine/state";

export type UnitAbilityEffectDefinition =
  | { type: "ALLOW_UNLIMITED_RETALIATION" }
  | { type: "IGNORE_RETALIATION" }
  | { type: "IGNORE_RANGED_BACK_ROW_PENALTY" }
  | { type: "MOVE_ANYWHERE" }
  | {
      /**
       * Elemental units (Air/Earth/Fire/Water Elementals and their kin): "This
       * unit deals elemental damage." Its attack value cannot be raised by
       * attack cards or Attack tokens — only lowered by debuffs such as a
       * Sorceress' Weakness. A passive, always-on trait of the printed card.
       */
      type: "DEALS_ELEMENTAL_DAMAGE";
    }
  | {
      /**
       * Elemental units: "Immune to Magic Arrow and <element> Magic spells."
       * The unit cannot be targeted by — nor affected by — any Spell card whose
       * school appears in this list. "any" is the school of Magic Arrow (the
       * only school-"any" Spell), so it represents the Magic-Arrow immunity;
       * "air"/"earth"/"fire"/"water" cover that school's Spells. Magic
       * Elementals list only "any" (Magic-Arrow immunity, no school immunity).
       */
      type: "IMMUNE_TO_SPELL_SCHOOLS";
      schools: SpellSchool[];
    }
  | { type: "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL"; maxRoll: number; amount: number }
  | {
      /**
       * Token "other action" (Ogres' Attack token, Few Sorceresses' Weakness
       * token): used instead of attacking, places a combat token on a unit.
       */
      type: "PLACE_TOKEN_ACTION";
      token: CombatTokenKind;
      /** Signed delta carried by the token (+2 attack, −2 weakness, …). */
      amount: number;
      /** Which side may receive the token. */
      targets: "any" | "friendly" | "enemy";
      /** Allowed unit types of the target (omit for all). */
      targetTypes?: UnitType[];
      /** Combat rounds the token lasts (omit = until end of combat). */
      rounds?: number;
    }
  | {
      /**
       * Token on attack (Pack Sorceresses' −1 Weakness, Pack Behemoths'
       * Corrosion): after this unit's attack, the target gains the token.
       */
      type: "ON_ATTACK_TOKEN";
      token: CombatTokenKind;
      amount: number;
      rounds?: number;
    }
  | {
      /**
       * Cyclops siege ability ("other action"): destroy the Gate or a Wall —
       * the pack/neutral versions may also destroy the Arrow Tower. Works at
       * any range; automatically successful.
       */
      type: "DEMOLISH_FORTIFICATION";
      canTargetArrowTower: boolean;
    }
  | {
      /**
       * Magogs (pack/neutral): "When Magogs attack a target that is not
       * adjacent to them, they also deal 1 damage to a unit adjacent to the
       * target." One unit, chosen by the attacker, friend or foe (per the
       * wiki FAQ a lone adjacent friendly unit takes the hit). Mandatory when
       * a candidate exists.
       */
      type: "FLAT_DAMAGE_ADJACENT_TO_TARGET";
      amount: number;
      /** Printed condition: only fires when the target is not adjacent. */
      requiresNonAdjacentTarget: boolean;
    }
  | {
      /**
       * Cerberi (pack/neutral): "Additionally, deals 1 damage to another
       * enemy unit adjacent to Cerberi." Enemy units only, anchored to the
       * attacker, never the original target. Mandatory when one exists.
       */
      type: "FLAT_DAMAGE_ADJACENT_TO_SELF";
      amount: number;
    }
  | {
      /**
       * Liches (pack/neutral): "Choose a unit adjacent to the target and
       * attack it. For the purpose of this attack, your attack is 2." A full
       * separate attack — instant windows open for both sides, the attack
       * die rolls — that can and sometimes must hit friendly units or the
       * Liches themselves (wiki FAQ). It resolves before the original
       * target's retaliation and never chains another follow-up.
       */
      type: "SECOND_ATTACK_ADJACENT_TO_TARGET";
      baseAttack: number;
    }
  | {
      /**
       * BINH Cerberi: after the original attack, every other enemy unit
       * adjacent to this unit is attacked with a full separate attack at the
       * printed base attack. Each follow-up opens instant windows and rolls
       * the die; none of them retaliates or chains further follow-ups.
       */
      type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF";
      baseAttack: number;
    }
  | {
      /**
       * Wolf Raiders: after their target retaliates if possible, attack the
       * same target a second time. The follow-up does not provoke a second
       * retaliation.
       */
      type: "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION";
    }
  | {
      /**
       * Thunderbirds / Wyverns: immediately after their attack, before
       * retaliation, roll one Attack die and deal flat damage to the target on
       * matching faces. The printed Stronghold Thunderbird card triggers on 0
       * or +1 (minRoll 0, no maxRoll); the Wyvern only on a "0" (minRoll 0,
       * maxRoll 0). The face must satisfy minRoll ≤ roll ≤ maxRoll (maxRoll
       * omitted means "no upper bound").
       */
      type: "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET";
      minRoll: number;
      maxRoll?: number;
      amount: number;
    }
  | {
      /**
       * Behemoths: the target's defense is lowered for this attack, never
       * below zero after all attack-window modifiers are counted.
       */
      type: "DEFENSE_REDUCTION_ON_ATTACK";
      amount: number;
    }
  | {
      type: "ATTACK_DIE_REROLL";
      rerollsPerAttack: number;
      /**
       * Crusaders: 'You can reroll every "0"' — the reroll is only offered
       * while the die shows this face, and every new matching face may be
       * rerolled again (the source never depletes).
       */
      onlyOnRoll?: number;
      /**
       * Castle Champions: "If this unit's movement ends in a space other than
       * where it started, you may reroll an Attack die." The reroll is only
       * offered when this unit moved during its own attack (never on a
       * Retaliation Attack, where it did not move).
       */
      requiresMoved?: boolean;
    }
  | {
      /** Neutral Crusaders: roll 2 Attack dice, resolve the higher outcome. */
      type: "ATTACK_ROLL_ADVANTAGE";
    }
  | {
      /**
       * Marksmen/Elves: after attacking a non-adjacent target, attack it
       * again. The follow-up happens once — never a third attack. With
       * maxRoll set, the second attack only triggers when the first attack's
       * die outcome was at or below it (Elves: -1 or 0).
       */
      type: "DOUBLE_ATTACK";
      maxRoll?: number;
    }
  | {
      type: "ACTIVATION_ATTACK_BUFF";
      amount: number;
      targetTypes: UnitType[];
      duration: EffectDurationDefinition;
      endsActivation: boolean;
      preventsMovement: boolean;
    }
  | {
      /**
       * Neutral Magi: after this unit's attack, the defending player must
       * either discard a card of their choice that can contribute Power (a
       * Power statistic or any Spell, which can be discarded for "+1 Power"),
       * or let a random card be discarded from their hand. The choice belongs
       * to the defender; with no Power card the random discard is forced.
       */
      type: "ENEMY_DISCARDS_POWER_OR_RANDOM";
    }
  | {
      /**
       * Gold Dragons: "Attack 2 spaces in a line." After the primary attack,
       * a full separate attack strikes the unit directly behind the target
       * (the next space away from the dragon), friend or foe, at the printed
       * replacement attack value. That space is not adjacent to the dragon, so
       * the struck unit never retaliates, and the follow-up never chains.
       */
      type: "SECOND_ATTACK_BEHIND_TARGET";
      baseAttack: number;
    }
  | {
      /**
       * Azure Dragons (own attack die "-1") and Basilisks (an extra die "0"):
       * the struck target gains a Paralysis token. "own" reads the attack's
       * own resolved die; "extra" rolls one fresh Attack die after the attack.
       */
      type: "PARALYZE_TARGET_ON_DIE";
      source: "own" | "extra";
      onRoll: number;
    }
  | {
      /**
       * Hydras: "attacks up to 2 adjacent enemy units." After the primary
       * attack, one more enemy adjacent to the Hydra is hit with a full
       * separate attack (the attacker chooses when several qualify) at the
       * Hydra's own attack value — undefined baseAttack means "use the unit's
       * attack". That follow-up never retaliates or chains further.
       */
      type: "SECOND_ATTACK_ONE_ADJACENT_TO_SELF";
      baseAttack?: number;
    }
  | {
      /**
       * Medusas: paralysis inflicted by THIS unit's Retaliation Attack. The
       * Pack/Neutral cards paralyse automatically ("The target gains
       * Paralysis"); the Few card first rolls an Attack die and only paralyses
       * on `onRoll` ("After the Retaliation Attack, roll an Attack die, on a
       * '0' the target is Paralysis"). The token lands on the unit the
       * Medusas retaliated against, if it is still alive.
       */
      type: "PARALYZE_ON_RETALIATION";
      /** When set, roll one Attack die and only paralyse on this face. */
      onRoll?: number;
    }
  | {
      /**
       * Dread Knights: "When this unit is targeted by a Retaliation Attack, it
       * gains +N Defense." The bonus only applies while this unit is the
       * defender of a retaliation (i.e. the original attacker being struck
       * back).
       */
      type: "DEFENSE_BONUS_WHEN_RETALIATED";
      amount: number;
    }
  | {
      /**
       * Dragon Flies: "Retaliation Attacks against Dragon Flies suffer -N
       * Attack." The penalty hits whoever retaliates against this unit (the
       * retaliation's attacker), only while this unit is the retaliation's
       * target.
       */
      type: "RETALIATION_AGAINST_ATTACK_PENALTY";
      amount: number;
    }
  | {
      /**
       * Necropolis Dread Knights (Few): "When retaliating after this attack,
       * the enemy rolls 2 Attack dice and resolves the lower result." The
       * Retaliation Attack against this unit rolls at disadvantage.
       */
      type: "RETALIATION_AGAINST_DISADVANTAGE";
    }
  | {
      /**
       * Ghost Dragons (Pack): "[unit_attack] Add +N to your Attack die
       * result." A flat bonus added to every attack (and Retaliation Attack)
       * this unit makes, counted alongside the rolled die.
       */
      type: "ATTACK_DIE_RESULT_BONUS";
      amount: number;
    }
  | {
      /**
       * Ghost Dragons: "[activation] Discard the enemy's positive morale
       * token." When this unit activates, the opposing player's positive
       * morale token (if any) is discarded.
       */
      type: "ON_ACTIVATION_DISCARD_ENEMY_MORALE";
    }
  | {
      /**
       * Wraiths / Trolls: "[activation] Remove up to N damage from this unit."
       * Self-regeneration applied automatically when the unit activates.
       */
      type: "ON_ACTIVATION_HEAL_SELF";
      amount: number;
    }
  | {
      /**
       * Wraiths (Pack): "[activation] …then discard N random card(s) from the
       * enemy's hand." Resolved when the unit activates.
       */
      type: "ON_ACTIVATION_DISCARD_ENEMY_CARD";
      count: number;
    }
  | {
      /**
       * Archangels (Few): "[unit_passive] When combat begins, draw N card(s)."
       * The controller draws from their own deck once the combat's first round
       * starts.
       */
      type: "ON_COMBAT_START_DRAW";
      amount: number;
    }
  | {
      /**
       * Enchanters: "[activation] Remove up to `healAmount` damage from a
       * friendly unit. Otherwise, gain +`attackBonus` Attack." When the unit
       * activates the controller either heals a chosen *other* friendly unit
       * or buffs the Enchanters' own Attack for the round — a neutral always
       * takes the Attack bonus. It never ends the activation: the unit still
       * moves and attacks afterwards.
       */
      type: "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF";
      healAmount: number;
      attackBonus: number;
    }
  | {
      /**
       * Faerie Dragons: "[activation] The selected unit suffers `amount`
       * damage. This is a spell that does not count towards your spell limit."
       * On activation the unit deals flat spell damage to a chosen target
       * (a neutral picks it like a normal attack), then acts normally. The
       * client plays the Ice Bolt projectile + sound for the hit.
       */
      type: "ON_ACTIVATION_DAMAGE_SPELL";
      amount: number;
    }
  | {
      /**
       * Harpies: "[unit_attack] After the enemy's Retaliation Attack, this
       * unit can return to the space from which it moved to attack." Once the
       * attack (and any retaliation) resolves, the harpy may fly back to the
       * space it started its activation on. A neutral always returns; a player
       * chooses. Optional repositioning — never an extra attack.
       */
      type: "RETURN_TO_ORIGIN_AFTER_ATTACK";
    }
  | {
      /**
       * Pit Lords (Pack): "[unit_other] If one of your units has been removed
       * from the board during this Combat, Summon or Reinforce Demons." As an
       * other action (instead of moving/attacking, once per combat) the
       * controller either summons a Few of `demonUnitDefId` onto an empty
       * adjacent space or reinforces a friendly Few of them up to a Pack at no
       * cost. The summoned/reinforced unit joins the army after the combat.
       */
      type: "SUMMON_OR_REINFORCE_DEMONS";
      demonUnitDefId: string;
    }
  | {
      /**
       * Troglodytes / Gargoyles: "This unit ignores Paralysis effects." The
       * unit can never gain a Paralysis token, so it never skips an activation
       * from one (it is simply not placed).
       */
      type: "IGNORE_PARALYSIS";
    }
  | {
      /**
       * "Hatred" bonus (Archangels ↔ Arch Devils, Genies → Efreet, Titans →
       * Black Dragons): "When attacking <unit>, this unit gains +N Attack."
       * A flat Attack bonus that applies whenever this unit attacks a unit
       * whose creature name matches `unitName`.
       */
      type: "ATTACK_BONUS_VS_UNIT_NAME";
      unitName: string;
      amount: number;
    }
  | {
      /**
       * Zombies / Manticores: "If the attacker resolves a <face> on the Attack
       * die, gain +N Defense." A defender-side bonus applied for the incoming
       * attack only, when that attack's resolved die is within [minRoll,
       * maxRoll].
       */
      type: "DEFENSE_BONUS_ON_ATTACK_DIE";
      minRoll: number;
      maxRoll: number;
      amount: number;
    }
  | {
      /**
       * Dread Knights (Pack): "If you resolve a 0 or +1 on the Attack die,
       * increase this unit's total Attack by another +1." An attacker-side
       * bonus added to the attack value when this unit's own resolved die is
       * within [minRoll, maxRoll].
       */
      type: "ATTACK_BONUS_ON_ATTACK_DIE";
      minRoll: number;
      maxRoll: number;
      amount: number;
    }
  | {
      /**
       * Manticores (Pack): "For this attack, ignore the Defense value from the
       * target unit's card." The target's printed Defense is treated as 0 for
       * this attack (Defense tokens and other bonuses still apply).
       */
      type: "IGNORE_TARGET_CARD_DEFENSE";
    }
  | {
      /**
       * Rust Dragons: "On a -1 result on the Attack die, decrease the target's
       * Defense by N (to a minimum of 0)." After the attack, when its own
       * resolved die equals `onRoll`, place the token on the target (a
       * Corrosion token lasts the whole combat and is capped so Defense never
       * drops below 0).
       */
      type: "ON_ATTACK_DIE_TOKEN";
      onRoll: number;
      token: CombatTokenKind;
      amount: number;
    }
  | {
      /**
       * Gorgons: "After the attack, roll `diceCount` Attack dice; on all
       * `onRoll` results, reduce the target's Health to 0." A death stare that
       * destroys the target's current side outright (a Pack flips to its Few
       * side as usual) when every rolled die shows `onRoll`.
       */
      type: "DEATH_STARE_ON_DICE";
      diceCount: number;
      onRoll: number;
    }
  | {
      /**
       * Archangels (Pack): "Once per Combat. Cancel an attack that would reduce
       * another unit's HP to 0." A free, grade-agnostic lethal save offered to
       * the controller in the lethal-save window — for any other friendly unit,
       * once per combat per Archangel stack.
       */
      type: "CANCEL_LETHAL_UNIT_ABILITY";
    }
  | {
      /**
       * Dragon Flies: on attack, remove every ongoing effect the target's own
       * controller placed on the target (attack/defense/initiative buffs,
       * Anti-Magic, etc.) — a dispel of the enemy's own enhancements. Debuffs
       * the attacker placed on the target are left in place.
       */
      type: "DISPEL_ENEMY_EFFECTS_ON_TARGET";
    }
  | {
      /**
       * Iron/Gold/Diamond Golems, neutral Black Dragons: "Reduce any damage
       * from spells by N (to a minimum of 0)." A passive applied to every
       * instance of Spell damage the unit takes — direct damage spells, area
       * spells and the Faerie Dragon's bolt — before it is added to the unit's
       * damage. Independent of the Elementals' school immunity.
       */
      type: "REDUCE_SPELL_DAMAGE";
      amount: number;
    }
  | {
      /**
       * Vampires: "[unit_attack] …then remove up to N damage from this unit."
       * After this unit's own attack (never a Retaliation Attack) it heals
       * itself by up to `amount`.
       */
      type: "ON_ATTACK_HEAL_SELF";
      amount: number;
    }
  | {
      /**
       * Phoenixes: "Once per Combat, when this unit's HP drops to 0, set it to
       * 1 instead." An automatic self-rebirth taken the moment a lethal blow
       * (from any source) would remove the unit, leaving it alive at 1 Health.
       */
      type: "SELF_REBIRTH_ONCE";
    }
  | {
      /**
       * Neutral Halberdiers: "Treat allied adjacent units as if they had a
       * Defense token." While this unit is alive, every friendly unit adjacent
       * to it rolls the Defend die when attacked (a "+1" face grants +1
       * Defense), exactly as a real Defense token would, without spending an
       * action.
       */
      type: "DEFENSE_TOKEN_AURA";
    }
  | {
      /**
       * Familiars: "Whenever an enemy casts a spell from hand, they must
       * discard 1 card from hand." A passive tax: while a living Familiar is on
       * the opposing side, each Spell an enemy casts from hand costs them one
       * extra random card from hand.
       */
      type: "SPELL_CAST_HAND_TAX";
    }
  | {
      /**
       * Neutral Champions: "Roll 2 Attack dice and apply both outcomes." Both
       * dice are summed into the attack's die result. `rerollMinusOnce` also
       * rerolls each "-1" face exactly once before summing (the neutral card's
       * "Reroll this unit's all '-1' rolls").
       */
      type: "ROLL_TWO_DICE_APPLY_BOTH";
      rerollMinusOnce: boolean;
    }
  | {
      /**
       * Mummies (offence): "Ignore the result on the Attack die." This unit's
       * own attacks always resolve as if the die showed 0 (the die is not
       * rolled / its face is discarded).
       */
      type: "IGNORE_OWN_ATTACK_DIE";
    }
  | {
      /**
       * Mummies (defence): "Whenever this unit is attacked, set the opponent's
       * Attack die to `value`." While this unit is the defender, the attacker's
       * resolved die is forced to `value` (-1 for Mummies).
       */
      type: "FORCE_ATTACKER_DIE";
      value: number;
    }
  | {
      /**
       * Azure Dragons / Black Dragons (Pack): "ignore damage from Specialty."
       * This unit takes no damage from Hero Specialty cards; non-damage
       * Specialty effects (buffs/debuffs) still apply.
       */
      type: "IMMUNE_TO_SPECIALTY_DAMAGE";
    }
  | {
      /**
       * Rampart Unicorns (Pack): "Reduce any damage from spells dealt to this
       * and adjacent friendly unit(s) by N." An aura — the reduction protects
       * the Unicorns themselves and every friendly unit adjacent to them. The
       * Few side instead carries a self-only REDUCE_SPELL_DAMAGE.
       */
      type: "REDUCE_SPELL_DAMAGE_AURA";
      amount: number;
    }
  | {
      /**
       * Dungeon Minotaurs (Few/Pack): "If you resolve a '-1' on the Attack die,
       * draw a card." After this unit's attack resolves on `onRoll`, its
       * controller draws `amount` card(s). (The neutral Minotaur rerolls the
       * "-1" instead — a different printed card.)
       */
      type: "ON_ATTACK_DIE_DRAW";
      onRoll: number;
      amount: number;
    }
  | {
      /**
       * Tower Magi (Pack): "[activation] Add +N power to the first spell you
       * cast this round." When this unit activates, its controller's first
       * Spell cast in the current combat round gains `amount` power; unused, it
       * lapses at the end of the combat round.
       */
      type: "ON_ACTIVATION_SPELL_POWER_FIRST_CAST";
      amount: number;
    };

/**
 * Adventure-map ("global") abilities granted while the unit card sits in a
 * player's army. They never fire in combat — the engine reads them from the
 * army during the adventure round/turn structure.
 */
export type UnitMapAbilityEffect =
  | {
      /** Crystal Dragons: "At the beginning of each Resource round, gain N." */
      type: "MAP_RESOURCE_ROUND_GAIN";
      resource: "gold" | "buildingMaterials" | "valuables";
      amount: number;
    }
  | {
      /** Nomads: "At the end of your turn, move your Hero to an adjacent empty field." */
      type: "MAP_END_TURN_HERO_STEP";
    }
  | {
      /**
       * Rogues: "Once during your turn, look at the top card from any deck,
       * then put it back on the top or on the bottom of that deck."
       */
      type: "MAP_TURN_DECK_PEEK";
    }
  | {
      /**
       * Champions: "If your hero is on a field with Stables, this unit's
       * reinforcement cost is reduced by N gold." Applied to this unit's
       * Few→Pack reinforcement while a hero the player controls stands on a
       * field carrying `location`.
       */
      type: "MAP_REINFORCE_DISCOUNT";
      location: string;
      amount: number;
    };

export type UnitAbilityDefinition = {
  id: string;
  name: string;
  text: string;
  effect?: UnitAbilityEffectDefinition;
  /** Adventure-map ability granted while the unit is in a player's army. */
  mapEffect?: UnitMapAbilityEffect;
  implementationStatus: "implemented" | "not-implemented";
};

export const unitAbilities: Record<string, UnitAbilityDefinition> = {
  "unlimited-retaliation": {
    id: "unlimited-retaliation",
    name: "Unlimited Retaliation",
    text: "May retaliate more than once in a combat round.",
    effect: { type: "ALLOW_UNLIMITED_RETALIATION" },
    implementationStatus: "implemented"
  },
  "ignore-combat-penalties": {
    id: "ignore-combat-penalties",
    name: "No Range Penalty",
    text: "Ignores the long ranged back-row attack penalty.",
    effect: { type: "IGNORE_RANGED_BACK_ROW_PENALTY" },
    implementationStatus: "implemented"
  },
  "ranged-extra-shot-on-low-roll": {
    id: "ranged-extra-shot-on-low-roll",
    name: "Low Roll Extra Shot",
    text: "After a ranged attack roll of 0 or lower, deals 1 extra attack damage to the defender.",
    effect: { type: "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL", maxRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "double-attack": {
    id: "double-attack",
    name: "Double Attack",
    text: "If the target is a non-adjacent unit, attack this target again (once — the second attack never triggers a third).",
    effect: { type: "DOUBLE_ATTACK" },
    implementationStatus: "implemented"
  },
  "double-attack-low-roll": {
    id: "double-attack-low-roll",
    name: "Double Attack (−1/0)",
    text: "If the target is a non-adjacent unit and the die shows −1 or 0, attack this target again (stops after the second attack).",
    effect: { type: "DOUBLE_ATTACK", maxRoll: 0 },
    implementationStatus: "implemented"
  },
  "ignores-retaliation": {
    id: "ignores-retaliation",
    name: "No Retaliation",
    text: "Attacks by this unit never provoke a Retaliation Attack.",
    effect: { type: "IGNORE_RETALIATION" },
    implementationStatus: "implemented"
  },
  "teleport-move": {
    id: "teleport-move",
    name: "Teleport",
    text: "As a regular movement, this unit can move to any empty space.",
    effect: { type: "MOVE_ANYWHERE" },
    implementationStatus: "implemented"
  },
  "magog-fireball-splash": {
    id: "magog-fireball-splash",
    name: "Fireball Splash",
    text: "When this unit attacks a target that is not adjacent to it, it also deals 1 damage to a unit adjacent to the target (the attacker chooses; a lone friendly unit takes the hit).",
    effect: { type: "FLAT_DAMAGE_ADJACENT_TO_TARGET", amount: 1, requiresNonAdjacentTarget: true },
    implementationStatus: "implemented"
  },
  "cerberi-second-head": {
    id: "cerberi-second-head",
    name: "Multi-Headed Bite",
    text: "Additionally deals 1 damage to another enemy unit adjacent to this unit (the attacker chooses).",
    effect: { type: "FLAT_DAMAGE_ADJACENT_TO_SELF", amount: 1 },
    implementationStatus: "implemented"
  },
  // No shipping unit carries this any more (the printed Cerberi use
  // `cerberi-second-head`). It is intentionally retained as the engine's
  // generic "attack every adjacent enemy" multi-attack-queue capability and is
  // exercised by ruleset.test.ts — do not delete without removing that test.
  "cerberi-attack-all": {
    id: "cerberi-attack-all",
    name: "Three-Headed Assault",
    text: "BINH: after its attack, this unit performs a full separate attack (attack 3) against every other enemy unit adjacent to it. Each follow-up can be answered with instants and defense; none retaliates.",
    effect: { type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF", baseAttack: 3 },
    implementationStatus: "implemented"
  },
  "lich-death-cloud": {
    id: "lich-death-cloud",
    name: "Death Cloud",
    text: "Choose a unit adjacent to the target and attack it. For the purpose of this attack, your attack is 2. (A full separate attack: instants may be played and the attack die rolls. It can — and with no other choice must — hit friendly units or the Liches themselves.)",
    effect: { type: "SECOND_ATTACK_ADJACENT_TO_TARGET", baseAttack: 2 },
    implementationStatus: "implemented"
  },
  "wolf-raiders-strike-twice": {
    id: "wolf-raiders-strike-twice",
    name: "Strike Twice",
    text: "After the target retaliates, if possible, attack that target again. The second attack does not provoke another retaliation.",
    effect: { type: "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION" },
    implementationStatus: "implemented"
  },
  "thunderbirds-lightning": {
    id: "thunderbirds-lightning",
    name: "Lightning Strike",
    text: 'Right after this unit attacks and before retaliation, roll 1 Attack die. On "0" or "+1", deal 1 damage to the target.',
    effect: { type: "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET", minRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "behemoth-defense-crush-few": {
    id: "behemoth-defense-crush-few",
    name: "Crushing Blow",
    text: "Decrease the target's defense by 1, to a minimum of 0, for this attack.",
    effect: { type: "DEFENSE_REDUCTION_ON_ATTACK", amount: 1 },
    implementationStatus: "implemented"
  },
  "behemoth-defense-crush-pack": {
    id: "behemoth-defense-crush-pack",
    name: "Corrosive Crush",
    text: "Decrease the target's defense by 2, to a minimum of 0, for this attack. (The Corrosion token is placed by the companion ability.)",
    effect: { type: "DEFENSE_REDUCTION_ON_ATTACK", amount: 2 },
    implementationStatus: "implemented"
  },
  "ogres-attack-token-pack": {
    id: "ogres-attack-token-pack",
    name: "Bloodlust Token",
    text: "Other action: place a '+2' Attack token on a chosen friendly ground or flying unit for 2 combat rounds. (A unit holds at most one Attack token — the better one is kept.)",
    effect: {
      type: "PLACE_TOKEN_ACTION",
      token: "attack",
      amount: 2,
      targets: "friendly",
      targetTypes: ["ground", "flying"],
      rounds: 2
    },
    implementationStatus: "implemented"
  },
  "ogres-attack-token-few": {
    id: "ogres-attack-token-few",
    name: "Bloodlust Token",
    text: "Other action: place a '+1' Attack token on a chosen friendly ground or flying unit for 2 combat rounds. (A unit holds at most one Attack token — the better one is kept.)",
    effect: {
      type: "PLACE_TOKEN_ACTION",
      token: "attack",
      amount: 1,
      targets: "friendly",
      targetTypes: ["ground", "flying"],
      rounds: 2
    },
    implementationStatus: "implemented"
  },
  "sorceress-weakness-few": {
    id: "sorceress-weakness-few",
    name: "Weakness Token",
    text: "Other action: place a '−2' Weakness token on any one unit for 2 combat rounds. (A unit holds at most one Weakness token.)",
    effect: {
      type: "PLACE_TOKEN_ACTION",
      token: "weakness",
      amount: -2,
      targets: "any",
      rounds: 2
    },
    implementationStatus: "implemented"
  },
  "sorceress-weakness-on-attack": {
    id: "sorceress-weakness-on-attack",
    name: "Weakness Token",
    text: "After the attack, place a '−1' Weakness token on the target for 2 combat rounds.",
    effect: { type: "ON_ATTACK_TOKEN", token: "weakness", amount: -1, rounds: 2 },
    implementationStatus: "implemented"
  },
  "behemoth-corrosion": {
    id: "behemoth-corrosion",
    name: "Corrosion Token",
    text: "After the attack, place 1 Corrosion token on the target (−1 defense, minimum 0, until the end of combat; one Corrosion token per unit).",
    effect: { type: "ON_ATTACK_TOKEN", token: "corrosion", amount: -1 },
    implementationStatus: "implemented"
  },
  "cyclops-demolish": {
    id: "cyclops-demolish",
    name: "Siege Breaker",
    text: "Other action: this unit can destroy the Gate or a Wall (at any range, automatically successful).",
    effect: { type: "DEMOLISH_FORTIFICATION", canTargetArrowTower: false },
    implementationStatus: "implemented"
  },
  "cyclops-demolish-full": {
    id: "cyclops-demolish-full",
    name: "Siege Breaker",
    text: "Other action: this unit can destroy the Gate, a Wall, or the Arrow Tower (at any range, automatically successful).",
    effect: { type: "DEMOLISH_FORTIFICATION", canTargetArrowTower: true },
    implementationStatus: "implemented"
  },
  "siege-arrow-tower": {
    id: "siege-arrow-tower",
    name: "Arrow Tower",
    text: "Fights from beside the board: shoots like a ranged unit with no positioning penalties, can only be hit by ranged attacks and card effects, and collapses instantly when all Walls and the Gate are destroyed.",
    implementationStatus: "implemented"
  },
  "attack-die-reroll": {
    id: "attack-die-reroll",
    name: "Attack Reroll",
    text: 'May reroll every "0" on its Attack die — the new result replaces the old one. Stacks with Luck and other rerolls; Luck is always spent last.',
    effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 1, onlyOnRoll: 0 },
    implementationStatus: "implemented"
  },
  "attack-roll-advantage": {
    id: "attack-roll-advantage",
    name: "Twin Attack Dice",
    text: "During any attack, roll 2 Attack dice and resolve the higher outcome.",
    effect: { type: "ATTACK_ROLL_ADVANTAGE" },
    implementationStatus: "implemented"
  },
  "magi-power-drain": {
    id: "magi-power-drain",
    name: "Power Drain",
    text: "After this unit's attack, the defending player either discards a card of their choice that can contribute Power (a Power statistic, any Spell, or a Power-granting Artifact/Ability) or lets a random card be discarded from their hand. With no Power card in hand, the random discard is forced.",
    effect: { type: "ENEMY_DISCARDS_POWER_OR_RANDOM" },
    implementationStatus: "implemented"
  },
  "dragon-line-attack-2": {
    id: "dragon-line-attack-2",
    name: "Dragon Breath",
    text: "Attack 2 spaces in a line: after the attack, a full separate attack at attack 2 strikes the unit directly behind the target (friend or foe). That unit is not adjacent, so it never retaliates.",
    effect: { type: "SECOND_ATTACK_BEHIND_TARGET", baseAttack: 2 },
    implementationStatus: "implemented"
  },
  "dragon-line-attack-3": {
    id: "dragon-line-attack-3",
    name: "Dragon Breath",
    text: "Attack 2 spaces in a line: after the attack, a full separate attack at attack 3 strikes the unit directly behind the target (friend or foe). That unit is not adjacent, so it never retaliates.",
    effect: { type: "SECOND_ATTACK_BEHIND_TARGET", baseAttack: 3 },
    implementationStatus: "implemented"
  },
  "azure-dragon-paralysis": {
    id: "azure-dragon-paralysis",
    name: "Paralyzing Breath",
    text: 'If this unit resolves a "-1" on its Attack die, the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "own", onRoll: -1 },
    implementationStatus: "implemented"
  },
  "basilisk-paralysis": {
    id: "basilisk-paralysis",
    name: "Stone Gaze",
    text: 'After the attack, roll 1 Attack die; on a "0" the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "extra", onRoll: 0 },
    implementationStatus: "implemented"
  },
  "fortress-basilisk-paralysis": {
    id: "fortress-basilisk-paralysis",
    name: "Stone Gaze",
    // Fortress Basilisks paralyse on a "-1" on their own Attack die (no extra
    // roll), exactly like the Azure Dragon's paralysis.
    text: 'On a "-1" on the Attack die, the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "own", onRoll: -1 },
    implementationStatus: "implemented"
  },
  "hydra-multi-attack": {
    id: "hydra-multi-attack",
    name: "Hydra Assault",
    text: "Attacks up to 2 adjacent enemy units: after the primary attack, one more enemy adjacent to the Hydra takes a full separate attack at the Hydra's own attack value (you choose when several qualify). That follow-up never retaliates.",
    effect: { type: "SECOND_ATTACK_ONE_ADJACENT_TO_SELF" },
    implementationStatus: "implemented"
  },
  "medusa-paralyze-retaliation": {
    id: "medusa-paralyze-retaliation",
    name: "Paralyzing Gaze",
    text: "After this unit's Retaliation Attack, the target gains Paralysis (it skips its next activation; any damage clears it).",
    effect: { type: "PARALYZE_ON_RETALIATION" },
    implementationStatus: "implemented"
  },
  "medusa-paralyze-retaliation-die": {
    id: "medusa-paralyze-retaliation-die",
    name: "Paralyzing Gaze",
    text: 'After this unit\'s Retaliation Attack, roll an Attack die; on a "0" the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_ON_RETALIATION", onRoll: 0 },
    implementationStatus: "implemented"
  },
  "dread-knight-retaliation-defense": {
    id: "dread-knight-retaliation-defense",
    name: "Death Stare",
    text: "When this unit is targeted by a Retaliation Attack, it gains +1 Defense against it.",
    effect: { type: "DEFENSE_BONUS_WHEN_RETALIATED", amount: 1 },
    implementationStatus: "implemented"
  },
  "dragon-fly-retaliation-penalty": {
    id: "dragon-fly-retaliation-penalty",
    name: "Dazzling Flight",
    text: "Retaliation Attacks against this unit suffer -1 Attack.",
    effect: { type: "RETALIATION_AGAINST_ATTACK_PENALTY", amount: 1 },
    implementationStatus: "implemented"
  },
  "dragon-fly-dispel": {
    id: "dragon-fly-dispel",
    name: "Dispel",
    text: "On attack, remove every ongoing effect the target's own controller placed on it (attack/defense/initiative buffs, Anti-Magic, etc.).",
    effect: { type: "DISPEL_ENEMY_EFFECTS_ON_TARGET" },
    implementationStatus: "implemented"
  },
  "dread-knight-retaliation-disadvantage": {
    id: "dread-knight-retaliation-disadvantage",
    name: "Curse of the Damned",
    text: "When this unit attacks, the enemy's Retaliation Attack rolls 2 Attack dice and resolves the lower result.",
    effect: { type: "RETALIATION_AGAINST_DISADVANTAGE" },
    implementationStatus: "implemented"
  },
  "ghost-dragon-morale-drain": {
    id: "ghost-dragon-morale-drain",
    name: "Aging",
    text: "When this unit activates, discard the enemy's positive morale token.",
    effect: { type: "ON_ACTIVATION_DISCARD_ENEMY_MORALE" },
    implementationStatus: "implemented"
  },
  "ghost-dragon-attack-die": {
    id: "ghost-dragon-attack-die",
    name: "Spectral Strike",
    text: "Add +1 to this unit's Attack die result on every attack.",
    effect: { type: "ATTACK_DIE_RESULT_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  "wraith-heal-1": {
    id: "wraith-heal-1",
    name: "Regeneration",
    text: "When this unit activates, remove up to 1 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 1 },
    implementationStatus: "implemented"
  },
  "wraith-heal-2": {
    id: "wraith-heal-2",
    name: "Regeneration",
    text: "When this unit activates, remove up to 2 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 2 },
    implementationStatus: "implemented"
  },
  "troll-heal-3": {
    id: "troll-heal-3",
    name: "Regeneration",
    text: "When this unit activates, remove up to 3 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 3 },
    implementationStatus: "implemented"
  },
  "wraith-enemy-discard": {
    id: "wraith-enemy-discard",
    name: "Mana Drain",
    text: "When this unit activates, discard 1 random card from the enemy's hand.",
    effect: { type: "ON_ACTIVATION_DISCARD_ENEMY_CARD", count: 1 },
    implementationStatus: "implemented"
  },
  "archangel-combat-start-draw": {
    id: "archangel-combat-start-draw",
    name: "Heavenly Blessing",
    text: "When combat begins, the controller draws 1 card.",
    effect: { type: "ON_COMBAT_START_DRAW", amount: 1 },
    implementationStatus: "implemented"
  },
  "crystal-dragon-valuables": {
    id: "crystal-dragon-valuables",
    name: "Crystal Hoard",
    text: "While in your army: at the beginning of each Resource round, gain 2 valuables.",
    mapEffect: { type: "MAP_RESOURCE_ROUND_GAIN", resource: "valuables", amount: 2 },
    implementationStatus: "implemented"
  },
  "nomad-end-turn-step": {
    id: "nomad-end-turn-step",
    name: "Wanderer",
    text: "While in your army: at the end of your turn, move your Hero's model to an adjacent empty field.",
    mapEffect: { type: "MAP_END_TURN_HERO_STEP" },
    implementationStatus: "implemented"
  },
  "rogue-deck-peek": {
    id: "rogue-deck-peek",
    name: "Scouting",
    text: "While in your army: once during your turn, look at the top card from any deck, then put it back on the top or on the bottom of that deck.",
    mapEffect: { type: "MAP_TURN_DECK_PEEK" },
    implementationStatus: "implemented"
  },
  "enchanter-heal-or-buff": {
    id: "enchanter-heal-or-buff",
    name: "Enchant",
    text: "[activation] Remove up to 2 damage from a chosen friendly unit, or instead gain +1 Attack for this combat round. (A neutral Enchanter always takes the +1 Attack.) This does not end the activation — the unit still moves and attacks.",
    effect: { type: "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF", healAmount: 2, attackBonus: 1 },
    implementationStatus: "implemented"
  },
  "faerie-dragon-spell": {
    id: "faerie-dragon-spell",
    name: "Faerie Bolt",
    text: "[activation] The selected unit suffers 2 damage — a spell that does not count towards your spell limit. (A neutral Faerie Dragon targets it like a normal attack.) Then the unit acts normally.",
    effect: { type: "ON_ACTIVATION_DAMAGE_SPELL", amount: 2 },
    implementationStatus: "implemented"
  },
  "harpy-return": {
    id: "harpy-return",
    name: "Strike and Return",
    text: "After the enemy's Retaliation Attack, this unit can return to the space it moved from to attack. (A neutral Harpy always returns; a player chooses to return or stay.)",
    effect: { type: "RETURN_TO_ORIGIN_AFTER_ATTACK" },
    implementationStatus: "implemented"
  },
  "summon-demons": {
    id: "summon-demons",
    name: "Summon Demons",
    text: "[unit_other] If one of your units has been removed from the board during this Combat, Summon a Few of Demons on an adjacent space or Reinforce a Few of Demons up to a Pack (once per Combat, instead of moving or attacking).",
    effect: { type: "SUMMON_OR_REINFORCE_DEMONS", demonUnitDefId: "inferno.demons" },
    implementationStatus: "implemented"
  },
  "ignore-paralysis": {
    id: "ignore-paralysis",
    name: "Immune to Paralysis",
    text: "This unit ignores Paralysis: it can never gain a Paralysis token.",
    effect: { type: "IGNORE_PARALYSIS" },
    implementationStatus: "implemented"
  },
  "archangel-hate-devils": {
    id: "archangel-hate-devils",
    name: "Hatred",
    text: "When attacking Arch Devils, this unit gains +2 Attack.",
    effect: { type: "ATTACK_BONUS_VS_UNIT_NAME", unitName: "Arch Devils", amount: 2 },
    implementationStatus: "implemented"
  },
  "arch-devil-hate-angels": {
    id: "arch-devil-hate-angels",
    name: "Hatred",
    text: "When attacking Archangels, this unit gains +2 Attack.",
    effect: { type: "ATTACK_BONUS_VS_UNIT_NAME", unitName: "Archangels", amount: 2 },
    implementationStatus: "implemented"
  },
  "genie-hate-efreet": {
    id: "genie-hate-efreet",
    name: "Hatred",
    text: "When attacking Efreet, this unit gains +1 Attack.",
    effect: { type: "ATTACK_BONUS_VS_UNIT_NAME", unitName: "Efreet", amount: 1 },
    implementationStatus: "implemented"
  },
  "titan-hate-black-dragons": {
    id: "titan-hate-black-dragons",
    name: "Hatred",
    text: "When attacking Black Dragons, this unit gains +2 Attack.",
    effect: { type: "ATTACK_BONUS_VS_UNIT_NAME", unitName: "Black Dragons", amount: 2 },
    implementationStatus: "implemented"
  },
  "zombie-resilience": {
    id: "zombie-resilience",
    name: "Undying Resilience",
    text: 'If the attacker resolves a "0" or "+1" on the Attack die, this unit gains +1 Defense against that attack.',
    effect: { type: "DEFENSE_BONUS_ON_ATTACK_DIE", minRoll: 0, maxRoll: 1, amount: 1 },
    implementationStatus: "implemented"
  },
  "zombie-resilience-weak": {
    id: "zombie-resilience-weak",
    name: "Undying Resilience",
    text: 'If the attacker resolves a "+1" on the Attack die, this unit gains +1 Defense against that attack.',
    effect: { type: "DEFENSE_BONUS_ON_ATTACK_DIE", minRoll: 1, maxRoll: 1, amount: 1 },
    implementationStatus: "implemented"
  },
  "manticore-thick-hide": {
    id: "manticore-thick-hide",
    name: "Thick Hide",
    text: 'If the attacker resolves a "0" or "+1" on the Attack die, this unit gains +1 Defense against that attack.',
    effect: { type: "DEFENSE_BONUS_ON_ATTACK_DIE", minRoll: 0, maxRoll: 1, amount: 1 },
    implementationStatus: "implemented"
  },
  "dread-knight-death-blow": {
    id: "dread-knight-death-blow",
    name: "Death Blow",
    text: 'If you resolve a "0" or "+1" on the Attack die, increase this unit\'s total Attack by 1.',
    effect: { type: "ATTACK_BONUS_ON_ATTACK_DIE", minRoll: 0, maxRoll: 1, amount: 1 },
    implementationStatus: "implemented"
  },
  "manticore-ignore-defense": {
    id: "manticore-ignore-defense",
    name: "Piercing Strike",
    text: "For this attack, ignore the Defense value printed on the target's card.",
    effect: { type: "IGNORE_TARGET_CARD_DEFENSE" },
    implementationStatus: "implemented"
  },
  "wyvern-sting": {
    id: "wyvern-sting",
    name: "Poison Sting",
    text: 'After the attack, roll 1 Attack die; on a "0" deal 1 damage to the target.',
    effect: { type: "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET", minRoll: 0, maxRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "rust-dragon-acid": {
    id: "rust-dragon-acid",
    name: "Acid Breath",
    text: 'On a "-1" on the Attack die, place an Acid token on the target: -2 Defense (to a minimum of 0) for the rest of the combat.',
    effect: { type: "ON_ATTACK_DIE_TOKEN", onRoll: -1, token: "corrosion", amount: 2 },
    implementationStatus: "implemented"
  },
  "gorgon-death-stare": {
    id: "gorgon-death-stare",
    name: "Death Stare",
    text: 'After the attack, roll 2 Attack dice; on two "-1" results, reduce the target\'s Health to 0.',
    effect: { type: "DEATH_STARE_ON_DICE", diceCount: 2, onRoll: -1 },
    implementationStatus: "implemented"
  },
  "fortress-gorgon-death-stare": {
    id: "fortress-gorgon-death-stare",
    name: "Death Stare",
    // Fortress Mighty Gorgons (Pack) trigger on a double "0" instead of "-1".
    text: 'After the attack, roll 2 Attack dice; on a double "0", reduce the target\'s Health to 0.',
    effect: { type: "DEATH_STARE_ON_DICE", diceCount: 2, onRoll: 0 },
    implementationStatus: "implemented"
  },
  "archangel-lethal-save": {
    id: "archangel-lethal-save",
    name: "Resurrection",
    text: "Once per Combat, cancel an attack that would reduce another friendly unit's Health to 0 (any grade, no cost).",
    effect: { type: "CANCEL_LETHAL_UNIT_ABILITY" },
    implementationStatus: "implemented"
  },
  "elemental-damage": {
    id: "elemental-damage",
    name: "Elemental Damage",
    text: "[unit_passive] This unit deals elemental damage: its attack cannot be raised by attack cards or Attack tokens, only lowered (e.g. by a Sorceress' Weakness).",
    effect: { type: "DEALS_ELEMENTAL_DAMAGE" },
    implementationStatus: "implemented"
  },
  // Elemental spell immunity — "Immune to Magic Arrow and <element> Magic
  // spells." Air/Storm share Air; Earth/Magma share Earth; Fire/Energy share
  // Fire; Water/Ice share Water. Magic Elementals are immune to Magic Arrow
  // only. "any" is Magic Arrow's school (see IMMUNE_TO_SPELL_SCHOOLS).
  "air-elemental-immunity": {
    id: "air-elemental-immunity",
    name: "Air Immunity",
    text: "[unit_passive] Immune to Magic Arrow and Air Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "air"] },
    implementationStatus: "implemented"
  },
  "earth-elemental-immunity": {
    id: "earth-elemental-immunity",
    name: "Earth Immunity",
    text: "[unit_passive] Immune to Magic Arrow and Earth Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "earth"] },
    implementationStatus: "implemented"
  },
  "fire-elemental-immunity": {
    id: "fire-elemental-immunity",
    name: "Fire Immunity",
    text: "[unit_passive] Immune to Magic Arrow and Fire Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "fire"] },
    implementationStatus: "implemented"
  },
  "water-elemental-immunity": {
    id: "water-elemental-immunity",
    name: "Water Immunity",
    text: "[unit_passive] Immune to Magic Arrow and Water Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "water"] },
    implementationStatus: "implemented"
  },
  "magic-elemental-immunity": {
    id: "magic-elemental-immunity",
    name: "Magic Arrow Immunity",
    text: "[unit_passive] Immune to Magic Arrow.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any"] },
    implementationStatus: "implemented"
  },
  // Neutral Minotaurs: "Reroll this unit's '-1' outcome on the Attack die."
  // Face-gated like the Crusaders' reroll — every fresh "-1" may be rerolled
  // again and the source never depletes.
  "minotaur-reroll": {
    id: "minotaur-reroll",
    name: "Minotaur Fury",
    text: 'Reroll every "-1" on this unit\'s Attack die — the new result replaces the old one.',
    effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 1, onlyOnRoll: -1 },
    implementationStatus: "implemented"
  },
  // Efreet: a non-Elemental unit that still carries the Fire/Magic-Arrow
  // immunity (it does NOT deal elemental damage, so no DEALS_ELEMENTAL_DAMAGE).
  "efreet-fire-immunity": {
    id: "efreet-fire-immunity",
    name: "Fire Immunity",
    text: "[unit_passive] Ignores any damage from Magic Arrows or spells from the Fire School of Magic.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "fire"] },
    implementationStatus: "implemented"
  },
  // Phoenixes: immune to Fire Magic only (NOT Magic Arrow).
  "phoenix-fire-immunity": {
    id: "phoenix-fire-immunity",
    name: "Fire Immunity",
    text: "[unit_passive] Immune to Fire Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["fire"] },
    implementationStatus: "implemented"
  },
  "phoenix-rebirth": {
    id: "phoenix-rebirth",
    name: "Rebirth",
    text: "[unit_passive] Once per Combat, when this unit's Health would drop to 0, set it to 1 instead.",
    effect: { type: "SELF_REBIRTH_ONCE" },
    implementationStatus: "implemented"
  },
  "reduce-spell-damage-2": {
    id: "reduce-spell-damage-2",
    name: "Spell Resistance",
    text: "[unit_passive] Reduce any damage from spells by 2 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_DAMAGE", amount: 2 },
    implementationStatus: "implemented"
  },
  "reduce-spell-damage-3": {
    id: "reduce-spell-damage-3",
    name: "Spell Resistance",
    text: "[unit_passive] Reduce any damage from spells by 3 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_DAMAGE", amount: 3 },
    implementationStatus: "implemented"
  },
  "vampire-heal-on-attack": {
    id: "vampire-heal-on-attack",
    name: "Life Drain",
    text: "[unit_attack] After this unit's attack, remove up to 2 damage from it.",
    effect: { type: "ON_ATTACK_HEAL_SELF", amount: 2 },
    implementationStatus: "implemented"
  },
  "halberdier-defense-aura": {
    id: "halberdier-defense-aura",
    name: "Phalanx",
    text: "[unit_passive] Treat allied units adjacent to this unit as if they had a Defense token.",
    effect: { type: "DEFENSE_TOKEN_AURA" },
    implementationStatus: "implemented"
  },
  "familiar-spell-tax": {
    id: "familiar-spell-tax",
    name: "Mana Leech",
    text: "[unit_passive] Whenever an enemy casts a spell from hand, they must discard 1 card from hand.",
    effect: { type: "SPELL_CAST_HAND_TAX" },
    implementationStatus: "implemented"
  },
  // Castle Champions (Few): the only printed ability on the Few side.
  "champion-stables-discount": {
    id: "champion-stables-discount",
    name: "Stable Master",
    text: "[map_effect] If your hero is on a field with Stables, this unit's reinforcement cost is reduced by 6 gold.",
    mapEffect: { type: "MAP_REINFORCE_DISCOUNT", location: "stables", amount: 6 },
    implementationStatus: "implemented"
  },
  // Castle Champions (Pack): the only printed ability on the Pack side.
  "champion-move-reroll": {
    id: "champion-move-reroll",
    name: "Charge",
    text: "[unit_attack] If this unit's movement ends in a space other than where it started, you may reroll an Attack die.",
    effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 1, requiresMoved: true },
    implementationStatus: "implemented"
  },
  // Neutral Champions: roll 2 dice, reroll each "-1" once, then sum both.
  "champion-roll-two-dice-reroll": {
    id: "champion-roll-two-dice-reroll",
    name: "Champion's Charge",
    text: 'Roll 2 Attack dice and apply both outcomes. Reroll this unit\'s all "-1" rolls.',
    effect: { type: "ROLL_TWO_DICE_APPLY_BOTH", rerollMinusOnce: true },
    implementationStatus: "implemented"
  },
  // Mummies: own attack die counts as 0; an attacker's die is forced to -1.
  "mummy-ignore-own-die": {
    id: "mummy-ignore-own-die",
    name: "Cursed Strike",
    text: "[unit_attack] Ignore the result on this unit's Attack die (it always counts as 0).",
    effect: { type: "IGNORE_OWN_ATTACK_DIE" },
    implementationStatus: "implemented"
  },
  "mummy-force-attacker-die": {
    id: "mummy-force-attacker-die",
    name: "Mummy's Curse",
    text: 'Whenever this unit is attacked, the attacker\'s Attack die is set to "-1".',
    effect: { type: "FORCE_ATTACKER_DIE", value: -1 },
    implementationStatus: "implemented"
  },
  // Azure Dragons / Black Dragons (Pack): immune to every Spell, and to damage
  // from Specialty cards (non-damage Specialty effects still apply).
  "immune-all-spells": {
    id: "immune-all-spells",
    name: "Spell Immunity",
    text: "[unit_passive] Immune to all Spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "air", "earth", "fire", "water"] },
    implementationStatus: "implemented"
  },
  "immune-specialty-damage": {
    id: "immune-specialty-damage",
    name: "Specialty Ward",
    text: "[unit_passive] Ignore damage from Specialty cards (non-damage Specialty effects still apply).",
    effect: { type: "IMMUNE_TO_SPECIALTY_DAMAGE" },
    implementationStatus: "implemented"
  },
  // Tower Iron Golems (Few) / Rampart Unicorns (Few): self-only −1 spell damage.
  "reduce-spell-damage-1": {
    id: "reduce-spell-damage-1",
    name: "Spell Resistance",
    text: "[unit_passive] Reduce any damage from spells by 1 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_DAMAGE", amount: 1 },
    implementationStatus: "implemented"
  },
  // Rampart Unicorns (Pack): −1 spell damage to itself and adjacent friendly units.
  "unicorn-spell-ward-aura": {
    id: "unicorn-spell-ward-aura",
    name: "Spell Ward",
    text: "[unit_passive] Reduce any damage from spells dealt to this and adjacent friendly unit(s) by 1 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_DAMAGE_AURA", amount: 1 },
    implementationStatus: "implemented"
  },
  // Inferno Efreet (Few): immune to Magic Arrow only (the Pack also resists Fire,
  // which the shared `efreet-fire-immunity` covers).
  "efreet-magic-arrow-immunity": {
    id: "efreet-magic-arrow-immunity",
    name: "Magic Arrow Immunity",
    text: "[unit_passive] Ignores any damage from Magic Arrows.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any"] },
    implementationStatus: "implemented"
  },
  // Dungeon Minotaurs (Few/Pack): draw a card whenever the attack die resolves "-1".
  "minotaur-draw-on-miss": {
    id: "minotaur-draw-on-miss",
    name: "Bull Resolve",
    text: '[unit_attack] If you resolve a "-1" on the Attack die, draw a card.',
    effect: { type: "ON_ATTACK_DIE_DRAW", onRoll: -1, amount: 1 },
    implementationStatus: "implemented"
  },
  // Tower Magi (Pack): on activation, your first spell this combat round gets +1 power.
  "magi-power-boost": {
    id: "magi-power-boost",
    name: "Mage's Insight",
    text: "[activation] Add +1 power to the first spell you cast this round.",
    effect: { type: "ON_ACTIVATION_SPELL_POWER_FIRST_CAST", amount: 1 },
    implementationStatus: "implemented"
  }
};
