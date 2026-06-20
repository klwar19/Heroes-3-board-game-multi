import type { CardLibrary, SpellSchool } from "@/engine/state";

const wikiCredit =
  "Card text from the fan wiki artifact pages; verify against official owned components before full content import.";

function artifactSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/artifacts/${slug}/`
  };
}

/**
 * Cards of Prophecy, Diplomat's Ring and Ambassador's Sash all carry a "Reroll
 * a die" instant. Per the printed cards this is a reaction you take AFTER seeing
 * a die you dislike — not something you pre-commit. The engine therefore offers
 * their reroll as a held-card instant the moment a die is rolled (the map
 * Resource / Treasure dice and the combat Attack die), discarding the artifact
 * when used. Their card `effect` only exposes the OTHER, proactive half (the
 * Dwelling recruit, or Cards of Prophecy's map die-set); the reroll lives in the
 * engine, keyed off this list. See `extraDieRerollOptions` (adventure.ts) and
 * `buildRerollSources` (reducer.ts).
 */
export const REROLL_REACTION_ARTIFACT_IDS = [
  "artifact.cards_of_prophecy",
  "artifact.diplomats_ring",
  "artifact.ambassadors_sash"
] as const;

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
  // Pendant of Negativity (Air-Magic counter) and Orb of Inhibition (combat
  // lockdown relic) have no card scan committed to public/assets yet, so they
  // fall back to the deck back until their scans land.
  "pendant_of_negativity",
  "orb_of_inhibition",
  // Newly added Cove/sea artifact whose card scan is not yet committed to
  // public/assets — it falls back to the deck back until the scan lands.
  // (Ring of the Wayfarer's scan is committed, so it is not listed here.)
  "crown_of_the_five_seas",
  // The Cove sea artifacts below have no card scan on the wiki either (it shows
  // the deck back for them), so they fall back to the deck back here too.
  "trident_of_dominion",
  "shield_of_naval_glory",
  "royal_armor_of_nix",
  // Diplomat's Ring: the wiki shows the deck back for this card too (no scan),
  // so it falls back to the deck back here. Its companion Ambassador's Sash
  // does have a scan.
  "diplomats_ring",
  // Newly added expansion minors with no card scan committed to public/assets
  // yet — they fall back to the deck back until their scans land. (Helm of the
  // Alabaster Unicorn's scan is committed, so it is not listed here.)
  "bowstring_of_the_unicorns_mane",
  // Crest of Valor (Fortress) has its wiki card scan committed; Necklace of
  // Swiftness (Stretch Goals 2024) has no scan yet, so only it falls back to the
  // deck back until its scan lands.
  "necklace_of_swiftness",
  // Plate of the Dying Light has no card scan on the wiki yet, so it falls back
  // to the deck back until the scan lands. (Recanter's Cloak and Boots of
  // Polarity have their wiki scans committed, so they are not listed here.)
  "plate_of_the_dying_light",
  // New-mechanic batch (wiki import): their card scans are not committed to
  // public/assets yet, so they fall back to the deck back until the scans land.
  // (Spirit of Oppression's scan is committed, so it is not listed here.)
  "thunder_helmet",
  "shamans_puppet",
  // The four Conflux Tome relics have no card scan on the wiki yet, so they fall
  // back to the deck back until their scans land.
  "tome_of_air",
  "tome_of_earth",
  "tome_of_fire",
  "tome_of_water"
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

// Tome of Air/Earth/Fire/Water (Conflux expansion, Relic). One per School of
// Magic, sharing one shape. Each side names exactly what the engine runs:
//   • Option A (map): the School-filtered Spell-deck dig — find the first spell
//     of this School (any level), take it into hand OR discard it, then reshuffle
//     (engine: EAGLE_EYE_DIG { school }, the school-aware Eagle Eye dig).
//   • Option B (combat reaction, the new mechanic): "When playing a {School}
//     Magic spell, resolve its effect without paying the Power cost." Played
//     while casting a matching spell, it lifts that cast to the spell's MAXIMUM
//     Power breakpoint for free (engine: SET_SPELL_POWER_MAX { schoolOnly }; the
//     boost is added through the normal Power channel, so the Resistance gate,
//     the power readout and a Mysticism-expert recall all see the Tome).
// A school-agnostic "any" spell (Magic Arrow) qualifies for either side of any
// Tome, exactly as the Orbs and the Basic-School Magic boosts treat it.
function tomeArtifact(school: Exclude<SpellSchool, "any">): CardLibrary[string] {
  const schoolName = school.charAt(0).toUpperCase() + school.slice(1);
  const slug = `tome_of_${school}`;
  const name = `Tome of ${schoolName}`;
  return {
    id: `artifact.${slug}`,
    name,
    kind: "artifact",
    artifactTier: "relic",
    timing: "instant",
    tags: [
      "artifact",
      "relic",
      `Find the first ${schoolName} Magic spell in the Spell deck. Take it into your hand or discard it. Then, reshuffle the deck. — OR — When playing a ${schoolName} Magic spell, resolve its effect without paying the Power cost.`
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Find the first ${schoolName} Magic spell in the Spell deck (take or discard), then reshuffle`,
          mapOnly: true,
          effect: { type: "EAGLE_EYE_DIG", school }
        },
        {
          label: `Resolve a ${schoolName} Magic spell at maximum Power without paying`,
          combatOnly: true,
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "SET_SPELL_POWER_MAX", schoolOnly: school }
        }
      ]
    },
    assets: artifactAssets("relic", slug, name),
    implementationStatus: "implemented",
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
          // Instant, one-shot: banks the discount on the player and is discarded
          // at once (never an ongoing effect). Used by the next recruit/reinforce.
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 4 }
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
          // Instant, one-shot: banks the discount on the player and is discarded
          // at once (never an ongoing effect). Used by the next recruit/reinforce.
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 5 }
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
    // House rule: Torso of Legion is played as a Major artifact (not Minor).
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Reduce the cost of Recruitment or Reinforcing a unit by 6 gold. — OR — Gain 1 valuables or 2 building materials."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Next recruit/reinforce costs 6 less gold",
          // Instant, one-shot: banks the discount on the player and is discarded
          // at once (never an ongoing effect). Used by the next recruit/reinforce.
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 6 }
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
    assets: artifactAssets("major", "torso_of_legion", "Torso of Legion"),
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
  // Helm of the Alabaster Unicorn (Tower expansion). Option A returns a Spell
  // from YOUR discard pile to your hand (the standard TAKE_FROM_DISCARD spell
  // pick, a map play, exactly like Crown of the Five Seas' Spell side). Option B
  // ("Cast a spell from the top of the spell deck discard pile and Remove this
  // card") is NOT played from hand as a PLAY_CARD: like a Spell Scroll cast it is
  // surfaced by the legal-action layer as a `fromSpellDeck` CAST_SPELL of the top
  // card of the shared Spell-deck discard pile (engine: addSpellActions), cast in
  // combat at your normal Power through the ordinary spell pipeline (reaction
  // windows, power boosts). It does NOT count toward the spell-per-round limit.
  // The spell card stays in that discard pile; the Helm is removed from the game
  // by the cast. CAST_FROM_SPELL_DISCARD is only a marker that flags the option as
  // implemented and tells the offer layer to surface the cast.
  "artifact.helm_of_the_alabaster_unicorn": {
    id: "artifact.helm_of_the_alabaster_unicorn",
    name: "Helm of the Alabaster Unicorn",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "Return 1 Spell of your choice from your discard pile to your hand. — OR — Cast a spell from the top of the spell deck discard pile and Remove this card."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Return 1 Spell from your discard pile to your hand",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell" }
        },
        {
          label: "Cast the top spell of the Spell-deck discard pile, then remove this card",
          combatOnly: true,
          effect: { type: "CAST_FROM_SPELL_DISCARD" }
        }
      ]
    },
    assets: artifactAssets("minor", "helm_of_the_alabaster_unicorn", "Helm of the Alabaster Unicorn"),
    implementationStatus: "implemented",
    source: artifactSource("helm_of_the_alabaster_unicorn")
  },
  // Bowstring of the Unicorn's Mane (Stronghold expansion). Option A ("Play this
  // card before a unit activates. Activate one of your ranged units that has not
  // been activated this round") is a pre-activation reaction, offered in the same
  // UNIT_ACTIVATION_STARTED window Sorrow uses (engine: maybeOpenPreActivationWindow).
  // Because its trigger controller is "any", BOTH sides may play it — including
  // before an ENEMY unit activates, to fire one of your own ranged units first.
  // The chosen friendly ranged unit (its option target — ranged, not yet
  // activated, not the unit about to act) becomes the active unit and takes a full
  // out-of-order activation now (ACTIVATE_RANGED_UNIT -> setActiveUnit); the
  // interrupted unit was not consumed, so it resumes its place in initiative order
  // and no unit acts twice. Using it does not re-prompt on the chosen unit
  // immediately — remaining interrupts surface at the next activation frame.
  // Option B ("Use this after a ranged unit's Attack die roll. Ignore 1 Attack
  // die") is the Shield-of-the-Dwarven-Lords post-roll defender reaction
  // (IGNORE_ATTACK_DIE_RESULT) gated to a ranged attacker (requiresRangedAttacker):
  // offered in the ATTACK_DIE_SETTLED window only when the attacker is ranged.
  "artifact.bowstring_of_the_unicorns_mane": {
    id: "artifact.bowstring_of_the_unicorns_mane",
    name: "Bowstring of the Unicorn's Mane",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "Play this card before a unit activates. Activate one of your ranged units that has not been activated this round. — OR — Use this after a ranged unit's Attack die roll. Ignore 1 Attack die."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Activate one of your ranged units that has not been activated this round",
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "any" },
          target: { type: "friendly-unit", unitTypes: ["ranged"], notActivatedThisRound: true },
          effect: { type: "ACTIVATE_RANGED_UNIT" }
        },
        {
          label: "After a ranged unit's Attack die roll: ignore the Attack die",
          requiresRangedAttacker: true,
          effect: { type: "IGNORE_ATTACK_DIE_RESULT" }
        }
      ]
    },
    assets: artifactAssets("minor", "bowstring_of_the_unicorns_mane", "Bowstring of the Unicorn's Mane"),
    implementationStatus: "implemented",
    source: artifactSource("bowstring_of_the_unicorns_mane")
  },
  // Crest of Valor (Fortress): option 0 is the plain "gain a positive morale
  // token" instant (the GAIN_MORALE shared with Glyph of Gallantry / Leadership),
  // playable in either context. Option 1 is the map side — it sets up a
  // player-scoped, current-turn shield (engine: IGNORE_FIELD_NEGATIVE_MORALE)
  // that the next Field which would hand this player a negative Morale token (the
  // Grave's GAIN_MORALE -1 visit-step) spends instead of lowering Morale. Played
  // proactively before the visit; combat-loss Morale is never touched.
  "artifact.crest_of_valor": {
    id: "artifact.crest_of_valor",
    name: "Crest of Valor",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "Gain a positive morale token. — OR — Ignore the negative morale effect from a field."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain a positive morale token",
          effect: { type: "GAIN_MORALE", amount: 1 }
        },
        {
          label: "Ignore the next negative morale from a field this turn",
          mapOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Crest of Valor",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "IGNORE_FIELD_NEGATIVE_MORALE" }]
            }
          }
        }
      ]
    },
    assets: artifactAssets("minor", "crest_of_valor", "Crest of Valor"),
    implementationStatus: "implemented",
    source: artifactSource("crest_of_valor")
  },
  // Necklace of Swiftness (Stretch Goals 2024): option 0 is the ongoing combat
  // side — a player-scoped, combat-duration effect that raises the Initiative of
  // all the owner's GROUND units by 1 (engine: GROUND_INITIATIVE_BONUS, read in
  // effectiveInitiative; ranged and flying units are untouched). Option 1 is the
  // activation side — relocate one of your own units to an empty orthogonally-
  // adjacent space (MOVE_UNIT_ADJACENT; the destination is picked in the
  // "combat-step" follow-up). Both sides are combat-only.
  "artifact.necklace_of_swiftness": {
    id: "artifact.necklace_of_swiftness",
    name: "Necklace of Swiftness",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    target: { type: "friendly-unit" },
    tags: [
      "artifact",
      "minor",
      "During this Combat, the initiative of all your ground units is increased by 1. — OR — Move one of your units 1 space."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: +1 initiative to all your ground units",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Necklace of Swiftness",
              scope: "player",
              duration: { type: "combat" },
              polarity: "positive",
              removable: true,
              modifiers: [{ type: "GROUND_INITIATIVE_BONUS", amount: 1 }]
            }
          }
        },
        {
          label: "Move one of your units 1 space",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: { type: "MOVE_UNIT_ADJACENT" }
        }
      ]
    },
    assets: artifactAssets("minor", "necklace_of_swiftness", "Necklace of Swiftness"),
    implementationStatus: "implemented",
    source: artifactSource("necklace_of_swiftness")
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
          // Instant, one-shot: banks the discount on the player and is discarded
          // at once (never an ongoing effect). Used by the next recruit/reinforce.
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 6 }
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
          // Instant, one-shot: banks the discount on the player and is discarded
          // at once (never an ongoing effect). Used by the next recruit/reinforce.
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 5 }
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
  // Shackles of War: option 0 stops the enemy hero Surrendering
  // (BLOCK_ENEMY_SURRENDER → a CANNOT_SURRENDER_COMBAT effect on the enemy).
  // House rule: it only blocks the paid Surrender escape — the enemy can still
  // Retreat (and a fought-out loss is unaffected), so the printed "neither
  // Retreat nor Surrender" is narrowed to Surrender here.
  //
  // engine: the block side is NOT played from hand. Because Surrender is a
  // before-battle decision (the defender's prep window), the attacker is offered
  // a dedicated start-of-combat choice to play Shackles and lock the defender out
  // — see maybeOpenShacklesDecision / resolveShacklesChoice in adventure-reducer.
  // (addOptionPlays suppresses the from-hand block play.) Option 1 (draw 2,
  // discard one) is unchanged and still played from hand.
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
  // Pendant of Negativity (Tower expansion). Both sides defend against Air Magic.
  // Option A is the reaction counter shared with Protection from Air, but with no
  // School-level or Power gate — `CANCEL_SPELL { schools: ["air"] }` ends ANY Air
  // spell the enemy casts (a school-agnostic "any" spell like Magic Arrow counts
  // as Air, exactly as the cancel matcher and Protection from Air treat it).
  // Option B is the ongoing side: a unit-scoped, combat-long SPELL_SCHOOL_IMMUNE
  // air immunity placed on one of your units (engine: it bars Air spells from
  // targeting or splashing that unit and zeroes their card damage, like a printed
  // Elemental immunity — and, like Anti-Magic, is NOT lifted by Orb of
  // Vulnerability).
  "artifact.pendant_of_negativity": {
    id: "artifact.pendant_of_negativity",
    name: "Pendant of Negativity",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Play after an enemy casts an Air Magic spell to ignore its effect. — OR — During this Combat, your selected unit ignores Air Magic spells cast on it."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Ignore an enemy Air Magic spell",
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "CANCEL_SPELL", schools: ["air"] }
        },
        {
          label: "This Combat: your selected unit ignores Air Magic spells",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Pendant of Negativity",
              scope: "unit",
              duration: { type: "combat" },
              polarity: "positive",
              removable: true,
              modifiers: [{ type: "SPELL_SCHOOL_IMMUNE", schools: ["air"] }]
            }
          }
        }
      ]
    },
    assets: artifactAssets("major", "pendant_of_negativity", "Pendant of Negativity"),
    implementationStatus: "implemented",
    source: artifactSource("pendant_of_negativity")
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
  // Trident of Dominion (Cove): a plain +2 attack on your attacker, OR — only
  // while this Hero stands on a Sea tile — a 2-card draw (the requiresSeaTile
  // gate shared with Crown of the Five Seas). The naval side is a map play.
  "artifact.trident_of_dominion": {
    id: "artifact.trident_of_dominion",
    name: "Trident of Dominion",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: ["artifact", "major", "+2 attack. — OR — If this Hero is on a Sea tile, draw 2 cards."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        },
        {
          label: "On a Sea tile: draw 2 cards",
          mapOnly: true,
          requiresSeaTile: true,
          effect: { type: "DRAW_CARDS", amount: 2 }
        }
      ]
    },
    assets: artifactAssets("major", "trident_of_dominion", "Trident of Dominion"),
    implementationStatus: "implemented",
    source: artifactSource("trident_of_dominion")
  },
  // Shield of Naval Glory (Cove): a plain +2 defense reaction, OR — only while
  // this Hero stands on a Sea tile — +1 Hero movement and draw 1 card (the new
  // GAIN_HERO_MOVEMENT.drawCards rider). The naval side is a map play.
  "artifact.shield_of_naval_glory": {
    id: "artifact.shield_of_naval_glory",
    name: "Shield of Naval Glory",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "+2 defense. — OR — If this Hero is on a Sea tile, they gain +1 movement and draw 1 card."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 2 }
        },
        {
          label: "On a Sea tile: +1 movement and draw 1 card",
          mapOnly: true,
          requiresSeaTile: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1, drawCards: 1 }
        }
      ]
    },
    assets: artifactAssets("major", "shield_of_naval_glory", "Shield of Naval Glory"),
    implementationStatus: "implemented",
    source: artifactSource("shield_of_naval_glory")
  },
  // Royal Armor of Nix (Cove): a flat +2 Power as you cast a spell, OR — only
  // while this Hero stands on a Sea tile — Search (2) the Spell deck (a map
  // play, the requiresSeaTile gate). Major like the original-game artifact and
  // the other Cove sea artifacts; no wiki scan, so it shows the deck back.
  "artifact.royal_armor_of_nix": {
    id: "artifact.royal_armor_of_nix",
    name: "Royal Armor of Nix",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: ["artifact", "major", "+2 Power. — OR — If this Hero is on a Sea tile, Search (2) the Spell deck."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        },
        {
          label: "On a Sea tile: Search (2) the Spell deck",
          mapOnly: true,
          requiresSeaTile: true,
          effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 2 }
        }
      ]
    },
    assets: artifactAssets("major", "royal_armor_of_nix", "Royal Armor of Nix"),
    implementationStatus: "implemented",
    source: artifactSource("royal_armor_of_nix")
  },
  // Cards of Prophecy (Tower expansion). Its "Reroll any die" half is an instant
  // REACTION offered from hand the moment a die is rolled (the map Resource /
  // Treasure dice and the combat Attack die), discarding the card when used —
  // see REROLL_REACTION_ARTIFACT_IDS — so it is NOT a pre-armed CHOOSE_ONE option
  // here. The proactive play is the map-only "set a die" half: ignore the next
  // Resource or Treasure die you roll and set it to a face of your choice
  // (ADVENTURE_DIE_SET — offered in rollResourceDice/rollTreasureDice and spent
  // on the chosen face), which is a deliberate up-front commitment to override
  // the roll.
  "artifact.cards_of_prophecy": {
    id: "artifact.cards_of_prophecy",
    name: "Cards of Prophecy",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Reroll any die. — OR — Set a Resource die or Treasure die on the side of your choice.",
      // engine: the reroll is a held-card reaction offered after a die roll
      // (REROLL_REACTION_ARTIFACT_IDS); only the set-die is a proactive play.
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Set a Resource or Treasure die to the side of your choice",
          mapOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Cards of Prophecy",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "ADVENTURE_DIE_SET", dice: "any" }]
            }
          }
        }
      ]
    },
    assets: artifactAssets("major", "cards_of_prophecy", "Cards of Prophecy"),
    implementationStatus: "implemented",
    source: artifactSource("cards_of_prophecy")
  },
  // Diplomat's Ring (Stronghold expansion). The proactive play is the Diplomacy
  // map recruit (DIPLOMACY_RECRUIT — draw one Neutral Unit card per Dwelling,
  // recruit one by paying its cost), the same effect Cyra's Diplomacy and
  // Ambassador's Sash use. The card's other half — "Reroll any die or any roll"
  // — is an instant REACTION you take after a die is rolled, so it is NOT a
  // pre-armed CHOOSE_ONE option here; the engine offers it from hand the moment
  // a die is rolled (see REROLL_REACTION_ARTIFACT_IDS).
  "artifact.diplomats_ring": {
    id: "artifact.diplomats_ring",
    name: "Diplomat's Ring",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "Reroll any die or any roll. — OR — For every Dwelling you have, draw 1 corresponding Neutral Unit card. You can Recruit one of these units.",
      // engine: the reroll is a held-card reaction offered after a die roll
      // (REROLL_REACTION_ARTIFACT_IDS); only the recruit is a proactive play.
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Map: draw 1 Neutral Unit card per Dwelling, then recruit one (pay its cost)",
          mapOnly: true,
          effect: { type: "DIPLOMACY_RECRUIT" }
        }
      ]
    },
    assets: artifactAssets("major", "diplomats_ring", "Diplomat's Ring"),
    implementationStatus: "implemented",
    source: artifactSource("diplomats_ring")
  },
  // Ambassador's Sash (Rampart expansion) — Diplomat's Ring's companion (the
  // wiki cross-links them). The proactive play is the Diplomacy map recruit
  // (DIPLOMACY_RECRUIT, shared with Cyra's Diplomacy and Diplomat's Ring). Its
  // "Reroll a die" half is an instant REACTION offered from hand after a die is
  // rolled (see REROLL_REACTION_ARTIFACT_IDS), not a pre-armed CHOOSE_ONE option.
  "artifact.ambassadors_sash": {
    id: "artifact.ambassadors_sash",
    name: "Ambassador's Sash",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "For every Dwelling you have, draw 1 corresponding Neutral Unit card. You can Recruit one of these units. — OR — Reroll a die.",
      // engine: the reroll is a held-card reaction offered after a die roll
      // (REROLL_REACTION_ARTIFACT_IDS); only the recruit is a proactive play.
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Map: draw 1 Neutral Unit card per Dwelling, then recruit one (pay its cost)",
          mapOnly: true,
          effect: { type: "DIPLOMACY_RECRUIT" }
        }
      ]
    },
    assets: artifactAssets("major", "ambassadors_sash", "Ambassador's Sash"),
    implementationStatus: "implemented",
    source: artifactSource("ambassadors_sash")
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
  },
  // Orb of Inhibition (Tower expansion): a combat-lockdown relic. Both sides are
  // global, side-agnostic combat plays.
  //  - Option A ("all Spell and Specialty cards deal 0 damage … Remove this card
  //    instead of discarding it"): a combat-long global NULLIFY_CARD_DAMAGE effect
  //    (engine: reducedCardDamage returns 0 for every Spell/Specialty card hit —
  //    direct, area, Xyron, Chain Lightning — for both armies). The removeSelf cost
  //    sends the card to the removed-from-game zone; the effect lives on its own in
  //    activeEffects until the Combat ends.
  //  - Option B ("during this Combat round, units cannot use their special
  //    abilities"): a global, current-combat-round UNIT_ABILITY_SUPPRESSED effect.
  //    syncAbilitySuppression flags every unit (effectAppliesToUnit treats a global
  //    effect as applying to all), so the ability chokepoint (getUnitAbilityDefinitions)
  //    sees nothing for one round; it lifts automatically at the round's end. Tower
  //    Titans (ignore EVERY ongoing effect) shrug it off; Gargoyles only ignore
  //    ongoing SPELL effects, so this artifact effect still suppresses them.
  "artifact.orb_of_inhibition": {
    id: "artifact.orb_of_inhibition",
    name: "Orb of Inhibition",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "During this Combat, all Spell and Specialty cards deal 0 damage. Remove this card instead of discarding it. — OR — During this Combat round, units cannot use their special abilities."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: all Spell and Specialty cards deal 0 damage (remove this card)",
          combatOnly: true,
          cost: { removeSelf: true },
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Orb of Inhibition",
              scope: "global",
              duration: { type: "combat" },
              modifiers: [{ type: "NULLIFY_CARD_DAMAGE" }]
            }
          }
        },
        {
          label: "This Combat round: units cannot use their special abilities",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Orb of Inhibition",
              scope: "global",
              duration: { type: "current-combat-round" },
              modifiers: [{ type: "UNIT_ABILITY_SUPPRESSED" }]
            }
          }
        }
      ]
    },
    assets: artifactAssets("relic", "orb_of_inhibition", "Orb of Inhibition"),
    implementationStatus: "implemented",
    source: artifactSource("orb_of_inhibition")
  },
  // ---- Ability-interference batch (wiki import) ---------------------------
  // Three relics/majors whose whole point is interfering with the enemy's
  // magic. Each side below names exactly what the engine runs.
  //
  // Recanter's Cloak (Major): a global combat-scoped spell-cast restriction
  // that binds BOTH heroes (the wearer included).
  //   • Option A — SPELL_CAST_RESTRICTION{minPower:1}: a Spell that RESOLVES at
  //     Power 0 applies none of its effects, so every cast must be boosted to
  //     Power 1+ to do anything. Enforced at the spell-resolution chokepoint
  //     (resolveTopStack), re-reading the spell's final Power. Scope: the
  //     standard CAST_SPELL channel (turn casts + scroll casts that resolve
  //     through the stack). Attack-window instant spells, which resolve inline
  //     and not through that chokepoint, are not power-floored by option A.
  //   • Option B — SPELL_CAST_RESTRICTION{lockAll}: no Spell may be cast at all,
  //     comprehensively — turn casts, reaction/instant casts and scroll casts
  //     are all un-offered (and any stacked cast still fizzles). The card is
  //     removed after Combat.
  "artifact.recanters_cloak": {
    id: "artifact.recanters_cloak",
    name: "Recanter's Cloak",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "During this Combat, no Hero can use spells with Power 0. — OR — During this Combat, no Hero can use Spells. Remove this card after Combat."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: no Hero can use a spell with Power 0 (every cast must reach Power 1+)",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Recanter's Cloak",
              scope: "global",
              duration: { type: "combat" },
              modifiers: [{ type: "SPELL_CAST_RESTRICTION", minPower: 1 }]
            }
          }
        },
        {
          label: "This Combat: no Hero can use Spells (remove this card)",
          combatOnly: true,
          cost: { removeSelf: true },
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Recanter's Cloak",
              scope: "global",
              duration: { type: "combat" },
              modifiers: [{ type: "SPELL_CAST_RESTRICTION", lockAll: true }]
            }
          }
        }
      ]
    },
    assets: artifactAssets("major", "recanters_cloak", "Recanter's Cloak"),
    implementationStatus: "implemented",
    source: artifactSource("recanters_cloak")
  },
  // Boots of Polarity (Relic): option A is a chance-based spell counter — react
  // to an enemy cast, roll 2 Attack dice and keep the best; on a "+1" face the
  // Spell is ignored (CANCEL_SPELL with a diceRoll gate). A failed roll still
  // spends the card but lets the Spell resolve. Option B is a single-effect
  // dispel: REMOVE_ACTIVE_EFFECT strips one removable ongoing effect from a
  // chosen unit (the most recently applied one).
  "artifact.boots_of_polarity": {
    id: "artifact.boots_of_polarity",
    name: "Boots of Polarity",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "Play after an enemy casts a spell. Roll 2 Attack dice and choose one. On a +1, ignore the spell's effect. — OR — Remove 1 ongoing effect from a unit."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Roll 2 Attack dice; on a +1, ignore the enemy spell",
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "CANCEL_SPELL", diceRoll: { count: 2, successFace: 1 } }
        },
        {
          label: "Remove 1 ongoing effect from a unit",
          combatOnly: true,
          target: { type: "any-unit" },
          effect: { type: "REMOVE_ACTIVE_EFFECT" }
        }
      ]
    },
    assets: artifactAssets("relic", "boots_of_polarity", "Boots of Polarity"),
    implementationStatus: "implemented",
    source: artifactSource("boots_of_polarity")
  },
  // Plate of the Dying Light (Relic): the Interference mechanic as a relic — a
  // Defense bonus that, unusually, also reduces Spell damage. Reuses
  // INTERFERE_SPELL, so it is offered (like Interference) as a reaction to an
  // enemy single-target damaging Spell aimed at one of your units, and grants
  // that unit a Combat-long DEFENSE_BONUS (vs attacks) AND a
  // SPELL_DAMAGE_REDUCTION (vs spells) — so it blunts the triggering Spell and
  // any later Spell or attack on that unit. Option A grants +1 (kept/discarded);
  // option B grants +4 and removes the card.
  "artifact.plate_of_the_dying_light": {
    id: "artifact.plate_of_the_dying_light",
    name: "Plate of the Dying Light",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "+1 defense, which can also reduce damage from spells. — OR — +4 defense, which can also reduce damage from spells. Then remove this card."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 defense for the Combat, which also reduces spell damage",
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "INTERFERE_SPELL", amount: 1 }
        },
        {
          label: "+4 defense for the Combat, which also reduces spell damage (remove this card)",
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          cost: { removeSelf: true },
          effect: { type: "INTERFERE_SPELL", amount: 4 }
        }
      ]
    },
    assets: artifactAssets("relic", "plate_of_the_dying_light", "Plate of the Dying Light"),
    implementationStatus: "implemented",
    source: artifactSource("plate_of_the_dying_light")
  },
  // ---- Wiki import: new-mechanic batch ------------------------------------
  // Three artifacts pulled from the fan wiki, each naming exactly what runs.
  //
  // Thunder Helmet (Relic). Option A is the Rib Cage / Crown of Dragontooth
  // recover-a-Spell effect (TAKE_FROM_DISCARD, Spell-only, 1 card — no shuffle).
  // Option B creates a player-scoped, combat-long DRAW_ON_SPELL_CAST effect (the
  // same modifier as Zydar's Sorcery VI), so the owner draws 1 card after every
  // Spell they cast for the rest of the Combat, and removes the card from the game
  // (cost.removeSelf). The printed "Remove this card after the Combat" is modelled
  // as an immediate removal: the draw-on-cast effect lives in activeEffects until
  // the Combat ends whatever the card's location, so the timing is immaterial.
  "artifact.thunder_helmet": {
    id: "artifact.thunder_helmet",
    name: "Thunder Helmet",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "Select 1 Spell card from your discard pile and put it back into your hand. — OR — For this Combat, whenever you play a Spell card, draw 1 card from your M&M deck. Then remove this card."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take 1 Spell from your discard pile into your hand",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell" }
        },
        {
          label: "This Combat: draw 1 card after every Spell you cast (remove this card)",
          combatOnly: true,
          cost: { removeSelf: true },
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Thunder Helmet",
              scope: "player",
              duration: { type: "combat" },
              polarity: "positive",
              modifiers: [{ type: "DRAW_ON_SPELL_CAST", amount: 1 }]
            }
          }
        }
      ]
    },
    assets: artifactAssets("relic", "thunder_helmet", "Thunder Helmet"),
    implementationStatus: "implemented",
    source: artifactSource("thunder_helmet")
  },
  // Spellbinder's Hat (Relic, Tower Expansion). A deck-management relic; both
  // sides are map plays.
  //   • Option A ("Remove 1 card from your hand, then Search(2) the card's
  //     deck"): the Hat discards normally, then the player removes one card from
  //     hand and Search(2)s whichever deck it belonged to. Only abilities,
  //     artifacts and spells can be removed (they have a deck to dig — the
  //     "removable" filter, which also keeps the starting Ability), so Statistics
  //     and Specialties are never offered. Reuses the Market-of-Time
  //     REMOVE_HAND_CARD → search-same-deck machinery via REMOVE_HAND_CARD_THEN_SEARCH.
  //   • Option B ("Remove this card and another one from your hand or discard
  //     pile"): the Hat removes itself (cost.removeSelf) and the player then picks
  //     one more card from hand OR discard to remove from the game — any card
  //     qualifies (REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD).
  "artifact.spellbinders_hat": {
    id: "artifact.spellbinders_hat",
    name: "Spellbinder's Hat",
    kind: "artifact",
    timing: "instant",
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "Remove 1 card from your hand, then Search (2) the card's deck. — OR — Remove this card and another one from your hand or discard pile."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove 1 card from your hand, then Search (2) the card's deck",
          effect: { type: "REMOVE_HAND_CARD_THEN_SEARCH", count: 2 }
        },
        {
          label: "Remove this card and another from your hand or discard pile",
          cost: { removeSelf: true },
          effect: { type: "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD" }
        }
      ]
    },
    assets: artifactAssets("relic", "spellbinders_hat", "Spellbinder's Hat"),
    implementationStatus: "implemented",
    source: artifactSource("spellbinders_hat")
  },
  // Shaman's Puppet (Minor). Option A places a unit-scoped, next-activation
  // ATTACK_ROLL_DISADVANTAGE effect on a chosen enemy unit: for every attack that
  // unit makes during its activation, getAttackRollMode makes it roll two Attack
  // dice and resolve the LOWER result. Played on your turn against an enemy unit,
  // it weakens that unit's next activation — the Forgetfulness debuff's timing.
  // Option B is the Cure cleanse (HEAL_DAMAGE_AND_REMOVE_EFFECTS, heal 0) on one of
  // your own units: it strips the unit's negative ongoing effects and its Paralysis
  // token. The printed "any effect" is modelled exactly as the Cure spell models
  // the same wording — on your own unit you only ever clear debuffs/paralysis, so a
  // positive effect is never force-removed.
  "artifact.shamans_puppet": {
    id: "artifact.shamans_puppet",
    name: "Shaman's Puppet",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    target: { type: "any-unit" },
    tags: [
      "artifact",
      "minor",
      "Choose an enemy unit. Until the end of its activation, for its every attack it rolls 2 Attack dice and resolves the lower result. — OR — Remove any effect or Paralysis from your selected unit."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Enemy unit rolls the lower of 2 Attack dice until its activation ends",
          combatOnly: true,
          target: { type: "enemy-unit" },
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Shaman's Puppet",
              scope: "unit",
              duration: { type: "next-activation" },
              polarity: "negative",
              removable: true,
              modifiers: [{ type: "ATTACK_ROLL_DISADVANTAGE" }]
            }
          }
        },
        {
          label: "Remove any effect or Paralysis from your selected unit",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: {
            type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
            amount: 0,
            removePolarity: "negative",
            removeParalysis: true
          }
        }
      ]
    },
    assets: artifactAssets("minor", "shamans_puppet", "Shaman's Puppet"),
    implementationStatus: "implemented",
    source: artifactSource("shamans_puppet")
  },
  // Spirit of Oppression (Minor). Option A creates a global, combat-scoped
  // NO_ATTACK_DIE_REROLL effect. The positive morale token is itself just an
  // Attack-die reroll source in this engine, so the single buildRerollSources
  // chokepoint stops offering EVERY reroll — the morale token, Luck/Fortune/Mirth
  // and unit-ability rerolls — to both players for the rest of the Combat,
  // covering the printed "neither player can use the positive morale token or
  // reroll Attack dice". Option B is the universal "+1 Power" empower instant
  // (ADD_SPELL_POWER) played while you cast a Spell.
  "artifact.spirit_of_oppression": {
    id: "artifact.spirit_of_oppression",
    name: "Spirit of Oppression",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "During this Combat, neither player can use the positive morale token or reroll Attack dice. — OR — +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: neither player may use the positive morale token or reroll Attack dice",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Spirit of Oppression",
              scope: "global",
              duration: { type: "combat" },
              modifiers: [{ type: "NO_ATTACK_DIE_REROLL" }]
            }
          }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    assets: artifactAssets("minor", "spirit_of_oppression", "Spirit of Oppression"),
    implementationStatus: "implemented",
    source: artifactSource("spirit_of_oppression")
  },

  // ---- Tome artifacts (Conflux expansion, Relic) --------------------------
  "artifact.tome_of_air": tomeArtifact("air"),
  "artifact.tome_of_earth": tomeArtifact("earth"),
  "artifact.tome_of_fire": tomeArtifact("fire"),
  "artifact.tome_of_water": tomeArtifact("water")
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
  "artifact.helm_of_the_alabaster_unicorn",
  "artifact.bowstring_of_the_unicorns_mane",
  "artifact.crest_of_valor",
  "artifact.necklace_of_swiftness",
  "artifact.shamans_puppet",
  "artifact.spirit_of_oppression",
  // major
  "artifact.dragon_scale_shield",
  "artifact.endless_bag_of_gold",
  "artifact.endless_purse_of_gold",
  "artifact.arms_of_legion",
  "artifact.head_of_legion",
  "artifact.torso_of_legion",
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
  "artifact.pendant_of_negativity",
  "artifact.crown_of_the_five_seas",
  "artifact.orb_of_driving_rain",
  "artifact.orb_of_silt",
  "artifact.orb_of_tempestuous_fire",
  "artifact.orb_of_the_firmament",
  "artifact.pendant_of_second_sight",
  "artifact.sword_of_hellfire",
  "artifact.surcoat_of_counterpoise",
  "artifact.targ_of_the_rampaging_ogre",
  "artifact.trident_of_dominion",
  "artifact.shield_of_naval_glory",
  "artifact.royal_armor_of_nix",
  "artifact.cards_of_prophecy",
  "artifact.diplomats_ring",
  "artifact.ambassadors_sash",
  "artifact.recanters_cloak",
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
  "artifact.orb_of_inhibition",
  "artifact.helm_of_heavenly_enlightenment",
  "artifact.celestial_necklace_of_bliss",
  "artifact.lions_shield_of_courage",
  "artifact.sandals_of_the_saint",
  "artifact.boots_of_polarity",
  "artifact.plate_of_the_dying_light",
  "artifact.thunder_helmet",
  "artifact.spellbinders_hat",
  "artifact.tome_of_air",
  "artifact.tome_of_earth",
  "artifact.tome_of_fire",
  "artifact.tome_of_water"
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
  "artifact.blackshard_of_the_dead_knight",
  "artifact.helm_of_the_alabaster_unicorn",
  "artifact.bowstring_of_the_unicorns_mane",
  "artifact.crest_of_valor",
  "artifact.necklace_of_swiftness",
  "artifact.shamans_puppet",
  "artifact.spirit_of_oppression"
];

/** BINH Major Artifact deck (adds the BINH-extra majors). */
export const artifactDeckBinhMajor: string[] = [
  "artifact.dragon_scale_shield",
  "artifact.endless_bag_of_gold",
  "artifact.endless_purse_of_gold",
  "artifact.arms_of_legion",
  "artifact.head_of_legion",
  "artifact.torso_of_legion",
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
  "artifact.pendant_of_negativity",
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
  "artifact.targ_of_the_rampaging_ogre",
  "artifact.trident_of_dominion",
  "artifact.shield_of_naval_glory",
  "artifact.royal_armor_of_nix",
  "artifact.cards_of_prophecy",
  "artifact.diplomats_ring",
  "artifact.ambassadors_sash",
  "artifact.recanters_cloak"
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
  "artifact.orb_of_vulnerability",
  "artifact.orb_of_inhibition",
  "artifact.boots_of_polarity",
  "artifact.plate_of_the_dying_light",
  "artifact.thunder_helmet",
  "artifact.spellbinders_hat",
  "artifact.tome_of_air",
  "artifact.tome_of_earth",
  "artifact.tome_of_fire",
  "artifact.tome_of_water"
];
