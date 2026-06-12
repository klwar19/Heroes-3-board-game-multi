import type { CombatTokenKind, EffectDurationDefinition, UnitType } from "@/engine/state";

export type UnitAbilityEffectDefinition =
  | { type: "ALLOW_UNLIMITED_RETALIATION" }
  | { type: "IGNORE_RETALIATION" }
  | { type: "IGNORE_RANGED_BACK_ROW_PENALTY" }
  | { type: "MOVE_ANYWHERE" }
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
       * Behemoths: the attack itself treats the target's defense as `amount`
       * lower (to a minimum of 0).
       */
      type: "ATTACK_DEFENSE_PIERCE";
      amount: number;
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
      type: "ATTACK_DIE_REROLL";
      rerollsPerAttack: number;
      /**
       * Crusaders: 'You can reroll every "0"' — the reroll is only offered
       * while the die shows this face, and every new matching face may be
       * rerolled again (the source never depletes).
       */
      onlyOnRoll?: number;
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
    };

export type UnitAbilityDefinition = {
  id: string;
  name: string;
  text: string;
  effect?: UnitAbilityEffectDefinition;
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
  "behemoth-pierce-1": {
    id: "behemoth-pierce-1",
    name: "Rending Claws",
    text: "When attacking, decrease the target's defense by 1 (to a minimum of 0).",
    effect: { type: "ATTACK_DEFENSE_PIERCE", amount: 1 },
    implementationStatus: "implemented"
  },
  "behemoth-pierce-2": {
    id: "behemoth-pierce-2",
    name: "Rending Claws",
    text: "When attacking, decrease the target's defense by 2 (to a minimum of 0).",
    effect: { type: "ATTACK_DEFENSE_PIERCE", amount: 2 },
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
  "summon-demons": {
    id: "summon-demons",
    name: "Summon Demons",
    text: "Known unit ability. Summon placement and source rules are still pending.",
    implementationStatus: "not-implemented"
  }
};
