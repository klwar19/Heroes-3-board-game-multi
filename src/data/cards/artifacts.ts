import type { CardLibrary } from "@/engine/state";

const wikiCredit =
  "Card text from the fan wiki artifact pages; verify against official owned components before full content import.";

function artifactSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/artifacts/${slug}/`
  };
}

const SCANLESS_ARTIFACTS = new Set([
  "necklace_of_dragonteeth",
  "pendant_of_courage",
  "quiet_eye_of_the_dragon",
  "skull_helmet",
  "celestial_necklace_of_bliss",
  "lions_shield_of_courage",
  "sandals_of_the_saint"
]);

function artifactAssets(tier: "minor" | "major" | "relic", slug: string, name: string) {
  return {
    // Newer print runs without wiki scans show the deck back instead.
    cardImage: SCANLESS_ARTIFACTS.has(slug)
      ? "/assets/player-deck-back.webp"
      : `/assets/artifacts_${tier}-${slug}.webp`,
    imageAlt: `${name} artifact card`
  };
}

function notImplementedArtifact(
  slug: string,
  name: string,
  tier: "minor" | "major" | "relic",
  text: string
): CardLibrary[string] {
  return {
    id: `artifact.${slug}`,
    name,
    kind: "artifact",
    timing: "instant",
    artifactTier: tier,
    tags: ["artifact", tier, "needs-implementation", text],
    effect: { type: "DRAW_CARDS", amount: 0 },
    assets: artifactAssets(tier, slug, name),
    implementationStatus: "not-implemented",
    source: artifactSource(slug)
  };
}

export const artifactCards: CardLibrary = {
  // ---- Minor artifacts ----------------------------------------------------
  "artifact.armor_of_wonder": {
    id: "artifact.armor_of_wonder",
    name: "Armor of Wonder",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: ["artifact", "minor", "Draw 1 card and gain +1 attack. — OR — Draw 1 card and gain +1 defense."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Draw 1 card and +1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, drawCards: 1 }
        },
        {
          label: "Draw 1 card and +1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, drawCards: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "armor_of_wonder", "Armor of Wonder"),
    implementationStatus: "implemented",
    source: artifactSource("armor_of_wonder")
  },
  "artifact.dragon_wing_tabard": {
    id: "artifact.dragon_wing_tabard",
    name: "Dragon Wing Tabard",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: ["artifact", "minor", "Discard 1 random card from the enemy's hand. — OR — +1 Power."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 random card from the enemy's hand",
          effect: { type: "RANDOM_ENEMY_DISCARD", count: 1 }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "dragon_wing_tabard", "Dragon Wing Tabard"),
    implementationStatus: "implemented",
    source: artifactSource("dragon_wing_tabard")
  },
  "artifact.hourglass_of_the_evil_hour": {
    id: "artifact.hourglass_of_the_evil_hour",
    name: "Hourglass of the Evil Hour",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "If the enemy has positive morale, they gain negative. — OR — Roll the Attack die. On a \"0\" result, you gain positive morale."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "If the enemy has positive morale, they gain negative",
          effect: { type: "ENEMY_MORALE_STRIP" }
        },
        {
          label: "Roll the Attack die: gain morale on a 0",
          effect: { type: "ROLL_FOR_MORALE", onRoll: 0 }
        }
      ]
    },
    assets: artifactAssets("minor", "hourglass_of_the_evil_hour", "Hourglass of the Evil Hour"),
    implementationStatus: "implemented",
    source: artifactSource("hourglass_of_the_evil_hour")
  },
  "artifact.inexhaustible_cart_of_lumber": {
    id: "artifact.inexhaustible_cart_of_lumber",
    name: "Inexhaustible Cart of Lumber",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: ["artifact", "minor", "Gain 2 building materials. — OR — Remove this card, then gain 4 building materials."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 2 building materials",
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 2 } }
        },
        {
          label: "Remove this card: gain 4 building materials",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 4 } }
        }
      ]
    },
    assets: artifactAssets("minor", "inexhaustible_cart_of_lumber", "Inexhaustible Cart of Lumber"),
    implementationStatus: "implemented",
    source: artifactSource("inexhaustible_cart_of_lumber")
  },
  "artifact.red_dragon_flame_tongue": {
    id: "artifact.red_dragon_flame_tongue",
    name: "Red Dragon Flame Tongue",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: ["artifact", "minor", "+1 defense. — OR — +1 attack."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "red_dragon_flame_tongue", "Red Dragon Flame Tongue"),
    implementationStatus: "implemented",
    source: artifactSource("red_dragon_flame_tongue")
  },
  "artifact.rib_cage": {
    id: "artifact.rib_cage",
    name: "Rib Cage",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "Select 1 Spell card from your discard pile and put it back into your hand. Then, shuffle your discard pile back into your deck. — OR — +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Return a Spell from your discard; shuffle the rest into your deck",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell", shuffleRestIntoDeck: true }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "rib_cage", "Rib Cage"),
    implementationStatus: "implemented",
    source: artifactSource("rib_cage")
  },
  "artifact.speculum": {
    id: "artifact.speculum",
    name: "Speculum",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "Discover any Map tile adjacent to the Map tile your Hero is currently on. — OR — Remove this card, then draw 1 card."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discover an adjacent map tile",
          mapOnly: true,
          effect: { type: "DISCOVER_TILE_CARD" }
        },
        {
          label: "Remove this card: draw 1 card",
          cost: { removeSelf: true },
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "speculum", "Speculum"),
    implementationStatus: "implemented",
    source: artifactSource("speculum")
  },
  "artifact.legs_of_legion": {
    id: "artifact.legs_of_legion",
    name: "Legs of Legion",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: ["artifact", "minor", "Reduce the Recruitment or Reinforcement cost of a unit by 4 gold. — OR — Gain 2 gold."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Next recruit/reinforce costs 4 less gold",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Legs of Legion",
              scope: "player",
              duration: { type: "current-turn" },
              modifiers: [{ type: "RECRUIT_DISCOUNT", amount: 4 }]
            }
          }
        },
        {
          label: "Gain 2 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 2 } }
        }
      ]
    },
    assets: artifactAssets("minor", "legs_of_legion", "Legs of Legion"),
    implementationStatus: "implemented",
    source: artifactSource("legs_of_legion")
  },
  "artifact.loins_of_legion": {
    id: "artifact.loins_of_legion",
    name: "Loins of Legion",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: ["artifact", "minor", "Reduce the Recruitment or Reinforcement cost of a unit by 5 gold. — OR — Gain 2 gold."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Next recruit/reinforce costs 5 less gold",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Loins of Legion",
              scope: "player",
              duration: { type: "current-turn" },
              modifiers: [{ type: "RECRUIT_DISCOUNT", amount: 5 }]
            }
          }
        },
        {
          label: "Gain 2 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 2 } }
        }
      ]
    },
    assets: artifactAssets("minor", "loins_of_legion", "Loins of Legion"),
    implementationStatus: "implemented",
    source: artifactSource("loins_of_legion")
  },
  "artifact.torso_of_legion": {
    id: "artifact.torso_of_legion",
    name: "Torso of Legion",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "Reduce the cost of Recruitment or Reinforcing a unit by 6 gold. — OR — Gain 1 valuables or 2 building materials."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Next recruit/reinforce costs 6 less gold",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Torso of Legion",
              scope: "player",
              duration: { type: "current-turn" },
              modifiers: [{ type: "RECRUIT_DISCOUNT", amount: 6 }]
            }
          }
        },
        {
          label: "Gain 1 valuables",
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        },
        {
          label: "Gain 2 building materials",
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 2 } }
        }
      ]
    },
    assets: artifactAssets("minor", "torso_of_legion", "Torso of Legion"),
    implementationStatus: "implemented",
    source: artifactSource("torso_of_legion")
  },
  "artifact.boots_of_speed": {
    id: "artifact.boots_of_speed",
    name: "Boots of Speed",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    target: { type: "friendly-unit" },
    tags: ["artifact", "minor", "Your hero gains +1 movement. — OR — For this Combat, your selected unit gains +1 initiative."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your hero gains +1 movement",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1 }
        },
        {
          label: "+1 initiative for this combat",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Boots of Speed",
            amount: 1,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        }
      ]
    },
    assets: artifactAssets("minor", "boots_of_speed", "Boots of Speed"),
    implementationStatus: "implemented",
    source: artifactSource("boots_of_speed")
  },
  "artifact.skull_helmet": {
    id: "artifact.skull_helmet",
    name: "Skull Helmet",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "binh-extra",
      "Take 1 non-Artifact card from your discard pile to hand. — OR — If the enemy has positive morale, they gain negative."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take 1 non-Artifact card from your discard pile",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "non-artifact" }
        },
        {
          label: "If the enemy has positive morale, they gain negative",
          effect: { type: "ENEMY_MORALE_STRIP" }
        }
      ]
    },
    assets: artifactAssets("minor", "skull_helmet", "Skull Helmet"),
    implementationStatus: "implemented",
    source: artifactSource("skull_helmet")
  },
  "artifact.equestrians_gloves": {
    id: "artifact.equestrians_gloves",
    name: "Equestrian's Gloves",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    target: { type: "friendly-unit" },
    tags: [
      "artifact",
      "minor",
      "binh-extra",
      "For this Combat, your selected unit gains +1 initiative. — OR — Your Hero gains +1 movement."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 initiative for this combat",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Equestrian's Gloves",
            amount: 1,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        },
        {
          label: "Your hero gains +1 movement",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "equestrians_gloves", "Equestrian's Gloves"),
    implementationStatus: "implemented",
    source: artifactSource("equestrians_gloves")
  },
  "artifact.glyph_of_gallantry": {
    id: "artifact.glyph_of_gallantry",
    name: "Glyph of Gallantry",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: ["artifact", "minor", "binh-extra", "Gain a positive morale token. — OR — +1 defense."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain a positive morale token",
          effect: { type: "GAIN_MORALE", amount: 1 }
        },
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "glyph_of_gallantry", "Glyph of Gallantry"),
    implementationStatus: "implemented",
    source: artifactSource("glyph_of_gallantry")
  },
  "artifact.quiet_eye_of_the_dragon": {
    id: "artifact.quiet_eye_of_the_dragon",
    name: "Quiet Eye of the Dragon",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    target: { type: "friendly-unit" },
    tags: [
      "artifact",
      "minor",
      "binh-extra",
      "For this Combat, your selected unit gains +1 attack. — OR — +1 defense."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 attack for this combat",
          effect: {
            type: "CREATE_ATTACK_BUFF",
            name: "Quiet Eye of the Dragon",
            amount: 1,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        },
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "quiet_eye_of_the_dragon", "Quiet Eye of the Dragon"),
    implementationStatus: "implemented",
    source: artifactSource("quiet_eye_of_the_dragon")
  },
  "artifact.charm_of_mana": notImplementedArtifact(
    "charm_of_mana",
    "Charm of Mana",
    "minor",
    "Discard 2 cards, then draw 3 cards. — OR — Draw 2 cards, then discard 1 card."
  ),
  "artifact.greater_gnolls_flail": notImplementedArtifact(
    "greater_gnolls_flail",
    "Greater Gnoll's Flail",
    "minor",
    "+2 attack, then this unit suffers -1 defense until the end of the Combat. — OR — +1 attack."
  ),
  "artifact.shield_of_the_dwarven_lords": notImplementedArtifact(
    "shield_of_the_dwarven_lords",
    "Shield of the Dwarven Lords",
    "minor",
    "Use this after the Attack die roll. Ignore the Attack die and any additional effects it triggered. — OR — +1 defense."
  ),
  "artifact.shield_of_the_yawning_dead": {
    id: "artifact.shield_of_the_yawning_dead",
    name: "Shield of the Yawning Dead",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: ["artifact", "minor", "Discard 1 card to gain +2 defense. — OR — +1 defense."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: +2 defense",
          cost: { discardCards: 1 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 2 }
        },
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "shield_of_the_yawning_dead", "Shield of the Yawning Dead"),
    implementationStatus: "implemented",
    source: artifactSource("shield_of_the_yawning_dead")
  },

  // ---- Major artifacts ----------------------------------------------------
  "artifact.dragon_scale_shield": {
    id: "artifact.dragon_scale_shield",
    name: "Dragon Scale Shield",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: ["artifact", "major", "+2 attack. — OR — +2 defense."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        },
        {
          label: "+2 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("major", "dragon_scale_shield", "Dragon Scale Shield"),
    implementationStatus: "implemented",
    source: artifactSource("dragon_scale_shield")
  },
  "artifact.endless_bag_of_gold": {
    id: "artifact.endless_bag_of_gold",
    name: "Endless Bag of Gold",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: ["artifact", "major", "Gain 3 gold. — OR — Remove this card, then gain 6 gold."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 3 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 3 } }
        },
        {
          label: "Remove this card: gain 6 gold",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { gold: 6 } }
        }
      ]
    },
    assets: artifactAssets("major", "endless_bag_of_gold", "Endless Bag of Gold"),
    implementationStatus: "implemented",
    source: artifactSource("endless_bag_of_gold")
  },
  "artifact.head_of_legion": {
    id: "artifact.head_of_legion",
    name: "Head of Legion",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: ["artifact", "major", "Reduce the Recruitment or Reinforcement cost of a unit by 6 gold. — OR — Gain 3 gold."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Next recruit/reinforce costs 6 less gold",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Head of Legion",
              scope: "player",
              duration: { type: "current-turn" },
              modifiers: [{ type: "RECRUIT_DISCOUNT", amount: 6 }]
            }
          }
        },
        {
          label: "Gain 3 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 3 } }
        }
      ]
    },
    assets: artifactAssets("major", "head_of_legion", "Head of Legion"),
    implementationStatus: "implemented",
    source: artifactSource("head_of_legion")
  },
  "artifact.tunic_of_the_cyclops_king": {
    id: "artifact.tunic_of_the_cyclops_king",
    name: "Tunic of the Cyclops King",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: ["artifact", "major", "Draw 1 card and gain +1 Power. — OR — +2 Power."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Draw 1 card and +1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, drawCards: 1 }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("major", "tunic_of_the_cyclops_king", "Tunic of the Cyclops King"),
    implementationStatus: "implemented",
    source: artifactSource("tunic_of_the_cyclops_king")
  },
  "artifact.vial_of_lifeblood": {
    id: "artifact.vial_of_lifeblood",
    name: "Vial of Lifeblood",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    target: { type: "friendly-unit" },
    tags: [
      "artifact",
      "major",
      "Remove up to 3 damage from one of your units. — OR — For this Combat, your selected unit gains +1 HP."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove up to 3 damage from one of your units",
          effect: { type: "HEAL_DAMAGE", amount: 3 }
        },
        {
          label: "+1 HP for this combat",
          effect: { type: "ADD_UNIT_MAX_HEALTH", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("major", "vial_of_lifeblood", "Vial of Lifeblood"),
    implementationStatus: "implemented",
    source: artifactSource("vial_of_lifeblood")
  },
  "artifact.cape_of_velocity": {
    id: "artifact.cape_of_velocity",
    name: "Cape of Velocity",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    target: { type: "friendly-unit" },
    tags: [
      "artifact",
      "major",
      "Until the end of the Combat, this unit gains +2 initiative. — OR — Gain 2 gold."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 initiative for this combat",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Cape of Velocity",
            amount: 2,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        },
        {
          label: "Gain 2 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 2 } }
        }
      ]
    },
    assets: artifactAssets("major", "cape_of_velocity", "Cape of Velocity"),
    implementationStatus: "implemented",
    source: artifactSource("cape_of_velocity")
  },
  "artifact.golden_bow": {
    id: "artifact.golden_bow",
    name: "Golden Bow",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "During this Combat, your ranged units ignore the combat penalty. — OR — A ranged unit of your choice gains +2 attack."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your ranged units ignore the combat penalty this combat",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Golden Bow",
              scope: "player",
              duration: { type: "combat" },
              modifiers: [{ type: "RANGED_IGNORE_PENALTY" }]
            }
          }
        },
        {
          label: "+2 attack for a ranged unit",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2, unitTypes: ["ranged"] }
        }
      ]
    },
    assets: artifactAssets("major", "golden_bow", "Golden Bow"),
    implementationStatus: "implemented",
    source: artifactSource("golden_bow")
  },
  "artifact.everflowing_crystal_cloak": {
    id: "artifact.everflowing_crystal_cloak",
    name: "Everflowing Crystal Cloak",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: ["artifact", "major", "Discard 3 cards to gain 2 valuables. — OR — Gain 1 valuables."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 3 cards: gain 2 valuables",
          cost: { discardCards: 3 },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 2 } }
        },
        {
          label: "Gain 1 valuables",
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        }
      ]
    },
    assets: artifactAssets("major", "everflowing_crystal_cloak", "Everflowing Crystal Cloak"),
    implementationStatus: "implemented",
    source: artifactSource("everflowing_crystal_cloak")
  },
  "artifact.everpouring_vial_of_mercury": {
    id: "artifact.everpouring_vial_of_mercury",
    name: "Everpouring Vial of Mercury",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: ["artifact", "major", "Gain 1 valuables. — OR — Remove this card, then gain 2 valuables."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 1 valuables",
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        },
        {
          label: "Remove this card: gain 2 valuables",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 2 } }
        }
      ]
    },
    assets: artifactAssets("major", "everpouring_vial_of_mercury", "Everpouring Vial of Mercury"),
    implementationStatus: "implemented",
    source: artifactSource("everpouring_vial_of_mercury")
  },
  "artifact.breastplate_of_brimstone": {
    id: "artifact.breastplate_of_brimstone",
    name: "Breastplate of Brimstone",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Search (2) the Spell deck. — OR — +1 Power, then discard up to 3 cards from your hand to gain +1 Power per card discarded."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Search (2) the Spell deck",
          effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 2 }
        },
        {
          label: "+1 Power, +1 more per discarded card (up to 3)",
          cost: { discardCardsUpTo: 3 },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, perCostCard: 1 }
        }
      ]
    },
    assets: artifactAssets("major", "breastplate_of_brimstone", "Breastplate of Brimstone"),
    implementationStatus: "implemented",
    source: artifactSource("breastplate_of_brimstone")
  },
  "artifact.shield_of_the_damned": {
    id: "artifact.shield_of_the_damned",
    name: "Shield of the Damned",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Target unit gains +3 defense and suffers 1 damage. — OR — Target unit gains +5 defense and suffers 2 damage. Cannot be used on an enemy unit."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+3 defense, the unit suffers 1 damage",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 3, selfDamage: 1 }
        },
        {
          label: "+5 defense, the unit suffers 2 damage",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 5, selfDamage: 2 }
        }
      ]
    },
    assets: artifactAssets("major", "shield_of_the_damned", "Shield of the Damned"),
    implementationStatus: "implemented",
    source: artifactSource("shield_of_the_damned")
  },
  "artifact.pendant_of_courage": {
    id: "artifact.pendant_of_courage",
    name: "Pendant of Courage",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "binh-extra",
      "Play immediately after you perform a Search action and perform that action again. — OR — Gain 1 expert use."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Repeat your next Search action",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Pendant of Courage",
              scope: "player",
              duration: { type: "current-turn" },
              modifiers: [{ type: "SEARCH_REPEAT_ONCE" }]
            }
          }
        },
        {
          label: "Gain 1 expert use this round",
          effect: { type: "GAIN_EXPERT_USE", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("major", "pendant_of_courage", "Pendant of Courage"),
    implementationStatus: "implemented",
    source: artifactSource("pendant_of_courage")
  },
  "artifact.necklace_of_dragonteeth": {
    id: "artifact.necklace_of_dragonteeth",
    name: "Necklace of Dragonteeth",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "binh-extra",
      "+2 Power. — OR — During this Combat, you can cast 2 spells per Combat round."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        },
        {
          label: "Cast 2 spells per combat round this combat",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Necklace of Dragonteeth",
              scope: "player",
              duration: { type: "combat" },
              modifiers: [{ type: "SPELL_LIMIT_BONUS", amount: 1 }]
            }
          }
        }
      ]
    },
    assets: artifactAssets("major", "necklace_of_dragonteeth", "Necklace of Dragonteeth"),
    implementationStatus: "implemented",
    source: artifactSource("necklace_of_dragonteeth")
  },
  "artifact.shackles_of_war": notImplementedArtifact(
    "shackles_of_war",
    "Shackles of War",
    "major",
    "If played at the start of Combat, the Enemy Hero can neither Retreat nor Surrender. — OR — Draw 2 cards, choose 1 card and discard the other."
  ),
  "artifact.mystic_orb_of_mana": notImplementedArtifact(
    "mystic_orb_of_mana",
    "Mystic Orb of Mana",
    "major",
    "Search (4) your discard pile. — OR — Only if your discard pile is empty: draw 2 cards."
  ),

  // ---- Relic artifacts ----------------------------------------------------
  "artifact.angel_wings": {
    id: "artifact.angel_wings",
    name: "Angel Wings",
    kind: "artifact",
    timing: "instant",
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "Chosen Hero gains +1 movement and can move through any fields without resolving them. The last visited field must be resolved normally. — OR — Draw a card."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 movement and walk through fields this turn",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1, moveThroughThisTurn: true }
        },
        {
          label: "Draw a card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("relic", "angel_wings", "Angel Wings"),
    implementationStatus: "implemented",
    source: artifactSource("angel_wings")
  },
  "artifact.dragon_scale_armor": {
    id: "artifact.dragon_scale_armor",
    name: "Dragon Scale Armor",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: ["artifact", "relic", "+2 attack. — OR — +2 defense."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        },
        {
          label: "+2 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("relic", "dragon_scale_armor", "Dragon Scale Armor"),
    implementationStatus: "implemented",
    source: artifactSource("dragon_scale_armor")
  },
  "artifact.endless_sack_of_gold": {
    id: "artifact.endless_sack_of_gold",
    name: "Endless Sack of Gold",
    kind: "artifact",
    timing: "instant",
    artifactTier: "relic",
    tags: ["artifact", "relic", "Gain 5 gold. — OR — Remove this card, then gain 8 gold."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 5 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 5 } }
        },
        {
          label: "Remove this card: gain 8 gold",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { gold: 8 } }
        }
      ]
    },
    assets: artifactAssets("relic", "endless_sack_of_gold", "Endless Sack of Gold"),
    implementationStatus: "implemented",
    source: artifactSource("endless_sack_of_gold")
  },
  "artifact.sentinels_shield": {
    id: "artifact.sentinels_shield",
    name: "Sentinel's Shield",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: ["artifact", "relic", "Discard 1 card to gain +3 defense. — OR — +2 defense."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: +3 defense",
          cost: { discardCards: 1 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 3 }
        },
        {
          label: "+2 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("relic", "sentinels_shield", "Sentinel's Shield"),
    implementationStatus: "implemented",
    source: artifactSource("sentinels_shield")
  },
  "artifact.sword_of_judgement": {
    id: "artifact.sword_of_judgement",
    name: "Sword of Judgement",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "Discard X cards from hand to gain +X attack. — OR — Discard X cards from hand to gain +X defense."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard X cards: +X attack",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 0, perCostCard: 1 }
        },
        {
          label: "Discard X cards: +X defense",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 0, perCostCard: 1 }
        }
      ]
    },
    assets: artifactAssets("relic", "sword_of_judgement", "Sword of Judgement"),
    implementationStatus: "implemented",
    source: artifactSource("sword_of_judgement")
  },
  "artifact.titans_cuirass": {
    id: "artifact.titans_cuirass",
    name: "Titan's Cuirass",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: ["artifact", "relic", "Discard 1 card to gain +4 Power. — OR — +2 Power."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: +4 Power",
          cost: { discardCards: 1 },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 4 }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("relic", "titans_cuirass", "Titan's Cuirass"),
    implementationStatus: "implemented",
    source: artifactSource("titans_cuirass")
  },
  "artifact.crown_of_dragontooth": {
    id: "artifact.crown_of_dragontooth",
    name: "Crown of Dragontooth",
    kind: "artifact",
    timing: "instant",
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "Select 2 Spell cards from your discard pile and put them back in your hand. — OR — Remove 1 Spell from hand, then Search (2) the Spell deck."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take 2 Spell cards from your discard pile",
          effect: { type: "TAKE_FROM_DISCARD", count: 2, filter: "spell" }
        },
        {
          label: "Remove 1 Spell from hand: Search (2) the Spell deck",
          cost: { discardCards: 1, costCardFilter: "spell", removeCostCards: true },
          effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 2 }
        }
      ]
    },
    assets: artifactAssets("relic", "crown_of_dragontooth", "Crown of Dragontooth"),
    implementationStatus: "implemented",
    source: artifactSource("crown_of_dragontooth")
  },
  "artifact.helm_of_heavenly_enlightenment": {
    id: "artifact.helm_of_heavenly_enlightenment",
    name: "Helm of Heavenly Enlightenment",
    kind: "artifact",
    timing: "instant",
    artifactTier: "relic",
    tags: ["artifact", "relic", "binh-extra", "Gain 1 expert use. — OR — Draw 2 cards."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 1 expert use this round",
          effect: { type: "GAIN_EXPERT_USE", amount: 1 }
        },
        {
          label: "Draw 2 cards",
          effect: { type: "DRAW_CARDS", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("relic", "helm_of_heavenly_enlightenment", "Helm of Heavenly Enlightenment"),
    implementationStatus: "implemented",
    source: artifactSource("helm_of_heavenly_enlightenment")
  },
  "artifact.celestial_necklace_of_bliss": {
    id: "artifact.celestial_necklace_of_bliss",
    name: "Celestial Necklace of Bliss",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "binh-extra",
      "Discard X cards from hand to gain +X attack. — OR — Remove this card, then gain +4 attack."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard X cards: +X attack",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 0, perCostCard: 1 }
        },
        {
          label: "Remove this card: +4 attack",
          cost: { removeSelf: true },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 4 }
        }
      ]
    },
    assets: artifactAssets("relic", "celestial_necklace_of_bliss", "Celestial Necklace of Bliss"),
    implementationStatus: "implemented",
    source: artifactSource("celestial_necklace_of_bliss")
  },
  "artifact.lions_shield_of_courage": {
    id: "artifact.lions_shield_of_courage",
    name: "Lion's Shield of Courage",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "binh-extra",
      "Discard X cards from hand to gain +X defense. — OR — Remove this card, then gain +4 defense."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard X cards: +X defense",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 0, perCostCard: 1 }
        },
        {
          label: "Remove this card: +4 defense",
          cost: { removeSelf: true },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 4 }
        }
      ]
    },
    assets: artifactAssets("relic", "lions_shield_of_courage", "Lion's Shield of Courage"),
    implementationStatus: "implemented",
    source: artifactSource("lions_shield_of_courage")
  },
  "artifact.sandals_of_the_saint": {
    id: "artifact.sandals_of_the_saint",
    name: "Sandals of the Saint",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "binh-extra",
      "Discard X cards from hand to gain +X Power. — OR — Remove this card, then gain +4 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard X cards: +X Power",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 0, perCostCard: 1 }
        },
        {
          label: "Remove this card: +4 Power",
          cost: { removeSelf: true },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 4 }
        }
      ]
    },
    assets: artifactAssets("relic", "sandals_of_the_saint", "Sandals of the Saint"),
    implementationStatus: "implemented",
    source: artifactSource("sandals_of_the_saint")
  },
  "artifact.orb_of_vulnerability": notImplementedArtifact(
    "orb_of_vulnerability",
    "Orb of Vulnerability",
    "relic",
    "During this Combat, negate all units' special abilities related to spells. Remove this card instead of discarding it. — OR — +2 Power."
  )
};

/**
 * Single mixed Artifact deck (legacy mode): every implemented Core, Rampart
 * and Inferno artifact, one copy each. The five sample.ts artifacts
 * (Centaur's Axe, Ogre's Club, Titan's Gladius, Buckler, Breastplate of
 * Petrified Wood) join the printed set.
 */
export const artifactDeckLegacy: string[] = [
  // minor
  "artifact.armor_of_wonder",
  "artifact.breastplate_of_petrified_wood",
  "artifact.buckler_of_the_gnoll_king",
  "artifact.centaurs_axe",
  "artifact.dragon_wing_tabard",
  "artifact.hourglass_of_the_evil_hour",
  "artifact.inexhaustible_cart_of_lumber",
  "artifact.legs_of_legion",
  "artifact.loins_of_legion",
  "artifact.red_dragon_flame_tongue",
  "artifact.rib_cage",
  "artifact.shield_of_the_yawning_dead",
  "artifact.speculum",
  "artifact.torso_of_legion",
  "artifact.boots_of_speed",
  // major
  "artifact.dragon_scale_shield",
  "artifact.endless_bag_of_gold",
  "artifact.head_of_legion",
  "artifact.ogres_club_of_havoc",
  "artifact.tunic_of_the_cyclops_king",
  "artifact.vial_of_lifeblood",
  "artifact.cape_of_velocity",
  "artifact.golden_bow",
  "artifact.everflowing_crystal_cloak",
  "artifact.everpouring_vial_of_mercury",
  "artifact.breastplate_of_brimstone",
  "artifact.shield_of_the_damned",
  // relic
  "artifact.angel_wings",
  "artifact.dragon_scale_armor",
  "artifact.endless_sack_of_gold",
  "artifact.sentinels_shield",
  "artifact.sword_of_judgement",
  "artifact.titans_cuirass",
  "artifact.titans_gladius",
  "artifact.crown_of_dragontooth"
];

/** BINH Minor Artifact deck (adds the BINH-extra minors). */
export const artifactDeckBinhMinor: string[] = [
  "artifact.armor_of_wonder",
  "artifact.breastplate_of_petrified_wood",
  "artifact.buckler_of_the_gnoll_king",
  "artifact.centaurs_axe",
  "artifact.dragon_wing_tabard",
  "artifact.hourglass_of_the_evil_hour",
  "artifact.inexhaustible_cart_of_lumber",
  "artifact.legs_of_legion",
  "artifact.loins_of_legion",
  "artifact.red_dragon_flame_tongue",
  "artifact.rib_cage",
  "artifact.shield_of_the_yawning_dead",
  "artifact.speculum",
  "artifact.torso_of_legion",
  "artifact.boots_of_speed",
  "artifact.skull_helmet",
  "artifact.equestrians_gloves",
  "artifact.glyph_of_gallantry",
  "artifact.quiet_eye_of_the_dragon"
];

/** BINH Major Artifact deck (adds the BINH-extra majors). */
export const artifactDeckBinhMajor: string[] = [
  "artifact.dragon_scale_shield",
  "artifact.endless_bag_of_gold",
  "artifact.head_of_legion",
  "artifact.ogres_club_of_havoc",
  "artifact.tunic_of_the_cyclops_king",
  "artifact.vial_of_lifeblood",
  "artifact.cape_of_velocity",
  "artifact.golden_bow",
  "artifact.everflowing_crystal_cloak",
  "artifact.everpouring_vial_of_mercury",
  "artifact.breastplate_of_brimstone",
  "artifact.shield_of_the_damned",
  "artifact.pendant_of_courage",
  "artifact.necklace_of_dragonteeth"
];

/** BINH Relic Artifact deck (adds the BINH-extra relics). */
export const artifactDeckBinhRelic: string[] = [
  "artifact.angel_wings",
  "artifact.dragon_scale_armor",
  "artifact.endless_sack_of_gold",
  "artifact.sentinels_shield",
  "artifact.sword_of_judgement",
  "artifact.titans_cuirass",
  "artifact.titans_gladius",
  "artifact.crown_of_dragontooth",
  "artifact.helm_of_heavenly_enlightenment",
  "artifact.celestial_necklace_of_bliss",
  "artifact.lions_shield_of_courage",
  "artifact.sandals_of_the_saint"
];
