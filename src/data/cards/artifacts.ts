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
  "sandals_of_the_saint",
  // Eversmoking Ring of Sulfur has no card scan on the wiki either (the wiki
  // itself shows the deck back for it), so it falls back to the deck back here.
  "eversmoking_ring_of_sulfur",
  // The four elemental Orbs and the Pendant of Second Sight have no wiki scan
  // bundled yet — show the deck back rather than a broken image.
  "orb_of_driving_rain",
  "orb_of_silt",
  "orb_of_tempestuous_fire",
  "orb_of_the_firmament",
  "pendant_of_second_sight",
  // Newly added Cove/sea artifact whose card scan is not yet committed to
  // public/assets — it falls back to the deck back until the scan lands.
  // (Ring of the Wayfarer's scan is committed, so it is not listed here.)
  "crown_of_the_five_seas"
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
  // Charm of Mana: pure card cycling. Option 0 pays a 2-card discard cost up
  // front, then draws 3 (net +1). Option 1 draws 2 first, then opens a
  // hand-discard choice for 1 card (any hand card — the printed text sets no
  // restriction).
  "artifact.charm_of_mana": {
    id: "artifact.charm_of_mana",
    name: "Charm of Mana",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "Discard 2 cards, then draw 3 cards. — OR — Draw 2 cards, then discard 1 card."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 2 cards, then draw 3",
          cost: { discardCards: 2 },
          effect: { type: "DRAW_CARDS", amount: 3 }
        },
        {
          label: "Draw 2 cards, then discard 1",
          effect: { type: "DRAW_CARDS", amount: 2, thenDiscard: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "charm_of_mana", "Charm of Mana"),
    implementationStatus: "implemented",
    source: artifactSource("charm_of_mana")
  },
  // Greater Gnoll's Flail: played while one of your units is attacking. The
  // big swing adds +2 attack but leaves the unit a Corrosion token (−1 defense
  // for the rest of the Combat); the safe option is a plain +1 attack.
  "artifact.greater_gnolls_flail": {
    id: "artifact.greater_gnolls_flail",
    name: "Greater Gnoll's Flail",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "+2 attack, then this unit suffers -1 defense until the end of the Combat. — OR — +1 attack."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 attack, then -1 defense until the end of the Combat",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2, selfStatPenalty: { stat: "defense", amount: 1 } }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "greater_gnolls_flail", "Greater Gnoll's Flail"),
    implementationStatus: "implemented",
    source: artifactSource("greater_gnolls_flail")
  },
  // Shield of the Dwarven Lords: the top side is a post-roll defender reaction.
  // It is offered only in the dedicated ATTACK_DIE_SETTLED window (engine:
  // IGNORE_ATTACK_DIE_RESULT) — never as a free combat instant or in the normal
  // attack-declared window — and ignores the rolled die plus every effect that
  // die face triggered (Death Blow, the Minotaurs' draw, paralysis, the ranged
  // low-roll bolt, the Zombie/Manticore die-defense bonus). The bottom side is
  // the ordinary +1 defense reaction against an incoming attack.
  "artifact.shield_of_the_dwarven_lords": {
    id: "artifact.shield_of_the_dwarven_lords",
    name: "Shield of the Dwarven Lords",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "Use this after the Attack die roll. Ignore the Attack die and any additional effects it triggered. — OR — +1 defense."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "After the Attack die roll: ignore the die and the effects it triggered",
          effect: { type: "IGNORE_ATTACK_DIE_RESULT" }
        },
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "shield_of_the_dwarven_lords", "Shield of the Dwarven Lords"),
    implementationStatus: "implemented",
    source: artifactSource("shield_of_the_dwarven_lords")
  },
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
  // Income permanents: option 0 (ENTER_PLAY) keeps the card in play next to the
  // hero board and pays 1 resource at the start of every Resources round
  // (engine: permanentEffect.resourceRoundGain, applied in startAdventureRound).
  // Like every permanent it occupies the single permanent slot — playing
  // another permanent discards it (and vice versa), in combat as well. Option 1
  // cracks the card open: it is removed from the game for a one-off larger gain.
  "artifact.eversmoking_ring_of_sulfur": {
    id: "artifact.eversmoking_ring_of_sulfur",
    name: "Eversmoking Ring of Sulfur",
    kind: "artifact",
    timing: "ongoing",
    artifactTier: "minor",
    permanent: true,
    permanentEffect: { resourceRoundGain: { resource: "valuables", amount: 1 } },
    tags: [
      "artifact",
      "minor",
      "permanent",
      "income",
      "At the beginning of each Resources round, gain 1 valuables. — OR — Remove this card, then gain 2 valuables."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "At the beginning of each Resources round, gain 1 valuables",
          effect: { type: "ENTER_PLAY" }
        },
        {
          label: "Remove this card: gain 2 valuables",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 2 } }
        }
      ]
    },
    assets: artifactAssets("minor", "eversmoking_ring_of_sulfur", "Eversmoking Ring of Sulfur"),
    implementationStatus: "implemented",
    source: artifactSource("eversmoking_ring_of_sulfur")
  },
  "artifact.inexhaustible_cart_of_ore": {
    id: "artifact.inexhaustible_cart_of_ore",
    name: "Inexhaustible Cart of Ore",
    kind: "artifact",
    timing: "ongoing",
    artifactTier: "minor",
    permanent: true,
    permanentEffect: { resourceRoundGain: { resource: "buildingMaterials", amount: 1 } },
    tags: [
      "artifact",
      "minor",
      "permanent",
      "income",
      "At the beginning of each Resources round, gain 1 building materials. — OR — Remove this card, then gain 3 building materials."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "At the beginning of each Resources round, gain 1 building materials",
          effect: { type: "ENTER_PLAY" }
        },
        {
          label: "Remove this card: gain 3 building materials",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 3 } }
        }
      ]
    },
    assets: artifactAssets("minor", "inexhaustible_cart_of_ore", "Inexhaustible Cart of Ore"),
    implementationStatus: "implemented",
    source: artifactSource("inexhaustible_cart_of_ore")
  },
  // Ring of the Wayfarer: option 0 is the familiar combat initiative buff (on a
  // friendly unit, the card-level target). Option 1 is the paralysis side —
  // played only at the start (round 1) of a Combat against Neutral Units
  // (engine: requiresNeutralCombatStart + combatOnly), it drops a Paralysis
  // token on any chosen unit whose grade is at most gold; the PLACE_PARALYSIS
  // gradeByPower gate ({0: "gold"}) is exactly the printed "except Azure", and
  // the option carries its own any-unit target so it is not tied to option 0's
  // friendly-unit target.
  "artifact.ring_of_the_wayfarer": {
    id: "artifact.ring_of_the_wayfarer",
    name: "Ring of the Wayfarer",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    target: { type: "friendly-unit" },
    tags: [
      "artifact",
      "minor",
      "For this Combat, your selected unit gains +1 initiative. — OR — At the start of a Combat with Neutral Units, place a Paralysis token on any unit except Azure."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 initiative for this combat",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Ring of the Wayfarer",
            amount: 1,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        },
        {
          label: "Start of a Neutral combat: Paralyse any non-Azure unit",
          combatOnly: true,
          requiresNeutralCombatStart: true,
          target: { type: "any-unit" },
          effect: { type: "PLACE_PARALYSIS", gradeByPower: { 0: "gold" } }
        }
      ]
    },
    assets: artifactAssets("minor", "ring_of_the_wayfarer", "Ring of the Wayfarer"),
    implementationStatus: "implemented",
    source: artifactSource("ring_of_the_wayfarer")
  },
  // Scales of the Greater Basilisk (Fortress): both sides are the familiar
  // +Power combat instant played as you cast a spell — a flat +3, or a smaller
  // +1 that also draws a card (the Tunic of the Cyclops King shape).
  "artifact.scales_of_the_greater_basilisk": {
    id: "artifact.scales_of_the_greater_basilisk",
    name: "Scales of the Greater Basilisk",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: ["artifact", "minor", "+3 Power. — OR — +1 Power, then draw a card."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+3 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 3 }
        },
        {
          label: "+1 Power, then draw a card",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, drawCards: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "scales_of_the_greater_basilisk", "Scales of the Greater Basilisk"),
    implementationStatus: "implemented",
    source: artifactSource("scales_of_the_greater_basilisk")
  },
  // Blackshard of the Dead Knight (Necropolis/Fortress): the big side adds +2
  // attack but discards a card from hand; if that discarded card was a Spell,
  // it draws a replacement (engine: ADD_COMBAT_STAT drawIfCostCardSpell, read
  // from the option's discard cost). The safe side is a plain +1 attack.
  "artifact.blackshard_of_the_dead_knight": {
    id: "artifact.blackshard_of_the_dead_knight",
    name: "Blackshard of the Dead Knight",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "+2 attack and discard 1 card. If the discarded card was a Spell, draw 1 card. — OR — +1 attack."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 attack, discard 1 card (draw 1 if it was a Spell)",
          cost: { discardCards: 1 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2, drawIfCostCardSpell: true }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "blackshard_of_the_dead_knight", "Blackshard of the Dead Knight"),
    implementationStatus: "implemented",
    source: artifactSource("blackshard_of_the_dead_knight")
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
  // Endless Purse of Gold: like the Bag, but the "crack it open" side both
  // removes the card from the game AND discards 2 other cards from hand
  // (engine: cost.removeSelf + cost.discardCards) for the larger 8-gold payout.
  "artifact.endless_purse_of_gold": {
    id: "artifact.endless_purse_of_gold",
    name: "Endless Purse of Gold",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Gain 3 gold. — OR — Remove this card and discard 2 cards from your hand, then gain 8 gold."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 3 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 3 } }
        },
        {
          label: "Remove this card and discard 2 cards: gain 8 gold",
          cost: { removeSelf: true, discardCards: 2 },
          effect: { type: "GAIN_RESOURCES", gain: { gold: 8 } }
        }
      ]
    },
    assets: artifactAssets("major", "endless_purse_of_gold", "Endless Purse of Gold"),
    implementationStatus: "implemented",
    source: artifactSource("endless_purse_of_gold")
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
  "artifact.arms_of_legion": {
    id: "artifact.arms_of_legion",
    name: "Arms of Legion",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Reduce the Recruitment or Reinforcement cost of a unit by 5 gold (to a minimum of 0). — OR — Gain 2 building materials."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Next recruit/reinforce costs 5 less gold",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Arms of Legion",
              scope: "player",
              duration: { type: "current-turn" },
              modifiers: [{ type: "RECRUIT_DISCOUNT", amount: 5 }]
            }
          }
        },
        {
          label: "Gain 2 building materials",
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 2 } }
        }
      ]
    },
    assets: artifactAssets("major", "arms_of_legion", "Arms of Legion"),
    implementationStatus: "implemented",
    source: artifactSource("arms_of_legion")
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
  // Shackles of War: option 0, played at the start of a player-vs-player
  // combat, stops the enemy hero Surrendering (BLOCK_ENEMY_SURRENDER → a
  // CANNOT_SURRENDER_COMBAT effect on the enemy). House rule: it only blocks the
  // paid Surrender escape — the enemy can still Retreat (and a fought-out loss
  // is unaffected), so the printed "neither Retreat nor Surrender" is narrowed
  // to Surrender here. Option 1 draws 2 and discards one of the two drawn cards.
  "artifact.shackles_of_war": {
    id: "artifact.shackles_of_war",
    name: "Shackles of War",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "If played at the start of Combat, the Enemy Hero cannot Surrender (house rule: Retreat still allowed). — OR — Draw 2 cards, choose 1 card and discard the other."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Lock the enemy hero in: no Surrender this combat (they may still Retreat)",
          combatOnly: true,
          effect: { type: "BLOCK_ENEMY_SURRENDER" }
        },
        {
          label: "Draw 2 cards, then discard one of them",
          effect: { type: "DRAW_CARDS", amount: 2, thenDiscard: 1, thenDiscardDrawnOnly: true }
        }
      ]
    },
    assets: artifactAssets("major", "shackles_of_war", "Shackles of War"),
    implementationStatus: "implemented",
    source: artifactSource("shackles_of_war")
  },
  // Mystic Orb of Mana: Search (4) the top of your discard pile and take 1 card
  // (the TAKE_FROM_DISCARD `fromTop` machinery is built for exactly this), or,
  // only on an empty discard pile, draw 2 cards. The Search option resolves
  // through the adventure reward queue, so it is a map play.
  "artifact.mystic_orb_of_mana": {
    id: "artifact.mystic_orb_of_mana",
    name: "Mystic Orb of Mana",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Search (4) your discard pile. — OR — Only if your discard pile is empty: draw 2 cards."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Search (4) your discard pile",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, fromTop: 4 }
        },
        {
          label: "Only if your discard pile is empty: draw 2 cards",
          requiresEmptyDiscard: true,
          effect: { type: "DRAW_CARDS", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("major", "mystic_orb_of_mana", "Mystic Orb of Mana"),
    implementationStatus: "implemented",
    source: artifactSource("mystic_orb_of_mana")
  },
  // Crown of the Five Seas: option 0 returns a Spell from anywhere in your
  // discard pile (the standard TAKE_FROM_DISCARD spell pick, a map play). Option
  // 1 is the sea side — offered only while this player's main Hero stands on a
  // Sea (water-terrain) field (engine: requiresSeaTile) — and looks at the top 3
  // cards of the discard pile to take 1 (TAKE_FROM_DISCARD fromTop: 3, no
  // filter). Both sides resolve through the discard-pick reward queue, so they
  // are map plays.
  "artifact.crown_of_the_five_seas": {
    id: "artifact.crown_of_the_five_seas",
    name: "Crown of the Five Seas",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Select 1 Spell card from your discard pile and put it back into your hand. — OR — If this Hero is on a Sea tile, look at the top 3 cards of your discard pile and take 1 of them into your hand."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take 1 Spell card from your discard pile",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell" }
        },
        {
          label: "On a Sea tile: look at the top 3 of your discard pile, take 1",
          requiresSeaTile: true,
          effect: { type: "TAKE_FROM_DISCARD", count: 1, fromTop: 3 }
        }
      ]
    },
    assets: artifactAssets("major", "crown_of_the_five_seas", "Crown of the Five Seas"),
    implementationStatus: "implemented",
    source: artifactSource("crown_of_the_five_seas")
  },
  // The four elemental Orbs share one shape, one per School of Magic. Option A
  // is an ongoing combat play: while it is in play this Combat, the engine
  // doubles the effective Power of every Spell the owner casts from that School
  // (SPELL_POWER_DOUBLE, read in getCurrentSpellPower) — "ongoing/this combat"
  // matches every other ongoing combat artifact (Golden Bow, Orb of
  // Vulnerability). Option B is the one-shot instant: while casting a spell of
  // that School, remove the Orb for a flat +5 Power on that cast (the existing
  // schoolOnly + removeSelf machinery). Like the +Power boosts, the School-less
  // "any" spells (Magic Arrow) count as matching either side.
  "artifact.orb_of_driving_rain": {
    id: "artifact.orb_of_driving_rain",
    name: "Orb of Driving Rain",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "While in play this Combat, double the Power of your Water Magic spells. — OR — When casting a Water Magic spell, remove this card to gain +5 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: double the Power of your Water Magic spells",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Orb of Driving Rain",
              scope: "player",
              duration: { type: "combat" },
              modifiers: [{ type: "SPELL_POWER_DOUBLE", school: "water" }]
            }
          }
        },
        {
          label: "Remove this card: +5 Power to a Water Magic spell",
          cost: { removeSelf: true },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 5, schoolOnly: "water" }
        }
      ]
    },
    assets: artifactAssets("major", "orb_of_driving_rain", "Orb of Driving Rain"),
    implementationStatus: "implemented",
    source: artifactSource("orb_of_driving_rain")
  },
  "artifact.orb_of_silt": {
    id: "artifact.orb_of_silt",
    name: "Orb of Silt",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "While in play this Combat, double the Power of your Earth Magic spells. — OR — When casting an Earth Magic spell, remove this card to gain +5 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: double the Power of your Earth Magic spells",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Orb of Silt",
              scope: "player",
              duration: { type: "combat" },
              modifiers: [{ type: "SPELL_POWER_DOUBLE", school: "earth" }]
            }
          }
        },
        {
          label: "Remove this card: +5 Power to an Earth Magic spell",
          cost: { removeSelf: true },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 5, schoolOnly: "earth" }
        }
      ]
    },
    assets: artifactAssets("major", "orb_of_silt", "Orb of Silt"),
    implementationStatus: "implemented",
    source: artifactSource("orb_of_silt")
  },
  "artifact.orb_of_tempestuous_fire": {
    id: "artifact.orb_of_tempestuous_fire",
    name: "Orb of Tempestuous Fire",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "While in play this Combat, double the Power of your Fire Magic spells. — OR — When casting a Fire Magic spell, remove this card to gain +5 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: double the Power of your Fire Magic spells",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Orb of Tempestuous Fire",
              scope: "player",
              duration: { type: "combat" },
              modifiers: [{ type: "SPELL_POWER_DOUBLE", school: "fire" }]
            }
          }
        },
        {
          label: "Remove this card: +5 Power to a Fire Magic spell",
          cost: { removeSelf: true },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 5, schoolOnly: "fire" }
        }
      ]
    },
    assets: artifactAssets("major", "orb_of_tempestuous_fire", "Orb of Tempestuous Fire"),
    implementationStatus: "implemented",
    source: artifactSource("orb_of_tempestuous_fire")
  },
  "artifact.orb_of_the_firmament": {
    id: "artifact.orb_of_the_firmament",
    name: "Orb of the Firmament",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "While in play this Combat, double the Power of your Air Magic spells. — OR — When casting an Air Magic spell, remove this card to gain +5 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: double the Power of your Air Magic spells",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Orb of the Firmament",
              scope: "player",
              duration: { type: "combat" },
              modifiers: [{ type: "SPELL_POWER_DOUBLE", school: "air" }]
            }
          }
        },
        {
          label: "Remove this card: +5 Power to an Air Magic spell",
          cost: { removeSelf: true },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 5, schoolOnly: "air" }
        }
      ]
    },
    assets: artifactAssets("major", "orb_of_the_firmament", "Orb of the Firmament"),
    implementationStatus: "implemented",
    source: artifactSource("orb_of_the_firmament")
  },
  // Pendant of Second Sight: both sides are friendly-unit combat plays. Option A
  // places a combat-long PARALYSIS_IMMUNITY on the chosen unit — every Paralysis
  // source (the Blind Spell and the medusa-style follow-ups) reads
  // unitImmuneToParalysis, so the token never lands. Option B is the existing
  // removeParalysis heal (amount 0): it strips one Paralysis token already on
  // the unit.
  "artifact.pendant_of_second_sight": {
    id: "artifact.pendant_of_second_sight",
    name: "Pendant of Second Sight",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    target: { type: "friendly-unit" },
    tags: [
      "artifact",
      "major",
      "Your selected unit cannot gain a Paralysis token during this Combat. — OR — Remove 1 Paralysis token from your selected unit."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: your selected unit cannot gain Paralysis",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Pendant of Second Sight",
              scope: "unit",
              duration: { type: "combat" },
              polarity: "positive",
              modifiers: [{ type: "PARALYSIS_IMMUNITY" }]
            }
          }
        },
        {
          label: "Remove 1 Paralysis token from your selected unit",
          combatOnly: true,
          effect: { type: "HEAL_DAMAGE", amount: 0, removeParalysis: true }
        }
      ]
    },
    assets: artifactAssets("major", "pendant_of_second_sight", "Pendant of Second Sight"),
    implementationStatus: "implemented",
    source: artifactSource("pendant_of_second_sight")
  },
  // Sword of Hellfire (Fortress): the attacking-unit twin of Shield of the
  // Damned — a bigger attack bonus paid for in the attacker's own blood
  // (ADD_COMBAT_STAT attack + selfDamage). Because the attack bonus lands on
  // your own attacker (UNIT_ATTACK_DECLARED self), it never touches an enemy
  // unit, exactly as the printed "cannot be used on an enemy unit" demands.
  "artifact.sword_of_hellfire": {
    id: "artifact.sword_of_hellfire",
    name: "Sword of Hellfire",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "+3 attack, then this unit suffers 1 damage. Cannot be used on an enemy unit. — OR — +4 attack, then this unit suffers 2 damage. Cannot be used on an enemy unit."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+3 attack, the unit suffers 1 damage",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 3, selfDamage: 1 }
        },
        {
          label: "+4 attack, the unit suffers 2 damage",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 4, selfDamage: 2 }
        }
      ]
    },
    assets: artifactAssets("major", "sword_of_hellfire", "Sword of Hellfire"),
    implementationStatus: "implemented",
    source: artifactSource("sword_of_hellfire")
  },
  // Surcoat of Counterpoise (Tower): option A is a low-power spell counter —
  // played as the enemy casts, it ends that Spell only if it was cast with 1
  // Power or less (engine: CANCEL_SPELL maxPower 1, re-checked against the
  // spell's final Power at resolution, exactly like Resistance). Option B is a
  // map play: remove the Surcoat and Search (1) the Artifact deck.
  "artifact.surcoat_of_counterpoise": {
    id: "artifact.surcoat_of_counterpoise",
    name: "Surcoat of Counterpoise",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Play immediately after an enemy casts a Spell. If it was cast with 1 Power or less, ignore the Spell's effect. — OR — Remove this card, then Search (1) the Artifact deck."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Ignore an enemy Spell cast with 1 Power or less",
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "CANCEL_SPELL", maxPower: 1 }
        },
        {
          label: "Remove this card: Search (1) the Artifact deck",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "CARD_DECK_SEARCH", deck: "artifacts", count: 1 }
        }
      ]
    },
    assets: artifactAssets("major", "surcoat_of_counterpoise", "Surcoat of Counterpoise"),
    implementationStatus: "implemented",
    source: artifactSource("surcoat_of_counterpoise")
  },
  // Targ of the Rampaging Ogre (Fortress): the top side is a reusable defense
  // reaction — discard 2 cards for +2 defense, then the Targ returns to hand
  // instead of going to the discard pile (engine: option.returnSelfToHand), so
  // it can be played again later (paying 2 cards each time). The bottom side is
  // the ordinary +1 defense reaction that discards the card as usual.
  "artifact.targ_of_the_rampaging_ogre": {
    id: "artifact.targ_of_the_rampaging_ogre",
    name: "Targ of the Rampaging Ogre",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Discard 2 cards to gain +2 defense. Then, instead of discarding, put this card back into your hand. — OR — +1 defense."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 2 cards: +2 defense, then return this card to your hand",
          cost: { discardCards: 2 },
          returnSelfToHand: true,
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
    assets: artifactAssets("major", "targ_of_the_rampaging_ogre", "Targ of the Rampaging Ogre"),
    implementationStatus: "implemented",
    source: artifactSource("targ_of_the_rampaging_ogre")
  },

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
  // Orb of Vulnerability: option A is a combat instant that, for the rest of the
  // Combat, switches off every unit's innate spell-related ability — both armies
  // (engine: SUPPRESS_SPELL_ABILITIES negates Dwarf Magic Resistance, all
  // "reduce Spell damage" passives and the Unicorns' aura, printed spell-school
  // immunity, and the Pegasi enemy-spell Power drain). The card is discarded
  // normally after use — the printed board-game card has no remove-from-game
  // clause. Anti-Magic is a Spell-granted effect rather than a unit ability, so
  // it is intentionally NOT negated.
  "artifact.orb_of_vulnerability": {
    id: "artifact.orb_of_vulnerability",
    name: "Orb of Vulnerability",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "During this Combat, negate all units' special abilities related to spells. — OR — +2 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: negate all units' spell-related abilities",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Orb of Vulnerability",
              scope: "global",
              duration: { type: "combat" },
              modifiers: [{ type: "SUPPRESS_SPELL_ABILITIES" }]
            }
          }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("relic", "orb_of_vulnerability", "Orb of Vulnerability"),
    implementationStatus: "implemented",
    source: artifactSource("orb_of_vulnerability")
  }
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
  "artifact.eversmoking_ring_of_sulfur",
  "artifact.hourglass_of_the_evil_hour",
  "artifact.inexhaustible_cart_of_lumber",
  "artifact.inexhaustible_cart_of_ore",
  "artifact.legs_of_legion",
  "artifact.loins_of_legion",
  "artifact.red_dragon_flame_tongue",
  "artifact.rib_cage",
  "artifact.shield_of_the_yawning_dead",
  "artifact.speculum",
  "artifact.torso_of_legion",
  "artifact.boots_of_speed",
  "artifact.charm_of_mana",
  "artifact.greater_gnolls_flail",
  "artifact.shield_of_the_dwarven_lords",
  "artifact.skull_helmet",
  "artifact.equestrians_gloves",
  "artifact.glyph_of_gallantry",
  "artifact.quiet_eye_of_the_dragon",
  "artifact.ring_of_the_wayfarer",
  "artifact.scales_of_the_greater_basilisk",
  "artifact.blackshard_of_the_dead_knight",
  // major
  "artifact.dragon_scale_shield",
  "artifact.endless_bag_of_gold",
  "artifact.endless_purse_of_gold",
  "artifact.arms_of_legion",
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
  "artifact.mystic_orb_of_mana",
  "artifact.shackles_of_war",
  "artifact.pendant_of_courage",
  "artifact.necklace_of_dragonteeth",
  "artifact.crown_of_the_five_seas",
  "artifact.orb_of_driving_rain",
  "artifact.orb_of_silt",
  "artifact.orb_of_tempestuous_fire",
  "artifact.orb_of_the_firmament",
  "artifact.pendant_of_second_sight",
  "artifact.sword_of_hellfire",
  "artifact.surcoat_of_counterpoise",
  "artifact.targ_of_the_rampaging_ogre",
  // relic
  "artifact.angel_wings",
  "artifact.dragon_scale_armor",
  "artifact.endless_sack_of_gold",
  "artifact.sentinels_shield",
  "artifact.sword_of_judgement",
  "artifact.titans_cuirass",
  "artifact.titans_gladius",
  "artifact.crown_of_dragontooth",
  "artifact.orb_of_vulnerability",
  "artifact.helm_of_heavenly_enlightenment",
  "artifact.celestial_necklace_of_bliss",
  "artifact.lions_shield_of_courage",
  "artifact.sandals_of_the_saint"
];

