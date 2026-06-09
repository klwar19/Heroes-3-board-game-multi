export type UnitAbilityEffectDefinition =
  | { type: "ALLOW_UNLIMITED_RETALIATION" }
  | { type: "IGNORE_RANGED_BACK_ROW_PENALTY" }
  | { type: "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL"; maxRoll: number; amount: number }
  | { type: "SPLASH_DAMAGE_ON_RANGED_HIT"; amount: number };

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
  "splash-damage": {
    id: "splash-damage",
    name: "Splash Damage",
    text: "After a ranged hit, deals 1 effect damage to adjacent enemy units around the defender.",
    effect: { type: "SPLASH_DAMAGE_ON_RANGED_HIT", amount: 1 },
    implementationStatus: "implemented"
  },
  "summon-demons": {
    id: "summon-demons",
    name: "Summon Demons",
    text: "Known unit ability. Summon placement and source rules are still pending.",
    implementationStatus: "not-implemented"
  }
};
