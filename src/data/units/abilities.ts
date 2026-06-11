import type { EffectDurationDefinition, UnitType } from "@/engine/state";

export type UnitAbilityEffectDefinition =
  | { type: "ALLOW_UNLIMITED_RETALIATION" }
  | { type: "IGNORE_RETALIATION" }
  | { type: "IGNORE_RANGED_BACK_ROW_PENALTY" }
  | { type: "MOVE_ANYWHERE" }
  | { type: "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL"; maxRoll: number; amount: number }
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
  | { type: "ATTACK_DIE_REROLL"; rerollsPerAttack: number }
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
  "lich-death-cloud": {
    id: "lich-death-cloud",
    name: "Death Cloud",
    text: "Choose a unit adjacent to the target and attack it. For the purpose of this attack, your attack is 2. (A full separate attack: instants may be played and the attack die rolls. It can — and with no other choice must — hit friendly units or the Liches themselves.)",
    effect: { type: "SECOND_ATTACK_ADJACENT_TO_TARGET", baseAttack: 2 },
    implementationStatus: "implemented"
  },
  "ogres-attack-token-pack": {
    id: "ogres-attack-token-pack",
    name: "Ogre Attack Token",
    text: "Place a +2 attack token on a chosen ground or flying unit for 2 combat rounds.",
    effect: {
      type: "ACTIVATION_ATTACK_BUFF",
      amount: 2,
      targetTypes: ["ground", "flying"],
      duration: { type: "combat-rounds", rounds: 2 },
      endsActivation: true,
      preventsMovement: true
    },
    implementationStatus: "implemented"
  },
  "ogres-attack-token-few": {
    id: "ogres-attack-token-few",
    name: "Ogre Attack Token",
    text: "Place a +1 attack token on a chosen ground or flying unit for 2 combat rounds.",
    effect: {
      type: "ACTIVATION_ATTACK_BUFF",
      amount: 1,
      targetTypes: ["ground", "flying"],
      duration: { type: "combat-rounds", rounds: 2 },
      endsActivation: true,
      preventsMovement: true
    },
    implementationStatus: "implemented"
  },
  "attack-die-reroll": {
    id: "attack-die-reroll",
    name: "Attack Reroll",
    text: "May reroll its attack die once per attack. Stacks with Luck and other rerolls; Luck is always spent last.",
    effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 1 },
    implementationStatus: "implemented"
  },
  "summon-demons": {
    id: "summon-demons",
    name: "Summon Demons",
    text: "Known unit ability. Summon placement and source rules are still pending.",
    implementationStatus: "not-implemented"
  }
};