/** BINH Minor Artifact deck (adds the BINH-extra minors). */
export const artifactDeckBinhMinor: string[] = [
  "artifact.armor_of_wonder",
  "artifact.breastplate_of_petrified_wood",
  "artifact.buckler_of_the_gnoll_king",
  "artifact.centaurs_axe",
  "artifact.dragon_wing_tabard",
  "artifact.eversmoking_ring_of_sulfur",
  "artifact.hourglass_of_the_evil_hour",
  "artifact.inexhaustible_cart_of_lumber",
  "artifact.inexhaustible_cart_of_ore",
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
  "artifact.quiet_eye_of_the_dragon",
  "artifact.charm_of_mana",
  "artifact.greater_gnolls_flail",
  "artifact.shield_of_the_dwarven_lords",
  "artifact.ring_of_the_wayfarer",
  "artifact.scales_of_the_greater_basilisk",
  "artifact.blackshard_of_the_dead_knight"
];

/** BINH Major Artifact deck (adds the BINH-extra majors). */
export const artifactDeckBinhMajor: string[] = [
  "artifact.dragon_scale_shield",
  "artifact.endless_bag_of_gold",
  "artifact.endless_purse_of_gold",
  "artifact.arms_of_legion",
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
  "artifact.necklace_of_dragonteeth",
  "artifact.mystic_orb_of_mana",
  "artifact.shackles_of_war",
  "artifact.crown_of_the_five_seas",
  "artifact.orb_of_driving_rain",
  "artifact.orb_of_silt",
  "artifact.orb_of_tempestuous_fire",
  "artifact.orb_of_the_firmament",
  "artifact.pendant_of_second_sight",
  "artifact.sword_of_hellfire",
  "artifact.surcoat_of_counterpoise",
  "artifact.targ_of_the_rampaging_ogre"
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
  "artifact.sandals_of_the_saint",
  "artifact.orb_of_vulnerability"
];
