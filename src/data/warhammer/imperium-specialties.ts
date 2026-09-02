import type { CardLibrary } from "@/engine/state";

const source = {
  product: "Warhammer 40,000 — Imperium fan expansion",
  credit: "Original specialty mechanics for this digital module."
};

export const imperiumSpecialtyCards: CardLibrary = {
  "specialty.emperor_of_mankind.1": {
    id: "specialty.emperor_of_mankind.1", name: "Emperor's Tarot I", kind: "hero-specialty",
    timing: "instant", phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", "emperor_of_mankind", "Instant — Choose one: when your unit is attacked, it gains +1 Defense and you draw 1 card; OR when you cast a Spell, add +1 Power."],
    target: { type: "friendly-unit" },
    effect: { type: "CHOOSE_ONE", options: [
      { label: "Aegis: +1 Defense, then draw 1", trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" }, effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, drawCards: 1 } },
      { label: "Foretelling: +1 Spell Power", trigger: { event: "SPELL_CAST_STARTED", controller: "self" }, target: { type: "none" }, effect: { type: "ADD_SPELL_POWER", amount: 1 } }
    ] }, implementationStatus: "implemented", source
  },
  "specialty.emperor_of_mankind.4": {
    id: "specialty.emperor_of_mankind.4", name: "Golden Throne's Aegis IV", kind: "hero-specialty",
    timing: "instant", phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", "emperor_of_mankind", "Instant — Choose one: heal 2 damage and remove one negative effect or Paralysis from a friendly unit; OR deal 1 flat damage to an enemy unit."],
    target: { type: "friendly-unit" },
    effect: { type: "CHOOSE_ONE", options: [
      { label: "Preserve: heal 2 and cleanse", combatOnly: true, combatAnytime: true, effect: { type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS", amount: 2, removePolarity: "negative", removeParalysis: true } },
      { label: "Smite: deal 1 flat damage", combatOnly: true, combatAnytime: true, target: { type: "enemy-unit" }, effect: { type: "DEAL_DAMAGE", amount: 1, damageKind: "effect" } }
    ] }, implementationStatus: "implemented", source
  },
  "specialty.emperor_of_mankind.6": {
    id: "specialty.emperor_of_mankind.6", name: "Master of Mankind VI", kind: "hero-specialty",
    timing: "combat", phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", "ongoing", "emperor_of_mankind", "Choose one: Ongoing — you may cast 1 additional Spell each Combat round; OR Instant — deal 2 flat damage to an enemy unit."],
    target: { type: "none" },
    effect: { type: "CHOOSE_ONE", options: [
      { label: "Psychic Ascendancy: +1 Spell cast each round", combatOnly: true, effect: { type: "CREATE_ACTIVE_EFFECT", effect: { name: "Psychic Ascendancy", scope: "player", duration: { type: "combat" }, polarity: "positive", removable: true, modifiers: [{ type: "SPELL_LIMIT_BONUS", amount: 1 }] } } },
      { label: "Psychic Annihilation: deal 2 flat damage", combatOnly: true, combatAnytime: true, target: { type: "enemy-unit" }, effect: { type: "DEAL_DAMAGE", amount: 2, damageKind: "effect" } }
    ] }, implementationStatus: "implemented", source
  },

  "specialty.roboute_guilliman.1": {
    id: "specialty.roboute_guilliman.1", name: "Logistics of Ultramar I", kind: "hero-specialty",
    timing: "map", phaseLimit: ["map"],
    tags: ["hero-specialty", "map", "roboute_guilliman", "Map action — Choose one: gain 1 Building Material; OR draw 2 cards, then discard 1."],
    target: { type: "none" },
    effect: { type: "CHOOSE_ONE", options: [
      { label: "Supply Tithe: +1 Building Material", mapOnly: true, effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 1 } } },
      { label: "Operational Briefing: draw 2, then discard 1", mapOnly: true, effect: { type: "DRAW_CARDS", amount: 2, thenDiscard: 1 } }
    ] }, implementationStatus: "implemented", source
  },
  "specialty.roboute_guilliman.4": {
    id: "specialty.roboute_guilliman.4", name: "Codex Manoeuvre IV", kind: "hero-specialty",
    timing: "instant", phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", "roboute_guilliman", "Instant — Choose one: when your unit attacks, it gains +1 Attack and you draw 1 card; OR when attacked, it gains +1 Defense and you draw 1 card."],
    target: { type: "friendly-unit" },
    effect: { type: "CHOOSE_ONE", options: [
      { label: "Assault Doctrine: +1 Attack, draw 1", trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" }, effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, drawCards: 1 } },
      { label: "Defensive Doctrine: +1 Defense, draw 1", trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" }, effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, drawCards: 1 } }
    ] }, implementationStatus: "implemented", source
  },
  "specialty.roboute_guilliman.6": {
    id: "specialty.roboute_guilliman.6", name: "Adaptive Doctrine VI", kind: "hero-specialty",
    timing: "combat", phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", "ongoing", "roboute_guilliman", "Ongoing — A friendly unit gains +1 Attack and +2 Initiative for this Combat. If it is ranged, it also ignores ranged penalties."],
    target: { type: "friendly-unit" },
    effect: { type: "CREATE_ACTIVE_EFFECT", effect: { name: "Adaptive Doctrine", scope: "unit", duration: { type: "combat" }, polarity: "positive", removable: true, modifiers: [
      { type: "ATTACK_BONUS", amount: 1 }, { type: "INITIATIVE_BONUS", amount: 2 }, { type: "RANGED_IGNORE_PENALTY" }
    ] } }, implementationStatus: "implemented", source
  },

  "specialty.rogal_dorn.1": {
    id: "specialty.rogal_dorn.1", name: "Measured Bulwark I", kind: "hero-specialty",
    timing: "instant", phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", "rogal_dorn", "Instant — When your unit is attacked, it gains +1 Defense; if another friendly unit is adjacent to it, it gains +2 Defense instead."],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" }, target: { type: "friendly-unit" },
    effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, extraIfAdjacentFriendly: 1 }, implementationStatus: "implemented", source
  },
  "specialty.rogal_dorn.4": {
    id: "specialty.rogal_dorn.4", name: "Hold the Line IV", kind: "hero-specialty",
    timing: "combat", phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", "ongoing", "rogal_dorn", "Ongoing — A friendly unit gains +1 Defense and may Retaliate without limit for this Combat."],
    target: { type: "friendly-unit" },
    effect: { type: "CREATE_ACTIVE_EFFECT", effect: { name: "Hold the Line", scope: "unit", duration: { type: "combat" }, polarity: "positive", removable: true, modifiers: [
      { type: "DEFENSE_BONUS", amount: 1 }, { type: "UNLIMITED_RETALIATION" }
    ] } }, implementationStatus: "implemented", source
  },
  "specialty.rogal_dorn.6": {
    id: "specialty.rogal_dorn.6", name: "Fortress Protocol VI", kind: "hero-specialty",
    timing: "instant", phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", "combat", "ongoing", "rogal_dorn", "Choose one: Ongoing — until the end of this Combat round, all your units are treated as having a Defense token; OR Instant — draw 1 card."],
    target: { type: "none" },
    effect: { type: "CHOOSE_ONE", options: [
      { label: "Fortify: all your units count as Defended this round", combatOnly: true, effect: { type: "CREATE_ACTIVE_EFFECT", effect: { name: "Fortress Protocol", scope: "player", duration: { type: "current-combat-round" }, polarity: "positive", removable: true, modifiers: [{ type: "VIRTUAL_DEFENSE_TOKEN" }] } } },
      { label: "Contingency: draw 1 card", target: { type: "none" }, effect: { type: "DRAW_CARDS", amount: 1 } }
    ] }, implementationStatus: "implemented", source
  },

  "specialty.sanguinius.1": {
    id: "specialty.sanguinius.1", name: "Winged Assault I", kind: "hero-specialty",
    timing: "instant", phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", "sanguinius", "Instant — Choose one: move a friendly unit 1 space without Retaliation; OR when your unit attacks, it gains +1 Attack."],
    target: { type: "friendly-unit" },
    effect: { type: "CHOOSE_ONE", options: [
      { label: "Winged Advance: move 1 space", combatOnly: true, combatAnytime: true, effect: { type: "MOVE_UNIT_ADJACENT" } },
      { label: "Spearhead: +1 Attack", trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" }, effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 } }
    ] }, implementationStatus: "implemented", source
  },
  "specialty.sanguinius.4": {
    id: "specialty.sanguinius.4", name: "Host of Angels IV", kind: "hero-specialty",
    timing: "combat", phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", "ongoing", "sanguinius", "Ongoing — A friendly unit gains +1 Initiative and rolls two Attack dice, keeping the higher, for this Combat."],
    target: { type: "friendly-unit" },
    effect: { type: "CREATE_ACTIVE_EFFECT", effect: { name: "Host of Angels", scope: "unit", duration: { type: "combat" }, polarity: "positive", removable: true, modifiers: [
      { type: "INITIATIVE_BONUS", amount: 1 }, { type: "ATTACK_ROLL_ADVANTAGE" }
    ] } }, implementationStatus: "implemented", source
  },
  "specialty.sanguinius.6": {
    id: "specialty.sanguinius.6", name: "Red Thirst Unbound VI", kind: "hero-specialty",
    timing: "instant", phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", "sanguinius", "Instant — When your unit attacks, it gains +1 Attack, ignores Retaliation, and heals damage equal to half the damage it deals (rounded up)."],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" }, target: { type: "friendly-unit" },
    effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, ignoresRetaliation: true, healHalfDamageDealt: true }, implementationStatus: "implemented", source
  }
};
